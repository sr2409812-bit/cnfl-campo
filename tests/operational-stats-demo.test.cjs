const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const stats=require('../operational-stats.js');
const view=require('../operational-stats-view.js');
const fixtures=require('../operational-stats-fixtures.js');

const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

class Element{
  constructor(){
    this.children=[];this.dataset={};this.style={};this.hidden=false;
    this.textContent='';this.className='';this.attrs={};this.handlers={};
  }
  append(...children){this.children.push(...children)}
  replaceChildren(...children){this.children=[...children]}
  setAttribute(key,value){this.attrs[key]=value}
  addEventListener(name,handler){this.handlers[name]=handler}
}
function environment(){
  const els=new Map(),names=['normal','incomplete','clock','reopened','empty'];
  const buttons=names.map(s=>{const el=new Element();el.dataset.scenario=s;return el});
  const doc={
    getElementById(id){if(!els.has(id))els.set(id,new Element());return els.get(id)},
    createElement(){return new Element()},
    querySelectorAll(selector){return selector==='[data-scenario]'?buttons:[]}
  };
  const root={
    document:doc,CNFLOperationalStats:stats,
    CNFLOperationalStatsView:view,
    CNFLStatsDemoFixtures:fixtures
  };
  Object.defineProperty(root,'localStorage',{get(){throw Error('Acceso real prohibido')}});
  Object.defineProperty(root,'indexedDB',{get(){throw Error('Acceso real prohibido')}});
  Object.defineProperty(root,'navigator',{get(){throw Error('GPS prohibido')}});
  vm.runInNewContext(read('operational-stats-demo.js'),{window:root},{
    filename:'operational-stats-demo.js'
  });
  return {get:doc.getElementById.bind(doc),buttons,
    click(name){buttons.find(b=>b.dataset.scenario===name).handlers.click()}};
}
test('panel arranca en escenario normal ficticio sin leer datos del teléfono',()=>{
  const app=environment();
  assert.equal(app.get('qualityTitle').textContent,'Registros temporalmente coherentes');
  assert.equal(app.get('qualityPanel').dataset.kind,'consistent');
  assert.equal(app.get('coverageCapture').textContent,'No verificable');
  assert.equal(app.get('metricCards').children.length,6);
  assert.equal(app.get('intervalList').children.length,3);
  assert.equal(app.buttons[0].attrs['aria-pressed'],'true');
  assert.equal(app.get('noIssues').hidden,true);
});
test('cambiar a muestra incompleta presenta incidencia y advertencia',()=>{
  const app=environment();
  app.click('incomplete');
  assert.equal(app.get('qualityPanel').dataset.kind,'partial');
  assert.equal(app.get('eventWarnings').textContent,'1');
  assert.equal(app.get('qualityIssues').children.length,1);
  assert.equal(app.get('coverageCapture').textContent,'No verificable');
  assert.equal(app.buttons[1].attrs['aria-pressed'],'true');
  assert.equal(app.buttons[0].attrs['aria-pressed'],'false');
});
test('reloj inconsistente oculta intervalos y no publica promedio engañoso',()=>{
  const app=environment();
  app.click('clock');
  assert.equal(app.get('qualityPanel').dataset.kind,'invalid');
  assert.equal(app.get('intervalList').children.length,0);
  assert.equal(app.get('noIntervals').hidden,false);
  const card=app.get('metricCards').children.find(c=>
    c.children[0].textContent==='Promedio entre gestiones');
  assert.equal(card.children[1].textContent,'No medido');
  assert.equal(app.get('firstTime').textContent,'No medido');
});
test('sin datos no inventa ninguna estadística ni intervalo',()=>{
  const app=environment();
  app.click('empty');
  assert.equal(app.get('qualityPanel').dataset.kind,'empty');
  assert.equal(app.get('intervalList').children.length,0);
  assert.equal(app.get('coverageIntervals').textContent,'No aplica');
  assert.equal(app.get('coverageCapture').textContent,'No verificable');
});
test('reapertura actualiza valores sin insertar ni exponer identificadores reales',()=>{
  const app=environment();
  app.click('reopened');
  const card=app.get('metricCards').children.find(c=>
    c.children[0].textContent==='Órdenes en el registro');
  assert.equal(card.children[1].textContent,'3');
  const allText=app.get('metricCards').children.map(c=>c.children.map(i=>i.textContent).join(' ')).join(' ');
  assert.doesNotMatch(allText,/ord_[a-f0-9]{32}|demo-event-/);
});
test('standalone: ningún módulo de trabajo enlaza al laboratorio o a sus fixtures',()=>{
  for(const file of ['index.html','lectura.html','lectura-residencial.html',
    'notificaciones.html','mapa.html','campo.html','sw.js']){
    const source=read(file);
    assert.ok(!source.includes('estadisticas-demo.html'),file);
    assert.ok(!source.includes('operational-stats-fixtures.js'),file);
    assert.ok(!source.includes('operational-stats-demo.js'),file);
    assert.ok(!source.includes('operational-stats-view.js'),file);
  }
});
test('HTML de laboratorio incluye scripts propios, sin almacenamiento ni GPS',()=>{
  const html=read('estadisticas-demo.html');
  assert.match(html,/<!doctype html>/i);
  assert.match(html,/SOLO DATOS FICTICIOS/);
  assert.match(html,/aria-live="polite"/);
  assert.match(html,/name="viewport"/);
  assert.match(html,/operational-stats\.js/);
  assert.match(html,/operational-stats-view\.js/);
  assert.match(html,/operational-stats-fixtures\.js/);
  assert.match(html,/operational-stats-demo\.js/);
  assert.doesNotMatch(html,/operational-events\.js|data-store\.js|journey\.js|serviceWorker|localStorage|indexedDB|<iframe/i);
  assert.doesNotMatch(html,/https?:\/\//i);
});
test('CSS del laboratorio no contiene barras fijas, overlays ni navegación superpuesta',()=>{
  const css=read('estadisticas-demo.css');
  assert.doesNotMatch(css,/position\s*:\s*(?:fixed|sticky|absolute)/i);
  assert.match(css,/min-height:45px/);
  assert.match(css,/max-width:330px/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.match(css,/focus-visible/);
});
test('no se construye HTML interpolado ni se cargan recursos remotos',()=>{
  const code=read('operational-stats-demo.js');
  assert.doesNotMatch(code,/innerHTML|outerHTML|insertAdjacentHTML|createContextualFragment/);
  assert.doesNotMatch(code,/fetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|indexedDB/);
  assert.match(code,/\.textContent\s*=/);
});
