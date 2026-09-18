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
      seeded[loc] = {
        ...buildGeoEntry(loc, g.lat, g.lon, g.circuito),
        source: 'seed'
      };
    }

    // Base confiable: seed < servidor.
    geoCache = { ...seeded, ...serverCache };

    // Una caché local antigua ya no pisa silenciosamente al servidor.
    // Solo gana si fue confirmada explícitamente por el usuario en una importación actual,
    // o si el servidor todavía no conoce esa localización.
    for (const [loc, entry] of Object.entries(savedCache)) {
      if (!geoCache[loc] || entry.source === 'user-confirmed') {
        geoCache[loc] = entry;
      }
    }

    localStorage.setItem('cnfl_geocache', JSON.stringify(geoCache));
  } catch (e) {
    console.warn('Caché no disponible:', e);
  }
};

function parseCnflBotReplies(raw) {
  const entries = [];
  const seenExact = new Set();
  const byLoc = new Map();
  const conflicts = new Set();
  let exactDuplicates = 0;
  let totalDetected = 0;

  function addEntry(locRaw, latRaw, lonRaw, circuito) {
    const loc = normalizeCnflLocalization(locRaw);
    const lat = Number(latRaw);
    const lon = Number(lonRaw);
    if (loc.length !== 10) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return;

    totalDetected++;
    const exactKey = `${loc}|${lat}|${lon}`;
    if (seenExact.has(exactKey)) {
      exactDuplicates++;
      return;
    }
    seenExact.add(exactKey);

    if (byLoc.has(loc)) {
      const prev = byLoc.get(loc);
      if (prev.lat !== lat || prev.lon !== lon) conflicts.add(loc);
      return;
    }

    const entry = {
      loc,
      lat,
      lon,
      circuito: circuito || 'Circuito CNFL'
    };
    byLoc.set(loc, entry);
    entries.push(entry);
  }

  // Formato normal de @ubiCNFL / Google Maps / Waze.
  const locMatches = [...raw.matchAll(/Localizaci[oó]n\s*#?\s*(\d{8,10})/gi)];
  const coordMatches = [
    ...raw.matchAll(/(?:[?&]ll=|[?&](?:q|query)=)([-+]?\d+(?:\.\d+)?),([-+]?\d+(?:\.\d+)?)/gi)
  ];

  for (const lm of locMatches) {
    let cm = null;

    // En las respuestas actuales el link suele ir antes de "Localización #...".
    for (let i = coordMatches.length - 1; i >= 0; i--) {
      if (coordMatches[i].index <= lm.index && (lm.index - coordMatches[i].index) < 700) {
        cm = coordMatches[i];
        break;
      }
    }

    if (!cm) {
      cm = coordMatches.find(m => m.index > lm.index && (m.index - lm.index) < 700) || null;
    }
    if (!cm) continue;

    const tail = raw.slice(lm.index, Math.min(raw.length, lm.index + 240));
    const circMatch = tail.match(/en\s+(Circuito\s+[^\)\n\r]+)/i);
    addEntry(lm[1], cm[1], cm[2], circMatch ? circMatch[1].trim() : 'Circuito CNFL');
  }

  // Formato directo de campo:
  // 1605000184 9.93861960999999,-84.082643319
  for (const line of raw.split(/\r?\n/)) {
    if (/Localizaci[oó]n/i.test(line)) continue;
    const m = line.match(/(?:^|\s)(\d{8,10})\s*[-=:,;\s]+\s*([-+]?\d{1,2}(?:\.\d+)?)\s*,\s*([-+]?\d{1,3}(?:\.\d+)?)(?:\s|$)/);
    if (m) addEntry(m[1], m[2], m[3], 'Circuito CNFL');
  }

  return {
    entries,
    totalDetected,
    exactDuplicates,
    conflicts: [...conflicts]
  };
}

importTelegramReplies = async function () {
  const inputEl = document.getElementById('telegramBotReplies');
  if (!inputEl) return;

  const raw = inputEl.value.trim();
  if (!raw) {
    alert('Pega las respuestas de @ubiCNFL o pares Localización + latitud,longitud.');
    return;
  }

  if (!workOrders || workOrders.length === 0) {
    alert('Primero carga las órdenes de la jornada. No voy a guardar coordenadas sin una bandeja actual para validarlas.');
    return;
  }

  const parsed = parseCnflBotReplies(raw);
  if (parsed.entries.length === 0) {
    alert(
      'No se detectaron pares válidos de Localización + coordenadas.\n\n' +
      'Acepto:\n' +
      '• Respuesta completa de @ubiCNFL\n' +
      '• 1605000184 9.9386196,-84.0826433'
    );
    return;
  }

  const expected = new Set(
    workOrders
      .map(o => normalizeCnflLocalization(o.localizacion))
      .filter(loc => loc.length === 10)
  );

  const receivedExpected = new Map();
  const notInCurrentOrders = [];

  for (const e of parsed.entries) {
    if (expected.has(e.loc)) receivedExpected.set(e.loc, e);
    else notInCurrentOrders.push(e.loc);
  }

  // CONTROL CRÍTICO: una coordenada vieja en caché NO cuenta como recibida hoy.
  const missingFromPaste = [...expected].filter(loc => !receivedExpected.has(loc));

  const summary = [
    `Localizaciones esperadas: ${expected.size}`,
    `Resultados válidos detectados: ${parsed.totalDetected}`,
    `Duplicados exactos: ${parsed.exactDuplicates}`,
    `Únicas del lote actual: ${receivedExpected.size}`
  ];

  if (notInCurrentOrders.length) {
    summary.push(`Fuera de la bandeja actual: ${notInCurrentOrders.length}`);
  }

  if (parsed.conflicts.length) {
    summary.push(`CONFLICTOS GPS: ${parsed.conflicts.join(', ')}`);
    alert(
      summary.join('\n') +
      '\n\nNo guardé ni optimicé porque una misma Localización llegó con coordenadas distintas.'
    );
    return;
  }

  if (missingFromPaste.length > 0) {
    summary.push(`Faltantes reales del pegado: ${missingFromPaste.length}`);
    alert(
      summary.join('\n') +
      `\n\nFaltantes:\n${missingFromPaste.join('\n')}\n\n` +
      'Aunque el teléfono tenga coordenadas antiguas guardadas, NO las tomé como respuesta de este lote.'
    );
    return;
  }

  let overwrittenOldGps = 0;

  // Solo ahora, con el lote completo y validado, se actualiza la geocaché.
  for (const [loc, e] of receivedExpected.entries()) {
    const previous = geoCache[loc];
    if (
      previous &&
      Number.isFinite(Number(previous.lat)) &&
      Number.isFinite(Number(previous.lon)) &&
      (Number(previous.lat) !== e.lat || Number(previous.lon) !== e.lon)
    ) {
      overwrittenOldGps++;
    }

    geoCache[loc] = {
      ...buildGeoEntry(loc, e.lat, e.lon, e.circuito),
      source: 'user-confirmed'
    };
  }

  localStorage.setItem('cnfl_geocache', JSON.stringify(geoCache));

  // Vinculación explícita por Localización para evitar depender de una caché previa.
  for (const ord of workOrders) {
    const loc = normalizeCnflLocalization(ord.localizacion);
    const e = receivedExpected.get(loc);
    if (!e) continue;

    ord.localizacion = loc;
    ord.lat = e.lat;
    ord.lon = e.lon;
    ord.circuito = e.circuito || ord.circuito || 'Circuito CNFL';
    ord.wazeUrl = `https://www.waze.com/ul?ll=${e.lat},${e.lon}&navigate=yes`;
    ord.mapsUrl = `https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lon}`;
  }

  localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
  renderOrders();
  updateLiquidation();

  const routeOk = typeof optimizeInitialRoute === 'function'
    ? await optimizeInitialRoute()
    : await optimizeCurrentRoute();

  inputEl.value = '';

  if (routeOk) {
    showToast(
      `GPS validado: ${receivedExpected.size}/${expected.size} · ruta inicial lista` +
      (overwrittenOldGps ? ` · ${overwrittenOldGps} GPS antiguos corregidos` : '')
    );
    switchTab('ruta', document.querySelectorAll('.nav-tab-btn')[0]);
  } else {
    showToast(`GPS validado: ${receivedExpected.size}/${expected.size}. Falta recalcular la ruta.`);
  }
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
