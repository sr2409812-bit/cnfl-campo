const test=require('node:test');
const assert=require('node:assert/strict');
const travel=require('../operational-travel.js');
const scope={journeyId:'demo:demanda:20261118',module:'demanda'};
const stops=['a','b','c','d'].map(x=>'stop_'+x.repeat(32));
const BASE=Date.UTC(2026,10,18,15,0,0,0);
const at=min=>new Date(BASE+min*60000).toISOString();
function event(id,travelId,eventType,minute,from=0,to=1,extra={}){
  const occurred=at(minute);
  return {
    schemaVersion:1,eventId:id,...scope,
    operationalDay:'2026-11-18',travelId,eventType,at:occurred,
    recordedAt:occurred,source:'synthetic',
    fromStopKey:stops[from],toStopKey:stops[to],
    routeSnapshotId:'route-demo-1',segmentIndex:from,
    ...extra
  };
}
function road(idx,meters,extra={}){
  return {
    schemaVersion:1,...scope,routeSnapshotId:'route-demo-1',
    segmentIndex:idx,fromStopKey:stops[idx],toStopKey:stops[idx+1],
    distanceMeters:meters,provider:'synthetic',profile:'driving',
    filter:'exclude_motorway',calculatedAt:at(-60),...extra
  };
}
const trips=()=>{
  return [
    event('e1','travel-a','travel_started',0,0,1),
    event('e2','travel-a','travel_arrived',12,0,1),
    event('e3','travel-b','travel_started',20,1,2),
    event('e4','travel-b','travel_arrived',35,1,2)
  ];
};
const stats=(events=trips(),roads=[road(0,1000),road(1,2500)])=>
  travel.summarizeTravel(events,roads,scope);

test('contrato de eventos: inicio y llegada con fechas y paradas opacas válidas',()=>{
  const e=event('id-1','travel-1','travel_started',0);
  const v=travel.validateTravelEvent(e);
  assert.equal(v.ok,true);
  assert.equal(v.event.travelId,'travel-1');
  assert.equal(v.event.fromStopKey,stops[0]);
});

test('contrato rechaza datos personales, coordenadas, lecturas y extensiones',()=>{
  for(const extra of [{lat:9.9},{nis:'123'},{medidor:'345'},
    {gps:{lat:10}},{cliente:'x'},{direccion:'x'}]){
    const v=travel.validateTravelEvent(event('test','travel-a','travel_started',0,0,1,extra));
    assert.equal(v.ok,false);
    assert.ok(v.errors.some(s=>s.startsWith('unknown_field:')));
  }
});

test('contrato no permite GPS, tiempos inventados ni etiquetas de ubicación',()=>{
  for(const payload of [
    {eventType:'gps_fix'}, {eventType:'order_completed'},
    {fromStopKey:'1234567890'}, {toStopKey:'stop_not_opaque'},
    {toStopKey:stops[0]}, {source:'gps'}, {source:'osrm'},
    {segmentIndex:-1}, {routeSnapshotId:'bad space'},
    {schemaVersion:2}
  ]){
    assert.equal(travel.validateTravelEvent(event('test','t','travel_started',0,0,1,payload)).ok,false);
  }
});

test('contrato requiere snapshot y segmento juntos o ambos nulos',()=>{
  assert.equal(travel.validateTravelEvent(event('x','t','travel_started',0,0,1,{
    routeSnapshotId:null,segmentIndex:null
  })).ok,true);
  assert.equal(travel.validateTravelEvent(event('x','t','travel_started',0,0,1,{
    routeSnapshotId:null,segmentIndex:0
  })).ok,false);
  assert.equal(travel.validateTravelEvent(event('x','t','travel_started',0,0,1,{
    routeSnapshotId:'r',segmentIndex:null
  })).ok,false);
});

test('contrato estrictamente UTC y día operativo correcto de Costa Rica',()=>{
  assert.ok(travel.validateTravelEvent(event('a','t','travel_started',0,0,1,{
    at:'2026-11-18T15:00:00-06:00'
  })).errors.includes('occurred_at'));
  assert.ok(travel.validateTravelEvent(event('a','t','travel_started',0,0,1,{
    operationalDay:'2026-11-17'
  })).errors.includes('operational_day_mismatch'));
  assert.ok(travel.validateTravelEvent(event('a','t','travel_started',0,0,1,{
    recordedAt:at(-1)
  })).errors.includes('recorded_before_occurrence'));
  assert.ok(travel.validateTravelEvent(event('a','t','travel_started',0,0,1,{
    at:'2026-11-18T15:61:00.000Z'
  })).errors.includes('occurred_at'));
});

test('sin tramos ni eventos: no fabrica tiempos, kilómetros o velocidades',()=>{
  const s=stats([],[]);
  assert.equal(s.quality,'empty');
  assert.equal(s.counts.completedTravels,0);
  assert.equal(s.travelDurationMs,null);
  assert.equal(s.meanTravelMs,null);
  assert.equal(s.roadDistanceMeters,null);
  assert.equal(s.equivalentRoadSpeedKmh,null);
  assert.equal(s.gpsAverageSpeedKmh,null);
  assert.equal(s.captureCoverage,'unverifiable');
});

test('dos tramos sintéticos: tiempos de eventos y solo distancia vial emparejada',()=>{
  const s=stats();
  assert.equal(s.counts.completedTravels,2);
  assert.equal(s.counts.matchedRoadSegments,2);
  assert.equal(s.travelDurationMs,27*60000);
  assert.equal(s.meanTravelMs,13.5*60000);
  assert.equal(s.medianTravelMs,13.5*60000);
  assert.equal(s.p90TravelMs,15*60000);
  assert.equal(s.roadDistanceMeters,3500);
  assert.equal(s.roadMatchedTravelMs,27*60000);
  assert.ok(Math.abs(s.equivalentRoadSpeedKmh-3500*3600/(27*60000))<1e-10);
  assert.equal(s.gpsDistanceMeters,null);
  assert.equal(s.gpsAverageSpeedKmh,null);
  assert.equal(s.captureCoverage,'unverifiable');
  assert.equal(s.trips[0].roadStatus,'synthetic_filtered');
  assert.equal(s.trips[1].roadStatus,'synthetic_filtered');
  assert.equal(s.quality,'coherent_sample');
});

test('sin distancia de ruta: tiempo registrado sí, kilómetros y velocidad no',()=>{
  const s=stats(trips(),[]);
  assert.equal(s.counts.completedTravels,2);
  assert.equal(s.travelDurationMs,27*60000);
  assert.equal(s.meanTravelMs,13.5*60000);
  assert.equal(s.roadDistanceMeters,null);
  assert.equal(s.equivalentRoadSpeedKmh,null);
  assert.equal(s.trips[0].roadStatus,'missing');
  assert.equal(s.quality,'partial');
});

test('solo una distancia emparejada: denominador exclusivo del mismo tramo',()=>{
  const s=stats(trips(),[road(0,1000)]);
  assert.equal(s.counts.matchedRoadSegments,1);
  assert.equal(s.roadDistanceMeters,1000);
  assert.equal(s.roadMatchedTravelMs,12*60000);
  assert.equal(s.equivalentRoadSpeedKmh,5);
  assert.equal(s.travelDurationMs,27*60000);
  assert.equal(s.quality,'partial');
});

test('distancia de un borrador sin filtro no se agrega ni se vuelve velocidad',()=>{
  const s=stats(trips(),[
    road(0,1000),road(1,2500,{filter:'unfiltered_draft'})
  ]);
  assert.equal(s.counts.draftRoadSegments,1);
  assert.equal(s.counts.matchedRoadSegments,1);
  assert.equal(s.roadDistanceMeters,1000);
  assert.equal(s.equivalentRoadSpeedKmh,5);
  assert.equal(s.trips[1].roadStatus,'unfiltered_draft');
  assert.equal(s.trips[1].roadDistanceMeters,null);
});

test('mismo snapshot pero paradas cambiadas: rechaza asociación vial',()=>{
  const s=stats(trips(),[
    road(0,1000,{fromStopKey:stops[2]}),road(1,2500)
  ]);
  assert.equal(s.counts.matchedRoadSegments,1);
  assert.equal(s.trips[0].roadStatus,'mismatch');
  assert.equal(s.trips[0].roadDistanceMeters,null);
  assert.ok(s.issues.some(x=>x.code==='road_pair_mismatch'));
});

test('ruta recalculada después de salir: distancia descartada',()=>{
  const s=stats(trips(),[
    road(0,1000,{calculatedAt:at(5)}),road(1,2500)
  ]);
  assert.equal(s.trips[0].roadStatus,'postdated');
  assert.equal(s.roadDistanceMeters,2500);
  assert.ok(s.issues.some(x=>x.code==='road_calculated_after_departure'));
});

test('snapshot distinto del viajado no se asocia a otro tramo',()=>{
  const s=stats(trips(),[
    road(0,1000,{routeSnapshotId:'reoptimized-2'}),road(1,2500)
  ]);
  assert.equal(s.trips[0].roadStatus,'missing');
  assert.equal(s.counts.matchedRoadSegments,1);
  assert.equal(s.roadDistanceMeters,2500);
});

test('sin referencia vial el tiempo de traslado sigue calculable',()=>{
  const events=trips().slice(0,2).map(e=>({
    ...e,routeSnapshotId:null,segmentIndex:null
  }));
  const s=stats(events,[road(0,1000)]);
  assert.equal(s.travelDurationMs,720000);
  assert.equal(s.roadDistanceMeters,null);
  assert.equal(s.counts.matchedRoadSegments,0);
});

test('dos tramos superpuestos no duplican tiempo ni distancia',()=>{
  const events=[
    event('s1','t1','travel_started',0,0,1),
    event('a1','t1','travel_arrived',15,0,1),
    event('s2','t2','travel_started',10,1,2),
    event('a2','t2','travel_arrived',20,1,2)
  ];
  const s=stats(events);
  assert.equal(s.counts.excludedOverlaps,2);
  assert.equal(s.counts.completedTravels,0);
  assert.equal(s.travelDurationMs,null);
  assert.equal(s.roadDistanceMeters,null);
  assert.ok(s.issues.some(x=>x.code==='overlapping_travels'));
});

test('dos tramos contiguos son válidos y no cuentan solape ficticio',()=>{
  const events=[
    event('s1','t1','travel_started',0,0,1),
    event('a1','t1','travel_arrived',15,0,1),
    event('s2','t2','travel_started',15,1,2),
    event('a2','t2','travel_arrived',20,1,2)
  ];
  const s=stats(events);
  assert.equal(s.counts.completedTravels,2);
  assert.equal(s.counts.excludedOverlaps,0);
  assert.equal(s.travelDurationMs,20*60000);
});

test('fin sin inicio e inicio sin llegada nunca generan traslado completo',()=>{
  const s=stats([event('x','orphan','travel_arrived',10),
    event('y','incomplete','travel_started',20)]);
  assert.equal(s.counts.completedTravels,0);
  assert.equal(s.travelDurationMs,null);
  assert.ok(s.issues.some(x=>x.code==='missing_or_duplicate_start'));
  assert.ok(s.issues.some(x=>x.code==='missing_or_duplicate_arrival'));
});

test('horas iguales o llegada anterior al inicio son inválidas',()=>{
  for(const arrival of [0,-10]){
    const s=stats([
      event('s','t','travel_started',0),
      event('a','t','travel_arrived',arrival,0,1,{
        recordedAt:at(5)
      })
    ],[road(0,1000)]);
    assert.equal(s.counts.completedTravels,0);
    assert.equal(s.travelDurationMs,null);
    assert.ok(s.issues.some(x=>x.code==='nonpositive_travel_interval'));
  }
});

test('un tramo iniciado y completado en paradas diferentes se descarta',()=>{
  const s=stats([event('s','t','travel_started',0,0,1),
    event('a','t','travel_arrived',10,1,2)]);
  assert.equal(s.counts.completedTravels,0);
  assert.ok(s.issues.some(x=>x.code==='travel_pair_mismatch'));
});

test('idempotencia: eventos duplicados exactamente iguales no suman tiempo',()=>{
  const e=trips();
  const s=stats([...e,e[0],{...e[3]}]);
  assert.equal(s.counts.completedTravels,2);
  assert.equal(s.counts.identicalDuplicates,2);
  assert.equal(s.travelDurationMs,27*60000);
});

test('colisión de eventId diferente descarta versiones en conflicto',()=>{
  const e=trips();
  const s=stats([...e,{...e[0],eventType:'travel_arrived'}]);
  assert.equal(s.counts.conflictingEventIds,1);
  assert.equal(s.counts.completedTravels,1);
  assert.ok(s.issues.some(x=>x.code==='conflicting_travel_event_id'));
});

test('regresión del reloj invalida todas las duraciones y velocidades',()=>{
  const e=trips();
  // e3 fue registrado más tarde pero declara una hora anterior a e2.
  e[2]={...e[2],at:at(5),recordedAt:at(40)};
  e[3]={...e[3],recordedAt:at(45)};
  const s=stats(e);
  assert.equal(s.quality,'invalid_timing');
  assert.equal(s.travelDurationMs,null);
  assert.equal(s.meanTravelMs,null);
  assert.equal(s.roadDistanceMeters,null);
  assert.equal(s.equivalentRoadSpeedKmh,null);
  assert.ok(s.trips.every(x=>x.durationMs===null));
  assert.ok(s.issues.some(x=>x.code==='clock_discontinuity'));
});

test('aislamiento: eventos y tramos de otra jornada/módulo no contaminan',()=>{
  const e=trips(),roads=[road(0,1000),road(1,2500)];
  e.push({...event('foreign','other','travel_started',40),journeyId:'other-journey'});
  roads.push({...road(2,3500),module:'cortes'});
  const s=stats(e,roads);
  assert.equal(s.counts.outsideScopeEvents,1);
  assert.equal(s.counts.outsideScopeRoad,1);
  assert.equal(s.counts.completedTravels,2);
});

test('el día operativo se valida por evento: permite tramo a través de 06:00 CR',()=>{
  const iso1='2026-11-18T11:58:00.000Z';
  const iso2='2026-11-18T12:03:00.000Z';
  const e=[
    event('s','cross','travel_started',0,0,1,{
      at:iso1,recordedAt:iso1,operationalDay:'2026-11-17',
      routeSnapshotId:null,segmentIndex:null
    }),
    event('a','cross','travel_arrived',0,0,1,{
      at:iso2,recordedAt:iso2,operationalDay:'2026-11-18',
      routeSnapshotId:null,segmentIndex:null
    })
  ];
  const s=stats(e,[]);
  assert.equal(s.counts.completedTravels,1);
  assert.equal(s.travelDurationMs,300000);
});

test('no mezcla eventos de distinta procedencia para mismo traslado',()=>{
  const s=stats([
    event('s','t','travel_started',0),
    event('a','t','travel_arrived',12,0,1,{source:'manual_ui'})
  ]);
  assert.equal(s.counts.completedTravels,0);
  assert.ok(s.issues.some(x=>x.code==='travel_pair_mismatch'));
});

test('no modifica arreglos ni eventos originales, aunque estén congelados',()=>{
  const ev=Object.freeze(trips().map(e=>Object.freeze(e)));
  const roads=Object.freeze([road(0,1000),road(1,2500)].map(Object.freeze));
  const a=JSON.stringify(ev),b=JSON.stringify(roads);
  const s=stats(ev,roads);
  assert.equal(s.counts.completedTravels,2);
  assert.equal(JSON.stringify(ev),a);
  assert.equal(JSON.stringify(roads),b);
});

test('entradas estructuralmente inválidas se rechazan con TypeError',()=>{
  assert.throws(()=>travel.summarizeTravel({},[],scope),TypeError);
  assert.throws(()=>travel.summarizeTravel([],null,scope),TypeError);
  assert.throws(()=>travel.summarizeTravel([],[],{}),TypeError);
});

test('no permite extender el resumen con coordenadas vía segmentos viales',()=>{
  const e=road(0,1200,{lat:9.9,lon:-84.2});
  const v=travel.validateRoadSegment(e);
  assert.equal(v.ok,false);
  assert.ok(v.errors.includes('unknown_field:lat'));
  assert.ok(v.errors.includes('unknown_field:lon'));
});

test('duplicar snapshot/índice con distancias distintas no escoge una arbitraria',()=>{
  const s=stats(trips().slice(0,2),[road(0,1000),road(0,2000)]);
  assert.equal(s.counts.conflictingRoadSegments,1);
  assert.equal(s.trips[0].roadStatus,'conflict');
  assert.equal(s.roadDistanceMeters,null);
  assert.equal(s.equivalentRoadSpeedKmh,null);
});

test('distancia cero es válida, velocidad equivalente 0 no GPS',()=>{
  const s=stats(trips().slice(0,2),[road(0,0)]);
  assert.equal(s.roadDistanceMeters,0);
  assert.equal(s.equivalentRoadSpeedKmh,0);
  assert.equal(s.gpsAverageSpeedKmh,null);
});

test('proveedor osrm no se confunde con ruta de ejemplo',()=>{
  const s=stats(trips().slice(0,2),[road(0,1000,{provider:'osrm'})]);
  assert.equal(s.trips[0].roadStatus,'estimated_filtered');
  assert.equal(s.gpsAverageSpeedKmh,null);
});
