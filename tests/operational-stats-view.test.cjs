const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const stats=require('../operational-stats.js');
const view=require('../operational-stats-view.js');
const fixtures=require('../operational-stats-fixtures.js');

function model(name){
  const sample=fixtures.scenarios()[name];
  const summary=stats.summarizeJourney(sample.events,fixtures.scope);
  return {summary,model:view.makeViewModel(summary)};
}
function metric(vm,id){
  return vm.metrics.find(item=>item.id===id);
}
test('escenario coherente: métricas comprobables a partir de 4 eventos ficticios',()=>{
  const {summary,model:m}=model('normal');
  assert.equal(summary.counts.completedOrders,4);
  assert.equal(m.kind,'consistent');
  assert.equal(m.recordedOrders,4);
  assert.equal(m.captureCoverage,'No verificable');
  assert.equal(m.intervalCoverage,'3 de 3');
  assert.equal(metric(m,'window').value,'45 min');
  assert.equal(metric(m,'mean').value,'15 min');
  assert.equal(metric(m,'median').value,'15 min');
  assert.equal(metric(m,'p90').value,'18 min');
  assert.equal(metric(m,'rate').value,'5,3');
  assert.equal(m.intervals[0].durationMs,720000);
  assert.equal(m.intervals[1].durationMs,900000);
  assert.equal(m.intervals[2].durationMs,1080000);
  assert.equal(m.issueList.length,0);
  assert.equal(m.first,'09:00');
  assert.equal(m.last,'09:45');
});
test('intervalos calculables NO implican cobertura total de captura',()=>{
  const {model:m}=model('normal');
  assert.equal(m.intervalCoverage,'3 de 3');
  assert.equal(m.captureCoverage,'No verificable');
  assert.match(m.coverageExplanation,/NO mide la cobertura real/);
  assert.match(m.description,/NO confirma/);
});
test('evento inválido genera advertencia visible sin inventar que fue atendido',()=>{
  const {summary,model:m}=model('incomplete');
  assert.equal(summary.counts.rejectedEvents,1);
  assert.equal(m.kind,'partial');
  assert.equal(m.metadata.rejected,1);
  assert.equal(m.recordedOrders,4);
  assert.equal(metric(m,'mean').value,'15 min');
  assert.ok(m.issueList.some(i=>i.label==='Evento inválido excluido'&&i.count===1));
});
test('retroceso del reloj oculta métricas temporales aunque se hayan guardado gestiones',()=>{
  const {summary,model:m}=model('clock');
  assert.equal(summary.quality,'invalid_timing');
  assert.equal(m.kind,'invalid');
  assert.equal(m.recordedOrders,5);
  for(const id of ['window','mean','median','p90','rate']){
    assert.equal(metric(m,id).value,'No medido',id);
  }
  assert.equal(m.first,'No medido');
  assert.equal(m.last,'No medido');
  assert.equal(m.intervals.length,0);
  assert.ok(m.issueList.some(i=>i.label==='Posible retroceso del reloj'));
});
test('reapertura descuenta la orden y recalcula los intervalos sin duplicar',()=>{
  const {summary,model:m}=model('reopened');
  assert.equal(summary.counts.completedOrders,3);
  assert.equal(m.kind,'consistent');
  assert.equal(m.intervalCoverage,'2 de 2');
  assert.equal(metric(m,'mean').value,'22 min 30 s');
  assert.equal(metric(m,'median').value,'22 min 30 s');
  assert.equal(metric(m,'p90').value,'27 min');
});
test('cero eventos: no publica medias, tasas, horarios o porcentajes ficticios',()=>{
  const {summary,model:m}=model('empty');
  assert.equal(summary.counts.completedOrders,0);
  assert.equal(m.kind,'empty');
  assert.equal(m.intervalCoverage,'No aplica');
  assert.equal(m.captureCoverage,'No verificable');
  assert.equal(m.first,'No medido');
  assert.equal(m.last,'No medido');
  assert.equal(m.intervals.length,0);
  for(const id of ['window','mean','median','p90','rate'])
    assert.equal(metric(m,id).value,'No medido');
});
test('traslado, GPS, velocidad, atención y kilómetros siempre aparecen como No medido',()=>{
  for(const scenario of Object.keys(fixtures.scenarios())){
    const {model:m}=model(scenario);
    assert.equal(m.unmeasured.length,5);
    for(const x of m.unmeasured)assert.equal(x.value,'No medido');
  }
});
test('formato de duración no confunde horas y minutos; no devuelve falsos ceros',()=>{
  assert.equal(view.duration(0),'0 s');
  assert.equal(view.duration(30000),'30 s');
  assert.equal(view.duration(90000),'1 min 30 s');
  assert.equal(view.duration(5400000),'1 h 30 min');
  assert.equal(view.duration(null),'No medido');
  assert.equal(view.duration(-1),'No medido');
  assert.equal(view.duration(NaN),'No medido');
});
test('etiquetas de anomalía son fijas: no exponen identificadores de eventos',()=>{
  const list=view.countIssues([{code:'invalid_event',eventId:'private-123'},
    {code:'invalid_event',eventId:'private-456'},
    {code:'unknown-code',eventId:'private-789'}]);
  assert.deepEqual(list,[
    {label:'Evento inválido excluido',count:2},
    {label:'Incidencia no clasificada',count:1}
  ]);
  assert.doesNotMatch(JSON.stringify(list),/private-/);
});
test('contrato: el modelo no modifica los cálculos ni los eventos sintéticos',()=>{
  const sample=fixtures.scenarios().normal;
  const source=sample.events.map(event=>JSON.stringify(event));
  const raw=stats.summarizeJourney(sample.events,fixtures.scope);
  const before=JSON.stringify(raw);
  const m=view.makeViewModel(raw);
  assert.equal(JSON.stringify(raw),before);
  assert.deepEqual(sample.events.map(event=>JSON.stringify(event)),source);
  assert.equal(m.demoOnly,true);
});
test('no acepta resúmenes estructuralmente inválidos',()=>{
  assert.throws(()=>view.makeViewModel(null),/Resumen/);
  assert.throws(()=>view.makeViewModel({}),/Resumen/);
});
test('archivos de presentación carecen de acceso a almacenamiento, GPS y red',()=>{
  for(const file of [
    'operational-stats-view.js','operational-stats-fixtures.js',
    'operational-stats-demo.js'
  ]){
    const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
    const executable=source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
    assert.doesNotMatch(executable,/\blocalStorage\b|\bindexedDB\b|\bgetCurrentPosition\b|\bwatchPosition\b|\bfetch\s*\(/i,file);
  }
});
