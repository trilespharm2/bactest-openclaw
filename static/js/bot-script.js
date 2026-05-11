/* Bot Page Script */

// ── State ──────────────────────────────────────────────────────────
let _botCurrentMode = 'paper';
let _botConfigured  = false;

// New-Position state
let _npQty          = 1;
let _npPrice        = 0;
let _npLastPrice    = null;   // float, last traded price of underlying
let _npExpirations  = [];     // array of YYYY-MM-DD strings
let _npChain        = [];     // full option chain for current expiration
let _npActiveLegIdx = -1;     // which leg is currently being selected
let _npLegStrikes   = {};     // { legIdx: { strike, optType, bid, ask, delta, theta, symbol } }
let _npSymTimer     = null;

// Strategy definitions: legs ordered as they appear in the UI
// creditType: 'credit' = spread receives premium, 'debit' = spread pays premium, null = single-leg (limit/market)
const NP_STRATEGIES = {
  equity_buy:        { name:'Buy Stock',         type:'equity',  creditType:null,     legs:[] },
  equity_sell:       { name:'Sell Stock',         type:'equity',  creditType:null,     legs:[] },
  long_call:         { name:'Long Call',          type:'option',  creditType:null,     legs:[{label:'CALL',       side:'buy',  opType:'call'}] },
  long_put:          { name:'Long Put',           type:'option',  creditType:null,     legs:[{label:'PUT',        side:'buy',  opType:'put'}] },
  short_call:        { name:'Short Call',         type:'option',  creditType:null,     legs:[{label:'CALL',       side:'sell', opType:'call'}] },
  short_put:         { name:'Short Put',          type:'option',  creditType:null,     legs:[{label:'PUT',        side:'sell', opType:'put'}] },
  short_call_spread: { name:'Short Call Spread',  type:'option',  creditType:'credit', legs:[{label:'LONG CALL',  side:'buy',  opType:'call'},{label:'SHORT CALL',side:'sell', opType:'call'}] },
  long_call_spread:  { name:'Long Call Spread',   type:'option',  creditType:'debit',  legs:[{label:'LONG CALL',  side:'buy',  opType:'call'},{label:'SHORT CALL',side:'sell', opType:'call'}] },
  short_put_spread:  { name:'Short Put Spread',   type:'option',  creditType:'credit', legs:[{label:'LONG PUT',   side:'buy',  opType:'put'}, {label:'SHORT PUT', side:'sell', opType:'put'}] },
  long_put_spread:   { name:'Long Put Spread',    type:'option',  creditType:'debit',  legs:[{label:'LONG PUT',   side:'buy',  opType:'put'}, {label:'SHORT PUT', side:'sell', opType:'put'}] },
  iron_condor:       { name:'Iron Condor',        type:'option',  creditType:'credit', legs:[{label:'LONG PUT',   side:'buy',  opType:'put'}, {label:'SHORT PUT', side:'sell', opType:'put'},{label:'SHORT CALL',side:'sell',opType:'call'},{label:'LONG CALL',side:'buy',opType:'call'}] },
  iron_butterfly:    { name:'Iron Butterfly',     type:'option',  creditType:'credit', legs:[{label:'LONG PUT',   side:'buy',  opType:'put'}, {label:'SHORT PUT', side:'sell', opType:'put'},{label:'SHORT CALL',side:'sell',opType:'call'},{label:'LONG CALL',side:'buy',opType:'call'}] },
};

// ── Init ───────────────────────────────────────────────────────────
function initBotPage() {
  botLoadConfig();
}

// ── Config Load / Save ─────────────────────────────────────────────
async function botLoadConfig() {
  try {
    const resp = await fetch('/api/bot/config');
    if (resp.status === 401) return;
    const data = await resp.json();
    if (data.configured) {
      _botConfigured = true;
      _botCurrentMode = data.mode || 'paper';
      botPopulateForm(data);
      botShowView('dashboard');
      botLoadAll();
    } else {
      botShowView('config');
    }
  } catch (e) { botShowView('config'); }
}

function botPopulateForm(data) {
  _safeSet('botBrokerage',          data.brokerage || 'tradier');
  _safeSet('botPaperAccountId',     data.paper_account_id || '');
  _safeSet('botPaperApiKey',        data.paper_api_key || '');
  _safeSet('botPaperLiveAccountId', data.paper_live_account_id || '');
  _safeSet('botPaperLiveApiKey',    data.paper_live_api_key || '');
  _safeSet('botLiveAccountId',      data.live_account_id || '');
  _safeSet('botLiveApiKey',         data.live_api_key || '');
  botSetMode(_botCurrentMode, false);
}

function _safeSet(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

async function botSaveConfig() {
  const btn = document.getElementById('botSaveBtn');
  const msg = document.getElementById('botConfigMsg');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Saving…';
  msg.style.display = 'none';
  const body = {
    brokerage:             document.getElementById('botBrokerage')?.value || 'tradier',
    mode:                  _botCurrentMode,
    paper_account_id:      document.getElementById('botPaperAccountId')?.value.trim() || '',
    paper_api_key:         document.getElementById('botPaperApiKey')?.value.trim() || '',
    paper_live_account_id: document.getElementById('botPaperLiveAccountId')?.value.trim() || '',
    paper_live_api_key:    document.getElementById('botPaperLiveApiKey')?.value.trim() || '',
    live_account_id:       document.getElementById('botLiveAccountId')?.value.trim() || '',
    live_api_key:          document.getElementById('botLiveApiKey')?.value.trim() || '',
  };
  try {
    const resp = await fetch('/api/bot/config', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const data = await resp.json();
    if (data.success) {
      _botConfigured = true;
      botShowMsg(msg, 'success', '<i class="fas fa-check-circle me-1"></i>Saved! Connecting…');
      setTimeout(() => { botShowView('dashboard'); botLoadAll(); }, 800);
    } else {
      botShowMsg(msg, 'danger', data.error || 'Save failed');
    }
  } catch (e) { botShowMsg(msg, 'danger', 'Network error: ' + e.message); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save me-2"></i>Save & Connect'; }
}

// ── Test Connection ────────────────────────────────────────────────
async function botTestConnection() {
  const btn = document.getElementById('botTestBtn');
  const res = document.getElementById('botDiagnoseResult');
  if (!res) return;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Testing…';
  res.style.display = 'none';
  try {
    const resp = await fetch('/api/bot/tradier/diagnose');
    const d = await resp.json();
    if (d.error && !d.mode) {
      res.innerHTML = `<div class="alert alert-danger py-2" style="font-size:13px;"><i class="fas fa-times-circle me-1"></i>${d.error}</div>`;
      res.style.display = '';
      return;
    }
    const active = d.mode === 'paper' ? d.paper : d.live;
    const key    = d.mode === 'paper' ? active.api_key    : active.api_key;
    const acct   = d.mode === 'paper' ? active.account_id : active.account_id;
    const probe  = d.probe || {};

    const keyRow  = key.stored
      ? `<tr><td>API Key</td><td style="color:#10b981;"><i class="fas fa-check-circle me-1"></i>Stored (len=${key.stripped_len}, prefix=${key.prefix}…${key.suffix}${key.has_whitespace ? ' <span style="color:#f59e0b;">⚠ had whitespace</span>' : ''})</td></tr>`
      : `<tr><td>API Key</td><td style="color:#ef4444;"><i class="fas fa-times-circle me-1"></i>Not stored</td></tr>`;
    const acctRow = acct.stored
      ? `<tr><td>Account ID</td><td style="color:#10b981;"><i class="fas fa-check-circle me-1"></i>${acct.value}${acct.has_whitespace ? ' <span style="color:#f59e0b;">⚠ had whitespace</span>' : ''}</td></tr>`
      : `<tr><td>Account ID</td><td style="color:#ef4444;"><i class="fas fa-times-circle me-1"></i>Not stored</td></tr>`;

    let probeHtml;
    if (probe.ok) {
      const profile = probe.body?.profile;
      const name = profile ? `${profile.name} (${profile.account?.account_number || ''})` : 'OK';
      probeHtml = `<tr><td>Live Auth Test</td><td style="color:#10b981;"><i class="fas fa-check-circle me-1"></i>${name}</td></tr>`;
    } else {
      const rawDetail = probe.raw
        ? `<br><small style="color:#9098a9;word-break:break-all;">${probe.raw.replace(/</g,'&lt;')}</small>`
        : (probe.error ? `<br><small style="color:#9098a9;">${probe.error}</small>` : '');
      probeHtml = `<tr><td>Live Auth Test</td><td style="color:#ef4444;"><i class="fas fa-times-circle me-1"></i>Failed (HTTP ${probe.http_status || '?'})${rawDetail}</td></tr>`;
    }

    res.innerHTML = `
      <div class="bot-field-group">
        <div class="bot-field-group-title"><i class="fas fa-stethoscope" style="color:#1b55e2;"></i>Connection Diagnostic — mode: <strong>${d.mode}</strong></div>
        <table class="bot-table w-100" style="font-size:12px;">
          <tbody>
            ${keyRow}
            ${acctRow}
            ${probeHtml}
          </tbody>
        </table>
      </div>`;
    res.style.display = '';
  } catch (e) {
    res.innerHTML = `<div class="alert alert-danger py-2" style="font-size:13px;">Network error: ${e.message}</div>`;
    res.style.display = '';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-plug me-2"></i>Test Connection';
  }
}

// ── View Management ────────────────────────────────────────────────
function botShowView(view) {
  const cfg        = document.getElementById('botConfigView');
  const dash       = document.getElementById('botDashboardView');
  const subnav     = document.getElementById('botSubnav');
  const settBtn    = document.getElementById('botSettingsToggleBtn');
  const cancelBtn  = document.getElementById('botCancelBtn');
  const modeBadge  = document.getElementById('botModeBadge');
  if (view === 'dashboard') {
    cfg.style.display  = 'none';
    dash.style.display = 'block';
    subnav.style.display = 'flex';
    if (settBtn)   settBtn.style.display  = 'inline-flex';
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (modeBadge) {
      modeBadge.style.display = 'inline-block';
      modeBadge.className = _botCurrentMode === 'live' ? 'bot-mode-badge-live' : 'bot-mode-badge-paper';
      modeBadge.innerHTML = _botCurrentMode === 'live'
        ? '<i class="fas fa-bolt me-1"></i>Live'
        : '<i class="fas fa-flask me-1"></i>Paper';
    }
    botHighlightSubnav('dashboard');
  } else {
    cfg.style.display  = 'block';
    dash.style.display = 'none';
    subnav.style.display = _botConfigured ? 'flex' : 'none';
    if (settBtn)   settBtn.style.display  = 'none';
    if (cancelBtn) cancelBtn.style.display = _botConfigured ? 'inline-block' : 'none';
    if (modeBadge) modeBadge.style.display = 'none';
    botHighlightSubnav('config');
  }
}

function botSwitchView(view) { botHighlightSubnav(view); botShowView(view); }

function botHighlightSubnav(active) {
  const views = ['dashboard','config'];
  document.querySelectorAll('#botSubnav .bot-subnav-btn').forEach((btn, i) => {
    btn.classList.toggle('active', views[i] === active);
  });
}

function botSetMode(mode, updateUI = true) {
  _botCurrentMode = mode;
  const paperBtn = document.getElementById('botModePaperBtn');
  const liveBtn  = document.getElementById('botModeLiveBtn');
  const paperFld = document.getElementById('botPaperFields');
  const liveFld  = document.getElementById('botLiveFields');
  if (!paperBtn) return;
  paperBtn.classList.toggle('active',      mode === 'paper');
  liveBtn.classList.toggle('active',       mode === 'live');
  liveBtn.classList.toggle('live-active',  mode === 'live');
  if (paperFld) paperFld.style.display = mode === 'paper' ? 'block' : 'none';
  if (liveFld)  liveFld.style.display  = mode === 'live'  ? 'block' : 'none';
}

// ── Utilities ──────────────────────────────────────────────────────
function botToggleKey(inputId, btn) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.type = el.type === 'password' ? 'text' : 'password';
  if (btn) btn.innerHTML = el.type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
}

function botShowMsg(el, type, html) {
  el.style.display = 'block';
  el.innerHTML = `<div class="alert alert-${type} py-2 mb-0" style="font-size:13px;">${html}</div>`;
}

function _fmt$(n, dec = 2) {
  if (n == null || n === '') return '—';
  const v = parseFloat(n);
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function _fmtN(n, dec = 2) {
  if (n == null || n === '') return '—';
  return parseFloat(n).toFixed(dec);
}
function _fmtK(n) {
  if (n == null) return '—';
  const v = parseFloat(n);
  return v >= 1000 ? (v/1000).toFixed(1) + 'K' : String(v);
}

// ── Load All Dashboard Data ────────────────────────────────────────
function botLoadAll() { botLoadBalances(); botLoadPositions(); botLoadOrders(); }

// ── Account Balance ────────────────────────────────────────────────
async function botLoadBalances() {
  const body = document.getElementById('botBalanceBody');
  if (!body) return;
  body.innerHTML = '<div class="bot-empty"><i class="fas fa-spinner fa-spin"></i> Loading…</div>';
  try {
    const resp = await fetch('/api/bot/tradier/balances');
    const data = await resp.json();
    const bal  = data?.balances;
    if (!bal) {
      const detail = data.detail ? `<br><small style="color:#9098a9;word-break:break-all;">${data.detail}</small>` : '';
      body.innerHTML = `<div class="bot-empty"><i class="fas fa-exclamation-circle" style="color:#ef4444;"></i><div class="mt-2">${data.error || 'Could not load balances'}${detail}</div><div class="mt-3"><button class="btn btn-sm btn-outline-primary" onclick="botSwitchView('config')"><i class="fas fa-cog me-1"></i>Check Settings</button></div></div>`;
      return;
    }
    const b = bal.cash || bal.margin || {};
    const rows = [
      { label:'Account',       val: (bal.account_number || '—') + (bal.account_type ? ` (${bal.account_type})` : '') },
      { label:'Total Equity',  val: _fmt$(bal.total_equity) },
      { label:'Cash',          val: _fmt$(bal.total_cash) },
      { label:'Option BP',     val: _fmt$(b.option_buying_power  ?? bal.option_buying_power) },
      { label:'Stock BP',      val: _fmt$(b.stock_buying_power   ?? bal.stock_buying_power) },
      { label:'Open P&L',      val: _fmt$(bal.open_pl) },
      { label:'Close P&L',     val: _fmt$(bal.close_pl) },
    ].filter(r => r.val !== '—');
    body.innerHTML = `<div class="bot-stat-grid">${rows.map(r => `<div class="bot-stat-item"><div class="bot-stat-label">${r.label}</div><div class="bot-stat-value" style="font-size:14px;">${r.val}</div></div>`).join('')}</div>`;
  } catch (e) { body.innerHTML = `<div class="bot-empty"><i class="fas fa-times-circle" style="color:#ef4444;"></i><div class="mt-2">${e.message}</div></div>`; }
}

// ── Open Positions ─────────────────────────────────────────────────
async function botLoadPositions() {
  const body = document.getElementById('botPositionsBody');
  if (!body) return;
  body.innerHTML = '<div class="bot-empty py-4"><i class="fas fa-spinner fa-spin"></i> Loading…</div>';
  try {
    const resp = await fetch('/api/bot/tradier/positions');
    const data = await resp.json();
    const raw  = data?.positions?.position;
    if (!raw) {
      if (data.error) {
        const detail = data.detail ? `<br><small style="color:#9098a9;word-break:break-all;">${data.detail}</small>` : '';
        body.innerHTML = `<div class="bot-empty py-4"><i class="fas fa-exclamation-circle" style="color:#ef4444;"></i><div class="mt-2">${data.error}${detail}</div></div>`;
      } else {
        body.innerHTML = '<div class="bot-empty py-4"><i class="fas fa-inbox"></i><div class="mt-2">No open positions</div></div>';
      }
      return;
    }
    const positions = Array.isArray(raw) ? raw : [raw];
    body.innerHTML = `<div style="overflow-x:auto;"><table class="bot-table"><thead><tr><th>Symbol</th><th>Qty</th><th>Cost Basis</th><th>Date Acquired</th></tr></thead><tbody>${positions.map(p => `<tr><td><strong>${p.symbol}</strong></td><td>${p.quantity}</td><td>${_fmt$(p.cost_basis)}</td><td>${p.date_acquired ? p.date_acquired.split('T')[0] : '—'}</td></tr>`).join('')}</tbody></table></div>`;
  } catch (e) { body.innerHTML = `<div class="bot-empty py-4"><i class="fas fa-times-circle" style="color:#ef4444;"></i><div class="mt-2">${e.message}</div></div>`; }
}

// ── Open Orders ────────────────────────────────────────────────────
async function botLoadOrders() {
  const body = document.getElementById('botOrdersBody');
  if (!body) return;
  body.innerHTML = '<div class="bot-empty py-4"><i class="fas fa-spinner fa-spin"></i> Loading…</div>';
  try {
    const resp = await fetch('/api/bot/tradier/orders');
    const data = await resp.json();
    const raw  = data?.orders?.order;
    if (!raw) {
      if (data.error) {
        const detail = data.detail ? `<br><small style="color:#9098a9;word-break:break-all;">${data.detail}</small>` : '';
        body.innerHTML = `<div class="bot-empty py-4"><i class="fas fa-exclamation-circle" style="color:#ef4444;"></i><div class="mt-2">${data.error}${detail}</div></div>`;
      } else {
        body.innerHTML = '<div class="bot-empty py-4"><i class="fas fa-inbox"></i><div class="mt-2">No open orders</div></div>';
      }
      return;
    }
    const orders = Array.isArray(raw) ? raw : [raw];
    const sBadge  = s => { const m={open:'badge-open',filled:'badge-filled',canceled:'badge-canceled',pending:'badge-pending'}; return `<span class="badge-side ${m[s]||'badge-pending'}">${s}</span>`; };
    const sdBadge = s => { const buy=['buy','buy_to_open','buy_to_close'].includes(s); return `<span class="badge-side ${buy?'badge-buy':'badge-sell'}">${s.replace(/_/g,' ')}</span>`; };
    const canCancel = s => ['open','pending','partially_filled'].includes(s);
    body.innerHTML = `<div style="overflow-x:auto;"><table class="bot-table"><thead><tr><th>ID</th><th>Symbol</th><th>Side</th><th>Qty</th><th>Type</th><th>Price</th><th>Status</th><th>Date</th><th></th></tr></thead><tbody>${orders.map(o => `<tr><td style="color:#9098a9;font-size:11px;">${o.id}</td><td><strong>${o.symbol}</strong></td><td>${sdBadge(o.side)}</td><td>${o.quantity}</td><td style="text-transform:capitalize;">${(o.type||'').replace(/_/g,' ')}</td><td>${o.price ? _fmt$(o.price) : (o.stop_price ? 'Stop '+_fmt$(o.stop_price) : 'Mkt')}</td><td>${sBadge(o.status)}</td><td style="font-size:11px;">${o.create_date ? o.create_date.split('T')[0] : '—'}</td><td>${canCancel(o.status) ? `<button class="btn btn-outline-danger btn-sm py-0 px-2" style="font-size:11px;" onclick="botCancelOrder(${o.id},this)"><i class="fas fa-times me-1"></i>Cancel</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  } catch (e) { body.innerHTML = `<div class="bot-empty py-4"><i class="fas fa-times-circle" style="color:#ef4444;"></i><div class="mt-2">${e.message}</div></div>`; }
}

// ══════════════════════════════════════════════════════════════════
//   NEW POSITION — OptionalAlpha-style
// ══════════════════════════════════════════════════════════════════

function npOnSymbolType(input) {
  input.value = input.value.toUpperCase();
  clearTimeout(_npSymTimer);
  _npSymTimer = setTimeout(() => npFetchQuote(input.value.trim()), 700);
}

async function npFetchQuote(sym) {
  if (!sym) return;
  try {
    const resp = await fetch(`/api/bot/tradier/quote?symbol=${encodeURIComponent(sym)}`);
    const data = await resp.json();
    const q = data?.quotes?.quote;
    if (q && q.last) {
      _npLastPrice = parseFloat(q.last);
      const badge = document.getElementById('npLivePriceBadge');
      if (badge) { badge.style.display = 'inline-block'; badge.textContent = `${sym} $${_npLastPrice.toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2})}`; }
      // auto-reload chain if expiration already selected
      const exp = document.getElementById('npExp')?.value;
      if (exp && _npChain.length) npRenderChain();
    }
  } catch (_) {}
}

// Update the Order Type dropdown options based on the strategy's credit/debit classification
function npUpdateOrderTypeOpts(stratKey) {
  const sel = document.getElementById('npOrderType');
  if (!sel) return;
  const strat = NP_STRATEGIES[stratKey];
  if (!strat || strat.type === 'equity') return;
  const ct = strat.creditType;
  if (ct === 'credit') {
    sel.innerHTML = '<option value="credit">Credit</option><option value="market">Market</option>';
    sel.value = 'credit';
  } else if (ct === 'debit') {
    sel.innerHTML = '<option value="debit">Debit</option><option value="market">Market</option>';
    sel.value = 'debit';
  } else {
    sel.innerHTML = '<option value="limit">Limit</option><option value="market">Market</option>';
    sel.value = 'limit';
  }
}

function npOnStrategyChange() {
  const key  = document.getElementById('npStrat')?.value;
  const strat = NP_STRATEGIES[key];
  // reset legs
  _npLegStrikes = {};
  _npActiveLegIdx = -1;
  _npChain = [];
  npHideChain();
  npHideSummary();

  if (!strat) {
    _show('npExpGroup', false); _show('npLegsDivider', false);
    _show('npLegsRow', false); _show('npOrderDivider', false);
    _show('npOrderDetails', false); _show('npEquityDetails', false);
    _show('npPlaceRow', false); return;
  }
  if (strat.type === 'equity') {
    _show('npExpGroup', false); _show('npLegsDivider', false); _show('npLegsRow', false);
    _show('npOrderDivider', true); _show('npEquityDetails', true); _show('npOrderDetails', false);
    _show('npPlaceRow', true);
    npRefreshEqQty();
  } else {
    _show('npExpGroup', true); _show('npLegsDivider', true);
    _show('npLegsRow', true); _show('npEquityDetails', false);
    _show('npOrderDivider', false); _show('npOrderDetails', false); _show('npPlaceRow', false);
    npRenderLegs(key);
    npUpdateOrderTypeOpts(key);
    // auto-load expirations if symbol present
    const sym = document.getElementById('npSym')?.value.trim();
    if (sym && _npExpirations.length === 0) npLoadExpirations();
  }
}

function npRenderLegs(stratKey) {
  const strat = NP_STRATEGIES[stratKey];
  const row = document.getElementById('npLegsRow');
  if (!row || !strat) return;
  row.innerHTML = strat.legs.map((leg, i) => `
    <div class="np-leg-group">
      <div class="np-field-label">${leg.label}</div>
      <div class="np-leg-select-btn" id="npLegBtn${i}" onclick="npLegClick(${i})">
        <div class="np-leg-select-inner" id="npLegInner${i}">
          <span class="np-sel-placeholder">Select</span>
        </div>
        <div class="np-leg-arrow">&#9660;</div>
      </div>
    </div>`).join('');
}

function npLegClick(idx) {
  const key = document.getElementById('npStrat')?.value;
  const strat = NP_STRATEGIES[key];
  if (!strat) return;
  const leg = strat.legs[idx];
  // toggle
  if (_npActiveLegIdx === idx) {
    _npActiveLegIdx = -1;
    npHideChain();
    document.getElementById(`npLegBtn${idx}`)?.classList.remove('active-leg');
    return;
  }
  // deactivate previous
  if (_npActiveLegIdx >= 0) document.getElementById(`npLegBtn${_npActiveLegIdx}`)?.classList.remove('active-leg');
  _npActiveLegIdx = idx;
  document.getElementById(`npLegBtn${idx}`)?.classList.add('active-leg');
  // load / render chain
  const exp = document.getElementById('npExp')?.value;
  if (!exp) { alert('Select an expiration date first.'); return; }
  if (_npChain.length) {
    npRenderChain();
  } else {
    npLoadAndRenderChain();
  }
}

async function npLoadExpirations() {
  const sym = document.getElementById('npSym')?.value.trim().toUpperCase();
  if (!sym) { alert('Enter a symbol first.'); return; }
  const sel = document.getElementById('npExp');
  sel.innerHTML = '<option>Loading…</option>';
  try {
    const resp = await fetch(`/api/bot/tradier/options/expirations?symbol=${encodeURIComponent(sym)}`);
    const data = await resp.json();
    const dates = data?.expirations?.date || [];
    _npExpirations = Array.isArray(dates) ? dates : [dates];
    if (!_npExpirations.length) { sel.innerHTML = '<option>No expirations</option>'; return; }
    sel.innerHTML = _npExpirations.map(d => `<option value="${d}">${_fmtExpDate(d)}</option>`).join('');
    _npChain = [];
  } catch (e) { sel.innerHTML = '<option>Error</option>'; }
}

function _fmtExpDate(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

function npStepExp(dir) {
  const sel = document.getElementById('npExp');
  if (!sel || !_npExpirations.length) return;
  const cur = sel.value;
  let idx = _npExpirations.indexOf(cur);
  idx = Math.max(0, Math.min(_npExpirations.length - 1, idx + dir));
  sel.value = _npExpirations[idx];
  npOnExpChange();
}

function npOnExpChange() {
  _npChain = [];
  _npLegStrikes = {};
  _npActiveLegIdx = -1;
  npHideChain();
  npHideSummary();
  npRenderLegs(document.getElementById('npStrat')?.value || '');
}

async function npLoadAndRenderChain() {
  const sym = document.getElementById('npSym')?.value.trim().toUpperCase();
  const exp = document.getElementById('npExp')?.value;
  if (!sym || !exp) return;
  npShowChainLoading();
  try {
    const resp = await fetch(`/api/bot/tradier/options/chains?symbol=${encodeURIComponent(sym)}&expiration=${encodeURIComponent(exp)}`);
    const data = await resp.json();
    const opts = data?.options?.option || [];
    _npChain = Array.isArray(opts) ? opts : (opts ? [opts] : []);
    npRenderChain();
  } catch (e) { npShowChainError(e.message); }
}

function npRenderChain() {
  const key = document.getElementById('npStrat')?.value;
  const strat = NP_STRATEGIES[key];
  if (!strat || _npActiveLegIdx < 0) return;
  const leg = strat.legs[_npActiveLegIdx];
  const opType = leg.opType;   // 'call' or 'put'

  // Filter to relevant option type, sort by strike ascending
  let rows = _npChain.filter(o => o.option_type === opType).sort((a,b) => a.strike - b.strike);
  if (!rows.length) { npShowChainError('No ' + opType + ' options available.'); return; }

  const last = _npLastPrice;
  // Calculate OTM%
  rows = rows.map(o => {
    const s = parseFloat(o.strike);
    const otm = last ? (opType === 'call' ? (s - last)/last*100 : (last - s)/last*100) : null;
    return { ...o, _strike: s, _otm: otm };
  });

  // Find ATM index (strike closest to last price)
  let atmIdx = 0;
  if (last) {
    let minDiff = Infinity;
    rows.forEach((r, i) => { const d = Math.abs(r._strike - last); if (d < minDiff) { minDiff = d; atmIdx = i; } });
  }

  const curSelected = _npLegStrikes[_npActiveLegIdx]?.strike;

  const tbody = document.getElementById('npChainBody');
  if (!tbody) return;
  tbody.innerHTML = rows.map((r, i) => {
    const isSelected = curSelected != null && r._strike === curSelected;
    const isAtm = i === atmIdx;
    if (i === atmIdx && last) {
      // Insert ATM divider before this row
    }
    return `${i === atmIdx && last ? `<tr class="np-chain-atm-row" style="display:none;" id="npAtmMarker"><td colspan="7"><div class="np-chain-atm-divider"><span>&#9654;</span> Last price: <strong>${last.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></div></td></tr>` : ''}
    <tr class="${isSelected ? 'np-chain-selected' : ''}" onclick="npSelectStrike(${i})" data-idx="${i}">
      <td><strong>${r._strike} ${opType}</strong></td>
      <td>${r.bid != null ? '$'+parseFloat(r.bid).toFixed(2) : '—'}</td>
      <td>${r.ask != null ? '$'+parseFloat(r.ask).toFixed(2) : '—'}</td>
      <td>${r.greeks?.delta != null ? parseFloat(r.greeks.delta).toFixed(2) : '—'}</td>
      <td>${r.greeks?.theta != null ? parseFloat(r.greeks.theta).toFixed(2) : '—'}</td>
      <td>${_fmtK(r.open_interest)}</td>
      <td style="color:${r._otm == null ? '#333' : r._otm <= 0 ? '#10b981' : '#ef4444'};">${r._otm != null ? (r._otm >= 0 ? '+' : '') + r._otm.toFixed(2)+'%' : '—'}</td>
    </tr>`;
  }).join('');

  // Show ATM marker
  const atm = document.getElementById('npAtmMarker');
  if (atm) atm.style.display = '';

  _show('npChainSection', true);
  // Scroll ATM row into view
  setTimeout(() => {
    if (atm) atm.scrollIntoView({ block:'center', behavior:'smooth' });
  }, 80);

  // Store rows in a shared array for indexed access
  window._npChainRows = rows;
}

function npSelectStrike(rowIdx) {
  const rows = window._npChainRows;
  if (!rows || rowIdx >= rows.length) return;
  const r = rows[rowIdx];
  const key = document.getElementById('npStrat')?.value;
  const strat = NP_STRATEGIES[key];
  const leg = strat?.legs[_npActiveLegIdx];
  if (!leg) return;

  _npLegStrikes[_npActiveLegIdx] = {
    strike: r._strike, opType: r.option_type,
    bid: parseFloat(r.bid || 0), ask: parseFloat(r.ask || 0),
    delta: r.greeks?.delta, theta: r.greeks?.theta,
    symbol: r.symbol,
  };

  // Update the leg button to show strike with − / + adjusters
  const inner = document.getElementById(`npLegInner${_npActiveLegIdx}`);
  const btn   = document.getElementById(`npLegBtn${_npActiveLegIdx}`);
  if (inner) {
    inner.innerHTML = `
      <button class="np-leg-adj" onclick="event.stopPropagation();npAdjStrike(${_npActiveLegIdx},-1)">&#8722;</button>
      <div class="np-leg-adj-border"></div>
      <div class="np-leg-adj-strike">${r._strike}</div>
      <div class="np-leg-adj-border"></div>
      <button class="np-leg-adj" onclick="event.stopPropagation();npAdjStrike(${_npActiveLegIdx},1)">+</button>`;
  }
  if (btn) { btn.classList.remove('active-leg'); btn.classList.add('selected'); btn.onclick = null; }

  _npActiveLegIdx = -1;
  npHideChain();

  // Check if all legs are selected
  const allSelected = strat.legs.every((_, i) => _npLegStrikes[i] != null);
  if (allSelected) {
    npShowSummary(key);
    _show('npOrderDivider', true);
    _show('npOrderDetails', true);
    _show('npPlaceRow', true);
    npCalcPrice();
  }
}

function npAdjStrike(legIdx, dir) {
  const rows = window._npChainRows || [];
  const cur  = _npLegStrikes[legIdx]?.strike;
  if (cur == null) return;
  // We need to find the appropriate row based on leg's opType
  const key   = document.getElementById('npStrat')?.value;
  const strat = NP_STRATEGIES[key];
  const leg   = strat?.legs[legIdx];
  if (!leg) return;
  const filtered = _npChain.filter(o => o.option_type === leg.opType).sort((a,b)=>a.strike-b.strike);
  const ci = filtered.findIndex(o => parseFloat(o.strike) === cur);
  const ni = Math.max(0, Math.min(filtered.length - 1, ci + dir));
  if (ni === ci) return;
  const nr = filtered[ni];
  _npLegStrikes[legIdx] = {
    strike: parseFloat(nr.strike), opType: nr.option_type,
    bid: parseFloat(nr.bid || 0), ask: parseFloat(nr.ask || 0),
    delta: nr.greeks?.delta, theta: nr.greeks?.theta, symbol: nr.symbol,
  };
  // Update display
  const inner = document.getElementById(`npLegInner${legIdx}`);
  if (inner) {
    inner.querySelector('.np-leg-adj-strike').textContent = _npLegStrikes[legIdx].strike;
  }
  // Refresh summary
  const allSelected = strat.legs.every((_, i) => _npLegStrikes[i] != null);
  if (allSelected) { npShowSummary(key); npCalcPrice(); }
}

function npShowChainLoading() {
  const tb = document.getElementById('npChainBody');
  if (tb) tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#9098a9;"><i class="fas fa-spinner fa-spin"></i> Loading…</td></tr>';
  _show('npChainSection', true);
}
function npShowChainError(msg) {
  const tb = document.getElementById('npChainBody');
  if (tb) tb.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:#ef4444;">${msg}</td></tr>`;
  _show('npChainSection', true);
}
function npHideChain() { _show('npChainSection', false); }

// ── Chain scroll buttons ───────────────────────────────────────────
function npChainScroll(dir) {
  const el = document.getElementById('npChainScroll');
  if (!el) return;
  el.scrollBy({ top: dir === 'up' ? -200 : 200, behavior: 'smooth' });
}

// ── General payoff-at-price function (works for any strategy) ──────
function npPayoffAt(price, stratKey) {
  const strat = NP_STRATEGIES[stratKey];
  if (!strat) return 0;
  let pnl = 0;
  strat.legs.forEach((leg, i) => {
    const ls = _npLegStrikes[i]; if (!ls) return;
    const mid = (ls.bid + ls.ask) / 2;
    const mult = leg.side === 'buy' ? 1 : -1;
    const intrinsic = leg.opType === 'call'
      ? Math.max(0, price - ls.strike)
      : Math.max(0, ls.strike - price);
    pnl += mult * (intrinsic - mid);
  });
  return parseFloat((pnl * 100).toFixed(2));
}

function npShowSummary(stratKey) {
  const strat = NP_STRATEGIES[stratKey];
  if (!strat) return;
  const legs = strat.legs;
  const nLegs = legs.length;

  // Net credit/debit across all legs
  let creditMid = 0;
  for (let i = 0; i < nLegs; i++) {
    const ls = _npLegStrikes[i]; if (!ls) continue;
    const mid = (ls.bid + ls.ask) / 2;
    if (legs[i].side === 'sell') creditMid += mid;
    else creditMid -= mid;
  }
  _npPrice = Math.abs(parseFloat(creditMid.toFixed(2)));

  // Determine x-range from actual strikes
  const strikes = [];
  for (let i = 0; i < nLegs; i++) { if (_npLegStrikes[i]) strikes.push(_npLegStrikes[i].strike); }
  if (!strikes.length) return;
  const minK = Math.min(...strikes), maxK = Math.max(...strikes);
  const spread = maxK - minK || Math.max(...strikes.map(Math.abs)) * 0.03 || 5;
  const xL = minK - spread * 2, xR = maxK + spread * 2;

  // Sample payoff across the range to find max/min and breakevens
  const N = 600;
  const prices = Array.from({ length: N + 1 }, (_, i) => xL + (xR - xL) * i / N);
  const pnls   = prices.map(p => npPayoffAt(p, stratKey));
  const maxPnl  = Math.max(...pnls);
  const minPnl  = Math.min(...pnls);
  const UNLIMITED = 9500; // treat anything beyond this as "unlimited"

  // Find breakevens (sign changes)
  const breakevens = [];
  for (let i = 0; i < pnls.length - 1; i++) {
    if (pnls[i] * pnls[i + 1] < 0) {
      const t = pnls[i] / (pnls[i] - pnls[i + 1]);
      breakevens.push(prices[i] + t * (prices[i + 1] - prices[i]));
    }
  }

  // DTE
  const exp = document.getElementById('npExp')?.value;
  let dte = '—';
  if (exp) {
    const d = Math.round((new Date(exp + 'T00:00:00') - new Date()) / 86400000);
    dte = d >= 0 ? d + (d === 1 ? ' day' : ' days') : '0 days';
  }

  // Build stats grid
  const credit = creditMid > 0;
  const stats = [
    { label: credit ? 'Credit' : 'Debit', val: _fmt$(Math.abs(creditMid)), cls: credit ? 'green' : 'red' },
    { label: 'Mid Price',    val: _fmt$(Math.abs(creditMid)) },
    { label: 'DTE',          val: dte },
    { label: 'Breakeven',    val: breakevens.length ? breakevens.map(b => b.toFixed(2)).join(' / ') : '—' },
    { label: 'Max Profit',   val: maxPnl >= UNLIMITED ? 'Unlimited' : _fmt$(maxPnl),  cls: 'green' },
    { label: 'Max Loss',     val: minPnl <= -UNLIMITED ? 'Unlimited' : _fmt$(minPnl), cls: 'red' },
  ];
  if (maxPnl > 0 && minPnl < 0 && maxPnl < UNLIMITED && Math.abs(minPnl) < UNLIMITED) {
    const rr = maxPnl / Math.abs(minPnl);
    stats.push({ label: 'Reward / Risk', val: (rr * 100).toFixed(0) + '%', cls: rr >= 1 ? 'green' : 'blue' });
  }

  const grid = document.getElementById('npSummaryGrid');
  if (grid) {
    grid.innerHTML = stats.map(s =>
      `<div class="np-summary-cell"><div class="np-summary-label">${s.label}</div><div class="np-summary-value ${s.cls || ''}">${s.val}</div></div>`
    ).join('');
  }

  npDrawPayoff(stratKey, { xL, xR, strikes, breakevens, maxPnl, minPnl });
  _show('npTradeSummary', true);
}

function npHideSummary() { _show('npTradeSummary', false); }

// ── Interactive Canvas Payoff Diagram ─────────────────────────────
function npDrawPayoff(stratKey, info) {
  const wrap = document.getElementById('npPayoffWrap');
  if (!wrap || !info) { if (wrap) wrap.innerHTML = ''; return; }

  wrap.innerHTML = `
    <div class="np-payoff-wrap" style="position:relative;margin-top:16px;">
      <canvas id="npPayoffCanvas" style="width:100%;height:220px;display:block;cursor:crosshair;border-radius:10px;border:1px solid #eef0f3;"></canvas>
      <div id="npPayoffTip" style="display:none;position:absolute;background:#1a1a2e;color:#fff;font-size:12px;padding:5px 10px;border-radius:6px;pointer-events:none;white-space:nowrap;z-index:10;top:8px;"></div>
    </div>`;

  const canvas = document.getElementById('npPayoffCanvas');
  if (!canvas) return;

  const dpr = window.devicePixelRatio || 1;
  requestAnimationFrame(() => {
    const W = canvas.offsetWidth, H = 220;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const redraw = (mx) => npRenderPayoff(ctx, W, H, stratKey, info, mx);
    redraw(null);

    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      redraw(mx);
      // Tooltip
      const PAD_L = 58;
      const iW = W - PAD_L - 12;
      const tip = document.getElementById('npPayoffTip');
      if (tip && mx >= PAD_L && mx <= PAD_L + iW) {
        const price = info.xL + (mx - PAD_L) / iW * (info.xR - info.xL);
        const pnl = npPayoffAt(price, stratKey);
        const col = pnl >= 0 ? '#10b981' : '#ef4444';
        tip.style.display = 'block';
        tip.style.left = (Math.min(mx + 12, W - 160)) + 'px';
        tip.innerHTML = `<span style="color:#9098a9;">$${price.toFixed(2)}</span>&nbsp;&nbsp;<span style="color:${col};font-weight:700;">${pnl >= 0 ? '+' : ''}${_fmt$(pnl)}</span>`;
      } else if (tip) tip.style.display = 'none';
    });
    canvas.addEventListener('mouseleave', () => {
      redraw(null);
      const tip = document.getElementById('npPayoffTip');
      if (tip) tip.style.display = 'none';
    });
  });
}

function npRenderPayoff(ctx, W, H, stratKey, info, mouseX) {
  const PAD_L = 58, PAD_R = 12, PAD_T = 14, PAD_B = 34;
  const iW = W - PAD_L - PAD_R, iH = H - PAD_T - PAD_B;
  const { xL, xR, strikes, breakevens } = info;

  ctx.clearRect(0, 0, W, H);

  // Sample P&L across x-range
  const N = Math.max(200, Math.floor(iW));
  const xs   = Array.from({ length: N + 1 }, (_, i) => xL + (xR - xL) * i / N);
  const ys   = xs.map(x => npPayoffAt(x, stratKey));
  const yMax = Math.max(...ys, 0);
  const yMin = Math.min(...ys, 0);
  const yRange = yMax - yMin || 1;

  const cx = x => PAD_L + (x - xL) / (xR - xL) * iW;
  const cy = y => PAD_T + (1 - (y - yMin) / yRange) * iH;
  const zero_y = cy(0);

  // Build pixel path
  const pts = xs.map((x, i) => ({ px: cx(x), py: cy(ys[i]) }));

  const tracePath = () => {
    ctx.moveTo(pts[0].px, pts[0].py);
    for (let i = 1; i <= N; i++) ctx.lineTo(pts[i].px, pts[i].py);
  };

  // Green fill (profit zone)
  ctx.save();
  ctx.beginPath();
  ctx.rect(PAD_L, PAD_T, iW, Math.max(0, zero_y - PAD_T));
  ctx.clip();
  ctx.beginPath();
  tracePath();
  ctx.lineTo(pts[N].px, zero_y); ctx.lineTo(pts[0].px, zero_y); ctx.closePath();
  ctx.fillStyle = 'rgba(16,185,129,0.13)';
  ctx.fill();
  ctx.restore();

  // Red fill (loss zone)
  ctx.save();
  ctx.beginPath();
  ctx.rect(PAD_L, zero_y, iW, Math.max(0, H - PAD_B - zero_y));
  ctx.clip();
  ctx.beginPath();
  tracePath();
  ctx.lineTo(pts[N].px, zero_y); ctx.lineTo(pts[0].px, zero_y); ctx.closePath();
  ctx.fillStyle = 'rgba(239,68,68,0.11)';
  ctx.fill();
  ctx.restore();

  // Grid lines + Y-axis labels
  ctx.font = '10px Inter,system-ui,sans-serif';
  ctx.textAlign = 'right';
  const ySteps = 4;
  for (let i = 0; i <= ySteps; i++) {
    const val = yMin + (yMax - yMin) * i / ySteps;
    const y   = cy(val);
    ctx.fillStyle = '#9098a9';
    const label = Math.abs(val) >= 1000
      ? (val >= 0 ? '+' : '') + (val / 1000).toFixed(1) + 'k'
      : (val >= 0 ? '+' : '') + _fmt$(Math.round(val));
    ctx.fillText(label, PAD_L - 6, y + 3.5);
    ctx.beginPath();
    ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y);
    ctx.strokeStyle = i === 0 ? '#dee2e6' : '#f0f1f3';
    ctx.lineWidth = i === 0 ? 1 : 0.5;
    ctx.stroke();
  }

  // Zero line (bold)
  ctx.beginPath();
  ctx.moveTo(PAD_L, zero_y); ctx.lineTo(W - PAD_R, zero_y);
  ctx.strokeStyle = '#c8ccd3';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Breakeven dashed lines + labels
  ctx.setLineDash([4, 3]);
  breakevens.forEach(be => {
    if (be < xL || be > xR) return;
    const bx = cx(be);
    ctx.beginPath();
    ctx.moveTo(bx, PAD_T); ctx.lineTo(bx, H - PAD_B);
    ctx.strokeStyle = '#9098a9';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
  ctx.setLineDash([]);

  // Current price dashed line
  if (_npLastPrice && _npLastPrice >= xL && _npLastPrice <= xR) {
    const cpx = cx(_npLastPrice);
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(cpx, PAD_T); ctx.lineTo(cpx, H - PAD_B);
    ctx.strokeStyle = '#1b55e2';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // X-axis strike labels
  ctx.font = '10px Inter,system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#495057';
  // Combine strikes + breakevens for x-axis labels
  const xLabels = [...new Set([...strikes, ...breakevens.map(b => parseFloat(b.toFixed(0)))])].sort((a,b) => a-b);
  xLabels.forEach(k => {
    if (k < xL || k > xR) return;
    const kx = cx(k);
    ctx.fillStyle = strikes.includes(k) ? '#1a1a2e' : '#9098a9';
    ctx.fillText(k.toFixed(0), kx, H - PAD_B + 14);
    ctx.beginPath();
    ctx.moveTo(kx, H - PAD_B); ctx.lineTo(kx, H - PAD_B + 4);
    ctx.strokeStyle = '#dee2e6';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // Main payoff line
  ctx.beginPath();
  tracePath();
  ctx.strokeStyle = '#1b55e2';
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Hover crosshair
  if (mouseX !== null && mouseX >= PAD_L && mouseX <= PAD_L + iW) {
    const price = xL + (mouseX - PAD_L) / iW * (xR - xL);
    const pnl   = npPayoffAt(price, stratKey);
    const my    = cy(pnl);

    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(mouseX, PAD_T); ctx.lineTo(mouseX, H - PAD_B);
    ctx.strokeStyle = '#6c757d';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    // Dot on payoff line
    const dotCol = pnl >= 0 ? '#10b981' : '#ef4444';
    ctx.beginPath();
    ctx.arc(mouseX, my, 5, 0, Math.PI * 2);
    ctx.fillStyle = dotCol;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(mouseX, my, 5, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

// ── Order quantity / price steppers ────────────────────────────────
function npAdjQty(delta) {
  _npQty = Math.max(1, _npQty + delta);
  const v1 = document.getElementById('npQtyVal');
  const v2 = document.getElementById('npEqQtyVal');
  const unit = document.getElementById('npStrat')?.value?.startsWith('equity') ? 'share' : 'contract';
  if (v1) v1.textContent = `${_npQty} ${unit}${_npQty > 1 ? 's' : ''}`;
  if (v2) v2.textContent = `${_npQty} ${unit}${_npQty > 1 ? 's' : ''}`;
}

function npAdjPrice(delta) {
  _npPrice = Math.max(0, parseFloat((_npPrice + delta).toFixed(2)));
  const el = document.getElementById('npPriceVal');
  if (el) el.textContent = '$' + _npPrice.toFixed(2);
}

function npCalcPrice() {
  const key = document.getElementById('npStrat')?.value;
  const strat = NP_STRATEGIES[key];
  if (!strat) return;
  let mid = 0;
  strat.legs.forEach((l, i) => {
    const ls = _npLegStrikes[i]; if (!ls) return;
    const m = (ls.bid + ls.ask) / 2;
    mid += l.side === 'sell' ? m : -m;
  });
  _npPrice = Math.abs(parseFloat(mid.toFixed(2)));
  const el = document.getElementById('npPriceVal');
  if (el) el.textContent = '$' + _npPrice.toFixed(2);
}

function npRefreshEqQty() {
  const v = document.getElementById('npEqQtyVal');
  if (v) v.textContent = `${_npQty} share${_npQty > 1 ? 's' : ''}`;
}

function npToggleEqPrice() {
  const type = document.getElementById('npEqOrderType')?.value;
  _show('npEqPriceField', type !== 'market');
}

// ── Place Trade ────────────────────────────────────────────────────
async function npPlaceTrade() {
  const key   = document.getElementById('npStrat')?.value;
  const strat = NP_STRATEGIES[key];
  const sym   = document.getElementById('npSym')?.value.trim().toUpperCase();
  const msg   = document.getElementById('npMsg');
  if (!sym || !strat) { msg.innerHTML='<span style="color:#ef4444;">Symbol and strategy required.</span>'; return; }

  const btn = document.getElementById('npPlaceBtn');
  btn.disabled = true; btn.textContent = 'Placing…';

  let body = {};

  if (strat.type === 'equity') {
    const side     = key === 'equity_buy' ? 'buy' : 'sell';
    const qty      = _npQty;
    const otype    = document.getElementById('npEqOrderType')?.value || 'market';
    const price    = document.getElementById('npEqPrice')?.value || '';
    body = { class:'equity', symbol: sym, side, quantity: qty, type: otype, duration:'day' };
    if (otype !== 'market' && price) body.price = price;
  } else {
    // Option order (single-leg class=option, multi-leg class=multileg)
    const legs = strat.legs;
    const rawOrderType = document.getElementById('npOrderType')?.value || 'limit';
    const isMulti = legs.length > 1;
    // Tradier multileg accepts: credit / debit / market / even  (NOT limit)
    // Tradier single-leg accepts: limit / market / stop / stop_limit
    const orderType = isMulti
      ? rawOrderType                                                           // credit/debit/market pass through
      : (rawOrderType === 'credit' || rawOrderType === 'debit') ? 'limit' : rawOrderType; // remap for single-leg
    body = {
      class:    isMulti ? 'multileg' : 'option',
      symbol:   sym,
      type:     orderType,
      duration: 'day',
    };
    // Include price only when not a market order
    if (orderType !== 'market') body.price = _npPrice;
    if (!isMulti) {
      // Single-leg: flat params
      const ls = _npLegStrikes[0];
      body.option_symbol = ls.symbol;
      body.side          = legs[0].side === 'buy' ? 'buy_to_open' : 'sell_to_open';
      body.quantity      = _npQty;
    } else {
      // Multileg: Tradier expects option_symbol[N], side[N], quantity[N]
      legs.forEach((l, i) => {
        const ls = _npLegStrikes[i]; if (!ls) return;
        body[`option_symbol[${i}]`] = ls.symbol;
        body[`side[${i}]`]          = l.side === 'buy' ? 'buy_to_open' : 'sell_to_open';
        body[`quantity[${i}]`]      = _npQty;
      });
    }
  }

  try {
    const resp = await fetch('/api/bot/tradier/orders', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const data = await resp.json();
    const orderId = data?.order?.id;
    if (orderId) {
      msg.innerHTML = `<span style="color:#10b981;"><i class="fas fa-check-circle me-1"></i>Order #${orderId} placed successfully.</span>`;
      setTimeout(() => botLoadOrders(), 1500);
    } else {
      const err = data?.errors?.error || data.error || JSON.stringify(data);
      msg.innerHTML = `<span style="color:#ef4444;"><i class="fas fa-times-circle me-1"></i>${Array.isArray(err) ? err.join(', ') : err}</span>`;
    }
  } catch (e) { msg.innerHTML = `<span style="color:#ef4444;">Error: ${e.message}</span>`; }
  finally { btn.disabled = false; btn.textContent = 'Place Trade'; }
}

// ── Cancel Order ───────────────────────────────────────────────────
async function botCancelOrder(orderId, btn) {
  if (!confirm(`Cancel order #${orderId}?`)) return;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  try {
    const resp = await fetch(`/api/bot/tradier/orders/${orderId}`, { method: 'DELETE' });
    const data = await resp.json();
    if (data.order?.status === 'ok' || resp.ok) {
      btn.closest('tr').querySelectorAll('td')[6].innerHTML =
        '<span class="badge-side badge-canceled">canceled</span>';
      btn.remove();
    } else {
      const err = data?.errors?.error || data.error || 'Cancel failed';
      alert(Array.isArray(err) ? err.join(', ') : err);
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-times me-1"></i>Cancel';
    }
  } catch (e) {
    alert('Network error: ' + e.message);
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-times me-1"></i>Cancel';
  }
}

// ── Helpers ────────────────────────────────────────────────────────
function _show(id, visible) {
  const el = document.getElementById(id);
  if (el) el.style.display = visible ? '' : 'none';
}
