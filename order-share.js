(function(root){
  'use strict';
  function value(input){return String(input??'').trim().slice(0,120)||'No disponible';}
  function build(order,amount){
    const clean=order||{};
    const listed=typeof amount==='string'&&amount.trim()&&amount!=='NO VALIDADO';
    return {
      nis:value(clean.nis),
      orden:value(clean.orden),
      localizacion:value(clean.localizacion),
      monto:listed?'₡'+amount:'Consultar monto vigente',
      listed:Boolean(listed)
    };
  }
  function text(data){
    return 'DATOS DE LA ORDEN PARA CONSULTA DE PAGO\n'+
      'NIS: '+data.nis+'\n'+
      'Orden: '+data.orden+'\n'+
      'Localización: '+data.localizacion+'\n'+
      (data.listed?'Monto listado en la orden: ':'Monto: ')+data.monto+'\n\n'+
      'Confirmá el monto vigente antes de pagar. Este resumen no es factura ni comprobante de pago.';
  }
  function draw(canvas,data){
    canvas.width=1080;canvas.height=1080;
    const ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('Este navegador no pudo crear la imagen. Volvé a intentarlo.');
    ctx.fillStyle='#F3F6F9';ctx.fillRect(0,0,1080,1080);
    ctx.fillStyle='#00264D';ctx.fillRect(0,0,1080,210);
    ctx.fillStyle='#FF6A13';ctx.fillRect(0,202,1080,8);
    ctx.fillStyle='#FFF';ctx.font='bold 48px Arial';ctx.fillText('DATOS DE LA ORDEN',60,93);
    ctx.font='26px Arial';ctx.fillText('Fotografiá estos datos para consultar el pago',60,147);
    ctx.fillStyle='#FFF';ctx.fillRect(35,250,1010,640);
    ctx.fillStyle='#455668';ctx.font='bold 26px Arial';ctx.fillText('NISE / CUENTA',78,329);
    ctx.fillStyle='#00264D';ctx.font='bold 96px Arial';ctx.fillText(data.nis,78,405,920);
    ctx.fillStyle='#DCE5ED';ctx.fillRect(78,447,924,2);
    ctx.fillStyle='#455668';ctx.font='bold 26px Arial';ctx.fillText('NÚMERO DE ORDEN',78,516);
    ctx.fillText('LOCALIZACIÓN',555,516);
    ctx.fillStyle='#00264D';ctx.font='bold 38px Arial';ctx.fillText(data.orden,78,574,445);
    ctx.fillText(data.localizacion,555,574,440);
    ctx.fillStyle='#FFF1E8';ctx.fillRect(65,650,950,175);
    ctx.fillStyle='#7C3A10';ctx.font='bold 25px Arial';ctx.fillText(data.listed?'MONTO LISTADO EN LA ORDEN':'MONTO',95,707);
    ctx.font='bold 84px Arial';ctx.fillText(data.monto,95,780,885);
    ctx.fillStyle='#35475A';ctx.font='25px Arial';
    ctx.fillText('Confirmá el monto vigente antes de pagar.',60,970);
    ctx.fillText('Resumen informativo: no es factura ni comprobante de pago.',60,1015);
    return canvas;
  }
  const api={build,text,draw};
  root.CNFLOrderShare=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
