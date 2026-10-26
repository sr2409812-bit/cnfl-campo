const READING_MODE = /lectura-residencial\.html$/i.test(location.pathname) ? 'residencial' : 'demanda';
const READING_KEY = READING_MODE === 'residencial' ? 'cnfl_residential_reading_v1' : 'cnfl_reading_orders_v2';
const READING_HISTORY_KEY = READING_MODE === 'residencial' ? 'cnfl_residential_history_v1' : 'cnfl_reading_history_v1';
const READING_ROUTE_HISTORY_KEY = READING_MODE === 'residencial' ? 'cnfl_residential_routes_v1' : 'cnfl_reading_routes_v1';
const GEO_KEY = 'cnfl_geocache';

const DEFAULT_ROUTE_INFO = {
  routeId: 'reading-empty',
  name: READING_MODE === 'residencial' ? 'Lectura residencial' : 'Demanda',
  subtitle: 'Sin jornada cargada',
  date: ''
};

// Producción: no se publican ni precargan rutas reales dentro del código.
// Las jornadas se cargan desde PDF/texto y se conservan en el dispositivo.
const DEFAULT_ORDERS = [];

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
  return `${y}-${m}-${day}`;
}

function routeDisplayName(info = readingRouteInfo) {
  const name = String(info?.name || 'Ruta de lectura').trim();
  return /^ruta\s/i.test(name) ? name : `Ruta ${name}`;
}

function routeDateLabel(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return {top:'--', year:'----'};
  const months = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SET','OCT','NOV','DIC'];
  return {top:`${m[3]} ${months[Number(m[2])-1]}`, year:m[1]};
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

  // La jornada activa también queda reflejada en "Rutas recientes".
  // Así una carga directa desde PDF no depende de cargar otra ruta para guardarse.
  if (
    readingOrders.length &&
    readingRouteInfo &&
    readingRouteInfo.routeId &&
    readingRouteInfo.routeId !== 'reading-empty'
  ) {
    archiveCurrentRoute();
  }
}

function migrateOldReadingState() {
  if (READING_MODE === 'residencial') return null;
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
    readingOrders = [];
    readingRouteInfo = {
      routeId:'reading-empty',
      name:READING_MODE === 'residencial' ? 'Lectura residencial' : 'Demanda',
      subtitle:'Sin jornada cargada',
      date:localDateKey()
    };
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
        wazeUrl: `https://www.waze.com/ul?ll=${row.lat},${row.lon}&navigate=yes`,
        mapsUrl: `https://www.google.com/maps/search/?api=1&query=${row.lat},${row.lon}`
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
  document.getElementById('activeRouteDate').innerHTML = `${d.top}<br><strong>${d.year}</strong>`;
}

function renderHeaderStats() {
  const s = stats();
  document.getElementById('statTotal').textContent = s.total;
  document.getElementById('statPending').textContent = s.pending;
  document.getElementById('statRead').textContent = s.read;
  document.getElementById('progressBar').style.width = `${s.total ? ((s.done / s.total) * 100).toFixed(1) : 0}%`;
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
        <p>${s.read} visitados · ${s.unread} no visitados</p>
      </div>`;
    nextContainer.innerHTML = '';
    return;
  }

  const current = pending[0];
  const gps = gpsLabel(current);
  const gpsOk = current.gpsStatus !== 'conflict' &&
    Number.isFinite(Number(current.lat)) && Number.isFinite(Number(current.lon));
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
            <i class="fa-solid fa-check"></i> MARCAR VISITADO
          </button>
        </div>
        <div class="secondary-actions">
          <button class="btn-secondary" onclick="markCurrentReading('unread')">
            <i class="fa-solid fa-xmark"></i> NO VISITADO
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
  showReadingToast(status === 'read'
    ? `Medidor ${current.medidor} visitado · siguiente`
    : `Medidor ${current.medidor} queda pendiente`);
}

function archiveReadingEvent(order) {
  const event = {
    routeId: readingRouteInfo.routeId,
    route: readingRouteInfo.name,
    localizacion: order.localizacion,
    medidor: order.medidor,
    lectura: String(order.lectura || ''),
    status: order.status,
    at: order.readAt || new Date().toISOString()
  };
  const history = loadJson(READING_HISTORY_KEY, []);
  history.unshift(event);
  localStorage.setItem(READING_HISTORY_KEY, JSON.stringify(history.slice(0, 1500)));

  if (window.CNFLStore && typeof window.CNFLStore.putRecord === 'function') {
    const id = [event.routeId,event.localizacion,event.medidor,event.at].join('|');
    window.CNFLStore.putRecord(READING_MODE === 'residencial' ? 'residential-reading-events' : 'reading-events', id, event).catch(() => {});
  }
}

function renderList() {
  const q = readingSearch.trim().toLowerCase();
  const rows = readingOrders.filter(o =>
    !q || String(o.medidor).includes(q) || String(o.localizacion).includes(q)
  );

  document.getElementById('readingList').innerHTML = rows.map(o => {
    const label = o.status === 'read' ? 'VISITADO' : (o.status === 'unread' ? 'NO VISITADO' : 'PENDIENTE');
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
  const totalEl = document.getElementById('sumTotal');
  const readEl = document.getElementById('sumRead');
  const pendingEl = document.getElementById('sumPending');
  if (totalEl) totalEl.textContent = s.total;
  if (readEl) readEl.textContent = s.read;
  if (pendingEl) pendingEl.textContent = s.pending;

  const cache = loadJson(GEO_KEY, {});
  const count = Object.values(cache).filter(g =>
    g && Number.isFinite(Number(g.lat)) && Number.isFinite(Number(g.lon)) && g.status !== 'conflict'
  ).length;
  const gpsEl = document.getElementById('gpsMemoryCount');
  if (gpsEl) gpsEl.textContent = count;
}

function renderRouteMeta() {
  const title = document.getElementById('routeEngineLabel');
  const sub = document.getElementById('routeEngineSub');
  if (readingRouteMeta && readingRouteMeta.engine === 'osrm-road-network') {
    const km = Number.isFinite(Number(readingRouteMeta.totalMeters))
      ? ` · ~${(Number(readingRouteMeta.totalMeters)/1000).toFixed(1)} km`
      : '';
    const crossings = Number(readingRouteMeta.crossings || 0);
    const delta = Number(readingRouteMeta.roadCostDeltaPct || 0);
    title.textContent = crossings === 0 ? 'Ruta limpia · sin cruces' : 'Ruta vial calculada';
    sub.textContent = `Desde tu ubicación${km} · ${crossings} cruces · +${delta.toFixed(1)}% vs mínima distancia`;
  } else {
    title.textContent = 'Secuencia del listado';
    sub.textContent = 'Tocá “Desde aquí” para buscar una ruta continua y sin devolverse.';
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
  renderLoadedReadingGroups();
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
        throw new Error(`Localización ${loc} aparece con dos medidores distintos.`);
      }
      duplicates++;
      return;
    }

    const row = {
      id: `read-${loc}`,
      localizacion: loc,
      medidor: meter,
      status: 'pending',
      lectura: '',
      sequence: rows.length + 1,
      originalSequence: rows.length + 1,
      readAt: ''
    };
    byLoc.set(loc, row);
    rows.push(row);
  });

  if (invalid.length) {
    throw new Error(`No pude interpretar las filas: ${invalid.slice(0,10).join(', ')}${invalid.length > 10 ? '…' : ''}. Usa una fila por Localización + Medidor.`);
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

  if (window.CNFLStore && typeof window.CNFLStore.putRecord === 'function') {
    const id = String(readingRouteInfo.routeId || 'route') + '|latest';
    window.CNFLStore.putRecord(READING_MODE === 'residencial' ? 'residential-reading-routes' : 'reading-routes', id, snapshot).catch(() => {});
  }
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
      routeId:`reading-${Date.now()}`,
      name,
      subtitle:READING_MODE === 'residencial' ? 'Lectura residencial' : 'Lectura de demanda',
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
      `Ruta cargada: ${readingOrders.length} medidores · ${sets.reusable.length} GPS en memoria · ${sets.missing.length} faltan`
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
  const text = missing.map(loc => `gmaps${loc}`).join('\n');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => showReadingToast(`Copiadas ${missing.length} Localizaciones faltantes.`))
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
      wazeUrl:`https://www.waze.com/ul?ll=${e.lat},${e.lon}&navigate=yes`,
      mapsUrl:`https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lon}`
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
    `GPS: ${added} nuevos · ${verified} verificados · ${sets.missing.length} faltan` +
    (outside ? ` · ${outside} fuera de ruta` : '')
  );
}

function readingGroupSort(a,b) {
  const ma = String(a || '').match(/(\d{4})-(\d+)/);
  const mb = String(b || '').match(/(\d{4})-(\d+)/);
  if (ma && mb) return Number(ma[1]) - Number(mb[1]) || Number(ma[2]) - Number(mb[2]);
  if (ma) return -1;
  if (mb) return 1;
  return String(a || '').localeCompare(String(b || ''));
}

function renderLoadedReadingGroups() {
  const el = document.getElementById('readingLoadedGroups');
  const card = document.getElementById('readingGroupsCard');
  if (!el) return;

  if (READING_MODE !== 'residencial' || !readingOrders.length) {
    el.innerHTML = '';
    if (card) card.style.display = 'none';
    return;
  }

  const groups = new Map();
  for (const order of readingOrders) {
    const key = String(order.sourceRoute || 'SIN RUTA');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(order);
  }

  const rows = [...groups.entries()].sort((a,b)=>readingGroupSort(a[0],b[0]));
  if (card) card.style.display = 'block';

  el.innerHTML = rows.map(([route, orders]) => {
    const read = orders.filter(o => o.status === 'read').length;
    return '<div class="loaded-route-group">' +
      '<div><strong>Ruta ' + escapeHtml(route) + '</strong>' +
      '<span>' + orders.length + ' medidores · ' + read + ' visitados</span></div>' +
      '<button onclick="deleteLoadedReadingGroup(\'' + escapeHtml(route) + '\')">' +
      '<i class="fa-solid fa-trash"></i> BORRAR</button></div>';
  }).join('');
}

function deleteLoadedReadingGroup(routeLabel) {
  const route = String(routeLabel || '');
  const affected = readingOrders.filter(o => String(o.sourceRoute || 'SIN RUTA') === route);
  if (!affected.length) return;

  const withVisits = affected.filter(o => o.status === 'read').length;
  const warning = withVisits
    ? ' También se quitarán ' + withVisits + ' visitas marcadas de esa ruta.'
    : '';

  if (!confirm('¿Borrar la ruta ' + route + ' de esta jornada?' + warning + ' La memoria GPS NO se borra.')) return;

  const removedLocs = new Set(affected.map(o => String(o.localizacion)));
  readingOrders = readingOrders.filter(o => !removedLocs.has(String(o.localizacion)));

  if (!readingOrders.length) {
    clearActiveReadingRoute();
  } else {
    const routes = [...new Set(readingOrders.map(o => String(o.sourceRoute || '')).filter(Boolean))].sort(readingGroupSort);
    readingOrders = readingOrders.map((o,index)=>({...o,sequence:index + 1,originalSequence:index + 1}));
    readingRouteInfo.name = 'Lectura residencial · ' + routes.length + (routes.length === 1 ? ' ruta' : ' rutas');
    readingRouteInfo.subtitle = routes.join(' · ');
    readingRouteInfo.sourceRoutes = routes;
    readingRouteMeta = null;
    saveReadingState();
    renderAll();
  }

  showReadingToast('Ruta ' + route + ' borrada. La memoria GPS se conserva.');
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
          <strong>${escapeHtml(routeDisplayName(info))}</strong>
          <span>${escapeHtml(info.date || '')} · ${s.total} medidores · ${s.read} visitados</span>
        </div>
        <div class="history-route-actions">
          <button onclick="restoreReadingRoute('${escapeHtml(info.routeId || '')}')">ABRIR</button>
          <button class="history-delete" onclick="deleteReadingRoute('${escapeHtml(info.routeId || '')}')">BORRAR</button>
        </div>
      </div>`;
  }).join('');
}

function cleanupReadingRouteRecords(routeId) {
  if (!routeId || !window.CNFLStore || typeof window.CNFLStore.deleteRecordsByPrefix !== 'function') return;
  const routeNamespace = READING_MODE === 'residencial' ? 'residential-reading-routes' : 'reading-routes';
  const eventNamespace = READING_MODE === 'residencial' ? 'residential-reading-events' : 'reading-events';
  window.CNFLStore.deleteRecordsByPrefix(routeNamespace, String(routeId) + '|').catch(() => {});
  window.CNFLStore.deleteRecordsByPrefix(eventNamespace, String(routeId) + '|').catch(() => {});
  window.CNFLStore.deleteRecordsByPrefix('meter-readings', String(routeId) + '|').catch(() => {});
}

function clearActiveReadingRoute() {
  const oldRouteId = readingRouteInfo && readingRouteInfo.routeId ? String(readingRouteInfo.routeId) : '';
  readingOrders = [];
  readingRouteMeta = null;
  readingRouteInfo = {...DEFAULT_ROUTE_INFO, date: localDateKey()};
  saveReadingState();
  renderAll();
  switchReadingTab('load', document.getElementById('tabLoad'));
  return oldRouteId;
}

function deleteReadingRoute(routeId) {
  const id = String(routeId || '');
  if (!id) return;
  const history = loadJson(READING_ROUTE_HISTORY_KEY, []);
  const target = history.find(item => item && item.routeInfo && item.routeInfo.routeId === id);
  const label = target ? routeDisplayName(target.routeInfo) : 'esta ruta';
  if (!confirm('¿Borrar ' + label + '? Se eliminará la ruta guardada y su progreso asociado en este dispositivo.')) return;
  const filtered = history.filter(item => !(item && item.routeInfo && item.routeInfo.routeId === id));
  localStorage.setItem(READING_ROUTE_HISTORY_KEY, JSON.stringify(filtered));
  if (readingRouteInfo && readingRouteInfo.routeId === id) clearActiveReadingRoute();
  else renderReadingRouteHistory();
  cleanupReadingRouteRecords(id);
  showReadingToast('Ruta borrada.');
}

function deleteCurrentReadingRoute() {
  if (!readingOrders.length) {
    showReadingToast('No hay una jornada activa para borrar.');
    return;
  }
  const id = String((readingRouteInfo && readingRouteInfo.routeId) || '');
  const label = routeDisplayName();
  if (!confirm('¿Borrar la jornada activa ' + label + '? Se eliminará su progreso. La memoria GPS NO se borra.')) return;
  const history = loadJson(READING_ROUTE_HISTORY_KEY, []);
  localStorage.setItem(READING_ROUTE_HISTORY_KEY, JSON.stringify(history.filter(item => !(item && item.routeInfo && item.routeInfo.routeId === id))));
  clearActiveReadingRoute();
  cleanupReadingRouteRecords(id);
  showReadingToast('Jornada activa borrada. La memoria GPS se conserva.');
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
  showReadingToast(`${routeDisplayName()} abierta desde memoria.`);
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
  document.getElementById(`view-${tab}`).classList.add('active');
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
  const first = matrix?.[0]?.[route[0]];
  if (first === null || !Number.isFinite(Number(first))) return Infinity;
  let total = Number(first);

  for (let i = 0; i < route.length - 1; i++) {
    const raw = matrix?.[route[i]]?.[route[i + 1]];
    if (raw === null || !Number.isFinite(Number(raw))) return Infinity;
    total += Number(raw);
  }
  return total;
}

function readingMatrixUsable(matrix, size) {
  return Array.isArray(matrix) &&
    matrix.length === size &&
    matrix.every(row => Array.isArray(row) && row.length === size);
}

function nearestReadingRoute(matrix, indices, forcedFirst = null) {
  const left = new Set(indices);
  const route = [];
  let current = 0;

  if (forcedFirst !== null && left.has(forcedFirst)) {
    const v = matrix?.[0]?.[forcedFirst];
    if (v !== null && Number.isFinite(Number(v))) {
      route.push(forcedFirst);
      left.delete(forcedFirst);
      current = forcedFirst;
    }
  }

  while (left.size) {
    let best = null;
    let bestCost = Infinity;
    for (const idx of left) {
      const raw = matrix?.[current]?.[idx];
      if (raw === null || !Number.isFinite(Number(raw))) continue;
      const cost = Number(raw);
      if (cost < bestCost) {
        best = idx;
        bestCost = cost;
      }
    }
    if (best === null) throw new Error('Hay una parada sin conexión vial calculable.');
    route.push(best);
    left.delete(best);
    current = best;
  }
  return route;
}

function improveReadingRoute(route, matrix) {
  let best = route.slice();
  let bestCost = routeCost(best, matrix);

  for (let pass = 0; pass < 24; pass++) {
    let winner = null;
    let winnerCost = bestCost;

    // 2-opt: elimina cruces/regresos.
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1)
        ];
        const cost = routeCost(candidate, matrix);
        if (cost + 0.5 < winnerCost) {
          winner = candidate;
          winnerCost = cost;
        }
      }
    }

    // Relocate: mueve una parada mal colocada.
    for (let i = 0; i < best.length; i++) {
      const reduced = best.slice();
      const moved = reduced.splice(i, 1)[0];
      for (let j = 0; j <= reduced.length; j++) {
        const candidate = [...reduced.slice(0, j), moved, ...reduced.slice(j)];
        const cost = routeCost(candidate, matrix);
        if (cost + 0.5 < winnerCost) {
          winner = candidate;
          winnerCost = cost;
        }
      }
    }

    // Swap: corrige pares cruzados.
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = best.slice();
        [candidate[i], candidate[j]] = [candidate[j], candidate[i]];
        const cost = routeCost(candidate, matrix);
        if (cost + 0.5 < winnerCost) {
          winner = candidate;
          winnerCost = cost;
        }
      }
    }

    if (!winner) break;
    best = winner;
    bestCost = winnerCost;
  }

  return {route:best,cost:bestCost};
}


function readingGeoPoint(index, start, pending) {
  return index === 0 ? start : pending[index - 1];
}

function readingAirDistance(a, b) {
  const toRad = v => Number(v) * Math.PI / 180;
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const dLat = lat2 - lat1;
  const dLon = toRad(b.lon) - toRad(a.lon);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function geoNearestReadingRoute(start, pending) {
  const left = new Set(Array.from({length:pending.length}, (_,i) => i + 1));
  const route = [];
  let current = 0;
  while (left.size) {
    const from = readingGeoPoint(current, start, pending);
    let best = null;
    let bestDistance = Infinity;
    for (const idx of left) {
      const d = readingAirDistance(from, readingGeoPoint(idx, start, pending));
      if (d < bestDistance) {
        best = idx;
        bestDistance = d;
      }
    }
    route.push(best);
    left.delete(best);
    current = best;
  }
  return route;
}

function readingOrientation(a, b, c) {
  const ax = Number(a.lon), ay = Number(a.lat);
  const bx = Number(b.lon), by = Number(b.lat);
  const cx = Number(c.lon), cy = Number(c.lat);
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function readingSegmentsCross(a, b, c, d) {
  const o1 = readingOrientation(a,b,c);
  const o2 = readingOrientation(a,b,d);
  const o3 = readingOrientation(c,d,a);
  const o4 = readingOrientation(c,d,b);
  return ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) &&
         ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0));
}

function readingTurnAngle(a, b, c) {
  const v1x = Number(a.lon) - Number(b.lon);
  const v1y = Number(a.lat) - Number(b.lat);
  const v2x = Number(c.lon) - Number(b.lon);
  const v2y = Number(c.lat) - Number(b.lat);
  const n1 = Math.hypot(v1x,v1y), n2 = Math.hypot(v2x,v2y);
  if (!n1 || !n2) return 0;
  const cos = Math.max(-1, Math.min(1, (v1x*v2x + v1y*v2y) / (n1*n2)));
  // 180 = seguir recto; 0 = devolverse.
  return Math.acos(cos) * 180 / Math.PI;
}

function routeShapeStats(route, start, pending) {
  const path = [0, ...route];
  let crossings = 0;
  let backtracks = 0;
  let airMeters = 0;

  for (let i = 0; i < path.length - 1; i++) {
    airMeters += readingAirDistance(
      readingGeoPoint(path[i], start, pending),
      readingGeoPoint(path[i + 1], start, pending)
    );
  }

  for (let i = 0; i < path.length - 3; i++) {
    const a = readingGeoPoint(path[i], start, pending);
    const b = readingGeoPoint(path[i + 1], start, pending);
    for (let j = i + 2; j < path.length - 1; j++) {
      const c = readingGeoPoint(path[j], start, pending);
      const d = readingGeoPoint(path[j + 1], start, pending);
      if (readingSegmentsCross(a,b,c,d)) crossings++;
    }
  }

  for (let i = 1; i < path.length - 1; i++) {
    const angle = readingTurnAngle(
      readingGeoPoint(path[i - 1], start, pending),
      readingGeoPoint(path[i], start, pending),
      readingGeoPoint(path[i + 1], start, pending)
    );
    if (angle < 55) backtracks++;
  }

  return {crossings, backtracks, airMeters};
}

function uncrossReadingRoute(route, start, pending) {
  let best = route.slice();

  // Geometric 2-opt: each accepted reversal removes at least one visual crossing.
  for (let pass = 0; pass < 20; pass++) {
    const path = [0, ...best];
    let changed = false;

    outer:
    for (let i = 0; i < path.length - 3; i++) {
      const a = readingGeoPoint(path[i], start, pending);
      const b = readingGeoPoint(path[i + 1], start, pending);

      for (let j = i + 2; j < path.length - 1; j++) {
        const c = readingGeoPoint(path[j], start, pending);
        const d = readingGeoPoint(path[j + 1], start, pending);

        if (!readingSegmentsCross(a,b,c,d)) continue;

        best = [
          ...best.slice(0, i),
          ...best.slice(i, j).reverse(),
          ...best.slice(j)
        ];
        changed = true;
        break outer;
      }
    }

    if (!changed) break;
  }

  return best;
}

function cleanReadingRouteWithinBudget(route, matrix, start, pending, maxCost) {
  let best = route.slice();
  let bestStats = routeShapeStats(best, start, pending);
  let bestCost = routeCost(best, matrix);

  for (let pass = 0; pass < 12 && bestStats.crossings > 0; pass++) {
    const path = [0, ...best];
    let winner = null;

    for (let i = 0; i < path.length - 3; i++) {
      const a = readingGeoPoint(path[i], start, pending);
      const b = readingGeoPoint(path[i + 1], start, pending);

      for (let j = i + 2; j < path.length - 1; j++) {
        const c = readingGeoPoint(path[j], start, pending);
        const d = readingGeoPoint(path[j + 1], start, pending);
        if (!readingSegmentsCross(a,b,c,d)) continue;

        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, j).reverse(),
          ...best.slice(j)
        ];
        const cost = routeCost(candidate, matrix);
        if (!Number.isFinite(cost) || cost > maxCost) continue;

        const stats = routeShapeStats(candidate, start, pending);
        if (stats.crossings >= bestStats.crossings) continue;

        if (!winner ||
            stats.crossings < winner.stats.crossings ||
            (stats.crossings === winner.stats.crossings && cost < winner.cost)) {
          winner = {route:candidate, cost, stats};
        }
      }
    }

    if (!winner) break;
    best = winner.route;
    bestCost = winner.cost;
    bestStats = winner.stats;
  }

  return {route:best, cost:bestCost, stats:bestStats};
}

function dedupeReadingCandidates(candidates) {
  const seen = new Set();
  return candidates.filter(c => {
    const key = c.route.join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
    const coords = [start, ...pending].map(p => `${p.lon},${p.lat}`).join(';');
    const url = `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration,distance`;
    const res = await fetch(url,{cache:'no-store'});
    if (!res.ok) throw new Error('El motor vial no respondió.');

    const data = await res.json();
    if (!data.durations || data.code !== 'Ok') throw new Error('El motor vial no devolvió una matriz válida.');

    const n = pending.length;
    const size = n + 1;
    if (!readingMatrixUsable(data.durations, size)) {
      throw new Error('La matriz vial de tiempos está incompleta.');
    }

    // Para reducir vueltas se prioriza distancia real por calles.
    // Si OSRM no devuelve distancias completas, se usa tiempo vial.
    const objective = readingMatrixUsable(data.distances, size)
      ? data.distances
      : data.durations;

    const indices = Array.from({length:n}, (_,i) => i + 1);
    const candidates = [];

    const base = improveReadingRoute(nearestReadingRoute(objective, indices), objective);
    base.duration = routeCost(base.route, data.durations);
    candidates.push(base);

    // Jornadas pequeñas: probar cada primera parada.
    // Jornadas grandes: probar las 12 mejores candidatas iniciales.
    const seeds = n <= 24
      ? indices
      : indices
          .slice()
          .sort((a,b) => Number(objective[0][a]) - Number(objective[0][b]))
          .slice(0,12);

    for (const first of seeds) {
      const candidate = improveReadingRoute(
        nearestReadingRoute(objective, indices, first),
        objective
      );
      candidate.duration = routeCost(candidate.route, data.durations);
      candidates.push(candidate);
    }

    // Candidato geográfico: une los puntos como una sola línea limpia
    // antes de compararlo contra la distancia real por calles.
    const geoRoute = uncrossReadingRoute(
      geoNearestReadingRoute(start, pending),
      start,
      pending
    );
    const geoCost = routeCost(geoRoute, objective);
    if (Number.isFinite(geoCost)) {
      candidates.push({
        route: geoRoute,
        cost: geoCost,
        duration: routeCost(geoRoute, data.durations)
      });
    }

    let uniqueCandidates = dedupeReadingCandidates(candidates)
      .filter(c => Number.isFinite(c.cost));

    uniqueCandidates.sort((a,b) => a.cost - b.cost);
    const bestRoadCost = uniqueCandidates[0].cost;

    // Permitimos una pequeña diferencia de distancia si con eso la ruta
    // queda mucho más continua y sin cruces visuales.
    const cleanBudget = bestRoadCost * 1.08;

    const cleaned = uniqueCandidates
      .slice(0, Math.min(6, uniqueCandidates.length))
      .map(c => {
        const r = cleanReadingRouteWithinBudget(
          c.route,
          objective,
          start,
          pending,
          cleanBudget
        );
        return {
          route: r.route,
          cost: r.cost,
          duration: routeCost(r.route, data.durations),
          shape: r.stats
        };
      });

    uniqueCandidates = dedupeReadingCandidates([
      ...uniqueCandidates.map(c => ({
        ...c,
        shape: routeShapeStats(c.route, start, pending)
      })),
      ...cleaned
    ]).filter(c => Number.isFinite(c.cost));

    const nearBest = uniqueCandidates.filter(c => c.cost <= cleanBudget);
    const pool = nearBest.length ? nearBest : uniqueCandidates;

    pool.sort((a,b) => {
      const ac = a.shape?.crossings ?? Infinity;
      const bc = b.shape?.crossings ?? Infinity;
      if (ac !== bc) return ac - bc;

      const ab = a.shape?.backtracks ?? Infinity;
      const bb = b.shape?.backtracks ?? Infinity;
      if (ab !== bb) return ab - bb;

      const delta = a.cost - b.cost;
      if (Math.abs(delta) > 25) return delta;
      return (a.duration || Infinity) - (b.duration || Infinity);
    });

    const chosen = pool[0];
    const improved = chosen.route;
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
      totalMeters,
      crossings: chosen.shape?.crossings ?? 0,
      backtracks: chosen.shape?.backtracks ?? 0,
      roadCostDeltaPct: bestRoadCost > 0
        ? Number((((chosen.cost / bestRoadCost) - 1) * 100).toFixed(1))
        : 0
    };

    saveReadingState();
    renderAll();
    showReadingToast(
      'Ruta limpia calculada · ' +
      (readingRouteMeta.crossings || 0) + ' cruces · ' +
      (readingRouteMeta.roadCostDeltaPct || 0) + '% vs. mínima distancia'
    );
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
    `Total: ${s.total}`,
    `Visitados: ${s.read}`,
    `No visitados: ${s.unread}`,
    `Pendientes: ${s.pending}`,
    '',
    'NO VISITADOS:'
  ];

  const unread = readingOrders.filter(o => o.status === 'unread');
  if (!unread.length) lines.push('Ninguno');
  else unread.forEach(o => lines.push(`${o.localizacion} · Medidor ${o.medidor}`));

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

  loadReadingState();
  hydrateReadingGps();
  saveReadingState();
  renderAll();

  const sets = readingGpsSets();
  showReadingToast(
    `${routeDisplayName()} · ${readingOrders.length} medidores · ${sets.reusable.length} GPS en memoria`
  );
});
