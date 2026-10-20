let pendingBackup=null;
function isCnflKey(k){return typeof k==='string'&&(k.startsWith('cnfl_')||k.startsWith('CNFL_'));}

function cnflBackupKeys(){
  const out=[];
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k && (k.startsWith('cnfl_') || k.startsWith('CNFL_'))) out.push(k);
  }
  return out.sort();
}

async function exportBackup(){
  const keys=cnflBackupKeys();
  const data={
    format:'cnfl-campo-backup-v2',
    createdAt:new Date().toISOString(),
    origin:location.origin,
    items:{},
    database:null
  };
  keys.forEach(k=>{data.items[k]=localStorage.getItem(k)});

  try{
    if(window.CNFLStore&&typeof window.CNFLStore.snapshot==='function') await window.CNFLStore.snapshot();
    if(window.CNFLStore&&typeof window.CNFLStore.exportDb==='function') data.database=await window.CNFLStore.exportDb();
  }catch(err){
    console.warn('No pude agregar IndexedDB al respaldo:',err);
  }

  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  const d=new Date(),pad=n=>String(n).padStart(2,'0');
  a.href=URL.createObjectURL(blob);
  a.download='cnfl-campo-respaldo-'+d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+'-'+pad(d.getHours())+pad(d.getMinutes())+'.json';
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(a.href);
  refreshDatabaseStatus();
}

async function prepareRestore(ev){
  const f=ev.target.files&&ev.target.files[0];
  const status=document.getElementById('restoreStatus');
  const btn=document.getElementById('restoreBtn');
  pendingBackup=null;btn.disabled=true;
  if(!f){status.textContent='Ningún archivo seleccionado.';return}
  try{
    const parsed=JSON.parse(await f.text());
    const valid=parsed && ['cnfl-campo-backup-v1','cnfl-campo-backup-v2'].includes(parsed.format) && parsed.items && typeof parsed.items==='object';
    if(!valid) throw new Error('Formato no reconocido');
    pendingBackup=parsed;
    const dbText=parsed.database?' · incluye base histórica':'';
    status.textContent='Respaldo válido · '+Object.keys(parsed.items).length+' grupos de datos'+dbText+' · '+(parsed.createdAt||'sin fecha');
    btn.disabled=false;
  }catch(e){
    status.textContent='Archivo inválido: '+e.message;
  }
}

async function restoreBackup(){
  if(!pendingBackup)return;
  const merged={};
  const kvRows=Array.isArray(pendingBackup.database&&pendingBackup.database.kv)?pendingBackup.database.kv:[];
  kvRows.forEach(row=>{
    if(row&&isCnflKey(row.key)&&row.value!==undefined&&row.value!==null) merged[row.key]=String(row.value);
  });
  Object.entries(pendingBackup.items||{}).forEach(([k,v])=>{
    if(isCnflKey(k)) merged[k]=String(v);
  });

  const count=Object.keys(merged).length;
  if(!confirm('Se restaurarán '+count+' grupos de datos CNFL y, si existe, la base histórica. Los valores con la misma clave serán reemplazados. ¿Continuar?')) return;

  Object.entries(merged).forEach(([k,v])=>localStorage.setItem(k,v));

  try{
    if(pendingBackup.database&&window.CNFLStore&&typeof window.CNFLStore.importDb==='function'){
      await window.CNFLStore.importDb(pendingBackup.database);
    }
    if(window.CNFLStore&&typeof window.CNFLStore.snapshot==='function') await window.CNFLStore.snapshot();
  }catch(err){
    console.warn('Restauración de base histórica incompleta:',err);
  }

  document.getElementById('restoreStatus').textContent='Restauración completada. Volvé al inicio y verificá tus jornadas.';
  document.getElementById('restoreBtn').disabled=true;
  refreshDatabaseStatus();
}

async function refreshDatabaseStatus(){
  const el=document.getElementById('databaseStatus');
  if(!el)return;
  try{
    if(!window.CNFLStore||typeof window.CNFLStore.counts!=='function'){
      el.textContent='Base histórica no disponible en este navegador.';
      return;
    }
    const c=await window.CNFLStore.counts();
    el.textContent=c.available
      ? 'Base local activa · '+c.records+' registros históricos · '+c.kv+' grupos reflejados'
      : 'Base histórica no disponible.';
  }catch(_){
    el.textContent='No pude verificar la base histórica.';
  }
}
document.addEventListener('DOMContentLoaded',refreshDatabaseStatus);
