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

function cnflGeoNow() {
  return new Date().toISOString();
}

function cnflValidGeoEntry(entry) {
  const lat = Number(entry && entry.lat);
  const lon = Number(entry && entry.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function cnflGeoSourceLabel(source) {
  switch (String(source || '')) {
    case 'sigel': return 'SIGEL';
    case 'ubiCNFL': return '@ubiCNFL';
    case 'campo-manual': return 'Campo';
    case 'user-confirmed': return '@ubiCNFL / confirmado';
    case 'server': return 'Base CNFL';
    case 'seed': return 'Base inicial';
    case 'legacy-memory': return 'Memoria anterior';
    default: return source || 'Memoria';
  }
}

function buildGeoEntry(loc, lat, lon, circuito, source = 'ubiCNFL', previous = null) {
  const now = cnflGeoNow();
  const prev = previous && typeof previous === 'object' ? previous : {};
  return {
    localizacion: loc,
    lat: Number(lat),
    lon: Number(lon),
    circuito: circuito || prev.circuito || 'Circuito CNFL',
    wazeUrl: `https://www.waze.com/ul?ll=${lat},${lon}&navigate=yes`,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`,
    source,
    firstSeenAt: prev.firstSeenAt || prev.resolvedAt || now,
    resolvedAt: now,
    lastVerifiedAt: now,
    lastUsedAt: now,
    useCount: Number(prev.useCount || 0),
    status: 'valid'
  };
}

function cnflMigrateGeoEntry(loc, entry, fallbackSource) {
  if (!cnflValidGeoEntry(entry)) return null;
  const now = cnflGeoNow();
  const source = entry.source || fallbackSource || 'legacy-memory';
  return {
    ...entry,
    localizacion: loc,
    lat: Number(entry.lat),
    lon: Number(entry.lon),
    source,
    firstSeenAt: entry.firstSeenAt || entry.resolvedAt || now,
    resolvedAt: entry.resolvedAt || entry.firstSeenAt || now,
    lastVerifiedAt: entry.lastVerifiedAt || entry.resolvedAt || null,
    lastUsedAt: entry.lastUsedAt || null,
    useCount: Number(entry.useCount || 0),
    status: entry.status || 'valid',
    wazeUrl: entry.wazeUrl || `https://www.waze.com/ul?ll=${entry.lat},${entry.lon}&navigate=yes`,
    mapsUrl: entry.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${entry.lat},${entry.lon}`
  };
}

function cnflHasReusableGeo(loc) {
  const key = normalizeCnflLocalization(loc);
  const entry = geoCache && geoCache[key];
  return !!entry && cnflValidGeoEntry(entry) && entry.status !== 'conflict';
}

function cnflMarkGeoUsed(loc) {
  const key = normalizeCnflLocalization(loc);
  const entry = geoCache && geoCache[key];
  if (!entry || !cnflValidGeoEntry(entry)) return;
  entry.lastUsedAt = cnflGeoNow();
  entry.useCount = Number(entry.useCount || 0) + 1;
}

function cnflGpsBadgeHtml(ord) {
  if (ord && ord._gpsMemoryStatus === 'conflict') {
    return '<span class="gps-verified-tag" style="color:#FCA5A5"><i class="fa-solid fa-triangle-exclamation"></i> GPS CONFLICTO</span>';
  }
  if (ord && ord._gpsMemoryStatus === 'new') {
    return '<span class="gps-verified-tag"><i class="fa-solid fa-satellite-dish"></i> GPS NUEVO</span>';
  }
  if (ord && ord._gpsMemoryStatus === 'reused') {
    return '<span class="gps-verified-tag" style="color:#86EFAC"><i class="fa-solid fa-clock-rotate-left"></i> GPS REUTILIZADO</span>';
  }
  if (ord && Number.isFinite(Number(ord.lat)) && Number.isFinite(Number(ord.lon))) {
    return '<span class="gps-verified-tag"><i class="fa-solid fa-location-dot"></i> GPS DISPONIBLE</span>';
  }
  return '<span style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono)">SIN GPS</span>';
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

    const merged = {};

    for (const [loc, g] of Object.entries(CNFL_GEO_SEED_20260916)) {
      const key = normalizeCnflLocalization(loc);
      const migrated = cnflMigrateGeoEntry(key, g, 'seed');
      if (migrated) merged[key] = migrated;
    }

    for (const [loc, g] of Object.entries(serverCache || {})) {
      const key = normalizeCnflLocalization(loc);
      const migrated = cnflMigrateGeoEntry(key, g, 'server');
      if (migrated) merged[key] = migrated;
    }

    // La memoria local conserva coordenadas confirmadas o aprendidas en campo.
    for (const [loc, g] of Object.entries(savedCache || {})) {
      const key = normalizeCnflLocalization(loc);
      const migrated = cnflMigrateGeoEntry(key, g, g.source || 'legacy-memory');
      if (!migrated) continue;
      const localWins = ['ubiCNFL','campo-manual','sigel','user-confirmed','legacy-memory'].includes(migrated.source);
      if (!merged[key] || localWins) merged[key] = migrated;
    }

    geoCache = merged;
    localStorage.setItem('cnfl_geocache', JSON.stringify(geoCache));
  } catch (e) {
    console.warn('Caché GPS no disponible:', e);
  }
};

// Aplicar memoria geográfica por Localización a cualquier jornada nueva.
enrichOrdersWithCache = function () {
  let memoryHits = 0;
  for (const ord of workOrders || []) {
    const loc = normalizeCnflLocalization(ord.localizacion);
    if (loc.length === 10) ord.localizacion = loc;

    if (loc && cnflHasReusableGeo(loc)) {
      const geo = geoCache[loc];
      ord.lat = Number(geo.lat);
      ord.lon = Number(geo.lon);
      ord.circuito = geo.circuito || ord.circuito || '';
      ord.wazeUrl = geo.wazeUrl || `https://www.waze.com/ul?ll=${geo.lat},${geo.lon}&navigate=yes`;
      ord.mapsUrl = geo.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${geo.lat},${geo.lon}`;
      ord._gpsMemoryStatus = ord._gpsMemoryStatus === 'new' ? 'new' : 'reused';
      ord._gpsSource = geo.source || 'legacy-memory';
      ord._gpsResolvedAt = geo.resolvedAt || geo.firstSeenAt || '';
      cnflMarkGeoUsed(loc);
      memoryHits++;
    } else if (!(Number.isFinite(Number(ord.lat)) && Number.isFinite(Number(ord.lon)))) {
      ord._gpsMemoryStatus = 'missing';
    }

    if (ord.lectura === undefined) ord.lectura = '';
    if (ord.sello_instalado === undefined) ord.sello_instalado = '';
    if (ord.sello_retirado === undefined) ord.sello_retirado = '';
    if (ord.observaciones === undefined) ord.observaciones = '';
  }

  localStorage.setItem('cnfl_geocache', JSON.stringify(geoCache));
  return memoryHits;
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

const CNFL_GPS_BATCH_KEY = 'cnfl_gps_batch_stage';

function cnflGpsBatchSignature(expected) {
  return [...expected].sort().join('|');
}

function cnflLoadGpsBatchStage(expected) {
  const signature = cnflGpsBatchSignature(expected);
  let stage = { signature, entries: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(CNFL_GPS_BATCH_KEY) || 'null');
    if (saved && saved.signature === signature && saved.entries && typeof saved.entries === 'object') {
      stage = saved;
    }
  } catch (e) {}
  return stage;
}

function cnflApplyStageToCurrentOrders(stage, status = 'new') {
  for (const ord of workOrders || []) {
    const loc = normalizeCnflLocalization(ord.localizacion);
    const e = stage.entries[loc];
    if (!e) continue;

    ord.localizacion = loc;
    ord.lat = Number(e.lat);
    ord.lon = Number(e.lon);
    ord.circuito = e.circuito || ord.circuito || 'Circuito CNFL';
    ord.wazeUrl = `https://www.waze.com/ul?ll=${e.lat},${e.lon}&navigate=yes`;
    ord.mapsUrl = `https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lon}`;
    ord._gpsMemoryStatus = status;
    ord._gpsSource = e.source || 'ubiCNFL';
    ord._gpsResolvedAt = e.resolvedAt || cnflGeoNow();
  }
  localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
}

function cnflCurrentLocationSets() {
  const all = [...new Set(
    (workOrders || [])
      .map(o => normalizeCnflLocalization(o.localizacion))
      .filter(loc => loc.length === 10)
  )];

  const reusable = all.filter(loc => cnflHasReusableGeo(loc));
  const missing = all.filter(loc => !cnflHasReusableGeo(loc));
  return { all, reusable, missing };
}

// Por defecto Telegram recibe SOLO Localizaciones que todavía no están en memoria.
getTelegramWazeCommands = function () {
  const { missing } = cnflCurrentLocationSets();
  return missing.map(loc => `gmaps${loc}`).join('\n');
};

updateTgCommandsCount = function () {
  const { all, reusable, missing } = cnflCurrentLocationSets();
  const cmds = missing.map(loc => `gmaps${loc}`).join('\n');

  const badge = document.getElementById('tgCmdCount');
  if (badge) badge.innerText = missing.length;

  const known = document.getElementById('tgMemoryCount');
  if (known) known.innerText = reusable.length;

  const missingEl = document.getElementById('tgMissingCount');
  if (missingEl) missingEl.innerText = missing.length;

  const totalEl = document.getElementById('tgTotalCount');
  if (totalEl) totalEl.innerText = all.length;

  const preview = document.getElementById('telegramCommandsPreview');
  if (preview) {
    preview.value = cmds;
    preview.placeholder = missing.length
      ? ''
      : (all.length
          ? 'Todas las Localizaciones ya tienen GPS en memoria. No hace falta consultar Telegram.'
          : 'Carga primero el PDF.');
  }
};

copyTelegramWazeCommands = function () {
  const cmds = getTelegramWazeCommands();
  if (!cmds) {
    showToast('No hay Localizaciones nuevas por consultar: el GPS ya está en memoria.');
    return;
  }

  const done = () => showToast(`Copiadas ${cmds.split('\n').filter(Boolean).length} Localizaciones faltantes.`);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(cmds).then(done).catch(() => {
      prompt('Copia las Localizaciones faltantes para @ubiCNFL:', cmds);
    });
  } else {
    prompt('Copia las Localizaciones faltantes para @ubiCNFL:', cmds);
  }
};

importTelegramReplies = async function () {
  const inputEl = document.getElementById('telegramBotReplies');
  if (!inputEl) return;

  const raw = inputEl.value.trim();
  if (!raw) {
    alert('Pega las respuestas de @ubiCNFL o pares Localización + latitud,longitud.');
    return;
  }

  if (!workOrders || workOrders.length === 0) {
    alert('Primero carga las órdenes de la jornada.');
    return;
  }

  const parsed = parseCnflBotReplies(raw);
  if (parsed.entries.length === 0) {
    alert(
      'No se detectaron pares válidos de Localización + coordenadas.\n\n' +
      'Acepto:\n• Respuesta completa de @ubiCNFL\n• 1605000184 9.9386196,-84.0826433'
    );
    return;
  }

  const sets = cnflCurrentLocationSets();
  const allSet = new Set(sets.all);
  const requiredSet = new Set(sets.missing);
  const stage = cnflLoadGpsBatchStage(requiredSet);
  const notInCurrentOrders = [];
  const conflicts = new Set(parsed.conflicts || []);
  let verifiedExisting = 0;

  const source = /Localizaci[oó]n|maps\.google|waze|ubiCNFL/i.test(raw) ? 'ubiCNFL' : 'campo-manual';

  for (const e of parsed.entries) {
    if (!allSet.has(e.loc)) {
      notInCurrentOrders.push(e.loc);
      continue;
    }

    const old = geoCache[e.loc];
    if (old && cnflValidGeoEntry(old)) {
      const same = Math.abs(Number(old.lat) - Number(e.lat)) < 0.000001 &&
                   Math.abs(Number(old.lon) - Number(e.lon)) < 0.000001;
      if (!same) {
        old.status = 'conflict';
        old.conflictCandidate = {
          lat: Number(e.lat),
          lon: Number(e.lon),
          circuito: e.circuito || '',
          source,
          detectedAt: cnflGeoNow()
        };
        conflicts.add(e.loc);
        for (const ord of workOrders) {
          if (normalizeCnflLocalization(ord.localizacion) === e.loc) {
            ord._gpsMemoryStatus = 'conflict';
          }
        }
        continue;
      }

      old.lastVerifiedAt = cnflGeoNow();
      old.status = 'valid';
      old.source = old.source || source;
      verifiedExisting++;
      continue;
    }

    const previousStage = stage.entries[e.loc];
    if (
      previousStage &&
      (Number(previousStage.lat) !== Number(e.lat) || Number(previousStage.lon) !== Number(e.lon))
    ) {
      conflicts.add(e.loc);
      continue;
    }

    stage.entries[e.loc] = {
      loc: e.loc,
      lat: Number(e.lat),
      lon: Number(e.lon),
      circuito: e.circuito || 'Circuito CNFL',
      source,
      resolvedAt: cnflGeoNow()
    };
  }

  localStorage.setItem('cnfl_geocache', JSON.stringify(geoCache));

  if (conflicts.size) {
    localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
    renderOrders();
    updateTgCommandsCount();
    alert(
      'CONFLICTO GPS en:\n' + [...conflicts].join('\n') +
      '\n\nLa memoria tiene otra coordenada para esa Localización. No la sobrescribí. Debe revisarse antes de usarla.'
    );
    return;
  }

  localStorage.setItem(CNFL_GPS_BATCH_KEY, JSON.stringify(stage));
  cnflApplyStageToCurrentOrders(stage, 'new');

  const missingFromBatch = [...requiredSet].filter(loc => !stage.entries[loc]);
  if (missingFromBatch.length) {
    renderOrders();
    updateTgCommandsCount();
    inputEl.value = '';
    alert(
      `GPS reutilizados desde memoria: ${sets.reusable.length}\n` +
      `GPS nuevos recibidos: ${Object.keys(stage.entries).length}\n` +
      `Faltan por consultar: ${missingFromBatch.length}\n\n` +
      missingFromBatch.join('\n')
    );
    return;
  }

  // Promover únicamente los GPS nuevos a la memoria permanente.
  for (const loc of requiredSet) {
    const e = stage.entries[loc];
    if (!e) continue;
    geoCache[loc] = buildGeoEntry(loc, e.lat, e.lon, e.circuito, e.source || source, geoCache[loc]);
    geoCache[loc].useCount = 1;
  }

  localStorage.setItem('cnfl_geocache', JSON.stringify(geoCache));
  localStorage.removeItem(CNFL_GPS_BATCH_KEY);

  // Reaplicar memoria: los ya conocidos quedan "reutilizados"; los recién recibidos "nuevos".
  for (const ord of workOrders || []) {
    const loc = normalizeCnflLocalization(ord.localizacion);
    const entry = geoCache[loc];
    if (!entry || !cnflValidGeoEntry(entry)) continue;

    const wasNew = requiredSet.has(loc);
    ord.lat = Number(entry.lat);
    ord.lon = Number(entry.lon);
    ord.circuito = entry.circuito || ord.circuito || '';
    ord.wazeUrl = entry.wazeUrl;
    ord.mapsUrl = entry.mapsUrl;
    ord._gpsMemoryStatus = wasNew ? 'new' : 'reused';
    ord._gpsSource = entry.source;
    ord._gpsResolvedAt = entry.resolvedAt || entry.firstSeenAt || '';
    cnflMarkGeoUsed(loc);
  }

  localStorage.setItem('cnfl_work_orders', JSON.stringify(workOrders));
  localStorage.setItem('cnfl_geocache', JSON.stringify(geoCache));
  renderOrders();
  updateLiquidation();
  updateTgCommandsCount();

  const routeOk = typeof optimizeInitialRoute === 'function'
    ? await optimizeInitialRoute()
    : await optimizeCurrentRoute();

  inputEl.value = '';
  const total = sets.all.length;
  const reused = sets.reusable.length;
  const added = requiredSet.size;

  showToast(
    `GPS listos ${total}/${total}: ${reused} reutilizados + ${added} nuevos` +
    (verifiedExisting ? ` · ${verifiedExisting} verificados` : '')
  );

  if (routeOk) switchTab('ruta', document.querySelectorAll('.nav-tab-btn')[0]);
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
