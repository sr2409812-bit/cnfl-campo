let pendingBackup=null;
function cnflBackupKeys(){
  const out=[];
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k && (k.startsWith('cnfl_') || k.startsWith('CNFL_'))) out.push(k);
  }
  return out.sort();
}
function exportBackup(){
  const keys=cnflBackupKeys();
  const data={format:'cnfl-campo-backup-v1',createdAt:new Date().toISOString(),origin:location.origin,items:{}};
  keys.forEach(k=>{data.items[k]=localStorage.getItem(k)});
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  const d=new Date(),pad=n=>String(n).padStart(2,'0');
  a.href=URL.createObjectURL(blob);
  a.download='cnfl-campo-respaldo-'+d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+'-'+pad(d.getHours())+pad(d.getMinutes())+'.json';
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(a.href);
}
async function prepareRestore(ev){
  const f=ev.target.files&&ev.target.files[0],status=document.getElementById('restoreStatus'),btn=document.getElementById('restoreBtn');
  pendingBackup=null;btn.disabled=true;
  if(!f){status.textContent='Ningún archivo seleccionado.';return}
  try{
    const parsed=JSON.parse(await f.text());
    if(!parsed || parsed.format!=='cnfl-campo-backup-v1' || !parsed.items || typeof parsed.items!=='object') throw new Error('Formato no reconocido');
    pendingBackup=parsed;
    status.textContent='Respaldo válido · '+Object.keys(parsed.items).length+' grupos de datos · '+(parsed.createdAt||'sin fecha');
    btn.disabled=false;
  }catch(e){status.textContent='Archivo inválido: '+e.message}
}
function restoreBackup(){
  if(!pendingBackup)return;
  const count=Object.keys(pendingBackup.items).length;
  if(!confirm('Se restaurarán '+count+' grupos de datos. Los valores con la misma clave serán reemplazados. ¿Continuar?')) return;
  Object.entries(pendingBackup.items).forEach(([k,v])=>localStorage.setItem(k,String(v)));
  document.getElementById('restoreStatus').textContent='Restauración completada. Volvé al inicio y verificá tus jornadas.';
  document.getElementById('restoreBtn').disabled=true;
}