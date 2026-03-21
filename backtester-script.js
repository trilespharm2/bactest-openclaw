// Backtester Page JavaScript
// Matches EXACT structure of options_backtester_v2_3_3-5.py

var optionsTemplates = [];
var optionsTemplatesLoaded = false;
var priceConditionCount = 0;

// =============================================================================
// UNDERLYING PRICE CONDITIONS
// =============================================================================

const CANDLE_TYPES = [
    { value: 'minute', label: 'Minute' },
    { value: 'hour', label: 'Hour' },
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'quarter', label: 'Quarter' },
    { value: 'year', label: 'Year' }
];

const SERIES_TYPES = [
    { value: 'open', label: 'Open' },
    { value: 'high', label: 'High' },
    { value: 'low', label: 'Low' },
    { value: 'close', label: 'Close' }
];

const DAY_OPTIONS = [
    { value: '0', label: 'Today (0)' },
    { value: '-1', label: 'Yesterday (-1)' },
    { value: '-2', label: '2 days ago (-2)' },
    { value: '-3', label: '3 days ago (-3)' },
    { value: '-4', label: '4 days ago (-4)' },
    { value: '-5', label: '5 days ago (-5)' }
];

const OPERATORS = [
    { value: '>', label: '>' },
    { value: '<', label: '<' },
    { value: '>=', label: '>=' },
    { value: '<=', label: '<=' },
    { value: '==', label: '==' },
    { value: '><', label: 'Between (><)' }
];

const METRICS = [
    { value: 'price', label: 'Price' },
    { value: 'sma', label: 'SMA' },
    { value: 'ema', label: 'EMA' },
    { value: 'rsi', label: 'RSI' },
    { value: 'macd', label: 'MACD' }
];

function addPriceCondition() {
    const container = document.getElementById('priceConditionsContainer');
    if (!container) return;
    
    // Limit to max 3 conditions
    const existingConditions = container.querySelectorAll('.price-condition-row');
    if (existingConditions.length >= 3) {
        alert('Maximum of 3 price conditions allowed.');
        return;
    }
    
    const conditionId = priceConditionCount++;
    const conditionDiv = document.createElement('div');
    conditionDiv.className = 'price-condition-row card p-3 mb-3';
    conditionDiv.id = `priceCondition${conditionId}`;
    conditionDiv.style.cssText = 'background: #f8f9fa; border: 1px solid #dee2e6;';
    
    conditionDiv.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-2">
            <strong class="text-muted">Condition ${conditionId + 1}</strong>
            <button type="button" class="btn btn-sm btn-outline-danger" onclick="removePriceCondition(${conditionId})">
                <i class="fas fa-times"></i>
            </button>
        </div>
        
        <!-- Left Side (Compare this) -->
        <div class="condition-left-side mb-3">
            <label class="form-label fw-bold">Left Side (Compare this)</label>
            <div class="row g-2">
                <div class="col-md-2">
                    <label class="form-label small">Metric</label>
                    <select class="form-select form-select-sm" id="metric${conditionId}" onchange="updateConditionFields(${conditionId})">
                        ${METRICS.map(m => `<option value="${m.value}">${m.label}</option>`).join('')}
                    </select>
                </div>
                <div class="col-md-2">
                    <label class="form-label small">Day</label>
                    <select class="form-select form-select-sm" id="leftDay${conditionId}">
                        ${DAY_OPTIONS.map(d => `<option value="${d.value}">${d.label}</option>`).join('')}
                    </select>
                </div>
                <div class="col-md-2">
                    <label class="form-label small">Candle Type</label>
                    <select class="form-select form-select-sm" id="leftCandleType${conditionId}" onchange="handleCandleTypeChange(${conditionId})">
                        ${CANDLE_TYPES.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
                    </select>
                </div>
                <div class="col-md-2" id="leftWindowGroup${conditionId}">
                    <label class="form-label small" id="leftWindowLabel${conditionId}">Window</label>
                    <input type="number" class="form-control form-control-sm" id="leftWindow${conditionId}" value="14" min="1">
                </div>
                <div class="col-md-2" id="leftSeriesTypeGroup${conditionId}">
                    <label class="form-label small" id="leftSeriesLabel${conditionId}">Series Type</label>
                    <select class="form-select form-select-sm" id="leftSeriesType${conditionId}">
                        ${SERIES_TYPES.map(s => `<option value="${s.value}"${s.value === 'close' ? ' selected' : ''}>${s.label}</option>`).join('')}
                    </select>
                </div>
                <!-- MACD specific fields -->
                <div class="col-md-2" id="leftMacdShortGroup${conditionId}" style="display: none;">
                    <label class="form-label small">Short Window</label>
                    <input type="number" class="form-control form-control-sm" id="leftMacdShort${conditionId}" value="12" min="1">
                </div>
                <div class="col-md-2" id="leftMacdLongGroup${conditionId}" style="display: none;">
                    <label class="form-label small">Long Window</label>
                    <input type="number" class="form-control form-control-sm" id="leftMacdLong${conditionId}" value="26" min="1">
                </div>
                <div class="col-md-2" id="leftMacdSignalGroup${conditionId}" style="display: none;">
                    <label class="form-label small">Signal Window</label>
                    <input type="number" class="form-control form-control-sm" id="leftMacdSignal${conditionId}" value="9" min="1">
                </div>
                <!-- MACD Component selector -->
                <div class="col-md-2" id="leftMacdComponentGroup${conditionId}" style="display: none;">
                    <label class="form-label small">Component</label>
                    <select class="form-select form-select-sm" id="leftMacdComponent${conditionId}" onchange="updateComparatorOptions(${conditionId})">
                        <option value="histogram">Histogram</option>
                        <option value="signal">Signal</option>
                        <option value="macd_line">MACD Line</option>
                    </select>
                </div>
            </div>
        </div>
        
        <!-- Operator Row -->
        <div class="condition-operator mb-3">
            <div class="row g-2 align-items-end">
                <div class="col-md-3">
                    <label class="form-label fw-bold">Operator</label>
                    <select class="form-select" id="operator${conditionId}">
                        ${OPERATORS.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
                    </select>
                </div>
                <div class="col-md-3">
                    <label class="form-label">Comparator</label>
                    <select class="form-select" id="comparator${conditionId}" onchange="updateRightSideVisibility(${conditionId})">
                        <option value="value">Value</option>
                        <option value="compare_price">Compare Price</option>
                        <option value="compare_sma">Compare SMA</option>
                        <option value="compare_ema">Compare EMA</option>
                    </select>
                </div>
                <div class="col-md-3" id="valueInputGroup${conditionId}">
                    <label class="form-label">Value</label>
                    <input type="number" class="form-control" id="compareValue${conditionId}" step="0.01" placeholder="e.g., 50">
                </div>
            </div>
        </div>
        
        <!-- Right Side (To this) - hidden by default -->
        <div class="condition-right-side mb-3" id="rightSide${conditionId}" style="display: none;">
            <label class="form-label fw-bold">Right Side (To this)</label>
            <div class="row g-2">
                <div class="col-md-2">
                    <label class="form-label small">Day</label>
                    <select class="form-select form-select-sm" id="rightDay${conditionId}">
                        ${DAY_OPTIONS.map(d => `<option value="${d.value}">${d.label}</option>`).join('')}
                    </select>
                </div>
                <div class="col-md-2">
                    <label class="form-label small">Candle Type</label>
                    <select class="form-select form-select-sm" id="rightCandleType${conditionId}">
                        ${CANDLE_TYPES.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
                    </select>
                </div>
                <div class="col-md-2" id="rightWindowGroup${conditionId}">
                    <label class="form-label small">Window</label>
                    <input type="number" class="form-control form-control-sm" id="rightWindow${conditionId}" value="14" min="1">
                </div>
                <div class="col-md-2" id="rightSeriesTypeGroup${conditionId}">
                    <label class="form-label small" id="rightSeriesLabel${conditionId}">Series Type</label>
                    <select class="form-select form-select-sm" id="rightSeriesType${conditionId}">
                        ${SERIES_TYPES.map(s => `<option value="${s.value}"${s.value === 'close' ? ' selected' : ''}>${s.label}</option>`).join('')}
                    </select>
                </div>
                <!-- MACD specific fields for right side -->
                <div class="col-md-2" id="rightMacdShortGroup${conditionId}" style="display: none;">
                    <label class="form-label small">Short Window</label>
                    <input type="number" class="form-control form-control-sm" id="rightMacdShort${conditionId}" value="12" min="1">
                </div>
                <div class="col-md-2" id="rightMacdLongGroup${conditionId}" style="display: none;">
                    <label class="form-label small">Long Window</label>
                    <input type="number" class="form-control form-control-sm" id="rightMacdLong${conditionId}" value="26" min="1">
                </div>
                <div class="col-md-2" id="rightMacdSignalGroup${conditionId}" style="display: none;">
                    <label class="form-label small">Signal Window</label>
                    <input type="number" class="form-control form-control-sm" id="rightMacdSignal${conditionId}" value="9" min="1">
                </div>
            </div>
            
            <!-- Threshold -->
            <div class="row g-2 mt-2">
                <div class="col-md-3">
                    <label class="form-label small">Threshold Unit</label>
                    <select class="form-select form-select-sm" id="thresholdUnit${conditionId}">
                        <option value="percent">Percent (%)</option>
                        <option value="dollar">Dollar ($)</option>
                    </select>
                </div>
                <div class="col-md-3">
                    <label class="form-label small">Threshold Value</label>
                    <input type="number" class="form-control form-control-sm" id="thresholdValue${conditionId}" step="0.01" placeholder="e.g., 2.5">
                </div>
            </div>
        </div>
    `;
    
    container.appendChild(conditionDiv);
    updateConditionFields(conditionId);
}

function removePriceCondition(conditionId) {
    const conditionDiv = document.getElementById(`priceCondition${conditionId}`);
    if (conditionDiv) {
        conditionDiv.remove();
    }
    // Renumber remaining conditions
    renumberPriceConditions();
    // Re-check if any remaining conditions use Day candles
    checkDayCandleConditions();
}

function renumberPriceConditions() {
    const container = document.getElementById('priceConditionsContainer');
    if (!container) return;
    
    const conditionRows = container.querySelectorAll('.price-condition-row');
    conditionRows.forEach((row, index) => {
        // Update the condition header text
        const header = row.querySelector('strong.text-muted');
        if (header) {
            header.textContent = `Condition ${index + 1}`;
        }
    });
    
    // Reset counter to match current count (for next add)
    priceConditionCount = conditionRows.length;
}

function updateConditionFields(conditionId) {
    const metric = document.getElementById(`metric${conditionId}`)?.value;
    
    // Window groups
    const leftWindowGroup = document.getElementById(`leftWindowGroup${conditionId}`);
    const leftWindowLabel = document.getElementById(`leftWindowLabel${conditionId}`);
    const leftSeriesTypeGroup = document.getElementById(`leftSeriesTypeGroup${conditionId}`);
    const leftSeriesLabel = document.getElementById(`leftSeriesLabel${conditionId}`);
    
    // MACD specific groups
    const leftMacdShortGroup = document.getElementById(`leftMacdShortGroup${conditionId}`);
    const leftMacdLongGroup = document.getElementById(`leftMacdLongGroup${conditionId}`);
    const leftMacdSignalGroup = document.getElementById(`leftMacdSignalGroup${conditionId}`);
    const leftMacdComponentGroup = document.getElementById(`leftMacdComponentGroup${conditionId}`);
    
    // Comparator dropdown
    const comparatorSelect = document.getElementById(`comparator${conditionId}`);
    
    // Hide all MACD-specific groups first
    if (leftMacdShortGroup) leftMacdShortGroup.style.display = 'none';
    if (leftMacdLongGroup) leftMacdLongGroup.style.display = 'none';
    if (leftMacdSignalGroup) leftMacdSignalGroup.style.display = 'none';
    if (leftMacdComponentGroup) leftMacdComponentGroup.style.display = 'none';
    
    // Update based on metric
    switch (metric) {
        case 'price':
            if (leftWindowGroup) leftWindowGroup.style.display = 'none';
            if (leftSeriesTypeGroup) leftSeriesTypeGroup.style.display = 'block';
            if (leftSeriesLabel) leftSeriesLabel.textContent = 'Price Type';
            updateComparatorOptions(conditionId, ['value', 'compare_price', 'compare_sma', 'compare_ema']);
            break;
            
        case 'sma':
        case 'ema':
            if (leftWindowGroup) leftWindowGroup.style.display = 'block';
            if (leftWindowLabel) leftWindowLabel.textContent = 'Window';
            if (leftSeriesTypeGroup) leftSeriesTypeGroup.style.display = 'block';
            if (leftSeriesLabel) leftSeriesLabel.textContent = 'Series Type';
            updateComparatorOptions(conditionId, ['value', 'compare_price', 'compare_sma', 'compare_ema']);
            break;
            
        case 'rsi':
            if (leftWindowGroup) leftWindowGroup.style.display = 'block';
            if (leftWindowLabel) leftWindowLabel.textContent = 'Window';
            if (leftSeriesTypeGroup) leftSeriesTypeGroup.style.display = 'block';
            if (leftSeriesLabel) leftSeriesLabel.textContent = 'Series Type';
            updateComparatorOptions(conditionId, ['value', 'compare_rsi']);
            break;
            
        case 'macd':
            if (leftWindowGroup) leftWindowGroup.style.display = 'none';
            if (leftSeriesTypeGroup) leftSeriesTypeGroup.style.display = 'block';
            if (leftSeriesLabel) leftSeriesLabel.textContent = 'Series Type';
            if (leftMacdShortGroup) leftMacdShortGroup.style.display = 'block';
            if (leftMacdLongGroup) leftMacdLongGroup.style.display = 'block';
            if (leftMacdSignalGroup) leftMacdSignalGroup.style.display = 'block';
            if (leftMacdComponentGroup) leftMacdComponentGroup.style.display = 'block';
            updateMacdComparatorOptions(conditionId);
            break;
    }
    
    updateRightSideVisibility(conditionId);
}

function handleCandleTypeChange(conditionId) {
    // Only apply restrictions to condition 0 (first condition row)
    if (conditionId === 0) {
        const leftCandleType = document.getElementById(`leftCandleType${conditionId}`)?.value;
        const leftSeriesType = document.getElementById(`leftSeriesType${conditionId}`);
        
        if (leftSeriesType) {
            const nonMinuteCandles = ['day', 'week', 'month', 'quarter', 'year'];
            if (nonMinuteCandles.includes(leftCandleType)) {
                // For Day/Week/Month/Quarter/Year, only allow Open (can't know H/L/C at entry)
                leftSeriesType.innerHTML = '<option value="open" selected>Open</option>';
            } else {
                // For Minute candles, show all series types
                leftSeriesType.innerHTML = SERIES_TYPES.map(s => 
                    `<option value="${s.value}"${s.value === 'close' ? ' selected' : ''}>${s.label}</option>`
                ).join('');
            }
        }
        
        // Only check day candle conditions for condition 0
        checkDayCandleConditions();
    }
}

function checkDayCandleConditions() {
    // Only check condition 0 (first condition row) for Day candle type
    const leftCandleType = document.getElementById('leftCandleType0')?.value;
    let hasDayCandleCondition = false;
    
    if (leftCandleType === 'day' || leftCandleType === 'week' || leftCandleType === 'month' || 
        leftCandleType === 'quarter' || leftCandleType === 'year') {
        hasDayCandleCondition = true;
    }
    
    const entryTimeInput = document.getElementById('entryTime');
    const entryTimeMaxInput = document.getElementById('entryTimeMax');
    
    if (hasDayCandleCondition) {
        // Auto-populate to 09:30 and disable
        if (entryTimeInput) {
            entryTimeInput.value = '09:30';
            entryTimeInput.disabled = true;
            entryTimeInput.style.backgroundColor = '#e9ecef';
            entryTimeInput.title = 'Entry time locked to 09:30 when using Day/Week/Month candles for conditions';
        }
        if (entryTimeMaxInput) {
            entryTimeMaxInput.value = '';
            entryTimeMaxInput.disabled = true;
            entryTimeMaxInput.style.backgroundColor = '#e9ecef';
        }
    } else {
        // Re-enable entry time fields
        if (entryTimeInput) {
            entryTimeInput.disabled = false;
            entryTimeInput.style.backgroundColor = '';
            entryTimeInput.title = '';
        }
        if (entryTimeMaxInput) {
            entryTimeMaxInput.disabled = false;
            entryTimeMaxInput.style.backgroundColor = '';
        }
    }
}

function updateComparatorOptions(conditionId, options) {
    const metric = document.getElementById(`metric${conditionId}`)?.value;
    const comparatorSelect = document.getElementById(`comparator${conditionId}`);
    if (!comparatorSelect) return;
    
    if (metric === 'macd') {
        updateMacdComparatorOptions(conditionId);
        return;
    }
    
    if (!options) {
        options = ['value', 'compare_price', 'compare_sma', 'compare_ema'];
    }
    
    const optionLabels = {
        'value': 'Value',
        'compare_price': 'Compare Price',
        'compare_sma': 'Compare SMA',
        'compare_ema': 'Compare EMA',
        'compare_rsi': 'Compare RSI'
    };
    
    comparatorSelect.innerHTML = options.map(opt => 
        `<option value="${opt}">${optionLabels[opt] || opt}</option>`
    ).join('');
}

function updateMacdComparatorOptions(conditionId) {
    const macdComponent = document.getElementById(`leftMacdComponent${conditionId}`)?.value;
    const comparatorSelect = document.getElementById(`comparator${conditionId}`);
    if (!comparatorSelect) return;
    
    const componentLabels = {
        'histogram': 'Compare Histogram',
        'signal': 'Compare Signal',
        'macd_line': 'Compare MACD Line'
    };
    
    comparatorSelect.innerHTML = `
        <option value="value">Value</option>
        <option value="compare_${macdComponent}">${componentLabels[macdComponent] || 'Compare'}</option>
    `;
}

function updateRightSideVisibility(conditionId) {
    const comparator = document.getElementById(`comparator${conditionId}`)?.value;
    const rightSide = document.getElementById(`rightSide${conditionId}`);
    const valueInputGroup = document.getElementById(`valueInputGroup${conditionId}`);
    const metric = document.getElementById(`metric${conditionId}`)?.value;
    
    if (!rightSide || !valueInputGroup) return;
    
    if (comparator === 'value') {
        rightSide.style.display = 'none';
        valueInputGroup.style.display = 'block';
    } else {
        rightSide.style.display = 'block';
        valueInputGroup.style.display = 'none';
        
        // Update right side fields based on comparator type
        updateRightSideFields(conditionId, comparator);
    }
}

function updateRightSideFields(conditionId, comparator) {
    const rightWindowGroup = document.getElementById(`rightWindowGroup${conditionId}`);
    const rightSeriesTypeGroup = document.getElementById(`rightSeriesTypeGroup${conditionId}`);
    const rightMacdShortGroup = document.getElementById(`rightMacdShortGroup${conditionId}`);
    const rightMacdLongGroup = document.getElementById(`rightMacdLongGroup${conditionId}`);
    const rightMacdSignalGroup = document.getElementById(`rightMacdSignalGroup${conditionId}`);
    
    // Hide all MACD groups first
    if (rightMacdShortGroup) rightMacdShortGroup.style.display = 'none';
    if (rightMacdLongGroup) rightMacdLongGroup.style.display = 'none';
    if (rightMacdSignalGroup) rightMacdSignalGroup.style.display = 'none';
    
    const rightSeriesLabel = document.getElementById(`rightSeriesLabel${conditionId}`);
    
    if (comparator === 'compare_price') {
        if (rightWindowGroup) rightWindowGroup.style.display = 'none';
        if (rightSeriesTypeGroup) rightSeriesTypeGroup.style.display = 'block';
        if (rightSeriesLabel) rightSeriesLabel.textContent = 'Price Type';
    } else if (comparator === 'compare_sma' || comparator === 'compare_ema') {
        if (rightWindowGroup) rightWindowGroup.style.display = 'block';
        if (rightSeriesTypeGroup) rightSeriesTypeGroup.style.display = 'block';
        if (rightSeriesLabel) rightSeriesLabel.textContent = 'Series Type';
    } else if (comparator === 'compare_rsi') {
        if (rightWindowGroup) rightWindowGroup.style.display = 'block';
        if (rightSeriesTypeGroup) rightSeriesTypeGroup.style.display = 'block';
        if (rightSeriesLabel) rightSeriesLabel.textContent = 'Series Type';
    } else if (comparator.startsWith('compare_histogram') || comparator.startsWith('compare_signal') || comparator.startsWith('compare_macd')) {
        if (rightWindowGroup) rightWindowGroup.style.display = 'none';
        if (rightSeriesTypeGroup) rightSeriesTypeGroup.style.display = 'block';
        if (rightMacdShortGroup) rightMacdShortGroup.style.display = 'block';
        if (rightMacdLongGroup) rightMacdLongGroup.style.display = 'block';
        if (rightMacdSignalGroup) rightMacdSignalGroup.style.display = 'block';
    }
}

function collectPriceConditions() {
    const conditions = [];
    const container = document.getElementById('priceConditionsContainer');
    if (!container) return conditions;
    
    const conditionRows = container.querySelectorAll('.price-condition-row');
    conditionRows.forEach((row, index) => {
        const id = row.id.replace('priceCondition', '');
        const metric = document.getElementById(`metric${id}`)?.value;
        const comparator = document.getElementById(`comparator${id}`)?.value;
        
        const condition = {
            metric: metric,
            left: {
                day: document.getElementById(`leftDay${id}`)?.value,
                candle_type: document.getElementById(`leftCandleType${id}`)?.value,
                series_type: document.getElementById(`leftSeriesType${id}`)?.value
            },
            operator: document.getElementById(`operator${id}`)?.value,
            comparator: comparator
        };
        
        // Add metric-specific fields
        if (metric === 'sma' || metric === 'ema' || metric === 'rsi') {
            condition.left.window = parseInt(document.getElementById(`leftWindow${id}`)?.value) || 14;
        }
        
        if (metric === 'macd') {
            condition.left.short_window = parseInt(document.getElementById(`leftMacdShort${id}`)?.value) || 12;
            condition.left.long_window = parseInt(document.getElementById(`leftMacdLong${id}`)?.value) || 26;
            condition.left.signal_window = parseInt(document.getElementById(`leftMacdSignal${id}`)?.value) || 9;
            condition.left.component = document.getElementById(`leftMacdComponent${id}`)?.value || 'histogram';
        }
        
        if (comparator === 'value') {
            condition.compare_value = parseFloat(document.getElementById(`compareValue${id}`)?.value) || 0;
        } else {
            // Right side values
            condition.right = {
                day: document.getElementById(`rightDay${id}`)?.value,
                candle_type: document.getElementById(`rightCandleType${id}`)?.value,
                series_type: document.getElementById(`rightSeriesType${id}`)?.value
            };
            
            // Add window for SMA/EMA/RSI comparisons
            if (comparator === 'compare_sma' || comparator === 'compare_ema' || comparator === 'compare_rsi') {
                condition.right.window = parseInt(document.getElementById(`rightWindow${id}`)?.value) || 14;
            }
            
            // Add MACD fields for MACD comparisons
            if (comparator.includes('histogram') || comparator.includes('signal') || comparator.includes('macd')) {
                condition.right.short_window = parseInt(document.getElementById(`rightMacdShort${id}`)?.value) || 12;
                condition.right.long_window = parseInt(document.getElementById(`rightMacdLong${id}`)?.value) || 26;
                condition.right.signal_window = parseInt(document.getElementById(`rightMacdSignal${id}`)?.value) || 9;
            }
            
            condition.threshold = {
                unit: document.getElementById(`thresholdUnit${id}`)?.value || 'percent',
                value: parseFloat(document.getElementById(`thresholdValue${id}`)?.value) || 0
            };
        }
        
        conditions.push(condition);
    });
    
    return conditions;
}

function initializeBacktesterPage() {
    console.log('Initializing Backtester Page - EXACT match version');
    
    // State
    let currentStrategy = null;
    let legsConfig = [];
    
    // Check if user is authenticated - if not, gray out fields
    // Wait for auth check to complete (it's async)
    function applyLoginOverlayIfNeeded() {
        if (typeof window.isAuthenticated === 'function') {
            if (!window.isAuthenticated()) {
                console.log('User not authenticated - applying login required overlay');
                if (typeof window.setupLoginRequiredFields === 'function') {
                    window.setupLoginRequiredFields('#backtesterPage');
                }
            } else {
                console.log('User is authenticated - backtester fully enabled');
                loadOptionsTemplates();
            }
        } else {
            // Retry if isAuthenticated function not yet available
            setTimeout(applyLoginOverlayIfNeeded, 100);
        }
    }
    // Give auth check time to complete (500ms delay)
    setTimeout(applyLoginOverlayIfNeeded, 500);
    
    // Setup event listeners
    setupFormControls();
    setupStrategySelection();
    
    // Load last backtest result if available
    loadLastBacktestResult();
    
    // Close template menu when clicking outside
    document.addEventListener('click', function(e) {
        var menu = document.getElementById('templatesMenu');
        var btn = document.getElementById('templatesBtn');
        if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
            menu.style.display = 'none';
        }
    });
    
    console.log('Backtester initialized successfully!');
}

function loadLastBacktestResult() {
    try {
        const savedResult = localStorage.getItem('lastBacktestResult');
        if (savedResult) {
            const result = JSON.parse(savedResult);
            console.log('✓ Found saved backtest result from:', result.timestamp);
            
            // Add a banner showing this is a cached result
            const resultsDiv = document.getElementById('backtestResults');
            if (resultsDiv) {
                const banner = document.createElement('div');
                banner.style.cssText = 'background: #fff3cd; border: 1px solid #ffc107; padding: 10px; margin-bottom: 15px; border-radius: 4px;';
                banner.innerHTML = `
                    <strong>📊 Last Backtest Result</strong> 
                    <span style="margin-left: 10px; color: #666;">
                        Run: ${new Date(result.timestamp).toLocaleString('en-US', { timeZone: 'America/New_York' })}
                    </span>
                    <button onclick="clearLastBacktest()" style="float: right; padding: 5px 10px; cursor: pointer;">
                        Clear
                    </button>
                `;
                resultsDiv.insertBefore(banner, resultsDiv.firstChild);
            }
            
            // Display the cached result
            displayResults(result);
        }
    } catch (e) {
        console.error('Failed to load from localStorage:', e);
    }
}

// Function to clear cached result
window.clearLastBacktest = function() {
    localStorage.removeItem('lastBacktestResult');
    const resultsDiv = document.getElementById('backtestResults');
    if (resultsDiv) {
        resultsDiv.style.display = 'none';
    }
    location.reload();
};

function setupFormControls() {
    // Take Profit Type Toggle
    document.querySelectorAll('input[name="takeProfitType"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const isPct = e.target.value === 'P';
            document.getElementById('takeProfitPctGroup').style.display = isPct ? 'block' : 'none';
            document.getElementById('takeProfitDollarGroup').style.display = isPct ? 'none' : 'block';
        });
    });
    
    // Stop Loss Type Toggle
    document.querySelectorAll('input[name="stopLossType"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const isPct = e.target.value === 'P';
            document.getElementById('stopLossPctGroup').style.display = isPct ? 'block' : 'none';
            document.getElementById('stopLossDollarGroup').style.display = isPct ? 'none' : 'block';
        });
    });
    
    // Allocation Type Toggle
    document.querySelectorAll('input[name="allocationType"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const type = e.target.value;
            document.getElementById('allocationPctGroup').style.display = type === '1' ? 'block' : 'none';
            document.getElementById('allocationContractsGroup').style.display = type === '2' ? 'block' : 'none';
            document.getElementById('allocationFixedGroup').style.display = type === '3' ? 'block' : 'none';
        });
    });
    
    // Form Submit - use flag to prevent duplicate listeners
    const form = document.getElementById('backtestForm');
    if (form && !form.dataset.submitHandlerAttached) {
        form.dataset.submitHandlerAttached = 'true';
        form.addEventListener('submit', handleBacktestSubmit);
    }
    
    // Reset Button
    const resetBtn = document.getElementById('resetBacktestBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetForm);
    }
}

function setupStrategySelection() {
    const strategySelect = document.getElementById('strategy');
    if (!strategySelect) return;
    
    strategySelect.addEventListener('change', (e) => {
        const strategy = e.target.value;
        console.log('Strategy selected:', strategy);
        
        const wingConfigSection = document.getElementById('wingConfigSection');
        const wingConfigForm = document.getElementById('wingConfigForm');
        const legConfigTitle = document.getElementById('legConfigTitle');
        const legConfigSection = document.getElementById('legConfigSection');
        
        if (strategy) {
            currentStrategy = strategy;
            
            // Show/hide wing configuration for Iron strategies
            const isIronStrategy = strategy.includes('Iron');
            if (wingConfigSection) wingConfigSection.style.display = isIronStrategy ? 'flex' : 'none';
            if (wingConfigForm) wingConfigForm.style.display = isIronStrategy ? 'block' : 'none';
            
            // Update leg configuration title
            if (legConfigTitle) legConfigTitle.textContent = `LEG CONFIGURATION - ${strategy}`;
            
            // Build leg configuration UI
            buildLegConfiguration(strategy);
        } else {
            // Reset if no strategy selected
            if (wingConfigSection) wingConfigSection.style.display = 'none';
            if (wingConfigForm) wingConfigForm.style.display = 'none';
            if (legConfigSection) {
                legConfigSection.innerHTML = `
                    <div class="info-box">
                        <i class="fas fa-info-circle"></i>
                        <span>Select a strategy above to configure legs</span>
                    </div>
                `;
            }
        }
    });
}

function buildLegConfiguration(strategy) {
    const legDefinitions = getStrategyLegs(strategy);
    const container = document.getElementById('legConfigSection');
    
    if (legDefinitions.length === 0) {
        container.innerHTML = '<p>No legs to configure for this strategy.</p>';
        return;
    }
    
    let html = `
        <div class="leg-instruction">
            <p><strong>📋 Strategy requires ${legDefinitions.length} legs</strong></p>
            <p>You will choose which leg to configure first, second, etc.</p>
        </div>
    `;
    
    // Show all legs that need to be configured
    legDefinitions.forEach((leg, index) => {
        // ALL legs get 5 options since user might configure them in any order
        // Even leg 1 could reference a leg if user configures other legs first
        let optionsHTML = `
            <option value="">-- Select Method --</option>
            <option value="mid_price">1. Mid Price Range (specify min/max option price)</option>
            <option value="pct_underlying">2. % Distance from Underlying</option>
            <option value="dollar_underlying">3. $ Distance from Underlying</option>
            <option value="pct_leg">4. % Distance from Another Leg</option>
            <option value="dollar_leg">5. $ Distance from Another Leg</option>
            <option value="delta">6. Delta-based Strike Selection</option>
        `;
        
        html += `
            <div class="leg-config-card" id="legCard${index}">
                <div class="leg-header">
                    <span class="leg-title">Leg ${index + 1}: ${leg.name}</span>
                    <span class="leg-badge">${leg.type === 'C' ? 'Call' : 'Put'} - ${leg.position}</span>
                </div>
                
                <div class="form-group">
                    <label>→ Select configuration method [1-5]:</label>
                    <select class="leg-method-select" data-leg-index="${index}">
                        ${optionsHTML}
                    </select>
                </div>
                
                <div id="legParams${index}" class="leg-params-container">
                    <!-- Parameters will be inserted here -->
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    // Setup event listeners for leg configuration
    document.querySelectorAll('.leg-method-select').forEach(select => {
        select.addEventListener('change', handleLegMethodChange);
    });
}

function handleLegMethodChange(e) {
    const select = e.target;
    const legIndex = parseInt(select.dataset.legIndex);
    const method = select.value;
    const paramsContainer = document.getElementById(`legParams${legIndex}`);
    
    if (!method) {
        paramsContainer.innerHTML = '';
        return;
    }
    
    // Get current strategy and leg definitions to determine leg type
    const strategy = document.getElementById('strategy').value;
    const legDefinitions = getStrategyLegs(strategy);
    const currentLeg = legDefinitions[legIndex];
    const isCall = currentLeg && currentLeg.type === 'C';
    
    // Set default direction based on leg type
    // Calls: above is natural (OTM calls are above underlying)
    // Puts: below is natural (OTM puts are below underlying)
    const defaultDirection = isCall ? 'above' : 'below';
    
    let html = '';
    
    switch (method) {
        case 'mid_price':
            html = `
                <div class="form-grid">
                    <div class="form-group">
                        <label>Min mid price:</label>
                        <input type="number" class="leg-param" data-param="min" step="0.01" placeholder="0.50">
                    </div>
                    <div class="form-group">
                        <label>Max mid price:</label>
                        <input type="number" class="leg-param" data-param="max" step="0.01" placeholder="5.00">
                    </div>
                </div>
            `;
            break;
            
        case 'pct_underlying':
            html = `
                <div class="form-grid">
                    <div class="form-group">
                        <label>Direction (above/below):</label>
                        <select class="leg-param" data-param="direction">
                            <option value="below" ${defaultDirection === 'below' ? 'selected' : ''}>below</option>
                            <option value="above" ${defaultDirection === 'above' ? 'selected' : ''}>above</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>% distance:</label>
                        <input type="number" class="leg-param" data-param="pct" step="0.01" placeholder="2.0">
                    </div>
                </div>
                <div class="form-group" style="margin-top: 12px;">
                    <label>Strike selection fallback:</label>
                    <select class="leg-param" data-param="strike_fallback">
                        <option value="closest">Closest (default)</option>
                        <option value="or_less">Or Lower</option>
                        <option value="or_higher">Or higher</option>
                        <option value="exactly">Exactly (skip if unavailable)</option>
                    </select>
                </div>
            `;
            break;
            
        case 'dollar_underlying':
            html = `
                <div class="form-grid">
                    <div class="form-group">
                        <label>Direction (above/below):</label>
                        <select class="leg-param" data-param="direction">
                            <option value="below" ${defaultDirection === 'below' ? 'selected' : ''}>below</option>
                            <option value="above" ${defaultDirection === 'above' ? 'selected' : ''}>above</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>$ distance:</label>
                        <input type="number" class="leg-param" data-param="amount" step="1" placeholder="10">
                    </div>
                </div>
                <div class="form-group" style="margin-top: 12px;">
                    <label>Strike selection fallback:</label>
                    <select class="leg-param" data-param="strike_fallback">
                        <option value="closest">Closest (default)</option>
                        <option value="or_less">Or Lower</option>
                        <option value="or_higher">Or higher</option>
                        <option value="exactly">Exactly (skip if unavailable)</option>
                    </select>
                </div>
            `;
            break;
            
        case 'pct_leg':
            html = `
                <div class="form-grid">
                    <div class="form-group">
                        <label>Select reference leg:</label>
                        <select class="leg-param" data-param="reference" id="refLegSelect_${legIndex}">
                            ${buildReferenceLegOptions(legIndex)}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Direction (above/below):</label>
                        <select class="leg-param" data-param="direction">
                            <option value="below" ${defaultDirection === 'below' ? 'selected' : ''}>below</option>
                            <option value="above" ${defaultDirection === 'above' ? 'selected' : ''}>above</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>% distance:</label>
                        <input type="number" class="leg-param" data-param="pct" step="0.01" placeholder="2.0">
                    </div>
                </div>
                <div class="form-group" style="margin-top: 12px;">
                    <label>Strike selection fallback:</label>
                    <select class="leg-param" data-param="strike_fallback">
                        <option value="closest">Closest (default)</option>
                        <option value="or_less">Or Lower</option>
                        <option value="or_higher">Or higher</option>
                        <option value="exactly">Exactly (skip if unavailable)</option>
                    </select>
                </div>
            `;
            break;
            
        case 'dollar_leg':
            html = `
                <div class="form-grid">
                    <div class="form-group">
                        <label>Select reference leg:</label>
                        <select class="leg-param" data-param="reference" id="refLegSelect_${legIndex}">
                            ${buildReferenceLegOptions(legIndex)}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Direction (above/below):</label>
                        <select class="leg-param" data-param="direction">
                            <option value="below" ${defaultDirection === 'below' ? 'selected' : ''}>below</option>
                            <option value="above" ${defaultDirection === 'above' ? 'selected' : ''}>above</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>$ distance:</label>
                        <input type="number" class="leg-param" data-param="amount" step="1" placeholder="5">
                    </div>
                </div>
                <div class="form-group" style="margin-top: 12px;">
                    <label>Strike selection fallback:</label>
                    <select class="leg-param" data-param="strike_fallback">
                        <option value="closest">Closest (default)</option>
                        <option value="or_less">Or Lower</option>
                        <option value="or_higher">Or higher</option>
                        <option value="exactly">Exactly (skip if unavailable)</option>
                    </select>
                </div>
            `;
            break;
            
        case 'delta':
            // Delta default values based on leg type
            // Calls: positive delta (0.0 to 1.0)
            // Puts: negative delta (-1.0 to 0.0)
            const defaultDelta = isCall ? 0.30 : -0.30;
            html = `
                <div class="form-grid">
                    <div class="form-group">
                        <label>Target Delta:</label>
                        <input type="number" class="leg-param" data-param="target_delta" step="0.01" min="-1" max="1" placeholder="${defaultDelta}" value="${defaultDelta}">
                        <small class="help-text">${isCall ? 'Calls: 0.0 to 1.0 (e.g., 0.30 for 30-delta)' : 'Puts: -1.0 to 0.0 (e.g., -0.30 for 30-delta put)'}</small>
                    </div>
                    <div class="form-group">
                        <label>Delta Method:</label>
                        <select class="leg-param delta-method-select" data-param="method" data-leg-index="${legIndex}">
                            <option value="closest">Closest to target delta</option>
                            <option value="above">At or above target delta</option>
                            <option value="below">At or below target delta</option>
                            <option value="between">Between min and max delta</option>
                            <option value="exactly">Exactly (within tolerance)</option>
                        </select>
                    </div>
                </div>
                <div id="deltaTolerance_${legIndex}" class="form-group" style="margin-top: 12px; display: none;">
                    <label>Delta Tolerance (for "exactly" method):</label>
                    <input type="number" class="leg-param" data-param="tolerance" step="0.001" value="0.01" placeholder="0.01">
                    <small class="help-text">e.g., 0.01 means +/- 0.01 from target</small>
                </div>
                <div id="deltaRange_${legIndex}" class="form-group" style="margin-top: 12px; display: none;">
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Minimum Delta:</label>
                            <input type="number" class="leg-param" data-param="delta_min" step="0.01" min="-1" max="1" placeholder="${isCall ? '0.20' : '-0.40'}">
                        </div>
                        <div class="form-group">
                            <label>Maximum Delta:</label>
                            <input type="number" class="leg-param" data-param="delta_max" step="0.01" min="-1" max="1" placeholder="${isCall ? '0.40' : '-0.20'}">
                        </div>
                    </div>
                </div>
                <div class="form-group" style="margin-top: 12px;">
                    <label>Strike selection fallback (if no exact delta match):</label>
                    <select class="leg-param" data-param="strike_fallback">
                        <option value="closest">Closest available strike</option>
                        <option value="or_less">Or Lower strike</option>
                        <option value="or_higher">Or Higher strike</option>
                    </select>
                </div>
            `;
            break;
    }
    
    paramsContainer.innerHTML = html;
    
    // Add event listeners for delta method changes
    if (method === 'delta') {
        const deltaMethodSelect = paramsContainer.querySelector('.delta-method-select');
        if (deltaMethodSelect) {
            deltaMethodSelect.addEventListener('change', (e) => {
                const selectedMethod = e.target.value;
                const toleranceDiv = document.getElementById(`deltaTolerance_${legIndex}`);
                const rangeDiv = document.getElementById(`deltaRange_${legIndex}`);
                
                // Show tolerance for "exactly" method
                if (toleranceDiv) {
                    toleranceDiv.style.display = selectedMethod === 'exactly' ? 'block' : 'none';
                }
                
                // Show range for "between" method
                if (rangeDiv) {
                    rangeDiv.style.display = selectedMethod === 'between' ? 'block' : 'none';
                }
            });
        }
    }
    
    // Update all reference leg dropdowns to include this newly configured leg
    updateAllReferenceLegDropdowns();
}

function updateAllReferenceLegDropdowns() {
    // Find all reference leg dropdowns and update their options
    document.querySelectorAll('[id^="refLegSelect_"]').forEach(select => {
        const legIndex = parseInt(select.id.split('_')[1]);
        const currentValue = select.value;
        select.innerHTML = buildReferenceLegOptions(legIndex);
        // Try to restore previous selection if it's still valid
        if (currentValue && select.querySelector(`option[value="${currentValue}"]`)) {
            select.value = currentValue;
        }
    });
}

function buildReferenceLegOptions(currentLegIndex) {
    const strategy = currentStrategy;
    const legDefs = getStrategyLegs(strategy);
    
    // Show ALL other legs (not just configured ones)
    // User needs to see what legs are available to reference
    let options = '';
    for (let i = 0; i < legDefs.length; i++) {
        // Skip the current leg
        if (i === currentLegIndex) continue;
        
        // Use index as value (backend expects this)
        options += `<option value="${i}">${i + 1}. ${legDefs[i].name}</option>`;
    }
    
    return options;
}

function getStrategyLegs(strategy) {
    const legMaps = {
        'Long Call': [{name: 'Long Call', type: 'C', position: 'long'}],
        'Long Put': [{name: 'Long Put', type: 'P', position: 'long'}],
        'Naked Short Call': [{name: 'Short Call', type: 'C', position: 'short'}],
        'Naked Short Put': [{name: 'Short Put', type: 'P', position: 'short'}],
        'Short Put Spread': [
            {name: 'Short Put', type: 'P', position: 'short'},
            {name: 'Long Put', type: 'P', position: 'long'}
        ],
        'Short Call Spread': [
            {name: 'Short Call', type: 'C', position: 'short'},
            {name: 'Long Call', type: 'C', position: 'long'}
        ],
        'Short Iron Condor': [
            {name: 'Long Put', type: 'P', position: 'long'},
            {name: 'Short Put', type: 'P', position: 'short'},
            {name: 'Short Call', type: 'C', position: 'short'},
            {name: 'Long Call', type: 'C', position: 'long'}
        ],
        'Short Iron Butterfly': [
            {name: 'Long Put', type: 'P', position: 'long'},
            {name: 'Short Put', type: 'P', position: 'short'},
            {name: 'Short Call', type: 'C', position: 'short'},
            {name: 'Long Call', type: 'C', position: 'long'}
        ],
        'Long Call Spread': [
            {name: 'Long Call', type: 'C', position: 'long'},
            {name: 'Short Call', type: 'C', position: 'short'}
        ],
        'Long Put Spread': [
            {name: 'Long Put', type: 'P', position: 'long'},
            {name: 'Short Put', type: 'P', position: 'short'}
        ],
        'Long Straddle': [
            {name: 'Long Put', type: 'P', position: 'long'},
            {name: 'Long Call', type: 'C', position: 'long'}
        ],
        'Long Strangle': [
            {name: 'Long Put', type: 'P', position: 'long'},
            {name: 'Long Call', type: 'C', position: 'long'}
        ],
        'Long Iron Butterfly': [
            {name: 'Short Put', type: 'P', position: 'short'},
            {name: 'Long Put', type: 'P', position: 'long'},
            {name: 'Long Call', type: 'C', position: 'long'},
            {name: 'Short Call', type: 'C', position: 'short'}
        ],
        'Long Iron Condor': [
            {name: 'Short Put', type: 'P', position: 'short'},
            {name: 'Long Put', type: 'P', position: 'long'},
            {name: 'Long Call', type: 'C', position: 'long'},
            {name: 'Short Call', type: 'C', position: 'short'}
        ],
        'Short Straddle': [
            {name: 'Short Put', type: 'P', position: 'short'},
            {name: 'Short Call', type: 'C', position: 'short'}
        ],
        'Short Strangle': [
            {name: 'Short Put', type: 'P', position: 'short'},
            {name: 'Short Call', type: 'C', position: 'short'}
        ]
    };
    
    return legMaps[strategy] || [];
}

function topologicalSortLegs(legs) {
    /**
     * Sort legs so that dependencies come before dependents
     * E.g., if Leg 2 references Leg 1, then Leg 1 must come first in the array
     */
    
    // Build mapping of original index to new position
    const indexMap = new Map();
    legs.forEach((leg, idx) => {
        indexMap.set(leg.original_index, idx);
    });
    
    // Build dependency graph
    const graph = new Map();
    const inDegree = new Map();
    
    legs.forEach((leg, idx) => {
        graph.set(idx, []);
        inDegree.set(idx, 0);
    });
    
    // For each leg, if it references another leg, add edge
    legs.forEach((leg, idx) => {
        if ((leg.config_type === 'pct_leg' || leg.config_type === 'dollar_leg') && 
            leg.params && leg.params.reference !== undefined) {
            
            const refOriginalIdx = parseInt(leg.params.reference);
            const refIdx = indexMap.get(refOriginalIdx);
            
            if (refIdx !== undefined) {
                // leg at idx depends on leg at refIdx
                // So refIdx must come before idx
                graph.get(refIdx).push(idx);
                inDegree.set(idx, inDegree.get(idx) + 1);
            }
        }
    });
    
    // Topological sort using Kahn's algorithm
    const queue = [];
    const sorted = [];
    
    // Start with nodes that have no dependencies
    inDegree.forEach((degree, idx) => {
        if (degree === 0) {
            queue.push(idx);
        }
    });
    
    while (queue.length > 0) {
        const current = queue.shift();
        sorted.push(current);
        
        // Reduce in-degree for neighbors
        graph.get(current).forEach(neighbor => {
            inDegree.set(neighbor, inDegree.get(neighbor) - 1);
            if (inDegree.get(neighbor) === 0) {
                queue.push(neighbor);
            }
        });
    }
    
    // Check for circular dependencies
    if (sorted.length !== legs.length) {
        return null;  // Circular dependency detected
    }
    
    // Build new legs array in sorted order
    // AND update reference indices to match new positions
    const sortedLegs = sorted.map(oldIdx => legs[oldIdx]);
    
    // Create mapping from old position to new position
    const positionMap = new Map();
    sorted.forEach((oldIdx, newIdx) => {
        positionMap.set(oldIdx, newIdx);
    });
    
    // Update reference parameters to point to new indices
    sortedLegs.forEach(leg => {
        if ((leg.config_type === 'pct_leg' || leg.config_type === 'dollar_leg') && 
            leg.params && leg.params.reference !== undefined) {
            
            const refOriginalIdx = parseInt(leg.params.reference);
            const refOldIdx = indexMap.get(refOriginalIdx);
            const refNewIdx = positionMap.get(refOldIdx);
            
            // Update reference to new position
            leg.params.reference = refNewIdx;
        }
    });
    
    // Remove original_index as it's no longer needed
    sortedLegs.forEach(leg => delete leg.original_index);
    
    return sortedLegs;
}

function validateStrikeConfiguration(strategy, legs) {
    /**
     * Validate strike relationships BEFORE running backtest
     * ONLY validates relationships that are APPARENT (don't need underlying price)
     * Returns: {valid: boolean, error: string}
     */
    
    // Helper: Check if two legs can be compared
    function canCompare(leg1, leg2) {
        // Can only compare if both use same config type and reference point
        if (leg1.config_type !== leg2.config_type) {
            return false; // Different types (% vs $ vs leg ref) - can't compare
        }
        
        if (leg1.config_type === 'pct_underlying' && leg2.config_type === 'pct_underlying') {
            // Both are % from underlying - CAN compare
            return true;
        }
        
        if (leg1.config_type === 'dollar_underlying' && leg2.config_type === 'dollar_underlying') {
            // Both are $ from underlying - CAN compare
            return true;
        }
        
        // References to other legs, mid price, etc. - can't pre-validate
        return false;
    }
    
    // Helper: Get estimated relative strike for comparable legs
    function getRelativeStrike(leg) {
        if (leg.config_type === 'pct_underlying') {
            const pct = leg.params.pct;
            if (leg.params.direction === 'above') {
                return pct; // Positive distance
            } else {
                return -pct; // Negative distance
            }
        } else if (leg.config_type === 'dollar_underlying') {
            const amount = leg.params.amount;
            if (leg.params.direction === 'above') {
                return amount;
            } else {
                return -amount;
            }
        }
        return null;
    }
    
    // Find legs by type and position
    function findLeg(position, type) {
        return legs.find(l => l.position === position && l.type === type);
    }
    
    // Validation rules by strategy
    const rules = {
        'Short Iron Condor': () => {
            const longPut = findLeg('long', 'P');
            const shortPut = findLeg('short', 'P');
            const shortCall = findLeg('short', 'C');
            const longCall = findLeg('long', 'C');
            
            // Validate put spread (if comparable)
            if (shortPut && longPut && canCompare(shortPut, longPut)) {
                const shortStrike = getRelativeStrike(shortPut);
                const longStrike = getRelativeStrike(longPut);
                
                if (shortStrike <= longStrike) {
                    return {
                        valid: false, 
                        error: `Short Iron Condor: Short Put must be ABOVE Long Put. Your config: Short Put ${shortPut.params.direction} ${shortPut.params.pct || shortPut.params.amount}, Long Put ${longPut.params.direction} ${longPut.params.pct || longPut.params.amount}`
                    };
                }
            }
            
            // Validate call spread (if comparable)
            if (shortCall && longCall && canCompare(shortCall, longCall)) {
                const shortStrike = getRelativeStrike(shortCall);
                const longStrike = getRelativeStrike(longCall);
                
                if (shortStrike >= longStrike) {
                    return {
                        valid: false,
                        error: `Short Iron Condor: Short Call must be BELOW Long Call. Your config: Short Call ${shortCall.params.direction} ${shortCall.params.pct || shortCall.params.amount}, Long Call ${longCall.params.direction} ${longCall.params.pct || longCall.params.amount}`
                    };
                }
            }
            
            return {valid: true};
        },
        
        'Short Iron Butterfly': () => {
            return rules['Short Iron Condor'](); // Same rules
        },
        
        'Long Iron Condor': () => {
            const longPut = findLeg('long', 'P');
            const shortPut = findLeg('short', 'P');
            const shortCall = findLeg('short', 'C');
            const longCall = findLeg('long', 'C');
            
            // Validate put spread (if comparable)
            if (shortPut && longPut && canCompare(shortPut, longPut)) {
                const shortStrike = getRelativeStrike(shortPut);
                const longStrike = getRelativeStrike(longPut);
                
                if (shortStrike >= longStrike) {
                    return {
                        valid: false,
                        error: `Long Iron Condor: Short Put must be BELOW Long Put. Your config: Short Put ${shortPut.params.direction} ${shortPut.params.pct || shortPut.params.amount}, Long Put ${longPut.params.direction} ${longPut.params.pct || longPut.params.amount}`
                    };
                }
            }
            
            // Validate call spread (if comparable)
            if (shortCall && longCall && canCompare(shortCall, longCall)) {
                const shortStrike = getRelativeStrike(shortCall);
                const longStrike = getRelativeStrike(longCall);
                
                if (shortStrike <= longStrike) {
                    return {
                        valid: false,
                        error: `Long Iron Condor: Short Call must be ABOVE Long Call. Your config: Short Call ${shortCall.params.direction} ${shortCall.params.pct || shortCall.params.amount}, Long Call ${longCall.params.direction} ${longCall.params.pct || longCall.params.amount}`
                    };
                }
            }
            
            return {valid: true};
        },
        
        'Long Iron Butterfly': () => {
            return rules['Long Iron Condor'](); // Same rules
        },
        
        'Short Put Spread': () => {
            const longPut = findLeg('long', 'P');
            const shortPut = findLeg('short', 'P');
            
            if (shortPut && longPut && canCompare(shortPut, longPut)) {
                const shortStrike = getRelativeStrike(shortPut);
                const longStrike = getRelativeStrike(longPut);
                
                if (shortStrike <= longStrike) {
                    return {
                        valid: false,
                        error: `Short Put Spread: Short Put must be ABOVE Long Put. Your config: Short Put ${shortPut.params.direction} ${shortPut.params.pct || shortPut.params.amount}, Long Put ${longPut.params.direction} ${longPut.params.pct || longPut.params.amount}`
                    };
                }
            }
            
            return {valid: true};
        },
        
        'Short Call Spread': () => {
            const longCall = findLeg('long', 'C');
            const shortCall = findLeg('short', 'C');
            
            if (shortCall && longCall && canCompare(shortCall, longCall)) {
                const shortStrike = getRelativeStrike(shortCall);
                const longStrike = getRelativeStrike(longCall);
                
                if (shortStrike >= longStrike) {
                    return {
                        valid: false,
                        error: `Short Call Spread: Short Call must be BELOW Long Call. Your config: Short Call ${shortCall.params.direction} ${shortCall.params.pct || shortCall.params.amount}, Long Call ${longCall.params.direction} ${longCall.params.pct || longCall.params.amount}`
                    };
                }
            }
            
            return {valid: true};
        },
        
        'Long Put Spread': () => {
            const longPut = findLeg('long', 'P');
            const shortPut = findLeg('short', 'P');
            
            if (longPut && shortPut && canCompare(longPut, shortPut)) {
                const longStrike = getRelativeStrike(longPut);
                const shortStrike = getRelativeStrike(shortPut);
                
                if (longStrike >= shortStrike) {
                    return {
                        valid: false,
                        error: `Long Put Spread: Long Put must be BELOW Short Put. Your config: Long Put ${longPut.params.direction} ${longPut.params.pct || longPut.params.amount}, Short Put ${shortPut.params.direction} ${shortPut.params.pct || shortPut.params.amount}`
                    };
                }
            }
            
            return {valid: true};
        },
        
        'Long Call Spread': () => {
            const longCall = findLeg('long', 'C');
            const shortCall = findLeg('short', 'C');
            
            if (longCall && shortCall && canCompare(longCall, shortCall)) {
                const longStrike = getRelativeStrike(longCall);
                const shortStrike = getRelativeStrike(shortCall);
                
                if (longStrike >= shortStrike) {
                    return {
                        valid: false,
                        error: `Long Call Spread: Long Call must be BELOW Short Call. Your config: Long Call ${longCall.params.direction} ${longCall.params.pct || longCall.params.amount}, Short Call ${shortCall.params.direction} ${shortCall.params.pct || shortCall.params.amount}`
                    };
                }
            }
            
            return {valid: true};
        },
        
        'Short Straddle': () => {
            const shortPut = findLeg('short', 'P');
            const shortCall = findLeg('short', 'C');
            
            // Can only validate if both use same config type
            if (shortPut && shortCall && canCompare(shortPut, shortCall)) {
                const putStrike = getRelativeStrike(shortPut);
                const callStrike = getRelativeStrike(shortCall);
                
                if (Math.abs(putStrike - callStrike) > 0.001) { // Small tolerance for floating point
                    return {
                        valid: false,
                        error: `Short Straddle: Put and Call must have SAME distance from underlying. Your config: Put ${shortPut.params.direction} ${shortPut.params.pct || shortPut.params.amount}, Call ${shortCall.params.direction} ${shortCall.params.pct || shortCall.params.amount}`
                    };
                }
            }
            
            return {valid: true};
        },
        
        'Long Straddle': () => {
            const longPut = findLeg('long', 'P');
            const longCall = findLeg('long', 'C');
            
            // Can only validate if both use same config type
            if (longPut && longCall && canCompare(longPut, longCall)) {
                const putStrike = getRelativeStrike(longPut);
                const callStrike = getRelativeStrike(longCall);
                
                if (Math.abs(putStrike - callStrike) > 0.001) {
                    return {
                        valid: false,
                        error: `Long Straddle: Put and Call must have SAME distance from underlying. Your config: Put ${longPut.params.direction} ${longPut.params.pct || longPut.params.amount}, Call ${longCall.params.direction} ${longCall.params.pct || longCall.params.amount}`
                    };
                }
            }
            
            return {valid: true};
        }
    };
    
    // Run validation if rule exists
    if (rules[strategy]) {
        return rules[strategy]();
    }
    
    return {valid: true}; // No specific validation for this strategy
}

let _pendingOptConfig = null;

function buildOptConfigSummaryHtml(config) {
    const sectionStyle = 'margin-bottom:16px; padding:14px 16px; background:#f8fafc; border-radius:10px; border-left:4px solid #7c3aed;';
    const labelStyle = 'font-weight:600; color:#334155; font-size:13px; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;';
    const valueStyle = 'color:#1e293b; font-size:15px; line-height:1.6;';
    const arrowIcon = '<i class="fas fa-arrow-right" style="color:#7c3aed; margin:0 6px; font-size:11px;"></i>';

    let tpText = 'None';
    if (config.take_profit_pct) tpText = `${config.take_profit_pct}%`;
    else if (config.take_profit_dollar) tpText = `$${config.take_profit_dollar}`;

    let slText = 'None';
    if (config.stop_loss_pct) slText = `${config.stop_loss_pct}%`;
    else if (config.stop_loss_dollar) slText = `$${config.stop_loss_dollar}`;

    const allocMap = {'pct':'% of Capital','contracts':'Contracts','fixed':'Fixed $'};
    const allocLabel = allocMap[config.allocation_type] || config.allocation_type;

    const detBarMap = {0.25:'15s',1:'1min',5:'5min',15:'15min',60:'1hr'};
    const detBarLabel = detBarMap[config.detection_bar_size] || `${config.detection_bar_size}min`;

    let legsHtml = '';
    if (config.legs && config.legs.length > 0) {
        legsHtml = config.legs.map(leg => {
            const methodMap = {'mid_price':'Mid Price','pct_underlying':'% from Underlying','dollar_underlying':'$ from Underlying','delta':'Delta','pct_leg':'% from Leg','dollar_leg':'$ from Leg'};
            const method = methodMap[leg.config_type] || leg.config_type;
            let paramStr = '';
            if (leg.params) {
                const p = leg.params;
                if (leg.config_type === 'delta') paramStr = `Delta: ${p.target_delta} (${p.method || 'closest'})`;
                else if (leg.config_type === 'mid_price') paramStr = `Range: $${p.min_price || 0} - $${p.max_price || '∞'}`;
                else if (leg.config_type === 'pct_underlying') paramStr = `${p.direction || ''} ${p.pct || 0}%`;
                else if (leg.config_type === 'dollar_underlying') paramStr = `${p.direction || ''} $${p.amount || 0}`;
                else if (leg.config_type === 'pct_leg' || leg.config_type === 'dollar_leg') paramStr = `From ${p.reference_leg || 'Leg'}: ${p.pct || p.amount || 0}${leg.config_type === 'pct_leg' ? '%' : '$'}`;
            }
            return `<div style="margin-bottom:4px;"><span style="color:#7c3aed; font-weight:600;">${leg.name}:</span> ${leg.position} ${leg.type} — ${method} ${paramStr}</div>`;
        }).join('');
    }

    let conditionsHtml = '<span style="color:#94a3b8;">None</span>';
    if (config.price_conditions && config.price_conditions.length > 0) {
        conditionsHtml = config.price_conditions.map(pc => {
            return `<div style="margin-bottom:4px;">${pc.left_metric || pc.metric || 'Price'} ${pc.operator || ''} ${pc.right_metric || pc.value || ''}</div>`;
        }).join('');
    }

    return `
        <div style="${sectionStyle}">
            <div style="${labelStyle}"><i class="fas fa-calendar-alt" style="margin-right:6px;"></i>Period</div>
            <div style="${valueStyle}">${config.start_date} ${arrowIcon} ${config.end_date}</div>
        </div>
        <div style="${sectionStyle}">
            <div style="${labelStyle}"><i class="fas fa-chart-bar" style="margin-right:6px;"></i>Symbol</div>
            <div style="${valueStyle}">${config.symbol}</div>
        </div>
        <div style="${sectionStyle}">
            <div style="${labelStyle}"><i class="fas fa-chess" style="margin-right:6px;"></i>Strategy</div>
            <div style="${valueStyle}">${config.strategy} &nbsp;|&nbsp; DTE: ${config.dte} &nbsp;|&nbsp; Entry: ${config.entry_time}${config.entry_time_max ? ' - ' + config.entry_time_max : ''}</div>
        </div>
        <div style="${sectionStyle}">
            <div style="${labelStyle}"><i class="fas fa-layer-group" style="margin-right:6px;"></i>Legs</div>
            <div style="${valueStyle}">${legsHtml || '<span style="color:#94a3b8;">None configured</span>'}</div>
        </div>
        <div style="${sectionStyle}">
            <div style="${labelStyle}"><i class="fas fa-sign-out-alt" style="margin-right:6px;"></i>Exit Criteria</div>
            <div style="${valueStyle}">Take Profit: ${tpText} &nbsp;|&nbsp; Stop Loss: ${slText}</div>
        </div>
        <div style="${sectionStyle}">
            <div style="${labelStyle}"><i class="fas fa-coins" style="margin-right:6px;"></i>Position Sizing</div>
            <div style="${valueStyle}">${config.allocation_value} ${allocLabel} &nbsp;|&nbsp; Capital: $${config.starting_capital?.toLocaleString() || '—'}</div>
        </div>
        <div style="${sectionStyle}">
            <div style="${labelStyle}"><i class="fas fa-tachometer-alt" style="margin-right:6px;"></i>Detection Bar</div>
            <div style="${valueStyle}">${detBarLabel}</div>
        </div>
        <div style="${sectionStyle}">
            <div style="${labelStyle}"><i class="fas fa-filter" style="margin-right:6px;"></i>Price Conditions</div>
            <div style="${valueStyle}">${conditionsHtml}</div>
        </div>
    `;
}

function showOptConfigSummary(config) {
    _pendingOptConfig = config;
    const body = document.getElementById('optConfigSummaryBody');
    body.innerHTML = buildOptConfigSummaryHtml(config);
    const overlay = document.getElementById('optConfigSummaryOverlay');
    overlay.style.display = 'flex';
}

function closeOptConfigSummary() {
    document.getElementById('optConfigSummaryOverlay').style.display = 'none';
    _pendingOptConfig = null;
    const form = document.getElementById('backtestForm');
    if (form) form.dataset.isSubmitting = 'false';
}

async function handleBacktestSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    if (form.dataset.isSubmitting === 'true') {
        console.log('Form already submitting, ignoring duplicate');
        return;
    }
    form.dataset.isSubmitting = 'true';
    
    console.log('Form submitted');
    
    const config = collectFormData();
    
    if (!config) {
        showError('Please complete all required fields');
        form.dataset.isSubmitting = 'false';
        return;
    }
    
    const validation = validateStrikeConfiguration(config.strategy, config.legs);
    if (!validation.valid) {
        showError(`Invalid Strike Configuration: ${validation.error}`);
        form.dataset.isSubmitting = 'false';
        return;
    }
    
    console.log('Config collected and validated:', config);

    showOptConfigSummary(config);

    document.getElementById('optConfirmRunBacktestBtn').onclick = async function() {
        closeOptConfigSummary();
        form.dataset.isSubmitting = 'true';
        
        localStorage.removeItem('lastBacktestResult');
        
        const resultsDiv = document.getElementById('backtestResults');
        const errorDiv = document.getElementById('backtestError');
        const loadingDiv = document.getElementById('backtestLoading');
        const progressDiv = document.getElementById('backtestProgress');
        
        if (resultsDiv) resultsDiv.style.display = 'none';
        if (errorDiv) errorDiv.style.display = 'none';
        if (loadingDiv) loadingDiv.style.display = 'block';
        if (progressDiv) progressDiv.textContent = 'Starting backtest...';
        
        try {
            const apiKey = getAPIKey();
            
            const response = await authFetch(`${API_BASE_URL}/backtest/start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': apiKey
                },
                body: JSON.stringify(config)
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.error) {
                throw new Error(result.error);
            }
            
            console.log('Backtest started:', result.backtest_id);
            
            if (result.backtest_id) {
                localStorage.setItem('lastBacktestId', result.backtest_id);
            }
            
            window.location.href = `/options-backtest-result-detail.html?id=${result.backtest_id}`;
            
        } catch (error) {
            console.error('Backtest error:', error);
            showError(`Error starting backtest: ${error.message}`);
            if (loadingDiv) loadingDiv.style.display = 'none';
            form.dataset.isSubmitting = 'false';
        }
    };
}

function collectFormData() {
    // Collect backtest name (optional)
    const backtestName = document.getElementById('backtestName') ? document.getElementById('backtestName').value.trim() : '';
    
    // Collect basic fields
    const symbol = document.getElementById('symbol').value.trim().toUpperCase();
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const entryTime = document.getElementById('entryTime').value;
    const dte = parseInt(document.getElementById('dte').value);
    const strategy = document.getElementById('strategy').value;
    const startingCapital = parseFloat(document.getElementById('startingCapital').value);
    
    // Validate required fields (backtest_name is optional)
    if (!symbol || !startDate || !endDate || !entryTime || dte === undefined || !strategy || !startingCapital) {
        return null;
    }
    
    // Collect leg configurations
    const legDefinitions = getStrategyLegs(strategy);
    const legs = [];
    
    for (let i = 0; i < legDefinitions.length; i++) {
        const methodSelect = document.querySelector(`.leg-method-select[data-leg-index="${i}"]`);
        if (!methodSelect || !methodSelect.value) {
            showError(`Please configure Leg ${i + 1}`);
            return null;
        }
        
        const method = methodSelect.value;
        const paramsContainer = document.getElementById(`legParams${i}`);
        const paramInputs = paramsContainer.querySelectorAll('.leg-param');
        
        const params = {};
        paramInputs.forEach(input => {
            const paramName = input.dataset.param;
            params[paramName] = input.type === 'number' ? parseFloat(input.value) : input.value;
        });
        
        // For leg-to-leg references, also store the reference leg name (not just index)
        if ((method === 'pct_leg' || method === 'dollar_leg') && params.reference !== undefined) {
            const refIndex = parseInt(params.reference);
            if (refIndex >= 0 && refIndex < legDefinitions.length) {
                params.reference_leg = legDefinitions[refIndex].name;
            }
        }
        
        legs.push({
            name: legDefinitions[i].name,
            type: legDefinitions[i].type,
            position: legDefinitions[i].position,
            config_type: method,
            params: params,
            original_index: i  // Track original position
        });
    }
    
    // CRITICAL: Sort legs by dependencies
    // Legs that DON'T reference others must come BEFORE legs that DO reference others
    // This ensures calculated_strikes array is built in the right order
    const sortedLegs = topologicalSortLegs(legs);
    
    if (!sortedLegs) {
        showError('Circular dependency detected in leg configuration!');
        return null;
    }
    
    // Collect take profit/stop loss
    const takeProfitType = document.querySelector('input[name="takeProfitType"]:checked').value;
    const stopLossType = document.querySelector('input[name="stopLossType"]:checked').value;
    
    const config = {
        backtest_name: backtestName,
        symbol: symbol,
        start_date: startDate,
        end_date: endDate,
        entry_time: entryTime,
        dte: dte,
        strategy: strategy,
        legs: sortedLegs,  // Use sorted legs
        take_profit_pct: takeProfitType === 'P' ? parseFloat(document.getElementById('takeProfitPct').value) : null,
        take_profit_dollar: takeProfitType === 'D' ? parseFloat(document.getElementById('takeProfitDollar').value) : null,
        stop_loss_pct: stopLossType === 'P' ? parseFloat(document.getElementById('stopLossPct').value) : null,
        stop_loss_dollar: stopLossType === 'D' ? parseFloat(document.getElementById('stopLossDollar').value) : null,
        detection_bar_size: parseFloat(document.getElementById('detectionBars').value),
        concurrent_trades: document.querySelector('input[name="concurrentTrades"]:checked').value === 'y',
        avoid_pdt: document.querySelector('input[name="avoidPdt"]:checked').value === 'y',
        starting_capital: startingCapital
    };
    
    // Add allocation
    const allocationType = document.querySelector('input[name="allocationType"]:checked').value;
    if (allocationType === '1') {
        config.allocation_type = 'pct';
        config.allocation_value = parseFloat(document.getElementById('allocationPct').value);
    } else if (allocationType === '2') {
        config.allocation_type = 'contracts';
        config.allocation_value = parseInt(document.getElementById('allocationContracts').value);
    } else {
        config.allocation_type = 'fixed';
        config.allocation_value = parseFloat(document.getElementById('allocationFixed').value);
    }
    
    // Add wing configuration if Iron strategy
    if (strategy.includes('Iron')) {
        config.allow_skewed_wings = document.querySelector('input[name="allowSkewedWings"]:checked').value === 'y';
    }
    
    // Add net premium filter if provided
    const netPremiumMin = document.getElementById('netPremiumMin').value;
    const netPremiumMax = document.getElementById('netPremiumMax').value;
    
    if (netPremiumMin) {
        config.net_premium_min = parseFloat(netPremiumMin);
    }
    if (netPremiumMax) {
        config.net_premium_max = parseFloat(netPremiumMax);
    }
    
    // Add entry time max (optional range)
    const entryTimeMax = document.getElementById('entryTimeMax')?.value;
    if (entryTimeMax) {
        config.entry_time_max = entryTimeMax;
    }
    
    // Collect price conditions
    const priceConditions = collectPriceConditions();
    if (priceConditions && priceConditions.length > 0) {
        config.price_conditions = priceConditions;
    }
    
    return config;
}

function displayResults(result) {
    console.log('=== DISPLAY RESULTS CALLED ===');
    console.log('Displaying results:', {
        hasEquityCurveImage: !!result.equity_curve_image,
        equityCurveImageLength: result.equity_curve_image ? result.equity_curve_image.length : 0,
        backtestId: result.backtest_id
    });
    
    // Display equity curve if available
    const equityCurveSection = document.getElementById('equityCurveSection');
    const equityCurveContainer = document.getElementById('equityCurveContainer');
    
    console.log('Equity curve elements:', {
        section: !!equityCurveSection,
        container: !!equityCurveContainer,
        sectionDisplay: equityCurveSection ? equityCurveSection.style.display : 'N/A'
    });
    
    if (!equityCurveSection) {
        console.error('❌ equityCurveSection element NOT FOUND!');
        alert('ERROR: equityCurveSection element missing from HTML!');
    }
    
    if (!equityCurveContainer) {
        console.error('❌ equityCurveContainer element NOT FOUND!');
        alert('ERROR: equityCurveContainer element missing from HTML!');
    }
    
    if (result.equity_curve_image && equityCurveSection && equityCurveContainer) {
        console.log('✓ Creating equity curve image...');
        const img = document.createElement('img');
        img.src = `data:image/png;base64,${result.equity_curve_image}`;
        img.alt = 'Equity Curve';
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.onload = () => console.log('✓✓✓ Equity curve image loaded successfully!');
        img.onerror = (e) => {
            console.error('❌❌❌ Failed to load equity curve image', e);
            alert('Failed to load equity curve image!');
        };
        equityCurveContainer.innerHTML = '';
        equityCurveContainer.appendChild(img);
        equityCurveSection.style.display = 'block';
        console.log('✓ Equity curve section displayed, display=' + equityCurveSection.style.display);
    } else {
        console.log('⚠️  No equity curve image or missing elements', {
            hasImage: !!result.equity_curve_image,
            hasSection: !!equityCurveSection,
            hasContainer: !!equityCurveContainer
        });
        if (equityCurveSection) {
            equityCurveSection.style.display = 'none';
        }
    }
    
    // Display statistics (with null checks)
    const setTextContent = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    
    setTextContent('statTotalTrades', result.total_trades || 0);
    setTextContent('statWinRate', result.win_rate ? `${result.win_rate.toFixed(1)}%` : 'N/A');
    setTextContent('statTotalPL', formatCurrency(result.total_pnl));
    setTextContent('statAvgWin', formatCurrency(result.avg_win));
    setTextContent('statAvgLoss', formatCurrency(result.avg_loss));
    setTextContent('statProfitFactor', result.profit_factor ? result.profit_factor.toFixed(2) : 'N/A');
    setTextContent('statMaxDrawdown', result.max_drawdown ? `${result.max_drawdown.toFixed(2)}%` : 'N/A');
    setTextContent('statTotalReturn', result.total_return ? `${result.total_return.toFixed(2)}%` : 'N/A');
    
    // Display trades table
    displayTradesTable(result.trades || []);
    
    // Store CSV data and backtest ID for download
    window.backtestCSVData = result.csv_data;
    window.currentBacktestId = result.backtest_id;
    
    // SAVE TO LOCALSTORAGE so results persist across page reloads
    try {
        const backtestData = {
            backtest_id: result.backtest_id,
            total_trades: result.total_trades,
            win_rate: result.win_rate,
            total_pnl: result.total_pnl,
            avg_win: result.avg_win,
            avg_loss: result.avg_loss,
            profit_factor: result.profit_factor,
            max_drawdown: result.max_drawdown,
            total_return: result.total_return,
            equity_curve_image: result.equity_curve_image,
            trades: result.trades,
            csv_data: result.csv_data,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem('lastBacktestResult', JSON.stringify(backtestData));
        console.log('✓ Saved backtest results to localStorage');
    } catch (e) {
        console.error('Failed to save to localStorage:', e);
    }
    
    const resultsDiv = document.getElementById('backtestResults');
    if (resultsDiv) {
        resultsDiv.style.display = 'block';
        resultsDiv.scrollIntoView({ behavior: 'smooth' });
    }
}

function displayTradesTable(trades) {
    const thead = document.getElementById('tradesTableHead');
    const tbody = document.getElementById('tradesTableBody');
    
    if (!trades || trades.length === 0) {
        tbody.innerHTML = '<tr><td colspan="100%">No trades executed</td></tr>';
        return;
    }
    
    // Build header
    const firstTrade = trades[0];
    const legCount = firstTrade.legs ? firstTrade.legs.length : 0;
    
    let headerHTML = '<tr>';
    headerHTML += '<th>Entry Date</th><th>Entry Time</th><th>Underlying</th>';
    headerHTML += '<th>Exit Date</th><th>Exit Time</th>';
    headerHTML += '<th>Strategy</th><th>Contracts</th>';
    headerHTML += '<th>Entry Premium</th><th>Exit Premium</th>';
    headerHTML += '<th>P&L</th><th>Exit Reason</th><th>DTE</th><th>DIT</th>';
    
    for (let i = 0; i < legCount; i++) {
        headerHTML += `<th>Leg ${i+1} Symbol</th><th>Leg ${i+1} Strike</th><th>Leg ${i+1} Entry</th><th>Leg ${i+1} Exit</th>`;
    }
    
    headerHTML += '</tr>';
    thead.innerHTML = headerHTML;
    
    // Build body
    let bodyHTML = '';
    trades.forEach(trade => {
        const plClass = trade.pnl >= 0 ? 'profit' : 'loss';
        bodyHTML += '<tr>';
        bodyHTML += `<td>${trade.entry_date}</td>`;
        bodyHTML += `<td>${trade.entry_time}</td>`;
        bodyHTML += `<td>$${trade.underlying_price.toFixed(2)}</td>`;
        bodyHTML += `<td>${trade.exit_date}</td>`;
        bodyHTML += `<td>${trade.exit_time}</td>`;
        bodyHTML += `<td>${trade.strategy}</td>`;
        bodyHTML += `<td>${trade.num_contracts}</td>`;
        bodyHTML += `<td>$${trade.net_premium_entry.toFixed(4)}</td>`;
        bodyHTML += `<td>$${trade.net_premium_exit.toFixed(4)}</td>`;
        bodyHTML += `<td class="${plClass}">$${trade.pnl.toFixed(2)}</td>`;
        bodyHTML += `<td>${trade.exit_reason}</td>`;
        bodyHTML += `<td>${trade.dte}</td>`;
        bodyHTML += `<td>${trade.dit.toFixed(1)}</td>`;
        
        if (trade.legs) {
            trade.legs.forEach(leg => {
                bodyHTML += `<td>${leg.symbol}</td>`;
                bodyHTML += `<td>$${leg.strike.toFixed(2)}</td>`;
                bodyHTML += `<td>$${leg.entry_price.toFixed(4)}</td>`;
                bodyHTML += `<td>$${leg.exit_price.toFixed(4)}</td>`;
            });
        }
        
        bodyHTML += '</tr>';
    });
    
    tbody.innerHTML = bodyHTML;
}

function resetForm() {
    const form = document.getElementById('backtestForm');
    if (form) form.reset();
    
    // Reset conditional sections (with null checks)
    const wingConfigSection = document.getElementById('wingConfigSection');
    const wingConfigForm = document.getElementById('wingConfigForm');
    const legConfigSection = document.getElementById('legConfigSection');
    const resultsDiv = document.getElementById('backtestResults');
    
    if (wingConfigSection) wingConfigSection.style.display = 'none';
    if (wingConfigForm) wingConfigForm.style.display = 'none';
    
    if (legConfigSection) {
        legConfigSection.innerHTML = `
            <div class="info-box">
                <i class="fas fa-info-circle"></i>
                <span>Select a strategy above to configure legs</span>
            </div>
        `;
    }
    
    if (resultsDiv) resultsDiv.style.display = 'none';
    hideError();
}

function showError(message) {
    const errorDiv = document.getElementById('backtestError');
    if (!errorDiv) {
        console.error('Error div not found:', message);
        alert(message); // Fallback to alert
        return;
    }
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
        if (errorDiv) {
            errorDiv.style.display = 'none';
        }
    }, 8000);
}

function hideError() {
    const errorDiv = document.getElementById('backtestError');
    if (errorDiv) {
        errorDiv.style.display = 'none';
    }
}

function formatCurrency(value) {
    if (value === null || value === undefined) return 'N/A';
    return `$${value.toFixed(2)}`;
}

// Download CSV
document.addEventListener('DOMContentLoaded', () => {
    // Try to load the last backtest if it exists
    loadLastBacktestIfExists();
    
    const downloadBtn = document.getElementById('downloadCSV');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            if (window.backtestCSVData) {
                const blob = new Blob([window.backtestCSVData], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `backtest_trades_${Date.now()}.csv`;
                a.click();
                window.URL.revokeObjectURL(url);
            } else {
                alert('No CSV data available');
            }
        });
    }
});

async function loadLastBacktestIfExists() {
    // Check localStorage for last backtest ID
    const lastBacktestId = localStorage.getItem('lastBacktestId');
    
    if (!lastBacktestId) {
        console.log('No previous backtest found in localStorage');
        return;
    }
    
    console.log(`Found last backtest ID: ${lastBacktestId}`);
    console.log('Attempting to load last backtest results...');
    
    try {
        // Construct the API URL
        const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? `http://${window.location.hostname}:${window.location.port}/api`
            : '/api';
        
        // Fetch the backtest metadata
        const response = await authFetch(`${apiUrl}/backtests/list`);
        
        if (!response.ok) {
            console.error('Failed to fetch backtests list');
            return;
        }
        
        const data = await response.json();
        
        // Find the last backtest
        const lastBacktest = data.backtests.find(bt => bt.id === lastBacktestId);
        
        if (!lastBacktest) {
            console.log('Last backtest not found in saved backtests');
            localStorage.removeItem('lastBacktestId'); // Clean up
            return;
        }
        
        console.log('Loading last backtest:', lastBacktest);
        
        // Convert metadata format to displayResults format
        const result = {
            status: 'completed',
            backtest_id: lastBacktest.id,
            total_trades: lastBacktest.summary.total_trades,
            win_rate: lastBacktest.summary.win_rate,
            total_pnl: lastBacktest.summary.total_pnl,
            avg_win: lastBacktest.summary.avg_win,
            avg_loss: lastBacktest.summary.avg_loss,
            profit_factor: lastBacktest.summary.profit_factor,
            max_drawdown: lastBacktest.summary.max_drawdown,
            total_return: lastBacktest.summary.total_return,
            equity_curve_image: null // Will load separately
        };
        
        // Load the equity curve image
        const imgResponse = await authFetch(`${apiUrl}/backtest-image/${lastBacktest.id}`);
        if (imgResponse.ok) {
            const imgBlob = await imgResponse.blob();
            const reader = new FileReader();
            reader.onloadend = () => {
                result.equity_curve_image = reader.result;
                displayResults(result);
                console.log('✓ Last backtest loaded successfully');
            };
            reader.readAsDataURL(imgBlob);
        } else {
            // Display without image
            displayResults(result);
            console.log('✓ Last backtest loaded (without equity curve image)');
        }
        
    } catch (error) {
        console.error('Error loading last backtest:', error);
    }
}

// =============================================================================
// TEMPLATE MANAGEMENT - OPTIONS BACKTESTER
// =============================================================================

async function loadOptionsTemplates() {
    try {
        const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? `http://${window.location.hostname}:${window.location.port}/api`
            : '/api';
        
        const response = await authFetch(`${apiUrl}/backtest-templates?type=options`);
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                optionsTemplates = data.templates || [];
                optionsTemplatesLoaded = true;
                renderOptionsTemplatesList();
                console.log('Loaded', optionsTemplates.length, 'options templates');
            }
        }
    } catch (error) {
        console.error('Error loading templates:', error);
    }
}

function toggleTemplatesMenu() {
    var menu = document.getElementById('templatesMenu');
    if (menu) {
        var isVisible = menu.style.display === 'block';
        menu.style.display = isVisible ? 'none' : 'block';
        if (!isVisible && !optionsTemplatesLoaded) {
            loadOptionsTemplates();
        }
    }
}

function renderOptionsTemplatesList() {
    var container = document.getElementById('templatesList');
    if (!container) return;
    
    if (optionsTemplates.length === 0) {
        container.innerHTML = '<div style="padding: 10px; color: #666; font-style: italic;">No saved templates</div>';
        return;
    }
    
    container.innerHTML = optionsTemplates.map(template => `
        <div class="template-item" style="padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; cursor: pointer;" 
             onmouseover="this.style.background='#f5f5f5'" 
             onmouseout="this.style.background='white'">
            <span onclick="applyOptionsTemplate(${template.id})" style="flex: 1;">${template.name}</span>
            <button onclick="deleteOptionsTemplate(${template.id}, event)" 
                    style="background: none; border: none; color: #dc3545; cursor: pointer; padding: 2px 6px;"
                    title="Delete template">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
    `).join('');
}

function collectOptionsFormData() {
    var config = {};
    
    // Strategy
    config.strategy = document.getElementById('strategy')?.value || '';
    
    // Entry time
    config.entryTime = document.getElementById('entryTime')?.value || '10:00';
    
    // DTE
    config.dte = document.getElementById('dte')?.value || '0';
    
    // Wing configuration
    config.allowSkewedWings = document.querySelector('input[name="allowSkewedWings"]:checked')?.value || 'n';
    
    // Leg configurations
    config.legs = [];
    document.querySelectorAll('.leg-config-card').forEach((card, index) => {
        var legConfig = { index: index };
        var methodSelect = card.querySelector('.leg-method-select');
        legConfig.method = methodSelect?.value || '';
        
        // Collect all leg params
        card.querySelectorAll('.leg-param').forEach(input => {
            var paramName = input.dataset.param;
            legConfig[paramName] = input.value;
        });
        
        config.legs.push(legConfig);
    });
    
    // Take Profit
    config.takeProfitType = document.querySelector('input[name="takeProfitType"]:checked')?.value || 'P';
    config.takeProfitPct = document.getElementById('takeProfitPct')?.value || '';
    config.takeProfitDollar = document.getElementById('takeProfitDollar')?.value || '';
    
    // Stop Loss
    config.stopLossType = document.querySelector('input[name="stopLossType"]:checked')?.value || 'P';
    config.stopLossPct = document.getElementById('stopLossPct')?.value || '';
    config.stopLossDollar = document.getElementById('stopLossDollar')?.value || '';
    
    // End of Day Action
    config.eodAction = document.getElementById('eodAction')?.value || 'close';
    
    // Trade Frequency
    config.tradeFrequency = document.getElementById('tradeFrequency')?.value || 'daily';
    
    // Entry Days
    config.entryDays = [];
    document.querySelectorAll('input[name="entryDays"]:checked').forEach(cb => {
        config.entryDays.push(cb.value);
    });
    
    // Capital
    config.startingCapital = document.getElementById('startingCapital')?.value || '100000';
    
    // Allocation
    config.allocationType = document.querySelector('input[name="allocationType"]:checked')?.value || '1';
    config.allocationPct = document.getElementById('allocationPct')?.value || '';
    config.allocationContracts = document.getElementById('allocationContracts')?.value || '';
    config.allocationFixed = document.getElementById('allocationFixed')?.value || '';
    
    // Entry time max (optional)
    config.entryTimeMax = document.getElementById('entryTimeMax')?.value || '';
    
    // Price conditions
    config.priceConditions = collectPriceConditions();
    
    return config;
}

async function saveOptionsTemplate() {
    if (typeof window.isAuthenticated === 'function' && !window.isAuthenticated()) {
        alert('Please log in to save templates');
        return;
    }
    
    var templateName = prompt('Enter a name for this template:');
    if (!templateName || !templateName.trim()) return;
    
    var config = collectOptionsFormData();
    
    try {
        const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? `http://${window.location.hostname}:${window.location.port}/api`
            : '/api';
        
        const response = await authFetch(`${apiUrl}/backtest-templates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: templateName.trim(),
                template_type: 'options',
                template_config: config
            })
        });
        
        const data = await response.json();
        if (data.success) {
            await loadOptionsTemplates();
            alert('Template saved successfully!');
        } else {
            alert('Error saving template: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        alert('Error saving template: ' + error.message);
    }
}

async function applyOptionsTemplate(templateId) {
    var template = optionsTemplates.find(t => t.id === templateId);
    if (!template) return;
    
    var config = template.template_config;
    
    // Close menu
    document.getElementById('templatesMenu').style.display = 'none';
    
    // Apply strategy
    var strategySelect = document.getElementById('strategy');
    if (strategySelect && config.strategy) {
        strategySelect.value = config.strategy;
        strategySelect.dispatchEvent(new Event('change'));
    }
    
    // Wait for leg configs to render
    setTimeout(() => {
        // Apply entry time
        if (document.getElementById('entryTime')) {
            document.getElementById('entryTime').value = config.entryTime || '10:00';
        }
        
        // Apply DTE
        if (document.getElementById('dte')) {
            document.getElementById('dte').value = config.dte || '0';
        }
        
        // Apply wing configuration
        var wingRadio = document.querySelector(`input[name="allowSkewedWings"][value="${config.allowSkewedWings || 'n'}"]`);
        if (wingRadio) wingRadio.checked = true;
        
        // Apply leg configurations
        if (config.legs && config.legs.length > 0) {
            config.legs.forEach((leg, index) => {
                var methodSelect = document.querySelector(`.leg-method-select[data-leg-index="${index}"]`);
                if (methodSelect && leg.method) {
                    methodSelect.value = leg.method;
                    methodSelect.dispatchEvent(new Event('change'));
                    
                    // Wait for params to render then fill them
                    setTimeout(() => {
                        var paramsContainer = document.getElementById(`legParams${index}`);
                        if (paramsContainer) {
                            Object.keys(leg).forEach(key => {
                                if (key !== 'index' && key !== 'method') {
                                    var input = paramsContainer.querySelector(`[data-param="${key}"]`);
                                    if (input) input.value = leg[key];
                                }
                            });
                        }
                    }, 100);
                }
            });
        }
        
        // Apply take profit
        var tpRadio = document.querySelector(`input[name="takeProfitType"][value="${config.takeProfitType || 'P'}"]`);
        if (tpRadio) {
            tpRadio.checked = true;
            tpRadio.dispatchEvent(new Event('change'));
        }
        if (document.getElementById('takeProfitPct')) document.getElementById('takeProfitPct').value = config.takeProfitPct || '';
        if (document.getElementById('takeProfitDollar')) document.getElementById('takeProfitDollar').value = config.takeProfitDollar || '';
        
        // Apply stop loss
        var slRadio = document.querySelector(`input[name="stopLossType"][value="${config.stopLossType || 'P'}"]`);
        if (slRadio) {
            slRadio.checked = true;
            slRadio.dispatchEvent(new Event('change'));
        }
        if (document.getElementById('stopLossPct')) document.getElementById('stopLossPct').value = config.stopLossPct || '';
        if (document.getElementById('stopLossDollar')) document.getElementById('stopLossDollar').value = config.stopLossDollar || '';
        
        // Apply EOD action
        if (document.getElementById('eodAction')) document.getElementById('eodAction').value = config.eodAction || 'close';
        
        // Apply trade frequency
        if (document.getElementById('tradeFrequency')) document.getElementById('tradeFrequency').value = config.tradeFrequency || 'daily';
        
        // Apply entry days
        document.querySelectorAll('input[name="entryDays"]').forEach(cb => {
            cb.checked = config.entryDays && config.entryDays.includes(cb.value);
        });
        
        // Apply capital
        if (document.getElementById('startingCapital')) document.getElementById('startingCapital').value = config.startingCapital || '100000';
        
        // Apply allocation
        var allocRadio = document.querySelector(`input[name="allocationType"][value="${config.allocationType || '1'}"]`);
        if (allocRadio) {
            allocRadio.checked = true;
            allocRadio.dispatchEvent(new Event('change'));
        }
        if (document.getElementById('allocationPct')) document.getElementById('allocationPct').value = config.allocationPct || '';
        if (document.getElementById('allocationContracts')) document.getElementById('allocationContracts').value = config.allocationContracts || '';
        if (document.getElementById('allocationFixed')) document.getElementById('allocationFixed').value = config.allocationFixed || '';
        
        // Apply entry time max
        if (document.getElementById('entryTimeMax')) {
            document.getElementById('entryTimeMax').value = config.entryTimeMax || '';
        }
        
        // Apply price conditions
        if (config.priceConditions && config.priceConditions.length > 0) {
            applyPriceConditions(config.priceConditions);
        }
        
        // Check for Day candle conditions and lock entry time if needed
        setTimeout(() => {
            checkDayCandleConditions();
        }, 300);
        
        console.log('Template applied:', template.name);
    }, 200);
}

function applyPriceConditions(conditions) {
    // Clear existing conditions
    const container = document.getElementById('priceConditionsContainer');
    if (!container) return;
    container.innerHTML = '';
    priceConditionCount = 0;
    
    // Add each condition
    conditions.forEach((condition, idx) => {
        addPriceCondition();
        const id = idx;
        
        // Apply left side values
        if (document.getElementById(`metric${id}`)) {
            document.getElementById(`metric${id}`).value = condition.metric || 'price';
            updateConditionFields(id);
        }
        
        setTimeout(() => {
            if (document.getElementById(`leftDay${id}`)) document.getElementById(`leftDay${id}`).value = condition.left?.day || '0';
            if (document.getElementById(`leftCandleType${id}`)) {
                document.getElementById(`leftCandleType${id}`).value = condition.left?.candle_type || 'day';
                // Update series type options based on candle type
                handleCandleTypeChange(id);
            }
            // Set series type after handleCandleTypeChange updates options
            if (document.getElementById(`leftSeriesType${id}`)) document.getElementById(`leftSeriesType${id}`).value = condition.left?.series_type || 'open';
            if (document.getElementById(`leftWindow${id}`)) document.getElementById(`leftWindow${id}`).value = condition.left?.window || 14;
            
            // MACD fields
            if (condition.metric === 'macd') {
                if (document.getElementById(`leftMacdShort${id}`)) document.getElementById(`leftMacdShort${id}`).value = condition.left?.short_window || 12;
                if (document.getElementById(`leftMacdLong${id}`)) document.getElementById(`leftMacdLong${id}`).value = condition.left?.long_window || 26;
                if (document.getElementById(`leftMacdSignal${id}`)) document.getElementById(`leftMacdSignal${id}`).value = condition.left?.signal_window || 9;
                if (document.getElementById(`leftMacdComponent${id}`)) document.getElementById(`leftMacdComponent${id}`).value = condition.left?.component || 'histogram';
            }
            
            // Operator and comparator
            if (document.getElementById(`operator${id}`)) document.getElementById(`operator${id}`).value = condition.operator || '>';
            if (document.getElementById(`comparator${id}`)) {
                document.getElementById(`comparator${id}`).value = condition.comparator || 'value';
                updateRightSideVisibility(id);
            }
            
            // Value or right side
            if (condition.comparator === 'value') {
                if (document.getElementById(`compareValue${id}`)) document.getElementById(`compareValue${id}`).value = condition.compare_value || 0;
            } else if (condition.right) {
                setTimeout(() => {
                    if (document.getElementById(`rightDay${id}`)) document.getElementById(`rightDay${id}`).value = condition.right?.day || '0';
                    if (document.getElementById(`rightCandleType${id}`)) document.getElementById(`rightCandleType${id}`).value = condition.right?.candle_type || 'day';
                    if (document.getElementById(`rightSeriesType${id}`)) document.getElementById(`rightSeriesType${id}`).value = condition.right?.series_type || 'close';
                    if (document.getElementById(`rightWindow${id}`)) document.getElementById(`rightWindow${id}`).value = condition.right?.window || 14;
                    
                    // Threshold
                    if (condition.threshold) {
                        if (document.getElementById(`thresholdUnit${id}`)) document.getElementById(`thresholdUnit${id}`).value = condition.threshold?.unit || 'percent';
                        if (document.getElementById(`thresholdValue${id}`)) document.getElementById(`thresholdValue${id}`).value = condition.threshold?.value || 0;
                    }
                }, 50);
            }
        }, 50);
    });
}

async function deleteOptionsTemplate(templateId, event) {
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
            await loadOptionsTemplates();
        } else {
            alert('Error deleting template: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        alert('Error deleting template: ' + error.message);
    }
}
