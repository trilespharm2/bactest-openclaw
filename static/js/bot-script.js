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
let _npRefreshTimer = null;   // auto-refresh timer when payoff is visible

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
function botLoadAll() { botLoadBalances(); botLoadPositions(); botLoadOrders(); strategiesRender(); botChartInit(); }

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
const OCC_RE = /^([A-Z0-9]{1,6})(\d{6})([CP])(\d{8})$/;
function _parseOcc(sym) {
  const m = sym.match(OCC_RE);
  if (!m) return null;
  const [, under, ymd, oType, strikePad] = m;
  return {
    under,
    expiry : `20${ymd.slice(0,2)}-${ymd.slice(2,4)}-${ymd.slice(4,6)}`,
    oType,
    strike : parseFloat(strikePad) / 1000
  };
}
function _inferSpreadName(legs) {
  const types  = [...new Set(legs.map(l => l._opt.oType))];
  const hasPut  = types.includes('P');
  const hasCall = types.includes('C');
  const shorts = legs.filter(l => parseFloat(l.quantity) < 0);
  const longs  = legs.filter(l => parseFloat(l.quantity) > 0);
  if (hasPut && hasCall) return legs.length >= 4 ? 'Iron Condor / Butterfly' : 'Strangle / Straddle';
  if (legs.length === 1) {
    const isShort = parseFloat(legs[0].quantity) < 0;
    return (isShort ? 'Short ' : 'Long ') + (hasPut ? 'Put' : 'Call');
  }
  if (legs.length === 2 && shorts.length === 1 && longs.length === 1) {
    const sStrike = shorts[0]._opt.strike, lStrike = longs[0]._opt.strike;
    if (hasPut)  return sStrike > lStrike ? 'Short Put Spread'  : 'Long Put Spread';
    if (hasCall) return sStrike < lStrike ? 'Short Call Spread' : 'Long Call Spread';
  }
  if (hasPut)  return shorts.length > longs.length ? 'Short Put Spread'  : 'Long Put Spread';
  if (hasCall) return shorts.length > longs.length ? 'Short Call Spread' : 'Long Call Spread';
  return 'Spread';
}
function _fmtStrike(s) { return s === Math.floor(s) ? s.toLocaleString() : s.toFixed(1); }
function _fmtExpiry(d) {
  const dt = new Date(d + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const dte = Math.round((dt - today) / 86400000);
  const dateStr = dt.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  return `${dateStr} <span style="color:#94a3b8;font-size:10px;">(${dte}d)</span>`;
}
function _posPnlHtml(pnl, costBasis) {
  if (pnl === null) return '<span style="color:#94a3b8;">—</span>';
  const sign = pnl >= 0 ? '+' : '';
  const color = pnl > 0 ? '#22c55e' : pnl < 0 ? '#ef4444' : '#64748b';
  const pct  = costBasis !== 0 ? ` (${sign}${(pnl / Math.abs(costBasis) * 100).toFixed(1)}%)` : '';
  return `<span style="color:${color};font-weight:600;">${sign}${_fmt$(pnl)}</span><span style="color:${color};font-size:11px;">${pct}</span>`;
}

async function botLoadPositions() {
  const body = document.getElementById('botPositionsBody');
  if (!body) return;
  body.innerHTML = '<div class="bot-empty py-4"><i class="fas fa-spinner fa-spin"></i> Loading…</div>';
  try {
    // 1. Fetch positions
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

    // 2. Batch-fetch quotes for all symbols
    let quoteMap = {};
    try {
      const syms = positions.map(p => p.symbol).join(',');
      const qr   = await fetch(`/api/bot/tradier/quote?symbol=${encodeURIComponent(syms)}`);
      const qd   = await qr.json();
      const qRaw = qd?.quotes?.quote;
      const qArr = !qRaw ? [] : (Array.isArray(qRaw) ? qRaw : [qRaw]);
      qArr.forEach(q => { quoteMap[q.symbol] = q; });
    } catch (_) { /* quotes unavailable — P&L will show — */ }

    // 3. Group: equity stays solo, options group by underlying+expiry
    const groups = {};
    const groupOrder = [];
    positions.forEach(p => {
      const opt = _parseOcc(p.symbol);
      const key = opt ? `OPT:${opt.under}:${opt.expiry}` : `EQ:${p.symbol}`;
      if (!groups[key]) {
        groups[key] = opt
          ? { kind:'option', under:opt.under, expiry:opt.expiry, legs:[] }
          : { kind:'equity', symbol:p.symbol, legs:[] };
        groupOrder.push(key);
      }
      groups[key].legs.push(opt ? { ...p, _opt: opt } : p);
    });

    // 4. Render
    const _f  = v => parseFloat(v) || 0;
    const _mk = q => q ? (_f(q.last) || _f(q.close) || _f(q.bid+q.ask)/2) : null;

    let html = '<div style="display:flex;flex-direction:column;">';

    groupOrder.forEach((key, gi) => {
      const g     = groups[key];
      const notLast = gi < groupOrder.length - 1;
      const sep   = notLast ? 'border-bottom:1px solid #f1f5f9;' : '';

      if (g.kind === 'equity') {
        const p   = g.legs[0];
        const q   = quoteMap[p.symbol];
        const mk  = _mk(q);
        const pnl = mk !== null ? mk * _f(p.quantity) - _f(p.cost_basis) : null;
        html += `
        <div style="display:grid;grid-template-columns:40px 1fr auto auto auto auto;align-items:center;gap:16px;padding:14px 16px;${sep}">
          <div style="width:36px;height:36px;border-radius:8px;background:#eff6ff;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i class="fas fa-chart-bar" style="color:#3b82f6;font-size:13px;"></i>
          </div>
          <div>
            <div style="font-weight:700;font-size:14px;color:#0f172a;">${p.symbol}</div>
            <div style="font-size:11px;color:#64748b;margin-top:1px;">Equity · ${p.quantity} share${Math.abs(_f(p.quantity))!==1?'s':''} · ${p.date_acquired?p.date_acquired.split('T')[0]:'—'}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px;">Cost</div>
            <div style="font-weight:600;font-size:13px;color:#334155;">${_fmt$(p.cost_basis)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px;">Mark</div>
            <div style="font-weight:600;font-size:13px;color:#334155;">${mk !== null ? _fmt$(mk) : '—'}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px;">Unrlzd P&L</div>
            <div>${_posPnlHtml(pnl, _f(p.cost_basis))}</div>
          </div>
          <div style="width:24px;"></div>
        </div>`;
      } else {
        // Options group
        const legs      = g.legs.slice().sort((a,b) => a._opt.strike - b._opt.strike);
        const spreadName = _inferSpreadName(legs);
        const strikes   = legs.map(l => `${_fmtStrike(l._opt.strike)}${l._opt.oType}`).join(' / ');
        const gid       = `posGrp_${gi}`;

        let totalCost = 0, totalMktVal = 0, hasQ = false;
        legs.forEach(l => {
          const q  = quoteMap[l.symbol];
          const mk = _mk(q);
          totalCost += _f(l.cost_basis);
          if (mk !== null) { hasQ = true; totalMktVal += mk * _f(l.quantity) * 100; }
        });
        const spreadPnl = hasQ ? totalMktVal - totalCost : null;

        // Spread color band
        const isShortSpread = spreadName.startsWith('Short');
        const iconBg  = isShortSpread ? '#fef2f2' : '#f0fdf4';
        const iconClr = isShortSpread ? '#ef4444'  : '#22c55e';

        html += `
        <div style="${sep}">
          <div style="display:grid;grid-template-columns:40px 1fr auto auto auto auto;align-items:center;gap:16px;padding:14px 16px;cursor:pointer;transition:background .15s;" onclick="botTogglePosGroup('${gid}')"
               onmouseenter="this.style.background='#f8fafc'" onmouseleave="this.style.background=''">
            <div style="width:36px;height:36px;border-radius:8px;background:${iconBg};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <i class="fas fa-layer-group" style="color:${iconClr};font-size:13px;"></i>
            </div>
            <div>
              <div style="font-weight:700;font-size:14px;color:#0f172a;">${g.under} — ${spreadName}</div>
              <div style="font-size:11px;color:#64748b;margin-top:1px;">${strikes} · Exp ${_fmtExpiry(g.expiry)} · ${legs.length} leg${legs.length>1?'s':''}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px;">Net Cost</div>
              <div style="font-weight:600;font-size:13px;color:#334155;">${_fmt$(totalCost)}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px;">Net Mkt Val</div>
              <div style="font-weight:600;font-size:13px;color:#334155;">${hasQ ? _fmt$(totalMktVal) : '—'}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px;">Unrlzd P&L</div>
              <div>${_posPnlHtml(spreadPnl, totalCost)}</div>
            </div>
            <div style="text-align:center;width:24px;">
              <i id="${gid}_icon" class="fas fa-chevron-down" style="color:#94a3b8;font-size:11px;transition:transform .2s;"></i>
            </div>
          </div>
          <div id="${gid}" style="display:none;background:#f8fafc;border-top:1px solid #f1f5f9;">
            <div style="overflow-x:auto;">
              <table class="bot-table" style="margin:0;">
                <thead><tr><th>Symbol</th><th>Side</th><th>Strike</th><th>Qty</th><th>Cost Basis</th><th>Mark</th><th>Mkt Val</th><th>Leg P&L</th><th>Acq</th></tr></thead>
                <tbody>
                  ${legs.map(l => {
                    const q   = quoteMap[l.symbol];
                    const mk  = _mk(q);
                    const qty = _f(l.quantity);
                    const mktVal = mk !== null ? mk * qty * 100 : null;
                    const legPnl = mktVal !== null ? mktVal - _f(l.cost_basis) : null;
                    const sideHtml = qty >= 0
                      ? '<span style="background:#dcfce7;color:#15803d;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;">LONG</span>'
                      : '<span style="background:#fee2e2;color:#b91c1c;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;">SHORT</span>';
                    return `<tr>
                      <td style="font-family:monospace;font-size:11px;color:#64748b;">${l.symbol}</td>
                      <td>${sideHtml}</td>
                      <td style="font-weight:600;">${_fmtStrike(l._opt.strike)} ${l._opt.oType === 'P' ? 'Put' : 'Call'}</td>
                      <td>${l.quantity}</td>
                      <td>${_fmt$(l.cost_basis)}</td>
                      <td>${mk !== null ? _fmt$(mk) : '—'}</td>
                      <td>${mktVal !== null ? _fmt$(mktVal) : '—'}</td>
                      <td>${_posPnlHtml(legPnl, _f(l.cost_basis))}</td>
                      <td style="font-size:11px;white-space:nowrap;">${l.date_acquired ? l.date_acquired.split('T')[0] : '—'}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>`;
      }
    });

    html += '</div>';
    body.innerHTML = html;
  } catch (e) {
    body.innerHTML = `<div class="bot-empty py-4"><i class="fas fa-times-circle" style="color:#ef4444;"></i><div class="mt-2">${e.message}</div></div>`;
  }
}

function botTogglePosGroup(id) {
  const el   = document.getElementById(id);
  const icon = document.getElementById(id + '_icon');
  if (!el) return;
  const opening = el.style.display === 'none';
  el.style.display      = opening ? 'block' : 'none';
  if (icon) icon.style.transform = opening ? 'rotate(180deg)' : '';
}

// ── Open Orders ────────────────────────────────────────────────────

/** Parse an OCC option symbol → { ticker, type, strike, dte } or null */
function _parseOccSymbol(sym) {
  if (!sym) return null;
  const m = sym.replace(/\s/g, '').match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!m) return null;
  const [, ticker, yy, mm, dd, optType, strikeStr] = m;
  const expDate = new Date(2000 + parseInt(yy), parseInt(mm) - 1, parseInt(dd));
  const strike  = parseInt(strikeStr) / 1000;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const dte = Math.max(0, Math.round((expDate - now) / 86400000));
  return { ticker, expDate, type: optType === 'C' ? 'call' : 'put', strike, dte };
}

/** Infer a human-readable strategy name from an array of parsed legs */
function _inferStrategyName(legs) {
  if (!legs || !legs.length) return 'Option';
  const sideOf  = l => (l.side || '').includes('buy') ? 'buy' : 'sell';
  const otypeOf = l => (l.type || l.option_type || '').toLowerCase();
  const n = legs.length;
  if (n === 1) {
    const l = legs[0];
    const ot = otypeOf(l);
    if (!ot) return sideOf(l) === 'buy' ? 'Long Option' : 'Short Option';
    return `${sideOf(l) === 'buy' ? 'Long' : 'Short'} ${ot === 'call' ? 'Call' : 'Put'}`;
  }
  const hasCalls = legs.some(l => otypeOf(l) === 'call');
  const hasPuts  = legs.some(l => otypeOf(l) === 'put');
  const typeKnown = hasCalls || hasPuts;
  if (n === 2) {
    if (hasCalls && hasPuts) {
      const sellCount  = legs.filter(l => sideOf(l) === 'sell').length;
      const sameStrike = legs[0].strike === legs[1].strike;
      return sameStrike
        ? (sellCount === 2 ? 'Short Straddle' : 'Long Straddle')
        : (sellCount === 2 ? 'Short Strangle' : 'Long Strangle');
    }
    if (!typeKnown) {
      // OCC parse failed — fall back to side-count only
      const sells = legs.filter(l => sideOf(l) === 'sell').length;
      return sells === 2 ? 'Short Spread' : sells === 0 ? 'Long Spread' : 'Spread';
    }
    const type    = hasCalls ? 'Call' : 'Put';
    const sellLeg = legs.find(l => sideOf(l) === 'sell');
    const buyLeg  = legs.find(l => sideOf(l) === 'buy');
    if (!sellLeg || !buyLeg) return `${type} Spread`;
    const ss = sellLeg.strike || 0, bs = buyLeg.strike || 0;
    return type === 'call'
      ? (ss < bs ? 'Short Call Spread' : 'Long Call Spread')
      : (ss > bs ? 'Short Put Spread'  : 'Long Put Spread');
  }
  if (n === 4 && hasCalls && hasPuts) {
    const cK = legs.filter(l => otypeOf(l) === 'call').map(l => l.strike || 0).sort((a,b) => a-b);
    const pK = legs.filter(l => otypeOf(l) === 'put').map(l => l.strike || 0).sort((a,b) => a-b);
    return cK[0] === pK[1] ? 'Iron Butterfly' : 'Iron Condor';
  }
  return `${n}-Leg`;
}

/** Build a strikes string like "7155/7160" or "7150P/7160C" */
function _strikeSummary(parsedLegs) {
  if (!parsedLegs || !parsedLegs.length) return '';
  const mixed = parsedLegs.some(l => l.type === 'call') && parsedLegs.some(l => l.type === 'put');
  return [...parsedLegs]
    .sort((a, b) => (a.strike || 0) - (b.strike || 0))
    .map(l => l.strike != null ? l.strike + (mixed ? (l.type === 'call' ? 'C' : 'P') : '') : '?')
    .join('/');
}

/** Render a single order as a collapsible card */
function _fmtOrderDateTime(iso) {
  // Tradier reports order times in UTC (e.g. "2026-06-24T15:24:40.000Z").
  // Convert to US market time (Eastern) so fills read in the same zone the
  // market trades in. Intl handles EST/EDT automatically.
  if (!iso) return '';
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) {
    // Unparseable — show as reported.
    const [d, t] = String(iso).split('T');
    return t ? `${d} ${t.slice(0, 8)}` : d;
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(dt);
  const p = {};
  for (const { type, value } of parts) p[type] = value;
  const hh = p.hour === '24' ? '00' : p.hour;
  return `${p.year}-${p.month}-${p.day} ${hh}:${p.minute}:${p.second} ET`;
}

function _renderOrderCard(o) {
  const rawLegs = o.leg ? (Array.isArray(o.leg) ? o.leg : [o.leg]) : null;
  const isMulti  = o.class === 'multileg' && rawLegs?.length > 0;
  const isOption = o.class === 'option';

  let parsedLegs = [];
  if (isMulti) {
    parsedLegs = rawLegs.map(l => {
      const p = _parseOccSymbol(l.option_symbol || l.symbol || '');
      if (!p) console.log('[OO debug] OCC parse failed for:', l.option_symbol || l.symbol, 'full leg:', JSON.stringify(l));
      return { ...l, ...(p || {}), side: l.side || '', type: p?.type || (l.option_type || '') };
    });
  } else if (isOption) {
    const p = _parseOccSymbol(o.symbol || '');
    if (p) parsedLegs = [{ ...o, ...p }];
  }

  // If the bot tagged this order with "Short-Call-Spread" style, decode it
  const _tagStrat = o.tag ? String(o.tag).replace(/-/g, ' ').trim() : null;
  const stratName = _tagStrat || (parsedLegs.length
    ? _inferStrategyName(parsedLegs)
    : (o.class === 'equity' ? ((o.side||'').includes('buy') ? 'Buy Equity' : 'Sell Equity') : 'Order'));
  const strikes   = _strikeSummary(parsedLegs);
  const dte       = parsedLegs[0]?.dte != null ? `${parsedLegs[0].dte} DTE` : '';

  const statusColor = { open:'#10b981', pending:'#f59e0b', filled:'#6366f1', canceled:'#9098a9', partially_filled:'#f59e0b' }[o.status] || '#9098a9';
  const priceStr    = o.price ? _fmt$(parseFloat(o.price)) : (o.stop_price ? 'Stop '+_fmt$(parseFloat(o.stop_price)) : 'Mkt');
  const typeStr     = (o.type||'').replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());
  const canCancel   = ['open','pending','partially_filled'].includes(o.status);
  // For a filled/canceled order, transaction_date is when it actually filled;
  // otherwise fall back to when it was placed (create_date).
  const _orderTs    = ((o.status === 'filled' || o.status === 'partially_filled' || o.status === 'canceled')
                       && o.transaction_date) ? o.transaction_date : o.create_date;
  const dateStr     = _fmtOrderDateTime(_orderTs);
  const hasLegs     = parsedLegs.length > 0;

  const titleHtml = `${stratName} <span style="color:#6366f1;">${o.symbol}</span>`
    + (strikes ? ` <span style="color:#374151;">· ${strikes}</span>` : '')
    + (dte     ? ` <span style="color:#9098a9;font-size:11px;font-weight:400;"> · ${dte}</span>` : '');

  let legsHtml = '';
  if (hasLegs) {
    legsHtml = `<div class="oo-legs" id="oo-legs-${o.id}" style="display:none;">` +
      parsedLegs.map(l => {
        const isBuy  = (l.side||'').includes('buy');
        const detail = l.strike != null
          ? `${l.strike} ${(l.type||'').toUpperCase()} · ${(l.side||'').replace(/_/g,' ')}`
          : (l.option_symbol || l.symbol || '');
        const legPx  = l.price != null && parseFloat(l.price) > 0 ? `<span class="oo-leg-price">@ ${_fmt$(parseFloat(l.price))}</span>` : '';
        return `<div class="oo-leg-row">
          <span class="badge-side ${isBuy ? 'badge-buy' : 'badge-sell'}" style="font-size:10px;">${isBuy ? 'buy' : 'sell'}</span>
          <span class="oo-leg-detail">${detail}</span>
          <span class="oo-leg-price">${o.quantity}x</span>
          ${legPx}
        </div>`;
      }).join('') + '</div>';
  }

  return `<div class="oo-card">
    <div class="oo-card-header" ${hasLegs ? `onclick="_ooToggleLegs('${o.id}', this)"` : ''}>
      <div style="flex:1;min-width:0;">
        <div class="oo-card-title">${titleHtml}</div>
        <div class="oo-card-meta">
          <span class="oo-status-badge" style="color:${statusColor};font-weight:600;">${o.status}</span>
          <span class="oo-meta-sep">·</span><span>${o.quantity}x</span>
          <span class="oo-meta-sep">·</span><span>${typeStr}</span>
          <span class="oo-meta-sep">·</span><strong>${priceStr}</strong>
          ${dateStr ? `<span class="oo-meta-sep">·</span><span style="color:#9098a9;">${dateStr}</span>` : ''}
          <span class="oo-meta-sep">·</span><span class="oo-order-id">#${o.id}</span>
        </div>
      </div>
      <div class="oo-card-right">
        ${canCancel ? `<button class="oo-cancel-btn" onclick="event.stopPropagation();botCancelOrder(${o.id},this)"><i class="fas fa-times"></i> Cancel</button>` : ''}
        ${hasLegs   ? `<i class="fas fa-chevron-down oo-chevron" id="oo-chev-${o.id}"></i>` : ''}
      </div>
    </div>
    ${legsHtml}
  </div>`;
}

function _ooToggleLegs(id) {
  const legsEl = document.getElementById(`oo-legs-${id}`);
  const chevEl = document.getElementById(`oo-chev-${id}`);
  if (!legsEl) return;
  const isOpen = legsEl.style.display !== 'none';
  legsEl.style.display = isOpen ? 'none' : 'block';
  if (chevEl) chevEl.style.transform = isOpen ? '' : 'rotate(180deg)';
}

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
    body.innerHTML = '<div class="oo-orders-list">' + orders.map(o => _renderOrderCard(o)).join('') + '</div>';
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
  // Auto-detect strategy direction then refresh summary
  const allSelected = strat.legs.every((_, i) => _npLegStrikes[i] != null);
  if (allSelected) {
    const detectedKey = npDetectSpreadDirection(key);
    npShowSummary(detectedKey);
    npCalcPrice();
  }
}

// Infer Long vs Short spread from actual strike relationship.
// For call spreads: if sell strike < buy strike → Short Call Spread (credit / bear call)
//                   if sell strike > buy strike → Long Call Spread  (debit  / bull call)
// For put spreads:  if sell strike > buy strike → Short Put Spread  (credit / bull put)
//                   if sell strike < buy strike → Long Put Spread   (debit  / bear put)
function npDetectSpreadDirection(currentKey) {
  const CALL_SPREADS = ['short_call_spread', 'long_call_spread'];
  const PUT_SPREADS  = ['short_put_spread',  'long_put_spread'];
  const isCall = CALL_SPREADS.includes(currentKey);
  const isPut  = PUT_SPREADS.includes(currentKey);
  if (!isCall && !isPut) return currentKey;
  const strat   = NP_STRATEGIES[currentKey];
  const buyIdx  = strat.legs.findIndex(l => l.side === 'buy');
  const sellIdx = strat.legs.findIndex(l => l.side === 'sell');
  const buyK    = _npLegStrikes[buyIdx]?.strike;
  const sellK   = _npLegStrikes[sellIdx]?.strike;
  if (buyK == null || sellK == null) return currentKey;
  let inferred;
  if (isCall) {
    inferred = sellK < buyK ? 'short_call_spread' : 'long_call_spread';
  } else {
    inferred = sellK > buyK ? 'short_put_spread' : 'long_put_spread';
  }
  if (inferred !== currentKey) {
    const sel = document.getElementById('npStrat');
    if (sel) sel.value = inferred;
    npUpdateOrderTypeOpts(inferred);
  }
  return inferred;
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
  // Show refresh button and start auto-refresh
  const rfBtn = document.getElementById('npRefreshBtn');
  if (rfBtn) rfBtn.style.display = '';
  npStartAutoRefresh();
}

function npHideSummary() {
  _show('npTradeSummary', false);
  npStopAutoRefresh();
  const btn = document.getElementById('npRefreshBtn');
  if (btn) btn.style.display = 'none';
}

// ── New Position price auto-refresh ───────────────────────────────
function npStartAutoRefresh() {
  npStopAutoRefresh();
  _npRefreshTimer = setInterval(npSilentRefreshPrices, 5000);
}

function npStopAutoRefresh() {
  if (_npRefreshTimer) { clearInterval(_npRefreshTimer); _npRefreshTimer = null; }
}

async function npSilentRefreshPrices() {
  const sym   = document.getElementById('npSym')?.value.trim().toUpperCase();
  const exp   = document.getElementById('npExp')?.value;
  const key   = document.getElementById('npStrat')?.value;
  const strat = NP_STRATEGIES[key];
  if (!sym || !exp || !strat || !Object.keys(_npLegStrikes).length) return;
  // Refresh underlying price badge
  try {
    const qr = await fetch(`/api/bot/tradier/quote?symbol=${encodeURIComponent(sym)}`);
    const qd = await qr.json();
    const qp = qd?.quotes?.quote;
    if (qp?.last) {
      _npLastPrice = parseFloat(qp.last);
      const badge = document.getElementById('npLivePriceBadge');
      if (badge) badge.textContent = `${sym} $${_npLastPrice.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
    }
  } catch (_) {}
  // Refresh option chain and update bid/ask for each selected strike
  try {
    const cr = await fetch(`/api/bot/tradier/options/chains?symbol=${encodeURIComponent(sym)}&expiration=${encodeURIComponent(exp)}`);
    const cd = await cr.json();
    const opts = cd?.options?.option || [];
    _npChain = Array.isArray(opts) ? opts : (opts ? [opts] : []);
    let updated = false;
    for (const [idxStr, ls] of Object.entries(_npLegStrikes)) {
      const match = _npChain.find(o => parseFloat(o.strike) === ls.strike && o.option_type === ls.opType);
      if (match) {
        _npLegStrikes[parseInt(idxStr)] = {
          ...ls,
          bid:   parseFloat(match.bid || 0),
          ask:   parseFloat(match.ask || 0),
          delta: match.greeks?.delta,
          theta: match.greeks?.theta,
        };
        updated = true;
      }
    }
    if (updated) { npShowSummary(key); npCalcPrice(); }
  } catch (_) {}
}

async function npManualRefresh() {
  const btn = document.getElementById('npRefreshBtn');
  if (btn) { btn.classList.add('spinning'); btn.disabled = true; }
  try { await npSilentRefreshPrices(); } finally {
    if (btn) { btn.classList.remove('spinning'); btn.disabled = false; }
  }
}

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
    const errMsg = data?.errors?.error || data?.error || '';
    const alreadyDone = typeof errMsg === 'string' && /finalized|canceled|cancelled/i.test(errMsg);
    if (data.order?.status === 'ok' || resp.ok || alreadyDone) {
      // Update the card status badge and remove the cancel button
      const card = btn.closest('.oo-card');
      if (card) {
        const badge = card.querySelector('.oo-status-badge');
        if (badge) { badge.textContent = 'canceled'; badge.style.color = '#9098a9'; }
        btn.remove();
      } else {
        botLoadOrders();
      }
    } else {
      alert(Array.isArray(errMsg) ? errMsg.join(', ') : (errMsg || 'Cancel failed'));
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-times"></i> Cancel';
    }
  } catch (e) {
    alert('Network error: ' + e.message);
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-times"></i> Cancel';
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
  if (type === 'time')           return { mode:'exactly', time1:'09:30', time2:'16:00', daysOfWeek:['any'] };
  if (type === 'metric')         return { metric:'price', day:0, interval:'1min', series:'close', period:14,
    macdShort:12, macdLong:26, macdSignal:9, macdComponent:'histogram',
    optType:'call', optDte:30,
    operator:'>', comparator:'value', value:'',
    rightDay:0, rightInterval:'1min', rightSeries:'close', rightPeriod:20,
    rightLookback:0,
    thresholdUnit:'percent', thresholdValue:'',
    andEnabled:false, andMetric:'rsi', andPeriod:14, andOperator:'<', andValue:'',
    label:'' };
  if (type === 'open_position')  return { symbol:'', strategy:'Short Put Spread', dte:30,
    frontDte:7, backDte:30, strikeMethod:'atm', strikeValue:'',
    strikeDirection:'auto', strikeFallback:'closest',
    spreadWidth:5, callWidth:5, putWidth:5,
    leg2StrikeMethod:'spread_width', leg2StrikeValue:'', leg2Direction:'below',
    takeProfitPct:null, stopLossPct:null, quantity:1, orderType:'credit', limitPriceMin:0, limitPriceMax:0, tag:'' };
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
let _sbSteps          = [];     // ROOT array of step objects (tree — each may have yesSteps/noSteps)
let _sbInsertParentId = null;  // null = root level; else parent step ID
let _sbInsertBranch   = 'root'; // 'yes' | 'no' | 'root'
let _sbInsertPos      = -1;    // position in target array (-1 = append)
let _sbEditStepId     = null;  // UUID of step being configured in modal
let _sbIsNewStep      = false; // true when modal opened for a freshly-added step
let _sbAllocation    = null; // $ allocation limit (null = unlimited)
let _sbMaxPositions  = null; // max open positions + orders (null = unlimited)

// ── Utilities ──────────────────────────────────────────────────────
function sbUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try { return crypto.randomUUID(); } catch(e) {}
  }
  return 'sb_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

// ── Branching step types ───────────────────────────────────────────
const SB_BRANCHING = ['time', 'condition', 'metric'];

// ── Tree helpers ───────────────────────────────────────────────────
function sbGetStep(id, steps) {
  steps = steps || _sbSteps;
  for (const s of steps) {
    if (s.id === id) return s;
    const inY = sbGetStep(id, s.yesSteps || []);
    if (inY) return inY;
    const inN = sbGetStep(id, s.noSteps  || []);
    if (inN) return inN;
  }
  return null;
}

function sbFindStepCtx(id, steps, parent, branch) {
  steps  = steps  || _sbSteps;
  parent = parent || null;
  branch = branch || 'root';
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].id === id) return { step: steps[i], arr: steps, idx: i, parent, branch };
    const inY = sbFindStepCtx(id, steps[i].yesSteps || [], steps[i], 'yes');
    if (inY) return inY;
    const inN = sbFindStepCtx(id, steps[i].noSteps  || [], steps[i], 'no');
    if (inN) return inN;
  }
  return null;
}

function sbRemoveStepById(id) {
  const ctx = sbFindStepCtx(id);
  if (ctx) ctx.arr.splice(ctx.idx, 1);
}

// Ensure every step in the tree has yesSteps/noSteps arrays (backward compat)
function sbMigrateSteps(steps) {
  return (steps || []).map(s => ({
    ...s,
    yesSteps: Array.isArray(s.yesSteps) ? sbMigrateSteps(s.yesSteps) : [],
    noSteps:  Array.isArray(s.noSteps)  ? sbMigrateSteps(s.noSteps)  : [],
  }));
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
    _sbSteps       = sbMigrateSteps(JSON.parse(JSON.stringify(s.steps || [])));
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
    if (!r.ok) { const errData = await r.json().catch(() => ({})); alert('Save failed: ' + (errData.error || r.status)); return; }
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
  flow.innerHTML = _sbRenderList(_sbSteps, null, 'root');
}

function _sbRenderList(steps, parentId, branch) {
  const pid = parentId === null ? 'null' : `'${parentId}'`;
  let html = `<button class="sb-add-btn" onclick="stratOpenDrawer(${pid},'${branch}',0)" title="Add step">+</button>`;
  (steps || []).forEach((step, idx) => {
    html += _sbRenderStep(step);
    // After a branching step (condition/time/metric) the ONLY continuation
    // is the YES or NO sub-path — no sibling steps can follow at this level.
    if (!SB_BRANCHING.includes(step.type)) {
      html += `<div class="sb-connector"><div class="sb-connector-line"></div></div>
        <button class="sb-add-btn" onclick="stratOpenDrawer(${pid},'${branch}',${idx + 1})" title="Add step">+</button>`;
    }
  });
  return html;
}

function _sbRenderStep(step) {
  const meta      = SB_ACTIONS.find(m => m.type === step.type) || {};
  const summary   = sbConfigSummary(step);
  const isBranch  = SB_BRANCHING.includes(step.type);
  const sid       = step.id;

  let html = `
    <div class="sb-connector"><div class="sb-connector-line"></div></div>
    <div class="sb-step-card" onclick="stratEditStep('${sid}')">
      <div class="sb-step-icon" style="background:${meta.bg||'#f1f3f7'};color:${meta.color||'#6c757d'}">
        <i class="fas ${meta.icon||'fa-circle'}"></i>
      </div>
      <div class="sb-step-info">
        <div class="sb-step-type">${meta.label||step.type}</div>
        <div class="sb-step-desc">${summary}</div>
      </div>
      <button class="sb-step-del" onclick="event.stopPropagation();sbRemoveStep('${sid}')" title="Remove step">
        <i class="fas fa-times"></i>
      </button>
    </div>`;

  if (isBranch) {
    html += `
    <div class="sb-connector"><div class="sb-connector-line"></div></div>
    <div class="sb-branch">
      <div class="sb-branch-col">
        <div class="sb-branch-label sb-branch-yes">YES</div>
        <div class="sb-branch-content">${_sbRenderList(step.yesSteps || [], sid, 'yes')}</div>
      </div>
      <div class="sb-branch-col">
        <div class="sb-branch-label sb-branch-no">NO</div>
        <div class="sb-branch-content">${_sbRenderList(step.noSteps || [], sid, 'no')}</div>
      </div>
    </div>`;
  }
  return html;
}

// kept for any legacy callers
function sbAddBtnHTML(insertIdx) {
  return `<div class="sb-connector"><div class="sb-connector-line"></div></div>
    <button class="sb-add-btn" onclick="stratOpenDrawer(null,'root',${insertIdx})" title="Add step">+</button>`;
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

function stratOpenDrawer(parentId, branch, pos) {
  _sbInsertParentId = (parentId === null || parentId === 'null') ? null : parentId;
  _sbInsertBranch   = branch || 'root';
  _sbInsertPos      = (pos !== undefined && pos >= 0) ? pos : -1;
  document.getElementById('sbDrawer').style.display = 'flex';
  document.getElementById('sbDrawer').style.flexDirection = 'column';
}

function stratCloseDrawer() {
  const d = document.getElementById('sbDrawer');
  if (d) d.style.display = 'none';
  _sbInsertParentId = null;
  _sbInsertBranch   = 'root';
  _sbInsertPos      = -1;
}

// ── Add step ───────────────────────────────────────────────────────
function sbAddStep(type) {
  const step = { id: sbUUID(), type, config: sbDefaultConfig(type), yesSteps: [], noSteps: [] };

  if (_sbInsertParentId === null) {
    const pos = _sbInsertPos >= 0 ? _sbInsertPos : _sbSteps.length;
    _sbSteps.splice(pos, 0, step);
  } else {
    const parent = sbGetStep(_sbInsertParentId);
    if (parent) {
      const arr = _sbInsertBranch === 'yes'
        ? (parent.yesSteps = parent.yesSteps || [])
        : (parent.noSteps  = parent.noSteps  || []);
      const pos = _sbInsertPos >= 0 ? _sbInsertPos : arr.length;
      arr.splice(pos, 0, step);
    }
  }

  stratCloseDrawer();
  sbRenderFlow();
  sbUpdateCounts();
  stratEditStep(step.id, true);
}

function sbRemoveStep(id) {
  sbRemoveStepById(id);
  sbRenderFlow();
  sbUpdateCounts();
}

function sbUpdateCounts() {
  // placeholder — counts panel removed; called for compatibility
}

// ── Step config modal ──────────────────────────────────────────────
function stratEditStep(id, isNew) {
  const step = sbGetStep(id);
  if (!step) return;
  _sbEditStepId = id;
  _sbIsNewStep  = !!isNew;
  const meta = SB_ACTIONS.find(m => m.type === step.type) || {};
  document.getElementById('sbStepModalTitle').textContent = `Configure: ${meta.label || step.type}`;
  document.getElementById('sbStepModalBody').innerHTML = sbStepConfigHTML(step);
  if (step.type === 'metric') sbSyncMetricForm();
  document.getElementById('sbStepModal').style.display = 'flex';
}

function stratCloseStepModal() {
  if (_sbIsNewStep && _sbEditStepId) {
    sbRemoveStepById(_sbEditStepId);
    sbRenderFlow();
    sbUpdateCounts();
  }
  document.getElementById('sbStepModal').style.display = 'none';
  _sbEditStepId = null;
  _sbIsNewStep  = false;
}

function stratSaveStepConfig() {
  if (!_sbEditStepId) return;
  const step = sbGetStep(_sbEditStepId);
  if (!step) return;
  const c = step.config;

  if (step.type === 'time') {
    c.mode  = document.getElementById('sbcTimeMode')?.value || 'exactly';
    c.time1 = document.getElementById('sbcTime1')?.value || '09:30';
    c.time2 = document.getElementById('sbcTime2')?.value || '16:00';
    const activeDays = [...document.querySelectorAll('.sb-day-btn.active')].map(b => b.dataset.day);
    c.daysOfWeek = activeDays.length ? activeDays : ['any'];
  } else if (step.type === 'metric') {
    c.metricSymbol  = (document.getElementById('sbcMetricSymbol')?.value || '').toUpperCase().trim();
    c.metric        = document.getElementById('sbcMetric')?.value || 'price';
    c.day           = parseInt(document.getElementById('sbcDay')?.value ?? '0');
    c.interval      = document.getElementById('sbcInterval')?.value || '1min';
    c.series        = document.getElementById('sbcSeries')?.value || 'close';
    c.period        = parseInt(document.getElementById('sbcPeriod')?.value) || 14;
    c.macdShort     = parseInt(document.getElementById('sbcMacdShort')?.value) || 12;
    c.macdLong      = parseInt(document.getElementById('sbcMacdLong')?.value)  || 26;
    c.macdSignal    = parseInt(document.getElementById('sbcMacdSignal')?.value) || 9;
    c.macdComponent = document.getElementById('sbcMacdComp')?.value || 'histogram';
    c.optType       = document.getElementById('sbcOptType')?.value || 'call';
    c.optDte        = (() => { const v = parseInt(document.getElementById('sbcOptDte')?.value); return isNaN(v) ? 30 : Math.max(1, v); })();
    c.operator      = document.getElementById('sbcOperator')?.value || '>';
    c.comparator    = document.getElementById('sbcComparator')?.value || 'value';
    c.value         = (document.getElementById('sbcMetricValue')?.value || '').trim();
    c.rightDay      = parseInt(document.getElementById('sbcRightDay')?.value ?? '0');
    c.rightInterval = document.getElementById('sbcRightInterval')?.value || '1min';
    c.rightSeries   = document.getElementById('sbcRightSeries')?.value || 'close';
    c.rightPeriod   = parseInt(document.getElementById('sbcRightPeriod')?.value) || 20;
    const _rlbRaw = document.getElementById('sbcRightLookback')?.value;
    c.rightLookback = (_rlbRaw === '' || _rlbRaw == null) ? null : (parseInt(_rlbRaw) || 0);
    c.thresholdUnit  = document.getElementById('sbcThresholdUnit')?.value || 'percent';
    c.thresholdValue = (document.getElementById('sbcThresholdValue')?.value || '').trim();
    c.ccDatapoint      = document.getElementById('sbcCcDatapoint')?.value || 'price';
    c.ccColor          = document.getElementById('sbcCcColor')?.value || 'either';
    c.ccRightDatapoint = document.getElementById('sbcCcRightDatapoint')?.value || 'close';
    c.ccRightColor     = document.getElementById('sbcCcRightColor')?.value || 'either';
    c.andEnabled  = document.getElementById('sbcAndEnabled')?.checked || false;
    c.andMetric   = document.getElementById('sbcAndMetric')?.value || 'rsi';
    c.andPeriod   = parseInt(document.getElementById('sbcAndPeriod')?.value) || 14;
    c.andOperator = document.getElementById('sbcAndOperator')?.value || '<';
    c.andValue    = (document.getElementById('sbcAndValue')?.value || '').trim();

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
                   'crosses_above':'↑ cross','crosses_below':'↓ cross'}[c.operator] || c.operator;
    let lbl;
    if (c.metric === 'current_candle') {
      const iStr = c.interval === 'day' ? 'Daily' : c.interval;
      const dStr = c.day !== 0 ? ` D(${c.day})` : '';
      const colL = c.ccColor && c.ccColor !== 'either' ? ` ${c.ccColor}` : '';
      lbl = `Candle[${iStr}${dStr}]${colL} ${c.ccDatapoint}`;
      if (c.comparator === 'compare_prev_candle') {
        const rc  = c.ccRightColor && c.ccRightColor !== 'either' ? ` ${c.ccRightColor}` : '';
        const th  = c.thresholdValue ? ` ±${c.thresholdValue}${c.thresholdUnit==='percent'?'%':'$'}` : '';
        lbl += ` ${opLbl} Prev${rc} ${c.ccRightDatapoint}${th}`;
      } else {
        lbl += ` (color only)`;
      }
    } else {
    lbl = `${mName}${pSfx}${_ctx(c.metric,c.day,c.interval,c.series)} ${opLbl}`;

    const _RN = { compare_price:'Price', compare_vwap:'VWAP', compare_sma:'SMA', compare_ema:'EMA', compare_rsi:'RSI' };
    if (c.comparator === 'value') {
      lbl += ` ${c.value||'?'}`;
    } else if (c.comparator === 'compare_price') {
      const dStr = c.rightDay !== 0 ? ` D(${c.rightDay})` : '';
      const iStr = c.rightDay === 0 ? ` [${c.rightInterval}·${c.rightSeries}]` : ` [daily·${c.rightSeries}]`;
      const lbStr = c.rightLookback > 0 ? ` [-${c.rightLookback}]` : '';
      const thStr = c.thresholdValue ? ` ±${c.thresholdValue}${c.thresholdUnit==='percent'?'%':'$'}` : '';
      lbl += ` Price${dStr}${iStr}${lbStr}${thStr}`;
    } else if (c.comparator === 'compare_vwap') {
      const thStr = c.thresholdValue ? ` ±${c.thresholdValue}${c.thresholdUnit==='percent'?'%':'$'}` : '';
      lbl += ` VWAP${thStr}`;
    } else if (['compare_sma','compare_ema','compare_rsi'].includes(c.comparator)) {
      const rName = _RN[c.comparator];
      const lbStr = c.rightLookback > 0 ? ` [-${c.rightLookback}]` : '';
      const thStr = c.thresholdValue ? ` ±${c.thresholdValue}${c.thresholdUnit==='percent'?'%':'$'}` : '';
      lbl += ` ${rName}(${c.rightPeriod})${lbStr}${thStr}`;
    }
    }

    if (c.andEnabled && c.andValue !== '') {
      const aMN  = _MN[c.andMetric] || c.andMetric;
      const aSfx = ['sma','ema','rsi','roc'].includes(c.andMetric) ? `(${c.andPeriod})` : '';
      const aOp  = {'>':'>','<':'<','>=':'≥','<=':'≤','=':'='}[c.andOperator] || c.andOperator;
      lbl += ` AND ${aMN}${aSfx} ${aOp} ${c.andValue}`;
    }
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
    c.strikeDirection = document.getElementById('sbcStrikeDirection')?.value || 'auto';
    c.strikeFallback  = document.getElementById('sbcStrikeFallback')?.value  || 'closest';
    c.prevCandleType      = document.getElementById('sbcPrevCandleType')?.value || '1min';
    c.prevCandleDay       = parseInt(document.getElementById('sbcPrevCandleDay')?.value ?? '0') || 0;
    c.prevCandleDatapoint = document.getElementById('sbcPrevCandleDatapoint')?.value || 'close';
    c.prevCandleColor     = document.getElementById('sbcPrevCandleColor')?.value || 'either';
    const _tpRaw = parseFloat(document.getElementById('sbcTakeProfitPct')?.value);
    c.takeProfitPct = isNaN(_tpRaw) ? null : _tpRaw;
    const _slRaw = parseFloat(document.getElementById('sbcStopLossPct')?.value);
    c.stopLossPct   = isNaN(_slRaw) ? null : _slRaw;
    c.quantity      = parseInt(document.getElementById('sbcQty')?.value) || 1;
    c.orderType     = document.getElementById('sbcOrderType')?.value || 'credit';
    c.limitPriceMin = parseFloat(document.getElementById('sbcLimitMin')?.value) || 0;
    c.limitPriceMax = parseFloat(document.getElementById('sbcLimitMax')?.value) || 0;
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

// ── Days of week toggle ────────────────────────────────────────────
function sbDayToggle(day) {
  const btns = [...document.querySelectorAll('.sb-day-btn')];
  const anyBtn = btns.find(b => b.dataset.day === 'any');
  if (day === 'any') {
    btns.forEach(b => b.classList.toggle('active', b.dataset.day === 'any'));
  } else {
    if (anyBtn) anyBtn.classList.remove('active');
    const clicked = btns.find(b => b.dataset.day === day);
    if (clicked) clicked.classList.toggle('active');
    // If nothing active, revert to Any
    if (!btns.some(b => b.classList.contains('active')) && anyBtn) {
      anyBtn.classList.add('active');
    }
  }
}

// ── Per-metric allowed comparators (mirrors sbMetricFormHtml) ────────
const _SB_METRIC_COMPS = {
  current_price: ['value','compare_price','compare_vwap','compare_sma','compare_ema'],
  price:         ['value','compare_price','compare_vwap','compare_sma','compare_ema'],
  sma:           ['value','compare_price','compare_sma','compare_ema'],
  ema:           ['value','compare_price','compare_sma','compare_ema'],
  rsi:           ['value','compare_rsi'],
  current_candle:['none','compare_prev_candle'],
};
const _SB_ALL_COMP_LABELS = {
  value:'Fixed Value', compare_price:'Compare Price', compare_vwap:'Compare VWAP',
  compare_sma:'Compare SMA', compare_ema:'Compare EMA', compare_rsi:'Compare RSI',
  compare_histogram:'Compare Histogram', compare_macd_line:'Compare MACD Line',
  compare_signal_line:'Compare Signal Line',
  none:'None (color only)', compare_prev_candle:'Previous Candle',
};

// Compute allowed comparator list for a metric. For MACD, the list depends on
// the currently selected component (histogram / macd_line / signal_line) —
// mirrors the options custom builder's updateMacdComparatorOptions().
function _sbAllowedComps(metric, macdComp) {
  if (metric === 'macd') {
    const comp = macdComp || 'histogram';
    const key = comp === 'macd_line'   ? 'compare_macd_line'
              : comp === 'signal_line' ? 'compare_signal_line'
              :                          'compare_histogram';
    return ['value', key];
  }
  return _SB_METRIC_COMPS[metric] || ['value'];
}

// ── Metric step: master sync (called by all onchange handlers) ──────
function sbSyncMetricForm() {
  const m        = document.getElementById('sbcMetric')?.value || 'price';
  const day      = parseInt(document.getElementById('sbcDay')?.value ?? '0');
  const rightDay = parseInt(document.getElementById('sbcRightDay')?.value ?? '0');
  const macdComp = document.getElementById('sbcMacdComp')?.value || 'histogram';

  // Update comparator options to match the selected metric (and MACD component)
  const compSel = document.getElementById('sbcComparator');
  if (compSel) {
    const allowed = _sbAllowedComps(m, macdComp);
    const curVal  = compSel.value;
    compSel.innerHTML = allowed.map(k =>
      `<option value="${k}" ${k===curVal?'selected':''}>${_SB_ALL_COMP_LABELS[k]||k}</option>`
    ).join('');
    if (!allowed.includes(compSel.value)) compSel.value = 'value';
  }

  const ct       = compSel?.value || 'value';

  const isCC      = m === 'current_candle';
  const ccPrev    = isCC && ct === 'compare_prev_candle';
  const noBarCtx  = ['gap_pct','iv_rank','delta','theta','current_price'].includes(m);
  const noIntv    = ['change_pct'].includes(m);
  const op        = document.getElementById('sbcOperator')?.value || '>';
  const isCrossOp = op === 'crosses_above' || op === 'crosses_below';
  _show('sbcDayRow',       !noBarCtx || isCC);
  // Always expose Candle Type for cross operators — the backend needs the
  // interval to fetch bars for cross detection even when the metric is a
  // live quote (current_price).  Current-candle always needs the candle type.
  _show('sbcIntervalRow',  ((!noBarCtx || isCrossOp) && !noIntv && day === 0) || isCC);
  // Series type (open/high/low/close) applies to Price AND to any indicator
  // that derives a single input column from the bars.
  _show('sbcSeriesRow',    ['price','sma','ema','rsi','macd','roc'].includes(m));
  _show('sbcPeriodRow',    ['sma','ema','rsi','roc'].includes(m));
  _show('sbcMacdShortRow', m === 'macd');
  _show('sbcMacdLongRow',  m === 'macd');
  _show('sbcMacdSignalRow',m === 'macd');
  _show('sbcMacdCompRow',  m === 'macd');
  _show('sbcOptTypeRow',   ['iv_rank','delta','theta'].includes(m));
  _show('sbcOptDteRow',    ['iv_rank','delta','theta'].includes(m));

  // Current-candle left-side controls (datapoint + colour gate)
  _show('sbcCcLeftRow',    isCC);
  _show('sbcCcColorRow',   isCC);

  const showRight      = !isCC && ct !== 'value';
  const rightIsPrice   = ct === 'compare_price';
  const rightIsVwap    = ct === 'compare_vwap';
  const rightIsIndic   = ['compare_sma','compare_ema','compare_rsi'].includes(ct);
  _show('sbcValueRow',           !isCC && ct === 'value');
  _show('sbcRightSide',          showRight || ccPrev);
  _show('sbcRightDayRow',        showRight && rightIsPrice);
  _show('sbcRightIntervalRow',   showRight && rightIsPrice);
  _show('sbcRightSeriesRow',     showRight && rightIsPrice);
  // VWAP is now a rolling N-bar indicator too — expose the Period field.
  _show('sbcRightPeriodRow',     showRight && (rightIsIndic || rightIsVwap));
  _show('sbcThresholdRow',       (showRight && !isCrossOp) || ccPrev);
  _show('sbcRightLookbackRow',   showRight && !rightIsVwap);
  // Current-candle right-side (previous candle) controls
  _show('sbcCcRightDpRow',       ccPrev);
  _show('sbcCcRightColorRow',    ccPrev);
}
function sbMetricChange()      { sbSyncMetricForm(); }
function sbDayChange()         { sbSyncMetricForm(); }
function sbIntervalChange()    { sbSyncMetricForm(); }
function sbOperatorChange()    { sbSyncMetricForm(); }
function sbCompareTypeChange() { sbSyncMetricForm(); }
function sbRightDayChange()    { sbSyncMetricForm(); }
function sbAndToggle()         { _show('sbcAndBlock', document.getElementById('sbcAndEnabled')?.checked); }
function sbAndMetricChange()   { _show('sbcAndPeriodRow', ['sma','ema','rsi','roc'].includes(document.getElementById('sbcAndMetric')?.value)); }

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
  sbCondTagHintUpdate();
}

function sbCondTagHintUpdate() {
  const tagEl  = document.getElementById('sbcCondTag');
  const hint   = document.getElementById('sbcCondTagHint');
  const echo   = document.getElementById('sbcCondTagEcho');
  const typeEl = document.getElementById('sbcCondType');
  if (!tagEl || !hint) return;
  const val  = tagEl.value.trim();
  const type = typeEl ? typeEl.value : 'position_count';
  const relevant = ['position_count','daily_opens','unrealized_pnl','closed_today'].includes(type);
  hint.style.display = (val && relevant) ? '' : 'none';
  if (echo) echo.textContent = val;
}

// ── Open Position: strategy-driven field visibility ──────────────────
function _otListForStrategy(s) {
  if (_OP_EQUITY.includes(s)) return ['market', 'limit'];
  if (s.startsWith('Long'))   return ['debit', 'market'];
  if (s.startsWith('Short') || s.startsWith('Naked Short')) return ['credit', 'market'];
  return ['credit', 'debit', 'market']; // calendar/diagonal/double
}

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
  const _sdirM = ['dollar_underlying','pct_underlying','dollar_leg','pct_leg','dollar_prev_candle'];
  _show('sbcStrikeDirRow',   !isStraddle && !isEquity && sm !== 'atm' && _sdirM.includes(sm));
  _show('sbcStrikeFbRow',    !isStraddle && !isEquity && sm !== 'atm');
  _show('sbcStrikePrevRows', !isStraddle && !isEquity && sm === 'dollar_prev_candle');
  _show('sbcSpreadWidthRow', isStrangle && !isEquity);
  _show('sbcLeg2Section',   isVertical && !isEquity);
  if (isVertical) sbLeg2MethodChange();
  _show('sbcCallWidthRow',   isIron && !isEquity);
  _show('sbcPutWidthRow',    isIron && !isEquity);
  _show('sbcTpRow',          !isEquity);
  _show('sbcSlRow',          !isEquity);

  // Swap order-type options based on strategy direction (Long=debit, Short=credit, equity=market/limit)
  const otSel = document.getElementById('sbcOrderType');
  if (otSel) {
    const cur  = otSel.value;
    const opts = _otListForStrategy(s);
    otSel.innerHTML = opts.map(t =>
      `<option value="${t}" ${t===cur?'selected':''}>${t.charAt(0).toUpperCase()+t.slice(1)}</option>`
    ).join('');
    if (!opts.includes(otSel.value)) otSel.value = opts[0];
  }
  const _curOt = document.getElementById('sbcOrderType')?.value || 'market';
  const { showMin: _sm2, showMax: _sx2 } = _sbPriceRowVisibility(_curOt, isEquity);
  _show('sbcLimitMinRow', _sm2);
  _show('sbcLimitMaxRow', _sx2);
  _sbUpdatePriceLabels(_curOt, isEquity);

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

function _sbPriceRowVisibility(ot, isEquity) {
  // Min row: equity+limit, options+credit, options+market
  const showMin = (isEquity && ot === 'limit') ||
                  (!isEquity && (ot === 'credit' || ot === 'market'));
  // Max row: options+debit, options+market (not equity, not credit-only)
  const showMax = !isEquity && (ot === 'debit' || ot === 'market');
  return { showMin, showMax };
}

function _sbUpdatePriceLabels(ot, isEquity) {
  const minLbl = document.getElementById('sbcLimitMinLabel');
  const maxLbl = document.getElementById('sbcLimitMaxLabel');
  if (minLbl) {
    let base, hint;
    if (isEquity) {
      base = 'Limit Price ($)'; hint = '(optional — 0 = auto last)';
    } else if (ot === 'credit') {
      base = 'Credit Limit Price ($)'; hint = '(optional — 0 = auto mid)';
    } else {
      base = 'Min Price Filter ($)'; hint = '(optional — 0 = no minimum)';
    }
    minLbl.innerHTML = `${base} <span style="color:#94a3b8;font-weight:400;">${hint}</span>`;
  }
  if (maxLbl) {
    const base = ot === 'debit' ? 'Debit Limit Price ($)' : 'Max Price Filter ($)';
    const hint = ot === 'debit' ? '(optional — 0 = auto mid)' : '(optional — 0 = no maximum)';
    maxLbl.innerHTML = `${base} <span style="color:#94a3b8;font-weight:400;">${hint}</span>`;
  }
}

function sbOrderTypeChange() {
  const s        = document.getElementById('sbcStrategy')?.value || '';
  const ot       = document.getElementById('sbcOrderType')?.value || 'market';
  const isEquity = _OP_EQUITY.includes(s);
  const { showMin, showMax } = _sbPriceRowVisibility(ot, isEquity);
  _show('sbcLimitMinRow', showMin);
  _show('sbcLimitMaxRow', showMax);
  _sbUpdatePriceLabels(ot, isEquity);
}

function sbStrikeMethodChange() {
  const sm = document.getElementById('sbcStrikeMethod')?.value || 'atm';
  const s  = document.getElementById('sbcStrategy')?.value || '';
  const isStraddle = _OP_STRADDLE.includes(s);
  const isEquity   = _OP_EQUITY.includes(s);
  const showVal    = !isStraddle && !isEquity && sm !== 'atm';
  _show('sbcStrikeValRow', showVal);
  const _sdirM = ['dollar_underlying','pct_underlying','dollar_leg','pct_leg','dollar_prev_candle'];
  _show('sbcStrikeDirRow', showVal && _sdirM.includes(sm));
  _show('sbcStrikeFbRow',  showVal);
  _show('sbcStrikePrevRows', !isStraddle && !isEquity && sm === 'dollar_prev_candle');
  const lbl = document.getElementById('sbcStrikeValLabel');
  const inp = document.getElementById('sbcStrikeValue');
  const smLabelMap = {
    pct_underlying:  '% Distance from Underlying',
    dollar_underlying:'$ Distance from Underlying',
    pct_leg:         '% Distance from Another Leg',
    dollar_leg:      '$ Distance from Another Leg',
    dollar_prev_candle:'$ Distance from Previous Candle',
    delta:           'Target Delta',
  };
  const smPhMap = { pct_underlying:'5', dollar_underlying:'50', pct_leg:'5', dollar_leg:'50', dollar_prev_candle:'50', delta:'0.30' };
  if (lbl) lbl.textContent = smLabelMap[sm] || '% Distance from Underlying';
  if (inp) inp.placeholder  = smPhMap[sm]  || '5';
}

function sbStepConfigHTML(step) {
  const c = step.config || {};

  // Shared <select> builder — available to every step branch below.
  const _sel = (id, val, opts, extra='') =>
    `<select id="${id}" class="sb-form-select" ${extra}>${opts.map(([v,l])=>`<option value="${v}" ${String(val)===v?'selected':''}>${l}</option>`).join('')}</select>`;

  // ── Time ────────────────────────────────────────────────────────
  if (step.type === 'time') {
    const _days = (c.daysOfWeek && c.daysOfWeek.length) ? c.daysOfWeek : ['any'];
    const _da   = d => _days.includes(d) ? 'active' : '';
    return `
      <div class="sb-form-row">
        <div class="sb-form-label">Days of Week</div>
        <div class="sb-day-toggle">
          <button type="button" class="sb-day-btn ${_da('any')}" data-day="any" onclick="sbDayToggle('any')">Any</button>
          <button type="button" class="sb-day-btn ${_da('mon')}" data-day="mon" onclick="sbDayToggle('mon')">Mon</button>
          <button type="button" class="sb-day-btn ${_da('tue')}" data-day="tue" onclick="sbDayToggle('tue')">Tue</button>
          <button type="button" class="sb-day-btn ${_da('wed')}" data-day="wed" onclick="sbDayToggle('wed')">Wed</button>
          <button type="button" class="sb-day-btn ${_da('thu')}" data-day="thu" onclick="sbDayToggle('thu')">Thu</button>
          <button type="button" class="sb-day-btn ${_da('fri')}" data-day="fri" onclick="sbDayToggle('fri')">Fri</button>
        </div>
      </div>
      <div class="sb-form-row">
        <div class="sb-form-label">Time is</div>
        <select id="sbcTimeMode" class="sb-form-select" onchange="sbTimeModeChange()">
          <option value="exactly" ${c.mode==='exactly'?'selected':''}>Exactly</option>
          <option value="after"   ${c.mode==='after'?'selected':''}>After</option>
          <option value="between" ${c.mode==='between'?'selected':''}>Between</option>
        </select>
      </div>
      <div class="sb-form-row">
        <div class="sb-form-label">Entry Time</div>
        <input id="sbcTime1" class="sb-form-input" type="time" value="${c.time1||'09:30'}">
      </div>
      <div class="sb-form-row" id="sbcTime2Row" style="${c.mode==='between'?'':'display:none'}">
        <div class="sb-form-label">End Time</div>
        <input id="sbcTime2" class="sb-form-input" type="time" value="${c.time2||'16:00'}">
      </div>`;
  }

  // ── Metric ──────────────────────────────────────────────────────
  if (step.type === 'metric') {
    const m   = c.metric || 'price';
    const day = c.day ?? 0;
    const intv = c.interval || '1min';
    const ser  = c.series || 'close';
    const op   = c.operator || '>';

    // Migrate old compareType values to new comparator field
    const _ctMig = { price:'compare_price', indicator:'compare_sma', bar_delta:'value' };
    const ct = c.comparator || _ctMig[c.compareType] || c.compareType || 'value';
    const isLiveQuote = m === 'current_price';
    const allowedCts = _sbAllowedComps(m, c.macdComponent || 'histogram');
    const safeCt = allowedCts.includes(ct) ? ct : 'value';

    const rightDay  = c.rightDay ?? 0;
    const rightIntv = c.rightInterval || '1min';
    const rightSer  = c.rightSeries || 'close';

    const noBarCtx = ['gap_pct','iv_rank','delta','theta','current_price'].includes(m);
    const noIntv   = ['change_pct'].includes(m);
    const isCrossOp = op === 'crosses_above' || op === 'crosses_below';
    const showDay  = !noBarCtx;
    // Always expose Candle Type for cross operators — the backend needs the
    // interval to fetch bars for cross detection even when the metric is a
    // live quote (current_price).
    const showIntv = (!noBarCtx || isCrossOp) && !noIntv && day === 0;
    const showSer  = ['price','sma','ema','rsi','macd','roc'].includes(m);
    const showP    = ['sma','ema','rsi','roc'].includes(m);
    const showMacd = m === 'macd';
    const showOpts = ['iv_rank','delta','theta'].includes(m);

    const showRight     = safeCt !== 'value';
    const rightIsPrice  = safeCt === 'compare_price';
    const rightIsVwap   = safeCt === 'compare_vwap';
    const rightIsIndic  = ['compare_sma','compare_ema','compare_rsi'].includes(safeCt);
    const showRightDay  = showRight && rightIsPrice;
    const showRightIntv = showRight && rightIsPrice;
    const showRightSer  = showRight && rightIsPrice;
    const showRightPer  = showRight && (rightIsIndic || rightIsVwap);

    const andM     = c.andMetric || 'rsi';
    const andEn    = c.andEnabled || false;
    const showAndP = ['sma','ema','rsi','roc'].includes(andM);

    const DAY_OPTS  = [['0','Today (0)'],['-1','Yesterday (-1)'],['-2','2 days ago (-2)'],['-3','3 days ago (-3)'],['-4','4 days ago (-4)'],['-5','5 days ago (-5)']];
    const INTV_OPTS = [['1min','Minute (1min)'],['5min','5-Minute'],['15min','15-Minute'],['day','Daily bar']];
    const SER_OPTS  = [['open','Open'],['high','High'],['low','Low'],['close','Close']];
    const OP_OPTS   = [['>','Greater than (>)'],['<','Less than (<)'],['>=','Greater or equal (>=)'],['<=','Less or equal (<=)'],['=','Equal (=)'],['crosses_above','Crosses Above ↑'],['crosses_below','Crosses Below ↓']];
    const AOPT_OPTS = [['>','> Greater than'],['<','< Less than'],['>=','>= Greater or equal'],['<=','<= Less or equal'],['=','= Equal']];
    const AND_METRICS = [['rsi','RSI'],['sma','SMA'],['ema','EMA'],['macd','MACD'],['price','Price'],['volume','Volume'],['roc','ROC'],['gap_pct','Gap%'],['change_pct','Change%']];

    const _ALL_COMP_OPTS = [
      ['value',              'Fixed Value'],
      ['compare_price',      'Compare Price'],
      ['compare_vwap',       'Compare VWAP'],
      ['compare_sma',        'Compare SMA'],
      ['compare_ema',        'Compare EMA'],
      ['compare_rsi',        'Compare RSI'],
      ['none',               'None (color only)'],
      ['compare_prev_candle','Previous Candle'],
    ];
    const COMP_OPTS = _ALL_COMP_OPTS.filter(([k]) => allowedCts.includes(k));

    // Current-candle sub-form values + option lists
    const isCCm       = m === 'current_candle';
    const ccPrevm     = isCCm && safeCt === 'compare_prev_candle';
    let   ccDp        = c.ccDatapoint || 'price';
    if (ccDp === 'close') ccDp = 'price';   // forming candle has no close → live price
    const ccColor     = c.ccColor || 'either';
    const ccRightDp   = c.ccRightDatapoint || 'close';
    const ccRightColor= c.ccRightColor || 'either';
    const CC_LDP_OPTS = [['open','Open'],['high','High'],['low','Low'],['price','Current Price (live)']];
    const CC_RDP_OPTS = [['close','Close'],['open','Open'],['high','High'],['low','Low']];
    const CC_CLR_OPTS = [['either','Either color'],['green','Green'],['red','Red']];

    return `
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin-bottom:8px;">Left Side (Compare this)</div>

      <div class="sb-form-row">
        <div class="sb-form-label">Symbol</div>
        <input id="sbcMetricSymbol" class="sb-form-input" placeholder="Default: bot symbol" value="${c.metricSymbol||''}" style="text-transform:uppercase;">
      </div>

      <div class="sb-form-row">
        <div class="sb-form-label">Metric</div>
        <select id="sbcMetric" class="sb-form-select" onchange="sbMetricChange()">
          <optgroup label="Price">
            <option value="current_price" ${m==='current_price'?'selected':''}>Current Price (live quote)</option>
            <option value="price"         ${m==='price'?'selected':''}>Price (bar series)</option>
            <option value="gap_pct"       ${m==='gap_pct'?'selected':''}>Gap % — today open vs prev close</option>
            <option value="change_pct"    ${m==='change_pct'?'selected':''}>Change % — day over day</option>
            <option value="roc"           ${m==='roc'?'selected':''}>ROC — Rate of Change</option>
            <option value="volume"        ${m==='volume'?'selected':''}>Volume</option>
          </optgroup>
          <optgroup label="Indicators">
            <option value="sma"  ${m==='sma'?'selected':''}>SMA</option>
            <option value="ema"  ${m==='ema'?'selected':''}>EMA</option>
            <option value="rsi"  ${m==='rsi'?'selected':''}>RSI</option>
            <option value="macd" ${m==='macd'?'selected':''}>MACD</option>
          </optgroup>
          <optgroup label="Candle">
            <option value="current_candle" ${m==='current_candle'?'selected':''}>Current Candle</option>
          </optgroup>
          <optgroup label="Options (ATM)">
            <option value="iv_rank" ${m==='iv_rank'?'selected':''}>IV% — ATM implied volatility</option>
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
        <div class="sb-form-label">Candle Type</div>
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
        ${_sel('sbcMacdComp', c.macdComponent||'histogram', [['histogram','Histogram'],['macd_line','MACD Line'],['signal_line','Signal Line']], 'onchange="sbSyncMetricForm()"')}
      </div>
      <div class="sb-form-row" id="sbcOptTypeRow" style="${showOpts?'':'display:none'}">
        <div class="sb-form-label">Option Type</div>
        ${_sel('sbcOptType', c.optType||'call', [['call','Call'],['put','Put']])}
      </div>
      <div class="sb-form-row" id="sbcOptDteRow" style="${showOpts?'':'display:none'}">
        <div class="sb-form-label">Target DTE</div>
        <input id="sbcOptDte" class="sb-form-input" type="number" min="1" max="365" value="${c.optDte??30}" placeholder="30">
      </div>

      <div class="sb-form-row" id="sbcCcLeftRow" style="${isCCm?'':'display:none'}">
        <div class="sb-form-label">Current candle datapoint</div>
        ${_sel('sbcCcDatapoint', ccDp, CC_LDP_OPTS)}
      </div>
      <div class="sb-form-row" id="sbcCcColorRow" style="${isCCm?'':'display:none'}">
        <div class="sb-form-label">Current candle color</div>
        ${_sel('sbcCcColor', ccColor, CC_CLR_OPTS)}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:4px;">
        <div>
          <div class="sb-form-label">Operator</div>
          ${_sel('sbcOperator', op, OP_OPTS, 'onchange="sbOperatorChange()"')}
        </div>
        <div>
          <div class="sb-form-label">Comparator</div>
          ${_sel('sbcComparator', safeCt, COMP_OPTS, 'onchange="sbCompareTypeChange()"')}
        </div>
      </div>

      <div class="sb-form-row" id="sbcValueRow" style="${safeCt==='value'?'':'display:none'}">
        <div class="sb-form-label">Value</div>
        <input id="sbcMetricValue" class="sb-form-input" type="number" step="0.01" placeholder="e.g. 50" value="${c.value||''}">
      </div>

      <div id="sbcRightSide" style="${showRight?'':'display:none'};margin-top:10px;padding:10px 12px;background:#f8faff;border-radius:8px;border:1px solid #c7d9f5;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin-bottom:8px;">Right Side (To this)</div>
        <div class="sb-form-row" id="sbcCcRightDpRow" style="${ccPrevm?'':'display:none'}">
          <div class="sb-form-label">Previous candle datapoint</div>
          ${_sel('sbcCcRightDatapoint', ccRightDp, CC_RDP_OPTS)}
        </div>
        <div class="sb-form-row" id="sbcCcRightColorRow" style="${ccPrevm?'':'display:none'}">
          <div class="sb-form-label">Previous candle color gate</div>
          ${_sel('sbcCcRightColor', ccRightColor, CC_CLR_OPTS)}
        </div>
        <div class="sb-form-row" id="sbcRightDayRow" style="${showRightDay?'':'display:none'}">
          <div class="sb-form-label">Day</div>
          ${_sel('sbcRightDay', String(rightDay), DAY_OPTS, 'onchange="sbRightDayChange()"')}
        </div>
        <div class="sb-form-row" id="sbcRightIntervalRow" style="${showRightIntv?'':'display:none'}">
          <div class="sb-form-label">Candle Type</div>
          ${_sel('sbcRightInterval', rightIntv, INTV_OPTS)}
        </div>
        <div class="sb-form-row" id="sbcRightSeriesRow" style="${showRightSer?'':'display:none'}">
          <div class="sb-form-label">Price Type</div>
          ${_sel('sbcRightSeries', rightSer, SER_OPTS)}
        </div>
        <div class="sb-form-row" id="sbcRightPeriodRow" style="${showRightPer?'':'display:none'}">
          <div class="sb-form-label">Period</div>
          <input id="sbcRightPeriod" class="sb-form-input" type="number" min="1" max="500" value="${c.rightPeriod||20}">
        </div>
        <div id="sbcThresholdRow" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:4px;">
          <div>
            <div class="sb-form-label">Threshold Unit</div>
            ${_sel('sbcThresholdUnit', c.thresholdUnit||'percent', [['percent','Percent (%)'],['dollar','Dollar ($)']])}
          </div>
          <div>
            <div class="sb-form-label">Threshold Value</div>
            <input id="sbcThresholdValue" class="sb-form-input" type="number" step="0.01" placeholder="e.g. 2.5 (0 = exact)" value="${c.thresholdValue||''}">
          </div>
        </div>
        <div class="sb-form-row" id="sbcRightLookbackRow" style="${showRight && safeCt!=='compare_vwap'?'':'display:none'}">
          <div class="sb-form-label">Restrict to N bars ago <span style="font-weight:400;color:#94a3b8;">(optional)</span></div>
          <input id="sbcRightLookback" class="sb-form-input" type="number" min="0" max="500" value="${c.rightLookback != null && c.rightLookback !== 0 ? c.rightLookback : ''}" placeholder="e.g. 3">
        </div>
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
    const otList = _otListForStrategy(s);
    const otOpts = otList
      .map(t => `<option value="${t}" ${c.orderType===t?'selected':''}>${t.charAt(0).toUpperCase()+t.slice(1)}</option>`)
      .join('');
    const _ot = c.orderType || 'market';
    const { showMin: _showMin, showMax: _showMax } = _sbPriceRowVisibility(_ot, isEquity);
    const _minLbl = isEquity ? 'Limit Price ($)' : (_ot === 'credit' ? 'Credit Limit Price ($)' : 'Min Price Filter ($)');
    const _minHint = isEquity ? '(optional — 0 = auto last)' : (_ot === 'credit' ? '(optional — 0 = auto mid)' : '(optional — 0 = no minimum)');
    const _maxLbl = _ot === 'debit' ? 'Debit Limit Price ($)' : 'Max Price Filter ($)';
    const _maxHint = _ot === 'debit' ? '(optional — 0 = auto mid)' : '(optional — 0 = no maximum)';

    const showStrikeVal  = !isStraddle && sm !== 'atm';
    const _smLbl = { pct_underlying:'% Distance from Underlying', dollar_underlying:'$ Distance from Underlying',
                     pct_leg:'% Distance from Another Leg', dollar_leg:'$ Distance from Another Leg',
                     dollar_prev_candle:'$ Distance from Previous Candle', delta:'Target Delta' };
    const _smPh  = { pct_underlying:'5', dollar_underlying:'50', pct_leg:'5', dollar_leg:'50', dollar_prev_candle:'50', delta:'0.30' };
    const strikeValLabel = _smLbl[sm] || '% Distance from Underlying';
    const strikeValPh    = _smPh[sm]  || '5';
    const _dirMethods = ['dollar_underlying','pct_underlying','dollar_leg','pct_leg','dollar_prev_candle'];
    const showStrikeDir  = showStrikeVal && _dirMethods.includes(sm) && !isEquity;
    const showStrikeFb   = showStrikeVal && !isEquity;
    const showStrikePrev = sm === 'dollar_prev_candle' && !isStraddle && !isEquity;
    const sd = c.strikeDirection || 'auto';
    const sf = c.strikeFallback  || 'closest';
    const _spType  = c.prevCandleType || '1min';
    const _spDay   = String(c.prevCandleDay ?? 0);
    const _spDp    = c.prevCandleDatapoint || 'close';
    const _spColor = c.prevCandleColor || 'either';
    const _SP_INTV = [['1min','1-minute'],['5min','5-minute'],['15min','15-minute'],['day','Daily']];
    const _SP_DAY  = [['0','Current day'],['-1','1 day ago'],['-2','2 days ago'],['-3','3 days ago'],['-4','4 days ago'],['-5','5 days ago']];
    const _SP_DP   = [['close','Close'],['open','Open'],['high','High'],['low','Low']];
    const _SP_CLR  = [['either','Either color'],['green','Green'],['red','Red']];

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

      <!-- DTE: standard (hidden for calendar/diagonal and equity) -->
      <div class="sb-form-row" id="sbcDteRow" style="${isCal||isEquity?'display:none':''}">
        <div class="sb-form-label">DTE — Days to Expiration</div>
        <input id="sbcDte" class="sb-form-input" type="number" min="0" max="365" value="${c.dte??30}" placeholder="30">
      </div>
      <!-- Front/Back DTE (calendar/diagonal only) -->
      <div class="sb-form-row" id="sbcFrontDteRow" style="${isCal&&!isEquity?'':'display:none'}">
        <div class="sb-form-label">Front Leg DTE — near expiry</div>
        <input id="sbcFrontDte" class="sb-form-input" type="number" min="0" max="365" value="${c.frontDte??7}" placeholder="7">
      </div>
      <div class="sb-form-row" id="sbcBackDteRow" style="${isCal&&!isEquity?'':'display:none'}">
        <div class="sb-form-label">Back Leg DTE — far expiry</div>
        <input id="sbcBackDte" class="sb-form-input" type="number" min="0" max="365" value="${c.backDte??30}" placeholder="30">
      </div>

      <!-- Strike selection (hidden for straddle/equity: always ATM or N/A) -->
      <div class="sb-form-row" id="sbcStrikeRow" style="${isStraddle||isEquity?'display:none':''}">
        <div class="sb-form-label" id="sbcStrikeRowLabel">Strike Selection${isIron?' — short legs':''}</div>
        <select id="sbcStrikeMethod" class="sb-form-select" onchange="sbStrikeMethodChange()">
          <option value="atm"               ${sm==='atm'?'selected':''}>1. ATM — At the Money</option>
          <option value="pct_underlying"    ${sm==='pct_underlying'?'selected':''}>2. % Distance from Underlying</option>
          <option value="dollar_underlying" ${sm==='dollar_underlying'?'selected':''}>3. $ Distance from Underlying</option>
          <option value="pct_leg"           ${sm==='pct_leg'?'selected':''}>4. % Distance from Another Leg</option>
          <option value="dollar_leg"        ${sm==='dollar_leg'?'selected':''}>5. $ Distance from Another Leg</option>
          <option value="delta"             ${sm==='delta'?'selected':''}>6. Delta-based Strike Selection</option>
          <option value="dollar_prev_candle" ${sm==='dollar_prev_candle'?'selected':''}>7. $ Distance from Previous Candle</option>
        </select>
      </div>
      <div id="sbcStrikePrevRows" style="${showStrikePrev?'':'display:none'}">
        <div class="sb-form-row">
          <div class="sb-form-label">Previous candle type</div>
          ${_sel('sbcPrevCandleType', _spType, _SP_INTV)}
        </div>
        <div class="sb-form-row">
          <div class="sb-form-label">Day offset</div>
          ${_sel('sbcPrevCandleDay', _spDay, _SP_DAY)}
        </div>
        <div class="sb-form-row">
          <div class="sb-form-label">Candle datapoint</div>
          ${_sel('sbcPrevCandleDatapoint', _spDp, _SP_DP)}
        </div>
        <div class="sb-form-row">
          <div class="sb-form-label">Candle color gate</div>
          ${_sel('sbcPrevCandleColor', _spColor, _SP_CLR)}
        </div>
      </div>
      <div class="sb-form-row" id="sbcStrikeValRow" style="${showStrikeVal&&!isEquity?'':'display:none'}">
        <div class="sb-form-label" id="sbcStrikeValLabel">${strikeValLabel}</div>
        <input id="sbcStrikeValue" class="sb-form-input" type="number" step="0.01" value="${c.strikeValue||''}" placeholder="${strikeValPh}">
      </div>
      <div class="sb-form-row" id="sbcStrikeDirRow" style="${showStrikeDir?'':'display:none'}">
        <div class="sb-form-label">Direction — Leg 1 strike placement</div>
        <select id="sbcStrikeDirection" class="sb-form-select">
          <option value="auto"  ${sd==='auto' ?'selected':''}>Auto (derived from option type)</option>
          <option value="below" ${sd==='below'?'selected':''}>Below underlying</option>
          <option value="above" ${sd==='above'?'selected':''}>Above underlying</option>
        </select>
      </div>
      <div class="sb-form-row" id="sbcStrikeFbRow" style="${showStrikeFb?'':'display:none'}">
        <div class="sb-form-label">Strike Selection Fallback</div>
        <select id="sbcStrikeFallback" class="sb-form-select">
          <option value="closest"  ${sf==='closest' ?'selected':''}>Closest available strike (default)</option>
          <option value="or_higher" ${sf==='or_higher'?'selected':''}>Or Higher — round up to next available strike</option>
          <option value="or_lower"  ${sf==='or_lower' ?'selected':''}>Or Lower — round down to next available strike</option>
          <option value="skip"     ${sf==='skip'    ?'selected':''}>Skip trade if exact strike unavailable</option>
        </select>
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

      <!-- TP / SL (options only, both optional) -->
      <div class="sb-form-row" id="sbcTpRow" style="${isEquity?'display:none':''}">
        <div class="sb-form-label">Take Profit — % of max profit <span style="color:#94a3b8;font-weight:400;">(optional)</span></div>
        <input id="sbcTakeProfitPct" class="sb-form-input" type="number" min="0" max="100" step="1" value="${c.takeProfitPct ?? ''}" placeholder="e.g. 50 (leave blank to disable)">
      </div>
      <div class="sb-form-row" id="sbcSlRow" style="${isEquity?'display:none':''}">
        <div class="sb-form-label">Stop Loss — % of max loss <span style="color:#94a3b8;font-weight:400;">(optional)</span></div>
        <input id="sbcStopLossPct" class="sb-form-input" type="number" min="0" step="1" value="${c.stopLossPct ?? ''}" placeholder="e.g. 200 (leave blank to disable)">
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
      <!-- Price field(s): credit→min only, debit→max only, market→both (range filter) -->
      <div class="sb-form-row" id="sbcLimitMinRow" style="${_showMin ? '' : 'display:none'}">
        <div class="sb-form-label" id="sbcLimitMinLabel">${_minLbl} <span style="color:#94a3b8;font-weight:400;">${_minHint}</span></div>
        <input id="sbcLimitMin" class="sb-form-input" type="number" step="0.01" min="0" value="${c.limitPriceMin || ''}" placeholder="0.00">
      </div>
      <div class="sb-form-row" id="sbcLimitMaxRow" style="${_showMax ? '' : 'display:none'}">
        <div class="sb-form-label" id="sbcLimitMaxLabel">${_maxLbl} <span style="color:#94a3b8;font-weight:400;">${_maxHint}</span></div>
        <input id="sbcLimitMax" class="sb-form-input" type="number" step="0.01" min="0" value="${c.limitPriceMax || ''}" placeholder="0.00">
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
        <div class="sb-form-label">Tag — match positions opened with this tag (leave blank for all)</div>
        <input id="sbcCloseTag" class="sb-form-input" placeholder="e.g. ABC, hedge, IC-1" value="${_escHtml(c.tag||'')}">
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
        <div class="sb-form-label">Tag filter <span style="color:#6b7280;font-weight:400">— leave blank to count all positions</span></div>
        <input id="sbcCondTag" class="sb-form-input" placeholder="e.g. Bot, LC, IC-1" value="${_escHtml(c.tag||'')}"
               oninput="sbCondTagHintUpdate()">
      </div>
      <!-- Tag match hint (shown when tag is set) -->
      <div id="sbcCondTagHint" style="${c.tag ? '' : 'display:none'}padding:9px 12px;background:#fffbeb;border-radius:8px;border:1px solid #fcd34d;font-size:12px;color:#92400e;margin:-4px 0 4px;">
        <i class="fas fa-exclamation-triangle" style="margin-right:6px;color:#f59e0b;"></i>
        <strong>Important:</strong> For tag filtering to work, the <em>Open Position</em> step that places the trade
        must have its <strong>Tag</strong> field set to the same value (<strong id="sbcCondTagEcho">${_escHtml(c.tag||'')}</strong>).
        Without it, the bot cannot track which positions belong to this tag.
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
        When using a tag, the count reflects the number of <em>trades</em> (orders) with that tag still open,
        not the number of individual option legs.
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
      <button class="strat-copy-btn" onclick="stratCopy(${s.id})" title="Copy"><i class="fas fa-copy"></i></button>
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

async function stratCopy(id) {
  try {
    const r = await fetch(`/api/bot/strategies/${id}/copy`, { method: 'POST' });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      alert('Could not copy strategy: ' + (err.error || r.status));
      return;
    }
  } catch (e) { console.error('stratCopy error', e); }
  await strategiesRender();
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

    const noteHtml = step.note
      ? `<div style="margin-top:6px;padding:8px 10px;background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;font-size:11px;color:#92400e;line-height:1.45;">
           <i class="fas fa-exclamation-triangle" style="color:#f59e0b;margin-right:5px;"></i>${_escHtml(step.note)}
         </div>`
      : '';
    flowHtml += `
      <div class="test-step-box ${cls}" style="position:relative;padding-right:44px;">
        ${_stepBadge(step.result)}
        <div class="test-step-label"><i class="${icon}" style="margin-right:6px;opacity:.6;font-size:12px;"></i>${_escHtml(step.label || step.type)}</div>
        ${step.message ? `<div class="test-step-msg ${msgCls}">${msgIcon}${_escHtml(step.message)}</div>` : ''}
        ${noteHtml}
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


// ══════════════════════════════════════════════════════════════════
//   BOT LIVE CHART ENGINE  (mirrors Simulated Trading chart UX/UI)
// ══════════════════════════════════════════════════════════════════

// ── State ─────────────────────────────────────────────────────────
let _bc = null;

// (old static indicator defs removed — now using dynamic add/remove system)

// ── Timeframe map ──────────────────────────────────────────────────
const BC_TF_MINUTES = { '1min':1, '5min':5, '15min':15, '30min':30, '60min':60 };

// ── Initialise ─────────────────────────────────────────────────────
function botChartInit() {
  if (_bc) return;
  _bc = {
    // chart instances
    lwChart: null, candleSeries: null, volSeries: null,
    rsiChart: null,  rsiSeries: null,
    macdChart: null, macdHistSeries: null, macdLineSeries: null, macdSignalSeries: null,
    tsSyncing: false,
    // data
    symbol: 'SPX', tf: '1min',
    minuteBarsCache: [],      // all raw 1-min bars from Tradier
    currentMinuteIndex: 0,   // how many minute bars are "visible" (replay position)
    allBars: [],              // aggregated for current TF (full data)
    displayBars: [],          // aggregated for current TF up to currentMinuteIndex
    // indicator state
    indicators: [], indicatorNextId: 1,
    // flags
    showMarkers: false, markers: [],
    userHasDragged: false,
    isPlaying: false, playTimer: null,
    rtTimer: null, isRealtime: false,
  };

  // Wire up timeframe buttons
  document.querySelectorAll('#botChartCard .sim-tf-btn').forEach(btn => {
    btn.addEventListener('click', () => bcSwitchTf(btn.dataset.tf));
  });

  // Wire up nav buttons
  document.getElementById('bcPrevBar')?.addEventListener('click', bcShowPreviousBar);
  document.getElementById('bcNextBar')?.addEventListener('click', bcShowNextBar);
  document.getElementById('bcPlayPauseBtn')?.addEventListener('click', bcToggleAutoplay);

  // Speed change restarts autoplay timer
  document.getElementById('bcAutoplaySpeed')?.addEventListener('change', () => {
    if (_bc && _bc.isPlaying) { bcStopAutoplay(); bcStartAutoplay(); }
  });

  // Close indicator dropdown on outside click
  document.addEventListener('click', e => {
    const dd  = document.getElementById('bcIndicatorDropdown');
    const btn = document.getElementById('bcIndicatorBtn');
    if (dd && !dd.contains(e.target) && btn && !btn.contains(e.target))
      dd.style.display = 'none';
  });
  document.getElementById('bcIndicatorBtn')?.addEventListener('click', e => {
    e.stopPropagation();
    const dd = document.getElementById('bcIndicatorDropdown');
    if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
  });

  const card = document.getElementById('botChartCard');
  if (card) card.style.display = 'block';

  // Default load after 200 ms
  setTimeout(() => { if (_bc && !_bc.minuteBarsCache.length) bcLoad(); }, 200);
}

// ── ET datetime string → Unix seconds (naive/wall-clock) ──────────
// Tradier returns either "YYYY-MM-DDTHH:MM:SS" (ISO) or
// "YYYY-MM-DD HH:MM:SS" (space-sep), both in US/Eastern time.
//
// We intentionally treat the ET timestamp AS IF it were UTC by appending "Z".
// This is the standard "naive time" trick for trading charts: LightweightCharts
// then labels the X-axis with the actual ET wall-clock time (09:30, 16:00, etc.)
// instead of converting to the viewer's browser timezone or displaying UTC+0.
function _bcEtToSec(dtStr) {
  if (!dtStr) return 0;
  const norm = dtStr.replace('T', ' ');
  const spaceIdx = norm.indexOf(' ');
  if (spaceIdx === -1) return 0;
  const date = norm.slice(0, spaceIdx);
  const time = norm.slice(spaceIdx + 1);
  if (!date || !time) return 0;
  // Append Z so Date() treats it as UTC → LightweightCharts shows ET labels
  return Math.floor(new Date(`${date}T${time}Z`).getTime() / 1000);
}

// ── Normalise a Tradier time string to "YYYY-MM-DD HH:MM:SS" ──────
function _bcNormTime(dtStr) {
  return dtStr ? dtStr.replace('T', ' ') : '';
}

// ── Parse ET "YYYY-MM-DD HH:MM" → Unix ms (same naive convention) ─
function _bcEtToMs(dateStr, timeStr) {
  // Append Z to match the naive convention used by _bcEtToSec
  return new Date(`${dateStr}T${timeStr}:00Z`).getTime();
}

// ── Aggregate minute bars → target TF ─────────────────────────────
function _bcAggregateBars(minuteBars, tf) {
  const mins = BC_TF_MINUTES[tf] || 1;
  if (mins === 1) return minuteBars.map(b => ({ ...b, timestamp: _bcEtToSec(b.time) * 1000 }));
  const bucketMs = mins * 60 * 1000;
  const result = [];
  let bucket = null, bucketKey = null;
  for (const b of minuteBars) {
    const ms  = _bcEtToSec(b.time) * 1000;
    const key = Math.floor(ms / bucketMs) * bucketMs;
    if (key !== bucketKey) {
      if (bucket) result.push(bucket);
      bucketKey = key;
      bucket = { timestamp: key, time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume };
    } else {
      bucket.high   = Math.max(bucket.high, b.high);
      bucket.low    = Math.min(bucket.low,  b.low);
      bucket.close  = b.close;
      bucket.volume = (bucket.volume || 0) + (b.volume || 0);
    }
  }
  if (bucket) result.push(bucket);
  return result;
}

function _bcRebuildBars() {
  const tf = _bc.tf;
  _bc.allBars     = _bcAggregateBars(_bc.minuteBarsCache, tf);
  _bc.displayBars = _bcAggregateBars(_bc.minuteBarsCache.slice(0, _bc.currentMinuteIndex), tf);
}

// ── Fetch and render chart ─────────────────────────────────────────
async function bcLoad() {
  if (!_bc) return;
  const sym  = (document.getElementById('bcSymInput')?.value || '').trim().toUpperCase() || _bc.symbol;
  const days = parseInt(document.getElementById('bcDaysBack')?.value || '5', 10);
  _bc.symbol = sym;

  bcShowLoader(`<i class="fas fa-spinner fa-spin" style="font-size:22px;"></i><span>Loading ${sym}…</span>`);

  try {
    const resp = await fetch(`/api/bot/tradier/bars?symbol=${encodeURIComponent(sym)}&days=${days}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'API error');
    if (!data.bars || !data.bars.length) throw new Error(`No data for ${sym} (market may be closed)`);

    _bc.minuteBarsCache    = data.bars;
    _bc.currentMinuteIndex = data.bars.length; // start at "live" (end)
    _bc.userHasDragged     = false;
    _bcRebuildBars();
    bcCreateLWChart();
    bcUpdateChartData();
    if (_bc.showMarkers) bcApplyMarkers();
    bcShowLoader(null);
    bcUpdateNavButtons();
    bcUpdateSymbolDisplay();
  } catch(e) {
    bcShowLoader(`<i class="fas fa-exclamation-circle" style="font-size:22px;color:#f23645;"></i><span>${e.message}</span>`);
  }
}

function bcShowLoader(html) {
  const loader = document.getElementById('bcChartLoader');
  const main   = document.getElementById('bcLWChartContainer');
  if (!loader) return;
  if (!html) {
    loader.style.display = 'none';
    if (main) main.style.minHeight = '0';
  } else {
    loader.innerHTML = html;
    loader.style.display = 'flex';
  }
}

// ── Create / destroy main LightweightCharts instance ──────────────
function bcCreateLWChart() {
  bcDestroyLWChart();
  const container = document.getElementById('bcLWChartContainer');
  if (!container || typeof LightweightCharts === 'undefined') return;

  _bc.lwChart = LightweightCharts.createChart(container, {
    layout: {
      background: { type: 'solid', color: '#ffffff' },
      textColor: '#191919',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: 12
    },
    grid: { vertLines: { color: '#e1e3eb' }, horzLines: { color: '#e1e3eb' } },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: { color: '#9598a1', width: 1, style: 3, labelBackgroundColor: '#2962ff' },
      horzLine: { color: '#9598a1', width: 1, style: 3, labelBackgroundColor: '#2962ff' }
    },
    rightPriceScale: { borderColor: '#d1d4dc', scaleMargins: { top: 0.1, bottom: 0.2 } },
    timeScale: {
      borderColor: '#d1d4dc', timeVisible: true, secondsVisible: false,
      rightOffset: 5, barSpacing: 6, minBarSpacing: 2
    },
    handleScroll: { vertTouchDrag: false },
    handleScale: { axisPressedMouseMove: true }
  });

  _bc.candleSeries = _bc.lwChart.addCandlestickSeries({
    upColor: '#089981', downColor: '#f23645',
    borderUpColor: '#089981', borderDownColor: '#f23645',
    wickUpColor: '#089981', wickDownColor: '#f23645'
  });

  _bc.volSeries = _bc.lwChart.addHistogramSeries({
    color: '#089981',
    priceFormat: { type: 'volume' },
    priceScaleId: '',
    scaleMargins: { top: 0.85, bottom: 0 }
  });

  // Crosshair → OHLCV bar update
  _bc.lwChart.subscribeCrosshairMove(param => {
    if (!param || !param.time || !param.seriesData) return;
    const d = param.seriesData.get(_bc.candleSeries);
    if (d) {
      bcUpdateOHLCDisplayForBar({
        open: d.open, high: d.high, low: d.low, close: d.close,
        volume: param.seriesData.get(_bc.volSeries)?.value || 0,
        timestamp: param.time * 1000
      });
    }
  });

  // Time-scale sync with sub-panes
  _bc.lwChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
    if (_bc.lwChart && _bc.lwChart._userScrolling) _bc.userHasDragged = true;
    if (!_bc.tsSyncing && range) {
      _bc.tsSyncing = true;
      try {
        if (_bc.rsiChart)  _bc.rsiChart.timeScale().setVisibleLogicalRange(range);
        if (_bc.macdChart) _bc.macdChart.timeScale().setVisibleLogicalRange(range);
      } finally { _bc.tsSyncing = false; }
    }
  });

  function onDown() { if (_bc.lwChart) _bc.lwChart._userScrolling = true; }
  function onUp()   { if (_bc.lwChart) _bc.lwChart._userScrolling = false; }
  function onWheel(){ _bc.userHasDragged = true; }
  container.addEventListener('mousedown', onDown);
  container.addEventListener('mouseup', onUp);
  container.addEventListener('touchstart', onDown);
  container.addEventListener('touchend', onUp);
  container.addEventListener('wheel', onWheel, { passive: true });

  const ro = new ResizeObserver(entries => {
    if (!_bc.lwChart) return;
    const { width, height } = entries[0].contentRect;
    _bc.lwChart.applyOptions({ width, height });
  });
  ro.observe(container);
  _bc._cleanup = { container, onDown, onUp, onWheel, ro };
}

function bcDestroyLWChart() {
  if (_bc._cleanup) {
    const c = _bc._cleanup;
    c.container.removeEventListener('mousedown', c.onDown);
    c.container.removeEventListener('mouseup', c.onUp);
    c.container.removeEventListener('touchstart', c.onDown);
    c.container.removeEventListener('touchend', c.onUp);
    c.container.removeEventListener('wheel', c.onWheel);
    c.ro.disconnect();
    _bc._cleanup = null;
  }
  if (_bc.lwChart) {
    _bc.indicators.forEach(ind => { ind.series = null; });
    _bc.indicators = [];
    _bc.indicatorNextId = 1;
    bcDestroyRSIPane();
    bcDestroyMACDPane();
    try { _bc.lwChart.remove(); } catch(_) {}
    _bc.lwChart = null;
    _bc.candleSeries = null;
    _bc.volSeries = null;
  }
  bcRefreshIndicatorsList();
}

// ── Set chart data ─────────────────────────────────────────────────
function bcUpdateChartData() {
  if (!_bc.lwChart || !_bc.candleSeries) return;
  const bars = _bc.displayBars;
  if (!bars.length) return;

  const seen = new Set();
  const candleData = [], volData = [];
  for (const b of bars) {
    const t = Math.floor(b.timestamp / 1000);
    if (seen.has(t)) continue;
    seen.add(t);
    candleData.push({ time: t, open: b.open, high: b.high, low: b.low, close: b.close });
    volData.push({ time: t, value: b.volume || 0, color: b.close >= b.open ? 'rgba(8,153,129,0.4)' : 'rgba(242,54,69,0.4)' });
  }
  _bc.candleSeries.setData(candleData);
  _bc.volSeries.setData(volData);
  bcUpdateAllIndicators();
  bcUpdateOHLCDisplay();
  bcUpdateSymbolDisplay();

  const isLive = _bc.currentMinuteIndex >= _bc.minuteBarsCache.length;
  if (isLive && !_bc.userHasDragged) {
    _bc.lwChart.timeScale().scrollToPosition(5, false);
  }
}

// ── Timeframe switch ───────────────────────────────────────────────
function bcSwitchTf(tf) {
  if (!_bc || !BC_TF_MINUTES[tf]) return;
  _bc.tf = tf;
  document.querySelectorAll('#botChartCard .sim-tf-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tf === tf)
  );
  if (!_bc.minuteBarsCache.length) return;
  _bcRebuildBars();
  bcCreateLWChart();
  bcUpdateChartData();
  if (_bc.showMarkers) bcApplyMarkers();
  bcUpdateNavButtons();
}

// ── Navigation ─────────────────────────────────────────────────────
function bcShowNextBar() {
  bcStopAutoplay();
  const skip = parseInt(document.getElementById('bcAutoplayInterval')?.value) || 1;
  if (_bc.currentMinuteIndex < _bc.minuteBarsCache.length) {
    _bc.currentMinuteIndex = Math.min(_bc.minuteBarsCache.length, _bc.currentMinuteIndex + skip);
    _bcRebuildBars();
    bcUpdateChartData();
    bcUpdateNavButtons();
    if (!_bc.userHasDragged) _bc.lwChart?.timeScale().scrollToPosition(5, false);
  }
}

function bcShowPreviousBar() {
  bcStopAutoplay();
  const skip = parseInt(document.getElementById('bcAutoplayInterval')?.value) || 1;
  if (_bc.currentMinuteIndex > 0) {
    _bc.currentMinuteIndex = Math.max(0, _bc.currentMinuteIndex - skip);
    _bcRebuildBars();
    bcUpdateChartData();
    bcUpdateNavButtons();
  }
}

function bcToggleAutoplay() {
  if (_bc.isPlaying) bcStopAutoplay(); else bcStartAutoplay();
}

function bcStartAutoplay() {
  if (_bc.isPlaying) return;
  if (_bc.currentMinuteIndex >= _bc.minuteBarsCache.length) return;
  _bc.isPlaying = true;
  const icon = document.getElementById('bcPlayIcon');
  if (icon) icon.className = 'fas fa-pause';
  const speed = parseInt(document.getElementById('bcAutoplaySpeed')?.value) || 3000;
  _bc.playTimer = setInterval(() => {
    const skip = parseInt(document.getElementById('bcAutoplayInterval')?.value) || 1;
    if (_bc.currentMinuteIndex >= _bc.minuteBarsCache.length) { bcStopAutoplay(); return; }
    _bc.currentMinuteIndex = Math.min(_bc.minuteBarsCache.length, _bc.currentMinuteIndex + skip);
    _bcRebuildBars();
    bcUpdateChartData();
    bcUpdateNavButtons();
    if (!_bc.userHasDragged) _bc.lwChart?.timeScale().scrollToPosition(5, false);
    if (_bc.currentMinuteIndex >= _bc.minuteBarsCache.length) bcStopAutoplay();
  }, speed);
}

function bcStopAutoplay() {
  _bc.isPlaying = false;
  if (_bc.playTimer) { clearInterval(_bc.playTimer); _bc.playTimer = null; }
  const icon = document.getElementById('bcPlayIcon');
  if (icon) icon.className = 'fas fa-play';
}

function bcResetView() {
  if (!_bc || !_bc.lwChart) return;
  _bc.userHasDragged = false;
  _bc.lwChart.timeScale().scrollToPosition(5, true);
}

function bcUpdateNavButtons() {
  const prevBtn = document.getElementById('bcPrevBar');
  const nextBtn = document.getElementById('bcNextBar');
  if (prevBtn) prevBtn.disabled = (_bc.currentMinuteIndex <= 0);
  if (nextBtn) nextBtn.disabled = (_bc.currentMinuteIndex >= _bc.minuteBarsCache.length);

  // Bar visibility info
  const barInfo = document.getElementById('bcBarVisibilityInfo');
  if (barInfo && _bc.allBars.length) {
    const hidden = _bc.allBars.length - _bc.displayBars.length;
    barInfo.textContent = `${_bc.displayBars.length} bars | +${hidden}`;
  }

  // Current time display
  const timeEl = document.getElementById('bcCurrentTimeDisplay');
  const gotoDate = document.getElementById('bcGotoDate');
  const gotoTime = document.getElementById('bcGotoTime');
  if (_bc.currentMinuteIndex > 0 && _bc.minuteBarsCache.length) {
    const bar = _bc.minuteBarsCache[_bc.currentMinuteIndex - 1];
    if (bar) {
      const norm  = _bcNormTime(bar.time);  // "YYYY-MM-DD HH:MM:SS"
      const parts = norm.split(' ');
      const datePart = parts[0] || '';      // "YYYY-MM-DD"
      const timePart = (parts[1] || '').slice(0, 5); // "HH:MM"
      if (timeEl) timeEl.textContent = timePart;
      if (gotoDate && !gotoDate.matches(':focus')) {
        const dp = datePart.split('-');
        if (dp.length === 3) gotoDate.value = `${dp[1]}/${dp[2]}/${dp[0]}`;
      }
      if (gotoTime && !gotoTime.matches(':focus')) gotoTime.value = timePart;
    }
  }
}

// ── Go to date/time ────────────────────────────────────────────────
function bcGoTo() {
  if (!_bc || !_bc.minuteBarsCache.length) return;
  const gotoDateVal = document.getElementById('bcGotoDate')?.value.trim();
  const gotoTimeVal = document.getElementById('bcGotoTime')?.value.trim();

  let targetDateStr, targetTime = '09:30';

  if (gotoDateVal) {
    const parts = gotoDateVal.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!parts) { alert('Please enter date as MM/DD/YYYY'); return; }
    targetDateStr = `${parts[3]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
  } else if (_bc.currentMinuteIndex > 0) {
    const bar = _bc.minuteBarsCache[_bc.currentMinuteIndex - 1];
    targetDateStr = _bcNormTime(bar.time || '').split(' ')[0];
  } else { alert('Please enter a date'); return; }

  if (gotoTimeVal) {
    const tp = gotoTimeVal.match(/^(\d{1,2}):(\d{2})$/);
    if (!tp) { alert('Please enter time as HH:MM'); return; }
    targetTime = `${tp[1].padStart(2,'0')}:${tp[2]}`;
  }

  const targetMs = _bcEtToMs(targetDateStr, targetTime);
  let targetIdx  = -1;
  for (let i = 0; i < _bc.minuteBarsCache.length; i++) {
    if (_bcEtToSec(_bc.minuteBarsCache[i].time) * 1000 >= targetMs) { targetIdx = i + 1; break; }
  }
  if (targetIdx === -1) targetIdx = _bc.minuteBarsCache.length;

  _bc.currentMinuteIndex = targetIdx;
  _bcRebuildBars();
  bcUpdateChartData();
  bcUpdateNavButtons();
  _bc.userHasDragged = false;
  _bc.lwChart?.timeScale().scrollToPosition(5, false);
}

// ── OHLCV display ──────────────────────────────────────────────────
function bcUpdateOHLCDisplay() {
  if (!_bc.displayBars.length) return;
  bcUpdateOHLCDisplayForBar(_bc.displayBars[_bc.displayBars.length - 1]);
}

function bcUpdateOHLCDisplayForBar(bar) {
  if (!bar) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('bcOHLC_O', bar.open?.toFixed(2) ?? '-');
  set('bcOHLC_H', bar.high?.toFixed(2) ?? '-');
  set('bcOHLC_L', bar.low?.toFixed(2)  ?? '-');
  set('bcOHLC_C', bar.close?.toFixed(2) ?? '-');
  const vol = bar.volume || 0;
  set('bcOHLC_V', vol >= 1e6 ? (vol/1e6).toFixed(2)+'M' : vol >= 1e3 ? (vol/1e3).toFixed(0)+'K' : String(vol));
}

function bcUpdateSymbolDisplay() {
  const symEl    = document.getElementById('bcChartSymbolDisplay');
  const priceEl  = document.getElementById('bcChartPriceDisplay');
  const changeEl = document.getElementById('bcChartChangeDisplay');
  if (symEl) symEl.textContent = _bc.symbol;
  if (_bc.displayBars.length && priceEl && changeEl) {
    const first = _bc.displayBars[0];
    const last  = _bc.displayBars[_bc.displayBars.length - 1];
    const diff  = last.close - first.open;
    const pct   = (diff / first.open * 100);
    priceEl.textContent = `$${last.close.toFixed(2)}`;
    const isPos = diff >= 0;
    changeEl.innerHTML = `<span style="color:${isPos ? '#089981' : '#f23645'}">${isPos?'+':''}${diff.toFixed(2)} (${isPos?'+':''}${pct.toFixed(2)}%)</span>`;
  }
}

// ── Sub-chart factory (RSI / MACD panes) ──────────────────────────
function _bcMakeSubChart(containerId) {
  const container = document.getElementById(containerId);
  if (!container || typeof LightweightCharts === 'undefined') return null;
  const chart = LightweightCharts.createChart(container, {
    layout: { background: { type: 'solid', color: '#f8f9fd' }, textColor: '#6a6d78', fontSize: 10 },
    grid: { vertLines: { color: '#e8eaf0' }, horzLines: { color: '#e8eaf0' } },
    rightPriceScale: { borderColor: '#d1d4dc', scaleMargins: { top: 0.08, bottom: 0.08 } },
    timeScale: { borderColor: '#d1d4dc', timeVisible: false, secondsVisible: false, visible: false },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    handleScroll: { vertTouchDrag: false }
  });
  chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
    if (_bc.tsSyncing || !range || !_bc.lwChart) return;
    _bc.tsSyncing = true;
    try {
      _bc.lwChart.timeScale().setVisibleLogicalRange(range);
      if (_bc.rsiChart  && _bc.rsiChart  !== chart) _bc.rsiChart.timeScale().setVisibleLogicalRange(range);
      if (_bc.macdChart && _bc.macdChart !== chart) _bc.macdChart.timeScale().setVisibleLogicalRange(range);
    } finally { _bc.tsSyncing = false; }
  });
  const ro = new ResizeObserver(entries => {
    const { width, height } = entries[0].contentRect;
    try { chart.applyOptions({ width, height }); } catch(_) {}
  });
  ro.observe(container);
  chart._ro = ro;
  return chart;
}

// ── RSI pane ──────────────────────────────────────────────────────
function bcCreateRSIPane(ind) {
  const pane = document.getElementById('bcRSIPanelContainer');
  if (!pane) return;
  pane.style.display = 'block';
  _bc.rsiChart = _bcMakeSubChart('bcRSIChartInner');
  if (!_bc.rsiChart) return;
  _bc.rsiSeries = _bc.rsiChart.addLineSeries({
    color: ind.color || '#7c3aed', lineWidth: 2,
    priceLineVisible: false, lastValueVisible: true, title: ind.label || 'RSI'
  });
  _bc.rsiSeries.createPriceLine({ price: 70, color: '#f23645', lineWidth: 1, lineStyle: 2, axisLabelVisible: true  });
  _bc.rsiSeries.createPriceLine({ price: 50, color: '#9598a1', lineWidth: 1, lineStyle: 3, axisLabelVisible: false });
  _bc.rsiSeries.createPriceLine({ price: 30, color: '#089981', lineWidth: 1, lineStyle: 2, axisLabelVisible: true  });
  _bc.rsiSeries.setData(bcDedupe(bcComputeRSI(_bc.displayBars, ind.period)));
  if (_bc.lwChart) {
    try { const r = _bc.lwChart.timeScale().getVisibleLogicalRange(); if (r) _bc.rsiChart.timeScale().setVisibleLogicalRange(r); } catch(_) {}
  }
}

function bcDestroyRSIPane() {
  if (_bc.rsiChart) {
    try { if (_bc.rsiChart._ro) _bc.rsiChart._ro.disconnect(); } catch(_) {}
    try { _bc.rsiChart.remove(); } catch(_) {}
    _bc.rsiChart = null; _bc.rsiSeries = null;
  }
  const pane = document.getElementById('bcRSIPanelContainer');
  if (pane) pane.style.display = 'none';
}

// ── MACD pane ─────────────────────────────────────────────────────
function bcCreateMACDPane(ind) {
  const pane = document.getElementById('bcMACDPanelContainer');
  if (!pane) return;
  pane.style.display = 'block';
  _bc.macdChart = _bcMakeSubChart('bcMACDChartInner');
  if (!_bc.macdChart) return;
  const sp = ind.shortPeriod || 12, lp = ind.longPeriod || 26, sig = ind.signalPeriod || 9;
  const { macdLine, signalLine, histogram } = bcComputeMACD(_bc.displayBars, sp, lp, sig);
  _bc.macdHistSeries = _bc.macdChart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
  _bc.macdHistSeries.setData(bcDedupe(histogram));
  _bc.macdLineSeries = _bc.macdChart.addLineSeries({ color: '#2962ff', lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: 'MACD' });
  _bc.macdLineSeries.setData(bcDedupe(macdLine));
  _bc.macdLineSeries.createPriceLine({ price: 0, color: '#9598a1', lineWidth: 1, lineStyle: 3, axisLabelVisible: false });
  _bc.macdSignalSeries = _bc.macdChart.addLineSeries({ color: '#ff6d00', lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: 'Signal' });
  _bc.macdSignalSeries.setData(bcDedupe(signalLine));
  if (_bc.lwChart) {
    try { const r = _bc.lwChart.timeScale().getVisibleLogicalRange(); if (r) _bc.macdChart.timeScale().setVisibleLogicalRange(r); } catch(_) {}
  }
}

function bcDestroyMACDPane() {
  if (_bc.macdChart) {
    try { if (_bc.macdChart._ro) _bc.macdChart._ro.disconnect(); } catch(_) {}
    try { _bc.macdChart.remove(); } catch(_) {}
    _bc.macdChart = null; _bc.macdHistSeries = null; _bc.macdLineSeries = null; _bc.macdSignalSeries = null;
  }
  const pane = document.getElementById('bcMACDPanelContainer');
  if (pane) pane.style.display = 'none';
}

// ── Indicator add / remove / refresh ──────────────────────────────
function bcOnIndTypeChange() {
  const type = document.getElementById('bcIndicatorType')?.value;
  const pg   = document.getElementById('bcIndPeriodGroup');
  const mg   = document.getElementById('bcMACDGroup');
  const lwg  = document.getElementById('bcIndLineWidthGroup');
  const cg   = document.getElementById('bcIndColorGroup');
  const pi   = document.getElementById('bcIndPeriod');
  const ci   = document.getElementById('bcIndColor');
  if (type === 'macd') {
    if (pg)  pg.style.display  = 'none';
    if (mg)  mg.style.display  = 'block';
    if (lwg) lwg.style.display = 'none';
    if (cg)  cg.style.display  = 'none';
  } else if (type === 'rsi') {
    if (pg)  pg.style.display  = 'block';
    if (mg)  mg.style.display  = 'none';
    if (lwg) lwg.style.display = 'none';
    if (cg)  cg.style.display  = 'block';
    if (pi)  pi.value = '14';
    if (ci)  ci.value = '#7c3aed';
  } else {
    if (pg)  pg.style.display  = 'block';
    if (mg)  mg.style.display  = 'none';
    if (lwg) lwg.style.display = 'block';
    if (cg)  cg.style.display  = 'block';
    if (type === 'vwap' && pi) pi.value = '14';
    if (ci && (type === 'sma' || type === 'ema' || type === 'vwap')) ci.value = '#2962ff';
  }
}

function bcAddIndicator(config) {
  if (!_bc.lwChart) { alert('Load chart data first.'); return; }
  const type = config ? config.type : document.getElementById('bcIndicatorType')?.value;

  if (type === 'rsi') {
    if (_bc.indicators.some(i => i.type === 'rsi')) { alert('RSI is already on the chart.'); return; }
    const period = config ? (config.period || 14) : (parseInt(document.getElementById('bcIndPeriod')?.value) || 14);
    const color  = config ? (config.color || '#7c3aed') : (document.getElementById('bcIndColor')?.value || '#7c3aed');
    if (period < 2 || period > 500) { alert('Period must be 2–500.'); return; }
    const ind = { id: _bc.indicatorNextId++, type: 'rsi', period, color, label: `RSI(${period})`, series: null };
    _bc.indicators.push(ind);
    bcCreateRSIPane(ind);
    bcRefreshIndicatorsList();
    return;
  }

  if (type === 'macd') {
    if (_bc.indicators.some(i => i.type === 'macd')) { alert('MACD is already on the chart.'); return; }
    const sp  = config ? (config.shortPeriod  || 12) : (parseInt(document.getElementById('bcMACDShort')?.value)  || 12);
    const lp  = config ? (config.longPeriod   || 26) : (parseInt(document.getElementById('bcMACDLong')?.value)   || 26);
    const sig = config ? (config.signalPeriod || 9)  : (parseInt(document.getElementById('bcMACDSignal')?.value) || 9);
    const ind = { id: _bc.indicatorNextId++, type: 'macd', period: 0, color: '#2962ff', label: `MACD(${sp},${lp},${sig})`, series: null, shortPeriod: sp, longPeriod: lp, signalPeriod: sig };
    _bc.indicators.push(ind);
    bcCreateMACDPane(ind);
    bcRefreshIndicatorsList();
    return;
  }

  const period    = config ? config.period    : (parseInt(document.getElementById('bcIndPeriod')?.value) || 20);
  const color     = config ? config.color     : (document.getElementById('bcIndColor')?.value || '#2962ff');
  const lineWidth = config ? (config.lineWidth || 2) : (parseInt(document.getElementById('bcIndLineWidth')?.value) || 2);

  if ((type === 'sma' || type === 'ema') && (period < 2 || period > 500)) {
    alert('Period must be 2–500.'); return;
  }

  const label = type === 'vwap' ? `VWAP(${period})` : `${type.toUpperCase()}(${period})`;
  const series = _bc.lwChart.addLineSeries({
    color, lineWidth, priceLineVisible: false, lastValueVisible: true,
    crosshairMarkerVisible: false, title: label
  });
  const ind = { id: _bc.indicatorNextId++, type, period, color, lineWidth, label, series };
  _bc.indicators.push(ind);

  let data = [];
  if (type === 'sma')       data = bcComputeSMA(_bc.displayBars, period);
  else if (type === 'ema')  data = bcComputeEMA(_bc.displayBars, period);
  else if (type === 'vwap') data = bcComputeVWAP(_bc.displayBars, period);
  series.setData(bcDedupe(data));
  bcRefreshIndicatorsList();
}

function bcRemoveIndicator(id) {
  const idx = _bc.indicators.findIndex(i => i.id === id);
  if (idx === -1) return;
  const ind = _bc.indicators[idx];
  if (ind.type === 'rsi')       bcDestroyRSIPane();
  else if (ind.type === 'macd') bcDestroyMACDPane();
  else if (ind.series && _bc.lwChart) { try { _bc.lwChart.removeSeries(ind.series); } catch(_) {} }
  _bc.indicators.splice(idx, 1);
  bcRefreshIndicatorsList();
}

function bcClearAllIndicators() {
  while (_bc.indicators.length) {
    const ind = _bc.indicators.pop();
    if (ind.type === 'rsi')       bcDestroyRSIPane();
    else if (ind.type === 'macd') bcDestroyMACDPane();
    else if (ind.series && _bc.lwChart) { try { _bc.lwChart.removeSeries(ind.series); } catch(_) {} }
  }
  bcRefreshIndicatorsList();
}

function bcRefreshIndicatorsList() {
  const container = document.getElementById('bcActiveIndicators');
  const list      = document.getElementById('bcActiveIndicatorsList');
  const badge     = document.getElementById('bcIndicatorCount');
  if (!container || !list) return;

  if (!_bc || !_bc.indicators.length) {
    container.style.display = 'none';
    if (badge) badge.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  if (badge) { badge.style.display = 'inline-block'; badge.textContent = _bc.indicators.length; }

  let html = '';
  for (const ind of _bc.indicators) {
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f0f3fa;">';
    html += '<div style="display:flex;align-items:center;gap:6px;">';
    if (ind.type === 'macd') {
      html += '<span style="display:inline-flex;gap:2px;align-items:center;">'
            + '<span style="width:5px;height:12px;border-radius:2px;background:#2962ff;display:inline-block;"></span>'
            + '<span style="width:5px;height:12px;border-radius:2px;background:#ff6d00;display:inline-block;"></span>'
            + '<span style="width:5px;height:12px;border-radius:2px;background:#089981;display:inline-block;"></span>'
            + '</span>';
    } else {
      html += `<span style="width:12px;height:12px;border-radius:50%;background:${ind.color};display:inline-block;"></span>`;
    }
    html += `<span style="font-size:12px;color:#191919;">${ind.label}</span>`;
    html += '</div>';
    html += `<button type="button" onclick="bcRemoveIndicator(${ind.id})" style="background:none;border:none;color:#f23645;cursor:pointer;font-size:13px;padding:2px 4px;" title="Remove"><i class="fas fa-times"></i></button>`;
    html += '</div>';
  }
  html += '<button type="button" onclick="bcClearAllIndicators()" style="width:100%;margin-top:6px;padding:4px;background:#f8f9fd;border:1px solid #e0e3eb;border-radius:4px;font-size:11px;color:#6a6d78;cursor:pointer;">Clear All</button>';
  list.innerHTML = html;
}

function bcUpdateAllIndicators() {
  if (!_bc.lwChart || !_bc.displayBars.length) return;
  for (const ind of _bc.indicators) {
    try {
      if (ind.type === 'sma' && ind.series)
        ind.series.setData(bcDedupe(bcComputeSMA(_bc.displayBars, ind.period)));
      else if (ind.type === 'ema' && ind.series)
        ind.series.setData(bcDedupe(bcComputeEMA(_bc.displayBars, ind.period)));
      else if (ind.type === 'vwap' && ind.series)
        ind.series.setData(bcDedupe(bcComputeVWAP(_bc.displayBars, ind.period)));
      else if (ind.type === 'rsi' && _bc.rsiSeries)
        _bc.rsiSeries.setData(bcDedupe(bcComputeRSI(_bc.displayBars, ind.period)));
      else if (ind.type === 'macd' && _bc.macdHistSeries) {
        const { macdLine, signalLine, histogram } = bcComputeMACD(_bc.displayBars, ind.shortPeriod || 12, ind.longPeriod || 26, ind.signalPeriod || 9);
        _bc.macdHistSeries.setData(bcDedupe(histogram));
        if (_bc.macdLineSeries)   _bc.macdLineSeries.setData(bcDedupe(macdLine));
        if (_bc.macdSignalSeries) _bc.macdSignalSeries.setData(bcDedupe(signalLine));
      }
    } catch(e) { console.warn('Indicator error', ind.label, e); }
  }
}

// ── Indicator compute functions ────────────────────────────────────
function bcDedupe(data) {
  const seen = new Set(); const result = [];
  for (const d of data) { if (!seen.has(d.time)) { seen.add(d.time); result.push(d); } }
  return result;
}

function bcComputeSMA(bars, period) {
  const result = [];
  for (let i = period - 1; i < bars.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += bars[j].close;
    result.push({ time: Math.floor(bars[i].timestamp / 1000), value: sum / period });
  }
  return result;
}

function bcComputeEMA(bars, period) {
  const result = [];
  if (bars.length < period) return result;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += bars[i].close;
  let ema = sum / period;
  result.push({ time: Math.floor(bars[period - 1].timestamp / 1000), value: ema });
  const k = 2 / (period + 1);
  for (let i = period; i < bars.length; i++) {
    ema = bars[i].close * k + ema * (1 - k);
    result.push({ time: Math.floor(bars[i].timestamp / 1000), value: ema });
  }
  return result;
}

function bcComputeVWAP(bars, period) {
  period = period || 14;
  const result = [];
  for (let i = 0; i < bars.length; i++) {
    const start = Math.max(0, i - period + 1);
    let cumVol = 0, cumTP = 0;
    for (let j = start; j <= i; j++) {
      const b = bars[j];
      const tp = (b.high + b.low + b.close) / 3;
      const v  = b.volume || 0;
      cumTP += tp * v; cumVol += v;
    }
    if (cumVol > 0) result.push({ time: Math.floor(bars[i].timestamp / 1000), value: cumTP / cumVol });
  }
  return result;
}

function bcComputeRSI(bars, period) {
  const result = [];
  if (bars.length < period + 1) return result;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = bars[i].close - bars[i-1].close;
    if (d > 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  result.push({ time: Math.floor(bars[period].timestamp / 1000), value: avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss) });
  for (let i = period + 1; i < bars.length; i++) {
    const d = bars[i].close - bars[i-1].close;
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    result.push({ time: Math.floor(bars[i].timestamp / 1000), value: avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss) });
  }
  return result;
}

function _bcEMAArray(bars, period) {
  if (bars.length < period) return [];
  let sum = 0;
  for (let i = 0; i < period; i++) sum += bars[i].close;
  const k = 2 / (period + 1);
  let ema = sum / period;
  const result = [{ idx: period - 1, time: Math.floor(bars[period - 1].timestamp / 1000), value: ema }];
  for (let i = period; i < bars.length; i++) {
    ema = bars[i].close * k + ema * (1 - k);
    result.push({ idx: i, time: Math.floor(bars[i].timestamp / 1000), value: ema });
  }
  return result;
}

function bcComputeMACD(bars, shortPeriod, longPeriod, signalPeriod) {
  const shortEma = _bcEMAArray(bars, shortPeriod);
  const longEma  = _bcEMAArray(bars, longPeriod);
  const shortMap = {};
  for (const d of shortEma) shortMap[d.idx] = d.value;
  const macdLine = [];
  for (const d of longEma) {
    const sv = shortMap[d.idx];
    if (sv !== undefined) macdLine.push({ time: d.time, value: sv - d.value });
  }
  const signalLine = [];
  if (macdLine.length >= signalPeriod) {
    let sum = 0;
    for (let i = 0; i < signalPeriod; i++) sum += macdLine[i].value;
    let sig = sum / signalPeriod;
    signalLine.push({ time: macdLine[signalPeriod - 1].time, value: sig });
    const k = 2 / (signalPeriod + 1);
    for (let i = signalPeriod; i < macdLine.length; i++) {
      sig = macdLine[i].value * k + sig * (1 - k);
      signalLine.push({ time: macdLine[i].time, value: sig });
    }
  }
  const histogram = [];
  const offset = macdLine.length - signalLine.length;
  for (let i = 0; i < signalLine.length; i++) {
    const diff = macdLine[offset + i].value - signalLine[i].value;
    histogram.push({ time: signalLine[i].time, value: diff, color: diff >= 0 ? 'rgba(8,153,129,0.85)' : 'rgba(242,54,69,0.85)' });
  }
  return { macdLine: macdLine.map(d => ({ time: d.time, value: d.value })), signalLine, histogram };
}

// ── Real-time polling ──────────────────────────────────────────────
function bcToggleRealtime() {
  if (!_bc) return;
  if (_bc.isRealtime) bcStopRt(); else bcStartRt();
}

function bcStartRt() {
  if (!_bc) return;
  _bc.isRealtime = true;
  const btn = document.getElementById('bcRtBtn');
  const dot = document.getElementById('bcLiveDot');
  if (btn) btn.classList.add('active');
  if (dot) dot.style.display = 'block';
  bcPollRt();
  _bc.rtTimer = setInterval(bcPollRt, 60000);
}

function bcStopRt() {
  if (!_bc) return;
  _bc.isRealtime = false;
  if (_bc.rtTimer) { clearInterval(_bc.rtTimer); _bc.rtTimer = null; }
  const btn = document.getElementById('bcRtBtn');
  const dot = document.getElementById('bcLiveDot');
  if (btn) btn.classList.remove('active');
  if (dot) dot.style.display = 'none';
}

async function bcPollRt() {
  if (!_bc || !_bc.symbol || _bc.currentMinuteIndex < _bc.minuteBarsCache.length) return;
  try {
    const resp = await fetch(`/api/bot/tradier/bars?symbol=${encodeURIComponent(_bc.symbol)}&days=1`);
    const data = await resp.json();
    if (!resp.ok || !data.bars?.length) return;
    const existingSet = new Set(_bc.minuteBarsCache.map(b => b.time));
    let changed = false;
    for (const nb of data.bars) {
      if (!existingSet.has(nb.time)) {
        _bc.minuteBarsCache.push(nb);
        _bc.currentMinuteIndex++;
        changed = true;
      } else {
        const idx = _bc.minuteBarsCache.findIndex(b => b.time === nb.time);
        if (idx !== -1) { _bc.minuteBarsCache[idx] = nb; changed = true; }
      }
    }
    if (changed) {
      _bcRebuildBars();
      bcUpdateChartData();
      bcUpdateNavButtons();
      if (_bc.showMarkers) bcApplyMarkers();
    }
  } catch(_) {}
}

// ── Strategy markers ───────────────────────────────────────────────
async function bcToggleMarkers() {
  if (!_bc) return;
  _bc.showMarkers = !_bc.showMarkers;
  const btn = document.getElementById('bcMarkersBtn');
  if (btn) btn.classList.toggle('active', _bc.showMarkers);
  if (_bc.showMarkers) await bcLoadMarkers();
  else { if (_bc.candleSeries) { try { _bc.candleSeries.setMarkers([]); } catch(_) {} } _bc.markers = []; }
}

async function bcLoadMarkers() {
  if (!_bc || !_bc.candleSeries || !_bc.displayBars.length) return;
  try {
    const resp = await fetch('/api/bot/tradier/orders');
    const data = await resp.json();
    const raw  = data?.orders?.order;
    if (!raw) { _bc.markers = []; bcApplyMarkers(); return; }
    const orders = Array.isArray(raw) ? raw : [raw];
    const markers = [];
    for (const o of orders) {
      const dt = o.create_date;
      if (!dt) continue;
      const sec = Math.floor(new Date(dt).getTime() / 1000);
      let best = null, bestDiff = Infinity;
      for (const b of _bc.displayBars) {
        const diff = Math.abs(Math.floor(b.timestamp / 1000) - sec);
        if (diff < bestDiff) { bestDiff = diff; best = b; }
      }
      if (!best || bestDiff > 300) continue;
      const isBuy = (o.side || '').includes('buy');
      const tag   = o.tag ? String(o.tag) : '';
      const lbl   = tag || (o.class === 'multileg' ? 'ML' : o.class === 'option' ? 'OPT' : 'EQ');
      const status = o.status || '';
      const color  = status === 'filled' ? (isBuy ? '#1b55e2' : '#f23645') : status === 'canceled' ? '#9098a9' : '#f59e0b';
      markers.push({ time: Math.floor(best.timestamp / 1000), position: isBuy ? 'belowBar' : 'aboveBar', color, shape: isBuy ? 'arrowUp' : 'arrowDown', text: lbl, size: 1 });
    }
    markers.sort((a, b) => a.time - b.time);
    _bc.markers = markers;
    bcApplyMarkers();
  } catch(_) {}
}

function bcApplyMarkers() {
  if (!_bc || !_bc.candleSeries) return;
  try { _bc.candleSeries.setMarkers(_bc.markers || []); } catch(_) {}
}

