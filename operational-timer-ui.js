/* M10 · Capa 4 — Tarjeta "Cronómetro de jornada".
   - Mapa: tarjeta completa con el interruptor "Medir tiempos" (decisión 0007).
   - Cortes, Demanda, Residencial y Notificaciones: tarjeta compacta, solo si la
     medición está encendida y la jornada activa es de ese módulo.
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
.cnfl-timer .tm-label{font-size:12px;color:#687386;font-weight:700}
.cnfl-timer .tm-row{font-size:13px;color:#172033;margin-top:4px;font-variant-numeric:tabular-nums}
.cnfl-timer .tm-note{font-size:12px;color:#687386;margin:6px 0 0}
.cnfl-timer .tm-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.cnfl-timer button{min-height:44px;border-radius:10px;border:1px solid #0033A0;background:#0033A0;color:#fff;font-weight:900;padding:0 14px;font-size:14px}
.cnfl-timer button.tm-secondary{background:#fff;color:#0033A0}
.cnfl-timer button:focus-visible,.cnfl-timer input:focus-visible{outline:3px solid #FF6A13;outline-offset:2px}
.cnfl-timer .tm-switch{display:flex;align-items:center;gap:10px;font-weight:800;font-size:15px;min-height:44px}
.cnfl-timer .tm-switch input{width:24px;height:24px;accent-color:#FF6A13}
.cnfl-timer .tm-badge{display:inline-block;background:#FFF1E8;color:#B54A08;border-radius:999px;padding:2px 8px;font-size:12px;font-weight:900}
.cnfl-timer.compact{padding:10px 12px}
.cnfl-timer.compact .tm-big{font-size:24px}`;
  const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);

  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  let card=null,cache=null,tick=null;

  function load(){
    const st=T.status(localStorage);
    let completions=[];
    if(st.journey&&st.timer){
      try{
        const l=JSON.parse(localStorage.getItem('cnfl_operation_events_v1')||'null');
        completions=T.completions(Array.isArray(l?.events)?l.events:[],st.journey.id);
      }catch(_){completions=[];}
    }
    cache={...st,completions};
  }

  function host(){
    if(isMap)return document.querySelector('main .intro')||document.querySelector('main');
    return document.querySelector('main');
  }
  function place(node){
    const h=host();if(!h)return false;
    if(isMap&&h.classList.contains('intro'))h.after(node);
    else h.prepend(node);
    return true;
  }

  function render(){
    if(!cache)load();
    const {switchOn,journey,timer}=cache;
    const relevant=isMap||(switchOn&&journey&&journey.module===pageModule);
    if(!relevant){card?.remove();card=null;return;}
    if(!card){card=el('section','cnfl-timer'+(isMap?'':' compact'));card.setAttribute('aria-label','Cronómetro de jornada');if(!place(card))return;}
    card.replaceChildren();
    card.append(el('h2',null,'Cronómetro de jornada'));

    if(isMap){
      const label=el('label','tm-switch');
      const input=el('input');input.type='checkbox';input.id='cnflMeasureSwitch';input.checked=!!switchOn;
      input.onchange=()=>toggle(input.checked,input);
      label.append(input,document.createTextNode('Medir tiempos'));
      card.append(label);
    }
    if(!switchOn){
      card.append(el('p','tm-note','Apagado. Al encenderlo, el cronómetro arranca con tu jornada al abrir el mapa y mide cuánto tardás por orden. Se guarda solo en este teléfono, sin GPS ni datos de clientes.'));
      return;
    }
    if(!journey){
      card.append(el('p','tm-note','No hay una jornada activa. Iniciala desde «Mi jornada» y volvé al mapa para arrancar el cronómetro.'));
      return;
    }
    if(!timer){
      card.append(el('p','tm-note','El cronómetro de '+(NAMES[journey.module]||'la jornada')+' arranca al abrir el mapa.'));
      const actions=el('div','tm-actions');
      const startBtn=el('button',null,isMap?'INICIAR CRONÓMETRO':'INICIAR AHORA');startBtn.type='button';
      startBtn.onclick=()=>{T.start(localStorage,{source:isMap?'map-button':'module-button'});load();render();};
      actions.append(startBtn);card.append(actions);
      return;
    }
    const s=T.summarize(timer,cache.completions,{nowMs:Date.now()});
    const main=el('div','tm-main');
    main.append(el('span','tm-big',T.format(s.currentOrderMs)),el('span','tm-label','orden actual'));
    if(s.paused)main.append(el('span','tm-badge','EN PAUSA'));
    card.append(main);
    card.append(el('div','tm-row','Jornada '+T.format(s.effectiveMs)+' · '+s.completed+(s.completed===1?' orden':' órdenes')+(s.meanMs!==null?' · promedio '+T.format(s.meanMs):'')));
    if(isMap&&s.completed){
      card.append(el('div','tm-row','Mediana '+T.format(s.medianMs)+' · P90 '+T.format(s.p90Ms)+' · última '+T.format(s.lastOrderMs)+(s.ordersPerHour!==null?' · '+s.ordersPerHour+' por hora':'')));
    }
    if(s.quality!=='observed')card.append(el('p','tm-note','El reloj del teléfono cambió: los tiempos no son confiables.'));
    const actions=el('div','tm-actions');
    const pause=el('button',s.paused?null:'tm-secondary',s.paused?'REANUDAR':'PAUSAR');pause.type='button';
    pause.onclick=()=>{T.setPaused(localStorage,!s.paused);load();render();};
    actions.append(pause);card.append(actions);
    if(isMap)card.append(el('p','tm-note','Cada orden se cuenta desde la anterior hasta que la finalizás: incluye traslado y atención. Las pausas no cuentan.'));
  }

  function toggle(on,input){
    const msg=on
      ?'¿Encender «Medir tiempos»?\n\nSe anotará la hora en que finalizás cada orden y el cronómetro de la jornada. Queda solo en este teléfono (entra en el respaldo), sin GPS ni datos de clientes. Podés apagarlo cuando quieras.'
      :'¿Apagar «Medir tiempos»?\n\nDeja de anotar desde ahora. Lo ya medido se conserva.';
    if(!confirm(msg)){input.checked=!on;return;}
    const r=SW.setEnabled(localStorage,on);
    if(!r.ok){input.checked=!on;alert('No se pudo guardar el cambio en este teléfono.');return;}
    if(on)T.start(localStorage,{source:'map-switch'});
    load();render();
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
