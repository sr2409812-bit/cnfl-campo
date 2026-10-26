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

function parseReadingPdfLayout(layoutPages,fullText='') {
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
      let corrected = 0;

      for (const row of batchRows) {
        const old = byLoc.get(row.localizacion);
        if (old) {
          if (String(old.medidor) !== String(row.medidor)) {
            const hasSavedReading = old.status === 'read' && String(old.lectura || '').trim();
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
          (corrected ? ' Medidores corregidos: ' + corrected + '.' : '') +
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

console.log('[CNFL] Parser lectura v3 · LMR0085/LMR0155');
