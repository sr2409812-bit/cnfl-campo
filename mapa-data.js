(function(root){
  function read(key, fallback){
    try { const value=JSON.parse(localStorage.getItem(key)); return value == null ? fallback : value; }
    catch(_){ return fallback; }
  }
  function valid(lat, lon){
    if(lat == null || lon == null || lat === '' || lon === '') return false;
    const a=Number(lat), b=Number(lon);
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a)<=90 && Math.abs(b)<=180 && !(a===0 && b===0);
  }
  function collect(){
    const cache=read('cnfl_geocache',{});
    const items=[];
    function add(type, row, done, label, href){
      const loc=String(row.localizacion || '').replace(/\D/g,'');
      if(!loc) return;
      const memory=cache && cache[loc];
      // Un conflicto GPS nunca debe convertirse en una navegación confiable.
      const conflict=memory && memory.status==='conflict';
      const own=valid(row.lat,row.lon);
      const remembered=!conflict && memory && valid(memory.lat,memory.lon);
      const lat=conflict ? null : own ? Number(row.lat) : remembered ? Number(memory.lat) : null;
      const lon=conflict ? null : own ? Number(row.lon) : remembered ? Number(memory.lon) : null;
      items.push({type,loc,lat,lon,done:Boolean(done),label:String(label || loc),href,conflict:Boolean(conflict)});
    }
    const cuts=read('cnfl_work_orders',[]);
    if(Array.isArray(cuts)) cuts.forEach(o=>add('cortes',o,o.status && o.status!=='pending',o.orden ? 'Orden '+o.orden : 'Corte '+o.localizacion,'index.html'));
    for(const [type,key,page] of [
      ['demanda','cnfl_reading_orders_v2','lectura.html'],
      ['residencial','cnfl_residential_reading_v1','lectura-residencial.html']
    ]){
      const state=read(key,{});
      if(Array.isArray(state.orders)) state.orders.forEach(o=>add(type,o,o.status==='read'||o.status==='unread',o.medidor ? 'Medidor '+o.medidor : 'Localización '+o.localizacion,page));
    }
    const stops=Array.isArray(root.CNFL_NOTIFICATION_STOPS) ? root.CNFL_NOTIFICATION_STOPS : [];
    const saved=read('cnfl_notificaciones_20261019_v2',null) || read('cnfl_notificaciones_20261019_v3',{});
    const done=saved && saved.done && typeof saved.done==='object' ? saved.done : {};
    stops.forEach(s=>add('notificaciones',{localizacion:s[0],lat:s[1],lon:s[2]},done[s[0]],'Notificación '+s[0],'notificaciones.html?loc='+encodeURIComponent(s[0])));
    return items;
  }
  root.CNFLFieldMapData={collect,valid};
})(typeof window==='undefined' ? globalThis : window);
