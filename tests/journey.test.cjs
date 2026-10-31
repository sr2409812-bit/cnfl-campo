const test=require('node:test');
const assert=require('node:assert/strict');
const journey=require('../journey.js');
function memory(initial={}){
  const rows=new Map(Object.entries(initial));
  return {getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value),rows};
}
test('la jornada cambia a las seis de Costa Rica sin borrar las órdenes',()=>{
  const store=memory({cnfl_work_orders:'[{"orden":"123"}]'});
  const before=new Date('2026-10-31T11:59:00Z'),after=new Date('2026-10-31T12:00:00Z');
  assert.equal(journey.stamp(before),'2026-10-30');
  assert.equal(journey.stamp(after),'2026-10-31');
  journey.begin(store,'cortes',before);
  const next=journey.begin(store,'cortes',after);
  assert.equal(next.step,'load');
  assert.equal(journey.read(store).history.length,1);
  assert.equal(store.getItem('cnfl_work_orders'),'[{"orden":"123"}]');
});
test('continuar jornada, cerrar reporte y separar módulos',()=>{
  const store=memory(),now=new Date('2026-10-31T15:00:00Z');
  const first=journey.begin(store,'demanda',now);
  assert.equal(journey.begin(store,'demanda',now).id,first.id);
  journey.step(store,'map',now);journey.step(store,'work',now);journey.step(store,'report',now);
  journey.confirmReport(store,true);
  assert.equal(journey.read(store).active.reportConfirmed,true);
  journey.finish(store,{total:3,done:2,pending:1,report:'Control'},now);
  assert.equal(journey.read(store).active.report,'Control');
  assert.equal(journey.begin(store,'cortes',now).module,'cortes');
  assert.equal(journey.read(store).history[0].module,'demanda');
});
test('notificaciones archiva avance antes de reiniciar el día',()=>{
  const key='cnfl_notificaciones_20261019_v2';
  const store=memory({[key]:JSON.stringify({done:{123:true},order:['123'],index:1})});
  journey.prepareNotifications(store,'2026-10-31');
  assert.deepEqual(JSON.parse(store.getItem(key)).done,{});
  assert.deepEqual(JSON.parse(store.getItem('cnfl_notification_daily_history_v1'))[0].done,{123:true});
  journey.prepareNotifications(store,'2026-10-31');
  assert.equal(JSON.parse(store.getItem('cnfl_notification_daily_history_v1')).length,1);
});
