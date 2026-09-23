import {DatabaseSync} from 'node:sqlite';
import {randomBytes, randomUUID, scrypt as derive, timingSafeEqual, createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
const scrypt=promisify(derive);
const digest=value=>createHash('sha256').update(value).digest('hex');
export function createAuth(path){
 mkdirSync(dirname(path),{recursive:true});
 const db=new DatabaseSync(path);
 db.exec(`PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,mobile TEXT NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL,plan TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL);`);
 const publicUser=u=>({id:u.id,email:u.email,plan:u.plan});
 const token=req=>(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('riskpulse_session='))?.slice(18)||'';
 const session=req=>{
  const raw=token(req);if(!/^[a-f0-9]{64}$/.test(raw))return null;
  const u=db.prepare('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?').get(digest(raw),Date.now());
  return u?publicUser(u):null;
 };
 const cookie=(value,age)=>`riskpulse_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}`;
 const issue=u=>{
  db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
  const raw=randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(raw),u.id,Date.now()+12*60*60*1000);
  return {user:publicUser(u),cookie:cookie(raw,43200)};
 };
 return {session,selectPlan(id,plan){
  if(!['professional','business','enterprise'].includes(plan))throw new Error('Choose a valid plan.');
  db.prepare('UPDATE users SET plan=? WHERE id=?').run(plan,id);
  return {plan,subscriptionActive:false};
 },localOwner(email){
  email=email.trim().toLowerCase();
  if(email!=='bhuvanjakkula@gmail.com')throw new Error('Local owner is not configured for this email.');
  let u=db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if(!u){
   const salt=randomBytes(16).toString('hex');
   db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(randomUUID(),email,'',salt,randomBytes(64).toString('hex'),'owner',Date.now());
   u=db.prepare('SELECT * FROM users WHERE email=?').get(email);
  }
  return {...publicUser(u),plan:'owner',access:'Local owner · Free access',localOwner:true};
 },close:()=>db.close(),async signup(data){
  const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';
  const mobile=typeof data.mobile==='string'?data.mobile.replace(/[\s()-]/g,''):'';
  if(email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Enter a valid email address.');
  if(!/^\+[1-9]\d{7,14}$/.test(mobile))throw new Error('Enter your mobile number with country code, such as +14155552671.');
  if(typeof data.password!=='string'||data.password.length<12||data.password.length>128)throw new Error('Use a password between 12 and 128 characters.');
  if(data.plan===undefined)data.plan='pending';
  if(!['pending','professional','business','enterprise'].includes(data.plan))throw new Error('Choose a valid plan.');
  const salt=randomBytes(16).toString('hex'),hash=(await scrypt(data.password,salt,64)).toString('hex');
  const user={id:randomUUID(),email,mobile,plan:data.plan};
  try{db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(user.id,email,mobile,salt,hash,data.plan,Date.now());}
  catch(e){if(e.code?.includes('CONSTRAINT')||e.message.includes('UNIQUE'))throw new Error('Unable to create this account. If you have an account, sign in.');throw e;}
  return issue(user);
 },async signin(data){
  const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';
  if(typeof data.password!=='string'||data.password.length>128)throw new Error('Email or password is incorrect.');
  const u=db.prepare('SELECT * FROM users WHERE email=?').get(email);
  const hash=await scrypt(data.password,u?.salt||'missing-account-timing-salt',64);
  if(!u||!timingSafeEqual(hash,Buffer.from(u.password_hash,'hex')))throw new Error('Email or password is incorrect.');
  return issue(u);
 },signout(req){db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token(req)));return cookie('',0);}};
}
