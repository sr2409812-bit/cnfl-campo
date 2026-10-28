(function(root){
  'use strict';
  function digits(value){return String(value||'').replace(/\D/g,'');}
  function ranks(keys){
    const rank=new Map();
    if(Array.isArray(keys)) keys.forEach(value=>{
      const match=/^cortes:(\d{1,20})$/.exec(String(value));
      if(match&&!rank.has(match[1]))rank.set(match[1],rank.size);
    });
    return rank;
  }
  function arrange(orders,keys){
    const rank=ranks(keys),pending=[],managed=[];
    (orders||[]).forEach((order,index)=>{
      (order.status==='pending'?pending:managed).push({order,index});
    });
    pending.sort((a,b)=>{
      const ar=rank.get(digits(a.order.localizacion)),br=rank.get(digits(b.order.localizacion));
      return (ar===undefined?Infinity:ar)-(br===undefined?Infinity:br)||a.index-b.index;
    });
    const chosen=pending.filter(x=>rank.has(digits(x.order.localizacion))).length;
    return {orders:[...pending,...managed].map(x=>x.order),chosen,pending:pending.length};
  }
  const api={arrange};
  root.CNFLCutsManualOrder=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
