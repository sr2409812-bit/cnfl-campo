// =========================================================
// COMPAÑÍA NACIONAL DE FUERZA Y LUZ (CNFL)
// Motor Técnico de Cuadrilla: Ruta TSP, Filtros Dinámicos,
// Registro de Lecturas/Sellos/Obs y Liquidación Formal
// =========================================================

let workOrders = [];
let activeFilter = 'pending'; // Por defecto se muestran SOLO las PENDIENTES
let searchQuery = '';
let geoCache = {};
const expandedFields = {};
const CNFL_PDF_PARSER_VERSION = 6;
let cnflPdfBatchStale = false;
function cnflManualPlan(){
  try{
    const keys=JSON.parse(localStorage.getItem('cnfl_manual_route_v1')||'[]');
    return window.CNFLCutsManualOrder.arrange(workOrders,keys);
  }catch(_){return {orders:workOrders,chosen:0,pending:workOrders.filter(o=>o.status==='pending').length};}
}

function cnflRefreshOrdersFromStorage(){
  try{const saved=JSON.parse(localStorage.getItem('cnfl_work_orders')||'[]');if(Array.isArray(saved))workOrders=saved;}catch(_){}
  renderOrders();updateLiquidation();
}

function openCutsMap(){
  window.cnflOpenSharedMap?.('cortes');
}
function cnflOpenCutFromMap(loc){
  if(!/^\d{1,20}$/.test(String(loc)))return;
  cnflRefreshOrdersFromStorage();
  const order=workOrders.find(o=>String(o.localizacion||'').replace(/\D/g,'')===loc);
  switchTab('ruta',document.querySelector('.bottom-nav .nav-tab-btn'));
  setRouteFilter(order&&order.status!=='pending'?'all':'pending',document.getElementById(order&&order.status!=='pending'?'btnFilterAll':'btnFilterPending'));
  searchQuery=loc;
  const search=document.getElementById('orderSearchInput');if(search)search.value=loc;
  renderOrders();
  document.getElementById('ordersListContainer')?.scrollIntoView({behavior:'smooth',block:'start'});
}
window.cnflApplyFieldRoute=cnflRefreshOrdersFromStorage;
window.cnflFocusWorkFromMap=cnflOpenCutFromMap;
addEventListener('storage',event=>{
  if(event.key==='cnfl_manual_route_v1'||event.key==='cnfl_work_orders')cnflRefreshOrdersFromStorage();
});
addEventListener('pageshow',event=>{if(event.persisted)cnflRefreshOrdersFromStorage();});

const CNFL_HISTORY_KEY = 'cnfl_order_history_v1';
const CNFL_HISTORY_DAYS = 14;
const CNFL_HISTORY_MAX = 1200;

function cnflLocalDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function cnflDateFromPdfText(rawText) {
  const m = String(rawText || '').match(/Fecha\s+Desde:\s*(\d{2})-(\d{2})-(\d{4})/i);
  if (!m) return cnflLocalDateKey();
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function cnflHistoryLoad() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CNFL_HISTORY_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    const obsolete = parsed.some(o => o && (Object.hasOwn(o,'monto') || Object.hasOwn(o,'status')));
    if (!obsolete) return parsed;
    const clean = parsed.map(o => {
      if (!o || typeof o !== 'object') return o;
      const {monto, status, ...record} = o;
      return record;
    });
    try { localStorage.setItem(CNFL_HISTORY_KEY, JSON.stringify(clean)); } catch (_) {}
    return clean;
  } catch (e) {
    return [];
  }
}

function cnflHistoryKey(o) {
  const date = String(o._journeyDate || o.historyDate || cnflLocalDateKey());
  const order = String(o.orden || '').replace(/\D/g, '');
  const loc = String(o.localizacion || '').replace(/\D/g, '');
  const meter = String(o.medidor || o.meter || '').replace(/\D/g, '');
  return `${date}|${order}|${loc}|${meter}`;
}

function cnflCompactHistoryOrder(o, fallbackDate) {
  return {
    historyDate: String(o._journeyDate || o.historyDate || fallbackDate || cnflLocalDateKey()),
    orden: String(o.orden || ''),
    localizacion: String(o.localizacion || ''),
    nis: String(o.nis || ''),
    medidor: String(o.medidor || o.meter || ''),
    cliente: String(o.cliente || o.client || ''),
    direccion: String(o.direccion || o.address || ''),
    pendientes: String(o.pendientes || ''),
    plan: String(o.plan || ''),
    lectura: String(o.lectura || ''),
    sello_instalado: String(o.sello_instalado || ''),
    sello_retirado: String(o.sello_retirado || ''),
    observaciones: String(o.observaciones || ''),
    circuito: String(o.circuito || ''),
    lat: Number.isFinite(Number(o.lat)) ? Number(o.lat) : null,
    lon: Number.isFinite(Number(o.lon)) ? Number(o.lon) : null,
    savedAt: Date.now()
  };
}

function cnflHistoryPrune(items) {
  const cutoff = new Date();
  cutoff.setHours(0,0,0,0);
  cutoff.setDate(cutoff.getDate() - CNFL_HISTORY_DAYS);

  return (items || [])
    .filter(o => {
      const d = /^\d{4}-\d{2}-\d{2}$/.test(String(o.historyDate || ''))
        ? new Date(`${o.historyDate}T12:00:00`)
        : new Date(Number(o.savedAt) || Date.now());
      return d >= cutoff;
    })
    .sort((a,b) => Number(b.savedAt || 0) - Number(a.savedAt || 0))
    .slice(0, CNFL_HISTORY_MAX);
}

function archiveOrdersToHistory(orders, fallbackDate) {
  if (!Array.isArray(orders) || orders.length === 0) return 0;

  const map = new Map(cnflHistoryLoad().map(o => [cnflHistoryKey(o), o]));
  for (const raw of orders) {
    const item = cnflCompactHistoryOrder(raw, fallbackDate);
    const key = cnflHistoryKey(item);
    map.set(key, item);
    if (window.CNFLStore && typeof window.CNFLStore.putRecord === 'function') {
      window.CNFLStore.putRecord('cuts-history', key, item).catch(() => {});
    }
  }

  const finalItems = cnflHistoryPrune([...map.values()]);
  localStorage.setItem(CNFL_HISTORY_KEY, JSON.stringify(finalItems));
  return finalItems.length;
}

function cnflEscapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}

function cnflHistoryDisplayDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : (iso || 'Fecha no disponible');
}

function renderOrderHistory(query = '') {
  const container = document.getElementById('historyResults');
  const countEl = document.getElementById('historyCount');
  if (!container) return;

  const q = String(query || '').trim().toLowerCase();
  let items = cnflHistoryLoad();

  // Incluir la bandeja activa aunque todavía no se haya archivado.
  const active = (workOrders || []).map(o => cnflCompactHistoryOrder(o, o._journeyDate || cnflLocalDateKey()));
  const map = new Map(items.map(o => [cnflHistoryKey(o), o]));
  for (const a of active) map.set(cnflHistoryKey(a), a);
  items = [...map.values()];

  if (q) {
    items = items.filter(o => [
      o.orden, o.localizacion, o.nis, o.medidor, o.cliente,
      o.direccion, o.observaciones, o.circuito
    ].some(v => String(v || '').toLowerCase().includes(q)));
  }

  items.sort((a,b) => {
    const d = String(b.historyDate || '').localeCompare(String(a.historyDate || ''));
    return d || String(b.orden || '').localeCompare(String(a.orden || ''));
  });

  if (countEl) countEl.innerText = `${items.length} registro${items.length === 1 ? '' : 's'} · últimos ${CNFL_HISTORY_DAYS} días`;

  if (!items.length) {
    container.innerHTML = '<div class="card-panel" style="text-align:center;color:var(--text-muted)">No encontré órdenes en la memoria reciente.</div>';
    return;
  }

  container.innerHTML = items.slice(0, 120).map(o => {
    const locKey = String(o.localizacion || '').replace(/\D/g, '');
    const memoryGeo = (typeof geoCache !== 'undefined' && geoCache && geoCache[locKey]) ? geoCache[locKey] : null;
    const hasGps = (memoryGeo && Number.isFinite(Number(memoryGeo.lat)) && Number.isFinite(Number(memoryGeo.lon))) ||
      (Number.isFinite(Number(o.lat)) && Number.isFinite(Number(o.lon)));
    const gpsSource = memoryGeo
      ? (typeof cnflGeoSourceLabel === 'function' ? cnflGeoSourceLabel(memoryGeo.source) : (memoryGeo.source || 'Memoria'))
      : '';
    const gpsDateRaw = memoryGeo && (memoryGeo.lastVerifiedAt || memoryGeo.resolvedAt || memoryGeo.firstSeenAt);
    const gpsDate = gpsDateRaw ? String(gpsDateRaw).slice(0,10).split('-').reverse().join('-') : '';
    return `
      <div class="card-panel" style="margin-bottom:10px;border-left:3px solid var(--cnfl-cyan)">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
          <div>
            <div style="font-family:var(--font-mono);color:var(--cnfl-cyan);font-size:11px;font-weight:700">${cnflEscapeHtml(cnflHistoryDisplayDate(o.historyDate))}</div>
            <div style="font-size:15px;font-weight:800;color:var(--cnfl-blue-header);margin-top:2px">${cnflEscapeHtml(o.cliente || 'SIN NOMBRE')}</div>
          </div>
        </div>
        <div style="margin-top:8px;font-size:12px;color:var(--text-body)">${cnflEscapeHtml(o.direccion || 'Sin dirección')}</div>
        <div class="tech-meta-grid" style="margin-top:8px">
          <div class="meta-chip"><span>ORDEN</span><strong>${cnflEscapeHtml(o.orden || 'N/D')}</strong></div>
          <div class="meta-chip"><span>LOCALIZACIÓN</span><strong>${cnflEscapeHtml(o.localizacion || 'N/D')}</strong></div>
          <div class="meta-chip"><span>MEDIDOR</span><strong>${cnflEscapeHtml(o.medidor || 'N/D')}</strong></div>
        </div>
        <div style="margin-top:8px;font-size:11px;color:var(--text-muted)">NIS: ${cnflEscapeHtml(o.nis || 'N/D')}</div>
        ${o.observaciones ? `<div style="margin-top:7px;padding:7px;background:var(--bg-input);border-radius:4px;font-size:11px">Obs: ${cnflEscapeHtml(o.observaciones)}</div>` : ''}
        ${hasGps ? `<div style="margin-top:7px;font-size:10px;color:#86EFAC"><i class="fa-solid fa-location-dot"></i> GPS en memoria${gpsSource ? ' · ' + cnflEscapeHtml(gpsSource) : ''}${gpsDate ? ' · ' + gpsDate : ''}</div>` : ''}
      </div>`;
  }).join('');
}

function handleHistorySearch(value) {
  renderOrderHistory(value);
}


// 1. Inicialización del Sistema
document.addEventListener('DOMContentLoaded', async () => {
  registerServiceWorker();
  await loadGeoCache();
  await initOrders();
  renderOrders();
  const linkedLoc = new URLSearchParams(location.search).get('loc');
  if (linkedLoc && /^\d{1,20}$/.test(linkedLoc)) {
    const linkedOrder = workOrders.find(o => String(o.localizacion || '').replace(/\D/g, '') === linkedLoc);
    if (linkedOrder && linkedOrder.status !== 'pending') {
      setRouteFilter('all', document.getElementById('btnFilterAll'));
    }
    const search = document.getElementById('orderSearchInput');
    if (search) search.value = linkedLoc;
    handleSearch(linkedLoc);
  }
  updateLiquidation();
});

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      console.log('Terminal CNFL Offline Activa:', reg.scope);
    }).catch(err => {
      console.warn('SW aviso:', err.message);
    });
  }
}

// Cargar base de datos local de coordenadas y circuitos
async function loadGeoCache() {
  try {
    const saved = localStorage.getItem('cnfl_geocache');
    geoCache = saved ? (JSON.parse(saved) || {}) : {};
  } catch (e) {
    geoCache = {};
    console.warn('Caché GPS local no disponible:', e);
  }
}

if (typeof window !== 'undefined' && window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// Inicializar órdenes de trabajo
async function initOrders() {
  const savedOrders = localStorage.getItem('cnfl_work_orders');
  if (savedOrders !== null) {
    try {
      const parsed = JSON.parse(savedOrders);
      // Validar que no sea la demo vieja (Carlos Murillo, ord-101, etc.)
      const isOldDemo = parsed.length > 0 && parsed.some(o => (o.cliente && o.cliente.includes('Murillo')) || (o.client && o.client.includes('Murillo')) || o.id === 'ord-101');
      if (!isOldDemo) {
        workOrders = parsed;

        const looksLikePdfBatch = workOrders.some(o =>
          String(o.id || '').startsWith('ord-') || /^\d{8}$/.test(String(o.orden || ''))
        );
        const parserVersions = workOrders
          .map(o => Number(o._pdfParserVersion || 0))
          .filter(v => Number.isFinite(v));
        const minParserVersion = parserVersions.length ? Math.min(...parserVersions) : 0;

        cnflPdfBatchStale = looksLikePdfBatch && minParserVersion < CNFL_PDF_PARSER_VERSION;
        if (cnflPdfBatchStale) {
          localStorage.setItem('cnfl_pdf_batch_stale', '1');
        } else {
          localStorage.removeItem('cnfl_pdf_batch_stale');
        }

        enrichOrdersWithCache();
        archiveOrdersToHistory(workOrders);
        updateTgCommandsCount();
        renderOrders();
        updateLiquidation();
        if (cnflPdfBatchStale) {
          setTimeout(() => {
            alert(
              'ATENCIÓN: este lote fue cargado con una versión anterior del lector PDF.\n\n' +
              'Los nombres, direcciones y montos de este lote NO se consideran confiables.\n\n' +
              'No borré tu trabajo, pero debes volver a cargar el PDF con la versión nueva para validarlos.'
            );
          }, 150);
        }
        return;
      }
    } catch (e) {}
  }
  // Por defecto, bandeja 100% limpia para nueva jornada
  workOrders = [];
  renderOrders();
  updateLiquidation();
}

// Vaciar bandeja de órdenes para iniciar nueva jornada o cargar archivo nuevo
function clearWorkOrders() {
  if (!workOrders.length) { showToast('No hay órdenes que vaciar.'); return; }
  const conf = confirm(`Se borrarán ${workOrders.length} órdenes de esta jornada y sus resultados. Guardá un respaldo antes de continuar. ¿Vaciar órdenes?`);
  if (!conf) return;

  try {
    archiveOrdersToHistory(workOrders);
    localStorage.setItem('cnfl_work_orders', JSON.stringify([]));
  } catch (error) {
    showToast('No se pudo vaciar. Tus órdenes siguen en este teléfono.');
    return;
  }
  cancelCutsPdfImport();
  workOrders = [];
  localStorage.removeItem('cnfl_gps_batch_stage');
  localStorage.removeItem('cnfl_last_route_meta');
  localStorage.removeItem('cnfl_pdf_batch_stale');
  cnflPdfBatchStale = false;
  renderOrders();
  updateLiquidation();
  updateTgCommandsCount();
  showToast('Bandeja vaciada. Puedes cargar un nuevo PDF o pegar órdenes.');
  switchTab('cargar', document.querySelectorAll('.nav-tab-btn')[1]);
}

function enrichOrdersWithCache(orders = workOrders) {
  for (const ord of orders) {
    const rawLoc = (ord.localizacion || '').trim();
    const loc = (typeof normalizeCnflLocalization === 'function')
      ? normalizeCnflLocalization(rawLoc)
      : rawLoc.replace(/\D/g, '');
    if (loc && loc !== rawLoc) ord.localizacion = loc;
    if (loc && geoCache[loc]) {
      const geo = geoCache[loc];
      if (geo.lat && geo.lon && !(Number.isFinite(Number(ord.lat)) && Number.isFinite(Number(ord.lon)))) {
        ord.lat = geo.lat;
        ord.lon = geo.lon;
        ord.circuito = geo.circuito || ord.circuito || '';
        ord.wazeUrl = `https://www.waze.com/ul?ll=${ord.lat},${ord.lon}&navigate=yes`;
        ord.mapsUrl = `https://www.google.com/maps/search/?api=1&query=${ord.lat},${ord.lon}`;
      }
    }
    // Asegurar campos técnicos inicializados
    if (ord.lectura === undefined) ord.lectura = '';
    if (ord.sello_instalado === undefined) ord.sello_instalado = '';
    if (ord.sello_retirado === undefined) ord.sello_retirado = '';
    if (ord.observaciones === undefined) ord.observaciones = '';
  }
}

// =========================================================
// ALGORITMO TSP (Traveling Salesperson Problem) + 2-OPT
// =========================================================

function haversineDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 9999;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function optimizeCurrentRoute() {
  if (!workOrders || workOrders.length <= 1) {
    showToast('No hay suficientes órdenes para optimizar');
    return;
  }

  showToast('Optimizando secuencia por mínima distancia...');

  const withCoords = workOrders.filter(o => o.lat && o.lon);
  const withoutCoords = workOrders.filter(o => !o.lat || !o.lon);

  if (withCoords.length === 0) {
    showToast('Las órdenes no disponen de coordenadas GPS');
    return;
  }

  let unvisited = [...withCoords];
  const tour = [];

  // Punto base inicial: Plantel Central CNFL / Sabana
  const baseLat = 9.9355, baseLon = -84.1035;
  unvisited.sort((a, b) => haversineDistance(baseLat, baseLon, a.lat, a.lon) - haversineDistance(baseLat, baseLon, b.lat, b.lon));
  
  let current = unvisited.shift();
  tour.push(current);

  while (unvisited.length > 0) {
    let nearestIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < unvisited.length; i++) {
      const d = haversineDistance(current.lat, current.lon, unvisited[i].lat, unvisited[i].lon);
      if (d < minDist) {
        minDist = d;
        nearestIdx = i;
      }
    }
    current = unvisited.splice(nearestIdx, 1)[0];
    tour.push(current);
  }

  // 2-Opt para desanudar cruces de calles
  let optimizedTour = twoOptImprovement(tour);

  workOrders = [...optimizedTour, ...withoutCoords];
  localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));

  renderOrders();
  showToast(`Ruta optimizada: ${withCoords.length} paradas en secuencia continua.`);
}

function twoOptImprovement(route) {
  let improved = true;
  let iterations = 0;
  const maxIterations = 40;

  function dist(a, b) {
    return haversineDistance(a.lat, a.lon, b.lat, b.lon);
  }

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (let i = 0; i < route.length - 1; i++) {
      for (let k = i + 1; k < route.length; k++) {
        const dCurrent = dist(route[i], route[i + 1]) + (k + 1 < route.length ? dist(route[k], route[k + 1]) : 0);
        const dNew = dist(route[i], route[k]) + (k + 1 < route.length ? dist(route[i + 1], route[k + 1]) : 0);

        if (dNew < dCurrent - 0.0005) {
          const head = route.slice(0, i + 1);
          const mid = route.slice(i + 1, k + 1).reverse();
          const tail = route.slice(k + 1);
          route = head.concat(mid, tail);
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }
  return route;
}

// =========================================================
// RENDERIZADO DE ÓRDENES EN PANTALLA
// =========================================================

function getStatusLabel(status) {
  switch (status) {
    case 'cortado': return '[CORTADO]';
    case 'avisado': return '[AVISADO]';
    case 'reconectado': return '[RECONECTADO]';
    case 'pago': return '[PAGO EN SITIO]';
    case 'ya_cortado': return '[YA CORTADO]';
    case 'no_acceso': return '[SIN ACCESO]';
    case 'directo': return '[DIRECTO / ANOMALÍA]';
    case 'pending': return '[PENDIENTE]';
    default: return `[${(status || 'PENDIENTE').toUpperCase()}]`;
  }
}

function renderOrders() {
  const container = document.getElementById('ordersListContainer');
  if (!container) return;

  // Filtrado de la vista según el selector segmentado
  const manualPlan=cnflManualPlan();
  let list = manualPlan.orders;
  const manualPositions=new Map(list.map((order,index)=>[order,index+1]));

  if (activeFilter === 'pending') {
    list = list.filter(o => o.status === 'pending');
  } else if (activeFilter === 'done') {
    list = list.filter(o => o.status !== 'pending');
  }

  // Filtro por búsqueda de texto
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(o =>
      (o.nis && o.nis.includes(q)) ||
      (o.medidor && o.medidor.toLowerCase().includes(q)) ||
      (o.cliente && o.cliente.toLowerCase().includes(q)) ||
      (o.direccion && o.direccion.toLowerCase().includes(q)) ||
      (o.localizacion && o.localizacion.includes(q)) ||
      (o.circuito && o.circuito.toLowerCase().includes(q))
    );
  }

  updateStats();
  calculateRouteDistance();

  if (workOrders.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:36px 18px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md)">
        <i class="fa-solid fa-inbox" style="font-size:36px;color:var(--cnfl-cyan);margin-bottom:12px;display:block"></i>
        <p style="color:var(--cnfl-blue-header);font-weight:700;font-size:14px;margin-bottom:6px">Bandeja de trabajo vacía</p>
        <p style="color:var(--text-muted);font-size:12px;margin-bottom:16px">No hay órdenes cargadas. Carga un archivo PDF o ingresa tus órdenes en la pestaña "Cargar".</p>
        <button class="btn-primary" style="display:inline-block;width:auto;padding:8px 18px;font-size:12px" onclick="switchTab('cargar', document.querySelectorAll('.nav-tab-btn')[1])">
          <i class="fa-solid fa-file-arrow-up"></i> Cargar órdenes nuevas
        </button>
      </div>`;
    return;
  }

  if (list.length === 0) {
    const emptyMsg = activeFilter === 'pending'
      ? '¡Todas las órdenes han sido gestionadas! Revisá Cierre para compartir el reporte.'
      : (activeFilter === 'done' ? 'Aún no has gestionado ninguna orden.' : 'No hay órdenes que coincidan con la búsqueda.');

    container.innerHTML = `
      <div style="text-align:center;padding:36px 18px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md)">
        <i class="fa-solid fa-clipboard-check" style="font-size:30px;color:var(--cnfl-cyan);margin-bottom:10px;display:block"></i>
        <p style="color:var(--cnfl-blue-header);font-weight:700;font-size:13px">${emptyMsg}</p>
      </div>`;
    return;
  }

  container.innerHTML = list.map((ord, idx) => {
    const cardId = ord.id || ord.orden;
    const isDone = ord.status === 'cortado' || ord.status === 'avisado' || ord.status === 'reconectado' || ord.status === 'pago' || ord.status === 'ya_cortado';
    const isFailed = ord.status === 'no_acceso' || ord.status === 'directo';
    
    const tLower = (ord.tipo || ord.plan || '').toLowerCase();
    let typeClass = 'pill-corta';
    let typeName = 'CORTE RESIDENCIAL';

    if (tLower.includes('recon')) {
      typeClass = 'pill-recon';
      typeName = 'RECONEXIÓN';
    } else if (tLower.includes('insp') || tLower.includes('revision') || tLower.includes('revisión')) {
      typeClass = 'pill-insp';
      typeName = 'INSPECCIÓN TÉCNICA';
    } else if (tLower.includes('fraude') || tLower.includes('anomalia') || tLower.includes('sello')) {
      typeClass = 'pill-fraude';
      typeName = 'VERIF. SELLOS / FRAUDE';
    } else if (tLower.includes('averia') || tLower.includes('avería') || tLower.includes('falla') || tLower.includes('dano')) {
      typeClass = 'pill-averia';
      typeName = 'ATENCIÓN AVERÍA';
    } else if (tLower.includes('mantenimiento') || tLower.includes('cambio') || tLower.includes('poste')) {
      typeClass = 'pill-mantenimiento';
      typeName = 'MANTENIMIENTO RED';
    } else if (ord.plan && ord.plan.includes('COMERCIAL')) {
      typeClass = 'pill-corta';
      typeName = 'CORTE COMERCIAL';
    }


    const hasGps = ord.lat && ord.lon;
    const wazeUrl = hasGps ? `https://www.waze.com/ul?ll=${ord.lat},${ord.lon}&navigate=yes` : `https://waze.com/ul?q=${encodeURIComponent(ord.direccion + ', San José Costa Rica')}`;
    const mapsUrl = hasGps ? `https://www.google.com/maps/search/?api=1&query=${ord.lat},${ord.lon}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ord.direccion + ', San José Costa Rica')}`;

    // Distancia a siguiente parada pendiente
    let nextDistText = '';
    if (idx < list.length - 1 && hasGps && list[idx + 1].lat && list[idx + 1].lon) {
      const dKm = haversineDistance(ord.lat, ord.lon, list[idx + 1].lat, list[idx + 1].lon);
      if (dKm < 1) {
        const meters = Math.round(dKm * 1000);
        nextDistText = `<span>SIGUIENTE PARADA</span><strong>${meters} METROS</strong>`;
      } else {
        nextDistText = `<span>SIGUIENTE PARADA</span><strong>${dKm.toFixed(1)} KM</strong>`;
      }
    }

    const isExpanded = !!expandedFields[cardId];
    const hasFieldData = !!(ord.lectura || ord.sello_instalado || ord.sello_retirado || ord.observaciones);

    return `
      <div class="order-card ${isDone ? 'done' : ''} ${isFailed ? 'failed' : ''}">
        
        <!-- Fila Superior: Parada, Tipo de Operación y Coordenada -->
        <div class="order-top-row">
          <span class="stop-badge">PARADA #${manualPlan.chosen?manualPositions.get(ord):idx+1}</span>
          <span class="type-pill ${typeClass}">${typeName}</span>
          ${typeof cnflGpsBadgeHtml === 'function'
            ? cnflGpsBadgeHtml(ord)
            : (hasGps
                ? '<span class="gps-verified-tag"><i class="fa-solid fa-location-dot"></i> GPS DISPONIBLE</span>'
                : '<span style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono)">SIN GPS</span>')}
        </div>

        <!-- Cliente y Monto -->
        <div class="client-header">
          <div class="client-name">${cnflPdfBatchStale ? '⚠ NOMBRE NO VALIDADO — RECARGAR PDF' : cnflEscapeHtml(ord.cliente || ord.client || 'ABONADO CNFL')}</div>
          ${cnflPdfBatchStale
            ? '<div class="monto-val">⚠ MONTO NO VALIDADO</div>'
            : (ord.monto ? `<div class="monto-val">₡${cnflFormatAmount(ord.monto)}</div>` : '')}
        </div>
        
        <!-- Dirección Oficial -->
        <div class="address-line">
          <i class="fa-solid fa-location-dot"></i>
          <span>${cnflEscapeHtml(ord.direccion || ord.address || 'Sin dirección')}</span>
        </div>

        <!-- Metadatos Técnicos: Localización, NIS, Medidor -->
        <div class="tech-meta-grid">
          <div class="meta-chip">
            <span>LOCALIZACIÓN</span>
            <strong>${cnflEscapeHtml(ord.localizacion || 'N/D')}</strong>
          </div>
          <div class="meta-chip">
            <span>NIS / CUENTA</span>
            <strong>${cnflEscapeHtml(ord.nis || 'N/D')}</strong>
          </div>
          <div class="meta-chip">
            <span># MEDIDOR</span>
            <strong>${cnflEscapeHtml(ord.medidor || ord.meter || 'N/D')}</strong>
          </div>
        </div>

        <!-- Línea de Circuito Eléctrico -->
        <div class="circuit-line">
          <span class="circuit-tag"><i class="fa-solid fa-bolt"></i> ${cnflEscapeHtml(ord.circuito || 'Circuito CNFL')}</span>
          ${ord.orden ? `<span style="color:var(--text-muted);font-family:var(--font-mono)">Ord: ${cnflEscapeHtml(ord.orden)}</span>` : ''}
        </div>

        <!-- Resumen de Datos Registrados -->
        ${hasFieldData ? `
          <div class="record-summary-row">
            ${ord.lectura ? `<span class="record-badge">Lect: ${cnflEscapeHtml(ord.lectura)} kWh</span>` : ''}
            ${ord.sello_instalado ? `<span class="record-badge">Sello Inst: ${cnflEscapeHtml(ord.sello_instalado)}</span>` : ''}
            ${ord.sello_retirado ? `<span class="record-badge">Sello Ret: ${cnflEscapeHtml(ord.sello_retirado)}</span>` : ''}
            ${ord.observaciones ? `<span class="record-badge">Obs: ${cnflEscapeHtml(ord.observaciones)}</span>` : ''}
          </div>
        ` : ''}

        <div class="card-action-label">1 · LLEGAR AL PUNTO</div>
        <div class="gps-nav-grid">
          <a href="${wazeUrl}" target="_blank" class="btn-nav-waze">
            <i class="fa-brands fa-waze"></i> Waze GPS
          </a>
          <a href="${mapsUrl}" target="_blank" class="btn-nav-maps">
            <i class="fa-solid fa-map-location-dot"></i> Maps GPS
          </a>
        </div>

        <button class="payment-share-action" type="button" onclick="openPaymentShare(${workOrders.indexOf(ord)})">
          <i class="fa-solid fa-camera" aria-hidden="true"></i> Mostrar al cliente
        </button>

        <details class="order-status-details">
          <summary><span>2 · REGISTRAR RESULTADO</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></summary>
          <div class="status-details-body">
          <div class="execution-actions-grid">
          <button class="btn-status-act btn-act-corte" onclick="setOrderStatus('${cardId}', 'cortado')">
            <i class="fa-solid fa-bolt"></i> Cortado
          </button>
          <button class="btn-status-act btn-act-avisado" onclick="setOrderStatus('${cardId}', 'avisado')">
            <i class="fa-solid fa-file-invoice"></i> Avisado
          </button>
          <button class="btn-status-act btn-act-recon" onclick="setOrderStatus('${cardId}', 'reconectado')">
            <i class="fa-solid fa-plug"></i> Reconectado
          </button>
          <button class="btn-status-act btn-act-pago" onclick="setOrderStatus('${cardId}', 'pago')">
            <i class="fa-solid fa-receipt"></i> Pagó Sitio
          </button>
          </div>

          <div class="execution-actions-secondary-grid">
          <button class="btn-status-act btn-act-noacc" onclick="setOrderStatus('${cardId}', 'no_acceso')">
            <i class="fa-solid fa-ban"></i> Sin Acceso
          </button>
          </div>
          </div>
        </details>

        <!-- Formulario Técnico: Lecturas, Sellos y Observaciones -->
        <div class="field-form-panel">
          <div class="field-form-header" onclick="toggleFieldData('${cardId}')">
            <span><i class="fa-solid fa-sliders"></i> Registro Técnico (Lectura, Sellos, Obs)</span>
            <i class="fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
          </div>
          <div class="field-form-body" style="display:${isExpanded ? 'block' : 'none'}">
            <div class="form-inputs-row">
              <div class="form-field">
                <label>Lectura (kWh)</label>
                <input type="number" inputmode="numeric" placeholder="kWh..." value="${cnflEscapeHtml(ord.lectura || '')}" oninput="updateFieldRecord('${cardId}', 'lectura', this.value)" />
              </div>
              <div class="form-field">
                <label>Sello Instalado</label>
                <input type="text" placeholder="Ej: S-9921" value="${cnflEscapeHtml(ord.sello_instalado || '')}" oninput="updateFieldRecord('${cardId}', 'sello_instalado', this.value)" />
              </div>
              <div class="form-field">
                <label>Sello Retirado</label>
                <input type="text" placeholder="Ej: S-4120" value="${cnflEscapeHtml(ord.sello_retirado || '')}" oninput="updateFieldRecord('${cardId}', 'sello_retirado', this.value)" />
              </div>
            </div>
            <div class="obs-full-row">
              <label>Observaciones de Cuadrilla</label>
              <input type="text" id="obs-input-${cardId}" placeholder="Detalles o incidencias..." value="${cnflEscapeHtml(ord.observaciones || '')}" oninput="updateFieldRecord('${cardId}', 'observaciones', this.value)" />
            </div>
            <!-- Tags Técnicos (Sin emojis) -->
            <div class="technical-tag-list">
              <button type="button" class="tech-tag" onclick="appendQuickObs('${cardId}', 'Aviso entregado en mano')">Aviso entregado</button>
              <button type="button" class="tech-tag" onclick="appendQuickObs('${cardId}', 'Aviso bajo puerta')">Aviso bajo puerta</button>
              <button type="button" class="tech-tag" onclick="appendQuickObs('${cardId}', 'Comprobante Sinpe verificado')">Sinpe verificado</button>
              <button type="button" class="tech-tag" onclick="appendQuickObs('${cardId}', 'Portón con candado')">Portón con candado</button>
              <button type="button" class="tech-tag" onclick="appendQuickObs('${cardId}', 'Perro peligroso')">Perro peligroso</button>
              <button type="button" class="tech-tag" onclick="appendQuickObs('${cardId}', 'Ya cortado previamente')">Ya cortado</button>
              <button type="button" class="tech-tag" onclick="appendQuickObs('${cardId}', 'Medidor directo')">Medidor directo</button>
              <button type="button" class="tech-tag" onclick="appendQuickObs('${cardId}', 'Abonado no permite corte')">No permite corte</button>
              <button type="button" class="tech-tag" onclick="appendQuickObs('${cardId}', 'Display ilegible/apagado')">Display dañado</button>
              <button type="button" class="tech-tag" onclick="appendQuickObs('${cardId}', 'Sello violentado')">Sello violentado</button>
              <button type="button" class="tech-tag" style="border-color:var(--cnfl-cyan);color:#7DD3FC" onclick="appendQuickObs('${cardId}', 'Retroalimentación GIS: Poste reubicado')">GIS: Poste reubicado</button>
              <button type="button" class="tech-tag" style="border-color:var(--cnfl-cyan);color:#7DD3FC" onclick="appendQuickObs('${cardId}', 'Retroalimentación GIS: Coordenada corregida en sitio')">GIS: Coord. en sitio</button>
            </div>
          </div>
        </div>


        ${nextDistText ? `<div class="next-stop-indicator">${nextDistText}</div>` : ''}

        <!-- Opción para reabrir si se consulta desde la pestaña Gestionadas -->
        ${ord.status !== 'pending' ? `
          <div class="done-reopen-row">
            <span style="color:#86EFAC;font-weight:700;font-family:var(--font-mono)">ESTADO: ${getStatusLabel(ord.status)}</span>
            <button class="btn-reopen" onclick="setOrderStatus('${cardId}', 'pending')">Devolver a Pendiente</button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// =========================================================
// GESTIÓN DE REGISTRO TÉCNICO EN TIEMPO REAL
// =========================================================

function toggleFieldData(cardId) {
  expandedFields[cardId] = !expandedFields[cardId];
  renderOrders();
}

function updateFieldRecord(cardId, field, value) {
  const ord = workOrders.find(o => (o.id === cardId || o.orden === cardId || String(o.orden) === String(cardId)));
  if (ord) {
    ord[field] = value;
    localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
    archiveOrdersToHistory(workOrders);
    updateLiquidation();
    window.dispatchEvent?.(new Event('cnfl-progress'));
  }
}

function appendQuickObs(cardId, tag) {
  const ord = workOrders.find(o => (o.id === cardId || o.orden === cardId || String(o.orden) === String(cardId)));
  if (ord) {
    const current = (ord.observaciones || '').trim();
    if (!current) {
      ord.observaciones = tag;
    } else if (!current.includes(tag)) {
      ord.observaciones = `${current}, ${tag}`;
    }
    localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
    archiveOrdersToHistory(workOrders);
    renderOrders();
    updateLiquidation();
    showToast(`Observación agregada: ${tag}`);
  }
}

function calculateRouteDistance() {
  const subtitle = document.getElementById('routeDistanceSubtitle');
  if (!subtitle) return;

  const manual=cnflManualPlan(),banner=document.getElementById('routeSummaryBanner');
  banner?.classList.toggle('manual-active',manual.chosen>0);
  const autoButton=document.querySelector('.header-actions .btn-optimize');
  if(autoButton)autoButton.hidden=manual.chosen>0;
  if(manual.chosen>0){
    document.getElementById('routeStatusTitle').innerText='MI ORDEN DE VISITA';
    subtitle.innerText=`${manual.chosen} de ${manual.pending} pendientes ordenadas · las demás quedan al final`;
    return;
  }
  if(document.getElementById('routeStatusTitle'))
    document.getElementById('routeStatusTitle').innerText='ORDEN DE VISITA';

  const pendingCount = workOrders.filter(o => o.status === 'pending').length;
  if (pendingCount === 0) {
    subtitle.innerText = 'Sin paradas pendientes';
    return;
  }

  let meta = null;
  try {
    meta = JSON.parse(localStorage.getItem('cnfl_last_route_meta') || 'null');
  } catch (e) {}

  if (
    meta &&
    meta.engine &&
    String(meta.engine).startsWith('road-network-osrm') &&
    Number(meta.pendingTotal) === pendingCount &&
    Number.isFinite(Number(meta.totalRoadMeters))
  ) {
    subtitle.innerText = `${pendingCount} pendientes · ~${(Number(meta.totalRoadMeters) / 1000).toFixed(1)} km por calles`;
    return;
  }

  subtitle.innerText = `${pendingCount} pendientes · armá el orden en el mapa o seguí la lista`;
}

function setOrderStatus(id, newStatus) {
  const ord = workOrders.find(o => (o.id === id || o.orden === id || String(o.orden) === String(id)));
  if (ord) {
    ord.status = newStatus;
    localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
    archiveOrdersToHistory(workOrders);
    
    // Al finalizar una orden, si estamos en la vista de pendientes, se quita automáticamente
    renderOrders();
    showToast(`NIS ${ord.nis}: ${getStatusLabel(newStatus)}`);
    updateLiquidation();
  }
}

function setRouteFilter(filterType, btn) {
  activeFilter = filterType;
  document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderOrders();
}

function updateStats() {
  const total = workOrders.length;
  const cortados = workOrders.filter(o => o.status === 'cortado').length;
  const avisados = workOrders.filter(o => o.status === 'avisado').length;
  const reconectados = workOrders.filter(o => o.status === 'reconectado').length;
  const pagos = workOrders.filter(o => o.status === 'pago').length;
  const yaCortados = workOrders.filter(o => o.status === 'ya_cortado').length;
  const noAcceso = workOrders.filter(o => o.status === 'no_acceso').length;
  const directos = workOrders.filter(o => o.status === 'directo').length;
  const pending = workOrders.filter(o => o.status === 'pending').length;
  const completedTotal = total - pending;

  const elTotal = document.getElementById('statTotal');
  const elDone = document.getElementById('statDone');
  const elFailed = document.getElementById('statFailed');
  const elPending = document.getElementById('statPending');

  const elSegPending = document.getElementById('segCountPending');
  const elSegDone = document.getElementById('segCountDone');
  const elSegAll = document.getElementById('segCountAll');

  const elTray = document.getElementById('trayCountDisplay');

  if (elTotal) elTotal.innerText = total;
  if (elDone) elDone.innerText = completedTotal;
  if (elFailed) elFailed.innerText = noAcceso + directos;
  if (elPending) elPending.innerText = pending;

  if (elSegPending) elSegPending.innerText = pending;
  if (elSegDone) elSegDone.innerText = completedTotal;
  if (elSegAll) elSegAll.innerText = total;

  if (elTray) elTray.innerText = `${total} órdenes (${pending} pendientes)`;
  updateTgCommandsCount();
}

function handleSearch(val) {
  searchQuery = (val || '').trim();
  renderOrders();
}

function switchTab(tabId, btn) {
  document.querySelectorAll('.tab-view').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-tab-btn').forEach(b => b.classList.remove('active'));

  const target = document.getElementById(`tab-${tabId}`);
  if (target) target.classList.add('active');
  if (btn) btn.classList.add('active');

  if (tabId === 'resumen') {
    updateLiquidation();
    if (typeof window !== 'undefined') window.cnflJourneyReview?.();
  }
  if (tabId === 'cargar') updateTgCommandsCount();
  if (tabId === 'historial') renderOrderHistory(document.getElementById('historySearchInput')?.value || '');
}

// =========================================================
// PARSER DE PDF OFICIAL EN NAVEGADOR

function validateCnflOrders(orders) {
  const errors = [];
  if (!Array.isArray(orders) || orders.length === 0) {
    return { ok: false, errors: ['No se extrajeron órdenes.'] };
  }

  const seenOrders = new Set();
  let malformedLoc = 0;
  let missingMeter = 0;
  let duplicateOrders = 0;
  let reviewNames = 0;
  let reviewAddresses = 0;
  let badAmounts = 0;
  let badPendingCounts = 0;
  let badOrderNumbers = 0;
  let badNis = 0;

  for (const o of orders) {
    const loc = String(o.localizacion || '').replace(/\D/g, '');
    if (loc.length !== 10) malformedLoc++;

    const med = String(o.medidor || '').trim();
    if (!med || med === 'N/D') missingMeter++;

    const client = String(o.cliente || o.client || '').trim();
    if (!client || /REVISAR NOMBRE/i.test(client)) reviewNames++;

    const address = String(o.direccion || o.address || '').trim();
    if (!address || /REVISAR DIRECCI[ÓO]N/i.test(address)) reviewAddresses++;

    const amountText = String(o.monto || '').replace(/\s/g, '').trim();
    if (!amountText || !cnflPdfIsMoney(amountText)) badAmounts++;

    if (o.pendientes !== undefined && o.pendientes !== '' && !/^\d{1,2}$/.test(String(o.pendientes))) {
      badPendingCounts++;
    }

    const orderNumber = String(o.orden || '').replace(/\D/g, '');
    if (!/^\d{8}$/.test(orderNumber)) badOrderNumbers++;

    const nisDigits = String(o.nis || '').replace(/\D/g, '');
    if (!/^\d+$/.test(nisDigits)) badNis++;

    const orderId = String(o.orden || o.id || '').trim();
    if (orderId) {
      if (seenOrders.has(orderId)) duplicateOrders++;
      seenOrders.add(orderId);
    }
  }

  if (malformedLoc) errors.push(`${malformedLoc} Localizaciones no tienen 10 dígitos.`);
  if (missingMeter) errors.push(`${missingMeter} órdenes quedaron sin número de medidor.`);
  if (duplicateOrders) errors.push(`${duplicateOrders} órdenes aparecen duplicadas.`);
  if (reviewNames) errors.push(`${reviewNames} nombres no pudieron asociarse con seguridad.`);
  if (reviewAddresses) errors.push(`${reviewAddresses} direcciones no pudieron asociarse con seguridad.`);
  if (badAmounts) errors.push(`${badAmounts} montos no tienen un formato monetario válido.`);
  if (badPendingCounts) errors.push(`${badPendingCounts} filas tienen cantidad Pendientes inválida.`);
  if (badOrderNumbers) errors.push(`${badOrderNumbers} filas no tienen Orden válida de 8 dígitos.`);
  if (badNis) errors.push(`${badNis} filas no tienen NISE numérico válido.`);

  return { ok: errors.length === 0, errors };
}

// =========================================================

function cnflPdfNormText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function cnflPdfItemXY(item) {
  const t = item && item.transform;
  return {
    x: Array.isArray(t) ? Number(t[4]) : 0,
    y: Array.isArray(t) ? Number(t[5]) : 0,
    w: Number(item && item.width) || 0,
    text: cnflPdfNormText(item && item.str)
  };
}

function cnflFindHeaderItem(items, matcher) {
  return items.find(p => matcher(p.text)) || null;
}

function cnflJoinColumn(items) {
  return items
    .filter(p => p.text)
    .sort((a, b) => (Math.abs(a.y - b.y) > 1.5 ? b.y - a.y : a.x - b.x))
    .map(p => p.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Parser geométrico: usa la posición real del texto en el PDF.
// Evita que nombres/direcciones de dos líneas se desplacen hacia el cliente siguiente.
function cnflPdfPickNearest(items, xTarget, yTarget, matcher, maxDx = Infinity) {
  const candidates = (items || [])
    .filter(p => matcher(p.text))
    .map(p => ({
      p,
      score: Math.abs(Number(p.x) - Number(xTarget)) +
        1.8 * Math.abs(Number(p.y) - Number(yTarget))
    }))
    .filter(x => Math.abs(Number(x.p.x) - Number(xTarget)) <= maxDx)
    .sort((a, b) => a.score - b.score);

  return candidates.length ? candidates[0].p : null;
}

function cnflPdfIsMoney(text) {
  const s = String(text || '').replace(/\s/g, '');
  return /^\d{1,3}(?:,\d{3})+(?:\.\d{2})$/.test(s) ||
    /^\d+(?:\.\d{2})$/.test(s) ||
    /^\d{1,3}(?:\.\d{3})+(?:,\d{2})$/.test(s) ||
    /^\d+(?:,\d{2})$/.test(s);
}

function cnflPdfNormalizeMoneyText(text) {
  return String(text || '').replace(/\s/g, '').trim();
}

function cnflAmountNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  let s = String(value).trim().replace(/[₡\s]/g, '');
  if (!s) return null;

  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');

  if (comma >= 0 && dot >= 0) {
    if (comma > dot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (comma >= 0) {
    const decimals = s.length - comma - 1;
    s = decimals === 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (dot >= 0) {
    const parts = s.split('.');
    if (parts.length > 2) s = parts.join('');
    else if (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3) s = parts.join('');
  }

  s = s.replace(/[^0-9.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function cnflFormatAmount(value) {
  const n = cnflAmountNumber(value);
  if (!Number.isFinite(n)) return 'NO VALIDADO';
  return n.toLocaleString('es-CR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function validateCnflLayoutRows(rows) {
  const errors = [];
  let badOrder = 0;
  let badNis = 0;
  let badLoc = 0;
  let badMeter = 0;
  let badPending = 0;
  let badAmount = 0;
  let badAddress = 0;
  let badName = 0;

  for (const r of rows || []) {
    if (!/^\d{8}$/.test(String(r.orden || ''))) badOrder++;
    if (r.nis !== undefined && r.nis !== null && String(r.nis).trim() !== '' && !/^\d+$/.test(String(r.nis))) badNis++;
    if (!/^\d{10}$/.test(String(r.localizacion || ''))) badLoc++;
    if (!/^\d{5,8}$/.test(String(r.medidor || ''))) badMeter++;
    if (!/^\d{1,2}$/.test(String(r.pendientes || ''))) badPending++;
    if (!cnflPdfIsMoney(r.monto)) badAmount++;
    if (!String(r.direccion || '').trim()) badAddress++;
    if (!String(r.cliente || '').trim()) badName++;
  }

  if (badOrder) errors.push(`${badOrder} filas sin Orden válida de 8 dígitos.`);
  if (badNis) errors.push(`${badNis} filas con NISE no numérico.`);
  if (badLoc) errors.push(`${badLoc} filas sin Localización válida de 10 dígitos.`);
  if (badMeter) errors.push(`${badMeter} filas sin Medidor válido.`);
  if (badPending) errors.push(`${badPending} filas sin cantidad Pendientes válida.`);
  if (badAmount) errors.push(`${badAmount} filas sin Monto Total monetario válido.`);
  if (badAddress) errors.push(`${badAddress} filas sin Dirección.`);
  if (badName) errors.push(`${badName} filas sin Nombre.`);

  return { ok: errors.length === 0, errors };
}

function parseCnflPdfLayout(layoutPages) {
  const rows = [];

  for (const rawItems of layoutPages || []) {
    const items = (rawItems || [])
      .map(cnflPdfItemXY)
      .filter(p => p.text);

    const hNis = cnflFindHeaderItem(items, t => /^(?:NIS|NISE|NIS\s*\/\s*E)$/i.test(t.replace(/\s+/g, '')));
    const hPlan = cnflFindHeaderItem(items, t => /^Plan$/i.test(t));
    const hOrder = cnflFindHeaderItem(items, t => /^Orden$/i.test(t));
    const hLoc = cnflFindHeaderItem(items, t => /^Localizaci[oó]n$/i.test(t));
    const hMed = cnflFindHeaderItem(items, t => /^Medidor$/i.test(t));
    const hPend = cnflFindHeaderItem(items, t => /^Pendientes?$/i.test(t));
    const hMonto = cnflFindHeaderItem(items, t => /^Monto\s+Total$/i.test(t));
    const hDir = cnflFindHeaderItem(items, t => /^Direcci[oó]n$/i.test(t));
    const hNom = cnflFindHeaderItem(items, t => /^Nombre$/i.test(t));

    if (!hOrder || !hLoc || !hMed || !hMonto || !hDir || !hNom) continue;

    const xNis = hNis ? hNis.x : null;
    const xPlan = hPlan ? hPlan.x : null;
    const xOrder = hOrder.x;
    const xLoc = hLoc.x;
    const xMed = hMed.x;
    const xPend = hPend ? hPend.x : (xMed + (hMonto.x - xMed) * 0.45);
    const xMonto = hMonto.x;
    const xDir = hDir.x;
    const xNom = hNom.x;

    const anchors = items
      .filter(p =>
        /^\d{10}$/.test(p.text.replace(/\D/g, '')) &&
        Math.abs(p.x - xLoc) < Math.max(45, (xMed - xLoc) * 0.7) &&
        p.y < hLoc.y - 2
      )
      .sort((a, b) => b.y - a.y);

    for (let ai = 0; ai < anchors.length; ai++) {
      const a = anchors[ai];
      const next = anchors[ai + 1] || null;

      // El bloque útil de la fila termina en OBSERVACIONES, antes de vencimientos/notas.
      const obsCandidates = items
        .filter(p =>
          /^OBSERVACIONES$/i.test(p.text) &&
          p.y < a.y - 1 &&
          (!next || p.y > next.y + 2)
        )
        .sort((p, q) => q.y - p.y);
      const obsY = obsCandidates.length ? obsCandidates[0].y : (next ? (a.y + next.y) / 2 : a.y - 26);

      const topY = a.y + 5;
      const bottomY = obsY + 1;

      const rowItems = items.filter(p =>
        p.y <= topY &&
        p.y >= bottomY &&
        !/^OBSERVACIONES$/i.test(p.text)
      );

      // Límites de columnas por puntos medios entre encabezados.
      const bLocMed = (xLoc + xMed) / 2;
      const bMedPend = (xMed + xPend) / 2;
      const bPendMonto = (xPend + xMonto) / 2;
      const bMontoDir = (xMonto + xDir) / 2;
      const bDirNom = (xDir + xNom) / 2;

      const col = (minX, maxX) => rowItems.filter(p => p.x >= minX && p.x < maxX);

      const loc = a.text.replace(/\D/g, '');

      // Campos numéricos críticos se eligen por tipo + cercanía al encabezado.
      // Esto evita convertir "Pendientes 1" + "Monto 38,830.00" en "138,830.00".
      const medItem = cnflPdfPickNearest(
        rowItems,
        xMed,
        a.y,
        t => /^\d{5,8}$/.test(String(t || '').replace(/\D/g, '')),
        Math.max(70, Math.abs(xPend - xMed))
      );
      const pendItem = cnflPdfPickNearest(
        rowItems,
        xPend,
        a.y,
        t => /^\d{1,2}$/.test(String(t || '').trim()),
        Math.max(55, Math.abs(xMonto - xPend))
      );
      const montoItem = cnflPdfPickNearest(
        rowItems,
        xMonto,
        a.y,
        cnflPdfIsMoney,
        Math.max(100, Math.abs(xDir - xMonto))
      );

      const medidor = medItem ? medItem.text.replace(/\D/g, '') : '';
      const pendientes = pendItem ? pendItem.text.trim() : '';
      const monto = montoItem ? cnflPdfNormalizeMoneyText(montoItem.text) : '';

      const nisItem = hNis ? cnflPdfPickNearest(
        rowItems,
        xNis,
        a.y,
        t => /^\d+$/.test(String(t || '').replace(/\D/g, '')),
        Math.max(65, hPlan ? Math.abs(xPlan - xNis) : 80)
      ) : null;

      const planItem = hPlan ? cnflPdfPickNearest(
        rowItems,
        xPlan,
        a.y,
        t => /^(?:TR|TG)\s*-\s*[A-ZÁÉÍÓÚÑ ]+$/i.test(String(t || '').trim()),
        Math.max(120, Math.abs(xLoc - xPlan))
      ) : null;

      const nis = nisItem ? nisItem.text.replace(/\D/g, '') : '';
      const plan = planItem ? planItem.text.replace(/\s+/g, ' ').trim() : '';

      const direccion = cnflJoinColumn(col(bMontoDir, bDirNom));
      const cliente = cnflJoinColumn(col(bDirNom, Infinity));

      // Orden: SOLO desde la columna "Orden".
      // NISE también puede tener 8 dígitos; por eso nunca buscamos "cualquier"
      // número a la izquierda de Localización.
      const orderNeighborGap = Math.min(
        Math.abs(xLoc - xOrder),
        xPlan !== null ? Math.abs(xOrder - xPlan) : Math.abs(xLoc - xOrder)
      );
      const orderItem = cnflPdfPickNearest(
        rowItems,
        xOrder,
        a.y,
        t => /^\d{8}$/.test(String(t || '').replace(/\D/g, '')),
        Math.max(28, orderNeighborGap * 0.72)
      );
      const orden = orderItem ? orderItem.text.replace(/\D/g, '') : '';

      rows.push({
        orden,
        nis,
        plan,
        localizacion: loc,
        medidor: medidor || 'N/D',
        pendientes: pendientes || '',
        monto: monto || '',
        direccion: direccion || '',
        cliente: cliente || '',
        _layoutY: a.y
      });
    }
  }

  return rows;
}

function mergeCnflPdfParsers(textOrders, layoutRows) {
  if (!layoutRows || layoutRows.length === 0) return textOrders;

  const byLoc = new Map();
  for (const row of layoutRows) {
    if (row.localizacion) byLoc.set(row.localizacion, row);
  }

  const merged = [];
  const seen = new Set();

  for (const order of textOrders || []) {
    const loc = String(order.localizacion || '').replace(/\D/g,'');
    const layout = byLoc.get(loc);
    if (!layout) {
      merged.push(order);
      continue;
    }

    seen.add(loc);
    merged.push({
      ...order,
      orden: layout.orden || order.orden,
      nis: layout.nis || order.nis,
      plan: layout.plan || order.plan,
      localizacion: loc,
      medidor: layout.medidor && layout.medidor !== 'N/D' ? layout.medidor : order.medidor,
      pendientes: layout.pendientes || order.pendientes || '',
      monto: layout.monto || order.monto,
      direccion: layout.direccion || order.direccion,
      cliente: layout.cliente || 'REVISAR NOMBRE'
    });
  }

  // Si el parser textual perdió una fila pero el geométrico sí la vio,
  // no inventamos NIS/plan: la agregamos marcada para revisión.
  for (const layout of layoutRows) {
    if (seen.has(layout.localizacion)) continue;
    merged.push({
      id: `ord-${layout.orden || layout.localizacion}`,
      orden: layout.orden || '',
      nis: '',
      plan: 'TR - RESIDENCIAL',
      localizacion: layout.localizacion,
      medidor: layout.medidor || 'N/D',
      pendientes: layout.pendientes || '',
      monto: layout.monto || '0.00',
      direccion: layout.direccion || 'REVISAR DIRECCIÓN',
      cliente: layout.cliente || 'REVISAR NOMBRE',
      tipo: 'corta_residencial',
      status: 'pending',
      lectura: '',
      sello_instalado: '',
      sello_retirado: '',
      observaciones: 'REVISAR: fila recuperada por posición PDF'
    });
  }

  return merged;
}

function mergeCnflFieldProgress(previousOrders, freshOrders) {
  const byOrder = new Map(
    (previousOrders || [])
      .map(o => [String(o.orden || '').replace(/\D/g, ''), o])
      .filter(([order]) => order)
  );

  return (freshOrders || []).map(fresh => {
    const order = String(fresh.orden || '').replace(/\D/g, '');
    const old = byOrder.get(order);
    if (!old) return fresh;

    return {
      ...fresh,
      status: old.status || fresh.status || 'pending',
      lectura: old.lectura || '',
      sello_instalado: old.sello_instalado || '',
      sello_retirado: old.sello_retirado || '',
      observaciones: old.observaciones || '',
      lat: Number.isFinite(Number(old.lat)) ? Number(old.lat) : fresh.lat,
      lon: Number.isFinite(Number(old.lon)) ? Number(old.lon) : fresh.lon,
      circuito: old.circuito || fresh.circuito,
      wazeUrl: old.wazeUrl || fresh.wazeUrl,
      mapsUrl: old.mapsUrl || fresh.mapsUrl
    };
  });
}

let cutsPdfStage = null;

function cancelCutsPdfImport() {
  cutsPdfStage = null;
  const review = document.getElementById('cutsPdfReview');
  if (review) review.hidden = true;
}

function reviewCutsPdfImport(orders, journeyDate, fileName) {
  cutsPdfStage = {orders};
  const current = new Set(workOrders.map(o => String(o.orden || '').replace(/\D/g, '')).filter(Boolean));
  const incoming = new Set(orders.map(o => String(o.orden || '').replace(/\D/g, '')).filter(Boolean));
  const same = orders.filter(o => current.has(String(o.orden || '').replace(/\D/g, ''))).length;
  const missing = workOrders.filter(o => !incoming.has(String(o.orden || '').replace(/\D/g, '')));
  const managedMissing = missing.filter(o => o.status && o.status !== 'pending').length;
  const summary = document.getElementById('cutsPdfReviewText');
  const review = document.getElementById('cutsPdfReview');
  if (!summary || !review) return;
  summary.textContent = `${fileName}: ${orders.length} órdenes encontradas. ` +
    `${same} ya estaban en tu jornada y conservarán sus resultados. ` +
    `${missing.length} órdenes actuales no están en este PDF y saldrán de la bandeja.` +
    (managedMissing ? ` Atención: ${managedMissing} de ellas ya fueron gestionadas. Guardá un respaldo antes de reemplazarlas.` : '');
  review.hidden = false;
  review.scrollIntoView?.({behavior:'smooth',block:'nearest'});
}

async function confirmCutsPdfImport() {
  const stage = cutsPdfStage;
  if (!stage) return;
  const incoming = new Set(stage.orders.map(o => String(o.orden || '').replace(/\D/g, '')).filter(Boolean));
  const managedMissing = workOrders.filter(o => o.status && o.status !== 'pending' && !incoming.has(String(o.orden || '').replace(/\D/g, ''))).length;
  if (managedMissing && !confirm(`${managedMissing} órdenes gestionadas no aparecen en el PDF nuevo. Sus resultados saldrán de la jornada actual. ¿Ya guardaste un respaldo y querés continuar?`)) return;

  const previousOrders = [...workOrders];
  let next;
  try {
    next = mergeCnflFieldProgress(previousOrders, stage.orders);
    enrichOrdersWithCache(next);
    archiveOrdersToHistory(previousOrders);
    // Guardar primero; si el navegador no tiene espacio, la jornada anterior sigue intacta.
    localStorage.setItem('cnfl_work_orders', JSON.stringify(next));
  } catch (error) {
    showToast('No se pudo guardar. Tus órdenes anteriores siguen en la jornada.');
    console.error('Error al confirmar PDF:', error);
    return;
  }
  workOrders = next;
  cnflPdfBatchStale = false;
  localStorage.removeItem('cnfl_pdf_batch_stale');
  localStorage.removeItem('cnfl_gps_batch_stage');
  localStorage.removeItem('cnfl_last_route_meta');
  cancelCutsPdfImport();
  setRouteFilter('pending', document.getElementById('btnFilterPending'));
  renderOrders();
  updateLiquidation();
  updateTgCommandsCount();
  const gpsReady = workOrders.filter(o => Number.isFinite(Number(o.lat)) && Number.isFinite(Number(o.lon))).length;
  const gpsMissing = workOrders.length - gpsReady;
  showToast(`${workOrders.length} órdenes cargadas · ${gpsReady} con GPS · ${gpsMissing} por consultar`);
  switchTab('ruta', document.querySelectorAll('.nav-tab-btn')[0]);
  window.cnflJourneyLoaded?.();
}

async function handlePdfUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  cancelCutsPdfImport();

  const statusEl = document.getElementById('pdfLoadingStatus');
  if (statusEl) {
    statusEl.hidden = false;
    statusEl.textContent = 'Leyendo el PDF de cortes…';
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
      cMapPacked: true
    });
    const pdf = await loadingTask.promise;
    
    let fullText = '';
    const layoutPages = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      layoutPages.push(textContent.items || []);

      const pageLines = [];
      for (const item of textContent.items) {
        if (item.str && item.str.trim()) {
          pageLines.push(item.str.trim());
        }
      }
      fullText += pageLines.join('\n') + '\n---PAGE_BREAK---\n';
    }

    const journeyDate = cnflDateFromPdfText(fullText);
    const textParsed = parseCnflPdfText(fullText);
    const layoutParsed = parseCnflPdfLayout(layoutPages);

    if (layoutParsed.length === 0) {
      throw new Error(
        'No pude leer la tabla por posición. No voy a cargar nombres, direcciones o montos usando un parser inseguro.'
      );
    }

    const layoutValidation = validateCnflLayoutRows(layoutParsed);
    if (!layoutValidation.ok) {
      throw new Error(
        'La tabla PDF no pasó la validación estricta:\n' +
        layoutValidation.errors.join('\n')
      );
    }

    const parsed = mergeCnflPdfParsers(textParsed, layoutParsed);

    // Control adicional: si ambos parsers vieron Localizaciones y no coinciden,
    // detener antes de mandar al técnico con datos cruzados.
    if (layoutParsed.length > 0) {
      const textLocs = new Set(textParsed.map(o => String(o.localizacion || '').replace(/\D/g,'')));
      const layoutLocs = new Set(layoutParsed.map(o => o.localizacion));
      const onlyText = [...textLocs].filter(x => x && !layoutLocs.has(x));
      const onlyLayout = [...layoutLocs].filter(x => x && !textLocs.has(x));
      if (onlyText.length || onlyLayout.length) {
        throw new Error(
          'PDF inconsistente entre lectura textual y lectura por posición. ' +
          `Solo texto: ${onlyText.length}; solo tabla: ${onlyLayout.length}. No cargué datos cruzados.`
        );
      }

      const textByLoc = new Map(
        textParsed.map(o => [String(o.localizacion || '').replace(/\D/g,''), o])
      );
      const mismatches = [];

      for (const lr of layoutParsed) {
        const tr = textByLoc.get(lr.localizacion);
        if (!tr) continue;

        const textOrder = String(tr.orden || '').replace(/\D/g,'');
        const textMeter = String(tr.medidor || '').replace(/\D/g,'');
        const textNis = String(tr.nis || '').replace(/\D/g,'');

        if (textOrder && lr.orden && textOrder !== lr.orden) {
          mismatches.push(`${lr.localizacion}: Orden texto=${textOrder}, tabla=${lr.orden}`);
        }
        if (textMeter && lr.medidor && textMeter !== lr.medidor) {
          mismatches.push(`${lr.localizacion}: Medidor texto=${textMeter}, tabla=${lr.medidor}`);
        }
        if (textNis && lr.nis && textNis !== lr.nis) {
          mismatches.push(`${lr.localizacion}: NIS texto=${textNis}, tabla=${lr.nis}`);
        }
      }

      if (mismatches.length) {
        throw new Error(
          'PDF inconsistente en campos críticos. No cargué el lote.\n' +
          mismatches.slice(0, 8).join('\n')
        );
      }
    }
    if (parsed.length === 0) {
      alert('No se detectaron órdenes con formato estándar en este archivo PDF.\n\nPrueba copiando el texto del PDF y pegándolo en la caja de "Ingreso Manual por Texto".');
    } else {
      for (const o of parsed) {
        o._pdfParserVersion = CNFL_PDF_PARSER_VERSION;
        o._source = 'pdf';
        o._journeyDate = journeyDate;
      }

      const validation = validateCnflOrders(parsed);
      if (!validation.ok) {
        alert(
          'No cargué el PDF porque falló la validación de datos:\n\n' +
          validation.errors.join('\n') +
          '\n\nCorrige/revisa el origen antes de salir a campo.'
        );
        return;
      }

      reviewCutsPdfImport(parsed, journeyDate, file.name);
    }
  } catch (err) {
    console.error('Error procesando PDF:', err);
    alert('No pude leer este PDF de cortes: ' + err.message + '\n\nTambién podés abrir Otras opciones de carga y jornada para pegar el texto.');
  } finally {
    if (statusEl) statusEl.hidden = true;
    event.target.value = '';
  }
}

function parseCnflPdfText(rawText) {
  const orders = [];
  const clean = rawText.replace(/\r/g, '\n');

  // Método 1: Parseo columnar oficial CNFL (Desconexiones en Móviles)
  const pages = clean.split(/(?:-- \d+ of \d+ --|---PAGE_BREAK---)/);
  for (const page of pages) {
    const lines = page.split('\n').map(l => l.trim()).filter(Boolean);
    const ordIdx = lines.findIndex(l => l === 'Orden' || l.startsWith('Orden '));
    const locIdx = lines.findIndex(l => l === 'Localización' || l === 'Localizacion' || l.startsWith('Localiza'));
    const medIdx = lines.findIndex(l => l === 'Medidor' || l.startsWith('Medidor'));
    const pendIdx = lines.findIndex(l => l === 'Pendientes' || l.startsWith('Pendiente'));
    const totIdx = lines.findIndex(l => l === 'Monto Total' || l.startsWith('Monto Total'));
    const dirIdx = lines.findIndex(l => l === 'Dirección' || l === 'Direccion');
    const nomIdx = lines.findIndex(l => l === 'Nombre');
    const niseIdx = lines.findIndex(l => l.replace(/\s+/g, '').toUpperCase().includes('NISE'));
    const planIdx = lines.findIndex(l => l === 'Plan' || l.startsWith('Plan'));

    if (ordIdx !== -1 && locIdx !== -1) {
      let k = ordIdx - 1;
      const pageOrders = [];
      while (k >= 0 && /^\d{8}$/.test(lines[k])) {
        pageOrders.unshift(lines[k]);
        k--;
      }
      const count = pageOrders.length;
      if (count > 0) {
        const pageLocs = lines.slice(ordIdx + 1, locIdx);
        const pageMeds = (medIdx !== -1) ? lines.slice(locIdx + 1, medIdx) : [];
        const pageMontos = (totIdx !== -1 && pendIdx !== -1) ? lines.slice(pendIdx + 1, totIdx) : [];

        if (pageLocs.length < count) {
          throw new Error(`PDF desalineado: esperaba ${count} Localizaciones y encontré ${pageLocs.length}.`);
        }
        if (medIdx !== -1 && pageMeds.length < count) {
          throw new Error(`PDF desalineado: esperaba ${count} Medidores y encontré ${pageMeds.length}.`);
        }
        if (pendIdx !== -1 && totIdx !== -1 && pageMontos.length < count) {
          throw new Error(`PDF desalineado: esperaba ${count} montos y encontré ${pageMontos.length}.`);
        }

        let pageNis = [];
        let pagePlans = [];
        if (niseIdx !== -1) {
          pageNis = lines.slice(niseIdx + 1, niseIdx + 1 + count);
          pagePlans = lines.slice(niseIdx + 1 + count, niseIdx + 1 + 2 * count);
        }

        const dirLines = (totIdx !== -1 && dirIdx !== -1) ? lines.slice(totIdx + 1, dirIdx) : [];
        const nomLines = (dirIdx !== -1 && nomIdx !== -1) ? lines.slice(dirIdx + 1, nomIdx) : [];

        for (let i = 0; i < count; i++) {
          const ordNum = pageOrders[i];
          const plan = (pagePlans[i] || 'TR - RESIDENCIAL').trim();
          orders.push({
            id: `ord-${ordNum}`,
            orden: ordNum,
            localizacion: (pageLocs[i] || '').trim(),
            medidor: (pageMeds[i] || '').trim(),
            monto: (pageMontos[i] || '').trim(),
            nis: (pageNis[i] || '').trim(),
            plan,
            direccion: dirLines[i] || '',
            cliente: nomLines[i] || '',
            tipo: plan.toUpperCase().includes('COMERCIAL') ? 'corta_comercial' : 'corta_residencial',
            status: 'pending',
            lectura: '',
            sello_instalado: '',
            sello_retirado: '',
            observaciones: ''
          });
        }
      }
    }
  }

  // Método 2: Fallback por regex tabular
  if (orders.length === 0) {
    const regex = /(\d{6,8})\s+(TG\s*-\s*COMERCIAL|TR\s*-\s*RESIDENCIAL)\s+(\d{8})\s+(\d{10})\s+([A-Z0-9]+)\s+([\d,.]+)\s+([^0-9\n]+(?:\d+[^0-9\n]*)*?)\s+([A-ZÁÉÍÓÚÑ\s]{4,})/gi;
    let match;
    while ((match = regex.exec(clean)) !== null) {
      orders.push({
        id: `ord-${match[3]}`,
        orden: match[3],
        nis: match[1],
        plan: match[2],
        localizacion: match[4],
        medidor: match[5],
        monto: match[6],
        direccion: match[7].trim(),
        cliente: match[8].trim(),
        tipo: match[2].toUpperCase().includes('COMERCIAL') ? 'corta_comercial' : 'corta_residencial',
        status: 'pending',
        lectura: '',
        sello_instalado: '',
        sello_retirado: '',
        observaciones: ''
      });
    }
  }

  // Modo seguro: no inferir campos críticos por longitud o posición en una línea.
  // Si los formatos oficiales anteriores no coinciden, se devuelve vacío y se bloquea la carga.


  return orders;
}

async function processRawOrders() {
  const raw = (document.getElementById('rawOrdersText').value || '').trim();
  if (!raw) {
    alert('Ingrese o pegue el texto de las órdenes.');
    return;
  }

  const parsed = parseCnflPdfText(raw);
  if (!parsed.length) {
    alert(
      'No cargué el texto porque no coincide con un formato oficial que pueda validar con seguridad.\n\n' +
      'Usá el PDF oficial. No voy a inventar NISE, Medidor, Orden, Monto, Dirección o Nombre a partir de números sueltos.'
    );
    return;
  }
  workOrders = parsed;

  const validation = validateCnflOrders(workOrders);
  if (!validation.ok) {
    alert(
      'No cargué el texto porque falló la validación:\n\n' +
      validation.errors.join('\n')
    );
    return;
  }

  localStorage.removeItem('cnfl_gps_batch_stage');
  localStorage.removeItem('cnfl_last_route_meta');
  enrichOrdersWithCache();
  localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));

  // Igual que con PDF: una bandeja nueva exige validar las coordenadas
  // del lote actual antes de optimizar, aunque existan referencias en caché.
  document.getElementById('rawOrdersText').value = '';
  setRouteFilter('pending', document.getElementById('btnFilterPending'));
  renderOrders();
  updateLiquidation();
  updateTgCommandsCount();
  showToast(`Cargadas ${workOrders.length} órdenes.`);
  switchTab('ruta', document.querySelectorAll('.nav-tab-btn')[0]);
}

// =========================================================
// INTEGRACIÓN CON TELEGRAM (@ubiCNFL)
// =========================================================

function getTelegramWazeCommands() {
  const locs = [];
  for (const ord of workOrders) {
    const raw = (ord.localizacion || '').replace(/\D/g, '');
    const loc = (typeof normalizeCnflLocalization === 'function')
      ? normalizeCnflLocalization(raw)
      : raw;
    if (loc.length === 10 && !locs.includes(loc)) locs.push(loc);
  }
  return locs.map(l => `gmaps${l}`).join('\n');
}

function updateTgCommandsCount() {
  const cmds = getTelegramWazeCommands();
  const count = cmds ? cmds.split('\n').filter(Boolean).length : 0;

  const badge = document.getElementById('tgCmdCount');
  if (badge) badge.innerText = count;

  const preview = document.getElementById('telegramCommandsPreview');
  if (preview) {
    preview.value = cmds;
    preview.placeholder = count
      ? ''
      : 'Carga primero el PDF. Aquí aparecerán las Localizaciones como gmaps##########.';
  }
}

function copyTelegramWazeCommands() {
  const cmds = getTelegramWazeCommands();
  if (!cmds) {
    showToast('No hay órdenes con localización cargadas en la bandeja.');
    return;
  }
  navigator.clipboard.writeText(cmds).then(() => {
    showToast(`Copiados ${cmds.split('\n').length} comandos gmaps al portapapeles.`);
  }).catch(() => {
    prompt('Copia los comandos para enviarle a @ubiCNFL en Telegram:', cmds);
  });
}

function importTelegramReplies() {
  const inputEl = document.getElementById('telegramBotReplies');
  if (!inputEl) return;
  const raw = inputEl.value.trim();
  if (!raw) {
    alert('Pega en la caja los mensajes que te respondió @ubiCNFL en Telegram.');
    return;
  }

  let matchedCount = 0;
  const lines = raw.split('\n');

  for (const line of lines) {
    const locMatch = line.match(/(?:Localizaci[oó]n\s*#?|Waze)?(\d{8,10})/i);
    const coordMatch = line.match(/ll=([-0-9.]+),([-0-9.]+)/i);
    const circMatch = line.match(/en\s+(Circuito\s+[^\)]+)/i);

    if (locMatch && coordMatch) {
      const loc = locMatch[1];
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[2]);
      const circuito = circMatch ? circMatch[1].trim() : '';

      geoCache[loc] = {
        localizacion: loc,
        lat,
        lon,
        circuito,
        wazeUrl: `https://www.waze.com/ul?ll=${lat},${lon}&navigate=yes`,
        mapsUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`
      };
      matchedCount++;
    }
  }

  // Fallback si vino en bloque sin saltos
  if (matchedCount === 0) {
    const globalCoords = [...raw.matchAll(/ll=([-0-9.]+),([-0-9.]+)/gi)];
    const globalLocs = [...raw.matchAll(/\b0\d{9}\b/g)];
    for (let i = 0; i < Math.min(globalCoords.length, globalLocs.length); i++) {
      const loc = globalLocs[i][0];
      const lat = parseFloat(globalCoords[i][1]);
      const lon = parseFloat(globalCoords[i][2]);
      geoCache[loc] = {
        localizacion: loc,
        lat,
        lon,
        circuito: 'Circuito CNFL',
        wazeUrl: `https://www.waze.com/ul?ll=${lat},${lon}&navigate=yes`,
        mapsUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`
      };
      matchedCount++;
    }
  }

  if (matchedCount > 0) {
    localStorage.setItem('cnfl_geocache', JSON.stringify(geoCache));
    enrichOrdersWithCache();
    optimizeCurrentRoute();
    localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
    renderOrders();
    updateLiquidation();
    inputEl.value = '';
    showToast(`¡Éxito! ${matchedCount} coordenadas GPS vinculadas a la ruta.`);
    switchTab('ruta', document.querySelectorAll('.nav-tab-btn')[0]);
  } else {
    alert('No se detectaron coordenadas GPS en el texto pegado. Asegúrate de incluir los enlaces con "ll=" que envía @ubiCNFL.');
  }
}

async function handleHistoryPdfUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById('historyImportStatus');
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.innerText = 'Leyendo PDF histórico...';
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({
      data: arrayBuffer,
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
      cMapPacked: true
    }).promise;

    let fullText = '';
    const layoutPages = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      layoutPages.push(textContent.items || []);
      fullText += (textContent.items || [])
        .map(item => item.str && item.str.trim() ? item.str.trim() : '')
        .filter(Boolean)
        .join('\n') + '\n---PAGE_BREAK---\n';
    }

    const journeyDate = cnflDateFromPdfText(fullText);
    const rows = parseCnflPdfLayout(layoutPages);
    const validation = validateCnflLayoutRows(rows);
    if (!rows.length || !validation.ok) {
      throw new Error(validation.errors.join('\n') || 'No se detectaron órdenes válidas.');
    }

    const historicOrders = rows.map(row => ({
      ...row,
      status: 'historico',
      lectura: '',
      sello_instalado: '',
      sello_retirado: '',
      observaciones: '',
      _journeyDate: journeyDate,
      _source: 'pdf-historial'
    }));

    archiveOrdersToHistory(historicOrders, journeyDate);
    renderOrderHistory(document.getElementById('historySearchInput')?.value || '');
    showToast(`Historial: ${historicOrders.length} órdenes del ${cnflHistoryDisplayDate(journeyDate)} guardadas.`);
  } catch (err) {
    alert('No pude agregar ese PDF al historial: ' + err.message);
  } finally {
    if (statusEl) statusEl.style.display = 'none';
    event.target.value = '';
  }
}

// =========================================================
// LIQUIDACIÓN OFICIAL FORMAL (CNFL)
// =========================================================

function generateLiquidationText() {
  const total = workOrders.length;
  const cortados = workOrders.filter(o => o.status === 'cortado').length;
  const avisados = workOrders.filter(o => o.status === 'avisado').length;
  const reconectados = workOrders.filter(o => o.status === 'reconectado').length;
  const pagos = workOrders.filter(o => o.status === 'pago').length;
  const yaCortados = workOrders.filter(o => o.status === 'ya_cortado').length;
  const noAcceso = workOrders.filter(o => o.status === 'no_acceso').length;
  const directos = workOrders.filter(o => o.status === 'directo').length;
  const pendientes = workOrders.filter(o => o.status === 'pending').length;
  const gestionadas = total - pendientes;

  const now = new Date();
  const dateStr = now.toLocaleDateString('es-CR');
  const timeStr = now.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });

  // El informe final NO sigue el orden de ruta. Se ordena por Localización
  // de menor a mayor porque ese es el identificador usado para revisar/liquidar.
  const orderedOrders = workOrders
    .filter(o => o.status !== 'pending')
    .sort((a, b) => {
    const aLoc = String(a.localizacion || '').replace(/\D/g, '');
    const bLoc = String(b.localizacion || '').replace(/\D/g, '');
    if (aLoc && bLoc) return Number(aLoc) - Number(bLoc);
    if (aLoc) return -1;
    if (bLoc) return 1;
    return String(a.nis || '').localeCompare(String(b.nis || ''), 'es', { numeric: true });
  });

  function miniReport(o, i) {
    const stateLabel = getStatusLabel(o.status);
    const lines = [
      `${i + 1}. ${stateLabel}  Localización: ${o.localizacion || 'N/D'}`,
      `   Medidor: ${o.medidor || o.meter || 'N/D'} | NIS: ${o.nis || 'N/D'} | Orden: ${o.orden || 'N/D'}`
    ];

    // Cada resultado muestra únicamente la información que tiene sentido
    // para la gestión realizada. No se rellenan campos irrelevantes con N/R.
    switch (o.status) {
      case 'cortado':
        lines.push('   Gestión: Corte ejecutado.');
        if (o.lectura) lines.push(`   Lectura: ${o.lectura} kWh`);
        if (o.sello_retirado) lines.push(`   Sello retirado: ${o.sello_retirado}`);
        if (o.sello_instalado) lines.push(`   Sello instalado: ${o.sello_instalado}`);
        break;

      case 'reconectado':
        lines.push('   Gestión: Reconexión realizada.');
        if (o.lectura) lines.push(`   Lectura: ${o.lectura} kWh`);
        if (o.sello_retirado) lines.push(`   Sello retirado: ${o.sello_retirado}`);
        if (o.sello_instalado) lines.push(`   Sello instalado: ${o.sello_instalado}`);
        break;

      case 'pago':
        // Si el cliente pagó, no hubo intervención de corte:
        // lectura y sellos no pertenecen a este mini informe.
        lines.push('   Gestión: Cliente pagó en sitio.');
        break;

      case 'avisado':
        lines.push('   Gestión: Cliente avisado / notificado.');
        // No hay sellos si no hubo intervención. Una lectura registrada sí puede
        // ser útil y se conserva solo cuando realmente fue tomada.
        if (o.lectura) lines.push(`   Lectura: ${o.lectura} kWh`);
        break;

      case 'ya_cortado':
        lines.push('   Gestión: Servicio ya se encontraba cortado.');
        if (o.lectura) lines.push(`   Lectura: ${o.lectura} kWh`);
        break;

      case 'no_acceso':
        lines.push('   Gestión: Sin acceso al servicio / medidor.');
        break;

      case 'directo':
        lines.push('   Gestión: Directo / anomalía detectada.');
        if (o.lectura) lines.push(`   Lectura: ${o.lectura} kWh`);
        if (o.sello_retirado) lines.push(`   Sello retirado: ${o.sello_retirado}`);
        if (o.sello_instalado) lines.push(`   Sello instalado: ${o.sello_instalado}`);
        break;

      case 'pending':
      default:
        lines.push('   Gestión: Pendiente.');
        break;
    }

    if (o.observaciones && String(o.observaciones).trim()) {
      lines.push(`   Obs: ${String(o.observaciones).trim()}`);
    }

    // Datos administrativos mínimos para identificar el caso.
    if (!cnflPdfBatchStale && (o.cliente || o.client)) {
      lines.push(`   Cliente: ${o.cliente || o.client}`);
    } else if (cnflPdfBatchStale) {
      lines.push('   Cliente: NO VALIDADO — RECARGAR PDF');
    }
    if (cnflPdfBatchStale) {
      lines.push('   Monto listado: NO VALIDADO — RECARGAR PDF');
    } else if (o.monto) {
      lines.push(`   Monto listado: ₡${cnflFormatAmount(o.monto)}`);
    }

    return lines.join('\n');
  }

  return `==================================================
COMPAÑÍA NACIONAL DE FUERZA Y LUZ
CIERRE DE JORNADA — CORTES / RECONEXIONES
Fecha: ${dateStr} | Hora: ${timeStr}
==================================================
RESUMEN DE GESTIÓN EN CAMPO:
• Total Asignadas: ${total}
• Total Gestionadas: ${gestionadas}
  - Cortes Ejecutados: ${cortados}
  - Avisados (Notificados sin corte): ${avisados}
  - Reconexiones Realizadas: ${reconectados}
  - Pagos Verificados en Sitio: ${pagos}
  - Ya Cortados Previamente: ${yaCortados}
  - Sin Acceso (Portón/Candado): ${noAcceso}
  - Directos / Anomalías Detectadas: ${directos}
• Pendientes Restantes: ${pendientes}
==================================================
DETALLE DE ÓRDENES GESTIONADAS — LOCALIZACIÓN DE MENOR A MAYOR:
(Las pendientes se cuentan arriba pero no se incluyen en el detalle final.)

${orderedOrders.length
  ? orderedOrders.map((o, i) => miniReport(o, i)).join('\n\n')
  : 'Sin órdenes gestionadas todavía.'}
==================================================
Fin del resumen de gestión de campo`;
}

function updateLiquidation() {
  const container = document.getElementById('liquidationSummaryText');
  if (container) container.innerText = generateLiquidationText();
  const metrics=document.getElementById('closeoutMetrics');
  const groups=document.getElementById('closeoutGroups');
  if(!metrics||!groups||!window.CNFLCutsLiquidation)return;
  const report=window.CNFLCutsLiquidation.snapshot(workOrders);
  metrics.innerHTML=`
    <div><strong>${report.managed}</strong><span>GESTIONADAS</span></div>
    <div><strong>${report.pending}</strong><span>PENDIENTES</span></div>
    <div><strong>${report.total}</strong><span>ASIGNADAS</span></div>`;
  const active=report.groups.filter(group=>group.rows.length);
  groups.innerHTML=active.length?active.map(group=>`
    <section class="closeout-group">
      <h3>${cnflEscapeHtml(group.label)} <span>${group.rows.length}</span></h3>
      ${group.rows.map(order=>{
        const index=workOrders.indexOf(order);
        return `<button type="button" class="closeout-row" onclick="focusLiquidationOrder(${index})">
          <span><strong>Localización ${cnflEscapeHtml(order.localizacion||'N/D')}</strong>
          <small>Orden ${cnflEscapeHtml(order.orden||'N/D')} · Medidor ${cnflEscapeHtml(order.medidor||order.meter||'N/D')}</small></span>
          <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
        </button>`;
      }).join('')}
    </section>`).join(''):'<div class="closeout-empty">Todavía no hay gestiones. Registrá el resultado en la orden y aparecerá aquí.</div>';
}

function focusLiquidationOrder(index){
  const order=workOrders[index];
  if(!order)return;
  setRouteFilter('all',document.getElementById('btnFilterAll'));
  const query=String(order.localizacion||order.nis||order.medidor||'').trim();
  document.getElementById('orderSearchInput').value=query;
  handleSearch(query);
  switchTab('ruta',document.querySelectorAll('.nav-tab-btn')[0]);
  window.scrollTo({top:0,behavior:'smooth'});
}

function downloadLiquidationCsv(){
  const report=window.CNFLCutsLiquidation.snapshot(workOrders);
  if(!report.managed){showToast('Todavía no hay gestiones para exportar.');return;}
  const blob=new Blob([window.CNFLCutsLiquidation.csv(report)],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;anchor.download=`cierre-cortes-${cnflLocalDateKey()}.csv`;
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  showToast('Tabla descargada. Revisá los datos antes de enviarla.');
}

async function copyLiquidation() {
  const text = generateLiquidationText();
  try {await navigator.clipboard.writeText(text);
    showToast('Reporte copiado al portapapeles.');
  }catch(_){showToast('No se pudo copiar. Abrí el reporte completo para seleccionar el texto.');}
}

async function shareWhatsAppLiquidation() {
  if(!workOrders.some(o=>o.status&&o.status!=='pending')){
    showToast('Todavía no hay gestiones para compartir.');return;
  }
  const report=generateLiquidationText();
  if(navigator.share){
    try{await navigator.share({title:'Cierre de jornada · cortes',text:report});return;}
    catch(error){if(error.name==='AbortError')return;}
  }
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(report)}`, '_blank');
}

function closePaymentShare(){
  document.getElementById('paymentShareOverlay').hidden=true;
  document.body.classList.remove('payment-share-open');
  document.getElementById('paymentSharePreview').removeAttribute('src');
}
function openPaymentShare(index){
  const order=workOrders[index];
  if(!order)return;
  const amount=!cnflPdfBatchStale&&/[0-9]/.test(String(order.monto||''))&&cnflAmountNumber(order.monto)>0
    ?cnflFormatAmount(order.monto):null;
  const data=window.CNFLOrderShare.build(order,amount);
  const overlay=document.getElementById('paymentShareOverlay');
  const image=document.getElementById('paymentSharePreview');
  const status=document.getElementById('paymentShareStatus');
  image.hidden=true;image.removeAttribute('src');
  overlay.hidden=false;document.body.classList.add('payment-share-open');
  overlay.querySelector('.payment-share-head button').focus();
  try{
    const canvas=window.CNFLOrderShare.draw(document.createElement('canvas'),data);
    image.src=canvas.toDataURL('image/png');image.hidden=false;
    image.alt='NISE '+data.nis+'. Monto: '+data.monto+'. Orden '+data.orden;
    status.textContent='El cliente puede tomarle una foto a esta pantalla.';
  }catch(error){status.textContent='No se pudo crear la imagen. Cerrá y volvé a intentarlo.';}
}
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!document.getElementById('paymentShareOverlay')?.hidden)closePaymentShare();
});

function showToast(msg) {
  const t = document.getElementById('mobileToast');
  if (!t) return;
  t.innerText = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}
