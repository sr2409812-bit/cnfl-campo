const test=require('node:test');
const assert=require('node:assert/strict');
const {group}=require('../map-clusters.js');

test('puntos superpuestos forman un grupo seleccionable sin perder órdenes',()=>{
  const rows=[{id:'A',x:0,y:0},{id:'B',x:28,y:0},{id:'C',x:60,y:0},{id:'D',x:200,y:0}];
  const result=group(rows,x=>x,34);
  assert.deepEqual(result.map(g=>g.map(x=>x.id)),[['A','B','C'],['D']]);
  assert.equal(result.flat().length,rows.length);
});

test('al acercar el zoom se separan los puntos antes superpuestos',()=>{
  const rows=[{x:0,y:0},{x:15,y:0}];
  assert.equal(group(rows,x=>x,40).length,1);
  assert.equal(group(rows,x=>({x:x.x*4,y:x.y*4}),40).length,2);
});
