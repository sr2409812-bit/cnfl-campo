// CNFL Campo — optimizador por RED VIAL para trabajo de campo
// No usa distancia en línea recta ni microzonas rígidas.
// Calcula una matriz de tiempos/distancias por calles y ordena las paradas
// para reducir devoluciones reales. En lectura, 16 y 40 se trabajan separados
// y el LIBRO 16 va primero.

const CNFL_ROUTE_CONFIG_KEY = 'cnfl_route_config';
const CNFL_DEFAULT_ROUTE_BASE = {
  name: 'La Guaca · San Sebastián',
  lat: 9.91154,
  lon: -84.07826
};

const CNFL_ROAD_TABLE_ENDPOINT = 'https://router.project-osrm.org/table/v1/driving/';
const CNFL_MAX_ORDERS_PER_ROAD_MATRIX = 90;

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

function cnflMissingGpsOrders() {
  return (workOrders || []).filter(o =>
    !Number.isFinite(Number(o.lat)) || !Number.isFinite(Number(o.lon))
  );
}

function cnflLocalizationDigits(order) {
  return String(order && order.localizacion || '').replace(/\D/g, '');
}

function cnflReadingBook(order) {
  const loc = cnflLocalizationDigits(order);
  if (loc.startsWith('16')) return '16';
  if (loc.startsWith('40')) return '40';
  return '';
}

// Solo separa por libro cuando el lote está compuesto enteramente por 16/40.
// Así no altera rutas de desconexión u otros trabajos con otra numeración.
function cnflBuildRouteGroups(orders) {
  const tagged = orders.map(o => ({ order: o, book: cnflReadingBook(o) }));
  const readingOnly = tagged.length > 0 && tagged.every(x => x.book === '16' || x.book === '40');

  if (!readingOnly) {
    return [{ key: 'GENERAL', label: 'RUTA GENERAL', orders: [...orders] }];
  }

  const groups = [];
  const book16 = tagged.filter(x => x.book === '16').map(x => x.order);
  const book40 = tagged.filter(x => x.book === '40').map(x => x.order);
  if (book16.length) groups.push({ key: '16', label: 'LIBRO 16', orders: book16 });
  if (book40.length) groups.push({ key: '40', label: 'LIBRO 40', orders: book40 });
  return groups;
}

function cnflRoadCoordinate(point) {
  return `${Number(point.lon)},${Number(point.lat)}`;
}

async function cnflFetchRoadMatrix(startPoint, orders) {
  if (orders.length > CNFL_MAX_ORDERS_PER_ROAD_MATRIX) {
    throw new Error(`Hay ${orders.length} órdenes en un mismo bloque; el optimizador vial admite hasta ${CNFL_MAX_ORDERS_PER_ROAD_MATRIX} por bloque.`);
  }

  const points = [startPoint, ...orders];
  const coords = points.map(cnflRoadCoordinate).join(';');
  const url = `${CNFL_ROAD_TABLE_ENDPOINT}${coords}?annotations=duration,distance`;

  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Servicio vial respondió HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!data || data.code !== 'Ok' || !Array.isArray(data.durations)) {
    throw new Error(data && data.message ? data.message : 'No se recibió una matriz vial válida');
  }

  const n = points.length;
  if (data.durations.length !== n || data.durations.some(r => !Array.isArray(r) || r.length !== n)) {
    throw new Error('La matriz vial llegó incompleta');
  }

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j && !Number.isFinite(Number(data.durations[i][j]))) {
        throw new Error('Hay una o más paradas sin conexión vial calculable');
      }
    }
  }

  return {
    durations: data.durations,
    distances: Array.isArray(data.distances) ? data.distances : null
  };
}

function cnflRouteCost(orderIndices, matrix) {
  let current = 0; // índice 0 = punto de salida del bloque
  let total = 0;
  for (const next of orderIndices) {
    const leg = Number(matrix[current][next]);
    if (!Number.isFinite(leg)) return Infinity;
    total += leg;
    current = next;
  }
  return total;
}

function cnflNearestNeighborRoad(matrix) {
  const n = matrix.length;
  const remaining = new Set();
  for (let i = 1; i < n; i++) remaining.add(i);

  const route = [];
  let current = 0;

  while (remaining.size) {
    let best = null;
    let bestCost = Infinity;
    for (const idx of remaining) {
      const cost = Number(matrix[current][idx]);
      if (Number.isFinite(cost) && cost < bestCost) {
        best = idx;
        bestCost = cost;
      }
    }
    if (best === null) throw new Error('No se pudo conectar toda la ruta por calles');
    route.push(best);
    remaining.delete(best);
    current = best;
  }

  return route;
}

// 2-opt de ruta abierta. Recalcula el costo completo porque la matriz vial es
// asimétrica (calles de un solo sentido); no usa el atajo matemático de TSP simétrico.
function cnflTwoOptRoad(route, matrix) {
  let best = [...route];
  let bestCost = cnflRouteCost(best, matrix);
  let improved = true;
  let pass = 0;

  while (improved && pass < 20) {
    improved = false;
    pass++;

    outer:
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1)
        ];
        const cost = cnflRouteCost(candidate, matrix);
        if (cost + 0.5 < bestCost) {
          best = candidate;
          bestCost = cost;
          improved = true;
          break outer;
        }
      }
    }
  }

  return { route: best, durationSeconds: bestCost };
}

function cnflRoadDistanceForRoute(routeIndices, distanceMatrix) {
  if (!distanceMatrix) return null;
  let current = 0;
  let total = 0;
  for (const next of routeIndices) {
    const leg = Number(distanceMatrix[current][next]);
    if (!Number.isFinite(leg)) return null;
    total += leg;
    current = next;
  }
  return total;
}

async function cnflOptimizeRoadGroup(group, startPoint) {
  const matrix = await cnflFetchRoadMatrix(startPoint, group.orders);
  const seed = cnflNearestNeighborRoad(matrix.durations);
  const optimized = cnflTwoOptRoad(seed, matrix.durations);
  const ordered = optimized.route.map(idx => group.orders[idx - 1]);
  const roadMeters = cnflRoadDistanceForRoute(optimized.route, matrix.distances);

  return {
    ordered,
    durationSeconds: optimized.durationSeconds,
    roadMeters,
    endPoint: ordered.length ? ordered[ordered.length - 1] : startPoint
  };
}

optimizeCurrentRoute = async function () {
  if (!workOrders || workOrders.length <= 1) {
    showToast('No hay suficientes órdenes para optimizar');
    return false;
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
    return false;
  }

  const originalOrders = [...workOrders];
  const routeBase = cnflGetRouteBase();
  const groups = cnflBuildRouteGroups(originalOrders);

  const title = document.getElementById('routeStatusTitle');
  const subtitle = document.getElementById('routeDistanceSubtitle');
  if (title) title.innerText = 'CALCULANDO RUTA POR CALLES…';
  if (subtitle) subtitle.innerText = 'Consultando red vial; no se usará distancia en línea recta.';
  showToast('Calculando recorrido por calles…');

  try {
    let currentStart = routeBase;
    const finalRoute = [];
    const groupMeta = [];
    let totalMeters = 0;
    let totalDuration = 0;

    for (const group of groups) {
      const result = await cnflOptimizeRoadGroup(group, currentStart);
      finalRoute.push(...result.ordered);
      currentStart = result.endPoint;
      totalDuration += result.durationSeconds || 0;
      if (Number.isFinite(result.roadMeters)) totalMeters += result.roadMeters;
      groupMeta.push({
        key: group.key,
        label: group.label,
        count: result.ordered.length,
        durationSeconds: result.durationSeconds,
        roadMeters: result.roadMeters
      });
    }

    workOrders = finalRoute;
    localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
    localStorage.setItem('cnfl_last_route_meta', JSON.stringify({
      optimizedAt: new Date().toISOString(),
      engine: 'road-network-osrm',
      total: workOrders.length,
      base: routeBase,
      groups: groupMeta,
      totalRoadMeters: totalMeters,
      totalDurationSeconds: totalDuration
    }));

    renderOrders();
    updateLiquidation();

    const labels = groups.map(g => g.label).join(' → ');
    if (title) title.innerText = `RUTA POR CALLES · ${labels}`;
    if (subtitle) {
      const km = totalMeters > 0 ? `${(totalMeters / 1000).toFixed(1)} km aprox. por calles` : 'Orden calculado por red vial';
      subtitle.innerText = `${km} · salida ${routeBase.name}`;
    }

    showToast(`Ruta por calles lista: ${workOrders.length} paradas · ${labels}.`);
    return true;
  } catch (error) {
    console.error('[CNFL] Error optimizando por calles:', error);
    workOrders = originalOrders;
    localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
    renderOrders();

    if (title) title.innerText = 'RUTA SIN OPTIMIZAR';
    if (subtitle) subtitle.innerText = 'No se cambió el orden porque falló el cálculo por red vial.';

    alert(
      `No se pudo optimizar por calles.\n\n` +
      `${error && error.message ? error.message : error}\n\n` +
      `El orden anterior se mantuvo intacto. No voy a reemplazarlo con cálculo en línea recta.`
    );
    return false;
  }
};

console.log('[CNFL] Optimizador vial v4 activo · red de calles · libros 16→40 · sin fallback aéreo');
