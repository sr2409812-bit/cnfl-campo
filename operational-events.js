/* M10-003 — Captura opcional de métricas, aislada de órdenes y sus históricos.
   Sin GPS, red, temporizadores ni modificaciones a estructuras de campo.
   Solo almacena eventos seudónimos; los errores NO bloquean las gestiones. */
(function(root){
  'use strict';
  const STORE_KEY='cnfl_operation_events_v1';
  const LOCK_NAME='cnfl-operation-events-v1';
  const VERSION=1;
  const MAX_EVENTS=6000;
  const MAX_JSON_CHARS=1000000;
  const MODULES=['cortes','demanda','residencial','notificaciones'];
  let queue=Promise.resolve();

  function bytesHex(bytes){
    return [...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  }
  function randomBytes(count){
    const crypto=root.crypto;
    if(!crypto||typeof crypto.getRandomValues!=='function')return null;
    return crypto.getRandomValues(new Uint8Array(count));
  }
  function validLedger(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.version!==VERSION||
       !/^[0-9a-f]{64}$/.test(raw.secret)||!Array.isArray(raw.events)||
       raw.events.length>MAX_EVENTS)return false;
    // No reemplazar un registro malformado con un array vacío.
    if(!root.CNFLOperationalStats)return false;
    return raw.events.every(e=>root.CNFLOperationalStats.validateEvent(e).ok);
  }
  function readLedger(){
    const text=root.localStorage.getItem(STORE_KEY);
    if(text===null)return null;
    if(text.length>MAX_JSON_CHARS)throw Error('ledger_oversize');
    let raw;
    try{raw=JSON.parse(text);}catch(_){throw Error('ledger_corrupt');}
    if(!validLedger(raw))throw Error('ledger_invalid');
    return raw;
  }
  function initLedger(){
    const secret=randomBytes(32);
    if(!secret)throw Error('secure_random_unavailable');
    return {version:VERSION,secret:bytesHex(secret),events:[]};
  }
  async function opaqueKey(secret,module,journeyId,identity){
    if(!root.crypto?.subtle?.digest||typeof root.TextEncoder!=='function')
      throw Error('crypto_unavailable');
    // El secreto local aleatorio impide un hash determinista sin sal.
    // La clave no es anonimización fuerte si se expone el respaldo completo.
    const input=new root.TextEncoder().encode(
      'cnfl-operational-v1|'+secret+'|'+journeyId+'|'+module+'|'+identity
    );
    const digest=await root.crypto.subtle.digest('SHA-256',input);
    return 'ord_'+bytesHex(new Uint8Array(digest).slice(0,16));
  }
  function activeJourney(module){
    const j=root.CNFLJourney;
    if(!j||!MODULES.includes(module))return null;
    const active=j.read(root.localStorage).active;
    if(!active||active.finishedAt||active.module!==module||
       typeof active.id!=='string')return null;
    return active;
  }
  function activeCompletion(events,journeyId,orderKey){
    let current=null;
    for(const e of events){
      if(e.journeyId!==journeyId||e.orderKey!==orderKey||
         e.quality!=='observed')continue;
      if(e.eventType==='order_completed')current=current||e;
      else if((e.eventType==='order_reopened'||e.eventType==='order_undo')&&
              current?.eventId===e.sourceEventId)current=null;
    }
    return current;
  }
  function uniqueAt(events,proposed){
    // Dos cambios muy próximos pueden tener el mismo milisegundo.
    // Normalizar únicamente empate; el reloj regresado debe quedar detectable.
    if(events.length&&events[events.length-1].at===proposed){
      return new Date(Date.parse(proposed)+1).toISOString();
    }
    return proposed;
  }
  async function appendAfterPersist(input){
    const {module,identity,previousDone,done,source,undo}=input;
    if(!MODULES.includes(module)||typeof identity!=='string'||
       !identity.trim()||identity.length>512||
       typeof previousDone!=='boolean'||typeof done!=='boolean'||
       previousDone===done||!/^[a-z][a-z0-9._-]{0,63}$/.test(source||''))
      return false;
    const j=activeJourney(module);
    if(!j)return false;
    const stats=root.CNFLOperationalStats;
    if(!stats||!root.navigator?.locks?.request)return false;
    const occurred=typeof input.at==='string'?input.at:new Date().toISOString();
    if(!stats.operationalDayFromIso(occurred))return false;
    return root.navigator.locks.request(LOCK_NAME,{mode:'exclusive'},async()=>{
      // Revalidar estado de jornada al obtener el bloqueo.
      const fresh=activeJourney(module);
      if(!fresh||fresh.id!==j.id)return false;
      const ledger=readLedger()||initLedger();
      if(ledger.events.length>=MAX_EVENTS)return false;
      const orderKey=await opaqueKey(ledger.secret,module,j.id,identity);
      const prior=activeCompletion(ledger.events,j.id,orderKey);
      if(done&&prior)return false;
      if(!done&&!prior)return false;
      const at=uniqueAt(ledger.events,occurred);
      const recordedAt=new Date(Math.max(Date.now(),Date.parse(at))).toISOString();
      const rand=randomBytes(16);
      if(!rand)return false;
      const event={
        schemaVersion:VERSION,eventId:'ev_'+bytesHex(rand),journeyId:j.id,
        module,operationalDay:stats.operationalDayFromIso(at),
        orderKey,eventType:done?'order_completed':
          (undo===true?'order_undo':'order_reopened'),
        at,recordedAt,source,quality:'observed'
      };
      if(!done)event.sourceEventId=prior.eventId;
      if(!stats.validateEvent(event).ok)return false;
      const updated={...ledger,events:[...ledger.events,event]};
      const json=JSON.stringify(updated);
      if(json.length>MAX_JSON_CHARS)return false;
      root.localStorage.setItem(STORE_KEY,json);
      return true;
    });
  }
  function captureTransition(input){
    // Capturar el instante del clic ANTES de esperar el mutex: la espera
    // por crypto/almacenamiento no debe añadirse al intervalo entre órdenes.
    const captured=input&&typeof input==='object'?
      {...input,at:input.at??new Date().toISOString()}:input;
    // El llamador nunca depende del resultado de telemetría.
    // Serializar las llamadas dentro de la misma pestaña; Web Locks protege
    // la escritura entre pestañas Chrome. Sin Web Locks, fallar cerrado.
    const promise=queue.then(()=>appendAfterPersist(captured)).catch(()=>false);
    queue=promise.then(()=>undefined);
    return promise;
  }
  function flush(){return queue;}
  const api=Object.freeze({STORE_KEY,captureTransition,flush});
  root.CNFLOperationalEvents=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
