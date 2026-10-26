(function(){
  const names={cortes:'Cortes',demanda:'Demanda',residencial:'Residencial',notificaciones:'Notificaciones'};
  const colors={cortes:'#F26C21',demanda:'#2257B8',residencial:'#8754C9',notificaciones:'#C43867'};
  const params=new URLSearchParams(location.search);
  let type=Object.hasOwn(names,params.get('tipo')) ? params.get('tipo') : 'todos';
  let pendingOnly=false, map=null, layer=null, myLayer=null, shown=[];
  const box=document.getElementById('fieldMap');
  const list=document.getElementById('mapList');
  const count=document.getElementById('mapCount');
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
    const bounds=L.latLngBounds(shown.map(o=>[o.lat,o.lon]));
    if(shown.length===1) map.setView(bounds.getCenter(),17);
    else map.fitBounds(bounds,{padding:[24,24],maxZoom:17});
  }
  function render(){
    const rows=visibleRows(), plotted=rows.filter(o=>o.lat!==null&&o.lon!==null), missing=rows.length-plotted.length;
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
        L.circleMarker([first.lat,first.lon],{radius:group.length>1?11:9,color:'#fff',weight:2,fillColor:color,fillOpacity:group.every(x=>x.done)?.55:.95})
          .bindPopup(group.map(popup).join('<hr>'),{maxWidth:270}).addTo(layer);
      });
      fit();
    }
    list.replaceChildren();
    if(!rows.length){list.innerHTML='<div class="empty">No hay trabajos en este filtro. Cargá una jornada o elegí otro tipo.</div>';return;}
    rows.slice(0,100).forEach(o=>{
      const button=document.createElement('button');
      button.type='button';button.className='map-item'+(o.done?' done':'')+(o.lat===null?' missing':'');
      const main=document.createElement('span');main.className='main';
      const title=document.createElement('strong');title.textContent=o.label;
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
  if(typeof L==='undefined') box.innerHTML='<div class="empty">No cargó el mapa de calles. Conectate a Internet y actualizá. La lista de trabajos sigue disponible.</div>';
  else{
    map=L.map(box,{zoomControl:true,preferCanvas:true}).setView([9.93,-84.08],12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
  }
  document.getElementById('mapFilters').onclick=e=>{const b=e.target.closest('button[data-type]');if(b){type=b.dataset.type;render();}};
  document.getElementById('pendingOnly').onclick=()=>{pendingOnly=!pendingOnly;render();};
  document.getElementById('fitPoints').onclick=fit;
  document.getElementById('centerMe').onclick=()=>{
    if(!map||!navigator.geolocation){alert('El mapa o la ubicación no están disponibles.');return;}
    navigator.geolocation.getCurrentPosition(pos=>{
      const lat=pos.coords.latitude,lon=pos.coords.longitude;
      if(myLayer)myLayer.remove();
      myLayer=L.circleMarker([lat,lon],{radius:8,color:'#fff',weight:2,fillColor:'#0A9F6C',fillOpacity:1}).addTo(map).bindPopup('Mi ubicación');
      map.setView([lat,lon],17);
    },()=>alert('No pude obtener tu ubicación. Revisá el permiso del teléfono.'),{enableHighAccuracy:true,timeout:12000,maximumAge:30000});
  };
  addEventListener('pageshow',render);
  addEventListener('storage',render);
  render();
})();
