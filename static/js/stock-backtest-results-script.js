// Stock Backtest Results V3.0 - Results Display Script
// Loads and displays detailed backtest results with polling support

// ── Screen width detection ───────────────────────────────────────────────────
const MOBILE_BREAKPOINT = 720;
const SMALL_BREAKPOINT  = 430;

function updateScreenClass() {
    const w = window.innerWidth;
    document.body.classList.toggle('is-mobile',       w <= MOBILE_BREAKPOINT);
    document.body.classList.toggle('is-small-mobile', w <= SMALL_BREAKPOINT);
}

updateScreenClass();
window.addEventListener('resize', () => {
    updateScreenClass();
    if (equityCurveChart) {
        clearTimeout(window._chartResizeTimer);
        window._chartResizeTimer = setTimeout(() => equityCurveChart.resize(), 80);
    }
});
// ─────────────────────────────────────────────────────────────────────────────

let backtestId = null;
let originPage = null;

// Handle back navigation
function goBack() {
    window.location.href = '/dashboard?section=stockResults';
}

function useTemplate() {
    if (resultsData && resultsData.config) {
        sessionStorage.setItem('stockBacktestUseTemplate', JSON.stringify(resultsData.config));
        window.location.href = '/dashboard?section=stockBacktester';
    }
}
let resultsData = null;
let allTrades = [];
let currentPage = 1;
const tradesPerPage = 10;
let pollingInterval = null;
let equityCurveChart = null;
let modalEquityCurveChart = null;
let chartData = null;

function formatCurrency(value) {
    return `$${Number(value || 0).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

function setMetricValue(elementId, value, state = 'neutral') {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.classList.remove('positive', 'negative');
    element.textContent = value;

    if (state === 'positive') {
        element.classList.add('positive');
    } else if (state === 'negative') {
        element.classList.add('negative');
    }
}

// Initialize page
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Stock Backtest Results Page Initialized');
    
    // Get backtest ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    backtestId = urlParams.get('id');
    
    if (!backtestId) {
        showError('No backtest ID provided');
        return;
    }
    
    console.log('Loading results for backtest ID:', backtestId);
    
    // Setup buttons
    setupButtons();
    
    // Try to show config immediately from sessionStorage (set by form submission)
    const storedConfig = sessionStorage.getItem('stockBacktestConfig_' + backtestId);
    if (storedConfig) {
        try {
            const config = JSON.parse(storedConfig);
            console.log('Showing stored config while loading:', config);
            displayConfiguration(config, {});
            sessionStorage.removeItem('stockBacktestConfig_' + backtestId);
        } catch (e) {
            console.error('Error parsing stored config:', e);
        }
    }
    
    // Check status and load results
    await checkStatusAndLoad();
});

function setupButtons() {
    // Download CSV button
    const downloadBtn = document.getElementById('downloadCSV');
    if (downloadBtn) {
        downloadBtn.onclick = downloadCSV;
    }
    
    // Pagination buttons
    const prevBtn = document.getElementById('tradesPrevBtn');
    const nextBtn = document.getElementById('tradesNextBtn');
    
    if (prevBtn) {
        prevBtn.onclick = () => {
            if (currentPage > 1) {
                currentPage--;
                displayTradesPage();
            }
        };
    }
    
    if (nextBtn) {
        nextBtn.onclick = () => {
            const totalPages = Math.ceil(allTrades.length / tradesPerPage);
            if (currentPage < totalPages) {
                currentPage++;
                displayTradesPage();
            }
        };
    }
}

async function checkStatusAndLoad() {
    try {
        const statusResponse = await authFetch(`/api/stocks-backtest-v3/status/${backtestId}`);
        if (!statusResponse.ok) throw new Error('Status check failed: ' + statusResponse.status);
        const statusData = await statusResponse.json();
        
        console.log('Status check:', statusData);
        
        if (statusData.status === 'running') {
            updateLoadingMessage('Running backtest...');
            setTimeout(checkStatusAndLoad, 2000);
            return;
        }
        
        if (statusData.status === 'error') {
            showError(statusData.error || 'Backtest failed');
            return;
        }
        
        if (statusData.status === 'completed' || statusData.status === 'success') {
            await loadResults();
            return;
        }
        
        if (statusData.status === 'not_found') {
            await loadResults();
        }
        
    } catch (error) {
        console.error('Error checking status:', error);
        await loadResults();
    }
}

function updateLoadingMessage(message) {
    const loadingSection = document.getElementById('loadingSection');
    if (loadingSection) {
        loadingSection.innerHTML = `
            <i class="fas fa-spinner"></i>
            <h3>${message}</h3>
            <p style="color: #9ca3af; margin-top: 10px;">This may take a few minutes depending on the date range and symbols...</p>
        `;
    }
}

async function loadResults() {
    try {
        const response = await authFetch(`/api/stocks-backtest-v3/results/${backtestId}`);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to load results');
        }
        
        resultsData = await response.json();
        console.log('Results loaded:', resultsData);
        
        if (resultsData.status === 'running') {
            updateLoadingMessage('Running backtest...');
            setTimeout(checkStatusAndLoad, 2000);
            return;
        }
        
        // Hide loading, show main layout
        document.getElementById('loadingSection').style.display = 'none';
        document.getElementById('mainLayout').style.display = 'grid';
        
        // Display results
        displayConfiguration(resultsData.config || {}, resultsData.metadata || {});
        displayStatistics(resultsData.stats || {});
        displayEquityCurve(resultsData.trades || []);
        displayTrades(resultsData.trades || []);
        buildDecisionTree(resultsData.decision_log || [], resultsData.config || null);

        if (resultsData.config && Object.keys(resultsData.config).length > 0) {
            document.getElementById('useTemplateBtn').style.display = '';
        }
        
    } catch (error) {
        console.error('Error loading results:', error);
        showError(error.message);
    }
}

function displayConfiguration(config, metadata) {
    const configList = document.getElementById('configList');
    
    // Update title
    document.getElementById('backtestTitle').textContent = config.name || 'Unnamed Backtest';
    
    // Build configuration items
    const configItems = [];
    
    // Symbol Info - handle both field formats
    if (config.symbol_mode === 'single') {
        const symbolValue = config.symbol || (config.symbols && config.symbols[0]) || 'N/A';
        configItems.push({ label: 'Symbol', value: symbolValue });
    } else {
        configItems.push({ 
            label: 'Symbols', 
            value: metadata?.symbol_count || config.symbols?.length || 'Multiple' 
        });
    }
    
    // Date Range
    configItems.push({
        label: 'Date Range',
        value: `${config.start_date || 'N/A'} to ${config.end_date || 'N/A'}`
    });
    
    // Direction
    configItems.push({
        label: 'Direction',
        value: config.direction === 'long' ? 'Long' : 'Short'
    });
    
    // Entry Conditions
    if (config.entry_type === 'preset') {
        const presetNames = {
            '1': 'Gap Up %',
            '2': 'Gap Down %',
            '3': 'Change %',
            '4': 'Volume Spike',
            '5': 'Velocity'
        };
        configItems.push({
            label: 'Entry',
            value: `${presetNames[config.preset_condition] || 'Custom'}`
        });
    } else {
        configItems.push({
            label: 'Entry',
            value: `Custom (${config.custom_conditions?.length || 0})`
        });
    }
    
    // Position Sizing - handle both field formats (sizing_value or sizing_shares/sizing_dollars/sizing_percent)
    if (config.sizing_type === 'shares') {
        const sharesValue = config.sizing_value || config.sizing_shares || 'N/A';
        configItems.push({ label: 'Size', value: `${sharesValue} shares` });
    } else if (config.sizing_type === 'dollars') {
        const dollarsValue = config.sizing_value || config.sizing_dollars || 'N/A';
        configItems.push({ label: 'Size', value: `$${dollarsValue}` });
    } else {
        const percentValue = config.sizing_value || config.sizing_percent || 'N/A';
        configItems.push({ label: 'Size', value: `${percentValue}%` });
    }
    
    // Starting Capital
    if (config.starting_capital) {
        configItems.push({
            label: 'Capital',
            value: `$${config.starting_capital.toLocaleString()}`
        });
    }
    
    // Exit Criteria
    configItems.push({
        label: 'Take Profit',
        value: config.take_profit_type === 'percent' 
            ? `${config.take_profit_value}%` 
            : `$${config.take_profit_value}`
    });
    
    configItems.push({
        label: 'Stop Loss',
        value: config.stop_loss_type === 'percent' 
            ? `${config.stop_loss_value}%` 
            : `$${config.stop_loss_value}`
    });
    
    configItems.push({
        label: 'Max Days',
        value: config.max_days || 'N/A'
    });
    
    // Render configuration list (using stats-grid styling to match Performance panel)
    configList.innerHTML = configItems.map(item => `
        <div class="stat-card">
            <div class="stat-label">${item.label}</div>
            <div class="stat-value">${item.value}</div>
        </div>
    `).join('');
}

function displayStatistics(stats) {
    if (!stats) {
        stats = {
            total_trades: 0,
            win_rate: 0,
            total_pnl: 0,
            avg_win: 0,
            avg_loss: 0,
            profit_factor: 0,
            max_drawdown: 0,
            total_return: 0
        };
    }
    
    // Update stat values
    setMetricValue('statTotalTrades', stats.total_trades || 0);
    
    const winRateVal = stats.win_rate || 0;
    setMetricValue('statWinRate', `${winRateVal.toFixed(1)}%`, winRateVal >= 50 ? 'positive' : 'neutral');
    
    const totalPLVal = stats.total_pnl || 0;
    setMetricValue(
        'statTotalPL',
        formatCurrency(totalPLVal),
        totalPLVal > 0 ? 'positive' : totalPLVal < 0 ? 'negative' : 'neutral'
    );
    
    setMetricValue('statAvgWin', formatCurrency(stats.avg_win || 0), (stats.avg_win || 0) > 0 ? 'positive' : 'neutral');
    setMetricValue('statAvgLoss', formatCurrency(stats.avg_loss || 0), (stats.avg_loss || 0) < 0 ? 'negative' : 'neutral');
    
    const pfVal = stats.profit_factor || 0;
    setMetricValue(
        'statProfitFactor',
        pfVal.toFixed(2),
        pfVal > 1 ? 'positive' : pfVal < 1 ? 'negative' : 'neutral'
    );
    
    const ddVal = stats.max_drawdown || 0;
    setMetricValue('statMaxDrawdown', `${ddVal.toFixed(2)}%`, ddVal < 0 ? 'negative' : 'neutral');
    
    const returnVal = stats.total_return || 0;
    setMetricValue(
        'statTotalReturn',
        `${returnVal.toFixed(2)}%`,
        returnVal > 0 ? 'positive' : returnVal < 0 ? 'negative' : 'neutral'
    );
}

function displayEquityCurve(trades) {
    const summaryChip = document.getElementById('equitySummaryChip');

    if (!trades || trades.length === 0) {
        if (equityCurveChart) {
            equityCurveChart.destroy();
            equityCurveChart = null;
        }
        chartData = null;
        const container = document.getElementById('equityCurveContainer');
        container.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #62748a; font-weight: 600;">No trades to display</div>';
        if (summaryChip) {
            summaryChip.textContent = 'No trades executed';
        }
        return;
    }
    
    const container = document.getElementById('equityCurveContainer');
    container.innerHTML = '<canvas id="equityChart"></canvas>';
    
    // Build equity curve from trades
    const labels = ['Start'];
    const values = [0];
    let runningTotal = 0;
    
    trades.forEach((trade, index) => {
        runningTotal += (trade.pnl || 0);
        labels.push(trade.exit_date || trade.exit_timestamp || `Trade ${index + 1}`);
        values.push(runningTotal);
    });
    
    // Store chart data for modal
    chartData = { labels, values };
    
    const finalValue = values[values.length - 1];
    const lineColor = finalValue >= 0 ? '#2563eb' : '#d14343';
    const fillColor = finalValue >= 0 ? 'rgba(37, 99, 235, 0.12)' : 'rgba(209, 67, 67, 0.12)';
    const isMobile = window.innerWidth <= 680;
    
    // Tight y-axis bounds
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const dataRange = Math.max(maxValue - minValue, 1);
    const pad = dataRange * 0.08;
    const tickLimit = window.innerWidth <= 1720 ? 4 : window.innerWidth <= 1100 ? 6 : 9;

    if (summaryChip) {
        summaryChip.textContent = `${trades.length} trades | ${formatCurrency(finalValue)} cumulative P&L`;
    }
    
    const ctx = document.getElementById('equityChart');

    if (equityCurveChart) {
        equityCurveChart.destroy();
    }
    
    equityCurveChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Cumulative P&L ($)',
                data: values,
                borderColor: lineColor,
                backgroundColor: fillColor,
                borderWidth: 2.5,
                fill: false,
                tension: 0,
                pointRadius: 0,
                pointHoverRadius: 4,
                pointBackgroundColor: lineColor
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { top: 1, right: 1, bottom: 0, left: 1 }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return 'Cumulative P&L: ' + formatCurrency(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: { 
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: tickLimit,
                        font: { size: isMobile ? 10 : 11 },
                        color: '#7b8ba0',
                        padding: 8
                    },
                    border: { display: false }
                },
                y: {
                    display: true,
                    position: 'right',
                    min: minValue - pad,
                    max: maxValue + pad,
                    grid: {
                        color: (ctx) => (ctx.tick && ctx.tick.value === 0 ? 'rgba(31, 41, 55, 0.7)' : 'rgba(98, 116, 138, 0.16)'),
                        borderDash: (ctx) => (ctx.tick && ctx.tick.value === 0 ? [] : [4, 4]),
                        lineWidth: (ctx) => (ctx.tick && ctx.tick.value === 0 ? 2 : 1),
                        drawBorder: false
                    },
                    ticks: {
                        font: { size: isMobile ? 10 : 11 },
                        color: '#7b8ba0',
                        padding: 8,
                        count: 4,
                        callback: function(value) {
                            if (Math.abs(value) >= 1000) {
                                return '$' + (value / 1000).toFixed(0) + 'k';
                            }
                            return '$' + Math.round(value).toLocaleString();
                        }
                    },
                    border: { display: false }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });

    // Force chart to recalculate dimensions after layout settles (fixes iframe/mobile overflow)
    requestAnimationFrame(() => {
        if (equityCurveChart) equityCurveChart.resize();
    });
    setTimeout(() => {
        if (equityCurveChart) equityCurveChart.resize();
    }, 50);
    setTimeout(() => {
        if (equityCurveChart) equityCurveChart.resize();
    }, 300);

    // Watch container for size changes and keep chart in sync
    const chartContainer = document.getElementById('equityCurveContainer');
    if (chartContainer && window.ResizeObserver) {
        if (window._chartResizeObserver) window._chartResizeObserver.disconnect();
        window._chartResizeObserver = new ResizeObserver(() => {
            if (equityCurveChart) equityCurveChart.resize();
        });
        window._chartResizeObserver.observe(chartContainer);
    }
}

function displayTrades(trades) {
    const thead = document.getElementById('tradesTableHead');
    const tbody = document.getElementById('tradesTableBody');
    
    if (!trades || trades.length === 0) {
        thead.innerHTML = '';
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 40px;">No trades executed</td></tr>';
        return;
    }
    
    allTrades = trades;
    document.getElementById('tradesTotalCount').textContent = allTrades.length;
    
    thead.innerHTML = `
        <tr>
            <th>#</th>
            <th>Symbol</th>
            <th>Entry Date</th>
            <th>Entry Price</th>
            <th>Exit Date</th>
            <th>Exit Price</th>
            <th>Shares</th>
            <th>P&L</th>
            <th>P&L %</th>
            <th>Exit Reason</th>
        </tr>
    `;
    
    currentPage = 1;
    displayTradesPage();
}

function displayTradesPage() {
    const tbody = document.getElementById('tradesTableBody');
    const totalPages = Math.ceil(allTrades.length / tradesPerPage);
    
    const startIdx = (currentPage - 1) * tradesPerPage;
    const endIdx = Math.min(startIdx + tradesPerPage, allTrades.length);
    
    document.getElementById('tradesRangeStart').textContent = allTrades.length > 0 ? startIdx + 1 : 0;
    document.getElementById('tradesRangeEnd').textContent = endIdx;
    
    const prevBtn = document.getElementById('tradesPrevBtn');
    const nextBtn = document.getElementById('tradesNextBtn');
    
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
    
    tbody.innerHTML = '';
    
    for (let i = startIdx; i < endIdx; i++) {
        const trade = allTrades[i];
        const pnl = trade.pnl || 0;
        const pnlPct = trade.pnl_pct || 0;
        const pnlClass = pnl >= 0 ? 'positive' : 'negative';
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${i + 1}</td>
            <td><strong>${trade.symbol || 'N/A'}</strong></td>
            <td>${trade.entry_date || trade.entry_timestamp || 'N/A'}</td>
            <td>$${(trade.entry_price || 0).toFixed(2)}</td>
            <td>${trade.exit_date || trade.exit_timestamp || 'N/A'}</td>
            <td>$${(trade.exit_price || 0).toFixed(2)}</td>
            <td>${trade.shares || 0}</td>
            <td class="${pnlClass}">$${pnl.toFixed(2)}</td>
            <td class="${pnlClass}">${pnlPct.toFixed(2)}%</td>
            <td>${trade.exit_reason || 'N/A'}</td>
        `;
        tbody.appendChild(row);
    }
}

function downloadCSV() {
    if (!resultsData || !resultsData.csv_data) {
        appAlert('No CSV data available');
        return;
    }
    
    const blob = new Blob([resultsData.csv_data], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock_backtest_${backtestId}_trades.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

function showError(message) {
    document.getElementById('loadingSection').style.display = 'none';
    document.getElementById('errorSection').style.display = 'block';
    document.getElementById('errorMessage').textContent = message;
}

// Section toggle for mobile
function toggleSection(contentId, headerElement) {
    const content = document.getElementById(contentId);
    const icon = headerElement.querySelector('.collapse-icon');
    
    if (content && icon) {
        content.classList.toggle('collapsed');
        icon.classList.toggle('collapsed');
    }
}

// Chart modal functions
function expandChart() {
    if (!chartData) return;
    
    const modal = document.getElementById('chartModal');
    modal.classList.add('active');
    
    // Create chart in modal
    const ctx = document.getElementById('modalEquityChart');
    
    if (modalEquityCurveChart) {
        modalEquityCurveChart.destroy();
    }
    
    const finalValue = chartData.values[chartData.values.length - 1];
    const lineColor = finalValue >= 0 ? '#2563eb' : '#d14343';
    const backgroundColor = finalValue >= 0 ? 'rgba(37, 99, 235, 0.12)' : 'rgba(209, 67, 67, 0.12)';
    
    const modalMinVal = Math.min(...chartData.values);
    const modalMaxVal = Math.max(...chartData.values);
    const modalRange = modalMaxVal - modalMinVal || 1;
    const modalYPadding = modalRange * 0.005;
    
    modalEquityCurveChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: 'Cumulative P&L ($)',
                data: chartData.values,
                borderColor: lineColor,
                backgroundColor: backgroundColor,
                borderWidth: 1,
                fill: true,
                tension: 0.18,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: lineColor,
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { top: 0, right: 0, bottom: 0, left: 0 }
            },
            plugins: {
                legend: { display: true, position: 'top' },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return 'Cumulative P&L: ' + formatCurrency(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    title: { display: true, text: 'Trade sequence', font: { size: 14, weight: 'bold' } },
                    grid: { display: false }
                },
                y: {
                    display: true,
                    min: modalMinVal - modalYPadding,
                    max: modalMaxVal + modalYPadding,
                    title: { display: true, text: 'Cumulative P&L ($)', font: { size: 14, weight: 'bold' } },
                    position: 'right',
                    grid: { color: 'rgba(98, 116, 138, 0.14)' },
                    ticks: {
                        callback: function(value) {
                            return '$' + Math.round(value).toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

function closeChartModal() {
    const modal = document.getElementById('chartModal');
    modal.classList.remove('active');
    
    if (modalEquityCurveChart) {
        modalEquityCurveChart.destroy();
        modalEquityCurveChart = null;
    }
}

let dtDays = [];
let dtPage = 1;
const dtPerPage = 10;

function buildDecisionTree(decisionLog, config) {
    if (!decisionLog || decisionLog.length === 0) return;

    dtDays = decisionLog;

    document.getElementById('decisionTreeSection').style.display = '';
    document.getElementById('dtTotalCount').textContent = dtDays.length;

    const prevBtn = document.getElementById('dtPrevBtn');
    const nextBtn = document.getElementById('dtNextBtn');
    if (prevBtn) prevBtn.onclick = () => { if (dtPage > 1) { dtPage--; renderDtPage(config); } };
    if (nextBtn) nextBtn.onclick = () => { if (dtPage < Math.ceil(dtDays.length / dtPerPage)) { dtPage++; renderDtPage(config); } };

    dtPage = 1;
    renderDtPage(config);
}

function formatExitReason(reason) {
    if (!reason) return 'N/A';
    const map = {
        'take_profit': 'Take Profit',
        'stop_loss': 'Stop Loss',
        'max_days': 'Max Days',
        'end_of_backtest': 'End of Backtest'
    };
    return map[reason] || reason.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

let _stkDayPriceChartInst    = null;
let _stkDayIndicatorChartInst = null;
let _stkDayChartCurrentDay   = null;

function openStkDayChart(dayIdx) {
    const day = dtDays[dayIdx];
    if (!day || !day.bars || day.bars.length === 0) return;
    _stkDayChartCurrentDay = day;
    document.getElementById('stkDayChartTitle').textContent = (day.symbol || '') + ' \u2014 ' + day.date;
    document.getElementById('stkDayChartIndicator').value = 'none';
    document.getElementById('stkDayIndicatorWrap').style.display = 'none';
    document.getElementById('stkDayChartModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(() => _buildStkDayPriceChart(day), 60);
}

function closeStkDayChartModal() {
    document.getElementById('stkDayChartModal').classList.remove('active');
    document.body.style.overflow = '';
    if (_stkDayPriceChartInst)    { _stkDayPriceChartInst.destroy();    _stkDayPriceChartInst    = null; }
    if (_stkDayIndicatorChartInst) { _stkDayIndicatorChartInst.destroy(); _stkDayIndicatorChartInst = null; }
    _stkDayChartCurrentDay = null;
}

function onStkDayChartIndicatorChange() {
    const ind  = document.getElementById('stkDayChartIndicator').value;
    const wrap = document.getElementById('stkDayIndicatorWrap');
    if (!_stkDayChartCurrentDay) return;
    if (ind === 'none') {
        wrap.style.display = 'none';
        if (_stkDayIndicatorChartInst) { _stkDayIndicatorChartInst.destroy(); _stkDayIndicatorChartInst = null; }
        return;
    }
    wrap.style.display = 'block';
    _buildStkDayIndicatorChart(_stkDayChartCurrentDay, ind);
}

function _stkCRSI(closes, w = 14) {
    const rsi = new Array(closes.length).fill(null);
    if (closes.length <= w) return rsi;
    let ag = 0, al = 0;
    for (let i = 1; i <= w; i++) { const d = closes[i] - closes[i-1]; if (d > 0) ag += d; else al -= d; }
    ag /= w; al /= w;
    rsi[w] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    for (let i = w+1; i < closes.length; i++) {
        const d = closes[i] - closes[i-1];
        ag = (ag*(w-1) + (d>0?d:0)) / w; al = (al*(w-1) + (d<0?-d:0)) / w;
        rsi[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    }
    return rsi;
}
function _stkCEMA(vals, span) {
    const k = 2/(span+1), ema = new Array(vals.length).fill(null);
    let f = vals.findIndex(v => v != null && !isNaN(v));
    if (f < 0) return ema;
    ema[f] = vals[f];
    for (let i = f+1; i < vals.length; i++) { const v=vals[i]; ema[i]=(v!=null&&!isNaN(v))?v*k+ema[i-1]*(1-k):ema[i-1]; }
    return ema;
}
function _stkCMACD(closes, s=12, l=26, sig=9) {
    const eS=_stkCEMA(closes,s), eL=_stkCEMA(closes,l);
    const ml=closes.map((_,i)=>eS[i]!=null&&eL[i]!=null?eS[i]-eL[i]:null);
    const sl=_stkCEMA(ml.map(v=>v==null?NaN:v),sig);
    return {macdLine:ml, signalLine:sl, histogram:ml.map((v,i)=>v!=null&&sl[i]!=null?v-sl[i]:null)};
}

function _buildStkDayPriceChart(day) {
    const bars=day.bars||[], labels=bars.map(b=>b[0]), opens=bars.map(b=>b[1]), highs=bars.map(b=>b[2]), lows=bars.map(b=>b[3]), closes=bars.map(b=>b[4]);
    const upC='rgba(16,185,129,0.85)', dnC='rgba(239,68,68,0.82)';
    const wc=bars.map((_,i)=>closes[i]>=opens[i]?upC:dnC);
    const et=(day.events||[]).filter(e=>e.type==='entry'&&e.time).map(e=>e.time.slice(11,16));
    const xt=(day.events||[]).filter(e=>e.type==='exit' &&e.time).map(e=>e.time.slice(11,16));
    if (_stkDayPriceChartInst) { _stkDayPriceChartInst.destroy(); _stkDayPriceChartInst=null; }
    const ctx=document.getElementById('stkDayPriceChart');
    _stkDayPriceChartInst = new Chart(ctx, {
        type:'bar', data:{ labels, datasets:[
            {label:'Wick',data:bars.map((_,i)=>[lows[i],highs[i]]),backgroundColor:wc,borderColor:wc,borderWidth:0,barPercentage:0.15,categoryPercentage:1,order:2},
            {label:'Body',data:bars.map((_,i)=>[opens[i],closes[i]]),backgroundColor:wc,borderColor:wc,borderWidth:0,barPercentage:0.6,categoryPercentage:1,order:1},
            {label:'Entry',type:'scatter',data:labels.map((l,i)=>et.includes(l)?{x:l,y:lows[i]*0.9995}:null).filter(v=>v),backgroundColor:'#10b981',borderColor:'#fff',borderWidth:1.5,pointStyle:'triangle',pointRadius:8,order:0,showLine:false},
            {label:'Exit', type:'scatter',data:labels.map((l,i)=>xt.includes(l)?{x:l,y:highs[i]*1.0005}:null).filter(v=>v),backgroundColor:'#f59e0b',borderColor:'#fff',borderWidth:1.5,pointStyle:'triangle',rotation:180,pointRadius:8,order:0,showLine:false}
        ]},
        options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false},tooltip:{callbacks:{label(c){if(c.dataset.label==='Entry')return`Entry @ ${c.raw.y.toFixed(2)}`;if(c.dataset.label==='Exit')return`Exit @ ${c.raw.y.toFixed(2)}`;const i=c.dataIndex;return[`O: ${opens[i].toFixed(2)}`,`H: ${highs[i].toFixed(2)}`,`L: ${lows[i].toFixed(2)}`,`C: ${closes[i].toFixed(2)}`];}},backgroundColor:'#1a2535',titleColor:'#94a3b8',bodyColor:'#e2e8f0',borderColor:'#2d3f54',borderWidth:1}},scales:{x:{ticks:{color:'#64748b',maxRotation:0,autoSkip:true,maxTicksLimit:14,font:{size:11}},grid:{color:'rgba(255,255,255,0.04)'}},y:{ticks:{color:'#64748b',font:{size:11}},grid:{color:'rgba(255,255,255,0.04)'}}}}
    });
}

function _buildStkDayIndicatorChart(day, indicator) {
    if (_stkDayIndicatorChartInst) { _stkDayIndicatorChartInst.destroy(); _stkDayIndicatorChartInst=null; }
    const allBars=[...(day.seed_bars||[]),...(day.bars||[])], allCloses=allBars.map(b=>b[4]);
    const labels=(day.bars||[]).map(b=>b[0]), offset=(day.seed_bars||[]).length;
    const ctx=document.getElementById('stkDayIndicatorChart'), label=document.getElementById('stkDayIndicatorLabel');
    if (indicator==='rsi') {
        label.textContent='RSI (14)';
        const rsiDay=_stkCRSI(allCloses,14).slice(offset);
        _stkDayIndicatorChartInst = new Chart(ctx, {
            type:'line', data:{labels, datasets:[{label:'RSI',data:rsiDay,borderColor:'#818cf8',backgroundColor:'transparent',borderWidth:1.5,pointRadius:0,tension:0.2,spanGaps:true}]},
            options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`RSI: ${c.parsed.y!=null?c.parsed.y.toFixed(2):'N/A'}`},backgroundColor:'#1a2535',titleColor:'#94a3b8',bodyColor:'#e2e8f0',borderColor:'#2d3f54',borderWidth:1}},scales:{x:{ticks:{color:'#4a5568',font:{size:10},maxTicksLimit:10,autoSkip:true,maxRotation:0},grid:{color:'rgba(255,255,255,0.03)'}},y:{min:0,max:100,ticks:{color:'#4a5568',font:{size:10},stepSize:25},grid:{color:'rgba(255,255,255,0.03)'}}}},
            plugins:[{id:'rsiLines',afterDraw(chart){const{ctx:c,chartArea:{left,right},scales:{y}}=chart;[70,50,30].forEach(lvl=>{const yp=y.getPixelForValue(lvl);c.save();c.strokeStyle=lvl===50?'rgba(148,163,184,0.3)':(lvl===70?'rgba(239,68,68,0.4)':'rgba(16,185,129,0.4)');c.lineWidth=1;c.setLineDash([4,4]);c.beginPath();c.moveTo(left,yp);c.lineTo(right,yp);c.stroke();c.restore();})}}]
        });
    } else if (indicator==='macd') {
        label.textContent='MACD (12, 26, 9)';
        const {macdLine,signalLine,histogram}=_stkCMACD(allCloses);
        const md=macdLine.slice(offset), sd=signalLine.slice(offset), hd=histogram.slice(offset);
        _stkDayIndicatorChartInst = new Chart(ctx, {
            type:'bar', data:{labels, datasets:[
                {label:'Histogram',type:'bar', data:hd, backgroundColor:hd.map(v=>v==null?'transparent':v>=0?'rgba(16,185,129,0.55)':'rgba(239,68,68,0.55)'),borderColor:'transparent',borderWidth:0,barPercentage:0.8,categoryPercentage:1,order:2},
                {label:'MACD',     type:'line',data:md, borderColor:'#60a5fa',backgroundColor:'transparent',borderWidth:1.5,pointRadius:0,tension:0.15,spanGaps:true,order:1},
                {label:'Signal',   type:'line',data:sd, borderColor:'#f97316',backgroundColor:'transparent',borderWidth:1.5,borderDash:[4,3],pointRadius:0,tension:0.15,spanGaps:true,order:0}
            ]},
            options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:true,position:'top',labels:{color:'#64748b',font:{size:10},boxWidth:20,padding:10}},tooltip:{backgroundColor:'#1a2535',titleColor:'#94a3b8',bodyColor:'#e2e8f0',borderColor:'#2d3f54',borderWidth:1}},scales:{x:{ticks:{color:'#4a5568',font:{size:10},maxTicksLimit:10,autoSkip:true,maxRotation:0},grid:{color:'rgba(255,255,255,0.03)'}},y:{ticks:{color:'#4a5568',font:{size:10}},grid:{color:'rgba(255,255,255,0.03)'}}}}
        });
    }
}

function formatTime(timeStr) {
    if (!timeStr) return '';
    const parts = timeStr.replace('T', ' ').split(' ');
    if (parts.length >= 2) {
        const timePart = parts[1].split('-')[0].split('+')[0];
        return timePart;
    }
    return timeStr;
}

function _fmtMetricValue(v) {
    if (v == null) return 'N/A';
    const n = parseFloat(v);
    return isNaN(n) ? String(v) : (Number.isInteger(n) ? n.toString() : n.toFixed(4).replace(/\.?0+$/, ''));
}

function _buildEntryMetricsHtml(em, showLeft) {
    if (!em) return '';
    let parts = [];
    if (showLeft && em.left_label != null && em.left_value != null) {
        parts.push(`<span style="background:#dbeafe; color:#1e40af; padding:2px 8px; border-radius:6px; font-size:11px; font-weight:600;">${em.left_label}: ${_fmtMetricValue(em.left_value)}</span>`);
    }
    if (em.right_label != null && em.effective_right != null) {
        const threshStr = em.threshold && em.threshold !== 0
            ? ` <span style="color:#94a3b8; font-size:10px;">(base ${_fmtMetricValue(em.right_value)} ${em.threshold > 0 ? '+' : ''}${em.threshold}${em.threshold_unit || '%'})</span>`
            : '';
        parts.push(`<span style="background:#e0e7ff; color:#3730a3; padding:2px 8px; border-radius:6px; font-size:11px; font-weight:600;">${em.right_label}: ${_fmtMetricValue(em.effective_right)}${threshStr}</span>`);
    }
    if (!parts.length) return '';
    return `<div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:5px;">${parts.join('')}</div>`;
}

function renderDtPage(config) {
    const body = document.getElementById('decisionTreeBody');
    const totalPages = Math.ceil(dtDays.length / dtPerPage);
    const start = (dtPage - 1) * dtPerPage;
    const end = Math.min(start + dtPerPage, dtDays.length);

    document.getElementById('dtRangeStart').textContent = dtDays.length > 0 ? start + 1 : 0;
    document.getElementById('dtRangeEnd').textContent = end;

    const prevBtn = document.getElementById('dtPrevBtn');
    const nextBtn = document.getElementById('dtNextBtn');
    if (prevBtn) prevBtn.disabled = dtPage <= 1;
    if (nextBtn) nextBtn.disabled = dtPage >= totalPages;

    const dir = config?.direction ? config.direction.charAt(0).toUpperCase() + config.direction.slice(1) : 'Long';

    body.innerHTML = dtDays.slice(start, end).map((day, relIdx) => {
        const dayIdx = start + relIdx;
        const status = day.status || 'SKIPPED';
        let badgeColor, badgeText, headerBg;
        switch (status) {
            case 'ENTRY':
                badgeColor = '#10b981'; badgeText = 'Entry'; headerBg = '#f0fdf4'; break;
            case 'EXIT':
                badgeColor = '#f59e0b'; badgeText = 'Exit'; headerBg = '#fffbeb'; break;
            case 'EXIT_AND_ENTRY':
                badgeColor = '#3b7cff'; badgeText = 'Exit + Re-Entry'; headerBg = '#eff6ff'; break;
            case 'HOLDING':
                badgeColor = '#8b5cf6'; badgeText = 'Holding'; headerBg = '#f5f3ff'; break;
            case 'SKIPPED':
            default:
                badgeColor = '#94a3b8'; badgeText = 'Skipped'; headerBg = '#f8fafc'; break;
        }

        const exitEvents = (day.events || []).filter(e => e.type === 'exit');
        const dayPnl = exitEvents.reduce((s, e) => s + (e.pnl || 0), 0);
        const hasPnl = exitEvents.length > 0;

        let flowHtml = '';

        // ── Day-level context row ─────────────────────────────────────────────
        flowHtml += `<div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px;">`;
        if (day.prev_close != null) {
            flowHtml += `<div style="display:flex; align-items:center; gap:7px; padding:6px 12px; background:#f1f5f9; border-radius:8px; flex:1; min-width:160px;">
                <i class="fas fa-chart-line" style="color:#64748b; font-size:12px;"></i>
                <span style="color:#475569; font-size:12px;"><strong>Prev Close:</strong> $${day.prev_close.toFixed(2)}</span>
            </div>`;
        }
        if (day.condition) {
            flowHtml += `<div style="display:flex; align-items:center; gap:7px; padding:6px 12px; background:#f1f5f9; border-radius:8px; flex:2; min-width:200px;">
                <i class="fas fa-filter" style="color:#64748b; font-size:12px;"></i>
                <span style="color:#475569; font-size:12px;"><strong>Condition:</strong> ${day.condition}</span>
            </div>`;
        }
        flowHtml += `</div>`;

        // ── Event timeline ────────────────────────────────────────────────────
        flowHtml += '<div style="border-left:2px solid #e2e8f0; margin-left:20px; padding-left:16px;">';

        (day.events || []).forEach(evt => {

            if (evt.type === 'no_data') {
                flowHtml += `<div style="display:flex; align-items:flex-start; gap:10px; padding:8px 12px; background:#f8fafc; border-radius:8px; margin-bottom:6px; border-left:3px solid #94a3b8;">
                    <i class="fas fa-database" style="color:#94a3b8; margin-top:2px;"></i>
                    <div>
                        <div style="font-weight:600; color:#64748b; font-size:13px;">NO DATA</div>
                        <div style="color:#94a3b8; font-size:12px;">${evt.reason || 'No market data available for this day'}</div>
                    </div>
                </div>`;

            } else if (evt.type === 'no_signal') {
                const metricsHtml = _buildEntryMetricsHtml(evt.entry_metrics, false);
                let rangeHtml = '';
                if (evt.day_high != null && evt.day_low != null) {
                    rangeHtml = `<div style="color:#94a3b8; font-size:11px; margin-top:4px;">Day range: $${evt.day_low.toFixed(2)} – $${evt.day_high.toFixed(2)}</div>`;
                }
                flowHtml += `<div style="display:flex; align-items:flex-start; gap:10px; padding:8px 12px; background:#f8fafc; border-radius:8px; margin-bottom:6px; border-left:3px solid #94a3b8;">
                    <i class="fas fa-ban" style="color:#94a3b8; margin-top:2px;"></i>
                    <div style="flex:1;">
                        <div style="font-weight:600; color:#64748b; font-size:13px;">CONDITIONS NOT MET</div>
                        <div style="color:#94a3b8; font-size:12px;">${evt.reason || 'Entry condition not satisfied'}</div>
                        ${metricsHtml}
                        ${rangeHtml}
                    </div>
                </div>`;

            } else if (evt.type === 'condition_met') {
                const metricsHtml = _buildEntryMetricsHtml(evt.entry_metrics, true);
                let computedLine = '';
                if (evt.computed_value != null) {
                    computedLine = `<span style="background:#d1fae5; color:#065f46; padding:1px 7px; border-radius:5px; font-size:11px; font-weight:600; margin-left:6px;">Δ ${evt.computed_value > 0 ? '+' : ''}${evt.computed_value}%</span>`;
                }
                flowHtml += `<div style="display:flex; align-items:flex-start; gap:10px; padding:8px 12px; background:#ecfdf5; border-radius:8px; margin-bottom:6px; border-left:3px solid #10b981;">
                    <i class="fas fa-check-circle" style="color:#10b981; margin-top:2px;"></i>
                    <div style="flex:1;">
                        <div style="font-weight:600; color:#065f46; font-size:13px;">CONDITIONS MET</div>
                        <div style="color:#475569; font-size:12px; display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
                            Price @ ${formatTime(evt.time)}: <strong>$${evt.price != null ? evt.price.toFixed(2) : 'N/A'}</strong>
                            <span style="color:#94a3b8;">(${evt.price_point || 'close'})</span>${computedLine}
                        </div>
                        ${metricsHtml}
                    </div>
                </div>`;

            } else if (evt.type === 'entry' || evt.type === 're_entry') {
                const label = evt.type === 're_entry' ? 'RE-ENTRY' : 'ENTRY';
                const icon  = evt.type === 're_entry' ? 'fa-redo' : 'fa-sign-in-alt';
                flowHtml += `<div style="display:flex; align-items:flex-start; gap:10px; padding:8px 12px; background:#f0fdf4; border-radius:8px; margin-bottom:6px; border-left:3px solid #10b981;">
                    <i class="fas ${icon}" style="color:#10b981; margin-top:2px;"></i>
                    <div>
                        <div style="font-weight:600; color:#1e293b; font-size:13px;">${label} @ ${formatTime(evt.time)} — Trade #${evt.trade_num || '?'}</div>
                        <div style="color:#475569; font-size:12px;">${dir} <strong>${evt.shares || '—'} shares</strong> @ $${evt.price != null ? evt.price.toFixed(2) : 'N/A'}</div>
                        ${evt.exit_criteria ? `<div style="color:#64748b; font-size:11px; margin-top:2px;">${evt.exit_criteria}</div>` : ''}
                    </div>
                </div>`;

            } else if (evt.type === 'holding') {
                const currentPrice = evt.current_price;
                const unrealPnl = currentPrice != null && evt.entry_price != null
                    ? (dir === 'Long' ? currentPrice - evt.entry_price : evt.entry_price - currentPrice) * (evt.shares || 0)
                    : null;
                const upColor = unrealPnl == null ? '#475569' : unrealPnl >= 0 ? '#10b981' : '#ef4444';
                flowHtml += `<div style="display:flex; align-items:flex-start; gap:10px; padding:8px 12px; background:#f5f3ff; border-radius:8px; margin-bottom:6px; border-left:3px solid #8b5cf6;">
                    <i class="fas fa-clock" style="color:#8b5cf6; margin-top:2px;"></i>
                    <div>
                        <div style="font-weight:600; color:#5b21b6; font-size:13px;">IN POSITION — Trade #${evt.trade_num || '?'} (Day ${evt.days_held || '?'})</div>
                        <div style="color:#475569; font-size:12px;">Entered ${evt.entry_date || '?'} @ $${evt.entry_price != null ? evt.entry_price.toFixed(2) : 'N/A'}${unrealPnl != null ? ` | Unrealized: <span style="font-weight:600; color:${upColor};">$${unrealPnl.toFixed(2)}</span>` : ''}</div>
                    </div>
                </div>`;

            } else if (evt.type === 'exit') {
                const pnl = evt.pnl || 0;
                const pnlColor = pnl >= 0 ? '#10b981' : '#ef4444';
                const bgColor  = pnl >= 0 ? '#f0fdf4' : '#fef2f2';
                const bdColor  = pnl >= 0 ? '#10b981' : '#ef4444';
                const exitIcon = (evt.reason || '').includes('stop')   ? 'fa-shield-alt' :
                                 (evt.reason || '').includes('profit')  ? 'fa-bullseye' :
                                 (evt.reason || '').includes('max')     ? 'fa-hourglass-end' : 'fa-sign-out-alt';
                flowHtml += `<div style="display:flex; align-items:flex-start; gap:10px; padding:8px 12px; background:${bgColor}; border-radius:8px; margin-bottom:6px; border-left:3px solid ${bdColor};">
                    <i class="fas ${exitIcon}" style="color:${pnlColor}; margin-top:2px;"></i>
                    <div>
                        <div style="font-weight:600; color:#1e293b; font-size:13px;">EXIT — Trade #${evt.trade_num || '?'} (${formatExitReason(evt.reason)})</div>
                        <div style="color:#475569; font-size:12px;">@ ${formatTime(evt.time)}: $${evt.price != null ? evt.price.toFixed(2) : 'N/A'} | Entry $${evt.entry_price != null ? evt.entry_price.toFixed(2) : 'N/A'}</div>
                        <div style="font-weight:700; font-size:13px; margin-top:3px; color:${pnlColor};">P&L: $${pnl.toFixed(2)} <span style="font-weight:500; font-size:12px;">(${(evt.pnl_pct || 0).toFixed(2)}%)</span></div>
                    </div>
                </div>`;

            } else if (evt.type === 'skip_consecutive') {
                flowHtml += `<div style="display:flex; align-items:flex-start; gap:10px; padding:8px 12px; background:#fffbeb; border-radius:8px; margin-bottom:6px; border-left:3px solid #f59e0b;">
                    <i class="fas fa-exclamation-triangle" style="color:#f59e0b; margin-top:2px;"></i>
                    <div>
                        <div style="font-weight:600; color:#92400e; font-size:13px;">SIGNAL SKIPPED</div>
                        <div style="color:#78716c; font-size:12px;">${evt.reason || 'Consecutive trades disabled'}</div>
                    </div>
                </div>`;

            } else if (evt.type === 'error') {
                flowHtml += `<div style="display:flex; align-items:flex-start; gap:10px; padding:8px 12px; background:#fef2f2; border-radius:8px; margin-bottom:6px; border-left:3px solid #ef4444;">
                    <i class="fas fa-exclamation-circle" style="color:#ef4444; margin-top:2px;"></i>
                    <div>
                        <div style="font-weight:600; color:#991b1b; font-size:13px;">ERROR</div>
                        <div style="color:#78716c; font-size:12px;">${evt.reason || 'Unknown error occurred'}</div>
                    </div>
                </div>`;
            }
        });

        flowHtml += '</div>';

        return `
            <div style="border:1px solid #e2e8f0; border-radius:12px; margin-bottom:12px; overflow:hidden;">
                <div onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'; this.querySelector('.dt-chevron').classList.toggle('collapsed')" style="padding:12px 16px; background:${headerBg}; cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                        <i class="fas fa-calendar-day" style="color:#3b7cff;"></i>
                        <span style="font-weight:600; font-size:15px;">${day.date}</span>
                        <span style="font-weight:600; font-size:11px; color:#475569;">${day.symbol || ''}</span>
                        <span style="background:${badgeColor}; color:#fff; padding:2px 10px; border-radius:12px; font-size:11px; font-weight:600;">${badgeText}</span>
                        ${hasPnl ? `<span style="color:${dayPnl >= 0 ? '#10b981' : '#ef4444'}; font-weight:700; font-size:13px;">P&L: $${dayPnl.toFixed(2)}</span>` : ''}
                    </div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        ${(day.bars && day.bars.length > 0) ? `<button class="day-chart-btn" onclick="event.stopPropagation(); openStkDayChart(${dayIdx})" title="View intraday price chart"><i class="fas fa-chart-area"></i> View Chart</button>` : ''}
                        <i class="fas fa-chevron-down dt-chevron" style="color:#94a3b8; transition:transform 0.2s;"></i>
                    </div>
                </div>
                <div style="padding:12px 16px; display:none;">
                    ${flowHtml}
                </div>
            </div>
        `;
    }).join('');
}
