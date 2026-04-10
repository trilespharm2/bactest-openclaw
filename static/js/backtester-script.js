// Backtester Page JavaScript
// Matches EXACT structure of options_backtester_v2_3_3-5.py

var priceConditionCount = 0;
var optExitConditionCount = 0;
var optExitConditionNextId = 0;

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
    { value: 'current_price', label: 'Current Price' },
    { value: 'price', label: 'Price' },
    { value: 'sma', label: 'SMA' },
    { value: 'ema', label: 'EMA' },
    { value: 'rsi', label: 'RSI' },
    { value: 'macd', label: 'MACD' }
];

function updateOptionsEntryType() {
    const type = document.querySelector('input[name="optionsEntryType"]:checked')?.value || 'none';
    const presetSection = document.getElementById('optionsPresetSection');
    const customSection = document.getElementById('optionsCustomSection');
    
    if (presetSection) presetSection.style.display = type === 'preset' ? 'block' : 'none';
    if (customSection) customSection.style.display = type === 'custom' ? 'block' : 'none';
    
    if (type === 'custom') {
        const container = document.getElementById('priceConditionsContainer');
        if (container && container.querySelectorAll('.price-condition-row').length === 0) {
            addPriceCondition();
        }
    }
}

function updateOptionsPresetFields() {
    const preset = document.getElementById('optionsPresetCondition')?.value;
    const standardFields = document.getElementById('optionsStandardPresetFields');
    const velocityFields = document.getElementById('optionsVelocityFields');
    
    if (preset === '5') {
        if (standardFields) standardFields.style.display = 'none';
        if (velocityFields) velocityFields.style.display = 'flex';
    } else {
        if (standardFields) standardFields.style.display = 'flex';
        if (velocityFields) velocityFields.style.display = 'none';
    }
}

// =============================================================================
// EXIT CONDITIONS (signal-based)
// =============================================================================

function updateOptExitCondType() {
    const type = document.querySelector('input[name="optExitCondType"]:checked')?.value || 'none';
    const presetSection = document.getElementById('optExitPresetSection');
    const customSection = document.getElementById('optExitCustomSection');
    
    if (presetSection) presetSection.style.display = type === 'preset' ? 'block' : 'none';
    if (customSection) customSection.style.display = type === 'custom' ? 'block' : 'none';
    
    if (type === 'preset') {
        updateOptExitPresetFields();
    }
    if (type === 'custom') {
        const container = document.getElementById('optExitConditionsContainer');
        if (container && container.querySelectorAll('.opt-exit-condition-row').length === 0) {
            addOptExitCondition();
        }
    }
}

function updateOptExitPresetFields() {
    var sel = document.getElementById('optExitPresetCondition');
    var val = sel ? sel.value : '';
    var isVelocity = val === '5';
    var hasVal = val !== '';
    document.getElementById('optExitStandardPresetFields').style.display = (hasVal && !isVelocity) ? 'flex' : 'none';
    document.getElementById('optExitVelocityFields').style.display = (hasVal && isVelocity) ? 'flex' : 'none';
}

function addOptExitCondition() {
    optExitConditionNextId++;
    optExitConditionCount++;
    const container = document.getElementById('optExitConditionsContainer');
    if (!container) return;
    
    if (optExitConditionCount > 3) {
        optExitConditionCount--;
        appAlert('Maximum of 3 exit conditions allowed.');
        return;
    }
    
    const n = optExitConditionNextId;
    const conditionDiv = document.createElement('div');
    conditionDiv.className = 'opt-exit-condition-row card p-3 mb-3';
    conditionDiv.id = `optExitCondition${n}`;
    conditionDiv.style.cssText = 'background: #f8f9fa; border: 1px solid #dee2e6;';
    
    conditionDiv.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-2">
            <strong class="text-muted">Exit Condition ${optExitConditionCount}</strong>
            <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeOptExitCondition(${n})">
                <i class="fas fa-times"></i>
            </button>
        </div>
        
        <div class="condition-left-side mb-3">
            <label class="form-label fw-bold">Left Side (Compare this)</label>
            <div class="row g-2">
                <div class="col-md-4 col-sm-6">
                    <label class="form-label small">Metric</label>
                    <select class="form-select form-select-sm" id="optExitMetric${n}" onchange="updateOptExitConditionFields(${n})">
                        ${METRICS.map(m => '<option value="' + m.value + '">' + m.label + '</option>').join('')}
                    </select>
                </div>
                <div class="col-md-4 col-sm-6" id="optExitLeftDayGroup${n}">
                    <label class="form-label small">Day</label>
                    <select class="form-select form-select-sm" id="optExitLeftDay${n}">
                        ${DAY_OPTIONS.map(d => '<option value="' + d.value + '">' + d.label + '</option>').join('')}
                    </select>
                </div>
                <div class="col-md-4 col-sm-6" id="optExitLeftCandleTypeGroup${n}">
                    <label class="form-label small">Candle Type</label>
                    <select class="form-select form-select-sm" id="optExitLeftCandleType${n}">
                        ${CANDLE_TYPES.map(c => '<option value="' + c.value + '">' + c.label + '</option>').join('')}
                    </select>
                </div>
                <div class="col-md-3 col-sm-6" id="optExitLeftMultiplierGroup${n}">
                    <label class="form-label small">Multiplier</label>
                    <input type="number" class="form-control form-control-sm" id="optExitLeftMultiplier${n}" value="1" min="1" max="60">
                </div>
                <div class="col-md-3 col-sm-6" id="optExitLeftWindowGroup${n}" style="display:none;">
                    <label class="form-label small" id="optExitLeftWindowLabel${n}">Window</label>
                    <input type="number" class="form-control form-control-sm" id="optExitLeftWindow${n}" value="14" min="1">
                </div>
                <div class="col-md-3 col-sm-6" id="optExitLeftSeriesTypeGroup${n}">
                    <label class="form-label small" id="optExitLeftSeriesLabel${n}">Series Type</label>
                    <select class="form-select form-select-sm" id="optExitLeftSeriesType${n}">
                        ${SERIES_TYPES.map(s => '<option value="' + s.value + '"' + (s.value === 'close' ? ' selected' : '') + '>' + s.label + '</option>').join('')}
                    </select>
                </div>
            </div>
        </div>
        
        <div class="condition-operator mb-3">
            <div class="row g-2 align-items-end">
                <div class="col-md-3">
                    <label class="form-label fw-bold">Operator</label>
                    <select class="form-select" id="optExitOperator${n}" onchange="updateOptExitRightSide(${n})">
                        <option value=">">&gt;</option>
                        <option value="<">&lt;</option>
                        <option value=">=">&gt;=</option>
                        <option value="<=">&lt;=</option>
                        <option value="==">=</option>
                    </select>
                </div>
                <div class="col-md-3">
                    <label class="form-label">Comparator</label>
                    <select class="form-select" id="optExitComparator${n}" onchange="updateOptExitRightSide(${n})">
                        <option value="value">Value</option>
                        <option value="compare_price">Compare Price</option>
                        <option value="compare_sma">Compare SMA</option>
                        <option value="compare_ema">Compare EMA</option>
                    </select>
                </div>
                <div class="col-md-3" id="optExitValueInputGroup${n}">
                    <label class="form-label">Value</label>
                    <input type="number" class="form-control" id="optExitCompareValue${n}" step="0.01" placeholder="e.g., 50">
                </div>
            </div>
        </div>
        
        <div class="condition-right-side mb-3" id="optExitRightSide${n}" style="display:none;">
            <label class="form-label fw-bold">Right Side (To this)</label>
            <div class="row g-2">
                <div class="col-md-4 col-sm-6" id="optExitRightDayGroup${n}">
                    <label class="form-label small">Day</label>
                    <select class="form-select form-select-sm" id="optExitRightDay${n}">
                        ${DAY_OPTIONS.map(d => '<option value="' + d.value + '">' + d.label + '</option>').join('')}
                    </select>
                </div>
                <div class="col-md-4 col-sm-6" id="optExitRightCandleTypeGroup${n}">
                    <label class="form-label small">Candle Type</label>
                    <select class="form-select form-select-sm" id="optExitRightCandleType${n}">
                        ${CANDLE_TYPES.map(c => '<option value="' + c.value + '">' + c.label + '</option>').join('')}
                    </select>
                </div>
                <div class="col-md-3 col-sm-6" id="optExitRightMultiplierGroup${n}">
                    <label class="form-label small">Multiplier</label>
                    <input type="number" class="form-control form-control-sm" id="optExitRightMultiplier${n}" value="1" min="1">
                </div>
                <div class="col-md-3 col-sm-6" id="optExitRightWindowGroup${n}" style="display:none;">
                    <label class="form-label small">Window</label>
                    <input type="number" class="form-control form-control-sm" id="optExitRightWindow${n}" value="14" min="1">
                </div>
                <div class="col-md-3 col-sm-6" id="optExitRightSeriesTypeGroup${n}">
                    <label class="form-label small">Series Type</label>
                    <select class="form-select form-select-sm" id="optExitRightSeriesType${n}">
                        ${SERIES_TYPES.map(s => '<option value="' + s.value + '"' + (s.value === 'close' ? ' selected' : '') + '>' + s.label + '</option>').join('')}
                    </select>
                </div>
            </div>
            <div class="row g-2 mt-2">
                <div class="col-md-3 col-sm-6">
                    <label class="form-label small">Threshold Unit</label>
                    <select class="form-select form-select-sm" id="optExitThresholdUnit${n}">
                        <option value="percent">Percent (%)</option>
                        <option value="dollar">Dollar ($)</option>
                    </select>
                </div>
                <div class="col-md-3 col-sm-6">
                    <label class="form-label small">Threshold Value</label>
                    <input type="number" class="form-control form-control-sm" id="optExitThresholdValue${n}" step="0.01" placeholder="e.g., 2.5">
                </div>
            </div>
        </div>
    `;
    
    container.appendChild(conditionDiv);
    updateOptExitConditionFields(n);
}

function updateOptExitConditionFields(n) {
    var metric = (document.getElementById('optExitMetric' + n) || {}).value || 'current_price';
    var isCurrentPrice = metric === 'current_price';
    var needsWindow = ['sma', 'ema', 'rsi', 'macd'].indexOf(metric) !== -1;
    var showSeries = metric === 'price' || isCurrentPrice || ['sma', 'ema'].indexOf(metric) !== -1;
    
    var el;
    el = document.getElementById('optExitLeftDayGroup' + n); if (el) el.style.display = isCurrentPrice ? 'none' : '';
    el = document.getElementById('optExitLeftCandleTypeGroup' + n); if (el) el.style.display = isCurrentPrice ? 'none' : '';
    el = document.getElementById('optExitLeftMultiplierGroup' + n); if (el) el.style.display = isCurrentPrice ? 'none' : '';
    el = document.getElementById('optExitLeftWindowGroup' + n); if (el) el.style.display = needsWindow ? '' : 'none';
    el = document.getElementById('optExitLeftSeriesTypeGroup' + n); if (el) el.style.display = (showSeries && !isCurrentPrice) ? '' : 'none';
    
    var windowLabel = document.getElementById('optExitLeftWindowLabel' + n);
    if (windowLabel) windowLabel.textContent = (metric === 'macd') ? 'Signal' : 'Window';
    var seriesLabel = document.getElementById('optExitLeftSeriesLabel' + n);
    if (seriesLabel) seriesLabel.textContent = (metric === 'price' || isCurrentPrice) ? 'Price Type' : 'Series Type';
    
    updateOptExitComparatorOptions(n);
}

function updateOptExitComparatorOptions(n) {
    var metric = (document.getElementById('optExitMetric' + n) || {}).value || 'current_price';
    var comp = document.getElementById('optExitComparator' + n);
    if (!comp) return;
    var opts = '<option value="value">Value</option>';
    if (metric !== 'rsi' && metric !== 'macd') {
        opts += '<option value="compare_price">Compare Price</option>';
        opts += '<option value="compare_sma">Compare SMA</option>';
        opts += '<option value="compare_ema">Compare EMA</option>';
    }
    comp.innerHTML = opts;
    updateOptExitRightSide(n);
}

function updateOptExitRightSide(n) {
    var comp = (document.getElementById('optExitComparator' + n) || {}).value || 'value';
    var operator = (document.getElementById('optExitOperator' + n) || {}).value || '>';
    var rightSide = document.getElementById('optExitRightSide' + n);
    var valueGroup = document.getElementById('optExitValueInputGroup' + n);
    var isEquals = (operator === '==');
    
    if (comp === 'value') {
        if (rightSide) rightSide.style.display = 'none';
        if (valueGroup) valueGroup.style.display = '';
    } else {
        if (rightSide) rightSide.style.display = 'block';
        if (valueGroup) valueGroup.style.display = 'none';
        
        var isComparePrice = comp === 'compare_price';
        var el;
        el = document.getElementById('optExitRightWindowGroup' + n); if (el) el.style.display = isComparePrice ? 'none' : '';
        el = document.getElementById('optExitRightSeriesTypeGroup' + n); if (el) el.style.display = isComparePrice ? '' : 'none';
        
        var thresholdUnit = document.getElementById('optExitThresholdUnit' + n);
        var thresholdValue = document.getElementById('optExitThresholdValue' + n);
        if (thresholdUnit) thresholdUnit.closest('.col-md-3').style.display = isEquals ? 'none' : '';
        if (thresholdValue) thresholdValue.closest('.col-md-3').style.display = isEquals ? 'none' : '';
    }
}

function removeOptExitCondition(id) {
    var element = document.getElementById('optExitCondition' + id);
    if (element) {
        element.remove();
        optExitConditionCount--;
        renumberOptExitConditions();
    }
}

function renumberOptExitConditions() {
    var conditions = document.querySelectorAll('.opt-exit-condition-row');
    optExitConditionCount = conditions.length;
    conditions.forEach(function(cond, index) {
        var label = cond.querySelector('strong.text-muted');
        if (label) label.textContent = 'Exit Condition ' + (index + 1);
    });
}

function collectOptExitConditions() {
    var conditions = [];
    var container = document.getElementById('optExitConditionsContainer');
    if (!container) return conditions;
    
    var conditionRows = container.querySelectorAll('.opt-exit-condition-row');
    conditionRows.forEach(function(row) {
        var id = row.id.replace('optExitCondition', '');
        var metric = (document.getElementById('optExitMetric' + id) || {}).value || 'current_price';
        var comparator = (document.getElementById('optExitComparator' + id) || {}).value || 'value';
        
        var effectiveMetric = metric === 'current_price' ? 'price' : metric;
        var condition = {
            metric: effectiveMetric,
            left: {
                day: metric === 'current_price' ? '0' : ((document.getElementById('optExitLeftDay' + id) || {}).value || '0'),
                candle_type: metric === 'current_price' ? 'minute' : ((document.getElementById('optExitLeftCandleType' + id) || {}).value || 'minute'),
                multiplier: metric === 'current_price' ? 1 : (parseInt((document.getElementById('optExitLeftMultiplier' + id) || {}).value) || 1),
                series_type: metric === 'current_price' ? 'vwap' : ((document.getElementById('optExitLeftSeriesType' + id) || {}).value || 'close')
            },
            operator: (document.getElementById('optExitOperator' + id) || {}).value || '>',
            comparator: comparator
        };
        
        if (metric === 'sma' || metric === 'ema' || metric === 'rsi') {
            condition.left.window = parseInt((document.getElementById('optExitLeftWindow' + id) || {}).value) || 14;
        }
        
        if (comparator === 'value') {
            var rawVal = (document.getElementById('optExitCompareValue' + id) || {}).value;
            condition.compare_value = rawVal !== '' && rawVal !== undefined ? parseFloat(rawVal) : null;
        } else {
            condition.right = {
                day: (document.getElementById('optExitRightDay' + id) || {}).value || '0',
                candle_type: (document.getElementById('optExitRightCandleType' + id) || {}).value || 'minute',
                multiplier: parseInt((document.getElementById('optExitRightMultiplier' + id) || {}).value) || 1,
                series_type: (document.getElementById('optExitRightSeriesType' + id) || {}).value || 'close'
            };
            
            if (comparator === 'compare_sma' || comparator === 'compare_ema') {
                condition.right.window = parseInt((document.getElementById('optExitRightWindow' + id) || {}).value) || 14;
            }
            
            condition.threshold = {
                unit: (document.getElementById('optExitThresholdUnit' + id) || {}).value || 'percent',
                value: parseFloat((document.getElementById('optExitThresholdValue' + id) || {}).value) || 0
            };
        }
        
        conditions.push(condition);
    });
    
    return conditions;
}

// =============================================================================
// ENTRY PRICE CONDITIONS BUILDER
// =============================================================================

function addPriceCondition() {
    const container = document.getElementById('priceConditionsContainer');
    if (!container) return;
    
    // Limit to max 3 conditions
    const existingConditions = container.querySelectorAll('.price-condition-row');
    if (existingConditions.length >= 3) {
        appAlert('Maximum of 3 price conditions allowed.');
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
                <div class="col-md-4 col-sm-6">
                    <label class="form-label small">Metric</label>
                    <select class="form-select form-select-sm" id="metric${conditionId}" onchange="updateConditionFields(${conditionId})">
                        ${METRICS.map(m => `<option value="${m.value}">${m.label}</option>`).join('')}
                    </select>
                </div>
                <div class="col-md-4 col-sm-6" id="leftDayGroup${conditionId}">
                    <label class="form-label small">Day</label>
                    <select class="form-select form-select-sm" id="leftDay${conditionId}" onchange="handleCandleTypeChange(${conditionId})">
                        ${DAY_OPTIONS.map(d => `<option value="${d.value}">${d.label}</option>`).join('')}
                    </select>
                </div>
                <div class="col-md-4 col-sm-6" id="leftCandleTypeGroup${conditionId}">
                    <label class="form-label small">Candle Type</label>
                    <select class="form-select form-select-sm" id="leftCandleType${conditionId}" onchange="handleCandleTypeChange(${conditionId})">
                        ${CANDLE_TYPES.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
                    </select>
                </div>
                <div class="col-md-3 col-sm-6" id="leftMultiplierGroup${conditionId}">
                    <label class="form-label small">Multiplier</label>
                    <input type="number" class="form-control form-control-sm" id="leftMultiplier${conditionId}" value="1" min="1" max="60">
                </div>
                <div class="col-md-3 col-sm-6" id="leftWindowGroup${conditionId}">
                    <label class="form-label small" id="leftWindowLabel${conditionId}">Window</label>
                    <input type="number" class="form-control form-control-sm" id="leftWindow${conditionId}" value="14" min="1">
                </div>
                <div class="col-md-3 col-sm-6" id="leftSeriesTypeGroup${conditionId}">
                    <label class="form-label small" id="leftSeriesLabel${conditionId}">Series Type</label>
                    <select class="form-select form-select-sm" id="leftSeriesType${conditionId}">
                        ${SERIES_TYPES.map(s => `<option value="${s.value}"${s.value === 'close' ? ' selected' : ''}>${s.label}</option>`).join('')}
                    </select>
                </div>
                <!-- MACD specific fields -->
                <div class="col-md-3 col-sm-6" id="leftMacdShortGroup${conditionId}" style="display: none;">
                    <label class="form-label small">Short Window</label>
                    <input type="number" class="form-control form-control-sm" id="leftMacdShort${conditionId}" value="12" min="1">
                </div>
                <div class="col-md-3 col-sm-6" id="leftMacdLongGroup${conditionId}" style="display: none;">
                    <label class="form-label small">Long Window</label>
                    <input type="number" class="form-control form-control-sm" id="leftMacdLong${conditionId}" value="26" min="1">
                </div>
                <div class="col-md-3 col-sm-6" id="leftMacdSignalGroup${conditionId}" style="display: none;">
                    <label class="form-label small">Signal Window</label>
                    <input type="number" class="form-control form-control-sm" id="leftMacdSignal${conditionId}" value="9" min="1">
                </div>
                <!-- MACD Component selector -->
                <div class="col-md-3 col-sm-6" id="leftMacdComponentGroup${conditionId}" style="display: none;">
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
                    <select class="form-select" id="operator${conditionId}" onchange="updateRightSideVisibility(${conditionId})">
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
                <div class="col-md-4 col-sm-6">
                    <label class="form-label small">Day</label>
                    <select class="form-select form-select-sm" id="rightDay${conditionId}" onchange="handleCandleTypeChange(${conditionId})">
                        ${DAY_OPTIONS.map(d => `<option value="${d.value}">${d.label}</option>`).join('')}
                    </select>
                </div>
                <div class="col-md-4 col-sm-6">
                    <label class="form-label small">Candle Type</label>
                    <select class="form-select form-select-sm" id="rightCandleType${conditionId}" onchange="handleCandleTypeChange(${conditionId})">
                        ${CANDLE_TYPES.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
                    </select>
                </div>
                <div class="col-md-3 col-sm-6" id="rightMultiplierGroup${conditionId}">
                    <label class="form-label small">Multiplier</label>
                    <input type="number" class="form-control form-control-sm" id="rightMultiplier${conditionId}" value="1" min="1" max="60">
                </div>
                <div class="col-md-3 col-sm-6" id="rightWindowGroup${conditionId}">
                    <label class="form-label small">Window</label>
                    <input type="number" class="form-control form-control-sm" id="rightWindow${conditionId}" value="14" min="1">
                </div>
                <div class="col-md-3 col-sm-6" id="rightSeriesTypeGroup${conditionId}">
                    <label class="form-label small" id="rightSeriesLabel${conditionId}">Series Type</label>
                    <select class="form-select form-select-sm" id="rightSeriesType${conditionId}">
                        ${SERIES_TYPES.map(s => `<option value="${s.value}"${s.value === 'close' ? ' selected' : ''}>${s.label}</option>`).join('')}
                    </select>
                </div>
                <!-- MACD specific fields for right side -->
                <div class="col-md-3 col-sm-6" id="rightMacdShortGroup${conditionId}" style="display: none;">
                    <label class="form-label small">Short Window</label>
                    <input type="number" class="form-control form-control-sm" id="rightMacdShort${conditionId}" value="12" min="1">
                </div>
                <div class="col-md-3 col-sm-6" id="rightMacdLongGroup${conditionId}" style="display: none;">
                    <label class="form-label small">Long Window</label>
                    <input type="number" class="form-control form-control-sm" id="rightMacdLong${conditionId}" value="26" min="1">
                </div>
                <div class="col-md-3 col-sm-6" id="rightMacdSignalGroup${conditionId}" style="display: none;">
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
    
    var leftDayGroup = document.getElementById(`leftDayGroup${conditionId}`);
    var leftCandleTypeGroup = document.getElementById(`leftCandleTypeGroup${conditionId}`);
    var leftMultiplierGroup = document.getElementById(`leftMultiplierGroup${conditionId}`);

    // Update based on metric
    switch (metric) {
        case 'current_price':
            if (leftDayGroup) leftDayGroup.style.display = 'none';
            if (leftCandleTypeGroup) leftCandleTypeGroup.style.display = 'none';
            if (leftMultiplierGroup) leftMultiplierGroup.style.display = 'none';
            if (leftWindowGroup) leftWindowGroup.style.display = 'none';
            if (leftSeriesTypeGroup) leftSeriesTypeGroup.style.display = 'none';
            if (document.getElementById(`leftDay${conditionId}`)) document.getElementById(`leftDay${conditionId}`).value = '0';
            if (document.getElementById(`leftCandleType${conditionId}`)) document.getElementById(`leftCandleType${conditionId}`).value = 'minute';
            if (document.getElementById(`leftSeriesType${conditionId}`)) document.getElementById(`leftSeriesType${conditionId}`).value = 'vwap';
            updateComparatorOptions(conditionId, ['value', 'compare_price', 'compare_sma', 'compare_ema']);
            break;
        case 'price':
            if (leftDayGroup) leftDayGroup.style.display = 'block';
            if (leftCandleTypeGroup) leftCandleTypeGroup.style.display = 'block';
            if (leftMultiplierGroup) leftMultiplierGroup.style.display = 'block';
            if (leftWindowGroup) leftWindowGroup.style.display = 'none';
            if (leftSeriesTypeGroup) leftSeriesTypeGroup.style.display = 'block';
            if (leftSeriesLabel) leftSeriesLabel.textContent = 'Price Type';
            updateComparatorOptions(conditionId, ['value', 'compare_price', 'compare_sma', 'compare_ema']);
            break;
            
        case 'sma':
        case 'ema':
            if (leftDayGroup) leftDayGroup.style.display = 'block';
            if (leftCandleTypeGroup) leftCandleTypeGroup.style.display = 'block';
            if (leftMultiplierGroup) leftMultiplierGroup.style.display = 'block';
            if (leftWindowGroup) leftWindowGroup.style.display = 'block';
            if (leftWindowLabel) leftWindowLabel.textContent = 'Window';
            if (leftSeriesTypeGroup) leftSeriesTypeGroup.style.display = 'block';
            if (leftSeriesLabel) leftSeriesLabel.textContent = 'Series Type';
            updateComparatorOptions(conditionId, ['value', 'compare_price', 'compare_sma', 'compare_ema']);
            break;
            
        case 'rsi':
            if (leftDayGroup) leftDayGroup.style.display = 'block';
            if (leftCandleTypeGroup) leftCandleTypeGroup.style.display = 'block';
            if (leftMultiplierGroup) leftMultiplierGroup.style.display = 'block';
            if (leftWindowGroup) leftWindowGroup.style.display = 'block';
            if (leftWindowLabel) leftWindowLabel.textContent = 'Window';
            if (leftSeriesTypeGroup) leftSeriesTypeGroup.style.display = 'block';
            if (leftSeriesLabel) leftSeriesLabel.textContent = 'Series Type';
            updateComparatorOptions(conditionId, ['value', 'compare_rsi']);
            break;
            
        case 'macd':
            if (leftDayGroup) leftDayGroup.style.display = 'block';
            if (leftCandleTypeGroup) leftCandleTypeGroup.style.display = 'block';
            if (leftMultiplierGroup) leftMultiplierGroup.style.display = 'block';
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
    enforceDayCandleSeriesRestriction('left', conditionId);
    enforceDayCandleSeriesRestriction('right', conditionId);
    checkDayCandleConditions();
}

function enforceDayCandleSeriesRestriction(side, conditionId) {
    var candleEl = document.getElementById(side + 'CandleType' + conditionId);
    var dayEl = document.getElementById(side + 'Day' + conditionId);
    var seriesEl = document.getElementById(side + 'SeriesType' + conditionId);
    if (!candleEl || !seriesEl) return;

    var candleType = candleEl.value;
    var dayOffset = parseInt(dayEl ? dayEl.value : '-1') || 0;
    var nonMinute = ['day', 'week', 'month', 'quarter', 'year'];

    if (nonMinute.indexOf(candleType) !== -1 && dayOffset === 0) {
        seriesEl.innerHTML = '<option value="open" selected>Open</option>';
    } else {
        var prev = seriesEl.value;
        seriesEl.innerHTML = SERIES_TYPES.map(function(s) {
            return '<option value="' + s.value + '"' + (s.value === prev ? ' selected' : '') + '>' + s.label + '</option>';
        }).join('');
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
    const operator = document.getElementById(`operator${conditionId}`)?.value || '>';
    const rightSide = document.getElementById(`rightSide${conditionId}`);
    const valueInputGroup = document.getElementById(`valueInputGroup${conditionId}`);
    const metric = document.getElementById(`metric${conditionId}`)?.value;
    const isEquals = (operator === '==' || operator === '=');
    
    if (!rightSide || !valueInputGroup) return;
    
    if (comparator === 'value') {
        rightSide.style.display = 'none';
        valueInputGroup.style.display = 'block';
    } else {
        rightSide.style.display = 'block';
        valueInputGroup.style.display = 'none';
        
        // Update right side fields based on comparator type
        updateRightSideFields(conditionId, comparator);
        
        var thresholdUnit = document.getElementById(`thresholdUnit${conditionId}`);
        var thresholdValue = document.getElementById(`thresholdValue${conditionId}`);
        var threshUnitCol = thresholdUnit ? thresholdUnit.closest('.col-md-3') : null;
        var threshValCol = thresholdValue ? thresholdValue.closest('.col-md-3') : null;
        if (threshUnitCol) threshUnitCol.style.display = isEquals ? 'none' : '';
        if (threshValCol) threshValCol.style.display = isEquals ? 'none' : '';
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
        
        var effectiveMetric = metric === 'current_price' ? 'price' : metric;
        const condition = {
            metric: effectiveMetric,
            left: {
                day: metric === 'current_price' ? '0' : (document.getElementById(`leftDay${id}`)?.value || '0'),
                candle_type: metric === 'current_price' ? 'minute' : (document.getElementById(`leftCandleType${id}`)?.value || 'minute'),
                multiplier: metric === 'current_price' ? 1 : (parseInt(document.getElementById(`leftMultiplier${id}`)?.value) || 1),
                series_type: metric === 'current_price' ? 'vwap' : (document.getElementById(`leftSeriesType${id}`)?.value || 'close')
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
                multiplier: parseInt(document.getElementById(`rightMultiplier${id}`)?.value) || 1,
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
            }
        } else {
            // Retry if isAuthenticated function not yet available
            setTimeout(applyLoginOverlayIfNeeded, 100);
        }
    }
    setTimeout(applyLoginOverlayIfNeeded, 500);

    function applyTierRestrictions() {
        if (typeof TierRestrictions === 'undefined') { setTimeout(applyTierRestrictions, 200); return; }
        var symbolEl = document.getElementById('symbol');
        var startEl = document.getElementById('startDate');
        var endEl = document.getElementById('endDate');
        var dteEl = document.getElementById('dte');
        TierRestrictions.applyDateConstraints(startEl, endEl);
        TierRestrictions.enforceDTEMax(dteEl);
        if (TierRestrictions.isFree()) {
            var customRadio = document.querySelector('#backtesterPage input[name="optionsEntryType"][value="custom"]');
            if (customRadio) { customRadio.disabled = true; }
            var optCustomToggle = document.querySelector('#backtesterPage .bt-toggle-btn[data-val="custom"]');
            if (optCustomToggle) { optCustomToggle.disabled = true; optCustomToggle.style.opacity = '0.5'; optCustomToggle.style.cursor = 'not-allowed'; optCustomToggle.title = 'Custom builder requires Standard or Premium plan'; }
        }
        if (symbolEl) {
            symbolEl.addEventListener('change', function() {
                var err = TierRestrictions.getSymbolError(symbolEl.value);
                var warn = document.getElementById('tierSymbolWarning');
                if (!warn) { warn = document.createElement('div'); warn.id = 'tierSymbolWarning'; warn.style.cssText = 'color:#dc3545;font-size:12px;margin-top:4px;'; symbolEl.parentElement.appendChild(warn); }
                warn.textContent = err || '';
            });
        }
        if (dteEl) {
            dteEl.addEventListener('change', function() {
                var max = TierRestrictions.getMaxDTE();
                if (max !== null && parseInt(dteEl.value) > max) { dteEl.value = max; }
            });
        }
    }
    setTimeout(applyTierRestrictions, 600);

    setupFormControls();
    setupStrategySelection();
    
    var ivCheckbox = document.getElementById('ivConditionEnabled');
    if (ivCheckbox) {
        ivCheckbox.addEventListener('change', function() {
            var params = document.getElementById('ivConditionParams');
            if (params) params.style.display = this.checked ? 'block' : 'none';
        });
    }
    
    var loadingDiv = document.getElementById('backtestLoading');
    if (loadingDiv) loadingDiv.style.display = 'none';
    var errorDiv = document.getElementById('backtestError');
    if (errorDiv) errorDiv.style.display = 'none';
    var form = document.getElementById('backtestForm');
    if (form) form.dataset.isSubmitting = 'false';
    
    // Check for running backtests and show notification
    checkForRunningBacktests();
    
    // Load last backtest result if available
    loadLastBacktestResult();
    
    var pendingTemplate = sessionStorage.getItem('optionsBacktestUseTemplate');
    if (pendingTemplate) {
        try {
            var config = JSON.parse(pendingTemplate);
            sessionStorage.removeItem('optionsBacktestUseTemplate');
            applyOptionsConfig(config);
            console.log('Applied options config from Use Template');
        } catch (e) {
            console.error('Error applying Use Template config:', e);
        }
    }
    
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
            document.getElementById('takeProfitPctGroup').style.display = isPct ? 'flex' : 'none';
            document.getElementById('takeProfitDollarGroup').style.display = isPct ? 'none' : 'flex';
            if (document.getElementById('tpPctBtn')) document.getElementById('tpPctBtn').classList.toggle('on', isPct);
            if (document.getElementById('tpDollarBtn')) document.getElementById('tpDollarBtn').classList.toggle('on', !isPct);
        });
    });
    
    // Stop Loss Type Toggle
    document.querySelectorAll('input[name="stopLossType"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const isPct = e.target.value === 'P';
            document.getElementById('stopLossPctGroup').style.display = isPct ? 'flex' : 'none';
            document.getElementById('stopLossDollarGroup').style.display = isPct ? 'none' : 'flex';
            if (document.getElementById('slPctBtn')) document.getElementById('slPctBtn').classList.toggle('on', isPct);
            if (document.getElementById('slDollarBtn')) document.getElementById('slDollarBtn').classList.toggle('on', !isPct);
        });
    });
    
    // Allocation Type Toggle
    document.querySelectorAll('input[name="allocationType"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const type = e.target.value;
            document.getElementById('allocationPctGroup').style.display = type === '1' ? 'flex' : 'none';
            document.getElementById('allocationContractsGroup').style.display = type === '2' ? 'block' : 'none';
            document.getElementById('allocationFixedGroup').style.display = type === '3' ? 'block' : 'none';
            document.querySelectorAll('.alloc-type-btn').forEach(b => b.classList.toggle('on', b.dataset.alloc === type));
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
        const dteInput = document.getElementById('dte');
        const dteCalendarNotice = document.getElementById('dteCalendarNotice');
        
        if (strategy) {
            currentStrategy = strategy;
            
            // Show/hide wing configuration for Iron strategies
            const isIronStrategy = strategy.includes('Iron');
            if (wingConfigSection) wingConfigSection.style.display = isIronStrategy ? 'block' : 'none';
            
            // Gray out global DTE for calendar/diagonal strategies
            const isCalDiag = isCalendarDiagonalStrategy(strategy);
            if (dteInput) {
                dteInput.disabled = isCalDiag;
                dteInput.style.opacity = isCalDiag ? '0.5' : '1';
            }
            if (dteCalendarNotice) {
                dteCalendarNotice.style.display = isCalDiag ? 'block' : 'none';
            }
            
            // Update leg configuration title
            if (legConfigTitle) legConfigTitle.textContent = `LEG CONFIGURATION - ${strategy}`;
            
            // Build leg configuration UI
            buildLegConfiguration(strategy);
        } else {
            // Reset if no strategy selected
            if (wingConfigSection) wingConfigSection.style.display = 'none';
            if (dteInput) { dteInput.disabled = false; dteInput.style.opacity = '1'; }
            if (dteCalendarNotice) dteCalendarNotice.style.display = 'none';
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
        let optionsHTML = `
            <option value="">-- Select Method --</option>
            <option value="mid_price">1. Mid Price Range (specify min/max option price)</option>
            <option value="pct_underlying">2. % Distance from Underlying</option>
            <option value="dollar_underlying">3. $ Distance from Underlying</option>
        `;
        if (legDefinitions.length > 1) {
            optionsHTML += `
            <option value="pct_leg">4. % Distance from Another Leg</option>
            <option value="dollar_leg">5. $ Distance from Another Leg</option>
            `;
        }
        optionsHTML += `
            <option value="delta">${legDefinitions.length > 1 ? '6' : '4'}. Delta-based Strike Selection</option>
            <option value="orb_breakout">${legDefinitions.length > 1 ? '7' : '5'}. ORB Breakout Strike Selection</option>
        `;
        
        const dteFieldHTML = leg.dte_label ? `
                <div class="form-group" style="margin-top:8px; padding:8px 12px; background:#e8f4fd; border:1px solid #b8daff; border-radius:6px;">
                    <label style="font-weight:600; color:#004085;"><i class="fas fa-calendar-alt"></i> ${leg.dte_label}:</label>
                    <input type="number" class="leg-dte-input" data-leg-index="${index}" min="0" value="${leg.position === 'long' ? 30 : 7}" style="width:80px; display:inline-block; margin-left:8px;">
                    <span style="font-size:11px; color:#6c757d; margin-left:6px;">business days</span>
                </div>
        ` : '';

        html += `
            <div class="leg-config-card" id="legCard${index}">
                <div class="leg-header">
                    <span class="leg-title">Leg ${index + 1}: ${leg.name}</span>
                    <span class="leg-badge">${leg.type === 'C' ? 'Call' : 'Put'} - ${leg.position}</span>
                </div>
                ${dteFieldHTML}
                
                <div class="form-group">
                    <label>→ Select configuration method:</label>
                    <select class="leg-method-select" data-leg-index="${index}">
                        ${optionsHTML}
                    </select>
                </div>
                
                <div id="legParams${index}" class="leg-params-container">
                </div>
            </div>
        `;
    });
    
    html += '<div id="legStrikeWarning" class="alert alert-danger mt-2" style="display:none;"></div>';
    container.innerHTML = html;
    
    document.querySelectorAll('.leg-method-select').forEach(select => {
        select.addEventListener('change', handleLegMethodChange);
    });
}

function runInlineLegValidation() {
    const warningDiv = document.getElementById('legStrikeWarning');
    if (!warningDiv) return;
    const strategy = document.getElementById('strategy')?.value;
    if (!strategy) { warningDiv.style.display = 'none'; return; }
    const legDefs = getStrategyLegs(strategy);
    if (legDefs.length < 2) { warningDiv.style.display = 'none'; return; }

    const legsData = [];
    for (let i = 0; i < legDefs.length; i++) {
        const methodSel = document.querySelector(`.leg-method-select[data-leg-index="${i}"]`);
        if (!methodSel) continue;
        const method = methodSel.value;
        const container = document.getElementById(`legParams${i}`);
        if (!container) continue;
        const params = {};
        container.querySelectorAll('.leg-param').forEach(inp => {
            params[inp.dataset.param] = inp.type === 'number' ? parseFloat(inp.value) : inp.value;
        });
        legsData.push({
            type: legDefs[i].type,
            position: legDefs[i].position,
            config_type: method,
            params: params
        });
    }

    const result = validateStrikeConfiguration(strategy, legsData);
    if (!result.valid) {
        warningDiv.textContent = result.error;
        warningDiv.style.display = 'block';
    } else {
        warningDiv.style.display = 'none';
    }
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
            
        case 'orb_breakout':
            html = `
                <div style="margin-bottom:10px; padding:8px 12px; background:#fff8e1; border:1px solid #ffe082; border-radius:6px;">
                    <small style="color:#795548; font-weight:600;">⏰ ORB Breakout: Strike is set relative to the Opening Range High or Low. Entry must occur <em>after</em> the ORB period ends.</small>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label>ORB Period:</label>
                        <select class="leg-param orb-param" data-param="orb_period" data-leg-index="${legIndex}">
                            <option value="15">15 min &nbsp;(9:30–9:45)</option>
                            <option value="30">30 min &nbsp;(9:30–10:00)</option>
                            <option value="60" selected>60 min &nbsp;(9:30–10:30)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>ORB Level:</label>
                        <select class="leg-param orb-param" data-param="orb_level" data-leg-index="${legIndex}">
                            <option value="high">High</option>
                            <option value="low" selected>Low</option>
                        </select>
                    </div>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Direction:</label>
                        <select class="leg-param orb-param" data-param="direction" data-leg-index="${legIndex}">
                            <option value="above" ${defaultDirection === 'above' ? 'selected' : ''}>above</option>
                            <option value="below" ${defaultDirection === 'below' ? 'selected' : ''}>below</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Distance:</label>
                        <div style="display:flex; gap:6px; align-items:center;">
                            <input type="number" class="leg-param orb-param" data-param="dist_value" data-leg-index="${legIndex}" step="0.5" min="0" placeholder="1" value="1" style="width:80px;">
                            <select class="leg-param orb-param" data-param="dist_type" data-leg-index="${legIndex}" style="width:70px;">
                                <option value="dollar">$</option>
                                <option value="pct">%</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="form-group" style="margin-top:12px;">
                    <label>Strike selection fallback:</label>
                    <select class="leg-param orb-param" data-param="strike_fallback" data-leg-index="${legIndex}">
                        <option value="closest">Closest (default)</option>
                        <option value="or_higher">Or Higher</option>
                        <option value="or_less">Or Lower</option>
                    </select>
                </div>
                <div id="orbSummary_${legIndex}" style="margin-top:10px; padding:8px 14px; background:#e8f5e9; border:1px solid #a5d6a7; border-radius:6px; font-size:13px; color:#2e7d32; font-weight:600;">
                    <i class="fas fa-info-circle"></i> Strike: <span id="orbSummaryText_${legIndex}">$1 above 60 min low (closest)</span>
                </div>
                <div id="orbEntryWarn_${legIndex}" style="display:none; margin-top:8px; padding:10px 14px; background:#fce4ec; border:1px solid #ef9a9a; border-radius:6px; font-size:13px; color:#c62828; font-weight:600;">
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
    
    paramsContainer.querySelectorAll('.leg-param').forEach(inp => {
        inp.addEventListener('change', runInlineLegValidation);
        inp.addEventListener('input', runInlineLegValidation);
    });
    runInlineLegValidation();

    if (method === 'orb_breakout') {
        const updateOrbSummary = () => {
            const summaryEl = document.getElementById(`orbSummaryText_${legIndex}`);
            if (!summaryEl) return;
            const period = paramsContainer.querySelector('[data-param="orb_period"]')?.value || '60';
            const level = paramsContainer.querySelector('[data-param="orb_level"]')?.value || 'low';
            const direction = paramsContainer.querySelector('[data-param="direction"]')?.value || 'above';
            const distVal = paramsContainer.querySelector('[data-param="dist_value"]')?.value || '1';
            const distType = paramsContainer.querySelector('[data-param="dist_type"]')?.value || 'dollar';
            const fallback = paramsContainer.querySelector('[data-param="strike_fallback"]')?.value || 'closest';
            const distPrefix = distType === 'dollar' ? '$' : '';
            const distSuffix = distType === 'pct' ? '%' : '';
            const fallbackLabels = { closest: 'closest', or_higher: 'or higher', or_less: 'or lower' };
            summaryEl.textContent = `${distPrefix}${distVal}${distSuffix} ${direction} ${period} min ${level} (${fallbackLabels[fallback] || fallback})`;
        };
        const checkOrbEntryTimeConflict = () => {
            const warnEl = document.getElementById(`orbEntryWarn_${legIndex}`);
            if (!warnEl) return;
            const orbMin = parseInt(paramsContainer.querySelector('[data-param="orb_period"]')?.value) || 60;
            const orbEndTotal = 9 * 60 + 30 + orbMin;
            const orbEndH = String(Math.floor(orbEndTotal / 60)).padStart(2, '0');
            const orbEndM = String(orbEndTotal % 60).padStart(2, '0');
            const orbEndStr = orbEndH + ':' + orbEndM;
            const entryEl = document.getElementById('entryTime');
            const entryMaxEl = document.getElementById('entryTimeMax');
            const entryTime = entryEl ? entryEl.value : '';
            const entryCheck = (entryMaxEl && entryMaxEl.value) ? entryMaxEl.value : entryTime;
            if (entryCheck && entryCheck <= orbEndStr) {
                warnEl.style.display = 'block';
                warnEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Entry time <strong>' + entryCheck + '</strong> is before ORB period ends at <strong>' + orbEndStr + '</strong>. All trades will be skipped. Set entry time' + ((entryMaxEl && entryMaxEl.value) ? ' end' : '') + ' after <strong>' + orbEndStr + '</strong>.';
            } else {
                warnEl.style.display = 'none';
            }
        };
        paramsContainer.querySelectorAll('.orb-param').forEach(el => {
            el.addEventListener('change', () => { updateOrbSummary(); checkOrbEntryTimeConflict(); });
            el.addEventListener('input', () => { updateOrbSummary(); checkOrbEntryTimeConflict(); });
        });
        const entryTimeEl = document.getElementById('entryTime');
        const entryTimeMaxEl = document.getElementById('entryTimeMax');
        if (entryTimeEl) entryTimeEl.addEventListener('change', checkOrbEntryTimeConflict);
        if (entryTimeMaxEl) entryTimeMaxEl.addEventListener('change', checkOrbEntryTimeConflict);
        updateOrbSummary();
        checkOrbEntryTimeConflict();
    }

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
        ],
        'Calendar Call Spread': [
            {name: 'Short Call (Near)', type: 'C', position: 'short', dte_label: 'Near-Term DTE'},
            {name: 'Long Call (Far)', type: 'C', position: 'long', dte_label: 'Far-Term DTE'}
        ],
        'Calendar Put Spread': [
            {name: 'Short Put (Near)', type: 'P', position: 'short', dte_label: 'Near-Term DTE'},
            {name: 'Long Put (Far)', type: 'P', position: 'long', dte_label: 'Far-Term DTE'}
        ],
        'Diagonal Call Spread': [
            {name: 'Short Call (Near)', type: 'C', position: 'short', dte_label: 'Near-Term DTE'},
            {name: 'Long Call (Far)', type: 'C', position: 'long', dte_label: 'Far-Term DTE'}
        ],
        'Diagonal Put Spread': [
            {name: 'Short Put (Near)', type: 'P', position: 'short', dte_label: 'Near-Term DTE'},
            {name: 'Long Put (Far)', type: 'P', position: 'long', dte_label: 'Far-Term DTE'}
        ],
        'Double Calendar': [
            {name: 'Short Put (Near)', type: 'P', position: 'short', dte_label: 'Near-Term DTE'},
            {name: 'Long Put (Far)', type: 'P', position: 'long', dte_label: 'Far-Term DTE'},
            {name: 'Short Call (Near)', type: 'C', position: 'short', dte_label: 'Near-Term DTE'},
            {name: 'Long Call (Far)', type: 'C', position: 'long', dte_label: 'Far-Term DTE'}
        ],
        'Double Diagonal': [
            {name: 'Short Put (Near)', type: 'P', position: 'short', dte_label: 'Near-Term DTE'},
            {name: 'Long Put (Far)', type: 'P', position: 'long', dte_label: 'Far-Term DTE'},
            {name: 'Short Call (Near)', type: 'C', position: 'short', dte_label: 'Near-Term DTE'},
            {name: 'Long Call (Far)', type: 'C', position: 'long', dte_label: 'Far-Term DTE'}
        ]
    };
    
    return legMaps[strategy] || [];
}

function isCalendarDiagonalStrategy(strategy) {
    return ['Calendar Call Spread', 'Calendar Put Spread', 'Diagonal Call Spread', 'Diagonal Put Spread', 'Double Calendar', 'Double Diagonal'].includes(strategy);
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
    
    // Check for circular dependencies — identify which legs are stuck in the cycle
    if (sorted.length !== legs.length) {
        const sortedSet = new Set(sorted);
        const cycleLegs = legs
            .filter((_, idx) => !sortedSet.has(idx))
            .map(leg => leg.name);
        return { error: 'circular', cycleLegs };
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

    // Helper: check if legA directly references legB and return direction ('above'/'below'), or null
    function getLegToLegRelation(legA, legB) {
        if ((legA.config_type === 'pct_leg' || legA.config_type === 'dollar_leg') &&
            legA.params && legA.params.reference !== undefined) {
            const refIdx = parseInt(legA.params.reference);
            if (legs[refIdx] === legB) {
                return legA.params.direction; // 'above' or 'below'
            }
        }
        return null;
    }

    // Helper: build a readable leg description for error messages
    function legDesc(leg) {
        if (leg.config_type === 'pct_leg' || leg.config_type === 'dollar_leg') {
            const unit = leg.config_type === 'pct_leg' ? '%' : '$';
            const ref = legs[parseInt(leg.params.reference)];
            return `${leg.params.direction} the ${ref ? ref.name : 'reference leg'} by ${leg.params.pct || leg.params.amount}${unit}`;
        }
        return `${leg.params.direction} by ${leg.params.pct || leg.params.amount}`;
    }

    // Validation rules by strategy
    const rules = {
        'Short Iron Condor': () => {
            const longPut = findLeg('long', 'P');
            const shortPut = findLeg('short', 'P');
            const shortCall = findLeg('short', 'C');
            const longCall = findLeg('long', 'C');

            // Put spread: Long Put must be BELOW Short Put
            if (shortPut && longPut) {
                if (canCompare(shortPut, longPut)) {
                    if (getRelativeStrike(shortPut) <= getRelativeStrike(longPut)) {
                        return { valid: false, error: `Short Iron Condor (put spread): Short Put must be ABOVE Long Put — Short Put ${shortPut.params.direction} ${shortPut.params.pct || shortPut.params.amount}, Long Put ${longPut.params.direction} ${longPut.params.pct || longPut.params.amount}.` };
                    }
                }
                const lpToSp = getLegToLegRelation(longPut, shortPut);
                if (lpToSp === 'above') {
                    return { valid: false, error: `Short Iron Condor (put spread): Long Put is set ABOVE Short Put (${legDesc(longPut)}), but Long Put must be BELOW Short Put.` };
                }
                const spToLp = getLegToLegRelation(shortPut, longPut);
                if (spToLp === 'below') {
                    return { valid: false, error: `Short Iron Condor (put spread): Short Put is set BELOW Long Put (${legDesc(shortPut)}), but Short Put must be ABOVE Long Put.` };
                }
            }

            // Call spread: Long Call must be ABOVE Short Call
            if (shortCall && longCall) {
                if (canCompare(shortCall, longCall)) {
                    if (getRelativeStrike(shortCall) >= getRelativeStrike(longCall)) {
                        return { valid: false, error: `Short Iron Condor (call spread): Short Call must be BELOW Long Call — Short Call ${shortCall.params.direction} ${shortCall.params.pct || shortCall.params.amount}, Long Call ${longCall.params.direction} ${longCall.params.pct || longCall.params.amount}.` };
                    }
                }
                const lcToSc = getLegToLegRelation(longCall, shortCall);
                if (lcToSc === 'below') {
                    return { valid: false, error: `Short Iron Condor (call spread): Long Call is set BELOW Short Call (${legDesc(longCall)}), but Long Call must be ABOVE Short Call.` };
                }
                const scToLc = getLegToLegRelation(shortCall, longCall);
                if (scToLc === 'above') {
                    return { valid: false, error: `Short Iron Condor (call spread): Short Call is set ABOVE Long Call (${legDesc(shortCall)}), but Short Call must be BELOW Long Call.` };
                }
            }

            return {valid: true};
        },

        'Short Iron Butterfly': () => {
            return rules['Short Iron Condor']();
        },

        'Long Iron Condor': () => {
            const longPut = findLeg('long', 'P');
            const shortPut = findLeg('short', 'P');
            const shortCall = findLeg('short', 'C');
            const longCall = findLeg('long', 'C');

            // Put spread: Short Put must be BELOW Long Put
            if (shortPut && longPut) {
                if (canCompare(shortPut, longPut)) {
                    if (getRelativeStrike(shortPut) >= getRelativeStrike(longPut)) {
                        return { valid: false, error: `Long Iron Condor (put spread): Short Put must be BELOW Long Put — Short Put ${shortPut.params.direction} ${shortPut.params.pct || shortPut.params.amount}, Long Put ${longPut.params.direction} ${longPut.params.pct || longPut.params.amount}.` };
                    }
                }
                const lpToSp = getLegToLegRelation(longPut, shortPut);
                if (lpToSp === 'below') {
                    return { valid: false, error: `Long Iron Condor (put spread): Long Put is set BELOW Short Put (${legDesc(longPut)}), but Long Put must be ABOVE Short Put.` };
                }
                const spToLp = getLegToLegRelation(shortPut, longPut);
                if (spToLp === 'above') {
                    return { valid: false, error: `Long Iron Condor (put spread): Short Put is set ABOVE Long Put (${legDesc(shortPut)}), but Short Put must be BELOW Long Put.` };
                }
            }

            // Call spread: Short Call must be ABOVE Long Call
            if (shortCall && longCall) {
                if (canCompare(shortCall, longCall)) {
                    if (getRelativeStrike(shortCall) <= getRelativeStrike(longCall)) {
                        return { valid: false, error: `Long Iron Condor (call spread): Short Call must be ABOVE Long Call — Short Call ${shortCall.params.direction} ${shortCall.params.pct || shortCall.params.amount}, Long Call ${longCall.params.direction} ${longCall.params.pct || longCall.params.amount}.` };
                    }
                }
                const lcToSc = getLegToLegRelation(longCall, shortCall);
                if (lcToSc === 'above') {
                    return { valid: false, error: `Long Iron Condor (call spread): Long Call is set ABOVE Short Call (${legDesc(longCall)}), but Long Call must be BELOW Short Call.` };
                }
                const scToLc = getLegToLegRelation(shortCall, longCall);
                if (scToLc === 'below') {
                    return { valid: false, error: `Long Iron Condor (call spread): Short Call is set BELOW Long Call (${legDesc(shortCall)}), but Short Call must be ABOVE Long Call.` };
                }
            }

            return {valid: true};
        },

        'Long Iron Butterfly': () => {
            return rules['Long Iron Condor']();
        },

        'Short Put Spread': () => {
            const longPut = findLeg('long', 'P');
            const shortPut = findLeg('short', 'P');

            if (shortPut && longPut) {
                if (canCompare(shortPut, longPut)) {
                    if (getRelativeStrike(shortPut) <= getRelativeStrike(longPut)) {
                        return { valid: false, error: `Short Put Spread: Short Put must be ABOVE Long Put — Short Put ${shortPut.params.direction} ${shortPut.params.pct || shortPut.params.amount}, Long Put ${longPut.params.direction} ${longPut.params.pct || longPut.params.amount}.` };
                    }
                }
                const lpToSp = getLegToLegRelation(longPut, shortPut);
                if (lpToSp === 'above') {
                    return { valid: false, error: `Short Put Spread: Long Put is set ABOVE Short Put (${legDesc(longPut)}), but Long Put must be BELOW Short Put.` };
                }
                const spToLp = getLegToLegRelation(shortPut, longPut);
                if (spToLp === 'below') {
                    return { valid: false, error: `Short Put Spread: Short Put is set BELOW Long Put (${legDesc(shortPut)}), but Short Put must be ABOVE Long Put.` };
                }
            }

            return {valid: true};
        },

        'Short Call Spread': () => {
            const longCall = findLeg('long', 'C');
            const shortCall = findLeg('short', 'C');

            if (shortCall && longCall) {
                if (canCompare(shortCall, longCall)) {
                    if (getRelativeStrike(shortCall) >= getRelativeStrike(longCall)) {
                        return { valid: false, error: `Short Call Spread: Short Call must be BELOW Long Call — Short Call ${shortCall.params.direction} ${shortCall.params.pct || shortCall.params.amount}, Long Call ${longCall.params.direction} ${longCall.params.pct || longCall.params.amount}.` };
                    }
                }
                const lcToSc = getLegToLegRelation(longCall, shortCall);
                if (lcToSc === 'below') {
                    return { valid: false, error: `Short Call Spread: Long Call is set BELOW Short Call (${legDesc(longCall)}), but Long Call must be ABOVE Short Call.` };
                }
                const scToLc = getLegToLegRelation(shortCall, longCall);
                if (scToLc === 'above') {
                    return { valid: false, error: `Short Call Spread: Short Call is set ABOVE Long Call (${legDesc(shortCall)}), but Short Call must be BELOW Long Call.` };
                }
            }

            return {valid: true};
        },

        'Long Put Spread': () => {
            const longPut = findLeg('long', 'P');
            const shortPut = findLeg('short', 'P');

            if (longPut && shortPut) {
                if (canCompare(longPut, shortPut)) {
                    if (getRelativeStrike(longPut) >= getRelativeStrike(shortPut)) {
                        return { valid: false, error: `Long Put Spread: Long Put must be BELOW Short Put — Long Put ${longPut.params.direction} ${longPut.params.pct || longPut.params.amount}, Short Put ${shortPut.params.direction} ${shortPut.params.pct || shortPut.params.amount}.` };
                    }
                }
                const lpToSp = getLegToLegRelation(longPut, shortPut);
                if (lpToSp === 'above') {
                    return { valid: false, error: `Long Put Spread: Long Put is set ABOVE Short Put (${legDesc(longPut)}), but Long Put must be BELOW Short Put.` };
                }
                const spToLp = getLegToLegRelation(shortPut, longPut);
                if (spToLp === 'below') {
                    return { valid: false, error: `Long Put Spread: Short Put is set BELOW Long Put (${legDesc(shortPut)}), but Short Put must be ABOVE Long Put.` };
                }
            }

            return {valid: true};
        },

        'Long Call Spread': () => {
            const longCall = findLeg('long', 'C');
            const shortCall = findLeg('short', 'C');

            if (longCall && shortCall) {
                if (canCompare(longCall, shortCall)) {
                    if (getRelativeStrike(longCall) >= getRelativeStrike(shortCall)) {
                        return { valid: false, error: `Long Call Spread: Long Call must be BELOW Short Call — Long Call ${longCall.params.direction} ${longCall.params.pct || longCall.params.amount}, Short Call ${shortCall.params.direction} ${shortCall.params.pct || shortCall.params.amount}.` };
                    }
                }
                const lcToSc = getLegToLegRelation(longCall, shortCall);
                if (lcToSc === 'above') {
                    return { valid: false, error: `Long Call Spread: Long Call is set ABOVE Short Call (${legDesc(longCall)}), but Long Call must be BELOW Short Call.` };
                }
                const scToLc = getLegToLegRelation(shortCall, longCall);
                if (scToLc === 'below') {
                    return { valid: false, error: `Long Call Spread: Short Call is set BELOW Long Call (${legDesc(shortCall)}), but Short Call must be ABOVE Long Call.` };
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
        },
        
        'Calendar Call Spread': () => { return {valid: true}; },
        'Calendar Put Spread': () => { return {valid: true}; },
        'Diagonal Call Spread': () => { return {valid: true}; },
        'Diagonal Put Spread': () => { return {valid: true}; },
        'Double Calendar': () => { return {valid: true}; },
        'Double Diagonal': () => { return {valid: true}; }
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

    let legsHtml = '';
    if (config.legs && config.legs.length > 0) {
        legsHtml = config.legs.map(leg => {
            const methodMap = {'mid_price':'Mid Price','pct_underlying':'% from Underlying','dollar_underlying':'$ from Underlying','delta':'Delta','pct_leg':'% from Leg','dollar_leg':'$ from Leg','orb_breakout':'ORB Breakout'};
            const method = methodMap[leg.config_type] || leg.config_type;
            let paramStr = '';
            if (leg.params) {
                const p = leg.params;
                if (leg.config_type === 'delta') paramStr = `Delta: ${p.target_delta} (${p.method || 'closest'})`;
                else if (leg.config_type === 'mid_price') paramStr = `Range: $${p.min_price || 0} - $${p.max_price || '∞'}`;
                else if (leg.config_type === 'pct_underlying') paramStr = `${p.direction || ''} ${p.pct || 0}%`;
                else if (leg.config_type === 'dollar_underlying') paramStr = `${p.direction || ''} $${p.amount || 0}`;
                else if (leg.config_type === 'pct_leg' || leg.config_type === 'dollar_leg') paramStr = `From ${p.reference_leg || 'Leg'}: ${p.pct || p.amount || 0}${leg.config_type === 'pct_leg' ? '%' : '$'}`;
                else if (leg.config_type === 'orb_breakout') { const dPfx = p.dist_type === 'pct' ? '' : '$'; const dSfx = p.dist_type === 'pct' ? '%' : ''; paramStr = `${dPfx}${p.dist_value}${dSfx} ${p.direction} ${p.orb_period}m ${p.orb_level} (${p.strike_fallback || 'closest'})`; }
            }
            const dteStr = leg.dte !== undefined ? ` (DTE: ${leg.dte})` : '';
            return `<div style="margin-bottom:4px;"><span style="color:#7c3aed; font-weight:600;">${leg.name}:</span> ${leg.position} ${leg.type} — ${method} ${paramStr}${dteStr}</div>`;
        }).join('');
    }

    let conditionsHtml = '<span style="color:#94a3b8;">None</span>';
    const presetNames = {'1':'Premarket Change %','2':'Change %','3':'Gap %','4':'Change-Open %','5':'Velocity'};
    if (config.options_entry_type === 'preset' && config.preset_condition) {
        const condName = presetNames[config.preset_condition] || `Preset #${config.preset_condition}`;
        if (config.preset_condition === '5') {
            conditionsHtml = `${condName}: ${config.preset_operator || '>'} ${config.preset_threshold || 0}% over ${config.velocity_lookback || 5} min`;
        } else {
            conditionsHtml = `${condName}: ${config.preset_operator || '>'} ${config.preset_threshold || 0}%`;
        }
    } else if (config.price_conditions && config.price_conditions.length > 0) {
        conditionsHtml = config.price_conditions.map(function(pc, idx) {
            var metric = (pc.metric || 'price').toUpperCase();
            var left = pc.left || {};
            var leftDay = parseInt(left.day) || 0;
            var leftCandle = left.candle_type || 'minute';
            var leftSeries = left.series_type || 'close';
            var leftWindow = left.window ? '(' + left.window + ')' : '';
            var leftMult = parseInt(left.multiplier) || 1;
            var isCurrentPrice = metric === 'PRICE' && leftDay === 0 && leftCandle === 'minute' && leftSeries === 'vwap';
            var candleFmt = function(candle, mult) {
                var m = parseInt(mult) || 1;
                if (candle === 'minute') return m + 'min';
                if (candle === 'hour') return m + 'hr';
                if (candle === 'day') return m > 1 ? m + 'day' : 'day';
                return candle;
            };
            var leftDesc = isCurrentPrice ? 'Current Price' : (metric + leftWindow + ' ' + leftSeries + ' [day ' + leftDay + ', ' + candleFmt(leftCandle, leftMult) + ']');

            var op = pc.operator || '>';

            var rightDesc = '';
            if (pc.comparator === 'value') {
                rightDesc = String(pc.compare_value != null ? pc.compare_value : '');
            } else {
                var rightMetric = (pc.comparator || '').replace('compare_', '').toUpperCase();
                var right = pc.right || {};
                var rightDay = parseInt(right.day) || 0;
                var rightCandle = right.candle_type || 'minute';
                var rightMult = parseInt(right.multiplier) || 1;
                var rightSeries = right.series_type || 'close';
                var rightWindow = right.window ? '(' + right.window + ')' : '';
                rightDesc = rightMetric + rightWindow + ' ' + rightSeries + ' [day ' + rightDay + ', ' + candleFmt(rightCandle, rightMult) + ']';

                var threshold = pc.threshold || {};
                var threshVal = parseFloat(threshold.value);
                if (threshVal) {
                    var unit = threshold.unit === 'percent' ? '%' : '$';
                    rightDesc += ' ±' + threshVal + unit;
                }
            }

            return '<div style="margin-bottom:4px;">' + leftDesc + ' ' + op + ' ' + rightDesc + '</div>';
        }).join('');
    }

    let exitCondHtml = '<span style="color:#94a3b8;">None</span>';
    if (config.options_exit_cond_type === 'preset' && config.exit_preset_condition) {
        const exitCondName = presetNames[config.exit_preset_condition] || `Preset #${config.exit_preset_condition}`;
        if (config.exit_preset_condition === '5') {
            exitCondHtml = `${exitCondName}: ${config.exit_preset_operator || '>'} ${config.exit_preset_threshold || 0}% over ${config.exit_velocity_lookback || 5} min`;
        } else {
            exitCondHtml = `${exitCondName}: ${config.exit_preset_operator || '>'} ${config.exit_preset_threshold || 0}%`;
        }
    } else if (config.exit_price_conditions && config.exit_price_conditions.length > 0) {
        exitCondHtml = config.exit_price_conditions.map(function(pc) {
            var metric = (pc.metric || 'price').toUpperCase();
            var op = pc.operator || '>';
            var rightDesc = pc.comparator === 'value' ? String(pc.compare_value != null ? pc.compare_value : '') : (pc.comparator || '').replace('compare_', '').toUpperCase();
            return '<div style="margin-bottom:4px;">' + metric + ' ' + op + ' ' + rightDesc + '</div>';
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
            <div style="${valueStyle}">${config.strategy} &nbsp;|&nbsp; ${config.legs && config.legs.some(l => l.dte !== undefined) ? 'Per-leg DTE' : 'DTE: ' + config.dte} &nbsp;|&nbsp; Entry: ${config.entry_time}${config.entry_time_max ? ' - ' + config.entry_time_max : ''}</div>
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
            <div style="${labelStyle}"><i class="fas fa-door-open" style="margin-right:6px;"></i>Exit Conditions</div>
            <div style="${valueStyle}">${exitCondHtml}</div>
        </div>
        ${config.iv_entry_condition ? `<div style="${sectionStyle}">
            <div style="${labelStyle}"><i class="fas fa-chart-area" style="margin-right:6px;"></i>IV% Filter</div>
            <div style="${valueStyle}">ATM IV ${config.iv_entry_condition.operator} ${config.iv_entry_condition.threshold}%</div>
        </div>` : ''}
        <div style="${sectionStyle}">
            <div style="${labelStyle}"><i class="fas fa-coins" style="margin-right:6px;"></i>Position Sizing</div>
            <div style="${valueStyle}">${config.allocation_value} ${allocLabel} &nbsp;|&nbsp; Capital: $${config.starting_capital?.toLocaleString() || '—'}</div>
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

function validateOptionsConfig(config) {
    const errors = [];
    
    if (!config.symbol || config.symbol.length === 0) {
        errors.push('Symbol is required');
    } else if (!/^[A-Za-z0-9.\-^=]{1,12}$/.test(config.symbol)) {
        errors.push('Invalid symbol format');
    }
    
    if (!config.start_date || !config.end_date) {
        errors.push('Start and end dates are required');
    } else {
        const start = new Date(config.start_date);
        const end = new Date(config.end_date);
        if (start >= end) {
            errors.push('Start date must be before end date');
        }
        const diffDays = (end - start) / (1000 * 60 * 60 * 24);
        if (diffDays > 365 * 2) {
            errors.push('Date range cannot exceed 2 years');
        }
        if (end > new Date()) {
            errors.push('End date cannot be in the future');
        }
    }
    
    if (!config.entry_time) {
        errors.push('Entry time is required');
    } else if (config.entry_time < '09:30' || config.entry_time > '16:00') {
        errors.push('Entry time must be between 09:30 and 16:00');
    }
    if (config.entry_time_max && config.entry_time_max <= config.entry_time) {
        errors.push('Entry time end must be after entry time start');
    }
    
    if (config.dte < 0) {
        errors.push('DTE cannot be negative');
    }
    
    if (!config.strategy) {
        errors.push('Strategy is required');
    }
    
    if (!config.starting_capital || config.starting_capital < 1000) {
        errors.push('Starting capital must be at least $1,000');
    }
    
    if (!config.legs || config.legs.length === 0) {
        errors.push('At least one leg must be configured');
    } else {
        for (const leg of config.legs) {
            if (!leg.config_type) {
                errors.push(`${leg.name}: Strike method is required`);
            }
            if (leg.config_type === 'delta' && leg.params) {
                const delta = leg.params.target_delta;
                if (delta === undefined || delta === null || delta === '' || Math.abs(delta) > 1) {
                    errors.push(`${leg.name}: Delta must be between -1 and 1`);
                }
            }
            if ((leg.config_type === 'pct_leg' || leg.config_type === 'dollar_leg') && leg.params) {
                if (leg.params.reference === undefined || leg.params.reference === '') {
                    errors.push(`${leg.name}: Reference leg is required for leg-to-leg method`);
                }
                const refIdx = parseInt(leg.params.reference);
                if (refIdx === leg.original_index) {
                    errors.push(`${leg.name}: Cannot reference itself as the reference leg`);
                }
            }
            if (leg.dte !== undefined && (isNaN(leg.dte) || leg.dte < 0)) {
                errors.push(`${leg.name}: DTE must be 0 or greater`);
            }
            if (leg.config_type === 'orb_breakout' && leg.params && config.entry_time) {
                const orbMin = parseInt(leg.params.orb_period) || 60;
                const orbEndH = Math.floor((9 * 60 + 30 + orbMin) / 60);
                const orbEndM = (9 * 60 + 30 + orbMin) % 60;
                const orbEndStr = String(orbEndH).padStart(2, '0') + ':' + String(orbEndM).padStart(2, '0');
                const entryToCheck = config.entry_time_max || config.entry_time;
                if (entryToCheck <= orbEndStr) {
                    errors.push(`${leg.name}: ORB Breakout requires entry time after ${orbEndStr} for a ${orbMin}-min ORB period. Current entry time${config.entry_time_max ? ' end' : ''} is ${entryToCheck}.`);
                }
            }
        }
        
        if (isCalendarDiagonalStrategy(config.strategy)) {
            const shortLegs = config.legs.filter(l => l.position === 'short');
            const longLegs = config.legs.filter(l => l.position === 'long');
            for (const shortLeg of shortLegs) {
                for (const longLeg of longLegs) {
                    if (shortLeg.dte !== undefined && longLeg.dte !== undefined) {
                        if (shortLeg.dte >= longLeg.dte) {
                            errors.push(`Near-term DTE (${shortLeg.dte}) must be less than far-term DTE (${longLeg.dte}) for ${config.strategy}`);
                        }
                    }
                }
            }
        }
    }
    
    if (config.allocation_type === 'pct' && (!config.allocation_value || isNaN(config.allocation_value) || config.allocation_value <= 0 || config.allocation_value > 100)) {
        errors.push('Percentage of capital is required and must be between 1 and 100');
    }
    if (config.allocation_type === 'contracts' && (!config.allocation_value || isNaN(config.allocation_value) || config.allocation_value < 1)) {
        errors.push('Number of contracts is required and must be at least 1');
    }
    if (config.allocation_type === 'fixed' && (!config.allocation_value || isNaN(config.allocation_value) || config.allocation_value < 100)) {
        errors.push('Fixed allocation is required and must be at least $100');
    }
    
    if (config.avoid_pdt && config.dte === 0) {
        if (config.take_profit_pct || config.take_profit_dollar || config.stop_loss_pct || config.stop_loss_dollar) {
            errors.push('PDT avoidance is ON with 0 DTE — TP/SL will never trigger (trade cannot close same day). Disable PDT avoidance or use DTE > 0.');
        }
    }
    
    if (config.take_profit_pct !== null && config.take_profit_pct <= 0) {
        errors.push('Take profit % must be positive');
    }
    if (config.stop_loss_pct !== null && config.stop_loss_pct <= 0) {
        errors.push('Stop loss % must be positive');
    }
    if (config.take_profit_dollar !== null && config.take_profit_dollar <= 0) {
        errors.push('Take profit $ must be positive');
    }
    if (config.stop_loss_dollar !== null && config.stop_loss_dollar <= 0) {
        errors.push('Stop loss $ must be positive');
    }
    
    if (config.options_entry_type === 'preset') {
        if (!config.preset_operator || config.preset_threshold === undefined || config.preset_threshold === '') {
            errors.push('Preset condition requires an operator and threshold');
        }
        if (config.preset_condition === '5') {
            const lookback = parseInt(config.velocity_lookback);
            if (!lookback || lookback < 1 || lookback > 120) {
                errors.push('Velocity lookback must be between 1 and 120 minutes');
            }
        }
    }
    if (config.options_entry_type === 'custom') {
        if (!config.price_conditions || config.price_conditions.length === 0) {
            errors.push('Custom conditions selected but no conditions added');
        } else {
            for (let i = 0; i < config.price_conditions.length; i++) {
                const pc = config.price_conditions[i];
                const label = `Condition ${i+1}`;
                if (pc.metric === 'macd' && pc.left) {
                    const s = parseInt(pc.left.short_window) || 12;
                    const l = parseInt(pc.left.long_window) || 26;
                    if (s >= l) {
                        errors.push(`${label}: MACD short period must be less than long period`);
                    }
                }
                if (['sma', 'ema'].includes(pc.metric) && pc.left) {
                    const w = parseInt(pc.left.window);
                    if (!w || w < 2 || w > 500) {
                        errors.push(`${label}: ${pc.metric.toUpperCase()} window must be between 2 and 500`);
                    }
                }
                if (pc.metric === 'rsi' && pc.left) {
                    const w = parseInt(pc.left.window);
                    if (!w || w < 2 || w > 100) {
                        errors.push(`${label}: RSI window must be between 2 and 100`);
                    }
                }
                if (pc.comparator === 'value' && pc.compare_value === undefined) {
                    errors.push(`${label}: Compare value is required when comparing to a fixed value`);
                }
                if (pc.comparator !== 'value' && pc.threshold) {
                    if (pc.threshold.unit === 'percent' && pc.comparator === 'compare_rsi') {
                        errors.push(`${label}: Cannot use % threshold when comparing RSI values — use $ (points) instead`);
                    }
                }
            }
        }
    }
    
    if (config.options_exit_cond_type === 'preset' && config.exit_preset_condition) {
        if (!config.exit_preset_operator || config.exit_preset_threshold === undefined || config.exit_preset_threshold === '') {
            errors.push('Exit preset condition requires an operator and threshold');
        }
        if (config.exit_preset_condition === '5') {
            const lookback = parseInt(config.exit_velocity_lookback);
            if (!lookback || lookback < 1 || lookback > 120) {
                errors.push('Exit velocity lookback must be between 1 and 120 minutes');
            }
        }
    }
    if (config.options_exit_cond_type === 'custom') {
        if (!config.exit_price_conditions || config.exit_price_conditions.length === 0) {
            errors.push('Custom exit conditions selected but no conditions added');
        }
    }
    
    if (config.strategy && config.strategy.includes('Iron') && !config.strategy.includes('Butterfly')) {
        const legs = config.legs || [];
        const putLegs = legs.filter(l => l.type === 'Put');
        const callLegs = legs.filter(l => l.type === 'Call');
        if (putLegs.length >= 2 && callLegs.length >= 2) {
            if (config.allow_skewed_wings === false) {
                const allDelta = legs.every(l => l.config_type === 'delta');
                if (!allDelta) {
                    // OK - offset or dollar methods can have balanced or skewed behavior
                }
            }
        }
    }
    
    return errors;
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
        const missing = window._lastMissingFields || [];
        if (missing.length > 0) {
            const fieldLinks = missing.map(f => {
                const scrollJs = `document.getElementById('${f.id}').scrollIntoView({behavior:'smooth',block:'center'});document.getElementById('${f.id}').focus();`;
                return `<a href="#" onclick="event.preventDefault();${scrollJs}" style="color:#fff;font-weight:700;text-decoration:underline;">${f.label}</a>`;
            }).join(', ');
            showError(`The following fields need attention: ${fieldLinks}`);
        }
        // else: collectFormData already showed a specific error internally — don't overwrite it
        form.dataset.isSubmitting = 'false';
        return;
    }

    if (typeof TierRestrictions !== 'undefined') {
        var symErr = TierRestrictions.getSymbolError(config.symbol);
        if (symErr) { showError(symErr); form.dataset.isSubmitting = 'false'; return; }
        if (!TierRestrictions.isDateAllowed(config.start_date) || !TierRestrictions.isDateAllowed(config.end_date)) { var dMin = TierRestrictions.getDateMin(); var dMax = TierRestrictions.getDateMax(); var rangeStr = (dMin && dMax) ? ' Allowed range: ' + dMin + ' to ' + dMax + '.' : ''; showError('Date is outside your plan\'s allowed range.' + rangeStr + ' Upgrade for wider date access.'); form.dataset.isSubmitting = 'false'; return; }
        var maxDTE = TierRestrictions.getMaxDTE();
        if (maxDTE !== null && parseInt(config.dte) > maxDTE) { showError('DTE exceeds your plan limit of ' + maxDTE + ' days.'); form.dataset.isSubmitting = 'false'; return; }
        if (TierRestrictions.isFree() && config.entry_type === 'custom') { showError('Custom entry conditions require a Standard or Premium plan.'); form.dataset.isSubmitting = 'false'; return; }
    }

    const configErrors = validateOptionsConfig(config);
    if (configErrors.length > 0) {
        showError(configErrors.join('<br>'));
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
            const response = await authFetch(`${API_BASE_URL}/backtest/start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(config)
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                if (response.status === 429) {
                    showError(errorData.error || 'A backtest is already running. Please wait for it to finish.');
                    if (loadingDiv) loadingDiv.style.display = 'none';
                    form.dataset.isSubmitting = 'false';
                    checkForRunningBacktests();
                    return;
                }
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
            
            if (loadingDiv) loadingDiv.style.display = 'none';
            form.dataset.isSubmitting = 'false';
            viewOptionsResultDetail(result.backtest_id);
            
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
    const _missingFields = [];
    const _dteRaw = document.getElementById('dte').value;
    if (!symbol) _missingFields.push({label: 'Symbol', id: 'symbol'});
    if (!startDate) _missingFields.push({label: 'Start Date', id: 'startDate'});
    if (!endDate) _missingFields.push({label: 'End Date', id: 'endDate'});
    if (!entryTime) {
        _missingFields.push({label: 'Entry Time', id: 'entryTime'});
    } else if (entryTime < '09:30' || entryTime > '16:00') {
        _missingFields.push({label: 'Entry Time (must be between 09:30 and 16:00)', id: 'entryTime'});
    }
    if (_dteRaw === '' || isNaN(dte)) _missingFields.push({label: 'Days to Expiration (DTE)', id: 'dte'});
    if (!strategy) _missingFields.push({label: 'Strategy', id: 'strategy'});
    if (!startingCapital || isNaN(startingCapital)) _missingFields.push({label: 'Starting Capital', id: 'startingCapital'});
    if (_missingFields.length > 0) {
        window._lastMissingFields = _missingFields;
        return null;
    }
    window._lastMissingFields = [];
    
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
        
        const legData = {
            name: legDefinitions[i].name,
            type: legDefinitions[i].type,
            position: legDefinitions[i].position,
            config_type: method,
            params: params,
            original_index: i
        };
        
        const legDteInput = document.querySelector(`.leg-dte-input[data-leg-index="${i}"]`);
        if (legDteInput) {
            legData.dte = parseInt(legDteInput.value);
        }
        
        legs.push(legData);
    }
    
    // CRITICAL: Sort legs by dependencies
    // Legs that DON'T reference others must come BEFORE legs that DO reference others
    // This ensures calculated_strikes array is built in the right order
    const sortResult = topologicalSortLegs(legs);
    
    if (!sortResult || sortResult.error === 'circular') {
        const cycleNames = sortResult && sortResult.cycleLegs ? sortResult.cycleLegs.join(' ↔ ') : 'unknown legs';
        showError(`Circular reference detected between ${cycleNames}. Each leg must reference a leg that does not reference it back.`);
        return null;
    }
    const sortedLegs = sortResult;
    
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
    
    // Collect IV% entry condition
    const ivCondEnabled = document.getElementById('ivConditionEnabled')?.checked;
    if (ivCondEnabled) {
        config.iv_entry_condition = {
            operator: document.getElementById('ivConditionOperator')?.value || '>',
            threshold: parseFloat(document.getElementById('ivConditionThreshold')?.value || '0')
        };
    }
    
    // Collect entry conditions based on type
    const optionsEntryType = document.querySelector('input[name="optionsEntryType"]:checked')?.value || 'none';
    config.options_entry_type = optionsEntryType;
    
    if (optionsEntryType === 'preset') {
        config.preset_condition = document.getElementById('optionsPresetCondition').value;
        if (config.preset_condition === '5') {
            config.velocity_lookback = document.getElementById('optionsVelocityLookback').value;
            config.preset_operator = document.getElementById('optionsVelocityOperator').value;
            config.preset_threshold = document.getElementById('optionsVelocityThreshold').value;
        } else {
            config.preset_operator = document.getElementById('optionsPresetOperator').value;
            config.preset_threshold = document.getElementById('optionsPresetThreshold').value;
        }
    } else if (optionsEntryType === 'custom') {
        const priceConditions = collectPriceConditions();
        if (priceConditions && priceConditions.length > 0) {
            config.price_conditions = priceConditions;
        }
    }
    
    // Collect exit conditions (signal-based)
    const optExitCondType = document.querySelector('input[name="optExitCondType"]:checked')?.value || 'none';
    config.options_exit_cond_type = optExitCondType;
    
    if (optExitCondType === 'preset') {
        var exitPresetVal = document.getElementById('optExitPresetCondition')?.value || '';
        if (exitPresetVal) {
            config.exit_preset_condition = exitPresetVal;
            if (exitPresetVal === '5') {
                config.exit_velocity_lookback = document.getElementById('optExitVelocityLookback')?.value;
                config.exit_preset_operator = document.getElementById('optExitVelocityOperator')?.value;
                config.exit_preset_threshold = document.getElementById('optExitVelocityThreshold')?.value;
            } else {
                config.exit_preset_operator = document.getElementById('optExitPresetOperator')?.value;
                config.exit_preset_threshold = document.getElementById('optExitPresetThreshold')?.value;
            }
        }
    } else if (optExitCondType === 'custom') {
        var exitPriceConditions = collectOptExitConditions();
        if (exitPriceConditions && exitPriceConditions.length > 0) {
            config.exit_price_conditions = exitPriceConditions;
        }
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
        appAlert('ERROR: equityCurveSection element missing from HTML!');
    }
    
    if (!equityCurveContainer) {
        console.error('❌ equityCurveContainer element NOT FOUND!');
        appAlert('ERROR: equityCurveContainer element missing from HTML!');
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
            appAlert('Failed to load equity curve image!');
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

    if (typeof TierRestrictions !== 'undefined') TierRestrictions.disableCsvButtons();
    
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
        appAlert(message); // Fallback to alert
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
            if (typeof TierRestrictions !== 'undefined' && !TierRestrictions.canDownloadCsv()) {
                return TierRestrictions.showUpgradeMessage('CSV download requires a Standard or Premium plan.');
            }
            if (window.backtestCSVData) {
                const blob = new Blob([window.backtestCSVData], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `backtest_trades_${Date.now()}.csv`;
                a.click();
                window.URL.revokeObjectURL(url);
            } else {
                appAlert('No CSV data available');
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
// USE TEMPLATE - APPLY CONFIG FROM RESULTS PAGE
// =============================================================================

function applyOptionsConfig(rawConfig) {
    if (!rawConfig) return;

    var config = {};
    config.backtestName = rawConfig.backtestName || rawConfig.backtest_name || '';
    config.symbol = rawConfig.symbol || '';
    config.startDate = rawConfig.startDate || rawConfig.start_date || '';
    config.endDate = rawConfig.endDate || rawConfig.end_date || '';
    config.strategy = rawConfig.strategy || '';
    config.entryTime = rawConfig.entryTime || rawConfig.entry_time || '10:00';
    config.entryTimeMax = rawConfig.entryTimeMax || rawConfig.entry_time_max || '';
    config.dte = rawConfig.dte != null ? String(rawConfig.dte) : '0';
    var rawSkewed = rawConfig.allowSkewedWings != null ? rawConfig.allowSkewedWings : rawConfig.allow_skewed_wings;
    config.allowSkewedWings = rawSkewed === true || rawSkewed === 'y' ? 'y' : 'n';
    var rawConcurrent = rawConfig.concurrentTrades != null ? rawConfig.concurrentTrades : rawConfig.concurrent_trades;
    config.concurrentTrades = rawConcurrent === true || rawConcurrent === 'y' ? 'y' : 'n';
    var rawPdt = rawConfig.avoidPdt != null ? rawConfig.avoidPdt : rawConfig.avoid_pdt;
    config.avoidPdt = rawPdt === true || rawPdt === 'y' ? 'y' : 'n';
    config.legs = rawConfig.legs || [];
    config.takeProfitType = rawConfig.takeProfitType || (rawConfig.take_profit_pct != null ? 'P' : rawConfig.take_profit_dollar != null ? 'D' : 'P');
    config.takeProfitPct = rawConfig.takeProfitPct || (rawConfig.take_profit_pct != null ? String(rawConfig.take_profit_pct) : '');
    config.takeProfitDollar = rawConfig.takeProfitDollar || (rawConfig.take_profit_dollar != null ? String(rawConfig.take_profit_dollar) : '');
    config.stopLossType = rawConfig.stopLossType || (rawConfig.stop_loss_pct != null ? 'P' : rawConfig.stop_loss_dollar != null ? 'D' : 'P');
    config.stopLossPct = rawConfig.stopLossPct || (rawConfig.stop_loss_pct != null ? String(rawConfig.stop_loss_pct) : '');
    config.stopLossDollar = rawConfig.stopLossDollar || (rawConfig.stop_loss_dollar != null ? String(rawConfig.stop_loss_dollar) : '');
    config.eodAction = rawConfig.eodAction || rawConfig.eod_action || 'close';
    config.tradeFrequency = rawConfig.tradeFrequency || rawConfig.trade_frequency || 'daily';
    config.entryDays = rawConfig.entryDays || rawConfig.entry_days || [];
    config.startingCapital = rawConfig.startingCapital != null ? String(rawConfig.startingCapital) : (rawConfig.starting_capital != null ? String(rawConfig.starting_capital) : (rawConfig.initial_capital != null ? String(rawConfig.initial_capital) : '100000'));
    config.allocationType = rawConfig.allocationType || rawConfig.allocation_type || '1';
    var allocMap = {'pct': '1', 'contracts': '2', 'fixed': '3'};
    if (allocMap[config.allocationType]) config.allocationType = allocMap[config.allocationType];
    config.allocationPct = rawConfig.allocationPct || (rawConfig.allocation_type === 'pct' && rawConfig.allocation_value ? String(rawConfig.allocation_value) : '');
    config.allocationContracts = rawConfig.allocationContracts || (rawConfig.allocation_type === 'contracts' && rawConfig.allocation_value ? String(rawConfig.allocation_value) : '');
    config.allocationFixed = rawConfig.allocationFixed || (rawConfig.allocation_type === 'fixed' && rawConfig.allocation_value ? String(rawConfig.allocation_value) : '');
    config.netPremiumMin = rawConfig.netPremiumMin != null ? String(rawConfig.netPremiumMin) : (rawConfig.net_premium_min != null ? String(rawConfig.net_premium_min) : '');
    config.netPremiumMax = rawConfig.netPremiumMax != null ? String(rawConfig.netPremiumMax) : (rawConfig.net_premium_max != null ? String(rawConfig.net_premium_max) : '');
    config.priceConditions = rawConfig.priceConditions || rawConfig.price_conditions || [];
    config.optionsEntryType = rawConfig.optionsEntryType || rawConfig.options_entry_type || 'none';
    config.presetCondition = rawConfig.presetCondition || rawConfig.preset_condition || '';
    config.presetOperator = rawConfig.presetOperator || rawConfig.preset_operator || '>';
    config.presetThreshold = rawConfig.presetThreshold || rawConfig.preset_threshold || '';
    config.velocityLookback = rawConfig.velocityLookback || rawConfig.velocity_lookback || '5';

    if (document.getElementById('backtestName') && config.backtestName) {
        document.getElementById('backtestName').value = config.backtestName;
    }
    if (document.getElementById('symbol') && config.symbol) {
        document.getElementById('symbol').value = config.symbol;
    }
    if (document.getElementById('startDate') && config.startDate) {
        document.getElementById('startDate').value = config.startDate;
    }
    if (document.getElementById('endDate') && config.endDate) {
        document.getElementById('endDate').value = config.endDate;
    }

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
        
        // Apply leg configurations - handle both array and dict formats
        var legsArray = config.legs;
        if (legsArray && !Array.isArray(legsArray) && typeof legsArray === 'object') {
            legsArray = Object.keys(legsArray).map((key, idx) => {
                var leg = legsArray[key];
                leg.name = key;
                return leg;
            });
        }
        if (legsArray && legsArray.length > 0) {
            legsArray.forEach((leg, index) => {
                var methodSelect = document.querySelector(`.leg-method-select[data-leg-index="${index}"]`);
                var method = leg.method || leg.config_type || '';
                if (methodSelect && method) {
                    methodSelect.value = method;
                    methodSelect.dispatchEvent(new Event('change'));
                    
                    setTimeout(() => {
                        var paramsContainer = document.getElementById(`legParams${index}`);
                        if (paramsContainer) {
                            var params = leg.params || leg;
                            Object.keys(params).forEach(key => {
                                if (['index', 'method', 'config_type', 'name', 'type', 'position', 'original_index', 'params'].indexOf(key) === -1) {
                                    var input = paramsContainer.querySelector(`[data-param="${key}"]`);
                                    if (input) input.value = params[key];
                                }
                            });
                        }
                    }, 150);
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
        
        if (document.getElementById('entryTimeMax')) {
            document.getElementById('entryTimeMax').value = config.entryTimeMax || '';
        }

        var concurrentRadio = document.querySelector(`input[name="concurrentTrades"][value="${config.concurrentTrades}"]`);
        if (concurrentRadio) {
            concurrentRadio.checked = true;
            document.querySelectorAll('.bt-toggle-btn[data-radio="concurrentTrades"]').forEach(b => b.classList.toggle('on', b.dataset.val === config.concurrentTrades));
        }

        var pdtRadio = document.querySelector(`input[name="avoidPdt"][value="${config.avoidPdt}"]`);
        if (pdtRadio) {
            pdtRadio.checked = true;
            document.querySelectorAll('.bt-toggle-btn[data-radio="avoidPdt"]').forEach(b => b.classList.toggle('on', b.dataset.val === config.avoidPdt));
        }

        if (document.getElementById('netPremiumMin') && config.netPremiumMin) {
            document.getElementById('netPremiumMin').value = config.netPremiumMin;
        }
        if (document.getElementById('netPremiumMax') && config.netPremiumMax) {
            document.getElementById('netPremiumMax').value = config.netPremiumMax;
        }

        // Apply entry type
        var entryType = config.optionsEntryType || 'none';
        if (config.priceConditions && config.priceConditions.length > 0 && entryType === 'none') {
            entryType = 'custom';
        }
        if (config.presetCondition && entryType === 'none') {
            entryType = 'preset';
        }
        var entryTypeRadio = document.querySelector('input[name="optionsEntryType"][value="' + entryType + '"]');
        if (entryTypeRadio) {
            entryTypeRadio.checked = true;
            if (typeof updateOptionsEntryType === 'function') updateOptionsEntryType();
        }

        if (entryType === 'preset') {
            if (document.getElementById('optionsPresetCondition') && config.presetCondition) {
                document.getElementById('optionsPresetCondition').value = config.presetCondition;
                var presetChangeEvent = new Event('change');
                document.getElementById('optionsPresetCondition').dispatchEvent(presetChangeEvent);
            }
            if (config.presetCondition === '5') {
                if (document.getElementById('optionsVelocityLookback')) document.getElementById('optionsVelocityLookback').value = config.velocityLookback || '5';
                if (document.getElementById('optionsVelocityOperator')) document.getElementById('optionsVelocityOperator').value = config.presetOperator || '>';
                if (document.getElementById('optionsVelocityThreshold')) document.getElementById('optionsVelocityThreshold').value = config.presetThreshold || '';
            } else {
                if (document.getElementById('optionsPresetOperator')) document.getElementById('optionsPresetOperator').value = config.presetOperator || '>';
                if (document.getElementById('optionsPresetThreshold')) document.getElementById('optionsPresetThreshold').value = config.presetThreshold || '';
            }
        }

        // Apply price conditions
        if (entryType === 'custom' && config.priceConditions && config.priceConditions.length > 0) {
            applyPriceConditions(config.priceConditions);
        }
        
        // Check for Day candle conditions and lock entry time if needed
        setTimeout(() => {
            checkDayCandleConditions();
        }, 300);
        
        console.log('Options config applied from Use Template');
    }, 200);
}

var _runningBacktestId = null;
var _runningBacktestPollTimer = null;

async function checkForRunningBacktests() {
    try {
        var response = await authFetch(API_BASE_URL + '/backtest/running');
        if (!response.ok) return;
        var data = await response.json();
        if (data.has_running && data.running_backtests.length > 0) {
            var bt = data.running_backtests[0];
            _runningBacktestId = bt.backtest_id;
            showRunningBacktestBanner(bt.backtest_id, bt.type);
            disableBacktestSubmit(true);
            pollRunningBacktest(bt.backtest_id, bt.type);
        }
    } catch (e) {
        console.log('Could not check running backtests:', e);
    }
}

function showRunningBacktestBanner(backtestId, backtestType) {
    var existing = document.getElementById('runningBacktestBanner');
    if (existing) existing.remove();
    
    var viewFunc = backtestType === 'stocks' ? 'viewStockResultDetail' : 'viewOptionsResultDetail';
    var typeLabel = backtestType === 'stocks' ? 'Stock' : 'Options';
    var banner = document.createElement('div');
    banner.id = 'runningBacktestBanner';
    banner.style.cssText = 'background: linear-gradient(135deg, #1e3a5f, #2d4a7c); border: 1px solid #3b7cff; border-radius: 10px; padding: 16px 20px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; gap: 15px;';
    banner.innerHTML = '<div style="display:flex; align-items:center; gap:12px;">' +
        '<div class="spinner-border spinner-border-sm text-info" role="status"><span class="visually-hidden">Loading...</span></div>' +
        '<div><div style="color:#fff; font-weight:600;">' + typeLabel + ' Backtest In Progress</div>' +
        '<div style="color:#94b8db; font-size:13px;">Please wait for the current backtest to finish before starting a new one.</div></div></div>' +
        '<div style="display:flex; gap:10px;">' +
        '<button class="btn btn-sm btn-outline-info" onclick="' + viewFunc + '(\'' + backtestId + '\')"><i class="fas fa-eye"></i> View</button>' +
        '<button class="btn btn-sm btn-outline-danger" onclick="cancelRunningBacktest(\'' + backtestId + '\')"><i class="fas fa-times"></i> Cancel</button></div>';
    
    var form = document.getElementById('backtestForm');
    if (form) {
        form.parentNode.insertBefore(banner, form);
    }
}

function removeRunningBacktestBanner() {
    var banner = document.getElementById('runningBacktestBanner');
    if (banner) banner.remove();
    _runningBacktestId = null;
    if (_runningBacktestPollTimer) {
        clearInterval(_runningBacktestPollTimer);
        _runningBacktestPollTimer = null;
    }
}

function disableBacktestSubmit(disabled) {
    var btn = document.getElementById('runBacktestBtn');
    if (btn) {
        btn.disabled = disabled;
        if (disabled) {
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        } else {
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        }
    }
}

function pollRunningBacktest(backtestId, backtestType) {
    if (_runningBacktestPollTimer) clearInterval(_runningBacktestPollTimer);
    var statusUrl = backtestType === 'stocks' ? API_BASE_URL + '/stocks-backtest-v3/status/' + backtestId : API_BASE_URL + '/backtest/status/' + backtestId;
    var viewFunc = backtestType === 'stocks' ? 'viewStockResultDetail' : 'viewOptionsResultDetail';
    _runningBacktestPollTimer = setInterval(async function() {
        try {
            var response = await authFetch(statusUrl);
            if (!response.ok) return;
            var data = await response.json();
            if (data.status !== 'running') {
                removeRunningBacktestBanner();
                disableBacktestSubmit(false);
                if (data.status === 'completed') {
                    showSuccess('Your previous backtest has completed! <a href="#" onclick="' + viewFunc + '(\'' + backtestId + '\');return false;" style="color:#31ce36;text-decoration:underline;">View Results</a>');
                } else if (data.status === 'cancelled') {
                    showError('The backtest was cancelled.');
                }
            }
        } catch (e) {}
    }, 3000);
}

async function cancelRunningBacktest(backtestId) {
    if (!(await appConfirm('Are you sure you want to cancel this backtest?'))) return;
    try {
        var response = await authFetch(API_BASE_URL + '/backtest/cancel/' + backtestId, { method: 'POST' });
        if (response.ok) {
            removeRunningBacktestBanner();
            disableBacktestSubmit(false);
            showError('Backtest cancelled.');
        }
    } catch (e) {
        console.error('Cancel error:', e);
    }
}

function viewRunningBacktest(backtestId) {
}

function showSuccess(msg) {
    var el = document.getElementById('backtestError');
    if (el) {
        el.innerHTML = msg;
        el.style.display = 'block';
        el.className = 'alert alert-success';
    }
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
        
        // Detect current_price pattern
        var metricToSet = condition.metric || 'price';
        if (metricToSet === 'price' && condition.left) {
            var ld = String(condition.left.day || '0');
            var lc = condition.left.candle_type || 'minute';
            var ls = condition.left.series_type || 'close';
            if (ld === '0' && lc === 'minute' && ls === 'vwap') {
                metricToSet = 'current_price';
            }
        }

        // Apply left side values
        if (document.getElementById(`metric${id}`)) {
            document.getElementById(`metric${id}`).value = metricToSet;
            updateConditionFields(id);
        }
        
        setTimeout(() => {
            if (document.getElementById(`leftDay${id}`)) document.getElementById(`leftDay${id}`).value = condition.left?.day || '0';
            if (document.getElementById(`leftCandleType${id}`)) {
                document.getElementById(`leftCandleType${id}`).value = condition.left?.candle_type || 'day';
                handleCandleTypeChange(id);
            }
            if (document.getElementById(`leftMultiplier${id}`)) document.getElementById(`leftMultiplier${id}`).value = condition.left?.multiplier || 1;
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
                    if (document.getElementById(`rightMultiplier${id}`)) document.getElementById(`rightMultiplier${id}`).value = condition.right?.multiplier || 1;
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


// ─────────────────────────────────────────
// UI HELPER FUNCTIONS (new redesign)
// ─────────────────────────────────────────

function btToggle(btn) {
    const radioName = btn.dataset.radio;
    const val = btn.dataset.val;
    // Update radio
    const radios = document.querySelectorAll(`input[name="${radioName}"]`);
    radios.forEach(r => { r.checked = r.value === val; });
    // Update button states
    const group = btn.closest('[class*="toggle-row"], [class*="opt-section-body"], .tpsl-input-row, .bt-grid-2, .mb-3, div');
    const allBtns = btn.parentElement ? btn.parentElement.querySelectorAll('.bt-toggle-btn') : [];
    allBtns.forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
}

function toggleOptSection(id) {
    const body = document.getElementById(id + 'Body');
    const header = body ? body.previousElementSibling : null;
    if (!body) return;
    const isOpen = body.classList.contains('open');
    body.classList.toggle('open', !isOpen);
    if (header) header.classList.toggle('open', !isOpen);
}

function setTpType(type) {
    document.getElementById('tpPct').checked = (type === 'P');
    document.getElementById('tpDollar').checked = (type === 'D');
    document.getElementById('tpPctBtn').classList.toggle('on', type === 'P');
    document.getElementById('tpDollarBtn').classList.toggle('on', type === 'D');
    document.getElementById('takeProfitPctGroup').style.display = type === 'P' ? 'flex' : 'none';
    document.getElementById('takeProfitDollarGroup').style.display = type === 'D' ? 'flex' : 'none';
}

function setSlType(type) {
    document.getElementById('slPct').checked = (type === 'P');
    document.getElementById('slDollar').checked = (type === 'D');
    document.getElementById('slPctBtn').classList.toggle('on', type === 'P');
    document.getElementById('slDollarBtn').classList.toggle('on', type === 'D');
    document.getElementById('stopLossPctGroup').style.display = type === 'P' ? 'flex' : 'none';
    document.getElementById('stopLossDollarGroup').style.display = type === 'D' ? 'flex' : 'none';
}

function setAllocType(n) {
    document.getElementById('allocPct').checked = n === 1;
    document.getElementById('allocContracts').checked = n === 2;
    document.getElementById('allocFixed').checked = n === 3;
    document.querySelectorAll('.alloc-type-btn').forEach(b => {
        b.classList.toggle('on', parseInt(b.dataset.alloc) === n);
    });
    document.getElementById('allocationPctGroup').style.display = n === 1 ? 'flex' : 'none';
    document.getElementById('allocationContractsGroup').style.display = n === 2 ? 'block' : 'none';
    document.getElementById('allocationFixedGroup').style.display = n === 3 ? 'block' : 'none';
}
