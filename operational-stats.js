/* M10-002 — Motor puro de estadística operativa. No lee ni escribe almacenamiento,
   no escucha eventos de UI, no solicita GPS, no realiza peticiones de red.
   Integración y activación fuera del alcance de esta etapa. */
(function(root){
  'use strict';

  const SCHEMA_VERSION=1;
  const MODULES=Object.freeze(['cortes','demanda','residencial','notificaciones']);
  const EVENT_TYPES=Object.freeze([
    'order_completed','order_reopened','order_undo','journey_opened','journey_closed'
  ]);
  const FUTURE_EVENT_TYPES=Object.freeze([
    'travel_started','travel_arrived','pause_started','pause_ended'
  ]);
  const QUALITIES=Object.freeze(['observed','estimated','incomplete','invalid']);
  const FIELD_NAMES=new Set([
    'schemaVersion','eventId','journeyId','module','operationalDay','orderKey',
    'eventType','at','recordedAt','source','quality','sourceEventId','payload'
  ]);
  const utc=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
  const day=/^\d{4}-\d\d-\d\d$/;
  const token=/^[A-Za-z0-9_.:-]{1,128}$/;
  const opaqueOrder=/^ord_[a-f0-9]{32}$/;
  const sourceToken=/^[a-z][a-z0-9._-]{0,63}$/;

  function validIso(s){
    if(typeof s!=='string'||!utc.test(s))return false;
    const d=new Date(s);
    return Number.isFinite(d.getTime())&&d.toISOString()===s;
  }
  function validDay(s){
    if(typeof s!=='string'||!day.test(s))return false;
    const d=new Date(s+'T00:00:00.000Z');
    return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;
  }
  function operationalDayFromIso(iso){
    if(!validIso(iso))return null;
    const p=new Intl.DateTimeFormat('en-US',{
      timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit',
      hour:'2-digit',hourCycle:'h23'
    }).formatToParts(new Date(iso));
    const v=Object.fromEntries(p.map(x=>[x.type,x.value]));
    const utcDay=Date.UTC(Number(v.year),Number(v.month)-1,
      Number(v.day)-(Number(v.hour)<6?1:0));
    return new Date(utcDay).toISOString().slice(0,10);
  }
  function validateEvent(input){
    const errors=[];
    if(!input||typeof input!=='object'||Array.isArray(input))
      return {ok:false,errors:['not_object']};
    for(const key of Object.keys(input)){
      if(!FIELD_NAMES.has(key))errors.push('unknown_field:'+key);
    }
    if(input.schemaVersion!==SCHEMA_VERSION)errors.push('schema_version');
    if(typeof input.eventId!=='string'||!token.test(input.eventId))errors.push('event_id');
    if(typeof input.journeyId!=='string'||!token.test(input.journeyId))errors.push('journey_id');
    if(!MODULES.includes(input.module))errors.push('module');
    if(!validDay(input.operationalDay))errors.push('operational_day');
    if(!EVENT_TYPES.includes(input.eventType))errors.push('event_type');
    if(!validIso(input.at))errors.push('occurred_at');
    if(!validIso(input.recordedAt))errors.push('recorded_at');
    if(!sourceToken.test(input.source||''))errors.push('source');
    if(!QUALITIES.includes(input.quality))errors.push('quality');
    if(validIso(input.at)&&validIso(input.recordedAt)&&
       Date.parse(input.recordedAt)<Date.parse(input.at))
      errors.push('recorded_before_occurrence');
    if(validIso(input.at)&&validDay(input.operationalDay)&&
       operationalDayFromIso(input.at)!==input.operationalDay)
      errors.push('operational_day_mismatch');
    const orderEvent=['order_completed','order_reopened','order_undo'].includes(input.eventType);
    if(orderEvent){
      if(typeof input.orderKey!=='string'||!opaqueOrder.test(input.orderKey))
        errors.push('order_key_not_opaque');
    }else if(input.orderKey!==null){
      errors.push('journey_event_order_key_must_be_null');
    }
    const correction=['order_reopened','order_undo'].includes(input.eventType);
    if(correction){
      if(typeof input.sourceEventId!=='string'||!token.test(input.sourceEventId))
        errors.push('correction_source_required');
    }else if(input.sourceEventId!==undefined&&input.sourceEventId!==null){
      errors.push('unexpected_source_event');
    }
    // Reservado: ningún dato de cliente, lectura, ubicación ni trazas en v1.
    if(input.payload!==undefined&&
      (!input.payload||typeof input.payload!=='object'||
       Array.isArray(input.payload)||Object.keys(input.payload).length!==0))
      errors.push('payload_not_allowed_v1');
    if(errors.length)return {ok:false,errors};
    return {ok:true,event:{
      schemaVersion:SCHEMA_VERSION,eventId:input.eventId,journeyId:input.journeyId,
      module:input.module,operationalDay:input.operationalDay,
      orderKey:input.orderKey,eventType:input.eventType,
      at:input.at,recordedAt:input.recordedAt,
      source:input.source,quality:input.quality,
      sourceEventId:input.sourceEventId||null
    }};
  }

  function percentileNearestRank(sorted,p){
    if(!sorted.length)return null;
    return sorted[Math.ceil(sorted.length*p)-1];
  }
  function median(sorted){
    if(!sorted.length)return null;
    const mid=Math.floor(sorted.length/2);
    return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
  }
  function assertScope(scope){
    if(!scope||typeof scope!=='object'||Array.isArray(scope)||
       typeof scope.journeyId!=='string'||!token.test(scope.journeyId)||
       !MODULES.includes(scope.module)||!validDay(scope.operationalDay))
      throw new TypeError('Se requiere journeyId, module y operationalDay válidos');
    return {journeyId:scope.journeyId,module:scope.module,
      operationalDay:scope.operationalDay};
  }
  function summarizeJourney(inputEvents,scope){
    if(!Array.isArray(inputEvents))throw new TypeError('events debe ser un arreglo');
    const target=assertScope(scope);
    const issues=[],seen=new Map(),conflicted=new Set();
    let rejected=0,outsideScope=0,duplicates=0;
    inputEvents.forEach((input,index)=>{
      const result=validateEvent(input);
      if(!result.ok){
        rejected++;
        issues.push({code:'invalid_event',index,reasons:result.errors});
        return;
      }
      const e=result.event;
      if(e.journeyId!==target.journeyId||
         e.module!==target.module||e.operationalDay!==target.operationalDay){
        outsideScope++;
        return;
      }
      const fingerprint=JSON.stringify(e);
      if(seen.has(e.eventId)){
        if(seen.get(e.eventId).fingerprint===fingerprint)duplicates++;
        else{
          conflicted.add(e.eventId);
          issues.push({code:'conflicting_event_id',eventId:e.eventId});
        }
      }else seen.set(e.eventId,{event:e,fingerprint});
    });
    const ordered=[...seen].filter(([id])=>!conflicted.has(id))
      .map(([,entry])=>entry.event).sort((a,b)=>
        a.at.localeCompare(b.at)||
        (a.eventType==='order_completed'?-1:0)-
        (b.eventType==='order_completed'?-1:0)||
        a.eventId.localeCompare(b.eventId));

    // Detectar reloj desplazado usando el orden de persistencia, sin
    // rellenar intervalos basados en marcas temporales contradictorias.
    const byRecorded=ordered.filter(e=>
      e.eventType==='order_completed'&&e.quality==='observed')
      .slice().sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt)||
        a.eventId.localeCompare(b.eventId));
    let clockDiscontinuity=false;
    for(let i=1;i<byRecorded.length;i++){
      if(byRecorded[i].recordedAt!==byRecorded[i-1].recordedAt&&
         byRecorded[i].at<byRecorded[i-1].at){
        clockDiscontinuity=true;break;
      }
    }
    if(clockDiscontinuity)issues.push({code:'clock_discontinuity'});

    const active=new Map(),completions=new Map();
    for(const e of ordered){
      if(e.quality!=='observed'){
        issues.push({code:'event_not_observed',eventId:e.eventId});
        continue;
      }
      if(e.eventType==='order_completed'){
        completions.set(e.eventId,e);
        if(active.has(e.orderKey)){
          issues.push({code:'duplicate_order_completion',eventId:e.eventId});
          continue;
        }
        active.set(e.orderKey,e);
      }else if(e.eventType==='order_reopened'||e.eventType==='order_undo'){
        const prior=completions.get(e.sourceEventId);
        if(!prior||prior.orderKey!==e.orderKey){
          issues.push({code:'orphan_correction',eventId:e.eventId});
          continue;
        }
        if(active.get(e.orderKey)?.eventId!==e.sourceEventId){
          issues.push({code:'stale_correction',eventId:e.eventId});
          continue;
        }
        active.delete(e.orderKey);
      }
    }
    const effective=[...active.values()].sort((a,b)=>
      a.at.localeCompare(b.at)||a.eventId.localeCompare(b.eventId));
    const completedCount=effective.length;
    const first=completedCount?effective[0].at:null;
    const last=completedCount?effective[completedCount-1].at:null;
    const gaps=[];
    for(let i=1;i<completedCount;i++){
      const delta=Date.parse(effective[i].at)-Date.parse(effective[i-1].at);
      if(delta>0)gaps.push(delta);
      else issues.push({code:'nonpositive_interval',
        eventId:effective[i].eventId});
    }
    const sorted=gaps.slice().sort((a,b)=>a-b);
    const elapsed=completedCount>=2?Date.parse(last)-Date.parse(first):null;
    const usable=!clockDiscontinuity;
    const period=usable?elapsed:null;
    const intervals=usable?gaps:[];
    const orderedGaps=usable?sorted:[];
    const mean=intervals.length?
      intervals.reduce((sum,n)=>sum+n,0)/intervals.length:null;
    return {
      schemaVersion:SCHEMA_VERSION,...target,
      counts:{
        inputEvents:inputEvents.length,validatedEvents:ordered.length,
        rejectedEvents:rejected,outsideScopeEvents:outsideScope,
        duplicateEventIds:duplicates,conflictingEventIds:conflicted.size,
        completedOrders:completedCount,validIntervals:intervals.length,
        omittedNonpositiveIntervals:completedCount>1?completedCount-1-gaps.length:0
      },
      firstCompletedAt:first,lastCompletedAt:last,
      observedWindowMs:period,intervalsMs:intervals,
      meanIntervalMs:mean,medianIntervalMs:median(orderedGaps),
      p90IntervalMs:percentileNearestRank(orderedGaps,0.9),
      completedOrdersPerHour:period!==null&&period>0?
        completedCount*3600000/period:null,
      quality:clockDiscontinuity?'invalid_timing':
        (issues.length||rejected?'incomplete':'observed'),
      // No se miden estos campos con eventos de finalización aislados.
      attentionMs:null,travelMs:null,roadDistanceMeters:null,
      gpsDistanceMeters:null,averageTravelSpeedKmh:null,
      issues
    };
  }
  const api=Object.freeze({
    SCHEMA_VERSION,MODULES,EVENT_TYPES,FUTURE_EVENT_TYPES,QUALITIES,
    operationalDayFromIso,validateEvent,summarizeJourney
  });
  root.CNFLOperationalStats=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
