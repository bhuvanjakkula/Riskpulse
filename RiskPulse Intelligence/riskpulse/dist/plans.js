const STRIPE_URLS = {
  professional: 'https://buy.stripe.com/test_5kQ7sD55k7pX9L9dEG2oE0b',
  business: 'https://buy.stripe.com/test_8x27sDgO25hP8H57gi2oE0a',
  enterprise: 'https://buy.stripe.com/test_28E5kv0P44dL8H5eIK2oE0c'
};

const status = document.getElementById('planStatus');
let currentUser = null;

fetch('/api/auth/me').then(r => r.json()).then(({user}) => {
  currentUser = user;
  if (user && (user.localOwner || user.email === 'bhuvanjakkula@gmail.com')) {
    status.replaceChildren(document.createTextNode('Owner access verified (' + user.email + '). Free Enterprise access active: '));
    const link = document.createElement('a');
    link.href = '/app';
    link.className = 'button';
    link.textContent = 'Continue to main dashboard ↗';
    status.append(link);
  }
}).catch(() => {});

document.querySelectorAll('[data-plan]').forEach(button => button.addEventListener('click', async () => {
  const plan = button.dataset.plan;
  const isOwner = currentUser?.localOwner || currentUser?.email === 'bhuvanjakkula@gmail.com';
  const buttons = [...document.querySelectorAll('[data-plan]')];
  buttons.forEach(b => b.disabled = true);
  try {
    const response = await fetch('/api/plan', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({plan})
    });
    const result = await response.json();
    if (response.status === 401 && !isOwner) {
      location.assign('/?auth=signin');
      return;
    }
    
    if (isOwner) {
      status.replaceChildren(document.createTextNode(plan[0].toUpperCase() + plan.slice(1) + ' plan selected. Owner access granted with no payment required: '));
      const link = document.createElement('a');
      link.href = '/app';
      link.className = 'button';
      link.textContent = 'Continue to main dashboard ↗';
      status.append(link);
      status.scrollIntoView({behavior: 'smooth', block: 'center'});
      return;
    }

    const stripeUrl = STRIPE_URLS[plan];
    if (stripeUrl) {
      window.open(stripeUrl, '_blank');
    }
    
    status.replaceChildren(document.createTextNode(plan[0].toUpperCase() + plan.slice(1) + ' payment opened in Stripe. Once completed: '));
    const link = document.createElement('a');
    link.href = '/app';
    link.className = 'button';
    link.textContent = 'Open dashboard ↗';
    status.append(link);
    status.scrollIntoView({behavior: 'smooth', block: 'center'});
  } catch (error) {
    status.textContent = error.message;
  } finally {
    buttons.forEach(b => b.disabled = false);
  }
}));