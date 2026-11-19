const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const backupCode=fs.readFileSync(path.join(__dirname,'../backup.js'),'utf8');
const field=JSON.stringify([{orden:'FAKE-ORDER',status:'pending'}]);
const journal=JSON.stringify({
  version:1,secret:'a'.repeat(64),events:[{
    schemaVersion:1,eventId:'ev_fictitious',journeyId:'2026-01-01:cortes:111111',
    module:'cortes',operationalDay:'2026-01-01',
    orderKey:'ord_'+'b'.repeat(32),eventType:'order_completed',
    at:'2026-01-01T15:00:00.000Z',recordedAt:'2026-01-01T15:00:00.000Z',
    source:'test-ui',quality:'observed'
  }]
});

function setup(initial={},failKey=''){
  const values=new Map(Object.entries(initial)),elements=new Map();
  const el=id=>{
    if(!elements.has(id))elements.set(id,{textContent:'',disabled:false,
      style:{display:'none'},classList:{toggle(){}}});
    return elements.get(id);
  };
  const storage={
    get length(){return values.size},
    key:i=>[...values.keys()][i],
    getItem:k=>values.get(k)??null,
    setItem(k,v){if(k===failKey)throw Error('QuotaExceededError');values.set(k,v)},
    removeItem:k=>values.delete(k)
  };
  const ctx=vm.createContext({
    document:{getElementById:el,addEventListener(){}},localStorage:storage,
    window:{CNFLStore:{
      snapshot:async()=>{},exportDb:async()=>({kv:[],records:[]}),
      importDb:async()=>{},counts:async()=>({available:true,records:0,kv:0})
    }},
    location:{origin:'https://example.invalid'},confirm:()=>true,console,
    Blob,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},
    setTimeout(){},Date
  });
  vm.runInContext(backupCode,ctx);
  return {ctx,storage,values,el};
}
function fixture(items){
  return {format:'cnfl-campo-backup-v2',
    createdAt:'2026-01-01T18:00:00.000Z',items};
}
function file(contents){
  return {name:'backup-sintetico.json',text:async()=>JSON.stringify(contents)};
}

test('respaldo existente incluye la clave de métricas por prefijo cnfl_ sin modificarla',()=>{
  const h=setup({
    cnfl_work_orders:field,
    cnfl_operation_events_v1:journal
  });
  const keys=Array.from(h.ctx.cnflBackupKeys());
  assert.ok(keys.includes('cnfl_operation_events_v1'));
  const merged=h.ctx.backupItems({items:{
    cnfl_operation_events_v1:h.values.get('cnfl_operation_events_v1'),
    cnfl_work_orders:h.values.get('cnfl_work_orders')
  }});
  assert.equal(merged.cnfl_operation_events_v1,journal);
  assert.equal(merged.cnfl_work_orders,field);
});

test('restaurar estadísticas sintéticas no reemplaza órdenes existentes del teléfono',async()=>{
  const h=setup({cnfl_work_orders:field,cnfl_other_state:'unchanged'});
  await h.ctx.prepareRestore({target:{files:[file(fixture({
    cnfl_operation_events_v1:journal
  }))]}});
  assert.equal(h.el('restoreBtn').disabled,false);
  await h.ctx.restoreBackup();
  assert.equal(h.values.get('cnfl_operation_events_v1'),journal);
  assert.equal(h.values.get('cnfl_work_orders'),field);
  assert.equal(h.values.get('cnfl_other_state'),'unchanged');
});

test('al fallar restauración de métricas se preservan órdenes y estado previo',async()=>{
  const h=setup({cnfl_work_orders:field},'cnfl_operation_events_v1');
  await h.ctx.prepareRestore({target:{files:[file(fixture({
    cnfl_operation_events_v1:journal
  }))]}});
  await h.ctx.restoreBackup();
  assert.equal(h.values.get('cnfl_work_orders'),field);
  assert.equal(h.values.has('cnfl_operation_events_v1'),false);
  assert.match(h.el('restoreStatus').textContent,/No se pudo restaurar/);
});

test('la bitácora no elimina ni muta el historial de Cortes con estado propio',()=>{
  const h=setup({
    cnfl_order_history_v1:JSON.stringify([{orden:'TEST-1',localizacion:'0000000001',status:'avisado',monto:'2'}]),
    cnfl_operation_events_v1:journal
  });
  const before=h.values.get('cnfl_operation_events_v1');
  h.ctx.backupItems({items:{
    cnfl_operation_events_v1:before,
    cnfl_order_history_v1:h.values.get('cnfl_order_history_v1')
  }});
  assert.equal(h.values.get('cnfl_operation_events_v1'),before);
});

test('el espejo IndexedDB existente incluye la clave de métricas sin migración',()=>{
  const code=fs.readFileSync(path.join(__dirname,'../data-store.js'),'utf8');
  assert.match(code,/key\.startsWith\('cnfl_'\)/);
  assert.match(code,/store\.put\(\{key,value,updatedAt:/);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../operational-events.js'),'utf8'),
    /\bindexedDB\b|\bdeleteRecordsByPrefix\s*\(/);
});
