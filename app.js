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

// Inicializar órdenes de trabajo
async function initOrders() {
  const savedOrders = localStorage.getItem('cnfl_work_orders');
  if (savedOrders) {
    try {
      workOrders = JSON.parse(savedOrders);
      if (workOrders.length > 0) return;
    } catch (e) {}
  }
  await loadTodayPreloadedOrders();
}

// Cargar las órdenes de hoy (41 órdenes oficiales)
async function loadTodayPreloadedOrders() {
  try {
    const res = await fetch('orders_today.json');
    if (res.ok) {
      workOrders = await res.json();
      enrichOrdersWithCache();
      localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
      setRouteFilter('pending', document.getElementById('btnFilterPending'));
      renderOrders();
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
    const loc = (ord.localizacion || '').trim();
    if (loc && geoCache[loc]) {
      const geo = geoCache[loc];
      if (geo.lat && geo.lon) {
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
    const isDone = ord.status === 'cortado' || ord.status === 'reconectado' || ord.status === 'pago';
    const isFailed = ord.status === 'no_acceso';
    
    const isRecon = (ord.tipo || '').includes('recon');
    const typeClass = isRecon ? 'pill-recon' : 'pill-corta';
    const typeName = isRecon ? 'RECONEXIÓN' : (ord.plan && ord.plan.includes('COMERCIAL') ? 'CORTE COMERCIAL' : 'CORTE RESIDENCIAL');

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
          <div class="client-name">${ord.cliente || ord.client || 'ABONADO CNFL'}</div>
          ${ord.monto ? `<div class="monto-val">₡${parseFloat(ord.monto).toLocaleString('es-CR')}</div>` : ''}
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

        <!-- Botones de Acción de Campo -->
        <div class="execution-actions-grid">
          <button class="btn-status-act btn-act-corte" onclick="setOrderStatus('${cardId}', 'cortado')">
            <i class="fa-solid fa-bolt"></i> Cortado
          </button>
          <button class="btn-status-act btn-act-recon" onclick="setOrderStatus('${cardId}', 'reconectado')">
            <i class="fa-solid fa-plug"></i> Reconectado
          </button>
          <button class="btn-status-act btn-act-noacc" onclick="setOrderStatus('${cardId}', 'no_acceso')">
            <i class="fa-solid fa-ban"></i> Sin Acceso
          </button>
          <button class="btn-status-act btn-act-pago" onclick="setOrderStatus('${cardId}', 'pago')">
            <i class="fa-solid fa-receipt"></i> Pagó Sitio
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
              <button type="button" class="tech-tag" onclick="appendQuickObs('${cardId}', 'Portón con candado')">Portón con candado</button>
              <button type="button" class="tech-tag" onclick="appendQuickObs('${cardId}', 'Perro peligroso')">Perro peligroso</button>
              <button type="button" class="tech-tag" onclick="appendQuickObs('${cardId}', 'Medidor directo')">Medidor directo</button>
              <button type="button" class="tech-tag" onclick="appendQuickObs('${cardId}', 'Comprobante Sinpe verificado')">Sinpe verificado</button>
              <button type="button" class="tech-tag" onclick="appendQuickObs('${cardId}', 'Abonado no permite corte')">No permite corte</button>
              <button type="button" class="tech-tag" onclick="appendQuickObs('${cardId}', 'Display ilegible/apagado')">Display dañado</button>
              <button type="button" class="tech-tag" onclick="appendQuickObs('${cardId}', 'Inmueble deshabitado')">Deshabitado</button>
              <button type="button" class="tech-tag" onclick="appendQuickObs('${cardId}', 'Sello violentado')">Sello violentado</button>
            </div>
          </div>
        </div>

        ${nextDistText ? `<div class="next-stop-indicator">${nextDistText}</div>` : ''}

        <!-- Opción para reabrir si se consulta desde la pestaña Gestionadas -->
        ${ord.status !== 'pending' ? `
          <div class="done-reopen-row">
            <span style="color:#86EFAC;font-weight:700;font-family:var(--font-mono)">ESTADO: ${ord.status.toUpperCase()}</span>
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

  const valid = workOrders.filter(o => o.status === 'pending' && o.lat && o.lon);
  if (valid.length <= 1) {
    const pendingCount = workOrders.filter(o => o.status === 'pending').length;
    subtitle.innerText = `${pendingCount} paradas pendientes asignadas`;
    return;
  }

  let totalKm = 0;
  for (let i = 0; i < valid.length - 1; i++) {
    totalKm += haversineDistance(valid[i].lat, valid[i].lon, valid[i + 1].lat, valid[i + 1].lon);
  }

  const pendingCount = workOrders.filter(o => o.status === 'pending').length;
  subtitle.innerText = `${pendingCount} paradas pendientes • Distancia estimada: ~${totalKm.toFixed(1)} km`;
}

function setOrderStatus(id, newStatus) {
  const ord = workOrders.find(o => (o.id === id || o.orden === id || String(o.orden) === String(id)));
  if (ord) {
    ord.status = newStatus;
    localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
    
    // Al finalizar una orden, si estamos en la vista de pendientes, se quita automáticamente
    renderOrders();
    showToast(`NIS ${ord.nis}: ${newStatus.toUpperCase()}`);
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
  const done = workOrders.filter(o => o.status === 'cortado' || o.status === 'reconectado' || o.status === 'pago').length;
  const failed = workOrders.filter(o => o.status === 'no_acceso').length;
  const pending = workOrders.filter(o => o.status === 'pending').length;
  const completedTotal = done + failed;

  const elTotal = document.getElementById('statTotal');
  const elDone = document.getElementById('statDone');
  const elFailed = document.getElementById('statFailed');
  const elPending = document.getElementById('statPending');

  const elSegPending = document.getElementById('segCountPending');
  const elSegDone = document.getElementById('segCountDone');
  const elSegAll = document.getElementById('segCountAll');

  if (elTotal) elTotal.innerText = total;
  if (elDone) elDone.innerText = done;
  if (elFailed) elFailed.innerText = failed;
  if (elPending) elPending.innerText = pending;

  if (elSegPending) elSegPending.innerText = pending;
  if (elSegDone) elSegDone.innerText = completedTotal;
  if (elSegAll) elSegAll.innerText = total;
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
}

// =========================================================
// PARSER DE PDF OFICIAL EN NAVEGADOR
// =========================================================

async function handlePdfUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById('pdfLoadingStatus');
  if (statusEl) statusEl.style.display = 'block';

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageStrings = textContent.items.map(item => item.str);
      fullText += pageStrings.join(' ') + '\n';
    }

    const parsed = parseCnflPdfText(fullText);
    if (parsed.length === 0) {
      alert('No se detectaron órdenes con formato oficial de CNFL en este documento.');
    } else {
      workOrders = parsed;
      enrichOrdersWithCache();
      localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
      optimizeCurrentRoute();
      setRouteFilter('pending', document.getElementById('btnFilterPending'));
      renderOrders();
      showToast(`Extraídas ${parsed.length} órdenes del PDF con éxito.`);
    }
  } catch (err) {
    console.error('Error procesando PDF:', err);
    alert('Error al leer el archivo PDF: ' + err.message);
  } finally {
    if (statusEl) statusEl.style.display = 'none';
    event.target.value = '';
  }
}

function parseCnflPdfText(rawText) {
  const orders = [];
  const regex = /(\d{6,8})\s+(TG - COMERCIAL|TR - RESIDENCIAL)\s+(\d{8})\s+(\d{10})\s+([A-Z0-9]+)\s+([\d,.]+)\s+([^0-9\n]+(?:\d+[^0-9\n]*)*?)\s+([A-Z\s]{4,})/g;
  
  let match;
  while ((match = regex.exec(rawText)) !== null) {
    const nis = match[1];
    const plan = match[2];
    const orden = match[3];
    const localizacion = match[4];
    const medidor = match[5];
    const monto = match[6];
    const direccion = match[7].trim();
    const cliente = match[8].trim();

    orders.push({
      id: `ord-${orden}`,
      orden,
      nis,
      plan,
      localizacion,
      medidor,
      monto,
      direccion,
      cliente,
      tipo: plan.includes('COMERCIAL') ? 'corta_comercial' : 'corta_residencial',
      status: 'pending',
      lectura: '',
      sello_instalado: '',
      sello_retirado: '',
      observaciones: ''
    });
  }

  if (orders.length === 0) {
    const lines = rawText.split('\n');
    for (const line of lines) {
      const nisM = line.match(/\b\d{6,8}\b/);
      const locM = line.match(/\b\d{10}\b/);
      const ordM = line.match(/\b744\d{5}\b/);
      if (nisM && locM) {
        orders.push({
          id: `ord-${ordM ? ordM[0] : Date.now()}`,
          orden: ordM ? ordM[0] : '',
          nis: nisM[0],
          localizacion: locM[0],
          medidor: (line.match(/[M-]?\d{6,8}/) || [''])[0],
          direccion: line.substring(0, 40),
          cliente: 'Cliente Abonado',
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

function processRawOrders() {
  const raw = (document.getElementById('rawOrdersText').value || '').trim();
  if (!raw) {
    alert('Ingrese el texto de las órdenes.');
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
      direccion: line,
      status: 'pending',
      lectura: '',
      sello_instalado: '',
      sello_retirado: '',
      observaciones: ''
    }));
  }

  enrichOrdersWithCache();
  localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
  document.getElementById('rawOrdersText').value = '';
  setRouteFilter('pending', document.getElementById('btnFilterPending'));
  renderOrders();
  showToast(`Cargadas ${workOrders.length} órdenes.`);
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
  const reconectados = workOrders.filter(o => o.status === 'reconectado').length;
  const noAcceso = workOrders.filter(o => o.status === 'no_acceso').length;
  const pagos = workOrders.filter(o => o.status === 'pago').length;
  const pendientes = workOrders.filter(o => o.status === 'pending').length;
  const ejecutadas = cortados + reconectados + pagos;

  const now = new Date();
  const dateStr = now.toLocaleDateString('es-CR');
  const timeStr = now.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });

  return `==================================================
COMPAÑÍA NACIONAL DE FUERZA Y LUZ
REPORTE DE EJECUCIÓN EN CAMPO — ZONA 50
Técnico: Ramírez Artavia Sebastián
Fecha: ${dateStr} | Hora: ${timeStr}
==================================================
RESUMEN DE GESTIÓN:
• Total Asignadas: ${total}
• Total Ejecutadas: ${ejecutadas}
  - Cortes Realizados: ${cortados}
  - Reconexiones: ${reconectados}
  - Pagos en Sitio / Verificados: ${pagos}
• No Ejecutadas (Sin Acceso): ${noAcceso}
• Pendientes Restantes: ${pendientes}
==================================================
DETALLE COMPLETO DE ÓRDENES:

${workOrders.map((o, i) => {
  const stateLabel = o.status === 'cortado' ? '[CORTADO]'
    : (o.status === 'reconectado' ? '[RECONECTADO]'
    : (o.status === 'pago' ? '[PAGO VERIFICADO]'
    : (o.status === 'no_acceso' ? '[SIN ACCESO]' : '[PENDIENTE]')));

  const lines = [
    `${i + 1}. ${stateLabel} NIS: ${o.nis} | Medidor: ${o.medidor || o.meter}`,
    `   Localización: ${o.localizacion || 'N/D'} | Orden: ${o.orden || 'N/D'}`,
    `   Lectura: ${o.lectura ? `${o.lectura} kWh` : 'N/R'} | Sello Inst: ${o.sello_instalado || 'N/R'} | Sello Ret: ${o.sello_retirado || 'N/R'}`,
    `   Obs: ${o.observaciones || 'Sin observaciones'}`,
    `   Cliente: ${o.cliente || o.client || 'N/D'} | Monto: ₡${o.monto ? parseFloat(o.monto).toLocaleString('es-CR') : '0'}`,
    `   Dirección: ${o.direccion || o.address || 'N/D'}`
  ];

  return lines.join('\n');
}).join('\n\n')}
==================================================
Fin de Reporte de Cuadrilla`;
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
