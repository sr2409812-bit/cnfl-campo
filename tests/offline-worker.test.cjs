const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const code=fs.readFileSync(path.join(root,'sw.js'),'utf8');

function worker(failCore=false){
  const listeners={};
  const deleted=[];
  let activated=false;
  const cache={
    async addAll(assets){if(failCore)throw Error('Falta un recurso propio');assert.ok(assets.length>20)},
    async add(){},
  };
  const context=vm.createContext({
    self:{addEventListener:(name,handler)=>{listeners[name]=handler},skipWaiting:async()=>{activated=true},clients:{claim:async()=>{}}},
    caches:{open:async()=>cache,keys:async()=>['cnfl-campo-v70','cnfl-campo-v72','otra-app-v1'],delete:async key=>{deleted.push(key)}},
    console,
  });
  vm.runInContext(code,context);
  const run=async name=>{
    let promise;
    listeners[name]({waitUntil:value=>{promise=value}});
    await promise;
  };
  return {context,run,deleted,isActivated:()=>activated};
}

test('la instalación no activa un worker incompleto',async()=>{
  const w=worker(true);
  await assert.rejects(w.run('install'),/Falta un recurso propio/);
  assert.equal(w.isActivated(),false);
});

test('la activación solo limpia cachés de CNFL Campo',async()=>{
  const w=worker();
  await w.run('install');
  await w.run('activate');
  assert.equal(w.isActivated(),true);
  assert.deepEqual(w.deleted,['cnfl-campo-v70']);
});

test('las páginas principales y sus recursos locales están en la caché básica',()=>{
  const w=worker();
  const assets=new Set(vm.runInContext('CORE_ASSETS',w.context).map(x=>x.replace(/^\.\//,'')));
  for(const page of ['campo.html','index.html','lectura.html','lectura-residencial.html','notificaciones.html','mapa.html','backup.html']){
    assert.ok(assets.has(page),page+' no está en la caché');
    const html=fs.readFileSync(path.join(root,page),'utf8');
    const references=[...html.matchAll(/(?:src|href)="([^"#]+)"/g)]
      .map(match=>match[1].split('?')[0])
      .filter(ref=>/\.(?:css|js)$/.test(ref)&&!ref.includes('://'));
    for(const ref of references){
      assert.ok(fs.existsSync(path.join(root,ref)),page+' refiere un archivo ausente: '+ref);
      assert.ok(assets.has(ref),page+' usa '+ref+' fuera de la caché');
    }
  }
  assert.match(fs.readFileSync(path.join(root,'campo.html'),'utf8'),/serviceWorker\.register\('\.\/sw\.js'\)/);
});
