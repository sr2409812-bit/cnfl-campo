/* M10 · Capa 4 — Cronómetro de jornada.
   Decisión 0003: el conteo inicia al abrir el mapa, cada orden cierra al darla
   por finalizada y hay pausa. Todo se calcula desde marcas de tiempo guardadas
   (nunca desde un contador en memoria), así que sobrevive recargas y cierres.
   Solo escribe con el interruptor "Medir tiempos" encendido. Sin GPS ni red.
   Los tiempos por orden incluyen traslado + atención: no se pueden separar sin
   una marca de llegada (decisión 0003). */
(function(root){
  'use strict';

  const KEY='cnfl_operation_timer_v1';
  const EVENTS_KEY='cnfl_operation_events_v1';
  const VERSION=1;
  const MAX_TIMERS=30;
  const MAX_PAUSES=200;

  const isIso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
  const ms=v=>Date.parse(v);

  function switchOn(storage){
    const sw=root.CNFLCaptureSwitch;
    try{return !!(sw&&sw.isEnabled(storage));}catch(_){return false;}
  }

  // Lectura defensiva: cualquier anomalía equivale a "sin cronómetros".
  function readAll(storage){
    let raw;
    try{raw=JSON.parse(storage.getItem(KEY)||'null');}catch(_){return {version:VERSION,timers:{}};}
    if(!raw||typeof raw!=='object'||raw.version!==VERSION||!raw.timers||typeof raw.timers!=='object'||Array.isArray(raw.timers))
      return {version:VERSION,timers:{}};
    return raw;
  }
  function validTimer(t){
    return t&&typeof t==='object'&&isIso(t.startedAt)&&Array.isArray(t.pauses)&&
      t.pauses.every(p=>Array.isArray(p)&&isIso(p[0])&&(p[1]===null||isIso(p[1])));
  }
  function read(storage,journeyId){
    const t=readAll(storage).timers[journeyId];
    return validTimer(t)?t:null;
  }
  function write(storage,all){
    const ids=Object.keys(all.timers);
    if(ids.length>MAX_TIMERS){
      ids.sort((a,b)=>ms(all.timers[a].startedAt)-ms(all.timers[b].startedAt));
      for(const id of ids.slice(0,ids.length-MAX_TIMERS))delete all.timers[id];
    }
    try{storage.setItem(KEY,JSON.stringify(all));return true;}catch(_){return false;}
  }

  function activeJourney(storage){
    const j=root.CNFLJourney;
    if(!j)return null;
    try{
      const a=j.read(storage).active;
      return a&&!a.finishedAt&&typeof a.id==='string'?a:null;
    }catch(_){return null;}
  }

  // Inicia el cronómetro de la jornada activa. Idempotente: si ya existe, no lo cambia.
  function start(storage,{now=new Date(),source='map'}={}){
    if(!switchOn(storage))return {ok:false,reason:'switch_off'};
    const j=activeJourney(storage);
    if(!j)return {ok:false,reason:'no_journey'};
    const all=readAll(storage);
    if(validTimer(all.timers[j.id]))return {ok:true,already:true,timer:all.timers[j.id]};
    const timer={module:j.module,startedAt:now.toISOString(),startSource:String(source).slice(0,32),pauses:[]};
    all.timers[j.id]=timer;
    return write(storage,all)?{ok:true,timer}:{ok:false,reason:'storage'};
  }

  function isPaused(timer){
    return !!timer&&timer.pauses.length>0&&timer.pauses[timer.pauses.length-1][1]===null;
  }

  function setPaused(storage,paused,{now=new Date()}={}){
    if(!switchOn(storage))return {ok:false,reason:'switch_off'};
    const j=activeJourney(storage);
    if(!j)return {ok:false,reason:'no_journey'};
    const all=readAll(storage);
    const timer=all.timers[j.id];
    if(!validTimer(timer))return {ok:false,reason:'not_started'};
    if(isPaused(timer)===paused)return {ok:true,already:true};
    const at=now.toISOString();
    if(paused){
      if(timer.pauses.length>=MAX_PAUSES)return {ok:false,reason:'too_many_pauses'};
      timer.pauses.push([at,null]);
    }else{
      const last=timer.pauses[timer.pauses.length-1];
      last[1]=ms(at)<ms(last[0])?last[0]:at;
    }
    return write(storage,all)?{ok:true,paused}:{ok:false,reason:'storage'};
  }

  // Tiempo pausado dentro de [from,to], con pausas abiertas cerradas en `to`.
  function pausedBetween(timer,from,to){
    let total=0;
    for(const [s,e] of timer.pauses){
      const a=Math.max(ms(s),from),b=Math.min(e===null?to:ms(e),to);
      if(b>a)total+=b-a;
    }
    return total;
  }

  // Finalizaciones efectivas (descontando reaperturas y deshacer) de la jornada.
  function completions(events,journeyId){
    const active=new Map();
    const list=(Array.isArray(events)?events:[])
      .filter(e=>e&&e.journeyId===journeyId&&e.quality==='observed'&&isIso(e.at))
      .sort((a,b)=>ms(a.at)-ms(b.at));
    for(const e of list){
      if(e.eventType==='order_completed'){if(!active.has(e.orderKey))active.set(e.orderKey,e);}
      else if(e.eventType==='order_reopened'||e.eventType==='order_undo'){
        const cur=active.get(e.orderKey);
        if(cur&&cur.eventId===e.sourceEventId)active.delete(e.orderKey);
      }
    }
    return [...active.values()].map(e=>ms(e.at)).sort((a,b)=>a-b);
  }
  function readEvents(storage){
    try{const l=JSON.parse(storage.getItem(EVENTS_KEY)||'null');return Array.isArray(l?.events)?l.events:[];}
    catch(_){return [];}
  }

  function median(sorted){
    if(!sorted.length)return null;
    const m=Math.floor(sorted.length/2);
    return sorted.length%2?sorted[m]:Math.round((sorted[m-1]+sorted[m])/2);
  }
  function p90(sorted){
    return sorted.length?sorted[Math.min(sorted.length-1,Math.ceil(0.9*sorted.length)-1)]:null;
  }

  // Resumen puro: todo se deriva de marcas guardadas y del instante `nowMs`.
  function summarize(timer,completionTimes,{nowMs=Date.now(),finishedAt=null}={}){
    if(!validTimer(timer))return null;
    const start=ms(timer.startedAt);
    const end=isIso(finishedAt)?Math.min(ms(finishedAt),nowMs):nowMs;
    const clockIssue=end<start;
    const done=(completionTimes||[]).filter(t=>t>=start&&t<=end);
    const durations=[];
    let prev=start;
    for(const t of done){
      const d=(t-prev)-pausedBetween(timer,prev,t);
      if(d>0)durations.push(d);
      prev=t;
    }
    const sorted=[...durations].sort((a,b)=>a-b);
    const effective=clockIssue?null:Math.max(0,(end-start)-pausedBetween(timer,start,end));
    const current=clockIssue?null:Math.max(0,(end-prev)-pausedBetween(timer,prev,end));
    const mean=durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length):null;
    return {
      startedAt:timer.startedAt,
      paused:isPaused(timer)&&!finishedAt,
      finished:!!finishedAt,
      completed:done.length,
      effectiveMs:effective,
      pausedMs:clockIssue?null:pausedBetween(timer,start,end),
      currentOrderMs:finishedAt?null:current,
      lastOrderMs:durations.length?durations[durations.length-1]:null,
      meanMs:mean,
      medianMs:median(sorted),
      p90Ms:p90(sorted),
      // Tasa solo con muestra mínima: 2+ órdenes y 15+ minutos efectivos.
      ordersPerHour:effective>=15*60000&&done.length>=2?Math.round(done.length/(effective/3600000)*10)/10:null,
      durationsMs:durations,
      quality:clockIssue?'invalid_timing':'observed'
    };
  }

  // Estado listo para mostrar en pantalla.
  function status(storage,{nowMs=Date.now()}={}){
    const on=switchOn(storage);
    const j=activeJourney(storage);
    if(!j)return {switchOn:on,journey:null,timer:null,summary:null};
    const timer=read(storage,j.id);
    return {
      switchOn:on,journey:{id:j.id,module:j.module,date:j.date},timer,
      summary:timer?summarize(timer,completions(readEvents(storage),j.id),{nowMs}):null
    };
  }

  function format(msValue){
    if(msValue===null||msValue===undefined||!Number.isFinite(msValue))return 'No medido';
    const s=Math.floor(msValue/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=s%60;
    const two=n=>String(n).padStart(2,'0');
    return h?h+':'+two(m)+':'+two(r):two(m)+':'+two(r);
  }

  const api=Object.freeze({KEY,VERSION,read,start,setPaused,isPaused,pausedBetween,completions,summarize,status,format});
  root.CNFLOperationalTimer=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
