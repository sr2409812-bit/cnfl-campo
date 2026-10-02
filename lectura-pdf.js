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

function parseReadingPdfLayout(layoutPages, fullText = '') {
  const found = [];
  const seen = new Map();
  const conflicts = [];
  let pagesWithHeaders = 0;

  for (const rawItems of layoutPages || []) {
    const items = (rawItems || []).map(readingPdfItemXY).filter(i => i.text);
    const seqHeaders = items.filter(i => {
      const n = normalizeReadingPdfText(i.text);
      return n.includes('secuencia') || n === 'visita';
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
    throw new Error('No encontré las columnas “Secuencia de Visita” y “Medidor” en el PDF.');
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
    throw new Error('No pude extraer pares válidos de Secuencia de Visita + Medidor.');
  }

  return { rows: found, expectedCount, pagesWithHeaders };
}

function readingPdfSuggestedName(fileName, fullText) {
  const text = String(fullText || '').replace(/\s+/g, ' ');
  const routeMatch = text.match(/(?:Ruta|Recorrido)\s*[:#-]?\s*([A-Z0-9]{2,}(?:[-/]\d{1,3})?)/i);
  if (routeMatch) return routeMatch[1];
  return String(fileName || 'Ruta de lectura').replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim();
}

async function handleReadingPdfUpload(event) {
  const file = event && event.target && event.target.files ? event.target.files[0] : null;
  if (!file) return;

  const statusEl = document.getElementById('readingPdfStatus');
  const dataEl = document.getElementById('newRouteData');
  const nameEl = document.getElementById('newRouteName');

  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.className = 'pdf-status';
    statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Leyendo Secuencia de Visita y Medidor...';
  }

  try {
    if (typeof pdfjsLib === 'undefined') throw new Error('El lector PDF no está disponible.');

    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

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
    dataEl.value = parsed.rows.map(r => r.localizacion + ' ' + r.medidor).join('\n');

    if (!String(nameEl.value || '').trim()) {
      nameEl.value = readingPdfSuggestedName(file.name, fullText);
    }

    if (statusEl) {
      statusEl.className = 'pdf-status ok';
      statusEl.innerHTML = '<i class="fa-solid fa-check"></i> ' + parsed.rows.length + ' medidores extraídos. Revisá el nombre y tocá “Cargar ruta”.';
    }

    if (typeof showReadingToast === 'function') {
      showReadingToast('PDF listo · ' + parsed.rows.length + ' Localizaciones + Medidores');
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
