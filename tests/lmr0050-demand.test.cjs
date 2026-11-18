const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

// Datos enteramente sintéticos: no incorporar el PDF del técnico al repositorio.
const item=(str,x,y)=>({str,transform:[1,0,0,1,x,y]});
function fixture({counts=[3,2,0,0],total=5,missingMeter=-1,emptyFooter=true}={}) {
  let next=0;
  const pages=counts.map((count,pi)=>{
    const page=[
      item('LISTADO DE MEDIDORES A VISITAR DE LA RUTA',110,785),
      item('LMR0050',480,730),
      item('Número',22,649),item('Secuencia',59,649),
      item('Contrato',106,649),item('Medidor',163,649),
      item('Quiebre',22,638),item('Visita',68,638)
    ];
    for(let i=0;i<count;i++){
      const y=614-i*12;
      const loc=String(2010000000+next);
      const meter=String(800000+next);
      page.push(item('9',31,y),item(loc,59,y),item(next%2?'*******':'765432',106,y),item('MED',136,y));
      if(next!==missingMeter)page.push(item(meter,172,y));
      page.push(item('DIRECCION SINTETICA',205,y),item('CLIENTE SINTETICO',404,y));
      next++;
    }
    if(pi===counts.findLastIndex(n=>n>0) && total!==null)page.push(item('Cantidad Medidores: '+total,40,110));
    if(!count && emptyFooter)page.push(item('Cantidad Medidores: 0',40,610));
    return page;
  });
  return {pages,text:pages.flat().map(i=>i.str).join('\n')};
}
function parse(doc){
  const context=vm.createContext({console:{log(){},error(){}}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../lectura-pdf-v4.js'),'utf8'),context);
  return context.parseReadingPdfLayout(doc.pages,doc.text);
}
test('LMR0050: valida todas las páginas, incluidas páginas vacías declaradas',()=>{
  const doc=fixture({counts:[36,37,5,0,0],total:78});
  const result=parse(doc);
  assert.equal(result.rows.length,78);
  assert.equal(result.expectedCount,78);
  assert.equal(result.parser,'lmr0050-route-list-strict');
  assert.equal(result.rows[0].localizacion,'2010000000');
  assert.equal(result.rows[0].medidor,'800000');
  assert.equal(result.rows[77].medidor,'800077');
});
test('LMR0050: nunca confunde Contrato con Medidor',()=>{
  const result=parse(fixture());
  assert.equal(result.rows[0].medidor,'800000');
  assert.notEqual(result.rows[0].medidor,'765432');
  assert.equal(result.rows[1].medidor,'800001');
});
test('LMR0050: bloquea un medidor ausente aunque exista Contrato numérico',()=>{
  assert.throws(()=>parse(fixture({missingMeter:1})),/integridad|indica 5 registros/);
});
test('LMR0050: no acepta un total inconsistente',()=>{
  assert.throws(()=>parse(fixture({total:6})),/indica 6 registros, pero pude validar 5/);
});
test('LMR0050: página vacía debe declarar 0 medidores',()=>{
  assert.throws(()=>parse(fixture({emptyFooter:false})),/integridad/);
});
test('LMR0050: no acepta una página sin encabezados verificables',()=>{
  const doc=fixture();
  doc.pages[1]=doc.pages[1].filter(i=>i.str!=='Contrato');
  doc.text=doc.pages.flat().map(i=>i.str).join('\n');
  assert.throws(()=>parse(doc),/integridad/);
});
test('LMR0050: fila incompleta en página con cero declarado se rechaza',()=>{
  const doc=fixture();
  doc.pages[2].push(item('9',31,580),item('2010000099',59,580),item('765432',106,580),item('MED',136,580));
  doc.text=doc.pages.flat().map(i=>i.str).join('\n');
  assert.throws(()=>parse(doc),/integridad|indica 5 registros/);
});
test('LMR0050: identificadores duplicados con medidores incompatibles se rechazan',()=>{
  const doc=fixture();
  doc.pages[1].push(item('9',31,140),item('2010000000',59,140),item('765432',106,140),item('MED',136,140),item('900000',172,140));
  doc.text=doc.pages.flat().map(i=>i.str).join('\n');
  assert.throws(()=>parse(doc),/Conflicto de Medidor/);
});
test('LMR0050: su analizador solo se activa con firma del documento',()=>{
  const doc=fixture();
  const context=vm.createContext({console:{log(){},error(){}}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../lectura-pdf-v4.js'),'utf8'),context);
  assert.equal(context.parseLMR0050RouteListPdf(doc.pages,doc.text).rows.length,5);
  assert.equal(context.parseLMR0050RouteListPdf(doc.pages,doc.text.replaceAll('LMR0050','LMR0000')),null);
});
