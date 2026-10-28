const test=require('node:test');
const assert=require('node:assert/strict');
const {snapshot,csv}=require('../cuts-liquidation.js');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

test('el cierre separa pendientes y agrupa todos los resultados sin cambiar las órdenes',()=>{
  const orders=[
    {localizacion:'20',status:'pending'},
    {localizacion:'10',status:'cortado',orden:'2'},
    {localizacion:'05',status:'avisado',orden:'1'},
    {localizacion:'30',status:'directo',orden:'3'}
  ];
  const report=snapshot(orders);
  assert.equal(report.total,4);
  assert.equal(report.managed,3);
  assert.equal(report.pending,1);
  assert.deepEqual(report.rows.map(row=>row.orden),['1','2','3']);
  assert.deepEqual(report.groups.filter(group=>group.rows.length).map(group=>group.key),['cortado','avisado','directo']);
  assert.equal(orders[0].status,'pending');
});

test('CSV conserva ceros en el archivo, escapa observaciones y omite pendientes',()=>{
  const report=snapshot([
    {status:'pending',orden:'999'},
    {status:'no_acceso',localizacion:'0012345678',orden:'000123',nis:'0011',medidor:'000099',observaciones:'Portón "cerrado",\nvolver'}
  ]);
  const output=csv(report);
  assert.ok(output.startsWith('\uFEFF'));
  assert.match(output,/"0012345678","000123","0011","000099"/);
  assert.match(output,/"Portón ""cerrado"", volver"/);
  assert.doesNotMatch(output,/999/);
});

test('CSV neutraliza texto que una hoja de cálculo interpretaría como fórmula',()=>{
  const report=snapshot([{status:'avisado',localizacion:'01',observaciones:'=HYPERLINK("x")'}]);
  assert.match(csv(report),/"'=HYPERLINK\(""x""\)"/);
});

test('la pantalla de cierre muestra resultados y permite volver a revisar la orden',()=>{
  const elements=new Map(['liquidationSummaryText','closeoutMetrics','closeoutGroups','orderSearchInput','btnFilterAll'].map(id=>[id,{innerHTML:'',innerText:'',value:'',classList:{add(){},remove(){}}}]));
  const context=vm.createContext({
    CNFLCutsLiquidation:{snapshot,csv},
    document:{getElementById:id=>elements.get(id)||null,querySelectorAll:()=>[{classList:{add(){},remove(){}}}],addEventListener(){}},
    localStorage:{getItem:()=>null,setItem(){}},
    addEventListener(){},console,navigator:{},setTimeout,Date
  });
  context.window=context;
  context.window.scrollTo=()=>{};
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),context);
  vm.runInContext('workOrders=[{status:"cortado",localizacion:"00123",orden:"745",nis:"09",medidor:"34"},{status:"pending",localizacion:"00456"}]',context);
  context.updateLiquidation();
  assert.match(elements.get('closeoutMetrics').innerHTML,/>1<\/strong><span>GESTIONADAS/);
  assert.match(elements.get('closeoutGroups').innerHTML,/Localización 00123/);
  assert.doesNotMatch(elements.get('closeoutGroups').innerHTML,/00456/);
  assert.doesNotMatch(elements.get('liquidationSummaryText').innerText,/Técnico: Ramírez Artavia/);
});
