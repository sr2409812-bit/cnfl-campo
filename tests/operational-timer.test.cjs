const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const journey=require('../journey.js');
const captureSwitch=require('../operational-capture-switch.js');
globalThis.CNFLJourney=journey;
globalThis.CNFLCaptureSwitch=captureSwitch;
const timer=require('../operational-timer.js');

// Solo almacenamiento sintético en memoria.
function memory(){
  const map=new Map();
  return {map,getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};
}
const T=(hhmm)=>new Date('2026-11-24T'+hhmm+':00.000Z');
function setup({on=true,journeyActive=true}={}){
  const s=memory();
  if(journeyActive)journey.begin(s,'demanda',T('14:00'));
  if(on)captureSwitch.setEnabled(s,true,T('14:00'));
  return s;
}

test('capa 4: con el interruptor apagado no inicia ni escribe',()=>{
  const s=setup({on:false});
  const before=[...s.map.keys()].sort();
  assert.deepEqual(timer.start(s,{now:T('14:05')}),{ok:false,reason:'switch_off'});
  assert.deepEqual(timer.setPaused(s,true,{now:T('14:06')}),{ok:false,reason:'switch_off'});
  assert.deepEqual([...s.map.keys()].sort(),before);
});

test('capa 4: sin jornada activa no inicia',()=>{
  const s=setup({journeyActive:false});
  assert.deepEqual(timer.start(s,{now:T('14:05')}),{ok:false,reason:'no_journey'});
  assert.equal(s.getItem(timer.KEY),null);
});

test('capa 4: iniciar es idempotente y no toca otras claves',()=>{
  const s=setup();
  s.setItem('cnfl_work_orders','[{"ficticio":1}]');
  const r1=timer.start(s,{now:T('14:05')});
  assert.equal(r1.ok,true);
  const r2=timer.start(s,{now:T('14:30')});
  assert.equal(r2.already,true);
  assert.equal(r2.timer.startedAt,'2026-11-24T14:05:00.000Z');
  assert.equal(s.getItem('cnfl_work_orders'),'[{"ficticio":1}]');
});

test('capa 4: pausa y reanudación descuentan el tiempo pausado',()=>{
  const s=setup();
  timer.start(s,{now:T('14:00')});
  assert.equal(timer.setPaused(s,true,{now:T('14:20')}).ok,true);
  assert.equal(timer.setPaused(s,true,{now:T('14:25')}).already,true);
  assert.equal(timer.setPaused(s,false,{now:T('14:50')}).ok,true);
  const st=timer.status(s,{nowMs:T('15:00').getTime()});
  assert.equal(st.summary.effectiveMs,30*60000);
  assert.equal(st.summary.pausedMs,30*60000);
  assert.equal(st.summary.paused,false);
});

test('capa 4: pausa abierta congela el tiempo efectivo',()=>{
  const s=setup();
  timer.start(s,{now:T('14:00')});
  timer.setPaused(s,true,{now:T('14:10')});
  const a=timer.status(s,{nowMs:T('14:30').getTime()}).summary;
  const b=timer.status(s,{nowMs:T('15:30').getTime()}).summary;
  assert.equal(a.effectiveMs,10*60000);
  assert.equal(b.effectiveMs,10*60000);
  assert.equal(a.paused,true);
});

test('capa 4: tiempo por orden desde el inicio y entre finalizaciones, sin pausas',()=>{
  const t={startedAt:'2026-11-24T14:00:00.000Z',pauses:[['2026-11-24T14:20:00.000Z','2026-11-24T14:30:00.000Z']]};
  const done=[T('14:12'),T('14:40'),T('14:55')].map(d=>d.getTime());
  const r=timer.summarize(t,done,{nowMs:T('15:05').getTime()});
  assert.deepEqual(r.durationsMs,[12*60000,18*60000,15*60000]);
  assert.equal(r.completed,3);
  assert.equal(r.meanMs,15*60000);
  assert.equal(r.medianMs,15*60000);
  assert.equal(r.p90Ms,18*60000);
  assert.equal(r.currentOrderMs,10*60000);
  assert.equal(r.lastOrderMs,15*60000);
  assert.equal(r.effectiveMs,55*60000);
  assert.equal(r.ordersPerHour,3.3);
});

test('capa 4: finalizaciones anteriores al inicio no cuentan',()=>{
  const t={startedAt:'2026-11-24T14:00:00.000Z',pauses:[]};
  const r=timer.summarize(t,[T('13:50').getTime(),T('14:10').getTime()],{nowMs:T('14:20').getTime()});
  assert.equal(r.completed,1);
  assert.deepEqual(r.durationsMs,[10*60000]);
});

test('capa 4: reapertura y deshacer descuentan la finalización',()=>{
  const j='2026-11-24:demanda:1';
  const ev=(id,type,at,key,src)=>({eventId:id,journeyId:j,orderKey:key,eventType:type,at,quality:'observed',...(src?{sourceEventId:src}:{})});
  const events=[
    ev('e1','order_completed','2026-11-24T14:10:00.000Z','ord_a'),
    ev('e2','order_completed','2026-11-24T14:20:00.000Z','ord_b'),
    ev('e3','order_undo','2026-11-24T14:21:00.000Z','ord_b','e2'),
    ev('e4','order_completed','2026-11-24T14:30:00.000Z','ord_c'),
    {...ev('x','order_completed','2026-11-24T14:15:00.000Z','ord_z'),journeyId:'otra'}
  ];
  assert.deepEqual(timer.completions(events,j),[T('14:10').getTime(),T('14:30').getTime()]);
});

test('capa 4: reloj alterado se marca y no inventa tiempos',()=>{
  const t={startedAt:'2026-11-24T15:00:00.000Z',pauses:[]};
  const r=timer.summarize(t,[],{nowMs:T('14:00').getTime()});
  assert.equal(r.quality,'invalid_timing');
  assert.equal(r.effectiveMs,null);
  assert.equal(timer.format(r.effectiveMs),'No medido');
});

test('capa 4: valor guardado dañado equivale a sin cronómetro',()=>{
  const s=setup();
  s.setItem(timer.KEY,'{dañado');
  assert.equal(timer.status(s).timer,null);
  s.setItem(timer.KEY,JSON.stringify({version:1,timers:{x:{startedAt:'no-fecha',pauses:[]}}}));
  assert.equal(timer.read(s,'x'),null);
});

test('capa 4: almacenamiento que falla no lanza errores',()=>{
  const s=setup();
  const broken={...s,setItem(k,v){if(k===timer.KEY)throw Error('cuota');s.setItem(k,v);}};
  assert.deepEqual(timer.start(broken,{now:T('14:05')}),{ok:false,reason:'storage'});
});

test('capa 4: formato legible de duraciones',()=>{
  assert.equal(timer.format(0),'00:00');
  assert.equal(timer.format(75000),'01:15');
  assert.equal(timer.format(3723000),'1:02:03');
  assert.equal(timer.format(null),'No medido');
});

const ROOT=path.join(__dirname,'..');
const PAGES=['index.html','lectura.html','lectura-residencial.html','notificaciones.html','mapa.html'];

test('capa 4: las cinco páginas cargan el cronómetro después de la captura y antes de campo-shell',()=>{
  for(const page of PAGES){
    const html=fs.readFileSync(path.join(ROOT,page),'utf8');
    const ev=html.indexOf('operational-events.js?v='),tm=html.indexOf('operational-timer.js?v='),
      ui=html.indexOf('operational-timer-ui.js?v='),shell=html.indexOf('campo-shell.js?v=');
    assert.ok(ev>0&&tm>ev&&ui>tm&&shell>ui,page);
  }
});

test('capa 4: el service worker precarga el cronómetro',()=>{
  const sw=fs.readFileSync(path.join(ROOT,'sw.js'),'utf8');
  const core=sw.slice(sw.indexOf('CORE_ASSETS'),sw.indexOf('OPTIONAL_ASSETS'));
  assert.ok(core.includes("'./operational-timer.js'")&&core.includes("'./operational-timer-ui.js'"));
});

test('capa 4: la tarjeta no flota ni usa HTML dinámico',()=>{
  const ui=fs.readFileSync(path.join(ROOT,'operational-timer-ui.js'),'utf8');
  assert.ok(!/position\s*:\s*(fixed|sticky)/.test(ui),'sin barras flotantes (PR #46)');
  assert.ok(!/innerHTML/.test(ui),'solo textContent/createElement');
  assert.ok(!/geolocation|fetch\(|XMLHttpRequest/.test(ui+fs.readFileSync(path.join(ROOT,'operational-timer.js'),'utf8')),'sin GPS ni red');
});

test('capa 4: órdenes por hora solo con muestra mínima',()=>{
  const t={startedAt:'2026-11-24T14:00:00.000Z',pauses:[]};
  assert.equal(timer.summarize(t,[T('14:05').getTime()],{nowMs:T('14:40').getTime()}).ordersPerHour,null);
  assert.equal(timer.summarize(t,[T('14:01').getTime(),T('14:02').getTime()],{nowMs:T('14:05').getTime()}).ordersPerHour,null);
  assert.equal(timer.summarize(t,[T('14:10').getTime(),T('14:20').getTime()],{nowMs:T('14:30').getTime()}).ordersPerHour,4);
});

test('capa 4 · Codex: el tramo con la medición apagada no se cuenta',()=>{
  const s=setup();
  timer.start(s,{now:T('14:00')});
  // Como hace la tarjeta: pausa tipo "off" antes de apagar, se cierra al reencender.
  assert.equal(timer.setPaused(s,true,{now:T('14:10'),kind:'off'}).ok,true);
  captureSwitch.setEnabled(s,false,T('14:10'));
  captureSwitch.setEnabled(s,true,T('15:10'));
  assert.equal(timer.start(s,{now:T('15:10')}).already,true);
  assert.equal(timer.setPaused(s,false,{now:T('15:10')}).ok,true);
  const r=timer.status(s,{nowMs:T('15:20').getTime()}).summary;
  assert.equal(r.effectiveMs,20*60000);
  assert.equal(r.pausedMs,60*60000);
});

test('capa 4 · Codex: reloj que retrocede entre finalizaciones invalida los tiempos',()=>{
  const j='2026-11-24:demanda:1';
  const ev=(id,at,key)=>({eventId:id,journeyId:j,orderKey:key,eventType:'order_completed',at,quality:'observed'});
  // La bitácora es append-only: la segunda se guardó después pero con hora anterior.
  const q=timer.completionsWithQuality([ev('e1','2026-11-24T14:20:00.000Z','a'),ev('e2','2026-11-24T14:15:00.000Z','b')],j);
  assert.equal(q.clockIssue,true);
  const t={startedAt:'2026-11-24T14:00:00.000Z',pauses:[]};
  const r=timer.summarize(t,q.times,{nowMs:T('14:30').getTime(),clockIssue:q.clockIssue});
  assert.equal(r.quality,'invalid_timing');
  assert.deepEqual(r.durationsMs,[]);
  assert.equal(r.meanMs,null);
  assert.equal(r.ordersPerHour,null);
  assert.equal(timer.completionsWithQuality([ev('e1','2026-11-24T14:15:00.000Z','a'),ev('e2','2026-11-24T14:20:00.000Z','b')],j).clockIssue,false);
});

test('capa 4 · Codex: finalización o pausa posterior al instante actual marca reloj alterado',()=>{
  const t={startedAt:'2026-11-24T14:00:00.000Z',pauses:[['2026-11-24T14:50:00.000Z',null]]};
  assert.equal(timer.summarize(t,[],{nowMs:T('14:30').getTime()}).quality,'invalid_timing');
  const t2={startedAt:'2026-11-24T14:00:00.000Z',pauses:[]};
  assert.equal(timer.summarize(t2,[T('14:40').getTime()],{nowMs:T('14:30').getTime()}).quality,'invalid_timing');
});

test('capa 4 · Codex: la tarjeta actualiza textos sin reemplazar sus controles en cada segundo',()=>{
  const ui=fs.readFileSync(path.join(ROOT,'operational-timer-ui.js'),'utf8');
  const render=ui.slice(ui.indexOf('function render('),ui.indexOf('function toggle('));
  assert.ok(/if\(card\.dataset\.mode!==mode\)build\(mode\)/.test(render),'solo reconstruye al cambiar de modo');
  const update=ui.slice(ui.indexOf('function update('),ui.indexOf('function render('));
  assert.ok(!/replaceChildren|createElement|el\(/.test(update),'update solo cambia textos y estados');
});

test('capa 4: los elementos ocultos de la tarjeta no se muestran por estilos propios',()=>{
  const ui=fs.readFileSync(path.join(ROOT,'operational-timer-ui.js'),'utf8');
  assert.ok(ui.includes('.cnfl-timer [hidden]{display:none!important}'));
});
