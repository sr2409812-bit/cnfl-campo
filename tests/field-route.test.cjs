const test=require('node:test');
const assert=require('node:assert/strict');
const {arrange,read}=require('../field-route.js');

test('el mismo plan ordena lectura por tipo y conserva pendientes sin GPS al final',()=>{
  const a={localizacion:'0000000001',status:'pending'},b={localizacion:'0000000002',status:'pending'},
    c={localizacion:'0000000003',status:'pending'},done={localizacion:'0000000004',status:'read'};
  const source=[a,done,b,c];
  const keys=['cortes:0000000001','demanda:0000000003','residencial:0000000002','demanda:0000000001'];
  const result=arrange(source,keys,'demanda',o=>o.status!=='read');
  assert.deepEqual(result.orders,[c,a,b,done]);
  assert.equal(result.chosen,2);
  assert.deepEqual(source,[a,done,b,c]);
});

test('notificaciones usa su propio orden dentro de una ruta mixta',()=>{
  const a={localizacion:'020',done:false},b={localizacion:'040',done:false},done={localizacion:'060',done:true};
  const result=arrange([a,done,b],['notificaciones:040','cortes:100','notificaciones:020'],'notificaciones',o=>!o.done);
  assert.deepEqual(result.orders,[b,a,done]);
  assert.equal(result.chosen,2);
});

test('lectura de claves antiguas o rotas no altera el trabajo',()=>{
  assert.deepEqual(read({getItem:()=>'{'}),[]);
  assert.deepEqual(read({getItem:()=>JSON.stringify(['demanda:1',null,42])}),['demanda:1']);
});
