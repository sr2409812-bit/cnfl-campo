const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

function setup(orders, failSave=false){
  const saved=new Map([['cnfl_work_orders',JSON.stringify(orders)]]);
  const elements=new Map(['cutsPdfReview','cutsPdfReviewText','pdfLoadingStatus','btnFilterPending'].map(id=>[id,{hidden:true,textContent:'',scrollIntoView(){}}]));
  const toasts=[];
  const context=vm.createContext({
    window:{},console:{error(){},warn(){},log(){}},
    document:{addEventListener(){},getElementById:id=>elements.get(id)||null,querySelectorAll:()=>[{}]},
    localStorage:{getItem:id=>saved.get(id)||null,setItem(id,value){if(failSave&&id==='cnfl_work_orders')throw Error('Sin espacio');saved.set(id,value)},removeItem:id=>saved.delete(id)},
    addEventListener(){},confirm:()=>true
  });
  context.window=context;
  context.initialOrders=orders;
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),context);
  vm.runInContext('workOrders=initialOrders',context);
  // Sustituir solo renderizado; mantener la fusión y el almacenamiento reales.
  context.renderOrders=()=>{};
  context.updateLiquidation=()=>{};
  context.updateTgCommandsCount=()=>{};
  context.setRouteFilter=()=>{};
  context.switchTab=()=>{};
  context.archiveOrdersToHistory=()=>{};
  context.showToast=text=>toasts.push(text);
  return {context,saved,elements,toasts};
}

test('seleccionar un PDF válido abre la revisión sin reemplazar las órdenes',async()=>{
  const before=[{orden:'101',status:'cortado',localizacion:'0000000001'}];
  const app=setup(before);
  const parsed=[{orden:'202',status:'pending',localizacion:'0000000002'}];
  app.context.pdfjsLib={getDocument:()=>({promise:Promise.resolve({numPages:1,getPage:async()=>({getTextContent:async()=>({items:[{str:'LISTADO DE DESCONEXIONES EN MÓVILES'}]})})})})};
  app.context.parseCnflPdfText=()=>parsed;
  app.context.parseCnflPdfLayout=()=>parsed;
  app.context.validateCnflLayoutRows=()=>({ok:true,errors:[]});
  app.context.mergeCnflPdfParsers=()=>parsed;
  app.context.validateCnflOrders=()=>({ok:true,errors:[]});
  const input={files:[{name:'cortes.pdf',arrayBuffer:async()=>new ArrayBuffer(0)}],value:'cortes.pdf'};
  await app.context.handlePdfUpload({target:input});
  assert.equal(app.saved.get('cnfl_work_orders'),JSON.stringify(before));
  assert.equal(app.elements.get('cutsPdfReview').hidden,false);
  assert.equal(app.elements.get('pdfLoadingStatus').hidden,true);
  assert.equal(input.value,'');
});

test('revisar o cancelar un PDF no toca la jornada activa',()=>{
  const before=[{orden:'101',status:'cortado',localizacion:'0000000001'}];
  const app=setup(before);
  app.context.reviewCutsPdfImport([{orden:'202',status:'pending'}],'2026-10-29','cortes.pdf');
  assert.match(app.elements.get('cutsPdfReviewText').textContent,/1 órdenes actuales no están/);
  assert.match(app.elements.get('cutsPdfReviewText').textContent,/1 de ellas ya fueron gestionadas/);
  assert.equal(app.saved.get('cnfl_work_orders'),JSON.stringify(before));
  app.context.cancelCutsPdfImport();
  assert.equal(app.elements.get('cutsPdfReview').hidden,true);
  assert.equal(app.saved.get('cnfl_work_orders'),JSON.stringify(before));
});

test('confirmar conserva el resultado de una orden coincidente',async()=>{
  const before=[{orden:'101',status:'avisado',localizacion:'0000000001',lectura:'15'}];
  const app=setup(before);
  app.context.reviewCutsPdfImport([{orden:'101',status:'pending',localizacion:'0000000001',cliente:'Ejemplo'}],'2026-10-29','cortes.pdf');
  await app.context.confirmCutsPdfImport();
  const after=JSON.parse(app.saved.get('cnfl_work_orders'));
  assert.equal(after[0].status,'avisado');
  assert.equal(after[0].lectura,'15');
  assert.equal(after[0].cliente,'Ejemplo');
  assert.equal(app.elements.get('cutsPdfReview').hidden,true);
});

test('si falla el guardado la revisión sigue abierta y el lote anterior intacto',async()=>{
  const before=[{orden:'101',status:'pending',localizacion:'0000000001'}];
  const app=setup(before,true);
  app.context.reviewCutsPdfImport([{orden:'202',status:'pending',localizacion:'0000000002'}],'2026-10-29','cortes.pdf');
  await app.context.confirmCutsPdfImport();
  assert.equal(app.saved.get('cnfl_work_orders'),JSON.stringify(before));
  assert.equal(app.elements.get('cutsPdfReview').hidden,false);
  assert.match(app.toasts.at(-1),/órdenes anteriores/);
});
