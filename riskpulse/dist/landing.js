const dialog=document.getElementById('authDialog'),form=document.getElementById('authForm');
let mode='signup',busy=false,localIdentity=null;
const ownerSignin=()=>localIdentity?.localOwner&&document.getElementById('email').value.trim().toLowerCase()===localIdentity.email;
function updatePassword(){const email=document.getElementById('email');email.value=email.value.replace(/\\@/g,'@');const password=document.getElementById('password');const skip=Boolean(ownerSignin());password.required=!skip;password.disabled=skip;password.closest('label').hidden=skip;const mobile=document.getElementById('mobile');mobile.required=mode==='signup'&&!skip;mobile.disabled=mode!=='signup'||skip;document.getElementById('mobileField').hidden=mobile.disabled;if(!busy)document.getElementById('submitAuth').textContent=skip||mode==='signin'?'Sign in ↗':'Create account ↗';}
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
 if(ownerSignin()){location.assign('/plans');return;}
 const data=Object.fromEntries(new FormData(form));
 if(mode==='signup'&&!/^\+[1-9]\d{7,14}$/.test(data.mobile.replace(/[\s()-]/g,''))){document.getElementById('formError').textContent='Enter a mobile number with country code, such as +14155552671.';return;}
 busy=true;const controls=[...dialog.querySelectorAll('button')];controls.forEach(button=>button.disabled=true);document.getElementById('submitAuth').textContent=mode==='signup'?'Creating account…':'Signing in…';document.getElementById('formError').textContent='';
 try{const response=await fetch('/api/auth/'+mode,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to continue. Please try again.');location.assign('/plans');}
 catch(error){document.getElementById('formError').textContent=error.message==='Failed to fetch'?'Unable to reach RiskPulse. Check that the local application is running.':error.message;}
 finally{busy=false;controls.forEach(button=>button.disabled=false);document.getElementById('mobile').disabled=mode!=='signup';document.getElementById('submitAuth').textContent=mode==='signup'?'Create account ↗':'Sign in ↗';}
});
setMode('signup');
if(new URLSearchParams(location.search).get('auth')==='signin')openAuth('signin');
fetch('/api/auth/me').then(r=>r.json()).then(({user})=>{localIdentity=user;updatePassword();if(user){const button=document.querySelector('.header [data-auth="signin"]');const link=document.createElement('a');link.href='/app';link.textContent='Open dashboard ↗';button.replaceWith(link);}}).catch(()=>{});