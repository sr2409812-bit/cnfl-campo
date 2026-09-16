// CNFL Campo — hotfix de georreferenciación @ubiCNFL
// Corrige el vínculo Waze -> Localización evitando confundir dígitos de latitud
// con el número de Localización y agrega control de duplicados/faltantes.

const CNFL_GEO_SEED_20260916 = {
  "0505001520": { lat: 9.94128033700002, lon: -84.095279262, circuito: "Circuito 907 BARRIO MEXICO" },
  "0505001480": { lat: 9.94118448199998, lon: -84.095301602, circuito: "Circuito 907 BARRIO MEXICO" },
  "0505001415": { lat: 9.94121743800002, lon: -84.095442472, circuito: "Circuito 907 BARRIO MEXICO" },
  "0505001365": { lat: 9.94132678300002, lon: -84.095384137, circuito: "Circuito 907 BARRIO MEXICO" },
  "0505001280": { lat: 9.94120764199999, lon: -84.095332725, circuito: "Circuito 907 BARRIO MEXICO" },
  "0505001185": { lat: 9.941289434, lon: -84.095366664, circuito: "Circuito 907 BARRIO MEXICO" },
  "0505001136": { lat: 9.941518637, lon: -84.095676723, circuito: "Circuito 907 BARRIO MEXICO" },
  "0505001134": { lat: 9.94151280800003, lon: -84.095673286, circuito: "Circuito 907 BARRIO MEXICO" },
  "0505001120": { lat: 9.94147710999999, lon: -84.095668112, circuito: "Circuito 907 BARRIO MEXICO" },
  "0505001110": { lat: 9.94145474800001, lon: -84.095688523, circuito: "Circuito 907 BARRIO MEXICO" },
  "0505001104": { lat: 9.94144981400001, lon: -84.095707462, circuito: "Circuito 907 BARRIO MEXICO" },
  "0505001080": { lat: 9.94148375100002, lon: -84.095748209, circuito: "Circuito 907 BARRIO MEXICO" },
  "0505000420": { lat: 9.94179149600001, lon: -84.095613431, circuito: "Circuito 907 BARRIO MEXICO" },
  "0505000285": { lat: 9.94186836199998, lon: -84.095626182, circuito: "Circuito 907 BARRIO MEXICO" },
  "0504700780": { lat: 9.93971996699997, lon: -84.096428085, circuito: "Circuito 907 BARRIO MEXICO" },
  "0504700420": { lat: 9.940608123, lon: -84.096149604, circuito: "Circuito 907 BARRIO MEXICO" },
  "0504700320": { lat: 9.94057842199999, lon: -84.096066345, circuito: "Circuito 907 BARRIO MEXICO" },
  "0504500060": { lat: 9.93979156300003, lon: -84.094726752, circuito: "Circuito 907 BARRIO MEXICO" },
  "0504401662": { lat: 9.94013559299998, lon: -84.094650618, circuito: "Circuito 907 BARRIO MEXICO" },
  "0504400522": { lat: 9.94046141500002, lon: -84.093384002, circuito: "Circuito 907 BARRIO MEXICO" },
  "0504400480": { lat: 9.94043256700002, lon: -84.093356886, circuito: "Circuito 907 BARRIO MEXICO" },
  "0504400400": { lat: 9.94026055699999, lon: -84.093382863, circuito: "Circuito 907 BARRIO MEXICO" },
  "0504400245": { lat: 9.94007706100001, lon: -84.093250014, circuito: "Circuito 907 BARRIO MEXICO" },
  "0504400240": { lat: 9.93999018300002, lon: -84.093216791, circuito: "Circuito 907 BARRIO MEXICO" }
};

function normalizeCnflLocalization(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 9 && /^[89]/.test(digits)) digits = '0' + digits;
  return digits;
}

function buildGeoEntry(loc, lat, lon, circuito) {
  return {
    localizacion: loc,
    lat,
    lon,
    circuito: circuito || 'Circuito CNFL',
    wazeUrl: `https://www.waze.com/ul?ll=${lat},${lon}&navigate=yes`,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`,
    resolvedAt: new Date().toISOString()
  };
}

loadGeoCache = async function () {
  try {
    let serverCache = {};
    let savedCache = {};

    try {
      const res = await fetch('resolved_cache.json?cb=' + Date.now(), { cache: 'no-store' });
      if (res.ok) serverCache = await res.json();
    } catch (e) {
      console.warn('No se pudo refrescar resolved_cache.json:', e);
    }

    try {
      const saved = localStorage.getItem('cnfl_geocache');
      if (saved) savedCache = JSON.parse(saved) || {};
    } catch (e) {
      console.warn('Caché local inválida:', e);
    }

    const seeded = {};
    for (const [loc, g] of Object.entries(CNFL_GEO_SEED_20260916)) {
      seeded[loc] = buildGeoEntry(loc, g.lat, g.lon, g.circuito);
    }

    geoCache = { ...serverCache, ...seeded, ...savedCache };
    localStorage.setItem('cnfl_geocache', JSON.stringify(geoCache));
  } catch (e) {
    console.warn('Caché no disponible:', e);
  }
};

function parseCnflBotReplies(raw) {
  const locMatches = [...raw.matchAll(/Localizaci[oó]n\s*#?\s*(\d{8,10})/gi)];
  const coordMatches = [
    ...raw.matchAll(/(?:[?&]ll=|[?&](?:q|query)=)([-+]?\d+(?:\.\d+)?),([-+]?\d+(?:\.\d+)?)/gi)
  ];

  const entries = [];
  const seenExact = new Set();
  const byLoc = new Map();
  const conflicts = new Set();
  let exactDuplicates = 0;

  for (const lm of locMatches) {
    const loc = normalizeCnflLocalization(lm[1]);
    if (loc.length !== 10) continue;

    let cm = null;
    for (let i = coordMatches.length - 1; i >= 0; i--) {
      if (coordMatches[i].index <= lm.index && (lm.index - coordMatches[i].index) < 600) {
        cm = coordMatches[i];
        break;
      }
    }
    if (!cm) {
      cm = coordMatches.find(m => m.index > lm.index && (m.index - lm.index) < 600) || null;
    }
    if (!cm) continue;

    const lat = parseFloat(cm[1]);
    const lon = parseFloat(cm[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const tail = raw.slice(lm.index, Math.min(raw.length, lm.index + 220));
    const circMatch = tail.match(/en\s+(Circuito\s+[^\)\n\r]+)/i);
    const circuito = circMatch ? circMatch[1].trim() : 'Circuito CNFL';

    const exactKey = `${loc}|${lat}|${lon}`;
    if (seenExact.has(exactKey)) {
      exactDuplicates++;
      continue;
    }
    seenExact.add(exactKey);

    if (byLoc.has(loc)) {
      const prev = byLoc.get(loc);
      if (prev.lat !== lat || prev.lon !== lon) conflicts.add(loc);
      continue;
    }

    const entry = { loc, lat, lon, circuito };
    byLoc.set(loc, entry);
    entries.push(entry);
  }

  return {
    entries,
    totalDetected: locMatches.length,
    exactDuplicates,
    conflicts: [...conflicts]
  };
}

importTelegramReplies = function () {
  const inputEl = document.getElementById('telegramBotReplies');
  if (!inputEl) return;

  const raw = inputEl.value.trim();
  if (!raw) {
    alert('Pega en la caja los mensajes que te respondió @ubiCNFL en Telegram.');
    return;
  }

  const parsed = parseCnflBotReplies(raw);
  if (parsed.entries.length === 0) {
    alert('No se detectaron pares válidos de Localización + coordenadas. Pega el mensaje completo del bot, incluyendo el enlace Waze y "Localización #...".');
    return;
  }

  const expected = new Set(
    workOrders
      .map(o => normalizeCnflLocalization(o.localizacion))
      .filter(loc => loc.length === 10)
  );

  let linkedToCurrentOrders = 0;
  const notInCurrentOrders = [];

  for (const e of parsed.entries) {
    geoCache[e.loc] = buildGeoEntry(e.loc, e.lat, e.lon, e.circuito);
    if (expected.has(e.loc)) linkedToCurrentOrders++;
    else notInCurrentOrders.push(e.loc);
  }

  localStorage.setItem('cnfl_geocache', JSON.stringify(geoCache));
  enrichOrdersWithCache();
  localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
  renderOrders();
  updateLiquidation();

  const missing = [...expected].filter(loc => {
    const ord = workOrders.find(o => normalizeCnflLocalization(o.localizacion) === loc);
    return !ord || !ord.lat || !ord.lon;
  });

  const summary = [
    `Resultados detectados: ${parsed.totalDetected}`,
    `Duplicados exactos: ${parsed.exactDuplicates}`,
    `Localizaciones únicas: ${parsed.entries.length}`,
    `Vinculadas a órdenes actuales: ${linkedToCurrentOrders}`
  ];

  if (notInCurrentOrders.length) {
    summary.push(`No pertenecen a la bandeja actual: ${notInCurrentOrders.length}`);
  }

  if (parsed.conflicts.length) {
    summary.push(`CONFLICTOS GPS: ${parsed.conflicts.join(', ')}`);
    alert(summary.join('\n') + '\n\nNo se optimizó la ruta porque hay una misma localización con coordenadas distintas.');
    return;
  }

  if (missing.length > 0) {
    summary.push(`Faltan coordenadas: ${missing.length}`);
    alert(summary.join('\n') + `\n\nFaltantes:\n${missing.join('\n')}\n\nLas coordenadas recibidas sí quedaron guardadas, pero NO se optimizó la ruta porque el lote aún está incompleto.`);
    return;
  }

  optimizeCurrentRoute();
  localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
  inputEl.value = '';
  showToast(`GPS listo: ${parsed.entries.length} únicas, ${parsed.exactDuplicates} duplicadas. Ruta completa.`);
  switchTab('ruta', document.querySelectorAll('.nav-tab-btn')[0]);
};

// =========================================================
// CORRECCIÓN DE MONTOS CNFL
// =========================================================
// El PDF puede traer montos como "19,248.37". JavaScript parseFloat("19,248.37")
// devuelve 19, por eso la tarjeta mostraba ₡19. Aquí convertimos separadores de miles
// y decimales antes de que renderOrders() y Liquidación usen el monto.
function normalizeCnflAmount(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';

  let s = String(value).trim().replace(/[₡\s]/g, '');
  if (!s) return '';

  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');

  if (comma >= 0 && dot >= 0) {
    if (comma > dot) {
      // Ej: 19.248,37
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // Ej: 19,248.37
      s = s.replace(/,/g, '');
    }
  } else if (comma >= 0) {
    const decimals = s.length - comma - 1;
    if (decimals === 2) {
      // Ej: 19248,37
      s = s.replace(',', '.');
    } else {
      // Ej: 19,248
      s = s.replace(/,/g, '');
    }
  } else if (dot >= 0) {
    const parts = s.split('.');
    if (parts.length > 2) {
      s = parts.join('');
    } else if (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3) {
      // Ej: 19.248 usado como separador de miles
      s = parts.join('');
    }
  }

  s = s.replace(/[^0-9.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? String(n) : String(value);
}

function normalizeAllCnflAmounts() {
  let changed = false;
  for (const ord of workOrders || []) {
    if (ord.monto === undefined || ord.monto === null || ord.monto === '') continue;
    const normalized = normalizeCnflAmount(ord.monto);
    if (String(ord.monto) !== String(normalized)) {
      ord.monto = normalized;
      changed = true;
    }
  }
  if (changed) {
    localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
  }
  return changed;
}

const renderOrdersBeforeAmountFix = renderOrders;
renderOrders = function () {
  normalizeAllCnflAmounts();
  return renderOrdersBeforeAmountFix();
};

console.log('[CNFL] Hotfix Telegram/Waze + montos 2026-09-16 activo');
