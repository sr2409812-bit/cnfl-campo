const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function collect(data,stops=[]){
  const store=new Map(Object.entries(data).map(([k,v])=>[k,JSON.stringify(v)]));
  const context=vm.createContext({
    CNFL_NOTIFICATION_STOPS:stops,
    localStorage:{getItem:key=>store.get(key)??null},
    console
  });
  context.window=context;
  vm.runInContext(fs.readFileSync('mapa-data.js','utf8'),context);
  return context.CNFLFieldMapData.collect();
}

test('combines all four active work types without changing their storage',()=>{
  const data={
    cnfl_geocache:{'0101000050':{lat:9.9,lon:-84.1,status:'valid'}},
    cnfl_work_orders:[{localizacion:'0101000050',orden:'123',status:'pending'}],
    cnfl_reading_orders_v2:{orders:[{localizacion:'0101000050',medidor:'456',status:'read'}]},
    cnfl_residential_reading_v1:{orders:[{localizacion:'0101000050',medidor:'789',status:'pending'}]},
    cnfl_notificaciones_20261019_v2:{done:{'0204700482':true}}
  };
  const before=JSON.stringify(data);
  const rows=collect(data,[['0204700482',9.93,-84.08]]);
  assert.equal(rows.length,4);
  assert.deepEqual(Array.from(rows,r=>r.type),['cortes','demanda','residencial','notificaciones']);
  assert.equal(rows.filter(r=>r.done).length,2);
  assert.ok(rows.every(r=>r.lat!==null));
  assert.equal(JSON.stringify(data),before);
});

test('conflicting and absent GPS are listed but cannot create map points',()=>{
  const rows=collect({
    cnfl_geocache:{'1111111111':{lat:9.9,lon:-84.1,status:'conflict'}},
    cnfl_work_orders:[{localizacion:'1111111111',lat:9.9,lon:-84.1,status:'pending'}],
    cnfl_residential_reading_v1:{orders:[{localizacion:'2222222222',status:'pending'}]}
  });
  assert.equal(rows.length,2);
  assert.equal(rows[0].conflict,true);
  assert.equal(rows[0].lat,null);
  assert.equal(rows[1].lat,null);
});

test('zero and empty coordinates are not interpreted as real locations',()=>{
  const rows=collect({cnfl_work_orders:[{localizacion:'3333333333',lat:null,lon:null}]});
  assert.equal(rows[0].lat,null);
});

test('legacy unread reading stays pending and links open its own work',()=>{
  const rows=collect({
    cnfl_work_orders:[{localizacion:'0123456789',status:'pending'}],
    cnfl_reading_orders_v2:{orders:[{localizacion:'1234567890',medidor:'77',status:'unread'}]}
  });
  assert.equal(rows[1].done,false);
  assert.equal(rows[0].href,'index.html?loc=0123456789');
  assert.equal(rows[1].href,'lectura.html?loc=1234567890');
});

test('cercanos respeta 250 m, pendientes y distancia',()=>{
  const data=collect({cnfl_work_orders:[
    {localizacion:'1111111111',orden:'1',lat:9.9,lon:-84.1,status:'pending'},
    {localizacion:'2222222222',orden:'2',lat:9.9003,lon:-84.1,status:'pending'},
    {localizacion:'3333333333',orden:'3',lat:9.91,lon:-84.1,status:'pending'},
    {localizacion:'4444444444',orden:'4',lat:9.9001,lon:-84.1,status:'cortado'}
  ]});
  const context=vm.createContext({localStorage:{getItem:()=>null}});context.window=context;
  vm.runInContext(fs.readFileSync('mapa-data.js','utf8'),context);
  const near=context.CNFLFieldMapData.nearby(data,data[0]);
  assert.deepEqual(Array.from(near,x=>x.row.loc),['2222222222']);
  assert.ok(near[0].meters>30&&near[0].meters<40);
});

test('cambiar estado desde el mapa actualiza bandeja e historial sin alterar otras órdenes',()=>{
  const store=new Map(Object.entries({
    cnfl_work_orders:[{orden:'7',localizacion:'1234567890',status:'pending',nis:'55',medidor:'456'},{orden:'8',localizacion:'9876543210',status:'pending'}],
    cnfl_order_history_v1:[]
  }).map(([k,v])=>[k,JSON.stringify(v)]));
  const context=vm.createContext({localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)}});context.window=context;
  vm.runInContext(fs.readFileSync('mapa-data.js','utf8'),context);
  assert.equal(context.CNFLFieldMapData.setCutStatus('1234567890','7','cortado'),true);
  assert.equal(JSON.parse(store.get('cnfl_work_orders'))[0].status,'cortado');
  assert.equal(JSON.parse(store.get('cnfl_work_orders'))[1].status,'pending');
  assert.equal(JSON.parse(store.get('cnfl_order_history_v1'))[0].status,'cortado');
  assert.equal(context.CNFLFieldMapData.setCutStatus('1234567890','7','pending'),true);
  assert.equal(JSON.parse(store.get('cnfl_work_orders'))[0].status,'pending');
  assert.equal(JSON.parse(store.get('cnfl_order_history_v1')).length,1);
});
