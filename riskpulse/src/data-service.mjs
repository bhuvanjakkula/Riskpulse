export const SOURCES = {
  fsi: {name:'Office of Financial Research',url:'https://www.financialresearch.gov/financial-stress-index/data/fsi.csv',page:'https://www.financialresearch.gov/financial-stress-index/',cadence:'Daily; normally two business days behind',ttl:3600},
  sofr: {name:'Federal Reserve Bank of New York',url:'https://markets.newyorkfed.org/api/rates/secured/sofr/last/30.json',page:'https://www.newyorkfed.org/markets/reference-rates/sofr',cadence:'Daily reference rate for the effective date',ttl:3600},
  fx: {name:'European Central Bank',url:'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',page:'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html',cadence:'Business-day reference rates; not executable prices',ttl:3600},
  venues: {name:'ISO 10383 Registration Authority',url:'https://www.iso20022.org/sites/default/files/ISO10383_MIC/ISO10383_MIC.csv',page:'https://www.iso20022.org/market-identifier-codes',cadence:'Monthly register; published changes may have future effective dates',ttl:86400}
};
export function csvRows(text){
  let rows=[],row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){let c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++}else quoted=false}else field+=c;}
    else if(c==='"')quoted=true;else if(c===','){row.push(field);field='';}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(Boolean))rows.push(row);row=[];field='';}else field+=c;
  }if(quoted)throw Error('Malformed source CSV');row.push(field);if(row.some(Boolean))rows.push(row);return rows;
}
function validDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s)))throw Error('Invalid observation date');return s;}
function numeric(s){if(s===null||s===undefined||String(s).trim()===''||!Number.isFinite(Number(s)))throw Error('Missing or invalid source value');return Number(s);}
export function normalize(id,text){
  if(id==='fsi'){
    const [heads,...rows]=csvRows(text);if(heads[0]!=='Date'||!heads.includes('OFR FSI'))throw Error('Unexpected OFR format');
    const history=rows.filter(r=>r.length===heads.length&&r[1]!=='').map(r=>({date:validDate(r[0]),...Object.fromEntries(heads.slice(1).map((h,i)=>[h,numeric(r[i+1])]))})).sort((a,b)=>a.date.localeCompare(b.date)).slice(-252);
    if(history.length<2)throw Error('Insufficient OFR observations');return {asOf:history.at(-1).date,latest:history.at(-1),previous:history.at(-2),history};
  }
  if(id==='sofr'){
    const parsed=JSON.parse(text);if(!Array.isArray(parsed.refRates))throw Error('Unexpected SOFR format');
    const history=parsed.refRates.filter(r=>r.type==='SOFR').map(r=>({date:validDate(r.effectiveDate),rate:numeric(r.percentRate),volumeBillions:numeric(r.volumeInBillions),p1:numeric(r.percentPercentile1),p99:numeric(r.percentPercentile99)})).sort((a,b)=>a.date.localeCompare(b.date));
    if(history.length<2)throw Error('Insufficient SOFR observations');return {asOf:history.at(-1).date,latest:history.at(-1),previous:history.at(-2),history};
  }
  if(id==='fx'){
    const asOf=validDate(text.match(/<Cube\s+time=['"]([^'"]+)['"]/)?.[1]||'');
    const rates=Object.fromEntries([...text.matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)].map(m=>[m[1],numeric(m[2])]));
    if(!rates.USD||Object.values(rates).some(x=>x<=0))throw Error('Invalid ECB rate set');return {asOf,base:'EUR',rates:{EUR:1,...rates}};
  }
  if(id==='venues'){
    const [heads,...rows]=csvRows(text);if(!heads.includes('MIC')||!heads.includes('STATUS'))throw Error('Unexpected MIC format');
    const venues=rows.map(r=>{const o=Object.fromEntries(heads.map((h,i)=>[h,r[i]]));return {mic:o.MIC,operatingMic:o['OPERATING MIC'],type:o['OPRT/SGMT'],name:o['MARKET NAME-INSTITUTION DESCRIPTION'],country:o['ISO COUNTRY CODE (ISO 3166)'],city:o.CITY,category:o['MARKET CATEGORY CODE'],status:o.STATUS,updated:o['LAST UPDATE DATE'],created:o['CREATION DATE'],expiry:o['EXPIRY DATE']}}).filter(v=>/^[A-Z0-9]{4}$/.test(v.mic));
    if(!venues.length)throw Error('Empty MIC register');return {venues};
  }throw Error('Unknown source');
}
const memoryCache=new Map();
export async function fetchSource(id,fetcher=fetch,clock=()=>Date.now()){
  const spec=SOURCES[id];if(!spec)throw Error('Unknown source');const cached=memoryCache.get(id);
  if(cached&&clock()-cached.time<spec.ttl*1000)return {...cached.data,cached:true};
  const response=await fetcher(spec.url,{headers:{Accept:id==='sofr'?'application/json':'text/*'},signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw Error(`Source returned HTTP ${response.status}`);const text=await response.text();if(text.length>5000000)throw Error('Source response too large');
  const values=normalize(id,text);const now=clock();if(values.asOf&&Date.parse(values.asOf)>now+86400000)throw Error('Source observation is in the future');
  const data={...values,source:spec.name,sourceUrl:spec.page,cadence:spec.cadence,fetchedAt:new Date(now).toISOString(),cached:false};memoryCache.set(id,{time:now,data});return data;
}
export async function publicSnapshot(){
  const ids=['fsi','sofr','fx'];const results=await Promise.allSettled(ids.map(id=>fetchSource(id)));
  return {generatedAt:new Date().toISOString(),feeds:Object.fromEntries(ids.map((id,i)=>[id,results[i].status==='fulfilled'?{status:'available',...results[i].value}:{status:'unavailable',source:SOURCES[id].name,sourceUrl:SOURCES[id].page,error:'The upstream source could not be retrieved or validated. Try again later.'}]))};
}
