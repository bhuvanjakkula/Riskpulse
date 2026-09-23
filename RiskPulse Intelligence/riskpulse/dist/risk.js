/* Pure calculations: current marked values, USD equity, deterministic shocks. */
(function(root){
  const value=p=>p.shares*p.price*p.side;
  const exitDays=p=>p.adv>0?p.shares/(p.adv*.1):null;
  function totals(positions,key,gross=true){return positions.reduce((a,p)=>{a[p[key]]=(a[p[key]]||0)+(gross?Math.abs(value(p)):value(p));return a},Object.create(null));}
  function summary(positions,equity){
    const gross=positions.reduce((s,p)=>s+Math.abs(value(p)),0),net=positions.reduce((s,p)=>s+value(p),0);
    const day=positions.reduce((s,p)=>s+value(p)*p.day/(100+p.day),0);
    return {gross:gross/equity*100,net:net/equity*100,day,largest:Math.max(0,...positions.map(p=>Math.abs(value(p))))/equity*100};
  }
  function stress(positions,target,move){return positions.map(p=>({p,x:(target==='all'||p.sector===target)?value(p)*move*(target==='all'?p.beta:1):0}));}
  function parseCSV(text){
    text=text.replace(/^\uFEFF/,'');let rows=[],row=[],field='',quoted=false,closed=false;
    for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++}else{quoted=false;closed=true}}else field+=c;continue;}
      if(c==='"'){if(field.trim()||closed)throw Error('Invalid quote in CSV.');quoted=true;}
      else if(c===','){row.push(field.trim());field='';closed=false;}
      else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field.trim());if(row.some(Boolean))rows.push(row);row=[];field='';closed=false;}
      else{if(closed&&!/\s/.test(c))throw Error('Unexpected text after a quoted field.');field+=c;}
    }
    if(quoted)throw Error('Unclosed quoted field.');row.push(field.trim());if(row.some(Boolean))rows.push(row);
    if(rows.length<2)throw Error('Include a header and at least one position.');
    if(rows.length>5001)throw Error('Import up to 5,000 positions at a time.');
    const heads=rows.shift().map(x=>x.toLowerCase());if(new Set(heads).size!==heads.length)throw Error('Duplicate column names.');
    for(const h of ['ticker','shares','price','sector'])if(!heads.includes(h))throw Error('Missing required column: '+h);
    return rows.map((cells,i)=>{
      if(cells.length!==heads.length)throw Error('Row '+(i+2)+': column count does not match the header.');
      const o=Object.fromEntries(heads.map((h,j)=>[h,cells[j]]));
      const fail=m=>{throw Error('Row '+(i+2)+': '+m)};
      const num=(key,fallback,min,strict=false)=>{if(!o[key]&&fallback!==undefined)return fallback;const n=Number(o[key]);if(!o[key]||!Number.isFinite(n)||(strict?n<=min:n<min))fail('invalid '+key);return n};
      if(!o.ticker||!o.sector)fail('ticker and sector cannot be empty');
      const side=(o.side||'long').toLowerCase();if(!['long','short'].includes(side))fail('side must be long or short');
      const currency=(o.currency||'USD').toUpperCase();if(!/^[A-Z]{3}$/.test(currency))fail('currency must be a three-letter ISO code');
      const fx=currency==='USD'?1:num('fx_to_usd',undefined,0,true);
      const nativePrice=num('price',undefined,0,true);
      if(o.asof&&(!/^\d{4}-\d{2}-\d{2}$/.test(o.asof)||!Number.isFinite(Date.parse(o.asof))||Date.parse(o.asof)>Date.now()+86400000))fail('invalid asof date');
      return {currency,fxToUSD:fx,nativePrice,asOf:o.asof||null,instrumentId:o.instrument_id||null,mic:o.mic||null,priceSource:o.source||'User import',ticker:o.ticker,name:o.name||o.ticker,sector:o.sector,shares:num('shares',undefined,0,true),price:nativePrice*fx,day:num('day',0,-100,true),beta:num('beta',1,-100),adv:num('adv',null,0,true),cp:o.counterparty||'Unspecified',credit:o.credit||'N/A',side:side==='short'?-1:1};
    });
  }
  const api={value,exitDays,totals,summary,stress,parseCSV};if(typeof module!=='undefined')module.exports=api;else root.Risk=api;
})(typeof globalThis!=='undefined'?globalThis:this);
