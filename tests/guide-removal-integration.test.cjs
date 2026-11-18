const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const journey=require('../journey.js');

const source=fs.readFileSync(path.join(__dirname,'../campo-shell.js'),'utf8');

function element(tag='div'){
  const classes=new Set(),attributes={};
  return {
    tag,children:[],className:'',hidden:false,disabled:false,checked:false,
    classList:{
      add(...names){names.forEach(x=>classes.add(x));},
      remove(...names){names.forEach(x=>classes.delete(x));},
      contains(name){return classes.has(name);},
      toggle(name,force){if(force===undefined)force=!classes.has(name);if(force)classes.add(name);else classes.delete(name);return force;}
    },
    append(...items){this.children.push(...items);},
    appendChild(child){this.children.push(child);},
    setAttribute(name,value){attributes[name]=value;},
    querySelectorAll(){return [];},
    querySelector(){return null;},
    addEventListener(){},
    contains(){return true;},
    focus(){}
  };
}
function fixture(module){
  const pages={cortes:'index.html',demanda:'lectura.html',residencial:'lectura-residencial.html',notificaciones:'notificaciones.html'};
  const values=new Map();
  const store={
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,value),
    removeItem:key=>values.delete(key),
    get length(){return values.size},
    key:i=>[...values.keys()][i]
  };
  journey.begin(store,module,new Date());
  const orders=JSON.stringify([{status:'pending'},{status:'read'}]);
  values.set('cnfl_work_orders',orders);
  values.set('cnfl_reading_orders_v2',JSON.stringify({orders:[{status:'pending'},{status:'read'}]}));
  values.set('cnfl_residential_reading_v1',JSON.stringify({orders:[{status:'pending'},{status:'read'}]}));
  values.set('cnfl_notificaciones_20261019_v2',JSON.stringify({done:{'loc2':true}}));

  const menu=element('button'),drawer=element('aside'),scrim=element('div');
  const header=element('header'),main=element('main'),summary=element('div'),cutsSummary=element('section');
  const body=element('body'),created=[];
  const nodes={cnflGlobalMenu:menu,cnflGlobalDrawer:drawer,cnflGlobalScrim:scrim,'tab-resumen':cutsSummary};
  const doc={
    body,title:'',
    getElementById(id){return nodes[id]||null;},
    createElement(tag){const node=element(tag);created.push(node);return node;},
    createTextNode(value){return {textContent:value};},
    querySelector(selector){
      if(selector==='.topbar, .app-header')return header;
      if(selector==='main')return main;
      if(selector==='#view-summary .summary-actions')return summary;
      return null;
    },
    querySelectorAll(){return [];},
    addEventListener(){},visibilityState:'visible'
  };
  let confirmed=0,nav='';
  const env={
    document:doc,localStorage:store,CNFLJourney:journey,
    location:{pathname:'/'+pages[module],search:'',assign(uri){nav=uri},replace(){}},
    navigator:{},
    confirm(){confirmed++;return true;},
    alert(){},addEventListener(){},
    URLSearchParams,
    CNFL_NOTIFICATION_STOPS:[['loc1'],['loc2']],
    switchTab(){},switchReadingTab(){},
    console:{warn(){},error(){},log(){}}
  };
  env.window=env;
  vm.runInNewContext(source,env,{filename:'campo-shell.js'});
  const host=module==='cortes'?cutsSummary:module==='notificaciones'?main:summary;
  return {env,host,created,store,values,orders,get confirmed(){return confirmed},get nav(){return nav}};
}
for(const mod of ['cortes','demanda','residencial','notificaciones']){
  test(mod+': elimina barra superpuesta, conserva cierre voluntario y datos',()=>{
    const app=fixture(mod);
    assert.equal(app.created.some(x=>x.className==='cnfl-journey-bar'),false);
    const panel=app.host.children.find(x=>x.className==='cnfl-finish-controls');
    assert.ok(panel,'cierre visible solo en pantalla del módulo');
    const label=panel.children.find(x=>x.tag==='label');
    const finish=panel.children.find(x=>x.tag==='button'&&x.textContent==='FINALIZAR JORNADA');
    assert.ok(label);
    assert.ok(finish);
    assert.equal(finish.disabled,true);
    assert.equal(journey.read(app.store).active.finishedAt,undefined);
    label.children[0].checked=true;
    label.children[0].onchange();
    assert.equal(finish.disabled,false);
    finish.onclick();
    assert.equal(app.confirmed,1);
    assert.equal(app.nav,'campo.html');
    const finished=journey.read(app.store).active;
    assert.ok(finished.finishedAt);
    assert.equal(finished.summary.total,2);
    assert.equal(finished.summary.done,1);
    assert.equal(finished.summary.pending,1);
    assert.equal(app.values.get('cnfl_work_orders'),app.orders);
  });
}
test('cierre cancelado no altera el estado y la jornada sigue activa',()=>{
  const app=fixture('cortes');
  app.env.confirm=()=>false;
  const panel=app.host.children.find(x=>x.className==='cnfl-finish-controls');
  const label=panel.children.find(x=>x.tag==='label');
  const finish=panel.children.find(x=>x.tag==='button'&&x.textContent==='FINALIZAR JORNADA');
  label.children[0].checked=true;
  label.children[0].onchange();
  finish.onclick();
  assert.equal(journey.read(app.store).active.finishedAt,undefined);
  assert.equal(app.nav,'');
});
