'use strict';
(() => {
  const guardFields = [
    ['depth', 'Displayed market depth (USD)', 1000000],
    ['duplicate', 'Duplicate quote fraction %', 0],
    ['withdrawal', 'Withdrawal probability %', 0],
    ['quoteAge', 'Assumed quote age (s)', 2],
    ['maxAge', 'Maximum quote age (s)', 60],
    ['cancelRate', 'Reported cancellation %', 0],
    ['maxCancelRate', 'Maximum allowed cancellation %', 50],
    ['inventoryLimit', 'Gross inventory limit (USD)', 5000000],
    ['shockPct', 'Loss shock scenario %', 15],
    ['lossBudget', 'Correlated shock budget (USD)', 500000]
  ];

  const defaultAccount = {
    id: 'primary-trading',
    name: 'Primary Trading Account',
    cash: 10000000, // $100,000.00
    initialCash: 10000000,
    limitPct: 20,
    holdings: {
      'NVDA': { quantity: 50, mark: 12500, cost: 600000, sector: 'Technology', asOf: new Date().toISOString() },
      'AAPL': { quantity: 100, mark: 22000, cost: 2100000, sector: 'Technology', asOf: new Date().toISOString() }
    },
    trades: [
      { id: 't1', requestId: 'req_1', at: new Date().toISOString(), ticker: 'NVDA', side: 'buy', quantity: 50, price: 12000, fee: 100, notional: 600000, priceBasis: 'User-entered assumed fill, not live execution' },
      { id: 't2', requestId: 'req_2', at: new Date().toISOString(), ticker: 'AAPL', side: 'buy', quantity: 100, price: 21000, fee: 100, notional: 2100000, priceBasis: 'User-entered assumed fill, not live execution' }
    ],
    fees: 200,
    realized: 0,
    createdAt: new Date().toISOString(),
    guard: {
      enabled: true,
      paused: false,
      depth: 1000000,
      duplicate: 0,
      withdrawal: 0,
      quoteAge: 2,
      maxAge: 60,
      cancelRate: 0,
      maxCancelRate: 50,
      inventoryLimit: 5000000,
      shockPct: 15,
      lossBudget: 500000,
      updatedAt: new Date().toISOString()
    }
  };

  let state = {
    accounts: [defaultAccount],
    portfolios: []
  };

  try {
    const saved = localStorage.getItem('riskpulse_workspace');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.accounts && parsed.accounts.length) state = parsed;
    }
  } catch {}

  let activeId = state.accounts[0]?.id || 'primary-trading', pendingKey = null, busy = false;

  const usd = c => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(c / 100);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const account = () => state.accounts.find(a => a.id === activeId) || state.accounts[0];

  function saveLocalState() {
    try { localStorage.setItem('riskpulse_workspace', JSON.stringify(state)); } catch {}
  }

  // Create Workspace Section
  const panel = document.createElement('section');
  panel.id = 'workspace';
  panel.className = 'view';
  panel.innerHTML = `
    <div class="section-head">
      <div>
        <h2>Portfolio management & paper trading</h2>
        <p>Build a portfolio, simulate execution, and review the resulting risk.</p>
      </div>
      <button class="btn" id="workspaceRefresh">Refresh saved data</button>
    </div>
    <p class="public-note">Desktop workspace · saved on this computer. Paper orders use your assumed USD fill price; they do not reach a broker. Marks remain at the last assumed fill until another trade. No live execution, dividends, tax lots, leverage or short sales.</p>
    <p id="workspaceMessage" class="feedback" role="status">Portfolio workspace ready.</p>
    <div id="workspaceBody">
      <div class="grid-even">
        <form class="card" id="accountForm">
          <h2>Create a paper account</h2>
          <div class="control-fields">
            <label>Account name<input class="text-input" name="accountName" maxlength="100" required placeholder="Strategy practice"></label>
            <label>Starting cash (USD)<input class="text-input" name="cash" type="number" min="0.01" max="10000000000" step="0.01" required value="100000"></label>
            <label>Maximum order (% of marked equity)<input class="text-input" name="limitPct" type="number" min="1" max="100" step="1" required value="20"></label>
          </div>
          <button class="btn primary" id="createAccount">Create paper account</button>
        </form>
        <article class="card">
          <h2>Saved portfolio snapshots</h2>
          <div id="savedPortfolios"></div>
          <form id="savePortfolioForm" style="margin-top:16px">
            <div class="control-fields">
              <label>Snapshot name<input class="text-input" name="snapshotName" maxlength="100" required placeholder="Pre-close rebalance"></label>
            </div>
            <button class="btn" id="savePortfolio">Save current portfolio snapshot</button>
          </form>
        </article>
      </div>
      <article class="card" style="margin-top:16px">
        <div class="section-head">
          <div>
            <h2>Paper account summary</h2>
            <p>Deterministic balances and fills for this session</p>
          </div>
          <div class="controls">
            <label>Account<select id="paperAccount"></select></label>
            <button class="btn" id="paperExport">Export paper account</button>
            <button class="btn primary" id="loadPaperRisk">Load holdings into risk model</button>
          </div>
        </div>
        <div id="paperSummary"></div>
        <div class="grid-even" style="margin-top:16px">
          <div>
            <h3>Holdings</h3>
            <div id="paperHoldings"></div>
          </div>
          <div>
            <h3>Simulated fills</h3>
            <div id="paperLedger"></div>
          </div>
        </div>
      </article>
      <form class="card" id="paperOrderForm" style="margin-top:16px">
        <h2>Paper order</h2>
        <div class="control-fields">
          <label>Side<select name="side"><option value="buy">BUY</option><option value="sell">SELL</option></select></label>
          <label>Ticker<input class="text-input" name="ticker" maxlength="20" required placeholder="NVDA"></label>
          <label>Sector<input class="text-input" name="sector" maxlength="60" required placeholder="Technology"></label>
          <label>Quantity<input class="text-input" name="quantity" type="number" min="1" max="100000000" step="1" required value="100"></label>
          <label>Price (USD)<input class="text-input" name="price" type="number" min="0.01" max="1000000000" step="0.01" required value="120.00"></label>
          <label>Fee (USD)<input class="text-input" name="fee" type="number" min="0" max="1000000" step="0.01" required value="1.00"></label>
        </div>
        <button class="btn primary" id="paperExecute">Execute paper order</button>
      </form>
    </div>
  `;
  document.querySelector('main').append(panel);

  // Create Execution Risk Gates Form
  const guardForm = document.createElement('form');
  guardForm.id = 'paperGuardForm';
  guardForm.className = 'card';
  guardForm.style.marginTop = '16px';
  guardForm.innerHTML = `
    <h2>Execution risk gates</h2>
    <p>Apply the cancellation, liquidity, inventory and cross-asset scenarios to this account. These are manually entered assumptions, not live HFT detection.</p>
    <div class="controls">
      <label><input type="checkbox" name="enabled" checked> Enable scenario gates</label>
      <label><input type="checkbox" name="paused"> Pause all paper execution</label>
    </div>
    <div class="control-fields">
      ${guardFields.map(([k, label, v]) => `<label>${label}<input class="text-input" name="${k}" type="number" min="${['maxAge'].includes(k) ? 1 : 0}" max="${['duplicate', 'withdrawal', 'cancelRate', 'maxCancelRate', 'shockPct'].includes(k) ? 100 : 10000000000}" step="any" value="${v}" required></label>`).join('')}
    </div>
    <button class="btn" id="saveGuard">Save execution controls</button>
    <p class="notice">Depth = displayed × (1 − duplicates) × (1 − withdrawals). New buys also check post-order gross inventory and a uniform loss scenario: exposure × shock %. Sells still check pause, quote age, cancellation rate and depth. Settings remain in effect until changed; they do not refresh from a feed.</p>
  `;
  $('paperOrderForm').before(guardForm);

  // Prepend Portfolio Workspace Nav Button
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
      if (res && (res.accounts || res.account || res.portfolio)) {
        if (res.accounts) state = res;
        saveLocalState();
        return res;
      }
    } catch {}

    // Autonomous client handling matching workspace.py
    if (!data) return state;

    if (data.action === 'create_account') {
      const limit = Number(data.limitPct) || 10;
      if (limit < 1 || limit > 100) throw new Error('Order limit must be between 1 and 100 percent.');
      const cash = Math.round(Number(data.cash) * 100);
      if (cash <= 0) throw new Error('Starting cash must be positive.');
      
      const newAcc = {
        id: 'acc_' + Date.now(),
        name: (data.name || '').trim() || 'Trading Account',
        initialCash: cash,
        cash: cash,
        limitPct: limit,
        holdings: {},
        trades: [],
        createdAt: new Date().toISOString(),
        realized: 0,
        fees: 0,
        guard: {
          enabled: true,
          paused: false,
          depth: 1000000,
          duplicate: 0,
          withdrawal: 0,
          quoteAge: 2,
          maxAge: 60,
          cancelRate: 0,
          maxCancelRate: 50,
          inventoryLimit: 5000000,
          shockPct: 15,
          lossBudget: 500000,
          updatedAt: new Date().toISOString()
        }
      };
      state.accounts.unshift(newAcc);
      activeId = newAcc.id;
      saveLocalState();
      return { account: newAcc, message: 'Paper account created.' };
    }

    if (data.action === 'order') {
      const a = account();
      if (!a) throw new Error('Select an existing paper account.');
      const key = data.requestId || 'req_' + Date.now();
      if (a.trades.some(t => t.requestId === key)) {
        return { account: a, message: 'This paper order was already recorded; it was not repeated.' };
      }

      const ticker = (data.ticker || '').trim().toUpperCase();
      if (!ticker || ticker.length > 20) throw new Error('Use a ticker of 1 to 20 letters.');
      const qty = Math.floor(Number(data.quantity));
      if (qty <= 0 || qty > 100000000) throw new Error('Quantity must be a positive whole number, at most 100 million.');
      const side = (data.side || 'buy').toLowerCase();
      if (!['buy', 'sell'].includes(side)) throw new Error('Choose buy or sell.');

      const price = Math.round(Number(data.price) * 100);
      const fee = Math.round(Number(data.fee || 0) * 100);
      const notional = price * qty;

      const guard = a.guard;
      if (guard) {
        if (guard.paused) throw new Error('Paper execution is paused for this account. Review the scenario controls before resuming.');
        if (guard.enabled) {
          if (guard.quoteAge > guard.maxAge) throw new Error('Risk gate: assumed quote age exceeds the configured limit.');
          const depth = guard.depth * (1 - guard.duplicate / 100) * (1 - guard.withdrawal / 100);
          if (notional / 100 > depth) throw new Error('Risk gate: order exceeds assumed stressed executable depth.');
          if (guard.cancelRate > guard.maxCancelRate) throw new Error('Risk gate: assumed cancellation rate exceeds its limit.');
          if (side === 'buy') {
            const currentExp = Object.values(a.holdings || {}).reduce((s, x) => s + x.quantity * x.mark, 0) + notional;
            if (currentExp / 100 > guard.inventoryLimit) throw new Error('Risk gate: account inventory limit would be exceeded.');
            const loss = (currentExp / 100) * (guard.shockPct / 100);
            if (loss > guard.lossBudget) throw new Error('Risk gate: correlated price-shock loss exceeds the scenario budget.');
          }
        }
      }

      const equity = a.cash + Object.values(a.holdings || {}).reduce((s, x) => s + x.quantity * x.mark, 0);
      if (notional > (equity * a.limitPct) / 100) {
        throw new Error('Order exceeds the configured ' + a.limitPct + '% of marked account equity. Reduce its size.');
      }

      const h = a.holdings[ticker] || { quantity: 0, cost: 0, mark: price, sector: (data.sector || 'Unclassified').trim() };

      if (side === 'buy') {
        if (notional + fee > a.cash) throw new Error('Insufficient paper cash including fees.');
        a.cash -= (notional + fee);
        h.cost += (notional + fee);
        h.quantity += qty;
      } else {
        if (qty > h.quantity) throw new Error('Insufficient holdings. Short selling is not supported.');
        if (a.cash + notional - fee < 0) throw new Error('Insufficient cash to pay the fee.');
        const removed = qty === h.quantity ? h.cost : Math.round((h.cost * qty) / h.quantity);
        a.realized += (notional - fee - removed);
        a.cash += (notional - fee);
        h.cost -= removed;
        h.quantity -= qty;
      }

      h.mark = price;
      h.asOf = new Date().toISOString();
      a.fees += fee;

      if (h.quantity > 0) a.holdings[ticker] = h;
      else delete a.holdings[ticker];

      a.trades.push({
        id: 't_' + Date.now(),
        requestId: key,
        at: new Date().toISOString(),
        ticker: ticker,
        side: side,
        quantity: qty,
        price: price,
        fee: fee,
        notional: notional,
        priceBasis: 'User-entered assumed fill, not live execution'
      });

      saveLocalState();
      return { account: a, message: 'Paper ' + side + ' recorded. Cash and holdings updated.' };
    }

    if (data.action === 'set_guard') {
      const a = account();
      if (!a) throw new Error('Select an existing paper account.');
      const g = data.guard;
      a.guard = {
        enabled: Boolean(g.enabled),
        paused: Boolean(g.paused),
        depth: Number(g.depth) || 1000000,
        duplicate: Number(g.duplicate) || 0,
        withdrawal: Number(g.withdrawal) || 0,
        quoteAge: Number(g.quoteAge) || 2,
        maxAge: Number(g.maxAge) || 60,
        cancelRate: Number(g.cancelRate) || 0,
        maxCancelRate: Number(g.maxCancelRate) || 50,
        inventoryLimit: Number(g.inventoryLimit) || 5000000,
        shockPct: Number(g.shockPct) || 15,
        lossBudget: Number(g.lossBudget) || 500000,
        updatedAt: new Date().toISOString()
      };
      a.controlHistory = a.controlHistory || [];
      a.controlHistory.push({ ...a.guard });
      saveLocalState();
      return { account: a, message: 'Scenario controls saved. They will be checked before each new paper fill.' };
    }

    if (data.action === 'save_portfolio') {
      const saved = {
        id: 'p_' + Date.now(),
        name: (data.name || '').trim() || 'Snapshot ' + new Date().toLocaleTimeString(),
        equity: data.equity,
        positions: data.positions,
        source: data.source || 'Saved portfolio',
        savedAt: new Date().toISOString()
      };
      state.portfolios.unshift(saved);
      saveLocalState();
      return { portfolio: saved, message: 'Portfolio saved on this computer.' };
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
        '<div class="table-wrap"><table><thead><tr><th>Ticker</th><th>Shares</th><th>Assumed mark</th><th>Cost basis</th><th>Unrealized</th><th>Total value</th></tr></thead><tbody>' +
        holdings.map(([t, h]) => {
          const val = h.mark * h.quantity;
          const unrl = val - h.cost;
          return `<tr><td><b>${esc(t)}</b> <span class="sub">(${esc(h.sector || 'Equities')})</span></td><td>${h.quantity.toLocaleString()}</td><td>${usd(h.mark)}</td><td>${usd(h.cost)}</td><td style="color:${unrl >= 0 ? '#3de0b2' : '#ff6b6b'}">${usd(unrl)}</td><td><b>${usd(val)}</b></td></tr>`;
        }).join('') +
        '</tbody></table></div>' : 'No holdings. Execute a paper buy to begin.';
    }

    if ($('paperLedger')) {
      $('paperLedger').innerHTML = a.trades.length ?
        '<div class="table-wrap"><table><thead><tr><th>Time UTC</th><th>Side</th><th>Ticker</th><th>Quantity</th><th>Fill price</th><th>Notional</th><th>Fee</th></tr></thead><tbody>' +
        [...a.trades].reverse().slice(0, 100).map(t => `<tr><td>${esc(t.at.slice(0, 19).replace('T', ' '))}</td><td><span class="badge ${t.side === 'buy' ? 'badge-buy' : 'badge-sell'}" style="text-transform:uppercase; font-weight:bold; color:${t.side === 'buy' ? '#3de0b2' : '#ffbd59'}">${esc(t.side)}</span></td><td><b>${esc(t.ticker)}</b></td><td>${t.quantity.toLocaleString()}</td><td>${usd(t.price)}</td><td>${usd(t.notional || (t.price * t.quantity))}</td><td>${usd(t.fee)}</td></tr>`).join('') +
        '</tbody></table></div><p class="notice">Latest 100 fills shown. Export includes the complete ledger.</p>' : 'No paper orders recorded.';
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
    if (await mutation(f, {
      action: 'create_account',
      name: d.get('accountName'),
      cash: d.get('cash'),
      limitPct: Number(d.get('limitPct'))
    })) {
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
    const a = account();
    if (!a) return;
    pendingKey = pendingKey || crypto.randomUUID();
    if (await mutation(f, {
      action: 'order',
      accountId: a.id,
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
    const entries = Object.entries(a.holdings || {});
    if (!entries.length) return;

    positions = entries.map(([ticker, h]) => ({
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

    equity = (a.cash + entries.reduce((s, [, h]) => s + h.quantity * h.mark, 0)) / 100;
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
