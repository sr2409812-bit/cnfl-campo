function normalizeReadingPdfText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function readingPdfItemXY(item) {
  const t = item && item.transform;
  return {
    text: String((item && item.str) || '').trim(),
    x: Array.isArray(t) ? Number(t[4] || 0) : 0,
    y: Array.isArray(t) ? Number(t[5] || 0) : 0
  };
}

function groupReadingPdfRows(items, tolerance = 2.8) {
  const rows = [];
  const sorted = [...items].filter(i => i.text).sort((a,b) => b.y - a.y || a.x - b.x);
  for (const item of sorted) {
    let row = rows.find(r => Math.abs(r.y - item.y) <= tolerance);
    if (!row) {
      row = { y: item.y, items: [] };
      rows.push(row);
    }
    row.items.push(item);
    row.y = (row.y * (row.items.length - 1) + item.y) / row.items.length;
  }
  rows.forEach(r => r.items.sort((a,b) => a.x - b.x));
  return rows.sort((a,b) => b.y - a.y);
}



function parseReadingPdfRowPairs(layoutPages, fullText = '') {
  const found = [];
  const seen = new Map();
  const conflicts = [];

  function add(locRaw, medRaw) {
    const locDigits = String(locRaw || '').replace(/\D/g, '');
    const medidor = String(medRaw || '').replace(/\D/g, '');
    const localizacion = locDigits.length === 9 ? '0' + locDigits : locDigits;
    if (!/^\d{10}$/.test(localizacion)) return;
    if (!/^\d{4,8}$/.test(medidor)) return;

    if (seen.has(localizacion)) {
      if (seen.get(localizacion) !== medidor) {
        conflicts.push(localizacion + ': ' + seen.get(localizacion) + ' / ' + medidor);
      }
      return;
    }

    seen.set(localizacion, medidor);
    found.push({ localizacion, medidor });
  }

  for (const rawItems of layoutPages || []) {
    const items = (rawItems || []).map(readingPdfItemXY).filter(i => i.text);
    const rows = groupReadingPdfRows(items, 4.2);

    for (const row of rows) {
      const line = row.items.map(i => String(i.text || '').trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      if (!line) continue;

      // LMR0085: "Localización: ########## Medidor: ###### ..."
      let m = line.match(/Localizaci[oó]n\s*:?\s*(\d{9,10})[\s\S]*?Medidor\s*:?\s*(\d{4,8})/i);
      if (m) {
        add(m[1], m[2]);
        continue;
      }

      // LMR0155 / tabla: la fila inicia con Localización + Medidor.
      m = line.match(/^(\d{9,10})\s+(\d{4,8})(?=\s|$)/);
      if (m) {
        add(m[1], m[2]);
        continue;
      }

      // Sin respaldo numérico genérico: si no aparece Medidor explícitamente, no se adivina.
    }
  }

  if (conflicts.length) {
    throw new Error('El PDF trae Localizaciones con medidores diferentes: ' + conflicts.slice(0,6).join(', '));
  }

  const text = String(fullText || '');
  const expectedMatch =
    text.match(/Total\s+Inspecciones\s*:\s*(\d+)/i) ||
    text.match(/(\d+)\s*Total\s+Inspecciones\s*:/i) ||
    text.match(/Total\s+Medidores\s*:\s*(\d+)/i) ||
    text.match(/(\d+)\s*Total\s+Medidores\s*:/i) ||
    text.match(/Cantidad\s+(?:de\s+)?Medidores?\s*:?\s*(\d+)/i);

  const expectedCount = expectedMatch ? Number(expectedMatch[1]) : null;

  if (found.length && expectedCount && found.length !== expectedCount) {
    throw new Error(
      'El PDF indica ' + expectedCount + ' medidores/inspecciones, pero pude validar ' +
      found.length + '. No lo cargué para evitar una lista incompleta.'
    );
  }

  return { rows: found, expectedCount };
}

function parseReadingPdfDirectText(fullText = '') {
  const text = String(fullText || '');
  const rows = [];
  const seen = new Map();
  const conflicts = [];

  function add(localizacionRaw, medidorRaw) {
    const locDigits = String(localizacionRaw || '').replace(/\D/g, '');
    const medidor = String(medidorRaw || '').replace(/\D/g, '');
    const localizacion = locDigits.length === 9 ? '0' + locDigits : locDigits;
    if (!/^\d{10}$/.test(localizacion)) return;
    if (!/^\d{4,8}$/.test(medidor)) return;

    if (seen.has(localizacion)) {
      if (seen.get(localizacion) !== medidor) {
        conflicts.push(localizacion + ': ' + seen.get(localizacion) + ' / ' + medidor);
      }
      return;
    }
    seen.set(localizacion, medidor);
    rows.push({localizacion, medidor});
  }

  // Formato LMR0085: "Localización: ##########   Medidor: ######"
  const inspectionRe = /Localizaci[oó]n\s*:?\s*(\d{9,10})[\s\S]{0,80}?Medidor\s*:?\s*(\d{4,8})/gi;
  let m;
  while ((m = inspectionRe.exec(text)) !== null) add(m[1], m[2]);

  // Formato LMR0155 / "MEDIDORES SIN REGISTRO DE LECTURA":
  // cada fila inicia con Localización + Medidor.
  const tableRe = /^\s*(\d{9,10})\s+(\d{4,8})(?=\s|$)/gm;
  while ((m = tableRe.exec(text)) !== null) add(m[1], m[2]);

  if (conflicts.length) {
    throw new Error('El PDF trae Localizaciones con medidores diferentes: ' + conflicts.slice(0,6).join(', '));
  }

  const expectedMatch =
    text.match(/Total\s+Inspecciones\s*:\s*(\d+)/i) ||
    text.match(/(\d+)\s*Total\s+Inspecciones\s*:/i) ||
    text.match(/Total\s+Medidores\s*:\s*(\d+)/i) ||
    text.match(/(\d+)\s*Total\s+Medidores\s*:/i) ||
    text.match(/Cantidad\s+(?:de\s+)?Medidores?\s*:?\s*(\d+)/i);

  const expectedCount = expectedMatch ? Number(expectedMatch[1]) : null;

  if (rows.length && expectedCount && rows.length !== expectedCount) {
    throw new Error(
      'El PDF indica ' + expectedCount + ' medidores/inspecciones, pero pude validar ' +
      rows.length + '. No lo cargué para evitar una lista incompleta.'
    );
  }

  return {rows, expectedCount};
}


function parseInspectionBlocksByGeometry(layoutPages) {
  const rows = [];
  const seen = new Map();
  const conflicts = [];

  function normDigits(v) {
    return String(v || '').replace(/\D/g, '');
  }

  function nearestValue(items, label, minLen, maxLen) {
    const candidates = items
      .map(i => ({...i, digits:normDigits(i.text)}))
      .filter(i =>
        i.digits.length >= minLen &&
        i.digits.length <= maxLen &&
        i.x > label.x &&
        Math.abs(i.y - label.y) <= 10 &&
        (i.x - label.x) <= 170
      )
      .sort((a,b) => {
        const ay = Math.abs(a.y - label.y);
        const by = Math.abs(b.y - label.y);
        if (ay !== by) return ay - by;
        return (a.x - label.x) - (b.x - label.x);
      });
    return candidates[0] || null;
  }

  for (const rawItems of layoutPages || []) {
    const items = (rawItems || []).map(readingPdfItemXY).filter(i => i.text);

    const locLabels = items.filter(i => {
      const n = normalizeReadingPdfText(i.text);
      return n === 'localizacion:' || n === 'localizacion';
    });
    const medLabels = items.filter(i => {
      const n = normalizeReadingPdfText(i.text);
      return n === 'medidor:' || n === 'medidor';
    });

    // LMR0085: cada inspección trae sus propias etiquetas Localización:/Medidor:.
    // Solo usamos este modo cuando hay etiquetas repetidas en la página.
    if (locLabels.length < 1 || medLabels.length < 1) continue;

    for (const locLabel of locLabels) {
      const locItem = nearestValue(items, locLabel, 9, 10);
      if (!locItem) continue;

      const medLabel = medLabels
        .filter(m => Math.abs(m.y - locLabel.y) <= 14)
        .sort((a,b) => Math.abs(a.y - locLabel.y) - Math.abs(b.y - locLabel.y))[0];
      if (!medLabel) continue;

      const medItem = nearestValue(items, medLabel, 4, 8);
      if (!medItem) continue;

      const locDigits = normDigits(locItem.text);
      const localizacion = locDigits.length === 9 ? '0' + locDigits : locDigits;
      const medidor = normDigits(medItem.text);

      if (!/^\d{10}$/.test(localizacion) || !/^\d{4,8}$/.test(medidor)) continue;

      if (seen.has(localizacion)) {
        if (seen.get(localizacion) !== medidor) {
          conflicts.push(localizacion + ': ' + seen.get(localizacion) + ' / ' + medidor);
        }
        continue;
      }

      seen.set(localizacion, medidor);
      rows.push({localizacion, medidor});
    }
  }

  if (conflicts.length) {
    throw new Error('El PDF trae Localizaciones con medidores diferentes: ' + conflicts.slice(0,6).join(', '));
  }

  return rows;
}


function parseReadingPdfExplicitLayout(layoutPages, fullText = '') {
  const rows = [];
  const seen = new Map();
  const conflicts = [];
  let detected = false;

  function add(localizacionRaw, medidorRaw) {
    let localizacion = String(localizacionRaw || '').replace(/\D/g, '');
    const medidor = String(medidorRaw || '').replace(/\D/g, '');

    if (localizacion.length === 9) localizacion = '0' + localizacion;
    if (!/^\d{10}$/.test(localizacion)) return;
    if (!/^\d{4,8}$/.test(medidor)) return;

    if (seen.has(localizacion)) {
      if (seen.get(localizacion) !== medidor) {
        conflicts.push(localizacion + ': ' + seen.get(localizacion) + ' / ' + medidor);
      }
      return;
    }

    seen.set(localizacion, medidor);
    rows.push({localizacion, medidor});
  }

  for (const rawItems of layoutPages || []) {
    const items = (rawItems || []).map(readingPdfItemXY).filter(i => i.text);
    const visualRows = groupReadingPdfRows(items, 3.2);

    const pageHasTableHeader = visualRows.some(row => {
      const n = normalizeReadingPdfText(row.items.map(i => i.text).join(' '));
      return n.includes('localizacion') && n.includes('medidor') && n.includes('contrato');
    });

    for (const row of visualRows) {
      const rowText = row.items
        .map(i => i.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      // FORMATO LMR0085
      // La fila visual dice:
      // Localización: 9006760195   Medidor: 488956   Tarifa: ...
      // Contrato está en OTRA FILA y jamás entra aquí.
      let match = rowText.match(
        /Localizaci[oó]n\s*:\s*(\d{9,10})[\s\S]*?Medidor\s*:\s*(\d{4,8})(?=\s|Tarifa|$)/i
      );
      if (match) {
        detected = true;
        add(match[1], match[2]);
        continue;
      }

      // FORMATO LMR0155
      // Encabezado: Localización | Medidor | Contrato | ...
      // Fila:       9006021040     1001667   27963728TR ...
      // Por diseño SOLO tomamos el 1er número como Localización
      // y el 2do como Medidor. El 3ro (Contrato) se ignora.
      if (pageHasTableHeader) {
        match = rowText.match(/^\s*(\d{9,10})\s+(\d{4,8})(?=\s|$)/);
        if (match) {
          detected = true;
          add(match[1], match[2]);
        }
      }
    }
  }

  if (conflicts.length) {
    throw new Error(
      'Encontré Localizaciones con dos Medidores distintos: ' +
      conflicts.slice(0,6).join(', ')
    );
  }

  const text = String(fullText || '');
  const expectedMatch =
    text.match(/Total\s+Inspecciones\s*:\s*(\d+)/i) ||
    text.match(/(\d+)\s*Total\s+Inspecciones\s*:/i) ||
    text.match(/Total\s+Medidores\s*:\s*(\d+)/i) ||
    text.match(/(\d+)\s*Total\s+Medidores\s*:/i) ||
    text.match(/Cantidad\s+(?:de\s+)?Medidores?\s*:?\s*(\d+)/i);
  const expectedCount = expectedMatch ? Number(expectedMatch[1]) : null;

  if (detected && expectedCount && rows.length !== expectedCount) {
    throw new Error(
      'El PDF indica ' + expectedCount +
      ' medidores/inspecciones, pero validé ' + rows.length +
      '. No cargué nada para evitar mezclar Contrato con Medidor.'
    );
  }

  return {rows, expectedCount, detected};
}


function parseNearestGeometryPairs(layoutPages, fullText = '') {
  const rows = [];
  const seen = new Map();
  const conflicts = [];

  function add(locRaw, medRaw) {
    let loc = String(locRaw || '').replace(/\D/g, '');
    const med = String(medRaw || '').replace(/\D/g, '');
    if (loc.length === 9) loc = '0' + loc;
    if (!/^\d{10}$/.test(loc) || !/^\d{4,8}$/.test(med)) return;

    if (seen.has(loc)) {
      if (seen.get(loc) !== med) conflicts.push(loc + ': ' + seen.get(loc) + ' / ' + med);
      return;
    }
    seen.set(loc, med);
    rows.push({localizacion:loc, medidor:med});
  }

  for (const rawItems of layoutPages || []) {
    const items = (rawItems || []).map(readingPdfItemXY).filter(i => i.text);
    const visualRows = groupReadingPdfRows(items, 4.5);

    for (const row of visualRows) {
      const tokens = [];
      for (const item of row.items) {
        for (const raw of (String(item.text || '').match(/\d+/g) || [])) {
          tokens.push({digits:raw, x:Number(item.x || 0)});
        }
      }

      const locs = tokens.filter(t => t.digits.length === 9 || t.digits.length === 10);
      for (const locToken of locs) {
        const localizacion = locToken.digits.length === 9 ? '0' + locToken.digits : locToken.digits;

        // En los formatos LMR0085 y LMR0155 el Medidor está a la derecha de
        // Localización en la misma fila visual. Contrato está más lejos.
        const meter = tokens
          .filter(t =>
            t !== locToken &&
            t.x > locToken.x &&
            t.digits.length >= 4 &&
            t.digits.length <= 8
          )
          .sort((a,b) => (a.x - locToken.x) - (b.x - locToken.x))[0];

        if (meter) add(localizacion, meter.digits);
      }
    }
  }

  if (conflicts.length) {
    throw new Error('El PDF trae Localizaciones con Medidores diferentes: ' + conflicts.slice(0,6).join(', '));
  }

  const text = String(fullText || '');
  const expectedMatch =
    text.match(/Total\s+Inspecciones\s*:\s*(\d+)/i) ||
    text.match(/(\d+)\s*Total\s+Inspecciones\s*:/i) ||
    text.match(/Total\s+Medidores\s*:\s*(\d+)/i) ||
    text.match(/(\d+)\s*Total\s+Medidores\s*:/i) ||
    text.match(/Cantidad\s+(?:de\s+)?Medidores?\s*:?\s*(\d+)/i);
  const expectedCount = expectedMatch ? Number(expectedMatch[1]) : null;

  if (rows.length && expectedCount && rows.length !== expectedCount) {
    throw new Error(
      'El PDF indica ' + expectedCount + ' medidores/inspecciones, pero validé ' +
      rows.length + '. No cargué nada para evitar una lista incompleta.'
    );
  }

  return {rows, expectedCount};
}

function parseReadingPdfLayout(layoutPages, fullText = '') {
  // Primero: pares por geometría real de fila. Este método reconoce los
  // LMR0085 y LMR0155 entregados para la jornada residencial.
  const nearestPairs = parseNearestGeometryPairs(layoutPages, fullText);
  if (nearestPairs.rows.length) {
    return {
      rows: nearestPairs.rows,
      expectedCount: nearestPairs.expectedCount,
      pagesWithHeaders: 0,
      parser: 'nearest-row-geometry'
    };
  }

  // Segundo: extracción estricta por etiquetas/columnas reales.
  // LMR0085: Localización: ... Medidor: ...
  // LMR0155: columnas Localización | Medidor | Contrato.
  const explicit = parseReadingPdfExplicitLayout(layoutPages, fullText);
  if (explicit.rows.length) {
    return {
      rows: explicit.rows,
      expectedCount: explicit.expectedCount,
      pagesWithHeaders: 0,
      parser: 'explicit-medidor-column'
    };
  }

  const rowPairs = parseReadingPdfRowPairs(layoutPages, fullText);
  if (rowPairs.rows.length) {
    return {
      rows: rowPairs.rows,
      expectedCount: rowPairs.expectedCount,
      pagesWithHeaders: 0,
      parser: 'explicit-row-pairs'
    };
  }

  const direct = parseReadingPdfDirectText(fullText);
  if (direct.rows.length) {
    return {
      rows: direct.rows,
      expectedCount: direct.expectedCount,
      pagesWithHeaders: 0,
      parser: 'direct-explicit-labels'
    };
  }

  if (typeof READING_MODE !== 'undefined' && READING_MODE === 'residencial') {
    throw new Error(
      'No pude validar la columna/campo Medidor. La app no usará Contrato ni otros números como Medidor.'
    );
  }

  // Demanda mantiene su parser geométrico propio para formatos antiguos.
  const found = [];
  const seen = new Map();
  const conflicts = [];
  let pagesWithHeaders = 0;

  for (const rawItems of layoutPages || []) {
    const items = (rawItems || []).map(readingPdfItemXY).filter(i => i.text);
    const seqHeaders = items.filter(i => {
      const n = normalizeReadingPdfText(i.text);
      if (typeof READING_MODE !== 'undefined' && READING_MODE === 'demanda') {
        return n.includes('secuencia') || n === 'visita';
      }
      return n.includes('secuencia') || n === 'visita' || n.includes('localizacion');
    });
    const medHeaders = items.filter(i => normalizeReadingPdfText(i.text).includes('medidor'));

    let seqHeader = null;
    let medHeader = null;
    let best = Infinity;

    for (const s of seqHeaders) {
      for (const m of medHeaders) {
        const yGap = Math.abs(s.y - m.y);
        const xGap = Math.abs(s.x - m.x);
        if (xGap < 20 || yGap > 35) continue;
        const score = yGap + Math.abs(xGap - 90) * 0.02;
        if (score < best) {
          best = score;
          seqHeader = s;
          medHeader = m;
        }
      }
    }

    if (!seqHeader || !medHeader) continue;
    pagesWithHeaders++;

    const seqX = seqHeader.x;
    const medX = medHeader.x;
    const headerY = Math.min(seqHeader.y, medHeader.y);
    const columnGap = Math.abs(medX - seqX);
    const xTolerance = Math.max(28, Math.min(90, columnGap * 0.62));

    for (const row of groupReadingPdfRows(items)) {
      if (row.y >= headerY - 2) continue;

      const tokens = [];
      for (const item of row.items) {
        for (const raw of (String(item.text).match(/\d+/g) || [])) {
          tokens.push({ digits: raw, x: item.x });
        }
      }

      const locs = tokens
        .filter(t => t.digits.length === 9 || t.digits.length === 10)
        .map(t => ({
          localizacion: t.digits.length === 9 ? '0' + t.digits : t.digits,
          dx: Math.abs(t.x - seqX)
        }))
        .filter(t => t.dx <= xTolerance)
        .sort((a,b) => a.dx - b.dx);

      if (!locs.length) continue;

      const meters = tokens
        .filter(t => t.digits.length >= 4 && t.digits.length <= 8)
        .map(t => ({ medidor: t.digits, dx: Math.abs(t.x - medX) }))
        .filter(t => t.dx <= xTolerance)
        .sort((a,b) => a.dx - b.dx);

      if (!meters.length) continue;

      const localizacion = locs[0].localizacion;
      const medidor = meters[0].medidor;

      if (seen.has(localizacion)) {
        if (seen.get(localizacion).medidor !== medidor) {
          conflicts.push(localizacion + ': ' + seen.get(localizacion).medidor + ' / ' + medidor);
        }
        continue;
      }

      const rowData = { localizacion, medidor };
      seen.set(localizacion, rowData);
      found.push(rowData);
    }
  }

  if (!pagesWithHeaders) {
    throw new Error('No encontré pares válidos de Localización + Medidor en este PDF.');
  }
  if (conflicts.length) {
    throw new Error('El PDF trae Localizaciones con medidores diferentes: ' + conflicts.slice(0,6).join(', '));
  }

  const countMatch = String(fullText || '').match(/Cantidad\s+(?:de\s+)?Medidores?\s*:?\s*(\d+)/i)
    || String(fullText || '').match(/Total\s+(?:de\s+)?Medidores?\s*:?\s*(\d+)/i);
  const expectedCount = countMatch ? Number(countMatch[1]) : null;

  if (expectedCount && found.length !== expectedCount) {
    throw new Error('El PDF indica ' + expectedCount + ' medidores, pero pude validar ' + found.length + '. No lo cargué para evitar una lista incompleta.');
  }
  if (!found.length) {
    throw new Error('No pude extraer Localización + Medidor sin ambigüedad. No se cargó ningún Contrato como Medidor.');
  }

  return { rows: found, expectedCount, pagesWithHeaders };
}

function readingPdfSuggestedName(fileName, fullText) {
  const text = String(fullText || '').replace(/\r/g, '');
  const exact = text.match(/RUTA\s+(\d{4}-\d+)\s+([^\n]+)/i);
  if (exact) {
    return (exact[1] + ' ' + exact[2]).replace(/\s+/g, ' ').trim();
  }
  const cycleRoute = text.match(/Ciclo\s+Lectura\s*:\s*(\d{4})[\s\S]{0,180}?Ruta\s+Lectura\s*:\s*(\d+)/i);
  if (cycleRoute) return cycleRoute[1] + '-' + cycleRoute[2];
  return String(fileName || 'Ruta de lectura').replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim();
}

async function handleReadingPdfUpload(event) {
  const files = event && event.target && event.target.files ? Array.from(event.target.files) : [];
  if (!files.length) return;

  const statusEl = document.getElementById('readingPdfStatus');
  const dataEl = document.getElementById('newRouteData');
  const nameEl = document.getElementById('newRouteName');

  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.className = 'pdf-status';
    statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Leyendo ' + files.length + ' PDF(s)...';
  }

  try {
    if (typeof pdfjsLib === 'undefined') throw new Error('El lector PDF no está disponible.');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const merged = [];
    const byLoc = new Map();
    const names = [];

    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({
        data: buffer,
        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
        cMapPacked: true
      }).promise;

      const layoutPages = [];
      let fullText = '';

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        layoutPages.push(textContent.items || []);
        fullText += (textContent.items || []).map(item => String(item.str || '').trim()).filter(Boolean).join('\n') + '\n';
      }

      const parsed = parseReadingPdfLayout(layoutPages, fullText);
      const sourceRoute = readingPdfSuggestedName(file.name, fullText);
      names.push(sourceRoute);

      for (const row of parsed.rows) {
        const enriched = {...row, sourceRoute, sourceFile:file.name};
        const old = byLoc.get(row.localizacion);
        if (old && old.medidor !== row.medidor) {
          throw new Error('Conflicto en Localización ' + row.localizacion + ': ' + old.medidor + ' / ' + row.medidor);
        }
        if (old) continue;
        byLoc.set(row.localizacion, enriched);
        merged.push(enriched);
      }
    }

    if (!merged.length) throw new Error('No se extrajo ningún medidor.');

    dataEl.value = merged.map(r => r.localizacion + ' ' + r.medidor).join('\n');
    nameEl.value = files.length === 1 ? names[0] : (READING_MODE === 'residencial' ? 'Lectura residencial · ' + files.length + ' PDFs' : 'Demanda · ' + files.length + ' PDFs');

    if (statusEl) {
      statusEl.className = 'pdf-status ok';
      statusEl.innerHTML = '<i class="fa-solid fa-check"></i> ' + merged.length + ' Localizaciones + Medidores validados. Cargando jornada...';
    }

    if (READING_MODE === 'residencial') {
      const existing = new Map(readingOrders.map(o => [String(o.localizacion), o]));
      let added = 0;

      for (const row of merged) {
        const old = existing.get(String(row.localizacion));
        if (old) {
          if (String(old.medidor) !== String(row.medidor)) {
            throw new Error('La Localización ' + row.localizacion + ' ya está cargada con otro Medidor.');
          }
          continue;
        }
        readingOrders.push({
          id:'read-' + row.localizacion,
          localizacion:row.localizacion,
          medidor:row.medidor,
          sourceRoute:row.sourceRoute || '',
          sourceFile:row.sourceFile || '',
          status:'pending',
          sequence:readingOrders.length + 1,
          originalSequence:readingOrders.length + 1,
          readAt:''
        });
        existing.set(String(row.localizacion), row);
        added++;
      }

      const routes = [...new Set(readingOrders.map(o => String(o.sourceRoute || '')).filter(Boolean))]
        .sort(readingGroupSort);

      if (!readingRouteInfo || !readingRouteInfo.routeId || readingRouteInfo.routeId === 'reading-empty') {
        readingRouteInfo = {
          routeId:'reading-' + Date.now(),
          name:'Lectura residencial · ' + routes.length + (routes.length === 1 ? ' ruta' : ' rutas'),
          subtitle:routes.join(' · '),
          sourceRoutes:routes,
          date:localDateKey()
        };
      } else {
        readingRouteInfo.name = 'Lectura residencial · ' + routes.length + (routes.length === 1 ? ' ruta' : ' rutas');
        readingRouteInfo.subtitle = routes.join(' · ');
        readingRouteInfo.sourceRoutes = routes;
      }

      readingRouteMeta = null;
      hydrateReadingGps();
      saveReadingState();
      renderAll();

      nameEl.value = '';
      dataEl.value = '';
      switchReadingTab('route', document.getElementById('tabRoute'));

      if (typeof showReadingToast === 'function') {
        showReadingToast(added + ' medidores agregados · ' + routes.length + (routes.length === 1 ? ' ruta' : ' rutas'));
      }
    } else {
      loadNewReadingRoute();
      if (typeof showReadingToast === 'function') {
        showReadingToast('PDF listo · ' + merged.length + ' medidores cargados');
      }
    }
  } catch (err) {
    console.error(err);
    if (dataEl) dataEl.value = '';
    if (statusEl) {
      statusEl.className = 'pdf-status error';
      statusEl.textContent = err.message || 'No pude leer el PDF.';
    }
    alert('No cargué datos del PDF. ' + (err.message || 'Formato no reconocido.'));
  } finally {
    event.target.value = '';
  }
}

console.log('[CNFL] Lector PDF de Lectura activo');
