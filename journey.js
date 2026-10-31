(function(root){
  'use strict';
  const KEY='cnfl_journeys_v1', MODULES={cortes:'Cortes',demanda:'Lectura de demanda',residencial:'Lectura residencial',notificaciones:'Notificaciones'};
  const pages={cortes:'index.html',demanda:'lectura.html',residencial:'lectura-residencial.html',notificaciones:'notificaciones.html'};
  function stamp(now=new Date()){
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);
    const x=Object.fromEntries(parts.map(p=>[p.type,p.value]));
    // El turno anterior continúa hasta las seis; el cambio no borra datos.
    const d=new Date(Date.UTC(Number(x.year),Number(x.month)-1,Number(x.day)-(Number(x.hour)<6?1:0)));
    return d.toISOString().slice(0,10);
  }
  function read(storage){try{const d=JSON.parse(storage.getItem(KEY)||'null');return d&&typeof d==='object'?{active:d.active||null,history:Array.isArray(d.history)?d.history:[]}: {active:null,history:[]};}catch(_){return {active:null,history:[]};}}
  function write(storage,s){storage.setItem(KEY,JSON.stringify(s));return s;}
  function begin(storage,module,now=new Date()){
    if(!Object.hasOwn(MODULES,module))throw Error('Módulo inválido');
    const s=read(storage),date=stamp(now);
    if(s.active&&!s.active.finishedAt&&s.active.date===date&&s.active.module===module)return s.active;
    if(s.active){s.history.unshift(s.active);s.history=s.history.slice(0,90);}
    s.active={id:date+':'+module+':'+now.getTime(),date,module,step:'load',startedAt:now.toISOString()};
    write(storage,s);return s.active;
  }
  function step(storage,next,now=new Date()){
    const s=read(storage),a=s.active;
    if(!a||a.finishedAt)return null;
    const order=['load','map','work','report'];
    if(!order.includes(next))throw Error('Paso inválido');
    if(order.indexOf(next)<order.indexOf(a.step))return a;
    a.step=next;a.updatedAt=now.toISOString();write(storage,s);return a;
  }
  function finish(storage,summary,now=new Date()){
    const s=read(storage),a=s.active;
    if(!a||a.finishedAt||a.step!=='report')return null;
    a.finishedAt=now.toISOString();a.summary={total:Number(summary.total)||0,done:Number(summary.done)||0,pending:Number(summary.pending)||0};
    if(typeof summary.report==='string')a.report=summary.report.slice(0,60000);
    write(storage,s);return a;
  }
  function confirmReport(storage,confirmed){
    const s=read(storage),a=s.active;
    if(!a||a.finishedAt||a.step!=='report')return null;
    a.reportConfirmed=!!confirmed;write(storage,s);return a;
  }
  function prepareNotifications(storage,date){
    const key='cnfl_notificaciones_20261019_v2',historyKey='cnfl_notification_daily_history_v1';
    const current=JSON.parse(storage.getItem(key)||'null');
    if(!current||current.journeyDate===date)return;
    if(Object.keys(current.done||{}).length){
      const history=JSON.parse(storage.getItem(historyKey)||'[]');
      history.unshift({date:current.journeyDate||'anterior',done:current.done,order:current.order});
      storage.setItem(historyKey,JSON.stringify(history.slice(0,30)));
    }
    storage.setItem(key,JSON.stringify({...current,done:{},lastAction:null,index:0,journeyDate:date}));
  }
  root.CNFLJourney={KEY,MODULES,pages,stamp,read,begin,step,finish,confirmReport,prepareNotifications};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.CNFLJourney;
})(typeof window==='undefined'?globalThis:window);
