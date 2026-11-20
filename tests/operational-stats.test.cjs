const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const stats=require('../operational-stats.js');

const day='2026-11-18';
const scope={journeyId:'2026-11-18:demanda:1795000000000',module:'demanda',operationalDay:day};
const keys={
  a:'ord_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  b:'ord_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  c:'ord_cccccccccccccccccccccccccccccccc'
};
function event(id,orderKey='a',minute=0,extra={}){
  const at=new Date(Date.UTC(2026,10,18,15,minute)).toISOString();
  return {
    schemaVersion:1,eventId:id,...scope,orderKey:keys[orderKey],
    eventType:'order_completed',at,recordedAt:at,source:'ui',quality:'observed',
    ...extra
  };
}
function correction(id,orderKey,minute,sourceEventId,type='order_reopened'){
  return event(id,orderKey,minute,{eventType:type,sourceEventId});
}
function summary(events,override=scope){return stats.summarizeJourney(events,override);}

test('contrato: API de cálculo determinista y sin acoplamiento a navegador o almacenamiento',()=>{
  assert.equal(stats.SCHEMA_VERSION,1);
  for(const type of ['order_completed','order_reopened','order_undo',
                     'journey_opened','journey_closed'])
    assert.ok(stats.EVENT_TYPES.includes(type));
  assert.ok(!stats.EVENT_TYPES.includes('travel_started'));
  const source=fs.readFileSync(path.join(__dirname,'../operational-stats.js'),'utf8');
  assert.doesNotMatch(source,/\blocalStorage\b|\bindexedDB\b|\bnavigator\b|\bfetch\s*\(|\bsetInterval\s*\(/);
});

test('día operativo CR: el corte ocurre exactamente a las 06:00 locales',()=>{
  assert.equal(stats.operationalDayFromIso('2026-11-18T11:59:59.999Z'),'2026-11-17');
  assert.equal(stats.operationalDayFromIso('2026-11-18T12:00:00.000Z'),'2026-11-18');
  assert.equal(stats.operationalDayFromIso('2026-01-01T08:30:00.000Z'),'2025-12-31');
  assert.equal(stats.operationalDayFromIso('2026-01-01T12:00:00.000Z'),'2026-01-01');
  assert.equal(stats.operationalDayFromIso('no-es-fecha'),null);
});

test('contrato: un evento correcto es aceptado',()=>{
  const x=stats.validateEvent(event('evt1'));
  assert.equal(x.ok,true);
  assert.equal(x.event.orderKey,keys.a);
  assert.equal(x.event.sourceEventId,null);
});

test('contrato: rechaza localización o medidor en lugar del identificador opaco',()=>{
  const e=event('evt2','a',0,{orderKey:'3400021408'});
  assert.ok(stats.validateEvent(e).errors.includes('order_key_not_opaque'));
  assert.ok(stats.validateEvent({...event('evt3'),direccion:'Cliente X'}).errors.includes('unknown_field:direccion'));
  assert.ok(stats.validateEvent({...event('evt4'),payload:{lat:9.9}}).errors.includes('payload_not_allowed_v1'));
});

test('contrato: no permite eventos GPS prematuros ni esquema ajeno',()=>{
  assert.ok(stats.validateEvent(event('evt5','a',0,{eventType:'travel_started'}))
    .errors.includes('event_type'));
  assert.ok(stats.validateEvent(event('evt6','a',0,{schemaVersion:2}))
    .errors.includes('schema_version'));
});

test('contrato: rechaza timestamps inexistentes, desfase y fechas de día imposibles',()=>{
  assert.ok(stats.validateEvent(event('evt7','a',0,{at:'2026-02-30T15:00:00.000Z'}))
    .errors.includes('occurred_at'));
  assert.ok(stats.validateEvent(event('evt8','a',0,{operationalDay:'2026-02-30'}))
    .errors.includes('operational_day'));
  assert.ok(stats.validateEvent(event('evt9','a',0,{operationalDay:'2026-11-17'}))
    .errors.includes('operational_day_mismatch'));
  assert.ok(stats.validateEvent(event('evt10','a',0,{recordedAt:'2026-11-18T14:59:59.999Z'}))
    .errors.includes('recorded_before_occurrence'));
});

test('contrato: la corrección exige fuente y una orden inequívoca',()=>{
  assert.ok(stats.validateEvent(event('evt11','a',1,{eventType:'order_undo'}))
    .errors.includes('correction_source_required'));
  assert.ok(stats.validateEvent(event('evt12','a',1,{sourceEventId:'evt11'}))
    .errors.includes('unexpected_source_event'));
  assert.ok(stats.validateEvent(event('evt13','a',1,{quality:'unknown'}))
    .errors.includes('quality'));
});

test('sin órdenes: no inventa intervalos, velocidad, traslados o distancias',()=>{
  const m=summary([]);
  assert.equal(m.counts.completedOrders,0);
  for(const k of ['firstCompletedAt','lastCompletedAt','observedWindowMs',
    'meanIntervalMs','medianIntervalMs','p90IntervalMs','completedOrdersPerHour',
    'attentionMs','travelMs','roadDistanceMeters','gpsDistanceMeters',
    'averageTravelSpeedKmh'])assert.equal(m[k],null,k);
  assert.deepEqual(m.intervalsMs,[]);
});

test('una sola orden: primera/última registradas, pero intervalo y tasa sin medir',()=>{
  const m=summary([event('a1')]);
  assert.equal(m.counts.completedOrders,1);
  assert.equal(m.firstCompletedAt,'2026-11-18T15:00:00.000Z');
  assert.equal(m.lastCompletedAt,m.firstCompletedAt);
  assert.equal(m.meanIntervalMs,null);
  assert.equal(m.observedWindowMs,null);
  assert.equal(m.completedOrdersPerHour,null);
});

test('tres órdenes: primera/última, media, mediana y p90 por rangos observados',()=>{
  const m=summary([event('c1','c',45),event('a1','a',0),event('b1','b',15)]);
  assert.equal(m.counts.completedOrders,3);
  assert.equal(m.counts.validIntervals,2);
  assert.equal(m.observedWindowMs,2700000);
  assert.deepEqual(m.intervalsMs,[900000,1800000]);
  assert.equal(m.meanIntervalMs,1350000);
  assert.equal(m.medianIntervalMs,1350000);
  assert.equal(m.p90IntervalMs,1800000);
  assert.equal(m.completedOrdersPerHour,4);
  assert.equal(m.travelMs,null);
  assert.equal(m.quality,'observed');
});

test('idempotencia: evento repetido idéntico no incrementa órdenes',()=>{
  const e=event('dup1');
  const m=summary([e,{...e}]);
  assert.equal(m.counts.duplicateEventIds,1);
  assert.equal(m.counts.validatedEvents,1);
  assert.equal(m.counts.completedOrders,1);
});

test('conflicto de eventId: excluye ambas versiones sin elegir arbitrariamente',()=>{
  const m=summary([event('same-id','a',0),event('same-id','b',10)]);
  assert.equal(m.counts.conflictingEventIds,1);
  assert.equal(m.counts.completedOrders,0);
  assert.ok(m.issues.some(x=>x.code==='conflicting_event_id'));
  assert.equal(m.quality,'incomplete');
});

test('dos gestiones sin reversión para una misma orden no se cuentan dos veces',()=>{
  const m=summary([event('once1','a',0),event('once2','a',10)]);
  assert.equal(m.counts.completedOrders,1);
  assert.ok(m.issues.some(x=>x.code==='duplicate_order_completion'));
});

test('reabrir la orden retira su finalización del estado efectivo',()=>{
  const m=summary([
    event('ra','a',0),
    event('rb','b',15),
    correction('undo-a','a',20,'ra','order_reopened')
  ]);
  assert.equal(m.counts.completedOrders,1);
  assert.equal(m.firstCompletedAt,'2026-11-18T15:15:00.000Z');
  assert.equal(m.observedWindowMs,null);
});

test('re-gestionar tras reabrir sustituye la primera finalización',()=>{
  const m=summary([
    event('ra','a',0),event('rb','b',15),
    correction('open-a','a',20,'ra'),
    event('ra-again','a',30)
  ]);
  assert.equal(m.counts.completedOrders,2);
  assert.equal(m.observedWindowMs,900000);
  assert.equal(m.meanIntervalMs,900000);
});

test('deshacer la última visita conserva las otras gestiones',()=>{
  const m=summary([
    event('ra','a',0),event('rb','b',15),
    correction('undo-b','b',20,'rb','order_undo')
  ]);
  assert.equal(m.counts.completedOrders,1);
  assert.equal(m.lastCompletedAt,'2026-11-18T15:00:00.000Z');
});

test('corrección obsoleta no invalida una segunda gestión posterior',()=>{
  const m=summary([
    event('ra','a',0),correction('open-a','a',1,'ra'),
    event('ra2','a',2),correction('open-again','a',3,'ra')
  ]);
  assert.equal(m.counts.completedOrders,1);
  assert.equal(m.firstCompletedAt,'2026-11-18T15:02:00.000Z');
  assert.ok(m.issues.some(x=>x.code==='stale_correction'));
});

test('corrección huérfana o de otra orden no altera el recuento',()=>{
  const m=summary([
    event('ra','a',0),correction('bad-1','b',3,'ra'),
    correction('bad-2','a',5,'not-found')
  ]);
  assert.equal(m.counts.completedOrders,1);
  assert.equal(m.issues.filter(x=>x.code==='orphan_correction').length,2);
});

test('igual timestamp no produce un intervalo ficticio ni división por cero',()=>{
  const m=summary([event('a1','a',0),event('b1','b',0)]);
  assert.equal(m.counts.completedOrders,2);
  assert.equal(m.observedWindowMs,0);
  assert.equal(m.counts.omittedNonpositiveIntervals,1);
  assert.equal(m.counts.validIntervals,0);
  assert.equal(m.meanIntervalMs,null);
  assert.equal(m.completedOrdersPerHour,null);
  assert.ok(m.issues.some(x=>x.code==='nonpositive_interval'));
});

test('deltas parciales: excluye ceros y declara cobertura incompleta',()=>{
  const m=summary([event('a1','a',0),event('b1','b',0),event('c1','c',10)]);
  assert.deepEqual(m.intervalsMs,[600000]);
  assert.equal(m.counts.validIntervals,1);
  assert.equal(m.counts.omittedNonpositiveIntervals,1);
  assert.equal(m.meanIntervalMs,600000);
});

test('reloj regresado: no publica medias ni velocidad como si fueran fiables',()=>{
  const a=event('a1','a',15);
  const b=event('b1','b',10,{recordedAt:'2026-11-18T15:20:00.000Z'});
  const m=summary([a,b]);
  assert.equal(m.counts.completedOrders,2);
  assert.equal(m.quality,'invalid_timing');
  assert.equal(m.observedWindowMs,null);
  assert.equal(m.meanIntervalMs,null);
  assert.equal(m.completedOrdersPerHour,null);
  assert.ok(m.issues.some(x=>x.code==='clock_discontinuity'));
});

test('filtrado por jornada y módulo: no mezcla órdenes de otras jornadas',()=>{
  const a=event('a1');
  const another=event('b1','b',10,{journeyId:'2026-11-18:demanda:other'});
  const otherModule=event('c1','c',12,{module:'residencial'});
  const m=summary([a,another,otherModule]);
  assert.equal(m.counts.completedOrders,1);
  assert.equal(m.counts.outsideScopeEvents,2);
});

test('jornada abierta y cerrada son eventos válidos pero no órdenes',()=>{
  const base=event('open','a',0,{eventType:'journey_opened',orderKey:null});
  const end=event('close','a',30,{eventType:'journey_closed',orderKey:null});
  const m=summary([base,end,event('a1','a',10)]);
  assert.equal(m.counts.completedOrders,1);
  assert.equal(m.counts.validatedEvents,3);
});

test('calidad estimada no se transforma en dato observado',()=>{
  const m=summary([event('a1','a',0,{quality:'estimated'})]);
  assert.equal(m.counts.completedOrders,0);
  assert.ok(m.issues.some(x=>x.code==='event_not_observed'));
});

test('eventos malformados se rechazan sin afectar órdenes verificadas',()=>{
  const m=summary([null,event('a1'),{eventId:'bad'},event('b1','b',10,{at:'wrong'})]);
  assert.equal(m.counts.completedOrders,1);
  assert.equal(m.counts.rejectedEvents,3);
  assert.equal(m.quality,'incomplete');
});

test('entradas y arreglo originales permanecen intactos',()=>{
  const a=Object.freeze(event('a1'));
  const b=Object.freeze(event('b1','b',10));
  const data=Object.freeze([b,a]);
  const m=summary(data);
  assert.equal(m.counts.completedOrders,2);
  assert.equal(data[0],b);
  assert.equal(data[1],a);
});

test('no admite datos que carezcan del alcance de jornada',()=>{
  assert.throws(()=>stats.summarizeJourney([],{}),/journeyId/);
  assert.throws(()=>stats.summarizeJourney(null,scope),/arreglo/);
});
