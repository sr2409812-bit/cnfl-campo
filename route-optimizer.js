// CNFL Campo — optimizador lógico reutilizable para cualquier jornada
// Usa SIEMPRE las órdenes actualmente cargadas en workOrders.
// Prioridad: salida configurable (La Guaca por defecto), microzonas contiguas,
// evitar regresar a zonas ya atendidas y no optimizar lotes incompletos.

const CNFL_ROUTE_CONFIG_KEY = 'cnfl_route_config';
const CNFL_DEFAULT_ROUTE_BASE = {
  name: 'La Guaca · San Sebastián',
  lat: 9.91154,
  lon: -84.07826
};
const CNFL_MICROZONE_KM = 0.050; // 50 m

function cnflGetRouteBase() {
  try {
    const saved = JSON.parse(localStorage.getItem(CNFL_ROUTE_CONFIG_KEY) || '{}');
    if (Number.isFinite(Number(saved.lat)) && Number.isFinite(Number(saved.lon))) {
      return {
        name: saved.name || 'Punto de salida',
        lat: Number(saved.lat),
        lon: Number(saved.lon)
      };
    }
  } catch (e) {}
  return { ...CNFL_DEFAULT_ROUTE_BASE };
}

// Queda disponible para futuras mejoras/UI sin cambiar el motor.
function cnflSetRouteBase(name, lat, lon) {
  const base = { name: name || 'Punto de salida', lat: Number(lat), lon: Number(lon) };
  if (!Number.isFinite(base.lat) || !Number.isFinite(base.lon)) {
    throw new Error('Coordenadas de salida inválidas');
  }
  localStorage.setItem(CNFL_ROUTE_CONFIG_KEY, JSON.stringify(base));
  return base;
}

function cnflResetRouteBase() {
  localStorage.removeItem(CNFL_ROUTE_CONFIG_KEY);
  return { ...CNFL_DEFAULT_ROUTE_BASE };
}

function cnflPointDistance(a, b) {
  return haversineDistance(Number(a.lat), Number(a.lon), Number(b.lat), Number(b.lon));
}

function cnflBuildMicrozones(orders, thresholdKm = CNFL_MICROZONE_KM) {
  const unassigned = new Set(orders.map((_, i) => i));
  const clusters = [];

  while (unassigned.size) {
    const start = unassigned.values().next().value;
    unassigned.delete(start);
    const queue = [start];
    const members = [orders[start]];

    while (queue.length) {
      const i = queue.shift();
      const base = orders[i];
      const additions = [];

      for (const j of unassigned) {
        if (cnflPointDistance(base, orders[j]) <= thresholdKm) additions.push(j);
      }

      for (const j of additions) {
        unassigned.delete(j);
        queue.push(j);
        members.push(orders[j]);
      }
    }

    clusters.push(members);
  }

  return clusters;
}

function cnflMinDistanceToCluster(point, cluster) {
  let best = Infinity;
  for (const o of cluster) best = Math.min(best, cnflPointDistance(point, o));
  return best;
}

function cnflRouteInsideCluster(cluster, startPoint) {
  const remaining = [...cluster];
  const path = [];
  let current = startPoint;

  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const d = cnflPointDistance(current, remaining[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    const next = remaining.splice(bestIdx, 1)[0];
    path.push(next);
    current = next;
  }

  return path;
}

function cnflOrderClusters(clusters, startPoint) {
  const remaining = clusters.map((members, idx) => ({ id: idx + 1, members }));
  const ordered = [];
  let current = startPoint;

  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const d = cnflMinDistanceToCluster(current, remaining[i].members);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    const chosen = remaining.splice(bestIdx, 1)[0];
    chosen.path = cnflRouteInsideCluster(chosen.members, current);
    ordered.push(chosen);
    current = chosen.path[chosen.path.length - 1];
  }

  return ordered;
}

function cnflAnnotateMicrozones(orderedClusters) {
  orderedClusters.forEach((cluster, idx) => {
    const size = cluster.path.length;
    for (const ord of cluster.path) {
      ord.microzonaId = idx + 1;
      ord.microzonaSize = size;
    }
  });
}

function cnflMissingGpsOrders() {
  return (workOrders || []).filter(o =>
    !Number.isFinite(Number(o.lat)) || !Number.isFinite(Number(o.lon))
  );
}

// Motor genérico: funciona con cualquier PDF/lote futuro cargado en la app.
// No contiene localizaciones ni coordenadas específicas de una jornada.
optimizeCurrentRoute = function () {
  if (!workOrders || workOrders.length <= 1) {
    showToast('No hay suficientes órdenes para optimizar');
    return;
  }

  const missingGps = cnflMissingGpsOrders();
  if (missingGps.length > 0) {
    const missingLocs = [...new Set(missingGps.map(o => o.localizacion || o.orden || 'SIN LOCALIZACIÓN'))];
    alert(
      `Ruta NO optimizada.\n\n` +
      `Órdenes totales: ${workOrders.length}\n` +
      `Con GPS: ${workOrders.length - missingGps.length}\n` +
      `Sin GPS: ${missingGps.length}\n\n` +
      `Faltantes:\n${missingLocs.join('\n')}`
    );
    return;
  }

  const routeBase = cnflGetRouteBase();
  const clusters = cnflBuildMicrozones(workOrders, CNFL_MICROZONE_KM);
  const orderedClusters = cnflOrderClusters(clusters, routeBase);
  cnflAnnotateMicrozones(orderedClusters);

  workOrders = orderedClusters.flatMap(c => c.path);
  localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
  localStorage.setItem('cnfl_last_route_meta', JSON.stringify({
    optimizedAt: new Date().toISOString(),
    total: workOrders.length,
    microzones: orderedClusters.length,
    base: routeBase
  }));

  renderOrders();
  updateLiquidation();

  const title = document.getElementById('routeStatusTitle');
  if (title) title.innerText = `RUTA LÓGICA · SALIDA ${routeBase.name.toUpperCase()}`;

  showToast(`Ruta lista: ${workOrders.length} paradas · ${orderedClusters.length} microzonas · salida ${routeBase.name}.`);
};

console.log('[CNFL] Optimizador lógico genérico v3 activo · cualquier jornada · sin rutas parciales');
