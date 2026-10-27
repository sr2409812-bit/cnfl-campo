// Vista previa vial. El perfil público excluye autopistas cuando el servidor lo
// admite; las otras restricciones VRS-OS requieren un motor propio y datos viales.
(function(root){
  'use strict';
  const BASE='https://router.project-osrm.org';
  const BATCH=24;
  const GEOMETRY_BATCH=12;
  const MAX_STOPS=120;
  const SNAP_LIMIT_METERS=100;

  function valid(point){
    return point && point.lat!==null && point.lon!==null && point.lat!=='' && point.lon!=='' &&
      Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon)) &&
      Math.abs(Number(point.lat))<=90 && Math.abs(Number(point.lon))<=180 &&
      !(Number(point.lat)===0 && Number(point.lon)===0);
  }
  function coord(p){return Number(p.lon)+','+Number(p.lat);}
  function distance(a,b){
    const rad=Math.PI/180, dy=(Number(b.lat)-Number(a.lat))*rad, dx=(Number(b.lon)-Number(a.lon))*rad;
    const h=Math.sin(dy/2)**2+Math.cos(Number(a.lat)*rad)*Math.cos(Number(b.lat)*rad)*Math.sin(dx/2)**2;
    return 12742000*Math.asin(Math.min(1,Math.sqrt(h)));
  }
  function prepare(rows){
    const points=new Map(),missing=[];
    for(const row of rows){
      if(row.done) continue;
      if(!valid(row)){missing.push(row);continue;}
      const key=Number(row.lat).toFixed(6)+','+Number(row.lon).toFixed(6);
      if(!points.has(key)) points.set(key,{lat:Number(row.lat),lon:Number(row.lon),jobs:[]});
      points.get(key).jobs.push(row);
    }
    return {stops:[...points.values()],missing};
  }
  function endpoint(service,points){
    return BASE+'/'+service+'/v1/driving/'+points.map(coord).join(';');
  }
  async function request(service,points,options,fetcher){
    const query=new URLSearchParams({...options,exclude:'motorway'});
    let response;
    try{ response=await fetcher(endpoint(service,points)+'?'+query.toString(),{cache:'no-store'}); }
    catch(_){throw new Error('No hay conexión con el servicio de rutas. No se dibujó ninguna ruta.');}
    if(!response.ok) throw new Error('El servicio vial respondió '+response.status+'. No se dibujó ninguna ruta.');
    let data;
    try{data=await response.json();}catch(_){throw new Error('La respuesta del servicio vial está incompleta.');}
    if(!data || data.code!=='Ok') throw new Error('El servicio no pudo calcular evitando autopistas: '+(data&&data.message||data&&data.code||'respuesta inválida'));
    const snapped=service==='table'?data.sources:data.waypoints;
    if(!Array.isArray(snapped)||snapped.length!==points.length||
       snapped.some(w=>!w||!Number.isFinite(w.distance)||w.distance>SNAP_LIMIT_METERS)){
      throw new Error('Hay puntos a más de 100 m de una calle utilizable. Revisá sus coordenadas.');
    }
    return data;
  }
  function nearest(current,remaining){
    return [...remaining].sort((a,b)=>distance(current,a)-distance(current,b)).slice(0,BATCH);
  }
  function leg(matrix,i,j){const value=matrix[i]&&matrix[i][j];return value==null||!Number.isFinite(Number(value))?Infinity:Number(value);}
  function cost(route,matrix){let total=0,prev=0;for(const idx of route){total+=leg(matrix,prev,idx);prev=idx;}return total;}
  function orderBatch(matrix,count){
    let best=null,bestCost=Infinity;
    const seeds=Array.from({length:count},(_,i)=>i+1).sort((a,b)=>leg(matrix,0,a)-leg(matrix,0,b)).slice(0,Math.min(4,count));
    for(const seed of seeds){
      const remaining=new Set(Array.from({length:count},(_,i)=>i+1));
      let route=[seed],prev=seed;remaining.delete(seed);
      while(remaining.size){
        const next=[...remaining].sort((a,b)=>leg(matrix,prev,a)-leg(matrix,prev,b))[0];
        if(!Number.isFinite(leg(matrix,prev,next))) throw new Error('Hay paradas sin conexión por calles evitando autopistas.');
        route.push(next);remaining.delete(next);prev=next;
      }
      for(let pass=0;pass<3;pass++){
        let changed=false;
        for(let i=0;i<route.length-1&&!changed;i++) for(let j=i+1;j<route.length;j++){
          const candidate=[...route.slice(0,i),...route.slice(i,j+1).reverse(),...route.slice(j+1)];
          if(cost(candidate,matrix)+0.1<cost(route,matrix)){route=candidate;changed=true;break;}
        }
        if(!changed) break;
      }
      const total=cost(route,matrix);
      if(total<bestCost){best=route;bestCost=total;}
    }
    if(!best||!Number.isFinite(bestCost)) throw new Error('Hay paradas sin conexión por calles evitando autopistas.');
    return best;
  }
  async function calculate(stops,start,fetcher,progress){
    if(!valid(start)) throw new Error('No se obtuvo un punto de salida válido.');
    if(!stops.length) throw new Error('No hay pendientes con GPS para trazar.');
    if(stops.length>MAX_STOPS) throw new Error('Hay más de 120 paradas. Filtrá por tipo y calculá por bloques.');
    const get=fetcher||root.fetch.bind(root);
    const ordered=[],remaining=[...stops];
    let current=start;
    while(remaining.length){
      const batch=nearest(current,remaining);
      if(progress) progress('Ordenando '+(ordered.length+1)+'–'+(ordered.length+batch.length)+' de '+stops.length+' paradas…');
      const data=await request('table',[current,...batch],{annotations:'duration,distance'},get);
      if(!Array.isArray(data.durations)||data.durations.length!==batch.length+1||
         data.durations.some(row=>!Array.isArray(row)||row.length!==batch.length+1)){
        throw new Error('La matriz vial llegó incompleta.');
      }
      for(const idx of orderBatch(data.durations,batch.length)){
        const stop=batch[idx-1];ordered.push(stop);
        remaining.splice(remaining.indexOf(stop),1);
      }
      current=ordered[ordered.length-1];
    }
    const path=[start,...ordered],segments=[];
    let meters=0,seconds=0;
    for(let from=0;from<path.length-1;from+=GEOMETRY_BATCH-1){
      const part=path.slice(from,Math.min(from+GEOMETRY_BATCH,path.length));
      if(progress) progress('Trazando calles '+(from+1)+'–'+(from+part.length-1)+' de '+stops.length+'…');
      const data=await request('route',part,{overview:'full',geometries:'geojson',steps:'false'},get);
      const route=data.routes&&data.routes[0];
      if(!route||!route.geometry||!Array.isArray(route.geometry.coordinates)||route.geometry.coordinates.length<2||
         !Number.isFinite(route.distance)||!Number.isFinite(route.duration)) throw new Error('La geometría de la ruta llegó incompleta.');
      segments.push(route.geometry.coordinates.map(p=>[p[1],p[0]]));
      meters+=route.distance;seconds+=route.duration;
    }
    return {ordered,segments,meters,seconds,start};
  }
  const api={prepare,calculate,orderBatch,distance};
  root.CNFLRoutePreview=api;
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(typeof window==='undefined'?globalThis:window);
