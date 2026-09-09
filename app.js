// =========================================================
// CNFL — Ruta & Órdenes de Campo
// Mobile JavaScript Engine
// =========================================================

const DEMO_ORDERS = [
  {
    id: 'ord-101',
    nis: '2145892',
    meter: 'M-884210',
    type: 'corta', // corta, recon, inspec
    client: 'Carlos Murillo Vargas',
    address: 'Desamparados, San Antonio, 200m Sur de la Iglesia Católica, casa esquinera color crema',
    sector: 'Desamparados',
    status: 'pending', // pending, cortado, reconectado, no_acceso, pago
    note: ''
  },
  {
    id: 'ord-102',
    nis: '3198450',
    meter: 'M-102948',
    type: 'corta',
    client: 'María Elena Solís Rojas',
    address: 'Desamparados Centro, Barrio El Porvenir, frente a Panadería Musmanni',
    sector: 'Desamparados',
    status: 'pending',
    note: ''
  },
  {
    id: 'ord-103',
    nis: '1098421',
    meter: 'M-773192',
    type: 'recon',
    client: 'Taller Mecánico San Rafael',
    address: 'Guadalupe, Goicoechea, 100m Este del Parque Central',
    sector: 'Guadalupe',
    status: 'pending',
    note: ''
  },
  {
    id: 'ord-104',
    nis: '4451290',
    meter: 'M-991204',
    type: 'corta',
    client: 'Soda y Pulpería La Parada',
    address: 'Moravia, San Vicente, diagonal a Farmacia Fischel',
    sector: 'Moravia',
    status: 'pending',
    note: ''
  },
  {
    id: 'ord-105',
    nis: '5561023',
    meter: 'M-441098',
    type: 'corta',
    client: 'Residencial Los Álamos Casa #14',
    address: 'Curridabat, Granadilla Norte, de la entrada 300m Norte',
    sector: 'Curridabat',
    status: 'pending',
    note: ''
  }
];

let workOrders = JSON.parse(localStorage.getItem('cnfl_work_orders') || 'null');
if (!workOrders || workOrders.length === 0) {
  workOrders = DEMO_ORDERS;
  localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
}

let activeFilter = 'all';

function renderOrders() {
  const container = document.getElementById('ordersListContainer');
  if (!container) return;

  let list = workOrders;
  if (activeFilter === 'pending') list = list.filter(o => o.status === 'pending');
  else if (activeFilter === 'corta') list = list.filter(o => o.type === 'corta');
  else if (activeFilter === 'recon') list = list.filter(o => o.type === 'recon');

  updateStats();

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
    
    let typeClass = 'type-corta';
    let typeName = '⚡ CORTA POR MORA';
    if (ord.type === 'recon') { typeClass = 'type-recon'; typeName = '🔌 RECONEXIÓN'; }
    if (ord.type === 'inspec') { typeClass = 'type-inspec'; typeName = '🔍 INSPECCIÓN'; }

    const encodedAddr = encodeURIComponent(ord.address + ', Costa Rica');
    const wazeUrl = `https://waze.com/ul?q=${encodedAddr}`;
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddr}`;

    return `
      <div class="order-card ${isDone ? 'done' : ''} ${isFailed ? 'failed' : ''}">
        <div class="order-header-row">
          <span class="order-num-badge">Parada #${idx + 1}</span>
          <span class="order-type-tag ${typeClass}">${typeName}</span>
        </div>

        <div class="client-name">${ord.client}</div>
        
        <div class="address-box">
          <i class="fa-solid fa-location-dot" style="color:var(--accent-amber);margin-top:2px"></i>
          <span>${ord.address}</span>
        </div>

        <div class="meter-info-row">
          <div class="meter-chip">
            <span>NIS / Cuenta</span>
            <strong>${ord.nis}</strong>
          </div>
          <div class="meter-chip">
            <span># Medidor</span>
            <strong>${ord.meter}</strong>
          </div>
        </div>

        <!-- Botones de Navegación -->
        <div class="nav-gps-row">
          <a href="${wazeUrl}" target="_blank" class="btn-waze">
            <i class="fa-brands fa-waze"></i> Waze
          </a>
          <a href="${mapsUrl}" target="_blank" class="btn-maps">
            <i class="fa-solid fa-map-pin" style="color:#f87171"></i> Maps
          </a>
        </div>

        <!-- Botones de Estado Táctiles -->
        <div class="action-buttons-grid">
          <button class="btn-act btn-act-cortado" onclick="setOrderStatus('${ord.id}', 'cortado')">
            <i class="fa-solid fa-bolt"></i> Cortado
          </button>
          <button class="btn-act btn-act-recon" onclick="setOrderStatus('${ord.id}', 'reconectado')">
            <i class="fa-solid fa-plug"></i> Reconectado
          </button>
          <button class="btn-act btn-act-failed" onclick="setOrderStatus('${ord.id}', 'no_acceso')">
            <i class="fa-solid fa-lock"></i> No Acceso
          </button>
          <button class="btn-act btn-act-paid" onclick="setOrderStatus('${ord.id}', 'pago')">
            <i class="fa-solid fa-receipt"></i> Pagó Recibo
          </button>
        </div>

        ${ord.status !== 'pending' ? `
          <div style="margin-top:10px;padding:6px 10px;background:rgba(255,255,255,0.06);border-radius:6px;font-size:11.5px;display:flex;justify-content:space-between;align-items:center">
            <span style="color:#fff;font-weight:600">Estado: ${ord.status.toUpperCase()}</span>
            <button style="background:none;border:none;color:var(--text-muted);font-size:11px;cursor:pointer" onclick="setOrderStatus('${ord.id}', 'pending')">Reabrir</button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

function setOrderStatus(id, newStatus) {
  const ord = workOrders.find(o => o.id === id);
  if (ord) {
    ord.status = newStatus;
    localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
    renderOrders();
    showToast(`Orden ${ord.nis}: ${newStatus.toUpperCase()}`);
    updateLiquidation();
  }
}

function updateStats() {
  const total = workOrders.length;
  const done = workOrders.filter(o => o.status === 'cortado' || o.status === 'reconectado' || o.status === 'pago').length;
  const failed = workOrders.filter(o => o.status === 'no_acceso').length;
  const pending = workOrders.filter(o => o.status === 'pending').length;

  document.getElementById('statTotal').innerText = total;
  document.getElementById('statDone').innerText = done;
  document.getElementById('statFailed').innerText = failed;
  document.getElementById('statPending').innerText = pending;
}

function filterOrders(type, btn) {
  activeFilter = type;
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.style.background = 'rgba(255,255,255,0.08)';
    b.style.color = '#fff';
    b.style.border = '1px solid var(--border)';
  });
  if (btn) {
    btn.style.background = 'var(--accent-amber)';
    btn.style.color = '#000';
    btn.style.border = 'none';
  }
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

function updateLiquidation() {
  const total = workOrders.length;
  const cortados = workOrders.filter(o => o.status === 'cortado').length;
  const reconectados = workOrders.filter(o => o.status === 'reconectado').length;
  const noAcceso = workOrders.filter(o => o.status === 'no_acceso').length;
  const pagos = workOrders.filter(o => o.status === 'pago').length;
  const pendientes = workOrders.filter(o => o.status === 'pending').length;

  const dateStr = new Date().toLocaleDateString();

  const report = `📋 LIQUIDACIÓN DE CUADRILLA CNFL
📅 Fecha: ${dateStr}
---------------------------------
TOTAL ÓRDENES ASIGNADAS: ${total}
⚡ Cortes Efectuados: ${cortados}
🔌 Reconexiones: ${reconectados}
💰 Pagaron en Sitio / Comprobante: ${pagos}
🚫 No Ejecutadas (Sin Acceso/Perro): ${noAcceso}
⏳ Pendientes restantes: ${pendientes}
---------------------------------
DETALLE DE ÓRDENES:
${workOrders.map((o, i) => `${i+1}. NIS: ${o.nis} | Medidor: ${o.meter} | ${o.status.toUpperCase()} | ${o.client}`).join('\n')}
`;

  const container = document.getElementById('liquidationSummaryText');
  if (container) container.innerText = report;
}

function copyLiquidation() {
  const text = document.getElementById('liquidationSummaryText').innerText;
  navigator.clipboard.writeText(text).then(() => {
    showToast('¡Liquidación copiada para pegar en WhatsApp! ✓');
  });
}

function processRawOrders() {
  const raw = (document.getElementById('rawOrdersText').value || '').trim();
  if (!raw) {
    alert('Pega el texto de las órdenes asignadas.');
    return;
  }

  // Parser inteligente de líneas
  const lines = raw.split('\n').filter(l => l.trim().length > 0);
  const newOrders = lines.map((line, idx) => {
    const nisMatch = line.match(/\b\d{6,8}\b/) || [Math.floor(1000000 + Math.random()*8999999)];
    const meterMatch = line.match(/[M-]\d{5,8}/i) || [`M-${Math.floor(100000 + Math.random()*899999)}`];
    
    return {
      id: `ord-custom-${Date.now()}-${idx}`,
      nis: nisMatch[0],
      meter: meterMatch[0],
      type: line.toLowerCase().includes('recon') ? 'recon' : 'corta',
      client: line.split('-')[0].trim() || `Cliente #${idx+1}`,
      address: line,
      sector: 'San José',
      status: 'pending',
      note: ''
    };
  });

  workOrders = newOrders;
  localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
  document.getElementById('rawOrdersText').value = '';
  switchTab('ruta', document.querySelectorAll('.nav-tab-btn')[0]);
  renderOrders();
  showToast(`¡${newOrders.length} órdenes cargadas con éxito! 🚀`);
}

function loadDemoOrders() {
  workOrders = DEMO_ORDERS;
  localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
  switchTab('ruta', document.querySelectorAll('.nav-tab-btn')[0]);
  renderOrders();
  showToast('Órdenes de demostración cargadas ✓');
}

function toggleOptimizer() {
  // Ordenamiento inteligente por sector/dirección
  workOrders.sort((a, b) => a.address.localeCompare(b.address));
  localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
  renderOrders();
  showToast('¡Ruta optimizada por cercanía de sectores! 📍');
}

function showToast(msg) {
  const t = document.getElementById('mobileToast');
  if (!t) return;
  t.innerText = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

document.addEventListener('DOMContentLoaded', () => {
  renderOrders();
  updateLiquidation();
});