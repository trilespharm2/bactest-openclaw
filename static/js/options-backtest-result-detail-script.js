// Options Backtest Result Detail Script
// Loads and displays detailed backtest results with configuration, stats, equity curve, and trade log

let backtestId = null;
let originPage = null;

// Handle back navigation
function goBack() {
    window.location.href = '/dashboard?section=optionsResults';
}

function useTemplate() {
    if (backtestConfig && Object.keys(backtestConfig).length > 0) {
        sessionStorage.setItem('optionsBacktestUseTemplate', JSON.stringify(backtestConfig));
        window.location.href = '/dashboard?section=backtester';
    }
}

function goBackOld() {
    const params = new URLSearchParams(window.location.search);
    originPage = params.get('from');
    
    if (originPage) {
        // Navigate back to the SPA with the correct page
        window.location.href = '/?page=' + originPage;
    } else if (document.referrer && document.referrer.includes(window.location.host)) {
        // Try browser back if we came from the same site
        history.back();
    } else {
        // Default to options results page
        window.location.href = '/?page=optionsResults';
    }
}
let resultsData = null;
let backtestConfig = null;
let allTrades = [];
let currentPage = 1;
const tradesPerPage = 10;
let equityChart = null;
let initialCapital = 50000; // Default, will be updated from config
let storedEquityData = null; // Store equity curve data for expanded chart
let storedLabels = null;


// Initialize page
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Options Backtest Result Detail Page Initialized');
    
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
    
    // Load results
    await loadResults();
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

let pollingInterval = null;

async function loadResults() {
    try {
        console.log('Fetching metadata...');
        
        // Fetch metadata
        const metadataResponse = await authFetch(`/api/files/metadata/${backtestId}`);
        
        if (!metadataResponse.ok) {
            throw new Error('Failed to load backtest metadata');
        }
        
        const metadata = await metadataResponse.json();
        console.log('Metadata loaded:', metadata);
        
        // Hide loading, show main layout (grid for proper layout)
        document.getElementById('loadingSection').style.display = 'none';
        document.getElementById('mainLayout').style.display = 'grid';
        
        // Get initial capital from config
        if (metadata.config && metadata.config.initial_capital) {
            initialCapital = metadata.config.initial_capital;
        }
        
        backtestConfig = metadata.config || {};
        displayConfiguration(metadata);

        if (backtestConfig && Object.keys(backtestConfig).length > 0) {
            document.getElementById('useTemplateBtn').style.display = '';
        }
        
        // Check if backtest is still running
        if (metadata.status === 'running') {
            console.log('Backtest is running, showing loading state...');
            showLoadingState();
            startPolling();
        } else if (metadata.status === 'error') {
            showError(metadata.error || 'Backtest failed');
        } else {
            // Completed - display full results
            displayStatistics(metadata);
            await displayTradeLog(backtestId);
            
            // Build decision tree from metadata (independent of trade log CSV)
            if (metadata.decision_log && metadata.decision_log.length > 0) {
                buildOptDecisionTreeFromLog(metadata.decision_log);
            }
        }
        
    } catch (error) {
        console.error('Error loading results:', error);
        showError(error.message);
    }
}

function showLoadingState() {
    // Show loading animation in equity curve area
    const equityContainer = document.querySelector('.equity-curve-container');
    if (equityContainer) {
        equityContainer.innerHTML = `
            <div class="equity-loading">
                <div class="loading-spinner"></div>
                <p>Running backtest...</p>
                <p class="loading-hint">Your configuration is ready. Results will appear when complete.</p>
            </div>
        `;
    }
    
    // Clear stats with placeholder
    const statsList = document.getElementById('statsList');
    if (statsList) {
        statsList.innerHTML = '<div class="stats-loading">Waiting for results...</div>';
    }
    
    // Clear trade log with placeholder
    const tradesBody = document.getElementById('tradesTableBody');
    if (tradesBody) {
        tradesBody.innerHTML = '<tr><td colspan="8" class="trades-loading">Waiting for trades...</td></tr>';
    }
}

function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    
    pollingInterval = setInterval(async () => {
        try {
            const statusResponse = await authFetch(`/api/backtest/status/${backtestId}`);
            const status = await statusResponse.json();
            
            console.log('Polling status:', status);
            
            if (status.status === 'completed') {
                clearInterval(pollingInterval);
                pollingInterval = null;
                // Reload full results
                await loadCompletedResults();
            } else if (status.status === 'error') {
                clearInterval(pollingInterval);
                pollingInterval = null;
                showError(status.error || 'Backtest failed');
            }
        } catch (error) {
            console.error('Polling error:', error);
        }
    }, 2000); // Poll every 2 seconds
}

async function loadCompletedResults() {
    try {
        // Fetch updated metadata
        const metadataResponse = await authFetch(`/api/files/metadata/${backtestId}`);
        const metadata = await metadataResponse.json();
        
        // Hide loading section and show main layout
        document.getElementById('loadingSection').style.display = 'none';
        document.getElementById('mainLayout').style.display = 'grid';
        
        // Restore the canvas element for the equity chart (loading state removes it)
        const equityContainer = document.getElementById('equityCurveContainer');
        if (equityContainer) {
            equityContainer.innerHTML = '<canvas id="equityChart"></canvas>';
        }
        
        // Display configuration and statistics
        displayConfiguration(metadata);
        displayStatistics(metadata);
        
        // Small delay to ensure DOM is ready for chart rendering
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Load and display trade log (this also builds the equity curve)
        await displayTradeLog(backtestId);
        
        // Build decision tree from metadata (independent of trade log CSV)
        if (metadata.decision_log && metadata.decision_log.length > 0) {
            buildOptDecisionTreeFromLog(metadata.decision_log);
        }
        
        console.log('Results loaded successfully');
        
    } catch (error) {
        console.error('Error loading completed results:', error);
        showError(error.message);
    }
}

function displayConfiguration(metadata) {
    const list = document.getElementById('configList');
    
    // Metadata structure: { id, timestamp, config: {...}, summary: {...}, files: {...} }
    const config = metadata.config || {};
    
    // Update title
    document.getElementById('backtestTitle').textContent = config.strategy || 'Options Backtest';
    
    // Build configuration items
    const configItems = [];
    
    // Strategy
    if (config.strategy) {
        configItems.push({
            label: 'Strategy',
            value: config.strategy
        });
    }
    
    // Symbol
    if (config.symbol) {
        configItems.push({
            label: 'Symbol',
            value: config.symbol
        });
    }
    
    // Date Range
    if (config.start_date && config.end_date) {
        configItems.push({
            label: 'Date Range',
            value: `${config.start_date} to ${config.end_date}`
        });
    }
    
    // Entry Time
    if (config.entry_time) {
        configItems.push({
            label: 'Entry Time',
            value: config.entry_time
        });
    }
    
    // DTE
    if (config.dte !== undefined) {
        configItems.push({
            label: 'DTE',
            value: config.dte
        });
    }
    
    // Initial Capital
    if (config.initial_capital) {
        configItems.push({
            label: 'Initial Capital',
            value: `$${config.initial_capital.toLocaleString()}`
        });
    }
    
    // Allocation
    if (config.allocation_type && config.allocation_value) {
        const allocType = config.allocation_type === 'pct' ? 'Percentage' : 'Dollar';
        const allocVal = config.allocation_type === 'pct' 
            ? `${config.allocation_value}%` 
            : `$${config.allocation_value}`;
        configItems.push({
            label: 'Position Sizing',
            value: `${allocType}: ${allocVal}`
        });
    }
    
    // Take Profit
    if (config.take_profit_pct) {
        configItems.push({
            label: 'Take Profit',
            value: `${config.take_profit_pct}%`
        });
    } else if (config.take_profit_dollar) {
        configItems.push({
            label: 'Take Profit',
            value: `$${config.take_profit_dollar}`
        });
    }
    
    // Stop Loss
    if (config.stop_loss_pct) {
        configItems.push({
            label: 'Stop Loss',
            value: `${config.stop_loss_pct}%`
        });
    } else if (config.stop_loss_dollar) {
        configItems.push({
            label: 'Stop Loss',
            value: `$${config.stop_loss_dollar}`
        });
    }
    
    // Net Premium Filter
    if (config.net_premium_min || config.net_premium_max) {
        let filterText = '';
        if (config.net_premium_min && config.net_premium_max) {
            filterText = `$${config.net_premium_min.toFixed(2)} - $${config.net_premium_max.toFixed(2)}`;
        } else if (config.net_premium_min) {
            filterText = `Min $${config.net_premium_min.toFixed(2)}`;
        } else if (config.net_premium_max) {
            filterText = `Max $${config.net_premium_max.toFixed(2)}`;
        }
        configItems.push({
            label: 'Premium Filter',
            value: filterText
        });
    }
    
    // Detection Bar Size
    // seconds_interval (e.g. 10 for 10-sec bars) takes priority when present.
    const secInterval = config.seconds_interval || config.secondsInterval || 0;
    if (secInterval > 0) {
        configItems.push({
            label: 'Detection Interval',
            value: `${secInterval} seconds`
        });
    } else if (config.detection_bar_size) {
        let intervalText;
        if (config.detection_bar_size < 1) {
            const seconds = Math.round(config.detection_bar_size * 60);
            intervalText = `${seconds} seconds`;
        } else {
            intervalText = `${config.detection_bar_size} minute${config.detection_bar_size !== 1 ? 's' : ''}`;
        }
        configItems.push({
            label: 'Detection Interval',
            value: intervalText
        });
    }
    
    // Trading Rules
    if (config.avoid_pdt !== undefined) {
        configItems.push({
            label: 'Avoid PDT',
            value: config.avoid_pdt ? 'Yes' : 'No'
        });
    }
    
    if (config.concurrent_trades !== undefined) {
        configItems.push({
            label: 'Concurrent Trades',
            value: config.concurrent_trades ? 'Allowed' : 'Not Allowed'
        });
    }
    
    // Render configuration list
    let html = configItems.map(item => `
        <div class="stat-card">
            <div class="stat-label">${item.label}</div>
            <div class="stat-value">${item.value}</div>
        </div>
    `).join('');
    
    // Legs Configuration (if available) - render separately for better formatting
    // Handle both array format (new) and object format (legacy)
    if (config.legs && (Array.isArray(config.legs) ? config.legs.length > 0 : Object.keys(config.legs).length > 0)) {
        const legsArray = Array.isArray(config.legs) ? config.legs : Object.entries(config.legs).map(([name, cfg]) => ({...cfg, name}));
        
        html += `<div class="stat-card" style="grid-column: 1 / -1;">
            <div class="stat-label">Strategy Legs</div>
            <div class="legs-section">`;
        
        legsArray.forEach((legConfig, index) => {
            const legName = legConfig.name || `Leg ${index + 1}`;
            const configType = legConfig.config_type || 'mid_price';
            const params = legConfig.params || legConfig;
            let desc = '';
            
            if (configType === 'delta') {
                const targetDelta = params.target_delta || params.delta || 0.30;
                const method = params.method || 'closest';
                desc = `Delta: ${targetDelta} (${method})`;
            } else if (configType === 'dollar_underlying') {
                desc = `$${params.amount} ${params.direction} underlying`;
            } else if (configType === 'dollar_leg') {
                const refLegName = params.reference_leg || 
                    (legsArray[parseInt(params.reference)]?.name) || 
                    `Leg ${params.reference}`;
                desc = `$${params.amount} ${params.direction} ${refLegName}`;
            } else if (configType === 'pct_underlying') {
                desc = `${params.pct}% ${params.direction} underlying`;
            } else if (configType === 'pct_leg') {
                const refLegName = params.reference_leg || 
                    (legsArray[parseInt(params.reference)]?.name) || 
                    `Leg ${params.reference}`;
                desc = `${params.pct}% ${params.direction} ${refLegName}`;
            } else if (configType === 'mid_price') {
                if (params.min !== undefined && params.max !== undefined) {
                    desc = `Mid price: $${params.min} - $${params.max}`;
                } else {
                    desc = 'ATM strike';
                }
            }
            
            // Add position and type info
            const position = legConfig.position || 'long';
            const optionType = legConfig.type === 'C' ? 'Call' : legConfig.type === 'P' ? 'Put' : '';
            if (optionType) {
                desc = `${position.charAt(0).toUpperCase() + position.slice(1)} ${optionType} - ${desc}`;
            }
            
            const strikeFallback = params?.strike_fallback || legConfig.strike_fallback;
            if (strikeFallback && strikeFallback !== 'closest') {
                const fallbackLabel = strikeFallback.replace('_', ' ');
                desc += ` (${fallbackLabel})`;
            }
            
            html += `<div class="leg-item"><span class="leg-name">${legName}</span>: ${desc}</div>`;
        });
        
        html += `</div></div>`;
    }

    // Entry Conditions
    const entryType = config.options_entry_type || 'none';
    if (entryType === 'preset' && config.preset_condition) {
        const presetNames = {'1':'Premarket Change %','2':'Change %','3':'Gap %','4':'Change-Open %','5':'Velocity'};
        const condName = presetNames[config.preset_condition] || ('Preset #' + config.preset_condition);
        let pLine = condName + ': ' + (config.preset_operator || '>') + ' ' + (config.preset_threshold || 0) + '%';
        if (config.preset_condition === '5') pLine += ' over ' + (config.velocity_lookback || 5) + ' min';
        html += `<div class="stat-card" style="grid-column: 1 / -1; background:#f0fdf4; border:1px solid #bbf7d0;">
            <div class="stat-label">Entry Conditions</div>
            <div class="stat-value" style="font-size:13px;">${pLine}</div>
        </div>`;
    } else if (entryType === 'custom' && config.price_conditions && config.price_conditions.length > 0) {
        const opLbl = op => ({'cross_up':'↑ Cross Up','cross_down':'↓ Cross Down','cross_either':'↕ Crosses','>=':'≥','<=':'≤','==':'=','><':'≠'}[op] || op);
        const sideFmt = (metric, sideObj) => {
            const s = sideObj || {};
            const day = parseInt(s.day) || 0;
            const candle = s.candle_type || 'minute';
            const series = s.series_type || 'close';
            const win = s.window ? '(' + s.window + ')' : '';
            const tf = s.timeframe_minutes || (parseInt(s.multiplier) || 1);
            const isCP = metric === 'PRICE' && day === 0 && candle === 'minute' && series === 'vwap';
            if (isCP) return 'Current Price';
            const cFmt = c => c === 'minute' ? tf + 'min' : c === 'hour' ? (parseInt(s.multiplier)||1) + 'hr' : c === 'day' ? ((parseInt(s.multiplier)||1) > 1 ? (parseInt(s.multiplier)||1) + 'day' : 'day') : c;
            return metric.toUpperCase() + win + ' ' + series + ' [day ' + day + ', ' + cFmt(candle) + ']';
        };
        const condLines = config.price_conditions.map(pc => {
            const metric = (pc.metric || 'price').toUpperCase();
            const leftDesc = sideFmt(metric, pc.left);
            const op = opLbl(pc.operator || '>');
            let rightDesc = '';
            if (pc.comparator === 'value') {
                rightDesc = String(pc.compare_value != null ? pc.compare_value : '');
            } else {
                const rightMetric = (pc.comparator || '').replace('compare_', '');
                rightDesc = sideFmt(rightMetric, pc.right);
                const tv = parseFloat((pc.threshold || {}).value);
                if (tv) rightDesc += ' ±' + tv + ((pc.threshold.unit === 'percent') ? '%' : '$');
            }
            return leftDesc + ' ' + op + ' ' + rightDesc;
        });
        html += `<div class="stat-card" style="grid-column: 1 / -1; background:#f0fdf4; border:1px solid #bbf7d0;">
            <div class="stat-label">Entry Conditions</div>
            <div>${condLines.map(l => `<div style="font-size:13px; padding:3px 0; border-bottom:1px dashed #d1fae5;">${l}</div>`).join('')}</div>
        </div>`;
    }
    
    list.innerHTML = html;
}

function displayStatistics(metadata) {
    // Stats are in metadata.summary
    const summary = metadata.summary || {};
    
    // Total Trades
    document.getElementById('statTotalTrades').textContent = summary.total_trades || 0;
    
    // Win Rate
    const winRate = document.getElementById('statWinRate');
    winRate.textContent = summary.win_rate !== undefined 
        ? `${summary.win_rate.toFixed(1)}%` 
        : '0.0%';
    if (summary.win_rate >= 50) {
        winRate.classList.add('positive');
    }
    
    // Total P&L
    const totalPL = document.getElementById('statTotalPL');
    totalPL.textContent = summary.total_pnl !== undefined 
        ? `$${summary.total_pnl.toFixed(2)}` 
        : '$0.00';
    if (summary.total_pnl > 0) {
        totalPL.classList.add('positive');
    } else if (summary.total_pnl < 0) {
        totalPL.classList.add('negative');
    }
    
    // Avg Win
    const avgWinEl = document.getElementById('statAvgWin');
    if (avgWinEl) {
        const aw = summary.avg_win || 0;
        avgWinEl.textContent = `$${aw.toFixed(2)}`;
        avgWinEl.className = 'stat-value' + (aw > 0 ? ' positive' : '');
        const awpc = document.getElementById('statAvgWinPerContract');
        if (awpc && summary.avg_win_per_contract !== undefined) {
            awpc.textContent = `$${summary.avg_win_per_contract.toFixed(2)} per contract`;
        }
    }
    // Avg Loss
    const avgLossEl = document.getElementById('statAvgLoss');
    if (avgLossEl) {
        const al = summary.avg_loss || 0;
        avgLossEl.textContent = al !== 0 ? `$${al.toFixed(2)}` : '$0.00';
        avgLossEl.className = 'stat-value' + (al < 0 ? ' negative' : '');
        const alpc = document.getElementById('statAvgLossPerContract');
        if (alpc && summary.avg_loss_per_contract !== undefined) {
            alpc.textContent = al !== 0 ? `$${summary.avg_loss_per_contract.toFixed(2)} per contract` : '';
        }
    }
    
    // Max Drawdown
    const maxDD = document.getElementById('statMaxDrawdown');
    maxDD.textContent = summary.max_drawdown !== undefined
        ? `${summary.max_drawdown.toFixed(2)}%` 
        : '0.00%';
    if (summary.max_drawdown < 0) {
        maxDD.classList.add('negative');
    }
    
    // Sharpe Ratio (not in metadata, show profit factor instead or N/A)
    const profitFactor = summary.profit_factor !== undefined ? summary.profit_factor : 0;
    document.getElementById('statSharpeRatio').textContent = profitFactor.toFixed(2);
    
    // Final Capital
    document.getElementById('statFinalCapital').textContent = summary.final_capital !== undefined
        ? `$${summary.final_capital.toLocaleString()}` 
        : 'N/A';
    
    // Return %
    const returnPct = document.getElementById('statReturnPct');
    returnPct.textContent = summary.total_return !== undefined 
        ? `${summary.total_return.toFixed(2)}%` 
        : '0.00%';
    if (summary.total_return > 0) {
        returnPct.classList.add('positive');
    } else if (summary.total_return < 0) {
        returnPct.classList.add('negative');
    }
}

function formatCurrency(value) {
    if (value === undefined || value === null) return '$0.00';
    const prefix = value < 0 ? '-$' : '$';
    return prefix + Math.abs(value).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function buildEquityCurve(trades) {
    const ctx = document.getElementById('equityChart');
    if (!ctx) return;
    
    if (equityChart) {
        equityChart.destroy();
    }

    const summaryChip = document.getElementById('equitySummaryChip');
    
    if (!trades || trades.length === 0) {
        const container = document.getElementById('equityCurveContainer');
        container.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #62748a; font-weight: 600;">No trades to display</div>';
        if (summaryChip) summaryChip.textContent = 'No trades executed';
        return;
    }

    const container = document.getElementById('equityCurveContainer');
    container.innerHTML = '<canvas id="equityChart"></canvas>';
    
    const labels = ['Start'];
    const values = [0];
    let runningTotal = 0;
    
    let pnlColumnIndex = -1;
    let dateColumnIndex = -1;
    
    if (trades.length > 0) {
        const headers = trades[0].headers.map(h => h.toLowerCase());
        
        for (let i = 0; i < headers.length; i++) {
            if (headers[i] === 'pnl') { pnlColumnIndex = i; break; }
        }
        if (pnlColumnIndex < 0) {
            for (let i = 0; i < headers.length; i++) {
                if (headers[i].includes('net_pnl') || headers[i].includes('p&l') || headers[i].includes('profit')) {
                    pnlColumnIndex = i; break;
                }
            }
        }
        for (let i = 0; i < headers.length; i++) {
            if (headers[i].includes('exit_date') || headers[i].includes('date')) {
                dateColumnIndex = i; break;
            }
        }
    }
    
    trades.forEach((trade, idx) => {
        if (pnlColumnIndex >= 0 && trade.values[pnlColumnIndex]) {
            const pnl = parseFloat(trade.values[pnlColumnIndex].replace(/[^0-9.-]/g, '')) || 0;
            runningTotal += pnl;
        }
        const label = dateColumnIndex >= 0 ? trade.values[dateColumnIndex] : `Trade ${idx + 1}`;
        labels.push(label);
        values.push(runningTotal);
    });
    
    storedEquityData = values;
    storedLabels = labels;
    
    const finalValue = values[values.length - 1];
    const lineColor = finalValue >= 0 ? '#2563eb' : '#d14343';
    const fillColor = finalValue >= 0 ? 'rgba(37, 99, 235, 0.12)' : 'rgba(209, 67, 67, 0.12)';
    const isMobile = window.innerWidth <= 680;
    
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const dataRange = Math.max(maxValue - minValue, 1);
    const pad = dataRange * 0.08;
    const tickLimit = window.innerWidth <= 1720 ? 4 : window.innerWidth <= 1100 ? 6 : 9;

    if (summaryChip) {
        summaryChip.textContent = `${trades.length} trades | ${formatCurrency(finalValue)} cumulative P&L`;
    }
    
    const newCtx = document.getElementById('equityChart');

    equityChart = new Chart(newCtx, {
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

    requestAnimationFrame(() => {
        if (equityChart) equityChart.resize();
    });
    setTimeout(() => {
        if (equityChart) equityChart.resize();
    }, 50);
    setTimeout(() => {
        if (equityChart) equityChart.resize();
    }, 300);

    const chartContainer = document.getElementById('equityCurveContainer');
    if (chartContainer && window.ResizeObserver) {
        if (window._chartResizeObserver) window._chartResizeObserver.disconnect();
        window._chartResizeObserver = new ResizeObserver(() => {
            if (equityChart) equityChart.resize();
        });
        window._chartResizeObserver.observe(chartContainer);
    }
}

async function displayTradeLog(backtestId) {
    try {
        const thead = document.getElementById('tradesTableHead');
        const tbody = document.getElementById('tradesTableBody');
        
        // Fetch trade log CSV
        const response = await authFetch(`/api/files/trade-log/${backtestId}`);
        
        if (!response.ok) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: #6b7280;">No trades found</td></tr>';
            return;
        }
        
        const csvText = await response.text();
        console.log('Trade log CSV loaded');
        
        // Parse CSV
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: #6b7280;">No trades found</td></tr>';
            return;
        }
        
        // Parse header
        const headers = lines[0].split(',').map(h => h.trim());
        thead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
        
        // Parse all rows and store them
        allTrades = [];
        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            if (values.length === 0) continue;
            
            allTrades.push({
                values: values,
                headers: headers
            });
        }
        
        console.log(`Parsed ${allTrades.length} trades`);
        
        // Update total count
        document.getElementById('tradesTotalCount').textContent = allTrades.length;
        
        // Build equity curve from trade data
        buildEquityCurve(allTrades);
        
        currentPage = 1;
        displayTradesPage();
        
    } catch (error) {
        console.error('Error loading trade log:', error);
        document.getElementById('tradesTableBody').innerHTML = '<tr><td colspan="10" style="text-align: center; color: #6b7280;">No trades found</td></tr>';
    }
}

function displayTradesPage() {
    const tbody = document.getElementById('tradesTableBody');
    const totalPages = Math.ceil(allTrades.length / tradesPerPage);
    
    // Calculate range
    const startIdx = (currentPage - 1) * tradesPerPage;
    const endIdx = Math.min(startIdx + tradesPerPage, allTrades.length);
    
    // Update range display
    document.getElementById('tradesRangeStart').textContent = allTrades.length > 0 ? startIdx + 1 : 0;
    document.getElementById('tradesRangeEnd').textContent = endIdx;
    
    // Enable/disable pagination buttons
    const prevBtn = document.getElementById('tradesPrevBtn');
    const nextBtn = document.getElementById('tradesNextBtn');
    
    if (prevBtn) {
        prevBtn.disabled = currentPage <= 1;
    }
    
    if (nextBtn) {
        nextBtn.disabled = currentPage >= totalPages;
    }
    
    // Clear tbody
    tbody.innerHTML = '';
    
    // Display trades for current page
    for (let i = startIdx; i < endIdx; i++) {
        const trade = allTrades[i];
        const row = document.createElement('tr');
        
        row.innerHTML = trade.values.map((val, idx) => {
            // Color code P&L columns
            const header = trade.headers[idx].toLowerCase();
            if (header.includes('p&l') || header.includes('pnl') || header.includes('profit')) {
                const numVal = parseFloat(val.replace(/[^0-9.-]/g, ''));
                const className = numVal >= 0 ? 'positive' : 'negative';
                return `<td class="${className}">${val}</td>`;
            }
            return `<td>${val}</td>`;
        }).join('');
        
        tbody.appendChild(row);
    }
}

function parseCSVLine(line) {
    // Simple CSV parser that handles quoted fields
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    if (current) {
        result.push(current.trim());
    }
    
    return result;
}

let optDtDays = [];
let optDtPage = 1;
const optDtPerPage = 10;

function buildOptDecisionTreeFromLog(decisionLog) {
    if (!decisionLog || decisionLog.length === 0) return;

    optDtDays = decisionLog;
    document.getElementById('decisionTreeSection').style.display = '';
    document.getElementById('dtTotalCount').textContent = optDtDays.length;

    const prevBtn = document.getElementById('dtPrevBtn');
    const nextBtn = document.getElementById('dtNextBtn');
    if (prevBtn) prevBtn.onclick = () => { if (optDtPage > 1) { optDtPage--; renderOptDtPageFromLog(); } };
    if (nextBtn) nextBtn.onclick = () => { if (optDtPage < Math.ceil(optDtDays.length / optDtPerPage)) { optDtPage++; renderOptDtPageFromLog(); } };

    optDtPage = 1;
    renderOptDtPageFromLog();
}

function formatExitReasonOpt(reason) {
    if (!reason) return 'N/A';
    const map = {
        'TAKE_PROFIT': 'Take Profit',
        'STOP_LOSS': 'Stop Loss',
        'EXPIRATION': 'Expiration',
        'EOD': 'End of Day'
    };
    return map[reason] || reason.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function renderOptDtPageFromLog() {
    const body = document.getElementById('decisionTreeBody');
    const totalPages = Math.ceil(optDtDays.length / optDtPerPage);
    const start = (optDtPage - 1) * optDtPerPage;
    const end = Math.min(start + optDtPerPage, optDtDays.length);

    document.getElementById('dtRangeStart').textContent = optDtDays.length > 0 ? start + 1 : 0;
    document.getElementById('dtRangeEnd').textContent = end;

    const prevBtn = document.getElementById('dtPrevBtn');
    const nextBtn = document.getElementById('dtNextBtn');
    if (prevBtn) prevBtn.disabled = optDtPage <= 1;
    if (nextBtn) nextBtn.disabled = optDtPage >= totalPages;

    body.innerHTML = optDtDays.slice(start, end).map(day => {
        const status = day.status || 'SKIPPED';
        let badgeColor, badgeText, headerBg;
        switch (status) {
            case 'ENTRY':
                badgeColor = '#10b981'; badgeText = 'Entry'; headerBg = '#f0fdf4'; break;
            case 'EXIT':
                badgeColor = '#f59e0b'; badgeText = 'Exit (Same Day)'; headerBg = '#fffbeb'; break;
            case 'SKIPPED':
            default:
                badgeColor = '#94a3b8'; badgeText = 'Skipped'; headerBg = '#f8fafc'; break;
        }

        const exitEvents = (day.events || []).filter(e => e.type === 'exit');
        const dayPnl = exitEvents.reduce((s, e) => s + (e.pnl || 0), 0);
        const hasPnl = exitEvents.length > 0;

        let flowHtml = '';

        if (day.underlying_price != null) {
            flowHtml += `<div style="display:flex; align-items:center; gap:8px; padding:8px 12px; background:#f1f5f9; border-radius:8px; margin-bottom:8px;">
                <i class="fas fa-chart-line" style="color:#64748b;"></i>
                <span style="color:#475569; font-size:13px;"><strong>${day.symbol || 'Underlying'}:</strong> $${day.underlying_price.toFixed(2)} @ ${day.entry_time_range || ''}</span>
            </div>`;
        }

        if (day.strategy) {
            flowHtml += `<div style="display:flex; align-items:center; gap:8px; padding:8px 12px; background:#f1f5f9; border-radius:8px; margin-bottom:8px;">
                <i class="fas fa-cogs" style="color:#64748b;"></i>
                <span style="color:#475569; font-size:13px;"><strong>Strategy:</strong> ${day.strategy}</span>
            </div>`;
        }

        flowHtml += '<div style="border-left:2px solid #e2e8f0; margin-left:20px; padding-left:16px;">';

        (day.events || []).forEach(evt => {
            if (evt.type === 'no_data') {
                flowHtml += `<div style="display:flex; align-items:flex-start; gap:10px; padding:8px 12px; background:#f8fafc; border-radius:8px; margin-bottom:6px; border-left:3px solid #94a3b8;">
                    <i class="fas fa-database" style="color:#94a3b8; margin-top:2px;"></i>
                    <div>
                        <div style="font-weight:600; color:#64748b; font-size:13px;">NO DATA</div>
                        <div style="color:#94a3b8; font-size:12px;">${evt.reason || 'No market data available'}</div>
                    </div>
                </div>`;
            } else if (evt.type === 'no_signal') {
                flowHtml += `<div style="display:flex; align-items:flex-start; gap:10px; padding:8px 12px; background:#f8fafc; border-radius:8px; margin-bottom:6px; border-left:3px solid #94a3b8;">
                    <i class="fas fa-ban" style="color:#94a3b8; margin-top:2px;"></i>
                    <div>
                        <div style="font-weight:600; color:#64748b; font-size:13px;">CONDITIONS NOT MET</div>
                        <div style="color:#94a3b8; font-size:12px;">${evt.reason || 'Entry conditions not met'}</div>
                    </div>
                </div>`;
            } else if (evt.type === 'condition_met') {
                flowHtml += `<div style="display:flex; align-items:flex-start; gap:10px; padding:8px 12px; background:#ecfdf5; border-radius:8px; margin-bottom:6px; border-left:3px solid #10b981;">
                    <i class="fas fa-check-circle" style="color:#10b981; margin-top:2px;"></i>
                    <div>
                        <div style="font-weight:600; color:#065f46; font-size:13px;">CONDITIONS MET</div>
                        <div style="color:#475569; font-size:12px;">Price $${evt.price != null ? evt.price.toFixed(2) : 'N/A'} @ ${evt.time || ''}</div>
                    </div>
                </div>`;
            } else if (evt.type === 'skip') {
                flowHtml += `<div style="display:flex; align-items:flex-start; gap:10px; padding:8px 12px; background:#fffbeb; border-radius:8px; margin-bottom:6px; border-left:3px solid #f59e0b;">
                    <i class="fas fa-exclamation-triangle" style="color:#f59e0b; margin-top:2px;"></i>
                    <div>
                        <div style="font-weight:600; color:#92400e; font-size:13px;">TRADE SKIPPED</div>
                        <div style="color:#78716c; font-size:12px;">${evt.reason || 'Unable to execute'}</div>
                    </div>
                </div>`;
            } else if (evt.type === 'entry') {
                let legsHtml = '';
                if (evt.legs && evt.legs.length > 0) {
                    legsHtml = '<div style="margin-top:4px;">' + evt.legs.map(l => 
                        `<span style="display:inline-block; background:#e0e7ff; color:#3730a3; padding:2px 8px; border-radius:6px; font-size:11px; margin:2px 4px 2px 0;">${l.position} ${l.type === 'C' ? 'Call' : 'Put'} ${l.name} @ $${l.strike} (${l.entry_price.toFixed(4)})</span>`
                    ).join('') + '</div>';
                }
                flowHtml += `<div style="display:flex; align-items:flex-start; gap:10px; padding:8px 12px; background:#f0fdf4; border-radius:8px; margin-bottom:6px; border-left:3px solid #10b981;">
                    <i class="fas fa-sign-in-alt" style="color:#10b981; margin-top:2px;"></i>
                    <div>
                        <div style="font-weight:600; color:#1e293b; font-size:13px;">ENTRY @ ${evt.time || ''}</div>
                        <div style="color:#475569; font-size:12px;">${evt.num_contracts} contract${evt.num_contracts > 1 ? 's' : ''} | Net Premium: $${evt.net_premium.toFixed(4)} | Max Risk: $${evt.max_risk.toFixed(2)}</div>
                        <div style="color:#64748b; font-size:11px; margin-top:2px;">Exp: ${evt.expiration || 'N/A'}</div>
                        ${legsHtml}
                    </div>
                </div>`;
            } else if (evt.type === 'exit') {
                const pnl = evt.pnl || 0;
                const pnlColor = pnl >= 0 ? '#10b981' : '#ef4444';
                const bgColor = pnl >= 0 ? '#f0fdf4' : '#fef2f2';
                const borderColor = pnl >= 0 ? '#10b981' : '#ef4444';
                const exitIcon = (evt.exit_reason || '').includes('STOP') ? 'fa-shield-alt' :
                                 (evt.exit_reason || '').includes('PROFIT') ? 'fa-bullseye' :
                                 (evt.exit_reason || '').includes('EXPIR') ? 'fa-hourglass-end' : 'fa-sign-out-alt';
                flowHtml += `<div style="display:flex; align-items:flex-start; gap:10px; padding:8px 12px; background:${bgColor}; border-radius:8px; margin-bottom:6px; border-left:3px solid ${borderColor};">
                    <i class="fas ${exitIcon}" style="color:${pnlColor}; margin-top:2px;"></i>
                    <div>
                        <div style="font-weight:600; color:#1e293b; font-size:13px;">EXIT - Trade #${evt.trade_num || '?'} (${formatExitReasonOpt(evt.exit_reason)})</div>
                        <div style="color:#475569; font-size:12px;">${evt.exit_date || ''} @ ${evt.exit_time || ''} | Exit Premium: $${(evt.net_premium_exit || 0).toFixed(4)}</div>
                        <div style="font-weight:600; font-size:13px; margin-top:2px; color:${pnlColor};">P&L: $${pnl.toFixed(2)}</div>
                    </div>
                </div>`;
            } else if (evt.type === 'error') {
                flowHtml += `<div style="display:flex; align-items:flex-start; gap:10px; padding:8px 12px; background:#fef2f2; border-radius:8px; margin-bottom:6px; border-left:3px solid #ef4444;">
                    <i class="fas fa-exclamation-circle" style="color:#ef4444; margin-top:2px;"></i>
                    <div>
                        <div style="font-weight:600; color:#991b1b; font-size:13px;">ERROR</div>
                        <div style="color:#78716c; font-size:12px;">${evt.reason || 'Unknown error'}</div>
                    </div>
                </div>`;
            }
        });

        flowHtml += '</div>';

        const dayIdx = optDtDays.indexOf(day);
        const hasBarData = day.bars && day.bars.length > 0;
        const viewChartBtn = hasBarData
            ? `<button class="day-chart-btn" onclick="event.stopPropagation(); openDayChart(${dayIdx})" title="View price chart with indicators">
                   <i class="fas fa-chart-area"></i> View Chart
               </button>`
            : '';

        return `
            <div style="border:1px solid #e2e8f0; border-radius:12px; margin-bottom:12px; overflow:hidden;">
                <div onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'; this.querySelector('.dt-chevron').classList.toggle('collapsed')" style="padding:12px 16px; background:${headerBg}; cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                        <i class="fas fa-calendar-day" style="color:#3b7cff;"></i>
                        <span style="font-weight:600; font-size:15px;">${day.date}</span>
                        <span style="background:${badgeColor}; color:#fff; padding:2px 10px; border-radius:12px; font-size:11px; font-weight:600;">${badgeText}</span>
                        ${hasPnl ? `<span style="color:${dayPnl >= 0 ? '#10b981' : '#ef4444'}; font-weight:600; font-size:13px;">P&L: $${dayPnl.toFixed(2)}</span>` : ''}
                    </div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        ${viewChartBtn}
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

function buildOptDecisionTree(trades) {
    if (!trades || trades.length === 0) return;

    const headers = trades[0].headers.map(h => h.toLowerCase().trim());
    const col = name => {
        for (let i = 0; i < headers.length; i++) {
            if (headers[i] === name || headers[i].includes(name)) return i;
        }
        return -1;
    };

    const entryDateIdx = col('entry_date') >= 0 ? col('entry_date') : col('date');
    const exitDateIdx = col('exit_date');
    const pnlIdx = col('pnl');
    const strategyIdx = col('strategy');
    const symbolIdx = col('symbol');
    const exitReasonIdx = col('exit_reason') >= 0 ? col('exit_reason') : col('reason');
    const entryPriceIdx = col('entry_price') >= 0 ? col('entry_price') : col('net_premium_entry') >= 0 ? col('net_premium_entry') : col('premium');
    const exitPriceIdx = col('exit_price') >= 0 ? col('exit_price') : col('net_premium_exit');
    const dteIdx = col('dte');
    const strikeIdx = col('strike');

    const dayMap = {};
    trades.forEach((t, idx) => {
        const v = t.values;
        const entryDate = entryDateIdx >= 0 ? (v[entryDateIdx] || '').split(' ')[0].split('T')[0] : '';
        const exitDate = exitDateIdx >= 0 ? (v[exitDateIdx] || '').split(' ')[0].split('T')[0] : '';
        if (!entryDate) return;

        const tradeObj = {
            tradeNum: idx + 1,
            symbol: symbolIdx >= 0 ? v[symbolIdx] : '—',
            strategy: strategyIdx >= 0 ? v[strategyIdx] : '—',
            entryPrice: entryPriceIdx >= 0 ? v[entryPriceIdx] : '—',
            exitPrice: exitPriceIdx >= 0 ? v[exitPriceIdx] : '—',
            pnl: pnlIdx >= 0 ? parseFloat((v[pnlIdx] || '0').replace(/[^0-9.-]/g, '')) : 0,
            exitReason: exitReasonIdx >= 0 ? v[exitReasonIdx] : '—',
            dte: dteIdx >= 0 ? v[dteIdx] : '—',
            strike: strikeIdx >= 0 ? v[strikeIdx] : '—',
            entryDate,
            exitDate
        };

        if (!dayMap[entryDate]) dayMap[entryDate] = { entries: [], exits: [] };
        dayMap[entryDate].entries.push(tradeObj);

        if (exitDate && exitDate !== entryDate) {
            if (!dayMap[exitDate]) dayMap[exitDate] = { entries: [], exits: [] };
            dayMap[exitDate].exits.push(tradeObj);
        } else if (exitDate === entryDate) {
            dayMap[entryDate].exits.push(tradeObj);
        }
    });

    optDtDays = Object.keys(dayMap).sort().map(date => ({ date, ...dayMap[date] }));
    if (optDtDays.length === 0) return;

    document.getElementById('decisionTreeSection').style.display = '';
    document.getElementById('dtTotalCount').textContent = optDtDays.length;

    const prevBtn = document.getElementById('dtPrevBtn');
    const nextBtn = document.getElementById('dtNextBtn');
    if (prevBtn) prevBtn.onclick = () => { if (optDtPage > 1) { optDtPage--; renderOptDtPage(); } };
    if (nextBtn) nextBtn.onclick = () => { if (optDtPage < Math.ceil(optDtDays.length / optDtPerPage)) { optDtPage++; renderOptDtPage(); } };

    optDtPage = 1;
    renderOptDtPage();
}

function renderOptDtPage() {
    const body = document.getElementById('decisionTreeBody');
    const totalPages = Math.ceil(optDtDays.length / optDtPerPage);
    const start = (optDtPage - 1) * optDtPerPage;
    const end = Math.min(start + optDtPerPage, optDtDays.length);

    document.getElementById('dtRangeStart').textContent = optDtDays.length > 0 ? start + 1 : 0;
    document.getElementById('dtRangeEnd').textContent = end;

    const prevBtn = document.getElementById('dtPrevBtn');
    const nextBtn = document.getElementById('dtNextBtn');
    if (prevBtn) prevBtn.disabled = optDtPage <= 1;
    if (nextBtn) nextBtn.disabled = optDtPage >= totalPages;

    body.innerHTML = optDtDays.slice(start, end).map(day => {
        const hasEntries = day.entries.length > 0;
        const hasExits = day.exits.length > 0;
        const dayPnl = day.exits.reduce((s, t) => s + (t.pnl || 0), 0);
        const badgeColor = hasEntries && hasExits ? '#7c3aed' : hasEntries ? '#10b981' : '#f59e0b';
        const badgeText = hasEntries && hasExits ? 'Entry + Exit' : hasEntries ? 'Entry' : 'Exit';

        let entriesHtml = '';
        if (hasEntries) {
            entriesHtml = day.entries.map(t => `
                <div style="display:flex; align-items:flex-start; gap:10px; padding:8px 12px; background:#f5f3ff; border-radius:8px; margin-bottom:6px;">
                    <i class="fas fa-sign-in-alt" style="color:#10b981; margin-top:3px;"></i>
                    <div style="flex:1;">
                        <div style="font-weight:600; color:#1e293b; font-size:14px;">Trade #${t.tradeNum} — ${t.strategy} Entry</div>
                        <div style="color:#64748b; font-size:12px; margin-top:2px;">
                            <i class="fas fa-chart-bar" style="margin-right:4px;"></i>${t.symbol}
                            &nbsp;|&nbsp; Premium: ${t.entryPrice}
                            ${t.dte !== '—' ? `&nbsp;|&nbsp; DTE: ${t.dte}` : ''}
                            ${t.strike !== '—' ? `&nbsp;|&nbsp; Strike: ${t.strike}` : ''}
                        </div>
                    </div>
                </div>
            `).join('');
        }

        let exitsHtml = '';
        if (hasExits) {
            exitsHtml = day.exits.map(t => {
                const pnl = t.pnl || 0;
                const pColor = pnl >= 0 ? '#10b981' : '#ef4444';
                const exitIcon = (t.exitReason || '').toLowerCase().includes('stop') ? 'fa-shield-alt' :
                                 (t.exitReason || '').toLowerCase().includes('profit') ? 'fa-bullseye' :
                                 (t.exitReason || '').toLowerCase().includes('expir') ? 'fa-hourglass-end' : 'fa-sign-out-alt';
                return `
                <div style="display:flex; align-items:flex-start; gap:10px; padding:8px 12px; background:${pnl >= 0 ? '#f0fdf4' : '#fef2f2'}; border-radius:8px; margin-bottom:6px;">
                    <i class="fas ${exitIcon}" style="color:${pColor}; margin-top:3px;"></i>
                    <div style="flex:1;">
                        <div style="font-weight:600; color:#1e293b; font-size:14px;">Trade #${t.tradeNum} — Exit</div>
                        <div style="color:#64748b; font-size:12px; margin-top:2px;">
                            Reason: <span style="font-weight:600;">${t.exitReason}</span>
                            &nbsp;|&nbsp; Exit Premium: ${t.exitPrice}
                            &nbsp;|&nbsp; P&L: <span style="color:${pColor}; font-weight:600;">$${pnl.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            `}).join('');
        }

        return `
            <div style="border:1px solid #e2e8f0; border-radius:12px; margin-bottom:12px; overflow:hidden;">
                <div onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'; this.querySelector('.dt-chevron').classList.toggle('collapsed')" style="padding:12px 16px; background:#faf5ff; cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <i class="fas fa-calendar-day" style="color:#7c3aed;"></i>
                        <span style="font-weight:600; font-size:15px;">${day.date}</span>
                        <span style="background:${badgeColor}; color:#fff; padding:2px 10px; border-radius:12px; font-size:11px; font-weight:600;">${badgeText}</span>
                        ${hasExits ? `<span style="color:${dayPnl >= 0 ? '#10b981' : '#ef4444'}; font-weight:600; font-size:13px;">Day P&L: $${dayPnl.toFixed(2)}</span>` : ''}
                    </div>
                    <i class="fas fa-chevron-down dt-chevron" style="color:#94a3b8; transition:transform 0.2s;"></i>
                </div>
                <div style="padding:12px 16px; display:none;">
                    ${entriesHtml}${exitsHtml}
                </div>
            </div>
        `;
    }).join('');
}

function downloadCSV() {
    window.location.href = `/api/files/trade-log/${backtestId}`;
}

function showError(message) {
    document.getElementById('loadingSection').style.display = 'none';
    document.getElementById('errorSection').style.display = 'block';
    document.getElementById('errorMessage').textContent = message;
}

/* ─────────────────────────────────────────────
   Day Chart Modal — price + RSI / MACD sub-chart
   ───────────────────────────────────────────── */

let _dayPriceChartInst   = null;
let _dayIndicatorChartInst = null;
let _dayChartCurrentDay  = null;

function _computeRSI(closes, window = 14) {
    const rsi = new Array(closes.length).fill(null);
    if (closes.length <= window) return rsi;
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= window; i++) {
        const d = closes[i] - closes[i - 1];
        if (d > 0) avgGain += d; else avgLoss -= d;
    }
    avgGain /= window; avgLoss /= window;
    rsi[window] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    for (let i = window + 1; i < closes.length; i++) {
        const d = closes[i] - closes[i - 1];
        avgGain = (avgGain * (window - 1) + (d > 0 ? d : 0)) / window;
        avgLoss = (avgLoss * (window - 1) + (d < 0 ? -d : 0)) / window;
        rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
    return rsi;
}

function _computeEMA(values, span) {
    const k = 2 / (span + 1);
    const ema = new Array(values.length).fill(null);
    let first = values.findIndex(v => v != null && !isNaN(v));
    if (first < 0) return ema;
    ema[first] = values[first];
    for (let i = first + 1; i < values.length; i++) {
        const v = values[i];
        ema[i] = (v != null && !isNaN(v)) ? v * k + ema[i - 1] * (1 - k) : ema[i - 1];
    }
    return ema;
}

function _computeMACD(closes, short = 12, long = 26, signal = 9) {
    const emaShort  = _computeEMA(closes, short);
    const emaLong   = _computeEMA(closes, long);
    const macdLine  = closes.map((_, i) =>
        emaShort[i] != null && emaLong[i] != null ? emaShort[i] - emaLong[i] : null);
    const signalLine = _computeEMA(macdLine.map(v => v == null ? NaN : v), signal);
    const histogram  = macdLine.map((v, i) =>
        v != null && signalLine[i] != null ? v - signalLine[i] : null);
    return { macdLine, signalLine, histogram };
}

function openDayChart(dayIdx) {
    const day = optDtDays[dayIdx];
    if (!day || !day.bars || day.bars.length === 0) return;
    _dayChartCurrentDay = day;

    document.getElementById('dayChartTitle').textContent =
        `${day.symbol || ''} — ${day.date}`;
    document.getElementById('dayChartIndicator').value = 'none';
    document.getElementById('dayIndicatorWrap').style.display = 'none';

    document.getElementById('dayChartModal').classList.add('active');
    document.body.style.overflow = 'hidden';

    setTimeout(() => _buildDayPriceChart(day), 60);
}

function closeDayChartModal() {
    document.getElementById('dayChartModal').classList.remove('active');
    document.body.style.overflow = '';
    if (_dayPriceChartInst)    { _dayPriceChartInst.destroy();    _dayPriceChartInst    = null; }
    if (_dayIndicatorChartInst) { _dayIndicatorChartInst.destroy(); _dayIndicatorChartInst = null; }
    _dayChartCurrentDay = null;
}

function onDayChartIndicatorChange() {
    const ind = document.getElementById('dayChartIndicator').value;
    const wrap = document.getElementById('dayIndicatorWrap');
    if (!_dayChartCurrentDay) return;

    if (ind === 'none') {
        wrap.style.display = 'none';
        if (_dayIndicatorChartInst) { _dayIndicatorChartInst.destroy(); _dayIndicatorChartInst = null; }
        return;
    }
    wrap.style.display = 'block';
    _buildDayIndicatorChart(_dayChartCurrentDay, ind);
}

function _buildDayPriceChart(day) {
    const bars = day.bars || [];           // [[HH:MM, o, h, l, c, v], ...]
    const seedBars = day.seed_bars || [];  // prior day bars for warm-up context

    if (_dayPriceChartInst) { _dayPriceChartInst.destroy(); _dayPriceChartInst = null; }

    const labels = bars.map(b => b[0]);
    const opens  = bars.map(b => b[1]);
    const highs  = bars.map(b => b[2]);
    const lows   = bars.map(b => b[3]);
    const closes = bars.map(b => b[4]);

    const upColor   = 'rgba(16,185,129,0.85)';
    const downColor = 'rgba(239,68,68,0.82)';
    const wickColor = bars.map((b, i) => closes[i] >= opens[i] ? upColor : downColor);

    // Collect entry/exit times from day events
    const entryTimes = (day.events || [])
        .filter(e => e.type === 'entry' && e.time)
        .map(e => e.time.slice(0, 5));
    const exitTimes  = (day.events || [])
        .filter(e => e.type === 'exit' && e.exit_time)
        .map(e => e.exit_time.slice(0, 5));

    // Entry/exit scatter points (on close price)
    const entryPoints = labels.map((lbl, i) =>
        entryTimes.includes(lbl) ? closes[i] : null);
    const exitPoints  = labels.map((lbl, i) =>
        exitTimes.includes(lbl)  ? closes[i] : null);

    const ctx = document.getElementById('dayPriceChart');
    _dayPriceChartInst = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Wick',
                    data: bars.map((b, i) => [lows[i], highs[i]]),
                    backgroundColor: wickColor,
                    borderColor: wickColor,
                    borderWidth: 0,
                    barPercentage: 0.15,
                    categoryPercentage: 1,
                    order: 2
                },
                {
                    label: 'Body',
                    data: bars.map((b, i) => [opens[i], closes[i]]),
                    backgroundColor: wickColor,
                    borderColor: wickColor,
                    borderWidth: 0,
                    barPercentage: 0.6,
                    categoryPercentage: 1,
                    order: 1
                },
                {
                    label: 'Entry',
                    type: 'scatter',
                    data: labels.map((lbl, i) => entryTimes.includes(lbl) ? { x: lbl, y: lows[i] * 0.9995 } : null).filter(v => v),
                    backgroundColor: '#10b981',
                    borderColor: '#fff',
                    borderWidth: 1.5,
                    pointStyle: 'triangle',
                    pointRadius: 8,
                    pointHoverRadius: 10,
                    order: 0,
                    showLine: false
                },
                {
                    label: 'Exit',
                    type: 'scatter',
                    data: labels.map((lbl, i) => exitTimes.includes(lbl) ? { x: lbl, y: highs[i] * 1.0005 } : null).filter(v => v),
                    backgroundColor: '#f59e0b',
                    borderColor: '#fff',
                    borderWidth: 1.5,
                    pointStyle: 'triangle',
                    rotation: 180,
                    pointRadius: 8,
                    pointHoverRadius: 10,
                    order: 0,
                    showLine: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label(ctx) {
                            if (ctx.dataset.label === 'Entry') return `Entry @ ${ctx.raw.y.toFixed(2)}`;
                            if (ctx.dataset.label === 'Exit')  return `Exit @ ${ctx.raw.y.toFixed(2)}`;
                            const i = ctx.dataIndex;
                            return [
                                `O: ${opens[i].toFixed(2)}`,
                                `H: ${highs[i].toFixed(2)}`,
                                `L: ${lows[i].toFixed(2)}`,
                                `C: ${closes[i].toFixed(2)}`
                            ];
                        }
                    },
                    backgroundColor: '#1a2535',
                    titleColor: '#94a3b8',
                    bodyColor: '#e2e8f0',
                    borderColor: '#2d3f54',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#64748b',
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 14,
                        font: { size: 11 }
                    },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                },
                y: {
                    ticks: { color: '#64748b', font: { size: 11 } },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                }
            }
        }
    });
}

function _buildDayIndicatorChart(day, indicator) {
    if (_dayIndicatorChartInst) { _dayIndicatorChartInst.destroy(); _dayIndicatorChartInst = null; }

    const seedBars = day.seed_bars || [];
    const bars     = day.bars     || [];

    // Combine seed bars + current bars for warm-up, then slice to current-day only
    const allBars   = [...seedBars, ...bars];
    const allCloses = allBars.map(b => b[4]);
    const labels    = bars.map(b => b[0]);
    const offset    = seedBars.length;

    const ctx   = document.getElementById('dayIndicatorChart');
    const label = document.getElementById('dayIndicatorLabel');

    if (indicator === 'rsi') {
        label.textContent = 'RSI (14)';
        const allRsi = _computeRSI(allCloses, 14);
        const rsiDay = allRsi.slice(offset);

        _dayIndicatorChartInst = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'RSI',
                    data: rsiDay,
                    borderColor: '#818cf8',
                    backgroundColor: 'transparent',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    tension: 0.2,
                    spanGaps: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => `RSI: ${ctx.parsed.y != null ? ctx.parsed.y.toFixed(2) : 'N/A'}`
                        },
                        backgroundColor: '#1a2535',
                        titleColor: '#94a3b8',
                        bodyColor: '#e2e8f0',
                        borderColor: '#2d3f54',
                        borderWidth: 1
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#4a5568', font: { size: 10 }, maxTicksLimit: 10, autoSkip: true, maxRotation: 0 },
                        grid: { color: 'rgba(255,255,255,0.03)' }
                    },
                    y: {
                        min: 0, max: 100,
                        ticks: { color: '#4a5568', font: { size: 10 }, stepSize: 25 },
                        grid: { color: 'rgba(255,255,255,0.03)' }
                    }
                },
                // Draw overbought/oversold lines via plugin
                plugins_custom: []
            },
            plugins: [{
                id: 'rsiLines',
                afterDraw(chart) {
                    const { ctx: c, chartArea: { left, right }, scales: { y } } = chart;
                    [70, 50, 30].forEach((lvl, idx) => {
                        const yPos = y.getPixelForValue(lvl);
                        c.save();
                        c.strokeStyle = lvl === 50 ? 'rgba(148,163,184,0.3)' : (lvl === 70 ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.4)');
                        c.lineWidth = 1;
                        c.setLineDash([4, 4]);
                        c.beginPath();
                        c.moveTo(left, yPos);
                        c.lineTo(right, yPos);
                        c.stroke();
                        c.restore();
                    });
                }
            }]
        });

    } else if (indicator === 'macd') {
        label.textContent = 'MACD (12, 26, 9)';
        const { macdLine, signalLine, histogram } = _computeMACD(allCloses);
        const macdDay   = macdLine.slice(offset);
        const sigDay    = signalLine.slice(offset);
        const histDay   = histogram.slice(offset);

        _dayIndicatorChartInst = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Histogram',
                        type: 'bar',
                        data: histDay,
                        backgroundColor: histDay.map(v => v == null ? 'transparent' : v >= 0 ? 'rgba(16,185,129,0.55)' : 'rgba(239,68,68,0.55)'),
                        borderColor: 'transparent',
                        borderWidth: 0,
                        barPercentage: 0.8,
                        categoryPercentage: 1,
                        order: 2
                    },
                    {
                        label: 'MACD',
                        type: 'line',
                        data: macdDay,
                        borderColor: '#60a5fa',
                        backgroundColor: 'transparent',
                        borderWidth: 1.5,
                        pointRadius: 0,
                        tension: 0.15,
                        spanGaps: true,
                        order: 1
                    },
                    {
                        label: 'Signal',
                        type: 'line',
                        data: sigDay,
                        borderColor: '#f97316',
                        backgroundColor: 'transparent',
                        borderWidth: 1.5,
                        borderDash: [4, 3],
                        pointRadius: 0,
                        tension: 0.15,
                        spanGaps: true,
                        order: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { color: '#64748b', font: { size: 10 }, boxWidth: 20, padding: 10 }
                    },
                    tooltip: {
                        backgroundColor: '#1a2535',
                        titleColor: '#94a3b8',
                        bodyColor: '#e2e8f0',
                        borderColor: '#2d3f54',
                        borderWidth: 1
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#4a5568', font: { size: 10 }, maxTicksLimit: 10, autoSkip: true, maxRotation: 0 },
                        grid: { color: 'rgba(255,255,255,0.03)' }
                    },
                    y: {
                        ticks: { color: '#4a5568', font: { size: 10 } },
                        grid: { color: 'rgba(255,255,255,0.03)' }
                    }
                }
            }
        });
    }
}
