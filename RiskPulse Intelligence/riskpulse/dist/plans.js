const STRIPE_URLS = {
  professional: 'https://buy.stripe.com/test_5kQ7sD55k7pX9L9dEG2oE0b',
  business: 'https://buy.stripe.com/test_8x27sDgO25hP8H57gi2oE0a',
  enterprise: 'https://buy.stripe.com/test_28E5kv0P44dL8H5eIK2oE0c'
};

const status=document.getElementById('planStatus');
document.querySelectorAll('[data-plan]').forEach(button=>button.addEventListener('click',async()=>{
 const plan = button.dataset.plan;
 const stripeUrl = STRIPE_URLS[plan] || button.dataset.stripe;
 const buttons=[...document.querySelectorAll('[data-plan]')];buttons.forEach(b=>b.disabled=true);
 try{
  const response=await fetch('/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan})});
  const result=await response.json();
  if(response.status===401){location.assign('/?auth=signin');return;}
  if(!response.ok)throw new Error(result.error||'Unable to save plan.');
  if(stripeUrl){ window.open(stripeUrl, '_blank'); }
  status.replaceChildren(document.createTextNode(plan[0].toUpperCase()+plan.slice(1)+' preference saved. Complete payment in Stripe or: '));
  const link=document.createElement('a');
  link.href='/app';
  link.className='button';
  link.textContent='Continue to dashboard ↗';
  status.append(link);
  status.scrollIntoView({behavior:'smooth',block:'center'});
 }catch(error){
  status.textContent=error.message;
 }finally{
  buttons.forEach(b=>b.disabled=false);
 }
}));