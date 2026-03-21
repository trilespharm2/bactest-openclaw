let simResultSessions = [];
let simResultCurrentFilter = 'all';
let simResultDetailData = null;
let simResultEquityChart = null;
let simResultTradeLogPage = 1;
const SIM_TRADES_PER_PAGE = 15;

function initSimResultsPage() {
    console.log('Initializing Simulated Trading Results page');
    loadSimResultSessions();

    const grid = document.getElementById('simResultsGrid');
    if (grid && grid.dataset.initialized) return;
    if (grid) grid.dataset.initialized = 'true';

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
}

function loadSimResultSessions() {
    try {
        simResultSessions = JSON.parse(localStorage.getItem('simTradingSessions') || '[]');
    } catch(e) { simResultSessions = []; }
    renderSimResultsGrid();
}

function renderSimResultsGrid() {
    const grid = document.getElementById('simResultsGrid');
    const empty = document.getElementById('simResultsEmpty');
    if (!grid) return;

    let filtered = simResultSessions;
    if (simResultCurrentFilter !== 'all') {
        filtered = simResultSessions.filter(s => s.mode === simResultCurrentFilter);
    }

    if (filtered.length === 0) {
        grid.innerHTML = '';
        grid.style.display = 'none';
        if (empty) empty.style.display = '';
        return;
    }

    if (empty) empty.style.display = 'none';
    grid.style.display = '';

    grid.innerHTML = filtered.map((session, idx) => {
        const isProfit = session.netPnl >= 0;
        const pnlColor = isProfit ? '#26a69a' : '#ef5350';
        const pnlSign = isProfit ? '+' : '';
        const modeLabel = session.mode === 'stock' ? 'Stock' : 'Options';
        const modeBadgeColor = session.mode === 'stock' ? '#3b7cff' : '#7c3aed';
        const ts = new Date(session.timestamp);
        const dateStr = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        return `
            <div class="col-md-6 col-lg-4 mb-3">
                <div class="card card-round" style="cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;" 
                     onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 8px 24px rgba(0,0,0,0.1)';"
                     onmouseout="this.style.transform=''; this.style.boxShadow='';"
                     onclick="viewSimResultDetail(${idx})">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <div>
                                <h5 class="mb-1 fw-bold" style="color: #333;">${session.symbol}</h5>
                                <span class="badge" style="background: ${modeBadgeColor}; font-size: 11px;">${modeLabel}</span>
                            </div>
                            <div class="text-end">
                                <div class="fw-bold" style="color: ${pnlColor}; font-size: 16px;">${pnlSign}$${Math.abs(session.netPnl).toFixed(2)}</div>
                                <div class="small text-muted">${session.stats.winRate.toFixed(1)}% WR</div>
                            </div>
                        </div>
                        <div class="d-flex justify-content-between small text-muted mt-2">
                            <span><i class="fas fa-exchange-alt me-1"></i>${session.stats.totalTrades} trades</span>
                            <span><i class="fas fa-fingerprint me-1"></i>${session.sessionId}</span>
                        </div>
                        <div class="small text-muted mt-1">
                            <i class="fas fa-calendar me-1"></i>${dateStr} ${timeStr}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function viewSimResultDetail(idx) {
    let sessions = [];
    try { sessions = JSON.parse(localStorage.getItem('simTradingSessions') || '[]'); } catch(e) {}

    let filtered = sessions;
    if (simResultCurrentFilter !== 'all') {
        filtered = sessions.filter(s => s.mode === simResultCurrentFilter);
    }

    const session = filtered[idx];
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
        csvBtn.onclick = () => downloadTradeCsv(data);
    }
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
        { label: 'Max Drawdown', value: `${s.maxDrawdown.toFixed(2)}%`, color: '#ef5350' },
        { label: 'Risk per Trade', value: `${s.riskPerTrade.toFixed(2)}%` },
        { label: 'Return on Risk', value: s.returnOnRisk === Infinity ? '∞' : `${s.returnOnRisk.toFixed(2)}x` },
        { label: 'Max Consec. Wins', value: s.maxConsecWins, color: '#26a69a' },
        { label: 'Max Consec. Losses', value: s.maxConsecLosses, color: '#ef5350' },
        { label: 'Net Return', value: `${s.netReturn >= 0 ? '+' : ''}${s.netReturn.toFixed(2)}%`, color: s.netReturn >= 0 ? '#26a69a' : '#ef5350' },
        { label: 'Gross Profit', value: `$${s.grossProfit.toFixed(2)}`, color: '#26a69a' },
        { label: 'Gross Loss', value: `-$${s.grossLoss.toFixed(2)}`, color: '#ef5350' },
        { label: 'Initial Balance', value: `$${data.initialBalance.toLocaleString()}` },
        { label: 'Final Balance', value: `$${data.finalBalance.toFixed(2)}`, color: data.finalBalance >= data.initialBalance ? '#26a69a' : '#ef5350' }
    ];

    if (data.mode === 'stock' && s.avgBarsInTrade > 0) {
        statItems.splice(5, 0, { label: 'Avg Bars in Trade', value: s.avgBarsInTrade.toFixed(1) });
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
            <th>Entry Time</th><th>Exit Time</th><th>Bars</th><th>P&L</th>
        `;
    } else {
        headerRow.innerHTML = `
            <th>#</th><th>Strategy</th><th>Legs</th><th>Qty</th>
            <th>Entry Time</th><th>Exit Time</th><th>Exit Reason</th><th>P&L</th>
        `;
    }

    renderTradeLogPage(data);
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
                <td><span class="badge" style="background: ${t.side === 'buy' ? '#26a69a' : '#ef5350'}">${t.side.toUpperCase()}</span></td>
                <td>${t.quantity}</td>
                <td>$${t.entryPrice.toFixed(2)}</td>
                <td>$${t.exitPrice.toFixed(2)}</td>
                <td class="small">${formatTime(t.entryTime)}</td>
                <td class="small">${formatTime(t.exitTime)}</td>
                <td>${t.barsInTrade}</td>
                <td style="color: ${pnlColor}; font-weight: 600;">${pnlSign}$${t.pnl.toFixed(2)}</td>
            </tr>`;
        }).join('');
    } else {
        tbody.innerHTML = pageTrades.map(t => {
            const pnlColor = t.pnl >= 0 ? '#26a69a' : '#ef5350';
            const pnlSign = t.pnl >= 0 ? '+' : '';
            return `<tr>
                <td>${t.id}</td>
                <td>${t.strategy}</td>
                <td class="small">${t.legs}</td>
                <td>${t.quantity}</td>
                <td class="small">${formatTime(t.entryTime)}</td>
                <td class="small">${formatTime(t.exitTime)}</td>
                <td><span class="badge bg-secondary">${t.exitReason}</span></td>
                <td style="color: ${pnlColor}; font-weight: 600;">${pnlSign}$${t.pnl.toFixed(2)}</td>
            </tr>`;
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
        headers = ['#', 'Side', 'Quantity', 'Entry Price', 'Exit Price', 'Entry Time', 'Exit Time', 'Bars in Trade', 'P&L'];
        rows = data.trades.map(t => [
            t.id, t.side, t.quantity, t.entryPrice.toFixed(2), t.exitPrice.toFixed(2),
            t.entryTime, t.exitTime, t.barsInTrade, t.pnl.toFixed(2)
        ]);
    } else {
        headers = ['#', 'Strategy', 'Legs', 'Quantity', 'Entry Time', 'Exit Time', 'Exit Reason', 'P&L'];
        rows = data.trades.map(t => [
            t.id, t.strategy, `"${t.legs}"`, t.quantity,
            t.entryTime, t.exitTime, t.exitReason, t.pnl.toFixed(2)
        ]);
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

function deleteSimSession(sessionId) {
    if (!confirm('Delete this session?')) return;
    let sessions = [];
    try { sessions = JSON.parse(localStorage.getItem('simTradingSessions') || '[]'); } catch(e) {}
    sessions = sessions.filter(s => s.sessionId !== sessionId);
    localStorage.setItem('simTradingSessions', JSON.stringify(sessions));
    loadSimResultSessions();
}
