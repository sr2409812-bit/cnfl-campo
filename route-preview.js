// Vista previa vial. Se solicita excluir autopistas, pero el servidor público
// puede rechazarlo. El borrador sin filtro requiere una acción explícita.
(function(root){
  'use strict';
  const BASE='https://router.project-osrm.org';
  const TABLE_LIMIT=100;
  const GEOMETRY_BATCH=12;
  const MAX_STOPS=120;
  const SNAP_LIMIT_METERS=100;
  const LOCALITY_SECONDS_PER_METER=0.08;

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
  async function request(service,points,options,fetcher,unfiltered){
    const query=new URLSearchParams(options);
    if(!unfiltered) query.set('exclude','motorway');
    let response;
    try{ response=await fetcher(endpoint(service,points)+'?'+query.toString(),{cache:'no-store'}); }
    catch(_){throw new Error('No hay conexión con el servicio de rutas. No se dibujó ninguna ruta.');}
    let data;
    try{data=await response.json();}catch(_){throw new Error('La respuesta del servicio vial está incompleta (HTTP '+response.status+').');}
    if(!response.ok){
      const error=new Error('El servicio vial rechazó la solicitud (HTTP '+response.status+'): '+(data&&data.message||data&&data.code||'motivo no disponible')+'. No se dibujó ninguna ruta.');
      if(!unfiltered&&data&&data.code==='InvalidValue'&&/exclude flag combination is not supported/i.test(data.message||'')) error.code='FILTER_UNAVAILABLE';
      if(data&&data.code==='TooBig') error.code='TABLE_TOO_BIG';
      throw error;
    }
    if(!data || data.code!=='Ok'){
      const error=new Error('El servicio no pudo calcular'+(unfiltered?' el borrador vial':' evitando autopistas')+': '+(data&&data.message||data&&data.code||'respuesta inválida'));
      if(data&&data.code==='TooBig') error.code='TABLE_TOO_BIG';
      throw error;
    }
    const snapped=service==='table'?data.sources:data.waypoints;
    const expected=service==='table'&&options.sources?options.sources.split(';').length:points.length;
    if(!Array.isArray(snapped)||snapped.length!==expected||
       snapped.some(w=>!w||!Array.isArray(w.location)||w.location.length!==2||
         w.location.some(value=>!Number.isFinite(value))||
         (service==='route'&&(!Number.isFinite(w.distance)||w.distance>SNAP_LIMIT_METERS)))){
      throw new Error('Hay puntos sin calle utilizable o a más de 100 m. Revisá sus coordenadas.');
    }
    if(service==='table'&&(!Array.isArray(data.destinations)||
       data.destinations.length!==(options.destinations?options.destinations.split(';').length:points.length)))
      throw new Error('La matriz vial llegó incompleta.');
    return data;
  }
  function validMatrix(matrix,rows,columns){
    return Array.isArray(matrix)&&matrix.length===rows&&
      matrix.every(row=>Array.isArray(row)&&row.length===columns);
  }
  async function roadMatrix(points,fetcher,unfiltered,progress){
    const n=points.length;
    if(n<=TABLE_LIMIT){
      if(progress) progress('Comparando toda la jornada por calles ('+(n-1)+' paradas)…');
      try{
        const data=await request('table',points,{annotations:'duration'},fetcher,unfiltered);
        if(!validMatrix(data.durations,n,n)) throw new Error('La matriz vial llegó incompleta.');
        return data.durations;
      }catch(error){if(error.code!=='TABLE_TOO_BIG') throw error;}
    }
    // Se parte la CONSULTA, no la ruta: se completan todos los pares dirigidos
    // antes de ordenar. Cada petición contiene como máximo 100 coordenadas.
    const size=50, matrix=Array.from({length:n},()=>Array(n).fill(null));
    for(let a=0;a<n;a+=size) for(let b=0;b<n;b+=size){
      const left=points.slice(a,a+size),right=points.slice(b,b+size);
      if(progress) progress('Comparando zonas '+(Math.floor(a/size)+1)+' y '+(Math.floor(b/size)+1)+' de '+Math.ceil(n/size)+'…');
      const same=a===b;
      const group=same?left:[...left,...right];
      const options={annotations:'duration'};
      if(!same){
        options.sources=left.map((_,i)=>i).join(';');
        options.destinations=right.map((_,i)=>left.length+i).join(';');
      }
      const data=await request('table',group,options,fetcher,unfiltered);
      if(!validMatrix(data.durations,left.length,right.length)) throw new Error('La matriz vial llegó incompleta.');
      for(let i=0;i<left.length;i++) for(let j=0;j<right.length;j++) matrix[a+i][b+j]=data.durations[i][j];
    }
    return matrix;
  }
  function leg(matrix,i,j){const value=matrix[i]&&matrix[i][j];return value==null||!Number.isFinite(Number(value))?Infinity:Number(value);}
  function cost(route,matrix){let total=0,prev=0;for(const idx of route){total+=leg(matrix,prev,idx);prev=idx;}return total;}
  function weightedCosts(durations,points){
    return durations.map((row,i)=>row.map((raw,j)=>{
      if(raw===null||!Number.isFinite(Number(raw))) return Infinity;
      return Number(raw)+LOCALITY_SECONDS_PER_METER*distance(points[i],points[j]);
    }));
  }
  function orderBatch(matrix,count,unfiltered=false){
    let best=null,bestCost=Infinity;
    const seeds=Array.from({length:count},(_,i)=>i+1).sort((a,b)=>leg(matrix,0,a)-leg(matrix,0,b)).slice(0,Math.min(4,count));
    for(const seed of seeds){
      const remaining=new Set(Array.from({length:count},(_,i)=>i+1));
      let route=[seed],prev=seed;remaining.delete(seed);
      while(remaining.size){
        const next=[...remaining].sort((a,b)=>leg(matrix,prev,a)-leg(matrix,prev,b))[0];
        if(!Number.isFinite(leg(matrix,prev,next))) throw new Error('Hay paradas sin conexión por calles'+(unfiltered?'':' evitando autopistas')+'.');
        route.push(next);remaining.delete(next);prev=next;
      }
      for(let pass=0;pass<12;pass++){
        let choice=null,lowest=cost(route,matrix);
        for(let i=0;i<route.length-1;i++) for(let j=i+1;j<route.length;j++){
          const candidate=[...route.slice(0,i),...route.slice(i,j+1).reverse(),...route.slice(j+1)];
          const candidateCost=cost(candidate,matrix);
          if(candidateCost+0.1<lowest){choice=candidate;lowest=candidateCost;}
        }
        // Mover una parada individual suele resolver saltos que 2-opt no corrige.
        for(let i=0;i<route.length;i++){
          const reduced=[...route.slice(0,i),...route.slice(i+1)];
          for(let j=0;j<=reduced.length;j++){
            if(j===i) continue;
            const candidate=[...reduced.slice(0,j),route[i],...reduced.slice(j)];
            const candidateCost=cost(candidate,matrix);
            if(candidateCost+0.1<lowest){choice=candidate;lowest=candidateCost;}
          }
        }
        if(!choice) break;
        route=choice;
      }
      const total=cost(route,matrix);
      if(total<bestCost){best=route;bestCost=total;}
    }
    if(!best||!Number.isFinite(bestCost)) throw new Error('Hay paradas sin conexión por calles'+(unfiltered?'':' evitando autopistas')+'.');
    return best;
  }
  async function calculate(stops,start,fetcher,progress,options={}){
    if(!valid(start)) throw new Error('No se obtuvo un punto de salida válido.');
    if(!stops.length) throw new Error('No hay pendientes con GPS para trazar.');
    if(stops.length>MAX_STOPS) throw new Error('Hay más de 120 paradas. Filtrá por tipo y calculá por bloques.');
    const get=fetcher||root.fetch.bind(root);
    const unfiltered=options.unfiltered===true;
    const points=[start,...stops];
    const matrix=weightedCosts(await roadMatrix(points,get,unfiltered,progress),points);
    if(progress) progress('Buscando un orden continuo para '+stops.length+' paradas…');
    const ordered=orderBatch(matrix,stops.length,unfiltered).map(idx=>stops[idx-1]);
    const path=[start,...ordered],segments=[],legMeters=[];
    let meters=0,seconds=0;
    for(let from=0;from<path.length-1;from+=GEOMETRY_BATCH-1){
      const part=path.slice(from,Math.min(from+GEOMETRY_BATCH,path.length));
      if(progress) progress('Trazando calles '+(from+1)+'–'+(from+part.length-1)+' de '+stops.length+'…');
      const data=await request('route',part,{overview:'full',geometries:'geojson',steps:'false'},get,unfiltered);
      const route=data.routes&&data.routes[0];
      if(!route||!route.geometry||!Array.isArray(route.geometry.coordinates)||route.geometry.coordinates.length<2||
         !Number.isFinite(route.distance)||!Number.isFinite(route.duration)) throw new Error('La geometría de la ruta llegó incompleta.');
      if(!Array.isArray(route.legs)||route.legs.length!==part.length-1||route.legs.some(leg=>!Number.isFinite(leg.distance)))
        throw new Error('Los tramos de la ruta llegaron incompletos.');
      segments.push(route.geometry.coordinates.map(p=>[p[1],p[0]]));
      legMeters.push(...route.legs.map(leg=>leg.distance));
      meters+=route.distance;seconds+=route.duration;
    }
    return {ordered,segments,legMeters,meters,seconds,start,unfiltered};
  }
  const api={prepare,calculate,orderBatch,weightedCosts,distance};
  root.CNFLRoutePreview=api;
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(typeof window==='undefined'?globalThis:window);
