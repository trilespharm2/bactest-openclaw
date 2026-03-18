// Stock Backtester V3.0 - Form Handler
// Handles dynamic fields, validation, and submission

let conditionCount = 0;
var stockTemplates = [];
var stockTemplatesLoaded = false;

// Initialize form function (can be called from dashboard)
function initializeStockBacktesterPage() {
    console.log('=== Stock Backtester V3.0 Initialized ===');
    
    // Check if user is authenticated - if not, gray out fields
    // Wait for auth check to complete (it's async)
    function applyLoginOverlayIfNeeded() {
        if (typeof window.isAuthenticated === 'function') {
            if (!window.isAuthenticated()) {
                console.log('User not authenticated - applying login required overlay to stock backtester');
                if (typeof window.setupLoginRequiredFields === 'function') {
                    window.setupLoginRequiredFields('#stockBacktesterPage');
                }
            } else {
                console.log('User is authenticated - stock backtester fully enabled');
                loadStockTemplates();
            }
        } else {
            setTimeout(applyLoginOverlayIfNeeded, 100);
        }
    }
    setTimeout(applyLoginOverlayIfNeeded, 500);
    
    // Close template menu when clicking outside
    document.addEventListener('click', function(e) {
        var menu = document.getElementById('stockTemplatesMenu');
        var btn = document.getElementById('stockTemplatesBtn');
        if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
            menu.style.display = 'none';
        }
    });
    
    try {
        // Set default dates
        const today = new Date();
        const oneMonthAgo = new Date(today);
        oneMonthAgo.setMonth(today.getMonth() - 1);
        
        const startDateEl = document.getElementById('startDate');
        const endDateEl = document.getElementById('endDate');
        
        if (startDateEl) startDateEl.valueAsDate = oneMonthAgo;
        if (endDateEl) endDateEl.valueAsDate = today;
        
        console.log('Default dates set');
        
        // Initialize with one condition if custom is selected
        updateEntryType();
        
        console.log('Entry type initialized');
        
        // Form submission
        const form = document.getElementById('stockBacktestForm');
        if (form) {
            form.addEventListener('submit', handleSubmit);
            console.log('✓ Form submit handler attached');
        } else {
            console.error('ERROR: stockBacktestForm not found!');
        }
        
        console.log('=== Initialization Complete ===');
        
    } catch (error) {
        console.error('ERROR during initialization:', error);
    }
}

// Also initialize on DOMContentLoaded (for standalone page)
document.addEventListener('DOMContentLoaded', initializeStockBacktesterPage);

// Update symbol mode sections
function updateSymbolMode() {
    const mode = document.querySelector('input[name="symbol_mode"]:checked').value;
    
    document.getElementById('singleSymbolSection').style.display = 'none';
    document.getElementById('multipleSymbolsSection').style.display = 'none';
    document.getElementById('csvSymbolsSection').style.display = 'none';
    
    if (mode === 'single') {
        document.getElementById('singleSymbolSection').style.display = 'block';
    } else if (mode === 'multiple') {
        document.getElementById('multipleSymbolsSection').style.display = 'block';
    } else {
        document.getElementById('csvSymbolsSection').style.display = 'block';
    }
}

// Update entry type sections
function updateEntryType() {
    const type = document.querySelector('input[name="entry_type"]:checked').value;
    
    document.getElementById('presetSection').style.display = 'none';
    document.getElementById('customSection').style.display = 'none';
    
    if (type === 'preset') {
        document.getElementById('presetSection').style.display = 'block';
        updatePresetFields();
    } else {
        document.getElementById('customSection').style.display = 'block';
        // Initialize with first condition if empty
        if (document.getElementById('conditionsContainer').children.length === 0) {
            addCondition();
        }
    }
}

// Update preset fields based on selection
function updatePresetFields() {
    const preset = document.getElementById('presetCondition').value;
    
    document.getElementById('standardPresetFields').style.display = 'grid';
    document.getElementById('velocityFields').style.display = 'none';
    
    if (preset === '5') {
        // Velocity selected
        document.getElementById('standardPresetFields').style.display = 'none';
        document.getElementById('velocityFields').style.display = 'block';
    }
}

// Update sizing type sections
function updateSizingType() {
    const type = document.querySelector('input[name="sizing_type"]:checked').value;
    
    document.getElementById('sharesSection').style.display = 'none';
    document.getElementById('dollarsSection').style.display = 'none';
    document.getElementById('percentSection').style.display = 'none';
    
    if (type === 'shares') {
        document.getElementById('sharesSection').style.display = 'block';
    } else if (type === 'dollars') {
        document.getElementById('dollarsSection').style.display = 'block';
    } else {
        document.getElementById('percentSection').style.display = 'block';
    }
}

// Toggle custom day input visibility
function toggleCustomDay(side, id) {
    const select = document.getElementById(`${side}-day-${id}`);
    const customInput = document.getElementById(`${side}-day-custom-${id}`);
    
    if (select.value === 'custom') {
        customInput.style.display = 'block';
        customInput.focus();
    } else {
        customInput.style.display = 'none';
        customInput.value = '';
    }
}

// Reset form to defaults
function resetStockBacktestForm() {
    const form = document.getElementById('stockBacktestForm');
    if (form) {
        form.reset();
        
        // Reset dates to defaults
        const today = new Date();
        const oneMonthAgo = new Date(today);
        oneMonthAgo.setMonth(today.getMonth() - 1);
        
        const startDateEl = document.getElementById('startDate');
        const endDateEl = document.getElementById('endDate');
        if (startDateEl) startDateEl.valueAsDate = oneMonthAgo;
        if (endDateEl) endDateEl.valueAsDate = today;
        
        // Reset dynamic sections
        updateSymbolMode();
        updateEntryType();
        updateSizingType();
        
        // Clear conditions
        const conditionsContainer = document.getElementById('conditionsContainer');
        if (conditionsContainer) {
            conditionsContainer.innerHTML = '';
        }
        conditionCount = 0;
    }
}

// Add a new condition to the builder
function addCondition() {
    conditionCount++;
    const container = document.getElementById('conditionsContainer');
    
    const conditionDiv = document.createElement('div');
    conditionDiv.className = 'condition-item';
    conditionDiv.id = `condition-${conditionCount}`;
    
    conditionDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <h4>Condition #${conditionCount} ${conditionCount === 1 ? '(Entry Trigger)' : '(Prerequisite)'}</h4>
            <button type="button" class="btn-remove" onclick="removeCondition(${conditionCount})">Remove</button>
        </div>
        
        <div class="side-label">Left Side (Compare this):</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; margin-bottom: 15px;">
            <div>
                <label>Day</label>
                <select id="left-day-${conditionCount}" onchange="toggleCustomDay('left', ${conditionCount})">
                    <option value="0">Today (0)</option>
                    <option value="-1">Yesterday (-1)</option>
                    <option value="-2">2 Days Ago (-2)</option>
                    <option value="-3">3 Days Ago (-3)</option>
                    <option value="custom">Custom...</option>
                </select>
                <input type="number" id="left-day-custom-${conditionCount}" style="display: none; margin-top: 6px;" placeholder="e.g., -5" max="0">
            </div>
            <div>
                <label>Candle Type</label>
                <select id="left-candle-${conditionCount}">
                    <option value="min">Minute</option>
                    <option value="hr">Hour</option>
                    <option value="day">Day</option>
                </select>
            </div>
            <div>
                <label>Multiplier</label>
                <input type="number" id="left-mult-${conditionCount}" min="1" value="1" placeholder="e.g., 5">
            </div>
            <div>
                <label>Price Type</label>
                <select id="left-type-${conditionCount}">
                    <option value="open">Open</option>
                    <option value="high">High</option>
                    <option value="low">Low</option>
                    <option value="close">Close</option>
                    <option value="vwap">VWAP</option>
                </select>
            </div>
        </div>
        
        <div style="margin-bottom: 15px;">
            <label>Operator</label>
            <select id="operator-${conditionCount}">
                <option value=">">></option>
                <option value="<"><</option>
                <option value=">=">>=</option>
                <option value="<="><=</option>
                <option value="=">=</option>
            </select>
        </div>
        
        <div class="side-label">Right Side (To this):</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; margin-bottom: 15px;">
            <div>
                <label>Day</label>
                <select id="right-day-${conditionCount}" onchange="toggleCustomDay('right', ${conditionCount})">
                    <option value="0">Today (0)</option>
                    <option value="-1">Yesterday (-1)</option>
                    <option value="-2">2 Days Ago (-2)</option>
                    <option value="-3">3 Days Ago (-3)</option>
                    <option value="custom">Custom...</option>
                </select>
                <input type="number" id="right-day-custom-${conditionCount}" style="display: none; margin-top: 6px;" placeholder="e.g., -5" max="0">
            </div>
            <div>
                <label>Candle Type</label>
                <select id="right-candle-${conditionCount}">
                    <option value="min">Minute</option>
                    <option value="hr">Hour</option>
                    <option value="day">Day</option>
                </select>
            </div>
            <div>
                <label>Multiplier</label>
                <input type="number" id="right-mult-${conditionCount}" min="1" value="1" placeholder="e.g., 1">
            </div>
            <div>
                <label>Price Type</label>
                <select id="right-type-${conditionCount}">
                    <option value="open">Open</option>
                    <option value="high">High</option>
                    <option value="low">Low</option>
                    <option value="close">Close</option>
                    <option value="vwap">VWAP</option>
                </select>
            </div>
        </div>
        
        <div style="display: grid; grid-template-columns: 150px 1fr; gap: 10px;">
            <div>
                <label>Threshold Unit</label>
                <select id="threshold-unit-${conditionCount}">
                    <option value="%">Percent (%)</option>
                    <option value="$">Dollar ($)</option>
                </select>
            </div>
            <div>
                <label>Threshold Value</label>
                <input type="number" id="threshold-value-${conditionCount}" step="0.01" placeholder="e.g., 2.5">
            </div>
        </div>
    `;
    
    container.appendChild(conditionDiv);
}

// Remove a condition
function removeCondition(id) {
    const element = document.getElementById(`condition-${id}`);
    if (element) {
        element.remove();
        renumberConditions();
    }
}

// Renumber conditions after removal
function renumberConditions() {
    const conditions = document.querySelectorAll('.condition-item');
    
    // Reset counter when all conditions are removed
    if (conditions.length === 0) {
        conditionCount = 0;
        return;
    }
    
    // Update counter to match current number of conditions
    conditionCount = conditions.length;
    
    conditions.forEach((cond, index) => {
        const h4 = cond.querySelector('h4');
        if (h4) {
            h4.textContent = `Condition #${index + 1} ${index === 0 ? '(Entry Trigger)' : '(Prerequisite)'}`;
        }
    });
}

// Read CSV file
async function readCSV(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const text = e.target.result;
            const lines = text.split('\n');
            const symbols = lines
                .map(line => line.trim().toUpperCase())
                .filter(line => line && line.length > 0);
            resolve(symbols);
        };
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

// Handle form submission
async function handleSubmit(e) {
    // CRITICAL: Prevent default IMMEDIATELY
    e.preventDefault();
    e.stopPropagation();
    
    console.log('=== FORM SUBMIT STARTED ===');
    
    try {
        // Show loading message
        const loadingEl = document.getElementById('loadingMessage');
        const errorEl = document.getElementById('errorMessage');
        
        if (loadingEl) loadingEl.style.display = 'block';
        if (errorEl) errorEl.style.display = 'none';
        
        console.log('Collecting form data...');
        
        // Collect form data
        const config = await collectFormData();
        
        console.log('Config collected:', config);
        
        // Validate
        console.log('Validating config...');
        if (!validateConfig(config)) {
            throw new Error('Please fill in all required fields');
        }
        
        console.log('Validation passed');
        
        // Get API key
        const apiKey = localStorage.getItem('polygonApiKey');
        if (!apiKey) {
            throw new Error('API key not found. Please configure it in settings.');
        }
        
        console.log('Submitting to API...');
        
        // Submit backtest to async start endpoint
        const response = await authFetch('/api/stocks-backtest-v3/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify(config)
        });
        
        console.log('API response status:', response.status);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Backtest failed to start');
        }
        
        const result = await response.json();
        
        console.log('Backtest started! ID:', result.backtest_id);
        console.log('Status:', result.status);
        
        // Store config in sessionStorage for results page
        sessionStorage.setItem('stockBacktestConfig_' + result.backtest_id, JSON.stringify(config));
        
        // Redirect to results page immediately
        window.location.href = `/stock-backtest-results.html?id=${result.backtest_id}`;
        
    } catch (error) {
        console.error('=== ERROR IN FORM SUBMISSION ===');
        console.error('Error:', error);
        console.error('Stack:', error.stack);
        
        const errorEl = document.getElementById('errorMessage');
        const loadingEl = document.getElementById('loadingMessage');
        
        if (errorEl) {
            errorEl.textContent = `Error: ${error.message}`;
            errorEl.style.display = 'block';
        }
        if (loadingEl) {
            loadingEl.style.display = 'none';
        }
        
        // Alert as fallback
        alert(`Error: ${error.message}`);
    }
    
    // Ensure we never let default behavior through
    return false;
}

// Collect all form data
async function collectFormData() {
    const config = {};
    
    // Basic info
    config.name = document.getElementById('backtestName').value;
    config.start_date = document.getElementById('startDate').value;
    config.end_date = document.getElementById('endDate').value;
    
    // Symbol mode
    config.symbol_mode = document.querySelector('input[name="symbol_mode"]:checked').value;
    
    if (config.symbol_mode === 'single') {
        config.symbol = document.getElementById('singleSymbol').value.toUpperCase();
    } else if (config.symbol_mode === 'multiple') {
        const symbolsText = document.getElementById('multipleSymbols').value;
        config.symbols = symbolsText.split(',').map(s => s.trim().toUpperCase()).filter(s => s);
    } else { // all
        const csvFile = document.getElementById('csvFile').files[0];
        if (csvFile) {
            config.symbols = await readCSV(csvFile);
        } else {
            throw new Error('Please upload a CSV file for "All" mode');
        }
        
        // Optional filters
        const filterSharesMin = document.getElementById('filterSharesMin').value;
        const filterSharesMax = document.getElementById('filterSharesMax').value;
        const filterPriceMin = document.getElementById('filterPriceMin').value;
        const filterPriceMax = document.getElementById('filterPriceMax').value;
        const filterMcapMin = document.getElementById('filterMcapMin').value;
        const filterMcapMax = document.getElementById('filterMcapMax').value;
        
        if (filterSharesMin) config.filter_shares_min = filterSharesMin;
        if (filterSharesMax) config.filter_shares_max = filterSharesMax;
        if (filterPriceMin) config.filter_price_min = filterPriceMin;
        if (filterPriceMax) config.filter_price_max = filterPriceMax;
        if (filterMcapMin) config.filter_mcap_min = filterMcapMin;
        if (filterMcapMax) config.filter_mcap_max = filterMcapMax;
    }
    
    // Entry conditions
    config.entry_type = document.querySelector('input[name="entry_type"]:checked').value;
    
    if (config.entry_type === 'preset') {
        config.preset_condition = document.getElementById('presetCondition').value;
        
        if (config.preset_condition === '5') {
            // Velocity
            config.velocity_lookback = document.getElementById('velocityLookback').value;
            config.preset_operator = document.getElementById('velocityOperator').value;
            config.preset_threshold = document.getElementById('velocityThreshold').value;
        } else {
            config.preset_operator = document.getElementById('presetOperator').value;
            config.preset_threshold = document.getElementById('presetThreshold').value;
        }
    } else {
        // Custom conditions
        config.custom_conditions = [];
        const conditions = document.querySelectorAll('.condition-item');
        
        conditions.forEach((condItem, index) => {
            const id = condItem.id.split('-')[1];
            
            const condition = {
                type: index === 0 ? 'entry' : 'prior',
                left_day: parseInt(document.getElementById(`left-day-${id}`).value),
                left_candle: document.getElementById(`left-candle-${id}`).value,
                left_multiplier: parseInt(document.getElementById(`left-mult-${id}`).value),
                left_type: document.getElementById(`left-type-${id}`).value,
                operation: document.getElementById(`operator-${id}`).value,
                right_day: parseInt(document.getElementById(`right-day-${id}`).value),
                right_candle: document.getElementById(`right-candle-${id}`).value,
                right_multiplier: parseInt(document.getElementById(`right-mult-${id}`).value),
                right_type: document.getElementById(`right-type-${id}`).value,
                threshold_unit: document.getElementById(`threshold-unit-${id}`).value,
                threshold_value: parseFloat(document.getElementById(`threshold-value-${id}`).value)
            };
            
            config.custom_conditions.push(condition);
        });
    }
    
    // Direction (Long/Short)
    config.direction = document.querySelector('input[name="direction"]:checked').value;
    
    // Sizing
    config.sizing_type = document.querySelector('input[name="sizing_type"]:checked').value;
    
    if (config.sizing_type === 'shares') {
        config.sizing_value = document.getElementById('stockSizingShares')?.value || document.getElementById('sizingShares')?.value || '';
    } else if (config.sizing_type === 'dollars') {
        config.sizing_value = document.getElementById('stockSizingDollars')?.value || document.getElementById('sizingDollars')?.value || '';
    } else {
        config.starting_capital = document.getElementById('startingCapital')?.value || '50000';
        config.sizing_value = document.getElementById('stockSizingPercent')?.value || document.getElementById('sizingPercent')?.value || '';
    }
    
    // Exit criteria
    config.take_profit_type = document.querySelector('input[name="take_profit_type"]:checked').value;
    config.take_profit_value = document.getElementById('takeProfitValue').value;
    config.stop_loss_type = document.querySelector('input[name="stop_loss_type"]:checked').value;
    config.stop_loss_value = document.getElementById('stopLossValue').value;
    config.max_days = document.getElementById('maxDays').value;
    
    // Consecutive trades
    config.allow_consecutive_trades = document.getElementById('allowConsecutive').checked;
    
    return config;
}

// Validate configuration
function validateConfig(config) {
    // Auto-generate name if not provided
    if (!config.name) {
        const symbol = config.symbol || (config.symbols && config.symbols[0]) || 'Multi';
        config.name = `${symbol} Backtest ${new Date().toLocaleDateString()}`;
    }
    
    // Check required date fields
    if (!config.start_date || !config.end_date) {
        return false;
    }
    
    // Check symbols
    if (config.symbol_mode === 'single' && !config.symbol) {
        return false;
    }
    if (config.symbol_mode === 'multiple' && (!config.symbols || config.symbols.length === 0)) {
        return false;
    }
    if (config.symbol_mode === 'all' && (!config.symbols || config.symbols.length === 0)) {
        return false;
    }
    
    // Check entry conditions
    if (config.entry_type === 'preset') {
        if (!config.preset_operator || !config.preset_threshold) {
            return false;
        }
    } else {
        if (!config.custom_conditions || config.custom_conditions.length === 0) {
            return false;
        }
    }
    
    // Check sizing - sizing_value should be a number, not a string like 'shares'
    const sizingVal = parseFloat(config.sizing_value);
    if (isNaN(sizingVal) || sizingVal <= 0) {
        return false;
    }
    if (config.sizing_type === 'percent' && !config.starting_capital) {
        return false;
    }
    
    // Check exit criteria
    if (!config.take_profit_value || !config.stop_loss_value || !config.max_days) {
        return false;
    }
    
    return true;
}

// ============================================================================
// RESULTS DISPLAY FUNCTIONS
// ============================================================================

async function displayResults(backtestId, apiKey) {
    try {
        console.log('Fetching results for backtest ID:', backtestId);
        
        // No API key needed for viewing results - just reading saved files
        
        // Fetch results from API
        const response = await authFetch(`/api/stocks-backtest-v3/results/${backtestId}`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch results');
        }
        
        const data = await response.json();
        console.log('===== API RESPONSE RECEIVED =====');
        console.log('Full response:', data);
        console.log('Response keys:', Object.keys(data));
        console.log('Has stats?', 'stats' in data);
        console.log('Stats value:', data.stats);
        console.log('Has trades?', 'trades' in data);
        console.log('Trades count:', data.trades ? data.trades.length : 'N/A');
        console.log('=================================');
        
        // Show results section
        document.getElementById('backtestResults').style.display = 'block';
        
        // Display equity curve if available
        if (data.equity_curve_data || data.trades) {
            const curveSection = document.getElementById('equityCurveSection');
            const container = document.getElementById('equityCurveContainer');
            curveSection.style.display = 'block';
            
            // Create canvas for Chart.js
            container.innerHTML = '<canvas id="equityCurveChart"></canvas>';
            
            // Build equity curve from trades
            const equityData = buildEquityCurve(data.trades || []);
            
            // Render chart
            renderEquityCurve(equityData);
        }
        
        // Display statistics - pass stats or empty object if undefined
        displayStatistics(data.stats || {});
        
        // Display trades table
        displayTradesTable(data.trades || []);
        
        // Setup download CSV button
        setupDownloadButton(data.csv_data, backtestId);
        
        // Setup view full results button
        setupViewFullResultsButton(backtestId);
        
        console.log('Results displayed successfully');
        
    } catch (error) {
        console.error('Error displaying results:', error);
        alert('Error loading results: ' + error.message);
    }
}

function displayStatistics(stats) {
    // Check if stats exists
    if (!stats) {
        console.error('Stats is undefined or null');
        console.error('This usually means the API response structure is different than expected');
        // Set all to 0
        document.getElementById('statTotalTrades').textContent = '0';
        document.getElementById('statWinRate').textContent = '0.0%';
        document.getElementById('statTotalPL').textContent = '$0.00';
        document.getElementById('statAvgWin').textContent = '$0.00';
        document.getElementById('statAvgLoss').textContent = '$0.00';
        document.getElementById('statProfitFactor').textContent = '0.00';
        document.getElementById('statMaxDrawdown').textContent = '0.00%';
        document.getElementById('statTotalReturn').textContent = '0.00%';
        return;
    }
    
    console.log('Displaying stats:', stats);
    
    // Update each stat value with safe access
    document.getElementById('statTotalTrades').textContent = stats.total_trades !== undefined ? stats.total_trades : 0;
    document.getElementById('statWinRate').textContent = stats.win_rate !== undefined
        ? `${stats.win_rate.toFixed(1)}%` 
        : '0.0%';
    document.getElementById('statTotalPL').textContent = stats.total_pnl !== undefined
        ? `$${stats.total_pnl.toFixed(2)}` 
        : '$0.00';
    document.getElementById('statAvgWin').textContent = stats.avg_win !== undefined
        ? `$${stats.avg_win.toFixed(2)}` 
        : '$0.00';
    document.getElementById('statAvgLoss').textContent = stats.avg_loss !== undefined
        ? `$${stats.avg_loss.toFixed(2)}` 
        : '$0.00';
    document.getElementById('statProfitFactor').textContent = stats.profit_factor !== undefined
        ? stats.profit_factor.toFixed(2) 
        : '0.00';
    document.getElementById('statMaxDrawdown').textContent = stats.max_drawdown !== undefined
        ? `${stats.max_drawdown.toFixed(2)}%` 
        : '0.00%';
    document.getElementById('statTotalReturn').textContent = stats.total_return !== undefined
        ? `${stats.total_return.toFixed(2)}%` 
        : '0.00%';
    
    // Color code positive/negative values
    const plEl = document.getElementById('statTotalPL');
    if (stats.total_pnl > 0) {
        plEl.style.color = '#10b981';
    } else if (stats.total_pnl < 0) {
        plEl.style.color = '#ef4444';
    }
    
    const returnEl = document.getElementById('statTotalReturn');
    if (stats.total_return > 0) {
        returnEl.style.color = '#10b981';
    } else if (stats.total_return < 0) {
        returnEl.style.color = '#ef4444';
    }
}

function displayTradesTable(trades) {
    const thead = document.getElementById('tradesTableHead');
    const tbody = document.getElementById('tradesTableBody');
    
    // Clear existing content
    thead.innerHTML = '';
    tbody.innerHTML = '';
    
    if (!trades || trades.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center;">No trades executed</td></tr>';
        return;
    }
    
    // Create header
    thead.innerHTML = `
        <tr>
            <th>Trade #</th>
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
    
    // Create rows
    trades.forEach((trade, index) => {
        const pnl = trade.pnl || 0;
        const pnlPct = trade.pnl_pct || 0;
        const pnlClass = pnl >= 0 ? 'positive' : 'negative';
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td><strong>${trade.symbol || 'N/A'}</strong></td>
            <td>${trade.entry_date || 'N/A'}</td>
            <td>$${(trade.entry_price || 0).toFixed(2)}</td>
            <td>${trade.exit_date || 'N/A'}</td>
            <td>$${(trade.exit_price || 0).toFixed(2)}</td>
            <td>${trade.shares || 0}</td>
            <td class="${pnlClass}">$${pnl.toFixed(2)}</td>
            <td class="${pnlClass}">${pnlPct.toFixed(2)}%</td>
            <td>${trade.exit_reason || 'N/A'}</td>
        `;
        tbody.appendChild(row);
    });
}

function setupDownloadButton(csvData, backtestId) {
    const downloadBtn = document.getElementById('downloadCSV');
    if (!downloadBtn) return;
    
    downloadBtn.onclick = () => {
        if (!csvData) {
            alert('No CSV data available');
            return;
        }
        
        // Create blob and download
        const blob = new Blob([csvData], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `stock_backtest_${backtestId}_trades.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    };
}

function setupViewFullResultsButton(backtestId) {
    const viewBtn = document.getElementById('viewFullResults');
    if (!viewBtn) return;
    
    viewBtn.onclick = () => {
        window.open(`stock-backtest-results.html?id=${backtestId}`, '_blank');
    };
}

// Build equity curve data from trades
function buildEquityCurve(trades) {
    if (!trades || trades.length === 0) {
        return { labels: ['Start'], values: [0] };
    }
    
    const labels = ['Start'];
    const values = [0];
    let runningTotal = 0;
    
    trades.forEach((trade, index) => {
        runningTotal += (trade.pnl || 0);
        labels.push(`Trade ${index + 1}`);
        values.push(runningTotal);
    });
    
    return { labels, values };
}

// Render equity curve using Chart.js
let equityCurveChart = null;

function renderEquityCurve(data) {
    const ctx = document.getElementById('equityCurveChart');
    if (!ctx) {
        console.error('Canvas element not found');
        return;
    }
    
    // Destroy existing chart if any
    if (equityCurveChart) {
        equityCurveChart.destroy();
    }
    
    // Calculate tight y-axis bounds with 5% padding
    const minVal = Math.min(...data.values);
    const maxVal = Math.max(...data.values);
    const range = maxVal - minVal || 1;
    const yPadding = range * 0.12;
    const isMobile = window.innerWidth <= 480;
    
    equityCurveChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Cumulative P&L ($)',
                data: data.values,
                borderColor: '#3b82f6',
                borderWidth: 2.5,
                fill: false,
                tension: 0,
                pointRadius: 0,
                pointHoverRadius: 4,
                pointBackgroundColor: '#3b82f6'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: isMobile ? 1.3 : 1.8,
            layout: {
                padding: { top: 0, right: 0, bottom: 0, left: 0 }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return 'P&L: $' + context.parsed.y.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: { display: false },
                    ticks: {
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: isMobile ? 4 : 8,
                        font: { size: isMobile ? 10 : 11 },
                        color: '#9ca3af',
                        padding: 8
                    },
                    border: { display: false }
                },
                y: {
                    display: true,
                    position: 'right',
                    min: minVal - yPadding,
                    max: maxVal + yPadding,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.08)',
                        borderDash: [4, 4],
                        drawBorder: false
                    },
                    ticks: {
                        font: { size: isMobile ? 10 : 11 },
                        color: '#9ca3af',
                        padding: 8,
                        maxTicksLimit: 6,
                        callback: function(value) {
                            if (Math.abs(value) >= 1000) {
                                return '$' + (value / 1000).toFixed(0) + 'k';
                            }
                            return '$' + value.toLocaleString();
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
}

// =============================================================================
// TEMPLATE MANAGEMENT - STOCK BACKTESTER
// =============================================================================

async function loadStockTemplates() {
    try {
        const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? `http://${window.location.hostname}:${window.location.port}/api`
            : '/api';
        
        const response = await authFetch(`${apiUrl}/backtest-templates?type=stocks`);
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                stockTemplates = data.templates || [];
                stockTemplatesLoaded = true;
                renderStockTemplatesList();
                console.log('Loaded', stockTemplates.length, 'stock templates');
            }
        }
    } catch (error) {
        console.error('Error loading stock templates:', error);
    }
}

function toggleStockTemplatesMenu() {
    var menu = document.getElementById('stockTemplatesMenu');
    if (menu) {
        var isVisible = menu.style.display === 'block';
        menu.style.display = isVisible ? 'none' : 'block';
        if (!isVisible && !stockTemplatesLoaded) {
            loadStockTemplates();
        }
    }
}

function renderStockTemplatesList() {
    var container = document.getElementById('stockTemplatesList');
    if (!container) return;
    
    if (stockTemplates.length === 0) {
        container.innerHTML = '<div style="padding: 10px; color: #666; font-style: italic;">No saved templates</div>';
        return;
    }
    
    container.innerHTML = stockTemplates.map(template => `
        <div class="template-item" style="padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; cursor: pointer;" 
             onmouseover="this.style.background='#f5f5f5'" 
             onmouseout="this.style.background='white'">
            <span onclick="applyStockTemplate(${template.id})" style="flex: 1;">${template.name}</span>
            <button onclick="deleteStockTemplate(${template.id}, event)" 
                    style="background: none; border: none; color: #dc3545; cursor: pointer; padding: 2px 6px;"
                    title="Delete template">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
    `).join('');
}

function collectStockFormData() {
    var config = {};
    
    // Symbol mode
    config.symbolMode = document.querySelector('input[name="symbol_mode"]:checked')?.value || 'single';
    config.singleSymbol = document.getElementById('singleSymbol')?.value || '';
    config.multipleSymbols = document.getElementById('multipleSymbols')?.value || '';
    
    // Entry type
    config.entryType = document.querySelector('input[name="entry_type"]:checked')?.value || 'preset';
    config.presetCondition = document.getElementById('presetCondition')?.value || '1';
    
    // Preset fields
    config.entryTime = document.getElementById('entryTime')?.value || '09:35';
    config.exitTime = document.getElementById('exitTime')?.value || '15:55';
    config.gapMin = document.getElementById('gapMin')?.value || '';
    config.gapMax = document.getElementById('gapMax')?.value || '';
    config.premarketVolumeMin = document.getElementById('premarketVolumeMin')?.value || '';
    
    // Velocity fields
    config.velocityPercent = document.getElementById('velocityPercent')?.value || '';
    config.velocityBars = document.getElementById('velocityBars')?.value || '';
    
    // Custom conditions
    config.conditions = [];
    document.querySelectorAll('.condition-row').forEach((row, index) => {
        var condition = {
            indicator: row.querySelector('.indicator-select')?.value || '',
            comparison: row.querySelector('.comparison-select')?.value || '',
            value: row.querySelector('.value-input')?.value || ''
        };
        config.conditions.push(condition);
    });
    
    // Sizing type
    config.sizingType = document.querySelector('input[name="sizing_type"]:checked')?.value || 'shares';
    config.shares = document.getElementById('shares')?.value || '';
    config.dollars = document.getElementById('dollars')?.value || '';
    config.accountPercent = document.getElementById('accountPercent')?.value || '';
    
    // Starting capital
    config.startingCapital = document.getElementById('startingCapital')?.value || '100000';
    
    // Allow consecutive
    config.allowConsecutive = document.getElementById('allowConsecutive')?.checked || false;
    
    return config;
}

async function saveStockTemplate() {
    if (typeof window.isAuthenticated === 'function' && !window.isAuthenticated()) {
        alert('Please log in to save templates');
        return;
    }
    
    var templateName = prompt('Enter a name for this template:');
    if (!templateName || !templateName.trim()) return;
    
    var config = collectStockFormData();
    
    try {
        const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? `http://${window.location.hostname}:${window.location.port}/api`
            : '/api';
        
        const response = await authFetch(`${apiUrl}/backtest-templates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: templateName.trim(),
                template_type: 'stocks',
                template_config: config
            })
        });
        
        const data = await response.json();
        if (data.success) {
            await loadStockTemplates();
            alert('Template saved successfully!');
        } else {
            alert('Error saving template: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        alert('Error saving template: ' + error.message);
    }
}

async function applyStockTemplate(templateId) {
    var template = stockTemplates.find(t => t.id === templateId);
    if (!template) return;
    
    var config = template.template_config;
    
    // Close menu
    document.getElementById('stockTemplatesMenu').style.display = 'none';
    
    // Apply symbol mode
    var symbolRadio = document.querySelector(`input[name="symbol_mode"][value="${config.symbolMode || 'single'}"]`);
    if (symbolRadio) {
        symbolRadio.checked = true;
        updateSymbolMode();
    }
    
    if (document.getElementById('singleSymbol')) document.getElementById('singleSymbol').value = config.singleSymbol || '';
    if (document.getElementById('multipleSymbols')) document.getElementById('multipleSymbols').value = config.multipleSymbols || '';
    
    // Apply entry type
    var entryRadio = document.querySelector(`input[name="entry_type"][value="${config.entryType || 'preset'}"]`);
    if (entryRadio) {
        entryRadio.checked = true;
        updateEntryType();
    }
    
    if (document.getElementById('presetCondition')) document.getElementById('presetCondition').value = config.presetCondition || '1';
    
    // Apply preset fields
    if (document.getElementById('entryTime')) document.getElementById('entryTime').value = config.entryTime || '09:35';
    if (document.getElementById('exitTime')) document.getElementById('exitTime').value = config.exitTime || '15:55';
    if (document.getElementById('gapMin')) document.getElementById('gapMin').value = config.gapMin || '';
    if (document.getElementById('gapMax')) document.getElementById('gapMax').value = config.gapMax || '';
    if (document.getElementById('premarketVolumeMin')) document.getElementById('premarketVolumeMin').value = config.premarketVolumeMin || '';
    
    // Apply velocity fields
    if (document.getElementById('velocityPercent')) document.getElementById('velocityPercent').value = config.velocityPercent || '';
    if (document.getElementById('velocityBars')) document.getElementById('velocityBars').value = config.velocityBars || '';
    
    // Apply sizing type
    var sizingRadio = document.querySelector(`input[name="sizing_type"][value="${config.sizingType || 'shares'}"]`);
    if (sizingRadio) {
        sizingRadio.checked = true;
        updateSizingType();
    }
    
    if (document.getElementById('shares')) document.getElementById('shares').value = config.shares || '';
    if (document.getElementById('dollars')) document.getElementById('dollars').value = config.dollars || '';
    if (document.getElementById('accountPercent')) document.getElementById('accountPercent').value = config.accountPercent || '';
    
    // Apply starting capital
    if (document.getElementById('startingCapital')) document.getElementById('startingCapital').value = config.startingCapital || '100000';
    
    // Apply allow consecutive
    if (document.getElementById('allowConsecutive')) document.getElementById('allowConsecutive').checked = config.allowConsecutive || false;
    
    console.log('Stock template applied:', template.name);
}

async function deleteStockTemplate(templateId, event) {
    event.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this template?')) return;
    
    try {
        const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? `http://${window.location.hostname}:${window.location.port}/api`
            : '/api';
        
        const response = await authFetch(`${apiUrl}/backtest-templates/${templateId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        if (data.success) {
            await loadStockTemplates();
        } else {
            alert('Error deleting template: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        alert('Error deleting template: ' + error.message);
    }
}
