const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

// Base de conocimiento (decisión 0006): el repo es público, así que aquí no
// pueden aparecer datos de campo, y los enlaces internos deben resolver.
const ROOT=path.join(__dirname,'..','docs','conocimiento');
function files(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
    const p=path.join(dir,e.name);
    return e.isDirectory()?files(p):e.name.endsWith('.md')?[p]:[];
  });
}
const docs=files(ROOT);

test('base de conocimiento: existe el índice y al menos una ficha por carpeta',()=>{
  assert.ok(fs.existsSync(path.join(ROOT,'README.md')));
  for(const dir of ['areas','decisiones','incidentes','formatos-pdf','auditorias']){
    assert.ok(docs.some(f=>f.includes(path.sep+dir+path.sep)),'falta contenido en '+dir);
  }
});

test('base de conocimiento: los enlaces relativos apuntan a archivos existentes',()=>{
  const broken=[];
  for(const file of docs){
    const text=fs.readFileSync(file,'utf8');
    for(const m of text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)){
      const target=m[1];
      if(/^[a-z]+:/i.test(target))continue;
      if(!fs.existsSync(path.resolve(path.dirname(file),target)))broken.push(path.relative(ROOT,file)+' → '+target);
    }
  }
  assert.deepEqual(broken,[]);
});

test('base de conocimiento: sin números con forma de localización o medidor real',()=>{
  // Localizaciones: 9-10 dígitos. Solo se permiten las ficticias 2010000000-2010000099
  // de las pruebas. Medidores: 6-7 dígitos; solo se permiten los ficticios 8000xx y 765432.
  const allowed=new Set(['765432']);
  const found=[];
  for(const file of docs){
    const text=fs.readFileSync(file,'utf8');
    for(const m of text.matchAll(/(?<![\w.:/-])(\d{6,10})(?![\w.:/-])/g)){
      const n=m[1];
      if(/^20100000\d\d$/.test(n)||/^8000\d\d$/.test(n)||allowed.has(n))continue;
      if(/^20\d\d$/.test(n.slice(0,4))&&n.length===8)continue; // fechas AAAAMMDD
      found.push(path.relative(ROOT,file)+': '+n);
    }
  }
  assert.deepEqual(found,[]);
});
