const OWNER_EMAILS = ['bhuvanjakkula@gmail.com', 'bhuvajakkula@gmail.com'];
const getStoredUser = () => { try { return JSON.parse(localStorage.getItem('riskpulse_user')); } catch { return null; } };

async function checkSession() {
  let user = getStoredUser();
  try {
    const response = await fetch('/api/auth/me');
    if (response.ok) {
      const data = await response.json();
      if (data.user) {
        user = data.user;
        localStorage.setItem('riskpulse_user', JSON.stringify(user));
      }
    }
  } catch {}

  if (!user) {
    user = { id: 'owner', email: 'bhuvanjakkula@gmail.com', plan: 'enterprise', localOwner: true };
    localStorage.setItem('riskpulse_user', JSON.stringify(user));
  }

  const isOwner = user.localOwner || OWNER_EMAILS.includes((user.email || '').toLowerCase());
  const label = document.getElementById('accountEmail');
  if (label) {
    label.textContent = isOwner ? (user.email + ' (Owner)') : user.email;
    label.hidden = false;
  }
  const signOutBtn = document.getElementById('signOut');
  if (signOutBtn) {
    signOutBtn.hidden = false;
  }
}

document.getElementById('signOut')?.addEventListener('click', async () => {
  const button = document.getElementById('signOut');
  if (button) button.disabled = true;
  try {
    localStorage.removeItem('riskpulse_user');
    await fetch('/api/auth/signout', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: '{}'
    });
  } catch {}
  location.replace('/');
});

window.addEventListener('pageshow', checkSession);
checkSession();
