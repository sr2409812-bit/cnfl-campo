const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const travel=require('../operational-travel.js');
const stop=i=>'stop_'+String.fromCharCode(97+i).repeat(32);
const keys=[stop(0),stop(1),stop(2)];
const sample={
  ordered:[
    {stopKey:keys[0],lat:9.9,lon:-84.1,customer:'never-persist'},
    {stopKey:keys[1],lat:9.91,lon:-84.11,contract:'TEST-ONLY'},
    {stopKey:keys[2],lat:9.92,lon:-84.12}
  ],
  legMeters:[1000,2500],meters:3500,seconds:600,unfiltered:false,
  segments:[[[9.9,-84.1],[9.91,-84.11]]]
};
const scope={
  journeyId:'demo:demanda:20261118',module:'demanda',
  routeSnapshotId:'snap-001',
  calculatedAt:'2026-11-18T14:00:00.000Z',
  provider:'synthetic'
};
const event=(eventId,type,at,index,travelId)=>{
  const d=new Date(at);
  return {
    schemaVersion:1,eventId,journeyId:scope.journeyId,module:scope.module,
    operationalDay:'2026-11-18',
    travelId,eventType:type,at,recordedAt:at,
    source:'synthetic',fromStopKey:keys[index],toStopKey:keys[index+1],
    routeSnapshotId:scope.routeSnapshotId,segmentIndex:index
  };
};

test('adapta shape real de traceOrdered: cada legMeters corresponde a un par consecutivo',()=>{
  const out=travel.fromRoutePreview(sample,scope);
  assert.equal(out.length,2);
  assert.equal(out[0].distanceMeters,1000);
  assert.equal(out[1].distanceMeters,2500);
  assert.equal(out[0].fromStopKey,keys[0]);
  assert.equal(out[0].toStopKey,keys[1]);
  assert.equal(out[1].fromStopKey,keys[1]);
  assert.equal(out[1].toStopKey,keys[2]);
  assert.equal(out[0].filter,'exclude_motorway');
  assert.equal(out[0].provider,'synthetic');
});

test('la geometría, GPS y datos extras del input NUNCA aparecen en salida',()=>{
  const exported=JSON.stringify(travel.fromRoutePreview(sample,scope));
  for(const forbidden of ['lat','lon','customer','contract','9.9','84.1','never-persist','TEST-ONLY'])
    assert.equal(exported.includes(forbidden),false,forbidden);
  assert.deepEqual(Object.keys(travel.fromRoutePreview(sample,scope)[0]).sort(),
    ['calculatedAt','distanceMeters','filter','fromStopKey','journeyId','module',
     'profile','provider','routeSnapshotId','schemaVersion','segmentIndex','toStopKey'].sort());
});

test('traza sin filtro debe conservar marca de borrador y no alimentar velocidad total',()=>{
  const roads=travel.fromRoutePreview({...sample,unfiltered:true},scope);
  assert.ok(roads.every(r=>r.filter==='unfiltered_draft'));
  const at1='2026-11-18T15:00:00.000Z',at2='2026-11-18T15:12:00.000Z';
  const summary=travel.summarizeTravel([
    event('s','travel_started',at1,0,'trip-a'),
    event('a','travel_arrived',at2,0,'trip-a')
  ],roads,scope);
  assert.equal(summary.counts.completedTravels,1);
  assert.equal(summary.trips[0].roadStatus,'unfiltered_draft');
  assert.equal(summary.counts.draftRoadSegments,1);
  assert.equal(summary.roadDistanceMeters,null);
  assert.equal(summary.equivalentRoadSpeedKmh,null);
});

test('traza incompleta: no crea kilómetros si los tramos no cuadran',()=>{
  for(const trace of [
    {...sample,legMeters:[1000]},
    {...sample,meters:4000},
    {...sample,legMeters:[1000,NaN]},
    {...sample,legMeters:[1000,-50]},
    {...sample,legMeters:[1000,Infinity]},
    {...sample,seconds:NaN},
    {...sample,unfiltered:undefined},
    {...sample,ordered:[...sample.ordered.slice(0,2)]},
    {...sample,ordered:sample.ordered.map((s,i)=>i===1?{lat:9.9}:s)}
  ]){
    assert.throws(()=>travel.fromRoutePreview(trace,scope),TypeError);
  }
});

test('no acepta más de 120 segmentos, perfil desconocido ni IDs de calle en claro',()=>{
  const huge=Array.from({length:122},(_,i)=>({stopKey:stop(i%3)}));
  assert.throws(()=>travel.fromRoutePreview({...sample,
    ordered:huge,legMeters:Array(121).fill(1),meters:121
  },scope),TypeError);
  assert.throws(()=>travel.fromRoutePreview(sample,{...scope,routeSnapshotId:'Ruta del cliente A'}),TypeError);
  assert.throws(()=>travel.fromRoutePreview(sample,{...scope,provider:'gps'}),TypeError);
});

test('ningún resultado de OSRM se consulta automáticamente',()=>{
  const script=fs.readFileSync(path.join(__dirname,'../operational-travel.js'),'utf8');
  const executable=script.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
  assert.doesNotMatch(executable,/\bfetch\s*\(|\bXMLHttpRequest\b|\bgetCurrentPosition\b|\bwatchPosition\b|\bgeolocation\b/);
  assert.doesNotMatch(executable,/\blocalStorage\b|\bindexedDB\b|\bsetInterval\s*\(/);
});

test('no modifica CNFLRoutePreview, endpoints, M10-002 ni estructuras de órdenes',()=>{
  const old=fs.readFileSync(path.join(__dirname,'../route-preview.js'),'utf8');
  assert.match(old,/legMeters\.push\(\.\.\.route\.legs\.map\(leg=>leg\.distance\)\)/);
  assert.match(old,/return \{ordered,segments,legMeters,meters,seconds,unfiltered\}/);
  const source=fs.readFileSync(path.join(__dirname,'../operational-travel.js'),'utf8');
  assert.doesNotMatch(source,/CNFLJourney\.begin|CNFLJourney\.finish|CNFLFieldMapData\.setCutStatus|cnfl_work_orders/);
  assert.ok(!source.includes("router.project-osrm.org"));
  const core=fs.readFileSync(path.join(__dirname,'../operational-stats.js'),'utf8');
  assert.match(core,/No se miden estos campos con eventos de finalización aislados/);
});

test('dos rutas ficticias con mismo índice pero snapshot distinto no se mezclan',()=>{
  const roads=travel.fromRoutePreview(sample,scope);
  const wrong=travel.fromRoutePreview(sample,{...scope,routeSnapshotId:'snap-999'});
  const t1='2026-11-18T15:00:00.000Z',t2='2026-11-18T15:10:00.000Z';
  const summary=travel.summarizeTravel([
    event('s','travel_started',t1,0,'travel-test'),
    event('a','travel_arrived',t2,0,'travel-test')
  ],wrong,scope);
  assert.equal(summary.roadDistanceMeters,null);
  const valid=travel.summarizeTravel([
    event('s','travel_started',t1,0,'travel-test'),
    event('a','travel_arrived',t2,0,'travel-test')
  ],roads,scope);
  assert.equal(valid.roadDistanceMeters,1000);
});

test('distancias de calles desde OSRM no equivalen a distancia GPS medida',()=>{
  const roads=travel.fromRoutePreview(sample,{...scope,provider:'osrm'});
  const t1='2026-11-18T15:00:00.000Z',t2='2026-11-18T15:10:00.000Z';
  const summary=travel.summarizeTravel([
    event('s','travel_started',t1,0,'travel-test'),
    event('a','travel_arrived',t2,0,'travel-test')
  ],roads,scope);
  assert.equal(summary.trips[0].roadStatus,'estimated_filtered');
  assert.equal(summary.trips[0].roadDistanceMeters,1000);
  assert.equal(summary.gpsDistanceMeters,null);
  assert.equal(summary.gpsAverageSpeedKmh,null);
  assert.equal(summary.equivalentRoadSpeedKmh,6);
});
