(function(){
  const DB='cnfl_campo_db';
  const VERSION=1;
  function open(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB,VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains('kv')) db.createObjectStore('kv',{keyPath:'key'});
        if(!db.objectStoreNames.contains('records')) db.createObjectStore('records',{keyPath:'pk'});
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }
  const ready=('indexedDB' in window)?open():Promise.resolve(null);
  function done(tx){return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
  async function snapshot(){
    const db=await ready;if(!db)return 0;
    const tx=db.transaction('kv','readwrite'),store=tx.objectStore('kv');
    let count=0;
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(!key||!key.startsWith('cnfl_'))continue;
      store.put({key,value:localStorage.getItem(key),updatedAt:new Date().toISOString()});
      count++;
    }
    await done(tx);return count;
  }
  async function putRecord(namespace,id,data){
    const db=await ready;if(!db)return false;
    const tx=db.transaction('records','readwrite');
    tx.objectStore('records').put({pk:namespace+'|'+id,namespace,id,data,updatedAt:new Date().toISOString()});
    await done(tx);return true;
  }
  window.CNFLStore={ready,snapshot,putRecord};
  ready.then(db=>{
    if(!db)return;
    snapshot().catch(()=>{});
    setInterval(()=>snapshot().catch(()=>{}),5000);
    addEventListener('pagehide',()=>snapshot().catch(()=>{}));
  }).catch(err=>console.warn('[CNFL DB]',err));
})();