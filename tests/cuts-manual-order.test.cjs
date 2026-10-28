const test=require('node:test');
const assert=require('node:assert/strict');
const {arrange}=require('../cuts-manual-order.js');

test('la ruta manual define el orden de cortes pendientes y conserva los demás',()=>{
  const a={localizacion:'0000000001',status:'pending'},b={localizacion:'0000000002',status:'pending'},
    c={localizacion:'0000000003',status:'pending'},done={localizacion:'0000000004',status:'cortado'};
  const source=[a,done,b,c];
  const result=arrange(source,['cortes:0000000003','notificaciones:123','cortes:0000000001']);
  assert.deepEqual(result.orders,[c,a,b,done]);
  assert.equal(result.chosen,2);
  assert.equal(result.pending,3);
  assert.deepEqual(source,[a,done,b,c]);
});

test('localizaciones duplicadas permanecen juntas y claves viejas no afectan',()=>{
  const first={localizacion:'1234567890',status:'pending',orden:'A'},second={localizacion:'1234567890',status:'pending',orden:'B'},other={localizacion:'9876543210',status:'pending'};
  const result=arrange([other,first,second],['cortes:1111111111','cortes:1234567890','cortes:1234567890']);
  assert.deepEqual(result.orders,[first,second,other]);
  assert.equal(result.chosen,2);
});
