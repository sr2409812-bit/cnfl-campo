(function(){
  const names={cortes:'CORTES',demanda:'DEMANDA',residencial:'RESIDENCIAL',notificaciones:'NOTIFICACIONES'};
  let type='todos',includeDone=false,position=null;
  const list=document.getElementById('todayList');
  const status=document.getElementById('locationStatus');
  function distance(a,b,lat,lon){
    const rad=Math.PI/180,dy=(lat-a)*rad,dx=(lon-b)*rad;
    const h=Math.sin(dy/2)**2+Math.cos(a*rad)*Math.cos(lat*rad)*Math.sin(dx/2)**2;
    return 12742*Math.asin(Math.min(1,Math.sqrt(h)));
  }
  function action(label,href,css,enabled=true){
    const a=document.createElement('a');a.textContent=label;a.className=css||'';
    if(enabled){a.href=href;if(href.startsWith('https://')){a.target='_blank';a.rel='noopener';}}
    else a.setAttribute('aria-disabled','true');
    return a;
  }
  function render(){
    const rows=window.CNFLFieldMapData.collect();
    document.getElementById('pendingCount').textContent=rows.filter(o=>!o.done).length;
    document.getElementById('doneCount').textContent=rows.filter(o=>o.done).length;
    document.getElementById('gpsCount').textContent=rows.filter(o=>!o.done&&(o.lat===null||o.lon===null)).length;
    document.getElementById('listTitle').textContent=includeDone?'Todos los trabajos':'Pendientes';
    const q=document.getElementById('search').value.trim().toLowerCase();
    const filtered=rows.filter(o=>(includeDone||!o.done)&&(type==='todos'||type===o.type)&&(!q||o.label.toLowerCase().includes(q)||o.loc.includes(q)));
    if(position){
      filtered.sort((a,b)=>{
        const da=a.lat===null?Infinity:distance(position.lat,position.lon,a.lat,a.lon);
        const db=b.lat===null?Infinity:distance(position.lat,position.lon,b.lat,b.lon);
        return da-db;
      });
    }
    list.replaceChildren();
    if(!filtered.length){const empty=document.createElement('div');empty.className='empty';empty.textContent=rows.length?'No hay trabajos con estos filtros.':'No hay trabajos cargados en este teléfono. Entrá a un módulo para cargar la jornada.';list.append(empty);return;}
    const fragment=document.createDocumentFragment();
    for(const row of filtered){
      const hasGps=row.lat!==null&&row.lon!==null;
      const card=document.createElement('article');card.className='task'+(row.done?' done':'')+(!hasGps?' warning':'');
      const top=document.createElement('div');top.className='task-top';
      const kind=document.createElement('span');kind.className='task-type';kind.textContent=names[row.type];
      const state=document.createElement('span');state.className='task-state';state.textContent=row.done?'GESTIONADO':'PENDIENTE';top.append(kind,state);
      const title=document.createElement('h3');title.textContent=row.label;
      const detail=document.createElement('p');detail.textContent='Localización '+row.loc;
      if(!hasGps){const warning=document.createElement('p');warning.className='warning-text';warning.textContent=row.conflict?'GPS en conflicto · revisar en el módulo':'Sin GPS · revisar en el módulo';card.append(top,title,detail,warning);}
      else{
        if(position)detail.textContent+=' · '+distance(position.lat,position.lon,row.lat,row.lon).toFixed(1)+' km aprox.';
        card.append(top,title,detail);
      }
      const buttons=document.createElement('div');buttons.className='actions';
      const coords=hasGps?encodeURIComponent(row.lat+','+row.lon):'';
      buttons.append(
        action('WAZE',hasGps?'https://www.waze.com/ul?ll='+coords+'&navigate=yes':'','',hasGps),
        action('MAPS',hasGps?'https://www.google.com/maps/dir/?api=1&destination='+coords:'','',hasGps),
        action('ABRIR GESTIÓN',row.href,'manage')
      );
      card.append(buttons);fragment.append(card);
    }
    list.append(fragment);
  }
  document.getElementById('search').addEventListener('input',render);
  document.getElementById('typeFilters').addEventListener('click',e=>{
    const button=e.target.closest('button[data-type]');if(!button)return;
    type=button.dataset.type;
    document.querySelectorAll('#typeFilters button').forEach(b=>b.classList.toggle('active',b===button));render();
  });
  document.getElementById('showDone').addEventListener('click',e=>{includeDone=!includeDone;e.currentTarget.setAttribute('aria-pressed',String(includeDone));render();});
  document.getElementById('nearby').addEventListener('click',e=>{
    if(position){position=null;status.textContent='Orden original de cada módulo. La cercanía no cambió las rutas.';e.currentTarget.textContent='PENDIENTES CERCA DE MÍ';render();return;}
    if(!navigator.geolocation){status.textContent='Este navegador no ofrece ubicación.';return;}
    const button=e.currentTarget;button.disabled=true;status.textContent='Obteniendo tu ubicación…';
    navigator.geolocation.getCurrentPosition(pos=>{
      position={lat:pos.coords.latitude,lon:pos.coords.longitude};button.disabled=false;button.textContent='VOLVER AL ORDEN ORIGINAL';
      status.textContent='Ordenado por distancia aproximada. Elegí el próximo trabajo; las rutas originales siguen iguales.';render();
    },()=>{button.disabled=false;status.textContent='No pude obtener tu ubicación. Revisá el permiso del teléfono.';},{enableHighAccuracy:true,timeout:12000,maximumAge:30000});
  });
  addEventListener('pageshow',render);
  addEventListener('storage',render);
  render();
})();
