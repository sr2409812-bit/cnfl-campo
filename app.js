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
const CNFL_PDF_PARSER_VERSION = 4;
let cnflPdfBatchStale = false;

// 1. Inicialización del Sistema
document.addEventListener('DOMContentLoaded', async () => {
  registerServiceWorker();
  await loadGeoCache();
  await initOrders();
  renderOrders();
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
    if (saved) {
      geoCache = JSON.parse(saved);
    } else {
      const res = await fetch('resolved_cache.json');
      if (res.ok) {
        geoCache = await res.json();
        localStorage.setItem('cnfl_geocache', JSON.stringify(geoCache));
      }
    }
  } catch (e) {
    console.warn('Caché no disponible:', e);
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
  const conf = confirm('¿Deseas vaciar la bandeja de órdenes actual para cargar un archivo nuevo o iniciar de cero?');
  if (!conf) return;

  workOrders = [];
  localStorage.setItem('cnfl_work_orders', JSON.stringify([]));
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

// Forzar recarga de las 41 órdenes oficiales desde el servidor (evitando caché)
async function forceReloadTodayOrders() {
  showToast('Descargando listado oficial de hoy...');
  try {
    const res = await fetch('orders_today.json?cb=' + Date.now(), { cache: 'no-store' });
    if (res.ok) {
      workOrders = await res.json();
      enrichOrdersWithCache();
      localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
      setRouteFilter('pending', document.getElementById('btnFilterPending'));
      renderOrders();
      updateLiquidation();
      updateTgCommandsCount();
      showToast(`¡Listo! Cargadas ${workOrders.length} órdenes oficiales.`);
      switchTab('ruta', document.querySelectorAll('.nav-tab-btn')[0]);
      return;
    }
  } catch (e) {
    console.error('Error al forzar recarga:', e);
  }
  showToast('No se pudo descargar orders_today.json');
}

// Cargar las órdenes de hoy (41 órdenes oficiales)
async function loadTodayPreloadedOrders() {
  try {
    const res = await fetch('orders_today.json?cb=' + Date.now(), { cache: 'no-store' });
    if (res.ok) {
      workOrders = await res.json();
      enrichOrdersWithCache();
      localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
      setRouteFilter('pending', document.getElementById('btnFilterPending'));
      renderOrders();
      updateLiquidation();
      updateTgCommandsCount();
      showToast(`Cargadas ${workOrders.length} órdenes oficiales de la jornada.`);
      return;
    }
  } catch (e) {
    console.warn('No se pudo cargar orders_today.json:', e);
  }
  loadDemoOrders();
}

function enrichOrdersWithCache() {
  for (const ord of workOrders) {
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
  let list = workOrders;

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
        <p style="color:#fff;font-weight:700;font-size:14px;margin-bottom:6px">Bandeja de trabajo vacía</p>
        <p style="color:var(--text-muted);font-size:12px;margin-bottom:16px">No hay órdenes cargadas. Carga un archivo PDF o ingresa tus órdenes en la pestaña "Cargar".</p>
        <button class="btn-primary" style="display:inline-block;width:auto;padding:8px 18px;font-size:12px" onclick="switchTab('cargar', document.querySelectorAll('.nav-tab-btn')[1])">
          <i class="fa-solid fa-file-arrow-up"></i> Cargar órdenes nuevas
        </button>
      </div>`;
    return;
  }

  if (list.length === 0) {
    const emptyMsg = activeFilter === 'pending'
      ? '¡Todas las órdenes han sido gestionadas! Revisa la pestaña Liquidación para enviar el reporte.'
      : (activeFilter === 'done' ? 'Aún no has gestionado ninguna orden.' : 'No hay órdenes que coincidan con la búsqueda.');

    container.innerHTML = `
      <div style="text-align:center;padding:36px 18px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md)">
        <i class="fa-solid fa-clipboard-check" style="font-size:30px;color:var(--cnfl-cyan);margin-bottom:10px;display:block"></i>
        <p style="color:#fff;font-weight:700;font-size:13px">${emptyMsg}</p>
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
          <span class="stop-badge">PARADA #${idx + 1}</span>
          <span class="type-pill ${typeClass}">${typeName}</span>
          ${hasGps ? '<span class="gps-verified-tag"><i class="fa-solid fa-satellite-dish"></i> GPS EXACTO</span>' : '<span style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono)">COORD. APROX</span>'}
        </div>

        <!-- Cliente y Monto -->
        <div class="client-header">
          <div class="client-name">${cnflPdfBatchStale ? '⚠ NOMBRE NO VALIDADO — RECARGAR PDF' : (ord.cliente || ord.client || 'ABONADO CNFL')}</div>
          ${cnflPdfBatchStale
            ? '<div class="monto-val">⚠ MONTO NO VALIDADO</div>'
            : (ord.monto ? `<div class="monto-val">₡${cnflFormatAmount(ord.monto)}</div>` : '')}
        </div>
        
        <!-- Dirección Oficial -->
        <div class="address-line">
          <i class="fa-solid fa-location-dot"></i>
          <span>${ord.direccion || ord.address}</span>
        </div>

        <!-- Metadatos Técnicos: Localización, NIS, Medidor -->
        <div class="tech-meta-grid">
          <div class="meta-chip">
            <span>LOCALIZACIÓN</span>
            <strong>${ord.localizacion || 'N/D'}</strong>
          </div>
          <div class="meta-chip">
            <span>NIS / CUENTA</span>
            <strong>${ord.nis}</strong>
          </div>
          <div class="meta-chip">
            <span># MEDIDOR</span>
            <strong>${ord.medidor || ord.meter}</strong>
          </div>
        </div>

        <!-- Línea de Circuito Eléctrico -->
        <div class="circuit-line">
          <span class="circuit-tag"><i class="fa-solid fa-bolt"></i> ${ord.circuito || 'Circuito CNFL'}</span>
          ${ord.orden ? `<span style="color:var(--text-muted);font-family:var(--font-mono)">Ord: ${ord.orden}</span>` : ''}
        </div>

        <!-- Resumen de Datos Registrados -->
        ${hasFieldData ? `
          <div class="record-summary-row">
            ${ord.lectura ? `<span class="record-badge">Lect: ${ord.lectura} kWh</span>` : ''}
            ${ord.sello_instalado ? `<span class="record-badge">Sello Inst: ${ord.sello_instalado}</span>` : ''}
            ${ord.sello_retirado ? `<span class="record-badge">Sello Ret: ${ord.sello_retirado}</span>` : ''}
            ${ord.observaciones ? `<span class="record-badge">Obs: ${ord.observaciones}</span>` : ''}
          </div>
        ` : ''}

        <!-- Navegación GPS Satelital 1-Touch -->
        <div class="gps-nav-grid">
          <a href="${wazeUrl}" target="_blank" class="btn-nav-waze">
            <i class="fa-brands fa-waze"></i> Waze GPS
          </a>
          <a href="${mapsUrl}" target="_blank" class="btn-nav-maps">
            <i class="fa-solid fa-map-location-dot"></i> Maps GPS
          </a>
        </div>

        <!-- Botones de Acción de Campo (Fila 1: Operaciones Principales) -->
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

        <!-- Fila 2: Casos Especiales / Anormalidades -->
        <div class="execution-actions-secondary-grid">
          <button class="btn-status-act btn-act-noacc" onclick="setOrderStatus('${cardId}', 'no_acceso')">
            <i class="fa-solid fa-ban"></i> Sin Acceso
          </button>
          <button class="btn-status-act btn-act-yacortado" onclick="setOrderStatus('${cardId}', 'ya_cortado')">
            <i class="fa-solid fa-check-double"></i> Ya Cortado
          </button>
          <button class="btn-status-act btn-act-directo" onclick="setOrderStatus('${cardId}', 'directo')">
            <i class="fa-solid fa-triangle-exclamation"></i> Directo
          </button>
        </div>

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
                <input type="number" inputmode="numeric" placeholder="kWh..." value="${ord.lectura || ''}" oninput="updateFieldRecord('${cardId}', 'lectura', this.value)" />
              </div>
              <div class="form-field">
                <label>Sello Instalado</label>
                <input type="text" placeholder="Ej: S-9921" value="${ord.sello_instalado || ''}" oninput="updateFieldRecord('${cardId}', 'sello_instalado', this.value)" />
              </div>
              <div class="form-field">
                <label>Sello Retirado</label>
                <input type="text" placeholder="Ej: S-4120" value="${ord.sello_retirado || ''}" oninput="updateFieldRecord('${cardId}', 'sello_retirado', this.value)" />
              </div>
            </div>
            <div class="obs-full-row">
              <label>Observaciones de Cuadrilla</label>
              <input type="text" id="obs-input-${cardId}" placeholder="Detalles o incidencias..." value="${ord.observaciones || ''}" oninput="updateFieldRecord('${cardId}', 'observaciones', this.value)" />
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
    updateLiquidation();
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
    renderOrders();
    updateLiquidation();
    showToast(`Observación agregada: ${tag}`);
  }
}

function calculateRouteDistance() {
  const subtitle = document.getElementById('routeDistanceSubtitle');
  if (!subtitle) return;

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

  if (workOrders.some(o => o.status !== 'pending')) {
    subtitle.innerText = `${pendingCount} pendientes · toca “Recalcular desde aquí” para actualizar la ruta`;
  } else {
    subtitle.innerText = `${pendingCount} paradas pendientes · ruta vial aún no calculada`;
  }
}

function setOrderStatus(id, newStatus) {
  const ord = workOrders.find(o => (o.id === id || o.orden === id || String(o.orden) === String(id)));
  if (ord) {
    ord.status = newStatus;
    localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
    
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

  if (tabId === 'resumen') updateLiquidation();
  if (tabId === 'cargar') updateTgCommandsCount();
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
  let badLoc = 0;
  let badMeter = 0;
  let badPending = 0;
  let badAmount = 0;
  let badAddress = 0;
  let badName = 0;

  for (const r of rows || []) {
    if (!/^\d{8}$/.test(String(r.orden || ''))) badOrder++;
    if (!/^\d{10}$/.test(String(r.localizacion || ''))) badLoc++;
    if (!/^\d{5,8}$/.test(String(r.medidor || ''))) badMeter++;
    if (!/^\d{1,2}$/.test(String(r.pendientes || ''))) badPending++;
    if (!cnflPdfIsMoney(r.monto)) badAmount++;
    if (!String(r.direccion || '').trim()) badAddress++;
    if (!String(r.cliente || '').trim()) badName++;
  }

  if (badOrder) errors.push(`${badOrder} filas sin Orden válida de 8 dígitos.`);
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

    const hLoc = cnflFindHeaderItem(items, t => /^Localizaci[oó]n$/i.test(t));
    const hMed = cnflFindHeaderItem(items, t => /^Medidor$/i.test(t));
    const hPend = cnflFindHeaderItem(items, t => /^Pendientes?$/i.test(t));
    const hMonto = cnflFindHeaderItem(items, t => /^Monto\s+Total$/i.test(t));
    const hDir = cnflFindHeaderItem(items, t => /^Direcci[oó]n$/i.test(t));
    const hNom = cnflFindHeaderItem(items, t => /^Nombre$/i.test(t));

    if (!hLoc || !hMed || !hMonto || !hDir || !hNom) continue;

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

      const direccion = cnflJoinColumn(col(bMontoDir, bDirNom));
      const cliente = cnflJoinColumn(col(bDirNom, Infinity));

      // Orden: número de 8 dígitos inmediatamente a la izquierda de Localización.
      const leftItems = rowItems
        .filter(p => p.x < bLocMed && p.x < xLoc)
        .map(p => ({...p, digits:p.text.replace(/\D/g,'')}))
        .filter(p => /^\d{8}$/.test(p.digits))
        .sort((p,q) => Math.abs(p.y-a.y)-Math.abs(q.y-a.y));
      const orden = leftItems.length ? leftItems[0].digits : '';

      rows.push({
        orden,
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

async function handlePdfUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById('pdfLoadingStatus');
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Leyendo PDF y extrayendo órdenes oficiales...';
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

        if (textOrder && lr.orden && textOrder !== lr.orden) {
          mismatches.push(`${lr.localizacion}: Orden texto=${textOrder}, tabla=${lr.orden}`);
        }
        if (textMeter && lr.medidor && textMeter !== lr.medidor) {
          mismatches.push(`${lr.localizacion}: Medidor texto=${textMeter}, tabla=${lr.medidor}`);
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

      workOrders = parsed;
      cnflPdfBatchStale = false;
      localStorage.removeItem('cnfl_pdf_batch_stale');
      localStorage.removeItem('cnfl_gps_batch_stage');
      localStorage.removeItem('cnfl_last_route_meta');
      enrichOrdersWithCache();
      localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
      setRouteFilter('pending', document.getElementById('btnFilterPending'));
      renderOrders();
      updateLiquidation();
      updateTgCommandsCount();

      // No se optimiza una jornada nueva usando solamente coordenadas de caché.
      // Primero se exige validar el lote GPS actual en la sección @ubiCNFL.
      const cachedGps = workOrders.filter(o =>
        Number.isFinite(Number(o.lat)) && Number.isFinite(Number(o.lon))
      ).length;

      showToast(
        `Extraídas ${parsed.length} órdenes · valida GPS del lote actual` +
        (cachedGps ? ` (${cachedGps} referencias previas disponibles)` : '')
      );
      switchTab('ruta', document.querySelectorAll('.nav-tab-btn')[0]);
    }
  } catch (err) {
    console.error('Error procesando PDF:', err);
    alert('Error al leer el archivo PDF: ' + err.message + '\n\nPuedes usar la opción de "Ingreso Manual por Texto" abajo.');
  } finally {
    if (statusEl) statusEl.style.display = 'none';
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
            medidor: (pageMeds[i] || 'N/D').trim(),
            monto: (pageMontos[i] || '0.00').trim(),
            nis: (pageNis[i] || '').trim(),
            plan,
            direccion: dirLines[i] || 'San José Central',
            cliente: nomLines[i] || 'Abonado CNFL',
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

  // Método 3: Fallback por líneas si no cuadró en bloque
  if (orders.length === 0) {
    const lines = clean.split('\n');
    for (const line of lines) {
      const nisM = line.match(/\b\d{6,8}\b/);
      const locM = line.match(/\b\d{10}\b/);
      const ordM = line.match(/\b744\d{5}\b/);
      if (nisM && locM) {
        orders.push({
          id: `ord-${ordM ? ordM[0] : locM[0]}`,
          orden: ordM ? ordM[0] : '',
          nis: nisM[0],
          localizacion: locM[0],
          medidor: (line.match(/[M-]?\d{6,8}/) || ['N/D'])[0],
          monto: '0.00',
          direccion: line.substring(0, 45).trim(),
          cliente: 'Abonado CNFL',
          tipo: 'corta',
          status: 'pending',
          lectura: '',
          sello_instalado: '',
          sello_retirado: '',
          observaciones: ''
        });
      }
    }
  }

  return orders;
}

async function processRawOrders() {
  const raw = (document.getElementById('rawOrdersText').value || '').trim();
  if (!raw) {
    alert('Ingrese o pegue el texto de las órdenes.');
    return;
  }

  const parsed = parseCnflPdfText(raw);
  if (parsed.length > 0) {
    workOrders = parsed;
  } else {
    const lines = raw.split('\n').filter(l => l.trim().length > 0);
    workOrders = lines.map((line, idx) => ({
      id: `ord-manual-${idx + 1}`,
      nis: (line.match(/\b\d{6,8}\b/) || [`${1000000 + idx}`])[0],
      medidor: (line.match(/\b\d{5,8}\b/) || [`${800000 + idx}`])[0],
      localizacion: (line.match(/\b\d{10}\b/) || [''])[0],
      tipo: 'corta',
      cliente: line.split('-')[0].trim() || `Abonado #${idx + 1}`,
      direccion: line.trim(),
      status: 'pending',
      lectura: '',
      sello_instalado: '',
      sello_retirado: '',
      observaciones: ''
    }));
  }

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
  const badge = document.getElementById('tgCmdCount');
  if (badge) {
    const locs = workOrders.filter(o => o.localizacion && o.localizacion.trim().length >= 8);
    badge.innerText = locs.length;
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

function loadDemoOrders() {
  workOrders = [
    { id: 'demo-1', nis: '356663', orden: '74438946', localizacion: '0100402700', medidor: '848228', monto: '6500.00', plan: 'TG - COMERCIAL', cliente: 'ZENG ZENG XIAOHUAN', direccion: 'C.5-7 AV.CENTRAL, SOTANO GALERIAS RAMIREZ VALIDO', circuito: 'Circuito 1903 SUB_URUCA_3A', lat: 9.933611, lon: -84.075945, status: 'pending', lectura: '', sello_instalado: '', sello_retirado: '', observaciones: '' },
    { id: 'demo-2', nis: '283989', orden: '74438947', localizacion: '0100402744', medidor: '847386', monto: '3420.00', plan: 'TG - COMERCIAL', cliente: 'GOMEZ GOMEZ HELDA MARGARITA', direccion: 'SN JOSE, C-5 -7, AV CTRAL, RAMIREZ VALIDO, LOCAL 132-A', circuito: 'Circuito 1903 SUB_URUCA_3A', lat: 9.933611, lon: -84.075946, status: 'pending', lectura: '', sello_instalado: '', sello_retirado: '', observaciones: '' }
  ];
  localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
  setRouteFilter('pending', document.getElementById('btnFilterPending'));
  renderOrders();
  showToast('Modo demostración activo.');
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
REPORTE OFICIAL DE LIQUIDACIÓN — ZONA 50
Técnico: Ramírez Artavia Sebastián
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
Fin de Reporte Oficial de Cuadrilla CNFL`;
}

function updateLiquidation() {
  const container = document.getElementById('liquidationSummaryText');
  if (container) {
    container.innerText = generateLiquidationText();
  }
}

function copyLiquidation() {
  const text = generateLiquidationText();
  navigator.clipboard.writeText(text).then(() => {
    showToast('Reporte copiado al portapapeles.');
  });
}

function shareWhatsAppLiquidation() {
  const text = encodeURIComponent(generateLiquidationText());
  window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
}

function showToast(msg) {
  const t = document.getElementById('mobileToast');
  if (!t) return;
  t.innerText = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}
