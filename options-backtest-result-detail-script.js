// Options Backtest Result Detail Script
// Loads and displays detailed backtest results with configuration, stats, equity curve, and trade log

let backtestId = null;
let originPage = null;

// Handle back navigation
function goBack() {
    // Always go to dashboard options results section
    window.location.href = '/dashboard?section=optionsResults';
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
let allTrades = []; // Store all parsed trades
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
        
        // Always display configuration immediately
        displayConfiguration(metadata);
        
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
    if (config.detection_bar_size) {
        let intervalText;
        if (config.detection_bar_size < 1) {
            const seconds = config.detection_bar_size * 60;
            intervalText = `${seconds} seconds`;
        } else {
            intervalText = `${config.detection_bar_size} minutes`;
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
        <div class="config-item">
            <div class="config-label">${item.label}</div>
            <div class="config-value">${item.value}</div>
        </div>
    `).join('');
    
    // Legs Configuration (if available) - render separately for better formatting
    // Handle both array format (new) and object format (legacy)
    if (config.legs && (Array.isArray(config.legs) ? config.legs.length > 0 : Object.keys(config.legs).length > 0)) {
        const legsArray = Array.isArray(config.legs) ? config.legs : Object.entries(config.legs).map(([name, cfg]) => ({...cfg, name}));
        
        html += `<div class="config-item">
            <div class="config-label">Strategy Legs</div>
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
    
    // Average Trade (calculate from avg win/loss)
    const avgTrade = (summary.avg_win || 0) + (summary.avg_loss || 0);
    const avgTradeEl = document.getElementById('statAvgTrade');
    avgTradeEl.textContent = `$${avgTrade.toFixed(2)}`;
    if (avgTrade > 0) {
        avgTradeEl.classList.add('positive');
    } else if (avgTrade < 0) {
        avgTradeEl.classList.add('negative');
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

function buildEquityCurve(trades) {
    const ctx = document.getElementById('equityChart');
    if (!ctx) return;
    
    // Destroy existing chart if any
    if (equityChart) {
        equityChart.destroy();
    }
    
    // Build equity curve data from trades
    const equityData = [initialCapital];
    const labels = ['Start'];
    let runningBalance = initialCapital;
    
    // Find the P&L column index
    let pnlColumnIndex = -1;
    let dateColumnIndex = -1;
    
    if (trades.length > 0) {
        const headers = trades[0].headers.map(h => h.toLowerCase());
        
        // Find P&L column - look for exact 'pnl' first, then fallbacks
        // Note: 'net_premium_exit' is NOT the P&L, it's the option premium at exit
        for (let i = 0; i < headers.length; i++) {
            if (headers[i] === 'pnl') {
                pnlColumnIndex = i;
                break;
            }
        }
        // Fallback to other P&L column names if 'pnl' not found
        if (pnlColumnIndex < 0) {
            for (let i = 0; i < headers.length; i++) {
                if (headers[i].includes('net_pnl') || headers[i].includes('p&l') || 
                    headers[i].includes('profit')) {
                    pnlColumnIndex = i;
                    break;
                }
            }
        }
        
        // Find date column
        for (let i = 0; i < headers.length; i++) {
            if (headers[i].includes('exit_date') || headers[i].includes('date')) {
                dateColumnIndex = i;
                break;
            }
        }
    }
    
    // Build cumulative P&L
    trades.forEach((trade, idx) => {
        if (pnlColumnIndex >= 0 && trade.values[pnlColumnIndex]) {
            const pnl = parseFloat(trade.values[pnlColumnIndex].replace(/[^0-9.-]/g, '')) || 0;
            runningBalance += pnl;
        }
        
        const label = dateColumnIndex >= 0 ? trade.values[dateColumnIndex] : `Trade ${idx + 1}`;
        equityData.push(runningBalance);
        labels.push(label);
    });
    
    // Store data for expanded chart
    storedEquityData = equityData;
    storedLabels = labels;
    
    const isMobile = window.innerWidth <= 480;
    
    // Set container height explicitly
    const equityContainer = document.getElementById('equityCurveContainer');
    if (equityContainer) {
        equityContainer.style.height = isMobile ? '250px' : '300px';
    }
    
    // Create baseline data (horizontal line at initial capital)
    const baselineData = equityData.map(() => initialCapital);
    
    equityChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Account Balance',
                    data: equityData,
                    borderColor: '#3b82f6',
                    borderWidth: 2.5,
                    fill: false,
                    tension: 0,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    pointBackgroundColor: '#3b82f6'
                },
                {
                    label: 'Initial Capital',
                    data: baselineData,
                    borderColor: 'rgba(0, 0, 0, 0.15)',
                    borderDash: [6, 4],
                    borderWidth: 1,
                    pointRadius: 0,
                    fill: false,
                    tension: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { top: 10, right: 0, bottom: 0, left: 0 }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    filter: function(tooltipItem) {
                        return tooltipItem.datasetIndex === 0;
                    },
                    callbacks: {
                        label: function(context) {
                            const balance = context.parsed.y;
                            const diff = balance - initialCapital;
                            const diffStr = diff >= 0 ? `+$${diff.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : `-$${Math.abs(diff).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
                            return `Balance: $${balance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} (${diffStr})`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: { display: false },
                    ticks: {
                        maxTicksLimit: isMobile ? 4 : 10,
                        color: '#9ca3af',
                        font: { size: isMobile ? 10 : 11 },
                        padding: 6
                    },
                    border: { display: false },
                    afterFit: function(axis) {
                        axis.paddingTop = 0;
                    }
                },
                y: {
                    display: true,
                    position: 'right',
                    grace: '2%',
                    grid: {
                        color: 'rgba(0, 0, 0, 0.08)',
                        borderDash: [4, 4],
                        drawBorder: false
                    },
                    ticks: {
                        color: '#9ca3af',
                        font: { size: isMobile ? 10 : 11 },
                        padding: 8,
                        count: 5,
                        callback: function(value) {
                            if (Math.abs(value) >= 1000) {
                                return '$' + (value / 1000).toFixed(0) + 'k';
                            }
                            return '$' + value.toLocaleString();
                        }
                    },
                    border: { display: false },
                    afterFit: function(axis) {
                        axis.paddingTop = 0;
                        axis.paddingBottom = 0;
                    }
                }
            }
        }
    });
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
        
        // Reset to first page
        currentPage = 1;
        
        // Display first page
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

function downloadCSV() {
    // Redirect to trade log download
    window.location.href = `/api/files/trade-log/${backtestId}`;
}

function showError(message) {
    document.getElementById('loadingSection').style.display = 'none';
    document.getElementById('errorSection').style.display = 'block';
    document.getElementById('errorMessage').textContent = message;
}
