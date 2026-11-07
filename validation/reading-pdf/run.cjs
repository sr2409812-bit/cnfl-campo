// Binary PDF integration validation. No mocked PDF.js extraction or parser.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const [fixturesArg, pdfjsArg, outputArg] = process.argv.slice(2);
if (!outputArg) throw new Error('Usage: node validation/reading-pdf/run.cjs <PDF directory> <PDF.js directory> <results.json>');
const fixtures = path.resolve(fixturesArg);
const runtime = path.resolve(pdfjsArg);
const output = path.resolve(outputArg);
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const hashes = {
  'pdf.min.js':'5b5799e6f8c680663207ac5b42ee14eed2a406fa7af48f50c154f0c0b1566946',
  'pdf.worker.min.js':'feabdf309770ed24bba31a5467836cdc8cf639c705af27d52b585b041bb8527b'
};
for (const [file,hash] of Object.entries(hashes)) assert.equal(sha256(fs.readFileSync(path.join(runtime,file))),hash);
const pdfjs = require(path.join(runtime,'pdf.min.js'));
assert.equal(pdfjs.version,'3.11.174');
pdfjs.GlobalWorkerOptions.workerSrc = path.join(runtime,'pdf.worker.min.js');
const manifest = JSON.parse(fs.readFileSync(path.join(fixtures,'manifest.json'),'utf8'));
const source = fs.readFileSync(path.join(__dirname,'../../lectura-pdf-v4.js'),'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const results = [];
fs.mkdirSync(path.join(path.dirname(output),'extractions'),{recursive:true});

function context() {
  const c = vm.createContext({console:{log() {},error() {}}});
  vm.runInContext(source,c);
  return c;
}
function documentOptions(bytes) {
  // Browser PDF.js defaults to system fonts. No network or font substitute is
  // needed for extraction of these WinAnsi/Helvetica synthetic documents.
  return {data:new Uint8Array(bytes),useSystemFonts:true};
}
async function extract(bytes) {
  const task = pdfjs.getDocument(documentOptions(bytes));
  try {
    const doc = await task.promise;
    const pages = [];
    let fullText = '';
    for(let n=1;n<=doc.numPages;n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push(content.items);
      // Exactly the text assembly used in handleReadingPdfUpload.
      fullText += content.items.map(i=>String(i.str||'').trim()).filter(Boolean).join('\n')+'\n';
    }
    return {pages,fullText};
  } finally { await task.destroy(); }
}

function app(mode) {
  const c=context(),tasks=[],alerts=[];
  const elements=Object.fromEntries(['readingPdfStatus','newRouteData','newRouteName','readingPdfReview','tabRoute'].map(id=>[id,{hidden:true,style:{},value:'',innerHTML:'',textContent:'',scrollIntoView() {}}]));
  const prior={id:'synthetic-prior',localizacion:'0900000001',medidor:'723459',status:'read',lectura:'4321',readAt:'2026-01-15T15:00:00Z',notes:'FICTICIO',lat:9.99,lng:-84.01,deferCount:2,sourceRoute:'R0',sequence:1,originalSequence:1};
  const info={routeId:'synthetic',date:'2026-01-15',name:'FICTICIO'};
  const meta={synthetic:true};
  const memory=new Map([['reading',JSON.stringify({orders:[prior],info,meta})],['history','historial ficticio'],['other','otro módulo ficticio']]);
  let loaded=0;
  Object.assign(c,{
    document:{getElementById:id=>elements[id]},
    localStorage:{getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)},
    readingOrders:[plain(prior)],readingRouteInfo:info,readingRouteMeta:meta,
    READING_MODE:mode,READING_KEY:'reading',READING_ROUTE_HISTORY_KEY:'history',localDateKey:()=> '2026-01-15',
    alert:message=>alerts.push(message),renderAll() {},hydrateReadingGps() {},switchReadingTab() {},showReadingToast() {},escapeHtml:String,
    saveReadingState:()=>memory.set('reading',JSON.stringify({orders:c.readingOrders,info:c.readingRouteInfo})),
    loadNewReadingRoute:()=>{loaded++;},
    // Only the worker URL assignment is isolated: Node loads the identical
    // pinned worker from disk. getDocument/getPage/getTextContent remain REAL.
    pdfjsLib:{GlobalWorkerOptions:{},getDocument:options=>{
      const task=pdfjs.getDocument({...options,useSystemFonts:true}); tasks.push(task); return task;
    }}
  });
  const snapshot=()=>JSON.stringify({orders:c.readingOrders,info:c.readingRouteInfo,meta:c.readingRouteMeta,memory:[...memory]});
  return {c,elements,alerts,memory,prior,snapshot,get loaded(){return loaded;},
    upload:files=>c.handleReadingPdfUpload({target:{value:'synthetic',files:files.map(file=>({name:file,arrayBuffer:async()=>{
      const b=fs.readFileSync(path.join(fixtures,file)); return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
    }}))}}),destroy:()=>Promise.all(tasks.map(task=>task.destroy()))};
}

async function verifyUpload(entry) {
  const a=app(entry.kind==='demanda'?'demanda':'residencial');
  const before=a.snapshot();
  try {
    const files=entry.blocked?[`${entry.kind}-valido-con-total.pdf`,entry.file]:[entry.file];
    await a.upload(files);
    if(entry.blocked) {
      assert.equal(a.snapshot(),before,'Rejected PDF changed the existing jornada/storage');
      assert.equal(a.elements.readingPdfStatus.className,'pdf-status error');
      assert.equal(a.elements.readingPdfReview.hidden,true);
      assert.equal(a.elements.newRouteData.value,'');
      assert.equal(a.loaded,0);
      assert.equal(a.alerts.length,1);
      a.c.confirmResidentialPdfImport();
      assert.equal(a.snapshot(),before,'Rejected import left confirmable staged records');
      return {blocked:true,filesRead:files,before:sha256(before),after:sha256(a.snapshot()),message:a.alerts[0]};
    }
    assert.equal(a.alerts.length,0,a.alerts.join('\n'));
    assert.equal(a.snapshot(),before,'Upload changed existing jornada before confirmation');
    if(entry.kind==='demanda') {
      assert.equal(a.loaded,1);
      assert.equal(a.elements.newRouteData.value,entry.expectedRows.map(r=>r.localizacion+' '+r.medidor).join('\n'));
      return {blocked:false,rowsDelivered:entry.expectedRows.length,loaderCalls:a.loaded};
    }
    assert.equal(a.elements.readingPdfReview.hidden,false);
    a.c.cancelResidentialPdfImport();
    assert.equal(a.snapshot(),before);
    await a.upload(files);
    a.c.confirmResidentialPdfImport();
    assert.deepEqual(plain(a.c.readingOrders[0]),a.prior);
    assert.deepEqual(plain(a.c.readingOrders.slice(1).map(({localizacion,medidor})=>({localizacion,medidor}))),entry.expectedRows);
    assert.equal(JSON.parse(a.memory.get('reading')).orders.length,entry.expectedRows.length+1);
    assert.equal(a.memory.get('history'),'historial ficticio');
    assert.equal(a.memory.get('other'),'otro módulo ficticio');
    return {blocked:false,added:entry.expectedRows.length,priorVisitPreserved:true,cancelPreserved:true};
  } finally { await a.destroy(); }
}

(async()=>{
  for(const entry of manifest) {
    const result={file:entry.file,kind:entry.kind,sha256:entry.sha256,expectedBlocked:entry.blocked,expectedCount:entry.expectedRows.length,declaredTotal:entry.declaredTotal};
    try {
      const bytes=fs.readFileSync(path.join(fixtures,entry.file));
      assert.equal(sha256(bytes),entry.sha256);
      assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
      const extracted=await extract(bytes);
      assert.equal(extracted.pages.length,entry.pages);
      fs.writeFileSync(path.join(path.dirname(output),'extractions',entry.file+'.json'),JSON.stringify(extracted,null,2)+'\n');
      let parsed,parseError;
      try { parsed=context().parseReadingPdfLayout(extracted.pages,extracted.fullText); } catch(e) { parseError=e; }
      result.actualRows=parsed?plain(parsed.rows):[];
      result.parser=parsed?.parser??null;
      result.blockMessage=parseError?.message??null;
      if(entry.blocked) {
        assert.ok(parseError,'Unsafe PDF was accepted');
        assert.match(parseError.message,/integridad|indica \d+ registros|Conflicto de Medidor|ningún medidor/);
      } else {
        assert.equal(parseError,undefined,parseError?.message);
        assert.deepEqual(plain(parsed.rows),entry.expectedRows);
        assert.equal(parsed.expectedCount,entry.declaredTotal);
        assert.ok(parsed.rows.every(r=>r.medidor!=='654321'),'Contrato was used as Medidor');
      }
      result.upload=await verifyUpload(entry);
      result.pass=true;
    } catch(e) { result.pass=false; result.failure=e.message; }
    results.push(result);
    console.log(`${result.pass?'PASS':'FAIL'} ${entry.file}${result.failure?' — '+result.failure:''}`);
  }
  const report={pdfjsVersion:pdfjs.version,pdfjsSha256:hashes,parserSha256:sha256(source),node:process.version,total:results.length,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,results};
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(`${report.passed}/${report.total} passed; evidence: ${output}`);
  process.exitCode=report.failed?1:0;
})().catch(error=>{console.error(error);process.exitCode=1;});
