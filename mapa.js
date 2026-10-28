(function(){
  const names={cortes:'Cortes',demanda:'Demanda',residencial:'Residencial',notificaciones:'Notificaciones'};
  const colors={cortes:'#F26C21',demanda:'#2257B8',residencial:'#8754C9',notificaciones:'#C43867'};
  const params=new URLSearchParams(location.search);
  const embedded=params.get('embedded')==='1'&&window.parent!==window;
  if(embedded)document.body.classList.add('embedded-map');
  let type=Object.hasOwn(names,params.get('tipo')) ? params.get('tipo') : 'todos';
  let pendingOnly=false, map=null, layer=null, myLayer=null, routeLayer=null, shown=[];
  let preview=null, generation=0, reviewChoice='', retryDraft=null;
  let manualKeys=[];try{const saved=JSON.parse(localStorage.getItem('cnfl_manual_route_v1')||'[]');if(Array.isArray(saved))manualKeys=saved.filter(k=>typeof k==='string').slice(0,120);}catch(_){}
  let manualTrace=null,manualToken=0,manualDraft=false,selectedKey=null,clusterKeys=null,routeMode=false;
  const box=document.getElementById('fieldMap');
  const list=document.getElementById('mapList');
  const count=document.getElementById('mapCount');
  const previewStatus=document.getElementById('previewStatus');
  const previewResult=document.getElementById('previewResult');
  const previewReview=document.getElementById('previewReview');
  const fallbackButton=document.getElementById('previewUnfiltered');
  const selectedPanel=document.getElementById('selectedPanel');
  const manualList=document.getElementById('manualList');
  const manualStatus=document.getElementById('manualStatus');
  const manualPanel=document.getElementById('manualPanel');
  const routeModeButton=document.getElementById('routeMode');
  const routeHint=document.getElementById('routeHint');
  const routeOverview=document.getElementById('routeOverview');
  function safe(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function key(o){return o.type+':'+o.loc;}
  function manualStops(){const rows=new Map(window.CNFLFieldMapData.collect().filter(o=>!o.done&&o.lat!==null).map(o=>[key(o),o]));return manualKeys.map(k=>rows.get(k)).filter(Boolean);}
  function persistManual(){try{localStorage.setItem('cnfl_manual_route_v1',JSON.stringify(manualKeys));}catch(_){manualStatus.textContent='No se pudo guardar la ruta en este teléfono.';}}
  function syncManual(){const rows=new Set(window.CNFLFieldMapData.collect().filter(o=>!o.done&&o.lat!==null).map(key));const clean=[...new Set(manualKeys)].filter(k=>rows.has(k)).slice(0,120);if(clean.length!==manualKeys.length){manualKeys=clean;manualTrace=null;persistManual();}}
  function changeManual(next){manualKeys=next;manualTrace=null;manualDraft=false;manualToken++;document.getElementById('manualUnfiltered').hidden=true;persistManual();if(preview) clearPreview();else render();}
  function addManual(o){if(o.done||manualKeys.includes(key(o)))return;if(manualKeys.length>=120){manualStatus.textContent='La ruta admite hasta 120 paradas.';return;}changeManual([...manualKeys,key(o)]);}
  function focusJob(o){clusterKeys=null;selectedKey=key(o);renderSelection();if(map&&o.lat!==null)map.setView([o.lat,o.lon],Math.max(map.getZoom(),16));}
  function renderCluster(){
    const rows=visibleRows().filter(o=>clusterKeys.includes(key(o)));
    if(!rows.length){clusterKeys=null;selectedPanel.hidden=true;return;}
    selectedPanel.hidden=false;
    selectedPanel.innerHTML='<div class="sheet-header"><div><h2>'+rows.length+' puntos muy cercanos</h2><p>'+(routeMode?'Elegí cuál agregar a la ruta':'Elegí la orden que querés revisar')+'</p></div><button id="closeSelected" type="button" aria-label="Cerrar lista">×</button></div><div id="clusterChoices" class="cluster-choices"></div>';
    document.getElementById('closeSelected').onclick=()=>{clusterKeys=null;selectedPanel.hidden=true;};
    const choices=document.getElementById('clusterChoices');
    rows.forEach(o=>{
      const b=document.createElement('button');b.type='button';b.className='cluster-choice';
      const position=manualKeys.indexOf(key(o));
      b.textContent=(position>=0?'#'+(position+1)+' · ':'')+o.label+' · '+o.loc+(o.done?' · HECHO':position>=0?' · EN RUTA':' · PENDIENTE');
      b.onclick=()=>{
        if(routeMode&&!o.done&&position<0){addManual(o);return;}
        focusJob(o);
      };
      choices.append(b);
    });
  }
  function renderSelection(){
    if(clusterKeys){renderCluster();return;}
    const all=visibleRows(),o=all.find(row=>key(row)===selectedKey);
    if(!o){selectedPanel.hidden=true;return;}
    selectedPanel.hidden=false;
    const available=x=>!routeMode||!manualKeys.includes(key(x.row));
    const near=window.CNFLFieldMapData.nearby(all,o,250).filter(available);
    const choices=near.length?near.slice(0,8):window.CNFLFieldMapData.nearby(all,o,Infinity).filter(available).slice(0,3);
    const coords=encodeURIComponent(o.lat+','+o.lon);
    selectedPanel.innerHTML='<div class="sheet-header"><div><h2>'+safe(o.label)+'</h2><p>'+safe(names[o.type])+' · Localización '+safe(o.loc)+' · '+(o.done?'GESTIONADO':'PENDIENTE')+'</p></div><button id="closeSelected" type="button" aria-label="Cerrar ficha">×</button></div>'+
      '<div class="selected-actions"><button id="addSelected" type="button" '+(o.done||manualKeys.includes(key(o))?'disabled':'')+'>'+(manualKeys.includes(key(o))?'EN MI RUTA':'AÑADIR A MI RUTA')+'</button><a href="'+safe(o.href)+'">ABRIR FICHA</a></div>'+
      '<h3>'+(near.length?'Pendientes a 250 m ('+near.length+')':'Sin pendientes a 250 m · los más cercanos')+'</h3><div id="nearbyList"></div>'+
      '<div class="sheet-links"><a target="_blank" rel="noopener" href="https://www.waze.com/ul?ll='+coords+'&navigate=yes">WAZE</a><a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query='+coords+'">MAPS</a></div>'+
      (o.type==='cortes'?'<details class="quick-status"><summary>CAMBIAR ESTADO DE ESTA ORDEN</summary><div class="quick-grid">'+[['cortado','Cortado'],['avisado','Avisado'],['reconectado','Reconectado'],['pago','Pagó sitio'],['no_acceso','Sin acceso'],['pending','Devolver a pendiente']].map(([value,label])=>'<button type="button" data-status="'+value+'" '+((o.done?value==='pending':value!=='pending')?'':'disabled')+'>'+label+'</button>').join('')+'</div></details>':'');
    document.getElementById('closeSelected').onclick=()=>{selectedKey=null;selectedPanel.hidden=true;};
    document.getElementById('addSelected').onclick=()=>addManual(o);
    if(embedded&&o.type==='cortes')document.querySelector('.selected-actions a').onclick=event=>{
      event.preventDefault();window.parent.postMessage({kind:'cnfl:open-cut',loc:o.loc},location.origin);
    };
    selectedPanel.querySelectorAll('[data-status]').forEach(button=>button.onclick=()=>{
      if(!window.CNFLFieldMapData.setCutStatus(o.loc,o.orderId,button.dataset.status)){manualStatus.textContent='No pude actualizar la orden. Revisá el almacenamiento del teléfono.';return;}
      if(preview)clearPreview();else render();
    });
    const nearList=document.getElementById('nearbyList');
    if(!choices.length){nearList.innerHTML='<p>No hay más trabajos pendientes con GPS en este filtro.</p>';return;}
    choices.forEach(({row,meters})=>{const b=document.createElement('button');b.type='button';b.className='nearby-item';b.textContent=(routeMode?'+ ':'')+row.label+' · '+Math.round(meters)+' m';b.onclick=()=>{if(routeMode)addManual(row);focusJob(row);};nearList.append(b);});
  }
  function renderManual(){
    syncManual();const stops=manualStops();manualList.replaceChildren();
    stops.forEach((o,index)=>{const item=document.createElement('li');const label=document.createElement('span');label.textContent=o.label+' · '+names[o.type];const controls=document.createElement('span');controls.className='manual-controls';
      for(const [title,delta] of [['↑',-1],['↓',1],['×',null]]){const b=document.createElement('button');b.type='button';b.textContent=title;b.setAttribute('aria-label',delta===null?'Quitar '+o.label:'Mover '+o.label+(delta<0?' arriba':' abajo'));b.disabled=delta!==null&&(index+delta<0||index+delta>=stops.length);b.onclick=()=>{const next=[...manualKeys];if(delta===null)next.splice(index,1);else [next[index],next[index+delta]]=[next[index+delta],next[index]];changeManual(next);};controls.append(b);}
      item.append(label,controls);manualList.append(item);
    });
    manualPanel.hidden=!stops.length;
    document.getElementById('manualCount').textContent=stops.length+(stops.length===1?' parada':' paradas');
    routeModeButton.setAttribute('aria-pressed',String(routeMode));
    routeModeButton.textContent=routeMode?'LISTO':'ARMAR MI RUTA';
    routeHint.textContent=routeMode?stops.length+(stops.length===1?' parada':' paradas')+' · tocá la siguiente':stops.length?stops.length+(stops.length===1?' parada guardada':' paradas guardadas'):'Tocá “Armar mi ruta” para empezar';
    routeOverview.hidden=!stops.length;
    document.getElementById('traceManual').disabled=stops.length<2;
    document.getElementById('showManual').disabled=!preview;
    document.getElementById('undoManual').disabled=!stops.length;
    document.getElementById('clearManual').disabled=!stops.length;
    if(!stops.length)manualStatus.textContent='Elegí tu primera parada en el mapa.';
    else if(manualTrace)manualStatus.textContent=stops.length+(stops.length===1?' parada':' paradas')+' en tu orden · '+(manualTrace.meters/1000).toFixed(1)+' km · '+Math.round(manualTrace.seconds/60)+' min estimados'+(manualTrace.unfiltered?' · BORRADOR SIN FILTRO VIAL':'')+'.';
    else manualStatus.textContent=stops.length+(stops.length===1?' parada':' paradas')+' en tu orden. Línea visual entre puntos; tocá «Ver por calles» para revisar el trayecto.';
  }
  function visibleRows(){return window.CNFLFieldMapData.collect().filter(o=>(type==='todos'||o.type===type)&&(!pendingOnly||!o.done));}
  function fit(){
    if(!map||!shown.length)return;
    const bounds=L.latLngBounds(shown.map(o=>[o.lat,o.lon]));
    if(manualKeys.length&&!preview)manualStops().forEach(o=>bounds.extend([o.lat,o.lon]));
    if(preview) bounds.extend([preview.start.lat,preview.start.lon]);
    if(shown.length===1&&!preview&&!manualKeys.length) map.setView(bounds.getCenter(),17);
    else map.fitBounds(bounds,{padding:[24,24],maxZoom:17});
  }
  function render(){
    syncManual();
    const rows=visibleRows(), plotted=rows.filter(o=>o.lat!==null&&o.lon!==null), missing=rows.length-plotted.length;
    const order=new Map();
    if(preview) preview.ordered.forEach((stop,index)=>stop.jobs.forEach(job=>order.set(key(job),index+1)));
    else manualStops().forEach((stop,index)=>order.set(key(stop),index+1));
    shown=plotted;
    count.textContent=plotted.length+' en mapa'+(missing?' · '+missing+' sin GPS':'');
    document.querySelectorAll('#mapFilters button').forEach(b=>b.classList.toggle('active',b.dataset.type===type));
    document.getElementById('pendingOnly').setAttribute('aria-pressed',String(pendingOnly));
    if(map){
      if(layer) layer.remove();
      layer=L.layerGroup().addTo(map);
      // Agrupación por píxeles: incluso coordenadas distintas pueden taparse en celular.
      const groups=window.CNFLMapClusters.group(plotted,o=>map.project([o.lat,o.lon],map.getZoom()),40);
      groups.forEach(group=>{
        if(group.length>1){
          const lat=group.reduce((sum,o)=>sum+o.lat,0)/group.length;
          const lon=group.reduce((sum,o)=>sum+o.lon,0)/group.length;
          L.marker([lat,lon],{icon:L.divIcon({className:'cluster-icon',html:'<span>'+group.length+'</span>',iconSize:[36,36],iconAnchor:[18,18]})})
            .on('click',()=>{clusterKeys=group.map(key);selectedKey=null;renderSelection();}).addTo(layer);
          return;
        }
        const first=group[0],color=colors[first.type];
        const number=order.get(key(first));
        const compact=(preview?preview.ordered.length:manualKeys.length)>40, diameter=compact?24:30;
        const marker=number ? L.marker([first.lat,first.lon],{icon:L.divIcon({className:'route-stop-icon'+(compact?' dense':''),html:'<span>'+number+'</span>',iconSize:[diameter,diameter],iconAnchor:[diameter/2,diameter/2]})}) :
          L.circleMarker([first.lat,first.lon],{radius:9,color:'#fff',weight:2,fillColor:color,fillOpacity:first.done?.55:.95});
        marker.on('click',()=>{clusterKeys=null;selectedKey=key(first);if(routeMode)addManual(first);renderSelection();}).addTo(layer);
      });
      if(routeLayer) routeLayer.remove();
      routeLayer=null;
      if(preview){
        routeLayer=L.layerGroup().addTo(map);
        preview.segments.forEach(segment=>L.polyline(segment,{color:preview.unfiltered?'#B45309':'#0055B8',weight:6,opacity:.85,lineJoin:'round',dashArray:preview.unfiltered?'9 7':null}).addTo(routeLayer));
        L.circleMarker([preview.start.lat,preview.start.lon],{radius:9,color:'#fff',weight:2,fillColor:'#0A9F6C',fillOpacity:1})
          .bindPopup('Salida de la ruta sugerida').addTo(routeLayer);
        routeLayer.eachLayer(item=>{if(item.bringToBack)item.bringToBack();});
      }else if(manualKeys.length){
        routeLayer=L.layerGroup().addTo(map);
        const stops=manualStops();
        if(manualTrace){manualTrace.segments.forEach(segment=>L.polyline(segment,{color:manualTrace.unfiltered?'#B45309':'#087855',weight:5,opacity:.85,dashArray:manualTrace.unfiltered?'9 7':null}).addTo(routeLayer));}
        else if(stops.length>=2)L.polyline(stops.map(o=>[o.lat,o.lon]),{color:'#087855',weight:3,opacity:.8,dashArray:'6 8'}).addTo(routeLayer);
        routeLayer.eachLayer(item=>{if(item.bringToBack)item.bringToBack();});
      }
    }
    list.replaceChildren();
    renderManual();renderSelection();
    if(!rows.length){list.innerHTML='<div class="empty">No hay trabajos en este filtro. Cargá una jornada o elegí otro tipo.</div>';return;}
    const listed=order.size?[...rows].sort((a,b)=>(order.get(key(a))||Infinity)-(order.get(key(b))||Infinity)):rows;
    listed.slice(0,100).forEach(o=>{
      const button=document.createElement('button');
      button.type='button';button.className='map-item'+(o.done?' done':'')+(o.lat===null?' missing':'');
      const main=document.createElement('span');main.className='main';
      const title=document.createElement('strong');title.textContent=(order.has(key(o))?order.get(key(o))+'. ':'')+o.label;
      const sub=document.createElement('small');sub.textContent=names[o.type]+' · Localización '+o.loc;
      main.append(title,sub);
      const state=document.createElement('span');state.className='state';state.textContent=o.lat===null?(o.conflict?'GPS EN CONFLICTO':'SIN GPS'):(o.done?'HECHO':'PENDIENTE');
      button.append(main,state);
      button.onclick=()=>{
        if(map&&o.lat!==null){if(routeMode)addManual(o);focusJob(o);box.scrollIntoView({behavior:'smooth',block:'center'});}
        else location.href=o.href;
      };
      list.append(button);
    });
    if(rows.length>100){const note=document.createElement('div');note.className='empty';note.textContent='Mostrando 100 de '+rows.length+'. Elegí un tipo para reducir la lista.';list.append(note);}
  }
  function clearPreview(){
    generation++;preview=null;reviewChoice='';retryDraft=null;fallbackButton.hidden=true;
    previewResult.hidden=true;previewReview.hidden=true;
    previewStatus.textContent='El filtro o los trabajos cambiaron. Calculá otra ruta para ver el trazado actualizado.';
    render();
  }
  async function traceManual(unfiltered=false){
    if(!map){manualStatus.textContent='El mapa de calles no está disponible. Conectate a Internet.';return;}
    if(preview)clearPreview();
    const stops=manualStops();if(stops.length<2)return;
    const token=++manualToken,button=document.getElementById('traceManual');
    manualTrace=null;manualDraft=false;document.getElementById('manualUnfiltered').hidden=true;
    button.disabled=true;
    try{
      manualStatus.textContent='Trazando tu orden por calles…';
      const result=await window.CNFLRoutePreview.traceOrdered(stops,fetch,message=>{if(token===manualToken)manualStatus.textContent=message;},{unfiltered});
      if(token!==manualToken)return;
      manualTrace=result;render();map.fitBounds(L.latLngBounds(stops.map(o=>[o.lat,o.lon])),{padding:[24,24],maxZoom:17});
    }catch(error){if(token===manualToken){manualStatus.textContent=error.message;manualDraft=error.code==='FILTER_UNAVAILABLE'&&!unfiltered;document.getElementById('manualUnfiltered').hidden=!manualDraft;}}
    finally{if(token===manualToken)button.disabled=false;}
  }
  function fromBrowser(){
    return new Promise((resolve,reject)=>{
      if(!navigator.geolocation){reject(new Error('Este teléfono no ofrece ubicación.'));return;}
      navigator.geolocation.getCurrentPosition(pos=>resolve({lat:pos.coords.latitude,lon:pos.coords.longitude}),
        ()=>reject(new Error('No pude obtener tu ubicación. Revisá el permiso del teléfono.')),
        {enableHighAccuracy:true,timeout:12000,maximumAge:0});
    });
  }
  function fromBase(){
    try{const saved=JSON.parse(localStorage.getItem('cnfl_route_config')||'null');
      if(saved&&Number.isFinite(Number(saved.lat))&&Number.isFinite(Number(saved.lon))&&Math.abs(Number(saved.lat))<=90&&Math.abs(Number(saved.lon))<=180&&!(Number(saved.lat)===0&&Number(saved.lon)===0))
        return {lat:Number(saved.lat),lon:Number(saved.lon),name:String(saved.name||'Base configurada')};
    }catch(_){}
    return {lat:9.91154,lon:-84.07826,name:'La Guaca · San Sebastián'};
  }
  function reviewKey(result){
    return JSON.stringify([type,result.unfiltered,result.start.lat.toFixed(5),result.start.lon.toFixed(5),result.ordered.map(s=>s.jobs.map(j=>j.type+':'+j.loc).sort())]);
  }
  async function calculatePreview(useLocation,previousStart=null,unfiltered=false){
    if(!map){previewStatus.textContent='El mapa de calles no está disponible. Conectate a Internet y actualizá.';return;}
    const token=++generation;
    preview=null;reviewChoice='';retryDraft=null;fallbackButton.hidden=true;previewResult.hidden=true;previewReview.hidden=true;
    render();
    const rows=visibleRows();
    const {stops,missing}=window.CNFLRoutePreview.prepare(rows);
    if(!stops.length){previewStatus.textContent='No hay pendientes con GPS en este filtro. Revisá las localizaciones.';return;}
    const buttons=[document.getElementById('previewFromMe'),document.getElementById('previewFromBase')];
    buttons.forEach(b=>b.disabled=true);
    previewStatus.textContent=unfiltered?'Calculando borrador sin filtro vial…':useLocation?'Obteniendo tu ubicación…':'Calculando desde la base…';
    let start=null;
    try{
      start=previousStart||(useLocation?await fromBrowser():fromBase());
      if(token!==generation)return;
      const result=await window.CNFLRoutePreview.calculate(stops,start,fetch,message=>{if(token===generation)previewStatus.textContent=message;},{unfiltered});
      if(token!==generation)return;
      preview=result;
      const jobs=result.ordered.reduce((sum,s)=>sum+s.jobs.length,0);
      const skipped=missing.length?' · '+missing.length+' sin GPS fuera del trazado':'';
      previewStatus.textContent=unfiltered?'Borrador sin filtro vial. Revisá cada tramo; puede incluir autopistas.':'Vista previa calculada. Revisá las calles antes de usarla.';
      const longLegs=result.legMeters.map((meters,index)=>({meters,index})).filter(leg=>leg.meters>=1500)
        .sort((a,b)=>b.meters-a.meters).slice(0,3);
      previewResult.textContent=(unfiltered?'BORRADOR SIN FILTRO · ':'')+result.ordered.length+' paradas · '+jobs+' trabajos · '+(result.meters/1000).toFixed(1)+' km · '+Math.round(result.seconds/60)+' min de recorrido estimado'+skipped+'. Inicio: '+(start.name||'mi ubicación')+'. Orden comparado entre todas las paradas.'+
        (longLegs.length?' Tramos largos para revisar: '+longLegs.map(leg=>(leg.index===0?'salida':leg.index)+'→'+(leg.index+1)+' ('+(leg.meters/1000).toFixed(1)+' km)').join(', ')+'.':'');
      document.getElementById('routeLimit').textContent=unfiltered?
        'Sin filtro vial: el trazado puede incluir autopistas, vías rápidas y cruces que el técnico considere inseguros. Es solo un borrador para evaluación manual; no es una ruta segura verificada.':
        'Evita autopistas si el motor vial admite ese filtro. No verifica vías trunk, límites de 60 km/h, cruces sin regulación ni condiciones actuales de tránsito. Revisá el trazado antes de circular.';
      previewResult.hidden=false;previewReview.hidden=false;
      document.getElementById('reviewStatus').textContent='';
      document.getElementById('routeNote').value='';
      document.querySelectorAll('#previewReview .preview-actions button').forEach(b=>b.setAttribute('aria-pressed','false'));
      try{
        const saved=JSON.parse(localStorage.getItem('cnfl_route_review_v1')||'null');
        if(saved&&saved.key===reviewKey(result)) document.getElementById('reviewStatus').textContent='Evaluación anterior: '+(saved.choice==='useful'?'me sirve':'necesita ajustes')+(saved.note?' · '+saved.note:'');
      }catch(_){}
      render();fit();
    }catch(error){
      if(token===generation){
        if(error.code==='FILTER_UNAVAILABLE'&&!unfiltered){
          // Conservar solo en memoria el punto de salida de este intento.
          retryDraft=start;
          fallbackButton.hidden=!retryDraft;
          previewStatus.textContent='Este servicio vial no admite evitar autopistas. La ruta segura no se calculó. Podés ver un borrador sin ese filtro para revisarlo manualmente.';
        }else previewStatus.textContent=error.message||'No se pudo calcular la ruta.';
        render();
      }
    }finally{buttons.forEach(b=>b.disabled=false);}
  }
  if(typeof L==='undefined') box.innerHTML='<div class="empty">No cargó el mapa de calles. Conectate a Internet y actualizá. La lista de trabajos sigue disponible.</div>';
  else{
    map=L.map(box,{zoomControl:true,preferCanvas:true}).setView([9.93,-84.08],12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
    map.on('click',()=>{selectedKey=null;clusterKeys=null;selectedPanel.hidden=true;});
    map.on('zoomend',()=>render());
  }
  document.getElementById('mapFilters').onclick=e=>{const b=e.target.closest('button[data-type]');if(b){type=b.dataset.type;clearPreview();fit();}};
  document.getElementById('pendingOnly').onclick=()=>{pendingOnly=!pendingOnly;clearPreview();fit();};
  document.getElementById('fitPoints').onclick=fit;
  routeModeButton.onclick=()=>{routeMode=!routeMode;selectedKey=null;clusterKeys=null;selectedPanel.hidden=true;renderManual();};
  routeOverview.onclick=()=>{selectedKey=null;clusterKeys=null;selectedPanel.hidden=true;manualPanel.open=true;manualPanel.scrollIntoView({behavior:'smooth',block:'start'});};
  document.getElementById('traceManual').onclick=()=>traceManual(false);
  document.getElementById('manualUnfiltered').onclick=()=>{if(manualDraft)traceManual(true);};
  document.getElementById('showManual').onclick=()=>{if(preview)clearPreview();};
  document.getElementById('undoManual').onclick=()=>{if(manualKeys.length)changeManual(manualKeys.slice(0,-1));};
  document.getElementById('clearManual').onclick=()=>{if(manualKeys.length)changeManual([]);};
  document.getElementById('previewFromMe').onclick=()=>calculatePreview(true);
  document.getElementById('previewFromBase').onclick=()=>calculatePreview(false);
  fallbackButton.onclick=()=>{if(retryDraft) calculatePreview(false,retryDraft,true);};
  document.getElementById('routeUseful').onclick=()=>selectReview('useful');
  document.getElementById('routeAdjust').onclick=()=>selectReview('adjust');
  function selectReview(choice){
    reviewChoice=choice;
    document.getElementById('routeUseful').setAttribute('aria-pressed',String(choice==='useful'));
    document.getElementById('routeAdjust').setAttribute('aria-pressed',String(choice==='adjust'));
  }
  document.getElementById('saveRouteReview').onclick=()=>{
    if(!preview)return;
    if(!reviewChoice){document.getElementById('reviewStatus').textContent='Elegí si la ruta te sirve o necesita ajustes.';return;}
    const note=document.getElementById('routeNote').value.trim().slice(0,500);
    try{
      localStorage.setItem('cnfl_route_review_v1',JSON.stringify({key:reviewKey(preview),choice:reviewChoice,note,at:new Date().toISOString()}));
      document.getElementById('reviewStatus').textContent='Evaluación guardada en este teléfono. La observación no cambia automáticamente el trazado.';
    }catch(_){document.getElementById('reviewStatus').textContent='No pude guardar la evaluación en este teléfono.';}
  };
  document.getElementById('centerMe').onclick=()=>{
    if(!map||!navigator.geolocation){alert('El mapa o la ubicación no están disponibles.');return;}
    navigator.geolocation.getCurrentPosition(pos=>{
      const lat=pos.coords.latitude,lon=pos.coords.longitude;
      if(myLayer)myLayer.remove();
      myLayer=L.circleMarker([lat,lon],{radius:8,color:'#fff',weight:2,fillColor:'#0A9F6C',fillOpacity:1}).addTo(map).bindPopup('Mi ubicación');
      map.setView([lat,lon],17);
    },()=>alert('No pude obtener tu ubicación. Revisá el permiso del teléfono.'),{enableHighAccuracy:true,timeout:12000,maximumAge:30000});
  };
  addEventListener('pageshow',()=>{if(preview)clearPreview();else render();});
  addEventListener('storage',()=>{clearPreview();});
  render();fit();
})();
