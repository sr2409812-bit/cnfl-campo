(function(){
  function isDigits(value,min,max){
    const s=String(value||'');
    if(s.length<min||s.length>max)return false;
    for(let i=0;i<s.length;i++){
      const c=s.charCodeAt(i);
      if(c<48||c>57)return false;
    }
    return true;
  }

  function cleanToken(value){
    let s=String(value||'').trim();
    while(s && ':,;.#'.includes(s[0]))s=s.slice(1);
    while(s && ':,;.#'.includes(s[s.length-1]))s=s.slice(0,-1);
    return s;
  }

  function normalizeWord(value){
    return String(value||'')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .replace(/[^a-z]/g,'');
  }

  function wordsFromText(value){
    const src=String(value||'');
    const out=[];
    let cur='';
    for(let i=0;i<src.length;i++){
      const ch=src[i];
      if(ch===' '||ch==='\n'||ch==='\r'||ch==='\t'){
        if(cur){out.push(cur);cur='';}
      }else cur+=ch;
    }
    if(cur)out.push(cur);
    return out;
  }

  function expectedCount(tokens){
    for(let i=0;i<tokens.length-2;i++){
      const a=normalizeWord(tokens[i]);
      const b=normalizeWord(tokens[i+1]);
      const c=cleanToken(tokens[i+2]);
      if(a==='total'&&(b==='inspecciones'||b==='medidores')&&isDigits(c,1,4))return Number(c);
    }
    return null;
  }

  window.parseReadingPdfDirectText=function(fullText){
    const tokens=wordsFromText(fullText);
    const rows=[];
    const seen=new Map();
    const conflicts=[];

    function add(locRaw,meterRaw){
      let loc=cleanToken(locRaw);
      const meter=cleanToken(meterRaw);
      if(loc.length===9&&isDigits(loc,9,9))loc='0'+loc;
      if(!isDigits(loc,10,10)||!isDigits(meter,4,8))return;
      if(seen.has(loc)){
        if(seen.get(loc)!==meter)conflicts.push(loc);
        return;
      }
      seen.set(loc,meter);
      rows.push({localizacion:loc,medidor:meter});
    }

    // LMR0085: "Localización: 900... Medidor: 123..."
    for(let i=0;i<tokens.length;i++){
      if(normalizeWord(tokens[i])!=='localizacion')continue;
      let loc='';
      let meter='';
      for(let j=i+1;j<Math.min(tokens.length,i+18);j++){
        const t=cleanToken(tokens[j]);
        if(!loc&&isDigits(t,9,10)){loc=t;continue;}
        if(normalizeWord(tokens[j])==='medidor'){
          for(let k=j+1;k<Math.min(tokens.length,j+5);k++){
            const m=cleanToken(tokens[k]);
            if(isDigits(m,4,8)){meter=m;break;}
          }
          break;
        }
      }
      if(loc&&meter)add(loc,meter);
    }

    // LMR0155: fila tabular = Localización + Medidor + Contrato + tarifa.
    for(let i=0;i<tokens.length-3;i++){
      const loc=cleanToken(tokens[i]);
      const meter=cleanToken(tokens[i+1]);
      const contract=cleanToken(tokens[i+2]);
      const tariff=cleanToken(tokens[i+3]).toUpperCase();
      if(isDigits(loc,10,10)&&isDigits(meter,4,8)&&isDigits(contract,2,10)&&
         (tariff==='TR'||tariff==='TG'||tariff==='TIN')){
        add(loc,meter);
      }
    }

    if(conflicts.length)throw new Error('Conflicto de Medidor en Localización '+conflicts[0]);

    const expected=expectedCount(tokens);
    if(rows.length&&expected&&rows.length!==expected){
      throw new Error('El PDF indica '+expected+' registros y pude validar '+rows.length+'.');
    }

    return {rows,expectedCount:expected};
  };

  const baseLoad=window.loadNewReadingRoute;
  if(typeof baseLoad==='function'){
    window.loadNewReadingRoute=function(){
      baseLoad();
      if(typeof readingGpsSets!=='function'||!Array.isArray(readingOrders)||!readingOrders.length)return;
      const sets=readingGpsSets();
      if(sets.missing&&sets.missing.length){
        const tab=document.getElementById('tabLoad');
        if(typeof switchReadingTab==='function')switchReadingTab('load',tab);
        if(typeof showReadingToast==='function'){
          showReadingToast('Faltan '+sets.missing.length+' GPS · copiá las Localizaciones para Telegram');
        }
      }
    };
  }
})();