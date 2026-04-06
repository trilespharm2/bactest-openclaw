let simResultSessions = [];
let simResultCurrentFilter = 'all';
let simResultDetailData = null;
let simResultEquityChart = null;
let simResultTradeLogPage = 1;
let simResultSortKey = 'updated';
let simResultSortDir = 'desc';
const SIM_TRADES_PER_PAGE = 15;

function initSimResultsPage() {
    console.log('Initializing Simulated Trading Results page');

    var signInLock = document.getElementById('simResultsSignInLock');
    var resultsContent = document.getElementById('simResultsContent');
    var authed = typeof window.isAuthenticated === 'function' ? window.isAuthenticated() : false;

    if (!authed) {
        if (signInLock) signInLock.style.display = '';
        if (resultsContent) resultsContent.style.display = 'none';
        return;
    }
    if (signInLock) signInLock.style.display = 'none';
    if (resultsContent) resultsContent.style.display = '';

    loadSimResultSessions();

    const tableCard = document.getElementById('simResultsTableCard');
    if (tableCard && tableCard.dataset.initialized) return;
    if (tableCard) tableCard.dataset.initialized = 'true';

    document.querySelectorAll('.sim-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.sim-filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            simResultCurrentFilter = e.target.dataset.filter;
            renderSimResultsGrid();
        });
    });

    const refreshBtn = document.getElementById('simResultsRefreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadSimResultSessions);

    if (typeof setupTableSorting === 'function') {
        setupTableSorting('simResultsTable', (key, dir) => {
            simResultSortKey = key;
            simResultSortDir = dir;
            renderSimResultsGrid();
        });
    }
}

function loadSimResultSessions() {
    try {
        simResultSessions = JSON.parse(localStorage.getItem('simTradingSessions') || '[]');
    } catch(e) { simResultSessions = []; }
    renderSimResultsGrid();
}

function simTimeAgo(dateStr) {
    if (!dateStr) return '-';
    let d = new Date(dateStr);
    if (!dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
        d = new Date(dateStr + 'Z');
    }
    const now = new Date();
    const diffMs = now - d;
    if (diffMs < 0 || diffMs < 60000) return 'just now';
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    if (days < 30) return days + 'd ago';
    return d.toLocaleDateString();
}

function simPnlClass(val) {
    if (val == null || isNaN(val)) return '';
    return val >= 0 ? 'text-success' : 'text-danger';
}

function simFormatPnl(val) {
    if (val == null || isNaN(val)) return '-';
    const sign = val >= 0 ? '+' : '-';
    return sign + '$' + Math.abs(val).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function simFormatPct(val) {
    if (val == null || isNaN(val)) return '-';
    return (val >= 0 ? '+' : '') + val.toFixed(1) + '%';
}

function simFormatCurrency(val) {
    if (val == null || isNaN(val)) return '-';
    const sign = val >= 0 ? '' : '-';
    return sign + '$' + Math.abs(val).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function renderSimResultsGrid() {
    const tableCard = document.getElementById('simResultsTableCard');
    const tbody = document.getElementById('simResultsBody');
    const empty = document.getElementById('simResultsEmpty');
    if (!tableCard || !tbody) return;

    let filtered = simResultSessions;
    if (simResultCurrentFilter !== 'all') {
        filtered = simResultSessions.filter(s => s.mode === simResultCurrentFilter);
    }

    if (filtered.length === 0) {
        tableCard.style.display = 'none';
        if (empty) empty.style.display = '';
        return;
    }

    if (empty) empty.style.display = 'none';
    tableCard.style.display = 'block';

    const sorted = [...filtered].sort((a, b) => {
        let va, vb;
        const sa = a.stats || {};
        const sb = b.stats || {};
        switch(simResultSortKey) {
            case 'symbol': va = (a.symbol || '').toLowerCase(); vb = (b.symbol || '').toLowerCase(); break;
            case 'mode': va = a.mode || ''; vb = b.mode || ''; break;
            case 'pnl': va = a.netPnl || 0; vb = b.netPnl || 0; break;
            case 'roe': {
                const iba = a.initialBalance || 1; const ibb = b.initialBalance || 1;
                va = (a.netPnl || 0) / iba * 100; vb = (b.netPnl || 0) / ibb * 100; break;
            }
            case 'max_drawdown': va = sa.maxDrawdown || 0; vb = sb.maxDrawdown || 0; break;
            case 'win_rate': va = sa.winRate || 0; vb = sb.winRate || 0; break;
            case 'avg_win': va = sa.avgWin || 0; vb = sb.avgWin || 0; break;
            case 'avg_loss': va = sa.avgLoss || 0; vb = sb.avgLoss || 0; break;
            case 'profit_factor': va = sa.profitFactor || 0; vb = sb.profitFactor || 0; break;
            case 'trades': va = sa.totalTrades || 0; vb = sb.totalTrades || 0; break;
            case 'avg_duration': va = sa.avgDurationMs || 0; vb = sb.avgDurationMs || 0; break;
            case 'updated': va = a.timestamp || ''; vb = b.timestamp || ''; break;
            default: va = a.timestamp || ''; vb = b.timestamp || '';
        }
        if (va < vb) return simResultSortDir === 'asc' ? -1 : 1;
        if (va > vb) return simResultSortDir === 'asc' ? 1 : -1;
        return 0;
    });

    tbody.innerHTML = sorted.map((session, idx) => {
        const s = session.stats || {};
        const modeLabel = session.mode === 'stock' ? 'Stock' : 'Options';
        const modeBadge = session.mode === 'stock'
            ? '<span class="badge" style="background:#3b7cff;font-size:11px;">Stock</span>'
            : '<span class="badge" style="background:#7c3aed;font-size:11px;">Options</span>';
        const pnl = session.netPnl;
        const ib = session.initialBalance || 1;
        const roe = (pnl || 0) / ib * 100;
        const maxDd = s.maxDrawdown;
        const winRate = s.winRate;
        const avgWin = s.avgWin;
        const avgLoss = s.avgLoss;
        const pf = s.profitFactor;
        const trades = s.totalTrades || 0;
        const avgDurMs = s.avgDurationMs || 0;
        const updated = session.timestamp;

        let avgDurLabel = '-';
        if (avgDurMs > 0) {
            const mins = Math.floor(avgDurMs / 60000);
            if (mins < 60) avgDurLabel = mins + 'm';
            else if (mins < 1440) avgDurLabel = Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
            else avgDurLabel = Math.floor(mins / 1440) + 'd ' + Math.floor((mins % 1440) / 60) + 'h';
        } else if (session.trades && session.trades.length > 0) {
            let totalMs = 0, cnt = 0;
            session.trades.forEach(t => {
                if (t.entryTime && t.exitTime) {
                    const diff = new Date(t.exitTime) - new Date(t.entryTime);
                    if (!isNaN(diff) && diff > 0) { totalMs += diff; cnt++; }
                }
            });
            if (cnt > 0) {
                const m = Math.floor((totalMs / cnt) / 60000);
                if (m < 60) avgDurLabel = m + 'm';
                else if (m < 1440) avgDurLabel = Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
                else avgDurLabel = Math.floor(m / 1440) + 'd ' + Math.floor((m % 1440) / 60) + 'h';
            }
        }

        return `<tr class="results-row" onclick="viewSimResultDetail('${session.sessionId}')" style="cursor:pointer;">
            <td>
              <div class="fw-semibold">${session.symbol}</div>
              <div class="text-muted small">${session.sessionId}</div>
            </td>
            <td>${modeBadge}</td>
            <td class="${simPnlClass(pnl)} fw-semibold">${simFormatPnl(pnl)}</td>
            <td class="${simPnlClass(roe)} fw-semibold">${simFormatPct(roe)}</td>
            <td class="text-danger">${maxDd != null ? simFormatPct(maxDd).replace('+','') : '0.0%'}</td>
            <td>${winRate != null ? simFormatPct(winRate).replace('+','') : '-'}</td>
            <td class="text-success">${simFormatCurrency(avgWin)}</td>
            <td class="text-danger">${avgLoss ? '-$' + Math.abs(avgLoss).toFixed(2) : '-'}</td>
            <td>${pf != null ? (pf === Infinity ? '∞' : pf.toFixed(2)) : '-'}</td>
            <td>${trades}</td>
            <td>${avgDurLabel}</td>
            <td>${simTimeAgo(updated)}</td>
            <td>
              <button class="btn btn-sm btn-outline-danger" onclick="event.stopPropagation(); deleteSimSession('${session.sessionId}')">
                <i class="fas fa-trash"></i>
              </button>
            </td>
          </tr>`;
    }).join('');
}

function viewSimResultDetail(sessionId) {
    let sessions = [];
    try { sessions = JSON.parse(localStorage.getItem('simTradingSessions') || '[]'); } catch(e) {}

    const session = sessions.find(s => s.sessionId === sessionId);
    if (!session) return;

    window._pendingSimResultDetail = session;
    if (typeof navigateToPage === 'function') {
        navigateToPage('simResultDetail');
    }
}

function initSimResultDetailPage() {
    console.log('Initializing Simulated Trading Result Detail page');
    let data = window._pendingSimResultDetail;
    if (!data) {
        try {
            const sessions = JSON.parse(localStorage.getItem('simTradingSessions') || '[]');
            if (sessions.length > 0) data = sessions[0];
        } catch(e) {}
    }
    if (!data) {
        console.warn('No session data for detail view');
        if (typeof navigateToPage === 'function') navigateToPage('simResults');
        return;
    }
    simResultDetailData = data;
    simResultTradeLogPage = 1;

    document.getElementById('simDetailSessionId').textContent = data.sessionId;
    document.getElementById('simDetailSymbol').textContent = data.symbol;
    document.getElementById('simDetailTotalTrades').textContent = data.stats.totalTrades;
    document.getElementById('simResultDetailBreadcrumb').textContent = data.sessionId;

    const isProfit = data.netPnl >= 0;
    const pnlEl = document.getElementById('simDetailNetPnl');
    pnlEl.textContent = `${isProfit ? '+' : ''}$${Math.abs(data.netPnl).toFixed(2)}`;
    pnlEl.style.color = isProfit ? '#26a69a' : '#ef5350';

    const pnlIcon = document.getElementById('simDetailPnlIcon');
    if (pnlIcon) {
        pnlIcon.className = `icon-big text-center bubble-shadow-small ${isProfit ? 'icon-success' : 'icon-danger'}`;
    }

    const titleEl = document.getElementById('simResultDetailTitle');
    const modeLabel = data.mode === 'stock' ? 'Stock' : 'Options';
    if (titleEl) titleEl.textContent = `${data.symbol} ${modeLabel} Trading Analysis`;

    renderEquityCurve(data);
    renderStats(data);
    renderTradeLog(data);

    const csvBtn = document.getElementById('simResultDownloadCsv');
    if (csvBtn) {
        csvBtn.onclick = () => {
            if (typeof TierRestrictions !== 'undefined' && !TierRestrictions.canDownloadCsv()) {
                return TierRestrictions.showUpgradeMessage('CSV download requires a Standard or Premium plan.');
            }
            downloadTradeCsv(data);
        };
    }

    if (typeof TierRestrictions !== 'undefined') TierRestrictions.disableCsvButtons();
}

function renderEquityCurve(data) {
    const ctx = document.getElementById('simResultEquityCurve');
    if (!ctx) return;

    if (simResultEquityChart) {
        simResultEquityChart.destroy();
        simResultEquityChart = null;
    }

    const labels = data.equityCurve.map(p => `Trade ${p.trade}`);
    const values = data.equityCurve.map(p => p.balance);
    const initialLine = data.equityCurve.map(() => data.initialBalance);

    simResultEquityChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Portfolio Value',
                    data: values,
                    borderColor: '#3b7cff',
                    backgroundColor: 'rgba(59, 124, 255, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 3,
                    pointHoverRadius: 6
                },
                {
                    label: 'Initial Balance',
                    data: initialLine,
                    borderColor: '#ccc',
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `$${ctx.parsed.y.toFixed(2)}`
                    }
                }
            },
            scales: {
                y: {
                    ticks: {
                        callback: v => `$${v.toLocaleString()}`
                    }
                }
            }
        }
    });
}

function renderStats(data) {
    const body = document.getElementById('simResultStatsBody');
    if (!body) return;
    const s = data.stats;

    const statItems = [
        { label: 'Win Rate', value: `${s.winRate.toFixed(1)}%`, color: s.winRate >= 50 ? '#26a69a' : '#ef5350' },
        { label: 'Total Trades', value: s.totalTrades },
        { label: 'Wins / Losses', value: `${s.wins} / ${s.losses}` },
        { label: 'Avg Win', value: `$${s.avgWin.toFixed(2)}`, color: '#26a69a' },
        { label: 'Avg Loss', value: `-$${s.avgLoss.toFixed(2)}`, color: '#ef5350' },
        { label: 'Max Win', value: `$${s.maxWin.toFixed(2)}`, color: '#26a69a' },
        { label: 'Max Loss', value: `$${Math.abs(s.maxLoss).toFixed(2)}`, color: '#ef5350' },
        { label: 'Profit Factor', value: s.profitFactor === Infinity ? '∞' : s.profitFactor.toFixed(2) },
        { label: 'Sharpe Ratio', value: s.sharpeRatio.toFixed(2), color: s.sharpeRatio >= 0 ? '#26a69a' : '#ef5350' },
        { label: 'Max Drawdown', value: `${s.maxDrawdown.toFixed(2)}%`, color: s.maxDrawdown < 0 ? '#ef5350' : '#333' },
        { label: 'Max Consec. Wins', value: s.maxConsecWins, color: '#26a69a' },
        { label: 'Max Consec. Losses', value: s.maxConsecLosses, color: '#ef5350' },
        { label: 'Net Return', value: `${s.netReturn >= 0 ? '+' : ''}${s.netReturn.toFixed(2)}%`, color: s.netReturn >= 0 ? '#26a69a' : '#ef5350' },
        { label: 'Gross Profit', value: `$${s.grossProfit.toFixed(2)}`, color: '#26a69a' },
        { label: 'Gross Loss', value: `-$${s.grossLoss.toFixed(2)}`, color: '#ef5350' },
        { label: 'Initial Balance', value: `$${data.initialBalance.toLocaleString()}` },
        { label: 'Final Balance', value: `$${data.finalBalance.toFixed(2)}`, color: data.finalBalance >= data.initialBalance ? '#26a69a' : '#ef5350' }
    ];

    if (data.mode === 'stock' && data.trades && data.trades.length > 0) {
        let totalMs = 0, count = 0;
        data.trades.forEach(t => {
            if (t.entryTime && t.exitTime) {
                const diff = new Date(t.exitTime) - new Date(t.entryTime);
                if (!isNaN(diff) && diff > 0) { totalMs += diff; count++; }
            }
        });
        if (count > 0) {
            const avgMins = Math.floor((totalMs / count) / 60000);
            const durLabel = avgMins < 60 ? avgMins + 'm' : Math.floor(avgMins/60) + 'h ' + (avgMins%60) + 'm';
            statItems.splice(5, 0, { label: 'Avg Duration', value: durLabel });
        }
    }

    body.innerHTML = statItems.map(item => `
        <div class="d-flex justify-content-between align-items-center py-2" style="border-bottom: 1px solid #f0f0f0;">
            <span class="small" style="color: #666;">${item.label}</span>
            <span class="fw-bold" style="color: ${item.color || '#333'}; font-size: 14px;">${item.value}</span>
        </div>
    `).join('');
}

function renderTradeLog(data) {
    const headerRow = document.getElementById('simResultTradeLogHeader');
    const tbody = document.getElementById('simResultTradeLogBody');
    if (!headerRow || !tbody) return;

    if (data.mode === 'stock') {
        headerRow.innerHTML = `
            <th>#</th><th>Side</th><th>Qty</th><th>Entry Price</th><th>Exit Price</th>
            <th>Entry Time</th><th>Exit Time</th><th>Duration</th><th>P&L</th>
        `;
    } else {
        headerRow.innerHTML = `
            <th style="width:30px"></th><th>#</th><th>Strategy</th><th>P&L</th><th>Qty</th>
            <th>Underlying</th><th>Entry Time</th><th>Exit Time</th>
            <th>Duration</th><th>Expiration</th><th>Exit Reason</th>
            <th>Net Prem Entry</th><th>Net Prem Exit</th>
            <th>Leg Symbol(s)</th>
            <th>IV</th><th>\u0394</th><th>\u0393</th><th>\u0398</th><th>Vega</th>
        `;
    }

    renderTradeLogPage(data);
}

function calcTradeDuration(entryTime, exitTime) {
    if (!entryTime || !exitTime) return '-';
    const entry = new Date(entryTime);
    const exit = new Date(exitTime);
    const diffMs = exit - entry;
    if (isNaN(diffMs) || diffMs < 0) return '-';
    const totalMins = Math.floor(diffMs / 60000);
    if (totalMins < 60) return totalMins + 'm';
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (hrs < 24) return mins > 0 ? hrs + 'h ' + mins + 'm' : hrs + 'h';
    const days = Math.floor(hrs / 24);
    return days + 'd ' + (hrs % 24) + 'h';
}

function renderTradeLogPage(data) {
    const tbody = document.getElementById('simResultTradeLogBody');
    const info = document.getElementById('simResultTradeLogInfo');
    const pagination = document.getElementById('simResultTradeLogPagination');
    if (!tbody) return;

    const trades = data.trades;
    const totalPages = Math.ceil(trades.length / SIM_TRADES_PER_PAGE);
    const start = (simResultTradeLogPage - 1) * SIM_TRADES_PER_PAGE;
    const pageTrades = trades.slice(start, start + SIM_TRADES_PER_PAGE);

    const formatTime = (ts) => {
        if (!ts) return '--';
        const d = new Date(ts);
        if (isNaN(d.getTime())) return String(ts).substring(0, 19);
        return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    if (data.mode === 'stock') {
        tbody.innerHTML = pageTrades.map(t => {
            const pnlColor = t.pnl >= 0 ? '#26a69a' : '#ef5350';
            const pnlSign = t.pnl >= 0 ? '+' : '';
            return `<tr>
                <td>${t.id}</td>
                <td><span class="badge" style="background: ${t.side === 'buy' ? '#26a69a' : '#ef5350'}">${t.side === 'buy' ? 'LONG' : 'SHORT'}</span></td>
                <td>${t.quantity}</td>
                <td>$${t.entryPrice.toFixed(2)}</td>
                <td>$${t.exitPrice.toFixed(2)}</td>
                <td class="small">${formatTime(t.entryTime)}</td>
                <td class="small">${formatTime(t.exitTime)}</td>
                <td>${calcTradeDuration(t.entryTime, t.exitTime)}</td>
                <td style="color: ${pnlColor}; font-weight: 600;">${pnlSign}$${t.pnl.toFixed(2)}</td>
            </tr>`;
        }).join('');
    } else {
        const colCount = 19;
        tbody.innerHTML = pageTrades.map(t => {
            const pnlColor = t.pnl >= 0 ? '#26a69a' : '#ef5350';
            const pnlSign = t.pnl >= 0 ? '+' : '';
            const fmtPremium = (v) => v != null ? ((v >= 0 ? '+' : '-') + '$' + Math.abs(v).toFixed(2)) : '--';
            const netEntryStr = fmtPremium(t.netPremiumEntry);
            const netExitStr = fmtPremium(t.netPremiumExit);
            const netEntryColor = t.netPremiumEntry != null ? (t.netPremiumEntry >= 0 ? '#26a69a' : '#ef5350') : '#999';
            const netExitColor = t.netPremiumExit != null ? (t.netPremiumExit >= 0 ? '#26a69a' : '#ef5350') : '#999';
            const duration = calcTradeDuration(t.entryTime, t.exitTime);
            const underlyingStr = t.underlyingAtEntry != null ? '$' + t.underlyingAtEntry.toFixed(2) : '--';
            const rowId = 'simTradeRow_' + t.id;
            const hasLegs = t.legDetails && t.legDetails.length > 0;
            const legSymbolsStr = hasLegs ? t.legDetails.map(l => l.symbol || '--').join('<br>') : '--';
            const fmtG = (v, d) => v != null ? v.toFixed(d || 4) : '--';
            let netIV = null, netDelta = null, netGamma = null, netTheta = null, netVega = null;
            if (hasLegs) {
                let ivCount = 0;
                t.legDetails.forEach(l => {
                    const sign = l.position === 'long' ? 1 : -1;
                    if (l.iv != null) { netIV = (netIV || 0) + l.iv; ivCount++; }
                    if (l.delta != null) netDelta = (netDelta || 0) + l.delta * sign;
                    if (l.gamma != null) netGamma = (netGamma || 0) + l.gamma * sign;
                    if (l.theta != null) netTheta = (netTheta || 0) + l.theta * sign;
                    if (l.vega != null) netVega = (netVega || 0) + l.vega * sign;
                });
                if (netIV != null && ivCount > 0) netIV = netIV / ivCount;
            }
            const avgIvStr = netIV != null ? (netIV * 100).toFixed(1) + '%' : '--';

            let legSubRows = '';
            if (hasLegs) {
                legSubRows = `<tr id="${rowId}_legs" style="display:none;"><td colspan="${colCount}" style="padding:0;border-top:0;">
                    <div style="background:#f8f9fa;padding:8px 16px;border-radius:0 0 6px 6px;">
                        <table class="table table-sm mb-0" style="font-size:12px;">
                            <thead><tr style="color:#888;">
                                <th>Leg</th><th>Symbol</th><th>Type</th><th>Position</th>
                                <th>Strike</th><th>Entry Price</th><th>Exit Price</th>
                                <th>Entry Cost</th><th>Exit Cost</th><th>P&L/Contract</th>
                                <th>IV</th><th>\u0394</th><th>\u0393</th><th>\u0398</th><th>Vega</th>
                            </tr></thead>
                            <tbody>${t.legDetails.map(l => {
                                const hasExit = l.exitPrice != null;
                                const legPnl = hasExit ? (l.position === 'long' ? (l.exitPrice - l.entryPrice) * 100 : (l.entryPrice - l.exitPrice) * 100) : null;
                                const legPnlColor = legPnl != null ? (legPnl >= 0 ? '#26a69a' : '#ef5350') : '#999';
                                const posBadge = l.position === 'long' ? '<span class="badge" style="background:#26a69a;font-size:10px;">LONG</span>' : '<span class="badge" style="background:#ef5350;font-size:10px;">SHORT</span>';
                                const typeBadge = l.type === 'call' ? '<span class="badge" style="background:#2196F3;font-size:10px;">CALL</span>' : '<span class="badge" style="background:#FF9800;font-size:10px;">PUT</span>';
                                const ivStr = l.iv != null ? (l.iv * 100).toFixed(1) + '%' : '--';
                                return `<tr>
                                    <td class="fw-bold">${l.name}</td>
                                    <td class="text-muted" style="font-size:11px;">${l.symbol || '--'}</td>
                                    <td>${typeBadge}</td>
                                    <td>${posBadge}</td>
                                    <td>${l.strike != null ? '$' + l.strike.toFixed(2) : '--'}</td>
                                    <td>${l.entryPrice != null ? '$' + l.entryPrice.toFixed(2) : '--'}</td>
                                    <td>${hasExit ? '$' + l.exitPrice.toFixed(2) : '--'}</td>
                                    <td style="color:${l.entryCost != null ? (l.entryCost >= 0 ? '#26a69a' : '#ef5350') : '#999'};">${l.entryCost != null ? ((l.entryCost >= 0 ? '+' : '-') + '$' + Math.abs(l.entryCost).toFixed(2)) : '--'}</td>
                                    <td style="color:${l.exitCost != null ? (l.exitCost >= 0 ? '#26a69a' : '#ef5350') : '#999'};">${l.exitCost != null ? ((l.exitCost >= 0 ? '+' : '-') + '$' + Math.abs(l.exitCost).toFixed(2)) : '--'}</td>
                                    <td style="color:${legPnlColor};font-weight:600;">${legPnl != null ? ((legPnl >= 0 ? '+' : '') + '$' + legPnl.toFixed(2)) : '--'}</td>
                                    <td>${ivStr}</td>
                                    <td>${fmtG(l.delta)}</td>
                                    <td>${fmtG(l.gamma, 6)}</td>
                                    <td>${fmtG(l.theta)}</td>
                                    <td>${fmtG(l.vega)}</td>
                                </tr>`;
                            }).join('')}</tbody>
                        </table>
                    </div>
                </td></tr>`;
            }

            return `<tr id="${rowId}" style="cursor:${hasLegs ? 'pointer' : 'default'};" onclick="${hasLegs ? `(function(){var el=document.getElementById('${rowId}_legs');var icon=document.getElementById('${rowId}_icon');if(el){el.style.display=el.style.display==='none'?'table-row':'none';if(icon)icon.className=el.style.display==='none'?'fas fa-chevron-right':'fas fa-chevron-down';}})()` : ''}">
                <td>${hasLegs ? `<i id="${rowId}_icon" class="fas fa-chevron-right" style="font-size:10px;color:#999;"></i>` : ''}</td>
                <td>${t.id}</td>
                <td>${t.strategy}</td>
                <td style="color: ${pnlColor}; font-weight: 600;">${pnlSign}$${t.pnl.toFixed(2)}</td>
                <td>${t.quantity}</td>
                <td>${underlyingStr}</td>
                <td class="small">${formatTime(t.entryTime)}</td>
                <td class="small">${formatTime(t.exitTime)}</td>
                <td>${duration}</td>
                <td class="small">${t.expiration || '--'}</td>
                <td><span class="badge bg-secondary">${t.exitReason}</span></td>
                <td style="color:${netEntryColor};font-weight:500;">${netEntryStr}</td>
                <td style="color:${netExitColor};font-weight:500;">${netExitStr}</td>
                <td style="font-size:11px;font-family:monospace;color:#6c757d;">${legSymbolsStr}</td>
                <td>${avgIvStr}</td>
                <td>${fmtG(netDelta)}</td>
                <td>${fmtG(netGamma, 6)}</td>
                <td>${fmtG(netTheta)}</td>
                <td>${fmtG(netVega)}</td>
            </tr>${legSubRows}`;
        }).join('');
    }

    if (info) {
        info.textContent = `Showing ${start + 1}-${Math.min(start + SIM_TRADES_PER_PAGE, trades.length)} of ${trades.length} trades`;
    }

    if (pagination && totalPages > 1) {
        let paginationHtml = `<nav><ul class="pagination pagination-sm mb-0">`;
        paginationHtml += `<li class="page-item ${simResultTradeLogPage <= 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="simResultGoToPage(${simResultTradeLogPage - 1}); return false;">&laquo;</a></li>`;
        for (let i = 1; i <= totalPages; i++) {
            paginationHtml += `<li class="page-item ${i === simResultTradeLogPage ? 'active' : ''}">
                <a class="page-link" href="#" onclick="simResultGoToPage(${i}); return false;">${i}</a></li>`;
        }
        paginationHtml += `<li class="page-item ${simResultTradeLogPage >= totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="simResultGoToPage(${simResultTradeLogPage + 1}); return false;">&raquo;</a></li>`;
        paginationHtml += `</ul></nav>`;
        pagination.innerHTML = paginationHtml;
    } else if (pagination) {
        pagination.innerHTML = '';
    }
}

function simResultGoToPage(page) {
    if (!simResultDetailData) return;
    const totalPages = Math.ceil(simResultDetailData.trades.length / SIM_TRADES_PER_PAGE);
    if (page < 1 || page > totalPages) return;
    simResultTradeLogPage = page;
    renderTradeLogPage(simResultDetailData);
}

function downloadTradeCsv(data) {
    if (!data || !data.trades.length) return;

    let headers, rows;
    if (data.mode === 'stock') {
        headers = ['#', 'Side', 'Quantity', 'Entry Price', 'Exit Price', 'Entry Time', 'Exit Time', 'Duration', 'P&L'];
        rows = data.trades.map(t => [
            t.id, t.side === 'buy' ? 'LONG' : 'SHORT', t.quantity, t.entryPrice.toFixed(2), t.exitPrice.toFixed(2),
            t.entryTime, t.exitTime, calcTradeDuration(t.entryTime, t.exitTime), t.pnl.toFixed(2)
        ]);
    } else {
        const maxLegs = Math.max(...data.trades.map(t => (t.legDetails || []).length), 1);
        headers = ['#', 'Strategy', 'P&L', 'Quantity',
            'Underlying At Entry', 'Entry Time', 'Exit Time', 'Duration', 'Expiration', 'Exit Reason',
            'Net Premium Entry', 'Net Premium Exit',
            'Net IV', 'Net Delta', 'Net Gamma', 'Net Theta', 'Net Vega'];
        for (let li = 1; li <= maxLegs; li++) {
            headers.push(`Leg${li} Name`, `Leg${li} Symbol`, `Leg${li} Type`, `Leg${li} Position`,
                `Leg${li} Strike`, `Leg${li} Entry Price`, `Leg${li} Exit Price`,
                `Leg${li} Entry Cost`, `Leg${li} Exit Cost`, `Leg${li} PnL/Contract`,
                `Leg${li} IV`, `Leg${li} Delta`, `Leg${li} Gamma`, `Leg${li} Theta`, `Leg${li} Vega`);
        }
        const fmtNum = (v) => v != null ? v.toFixed(2) : '';
        const fmtG = (v, d) => v != null ? v.toFixed(d || 4) : '';
        rows = data.trades.map(t => {
            let csvIV = null, csvDelta = null, csvGamma = null, csvTheta = null, csvVega = null;
            let csvIVCount = 0;
            (t.legDetails || []).forEach(l => {
                const sign = l.position === 'long' ? 1 : -1;
                if (l.iv != null) { csvIV = (csvIV || 0) + l.iv; csvIVCount++; }
                if (l.delta != null) csvDelta = (csvDelta || 0) + l.delta * sign;
                if (l.gamma != null) csvGamma = (csvGamma || 0) + l.gamma * sign;
                if (l.theta != null) csvTheta = (csvTheta || 0) + l.theta * sign;
                if (l.vega != null) csvVega = (csvVega || 0) + l.vega * sign;
            });
            if (csvIV != null && csvIVCount > 0) csvIV = csvIV / csvIVCount;
            const row = [
                t.id, t.strategy, t.pnl.toFixed(2), t.quantity,
                fmtNum(t.underlyingAtEntry),
                t.entryTime, t.exitTime, calcTradeDuration(t.entryTime, t.exitTime),
                t.expiration || '', t.exitReason,
                fmtNum(t.netPremiumEntry), fmtNum(t.netPremiumExit),
                csvIV != null ? (csvIV * 100).toFixed(1) + '%' : '',
                fmtG(csvDelta), fmtG(csvGamma, 6), fmtG(csvTheta), fmtG(csvVega)
            ];
            for (let li = 0; li < maxLegs; li++) {
                const l = (t.legDetails || [])[li];
                if (l) {
                    const legPnl = l.exitPrice != null ? (l.position === 'long' ? (l.exitPrice - l.entryPrice) * 100 : (l.entryPrice - l.exitPrice) * 100) : null;
                    row.push(l.name, l.symbol || '', l.type, l.position,
                        fmtNum(l.strike), fmtNum(l.entryPrice), fmtNum(l.exitPrice),
                        fmtNum(l.entryCost), fmtNum(l.exitCost), fmtNum(legPnl),
                        l.iv != null ? (l.iv * 100).toFixed(1) + '%' : '', fmtG(l.delta), fmtG(l.gamma, 6), fmtG(l.theta), fmtG(l.vega));
                } else {
                    row.push('', '', '', '', '', '', '', '', '', '', '', '', '', '', '');
                }
            }
            return row;
        });
    }

    let csv = headers.join(',') + '\n';
    csv += rows.map(r => r.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sim_trading_${data.sessionId}_${data.symbol}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

async function deleteSimSession(sessionId) {
    if (!(await appConfirm('Delete this session?'))) return;
    let sessions = [];
    try { sessions = JSON.parse(localStorage.getItem('simTradingSessions') || '[]'); } catch(e) {}
    sessions = sessions.filter(s => s.sessionId !== sessionId);
    localStorage.setItem('simTradingSessions', JSON.stringify(sessions));
    loadSimResultSessions();
}
