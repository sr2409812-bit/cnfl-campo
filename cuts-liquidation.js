(function(root){
  const statuses=[
    ['cortado','Cortado'],['avisado','Avisado'],['reconectado','Reconectado'],
    ['pago','Pagó en sitio'],['ya_cortado','Ya cortado'],
    ['no_acceso','Sin acceso'],['directo','Directo / anomalía']
  ];
  function snapshot(orders){
    const rows=Array.isArray(orders)?orders:[];
    const managed=rows.filter(row=>row.status&&row.status!=='pending');
    const pending=rows.length-managed.length;
    const groups=statuses.map(([key,label])=>({key,label,rows:managed.filter(row=>row.status===key)}));
    const unknown=managed.filter(row=>!statuses.some(([key])=>key===row.status));
    if(unknown.length)groups.push({key:'otro',label:'Otro resultado',rows:unknown});
    return {total:rows.length,managed:managed.length,pending,groups,
      rows:managed.slice().sort((a,b)=>String(a.localizacion||'').localeCompare(String(b.localizacion||''),'es',{numeric:true}))};
  }
  function cell(value){
    let text=String(value??'').replace(/[\r\n]+/g,' ').trim();
    if(/^[=+\-@\t]/.test(text))text="'"+text;
    return '"'+text.replace(/"/g,'""')+'"';
  }
  function csv(report){
    const header=['Resultado','Localización','Orden','NIS','Medidor','Lectura kWh','Sello retirado','Sello instalado','Observaciones'];
    const lines=[header.map(cell).join(',')];
    for(const row of report.rows){
      const label=report.groups.find(group=>group.key===row.status)?.label||'Otro resultado';
      lines.push([label,row.localizacion,row.orden,row.nis,row.medidor||row.meter,row.lectura,row.sello_retirado,row.sello_instalado,row.observaciones].map(cell).join(','));
    }
    return '\uFEFF'+lines.join('\r\n')+'\r\n';
  }
  const api={snapshot,csv};
  root.CNFLCutsLiquidation=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
