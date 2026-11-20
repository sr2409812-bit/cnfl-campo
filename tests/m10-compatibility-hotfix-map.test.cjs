// M10-COMPAT — regresión combinada sobre main+HOTFIX-MAPA-001 y M10-002..005.
 // Se ejecuta exclusivamente con objetos en memoria y datos ficticios.
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {webcrypto}=require('node:crypto');
const {TextEncoder}=require('node:util');
const stats=require('../operational-stats.js');
const travel=require('../operational-travel.js');
const view=require('../operational-stats-view.js');
const fixtures=require('../operational-stats-fixtures.js');
const source=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
function storage(initial={}){
  const values=new Map(Object.entries(initial).map(([k,v])=>[k,JSON.stringify(v)]));
  const writes=[];
  return {
    values,writes,
    getItem(k){return values.has(k)?values.get(k):null},
    setItem(k,v){writes.push(k);values.set(k,String(v))},
    removeItem(){throw Error('No se permite eliminación de datos en pruebas de compatibilidad')},
    clear(){throw Error('No se permite eliminar almacenamiento en pruebas de compatibilidad')}
  };
}
function fieldContext(initial,activeModule='cortes'){
  const localStorage=storage(initial);
  const ctx={
    localStorage,crypto:webcrypto,TextEncoder,
    navigator:{locks:{request:(_name,_opts,run)=>run()}},
    CNFLOperationalStats:stats,
    CNFLJourney:{read:()=>({active:{
      id:'2026-11-19:cortes:demo',
      module:activeModule,
      finishedAt:null
    }})}
  };
  ctx.window=ctx;
  vm.createContext(ctx);
  vm.runInContext(source('operational-events.js'),ctx,{filename:'operational-events.js'});
  vm.runInContext(source('mapa-data.js'),ctx,{filename:'mapa-data.js'});
  return {ctx,localStorage};
}
const key=(module,index)=>module+':'+String(index).padStart(10,'0');
const keys=(module,n)=>Array.from({length:n},(_,i)=>key(module,i+1));

test('compatibilidad: mapa conserva el límite por módulo de la versión publicada',()=>{
  const map=source('mapa.js');
  assert.match(map,/MAX_MANUAL_STOPS_PER_MODULE=120/);
  assert.match(map,/routeKeys\(\)\.length>=MAX_MANUAL_STOPS_PER_MODULE/);
  assert.doesNotMatch(map,/manualKeys\.length>=120/);
  assert.doesNotMatch(map,/manualKeys=saved\.filter\([^;]*\.slice\(0,120\)/);
  assert.match(map,/if\(!persistManual\(proposed\)\)return false/);
});
test('compatibilidad: mapa de Demanda conserva rutas de Cortes y los eventos M10',()=>{
  const {ctx,localStorage}=fieldContext({
    cnfl_manual_route_v1:[...keys('cortes',57),...keys('demanda',63)],
    cnfl_reading_orders_v2:{orders:[{
      localizacion:'0000000064',medidor:'M-FAKE-64',status:'pending',
      lat:9.9,lon:-84.1
    }]}
  });
  ctx.scope='demanda';ctx.inventory=false;
  ctx.MAX_MANUAL_STOPS_PER_MODULE=120;
  ctx.names={demanda:'Demanda'};
  ctx.manualStatus={textContent:''};ctx.routeHint={textContent:''};
  ctx.manualKeys=JSON.parse(localStorage.getItem('cnfl_manual_route_v1'));
  ctx.routeWarning='';ctx.manualToken=0;ctx.manualTrace=null;ctx.manualDraft=false;ctx.preview=null;
  ctx.document={getElementById:()=>({hidden:false})};
  ctx.render=()=>{};ctx.clearPreview=()=>{};
  const m=source('mapa.js');
  const snippet=m.slice(m.indexOf('  function key('),m.indexOf('  function focusJob('));
  vm.runInContext(snippet,ctx);
  const job=ctx.CNFLFieldMapData.collect().find(o=>o.type==='demanda');
  assert.ok(job);
  assert.equal(ctx.addManual(job),true);
  const after=JSON.parse(localStorage.getItem('cnfl_manual_route_v1'));
  assert.equal(after.length,121);
  assert.deepEqual(after.filter(k=>k.startsWith('cortes:')),keys('cortes',57));
  assert.equal(after.filter(k=>k.startsWith('demanda:')).length,64);
  assert.equal(localStorage.getItem('cnfl_operation_events_v1'),null);
  assert.deepEqual([...new Set(localStorage.writes)],['cnfl_manual_route_v1']);
});
test('compatibilidad: un corte sintético en mapa produce un evento M10 separado',async()=>{
  const {ctx,localStorage}=fieldContext({
    cnfl_work_orders:[{
      localizacion:'0009999999',orden:'test-only-1',
      medidor:'test-only-2',status:'pending',lat:9.9,lon:-84.1
    }],
    cnfl_order_history_v1:[],
    cnfl_manual_route_v1:[...keys('cortes',7),...keys('demanda',63)]
  });
  const routeBefore=localStorage.getItem('cnfl_manual_route_v1');
  assert.equal(ctx.CNFLFieldMapData.setCutStatus('0009999999','test-only-1','cortado'),true);
  await ctx.CNFLOperationalEvents.flush();
  const orders=JSON.parse(localStorage.getItem('cnfl_work_orders'));
  assert.equal(orders[0].status,'cortado');
  assert.equal(localStorage.getItem('cnfl_manual_route_v1'),routeBefore);
  const ledger=JSON.parse(localStorage.getItem('cnfl_operation_events_v1'));
  assert.equal(ledger.events.length,1);
  assert.equal(ledger.events[0].eventType,'order_completed');
  assert.equal(ledger.events[0].module,'cortes');
  assert.equal(ledger.events[0].source,'cuts-map');
  assert.match(ledger.events[0].orderKey,/^ord_[0-9a-f]{32}$/);
  assert.doesNotMatch(JSON.stringify(ledger),/test-only-1|test-only-2|0009999999/);
});
test('compatibilidad: error de almacenamiento de ruta no genera evento estadístico',()=>{
  const {ctx,localStorage}=fieldContext({
    cnfl_manual_route_v1:[...keys('cortes',57),...keys('demanda',63)],
    cnfl_reading_orders_v2:{orders:[]}
  });
  ctx.scope='demanda';ctx.inventory=false;
  ctx.MAX_MANUAL_STOPS_PER_MODULE=120;
  ctx.names={demanda:'Demanda'};ctx.manualKeys=JSON.parse(localStorage.getItem('cnfl_manual_route_v1'));
  ctx.routeWarning='';ctx.manualToken=0;ctx.manualTrace=null;ctx.manualDraft=false;ctx.preview=null;
  ctx.manualStatus={textContent:''};ctx.routeHint={textContent:''};
  ctx.document={getElementById:()=>({hidden:false})};
  ctx.render=()=>{};ctx.clearPreview=()=>{};
  const m=source('mapa.js');
  vm.runInContext(m.slice(m.indexOf('  function key('),m.indexOf('  function focusJob(')),ctx);
  const prev=localStorage.getItem('cnfl_manual_route_v1');
  const originalSet=localStorage.setItem;
  localStorage.setItem=(k,v)=>{if(k==='cnfl_manual_route_v1')throw Error('cuota simulada');return originalSet(k,v)};
  assert.equal(ctx.changeManual([...keys('demanda',63),'demanda:0000000064']),false);
  assert.equal(localStorage.getItem('cnfl_manual_route_v1'),prev);
  assert.equal(localStorage.getItem('cnfl_operation_events_v1'),null);
  assert.match(ctx.routeHint.textContent,/No se pudo guardar/);
});
test('compatibilidad: se mantienen módulos de captura y el mapa carga scripts en orden',()=>{
  const files=['index.html','lectura.html','lectura-residencial.html','mapa.html','notificaciones.html'];
  for(const filename of files){
    const html=source(filename);
    const a=html.indexOf('operational-stats.js'),b=html.indexOf('operational-events.js');
    assert.ok(a>=0&&b>a,filename);
    assert.ok(html.includes('journey.js'),filename);
  }
  const mapHtml=source('mapa.html');
  assert.ok(mapHtml.includes('mapa.js'));
  assert.ok(mapHtml.includes('mapa-data.js'));
});
test('compatibilidad: panel permanece ficticio y el motor de traslados no toca GPS',()=>{
  const summary=stats.summarizeJourney(fixtures.scenarios().normal.events,fixtures.scope);
  assert.equal(view.makeViewModel(summary).captureCoverage,'No verificable');
  const travelJs=source('operational-travel.js');
  assert.doesNotMatch(travelJs,/navigator\.geolocation|watchPosition\(|getCurrentPosition\(/);
  assert.equal(travel.summarizeTravel([],[],{journeyId:'demo',module:'demanda'}).captureCoverage,'unverifiable');
  assert.doesNotMatch(source('estadisticas-demo.html'),/operational-events\.js|operational-travel\.js/);
});
test('bloqueo conocido: SW aún no precarga scripts M10; sin aprobación de producción',()=>{
  const sw=source('sw.js');
  assert.equal(sw.includes("'./operational-events.js'"),false);
  assert.equal(sw.includes("'./operational-stats.js'"),false);
  assert.ok(sw.includes("'./mapa.js'"));
});
