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
        if (cnflPointDistance(base, orders[j]) <= thresholdKm) {
          additions.push(j);
        }
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

function cnflClusterCentroid(cluster) {
  let lat = 0;
  let lon = 0;
  for (const o of cluster) {
    lat += Number(o.lat);
    lon += Number(o.lon);
  }
  return { lat: lat / cluster.length, lon: lon / cluster.length };
}

function cnflMinDistanceToCluster(point, cluster) {
  let best = Infinity;
  for (const o of cluster) {
    best = Math.min(best, cnflPointDistance(point, o));
  }
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
  const remaining = clusters.map((members, idx) => ({
    id: idx + 1,
    members,
    centroid: cnflClusterCentroid(members)
  }));

  const ordered = [];
  let current = startPoint;

  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      // Para elegir la siguiente zona usamos el punto real más cercano del bloque,
      // no solo el centroide. Así evitamos entrar por el extremo equivocado.
      const d = cnflMinDistanceToCluster(current, remaining[i].members);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    const chosen = remaining.splice(bestIdx, 1)[0];
    const path = cnflRouteInsideCluster(chosen.members, current);
    chosen.path = path;
    ordered.push(chosen);
    current = path[path.length - 1];
  }

  return ordered;
}

function cnflAnnotateMicrozones(orderedClusters) {
  for (const cluster of orderedClusters) {
    const size = cluster.path.length;
    for (const ord of cluster.path) {
      ord.microzonaId = cluster.id;
      ord.microzonaSize = size;
    }
  }
}

// Sustituye el optimizador anterior. No hace 2-Opt global sobre órdenes individuales,
// porque eso puede partir una microzona y hacer que el técnico regrese a ella después.
optimizeCurrentRoute = function () {
  if (!workOrders || workOrders.length <= 1) {
    showToast('No hay suficientes órdenes para optimizar');
    return;
  }

  const withCoords = workOrders.filter(o => Number.isFinite(Number(o.lat)) && Number.isFinite(Number(o.lon)));
  const withoutCoords = workOrders.filter(o => !Number.isFinite(Number(o.lat)) || !Number.isFinite(Number(o.lon)));

  if (withCoords.length === 0) {
    showToast('Las órdenes todavía no tienen coordenadas GPS válidas');
    return;
  }

  const clusters = cnflBuildMicrozones(withCoords, CNFL_MICROZONE_KM);
  const orderedClusters = cnflOrderClusters(clusters, CNFL_ROUTE_BASE);
  cnflAnnotateMicrozones(orderedClusters);

  const logicalRoute = orderedClusters.flatMap(c => c.path);
  workOrders = [...logicalRoute, ...withoutCoords];

  localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
  renderOrders();
  updateLiquidation();

  const title = document.getElementById('routeStatusTitle');
  if (title) title.innerText = 'RUTA LÓGICA · SALIDA LA GUACA';

  const zoneCount = orderedClusters.length;
  const noGpsText = withoutCoords.length ? ` · ${withoutCoords.length} sin GPS al final` : '';
  showToast(`Ruta lista: ${withCoords.length} paradas en ${zoneCount} microzonas${noGpsText}.`);
};

console.log('[CNFL] Optimizador lógico v1 activo · salida La Guaca · microzonas 50 m');
