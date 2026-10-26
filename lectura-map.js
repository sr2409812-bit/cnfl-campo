(function(){
  let map=null,pointsLayer=null,userLayer=null,watchId=null,userPos=null,fitted=false;

  function mapBox(){return document.getElementById('readingLiveMap');}
  function distanceMeters(lat1,lon1,lat2,lon2){
    const R=6371000,toRad=n=>n*Math.PI/180;
    const p1=toRad(lat1),p2=toRad(lat2),dp=toRad(lat2-lat1),dl=toRad(lon2-lon1);
    const a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }
  function validPoint(o){return o&&o.gpsStatus!=='conflict'&&Number.isFinite(Number(o.lat))&&Number.isFinite(Number(o.lon));}

  function updateMapInfo(){
    const el=document.getElementById('readingMapInfo');if(!el)return;
    const rows=Array.isArray(window.readingOrders)?window.readingOrders:readingOrders;
    const pending=rows.filter(o=>o.status!=='read'&&validPoint(o));
    const done=rows.filter(o=>o.status==='read'&&validPoint(o));
    let nearby=0,nearest=null;
    if(userPos){
      for(const o of pending){
        const d=distanceMeters(userPos.lat,userPos.lon,Number(o.lat),Number(o.lon));
        if(d<=300)nearby++;
        if(!nearest||d<nearest.d)nearest={o:o,d:d};
      }
    }
    let nearText=' · esperando ubicación';
    if(userPos){
      nearText=' · '+nearby+' pendientes a 300 m';
      if(nearest)nearText+=' · más cercano '+(nearest.d<1000?Math.round(nearest.d)+' m':(nearest.d/1000).toFixed(1)+' km');
    }
    el.textContent=pending.length+' pendientes con GPS · '+done.length+' leídos'+nearText;
  }

  function popupHtml(o){
    const pending=o.status!=='read';
    let html='<div class="reading-map-popup"><strong>Medidor '+escapeHtml(o.medidor)+'</strong><br><span>Localización '+escapeHtml(o.localizacion)+'</span>';
    if(pending)html+='<button onclick="setNextReading(\''+String(o.localizacion).replace(/'/g,'')+'\')">HACER SIGUIENTE</button>';
    else html+='<small>LECTURA '+escapeHtml(o.lectura||'')+'</small>';
    return html+'</div>';
  }

  function renderPoints(){
    if(!map||typeof L==='undefined')return;
    if(pointsLayer)pointsLayer.remove();
    pointsLayer=L.layerGroup().addTo(map);
    const bounds=[];
    const rows=Array.isArray(window.readingOrders)?window.readingOrders:readingOrders;
    for(const o of rows){
      if(!validPoint(o))continue;
      const lat=Number(o.lat),lon=Number(o.lon),read=o.status==='read';
      const color=read?'#137333':'#FF6A13';
      const marker=L.circleMarker([lat,lon],{radius:read?6:8,color:color,weight:2,fillColor:color,fillOpacity:read?0.55:0.82});
      marker.bindPopup(popupHtml(o),{closeButton:true});
      marker.addTo(pointsLayer);bounds.push([lat,lon]);
    }
    if(userPos)bounds.push([userPos.lat,userPos.lon]);
    if(!fitted&&bounds.length){map.fitBounds(bounds,{padding:[26,26],maxZoom:17});fitted=true;}
    updateMapInfo();
  }

  function updateUser(lat,lon,accuracy){
    userPos={lat:Number(lat),lon:Number(lon),accuracy:Number(accuracy||0)};
    if(!map||typeof L==='undefined')return;
    if(userLayer)userLayer.remove();
    userLayer=L.layerGroup().addTo(map);
    L.circleMarker([userPos.lat,userPos.lon],{radius:9,color:'#0033A0',weight:3,fillColor:'#ffffff',fillOpacity:1}).bindTooltip('Mi ubicación').addTo(userLayer);
    if(userPos.accuracy>0)L.circle([userPos.lat,userPos.lon],{radius:userPos.accuracy,color:'#0033A0',weight:1,fillOpacity:0.04}).addTo(userLayer);
    updateMapInfo();
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
    if(!map)return;
    if(userPos){map.setView([userPos.lat,userPos.lon],17);return;}
    if(!navigator.geolocation){alert('Este dispositivo no ofrece ubicación.');return;}
    navigator.geolocation.getCurrentPosition(
      pos=>{updateUser(pos.coords.latitude,pos.coords.longitude,pos.coords.accuracy);map.setView([pos.coords.latitude,pos.coords.longitude],17);},
      err=>alert('No pude obtener tu ubicación: '+(err.message||'permiso denegado')),
      {enableHighAccuracy:true,timeout:12000,maximumAge:5000}
    );
  };

  window.refreshReadingMap=function(){
    if(typeof hydrateReadingGps==='function')hydrateReadingGps();
    renderPoints();
    if(typeof showReadingToast==='function')showReadingToast('Mapa actualizado.');
  };

  function init(){
    const box=mapBox();if(!box)return;
    if(typeof L==='undefined'){box.innerHTML='<div class="map-error">No pude cargar el mapa. Revisá la conexión.</div>';return;}
    if(map){setTimeout(()=>map.invalidateSize(),50);renderPoints();return;}
    map=L.map(box,{zoomControl:true,attributionControl:true});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
    map.setView([9.93,-84.08],14);
    renderPoints();startWatch();setTimeout(()=>map.invalidateSize(),100);
  }

  if(typeof window.switchReadingTab==='function'){
    const baseSwitch=window.switchReadingTab;
    window.switchReadingTab=function(tab,btn){baseSwitch(tab,btn);if(tab==='map')setTimeout(init,20);};
  }
  if(typeof window.renderAll==='function'){
    const baseRender=window.renderAll;
    window.renderAll=function(){baseRender();if(map)renderPoints();};
  }
  window.initReadingLiveMap=init;
  window.addEventListener('pagehide',()=>{if(watchId!==null&&navigator.geolocation)navigator.geolocation.clearWatch(watchId);watchId=null;});
})();