const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

function fixture(mode='residencial', initialReading='') {
  const orders=[{
    localizacion:'0101000050',medidor:'123456',status:'pending',
    lectura:initialReading,sourceRoute:'R01',gpsStatus:'missing'
  }];
  const cards={
    currentReadingCard:{innerHTML:''},
    nextReadingCard:{innerHTML:''},
    readingList:{innerHTML:''},
    cnflResidentialReadingInput:{value:initialReading,focused:false,focus(){this.focused=true;}}
  };
  const saves=[],events=[],toasts=[],reports=[];
  let ctx;
  ctx=vm.createContext({
    READING_MODE:mode,readingOrders:orders,readingSearch:'',
    readingRouteInfo:{routeId:'ficticia',name:'Ruta ficticia',subtitle:'',date:'2026-11-16'},
    readingRouteMeta:null,
    document:{getElementById:id=>cards[id]||null},
    navigator:{clipboard:{writeText(text){reports.push(text);return Promise.resolve();}}},
    loadReadingState(){},restoreReadingRoute(){},renderCurrent(){},renderList(){},
    renderSummary(){},resetReadingDay(){},
    renderAll(){},saveReadingState(){saves.push(JSON.parse(JSON.stringify(ctx.readingOrders)));},
    archiveReadingEvent(order){events.push({...order});},
    gpsLabel(){return {cls:'',text:'SIN GPS'};},
    escapeHtml(value){return String(value).replace(/[&<>"']/g,'');},
    showReadingToast(message){toasts.push(message);},
    routeDisplayName(){return 'Ruta ficticia';},
    loadJson(){return {};},
    localDateKey(){return '2026-11-16';},
    console
  });
  ctx.window=ctx;
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../lectura-ux.js'),'utf8'),ctx);
  return {ctx,orders,cards,saves,events,toasts,reports};
}

test('residencial muestra espacio para lectura existente sin borrar valor',()=>{
  const f=fixture('residencial','00258');
  f.ctx.renderCurrent();
  assert.match(f.cards.currentReadingCard.innerHTML,/LECTURA DEL MEDIDOR/);
  assert.match(f.cards.currentReadingCard.innerHTML,/inputmode="decimal"/);
  assert.match(f.cards.currentReadingCard.innerHTML,/value="00258"/);
  assert.match(f.cards.currentReadingCard.innerHTML,/markCurrentVisit/);
});

test('residencial guarda borrador y registra lectura al visitar',()=>{
  const f=fixture();
  assert.equal(f.ctx.saveResidentialReadingDraft('12345'),true);
  assert.equal(f.orders[0].lectura,'12345');
  assert.equal(f.orders[0].status,'pending');
  assert.equal(f.saves.at(-1)[0].lectura,'12345');
  f.cards.cnflResidentialReadingInput.value='12345';
  f.ctx.markCurrentVisit();
  assert.equal(f.orders[0].status,'read');
  assert.equal(f.events[0].lectura,'12345');
  assert.equal(f.saves.at(-1)[0].lectura,'12345');
});

test('lectura incorrecta no sobrescribe borrador ni marca visitado',()=>{
  const f=fixture('residencial','98');
  f.cards.cnflResidentialReadingInput.value='texto';
  f.ctx.markCurrentVisit();
  assert.equal(f.orders[0].status,'pending');
  assert.equal(f.orders[0].lectura,'98');
  assert.equal(f.events.length,0);
  assert.equal(f.cards.cnflResidentialReadingInput.focused,true);
  assert.match(f.toasts.join(' '),/solo números/);
});

test('reportes residenciales contienen lectura capturada',async()=>{
  const f=fixture('residencial','12345');
  f.ctx.copyReadingSummary();
  assert.equal(f.reports.length,1);
  assert.match(f.reports[0],/Lectura 12345/);
});

test('Demanda conserva el flujo anterior sin exigir ni mostrar lectura residencial',()=>{
  const f=fixture('demanda');
  f.ctx.renderCurrent();
  assert.doesNotMatch(f.cards.currentReadingCard.innerHTML,/cnflResidentialReadingInput/);
  f.ctx.markCurrentVisit();
  assert.equal(f.orders[0].status,'read');
  assert.equal(f.ctx.saveResidentialReadingDraft('12345'),false);
});
