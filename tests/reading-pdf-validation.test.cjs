const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exclusivamente texto y coordenadas sintéticos; no se abre ningún PDF real.
const source = fs.readFileSync('lectura-pdf-v4.js', 'utf8');
const item = (str, x, y) => ({str, transform:[1,0,0,1,x,y]});
const location = index => String(2010000000 + index);
const contract = '654321'; // También podría parecer un medidor mecánico.
const meters = ['123456', '723456', '823456', '923456', '1023456', '1123456', '1223456', '1423456', '1523456', '2723456'];
function parser() {
  const context = vm.createContext({console:{log() {}, error() {}}});
  vm.runInContext(source, context);
  return context;
}
function documentOf(pages) {
  return {pages, text:pages.flat().map(i => i.str).join('\n')};
}
function table({kind='missing', order=['Localización','Medidor','Contrato'], records=[{loc:location(1), med:meters[1]}], total=null}={}) {
  const title = kind==='missing' ? 'MEDIDORES SIN REGISTRO DE LECTURA' : 'LECTURA DE DEMANDA';
  const page = [item(title,20,780), ...order.map((name,i) => item(name,20+i*100,700))];
  records.forEach((record,index) => {
    order.forEach((name,col) => {
      const value = name==='Medidor' ? record.med : name==='Contrato' ? contract : record.loc;
      if (value !== undefined) page.push(item(value,20+col*100,670-index*25));
    });
  });
  if (total !== null) page.push(item('Total Medidores: '+total,20,100));
  return documentOf([page]);
}
function labeled({title=true, records=[{loc:location(1), med:meters[1]}], total=null, inline=false}={}) {
  const page = title ? [item('HOJA DE INSPECCIÓN',20,780)] : [];
  records.forEach((record,index) => {
    const y=700-index*50;
    if (inline) {
      page.push(item(`Localización: ${record.loc} Contrato: ${contract} Medidor: ${record.med ?? ''} Tarifa: 1`,20,y));
    } else {
      page.push(item('Localización:',20,y),item(record.loc,95,y),item('Medidor:',220,y),item('Tarifa:',360,y),item('1',400,y));
      if(record.med !== undefined) page.push(item(record.med,285,y+1));
      page.push(item('Contrato:',20,y-15),item(contract,95,y-15));
    }
  });
  if(total !== null) page.push(item('Total Inspecciones: '+total,20,100));
  return documentOf([page]);
}
function parse(doc, context=parser()) {
  return context.parseReadingPdfLayout(doc.pages, doc.text);
}
const variants = {
  inspection:options => labeled(options),
  universal:options => labeled({...options,title:false,inline:true}),
  missing:options => table(options),
  demand:options => table({...options,kind:'demand',order:['Secuencia','Contrato','Medidor']})
};

for(const order of [
  ['Localización','Medidor','Contrato'],
  ['Localización','Contrato','Medidor'],
  ['Medidor','Contrato','Localización']
]) test('identifica la columna Medidor con orden '+order.join(' / '), () => {
  const result=parse(table({order,total:1}));
  assert.equal(result.rows[0].medidor,meters[1]);
  assert.equal(result.parser,'missing-reading-table-strict');
});

test('el universal no acepta el segundo número de una fila sin etiquetas', () => {
  const doc=documentOf([[item(`${location(1)} ${contract} ${meters[1]}`,20,700),item('Total Medidores: 1',20,100)]]);
  assert.equal(parser().parseUniversalReadingRows(doc.pages,doc.text),null);
  assert.throws(() => parse(doc),/evitar confundir Medidor con Contrato/);
});

test('un total coincidente no permite tomar Contrato cuando falta Medidor', () => {
  const doc=table({order:['Localización','Contrato','Medidor'],records:[{loc:location(1)}],total:1});
  assert.throws(() => parse(doc),/indica 1 registros, pero pude validar 0/);
});

for(const [name,fixture] of Object.entries(variants)) {
  test(name+': acepta registros completos con y sin total y conserva numeración', () => {
    for(const total of [null,meters.length]) {
      const result=parse(fixture({records:meters.map((med,i)=>({loc:location(i+1),med})),total}));
      assert.equal(result.rows.length,meters.length);
      assert.deepEqual(Array.from(result.rows,r=>r.medidor),meters);
      assert.equal(result.expectedCount,total);
    }
  });
  test(name+': bloquea extracción parcial sin total', () => {
    assert.throws(() => parse(fixture({records:[{loc:location(1),med:meters[1]},{loc:location(2)}]})),/integridad/);
  });
  test(name+': bloquea un registro incompleto aunque el total coincida con los pares válidos', () => {
    assert.throws(() => parse(fixture({records:[{loc:location(1),med:meters[1]},{loc:location(2)}],total:1})),/integridad/);
  });
  test(name+': compara explícitamente cero y cantidades mayores o menores', () => {
    for(const total of [0,2]) assert.throws(() => parse(fixture({total})),new RegExp('indica '+total+' registros, pero pude validar 1'));
    assert.throws(() => parse(fixture({records:[{loc:location(1),med:meters[1]},{loc:location(2),med:meters[2]}],total:1})),/indica 1 registros, pero pude validar 2/);
  });
  test(name+': rechaza conflictos y tolera repetición idéntica', () => {
    assert.throws(() => parse(fixture({records:[{loc:location(1),med:meters[1]},{loc:location(1),med:meters[2]}]})),/Conflicto de Medidor/);
    const result=parse(fixture({records:[{loc:location(1),med:meters[1]},{loc:location(1),med:meters[1]}]}));
    assert.equal(result.rows.length,1);
  });
  test(name+': no rechaza un medidor únicamente por longitud o prefijo atípicos', () => {
    assert.equal(parse(fixture({records:[{loc:location(1),med:'003456789'}]})).rows[0].medidor,'003456789');
  });
  test(name+': no ignora una página sin estructura verificable', () => {
    for(const extra of [[],[item(`${location(2)} ${contract}`,20,700)]]) {
      const doc=fixture({});
      assert.throws(() => parse(documentOf([...doc.pages,extra])),/integridad/);
    }
  });
  test(name+': procesa todas las páginas válidas', () => {
    const first=fixture({});
    const second=fixture({records:[{loc:location(2),med:meters[2]}]});
    assert.equal(parse(documentOf([...first.pages,...second.pages])).rows.length,2);
  });
}

test('no asigna el medidor de la ficha siguiente a una localización incompleta', () => {
  assert.throws(() => parse(labeled({records:[{loc:location(1)},{loc:location(2),med:meters[2]}]})),/integridad/);
});

test('dos candidatos en la columna o etiqueta Medidor bloquean la importación', () => {
  const doc=table();
  doc.pages[0].push(item(meters[2],125,670));
  assert.throws(() => parse(documentOf(doc.pages)),/integridad/);
  assert.throws(() => parse(labeled({inline:true,records:[{loc:location(1),med:meters[1]+' '+contract}]})),/integridad/);
});

test('columna desplazada hacia Contrato no se interpreta como Medidor', () => {
  const doc=table({order:['Secuencia','Medidor','Contrato'],kind:'demand'});
  doc.pages[0]=doc.pages[0].filter(i=>i.str!==meters[1]);
  assert.throws(() => parse(documentOf(doc.pages)),/integridad/);
});

test('distingue ausencia de total de cero en todas las etiquetas soportadas', () => {
  const context=parser();
  assert.equal(context.readingPdfExpectedCount('Sin total'),null);
  for(const text of ['Total Inspecciones: 0','Total Medidores: 0','Cantidad de Medidores: 0']) {
    assert.equal(context.readingPdfExpectedCount(text),0);
    assert.throws(() => context.validateReadingPdfRows([{medidor:meters[1]}],[],0,'PDF'),/indica 0 registros/);
  }
  assert.equal(context.validateReadingPdfRows([],[],0,'PDF',{detected:0,validated:0,unverifiedPages:0}).length,0);
});

test('un PDF de Cortes continúa rechazándose en Lecturas', () => {
  const doc=table();
  doc.text='LISTADO DE DESCONEXIONES EN MÓVILES\n'+doc.text;
  assert.throws(() => parse(doc),/Abrilo en Cortes/);
});

test('una ficha válida no oculta una fila numérica sin etiquetas en la misma página', () => {
  for(const title of [true,false]) {
    const doc=labeled({title,inline:true});
    doc.pages[0].push(item(`${location(2)} ${contract} ${meters[2]}`,20,400));
    assert.throws(() => parse(documentOf(doc.pages)),/integridad/);
  }
});

test('preserva localizaciones de nueve dígitos y el encabezado Visita', () => {
  const doc=table({kind:'demand',order:['Visita','Medidor','Contrato'],records:[{loc:'201000001',med:meters[1]}]});
  assert.equal(parse(doc).rows[0].localizacion,'0201000001');
});

function uploadApp(mode='residencial') {
  const context=parser();
  const elements=Object.fromEntries(['readingPdfStatus','newRouteData','newRouteName','readingPdfReview','tabRoute'].map(id=>[id,{hidden:true,style:{},value:'',innerHTML:'',textContent:'',scrollIntoView() {}}]));
  const prior=[{id:'prior',localizacion:location(1),medidor:meters[1],lectura:'4321',status:'read',readAt:'2026-01-15T15:00:00Z',deferCount:2,lat:9.99,lng:-84.01,notes:'Nota sintética',sourceRoute:'R1',sequence:1,originalSequence:1}];
  const info={routeId:'synthetic-day',name:'Jornada sintética',date:'2026-01-15',sourceRoutes:['R1']};
  const meta={synthetic:true};
  const memory=new Map([['reading',JSON.stringify({orders:prior,info,meta})],['history','historial sintético'],['other','otro módulo sintético']]);
  const alerts=[];
  let docs=[],loaded=0;
  Object.assign(context,{
    document:{getElementById:id=>elements[id]},
    localStorage:{getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)},
    readingOrders:prior,readingRouteInfo:info,readingRouteMeta:meta,
    READING_MODE:mode,READING_KEY:'reading',READING_ROUTE_HISTORY_KEY:'history',
    localDateKey:()=> '2026-01-15',
    alert:message=>alerts.push(message),renderAll() {},hydrateReadingGps() {},switchReadingTab() {},showReadingToast() {},
    escapeHtml:String,
    saveReadingState:()=>memory.set('reading',JSON.stringify({orders:context.readingOrders,info:context.readingRouteInfo})),
    loadNewReadingRoute:()=>{loaded++;},
    pdfjsLib:{GlobalWorkerOptions:{},getDocument:({data})=>{
      const doc=docs[data];
      return {promise:Promise.resolve({numPages:doc.pages.length,getPage:async index=>({getTextContent:async()=>({items:doc.pages[index-1]})})})};
    }}
  });
  const snapshot=()=>JSON.stringify({orders:context.readingOrders,info:context.readingRouteInfo,meta:context.readingRouteMeta,memory:[...memory]});
  return {context,elements,memory,alerts,snapshot,prior:JSON.stringify(prior[0]),get loaded(){return loaded;},
    upload:async documents=>{docs=documents;await context.handleReadingPdfUpload({target:{files:docs.map((_,i)=>({name:`ruta-sintetica-${i}.pdf`,arrayBuffer:async()=>i})),value:'sintético'}});}
  };
}

for(const mode of ['residencial','demanda']) {
  test(mode+': un rechazo del parser real conserva toda la jornada y el almacenamiento', async () => {
    for(const bad of [
      table({order:['Localización','Contrato','Medidor'],records:[{loc:location(2)}]}),
      table({records:[{loc:location(2),med:meters[2]},{loc:location(3)}]}),
      table({total:0}),
      labeled({records:[{loc:location(2),med:meters[2]},{loc:location(2),med:meters[3]}]})
    ]) {
      const app=uploadApp(mode),before=app.snapshot();
      // El segundo archivo falla después de analizar uno válido.
      await app.upload([table({records:[{loc:location(4),med:meters[4]}]}),bad]);
      assert.equal(app.snapshot(),before);
      assert.equal(app.elements.readingPdfReview.hidden,true);
      assert.equal(app.elements.readingPdfStatus.className,'pdf-status error');
      assert.equal(app.loaded,0);
      assert.equal(app.alerts.length,1);
      app.context.confirmResidentialPdfImport();
      assert.equal(app.snapshot(),before);
    }
  });
}

test('Residencial: el parser real permite revisar, cancelar y confirmar sin perder datos de visitas', async () => {
  const app=uploadApp(),before=app.snapshot();
  const doc=table({records:[{loc:location(2),med:meters[2]}]});
  await app.upload([doc]);
  assert.equal(app.snapshot(),before);
  assert.equal(app.elements.readingPdfReview.hidden,false);
  app.context.cancelResidentialPdfImport();
  assert.equal(app.snapshot(),before);
  await app.upload([doc]);
  app.context.confirmResidentialPdfImport();
  assert.equal(app.context.readingOrders.length,2);
  assert.equal(JSON.stringify(app.context.readingOrders[0]),app.prior);
  assert.equal(app.memory.get('history'),'historial sintético');
  assert.equal(app.memory.get('other'),'otro módulo sintético');
  assert.equal(app.alerts.length,0);
});

test('Demanda: el parser real entrega la columna Medidor al cargador existente', async () => {
  const app=uploadApp('demanda');
  await app.upload([table({kind:'demand',order:['Secuencia','Contrato','Medidor'],records:[{loc:location(2),med:meters[2]}]})]);
  assert.equal(app.loaded,1);
  assert.equal(app.elements.newRouteData.value,location(2)+' '+meters[2]);
  assert.equal(app.alerts.length,0);
});

test('Residencial: un conflicto con una lectura guardada bloquea sin alterar la jornada', async () => {
  const app=uploadApp(),before=app.snapshot();
  await app.upload([labeled({records:[{loc:location(1),med:meters[2]}]})]);
  assert.equal(app.snapshot(),before);
  assert.match(app.alerts[0],/ya tiene una lectura guardada/);
});

test('Demanda conserva encabezados Secuencia de visita y N° Medidor', () => {
  const doc=table({kind:'demand',order:['Secuencia','Medidor','Contrato']});
  doc.pages[0].find(i=>i.str==='Secuencia').str='Secuencia de visita';
  doc.pages[0].find(i=>i.str==='Medidor').str='N° Medidor';
  assert.equal(parse(documentOf(doc.pages)).rows[0].medidor,meters[1]);
});

test('Contrato cercano a Medidor queda fuera de su columna incluso dentro de la tolerancia antigua', () => {
  const doc=table({kind:'demand',order:['Secuencia','Medidor','Contrato']});
  doc.pages[0]=doc.pages[0].filter(i=>i.str!==meters[1]);
  for(const i of doc.pages[0]) if(i.str==='Contrato' || i.str===contract) i.transform[4]=160;
  assert.throws(() => parse(documentOf(doc.pages)),/integridad/);
});

test('una localización mal extraída no se omite aunque exista otro par válido', () => {
  for(const fixture of Object.values(variants)) {
    assert.throws(() => parse(fixture({records:[{loc:location(1),med:meters[1]},{loc:'20100000X2',med:meters[2]}]})),/integridad/);
  }
});
