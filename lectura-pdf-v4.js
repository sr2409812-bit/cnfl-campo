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
  let loc=String(locRaw||'').replace(/\D/g,'');
  const med=String(medRaw||'').replace(/\D/g,'');
  if(loc.length===9) loc='0'+loc;
  if(!/^\d{10}$/.test(loc) || !/^\d{4,8}$/.test(med)) return;
  if(seen.has(loc)) {
    if(seen.get(loc)!==med) conflicts.push(loc+': '+seen.get(loc)+' / '+med);
    return;
  }
  seen.set(loc,med);
  rows.push({localizacion:loc,medidor:med});
}

function validateReadingPdfRows(rows,conflicts,expected,label) {
  if(conflicts.length) {
    throw new Error('Conflicto de Medidor en Localización '+conflicts[0]+'.');
  }
  if(expected && rows.length !== expected) {
    throw new Error(
      label+' indica '+expected+' registros, pero pude validar '+rows.length+
      '. No lo cargué para evitar una jornada incorrecta.'
    );
  }
  return rows;
}

function parseInspectionReadingPdf(layoutPages,fullText='') {
  const textNorm=normalizeReadingPdfText(fullText);
  const looksInspection=
    textNorm.includes('hoja de inspeccion') ||
    (textNorm.includes('localizacion:') && textNorm.includes('contrato:') && textNorm.includes('lec.ant'));

  if(!looksInspection) return null;

  const rows=[],seen=new Map(),conflicts=[];
  const expected=readingPdfExpectedCount(fullText);

  for(const rawItems of layoutPages||[]) {
    const items=(rawItems||[]).map(readingPdfItemXY).filter(i=>i.text);
    const locLabels=items.filter(i=>{
      const n=normalizeReadingPdfText(i.text);
      return n==='localizacion:' || n==='localizacion';
    });
    const medLabels=items.filter(i=>{
      const n=normalizeReadingPdfText(i.text);
      return n==='medidor:' || n==='medidor';
    });
    const tariffLabels=items.filter(i=>normalizeReadingPdfText(i.text).startsWith('tarifa'));

    for(const locLabel of locLabels) {
      const medLabel=medLabels
        .filter(m=>Math.abs(m.y-locLabel.y)<=8 && m.x>locLabel.x)
        .sort((a,b)=>Math.abs(a.y-locLabel.y)-Math.abs(b.y-locLabel.y) || a.x-b.x)[0];
      if(!medLabel) continue;

      const tariffLabel=tariffLabels
        .filter(t=>Math.abs(t.y-locLabel.y)<=8 && t.x>medLabel.x)
        .sort((a,b)=>a.x-b.x)[0] || null;

      const locCandidates=items
        .map(i=>({...i,digits:String(i.text||'').replace(/\D/g,'')}))
        .filter(i=>
          (i.digits.length===9||i.digits.length===10) &&
          Math.abs(i.y-locLabel.y)<=6 &&
          i.x>locLabel.x &&
          i.x<medLabel.x
        )
        .sort((a,b)=>Math.abs(a.y-locLabel.y)-Math.abs(b.y-locLabel.y) || a.x-b.x);

      const meterRightLimit=tariffLabel ? tariffLabel.x : medLabel.x+125;
      const medCandidates=items
        .map(i=>({...i,digits:String(i.text||'').replace(/\D/g,'')}))
        .filter(i=>
          i.digits.length>=4 && i.digits.length<=8 &&
          Math.abs(i.y-medLabel.y)<=6 &&
          i.x>medLabel.x &&
          i.x<meterRightLimit
        )
        .sort((a,b)=>Math.abs(a.y-medLabel.y)-Math.abs(b.y-medLabel.y) || a.x-b.x);

      if(!locCandidates.length || !medCandidates.length) continue;

      // IMPORTANTE: el Contrato está en la fila inferior. Nunca se usa como Medidor.
      readingPdfAddUnique(rows,seen,conflicts,locCandidates[0].digits,medCandidates[0].digits);
    }
  }

  return {
    rows:validateReadingPdfRows(rows,conflicts,expected,'El PDF de inspecciones'),
    expectedCount:expected,
    parser:'inspection-strict'
  };
}

function parseMissingReadingTablePdf(layoutPages,fullText='') {
  const textNorm=normalizeReadingPdfText(fullText);
  const looksTable=textNorm.includes('medidores sin registro de lectura');
  if(!looksTable) return null;

  const rows=[],seen=new Map(),conflicts=[];
  const expected=readingPdfExpectedCount(fullText);

  for(const rawItems of layoutPages||[]) {
    const items=(rawItems||[]).map(readingPdfItemXY).filter(i=>i.text);
    const locHeader=items.find(i=>normalizeReadingPdfText(i.text)==='localizacion');
    const medHeader=items.find(i=>normalizeReadingPdfText(i.text)==='medidor');
    const contractHeader=items.find(i=>normalizeReadingPdfText(i.text)==='contrato');
    if(!locHeader || !medHeader || !contractHeader) continue;

    const leftMeter=(locHeader.x+medHeader.x)/2;
    const rightMeter=(medHeader.x+contractHeader.x)/2;

    const locItems=items
      .map(i=>({...i,digits:String(i.text||'').replace(/\D/g,'')}))
      .filter(i=>/^\d{10}$/.test(i.digits) && i.y<locHeader.y-2 && Math.abs(i.x-locHeader.x)<35)
      .sort((a,b)=>b.y-a.y);

    for(const locItem of locItems) {
      const meters=items
        .map(i=>({...i,digits:String(i.text||'').replace(/\D/g,'')}))
        .filter(i=>
          i.digits.length>=4 && i.digits.length<=8 &&
          Math.abs(i.y-locItem.y)<=4 &&
          i.x>leftMeter &&
          i.x<rightMeter
        )
        .sort((a,b)=>Math.abs(a.y-locItem.y)-Math.abs(b.y-locItem.y) || Math.abs(a.x-medHeader.x)-Math.abs(b.x-medHeader.x));

      if(!meters.length) continue;
      readingPdfAddUnique(rows,seen,conflicts,locItem.digits,meters[0].digits);
    }
  }

  return {
    rows:validateReadingPdfRows(rows,conflicts,expected,'El PDF de medidores sin lectura'),
    expectedCount:expected,
    parser:'missing-reading-table-strict'
  };
}

function parseDemandReadingPdf(layoutPages,fullText='') {
  const rows=[],seen=new Map(),conflicts=[];
  let pagesWithHeaders=0;

  for(const rawItems of layoutPages||[]) {
    const items=(rawItems||[]).map(readingPdfItemXY).filter(i=>i.text);

    const seqHeaders=items.filter(i=>{
      const n=normalizeReadingPdfText(i.text);
      return n.includes('secuencia') || n==='visita';
    });
    const medHeaders=items.filter(i=>normalizeReadingPdfText(i.text).includes('medidor'));

    let seqHeader=null,medHeader=null,best=Infinity;
    for(const s of seqHeaders) {
      for(const m of medHeaders) {
        const yGap=Math.abs(s.y-m.y);
        const xGap=Math.abs(s.x-m.x);
        if(xGap<20||yGap>35) continue;
        const score=yGap+Math.abs(xGap-90)*0.02;
        if(score<best){best=score;seqHeader=s;medHeader=m;}
      }
    }
    if(!seqHeader||!medHeader) continue;
    pagesWithHeaders++;

    const seqX=seqHeader.x,medX=medHeader.x,headerY=Math.min(seqHeader.y,medHeader.y);
    const columnGap=Math.abs(medX-seqX);
    const xTolerance=Math.max(28,Math.min(90,columnGap*0.62));

    for(const row of groupReadingPdfRows(items)) {
      if(row.y>=headerY-2) continue;
      const tokens=[];
      for(const item of row.items) {
        for(const raw of (String(item.text).match(/\d+/g)||[])) tokens.push({digits:raw,x:item.x});
      }

      const locs=tokens
        .filter(t=>t.digits.length===9||t.digits.length===10)
        .map(t=>({localizacion:t.digits.length===9?'0'+t.digits:t.digits,dx:Math.abs(t.x-seqX)}))
        .filter(t=>t.dx<=xTolerance)
        .sort((a,b)=>a.dx-b.dx);
      const meters=tokens
        .filter(t=>t.digits.length>=4&&t.digits.length<=8)
        .map(t=>({medidor:t.digits,dx:Math.abs(t.x-medX)}))
        .filter(t=>t.dx<=xTolerance)
        .sort((a,b)=>a.dx-b.dx);

      if(locs.length&&meters.length) readingPdfAddUnique(rows,seen,conflicts,locs[0].localizacion,meters[0].medidor);
    }
  }

  if(!pagesWithHeaders) return null;
  const expected=readingPdfExpectedCount(fullText);
  return {
    rows:validateReadingPdfRows(rows,conflicts,expected,'El PDF de lectura'),
    expectedCount:expected,
    parser:'demand-column-strict'
  };
}

function parseUniversalReadingRows(layoutPages,fullText='') {
  const rows=[],seen=new Map(),conflicts=[];
  const expected=readingPdfExpectedCount(fullText);

  function add(locRaw,medRaw){
    let loc=String(locRaw||'').replace(/\D/g,'');
    const med=String(medRaw||'').replace(/\D/g,'');
    if(loc.length===9) loc='0'+loc;
    if(!/^\d{10}$/.test(loc)||!/^\d{4,8}$/.test(med)) return;
    if(seen.has(loc)){
      if(seen.get(loc)!==med) conflicts.push(loc+': '+seen.get(loc)+' / '+med);
      return;
    }
    seen.set(loc,med);
    rows.push({localizacion:loc,medidor:med});
  }

  // Primer pase: cada renglón visual del PDF. Esto cubre LMR0085 y LMR0155
  // aunque PDF.js divida etiquetas, valores y columnas en varios fragmentos.
  for(const rawItems of layoutPages||[]){
    const items=(rawItems||[]).map(readingPdfItemXY).filter(i=>i.text);
    const grouped=groupReadingPdfRows(items,5.5);
    for(const row of grouped){
      const line=row.items.map(i=>String(i.text||'').trim()).filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
      if(!line) continue;

      let m=line.match(/Localizaci[oó]n\s*:?\s*(\d{9,10})[\s\S]{0,120}?Medidor\s*:?\s*(\d{4,8})/i);
      if(m){add(m[1],m[2]);continue;}

      m=line.match(/^\s*(\d{9,10})\s+(\d{4,8})(?=\s|$)/);
      if(m){add(m[1],m[2]);continue;}
    }
  }

  // Segundo pase: texto continuo. Ayuda si el motor PDF separa una misma línea
  // en fragmentos con coordenadas ligeramente distintas.
  const text=String(fullText||'');
  const inspection=/Localizaci[oó]n[\s:\-]*?(\d{9,10})[\s\S]{0,120}?Medidor[\s:\-]*?(\d{4,8})/gi;
  let m;
  while((m=inspection.exec(text))!==null) add(m[1],m[2]);

  if(conflicts.length) throw new Error('Conflicto de Medidor en Localización '+conflicts[0]+'.');
  if(rows.length&&expected&&rows.length!==expected){
    throw new Error('El PDF indica '+expected+' registros, pero pude validar '+rows.length+'. No lo cargué para evitar una jornada incompleta.');
  }
  if(!rows.length) return null;
  return {rows,expectedCount:expected,parser:'universal-row-v4'};
}
function parseReadingPdfLayout(layoutPages,fullText='') {
  const universal=parseUniversalReadingRows(layoutPages,fullText);
  if(universal) return universal;

  const inspection=parseInspectionReadingPdf(layoutPages,fullText);
  if(inspection) {
    if(!inspection.rows.length) throw new Error('Reconocí la hoja de inspecciones, pero no pude leer Localización + Medidor con seguridad.');
    return inspection;
  }

  const table=parseMissingReadingTablePdf(layoutPages,fullText);
  if(table) {
    if(!table.rows.length) throw new Error('Reconocí la tabla de medidores, pero no pude separar la columna Medidor de Contrato con seguridad.');
    return table;
  }

  const demand=parseDemandReadingPdf(layoutPages,fullText);
  if(demand) {
    if(!demand.rows.length) throw new Error('Reconocí el PDF de lectura, pero no pude validar Localización + Medidor.');
    return demand;
  }

  throw new Error('Formato de PDF no reconocido. No cargué datos para evitar confundir Medidor con Contrato.');
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
