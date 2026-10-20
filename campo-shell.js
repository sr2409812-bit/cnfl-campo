(function(){
  const path=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  const moduleName=path==='index.html'?'cortes':path==='lectura.html'?'demanda':path==='lectura-residencial.html'?'residencial':path==='notificaciones.html'?'notificaciones':'';
  document.body.classList.add('cnfl-unified');
  if(moduleName) document.body.classList.add('cnfl-module-'+moduleName);

  const menu=document.createElement('button');
  menu.className='cnfl-global-menu';
  menu.setAttribute('aria-label','Abrir menú de CNFL Campo');
  menu.innerHTML='<i class="fa-solid fa-bars"></i>';

  const drawer=document.createElement('aside');
  drawer.className='cnfl-global-drawer';
  drawer.innerHTML=
    '<div class="drawer-brand">'+
      '<div class="drawer-logo"><i class="fa-solid fa-bolt"></i></div>'+
      '<div><div class="drawer-title">CNFL CAMPO</div><div class="drawer-sub">TRABAJO EN CAMPO</div></div>'+
    '</div>'+
    '<div class="drawer-label">MÓDULOS</div>'+
    '<a href="campo.html"><i class="fa-solid fa-house"></i><span>Inicio</span></a>'+
    '<a href="index.html" data-module="cortes"><i class="fa-solid fa-bolt"></i><span>Cortes</span></a>'+
    '<a href="lectura.html" data-module="demanda"><i class="fa-solid fa-gauge-high"></i><span>Demanda</span></a>'+
    '<a href="lectura-residencial.html" data-module="residencial"><i class="fa-solid fa-house-signal"></i><span>Lectura residencial</span></a>'+
    '<a href="notificaciones.html" data-module="notificaciones"><i class="fa-solid fa-file-signature"></i><span>Notificaciones</span></a>'+
    '<div class="drawer-spacer"></div>'+
    '<a href="backup.html"><i class="fa-solid fa-shield-halved"></i><span>Respaldo</span></a>';

  const scrim=document.createElement('div');
  scrim.className='cnfl-global-scrim';

  const open=()=>{drawer.classList.add('open');scrim.classList.add('show')};
  const close=()=>{drawer.classList.remove('open');scrim.classList.remove('show')};
  menu.onclick=open;scrim.onclick=close;
  drawer.querySelectorAll('a').forEach(a=>a.addEventListener('click',close));
  const active=drawer.querySelector('[data-module="'+moduleName+'"]');
  if(active) active.classList.add('active');

  document.body.append(menu,drawer,scrim);

  const chip=document.createElement('div');
  chip.className='cnfl-module-chip';
  chip.textContent=moduleName==='cortes'?'CORTES / RECONEXIONES':moduleName==='demanda'?'LECTURA DE DEMANDA':moduleName==='residencial'?'LECTURA RESIDENCIAL':moduleName==='notificaciones'?'NOTIFICACIONES':'CNFL CAMPO';
  const firstMain=document.querySelector('main');
  if(firstMain) firstMain.parentNode.insertBefore(chip,firstMain);

  if(moduleName==='demanda'){
    const sub=document.querySelector('.brand-sub');
    if(sub) sub.textContent='LECTURA DE DEMANDA';
    document.title='CNFL Campo · Demanda';
  }
})();