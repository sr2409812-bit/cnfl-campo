/* M10-004 — SOLO DEMOSTRACIÓN. Eventos ficticios constantes, jamás datos del teléfono.
 * No localStorage, IndexedDB, navigator, GPS, red ni observación de jornadas. */
(function(root){
  'use strict';
  const scope=Object.freeze({
    journeyId:'demo:demanda:20261118',
    module:'demanda',operationalDay:'2026-11-18'
  });
  const keys=['a','b','c','d','e'].map(char=>'ord_'+char.repeat(32));
  function iso(minute){
    return new Date(Date.UTC(2026,10,18,15,minute)).toISOString();
  }
  function completion(index,minute,options={}){
    return {
      schemaVersion:1,eventId:'demo-event-'+index,
      ...scope,orderKey:keys[index],eventType:'order_completed',
      at:iso(minute),recordedAt:options.recordedAt||iso(minute),
      source:'demo',quality:'observed'
    };
  }
  function scenarios(){
    const normal=[completion(0,0),completion(1,12),completion(2,27),completion(3,45)];
    const reopened=[...normal.slice(0,2),{
      schemaVersion:1,eventId:'demo-reopened-b',...scope,
      orderKey:keys[1],eventType:'order_reopened',
      at:iso(16),recordedAt:iso(16),source:'demo',quality:'observed',
      sourceEventId:'demo-event-1'
    },...normal.slice(2)];
    const incomplete=[...normal,{eventId:'ejemplo-invalido'}];
    const clockRollback=[...normal,
      completion(4,30,{recordedAt:iso(60)})];
    return Object.freeze({
      normal:Object.freeze({
        label:'Normal',description:'4 órdenes ficticias sin anomalías detectadas.',
        events:normal
      }),
      incomplete:Object.freeze({
        label:'Incompleto',description:'Se añadió un evento inválido; se excluye del cálculo.',
        events:incomplete
      }),
      clock:Object.freeze({
        label:'Reloj alterado',description:'Una marca de tiempo retrocede respecto al orden de registro.',
        events:clockRollback
      }),
      reopened:Object.freeze({
        label:'Reapertura',description:'Una orden se reabre; no cuenta como finalización vigente.',
        events:reopened
      }),
      empty:Object.freeze({
        label:'Sin datos',description:'Ningún evento disponible para calcular promedios.',
        events:[]
      })
    });
  }
  const fixtures=Object.freeze({scope,scenarios});
  root.CNFLStatsDemoFixtures=fixtures;
  if(typeof module!=='undefined'&&module.exports)module.exports=fixtures;
})(typeof window==='undefined'?globalThis:window);
