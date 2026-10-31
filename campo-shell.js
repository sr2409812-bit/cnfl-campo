(function(){
  const path=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  const moduleName=path==='index.html'?'cortes':path==='lectura.html'?'demanda':path==='lectura-residencial.html'?'residencial':path==='notificaciones.html'?'notificaciones':path==='mapa.html'?'mapa':path==='hoy.html'?'hoy':path==='backup.html'?'respaldo':'';

  document.body.classList.add('cnfl-unified');
  if(moduleName) document.body.classList.add('cnfl-module-'+moduleName);

  let menu=document.getElementById('cnflGlobalMenu');
  let drawer=document.getElementById('cnflGlobalDrawer');
  let scrim=document.getElementById('cnflGlobalScrim');

  if(!menu){
    menu=document.createElement('button');
    menu.id='cnflGlobalMenu';
    menu.className='cnfl-global-menu';
    menu.setAttribute('aria-label','Abrir menú de CNFL Campo');
    menu.innerHTML='<i class="fa-solid fa-bars"></i>';
    document.body.appendChild(menu);
  }

  const moduleHeader=document.querySelector('.topbar, .app-header');
  if(moduleHeader && menu && !moduleHeader.contains(menu)){
    moduleHeader.insertBefore(menu,moduleHeader.firstChild);
  }
  menu.classList.add('cnfl-menu-in-header');

  if(!drawer){
    drawer=document.createElement('aside');
    drawer.id='cnflGlobalDrawer';
    drawer.className='cnfl-global-drawer';
    drawer.innerHTML=
      '<div class="drawer-brand">'+
        '<div class="drawer-logo"><i class="fa-solid fa-bolt"></i></div>'+
        '<div><div class="drawer-title">CNFL CAMPO</div><div class="drawer-sub">TRABAJO EN CAMPO</div></div>'+
      '</div>'+
      '<a href="campo.html" data-module="jornada"><i class="fa-solid fa-calendar-day"></i><span>Mi jornada</span></a>'+
      '<div class="drawer-label">TIPO DE TRABAJO</div>'+
      '<a href="index.html" data-module="cortes"><i class="fa-solid fa-bolt"></i><span>Cortes</span></a>'+
      '<a href="lectura.html" data-module="demanda"><i class="fa-solid fa-gauge-high"></i><span>Lectura de demanda</span></a>'+
      '<a href="lectura-residencial.html" data-module="residencial"><i class="fa-solid fa-house-signal"></i><span>Lectura residencial</span></a>'+
      '<a href="notificaciones.html" data-module="notificaciones"><i class="fa-solid fa-file-signature"></i><span>Notificaciones</span></a>'+
      '<a href="mapa.html" data-module="mapa"><i class="fa-solid fa-map-location-dot"></i><span>Mapa general</span></a>'+
      '<div class="drawer-spacer"></div>'+
      '<a href="backup.html" data-module="respaldo"><i class="fa-solid fa-shield-halved"></i><span>Respaldo</span></a>';
    document.body.appendChild(drawer);
  }

  if(!scrim){
    scrim=document.createElement('div');
    scrim.id='cnflGlobalScrim';
    scrim.className='cnfl-global-scrim';
    document.body.appendChild(scrim);
  }

  function openMenu(){
    drawer.classList.add('open');
    scrim.classList.add('show');
    menu.setAttribute('aria-expanded','true');
  }
  function closeMenu(){
    drawer.classList.remove('open');
    scrim.classList.remove('show');
    menu.setAttribute('aria-expanded','false');
  }

  window.cnflOpenMenu=openMenu;
  window.cnflCloseMenu=closeMenu;
  menu.onclick=openMenu;
  scrim.onclick=closeMenu;
  drawer.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));

  drawer.querySelectorAll('[data-module]').forEach(a=>a.classList.remove('active'));
  const active=drawer.querySelector('[data-module="'+moduleName+'"]');
  if(active) active.classList.add('active');

  if(moduleName==='demanda'){
    const sub=document.querySelector('.brand-sub');
    if(sub) sub.textContent='LECTURA DE DEMANDA';
    document.title='CNFL Campo · Demanda';
  }

  const journey=window.CNFLJourney;
  const currentJourney=journey?.read(localStorage).active;
  const currentScope=moduleName==='mapa'?new URLSearchParams(location.search).get('volver'):moduleName;
  function checkNewDay(){
    if(currentJourney&&!currentJourney.finishedAt&&currentJourney.module===currentScope&&
      currentJourney.date!==journey.stamp()&&!new URLSearchParams(location.search).has('continuar_anterior')&&
      document.visibilityState==='visible')location.replace('campo.html');
  }
  checkNewDay();
  addEventListener('pageshow',checkNewDay);document.addEventListener('visibilitychange',checkNewDay);
  if(journey && Object.hasOwn(journey.MODULES,moduleName)){
    const active=journey.read(localStorage).active;
    if(active&&active.module===moduleName&&!active.finishedAt){
      document.body.classList.add('cnfl-guided');
      const bar=document.createElement('section');bar.className='cnfl-journey-bar';bar.setAttribute('aria-label','Guía de jornada');
      const first=document.querySelector('main');if(first)first.parentNode.insertBefore(bar,first);
      function workRows(){
        try{
          if(moduleName==='cortes')return JSON.parse(localStorage.getItem('cnfl_work_orders')||'[]').map(o=>({done:!!o.status&&o.status!=='pending'}));
          if(moduleName==='notificaciones'){
            const s=JSON.parse(localStorage.getItem('cnfl_notificaciones_20261019_v2')||'{}');return (window.CNFL_NOTIFICATION_STOPS||[]).map(o=>({done:!!s.done?.[o[0]]}));
          }
          const key=moduleName==='demanda'?'cnfl_reading_orders_v2':'cnfl_residential_reading_v1';
          return (JSON.parse(localStorage.getItem(key)||'{}').orders||[]).map(o=>({done:o.status==='read'||o.status==='unread'}));
        }catch(_){return []}
      }
      function section(id){
        if(moduleName==='cortes')window.switchTab?.(id,id==='cargar'?document.querySelectorAll('.nav-tab-btn')[1]:id==='resumen'?document.querySelectorAll('.nav-tab-btn')[2]:document.querySelectorAll('.nav-tab-btn')[0]);
        else if(moduleName==='demanda'||moduleName==='residencial')window.switchReadingTab?.(id,document.getElementById('tab'+id[0].toUpperCase()+id.slice(1)));
      }
      function refresh(){
        const state=journey.read(localStorage).active;if(!state||state.id!==active.id||state.finishedAt)return;
        const rows=workRows(),done=rows.filter(o=>o.done).length,remaining=rows.length-done;
        document.body.classList.toggle('cnfl-report-step',state.step==='report');
        document.body.classList.toggle('cnfl-load-empty',state.step==='load'&&!rows.length);
        const titles={load:'Cargar órdenes',map:'Armar ruta',work:'Visitar órdenes',report:'Entregar reporte'};
        const number={load:1,map:2,work:3,report:4}[state.step]||1;
        bar.replaceChildren();
        const heading=document.createElement('strong');heading.textContent=number+' / 4 · '+titles[state.step];
        const info=document.createElement('p');
        info.textContent=state.step==='load'?'Seleccioná y confirmá el PDF de '+journey.MODULES[moduleName]+'.':
          state.step==='map'?'Tocá los puntos en el orden que querés visitar.':
          state.step==='work'?done+' gestionadas · '+remaining+' pendientes. Tocá la orden que vas a visitar.':
          done+' gestionadas · '+remaining+' pendientes. Compartí el control y cerrá la jornada.';
        const actions=document.createElement('div');actions.className='actions';
        function action(label,callback,secondary=false){const button=document.createElement('button');button.type='button';button.textContent=label;if(secondary)button.className='secondary';button.onclick=callback;actions.append(button);return button;}
        if(state.step==='load'&&rows.length&&moduleName!=='notificaciones'){
          action('Usar '+rows.length+' órdenes guardadas',()=>{journey.step(localStorage,'map');window.cnflOpenSharedMap?.(moduleName);},true);
        }
        if(state.step==='map')action('CONTINUAR AL MAPA',()=>window.cnflOpenSharedMap?.(moduleName));
        if(state.step==='work'){
          if(moduleName==='demanda'||moduleName==='residencial'){
            const listing=!!document.getElementById('view-list')?.classList.contains('active');
            action(listing?'VER ORDEN ACTUAL':'VER TODAS',()=>{section(listing?'route':'list');refresh();},true);
          }
          action('REVISAR CIERRE',()=>window.cnflJourneyReview?.());
        }
        let summary=null,confirmation=null;
        if(state.step==='report'){
          if(moduleName==='notificaciones'){summary=document.createElement('p');summary.className='cnfl-journey-summary';summary.textContent=reportText().replaceAll('\n',' · ');}
          if(moduleName==='notificaciones'){
            action('COMPARTIR REPORTE',async()=>{try{
              if(navigator.share)await navigator.share({title:'Control de notificaciones',text:reportText()});
              else{await navigator.clipboard.writeText(reportText());alert('Reporte copiado. Pegalo donde vayas a entregarlo.');}
            }catch(error){if(error?.name!=='AbortError')alert('No se pudo compartir el reporte.');}},true);
          }
          confirmation=document.createElement('label');confirmation.className='cnfl-report-confirm';
          const checked=document.createElement('input');checked.type='checkbox';checked.checked=!!state.reportConfirmed;
          checked.onchange=()=>{journey.confirmReport(localStorage,checked.checked);refresh();};
          confirmation.append(checked,document.createTextNode('Ya compartí o guardé el reporte'));
          const finish=action('FINALIZAR JORNADA',()=>{
            if(!confirm(remaining?'Quedan '+remaining+' pendientes. ¿Cerrar esta jornada y guardar el reporte?':'¿Ya revisaste el reporte? Se guardará el cierre de esta jornada.'))return;
            const report=moduleName==='cortes'&&typeof window.generateLiquidationText==='function'?window.generateLiquidationText():reportText();
            journey.finish(localStorage,{total:rows.length,done,pending:remaining,report});location.assign('campo.html');
          });
          finish.disabled=!state.reportConfirmed;
        }
        const lead=document.createElement('div');lead.append(heading,info);bar.append(lead);if(summary)bar.append(summary);if(confirmation)bar.append(confirmation);if(actions.children.length)bar.append(actions);
      }
      window.cnflJourneyRefresh=refresh;
      window.cnflJourneyReview=()=>{const current=journey.read(localStorage).active;if(current?.id!==active.id||current.step!=='work')return;journey.step(localStorage,'report');section(moduleName==='cortes'?'resumen':'summary');refresh();};
      function reportText(){const rows=workRows(),done=rows.filter(o=>o.done).length;return 'CNFL Campo · '+journey.MODULES[moduleName]+'\nJornada: '+active.date+'\nTotal: '+rows.length+'\nGestionadas: '+done+'\nPendientes: '+(rows.length-done);}
      window.cnflJourneyLoaded=()=>{const current=journey.read(localStorage).active;if(current?.id!==active.id||current.step!=='load')return;journey.step(localStorage,'map');window.cnflOpenSharedMap?.(moduleName);};
      refresh();
      if(active.step==='load'&&location.search.includes('jornada=1')&&moduleName!=='notificaciones')section(moduleName==='cortes'?'cargar':'load');
      if(active.step==='work'&&location.search.includes('jornada=1')&&moduleName!=='notificaciones')section(moduleName==='cortes'?'ruta':'route');
      if(active.step==='report'&&location.search.includes('jornada=1')&&moduleName!=='notificaciones')section(moduleName==='cortes'?'resumen':'summary');
      addEventListener('pageshow',refresh);addEventListener('focus',refresh);addEventListener('cnfl-progress',refresh);
    }
  }

  const fieldModules={cortes:'CORTES',demanda:'DEMANDA',residencial:'RESIDENCIAL',notificaciones:'NOTIFICACIONES'};
  if(Object.hasOwn(fieldModules,moduleName)){
    try{localStorage.setItem('cnfl_last_module',moduleName);}catch(_){}
    window.cnflOpenSharedMap=function(kind=moduleName){
      const selected=Object.hasOwn(fieldModules,kind)?kind:moduleName;
      const olderFlag=new URLSearchParams(location.search).has('continuar_anterior')?'&continuar_anterior=1':'';
      location.assign('mapa.html?tipo='+encodeURIComponent(selected)+'&volver='+encodeURIComponent(moduleName)+'&v=20261030-simple1'+olderFlag);
    };
  }
})();
