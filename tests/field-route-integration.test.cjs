const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const route=require('../field-route.js');

function section(file,from,to){
  const text=fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8');
  return text.slice(text.indexOf(from),text.indexOf(to,text.indexOf(from)));
}
function storage(keys){return {getItem:()=>JSON.stringify(keys)};}

test('lectura aplica el mapa, conserva visitas y recupera el orden previo al borrarlo',()=>{
  const code=section('lectura.js','function applyReadingMapRoute','function loadJson');
  const rows=[{localizacion:'2',status:'read'},{localizacion:'1',status:'pending'},
    {localizacion:'3',status:'pending'}];
  const ctx={readingOrders:rows,readingRouteInfo:{routeId:'jornada-1'},readingRouteMeta:{engine:'osrm-road-network'},
    READING_MODE:'demanda',localStorage:storage(['demanda:3','cortes:1']),
    window:{CNFLFieldRoute:route,addEventListener(){}},saveReadingState(){},renderAll(){},
    document:{getElementById(){return null}},switchReadingTab(){},renderList(){}};
  vm.createContext(ctx);vm.runInContext(code,ctx);
  vm.runInContext('applyReadingMapRoute()',ctx);
  assert.deepEqual(Array.from(ctx.readingOrders,o=>o.localizacion),['3','1','2']);
  assert.equal(ctx.readingOrders[2].status,'read');
  ctx.localStorage=storage([]);
  vm.runInContext('applyReadingMapRoute()',ctx);
  assert.deepEqual(Array.from(ctx.readingOrders,o=>o.localizacion),['2','1','3']);
});

test('notificaciones sigue el orden elegido y conserva las gestiones',()=>{
  const code=section('notificaciones.html','function applyNotificationMapRoute','function render(){');
  const state={order:['02','04','06'],index:0,done:{'04':true},meta:null};
  const ctx={state,localStorage:storage(['notificaciones:06','notificaciones:02']),
    window:{CNFLFieldRoute:route,addEventListener(){}},
    currentStops:()=>state.order.map(loc=>[loc,0,0]),save(){},render(){},scrollTo(){}};
  vm.createContext(ctx);vm.runInContext(code,ctx);
  vm.runInContext('applyNotificationMapRoute()',ctx);
  assert.deepEqual(Array.from(state.order),['06','02','04']);
  assert.equal(state.index,0);
  assert.equal(state.done['04'],true);
  ctx.localStorage=storage([]);
  vm.runInContext('applyNotificationMapRoute()',ctx);
  assert.deepEqual(Array.from(state.order),['02','04','06']);
  assert.equal(state.done['04'],true);
});

for(const unchanged of [true,false]){
  test('notificaciones abre la orden del mapa con ruta '+(unchanged?'ya sincronizada':'nueva'),()=>{
    const code=section('notificaciones.html','function applyNotificationMapRoute','function render(){');
    const keys=unchanged?[]:['notificaciones:06'];
    const state={order:['02','04','06'],index:0,done:{'04':true},meta:null};
    if(unchanged)state.manualRouteSignature='[]';
    let rendered=0;
    const ctx={state,linkedLoc:'04',localStorage:storage(keys),
      window:{CNFLFieldRoute:route,addEventListener(){}},
      currentStops:()=>state.order.map(loc=>[loc,0,0]),save(){},render(){rendered++},scrollTo(){}};
    vm.createContext(ctx);vm.runInContext(code,ctx);
    vm.runInContext('initializeNotificationView()',ctx);
    assert.equal(state.order[state.index],'04');
    assert.equal(state.done['04'],true);
    assert.ok(rendered>0);
  });
}
