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
function botLoadAll() { botLoadBalances(); botLoadPositions(); botLoadOrders(); strategiesRender(); }

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

// ══════════════════════════════════════════════════════════════════
// STRATEGY BUILDER
// ══════════════════════════════════════════════════════════════════

const SB_ACTIONS = [
  { type:'time',           icon:'fa-clock',        bg:'#f0fdf4', color:'#10b981', label:'Time',           desc:'Trigger based on time of day.' },
  { type:'metric',         icon:'fa-chart-line',   bg:'#fff8e7', color:'#f59e0b', label:'Metric',         desc:'Condition based on a market metric.' },
  { type:'open_position',  icon:'fa-plus-square',  bg:'#eff6ff', color:'#1b55e2', label:'Open Position',  desc:'Place a trade to open a new position.' },
  { type:'close_position', icon:'fa-minus-square', bg:'#fef2f2', color:'#ef4444', label:'Close Position', desc:'Place a trade to close a position.' },
  { type:'notification',   icon:'fa-bell',         bg:'#f5f3ff', color:'#6366f1', label:'Notification',   desc:'Send a notification to yourself.' },
  { type:'tags',           icon:'fa-tag',          bg:'#fdf4ff', color:'#a855f7', label:'Tags',           desc:'Tag your bot and positions.' },
];

// Default config per step type
function sbDefaultConfig(type) {
  if (type === 'time')           return { mode:'exactly', time1:'09:30', time2:'16:00' };
  if (type === 'metric')         return { metric:'price', period:14, operator:'>', value:'', label:'' };
  if (type === 'open_position')  return { symbol:'', strategy:'Short Put Spread', dte:30, spreadWidth:5, takeProfitPct:50, stopLossPct:200, quantity:1, orderType:'credit' };
  if (type === 'close_position') return { target:'all', reason:'manual' };
  if (type === 'notification')   return { message:'Strategy triggered', channel:'email' };
  if (type === 'tags')           return { tag:'' };
  return {};
}

function sbConfigSummary(step) {
  const c = step.config || {};
  if (step.type === 'time') {
    if (c.mode === 'exactly') return `Exactly at ${c.time1||'--:--'}`;
    if (c.mode === 'after')   return `After ${c.time1||'--:--'}`;
    if (c.mode === 'between') return `Between ${c.time1||'--:--'} – ${c.time2||'--:--'}`;
    return 'Set time…';
  }
  if (step.type === 'metric')        return c.label || 'Set metric condition…';
  if (step.type === 'open_position') return `${c.symbol||'?'} · ${c.strategy||'?'} · ${c.dte||30} DTE`;
  if (step.type === 'close_position') return `Close ${c.target||'all'} positions`;
  if (step.type === 'notification')   return c.message || 'Send notification';
  if (step.type === 'tags')           return c.tag ? `Tag: ${c.tag}` : 'Set tag…';
  return '';
}

// ── Builder state ──────────────────────────────────────────────────
let _sbEditId    = null;   // strategy id being edited (null = new)
let _sbSteps     = [];     // array of step objects
let _sbInsertIdx = -1;     // where to insert the next step
let _sbEditStepIdx = -1;   // step index being configured in modal

// ── localStorage helpers ───────────────────────────────────────────
function sbLoad() {
  try { return JSON.parse(localStorage.getItem('botStrategies') || '[]'); } catch { return []; }
}
function sbSave(list) {
  localStorage.setItem('botStrategies', JSON.stringify(list));
}
function sbUUID() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

// ── Open/Close builder ────────────────────────────────────────────
function stratBuilderOpen(stratId) {
  _sbEditId = stratId;
  if (stratId) {
    const list = sbLoad();
    const s = list.find(x => x.id === stratId);
    if (!s) return;
    document.getElementById('sbStratName').value = s.name;
    _sbSteps = JSON.parse(JSON.stringify(s.steps || []));
  } else {
    document.getElementById('sbStratName').value = '';
    _sbSteps = [];
  }
  sbRenderFlow();
  stratCloseDrawer();
  document.getElementById('sbStepModal').style.display = 'none';
  const ov = document.getElementById('stratBuilderOverlay');
  ov.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  sbRenderDrawerItems();
}

function stratBuilderClose() {
  document.getElementById('stratBuilderOverlay').style.display = 'none';
  document.body.style.overflow = '';
}

// ── Save ──────────────────────────────────────────────────────────
function stratBuilderSave() {
  const name = (document.getElementById('sbStratName').value || '').trim() || 'Untitled Strategy';
  const list = sbLoad();
  if (_sbEditId) {
    const idx = list.findIndex(x => x.id === _sbEditId);
    if (idx >= 0) {
      list[idx].name  = name;
      list[idx].steps = _sbSteps;
      list[idx].updatedAt = new Date().toISOString();
    }
  } else {
    list.push({ id: sbUUID(), name, status:'off', steps: _sbSteps, createdAt: new Date().toISOString() });
  }
  sbSave(list);
  stratBuilderClose();
  strategiesRender();
}

// ── Run Test (stub) ────────────────────────────────────────────────
function stratRunTest() {
  alert('Run Test: simulates the strategy against recent market data. (Coming soon)');
}


// ── Flow rendering ─────────────────────────────────────────────────
function sbRenderFlow() {
  const flow = document.getElementById('sbFlow');
  if (!flow) return;
  let html = '';

  html += sbAddBtnHTML(0);

  _sbSteps.forEach((step, idx) => {
    const meta = SB_ACTIONS.find(m => m.type === step.type) || {};
    const summary = sbConfigSummary(step);

    html += `
      <div class="sb-connector"><div class="sb-connector-line"></div></div>
      <div class="sb-step-card" onclick="stratEditStep(${idx})">
        <div class="sb-step-icon" style="background:${meta.bg||'#f1f3f7'};color:${meta.color||'#6c757d'}">
          <i class="fas ${meta.icon||'fa-circle'}"></i>
        </div>
        <div class="sb-step-info">
          <div class="sb-step-type">${meta.label||step.type}</div>
          <div class="sb-step-desc">${summary}</div>
        </div>
        <button class="sb-step-del" onclick="event.stopPropagation();sbRemoveStep(${idx})" title="Remove step">
          <i class="fas fa-times"></i>
        </button>
      </div>`;

    html += sbAddBtnHTML(idx + 1);
  });

  flow.innerHTML = html;
}

function sbAddBtnHTML(insertIdx, branch) {
  const extra = branch ? ` data-branch="${branch}"` : '';
  return `<div class="sb-connector"><div class="sb-connector-line"></div></div>
    <button class="sb-add-btn" onclick="stratOpenDrawer(${insertIdx})"${extra} title="Add step">+</button>`;
}

// ── Drawer ─────────────────────────────────────────────────────────
function sbRenderDrawerItems() {
  const actionEl = document.getElementById('sbActionsList');
  if (!actionEl) return;
  actionEl.innerHTML = SB_ACTIONS.map(m => sbDrawerItemHTML(m)).join('');
}

function sbDrawerItemHTML(m) {
  return `<div class="sb-drawer-item" onclick="sbAddStep('${m.type}')">
    <div class="sb-drawer-item-icon" style="background:${m.bg};color:${m.color}"><i class="fas ${m.icon}"></i></div>
    <div class="sb-drawer-item-info">
      <div class="sb-drawer-item-name">${m.label}</div>
      <div class="sb-drawer-item-desc">${m.desc}</div>
    </div>
    <i class="fas fa-chevron-right sb-drawer-item-arrow"></i>
  </div>`;
}

function stratOpenDrawer(insertIdx) {
  _sbInsertIdx = insertIdx;
  document.getElementById('sbDrawer').style.display = 'flex';
  document.getElementById('sbDrawer').style.flexDirection = 'column';
}

function stratCloseDrawer() {
  const d = document.getElementById('sbDrawer');
  if (d) d.style.display = 'none';
  _sbInsertIdx = -1;
}

// ── Add step ───────────────────────────────────────────────────────
function sbAddStep(type) {
  const step = { id: sbUUID(), type, config: sbDefaultConfig(type) };
  const idx  = _sbInsertIdx >= 0 ? _sbInsertIdx : _sbSteps.length;
  _sbSteps.splice(idx, 0, step);
  stratCloseDrawer();
  sbRenderFlow();
  // Count opportunities/warnings
  sbUpdateCounts();
  // Auto-open config modal for all step types
  stratEditStep(idx);
}

function sbRemoveStep(idx) {
  _sbSteps.splice(idx, 1);
  sbRenderFlow();
  sbUpdateCounts();
}

function sbUpdateCounts() {
  // placeholder — counts panel removed; called for compatibility
}

// ── Step config modal ──────────────────────────────────────────────
function stratEditStep(idx) {
  const step = _sbSteps[idx];
  if (!step) return;
  _sbEditStepIdx = idx;
  const meta = SB_ACTIONS.find(m => m.type === step.type) || {};
  document.getElementById('sbStepModalTitle').textContent = `Configure: ${meta.label || step.type}`;
  document.getElementById('sbStepModalBody').innerHTML = sbStepConfigHTML(step);
  document.getElementById('sbStepModal').style.display = 'flex';
}

function stratCloseStepModal() {
  document.getElementById('sbStepModal').style.display = 'none';
  _sbEditStepIdx = -1;
}

function stratSaveStepConfig() {
  if (_sbEditStepIdx < 0) return;
  const step = _sbSteps[_sbEditStepIdx];
  if (!step) return;
  const c = step.config;

  if (step.type === 'time') {
    c.mode  = document.getElementById('sbcTimeMode')?.value || 'exactly';
    c.time1 = document.getElementById('sbcTime1')?.value || '09:30';
    c.time2 = document.getElementById('sbcTime2')?.value || '16:00';
  } else if (step.type === 'metric') {
    c.metric   = document.getElementById('sbcMetric')?.value || 'price';
    c.period   = parseInt(document.getElementById('sbcPeriod')?.value) || 14;
    c.operator = document.getElementById('sbcOperator')?.value || '>';
    c.value    = (document.getElementById('sbcMetricValue')?.value || '').trim();
    const metricNames = { price:'Price', sma:'SMA', ema:'EMA', rsi:'RSI', macd:'MACD', volume:'Volume', iv_rank:'IV Rank', delta:'Delta', theta:'Theta' };
    const mName = metricNames[c.metric] || c.metric;
    const pSuffix = ['sma','ema','rsi'].includes(c.metric) ? `(${c.period})` : '';
    c.label = `${mName}${pSuffix} ${c.operator} ${c.value}`;
  } else if (step.type === 'open_position') {
    c.symbol        = (document.getElementById('sbcSymbol')?.value || '').toUpperCase().trim();
    c.strategy      = document.getElementById('sbcStrategy')?.value || c.strategy;
    c.dte           = parseInt(document.getElementById('sbcDte')?.value) || 30;
    c.spreadWidth   = parseFloat(document.getElementById('sbcSpreadWidth')?.value) || 5;
    c.takeProfitPct = parseFloat(document.getElementById('sbcTakeProfitPct')?.value) || 50;
    c.stopLossPct   = parseFloat(document.getElementById('sbcStopLossPct')?.value) || 200;
    c.quantity      = parseInt(document.getElementById('sbcQty')?.value) || 1;
    c.orderType     = document.getElementById('sbcOrderType')?.value || 'credit';
  } else if (step.type === 'close_position') {
    c.target = document.getElementById('sbcTarget')?.value || 'all';
    c.reason = document.getElementById('sbcReason')?.value || 'manual';
  } else if (step.type === 'notification') {
    c.message = (document.getElementById('sbcMessage')?.value || '').trim();
    c.channel = document.getElementById('sbcChannel')?.value || 'email';
  } else if (step.type === 'tags') {
    c.tag = (document.getElementById('sbcTag')?.value || '').trim();
  }

  stratCloseStepModal();
  sbRenderFlow();
}

// ── Time mode toggle (inline — called from onchange) ───────────────
function sbTimeModeChange() {
  const mode = document.getElementById('sbcTimeMode')?.value;
  const row2 = document.getElementById('sbcTime2Row');
  if (row2) row2.style.display = mode === 'between' ? '' : 'none';
}

// ── Metric period toggle (inline — called from onchange) ───────────
function sbMetricChange() {
  const m = document.getElementById('sbcMetric')?.value;
  const pr = document.getElementById('sbcPeriodRow');
  if (pr) pr.style.display = ['sma','ema','rsi'].includes(m) ? '' : 'none';
}

function sbStepConfigHTML(step) {
  const c = step.config || {};

  // ── Time ────────────────────────────────────────────────────────
  if (step.type === 'time') {
    return `
      <div class="sb-form-row">
        <div class="sb-form-label">Time is</div>
        <select id="sbcTimeMode" class="sb-form-select" onchange="sbTimeModeChange()">
          <option value="exactly" ${c.mode==='exactly'?'selected':''}>Exactly</option>
          <option value="after"   ${c.mode==='after'?'selected':''}>After</option>
          <option value="between" ${c.mode==='between'?'selected':''}>Between</option>
        </select>
      </div>
      <div class="sb-form-row">
        <div class="sb-form-label">Entry</div>
        <input id="sbcTime1" class="sb-form-input" type="time" value="${c.time1||'09:30'}">
      </div>
      <div class="sb-form-row" id="sbcTime2Row" style="${c.mode==='between'?'':'display:none'}">
        <div class="sb-form-label">End Time</div>
        <input id="sbcTime2" class="sb-form-input" type="time" value="${c.time2||'16:00'}">
      </div>`;
  }

  // ── Metric ──────────────────────────────────────────────────────
  if (step.type === 'metric') {
    const hasPeriod = ['sma','ema','rsi'].includes(c.metric||'price');
    return `
      <div class="sb-form-row">
        <div class="sb-form-label">Metric</div>
        <select id="sbcMetric" class="sb-form-select" onchange="sbMetricChange()">
          <option value="price"    ${c.metric==='price'?'selected':''}>Price</option>
          <option value="sma"      ${c.metric==='sma'?'selected':''}>SMA</option>
          <option value="ema"      ${c.metric==='ema'?'selected':''}>EMA</option>
          <option value="rsi"      ${c.metric==='rsi'?'selected':''}>RSI</option>
          <option value="macd"     ${c.metric==='macd'?'selected':''}>MACD</option>
          <option value="volume"   ${c.metric==='volume'?'selected':''}>Volume</option>
          <option value="iv_rank"  ${c.metric==='iv_rank'?'selected':''}>IV Rank</option>
          <option value="delta"    ${c.metric==='delta'?'selected':''}>Delta</option>
          <option value="theta"    ${c.metric==='theta'?'selected':''}>Theta</option>
        </select>
      </div>
      <div class="sb-form-row" id="sbcPeriodRow" style="${hasPeriod?'':'display:none'}">
        <div class="sb-form-label">Period</div>
        <input id="sbcPeriod" class="sb-form-input" type="number" min="1" max="200" value="${c.period||14}" placeholder="14">
      </div>
      <div class="sb-form-row">
        <div class="sb-form-label">Operator</div>
        <select id="sbcOperator" class="sb-form-select">
          <option value=">"  ${c.operator==='>'?'selected':''}>Greater than (&gt;)</option>
          <option value="<"  ${c.operator==='<'?'selected':''}>Less than (&lt;)</option>
          <option value=">=" ${c.operator==='>='?'selected':''}>Greater or equal (&gt;=)</option>
          <option value="<=" ${c.operator==='<='?'selected':''}>Less or equal (&lt;=)</option>
          <option value="="  ${c.operator==='='?'selected':''}>Equal (=)</option>
        </select>
      </div>
      <div class="sb-form-row">
        <div class="sb-form-label">Value</div>
        <input id="sbcMetricValue" class="sb-form-input" type="number" step="0.01" placeholder="e.g. 50" value="${c.value||''}">
      </div>`;
  }

  // ── Open Position ────────────────────────────────────────────────
  if (step.type === 'open_position') {
    const strats = [
      ['Single Leg', ['Long Call','Long Put','Naked Short Call','Naked Short Put']],
      ['Vertical Spreads', ['Short Put Spread','Short Call Spread','Long Call Spread','Long Put Spread']],
      ['Iron Strategies', ['Short Iron Condor','Short Iron Butterfly','Long Iron Butterfly','Long Iron Condor']],
      ['Straddles & Strangles', ['Long Straddle','Long Strangle','Short Straddle','Short Strangle']],
      ['Calendar & Diagonal', ['Calendar Call Spread','Calendar Put Spread','Diagonal Call Spread','Diagonal Put Spread','Double Calendar','Double Diagonal']],
    ];
    const stratOpts = strats.map(([grp, items]) =>
      `<optgroup label="${grp}">${items.map(s => `<option value="${s}" ${c.strategy===s?'selected':''}>${s}</option>`).join('')}</optgroup>`
    ).join('');
    const otOpts = ['credit','debit','market']
      .map(t => `<option value="${t}" ${c.orderType===t?'selected':''}>${t.charAt(0).toUpperCase()+t.slice(1)}</option>`)
      .join('');
    return `
      <div class="sb-form-row">
        <div class="sb-form-label">Symbol</div>
        <input id="sbcSymbol" class="sb-form-input" placeholder="e.g. SPX" value="${c.symbol||''}">
      </div>
      <div class="sb-form-row">
        <div class="sb-form-label">Strategy (Section 4)</div>
        <select id="sbcStrategy" class="sb-form-select">${stratOpts}</select>
      </div>
      <div class="sb-form-row">
        <div class="sb-form-label">DTE — Days to Expiration (Section 5)</div>
        <input id="sbcDte" class="sb-form-input" type="number" min="0" max="365" value="${c.dte||30}" placeholder="30">
      </div>
      <div class="sb-form-row">
        <div class="sb-form-label">Spread Width — $ per leg (Section 6)</div>
        <input id="sbcSpreadWidth" class="sb-form-input" type="number" min="0.5" step="0.5" value="${c.spreadWidth||5}" placeholder="5">
      </div>
      <div class="sb-form-row">
        <div class="sb-form-label">Take Profit — % of max profit (Section 7)</div>
        <input id="sbcTakeProfitPct" class="sb-form-input" type="number" min="0" max="100" step="1" value="${c.takeProfitPct||50}" placeholder="50">
      </div>
      <div class="sb-form-row">
        <div class="sb-form-label">Stop Loss — % of max loss (Section 7)</div>
        <input id="sbcStopLossPct" class="sb-form-input" type="number" min="0" step="1" value="${c.stopLossPct||200}" placeholder="200">
      </div>
      <div class="sb-form-row">
        <div class="sb-form-label">Quantity — contracts (Section 8)</div>
        <input id="sbcQty" class="sb-form-input" type="number" min="1" value="${c.quantity||1}">
      </div>
      <div class="sb-form-row">
        <div class="sb-form-label">Order Type</div>
        <select id="sbcOrderType" class="sb-form-select">${otOpts}</select>
      </div>`;
  }

  // ── Close Position ───────────────────────────────────────────────
  if (step.type === 'close_position') {
    return `
      <div class="sb-form-row">
        <div class="sb-form-label">Target Positions</div>
        <select id="sbcTarget" class="sb-form-select">
          <option value="all"       ${c.target==='all'?'selected':''}>All open positions</option>
          <option value="profitable" ${c.target==='profitable'?'selected':''}>Profitable positions only</option>
          <option value="losers"    ${c.target==='losers'?'selected':''}>Losing positions only</option>
        </select>
      </div>
      <div class="sb-form-row">
        <div class="sb-form-label">Close Reason</div>
        <select id="sbcReason" class="sb-form-select">
          <option value="manual"      ${c.reason==='manual'?'selected':''}>Manual / Discretionary</option>
          <option value="take_profit" ${c.reason==='take_profit'?'selected':''}>Take Profit</option>
          <option value="stop_loss"   ${c.reason==='stop_loss'?'selected':''}>Stop Loss</option>
          <option value="expiration"  ${c.reason==='expiration'?'selected':''}>Near Expiration</option>
        </select>
      </div>`;
  }

  // ── Notification ─────────────────────────────────────────────────
  if (step.type === 'notification') {
    return `
      <div class="sb-form-row">
        <div class="sb-form-label">Message</div>
        <input id="sbcMessage" class="sb-form-input" placeholder="Strategy triggered…" value="${_escHtml(c.message||'')}">
      </div>
      <div class="sb-form-row">
        <div class="sb-form-label">Channel</div>
        <select id="sbcChannel" class="sb-form-select">
          <option value="email"    ${c.channel==='email'?'selected':''}>Email</option>
          <option value="telegram" ${c.channel==='telegram'?'selected':''}>Telegram</option>
        </select>
      </div>`;
  }

  // ── Tags ─────────────────────────────────────────────────────────
  if (step.type === 'tags') {
    return `
      <div class="sb-form-row">
        <div class="sb-form-label">Tag Name</div>
        <input id="sbcTag" class="sb-form-input" placeholder="e.g. high-iv" value="${_escHtml(c.tag||'')}">
      </div>`;
  }

  return `<p style="color:#9098a9;font-size:13px;">No configuration needed for this step type.</p>`;
}

// ── Strategies list (dashboard card) ──────────────────────────────
function strategiesRender() {
  const body = document.getElementById('botStrategiesBody');
  if (!body) return;
  const list = sbLoad();
  if (!list.length) {
    body.innerHTML = `<div class="bot-empty" style="padding:28px 20px;">
      <i class="fas fa-robot" style="font-size:28px;margin-bottom:8px;display:block;color:#dee2e6;"></i>
      No strategies yet. Click <strong>+ New Strategy</strong> to create one.
    </div>`;
    return;
  }
  body.innerHTML = `<div class="strat-list">${list.map(s => stratItemHTML(s)).join('')}</div>`;
}

function stratItemHTML(s) {
  const stepsLabel = s.steps?.length ? `${s.steps.length} step${s.steps.length!==1?'s':''}` : 'No steps';
  const isLive = s.status === 'live';
  const created = s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '';
  return `<div class="strat-item">
    <div class="strat-item-left">
      <div class="strat-item-icon"><i class="fas fa-robot"></i></div>
      <div>
        <div class="strat-item-name">${_escHtml(s.name)}</div>
        <div class="strat-item-meta">${stepsLabel}${created ? ' · Created ' + created : ''}</div>
      </div>
    </div>
    <div class="strat-item-actions">
      <div class="strat-toggle-wrap">
        <span class="strat-toggle-label ${isLive?'live':'off'}" id="stratLabel_${s.id}">${isLive?'Live':'Off'}</span>
        <label class="strat-toggle">
          <input type="checkbox" ${isLive?'checked':''} onchange="stratToggle('${s.id}',this.checked)">
          <span class="strat-toggle-slider"></span>
        </label>
      </div>
      <button class="strat-edit-btn" onclick="stratBuilderOpen('${s.id}')" title="Edit"><i class="fas fa-pen"></i></button>
      <button class="strat-del-btn" onclick="stratDelete('${s.id}')" title="Delete"><i class="fas fa-trash"></i></button>
    </div>
  </div>`;
}

function stratToggle(id, isLive) {
  const list = sbLoad();
  const s = list.find(x => x.id === id);
  if (!s) return;
  s.status = isLive ? 'live' : 'off';
  sbSave(list);
  const lbl = document.getElementById('stratLabel_' + id);
  if (lbl) { lbl.textContent = isLive ? 'Live' : 'Off'; lbl.className = 'strat-toggle-label ' + (isLive ? 'live' : 'off'); }
}

function stratDelete(id) {
  if (!confirm('Delete this strategy?')) return;
  const list = sbLoad().filter(x => x.id !== id);
  sbSave(list);
  strategiesRender();
}

function _escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
