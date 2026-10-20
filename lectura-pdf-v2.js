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

      // Último respaldo geométrico: localización a la izquierda y medidor cercano a la derecha.
      const tokens = [];
      for (const item of row.items) {
        for (const match of String(item.text || '').matchAll(/\d+/g)) {
          tokens.push({ digits: match[0], x: item.x });
        }
      }

      const locs = tokens.filter(t => t.digits.length === 9 || t.digits.length === 10);
      for (const locToken of locs) {
        const meter = tokens
          .filter(t => t !== locToken && t.x >= locToken.x && t.digits.length >= 4 && t.digits.length <= 8)
          .sort((a,b) => a.x - b.x)[0];
        if (meter) {
          add(locToken.digits, meter.digits);
          break;
        }
      }
    }
  }

  if (conflicts.length) {
    throw new Error('El PDF trae Localizaciones con medidores diferentes: ' + conflicts.slice(0,6).join(', '));
  }

  const text = String(fullText || '');
  const expectedMatch =
    text.match(/Total\s+Inspecciones\s*:\s*(\d+)/i) ||
    text.match(/Total\s+Medidores\s*:\s*(\d+)/i) ||
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
  const inspectionRe = /Localizaci[oó]n\s*:\s*(\d{9,10})\s+Medidor\s*:\s*(\d{4,8})/gi;
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
    text.match(/Total\s+Medidores\s*:\s*(\d+)/i) ||
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

function parseReadingPdfLayout(layoutPages, fullText = '') {
  const rowPairs = parseReadingPdfRowPairs(layoutPages, fullText);
  if (rowPairs.rows.length) {
    return {
      rows: rowPairs.rows,
      expectedCount: rowPairs.expectedCount,
      pagesWithHeaders: 0,
      parser: 'row-layout'
    };
  }

  const direct = parseReadingPdfDirectText(fullText);
  if (direct.rows.length) {
    return {
      rows: direct.rows,
      expectedCount: direct.expectedCount,
      pagesWithHeaders: 0,
      parser: 'direct-text'
    };
  }

  const found = [];
  const seen = new Map();
  const conflicts = [];
  let pagesWithHeaders = 0;

  for (const rawItems of layoutPages || []) {
    const items = (rawItems || []).map(readingPdfItemXY).filter(i => i.text);
    const seqHeaders = items.filter(i => {
      const n = normalizeReadingPdfText(i.text);
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
    throw new Error('No pude extraer pares válidos de Localización + Medidor.');
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

function readingPdfRouteCode(name, fullText) {
  const text = String(fullText || '');
  const m = text.match(/RUTA\s+(\d{4}-\d+)/i)
    || text.match(/Ciclo\s+Lectura\s*:\s*(\d{4})[\s\S]{0,220}?Ruta\s+Lectura\s*:\s*(\d+)/i)
    || String(name || '').match(/(\d{4})-(\d+)/);

  if (!m) return readingPdfSuggestedName(name, fullText);

  if (m.length >= 3 && !String(m[1]).includes('-')) {
    return String(m[1]) + '-' + String(m[2]);
  }
  return String(m[1]);
}

function readingRouteSortKey(label) {
  const m = String(label || '').match(/(\d{4})-(\d+)/);
  if (!m) return [999999, 999999, String(label || '')];
  return [Number(m[1]), Number(m[2]), String(label || '')];
}

function compareReadingRouteLabels(a,b) {
  const ka = readingRouteSortKey(a);
  const kb = readingRouteSortKey(b);
  return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2]);
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

    const batches = [];

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
        fullText += (textContent.items || [])
          .map(item => String(item.str || '').trim())
          .filter(Boolean)
          .join('\n') + '\n';
      }

      const parsed = parseReadingPdfLayout(layoutPages, fullText);
      const routeLabel = readingPdfRouteCode(file.name, fullText);
      const routeName = readingPdfSuggestedName(file.name, fullText);

      batches.push({
        fileName:file.name,
        routeLabel,
        routeName,
        rows:parsed.rows.map((row,index)=>({
          ...row,
          sourceRoute:routeLabel,
          sourceRouteName:routeName,
          sourceFile:file.name,
          routeSequence:index + 1
        }))
      });
    }

    batches.sort((a,b)=>compareReadingRouteLabels(a.routeLabel,b.routeLabel));

    const batchRows = batches.flatMap(b=>b.rows);
    if (!batchRows.length) throw new Error('No se extrajo ningún medidor.');

    // Lectura residencial: todos los PDFs del día forman UNA sola jornada.
    // Si cargás más PDFs después, se agregan a la misma jornada en vez de reemplazarla.
    if (READING_MODE === 'residencial') {
      const byLoc = new Map();
      for (const row of readingOrders) byLoc.set(String(row.localizacion), row);

      let added = 0;
      let repeated = 0;

      for (const row of batchRows) {
        const old = byLoc.get(row.localizacion);
        if (old) {
          if (String(old.medidor) !== String(row.medidor)) {
            throw new Error(
              'Conflicto en Localización ' + row.localizacion +
              ': ' + old.medidor + ' / ' + row.medidor
            );
          }
          repeated++;
          continue;
        }

        const item = {
          id:'read-' + row.localizacion,
          localizacion:row.localizacion,
          medidor:row.medidor,
          lectura:'',
          status:'pending',
          readAt:'',
          deferCount:0,
          sourceRoute:row.sourceRoute,
          sourceRouteName:row.sourceRouteName,
          sourceFile:row.sourceFile,
          routeSequence:row.routeSequence,
          sequence:0,
          originalSequence:0
        };
        readingOrders.push(item);
        byLoc.set(item.localizacion,item);
        added++;
      }

      const completed = readingOrders.filter(o => o.status === 'read' && String(o.lectura || '').trim());
      const pending = readingOrders
        .filter(o => !(o.status === 'read' && String(o.lectura || '').trim()))
        .sort((a,b)=>{
          const routeCmp = compareReadingRouteLabels(a.sourceRoute || '', b.sourceRoute || '');
          if (routeCmp) return routeCmp;
          return Number(a.routeSequence || 0) - Number(b.routeSequence || 0);
        });

      readingOrders = [...completed, ...pending].map((o,index)=>({
        ...o,
        sequence:index + 1,
        originalSequence:index + 1
      }));

      const routes = [...new Set(
        readingOrders.map(o=>String(o.sourceRoute || '')).filter(Boolean)
      )].sort(compareReadingRouteLabels);

      if (!readingRouteInfo || !readingRouteInfo.routeId || readingRouteInfo.routeId === 'reading-empty') {
        readingRouteInfo = {
          routeId:'residential-' + Date.now(),
          name:'Lectura residencial · jornada',
          subtitle:'',
          date:localDateKey(),
          sourceRoutes:[]
        };
      }

      readingRouteInfo.name = 'Lectura residencial · ' + routes.length + (routes.length === 1 ? ' ruta' : ' rutas');
      readingRouteInfo.subtitle = routes.length ? routes.join(' · ') : 'Jornada residencial';
      readingRouteInfo.date = readingRouteInfo.date || localDateKey();
      readingRouteInfo.sourceRoutes = routes;
      readingRouteMeta = null;

      hydrateReadingGps();
      saveReadingState();
      renderAll();

      if (dataEl) dataEl.value = readingOrders.map(r => r.localizacion + ' ' + r.medidor).join('\n');
      if (nameEl) nameEl.value = readingRouteInfo.name;

      if (statusEl) {
        statusEl.className = 'pdf-status ok';
        statusEl.innerHTML =
          '<i class="fa-solid fa-check"></i> Jornada unificada: ' +
          readingOrders.length + ' medidores en ' + routes.length + ' rutas.' +
          (added ? ' Agregados ahora: ' + added + '.' : '') +
          (repeated ? ' Repetidos omitidos: ' + repeated + '.' : '');
      }

      switchReadingTab('route', document.getElementById('tabRoute'));
      showReadingToast(
        'Jornada unificada · ' + readingOrders.length +
        ' medidores · ' + routes.length + ' rutas'
      );
      return;
    }

    // Demanda: mantiene el comportamiento de una ruta por carga.
    const byLoc = new Map();
    const merged = [];
    for (const row of batchRows) {
      const old = byLoc.get(row.localizacion);
      if (old && old.medidor !== row.medidor) {
        throw new Error('Conflicto en Localización ' + row.localizacion + ': ' + old.medidor + ' / ' + row.medidor);
      }
      if (old) continue;
      byLoc.set(row.localizacion,row);
      merged.push(row);
    }

    dataEl.value = merged.map(r => r.localizacion + ' ' + r.medidor).join('\n');
    nameEl.value = files.length === 1
      ? batches[0].routeName
      : 'Demanda · ' + files.length + ' PDFs';

    if (statusEl) {
      statusEl.className = 'pdf-status ok';
      statusEl.innerHTML = '<i class="fa-solid fa-check"></i> ' + merged.length + ' medidores extraídos. Cargando jornada...';
    }

    loadNewReadingRoute();
    showReadingToast('PDF listo · ' + merged.length + ' medidores cargados');
  } catch (err) {
    console.error(err);
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
