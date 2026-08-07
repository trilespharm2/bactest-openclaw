const BSCalc = {
    cdf: function(x) {
        const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
        const sign = x < 0 ? -1 : 1;
        x = Math.abs(x) / Math.SQRT2;
        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        return 0.5 * (1.0 + sign * y);
    },
    price: function(S, K, T, r, q, sigma, type) {
        if (T <= 0 || sigma <= 0) return type === 'call' ? Math.max(0, S - K) : Math.max(0, K - S);
        const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
        const d2 = d1 - sigma * Math.sqrt(T);
        if (type === 'call') return S * Math.exp(-q * T) * this.cdf(d1) - K * Math.exp(-r * T) * this.cdf(d2);
        else return K * Math.exp(-r * T) * this.cdf(-d2) - S * Math.exp(-q * T) * this.cdf(-d1);
    },
    vega: function(S, K, T, r, q, sigma) {
        if (T <= 0 || sigma <= 0) return 0;
        const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
        return S * Math.exp(-q * T) * Math.sqrt(T) * Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
    },
    impliedVolatility: function(S, K, T, r, q, marketPrice, type) {
        if (T <= 0 || marketPrice <= 0) return null;
        let sigma = 0.3;
        for (let i = 0; i < 100; i++) {
            const p = this.price(S, K, T, r, q, sigma, type);
            const diff = p - marketPrice;
            if (Math.abs(diff) < 1e-8) return sigma;
            const v = this.vega(S, K, T, r, q, sigma);
            if (v < 1e-12) break;
            sigma -= diff / v;
            if (sigma <= 0.001) sigma = 0.001;
            if (sigma > 10) sigma = 10;
        }
        const p = this.price(S, K, T, r, q, sigma, type);
        const tol = Math.max(0.5, marketPrice * 0.05);
        return Math.abs(p - marketPrice) < tol ? sigma : null;
    }
};

let simAllBars = [];
let simVisibleBars = [];
let simCurrentBarIndex = 0;
let simTradingStartIndex = 0;

let simCurrentMinuteIndex = 0;
let simTradingStartMinuteIndex = 0;

let simInitialBalance = 100000;
let simRealizedPnl = 0;
let simOpenPosition = null;
let simClosedTrades = [];

let simOptionsRealizedPnl = 0;
let simOpenOptionPositions = [];
let simClosedOptionTrades = [];
let simOptionBarsCache = {};

const SIM_TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '2h', '4h'];
const SIM_TIMEFRAME_CONFIG = {
    '1m': { barSize: 'minute', multiplier: 1, label: '1 Min' },
    '5m': { barSize: 'minute', multiplier: 5, label: '5 Min' },
    '15m': { barSize: 'minute', multiplier: 15, label: '15 Min' },
    '30m': { barSize: 'minute', multiplier: 30, label: '30 Min' },
    '1h': { barSize: 'hour', multiplier: 1, label: '1 Hour' },
    '2h': { barSize: 'hour', multiplier: 2, label: '2 Hour' },
    '4h': { barSize: 'hour', multiplier: 4, label: '4 Hour' }
};

const TIMEFRAME_MINUTES = {
    '1m': 1, '5m': 5, '15m': 15, '30m': 30,
    '1h': 60, '2h': 120, '4h': 240
};

let simTimeframeData = {};
let simCurrentTimeframe = '1m';
let simCurrentSymbol = '';
let simDataLoaded = false;
let simChartDates = { start: '', end: '', tradingStart: '' };
let simIsLoadingTimeframes = false;
let simLoadedTimeframes = 0;

let simAutoplayTimer = null;
let simIsPlaying = false;

let simMinuteBarsCache = [];
let simSecondsEnabled = false;
let simSecondsInterval = 10;
// Date window actually fetched for the base bars. Equals the full session range for
// minute data, but is narrowed for seconds data so payloads stay manageable.
let simDataWindow = { start: '', end: '' };
let simIsChangingResolution = false;

// Controls how many days of minute-bar data are fetched at once in seconds mode.
// This is a rolling fetch window, not a hard replay limit — the user can still
// replay any number of days; data is loaded incrementally as they advance.
function maxDaysForSecondsInterval(interval) {
    if (interval <= 1) return 3;
    if (interval <= 5) return 5;
    if (interval <= 15) return 7;
    return 14;
}

function addDaysToDateStr(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

function etDateStrFromTimestamp(ts) {
    return new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

// Chooses the date range to request for the current base resolution. Seconds data is
// anchored on the day being replayed so the visible day is always covered.
function computeDataWindow(anchorTs) {
    if (!simSecondsEnabled) {
        return { start: simChartDates.start, end: simChartDates.end };
    }
    const maxDays = maxDaysForSecondsInterval(simSecondsInterval);
    if (!isFinite(maxDays)) {
        return { start: simChartDates.start, end: simChartDates.end };
    }
    let anchorDate = anchorTs ? etDateStrFromTimestamp(anchorTs) : simChartDates.tradingStart;
    if (anchorDate < simChartDates.start) anchorDate = simChartDates.start;
    if (anchorDate > simChartDates.end) anchorDate = simChartDates.end;
    // Center the window on anchorDate so that both backward and forward navigation
    // stays within the loaded range. back = floor half, fwd = ceil half.
    const back = Math.floor((maxDays - 1) / 2);
    const fwd  = (maxDays - 1) - back;
    let start = addDaysToDateStr(anchorDate, -back);
    if (start < simChartDates.start) start = simChartDates.start;
    let end = addDaysToDateStr(anchorDate, fwd);
    if (end > simChartDates.end) end = simChartDates.end;
    return { start, end };
}

let lwChart = null;
let lwCandleSeries = null;
let lwVolumeSeries = null;
let lwPositionLines = [];
let lwPnlShadingSeries = null;
let lwIndicators = [];
let lwIndicatorNextId = 1;
let simUserHasDragged = false;
let simActiveSessionId = null;
let lwRsiChart = null;
let lwRsiSeries = null;
let lwMacdChart = null;
let lwMacdHistSeries = null;
let lwMacdLineSeries2 = null;
let lwMacdSignalSeries = null;
let _lwTsSyncing = false;

// Accepts 'HH:MM' or 'HH:MM:SS'.
function parseETDateTime(dateStr, timeStr) {
    const parts = String(timeStr).split(':');
    const hours = Number(parts[0]);
    const minutes = Number(parts[1] || 0);
    const seconds = Number(parts[2] || 0);
    const hhmmss = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    const testDateEST = new Date(`${dateStr}T${hhmmss}-05:00`);
    const testDateEDT = new Date(`${dateStr}T${hhmmss}-04:00`);
    const estCheck = testDateEST.toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
    const [estH, estM] = estCheck.split(':').map(Number);
    if (estH === hours && estM === minutes) return testDateEST.getTime();
    return testDateEDT.getTime();
}

function initSimulatedTrading() {
    console.log('Initializing Simulated Trading Config Page');

    const loadBtn = document.getElementById('simLoadChartBtn');
    if (!loadBtn) return;

    if (loadBtn.dataset.initialized) {
        renderActiveSessionCards();
        return;
    }
    loadBtn.dataset.initialized = 'true';

    document.getElementById('simChartStartDate').value = '';
    document.getElementById('simChartEndDate').value = '';
    document.getElementById('simTradingStartDate').value = '';

    function applySimTierRestrictions() {
        if (typeof TierRestrictions === 'undefined') { setTimeout(applySimTierRestrictions, 200); return; }
        TierRestrictions.applyDateConstraints(document.getElementById('simChartStartDate'), document.getElementById('simChartEndDate'));
        TierRestrictions.applyDateConstraints(document.getElementById('simTradingStartDate'), null);
        var symEl = document.getElementById('simSymbol');
        if (symEl) {
            symEl.addEventListener('change', function() {
                var err = TierRestrictions.getSymbolError(symEl.value);
                var warn = document.getElementById('simTierSymbolWarning');
                if (!warn) { warn = document.createElement('div'); warn.id = 'simTierSymbolWarning'; warn.style.cssText = 'color:#dc3545;font-size:12px;margin-top:4px;'; symEl.parentElement.appendChild(warn); }
                warn.textContent = err || '';
            });
        }
    }
    setTimeout(applySimTierRestrictions, 600);

    loadBtn.addEventListener('click', startNewSession);

    document.querySelectorAll('#simTradingModeSwitch .sim-mode-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('#simTradingModeSwitch .sim-mode-btn').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            document.getElementById('simTradingMode').value = btn.dataset.mode;
        });
    });

    renderActiveSessionCards();
    console.log('Simulated Trading Config Page initialized');
}

function renderActiveSessionCards() {
    const section = document.getElementById('simActiveSessionsSection');
    const container = document.getElementById('simActiveSessionCards');
    if (!section || !container) return;

    var isGuest = typeof window.isAuthenticated === 'function' ? !window.isAuthenticated() : true;
    if (isGuest) { section.style.display = 'none'; return; }

    let activeSessions = [];
    try {
        activeSessions = JSON.parse(localStorage.getItem('simActiveSessions') || '[]');
    } catch(e) { activeSessions = []; }

    if (activeSessions.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    container.innerHTML = activeSessions.map((s, i) => {
        const modeLabel = s.mode === 'options' ? 'Options' : 'Stock';
        const realPnl = s.realizedPnl || 0;
        const unrealPnl = s.unrealizedPnl || 0;
        const totalPnl = realPnl + unrealPnl;
        const pnlColor = realPnl >= 0 ? '#089981' : '#f23645';
        const pnlStr = `${realPnl >= 0 ? '+' : ''}$${realPnl.toFixed(2)}`;
        const unrealColor = unrealPnl >= 0 ? '#089981' : '#f23645';
        const unrealStr = `${unrealPnl >= 0 ? '+' : ''}$${unrealPnl.toFixed(2)}`;
        const trades = (s.closedTradesCount || 0);
        const openPos = (s.openPositionsCount || 0);
        const createdDate = s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '';
        return `
        <div class="col-md-6 col-lg-4">
          <div class="sim-session-card">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
              <div>
                <span style="font-size: 18px; font-weight: 700; color: #333;">${s.symbol}</span>
                <span style="background: ${s.mode === 'options' ? '#f4a261' : '#3b7cff'}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600; margin-left: 8px;">${modeLabel}</span>
              </div>
              <span style="font-size: 11px; color: #999;">${createdDate}</span>
            </div>
            <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 12px;">
              <div>
                <div style="font-size: 11px; color: #999;">Realized P&L</div>
                <div style="font-size: 14px; font-weight: 600; color: ${pnlColor};">${pnlStr}</div>
              </div>
              ${openPos > 0 ? `<div>
                <div style="font-size: 11px; color: #999;">Unrealized P&L</div>
                <div style="font-size: 14px; font-weight: 600; color: ${unrealColor};">${unrealStr}</div>
              </div>` : ''}
              <div>
                <div style="font-size: 11px; color: #999;">Trades</div>
                <div style="font-size: 14px; font-weight: 600; color: #333;">${trades}${openPos > 0 ? ` <span style="font-size:11px;color:#ff9800;">(${openPos} open)</span>` : ''}</div>
              </div>
              <div>
                <div style="font-size: 11px; color: #999;">Balance</div>
                <div style="font-size: 14px; font-weight: 600; color: #333;">$${(s.currentBalance || s.initialBalance || 100000).toLocaleString()}</div>
              </div>
            </div>
            <div style="display: flex; gap: 8px;">
              <button onclick="resumeSession(${i})" style="flex: 1; background: #2962ff; color: white; border: none; padding: 8px; border-radius: 6px; font-weight: 600; font-size: 13px; cursor: pointer;">
                <i class="fas fa-play me-1"></i> Resume
              </button>
              <button onclick="endSessionFromCard(${i})" style="flex: 1; background: #fff; color: #f23645; border: 1px solid #f23645; padding: 8px; border-radius: 6px; font-weight: 600; font-size: 13px; cursor: pointer;">
                <i class="fas fa-stop me-1"></i> End
              </button>
            </div>
          </div>
        </div>`;
    }).join('');
}

function startNewSession() {
    const symbol = document.getElementById('simSymbol').value.toUpperCase().trim();
    const chartStartDate = document.getElementById('simChartStartDate').value;
    const chartEndDate = document.getElementById('simChartEndDate').value;
    const tradingStartDate = document.getElementById('simTradingStartDate').value;
    const mode = document.getElementById('simTradingMode').value;
    const balance = parseFloat(document.getElementById('simAccountBalance').value) || 100000;

    const dateErrorDiv = document.getElementById('simDateError');
    const dateErrorText = document.getElementById('simDateErrorText');
    dateErrorDiv.classList.add('d-none');

    if (!symbol || !chartStartDate || !chartEndDate || !tradingStartDate) {
        dateErrorText.textContent = 'Please fill in all required fields';
        dateErrorDiv.classList.remove('d-none');
        return;
    }
    if (typeof TierRestrictions !== 'undefined') {
        var symErr = TierRestrictions.getSymbolError(symbol);
        if (symErr) { dateErrorText.textContent = symErr; dateErrorDiv.classList.remove('d-none'); return; }
        if (!TierRestrictions.isDateAllowed(chartStartDate) || !TierRestrictions.isDateAllowed(chartEndDate)) { var dMin = TierRestrictions.getDateMin(); var dMax = TierRestrictions.getDateMax(); var rangeStr = (dMin && dMax) ? ' Allowed range: ' + dMin + ' to ' + dMax + '.' : ''; dateErrorText.textContent = 'Date is outside your plan\'s allowed range.' + rangeStr + ' Upgrade for wider date access.'; dateErrorDiv.classList.remove('d-none'); return; }
    }
    if (new Date(tradingStartDate) < new Date(chartStartDate)) {
        dateErrorText.textContent = 'Trading start date cannot be before chart start date';
        dateErrorDiv.classList.remove('d-none');
        return;
    }
    if (new Date(tradingStartDate) > new Date(chartEndDate)) {
        dateErrorText.textContent = 'Trading start date cannot be after chart end date';
        dateErrorDiv.classList.remove('d-none');
        return;
    }
    var isGuest = typeof window.isAuthenticated === 'function' ? !window.isAuthenticated() : true;
    if (isGuest) {
        window._simGuestSession = true;
        var alertFn = typeof appAlert === 'function' ? appAlert : alert;
        alertFn('You are not signed in. Your session results will only be available at the end of this session and will not be saved. Sign in to keep your results.');
    } else {
        window._simGuestSession = false;
    }

    window._simPendingSession = {
        symbol, chartStartDate, chartEndDate, tradingStartDate, mode, balance,
        secondsEnabled: false, secondsInterval: 0,
        isNew: true
    };

    if (typeof navigateToPage === 'function') {
        navigateToPage('simTradingActive');
    }
}

function resumeSession(index) {
    let activeSessions = [];
    try { activeSessions = JSON.parse(localStorage.getItem('simActiveSessions') || '[]'); } catch(e) {}

    if (index >= activeSessions.length) return;
    const session = activeSessions[index];

    if (typeof TierRestrictions !== 'undefined') {
        var symErr = TierRestrictions.getSymbolError(session.symbol);
        if (symErr) { if (typeof appAlert === 'function') appAlert(symErr); else alert(symErr); return; }
    }

    window._simPendingSession = {
        symbol: session.symbol,
        chartStartDate: session.chartStartDate,
        chartEndDate: session.chartEndDate,
        tradingStartDate: session.tradingStartDate,
        mode: session.mode,
        balance: session.initialBalance,
        secondsEnabled: Boolean(session.secondsEnabled),
        secondsInterval: session.secondsInterval || 0,
        isNew: false,
        sessionIndex: index,
        savedState: session
    };

    if (typeof navigateToPage === 'function') {
        navigateToPage('simTradingActive');
    }
}

function forceCloseSessionPositions(session) {
    if (session.openPosition) {
        const pos = session.openPosition;
        const lastPrice = pos.entryPrice;
        const pnl = pos.side === 'long'
            ? (lastPrice - pos.entryPrice) * pos.quantity
            : (pos.entryPrice - lastPrice) * pos.quantity;
        if (!session.closedTrades) session.closedTrades = [];
        session.closedTrades.push({
            ...pos,
            exitPrice: lastPrice,
            pnl: session.unrealizedPnl || pnl,
            exitTimestamp: Date.now(),
            exitBarIndex: session.currentMinuteIndex || 0,
            exitReason: 'Session End'
        });
        session.realizedPnl = (session.realizedPnl || 0) + (session.unrealizedPnl || pnl);
        session.openPosition = null;
    }

    if (session.openOptionPositions && session.openOptionPositions.length > 0) {
        if (!session.closedOptionTrades) session.closedOptionTrades = [];
        for (const pos of session.openOptionPositions) {
            const unrealPnl = session.unrealizedPnl || 0;
            const perPosPnl = session.openOptionPositions.length === 1
                ? unrealPnl
                : 0;
            pos.closedParts = pos.closedParts || [];
            const legExitPrices = (pos.legs || []).map(leg => ({
                leg: leg.name,
                price: leg.entryPrice
            }));
            pos.closedParts.push({
                quantity: pos.remainingQuantity,
                exitPrices: legExitPrices,
                exitTimestamp: Date.now(),
                pnl: perPosPnl,
                reason: 'Session End'
            });
            pos.realizedPnl = (pos.realizedPnl || 0) + perPosPnl;
            pos.remainingQuantity = 0;
            pos.status = 'closed';
            session.closedOptionTrades.push(pos);
        }
        session.optionsRealizedPnl = (session.optionsRealizedPnl || 0) + (session.unrealizedPnl || 0);
        session.realizedPnl = (session.realizedPnl || 0) + (session.unrealizedPnl || 0);
        session.openOptionPositions = [];
    }

    session.unrealizedPnl = 0;
    session.openPositionsCount = 0;
    session.closedTradesCount = (session.mode === 'stock' ? (session.closedTrades || []) : (session.closedOptionTrades || [])).length;
    session.currentBalance = (session.initialBalance || 100000) + (session.realizedPnl || 0);
}

async function endSessionFromCard(index) {
    let activeSessions = [];
    try { activeSessions = JSON.parse(localStorage.getItem('simActiveSessions') || '[]'); } catch(e) {}
    if (index >= activeSessions.length) return;

    const session = activeSessions[index];
    const hasOpenStock = session.openPosition != null;
    const openOptionCount = (session.openOptionPositions || []).length;
    const hasOpenPositions = hasOpenStock || openOptionCount > 0;

    if (hasOpenPositions) {
        const posDesc = [];
        if (hasOpenStock) posDesc.push('1 stock position');
        if (openOptionCount > 0) posDesc.push(`${openOptionCount} option position${openOptionCount > 1 ? 's' : ''}`);
        const confirmed = await appConfirm(
            `End session for ${session.symbol}?\n\nYou have ${posDesc.join(' and ')} still open. ` +
            `All open positions will be closed at the last known prices before ending the session.`
        );
        if (!confirmed) return;
        forceCloseSessionPositions(session);
    } else {
        if (!(await appConfirm('End session for ' + session.symbol + '? This will save results and remove the active session.'))) return;
    }

    activeSessions.splice(index, 1);
    localStorage.setItem('simActiveSessions', JSON.stringify(activeSessions));

    simCurrentSymbol = '';
    window._simPendingSession = null;

    const trades = session.mode === 'stock' ? (session.closedTrades || []) : (session.closedOptionTrades || []);
    if (trades.length === 0) {
        renderActiveSessionCards();
        return;
    }

    const sessionData = buildSessionDataFromSaved(session);
    saveCompletedSession(sessionData);

    renderActiveSessionCards();

    if (typeof navigateToPage === 'function') {
        window._pendingSimResultDetail = sessionData;
        navigateToPage('simResultDetail');
    }
}

function enrichOptionTrade(t, i) {
    const parts = t.closedParts || [];
    const lastClose = parts.length > 0 ? parts[parts.length - 1] : null;

    const legWeightedExit = {};
    let totalClosedQty = 0;
    parts.forEach(part => {
        const qty = part.quantity || 1;
        totalClosedQty += qty;
        (part.exitPrices || []).forEach((ep, idx) => {
            const key = ep.leg || ('leg_' + idx);
            if (!legWeightedExit[key]) legWeightedExit[key] = { totalPrice: 0, totalQty: 0 };
            legWeightedExit[key].totalPrice += ep.price * qty;
            legWeightedExit[key].totalQty += qty;
        });
    });

    let netPremiumEntry = 0;
    let netPremiumExit = 0;
    const legDetails = (t.legs || []).map((leg, idx) => {
        const legKey = leg.name || ('leg_' + idx);
        const weighted = legWeightedExit[legKey];
        const exitPrice = weighted && weighted.totalQty > 0 ? weighted.totalPrice / weighted.totalQty : null;
        const mult = leg.position === 'long' ? -1 : 1;
        netPremiumEntry += leg.entryPrice * 100 * mult;
        if (exitPrice != null) netPremiumExit += exitPrice * 100 * mult;
        const qty = t.quantity || 1;
        const costMult = leg.position === 'long' ? -1 : 1;
        const entryCost = leg.entryPrice * 100 * qty * costMult;
        const exitCost = exitPrice != null ? exitPrice * 100 * qty * -costMult : null;
        let greeks = leg.entryGreeks || null;
        return {
            name: leg.name || `${leg.type} ${leg.strike}`,
            symbol: leg.optionSymbol || '',
            position: leg.position,
            type: leg.type,
            strike: leg.strike,
            entryPrice: leg.entryPrice,
            exitPrice: exitPrice,
            entryCost: entryCost,
            exitCost: exitCost,
            iv: greeks ? greeks.iv : null,
            delta: greeks ? greeks.delta : null,
            gamma: greeks ? greeks.gamma : null,
            theta: greeks ? greeks.theta : null,
            vega: greeks ? greeks.vega : null
        };
    });

    return {
        id: i + 1,
        strategy: t.strategy,
        legs: legDetails.map(l => l.name).join(' / '),
        legSymbols: legDetails.map(l => l.symbol).filter(s => s).join(' / '),
        legDetails: legDetails,
        quantity: t.quantity,
        entryPremium: t.totalEntryPremium,
        netPremiumEntry: netPremiumEntry * (t.quantity || 1),
        netPremiumExit: legDetails.some(l => l.exitPrice == null) ? null : netPremiumExit * (t.quantity || 1),
        underlyingAtEntry: t.underlyingAtEntry != null ? t.underlyingAtEntry : null,
        entryTime: t.entryTimestamp || '',
        exitTime: lastClose ? lastClose.exitTimestamp : '',
        expiration: t.expiration || '',
        pnl: t.realizedPnl || 0,
        exitReason: lastClose ? lastClose.reason : 'manual',
        tp: t.tp,
        sl: t.sl,
        tpType: t.tpType,
        slType: t.slType
    };
}

function buildSessionDataFromSaved(session) {
    const trades = session.mode === 'stock' ? (session.closedTrades || []) : (session.closedOptionTrades || []);
    const realizedPnl = session.realizedPnl || 0;
    const initialBalance = session.initialBalance || 100000;

    let enrichedTrades = [];
    if (session.mode === 'stock') {
        enrichedTrades = trades.map((t, i) => ({
            id: i + 1, side: t.side, quantity: t.quantity,
            entryPrice: t.entryPrice, exitPrice: t.exitPrice,
            entryTime: t.entryTimestamp || '', exitTime: t.exitTimestamp || '',
            entryBarIndex: t.entryBarIndex, exitBarIndex: t.exitBarIndex,
            barsInTrade: (t.exitBarIndex || 0) - (t.entryBarIndex || 0), pnl: t.pnl
        }));
    } else {
        enrichedTrades = trades.map((t, i) => enrichOptionTrade(t, i));
    }

    return buildAnalyticsFromTrades(enrichedTrades, session);
}

function buildAnalyticsFromTrades(enrichedTrades, session) {
    const initialBalance = session.initialBalance || 100000;
    const realizedPnl = session.realizedPnl || 0;
    const wins = enrichedTrades.filter(t => t.pnl > 0);
    const losses = enrichedTrades.filter(t => t.pnl <= 0);
    const totalTrades = enrichedTrades.length;
    const winRate = totalTrades > 0 ? (wins.length / totalTrades * 100) : 0;
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
    const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
    const maxWin = wins.length > 0 ? Math.max(...wins.map(t => t.pnl)) : 0;
    const maxLoss = losses.length > 0 ? Math.min(...losses.map(t => t.pnl)) : 0;

    let avgBarsInTrade = 0;
    if (session.mode === 'stock' && enrichedTrades.length > 0) {
        avgBarsInTrade = enrichedTrades.reduce((s, t) => s + (t.barsInTrade || 0), 0) / enrichedTrades.length;
    }

    let avgDurationMs = 0;
    if (enrichedTrades.length > 0) {
        let totalMs = 0, durCount = 0;
        enrichedTrades.forEach(t => {
            if (t.entryTime && t.exitTime) {
                const diff = new Date(t.exitTime) - new Date(t.entryTime);
                if (!isNaN(diff) && diff > 0) { totalMs += diff; durCount++; }
            }
        });
        if (durCount > 0) avgDurationMs = totalMs / durCount;
    }

    const tradeReturns = enrichedTrades.map(t => t.pnl / initialBalance);
    const meanReturn = tradeReturns.length > 0 ? tradeReturns.reduce((s, r) => s + r, 0) / tradeReturns.length : 0;
    const variance = tradeReturns.length > 1
        ? tradeReturns.reduce((s, r) => s + Math.pow(r - meanReturn, 2), 0) / (tradeReturns.length - 1) : 0;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(252) : 0;
    const riskPerTrade = initialBalance > 0 && totalTrades > 0 ? (avgLoss / initialBalance * 100) : 0;
    const returnOnRisk = avgLoss > 0 ? (avgWin / avgLoss) : avgWin > 0 ? Infinity : 0;

    let maxDrawdown = 0, peak = initialBalance, runningBalance = initialBalance;
    const equityCurve = [{ balance: initialBalance, trade: 0 }];
    enrichedTrades.forEach((t, i) => {
        runningBalance += t.pnl;
        equityCurve.push({ balance: runningBalance, trade: i + 1 });
        if (runningBalance > peak) peak = runningBalance;
        const dd = (runningBalance - peak) / peak * 100;
        if (dd < maxDrawdown) maxDrawdown = dd;
    });

    let consecutiveWins = 0, consecutiveLosses = 0, maxConsecWins = 0, maxConsecLosses = 0;
    enrichedTrades.forEach(t => {
        if (t.pnl > 0) { consecutiveWins++; consecutiveLosses = 0; }
        else { consecutiveLosses++; consecutiveWins = 0; }
        if (consecutiveWins > maxConsecWins) maxConsecWins = consecutiveWins;
        if (consecutiveLosses > maxConsecLosses) maxConsecLosses = consecutiveLosses;
    });

    const netReturn = initialBalance > 0 ? ((runningBalance - initialBalance) / initialBalance * 100) : 0;
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const suffix = session.mode === 'options' ? 'O' : 'S';
    const sessionId = `${dd}${mm}${yy}${hh}${min}${suffix}`;

    return {
        sessionId, symbol: session.symbol, mode: session.mode,
        initialBalance, finalBalance: runningBalance, netPnl: realizedPnl,
        unrealizedPnl: 0, timestamp: new Date().toISOString(),
        trades: enrichedTrades, equityCurve,
        stats: {
            totalTrades, winRate, wins: wins.length, losses: losses.length,
            avgWin, avgLoss, avgBarsInTrade, avgDurationMs, grossProfit, grossLoss,
            profitFactor, sharpeRatio, maxWin, maxLoss, maxDrawdown,
            riskPerTrade, returnOnRisk, maxConsecWins, maxConsecLosses, netReturn
        }
    };
}

function saveCompletedSession(sessionData) {
    if (window._simGuestSession) return;
    let savedSessions = [];
    try { savedSessions = JSON.parse(localStorage.getItem('simTradingSessions') || '[]'); } catch(e) {}
    savedSessions.unshift(sessionData);
    if (savedSessions.length > 50) savedSessions = savedSessions.slice(0, 50);
    localStorage.setItem('simTradingSessions', JSON.stringify(savedSessions));
}

function initSimTradingActive() {
    console.log('Initializing Simulated Trading Active Page');

    const pending = window._simPendingSession;
    if (!pending) {
        console.log('No pending session, going back to config');
        if (typeof navigateToPage === 'function') navigateToPage('simulatedTrading');
        return;
    }

    setupTradingPageListeners();

    if (pending.isNew) {
        resetTradingState();
        simCurrentSymbol = pending.symbol;
        simChartDates = { start: pending.chartStartDate, end: pending.chartEndDate, tradingStart: pending.tradingStartDate };
        simInitialBalance = pending.balance;
        simSecondsEnabled = false;
        simSecondsInterval = 0;
        document.getElementById('simTradingMode') && (window._simTradingMode = pending.mode);
        window._simTradingMode = pending.mode;
        applyTradingMode();
        loadSimulatedChart();
    } else {
        restoreSession(pending.savedState);
    }
}

var _tradingPageListenersSet = _tradingPageListenersSet || false;

function setupTradingPageListeners() {
    if (_tradingPageListenersSet) return;
    _tradingPageListenersSet = true;

    window.addEventListener('beforeunload', function(e) {
        if (typeof simCurrentSymbol !== 'undefined' && simCurrentSymbol) {
            if (window._simGuestSession) {
                e.preventDefault();
                e.returnValue = 'You have an active trading session that will be lost if you leave. Are you sure?';
                return e.returnValue;
            }
            try { saveCurrentSessionState(); } catch(e2) {}
        }
    });

    document.getElementById('simBackBtn')?.addEventListener('click', handleBackToConfig);
    document.getElementById('simPrevBar')?.addEventListener('click', showPreviousBar);
    document.getElementById('simNextBar')?.addEventListener('click', showNextBar);
    document.getElementById('simPlayPauseBtn')?.addEventListener('click', toggleAutoplay);
    document.getElementById('simResetViewBtn')?.addEventListener('click', resetViewToCurrentCandle);
    document.getElementById('simIndicatorBtn')?.addEventListener('click', toggleSimIndicatorDropdown);
    document.addEventListener('click', function(e) {
        const dd = document.getElementById('simIndicatorDropdown');
        const btn = document.getElementById('simIndicatorBtn');
        if (dd && btn && !dd.contains(e.target) && !btn.contains(e.target)) {
            dd.style.display = 'none';
        }
    });
    document.getElementById('simGotoDateBtn')?.addEventListener('click', gotoDateTime);
    document.getElementById('simBuyBtn')?.addEventListener('click', () => executeTrade('buy'));
    document.getElementById('simSellBtn')?.addEventListener('click', () => executeTrade('sell'));
    document.getElementById('simEndSessionBtn')?.addEventListener('click', handleEndSession);
    document.getElementById('simCloseAllBtn')?.addEventListener('click', handleCloseAll);
    document.getElementById('simOptionTradeBtn')?.addEventListener('click', executeOptionTrade);
    document.getElementById('simOptionStrategy')?.addEventListener('change', function() {
        buildSimLegConfiguration();
        const strategy = this.value;
        const dteInput = document.getElementById('simOptionDTE');
        if (dteInput) {
            if (isSimCalendarDiagonalStrategy(strategy)) {
                dteInput.disabled = true;
                dteInput.style.opacity = '0.5';
                dteInput.title = 'DTE is configured per-leg for calendar/diagonal strategies';
            } else {
                dteInput.disabled = false;
                dteInput.style.opacity = '1';
                dteInput.title = '';
            }
        }
    });

    document.getElementById('simAutoplaySpeed')?.addEventListener('change', () => {
        if (simIsPlaying) { stopAutoplay(); startAutoplay(); }
    });

    document.querySelectorAll('.sim-tf-btn').forEach(btn => {
        btn.addEventListener('click', (e) => switchTimeframe(e.target.dataset.timeframe));
    });

    document.getElementById('simSecondsSelect')?.addEventListener('change', (e) => {
        changeSecondsResolution(e.target.value);
    });
}

function handleBackToConfig() {
    stopAutoplay();
    if (window._simGuestSession) {
        if (!confirm('You are not signed in. Leaving will discard your current session. Are you sure?')) return;
        window._simPendingSession = null;
        window._simGuestSession = false;
    } else {
        saveCurrentSessionState();
    }
    if (typeof navigateToPage === 'function') navigateToPage('simulatedTrading');
}

async function handleEndSession() {
    stopAutoplay();
    const mode = window._simTradingMode || 'stock';
    const trades = mode === 'stock' ? simClosedTrades : simClosedOptionTrades;
    const hasOpenStock = mode === 'stock' && simOpenPosition;
    const hasOpenOptions = mode === 'options' && simOpenOptionPositions.length > 0;

    if (hasOpenStock || hasOpenOptions) {
        await appAlert('Please close all open positions before ending the session.');
        return;
    }

    var isGuest = window._simGuestSession;
    var confirmMsg = isGuest
        ? 'End this session? As a guest, results will be shown but not saved. Sign in to save your results.'
        : 'End this session and save results?';
    if (!(await appConfirm(confirmMsg))) return;

    if (!isGuest) removeActiveSession();
    simCurrentSymbol = '';
    window._simPendingSession = null;

    if (trades.length === 0) {
        if (isGuest) window._simGuestSession = false;
        if (typeof navigateToPage === 'function') navigateToPage('simulatedTrading');
        return;
    }

    var sessionData = buildCurrentSessionData();
    saveCompletedSession(sessionData);

    window._pendingSimResultDetail = sessionData;
    if (isGuest) window._simGuestSession = false;
    if (typeof navigateToPage === 'function') navigateToPage('simResultDetail');
}

function handleCloseAll() {
    const mode = window._simTradingMode || 'stock';
    if (simVisibleBars.length === 0) return;
    const currentBar = simVisibleBars[simVisibleBars.length - 1];
    const currentPrice = currentBar.vwap || currentBar.close;

    if (mode === 'stock' && simOpenPosition) {
        const closePnl = calculatePositionPnl(simOpenPosition, currentPrice);
        simRealizedPnl += closePnl;
        simClosedTrades.push({
            ...simOpenPosition, exitPrice: currentPrice, exitBarIndex: simCurrentBarIndex,
            exitTimestamp: currentBar.timestamp, pnl: closePnl
        });
        simOpenPosition = null;
    }

    if (mode === 'options' && simOpenOptionPositions.length > 0) {
        const ids = simOpenOptionPositions.map(p => p.id);
        ids.forEach(id => closeOptionPosition(id, null, 'Close All'));
    }

    updateTradingDisplay();
    updatePositionLines();
    updatePnlShading();
}

function buildCurrentSessionData() {
    const mode = window._simTradingMode || 'stock';
    const trades = mode === 'stock' ? simClosedTrades : simClosedOptionTrades;
    const realizedPnl = mode === 'stock' ? simRealizedPnl : simOptionsRealizedPnl;

    let enrichedTrades = [];
    if (mode === 'stock') {
        enrichedTrades = simClosedTrades.map((t, i) => {
            const entryBar = simAllBars[t.entryBarIndex];
            const exitBar = simAllBars[t.exitBarIndex];
            return {
                id: i + 1, side: t.side, quantity: t.quantity,
                entryPrice: t.entryPrice, exitPrice: t.exitPrice,
                entryTime: entryBar ? entryBar.timestamp : t.entryTimestamp || '',
                exitTime: exitBar ? exitBar.timestamp : '',
                entryBarIndex: t.entryBarIndex, exitBarIndex: t.exitBarIndex,
                barsInTrade: (t.exitBarIndex || 0) - (t.entryBarIndex || 0), pnl: t.pnl
            };
        });
    } else {
        enrichedTrades = simClosedOptionTrades.map((t, i) => enrichOptionTrade(t, i));
    }

    return buildAnalyticsFromTrades(enrichedTrades, {
        symbol: simCurrentSymbol, mode: mode,
        initialBalance: simInitialBalance, realizedPnl: realizedPnl
    });
}

function saveCurrentSessionState() {
    if (!simCurrentSymbol || !simDataLoaded) return;
    if (window._simGuestSession) return;
    const mode = window._simTradingMode || 'stock';

    let unrealizedPnl = 0;
    if (mode === 'stock' && simOpenPosition) {
        const lastBar = simVisibleBars.length > 0 ? simVisibleBars[simVisibleBars.length - 1] : null;
        if (lastBar) unrealizedPnl = calculatePositionPnl(simOpenPosition, lastBar.close);
    } else if (mode === 'options' && simOpenOptionPositions.length > 0) {
        const currentMinuteBar = simMinuteBarsCache[simCurrentMinuteIndex - 1];
        const currentTimestamp = currentMinuteBar ? currentMinuteBar.timestamp : Date.now();
        for (const pos of simOpenOptionPositions) {
            unrealizedPnl += calculateOptionPositionPnl(pos, currentTimestamp);
        }
    }

    const realizedPnl = mode === 'stock' ? simRealizedPnl : simOptionsRealizedPnl;
    const sessionState = {
        symbol: simCurrentSymbol,
        mode: mode,
        chartStartDate: simChartDates.start,
        chartEndDate: simChartDates.end,
        tradingStartDate: simChartDates.tradingStart,
        initialBalance: simInitialBalance,
        currentBalance: simInitialBalance + realizedPnl,
        realizedPnl: realizedPnl,
        unrealizedPnl: unrealizedPnl,
        currentMinuteIndex: simCurrentMinuteIndex,
        // Replay position as a wall-clock anchor. The index alone is meaningless once
        // the base resolution or the fetched date window changes.
        currentTimestamp: (simMinuteBarsCache[simCurrentMinuteIndex - 1] || {}).timestamp || null,
        currentTimeframe: simCurrentTimeframe,
        secondsEnabled: simSecondsEnabled,
        secondsInterval: simSecondsInterval,
        openPosition: simOpenPosition,
        closedTrades: simClosedTrades,
        closedTradesCount: (mode === 'stock' ? simClosedTrades : simClosedOptionTrades).length,
        openPositionsCount: mode === 'stock' ? (simOpenPosition ? 1 : 0) : simOpenOptionPositions.length,
        optionsRealizedPnl: simOptionsRealizedPnl,
        openOptionPositions: simOpenOptionPositions.map(p => ({
            ...p,
            legs: p.legs.map(l => ({ ...l, optionBars: [] }))
        })),
        closedOptionTrades: simClosedOptionTrades.map(t => ({
            ...t,
            legs: t.legs ? t.legs.map(l => ({ ...l, optionBars: [] })) : []
        })),
        createdAt: simActiveSessionId || new Date().toISOString(),
        indicators: lwIndicators.map(ind => {
            const base = { type: ind.type, period: ind.period, color: ind.color, lineWidth: ind.lineWidth || 2 };
            if (ind.type === 'macd') {
                base.shortPeriod  = ind.shortPeriod  || 12;
                base.longPeriod   = ind.longPeriod   || 26;
                base.signalPeriod = ind.signalPeriod || 9;
            }
            return base;
        })
    };

    let activeSessions = [];
    try { activeSessions = JSON.parse(localStorage.getItem('simActiveSessions') || '[]'); } catch(e) {}

    const pending = window._simPendingSession;
    if (pending && !pending.isNew && pending.sessionIndex !== undefined) {
        activeSessions[pending.sessionIndex] = sessionState;
    } else {
        activeSessions.unshift(sessionState);
        if (pending) {
            pending.isNew = false;
            pending.sessionIndex = 0;
        }
    }

    localStorage.setItem('simActiveSessions', JSON.stringify(activeSessions));
}

function removeActiveSession() {
    let activeSessions = [];
    try { activeSessions = JSON.parse(localStorage.getItem('simActiveSessions') || '[]'); } catch(e) {}

    const pending = window._simPendingSession;
    if (pending && !pending.isNew && pending.sessionIndex !== undefined) {
        activeSessions.splice(pending.sessionIndex, 1);
    } else {
        const idx = activeSessions.findIndex(s =>
            s.symbol === simCurrentSymbol && s.chartStartDate === simChartDates.start
        );
        if (idx >= 0) activeSessions.splice(idx, 1);
    }

    localStorage.setItem('simActiveSessions', JSON.stringify(activeSessions));
}

async function restoreSession(savedState) {
    resetTradingState();
    simCurrentSymbol = savedState.symbol;
    simChartDates = { start: savedState.chartStartDate, end: savedState.chartEndDate, tradingStart: savedState.tradingStartDate };
    simSecondsEnabled = Boolean(savedState.secondsEnabled);
    simSecondsInterval = savedState.secondsInterval || 0;
    if (simSecondsEnabled && !simSecondsInterval) simSecondsEnabled = false;
    simInitialBalance = savedState.initialBalance;
    window._simTradingMode = savedState.mode;
    applyTradingMode();

    simRealizedPnl = savedState.mode === 'stock' ? (savedState.realizedPnl || 0) : 0;
    simOptionsRealizedPnl = savedState.optionsRealizedPnl || 0;
    simOpenPosition = savedState.openPosition || null;
    simClosedTrades = savedState.closedTrades || [];
    simClosedOptionTrades = savedState.closedOptionTrades || [];
    simOpenOptionPositions = savedState.openOptionPositions || [];
    simActiveSessionId = savedState.createdAt;

    simCurrentTimeframe = savedState.currentTimeframe || (simSecondsEnabled ? 'seconds' : '1m');

    // Prefer the timestamp anchor; the saved index is only valid for sessions written
    // before timestamps were stored, which were always full-range minute sessions.
    const targetTimestamp = savedState.currentTimestamp || null;
    const targetMinuteIndex = targetTimestamp ? null : (savedState.currentMinuteIndex || 0);

    await loadSimulatedChart(targetMinuteIndex, targetTimestamp);
    await restoreOptionBarsForOpenPositions();

    if (savedState.indicators && savedState.indicators.length > 0) {
        for (const indConfig of savedState.indicators) {
            try {
                addSimIndicator(indConfig);
            } catch (e) {
                console.warn('Failed to restore indicator:', indConfig, e);
            }
        }
    }
}

async function restoreOptionBarsForOpenPositions() {
    if (simOpenOptionPositions.length === 0) return;
    const apiUrl = '/api';

    for (const pos of simOpenOptionPositions) {
        for (const leg of pos.legs) {
            if (leg.optionBars && leg.optionBars.length > 0) continue;
            if (!leg.optionSymbol) continue;
            try {
                const response = await fetch(`${apiUrl}/simulated-trading/option-bars-by-symbol`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        option_symbol: leg.optionSymbol,
                        start_date: simDataWindow.start || simChartDates.start,
                        end_date: simDataWindow.end || simChartDates.end,
                        multiplier: simSecondsEnabled ? simSecondsInterval : 1,
                        bar_size: simSecondsEnabled ? 'second' : 'minute'
                    })
                });
                if (response.ok) {
                    const data = await response.json();
                    leg.optionBars = data.bars || [];
                }
            } catch (e) {
                console.error('Failed to restore option bars for', leg.optionSymbol, e);
            }
        }
    }
    updateOptionsPnlDisplay();
    updateSimIVDisplay();
}

function applyTradingMode() {
    const mode = window._simTradingMode || 'stock';
    const stockSection = document.getElementById('simStockTradingSection');
    const optionsSection = document.getElementById('simOptionsTradingSection');
    if (stockSection) stockSection.style.display = mode === 'stock' ? 'flex' : 'none';
    if (optionsSection) optionsSection.style.display = mode === 'options' ? '' : 'none';

    if (mode === 'options') {
        buildSimLegConfiguration();
    }
}

function resetTradingState() {
    stopAutoplay();
    simDataLoaded = false;
    simAllBars = [];
    simVisibleBars = [];
    simCurrentBarIndex = 0;
    simTradingStartIndex = 0;
    simCurrentMinuteIndex = 0;
    simTradingStartMinuteIndex = 0;
    simMinuteBarsCache = [];
    simSecondsEnabled = false;
    simSecondsInterval = 0;
    simDataWindow = { start: '', end: '' };
    simTimeframeData = {};
    simCurrentTimeframe = '1m';
    simIsLoadingTimeframes = false;
    simUserHasDragged = false;

    simInitialBalance = 100000;
    simRealizedPnl = 0;
    simOpenPosition = null;
    simClosedTrades = [];

    simOptionsRealizedPnl = 0;
    simOpenOptionPositions = [];
    simClosedOptionTrades = [];
    simOptionBarsCache = {};
    simActiveSessionId = null;

    destroyLWChart();
}

function showLoader(show, text = 'Loading chart data...', progress = '') {
    const loader = document.getElementById('simChartLoader');
    const loaderText = document.getElementById('simLoaderText');
    const loaderProgress = document.getElementById('simLoaderProgress');
    if (!loader) return;
    loader.style.display = show ? 'block' : 'none';
    if (text && loaderText) loaderText.textContent = text;
    if (loaderProgress) loaderProgress.textContent = progress;
}

function updateLoadingStatus(text) {
    const statusEl = document.getElementById('simDataLoadingStatus');
    if (statusEl) statusEl.textContent = text;
}

async function fetchBaseBars(symbol, startDate, endDate) {
    const apiUrl = '/api';
    try {
        const response = await fetch(`${apiUrl}/simulated-trading/bars`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                symbol, start_date: startDate, end_date: endDate,
                bar_size: simSecondsEnabled ? 'second' : 'minute',
                multiplier: simSecondsEnabled ? simSecondsInterval : 1
            })
        });
        if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'Failed to fetch data'); }
        const data = await response.json();
        return data.bars || [];
    } catch (error) {
        console.error('Error fetching simulated bars:', error);
        return null;
    }
}

function aggregateBars(minuteBars, targetMinutes) {
    if (!minuteBars || minuteBars.length === 0) return [];
    // Only skip aggregation when the base cache already holds 1-minute bars. With a
    // seconds base, 1m must still be built by grouping the sub-minute bars.
    if (targetMinutes === 1 && !simSecondsEnabled) return minuteBars;
    const aggregated = [];
    const intervalMs = targetMinutes * 60 * 1000;
    let currentBatch = [];
    let batchStartTime = null;
    for (let i = 0; i < minuteBars.length; i++) {
        const bar = minuteBars[i];
        const barTime = bar.timestamp;
        const alignedTime = Math.floor(barTime / intervalMs) * intervalMs;
        if (batchStartTime === null) batchStartTime = alignedTime;
        if (alignedTime !== batchStartTime && currentBatch.length > 0) {
            aggregated.push(createAggregatedBar(currentBatch, batchStartTime));
            currentBatch = [];
            batchStartTime = alignedTime;
        }
        const timeSinceLastBar = i > 0 ? barTime - minuteBars[i - 1].timestamp : 0;
        if (timeSinceLastBar > 2 * 60 * 1000 && currentBatch.length > 0) {
            aggregated.push(createAggregatedBar(currentBatch, batchStartTime));
            currentBatch = [];
            batchStartTime = alignedTime;
        }
        currentBatch.push(bar);
    }
    if (currentBatch.length > 0) aggregated.push(createAggregatedBar(currentBatch, batchStartTime));
    return aggregated;
}

function createAggregatedBar(bars, timestamp, isPartial = false) {
    return {
        timestamp, open: bars[0].open,
        high: Math.max(...bars.map(b => b.high)),
        low: Math.min(...bars.map(b => b.low)),
        close: bars[bars.length - 1].close,
        volume: bars.reduce((sum, b) => sum + (b.volume || 0), 0),
        isPartial, minuteCount: bars.length,
        lastMinuteTimestamp: bars[bars.length - 1].timestamp
    };
}

function aggregateBarsUpToMinute(minuteBars, targetMinutes, upToMinuteIndex) {
    if (!minuteBars || minuteBars.length === 0 || upToMinuteIndex <= 0) return [];
    if (targetMinutes === 1 && !simSecondsEnabled) {
        return minuteBars.slice(0, upToMinuteIndex).map(bar => ({
            ...bar, isPartial: false, minuteCount: 1, lastMinuteTimestamp: bar.timestamp
        }));
    }
    const aggregated = [];
    const intervalMs = targetMinutes * 60 * 1000;
    const barsToProcess = minuteBars.slice(0, upToMinuteIndex);
    let currentBatch = [];
    let batchStartTime = null;
    for (let i = 0; i < barsToProcess.length; i++) {
        const bar = barsToProcess[i];
        const barTime = bar.timestamp;
        const alignedTime = Math.floor(barTime / intervalMs) * intervalMs;
        if (batchStartTime === null) batchStartTime = alignedTime;
        if (alignedTime !== batchStartTime && currentBatch.length > 0) {
            aggregated.push(createAggregatedBar(currentBatch, batchStartTime, false));
            currentBatch = [];
            batchStartTime = alignedTime;
        }
        const timeSinceLastBar = i > 0 ? barTime - barsToProcess[i - 1].timestamp : 0;
        if (timeSinceLastBar > 2 * 60 * 1000 && currentBatch.length > 0) {
            aggregated.push(createAggregatedBar(currentBatch, batchStartTime, false));
            currentBatch = [];
            batchStartTime = alignedTime;
        }
        currentBatch.push(bar);
    }
    if (currentBatch.length > 0) {
        const expectedBarsInCandle = targetMinutes;
        const isPartial = currentBatch.length < expectedBarsInCandle;
        aggregated.push(createAggregatedBar(currentBatch, batchStartTime, isPartial));
    }
    return aggregated;
}

async function loadSimulatedChart(restoreMinuteIndex = null, restoreTimestamp = null) {
    stopAutoplay();
    showLoader(true, 'Loading chart data...', '');

    try {
        const window_ = computeDataWindow(restoreTimestamp);
        simDataWindow = window_;
        const rawMinuteBars = await fetchBaseBars(simCurrentSymbol, window_.start, window_.end);
        if (!rawMinuteBars || rawMinuteBars.length === 0) throw new Error('No data found for the specified parameters');

        const minuteBars = rawMinuteBars.filter(bar => {
            const d = new Date(bar.timestamp);
            const etStr = d.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false });
            const timePart = etStr.split(', ')[1] || '';
            const [h, m] = timePart.split(':').map(Number);
            const totalMin = h * 60 + m;
            return totalMin >= 240 && totalMin < 1200;
        });
        if (minuteBars.length === 0) throw new Error('No market data found for the specified parameters');

        simMinuteBarsCache = minuteBars;
        simDataLoaded = true;
        console.log(`Fetched ${minuteBars.length} ${simSecondsEnabled ? `${simSecondsInterval}-second` : '1-minute'} bars`);

        showLoader(true, 'Computing timeframes...', '0 / 7');
        let resolvedIndex = restoreMinuteIndex;
        if (resolvedIndex === null && restoreTimestamp) {
            // Re-anchor the replay on the same moment in time after a resolution change.
            const idx = minuteBars.findIndex(bar => bar.timestamp > restoreTimestamp);
            resolvedIndex = idx === -1 ? minuteBars.length : idx;
        }
        computeAllTimeframes(simChartDates.tradingStart, resolvedIndex);
        return true;
    } catch (error) {
        console.error('Error loading chart:', error);
        simDataLoaded = false;
        appAlert('Error loading chart: ' + error.message);
        showLoader(false);
        return false;
    }
}

// The session opens with the 09:30 bar of the trading start day already printed, so the
// chart is never blank. If that date is a weekend/holiday (or falls outside a narrowed
// seconds window) the first available bar at/after it is used instead.
function resolveTradingStartIndex(bars, tradingStartDate) {
    if (!bars || bars.length === 0) return 0;
    const openTs = String(tradingStartDate).includes('T')
        ? new Date(tradingStartDate).getTime()
        : parseETDateTime(tradingStartDate, '09:30');
    let idx = bars.findIndex(bar => bar.timestamp >= openTs);
    if (idx === -1) idx = bars.length - 1;
    // Index is a visible-bar COUNT, so +1 makes the opening bar the current bar.
    return Math.min(idx + 1, bars.length);
}

function computeAllTimeframes(tradingStartDate, restoreMinuteIndex = null) {
    for (const tf of SIM_TIMEFRAMES) {
        updateLoadingStatus(`Computing ${SIM_TIMEFRAME_CONFIG[tf].label}...`);
        const targetMinutes = TIMEFRAME_MINUTES[tf];
        simTimeframeData[tf] = aggregateBars(simMinuteBarsCache, targetMinutes);
        simLoadedTimeframes++;
        updateTimeframeButtons();
    }

    if (simSecondsEnabled) {
        simTimeframeData.seconds = simMinuteBarsCache;
    } else {
        delete simTimeframeData.seconds;
    }
    syncSecondsSelect();

    simTradingStartMinuteIndex = resolveTradingStartIndex(simMinuteBarsCache, tradingStartDate);

    if (restoreMinuteIndex !== null) {
        simCurrentMinuteIndex = Math.min(restoreMinuteIndex, simMinuteBarsCache.length);
    } else {
        simCurrentMinuteIndex = simTradingStartMinuteIndex;
    }

    rebuildBarsForCurrentTimeframe();
    createLWChart();
    updateChartData();
    updateNavigationButtons();
    updateSymbolDisplay();
    updateTradingDisplay();
    updatePositionLines();
    updatePnlShading();
    showLoader(false);

    simIsLoadingTimeframes = false;
    updateLoadingStatus(`All timeframes ready (${simMinuteBarsCache.length} bars)`);
    setTimeout(() => updateLoadingStatus(''), 3000);
}

function syncSecondsSelect() {
    const select = document.getElementById('simSecondsSelect');
    if (select) select.value = simSecondsEnabled ? String(simSecondsInterval) : '';
    syncAdvanceIntervalOptions();
}

// Reloads the base bars at the selected resolution while keeping the replay anchored
// to the same point in time rather than the same array index.
async function changeSecondsResolution(rawValue) {
    if (simIsChangingResolution) return;
    const interval = parseInt(rawValue, 10);
    const wantSeconds = Number.isInteger(interval) && interval > 0;
    if (wantSeconds === simSecondsEnabled && (!wantSeconds || interval === simSecondsInterval)) return;
    if (!simDataLoaded) { syncSecondsSelect(); return; }

    stopAutoplay();
    simIsChangingResolution = true;

    const prevSecondsEnabled = simSecondsEnabled;
    const prevSecondsInterval = simSecondsInterval;
    const prevTimeframe = simCurrentTimeframe;
    const anchorBar = simMinuteBarsCache[Math.max(0, simCurrentMinuteIndex - 1)];
    const anchorTs = anchorBar ? anchorBar.timestamp : null;

    simSecondsEnabled = wantSeconds;
    simSecondsInterval = wantSeconds ? interval : 0;
    simCurrentTimeframe = wantSeconds ? 'seconds' : (prevTimeframe === 'seconds' ? '1m' : prevTimeframe);

    const loaded = await loadSimulatedChart(null, anchorTs);
    if (!loaded) {
        simSecondsEnabled = prevSecondsEnabled;
        simSecondsInterval = prevSecondsInterval;
        simCurrentTimeframe = prevTimeframe;
        simIsChangingResolution = false;
        syncSecondsSelect();
        await loadSimulatedChart(null, anchorTs);
        return;
    }

    // Option legs were priced from bars at the previous resolution; refetch them so
    // option P&L, take-profit and stop-loss run on the same grid as the underlying.
    for (const pos of simOpenOptionPositions) {
        for (const leg of pos.legs) leg.optionBars = [];
    }
    await restoreOptionBarsForOpenPositions();

    updateTradingDisplay();
    updateOptionsPnlDisplay();
    updateNavigationButtons();
    simIsChangingResolution = false;
    syncSecondsSelect();
}

function rebuildBarsForCurrentTimeframe() {
    if (simCurrentTimeframe === 'seconds') {
        simAllBars = simMinuteBarsCache;
        simVisibleBars = simMinuteBarsCache.slice(0, simCurrentMinuteIndex);
        simCurrentBarIndex = simVisibleBars.length;
        simTradingStartIndex = simTradingStartMinuteIndex;
        return;
    }
    const targetMinutes = TIMEFRAME_MINUTES[simCurrentTimeframe];
    simAllBars = simTimeframeData[simCurrentTimeframe] || [];
    simVisibleBars = aggregateBarsUpToMinute(simMinuteBarsCache, targetMinutes, simCurrentMinuteIndex);
    simTradingStartIndex = Math.max(0, resolveTradingStartIndex(simAllBars, simChartDates.tradingStart) - 1);
    simCurrentBarIndex = simVisibleBars.length;
}

function createLWChart() {
    destroyLWChart();
    const container = document.getElementById('simLWChartContainer');
    if (!container || typeof LightweightCharts === 'undefined') {
        console.error('Lightweight Charts not available');
        return;
    }

    lwChart = LightweightCharts.createChart(container, {
        layout: {
            background: { type: 'solid', color: '#ffffff' },
            textColor: '#191919',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: 12
        },
        grid: {
            vertLines: { color: '#e1e3eb' },
            horzLines: { color: '#e1e3eb' }
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: { color: '#9598a1', width: 1, style: 3, labelBackgroundColor: '#2962ff' },
            horzLine: { color: '#9598a1', width: 1, style: 3, labelBackgroundColor: '#2962ff' }
        },
        rightPriceScale: {
            borderColor: '#d1d4dc',
            scaleMargins: { top: 0.1, bottom: 0.2 }
        },
        localization: {
            timeFormatter: (ts) => {
                const d = new Date(ts * 1000);
                return d.toLocaleTimeString('en-US', {
                    timeZone: 'America/New_York',
                    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
                });
            }
        },
        timeScale: {
            borderColor: '#d1d4dc',
            timeVisible: true,
            secondsVisible: simSecondsEnabled,
            rightOffset: 5,
            barSpacing: 6,
            minBarSpacing: 2
        },
        handleScroll: { vertTouchDrag: false },
        handleScale: { axisPressedMouseMove: true }
    });

    lwCandleSeries = lwChart.addCandlestickSeries({
        upColor: '#089981',
        downColor: '#f23645',
        borderUpColor: '#089981',
        borderDownColor: '#f23645',
        wickUpColor: '#089981',
        wickDownColor: '#f23645'
    });

    lwVolumeSeries = lwChart.addHistogramSeries({
        color: '#089981',
        priceFormat: { type: 'volume' },
        priceScaleId: '',
        scaleMargins: { top: 0.85, bottom: 0 }
    });

    lwChart.subscribeCrosshairMove(param => {
        if (!param || !param.time || !param.seriesData) return;
        const data = param.seriesData.get(lwCandleSeries);
        if (data) {
            updateOHLCDisplayForBar({
                open: data.open, high: data.high, low: data.low, close: data.close,
                volume: param.seriesData.get(lwVolumeSeries)?.value || 0
            });
        }
    });

    lwChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (lwChart && lwChart._userScrolling) {
            simUserHasDragged = true;
        }
        if (!_lwTsSyncing && range) {
            _lwTsSyncing = true;
            try {
                if (lwRsiChart) lwRsiChart.timeScale().setVisibleLogicalRange(range);
                if (lwMacdChart) lwMacdChart.timeScale().setVisibleLogicalRange(range);
            } finally { _lwTsSyncing = false; }
        }
    });

    function onMouseDown() { if (lwChart) lwChart._userScrolling = true; }
    function onMouseUp() { if (lwChart) lwChart._userScrolling = false; }
    function onWheel() { simUserHasDragged = true; }
    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mouseup', onMouseUp);
    container.addEventListener('touchstart', onMouseDown);
    container.addEventListener('touchend', onMouseUp);
    container.addEventListener('wheel', onWheel, { passive: true });

    const ro = new ResizeObserver(entries => {
        if (!lwChart) return;
        const { width, height } = entries[0].contentRect;
        lwChart.applyOptions({ width, height });
    });
    ro.observe(container);

    lwChart._cleanup = { container, onMouseDown, onMouseUp, onWheel, ro };
}

function destroyLWChart() {
    if (lwChart) {
        if (lwChart._cleanup) {
            const c = lwChart._cleanup;
            c.container.removeEventListener('mousedown', c.onMouseDown);
            c.container.removeEventListener('mouseup', c.onMouseUp);
            c.container.removeEventListener('touchstart', c.onMouseDown);
            c.container.removeEventListener('touchend', c.onMouseUp);
            c.container.removeEventListener('wheel', c.onWheel);
            c.ro.disconnect();
        }
        lwChart.remove();
        lwChart = null;
        lwCandleSeries = null;
        lwVolumeSeries = null;
        lwPositionLines = [];
        lwPnlShadingSeries = null;
        lwIndicators.forEach(ind => { ind.series = null; });
        lwIndicators = [];
        lwIndicatorNextId = 1;
        destroyRSIPane();
        destroyMACDPane();
        refreshIndicatorsList();
    }
}

function updateChartData() {
    if (!lwCandleSeries || !lwVolumeSeries) return;
    if (simVisibleBars.length === 0) return;

    const seen = new Set();
    const candleData = [];
    const volumeData = [];
    for (const bar of simVisibleBars) {
        const t = Math.floor(bar.timestamp / 1000);
        if (seen.has(t)) continue;
        seen.add(t);
        candleData.push({ time: t, open: bar.open, high: bar.high, low: bar.low, close: bar.close });
        volumeData.push({ time: t, value: bar.volume || 0, color: bar.close >= bar.open ? 'rgba(8,153,129,0.4)' : 'rgba(242,54,69,0.4)' });
    }

    lwCandleSeries.setData(candleData);
    lwVolumeSeries.setData(volumeData);
    updateAllIndicators();
}

function computeSMA(bars, period) {
    const result = [];
    for (let i = 0; i < bars.length; i++) {
        if (i < period - 1) continue;
        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) {
            sum += bars[j].close;
        }
        result.push({ time: Math.floor(bars[i].timestamp / 1000), value: sum / period });
    }
    return result;
}

function computeEMA(bars, period) {
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

function computeVWAP(bars, period) {
    period = period || 14;
    const result = [];
    for (let i = 0; i < bars.length; i++) {
        const start = Math.max(0, i - period + 1);
        let cumVol = 0;
        let cumTP = 0;
        for (let j = start; j <= i; j++) {
            const bar = bars[j];
            const tp = (bar.high + bar.low + bar.close) / 3;
            const vol = bar.volume || 0;
            cumTP += tp * vol;
            cumVol += vol;
        }
        if (cumVol > 0) {
            result.push({ time: Math.floor(bars[i].timestamp / 1000), value: cumTP / cumVol });
        }
    }
    return result;
}

function computeRSI(bars, period) {
    const result = [];
    if (bars.length < period + 1) return result;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = bars[i].close - bars[i - 1].close;
        if (diff > 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / period, avgLoss = losses / period;
    const rsi0 = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    result.push({ time: Math.floor(bars[period].timestamp / 1000), value: rsi0 });
    for (let i = period + 1; i < bars.length; i++) {
        const diff = bars[i].close - bars[i - 1].close;
        avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
        const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
        result.push({ time: Math.floor(bars[i].timestamp / 1000), value: rsi });
    }
    return result;
}

function _emaArray(bars, period) {
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

function computeMACD(bars, shortPeriod, longPeriod, signalPeriod) {
    const shortEma = _emaArray(bars, shortPeriod);
    const longEma  = _emaArray(bars, longPeriod);
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
    return {
        macdLine: macdLine.map(d => ({ time: d.time, value: d.value })),
        signalLine,
        histogram
    };
}

function deduplicateTimeSeries(data) {
    if (data.length <= 1) return data;
    const seen = new Set();
    const result = [];
    for (const d of data) {
        if (!seen.has(d.time)) {
            seen.add(d.time);
            result.push(d);
        }
    }
    return result;
}

function updateAllIndicators() {
    if (!lwChart || simVisibleBars.length === 0) return;
    for (const ind of lwIndicators) {
        try {
            if (ind.type === 'sma' && ind.series) {
                ind.series.setData(deduplicateTimeSeries(computeSMA(simVisibleBars, ind.period)));
            } else if (ind.type === 'ema' && ind.series) {
                ind.series.setData(deduplicateTimeSeries(computeEMA(simVisibleBars, ind.period)));
            } else if (ind.type === 'vwap' && ind.series) {
                ind.series.setData(deduplicateTimeSeries(computeVWAP(simVisibleBars, ind.period)));
            } else if (ind.type === 'rsi' && lwRsiSeries) {
                lwRsiSeries.setData(deduplicateTimeSeries(computeRSI(simVisibleBars, ind.period)));
            } else if (ind.type === 'macd' && lwMacdHistSeries) {
                const { macdLine, signalLine, histogram } = computeMACD(
                    simVisibleBars, ind.shortPeriod || 12, ind.longPeriod || 26, ind.signalPeriod || 9
                );
                lwMacdHistSeries.setData(deduplicateTimeSeries(histogram));
                if (lwMacdLineSeries2) lwMacdLineSeries2.setData(deduplicateTimeSeries(macdLine));
                if (lwMacdSignalSeries) lwMacdSignalSeries.setData(deduplicateTimeSeries(signalLine));
            }
        } catch (e) {
            console.warn('Indicator update error for ' + ind.label + ':', e);
        }
    }
}

function onSimIndicatorTypeChange() {
    const type = document.getElementById('simIndicatorType').value;
    const periodGroup   = document.getElementById('simIndicatorPeriodGroup');
    const macdGroup     = document.getElementById('simMACDPeriodGroup');
    const lwGroup       = document.getElementById('simIndicatorLineWidthGroup');
    const colorGroup    = document.getElementById('simIndicatorColorGroup');
    const periodInput   = document.getElementById('simIndicatorPeriod');
    const colorInput    = document.getElementById('simIndicatorColor');

    if (type === 'macd') {
        if (periodGroup) periodGroup.style.display = 'none';
        if (macdGroup)   macdGroup.style.display   = 'block';
        if (lwGroup)     lwGroup.style.display      = 'none';
        if (colorGroup)  colorGroup.style.display   = 'none';
    } else if (type === 'rsi') {
        if (periodGroup) periodGroup.style.display = 'block';
        if (macdGroup)   macdGroup.style.display   = 'none';
        if (lwGroup)     lwGroup.style.display      = 'none';
        if (colorGroup)  colorGroup.style.display   = 'block';
        if (periodInput) periodInput.value = '14';
        if (colorInput)  colorInput.value  = '#7c3aed';
    } else {
        if (periodGroup) periodGroup.style.display = 'block';
        if (macdGroup)   macdGroup.style.display   = 'none';
        if (lwGroup)     lwGroup.style.display      = 'block';
        if (colorGroup)  colorGroup.style.display   = 'block';
        if (type === 'vwap' && periodInput) periodInput.value = '14';
        if (colorInput && (type === 'sma' || type === 'ema' || type === 'vwap')) colorInput.value = '#2962ff';
    }
}

function toggleSimIndicatorDropdown() {
    const dd = document.getElementById('simIndicatorDropdown');
    if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

function getMaxIndicators() {
    if (typeof TierRestrictions !== 'undefined') {
        var tier = TierRestrictions.getTier();
        if (tier === 'premium') return 20;
        if (tier === 'standard') return 5;
    }
    return 1;
}

function addSimIndicator(config) {
    if (!lwChart) return;
    const type = config ? config.type : document.getElementById('simIndicatorType').value;

    var maxInd = getMaxIndicators();
    if (lwIndicators.length >= maxInd) {
        var tierName = (typeof TierRestrictions !== 'undefined') ? TierRestrictions.getTier() : 'free';
        var upgradeMsg = tierName === 'premium' ? '' : ' Upgrade your plan for more.';
        alert('Maximum of ' + maxInd + ' indicator' + (maxInd > 1 ? 's' : '') + ' allowed on your ' + tierName + ' plan.' + upgradeMsg);
        return;
    }

    if (type === 'rsi') {
        if (lwIndicators.some(i => i.type === 'rsi')) { alert('RSI is already on the chart.'); return; }
        const period = config ? (config.period || 14) : (parseInt(document.getElementById('simIndicatorPeriod').value) || 14);
        const color  = config ? (config.color || '#7c3aed') : (document.getElementById('simIndicatorColor').value || '#7c3aed');
        if (period < 2 || period > 500) { alert('Period must be between 2 and 500.'); return; }
        const id = lwIndicatorNextId++;
        const label = 'RSI(' + period + ')';
        const ind = { id, type: 'rsi', period, color, lineWidth: 2, label, series: null };
        lwIndicators.push(ind);
        createRSIPane(ind);
        refreshIndicatorsList();
        saveCurrentSessionState();
        return;
    }

    if (type === 'macd') {
        if (lwIndicators.some(i => i.type === 'macd')) { alert('MACD is already on the chart.'); return; }
        const shortPeriod  = config ? (config.shortPeriod  || 12) : (parseInt(document.getElementById('simMACDShort').value)  || 12);
        const longPeriod   = config ? (config.longPeriod   || 26) : (parseInt(document.getElementById('simMACDLong').value)   || 26);
        const signalPeriod = config ? (config.signalPeriod || 9)  : (parseInt(document.getElementById('simMACDSignal').value) || 9);
        const id = lwIndicatorNextId++;
        const label = 'MACD(' + shortPeriod + ',' + longPeriod + ',' + signalPeriod + ')';
        const ind = { id, type: 'macd', period: 0, color: '#2962ff', lineWidth: 2, label, series: null, shortPeriod, longPeriod, signalPeriod };
        lwIndicators.push(ind);
        createMACDPane(ind);
        refreshIndicatorsList();
        saveCurrentSessionState();
        return;
    }

    const period    = config ? config.period    : (parseInt(document.getElementById('simIndicatorPeriod').value)    || 20);
    const color     = config ? config.color     : (document.getElementById('simIndicatorColor').value               || '#2962ff');
    const lineWidth = config ? (config.lineWidth || 2) : (parseInt(document.getElementById('simIndicatorLineWidth').value) || 2);

    if ((type === 'sma' || type === 'ema') && (period < 2 || period > 500)) {
        alert('Period must be between 2 and 500.');
        return;
    }

    const id    = lwIndicatorNextId++;
    const label = type === 'vwap' ? 'VWAP(' + period + ')' : type.toUpperCase() + '(' + period + ')';
    const series = lwChart.addLineSeries({
        color, lineWidth, priceLineVisible: false, lastValueVisible: true,
        crosshairMarkerVisible: false, title: label
    });

    const ind = { id, type, period, color, lineWidth, label, series };
    lwIndicators.push(ind);

    let data = [];
    if (type === 'sma')  data = computeSMA(simVisibleBars, period);
    else if (type === 'ema')  data = computeEMA(simVisibleBars, period);
    else if (type === 'vwap') data = computeVWAP(simVisibleBars, period);
    series.setData(deduplicateTimeSeries(data));

    refreshIndicatorsList();
    saveCurrentSessionState();
}

function removeSimIndicator(id) {
    const idx = lwIndicators.findIndex(ind => ind.id === id);
    if (idx === -1) return;
    const ind = lwIndicators[idx];
    if (ind.type === 'rsi') {
        destroyRSIPane();
    } else if (ind.type === 'macd') {
        destroyMACDPane();
    } else if (ind.series && lwChart) {
        try { lwChart.removeSeries(ind.series); } catch(e) {}
    }
    lwIndicators.splice(idx, 1);
    refreshIndicatorsList();
    saveCurrentSessionState();
}

function clearAllSimIndicators() {
    while (lwIndicators.length > 0) {
        const ind = lwIndicators.pop();
        if (ind.type === 'rsi') {
            destroyRSIPane();
        } else if (ind.type === 'macd') {
            destroyMACDPane();
        } else if (ind.series && lwChart) {
            try { lwChart.removeSeries(ind.series); } catch(e) {}
        }
    }
    refreshIndicatorsList();
    saveCurrentSessionState();
}

function _makeSubChart(containerId) {
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
        if (_lwTsSyncing || !range || !lwChart) return;
        _lwTsSyncing = true;
        try {
            lwChart.timeScale().setVisibleLogicalRange(range);
            if (lwRsiChart  && lwRsiChart  !== chart) lwRsiChart.timeScale().setVisibleLogicalRange(range);
            if (lwMacdChart && lwMacdChart !== chart) lwMacdChart.timeScale().setVisibleLogicalRange(range);
        } finally { _lwTsSyncing = false; }
    });
    const ro = new ResizeObserver(entries => {
        const { width, height } = entries[0].contentRect;
        try { chart.applyOptions({ width, height }); } catch(e) {}
    });
    ro.observe(container);
    chart._ro = ro;
    return chart;
}

function createRSIPane(ind) {
    const pane = document.getElementById('simRSIPanelContainer');
    if (!pane) return;
    pane.style.display = 'block';
    lwRsiChart = _makeSubChart('simRSIChartInner');
    if (!lwRsiChart) return;
    lwRsiSeries = lwRsiChart.addLineSeries({
        color: ind.color || '#7c3aed', lineWidth: 2,
        priceLineVisible: false, lastValueVisible: true, title: ind.label || 'RSI'
    });
    lwRsiSeries.createPriceLine({ price: 70, color: '#f23645', lineWidth: 1, lineStyle: 2, axisLabelVisible: true,  title: '70' });
    lwRsiSeries.createPriceLine({ price: 50, color: '#9598a1', lineWidth: 1, lineStyle: 3, axisLabelVisible: false, title: '' });
    lwRsiSeries.createPriceLine({ price: 30, color: '#089981', lineWidth: 1, lineStyle: 2, axisLabelVisible: true,  title: '30' });
    lwRsiSeries.setData(deduplicateTimeSeries(computeRSI(simVisibleBars, ind.period)));
    if (lwChart) {
        try { const r = lwChart.timeScale().getVisibleLogicalRange(); if (r) lwRsiChart.timeScale().setVisibleLogicalRange(r); } catch(e) {}
    }
}

function destroyRSIPane() {
    if (lwRsiChart) {
        try { if (lwRsiChart._ro) lwRsiChart._ro.disconnect(); } catch(e) {}
        try { lwRsiChart.remove(); } catch(e) {}
        lwRsiChart = null; lwRsiSeries = null;
    }
    const pane = document.getElementById('simRSIPanelContainer');
    if (pane) pane.style.display = 'none';
}

function createMACDPane(ind) {
    const pane = document.getElementById('simMACDPanelContainer');
    if (!pane) return;
    pane.style.display = 'block';
    lwMacdChart = _makeSubChart('simMACDChartInner');
    if (!lwMacdChart) return;
    const sp = ind.shortPeriod || 12, lp = ind.longPeriod || 26, sig = ind.signalPeriod || 9;
    const { macdLine, signalLine, histogram } = computeMACD(simVisibleBars, sp, lp, sig);
    lwMacdHistSeries = lwMacdChart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false, title: '' });
    lwMacdHistSeries.setData(deduplicateTimeSeries(histogram));
    lwMacdLineSeries2 = lwMacdChart.addLineSeries({
        color: '#2962ff', lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: 'MACD'
    });
    lwMacdLineSeries2.setData(deduplicateTimeSeries(macdLine));
    lwMacdLineSeries2.createPriceLine({ price: 0, color: '#9598a1', lineWidth: 1, lineStyle: 3, axisLabelVisible: false });
    lwMacdSignalSeries = lwMacdChart.addLineSeries({
        color: '#ff6d00', lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: 'Signal'
    });
    lwMacdSignalSeries.setData(deduplicateTimeSeries(signalLine));
    if (lwChart) {
        try { const r = lwChart.timeScale().getVisibleLogicalRange(); if (r) lwMacdChart.timeScale().setVisibleLogicalRange(r); } catch(e) {}
    }
}

function destroyMACDPane() {
    if (lwMacdChart) {
        try { if (lwMacdChart._ro) lwMacdChart._ro.disconnect(); } catch(e) {}
        try { lwMacdChart.remove(); } catch(e) {}
        lwMacdChart = null; lwMacdHistSeries = null; lwMacdLineSeries2 = null; lwMacdSignalSeries = null;
    }
    const pane = document.getElementById('simMACDPanelContainer');
    if (pane) pane.style.display = 'none';
}

function refreshIndicatorsList() {
    const container = document.getElementById('simActiveIndicators');
    const list = document.getElementById('simActiveIndicatorsList');
    const badge = document.getElementById('simIndicatorCount');
    if (!container || !list) return;

    if (lwIndicators.length === 0) {
        container.style.display = 'none';
        if (badge) badge.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    if (badge) {
        badge.style.display = 'inline-block';
        badge.textContent = lwIndicators.length;
    }

    let html = '';
    for (const ind of lwIndicators) {
        html += '<div style="display:flex; align-items:center; justify-content:space-between; padding:4px 0; border-bottom:1px solid #f0f3fa;">';
        html += '<div style="display:flex; align-items:center; gap:6px;">';
        if (ind.type === 'macd') {
            html += '<span style="display:inline-flex;gap:2px;align-items:center;">' +
                '<span style="width:5px;height:12px;border-radius:2px;background:#2962ff;display:inline-block;"></span>' +
                '<span style="width:5px;height:12px;border-radius:2px;background:#ff6d00;display:inline-block;"></span>' +
                '<span style="width:5px;height:12px;border-radius:2px;background:#089981;display:inline-block;"></span>' +
                '</span>';
        } else {
            html += '<span style="width:12px; height:12px; border-radius:50%; background:' + ind.color + '; display:inline-block;"></span>';
        }
        html += '<span style="font-size:12px; color:#191919;">' + ind.label + '</span>';
        html += '</div>';
        html += '<button type="button" onclick="removeSimIndicator(' + ind.id + ')" style="background:none; border:none; color:#f23645; cursor:pointer; font-size:13px; padding:2px 4px;" title="Remove"><i class="fas fa-times"></i></button>';
        html += '</div>';
    }
    html += '<button type="button" onclick="clearAllSimIndicators()" style="width:100%; margin-top:6px; padding:4px; background:#f8f9fd; border:1px solid #e0e3eb; border-radius:4px; font-size:11px; color:#6a6d78; cursor:pointer;">Clear All</button>';
    list.innerHTML = html;
}

function updatePositionLines() {
    lwPositionLines.forEach(line => {
        try { lwCandleSeries.removePriceLine(line); } catch(e) {}
    });
    lwPositionLines = [];

    if (!lwCandleSeries) return;

    if (simOpenPosition) {
        const isBuy = simOpenPosition.side === 'buy';
        const line = lwCandleSeries.createPriceLine({
            price: simOpenPosition.entryPrice,
            color: isBuy ? '#2962ff' : '#f23645',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: `${isBuy ? 'LONG' : 'SHORT'} ${simOpenPosition.quantity} @ $${simOpenPosition.entryPrice.toFixed(2)}`
        });
        lwPositionLines.push(line);
    }

    for (const pos of simOpenOptionPositions) {
        for (const leg of pos.legs) {
            const legColor = leg.position === 'long' ? '#3b7cff' : '#ff9800';
            const line = lwCandleSeries.createPriceLine({
                price: leg.strike,
                color: legColor,
                lineWidth: 1,
                lineStyle: 2,
                axisLabelVisible: true,
                title: `${leg.position.toUpperCase()} ${leg.type === 'C' ? 'CALL' : 'PUT'} $${leg.strike}`
            });
            lwPositionLines.push(line);
        }
    }
}

function clearPnlShading() {
    if (lwPnlShadingSeries && lwChart) {
        try { lwChart.removeSeries(lwPnlShadingSeries.profit); } catch(e) {}
        try { lwChart.removeSeries(lwPnlShadingSeries.loss); } catch(e) {}
    }
    lwPnlShadingSeries = null;
}

function updatePnlShading() {
    clearPnlShading();

    if (!lwChart || !lwCandleSeries || !simOpenPosition || simVisibleBars.length === 0) return;

    const entryPrice = simOpenPosition.entryPrice;
    const isBuy = simOpenPosition.side === 'buy';
    const entryBarIdx = simVisibleBars.findIndex(bar => bar.timestamp >= simOpenPosition.entryTimestamp);
    if (entryBarIdx === -1) return;

    const baselineSeries = lwChart.addBaselineSeries({
        baseValue: { type: 'price', price: entryPrice },
        topLineColor: isBuy ? 'rgba(8, 153, 129, 0.6)' : 'rgba(242, 54, 69, 0.6)',
        topFillColor1: isBuy ? 'rgba(8, 153, 129, 0.25)' : 'rgba(242, 54, 69, 0.25)',
        topFillColor2: isBuy ? 'rgba(8, 153, 129, 0.05)' : 'rgba(242, 54, 69, 0.05)',
        bottomLineColor: isBuy ? 'rgba(242, 54, 69, 0.6)' : 'rgba(8, 153, 129, 0.6)',
        bottomFillColor1: isBuy ? 'rgba(242, 54, 69, 0.05)' : 'rgba(8, 153, 129, 0.05)',
        bottomFillColor2: isBuy ? 'rgba(242, 54, 69, 0.25)' : 'rgba(8, 153, 129, 0.25)',
        lineWidth: 1,
        priceScaleId: 'right',
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false
    });

    const data = [];
    const seenTimes = new Set();
    for (let i = entryBarIdx; i < simVisibleBars.length; i++) {
        const bar = simVisibleBars[i];
        const t = Math.floor(bar.timestamp / 1000);
        if (seenTimes.has(t)) continue;
        seenTimes.add(t);
        data.push({ time: t, value: bar.close });
    }

    baselineSeries.setData(data);
    lwPnlShadingSeries = { profit: baselineSeries, loss: null };
}

function switchTimeframe(timeframe) {
    if (!simTimeframeData[timeframe] || simTimeframeData[timeframe].length === 0) return;
    simCurrentTimeframe = timeframe;
    updateTimeframeButtons();
    rebuildBarsForCurrentTimeframe();
    updateChartData();
    updatePositionLines();

    updatePnlShading();
    if (simVisibleBars.length > 0 && !simUserHasDragged) {
        lwChart?.timeScale().scrollToPosition(5, false);
    }
}

function updateTimeframeButtons() {
    syncSecondsSelect();
    document.querySelectorAll('.sim-tf-btn').forEach(btn => {
        const tf = btn.dataset.timeframe;
        const hasData = simTimeframeData[tf] && simTimeframeData[tf].length > 0;
        const isActive = tf === simCurrentTimeframe;
        btn.classList.toggle('active', isActive);
        btn.disabled = !hasData;
        btn.style.opacity = hasData ? '1' : '0.3';
    });
}

// Size of one base bar in seconds.
function baseBarSeconds() {
    return simSecondsEnabled && simSecondsInterval > 0 ? simSecondsInterval : 60;
}

// The Interval control is expressed in SECONDS of market time; convert it to a number of
// base bars so "1 min" always advances one minute regardless of the chart resolution.
function getAdvanceStepBars() {
    const wanted = parseInt(document.getElementById('simAutoplayInterval')?.value, 10) || 60;
    return Math.max(1, Math.round(wanted / baseBarSeconds()));
}

// Sub-minute steps are meaningless on minute bars, so hide them unless seconds bars are
// loaded, and keep the selection valid when the resolution changes.
function syncAdvanceIntervalOptions() {
    const select = document.getElementById('simAutoplayInterval');
    if (!select) return;
    const base = baseBarSeconds();
    let firstAllowed = null;
    for (const opt of select.options) {
        const secs = parseInt(opt.value, 10);
        const allowed = secs >= base;
        opt.hidden = !allowed;
        opt.disabled = !allowed;
        if (allowed && firstAllowed === null) firstAllowed = opt.value;
    }
    const current = parseInt(select.value, 10);
    if (!(current >= base) && firstAllowed !== null) select.value = firstAllowed;
}

function showNextBar() {
    stopAutoplay();
    const skipMinutes = getAdvanceStepBars();
    if (simCurrentMinuteIndex < simMinuteBarsCache.length) {
        simCurrentMinuteIndex = Math.min(simMinuteBarsCache.length, simCurrentMinuteIndex + skipMinutes);
        rebuildBarsForCurrentTimeframe();
        updateChartData();
        updateUnrealizedPnl();
        updateOptionsPnlDisplay();
        checkOptionTpSlThresholds();
        updateNavigationButtons();
        updatePositionLines();
        updatePnlShading();
        refreshPayoffModal();
        updateSimIVDisplay();
        if (!simUserHasDragged) {
            lwChart?.timeScale().scrollToPosition(5, false);
        }
    }
}

function showPreviousBar() {
    stopAutoplay();
    const skipMinutes = getAdvanceStepBars();
    if (simCurrentMinuteIndex > (simTradingStartMinuteIndex || 0)) {
        simCurrentMinuteIndex = Math.max(simTradingStartMinuteIndex || 0, simCurrentMinuteIndex - skipMinutes);
        rebuildBarsForCurrentTimeframe();
        updateChartData();
        updateUnrealizedPnl();
        updateOptionsPnlDisplay();
        checkOptionTpSlThresholds();
        updateNavigationButtons();
        updatePositionLines();
        updatePnlShading();
        refreshPayoffModal();
        updateSimIVDisplay();
    }
}

function toggleAutoplay() {
    if (simIsPlaying) stopAutoplay();
    else startAutoplay();
}

function startAutoplay() {
    if (simIsPlaying) return;
    if (simCurrentMinuteIndex >= simMinuteBarsCache.length) return;
    simIsPlaying = true;
    const icon = document.getElementById('simPlayIcon');
    if (icon) icon.className = 'fas fa-pause';
    const speed = parseInt(document.getElementById('simAutoplaySpeed')?.value) || 3000;
    simAutoplayTimer = setInterval(() => autoplayAdvance(), speed);
}

function stopAutoplay() {
    simIsPlaying = false;
    if (simAutoplayTimer) { clearInterval(simAutoplayTimer); simAutoplayTimer = null; }
    const icon = document.getElementById('simPlayIcon');
    if (icon) icon.className = 'fas fa-play';
}

function autoplayAdvance() {
    const interval = getAdvanceStepBars();
    if (simCurrentMinuteIndex >= simMinuteBarsCache.length) { stopAutoplay(); return; }
    simCurrentMinuteIndex = Math.min(simMinuteBarsCache.length, simCurrentMinuteIndex + interval);
    rebuildBarsForCurrentTimeframe();
    updateChartData();
    updateUnrealizedPnl();
    updateOptionsPnlDisplay();
    checkOptionTpSlThresholds();
    updateNavigationButtons();
    updatePositionLines();
    updatePnlShading();
    refreshPayoffModal();
    updateSimIVDisplay();
    if (!simUserHasDragged) {
        lwChart?.timeScale().scrollToPosition(5, false);
    }
    if (simCurrentMinuteIndex >= simMinuteBarsCache.length) stopAutoplay();
}

function resetViewToCurrentCandle() {
    if (!lwChart || simVisibleBars.length === 0) return;
    simUserHasDragged = false;
    lwChart.timeScale().scrollToPosition(5, true);
}

async function gotoDateTime() {
    const gotoDateValue = document.getElementById('simGotoDate')?.value.trim();
    const gotoTimeValue = document.getElementById('simGotoTime')?.value.trim();

    let targetDateStr;
    let targetTime = '09:30:00';

    if (gotoDateValue) {
        const dateParts = gotoDateValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (!dateParts) { appAlert('Please enter date in MM/DD/YYYY format'); return; }
        const month = dateParts[1].padStart(2, '0');
        const day = dateParts[2].padStart(2, '0');
        targetDateStr = `${dateParts[3]}-${month}-${day}`;
    } else if (simCurrentMinuteIndex > 0) {
        const currentBar = simMinuteBarsCache[simCurrentMinuteIndex - 1];
        targetDateStr = new Date(currentBar.timestamp).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    } else { appAlert('Please enter a date'); return; }

    if (targetDateStr > simChartDates.end) {
        appAlert(`Date is beyond the session end date (${simChartDates.end})`);
        return;
    }
    if (targetDateStr < simChartDates.start) {
        appAlert(`Date is before the session start date (${simChartDates.start})`);
        return;
    }

    if (gotoTimeValue) {
        const timeParts = gotoTimeValue.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (!timeParts) { appAlert('Please enter time as HH:MM or HH:MM:SS'); return; }
        targetTime = `${timeParts[1].padStart(2, '0')}:${timeParts[2]}:${timeParts[3] || '00'}`;
    }

    const targetTs = parseETDateTime(targetDateStr, targetTime);

    // Detect a stale cache: the resolution was switched since the last load,
    // so the cached bars are at the wrong granularity.  Compare the actual
    // inter-bar spacing against what the current settings expect.
    const expectedSpacingMs = simSecondsEnabled ? simSecondsInterval * 1000 : 60000;
    const actualSpacingMs = simMinuteBarsCache.length >= 2
        ? simMinuteBarsCache[1].timestamp - simMinuteBarsCache[0].timestamp : expectedSpacingMs;
    const cacheIsStale = Math.abs(actualSpacingMs - expectedSpacingMs) > 500;

    // If the target falls outside the currently loaded cache, or the cache is
    // stale, reload centered on the target.  loadSimulatedChart positions the
    // chart at the anchor timestamp automatically.
    const cacheEnd = simMinuteBarsCache.length > 0
        ? simMinuteBarsCache[simMinuteBarsCache.length - 1].timestamp : -Infinity;
    if (cacheIsStale || targetTs > cacheEnd) {
        await loadSimulatedChart(null, targetTs);
        return;
    }

    // Check if the requested date has any trading bars at all
    const dayStart = parseETDateTime(targetDateStr, '00:00');
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const hasBarsOnDay = simMinuteBarsCache.some(b => b.timestamp >= dayStart && b.timestamp < dayEnd);

    let resolvedDateStr = targetDateStr;
    if (!hasBarsOnDay) {
        // Weekend or holiday — find the next trading day and land at the same requested time
        const nextBar = simMinuteBarsCache.find(b => b.timestamp >= dayEnd);
        if (!nextBar) {
            // Should not happen since we reloaded above when target > cacheEnd, but guard anyway
            await loadSimulatedChart(null, targetTs);
            return;
        }
        resolvedDateStr = new Date(nextBar.timestamp).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    }

    const resolvedTargetTs = parseETDateTime(resolvedDateStr, targetTime);

    // Snap DOWN to the bar that CONTAINS the requested instant. Snapping up would reveal
    // a bar that had not finished at the requested time (lookahead). A request finer than
    // the chart resolution (12:31:55 on minute bars) therefore lands on the 12:31 bar.
    // Search the entire cache — goto must be able to jump to any date in the
    // loaded chart data, including dates before the trading start (which is
    // only a floor for prev/next step buttons, not for explicit jumps).
    let targetMinuteIndex = -1;
    for (let i = simMinuteBarsCache.length - 1; i >= 0; i--) {
        if (simMinuteBarsCache[i].timestamp <= resolvedTargetTs) { targetMinuteIndex = i + 1; break; }
    }

    if (targetMinuteIndex === -1) {
        // The instant precedes every bar in the cache — land on the first one.
        if (simMinuteBarsCache.length === 0) { appAlert('Date/time not found in the available data range'); return; }
        targetMinuteIndex = 1;
    }

    const landedBar = simMinuteBarsCache[targetMinuteIndex - 1];
    if (landedBar) {
        const landedTime = new Date(landedBar.timestamp).toLocaleTimeString('en-US', {
            timeZone: 'America/New_York', hour12: false
        });
        const requested = `${targetTime}`;
        if (landedTime !== requested) {
            updateLoadingStatus(`Snapped to ${landedTime} (${simSecondsEnabled ? simSecondsInterval + '-second' : '1-minute'} bars)`);
            setTimeout(() => updateLoadingStatus(''), 4000);
        }
    }

    simCurrentMinuteIndex = targetMinuteIndex;
    rebuildBarsForCurrentTimeframe();
    updateChartData();
    updateUnrealizedPnl();
    updateOptionsPnlDisplay();
    checkOptionTpSlThresholds();
    updateNavigationButtons();
    updatePositionLines();
    updatePnlShading();
    updateSimIVDisplay();
    simUserHasDragged = false;
    lwChart?.timeScale().scrollToPosition(5, false);
}

function updateNavigationButtons() {
    const prevBtn = document.getElementById('simPrevBar');
    const nextBtn = document.getElementById('simNextBar');
    const barInfo = document.getElementById('simBarVisibilityInfo');
    const timeDisplay = document.getElementById('simCurrentTimeDisplay');
    const dateField = document.getElementById('simGotoDate');

    if (prevBtn) prevBtn.disabled = simCurrentMinuteIndex <= simTradingStartMinuteIndex;
    if (nextBtn) nextBtn.disabled = simCurrentMinuteIndex >= simMinuteBarsCache.length;

    let currentDate = null;
    let timeStr = '';
    if (simCurrentMinuteIndex > 0 && simMinuteBarsCache.length > 0) {
        const currentMinuteBar = simMinuteBarsCache[simCurrentMinuteIndex - 1];
        if (currentMinuteBar) {
            currentDate = new Date(currentMinuteBar.timestamp);
            const hours = currentDate.getHours().toString().padStart(2, '0');
            const mins = currentDate.getMinutes().toString().padStart(2, '0');
            const secs = currentDate.getSeconds().toString().padStart(2, '0');
            timeStr = simSecondsEnabled ? `${hours}:${mins}:${secs}` : `${hours}:${mins}`;
        }
    }

    if (timeDisplay && timeStr) timeDisplay.textContent = timeStr;
    if (dateField && currentDate && !dateField.matches(':focus')) {
        const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
        const day = currentDate.getDate().toString().padStart(2, '0');
        dateField.value = `${month}/${day}/${currentDate.getFullYear()}`;
    }

    if (barInfo) {
        const hiddenBars = simAllBars.length - simCurrentBarIndex;
        barInfo.textContent = `${simVisibleBars.length} bars | +${hiddenBars}`;
    }

    updateOHLCDisplay();
    updateSymbolDisplay();
}

function updateSymbolDisplay() {
    const symbolDisplay = document.getElementById('simChartSymbolDisplay');
    if (symbolDisplay) symbolDisplay.textContent = simCurrentSymbol;

    if (simVisibleBars.length > 0) {
        const lastBar = simVisibleBars[simVisibleBars.length - 1];
        const firstBar = simVisibleBars[0];
        const priceChange = lastBar.close - firstBar.open;
        const priceChangePercent = ((lastBar.close - firstBar.open) / firstBar.open * 100);

        const priceDisplay = document.getElementById('simChartPriceDisplay');
        const changeDisplay = document.getElementById('simChartChangeDisplay');

        if (priceDisplay) priceDisplay.textContent = `$${lastBar.close.toFixed(2)}`;
        if (changeDisplay) {
            const isPositive = priceChange >= 0;
            changeDisplay.innerHTML = `<span style="color: ${isPositive ? '#089981' : '#f23645'};">${isPositive ? '+' : ''}${priceChange.toFixed(2)} (${isPositive ? '+' : ''}${priceChangePercent.toFixed(2)}%)</span>`;
        }
    }
}

function updateOHLCDisplay() {
    if (simVisibleBars.length === 0) return;
    const lastBar = simVisibleBars[simVisibleBars.length - 1];
    updateOHLCDisplayForBar(lastBar);
}

function updateOHLCDisplayForBar(bar) {
    if (!bar) return;
    const oEl = document.getElementById('simOHLC_O');
    const hEl = document.getElementById('simOHLC_H');
    const lEl = document.getElementById('simOHLC_L');
    const cEl = document.getElementById('simOHLC_C');
    const vEl = document.getElementById('simOHLC_V');
    if (oEl) oEl.textContent = bar.open.toFixed(2);
    if (hEl) hEl.textContent = bar.high.toFixed(2);
    if (lEl) lEl.textContent = bar.low.toFixed(2);
    if (cEl) cEl.textContent = bar.close.toFixed(2);
    if (vEl) vEl.textContent = bar.volume ? formatVolume(bar.volume) : '-';
}

function updateSimIVDisplay() {
    const ivEl = document.getElementById('simOHLC_IV');
    if (!ivEl) return;

    if (simOpenOptionPositions.length === 0) {
        ivEl.textContent = '-';
        return;
    }

    const currentMinuteBar = simMinuteBarsCache[simCurrentMinuteIndex - 1];
    if (!currentMinuteBar) { ivEl.textContent = '-'; return; }

    const underlyingPrice = currentMinuteBar.close;
    const currentTimestamp = currentMinuteBar.timestamp;
    let bestIV = null;
    let closestATMDist = Infinity;

    let fallbackIV = null;
    let fallbackClosestDist = Infinity;
    for (const pos of simOpenOptionPositions) {
        if (pos.status !== 'open') continue;
        for (const leg of pos.legs) {
            const strikeDist = Math.abs(leg.strike - underlyingPrice);

            if (!leg.optionBars || leg.optionBars.length === 0) {
                if (leg.entryGreeks && leg.entryGreeks.iv > 0 && strikeDist < fallbackClosestDist) {
                    fallbackClosestDist = strikeDist;
                    fallbackIV = leg.entryGreeks.iv;
                }
                continue;
            }
            const optBar = findClosestOptionBar(leg.optionBars, currentTimestamp);
            if (!optBar) continue;
            const optPrice = optBar.vwap || optBar.close;
            if (!optPrice || optPrice <= 0) continue;
            const legExp = leg.expiration || pos.expiration;
            const expParts = legExp.split('-');
            const expYear = parseInt(expParts[0]), expMonth = parseInt(expParts[1]), expDay = parseInt(expParts[2]);
            const nowMs = typeof currentTimestamp === 'number' ? currentTimestamp : new Date(currentTimestamp).getTime();
            const testDate = new Date(expYear, expMonth - 1, expDay);
            const marSecondSun = new Date(expYear, 2, 8 + (7 - new Date(expYear, 2, 8).getDay()) % 7);
            const novFirstSun = new Date(expYear, 10, 1 + (7 - new Date(expYear, 10, 1).getDay()) % 7);
            const isDST = testDate >= marSecondSun && testDate < novFirstSun;
            const etOffsetHours = isDST ? -4 : -5;
            const expMsCalc = Date.UTC(expYear, expMonth - 1, expDay, 16 - etOffsetHours, 0, 0);
            const diffMs = expMsCalc - nowMs;
            const T = Math.max(diffMs / (365.25 * 24 * 3600 * 1000), 1 / (365.25 * 24 * 60));
            const r = 0.045, q = 0.013;
            const optType = leg.type === 'P' ? 'put' : 'call';
            const iv = BSCalc.impliedVolatility(underlyingPrice, leg.strike, T, r, q, optPrice, optType);
            if (iv !== null && iv > 0 && iv < 5) {
                if (strikeDist < closestATMDist) {
                    closestATMDist = strikeDist;
                    bestIV = iv;
                }
            } else if (leg.entryGreeks && leg.entryGreeks.iv > 0 && strikeDist < fallbackClosestDist) {
                fallbackClosestDist = strikeDist;
                fallbackIV = leg.entryGreeks.iv;
            }
        }
    }
    if (bestIV === null && fallbackIV !== null) bestIV = fallbackIV;

    if (bestIV !== null) {
        const ivPct = (bestIV * 100).toFixed(1);
        ivEl.textContent = ivPct + '%';
        ivEl.style.color = bestIV > 0.3 ? '#f23645' : bestIV > 0.2 ? '#e67e22' : '#089981';
    } else {
        ivEl.textContent = '-';
    }
}

function formatVolume(vol) {
    if (vol >= 1000000) return (vol / 1000000).toFixed(2) + 'M';
    if (vol >= 1000) return (vol / 1000).toFixed(2) + 'K';
    return vol.toString();
}

function executeTrade(side) {
    if (simVisibleBars.length === 0) { appAlert('Load chart data first'); return; }
    const quantity = parseInt(document.getElementById('simQuantity')?.value) || 1;
    const currentBar = simVisibleBars[simVisibleBars.length - 1];
    const currentPrice = currentBar.vwap || currentBar.close;

    if (!simOpenPosition) {
        simOpenPosition = {
            side, quantity, entryPrice: currentPrice,
            entryBarIndex: simCurrentBarIndex,
            entryTimestamp: currentBar.timestamp
        };
    } else {
        const isSameSide = simOpenPosition.side === side;
        if (isSameSide) {
            const totalQty = simOpenPosition.quantity + quantity;
            const avgPrice = (simOpenPosition.entryPrice * simOpenPosition.quantity + currentPrice * quantity) / totalQty;
            simOpenPosition.quantity = totalQty;
            simOpenPosition.entryPrice = avgPrice;
        } else {
            if (quantity < simOpenPosition.quantity) {
                const pnlPerShare = simOpenPosition.side === 'buy'
                    ? (currentPrice - simOpenPosition.entryPrice) : (simOpenPosition.entryPrice - currentPrice);
                const closePnl = pnlPerShare * quantity;
                simRealizedPnl += closePnl;
                simClosedTrades.push({
                    side: simOpenPosition.side, quantity, entryPrice: simOpenPosition.entryPrice,
                    exitPrice: currentPrice, exitBarIndex: simCurrentBarIndex,
                    entryTimestamp: simOpenPosition.entryTimestamp, exitTimestamp: currentBar.timestamp, pnl: closePnl
                });
                simOpenPosition.quantity -= quantity;
            } else if (quantity === simOpenPosition.quantity) {
                const closePnl = calculatePositionPnl(simOpenPosition, currentPrice);
                simRealizedPnl += closePnl;
                simClosedTrades.push({
                    ...simOpenPosition, exitPrice: currentPrice, exitBarIndex: simCurrentBarIndex,
                    exitTimestamp: currentBar.timestamp, pnl: closePnl
                });
                simOpenPosition = null;
            } else {
                const closePnl = calculatePositionPnl(simOpenPosition, currentPrice);
                simRealizedPnl += closePnl;
                simClosedTrades.push({
                    ...simOpenPosition, exitPrice: currentPrice, exitBarIndex: simCurrentBarIndex,
                    exitTimestamp: currentBar.timestamp, pnl: closePnl
                });
                simOpenPosition = {
                    side, quantity: quantity - simOpenPosition.quantity,
                    entryPrice: currentPrice, entryBarIndex: simCurrentBarIndex,
                    entryTimestamp: currentBar.timestamp
                };
            }
        }
    }

    updateTradingDisplay();
    updatePositionLines();
    updatePnlShading();
}

function calculatePositionPnl(position, currentPrice) {
    if (!position) return 0;
    const priceDiff = currentPrice - position.entryPrice;
    const multiplier = position.side === 'buy' ? 1 : -1;
    return priceDiff * position.quantity * multiplier;
}

function updateUnrealizedPnl() {
    if (simVisibleBars.length === 0) return;
    const currentBar = simVisibleBars[simVisibleBars.length - 1];
    if (simOpenPosition) {
        const unrealizedPnl = calculatePositionPnl(simOpenPosition, currentBar.close);
        const unrealizedEl = document.getElementById('simUnrealizedPnl');
        if (unrealizedEl) {
            const isPositive = unrealizedPnl >= 0;
            unrealizedEl.textContent = `${isPositive ? '+' : ''}$${unrealizedPnl.toFixed(2)}`;
            unrealizedEl.style.color = isPositive ? '#089981' : '#f23645';
        }
    }
    updateOptionsPnlDisplay();
}

function updateTradingDisplay() {
    const mode = window._simTradingMode || 'stock';
    const balanceEl = document.getElementById('simCurrentBalance');
    const realizedEl = document.getElementById('simRealizedPnl');
    const unrealizedEl = document.getElementById('simUnrealizedPnl');

    const totalRealized = mode === 'stock' ? simRealizedPnl : (simRealizedPnl + simOptionsRealizedPnl);
    const currentBalance = simInitialBalance + totalRealized;

    if (balanceEl) balanceEl.textContent = `$${currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    if (realizedEl) {
        const pnl = mode === 'stock' ? simRealizedPnl : simOptionsRealizedPnl;
        const isPositive = pnl >= 0;
        realizedEl.textContent = `${isPositive ? '+' : ''}$${pnl.toFixed(2)}`;
        realizedEl.style.color = isPositive ? '#089981' : '#f23645';
    }

    if (unrealizedEl) {
        let unrealizedPnl = 0;
        if (mode === 'stock' && simOpenPosition && simVisibleBars.length > 0) {
            const currentBar = simVisibleBars[simVisibleBars.length - 1];
            unrealizedPnl = calculatePositionPnl(simOpenPosition, currentBar.close);
        } else if (mode === 'options' && simOpenOptionPositions.length > 0) {
            const currentMinuteBar = simMinuteBarsCache[simCurrentMinuteIndex - 1];
            const currentTimestamp = currentMinuteBar ? currentMinuteBar.timestamp : Date.now();
            for (const pos of simOpenOptionPositions) unrealizedPnl += calculateOptionPositionPnl(pos, currentTimestamp);
        }
        if (unrealizedPnl !== 0) {
            const isPositive = unrealizedPnl >= 0;
            unrealizedEl.textContent = `${isPositive ? '+' : ''}$${unrealizedPnl.toFixed(2)}`;
            unrealizedEl.style.color = isPositive ? '#089981' : '#f23645';
        } else {
            unrealizedEl.textContent = '$0.00';
            unrealizedEl.style.color = '#6a6d78';
        }
    }

    const closeAllBtn = document.getElementById('simCloseAllBtn');
    if (closeAllBtn) {
        const hasOpenPos = (mode === 'stock' && simOpenPosition) || (mode === 'options' && simOpenOptionPositions.length > 0);
        closeAllBtn.style.display = hasOpenPos ? 'inline-block' : 'none';
    }

    updateOptionsPositionsCard();
}

function validateSimSpreadStrikes(strategy, legs) {
    function findLeg(pos, typ) { return legs.find(l => l.position === pos && l.type === typ); }
    if (strategy === 'Short Call Spread') {
        const sc = findLeg('short','C'), lc = findLeg('long','C');
        if (sc && lc && sc.strike >= lc.strike)
            return `Short Call Spread: Short Call strike ($${sc.strike}) must be below Long Call strike ($${lc.strike}).`;
    } else if (strategy === 'Long Call Spread') {
        const lc = findLeg('long','C'), sc = findLeg('short','C');
        if (lc && sc && lc.strike >= sc.strike)
            return `Long Call Spread: Long Call strike ($${lc.strike}) must be below Short Call strike ($${sc.strike}).`;
    } else if (strategy === 'Short Put Spread') {
        const sp = findLeg('short','P'), lp = findLeg('long','P');
        if (sp && lp && sp.strike <= lp.strike)
            return `Short Put Spread: Short Put strike ($${sp.strike}) must be above Long Put strike ($${lp.strike}).`;
    } else if (strategy === 'Long Put Spread') {
        const lp = findLeg('long','P'), sp = findLeg('short','P');
        if (lp && sp && lp.strike <= sp.strike)
            return `Long Put Spread: Long Put strike ($${lp.strike}) must be above Short Put strike ($${sp.strike}).`;
    } else if (strategy.includes('Iron') && strategy.includes('Short')) {
        const sp = findLeg('short','P'), lp = findLeg('long','P');
        const sc = findLeg('short','C'), lc = findLeg('long','C');
        if (sp && lp && sp.strike <= lp.strike)
            return `${strategy}: Short Put strike ($${sp.strike}) must be above Long Put strike ($${lp.strike}).`;
        if (sc && lc && sc.strike >= lc.strike)
            return `${strategy}: Short Call strike ($${sc.strike}) must be below Long Call strike ($${lc.strike}).`;
    } else if (strategy.includes('Iron') && strategy.includes('Long')) {
        const sp = findLeg('short','P'), lp = findLeg('long','P');
        const sc = findLeg('short','C'), lc = findLeg('long','C');
        if (lp && sp && lp.strike <= sp.strike)
            return `${strategy}: Long Put strike ($${lp.strike}) must be above Short Put strike ($${sp.strike}).`;
        if (lc && sc && lc.strike >= sc.strike)
            return `${strategy}: Long Call strike ($${lc.strike}) must be below Short Call strike ($${sc.strike}).`;
    }
    return null;
}

const SIM_STRATEGY_LEGS = {
    'Long Call': [{name: 'Long Call', type: 'C', position: 'long'}],
    'Long Put': [{name: 'Long Put', type: 'P', position: 'long'}],
    'Naked Short Call': [{name: 'Short Call', type: 'C', position: 'short'}],
    'Naked Short Put': [{name: 'Short Put', type: 'P', position: 'short'}],
    'Short Put Spread': [{name: 'Short Put', type: 'P', position: 'short'}, {name: 'Long Put', type: 'P', position: 'long'}],
    'Short Call Spread': [{name: 'Short Call', type: 'C', position: 'short'}, {name: 'Long Call', type: 'C', position: 'long'}],
    'Short Iron Condor': [{name: 'Long Put', type: 'P', position: 'long'}, {name: 'Short Put', type: 'P', position: 'short'}, {name: 'Short Call', type: 'C', position: 'short'}, {name: 'Long Call', type: 'C', position: 'long'}],
    'Short Iron Butterfly': [{name: 'Long Put', type: 'P', position: 'long'}, {name: 'Short Put', type: 'P', position: 'short'}, {name: 'Short Call', type: 'C', position: 'short'}, {name: 'Long Call', type: 'C', position: 'long'}],
    'Long Call Spread': [{name: 'Long Call', type: 'C', position: 'long'}, {name: 'Short Call', type: 'C', position: 'short'}],
    'Long Put Spread': [{name: 'Long Put', type: 'P', position: 'long'}, {name: 'Short Put', type: 'P', position: 'short'}],
    'Long Straddle': [{name: 'Long Call', type: 'C', position: 'long'}, {name: 'Long Put', type: 'P', position: 'long'}],
    'Long Strangle': [{name: 'Long Call', type: 'C', position: 'long'}, {name: 'Long Put', type: 'P', position: 'long'}],
    'Long Iron Butterfly': [{name: 'Long Put', type: 'P', position: 'long'}, {name: 'Short Put', type: 'P', position: 'short'}, {name: 'Short Call', type: 'C', position: 'short'}, {name: 'Long Call', type: 'C', position: 'long'}],
    'Long Iron Condor': [{name: 'Long Put', type: 'P', position: 'long'}, {name: 'Short Put', type: 'P', position: 'short'}, {name: 'Short Call', type: 'C', position: 'short'}, {name: 'Long Call', type: 'C', position: 'long'}],
    'Short Straddle': [{name: 'Short Call', type: 'C', position: 'short'}, {name: 'Short Put', type: 'P', position: 'short'}],
    'Short Strangle': [{name: 'Short Call', type: 'C', position: 'short'}, {name: 'Short Put', type: 'P', position: 'short'}],
    'Calendar Call Spread': [{name: 'Short Call (Near)', type: 'C', position: 'short'}, {name: 'Long Call (Far)', type: 'C', position: 'long'}],
    'Calendar Put Spread': [{name: 'Short Put (Near)', type: 'P', position: 'short'}, {name: 'Long Put (Far)', type: 'P', position: 'long'}],
    'Diagonal Call Spread': [{name: 'Short Call (Near)', type: 'C', position: 'short'}, {name: 'Long Call (Far)', type: 'C', position: 'long'}],
    'Diagonal Put Spread': [{name: 'Short Put (Near)', type: 'P', position: 'short'}, {name: 'Long Put (Far)', type: 'P', position: 'long'}],
    'Double Calendar': [{name: 'Short Put (Near)', type: 'P', position: 'short'}, {name: 'Long Put (Far)', type: 'P', position: 'long'}, {name: 'Short Call (Near)', type: 'C', position: 'short'}, {name: 'Long Call (Far)', type: 'C', position: 'long'}],
    'Double Diagonal': [{name: 'Short Put (Near)', type: 'P', position: 'short'}, {name: 'Long Put (Far)', type: 'P', position: 'long'}, {name: 'Short Call (Near)', type: 'C', position: 'short'}, {name: 'Long Call (Far)', type: 'C', position: 'long'}]
};

const SIM_LEG_DIRECTION_RULES = {
    'Short Put Spread': { 1: 'below' },
    'Long Call Spread': { 1: 'above' },
    'Short Call Spread': { 1: 'above' },
    'Long Put Spread': { 1: 'below' },
    'Short Iron Condor': { 0: 'below', 3: 'above' },
    'Short Iron Butterfly': { 0: 'below', 3: 'above' },
    'Long Iron Condor': { 0: 'below', 3: 'above' },
    'Long Iron Butterfly': { 0: 'below', 3: 'above' }
};

function isSimCalendarDiagonalStrategy(strategy) {
    return ['Calendar Call Spread', 'Calendar Put Spread', 'Diagonal Call Spread', 'Diagonal Put Spread', 'Double Calendar', 'Double Diagonal'].includes(strategy);
}

function getLegDirectionRequirement(strategy, legIndex) {
    const rules = SIM_LEG_DIRECTION_RULES[strategy];
    if (rules && rules[legIndex] !== undefined) return rules[legIndex];
    return null;
}

function updateLegRefLabel(legIndex, type) {
    const label = document.querySelector(`.sim-leg-value-label[data-leg="${legIndex}"]`);
    if (!label) return;
    const symbol = type === 'dollar' ? '$' : '%';
    label.textContent = `${symbol}:`;
}

function buildSimLegConfiguration() {
    const strategy = document.getElementById('simOptionStrategy')?.value;
    const container = document.getElementById('simLegConfigSection');
    if (!container || !strategy) return;

    const legs = SIM_STRATEGY_LEGS[strategy];
    if (!legs || legs.length === 0) { container.innerHTML = ''; return; }

    const inputStyle = 'background: #fff; color: #191919; border: 1px solid #d1d4dc; border-radius: 4px; font-size: 11px; padding: 3px 6px;';
    let html = '<div style="display: flex; flex-wrap: wrap; gap: 10px;">';

    const isCalDiag = isSimCalendarDiagonalStrategy(strategy);

    legs.forEach((leg, index) => {
        const badgeColor = leg.type === 'C' ? '#3b7cff' : '#f4a261';
        const positionBadge = leg.position === 'long' ? '#089981' : '#f23645';
        const legDirection = getLegDirectionRequirement(strategy, index);
        const dirLabel = legDirection ? legDirection : 'from';
        const defaultDte = isCalDiag ? (leg.position === 'short' ? 7 : 30) : null;

        html += `
            <div style="background: #f8f9fd; border: 1px solid #e0e3eb; border-radius: 6px; padding: 8px; min-width: 190px;">
                <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 6px;">
                    <span style="font-weight: 600; color: #191919; font-size: 11px;">Leg ${index + 1}: ${leg.name}</span>
                    <span style="background: ${badgeColor}; color: white; padding: 1px 5px; border-radius: 3px; font-size: 9px;">${leg.type === 'C' ? 'Call' : 'Put'}</span>
                    <span style="background: ${positionBadge}; color: white; padding: 1px 5px; border-radius: 3px; font-size: 9px;">${leg.position}</span>
                </div>
                ${isCalDiag ? `<div style="margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
                    <label style="font-size: 10px; color: #6a6d78; white-space: nowrap;">DTE:</label>
                    <input type="number" class="sim-leg-dte" data-leg-index="${index}" value="${defaultDte}" min="0" max="365" style="${inputStyle} width: 50px;">
                </div>` : ''}
                <div style="margin-bottom: 4px;">
                    <select class="sim-leg-method" data-leg-index="${index}" style="${inputStyle} width: 100%;">
                        <option value="pct_underlying" selected>% from Underlying</option>
                        <option value="dollar_underlying">$ from Underlying</option>
                        <option value="exact_strike">Exact Strike Price</option>
                        <option value="delta">Delta-Based</option>
                        <option value="mid_price">Mid Price Range</option>
                        ${legs.length > 1 ? `<option value="dollar_leg">$ ${dirLabel} Leg</option>` : ''}
                        ${legs.length > 1 ? `<option value="pct_leg">% ${dirLabel} Leg</option>` : ''}
                    </select>
                </div>
                <div id="simLegParams${index}" style="display: flex; flex-wrap: wrap; gap: 4px;"></div>
            </div>`;
    });

    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.sim-leg-method').forEach(select => {
        select.addEventListener('change', (e) => {
            updateSimLegParams(parseInt(e.target.dataset.legIndex), e.target.value);
        });
        updateSimLegParams(parseInt(select.dataset.legIndex), select.value);
    });
    renderPresetButtons();
}

function updateSimLegParams(legIndex, method) {
    const paramsContainer = document.getElementById(`simLegParams${legIndex}`);
    if (!paramsContainer) return;

    const strategy = document.getElementById('simOptionStrategy')?.value;
    const requiredDirection = getLegDirectionRequirement(strategy, legIndex);
    const inputStyle = 'background: #fff; color: #191919; border: 1px solid #d1d4dc; border-radius: 4px; font-size: 11px; padding: 3px 6px;';
    let html = '';

    const infoIcon = (text) => legIndex === 0
        ? ` <i class="fas fa-info-circle sim-info-tip" style="font-size:8px;color:#b0b4c0;cursor:pointer;" data-tip="${text.replace(/"/g, '&quot;')}" onclick="showSimInfoTip(this)"></i>`
        : '';

    const buildDirectionDropdown = (legIdx, methodType = '') => {
        const dirRequired = getLegDirectionRequirement(strategy, legIdx);
        const defaultDir = dirRequired || 'below';
        return `<div style="display: flex; align-items: center; gap: 3px;">
            <label style="font-size: 10px; color: #6a6d78; white-space: nowrap;">Side${infoIcon('Side: Where to place the strike relative to the reference price (above or below the underlying or another leg\'s strike).')}</label>
            <select class="sim-leg-direction" data-leg="${legIdx}" style="${inputStyle} width: 70px;">
                <option value="above" ${defaultDir === 'above' ? 'selected' : ''}>above</option>
                <option value="below" ${defaultDir === 'below' ? 'selected' : ''}>below</option>
            </select></div>`;
    };

    switch (method) {
        case 'exact_strike':
            html = `<div style="display:flex;align-items:center;gap:3px;"><label style="font-size:10px;color:#6a6d78;">Strike:</label>
                <input type="number" class="sim-leg-strike" data-leg="${legIndex}" placeholder="" step="1" style="${inputStyle} width:65px;"></div>
                <div style="display:flex;align-items:center;gap:3px;"><label style="font-size:10px;color:#6a6d78;">Match${infoIcon('Fallback: When the exact strike isn\'t available, how to pick the nearest one. Closest = nearest available, Higher = next strike up, Lower = next strike down, Exactly = fail if not found.')}</label>
                <select class="sim-leg-fallback" data-leg="${legIndex}" style="${inputStyle} width:75px;">
                <option value="closest">Closest</option><option value="higher">Higher</option><option value="lower">Lower</option><option value="exactly">Exactly</option></select></div>`;
            break;
        case 'dollar_underlying':
            html = `${buildDirectionDropdown(legIndex)}
                <div style="display:flex;align-items:center;gap:3px;"><label style="font-size:10px;color:#6a6d78;">$:</label>
                <input type="number" class="sim-leg-value" data-leg="${legIndex}" data-param="value" value="0" step="1" min="0" style="${inputStyle} width:55px;"></div>
                <div style="display:flex;align-items:center;gap:3px;"><label style="font-size:10px;color:#6a6d78;">Match${infoIcon('Fallback: When the exact strike isn\'t available, how to pick the nearest one. Closest = nearest available, Higher = next strike up, Lower = next strike down.')}</label>
                <select class="sim-leg-fallback" data-leg="${legIndex}" style="${inputStyle} width:75px;">
                <option value="closest">Closest</option><option value="higher">Higher</option><option value="lower">Lower</option></select></div>`;
            break;
        case 'pct_underlying':
            html = `${buildDirectionDropdown(legIndex)}
                <div style="display:flex;align-items:center;gap:3px;"><label style="font-size:10px;color:#6a6d78;">%:</label>
                <input type="number" class="sim-leg-value" data-leg="${legIndex}" data-param="value" value="0" step="0.5" min="0" style="${inputStyle} width:55px;"></div>
                <div style="display:flex;align-items:center;gap:3px;"><label style="font-size:10px;color:#6a6d78;">Match${infoIcon('Fallback: When the exact strike isn\'t available, how to pick the nearest one. Closest = nearest available, Higher = next strike up, Lower = next strike down.')}</label>
                <select class="sim-leg-fallback" data-leg="${legIndex}" style="${inputStyle} width:75px;">
                <option value="closest">Closest</option><option value="higher">Higher</option><option value="lower">Lower</option></select></div>`;
            break;
        case 'chain':
            html = `<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
                <span class="sim-chain-label" data-leg="${legIndex}" style="font-size:10px;color:#6a6d78;white-space:nowrap;">No strike selected</span>
                <input type="hidden" class="sim-chain-strike" data-leg="${legIndex}" value="">
                <button type="button" onclick="openOptionChainModal(${legIndex})" style="background:#2962ff;color:#fff;border:none;border-radius:4px;font-size:10px;padding:3px 8px;cursor:pointer;white-space:nowrap;">Browse Chain</button>
            </div>`;
            break;
        case 'mid_price':
            html = `<div style="display:flex;align-items:center;gap:3px;"><label style="font-size:10px;color:#6a6d78;">Min$:</label>
                <input type="number" class="sim-leg-min" data-leg="${legIndex}" value="1" step="0.5" style="${inputStyle} width:50px;"></div>
                <div style="display:flex;align-items:center;gap:3px;"><label style="font-size:10px;color:#6a6d78;">Max$:</label>
                <input type="number" class="sim-leg-max" data-leg="${legIndex}" value="5" step="0.5" style="${inputStyle} width:50px;"></div>`;
            break;
        case 'delta':
            html = `<div style="display:flex;align-items:center;gap:3px;"><label style="font-size:10px;color:#6a6d78;">Delta:</label>
                <input type="number" class="sim-leg-delta" data-leg="${legIndex}" value="0.30" step="0.05" min="0" max="1" style="${inputStyle} width:55px;"></div>
                <div style="display:flex;align-items:center;gap:3px;"><label style="font-size:10px;color:#6a6d78;">Method:</label>
                <select class="sim-leg-delta-method" data-leg="${legIndex}" style="${inputStyle} width:70px;">
                <option value="closest">Closest</option><option value="above">Above</option><option value="below">Below</option><option value="between">Between</option><option value="exactly">Exactly</option></select></div>`;
            break;
        case 'dollar_leg': {
            const totalLegs = SIM_STRATEGY_LEGS[strategy]?.length || 0;
            const refOptions = Array.from({length: totalLegs}, (_, i) => i).filter(i => i !== legIndex);
            const defaultRef = refOptions.length > 0 ? refOptions[0] : 0;
            html = `<div style="display:flex;align-items:center;gap:3px;"><label style="font-size:10px;color:#6a6d78;">Ref:</label>
                <select class="sim-leg-ref" data-leg="${legIndex}" style="${inputStyle} width:50px;">
                ${refOptions.map(i => `<option value="${i}" ${i === defaultRef ? 'selected' : ''}>Leg ${i+1}</option>`).join('')}</select></div>
                ${buildDirectionDropdown(legIndex, 'dollar')}
                <div style="display:flex;align-items:center;gap:3px;"><label class="sim-leg-value-label" data-leg="${legIndex}" style="font-size:10px;color:#6a6d78;">$:</label>
                <input type="number" class="sim-leg-value" data-leg="${legIndex}" data-param="value" value="1" step="1" min="0" style="${inputStyle} width:50px;"></div>`;
            break;
        }
        case 'pct_leg': {
            const totalLegs2 = SIM_STRATEGY_LEGS[strategy]?.length || 0;
            const refOptions2 = Array.from({length: totalLegs2}, (_, i) => i).filter(i => i !== legIndex);
            const defaultRef2 = refOptions2.length > 0 ? refOptions2[0] : 0;
            html = `<div style="display:flex;align-items:center;gap:3px;"><label style="font-size:10px;color:#6a6d78;">Ref:</label>
                <select class="sim-leg-ref" data-leg="${legIndex}" style="${inputStyle} width:50px;">
                ${refOptions2.map(i => `<option value="${i}" ${i === defaultRef2 ? 'selected' : ''}>Leg ${i+1}</option>`).join('')}</select></div>
                ${buildDirectionDropdown(legIndex, 'pct')}
                <div style="display:flex;align-items:center;gap:3px;"><label class="sim-leg-value-label" data-leg="${legIndex}" style="font-size:10px;color:#6a6d78;">%:</label>
                <input type="number" class="sim-leg-value" data-leg="${legIndex}" data-param="value" value="2" step="0.5" min="0" style="${inputStyle} width:50px;"></div>`;
            break;
        }
    }

    paramsContainer.innerHTML = html;

}

function collectSimLegConfigurations() {
    const legs = [];
    const strategy = document.getElementById('simOptionStrategy')?.value;
    const strategyLegs = SIM_STRATEGY_LEGS[strategy] || [];

    document.querySelectorAll('#simLegConfigSection > div > div').forEach((card, index) => {
        if (index >= strategyLegs.length) return;
        const methodSelect = card.querySelector('.sim-leg-method');
        if (!methodSelect) return;

        const method = methodSelect.value;
        const legInfo = strategyLegs[index];
        const leg = { method, name: legInfo.name, type: legInfo.type, position: legInfo.position };

        const legDteInput = card.querySelector('.sim-leg-dte');
        if (legDteInput) {
            leg.dte = parseInt(legDteInput.value) || 0;
        }

        const directionSelect = card.querySelector('.sim-leg-direction');
        const direction = directionSelect ? directionSelect.value : 'below';

        switch (method) {
            case 'exact_strike':
                leg.strike = parseFloat(card.querySelector('.sim-leg-strike')?.value) || 0;
                leg.fallback = card.querySelector('.sim-leg-fallback')?.value || 'closest';
                break;
            case 'dollar_underlying': case 'pct_underlying':
                leg.value = Math.abs(parseFloat(card.querySelector('.sim-leg-value')?.value) || 0);
                leg.direction = direction;
                leg.fallback = card.querySelector('.sim-leg-fallback')?.value || 'closest';
                break;
            case 'delta':
                leg.delta = parseFloat(card.querySelector('.sim-leg-delta')?.value) || 0.30;
                leg.deltaMethod = card.querySelector('.sim-leg-delta-method')?.value || 'closest';
                break;
            case 'mid_price':
                leg.min = parseFloat(card.querySelector('.sim-leg-min')?.value) || 1;
                leg.max = parseFloat(card.querySelector('.sim-leg-max')?.value) || 5;
                break;
            case 'dollar_leg': case 'pct_leg':
                const refSelect = card.querySelector('.sim-leg-ref');
                leg.refLeg = parseInt(refSelect?.value || '0');
                if (isNaN(leg.refLeg)) leg.refLeg = 0;
                leg.value = Math.abs(parseFloat(card.querySelector('.sim-leg-value')?.value) || 0);
                leg.direction = direction;
                break;
            case 'chain':
                leg.method = 'exact_strike';
                leg.strike = parseFloat(card.querySelector('.sim-chain-strike')?.value) || 0;
                leg.fallback = 'closest';
                break;
        }
        legs.push(leg);
    });
    return legs;
}

function calculateStrikeFromLegConfig(leg, underlyingPrice, resolvedStrikes) {
    const dirMultiplier = (leg.direction === 'above') ? 1 : -1;
    switch (leg.method) {
        case 'exact_strike': return { strike: leg.strike, fallback: leg.fallback };
        case 'dollar_underlying': return { strike: underlyingPrice + (leg.value * dirMultiplier), fallback: leg.fallback };
        case 'pct_underlying': return { strike: underlyingPrice * (1 + (leg.value / 100) * dirMultiplier), fallback: leg.fallback };
        case 'dollar_leg':
            if (resolvedStrikes[leg.refLeg] !== undefined) return { strike: resolvedStrikes[leg.refLeg] + (leg.value * dirMultiplier), fallback: 'closest' };
            return { strike: underlyingPrice, fallback: 'closest' };
        case 'pct_leg':
            if (resolvedStrikes[leg.refLeg] !== undefined) return { strike: resolvedStrikes[leg.refLeg] * (1 + (leg.value / 100) * dirMultiplier), fallback: 'closest' };
            return { strike: underlyingPrice, fallback: 'closest' };
        case 'delta': return { strike: underlyingPrice, fallback: 'closest', delta: leg.delta, deltaMethod: leg.deltaMethod };
        case 'mid_price': return { strike: underlyingPrice, fallback: 'closest', midPriceMin: leg.min, midPriceMax: leg.max };
        default: return { strike: underlyingPrice, fallback: 'closest' };
    }
}

function _ensureOptionChainModal() {
    if (document.getElementById('optionChainModal')) return;
    const el = document.createElement('div');
    el.id = 'optionChainModal';
    el.style.cssText = 'display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.55);align-items:center;justify-content:center;';
    el.innerHTML = `
        <div style="background:#fff;border-radius:12px;width:min(95vw,480px);max-height:85vh;display:flex;flex-direction:column;box-shadow:0 8px 40px rgba(0,0,0,0.22);overflow:hidden;">
            <div style="padding:14px 16px 10px;border-bottom:1px solid #e8eaed;display:flex;align-items:center;justify-content:space-between;">
                <div>
                    <div id="chainModalTitle" style="font-size:14px;font-weight:700;color:#191919;">Option Chain</div>
                    <div id="chainModalSub" style="font-size:11px;color:#6a6d78;margin-top:2px;"></div>
                </div>
                <button onclick="closeOptionChainModal()" style="background:none;border:none;font-size:18px;color:#6a6d78;cursor:pointer;padding:4px 8px;line-height:1;">&times;</button>
            </div>
            <div id="chainModalBody" style="overflow-y:auto;flex:1;padding:8px 0;"></div>
        </div>`;
    document.body.appendChild(el);
}

async function openOptionChainModal(legIndex) {
    _ensureOptionChainModal();
    const modal = document.getElementById('optionChainModal');
    modal.style.display = 'flex';
    modal._legIndex = legIndex;

    const strategy = document.getElementById('simOptionStrategy')?.value;
    const strategyLegs = SIM_STRATEGY_LEGS[strategy] || [];
    const legInfo = strategyLegs[legIndex];
    const optType = legInfo?.type || 'P';

    const curBar = simMinuteBarsCache[simCurrentMinuteIndex - 1] || simMinuteBarsCache[simMinuteBarsCache.length - 1];
    const underlyingPrice = curBar ? (curBar.vwap || curBar.close) : 0;
    const currentTs = curBar ? curBar.timestamp : Date.now();

    const card = document.querySelectorAll('#simLegConfigSection > div > div')[legIndex];
    const legDteInput = card?.querySelector('.sim-leg-dte');
    const globalDte = parseInt(document.getElementById('simDte')?.value || '0');
    const legDte = legDteInput ? (parseInt(legDteInput.value) || 0) : globalDte;

    const entryDate = simChartDates.tradingStart || simChartDates.start;
    const expDate = new Date(entryDate);
    expDate.setDate(expDate.getDate() + legDte);
    const expDateStr = expDate.toISOString().split('T')[0];
    const startDateStr = simChartDates.start;

    document.getElementById('chainModalTitle').textContent = `${simCurrentSymbol} ${optType === 'P' ? 'Puts' : 'Calls'} — Exp ${expDateStr}`;
    document.getElementById('chainModalSub').textContent = `Underlying: ${underlyingPrice.toFixed(2)} · Fetching IV…`;
    document.getElementById('chainModalBody').innerHTML =
        `<div style="text-align:center;padding:36px;color:#6a6d78;font-size:13px;"><i class="fas fa-spinner fa-spin" style="font-size:22px;display:block;margin-bottom:10px;"></i>Loading option chain…</div>`;

    try {
        const resp = await fetch('/api/simulated-trading/option-chain', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                symbol: simCurrentSymbol,
                expiration_date: expDateStr,
                option_type: optType,
                underlying_price: underlyingPrice,
                current_timestamp: currentTs,
                start_date: startDateStr
            })
        });
        const rawChain = await resp.text();
        let data;
        try { data = JSON.parse(rawChain); } catch (_) {
            throw new Error(`Server error ${resp.status}: ${rawChain.slice(0, 120)}`);
        }
        if (!data.success) throw new Error(data.error || 'Chain fetch failed');

        const chain = data.chain || [];
        const iv = data.iv_pct || 0;
        document.getElementById('chainModalSub').textContent =
            `Underlying: ${underlyingPrice.toFixed(2)} · IV: ${iv.toFixed(1)}% · ${chain.length} strikes (theoretical)`;

        let rows = '';
        chain.forEach(row => {
            const itmBg = row.itm ? '#f0f7ff' : '#fff';
            rows += `<tr onclick="selectChainStrike(${legIndex},${row.strike})"
                style="cursor:pointer;background:${itmBg};border-bottom:1px solid #f0f0f0;"
                onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='${itmBg}'">
                <td style="padding:7px 12px;font-size:12px;color:#191919;font-weight:${row.itm?'700':'400'};">${row.strike}</td>
                <td style="padding:7px 12px;text-align:center;">
                    <span style="padding:2px 5px;border-radius:3px;font-size:10px;background:${row.itm?'#dbeafe':'#f3f4f6'};color:${row.itm?'#1d4ed8':'#6b7280'};">${row.itm?'ITM':'OTM'}</span>
                </td>
            </tr>`;
        });

        document.getElementById('chainModalBody').innerHTML = `
            <div style="font-size:10px;color:#9ca3af;padding:6px 12px;border-bottom:1px solid #f0f0f0;">
                Theoretical strikes derived from market-anchored IV. Click a row to select that strike.
            </div>
            <table style="width:100%;border-collapse:collapse;">
                <thead><tr style="background:#f8f9fa;border-bottom:2px solid #e8eaed;position:sticky;top:0;">
                    <th style="padding:7px 12px;font-size:10px;color:#6a6d78;text-align:left;font-weight:600;">STRIKE</th>
                    <th style="padding:7px 12px;font-size:10px;color:#6a6d78;text-align:center;font-weight:600;">MONEYNESS</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    } catch (err) {
        document.getElementById('chainModalBody').innerHTML =
            `<div style="text-align:center;padding:32px;color:#e53935;font-size:13px;">Failed to load chain: ${err.message}</div>`;
    }
}

function selectChainStrike(legIndex, strike) {
    const card = document.querySelectorAll('#simLegConfigSection > div > div')[legIndex];
    if (!card) return;
    const hiddenInput = card.querySelector('.sim-chain-strike');
    const label = card.querySelector('.sim-chain-label');
    if (hiddenInput) hiddenInput.value = strike;
    if (label) {
        label.textContent = `Strike: ${strike}`;
        label.style.color = '#191919';
        label.style.fontWeight = '600';
    }
    closeOptionChainModal();
}

function closeOptionChainModal() {
    const modal = document.getElementById('optionChainModal');
    if (modal) modal.style.display = 'none';
}

function fetchServerGreeks(position) {
    const legs = position.legs.map(leg => ({
        strike: leg.strike,
        entryPrice: leg.entryPrice,
        type: leg.type,
        expiration_date: leg.expiration || position.expiration
    }));
    fetch('/api/simulated-trading/compute-greeks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            legs: legs,
            underlying_price: position.underlyingAtEntry,
            entry_timestamp: position.entryTimestamp,
            expiration_date: position.expiration
        })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success && data.greeks) {
            data.greeks.forEach((g, idx) => {
                if (g && g.iv !== null && position.legs[idx]) {
                    position.legs[idx].entryGreeks = {
                        iv: g.iv,
                        delta: g.delta,
                        gamma: g.gamma,
                        theta: g.theta,
                        vega: g.vega
                    };
                }
            });
            console.log('[SimTrading] Server Greeks applied:', data.greeks);
            updateSimIVDisplay();
        }
    })
    .catch(err => console.warn('[SimTrading] Greeks fetch failed:', err));
}

async function executeOptionTrade() {
    if (simVisibleBars.length === 0) { appAlert('Load chart data first'); return; }

    const currentMinuteBar = simMinuteBarsCache[simCurrentMinuteIndex - 1];
    if (currentMinuteBar) {
        const barDate = new Date(currentMinuteBar.timestamp);
        const etTime = barDate.toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
        const [etHour, etMinute] = etTime.split(':').map(Number);
        const totalMinutes = etHour * 60 + etMinute;
        if (totalMinutes < 570 || totalMinutes > 959) {
            appAlert('Options can only be traded between 9:30 AM and 3:59 PM ET');
            return;
        }
    }

    const globalDte = parseInt(document.getElementById('simOptionDTE')?.value) || 0;
    const strategy = document.getElementById('simOptionStrategy')?.value;
    const tpRaw = document.getElementById('simOptionTP')?.value;
    const slRaw = document.getElementById('simOptionSL')?.value;
    const tpType = document.getElementById('simOptionTPType')?.value || 'pct';
    const slType = document.getElementById('simOptionSLType')?.value || 'dollar';
    const tp = tpRaw !== '' && tpRaw !== undefined ? parseFloat(tpRaw) : null;
    const sl = slRaw !== '' && slRaw !== undefined ? parseFloat(slRaw) : null;
    const detectionBar = parseInt(document.getElementById('simOptionDetectionBar')?.value) || 1;
    const quantity = parseInt(document.getElementById('simOptionQuantity')?.value) || 10;

    const legConfigs = collectSimLegConfigurations();
    if (legConfigs.length === 0) { appAlert('Please configure at least one leg'); return; }
    if (hasCircularLegReference(legConfigs)) { appAlert('Circular leg reference detected. A leg cannot reference another leg that references it back.'); return; }

    const directionError = validateLegDirections(strategy, legConfigs);
    if (directionError) { appAlert(directionError); return; }

    if (!currentMinuteBar) { appAlert('No current bar data available'); return; }

    const underlyingPrice = currentMinuteBar.close;
    const entryTimestamp = currentMinuteBar.timestamp;
    const entryDate = new Date(entryTimestamp);

    const etTimeStr = entryDate.toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
    const [etHour, etMinute] = etTimeStr.split(':').map(Number);
    const isCalDiag = isSimCalendarDiagonalStrategy(strategy);
    if (!isCalDiag && globalDte === 0 && (etHour * 60 + etMinute) >= 960) {
        appAlert('Cannot open 0DTE trades after 4:00 PM ET.');
        return;
    }

    const startDateStr = entryDate.toISOString().split('T')[0];

    const tradeBtn = document.getElementById('simOptionTradeBtn');
    if (tradeBtn) { tradeBtn.disabled = true; tradeBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Loading...'; }

    try {
        const resolvedStrikes = [];
        const positionLegs = [];

        const legExpirations = [];
        for (let i = 0; i < legConfigs.length; i++) {
            const legConfig = legConfigs[i];
            const legDte = (legConfig.dte !== undefined) ? legConfig.dte : globalDte;
            const legExpDate = new Date(entryDate);
            legExpDate.setDate(legExpDate.getDate() + legDte);
            // Roll weekend expirations forward to the next weekday — option contracts
            // do not expire on Saturdays or Sundays, so a DTE that lands on a weekend
            // would otherwise return zero bars from Polygon.
            while (legExpDate.getDay() === 0 || legExpDate.getDay() === 6) {
                legExpDate.setDate(legExpDate.getDate() + 1);
            }
            const legExpDateStr = legExpDate.toISOString().split('T')[0];
            legExpirations.push(legExpDateStr);

            if (legConfig.method === 'dollar_leg' || legConfig.method === 'pct_leg') {
                const refStrike = resolvedStrikes[legConfig.refLeg !== undefined ? legConfig.refLeg : 0];
                if (refStrike !== undefined) {
                    const origMethod = legConfig.method;
                    const dirMult = legConfig.direction === 'below' ? -1 : 1;
                    legConfig.strike = origMethod === 'dollar_leg'
                        ? refStrike + (legConfig.value || 0) * dirMult
                        : refStrike * (1 + ((legConfig.value || 0) / 100) * dirMult);
                    legConfig.method = 'exact_strike';
                    legConfig.fallback = 'closest';
                }
            }

            const optionEndDate = simDataWindow.end || simChartDates.end;
            const optionData = await fetchOptionBars(simCurrentSymbol, legConfig.type, legExpDateStr, startDateStr, optionEndDate, simSecondsEnabled ? simSecondsInterval : detectionBar, legConfig, underlyingPrice);
            if (!optionData.bars || optionData.bars.length === 0) {
                appAlert('No option data found for leg ' + (i + 1) + ': ' + legConfig.name);
                return;
            }

            resolvedStrikes.push(optionData.actualStrike);
            let entryBar = findClosestOptionBar(optionData.bars, entryTimestamp);
            if (!entryBar) entryBar = optionData.bars.find(b => b.timestamp >= entryTimestamp);
            if (!entryBar) { appAlert('No option price data at entry time for leg ' + (i + 1)); return; }

            positionLegs.push({
                legIndex: i, name: legConfig.name, type: legConfig.type, position: legConfig.position,
                strike: optionData.actualStrike, entryPrice: entryBar.vwap || entryBar.close,
                entryBarTimestamp: entryBar.timestamp, optionBars: optionData.bars, optionSymbol: optionData.optionSymbol,
                expiration: legExpDateStr
            });
        }

        const spreadErr = validateSimSpreadStrikes(strategy, positionLegs);
        if (spreadErr) { appAlert(spreadErr); return; }

        let totalEntryPremium = 0;
        positionLegs.forEach(leg => {
            const premium = leg.entryPrice * 100 * quantity;
            totalEntryPremium += leg.position === 'long' ? -premium : premium;
        });

        const nearExpStr = isCalDiag ? legExpirations.reduce((a, b) => a < b ? a : b) : legExpirations[0];
        const position = {
            id: Date.now(), strategy, legs: positionLegs, expiration: nearExpStr,
            quantity, remainingQuantity: quantity, totalEntryPremium,
            entryTimestamp, entryMinuteIndex: simCurrentMinuteIndex,
            underlyingAtEntry: underlyingPrice, tp, sl, tpType, slType, detectionBar,
            status: 'open', closedParts: [], realizedPnl: 0
        };

        simOpenOptionPositions.push(position);
        updateOptionsPnlDisplay();
        updateOptionsPositionsCard();
        updatePositionLines();

        fetchServerGreeks(position);
        updateSimIVDisplay();
    } catch (error) {
        console.error('Error opening option position:', error);
        appAlert('Error opening option position: ' + error.message);
    } finally {
        if (tradeBtn) { tradeBtn.disabled = false; tradeBtn.innerHTML = '<i class="fas fa-bolt me-1"></i>Trade'; }
    }
}

async function fetchOptionBars(symbol, optionType, expDate, startDate, endDate, multiplier, legConfig, underlyingPrice) {
    const apiUrl = '/api';
    const dirSign = (legConfig.method === 'dollar_underlying' || legConfig.method === 'pct_underlying')
        ? (legConfig.direction === 'above' ? 1 : -1)
        : 1;
    const requestBody = {
        symbol, option_type: optionType, expiration_date: expDate,
        start_date: startDate, end_date: endDate, multiplier,
        bar_size: simSecondsEnabled ? 'second' : 'minute',
        underlying_price: underlyingPrice, strike_method: legConfig.method,
        method_value: dirSign * (legConfig.value || 0), fallback: legConfig.fallback || 'closest'
    };
    if (legConfig.method === 'exact_strike') requestBody.strike = legConfig.strike;
    if (legConfig.method === 'delta') { requestBody.delta = legConfig.delta; requestBody.delta_method = legConfig.deltaMethod || 'closest'; }
    if (legConfig.method === 'mid_price') { requestBody.mid_price_min = legConfig.min; requestBody.mid_price_max = legConfig.max; }

    const response = await fetch(`${apiUrl}/simulated-trading/option-bars`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody)
    });
    const rawText = await response.text();
    let data;
    try { data = JSON.parse(rawText); } catch (_) {
        throw new Error(`Server error ${response.status}: ${rawText.slice(0, 120)}`);
    }
    if (!response.ok) throw new Error(data.error || `Server error ${response.status}`);
    return { bars: data.bars || [], actualStrike: data.strike, optionSymbol: data.option_symbol, optionType: data.option_type };
}

function calculateOptionPositionPnl(pos, currentTimestamp) {
    if (!pos.legs || pos.legs.length === 0) return 0;
    let totalPnl = 0;
    for (const leg of pos.legs) {
        const optionBar = findClosestOptionBar(leg.optionBars, currentTimestamp);
        if (!optionBar) continue;
        const priceDiff = (optionBar.vwap || optionBar.close) - leg.entryPrice;
        totalPnl += (leg.position === 'long' ? priceDiff : -priceDiff) * 100 * pos.remainingQuantity;
    }
    // Cap unrealized P&L at credit received for short spread strategies —
    // Polygon bar data can show the lower-strike put priced above the higher-strike
    // put within the same bar (bid/ask artifact), making pnl appear > credit received.
    if (pos.totalEntryPremium > 0) totalPnl = Math.min(totalPnl, pos.totalEntryPremium);
    return totalPnl;
}

function checkOptionTpSlThresholds() {
    if (simOpenOptionPositions.length === 0) return;
    const currentMinuteBar = simMinuteBarsCache[simCurrentMinuteIndex - 1];
    if (!currentMinuteBar) return;
    const currentTimestamp = currentMinuteBar.timestamp;
    const positionsToClose = [];

    for (const pos of simOpenOptionPositions) {
        if (pos.status !== 'open') continue;
        const unrealizedPnl = calculateOptionPositionPnl(pos, currentTimestamp);
        const entryPremium = Math.abs(pos.totalEntryPremium);
        if (entryPremium > 0) {
            const pnlPct = (unrealizedPnl / entryPremium) * 100;
            if (pos.tp != null) {
                if (pos.tpType === 'dollar') {
                    if (unrealizedPnl >= pos.tp) positionsToClose.push({ pos, reason: 'TP' });
                } else {
                    if (pnlPct >= pos.tp) positionsToClose.push({ pos, reason: 'TP' });
                }
            }
            if (!positionsToClose.find(p => p.pos === pos) && pos.sl != null) {
                if (pos.slType === 'pct') {
                    if (pnlPct <= -Math.abs(pos.sl)) positionsToClose.push({ pos, reason: 'SL' });
                } else {
                    if (unrealizedPnl <= -Math.abs(pos.sl)) positionsToClose.push({ pos, reason: 'SL' });
                }
            }
        }

        const currentDate = new Date(currentTimestamp);
        const currentDateET = currentDate.toLocaleString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
        const [cM, cD, cY] = currentDateET.split('/');
        const currentDateStr = `${cY}-${cM}-${cD}`;
        const currentTimeET = currentDate.toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
        const [etH, etMi] = currentTimeET.split(':').map(Number);
        const isPastExpiration = currentDateStr > pos.expiration || (currentDateStr === pos.expiration && (etH * 60 + etMi) >= 960);
        if (isPastExpiration) positionsToClose.push({ pos, reason: 'Expiration' });
    }

    for (const { pos, reason } of positionsToClose) closeOptionPosition(pos.id, null, reason);
}

function updateOptionsPnlDisplay() {
    let unrealizedPnl = 0;
    if (simOpenOptionPositions.length > 0) {
        const currentMinuteBar = simMinuteBarsCache[simCurrentMinuteIndex - 1];
        const currentTimestamp = currentMinuteBar ? currentMinuteBar.timestamp : Date.now();
        for (const pos of simOpenOptionPositions) unrealizedPnl += calculateOptionPositionPnl(pos, currentTimestamp);
    }

    const optRealizedEl = document.getElementById('simOptionsRealizedPnl');
    const optUnrealizedEl = document.getElementById('simOptionsUnrealizedPnl');
    if (optRealizedEl) {
        const isPositive = simOptionsRealizedPnl >= 0;
        optRealizedEl.textContent = `${isPositive ? '+' : ''}$${simOptionsRealizedPnl.toFixed(2)}`;
        optRealizedEl.style.color = isPositive ? '#089981' : '#f23645';
    }
    if (optUnrealizedEl) {
        const isPositive = unrealizedPnl >= 0;
        optUnrealizedEl.textContent = `${isPositive ? '+' : ''}$${unrealizedPnl.toFixed(2)}`;
        optUnrealizedEl.style.color = isPositive ? '#089981' : '#f23645';
    }
    updateOptionsPositionsCard();
    // Keep the top header (Balance / Realized / Unrealized) synchronized with
    // option close events. Without this call, closeOptionPosition would only
    // refresh the bottom panel and leave the header stale, causing the two
    // Realized values to disagree after any option trade closes.
    updateTradingDisplay();
}

function findClosestOptionBar(optionBars, targetTimestamp) {
    if (!optionBars || optionBars.length === 0) return null;
    let closestBefore = null, minDiffBefore = Infinity;
    for (const bar of optionBars) {
        if (bar.timestamp <= targetTimestamp) {
            const diff = targetTimestamp - bar.timestamp;
            if (diff < minDiffBefore) { minDiffBefore = diff; closestBefore = bar; }
        }
    }
    return closestBefore || optionBars[optionBars.length - 1];
}

function closeOptionPosition(positionId, closeQuantity = null, reason = 'Manual') {
    const posIndex = simOpenOptionPositions.findIndex(p => p.id === positionId);
    if (posIndex === -1) return;
    const pos = simOpenOptionPositions[posIndex];
    const currentMinuteBar = simMinuteBarsCache[simCurrentMinuteIndex - 1];
    if (!currentMinuteBar) { appAlert('No current bar data available'); return; }

    const currentTimestamp = currentMinuteBar.timestamp;
    const qtyToClose = closeQuantity || pos.remainingQuantity;
    let pnl = 0;
    const legExitPrices = [];

    const underlyingAtClose = currentMinuteBar.close;

    // For manual closes: find the common timestamp across all legs (latest time all legs
    // have simultaneous data) to prevent cross-leg timing artifacts causing pnl > credit.
    let effectiveCloseTimestamp = currentTimestamp;
    if (reason !== 'Expiration') {
        const perLegTs = pos.legs.map(leg => {
            const bar = findClosestOptionBar(leg.optionBars, currentTimestamp)
                     || (leg.optionBars.length > 0 ? leg.optionBars[leg.optionBars.length - 1] : null);
            return bar ? bar.timestamp : currentTimestamp;
        }).filter(ts => ts != null);
        if (perLegTs.length > 0) effectiveCloseTimestamp = Math.min(...perLegTs);
    }

    for (const leg of pos.legs) {
        let exitPrice;
        if (reason === 'Expiration') {
            // Use intrinsic value at settlement — eliminates data artifacts from last option bar
            exitPrice = leg.type === 'P'
                ? Math.max(leg.strike - underlyingAtClose, 0)
                : Math.max(underlyingAtClose - leg.strike, 0);
        } else {
            let optionBar = findClosestOptionBar(leg.optionBars, effectiveCloseTimestamp);
            if (!optionBar && leg.optionBars.length > 0) optionBar = leg.optionBars[leg.optionBars.length - 1];
            if (!optionBar) { legExitPrices.push({ leg: leg.name, price: leg.entryPrice }); continue; }
            exitPrice = optionBar.vwap || optionBar.close;
            console.log(`[Close] Leg ${leg.name} (${leg.position} ${leg.type} $${leg.strike}): entry=$${leg.entryPrice.toFixed(4)}, exit=$${exitPrice.toFixed(4)}, bar_ts=${new Date(optionBar.timestamp).toISOString()}, effective_ts=${new Date(effectiveCloseTimestamp).toISOString()}`);
        }
        legExitPrices.push({ leg: leg.name, price: exitPrice });
        pnl += (leg.position === 'long' ? (exitPrice - leg.entryPrice) : (leg.entryPrice - exitPrice)) * 100 * qtyToClose;
    }
    // Cap realized P&L at credit received for short spread strategies
    if (pos.totalEntryPremium > 0) {
        const creditForClose = pos.totalEntryPremium * (qtyToClose / pos.remainingQuantity);
        pnl = Math.min(pnl, creditForClose);
    }
    console.log(`[Close] Strategy=${pos.strategy}, reason=${reason}, qty=${qtyToClose}, pnl=$${pnl.toFixed(2)}, credit=$${pos.totalEntryPremium.toFixed(2)}`);

    simOptionsRealizedPnl += pnl;
    pos.realizedPnl += pnl;
    pos.closedParts.push({ quantity: qtyToClose, exitPrices: legExitPrices, exitTimestamp: currentTimestamp, pnl, reason });

    const closeRatio = qtyToClose / pos.remainingQuantity;
    pos.totalEntryPremium = pos.totalEntryPremium * (1 - closeRatio);
    pos.remainingQuantity -= qtyToClose;

    if (pos.remainingQuantity <= 0) {
        pos.status = 'closed';
        simClosedOptionTrades.push(pos);
        simOpenOptionPositions.splice(posIndex, 1);
    }

    showTradeToast(pos.strategy, reason, pnl, qtyToClose);
    updateOptionsPnlDisplay();
    updateOptionsPositionsCard();
    updatePositionLines();
    updateSimIVDisplay();
}

function showTradeToast(strategy, reason, pnl, quantity) {
    const toast = document.getElementById('simTradeToast');
    if (!toast) return;
    const isProfit = pnl >= 0;
    const pnlStr = `${isProfit ? '+' : ''}$${pnl.toFixed(2)}`;
    let iconClass = 'fas fa-check-circle', iconColor = '#089981', titleText = 'Trade Closed';
    switch (reason) {
        case 'TP': iconClass = 'fas fa-bullseye'; iconColor = '#089981'; titleText = 'Take Profit Hit!'; break;
        case 'SL': iconClass = 'fas fa-shield-alt'; iconColor = '#f23645'; titleText = 'Stop Loss Hit'; break;
        case 'Expiration': iconClass = 'fas fa-clock'; iconColor = '#ff9800'; titleText = 'Position Expired'; break;
        default: iconClass = 'fas fa-times-circle'; iconColor = '#6a6d78'; titleText = 'Position Closed';
    }

    document.getElementById('simToastIcon').className = iconClass;
    document.getElementById('simToastIcon').style.color = iconColor;
    document.getElementById('simToastTitle').textContent = titleText;
    document.getElementById('simToastMessage').innerHTML = `<strong>${strategy}</strong> (${quantity} contracts)<br>P&L: <span style="color: ${isProfit ? '#089981' : '#f23645'};">${pnlStr}</span>`;
    toast.style.display = 'block';
    toast.style.animation = 'slideIn 0.3s ease-out';
    setTimeout(() => hideTradeToast(), 5000);
}

function hideTradeToast() {
    const toast = document.getElementById('simTradeToast');
    if (toast) { toast.style.animation = 'slideOut 0.3s ease-in'; setTimeout(() => { toast.style.display = 'none'; }, 300); }
}

function updatePositionTpSl(positionId) {
    const pos = simOpenOptionPositions.find(p => p.id === positionId);
    if (!pos) return;
    const tpInput = document.getElementById(`pos-tp-${positionId}`);
    const slInput = document.getElementById(`pos-sl-${positionId}`);
    if (tpInput) {
        if (tpInput.value === '') { pos.tp = null; }
        else { const v = parseFloat(tpInput.value); if (!isNaN(v) && v > 0) pos.tp = v; }
    }
    if (slInput) {
        if (slInput.value === '') { pos.sl = null; }
        else { const v = parseFloat(slInput.value); if (!isNaN(v) && v >= 0) pos.sl = -Math.abs(v); }
    }
}

function closePositionPartial(positionId) {
    const pos = simOpenOptionPositions.find(p => p.id === positionId);
    if (!pos) return;
    const qtyInput = document.getElementById(`pos-close-qty-${positionId}`);
    if (!qtyInput) return;
    const closeQty = parseInt(qtyInput.value);
    if (isNaN(closeQty) || closeQty < 1) { appAlert('Please enter a valid quantity'); return; }
    if (closeQty > pos.remainingQuantity) { appAlert('Only ' + pos.remainingQuantity + ' remaining.'); return; }
    closeOptionPosition(positionId, closeQty, 'Manual');
}

function updateOptionsPositionsCard() {
    const card = document.getElementById('simOptionsPositionsCard');
    const list = document.getElementById('simOptionsPositionsList');
    const countBadge = document.getElementById('simOptionsPositionCount');
    if (!card || !list) return;

    if (simOpenOptionPositions.length === 0) { card.style.display = 'none'; return; }
    card.style.display = 'block';
    if (countBadge) countBadge.textContent = simOpenOptionPositions.length;

    const currentMinuteBar = simMinuteBarsCache[simCurrentMinuteIndex - 1];
    const currentTimestamp = currentMinuteBar ? currentMinuteBar.timestamp : Date.now();

    let html = '';
    for (const pos of simOpenOptionPositions) {
        const unrealizedPnl = calculateOptionPositionPnl(pos, currentTimestamp);
        const isProfit = unrealizedPnl >= 0;
        const pnlStr = `${isProfit ? '+' : ''}$${unrealizedPnl.toFixed(2)}`;
        const entryPremium = Math.abs(pos.totalEntryPremium);
        const pnlPct = entryPremium > 0 ? (unrealizedPnl / entryPremium * 100).toFixed(1) : '0.0';
        const isCredit = pos.totalEntryPremium > 0;
        const creditDebitLabel = isCredit ? 'Credit Rcvd' : 'Debit Paid';
        const creditDebitColor = isCredit ? '#089981' : '#f23645';
        const creditDebitStr = `$${entryPremium.toFixed(2)}`;

        const legsHtml = pos.legs.map(leg => {
            return `<span style="background: ${leg.position === 'long' ? '#2962ff' : '#ff9800'}; color: white; padding: 1px 5px; border-radius: 3px; font-size: 9px; margin-right: 3px;">
                ${leg.position.charAt(0).toUpperCase()} ${leg.type} $${leg.strike} @ $${leg.entryPrice.toFixed(2)}</span>`;
        }).join('');

        html += `
        <div style="background: #f8f9fd; border: 1px solid #e0e3eb; border-radius: 6px; padding: 8px; margin-bottom: 6px;" id="pos-card-${pos.id}">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="font-weight: 600; color: #191919; font-size: 12px;">${pos.strategy} <span style="color: #6a6d78; font-weight: 400;">${pos.remainingQuantity} contracts</span></span>
                <span style="font-weight: 600; color: ${isProfit ? '#089981' : '#f23645'}; font-size: 12px;">${pnlStr} (${pnlPct}%)</span>
            </div>
            <div style="margin-bottom: 4px;">${legsHtml}</div>
            <div style="margin-bottom: 4px; font-size: 10px;">
                <span style="color: ${creditDebitColor}; font-weight: 600;">${creditDebitLabel}: ${creditDebitStr}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #6a6d78; margin-bottom: 6px;">
                <span>Exp: ${pos.expiration}</span>
                <button onclick="showPayoffModal(${pos.id})" style="background: #f0f3fa; color: #2962ff; border: 1px solid #d1d4dc; padding: 2px 8px; border-radius: 4px; font-size: 10px; cursor: pointer;" title="Payoff Diagram"><i class="fas fa-chart-area me-1"></i>Payoff</button>
            </div>
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <label style="font-size: 10px; color: #6a6d78;">TP${(pos.tpType || 'pct') === 'dollar' ? '$' : '%'}:</label>
                <input type="number" id="pos-tp-${pos.id}" value="${pos.tp != null ? pos.tp : ''}" step="5" class="sim-dark-input" style="width: 48px; font-size: 10px; padding: 2px 4px;">
                <label style="font-size: 10px; color: #6a6d78;">SL${(pos.slType || 'dollar') === 'pct' ? '%' : '$'}:</label>
                <input type="number" id="pos-sl-${pos.id}" value="${pos.sl != null ? Math.abs(pos.sl) : ''}" step="10" class="sim-dark-input" style="width: 55px; font-size: 10px; padding: 2px 4px;">
                <button onclick="updatePositionTpSl(${pos.id})" class="sim-nav-btn" style="font-size: 10px; padding: 2px 6px;"><i class="fas fa-save"></i></button>
                <span style="flex: 1;"></span>
                <label style="font-size: 10px; color: #6a6d78;">Close:</label>
                <input type="number" id="pos-close-qty-${pos.id}" value="${pos.remainingQuantity}" min="1" max="${pos.remainingQuantity}" class="sim-dark-input" style="width: 42px; font-size: 10px; padding: 2px 4px;">
                <button onclick="closePositionPartial(${pos.id})" class="sim-nav-btn" style="font-size: 10px; padding: 2px 6px; color: #f23645; border-color: #f23645;">Close</button>
                <button onclick="closeOptionPosition(${pos.id})" style="background: #f23645; color: white; border: none; padding: 2px 6px; border-radius: 4px; font-size: 10px; cursor: pointer;">All</button>
            </div>
        </div>`;
    }
    list.innerHTML = html;
}

function hasCircularLegReference(legs) {
    for (let i = 0; i < legs.length; i++) {
        if (legs[i].method !== 'dollar_leg' && legs[i].method !== 'pct_leg') continue;
        const visited = new Set();
        let current = i;
        while (true) {
            if (visited.has(current)) return true;
            visited.add(current);
            const leg = legs[current];
            if (!leg || (leg.method !== 'dollar_leg' && leg.method !== 'pct_leg')) break;
            current = leg.refLeg;
            if (current === undefined || current === null) break;
        }
    }
    return false;
}

function validateLegDirections(strategy, legConfigs) {
    const rules = SIM_LEG_DIRECTION_RULES[strategy];
    if (!rules) return null;
    const legs = SIM_STRATEGY_LEGS[strategy];
    if (!legs) return null;

    for (const [indexStr, requiredDir] of Object.entries(rules)) {
        const idx = parseInt(indexStr);
        const config = legConfigs[idx];
        if (!config) continue;
        if (config.method === 'exact_strike' || config.method === 'mid_price' || config.method === 'delta') continue;
        if (config.direction && config.direction !== requiredDir) {
            const legName = legs[idx]?.name || `Leg ${idx + 1}`;
            return `${legName} (Leg ${idx + 1}): direction must be "${requiredDir}" for ${strategy}. Currently set to "${config.direction}".`;
        }
    }
    return null;
}

const SIM_STRATEGY_PRESETS = {
    'Short Iron Condor': [
        { name: '$5 wide', legs: [
            { method: 'dollar_leg', ref: 1, direction: 'below', value: 5 },
            { method: 'dollar_underlying', direction: 'below', value: 2 },
            { method: 'dollar_underlying', direction: 'above', value: 2 },
            { method: 'dollar_leg', ref: 2, direction: 'above', value: 5 }
        ]},
        { name: '$10 wide', legs: [
            { method: 'dollar_leg', ref: 1, direction: 'below', value: 10 },
            { method: 'dollar_underlying', direction: 'below', value: 5 },
            { method: 'dollar_underlying', direction: 'above', value: 5 },
            { method: 'dollar_leg', ref: 2, direction: 'above', value: 10 }
        ]}
    ],
    'Short Iron Butterfly': [
        { name: '$5 wings', legs: [
            { method: 'dollar_underlying', direction: 'below', value: 5 },
            { method: 'dollar_underlying', direction: 'below', value: 0 },
            { method: 'dollar_underlying', direction: 'above', value: 0 },
            { method: 'dollar_underlying', direction: 'above', value: 5 }
        ]},
        { name: '$10 wings', legs: [
            { method: 'dollar_underlying', direction: 'below', value: 10 },
            { method: 'dollar_underlying', direction: 'below', value: 0 },
            { method: 'dollar_underlying', direction: 'above', value: 0 },
            { method: 'dollar_underlying', direction: 'above', value: 10 }
        ]}
    ],
    'Long Iron Condor': [
        { name: '$5 wide', legs: [
            { method: 'dollar_underlying', direction: 'below', value: 5 },
            { method: 'dollar_leg', ref: 0, direction: 'above', value: 5 },
            { method: 'dollar_underlying', direction: 'above', value: 5 },
            { method: 'dollar_leg', ref: 2, direction: 'below', value: 5 }
        ]}
    ],
    'Long Iron Butterfly': [
        { name: '$5 wings', legs: [
            { method: 'dollar_underlying', direction: 'below', value: 5 },
            { method: 'dollar_underlying', direction: 'below', value: 0 },
            { method: 'dollar_underlying', direction: 'above', value: 0 },
            { method: 'dollar_underlying', direction: 'above', value: 5 }
        ]}
    ],
    'Short Put Spread': [
        { name: '$5 wide', legs: [
            { method: 'dollar_underlying', direction: 'below', value: 5 },
            { method: 'dollar_leg', ref: 0, direction: 'below', value: 5 }
        ]},
        { name: '$10 wide', legs: [
            { method: 'dollar_underlying', direction: 'below', value: 5 },
            { method: 'dollar_leg', ref: 0, direction: 'below', value: 10 }
        ]}
    ],
    'Short Call Spread': [
        { name: '$5 wide', legs: [
            { method: 'dollar_underlying', direction: 'above', value: 5 },
            { method: 'dollar_leg', ref: 0, direction: 'above', value: 5 }
        ]},
        { name: '$10 wide', legs: [
            { method: 'dollar_underlying', direction: 'above', value: 5 },
            { method: 'dollar_leg', ref: 0, direction: 'above', value: 10 }
        ]}
    ],
    'Long Call Spread': [
        { name: '$5 wide', legs: [
            { method: 'dollar_underlying', direction: 'above', value: 5 },
            { method: 'dollar_leg', ref: 0, direction: 'above', value: 5 }
        ]}
    ],
    'Long Put Spread': [
        { name: '$5 wide', legs: [
            { method: 'dollar_underlying', direction: 'below', value: 5 },
            { method: 'dollar_leg', ref: 0, direction: 'below', value: 5 }
        ]}
    ],
    'Long Straddle': [
        { name: 'ATM', legs: [
            { method: 'dollar_underlying', direction: 'above', value: 0 },
            { method: 'dollar_underlying', direction: 'below', value: 0 }
        ]}
    ],
    'Short Straddle': [
        { name: 'ATM', legs: [
            { method: 'dollar_underlying', direction: 'above', value: 0 },
            { method: 'dollar_underlying', direction: 'below', value: 0 }
        ]}
    ],
    'Long Strangle': [
        { name: '$5 wide', legs: [
            { method: 'dollar_underlying', direction: 'above', value: 5 },
            { method: 'dollar_underlying', direction: 'below', value: 5 }
        ]}
    ],
    'Short Strangle': [
        { name: '$5 wide', legs: [
            { method: 'dollar_underlying', direction: 'above', value: 5 },
            { method: 'dollar_underlying', direction: 'below', value: 5 }
        ]}
    ]
};

function renderPresetButtons() {
    const strategy = document.getElementById('simOptionStrategy')?.value;
    const section = document.getElementById('simLegPresetSection');
    const container = document.getElementById('simLegPresetButtons');
    if (!section || !container) return;

    const presets = SIM_STRATEGY_PRESETS[strategy];
    if (!presets || presets.length === 0) { section.style.display = 'none'; return; }

    section.style.display = '';
    container.innerHTML = presets.map((preset, i) =>
        `<button type="button" onclick="applyLegPreset(${i})" style="background:#f0f3fa; color:#2962ff; border:1px solid #d1d4dc; padding:3px 10px; border-radius:4px; font-size:10px; font-weight:600; cursor:pointer; transition:all 0.15s;"
         onmouseover="this.style.background='#2962ff';this.style.color='#fff'" onmouseout="this.style.background='#f0f3fa';this.style.color='#2962ff'">${preset.name}</button>`
    ).join('');
}

function applyLegPreset(presetIndex) {
    const strategy = document.getElementById('simOptionStrategy')?.value;
    if (!strategy) return;
    const presets = SIM_STRATEGY_PRESETS[strategy];
    if (!presets || !presets[presetIndex]) return;
    const preset = presets[presetIndex];
    const legs = SIM_STRATEGY_LEGS[strategy];
    if (!legs) return;

    preset.legs.forEach((legPreset, i) => {
        const methodSelect = document.querySelector(`.sim-leg-method[data-leg-index="${i}"]`);
        if (!methodSelect) return;
        methodSelect.value = legPreset.method;
        updateSimLegParams(i, legPreset.method);

        setTimeout(() => {
            const card = document.querySelectorAll('#simLegConfigSection > div > div')[i];
            if (!card) return;
            const dirSelect = card.querySelector('.sim-leg-direction');
            if (dirSelect && legPreset.direction) dirSelect.value = legPreset.direction;
            const valInput = card.querySelector('.sim-leg-value');
            if (valInput && legPreset.value !== undefined) valInput.value = legPreset.value;
            const refSelect = card.querySelector('.sim-leg-ref');
            if (refSelect && legPreset.ref !== undefined) refSelect.value = legPreset.ref;
        }, 20);
    });
}

let _payoffModalState = null;
let _payoffModalPlayTimer = null;

function showPayoffModal(positionId) {
    const pos = simOpenOptionPositions.find(p => p.id === positionId);
    if (!pos) return;

    const modal = document.getElementById('simPayoffModal');
    const strategyDiv = document.getElementById('simPayoffModalStrategy');
    const legsDiv = document.getElementById('simPayoffModalLegs');
    const statsDiv = document.getElementById('simPayoffModalStats');
    const canvas = document.getElementById('simPayoffCanvas');
    if (!modal || !canvas) return;

    strategyDiv.textContent = pos.strategy;
    legsDiv.innerHTML = pos.legs.map(leg => {
        const bgColor = leg.position === 'long' ? '#2962ff' : '#ff9800';
        return `<span style="background:${bgColor}; color:white; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600;">
            ${leg.position.charAt(0).toUpperCase()}${leg.position.slice(1)} ${leg.type} $${leg.strike} @ $${leg.entryPrice.toFixed(2)}</span>`;
    }).join('');

    const strikes = pos.legs.map(l => l.strike);
    const premiums = pos.legs.map(l => l.entryPrice);
    const quantity = pos.remainingQuantity;
    const multiplier = 100;

    const allStrikes = [...strikes].sort((a, b) => a - b);
    const minStrike = allStrikes[0];
    const maxStrike = allStrikes[allStrikes.length - 1];
    // Anchor the chart range to the underlying price as well as the strikes.
    // Using just (maxStrike - minStrike) collapses to ~$10 for single-leg or
    // single-strike positions, which makes a long-call payoff look bounded
    // and triggers the magnitude-based "Unlimited" check incorrectly.
    const underlyingAnchor = pos.underlyingAtEntry || allStrikes[0];
    const strikeSpan = maxStrike - minStrike;
    const range = Math.max(strikeSpan, underlyingAnchor * 0.05, 10);
    const padFactor = strikeSpan > 0 ? 0.6 : 1.5;
    const priceMin = Math.max(0.01, Math.min(minStrike, underlyingAnchor) - range * padFactor);
    const priceMax = Math.max(maxStrike, underlyingAnchor) + range * padFactor;
    const step = (priceMax - priceMin) / 300;

    // Slope-based "unlimited" detection: as price → ∞ only call legs have
    // non-zero slope, and as price → 0 only put legs do. A truly unbounded
    // profit/loss must come from a net long/short call position. Net put
    // exposure is large but bounded (capped at price = 0), so we display the
    // computed value rather than calling it Unlimited.
    let netCallContracts = 0;
    let netPutContracts = 0;
    pos.legs.forEach(leg => {
        const sign = leg.position === 'long' ? 1 : -1;
        if (leg.type === 'C') netCallContracts += sign;
        else netPutContracts += sign;
    });

    const payoffPoints = [];
    let maxProfit = -Infinity;
    let maxLoss = Infinity;

    const isCalDiag = isSimCalendarDiagonalStrategy(pos.strategy);
    let nearExpT = 0, farLegIVs = [];
    if (isCalDiag) {
        const nearExp = pos.expiration;
        const r = 0.045, q = 0.013;
        pos.legs.forEach(leg => {
            const legExp = leg.expiration || pos.expiration;
            if (legExp > nearExp) {
                const nParts = nearExp.split('-'), fParts = legExp.split('-');
                const nearMs = Date.UTC(parseInt(nParts[0]), parseInt(nParts[1]) - 1, parseInt(nParts[2]), 20, 0, 0);
                const farMs = Date.UTC(parseInt(fParts[0]), parseInt(fParts[1]) - 1, parseInt(fParts[2]), 20, 0, 0);
                const remainT = Math.max((farMs - nearMs) / (365.25 * 24 * 3600 * 1000), 1 / (365.25 * 24 * 60));
                const entryIV = (leg.entryGreeks && leg.entryGreeks.iv) ? leg.entryGreeks.iv : 0.25;
                farLegIVs.push({ legIdx: pos.legs.indexOf(leg), T: remainT, iv: entryIV });
            }
        });
    }

    for (let price = priceMin; price <= priceMax; price += step) {
        let totalPayoff = 0;
        pos.legs.forEach((leg, i) => {
            const K = strikes[i];
            const prem = premiums[i];
            const farInfo = isCalDiag ? farLegIVs.find(f => f.legIdx === i) : null;
            if (farInfo && price > 0) {
                const optType = leg.type === 'C' ? 'call' : 'put';
                const bsVal = BSCalc.price(Math.max(price, 0.01), K, farInfo.T, 0.045, 0.013, farInfo.iv, optType);
                const legPnl = leg.position === 'long' ? (bsVal - prem) : (prem - bsVal);
                totalPayoff += (Number.isFinite(legPnl) ? legPnl : 0) * multiplier * quantity;
            } else if (farInfo) {
                if (leg.position === 'long') totalPayoff += (-prem) * multiplier * quantity;
                else totalPayoff += (prem) * multiplier * quantity;
            } else {
                let intrinsic = 0;
                if (leg.type === 'C') intrinsic = Math.max(0, price - K);
                else intrinsic = Math.max(0, K - price);
                if (leg.position === 'long') totalPayoff += (intrinsic - prem) * multiplier * quantity;
                else totalPayoff += (prem - intrinsic) * multiplier * quantity;
            }
        });
        payoffPoints.push({ price, payoff: totalPayoff });
        if (totalPayoff > maxProfit) maxProfit = totalPayoff;
        if (totalPayoff < maxLoss) maxLoss = totalPayoff;
    }

    const breakevens = [];
    for (let i = 1; i < payoffPoints.length; i++) {
        const prev = payoffPoints[i - 1], curr = payoffPoints[i];
        if ((prev.payoff <= 0 && curr.payoff > 0) || (prev.payoff >= 0 && curr.payoff < 0)) {
            const ratio = Math.abs(prev.payoff) / (Math.abs(prev.payoff) + Math.abs(curr.payoff));
            breakevens.push((prev.price + (curr.price - prev.price) * ratio).toFixed(2));
        }
    }

    // Calendar/diagonal payoffs are evaluated at the near expiration with
    // Black-Scholes pricing on far legs, so they are always bounded.
    const isMaxProfitUnlimited = !isCalDiag && netCallContracts > 0;
    const isMaxLossUnlimited = !isCalDiag && netCallContracts < 0;

    statsDiv.innerHTML = `
        <div style="text-align:center;">
            <div style="font-size:10px; color:#6a6d78; margin-bottom:2px;">Max Profit</div>
            <div style="font-size:16px; font-weight:700; color:#089981;">${isMaxProfitUnlimited ? 'Unlimited' : '$' + maxProfit.toFixed(0)}</div>
        </div>
        <div style="text-align:center;">
            <div style="font-size:10px; color:#6a6d78; margin-bottom:2px;">Max Loss</div>
            <div style="font-size:16px; font-weight:700; color:#f23645;">${isMaxLossUnlimited ? 'Unlimited' : '$' + maxLoss.toFixed(0)}</div>
        </div>
        ${breakevens.length > 0 ? `<div style="text-align:center;">
            <div style="font-size:10px; color:#6a6d78; margin-bottom:2px;">Breakeven${breakevens.length > 1 ? 's' : ''}</div>
            <div style="font-size:16px; font-weight:700; color:#191919;">${breakevens.join(', ')}</div>
        </div>` : ''}
        <div style="text-align:center;">
            <div style="font-size:10px; color:#6a6d78; margin-bottom:2px;">Contracts</div>
            <div style="font-size:16px; font-weight:700; color:#191919;">${quantity}</div>
        </div>
    `;

    _payoffModalState = {
        positionId, payoffPoints, strikes, breakevens,
        priceMin, priceMax, maxProfit, maxLoss,
        entryPrice: pos.underlyingAtEntry
    };

    modal.style.display = 'flex';

    requestAnimationFrame(() => refreshPayoffModal());
}

function refreshPayoffModal() {
    const st = _payoffModalState;
    if (!st) return;
    const modal = document.getElementById('simPayoffModal');
    if (!modal || modal.style.display === 'none') return;

    const pos = simOpenOptionPositions.find(p => p.id === st.positionId);
    const currentBar = simMinuteBarsCache[simCurrentMinuteIndex - 1];
    const currentUnderlyingPrice = currentBar ? currentBar.close : st.entryPrice;

    const pnlDiv = document.getElementById('simPayoffModalCurrentPnl');
    if (pnlDiv && pos) {
        const currentTimestamp = currentBar ? currentBar.timestamp : Date.now();
        const livePnl = calculateOptionPositionPnl(pos, currentTimestamp);
        const isPos = livePnl >= 0;
        const pnlColor = isPos ? '#089981' : '#f23645';
        const pnlSign = isPos ? '+' : '';
        const priceChange = currentUnderlyingPrice - st.entryPrice;
        const priceChangeSign = priceChange >= 0 ? '+' : '';
        const priceChangePct = ((priceChange / st.entryPrice) * 100).toFixed(2);

        pnlDiv.innerHTML = `
            <div style="flex:1;">
                <div style="font-size:10px; color:#6a6d78;">Underlying</div>
                <div style="font-size:15px; font-weight:700; color:#191919;">$${currentUnderlyingPrice.toFixed(2)}
                    <span style="font-size:11px; color:${priceChange >= 0 ? '#089981' : '#f23645'};">(${priceChangeSign}${priceChangePct}%)</span>
                </div>
            </div>
            <div style="flex:1; text-align:right;">
                <div style="font-size:10px; color:#6a6d78;">Current P&L</div>
                <div style="font-size:18px; font-weight:700; color:${pnlColor};">${pnlSign}$${livePnl.toFixed(2)}</div>
            </div>`;
    } else if (pnlDiv) {
        pnlDiv.innerHTML = `
            <div style="flex:1;">
                <div style="font-size:10px; color:#6a6d78;">Underlying</div>
                <div style="font-size:15px; font-weight:700; color:#191919;">$${currentUnderlyingPrice.toFixed(2)}</div>
            </div>
            <div style="flex:1; text-align:right;">
                <div style="font-size:10px; color:#6a6d78;">Current P&L</div>
                <div style="font-size:14px; color:#6a6d78;">Position closed</div>
            </div>`;
    }

    const barLabel = document.getElementById('simPayoffBarLabel');
    if (barLabel && currentBar) {
        const d = new Date(currentBar.timestamp);
        const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        barLabel.textContent = `Bar ${simCurrentMinuteIndex} / ${simMinuteBarsCache.length} \u2022 ${timeStr}`;
    }

    const canvas = document.getElementById('simPayoffCanvas');
    if (canvas) {
        drawPayoffCanvas(canvas, st.payoffPoints, st.strikes, st.breakevens, st.priceMin, st.priceMax, st.maxProfit, st.maxLoss, currentUnderlyingPrice, st.entryPrice);
    }
}

function payoffModalAdvanceBar(direction) {
    const skipMinutes = getAdvanceStepBars();
    if (direction > 0 && simCurrentMinuteIndex < simMinuteBarsCache.length) {
        simCurrentMinuteIndex = Math.min(simMinuteBarsCache.length, simCurrentMinuteIndex + skipMinutes);
    } else if (direction < 0 && simCurrentMinuteIndex > simTradingStartMinuteIndex) {
        simCurrentMinuteIndex = Math.max(simTradingStartMinuteIndex, simCurrentMinuteIndex - skipMinutes);
    } else {
        return;
    }
    rebuildBarsForCurrentTimeframe();
    updateChartData();
    updateUnrealizedPnl();
    updateOptionsPnlDisplay();
    checkOptionTpSlThresholds();
    updateNavigationButtons();
    updatePositionLines();
    updatePnlShading();
    if (!simUserHasDragged) lwChart?.timeScale().scrollToPosition(5, false);
    refreshPayoffModal();
}

function payoffModalNextBar() {
    stopPayoffModalPlay();
    payoffModalAdvanceBar(1);
}

function payoffModalPrevBar() {
    stopPayoffModalPlay();
    payoffModalAdvanceBar(-1);
}

function payoffModalTogglePlay() {
    if (_payoffModalPlayTimer) {
        stopPayoffModalPlay();
    } else {
        const speed = parseInt(document.getElementById('simPayoffSpeed')?.value) || 500;
        const icon = document.getElementById('simPayoffPlayIcon');
        if (icon) icon.className = 'fas fa-pause';
        _payoffModalPlayTimer = setInterval(() => {
            if (simCurrentMinuteIndex >= simMinuteBarsCache.length) {
                stopPayoffModalPlay();
                return;
            }
            payoffModalAdvanceBar(1);
        }, speed);
    }
}

function stopPayoffModalPlay() {
    if (_payoffModalPlayTimer) { clearInterval(_payoffModalPlayTimer); _payoffModalPlayTimer = null; }
    const icon = document.getElementById('simPayoffPlayIcon');
    if (icon) icon.className = 'fas fa-play';
}

async function payoffModalClosePosition() {
    const st = _payoffModalState;
    if (!st) return;
    const pos = simOpenOptionPositions.find(p => p.id === st.positionId);
    if (!pos) return;
    const confirmed = await appConfirm(`Close entire ${pos.strategy} position (${pos.remainingQuantity} contracts)?`);
    if (!confirmed) return;
    stopPayoffModalPlay();
    closeOptionPosition(pos.id, null, 'Manual');
    closePayoffModal();
}

function drawPayoffCanvas(canvas, payoffPoints, strikes, breakevens, priceMin, priceMax, maxProfit, maxLoss, currentPrice, entryPrice) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const pad = { top: 25, right: 25, bottom: 45, left: 60 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fafbfc';
    ctx.fillRect(0, 0, w, h);

    const payoffMin = Math.min(maxLoss, 0) * 1.15;
    const payoffMax2 = Math.max(maxProfit, 0) * 1.15;
    const payoffRange = payoffMax2 - payoffMin || 1;

    const toX = (price) => pad.left + ((price - priceMin) / (priceMax - priceMin)) * cw;
    const toY = (val) => pad.top + ch - ((val - payoffMin) / payoffRange) * ch;

    ctx.strokeStyle = '#e8eaef';
    ctx.lineWidth = 1;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = '#999';
    ctx.textAlign = 'right';
    const gridLines = 6;
    for (let i = 0; i <= gridLines; i++) {
        const val = payoffMin + (payoffRange * i / gridLines);
        const y = toY(val);
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
        ctx.fillText('$' + Math.round(val), pad.left - 8, y + 4);
    }

    const zeroY = toY(0);
    if (zeroY >= pad.top && zeroY <= pad.top + ch) {
        ctx.strokeStyle = '#aaa';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(w - pad.right, zeroY); ctx.stroke();
        ctx.setLineDash([]);
    }

    const profitGrad = ctx.createLinearGradient(0, toY(maxProfit), 0, zeroY);
    profitGrad.addColorStop(0, 'rgba(8, 153, 129, 0.25)');
    profitGrad.addColorStop(1, 'rgba(8, 153, 129, 0.02)');
    ctx.fillStyle = profitGrad;
    ctx.beginPath();
    ctx.moveTo(toX(payoffPoints[0].price), zeroY);
    payoffPoints.forEach(p => ctx.lineTo(toX(p.price), p.payoff >= 0 ? toY(p.payoff) : zeroY));
    ctx.lineTo(toX(payoffPoints[payoffPoints.length - 1].price), zeroY);
    ctx.closePath(); ctx.fill();

    const lossGrad = ctx.createLinearGradient(0, zeroY, 0, toY(maxLoss));
    lossGrad.addColorStop(0, 'rgba(242, 54, 69, 0.02)');
    lossGrad.addColorStop(1, 'rgba(242, 54, 69, 0.2)');
    ctx.fillStyle = lossGrad;
    ctx.beginPath();
    ctx.moveTo(toX(payoffPoints[0].price), zeroY);
    payoffPoints.forEach(p => ctx.lineTo(toX(p.price), p.payoff < 0 ? toY(p.payoff) : zeroY));
    ctx.lineTo(toX(payoffPoints[payoffPoints.length - 1].price), zeroY);
    ctx.closePath(); ctx.fill();

    ctx.strokeStyle = '#089981';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    payoffPoints.forEach((p, i) => {
        const x = toX(p.price); const y = toY(p.payoff);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = '11px system-ui, sans-serif';
    strikes.forEach((K) => {
        const x = toX(K);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#b0b4c0';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + ch); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#555';
        ctx.fillText('$' + K.toFixed(0), x, pad.top + ch + 16);
    });

    breakevens.forEach(be => {
        const x = toX(parseFloat(be));
        ctx.fillStyle = '#191919';
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.fillText('BE ' + be, x, pad.top - 6);
        ctx.setLineDash([2, 2]);
        ctx.strokeStyle = '#191919';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + ch); ctx.stroke();
        ctx.setLineDash([]);
    });

    if (currentPrice && currentPrice >= priceMin && currentPrice <= priceMax) {
        const cx = toX(currentPrice);
        ctx.strokeStyle = '#2962ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        ctx.beginPath(); ctx.moveTo(cx, pad.top); ctx.lineTo(cx, pad.top + ch); ctx.stroke();
        ctx.setLineDash([]);

        let currentPayoff = 0;
        const closest = payoffPoints.reduce((prev, curr) =>
            Math.abs(curr.price - currentPrice) < Math.abs(prev.price - currentPrice) ? curr : prev
        );
        currentPayoff = closest.payoff;
        const cy = toY(currentPayoff);

        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fillStyle = currentPayoff >= 0 ? '#089981' : '#f23645';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#2962ff';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        const priceLabel = `Current $${currentPrice.toFixed(1)}`;
        const pnlLabel = `${currentPayoff >= 0 ? '+' : ''}$${currentPayoff.toFixed(0)}`;
        ctx.fillText(priceLabel, cx, pad.top + ch + 28);

        const labelBg = currentPayoff >= 0 ? '#089981' : '#f23645';
        const textW = ctx.measureText(pnlLabel).width + 10;
        const labelY = cy - 14;
        ctx.fillStyle = labelBg;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(cx - textW / 2, labelY - 8, textW, 16, 3);
        } else {
            ctx.rect(cx - textW / 2, labelY - 8, textW, 16);
        }
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.fillText(pnlLabel, cx, labelY + 4);
    }

    if (entryPrice && entryPrice >= priceMin && entryPrice <= priceMax && Math.abs(entryPrice - (currentPrice || 0)) > (priceMax - priceMin) * 0.02) {
        const ex = toX(entryPrice);
        ctx.strokeStyle = '#6a6d78';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(ex, pad.top); ctx.lineTo(ex, pad.top + ch); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#6a6d78';
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Entry $' + entryPrice.toFixed(1), ex, pad.top + ch + 28);
    }
}

function closePayoffModal() {
    stopPayoffModalPlay();
    _payoffModalState = null;
    const modal = document.getElementById('simPayoffModal');
    if (modal) modal.style.display = 'none';
}

window.showPayoffModal = showPayoffModal;
window.closePayoffModal = closePayoffModal;
window.applyLegPreset = applyLegPreset;
window.hideTradeToast = hideTradeToast;
window.payoffModalNextBar = payoffModalNextBar;
window.payoffModalPrevBar = payoffModalPrevBar;
window.payoffModalTogglePlay = payoffModalTogglePlay;
window.payoffModalClosePosition = payoffModalClosePosition;
window.closeOptionPosition = closeOptionPosition;
window.updatePositionTpSl = updatePositionTpSl;
window.closePositionPartial = closePositionPartial;
window.resumeSession = resumeSession;
window.endSessionFromCard = endSessionFromCard;
window.updateLegRefLabel = updateLegRefLabel;
window.initSimTradingActive = initSimTradingActive;
