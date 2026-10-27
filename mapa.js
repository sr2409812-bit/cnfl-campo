(function(){
  const names={cortes:'Cortes',demanda:'Demanda',residencial:'Residencial',notificaciones:'Notificaciones'};
  const colors={cortes:'#F26C21',demanda:'#2257B8',residencial:'#8754C9',notificaciones:'#C43867'};
  const params=new URLSearchParams(location.search);
  let type=Object.hasOwn(names,params.get('tipo')) ? params.get('tipo') : 'todos';
  let pendingOnly=false, map=null, layer=null, myLayer=null, routeLayer=null, shown=[];
  let preview=null, generation=0, reviewChoice='', retryDraft=null;
  const box=document.getElementById('fieldMap');
  const list=document.getElementById('mapList');
  const count=document.getElementById('mapCount');
  const previewStatus=document.getElementById('previewStatus');
  const previewResult=document.getElementById('previewResult');
  const previewReview=document.getElementById('previewReview');
  const fallbackButton=document.getElementById('previewUnfiltered');
  function safe(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function visibleRows(){return window.CNFLFieldMapData.collect().filter(o=>(type==='todos'||o.type===type)&&(!pendingOnly||!o.done));}
  function popup(o){
    const coords=encodeURIComponent(o.lat+','+o.lon);
    return '<div class="point-popup"><strong>'+safe(o.label)+'</strong><small>'+safe(names[o.type])+' · '+safe(o.loc)+' · '+(o.done?'GESTIONADO':'PENDIENTE')+'</small><div class="actions">'+
      '<a target="_blank" rel="noopener" href="https://www.waze.com/ul?ll='+coords+'&navigate=yes">WAZE</a>'+ 
      '<a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query='+coords+'">MAPS</a>'+ 
      '<a href="'+safe(o.href)+'">ABRIR TRABAJO</a></div></div>';
  }
  function fit(){
    if(!map||!shown.length)return;
    const bounds=L.latLngBounds(preview?preview.ordered.map(o=>[o.lat,o.lon]):shown.map(o=>[o.lat,o.lon]));
    if(preview) bounds.extend([preview.start.lat,preview.start.lon]);
    if(shown.length===1&&!preview) map.setView(bounds.getCenter(),17);
    else map.fitBounds(bounds,{padding:[24,24],maxZoom:17});
  }
  function render(){
    const rows=visibleRows(), plotted=rows.filter(o=>o.lat!==null&&o.lon!==null), missing=rows.length-plotted.length;
    const order=new Map();
    if(preview) preview.ordered.forEach((stop,index)=>stop.jobs.forEach(job=>order.set(job.type+':'+job.loc,index+1)));
    shown=plotted;
    count.textContent=plotted.length+' en mapa'+(missing?' · '+missing+' sin GPS':'');
    document.querySelectorAll('#mapFilters button').forEach(b=>b.classList.toggle('active',b.dataset.type===type));
    document.getElementById('pendingOnly').setAttribute('aria-pressed',String(pendingOnly));
    if(map){
      if(layer) layer.remove();
      layer=L.layerGroup().addTo(map);
      // Puntos compartidos por varios trabajos se abren juntos.
      const grouped=new Map();
      plotted.forEach(o=>{
        const key=o.lat.toFixed(6)+','+o.lon.toFixed(6);
        if(!grouped.has(key)) grouped.set(key,[]);
        grouped.get(key).push(o);
      });
      grouped.forEach(group=>{
        const first=group[0], color=group.length>1?'#00264D':colors[first.type];
        const number=group.map(o=>order.get(o.type+':'+o.loc)).find(Boolean);
        const compact=preview&&preview.ordered.length>40, diameter=compact?24:30;
        const marker=number ? L.marker([first.lat,first.lon],{icon:L.divIcon({className:'route-stop-icon'+(compact?' dense':''),html:'<span>'+number+'</span>',iconSize:[diameter,diameter],iconAnchor:[diameter/2,diameter/2]})}) :
          L.circleMarker([first.lat,first.lon],{radius:group.length>1?11:9,color:'#fff',weight:2,fillColor:color,fillOpacity:group.every(x=>x.done)?.55:.95});
        marker.bindPopup(group.map(popup).join('<hr>'),{maxWidth:270}).addTo(layer);
      });
      if(routeLayer) routeLayer.remove();
      routeLayer=null;
      if(preview){
        routeLayer=L.layerGroup().addTo(map);
        preview.segments.forEach(segment=>L.polyline(segment,{color:preview.unfiltered?'#B45309':'#0055B8',weight:6,opacity:.85,lineJoin:'round',dashArray:preview.unfiltered?'9 7':null}).addTo(routeLayer));
        L.circleMarker([preview.start.lat,preview.start.lon],{radius:9,color:'#fff',weight:2,fillColor:'#0A9F6C',fillOpacity:1})
          .bindPopup('Salida de la ruta sugerida').addTo(routeLayer);
        routeLayer.eachLayer(item=>{if(item.bringToBack)item.bringToBack();});
      }
      fit();
    }
    list.replaceChildren();
    if(!rows.length){list.innerHTML='<div class="empty">No hay trabajos en este filtro. Cargá una jornada o elegí otro tipo.</div>';return;}
    const listed=preview?[...rows].sort((a,b)=>(order.get(a.type+':'+a.loc)||Infinity)-(order.get(b.type+':'+b.loc)||Infinity)):rows;
    listed.slice(0,100).forEach(o=>{
      const button=document.createElement('button');
      button.type='button';button.className='map-item'+(o.done?' done':'')+(o.lat===null?' missing':'');
      const main=document.createElement('span');main.className='main';
      const title=document.createElement('strong');title.textContent=(order.has(o.type+':'+o.loc)?order.get(o.type+':'+o.loc)+'. ':'')+o.label;
      const sub=document.createElement('small');sub.textContent=names[o.type]+' · Localización '+o.loc;
      main.append(title,sub);
      const state=document.createElement('span');state.className='state';state.textContent=o.lat===null?(o.conflict?'GPS EN CONFLICTO':'SIN GPS'):(o.done?'HECHO':'PENDIENTE');
      button.append(main,state);
      button.onclick=()=>{
        if(map&&o.lat!==null){map.setView([o.lat,o.lon],17);layer.eachLayer(marker=>{
          if(marker.getLatLng().distanceTo([o.lat,o.lon])<1) marker.openPopup();
        });box.scrollIntoView({behavior:'smooth',block:'center'});}
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
      render();
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
  }
  document.getElementById('mapFilters').onclick=e=>{const b=e.target.closest('button[data-type]');if(b){type=b.dataset.type;clearPreview();}};
  document.getElementById('pendingOnly').onclick=()=>{pendingOnly=!pendingOnly;clearPreview();};
  document.getElementById('fitPoints').onclick=fit;
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
  render();
})();
