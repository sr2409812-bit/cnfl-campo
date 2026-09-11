// =========================================================
// CNFL — Ruta & Órdenes de Campo
// Motor Móvil: TSP Optimizer, Geocoding Cache & PDF Parser
// =========================================================

let workOrders = [];
let activeFilter = 'all';
let searchQuery = '';
let geoCache = {};

// 1. Inicialización
document.addEventListener('DOMContentLoaded', async () => {
  await loadGeoCache();
  await initOrders();
  renderOrders();
  updateLiquidation();
});

// Cargar caché de geolocalizaciones
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
    console.warn('No local geocache loaded:', e);
  }
}

// Inicializar órdenes
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
      switchTab('ruta', document.querySelectorAll('.nav-tab-btn')[0]);
      renderOrders();
      showToast(`¡${workOrders.length} órdenes reales de hoy cargadas! ⚡`);
      return;
    }
  } catch (e) {
    console.warn('Could not fetch orders_today.json, using fallback');
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
  }
}

// =========================================================
// ALGORITMO TSP (Traveling Salesperson Problem) + 2-OPT
// =========================================================

function haversineDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 9999;
  const R = 6371; // radio terrestre km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distancia en km
}

function optimizeCurrentRoute() {
  if (!workOrders || workOrders.length <= 1) {
    showToast('No hay suficientes órdenes para optimizar');
    return;
  }

  showToast('Calculando ruta más corta con IA...');

  // Separar órdenes con coordenadas de las que no tienen
  const withCoords = workOrders.filter(o => o.lat && o.lon);
  const withoutCoords = workOrders.filter(o => !o.lat || !o.lon);

  if (withCoords.length === 0) {
    showToast('Las órdenes no tienen coordenadas GPS todavía');
    return;
  }

  // 1. Algoritmo de Vecino Más Cercano (Nearest Neighbor)
  // Iniciamos desde el punto más al noroeste (ej. La Uruca / Sabana) o la primera orden
  let unvisited = [...withCoords];
  const tour = [];

  // Encontrar el punto más cercano a Plantel Central CNFL / Sabana (9.9355, -84.1035)
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

  // 2. Optimización 2-Opt para desanudar cruces de ruta
  let optimizedTour = twoOptImprovement(tour);

  // Concatenar las que no tenían coordenadas al final
  workOrders = [...optimizedTour, ...withoutCoords];
  localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));

  renderOrders();
  showToast(`¡Ruta optimizada! ${withCoords.length} paradas en orden de menor distancia 🚀`);
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

  let list = workOrders;

  // Filtros
  if (activeFilter === 'pending') list = list.filter(o => o.status === 'pending');
  else if (activeFilter === 'corta') list = list.filter(o => (o.tipo || o.plan || '').toLowerCase().includes('corta') || (o.plan || '').includes('TR') || (o.plan || '').includes('TG'));
  else if (activeFilter === 'recon') list = list.filter(o => (o.tipo || '').toLowerCase().includes('recon'));

  // Búsqueda
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
    container.innerHTML = `
      <div style="text-align:center;padding:40px 20px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg)">
        <i class="fa-solid fa-clipboard-check" style="font-size:32px;color:var(--accent-green);margin-bottom:12px;display:block"></i>
        <p style="color:#fff;font-weight:700">No hay órdenes en este filtro</p>
        <p style="font-size:12px;color:var(--text-muted);margin-top:4px">¡Buen trabajo en la ruta!</p>
      </div>`;
    return;
  }

  container.innerHTML = list.map((ord, idx) => {
    const isDone = ord.status === 'cortado' || ord.status === 'reconectado' || ord.status === 'pago';
    const isFailed = ord.status === 'no_acceso';
    
    const isRecon = (ord.tipo || '').includes('recon');
    const typeClass = isRecon ? 'type-recon' : 'type-corta';
    const typeName = isRecon ? '🔌 RECONEXIÓN' : (ord.plan && ord.plan.includes('COMERCIAL') ? '⚡ CORTA COMERCIAL' : '⚡ CORTA RESIDENCIAL');

    const hasGps = ord.lat && ord.lon;
    const wazeUrl = hasGps ? `https://www.waze.com/ul?ll=${ord.lat},${ord.lon}&navigate=yes` : `https://waze.com/ul?q=${encodeURIComponent(ord.direccion + ', San José Costa Rica')}`;
    const mapsUrl = hasGps ? `https://www.google.com/maps/search/?api=1&query=${ord.lat},${ord.lon}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ord.direccion + ', San José Costa Rica')}`;

    // Calcular distancia a la siguiente parada
    let nextDistText = '';
    if (idx < list.length - 1 && hasGps && list[idx + 1].lat && list[idx + 1].lon) {
      const dKm = haversineDistance(ord.lat, ord.lon, list[idx + 1].lat, list[idx + 1].lon);
      if (dKm < 1) {
        const meters = Math.round(dKm * 1000);
        nextDistText = `➡️ Siguiente parada a <strong>${meters} metros</strong>`;
      } else {
        nextDistText = `➡️ Siguiente parada a <strong>${dKm.toFixed(1)} km</strong>`;
      }
    }

    return `
      <div class="order-card ${isDone ? 'done' : ''} ${isFailed ? 'failed' : ''}">
        <div class="order-header-row">
          <span class="order-num-badge">Parada #${idx + 1}</span>
          <span class="order-type-tag ${typeClass}">${typeName}</span>
          ${hasGps ? '<span class="gps-pill-exact"><i class="fa-solid fa-location-dot"></i> GPS Exacto</span>' : '<span style="font-size:10px;color:var(--text-muted)">Dir. aprox</span>'}
        </div>

        <div class="client-name">${ord.cliente || ord.client || 'Cliente Abonado'}</div>
        
        <div class="address-box">
          <i class="fa-solid fa-location-dot" style="color:var(--accent-amber);margin-top:2px;flex-shrink:0"></i>
          <span>${ord.direccion || ord.address}</span>
        </div>

        <div class="chips-grid">
          <div class="info-chip">NIS: <strong>${ord.nis}</strong></div>
          <div class="info-chip">Medidor: <strong>${ord.medidor || ord.meter}</strong></div>
          ${ord.localizacion ? `<div class="info-chip">Loc: <strong>${ord.localizacion}</strong></div>` : ''}
          ${ord.monto ? `<div class="monto-badge">₡${parseFloat(ord.monto).toLocaleString('es-CR')}</div>` : ''}
          ${ord.circuito ? `<div class="circuit-badge"><i class="fa-solid fa-bolt"></i> ${ord.circuito}</div>` : ''}
        </div>

        <!-- Botones de Navegación 1-Touch -->
        <div class="nav-gps-row">
          <a href="${wazeUrl}" target="_blank" class="btn-waze">
            <i class="fa-brands fa-waze"></i> Waze GPS
          </a>
          <a href="${mapsUrl}" target="_blank" class="btn-maps">
            <i class="fa-solid fa-map-pin" style="color:#ef4444"></i> Maps GPS
          </a>
        </div>

        <!-- Botones de Estado Táctiles -->
        <div class="action-buttons-grid">
          <button class="btn-act btn-act-cortado" onclick="setOrderStatus('${ord.id || ord.orden}', 'cortado')">
            <i class="fa-solid fa-bolt"></i> Cortado
          </button>
          <button class="btn-act btn-act-recon" onclick="setOrderStatus('${ord.id || ord.orden}', 'reconectado')">
            <i class="fa-solid fa-plug"></i> Reconectado
          </button>
          <button class="btn-act btn-act-failed" onclick="setOrderStatus('${ord.id || ord.orden}', 'no_acceso')">
            <i class="fa-solid fa-lock"></i> No Acceso
          </button>
          <button class="btn-act btn-act-paid" onclick="setOrderStatus('${ord.id || ord.orden}', 'pago')">
            <i class="fa-solid fa-receipt"></i> Pagó Recibo
          </button>
        </div>

        ${nextDistText ? `<div class="next-distance-banner">${nextDistText}</div>` : ''}

        ${ord.status !== 'pending' ? `
          <div style="margin-top:10px;padding:6px 10px;background:rgba(255,255,255,0.06);border-radius:6px;font-size:11.5px;display:flex;justify-content:space-between;align-items:center">
            <span style="color:#fff;font-weight:600">Estado: ${ord.status.toUpperCase()}</span>
            <button style="background:none;border:none;color:var(--text-muted);font-size:11px;cursor:pointer" onclick="setOrderStatus('${ord.id || ord.orden}', 'pending')">Reabrir</button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

function calculateRouteDistance() {
  const subtitle = document.getElementById('routeDistanceSubtitle');
  if (!subtitle) return;

  const valid = workOrders.filter(o => o.lat && o.lon);
  if (valid.length <= 1) {
    subtitle.innerText = `${workOrders.length} paradas asignadas`;
    return;
  }

  let totalKm = 0;
  for (let i = 0; i < valid.length - 1; i++) {
    totalKm += haversineDistance(valid[i].lat, valid[i].lon, valid[i + 1].lat, valid[i + 1].lon);
  }

  subtitle.innerText = `${workOrders.length} paradas • Recorrido total estimado: ~${totalKm.toFixed(1)} km`;
}

function setOrderStatus(id, newStatus) {
  const ord = workOrders.find(o => (o.id === id || o.orden === id || String(o.orden) === String(id)));
  if (ord) {
    ord.status = newStatus;
    localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
    renderOrders();
    showToast(`NIS ${ord.nis}: ${newStatus.toUpperCase()}`);
    updateLiquidation();
  }
}

function updateStats() {
  const total = workOrders.length;
  const done = workOrders.filter(o => o.status === 'cortado' || o.status === 'reconectado' || o.status === 'pago').length;
  const failed = workOrders.filter(o => o.status === 'no_acceso').length;
  const pending = workOrders.filter(o => o.status === 'pending').length;

  const elTotal = document.getElementById('statTotal');
  const elDone = document.getElementById('statDone');
  const elFailed = document.getElementById('statFailed');
  const elPending = document.getElementById('statPending');
  const elCountAll = document.getElementById('countAll');
  const elCountPending = document.getElementById('countPending');

  if (elTotal) elTotal.innerText = total;
  if (elDone) elDone.innerText = done;
  if (elFailed) elFailed.innerText = failed;
  if (elPending) elPending.innerText = pending;
  if (elCountAll) elCountAll.innerText = total;
  if (elCountPending) elCountPending.innerText = pending;
}

function filterOrders(type, btn) {
  activeFilter = type;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderOrders();
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
// PARSER DE PDF EN NAVEGADOR
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
      alert('No se pudieron detectar órdenes con formato CNFL en este archivo.');
    } else {
      workOrders = parsed;
      enrichOrdersWithCache();
      localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
      optimizeCurrentRoute();
      switchTab('ruta', document.querySelectorAll('.nav-tab-btn')[0]);
      renderOrders();
      showToast(`¡${parsed.length} órdenes extraídas del PDF con éxito! 📄⚡`);
    }
  } catch (err) {
    console.error('Error leyendo PDF:', err);
    alert('Error al procesar el archivo PDF: ' + err.message);
  } finally {
    if (statusEl) statusEl.style.display = 'none';
    event.target.value = '';
  }
}

function parseCnflPdfText(rawText) {
  const orders = [];
  // Regex para filas CNFL: NIS (6-8 dig), Plan, Orden (8 dig), Localización (10 dig), Medidor, Monto
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
      status: 'pending'
    });
  }

  // Fallback si el PDF no matchea exactamente la regex completa: extraer por NIS y Orden
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
          cliente: 'Cliente CNFL',
          tipo: 'corta',
          status: 'pending'
        });
      }
    }
  }

  return orders;
}

// Pegar texto manual
function processRawOrders() {
  const raw = (document.getElementById('rawOrdersText').value || '').trim();
  if (!raw) {
    alert('Pega el texto de las órdenes asignadas.');
    return;
  }

  const parsed = parseCnflPdfText(raw);
  if (parsed.length > 0) {
    workOrders = parsed;
  } else {
    // Parser simple línea a línea
    const lines = raw.split('\n').filter(l => l.trim().length > 0);
    workOrders = lines.map((line, idx) => ({
      id: `ord-manual-${idx + 1}`,
      nis: (line.match(/\b\d{6,8}\b/) || [`${1000000 + idx}`])[0],
      medidor: (line.match(/\b\d{5,8}\b/) || [`${800000 + idx}`])[0],
      localizacion: (line.match(/\b\d{10}\b/) || [''])[0],
      tipo: 'corta',
      cliente: line.split('-')[0].trim() || `Abonado #${idx + 1}`,
      direccion: line,
      status: 'pending'
    }));
  }

  enrichOrdersWithCache();
  localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
  document.getElementById('rawOrdersText').value = '';
  switchTab('ruta', document.querySelectorAll('.nav-tab-btn')[0]);
  renderOrders();
  showToast(`¡${workOrders.length} órdenes cargadas! 🚀`);
}

function loadDemoOrders() {
  workOrders = [
    { id: 'demo-1', nis: '356663', orden: '74438946', localizacion: '0100402700', medidor: '848228', monto: '6500.00', plan: 'TG - COMERCIAL', cliente: 'ZENG ZENG XIAOHUAN', direccion: 'C.5-7 AV.CENTRAL, SOTANO GALERIAS RAMIREZ VALIDO', circuito: 'Circuito 1903 SUB_URUCA_3A', lat: 9.933611, lon: -84.075945, status: 'pending' },
    { id: 'demo-2', nis: '283989', orden: '74438947', localizacion: '0100402744', medidor: '847386', monto: '3420.00', plan: 'TG - COMERCIAL', cliente: 'GOMEZ GOMEZ HELDA MARGARITA', direccion: 'SN JOSE, C-5 -7, AV CTRAL, RAMIREZ VALIDO, LOCAL 132-A', circuito: 'Circuito 1903 SUB_URUCA_3A', lat: 9.933611, lon: -84.075946, status: 'pending' },
    { id: 'demo-3', nis: '27588884', orden: '74438948', localizacion: '0100404216', medidor: '1191823', monto: '4520.00', plan: 'TR - RESIDENCIAL', cliente: 'WU WU FUYUAN', direccion: 'C 5 Y 7 AVE 2', circuito: 'Circuito 1903 SUB_URUCA_3A', lat: 9.932847, lon: -84.075907, status: 'pending' },
    { id: 'demo-4', nis: '28141293', orden: '74438950', localizacion: '0101200560', medidor: '1208479', monto: '3580.00', plan: 'TR - RESIDENCIAL', cliente: 'CASA CHIQUITA S.A.', direccion: 'DE LA BOMBA LA PRIMAVERA 100 E Y 75 S', circuito: 'Circuito 2103 SUB_ANGELES_3A', lat: 9.932730, lon: -84.069913, status: 'pending' }
  ];
  localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
  switchTab('ruta', document.querySelectorAll('.nav-tab-btn')[0]);
  renderOrders();
  showToast('Modo demostración cargado ✓');
}

// =========================================================
// LIQUIDACIÓN & WHATSAPP
// =========================================================

function generateLiquidationText() {
  const total = workOrders.length;
  const cortados = workOrders.filter(o => o.status === 'cortado').length;
  const reconectados = workOrders.filter(o => o.status === 'reconectado').length;
  const noAcceso = workOrders.filter(o => o.status === 'no_acceso').length;
  const pagos = workOrders.filter(o => o.status === 'pago').length;
  const pendientes = workOrders.filter(o => o.status === 'pending').length;

  const dateStr = new Date().toLocaleDateString('es-CR');

  return `📋 LIQUIDACIÓN DE CUADRILLA CNFL
👤 Técnico: Ramírez Artavia Sebastián
📅 Fecha: ${dateStr} • Zona 50 Central
---------------------------------
TOTAL ÓRDENES ASIGNADAS: ${total}
⚡ Cortes Efectuados: ${cortados}
🔌 Reconexiones: ${reconectados}
💰 Pagos Verificados en Sitio: ${pagos}
🚫 No Ejecutadas (Sin Acceso/Perro): ${noAcceso}
⏳ Pendientes restantes: ${pendientes}
---------------------------------
DETALLE:
${workOrders.map((o, i) => `${i + 1}. NIS ${o.nis} | Med: ${o.medidor || o.meter} | ${o.status.toUpperCase()} | ${o.cliente || o.client}`).join('\n')}`;
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
    showToast('¡Liquidación copiada al portapapeles! ✓');
  });
}

function shareWhatsAppLiquidation() {
  const text = encodeURIComponent(generateLiquidationText());
  window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
}

function showToast(msg) {
  const t = document.getElementById('mobileToast');
  if (!t) return;
  t.innerHTML = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}
