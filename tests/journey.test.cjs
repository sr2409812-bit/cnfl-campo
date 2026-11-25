const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
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
  // La jornada de ayer sin cerrar bloquea abrir otra hasta cerrarla.
  assert.equal(journey.begin(store,'cortes',after),null);
  assert.equal(journey.close(store,{total:1,done:0,pending:1},after,'next-day').closeReason,'next-day');
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

test('la barra guiada flotante desaparece y la navegación propia de cada módulo queda libre',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../journey.css'),'utf8');
  const shell=fs.readFileSync(path.join(__dirname,'../campo-shell.js'),'utf8');
  const map=fs.readFileSync(path.join(__dirname,'../mapa.js'),'utf8');
  assert.ok(css.includes('.cnfl-journey-bar{display:none!important}'));
  assert.ok(!css.includes('.bottom-nav{display:none'));
  assert.ok(!css.includes('position:fixed'));
  assert.ok(!shell.includes("className='cnfl-journey-bar'"));
  assert.ok(!map.includes("className='cnfl-journey-bar'"));
  assert.ok(shell.includes("className='cnfl-finish-controls'"));
  assert.ok(shell.includes("journey.close(localStorage"));
  assert.ok(map.includes("journey.step(localStorage,'work')"));
  for(const file of ['index.html','lectura.html','lectura-residencial.html',
                     'notificaciones.html','mapa.html','campo.html']){
    const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
    assert.ok(html.includes('journey.css?v=20261125-etapa2a'),file+' sin CSS nuevo');
    if(file!=='campo.html')
      assert.ok(html.includes('campo-shell.js?v=20261125-etapa2a'),file+' sin JS nuevo');
  }
  assert.ok(fs.readFileSync(path.join(__dirname,'../mapa.html'),'utf8').includes('mapa.js?v=20261118-no-guide1'));
});

test('etapa 2a: una sola jornada a la vez, cierre desde cualquier paso y jornadas guardadas',()=>{
  const now=new Date('2026-11-25T15:00:00Z');
  const store=memory({cnfl_reading_orders_v2:JSON.stringify({routeInfo:{routeId:'reading-1',name:'Ruta ficticia'},orders:[{status:'read'},{status:'pending'},{status:'unread'}]})});
  const a=journey.begin(store,'demanda',now);
  assert.equal(journey.begin(store,'cortes',now),null,'otro módulo queda bloqueado');
  assert.equal(journey.read(store).active.id,a.id);
  assert.equal(journey.begin(store,'demanda',now).id,a.id,'el mismo trabajo continúa');
  const p=journey.progress(store,'demanda');
  assert.deepEqual(p,{total:3,done:2,pending:1,routeName:'Ruta ficticia'});
  const closed=journey.close(store,{...p,report:'R'},now);
  assert.equal(closed.closedFromStep,'load');
  assert.equal(closed.summary.routeName,'Ruta ficticia');
  assert.equal(journey.close(store,{},now),null,'no se cierra dos veces');
  assert.equal(journey.saved(store).length,1);
  assert.equal(journey.begin(store,'cortes',now).module,'cortes');
  assert.equal(journey.saved(store)[0].module,'demanda');
  assert.equal(store.getItem('cnfl_reading_orders_v2').includes('Ruta ficticia'),true,'cerrar no toca las órdenes');
});

test('etapa 2a: las jornadas archivadas sin cerrar (datos viejos) también aparecen guardadas',()=>{
  const store=memory({cnfl_journeys_v1:JSON.stringify({active:null,history:[{id:'x',module:'demanda',date:'2026-11-24',step:'work'}]})});
  assert.equal(journey.saved(store).length,1);
  assert.equal(journey.saved(store)[0].finishedAt,undefined);
});

test('etapa 2a: Mi jornada redirige a la jornada abierta, sin elegir otra mientras dure',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../campo.html'),'utf8');
  assert.ok(html.includes("if(open&&!older&&!params.has('inicio')){location.replace(destination(a));return;}"));
  assert.ok(html.includes("document.getElementById('start').hidden=!!open;"));
  assert.ok(!html.includes('Quedará guardada en el historial'),'ya no se archiva en silencio');
  const shell=fs.readFileSync(path.join(__dirname,'../campo-shell.js'),'utf8');
  assert.ok(shell.includes('<a href="campo.html?inicio=1" data-module="jornada">'));
  assert.ok(shell.includes("location.replace(olderDay?'campo.html?inicio=1':journey.pages[openJourney.module]+'?jornada=1');"));
});
