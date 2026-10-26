(function(){
  let map=null,pointsLayer=null,userLayer=null,watchId=null,userPos=null;
  let lastPointsSignature='';
  let resizeObserver=null;

  function mapBox(){return document.getElementById('readingLiveMap');}
  function rowsNow(){
    try{return Array.isArray(readingOrders)?readingOrders:[];}catch(_){return [];}
  }
  function distanceMeters(lat1,lon1,lat2,lon2){
    const R=6371000,toRad=n=>n*Math.PI/180;
    const p1=toRad(lat1),p2=toRad(lat2),dp=toRad(lat2-lat1),dl=toRad(lon2-lon1);
    const a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }
  function validPoint(o){
    return !!(o&&o.gpsStatus!=='conflict'&&Number.isFinite(Number(o.lat))&&Number.isFinite(Number(o.lon)));
  }
  function pointSignature(rows){
    return rows.filter(validPoint)
      .map(o=>[o.localizacion,Number(o.lat).toFixed(6),Number(o.lon).toFixed(6),o.status].join(':'))
      .sort().join('|');
  }

  function updateMapInfo(){
    const el=document.getElementById('readingMapInfo');if(!el)return;
    const rows=rowsNow();
    const pending=rows.filter(o=>o.status!=='read'&&validPoint(o));
    const done=rows.filter(o=>o.status==='read'&&validPoint(o));
    const missing=rows.filter(o=>!validPoint(o)).length;

    let nearby=0,nearest=null;
    if(userPos){
      for(const o of pending){
        const d=distanceMeters(userPos.lat,userPos.lon,Number(o.lat),Number(o.lon));
        if(d<=300)nearby++;
        if(!nearest||d<nearest.d)nearest={o,d};
      }
    }

    let text=pending.length+' pendientes con GPS · '+done.length+' leídos';
    if(missing) text+=' · '+missing+' sin GPS';
    if(userPos){
      text+=' · '+nearby+' pendientes a 300 m';
      if(nearest) text+=' · más cercano '+(nearest.d<1000?Math.round(nearest.d)+' m':(nearest.d/1000).toFixed(1)+' km');
    }else{
      text+=' · esperando tu ubicación';
    }
    el.textContent=text;
  }

  function popupHtml(o){
    const pending=o.status!=='read';
    let html='<div class="reading-map-popup"><strong>Medidor '+escapeHtml(o.medidor)+'</strong><br><span>Localización '+escapeHtml(o.localizacion)+'</span>';
    if(pending) html+='<button onclick="setNextReading(\''+String(o.localizacion).replace(/'/g,'')+'\')">HACER SIGUIENTE</button>';
    else html+='<small>LECTURA '+escapeHtml(o.lectura||'')+'</small>';
    return html+'</div>';
  }

  function currentBounds(){
    const bounds=[];
    for(const o of rowsNow()){
      if(validPoint(o)) bounds.push([Number(o.lat),Number(o.lon)]);
    }
    if(userPos) bounds.push([userPos.lat,userPos.lon]);
    return bounds;
  }

  function fitCurrentPoints(force=false){
    if(!map) return;
    const rows=rowsNow();
    const signature=pointSignature(rows);
    if(!force && signature===lastPointsSignature) return;
    lastPointsSignature=signature;

    const bounds=currentBounds();
    if(bounds.length>=2){
      map.fitBounds(bounds,{padding:[28,28],maxZoom:17});
    }else if(bounds.length===1){
      map.setView(bounds[0],17);
    }else if(userPos){
      map.setView([userPos.lat,userPos.lon],17);
    }
  }

  function renderPoints(forceFit=false){
    if(!map||typeof L==='undefined')return;
    if(pointsLayer)pointsLayer.remove();
    pointsLayer=L.layerGroup().addTo(map);

    const rows=rowsNow();
    for(const o of rows){
      if(!validPoint(o))continue;
      const lat=Number(o.lat),lon=Number(o.lon),read=o.status==='read';
      const color=read?'#137333':'#FF6A13';
      L.circleMarker([lat,lon],{
        radius:read?6:8,color,weight:2,fillColor:color,fillOpacity:read?0.55:0.82
      }).bindPopup(popupHtml(o),{closeButton:true}).addTo(pointsLayer);
    }

    updateMapInfo();
    fitCurrentPoints(forceFit);
  }

  function updateUser(lat,lon,accuracy){
    userPos={lat:Number(lat),lon:Number(lon),accuracy:Number(accuracy||0)};
    if(!map||typeof L==='undefined')return;
    if(userLayer)userLayer.remove();
    userLayer=L.layerGroup().addTo(map);
    L.circleMarker([userPos.lat,userPos.lon],{
      radius:9,color:'#0033A0',weight:3,fillColor:'#ffffff',fillOpacity:1
    }).bindTooltip('Mi ubicación').addTo(userLayer);
    if(userPos.accuracy>0){
      L.circle([userPos.lat,userPos.lon],{
        radius:userPos.accuracy,color:'#0033A0',weight:1,fillOpacity:0.04
      }).addTo(userLayer);
    }
    updateMapInfo();
    if(!currentBounds().some(Boolean)) map.setView([userPos.lat,userPos.lon],17);
  }

  function startWatch(){
    if(watchId!==null||!navigator.geolocation)return;
    watchId=navigator.geolocation.watchPosition(
      pos=>updateUser(pos.coords.latitude,pos.coords.longitude,pos.coords.accuracy),
      ()=>updateMapInfo(),
      {enableHighAccuracy:true,maximumAge:5000,timeout:15000}
    );
  }

  window.centerReadingMapOnMe=function(){
    if(!map){init();setTimeout(window.centerReadingMapOnMe,120);return;}
    if(userPos){map.setView([userPos.lat,userPos.lon],17);return;}
    if(!navigator.geolocation){alert('Este dispositivo no ofrece ubicación.');return;}
    navigator.geolocation.getCurrentPosition(
      pos=>{
        updateUser(pos.coords.latitude,pos.coords.longitude,pos.coords.accuracy);
        map.setView([pos.coords.latitude,pos.coords.longitude],17);
      },
      err=>alert('No pude obtener tu ubicación: '+(err.message||'permiso denegado')),
      {enableHighAccuracy:true,timeout:12000,maximumAge:5000}
    );
  };

  window.refreshReadingMap=function(){
    if(typeof hydrateReadingGps==='function')hydrateReadingGps();
    lastPointsSignature='';
    renderPoints(true);
    if(map){
      setTimeout(()=>map.invalidateSize({pan:false}),40);
      setTimeout(()=>map.invalidateSize({pan:false}),180);
    }
    if(typeof showReadingToast==='function')showReadingToast('Mapa actualizado.');
  };

  function showNoGpsState(){
    const box=mapBox();if(!box)return;
    const rows=rowsNow();
    if(rows.length && !rows.some(validPoint)){
      const info=document.getElementById('readingMapInfo');
      if(info) info.textContent=rows.length+' medidores cargados · 0 con GPS. Cargá las coordenadas para verlos en el mapa.';
    }
  }

  function init(){
    const box=mapBox();if(!box)return;
    if(typeof L==='undefined'){
      box.innerHTML='<div class="map-error">No pude cargar el mapa. Revisá la conexión y volvé a abrir esta pestaña.</div>';
      return;
    }

    if(map){
      setTimeout(()=>map.invalidateSize({pan:false}),30);
      setTimeout(()=>{map.invalidateSize({pan:false});renderPoints(true);},160);
      return;
    }

    map=L.map(box,{zoomControl:true,attributionControl:true,preferCanvas:true});
    const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:19,
      attribution:'© OpenStreetMap',
      crossOrigin:true
    });
    tiles.on('tileerror',()=> {
      const info=document.getElementById('readingMapInfo');
      if(info && !navigator.onLine) info.textContent='Sin conexión: el mapa de calles no puede cargar, pero las lecturas siguen guardándose.';
    });
    tiles.addTo(map);

    // No usamos un centro arbitrario si todavía no hay GPS.
    const bounds=currentBounds();
    if(bounds.length>=2) map.fitBounds(bounds,{padding:[28,28],maxZoom:17});
    else if(bounds.length===1) map.setView(bounds[0],17);
    else if(userPos) map.setView([userPos.lat,userPos.lon],17);
    else map.setView([9.93,-84.08],12);

    renderPoints(true);
    showNoGpsState();
    startWatch();

    if(typeof ResizeObserver!=='undefined'){
      resizeObserver=new ResizeObserver(()=> {
        if(map) map.invalidateSize({pan:false});
      });
      resizeObserver.observe(box);
    }

    setTimeout(()=>map.invalidateSize({pan:false}),50);
    setTimeout(()=>{map.invalidateSize({pan:false});renderPoints(true);},220);
  }

  if(typeof window.switchReadingTab==='function'){
    const baseSwitch=window.switchReadingTab;
    window.switchReadingTab=function(tab,btn){
      baseSwitch(tab,btn);
      if(tab==='map') setTimeout(init,30);
    };
  }

  if(typeof window.renderAll==='function'){
    const baseRender=window.renderAll;
    window.renderAll=function(){
      baseRender();
      if(map){
        lastPointsSignature='';
        renderPoints(true);
      }
    };
  }

  window.initReadingLiveMap=init;
  window.addEventListener('pagehide',()=>{
    if(watchId!==null&&navigator.geolocation)navigator.geolocation.clearWatch(watchId);
    watchId=null;
    if(resizeObserver){resizeObserver.disconnect();resizeObserver=null;}
  });
})();