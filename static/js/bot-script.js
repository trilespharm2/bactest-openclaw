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
  _safeSet('botPollInterval',       String(data.poll_interval_sec || 60));
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
    poll_interval_sec:     parseInt(document.getElementById('botPollInterval')?.value || '60'),
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
  { type:'condition',      icon:'fa-code-branch',  bg:'#ecfeff', color:'#0891b2', label:'Condition',      desc:'Guard: only proceed if a position/P&L condition is met.' },
  { type:'open_position',  icon:'fa-plus-square',  bg:'#eff6ff', color:'#1b55e2', label:'Open Position',  desc:'Place a trade to open a new position.' },
  { type:'close_position', icon:'fa-minus-square', bg:'#fef2f2', color:'#ef4444', label:'Close Position', desc:'Place a trade to close a position.' },
  { type:'notification',   icon:'fa-bell',         bg:'#f5f3ff', color:'#6366f1', label:'Notification',   desc:'Send a notification to yourself.' },
  { type:'tags',           icon:'fa-tag',          bg:'#fdf4ff', color:'#a855f7', label:'Tags',           desc:'Tag your bot and positions.' },
];

// Default config per step type
function sbDefaultConfig(type) {
  if (type === 'time')           return { mode:'exactly', time1:'09:30', time2:'16:00' };
  if (type === 'metric')         return { metric:'price', day:0, interval:'1min', series:'close', period:14,
    macdShort:12, macdLong:26, macdSignal:9, macdComponent:'histogram',
    optType:'call', optDte:30,
    operator:'>', compareType:'value', value:'',
    barOffset:1, deltaType:'pct', deltaThreshold:1, windowFrom:'', windowTo:'',
    compareIndicator:'ema', compareDay:-1, compareInterval:'day', compareSeries:'close', comparePeriod:9,
    refMacdShort:12, refMacdLong:26, refMacdSignal:9, refMacdComponent:'histogram',
    andEnabled:false, andMetric:'rsi', andPeriod:14, andOperator:'<', andValue:'',
    seqEnabled:false, seqBars:5, label:'' };
  if (type === 'open_position')  return { symbol:'', strategy:'Short Put Spread', dte:30,
    frontDte:7, backDte:30, strikeMethod:'atm', strikeValue:'',
    spreadWidth:5, callWidth:5, putWidth:5,
    leg2StrikeMethod:'spread_width', leg2StrikeValue:'', leg2Direction:'below',
    takeProfitPct:50, stopLossPct:200, quantity:1, orderType:'credit', limitPrice:0, tag:'' };
  if (type === 'condition')      return { conditionType:'position_count', tag:'', operator:'<', value:1 };
  if (type === 'close_position') return { target:'all', tag:'' };
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
  if (step.type === 'open_position') {
    const _CAL  = ['Calendar Call Spread','Calendar Put Spread','Diagonal Call Spread','Diagonal Put Spread','Double Calendar','Double Diagonal'];
    const _IRON = ['Short Iron Condor','Short Iron Butterfly','Long Iron Butterfly','Long Iron Condor'];
    const dteS  = _CAL.includes(c.strategy)  ? `${c.frontDte??7}/${c.backDte??30} DTE` : `${c.dte??30} DTE`;
    const wingS = _IRON.includes(c.strategy) ? ` · P${c.putWidth||5}$/C${c.callWidth||5}$` : '';
    return `${c.symbol||'?'} · ${c.strategy||'?'} · ${dteS}${wingS}`;
  }
  if (step.type === 'condition') {
    const _ctN = { position_count:'Open positions', daily_opens:'Positions today', unrealized_pnl:'Unrealized P&L',
                   open_orders:'Open orders', canceled_orders:'Canceled orders today', closed_today:'Closed positions today' };
    const tName = _ctN[c.conditionType] || 'Open positions';
    const tagStr = c.tag ? ` (${c.tag})` : '';
    const valStr = c.conditionType === 'unrealized_pnl' ? `$${c.value??0}` : (c.value??1);
    return `${tName}${tagStr} ${c.operator||'<'} ${valStr} → proceed`;
  }
  if (step.type === 'close_position') {
    const tagStr = c.tag ? ` [tag: ${c.tag}]` : '';
    return `Close ${c.target||'all'} positions${tagStr}`;
  }
  if (step.type === 'notification')   return c.message || 'Send notification';
  if (step.type === 'tags')           return c.tag ? `Tag: ${c.tag}` : 'Set tag…';
  return '';
}

// ── Builder state ──────────────────────────────────────────────────
let _sbEditId      = null;  // strategy id being edited (null = new)
let _sbSteps       = [];    // array of step objects
let _sbInsertIdx   = -1;    // where to insert the next step
let _sbEditStepIdx = -1;    // step index being configured in modal
let _sbIsNewStep   = false; // true when modal opened for a freshly-added step
let _sbAllocation    = null; // $ allocation limit (null = unlimited)
let _sbMaxPositions  = null; // max open positions + orders (null = unlimited)

// ── Utilities ──────────────────────────────────────────────────────
function sbUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try { return crypto.randomUUID(); } catch(e) {}
  }
  return 'sb_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

// ── Strategy API cache (replaces localStorage) ─────────────────────
let _sbStratCache = [];   // populated by strategiesRender(); used by builder to find by id

async function _apiStrategies() {
  const r = await fetch('/api/bot/strategies');
  if (!r.ok) return [];
  return await r.json();
}

// ── Open/Close builder ────────────────────────────────────────────
async function stratBuilderOpen(stratId) {
  _sbEditId = stratId || null;
  if (stratId) {
    const s = _sbStratCache.find(x => x.id == stratId);
    if (!s) return;
    document.getElementById('sbStratName').value = s.name;
    _sbSteps       = JSON.parse(JSON.stringify(s.steps || []));
    _sbAllocation   = s.allocation   || null;
    _sbMaxPositions = s.max_positions || null;
  } else {
    document.getElementById('sbStratName').value = '';
    _sbSteps        = [];
    _sbAllocation   = null;
    _sbMaxPositions = null;
  }
  document.getElementById('sbAllocation').value   = _sbAllocation   ?? '';
  document.getElementById('sbMaxPositions').value = _sbMaxPositions ?? '';
  sbInitLeftPanel();
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

function sbToggleLeftPanel() {
  const panel = document.getElementById('sbLeftPanel');
  if (!panel) return;
  const isMobile = window.innerWidth <= 640;
  if (isMobile) {
    panel.classList.toggle('mobile-open');
  } else {
    panel.classList.toggle('collapsed');
    try { localStorage.setItem('sbLeftPanelCollapsed', panel.classList.contains('collapsed') ? '1' : '0'); } catch(e) {}
  }
}

function sbInitLeftPanel() {
  const panel = document.getElementById('sbLeftPanel');
  if (!panel) return;
  if (window.innerWidth <= 640) {
    panel.classList.remove('collapsed', 'mobile-open');
  } else {
    let saved = '0';
    try { saved = localStorage.getItem('sbLeftPanelCollapsed') || '0'; } catch(e) {}
    panel.classList.toggle('collapsed', saved === '1');
  }
}

// ── Save ──────────────────────────────────────────────────────────
async function stratBuilderSave() {
  const name    = (document.getElementById('sbStratName').value || '').trim() || 'Untitled Strategy';
  const rawAlloc = parseFloat(document.getElementById('sbAllocation').value);
  const rawMaxPos = parseInt(document.getElementById('sbMaxPositions').value, 10);
  const saveBtn = document.querySelector('#stratBuilderOverlay .sb-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
  try {
    const payload = {
      name,
      steps:         _sbSteps,
      allocation:    isNaN(rawAlloc)  || rawAlloc  <= 0 ? null : rawAlloc,
      max_positions: isNaN(rawMaxPos) || rawMaxPos <= 0 ? null : rawMaxPos,
    };
    if (_sbEditId) payload.id = _sbEditId;
    const r = await fetch('/api/bot/strategies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) { alert('Save failed'); return; }
    stratBuilderClose();
    await strategiesRender();
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Strategy'; }
  }
}

// ── Run Test ────────────────────────────────────────────────────────
function stratRunTest() {
  if (!_sbEditId) {
    alert('Save the strategy first before running a test.');
    return;
  }
  openTestModal(_sbEditId);
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
  sbUpdateCounts();
  stratEditStep(idx, true);
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
function stratEditStep(idx, isNew) {
  const step = _sbSteps[idx];
  if (!step) return;
  _sbEditStepIdx = idx;
  _sbIsNewStep = !!isNew;
  const meta = SB_ACTIONS.find(m => m.type === step.type) || {};
  document.getElementById('sbStepModalTitle').textContent = `Configure: ${meta.label || step.type}`;
  document.getElementById('sbStepModalBody').innerHTML = sbStepConfigHTML(step);
  if (step.type === 'metric') sbSyncMetricForm();
  document.getElementById('sbStepModal').style.display = 'flex';
}

function stratCloseStepModal() {
  if (_sbIsNewStep && _sbEditStepIdx >= 0) {
    _sbSteps.splice(_sbEditStepIdx, 1);
    sbRenderFlow();
    sbUpdateCounts();
  }
  document.getElementById('sbStepModal').style.display = 'none';
  _sbEditStepIdx = -1;
  _sbIsNewStep = false;
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
    c.metric          = document.getElementById('sbcMetric')?.value || 'price';
    c.day             = parseInt(document.getElementById('sbcDay')?.value ?? '0');
    c.interval        = document.getElementById('sbcInterval')?.value || '1min';
    c.series          = document.getElementById('sbcSeries')?.value || 'close';
    c.period          = parseInt(document.getElementById('sbcPeriod')?.value) || 14;
    c.macdShort       = parseInt(document.getElementById('sbcMacdShort')?.value) || 12;
    c.macdLong        = parseInt(document.getElementById('sbcMacdLong')?.value)  || 26;
    c.macdSignal      = parseInt(document.getElementById('sbcMacdSignal')?.value) || 9;
    c.macdComponent   = document.getElementById('sbcMacdComp')?.value || 'histogram';
    c.optType         = document.getElementById('sbcOptType')?.value || 'call';
    c.optDte          = (() => { const v = parseInt(document.getElementById('sbcOptDte')?.value); return isNaN(v) ? 30 : Math.max(1, v); })();
    c.operator        = document.getElementById('sbcOperator')?.value || '>';
    c.barOffset       = parseInt(document.getElementById('sbcBarOffset')?.value) || 1;
    c.deltaType       = document.getElementById('sbcDeltaType')?.value || 'pct';
    c.deltaThreshold  = parseFloat(document.getElementById('sbcDeltaThreshold')?.value) || 1;
    c.windowFrom      = document.getElementById('sbcWindowFrom')?.value || '';
    c.windowTo        = document.getElementById('sbcWindowTo')?.value || '';
    c.compareType     = document.getElementById('sbcCompareType')?.value || 'value';
    c.value           = (document.getElementById('sbcMetricValue')?.value || '').trim();
    c.compareIndicator = document.getElementById('sbcRefMetric')?.value || 'ema';
    c.compareDay       = parseInt(document.getElementById('sbcRefDay')?.value ?? '-1');
    c.compareInterval  = document.getElementById('sbcRefInterval')?.value || 'day';
    c.compareSeries    = document.getElementById('sbcRefSeries')?.value || 'close';
    c.comparePeriod    = parseInt(document.getElementById('sbcRefPeriod')?.value) || 9;
    c.refMacdShort    = parseInt(document.getElementById('sbcRefMacdShort')?.value) || 12;
    c.refMacdLong     = parseInt(document.getElementById('sbcRefMacdLong')?.value)  || 26;
    c.refMacdSignal   = parseInt(document.getElementById('sbcRefMacdSignal')?.value) || 9;
    c.refMacdComponent = document.getElementById('sbcRefMacdComp')?.value || 'histogram';
    c.andEnabled  = document.getElementById('sbcAndEnabled')?.checked || false;
    c.andMetric   = document.getElementById('sbcAndMetric')?.value || 'rsi';
    c.andPeriod   = parseInt(document.getElementById('sbcAndPeriod')?.value) || 14;
    c.andOperator = document.getElementById('sbcAndOperator')?.value || '<';
    c.andValue    = (document.getElementById('sbcAndValue')?.value || '').trim();
    c.seqEnabled  = document.getElementById('sbcSeqEnabled')?.checked || false;
    c.seqBars     = parseInt(document.getElementById('sbcSeqBars')?.value) || 5;

    const _MN = { price:'Price', current_price:'Current Price', sma:'SMA', ema:'EMA', rsi:'RSI',
                  macd:'MACD', volume:'Volume', iv_rank:'IV%', delta:'Delta', theta:'Theta',
                  gap_pct:'Gap%', change_pct:'Change%', roc:'ROC' };
    const _MACD_COMP = { histogram:'Hist', signal_line:'Signal', macd_line:'Line' };
    const _ctx = (m, d, intv, ser) => {
      if (['gap_pct','iv_rank','delta','theta','current_price'].includes(m)) return '';
      if (m === 'change_pct') return d !== 0 ? ` D(${d})` : '';
      const dStr = d !== 0 ? ` D(${d})` : '';
      const iStr = intv === 'day' ? 'Daily' : intv;
      const sStr = m === 'price' ? `·${ser}` : '';
      return ` [${iStr}${dStr}${sStr}]`;
    };
    const mName = _MN[c.metric] || c.metric;
    const pSfx  = ['sma','ema','rsi','roc'].includes(c.metric)
      ? `(${c.period})`
      : c.metric === 'macd'
        ? `(${c.macdShort},${c.macdLong})·${_MACD_COMP[c.macdComponent]||c.macdComponent}`
        : ['iv_rank','delta','theta'].includes(c.metric)
          ? ` [${c.optType}·DTE${c.optDte}]`
          : '';
    const opLbl = {'>':'>','<':'<','>=':'≥','<=':'≤','=':'=',
                   'crosses_above':'crosses above ↑','crosses_below':'crosses below ↓'}[c.operator] || c.operator;
    let lbl = `${mName}${pSfx}${_ctx(c.metric,c.day,c.interval,c.series)} ${opLbl}`;
    if (c.compareType === 'price') {
      lbl += ` Current Price`;
    } else if (c.compareType === 'bar_delta') {
      const dSign = c.deltaType === 'pct' ? '%' : 'abs';
      const winStr = c.windowFrom && c.windowTo ? ` [${c.windowFrom}–${c.windowTo}]` : '';
      lbl = `${mName}${pSfx}${_ctx(c.metric,c.day,c.interval,c.series)} Δ${dSign} ${opLbl} ${c.deltaThreshold} [-${c.barOffset} bars]${winStr}`;
    } else if (c.compareType === 'indicator') {
      const cName = _MN[c.compareIndicator] || c.compareIndicator;
      const cpSfx = ['sma','ema','rsi','roc'].includes(c.compareIndicator)
        ? `(${c.comparePeriod})`
        : c.compareIndicator === 'macd'
          ? `(${c.refMacdShort},${c.refMacdLong})·${_MACD_COMP[c.refMacdComponent]||c.refMacdComponent}`
          : '';
      lbl += ` ${cName}${cpSfx}${_ctx(c.compareIndicator,c.compareDay,c.compareInterval,c.compareSeries)}`;
    } else {
      lbl += ` ${c.value}`;
    }
    if (c.andEnabled && c.andValue !== '') {
      const aMN  = _MN[c.andMetric] || c.andMetric;
      const aSfx = ['sma','ema','rsi','roc'].includes(c.andMetric) ? `(${c.andPeriod})` : '';
      const aOp  = {'>':'>','<':'<','>=':'≥','<=':'≤','=':'='}[c.andOperator] || c.andOperator;
      lbl += ` AND ${aMN}${aSfx} ${aOp} ${c.andValue}`;
    }
    if (c.seqEnabled && c.seqBars > 0) lbl += ` [within ${c.seqBars} bars]`;
    c.label = lbl;
  } else if (step.type === 'open_position') {
    c.symbol        = (document.getElementById('sbcSymbol')?.value || '').toUpperCase().trim();
    c.strategy      = document.getElementById('sbcStrategy')?.value || c.strategy;
    c.dte           = (() => { const v = parseInt(document.getElementById('sbcDte')?.value);     return isNaN(v) ? 30 : Math.max(0, v); })();
    c.frontDte      = (() => { const v = parseInt(document.getElementById('sbcFrontDte')?.value); return isNaN(v) ? 7  : Math.max(0, v); })();
    c.backDte       = (() => { const v = parseInt(document.getElementById('sbcBackDte')?.value);  return isNaN(v) ? 30 : Math.max(0, v); })();
    c.strikeMethod      = document.getElementById('sbcStrikeMethod')?.value || 'atm';
    c.strikeValue       = document.getElementById('sbcStrikeValue')?.value || '';
    c.leg2StrikeMethod  = document.getElementById('sbcLeg2Method')?.value || 'spread_width';
    c.leg2StrikeValue   = document.getElementById('sbcLeg2Value')?.value  || '';
    c.leg2Direction     = document.getElementById('sbcLeg2Dir')?.value    || 'below';
    // spreadWidth: from Leg 2 section for verticals, standalone row for strangles
    const _stratVal = document.getElementById('sbcStrategy')?.value || '';
    if (_OP_VERTICAL.includes(_stratVal)) {
      c.spreadWidth = parseFloat(document.getElementById('sbcLeg2SpreadWidth')?.value) || 5;
    } else {
      c.spreadWidth = parseFloat(document.getElementById('sbcSpreadWidth')?.value) || 5;
    }
    c.callWidth     = parseFloat(document.getElementById('sbcCallWidth')?.value) || 5;
    c.putWidth      = parseFloat(document.getElementById('sbcPutWidth')?.value) || 5;
    c.takeProfitPct = parseFloat(document.getElementById('sbcTakeProfitPct')?.value) || 50;
    c.stopLossPct   = parseFloat(document.getElementById('sbcStopLossPct')?.value) || 200;
    c.quantity      = parseInt(document.getElementById('sbcQty')?.value) || 1;
    c.orderType     = document.getElementById('sbcOrderType')?.value || 'credit';
    c.limitPrice    = parseFloat(document.getElementById('sbcLimitPrice')?.value) || 0;
    c.tag           = (document.getElementById('sbcTag')?.value || '').trim();
  } else if (step.type === 'close_position') {
    c.target = document.getElementById('sbcTarget')?.value || 'all';
    c.tag    = (document.getElementById('sbcCloseTag')?.value || '').trim();
  } else if (step.type === 'notification') {
    c.message = (document.getElementById('sbcMessage')?.value || '').trim();
    c.channel = document.getElementById('sbcChannel')?.value || 'email';
  } else if (step.type === 'tags') {
    c.tag = (document.getElementById('sbcTag')?.value || '').trim();
  } else if (step.type === 'condition') {
    c.conditionType = document.getElementById('sbcCondType')?.value || 'position_count';
    c.tag           = (document.getElementById('sbcCondTag')?.value || '').trim();
    c.operator      = document.getElementById('sbcCondOp')?.value || '<';
    c.value         = parseFloat(document.getElementById('sbcCondValue')?.value) || 1;
  }

  _sbIsNewStep = false;
  stratCloseStepModal();
  sbRenderFlow();
}

// ── Time mode toggle (inline — called from onchange) ───────────────
function sbTimeModeChange() {
  const mode = document.getElementById('sbcTimeMode')?.value;
  const row2 = document.getElementById('sbcTime2Row');
  if (row2) row2.style.display = mode === 'between' ? '' : 'none';
}

// ── Metric step: master sync (called by all onchange handlers) ──────
function sbSyncMetricForm() {
  const m      = document.getElementById('sbcMetric')?.value || 'price';
  const day    = parseInt(document.getElementById('sbcDay')?.value ?? '0');
  const ct     = document.getElementById('sbcCompareType')?.value || 'value';
  const showRef = ct === 'indicator';
  const refM   = document.getElementById('sbcRefMetric')?.value || 'ema';
  const refDay = parseInt(document.getElementById('sbcRefDay')?.value ?? '-1');

  const noBarCtx = ['gap_pct','iv_rank','delta','theta','current_price'].includes(m);
  const noIntv   = ['change_pct'].includes(m);
  _show('sbcDayRow',         !noBarCtx);
  _show('sbcIntervalRow',    !noBarCtx && !noIntv && day === 0);
  _show('sbcSeriesRow',       m === 'price');
  _show('sbcPeriodRow',      ['sma','ema','rsi','roc'].includes(m));
  _show('sbcMacdShortRow',   m === 'macd');
  _show('sbcMacdLongRow',    m === 'macd');
  _show('sbcMacdSignalRow',  m === 'macd');
  _show('sbcMacdCompRow',    m === 'macd');
  _show('sbcOptTypeRow',     ['iv_rank','delta','theta'].includes(m));
  _show('sbcOptDteRow',      ['iv_rank','delta','theta'].includes(m));

  // Compare Against always visible; value/bar-delta/indicator rows toggle by selection
  _show('sbcValueRow',        ct === 'value');
  _show('sbcBarOffsetRow',    ct === 'bar_delta');
  _show('sbcDeltaTypeRow',    ct === 'bar_delta');
  _show('sbcDeltaThreshRow',  ct === 'bar_delta');
  _show('sbcWindowFromRow',   ct === 'bar_delta');
  _show('sbcWindowToRow',     ct === 'bar_delta');

  const refNoBCtx = ['iv_rank','delta','theta','current_price'].includes(refM);
  const refNoIntv = ['change_pct'].includes(refM);
  const showRefMacd = showRef && refM === 'macd';
  _show('sbcRefMetricRow',      showRef);
  _show('sbcRefDayRow',         showRef && !refNoBCtx);
  _show('sbcRefIntervalRow',    showRef && !refNoBCtx && !refNoIntv && refDay === 0);
  _show('sbcRefSeriesRow',      showRef && refM === 'price');
  _show('sbcRefPeriodRow',      showRef && ['sma','ema','rsi','roc'].includes(refM));
  _show('sbcRefMacdShortRow',   showRefMacd);
  _show('sbcRefMacdLongRow',    showRefMacd);
  _show('sbcRefMacdSignalRow',  showRefMacd);
  _show('sbcRefMacdCompRow',    showRefMacd);
}
function sbMetricChange()      { sbSyncMetricForm(); }
function sbDayChange()         { sbSyncMetricForm(); }
function sbIntervalChange()    { sbSyncMetricForm(); }
function sbOperatorChange()    { sbSyncMetricForm(); }
function sbCompareTypeChange() { sbSyncMetricForm(); }
function sbRefMetricChange()   { sbSyncMetricForm(); }
function sbRefDayChange()      { sbSyncMetricForm(); }
function sbAndToggle()         { _show('sbcAndBlock', document.getElementById('sbcAndEnabled')?.checked); }
function sbAndMetricChange()   { _show('sbcAndPeriodRow', ['sma','ema','rsi','roc'].includes(document.getElementById('sbcAndMetric')?.value)); }
function sbSeqToggle()         { _show('sbcSeqBlock', document.getElementById('sbcSeqEnabled')?.checked); }

// ── Condition step: update value label when type changes ─────────────
function sbConditionTypeChange() {
  const t   = document.getElementById('sbcCondType')?.value || 'position_count';
  const lbl = document.getElementById('sbcCondValLabel');
  if (lbl) lbl.textContent = t === 'unrealized_pnl' ? 'P&L threshold ($)' : 'Count threshold';
  const ph  = document.getElementById('sbcCondValue');
  if (ph)  ph.placeholder  = t === 'unrealized_pnl' ? '-500' : '1';
  // Tag filter is only relevant for position-based conditions
  const tagRow = document.getElementById('sbcCondTagRow');
  const posTypes = ['position_count','daily_opens','unrealized_pnl'];
  if (tagRow) tagRow.style.display = posTypes.includes(t) ? '' : 'none';
}

// ── Open Position: strategy-driven field visibility ──────────────────
const _OP_SINGLE   = ['Long Call','Long Put','Naked Short Call','Naked Short Put'];
const _OP_VERTICAL = ['Short Put Spread','Short Call Spread','Long Call Spread','Long Put Spread'];
const _OP_IRON     = ['Short Iron Condor','Short Iron Butterfly','Long Iron Butterfly','Long Iron Condor'];
const _OP_STRADDLE = ['Long Straddle','Short Straddle'];
const _OP_STRANGLE = ['Long Strangle','Short Strangle'];
const _OP_CALENDAR = ['Calendar Call Spread','Calendar Put Spread','Diagonal Call Spread','Diagonal Put Spread','Double Calendar','Double Diagonal'];
const _OP_EQUITY   = ['Buy Equity','Sell Equity Short'];

function sbStrategyChange() {
  const s  = document.getElementById('sbcStrategy')?.value || '';
  const sm = document.getElementById('sbcStrikeMethod')?.value || 'atm';
  const isIron     = _OP_IRON.includes(s);
  const isCal      = _OP_CALENDAR.includes(s);
  const isStraddle = _OP_STRADDLE.includes(s);
  const isStrangle = _OP_STRANGLE.includes(s);
  const isVertical = _OP_VERTICAL.includes(s);
  const isEquity   = _OP_EQUITY.includes(s);

  _show('sbcIronDiagram',    isIron && !isEquity);
  _show('sbcDteRow',         !isCal && !isEquity);
  _show('sbcFrontDteRow',    isCal && !isEquity);
  _show('sbcBackDteRow',     isCal && !isEquity);
  _show('sbcStrikeRow',      !isStraddle && !isEquity);
  _show('sbcStrikeValRow',   !isStraddle && !isEquity && sm !== 'atm');
  _show('sbcSpreadWidthRow', isStrangle && !isEquity);
  _show('sbcLeg2Section',   isVertical && !isEquity);
  if (isVertical) sbLeg2MethodChange();
  _show('sbcCallWidthRow',   isIron && !isEquity);
  _show('sbcPutWidthRow',    isIron && !isEquity);
  _show('sbcTpRow',          !isEquity);
  _show('sbcSlRow',          !isEquity);

  // Swap order-type options between options (credit/debit/market) and equity (market/limit)
  const otSel = document.getElementById('sbcOrderType');
  if (otSel) {
    const cur  = otSel.value;
    const opts = isEquity ? ['market','limit'] : ['credit','debit','market'];
    otSel.innerHTML = opts.map(t =>
      `<option value="${t}" ${t===cur?'selected':''}>${t.charAt(0).toUpperCase()+t.slice(1)}</option>`
    ).join('');
    if (isEquity && !['market','limit'].includes(otSel.value)) otSel.value = 'market';
  }
  _show('sbcEquityLimitRow', isEquity && document.getElementById('sbcOrderType')?.value === 'limit');

  // Update the "Strike Selection" label to mention short legs for iron
  const sl = document.getElementById('sbcStrikeRowLabel');
  if (sl) sl.textContent = 'Strike Selection' + (isIron ? ' — short legs' : '');
}

function sbLeg2MethodChange() {
  const m2 = document.getElementById('sbcLeg2Method')?.value || 'spread_width';
  const distMethods = ['pct_underlying','dollar_underlying','pct_leg1','dollar_leg1'];
  const needsVal    = !['spread_width','atm'].includes(m2);
  _show('sbcLeg2SpreadRow', m2 === 'spread_width');
  _show('sbcLeg2ValueRow',  needsVal);
  _show('sbcLeg2DirRow',    distMethods.includes(m2));
  const labels = {
    pct_underlying:'% Distance from Underlying', dollar_underlying:'$ Distance from Underlying',
    pct_leg1:'% Distance from Leg 1', dollar_leg1:'$ Distance from Leg 1',
    delta:'Target Delta', fixed_strike:'Fixed Strike ($)',
  };
  const lbl = document.getElementById('sbcLeg2ValueLabel');
  if (lbl) lbl.textContent = labels[m2] || 'Value';
}

function sbOrderTypeChange() {
  const s  = document.getElementById('sbcStrategy')?.value || '';
  const ot = document.getElementById('sbcOrderType')?.value || 'market';
  _show('sbcEquityLimitRow', _OP_EQUITY.includes(s) && ot === 'limit');
}

function sbStrikeMethodChange() {
  const sm = document.getElementById('sbcStrikeMethod')?.value || 'atm';
  const s  = document.getElementById('sbcStrategy')?.value || '';
  _show('sbcStrikeValRow', !_OP_STRADDLE.includes(s) && sm !== 'atm');
  const lbl = document.getElementById('sbcStrikeValLabel');
  const inp = document.getElementById('sbcStrikeValue');
  const smLabelMap = {
    pct_underlying:  '% Distance from Underlying',
    dollar_underlying:'$ Distance from Underlying',
    pct_leg:         '% Distance from Another Leg',
    dollar_leg:      '$ Distance from Another Leg',
    delta:           'Target Delta',
  };
  const smPhMap = { pct_underlying:'5', dollar_underlying:'50', pct_leg:'5', dollar_leg:'50', delta:'0.30' };
  if (lbl) lbl.textContent = smLabelMap[sm] || '% Distance from Underlying';
  if (inp) inp.placeholder  = smPhMap[sm]  || '5';
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
    const m      = c.metric || 'price';
    const day    = c.day ?? 0;
    const intv   = c.interval || '1min';
    const ser    = c.series || 'close';
    const op     = c.operator || '>';
    const ct     = c.compareType || 'value';
    const showRef = ct === 'indicator';
    const refM   = c.compareIndicator || 'ema';
    const refDay = c.compareDay ?? -1;
    const refIntv = c.compareInterval || 'day';
    const refSer  = c.compareSeries || 'close';

    const noBarCtx = ['gap_pct','iv_rank','delta','theta','current_price'].includes(m);
    const noIntv   = ['change_pct'].includes(m);
    const showDay  = !noBarCtx;
    const showIntv = !noBarCtx && !noIntv && day === 0;
    const showSer  = m === 'price';
    const showP    = ['sma','ema','rsi','roc'].includes(m);
    const showMacd = m === 'macd';
    const showOpts = ['iv_rank','delta','theta'].includes(m);

    const refNoBCtx  = ['iv_rank','delta','theta','current_price'].includes(refM);
    const refNoIntv  = ['change_pct'].includes(refM);
    const showRefDay  = showRef && !refNoBCtx;
    const showRefIntv = showRef && !refNoBCtx && !refNoIntv && refDay === 0;
    const showRefSer  = showRef && refM === 'price';
    const showRefP    = showRef && ['sma','ema','rsi','roc'].includes(refM);
    const showRefMacd = showRef && refM === 'macd';

    const andM      = c.andMetric || 'rsi';
    const andEn     = c.andEnabled || false;
    const showAndP  = ['sma','ema','rsi','roc'].includes(andM);
    const seqEn     = c.seqEnabled || false;

    const _sel = (id, val, opts, extra='') =>
      `<select id="${id}" class="sb-form-select" ${extra}>${opts.map(([v,l])=>`<option value="${v}" ${String(val)===v?'selected':''}>${l}</option>`).join('')}</select>`;

    const DAY_OPTS  = [['0','Today (0)'],['-1','Yesterday (-1)'],['-2','2 days ago (-2)'],['-3','3 days ago (-3)'],['-4','4 days ago (-4)'],['-5','5 days ago (-5)']];
    const INTV_OPTS = [['1min','1 min'],['5min','5 min'],['15min','15 min'],['day','Daily bar']];
    const SER_OPTS  = [['open','Open'],['high','High'],['low','Low'],['close','Close'],['vwap','VWAP']];
    const OP_OPTS   = [['>','Greater than (>)'],['<','Less than (<)'],['>=','Greater or equal (>=)'],['<=','Less or equal (<=)'],['=','Equal (=)'],['crosses_above','Crosses Above ↑'],['crosses_below','Crosses Below ↓']];
    const AOPT_OPTS = [['>','> Greater than'],['<','< Less than'],['>=','>= Greater or equal'],['<=','<= Less or equal'],['=','= Equal']];
    const REF_METRICS = [['current_price','Current Price'],['sma','SMA'],['ema','EMA'],['rsi','RSI'],['macd','MACD'],['price','Price (daily bar)'],['roc','ROC']];
    const AND_METRICS = [['rsi','RSI'],['sma','SMA'],['ema','EMA'],['macd','MACD'],['price','Price'],['volume','Volume'],['roc','ROC'],['gap_pct','Gap%'],['change_pct','Change%']];

    return `
      <div class="sb-form-row">
        <div class="sb-form-label">Metric</div>
        <select id="sbcMetric" class="sb-form-select" onchange="sbMetricChange()">
          <optgroup label="Price">
            <option value="current_price" ${m==='current_price'?'selected':''}>Current Price (live quote)</option>
            <option value="price"         ${m==='price'?'selected':''}>Price (daily bar series)</option>
            <option value="gap_pct"       ${m==='gap_pct'?'selected':''}>Gap % — today open vs prev close</option>
            <option value="change_pct"    ${m==='change_pct'?'selected':''}>Change % — day over day</option>
            <option value="roc"           ${m==='roc'?'selected':''}>ROC — Rate of Change (velocity)</option>
            <option value="volume"        ${m==='volume'?'selected':''}>Volume</option>
          </optgroup>
          <optgroup label="Indicators">
            <option value="sma"   ${m==='sma'?'selected':''}>SMA</option>
            <option value="ema"   ${m==='ema'?'selected':''}>EMA</option>
            <option value="rsi"   ${m==='rsi'?'selected':''}>RSI</option>
            <option value="macd"  ${m==='macd'?'selected':''}>MACD</option>
          </optgroup>
          <optgroup label="Options (ATM)">
            <option value="iv_rank" ${m==='iv_rank'?'selected':''}>IV% — implied volatility of ATM option</option>
            <option value="delta"   ${m==='delta'?'selected':''}>Delta — ATM option delta</option>
            <option value="theta"   ${m==='theta'?'selected':''}>Theta — ATM option theta</option>
          </optgroup>
        </select>
      </div>
      <div class="sb-form-row" id="sbcDayRow" style="${showDay?'':'display:none'}">
        <div class="sb-form-label">Day</div>
        ${_sel('sbcDay', String(day), DAY_OPTS, 'onchange="sbDayChange()"')}
      </div>
      <div class="sb-form-row" id="sbcIntervalRow" style="${showIntv?'':'display:none'}">
        <div class="sb-form-label">Bar Interval</div>
        ${_sel('sbcInterval', intv, INTV_OPTS, 'onchange="sbIntervalChange()"')}
      </div>
      <div class="sb-form-row" id="sbcSeriesRow" style="${showSer?'':'display:none'}">
        <div class="sb-form-label">Price Type</div>
        ${_sel('sbcSeries', ser, SER_OPTS)}
      </div>
      <div class="sb-form-row" id="sbcPeriodRow" style="${showP?'':'display:none'}">
        <div class="sb-form-label">Period</div>
        <input id="sbcPeriod" class="sb-form-input" type="number" min="1" max="500" value="${c.period||14}">
      </div>
      <div class="sb-form-row" id="sbcMacdShortRow" style="${showMacd?'':'display:none'}">
        <div class="sb-form-label">Fast Period</div>
        <input id="sbcMacdShort" class="sb-form-input" type="number" min="1" max="200" value="${c.macdShort||12}" placeholder="12">
      </div>
      <div class="sb-form-row" id="sbcMacdLongRow" style="${showMacd?'':'display:none'}">
        <div class="sb-form-label">Slow Period</div>
        <input id="sbcMacdLong" class="sb-form-input" type="number" min="1" max="500" value="${c.macdLong||26}" placeholder="26">
      </div>
      <div class="sb-form-row" id="sbcMacdSignalRow" style="${showMacd?'':'display:none'}">
        <div class="sb-form-label">Signal Period</div>
        <input id="sbcMacdSignal" class="sb-form-input" type="number" min="1" max="200" value="${c.macdSignal||9}" placeholder="9">
      </div>
      <div class="sb-form-row" id="sbcMacdCompRow" style="${showMacd?'':'display:none'}">
        <div class="sb-form-label">Component</div>
        ${_sel('sbcMacdComp', c.macdComponent||'histogram', [['histogram','Histogram'],['macd_line','MACD Line'],['signal_line','Signal Line']])}
      </div>
      <div class="sb-form-row" id="sbcOptTypeRow" style="${showOpts?'':'display:none'}">
        <div class="sb-form-label">Option Type</div>
        ${_sel('sbcOptType', c.optType||'call', [['call','Call'],['put','Put']])}
      </div>
      <div class="sb-form-row" id="sbcOptDteRow" style="${showOpts?'':'display:none'}">
        <div class="sb-form-label">Target DTE</div>
        <input id="sbcOptDte" class="sb-form-input" type="number" min="1" max="365" value="${c.optDte??30}" placeholder="30">
      </div>
      <div class="sb-form-row">
        <div class="sb-form-label">Operator</div>
        ${_sel('sbcOperator', op, OP_OPTS, 'onchange="sbOperatorChange()"')}
      </div>
      <div class="sb-form-row" id="sbcCompareTypeRow">
        <div class="sb-form-label">Compare Against</div>
        ${(()=>{
          const isLiveQuote = m === 'current_price';
          const ctOpts = [
            ['value',     'Fixed Value'],
            ...(!isLiveQuote ? [['price','Current Price']] : []),
            ...(!isLiveQuote ? [['bar_delta','Prior Bar (Δ)']] : []),
            ['indicator', 'Indicator'],
          ];
          const safeCt = ctOpts.some(o=>o[0]===ct) ? ct : 'value';
          return _sel('sbcCompareType', safeCt, ctOpts, 'onchange="sbCompareTypeChange()"');
        })()}
      </div>
      <div class="sb-form-row" id="sbcValueRow" style="${ct==='value'?'':'display:none'}">
        <div class="sb-form-label">Value</div>
        <input id="sbcMetricValue" class="sb-form-input" type="number" step="0.01" placeholder="e.g. 50" value="${c.value||''}">
      </div>
      <div class="sb-form-row" id="sbcBarOffsetRow" style="${ct==='bar_delta'?'':'display:none'}">
        <div class="sb-form-label">Bar Offset (N)</div>
        <input id="sbcBarOffset" class="sb-form-input" type="number" min="1" max="500" value="${c.barOffset||1}" placeholder="e.g. 15">
      </div>
      <div class="sb-form-row" id="sbcDeltaTypeRow" style="${ct==='bar_delta'?'':'display:none'}">
        <div class="sb-form-label">Change Type</div>
        ${_sel('sbcDeltaType', c.deltaType||'pct', [['pct','% Change'],['abs','Absolute Change']])}
      </div>
      <div class="sb-form-row" id="sbcDeltaThreshRow" style="${ct==='bar_delta'?'':'display:none'}">
        <div class="sb-form-label">Threshold</div>
        <input id="sbcDeltaThreshold" class="sb-form-input" type="number" step="0.01" placeholder="e.g. 1" value="${c.deltaThreshold!=null?c.deltaThreshold:1}">
      </div>
      <div class="sb-form-row" id="sbcWindowFromRow" style="${ct==='bar_delta'?'':'display:none'}">
        <div class="sb-form-label">Window From</div>
        <input id="sbcWindowFrom" class="sb-form-input" type="time" value="${c.windowFrom||''}" placeholder="12:00">
      </div>
      <div class="sb-form-row" id="sbcWindowToRow" style="${ct==='bar_delta'?'':'display:none'}">
        <div class="sb-form-label">Window To</div>
        <input id="sbcWindowTo" class="sb-form-input" type="time" value="${c.windowTo||''}" placeholder="15:00">
      </div>
      <div class="sb-form-row" id="sbcRefMetricRow" style="${showRef?'':'display:none'}">
        <div class="sb-form-label">Indicator</div>
        ${_sel('sbcRefMetric', refM, REF_METRICS, 'onchange="sbRefMetricChange()"')}
      </div>
      <div class="sb-form-row" id="sbcRefDayRow" style="${showRefDay?'':'display:none'}">
        <div class="sb-form-label">Indicator Day</div>
        ${_sel('sbcRefDay', String(refDay), DAY_OPTS, 'onchange="sbRefDayChange()"')}
      </div>
      <div class="sb-form-row" id="sbcRefIntervalRow" style="${showRefIntv?'':'display:none'}">
        <div class="sb-form-label">Indicator Interval</div>
        ${_sel('sbcRefInterval', refIntv, INTV_OPTS)}
      </div>
      <div class="sb-form-row" id="sbcRefSeriesRow" style="${showRefSer?'':'display:none'}">
        <div class="sb-form-label">Indicator Price Type</div>
        ${_sel('sbcRefSeries', refSer, SER_OPTS)}
      </div>
      <div class="sb-form-row" id="sbcRefPeriodRow" style="${showRefP?'':'display:none'}">
        <div class="sb-form-label">Indicator Period</div>
        <input id="sbcRefPeriod" class="sb-form-input" type="number" min="1" max="500" value="${c.comparePeriod||9}">
      </div>
      <div class="sb-form-row" id="sbcRefMacdShortRow" style="${showRefMacd?'':'display:none'}">
        <div class="sb-form-label">Ind. Fast Period</div>
        <input id="sbcRefMacdShort" class="sb-form-input" type="number" min="1" max="200" value="${c.refMacdShort||12}" placeholder="12">
      </div>
      <div class="sb-form-row" id="sbcRefMacdLongRow" style="${showRefMacd?'':'display:none'}">
        <div class="sb-form-label">Ind. Slow Period</div>
        <input id="sbcRefMacdLong" class="sb-form-input" type="number" min="1" max="500" value="${c.refMacdLong||26}" placeholder="26">
      </div>
      <div class="sb-form-row" id="sbcRefMacdSignalRow" style="${showRefMacd?'':'display:none'}">
        <div class="sb-form-label">Ind. Signal Period</div>
        <input id="sbcRefMacdSignal" class="sb-form-input" type="number" min="1" max="200" value="${c.refMacdSignal||9}" placeholder="9">
      </div>
      <div class="sb-form-row" id="sbcRefMacdCompRow" style="${showRefMacd?'':'display:none'}">
        <div class="sb-form-label">Ind. Component</div>
        ${_sel('sbcRefMacdComp', c.refMacdComponent||'histogram', [['histogram','Histogram'],['macd_line','MACD Line'],['signal_line','Signal Line']])}
      </div>
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid #eef0f3;">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:600;color:#334155;">
          <input type="checkbox" id="sbcAndEnabled" ${andEn?'checked':''} onchange="sbAndToggle()">
          Add concurrent AND condition (must be true on same bar)
        </label>
      </div>
      <div id="sbcAndBlock" style="${andEn?'':'display:none'}">
        <div class="sb-form-row" style="margin-top:8px;">
          <div class="sb-form-label">AND Metric</div>
          ${_sel('sbcAndMetric', andM, AND_METRICS, 'onchange="sbAndMetricChange()"')}
        </div>
        <div class="sb-form-row" id="sbcAndPeriodRow" style="${showAndP?'':'display:none'}">
          <div class="sb-form-label">AND Period</div>
          <input id="sbcAndPeriod" class="sb-form-input" type="number" min="1" max="500" value="${c.andPeriod||14}">
        </div>
        <div class="sb-form-row">
          <div class="sb-form-label">AND Operator</div>
          ${_sel('sbcAndOperator', c.andOperator||'<', AOPT_OPTS)}
        </div>
        <div class="sb-form-row">
          <div class="sb-form-label">AND Value</div>
          <input id="sbcAndValue" class="sb-form-input" type="number" step="0.01" placeholder="e.g. 30" value="${c.andValue||''}">
        </div>
      </div>
      <div style="margin-top:10px;">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:600;color:#334155;">
          <input type="checkbox" id="sbcSeqEnabled" ${seqEn?'checked':''} onchange="sbSeqToggle()">
          Follows previous step within N bars (sequential)
        </label>
      </div>
      <div id="sbcSeqBlock" style="${seqEn?'':'display:none'}">
        <div class="sb-form-row" style="margin-top:8px;">
          <div class="sb-form-label">Within N bars</div>
          <input id="sbcSeqBars" class="sb-form-input" type="number" min="1" max="500" value="${c.seqBars||5}" placeholder="5">
        </div>
      </div>`;
  }

  // ── Open Position ────────────────────────────────────────────────
  if (step.type === 'open_position') {
    const s  = c.strategy || 'Short Put Spread';
    const sm = c.strikeMethod || 'atm';
    const isIron     = _OP_IRON.includes(s);
    const isCal      = _OP_CALENDAR.includes(s);
    const isStraddle = _OP_STRADDLE.includes(s);
    const isStrangle = _OP_STRANGLE.includes(s);
    const isVertical = _OP_VERTICAL.includes(s);

    const isEquity   = _OP_EQUITY.includes(s);
    const strats = [
      ['Single Leg',            ['Long Call','Long Put','Naked Short Call','Naked Short Put']],
      ['Vertical Spreads',      ['Short Put Spread','Short Call Spread','Long Call Spread','Long Put Spread']],
      ['Iron Strategies',       ['Short Iron Condor','Short Iron Butterfly','Long Iron Butterfly','Long Iron Condor']],
      ['Straddles & Strangles', ['Long Straddle','Long Strangle','Short Straddle','Short Strangle']],
      ['Calendar & Diagonal',   ['Calendar Call Spread','Calendar Put Spread','Diagonal Call Spread','Diagonal Put Spread','Double Calendar','Double Diagonal']],
      ['Equity',                ['Buy Equity','Sell Equity Short']],
    ];
    const stratOpts = strats.map(([grp, items]) =>
      `<optgroup label="${grp}">${items.map(i => `<option value="${i}" ${s===i?'selected':''}>${i}</option>`).join('')}</optgroup>`
    ).join('');
    const otList = isEquity ? ['market','limit'] : ['credit','debit','market'];
    const otOpts = otList
      .map(t => `<option value="${t}" ${c.orderType===t?'selected':''}>${t.charAt(0).toUpperCase()+t.slice(1)}</option>`)
      .join('');

    const showStrikeVal  = !isStraddle && sm !== 'atm';
    const _smLbl = { pct_underlying:'% Distance from Underlying', dollar_underlying:'$ Distance from Underlying',
                     pct_leg:'% Distance from Another Leg', dollar_leg:'$ Distance from Another Leg', delta:'Target Delta' };
    const _smPh  = { pct_underlying:'5', dollar_underlying:'50', pct_leg:'5', dollar_leg:'50', delta:'0.30' };
    const strikeValLabel = _smLbl[sm] || '% Distance from Underlying';
    const strikeValPh    = _smPh[sm]  || '5';

    return `
      <div class="sb-form-row">
        <div class="sb-form-label">Symbol</div>
        <input id="sbcSymbol" class="sb-form-input" placeholder="e.g. SPX" value="${c.symbol||''}">
      </div>
      <div class="sb-form-row">
        <div class="sb-form-label">Strategy</div>
        <select id="sbcStrategy" class="sb-form-select" onchange="sbStrategyChange()">${stratOpts}</select>
      </div>

      <!-- Iron 4-leg diagram -->
      <div id="sbcIronDiagram" style="${isIron?'':'display:none'};padding:10px 12px;background:#f0f9ff;border-radius:8px;border:1px solid #bae6fd;margin:2px 0 4px;">
        <div style="font-size:11px;color:#0369a1;font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px;">4-Leg Structure</div>
        <div style="font-size:11px;color:#334155;display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
          <span style="background:#fee2e2;color:#b91c1c;padding:3px 8px;border-radius:4px;font-weight:700;">Long Put</span>
          <span style="color:#94a3b8;font-size:10px;">◀ put width ▶</span>
          <span style="background:#dcfce7;color:#15803d;padding:3px 8px;border-radius:4px;font-weight:700;">Short Put</span>
          <span style="color:#64748b;font-size:10px;font-weight:600;">ATM</span>
          <span style="background:#dcfce7;color:#15803d;padding:3px 8px;border-radius:4px;font-weight:700;">Short Call</span>
          <span style="color:#94a3b8;font-size:10px;">◀ call width ▶</span>
          <span style="background:#fee2e2;color:#b91c1c;padding:3px 8px;border-radius:4px;font-weight:700;">Long Call</span>
        </div>
      </div>

      <!-- DTE: standard (hidden for calendar/diagonal) -->
      <div class="sb-form-row" id="sbcDteRow" style="${isCal?'display:none':''}">
        <div class="sb-form-label">DTE — Days to Expiration</div>
        <input id="sbcDte" class="sb-form-input" type="number" min="0" max="365" value="${c.dte??30}" placeholder="30">
      </div>
      <!-- Front/Back DTE (calendar/diagonal only) -->
      <div class="sb-form-row" id="sbcFrontDteRow" style="${isCal?'':'display:none'}">
        <div class="sb-form-label">Front Leg DTE — near expiry</div>
        <input id="sbcFrontDte" class="sb-form-input" type="number" min="0" max="365" value="${c.frontDte??7}" placeholder="7">
      </div>
      <div class="sb-form-row" id="sbcBackDteRow" style="${isCal?'':'display:none'}">
        <div class="sb-form-label">Back Leg DTE — far expiry</div>
        <input id="sbcBackDte" class="sb-form-input" type="number" min="0" max="365" value="${c.backDte??30}" placeholder="30">
      </div>

      <!-- Strike selection (hidden for straddle: always ATM) -->
      <div class="sb-form-row" id="sbcStrikeRow" style="${isStraddle?'display:none':''}">
        <div class="sb-form-label" id="sbcStrikeRowLabel">Strike Selection${isIron?' — short legs':''}</div>
        <select id="sbcStrikeMethod" class="sb-form-select" onchange="sbStrikeMethodChange()">
          <option value="atm"               ${sm==='atm'?'selected':''}>1. ATM — At the Money</option>
          <option value="pct_underlying"    ${sm==='pct_underlying'?'selected':''}>2. % Distance from Underlying</option>
          <option value="dollar_underlying" ${sm==='dollar_underlying'?'selected':''}>3. $ Distance from Underlying</option>
          <option value="pct_leg"           ${sm==='pct_leg'?'selected':''}>4. % Distance from Another Leg</option>
          <option value="dollar_leg"        ${sm==='dollar_leg'?'selected':''}>5. $ Distance from Another Leg</option>
          <option value="delta"             ${sm==='delta'?'selected':''}>6. Delta-based Strike Selection</option>
        </select>
      </div>
      <div class="sb-form-row" id="sbcStrikeValRow" style="${showStrikeVal?'':'display:none'}">
        <div class="sb-form-label" id="sbcStrikeValLabel">${strikeValLabel}</div>
        <input id="sbcStrikeValue" class="sb-form-input" type="number" step="0.01" value="${c.strikeValue||''}" placeholder="${strikeValPh}">
      </div>

      <!-- Leg 2 strike config (vertical spreads only) -->
      ${(()=>{
        const l2m = c.leg2StrikeMethod || 'spread_width';
        const l2v = c.leg2StrikeValue  || '';
        const l2d = c.leg2Direction    || 'below';
        const distMethods = ['pct_underlying','dollar_underlying','pct_leg1','dollar_leg1'];
        const l2ShowSpread = l2m === 'spread_width';
        const l2ShowVal    = !['spread_width','atm'].includes(l2m);
        const l2ShowDir    = distMethods.includes(l2m);
        const l2Labels = { pct_underlying:'% Distance from Underlying',
          dollar_underlying:'$ Distance from Underlying',
          pct_leg1:'% Distance from Leg 1', dollar_leg1:'$ Distance from Leg 1',
          delta:'Target Delta', fixed_strike:'Fixed Strike ($)' };
        const l2Ph = { pct_underlying:'5', dollar_underlying:'10',
          pct_leg1:'5', dollar_leg1:'5', delta:'0.30', fixed_strike:'500' };
        return `
        <div id="sbcLeg2Section" style="${isVertical?'':'display:none'}">
          <div style="font-size:10.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;padding:10px 0 4px;border-top:1px solid #f0f3f7;margin-top:6px;">
            Leg 2 — Strike Configuration
          </div>
          <div class="sb-form-row">
            <div class="sb-form-label">Leg 2 Method</div>
            <select id="sbcLeg2Method" class="sb-form-select" onchange="sbLeg2MethodChange()">
              <option value="spread_width"     ${l2m==='spread_width'?'selected':''}>1. Spread Width from Leg 1</option>
              <option value="atm"              ${l2m==='atm'?'selected':''}>2. ATM</option>
              <option value="delta"            ${l2m==='delta'?'selected':''}>3. Target Delta</option>
              <option value="pct_underlying"   ${l2m==='pct_underlying'?'selected':''}>4. % Distance from Underlying</option>
              <option value="dollar_underlying"${l2m==='dollar_underlying'?'selected':''}>5. $ Distance from Underlying</option>
              <option value="pct_leg1"         ${l2m==='pct_leg1'?'selected':''}>6. % Distance from Leg 1</option>
              <option value="dollar_leg1"      ${l2m==='dollar_leg1'?'selected':''}>7. $ Distance from Leg 1</option>
              <option value="fixed_strike"     ${l2m==='fixed_strike'?'selected':''}>8. Fixed Strike</option>
            </select>
          </div>
          <div class="sb-form-row" id="sbcLeg2SpreadRow" style="${l2ShowSpread?'':'display:none'}">
            <div class="sb-form-label">Spread Width — $ per leg</div>
            <input id="sbcLeg2SpreadWidth" class="sb-form-input" type="number" min="0.5" step="0.5" value="${c.spreadWidth||5}" placeholder="5">
          </div>
          <div class="sb-form-row" id="sbcLeg2ValueRow" style="${l2ShowVal?'':'display:none'}">
            <div class="sb-form-label" id="sbcLeg2ValueLabel">${l2Labels[l2m]||'Value'}</div>
            <input id="sbcLeg2Value" class="sb-form-input" type="number" step="0.01" value="${l2v}" placeholder="${l2Ph[l2m]||'5'}">
          </div>
          <div class="sb-form-row" id="sbcLeg2DirRow" style="${l2ShowDir?'':'display:none'}">
            <div class="sb-form-label">Direction</div>
            <select id="sbcLeg2Dir" class="sb-form-select">
              <option value="below" ${l2d==='below'?'selected':''}>Below Leg 1 / Below Underlying</option>
              <option value="above" ${l2d==='above'?'selected':''}>Above Leg 1 / Above Underlying</option>
            </select>
          </div>
        </div>`;
      })()}

      <!-- Spread Width (strangles only) -->
      <div class="sb-form-row" id="sbcSpreadWidthRow" style="${isStrangle?'':'display:none'}">
        <div class="sb-form-label">Spread Width — $ per leg</div>
        <input id="sbcSpreadWidth" class="sb-form-input" type="number" min="0.5" step="0.5" value="${c.spreadWidth||5}" placeholder="5">
      </div>

      <!-- Call Wing + Put Wing (iron strategies only) -->
      <div class="sb-form-row" id="sbcCallWidthRow" style="${isIron?'':'display:none'}">
        <div class="sb-form-label">Call Wing Width — $ (short call → long call)</div>
        <input id="sbcCallWidth" class="sb-form-input" type="number" min="0.5" step="0.5" value="${c.callWidth||5}" placeholder="5">
      </div>
      <div class="sb-form-row" id="sbcPutWidthRow" style="${isIron?'':'display:none'}">
        <div class="sb-form-label">Put Wing Width — $ (short put → long put)</div>
        <input id="sbcPutWidth" class="sb-form-input" type="number" min="0.5" step="0.5" value="${c.putWidth||5}" placeholder="5">
      </div>

      <!-- TP / SL (options only) -->
      <div class="sb-form-row" id="sbcTpRow" style="${isEquity?'display:none':''}">
        <div class="sb-form-label">Take Profit — % of max profit</div>
        <input id="sbcTakeProfitPct" class="sb-form-input" type="number" min="0" max="100" step="1" value="${c.takeProfitPct||50}" placeholder="50">
      </div>
      <div class="sb-form-row" id="sbcSlRow" style="${isEquity?'display:none':''}">
        <div class="sb-form-label">Stop Loss — % of max loss</div>
        <input id="sbcStopLossPct" class="sb-form-input" type="number" min="0" step="1" value="${c.stopLossPct||200}" placeholder="200">
      </div>
      <!-- Quantity label adapts: "contracts" for options, "shares" for equity -->
      <div class="sb-form-row">
        <div class="sb-form-label">Quantity — ${isEquity?'shares':'contracts'}</div>
        <input id="sbcQty" class="sb-form-input" type="number" min="1" value="${c.quantity||1}" placeholder="${isEquity?'100':'1'}">
      </div>
      <div class="sb-form-row">
        <div class="sb-form-label">Order Type</div>
        <select id="sbcOrderType" class="sb-form-select" onchange="sbOrderTypeChange()">${otOpts}</select>
      </div>
      <!-- Limit Price (equity + limit order only) -->
      <div class="sb-form-row" id="sbcEquityLimitRow" style="${isEquity && c.orderType==='limit'?'':'display:none'}">
        <div class="sb-form-label">Limit Price</div>
        <input id="sbcLimitPrice" class="sb-form-input" type="number" step="0.01" min="0" value="${c.limitPrice||''}" placeholder="0.00">
      </div>
      <div class="sb-form-row">
        <div class="sb-form-label">Tag — position label (optional)</div>
        <input id="sbcTag" class="sb-form-input" placeholder="e.g. LC, IC-1, hedge" value="${_escHtml(c.tag||'')}">
      </div>`;
  }

  // ── Close Position ───────────────────────────────────────────────
  if (step.type === 'close_position') {
    return `
      <div class="sb-form-row">
        <div class="sb-form-label">Target Positions</div>
        <select id="sbcTarget" class="sb-form-select">
          <option value="all"        ${c.target==='all'?'selected':''}>All open positions</option>
          <option value="profitable" ${c.target==='profitable'?'selected':''}>Profitable positions only</option>
          <option value="losers"     ${c.target==='losers'?'selected':''}>Losing positions only</option>
        </select>
      </div>
      <div class="sb-form-row">
        <div class="sb-form-label">Position with Tag — leave blank to match all</div>
        <input id="sbcCloseTag" class="sb-form-input" placeholder="e.g. IC-1, hedge" value="${_escHtml(c.tag||'')}">
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

  // ── Condition (guard gate) ────────────────────────────────────────
  if (step.type === 'condition') {
    const ct  = c.conditionType || 'position_count';
    const op  = c.operator || '<';
    const isPnl = ct === 'unrealized_pnl';
    const valLbl = isPnl ? 'P&L threshold ($)' : 'Count threshold';
    const valPh  = isPnl ? '-500' : '1';
    return `
      <!-- What to check -->
      <div class="sb-form-row">
        <div class="sb-form-label">Check</div>
        <select id="sbcCondType" class="sb-form-select" onchange="sbConditionTypeChange()">
          <optgroup label="Positions">
            <option value="position_count" ${ct==='position_count'?'selected':''}>Open position count</option>
            <option value="daily_opens"    ${ct==='daily_opens'?'selected':''}>Positions opened today</option>
            <option value="unrealized_pnl" ${ct==='unrealized_pnl'?'selected':''}>Unrealized P&amp;L ($)</option>
            <option value="closed_today"   ${ct==='closed_today'?'selected':''}>Positions closed today</option>
          </optgroup>
          <optgroup label="Orders">
            <option value="open_orders"     ${ct==='open_orders'?'selected':''}>Open order count</option>
            <option value="canceled_orders" ${ct==='canceled_orders'?'selected':''}>Orders canceled today</option>
          </optgroup>
        </select>
      </div>
      <!-- Tag filter (positions only) -->
      <div class="sb-form-row" id="sbcCondTagRow" style="${['open_orders','canceled_orders'].includes(ct)?'display:none':''}">
        <div class="sb-form-label">Tag filter — leave blank to check all positions</div>
        <input id="sbcCondTag" class="sb-form-input" placeholder="e.g. LC, IC-1" value="${_escHtml(c.tag||'')}">
      </div>
      <!-- Operator -->
      <div class="sb-form-row">
        <div class="sb-form-label">Is</div>
        <select id="sbcCondOp" class="sb-form-select">
          <option value="<"  ${op==='<' ?'selected':''}>&#60; less than</option>
          <option value="<=" ${op==='<='?'selected':''}>&#8804; less than or equal to</option>
          <option value="="  ${op==='=' ?'selected':''}>= equal to</option>
          <option value=">=" ${op==='>='?'selected':''}>&#8805; greater than or equal to</option>
          <option value=">"  ${op==='>' ?'selected':''}>&#62; greater than</option>
        </select>
      </div>
      <!-- Threshold value -->
      <div class="sb-form-row">
        <div class="sb-form-label" id="sbcCondValLabel">${valLbl}</div>
        <input id="sbcCondValue" class="sb-form-input" type="number" step="any"
               value="${c.value??1}" placeholder="${valPh}">
      </div>
      <!-- Info box -->
      <div style="padding:10px 12px;background:#ecfeff;border-radius:8px;border:1px solid #a5f3fc;font-size:12px;color:#0e7490;margin:6px 0 2px;">
        <i class="fas fa-code-branch" style="margin-right:6px;"></i>
        If this condition is <strong>true</strong>, the automation continues to the next step.
        If <strong>false</strong>, execution stops for this polling tick — no trade is placed.
      </div>`;
  }

  return `<p style="color:#9098a9;font-size:13px;">No configuration needed for this step type.</p>`;
}

// ── Strategies list (dashboard card) ──────────────────────────────
async function strategiesRender() {
  const body = document.getElementById('botStrategiesBody');
  if (!body) return;
  try {
    _sbStratCache = await _apiStrategies();
  } catch { _sbStratCache = []; }
  if (!_sbStratCache.length) {
    body.innerHTML = `<div class="bot-empty" style="padding:28px 20px;">
      <i class="fas fa-robot" style="font-size:28px;margin-bottom:8px;display:block;color:#dee2e6;"></i>
      No strategies yet. Click <strong>+ New Strategy</strong> to create one.
    </div>`;
    return;
  }
  body.innerHTML = `<div class="strat-list">${_sbStratCache.map(s => stratItemHTML(s)).join('')}</div>`;
}

function stratItemHTML(s) {
  const stepsLabel = s.steps?.length ? `${s.steps.length} step${s.steps.length!==1?'s':''}` : 'No steps';
  const isLive  = s.is_live;
  const created = s.created_at ? new Date(s.created_at).toLocaleDateString() : '';
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
          <input type="checkbox" ${isLive?'checked':''} onchange="stratToggle(${s.id},this.checked)">
          <span class="strat-toggle-slider"></span>
        </label>
      </div>
      <button class="strat-test-btn" onclick="openTestModal(${s.id})" title="Run Test"><i class="fas fa-play"></i></button>
      <button class="strat-edit-btn" onclick="stratBuilderOpen(${s.id})" title="Edit"><i class="fas fa-pen"></i></button>
      <button class="strat-del-btn" onclick="stratDelete(${s.id})" title="Delete"><i class="fas fa-trash"></i></button>
    </div>
  </div>`;
}

async function stratToggle(id, isLive) {
  const lbl = document.getElementById('stratLabel_' + id);
  if (lbl) { lbl.textContent = isLive ? 'Live' : 'Off'; lbl.className = 'strat-toggle-label ' + (isLive ? 'live' : 'off'); }
  const cached = _sbStratCache.find(x => x.id == id);
  if (cached) cached.is_live = isLive;
  try {
    await fetch(`/api/bot/strategies/${id}/live`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_live: isLive }),
    });
  } catch (e) { console.error('stratToggle error', e); }
}

async function stratDelete(id) {
  if (!confirm('Delete this strategy?')) return;
  try {
    await fetch(`/api/bot/strategies/${id}`, { method: 'DELETE' });
  } catch (e) { console.error('stratDelete error', e); }
  await strategiesRender();
}

function _escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Test Automation Modal ─────────────────────────────────────────────────

let _testStratId = null;

function _ensureTestModal() {
  if (document.getElementById('testAutomationOverlay')) return;
  const css = `
    #testAutomationOverlay {
      position:fixed;inset:0;z-index:3000;
      display:flex;align-items:center;justify-content:center;
      background:rgba(15,23,42,0.55);
    }
    .test-modal-card {
      background:#fff;border-radius:16px;width:520px;max-width:94vw;
      max-height:88vh;overflow:hidden;display:flex;flex-direction:column;
      box-shadow:0 20px 60px rgba(0,0,0,0.22);
    }
    .test-modal-header {
      display:flex;align-items:center;justify-content:space-between;
      padding:18px 22px 14px;border-bottom:1px solid #f0f3f7;
    }
    .test-modal-header h3 { margin:0;font-size:17px;font-weight:700;color:#1e293b; }
    .test-modal-close {
      background:none;border:1px solid #e2e8f0;border-radius:8px;
      width:32px;height:32px;cursor:pointer;color:#64748b;font-size:14px;
      display:flex;align-items:center;justify-content:center;
    }
    .test-modal-close:hover { background:#f8fafc; }
    .test-modal-body { padding:24px 22px;overflow-y:auto;flex:1; }
    .test-field-label {
      font-size:11.5px;font-weight:600;color:#64748b;letter-spacing:.06em;
      text-transform:uppercase;margin-bottom:7px;
    }
    .test-bot-row {
      display:flex;align-items:center;gap:8px;margin-bottom:20px;
    }
    .test-bot-select {
      flex:1;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:9px;
      font-size:14px;color:#1e293b;background:#fff;outline:none;
    }
    .test-bot-select:focus { border-color:#3b82f6; }
    .test-prevent-row {
      display:flex;align-items:flex-start;gap:10px;padding:14px 16px;
      background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;
      margin-bottom:22px;
    }
    .test-prevent-check { margin-top:2px;accent-color:#16a34a;width:16px;height:16px;cursor:pointer;flex-shrink:0; }
    .test-prevent-text strong { color:#15803d;font-size:14px; }
    .test-prevent-text p { margin:4px 0 0;font-size:12.5px;color:#4b5563; }
    .test-start-btn {
      width:100%;padding:12px;background:#3b82f6;color:#fff;border:none;
      border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;
      display:flex;align-items:center;justify-content:center;gap:8px;
    }
    .test-start-btn:hover { background:#2563eb; }
    .test-start-btn:disabled { background:#94a3b8;cursor:not-allowed; }
    /* ── Automation Log view ── */
    .test-log-header {
      display:flex;align-items:center;gap:8px;
      padding:16px 22px 13px;border-bottom:1px solid #f0f3f7;
    }
    .test-log-back {
      background:none;border:none;cursor:pointer;color:#3b82f6;
      font-size:18px;padding:2px 6px 2px 0;
    }
    .test-log-back:hover { color:#1d4ed8; }
    .test-log-title { font-size:17px;font-weight:700;color:#1e293b;flex:1; }
    .test-log-body { padding:20px 22px;overflow-y:auto;flex:1; }
    .test-log-ts { text-align:center;color:#94a3b8;font-size:12.5px;margin-bottom:4px; }
    .test-flow { display:flex;flex-direction:column;align-items:center; }
    .test-flow-arrow {
      color:#94a3b8;font-size:18px;line-height:1;margin:2px 0;
    }
    .test-flow-label {
      font-size:11.5px;font-weight:600;color:#64748b;margin:2px 0 1px;
    }
    .test-flow-start, .test-flow-end {
      font-size:13px;color:#64748b;font-weight:500;margin:4px 0;
    }
    .test-step-box {
      width:100%;max-width:380px;border-radius:10px;padding:12px 14px;
      border:1.5px solid #e2e8f0;background:#fff;position:relative;
      box-shadow:0 1px 4px rgba(0,0,0,0.06);
    }
    .test-step-box.pass { border-color:#bbf7d0;background:#f0fdf4; }
    .test-step-box.fail { border-color:#fecaca;background:#fef2f2; }
    .test-step-box.skipped { border-color:#fed7aa;background:#fff7ed; }
    .test-step-box.unreached { border-color:#e2e8f0;background:#f8fafc;opacity:.6; }
    .test-step-label { font-size:13.5px;font-weight:500;color:#1e293b;line-height:1.4; }
    .test-step-msg { font-size:12px;color:#64748b;margin-top:5px;line-height:1.4; }
    .test-step-msg.skipped-msg { color:#ea580c;font-style:italic; }
    .test-step-badge {
      position:absolute;top:10px;right:12px;width:22px;height:22px;
      border-radius:50%;display:flex;align-items:center;justify-content:center;
      font-size:11px;font-weight:700;flex-shrink:0;
    }
    .test-step-badge.pass { background:#16a34a;color:#fff; }
    .test-step-badge.fail { background:#dc2626;color:#fff; }
    .test-step-badge.skipped { background:#ea580c;color:#fff; }
    .test-step-badge.warn { background:#d97706;color:#fff; }
    .test-step-badge.unreached { background:#94a3b8;color:#fff; }
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  const el = document.createElement('div');
  el.id = 'testAutomationOverlay';
  el.style.display = 'none';
  el.innerHTML = `
    <div class="test-modal-card">
      <!-- VIEW 1: Setup -->
      <div id="testSetupView">
        <div class="test-modal-header">
          <h3>Test Automation</h3>
          <button class="test-modal-close" onclick="closeTestModal()"><i class="fas fa-times"></i></button>
        </div>
        <div class="test-modal-body">
          <div class="test-field-label">Bot to run test</div>
          <div class="test-bot-row">
            <select id="testBotSelect" class="test-bot-select"></select>
          </div>
          <div class="test-prevent-row">
            <input type="checkbox" id="testPreventCheck" class="test-prevent-check" checked>
            <div class="test-prevent-text">
              <strong>Prevent automation from modifying bot</strong>
              <p>Your bot (positions, tags, etc) will <strong>not</strong> be modified during this test.<br>
              Uncheck to allow the automation full access to open/close positions, modify tags, set exit options, etc.</p>
            </div>
          </div>
          <button class="test-start-btn" id="testStartBtn" onclick="startTest()">
            <i class="fas fa-play"></i> Start Test
          </button>
        </div>
      </div>
      <!-- VIEW 2: Automation Log -->
      <div id="testLogView" style="display:none;flex-direction:column;flex:1;overflow:hidden;">
        <div class="test-log-header">
          <button class="test-log-back" onclick="testShowSetup()"><i class="fas fa-arrow-left"></i></button>
          <span class="test-log-title">Automation Log</span>
          <button class="test-modal-close" onclick="closeTestModal()"><i class="fas fa-times"></i></button>
        </div>
        <div class="test-log-body" id="testLogBody"></div>
      </div>
    </div>`;
  document.body.appendChild(el);
}

function openTestModal(sid) {
  _ensureTestModal();
  _testStratId = sid;
  const sel = document.getElementById('testBotSelect');
  sel.innerHTML = '';
  const s = _sbStratCache.find(x => x.id == sid);
  if (s) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    sel.appendChild(opt);
  }
  testShowSetup();
  const overlay = document.getElementById('testAutomationOverlay');
  overlay.style.display = 'flex';
}

function closeTestModal() {
  const overlay = document.getElementById('testAutomationOverlay');
  if (overlay) overlay.style.display = 'none';
}

function testShowSetup() {
  document.getElementById('testSetupView').style.display = '';
  document.getElementById('testLogView').style.display = 'none';
  const btn = document.getElementById('testStartBtn');
  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-play"></i> Start Test';
}

async function startTest() {
  if (!_testStratId) return;
  const dry_run = document.getElementById('testPreventCheck').checked;
  const btn = document.getElementById('testStartBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running…';
  try {
    const r = await fetch(`/api/bot/strategies/${_testStratId}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dry_run }),
    });
    const data = await r.json();
    if (!r.ok) {
      alert(data.error || 'Test failed');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-play"></i> Start Test';
      return;
    }
    renderAutomationLog(data, dry_run);
  } catch (e) {
    alert('Network error running test');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-play"></i> Start Test';
  }
}

function renderAutomationLog(data, dry_run) {
  document.getElementById('testSetupView').style.display = 'none';
  const logView = document.getElementById('testLogView');
  logView.style.display = 'flex';

  const ICONS = {
    time:           'fas fa-clock',
    condition:      'fas fa-filter',
    metric:         'fas fa-chart-line',
    open_position:  'fas fa-folder-open',
    close_position: 'fas fa-times-circle',
    notification:   'fas fa-bell',
    tags:           'fas fa-tag',
    error:          'fas fa-exclamation-triangle',
  };

  function _stepBadge(result) {
    if (result === true)       return '<span class="test-step-badge pass"><i class="fas fa-check"></i></span>';
    if (result === false)      return '<span class="test-step-badge fail"><i class="fas fa-times"></i></span>';
    if (result === 'skipped')  return '<span class="test-step-badge skipped"><i class="fas fa-forward"></i></span>';
    return '<span class="test-step-badge unreached"><i class="fas fa-minus"></i></span>';
  }

  function _stepClass(result) {
    if (result === true)      return 'pass';
    if (result === false)     return 'fail';
    if (result === 'skipped') return 'skipped';
    return 'unreached';
  }

  function _branchLabel(result, nextStep) {
    if (result === true)  return '<div class="test-flow-label">Yes</div>';
    if (result === false) return '<div class="test-flow-label">No</div>';
    return '';
  }

  const steps = data.steps || [];
  let flowHtml = `
    <div class="test-log-ts">${_escHtml(data.started_at || '')}</div>
    <div class="test-flow">
      <div class="test-flow-start">Start test</div>
      <div class="test-flow-arrow">↓</div>`;

  steps.forEach((step, i) => {
    const cls  = _stepClass(step.result);
    const icon = ICONS[step.type] || 'fas fa-cog';
    const isAction = step.type === 'open_position' || step.type === 'close_position';
    const msgCls   = step.result === 'skipped' ? 'skipped-msg' : '';
    const msgIcon  = step.result === 'skipped' ? '<i class="fas fa-info-circle" style="color:#ea580c;"></i> ' : '';

    flowHtml += `
      <div class="test-step-box ${cls}" style="position:relative;padding-right:44px;">
        ${_stepBadge(step.result)}
        <div class="test-step-label"><i class="${icon}" style="margin-right:6px;opacity:.6;font-size:12px;"></i>${_escHtml(step.label || step.type)}</div>
        ${step.message ? `<div class="test-step-msg ${msgCls}">${msgIcon}${_escHtml(step.message)}</div>` : ''}
      </div>`;

    if (i < steps.length - 1) {
      flowHtml += `<div class="test-flow-arrow">↓</div>`;
      if (step.result === true && !isAction) {
        flowHtml += `<div class="test-flow-label">Yes</div><div class="test-flow-arrow">↓</div>`;
      } else if (step.result === false) {
        flowHtml += `<div class="test-flow-label">No</div><div class="test-flow-arrow">↓</div>`;
      }
    }
  });

  if (steps.length) flowHtml += `<div class="test-flow-arrow">↓</div>`;
  flowHtml += `<div class="test-flow-end">End</div></div>`;

  document.getElementById('testLogBody').innerHTML = flowHtml;
}
