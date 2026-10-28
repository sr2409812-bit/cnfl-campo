const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

function setup(initial={}){
  const store=new Map(Object.entries(initial).map(([key,value])=>[key,JSON.stringify(value)]));
  const result={innerHTML:'',innerText:''},count={innerText:''};
  const context=vm.createContext({
    localStorage:{getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)},
    document:{addEventListener(){},getElementById:id=>id==='historyResults'?result:id==='historyCount'?count:null},
    addEventListener(){},console
  });
  context.window=context;
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),context);
  return {context,store,result};
}

test('la memoria conserva referencias y GPS sin guardar montos ni estados',()=>{
  const {context,store,result}=setup();
  const order={orden:'74574085',localizacion:'9000723660',medidor:'850111',cliente:'Cliente ejemplo',
    direccion:'Dirección ejemplo',monto:'349990',status:'avisado',lat:9.93,lon:-84.08};
  assert.equal(context.archiveOrdersToHistory([order]),1);
  const row=JSON.parse(store.get('cnfl_order_history_v1'))[0];
  assert.equal(row.monto,undefined);
  assert.equal(row.status,undefined);
  assert.equal(row.localizacion,order.localizacion);
  assert.equal(row.lat,order.lat);
  context.renderOrderHistory();
  assert.match(result.innerHTML,/Cliente ejemplo/);
  assert.doesNotMatch(result.innerHTML,/349990|AVISADO|₡/);
});

test('la memoria anterior se limpia al abrirla sin alterar la jornada activa',()=>{
  const date=new Date();
  const stamp=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  const old={historyDate:stamp,orden:'7',localizacion:'1234567890',monto:'999',status:'cortado'};
  const {context,store}=setup({cnfl_order_history_v1:[old]});
  const loaded=context.cnflHistoryLoad();
  assert.equal(loaded[0].monto,undefined);
  assert.equal(loaded[0].status,undefined);
  assert.equal(JSON.parse(store.get('cnfl_order_history_v1'))[0].monto,undefined);
  assert.equal(context.getStatusLabel('cortado'),'[CORTADO]');
});
