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

  if(!document.querySelector('.cnfl-module-chip')){
    const chip=document.createElement('div');
    chip.className='cnfl-module-chip';
    chip.textContent=moduleName==='cortes'?'CORTES / RECONEXIONES':
      moduleName==='demanda'?'LECTURA DE DEMANDA':
      moduleName==='residencial'?'LECTURA RESIDENCIAL':
      moduleName==='notificaciones'?'NOTIFICACIONES':
      moduleName==='mapa'?(new URLSearchParams(location.search).get('volver')?'MAPA DEL MÓDULO':'MAPA GENERAL'):
      moduleName==='hoy'?'HOY · PENDIENTES':
      moduleName==='respaldo'?'RESPALDO':'CNFL CAMPO';
    const firstMain=document.querySelector('main');
    if(firstMain) firstMain.parentNode.insertBefore(chip,firstMain);
  }

  if(moduleName==='demanda'){
    const sub=document.querySelector('.brand-sub');
    if(sub) sub.textContent='LECTURA DE DEMANDA';
    document.title='CNFL Campo · Demanda';
  }

  const journey=window.CNFLJourney;
  if(journey && Object.hasOwn(journey.MODULES,moduleName)){
    const active=journey.read(localStorage).active;
    if(active&&active.module===moduleName&&!active.finishedAt){
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
        let title='',hint='',label='',next='';
        if(state.step==='load'){title='1 · Cargar órdenes';hint=moduleName==='notificaciones'?'Revisá las paradas guardadas y armá tu ruta.':'Elegí el PDF de '+journey.MODULES[moduleName]+' para esta jornada.';label=moduleName==='notificaciones'?'ARMAR MI RUTA':'ELEGIR PDF';next=moduleName==='notificaciones'?'map':'load';}
        else if(state.step==='map'){title='2 · Armar ruta';hint='Elegí las paradas en tu mapa. Cuando terminés, tocá «Usar esta ruta y empezar». Por ahora también podés continuar sin GPS.';label='ABRIR MI MAPA';next='openMap';}
        else if(state.step==='work'){title='3 · Trabajar';hint=rows.length?done+' gestionadas · '+remaining+' pendientes':'Todavía no hay órdenes cargadas.';label=remaining===0&&rows.length?'REVISAR CIERRE':'VER MIS ÓRDENES';next=remaining===0&&rows.length?'report':'work';}
        else {title='4 · Revisar cierre';hint=done+' gestionadas · '+remaining+' pendientes. Revisá y compartí el control antes de finalizar.';label=moduleName==='notificaciones'?'VER RESUMEN':'ABRIR REPORTE';next='reportView';}
        bar.replaceChildren();const heading=document.createElement('strong');heading.textContent=title;const info=document.createElement('p');info.textContent=hint;const actions=document.createElement('div');actions.className='actions';const button=document.createElement('button');button.type='button';button.textContent=label;
        button.onclick=()=>{
          if(next==='load')section(moduleName==='cortes'?'cargar':'load');
          else if(next==='map'){journey.step(localStorage,'map');window.cnflOpenSharedMap?.(moduleName);refresh();}
          else if(next==='openMap')window.cnflOpenSharedMap?.(moduleName);
          else if(next==='work')section(moduleName==='cortes'?'ruta':moduleName==='notificaciones'?'route':'list');
          else if(next==='report'){journey.step(localStorage,'report');section(moduleName==='cortes'?'resumen':'summary');refresh();}
          else if(moduleName==='notificaciones')bar.scrollIntoView({behavior:'smooth'});
          else section(moduleName==='cortes'?'resumen':'summary');
        };if(!(state.step==='report'&&moduleName==='notificaciones'))actions.append(button);
        if(state.step==='load'&&rows.length&&moduleName!=='notificaciones'){
          const existing=document.createElement('button');existing.type='button';existing.className='secondary';existing.textContent='USAR '+rows.length+' ÓRDENES GUARDADAS';existing.onclick=()=>{journey.step(localStorage,'map');window.cnflOpenSharedMap?.(moduleName);};actions.append(existing);
        }
        if(state.step==='work'&&remaining){const extra=document.createElement('button');extra.textContent='REVISAR CIERRE';extra.onclick=()=>{journey.step(localStorage,'report');section(moduleName==='cortes'?'resumen':'summary');refresh()};actions.append(extra);}
        let summary=null;
        if(state.step==='report'){
          if(moduleName==='notificaciones'){summary=document.createElement('p');summary.className='cnfl-journey-summary';summary.textContent=reportText().replaceAll('\n',' · ');}
          if(moduleName==='notificaciones'){
            const copy=document.createElement('button');copy.type='button';copy.textContent='COPIAR REPORTE';copy.onclick=async()=>{try{await navigator.clipboard.writeText(reportText());copy.textContent='REPORTE COPIADO';}catch(_){copy.textContent='NO SE PUDO COPIAR';}};actions.append(copy);
          }
          const finish=document.createElement('button');finish.textContent='FINALIZAR Y GUARDAR';finish.onclick=()=>{
            if(!confirm('¿Ya revisaste el reporte? Se guardará el cierre de esta jornada. Las órdenes y GPS seguirán en el teléfono.'))return;
            const report=moduleName==='cortes'&&typeof window.generateLiquidationText==='function'?window.generateLiquidationText():reportText();
            journey.finish(localStorage,{total:rows.length,done,pending:remaining,report});location.assign('campo.html');
          };actions.append(finish);
        }
        const home=document.createElement('a');home.href='campo.html';home.className='secondary';home.textContent='CAMBIAR TRABAJO';actions.append(home);
        bar.append(heading,info);if(summary)bar.append(summary);bar.append(actions);
      }
      window.cnflJourneyRefresh=refresh;
      function reportText(){const rows=workRows(),done=rows.filter(o=>o.done).length;return 'CNFL Campo · '+journey.MODULES[moduleName]+'\nJornada: '+active.date+'\nTotal: '+rows.length+'\nGestionadas: '+done+'\nPendientes: '+(rows.length-done);}
      window.cnflJourneyLoaded=()=>{const current=journey.read(localStorage).active;if(current?.id!==active.id||current.step!=='load')return;journey.step(localStorage,'map');window.cnflOpenSharedMap?.(moduleName);};
      refresh();
      if(active.step==='load'&&!workRows().length&&location.search.includes('jornada=1')&&moduleName!=='notificaciones')section(moduleName==='cortes'?'cargar':'load');
      addEventListener('pageshow',refresh);addEventListener('focus',refresh);addEventListener('cnfl-progress',refresh);
    }
  }

  const fieldModules={cortes:'CORTES',demanda:'DEMANDA',residencial:'RESIDENCIAL',notificaciones:'NOTIFICACIONES'};
  if(Object.hasOwn(fieldModules,moduleName)){
    try{localStorage.setItem('cnfl_last_module',moduleName);}catch(_){}
    window.cnflOpenSharedMap=function(kind=moduleName){
      const selected=Object.hasOwn(fieldModules,kind)?kind:moduleName;
      location.assign('mapa.html?tipo='+encodeURIComponent(selected)+'&volver='+encodeURIComponent(moduleName)+'&v=20261030-simple1');
    };
  }
})();
