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




function readingPdfExpectedCount(fullText='') {
  const text=String(fullText||'');
  const m=
    text.match(/Total\s+Inspecciones\s*:\s*(\d+)/i) ||
    text.match(/Total\s+Medidores\s*:\s*(\d+)/i) ||
    text.match(/Cantidad\s+(?:de\s+)?Medidores?\s*:?\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

function readingPdfAddUnique(rows,seen,conflicts,locRaw,medRaw) {
  let loc=String(locRaw||'').trim();
  const med=String(medRaw||'').trim();
  if(loc.length===9) loc='0'+loc;
  // La etiqueta/columna identifica el medidor, no su prefijo ni su longitud.
  if(!/^\d{10}$/.test(loc) || !/^\d+$/.test(med)) return false;
  if(seen.has(loc)) {
    if(seen.get(loc)!==med) conflicts.push(loc+': '+seen.get(loc)+' / '+med);
    return true;
  }
  seen.set(loc,med);
  rows.push({localizacion:loc,medidor:med});
  return true;
}

function validateReadingPdfRows(rows,conflicts,expected,label,evidence) {
  if(conflicts.length) {
    throw new Error('Conflicto de Medidor en Localización '+conflicts[0]+'.');
  }
  if(expected !== null && rows.length !== expected) {
    throw new Error(
      label+' indica '+expected+' registros, pero pude validar '+rows.length+
      '. No lo cargué para evitar una jornada incorrecta.'
    );
  }
  // Se cuentan las etiquetas/filas ANTES de buscar medidores. Contar solamente
  // los pares extraídos volvería a aceptar silenciosamente una carga parcial.
  if(!evidence || evidence.detected !== evidence.validated || evidence.unverifiedPages ||
      (expected === null && !evidence.detected)) {
    throw new Error('No pude comprobar la integridad del PDF: hay registros o páginas sin validar, o la asociación de Medidor es ambigua. No cargué datos; revisá las etiquetas y columnas de Localización, Medidor y Contrato.');
  }
  return rows;
}

function parseLabeledReadingPdf(layoutPages,fullText,parser) {
  const rows=[],seen=new Map(),conflicts=[];
  const expected=readingPdfExpectedCount(fullText);
  const evidence={detected:0,validated:0,unverifiedPages:0};
  const pages=(layoutPages||[]).map(rawItems=>groupReadingPdfRows(
    (rawItems||[]).map(readingPdfItemXY),5.5
  ).map(row=>row.items.map(i=>i.text).join(' ')).join('\n'));
  if(!pages.length) pages.push(String(fullText||''));
  if(!pages.some(page=>/\blocalizacion\b/.test(normalizeReadingPdfText(page)))) return null;

  for(const page of pages) {
    const lines=page.split('\n').map(normalizeReadingPdfText);
    // Una fila numérica suelta no desaparece por haber encontrado otras fichas
    // etiquetadas en la misma página. Puede ser un registro parcialmente leído.
    lines.forEach((line,index)=>{
      if(/^\d{9,10}(?=\s|$)/.test(line) &&
          !/^(?:localizacion|medidor|contrato)\s*:?$/.test(lines[index-1]||'')) evidence.detected++;
    });
    const text=normalizeReadingPdfText(page);
    // Cada Localización abre un registro; nunca buscar Medidor en el siguiente.
    const blocks=text.split(/\blocalizacion\s*:?\s*/);
    if(blocks.length===1) { evidence.unverifiedPages++; continue; }
    for(const block of blocks.slice(1)) {
      evidence.detected++;
      const loc=block.match(/^(\d{9,10})(?=\s|$)/);
      const meterLabels=[...block.matchAll(/\bmedidor\b/g)];
      const med=block.match(/\bmedidor\s*:?\s*(\d+)(?=\s|$)(?!\s+\d)/);
      if(loc && meterLabels.length===1 && med &&
          readingPdfAddUnique(rows,seen,conflicts,loc[1],med[1])) evidence.validated++;
    }
  }
  if(!evidence.detected) return null;
  return {
    rows:validateReadingPdfRows(rows,conflicts,expected,'El PDF de lectura',evidence),
    expectedCount:expected,parser
  };
}

function parseInspectionReadingPdf(layoutPages,fullText='') {
  const textNorm=normalizeReadingPdfText(fullText);
  if(!textNorm.includes('hoja de inspeccion') &&
      !(textNorm.includes('localizacion:') && textNorm.includes('contrato:') && textNorm.includes('lec.ant'))) return null;
  const result=parseLabeledReadingPdf(layoutPages,fullText,'inspection-strict');
  if(!result) throw new Error('Reconocí la hoja de inspecciones, pero no pude comprobar su integridad ni leer Localización + Medidor con seguridad.');
  return result;
}

function readingPdfHeaderName(text) {
  return normalizeReadingPdfText(text).replace(/:$/, '').trim()
    .replace(/^(?:numero|n[°º.])\s*(?:de\s+)?/, '')
    .replace(/^secuencia(?:\s+de)?\s+visita$/, 'secuencia');
}

function parseReadingPdfColumns(layoutPages,fullText,locationNames,parser,required=false) {
  const pages=(layoutPages||[]).map(rawItems=>(rawItems||[]).map(readingPdfItemXY).filter(i=>i.text));
  const isLocation=i=>locationNames.includes(readingPdfHeaderName(i.text));
  const isMeter=i=>readingPdfHeaderName(i.text)==='medidor';
  // Las etiquetas de una ficha tienen valores a su lado, no son encabezados.
  const locationHeaders=items=>items.filter(i=>isLocation(i) &&
    !items.some(value=>Math.abs(value.y-i.y)<=6 && /^\d{9,10}$/.test(value.text)));
  const recognized=pages.some(items=>locationHeaders(items).length && items.some(isMeter));
  if(!recognized && !required) return null;

  const rows=[],seen=new Map(),conflicts=[];
  const evidence={detected:0,validated:0,unverifiedPages:0};
  const expected=readingPdfExpectedCount(fullText);
  for(const items of pages) {
    const locHeaders=locationHeaders(items),medHeaders=items.filter(isMeter);
    if(locHeaders.length!==1 || medHeaders.length!==1 ||
        Math.abs(locHeaders[0].y-medHeaders[0].y)>35 ||
        Math.abs(locHeaders[0].x-medHeaders[0].x)<20) {
      // Una página sin encabezado no se puede omitir aunque otra sí sea válida.
      evidence.unverifiedPages++;
      continue;
    }
    const locHeader=locHeaders[0],medHeader=medHeaders[0];
    const headerY=Math.min(locHeader.y,medHeader.y);
    const headers=items.filter(i=>i.y>=headerY-2 && i.y<=Math.max(locHeader.y,medHeader.y)+2 &&
      /[a-z]/i.test(normalizeReadingPdfText(i.text)));
    const tolerance=Math.max(28,Math.min(90,Math.abs(locHeader.x-medHeader.x)*0.62));
    // Los límites se calculan con TODOS los encabezados vecinos, incluido
    // Contrato, independientemente del orden de las columnas.
    function inColumn(item,header) {
      const left=headers.filter(h=>h.x<header.x).reduce((x,h)=>Math.max(x,h.x),-Infinity);
      const right=headers.filter(h=>h.x>header.x).reduce((x,h)=>Math.min(x,h.x),Infinity);
      return Math.abs(item.x-header.x)<=tolerance &&
        item.x>(left+header.x)/2 && item.x<(right+header.x)/2;
    }
    for(const row of groupReadingPdfRows(items,4)) {
      if(row.y>=headerY-2) continue;
      const line=normalizeReadingPdfText(row.items.map(i=>i.text).join(' '));
      if(/^(?:total\b|cantidad\b|pagina\b)/.test(line)) continue;
      const locItems=row.items.filter(i=>inColumn(i,locHeader));
      const medItems=row.items.filter(i=>inColumn(i,medHeader));
      const numeric=i=>/^\d+$/.test(i.text);
      // Inventario independiente de filas, incluso con medidor ausente o roto.
      if(!locItems.length && !medItems.some(numeric) &&
          !row.items.some(i=>/\b\d{9,10}\b/.test(i.text))) continue;
      evidence.detected++;
      if(locItems.length===1 && medItems.length===1 &&
          readingPdfAddUnique(rows,seen,conflicts,locItems[0].text,medItems[0].text)) evidence.validated++;
    }
  }
  if(!recognized || evidence.unverifiedPages) {
    throw new Error('No pude comprobar la integridad del PDF: faltan encabezados inequívocos de Localización/Secuencia y Medidor en alguna página. No cargué datos para evitar confundir Medidor con Contrato.');
  }
  return {
    rows:validateReadingPdfRows(rows,conflicts,expected,'El PDF de lectura',evidence),
    expectedCount:expected,parser
  };
}

function parseMissingReadingTablePdf(layoutPages,fullText='') {
  if(!normalizeReadingPdfText(fullText).includes('medidores sin registro de lectura')) return null;
  return parseReadingPdfColumns(layoutPages,fullText,['localizacion'],'missing-reading-table-strict',true);
}

function parseDemandReadingPdf(layoutPages,fullText='') {
  return parseReadingPdfColumns(layoutPages,fullText,['secuencia','visita'],'demand-column-strict');
}

function parseUniversalReadingRows(layoutPages,fullText='') {
  // Una pareja de números sin etiquetas no prueba cuál es el Medidor.
  return parseLabeledReadingPdf(layoutPages,fullText,'universal-row-v4');
}

function parseReadingPdfLayout(layoutPages,fullText='') {
  if(normalizeReadingPdfText(fullText).includes('listado de desconexiones en moviles')) {
    throw new Error('Este PDF es de desconexiones. Abrilo en Cortes; aquí se cargan lecturas. No se modificó la jornada.');
  }
  // Los formatos con columnas conocidas tienen prioridad sobre el respaldo.
  const result=parseInspectionReadingPdf(layoutPages,fullText)
    || parseMissingReadingTablePdf(layoutPages,fullText)
    || parseDemandReadingPdf(layoutPages,fullText)
    || parseReadingPdfColumns(layoutPages,fullText,['localizacion'],'reading-column-strict')
    || parseUniversalReadingRows(layoutPages,fullText);
  if(!result) throw new Error('Formato de PDF no reconocido. No pude comprobar su integridad; no cargué datos para evitar confundir Medidor con Contrato.');
  if(!result.rows.length) throw new Error('No se extrajo ningún medidor. No se modificó la jornada.');
  return result;
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

let pendingResidentialImport = null;

function cancelResidentialPdfImport() {
  pendingResidentialImport = null;
  const review = document.getElementById('readingPdfReview');
  if (review) { review.hidden = true; review.innerHTML = ''; }
  const status = document.getElementById('readingPdfStatus');
  if (status) { status.className = 'pdf-status'; status.textContent = 'Carga cancelada. Tu jornada no cambió.'; }
}

function confirmResidentialPdfImport() {
  const staged = pendingResidentialImport;
  if (!staged) return;
  // A second tab may have changed the active jornada while the preview was open.
  const current = localStorage.getItem(READING_KEY);
  if (current !== staged.previousState) {
    cancelResidentialPdfImport();
    alert('La jornada cambió en otra pestaña. Volvé a seleccionar los PDFs.');
    return;
  }
  const oldOrders = readingOrders;
  const oldInfo = readingRouteInfo;
  const oldMeta = readingRouteMeta;
  const oldHistory = localStorage.getItem(READING_ROUTE_HISTORY_KEY);
  try {
    readingOrders = staged.orders;
    readingRouteInfo = staged.info;
    readingRouteMeta = null;
    hydrateReadingGps();
    saveReadingState();
  } catch (err) {
    readingOrders = oldOrders;
    readingRouteInfo = oldInfo;
    readingRouteMeta = oldMeta;
    try {
      if (staged.previousState === null) localStorage.removeItem(READING_KEY);
      else localStorage.setItem(READING_KEY, staged.previousState);
      if (oldHistory === null) localStorage.removeItem(READING_ROUTE_HISTORY_KEY);
      else localStorage.setItem(READING_ROUTE_HISTORY_KEY, oldHistory);
    } catch (_) { /* keep the in-memory route and report the storage failure */ }
    const status = document.getElementById('readingPdfStatus');
    if (status) { status.className = 'pdf-status error'; status.textContent = 'No se pudo guardar. La jornada anterior sigue activa.'; }
    alert('No se pudo guardar la jornada en este dispositivo. Revisá el espacio disponible.');
    return;
  }
  pendingResidentialImport = null;
  const review = document.getElementById('readingPdfReview');
  if (review) { review.hidden = true; review.innerHTML = ''; }
  const status = document.getElementById('readingPdfStatus');
  if (status) { status.className = 'pdf-status ok'; status.textContent = staged.summary + ' Guardado en este dispositivo.'; }
  renderAll();
  switchReadingTab('route', document.getElementById('tabRoute'));
  showReadingToast(staged.summary);
  if(typeof window!=='undefined')window.cnflJourneyLoaded?.();
}

async function handleReadingPdfUpload(event) {
  const files = event && event.target && event.target.files ? Array.from(event.target.files) : [];
  if (!files.length) return;
  cancelResidentialPdfImport();

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
      if (readingOrders.length && readingRouteInfo.date && readingRouteInfo.date !== localDateKey()) {
        throw new Error('Hay una jornada de otra fecha abierta. Tocá CERRAR JORNADA Y ABRIR NUEVA en Rutas recientes antes de cargar los PDFs de hoy.');
      }
      const incoming = new Map();
      for (const row of batchRows) {
        const previous = incoming.get(row.localizacion);
        if (previous && String(previous.medidor) !== String(row.medidor)) {
          throw new Error('Los PDFs traen medidores distintos para la Localización ' + row.localizacion + '. Revisá los archivos antes de guardar.');
        }
        incoming.set(row.localizacion, row);
      }
      const stagedOrders = readingOrders.map(o => ({...o}));
      const byLoc = new Map();
      for (const row of stagedOrders) byLoc.set(String(row.localizacion), row);

      let added = 0;
      let repeated = 0;
      let corrected = 0;

      for (const row of batchRows) {
        const old = byLoc.get(row.localizacion);
        if (old) {
          if (String(old.medidor) !== String(row.medidor)) {
            const hasSavedReading = old.status === 'read';
            if (hasSavedReading) {
              throw new Error(
                'La Localización ' + row.localizacion +
                ' ya tiene una lectura guardada con Medidor ' + old.medidor +
                '. Borrá esa ruta antes de reemplazarla por el Medidor ' + row.medidor + '.'
              );
            }

            // Corrige automáticamente una carga anterior equivocada (por ejemplo, Contrato tomado como Medidor).
            old.medidor = row.medidor;
            old.sourceRoute = row.sourceRoute;
            old.sourceRouteName = row.sourceRouteName;
            old.sourceFile = row.sourceFile;
            old.routeSequence = row.routeSequence;
            corrected++;
            continue;
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
        stagedOrders.push(item);
        byLoc.set(item.localizacion,item);
        added++;
      }

       const completed = stagedOrders.filter(o => o.status === 'read');
       const pending = stagedOrders
         .filter(o => o.status !== 'read')
        .sort((a,b)=>{
          const routeCmp = compareReadingRouteLabels(a.sourceRoute || '', b.sourceRoute || '');
          if (routeCmp) return routeCmp;
          return Number(a.routeSequence || 0) - Number(b.routeSequence || 0);
        });

       const nextOrders = [...completed, ...pending].map((o,index)=>({
        ...o,
        sequence:index + 1,
        originalSequence:index + 1
      }));

      const routes = [...new Set(
         nextOrders.map(o=>String(o.sourceRoute || '')).filter(Boolean)
      )].sort(compareReadingRouteLabels);

       let nextInfo = {...readingRouteInfo};
       if (!nextInfo.routeId || nextInfo.routeId === 'reading-empty') {
         nextInfo = {
          routeId:'residential-' + Date.now(),
          name:'Lectura residencial · jornada',
          subtitle:'',
          date:localDateKey(),
          sourceRoutes:[]
        };
      }

       nextInfo.name = 'Lectura residencial · ' + routes.length + (routes.length === 1 ? ' ruta' : ' rutas');
       nextInfo.subtitle = routes.length ? routes.join(' · ') : 'Jornada residencial';
       nextInfo.date = nextInfo.date || localDateKey();
       nextInfo.sourceRoutes = routes;

       const summary = nextOrders.length + ' medidores · ' + routes.length + ' rutas · ' + added + ' nuevos · ' + repeated + ' repetidos · ' + corrected + ' corregidos';
       pendingResidentialImport = {orders:nextOrders, info:nextInfo, summary, previousState:localStorage.getItem(READING_KEY)};
       const review = document.getElementById('readingPdfReview');
       if (review) {
         review.hidden = false;
         review.innerHTML = '<h3>Revisá antes de guardar</h3><p>' + escapeHtml(summary) + '</p>' +
           '<ul>' + batches.map(b => '<li>' + escapeHtml(b.fileName) + ' · ' + b.rows.length + ' medidores</li>').join('') + '</ul>' +
           (corrected ? '<p class="review-warning">' + corrected + ' medidor(es) existente(s) cambiarán de número. Revisá los PDFs.</p>' : '') +
           '<div class="review-actions"><button class="btn-primary" type="button" onclick="confirmResidentialPdfImport()">AGREGAR A JORNADA</button>' +
           '<button class="btn-secondary" type="button" onclick="cancelResidentialPdfImport()">CANCELAR</button></div>';
         review.scrollIntoView({behavior:'smooth',block:'start'});
       }

      if (statusEl) {
        statusEl.className = 'pdf-status ok';
         statusEl.textContent = 'PDFs leídos. Revisá el resumen y tocá AGREGAR A JORNADA para guardar.';
      }
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

console.log('[CNFL] Lector PDF v4 activo · universal LMR0085/LMR0155');

console.log('[CNFL] Parser lectura v3 · LMR0085/LMR0155');
