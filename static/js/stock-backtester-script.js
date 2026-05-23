// Stock Backtester V3.0 - Form Handler
// Handles dynamic fields, validation, and submission

let conditionCount = 0;
let exitConditionCount = 0;
let exitConditionNextId = 0;

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
        var startEl = document.getElementById('stockStartDate');
        var endEl = document.getElementById('stockEndDate');
        TierRestrictions.applyDateConstraints(startEl, endEl);
        if (TierRestrictions.isFree()) {
            var multiRadio = document.querySelector('#stockBacktesterPage input[name="symbol_mode"][value="multiple"]');
            if (multiRadio) { multiRadio.disabled = true; }
            var multiToggleBtn = document.querySelector('#stockBacktesterPage .bt-toggle-btn[data-val="multiple"]');
            if (multiToggleBtn) { multiToggleBtn.disabled = true; multiToggleBtn.style.opacity = '0.5'; multiToggleBtn.style.cursor = 'not-allowed'; multiToggleBtn.title = 'Multiple symbols requires Standard or Premium plan'; }
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
        console.log('Default dates set');
        
        // Initialize with one condition if custom is selected
        updateEntryType();
        
        console.log('Entry type initialized');
        
        // Form submission (remove old handler first to prevent duplicates on SPA re-init)
        const form = document.getElementById('stockBacktestForm');
        if (form) {
            form.removeEventListener('submit', handleSubmit);
            form.addEventListener('submit', handleSubmit);
            console.log('✓ Form submit handler attached');
        } else {
            console.error('ERROR: stockBacktestForm not found!');
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
        
        // Sync redesigned toggle button visual states
        syncStockToggleUI();
    }
}

function syncStockToggleUI() {
    var page = document.getElementById('stockBacktesterPage');
    if (!page) return;
    page.querySelectorAll('.bt-toggle-btn[data-radio]').forEach(function(btn) {
        var radioName = btn.dataset.radio;
        var val = btn.dataset.val;
        var radio = document.querySelector('input[name="' + radioName + '"][value="' + val + '"]');
        btn.classList.toggle('on', radio ? radio.checked : false);
    });
    page.querySelectorAll('.alloc-type-btn[data-alloc]').forEach(function(btn) {
        var radio = document.querySelector('input[name="sizing_type"][value="' + btn.dataset.alloc + '"]');
        btn.classList.toggle('on', radio ? radio.checked : false);
    });
    setStockTpType(document.getElementById('stockTpPct').checked ? 'percent' : 'dollar');
    setStockSlType(document.getElementById('stockSlPct').checked ? 'percent' : 'dollar');
    setStockSizing(document.querySelector('input[name="sizing_type"]:checked').value);
    var consecutive = document.getElementById('allowConsecutive');
    page.querySelectorAll('.bt-toggle-btn[data-radio="_stockConsecutive"]').forEach(function(btn) {
        btn.classList.toggle('on', (btn.dataset.val === 'yes') === consecutive.checked);
    });
}

const STOCK_METRICS = [
    { value: 'current_price', label: 'Current Price' },
    { value: 'price', label: 'Price' },
    { value: 'volume', label: 'Volume' },
    { value: 'sma', label: 'SMA' },
    { value: 'ema', label: 'EMA' },
    { value: 'rsi', label: 'RSI' },
    { value: 'macd', label: 'MACD' },
    { value: 'trend_capture', label: 'Trend Capture' },
    { value: 'candle_pattern', label: 'Candle Pattern' }
];

function _buildCandlePatternPanel(pfx, n) {
    return `<div id="${pfx}cp-panel-${n}" class="mt-2 p-3 rounded" style="display:none;background:#fdf4ff;border:1px solid #d8b4fe;">
      <div class="fw-semibold mb-2" style="font-size:11px;color:#7e22ce;text-transform:uppercase;letter-spacing:0.6px;">
        <i class="fas fa-chart-bar me-1"></i>Candle Pattern Config
      </div>
      <div class="row g-2 mb-3">
        <div class="col-md-3 col-sm-6">
          <label class="form-label small">Day</label>
          <select class="form-select form-select-sm" id="${pfx}cp-day-${n}">
            <option value="0">Today (0)</option><option value="-1">Yesterday (-1)</option>
            <option value="-2">2 Days Ago (-2)</option><option value="-3">3 Days Ago (-3)</option>
          </select>
        </div>
        <div class="col-md-3 col-sm-6">
          <label class="form-label small">Candle Type</label>
          <select class="form-select form-select-sm" id="${pfx}cp-candle-${n}"
            onchange="_cpUpdateMultMax('${pfx}',${n})">
            <option value="min">Minute</option><option value="hr">Hour</option>
          </select>
        </div>
        <div class="col-md-2 col-sm-6">
          <label class="form-label small">Multiplier <small class="text-muted">(max 4h)</small></label>
          <input type="number" class="form-control form-control-sm" id="${pfx}cp-mult-${n}" min="1" max="240" value="1">
        </div>
        <div class="col-md-3 col-sm-6">
          <label class="form-label small"># Candles in Sequence</label>
          <select class="form-select form-select-sm" id="${pfx}cp-count-${n}" onchange="_updateCpCandleCount('${pfx}',${n},parseInt(this.value))">
            <option value="1">1</option><option value="2">2</option><option value="3">3</option>
            <option value="4">4</option><option value="5">5</option>
          </select>
        </div>
        <div class="col-12">
          <div class="form-check mt-1">
            <input class="form-check-input" type="checkbox" id="${pfx}cp-include-current-${n}">
            <label class="form-check-label small" for="${pfx}cp-include-current-${n}">
              Include entry bar itself <span class="text-muted">(check the current bar instead of prior bars)</span>
            </label>
          </div>
        </div>
      </div>
      <div id="${pfx}cp-candles-${n}"></div>
    </div>`;
}

function _buildCpCandleSection(pfx, n, k) {
    var prevLabel = k > 1 ? `Candle ${k-1} open` : '';
    var openRelHtml = k > 1 ? `
      <div class="mt-2 mb-1">
        <div class="form-check">
          <input class="form-check-input" type="checkbox" id="${pfx}cp-openrel-cb-${k}-${n}"
            onchange="_cpToggleOpenRel('${pfx}',${n},${k})">
          <label class="form-check-label small" for="${pfx}cp-openrel-cb-${k}-${n}">
            Open relative to prior candle <span class="text-muted">(optional)</span>
          </label>
        </div>
        <div id="${pfx}cp-openrel-fields-${k}-${n}" style="opacity:0.4;pointer-events:none;" class="d-flex align-items-center gap-2 mt-1 ms-1 flex-wrap">
          <span class="small text-muted">Opens</span>
          <select class="form-select form-select-sm" id="${pfx}cp-openrel-dir-${k}-${n}" style="width:auto;" disabled>
            <option value="above">above</option><option value="below">below</option>
          </select>
          <span class="small text-muted">${prevLabel}</span>
        </div>
      </div>` : '';
    var prevRangeOpts = '';
    for (var _j = 1; _j < k; _j++) { prevRangeOpts += `<option value="range_${_j}">Range of Candle ${_j}</option>`; }
    return `<div class="card p-2 mb-2" id="${pfx}cp-c-${k}-${n}" style="background:#fefce8;border:1px solid #fde047;">
      <div class="fw-semibold small mb-2" style="color:#92400e;">Candle ${k}</div>
      <div class="mb-2">
        <label class="form-label small mb-1">Direction</label>
        <div class="d-flex gap-2">
          <button type="button" class="btn btn-sm btn-success" id="${pfx}cp-dir-bull-${k}-${n}"
            onclick="_cpSetDir('${pfx}',${n},${k},'bullish')" style="min-width:90px;">
            <i class="fas fa-arrow-up me-1"></i>Bullish
          </button>
          <button type="button" class="btn btn-sm btn-outline-danger" id="${pfx}cp-dir-bear-${k}-${n}"
            onclick="_cpSetDir('${pfx}',${n},${k},'bearish')" style="min-width:90px;">
            <i class="fas fa-arrow-down me-1"></i>Bearish
          </button>
        </div>
        <input type="hidden" id="${pfx}cp-direction-${k}-${n}" value="bullish">
      </div>
      ${openRelHtml}
      <div class="mt-2 pt-2" style="border-top:1px dashed #fde047;">
        <div class="form-check">
          <input class="form-check-input" type="checkbox" id="${pfx}cp-range-cb-${k}-${n}"
            onchange="_cpToggleRange('${pfx}',${n},${k})">
          <label class="form-check-label small fw-semibold" for="${pfx}cp-range-cb-${k}-${n}">
            Range Condition <span class="fw-normal text-muted">(optional)</span>
          </label>
        </div>
        <div id="${pfx}cp-range-fields-${k}-${n}" style="display:none;" class="row g-2 mt-1">
          <div class="col-md-3 col-sm-6">
            <label class="form-label small">Range</label>
            <select class="form-select form-select-sm" id="${pfx}cp-range-type-${k}-${n}">
              <option value="open_close">Open – Close (Body)</option>
              <option value="high_low">High – Low (Total)</option>
              <option value="close_high">Close – High (Upper Wick)</option>
              <option value="close_low">Close – Low (Lower Wick)</option>
              <option value="open_low">Open – Low</option>
              <option value="open_high">Open – High</option>
            </select>
          </div>
          <div class="col-md-2 col-sm-6">
            <label class="form-label small">Operator</label>
            <select class="form-select form-select-sm" id="${pfx}cp-op-${k}-${n}">
              <option value=">">&gt;</option><option value="<">&lt;</option>
              <option value=">=">&gt;=</option><option value="<=">&lt;=</option>
              <option value="=">=</option><option value="!=">!=</option>
              <option value="><">⊂ Within</option><option value="<>">⊃ Outside</option>
            </select>
          </div>
          <div class="col-md-3 col-sm-6">
            <label class="form-label small">Comparator</label>
            <select class="form-select form-select-sm" id="${pfx}cp-comp-${k}-${n}"
              onchange="_cpUpdateComparatorFields('${pfx}',${n},${k})">
              <option value="value_dollar">$ Value</option>
              <option value="value_pct">% of Close</option>
              <option value="pct_avg_range">% Avg Range</option>
              <option value="dollar_avg_range">$ Avg Range</option>
              <option value="range_same">Range of Same Candle</option>
              ${prevRangeOpts}
            </select>
          </div>
          <div class="col-md-3 col-sm-6" id="${pfx}cp-comp-range-grp-${k}-${n}" style="display:none;">
            <label class="form-label small">Compare Range</label>
            <select class="form-select form-select-sm" id="${pfx}cp-comp-range-type-${k}-${n}">
              <option value="open_close">Open – Close</option><option value="high_low">High – Low</option>
              <option value="close_high">Close – High</option><option value="close_low">Close – Low</option>
              <option value="open_low">Open – Low</option><option value="open_high">Open – High</option>
            </select>
          </div>
          <div class="col-md-2 col-sm-6">
            <label class="form-label small">Value</label>
            <input type="number" class="form-control form-control-sm" id="${pfx}cp-val-${k}-${n}" step="0.01" min="0" placeholder="e.g. 0.5">
          </div>
          <div class="col-12">
            <small class="text-muted" id="${pfx}cp-hint-${k}-${n}"></small>
          </div>
        </div>
      </div>
    </div>`;
}

function _updateCpCandleCount(pfx, n, count) {
    var container = document.getElementById(pfx + 'cp-candles-' + n);
    if (!container) return;
    count = Math.max(1, Math.min(5, parseInt(count) || 1));
    for (var k = 5; k > count; k--) {
        var el = document.getElementById(pfx + 'cp-c-' + k + '-' + n);
        if (el) el.remove();
    }
    for (var k = 1; k <= count; k++) {
        if (!document.getElementById(pfx + 'cp-c-' + k + '-' + n)) {
            container.insertAdjacentHTML('beforeend', _buildCpCandleSection(pfx, n, k));
            _cpSetDir(pfx, n, k, 'bullish');
        }
    }
}

function _cpSetDir(pfx, n, k, dir) {
    var hidden = document.getElementById(pfx + 'cp-direction-' + k + '-' + n);
    if (hidden) hidden.value = dir;
    var bull = document.getElementById(pfx + 'cp-dir-bull-' + k + '-' + n);
    var bear = document.getElementById(pfx + 'cp-dir-bear-' + k + '-' + n);
    if (bull) { bull.className = dir === 'bullish' ? 'btn btn-sm btn-success' : 'btn btn-sm btn-outline-success'; bull.style.minWidth = '90px'; }
    if (bear) { bear.className = dir === 'bearish' ? 'btn btn-sm btn-danger' : 'btn btn-sm btn-outline-danger'; bear.style.minWidth = '90px'; }
}

function _cpUpdateMultMax(pfx, n) {
    var candleSel = document.getElementById(pfx + 'cp-candle-' + n);
    var multInp   = document.getElementById(pfx + 'cp-mult-' + n);
    if (!candleSel || !multInp) return;
    var maxV = candleSel.value === 'hr' ? 4 : 240;
    multInp.max = maxV;
    var cur = parseInt(multInp.value) || 1;
    if (cur > maxV) multInp.value = maxV;
}

function _cpToggleOpenRel(pfx, n, k) {
    var cb  = document.getElementById(pfx + 'cp-openrel-cb-' + k + '-' + n);
    var f   = document.getElementById(pfx + 'cp-openrel-fields-' + k + '-' + n);
    var sel = document.getElementById(pfx + 'cp-openrel-dir-' + k + '-' + n);
    var active = !!(cb && cb.checked);
    if (f) { f.style.opacity = active ? '1' : '0.4'; f.style.pointerEvents = active ? '' : 'none'; }
    if (sel) sel.disabled = !active;
}

function _cpToggleRange(pfx, n, k) {
    var cb = document.getElementById(pfx + 'cp-range-cb-' + k + '-' + n);
    var f  = document.getElementById(pfx + 'cp-range-fields-' + k + '-' + n);
    if (f) f.style.display = (cb && cb.checked) ? '' : 'none';
    _cpUpdateComparatorFields(pfx, n, k);
}

function _cpUpdateComparatorFields(pfx, n, k) {
    var comp = (document.getElementById(pfx + 'cp-comp-' + k + '-' + n) || {}).value || 'value_dollar';
    var grp  = document.getElementById(pfx + 'cp-comp-range-grp-' + k + '-' + n);
    var isRangeRef = comp === 'range_same' || /^range_\d+$/.test(comp);
    if (grp) grp.style.display = isRangeRef ? '' : 'none';
    var hint = document.getElementById(pfx + 'cp-hint-' + k + '-' + n);
    if (hint) {
        var _hints = {
            value_dollar: 'Compare range in $ (e.g. body > $0.50)',
            value_pct: 'Compare range as % of close price (e.g. 0.5 = 0.5% of close)',
            pct_avg_range: 'Compare range as % of average range (e.g. 150 = 1.5× avg range)',
            dollar_avg_range: 'Compare range as $ multiple of average range (e.g. 1.5 = 1.5× avg)',
            range_same: 'Compare this range against another range of the same candle (% ratio)'
        };
        var hintText = _hints[comp];
        if (!hintText && /^range_\d+$/.test(comp)) {
            hintText = 'Compare this range against a range of Candle ' + comp.split('_')[1] + ' (% ratio)';
        }
        hint.textContent = hintText || '';
    }
}

function _serializeCpCandles(pfx, n, id) {
    var numCandles = parseInt((document.getElementById(pfx + 'cp-count-' + id) || {}).value) || 1;
    var out = [];
    for (var k = 1; k <= numCandles; k++) {
        var spec = {
            direction: (document.getElementById(pfx + 'cp-direction-' + k + '-' + id) || {}).value || 'bullish'
        };
        var openRelCb = document.getElementById(pfx + 'cp-openrel-cb-' + k + '-' + id);
        if (openRelCb && openRelCb.checked) {
            spec.open_rel = (document.getElementById(pfx + 'cp-openrel-dir-' + k + '-' + id) || {}).value || 'above';
        }
        var rangeCb = document.getElementById(pfx + 'cp-range-cb-' + k + '-' + id);
        spec.range_enabled = !!(rangeCb && rangeCb.checked);
        if (spec.range_enabled) {
            spec.range_type  = (document.getElementById(pfx + 'cp-range-type-' + k + '-' + id) || {}).value || 'open_close';
            spec.operator    = (document.getElementById(pfx + 'cp-op-' + k + '-' + id) || {}).value || '>';
            spec.comparator  = (document.getElementById(pfx + 'cp-comp-' + k + '-' + id) || {}).value || 'value_dollar';
            spec.range_value = parseFloat((document.getElementById(pfx + 'cp-val-' + k + '-' + id) || {}).value) || 0;
            if (spec.comparator === 'range_same' || /^range_\d+$/.test(spec.comparator)) {
                spec.comp_range_type = (document.getElementById(pfx + 'cp-comp-range-type-' + k + '-' + id) || {}).value || 'open_close';
            }
        }
        out.push(spec);
    }
    return out;
}

function setCrossOperators(selectId, include) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    var crossVals = ['cross_up', 'cross_down', 'cross_either'];
    var savedVal = sel.value;
    crossVals.forEach(function(v) {
        var ex = sel.querySelector('option[value="' + v + '"]');
        if (ex) ex.remove();
    });
    if (include) {
        [
            ['cross_up',     'Cross Up ↑ (was below, now above)'],
            ['cross_down',   'Cross Down ↓ (was above, now below)'],
            ['cross_either', 'Cross (Either Direction)']
        ].forEach(function(pair) {
            var opt = document.createElement('option');
            opt.value = pair[0];
            opt.textContent = pair[1];
            sel.appendChild(opt);
        });
        if (crossVals.indexOf(savedVal) !== -1) sel.value = savedVal;
    } else {
        if (crossVals.indexOf(sel.value) !== -1) sel.value = '>';
    }
}

function toggleTCOptional(side, field, n) {
    var fieldsId = 'tc-' + side + '-' + field + '-fields-' + n;
    var enabledId = 'tc-' + side + '-' + field + '-enabled-' + n;
    var cb = document.getElementById(enabledId);
    var fields = document.getElementById(fieldsId);
    if (fields) fields.style.display = (cb && cb.checked) ? 'flex' : 'none';
}

function _buildTCPanel(side, n) {
    var s = 'tc-' + side;
    return `
        <div id="${s}-panel-${n}" class="mt-2 p-3 rounded" style="display:none; background:#f0f7ff; border:1px solid #bfdbfe;">
            <div class="fw-semibold mb-2" style="font-size:11px; color:#1e40af; text-transform:uppercase; letter-spacing:0.6px;">
                <i class="fas fa-wave-square me-1"></i>Trend Capture Config
            </div>
            <div class="row g-2">
                <div class="col-md-3 col-sm-6">
                    <label class="form-label small">Interval</label>
                    <select class="form-select form-select-sm" id="${s}-interval-${n}">
                        <option value="15min">15 min</option>
                        <option value="30min">30 min</option>
                        <option value="1hr" selected>1 hr</option>
                        <option value="2hr">2 hr</option>
                    </select>
                </div>
                <div class="col-md-3 col-sm-6">
                    <label class="form-label small">Time Window</label>
                    <select class="form-select form-select-sm" id="${s}-time-window-${n}">
                        <option value="day_of_entry" selected>Day of Entry</option>
                        <option value="prior_day">Prior Day</option>
                        <option value="week_of_entry">Week of Entry</option>
                        <option value="month_of_entry">Month of Entry</option>
                    </select>
                </div>
                <div class="col-md-3 col-sm-6">
                    <label class="form-label small">Price Type</label>
                    <select class="form-select form-select-sm" id="${s}-price-type-${n}">
                        <option value="highest_high">Highest High</option>
                        <option value="lowest_low" selected>Lowest Low</option>
                    </select>
                </div>
                <div class="col-md-3 col-sm-6">
                    <label class="form-label small">Slope Direction</label>
                    <select class="form-select form-select-sm" id="${s}-slope-dir-${n}">
                        <option value="negative" selected>Negative</option>
                        <option value="positive">Positive</option>
                    </select>
                </div>
            </div>
            <div class="mt-2">
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="${s}-slope-val-enabled-${n}" onchange="toggleTCOptional('${side}','slope-val',${n})">
                    <label class="form-check-label small" for="${s}-slope-val-enabled-${n}">
                        Slope Value <span class="text-muted">(optional)</span>
                    </label>
                </div>
                <div id="${s}-slope-val-fields-${n}" style="display:none;" class="row g-2 mt-1 ms-1 align-items-center">
                    <div class="col-auto">
                        <select class="form-select form-select-sm" id="${s}-slope-op-${n}" style="width:72px;">
                            <option value=">">&gt;</option>
                            <option value="<">&lt;</option>
                            <option value=">=">&gt;=</option>
                            <option value="<=">&lt;=</option>
                            <option value="=">=</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <input type="number" class="form-control form-control-sm" id="${s}-slope-val-${n}" step="0.0001" placeholder="e.g. -0.05">
                    </div>
                    <div class="col-12"><small class="text-muted">Slope is price change per bar. Negative slope example: -0.05 means price drops ~$0.05 per interval.</small></div>
                </div>
            </div>
            <div class="mt-2">
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="${s}-r-enabled-${n}" onchange="toggleTCOptional('${side}','r',${n})">
                    <label class="form-check-label small" for="${s}-r-enabled-${n}">
                        R Value <span class="text-muted">(optional — measures trend linearity, 0–1)</span>
                    </label>
                </div>
                <div id="${s}-r-fields-${n}" style="display:none;" class="row g-2 mt-1 ms-1 align-items-center">
                    <div class="col-auto">
                        <select class="form-select form-select-sm" id="${s}-r-op-${n}" style="width:72px;">
                            <option value="<">&lt;</option>
                            <option value=">">&gt;</option>
                            <option value=">=">&gt;=</option>
                            <option value="<=">&lt;=</option>
                            <option value="=">=</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <input type="number" class="form-control form-control-sm" id="${s}-r-val-${n}" step="0.01" min="-1" max="1" placeholder="e.g. -0.7">
                    </div>
                    <div class="col-12"><small class="text-muted">Positive slope: R between 0 and 1. Negative slope: R between -1 and 0. Closer to ±1 = stronger linear trend.</small></div>
                </div>
            </div>
        </div>
    `;
}

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
            <strong class="text-muted"><span id="cond-mode-label-${n}">Condition ${n} — ${n === 1 ? 'Phase 1: Initial Trigger' : 'Phase 1: Prerequisite'}</span></strong>
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
                <!-- MACD specific fields -->
                <div class="col-md-3 col-sm-6" id="left-macd-short-group-${n}" style="display:none;">
                    <label class="form-label small">Short Window</label>
                    <input type="number" class="form-control form-control-sm" id="left-macd-short-${n}" value="12" min="1">
                </div>
                <div class="col-md-3 col-sm-6" id="left-macd-long-group-${n}" style="display:none;">
                    <label class="form-label small">Long Window</label>
                    <input type="number" class="form-control form-control-sm" id="left-macd-long-${n}" value="26" min="1">
                </div>
                <div class="col-md-3 col-sm-6" id="left-macd-signal-group-${n}" style="display:none;">
                    <label class="form-label small">Signal Window</label>
                    <input type="number" class="form-control form-control-sm" id="left-macd-signal-${n}" value="9" min="1">
                </div>
                <div class="col-md-3 col-sm-6" id="left-macd-component-group-${n}" style="display:none;">
                    <label class="form-label small">Component</label>
                    <select class="form-select form-select-sm" id="left-macd-component-${n}" onchange="updateStockMacdComparatorOptions(${n})">
                        <option value="histogram">Histogram</option>
                        <option value="signal">Signal</option>
                        <option value="macd_line">MACD Line</option>
                    </select>
                </div>
            </div>
            ${_buildTCPanel('left', n)}
            ${_buildCandlePatternPanel('', n)}
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
                        <option value="><">&gt;&lt; (between)</option>
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
                    <label class="form-label" id="value-label-${n}">Value</label>
                    <input type="number" class="form-control" id="compare-value-${n}" step="0.01" placeholder="e.g., 50" oninput="updateConditionSummary(${n}, false)">
                </div>
                <div class="col-md-3" id="value-high-input-group-${n}" style="display:none;">
                    <label class="form-label">High Value</label>
                    <input type="number" class="form-control" id="compare-value-high-${n}" step="0.01" placeholder="e.g., 60" oninput="updateConditionSummary(${n}, false)">
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
                    <label class="form-label small" id="threshold-value-label-${n}">Threshold Value</label>
                    <input type="number" class="form-control form-control-sm" id="threshold-value-${n}" step="0.01" placeholder="e.g., 2.5" oninput="updateConditionSummary(${n}, false)">
                </div>
                <div class="col-md-3 col-sm-6" id="threshold-value-high-group-${n}" style="display:none;">
                    <label class="form-label small">High Threshold Value</label>
                    <input type="number" class="form-control form-control-sm" id="threshold-value-high-${n}" step="0.01" placeholder="e.g., 5.0" oninput="updateConditionSummary(${n}, false)">
                </div>
            </div>
        </div>

        <div id="tc-right-wrapper-${n}" style="display:none;" class="mb-3">
            <label class="form-label fw-bold">Right Side — Trend Capture</label>
            ${_buildTCPanel('right', n)}
        </div>

        <div id="cond-summary-${n}" class="mt-2 px-2 py-1 rounded" style="background:#e8f4fd;color:#1e40af;font-size:11px;font-family:monospace;display:none;"></div>

        <div class="mt-2 pt-2" style="border-top: 1px dashed #dee2e6;">
            <div class="form-check">
                <input class="form-check-input" type="checkbox" id="time-window-enabled-${n}" onchange="toggleTimeWindow(${n}, false)">
                <label class="form-check-label small" for="time-window-enabled-${n}">
                    <strong>Restrict to time window</strong> <span class="text-muted">(optional)</span>
                </label>
            </div>
            <div id="time-window-fields-${n}" style="display:none;" class="mt-2">
                <div class="row g-2">
                    <div class="col-md-3 col-sm-6">
                        <label class="form-label small">From (HH:MM)</label>
                        <input type="time" class="form-control form-control-sm" id="time-window-start-${n}" value="09:30">
                    </div>
                    <div class="col-md-3 col-sm-6">
                        <label class="form-label small">To (HH:MM)</label>
                        <input type="time" class="form-control form-control-sm" id="time-window-end-${n}" value="16:00">
                    </div>
                    <div class="col-12">
                        <small class="text-muted">Condition is only evaluated if the candle falls within this time range (e.g. 04:00–09:29 for premarket).</small>
                    </div>
                </div>
            </div>
        </div>

        ${n === 1 ? `
        <div class="mt-2 pt-2" style="border-top: 1px dashed #dee2e6;">
            <div class="d-flex align-items-center gap-2 px-1 py-1 rounded" style="background:#f0f4ff;border:1px dashed #a5b4fc;">
                <i class="fas fa-layer-group" style="color:#6366f1;font-size:13px;"></i>
                <small style="color:#4b5563;"><strong style="color:#4338ca;">Sequential Phase</strong> — click <em>Add Condition</em> below to enable: each new condition can be set to trigger <em>after</em> the previous one fires, not simultaneously.</small>
            </div>
        </div>` : `
        <div id="seq-section-${n}" class="mt-2 pt-2" style="border-top: 1px dashed #dee2e6;">
            <div class="form-check form-switch mb-1">
                <input class="form-check-input" type="checkbox" id="seq-enabled-${n}" onchange="_updateSeqMode(${n})">
                <label class="form-check-label small fw-bold" for="seq-enabled-${n}" style="color:#374151;">
                    Sequential Phase
                    <span style="font-weight:400;color:#6b7280;">— triggers <em>after</em> previous condition fires, not simultaneously</span>
                </label>
            </div>
            <div id="seq-fields-${n}" style="display:none;" class="mt-2">
                <div class="row g-2 align-items-end">
                    <div class="col-md-4 col-sm-6">
                        <label class="form-label small">Max Wait Bars <span class="text-muted">(0 = no limit)</span></label>
                        <input type="number" class="form-control form-control-sm" id="seq-max-wait-${n}" value="0" min="0" max="500" placeholder="e.g. 10">
                    </div>
                    <div class="col-12">
                        <small class="text-muted">Entry fires when this condition triggers after the previous phase. Set <strong>Max Wait Bars &gt; 0</strong> to auto-reset and re-arm if this phase does not trigger in time.</small>
                    </div>
                </div>
            </div>
        </div>`}
    `;

    container.appendChild(conditionDiv);
    conditionDiv.addEventListener('change', function() { updateConditionSummary(n, false); });
    conditionDiv.addEventListener('input', function() { updateConditionSummary(n, false); });
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

    // Always hide the TC left panel first; show it only for trend_capture
    var tcLeftPanel = document.getElementById('tc-left-panel-' + n);
    if (tcLeftPanel) tcLeftPanel.style.display = 'none';

    // Always hide the CP panel first; show it only for candle_pattern
    var cpPanel = document.getElementById('cp-panel-' + n);
    if (cpPanel) cpPanel.style.display = 'none';

    // Always hide MACD-specific fields; show them only for MACD
    var macdShortGroup = document.getElementById('left-macd-short-group-' + n);
    var macdLongGroup = document.getElementById('left-macd-long-group-' + n);
    var macdSignalGroup = document.getElementById('left-macd-signal-group-' + n);
    var macdComponentGroup = document.getElementById('left-macd-component-group-' + n);
    if (macdShortGroup) macdShortGroup.style.display = 'none';
    if (macdLongGroup) macdLongGroup.style.display = 'none';
    if (macdSignalGroup) macdSignalGroup.style.display = 'none';
    if (macdComponentGroup) macdComponentGroup.style.display = 'none';

    if (val === 'candle_pattern') {
        if (leftDayGroup) leftDayGroup.style.display = 'none';
        if (leftCandleGroup) leftCandleGroup.style.display = 'none';
        if (leftMultGroup) leftMultGroup.style.display = 'none';
        if (leftWindowGroup) leftWindowGroup.style.display = 'none';
        if (leftSeriesGroup) leftSeriesGroup.style.display = 'none';
        if (cpPanel) {
            cpPanel.style.display = 'block';
            var cpCont = document.getElementById('cp-candles-' + n);
            if (cpCont && cpCont.children.length === 0) _updateCpCandleCount('', n, 1);
        }
        var condDiv = document.getElementById('condition-' + n);
        if (condDiv) {
            var opRow = condDiv.querySelector('.condition-operator');
            if (opRow) opRow.style.display = 'none';
            var rs = document.getElementById('right-side-' + n);
            if (rs) rs.style.display = 'none';
            var tcRW = document.getElementById('tc-right-wrapper-' + n);
            if (tcRW) tcRW.style.display = 'none';
        }
        updateStockComparatorOptions(n, []);
        return;
    } else {
        var condDiv = document.getElementById('condition-' + n);
        if (condDiv) {
            var opRow = condDiv.querySelector('.condition-operator');
            if (opRow) opRow.style.display = '';
        }
    }

    if (val === 'trend_capture') {
        if (leftDayGroup) leftDayGroup.style.display = 'none';
        if (leftCandleGroup) leftCandleGroup.style.display = 'none';
        if (leftMultGroup) leftMultGroup.style.display = 'none';
        if (leftWindowGroup) leftWindowGroup.style.display = 'none';
        if (leftSeriesGroup) leftSeriesGroup.style.display = 'none';
        if (tcLeftPanel) tcLeftPanel.style.display = 'block';
        updateStockComparatorOptions(n, ['value', 'compare_trend_capture']);
        setCrossOperators('operator-' + n, false);
        updateThresholdUnitOptions(n, val, false);
        updateStockRightSide(n);
        return;
    } else if (val === 'current_price') {
        if (leftDayGroup) leftDayGroup.style.display = 'none';
        if (leftCandleGroup) leftCandleGroup.style.display = 'none';
        if (leftMultGroup) leftMultGroup.style.display = 'none';
        if (leftWindowGroup) leftWindowGroup.style.display = 'none';
        if (leftSeriesGroup) leftSeriesGroup.style.display = 'none';
        updateStockComparatorOptions(n, ['value', 'compare_price', 'compare_sma', 'compare_ema', 'change_pct_window', 'roc_window']);
        setCrossOperators('operator-' + n, false);
    } else if (val === 'price') {
        if (leftDayGroup) leftDayGroup.style.display = 'block';
        if (leftCandleGroup) leftCandleGroup.style.display = 'block';
        if (leftMultGroup) leftMultGroup.style.display = 'block';
        if (leftWindowGroup) leftWindowGroup.style.display = 'none';
        if (leftSeriesGroup) leftSeriesGroup.style.display = 'block';
        if (leftSeriesLabel) leftSeriesLabel.textContent = 'Price Type';
        updateStockComparatorOptions(n, ['value', 'compare_price', 'compare_sma', 'compare_ema', 'change_pct_window', 'roc_window']);
        setCrossOperators('operator-' + n, false);
    } else if (val === 'sma' || val === 'ema') {
        if (leftDayGroup) leftDayGroup.style.display = 'block';
        if (leftCandleGroup) leftCandleGroup.style.display = 'block';
        if (leftMultGroup) leftMultGroup.style.display = 'block';
        if (leftWindowGroup) leftWindowGroup.style.display = 'block';
        if (leftSeriesGroup) leftSeriesGroup.style.display = 'block';
        if (leftWindowLabel) leftWindowLabel.textContent = 'Window';
        if (leftSeriesLabel) leftSeriesLabel.textContent = 'Series Type';
        updateStockComparatorOptions(n, ['value', 'compare_price', 'compare_sma', 'compare_ema', 'change_pct_window', 'roc_window']);
        setCrossOperators('operator-' + n, true);
    } else if (val === 'rsi') {
        if (leftDayGroup) leftDayGroup.style.display = 'block';
        if (leftCandleGroup) leftCandleGroup.style.display = 'block';
        if (leftMultGroup) leftMultGroup.style.display = 'block';
        if (leftWindowGroup) leftWindowGroup.style.display = 'block';
        if (leftSeriesGroup) leftSeriesGroup.style.display = 'block';
        if (leftWindowLabel) leftWindowLabel.textContent = 'Window';
        if (leftSeriesLabel) leftSeriesLabel.textContent = 'Series Type';
        updateStockComparatorOptions(n, ['value']);
        setCrossOperators('operator-' + n, false);
    } else if (val === 'volume') {
        if (leftDayGroup) leftDayGroup.style.display = 'block';
        if (leftCandleGroup) leftCandleGroup.style.display = 'block';
        if (leftMultGroup) leftMultGroup.style.display = 'block';
        if (leftWindowGroup) leftWindowGroup.style.display = 'none';
        if (leftSeriesGroup) leftSeriesGroup.style.display = 'none';
        updateStockComparatorOptions(n, ['value', 'compare_volume']);
        setCrossOperators('operator-' + n, false);
    } else if (val === 'macd') {
        if (leftDayGroup) leftDayGroup.style.display = 'block';
        if (leftCandleGroup) leftCandleGroup.style.display = 'block';
        if (leftMultGroup) leftMultGroup.style.display = 'block';
        if (leftWindowGroup) leftWindowGroup.style.display = 'none';
        if (leftSeriesGroup) leftSeriesGroup.style.display = 'block';
        if (leftSeriesLabel) leftSeriesLabel.textContent = 'Series Type';
        var leftCandleEl = document.getElementById('left-candle-' + n);
        if (leftCandleEl) leftCandleEl.value = 'day';
        if (macdShortGroup) macdShortGroup.style.display = 'block';
        if (macdLongGroup) macdLongGroup.style.display = 'block';
        if (macdSignalGroup) macdSignalGroup.style.display = 'block';
        if (macdComponentGroup) macdComponentGroup.style.display = 'block';
        updateStockMacdComparatorOptions(n);
    }
    updateThresholdUnitOptions(n, val, false);
    updateStockRightSide(n);
}

function updateStockComparatorOptions(n, options) {
    var sel = document.getElementById('comparator-' + n);
    if (!sel) return;
    var labels = { 'value': 'Value', 'compare_price': 'Compare Price', 'compare_sma': 'Compare SMA', 'compare_ema': 'Compare EMA', 'compare_volume': 'Compare Volume', 'compare_trend_capture': 'Trend Capture', 'change_pct_window': 'Change % in Window', 'roc_window': 'Rate of Change in Window' };
    sel.innerHTML = options.map(function(o) { return '<option value="' + o + '">' + (labels[o] || o) + '</option>'; }).join('');
}

function _setStockMacdCrossOperators(selectId, component) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    var allCross = ['cross_up', 'cross_down', 'cross_either'];
    var savedVal = sel.value;
    allCross.forEach(function(v) {
        var ex = sel.querySelector('option[value="' + v + '"]');
        if (ex) ex.remove();
    });
    if (component === 'signal' || component === 'macd_line') {
        var upOpt = document.createElement('option');
        upOpt.value = 'cross_up';
        upOpt.textContent = 'Cross Up \u2191 (was below, now above)';
        sel.appendChild(upOpt);
        var dnOpt = document.createElement('option');
        dnOpt.value = 'cross_down';
        dnOpt.textContent = 'Cross Down \u2193 (was above, now below)';
        sel.appendChild(dnOpt);
        if (savedVal === 'cross_up' || savedVal === 'cross_down') sel.value = savedVal;
    } else {
        if (allCross.indexOf(sel.value) !== -1) sel.value = '>';
    }
}

function updateStockMacdComparatorOptions(n) {
    var compEl = document.getElementById('left-macd-component-' + n);
    var component = compEl ? compEl.value : 'histogram';
    var sel = document.getElementById('comparator-' + n);
    if (!sel) return;
    var savedVal = sel.value;
    if (component === 'signal') {
        sel.innerHTML =
            '<option value="zero_line">Zero Line</option>' +
            '<option value="compare_macd_line">MACD Line</option>' +
            '<option value="value">Value</option>';
    } else if (component === 'macd_line') {
        sel.innerHTML =
            '<option value="zero_line">Zero Line</option>' +
            '<option value="compare_signal">Signal Line</option>' +
            '<option value="value">Value</option>';
    } else {
        sel.innerHTML = '<option value="value">Value</option>';
    }
    if (sel.querySelector('option[value="' + savedVal + '"]')) {
        sel.value = savedVal;
    }
    _setStockMacdCrossOperators('operator-' + n, component);
    updateStockRightSide(n);
}

function updateExitMacdComparatorOptions(n) {
    var compEl = document.getElementById('exit-left-macd-component-' + n);
    var component = compEl ? compEl.value : 'histogram';
    var sel = document.getElementById('exit-comparator-' + n);
    if (!sel) return;
    var savedVal = sel.value;
    if (component === 'signal') {
        sel.innerHTML =
            '<option value="zero_line">Zero Line</option>' +
            '<option value="compare_macd_line">MACD Line</option>' +
            '<option value="value">Value</option>';
    } else if (component === 'macd_line') {
        sel.innerHTML =
            '<option value="zero_line">Zero Line</option>' +
            '<option value="compare_signal">Signal Line</option>' +
            '<option value="value">Value</option>';
    } else {
        sel.innerHTML = '<option value="value">Value</option>';
    }
    if (sel.querySelector('option[value="' + savedVal + '"]')) {
        sel.value = savedVal;
    }
    _setStockMacdCrossOperators('exit-operator-' + n, component);
    updateExitRightSide(n);
}

function updateThresholdUnitOptions(n, metric, isExit) {
    var p = isExit ? 'exit-' : '';
    var sel = document.getElementById(p + 'threshold-unit-' + n);
    if (!sel) return;
    if (metric === 'volume') {
        sel.innerHTML = '<option value="%">Percent (%)</option><option value="x">x-Multiplier</option>';
    } else {
        sel.innerHTML = '<option value="%">Percent (%)</option><option value="$">Dollar ($)</option>';
    }
}

function updateStockRightSide(n) {
    var comparator = document.getElementById('comparator-' + n);
    var operator = document.getElementById('operator-' + n);
    var rightSide = document.getElementById('right-side-' + n);
    var valueGroup = document.getElementById('value-input-group-' + n);
    if (!comparator || !rightSide || !valueGroup) return;

    var comp = comparator.value;
    var isEquals = operator && (operator.value === '=' || operator.value === '==');

    // Handle Trend Capture comparator
    var leftMetric = (document.getElementById('metric-' + n) || {}).value || '';
    var tcRightWrapper = document.getElementById('tc-right-wrapper-' + n);
    if (leftMetric === 'trend_capture') {
        rightSide.style.display = 'none';
        valueGroup.style.display = 'none';
        if (tcRightWrapper) tcRightWrapper.style.display = (comp === 'compare_trend_capture') ? 'block' : 'none';
        // Show/hide the TC right panel inside the wrapper
        var tcRightPanel = document.getElementById('tc-right-panel-' + n);
        if (tcRightPanel) tcRightPanel.style.display = (comp === 'compare_trend_capture') ? 'block' : 'none';
        updateConditionSummary(n, false);
        return;
    }
    if (tcRightWrapper) tcRightWrapper.style.display = 'none';

    // Enable cross operators for current_price/price when RHS is SMA or EMA
    if (leftMetric === 'current_price' || leftMetric === 'price') {
        setCrossOperators('operator-' + n, comp === 'compare_sma' || comp === 'compare_ema');
    }

    // MACD self-contained comparators: hide both panels
    if (comp === 'zero_line' || comp === 'compare_macd_line' || comp === 'compare_signal') {
        rightSide.style.display = 'none';
        valueGroup.style.display = 'none';
        updateConditionSummary(n, false);
        return;
    }

    // Window-based comparators (Change % or Rate of Change) — use the
    // existing "Restrict to Time Window" fields as the computation window.
    if (comp === 'change_pct_window' || comp === 'roc_window') {
        rightSide.style.display = 'none';
        valueGroup.style.display = 'block';
        var highGroup0 = document.getElementById('value-high-input-group-' + n);
        var valLabel0  = document.getElementById('value-label-' + n);
        if (highGroup0) highGroup0.style.display = 'none';
        if (valLabel0)  valLabel0.textContent = comp === 'change_pct_window' ? 'Change % Threshold' : 'Rate (%/hr) Threshold';
        updateConditionSummary(n, false);
        return;
    }

    if (comp === 'value') {
        rightSide.style.display = 'none';
        valueGroup.style.display = 'block';
        var isBetween = operator && operator.value === '><';
        var highGroup = document.getElementById('value-high-input-group-' + n);
        var valLabel  = document.getElementById('value-label-' + n);
        if (highGroup) highGroup.style.display = isBetween ? 'block' : 'none';
        if (valLabel)  valLabel.textContent = isBetween ? 'Low Value' : 'Value';
    } else {
        var highGroup2 = document.getElementById('value-high-input-group-' + n);
        if (highGroup2) highGroup2.style.display = 'none';
        rightSide.style.display = 'block';
        valueGroup.style.display = 'none';

        var rightType = comp.replace('compare_', '');
        var rightWindowGroup = document.getElementById('right-window-group-' + n);
        var rightSeriesGroup = document.getElementById('right-series-group-' + n);

        if (rightType === 'sma' || rightType === 'ema') {
            if (rightWindowGroup) rightWindowGroup.style.display = 'block';
            if (rightSeriesGroup) rightSeriesGroup.style.display = 'none';
        } else if (rightType === 'volume') {
            if (rightWindowGroup) rightWindowGroup.style.display = 'none';
            if (rightSeriesGroup) rightSeriesGroup.style.display = 'none';
        } else {
            if (rightWindowGroup) rightWindowGroup.style.display = 'none';
            if (rightSeriesGroup) rightSeriesGroup.style.display = 'block';
        }

        var thresholdUnit = document.getElementById('threshold-unit-' + n);
        var thresholdValue = document.getElementById('threshold-value-' + n);
        var isCross = operator && ['cross_up', 'cross_down', 'cross_either'].indexOf(operator.value) !== -1;
        var isBetween = operator && operator.value === '><';
        var thresholdHighGroup = document.getElementById('threshold-value-high-group-' + n);
        var thresholdLabel = document.getElementById('threshold-value-label-' + n);
        if (thresholdUnit) thresholdUnit.closest('.col-md-3').style.display = (isEquals || isCross) ? 'none' : '';
        if (thresholdValue) thresholdValue.closest('.col-md-3').style.display = (isEquals || isCross) ? 'none' : '';
        if (thresholdHighGroup) thresholdHighGroup.style.display = (isBetween && !isEquals && !isCross) ? '' : 'none';
        if (thresholdLabel) thresholdLabel.textContent = (isBetween && !isEquals && !isCross) ? 'Low Threshold Value' : 'Threshold Value';
    }
    updateConditionSummary(n, false);
}

// Remove a condition
function removeCondition(id) {
    const element = document.getElementById(`condition-${id}`);
    if (element) {
        element.remove();
        renumberConditions();
    }
}

// Update sequential mode label + fields visibility for condition n
function _updateSeqMode(n) {
    var cb = document.getElementById('seq-enabled-' + n);
    var fields = document.getElementById('seq-fields-' + n);
    if (fields) fields.style.display = (cb && cb.checked) ? 'block' : 'none';
    _relabelAllConditions();
}

// Recompute phase labels for every condition (called after any sequential toggle or remove)
function _relabelAllConditions() {
    const conditions = document.querySelectorAll('.condition-item');
    var nextSeqPhase = 2; // sequential phases start at 2 (phase 1 = initial trigger)
    conditions.forEach(function(cond, index) {
        var id = cond.id.split('-')[1];
        var labelEl = document.getElementById('cond-mode-label-' + id);
        var seqCb   = document.getElementById('seq-enabled-' + id);
        var seqSec  = document.getElementById('seq-section-' + id);
        if (!labelEl) return;
        if (index === 0) {
            labelEl.textContent = 'Condition 1 — Phase 1: Initial Trigger';
            if (seqSec) seqSec.style.display = 'none';
        } else {
            var isSeq = seqCb && seqCb.checked;
            if (isSeq) {
                labelEl.textContent = `Condition ${index + 1} — Phase ${nextSeqPhase}: Sequential Trigger`;
                nextSeqPhase++;
            } else {
                labelEl.textContent = `Condition ${index + 1} — Phase 1: Prerequisite`;
            }
            if (seqSec) seqSec.style.display = 'block';
        }
    });
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
    
    _relabelAllConditions();
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
    document.getElementById('exitCustomSection').style.display = 'none';

    if (type === 'custom') {
        document.getElementById('exitCustomSection').style.display = 'block';
        if (document.getElementById('exitConditionsContainer').children.length === 0) {
            addExitCondition();
        }
    }
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
                <!-- MACD specific fields -->
                <div class="col-md-3 col-sm-6" id="exit-left-macd-short-group-${n}" style="display:none;">
                    <label class="form-label small">Short Window</label>
                    <input type="number" class="form-control form-control-sm" id="exit-left-macd-short-${n}" value="12" min="1">
                </div>
                <div class="col-md-3 col-sm-6" id="exit-left-macd-long-group-${n}" style="display:none;">
                    <label class="form-label small">Long Window</label>
                    <input type="number" class="form-control form-control-sm" id="exit-left-macd-long-${n}" value="26" min="1">
                </div>
                <div class="col-md-3 col-sm-6" id="exit-left-macd-signal-group-${n}" style="display:none;">
                    <label class="form-label small">Signal Window</label>
                    <input type="number" class="form-control form-control-sm" id="exit-left-macd-signal-${n}" value="9" min="1">
                </div>
                <div class="col-md-3 col-sm-6" id="exit-left-macd-component-group-${n}" style="display:none;">
                    <label class="form-label small">Component</label>
                    <select class="form-select form-select-sm" id="exit-left-macd-component-${n}" onchange="updateExitMacdComparatorOptions(${n})">
                        <option value="histogram">Histogram</option>
                        <option value="signal">Signal</option>
                        <option value="macd_line">MACD Line</option>
                    </select>
                </div>
            </div>
            ${_buildCandlePatternPanel('exit-', n)}
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
                        <option value="><">&gt;&lt; (between)</option>
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
                    <label class="form-label" id="exit-value-label-${n}">Value</label>
                    <input type="number" class="form-control" id="exit-compare-value-${n}" step="0.01" placeholder="e.g., 50" oninput="updateConditionSummary(${n}, true)">
                </div>
                <div class="col-md-3" id="exit-value-high-input-group-${n}" style="display:none;">
                    <label class="form-label">High Value</label>
                    <input type="number" class="form-control" id="exit-compare-value-high-${n}" step="0.01" placeholder="e.g., 60" oninput="updateConditionSummary(${n}, true)">
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
                    <label class="form-label small" id="exit-threshold-value-label-${n}">Threshold Value</label>
                    <input type="number" class="form-control form-control-sm" id="exit-threshold-value-${n}" step="0.01" placeholder="e.g., 2.5" oninput="updateConditionSummary(${n}, true)">
                </div>
                <div class="col-md-3 col-sm-6" id="exit-threshold-value-high-group-${n}" style="display:none;">
                    <label class="form-label small">High Threshold Value</label>
                    <input type="number" class="form-control form-control-sm" id="exit-threshold-value-high-${n}" step="0.01" placeholder="e.g., 5.0" oninput="updateConditionSummary(${n}, true)">
                </div>
            </div>
        </div>

        <div id="exit-cond-summary-${n}" class="mt-2 px-2 py-1 rounded" style="background:#e8f4fd;color:#1e40af;font-size:11px;font-family:monospace;display:none;"></div>

        <div class="mt-2 pt-2" style="border-top: 1px dashed #dee2e6;">
            <div class="form-check">
                <input class="form-check-input" type="checkbox" id="exit-time-window-enabled-${n}" onchange="toggleTimeWindow(${n}, true)">
                <label class="form-check-label small" for="exit-time-window-enabled-${n}">
                    <strong>Restrict to time window</strong> <span class="text-muted">(optional)</span>
                </label>
            </div>
            <div id="exit-time-window-fields-${n}" style="display:none;" class="mt-2">
                <div class="row g-2">
                    <div class="col-md-3 col-sm-6">
                        <label class="form-label small">From (HH:MM)</label>
                        <input type="time" class="form-control form-control-sm" id="exit-time-window-start-${n}" value="09:30">
                    </div>
                    <div class="col-md-3 col-sm-6">
                        <label class="form-label small">To (HH:MM)</label>
                        <input type="time" class="form-control form-control-sm" id="exit-time-window-end-${n}" value="16:00">
                    </div>
                    <div class="col-12">
                        <small class="text-muted">Condition is only evaluated if the candle falls within this time range (e.g. 04:00–09:29 for premarket).</small>
                    </div>
                </div>
            </div>
        </div>
    `;

    container.appendChild(conditionDiv);
    conditionDiv.addEventListener('change', function() { updateConditionSummary(n, true); });
    conditionDiv.addEventListener('input', function() { updateConditionSummary(n, true); });
    updateExitConditionFields(n);
}

function updateExitConditionFields(n) {
    var metric = (document.getElementById('exit-metric-' + n) || {}).value || 'current_price';

    // Always hide CP panel first
    var exitCpPanel = document.getElementById('exit-cp-panel-' + n);
    if (exitCpPanel) exitCpPanel.style.display = 'none';

    // Always hide MACD-specific fields; show them only for MACD
    var exitMacdShortGroup = document.getElementById('exit-left-macd-short-group-' + n);
    var exitMacdLongGroup = document.getElementById('exit-left-macd-long-group-' + n);
    var exitMacdSignalGroup = document.getElementById('exit-left-macd-signal-group-' + n);
    var exitMacdComponentGroup = document.getElementById('exit-left-macd-component-group-' + n);
    if (exitMacdShortGroup) exitMacdShortGroup.style.display = 'none';
    if (exitMacdLongGroup) exitMacdLongGroup.style.display = 'none';
    if (exitMacdSignalGroup) exitMacdSignalGroup.style.display = 'none';
    if (exitMacdComponentGroup) exitMacdComponentGroup.style.display = 'none';

    if (metric === 'candle_pattern') {
        var el;
        el = document.getElementById('exit-left-day-group-' + n); if (el) el.style.display = 'none';
        el = document.getElementById('exit-left-candle-group-' + n); if (el) el.style.display = 'none';
        el = document.getElementById('exit-left-mult-group-' + n); if (el) el.style.display = 'none';
        el = document.getElementById('exit-left-window-group-' + n); if (el) el.style.display = 'none';
        el = document.getElementById('exit-left-series-group-' + n); if (el) el.style.display = 'none';
        if (exitCpPanel) {
            exitCpPanel.style.display = 'block';
            var cpCont = document.getElementById('exit-cp-candles-' + n);
            if (cpCont && cpCont.children.length === 0) _updateCpCandleCount('exit-', n, 1);
        }
        var condDiv = document.getElementById('exit-condition-' + n);
        if (condDiv) {
            var opRow = condDiv.querySelector('.condition-operator');
            if (opRow) opRow.style.display = 'none';
            var rs = document.getElementById('exit-right-side-' + n);
            if (rs) rs.style.display = 'none';
        }
        return;
    } else {
        var condDiv = document.getElementById('exit-condition-' + n);
        if (condDiv) {
            var opRow = condDiv.querySelector('.condition-operator');
            if (opRow) opRow.style.display = '';
        }
    }

    var isCurrentPrice = metric === 'current_price';
    var isPrice = metric === 'price';
    var isVolume = metric === 'volume';
    var isMacd = metric === 'macd';
    var needsWindow = ['sma', 'ema', 'rsi'].indexOf(metric) !== -1;

    var showDay = !isCurrentPrice;
    var showCandle = !isCurrentPrice;
    var showMult = !isCurrentPrice;
    var showWindow = needsWindow;
    var showSeries = !isVolume && (isPrice || isCurrentPrice || ['sma', 'ema', 'macd'].indexOf(metric) !== -1);

    var el;
    el = document.getElementById('exit-left-day-group-' + n); if (el) el.style.display = showDay ? '' : 'none';
    el = document.getElementById('exit-left-candle-group-' + n); if (el) el.style.display = showCandle ? '' : 'none';
    el = document.getElementById('exit-left-mult-group-' + n); if (el) el.style.display = showMult ? '' : 'none';
    el = document.getElementById('exit-left-window-group-' + n); if (el) el.style.display = showWindow ? '' : 'none';
    el = document.getElementById('exit-left-series-group-' + n); if (el) el.style.display = (showSeries && !isCurrentPrice) ? '' : 'none';

    var windowLabel = document.getElementById('exit-left-window-label-' + n);
    if (windowLabel) windowLabel.textContent = 'Window';
    var seriesLabel = document.getElementById('exit-left-series-label-' + n);
    if (seriesLabel) seriesLabel.textContent = (isPrice || isCurrentPrice) ? 'Price Type' : 'Series Type';

    if (isMacd) {
        if (exitMacdShortGroup) exitMacdShortGroup.style.display = '';
        if (exitMacdLongGroup) exitMacdLongGroup.style.display = '';
        if (exitMacdSignalGroup) exitMacdSignalGroup.style.display = '';
        if (exitMacdComponentGroup) exitMacdComponentGroup.style.display = '';
        el = document.getElementById('exit-left-candle-' + n);
        if (el) el.value = 'day';
    }

    setCrossOperators('exit-operator-' + n, ['sma', 'ema'].indexOf(metric) !== -1);
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
    if (metric === 'macd') {
        updateExitMacdComparatorOptions(n);
        updateThresholdUnitOptions(n, metric, true);
        return;
    }
    var opts = '<option value="value">Value</option>';
    if (metric === 'volume') {
        opts += '<option value="compare_volume">Compare Volume</option>';
    } else if (metric !== 'rsi') {
        opts += '<option value="compare_price">Compare Price</option>';
        opts += '<option value="compare_sma">Compare SMA</option>';
        opts += '<option value="compare_ema">Compare EMA</option>';
        opts += '<option value="change_pct_window">Change % in Window</option>';
        opts += '<option value="roc_window">Rate of Change in Window</option>';
    }
    comp.innerHTML = opts;
    updateThresholdUnitOptions(n, metric, true);
    updateExitRightSide(n);
}

function updateExitRightSide(n) {
    var comp = (document.getElementById('exit-comparator-' + n) || {}).value || 'value';
    var operator = (document.getElementById('exit-operator-' + n) || {}).value || '>';
    var rightSide = document.getElementById('exit-right-side-' + n);
    var valueGroup = document.getElementById('exit-value-input-group-' + n);
    var isEquals = (operator === '=' || operator === '==');

    // Enable cross operators for current_price/price when RHS is SMA or EMA
    var leftMetric = (document.getElementById('exit-metric-' + n) || {}).value || '';
    if (leftMetric === 'current_price' || leftMetric === 'price') {
        setCrossOperators('exit-operator-' + n, comp === 'compare_sma' || comp === 'compare_ema');
    }

    // MACD self-contained comparators: hide both panels
    if (comp === 'zero_line' || comp === 'compare_macd_line' || comp === 'compare_signal') {
        if (rightSide) rightSide.style.display = 'none';
        if (valueGroup) valueGroup.style.display = 'none';
        return;
    }

    // Window-based comparators — computation window comes from the existing
    // "Restrict to Time Window" fields; no separate inputs needed.
    if (comp === 'change_pct_window' || comp === 'roc_window') {
        if (rightSide) rightSide.style.display = 'none';
        if (valueGroup) valueGroup.style.display = '';
        var exitHighGroup0 = document.getElementById('exit-value-high-input-group-' + n);
        var exitValLabel0  = document.getElementById('exit-value-label-' + n);
        if (exitHighGroup0) exitHighGroup0.style.display = 'none';
        if (exitValLabel0)  exitValLabel0.textContent = comp === 'change_pct_window' ? 'Change % Threshold' : 'Rate (%/hr) Threshold';
        return;
    }

    if (comp === 'value') {
        if (rightSide) rightSide.style.display = 'none';
        if (valueGroup) valueGroup.style.display = '';
        var exitIsBetween = (operator === '><');
        var exitHighGroup = document.getElementById('exit-value-high-input-group-' + n);
        var exitValLabel  = document.getElementById('exit-value-label-' + n);
        if (exitHighGroup) exitHighGroup.style.display = exitIsBetween ? '' : 'none';
        if (exitValLabel)  exitValLabel.textContent = exitIsBetween ? 'Low Value' : 'Value';
    } else {
        var exitHighGroup2 = document.getElementById('exit-value-high-input-group-' + n);
        if (exitHighGroup2) exitHighGroup2.style.display = 'none';
        if (rightSide) rightSide.style.display = 'block';
        if (valueGroup) valueGroup.style.display = 'none';

        var rightType = comp.replace('compare_', '');
        var el;
        if (rightType === 'sma' || rightType === 'ema') {
            el = document.getElementById('exit-right-window-group-' + n); if (el) el.style.display = '';
            el = document.getElementById('exit-right-series-group-' + n); if (el) el.style.display = 'none';
        } else if (rightType === 'volume') {
            el = document.getElementById('exit-right-window-group-' + n); if (el) el.style.display = 'none';
            el = document.getElementById('exit-right-series-group-' + n); if (el) el.style.display = 'none';
        } else {
            el = document.getElementById('exit-right-window-group-' + n); if (el) el.style.display = 'none';
            el = document.getElementById('exit-right-series-group-' + n); if (el) el.style.display = '';
        }

        var thresholdUnit = document.getElementById('exit-threshold-unit-' + n);
        var thresholdValue = document.getElementById('exit-threshold-value-' + n);
        var isCross = ['cross_up', 'cross_down', 'cross_either'].indexOf(operator) !== -1;
        var isBetween = (operator === '><');
        var thresholdHighGroup = document.getElementById('exit-threshold-value-high-group-' + n);
        var thresholdLabel = document.getElementById('exit-threshold-value-label-' + n);
        if (thresholdUnit) thresholdUnit.closest('.col-md-3').style.display = (isEquals || isCross) ? 'none' : '';
        if (thresholdValue) thresholdValue.closest('.col-md-3').style.display = (isEquals || isCross) ? 'none' : '';
        if (thresholdHighGroup) thresholdHighGroup.style.display = (isBetween && !isEquals && !isCross) ? '' : 'none';
        if (thresholdLabel) thresholdLabel.textContent = (isBetween && !isEquals && !isCross) ? 'Low Threshold Value' : 'Threshold Value';
    }
    updateConditionSummary(n, true);
}

function removeExitCondition(id) {
    var element = document.getElementById('exit-condition-' + id);
    if (element) {
        element.remove();
        renumberExitConditions();
    }
}

function toggleTimeWindow(n, isExit) {
    var prefix = isExit ? 'exit-' : '';
    var cb = document.getElementById(prefix + 'time-window-enabled-' + n);
    var fields = document.getElementById(prefix + 'time-window-fields-' + n);
    if (fields) fields.style.display = (cb && cb.checked) ? 'block' : 'none';
}

function buildConditionDesc(n, isExit) {
    var p = isExit ? 'exit-' : '';
    var metric = (document.getElementById(p + 'metric-' + n) || {}).value || 'current_price';
    var operator = (document.getElementById(p + 'operator-' + n) || {}).value || '>';
    var comparator = (document.getElementById(p + 'comparator-' + n) || {}).value || 'value';
    var threshUnit = (document.getElementById(p + 'threshold-unit-' + n) || {}).value || '%';
    var threshVal = parseFloat((document.getElementById(p + 'threshold-value-' + n) || {}).value) || 0;

    function dayLabel(d) {
        if (d === '0' || d === 0) return 'today';
        if (d === '-1' || d === -1) return 'prev day';
        return d + ' days ago';
    }
    function candleLabel(c, m) {
        if (c === 'day') return 'daily';
        if (c === 'hr') return (m || 1) + '-hr';
        return (m || 1) + '-min';
    }
    function sideDesc(side) {
        var sp = p + side + '-';
        var dayEl = document.getElementById(sp + 'day-' + n);
        var day = dayEl ? dayEl.value : '0';
        if (day === 'custom') { var cx = document.getElementById(sp + 'day-custom-' + n); day = cx ? cx.value : '0'; }
        var candle = (document.getElementById(sp + 'candle-' + n) || {}).value || 'min';
        var mult = (document.getElementById(sp + 'mult-' + n) || {}).value || '1';
        var series = (document.getElementById(sp + 'series-' + n) || {}).value || 'close';
        var win = (document.getElementById(sp + 'window-' + n) || {}).value || '14';
        return { day: day, candle: candle, mult: mult, series: series, win: win };
    }
    function metricDesc(m, s) {
        if (m === 'current_price') return 'current price';
        if (m === 'volume') return candleLabel(s.candle, s.mult) + ' volume (' + dayLabel(s.day) + ')';
        if (m === 'price') return candleLabel(s.candle, s.mult) + ' ' + s.series + ' (' + dayLabel(s.day) + ')';
        if (m === 'sma') return 'SMA(' + s.win + ') (' + dayLabel(s.day) + ')';
        if (m === 'ema') return 'EMA(' + s.win + ') (' + dayLabel(s.day) + ')';
        if (m === 'rsi') return 'RSI(' + s.win + ') (' + dayLabel(s.day) + ')';
        if (m === 'macd') {
            var mShort = parseInt((document.getElementById(p + 'left-macd-short-' + n) || {}).value) || 12;
            var mLong  = parseInt((document.getElementById(p + 'left-macd-long-'  + n) || {}).value) || 26;
            var mSig   = parseInt((document.getElementById(p + 'left-macd-signal-' + n) || {}).value) || 9;
            var mComp  = (document.getElementById(p + 'left-macd-component-' + n) || {}).value || 'histogram';
            var compMap = { 'histogram': 'Hist', 'signal': 'Sig', 'macd_line': 'Line' };
            return 'MACD(' + mShort + ',' + mLong + ',' + mSig + ')[' + (compMap[mComp] || mComp) + '] (' + dayLabel(s.day) + ')';
        }
        return m;
    }

    var left = sideDesc('left');
    var leftDesc = metricDesc(metric, left);
    var opSym = {
        '>': '>', '<': '<', '>=': '≥', '<=': '≤', '=': '=', '><': 'between',
        'cross_up': 'crosses above', 'cross_down': 'crosses below', 'cross_either': 'crosses'
    }[operator] || operator;

    // Trend Capture description
    if (metric === 'trend_capture') {
        var tcInterval = (document.getElementById('tc-left-interval-' + n) || {}).value || '1hr';
        var tcTW = (document.getElementById('tc-left-time-window-' + n) || {}).value || 'day_of_entry';
        var tcPT = (document.getElementById('tc-left-price-type-' + n) || {}).value || 'lowest_low';
        var tcSD = (document.getElementById('tc-left-slope-dir-' + n) || {}).value || 'negative';
        var twMap = { 'day_of_entry': 'Day', 'prior_day': 'Prev Day', 'week_of_entry': 'Week', 'month_of_entry': 'Month' };
        var ptMap = { 'highest_high': 'HH', 'lowest_low': 'LL' };
        var tcLeftStr = 'TC(' + tcInterval + ', ' + (twMap[tcTW] || tcTW) + ', ' + (ptMap[tcPT] || tcPT) + ', ' + tcSD + ')';
        if (comparator === 'compare_trend_capture') {
            var rInterval = (document.getElementById('tc-right-interval-' + n) || {}).value || '1hr';
            var rTW = (document.getElementById('tc-right-time-window-' + n) || {}).value || 'day_of_entry';
            var rPT = (document.getElementById('tc-right-price-type-' + n) || {}).value || 'lowest_low';
            var rSD = (document.getElementById('tc-right-slope-dir-' + n) || {}).value || 'negative';
            var tcRightStr = 'TC(' + rInterval + ', ' + (twMap[rTW] || rTW) + ', ' + (ptMap[rPT] || rPT) + ', ' + rSD + ')';
            return tcLeftStr + ' slope ' + opSym + ' ' + tcRightStr + ' slope';
        }
        return tcLeftStr;
    }

    if (comparator === 'value') {
        var fixedVal = (document.getElementById(p + 'compare-value-' + n) || {}).value;
        var numStr = fixedVal ? Number(fixedVal).toLocaleString() : '?';
        if (operator === '><') {
            var highVal = (document.getElementById(p + 'compare-value-high-' + n) || {}).value;
            var highStr = highVal ? Number(highVal).toLocaleString() : '?';
            return leftDesc + ' between ' + numStr + ' and ' + highStr;
        }
        return leftDesc + ' ' + opSym + ' ' + numStr;
    } else {
        var rightMetric = comparator.replace('compare_', '');
        var right = sideDesc('right');
        var rightDesc = metricDesc(rightMetric, right);
        var threshStr = '';
        if (operator === '><') {
            var highThreshVal = parseFloat((document.getElementById(p + 'threshold-value-high-' + n) || {}).value) || 0;
            if (threshUnit === '$') {
                threshStr = ' (by $' + threshVal + ' to $' + highThreshVal + ')';
            } else {
                threshStr = ' (by ' + threshVal + '% to ' + highThreshVal + '%)';
            }
            return leftDesc + ' between ' + rightDesc + threshStr;
        }
        if (threshUnit === 'x' && threshVal !== 0) {
            threshStr = ' × ' + threshVal + 'x';
        } else if (threshUnit === '%' && threshVal !== 0) {
            threshStr = ' by ' + threshVal + '%';
        } else if (threshUnit === '$' && threshVal !== 0) {
            threshStr = ' by $' + threshVal;
        }
        return leftDesc + ' ' + opSym + ' ' + rightDesc + threshStr;
    }
}

function updateConditionSummary(n, isExit) {
    var p = isExit ? 'exit-' : '';
    var el = document.getElementById(p + 'cond-summary-' + n);
    if (!el) return;
    try {
        var desc = buildConditionDesc(n, isExit);
        el.textContent = desc;
        el.style.display = 'block';
    } catch(e) {
        el.style.display = 'none';
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
    if (config.exit_custom_conditions && config.exit_custom_conditions.length > 0) {
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
            <div style="${valueStyle}">${(() => { const md = config.max_days; const et = config.exit_time || ''; const hasM = md !== '' && md !== null && md !== undefined && !isNaN(parseInt(md)); if (!hasM) return 'Unlimited'; const days = parseInt(md); const dayLabel = days === 0 ? 'Same Day' : days + ' day' + (days !== 1 ? 's' : ''); return et ? dayLabel + ' at ' + et : (days === 0 ? 'Same Day Only' : dayLabel); })()}</div>
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
    e.stopImmediatePropagation();
    
    const form = e.target;
    if (form.dataset.isSubmitting === 'true') {
        console.log('Form already submitting, ignoring duplicate');
        return;
    }
    form.dataset.isSubmitting = 'true';
    
    console.log('=== FORM SUBMIT STARTED ===');
    
    try {
        clearStockFieldErrors();
        const errorEl = document.getElementById('stockErrorMessage');
        if (errorEl) errorEl.style.display = 'none';
        
        console.log('Collecting form data...');
        const config = await collectFormData();
        console.log('Config collected:', config);

        if (typeof TierRestrictions !== 'undefined') {
            var sym = config.symbol || (config.symbols && config.symbols[0]) || '';
            var symErr = TierRestrictions.getSymbolError(sym);
            if (symErr) throw new Error(symErr);
            if (!TierRestrictions.isDateAllowed(config.start_date) || !TierRestrictions.isDateAllowed(config.end_date)) { var dMin = TierRestrictions.getDateMin(); var dMax = TierRestrictions.getDateMax(); var rangeStr = (dMin && dMax) ? ' Allowed range: ' + dMin + ' to ' + dMax + '.' : ''; throw new Error('Date is outside your plan\'s allowed range.' + rangeStr + ' Upgrade for wider date access.'); }
            if (!TierRestrictions.canUseMultipleSymbols() && config.symbol_mode === 'multiple') throw new Error('Multiple symbols require a Standard or Premium plan.');
        }

        console.log('Validating config...');
        if (!validateConfig(config)) {
            form.dataset.isSubmitting = 'false';
            return;
        }
        console.log('Validation passed');
        
        showConfigSummary(config);

        document.getElementById('confirmRunBacktestBtn').onclick = async function() {
            closeConfigSummary();
            const loadingEl = document.getElementById('stockLoadingMessage');
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
                        const loadingEl = document.getElementById('stockLoadingMessage');
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
                const errorEl = document.getElementById('stockErrorMessage');
                const loadingEl = document.getElementById('stockLoadingMessage');
                if (errorEl) { errorEl.textContent = `Error: ${err.message}`; errorEl.style.display = 'block'; }
                if (loadingEl) loadingEl.style.display = 'none';
                form.dataset.isSubmitting = 'false';
                appAlert(`Error: ${err.message}`);
            }
        };

    } catch (error) {
        console.error('=== ERROR IN FORM SUBMISSION ===');
        console.error('Error:', error);
        const errorEl = document.getElementById('stockErrorMessage');
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
    config.name = document.getElementById('stockBacktestName').value;
    config.start_date = document.getElementById('stockStartDate').value;
    config.end_date = document.getElementById('stockEndDate').value;
    
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

            if (metric === 'macd') {
                condition.left_macd_short = parseInt((document.getElementById(`left-macd-short-${id}`) || {}).value) || 12;
                condition.left_macd_long = parseInt((document.getElementById(`left-macd-long-${id}`) || {}).value) || 26;
                condition.left_macd_signal = parseInt((document.getElementById(`left-macd-signal-${id}`) || {}).value) || 9;
                condition.left_macd_component = (document.getElementById(`left-macd-component-${id}`) || {}).value || 'histogram';
            }

            // --- Candle Pattern fields ---
            if (metric === 'candle_pattern') {
                var _cpPfx = '';
                condition.left_type = 'candle_pattern';
                condition.cp_day = parseInt((document.getElementById(_cpPfx + 'cp-day-' + id) || {}).value) || 0;
                condition.cp_candle = (document.getElementById(_cpPfx + 'cp-candle-' + id) || {}).value || 'min';
                condition.cp_multiplier = parseInt((document.getElementById(_cpPfx + 'cp-mult-' + id) || {}).value) || 1;
                condition.cp_num_candles = parseInt((document.getElementById(_cpPfx + 'cp-count-' + id) || {}).value) || 1;
                condition.cp_candles = _serializeCpCandles(_cpPfx, null, id);
                var _cpInc = document.getElementById(_cpPfx + 'cp-include-current-' + id);
                condition.cp_include_current = !!(_cpInc && _cpInc.checked);
                condition.right_type = 'value';
                condition.right_fixed_value = 0;
                condition.right_day = 0;
                condition.right_candle = 'min';
                condition.right_multiplier = 1;
                condition.threshold_unit = '%';
                condition.threshold_value = 0;
                condition.operation = '>';
                condition.comparator = 'value';
            // --- Trend Capture fields ---
            } else if (metric === 'trend_capture') {
                const _tcField = (pfx, field) => (document.getElementById('tc-' + pfx + '-' + field + '-' + id) || {}).value || null;
                const _tcBool  = (pfx, field) => { var el = document.getElementById('tc-' + pfx + '-' + field + '-' + id); return !!(el && el.checked); };
                condition.tc_left_interval    = _tcField('left', 'interval')    || '1hr';
                condition.tc_left_time_window = _tcField('left', 'time-window') || 'day_of_entry';
                condition.tc_left_price_type  = _tcField('left', 'price-type')  || 'lowest_low';
                condition.tc_left_slope_dir   = _tcField('left', 'slope-dir')   || 'negative';
                condition.tc_left_slope_val_enabled = _tcBool('left', 'slope-val-enabled');
                if (condition.tc_left_slope_val_enabled) {
                    condition.tc_left_slope_op  = _tcField('left', 'slope-op')  || '>';
                    condition.tc_left_slope_val = parseFloat(_tcField('left', 'slope-val')) || 0;
                }
                condition.tc_left_r_enabled = _tcBool('left', 'r-enabled');
                if (condition.tc_left_r_enabled) {
                    condition.tc_left_r_op  = _tcField('left', 'r-op')  || '<';
                    condition.tc_left_r_val = parseFloat(_tcField('left', 'r-val')) || 0;
                }
                if (comparator === 'compare_trend_capture') {
                    condition.tc_right_interval    = _tcField('right', 'interval')    || '1hr';
                    condition.tc_right_time_window = _tcField('right', 'time-window') || 'day_of_entry';
                    condition.tc_right_price_type  = _tcField('right', 'price-type')  || 'lowest_low';
                    condition.tc_right_slope_dir   = _tcField('right', 'slope-dir')   || 'negative';
                    condition.tc_right_slope_val_enabled = _tcBool('right', 'slope-val-enabled');
                    if (condition.tc_right_slope_val_enabled) {
                        condition.tc_right_slope_op  = _tcField('right', 'slope-op')  || '>';
                        condition.tc_right_slope_val = parseFloat(_tcField('right', 'slope-val')) || 0;
                    }
                    condition.tc_right_r_enabled = _tcBool('right', 'r-enabled');
                    if (condition.tc_right_r_enabled) {
                        condition.tc_right_r_op  = _tcField('right', 'r-op')  || '<';
                        condition.tc_right_r_val = parseFloat(_tcField('right', 'r-val')) || 0;
                    }
                }
                // Trend Capture is self-contained; skip standard right-side fields
                condition.right_type = 'trend_capture';
                condition.right_fixed_value = 0;
                condition.right_day = 0;
                condition.right_candle = 'min';
                condition.right_multiplier = 1;
                condition.threshold_unit = '%';
                condition.threshold_value = 0;
            } else if (comparator === 'zero_line') {
                condition.right_type = 'value';
                condition.right_fixed_value = 0;
                condition.right_day = 0;
                condition.right_candle = 'min';
                condition.right_multiplier = 1;
                condition.threshold_unit = '$';
                condition.threshold_value = 0;
            } else if (comparator === 'compare_macd_line' || comparator === 'compare_signal') {
                condition.right_type = 'macd';
                condition.right_macd_short = condition.left_macd_short || 12;
                condition.right_macd_long = condition.left_macd_long || 26;
                condition.right_macd_signal = condition.left_macd_signal || 9;
                condition.right_macd_component = comparator === 'compare_macd_line' ? 'macd_line' : 'signal';
                condition.right_day = 0;
                condition.right_candle = 'min';
                condition.right_multiplier = 1;
                condition.threshold_unit = '$';
                condition.threshold_value = 0;
            } else if (comparator === 'change_pct_window' || comparator === 'roc_window') {
                condition.right_type = 'value';
                condition.right_fixed_value = parseFloat((document.getElementById(`compare-value-${id}`) || {}).value) || 0;
                condition.right_day = 0;
                condition.right_candle = 'min';
                condition.right_multiplier = 1;
                condition.threshold_unit = '%';
                condition.threshold_value = 0;
            } else if (comparator === 'value') {
                condition.right_type = 'value';
                condition.right_fixed_value = parseFloat((document.getElementById(`compare-value-${id}`) || {}).value) || 0;
                if (condition.operation === '><') {
                    condition.right_fixed_value_high = parseFloat((document.getElementById(`compare-value-high-${id}`) || {}).value) || 0;
                }
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
                if (condition.operation === '><') {
                    condition.threshold_value_high = parseFloat((document.getElementById(`threshold-value-high-${id}`) || {}).value) || 0;
                }
            }

            // Sequential phase flag (conditions 2+ only)
            const seqCb = document.getElementById(`seq-enabled-${id}`);
            condition.is_sequential = !!(seqCb && seqCb.checked);
            if (condition.is_sequential) {
                condition.max_wait_bars = parseInt((document.getElementById(`seq-max-wait-${id}`) || {}).value) || 0;
            }

            const twCb = document.getElementById(`time-window-enabled-${id}`);
            condition.time_window_enabled = !!(twCb && twCb.checked);
            if (condition.time_window_enabled) {
                condition.time_window_start = (document.getElementById(`time-window-start-${id}`) || {}).value || '09:30';
                condition.time_window_end = (document.getElementById(`time-window-end-${id}`) || {}).value || '16:00';
            }

            config.custom_conditions.push(condition);
        });
    }
    
    // Direction (Long/Short)
    config.direction = document.querySelector('input[name="direction"]:checked').value;
    
    // Sizing
    config.sizing_type = document.querySelector('input[name="sizing_type"]:checked').value;
    
    if (config.sizing_type === 'shares') {
        config.sizing_value = document.getElementById('stockSizingShares')?.value || '';
    } else if (config.sizing_type === 'dollars') {
        config.sizing_value = document.getElementById('stockSizingDollars')?.value || '';
    } else {
        config.starting_capital = document.getElementById('startingCapital')?.value || '50000';
        config.sizing_value = document.getElementById('stockSizingPercent')?.value || '';
    }
    
    // Exit conditions (signal-based)
    config.exit_cond_type = document.querySelector('input[name="exit_cond_type"]:checked').value;

    if (config.exit_cond_type === 'custom') {
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

            if (metric === 'macd') {
                condition.left_macd_short = parseInt((document.getElementById('exit-left-macd-short-' + id) || {}).value) || 12;
                condition.left_macd_long = parseInt((document.getElementById('exit-left-macd-long-' + id) || {}).value) || 26;
                condition.left_macd_signal = parseInt((document.getElementById('exit-left-macd-signal-' + id) || {}).value) || 9;
                condition.left_macd_component = (document.getElementById('exit-left-macd-component-' + id) || {}).value || 'histogram';
            }

            if (metric === 'candle_pattern') {
                condition.left_type = 'candle_pattern';
                condition.cp_day = parseInt((document.getElementById('exit-cp-day-' + id) || {}).value) || 0;
                condition.cp_candle = (document.getElementById('exit-cp-candle-' + id) || {}).value || 'min';
                condition.cp_multiplier = parseInt((document.getElementById('exit-cp-mult-' + id) || {}).value) || 1;
                condition.cp_num_candles = parseInt((document.getElementById('exit-cp-count-' + id) || {}).value) || 1;
                condition.cp_candles = _serializeCpCandles('exit-', null, id);
                var _cpIncEx = document.getElementById('exit-cp-include-current-' + id);
                condition.cp_include_current = !!(_cpIncEx && _cpIncEx.checked);
                condition.right_type = 'value';
                condition.right_fixed_value = 0;
                condition.right_day = 0;
                condition.right_candle = 'min';
                condition.right_multiplier = 1;
                condition.threshold_unit = '%';
                condition.threshold_value = 0;
                condition.operation = '>';
                condition.comparator = 'value';
            } else if (comparator === 'zero_line') {
                condition.right_type = 'value';
                condition.right_fixed_value = 0;
                condition.right_day = 0;
                condition.right_candle = 'min';
                condition.right_multiplier = 1;
                condition.threshold_unit = '$';
                condition.threshold_value = 0;
            } else if (comparator === 'compare_macd_line' || comparator === 'compare_signal') {
                condition.right_type = 'macd';
                condition.right_macd_short = condition.left_macd_short || 12;
                condition.right_macd_long = condition.left_macd_long || 26;
                condition.right_macd_signal = condition.left_macd_signal || 9;
                condition.right_macd_component = comparator === 'compare_macd_line' ? 'macd_line' : 'signal';
                condition.right_day = 0;
                condition.right_candle = 'min';
                condition.right_multiplier = 1;
                condition.threshold_unit = '$';
                condition.threshold_value = 0;
            } else if (comparator === 'change_pct_window' || comparator === 'roc_window') {
                condition.right_type = 'value';
                condition.right_fixed_value = parseFloat((document.getElementById('exit-compare-value-' + id) || {}).value) || 0;
                condition.right_day = 0;
                condition.right_candle = 'min';
                condition.right_multiplier = 1;
                condition.threshold_unit = '%';
                condition.threshold_value = 0;
            } else if (comparator === 'value') {
                condition.right_type = 'value';
                condition.right_fixed_value = parseFloat((document.getElementById('exit-compare-value-' + id) || {}).value) || 0;
                if (condition.operation === '><') {
                    condition.right_fixed_value_high = parseFloat((document.getElementById('exit-compare-value-high-' + id) || {}).value) || 0;
                }
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
                if (condition.operation === '><') {
                    condition.threshold_value_high = parseFloat((document.getElementById('exit-threshold-value-high-' + id) || {}).value) || 0;
                }
            }

            var exitTwCb = document.getElementById('exit-time-window-enabled-' + id);
            condition.time_window_enabled = !!(exitTwCb && exitTwCb.checked);
            if (condition.time_window_enabled) {
                condition.time_window_start = (document.getElementById('exit-time-window-start-' + id) || {}).value || '09:30';
                condition.time_window_end = (document.getElementById('exit-time-window-end-' + id) || {}).value || '16:00';
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
    config.exit_time = (document.getElementById('exitTime') || {}).value || '';

    // Consecutive trades
    config.allow_consecutive_trades = document.getElementById('allowConsecutive').checked;
    
    return config;
}

// ============================================================================
// FIELD-LEVEL ERROR HELPERS
// ============================================================================

function clearStockFieldErrors() {
    document.querySelectorAll('#stockBacktestForm .stock-field-error').forEach(el => el.remove());
    document.querySelectorAll('#stockBacktestForm .is-invalid').forEach(el => el.classList.remove('is-invalid'));
}

function showStockFieldError(elementId, message) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.classList.add('is-invalid');
    const existing = el.parentElement.querySelector('.stock-field-error');
    if (existing) existing.remove();
    if (message) {
        const err = document.createElement('div');
        err.className = 'stock-field-error invalid-feedback';
        err.style.display = 'block';
        err.textContent = message;
        el.parentElement.appendChild(err);
    }
}

function showStockGroupError(anchorId, message) {
    const anchor = document.getElementById(anchorId);
    if (!anchor) return;
    const existing = anchor.querySelector('.stock-field-error');
    if (existing) existing.remove();
    const err = document.createElement('div');
    err.className = 'stock-field-error';
    err.style.cssText = 'color:#dc3545; font-size:0.82rem; margin-top:8px; font-weight:500;';
    err.textContent = message;
    anchor.appendChild(err);
}

function scrollToField(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => { try { el.focus(); } catch(e) {} }, 350);
}

// Validate configuration — shows inline per-field errors and scrolls to first issue
function validateConfig(config) {
    clearStockFieldErrors();

    // Auto-generate name if not provided
    if (!config.name) {
        const symbol = config.symbol || (config.symbols && config.symbols[0]) || 'Multi';
        config.name = `${symbol} Backtest ${new Date().toLocaleDateString()}`;
    }

    let firstErrorId = null;
    function addError(elementId, message) {
        showStockFieldError(elementId, message);
        if (!firstErrorId) firstErrorId = elementId;
    }

    // Date fields
    if (!config.start_date) addError('stockStartDate', 'Start date is required.');
    if (!config.end_date)   addError('stockEndDate',   'End date is required.');
    if (config.start_date && config.end_date && config.start_date >= config.end_date) {
        addError('stockEndDate', 'End date must be after start date.');
    }

    // Symbol
    if (config.symbol_mode === 'single' && !config.symbol) {
        addError('singleSymbol', 'Please enter a ticker symbol (e.g. SPY).');
    }
    if (config.symbol_mode === 'multiple' && (!config.symbols || config.symbols.length === 0)) {
        addError('multipleSymbols', 'Please enter at least one symbol.');
    }

    // Preset entry threshold
    if (config.entry_type === 'preset') {
        const thresholdVal = parseFloat(config.preset_threshold);
        if (config.preset_condition !== '5' && (config.preset_threshold === '' || config.preset_threshold === undefined || isNaN(thresholdVal))) {
            addError('presetThreshold', 'Threshold value is required.');
        }
        if (config.preset_condition === '5') {
            if (!config.velocity_lookback || parseInt(config.velocity_lookback) <= 0) {
                addError('velocityLookback', 'Interval is required.');
            }
            const velThresh = parseFloat(config.preset_threshold);
            if (config.preset_threshold === '' || config.preset_threshold === undefined || isNaN(velThresh)) {
                addError('velocityThreshold', 'Threshold is required.');
            }
        }
    } else {
        // Custom builder day-0 closed-bar checks
        for (const cond of (config.custom_conditions || [])) {
            if (cond.left_candle === 'day' && cond.left_day === 0 && ['close', 'high', 'low', 'vwap'].includes(cond.left_type)) {
                appAlert(`Invalid condition: cannot use day candle "${cond.left_type}" on day 0 — the current day has not closed yet. Use "open" or a negative day offset.`);
                if (!firstErrorId) firstErrorId = 'addConditionBtn';
                break;
            }
            if (cond.right_candle === 'day' && cond.right_day === 0 && ['close', 'high', 'low', 'vwap'].includes(cond.right_type)) {
                appAlert(`Invalid condition: cannot use day candle "${cond.right_type}" on day 0 — the current day has not closed yet. Use "open" or a negative day offset.`);
                if (!firstErrorId) firstErrorId = 'addConditionBtn';
                break;
            }
        }
    }

    // Sizing value
    const sizingVal = parseFloat(config.sizing_value);
    if (isNaN(sizingVal) || sizingVal <= 0) {
        const sizingInputId = config.sizing_type === 'shares' ? 'stockSizingShares'
                            : config.sizing_type === 'dollars' ? 'stockSizingDollars'
                            : 'stockSizingPercent';
        const sizingLabels = { shares: 'Number of shares', dollars: 'Dollar amount', percent: 'Percentage' };
        addError(sizingInputId, `${sizingLabels[config.sizing_type] || 'Sizing value'} is required.`);
    }
    if (config.sizing_type === 'percent' && (!config.starting_capital || parseFloat(config.starting_capital) <= 0)) {
        addError('stockStartingCapital', 'Starting capital is required for percentage sizing.');
    }

    // At least one exit mechanism
    const hasTP       = config.take_profit_value && parseFloat(config.take_profit_value) > 0;
    const hasSL       = config.stop_loss_value && parseFloat(config.stop_loss_value) > 0;
    const hasMaxDays  = config.max_days !== '' && config.max_days !== null && config.max_days !== undefined && !isNaN(parseInt(config.max_days)) && parseInt(config.max_days) >= 0;
    const hasExitCust = config.exit_cond_type === 'custom' && config.exit_custom_conditions && config.exit_custom_conditions.length > 0;

    if (!hasTP && !hasSL && !hasMaxDays && !hasExitCust) {
        ['takeProfitValue', 'stopLossValue', 'maxDays'].forEach(id => showStockFieldError(id, ''));
        showStockGroupError('exitCondGroupErrorAnchor', 'At least one exit condition is required — enter a Take Profit, Stop Loss, or Max Days value.');
        if (!firstErrorId) firstErrorId = 'takeProfitValue';
    }

    // Exit custom day-0 checks
    if (hasExitCust) {
        for (const ec of config.exit_custom_conditions) {
            if (ec.left_candle === 'day' && ec.left_day === 0 && ['close', 'high', 'low', 'vwap'].includes(ec.left_type)) {
                appAlert('Invalid exit condition: cannot use day candle "' + ec.left_type + '" on day 0.');
                if (!firstErrorId) firstErrorId = 'addExitConditionBtn';
                break;
            }
            if (ec.right_candle === 'day' && ec.right_day === 0 && ['close', 'high', 'low', 'vwap'].includes(ec.right_type)) {
                appAlert('Invalid exit condition: cannot use day candle "' + ec.right_type + '" on day 0.');
                if (!firstErrorId) firstErrorId = 'addExitConditionBtn';
                break;
            }
        }
    }

    if (firstErrorId) {
        scrollToField(firstErrorId);
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

    if (document.getElementById('stockStartDate') && config.start_date) {
        document.getElementById('stockStartDate').value = config.start_date;
    }
    if (document.getElementById('stockEndDate') && config.end_date) {
        document.getElementById('stockEndDate').value = config.end_date;
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

            if (cond.metric === 'macd') {
                var macdShortEl = document.getElementById('left-macd-short-' + id);
                if (macdShortEl) macdShortEl.value = cond.left_macd_short || 12;
                var macdLongEl = document.getElementById('left-macd-long-' + id);
                if (macdLongEl) macdLongEl.value = cond.left_macd_long || 26;
                var macdSignalEl = document.getElementById('left-macd-signal-' + id);
                if (macdSignalEl) macdSignalEl.value = cond.left_macd_signal || 9;
                var macdCompEl = document.getElementById('left-macd-component-' + id);
                if (macdCompEl) macdCompEl.value = cond.left_macd_component || 'histogram';
            }

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

            var thresholdHighEl = document.getElementById('threshold-value-high-' + id);
            if (thresholdHighEl && cond.threshold_value_high != null) thresholdHighEl.value = cond.threshold_value_high;
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

    if (document.getElementById('maxDays') && config.max_days !== undefined && config.max_days !== null) {
        document.getElementById('maxDays').value = config.max_days;
    }
    if (document.getElementById('exitTime') && config.exit_time) {
        document.getElementById('exitTime').value = config.exit_time;
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


// Shared UI toggle helpers (also defined in backtester-script.js for options form)
if (typeof btToggle === 'undefined') {
    window.btToggle = function(btn) {
        const radioName = btn.dataset.radio;
        const val = btn.dataset.val;
        const radios = document.querySelectorAll('input[name="' + radioName + '"]');
        radios.forEach(function(r) { r.checked = r.value === val; });
        var allBtns = btn.parentElement ? btn.parentElement.querySelectorAll('.bt-toggle-btn') : [];
        allBtns.forEach(function(b) { b.classList.remove('on'); });
        btn.classList.add('on');
    };
}

if (typeof toggleOptSection === 'undefined') {
    window.toggleOptSection = function(id) {
        var body = document.getElementById(id + 'Body');
        var header = body ? body.previousElementSibling : null;
        if (!body) return;
        var isOpen = body.classList.contains('open');
        body.classList.toggle('open', !isOpen);
        if (header) header.classList.toggle('open', !isOpen);
    };
}

// Stock backtester toggle helpers for redesigned UI
function setStockSizing(type) {
    document.getElementById('sizingShares').checked = type === 'shares';
    document.getElementById('sizingDollars').checked = type === 'dollars';
    document.getElementById('sizingPercent').checked = type === 'percent';
    document.querySelectorAll('#stockBacktesterPage .alloc-type-btn').forEach(b => b.classList.toggle('on', b.dataset.alloc === type));
    document.getElementById('sharesSection').style.display = type === 'shares' ? 'block' : 'none';
    document.getElementById('dollarsSection').style.display = type === 'dollars' ? 'block' : 'none';
    document.getElementById('percentSection').style.display = type === 'percent' ? 'grid' : 'none';
}

function setStockTpType(type) {
    document.getElementById('stockTpPct').checked = type === 'percent';
    document.getElementById('stockTpDollar').checked = type === 'dollar';
    document.getElementById('stockTpPctBtn').classList.toggle('on', type === 'percent');
    document.getElementById('stockTpDollarBtn').classList.toggle('on', type === 'dollar');
    document.getElementById('stockTpSuffix').textContent = type === 'percent' ? '%' : '$';
}

function setStockSlType(type) {
    document.getElementById('stockSlPct').checked = type === 'percent';
    document.getElementById('stockSlDollar').checked = type === 'dollar';
    document.getElementById('stockSlPctBtn').classList.toggle('on', type === 'percent');
    document.getElementById('stockSlDollarBtn').classList.toggle('on', type === 'dollar');
    document.getElementById('stockSlSuffix').textContent = type === 'percent' ? '%' : '$';
}
