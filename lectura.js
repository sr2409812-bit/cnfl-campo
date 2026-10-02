const READING_ROUTE_ID = '5051-71-20261001';
const READING_ROUTE_NAME = '5051-71 PASEO ESTUDIANTES';
const READING_KEY = 'cnfl_reading_orders_v1';
const READING_META_KEY = 'cnfl_reading_route_meta_v1';
const READING_HISTORY_KEY = 'cnfl_reading_history_v1';
const GEO_KEY = 'cnfl_geocache';

const READING_SEED_TEXT = `
0101000050|925995|9.93270699499999|-84.071156329|2103 SUB_ANGELES_3A
0101200320|706602|9.93301739899999|-84.069470685|2103 SUB_ANGELES_3A
0101301020|942027|9.932097188|-84.068361851|502 CENTRAL
0101500010|850523|9.93138533000001|-84.067681919|502 CENTRAL
0101600130|991421|9.93176673699998|-84.067051141|502 CENTRAL
0101600320|991562|9.93180334099998|-84.067143571|502 CENTRAL
0102600625|705366|9.93223071599999|-84.072895815|2108 SUB_ANGELES_3B
0102600880|925422|9.93228329700003|-84.073519696|2108 SUB_ANGELES_3B
0102600940|992943|9.932284697|-84.073556468|2108 SUB_ANGELES_3B
0102602270|802536|9.93161147699999|-84.073961571|1908 SUB_URUCA_3B
0102700030|894743|9.93183842600001|-84.071979088|2104 SUB_ANGELES_4A
0102700660|2750662|9.931518224|-84.072717119|2108 SUB_ANGELES_3B
0103000350|801506|9.93208800999997|-84.077818606|2103 SUB_ANGELES_3A
0103000420|809533|9.932098134|-84.078006504|2108 SUB_ANGELES_3B
0103300210|896652|9.93177711599998|-84.075494592|1908 SUB_URUCA_3B
0103300280|2750512|9.93162750699997|-84.075863522|1908 SUB_URUCA_3B
0103300400|2750518|9.93144718600001|-84.075884636|1908 SUB_URUCA_3B
0103400060|894777|9.93143893600001|-84.074131923|1908 SUB_URUCA_3B
0103700301|2750655|9.931237915|-84.077575675|2103 SUB_ANGELES_3A
0103700320|865716|9.931131053|-84.077576519|2103 SUB_ANGELES_3A
0103700350|2750656|9.930908569|-84.077603978|2103 SUB_ANGELES_3A
0103800490|850506|9.93114480600002|-84.076008824|2103 SUB_ANGELES_3A
0103800670|894865|9.93123210700003|-84.076304953|2103 SUB_ANGELES_3A
0103900095|894831|9.93078907699999|-84.075167226|1908 SUB_URUCA_3B
0103900220|926237|9.93113288500001|-84.075520185|1908 SUB_URUCA_3B
0104000038|864781|9.93036813800001|-84.074122135|1908 SUB_URUCA_3B
0104000280|2750051|9.93043081600001|-84.075052117|1908 SUB_URUCA_3B
0104000282|865621|9.93045464400001|-84.075051615|1908 SUB_URUCA_3B
0104110020|865991|9.93101627700003|-84.073151663|2109 SUB_ANGELES_4B
0104200120|993437|9.930213573|-84.078656565|2104 SUB_ANGELES_4A
0104200170|940737|9.930521892|-84.079040168|2104 SUB_ANGELES_4A
0104500398|705765|9.93006136000002|-84.076919465|2109 SUB_ANGELES_4B
0104600100|806803|9.92963064100002|-84.075411182|2104 SUB_ANGELES_4A
0104600126|866105|9.92984208600001|-84.075256478|2109 SUB_ANGELES_4B
0104600500|802562|9.92972698599999|-84.076081203|2109 SUB_ANGELES_4B
0104700175|898038|9.93018352500002|-84.074526205|2104 SUB_ANGELES_4A
0104700420|850264|9.92976368500001|-84.075123537|2104 SUB_ANGELES_4A
0105201170|941368|9.928910229|-84.077108296|2104 SUB_ANGELES_4A
0105300100|864513|9.928750498|-84.075372483|2104 SUB_ANGELES_4A
0105300470|925633|9.929451911|-84.075581788|2104 SUB_ANGELES_4A
0105300760|990729|9.92884024599999|-84.07602383|2109 SUB_ANGELES_4B
0105400100|899318|9.92875786799999|-84.07425353|2104 SUB_ANGELES_4A
0105400320|806366|9.92924413700001|-84.074299125|2104 SUB_ANGELES_4A
0105400680|866106|9.929269799|-84.075184685|2104 SUB_ANGELES_4A
0105400880|1476975|9.928802572|-84.075244769|2104 SUB_ANGELES_4A
0105600040|926157|9.92863865999999|-84.07869314|2104 SUB_ANGELES_4A
0105601040|809466|9.92810497900001|-84.079172018|2109 SUB_ANGELES_4B
0106100580|866099|9.92839230499999|-84.075066696|2104 SUB_ANGELES_4A
0106100680|866133|9.92814858700001|-84.075311422|2104 SUB_ANGELES_4A
0106300140|805365|9.92789580200002|-84.079153839|2109 SUB_ANGELES_4B
0106700520|941451|9.92746177999999|-84.075525935|2104 SUB_ANGELES_4A
0106800840|2750654|9.92723904000002|-84.075240884|2104 SUB_ANGELES_4A
0107200932|981527|9.92665426600001|-84.077492033|2104 SUB_ANGELES_4A
0107700350|952202|9.92604477999998|-84.079175702|2109 SUB_ANGELES_4B
0107900570|939119|9.92610261099998|-84.078656198|2109 SUB_ANGELES_4B
0107900820|807138|9.92537101599999|-84.078675062|2109 SUB_ANGELES_4B
0108000010|939251|9.92553513399997|-84.076669417|2104 SUB_ANGELES_4A
0108000670|1460868|9.92566316800003|-84.077637637|2104 SUB_ANGELES_4A
0108100060|865998|9.92590123000002|-84.07619059|2104 SUB_ANGELES_4A
`.trim();

const READING_SEED = READING_SEED_TEXT.split('\n').map((line, index) => {
  const [localizacion, medidor, lat, lon, circuito] = line.trim().split('|');
  return {
    id: `read-${localizacion}`,
    localizacion,
    medidor,
    lat: Number(lat),
    lon: Number(lon),
    circuito,
    status: 'pending',
    sequence: index + 1,
    readAt: ''
  };
});

let readingOrders = [];
let readingSearch = '';
let readingRouteMeta = null;

function loadJson(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v ?? fallback;
  } catch (_) {
    return fallback;
  }
}

function saveReadingState() {
  localStorage.setItem(READING_KEY, JSON.stringify({
    routeId: READING_ROUTE_ID,
    updatedAt: new Date().toISOString(),
    orders: readingOrders
  }));
  if (readingRouteMeta) localStorage.setItem(READING_META_KEY, JSON.stringify(readingRouteMeta));
}

function loadReadingState() {
  const saved = loadJson(READING_KEY, null);
  if (saved && saved.routeId === READING_ROUTE_ID && Array.isArray(saved.orders) && saved.orders.length === READING_SEED.length) {
    readingOrders = saved.orders;
  } else {
    readingOrders = READING_SEED.map(o => ({...o}));
  }
  readingRouteMeta = loadJson(READING_META_KEY, null);
}

function seedSharedGeoMemory() {
  const cache = loadJson(GEO_KEY, {});
  const now = new Date().toISOString();
  let added = 0;
  let verified = 0;
  let conflicts = 0;

  for (const row of READING_SEED) {
    const old = cache[row.localizacion];
    if (!old || !Number.isFinite(Number(old.lat)) || !Number.isFinite(Number(old.lon))) {
      cache[row.localizacion] = {
        localizacion: row.localizacion,
        lat: row.lat,
        lon: row.lon,
        circuito: row.circuito,
        source: 'ubiCNFL',
        firstSeenAt: now,
        resolvedAt: now,
        lastVerifiedAt: now,
        lastUsedAt: now,
        useCount: 1,
        status: 'valid',
        wazeUrl: `https://www.waze.com/ul?ll=${row.lat},${row.lon}&navigate=yes`,
        mapsUrl: `https://www.google.com/maps/search/?api=1&query=${row.lat},${row.lon}`
      };
      added++;
      continue;
    }

    const same = Math.abs(Number(old.lat) - row.lat) < 0.000001 &&
                 Math.abs(Number(old.lon) - row.lon) < 0.000001;
    if (same) {
      old.lastVerifiedAt = now;
      old.lastUsedAt = now;
      old.useCount = Number(old.useCount || 0) + 1;
      old.status = old.status === 'conflict' ? 'conflict' : 'valid';
      if (!old.source) old.source = 'ubiCNFL';
      verified++;
    } else {
      old.status = 'conflict';
      old.conflictCandidate = {
        lat: row.lat,
        lon: row.lon,
        circuito: row.circuito,
        source: 'ubiCNFL',
        detectedAt: now
      };
      conflicts++;
    }
  }

  localStorage.setItem(GEO_KEY, JSON.stringify(cache));
  return {added, verified, conflicts};
}

function hydrateReadingGps() {
  const cache = loadJson(GEO_KEY, {});
  for (const order of readingOrders) {
    const geo = cache[order.localizacion];
    if (!geo) continue;
    order.gpsStatus = geo.status === 'conflict' ? 'conflict' : 'memory';
    order.gpsSource = geo.source || 'memoria';
    if (geo.status !== 'conflict' && Number.isFinite(Number(geo.lat)) && Number.isFinite(Number(geo.lon))) {
      order.lat = Number(geo.lat);
      order.lon = Number(geo.lon);
      order.circuito = geo.circuito || order.circuito;
    }
  }
}

function stats() {
  const total = readingOrders.length;
  const read = readingOrders.filter(o => o.status === 'read').length;
  const unread = readingOrders.filter(o => o.status === 'unread').length;
  const pending = readingOrders.filter(o => o.status === 'pending').length;
  return {total, read, unread, pending, done: read + unread};
}

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}

function gpsLabel(order) {
  if (order.gpsStatus === 'conflict') return {cls:'conflict', text:'GPS CONFLICTO'};
  if (order.gpsStatus === 'memory') return {cls:'', text:'GPS EN MEMORIA'};
  return {cls:'new', text:'GPS DISPONIBLE'};
}

function renderAll() {
  hydrateReadingGps();
  renderHeaderStats();
  renderCurrent();
  renderList();
  renderSummary();
  renderRouteMeta();
  updateOnlineBadge();
  saveReadingState();
}

function renderHeaderStats() {
  const s = stats();
  document.getElementById('statTotal').textContent = s.total;
  document.getElementById('statPending').textContent = s.pending;
  document.getElementById('statRead').textContent = s.read;
  document.getElementById('progressBar').style.width = `${s.total ? ((s.done / s.total) * 100).toFixed(1) : 0}%`;
}

function renderCurrent() {
  const container = document.getElementById('currentReadingCard');
  const nextContainer = document.getElementById('nextReadingCard');
  const pending = readingOrders.filter(o => o.status === 'pending');
  const s = stats();

  if (!pending.length) {
    container.innerHTML = `
      <div class="done-card">
        <i class="fa-solid fa-circle-check"></i>
        <h2>Jornada completada</h2>
        <p>${s.read} leídos · ${s.unread} no leídos</p>
      </div>`;
    nextContainer.innerHTML = '';
    return;
  }

  const current = pending[0];
  const gps = gpsLabel(current);
  const gpsOk = current.gpsStatus !== 'conflict' && Number.isFinite(Number(current.lat)) && Number.isFinite(Number(current.lon));
  const waze = gpsOk ? `https://www.waze.com/ul?ll=${current.lat},${current.lon}&navigate=yes` : '#';
  const maps = gpsOk ? `https://www.google.com/maps/search/?api=1&query=${current.lat},${current.lon}` : '#';

  container.innerHTML = `
    <article class="reading-card">
      <div class="card-kicker">
        <span>MEDIDOR ACTUAL</span>
        <span>${s.done + 1} / ${s.total}</span>
      </div>
      <div class="reading-main">
        <div class="reading-ident">
          <div>
            <span>MEDIDOR</span>
            <strong>${escapeHtml(current.medidor)}</strong>
          </div>
          <div class="loc">
            <span>LOCALIZACIÓN</span>
            <strong>${escapeHtml(current.localizacion)}</strong>
          </div>
        </div>

        <div class="gps-line">
          <span class="gps-status ${gps.cls}"><i class="fa-solid fa-location-dot"></i> ${gps.text}</span>
          <span class="circuit">${escapeHtml(current.circuito || '')}</span>
        </div>

        <div class="nav-grid">
          <a class="nav-link ${gpsOk ? '' : 'disabled'}" href="${waze}" target="_blank" rel="noopener">
            <i class="fa-brands fa-waze"></i> WAZE
          </a>
          <a class="nav-link ${gpsOk ? '' : 'disabled'}" href="${maps}" target="_blank" rel="noopener">
            <i class="fa-solid fa-map-location-dot"></i> MAPS
          </a>
        </div>

        <div class="primary-action">
          <button class="btn-primary" onclick="markCurrentReading('read')">
            <i class="fa-solid fa-check"></i> MARCAR LEÍDO
          </button>
        </div>
        <div class="secondary-actions">
          <button class="btn-secondary" onclick="markCurrentReading('unread')">
            <i class="fa-solid fa-xmark"></i> NO LEÍDO
          </button>
        </div>
      </div>
    </article>`;

  const next = pending[1];
  nextContainer.innerHTML = next ? `
    <div class="next-card">
      <div class="eyebrow">SIGUIENTE EN LA RUTA</div>
      <div class="next-row">
        <div><span>MEDIDOR</span><br><strong>${escapeHtml(next.medidor)}</strong></div>
        <div style="text-align:right"><span>LOCALIZACIÓN</span><br><strong>${escapeHtml(next.localizacion)}</strong></div>
      </div>
    </div>` : '';
}

function markCurrentReading(status) {
  const current = readingOrders.find(o => o.status === 'pending');
  if (!current) return;
  current.status = status;
  current.readAt = new Date().toISOString();
  archiveReadingEvent(current);
  saveReadingState();
  renderAll();
  showReadingToast(status === 'read' ? `Medidor ${current.medidor} leído · siguiente` : `Medidor ${current.medidor} marcado no leído`);
}

function archiveReadingEvent(order) {
  const history = loadJson(READING_HISTORY_KEY, []);
  history.unshift({
    routeId: READING_ROUTE_ID,
    route: READING_ROUTE_NAME,
    localizacion: order.localizacion,
    medidor: order.medidor,
    status: order.status,
    at: order.readAt || new Date().toISOString()
  });
  localStorage.setItem(READING_HISTORY_KEY, JSON.stringify(history.slice(0, 1000)));
}

function renderList() {
  const q = readingSearch.trim().toLowerCase();
  const rows = readingOrders.filter(o =>
    !q || o.medidor.includes(q) || o.localizacion.includes(q)
  );

  document.getElementById('readingList').innerHTML = rows.map(o => {
    const label = o.status === 'read' ? 'LEÍDO' : (o.status === 'unread' ? 'NO LEÍDO' : 'PENDIENTE');
    return `
      <div class="reading-list-item ${o.status}">
        <div class="list-id">
          <div><span>MEDIDOR</span><strong>${escapeHtml(o.medidor)}</strong></div>
          <div><span>LOCALIZACIÓN</span><strong>${escapeHtml(o.localizacion)}</strong></div>
        </div>
        <div class="list-status ${o.status}">${label}</div>
      </div>`;
  }).join('');
}

function setReadingSearch(value) {
  readingSearch = String(value || '');
  renderList();
}

function renderSummary() {
  const s = stats();
  document.getElementById('sumRead').textContent = s.read;
  document.getElementById('sumUnread').textContent = s.unread;
  document.getElementById('sumPending').textContent = s.pending;

  const cache = loadJson(GEO_KEY, {});
  const count = Object.values(cache).filter(g =>
    g && Number.isFinite(Number(g.lat)) && Number.isFinite(Number(g.lon)) && g.status !== 'conflict'
  ).length;
  document.getElementById('gpsMemoryCount').textContent = count;
}

function renderRouteMeta() {
  const title = document.getElementById('routeEngineLabel');
  const sub = document.getElementById('routeEngineSub');
  if (readingRouteMeta && readingRouteMeta.engine === 'osrm-road-network') {
    title.textContent = 'Ruta vial calculada';
    const km = Number.isFinite(Number(readingRouteMeta.totalMeters))
      ? ` · ~${(Number(readingRouteMeta.totalMeters)/1000).toFixed(1)} km`
      : '';
    sub.textContent = `Desde tu ubicación${km}`;
  } else {
    title.textContent = 'Secuencia del listado';
    sub.textContent = 'Tocá “Desde aquí” para ordenarla por calles.';
  }
}

function switchReadingTab(tab, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${tab}`).classList.add('active');
  if (btn) btn.classList.add('active');
  if (tab === 'list') renderList();
  if (tab === 'summary') renderSummary();
}

function updateOnlineBadge() {
  const el = document.getElementById('onlineBadge');
  if (!el) return;
  if (navigator.onLine) {
    el.textContent = 'EN LÍNEA';
    el.classList.remove('offline');
  } else {
    el.textContent = 'SIN SEÑAL';
    el.classList.add('offline');
  }
}

window.addEventListener('online', updateOnlineBadge);
window.addEventListener('offline', updateOnlineBadge);

function showReadingToast(msg) {
  const el = document.getElementById('readingToast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(showReadingToast._t);
  showReadingToast._t = setTimeout(() => el.classList.remove('show'), 2400);
}

function getCurrentPositionPromise() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Este dispositivo no ofrece geolocalización.'));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 15000
    });
  });
}

function routeCost(route, matrix) {
  if (!route.length) return 0;
  let total = matrix[0][route[0]];
  for (let i = 0; i < route.length - 1; i++) total += matrix[route[i]][route[i + 1]];
  return total;
}

function improve2Opt(route, matrix) {
  let best = route.slice();
  let bestCost = routeCost(best, matrix);
  for (let pass = 0; pass < 4; pass++) {
    let improved = false;
    for (let i = 0; i < best.length - 2; i++) {
      for (let j = i + 1; j < best.length - 1; j++) {
        const candidate = best.slice();
        const reversed = candidate.slice(i, j + 1).reverse();
        candidate.splice(i, reversed.length, ...reversed);
        const cost = routeCost(candidate, matrix);
        if (cost + 1 < bestCost) {
          best = candidate;
          bestCost = cost;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return best;
}

async function optimizeReadingRouteFromHere() {
  const pending = readingOrders.filter(o => o.status === 'pending');
  if (pending.length < 2) {
    showReadingToast('No hay suficientes pendientes para reordenar.');
    return;
  }
  if (pending.some(o => !Number.isFinite(Number(o.lat)) || !Number.isFinite(Number(o.lon)) || o.gpsStatus === 'conflict')) {
    showReadingToast('Hay medidores sin GPS válido o con conflicto.');
    return;
  }
  if (!navigator.onLine) {
    showReadingToast('La ruta vial necesita conexión. Tu avance sí queda guardado.');
    return;
  }

  const button = document.querySelector('.btn-outline');
  const oldText = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> CALCULANDO';

  try {
    const pos = await getCurrentPositionPromise();
    const start = {lat: pos.coords.latitude, lon: pos.coords.longitude};
    const coords = [start, ...pending].map(p => `${p.lon},${p.lat}`).join(';');
    const url = `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration,distance`;
    const res = await fetch(url, {cache:'no-store'});
    if (!res.ok) throw new Error('El motor vial no respondió.');
    const data = await res.json();
    if (!data.durations || data.code !== 'Ok') throw new Error('El motor vial no devolvió una matriz válida.');

    const n = pending.length;
    const unvisited = new Set(Array.from({length:n}, (_,i) => i + 1));
    const route = [];
    let current = 0;

    while (unvisited.size) {
      let best = null;
      let bestTime = Infinity;
      for (const idx of unvisited) {
        const t = Number(data.durations[current][idx]);
        if (Number.isFinite(t) && t < bestTime) {
          bestTime = t;
          best = idx;
        }
      }
      if (best === null) throw new Error('No existe conexión vial para una de las paradas.');
      route.push(best);
      unvisited.delete(best);
      current = best;
    }

    const improved = improve2Opt(route, data.durations);
    const optimizedPending = improved.map(matrixIndex => pending[matrixIndex - 1]);
    const finished = readingOrders.filter(o => o.status !== 'pending');

    let totalMeters = 0;
    if (data.distances) {
      let prev = 0;
      for (const idx of improved) {
        const d = Number(data.distances[prev][idx]);
        if (Number.isFinite(d)) totalMeters += d;
        prev = idx;
      }
    }

    readingOrders = [...finished, ...optimizedPending];
    readingRouteMeta = {
      engine:'osrm-road-network',
      calculatedAt:new Date().toISOString(),
      startLat:start.lat,
      startLon:start.lon,
      pending:n,
      totalMeters
    };
    saveReadingState();
    renderAll();
    showReadingToast('Ruta reordenada por calles desde tu ubicación.');
  } catch (err) {
    console.error(err);
    alert('No cambié la ruta. ' + (err.message || 'No fue posible calcular la red vial.'));
  } finally {
    button.disabled = false;
    button.innerHTML = oldText;
  }
}

function copyReadingSummary() {
  const s = stats();
  const lines = [
    'CNFL CAMPO · LECTURA',
    'Ruta 5051-71 · Paseo Estudiantes',
    `Total: ${s.total}`,
    `Leídos: ${s.read}`,
    `No leídos: ${s.unread}`,
    `Pendientes: ${s.pending}`,
    '',
    'NO LEÍDOS:'
  ];
  const unread = readingOrders.filter(o => o.status === 'unread');
  if (!unread.length) lines.push('Ninguno');
  else unread.forEach(o => lines.push(`${o.localizacion} · Medidor ${o.medidor}`));

  const text = lines.join('\n');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showReadingToast('Resumen copiado.'));
  } else {
    prompt('Copia el resumen:', text);
  }
}

function resetReadingDay() {
  if (!confirm('¿Reiniciar únicamente la jornada de lectura? La memoria GPS NO se borra.')) return;
  readingOrders = READING_SEED.map(o => ({...o}));
  readingRouteMeta = null;
  localStorage.removeItem(READING_META_KEY);
  seedSharedGeoMemory();
  hydrateReadingGps();
  saveReadingState();
  renderAll();
  switchReadingTab('route', document.getElementById('tabRoute'));
  showReadingToast('Jornada reiniciada. La memoria GPS se conserva.');
}

document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  loadReadingState();
  const memory = seedSharedGeoMemory();
  hydrateReadingGps();
  saveReadingState();
  renderAll();

  if (memory.conflicts) {
    showReadingToast(`${memory.conflicts} GPS con conflicto: revisar antes de navegar.`);
  } else {
    showReadingToast(`Lectura lista · ${READING_SEED.length} medidores · GPS en memoria`);
  }
});
