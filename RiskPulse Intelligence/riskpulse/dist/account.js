async function checkSession(){
  try{
    const response=await fetch('/api/auth/me');
    const {user}=await response.json();
    const localOwner = (typeof localStorage !== 'undefined') ? localStorage.getItem('riskpulse_owner') : null;
    const currentUser = user || (localOwner === 'bhuvanjakkula@gmail.com' ? {id:'owner', email:'bhuvanjakkula@gmail.com', localOwner:true, plan:'enterprise'} : null);
    if(!currentUser){
      location.replace('/?auth=signin');
      return;
    }
    const label=document.getElementById('accountEmail');
    if(label){
      label.textContent = currentUser.email || '';
      label.hidden = false;
    }
  }catch{
    const localOwner = (typeof localStorage !== 'undefined') ? localStorage.getItem('riskpulse_owner') : null;
    if(localOwner === 'bhuvanjakkula@gmail.com'){
      const label=document.getElementById('accountEmail');
      if(label){
        label.textContent = 'Owner: bhuvanjakkula@gmail.com';
        label.hidden = false;
      }
    } else {
      location.replace('/?auth=signin');
    }
  }
}
document.getElementById('signOut')?.addEventListener('click',async()=>{
  try{localStorage.removeItem('riskpulse_owner');}catch(_){}
  try{await fetch('/api/auth/signout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});}catch(_){}
  location.replace('/');
});
window.addEventListener('pageshow',checkSession);
