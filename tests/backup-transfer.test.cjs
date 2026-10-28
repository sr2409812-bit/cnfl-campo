const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const code=fs.readFileSync(path.join(__dirname,'../backup.js'),'utf8');
function setup(initial={},failKey=''){
  const values=new Map(Object.entries(initial));
  const elements=new Map();
  const el=id=>{
    if(!elements.has(id))elements.set(id,{textContent:'',disabled:false,style:{display:'none'},classList:{toggle(){}}});
    return elements.get(id);
  };
  const storage={
    get length(){return values.size},
    key:i=>[...values.keys()][i],
    getItem:k=>values.get(k)??null,
    setItem(k,v){if(k===failKey)throw new Error('QuotaExceededError');values.set(k,v)},
    removeItem:k=>values.delete(k)
  };
  const context=vm.createContext({
    document:{getElementById:el,addEventListener(){}},localStorage:storage,
    window:{CNFLStore:{snapshot:async()=>{},exportDb:async()=>({kv:[],records:[]}),importDb:async()=>{},counts:async()=>({available:true,records:0,kv:0})}},
    location:{origin:'https://example.test'},confirm:()=>true,console,
    Blob,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},setTimeout(){},
    Date
  });
  vm.runInContext(code,context);
  return {context,el,values};
}
function backup(items,extra={}){
  return {format:'cnfl-campo-backup-v2',createdAt:'2026-10-28',items,...extra};
}
function file(data){return {name:'respaldo.recibido',text:async()=>JSON.stringify(data)};}

test('restaura un archivo recibido aunque no tenga extensión .json',async()=>{
  const {context,el,values}=setup();
  const data=backup({cnfl_work_orders:JSON.stringify([{orden:'1'}]),cnfl_geocache:JSON.stringify({a:{lat:9}})});
  await context.prepareRestore({target:{files:[file(data)]}});
  assert.match(el('restoreStatus').textContent,/1 cortes · 0 demanda · 0 residencial · 1 GPS/);
  assert.equal(el('restoreBtn').disabled,false);
  await context.restoreBackup();
  assert.equal(JSON.parse(values.get('cnfl_work_orders'))[0].orden,'1');
  assert.equal(el('afterRestore').style.display,'block');
});

test('rechaza un respaldo vacío con una explicación visible',async()=>{
  const {context,el}=setup();
  await context.prepareRestore({target:{files:[file(backup({}))]}});
  assert.match(el('restoreStatus').textContent,/está vacío/);
  assert.equal(el('restoreBtn').disabled,true);
});

test('revierte claves modificadas si el navegador rechaza el almacenamiento',async()=>{
  const {context,el,values}=setup({cnfl_geocache:'anterior'},'cnfl_work_orders');
  const data=backup({cnfl_geocache:'nuevo',cnfl_work_orders:'[{"orden":"1"}]'});
  await context.prepareRestore({target:{files:[file(data)]}});
  await context.restoreBackup();
  assert.equal(values.get('cnfl_geocache'),'anterior');
  assert.equal(el('restoreBtn').disabled,false);
  assert.match(el('restoreStatus').textContent,/No se pudo restaurar/);
});
