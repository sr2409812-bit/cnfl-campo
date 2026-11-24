/* M10 · Capa 4 + etapa 1 del rediseño — Tarjeta "Cronómetro de jornada".
   - Mapa: tarjeta completa con el interruptor "Medir tiempos" (decisión 0007).
   - Cortes, Demanda, Residencial y Notificaciones: tarjeta compacta con el mismo
     interruptor cuando la jornada activa es de ese módulo (encendida o apagada),
     ubicada justo antes de la orden actual cuando la página la tiene.
   Va dentro del contenido (sin barras flotantes, PR #46). El reloj en pantalla
   se recalcula cada segundo desde marcas guardadas; el segundero no es la fuente. */
(function(){
  'use strict';
  const T=window.CNFLOperationalTimer, SW=window.CNFLCaptureSwitch, J=window.CNFLJourney;
  if(!T||!SW||!J||typeof document==='undefined')return;

  const page=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  const MODULE_BY_PAGE={'index.html':'cortes','lectura.html':'demanda','lectura-residencial.html':'residencial','notificaciones.html':'notificaciones'};
  const isMap=page==='mapa.html';
  const pageModule=MODULE_BY_PAGE[page]||null;
  if(!isMap&&!pageModule)return;
  const NAMES={cortes:'Cortes',demanda:'Lectura de demanda',residencial:'Lectura residencial',notificaciones:'Notificaciones'};

  const css=`
.cnfl-timer{background:#fff;border:1px solid #D9E0E7;border-left:5px solid #FF6A13;border-radius:12px;padding:12px 14px;margin:10px 0 12px;color:#172033;font-family:inherit}
.cnfl-timer h2{font-size:13px;letter-spacing:.08em;margin:0 0 6px;color:#00264D;font-weight:900;text-transform:uppercase}
.cnfl-timer .tm-main{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.cnfl-timer .tm-big{font-size:30px;font-weight:900;font-variant-numeric:tabular-nums;color:#00264D}
.cnfl-timer .tm-label{font-size:13px;color:#5A6678;font-weight:700}
.cnfl-timer .tm-row{font-size:13px;color:#172033;margin-top:4px;font-variant-numeric:tabular-nums}
.cnfl-timer .tm-note{font-size:13px;color:#5A6678;margin:6px 0 0;line-height:1.4}
.cnfl-timer .tm-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.cnfl-timer button{min-height:48px;border-radius:10px;border:1px solid #0033A0;background:#0033A0;color:#fff;font-weight:900;padding:0 14px;font-size:14px}
.cnfl-timer button.tm-secondary{background:#fff;color:#0033A0}
.cnfl-timer button:focus-visible,.cnfl-timer input:focus-visible{outline:3px solid #FF6A13;outline-offset:2px}
.cnfl-timer .tm-switch{display:flex;align-items:center;gap:10px;font-weight:800;font-size:15px;min-height:48px}
.cnfl-timer .tm-switch input{width:26px;height:26px;accent-color:#FF6A13}
.cnfl-timer .tm-badge{display:inline-block;background:#FFF1E8;color:#B54A08;border-radius:999px;padding:2px 8px;font-size:12px;font-weight:900}
.cnfl-timer.compact{padding:10px 12px}
.cnfl-timer.compact .tm-big{font-size:24px}
.cnfl-timer [hidden]{display:none!important}`;
  const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);

  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  let card=null,cache=null,tick=null,refs={};

  function load(){cache=T.status(localStorage);}

  function host(){
    if(isMap)return document.querySelector('main .intro')||document.querySelector('main');
    return document.querySelector('main');
  }
  function place(node){
    // Demanda y Residencial: justo antes de la orden actual (donde se mira al trabajar).
    const cur=!isMap&&document.getElementById('currentReadingCard');
    if(cur&&cur.parentNode){cur.before(node);return true;}
    const h=host();if(!h)return false;
    if(isMap&&h.classList.contains('intro'))h.after(node);
    else h.prepend(node);
    return true;
  }

  // Modo de la tarjeta: solo se reconstruye cuando cambia; el segundero
  // actualiza textos sin reemplazar controles (conserva el foco del teclado).
  function modeOf(c){
    if(!c.switchOn)return 'off';
    if(!c.journey)return 'nojourney';
    if(!c.timer)return 'notstarted';
    return 'running';
  }

  function build(mode){
    card.replaceChildren();refs={};
    card.dataset.mode=mode;
    card.append(el('h2',null,'Cronómetro de jornada'));
    {
      const label=el('label','tm-switch');
      const input=el('input');input.type='checkbox';input.id='cnflMeasureSwitch';
      input.onchange=()=>toggle(input.checked,input);
      label.append(input,document.createTextNode('Medir tiempos'));
      card.append(label);refs.input=input;
    }
    if(mode==='off'){
      card.append(el('p','tm-note',isMap
        ?'Apagado. Al encenderlo, el cronómetro arranca con tu jornada al abrir el mapa y mide cuánto tardás por orden. Se guarda solo en este teléfono, sin GPS ni datos de clientes.'
        :'Apagado: no se anota nada y no habrá estadísticas. Encendelo para medir cuánto tardás por orden (solo en este teléfono, sin GPS).'));
      return;
    }
    if(mode==='nojourney'){
      card.append(el('p','tm-note','No hay una jornada activa. Iniciala desde «Mi jornada» y volvé al mapa para arrancar el cronómetro.'));
      return;
    }
    if(mode==='notstarted'){
      refs.note=el('p','tm-note','');card.append(refs.note);
      const actions=el('div','tm-actions');
      const startBtn=el('button',null,isMap?'INICIAR CRONÓMETRO':'INICIAR AHORA');startBtn.type='button';
      startBtn.onclick=()=>{T.start(localStorage,{source:isMap?'map-button':'module-button'});refresh();};
      actions.append(startBtn);card.append(actions);
      return;
    }
    const main=el('div','tm-main');
    refs.big=el('span','tm-big','');refs.badge=el('span','tm-badge','EN PAUSA');
    main.append(refs.big,el('span','tm-label','orden actual'),refs.badge);
    card.append(main);
    refs.row1=el('div','tm-row','');card.append(refs.row1);
    refs.row2=el('div','tm-row','');card.append(refs.row2);
    refs.warn=el('p','tm-note','El reloj del teléfono cambió: los tiempos no son confiables.');card.append(refs.warn);
    const actions=el('div','tm-actions');
    refs.pause=el('button',null,'');refs.pause.type='button';
    refs.pause.onclick=()=>{T.setPaused(localStorage,!refs.paused);refresh();};
    actions.append(refs.pause);card.append(actions);
    if(isMap)card.append(el('p','tm-note','Cada orden se cuenta desde la anterior hasta que la finalizás: incluye traslado y atención. Las pausas no cuentan.'));
  }

  function update(){
    if(refs.input)refs.input.checked=!!cache.switchOn;
    if(refs.note)refs.note.textContent='El cronómetro de '+(NAMES[cache.journey?.module]||'la jornada')+' arranca al abrir el mapa.';
    if(!refs.big)return;
    const s=T.summarize(cache.timer,cache.completions,{nowMs:Date.now(),clockIssue:cache.clockIssue});
    if(!s)return;
    refs.paused=s.paused;
    refs.big.textContent=T.format(s.currentOrderMs);
    refs.badge.hidden=!s.paused;
    refs.row1.textContent='Jornada '+T.format(s.effectiveMs)+' · '+s.completed+(s.completed===1?' orden':' órdenes')+(s.meanMs!==null?' · promedio '+T.format(s.meanMs):'');
    if(refs.row2){
      refs.row2.hidden=!s.durationsMs.length;
      refs.row2.textContent='Mediana '+T.format(s.medianMs)+' · P90 '+T.format(s.p90Ms)+' · última '+T.format(s.lastOrderMs)+(s.ordersPerHour!==null?' · '+s.ordersPerHour+' por hora':'');
    }
    refs.warn.hidden=s.quality==='observed';
    const label=s.paused?'REANUDAR':'PAUSAR';
    if(refs.pause.textContent!==label){refs.pause.textContent=label;refs.pause.className=s.paused?'':'tm-secondary';}
  }

  function render(){
    if(!cache)load();
    const relevant=isMap||(cache.journey&&cache.journey.module===pageModule);
    if(!relevant){card?.remove();card=null;return;}
    if(!card){card=el('section','cnfl-timer'+(isMap?'':' compact'));card.setAttribute('aria-label','Cronómetro de jornada');if(!place(card)){card=null;return;}}
    const mode=modeOf(cache);
    if(card.dataset.mode!==mode)build(mode);
    update();
  }

  function toggle(on,input){
    const msg=on
      ?'¿Encender «Medir tiempos»?\n\nSe anotará la hora en que finalizás cada orden y el cronómetro de la jornada. Queda solo en este teléfono (entra en el respaldo), sin GPS ni datos de clientes. Podés apagarlo cuando quieras.'
      :'¿Apagar «Medir tiempos»?\n\nDeja de anotar desde ahora. El rato que esté apagado no se cuenta. Lo ya medido se conserva.';
    if(!confirm(msg)){input.checked=!on;return;}
    // Apagar: el tramo sin medir queda como pausa para no inflar los tiempos.
    if(!on)T.setPaused(localStorage,true,{kind:'off'});
    const r=SW.setEnabled(localStorage,on);
    if(!r.ok){input.checked=!on;alert('No se pudo guardar el cambio en este teléfono.');return;}
    if(on){
      const st=T.start(localStorage,{source:isMap?'map-switch':'module-switch'});
      if(st.ok&&st.already)T.setPaused(localStorage,false);
    }
    refresh();
  }

  function refresh(){load();render();}
  function init(){
    if(isMap&&SW.isEnabled(localStorage))T.start(localStorage,{source:'map-open'});
    refresh();
    clearInterval(tick);
    let n=0;
    tick=setInterval(()=>{if(document.visibilityState!=='visible')return;if(++n%5===0)load();render();},1000);
  }
  addEventListener('pageshow',refresh);
  addEventListener('storage',e=>{if(!e.key||e.key.startsWith('cnfl_operation')||e.key==='cnfl_journeys_v1')refresh();});
  addEventListener('cnfl-progress',()=>setTimeout(refresh,400));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
