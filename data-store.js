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
  function cleanHistoryRecord(row){
    if(!row||typeof row!=='object'||(!Object.hasOwn(row,'monto')&&!Object.hasOwn(row,'status')))return row;
    const {monto,status,...record}=row;
    return record;
  }
  function cleanHistoryValue(value){
    try{
      const parsed=JSON.parse(value);
      if(!Array.isArray(parsed))return value;
      const cleaned=parsed.map(cleanHistoryRecord);
      return cleaned.some((row,i)=>row!==parsed[i])?JSON.stringify(cleaned):value;
    }catch(_){return value;}
  }
  async function scrubCutHistory(){
    const db=await ready;if(!db)return;
    const tx=db.transaction(['kv','records'],'readwrite');
    const kv=tx.objectStore('kv'),records=tx.objectStore('records');
    const saved=kv.get('cnfl_order_history_v1');
    saved.onsuccess=()=>{
      const row=saved.result;
      if(row){const value=cleanHistoryValue(row.value);if(value!==row.value)kv.put({...row,value});}
    };
    const cursor=records.openCursor();
    cursor.onsuccess=()=>{
      const item=cursor.result;
      if(!item)return;
      const row=item.value;
      if(row.namespace==='cuts-history'){
        const data=cleanHistoryRecord(row.data);
        if(data!==row.data)item.update({...row,data});
      }
      item.continue();
    };
    await done(tx);
  }
  async function snapshot(){
    const db=await ready;if(!db)return 0;
    const tx=db.transaction('kv','readwrite'),store=tx.objectStore('kv');
    let count=0;
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(!key||!(key.startsWith('cnfl_')||key.startsWith('CNFL_')))continue;
      let value=localStorage.getItem(key);
      if(key==='cnfl_order_history_v1'){
        const clean=cleanHistoryValue(value);
        if(clean!==value){localStorage.setItem(key,clean);value=clean;}
      }
      store.put({key,value,updatedAt:new Date().toISOString()});
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
  async function getAll(storeName){
    const db=await ready;if(!db)return [];
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(storeName,'readonly');
      const req=tx.objectStore(storeName).getAll();
      req.onsuccess=()=>resolve(req.result||[]);
      req.onerror=()=>reject(req.error);
    });
  }
  async function exportDb(){
    await scrubCutHistory();
    const [kv,records]=await Promise.all([getAll('kv'),getAll('records')]);
    return {name:DB,version:VERSION,exportedAt:new Date().toISOString(),kv,records};
  }
  async function importDb(payload){
    const db=await ready;if(!db)return {kv:0,records:0};
    const out={kv:0,records:0};
    for(const name of ['kv','records']){
      const rows=Array.isArray(payload&&payload[name])?payload[name]:[];
      if(!rows.length)continue;
      const tx=db.transaction(name,'readwrite'),store=tx.objectStore(name);
      rows.forEach(row=>{store.put(row);out[name]++;});
      await done(tx);
    }
    await scrubCutHistory();
    return out;
  }
  async function deleteRecordsByPrefix(namespace,prefix){
    const db=await ready;if(!db)return 0;
    const all=await getAll('records');
    const targets=all.filter(r=>r&&r.namespace===String(namespace)&&String(r.id||'').startsWith(String(prefix||'')));
    if(!targets.length)return 0;
    const tx=db.transaction('records','readwrite'),store=tx.objectStore('records');
    targets.forEach(r=>store.delete(r.pk));
    await done(tx);
    return targets.length;
  }

  async function counts(){
    const db=await ready;if(!db)return {available:false,kv:0,records:0};
    const countStore=name=>new Promise((resolve,reject)=>{
      const tx=db.transaction(name,'readonly'),req=tx.objectStore(name).count();
      req.onsuccess=()=>resolve(req.result||0);req.onerror=()=>reject(req.error);
    });
    const [kv,records]=await Promise.all([countStore('kv'),countStore('records')]);
    return {available:true,kv,records};
  }
  window.CNFLStore={ready,snapshot,putRecord,exportDb,importDb,deleteRecordsByPrefix,counts};
  ready.then(db=>{
    if(!db)return;
    scrubCutHistory().then(snapshot).catch(()=>{});
    setInterval(()=>snapshot().catch(()=>{}),5000);
    addEventListener('pagehide',()=>snapshot().catch(()=>{}));
  }).catch(err=>console.warn('[CNFL DB]',err));
})();
