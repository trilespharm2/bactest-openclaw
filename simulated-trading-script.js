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

let lwChart = null;
let lwCandleSeries = null;
let lwVolumeSeries = null;
let lwPositionLines = [];
let lwPnlShadingSeries = null;
let simUserHasDragged = false;
let simActiveSessionId = null;

const SIM_API_RATE_LIMIT = 3;
const SIM_API_RATE_WINDOW = 60000;
let simApiCallTimestamps = [];

async function waitForRateLimit() {
    while (true) {
        const now = Date.now();
        simApiCallTimestamps = simApiCallTimestamps.filter(ts => now - ts < SIM_API_RATE_WINDOW);
        if (simApiCallTimestamps.length < SIM_API_RATE_LIMIT) {
            simApiCallTimestamps.push(Date.now());
            return true;
        }
        const oldestCall = simApiCallTimestamps[0];
        const waitTime = SIM_API_RATE_WINDOW - (now - oldestCall) + 100;
        if (waitTime > 0) {
            updateLoadingStatus(`Rate limit: waiting ${Math.ceil(waitTime / 1000)}s...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
}

function parseETDateTime(dateStr, timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const testDateEST = new Date(`${dateStr}T${timeStr}:00-05:00`);
    const testDateEDT = new Date(`${dateStr}T${timeStr}:00-04:00`);
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
        const modeIcon = s.mode === 'options' ? 'fas fa-layer-group' : 'fas fa-chart-line';
        const modeLabel = s.mode === 'options' ? 'Options' : 'Stock';
        const pnlColor = (s.realizedPnl || 0) >= 0 ? '#089981' : '#f23645';
        const pnlStr = `${(s.realizedPnl || 0) >= 0 ? '+' : ''}$${(s.realizedPnl || 0).toFixed(2)}`;
        const trades = (s.closedTradesCount || 0);
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
            <div style="display: flex; gap: 20px; margin-bottom: 12px;">
              <div>
                <div style="font-size: 11px; color: #999;">Realized P&L</div>
                <div style="font-size: 14px; font-weight: 600; color: ${pnlColor};">${pnlStr}</div>
              </div>
              <div>
                <div style="font-size: 11px; color: #999;">Trades</div>
                <div style="font-size: 14px; font-weight: 600; color: #333;">${trades}</div>
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

    window._simPendingSession = {
        symbol, chartStartDate, chartEndDate, tradingStartDate, mode, balance,
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
        isNew: false,
        sessionIndex: index,
        savedState: session
    };

    if (typeof navigateToPage === 'function') {
        navigateToPage('simTradingActive');
    }
}

async function endSessionFromCard(index) {
    let activeSessions = [];
    try { activeSessions = JSON.parse(localStorage.getItem('simActiveSessions') || '[]'); } catch(e) {}
    if (index >= activeSessions.length) return;

    const session = activeSessions[index];
    if (!(await appConfirm('End session for ' + session.symbol + '? This will save results and remove the active session.'))) return;

    const hasOpenPositions = (session.openPosition != null) || (session.openOptionPositions && session.openOptionPositions.length > 0);
    if (hasOpenPositions) {
        await appAlert('This session has open positions. Please resume the session and close all positions before ending.');
        return;
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
        enrichedTrades = trades.map((t, i) => ({
            id: i + 1, strategy: t.strategy,
            legs: t.legs ? t.legs.map(l => l.name || `${l.type} ${l.strike}`).join(' / ') : '',
            quantity: t.quantity, entryPremium: t.totalEntryPremium,
            entryTime: t.entryTimestamp || '',
            exitTime: (t.closedParts && t.closedParts.length > 0) ? t.closedParts[t.closedParts.length - 1].exitTimestamp : '',
            expiration: t.expiration || '', pnl: t.realizedPnl || 0,
            exitReason: (t.closedParts && t.closedParts.length > 0) ? t.closedParts[t.closedParts.length - 1].reason : 'manual'
        }));
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

    window.addEventListener('beforeunload', function() {
        if (typeof simCurrentSymbol !== 'undefined' && simCurrentSymbol) {
            try { saveCurrentSessionState(); } catch(e) {}
        }
    });

    document.getElementById('simBackBtn')?.addEventListener('click', handleBackToConfig);
    document.getElementById('simPrevBar')?.addEventListener('click', showPreviousBar);
    document.getElementById('simNextBar')?.addEventListener('click', showNextBar);
    document.getElementById('simPlayPauseBtn')?.addEventListener('click', toggleAutoplay);
    document.getElementById('simResetViewBtn')?.addEventListener('click', resetViewToCurrentCandle);
    document.getElementById('simGotoDateBtn')?.addEventListener('click', gotoDateTime);
    document.getElementById('simBuyBtn')?.addEventListener('click', () => executeTrade('buy'));
    document.getElementById('simSellBtn')?.addEventListener('click', () => executeTrade('sell'));
    document.getElementById('simEndSessionBtn')?.addEventListener('click', handleEndSession);
    document.getElementById('simCloseAllBtn')?.addEventListener('click', handleCloseAll);
    document.getElementById('simOptionTradeBtn')?.addEventListener('click', executeOptionTrade);
    document.getElementById('simOptionStrategy')?.addEventListener('change', buildSimLegConfiguration);

    document.getElementById('simAutoplaySpeed')?.addEventListener('change', () => {
        if (simIsPlaying) { stopAutoplay(); startAutoplay(); }
    });

    document.querySelectorAll('.sim-tf-btn').forEach(btn => {
        btn.addEventListener('click', (e) => switchTimeframe(e.target.dataset.timeframe));
    });
}

function handleBackToConfig() {
    stopAutoplay();
    saveCurrentSessionState();
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
    if (!(await appConfirm('End this session and save results?'))) return;

    removeActiveSession();
    simCurrentSymbol = '';
    window._simPendingSession = null;

    if (trades.length === 0) {
        if (typeof navigateToPage === 'function') navigateToPage('simulatedTrading');
        return;
    }

    const sessionData = buildCurrentSessionData();
    saveCompletedSession(sessionData);

    window._pendingSimResultDetail = sessionData;
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
        enrichedTrades = simClosedOptionTrades.map((t, i) => ({
            id: i + 1, strategy: t.strategy,
            legs: t.legs ? t.legs.map(l => l.name || `${l.type} ${l.strike}`).join(' / ') : '',
            quantity: t.quantity, entryPremium: t.totalEntryPremium,
            entryTime: t.entryTimestamp || '',
            exitTime: (t.closedParts && t.closedParts.length > 0) ? t.closedParts[t.closedParts.length - 1].exitTimestamp : '',
            expiration: t.expiration || '', pnl: t.realizedPnl || 0,
            exitReason: (t.closedParts && t.closedParts.length > 0) ? t.closedParts[t.closedParts.length - 1].reason : 'manual'
        }));
    }

    return buildAnalyticsFromTrades(enrichedTrades, {
        symbol: simCurrentSymbol, mode: mode,
        initialBalance: simInitialBalance, realizedPnl: realizedPnl
    });
}

function saveCurrentSessionState() {
    if (!simCurrentSymbol || !simDataLoaded) return;
    const mode = window._simTradingMode || 'stock';
    const sessionState = {
        symbol: simCurrentSymbol,
        mode: mode,
        chartStartDate: simChartDates.start,
        chartEndDate: simChartDates.end,
        tradingStartDate: simChartDates.tradingStart,
        initialBalance: simInitialBalance,
        currentBalance: simInitialBalance + (mode === 'stock' ? simRealizedPnl : simOptionsRealizedPnl),
        realizedPnl: mode === 'stock' ? simRealizedPnl : simOptionsRealizedPnl,
        currentMinuteIndex: simCurrentMinuteIndex,
        currentTimeframe: simCurrentTimeframe,
        openPosition: simOpenPosition,
        closedTrades: simClosedTrades,
        closedTradesCount: (mode === 'stock' ? simClosedTrades : simClosedOptionTrades).length,
        optionsRealizedPnl: simOptionsRealizedPnl,
        openOptionPositions: simOpenOptionPositions.map(p => ({
            ...p,
            legs: p.legs.map(l => ({ ...l, optionBars: [] }))
        })),
        closedOptionTrades: simClosedOptionTrades.map(t => ({
            ...t,
            legs: t.legs ? t.legs.map(l => ({ ...l, optionBars: [] })) : []
        })),
        createdAt: simActiveSessionId || new Date().toISOString()
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

    const targetMinuteIndex = savedState.currentMinuteIndex || 0;
    simCurrentTimeframe = savedState.currentTimeframe || '1m';

    await loadSimulatedChart(targetMinuteIndex);
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

async function fetchMinuteBars(symbol, startDate, endDate) {
    await waitForRateLimit();
    const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? `http://${window.location.hostname}:${window.location.port}/api` : '/api';
    try {
        const response = await fetch(`${apiUrl}/simulated-trading/bars`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ symbol, start_date: startDate, end_date: endDate, bar_size: 'minute', multiplier: 1 })
        });
        if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'Failed to fetch data'); }
        const data = await response.json();
        return data.bars || [];
    } catch (error) {
        console.error('Error fetching 1m data:', error);
        return null;
    }
}

function aggregateBars(minuteBars, targetMinutes) {
    if (!minuteBars || minuteBars.length === 0) return [];
    if (targetMinutes === 1) return minuteBars;
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
    if (targetMinutes === 1) {
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

async function loadSimulatedChart(restoreMinuteIndex = null) {
    stopAutoplay();
    showLoader(true, 'Loading chart data...', '');

    try {
        const rawMinuteBars = await fetchMinuteBars(simCurrentSymbol, simChartDates.start, simChartDates.end);
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
        console.log(`Fetched ${minuteBars.length} 1-minute bars`);

        showLoader(true, 'Computing timeframes...', '0 / 7');
        computeAllTimeframes(simChartDates.tradingStart, restoreMinuteIndex);
    } catch (error) {
        console.error('Error loading chart:', error);
        simDataLoaded = false;
        appAlert('Error loading chart: ' + error.message);
        showLoader(false);
    }
}

function computeAllTimeframes(tradingStartDate, restoreMinuteIndex = null) {
    for (const tf of SIM_TIMEFRAMES) {
        updateLoadingStatus(`Computing ${SIM_TIMEFRAME_CONFIG[tf].label}...`);
        const targetMinutes = TIMEFRAME_MINUTES[tf];
        simTimeframeData[tf] = aggregateBars(simMinuteBarsCache, targetMinutes);
        simLoadedTimeframes++;
        updateTimeframeButtons();
    }

    const tradingStartTs = tradingStartDate.includes('T')
        ? new Date(tradingStartDate).getTime()
        : parseETDateTime(tradingStartDate, '09:31');
    simTradingStartMinuteIndex = simMinuteBarsCache.findIndex(bar => bar.timestamp >= tradingStartTs);
    if (simTradingStartMinuteIndex === -1) {
        const dayStartTs = new Date(tradingStartDate + 'T00:00:00').getTime();
        simTradingStartMinuteIndex = simMinuteBarsCache.findIndex(bar => bar.timestamp >= dayStartTs);
        if (simTradingStartMinuteIndex === -1) simTradingStartMinuteIndex = simMinuteBarsCache.length;
    }

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

function rebuildBarsForCurrentTimeframe() {
    const targetMinutes = TIMEFRAME_MINUTES[simCurrentTimeframe];
    simAllBars = simTimeframeData[simCurrentTimeframe] || [];
    simVisibleBars = aggregateBarsUpToMinute(simMinuteBarsCache, targetMinutes, simCurrentMinuteIndex);
    const tradingStartTs = simChartDates.tradingStart.includes('T')
        ? new Date(simChartDates.tradingStart).getTime()
        : parseETDateTime(simChartDates.tradingStart, '09:31');
    simTradingStartIndex = simAllBars.findIndex(bar => bar.timestamp >= tradingStartTs);
    if (simTradingStartIndex === -1) {
        const dayStartTs = new Date(simChartDates.tradingStart + 'T00:00:00').getTime();
        simTradingStartIndex = simAllBars.findIndex(bar => bar.timestamp >= dayStartTs);
        if (simTradingStartIndex === -1) simTradingStartIndex = 0;
    }
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
        timeScale: {
            borderColor: '#d1d4dc',
            timeVisible: true,
            secondsVisible: false,
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

    lwChart.timeScale().subscribeVisibleLogicalRangeChange(() => {
        if (lwChart && lwChart._userScrolling) {
            simUserHasDragged = true;
        }
    });

    container.addEventListener('mousedown', () => { if (lwChart) lwChart._userScrolling = true; });
    container.addEventListener('mouseup', () => { if (lwChart) lwChart._userScrolling = false; });
    container.addEventListener('touchstart', () => { if (lwChart) lwChart._userScrolling = true; });
    container.addEventListener('touchend', () => { if (lwChart) lwChart._userScrolling = false; });
    container.addEventListener('wheel', () => { simUserHasDragged = true; }, { passive: true });

    new ResizeObserver(entries => {
        if (!lwChart) return;
        const { width, height } = entries[0].contentRect;
        lwChart.applyOptions({ width, height });
    }).observe(container);
}

function destroyLWChart() {
    if (lwChart) {
        lwChart.remove();
        lwChart = null;
        lwCandleSeries = null;
        lwVolumeSeries = null;
        lwPositionLines = [];
        lwPnlShadingSeries = null;
    }
}

function updateChartData() {
    if (!lwCandleSeries || !lwVolumeSeries) return;
    if (simVisibleBars.length === 0) return;

    const candleData = simVisibleBars.map(bar => ({
        time: Math.floor(bar.timestamp / 1000),
        open: bar.open, high: bar.high, low: bar.low, close: bar.close
    }));

    const volumeData = simVisibleBars.map(bar => ({
        time: Math.floor(bar.timestamp / 1000),
        value: bar.volume || 0,
        color: bar.close >= bar.open ? 'rgba(8,153,129,0.4)' : 'rgba(242,54,69,0.4)'
    }));

    lwCandleSeries.setData(candleData);
    lwVolumeSeries.setData(volumeData);
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
    for (let i = entryBarIdx; i < simVisibleBars.length; i++) {
        const bar = simVisibleBars[i];
        data.push({
            time: Math.floor(bar.timestamp / 1000),
            value: bar.close
        });
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
    document.querySelectorAll('.sim-tf-btn').forEach(btn => {
        const tf = btn.dataset.timeframe;
        const hasData = simTimeframeData[tf] && simTimeframeData[tf].length > 0;
        const isActive = tf === simCurrentTimeframe;
        btn.classList.toggle('active', isActive);
        btn.disabled = !hasData;
        btn.style.opacity = hasData ? '1' : '0.3';
    });
}

function showNextBar() {
    stopAutoplay();
    const skipMinutes = parseInt(document.getElementById('simSkipBars')?.value) || 1;
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
        if (!simUserHasDragged) {
            lwChart?.timeScale().scrollToPosition(5, false);
        }
    }
}

function showPreviousBar() {
    stopAutoplay();
    const skipMinutes = parseInt(document.getElementById('simSkipBars')?.value) || 1;
    if (simCurrentMinuteIndex > simTradingStartMinuteIndex) {
        simCurrentMinuteIndex = Math.max(simTradingStartMinuteIndex, simCurrentMinuteIndex - skipMinutes);
        rebuildBarsForCurrentTimeframe();
        updateChartData();
        updateUnrealizedPnl();
        updateOptionsPnlDisplay();
        checkOptionTpSlThresholds();
        updateNavigationButtons();
        updatePositionLines();
        updatePnlShading();
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
    const interval = parseInt(document.getElementById('simAutoplayInterval')?.value) || 1;
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

function gotoDateTime() {
    const gotoDateValue = document.getElementById('simGotoDate')?.value.trim();
    const gotoTimeValue = document.getElementById('simGotoTime')?.value.trim();

    let targetDateStr;
    let targetTime = '09:30';

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

    if (gotoTimeValue) {
        const timeParts = gotoTimeValue.match(/^(\d{1,2}):(\d{2})$/);
        if (!timeParts) { appAlert('Please enter time in HH:MM format'); return; }
        targetTime = `${timeParts[1].padStart(2, '0')}:${timeParts[2]}`;
    }

    const targetTimestamp = parseETDateTime(targetDateStr, targetTime);
    let targetMinuteIndex = -1;
    for (let i = simTradingStartMinuteIndex; i < simMinuteBarsCache.length; i++) {
        if (simMinuteBarsCache[i].timestamp >= targetTimestamp) { targetMinuteIndex = i + 1; break; }
    }

    if (targetMinuteIndex === -1) {
        if (simMinuteBarsCache.length > 0 && simMinuteBarsCache[simMinuteBarsCache.length - 1].timestamp < targetTimestamp) {
            targetMinuteIndex = simMinuteBarsCache.length;
        } else { appAlert('Date/time not found in the available data range'); return; }
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
            timeStr = `${hours}:${mins}`;
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
        if (simOpenPosition && simVisibleBars.length > 0) {
            const currentBar = simVisibleBars[simVisibleBars.length - 1];
            const unrealizedPnl = calculatePositionPnl(simOpenPosition, currentBar.close);
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
    'Short Strangle': [{name: 'Short Call', type: 'C', position: 'short'}, {name: 'Short Put', type: 'P', position: 'short'}]
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

    legs.forEach((leg, index) => {
        const badgeColor = leg.type === 'C' ? '#3b7cff' : '#f4a261';
        const positionBadge = leg.position === 'long' ? '#089981' : '#f23645';
        const legDirection = getLegDirectionRequirement(strategy, index);
        const dirLabel = legDirection ? legDirection : 'from';

        html += `
            <div style="background: #f8f9fd; border: 1px solid #e0e3eb; border-radius: 6px; padding: 8px; min-width: 190px;">
                <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 6px;">
                    <span style="font-weight: 600; color: #191919; font-size: 11px;">Leg ${index + 1}: ${leg.name}</span>
                    <span style="background: ${badgeColor}; color: white; padding: 1px 5px; border-radius: 3px; font-size: 9px;">${leg.type === 'C' ? 'Call' : 'Put'}</span>
                    <span style="background: ${positionBadge}; color: white; padding: 1px 5px; border-radius: 3px; font-size: 9px;">${leg.position}</span>
                </div>
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

    const buildDirectionDropdown = (legIdx, methodType = '') => {
        const dirRequired = getLegDirectionRequirement(strategy, legIdx);
        const defaultDir = dirRequired || 'below';
        return `<div style="display: flex; align-items: center; gap: 3px;">
            <label style="font-size: 10px; color: #6a6d78; white-space: nowrap; cursor: help;" title="Direction: Where to place the strike relative to the reference price (above or below the underlying or another leg's strike).">Dir:</label>
            <select class="sim-leg-direction" data-leg="${legIdx}" style="${inputStyle} width: 70px;">
                <option value="above" ${defaultDir === 'above' ? 'selected' : ''}>above</option>
                <option value="below" ${defaultDir === 'below' ? 'selected' : ''}>below</option>
            </select></div>`;
    };

    switch (method) {
        case 'exact_strike':
            html = `<div style="display:flex;align-items:center;gap:3px;"><label style="font-size:10px;color:#6a6d78;">Strike:</label>
                <input type="number" class="sim-leg-strike" data-leg="${legIndex}" placeholder="633" step="1" style="${inputStyle} width:65px;"></div>
                <div style="display:flex;align-items:center;gap:3px;"><label style="font-size:10px;color:#6a6d78;cursor:help;" title="Fallback: When the exact strike isn't available, how to pick the nearest one. Closest = nearest available, Higher = next strike up, Lower = next strike down, Exactly = fail if not found.">FB:</label>
                <select class="sim-leg-fallback" data-leg="${legIndex}" style="${inputStyle} width:75px;">
                <option value="closest">Closest</option><option value="higher">Higher</option><option value="lower">Lower</option><option value="exactly">Exactly</option></select></div>`;
            break;
        case 'dollar_underlying':
            html = `${buildDirectionDropdown(legIndex)}
                <div style="display:flex;align-items:center;gap:3px;"><label style="font-size:10px;color:#6a6d78;">$:</label>
                <input type="number" class="sim-leg-value" data-leg="${legIndex}" data-param="value" value="0" step="1" min="0" style="${inputStyle} width:55px;"></div>
                <div style="display:flex;align-items:center;gap:3px;"><label style="font-size:10px;color:#6a6d78;cursor:help;" title="Fallback: When the exact strike isn't available, how to pick the nearest one. Closest = nearest available, Higher = next strike up, Lower = next strike down.">FB:</label>
                <select class="sim-leg-fallback" data-leg="${legIndex}" style="${inputStyle} width:75px;">
                <option value="closest">Closest</option><option value="higher">Higher</option><option value="lower">Lower</option></select></div>`;
            break;
        case 'pct_underlying':
            html = `${buildDirectionDropdown(legIndex)}
                <div style="display:flex;align-items:center;gap:3px;"><label style="font-size:10px;color:#6a6d78;">%:</label>
                <input type="number" class="sim-leg-value" data-leg="${legIndex}" data-param="value" value="0" step="0.5" min="0" style="${inputStyle} width:55px;"></div>
                <div style="display:flex;align-items:center;gap:3px;"><label style="font-size:10px;color:#6a6d78;cursor:help;" title="Fallback: When the exact strike isn't available, how to pick the nearest one. Closest = nearest available, Higher = next strike up, Lower = next strike down.">FB:</label>
                <select class="sim-leg-fallback" data-leg="${legIndex}" style="${inputStyle} width:75px;">
                <option value="closest">Closest</option><option value="higher">Higher</option><option value="lower">Lower</option></select></div>`;
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

    const dte = parseInt(document.getElementById('simOptionDTE')?.value) || 0;
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
    if (dte === 0 && (etHour * 60 + etMinute) >= 960) {
        appAlert('Cannot open 0DTE trades after 4:00 PM ET.');
        return;
    }

    const expirationDate = new Date(entryDate);
    expirationDate.setDate(expirationDate.getDate() + dte);
    const expDateStr = expirationDate.toISOString().split('T')[0];
    const startDateStr = entryDate.toISOString().split('T')[0];

    const tradeBtn = document.getElementById('simOptionTradeBtn');
    if (tradeBtn) { tradeBtn.disabled = true; tradeBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Loading...'; }

    try {
        const resolvedStrikes = [];
        const positionLegs = [];

        for (let i = 0; i < legConfigs.length; i++) {
            const legConfig = legConfigs[i];
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

            const optionData = await fetchOptionBars(simCurrentSymbol, legConfig.type, expDateStr, startDateStr, simChartDates.end, detectionBar, legConfig, underlyingPrice);
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
                entryBarTimestamp: entryBar.timestamp, optionBars: optionData.bars, optionSymbol: optionData.optionSymbol
            });
        }

        const spreadErr = validateSimSpreadStrikes(strategy, positionLegs);
        if (spreadErr) { appAlert(spreadErr); return; }

        let totalEntryPremium = 0;
        positionLegs.forEach(leg => {
            const premium = leg.entryPrice * 100 * quantity;
            totalEntryPremium += leg.position === 'long' ? -premium : premium;
        });

        const position = {
            id: Date.now(), strategy, legs: positionLegs, expiration: expDateStr,
            quantity, remainingQuantity: quantity, totalEntryPremium,
            entryTimestamp, entryMinuteIndex: simCurrentMinuteIndex,
            underlyingAtEntry: underlyingPrice, tp, sl, tpType, slType, detectionBar,
            status: 'open', closedParts: [], realizedPnl: 0
        };

        simOpenOptionPositions.push(position);
        updateOptionsPnlDisplay();
        updateOptionsPositionsCard();
        updatePositionLines();
    } catch (error) {
        console.error('Error opening option position:', error);
        appAlert('Error opening option position: ' + error.message);
    } finally {
        if (tradeBtn) { tradeBtn.disabled = false; tradeBtn.innerHTML = '<i class="fas fa-bolt me-1"></i>Trade'; }
    }
}

async function fetchOptionBars(symbol, optionType, expDate, startDate, endDate, multiplier, legConfig, underlyingPrice) {
    await waitForRateLimit();
    const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? `http://${window.location.hostname}:${window.location.port}/api` : '/api';
    const requestBody = {
        symbol, option_type: optionType, expiration_date: expDate,
        start_date: startDate, end_date: endDate, multiplier,
        underlying_price: underlyingPrice, strike_method: legConfig.method,
        method_value: legConfig.value || 0, fallback: legConfig.fallback || 'closest'
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
    if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'Failed to fetch option data'); }
    const data = await response.json();
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

    for (const leg of pos.legs) {
        let optionBar = findClosestOptionBar(leg.optionBars, currentTimestamp);
        if (!optionBar && leg.optionBars.length > 0) optionBar = leg.optionBars[leg.optionBars.length - 1];
        if (!optionBar) { legExitPrices.push({ leg: leg.name, price: leg.entryPrice }); continue; }
        const exitPrice = optionBar.vwap || optionBar.close;
        legExitPrices.push({ leg: leg.name, price: exitPrice });
        pnl += (leg.position === 'long' ? (exitPrice - leg.entryPrice) : (leg.entryPrice - exitPrice)) * 100 * qtyToClose;
    }

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

        const legsHtml = pos.legs.map(leg => {
            const optionBar = findClosestOptionBar(leg.optionBars, currentTimestamp);
            const currentPrice = optionBar ? (optionBar.vwap || optionBar.close) : leg.entryPrice;
            return `<span style="background: ${leg.position === 'long' ? '#2962ff' : '#ff9800'}; color: white; padding: 1px 5px; border-radius: 3px; font-size: 9px; margin-right: 3px;">
                ${leg.position.charAt(0).toUpperCase()} ${leg.type} $${leg.strike} @ $${currentPrice.toFixed(2)}</span>`;
        }).join('');

        html += `
        <div style="background: #f8f9fd; border: 1px solid #e0e3eb; border-radius: 6px; padding: 8px; margin-bottom: 6px;" id="pos-card-${pos.id}">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="font-weight: 600; color: #191919; font-size: 12px;">${pos.strategy} <span style="color: #6a6d78; font-weight: 400;">${pos.remainingQuantity} contracts</span></span>
                <span style="font-weight: 600; color: ${isProfit ? '#089981' : '#f23645'}; font-size: 12px;">${pnlStr} (${pnlPct}%)</span>
            </div>
            <div style="margin-bottom: 4px;">${legsHtml}</div>
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
        { name: '$1 wide', legs: [
            { method: 'dollar_leg', ref: 1, direction: 'below', value: 1 },
            { method: 'dollar_underlying', direction: 'below', value: 1 },
            { method: 'dollar_underlying', direction: 'above', value: 1 },
            { method: 'dollar_leg', ref: 2, direction: 'above', value: 1 }
        ]},
        { name: '$2 wide', legs: [
            { method: 'dollar_leg', ref: 1, direction: 'below', value: 2 },
            { method: 'dollar_underlying', direction: 'below', value: 1 },
            { method: 'dollar_underlying', direction: 'above', value: 1 },
            { method: 'dollar_leg', ref: 2, direction: 'above', value: 2 }
        ]},
        { name: '$5 wide', legs: [
            { method: 'dollar_leg', ref: 1, direction: 'below', value: 5 },
            { method: 'dollar_underlying', direction: 'below', value: 2 },
            { method: 'dollar_underlying', direction: 'above', value: 2 },
            { method: 'dollar_leg', ref: 2, direction: 'above', value: 5 }
        ]}
    ],
    'Short Iron Butterfly': [
        { name: '$1 wings', legs: [
            { method: 'dollar_underlying', direction: 'below', value: 1 },
            { method: 'dollar_underlying', direction: 'below', value: 0 },
            { method: 'dollar_underlying', direction: 'above', value: 0 },
            { method: 'dollar_underlying', direction: 'above', value: 1 }
        ]},
        { name: '$2 wings', legs: [
            { method: 'dollar_underlying', direction: 'below', value: 2 },
            { method: 'dollar_underlying', direction: 'below', value: 0 },
            { method: 'dollar_underlying', direction: 'above', value: 0 },
            { method: 'dollar_underlying', direction: 'above', value: 2 }
        ]}
    ],
    'Long Iron Condor': [
        { name: '$1 wide', legs: [
            { method: 'dollar_underlying', direction: 'below', value: 1 },
            { method: 'dollar_leg', ref: 0, direction: 'above', value: 1 },
            { method: 'dollar_underlying', direction: 'above', value: 1 },
            { method: 'dollar_leg', ref: 2, direction: 'below', value: 1 }
        ]}
    ],
    'Long Iron Butterfly': [
        { name: '$1 wings', legs: [
            { method: 'dollar_underlying', direction: 'below', value: 1 },
            { method: 'dollar_underlying', direction: 'below', value: 0 },
            { method: 'dollar_underlying', direction: 'above', value: 0 },
            { method: 'dollar_underlying', direction: 'above', value: 1 }
        ]}
    ],
    'Short Put Spread': [
        { name: '$1 wide', legs: [
            { method: 'dollar_underlying', direction: 'below', value: 1 },
            { method: 'dollar_leg', ref: 0, direction: 'below', value: 1 }
        ]},
        { name: '$2 wide', legs: [
            { method: 'dollar_underlying', direction: 'below', value: 1 },
            { method: 'dollar_leg', ref: 0, direction: 'below', value: 2 }
        ]}
    ],
    'Short Call Spread': [
        { name: '$1 wide', legs: [
            { method: 'dollar_underlying', direction: 'above', value: 1 },
            { method: 'dollar_leg', ref: 0, direction: 'above', value: 1 }
        ]},
        { name: '$2 wide', legs: [
            { method: 'dollar_underlying', direction: 'above', value: 1 },
            { method: 'dollar_leg', ref: 0, direction: 'above', value: 2 }
        ]}
    ],
    'Long Call Spread': [
        { name: '$1 wide', legs: [
            { method: 'dollar_underlying', direction: 'above', value: 1 },
            { method: 'dollar_leg', ref: 0, direction: 'above', value: 1 }
        ]}
    ],
    'Long Put Spread': [
        { name: '$1 wide', legs: [
            { method: 'dollar_underlying', direction: 'below', value: 1 },
            { method: 'dollar_leg', ref: 0, direction: 'below', value: 1 }
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
        { name: '$1 wide', legs: [
            { method: 'dollar_underlying', direction: 'above', value: 1 },
            { method: 'dollar_underlying', direction: 'below', value: 1 }
        ]}
    ],
    'Short Strangle': [
        { name: '$1 wide', legs: [
            { method: 'dollar_underlying', direction: 'above', value: 1 },
            { method: 'dollar_underlying', direction: 'below', value: 1 }
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

function showPayoffModal(positionId) {
    const pos = simOpenOptionPositions.find(p => p.id === positionId);
    if (!pos) return;

    const modal = document.getElementById('simPayoffModal');
    const strategyDiv = document.getElementById('simPayoffModalStrategy');
    const legsDiv = document.getElementById('simPayoffModalLegs');
    const statsDiv = document.getElementById('simPayoffModalStats');
    const canvas = document.getElementById('simPayoffCanvas');
    if (!modal || !canvas) return;

    const currentBar = simMinuteBarsCache[simCurrentMinuteIndex - 1];
    const currentUnderlyingPrice = currentBar ? currentBar.close : pos.underlyingAtEntry;

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
    const range = Math.max(maxStrike - minStrike, 10);
    const priceMin = minStrike - range * 0.6;
    const priceMax = maxStrike + range * 0.6;
    const step = (priceMax - priceMin) / 300;

    const payoffPoints = [];
    let maxProfit = -Infinity;
    let maxLoss = Infinity;

    for (let price = priceMin; price <= priceMax; price += step) {
        let totalPayoff = 0;
        pos.legs.forEach((leg, i) => {
            const K = strikes[i];
            const prem = premiums[i];
            let intrinsic = 0;
            if (leg.type === 'C') intrinsic = Math.max(0, price - K);
            else intrinsic = Math.max(0, K - price);
            if (leg.position === 'long') totalPayoff += (intrinsic - prem) * multiplier * quantity;
            else totalPayoff += (prem - intrinsic) * multiplier * quantity;
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

    const isMaxProfitUnlimited = maxProfit > range * multiplier * quantity * 3;
    const isMaxLossUnlimited = Math.abs(maxLoss) > range * multiplier * quantity * 3;

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

    modal.style.display = 'flex';

    requestAnimationFrame(() => {
        drawPayoffCanvas(canvas, payoffPoints, strikes, breakevens, priceMin, priceMax, maxProfit, maxLoss, currentUnderlyingPrice, pos.underlyingAtEntry);
    });
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
    const modal = document.getElementById('simPayoffModal');
    if (modal) modal.style.display = 'none';
}

window.showPayoffModal = showPayoffModal;
window.closePayoffModal = closePayoffModal;
window.applyLegPreset = applyLegPreset;
window.hideTradeToast = hideTradeToast;
window.closeOptionPosition = closeOptionPosition;
window.updatePositionTpSl = updatePositionTpSl;
window.closePositionPartial = closePositionPartial;
window.resumeSession = resumeSession;
window.endSessionFromCard = endSessionFromCard;
window.updateLegRefLabel = updateLegRefLabel;
window.initSimTradingActive = initSimTradingActive;
