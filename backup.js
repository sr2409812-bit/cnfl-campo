let pendingBackup=null;
function isCnflKey(k){return typeof k==='string'&&(k.startsWith('cnfl_')||k.startsWith('CNFL_'));}
function backupStatus(id,message,kind){
  const el=document.getElementById(id);
  if(el){el.textContent=message;el.classList.toggle('error',kind==='error');el.classList.toggle('success',kind==='success');}
}
function backupItems(data){
  const merged={};
  const rows=Array.isArray(data.database&&data.database.kv)?data.database.kv:[];
  rows.forEach(row=>{if(row&&isCnflKey(row.key)&&typeof row.value==='string')merged[row.key]=row.value;});
  Object.entries(data.items||{}).forEach(([key,value])=>{if(isCnflKey(key)&&typeof value==='string')merged[key]=value;});
  return merged;
}
function backupSummary(items){
  let cuts=0,gps=0,demand=0,residential=0;
  try{const orders=JSON.parse(items.cnfl_work_orders||'[]');cuts=Array.isArray(orders)?orders.length:0;}catch(_){}
  try{const cache=JSON.parse(items.cnfl_geocache||'{}');gps=cache&&typeof cache==='object'?Object.keys(cache).length:0;}catch(_){}
  try{const state=JSON.parse(items.cnfl_reading_orders_v2||'{}');demand=Array.isArray(state.orders)?state.orders.length:0;}catch(_){}
  try{const state=JSON.parse(items.cnfl_residential_reading_v1||'{}');residential=Array.isArray(state.orders)?state.orders.length:0;}catch(_){}
  return `${cuts} cortes · ${demand} demanda · ${residential} residencial · ${gps} GPS`;
}
function readBackupFile(file){
  if(typeof file.text==='function')return file.text();
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(reader.error||new Error('No se pudo leer el archivo'));
    reader.readAsText(file);
  });
}

function cnflBackupKeys(){
  const out=[];
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k && (k.startsWith('cnfl_') || k.startsWith('CNFL_'))) out.push(k);
  }
  return out.sort();
}

async function exportBackup(){
  try{
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

  const summary=backupSummary(data.items);
  const historical=Array.isArray(data.database&&data.database.records)?data.database.records.length:0;
  if(!keys.length&&!historical){
    backupStatus('exportStatus','Este navegador no tiene datos para respaldar. Abrí la app en el navegador donde cargaste las órdenes.', 'error');
    return;
  }
  const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
  const a=document.createElement('a');
  const d=new Date(),pad=n=>String(n).padStart(2,'0');
  a.href=URL.createObjectURL(blob);
  a.download='cnfl-campo-respaldo-'+d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+'-'+pad(d.getHours())+pad(d.getMinutes())+'.json';
  document.body.appendChild(a);a.click();a.remove();
  // Android puede iniciar la descarga después de volver del selector de archivos.
  setTimeout(()=>URL.revokeObjectURL(a.href),60000);
  backupStatus('exportStatus',`Descarga solicitada: ${summary} · ${historical} registros históricos. Compartí el archivo .json de Descargas.`, 'success');
  refreshDatabaseStatus();
  }catch(err){backupStatus('exportStatus','No se pudo preparar el respaldo: '+(err.message||err), 'error');}
}

async function prepareRestore(ev){
  const f=ev.target.files&&ev.target.files[0];
  const status=document.getElementById('restoreStatus');
  const btn=document.getElementById('restoreBtn');
  pendingBackup=null;btn.disabled=true;
  document.getElementById('afterRestore').style.display='none';
  if(!f){status.textContent='Ningún archivo seleccionado.';return}
  try{
    backupStatus('restoreStatus','Leyendo '+f.name+'…');
    const parsed=JSON.parse(await readBackupFile(f));
    const valid=parsed && ['cnfl-campo-backup-v1','cnfl-campo-backup-v2'].includes(parsed.format) && parsed.items && typeof parsed.items==='object' && !Array.isArray(parsed.items);
    if(!valid) throw new Error('Formato no reconocido');
    const items=backupItems(parsed);
    const historical=Array.isArray(parsed.database&&parsed.database.records)?parsed.database.records.length:0;
    if(!Object.keys(items).length&&!historical)throw new Error('El respaldo está vacío. Descargalo desde el navegador que tiene las órdenes.');
    pendingBackup=parsed;
    backupStatus('restoreStatus',`Archivo listo: ${backupSummary(items)} · ${historical} registros históricos · ${parsed.createdAt||'sin fecha'}. Tocá RESTAURAR DATOS.`, 'success');
    btn.disabled=false;
  }catch(e){
    backupStatus('restoreStatus','No se puede usar este archivo: '+e.message, 'error');
  }
}

async function restoreBackup(){
  if(!pendingBackup)return;
  const merged=backupItems(pendingBackup);
  const count=Object.keys(merged).length;
  if(!confirm(`Se restaurarán ${backupSummary(merged)} y ${count} grupos de datos. Se reemplazarán los datos del mismo tipo que ya existan en este navegador. ¿Continuar?`)) return;
  const button=document.getElementById('restoreBtn');
  button.disabled=true;
  backupStatus('restoreStatus','Restaurando datos…');
  const previous=new Map();
  try{
    for(const [key,value] of Object.entries(merged)){
      previous.set(key,localStorage.getItem(key));
      localStorage.setItem(key,value);
    }
  }catch(err){
    for(const [key,value] of previous){
      try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}catch(_){}
    }
    backupStatus('restoreStatus','No se pudo restaurar en este navegador. Revisá el espacio disponible y probá en Chrome: '+(err.message||err), 'error');
    button.disabled=false;
    return;
  }
  let historyWarning='';
  try{
    if(pendingBackup.database&&window.CNFLStore&&typeof window.CNFLStore.importDb==='function'){
      await window.CNFLStore.importDb(pendingBackup.database);
    }
    if(window.CNFLStore&&typeof window.CNFLStore.snapshot==='function') await window.CNFLStore.snapshot();
  }catch(err){
    console.warn('Restauración de base histórica incompleta:',err);
    historyWarning=' La base histórica no se completó: '+(err.message||err)+'.';
  }
  backupStatus('restoreStatus',`Restaurado en este navegador: ${backupSummary(merged)}.${historyWarning} Tocá ABRIR MIS TRABAJOS para comprobarlo.`,historyWarning?'error':'success');
  document.getElementById('afterRestore').style.display='block';
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
