// Stock Backtest Results V3.0 - Results Display Script
// Loads and displays detailed backtest results with polling support

let backtestId = null;
let originPage = null;

// Handle back navigation
function goBack() {
    // Always go to dashboard stock results section
    window.location.href = '/dashboard?section=stockResults';
}
let resultsData = null;
let allTrades = [];
let currentPage = 1;
const tradesPerPage = 10;
let pollingInterval = null;
let equityCurveChart = null;
let modalEquityCurveChart = null;
let chartData = null;

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
    document.getElementById('statTotalTrades').textContent = stats.total_trades || 0;
    
    const winRate = document.getElementById('statWinRate');
    const winRateVal = stats.win_rate || 0;
    winRate.textContent = `${winRateVal.toFixed(1)}%`;
    if (winRateVal >= 50) winRate.classList.add('positive');
    
    const totalPL = document.getElementById('statTotalPL');
    const totalPLVal = stats.total_pnl || 0;
    totalPL.textContent = `$${totalPLVal.toFixed(2)}`;
    if (totalPLVal > 0) totalPL.classList.add('positive');
    else if (totalPLVal < 0) totalPL.classList.add('negative');
    
    document.getElementById('statAvgWin').textContent = `$${(stats.avg_win || 0).toFixed(2)}`;
    document.getElementById('statAvgLoss').textContent = `$${(stats.avg_loss || 0).toFixed(2)}`;
    
    const profitFactor = document.getElementById('statProfitFactor');
    const pfVal = stats.profit_factor || 0;
    profitFactor.textContent = pfVal.toFixed(2);
    if (pfVal > 1) profitFactor.classList.add('positive');
    else if (pfVal < 1) profitFactor.classList.add('negative');
    
    const maxDD = document.getElementById('statMaxDrawdown');
    const ddVal = stats.max_drawdown || 0;
    maxDD.textContent = `${ddVal.toFixed(2)}%`;
    if (ddVal < 0) maxDD.classList.add('negative');
    
    const totalReturn = document.getElementById('statTotalReturn');
    const returnVal = stats.total_return || 0;
    totalReturn.textContent = `${returnVal.toFixed(2)}%`;
    if (returnVal > 0) totalReturn.classList.add('positive');
    else if (returnVal < 0) totalReturn.classList.add('negative');
}

function displayEquityCurve(trades) {
    if (!trades || trades.length === 0) {
        const container = document.getElementById('equityCurveContainer');
        container.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #9ca3af;">No trades to display</div>';
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
    const lineColor = finalValue >= 0 ? '#10b981' : '#ef4444';
    const backgroundColor = finalValue >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';
    const isMobile = window.innerWidth <= 480;
    
    const ctx = document.getElementById('equityChart');

    if (equityCurveChart) {
        equityCurveChart.destroy();
    }

    if (container) {
        container.style.height = isMobile ? '240px' : '400px';
    }
    
    equityCurveChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Balance ($)',
                data: values,
                borderColor: lineColor,
                backgroundColor: backgroundColor,
                borderWidth: isMobile ? 2.5 : 2,
                fill: true,
                tension: 0.1,
                pointRadius: isMobile ? 0 : 3,
                pointHoverRadius: isMobile ? 3 : 5,
                pointBackgroundColor: lineColor,
                pointBorderColor: '#fff',
                pointBorderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return 'Balance: $' + context.parsed.y.toFixed(2);
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    title: { display: true, text: 'Trade', font: { size: 11 } },
                    grid: { display: false },
                    ticks: { 
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: isMobile ? 5 : 10,
                        font: { size: isMobile ? 9 : 10 }
                    }
                },
                y: {
                    display: true,
                    title: { display: false },
                    grid: { color: 'rgba(0, 0, 0, 0.05)' },
                    ticks: {
                        font: { size: isMobile ? 9 : 10 },
                        maxTicksLimit: isMobile ? 5 : 8,
                        callback: function(value) {
                            return '$' + value.toFixed(0);
                        }
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
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
        alert('No CSV data available');
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
    const lineColor = finalValue >= 0 ? '#10b981' : '#ef4444';
    const backgroundColor = finalValue >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';
    
    modalEquityCurveChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: 'Balance ($)',
                data: chartData.values,
                borderColor: lineColor,
                backgroundColor: backgroundColor,
                borderWidth: 3,
                fill: true,
                tension: 0.1,
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
            plugins: {
                legend: { display: true, position: 'top' },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return 'Balance: $' + context.parsed.y.toFixed(2);
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    title: { display: true, text: 'Trade', font: { size: 14, weight: 'bold' } },
                    grid: { display: false }
                },
                y: {
                    display: true,
                    title: { display: true, text: 'Cumulative P&L ($)', font: { size: 14, weight: 'bold' } },
                    grid: { color: 'rgba(0, 0, 0, 0.05)' },
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toFixed(0);
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


window.addEventListener('resize', () => {
    if (equityCurveChart) {
        equityCurveChart.resize();
    }
});
