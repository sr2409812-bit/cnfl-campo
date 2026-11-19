/* M10-005: cálculo PURO de tramos de traslado declarados y estimaciones viales.
 * No GPS, no llamadas OSRM, no DOM, no almacenamiento ni cambios a jornadas.
 * El motor de órdenes M10-002 conserva su contrato de eventos intacto. */
(function(root){
  'use strict';

  const SCHEMA_VERSION=1;
  const MODULES=Object.freeze(['cortes','demanda','residencial','notificaciones']);
  const TYPES=Object.freeze(['travel_started','travel_arrived']);
  const TOKEN=/^[A-Za-z0-9_.:-]{1,128}$/;
  const STOP=/^stop_[a-f0-9]{32}$/;
  const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
  const DAY=/^\d{4}-\d\d-\d\d$/;
  const MAX_ROUTE_SEGMENTS=120;
  const EVENT_FIELDS=new Set(['schemaVersion','eventId','journeyId','module',
    'operationalDay','travelId','eventType','at','recordedAt','source',
    'fromStopKey','toStopKey','routeSnapshotId','segmentIndex']);
  const ROAD_FIELDS=new Set(['schemaVersion','journeyId','module',
    'routeSnapshotId','segmentIndex','fromStopKey','toStopKey',
    'distanceMeters','provider','profile','filter','calculatedAt']);

  function iso(value){
    if(typeof value!=='string'||!ISO.test(value))return false;
    const d=new Date(value);
    return Number.isFinite(d.getTime())&&d.toISOString()===value;
  }
  function operationalDayFromIso(value){
    if(!iso(value))return null;
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Costa_Rica',
      year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'
    }).formatToParts(new Date(value));
    const partsMap=Object.fromEntries(parts.map(p=>[p.type,p.value]));
    return new Date(Date.UTC(Number(partsMap.year),Number(partsMap.month)-1,
      Number(partsMap.day)-(Number(partsMap.hour)<6?1:0))).toISOString().slice(0,10);
  }
  function day(value){
    if(typeof value!=='string'||!DAY.test(value))return false;
    const d=new Date(value+'T00:00:00.000Z');
    return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
  }
  function token(value){return typeof value==='string'&&TOKEN.test(value);}
  function stop(value){return typeof value==='string'&&STOP.test(value);}
  function scope(value){
    if(!value||typeof value!=='object'||Array.isArray(value)||
       !token(value.journeyId)||!MODULES.includes(value.module))
      throw new TypeError('journeyId y module válidos son obligatorios');
    return {journeyId:value.journeyId,module:value.module};
  }
  function unknownFields(input,allowed,issues){
    for(const key of Object.keys(input)){
      if(!allowed.has(key))issues.push('unknown_field:'+key);
    }
  }
  function validateTravelEvent(input){
    if(!input||typeof input!=='object'||Array.isArray(input))
      return {ok:false,errors:['not_object']};
    const errors=[];
    unknownFields(input,EVENT_FIELDS,errors);
    if(input.schemaVersion!==SCHEMA_VERSION)errors.push('schema_version');
    if(!token(input.eventId))errors.push('event_id');
    if(!token(input.journeyId))errors.push('journey_id');
    if(!MODULES.includes(input.module))errors.push('module');
    if(!day(input.operationalDay))errors.push('operational_day');
    if(!token(input.travelId))errors.push('travel_id');
    if(!TYPES.includes(input.eventType))errors.push('event_type');
    if(!iso(input.at))errors.push('occurred_at');
    if(!iso(input.recordedAt))errors.push('recorded_at');
    if(input.source!=='manual_ui'&&input.source!=='synthetic')
      errors.push('source');
    if(!stop(input.fromStopKey)||!stop(input.toStopKey)||
       input.fromStopKey===input.toStopKey)errors.push('stop_pair');
    const snapshot=input.routeSnapshotId;
    if(snapshot===null){
      if(input.segmentIndex!==null)errors.push('segment_index');
    }else if(!token(snapshot)||!Number.isInteger(input.segmentIndex)||
             input.segmentIndex<0||input.segmentIndex>=MAX_ROUTE_SEGMENTS){
      errors.push('route_reference');
    }
    if(iso(input.at)&&iso(input.recordedAt)&&
       Date.parse(input.recordedAt)<Date.parse(input.at))
      errors.push('recorded_before_occurrence');
    if(day(input.operationalDay)&&iso(input.at)&&
       operationalDayFromIso(input.at)!==input.operationalDay)
      errors.push('operational_day_mismatch');
    if(errors.length)return {ok:false,errors};
    return {ok:true,event:{
      schemaVersion:SCHEMA_VERSION,eventId:input.eventId,
      journeyId:input.journeyId,module:input.module,
      operationalDay:input.operationalDay,travelId:input.travelId,
      eventType:input.eventType,at:input.at,recordedAt:input.recordedAt,
      source:input.source,fromStopKey:input.fromStopKey,
      toStopKey:input.toStopKey,routeSnapshotId:snapshot,
      segmentIndex:input.segmentIndex
    }};
  }
  function validateRoadSegment(input){
    if(!input||typeof input!=='object'||Array.isArray(input))
      return {ok:false,errors:['not_object']};
    const errors=[];
    unknownFields(input,ROAD_FIELDS,errors);
    if(input.schemaVersion!==SCHEMA_VERSION)errors.push('schema_version');
    if(!token(input.journeyId))errors.push('journey_id');
    if(!MODULES.includes(input.module))errors.push('module');
    if(!token(input.routeSnapshotId))errors.push('snapshot_id');
    if(!Number.isInteger(input.segmentIndex)||input.segmentIndex<0||
       input.segmentIndex>=MAX_ROUTE_SEGMENTS)errors.push('segment_index');
    if(!stop(input.fromStopKey)||!stop(input.toStopKey)||
       input.fromStopKey===input.toStopKey)errors.push('stop_pair');
    if(typeof input.distanceMeters!=='number'||
       !Number.isFinite(input.distanceMeters)||input.distanceMeters<0||
       input.distanceMeters>1000000)errors.push('distance_meters');
    if(input.provider!=='osrm'&&input.provider!=='synthetic')
      errors.push('provider');
    if(input.profile!=='driving')errors.push('profile');
    if(!['exclude_motorway','unfiltered_draft'].includes(input.filter))
      errors.push('filter');
    if(!iso(input.calculatedAt))errors.push('calculated_at');
    if(errors.length)return {ok:false,errors};
    return {ok:true,segment:{
      schemaVersion:SCHEMA_VERSION,journeyId:input.journeyId,
      module:input.module,routeSnapshotId:input.routeSnapshotId,
      segmentIndex:input.segmentIndex,fromStopKey:input.fromStopKey,
      toStopKey:input.toStopKey,distanceMeters:input.distanceMeters,
      provider:input.provider,profile:'driving',filter:input.filter,
      calculatedAt:input.calculatedAt
    }};
  }
  function fromRoutePreview(trace,input){
    // CNFLRoutePreview.traceOrdered produce ordered, legMeters, meters,
    // seconds y unfiltered. Solo copiamos ids de paradas y metros: jamás GPS.
    const target=scope(input);
    if(!trace||!Array.isArray(trace.ordered)||!Array.isArray(trace.legMeters)||
       trace.ordered.length<2||trace.ordered.length>MAX_ROUTE_SEGMENTS+1||
       trace.legMeters.length!==trace.ordered.length-1||
       typeof trace.unfiltered!=='boolean'||
       typeof trace.meters!=='number'||!Number.isFinite(trace.meters)||
       typeof trace.seconds!=='number'||!Number.isFinite(trace.seconds)||
       trace.seconds<0||!token(input.routeSnapshotId)||!iso(input.calculatedAt)||
       !['osrm','synthetic'].includes(input.provider))
      throw new TypeError('Traza vial incompleta o sin procedencia verificable');
    // Exige vinculación explícita de la misma lista trazada, no una lista
    // reoptimizada o generada posteriormente a partir de otras órdenes.
    const keys=trace.ordered.map(item=>item&&item.stopKey);
    if(keys.some(key=>!stop(key)))throw new TypeError('Parada sin clave opaca');
    const total=trace.legMeters.reduce((sum,m)=>{
      if(typeof m!=='number'||!Number.isFinite(m)||m<0||m>1000000)
        throw new TypeError('Distancia vial inválida');
      return sum+m;
    },0);
    const tolerance=Math.max(2,trace.meters*0.002);
    if(Math.abs(trace.meters-total)>tolerance)
      throw new TypeError('La suma de tramos no coincide con la ruta');
    const filter=trace.unfiltered?'unfiltered_draft':'exclude_motorway';
    const segments=trace.legMeters.map((meters,i)=>({
      schemaVersion:SCHEMA_VERSION,...target,
      routeSnapshotId:input.routeSnapshotId,segmentIndex:i,
      fromStopKey:keys[i],toStopKey:keys[i+1],
      distanceMeters:meters,provider:input.provider,
      profile:'driving',filter,calculatedAt:input.calculatedAt
    }));
    if(segments.some(segment=>!validateRoadSegment(segment).ok))
      throw new TypeError('Tramos viales incompatibles con el contrato');
    return segments;
  }
  function median(sorted){
    if(!sorted.length)return null;
    const n=sorted.length;
    return n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2;
  }
  function p90(sorted){
    return sorted.length?sorted[Math.ceil(sorted.length*0.9)-1]:null;
  }
  function roadKey(e){
    return e.routeSnapshotId+':'+e.segmentIndex;
  }
  function summarizeTravel(events,roadSegments,targetScope){
    if(!Array.isArray(events)||!Array.isArray(roadSegments))
      throw new TypeError('Se requieren listas de eventos y tramos');
    const target=scope(targetScope);
    const issues=[],seen=new Map(),conflicts=new Set();
    let invalidEvents=0,outsideScopeEvents=0,identicalDuplicates=0;
    for(const [index,raw] of events.entries()){
      const result=validateTravelEvent(raw);
      if(!result.ok){
        invalidEvents++;issues.push({code:'invalid_travel_event',index});
        continue;
      }
      const e=result.event;
      if(e.journeyId!==target.journeyId||e.module!==target.module){
        outsideScopeEvents++;continue;
      }
      const prior=seen.get(e.eventId);
      const fingerprint=JSON.stringify(e);
      if(prior){
        if(prior.fingerprint===fingerprint)identicalDuplicates++;
        else{conflicts.add(e.eventId);issues.push({code:'conflicting_travel_event_id'});}
      }else seen.set(e.eventId,{event:e,fingerprint});
    }
    const filtered=[...seen].filter(([id])=>!conflicts.has(id)).map(([,x])=>x.event);
    const clockOrder=filtered.slice().sort((a,b)=>
      a.recordedAt.localeCompare(b.recordedAt)||a.eventId.localeCompare(b.eventId));
    let clockBad=false;
    for(let i=1;i<clockOrder.length;i++){
      const a=clockOrder[i-1],b=clockOrder[i];
      if(a.recordedAt!==b.recordedAt&&b.at<a.at){
        clockBad=true;break;
      }
    }
    if(clockBad)issues.push({code:'clock_discontinuity'});
    const byTravel=new Map();
    for(const event of filtered){
      if(!byTravel.has(event.travelId))byTravel.set(event.travelId,[]);
      byTravel.get(event.travelId).push(event);
    }
    const candidates=[];
    for(const [travelId,eventsOfTrip] of byTravel){
      const starts=eventsOfTrip.filter(e=>e.eventType==='travel_started');
      const arrivals=eventsOfTrip.filter(e=>e.eventType==='travel_arrived');
      if(starts.length!==1||arrivals.length!==1){
        issues.push({code:starts.length!==1?'missing_or_duplicate_start':'missing_or_duplicate_arrival'});
        continue;
      }
      const start=starts[0],arrival=arrivals[0];
      if(start.fromStopKey!==arrival.fromStopKey||
         start.toStopKey!==arrival.toStopKey||
         start.routeSnapshotId!==arrival.routeSnapshotId||
         start.segmentIndex!==arrival.segmentIndex||
         start.source!==arrival.source){
        issues.push({code:'travel_pair_mismatch'});continue;
      }
      const ms=Date.parse(arrival.at)-Date.parse(start.at);
      if(ms<=0){
        issues.push({code:'nonpositive_travel_interval'});continue;
      }
      if(arrival.recordedAt<start.recordedAt){
        issues.push({code:'arrival_recorded_before_start'});continue;
      }
      candidates.push({travelId,start,arrival,travelMs:ms});
    }
    candidates.sort((a,b)=>a.start.at.localeCompare(b.start.at)||
      a.travelId.localeCompare(b.travelId));
    // No sumar tramos simultáneos: los intervalos se superponen y
    // atribuirían el mismo tiempo dos veces.
    const overlapping=new Set();
    for(let i=0;i<candidates.length;i++){
      for(let j=i+1;j<candidates.length;j++){
        if(Date.parse(candidates[j].start.at)>=Date.parse(candidates[i].arrival.at))
          break;
        overlapping.add(candidates[i].travelId);
        overlapping.add(candidates[j].travelId);
      }
    }
    if(overlapping.size)issues.push({code:'overlapping_travels',count:overlapping.size});
    const validTrips=candidates.filter(c=>!overlapping.has(c.travelId));
    const roadMap=new Map(),roadConflict=new Set();
    let invalidRoadSegments=0,outsideScopeRoad=0;
    for(const [index,raw] of roadSegments.entries()){
      const result=validateRoadSegment(raw);
      if(!result.ok){
        invalidRoadSegments++;issues.push({code:'invalid_road_segment',index});
        continue;
      }
      const s=result.segment;
      if(s.journeyId!==target.journeyId||s.module!==target.module){
        outsideScopeRoad++;continue;
      }
      const k=roadKey(s),fingerprint=JSON.stringify(s);
      if(roadMap.has(k)){
        if(roadMap.get(k).fingerprint!==fingerprint){
          roadConflict.add(k);issues.push({code:'conflicting_road_segment'});
        }
      }else roadMap.set(k,{segment:s,fingerprint});
    }
    const tripDetails=[];
    let distanceMeters=0,matchedTravelMs=0,matchedSegments=0,draftSegments=0;
    for(const trip of validTrips){
      const start=trip.start;
      let road=null,roadStatus='missing',equivalentSpeedKmh=null;
      if(start.routeSnapshotId!==null){
        const key=roadKey(start);
        if(roadConflict.has(key))roadStatus='conflict';
        else if(roadMap.has(key)){
          const candidate=roadMap.get(key).segment;
          if(candidate.fromStopKey!==start.fromStopKey||
             candidate.toStopKey!==start.toStopKey){
            roadStatus='mismatch';
            issues.push({code:'road_pair_mismatch'});
          }else if(Date.parse(candidate.calculatedAt)>Date.parse(start.at)){
            roadStatus='postdated';
            issues.push({code:'road_calculated_after_departure'});
          }else if(candidate.filter==='unfiltered_draft'){
            roadStatus='unfiltered_draft';
            draftSegments++;
          }else{
            road=candidate;
            roadStatus=candidate.provider==='synthetic'?
              'synthetic_filtered':'estimated_filtered';
            distanceMeters+=road.distanceMeters;
            matchedTravelMs+=trip.travelMs;
            matchedSegments++;
            equivalentSpeedKmh=road.distanceMeters*3600/trip.travelMs;
          }
        }
      }
      if(roadStatus==='missing')issues.push({code:'road_distance_not_available'});
      tripDetails.push({
        travelId:trip.travelId,fromStopKey:start.fromStopKey,
        toStopKey:start.toStopKey,startedAt:start.at,arrivedAt:trip.arrival.at,
        durationMs:trip.travelMs,source:start.source,roadStatus,
        roadDistanceMeters:road?road.distanceMeters:null,
        // Distancia de calle dividida por tiempo manual: NO velocidad GPS.
        equivalentRoadSpeedKmh:equivalentSpeedKmh,routeSnapshotId:start.routeSnapshotId
      });
    }
    const times=validTrips.map(t=>t.travelMs).sort((a,b)=>a-b);
    const timeTotal=times.reduce((acc,n)=>acc+n,0);
    return {
      schemaVersion:SCHEMA_VERSION,...target,
      counts:{
        inputEvents:events.length,invalidEvents,outsideScopeEvents,
        identicalDuplicates,conflictingEventIds:conflicts.size,
        inputRoadSegments:roadSegments.length,invalidRoadSegments,
        outsideScopeRoad,conflictingRoadSegments:roadConflict.size,
        startedTravels:[...byTravel.values()].filter(es=>
          es.some(e=>e.eventType==='travel_started')).length,
        completedTravels:validTrips.length,
        excludedOverlaps:overlapping.size,
        matchedRoadSegments:clockBad?0:matchedSegments,
        draftRoadSegments:draftSegments
      },
      captureCoverage:'unverifiable',
      provenance:'user_declared_timestamps',
      quality:clockBad?'invalid_timing':issues.length?'partial':
        (validTrips.length?'coherent_sample':'empty'),
      travelDurationMs:clockBad?null:(times.length?timeTotal:null),
      meanTravelMs:clockBad?null:(times.length?timeTotal/times.length:null),
      medianTravelMs:clockBad?null:median(times),
      p90TravelMs:clockBad?null:p90(times),
      // Si el reloj es inválido, ninguna cifra de distancia se presenta
      // como asociación segura al tiempo de esos tramos.
      roadDistanceMeters:clockBad||!matchedSegments?null:distanceMeters,
      roadMatchedTravelMs:clockBad||!matchedSegments?null:matchedTravelMs,
      // Velocidad equivalente del conjunto emparejado. No es velocidad
      // media GPS; los tramos sin distancia no entran en el denominador.
      equivalentRoadSpeedKmh:clockBad||!matchedTravelMs?null:
        distanceMeters*3600/matchedTravelMs,
      gpsDistanceMeters:null,gpsAverageSpeedKmh:null,
      // Los detalles de un reloj inválido ocultan también sus duraciones.
      trips:tripDetails.map(t=>clockBad?{
        ...t,durationMs:null,roadDistanceMeters:null,
        equivalentRoadSpeedKmh:null,roadStatus:'time_invalid'
      }:t),
      issues
    };
  }
  const api=Object.freeze({
    SCHEMA_VERSION,MODULES,TYPES,validateTravelEvent,
    validateRoadSegment,fromRoutePreview,summarizeTravel
  });
  root.CNFLOperationalTravel=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
