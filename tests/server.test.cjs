const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {resolveAssetPath}=require('../server.js');

test('servidor local solo resuelve archivos públicos de la raíz',()=>{
  assert.equal(path.basename(resolveAssetPath('/campo.html?x=1')),'campo.html');
  assert.equal(path.basename(resolveAssetPath('/')),'index.html');
  for(const url of ['/../browser-smoke.cjs','/%2e%2e/browser-smoke.cjs','/.git/config','/tests/journey.test.cjs','/%5c..%5csecret.js'])
    assert.equal(resolveAssetPath(url),null,url);
});
