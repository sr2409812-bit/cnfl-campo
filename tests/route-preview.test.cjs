const test=require('node:test');
const assert=require('node:assert/strict');
const preview=require('../route-preview.js');

function responder(log, failure){
  return async url=>{
    const parsed=new URL(url);
    log.push(parsed);
    assert.equal(parsed.searchParams.get('exclude'),'motorway');
    const points=parsed.pathname.split('/').pop().split(';').map(p=>p.split(',').map(Number));
    if(failure) return {ok:true,json:async()=>({code:'InvalidValue',message:'exclude not supported'})};
    const waypoints=points.map(()=>({distance:0}));
    if(parsed.pathname.includes('/table/')) return {ok:true,json:async()=>({code:'Ok',sources:waypoints,
      durations:points.map(a=>points.map(b=>Math.round(Math.hypot(a[0]-b[0],a[1]-b[1])*100000))),
      distances:points.map(a=>points.map(b=>Math.round(Math.hypot(a[0]-b[0],a[1]-b[1])*100000)))})};
    return {ok:true,json:async()=>({code:'Ok',waypoints,routes:[{geometry:{coordinates:points},distance:1234,duration:321}]})};
  };
}

test('agrupa trabajos en una parada y omite GPS faltante o conflictivo',()=>{
  const rows=[
    {type:'cortes',loc:'1',lat:9.9,lon:-84.1,done:false},
    {type:'notificaciones',loc:'2',lat:9.9,lon:-84.1,done:false},
    {type:'demanda',loc:'3',lat:null,lon:-84.1,done:false},
    {type:'cortes',loc:'4',lat:9.8,lon:-84.0,done:true}
  ];
  const result=preview.prepare(rows);
  assert.equal(result.stops.length,1);
  assert.equal(result.stops[0].jobs.length,2);
  assert.equal(result.missing.length,1);
});

test('ordena y dibuja en bloques usando exclusión de autopistas en todas las consultas',async()=>{
  const log=[];
  const stops=Array.from({length:27},(_,i)=>({lat:9.9+i*.001,lon:-84.1,jobs:[{type:'cortes',loc:String(i)}]}));
  const result=await preview.calculate(stops,{lat:9.899,lon:-84.1},responder(log));
  assert.equal(result.ordered.length,27);
  assert.equal(new Set(result.ordered).size,27);
  assert.equal(result.segments.length,3);
  assert.equal(log.filter(url=>url.pathname.includes('/table/')).length,2);
  assert.equal(log.filter(url=>url.pathname.includes('/route/')).length,3);
  assert.ok(log.every(url=>url.pathname.split('/').pop().split(';').length<=25));
  assert.equal(result.meters,3702);
});

test('si el motor no admite exclusión vial, no devuelve una ruta sin restricciones',async()=>{
  const log=[];
  await assert.rejects(preview.calculate([{lat:9.9,lon:-84.1,jobs:[]}],{lat:9.91,lon:-84.11},responder(log,true)),/no pudo calcular evitando autopistas/);
  assert.equal(log.length,1);
});

test('descarta paradas con ajuste a la calle mayor de 100 m',async()=>{
  const fetcher=async()=>({ok:true,json:async()=>({code:'Ok',sources:[{distance:0},{distance:145}],durations:[[0,10],[10,0]]})});
  await assert.rejects(preview.calculate([{lat:9.9,lon:-84.1,jobs:[]}],{lat:9.91,lon:-84.11},fetcher),/más de 100 m/);
});
