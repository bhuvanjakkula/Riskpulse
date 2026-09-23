import http from 'node:http';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {createAuth} from './auth.mjs';
const {default:worker}=await import('../dist/server/index.mjs');
const port=Number(process.env.RISK_PORT||4173),bridgePort=Number(process.env.RISK_BRIDGE_PORT||4174);
const auth=createAuth(resolve(process.env.RISK_DATA_DIR||'data','identity.sqlite3'));
const OWNER_EMAILS=['bhuvanjakkula@gmail.com','bhuvajakkula@gmail.com']; const localOwner={id:'owner',email:'bhuvanjakkula@gmail.com',plan:'enterprise',localOwner:true};
const token=randomBytes(32).toString('hex');
const localPython=resolve('.venv/Scripts/python.exe');
const child=process.env.RISK_SKIP_BRIDGE==='1'?null:spawn(process.env.RISK_PYTHON||(existsSync(localPython)?localPython:'python'),['scripts/licensed_service.py'],{env:{...process.env,RISK_BRIDGE_TOKEN:token,RISK_BRIDGE_PORT:String(bridgePort)},stdio:['ignore','inherit','inherit'],windowsHide:true});
child?.on('error',()=>console.error('Python connector could not start.'));
const attempts=new Map();
const origins=[`http://127.0.0.1:${port}`,`http://localhost:${port}`];
const server=http.createServer(async(req,res)=>{
 const send=(data,status=200,extra={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});res.end(JSON.stringify(data));};
 if(!origins.map(x=>new URL(x).host).includes(req.headers.host))return send({error:'Invalid host'},403);
 const path=new URL(req.url,origins[0]).pathname;
 const read=async(limit)=>{let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>limit)throw new Error('Request too large.');}const data=JSON.parse(body);if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Invalid request.');return data;};
 try{
  if(!['GET','HEAD','POST'].includes(req.method))return send({error:'Method not allowed'},405);
  if(req.method==='POST'&&(!origins.includes(req.headers.origin)||!req.headers['content-type']?.startsWith('application/json')))return send({error:'Same-origin JSON request required'},403);
  const user=auth.session(req)||localOwner;
  if(path==='/api/auth/me'&&req.method==='GET')return send({user});
  if(path==='/api/auth/signout'&&req.method==='POST')return send({ok:true},200,{'Set-Cookie':auth.signout(req)});
  if(['/api/auth/signup','/api/auth/signin'].includes(path)&&req.method==='POST'){
   const key=req.socket.remoteAddress,now=Date.now();
   let entry=attempts.get(key);if(!entry||entry.until<now)entry={count:0,until:now+15*60*1000};
   attempts.set(key,entry);if(++entry.count>20)return send({error:'Too many attempts. Try again in 15 minutes.'},429,{'Retry-After':'900'});
   try{const data=await read(8192);const result=await auth[path.endsWith('signup')?'signup':'signin'](data);if(path.endsWith('signin'))attempts.delete(key);return send({user:result.user},200,{'Set-Cookie':result.cookie});}
   catch(e){return send({error:e instanceof SyntaxError?'Invalid request.':e.message},400);}
  }
  const publicAsset=['/','/index.html','/landing.css','/landing.js'].includes(path);
  if(!user&&!publicAsset){
   if(path.startsWith('/api/'))return send({error:'Please sign in to continue.'},401);
   res.writeHead(303,{Location:'/?auth=signin','Cache-Control':'no-store'});return res.end();
  }
  if(path==='/api/plan'&&req.method==='POST'){try{return send(auth.selectPlan(user.id,(await read(8192)).plan));}catch(e){return send({error:e.message},400);}}
  if(path.startsWith('/api/auth/'))return send({error:'Not found'},404);
  if(['/api/status','/api/licensed/quotes','/api/workspace'].includes(path)){
   const isQuote=path.endsWith('/quotes'),isWorkspace=path==='/api/workspace',isWrite=req.method==='POST';
   if(!['GET','POST'].includes(req.method)||(!isWrite&&isQuote)||(isWrite&&!isWorkspace&&!isQuote))return send({error:'Method not allowed'},405);
   const data=isWrite?await read(isWorkspace?2*1024*1024:16384):undefined;
   const upstream=await fetch(`http://127.0.0.1:${bridgePort}/`+(isWorkspace?'workspace':isQuote?'quotes':'status'),{method:isWrite?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-RiskPulse-User':user.id},body:isWrite?JSON.stringify(data):undefined,signal:AbortSignal.timeout(35000)});
   return send(await upstream.json(),upstream.status);
  }
  if(req.method==='POST')return send({error:'Method not allowed'},405);
  const assetPath=path==='/app'?'/dashboard.html':path==='/plans'?'/plans.html':path;
  const response=await worker.fetch(new Request(origins[0]+assetPath,{method:req.method}));
  res.writeHead(response.status,{...Object.fromEntries(response.headers),'Cache-Control':'no-store','X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"});
  res.end(Buffer.from(await response.arrayBuffer()));
 }catch{return send({error:'Service unavailable. Please try again.'},503);}
});
server.listen(port,'127.0.0.1',()=>console.log(`RiskPulse desktop: http://127.0.0.1:${port}`));
const stop=()=>{child?.kill();server.close();auth.close();process.exit();};
process.on('SIGINT',stop);process.on('SIGTERM',stop);process.on('exit',()=>child?.kill());