// CNFL Campo — optimizador vial v5 para trabajo de campo
// Reglas:
// 1) Ruta inicial desde La Guaca.
// 2) En campo: recalcular SOLO pendientes desde la ubicación actual.
// 3) Lectura: LIBRO 16 primero y LIBRO 40 después.
// 4) Matriz vial por calles; nunca reemplazar silenciosamente por distancia aérea.
// 5) La transición 16 -> 40 influye en el final elegido para el libro 16.

const CNFL_ROUTE_CONFIG_KEY = 'cnfl_route_config';
const CNFL_DEFAULT_ROUTE_BASE = {
  name: 'La Guaca · San Sebastián',
  lat: 9.91154,
  lon: -84.07826
};

const CNFL_ROAD_TABLE_ENDPOINT = 'https://router.project-osrm.org/table/v1/driving/';
const CNFL_MAX_MATRIX_POINTS = 90;
const CNFL_MAX_SEEDS = 5;
const CNFL_TWO_OPT_PASSES = 10;

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
  if (!cnflValidPoint(base)) throw new Error('Coordenadas de salida inválidas');
  localStorage.setItem(CNFL_ROUTE_CONFIG_KEY, JSON.stringify(base));
  return base;
}

function cnflResetRouteBase() {
  localStorage.removeItem(CNFL_ROUTE_CONFIG_KEY);
  return { ...CNFL_DEFAULT_ROUTE_BASE };
}

function cnflValidPoint(point) {
  const lat = Number(point && point.lat);
  const lon = Number(point && point.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function cnflMissingGpsOrders(orders = workOrders) {
  return (orders || []).filter(o => !cnflValidPoint(o));
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

async function cnflFetchRoadMatrix(startPoint, orders, lookaheadOrders = []) {
  let lookahead = [...lookaheadOrders];

  // El look-ahead es una mejora, no un requisito. Si excede el límite,
  // se conserva toda la ruta actual y se reduce la muestra del siguiente libro.
  const roomForLookahead = Math.max(0, CNFL_MAX_MATRIX_POINTS - 1 - orders.length);
  if (lookahead.length > roomForLookahead) {
    lookahead = lookahead.slice(0, roomForLookahead);
  }

  const points = [startPoint, ...orders, ...lookahead];
  if (points.length > CNFL_MAX_MATRIX_POINTS) {
    throw new Error(
      `El bloque requiere ${points.length} puntos y el motor vial admite ${CNFL_MAX_MATRIX_POINTS}. Divide la jornada en bloques.`
    );
  }

  const coords = points.map(cnflRoadCoordinate).join(';');
  const url = `${CNFL_ROAD_TABLE_ENDPOINT}${coords}?annotations=duration,distance`;

  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Servicio vial respondió HTTP ${response.status}`);

  const data = await response.json();
  if (!data || data.code !== 'Ok' || !Array.isArray(data.durations)) {
    throw new Error(data && data.message ? data.message : 'No se recibió una matriz vial válida');
  }

  const n = points.length;
  if (data.durations.length !== n || data.durations.some(r => !Array.isArray(r) || r.length !== n)) {
    throw new Error('La matriz vial llegó incompleta');
  }

  const groupStart = 1;
  const groupEnd = orders.length;
  for (let i = 0; i <= groupEnd; i++) {
    for (let j = 0; j <= groupEnd; j++) {
      if (i !== j && !Number.isFinite(Number(data.durations[i][j]))) {
        throw new Error('Hay una o más paradas sin conexión vial calculable');
      }
    }
  }

  return {
    durations: data.durations,
    distances: Array.isArray(data.distances) ? data.distances : null,
    routeIndices: Array.from({ length: orders.length }, (_, i) => i + 1),
    lookaheadIndices: Array.from({ length: lookahead.length }, (_, i) => 1 + orders.length + i)
  };
}

function cnflNearestNeighborRoad(matrix, allowedIndices, forcedFirst = null) {
  const remaining = new Set(allowedIndices);
  const route = [];
  let current = 0;

  if (forcedFirst !== null && remaining.has(forcedFirst)) {
    route.push(forcedFirst);
    remaining.delete(forcedFirst);
    current = forcedFirst;
  }

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

function cnflRouteCost(orderIndices, matrix, lookaheadIndices = []) {
  let current = 0;
  let total = 0;

  for (const next of orderIndices) {
    const leg = Number(matrix[current][next]);
    if (!Number.isFinite(leg)) return Infinity;
    total += leg;
    current = next;
  }

  // Para LIBRO 16, favorece terminar donde la entrada al LIBRO 40 sea más barata.
  if (lookaheadIndices.length && orderIndices.length) {
    let transition = Infinity;
    for (const idx of lookaheadIndices) {
      const leg = Number(matrix[current][idx]);
      if (Number.isFinite(leg)) transition = Math.min(transition, leg);
    }
    if (Number.isFinite(transition)) total += transition;
  }

  return total;
}

function cnflTwoOptRoad(route, matrix, lookaheadIndices = []) {
  let best = [...route];
  let bestCost = cnflRouteCost(best, matrix, lookaheadIndices);
  let improved = true;
  let pass = 0;

  while (improved && pass < CNFL_TWO_OPT_PASSES) {
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
        const cost = cnflRouteCost(candidate, matrix, lookaheadIndices);
        if (cost + 0.5 < bestCost) {
          best = candidate;
          bestCost = cost;
          improved = true;
          break outer;
        }
      }
    }
  }

  return { route: best, objectiveSeconds: bestCost };
}

function cnflSeedFirstIndices(matrix, routeIndices) {
  if (!routeIndices.length) return [];
  const ranked = [...routeIndices].sort((a, b) =>
    Number(matrix[0][a]) - Number(matrix[0][b])
  );

  const picks = [];
  const add = idx => {
    if (idx !== undefined && idx !== null && !picks.includes(idx)) picks.push(idx);
  };

  add(ranked[0]);
  add(ranked[1]);
  add(ranked[2]);
  add(ranked[Math.floor((ranked.length - 1) / 2)]);
  add(ranked[ranked.length - 1]);

  return picks.slice(0, CNFL_MAX_SEEDS);
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

function cnflRoadDurationForRoute(routeIndices, durationMatrix) {
  let current = 0;
  let total = 0;
  for (const next of routeIndices) {
    const leg = Number(durationMatrix[current][next]);
    if (!Number.isFinite(leg)) return null;
    total += leg;
    current = next;
  }
  return total;
}

async function cnflOptimizeRoadGroup(group, startPoint, nextGroup = null) {
  const lookaheadOrders = nextGroup ? nextGroup.orders : [];
  const matrixData = await cnflFetchRoadMatrix(startPoint, group.orders, lookaheadOrders);
  const { durations, distances, routeIndices, lookaheadIndices } = matrixData;

  const candidateRoutes = [];

  const normalSeed = cnflNearestNeighborRoad(durations, routeIndices);
  candidateRoutes.push(cnflTwoOptRoad(normalSeed, durations, lookaheadIndices));

  for (const first of cnflSeedFirstIndices(durations, routeIndices)) {
    const seed = cnflNearestNeighborRoad(durations, routeIndices, first);
    candidateRoutes.push(cnflTwoOptRoad(seed, durations, lookaheadIndices));
  }

  candidateRoutes.sort((a, b) => a.objectiveSeconds - b.objectiveSeconds);
  const best = candidateRoutes[0];
  const ordered = best.route.map(idx => group.orders[idx - 1]);

  return {
    ordered,
    durationSeconds: cnflRoadDurationForRoute(best.route, durations),
    roadMeters: cnflRoadDistanceForRoute(best.route, distances),
    objectiveSeconds: best.objectiveSeconds,
    endPoint: ordered.length ? ordered[ordered.length - 1] : startPoint
  };
}

function cnflSetRouteUi(titleText, subtitleText) {
  const title = document.getElementById('routeStatusTitle');
  const subtitle = document.getElementById('routeDistanceSubtitle');
  if (title && titleText) title.innerText = titleText;
  if (subtitle && subtitleText) subtitle.innerText = subtitleText;
}

async function cnflOptimizeSubset(ordersToOptimize, startPoint, startLabel) {
  if (!ordersToOptimize || ordersToOptimize.length <= 1) {
    showToast('No hay suficientes órdenes pendientes para optimizar');
    return false;
  }

  const missingGps = cnflMissingGpsOrders(ordersToOptimize);
  if (missingGps.length > 0) {
    const missingLocs = [...new Set(missingGps.map(o => o.localizacion || o.orden || 'SIN LOCALIZACIÓN'))];
    alert(
      `Ruta NO optimizada.\n\n` +
      `Pendientes a optimizar: ${ordersToOptimize.length}\n` +
      `Con GPS: ${ordersToOptimize.length - missingGps.length}\n` +
      `Sin GPS: ${missingGps.length}\n\n` +
      `Faltantes:\n${missingLocs.join('\n')}`
    );
    return false;
  }

  if (!cnflValidPoint(startPoint)) {
    alert('No se pudo determinar un punto de salida válido.');
    return false;
  }

  const originalOrders = [...workOrders];
  const groups = cnflBuildRouteGroups(ordersToOptimize);
  cnflSetRouteUi('CALCULANDO RUTA POR CALLES…', `Inicio: ${startLabel}. Solo pendientes.`);
  showToast('Calculando pendientes por calles…');

  try {
    let currentStart = startPoint;
    const finalRoute = [];
    const groupMeta = [];
    let totalMeters = 0;
    let totalDuration = 0;

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const nextGroup = i + 1 < groups.length ? groups[i + 1] : null;
      const result = await cnflOptimizeRoadGroup(group, currentStart, nextGroup);

      finalRoute.push(...result.ordered);
      currentStart = result.endPoint;
      if (Number.isFinite(result.durationSeconds)) totalDuration += result.durationSeconds;
      if (Number.isFinite(result.roadMeters)) totalMeters += result.roadMeters;

      groupMeta.push({
        key: group.key,
        label: group.label,
        count: result.ordered.length,
        durationSeconds: result.durationSeconds,
        roadMeters: result.roadMeters
      });
    }

    // Solo se reordena lo pendiente. Las ya gestionadas no vuelven a entrar a la ruta.
    const managed = originalOrders.filter(o => o.status !== 'pending');
    workOrders = [...finalRoute, ...managed];

    localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
    localStorage.setItem('cnfl_last_route_meta', JSON.stringify({
      optimizedAt: new Date().toISOString(),
      engine: 'road-network-osrm-v5',
      pendingTotal: finalRoute.length,
      managedTotal: managed.length,
      start: { name: startLabel, lat: Number(startPoint.lat), lon: Number(startPoint.lon) },
      groups: groupMeta,
      totalRoadMeters: totalMeters,
      totalDurationSeconds: totalDuration
    }));

    renderOrders();
    updateLiquidation();

    const labels = groups.map(g => g.label).join(' → ');
    const km = totalMeters > 0 ? `${(totalMeters / 1000).toFixed(1)} km aprox. por calles` : 'Orden calculado por red vial';
    cnflSetRouteUi(`RUTA PENDIENTE · ${labels}`, `${km} · inicio ${startLabel}`);
    showToast(`Ruta lista: ${finalRoute.length} pendientes · ${labels}.`);
    return true;
  } catch (error) {
    console.error('[CNFL] Error optimizando por calles:', error);
    workOrders = originalOrders;
    localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
    renderOrders();

    cnflSetRouteUi('RUTA SIN OPTIMIZAR', 'No se cambió el orden porque falló el cálculo vial.');
    alert(
      `No se pudo optimizar por calles.\n\n` +
      `${error && error.message ? error.message : error}\n\n` +
      `El orden anterior se mantuvo intacto.`
    );
    return false;
  }
}

async function optimizeInitialRoute() {
  const pending = (workOrders || []).filter(o => o.status === 'pending');
  const base = cnflGetRouteBase();
  return cnflOptimizeSubset(pending, base, base.name);
}

function cnflGetBrowserPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Este dispositivo no ofrece ubicación del navegador.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        name: 'Mi ubicación actual',
        lat: Number(pos.coords.latitude),
        lon: Number(pos.coords.longitude)
      }),
      err => reject(new Error(
        err && err.message ? err.message : 'No se pudo obtener la ubicación actual.'
      )),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

async function optimizePendingFromCurrentLocation() {
  const pending = (workOrders || []).filter(o => o.status === 'pending');
  if (pending.length <= 1) {
    showToast('No hay suficientes pendientes para recalcular');
    return false;
  }

  showToast('Obteniendo ubicación actual…');

  try {
    const current = await cnflGetBrowserPosition();
    return await cnflOptimizeSubset(pending, current, current.name);
  } catch (error) {
    alert(
      `No pude usar tu ubicación actual.\n\n` +
      `${error && error.message ? error.message : error}\n\n` +
      `Revisa el permiso de ubicación del navegador y vuelve a intentar.`
    );
    return false;
  }
}

// Compatibilidad con llamadas antiguas: una carga nueva usa la ruta inicial.
// Para trabajo en campo, los botones visibles llaman optimizePendingFromCurrentLocation().
optimizeCurrentRoute = optimizeInitialRoute;

console.log('[CNFL] Optimizador vial v5 activo · pendientes desde ubicación actual · libros 16→40 · transición optimizada');
