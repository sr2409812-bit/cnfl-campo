/* M10-004 — Render de una página aislada, solo datos ficticios.
 * Las únicas entradas son escenarios literales definidos en fixtures. */
(function(root){
  'use strict';
  const doc=root.document;
  const engine=root.CNFLOperationalStats;
  const view=root.CNFLOperationalStatsView;
  const fixtures=root.CNFLStatsDemoFixtures;
  if(!doc||!engine||!view||!fixtures)return;
  const scenarios=fixtures.scenarios();
  const $=id=>doc.getElementById(id);
  const fill=(id,value)=>{$(id).textContent=String(value);};
  function node(tag,cls,content){
    const element=doc.createElement(tag);
    if(cls)element.className=cls;
    if(content!==undefined)element.textContent=String(content);
    return element;
  }
  function renderCards(model){
    const container=$('metricCards');
    const cards=model.metrics.map(metric=>{
      const card=node('article','metric');
      card.append(
        node('p','metric-label',metric.label),
        node('strong','metric-value',metric.value),
        node('p','metric-note',metric.note)
      );
      return card;
    });
    container.replaceChildren(...cards);
  }
  function renderIntervals(model){
    const list=$('intervalList');
    const durations=model.intervals;
    const millis=durations.map(item=>item.durationMs);
    const max=Math.max(1,...millis);
    const rows=durations.map((item,i)=>{
      const row=node('li','interval-row');
      const header=node('div','interval-head');
      header.append(node('span','',item.label),node('strong','',item.value));
      const track=node('div','interval-track');
      const bar=node('span','interval-bar');
      bar.style.width=Math.max(5,Math.round(millis[i]/max*100))+'%';
      track.append(bar);
      row.append(header,track);
      return row;
    });
    list.replaceChildren(...rows);
    $('noIntervals').hidden=rows.length>0;
  }
  function renderIssues(model){
    const list=$('qualityIssues');
    const items=model.issueList.map(issue=>{
      const item=node('li','');
      item.append(node('span','',issue.label),node('strong','',String(issue.count)));
      return item;
    });
    list.replaceChildren(...items);
    $('noIssues').hidden=items.length>0;
  }
  function renderUnmeasured(model){
    $('unmeasuredList').replaceChildren(...model.unmeasured.map(item=>{
      const row=node('li','');
      row.append(node('span','',item.label),node('strong','',item.value));
      return row;
    }));
  }
  function renderScenario(key){
    if(!Object.hasOwn(scenarios,key))return;
    const sample=scenarios[key];
    const summary=engine.summarizeJourney(sample.events,fixtures.scope);
    const model=view.makeViewModel(summary);
    fill('scenarioDescription',sample.description);
    fill('qualityTitle',model.title);
    fill('qualityDescription',model.description);
    $('qualityPanel').dataset.kind=model.kind;
    fill('coverageCapture',model.captureCoverage);
    fill('coverageExplain',model.captureExplanation);
    fill('coverageIntervals',model.intervalCoverage);
    fill('coverageIntervalsExplain',model.coverageExplanation);
    fill('firstTime',model.first);
    fill('lastTime',model.last);
    fill('eventWarnings',String(model.issueList.reduce((n,item)=>n+item.count,0)));
    fill('inputEventCount',String(summary.counts.inputEvents));
    renderCards(model);renderIntervals(model);
    renderIssues(model);renderUnmeasured(model);
    for(const btn of doc.querySelectorAll('[data-scenario]')){
      const selected=btn.dataset.scenario===key;
      btn.setAttribute('aria-pressed',String(selected));
    }
  }
  for(const button of doc.querySelectorAll('[data-scenario]')){
    button.addEventListener('click',()=>renderScenario(button.dataset.scenario));
  }
  renderScenario('normal');
})(typeof window==='undefined'?globalThis:window);
