(function(root){
  'use strict';
  const STORAGE_KEY='cnfl_manual_route_v1';
  function read(storage){
    try{const keys=JSON.parse(storage.getItem(STORAGE_KEY)||'[]');return Array.isArray(keys)?keys.filter(x=>typeof x==='string'):[];}
    catch(_){return [];}
  }
  function digits(value){return String(value||'').replace(/\D/g,'');}
  function arrange(rows,keys,type,isPending){
    const rank=new Map();
    (keys||[]).forEach(key=>{
      const m=/^(cortes|demanda|residencial|notificaciones):(\d{1,20})$/.exec(String(key));
      if(m&&m[1]===type&&!rank.has(m[2]))rank.set(m[2],rank.size);
    });
    const pending=[],managed=[];
    (rows||[]).forEach((row,index)=>(isPending(row)?pending:managed).push({row,index}));
    pending.sort((a,b)=>{
      const ar=rank.get(digits(a.row.localizacion)),br=rank.get(digits(b.row.localizacion));
      return (ar===undefined?Infinity:ar)-(br===undefined?Infinity:br)||a.index-b.index;
    });
    return {orders:[...pending,...managed].map(item=>item.row),chosen:pending.filter(item=>rank.has(digits(item.row.localizacion))).length,pending:pending.length};
  }
  const api={STORAGE_KEY,read,arrange};
  root.CNFLFieldRoute=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
