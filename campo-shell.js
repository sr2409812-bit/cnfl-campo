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
      '<a href="campo.html?inicio=1" data-module="jornada"><i class="fa-solid fa-calendar-day"></i><span>Mi jornada</span></a>'+
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

  // Modo jornada: con una jornada abierta solo se trabaja en su módulo.
  // Entrar a otro módulo redirige al de la jornada (la de otro día, a Mi jornada
  // para cerrarla). El Mapa general y los botones de cambio de trabajo se ocultan.
  const openJourney=currentJourney&&!currentJourney.finishedAt&&Object.hasOwn(journey.MODULES,currentJourney.module)?currentJourney:null;
  if(openJourney){
    document.body.classList.add('cnfl-in-journey');
    const olderDay=openJourney.date!==journey.stamp();
    const foreignModule=Object.hasOwn(journey.MODULES,moduleName)&&moduleName!==openJourney.module;
    const foreignMap=moduleName==='mapa'&&currentScope!==openJourney.module;
    if(foreignModule||foreignMap){
      location.replace(olderDay?'campo.html?inicio=1':journey.pages[openJourney.module]+'?jornada=1');
      return;
    }
  }
  if(journey && Object.hasOwn(journey.MODULES,moduleName)){
    const active=journey.read(localStorage).active;
    if(active&&active.module===moduleName&&!active.finishedAt){
      // Las pantallas nativas son la navegación principal: no generar la
      // barra 1/4–4/4, que ocultaba pestañas y botones de trabajo.
      document.body.classList.add('cnfl-guided');
      function workRows(){
        try{
          if(moduleName==='cortes')return JSON.parse(localStorage.getItem('cnfl_work_orders')||'[]').map(o=>({done:!!o.status&&o.status!=='pending'}));
          if(moduleName==='notificaciones'){
            const s=JSON.parse(localStorage.getItem('cnfl_notificaciones_20261019_v2')||'{}');
            return (window.CNFL_NOTIFICATION_STOPS||[]).map(o=>({done:!!s.done?.[o[0]]}));
          }
          const key=moduleName==='demanda'?'cnfl_reading_orders_v2':'cnfl_residential_reading_v1';
          return (JSON.parse(localStorage.getItem(key)||'{}').orders||[]).map(o=>({done:o.status==='read'||o.status==='unread'}));
        }catch(_){return []}
      }
      function section(id){
        if(moduleName==='cortes')window.switchTab?.(id,id==='cargar'?document.querySelectorAll('.nav-tab-btn')[1]:id==='resumen'?document.querySelectorAll('.nav-tab-btn')[2]:document.querySelectorAll('.nav-tab-btn')[0]);
        else if(moduleName==='demanda'||moduleName==='residencial')window.switchReadingTab?.(id,document.getElementById('tab'+id[0].toUpperCase()+id.slice(1)));
      }
      function reportText(){
        const rows=workRows(),done=rows.filter(o=>o.done).length;
        return 'CNFL Campo · '+journey.MODULES[moduleName]+'\nJornada: '+active.date+'\nTotal: '+rows.length+'\nGestionadas: '+done+'\nPendientes: '+(rows.length-done);
      }
      function refresh(){
        const state=journey.read(localStorage).active;
        if(!state||state.id!==active.id||state.finishedAt)return;
        document.body.classList.toggle('cnfl-report-step',state.step==='report');
        document.body.classList.toggle('cnfl-load-empty',state.step==='load'&&!workRows().length);
      }
      window.cnflJourneyRefresh=refresh;
      window.cnflJourneyReview=()=>{
        const current=journey.read(localStorage).active;
        if(current?.id!==active.id||current.step!=='work')return;
        journey.step(localStorage,'report');
        section(moduleName==='cortes'?'resumen':'summary');
        refresh();
      };
      window.cnflJourneyLoaded=()=>{
        const current=journey.read(localStorage).active;
        if(current?.id!==active.id||current.step!=='load')return;
        journey.step(localStorage,'map');
        window.cnflOpenSharedMap?.(moduleName);
      };

      // Cerrar la jornada en un paso (confirmación incluida), desde el Resumen y,
      // cuando ya no quedan pendientes, desde una tarjeta al inicio del trabajo.
      function closeJourney(message){
        const state=journey.read(localStorage).active;
        if(!state||state.id!==active.id||state.finishedAt){if(message)message.textContent='Esta jornada ya no está activa.';return;}
        const p=journey.progress(localStorage,moduleName,window.CNFL_NOTIFICATION_STOPS);
        if(!confirm(p.pending?'Quedan '+p.pending+' pendientes. ¿Cerrar la jornada y guardarla?':'¿Cerrar la jornada y guardarla?'))return;
        try{
          const report=moduleName==='cortes'&&typeof window.generateLiquidationText==='function'
            ?window.generateLiquidationText():reportText();
          const saved=journey.close(localStorage,{...p,report});
          if(!saved)throw Error('No se pudo confirmar el cierre');
          location.assign('campo.html?inicio=1');
        }catch(error){
          if(message)message.textContent='No se pudo cerrar la jornada. Revisá el almacenamiento antes de intentarlo de nuevo.';
        }
      }
      function closeControls(withShare){
        const close=document.createElement('div');
        close.className='cnfl-finish-controls';
        if(withShare&&moduleName==='notificaciones'){
          const share=document.createElement('button');
          share.type='button';share.className='secondary';share.textContent='COMPARTIR REPORTE';
          share.onclick=async()=>{
            try{
              if(navigator.share)await navigator.share({title:'Control de notificaciones',text:reportText()});
              else{await navigator.clipboard.writeText(reportText());alert('Reporte copiado. Pegalo donde vayas a entregarlo.');}
            }catch(error){if(error?.name!=='AbortError')alert('No se pudo compartir el reporte.');}
          };
          close.append(share);
        }
        const finish=document.createElement('button');
        finish.type='button';finish.textContent='CERRAR JORNADA';
        const message=document.createElement('p');message.setAttribute('role','status');
        finish.onclick=()=>closeJourney(message);
        close.append(finish,message);
        return close;
      }
      const closeHost=moduleName==='cortes'
        ?document.getElementById('tab-resumen')
        :(moduleName==='notificaciones'
          ?document.querySelector('main')
          :document.querySelector('#view-summary .summary-actions'));
      if(closeHost)closeHost.append(closeControls(true));

      // Sin pendientes: aviso al inicio del trabajo para cerrar sin buscar el Resumen.
      let doneCard=null;
      function updateDoneCard(){
        const p=journey.progress(localStorage,moduleName,window.CNFL_NOTIFICATION_STOPS);
        const ready=p.total>0&&p.pending===0;
        if(ready&&!doneCard){
          doneCard=document.createElement('section');
          doneCard.className='cnfl-close-ready';
          const title=document.createElement('strong');title.textContent='Terminaste las '+p.total+' órdenes';
          const hint=document.createElement('span');hint.textContent='Cerrá la jornada para guardarla en Mi jornada.';
          doneCard.append(title,hint,closeControls(false));
          const head=document.querySelector('main .route-head');
          if(head)head.after(doneCard);else document.querySelector('main')?.prepend(doneCard);
        }else if(!ready&&doneCard){doneCard.remove();doneCard=null;}
        else if(ready&&doneCard){doneCard.querySelector('strong').textContent='Terminaste las '+p.total+' órdenes';}
      }
      refresh();updateDoneCard();
      addEventListener('cnfl-progress',()=>setTimeout(updateDoneCard,300));
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
