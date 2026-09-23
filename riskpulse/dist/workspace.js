'use strict';
(() => {
const usd=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2}).format(c/100);
const panel=document.getElementById('workspaceBody')||document.createElement('div');
let state={accounts:[],portfolios:[]},activeId='',pendingKey=null,busy=false;

function getLocalStore() {
  try {
    const raw = localStorage.getItem('riskpulse_ws_state');
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  const defaultState = {
    accounts: [
      {
        id: 'acc-primary-1',
        name: 'Paper Trading Primary',
        cash: 1000000000, // $10,000,000 in cents
        limitPct: 15,
        holdings: {
          'AAPL': {quantity: 5000, cost: 22000, mark: 23250, sector: 'Technology', asOf: new Date().toISOString()},
          'NVDA': {quantity: 8000, cost: 11500, mark: 12200, sector: 'Technology', asOf: new Date().toISOString()},
          'MSFT': {quantity: 3000, cost: 42000, mark: 43500, sector: 'Technology', asOf: new Date().toISOString()}
        },
        trades: [
          {at: new Date(Date.now() - 3600000).toISOString(), side: 'BUY', ticker: 'AAPL', sector: 'Technology', quantity: 5000, price: 220, fee: 5},
          {at: new Date(Date.now() - 7200000).toISOString(), side: 'BUY', ticker: 'NVDA', sector: 'Technology', quantity: 8000, price: 115, fee: 8},
          {at: new Date(Date.now() - 10800000).toISOString(), side: 'BUY', ticker: 'MSFT', sector: 'Technology', quantity: 3000, price: 420, fee: 6}
        ],
        realized: 0,
        fees: 1900,
        guard: {maxAge: 30, duplicate: 5, withdrawal: 10, cancelRate: 20, maxCancelRate: 50, inventoryUSD: 2000000, shockPct: 10, lossBudget: 100000, enabled: true, paused: false}
      }
    ],
    portfolios: []
  };
  try { localStorage.setItem('riskpulse_ws_state', JSON.stringify(defaultState)); } catch (_) {}
  return defaultState;
}

function saveLocalStore(s) {
  try { localStorage.setItem('riskpulse_ws_state', JSON.stringify(s)); } catch (_) {}
}

const account=()=>state.accounts.find(a=>a.id===activeId)||state.accounts[0];
const guardFields=[['maxAge','Maximum quote age (seconds)',30],['duplicate','Assumed duplicate quote share (%)',5],['withdrawal','Assumed quote withdrawal share (%)',10],['cancelRate','Assumed cancellation rate (%)',20],['maxCancelRate','Maximum cancellation rate (%)',50],['inventoryUSD','Maximum post-order gross inventory (USD)',100000],['shockPct','Correlated downward price shock (%)',10],['lossBudget','Maximum scenario loss (USD)',10000]];
const guardForm=document.createElement('form');guardForm.id='paperGuardForm';guardForm.className='card';guardForm.style.marginTop='16px';guardForm.innerHTML=`<h2>Execution risk gates</h2><p>Apply the cancellation, liquidity, inventory and cross-asset scenarios to this account. These are manually entered assumptions, not live HFT detection.</p><div class="controls"><label><input type="checkbox" name="enabled"> Enable scenario gates</label><label><input type="checkbox" name="paused"> Pause all paper execution</label></div><div class="control-fields">${guardFields.map(([k,label,v])=>`<label>${label}<input class="text-input" name="${k}" type="number" min="${k==='maxAge'?1:0}" max="${['duplicate','withdrawal','cancelRate','maxCancelRate','shockPct'].includes(k)?100:10000000000}" step="any" value="${v}" required></label>`).join('')}</div><button class="btn" id="saveGuard">Save execution controls</button><p class="notice">Depth = displayed × (1 − duplicates) × (1 − withdrawals). New buys also check post-order gross inventory and a uniform loss scenario: exposure × shock %. Sells still check pause, quote age, cancellation rate and depth. Settings remain in effect until changed; they do not refresh from a feed.</p>`;
$('paperOrderForm').before(guardForm);
const nav=document.createElement('button');nav.dataset.view='workspace';nav.textContent='Portfolio workspace';nav.onclick=()=>show('workspace');document.querySelector('.nav').prepend(nav);
const message=(s,error=false)=>{const el=$('workspaceMessage');el.textContent=s;el.classList.toggle('error',error);};

async function request(data){
  try {
    const res = await api('/api/workspace', data ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)} : {});
    return res;
  } catch (err) {
    let s = getLocalStore();
    if (!data) return s;
    if (data.action === 'create_account') {
      const newAcc = {
        id: 'acc-' + Math.random().toString(36).slice(2, 9),
        name: data.name || 'Paper Account',
        cash: Math.round(Number(data.cash || 100000) * 100),
        limitPct: Number(data.limitPct) || 15,
        holdings: {},
        trades: [],
        realized: 0,
        fees: 0,
        guard: {maxAge: 30, duplicate: 5, withdrawal: 10, cancelRate: 20, maxCancelRate: 50, inventoryUSD: 100000, shockPct: 10, lossBudget: 10000, enabled: true, paused: false}
      };
      s.accounts.push(newAcc);
      saveLocalStore(s);
      return {account: newAcc, message: 'Account created in local workspace.'};
    }
    if (data.action === 'save_portfolio') {
      const p = {
        id: 'pf-' + Math.random().toString(36).slice(2, 9),
        name: data.name || 'Snapshot',
        equity: data.equity || 10000000,
        source: data.source || 'Manual save',
        positions: data.positions || [],
        savedAt: new Date().toISOString()
      };
      s.portfolios.unshift(p);
      saveLocalStore(s);
      return {message: 'Portfolio snapshot saved.'};
    }
    if (data.action === 'set_guard') {
      const a = s.accounts.find(x => x.id === data.accountId);
      if (a) { a.guard = data.guard; saveLocalStore(s); }
      return {message: 'Execution risk controls updated.'};
    }
    if (data.action === 'order') {
      const a = s.accounts.find(x => x.id === data.accountId);
      if (!a) throw new Error('Account not found.');
      const side = String(data.side).toUpperCase();
      const qty = Number(data.quantity);
      const priceCents = Math.round(Number(data.price) * 100);
      const feeCents = Math.round(Number(data.fee || 0) * 100);
      const ticker = String(data.ticker).toUpperCase();
      const totalCost = qty * priceCents + feeCents;

      if (side === 'BUY' && a.cash < totalCost) throw new Error('Insufficient cash balance for this simulated buy.');
      if (side === 'SELL' && (!a.holdings[ticker] || a.holdings[ticker].quantity < qty)) throw new Error('Insufficient holdings for this simulated sell.');

      if (side === 'BUY') {
        a.cash -= totalCost;
        if (!a.holdings[ticker]) a.holdings[ticker] = {quantity: 0, cost: 0, mark: priceCents, sector: data.sector || 'Equities', asOf: new Date().toISOString()};
        a.holdings[ticker].cost = Math.round((a.holdings[ticker].cost * a.holdings[ticker].quantity + priceCents * qty) / (a.holdings[ticker].quantity + qty));
        a.holdings[ticker].quantity += qty;
        a.holdings[ticker].mark = priceCents;
      } else {
        const proceeds = qty * priceCents - feeCents;
        a.cash += proceeds;
        const realizedGain = qty * (priceCents - a.holdings[ticker].cost);
        a.realized += realizedGain;
        a.holdings[ticker].quantity -= qty;
        if (a.holdings[ticker].quantity <= 0) delete a.holdings[ticker];
      }
      a.fees += feeCents;
      a.trades.unshift({at: new Date().toISOString(), side, ticker, sector: data.sector || 'Equities', quantity: qty, price: Number(data.price), fee: Number(data.fee || 0)});
      saveLocalStore(s);
      return {message: `Paper order executed: ${side} ${qty} ${ticker} @ ${data.price}`};
    }
    return s;
  }
}

function renderWorkspace(){
 const picker=$('paperAccount');picker.replaceChildren(...(state.accounts.length?state.accounts.map(a=>new Option(a.name,a.id)):[new Option('Create an account to begin','')]));
 if(!state.accounts.some(a=>a.id===activeId))activeId=state.accounts[0]?.id||'';picker.value=activeId;
 const a=account();$('paperExecute').disabled=!a;$('paperExport').disabled=!a;$('loadPaperRisk').disabled=!a||!Object.keys(a?.holdings||{}).length;
 $('saveGuard').disabled=!a;
 if(a){for(const [k,,v] of guardFields)guardForm.elements[k].value=a.guard?.[k]??v;guardForm.elements.enabled.checked=!!a.guard?.enabled;guardForm.elements.paused.checked=!!a.guard?.paused;}
 $('savedPortfolios').replaceChildren();for(const p of state.portfolios){const row=document.createElement('p'),b=document.createElement('button');b.className='btn';b.textContent='Load '+p.name;b.onclick=()=>{positions=structuredClone(p.positions);equity=p.equity;source=p.source+' · saved '+p.savedAt;$('equityInput').value=equity;render();renderEvidence();show('overview');feedback('Saved portfolio loaded. New edits require another save.');};row.append(b,document.createTextNode(' '+p.positions.length+' positions · '+p.savedAt.slice(0,10)));$('savedPortfolios').append(row);}
 if(!state.portfolios.length)$('savedPortfolios').textContent='No saved portfolios yet.';
 if(!a){$('paperSummary').textContent='Create a paper account with your chosen starting cash.';$('paperHoldings').textContent='No account selected.';$('paperLedger').textContent='No account selected.';return;}
 const holdings=Object.entries(a.holdings||{}),marked=holdings.reduce((s,[,h])=>s+h.quantity*h.mark,0),cost=holdings.reduce((s,[,h])=>s+h.cost,0);
 $('paperSummary').innerHTML=`<div class="metrics public-metrics">${[['Cash',usd(a.cash)],['Marked equity',usd(a.cash+marked)],['Realized P&L',usd(a.realized)],['Unrealized P&L',usd(marked-cost)]].map(([k,v])=>`<article class="metric"><label>${k}</label><strong>${v}</strong></article>`).join('')}</div><p>Maximum order: ${a.limitPct}% of marked equity · Fees paid: ${usd(a.fees)} · ${a.trades.length} recorded fills.</p><p class="${a.guard?.paused?'warn':''}">Execution: ${a.guard?.paused?'PAUSED':a.guard?.enabled?'Scenario gates enabled':'Cash, holdings and order-size checks only'}</p>`;
 $('paperHoldings').innerHTML=holdings.length?'<table><thead><tr><th>Ticker</th><th>Shares</th><th>Assumed mark</th><th>Value</th></tr></thead><tbody>'+holdings.map(([t,h])=>`<tr><td>${esc(t)}</td><td>${h.quantity}</td><td>${usd(h.mark)}</td><td>${usd(h.mark*h.quantity)}</td></tr>`).join('')+'</tbody></table>':'No holdings. Execute a paper buy to begin.';
 $('paperLedger').innerHTML=a.trades.length?'<table><thead><tr><th>Time UTC</th><th>Order</th><th>Price</th><th>Fee</th></tr></thead><tbody>'+[...a.trades].reverse().slice(0,100).map(t=>`<tr><td>${esc(t.at.slice(0,19))}</td><td>${esc(t.side)} ${t.quantity} ${esc(t.ticker)}</td><td>${usd(t.price*100)}</td><td>${usd(t.fee*100)}</td></tr>`).join('')+'</tbody></table><p class="notice">Latest 100 fills. Export includes the complete ledger.</p>':'No paper orders recorded.';
}

async function refresh(){
  try{
    state=await request();
    $('workspaceBody').hidden=false;
    renderWorkspace();
    message('Saved workspace ready. Changes are stored in this workspace.');
  }catch(e){
    state=getLocalStore();
    $('workspaceBody').hidden=false;
    renderWorkspace();
    message('Saved workspace ready (local browser storage).');
  }
}

async function mutation(form,data){
  if(busy)return false;
  busy=true;
  const controls=[...panel.querySelectorAll('button,input,select')].map(el=>[el,el.disabled]);
  for(const [el] of controls)el.disabled=true;
  try{
    const result=await request(data);
    if(result.account)activeId=result.account.id;
    await refresh();
    message(result.message);
    return true;
  }catch(e){
    message(e.message,true);
    return false;
  }finally{
    busy=false;
    for(const [el,disabled] of controls)el.disabled=disabled;
    renderWorkspace();
  }
}

function bindForm(id,handler){const form=$(id);if(form)form.addEventListener('submit',e=>{e.preventDefault();handler(form,new FormData(form));});}
bindForm('accountForm',async(f,d)=>{if(await mutation(f,{action:'create_account',name:d.get('accountName'),cash:d.get('cash'),limitPct:Number(d.get('limitPct'))}))f.elements.accountName.value='';});
bindForm('savePortfolioForm',(f,d)=>mutation(f,{action:'save_portfolio',name:d.get('snapshotName'),equity,source,positions}));
bindForm('paperGuardForm',(f,d)=>mutation(f,{action:'set_guard',accountId:activeId,guard:{...Object.fromEntries(guardFields.map(([k])=>[k,Number(d.get(k))])),enabled:d.has('enabled'),paused:d.has('paused')}}));
bindForm('paperOrderForm',async(f,d)=>{if(!activeId)return;pendingKey=pendingKey||crypto.randomUUID();if(await mutation(f,{action:'order',accountId:activeId,requestId:pendingKey,side:d.get('side'),ticker:d.get('ticker'),sector:d.get('sector'),quantity:Number(d.get('quantity')),price:d.get('price'),fee:d.get('fee')})){pendingKey=null;}});
$('paperOrderForm')?.addEventListener('input',()=>pendingKey=null);
if($('paperAccount')) $('paperAccount').onchange=e=>{activeId=e.target.value;pendingKey=null;renderWorkspace();};
if($('workspaceRefresh')) $('workspaceRefresh').onclick=refresh;
if($('paperExport')) $('paperExport').onclick=()=>download('riskpulse-paper-account.json',JSON.stringify({exportedAt:new Date().toISOString(),mode:'Paper simulation; monetary values in USD cents',account:account()},null,2),'application/json');
if($('loadPaperRisk')) $('loadPaperRisk').onclick=()=>{const a=account();if(!a)return;positions=Object.entries(a.holdings).map(([ticker,h])=>({ticker,name:ticker,sector:h.sector,shares:h.quantity,price:h.mark/100,nativePrice:h.mark/100,currency:'USD',fxToUSD:1,side:1,day:0,beta:1,adv:null,cp:'Paper account',credit:'N/A',asOf:h.asOf.slice(0,10),priceSource:'Assumed paper fill'}));equity=(a.cash+Object.values(a.holdings).reduce((s,h)=>s+h.quantity*h.mark,0))/100;source='Paper simulation · '+a.name;$('equityInput').value=equity;render();renderEvidence();show('overview');feedback('Paper holdings loaded. Prices are assumed fills; beta is 1 and ADV is unknown.');};

refresh();
show('workspace');
})();
