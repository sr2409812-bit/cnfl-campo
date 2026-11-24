const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sw=require('../operational-capture-switch.js');

// Almacenamiento sintético en memoria; nunca el localStorage del teléfono.
function memory(initial={}){
  const map=new Map(Object.entries(initial));
  return {
    map,
    getItem:k=>map.has(k)?map.get(k):null,
    setItem:(k,v)=>{map.set(k,String(v));},
    removeItem:k=>map.delete(k)
  };
}
const now=new Date('2026-11-23T20:00:00.000Z');

test('capa 0: apagado por defecto cuando no hay valor guardado',()=>{
  const s=memory();
  assert.equal(sw.isEnabled(s),false);
  assert.deepEqual(sw.read(s),{enabled:false,changedAt:null,source:'default'});
});

test('capa 0: encender y apagar persiste solo su propia clave',()=>{
  const s=memory({cnfl_work_orders:'[{"ficticio":true}]'});
  const before=s.map.get('cnfl_work_orders');
  assert.deepEqual(sw.setEnabled(s,true,now),{ok:true,enabled:true,changedAt:'2026-11-23T20:00:00.000Z'});
  assert.equal(sw.isEnabled(s),true);
  assert.equal(sw.setEnabled(s,false,now).ok,true);
  assert.equal(sw.isEnabled(s),false);
  assert.equal(s.map.get('cnfl_work_orders'),before);
  assert.deepEqual([...s.map.keys()].sort(),['cnfl_operation_capture_v1','cnfl_work_orders']);
});

test('capa 0: valor dañado o de otra versión equivale a apagado',()=>{
  for(const bad of ['no-json','[]','null','{"version":2,"enabled":true,"changedAt":null}',
    '{"version":1,"enabled":"true","changedAt":null}','{"version":1,"enabled":true,"changedAt":5}']){
    const s=memory({cnfl_operation_capture_v1:bad});
    assert.equal(sw.isEnabled(s),false,bad);
  }
});

test('capa 0: almacenamiento que falla no lanza errores y queda apagado',()=>{
  const broken={getItem(){throw Error('bloqueado');},setItem(){throw Error('cuota');}};
  assert.equal(sw.isEnabled(broken),false);
  assert.equal(sw.read(broken).source,'unavailable');
  assert.deepEqual(sw.setEnabled(broken,true,now),{ok:false,error:'storage_unavailable'});
  assert.equal(sw.isEnabled(null),false);
});

test('capa 0: setEnabled rechaza valores que no son booleanos',()=>{
  const s=memory();
  assert.deepEqual(sw.setEnabled(s,'si',now),{ok:false,error:'invalid_value'});
  assert.equal(s.map.size,0);
});

test('capa 0: guard no ejecuta la captura con el interruptor apagado',()=>{
  const s=memory();
  let calls=0;
  assert.equal(sw.guard(s,()=>{calls++;return true;}),false);
  assert.equal(calls,0);
});

test('capa 0: guard ejecuta con el interruptor encendido y nunca propaga errores',async()=>{
  const s=memory();
  sw.setEnabled(s,true,now);
  assert.equal(sw.guard(s,()=>'capturado'),'capturado');
  assert.equal(sw.guard(s,()=>{throw Error('falla de medición');}),false);
  assert.equal(await sw.guard(s,()=>Promise.reject(Error('falla asíncrona'))),false);
  assert.equal(sw.guard(s,'no-funcion'),false);
});

const PAGES=['index.html','lectura.html','lectura-residencial.html','notificaciones.html','mapa.html'];

test('capa 2: las cinco páginas de trabajo cargan interruptor, motor y captura en ese orden',()=>{
  const root=path.join(__dirname,'..');
  for(const page of PAGES){
    const html=fs.readFileSync(path.join(root,page),'utf8');
    const sw=html.indexOf('operational-capture-switch.js?v=');
    const st=html.indexOf('operational-stats.js?v=');
    const ev=html.indexOf('operational-events.js?v=');
    const shell=html.indexOf('campo-shell.js?v=');
    assert.ok(sw>0&&st>sw&&ev>st,page+': orden de scripts');
    assert.ok(shell>ev,page+': campo-shell después de la captura');
  }
});

test('capa 2: el service worker precarga los tres scripts de medición',()=>{
  const sw=fs.readFileSync(path.join(__dirname,'..','sw.js'),'utf8');
  const core=sw.slice(sw.indexOf('CORE_ASSETS'),sw.indexOf('OPTIONAL_ASSETS'));
  for(const f of ['operational-capture-switch.js','operational-stats.js','operational-events.js'])
    assert.ok(core.includes("'./"+f+"'"),f);
});

test('capa 4: el único control para encender la medición es la tarjeta del cronómetro y pide confirmación',()=>{
  const root=path.join(__dirname,'..');
  const users=fs.readdirSync(root).filter(f=>/\.(html|js)$/.test(f)&&f!=='operational-capture-switch.js')
    .filter(f=>/setEnabled\(/.test(fs.readFileSync(path.join(root,f),'utf8')));
  assert.deepEqual(users,['operational-timer-ui.js']);
  const ui=fs.readFileSync(path.join(root,'operational-timer-ui.js'),'utf8');
  const toggle=ui.slice(ui.indexOf('function toggle('),ui.indexOf('function refresh('));
  assert.ok(toggle.indexOf('confirm(')>=0&&toggle.indexOf('confirm(')<toggle.indexOf('SW.setEnabled('),'confirmar antes de cambiar');
});
