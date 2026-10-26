(function(){
  const path=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  const moduleName=path==='index.html'?'cortes':path==='lectura.html'?'demanda':path==='lectura-residencial.html'?'residencial':path==='notificaciones.html'?'notificaciones':path==='mapa.html'?'mapa':path==='backup.html'?'respaldo':'';

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
      '<div class="drawer-label">TIPO DE TRABAJO</div>'+
      '<a href="campo.html" data-module="inicio"><i class="fa-solid fa-house"></i><span>Inicio</span></a>'+
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
      moduleName==='mapa'?'MAPA GENERAL':
      moduleName==='respaldo'?'RESPALDO':'CNFL CAMPO';
    const firstMain=document.querySelector('main');
    if(firstMain) firstMain.parentNode.insertBefore(chip,firstMain);
  }

  if(moduleName==='demanda'){
    const sub=document.querySelector('.brand-sub');
    if(sub) sub.textContent='LECTURA DE DEMANDA';
    document.title='CNFL Campo · Demanda';
  }
})();
