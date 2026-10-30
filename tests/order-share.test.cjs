const test=require('node:test');
const assert=require('node:assert/strict');
const share=require('../order-share.js');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

test('la imagen para pago incluye solo los identificadores y el monto listado',()=>{
  const data=share.build({nis:'28061686',orden:'74600154',localizacion:'1604900270',cliente:'Nombre privado',direccion:'Casa 666',status:'avisado'},'8 150');
  const text=share.text(data);
  assert.match(text,/NIS: 28061686/);
  assert.match(text,/Orden: 74600154/);
  assert.match(text,/Monto listado en la orden: ₡8 150/);
  assert.doesNotMatch(text,/Nombre privado|Casa 666|avisado/);
  assert.match(text,/no es factura ni comprobante/);
});

test('si el monto no está validado no se presenta como importe por pagar',()=>{
  const data=share.build({nis:'1',orden:'2',localizacion:'3'},null);
  assert.equal(data.listed,false);
  assert.equal(data.monto,'Consultar monto vigente');
  assert.match(share.text(data),/Confirmá el monto vigente/);
});

test('la tarjeta se dibuja sin enviar datos fuera del teléfono',()=>{
  const calls=[];
  const ctx={fillRect:(...args)=>calls.push(['rect',...args]),fillText:(...args)=>calls.push(['text',...args])};
  const canvas={getContext:kind=>kind==='2d'?ctx:null};
  share.draw(canvas,share.build({nis:'123',orden:'456',localizacion:'789'},'10 000'));
  assert.equal(canvas.width,1080);
  assert.equal(canvas.height,1080);
  assert.ok(calls.some(call=>call[0]==='text'&&call[1]==='123'));
  assert.ok(calls.some(call=>call[0]==='text'&&call[1]==='₡10 000'));
});

test('la ficha muestra una imagen para fotografiar sin compartir ni descargar',()=>{
  const nodes=new Map();
  const element=id=>{
    if(!nodes.has(id))nodes.set(id,{hidden:true,disabled:true,textContent:'',src:'',classList:{add(){},remove(){}},removeAttribute(){},focus(){},querySelector(){return {focus(){}}}});
    return nodes.get(id);
  };
  const ctx={fillRect(){},fillText(){}};
  const canvas={getContext:()=>ctx,toDataURL:()=> 'data:image/png;base64,ejemplo'};
  const context=vm.createContext({
    document:{addEventListener(){},getElementById:element,createElement:()=>canvas,body:{classList:{add(){},remove(){}}}},
    localStorage:{getItem:()=>null},addEventListener(){},navigator:{},File,Blob,
    URL:{createObjectURL:()=> 'blob:ejemplo',revokeObjectURL(){}},console
  });
  context.window=context;
  context.CNFLOrderShare=share;
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),context);
  vm.runInContext("workOrders=[{orden:'74600154',nis:'28061686',localizacion:'1604900270',monto:'8150'}]",context);
  context.openPaymentShare(0);
  assert.equal(element('paymentShareOverlay').hidden,false);
  assert.match(element('paymentSharePreview').alt,/NISE 28061686/);
  assert.equal(element('paymentSharePreview').src,'data:image/png;base64,ejemplo');
  assert.match(element('paymentShareStatus').textContent,/tomarle una foto/);
  context.closePaymentShare();
  assert.equal(element('paymentShareOverlay').hidden,true);
});
