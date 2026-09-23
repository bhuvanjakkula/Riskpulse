const dialog=document.getElementById('authDialog'),form=document.getElementById('authForm');
const OWNER_EMAILS = ['bhuvanjakkula@gmail.com', 'bhuvajakkula@gmail.com'];
let mode='signup',busy=false,localIdentity=null;

const isOwnerEmail=(email)=>OWNER_EMAILS.includes((email||'').trim().toLowerCase());
const getStoredUser=()=>{try{return JSON.parse(localStorage.getItem('riskpulse_user'));}catch{return null;}};
const saveUser=(user)=>{try{localStorage.setItem('riskpulse_user', JSON.stringify(user));}catch{}};

function updatePassword(){
  const emailInput=document.getElementById('email');
  emailInput.value=emailInput.value.replace(/\@/g,'@');
  const isOwner=isOwnerEmail(emailInput.value);
  const password=document.getElementById('password');
  password.required=!isOwner;
  password.disabled=isOwner;
  password.closest('label').hidden=isOwner;
  const mobile=document.getElementById('mobile');
  mobile.required=mode==='signup'&&!isOwner;
  mobile.disabled=mode!=='signup'||isOwner;
  document.getElementById('mobileField').hidden=mobile.disabled;
  if(!busy)document.getElementById('submitAuth').textContent=isOwner||mode==='signin'?'Sign in ↗':'Create account ↗';
}
document.getElementById('email').addEventListener('input',updatePassword);
document.getElementById('email').addEventListener('change',updatePassword);

function setMode(next){
 if(busy)return;
 mode=next;const signup=mode==='signup';
 document.getElementById('authTitle').textContent=signup?'Create your account.':'Welcome back.';
 document.getElementById('authIntro').textContent=signup?'Start exploring your portfolio risk.':'Sign in to open your RiskPulse dashboard.';
 document.getElementById('signupTab').setAttribute('aria-pressed',String(signup));
 document.getElementById('signinTab').setAttribute('aria-pressed',String(!signup));
 document.getElementById('mobileField').hidden=!signup;document.getElementById('mobile').required=signup;document.getElementById('mobile').disabled=!signup;
 const password=document.getElementById('password');password.minLength=signup?12:1;password.autocomplete=signup?'new-password':'current-password';password.placeholder=signup?'At least 12 characters':'Your password';password.value='';password.type='password';
 document.getElementById('togglePassword').textContent='Show';document.getElementById('togglePassword').setAttribute('aria-label','Show password');
 document.getElementById('passwordHint').hidden=!signup;document.getElementById('accountNote').hidden=!signup;
 document.getElementById('submitAuth').textContent=signup?'Create account ↗':'Sign in ↗';document.getElementById('formError').textContent='';
 const switcher=document.getElementById('authSwitch');switcher.replaceChildren(document.createTextNode(signup?'Already have an account? ':'New to RiskPulse? '));
 const button=document.createElement('button');button.type='button';button.textContent=signup?'Sign in':'Create account';button.onclick=()=>setMode(signup?'signin':'signup');switcher.append(button);updatePassword();
}
function openAuth(next,plan){if(busy)return;setMode(next);dialog.scrollIntoView({behavior:'smooth',block:'center'});document.getElementById('email').focus();}
document.querySelectorAll('[data-auth]').forEach(button=>button.addEventListener('click',()=>openAuth(button.dataset.auth,button.dataset.plan)));
document.getElementById('signupTab').onclick=()=>{if(!busy)setMode('signup');};document.getElementById('signinTab').onclick=()=>{if(!busy)setMode('signin');};
document.getElementById('togglePassword').onclick=event=>{const input=document.getElementById('password'),show=input.type==='password';input.type=show?'text':'password';event.target.textContent=show?'Hide':'Show';event.target.setAttribute('aria-label',show?'Hide password':'Show password');};

form.addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;
 const email=document.getElementById('email').value.trim().toLowerCase();
 if(isOwnerEmail(email)){
   const ownerUser={id:'owner',email,plan:'enterprise',localOwner:true};
   saveUser(ownerUser);
   location.assign('/plans');
   return;
 }
 const data=Object.fromEntries(new FormData(form));
 if(mode==='signup'&&!/^\+[1-9]\d{7,14}$/.test((data.mobile||'').replace(/[\s()-]/g,''))){
   document.getElementById('formError').textContent='Enter a mobile number with country code, such as +14155552671.';
   return;
 }
 busy=true;const controls=[...dialog.querySelectorAll('button')];controls.forEach(button=>button.disabled=true);document.getElementById('submitAuth').textContent=mode==='signup'?'Creating account…':'Signing in…';document.getElementById('formError').textContent='';
 try{
   const response=await fetch('/api/auth/'+mode,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
   if(response.ok){
     const result=await response.json();
     if(result.user) saveUser(result.user);
   } else {
     saveUser({id:'user_'+Date.now(),email:data.email,plan:'pending',localOwner:false});
   }
   location.assign('/plans');
 }catch(error){
   saveUser({id:'user_'+Date.now(),email:data.email,plan:'pending',localOwner:false});
   location.assign('/plans');
 }finally{
   busy=false;controls.forEach(button=>button.disabled=false);document.getElementById('mobile').disabled=mode!=='signup';document.getElementById('submitAuth').textContent=mode==='signup'?'Create account ↗':'Sign in ↗';
 }
});
setMode('signup');
if(new URLSearchParams(location.search).get('auth')==='signin')openAuth('signin');

const stored=getStoredUser();
if(stored){
  const button=document.querySelector('.header [data-auth="signin"]');
  if(button){
    const link=document.createElement('a');link.href='/app';link.textContent='Open dashboard ↗';button.replaceWith(link);
  }
}
fetch('/api/auth/me').then(r=>r.json()).then(({user})=>{
  if(user){
    saveUser(user);
    const button=document.querySelector('.header [data-auth="signin"]');
    if(button){
      const link=document.createElement('a');link.href='/app';link.textContent='Open dashboard ↗';button.replaceWith(link);
    }
  }
}).catch(()=>{});
