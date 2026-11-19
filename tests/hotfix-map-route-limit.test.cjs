const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'../mapa.js'),'utf8');
const moduleNames=['cortes','demanda','residencial','notificaciones'];
const routeStoreKey='cnfl_manual_route_v1';
const routeKey=(mod,i)=>mod+':'+String(i).padStart(10,'0');
const route=(mod,n)=>Array.from({length:n},(_,i)=>routeKey(mod,i+1));

function setup({scope='demanda',saved=[],writeFails=false,includeAll=true}={}){
  const stored=new Map([[routeStoreKey,JSON.stringify(saved)]]);
  const rows=includeAll?moduleNames.flatMap(type=>
    Array.from({length:122},(_,i)=>({
      type,loc:String(i+1).padStart(10,'0'),done:false,
      lat:9.95,lon:-84.08,label:'Trabajo ficticio '+type+' '+(i+1)
    }))):[];
  const writes=[];
  const localStorage={
    getItem(k){return stored.get(k)??null},
    setItem(k,v){
      writes.push({key:k,value:v});
      if(writeFails)throw new Error('Cuota simulada');
      stored.set(k,v);
    }
  };
  const manualStatus={textContent:''},routeHint={textContent:''};
  const ctx={
    scope,inventory:false,localStorage,manualStatus,routeHint,
    names:{cortes:'Cortes',demanda:'Demanda',residencial:'Residencial',
      notificaciones:'Notificaciones'},
    document:{getElementById:()=>({hidden:false})},
    window:{CNFLFieldMapData:{collect:()=>rows}},
    preview:null,
    clearPreview(){ctx.renderCount++},
    renderCount:0,render(){ctx.renderCount++}
  };
  vm.createContext(ctx);
  const init=source.slice(
    source.indexOf('  const MAX_MANUAL_STOPS_PER_MODULE=120;'),
    source.indexOf('  const box='));
  const routeFunctions=source.slice(
    source.indexOf('  function key('),
    source.indexOf('  function focusJob('));
  assert.ok(init.includes('let manualKeys='));
  assert.ok(routeFunctions.includes('function addManual(o)'));
  vm.runInContext(init+'\n'+routeFunctions,ctx);
  const execute=js=>vm.runInContext(js,ctx);
  return {
    ctx,rows,writes,stored,manualStatus,routeHint,execute,
    keys(){return Array.from(execute('manualKeys'))},
    subset(){return Array.from(execute('routeKeys()'))},
    persisted(){return JSON.parse(stored.get(routeStoreKey))}
  };
}

test('reproduce 63 en Demanda + 57 en Cortes: agrega la 64 sin truncar otras rutas',()=>{
  const saved=[...route('cortes',57),...route('demanda',63)];
  const h=setup({saved});
  assert.equal(h.keys().length,120);
  assert.equal(h.execute('addManual('+JSON.stringify(h.rows.find(r=>r.type==='demanda'&&r.loc==='0000000064'))+')'),true);
  assert.equal(h.persisted().length,121);
  assert.equal(h.subset().length,64);
  assert.deepEqual(h.persisted().filter(k=>k.startsWith('cortes:')),route('cortes',57));
  assert.equal(h.writes.length,1);
  assert.equal(h.writes[0].key,routeStoreKey);
  assert.equal(h.ctx.renderCount,1);
});

test('límite por módulo: 119 en Demanda + 120 en cada otro módulo admite parada 120',()=>{
  const saved=[...route('cortes',120),...route('residencial',120),
    ...route('notificaciones',120),...route('demanda',119)];
  const h=setup({saved});
  assert.equal(h.keys().length,479);
  const newStop=h.rows.find(r=>r.type==='demanda'&&r.loc==='0000000120');
  assert.equal(h.execute('addManual('+JSON.stringify(newStop)+')'),true);
  assert.equal(h.persisted().length,480);
  assert.equal(h.subset().length,120);
  assert.deepEqual(h.persisted().filter(k=>k.startsWith('cortes:')),route('cortes',120));
  assert.deepEqual(h.persisted().filter(k=>k.startsWith('residencial:')),route('residencial',120));
  assert.deepEqual(h.persisted().filter(k=>k.startsWith('notificaciones:')),route('notificaciones',120));
});

test('parada 121 se rechaza para ese módulo aunque la ruta global tenga espacio',()=>{
  const h=setup({saved:route('demanda',120)});
  const extra=h.rows.find(r=>r.type==='demanda'&&r.loc==='0000000121');
  assert.equal(h.execute('addManual('+JSON.stringify(extra)+')'),false);
  assert.deepEqual(h.keys(),route('demanda',120));
  assert.deepEqual(h.persisted(),route('demanda',120));
  assert.equal(h.writes.length,0);
  assert.match(h.routeHint.textContent,/Demanda.*120 paradas/);
  assert.match(h.manualStatus.textContent,/Demanda.*120 paradas/);
});

test('no hay truncamiento global al cargar: preserva 240 claves de otros módulos',()=>{
  const saved=[...route('cortes',120),...route('residencial',120),...route('demanda',2)];
  const h=setup({saved});
  assert.deepEqual(h.keys(),saved);
  assert.equal(h.writes.length,0);
  h.execute('syncManual()');
  assert.deepEqual(h.keys(),saved);
  assert.equal(h.writes.length,0);
});

test('cambiar el orden en Demanda preserva exactamente el orden de Cortes',()=>{
  const saved=[...route('cortes',75),...route('demanda',63)];
  const h=setup({saved});
  const next=[routeKey('demanda',2),routeKey('demanda',1),...route('demanda',63).slice(2)];
  h.execute('changeManual('+JSON.stringify(next)+')');
  assert.deepEqual(h.persisted().filter(k=>k.startsWith('cortes:')),route('cortes',75));
  assert.deepEqual(h.subset(),next);
});

test('si falla localStorage no cambia la memoria ni muestra falso éxito',()=>{
  const saved=[...route('cortes',57),...route('demanda',63)];
  const h=setup({saved,writeFails:true});
  const next=h.rows.find(r=>r.type==='demanda'&&r.loc==='0000000064');
  assert.equal(h.execute('addManual('+JSON.stringify(next)+')'),false);
  assert.deepEqual(h.keys(),saved);
  assert.deepEqual(h.persisted(),saved);
  assert.equal(h.ctx.renderCount,0);
  assert.match(h.routeHint.textContent,/No se pudo guardar.*se conserva/);
  assert.match(h.manualStatus.textContent,/No se pudo guardar.*se conserva/);
});

test('el error se limpia después de guardar con éxito y el aviso queda visible al fallar',()=>{
  const h=setup({saved:route('demanda',120)});
  const extra=h.rows.find(r=>r.type==='demanda'&&r.loc==='0000000121');
  h.execute('addManual('+JSON.stringify(extra)+')');
  assert.match(h.routeHint.textContent,/admite hasta 120/);
  assert.equal(h.execute('changeManual('+JSON.stringify(route('demanda',119))+')'),true);
  assert.equal(h.execute('routeWarning'),'');
  assert.equal(h.subset().length,119);
  assert.equal(h.execute('addManual('+JSON.stringify(extra)+')'),true);
  assert.equal(h.subset().length,120);
});

test('el mismo módulo no inserta duplicados ni órdenes ya gestionadas',()=>{
  const h=setup({saved:route('demanda',2)});
  const row=h.rows.find(r=>r.type==='demanda'&&r.loc==='0000000001');
  assert.equal(h.execute('addManual('+JSON.stringify(row)+')'),false);
  const done={...row,loc:'0000000003',done:true};
  assert.equal(h.execute('addManual('+JSON.stringify(done)+')'),false);
  assert.deepEqual(h.persisted(),route('demanda',2));
  assert.equal(h.writes.length,0);
});

test('al sincronizar Demanda no modifica entradas ajenas aunque sus GPS no estén en el mapa',()=>{
  const saved=[...route('cortes',80),...route('notificaciones',50),...route('demanda',2)];
  const h=setup({saved,includeAll:false});
  h.execute('syncManual()');
  assert.deepEqual(h.persisted().filter(k=>k.startsWith('cortes:')),route('cortes',80));
  assert.deepEqual(h.persisted().filter(k=>k.startsWith('notificaciones:')),route('notificaciones',50));
  // Los pendientes inválidos de Demanda siguen el comportamiento preexistente;
  // esta prueba confirma que jamás se hace un recorte global de 120.
});

for(const scope of moduleNames){
  test(scope+': 120 rutas del mismo módulo no bloquean 1 de otro módulo',()=>{
    const others=moduleNames.filter(m=>m!==scope);
    const saved=[...route(others[0],120),...route(scope,1)];
    const h=setup({saved,scope});
    const newStop=h.rows.find(r=>r.type===scope&&r.loc==='0000000002');
    assert.equal(h.execute('addManual('+JSON.stringify(newStop)+')'),true);
    assert.equal(h.subset().length,2);
    assert.deepEqual(h.persisted().filter(k=>k.startsWith(others[0]+':')),route(others[0],120));
  });
}

test('solo se escribe la clave de ruta manual; no hay alteración de órdenes o históricos',()=>{
  const h=setup({saved:route('demanda',2)});
  const newStop=h.rows.find(r=>r.type==='demanda'&&r.loc==='0000000003');
  h.execute('addManual('+JSON.stringify(newStop)+')');
  assert.deepEqual([...new Set(h.writes.map(x=>x.key))],[routeStoreKey]);
  for(const forbidden of ['cnfl_reading_orders_v2','cnfl_work_orders','cnfl_order_history_v1',
    'cnfl_residential_reading_v1','cnfl_journeys_v1']){
    assert.equal(h.stored.has(forbidden),false,forbidden);
  }
});
