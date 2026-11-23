const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto').webcrypto;
const {TextEncoder}=require('node:util');
const journey=require('../journey.js');
const stats=require('../operational-stats.js');

const moduleSource=fs.readFileSync(path.join(__dirname,'../operational-events.js'),'utf8');
const captureSwitch=require('../operational-capture-switch.js');
const key='cnfl_operation_events_v1';
const A='2026-01-01T15:00:00.000Z';
const B='2026-01-01T15:15:00.000Z';
const C='2026-01-01T15:30:00.000Z';

function memory(){
  const values=new Map();
  let fails=false;
  return {
    getItem:k=>values.has(k)?values.get(k):null,
    setItem(k,v){if(fails&&k===key)throw Error('quota reached');values.set(k,String(v));},
    removeItem:k=>values.delete(k),
    failTelemetry(on=true){fails=on},
    values
  };
}
function harness({module='cortes',storage=memory(),safeCrypto=crypto,locks=true,journeyActive=true,switchOn=true,withSwitch=true}={}){
  const calls=[];
  // Capa 2: la captura exige el interruptor encendido. Estas pruebas lo encienden
  // salvo cuando verifican justamente el caso apagado.
  if(withSwitch&&switchOn)captureSwitch.setEnabled(storage,true,new Date(A));
  const browser={
    localStorage:storage,CNFLOperationalStats:stats,CNFLJourney:journey,
    ...(withSwitch?{CNFLCaptureSwitch:captureSwitch}:{}),
    TextEncoder,crypto:safeCrypto,
    navigator:locks?{locks:{request:async(name,options,callback)=>{
      calls.push({name,mode:options.mode});return callback();
    }}}:{}
  };
  browser.window=browser;
  vm.runInNewContext(moduleSource,browser,{filename:'operational-events.js'});
  if(journeyActive)journey.begin(storage,module,new Date('2026-01-01T12:00:00.000Z'));
  const journal=()=>JSON.parse(storage.getItem(key)||'null');
  const capture=(identity,oldDone,done,at=A,extra={})=>
    browser.CNFLOperationalEvents.captureTransition({
      module,identity,previousDone:oldDone,done,at,source:'test-ui',...extra
    });
  return {browser,storage,journal,capture,calls};
}
function scope(j,module='cortes'){
  return {journeyId:journey.read(j.storage).active.id,module,
    operationalDay:stats.operationalDayFromIso(A)};
}

test('captura autorizada crea solamente la clave nueva, con ID opaco por orden',async()=>{
  const h=harness(),before=h.storage.values.size;
  assert.equal(await h.capture('order:123|location:987|meter:555',false,true),true);
  assert.equal(h.storage.values.size,before+1);
  assert.equal(h.calls[0].name,'cnfl-operation-events-v1');
  const ledger=h.journal();
  assert.equal(ledger.version,1);
  assert.match(ledger.secret,/^[a-f0-9]{64}$/);
  assert.equal(ledger.events.length,1);
  assert.match(ledger.events[0].orderKey,/^ord_[a-f0-9]{32}$/);
  assert.equal(stats.validateEvent(ledger.events[0]).ok,true);
  assert.equal(h.storage.getItem('cnfl_journeys_v1')===null,false);
  const serialized=h.storage.getItem(key);
  for(const secret of ['order:123','location:987','meter:555'])
    assert.equal(serialized.includes(secret),false);
});

test('cuenta solo finalizaciones válidas y reconstruye 15 minutos entre gestiones',async()=>{
  const h=harness({module:'demanda'});
  assert.equal(await h.capture('route-a|loc-a|med-a',false,true,A),true);
  assert.equal(await h.capture('route-a|loc-b|med-b',false,true,B),true);
  const result=stats.summarizeJourney(h.journal().events,scope(h,'demanda'));
  assert.equal(result.counts.completedOrders,2);
  assert.equal(result.meanIntervalMs,900000);
  assert.equal(result.counts.validIntervals,1);
  assert.equal(result.travelMs,null);
  assert.equal(result.gpsDistanceMeters,null);
});

test('mismo evento reintentado o estado inalterado no duplica gestiones',async()=>{
  const h=harness();
  assert.equal(await h.capture('cut-1',false,true),true);
  assert.equal(await h.capture('cut-1',false,true),false);
  assert.equal(await h.capture('cut-1',true,true),false);
  assert.equal(h.journal().events.length,1);
});

test('reapertura apunta al evento concreto y permite nueva gestión',async()=>{
  const h=harness();
  await h.capture('cut-1',false,true,A);
  assert.equal(await h.capture('cut-1',true,false,B),true);
  assert.equal(h.journal().events[1].sourceEventId,h.journal().events[0].eventId);
  assert.equal(h.journal().events[1].eventType,'order_reopened');
  assert.equal(await h.capture('cut-1',false,true,C),true);
  const m=stats.summarizeJourney(h.journal().events,scope(h));
  assert.equal(m.counts.completedOrders,1);
  assert.equal(m.firstCompletedAt,C);
});

test('notificaciones: deshacer registra corrección compensatoria, sin borrar historial',async()=>{
  const h=harness({module:'notificaciones'});
  await h.capture('loc-notif-1',false,true,A,{source:'notifications-ui'});
  assert.equal(await h.capture('loc-notif-1',true,false,B,{undo:true,source:'notifications-ui'}),true);
  assert.equal(h.journal().events[1].eventType,'order_undo');
  const m=stats.summarizeJourney(h.journal().events,scope(h,'notificaciones'));
  assert.equal(m.counts.completedOrders,0);
  assert.equal(h.journal().events.length,2);
});

test('reabrir una orden ya pendiente no crea evento huérfano',async()=>{
  const h=harness();
  assert.equal(await h.capture('cut-1',true,false),false);
  assert.equal(h.journal(),null);
});

test('dos órdenes del mismo punto tienen claves independientes si su ID difiere',async()=>{
  const h=harness();
  await h.capture('cut-A|loc-shared|meter',false,true,A);
  await h.capture('cut-B|loc-shared|meter',false,true,B);
  const entries=h.journal().events;
  assert.notEqual(entries[0].orderKey,entries[1].orderKey);
  assert.equal(stats.summarizeJourney(entries,scope(h)).counts.completedOrders,2);
});

test('mismo identificador en jornadas distintas nunca se mezcla',async()=>{
  const h=harness();
  await h.capture('cut-1',false,true,A);
  const first=h.journal().events[0];
  journey.begin(h.storage,'cortes',new Date('2026-01-02T12:00:00.000Z'));
  assert.equal(await h.capture('cut-1',false,true,'2026-01-02T15:00:00.000Z'),true);
  const second=h.journal().events[1];
  assert.notEqual(first.journeyId,second.journeyId);
  assert.notEqual(first.orderKey,second.orderKey);
  assert.equal(h.journal().events.length,2);
});

test('no registra si el módulo difiere de la jornada activa',async()=>{
  const h=harness({module:'cortes'});
  assert.equal(await h.capture('cut-1',false,true,A,{module:'demanda'}),false);
  assert.equal(h.journal(),null);
});

test('sin jornada activa no escribe estadísticas',async()=>{
  const h=harness({journeyActive:false});
  assert.equal(await h.capture('cut-1',false,true),false);
  assert.equal(h.journal(),null);
});

test('una jornada finalizada no emite nuevas gestiones',async()=>{
  const h=harness();
  journey.step(h.storage,'map');journey.step(h.storage,'work');
  journey.step(h.storage,'report');journey.finish(h.storage,{total:1,done:1,pending:0});
  assert.equal(await h.capture('cut-1',false,true),false);
  assert.equal(h.journal(),null);
});

test('si falla el almacenamiento estadístico no modifica la jornada ni propaga error',async()=>{
  const store=memory(),h=harness({storage:store});
  const before=store.getItem(journey.KEY);
  store.failTelemetry(true);
  assert.equal(await h.capture('cut-1',false,true),false);
  assert.equal(store.getItem(journey.KEY),before);
  assert.equal(store.getItem(key),null);
});

test('un registro corrupto se conserva intacto y no se sobrescribe',async()=>{
  const h=harness();
  h.storage.setItem(key,'{corrupt');
  const before=h.storage.getItem(key);
  assert.equal(await h.capture('cut-1',false,true),false);
  assert.equal(h.storage.getItem(key),before);
});

test('sin criptografía segura se deshabilita captura, sin afectar la jornada',async()=>{
  const h=harness({safeCrypto:null});
  assert.equal(await h.capture('cut-1',false,true),false);
  assert.equal(h.journal(),null);
});

test('sin Web Locks se deshabilita escritura (sin carreras entre pestañas)',async()=>{
  const h=harness({locks:false});
  assert.equal(await h.capture('cut-1',false,true),false);
  assert.equal(h.journal(),null);
});

test('datos o fuentes no válidos no se escriben',async()=>{
  const h=harness();
  assert.equal(await h.capture('',false,true),false);
  assert.equal(await h.capture('cut-1',false,true,A,{source:'foo|bar'}),false);
  assert.equal(await h.capture('cut-1',true,true),false);
  assert.equal(h.journal(),null);
});

test('eventos simultáneos de la misma pestaña se serializan',async()=>{
  const h=harness();
  const answers=await Promise.all([
    h.capture('cut-1',false,true,A),
    h.capture('cut-2',false,true,A),
    h.capture('cut-1',true,false,B)
  ]);
  assert.deepEqual(answers,[true,true,true]);
  assert.equal(h.journal().events.length,3);
  assert.equal(stats.summarizeJourney(h.journal().events,scope(h)).counts.completedOrders,1);
});

test('los eventos de un solo módulo no afectan el cálculo de otro',async()=>{
  const h=harness();
  await h.capture('cut-1',false,true,A);
  journey.begin(h.storage,'demanda',new Date('2026-01-02T12:00:00.000Z'));
  await h.browser.CNFLOperationalEvents.captureTransition({
    module:'demanda',identity:'route|loc|meter',previousDone:false,done:true,
    at:'2026-01-02T15:00:00.000Z',source:'reading-ui'
  });
  assert.equal(h.journal().events.length,2);
  const onlyCuts=stats.summarizeJourney(h.journal().events,{
    journeyId:h.journal().events[0].journeyId,module:'cortes',operationalDay:'2026-01-01'
  });
  assert.equal(onlyCuts.counts.completedOrders,1);
  assert.equal(onlyCuts.counts.outsideScopeEvents,1);
});

test('capa 2: con el interruptor apagado no se captura ni se escribe nada',async()=>{
  const h=harness({switchOn:false});
  const before=[...h.storage.values.keys()].sort();
  assert.equal(await h.capture('order:1',false,true),false);
  assert.deepEqual([...h.storage.values.keys()].sort(),before);
  assert.equal(h.storage.getItem(key),null);
  assert.equal(h.calls.length,0);
});

test('capa 2: sin el script del interruptor la captura queda apagada',async()=>{
  const h=harness({withSwitch:false});
  assert.equal(await h.capture('order:1',false,true),false);
  assert.equal(h.storage.getItem(key),null);
});

test('capa 2: apagar el interruptor detiene las capturas siguientes',async()=>{
  const h=harness();
  assert.equal(await h.capture('order:1',false,true,A),true);
  captureSwitch.setEnabled(h.storage,false,new Date(B));
  assert.equal(await h.capture('order:2',false,true,B),false);
  assert.equal(h.journal().events.length,1);
});

test('capa 2: interruptor dañado equivale a apagado',async()=>{
  const storage=memory();
  storage.setItem(captureSwitch.KEY,'{dañado');
  const h=harness({storage,switchOn:false});
  assert.equal(await h.capture('order:1',false,true),false);
  assert.equal(storage.getItem(key),null);
});
