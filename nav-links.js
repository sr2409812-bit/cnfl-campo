/* Etapa 2b — Waze y Maps sin señal.
   Los botones WAZE y MAPS usan enlaces web (waze.com/ul, google.com/maps), que se
   abren en una pestaña del navegador: sin internet esa pestaña no carga y nunca
   llega a la app. En Android, al tocar un enlace con coordenadas se abre la app
   directamente con su enlace propio, que no necesita red para recibir el destino:
   - Waze: waze://?ll=lat,lon&navigate=yes
   - Maps: geo:lat,lon?q=lat,lon (abre Google Maps u otra app de mapas)
   En iPhone y en computadora no cambia nada (los enlaces universales ya abren la app).
   Las búsquedas por dirección (sin coordenadas) se dejan igual: necesitan red.
   Sin GPS del teléfono, sin red y sin datos guardados. */
(function(root){
  'use strict';
  const COORD=/^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

  function parse(href){
    let u;
    try{u=new URL(href);}catch(_){return null;}
    if(u.protocol!=='https:'&&u.protocol!=='http:')return null;
    const host=u.hostname.replace(/^www\./,'');
    let kind,raw;
    if(host==='waze.com'&&u.pathname.startsWith('/ul')){kind='waze';raw=u.searchParams.get('ll');}
    else if(host==='google.com'&&u.pathname.startsWith('/maps')){kind='maps';raw=u.searchParams.get('query')||u.searchParams.get('destination');}
    else return null;
    const m=COORD.exec(raw||'');
    if(!m)return {kind,coords:null};
    const lat=Number(m[1]),lon=Number(m[2]);
    if(Math.abs(lat)>90||Math.abs(lon)>180)return {kind,coords:null};
    return {kind,coords:m[1]+','+m[2]};
  }

  // Devuelve el enlace a la app o null si se debe dejar el enlace original.
  function appUrl(href,userAgent){
    if(!/Android/i.test(String(userAgent||'')))return null;
    const p=parse(href);
    if(!p||!p.coords)return null;
    return p.kind==='waze'
      ?'waze://?ll='+p.coords+'&navigate=yes'
      :'geo:'+p.coords+'?q='+p.coords;
  }

  function install(doc,nav,loc){
    if(!doc||typeof doc.addEventListener!=='function')return false;
    doc.addEventListener('click',event=>{
      const a=event.target&&typeof event.target.closest==='function'?event.target.closest('a[href]'):null;
      if(!a||a.classList.contains('disabled'))return;
      const url=appUrl(a.href,nav&&nav.userAgent);
      if(!url)return;
      event.preventDefault();
      loc.href=url;
    },true);
    return true;
  }

  const api=Object.freeze({parse,appUrl,install});
  root.CNFLNavLinks=api;
  if(typeof document!=='undefined'&&typeof location!=='undefined')install(document,root.navigator,location);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
