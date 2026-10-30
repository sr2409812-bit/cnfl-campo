const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('mapa.js','utf8');
const dataSource=fs.readFileSync('mapa-data.js','utf8');
function data(store){
 const ctx={localStorage:{getItem:k=>JSON.stringify(store[k]??null)}};ctx.window=ctx;
 vm.createContext(ctx);vm.runInContext(dataSource,ctx);return ctx.CNFLFieldMapData;
}
test('inventario incluye GPS sin orden, memoria y rutas archivadas sin duplicar localizaciones',()=>{
 const api=data({
  cnfl_geocache:{'10':{lat:9.9,lon:-84.1},'20':{lat:9.91,lon:-84.1}},
  cnfl_work_orders:[{localizacion:'10',orden:'1'}],
  cnfl_order_history_v1:[{localizacion:'30',lat:9.92,lon:-84.1},{localizacion:'10',lat:9.9,lon:-84.1}],
  cnfl_reading_orders_v2:{orders:[{localizacion:'10',medidor:'2'}]},
  cnfl_residential_routes_v1:[{orders:[{localizacion:'40',lat:9.93,lon:-84.1}]}]
 });
 const points=api.collectLocations();
 assert.deepEqual(Array.from(points,p=>p.loc).sort(),['10','20','30','40']);
 assert.equal(points.find(p=>p.loc==='10').orders.length,2);
 assert.equal(points.find(p=>p.loc==='20').orders.length,0);
 assert.ok(points.every(p=>p.lat!==null));
 assert.equal(api.collect().length,2); // Inventory never becomes today's work.
});
test('inventario mantiene bloqueado el GPS en conflicto aunque haya coordenadas históricas',()=>{
 const api=data({cnfl_geocache:{'10':{lat:9.9,lon:-84.1,status:'conflict'}},cnfl_order_history_v1:[{localizacion:'10',lat:9.9,lon:-84.1}]});
 const p=api.collectLocations()[0];assert.equal(p.lat,null);assert.equal(p.conflict,true);
});
for(const scope of ['cortes','demanda','residencial','notificaciones']){
 test(scope+': filtra puntos y ruta; reordenar/borrar no altera las otras rutas',()=>{
  const rows=['cortes','demanda','residencial','notificaciones'].flatMap(type=>[1,2].map(n=>({type,loc:String(n),lat:9.9,lon:-84.1,done:false})));
  const keys=rows.map(o=>o.type+':'+o.loc),other=keys.filter(k=>!k.startsWith(scope+':'));
  const ctx={scope,inventory:false,type:'todos',pendingOnly:false,manualKeys:keys,manualToken:0,preview:null,
   window:{CNFLFieldMapData:{collect:()=>rows}},localStorage:{setItem(){}},document:{getElementById:()=>({})},render(){}};
  vm.createContext(ctx);
  const from=source.indexOf('  function key('),to=source.indexOf('  function focusJob(');
  vm.runInContext(source.slice(from,to),ctx);
  vm.runInContext(source.slice(source.indexOf('  function visibleRows('),source.indexOf('  function fit(')),ctx);
  assert.ok(ctx.visibleRows().every(o=>o.type===scope));
  assert.ok(ctx.manualStops().every(o=>o.type===scope));
  ctx.changeManual([scope+':2',scope+':1']);
  assert.deepEqual(Array.from(ctx.manualStops(),o=>o.loc),['2','1']);
  ctx.changeManual([]);
  assert.deepEqual(Array.from(ctx.manualKeys),other);
  assert.equal(ctx.manualStops().length,0);
 });
}
