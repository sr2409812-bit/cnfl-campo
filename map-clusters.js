(function(root){
  'use strict';
  function group(rows,project,threshold=40){
    const parent=rows.map((_,i)=>i);
    function find(i){while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;}
    const pixels=rows.map(project),limit=threshold*threshold;
    for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
      const dx=pixels[i].x-pixels[j].x,dy=pixels[i].y-pixels[j].y;
      if(dx*dx+dy*dy<=limit)parent[find(j)]=find(i);
    }
    const groups=new Map();
    rows.forEach((row,i)=>{const k=find(i);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(row);});
    return [...groups.values()];
  }
  const api={group};
  root.CNFLMapClusters=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
