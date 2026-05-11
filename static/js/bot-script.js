/* Bot Page Script */

let _botCurrentMode = 'paper';
let _botConfigured  = false;

function initBotPage() {
    botLoadConfig();
}

/* ============================================================
   CONFIG LOAD / SAVE
   ============================================================ */

async function botLoadConfig() {
    try {
        const resp = await fetch('/api/bot/config');
        if (resp.status === 401) { return; }
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
    } catch (e) {
        console.error('botLoadConfig error', e);
        botShowView('config');
    }
}

function botPopulateForm(data) {
    _safeSet('botBrokerage',         data.brokerage || 'tradier');
    _safeSet('botPaperAccountId',    data.paper_account_id || '');
    _safeSet('botPaperApiKey',       data.paper_api_key || '');
    _safeSet('botPaperLiveAccountId',data.paper_live_account_id || '');
    _safeSet('botPaperLiveApiKey',   data.paper_live_api_key || '');
    _safeSet('botLiveAccountId',     data.live_account_id || '');
    _safeSet('botLiveApiKey',        data.live_api_key || '');
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
        brokerage:            document.getElementById('botBrokerage')?.value || 'tradier',
        mode:                 _botCurrentMode,
        paper_account_id:     document.getElementById('botPaperAccountId')?.value.trim() || '',
        paper_api_key:        document.getElementById('botPaperApiKey')?.value.trim() || '',
        paper_live_account_id:document.getElementById('botPaperLiveAccountId')?.value.trim() || '',
        paper_live_api_key:   document.getElementById('botPaperLiveApiKey')?.value.trim() || '',
        live_account_id:      document.getElementById('botLiveAccountId')?.value.trim() || '',
        live_api_key:         document.getElementById('botLiveApiKey')?.value.trim() || '',
    };

    try {
        const resp = await fetch('/api/bot/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await resp.json();
        if (data.success) {
            _botConfigured = true;
            botShowMsg(msg, 'success', '<i class="fas fa-check-circle me-1"></i>Saved! Connecting to brokerage…');
            setTimeout(() => {
                botShowView('dashboard');
                botLoadAll();
            }, 800);
        } else {
            botShowMsg(msg, 'danger', data.error || 'Save failed');
        }
    } catch (e) {
        botShowMsg(msg, 'danger', 'Network error: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save me-2"></i>Save & Connect';
    }
}

/* ============================================================
   VIEW MANAGEMENT
   ============================================================ */

function botShowView(view) {
    const configView    = document.getElementById('botConfigView');
    const dashView      = document.getElementById('botDashboardView');
    const subnav        = document.getElementById('botSubnav');
    const settingsBtn   = document.getElementById('botSettingsToggleBtn');
    const cancelBtn     = document.getElementById('botCancelBtn');
    const modeBadge     = document.getElementById('botModeBadge');

    if (view === 'dashboard') {
        configView.style.display = 'none';
        dashView.style.display   = 'block';
        subnav.style.display     = 'flex';
        if (settingsBtn) settingsBtn.style.display = 'inline-flex';
        if (cancelBtn)   cancelBtn.style.display   = 'none';
        if (modeBadge) {
            modeBadge.style.display = 'inline-block';
            if (_botCurrentMode === 'live') {
                modeBadge.className = 'bot-mode-badge-live';
                modeBadge.innerHTML = '<i class="fas fa-bolt me-1"></i>Live';
            } else {
                modeBadge.className = 'bot-mode-badge-paper';
                modeBadge.innerHTML = '<i class="fas fa-flask me-1"></i>Paper';
            }
        }
        botHighlightSubnav('dashboard');
    } else {
        configView.style.display = 'block';
        dashView.style.display   = 'none';
        subnav.style.display     = _botConfigured ? 'flex' : 'none';
        if (settingsBtn) settingsBtn.style.display = 'none';
        if (cancelBtn)   cancelBtn.style.display   = _botConfigured ? 'inline-block' : 'none';
        if (modeBadge)   modeBadge.style.display   = 'none';
        botHighlightSubnav('config');
    }
}

function botSwitchView(view) {
    botHighlightSubnav(view);
    botShowView(view);
}

function botHighlightSubnav(active) {
    document.querySelectorAll('#botSubnav .bot-subnav-btn').forEach((btn, i) => {
        const views = ['dashboard', 'config'];
        btn.classList.toggle('active', views[i] === active);
    });
}

/* ============================================================
   MODE TOGGLE
   ============================================================ */

function botSetMode(mode, updateUI = true) {
    _botCurrentMode = mode;
    const paperBtn  = document.getElementById('botModePaperBtn');
    const liveBtn   = document.getElementById('botModeLiveBtn');
    const paperFlds = document.getElementById('botPaperFields');
    const liveFlds  = document.getElementById('botLiveFields');
    if (!paperBtn) return;
    paperBtn.classList.toggle('active',      mode === 'paper');
    liveBtn.classList.toggle('active',       mode === 'live');
    liveBtn.classList.toggle('live-active',  mode === 'live');
    if (paperFlds) paperFlds.style.display = mode === 'paper' ? 'block' : 'none';
    if (liveFlds)  liveFlds.style.display  = mode === 'live'  ? 'block' : 'none';

    // Update side dropdown in New Position
    const npSide = document.getElementById('npSide');
    if (npSide && updateUI) {
        const isOpt = (document.getElementById('npClass')?.value === 'option');
        botUpdateSideOptions(isOpt);
    }
}

/* ============================================================
   UTILITY
   ============================================================ */

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

function _fmt$(n) {
    if (n == null || n === '') return '—';
    return '$' + parseFloat(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _fmtN(n, dec = 4) {
    if (n == null || n === '') return '—';
    return parseFloat(n).toFixed(dec);
}

/* ============================================================
   LOAD ALL DASHBOARD DATA
   ============================================================ */

function botLoadAll() {
    botLoadBalances();
    botLoadPositions();
    botLoadOrders();
}

/* ============================================================
   ACCOUNT BALANCE
   ============================================================ */

async function botLoadBalances() {
    const body = document.getElementById('botBalanceBody');
    if (!body) return;
    body.innerHTML = '<div class="bot-empty"><i class="fas fa-spinner fa-spin"></i> Loading…</div>';
    try {
        const resp = await fetch('/api/bot/tradier/balances');
        const data = await resp.json();
        const bal  = data?.balances;
        if (!bal) {
            body.innerHTML = `<div class="bot-empty"><i class="fas fa-exclamation-circle" style="color:#ef4444;"></i><div class="mt-2">${data.error || 'Could not load balances'}</div></div>`;
            return;
        }
        const acct = bal.account_number || '—';
        const type = bal.account_type  || '';
        const b    = bal.cash || bal.margin || {};
        const rows = [
            { label: 'Account',        val: acct + (type ? ` (${type})` : '') },
            { label: 'Total Equity',   val: _fmt$(bal.total_equity) },
            { label: 'Cash',           val: _fmt$(bal.total_cash) },
            { label: 'Option BP',      val: _fmt$(b.option_buying_power ?? bal.option_buying_power) },
            { label: 'Stock BP',       val: _fmt$(b.stock_buying_power  ?? bal.stock_buying_power) },
            { label: 'Day P&L',        val: _fmt$(bal.day_trade_buying_power) },
            { label: 'P&L Open',       val: _fmt$(bal.open_pl) },
            { label: 'P&L Close',      val: _fmt$(bal.close_pl) },
        ].filter(r => r.val !== '—');
        body.innerHTML = `<div class="bot-stat-grid">${rows.map(r => `
            <div class="bot-stat-item">
                <div class="bot-stat-label">${r.label}</div>
                <div class="bot-stat-value" style="font-size:14px;">${r.val}</div>
            </div>`).join('')}</div>`;
    } catch (e) {
        body.innerHTML = `<div class="bot-empty"><i class="fas fa-times-circle" style="color:#ef4444;"></i><div class="mt-2">Error: ${e.message}</div></div>`;
    }
}

/* ============================================================
   OPEN POSITIONS
   ============================================================ */

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
                body.innerHTML = `<div class="bot-empty py-4"><i class="fas fa-exclamation-circle" style="color:#ef4444;"></i><div class="mt-2">${data.error}</div></div>`;
            } else {
                body.innerHTML = '<div class="bot-empty py-4"><i class="fas fa-inbox"></i><div class="mt-2">No open positions</div></div>';
            }
            return;
        }
        const positions = Array.isArray(raw) ? raw : [raw];
        body.innerHTML = `<div style="overflow-x:auto;">
            <table class="bot-table">
                <thead><tr>
                    <th>Symbol</th><th>Qty</th><th>Cost Basis</th><th>Date Acquired</th>
                </tr></thead>
                <tbody>${positions.map(p => `<tr>
                    <td><strong>${p.symbol}</strong></td>
                    <td>${p.quantity}</td>
                    <td>${_fmt$(p.cost_basis)}</td>
                    <td>${p.date_acquired ? p.date_acquired.split('T')[0] : '—'}</td>
                </tr>`).join('')}</tbody>
            </table>
        </div>`;
    } catch (e) {
        body.innerHTML = `<div class="bot-empty py-4"><i class="fas fa-times-circle" style="color:#ef4444;"></i><div class="mt-2">Error: ${e.message}</div></div>`;
    }
}

/* ============================================================
   OPEN ORDERS
   ============================================================ */

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
                body.innerHTML = `<div class="bot-empty py-4"><i class="fas fa-exclamation-circle" style="color:#ef4444;"></i><div class="mt-2">${data.error}</div></div>`;
            } else {
                body.innerHTML = '<div class="bot-empty py-4"><i class="fas fa-inbox"></i><div class="mt-2">No open orders</div></div>';
            }
            return;
        }
        const orders = Array.isArray(raw) ? raw : [raw];
        const statusBadge = s => {
            const map = { open: 'badge-open', filled: 'badge-filled', canceled: 'badge-canceled', pending: 'badge-pending' };
            return `<span class="badge-side ${map[s] || 'badge-pending'}">${s}</span>`;
        };
        const sideBadge = s => {
            const buy = ['buy','buy_to_open','buy_to_close'].includes(s);
            return `<span class="badge-side ${buy ? 'badge-buy' : 'badge-sell'}">${s.replace(/_/g,' ')}</span>`;
        };
        body.innerHTML = `<div style="overflow-x:auto;">
            <table class="bot-table">
                <thead><tr>
                    <th>ID</th><th>Symbol</th><th>Side</th><th>Qty</th><th>Type</th><th>Price</th><th>Status</th><th>Created</th>
                </tr></thead>
                <tbody>${orders.map(o => `<tr>
                    <td style="color:#9098a9;font-size:12px;">${o.id}</td>
                    <td><strong>${o.symbol}</strong></td>
                    <td>${sideBadge(o.side)}</td>
                    <td>${o.quantity}</td>
                    <td style="text-transform:capitalize;">${(o.type||'').replace(/_/g,' ')}</td>
                    <td>${o.price ? _fmt$(o.price) : (o.stop_price ? 'Stop ' + _fmt$(o.stop_price) : 'Market')}</td>
                    <td>${statusBadge(o.status)}</td>
                    <td style="font-size:12px;">${o.create_date ? o.create_date.split('T')[0] : '—'}</td>
                </tr>`).join('')}</tbody>
            </table>
        </div>`;
    } catch (e) {
        body.innerHTML = `<div class="bot-empty py-4"><i class="fas fa-times-circle" style="color:#ef4444;"></i><div class="mt-2">Error: ${e.message}</div></div>`;
    }
}

/* ============================================================
   NEW POSITION
   ============================================================ */

function botToggleOptionFields() {
    const isOpt = document.getElementById('npClass')?.value === 'option';
    const optGrp = document.getElementById('npOptionSymGroup');
    if (optGrp) optGrp.style.display = isOpt ? 'block' : 'none';
    botUpdateSideOptions(isOpt);
}

function botUpdateSideOptions(isOpt) {
    const sel = document.getElementById('npSide');
    if (!sel) return;
    if (isOpt) {
        sel.innerHTML = `
            <option value="buy_to_open">Buy to Open</option>
            <option value="buy_to_close">Buy to Close</option>
            <option value="sell_to_open">Sell to Open</option>
            <option value="sell_to_close">Sell to Close</option>`;
    } else {
        sel.innerHTML = `
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>`;
    }
}

function botToggleLimitPrice() {
    const type = document.getElementById('npType')?.value;
    const grp  = document.getElementById('npPriceGroup');
    if (grp) grp.style.display = (type === 'market') ? 'none' : 'block';
}

async function botPlaceOrder() {
    const msg    = document.getElementById('npMsg');
    const symbol = document.getElementById('npSymbol')?.value.trim().toUpperCase();
    const cls    = document.getElementById('npClass')?.value;
    const side   = document.getElementById('npSide')?.value;
    const qty    = document.getElementById('npQty')?.value;
    const type   = document.getElementById('npType')?.value;
    const price  = document.getElementById('npPrice')?.value;
    const optSym = document.getElementById('npOptionSym')?.value.trim().toUpperCase();

    if (!symbol || !qty) { msg.innerHTML = '<span style="color:#ef4444;">Symbol and quantity are required.</span>'; return; }

    const body = {
        class:    cls,
        symbol:   cls === 'option' ? optSym : symbol,
        side,
        quantity: qty,
        type,
        duration: 'day',
    };
    if (type !== 'market' && price) body.price = price;
    if (cls === 'option') body.option_symbol = optSym;

    msg.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Placing order…';
    try {
        const resp = await fetch('/api/bot/tradier/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await resp.json();
        const orderId = data?.order?.id;
        if (orderId) {
            msg.innerHTML = `<span style="color:#10b981;"><i class="fas fa-check-circle me-1"></i>Order #${orderId} placed.</span>`;
            setTimeout(() => botLoadOrders(), 1500);
        } else {
            const err = data?.errors?.error || data.error || JSON.stringify(data);
            msg.innerHTML = `<span style="color:#ef4444;"><i class="fas fa-times-circle me-1"></i>${Array.isArray(err) ? err.join(', ') : err}</span>`;
        }
    } catch (e) {
        msg.innerHTML = `<span style="color:#ef4444;">Error: ${e.message}</span>`;
    }
}

/* ============================================================
   OPTION CHAIN
   ============================================================ */

async function botLoadExpirations() {
    const sym = document.getElementById('chainSymbol')?.value.trim().toUpperCase();
    if (!sym) { alert('Enter a symbol first.'); return; }
    const sel = document.getElementById('chainExpiration');
    sel.innerHTML = '<option>Loading…</option>';
    try {
        const resp = await fetch(`/api/bot/tradier/options/expirations?symbol=${encodeURIComponent(sym)}`);
        const data = await resp.json();
        const dates = data?.expirations?.date || [];
        const list  = Array.isArray(dates) ? dates : [dates];
        if (!list.length) { sel.innerHTML = '<option>No expirations found</option>'; return; }
        sel.innerHTML = list.map(d => `<option value="${d}">${d}</option>`).join('');
    } catch (e) {
        sel.innerHTML = '<option>Error loading</option>';
    }
}

async function botLoadOptionChain() {
    const sym  = document.getElementById('chainSymbol')?.value.trim().toUpperCase();
    const exp  = document.getElementById('chainExpiration')?.value;
    const body = document.getElementById('botChainBody');
    if (!sym || !exp) { alert('Enter a symbol and select an expiration.'); return; }
    body.innerHTML = '<div class="bot-empty"><i class="fas fa-spinner fa-spin"></i> Loading option chain…</div>';
    try {
        const resp = await fetch(`/api/bot/tradier/options/chains?symbol=${encodeURIComponent(sym)}&expiration=${encodeURIComponent(exp)}`);
        const data = await resp.json();
        const opts = data?.options?.option || [];
        const chain = Array.isArray(opts) ? opts : [opts];
        if (!chain.length) { body.innerHTML = '<div class="bot-empty">No options data for this expiration.</div>'; return; }

        const calls  = chain.filter(o => o.option_type === 'call').sort((a,b) => a.strike - b.strike);
        const puts   = chain.filter(o => o.option_type === 'put').sort((a,b) => a.strike - b.strike);
        const strikes = [...new Set(chain.map(o => o.strike))].sort((a,b) => a-b);

        const callMap = {}; calls.forEach(c => callMap[c.strike] = c);
        const putMap  = {}; puts.forEach(p => putMap[p.strike]  = p);

        const row = (o) => o
            ? `${_fmtN(o.bid,2)} / ${_fmtN(o.ask,2)} <span style="color:#9098a9;font-size:11px;">IV:${o.greeks?.mid_iv ? (o.greeks.mid_iv * 100).toFixed(1) + '%' : '—'} Δ:${o.greeks?.delta ? _fmtN(o.greeks.delta,2) : '—'}</span>`
            : '—';

        body.innerHTML = `<div style="overflow-x:auto;">
            <table class="bot-table opt-chain-table">
                <thead><tr>
                    <th colspan="2" style="text-align:center;background:#eff6ff;color:#1d4ed8;">CALLS</th>
                    <th style="text-align:center;background:#eef2ff;color:#3730a3;">Strike</th>
                    <th colspan="2" style="text-align:center;background:#fdf2f8;color:#7c3aed;">PUTS</th>
                </tr>
                <tr>
                    <th>Bid/Ask</th><th>OI</th>
                    <th class="opt-chain-strike">Strike</th>
                    <th>Bid/Ask</th><th>OI</th>
                </tr></thead>
                <tbody>${strikes.map(s => {
                    const c = callMap[s]; const p = putMap[s];
                    return `<tr>
                        <td>${row(c)}</td>
                        <td style="color:#9098a9;">${c ? (c.open_interest || '—') : '—'}</td>
                        <td class="opt-chain-strike">${s}</td>
                        <td>${row(p)}</td>
                        <td style="color:#9098a9;">${p ? (p.open_interest || '—') : '—'}</td>
                    </tr>`;
                }).join('')}</tbody>
            </table>
        </div>`;
    } catch (e) {
        body.innerHTML = `<div class="bot-empty"><i class="fas fa-times-circle" style="color:#ef4444;"></i><div class="mt-2">Error: ${e.message}</div></div>`;
    }
}
