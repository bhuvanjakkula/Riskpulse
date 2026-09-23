const STRIPE_URLS = {
  professional: 'https://buy.stripe.com/test_5kQ7sD55k7pX9L9dEG2oE0b',
  business: 'https://buy.stripe.com/test_8x27sDgO25hP8H57gi2oE0a',
  enterprise: 'https://buy.stripe.com/test_28E5kv0P44dL8H5eIK2oE0c'
};

const OWNER_EMAILS = ['bhuvanjakkula@gmail.com', 'bhuvajakkula@gmail.com'];
const getStoredUser = () => { try { return JSON.parse(localStorage.getItem('riskpulse_user')); } catch { return null; } };

function renderOwnerBanner() {
  const user = getStoredUser();
  const isOwner = user?.localOwner || OWNER_EMAILS.includes((user?.email || '').toLowerCase());
  if (isOwner) {
    const pricing = document.getElementById('pricing');
    if (pricing && !document.getElementById('ownerBanner')) {
      const banner = document.createElement('div');
      banner.id = 'ownerBanner';
      banner.className = 'price-card featured';
      banner.style.marginBottom = '24px';
      banner.style.textAlign = 'center';
      banner.innerHTML = `
        <div class="plan-number">👑 OWNER ACCESS</div>
        <h3 style="margin: 8px 0;">Enterprise Unrestricted</h3>
        <p class="plan-description">Free owner access active for <strong>${user?.email || 'bhuvanjakkula@gmail.com'}</strong>.</p>
        <div style="margin-top: 16px;">
          <a href="/app" class="button" style="display:inline-block; padding: 10px 24px;">Open Dashboard ↗</a>
        </div>
      `;
      pricing.prepend(banner);
    }
  }
}

renderOwnerBanner();
fetch('/api/auth/me').then(r => r.json()).then(({user}) => {
  if (user) {
    localStorage.setItem('riskpulse_user', JSON.stringify(user));
    renderOwnerBanner();
  }
}).catch(() => {});

const status = document.getElementById('planStatus');
document.querySelectorAll('[data-plan]').forEach(button => button.addEventListener('click', async () => {
  const plan = button.dataset.plan;
  const stripeUrl = STRIPE_URLS[plan] || button.dataset.stripe;
  const buttons = [...document.querySelectorAll('[data-plan]')];
  buttons.forEach(b => b.disabled = true);
  
  try {
    const user = getStoredUser() || {};
    user.plan = plan;
    localStorage.setItem('riskpulse_user', JSON.stringify(user));
    
    fetch('/api/plan', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({plan})
    }).catch(() => {});

    if (stripeUrl) {
      window.open(stripeUrl, '_blank');
    }
    
    status.replaceChildren(document.createTextNode(plan[0].toUpperCase() + plan.slice(1) + ' preference saved. Complete payment in Stripe or: '));
    const link = document.createElement('a');
    link.href = '/app';
    link.className = 'button';
    link.textContent = 'Continue to dashboard ↗';
    link.style.marginLeft = '8px';
    status.append(link);
    status.scrollIntoView({behavior: 'smooth', block: 'center'});
  } catch (error) {
    status.textContent = error.message;
  } finally {
    buttons.forEach(b => b.disabled = false);
  }
}));
