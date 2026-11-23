/* M10 · Capa 0 — Interruptor "Medir tiempos".
   Apagado por defecto. Falla cerrado: si el valor no existe, está dañado o el
   almacenamiento no responde, la medición queda APAGADA y nunca se lanza un error
   hacia el trabajo de campo. No lo carga ninguna página en esta capa. */
(function(root){
  'use strict';

  const KEY='cnfl_operation_capture_v1';
  const VERSION=1;

  function iso(now){
    const d=now instanceof Date?now:new Date();
    return Number.isFinite(d.getTime())?d.toISOString():null;
  }

  // Devuelve siempre un estado válido; cualquier anomalía equivale a apagado.
  function read(storage){
    const off={enabled:false,changedAt:null,source:'default'};
    let text;
    try{text=storage&&typeof storage.getItem==='function'?storage.getItem(KEY):null;}
    catch(_){return {...off,source:'unavailable'};}
    if(text===null||text===undefined)return off;
    let raw;
    try{raw=JSON.parse(text);}catch(_){return {...off,source:'invalid'};}
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.version!==VERSION||
       typeof raw.enabled!=='boolean'||
       (raw.changedAt!==null&&typeof raw.changedAt!=='string'))return {...off,source:'invalid'};
    return {enabled:raw.enabled,changedAt:raw.changedAt,source:'stored'};
  }

  function isEnabled(storage){
    return read(storage).enabled===true;
  }

  // Acción explícita de la persona. Solo escribe su propia clave.
  function setEnabled(storage,enabled,now=new Date()){
    if(typeof enabled!=='boolean')return {ok:false,error:'invalid_value'};
    const value={version:VERSION,enabled,changedAt:iso(now)};
    try{storage.setItem(KEY,JSON.stringify(value));}
    catch(_){return {ok:false,error:'storage_unavailable'};}
    const after=read(storage);
    if(after.enabled!==enabled)return {ok:false,error:'not_persisted'};
    return {ok:true,enabled,changedAt:value.changedAt};
  }

  // Ejecuta una captura opcional solo con el interruptor encendido.
  // Nunca propaga errores: una falla de medición no interrumpe una gestión.
  function guard(storage,capture){
    if(typeof capture!=='function'||!isEnabled(storage))return false;
    try{
      const result=capture();
      if(result&&typeof result.then==='function')return result.catch(()=>false);
      return result;
    }catch(_){return false;}
  }

  const api=Object.freeze({KEY,VERSION,read,isEnabled,setEnabled,guard});
  root.CNFLCaptureSwitch=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
