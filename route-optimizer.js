// CNFL Campo — optimizador lógico de ruta de campo
// Prioridad: salida La Guaca (Paso Ancho), mantener microzonas juntas,
// evitar volver a una zona ya atendida y reducir saltos GPS innecesarios.

const CNFL_ROUTE_BASE = {
  name: 'La Guaca · San Sebastián',
  lat: 9.91154,
  lon: -84.07826
};

const CNFL_MICROZONE_KM = 0.050; // 50 m: una misma microzona operativa

function cnflPointDistance(a, b) {
  return haversineDistance(a.lat, a.lon, b.lat, b.lon);
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
      // Elegimos la siguiente microzona por su punto real de entrada más cercano.
      // Cada microzona se termina completa antes de pasar a la siguiente.
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

// Sustituye el TSP global anterior. El TSP punto-a-punto podía partir una zona
// y obligar a regresar después. Esta versión mantiene cada microzona contigua.
optimizeCurrentRoute = function () {
  if (!workOrders || workOrders.length <= 1) {
    showToast('No hay suficientes órdenes para optimizar');
    return;
  }

  // Control obligatorio: no se crea una ruta parcial por accidente.
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

  const clusters = cnflBuildMicrozones(workOrders, CNFL_MICROZONE_KM);
  const orderedClusters = cnflOrderClusters(clusters, CNFL_ROUTE_BASE);
  cnflAnnotateMicrozones(orderedClusters);

  workOrders = orderedClusters.flatMap(c => c.path);
  localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));

  renderOrders();
  updateLiquidation();

  const title = document.getElementById('routeStatusTitle');
  if (title) title.innerText = 'RUTA LÓGICA · SALIDA LA GUACA';

  showToast(`Ruta lista: ${workOrders.length} paradas · ${orderedClusters.length} microzonas · salida La Guaca.`);
};

console.log('[CNFL] Optimizador lógico v2 activo · salida La Guaca · microzonas 50 m · sin rutas parciales');
