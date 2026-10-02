const READING_KEY = 'cnfl_reading_orders_v2';
const READING_HISTORY_KEY = 'cnfl_reading_history_v1';
const READING_ROUTE_HISTORY_KEY = 'cnfl_reading_routes_v1';
const GEO_KEY = 'cnfl_geocache';

const DEFAULT_ROUTE_INFO = {
  routeId: '5051-71-20261001',
  name: '5051-71',
  subtitle: 'Paseo Estudiantes · Ciclo 5051',
  date: '2026-10-01'
};

const DEFAULT_READING_TEXT = `
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

const DEFAULT_ORDERS = DEFAULT_READING_TEXT.split('\n').map((line, index) => {
  const [localizacion, medidor, lat, lon, circuito] = line.trim().split('|');
  return {
    id: `read-\${localizacion}`,
    localizacion,
    medidor,
    lat: Number(lat),
    lon: Number(lon),
    circuito,
    status: 'pending',
    sequence: index + 1,
    originalSequence: index + 1,
    readAt: ''
  };
});

let readingOrders = [];
let readingSearch = '';
let readingRouteMeta = null;
let readingRouteInfo = {...DEFAULT_ROUTE_INFO};

function loadJson(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v ?? fallback;
  } catch (_) {
    return fallback;
  }
}

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}

function localDateKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `\${y}-\${m}-\${day}`;
}

function routeDisplayName(info = readingRouteInfo) {
  const name = String(info?.name || 'Ruta de lectura').trim();
  return /^ruta\s/i.test(name) ? name : `Ruta \${name}`;
}

function routeDateLabel(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return {top:'--', year:'----'};
  const months = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SET','OCT','NOV','DIC'];
  return {top:`\${m[3]} \${months[Number(m[2])-1]}`, year:m[1]};
}

function stats(orders = readingOrders) {
  const total = orders.length;
  const read = orders.filter(o => o.status === 'read').length;
  const unread = orders.filter(o => o.status === 'unread').length;
  const pending = orders.filter(o => o.status === 'pending').length;
  return {total, read, unread, pending, done: read + unread};
}

function saveReadingState() {
  localStorage.setItem(READING_KEY, JSON.stringify({
    version: 2,
    routeInfo: readingRouteInfo,
    routeMeta: readingRouteMeta,
    updatedAt: new Date().toISOString(),
    orders: readingOrders
  }));
}

function migrateOldReadingState() {
  const old = loadJson('cnfl_reading_orders_v1', null);
  if (!old || !Array.isArray(old.orders)) return null;
  return {
    version:2,
    routeInfo:{...DEFAULT_ROUTE_INFO},
    routeMeta:loadJson('cnfl_reading_route_meta_v1', null),
    orders:old.orders
  };
}

function loadReadingState() {
  const saved = loadJson(READING_KEY, null) || migrateOldReadingState();
  if (saved && Array.isArray(saved.orders) && saved.orders.length) {
    readingOrders = saved.orders.map((o, index) => ({
      ...o,
      sequence: Number(o.sequence || index + 1),
      originalSequence: Number(o.originalSequence || o.sequence || index + 1),
      status: ['pending','read','unread'].includes(o.status) ? o.status : 'pending'
    }));
    readingRouteInfo = saved.routeInfo || {...DEFAULT_ROUTE_INFO};
    readingRouteMeta = saved.routeMeta || null;
  } else {
    readingOrders = DEFAULT_ORDERS.map(o => ({...o}));
    readingRouteInfo = {...DEFAULT_ROUTE_INFO};
    readingRouteMeta = null;
  }
}

function seedDefaultGeoMemory() {
  const cache = loadJson(GEO_KEY, {});
  const now = new Date().toISOString();
  let added = 0;
  let verified = 0;
  let conflicts = 0;

  for (const row of DEFAULT_ORDERS) {
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
        wazeUrl: `https://www.waze.com/ul?ll=\${row.lat},\${row.lon}&navigate=yes`,
        mapsUrl: `https://www.google.com/maps/search/?api=1&query=\${row.lat},\${row.lon}`
      };
      added++;
      continue;
    }

    const same = Math.abs(Number(old.lat) - row.lat) < 0.000001 &&
                 Math.abs(Number(old.lon) - row.lon) < 0.000001;
    if (same) {
      old.lastVerifiedAt = old.lastVerifiedAt || now;
      old.source = old.source || 'ubiCNFL';
      if (old.status !== 'conflict') old.status = 'valid';
      verified++;
    } else {
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
    if (!geo) {
      order.gpsStatus = 'missing';
      continue;
    }

    if (geo.status === 'conflict') {
      order.gpsStatus = 'conflict';
      continue;
    }

    if (Number.isFinite(Number(geo.lat)) && Number.isFinite(Number(geo.lon))) {
      order.lat = Number(geo.lat);
      order.lon = Number(geo.lon);
      order.circuito = geo.circuito || order.circuito || '';
      order.gpsStatus = 'memory';
      order.gpsSource = geo.source || 'memoria';
    } else {
      order.gpsStatus = 'missing';
    }
  }
}

function renderRouteHeader() {
  document.getElementById('activeRouteTitle').textContent = routeDisplayName();
  document.getElementById('activeRouteSubtitle').textContent = readingRouteInfo.subtitle || 'Lectura de medidores';
  document.getElementById('summaryRouteTitle').textContent = routeDisplayName();

  const d = routeDateLabel(readingRouteInfo.date || localDateKey());
  document.getElementById('activeRouteDate').innerHTML = `\${d.top}<br><strong>\${d.year}</strong>`;
}

function renderHeaderStats() {
  const s = stats();
  document.getElementById('statTotal').textContent = s.total;
  document.getElementById('statPending').textContent = s.pending;
  document.getElementById('statRead').textContent = s.read;
  document.getElementById('progressBar').style.width = `\${s.total ? ((s.done / s.total) * 100).toFixed(1) : 0}%`;
}

function gpsLabel(order) {
  if (order.gpsStatus === 'conflict') return {cls:'conflict', text:'GPS CONFLICTO'};
  if (order.gpsStatus === 'memory') return {cls:'', text:'GPS EN MEMORIA'};
  if (Number.isFinite(Number(order.lat)) && Number.isFinite(Number(order.lon))) return {cls:'new', text:'GPS DISPONIBLE'};
  return {cls:'conflict', text:'GPS FALTANTE'};
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
        <p>\${s.read} leídos · \${s.unread} no leídos</p>
      </div>`;
    nextContainer.innerHTML = '';
    return;
  }

  const current = pending[0];
  const gps = gpsLabel(current);
  const gpsOk = current.gpsStatus !== 'conflict' &&
    Number.isFinite(Number(current.lat)) && Number.isFinite(Number(current.lon));
  const waze = gpsOk ? `https://www.waze.com/ul?ll=\${current.lat},\${current.lon}&navigate=yes` : '#';
  const maps = gpsOk ? `https://www.google.com/maps/search/?api=1&query=\${current.lat},\${current.lon}` : '#';

  container.innerHTML = `
    <article class="reading-card">
      <div class="card-kicker">
        <span>MEDIDOR ACTUAL</span>
        <span>\${s.done + 1} / \${s.total}</span>
      </div>
      <div class="reading-main">
        <div class="reading-ident">
          <div>
            <span>MEDIDOR</span>
            <strong>\${escapeHtml(current.medidor)}</strong>
          </div>
          <div class="loc">
            <span>LOCALIZACIÓN</span>
            <strong>\${escapeHtml(current.localizacion)}</strong>
          </div>
        </div>

        <div class="gps-line">
          <span class="gps-status \${gps.cls}"><i class="fa-solid fa-location-dot"></i> \${gps.text}</span>
          <span class="circuit">\${escapeHtml(current.circuito || '')}</span>
        </div>

        <div class="nav-grid">
          <a class="nav-link \${gpsOk ? '' : 'disabled'}" href="\${waze}" target="_blank" rel="noopener">
            <i class="fa-brands fa-waze"></i> WAZE
          </a>
          <a class="nav-link \${gpsOk ? '' : 'disabled'}" href="\${maps}" target="_blank" rel="noopener">
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
        <div><span>MEDIDOR</span><br><strong>\${escapeHtml(next.medidor)}</strong></div>
        <div style="text-align:right"><span>LOCALIZACIÓN</span><br><strong>\${escapeHtml(next.localizacion)}</strong></div>
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
  showReadingToast(status === 'read'
    ? `Medidor \${current.medidor} leído · siguiente`
    : `Medidor \${current.medidor} marcado no leído`);
}

function archiveReadingEvent(order) {
  const history = loadJson(READING_HISTORY_KEY, []);
  history.unshift({
    routeId: readingRouteInfo.routeId,
    route: readingRouteInfo.name,
    localizacion: order.localizacion,
    medidor: order.medidor,
    status: order.status,
    at: order.readAt || new Date().toISOString()
  });
  localStorage.setItem(READING_HISTORY_KEY, JSON.stringify(history.slice(0, 1500)));
}

function renderList() {
  const q = readingSearch.trim().toLowerCase();
  const rows = readingOrders.filter(o =>
    !q || String(o.medidor).includes(q) || String(o.localizacion).includes(q)
  );

  document.getElementById('readingList').innerHTML = rows.map(o => {
    const label = o.status === 'read' ? 'LEÍDO' : (o.status === 'unread' ? 'NO LEÍDO' : 'PENDIENTE');
    return `
      <div class="reading-list-item \${o.status}">
        <div class="list-id">
          <div><span>MEDIDOR</span><strong>\${escapeHtml(o.medidor)}</strong></div>
          <div><span>LOCALIZACIÓN</span><strong>\${escapeHtml(o.localizacion)}</strong></div>
        </div>
        <div class="list-status \${o.status}">\${label}</div>
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
      ? ` · ~\${(Number(readingRouteMeta.totalMeters)/1000).toFixed(1)} km`
      : '';
    sub.textContent = `Desde tu ubicación\${km}`;
  } else {
    title.textContent = 'Secuencia del listado';
    sub.textContent = 'Tocá “Desde aquí” para ordenarla por calles.';
  }
}

function readingGpsSets() {
  const cache = loadJson(GEO_KEY, {});
  const all = [...new Set(readingOrders.map(o => o.localizacion).filter(Boolean))];
  const reusable = [];
  const missing = [];

  for (const loc of all) {
    const g = cache[loc];
    if (g && g.status !== 'conflict' &&
        Number.isFinite(Number(g.lat)) && Number.isFinite(Number(g.lon))) {
      reusable.push(loc);
    } else {
      missing.push(loc);
    }
  }
  return {all, reusable, missing};
}

function renderLoadView() {
  const sets = readingGpsSets();
  document.getElementById('loadGpsTotal').textContent = sets.all.length;
  document.getElementById('loadGpsMemory').textContent = sets.reusable.length;
  document.getElementById('loadGpsMissing').textContent = sets.missing.length;
  renderReadingRouteHistory();
}

function parseReadingRouteText(raw) {
  const rows = [];
  const byLoc = new Map();
  const invalid = [];
  let duplicates = 0;

  String(raw || '').split(/\r?\n/).forEach((line, idx) => {
    const clean = line.trim();
    if (!clean) return;

    const locMatch = clean.match(/(?:^|\D)(\d{10})(?=\D|$)/);
    if (!locMatch) {
      invalid.push(idx + 1);
      return;
    }

    const loc = locMatch[1];
    const withoutLoc = clean.replace(loc, ' ');
    const nums = [...withoutLoc.matchAll(/(?:^|\D)(\d{4,8})(?=\D|$)/g)].map(m => m[1]);
    const meter = nums[0];

    if (!meter) {
      invalid.push(idx + 1);
      return;
    }

    if (byLoc.has(loc)) {
      if (byLoc.get(loc).medidor !== meter) {
        throw new Error(`Localización \${loc} aparece con dos medidores distintos.`);
      }
      duplicates++;
      return;
    }

    const row = {
      id: `read-\${loc}`,
      localizacion: loc,
      medidor: meter,
      status: 'pending',
      sequence: rows.length + 1,
      originalSequence: rows.length + 1,
      readAt: ''
    };
    byLoc.set(loc, row);
    rows.push(row);
  });

  if (invalid.length) {
    throw new Error(`No pude interpretar las filas: \${invalid.slice(0,10).join(', ')}\${invalid.length > 10 ? '…' : ''}. Usa una fila por Localización + Medidor.`);
  }
  if (!rows.length) throw new Error('No encontré ninguna Localización de 10 dígitos con su Medidor.');

  return {rows, duplicates};
}

function archiveCurrentRoute() {
  if (!readingOrders.length) return;
  const history = loadJson(READING_ROUTE_HISTORY_KEY, []);
  const snapshot = {
    routeInfo:{...readingRouteInfo},
    routeMeta:readingRouteMeta,
    orders:readingOrders.map(o => ({...o})),
    savedAt:new Date().toISOString()
  };

  const filtered = history.filter(item => item?.routeInfo?.routeId !== readingRouteInfo.routeId);
  filtered.unshift(snapshot);
  localStorage.setItem(READING_ROUTE_HISTORY_KEY, JSON.stringify(filtered.slice(0, 20)));
}

function loadNewReadingRoute() {
  const nameEl = document.getElementById('newRouteName');
  const dataEl = document.getElementById('newRouteData');
  const name = String(nameEl.value || '').trim();
  const raw = String(dataEl.value || '').trim();

  if (!name) {
    alert('Poné un nombre corto a la ruta.');
    return;
  }
  if (!raw) {
    alert('Pegá la lista de Localización + Medidor.');
    return;
  }

  try {
    const parsed = parseReadingRouteText(raw);
    archiveCurrentRoute();

    readingRouteInfo = {
      routeId:`reading-\${Date.now()}`,
      name,
      subtitle:'Lectura de medidores',
      date:localDateKey()
    };
    readingOrders = parsed.rows;
    readingRouteMeta = null;
    hydrateReadingGps();
    saveReadingState();
    renderAll();

    nameEl.value = '';
    dataEl.value = '';

    const sets = readingGpsSets();
    showReadingToast(
      `Ruta cargada: \${readingOrders.length} medidores · \${sets.reusable.length} GPS en memoria · \${sets.missing.length} faltan`
    );
    switchReadingTab('route', document.getElementById('tabRoute'));
  } catch (err) {
    alert('No cargué la ruta. ' + err.message);
  }
}

function parseReadingGps(raw) {
  const byLoc = new Map();
  const conflicts = new Set();
  let exactDuplicates = 0;

  function add(locRaw, latRaw, lonRaw, circuito = '') {
    const loc = String(locRaw || '').replace(/\D/g,'');
    const lat = Number(latRaw);
    const lon = Number(lonRaw);
    if (!/^\d{10}$/.test(loc)) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return;

    if (byLoc.has(loc)) {
      const old = byLoc.get(loc);
      if (Math.abs(old.lat - lat) < 0.000001 && Math.abs(old.lon - lon) < 0.000001) {
        exactDuplicates++;
      } else {
        conflicts.add(loc);
      }
      return;
    }
    byLoc.set(loc,{loc,lat,lon,circuito});
  }

  const locMatches = [...String(raw || '').matchAll(/Localizaci[oó]n\s*#?\s*(\d{10})/gi)];
  const coordMatches = [...String(raw || '').matchAll(/(?:[?&]ll=|[?&](?:q|query)=)([-+]?\d+(?:\.\d+)?),([-+]?\d+(?:\.\d+)?)/gi)];

  for (const lm of locMatches) {
    let cm = null;
    for (let i = coordMatches.length - 1; i >= 0; i--) {
      if (coordMatches[i].index <= lm.index && (lm.index - coordMatches[i].index) < 700) {
        cm = coordMatches[i];
        break;
      }
    }
    if (!cm) cm = coordMatches.find(m => m.index > lm.index && (m.index - lm.index) < 700) || null;
    if (!cm) continue;

    const tail = String(raw).slice(lm.index, Math.min(String(raw).length, lm.index + 240));
    const circ = tail.match(/en\s+(Circuito\s+[^\)\n\r]+)/i);
    add(lm[1], cm[1], cm[2], circ ? circ[1].trim() : '');
  }

  for (const line of String(raw || '').split(/\r?\n/)) {
    if (/Localizaci[oó]n/i.test(line)) continue;
    const m = line.match(/(?:^|\s)(\d{10})\s*[-=:,;\s]+\s*([-+]?\d{1,2}(?:\.\d+)?)\s*,\s*([-+]?\d{1,3}(?:\.\d+)?)(?:\s|$)/);
    if (m) add(m[1],m[2],m[3],'');
  }

  return {entries:[...byLoc.values()], conflicts:[...conflicts], exactDuplicates};
}

function copyReadingMissingGps() {
  const {missing} = readingGpsSets();
  if (!missing.length) {
    showReadingToast('Toda la ruta ya tiene GPS en memoria.');
    return;
  }
  const text = missing.map(loc => `gmaps\${loc}`).join('\n');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => showReadingToast(`Copiadas \${missing.length} Localizaciones faltantes.`))
      .catch(() => prompt('Copia las Localizaciones:', text));
  } else {
    prompt('Copia las Localizaciones:', text);
  }
}

function importReadingGps() {
  const input = document.getElementById('readingGpsInput');
  const raw = String(input.value || '').trim();
  if (!raw) {
    alert('Pegá las respuestas de Telegram o Localización + latitud,longitud.');
    return;
  }

  const parsed = parseReadingGps(raw);
  if (!parsed.entries.length) {
    alert('No encontré coordenadas válidas.');
    return;
  }
  if (parsed.conflicts.length) {
    alert('Hay Localizaciones repetidas con coordenadas diferentes:\n' + parsed.conflicts.join('\n'));
    return;
  }

  const current = new Set(readingOrders.map(o => o.localizacion));
  const cache = loadJson(GEO_KEY, {});
  const conflicts = [];
  let added = 0;
  let verified = 0;
  let outside = 0;
  const now = new Date().toISOString();

  for (const e of parsed.entries) {
    if (!current.has(e.loc)) {
      outside++;
      continue;
    }

    const old = cache[e.loc];
    if (old && Number.isFinite(Number(old.lat)) && Number.isFinite(Number(old.lon))) {
      const same = Math.abs(Number(old.lat) - e.lat) < 0.000001 &&
                   Math.abs(Number(old.lon) - e.lon) < 0.000001;
      if (!same) {
        old.status = 'conflict';
        old.conflictCandidate = {
          lat:e.lat, lon:e.lon, circuito:e.circuito || '',
          source:'ubiCNFL', detectedAt:now
        };
        conflicts.push(e.loc);
        continue;
      }
      old.lastVerifiedAt = now;
      old.status = 'valid';
      verified++;
      continue;
    }

    cache[e.loc] = {
      localizacion:e.loc,
      lat:e.lat,
      lon:e.lon,
      circuito:e.circuito || 'Circuito CNFL',
      source:'ubiCNFL',
      firstSeenAt:now,
      resolvedAt:now,
      lastVerifiedAt:now,
      lastUsedAt:now,
      useCount:1,
      status:'valid',
      wazeUrl:`https://www.waze.com/ul?ll=\${e.lat},\${e.lon}&navigate=yes`,
      mapsUrl:`https://www.google.com/maps/search/?api=1&query=\${e.lat},\${e.lon}`
    };
    added++;
  }

  localStorage.setItem(GEO_KEY, JSON.stringify(cache));
  hydrateReadingGps();
  saveReadingState();
  renderAll();
  input.value = '';

  if (conflicts.length) {
    alert(
      'No sobrescribí estas Localizaciones porque la memoria tiene otro GPS:\n' +
      conflicts.join('\n')
    );
    return;
  }

  const sets = readingGpsSets();
  showReadingToast(
    `GPS: \${added} nuevos · \${verified} verificados · \${sets.missing.length} faltan` +
    (outside ? ` · \${outside} fuera de ruta` : '')
  );
}

function renderReadingRouteHistory() {
  const el = document.getElementById('readingRouteHistory');
  if (!el) return;
  const history = loadJson(READING_ROUTE_HISTORY_KEY, []);

  if (!history.length) {
    el.innerHTML = '<div class="empty-history">Todavía no hay rutas anteriores guardadas.</div>';
    return;
  }

  el.innerHTML = history.slice(0, 10).map(item => {
    const info = item.routeInfo || {};
    const s = stats(item.orders || []);
    return `
      <div class="history-route-item">
        <div>
          <strong>\${escapeHtml(routeDisplayName(info))}</strong>
          <span>\${escapeHtml(info.date || '')} · \${s.total} medidores · \${s.read} leídos</span>
        </div>
        <button onclick="restoreReadingRoute('\${escapeHtml(info.routeId || '')}')">ABRIR</button>
      </div>`;
  }).join('');
}

function restoreReadingRoute(routeId) {
  const history = loadJson(READING_ROUTE_HISTORY_KEY, []);
  const target = history.find(item => item?.routeInfo?.routeId === routeId);
  if (!target) {
    alert('No encontré esa ruta en memoria.');
    return;
  }

  archiveCurrentRoute();
  readingRouteInfo = {...target.routeInfo};
  readingRouteMeta = target.routeMeta || null;
  readingOrders = (target.orders || []).map(o => ({...o}));
  hydrateReadingGps();
  saveReadingState();
  renderAll();
  switchReadingTab('route', document.getElementById('tabRoute'));
  showReadingToast(`\${routeDisplayName()} abierta desde memoria.`);
}

function renderAll() {
  hydrateReadingGps();
  renderRouteHeader();
  renderHeaderStats();
  renderCurrent();
  renderList();
  renderSummary();
  renderRouteMeta();
  renderLoadView();
  updateOnlineBadge();
  saveReadingState();
}

function switchReadingTab(tab, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-\${tab}`).classList.add('active');
  if (btn) btn.classList.add('active');
  if (tab === 'list') renderList();
  if (tab === 'summary') renderSummary();
  if (tab === 'load') renderLoadView();
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
  showReadingToast._t = setTimeout(() => el.classList.remove('show'), 2600);
}

function getCurrentPositionPromise() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Este dispositivo no ofrece geolocalización.'));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy:true,
      timeout:12000,
      maximumAge:15000
    });
  });
}

function routeCost(route, matrix) {
  if (!route.length) return 0;
  let total = Number(matrix[0][route[0]]) || 0;
  for (let i = 0; i < route.length - 1; i++) {
    total += Number(matrix[route[i]][route[i + 1]]) || 0;
  }
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
  if (pending.length > 90) {
    alert('Esta versión piloto admite hasta 90 pendientes para optimización vial.');
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
    const start = {lat:pos.coords.latitude, lon:pos.coords.longitude};
    const coords = [start, ...pending].map(p => `\${p.lon},\${p.lat}`).join(';');
    const url = `https://router.project-osrm.org/table/v1/driving/\${coords}?annotations=duration,distance`;
    const res = await fetch(url,{cache:'no-store'});
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

    const improved = improve2Opt(route,data.durations);
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
    routeDisplayName(),
    readingRouteInfo.subtitle || '',
    `Total: \${s.total}`,
    `Leídos: \${s.read}`,
    `No leídos: \${s.unread}`,
    `Pendientes: \${s.pending}`,
    '',
    'NO LEÍDOS:'
  ];

  const unread = readingOrders.filter(o => o.status === 'unread');
  if (!unread.length) lines.push('Ninguno');
  else unread.forEach(o => lines.push(`\${o.localizacion} · Medidor \${o.medidor}`));

  const text = lines.join('\n');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => showReadingToast('Resumen copiado.'));
  } else {
    prompt('Copia el resumen:',text);
  }
}

function resetReadingDay() {
  if (!confirm('¿Reiniciar esta jornada de lectura? La memoria GPS NO se borra.')) return;
  readingOrders = readingOrders
    .slice()
    .sort((a,b) => Number(a.originalSequence || 0) - Number(b.originalSequence || 0))
    .map((o,index) => ({
      ...o,
      status:'pending',
      readAt:'',
      sequence:index + 1
    }));
  readingRouteMeta = null;
  saveReadingState();
  renderAll();
  switchReadingTab('route', document.getElementById('tabRoute'));
  showReadingToast('Jornada reiniciada. La memoria GPS se conserva.');
}

document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  seedDefaultGeoMemory();
  loadReadingState();
  hydrateReadingGps();
  saveReadingState();
  renderAll();

  const sets = readingGpsSets();
  showReadingToast(
    `\${routeDisplayName()} · \${readingOrders.length} medidores · \${sets.reusable.length} GPS en memoria`
  );
});
