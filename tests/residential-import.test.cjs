const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(existing = []) {
  const elements = Object.fromEntries(['readingPdfStatus', 'newRouteData', 'newRouteName', 'readingPdfReview', 'tabRoute']
    .map(id => [id, {hidden:true, style:{}, className:'', innerHTML:'', textContent:'', value:'', scrollIntoView() {}}]));
  const memory = new Map();
  const alerts = [];
  const context = vm.createContext({
    console: {log() {}, error() {}},
    Date, Map, Set, Number, String, Array,
    document: {getElementById:id => elements[id]},
    localStorage: {
      getItem:key => memory.has(key) ? memory.get(key) : null,
      setItem:(key,value) => memory.set(key, value),
      removeItem:key => memory.delete(key)
    },
    pdfjsLib: {GlobalWorkerOptions:{}, getDocument:() => ({promise:Promise.resolve({numPages:1,getPage:async () => ({getTextContent:async () => ({items:[]})})})})},
    alert:message => alerts.push(message),
    renderAll() {}, hydrateReadingGps() {}, switchReadingTab() {}, showReadingToast() {},
    escapeHtml:value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;'),
    localDateKey:() => '2026-10-26',
    saveReadingState() {
      memory.set('reading', JSON.stringify(context.readingOrders));
    }
  });
  context.readingOrders = existing;
  context.readingRouteInfo = existing.length
    ? {routeId:'day-1',name:'Jornada',date:'2026-10-26'}
    : {routeId:'reading-empty',date:'2026-10-26'};
  context.readingRouteMeta = null;
  context.READING_MODE = 'residencial';
  context.READING_KEY = 'reading';
  context.READING_ROUTE_HISTORY_KEY = 'history';
  context.mockRows = [];
  vm.runInContext(fs.readFileSync('lectura-pdf-v4.js','utf8'), context);
  vm.runInContext(`parseReadingPdfLayout = () => ({rows:mockRows}); readingPdfRouteCode = () => 'R1'; readingPdfSuggestedName = () => 'R1';`, context);
  const upload = () => vm.runInContext(`handleReadingPdfUpload({target:{files:[{name:'ruta.pdf',arrayBuffer:async()=>new ArrayBuffer(0)}],value:'ruta.pdf'}})`, context);
  const confirm = () => vm.runInContext('confirmResidentialPdfImport()', context);
  const cancel = () => vm.runInContext('cancelResidentialPdfImport()', context);
  return {context,elements,memory,alerts,upload,confirm,cancel};
}

test('preview and cancel leave a prior visit untouched', async () => {
  const prior = [{localizacion:'0101000050',medidor:'925995',status:'read',readAt:'2026-10-26T10:00:00Z',sourceRoute:'R1'}];
  const app = setup(prior);
  app.context.mockRows = [{localizacion:'0101200320',medidor:'706602'}];
  await app.upload();
  assert.equal(app.context.readingOrders.length,1);
  assert.equal(app.memory.has('reading'),false);
  assert.match(app.elements.readingPdfReview.innerHTML,/AGREGAR A JORNADA/);
  app.cancel();
  assert.equal(app.context.readingOrders[0].status,'read');
  assert.equal(app.elements.readingPdfReview.hidden,true);
});

test('confirm commits new rows and preserves visits', async () => {
  const app = setup([{localizacion:'0101000050',medidor:'925995',status:'read',readAt:'2026-10-26T10:00:00Z',sourceRoute:'R1'}]);
  app.context.mockRows = [{localizacion:'0101200320',medidor:'706602'}];
  await app.upload();
  app.confirm();
  assert.equal(app.context.readingOrders.length,2);
  assert.equal(app.context.readingOrders[0].status,'read');
  assert.equal(app.context.readingOrders[1].status,'pending');
  assert.equal(JSON.parse(app.memory.get('reading')).length,2);
});

test('conflicting meter for a visited location cannot modify the jornada', async () => {
  const app = setup([{localizacion:'0101000050',medidor:'925995',status:'read'}]);
  app.context.mockRows = [{localizacion:'0101000050',medidor:'123456'}];
  await app.upload();
  assert.equal(app.context.readingOrders[0].medidor,'925995');
  assert.equal(app.memory.has('reading'),false);
  assert.equal(app.elements.readingPdfReview.hidden,true);
  assert.match(app.alerts[0],/ya tiene una lectura guardada/);
});

test('two PDFs disagreeing on a location are rejected before saving', async () => {
  const app = setup();
  app.context.mockRows = [{localizacion:'0101000050',medidor:'925995'}, {localizacion:'0101000050',medidor:'123456'}];
  await app.upload();
  assert.equal(app.context.readingOrders.length,0);
  assert.match(app.alerts[0],/medidores distintos/);
});
