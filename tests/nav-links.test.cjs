const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const nav=require('../nav-links.js');
const ANDROID='Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36';
const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
// Coordenadas ficticias (no corresponden a órdenes reales).
const LL='9.9,-84.1';

test('etapa 2b: en Android, WAZE abre la app de Waze con las coordenadas',()=>{
  assert.equal(nav.appUrl('https://www.waze.com/ul?ll='+LL+'&navigate=yes',ANDROID),'waze://?ll='+LL+'&navigate=yes');
});

test('etapa 2b: en Android, MAPS abre una app de mapas con geo: (búsqueda y ruta)',()=>{
  assert.equal(nav.appUrl('https://www.google.com/maps/search/?api=1&query='+LL,ANDROID),'geo:'+LL+'?q='+LL);
  assert.equal(nav.appUrl('https://www.google.com/maps/dir/?api=1&destination='+LL,ANDROID),'geo:'+LL+'?q='+LL);
});

test('etapa 2b: iPhone, búsquedas por dirección y otros enlaces quedan igual',()=>{
  assert.equal(nav.appUrl('https://www.waze.com/ul?ll='+LL+'&navigate=yes',IPHONE),null);
  assert.equal(nav.appUrl('https://waze.com/ul?q='+encodeURIComponent('Calle Ficticia, San José'),ANDROID),null);
  assert.equal(nav.appUrl('https://www.google.com/maps/search/?api=1&query=Calle%20Ficticia',ANDROID),null);
  assert.equal(nav.appUrl('https://example.com/ul?ll='+LL,ANDROID),null);
  assert.equal(nav.appUrl('#',ANDROID),null);
  assert.equal(nav.appUrl('https://www.waze.com/ul?ll=999,-84.1',ANDROID),null,'coordenadas fuera de rango');
});

test('etapa 2b: el clic se intercepta solo cuando hay enlace de app y no en botones deshabilitados',()=>{
  let handler,prevented=0;const loc={href:''};
  const doc={addEventListener(type,fn,capture){assert.equal(type,'click');assert.equal(capture,true);handler=fn;}};
  nav.install(doc,{userAgent:ANDROID},loc);
  const link=(href,disabled=false)=>({target:{closest:()=>({href,classList:{contains:c=>disabled&&c==='disabled'}})},preventDefault(){prevented++;}});
  handler(link('https://www.waze.com/ul?ll='+LL+'&navigate=yes'));
  assert.equal(loc.href,'waze://?ll='+LL+'&navigate=yes');assert.equal(prevented,1);
  loc.href='';handler(link('https://www.waze.com/ul?ll='+LL+'&navigate=yes',true));
  assert.equal(loc.href,'');assert.equal(prevented,1);
  handler(link('https://www.google.com/maps/search/?api=1&query=Calle'));
  assert.equal(loc.href,'');assert.equal(prevented,1);
});

test('etapa 2b: las páginas con Waze/Maps cargan nav-links.js y el service worker lo precarga',()=>{
  for(const page of ['index.html','lectura.html','lectura-residencial.html','notificaciones.html','mapa.html']){
    const html=fs.readFileSync(path.join(__dirname,'..',page),'utf8');
    const i=html.indexOf('nav-links.js?v='),shell=html.indexOf('campo-shell.js?v=');
    assert.ok(i>0&&shell>i,page);
  }
  const sw=fs.readFileSync(path.join(__dirname,'..','sw.js'),'utf8');
  const core=sw.slice(sw.indexOf('CORE_ASSETS'),sw.indexOf('OPTIONAL_ASSETS'));
  assert.ok(core.includes("'./nav-links.js'"));
  const src=fs.readFileSync(path.join(__dirname,'..','nav-links.js'),'utf8');
  assert.ok(!/geolocation|fetch\(|XMLHttpRequest|localStorage|indexedDB/.test(src),'sin GPS, red ni almacenamiento');
});
