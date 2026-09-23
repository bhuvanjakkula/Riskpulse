'use strict';
(() => {
  const guardFields = [
    ['maxAge', 'Maximum quote age (s)', 60],
    ['duplicate', 'Duplicate quote fraction %', 0],
    ['withdrawal', 'Withdrawal probability %', 0],
    ['cancelRate', 'Reported cancellation %', 0],
    ['maxCancelRate', 'Maximum allowed cancellation %', 50],
    ['shockPct', 'Loss shock scenario %', 15]
  ];

  let state = {
    accounts: [{
      id: 'primary-trading',
      name: 'Primary Trading Account',
      cash: 10000000, // $100,000.00
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

  let activeId = 'primary-trading', pendingKey = null, busy = false;

  try {
    const saved = localStorage.getItem('riskpulse_workspace');
    if (saved) state = JSON.parse(saved);
  } catch {}

  const usd = c => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(c / 100);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const account = () => state.accounts.find(a => a.id === activeId) || state.accounts[0];

  function saveState() {
    try { localStorage.setItem('riskpulse_workspace', JSON.stringify(state)); } catch {}
  }

  const message = (s, error = false) => {
    const el = document.getElementById('workspaceMessage');
    if (el) {
      el.textContent = s;
      el.classList.toggle('error', error);
    }
  };

  async function request(data) {
    try {
      if (typeof api === 'function') {
        const res = await api('/api/workspace', data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {});
        if (res && res.accounts) return res;
      }
    } catch {}

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
      saveState();
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
      saveState();
      return { message: 'Portfolio snapshot "' + data.name + '" saved.' };
    }

    if (data.action === 'set_guard') {
      const a = account();
      if (a) {
        a.guard = data.guard;
        saveState();
      }
      return { message: 'Execution risk controls saved.' };
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
        saveState();
        return { message: `Filled BUY ${qty} shares of ${data.ticker} at ${usd(price)}.` };
      } else if (data.side === 'SELL') {
        const h = a.holdings[data.ticker];
        if (!h || h.quantity < qty) throw new Error(`Insufficient shares of ${data.ticker} to sell.`);
        h.quantity -= qty;
        const proceeds = qty * price - fee;
        a.cash += proceeds;
        a.fees += fee;
        if (h.quantity === 0) delete a.holdings[data.ticker];
        a.trades.push({ at: new Date().toISOString(), side: 'SELL', ticker: data.ticker, quantity: qty, price: price, fee: fee });
        saveState();
        return { message: `Filled SELL ${qty} shares of ${data.ticker} at ${usd(price)}.` };
      }
    }

    return state;
  }

  function renderWorkspace() {
    const picker = document.getElementById('paperAccount');
    if (picker) {
      picker.replaceChildren(...(state.accounts.length ? state.accounts.map(a => new Option(a.name, a.id)) : [new Option('Create an account to begin', '')]));
      if (!state.accounts.some(a => a.id === activeId)) activeId = state.accounts[0]?.id || '';
      picker.value = activeId;
    }

    const a = account();
    const execBtn = document.getElementById('paperExecute');
    const expBtn = document.getElementById('paperExport');
    const loadBtn = document.getElementById('loadPaperRisk');
    const saveGuardBtn = document.getElementById('saveGuard');

    if (execBtn) execBtn.disabled = !a;
    if (expBtn) expBtn.disabled = !a;
    if (loadBtn) loadBtn.disabled = !a || !Object.keys(a.holdings || {}).length;
    if (saveGuardBtn) saveGuardBtn.disabled = !a;

    const guardForm = document.getElementById('paperGuardForm');
    if (a && guardForm) {
      for (const [k, , v] of guardFields) {
        if (guardForm.elements[k]) guardForm.elements[k].value = a.guard?.[k] ?? v;
      }
      if (guardForm.elements['enabled']) guardForm.elements['enabled'].checked = !!a.guard?.enabled;
      if (guardForm.elements['paused']) guardForm.elements['paused'].checked = !!a.guard?.paused;
    }

    const savedDiv = document.getElementById('savedPortfolios');
    if (savedDiv) {
      savedDiv.replaceChildren();
      for (const p of state.portfolios) {
        const row = document.createElement('p');
        const b = document.createElement('button');
        b.className = 'btn';
        b.textContent = 'Load ' + p.name;
        b.onclick = () => {
          if (typeof window.positions !== 'undefined') {
            window.positions = structuredClone(p.positions);
            window.equity = p.equity;
            window.source = p.source + ' · saved ' + p.savedAt;
            const eqInp = document.getElementById('equityInput');
            if (eqInp) eqInp.value = window.equity;
            if (typeof render === 'function') render();
            if (typeof renderEvidence === 'function') renderEvidence();
            if (typeof show === 'function') show('overview');
            if (typeof feedback === 'function') feedback('Saved portfolio loaded.');
          }
        };
        row.append(b, document.createTextNode(' ' + p.positions.length + ' positions · ' + p.savedAt.slice(0, 10)));
        savedDiv.append(row);
      }
      if (!state.portfolios.length) savedDiv.textContent = 'No saved portfolios yet.';
    }

    const sumDiv = document.getElementById('paperSummary');
    const holdDiv = document.getElementById('paperHoldings');
    const legDiv = document.getElementById('paperLedger');

    if (!a) {
      if (sumDiv) sumDiv.textContent = 'Create a paper account with your chosen starting cash.';
      if (holdDiv) holdDiv.textContent = 'No account selected.';
      if (legDiv) legDiv.textContent = 'No account selected.';
      return;
    }

    const holdings = Object.entries(a.holdings || {});
    const marked = holdings.reduce((s, [, h]) => s + h.quantity * h.mark, 0);
    const cost = holdings.reduce((s, [, h]) => s + h.cost, 0);

    if (sumDiv) {
      sumDiv.innerHTML = `
        <div class="metrics public-metrics">
          ${[['Cash', usd(a.cash)], ['Marked equity', usd(a.cash + marked)], ['Realized P&L', usd(a.realized)], ['Unrealized P&L', usd(marked - cost)]].map(([k, v]) => `<article class="metric"><label>${k}</label><strong>${v}</strong></article>`).join('')}
        </div>
        <p>Maximum order: ${a.limitPct}% of marked equity · Fees paid: ${usd(a.fees)} · ${a.trades.length} recorded fills.</p>
        <p class="${a.guard?.paused ? 'warn' : ''}">Execution: ${a.guard?.paused ? 'PAUSED' : a.guard?.enabled ? 'Scenario gates enabled' : 'Standard balance checks'}</p>
      `;
    }

    if (holdDiv) {
      holdDiv.innerHTML = holdings.length ?
        '<div class="table-wrap"><table><thead><tr><th>Ticker</th><th>Shares</th><th>Assumed mark</th><th>Value</th></tr></thead><tbody>' +
        holdings.map(([t, h]) => `<tr><td><strong>${esc(t)}</strong></td><td>${h.quantity}</td><td>${usd(h.mark)}</td><td>${usd(h.mark * h.quantity)}</td></tr>`).join('') +
        '</tbody></table></div>' : 'No holdings. Execute a paper buy to begin.';
    }

    if (legDiv) {
      legDiv.innerHTML = a.trades.length ?
        '<div class="table-wrap"><table><thead><tr><th>Time UTC</th><th>Order</th><th>Price</th><th>Fee</th></tr></thead><tbody>' +
        [...a.trades].reverse().slice(0, 50).map(t => `<tr><td>${esc(t.at.slice(0, 19))}</td><td>${esc(t.side)} ${t.quantity} ${esc(t.ticker)}</td><td>${usd(t.price)}</td><td>${usd(t.fee)}</td></tr>`).join('') +
        '</tbody></table></div><p class="notice">Latest 50 fills shown.</p>' : 'No paper orders recorded.';
    }
  }

  async function refresh() {
    try {
      const res = await request();
      if (res && res.accounts) state = res;
      const body = document.getElementById('workspaceBody');
      if (body) body.hidden = false;
      renderWorkspace();
      message('Portfolio workspace ready.');
    } catch (e) {
      renderWorkspace();
      message(e.message, true);
    }
  }

  async function mutation(form, data) {
    if (busy) return false;
    busy = true;
    const controls = [...document.querySelectorAll('#workspace button, #workspace input, #workspace select')].map(el => [el, el.disabled]);
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
    const form = document.getElementById(id);
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
    equity: typeof window.equity !== 'undefined' ? window.equity : 100000,
    source: typeof window.source !== 'undefined' ? window.source : 'Live portfolio',
    positions: typeof window.positions !== 'undefined' ? window.positions : []
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
    const a = account();
    if (!a) return;
    pendingKey = pendingKey || crypto.randomUUID();
    if (await mutation(f, {
      action: 'order',
      accountId: a.id,
      requestId: pendingKey,
      side: d.get('side'),
      ticker: (d.get('ticker') || '').toUpperCase(),
      sector: d.get('sector'),
      quantity: Number(d.get('quantity')),
      price: d.get('price'),
      fee: d.get('fee')
    })) {
      pendingKey = null;
    }
  });

  const picker = document.getElementById('paperAccount');
  if (picker) {
    picker.onchange = e => {
      activeId = e.target.value;
      pendingKey = null;
      renderWorkspace();
    };
  }

  const wsRefreshBtn = document.getElementById('workspaceRefresh');
  if (wsRefreshBtn) wsRefreshBtn.onclick = refresh;

  const expBtn = document.getElementById('paperExport');
  if (expBtn) {
    expBtn.onclick = () => {
      const a = account();
      if (!a) return;
      if (typeof download === 'function') {
        download('riskpulse-paper-account.json', JSON.stringify({ exportedAt: new Date().toISOString(), mode: 'Paper simulation', account: a }, null, 2), 'application/json');
      }
    };
  }

  const loadRiskBtn = document.getElementById('loadPaperRisk');
  if (loadRiskBtn) {
    loadRiskBtn.onclick = () => {
      const a = account();
      if (!a) return;
      const holdings = Object.entries(a.holdings || {});
      if (!holdings.length) return;

      window.positions = holdings.map(([ticker, h]) => ({
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

      window.equity = (a.cash + holdings.reduce((s, [, h]) => s + h.quantity * h.mark, 0)) / 100;
      window.source = 'Paper simulation · ' + a.name;

      const eqInp = document.getElementById('equityInput');
      if (eqInp) eqInp.value = window.equity;
      if (typeof render === 'function') render();
      if (typeof renderEvidence === 'function') renderEvidence();
      if (typeof show === 'function') show('overview');
      if (typeof feedback === 'function') feedback('Paper holdings loaded into risk model.');
    };
  }

  refresh();
})();
