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
      items.push({type,loc,lat,lon,done:Boolean(done),label:String(label || loc),href,conflict:Boolean(conflict),orderId:String(row.orden || ''),nis:String(row.nis || ''),address:String(row.direccion || '')});
    }
    const cuts=read('cnfl_work_orders',[]);
    if(Array.isArray(cuts)) cuts.forEach(o=>add('cortes',o,o.status && o.status!=='pending',o.orden ? 'Orden '+o.orden : 'Corte '+o.localizacion,'index.html?loc='+encodeURIComponent(o.localizacion)));
    for(const [type,key,page] of [
      ['demanda','cnfl_reading_orders_v2','lectura.html'],
      ['residencial','cnfl_residential_reading_v1','lectura-residencial.html']
    ]){
      const state=read(key,{});
      if(Array.isArray(state.orders)) state.orders.forEach(o=>add(type,o,o.status==='read',o.medidor ? 'Medidor '+o.medidor : 'Localización '+o.localizacion,page+'?loc='+encodeURIComponent(o.localizacion)));
    }
    const stops=Array.isArray(root.CNFL_NOTIFICATION_STOPS) ? root.CNFL_NOTIFICATION_STOPS : [];
    const saved=read('cnfl_notificaciones_20261019_v2',null) || read('cnfl_notificaciones_20261019_v3',{});
    const done=saved && saved.done && typeof saved.done==='object' ? saved.done : {};
    stops.forEach(s=>add('notificaciones',{localizacion:s[0],lat:s[1],lon:s[2]},done[s[0]],'Notificación '+s[0],'notificaciones.html?loc='+encodeURIComponent(s[0])));
    return items;
  }
  function nearby(rows, selected, radius=250){
    if(!valid(selected.lat,selected.lon)) return [];
    const rad=Math.PI/180;
    return rows.filter(row=>!row.done&&valid(row.lat,row.lon)&&!(row.type===selected.type&&row.loc===selected.loc))
      .map(row=>{
        const dy=(row.lat-selected.lat)*rad,dx=(row.lon-selected.lon)*rad;
        const h=Math.sin(dy/2)**2+Math.cos(selected.lat*rad)*Math.cos(row.lat*rad)*Math.sin(dx/2)**2;
        return {row,meters:12742000*Math.asin(Math.min(1,Math.sqrt(h)))};
      }).filter(x=>x.meters<=radius).sort((a,b)=>a.meters-b.meters);
  }
  function setCutStatus(loc,orderId,status){
    const allowed=['pending','cortado','avisado','reconectado','pago','no_acceso'];
    if(!allowed.includes(status)) return false;
    const orders=read('cnfl_work_orders',[]);
    if(!Array.isArray(orders)) return false;
    const order=orders.find(o=>String(o.localizacion||'').replace(/\D/g,'')===loc && String(o.orden||'')===orderId);
    if(!order) return false;
    order.status=status;
    try{
      localStorage.setItem('cnfl_work_orders',JSON.stringify(orders));
      const history=read('cnfl_order_history_v1',[]);
      if(Array.isArray(history)){
        const today=new Date(),date=order._journeyDate||`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
        const index=history.findIndex(item=>item.historyDate===date&&String(item.orden||'')===orderId&&String(item.localizacion||'').replace(/\D/g,'')===loc&&String(item.medidor||'')===String(order.medidor||''));
        const {monto,status:currentStatus,...safeOrder}=order;
        const prior=index>=0?history[index]:{};
        const {monto:oldAmount,status:oldStatus,...safePrior}=prior;
        const entry={...safePrior,...safeOrder,historyDate:date,savedAt:Date.now()};
        if(index>=0) history.splice(index,1);
        history.unshift(entry);
        localStorage.setItem('cnfl_order_history_v1',JSON.stringify(history.slice(0,1200)));
      }
      return true;
    }catch(_){return false;}
  }
  root.CNFLFieldMapData={collect,valid,nearby,setCutStatus};
})(typeof window==='undefined' ? globalThis : window);
