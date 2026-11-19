/* M10-004 — Modelo de presentación puro. Datos de muestra en vista aislada.
 * No consulta eventos reales ni accede a almacenamiento, GPS o red. */
(function(root){
  'use strict';
  const noData='No medido';
  const formatter=new Intl.DateTimeFormat('es-CR',{
    timeZone:'America/Costa_Rica',hour:'2-digit',minute:'2-digit',hour12:false
  });
  function duration(ms){
    if(typeof ms!=='number'||!Number.isFinite(ms)||ms<0)return noData;
    const seconds=Math.round(ms/1000);
    if(seconds===0)return '0 s';
    if(seconds<60)return seconds+' s';
    const minutes=Math.floor(seconds/60);
    const remaining=Math.round(seconds%60);
    const hours=Math.floor(minutes/60);
    const mins=minutes%60;
    const base=hours?hours+' h'+(mins?' '+mins+' min':''):minutes+' min';
    return remaining?base+' '+remaining+' s':base;
  }
  function clock(iso){
    if(typeof iso!=='string')return noData;
    const date=new Date(iso);
    if(!Number.isFinite(date.getTime()))return noData;
    return formatter.format(date);
  }
  function safeNumber(n){
    return Number.isFinite(n)&&n>=0?n:null;
  }
  const issueNames={
    invalid_event:'Evento inválido excluido',
    conflicting_event_id:'Identificador de evento contradictorio',
    clock_discontinuity:'Posible retroceso del reloj',
    event_not_observed:'Evento no observado',
    duplicate_order_completion:'Finalización repetida',
    orphan_correction:'Corrección sin finalización válida',
    stale_correction:'Corrección obsoleta',
    nonpositive_interval:'Intervalo no positivo'
  };
  function countIssues(issues){
    const counts=new Map();
    for(const issue of Array.isArray(issues)?issues:[]){
      // Etiquetas controladas; no presentar IDs, ubicaciones ni datos de órdenes.
      const label=issueNames[issue?.code]||'Incidencia no clasificada';
      counts.set(label,(counts.get(label)||0)+1);
    }
    return [...counts].map(([label,count])=>({label,count}));
  }
  function makeViewModel(summary){
    if(!summary||!summary.counts||typeof summary.counts!=='object')
      throw new TypeError('Resumen estadístico inválido');
    const counts=summary.counts;
    const total=safeNumber(counts.completedOrders);
    const valid=safeNumber(counts.validIntervals);
    const expected=total===null?null:Math.max(0,total-1);
    const timingBad=summary.quality==='invalid_timing';
    const quality=total===0?'empty':timingBad?'invalid':
      summary.quality==='observed'?'consistent':'partial';
    const titles={
      empty:'Sin gestiones registradas',
      invalid:'Tiempos no confiables',
      consistent:'Registros temporalmente coherentes',
      partial:'Registro con incidencias'
    };
    const descriptions={
      empty:'No existe una muestra temporal calculable.',
      invalid:'Se detectó una inconsistencia del reloj; se ocultan los promedios temporales.',
      consistent:'No se detectaron anomalías en la muestra disponible. Esto NO confirma que se hayan capturado todas las órdenes.',
      partial:'Se excluyeron eventos o intervalos con incidencias. Interpretá los promedios como parciales.'
    };
    const intervals=Array.isArray(summary.intervalsMs)&&!timingBad?
      summary.intervalsMs.filter(n=>Number.isFinite(n)&&n>0):[];
    const reliableTime=!timingBad;
    const result={
      kind:quality,
      title:titles[quality],
      description:descriptions[quality],
      demoOnly:true,
      captureCoverage:'No verificable',
      captureExplanation:'El registro no incluye un contador independiente de todas las gestiones realizadas. No se puede calcular el porcentaje capturado.',
      recordedOrders:total??0,
      usableIntervals:valid??0,
      expectedIntervals:expected,
      intervalCoverage:expected===null||expected===0?'No aplica':(valid??0)+' de '+expected,
      coverageExplanation:'Solo compara intervalos calculables entre las gestiones disponibles; NO mide la cobertura real del trabajo.',
      metrics:[
        {id:'orders',label:'Órdenes en el registro',value:total===null?'—':String(total),note:'Gestiones efectivas'},
        {id:'window',label:'Primera a última',value:reliableTime?duration(summary.observedWindowMs):noData,note:'No equivale a jornada laboral'},
        {id:'mean',label:'Promedio entre gestiones',value:reliableTime?duration(summary.meanIntervalMs):noData,note:'Incluye esperas y atención'},
        {id:'median',label:'Mediana entre gestiones',value:reliableTime?duration(summary.medianIntervalMs):noData,note:'Intervalos disponibles'},
        {id:'p90',label:'P90 entre gestiones',value:reliableTime?duration(summary.p90IntervalMs):noData,note:'Percentil de los intervalos'},
        {id:'rate',label:'Gestiones por hora del intervalo',value:reliableTime&&Number.isFinite(summary.completedOrdersPerHour)?
          summary.completedOrdersPerHour.toLocaleString('es-CR',{maximumFractionDigits:1,minimumFractionDigits:1}):noData,
          note:'No mide toda la jornada'}
      ],
      first:reliableTime?clock(summary.firstCompletedAt):noData,
      last:reliableTime?clock(summary.lastCompletedAt):noData,
      intervals:intervals.map((ms,index)=>({label:'Intervalo '+(index+1),value:duration(ms)})),
      issueList:countIssues(summary.issues),
      unmeasured:[
        {label:'Tiempo de traslado',value:noData},
        {label:'Tiempo de atención',value:noData},
        {label:'Distancia por calles',value:noData},
        {label:'Distancia GPS',value:noData},
        {label:'Velocidad promedio real',value:noData}
      ],
      metadata:{
        rejected:safeNumber(counts.rejectedEvents)??0,
        duplicateIds:safeNumber(counts.duplicateEventIds)??0,
        outsideScope:safeNumber(counts.outsideScopeEvents)??0
      }
    };
    return result;
  }
  const api=Object.freeze({duration,clock,countIssues,makeViewModel});
  root.CNFLOperationalStatsView=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
