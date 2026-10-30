const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../mapa.js'),'utf8');

// Exercise the production render/click handlers with Leaflet's documented
// event dispatch contract: paths bubble by default, markers do not.
function setup({type='cortes',numbered=false,cluster=false,routeMode=false}={}){
  const rows=[{type,loc:'test-1',label:'Orden de prueba',lat:9.93,lon:-84.08,done:false}];
  if(cluster)rows.push({...rows[0],loc:'test-2'});
  const markers=[];
  const node=()=>({textContent:'',hidden:true,children:[],classList:{toggle(){}},
    setAttribute(){},append(...items){this.children.push(...items)},replaceChildren(){this.children=[]}});
  const elements=new Map();
  const document={createElement:node,querySelectorAll:()=>[],getElementById(id){
    if(!elements.has(id))elements.set(id,node());return elements.get(id);
  }};
  const map={getZoom:()=>15,project:p=>p};
  const L={layerGroup:()=>({addTo(){return this},remove(){},eachLayer(){}}),
    divIcon:options=>options,polyline:()=>({addTo(){return this}})};
  for(const kind of ['marker','circleMarker'])L[kind]=(coords,options)=>{
    const marker={options:{bubblingMouseEvents:kind==='circleMarker',...options},
      on(event,handler){this[event]=handler;return this},addTo(){markers.push(this);return this}};
    return marker;
  };
  const ctx={document,L,map,layer:null,routeLayer:null,shown:[],preview:null,manualTrace:null,
    selectedKey:null,clusterKeys:null,routeMode,manualKeys:numbered?[type+':test-1']:[],
    type,pendingOnly:false,count:node(),list:node(),selectedPanel:node(),
    names:{[type]:type},colors:{[type]:'#F26C21'},syncManual(){},
    visibleRows:()=>rows,manualStops:()=>numbered?[rows[0]]:[],renderManual(){},
    key:o=>o.type+':'+o.loc,
    renderSelection(){ctx.selectedPanel.hidden=!(ctx.selectedKey||ctx.clusterKeys)},
    addManual(o){ctx.manualKeys.push(ctx.key(o));ctx.render()},
    window:{CNFLMapClusters:{group:()=>cluster?[rows]:rows.map(o=>[o])}}};
  ctx.routeKeys=()=>ctx.manualKeys;
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('  function render(){'),source.indexOf('  function clearPreview(){')),ctx);
  // Run the actual background click handler from the application as well.
  ctx.map.on=(event,handler)=>{ctx.backgroundClick=handler};
  vm.runInContext(source.match(/map\.on\('click',.*?;\}\);/)[0],ctx);
  ctx.render();
  return {ctx,markers,tap(marker){marker.click();if(marker.options.bubblingMouseEvents)ctx.backgroundClick()}};
}

for(const type of ['cortes','demanda','residencial','notificaciones']){
  test(type+': un toque mantiene abierta la orden; tocar el fondo la cierra',()=>{
    const {ctx,markers,tap}=setup({type});
    tap(markers[0]);
    assert.equal(ctx.selectedKey,type+':test-1');
    assert.equal(ctx.selectedPanel.hidden,false);
    ctx.backgroundClick();
    assert.equal(ctx.selectedKey,null);
    assert.equal(ctx.selectedPanel.hidden,true);
  });
}
test('un punto numerado mantiene su ficha abierta',()=>{
  const {ctx,markers,tap}=setup({numbered:true});tap(markers[0]);
  assert.equal(ctx.selectedPanel.hidden,false);
});
test('un grupo mantiene abierta la lista de órdenes cercanas',()=>{
  const {ctx,markers,tap}=setup({cluster:true});tap(markers[0]);
  assert.equal(ctx.clusterKeys.length,2);
  assert.equal(ctx.selectedPanel.hidden,false);
});
test('armar ruta agrega una vez y mantiene la ficha tras redibujar los puntos',()=>{
  const {ctx,markers,tap}=setup({routeMode:true});tap(markers[0]);
  assert.deepEqual(ctx.manualKeys,['cortes:test-1']);
  assert.equal(ctx.selectedPanel.hidden,false);
});
