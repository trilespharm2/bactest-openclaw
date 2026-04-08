// Stock Backtester V3.0 - Form Handler
// Handles dynamic fields, validation, and submission

let conditionCount = 0;
let exitConditionCount = 0;
let exitConditionNextId = 0;

// ─── Toggle UI helpers (redesigned form) ──────────────────────────────────────

function stkToggle(btn) {
    var radioName = btn.getAttribute('data-radio');
    var val = btn.getAttribute('data-val');
    if (!radioName) return;
    document.querySelectorAll('input[name="' + radioName + '"]').forEach(function(r) {
        r.checked = (r.value === val);
    });
    var parent = btn.closest('.bt-toggle-row') || btn.parentElement;
    parent.querySelectorAll('.bt-toggle-btn[data-radio="' + radioName + '"]').forEach(function(b) {
        b.classList.toggle('on', b === btn);
    });
}

function toggleSymbolMode(mode) {
    var single = document.getElementById('singleSymbolSection');
    var multi  = document.getElementById('multipleSymbolsSection');
    if (single) single.style.display = mode === 'single' ? 'block' : 'none';
    if (multi)  multi.style.display  = mode === 'multiple' ? 'block' : 'none';
}

function toggleEntryType(type) {
    var preset = document.getElementById('presetSection');
    var custom = document.getElementById('customSection');
    if (preset) preset.style.display = type === 'preset' ? 'block' : 'none';
    if (custom) custom.style.display = type === 'custom' ? 'block' : 'none';
    if (type === 'custom') {
        var cc = document.getElementById('conditionsContainer');
        if (cc && cc.children.length === 0) addCondition();
    }
    if (type === 'preset') updatePresetFields();
}

function toggleExitCondType(type) {
    var ep = document.getElementById('exitPresetSection');
    var ec = document.getElementById('exitCustomSection');
    if (ep) ep.style.display = type === 'preset' ? 'block' : 'none';
    if (ec) ec.style.display = type === 'custom'  ? 'block' : 'none';
    if (type === 'custom') {
        var ecc = document.getElementById('exitConditionsContainer');
        if (ecc && ecc.children.length === 0) addExitCondition();
    }
}

function setStkSizing(type) {
    document.querySelectorAll('.alloc-type-btn').forEach(function(b) {
        b.classList.toggle('on', b.getAttribute('data-sizing') === type);
    });
    document.querySelectorAll('input[name="sizing_type"]').forEach(function(r) {
        r.checked = (r.value === type);
    });
    updateSizingType();
}

function setStkTpType(type) {
    var pBtn = document.getElementById('stockTpPctBtn');
    var dBtn = document.getElementById('stockTpDollarBtn');
    if (pBtn) pBtn.classList.toggle('on', type === 'percent');
    if (dBtn) dBtn.classList.toggle('on', type === 'dollar');
    var rPct = document.getElementById('stockTpPct');
    var rDol = document.getElementById('stockTpDollar');
    if (rPct) rPct.checked = (type === 'percent');
    if (rDol) rDol.checked = (type === 'dollar');
    var sfx = document.getElementById('stockTpSuffix');
    if (sfx) sfx.textContent = type === 'percent' ? '%' : '$';
}

function setStkSlType(type) {
    var pBtn = document.getElementById('stockSlPctBtn');
    var dBtn = document.getElementById('stockSlDollarBtn');
    if (pBtn) pBtn.classList.toggle('on', type === 'percent');
    if (dBtn) dBtn.classList.toggle('on', type === 'dollar');
    var rPct = document.getElementById('stockSlPct');
    var rDol = document.getElementById('stockSlDollar');
    if (rPct) rPct.checked = (type === 'percent');
    if (rDol) rDol.checked = (type === 'dollar');
    var sfx = document.getElementById('stockSlSuffix');
    if (sfx) sfx.textContent = type === 'percent' ? '%' : '$';
}

window.stkToggle = stkToggle;
window.toggleSymbolMode = toggleSymbolMode;
window.toggleEntryType = toggleEntryType;
window.toggleExitCondType = toggleExitCondType;
window.setStkSizing = setStkSizing;
window.setStkTpType = setStkTpType;
window.setStkSlType = setStkSlType;
window.addCondition = addCondition;
window.handleMultiCsvUpload = handleMultiCsvUpload;
window.closeConfigSummary = closeConfigSummary;
window.showConfigSummary = showConfigSummary;
window.addExitCondition = addExitCondition;
window.removeCondition = removeCondition;
window.removeExitCondition = removeExitCondition;
window.resetStockBacktestForm = resetStockBacktestForm;
window.toggleCustomDay = toggleCustomDay;
window.onStockCandleChange = onStockCandleChange;
window.updateStockConditionFields = updateStockConditionFields;
window.updateExitConditionFields = updateExitConditionFields;

// Collapsible optional sections (guard in case backtester-script already defined it)
if (typeof toggleOptSection !== 'function') {
    window.toggleOptSection = function(id) {
        var body   = document.getElementById(id + 'Body');
        var header = body ? body.previousElementSibling : null;
        if (!body) return;
        var isOpen = body.style.display !== 'none';
        body.style.display = isOpen ? 'none' : 'block';
        if (header) {
            var chev = header.querySelector('.opt-section-chevron');
            var step = header.querySelector('.section-step.opt');
            if (chev) chev.style.transform = isOpen ? '' : 'rotate(180deg)';
            if (step) step.innerHTML = isOpen ? '&#9664;' : '&#9660;';
        }
    };
}

function setupStockFormToggles() {
    document.querySelectorAll('#stockBacktestForm .bt-toggle-btn[data-radio]').forEach(function(btn) {
        var radioName = btn.getAttribute('data-radio');
        var val       = btn.getAttribute('data-val');
        var checked   = document.querySelector('input[name="' + radioName + '"]:checked');
        btn.classList.toggle('on', !!(checked && checked.value === val));
    });
    var szChecked = document.querySelector('input[name="sizing_type"]:checked');
    if (szChecked) setStkSizing(szChecked.value);
    var tpChecked = document.querySelector('input[name="take_profit_type"]:checked');
    if (tpChecked) setStkTpType(tpChecked.value);
    var slChecked = document.querySelector('input[name="stop_loss_type"]:checked');
    if (slChecked) setStkSlType(slChecked.value);
    toggleSymbolMode('single');
    updateEntryType();
    updateSizingType();
}

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
            }
        } else {
            setTimeout(applyLoginOverlayIfNeeded, 100);
        }
    }
    setTimeout(applyLoginOverlayIfNeeded, 500);

    function applyStockTierRestrictions() {
        if (typeof TierRestrictions === 'undefined') { setTimeout(applyStockTierRestrictions, 200); return; }
        var startEl = document.getElementById('startDate');
        var endEl = document.getElementById('endDate');
        TierRestrictions.applyDateConstraints(startEl, endEl);
        if (TierRestrictions.isFree()) {
            var customRadio = document.querySelector('input[name="entry_type"][value="custom"]');
            if (customRadio) { customRadio.disabled = true; customRadio.parentElement.style.opacity = '0.4'; customRadio.parentElement.title = 'Custom builder requires Standard or Premium plan'; }
            var multiRadio = document.querySelector('input[name="symbol_mode"][value="multiple"]');
            if (multiRadio) { multiRadio.disabled = true; multiRadio.parentElement.style.opacity = '0.4'; multiRadio.parentElement.title = 'Multiple symbols requires Standard or Premium plan'; }
        }
        var symEl = document.getElementById('singleSymbol');
        if (symEl) {
            symEl.addEventListener('change', function() {
                var err = TierRestrictions.getSymbolError(symEl.value);
                var warn = document.getElementById('stockTierSymbolWarning');
                if (!warn) { warn = document.createElement('div'); warn.id = 'stockTierSymbolWarning'; warn.style.cssText = 'color:#dc3545;font-size:12px;margin-top:4px;'; symEl.parentElement.appendChild(warn); }
                warn.textContent = err || '';
            });
        }
    }
    setTimeout(applyStockTierRestrictions, 600);

    try {
        const today = new Date();
        const oneMonthAgo = new Date(today);
        oneMonthAgo.setMonth(today.getMonth() - 1);
        
        const startDateEl = document.getElementById('startDate');
        const endDateEl = document.getElementById('endDate');
        
        if (startDateEl) startDateEl.valueAsDate = oneMonthAgo;
        if (endDateEl) endDateEl.valueAsDate = today;
        
        console.log('Default dates set');
        
        // Sync new toggle button visuals and initial display
        setupStockFormToggles();
        
        console.log('Entry type initialized');
        
        // Form submission (remove old handler first to prevent duplicates on SPA re-init)
        const form = document.getElementById('stockBacktestForm');
        if (form) {
            form.removeEventListener('submit', handleSubmit);
            form.addEventListener('submit', handleSubmit);
            console.log('✓ Form submit handler attached');
        } else {
            // Retry once after a short delay (SPA may not have made the section visible yet)
            setTimeout(function() {
                const formRetry = document.getElementById('stockBacktestForm');
                if (formRetry) {
                    formRetry.removeEventListener('submit', handleSubmit);
                    formRetry.addEventListener('submit', handleSubmit);
                    console.log('✓ Form submit handler attached (retry)');
                } else {
                    console.warn('stockBacktestForm not found after retry — submit handler not attached');
                }
            }, 300);
        }
        
        console.log('=== Initialization Complete ===');

        checkForRunningStockBacktests();

        var pendingTemplate = sessionStorage.getItem('stockBacktestUseTemplate');
        if (pendingTemplate) {
            try {
                var config = JSON.parse(pendingTemplate);
                sessionStorage.removeItem('stockBacktestUseTemplate');
                applyStockConfig(config);
                console.log('Applied stock config from Use Template');
            } catch (e) {
                console.error('Error applying Use Template config:', e);
            }
        }
        
    } catch (error) {
        console.error('ERROR during initialization:', error);
    }
}

// Also initialize on DOMContentLoaded (for standalone page)
document.addEventListener('DOMContentLoaded', initializeStockBacktesterPage);

function updateSymbolMode() {
    const mode = document.querySelector('input[name="symbol_mode"]:checked').value;
    
    document.getElementById('singleSymbolSection').style.display = 'none';
    document.getElementById('multipleSymbolsSection').style.display = 'none';
    var csvSection = document.getElementById('csvSymbolsSection');
    if (csvSection) csvSection.style.display = 'none';
    
    if (mode === 'single') {
        document.getElementById('singleSymbolSection').style.display = 'block';
    } else if (mode === 'multiple') {
        document.getElementById('multipleSymbolsSection').style.display = 'block';
    }
}

function handleMultiCsvUpload(input) {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];
    var reader = new FileReader();
    reader.onload = function(e) {
        var text = e.target.result;
        var symbols = text.split(/[\n,]+/)
            .map(function(s) { return s.trim().toUpperCase(); })
            .filter(function(s) { return s && s.length > 0 && s.length <= 10; });
        var textarea = document.getElementById('multipleSymbols');
        if (textarea) {
            var existing = textarea.value.trim();
            if (existing) {
                textarea.value = existing + ', ' + symbols.join(', ');
            } else {
                textarea.value = symbols.join(', ');
            }
        }
        input.value = '';
    };
    reader.readAsText(file);
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
    enforceStockDayCandleRestriction(side, id);
}

function enforceStockDayCandleRestriction(side, id) {
    var candleEl = document.getElementById(side + '-candle-' + id);
    var dayEl = document.getElementById(side + '-day-' + id);
    var seriesEl = document.getElementById(side + '-series-' + id);
    if (!candleEl || !seriesEl) return;

    var candleType = candleEl.value;
    var dayVal = dayEl ? dayEl.value : '-1';
    var dayOffset = dayVal === 'custom'
        ? parseInt((document.getElementById(side + '-day-custom-' + id) || {}).value) || 0
        : parseInt(dayVal) || 0;

    var allTypes = ['open', 'high', 'low', 'close', 'vwap'];
    if (candleType === 'day' && dayOffset === 0) {
        seriesEl.innerHTML = '<option value="open">Open</option>';
        seriesEl.value = 'open';
    } else {
        var prev = seriesEl.value;
        if (seriesEl.options.length <= 1) {
            seriesEl.innerHTML = allTypes.map(function(t) {
                return '<option value="' + t + '"' + (t === prev ? ' selected' : '') + '>' + t.charAt(0).toUpperCase() + t.slice(1) + '</option>';
            }).join('');
        }
    }
}

function onStockCandleChange(side, id) {
    enforceStockDayCandleRestriction(side, id);
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
        
        // Reset dynamic sections + toggle button visuals
        setupStockFormToggles();
        
        // Clear conditions
        const conditionsContainer = document.getElementById('conditionsContainer');
        if (conditionsContainer) {
            conditionsContainer.innerHTML = '';
        }
        conditionCount = 0;
    }
}

const STOCK_METRICS = [
    { value: 'current_price', label: 'Current Price' },
    { value: 'price', label: 'Price' },
    { value: 'sma', label: 'SMA' },
    { value: 'ema', label: 'EMA' },
    { value: 'rsi', label: 'RSI' },
    { value: 'macd', label: 'MACD' }
];

const STOCK_SERIES_TYPES = [
    { value: 'open', label: 'Open' },
    { value: 'high', label: 'High' },
    { value: 'low', label: 'Low' },
    { value: 'close', label: 'Close' },
    { value: 'vwap', label: 'VWAP' }
];

function addCondition() {
    conditionCount++;
    const container = document.getElementById('conditionsContainer');
    const n = conditionCount;

    const conditionDiv = document.createElement('div');
    conditionDiv.className = 'condition-item card p-3 mb-3';
    conditionDiv.id = `condition-${n}`;
    conditionDiv.style.cssText = 'background: #f8f9fa; border: 1px solid #dee2e6;';

    conditionDiv.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-2">
            <strong class="text-muted">Condition ${n} ${n === 1 ? '(Entry Trigger)' : '(Prerequisite)'}</strong>
            <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeCondition(${n})">
                <i class="fas fa-times"></i>
            </button>
        </div>

        <div class="condition-left-side mb-3">
            <label class="form-label fw-bold">Left Side (Compare this)</label>
            <div class="row g-2">
                <div class="col-md-4 col-sm-6">
                    <label class="form-label small">Metric</label>
                    <select class="form-select form-select-sm" id="metric-${n}" onchange="updateStockConditionFields(${n})">
                        ${STOCK_METRICS.map(m => '<option value="' + m.value + '">' + m.label + '</option>').join('')}
                    </select>
                </div>
                <div class="col-md-4 col-sm-6" id="left-day-group-${n}" style="display:none;">
                    <label class="form-label small">Day</label>
                    <select class="form-select form-select-sm" id="left-day-${n}" onchange="toggleCustomDay('left', ${n})">
                        <option value="0">Today (0)</option>
                        <option value="-1">Yesterday (-1)</option>
                        <option value="-2">2 Days Ago (-2)</option>
                        <option value="-3">3 Days Ago (-3)</option>
                        <option value="custom">Custom...</option>
                    </select>
                    <input type="number" class="form-control form-control-sm mt-1" id="left-day-custom-${n}" style="display:none;" placeholder="e.g., -5" max="0">
                </div>
                <div class="col-md-4 col-sm-6" id="left-candle-group-${n}" style="display:none;">
                    <label class="form-label small">Candle Type</label>
                    <select class="form-select form-select-sm" id="left-candle-${n}" onchange="onStockCandleChange('left', ${n})">
                        <option value="min">Minute</option>
                        <option value="hr">Hour</option>
                        <option value="day">Day</option>
                    </select>
                </div>
                <div class="col-md-3 col-sm-6" id="left-mult-group-${n}" style="display:none;">
                    <label class="form-label small">Multiplier</label>
                    <input type="number" class="form-control form-control-sm" id="left-mult-${n}" min="1" value="1" placeholder="e.g., 5">
                </div>
                <div class="col-md-3 col-sm-6" id="left-window-group-${n}" style="display:none;">
                    <label class="form-label small" id="left-window-label-${n}">Window</label>
                    <input type="number" class="form-control form-control-sm" id="left-window-${n}" value="14" min="1">
                </div>
                <div class="col-md-3 col-sm-6" id="left-series-group-${n}" style="display:none;">
                    <label class="form-label small" id="left-series-label-${n}">Series Type</label>
                    <select class="form-select form-select-sm" id="left-series-${n}">
                        ${STOCK_SERIES_TYPES.map(s => '<option value="' + s.value + '"' + (s.value === 'close' ? ' selected' : '') + '>' + s.label + '</option>').join('')}
                    </select>
                </div>
            </div>
        </div>

        <div class="condition-operator mb-3">
            <div class="row g-2 align-items-end">
                <div class="col-md-3">
                    <label class="form-label fw-bold">Operator</label>
                    <select class="form-select" id="operator-${n}" onchange="updateStockRightSide(${n})">
                        <option value=">">&gt;</option>
                        <option value="<">&lt;</option>
                        <option value=">=">&gt;=</option>
                        <option value="<=">&lt;=</option>
                        <option value="=">=</option>
                    </select>
                </div>
                <div class="col-md-3">
                    <label class="form-label">Comparator</label>
                    <select class="form-select" id="comparator-${n}" onchange="updateStockRightSide(${n})">
                        <option value="value">Value</option>
                        <option value="compare_price">Compare Price</option>
                        <option value="compare_sma">Compare SMA</option>
                        <option value="compare_ema">Compare EMA</option>
                    </select>
                </div>
                <div class="col-md-3" id="value-input-group-${n}">
                    <label class="form-label">Value</label>
                    <input type="number" class="form-control" id="compare-value-${n}" step="0.01" placeholder="e.g., 50">
                </div>
            </div>
        </div>

        <div class="condition-right-side mb-3" id="right-side-${n}" style="display:none;">
            <label class="form-label fw-bold">Right Side (To this)</label>
            <div class="row g-2">
                <div class="col-md-4 col-sm-6" id="right-day-group-${n}">
                    <label class="form-label small">Day</label>
                    <select class="form-select form-select-sm" id="right-day-${n}" onchange="toggleCustomDay('right', ${n})">
                        <option value="0">Today (0)</option>
                        <option value="-1">Yesterday (-1)</option>
                        <option value="-2">2 Days Ago (-2)</option>
                        <option value="-3">3 Days Ago (-3)</option>
                        <option value="custom">Custom...</option>
                    </select>
                    <input type="number" class="form-control form-control-sm mt-1" id="right-day-custom-${n}" style="display:none;" placeholder="e.g., -5" max="0">
                </div>
                <div class="col-md-4 col-sm-6" id="right-candle-group-${n}">
                    <label class="form-label small">Candle Type</label>
                    <select class="form-select form-select-sm" id="right-candle-${n}" onchange="onStockCandleChange('right', ${n})">
                        <option value="min">Minute</option>
                        <option value="hr">Hour</option>
                        <option value="day">Day</option>
                    </select>
                </div>
                <div class="col-md-3 col-sm-6" id="right-mult-group-${n}">
                    <label class="form-label small">Multiplier</label>
                    <input type="number" class="form-control form-control-sm" id="right-mult-${n}" min="1" value="1" placeholder="e.g., 1">
                </div>
                <div class="col-md-3 col-sm-6" id="right-window-group-${n}" style="display:none;">
                    <label class="form-label small">Window</label>
                    <input type="number" class="form-control form-control-sm" id="right-window-${n}" value="14" min="1">
                </div>
                <div class="col-md-3 col-sm-6" id="right-series-group-${n}">
                    <label class="form-label small">Series Type</label>
                    <select class="form-select form-select-sm" id="right-series-${n}">
                        ${STOCK_SERIES_TYPES.map(s => '<option value="' + s.value + '"' + (s.value === 'close' ? ' selected' : '') + '>' + s.label + '</option>').join('')}
                    </select>
                </div>
            </div>

            <div class="row g-2 mt-2">
                <div class="col-md-3 col-sm-6">
                    <label class="form-label small">Threshold Unit</label>
                    <select class="form-select form-select-sm" id="threshold-unit-${n}">
                        <option value="%">Percent (%)</option>
                        <option value="$">Dollar ($)</option>
                    </select>
                </div>
                <div class="col-md-3 col-sm-6">
                    <label class="form-label small">Threshold Value</label>
                    <input type="number" class="form-control form-control-sm" id="threshold-value-${n}" step="0.01" placeholder="e.g., 2.5">
                </div>
            </div>
        </div>
    `;

    container.appendChild(conditionDiv);
    updateStockConditionFields(n);
}

function updateStockConditionFields(n) {
    var metric = document.getElementById('metric-' + n);
    if (!metric) return;
    var val = metric.value;

    var leftDayGroup = document.getElementById('left-day-group-' + n);
    var leftCandleGroup = document.getElementById('left-candle-group-' + n);
    var leftMultGroup = document.getElementById('left-mult-group-' + n);
    var leftWindowGroup = document.getElementById('left-window-group-' + n);
    var leftSeriesGroup = document.getElementById('left-series-group-' + n);
    var leftWindowLabel = document.getElementById('left-window-label-' + n);
    var leftSeriesLabel = document.getElementById('left-series-label-' + n);
    var comparator = document.getElementById('comparator-' + n);

    if (val === 'current_price') {
        if (leftDayGroup) leftDayGroup.style.display = 'none';
        if (leftCandleGroup) leftCandleGroup.style.display = 'none';
        if (leftMultGroup) leftMultGroup.style.display = 'none';
        if (leftWindowGroup) leftWindowGroup.style.display = 'none';
        if (leftSeriesGroup) leftSeriesGroup.style.display = 'none';
        updateStockComparatorOptions(n, ['value', 'compare_price', 'compare_sma', 'compare_ema']);
    } else if (val === 'price') {
        if (leftDayGroup) leftDayGroup.style.display = 'block';
        if (leftCandleGroup) leftCandleGroup.style.display = 'block';
        if (leftMultGroup) leftMultGroup.style.display = 'block';
        if (leftWindowGroup) leftWindowGroup.style.display = 'none';
        if (leftSeriesGroup) leftSeriesGroup.style.display = 'block';
        if (leftSeriesLabel) leftSeriesLabel.textContent = 'Price Type';
        updateStockComparatorOptions(n, ['value', 'compare_price', 'compare_sma', 'compare_ema']);
    } else if (val === 'sma' || val === 'ema') {
        if (leftDayGroup) leftDayGroup.style.display = 'block';
        if (leftCandleGroup) leftCandleGroup.style.display = 'block';
        if (leftMultGroup) leftMultGroup.style.display = 'block';
        if (leftWindowGroup) leftWindowGroup.style.display = 'block';
        if (leftSeriesGroup) leftSeriesGroup.style.display = 'block';
        if (leftWindowLabel) leftWindowLabel.textContent = 'Window';
        if (leftSeriesLabel) leftSeriesLabel.textContent = 'Series Type';
        updateStockComparatorOptions(n, ['value', 'compare_price', 'compare_sma', 'compare_ema']);
    } else if (val === 'rsi') {
        if (leftDayGroup) leftDayGroup.style.display = 'block';
        if (leftCandleGroup) leftCandleGroup.style.display = 'block';
        if (leftMultGroup) leftMultGroup.style.display = 'block';
        if (leftWindowGroup) leftWindowGroup.style.display = 'block';
        if (leftSeriesGroup) leftSeriesGroup.style.display = 'block';
        if (leftWindowLabel) leftWindowLabel.textContent = 'Window';
        if (leftSeriesLabel) leftSeriesLabel.textContent = 'Series Type';
        updateStockComparatorOptions(n, ['value']);
    } else if (val === 'macd') {
        if (leftDayGroup) leftDayGroup.style.display = 'block';
        if (leftCandleGroup) leftCandleGroup.style.display = 'block';
        if (leftMultGroup) leftMultGroup.style.display = 'block';
        if (leftWindowGroup) leftWindowGroup.style.display = 'none';
        if (leftSeriesGroup) leftSeriesGroup.style.display = 'block';
        if (leftSeriesLabel) leftSeriesLabel.textContent = 'Series Type';
        updateStockComparatorOptions(n, ['value']);
    }
    updateStockRightSide(n);
}

function updateStockComparatorOptions(n, options) {
    var sel = document.getElementById('comparator-' + n);
    if (!sel) return;
    var labels = { 'value': 'Value', 'compare_price': 'Compare Price', 'compare_sma': 'Compare SMA', 'compare_ema': 'Compare EMA' };
    sel.innerHTML = options.map(function(o) { return '<option value="' + o + '">' + (labels[o] || o) + '</option>'; }).join('');
}

function updateStockRightSide(n) {
    var comparator = document.getElementById('comparator-' + n);
    var operator = document.getElementById('operator-' + n);
    var rightSide = document.getElementById('right-side-' + n);
    var valueGroup = document.getElementById('value-input-group-' + n);
    if (!comparator || !rightSide || !valueGroup) return;

    var comp = comparator.value;
    var isEquals = operator && (operator.value === '=' || operator.value === '==');
    if (comp === 'value') {
        rightSide.style.display = 'none';
        valueGroup.style.display = 'block';
    } else {
        rightSide.style.display = 'block';
        valueGroup.style.display = 'none';

        var rightWindowGroup = document.getElementById('right-window-group-' + n);
        var rightType = comp.replace('compare_', '');
        if (rightType === 'sma' || rightType === 'ema') {
            if (rightWindowGroup) rightWindowGroup.style.display = 'block';
        } else {
            if (rightWindowGroup) rightWindowGroup.style.display = 'none';
        }

        var thresholdUnit = document.getElementById('threshold-unit-' + n);
        var thresholdValue = document.getElementById('threshold-value-' + n);
        if (thresholdUnit) thresholdUnit.closest('.col-md-3').style.display = isEquals ? 'none' : '';
        if (thresholdValue) thresholdValue.closest('.col-md-3').style.display = isEquals ? 'none' : '';
    }
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
        const label = cond.querySelector('strong.text-muted');
        if (label) {
            label.textContent = `Condition ${index + 1} ${index === 0 ? '(Entry Trigger)' : '(Prerequisite)'}`;
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

// ============================================================================
// EXIT CONDITION FUNCTIONS
// ============================================================================

function updateExitCondType() {
    const type = document.querySelector('input[name="exit_cond_type"]:checked').value;
    document.getElementById('exitPresetSection').style.display = 'none';
    document.getElementById('exitCustomSection').style.display = 'none';

    if (type === 'preset') {
        document.getElementById('exitPresetSection').style.display = 'block';
    } else {
        document.getElementById('exitCustomSection').style.display = 'block';
        if (document.getElementById('exitConditionsContainer').children.length === 0) {
            addExitCondition();
        }
    }
}

function updateExitPresetFields() {
    var sel = document.getElementById('exitPresetCondition');
    var val = sel ? sel.value : '';
    var isVelocity = val === '5';
    var hasVal = val !== '';
    document.getElementById('exitStandardPresetFields').style.display = (hasVal && !isVelocity) ? 'flex' : 'none';
    document.getElementById('exitVelocityFields').style.display = (hasVal && isVelocity) ? 'flex' : 'none';
}

function addExitCondition() {
    exitConditionNextId++;
    exitConditionCount++;
    const container = document.getElementById('exitConditionsContainer');
    const n = exitConditionNextId;

    const conditionDiv = document.createElement('div');
    conditionDiv.className = 'exit-condition-item card p-3 mb-3';
    conditionDiv.id = `exit-condition-${n}`;
    conditionDiv.style.cssText = 'background: #f8f9fa; border: 1px solid #dee2e6;';

    conditionDiv.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-2">
            <strong class="text-muted">Exit Condition ${n}</strong>
            <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeExitCondition(${n})">
                <i class="fas fa-times"></i>
            </button>
        </div>

        <div class="condition-left-side mb-3">
            <label class="form-label fw-bold">Left Side (Compare this)</label>
            <div class="row g-2">
                <div class="col-md-4 col-sm-6">
                    <label class="form-label small">Metric</label>
                    <select class="form-select form-select-sm" id="exit-metric-${n}" onchange="updateExitConditionFields(${n})">
                        ${STOCK_METRICS.map(m => '<option value="' + m.value + '">' + m.label + '</option>').join('')}
                    </select>
                </div>
                <div class="col-md-4 col-sm-6" id="exit-left-day-group-${n}" style="display:none;">
                    <label class="form-label small">Day</label>
                    <select class="form-select form-select-sm" id="exit-left-day-${n}" onchange="toggleCustomDay('exit-left', ${n})">
                        <option value="0">Today (0)</option>
                        <option value="-1">Yesterday (-1)</option>
                        <option value="-2">2 Days Ago (-2)</option>
                        <option value="-3">3 Days Ago (-3)</option>
                        <option value="custom">Custom...</option>
                    </select>
                    <input type="number" class="form-control form-control-sm mt-1" id="exit-left-day-custom-${n}" style="display:none;" placeholder="e.g., -5" max="0">
                </div>
                <div class="col-md-4 col-sm-6" id="exit-left-candle-group-${n}" style="display:none;">
                    <label class="form-label small">Candle Type</label>
                    <select class="form-select form-select-sm" id="exit-left-candle-${n}" onchange="onStockCandleChange('exit-left', ${n})">
                        <option value="min">Minute</option>
                        <option value="hr">Hour</option>
                        <option value="day">Day</option>
                    </select>
                </div>
                <div class="col-md-3 col-sm-6" id="exit-left-mult-group-${n}" style="display:none;">
                    <label class="form-label small">Multiplier</label>
                    <input type="number" class="form-control form-control-sm" id="exit-left-mult-${n}" min="1" value="1" placeholder="e.g., 5">
                </div>
                <div class="col-md-3 col-sm-6" id="exit-left-window-group-${n}" style="display:none;">
                    <label class="form-label small" id="exit-left-window-label-${n}">Window</label>
                    <input type="number" class="form-control form-control-sm" id="exit-left-window-${n}" value="14" min="1">
                </div>
                <div class="col-md-3 col-sm-6" id="exit-left-series-group-${n}" style="display:none;">
                    <label class="form-label small" id="exit-left-series-label-${n}">Series Type</label>
                    <select class="form-select form-select-sm" id="exit-left-series-${n}">
                        ${STOCK_SERIES_TYPES.map(s => '<option value="' + s.value + '"' + (s.value === 'close' ? ' selected' : '') + '>' + s.label + '</option>').join('')}
                    </select>
                </div>
            </div>
        </div>

        <div class="condition-operator mb-3">
            <div class="row g-2 align-items-end">
                <div class="col-md-3">
                    <label class="form-label fw-bold">Operator</label>
                    <select class="form-select" id="exit-operator-${n}" onchange="updateExitRightSide(${n})">
                        <option value=">">&gt;</option>
                        <option value="<">&lt;</option>
                        <option value=">=">&gt;=</option>
                        <option value="<=">&lt;=</option>
                        <option value="=">=</option>
                    </select>
                </div>
                <div class="col-md-3">
                    <label class="form-label">Comparator</label>
                    <select class="form-select" id="exit-comparator-${n}" onchange="updateExitRightSide(${n})">
                        <option value="value">Value</option>
                        <option value="compare_price">Compare Price</option>
                        <option value="compare_sma">Compare SMA</option>
                        <option value="compare_ema">Compare EMA</option>
                    </select>
                </div>
                <div class="col-md-3" id="exit-value-input-group-${n}">
                    <label class="form-label">Value</label>
                    <input type="number" class="form-control" id="exit-compare-value-${n}" step="0.01" placeholder="e.g., 50">
                </div>
            </div>
        </div>

        <div class="condition-right-side mb-3" id="exit-right-side-${n}" style="display:none;">
            <label class="form-label fw-bold">Right Side (To this)</label>
            <div class="row g-2">
                <div class="col-md-4 col-sm-6" id="exit-right-day-group-${n}">
                    <label class="form-label small">Day</label>
                    <select class="form-select form-select-sm" id="exit-right-day-${n}" onchange="toggleCustomDay('exit-right', ${n})">
                        <option value="0">Today (0)</option>
                        <option value="-1">Yesterday (-1)</option>
                        <option value="-2">2 Days Ago (-2)</option>
                        <option value="-3">3 Days Ago (-3)</option>
                        <option value="custom">Custom...</option>
                    </select>
                    <input type="number" class="form-control form-control-sm mt-1" id="exit-right-day-custom-${n}" style="display:none;" placeholder="e.g., -5" max="0">
                </div>
                <div class="col-md-4 col-sm-6" id="exit-right-candle-group-${n}">
                    <label class="form-label small">Candle Type</label>
                    <select class="form-select form-select-sm" id="exit-right-candle-${n}" onchange="onStockCandleChange('exit-right', ${n})">
                        <option value="min">Minute</option>
                        <option value="hr">Hour</option>
                        <option value="day">Day</option>
                    </select>
                </div>
                <div class="col-md-3 col-sm-6" id="exit-right-mult-group-${n}">
                    <label class="form-label small">Multiplier</label>
                    <input type="number" class="form-control form-control-sm" id="exit-right-mult-${n}" min="1" value="1" placeholder="e.g., 1">
                </div>
                <div class="col-md-3 col-sm-6" id="exit-right-window-group-${n}" style="display:none;">
                    <label class="form-label small">Window</label>
                    <input type="number" class="form-control form-control-sm" id="exit-right-window-${n}" value="14" min="1">
                </div>
                <div class="col-md-3 col-sm-6" id="exit-right-series-group-${n}">
                    <label class="form-label small">Series Type</label>
                    <select class="form-select form-select-sm" id="exit-right-series-${n}">
                        ${STOCK_SERIES_TYPES.map(s => '<option value="' + s.value + '"' + (s.value === 'close' ? ' selected' : '') + '>' + s.label + '</option>').join('')}
                    </select>
                </div>
            </div>

            <div class="row g-2 mt-2">
                <div class="col-md-3 col-sm-6">
                    <label class="form-label small">Threshold Unit</label>
                    <select class="form-select form-select-sm" id="exit-threshold-unit-${n}">
                        <option value="%">Percent (%)</option>
                        <option value="$">Dollar ($)</option>
                    </select>
                </div>
                <div class="col-md-3 col-sm-6">
                    <label class="form-label small">Threshold Value</label>
                    <input type="number" class="form-control form-control-sm" id="exit-threshold-value-${n}" step="0.01" placeholder="e.g., 2.5">
                </div>
            </div>
        </div>
    `;

    container.appendChild(conditionDiv);
    updateExitConditionFields(n);
}

function updateExitConditionFields(n) {
    var metric = (document.getElementById('exit-metric-' + n) || {}).value || 'current_price';
    var isCurrentPrice = metric === 'current_price';
    var isPrice = metric === 'price';
    var isIndicator = ['sma', 'ema', 'rsi', 'macd'].indexOf(metric) !== -1;
    var needsWindow = ['sma', 'ema', 'rsi', 'macd'].indexOf(metric) !== -1;

    var showDay = !isCurrentPrice;
    var showCandle = !isCurrentPrice;
    var showMult = !isCurrentPrice;
    var showWindow = needsWindow;
    var showSeries = isPrice || isCurrentPrice || ['sma', 'ema'].indexOf(metric) !== -1;

    var el;
    el = document.getElementById('exit-left-day-group-' + n); if (el) el.style.display = showDay ? '' : 'none';
    el = document.getElementById('exit-left-candle-group-' + n); if (el) el.style.display = showCandle ? '' : 'none';
    el = document.getElementById('exit-left-mult-group-' + n); if (el) el.style.display = showMult ? '' : 'none';
    el = document.getElementById('exit-left-window-group-' + n); if (el) el.style.display = showWindow ? '' : 'none';
    el = document.getElementById('exit-left-series-group-' + n); if (el) el.style.display = (showSeries && !isCurrentPrice) ? '' : 'none';

    var windowLabel = document.getElementById('exit-left-window-label-' + n);
    if (windowLabel) windowLabel.textContent = (metric === 'macd') ? 'Signal' : 'Window';
    var seriesLabel = document.getElementById('exit-left-series-label-' + n);
    if (seriesLabel) seriesLabel.textContent = (isPrice || isCurrentPrice) ? 'Price Type' : 'Series Type';

    updateExitComparatorOptions(n);

    if (isCurrentPrice) {
        el = document.getElementById('exit-left-day-' + n); if (el) el.value = '0';
        el = document.getElementById('exit-left-candle-' + n); if (el) el.value = 'min';
        el = document.getElementById('exit-left-mult-' + n); if (el) el.value = '1';
    }

    enforceStockDayCandleRestriction('exit-left', n);
}

function updateExitComparatorOptions(n) {
    var metric = (document.getElementById('exit-metric-' + n) || {}).value || 'current_price';
    var comp = document.getElementById('exit-comparator-' + n);
    if (!comp) return;
    var opts = '<option value="value">Value</option>';
    if (metric !== 'rsi' && metric !== 'macd') {
        opts += '<option value="compare_price">Compare Price</option>';
        opts += '<option value="compare_sma">Compare SMA</option>';
        opts += '<option value="compare_ema">Compare EMA</option>';
    }
    comp.innerHTML = opts;
    updateExitRightSide(n);
}

function updateExitRightSide(n) {
    var comp = (document.getElementById('exit-comparator-' + n) || {}).value || 'value';
    var operator = (document.getElementById('exit-operator-' + n) || {}).value || '>';
    var rightSide = document.getElementById('exit-right-side-' + n);
    var valueGroup = document.getElementById('exit-value-input-group-' + n);
    var isEquals = (operator === '=' || operator === '==');

    if (comp === 'value') {
        if (rightSide) rightSide.style.display = 'none';
        if (valueGroup) valueGroup.style.display = '';
    } else {
        if (rightSide) rightSide.style.display = 'block';
        if (valueGroup) valueGroup.style.display = 'none';

        var isComparePrice = comp === 'compare_price';
        var el;
        el = document.getElementById('exit-right-window-group-' + n); if (el) el.style.display = isComparePrice ? 'none' : '';
        el = document.getElementById('exit-right-series-group-' + n); if (el) el.style.display = isComparePrice ? '' : 'none';

        var thresholdUnit = document.getElementById('exit-threshold-unit-' + n);
        var thresholdValue = document.getElementById('exit-threshold-value-' + n);
        if (thresholdUnit) thresholdUnit.closest('.col-md-3').style.display = isEquals ? 'none' : '';
        if (thresholdValue) thresholdValue.closest('.col-md-3').style.display = isEquals ? 'none' : '';
    }
}

function removeExitCondition(id) {
    var element = document.getElementById('exit-condition-' + id);
    if (element) {
        element.remove();
        renumberExitConditions();
    }
}

function renumberExitConditions() {
    var conditions = document.querySelectorAll('.exit-condition-item');
    exitConditionCount = conditions.length;
    conditions.forEach(function(cond, index) {
        var label = cond.querySelector('strong.text-muted');
        if (label) label.textContent = 'Exit Condition ' + (index + 1);
    });
}

// Handle form submission
let _pendingStockConfig = null;

function buildStockConfigSummaryHtml(config) {
    const sectionStyle = 'margin-bottom:16px; padding:14px 16px; background:#f8fafc; border-radius:10px; border-left:4px solid #3b7cff;';
    const labelStyle = 'font-weight:600; color:#334155; font-size:13px; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;';
    const valueStyle = 'color:#1e293b; font-size:15px; line-height:1.6;';
    const arrowIcon = '<i class="fas fa-arrow-right" style="color:#3b7cff; margin:0 6px; font-size:11px;"></i>';

    const symbols = config.symbol || (config.symbols ? config.symbols.join(', ') : 'N/A');

    let entryHtml = '';
    if (config.entry_type === 'preset') {
        const presetNames = {'1':'Gap %','2':'Gap $','3':'Change %','4':'Change $','5':'Velocity'};
        const condName = presetNames[config.preset_condition] || `Preset #${config.preset_condition}`;
        entryHtml = `${condName} ${config.preset_operator} ${config.preset_threshold}`;
        if (config.preset_condition === '5' && config.velocity_lookback) {
            entryHtml += ` (${config.velocity_lookback} min lookback)`;
        }
    } else if (config.custom_conditions && config.custom_conditions.length > 0) {
        entryHtml = config.custom_conditions.map((c, i) => {
            const metricLabels = { 'current_price': 'Current Price', 'price': 'Price', 'sma': 'SMA', 'ema': 'EMA', 'rsi': 'RSI', 'macd': 'MACD' };
            const dayLabel = (d) => d === 0 ? 'Today' : `Day(${d})`;
            const candleFmt = (candle, mult) => {
                const m = parseInt(mult) || 1;
                if (candle === 'min') return m + 'min';
                if (candle === 'hr') return m + 'hr';
                if (candle === 'day') return m > 1 ? m + 'day' : 'day';
                return candle || 'day';
            };
            var met = c.metric || 'price';
            var leftDesc = metricLabels[met] || met;
            if (met !== 'current_price') {
                leftDesc += ' [' + dayLabel(c.left_day) + ' ' + candleFmt(c.left_candle, c.left_multiplier) + ']';
            }
            var rightDesc = '';
            if (c.comparator === 'value' || c.right_type === 'value') {
                rightDesc = String(c.right_fixed_value || 0);
            } else {
                var compLabel = (c.comparator || '').replace('compare_', '').toUpperCase();
                rightDesc = compLabel + ' [' + dayLabel(c.right_day) + ' ' + candleFmt(c.right_candle, c.right_multiplier) + ']';
                if (c.threshold_value) rightDesc += ' ±' + c.threshold_value + (c.threshold_unit || '%');
            }
            const prefix = i === 0 ? '<span style="color:#3b7cff; font-weight:600;">Entry:</span>' : '<span style="color:#64748b; font-weight:600;">Prior:</span>';
            return `<div style="margin-bottom:4px;">${prefix} ${leftDesc} ${c.operation} ${rightDesc}</div>`;
        }).join('');
    }

    const sizingMap = {'shares':'Shares','dollars':'Dollars','percent':'% of Capital'};
    const sizingLabel = sizingMap[config.sizing_type] || config.sizing_type;

    const tpLabel = config.take_profit_value ? (config.take_profit_type === 'percent' ? `${config.take_profit_value}%` : `$${config.take_profit_value}`) : 'None';
    const slLabel = config.stop_loss_value ? (config.stop_loss_type === 'percent' ? `${config.stop_loss_value}%` : `$${config.stop_loss_value}`) : 'None';

    let exitCondHtml = '';
    if (config.exit_cond_type === 'preset' && config.exit_preset_condition) {
        const exitPresetNames = {'1':'Premarket Change %','2':'Change %','3':'Gap %','4':'Change-Open %','5':'Velocity'};
        exitCondHtml = exitPresetNames[config.exit_preset_condition] || 'Preset #' + config.exit_preset_condition;
        exitCondHtml += ' ' + (config.exit_preset_operator || '') + ' ' + (config.exit_preset_threshold || '');
    } else if (config.exit_custom_conditions && config.exit_custom_conditions.length > 0) {
        const metricLabels = { 'current_price': 'Current Price', 'price': 'Price', 'sma': 'SMA', 'ema': 'EMA', 'rsi': 'RSI', 'macd': 'MACD' };
        exitCondHtml = config.exit_custom_conditions.map(function(c, i) {
            var met = c.metric || 'price';
            var leftDesc = metricLabels[met] || met;
            var rightDesc = '';
            if (c.comparator === 'value' || c.right_type === 'value') {
                rightDesc = String(c.right_fixed_value || 0);
            } else {
                rightDesc = (c.comparator || '').replace('compare_', '').toUpperCase();
            }
            return '<div style="margin-bottom:4px;"><span style="color:#e65100; font-weight:600;">Exit:</span> ' + leftDesc + ' ' + c.operation + ' ' + rightDesc + '</div>';
        }).join('');
    }

    return `
        <div style="${sectionStyle}">
            <div style="${labelStyle}"><i class="fas fa-calendar-alt" style="margin-right:6px;"></i>Period</div>
            <div style="${valueStyle}">${config.start_date} ${arrowIcon} ${config.end_date}</div>
        </div>
        <div style="${sectionStyle}">
            <div style="${labelStyle}"><i class="fas fa-chart-bar" style="margin-right:6px;"></i>Symbol</div>
            <div style="${valueStyle}">${symbols}</div>
        </div>
        <div style="${sectionStyle}">
            <div style="${labelStyle}"><i class="fas fa-sign-in-alt" style="margin-right:6px;"></i>Entry Criteria</div>
            <div style="${valueStyle}">${config.direction ? config.direction.charAt(0).toUpperCase() + config.direction.slice(1) : 'Long'}, ${config.sizing_value} ${sizingLabel} per position</div>
        </div>
        <div style="${sectionStyle}">
            <div style="${labelStyle}"><i class="fas fa-filter" style="margin-right:6px;"></i>Instance Conditions</div>
            <div style="${valueStyle}">${entryHtml || '<span style="color:#94a3b8;">None configured</span>'}</div>
        </div>
        ${exitCondHtml ? '<div style="' + sectionStyle + '"><div style="' + labelStyle + '"><i class="fas fa-door-open" style="margin-right:6px;"></i>Exit Conditions</div><div style="' + valueStyle + '">' + exitCondHtml + '</div></div>' : ''}
        <div style="${sectionStyle}">
            <div style="${labelStyle}"><i class="fas fa-sign-out-alt" style="margin-right:6px;"></i>Exit Criteria (TP/SL)</div>
            <div style="${valueStyle}">Take Profit: ${tpLabel} &nbsp;|&nbsp; Stop Loss: ${slLabel}</div>
        </div>
        <div style="${sectionStyle}">
            <div style="${labelStyle}"><i class="fas fa-clock" style="margin-right:6px;"></i>Max Days in Trade</div>
            <div style="${valueStyle}">${config.max_days || 'Unlimited'}</div>
        </div>
        ${config.allow_consecutive_trades ? '<div style="' + sectionStyle + '"><div style="' + labelStyle + '"><i class="fas fa-layer-group" style="margin-right:6px;"></i>Consecutive Trades</div><div style="' + valueStyle + '">Allowed</div></div>' : ''}
    `;
}

function showConfigSummary(config) {
    _pendingStockConfig = config;
    const body = document.getElementById('configSummaryBody');
    body.innerHTML = buildStockConfigSummaryHtml(config);
    const overlay = document.getElementById('configSummaryOverlay');
    overlay.style.display = 'flex';
}

function closeConfigSummary() {
    document.getElementById('configSummaryOverlay').style.display = 'none';
    _pendingStockConfig = null;
    const form = document.getElementById('stockBacktestForm');
    if (form) form.dataset.isSubmitting = 'false';
}

async function handleSubmit(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const form = e.target;
    if (form.dataset.isSubmitting === 'true') {
        console.log('Form already submitting, ignoring duplicate');
        return;
    }
    form.dataset.isSubmitting = 'true';
    
    console.log('=== FORM SUBMIT STARTED ===');
    
    try {
        const errorEl = document.getElementById('errorMessage');
        if (errorEl) errorEl.style.display = 'none';
        
        console.log('Collecting form data...');
        const config = await collectFormData();
        console.log('Config collected:', config);

        if (typeof TierRestrictions !== 'undefined') {
            var sym = config.symbol || (config.symbols && config.symbols[0]) || '';
            var symErr = TierRestrictions.getSymbolError(sym);
            if (symErr) throw new Error(symErr);
            if (!TierRestrictions.isDateAllowed(config.start_date) || !TierRestrictions.isDateAllowed(config.end_date)) { var dMin = TierRestrictions.getDateMin(); var dMax = TierRestrictions.getDateMax(); var rangeStr = (dMin && dMax) ? ' Allowed range: ' + dMin + ' to ' + dMax + '.' : ''; throw new Error('Date is outside your plan\'s allowed range.' + rangeStr + ' Upgrade for wider date access.'); }
            if (TierRestrictions.isFree() && config.entry_type === 'custom') throw new Error('Custom entry conditions require a Standard or Premium plan.');
            if (!TierRestrictions.canUseMultipleSymbols() && config.symbol_mode === 'multiple') throw new Error('Multiple symbols require a Standard or Premium plan.');
        }

        console.log('Validating config...');
        if (!validateConfig(config)) {
            throw new Error('Please fill in all required fields');
        }
        console.log('Validation passed');
        
        showConfigSummary(config);

        document.getElementById('confirmRunBacktestBtn').onclick = async function() {
            closeConfigSummary();
            const loadingEl = document.getElementById('loadingMessage');
            if (loadingEl) loadingEl.style.display = 'block';

            try {
                const response = await authFetch('/api/stocks-backtest-v3/start', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(config)
                });

                if (!response.ok) {
                    const error = await response.json();
                    if (response.status === 429) {
                        const loadingEl = document.getElementById('loadingMessage');
                        if (loadingEl) loadingEl.style.display = 'none';
                        form.dataset.isSubmitting = 'false';
                        appAlert(error.error || 'A backtest is already running.');
                        checkForRunningStockBacktests();
                        return;
                    }
                    throw new Error(error.error || 'Backtest failed to start');
                }

                const result = await response.json();
                console.log('Backtest started! ID:', result.backtest_id);
                sessionStorage.setItem('stockBacktestConfig_' + result.backtest_id, JSON.stringify(config));
                viewStockResultDetail(result.backtest_id);
            } catch (err) {
                console.error('Error running backtest:', err);
                const errorEl = document.getElementById('errorMessage');
                const loadingEl = document.getElementById('loadingMessage');
                if (errorEl) { errorEl.textContent = `Error: ${err.message}`; errorEl.style.display = 'block'; }
                if (loadingEl) loadingEl.style.display = 'none';
                form.dataset.isSubmitting = 'false';
                appAlert(`Error: ${err.message}`);
            }
        };

    } catch (error) {
        console.error('=== ERROR IN FORM SUBMISSION ===');
        console.error('Error:', error);
        const errorEl = document.getElementById('errorMessage');
        if (errorEl) { errorEl.textContent = `Error: ${error.message}`; errorEl.style.display = 'block'; }
        form.dataset.isSubmitting = 'false';
        appAlert(`Error: ${error.message}`);
    }
    
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
            const metric = (document.getElementById(`metric-${id}`) || {}).value || 'current_price';
            const comparator = (document.getElementById(`comparator-${id}`) || {}).value || 'value';

            const leftDaySelect = document.getElementById(`left-day-${id}`);
            const leftDayVal = metric === 'current_price' ? 0 :
                (leftDaySelect && leftDaySelect.value === 'custom'
                    ? parseInt(document.getElementById(`left-day-custom-${id}`).value) || 0
                    : parseInt((leftDaySelect || {}).value) || 0);

            var leftType = metric;
            if (metric === 'current_price' || metric === 'price') {
                leftType = (document.getElementById(`left-series-${id}`) || {}).value || 'close';
            }

            const condition = {
                type: index === 0 ? 'entry' : 'prior',
                metric: metric,
                left_day: leftDayVal,
                left_candle: metric === 'current_price' ? 'min' : ((document.getElementById(`left-candle-${id}`) || {}).value || 'min'),
                left_multiplier: parseInt((document.getElementById(`left-mult-${id}`) || {}).value) || 1,
                left_type: leftType,
                left_series: (document.getElementById(`left-series-${id}`) || {}).value || 'close',
                left_window: parseInt((document.getElementById(`left-window-${id}`) || {}).value) || 14,
                operation: (document.getElementById(`operator-${id}`) || {}).value || '>',
                comparator: comparator
            };

            if (comparator === 'value') {
                condition.right_type = 'value';
                condition.right_fixed_value = parseFloat((document.getElementById(`compare-value-${id}`) || {}).value) || 0;
                condition.right_day = 0;
                condition.right_candle = 'min';
                condition.right_multiplier = 1;
                condition.threshold_unit = '$';
                condition.threshold_value = 0;
            } else {
                var rightDaySelect = document.getElementById(`right-day-${id}`);
                condition.right_day = rightDaySelect && rightDaySelect.value === 'custom'
                    ? parseInt(document.getElementById(`right-day-custom-${id}`).value) || 0
                    : parseInt((rightDaySelect || {}).value) || 0;
                condition.right_candle = (document.getElementById(`right-candle-${id}`) || {}).value || 'min';
                condition.right_multiplier = parseInt((document.getElementById(`right-mult-${id}`) || {}).value) || 1;
                condition.right_series = (document.getElementById(`right-series-${id}`) || {}).value || 'close';
                condition.right_window = parseInt((document.getElementById(`right-window-${id}`) || {}).value) || 14;

                var rightBaseType = comparator.replace('compare_', '');
                if (rightBaseType === 'price') {
                    condition.right_type = condition.right_series || 'close';
                } else {
                    condition.right_type = rightBaseType;
                }

                condition.threshold_unit = (document.getElementById(`threshold-unit-${id}`) || {}).value || '%';
                condition.threshold_value = parseFloat((document.getElementById(`threshold-value-${id}`) || {}).value) || 0;
            }

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
    
    // Exit conditions (signal-based)
    config.exit_cond_type = document.querySelector('input[name="exit_cond_type"]:checked').value;

    if (config.exit_cond_type === 'preset') {
        var exitPresetVal = document.getElementById('exitPresetCondition').value;
        if (exitPresetVal) {
            config.exit_preset_condition = exitPresetVal;
            if (exitPresetVal === '5') {
                config.exit_velocity_lookback = document.getElementById('exitVelocityLookback').value;
                config.exit_preset_operator = document.getElementById('exitVelocityOperator').value;
                config.exit_preset_threshold = document.getElementById('exitVelocityThreshold').value;
            } else {
                config.exit_preset_operator = document.getElementById('exitPresetOperator').value;
                config.exit_preset_threshold = document.getElementById('exitPresetThreshold').value;
            }
        }
    } else {
        config.exit_custom_conditions = [];
        var exitConds = document.querySelectorAll('.exit-condition-item');
        exitConds.forEach(function(condItem) {
            var id = condItem.id.split('-')[2];
            var metric = (document.getElementById('exit-metric-' + id) || {}).value || 'current_price';
            var comparator = (document.getElementById('exit-comparator-' + id) || {}).value || 'value';

            var leftDaySelect = document.getElementById('exit-left-day-' + id);
            var leftDayVal = metric === 'current_price' ? 0 :
                (leftDaySelect && leftDaySelect.value === 'custom'
                    ? parseInt(document.getElementById('exit-left-day-custom-' + id).value) || 0
                    : parseInt((leftDaySelect || {}).value) || 0);

            var leftType = metric;
            if (metric === 'current_price' || metric === 'price') {
                leftType = (document.getElementById('exit-left-series-' + id) || {}).value || 'close';
            }

            var condition = {
                type: 'exit',
                metric: metric,
                left_day: leftDayVal,
                left_candle: metric === 'current_price' ? 'min' : ((document.getElementById('exit-left-candle-' + id) || {}).value || 'min'),
                left_multiplier: parseInt((document.getElementById('exit-left-mult-' + id) || {}).value) || 1,
                left_type: leftType,
                left_series: (document.getElementById('exit-left-series-' + id) || {}).value || 'close',
                left_window: parseInt((document.getElementById('exit-left-window-' + id) || {}).value) || 14,
                operation: (document.getElementById('exit-operator-' + id) || {}).value || '>',
                comparator: comparator
            };

            if (comparator === 'value') {
                condition.right_type = 'value';
                condition.right_fixed_value = parseFloat((document.getElementById('exit-compare-value-' + id) || {}).value) || 0;
                condition.right_day = 0;
                condition.right_candle = 'min';
                condition.right_multiplier = 1;
                condition.threshold_unit = '$';
                condition.threshold_value = 0;
            } else {
                var rightDaySelect = document.getElementById('exit-right-day-' + id);
                condition.right_day = rightDaySelect && rightDaySelect.value === 'custom'
                    ? parseInt(document.getElementById('exit-right-day-custom-' + id).value) || 0
                    : parseInt((rightDaySelect || {}).value) || 0;
                condition.right_candle = (document.getElementById('exit-right-candle-' + id) || {}).value || 'min';
                condition.right_multiplier = parseInt((document.getElementById('exit-right-mult-' + id) || {}).value) || 1;
                condition.right_series = (document.getElementById('exit-right-series-' + id) || {}).value || 'close';
                condition.right_window = parseInt((document.getElementById('exit-right-window-' + id) || {}).value) || 14;

                var rightBaseType = comparator.replace('compare_', '');
                if (rightBaseType === 'price') {
                    condition.right_type = condition.right_series || 'close';
                } else {
                    condition.right_type = rightBaseType;
                }

                condition.threshold_unit = (document.getElementById('exit-threshold-unit-' + id) || {}).value || '%';
                condition.threshold_value = parseFloat((document.getElementById('exit-threshold-value-' + id) || {}).value) || 0;
            }

            config.exit_custom_conditions.push(condition);
        });
    }

    // Exit criteria (TP/SL/Max Days)
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
    
    // Check entry conditions
    if (config.entry_type === 'preset') {
        if (!config.preset_operator || !config.preset_threshold) {
            return false;
        }
    } else {
        if (!config.custom_conditions || config.custom_conditions.length === 0) {
            return false;
        }
        for (const cond of config.custom_conditions) {
            if (cond.left_candle === 'day' && cond.left_day === 0 && ['close', 'high', 'low', 'vwap'].includes(cond.left_type)) {
                appAlert(`Invalid condition: cannot use day candle "${cond.left_type}" on day 0 — the current day has not closed yet. Use "open" or a negative day offset.`);
                return false;
            }
            if (cond.right_candle === 'day' && cond.right_day === 0 && ['close', 'high', 'low', 'vwap'].includes(cond.right_type)) {
                appAlert(`Invalid condition: cannot use day candle "${cond.right_type}" on day 0 — the current day has not closed yet. Use "open" or a negative day offset.`);
                return false;
            }
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
    
    // Check that at least one exit mechanism exists
    var hasTP = config.take_profit_value && parseFloat(config.take_profit_value) > 0;
    var hasSL = config.stop_loss_value && parseFloat(config.stop_loss_value) > 0;
    var hasMaxDays = config.max_days && parseInt(config.max_days) > 0;
    var hasExitPreset = config.exit_cond_type === 'preset' && config.exit_preset_condition;
    var hasExitCustom = config.exit_cond_type === 'custom' && config.exit_custom_conditions && config.exit_custom_conditions.length > 0;

    if (!hasTP && !hasSL && !hasMaxDays && !hasExitPreset && !hasExitCustom) {
        appAlert('At least one exit condition is required (Take Profit, Stop Loss, Max Days, or a custom/preset exit condition).');
        return false;
    }

    if (hasExitPreset) {
        var threshVal = parseFloat(config.exit_preset_threshold);
        if (isNaN(threshVal)) {
            appAlert('Exit preset threshold must be a valid number.');
            return false;
        }
        if (config.exit_preset_condition === '5') {
            var lookbackVal = parseInt(config.exit_velocity_lookback);
            if (isNaN(lookbackVal) || lookbackVal < 1) {
                appAlert('Exit velocity lookback must be a positive integer.');
                return false;
            }
        }
    }

    if (hasExitCustom) {
        for (var ec of config.exit_custom_conditions) {
            if (ec.left_candle === 'day' && ec.left_day === 0 && ['close', 'high', 'low', 'vwap'].includes(ec.left_type)) {
                appAlert('Invalid exit condition: cannot use day candle "' + ec.left_type + '" on day 0.');
                return false;
            }
            if (ec.right_candle === 'day' && ec.right_day === 0 && ['close', 'high', 'low', 'vwap'].includes(ec.right_type)) {
                appAlert('Invalid exit condition: cannot use day candle "' + ec.right_type + '" on day 0.');
                return false;
            }
        }
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

        if (typeof TierRestrictions !== 'undefined') TierRestrictions.disableCsvButtons();
        
        console.log('Results displayed successfully');
        
    } catch (error) {
        console.error('Error displaying results:', error);
        appAlert('Error loading results: ' + error.message);
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
        if (typeof TierRestrictions !== 'undefined' && !TierRestrictions.canDownloadCsv()) {
            return TierRestrictions.showUpgradeMessage('CSV download requires a Standard or Premium plan.');
        }
        if (!csvData) {
            appAlert('No CSV data available');
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
        viewStockResultDetail(backtestId);
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
    
    const isMobile = window.innerWidth <= 480;
    
    // Tight y-axis bounds
    const minVal = Math.min(...data.values);
    const maxVal = Math.max(...data.values);
    const dataRange = Math.max(maxVal - minVal, 1);
    const pad = dataRange * 0.08;

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
            maintainAspectRatio: false,
            layout: {
                padding: { top: 10, right: 10, bottom: 5, left: 5 }
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
                        padding: 4
                    },
                    border: { display: false }
                },
                y: {
                    display: true,
                    position: 'right',
                    min: minVal - pad,
                    max: maxVal + pad,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.06)',
                        borderDash: [4, 4],
                        drawBorder: false
                    },
                    ticks: {
                        font: { size: isMobile ? 10 : 11 },
                        color: '#9ca3af',
                        padding: 4,
                        count: 5,
                        mirror: true,
                        callback: function(value) {
                            if (Math.abs(value) >= 1000) {
                                return '  $' + (value / 1000).toFixed(0) + 'k';
                            }
                            return '  $' + Math.round(value).toLocaleString();
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
// USE TEMPLATE - APPLY CONFIG FROM RESULTS PAGE
// =============================================================================

function applyStockConfig(config) {
    if (!config) return;

    if (document.getElementById('backtestName') && config.name) {
        document.getElementById('backtestName').value = config.name;
    }

    if (document.getElementById('startDate') && config.start_date) {
        document.getElementById('startDate').value = config.start_date;
    }
    if (document.getElementById('endDate') && config.end_date) {
        document.getElementById('endDate').value = config.end_date;
    }

    var symbolMode = config.symbol_mode || 'single';
    var symbolRadio = document.querySelector(`input[name="symbol_mode"][value="${symbolMode}"]`);
    if (symbolRadio) {
        symbolRadio.checked = true;
        if (typeof updateSymbolMode === 'function') updateSymbolMode();
    }

    if (symbolMode === 'single' && config.symbol) {
        if (document.getElementById('singleSymbol')) document.getElementById('singleSymbol').value = config.symbol;
    } else if (symbolMode === 'multiple' && config.symbols) {
        if (document.getElementById('multipleSymbols')) {
            document.getElementById('multipleSymbols').value = Array.isArray(config.symbols) ? config.symbols.join(', ') : config.symbols;
        }
    }

    var entryType = config.entry_type || 'preset';
    var entryRadio = document.querySelector(`input[name="entry_type"][value="${entryType}"]`);
    if (entryRadio) {
        entryRadio.checked = true;
        if (typeof updateEntryType === 'function') updateEntryType();
    }

    if (entryType === 'preset') {
        if (document.getElementById('presetCondition') && config.preset_condition) {
            document.getElementById('presetCondition').value = config.preset_condition;
            if (typeof updatePresetFields === 'function') updatePresetFields();
        }
        if (config.preset_condition === '5') {
            if (document.getElementById('velocityLookback') && config.velocity_lookback) {
                document.getElementById('velocityLookback').value = config.velocity_lookback;
            }
            if (document.getElementById('velocityOperator') && config.preset_operator) {
                document.getElementById('velocityOperator').value = config.preset_operator;
            }
            if (document.getElementById('velocityThreshold') && config.preset_threshold) {
                document.getElementById('velocityThreshold').value = config.preset_threshold;
            }
        } else {
            if (document.getElementById('presetOperator') && config.preset_operator) {
                document.getElementById('presetOperator').value = config.preset_operator;
            }
            if (document.getElementById('presetThreshold') && config.preset_threshold) {
                document.getElementById('presetThreshold').value = config.preset_threshold;
            }
        }
    } else if (entryType === 'custom' && config.custom_conditions && config.custom_conditions.length > 0) {
        var existingConditions = document.querySelectorAll('.condition-item');
        existingConditions.forEach(function(el) { el.remove(); });
        conditionCount = 0;

        config.custom_conditions.forEach(function(cond, idx) {
            if (!cond.metric) {
                var lt = cond.left_type || 'close';
                var indicatorTypes = ['sma', 'ema', 'rsi', 'macd'];
                if (indicatorTypes.indexOf(lt) >= 0) {
                    cond.metric = lt;
                } else {
                    cond.metric = (cond.left_day === 0 && cond.left_candle === 'min') ? 'current_price' : 'price';
                }
                cond.left_series = cond.left_series || lt;
            }
            if (!cond.comparator) {
                var rt = cond.right_type || 'close';
                if (rt === 'value') {
                    cond.comparator = 'value';
                } else {
                    var rIndicators = ['sma', 'ema', 'rsi', 'macd'];
                    if (rIndicators.indexOf(rt) >= 0) {
                        cond.comparator = 'compare_' + rt;
                    } else {
                        cond.comparator = 'compare_price';
                    }
                    cond.right_series = cond.right_series || rt;
                }
            }

            if (typeof addCondition === 'function') addCondition();
            var id = conditionCount;

            var metricEl = document.getElementById('metric-' + id);
            if (metricEl && cond.metric) {
                metricEl.value = cond.metric;
                updateStockConditionFields(id);
            }

            var leftDayEl = document.getElementById('left-day-' + id);
            if (leftDayEl) {
                var leftDayVal = String(cond.left_day);
                var leftDayOption = leftDayEl.querySelector('option[value="' + leftDayVal + '"]');
                if (leftDayOption) {
                    leftDayEl.value = leftDayVal;
                } else {
                    leftDayEl.value = 'custom';
                    var customInput = document.getElementById('left-day-custom-' + id);
                    if (customInput) { customInput.style.display = ''; customInput.value = leftDayVal; }
                }
            }

            var leftCandleEl = document.getElementById('left-candle-' + id);
            if (leftCandleEl && cond.left_candle) leftCandleEl.value = cond.left_candle;

            var leftMultEl = document.getElementById('left-mult-' + id);
            if (leftMultEl && cond.left_multiplier) leftMultEl.value = cond.left_multiplier;

            var leftSeriesEl = document.getElementById('left-series-' + id);
            if (leftSeriesEl && cond.left_series) leftSeriesEl.value = cond.left_series;

            var leftWindowEl = document.getElementById('left-window-' + id);
            if (leftWindowEl && cond.left_window) leftWindowEl.value = cond.left_window;

            var operatorEl = document.getElementById('operator-' + id);
            if (operatorEl && cond.operation) operatorEl.value = cond.operation;

            var comparatorEl = document.getElementById('comparator-' + id);
            if (comparatorEl && cond.comparator) {
                comparatorEl.value = cond.comparator;
                updateStockRightSide(id);
            }

            var compareValueEl = document.getElementById('compare-value-' + id);
            if (compareValueEl && cond.right_fixed_value != null) compareValueEl.value = cond.right_fixed_value;

            var rightDayEl = document.getElementById('right-day-' + id);
            if (rightDayEl) {
                var rightDayVal = String(cond.right_day);
                var rightDayOption = rightDayEl.querySelector('option[value="' + rightDayVal + '"]');
                if (rightDayOption) {
                    rightDayEl.value = rightDayVal;
                } else {
                    rightDayEl.value = 'custom';
                    var customInput2 = document.getElementById('right-day-custom-' + id);
                    if (customInput2) { customInput2.style.display = ''; customInput2.value = rightDayVal; }
                }
            }

            var rightCandleEl = document.getElementById('right-candle-' + id);
            if (rightCandleEl && cond.right_candle) rightCandleEl.value = cond.right_candle;

            var rightMultEl = document.getElementById('right-mult-' + id);
            if (rightMultEl && cond.right_multiplier) rightMultEl.value = cond.right_multiplier;

            var rightSeriesEl = document.getElementById('right-series-' + id);
            if (rightSeriesEl && cond.right_series) rightSeriesEl.value = cond.right_series;

            var rightWindowEl = document.getElementById('right-window-' + id);
            if (rightWindowEl && cond.right_window) rightWindowEl.value = cond.right_window;

            var thresholdUnitEl = document.getElementById('threshold-unit-' + id);
            if (thresholdUnitEl && cond.threshold_unit) thresholdUnitEl.value = cond.threshold_unit;

            var thresholdValEl = document.getElementById('threshold-value-' + id);
            if (thresholdValEl && cond.threshold_value != null) thresholdValEl.value = cond.threshold_value;
        });
    }

    var direction = config.direction || 'long';
    var dirRadio = document.querySelector(`input[name="direction"][value="${direction}"]`);
    if (dirRadio) dirRadio.checked = true;

    var sizingType = config.sizing_type || 'shares';
    var sizingRadio = document.querySelector(`input[name="sizing_type"][value="${sizingType}"]`);
    if (sizingRadio) {
        sizingRadio.checked = true;
        if (typeof updateSizingType === 'function') updateSizingType();
    }

    if (sizingType === 'shares' && config.sizing_value) {
        var sharesEl = document.getElementById('stockSizingShares') || document.getElementById('sizingShares');
        if (sharesEl) sharesEl.value = config.sizing_value;
    } else if (sizingType === 'dollars' && config.sizing_value) {
        var dollarsEl = document.getElementById('stockSizingDollars') || document.getElementById('sizingDollars');
        if (dollarsEl) dollarsEl.value = config.sizing_value;
    } else if (sizingType === 'percent') {
        var pctEl = document.getElementById('stockSizingPercent') || document.getElementById('sizingPercent');
        if (pctEl && config.sizing_value) pctEl.value = config.sizing_value;
        if (document.getElementById('startingCapital') && config.starting_capital) {
            document.getElementById('startingCapital').value = config.starting_capital;
        }
    }

    if (config.take_profit_type) {
        var tpRadio = document.querySelector(`input[name="take_profit_type"][value="${config.take_profit_type}"]`);
        if (tpRadio) {
            tpRadio.checked = true;
            tpRadio.dispatchEvent(new Event('change'));
        }
    }
    if (document.getElementById('takeProfitValue') && config.take_profit_value) {
        document.getElementById('takeProfitValue').value = config.take_profit_value;
    }

    if (config.stop_loss_type) {
        var slRadio = document.querySelector(`input[name="stop_loss_type"][value="${config.stop_loss_type}"]`);
        if (slRadio) {
            slRadio.checked = true;
            slRadio.dispatchEvent(new Event('change'));
        }
    }
    if (document.getElementById('stopLossValue') && config.stop_loss_value) {
        document.getElementById('stopLossValue').value = config.stop_loss_value;
    }

    if (document.getElementById('maxDays') && config.max_days) {
        document.getElementById('maxDays').value = config.max_days;
    }

    if (document.getElementById('allowConsecutive')) {
        document.getElementById('allowConsecutive').checked = config.allow_consecutive_trades || false;
    }

    console.log('Stock config applied from Use Template');
}

var _stockRunningPollTimer = null;

async function checkForRunningStockBacktests() {
    try {
        var response = await authFetch('/api/backtest/running');
        if (!response.ok) return;
        var data = await response.json();
        if (data.has_running && data.running_backtests.length > 0) {
            var bt = data.running_backtests[0];
            showRunningStockBanner(bt.backtest_id, bt.type);
            disableStockSubmit(true);
            pollRunningStockBacktest(bt.backtest_id, bt.type);
        }
    } catch (e) {
        console.log('Could not check running backtests:', e);
    }
}

function showRunningStockBanner(backtestId, backtestType) {
    var existing = document.getElementById('runningStockBanner');
    if (existing) existing.remove();
    
    var banner = document.createElement('div');
    banner.id = 'runningStockBanner';
    banner.style.cssText = 'background: linear-gradient(135deg, #1e3a5f, #2d4a7c); border: 1px solid #3b7cff; border-radius: 10px; padding: 16px 20px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; gap: 15px;';
    var viewFunc = backtestType === 'stocks' ? 'viewStockResultDetail' : 'viewOptionsResultDetail';
    banner.innerHTML = '<div style="display:flex; align-items:center; gap:12px;">' +
        '<div class="spinner-border spinner-border-sm text-info" role="status"><span class="visually-hidden">Loading...</span></div>' +
        '<div><div style="color:#fff; font-weight:600;">Backtest In Progress</div>' +
        '<div style="color:#94b8db; font-size:13px;">Please wait for the current backtest to finish before starting a new one.</div></div></div>' +
        '<div style="display:flex; gap:10px;">' +
        '<button class="btn btn-sm btn-outline-info" onclick="' + viewFunc + '(\'' + backtestId + '\')"><i class="fas fa-eye"></i> View</button>' +
        '<button class="btn btn-sm btn-outline-danger" onclick="cancelStockBacktest(\'' + backtestId + '\')"><i class="fas fa-times"></i> Cancel</button></div>';
    
    var form = document.getElementById('stockBacktestForm');
    if (form) {
        form.parentNode.insertBefore(banner, form);
    }
}

function disableStockSubmit(disabled) {
    var btn = document.getElementById('runStockBacktestBtn');
    if (btn) {
        btn.disabled = disabled;
        btn.style.opacity = disabled ? '0.5' : '1';
        btn.style.cursor = disabled ? 'not-allowed' : 'pointer';
    }
}

function pollRunningStockBacktest(backtestId, backtestType) {
    if (_stockRunningPollTimer) clearInterval(_stockRunningPollTimer);
    var statusUrl = backtestType === 'stocks' ? '/api/stocks-backtest-v3/status/' + backtestId : '/api/backtest/status/' + backtestId;
    _stockRunningPollTimer = setInterval(async function() {
        try {
            var response = await authFetch(statusUrl);
            if (!response.ok) return;
            var data = await response.json();
            if (data.status !== 'running') {
                var banner = document.getElementById('runningStockBanner');
                if (banner) banner.remove();
                if (_stockRunningPollTimer) { clearInterval(_stockRunningPollTimer); _stockRunningPollTimer = null; }
                disableStockSubmit(false);
            }
        } catch (e) {}
    }, 3000);
}

async function cancelStockBacktest(backtestId) {
    if (!(await appConfirm('Are you sure you want to cancel this backtest?'))) return;
    try {
        var response = await authFetch('/api/backtest/cancel/' + backtestId, { method: 'POST' });
        if (response.ok) {
            var banner = document.getElementById('runningStockBanner');
            if (banner) banner.remove();
            if (_stockRunningPollTimer) { clearInterval(_stockRunningPollTimer); _stockRunningPollTimer = null; }
            disableStockSubmit(false);
        }
    } catch (e) {
        console.error('Cancel error:', e);
    }
}

