'use strict';
(() => {
let defaultState = {
  accounts: [{
    id: 'primary-trading',
    name: 'Primary Trading Account',
    cash: 10000000,
    limitPct: 20,
    holdings: {
      'NVDA': { quantity: 50, mark: 12500, cost: 600000, sector: 'Technology', asOf: new Date().toISOString() },
      'AAPL': { quantity: 100, mark: 22000, cost: 2100000, sector: 'Technology', asOf: new Date().toISOString() }
    },
    trades: [
      { at: new Date().toISOString(), side: 'BUY', ticker: 'NVDA', quantity: 50, price: 12000, fee: 100 },
      { at: new Date().toISOString(), side: 'BUY', ticker: 'AAPL', quantity: 100, price: 21000, fee: 100 }
    ],
    fees: 200,
    realized: 0,
    guard: { enabled: true, paused: false, maxAge: 60, duplicate: 0, withdrawal: 0, cancelRate: 0, maxCancelRate: 50, shockPct: 15 }
  }],
  portfolios: []
};

let state = (() => {
  try {
    const saved = localStorage.getItem('riskpulse_workspace');
    if (saved) return JSON.parse(saved);
  } catch {}
  return defaultState;
})();

let activeId = state.accounts[0]?.id || 'primary-trading', pendingKey = null, busy = false;
const usd = c => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(c / 100);
const account = () => state.accounts.find(a => a.id === activeId) || state.accounts[0];

function saveLocalState() {
  try { localStorage.setItem('riskpulse_workspace', JSON.stringify(state)); } catch {}
}

const panel = document.createElement('section');
panel.id = 'workspace';
panel.className = 'view';
panel.innerHTML = `<div class="section-head"><div><h2>Portfolio management & paper trading</h2><p>Build a portfolio, simulate execution, and review the resulting risk.</p></div><button class="btn" id="workspaceRefresh">Refresh saved data</button></div><p class="public-note">Desktop workspace · saved on this computer. Paper orders use your assumed USD fill price; they do not reach a broker. Marks remain at the last assumed fill until another trade. No live execution, dividends, tax lots, leverage or short sales.</p><p id="workspaceMessage" class="feedback" role="status">Portfolio workspace ready.</p><div id="workspaceBody"><div class="grid-even"><form class="card" id="accountForm"><h2>Create a paper account</h2><div class="control-fields"><label>Account name<input class="text-input" name="accountName" maxlength="100" required placeholder="Strategy practice"></label><label>Starting cash (USD)<input class="text-input" name="cash" type="number" min="0.01" max="10000000000" step="0.01" required value="100000"></label><label>Maximum order (% of marked equity)<input class="text-input" name="limitPct" type="number" min="1" max="100" step="1" required value="20"></label></div><button class="btn primary" id="createAccount">Create paper account</button></form><article class="card"><h2>Saved portfolio snapshots</h2><div id="savedPortfolios"></div><form id="savePortfolioForm" style="margin-top:16px"><div class="control-fields"><label>Snapshot name<input class="text-input" name="snapshotName" maxlength="100" required placeholder="Pre-close rebalance"></label></div><button class="btn" id="savePortfolio">Save current portfolio snapshot</button></form></article></div><article class="card" style="margin-top:16px"><div class="section-head"><div><h2>Paper account summary</h2><p>Deterministic balances and fills for this session</p></div><div class="controls"><label>Account<select id="paperAccount"></select></label><button class="btn" id="paperExport">Export paper account</button><button class="btn primary" id="loadPaperRisk">Load holdings into risk model</button></div></div><div id="paperSummary"></div><div class="grid-even" style="margin-top:16px"><div><h3>Holdings</h3><div id="paperHoldings"></div></div><div><h3>Simulated fills</h3><div id="paperLedger"></div></div></div></article><form class="card" id="paperOrderForm" style="margin-top:16px"><h2>Paper order</h2><div class="control-fields"><label>Side<select name="side"><option value="BUY">BUY</option><option value="SELL">SELL</option></select></label><label>Ticker<input class="text-input" name="ticker" maxlength="10" required placeholder="NVDA"></label><label>Sector<input class="text-input" name="sector" maxlength="60" required placeholder="Technology"></label><label>Quantity<input class="text-input" name="quantity" type="number" min="1" max="1000000000" step="1" required value="100"></label><label>Price (USD)<input class="text-input" name="price" type="number" min="0.01" max="1000000000" step="0.01" required value="120.00"></label><label>Fee (USD)<input class="text-input" name="fee" type="number" min="0" max="1000000" step="0.01" required value="1.00"></label></div><button class="btn primary" id="paperExecute">Execute paper order</button></form></div>`;
document.querySelector('main').append(panel);

const guardFields = [
  ['maxAge', 'Maximum quote age (s)', 60],
  ['duplicate', 'Duplicate quote fraction %', 0],
  ['withdrawal', 'Withdrawal probability %', 0],
  ['cancelRate', 'Reported cancellation %', 0],
  ['maxCancelRate', 'Maximum allowed cancellation %', 50],
  ['shockPct', 'Loss shock scenario %', 15]
];

const guardForm = document.createElement('form');
guardForm.id = 'paperGuardForm';
guardForm.className = 'card';
guardForm.style.marginTop = '16px';
guardForm.innerHTML = `<h2>Execution risk gates</h2><p>Apply the cancellation, liquidity, inventory and cross-asset scenarios to this account. These are manually entered assumptions, not live HFT detection.</p><div class="controls"><label><input type="checkbox" name="enabled" checked> Enable scenario gates</label><label><input type="checkbox" name="paused"> Pause all paper execution</label></div><div class="control-fields">${guardFields.map(([k, label, v]) => `<label>${label}<input class="text-input" name="${k}" type="number" min="${k === 'maxAge' ? 1 : 0}" max="${['duplicate', 'withdrawal', 'cancelRate', 'maxCancelRate', 'shockPct'].includes(k) ? 100 : 10000000000}" step="any" value="${v}" required></label>`).join('')}</div><button class="btn" id="saveGuard">Save execution controls</button><p class="notice">Depth = displayed × (1 − duplicates) × (1 − withdrawals). New buys also check post-order gross inventory and a uniform loss scenario: exposure × shock %. Sells still check pause, quote age, cancellation rate and depth. Settings remain in effect until changed; they do not refresh from a feed.</p>`;
$('paperOrderForm').before(guardForm);

const nav = document.createElement('button');
nav.dataset.view = 'workspace';
nav.textContent = 'Portfolio workspace';
nav.onclick = () => show('workspace');
document.querySelector('.nav').prepend(nav);

const message = (s, error = false) => {
  const el = $('workspaceMessage');
  if (el) {
    el.textContent = s;
    el.classList.toggle('error', error);
  }
};

async function request(data) {
  try {
    const res = await api('/api/workspace', data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {});
    if (res && res.accounts) {
      state = res;
      saveLocalState();
      return res;
    }
  } catch {}

  // Fallback to client-side localStorage state
  if (!data) return state;

  if (data.action === 'create_account') {
    const newAcc = {
      id: 'acc_' + Date.now(),
      name: data.name,
      cash: Math.round(Number(data.cash) * 100),
      limitPct: data.limitPct,
      holdings: {},
      trades: [],
      fees: 0,
      realized: 0,
      guard: { enabled: true, paused: false, maxAge: 60, duplicate: 0, withdrawal: 0, cancelRate: 0, maxCancelRate: 50, shockPct: 15 }
    };
    state.accounts.push(newAcc);
    activeId = newAcc.id;
    saveLocalState();
    return { account: newAcc, message: 'Account "' + data.name + '" created.' };
  }

  if (data.action === 'save_portfolio') {
    state.portfolios.push({
      name: data.name,
      equity: data.equity,
      source: data.source,
      positions: data.positions,
      savedAt: new Date().toISOString()
    });
    saveLocalState();
    return { message: 'Portfolio snapshot "' + data.name + '" saved.' };
  }

  if (data.action === 'set_guard') {
    const a = account();
    if (a) {
      a.guard = data.guard;
      saveLocalState();
    }
    return { message: 'Execution controls saved.' };
  }

  if (data.action === 'order') {
    const a = account();
    if (!a) throw new Error('Select a paper account first.');
    if (a.guard?.paused) throw new Error('Paper execution is currently PAUSED for this account.');

    const qty = Number(data.quantity);
    const price = Math.round(Number(data.price) * 100);
    const fee = Math.round(Number(data.fee) * 100);
    const cost = qty * price + fee;

    if (data.side === 'BUY') {
      if (a.cash < cost) throw new Error('Insufficient cash balance for this buy order.');
      a.cash -= cost;
      a.fees += fee;
      const h = a.holdings[data.ticker] || { quantity: 0, mark: price, cost: 0, sector: data.sector, asOf: new Date().toISOString() };
      h.quantity += qty;
      h.cost += cost;
      h.mark = price;
      h.sector = data.sector;
      a.holdings[data.ticker] = h;
      a.trades.push({ at: new Date().toISOString(), side: 'BUY', ticker: data.ticker, quantity: qty, price: price, fee: fee });
      saveLocalState();
      return { message: `Filled BUY ${qty} ${data.ticker} at ${usd(price)}.` };
    } else if (data.side === 'SELL') {
      const h = a.holdings[data.ticker];
      if (!h || h.quantity < qty) throw new Error(`Insufficient shares of ${data.ticker} to sell.`);
      h.quantity -= qty;
      const proceeds = qty * price - fee;
      a.cash += proceeds;
      a.fees += fee;
      if (h.quantity === 0) delete a.holdings[data.ticker];
      a.trades.push({ at: new Date().toISOString(), side: 'SELL', ticker: data.ticker, quantity: qty, price: price, fee: fee });
      saveLocalState();
      return { message: `Filled SELL ${qty} ${data.ticker} at ${usd(price)}.` };
    }
  }

  return state;
}

function renderWorkspace() {
  const picker = $('paperAccount');
  if (picker) {
    picker.replaceChildren(...(state.accounts.length ? state.accounts.map(a => new Option(a.name, a.id)) : [new Option('Create an account to begin', '')]));
    if (!state.accounts.some(a => a.id === activeId)) activeId = state.accounts[0]?.id || '';
    picker.value = activeId;
  }

  const a = account();
  if ($('paperExecute')) $('paperExecute').disabled = !a;
  if ($('paperExport')) $('paperExport').disabled = !a;
  if ($('loadPaperRisk')) $('loadPaperRisk').disabled = !a || !Object.keys(a?.holdings || {}).length;
  if ($('saveGuard')) $('saveGuard').disabled = !a;

  if (a && guardForm) {
    for (const [k, , v] of guardFields) {
      if (guardForm.elements[k]) guardForm.elements[k].value = a.guard?.[k] ?? v;
    }
    if (guardForm.elements.enabled) guardForm.elements.enabled.checked = !!a.guard?.enabled;
    if (guardForm.elements.paused) guardForm.elements.paused.checked = !!a.guard?.paused;
  }

  const savedDiv = $('savedPortfolios');
  if (savedDiv) {
    savedDiv.replaceChildren();
    for (const p of state.portfolios) {
      const row = document.createElement('p'), b = document.createElement('button');
      b.className = 'btn';
      b.textContent = 'Load ' + p.name;
      b.onclick = () => {
        positions = structuredClone(p.positions);
        equity = p.equity;
        source = p.source + ' · saved ' + p.savedAt;
        $('equityInput').value = equity;
        render();
        renderEvidence();
        show('overview');
        feedback('Saved portfolio loaded. New edits require another save.');
      };
      row.append(b, document.createTextNode(' ' + p.positions.length + ' positions · ' + p.savedAt.slice(0, 10)));
      savedDiv.append(row);
    }
    if (!state.portfolios.length) savedDiv.textContent = 'No saved portfolios yet.';
  }

  if (!a) {
    if ($('paperSummary')) $('paperSummary').textContent = 'Create a paper account with your chosen starting cash.';
    if ($('paperHoldings')) $('paperHoldings').textContent = 'No account selected.';
    if ($('paperLedger')) $('paperLedger').textContent = 'No account selected.';
    return;
  }

  const holdings = Object.entries(a.holdings || {});
  const marked = holdings.reduce((s, [, h]) => s + h.quantity * h.mark, 0);
  const cost = holdings.reduce((s, [, h]) => s + h.cost, 0);

  if ($('paperSummary')) {
    $('paperSummary').innerHTML = `
      <div class="metrics public-metrics">
        ${[['Cash', usd(a.cash)], ['Marked equity', usd(a.cash + marked)], ['Realized P&L', usd(a.realized)], ['Unrealized P&L', usd(marked - cost)]].map(([k, v]) => `<article class="metric"><label>${k}</label><strong>${v}</strong></article>`).join('')}
      </div>
      <p>Maximum order: ${a.limitPct}% of marked equity · Fees paid: ${usd(a.fees)} · ${a.trades.length} recorded fills.</p>
      <p class="${a.guard?.paused ? 'warn' : ''}">Execution: ${a.guard?.paused ? 'PAUSED' : a.guard?.enabled ? 'Scenario gates enabled' : 'Cash, holdings and order-size checks only'}</p>
    `;
  }

  if ($('paperHoldings')) {
    $('paperHoldings').innerHTML = holdings.length ?
      '<div class="table-wrap"><table><thead><tr><th>Ticker</th><th>Shares</th><th>Assumed mark</th><th>Value</th></tr></thead><tbody>' +
      holdings.map(([t, h]) => `<tr><td><strong>${esc(t)}</strong></td><td>${h.quantity}</td><td>${usd(h.mark)}</td><td>${usd(h.mark * h.quantity)}</td></tr>`).join('') +
      '</tbody></table></div>' : 'No holdings. Execute a paper buy to begin.';
  }

  if ($('paperLedger')) {
    $('paperLedger').innerHTML = a.trades.length ?
      '<div class="table-wrap"><table><thead><tr><th>Time UTC</th><th>Order</th><th>Price</th><th>Fee</th></tr></thead><tbody>' +
      [...a.trades].reverse().slice(0, 100).map(t => `<tr><td>${esc(t.at.slice(0, 19))}</td><td>${esc(t.side)} ${t.quantity} ${esc(t.ticker)}</td><td>${usd(t.price)}</td><td>${usd(t.fee)}</td></tr>`).join('') +
      '</tbody></table></div><p class="notice">Latest 100 fills. Export includes the complete ledger.</p>' : 'No paper orders recorded.';
  }
}

async function refresh() {
  try {
    const res = await request();
    if (res && res.accounts) state = res;
    $('workspaceBody').hidden = false;
    renderWorkspace();
    message('Saved workspace ready. Changes are stored on this computer.');
  } catch (e) {
    $('workspaceBody').hidden = false;
    renderWorkspace();
    message(e.message, true);
  }
}

async function mutation(form, data) {
  if (busy) return false;
  busy = true;
  const controls = [...panel.querySelectorAll('button,input,select')].map(el => [el, el.disabled]);
  for (const [el] of controls) el.disabled = true;
  try {
    const result = await request(data);
    if (result.account) activeId = result.account.id;
    await refresh();
    message(result.message);
    return true;
  } catch (e) {
    message(e.message, true);
    return false;
  } finally {
    busy = false;
    for (const [el, disabled] of controls) el.disabled = disabled;
    renderWorkspace();
  }
}

function bindForm(id, handler) {
  const form = $(id);
  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      handler(form, new FormData(form));
    });
  }
}

bindForm('accountForm', async (f, d) => {
  if (await mutation(f, { action: 'create_account', name: d.get('accountName'), cash: d.get('cash'), limitPct: Number(d.get('limitPct')) })) {
    f.elements.accountName.value = '';
  }
});

bindForm('savePortfolioForm', (f, d) => mutation(f, {
  action: 'save_portfolio',
  name: d.get('snapshotName'),
  equity,
  source,
  positions
}));

bindForm('paperGuardForm', (f, d) => mutation(f, {
  action: 'set_guard',
  accountId: activeId,
  guard: {
    ...Object.fromEntries(guardFields.map(([k]) => [k, Number(d.get(k))])),
    enabled: d.has('enabled'),
    paused: d.has('paused')
  }
}));

bindForm('paperOrderForm', async (f, d) => {
  if (!activeId) return;
  pendingKey = pendingKey || crypto.randomUUID();
  if (await mutation(f, {
    action: 'order',
    accountId: activeId,
    requestId: pendingKey,
    side: d.get('side'),
    ticker: d.get('ticker'),
    sector: d.get('sector'),
    quantity: Number(d.get('quantity')),
    price: d.get('price'),
    fee: d.get('fee')
  })) {
    pendingKey = null;
  }
});

$('paperOrderForm').addEventListener('input', () => pendingKey = null);
$('paperAccount').onchange = e => {
  activeId = e.target.value;
  pendingKey = null;
  renderWorkspace();
};
$('workspaceRefresh').onclick = refresh;

$('paperExport').onclick = () => download(
  'riskpulse-paper-account.json',
  JSON.stringify({ exportedAt: new Date().toISOString(), mode: 'Paper simulation; monetary values in USD cents', account: account() }, null, 2),
  'application/json'
);

$('loadPaperRisk').onclick = () => {
  const a = account();
  if (!a) return;
  positions = Object.entries(a.holdings || {}).map(([ticker, h]) => ({
    ticker,
    name: ticker,
    sector: h.sector || 'Equities',
    shares: h.quantity,
    price: h.mark / 100,
    nativePrice: h.mark / 100,
    currency: 'USD',
    fxToUSD: 1,
    side: 1,
    day: 0,
    beta: 1,
    adv: null,
    cp: 'Paper account',
    credit: 'N/A',
    asOf: (h.asOf || new Date().toISOString()).slice(0, 10),
    priceSource: 'Assumed paper fill'
  }));
  equity = (a.cash + Object.values(a.holdings || {}).reduce((s, h) => s + h.quantity * h.mark, 0)) / 100;
  source = 'Paper simulation · ' + a.name;
  $('equityInput').value = equity;
  render();
  renderEvidence();
  show('overview');
  feedback('Paper holdings loaded. Prices are assumed fills; beta is 1 and ADV is unknown.');
};

refresh();
show('workspace');
})();
