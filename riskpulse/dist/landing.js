const OWNER_EMAILS = ['bhuvanjakkula@gmail.com', 'bhuvajakkula@gmail.com'];
const isOwnerEmail = (e) => OWNER_EMAILS.includes((e || '').trim().toLowerCase());
const getStoredUser = () => { try { return JSON.parse(localStorage.getItem('riskpulse_user')); } catch { return null; } };
const saveUser = (u) => { try { localStorage.setItem('riskpulse_user', JSON.stringify(u)); } catch {} };

const dialog = document.getElementById('authDialog');
const form = document.getElementById('authForm');
let mode = 'signup', busy = false, localIdentity = getStoredUser();

const ownerSignin = () => isOwnerEmail(document.getElementById('email')?.value) || (localIdentity?.localOwner && isOwnerEmail(localIdentity?.email));

function updatePassword() {
  const email = document.getElementById('email');
  if (!email) return;
  email.value = email.value.replace(/\\@/g, '@');
  const skip = Boolean(ownerSignin());
  const password = document.getElementById('password');
  if (password) {
    password.required = !skip;
    password.disabled = skip;
    password.closest('label').hidden = skip;
  }
  const mobile = document.getElementById('mobile');
  if (mobile) {
    mobile.required = mode === 'signup' && !skip;
    mobile.disabled = mode !== 'signup' || skip;
    document.getElementById('mobileField').hidden = mobile.disabled;
  }
  if (!busy) {
    const btn = document.getElementById('submitAuth');
    if (btn) btn.textContent = skip || mode === 'signin' ? 'Sign in ↗' : 'Create account ↗';
  }
}

document.getElementById('email')?.addEventListener('input', updatePassword);
document.getElementById('email')?.addEventListener('change', updatePassword);

function setMode(next) {
  if (busy) return;
  mode = next;
  const signup = mode === 'signup';
  document.getElementById('authTitle').textContent = signup ? 'Create your account.' : 'Welcome back.';
  document.getElementById('authIntro').textContent = signup ? 'Start exploring your portfolio risk.' : 'Sign in to open your RiskPulse dashboard.';
  document.getElementById('signupTab')?.setAttribute('aria-pressed', String(signup));
  document.getElementById('signinTab')?.setAttribute('aria-pressed', String(!signup));
  
  const mobileField = document.getElementById('mobileField');
  const mobile = document.getElementById('mobile');
  if (mobileField && mobile) {
    mobileField.hidden = !signup;
    mobile.required = signup;
    mobile.disabled = !signup;
  }
  
  const password = document.getElementById('password');
  if (password) {
    password.minLength = signup ? 12 : 1;
    password.autocomplete = signup ? 'new-password' : 'current-password';
    password.placeholder = signup ? 'At least 12 characters' : 'Your password';
    password.value = '';
    password.type = 'password';
  }
  
  document.getElementById('togglePassword').textContent = 'Show';
  document.getElementById('togglePassword')?.setAttribute('aria-label', 'Show password');
  document.getElementById('passwordHint').hidden = !signup;
  document.getElementById('accountNote').hidden = !signup;
  document.getElementById('submitAuth').textContent = signup ? 'Create account ↗' : 'Sign in ↗';
  document.getElementById('formError').textContent = '';
  
  const switcher = document.getElementById('authSwitch');
  if (switcher) {
    switcher.replaceChildren(document.createTextNode(signup ? 'Already have an account? ' : 'New to RiskPulse? '));
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = signup ? 'Sign in' : 'Create account';
    button.onclick = () => setMode(signup ? 'signin' : 'signup');
    switcher.append(button);
  }
  updatePassword();
}

function openAuth(next) {
  if (busy) return;
  setMode(next);
  dialog?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('email')?.focus();
}

document.querySelectorAll('[data-auth]').forEach(button => button.addEventListener('click', () => openAuth(button.dataset.auth)));
document.getElementById('signupTab')?.addEventListener('click', () => { if (!busy) setMode('signup'); });
document.getElementById('signinTab')?.addEventListener('click', () => { if (!busy) setMode('signin'); });

document.getElementById('togglePassword')?.addEventListener('click', event => {
  const input = document.getElementById('password');
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  event.target.textContent = show ? 'Hide' : 'Show';
  event.target.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
});

form?.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  
  const email = (document.getElementById('email')?.value || '').trim().toLowerCase();
  if (isOwnerEmail(email)) {
    const ownerUser = { id: 'owner', email: email, plan: 'enterprise', localOwner: true };
    saveUser(ownerUser);
    location.assign('/plans');
    return;
  }
  
  const data = Object.fromEntries(new FormData(form));
  if (mode === 'signup' && !/^\+[1-9]\d{7,14}$/.test((data.mobile || '').replace(/[\s()-]/g, ''))) {
    document.getElementById('formError').textContent = 'Enter a mobile number with country code, such as +14155552671.';
    return;
  }
  
  busy = true;
  const controls = [...dialog.querySelectorAll('button')];
  controls.forEach(button => button.disabled = true);
  document.getElementById('submitAuth').textContent = mode === 'signup' ? 'Creating account…' : 'Signing in…';
  document.getElementById('formError').textContent = '';
  
  try {
    const response = await fetch('/api/auth/' + mode, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (response.ok) {
      const result = await response.json();
      if (result.user) saveUser(result.user);
    } else {
      saveUser({ id: 'user_' + Date.now(), email: data.email, plan: 'pending', localOwner: false });
    }
    location.assign('/plans');
  } catch (error) {
    saveUser({ id: 'user_' + Date.now(), email: data.email, plan: 'pending', localOwner: false });
    location.assign('/plans');
  } finally {
    busy = false;
    controls.forEach(button => button.disabled = false);
    const m = document.getElementById('mobile');
    if (m) m.disabled = mode !== 'signup';
    document.getElementById('submitAuth').textContent = mode === 'signup' ? 'Create account ↗' : 'Sign in ↗';
  }
});

setMode('signup');
if (new URLSearchParams(location.search).get('auth') === 'signin') openAuth('signin');

const activeUser = getStoredUser();
if (activeUser) {
  const button = document.querySelector('.header [data-auth="signin"]');
  if (button) {
    const link = document.createElement('a');
    link.href = '/app';
    link.textContent = 'Open dashboard ↗';
    button.replaceWith(link);
  }
}

fetch('/api/auth/me').then(r => r.json()).then(({ user }) => {
  if (user) {
    localIdentity = user;
    saveUser(user);
    updatePassword();
    const button = document.querySelector('.header [data-auth="signin"]');
    if (button) {
      const link = document.createElement('a');
      link.href = '/app';
      link.textContent = 'Open dashboard ↗';
      button.replaceWith(link);
    }
  }
}).catch(() => {});
