// Public-source requests are fixed allowlisted URLs. No user-supplied proxy URLs.
import {fetchSource,publicSnapshot} from './data-service.mjs';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
export default {async fetch(request,env={},ctx={}){
  const url=new URL(request.url);
  if(url.pathname==='/api/workspace')return json({error:'Saved portfolios and paper execution run in the desktop application on your computer. Open http://127.0.0.1:4173 after starting RiskPulse. This hosted dashboard cannot access your local database.'},503);
  if(url.pathname==='/api/licensed/quotes')return json({error:'Licensed quotes require the local desktop edition with Bloomberg or LSEG SDK and an authenticated session. This hosted edition has no vendor credentials.'},503);
  if(!['GET','HEAD'].includes(request.method))return json({error:'Method not allowed'},405);
  try{
    if(url.pathname==='/api/public')return json(await publicSnapshot());
    if(url.pathname==='/api/venues')return json(await fetchSource('venues'));
    if(url.pathname==='/api/status')return json({version:'3.0.0',publicSources:['OFR','New York Fed','ECB','ISO 10383'],licensed:{connected:false,reason:'Exact licensed product, entitlements and deployment constraints have not been configured.'},portfolioStorage:'Browser tab only; no server-side holdings storage',audit:'Downloadable decision snapshot; not a tamper-proof audit service'});
    if(url.pathname.startsWith('/api/'))return json({error:'Not found'},404);
    const path=url.pathname==='/'?'/index.html':url.pathname;const asset=ASSETS[path];
    if(!asset)return new Response('Not found',{status:404});
    return new Response(request.method==='HEAD'?null:asset.body,{headers:{'Content-Type':asset.type,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':'no-cache','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'"}});
  }catch{return json({error:'Source unavailable or invalid. No synthetic replacement has been supplied.'},502);}
}};
