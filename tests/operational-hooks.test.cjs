const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const code={
  cuts:read('app.js'),map:read('mapa-data.js'),
  readings:read('lectura.js'),ux:read('lectura-ux.js'),
  notifications:read('notificaciones.html')
};
function fragment(code,start,end){
  const a=code.indexOf(start),b=code.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,'No se encontró el bloque del módulo');
  return code.slice(a,b);
}
function capture(){
  const events=[];
  return {events,handler(payload){events.push(payload)}};
}

test('los cinco puntos de entrada cargan motor y adaptador DESPUÉS de CNFLJourney',()=>{
  for(const page of ['index.html','lectura.html','lectura-residencial.html',
                     'notificaciones.html','mapa.html']){
    const html=read(page);
    const j=html.indexOf('journey.js?v=');
    const s=html.indexOf('operational-stats.js?v=');
    const e=html.indexOf('operational-events.js?v=');
    const shell=html.indexOf('campo-shell.js?v=');
    assert.ok(j>=0&&j<s&&s<e&&e<shell,page+' tiene recursos fuera de orden');
    assert.equal(html.match(/operational-events\.js\?v=/g)?.length,1);
  }
  assert.ok(!read('campo.html').includes('operational-events.js'));
  // Capa 2: la captura se precarga para funcionar sin señal desde el primer uso
  // (bloqueo 3 de la auditoría de compatibilidad M10). Antes se exigía lo contrario.
  assert.ok(read('sw.js').includes("'./operational-events.js'"));
});

test('Cortes: un cambio real emite un evento tras guardar, sin reescribir el estado',()=>{
  const hooks=capture(),writes=[];
  const orders=[{id:'cut-a',orden:'A-1',localizacion:'0000000001',medidor:'M-1',status:'pending'}];
  const codeSource=fragment(code.cuts,'function setOrderStatus(', '\nfunction setRouteFilter(');
  const context={
    workOrders:orders,localStorage:{setItem(k,v){writes.push({key:k,value:v})}},
    archiveOrdersToHistory(){},renderOrders(){},showToast(){},
    updateLiquidation(){},getStatusLabel:()=> 'CORTADO',
    window:{CNFLOperationalEvents:{captureTransition(payload){
      assert.equal(writes.at(-1).key,'cnfl_work_orders');
      hooks.handler(payload);
    }}}
  };
  vm.runInNewContext(codeSource,context);
  vm.runInNewContext("setOrderStatus('cut-a','cortado')",context);
  assert.equal(orders[0].status,'cortado');
  assert.equal(JSON.parse(writes[0].value)[0].status,'cortado');
  assert.equal(hooks.events.length,1);
  assert.equal(hooks.events[0].module,'cortes');
  assert.equal(hooks.events[0].previousDone,false);
  assert.equal(hooks.events[0].done,true);
  assert.equal(hooks.events[0].source,'cuts-ui');
});

test('Cortes: reabrir emitirá corrección; recodificar estado completado no duplica',()=>{
  const hooks=capture(),orders=[{id:'c-1',orden:'1',status:'cortado',localizacion:'0000000001',medidor:'123456'}];
  const ctx={
    workOrders:orders,localStorage:{setItem(){}},
    archiveOrdersToHistory(){},renderOrders(){},showToast(){},
    updateLiquidation(){},getStatusLabel:()=> 'PENDIENTE',
    window:{CNFLOperationalEvents:{captureTransition:hooks.handler}}
  };
  vm.runInNewContext(fragment(code.cuts,'function setOrderStatus(', '\nfunction setRouteFilter('),ctx);
  vm.runInNewContext("setOrderStatus('c-1','avisado');setOrderStatus('c-1','pending')",ctx);
  assert.equal(orders[0].status,'pending');
  assert.equal(hooks.events[0].previousDone,true);
  assert.equal(hooks.events[0].done,true); // motor la descarta
  assert.equal(hooks.events[1].previousDone,true);
  assert.equal(hooks.events[1].done,false);
});

test('Cortes desde mapa: emite solo tras escribir estado y conserva historial propio',()=>{
  const hooks=capture(),data={
    cnfl_work_orders:JSON.stringify([{orden:'O-1',localizacion:'0000000001',status:'pending',medidor:'M-1'}]),
    cnfl_order_history_v1:'[]'
  };
  let saved=false;
  const env={localStorage:{
    getItem:k=>data[k]??null,
    setItem(k,v){data[k]=v;if(k==='cnfl_work_orders')saved=true}
  },CNFLOperationalEvents:{captureTransition(p){
    assert.equal(saved,true);
    hooks.handler(p);
  }}};
  env.window=env;
  vm.runInNewContext(code.map,{window:env,localStorage:env.localStorage,console});
  assert.equal(env.CNFLFieldMapData.setCutStatus('0000000001','O-1','cortado'),true);
  assert.equal(JSON.parse(data.cnfl_work_orders)[0].status,'cortado');
  assert.equal(hooks.events.length,1);
  assert.equal(hooks.events[0].source,'cuts-map');
  assert.equal(hooks.events[0].done,true);
  assert.equal(JSON.parse(data.cnfl_order_history_v1).length,1);
});

test('Lecturas base: registra gestión luego de salvar, sin mutar lectura o medidor',()=>{
  const hooks=capture();
  const rows=[{status:'pending',localizacion:'0000000001',medidor:'M-1',lectura:'123'}];
  let saved=false,archived=0;
  const ctx={
    readingOrders:rows,READING_MODE:'demanda',readingRouteInfo:{routeId:'route1'},
    window:{CNFLOperationalEvents:{captureTransition(p){
      assert.equal(saved,true);hooks.handler(p);
    }}},
    archiveReadingEvent(){archived++},
    saveReadingState(){saved=true},renderAll(){},showReadingToast(){}
  };
  vm.runInNewContext(fragment(code.readings,'function markCurrentReading(status) {','\nfunction archiveReadingEvent('),ctx);
  vm.runInNewContext("markCurrentReading('read')",ctx);
  assert.equal(rows[0].status,'read');
  assert.equal(rows[0].lectura,'123');
  assert.equal(archived,1);
  assert.equal(hooks.events[0].module,'demanda');
  assert.equal(hooks.events[0].done,true);
});

test('UX residencial: visita completa genera evento una única vez',()=>{
  const hooks=capture(),rows=[{status:'pending',localizacion:'0000000001',medidor:'M-1',lectura:'555'}];
  const source=fragment(code.ux,'  window.markCurrentVisit = function () {',
    '\n\n  // Compatibilidad con botones/código anteriores.');
  let saved=false;
  const ctx={
    readingOrders:rows,READING_MODE:'residencial',
    readingRouteInfo:{routeId:'rt-test'},
    document:{getElementById:()=>null},
    window:{CNFLOperationalEvents:{captureTransition(p){
      assert.equal(saved,true);hooks.handler(p);
    }}},
    archiveReadingEvent(){},saveReadingState(){saved=true},
    renderAll(){},showReadingToast(){}
  };
  vm.runInNewContext(source,ctx);
  ctx.window.markCurrentVisit();
  assert.equal(rows[0].status,'read');
  assert.equal(rows[0].lectura,'555');
  assert.equal(hooks.events.length,1);
  assert.equal(hooks.events[0].module,'residencial');
});

test('UX residencial: devolver medidor a pendiente emite corrección y conserva lectura',()=>{
  const hooks=capture(),rows=[{status:'read',localizacion:'0000000001',medidor:'M-1',lectura:'777',readAt:'2026-01-01T15:00:00.000Z'}];
  const source=fragment(code.ux,'  window.editSavedReading = function (localizacion) {',
    '\n\n  renderList = function () {');
  let saved=false;
  const ctx={
    readingOrders:rows,READING_MODE:'residencial',
    readingRouteInfo:{routeId:'rt-test'},readingRouteMeta:null,
    document:{getElementById:()=>null},
    window:{CNFLOperationalEvents:{captureTransition(p){
      assert.equal(saved,true);hooks.handler(p);
    }}},
    saveReadingState(){saved=true},
    renderAll(){},switchReadingTab(){},showReadingToast(){}
  };
  vm.runInNewContext(source,ctx);
  ctx.window.editSavedReading('0000000001');
  assert.equal(rows[0].status,'pending');
  assert.equal(rows[0].lectura,'777');
  assert.equal(hooks.events.length,1);
  assert.equal(hooks.events[0].previousDone,true);
  assert.equal(hooks.events[0].done,false);
});

test('Notificaciones: finalizar y deshacer emiten dos transiciones, no al navegar',()=>{
  const hooks=capture();
  const doneState={index:0,done:{},lastAction:null};
  const source=fragment(code.notifications,'function markDone(){','\nfunction nextStop(){');
  const ctx={
    state:doneState,currentStops:()=>[['0000000001',9,-84]],
    nextPending:()=>0,save(){},render(){},window:{
      CNFLOperationalEvents:{captureTransition:hooks.handler}
    }
  };
  vm.runInNewContext(source,ctx);
  ctx.markDone();
  assert.equal(doneState.done['0000000001'],true);
  ctx.undoLastVisit();
  assert.equal(doneState.done['0000000001'],undefined);
  assert.equal(hooks.events.length,2);
  assert.equal(hooks.events[0].done,true);
  assert.equal(hooks.events[1].done,false);
  assert.equal(hooks.events[1].undo,true);
});

test('sin adaptador de métricas, el control de Cortes sigue funcionando',()=>{
  const orders=[{orden:'c-1',status:'pending'}];
  const ctx={
    workOrders:orders,localStorage:{setItem(){}},
    archiveOrdersToHistory(){},renderOrders(){},showToast(){},
    updateLiquidation(){},getStatusLabel:()=> 'CORTADO',window:{}
  };
  vm.runInNewContext(fragment(code.cuts,'function setOrderStatus(', '\nfunction setRouteFilter('),ctx);
  vm.runInNewContext("setOrderStatus('c-1','cortado')",ctx);
  assert.equal(orders[0].status,'cortado');
});
