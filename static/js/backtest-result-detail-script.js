var _optDetailState = { id: null, config: null, trades: [], page: 1, perPage: 10, chart: null, dtDays: [], dtPage: 1, dtCharts: [] };
var _dtChartData = {}; // key: absolute day idx → {day, bars, entryTime, exitTime, chart}
var _stkDetailState = { id: null, config: null, data: null, trades: [], page: 1, perPage: 10, chart: null, dtDays: [], dtPage: 1 };

function _btFmt(value) {
    if (value === undefined || value === null) return '$0.00';
    var prefix = value < 0 ? '-$' : '$';
    return prefix + Math.abs(value).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function _btPnlClass(val) { return val >= 0 ? 'text-success' : 'text-danger'; }

function _btStatRow(label, value, cls, sub) {
    return '<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid #f0f0f0;">' +
        '<span style="color:#6a6d78; font-size:13px;">' + label + '</span>' +
        '<span style="text-align:right;">' +
            '<span style="font-weight:600; font-size:13px;' + (cls ? ' color:' + (cls === 'positive' ? '#089981' : '#f23645') : '') + ';">' + value + '</span>' +
            (sub ? '<br><span style="font-size:10px; color:#aaa;">' + sub + '</span>' : '') +
        '</span></div>';
}

function _btConfigCard(label, value) {
    return '<div style="background:#f8f9fd; border:1px solid #e0e3eb; border-radius:8px; padding:10px 12px;">' +
        '<div style="font-size:10px; color:#6a6d78; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">' + label + '</div>' +
        '<div style="font-size:14px; font-weight:600; color:#191919;">' + value + '</div></div>';
}

function toggleBtDetailSection(bodyId, headerEl) {
    var body = document.getElementById(bodyId);
    if (!body) return;
    var isHidden = body.style.display === 'none';
    body.style.display = isHidden ? '' : 'none';
    var icon = headerEl.querySelector('.fa-chevron-down, .fa-chevron-up');
    if (icon) {
        icon.className = icon.className.replace(isHidden ? 'fa-chevron-down' : 'fa-chevron-up', isHidden ? 'fa-chevron-up' : 'fa-chevron-down');
    }
}

function _btBuildEquityCurve(canvasId, summaryId, labels, values) {
    var ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    var summaryEl = document.getElementById(summaryId);
    if (!values || values.length === 0) {
        ctx.parentElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#6a6d78;">No trades to display</div>';
        if (summaryEl) summaryEl.textContent = 'No trades';
        return null;
    }

    var finalValue = values[values.length - 1];
    var lineColor = finalValue >= 0 ? '#2563eb' : '#d14343';
    var fillColor = finalValue >= 0 ? 'rgba(37, 99, 235, 0.10)' : 'rgba(209, 67, 67, 0.10)';
    var minVal = Math.min.apply(null, values);
    var maxVal = Math.max.apply(null, values);
    var range = Math.max(maxVal - minVal, 1);
    var pad = range * 0.08;

    if (summaryEl) summaryEl.textContent = (values.length - 1) + ' trades | ' + _btFmt(finalValue) + ' cumulative P&L';

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Cumulative P&L ($)',
                data: values,
                borderColor: lineColor,
                backgroundColor: fillColor,
                borderWidth: 2,
                fill: true,
                tension: 0.1,
                pointRadius: values.length > 50 ? 0 : 2,
                pointHoverRadius: 4,
                pointBackgroundColor: lineColor
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
                    callbacks: { label: function(c) { return 'P&L: ' + _btFmt(c.parsed.y); } }
                }
            },
            scales: {
                x: { display: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6, font: { size: 11 }, color: '#7b8ba0' } },
                y: {
                    display: true, position: 'right', min: minVal - pad, max: maxVal + pad,
                    grid: { color: function(c) { return c.tick && c.tick.value === 0 ? 'rgba(31,41,55,0.5)' : 'rgba(0,0,0,0.06)'; } },
                    ticks: { font: { size: 11 }, color: '#7b8ba0', count: 4, callback: function(v) { return Math.abs(v) >= 1000 ? '$' + (v/1000).toFixed(0) + 'k' : '$' + Math.round(v); } }
                }
            }
        }
    });
}

function _parseCSVLine(line) {
    var result = [], current = '', inQuotes = false;
    for (var i = 0; i < line.length; i++) {
        if (line[i] === '"') inQuotes = !inQuotes;
        else if (line[i] === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
        else current += line[i];
    }
    result.push(current.trim());
    return result;
}

function initOptionsResultDetailPage() {
    var id = window._pendingOptDetailId || new URLSearchParams(window.location.search).get('id');
    if (!id) return;
    window._pendingOptDetailId = null;
    _optDetailState.id = id;
    _optDetailState.trades = [];
    _optDetailState.page = 1;
    _optDetailState.dtDays = [];
    _optDetailState.dtPage = 1;
    if (_optDetailState.chart) { _optDetailState.chart.destroy(); _optDetailState.chart = null; }

    document.getElementById('optDetailLoading').style.display = '';
    document.getElementById('optDetailContent').style.display = 'none';
    document.getElementById('optDetailError').style.display = 'none';
    document.getElementById('optDetailDecisionTreeCard').style.display = 'none';

    document.getElementById('optDetailDownloadCsv').onclick = function() {
        if (typeof TierRestrictions !== 'undefined' && !TierRestrictions.canDownloadCsv()) {
            return TierRestrictions.showUpgradeMessage('CSV download requires a Standard or Premium plan.');
        }
        window.location.href = '/api/files/trade-log/' + id;
    };

    document.getElementById('optDetailPrevBtn').onclick = function() { if (_optDetailState.page > 1) { _optDetailState.page--; _renderOptTradesPage(); } };
    document.getElementById('optDetailNextBtn').onclick = function() {
        var tp = Math.ceil(_optDetailState.trades.length / _optDetailState.perPage);
        if (_optDetailState.page < tp) { _optDetailState.page++; _renderOptTradesPage(); }
    };

    _loadOptResults(id);
}

async function _loadOptResults(id) {
    try {
        var resp = await authFetch('/api/files/metadata/' + id);
        if (!resp.ok) throw new Error('Failed to load metadata');
        var metadata = await resp.json();

        if (metadata.status === 'running') {
            document.getElementById('optDetailLoadingMsg').textContent = 'Running backtest...';
            setTimeout(function() { _pollOptStatus(id); }, 2000);
            return;
        }
        if (metadata.status === 'error') { _showOptError(metadata.error || 'Backtest failed'); return; }

        _optDetailState.config = metadata.config || {};
        _displayOptDetail(metadata);

        // Decision log is stripped from metadata and served separately
        try {
            var dlResp = await authFetch('/api/files/decision-log/' + id);
            if (dlResp.ok) {
                var decisionLog = await dlResp.json();
                if (Array.isArray(decisionLog) && decisionLog.length > 0) {
                    _buildOptDetailDecisionTree(decisionLog);
                }
            }
        } catch(dlErr) { console.warn('Could not load decision log:', dlErr); }

    } catch (e) {
        _showOptError(e.message);
    }
}

async function _pollOptStatus(id) {
    try {
        var resp = await authFetch('/api/backtest/status/' + id);
        var status = await resp.json();
        if (status.status === 'completed') {
            _loadOptResults(id);
        } else if (status.status === 'error') {
            _showOptError(status.error || 'Backtest failed');
        } else {
            setTimeout(function() { _pollOptStatus(id); }, 2000);
        }
    } catch(e) { setTimeout(function() { _pollOptStatus(id); }, 3000); }
}

function _showOptError(msg) {
    document.getElementById('optDetailLoading').style.display = 'none';
    document.getElementById('optDetailError').style.display = '';
    document.getElementById('optDetailErrorMsg').textContent = msg;
}

async function _displayOptDetail(metadata) {
    document.getElementById('optDetailLoading').style.display = 'none';
    document.getElementById('optDetailContent').style.display = '';

    var config = metadata.config || {};
    var summary = metadata.summary || {};

    document.getElementById('optDetailTitle').textContent = (config.strategy || 'Options') + ' Backtest Analysis';
    document.getElementById('optDetailBreadcrumb').textContent = config.strategy || 'Backtest';
    document.getElementById('optDetailStrategy').textContent = config.strategy || '--';
    document.getElementById('optDetailSymbol').textContent = config.symbol || '--';
    document.getElementById('optDetailTotalTrades').textContent = summary.total_trades || 0;

    var pnl = summary.total_pnl || 0;
    var pnlEl = document.getElementById('optDetailNetPnl');
    pnlEl.textContent = _btFmt(pnl);
    pnlEl.style.color = pnl >= 0 ? '#089981' : '#f23645';
    var pnlIcon = document.getElementById('optDetailPnlIcon');
    if (pnlIcon) pnlIcon.className = 'icon-big text-center bubble-shadow-small ' + (pnl >= 0 ? 'icon-success' : 'icon-danger');

    var statsHtml = '';
    statsHtml += _btStatRow('Win Rate', (summary.win_rate || 0).toFixed(1) + '%', (summary.win_rate || 0) >= 50 ? 'positive' : null);
    statsHtml += _btStatRow('Return %', (summary.total_return || 0).toFixed(2) + '%', (summary.total_return || 0) > 0 ? 'positive' : (summary.total_return || 0) < 0 ? 'negative' : null);
    statsHtml += _btStatRow('Profit Factor', (summary.profit_factor || 0).toFixed(2), (summary.profit_factor || 0) > 1 ? 'positive' : 'negative');
    statsHtml += _btStatRow('Max Drawdown', (summary.max_drawdown || 0).toFixed(2) + '%', (summary.max_drawdown || 0) < 0 ? 'negative' : null);
    var awSub = summary.avg_win_per_contract != null && summary.avg_win_per_contract !== 0
        ? _btFmt(summary.avg_win_per_contract) + ' per contract' : null;
    statsHtml += _btStatRow('Avg Win', _btFmt(summary.avg_win || 0), (summary.avg_win || 0) > 0 ? 'positive' : null, awSub);
    var alSub = summary.avg_loss_per_contract != null && summary.avg_loss_per_contract !== 0
        ? _btFmt(summary.avg_loss_per_contract) + ' per contract' : null;
    statsHtml += _btStatRow('Avg Loss', _btFmt(summary.avg_loss || 0), (summary.avg_loss || 0) < 0 ? 'negative' : null, alSub);
    statsHtml += _btStatRow('Final Capital', summary.final_capital ? '$' + summary.final_capital.toLocaleString() : 'N/A');
    document.getElementById('optDetailStatsBody').innerHTML = statsHtml;

    _renderOptConfig(config);

    if (config && Object.keys(config).length > 0) {
        document.getElementById('optDetailUseTemplate').style.display = '';
    }

    try {
        var tradeResp = await authFetch('/api/files/trade-log/' + _optDetailState.id);
        if (tradeResp.ok) {
            var csvText = await tradeResp.text();
            var lines = csvText.trim().split('\n');
            if (lines.length >= 2) {
                var headers = lines[0].split(',').map(function(h) { return h.trim(); });
                document.getElementById('optDetailTradeLogHeader').innerHTML = headers.map(function(h) { return '<th>' + h + '</th>'; }).join('');

                _optDetailState.trades = [];
                for (var i = 1; i < lines.length; i++) {
                    var vals = _parseCSVLine(lines[i]);
                    if (vals.length > 0) _optDetailState.trades.push({ values: vals, headers: headers });
                }

                var labels = ['Start'], values = [0], runningTotal = 0;
                var pnlIdx = -1;
                var lowerHeaders = headers.map(function(h) { return h.toLowerCase(); });
                for (var j = 0; j < lowerHeaders.length; j++) {
                    if (lowerHeaders[j] === 'pnl') { pnlIdx = j; break; }
                }
                if (pnlIdx < 0) {
                    for (var j = 0; j < lowerHeaders.length; j++) {
                        if (lowerHeaders[j].indexOf('net_pnl') >= 0 || lowerHeaders[j].indexOf('p&l') >= 0 || lowerHeaders[j].indexOf('profit') >= 0) { pnlIdx = j; break; }
                    }
                }
                var dateIdx = -1;
                for (var j = 0; j < lowerHeaders.length; j++) {
                    if (lowerHeaders[j].indexOf('exit_date') >= 0 || lowerHeaders[j].indexOf('date') >= 0) { dateIdx = j; break; }
                }

                _optDetailState.trades.forEach(function(t, idx) {
                    if (pnlIdx >= 0 && t.values[pnlIdx]) {
                        runningTotal += parseFloat(t.values[pnlIdx].replace(/[^0-9.\-]/g, '')) || 0;
                    }
                    labels.push(dateIdx >= 0 ? t.values[dateIdx] : 'Trade ' + (idx + 1));
                    values.push(runningTotal);
                });

                if (_optDetailState.chart) _optDetailState.chart.destroy();
                _optDetailState.chart = _btBuildEquityCurve('optDetailEquityChart', 'optDetailEquitySummary', labels, values);
                _optDetailState.page = 1;
                _renderOptTradesPage();
            } else {
                // 0-trade run — explicitly clear any stale DOM from a previous run
                _optDetailState.trades = [];
                _optDetailState.page = 1;
                document.getElementById('optDetailTradeLogHeader').innerHTML = '';
                if (_optDetailState.chart) { _optDetailState.chart.destroy(); _optDetailState.chart = null; }
                _btBuildEquityCurve('optDetailEquityChart', 'optDetailEquitySummary', [], []);
                _renderOptTradesPage();
            }
        }
    } catch(e) { console.error('Error loading trade log:', e); }

    if (metadata.decision_log && metadata.decision_log.length > 0) {
        _buildOptDetailDecisionTree(metadata.decision_log);
    }

    if (typeof TierRestrictions !== 'undefined') TierRestrictions.disableCsvButtons();
}

function _renderOptConfig(config) {
    var items = [];
    if (config.strategy) items.push({l: 'Strategy', v: config.strategy});
    if (config.symbol) items.push({l: 'Symbol', v: config.symbol});
    if (config.start_date && config.end_date) items.push({l: 'Date Range', v: config.start_date + ' to ' + config.end_date});
    if (config.entry_time) items.push({l: 'Entry Time', v: config.entry_time});
    if (config.dte !== undefined) items.push({l: 'DTE', v: config.dte});
    if (config.initial_capital) items.push({l: 'Initial Capital', v: '$' + config.initial_capital.toLocaleString()});
    if (config.allocation_type && config.allocation_value) {
        var at = config.allocation_type === 'pct' ? 'Percentage' : 'Dollar';
        var av = config.allocation_type === 'pct' ? config.allocation_value + '%' : '$' + config.allocation_value;
        items.push({l: 'Position Sizing', v: at + ': ' + av});
    }
    if (config.take_profit_pct) items.push({l: 'Take Profit', v: config.take_profit_pct + '%'});
    else if (config.take_profit_dollar) items.push({l: 'Take Profit', v: '$' + config.take_profit_dollar});
    if (config.stop_loss_pct) items.push({l: 'Stop Loss', v: config.stop_loss_pct + '%'});
    else if (config.stop_loss_dollar) items.push({l: 'Stop Loss', v: '$' + config.stop_loss_dollar});
    if (config.detection_bar_size) {
        var intText = config.detection_bar_size < 1 ? (config.detection_bar_size * 60) + ' seconds' : config.detection_bar_size + ' minutes';
        items.push({l: 'Detection Interval', v: intText});
    }
    if (config.avoid_pdt !== undefined) items.push({l: 'Avoid PDT', v: config.avoid_pdt ? 'Yes' : 'No'});
    if (config.concurrent_trades !== undefined) items.push({l: 'Concurrent Trades', v: config.concurrent_trades ? 'Allowed' : 'Not Allowed'});

    var html = items.map(function(i) { return _btConfigCard(i.l, i.v); }).join('');

    if (config.legs) {
        var legsArr = Array.isArray(config.legs) ? config.legs : Object.entries(config.legs).map(function(e) { return Object.assign({}, e[1], {name: e[0]}); });
        if (legsArr.length > 0) {
            html += '<div style="grid-column: 1 / -1; background:#f8f9fd; border:1px solid #e0e3eb; border-radius:8px; padding:10px 12px;">';
            html += '<div style="font-size:10px; color:#6a6d78; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px;">Strategy Legs</div>';
            legsArr.forEach(function(leg, idx) {
                var name = leg.name || 'Leg ' + (idx + 1);
                var ct = leg.config_type || 'mid_price';
                var p = leg.params || leg;
                var desc = '';
                if (ct === 'delta') desc = 'Delta: ' + (p.target_delta || p.delta || 0.30) + ' (' + (p.method || 'closest') + ')';
                else if (ct === 'dollar_underlying') desc = '$' + p.amount + ' ' + p.direction + ' underlying';
                else if (ct === 'pct_underlying') desc = p.pct + '% ' + p.direction + ' underlying';
                else if (ct === 'dollar_leg') desc = '$' + p.amount + ' ' + p.direction + ' ' + (p.reference_leg || 'Leg ' + p.reference);
                else if (ct === 'pct_leg') desc = p.pct + '% ' + p.direction + ' ' + (p.reference_leg || 'Leg ' + p.reference);
                else if (ct === 'mid_price') desc = (p.min !== undefined && p.max !== undefined) ? 'Mid price: $' + p.min + ' - $' + p.max : 'ATM strike';
                var pos = leg.position || 'long';
                var ot = leg.type === 'C' ? 'Call' : leg.type === 'P' ? 'Put' : '';
                if (ot) desc = pos.charAt(0).toUpperCase() + pos.slice(1) + ' ' + ot + ' - ' + desc;
                html += '<div style="font-size:13px; padding:4px 0; border-bottom:1px dashed #e0e3eb;"><span style="font-weight:600; color:#1a9988;">' + name + '</span>: ' + desc + '</div>';
            });
            html += '</div>';
        }
    }

    var candleFmtDetail = function(candle, mult) {
        var m = parseInt(mult) || 1;
        if (candle === 'minute') return m + 'min';
        if (candle === 'hour') return m + 'hr';
        if (candle === 'day') return m > 1 ? m + 'day' : 'day';
        return candle;
    };

    var opLabel = function(op) {
        var map = {'cross_up':'↑ Cross Up','cross_down':'↓ Cross Down','cross_either':'↕ Crosses','>=':'≥','<=':'≤','==':'=','><':'≠'};
        return map[op] || op;
    };

    var fmtConditionSide = function(metric, sideObj) {
        var left = sideObj || {};
        var leftDay = parseInt(left.day) || 0;
        var leftCandle = left.candle_type || 'minute';
        var leftSeries = left.series_type || 'close';
        var leftWindow = left.window ? '(' + left.window + ')' : '';
        var leftTf = left.timeframe_minutes || (parseInt(left.multiplier) || 1);
        var isCurrentPrice = metric === 'PRICE' && leftDay === 0 && leftCandle === 'minute' && leftSeries === 'vwap';
        if (isCurrentPrice) return 'Current Price';
        var cFmt = function(c, tf) {
            if (c === 'minute') return tf + 'min';
            if (c === 'hour') return (parseInt(left.multiplier) || 1) + 'hr';
            if (c === 'day') return (parseInt(left.multiplier) || 1) > 1 ? (parseInt(left.multiplier) || 1) + 'day' : 'day';
            return c;
        };
        return metric + leftWindow + ' ' + leftSeries + ' [day ' + leftDay + ', ' + cFmt(leftCandle, leftTf) + ']';
    };

    var fmtCondition = function(pc) {
        var metric = (pc.metric || 'price').toUpperCase();
        var op = opLabel(pc.operator || '>');
        var leftDesc = fmtConditionSide(metric, pc.left);
        var rightDesc = '';
        if (pc.comparator === 'value') {
            rightDesc = String(pc.compare_value != null ? pc.compare_value : '');
        } else {
            var rightMetric = (pc.comparator || '').replace('compare_', '').toUpperCase();
            var right = pc.right || {};
            rightDesc = fmtConditionSide(rightMetric, right);
            var threshold = pc.threshold || {};
            var threshVal = parseFloat(threshold.value);
            if (threshVal) {
                rightDesc += ' \u00b1' + threshVal + (threshold.unit === 'percent' ? '%' : '$');
            }
        }
        return leftDesc + ' ' + op + ' ' + rightDesc;
    };

    var hasEntryConds = config.price_conditions && config.price_conditions.length > 0;
    var hasExitConds = config.exit_price_conditions && config.exit_price_conditions.length > 0;
    var hasPreset = config.options_entry_type === 'preset' && config.preset_condition;

    if (hasPreset || hasEntryConds) {
        var condLines = [];
        if (hasPreset) {
            var presetNames = {'1':'Premarket Change %','2':'Change %','3':'Gap %','4':'Change-Open %','5':'Velocity'};
            var condName = presetNames[config.preset_condition] || ('Preset #' + config.preset_condition);
            var pLine = condName + ': ' + (config.preset_operator || '>') + ' ' + (config.preset_threshold || 0) + '%';
            if (config.preset_condition === '5') pLine += ' over ' + (config.velocity_lookback || 5) + ' min';
            condLines.push(pLine);
        } else {
            condLines = config.price_conditions.map(fmtCondition);
        }
        html += '<div style="grid-column: 1 / -1; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:10px 12px;">';
        html += '<div style="font-size:10px; color:#166534; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px;">Entry Conditions</div>';
        condLines.forEach(function(line) {
            html += '<div style="font-size:13px; color:#191919; padding:3px 0; border-bottom:1px dashed #d1fae5;">' + line + '</div>';
        });
        html += '</div>';
    }

    if (hasExitConds) {
        var exitLines = config.exit_price_conditions.map(fmtCondition);
        html += '<div style="grid-column: 1 / -1; background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; padding:10px 12px;">';
        html += '<div style="font-size:10px; color:#9a3412; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px;">Exit Conditions</div>';
        exitLines.forEach(function(line) {
            html += '<div style="font-size:13px; color:#191919; padding:3px 0; border-bottom:1px dashed #fdba74;">' + line + '</div>';
        });
        html += '</div>';
    }

    document.getElementById('optDetailConfigList').innerHTML = html;
}

function _renderOptTradesPage() {
    var trades = _optDetailState.trades;
    var page = _optDetailState.page;
    var pp = _optDetailState.perPage;
    var total = trades.length;
    var totalPages = Math.ceil(total / pp);
    var start = (page - 1) * pp;
    var end = Math.min(start + pp, total);

    document.getElementById('optDetailTradeLogInfo').textContent = total > 0 ? 'Showing ' + (start + 1) + '-' + end + ' of ' + total + ' trades' : 'No trades';
    document.getElementById('optDetailPrevBtn').disabled = page <= 1;
    document.getElementById('optDetailNextBtn').disabled = page >= totalPages;

    var tbody = document.getElementById('optDetailTradeLogBody');
    tbody.innerHTML = '';
    for (var i = start; i < end; i++) {
        var t = trades[i];
        var row = document.createElement('tr');
        row.innerHTML = t.values.map(function(val, idx) {
            var h = t.headers[idx].toLowerCase();
            if (h.indexOf('p&l') >= 0 || h.indexOf('pnl') >= 0 || h.indexOf('profit') >= 0) {
                var nv = parseFloat(val.replace(/[^0-9.\-]/g, ''));
                return '<td class="' + (nv >= 0 ? 'text-success' : 'text-danger') + '">' + val + '</td>';
            }
            return '<td>' + val + '</td>';
        }).join('');
        tbody.appendChild(row);
    }
}

function _buildOptDetailDecisionTree(log) {
    if (!log || log.length === 0) return;
    _optDetailState.dtDays = log;
    _optDetailState.dtPage = 1;
    _optDetailState.dtCharts = _optDetailState.dtCharts || [];
    document.getElementById('optDetailDecisionTreeCard').style.display = '';
    document.getElementById('optDetailDtPrevBtn').onclick = function() { if (_optDetailState.dtPage > 1) { _optDetailState.dtPage--; _renderOptDtPage(); } };
    document.getElementById('optDetailDtNextBtn').onclick = function() {
        if (_optDetailState.dtPage < Math.ceil(_optDetailState.dtDays.length / 10)) { _optDetailState.dtPage++; _renderOptDtPage(); }
    };
    _renderOptDtPage();
}

function _renderOptDtPage() {
    // Destroy any previously created inline charts
    Object.keys(_dtChartData).forEach(function(k) {
        var s = _dtChartData[k];
        if (s.chart) { try { s.chart.remove(); } catch(e) {} }
    });
    _dtChartData = {};
    _optDetailState.dtCharts = [];

    var days = _optDetailState.dtDays;
    var page = _optDetailState.dtPage;
    var pp = 10;
    var total = days.length;
    var totalPages = Math.ceil(total / pp);
    var start = (page - 1) * pp;
    var end = Math.min(start + pp, total);

    document.getElementById('optDetailDtInfo').textContent = total > 0 ? 'Showing ' + (start + 1) + '-' + end + ' of ' + total + ' trading days' : '';
    document.getElementById('optDetailDtPrevBtn').disabled = page <= 1;
    document.getElementById('optDetailDtNextBtn').disabled = page >= totalPages;

    var html = '';
    for (var i = start; i < end; i++) {
        var day = days[i];
        var status = day.status || 'SKIPPED';
        var badgeColor = '#94a3b8', badgeText = 'Skipped', headerBg = '#f8fafc';
        if (status === 'ENTRY') { badgeColor = '#10b981'; badgeText = 'Entry'; headerBg = '#f0fdf4'; }
        else if (status === 'EXIT') { badgeColor = '#f59e0b'; badgeText = 'Exit'; headerBg = '#fffbeb'; }

        var exitEvents = (day.events || []).filter(function(e) { return e.type === 'exit'; });
        var dayPnl = exitEvents.reduce(function(s, e) { return s + (e.pnl || 0); }, 0);

        var flowHtml = '';
        if (day.underlying_price != null) {
            flowHtml += '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#f1f5f9;border-radius:6px;margin-bottom:6px;font-size:12px;"><i class="fas fa-chart-line" style="color:#64748b;"></i> <strong>' + (day.symbol || 'Underlying') + ':</strong> $' + day.underlying_price.toFixed(2) + '</div>';
        }
        if (day.strategy) {
            flowHtml += '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#f1f5f9;border-radius:6px;margin-bottom:6px;font-size:12px;"><i class="fas fa-cogs" style="color:#64748b;"></i> <strong>Strategy:</strong> ' + day.strategy + '</div>';
        }

        flowHtml += '<div style="border-left:2px solid #e2e8f0;margin-left:16px;padding-left:12px;">';
        (day.events || []).forEach(function(evt) {
            if (evt.type === 'no_data' || evt.type === 'no_signal') {
                flowHtml += '<div style="padding:6px 10px;background:#f8fafc;border-radius:6px;margin-bottom:4px;border-left:3px solid #94a3b8;font-size:12px;color:#64748b;">' + (evt.type === 'no_data' ? 'NO DATA' : 'CONDITIONS NOT MET') + ': ' + (evt.reason || '') + '</div>';
            } else if (evt.type === 'condition_met') {
                var _cmDetail = '';
                if (evt.conditions && evt.conditions.length > 0) {
                    _cmDetail = evt.conditions.map(function(c) {
                        var lLabel = c.left_label  || (c.metric === 'price' ? (c.series_type || 'price').toUpperCase() : c.metric.toUpperCase());
                        var rLabel = c.right_label || c.right_metric || 'ref';
                        var lv  = c.left_value      != null ? c.left_value.toFixed(2)      : '?';
                        var raw = c.right_value     != null ? c.right_value.toFixed(2)     : '?';
                        var eff = c.effective_right != null ? c.effective_right.toFixed(2) : raw;
                        var thr = '';
                        if (c.threshold && c.threshold !== 0) {
                            var sign = (c.operator === '<' || c.operator === '<=') ? '\u2212' : '+';
                            var unit = c.threshold_unit === 'points' ? 'pts' : '%';
                            thr = ' <span style="opacity:.7;">' + sign + c.threshold + unit + ' \u2192 $' + eff + '</span>';
                        }
                        return lLabel + ' <strong>$' + lv + '</strong> ' + c.operator + ' ' + rLabel + ' <strong>$' + raw + '</strong>' + thr;
                    }).join(' &amp; ');
                    _cmDetail = '<div style="margin-top:3px;font-size:11px;opacity:.85;">' + _cmDetail + '</div>';
                }
                flowHtml += '<div style="padding:6px 10px;background:#ecfdf5;border-radius:6px;margin-bottom:4px;border-left:3px solid #10b981;font-size:12px;color:#065f46;"><span style="font-weight:600;">CONDITIONS MET</span> at ' + (evt.time || '') + ' — Price $' + (evt.price != null ? evt.price.toFixed(2) : 'N/A') + _cmDetail + '</div>';
            } else if (evt.type === 'entry') {
                var legsH = '';
                if (evt.legs && evt.legs.length > 0) {
                    legsH = evt.legs.map(function(l) { return '<span style="display:inline-block;background:#e0e7ff;color:#3730a3;padding:1px 6px;border-radius:4px;font-size:10px;margin:2px 3px 0 0;">' + l.position + ' ' + (l.type === 'C' ? 'Call' : 'Put') + ' ' + l.name + ' @ $' + l.strike + '</span>'; }).join('');
                }
                flowHtml += '<div style="padding:6px 10px;background:#f0fdf4;border-radius:6px;margin-bottom:4px;border-left:3px solid #10b981;font-size:12px;"><strong>ENTRY</strong> @ ' + (evt.time || '') + ' | ' + (evt.num_contracts || '') + ' contracts | Premium: $' + (evt.net_premium || 0).toFixed(4) + (legsH ? '<div style="margin-top:3px;">' + legsH + '</div>' : '') + '</div>';
            } else if (evt.type === 'exit') {
                var ep = evt.pnl || 0;
                var epc = ep >= 0 ? '#10b981' : '#ef4444';
                flowHtml += '<div style="padding:6px 10px;background:' + (ep >= 0 ? '#f0fdf4' : '#fef2f2') + ';border-radius:6px;margin-bottom:4px;border-left:3px solid ' + epc + ';font-size:12px;"><strong>EXIT</strong> Trade #' + (evt.trade_num || '?') + ' (' + _fmtExitReason(evt.exit_reason) + ') | <span style="color:' + epc + ';font-weight:600;">P&L: $' + ep.toFixed(2) + '</span></div>';
            } else if (evt.type === 'skip') {
                flowHtml += '<div style="padding:6px 10px;background:#fffbeb;border-radius:6px;margin-bottom:4px;border-left:3px solid #f59e0b;font-size:12px;color:#92400e;">SKIPPED: ' + (evt.reason || '') + '</div>';
            } else if (evt.type === 'error') {
                flowHtml += '<div style="padding:6px 10px;background:#fef2f2;border-radius:6px;margin-bottom:4px;border-left:3px solid #ef4444;font-size:12px;color:#991b1b;">ERROR: ' + (evt.reason || '') + '</div>';
            }
        });
        flowHtml += '</div>';

        // Candlestick chart — only rendered for days that actually entered a trade
        var _hasEntry = (day.events || []).some(function(e){ return e.type === 'entry'; });
        var hasBars   = _hasEntry && day.bars && day.bars.length > 0;
        if (hasBars) {
            var _eT = day.entry_time || null;
            var _eEvt = (day.events || []).find(function(e) { return e.type === 'entry'; });
            if (_eEvt && _eEvt.time) _eT = _eEvt.time.slice(0, 5);
            var _xEvt = (day.events || []).find(function(e) { return e.type === 'exit'; });
            var _xT = _xEvt && _xEvt.exit_time ? _xEvt.exit_time.slice(0, 5) : null;
            _dtChartData[i] = { day: day, bars: day.bars, entryTime: _eT, exitTime: _xT, exitDate: day.exit_date || day.date, multi_day_bars: day.multi_day_bars || null, chart: null };

            flowHtml += '<div style="margin-top:10px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background:#fff;">' +
                '<div style="padding:7px 12px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;background:#fafbfc;">' +
                '<div style="font-size:11px;color:#64748b;font-weight:600;letter-spacing:0.03em;"><i class="fas fa-chart-bar" style="color:#3b7cff;margin-right:5px;font-size:10px;"></i>' + (day.symbol || '') + ' · ' + day.date + (_eT ? '  ·  Entry: <span style="color:#10b981;">' + _eT + '</span>' : '') + '</div>' +
                '<div style="display:flex;gap:6px;align-items:center;">' +
                '<span style="font-size:10px;color:#94a3b8;">Scroll: zoom · Drag: pan</span>' +
                '<button onclick="_openDtChartModal(' + i + ')" style="border:none;background:#e8eef7;border-radius:5px;width:26px;height:26px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;" title="Expand to fullscreen"><i class="fas fa-expand-alt" style="font-size:11px;color:#3b7cff;"></i></button>' +
                '</div></div>' +
                '<div id="dtChart_' + i + '" data-chart-day-idx="' + i + '" style="height:260px;"></div>' +
                '</div>';
        }

        html += '<div style="border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px;overflow:hidden;">' +
            '<div onclick="_toggleDtDay(this)" style="padding:10px 14px;background:' + headerBg + ';cursor:pointer;display:flex;justify-content:space-between;align-items:center;">' +
            '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;"><i class="fas fa-calendar-day" style="color:#3b7cff;"></i><span style="font-weight:600;">' + day.date + '</span><span style="background:' + badgeColor + ';color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;">' + badgeText + '</span>' +
            (exitEvents.length > 0 ? '<span style="color:' + (dayPnl >= 0 ? '#10b981' : '#ef4444') + ';font-weight:600;font-size:12px;">P&L: $' + dayPnl.toFixed(2) + '</span>' : '') +
            '</div><i class="fas fa-chevron-down" style="color:#94a3b8;font-size:12px;"></i></div>' +
            '<div class="dt-day-body" style="padding:10px 14px;display:none;">' + flowHtml + '</div></div>';
    }
    document.getElementById('optDetailDtContent').innerHTML = html;
}

function _toTs(dateStr, timeStr) {
    var p = dateStr.split('-');
    var t = (timeStr || '00:00').split(':');
    return Date.UTC(+p[0], +p[1] - 1, +p[2], +t[0], +t[1]) / 1000;
}

function _toggleDtDay(headerEl) {
    var body = headerEl.nextElementSibling;
    var wasHidden = body.style.display === 'none';
    body.style.display = wasHidden ? 'block' : 'none';
    if (wasHidden) {
        var chartDiv = body.querySelector('[data-chart-day-idx]');
        if (!chartDiv) return;
        var idx = parseInt(chartDiv.getAttribute('data-chart-day-idx'));
        var stored = _dtChartData[idx];
        if (!stored) return;
        if (!stored.chart) {
            stored.chart = _buildLwChart(chartDiv, stored, false);
        } else {
            stored.chart.applyOptions({ width: chartDiv.clientWidth });
        }
    }
}

// aggBars (optional): pre-aggregated [{timestamp(ms), open, high, low, close}] bars for modal use
// tf (optional): current timeframe in minutes — used to snap entry/exit marker timestamps
function _buildLwChart(container, stored, isModal, aggBars, tf) {
    if (typeof LightweightCharts === 'undefined') return null;
    container.innerHTML = '';
    var w = container.clientWidth || 600;
    var h = container.clientHeight || (isModal ? 500 : 190);
    tf = tf || 1;
    var chart = LightweightCharts.createChart(container, {
        layout: { background: { color: '#ffffff' }, textColor: '#475569', fontSize: 11 },
        grid: { vertLines: { color: '#f1f5f9' }, horzLines: { color: '#f1f5f9' } },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        timeScale: {
            timeVisible: true,
            secondsVisible: false,
            borderColor: '#e2e8f0',
            tickMarkFormatter: function(t) {
                var d = new Date(t * 1000);
                return d.getUTCHours().toString().padStart(2,'0') + ':' + d.getUTCMinutes().toString().padStart(2,'0');
            }
        },
        rightPriceScale: { borderColor: '#e2e8f0', autoScale: true, scaleMargins: { top: 0.15, bottom: 0.15 } },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
        handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
        width: w,
        height: h
    });

    var cs = chart.addCandlestickSeries({
        upColor: '#089981', downColor: '#f23645',
        borderUpColor: '#089981', borderDownColor: '#f23645',
        wickUpColor: '#089981', wickDownColor: '#f23645'
    });

    var data;
    if (aggBars) {
        // Modal: use pre-aggregated object-format bars so TF is respected
        data = aggBars.filter(function(b){ return b.open > 0; }).map(function(b) {
            return { time: Math.floor(b.timestamp / 1000), open: b.open, high: b.high, low: b.low, close: b.close };
        });
    } else if (stored.multi_day_bars) {
        data = [];
        var _mdDates = Object.keys(stored.multi_day_bars).sort();
        _mdDates.forEach(function(dateStr) {
            (stored.multi_day_bars[dateStr] || []).forEach(function(b) {
                if (b[1] > 0) data.push({ time: _toTs(dateStr, b[0]), open: b[1], high: b[2], low: b[3], close: b[4] });
            });
        });
    } else {
        data = (stored.bars || []).map(function(b) {
            return { time: _toTs(stored.day.date, b[0]), open: b[1], high: b[2], low: b[3], close: b[4] };
        }).filter(function(d) { return d.open > 0; });
    }
    cs.setData(data);

    var markers = [];
    if (stored.entryTime) {
        var eRaw = _toTs(stored.day.date, stored.entryTime);
        markers.push({ time: _dtSnapToTf(eRaw, tf), position: 'belowBar', color: '#10b981', shape: 'arrowUp', text: 'Entry' });
    }
    if (stored.exitTime) {
        var xRaw = _toTs(stored.exitDate || stored.day.date, stored.exitTime);
        markers.push({ time: _dtSnapToTf(xRaw, tf), position: 'aboveBar', color: '#ef4444', shape: 'arrowDown', text: 'Exit' });
    }
    if (markers.length) cs.setMarkers(markers);

    // Initial view:
    //   Inline card  → ±15 min around entry (zoomed in, like TradingView default)
    //   Fullscreen modal → entry-5min to exit+20min so full trade span is visible
    (function() {
        var eT = stored.entryTime;
        var xT = stored.exitTime;
        if (!eT) return;
        var ets = _toTs(stored.day.date, eT);
        var from, to;
        if (isModal && xT) {
            var xts = _toTs(stored.exitDate || stored.day.date, xT);
            from = ets - 5  * 60;
            to   = xts + 20 * 60;
        } else {
            // Inline card: tight ±15 min window around entry
            from = ets - 15 * 60;
            to   = ets + 15 * 60;
        }
        chart.timeScale().setVisibleRange({ from: from, to: to });
    })();

    var ro = new ResizeObserver(function() {
        if (container.clientWidth > 0 && container.clientHeight > 0) {
            chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
        }
    });
    ro.observe(container);
    container._lwRo = ro;
    return chart;
}

// ─── DT Modal indicator state ───────────────────────────────────────────────
var _dtModalIndicators  = [];   // [{id, type, period, color, lineWidth, label, series}]
var _dtModalIndNextId   = 0;
var _dtModalBars        = [];   // seed + current-day bars (at current TF) — used for SMA/EMA warmup
var _dtModalDayBars     = [];   // current-day bars (at current TF) — used for VWAP
var _dtModalCutoffTs    = 0;    // Unix seconds of first current-day bar; SMA/EMA output filtered to >= this

// ─── DT Modal timeframe state ────────────────────────────────────────────────
var _dtCurrentTf        = 1;    // active timeframe in minutes (1, 5, 15, 30, 60)
var _dtCurrentStored    = null; // stored object for the currently-open modal
var _dtRawAllBars       = [];   // raw 1-min seed+day bars (object format) — source of truth
var _dtRawDayBars       = [];   // raw 1-min day-only bars (object format) — source of truth

// Aggregate 1-min object-format bars into tf-minute candles
function _dtAggregateBars(bars, tf) {
    if (!tf || tf <= 1) return bars.slice();
    var out = [], bucket = null;
    var tfMs = tf * 60 * 1000;
    bars.forEach(function(b) {
        var bStart = Math.floor(b.timestamp / tfMs) * tfMs;
        if (!bucket || bucket.timestamp !== bStart) {
            if (bucket) out.push(bucket);
            bucket = { timestamp: bStart, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume || 0 };
        } else {
            if (b.high > bucket.high) bucket.high = b.high;
            if (b.low  < bucket.low)  bucket.low  = b.low;
            bucket.close   = b.close;
            bucket.volume += b.volume || 0;
        }
    });
    if (bucket) out.push(bucket);
    return out;
}

// Snap a Unix-seconds timestamp to the start of its tf-minute bucket
function _dtSnapToTf(ts, tf) {
    if (!tf || tf <= 1) return ts;
    var bucket = tf * 60;
    return Math.floor(ts / bucket) * bucket;
}

// Update TF button active state and re-render the modal chart
function _dtSetTf(tf) {
    _dtCurrentTf = tf;
    document.querySelectorAll('.dt-tf-btn').forEach(function(btn) {
        var active = parseInt(btn.dataset.tf) === tf;
        btn.style.background   = active ? '#3b7cff' : '#fff';
        btn.style.color        = active ? '#fff'    : '#475569';
        btn.style.borderColor  = active ? '#3b7cff' : '#d1d4dc';
        btn.style.fontWeight   = active ? '600'     : '500';
    });
    _dtRebuildModalChart();
}

// ─── Shared helper: destroy all sub-panel LW charts and clear body ────────────
function _dtDestroyBodyCharts() {
    var body = document.getElementById('dtChartModalBody');
    if (!body) return;
    _dtModalIndicators.forEach(function(ind) {
        if (ind.subRo)   { try { ind.subRo.disconnect(); } catch(e){} ind.subRo = null; }
        if (ind.subChart){ try { ind.subChart.remove();  } catch(e){} ind.subChart = null; }
        ind.subDiv = null; ind.series = null;
    });
    if (body._lwModalChart) { try { body._lwModalChart.remove(); } catch(e){} body._lwModalChart = null; }
    if (body._lwRo)         { try { body._lwRo.disconnect();     } catch(e){} body._lwRo = null; }
    body.innerHTML = '';
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
}

function _dtRebuildModalChart() {
    var body = document.getElementById('dtChartModalBody');
    if (!body || !_dtCurrentStored) return;

    _dtDestroyBodyCharts();

    _dtModalBars     = _dtAggregateBars(_dtRawAllBars, _dtCurrentTf);
    _dtModalDayBars  = _dtAggregateBars(_dtRawDayBars, _dtCurrentTf);
    _dtModalCutoffTs = _dtModalDayBars.length > 0 ? Math.floor(_dtModalDayBars[0].timestamp / 1000) : 0;

    setTimeout(function() {
        var priceDiv = document.createElement('div');
        priceDiv.id = 'dtPriceDiv';
        priceDiv.style.cssText = 'flex:1;min-height:0;width:100%;';
        body.appendChild(priceDiv);
        body._lwModalChart = _buildLwChart(priceDiv, _dtCurrentStored, true, _dtModalDayBars, _dtCurrentTf);
        if (body._lwModalChart && _dtModalIndicators.length) {
            _dtModalIndicators.forEach(function(ind) {
                ind.series = _dtCreateIndSeries(body._lwModalChart, ind);
            });
            _dtRefreshIndList();
        }
    }, 40);
}

function _openDtChartModal(idx) {
    idx = parseInt(idx);
    var stored = _dtChartData[idx];
    if (!stored) return;
    document.getElementById('dtChartModalTitle').textContent = (stored.day.symbol || '') + (stored.day.strategy ? '  ·  ' + stored.day.strategy : '');
    var _modalDateLabel = stored.day.date;
    if (stored.exitDate && stored.exitDate !== stored.day.date) _modalDateLabel = stored.day.date + ' → ' + stored.exitDate;
    document.getElementById('dtChartModalDate').textContent = _modalDateLabel + (stored.entryTime ? '  ·  Entry: ' + stored.entryTime : '') + (stored.exitTime ? '  ·  Exit: ' + stored.exitTime : '');

    // Build computation-ready bar list:
    // seed_bars (prev day, for warmup) + current-day bars — both used for SMA/EMA computation.
    // The indicator series is then filtered to only show values for current-day timestamps.
    var seedDate = stored.day.seed_date || null;
    var seedBars = (stored.day.seed_bars || []).filter(function(b){ return b[1] > 0; }).map(function(b) {
        return { timestamp: _toTs(seedDate || stored.day.date, b[0]) * 1000, open: b[1], high: b[2], low: b[3], close: b[4], volume: b[5] || 0 };
    });
    var dayBars;
    if (stored.multi_day_bars) {
        dayBars = [];
        var _mdModalDates = Object.keys(stored.multi_day_bars).sort();
        _mdModalDates.forEach(function(dateStr) {
            (stored.multi_day_bars[dateStr] || []).filter(function(b){ return b[1] > 0; }).forEach(function(b) {
                dayBars.push({ timestamp: _toTs(dateStr, b[0]) * 1000, open: b[1], high: b[2], low: b[3], close: b[4], volume: b[5] || 0 });
            });
        });
    } else {
        dayBars = (stored.bars || []).filter(function(b){ return b[1] > 0; }).map(function(b) {
            return { timestamp: _toTs(stored.day.date, b[0]) * 1000, open: b[1], high: b[2], low: b[3], close: b[4], volume: b[5] || 0 };
        });
    }
    // Store raw 1-min bars as source of truth for TF switching
    _dtRawAllBars  = seedBars.concat(dayBars);
    _dtRawDayBars  = dayBars;
    _dtCurrentStored = stored;

    // Reset TF to 1min on every new modal open
    _dtCurrentTf = 1;
    document.querySelectorAll('.dt-tf-btn').forEach(function(btn) {
        var active = parseInt(btn.dataset.tf) === 1;
        btn.style.background  = active ? '#3b7cff' : '#fff';
        btn.style.color       = active ? '#fff'    : '#475569';
        btn.style.borderColor = active ? '#3b7cff' : '#d1d4dc';
        btn.style.fontWeight  = active ? '600'     : '500';
    });

    // At tf=1 aggregation is a no-op; set state vars normally
    _dtModalBars     = _dtRawAllBars.slice();
    _dtModalDayBars  = _dtRawDayBars.slice();
    _dtModalCutoffTs = dayBars.length > 0 ? Math.floor(dayBars[0].timestamp / 1000) : 0;

    var modal = document.getElementById('dtChartModal');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    var body = document.getElementById('dtChartModalBody');

    // Destroy any previous chart and sub-panels (but keep indicator configs to re-apply)
    _dtDestroyBodyCharts();

    setTimeout(function() {
        var priceDiv = document.createElement('div');
        priceDiv.id = 'dtPriceDiv';
        priceDiv.style.cssText = 'flex:1;min-height:0;width:100%;';
        body.appendChild(priceDiv);
        body._lwModalChart = _buildLwChart(priceDiv, stored, true, _dtModalDayBars, 1);
        // Re-apply any persisted indicators to the new chart instance
        if (body._lwModalChart && _dtModalIndicators.length) {
            _dtModalIndicators.forEach(function(ind) {
                ind.series = _dtCreateIndSeries(body._lwModalChart, ind);
            });
            _dtRefreshIndList();
        }
    }, 40);
}

function _closeDtChartModal() {
    document.getElementById('dtChartModal').style.display = 'none';
    document.body.style.overflow = '';
    _dtDestroyBodyCharts();
}

// ─── Indicator type change ───────────────────────────────────────────────────
function _dtOnIndTypeChange() {
    var type = document.getElementById('dtIndType').value;
    var periodWrap = document.getElementById('dtIndPeriodWrap');
    var colorWrap  = document.getElementById('dtIndColorWrap');
    var widthWrap  = document.getElementById('dtIndWidthWrap');
    // MACD has fixed params (12,26,9) — hide period; RSI defaults to 14
    if (periodWrap) periodWrap.style.display = (type === 'macd') ? 'none' : 'flex';
    if (type === 'rsi' && document.getElementById('dtIndPeriod')) {
        document.getElementById('dtIndPeriod').value = 14;
    }
}

// ─── Computation helpers ─────────────────────────────────────────────────────
// Standard formulas — seed_bars from the previous day warm up the calculation
// so the first current-day bar already has a fully valid indicator value.
function _dtComputeSMA(bars, period) {
    var result = [];
    for (var i = 0; i < bars.length; i++) {
        if (i < period - 1) continue;
        var sum = 0;
        for (var j = i - period + 1; j <= i; j++) sum += bars[j].close;
        result.push({ time: Math.floor(bars[i].timestamp / 1000), value: sum / period });
    }
    return result;
}

function _dtComputeEMA(bars, period) {
    var result = [];
    if (bars.length < period) return result;
    var sum = 0;
    for (var i = 0; i < period; i++) sum += bars[i].close;
    var ema = sum / period;
    result.push({ time: Math.floor(bars[period - 1].timestamp / 1000), value: ema });
    var k = 2 / (period + 1);
    for (var i = period; i < bars.length; i++) {
        ema = bars[i].close * k + ema * (1 - k);
        result.push({ time: Math.floor(bars[i].timestamp / 1000), value: ema });
    }
    return result;
}

// Rolling N-period VWAP — volume-weighted average over the trailing `period`
// bars, including previous-day seed bars when needed for warmup.  Falls back
// to typical price when volume is zero (rare, prevents invisible lines).
function _dtComputeVWAP(bars, period) {
    var result = [];
    if (!period || period < 1) period = 20;
    for (var i = 0; i < bars.length; i++) {
        if (i < period - 1) continue;
        var sumTPV = 0, sumVol = 0, fallbackTP = 0;
        for (var j = i - period + 1; j <= i; j++) {
            var tp  = (bars[j].high + bars[j].low + bars[j].close) / 3;
            var vol = bars[j].volume || 0;
            sumTPV += tp * vol;
            sumVol += vol;
            fallbackTP += tp;
        }
        var value = sumVol > 0 ? sumTPV / sumVol : fallbackTP / period;
        result.push({ time: Math.floor(bars[i].timestamp / 1000), value: value });
    }
    return result;
}

// ─── RSI computation (Wilder's smoothing) ────────────────────────────────────
function _dtComputeRSI(bars, period) {
    period = period || 14;
    if (bars.length < period + 1) return [];
    var result = [], avgGain = 0, avgLoss = 0;
    for (var i = 1; i <= period; i++) {
        var ch = bars[i].close - bars[i-1].close;
        if (ch > 0) avgGain += ch; else avgLoss -= ch;
    }
    avgGain /= period; avgLoss /= period;
    var rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push({ time: Math.floor(bars[period].timestamp / 1000), value: 100 - 100 / (1 + rs) });
    for (var i = period + 1; i < bars.length; i++) {
        var ch = bars[i].close - bars[i-1].close;
        avgGain = (avgGain * (period - 1) + (ch > 0 ? ch : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (ch < 0 ? -ch : 0)) / period;
        rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        result.push({ time: Math.floor(bars[i].timestamp / 1000), value: 100 - 100 / (1 + rs) });
    }
    return result;
}

// ─── MACD computation (12, 26, 9) ───────────────────────────────────────────
function _dtComputeMACD(bars) {
    var fast = 12, slow = 26, sig = 9;
    var emaFastAll = _dtComputeEMA(bars, fast);
    var emaSlowAll = _dtComputeEMA(bars, slow);
    var fastMap = {};
    emaFastAll.forEach(function(d){ fastMap[d.time] = d.value; });
    var macdLine = [];
    emaSlowAll.forEach(function(d){
        if (fastMap[d.time] !== undefined)
            macdLine.push({ time: d.time, value: fastMap[d.time] - d.value });
    });
    if (macdLine.length < sig) return null;
    var sigLine = [], ema = 0, k = 2 / (sig + 1);
    for (var i = 0; i < sig; i++) ema += macdLine[i].value;
    ema /= sig;
    sigLine.push({ time: macdLine[sig - 1].time, value: ema });
    for (var i = sig; i < macdLine.length; i++) {
        ema = macdLine[i].value * k + ema * (1 - k);
        sigLine.push({ time: macdLine[i].time, value: ema });
    }
    var sigMap = {};
    sigLine.forEach(function(d){ sigMap[d.time] = d.value; });
    var hist = [];
    macdLine.forEach(function(d){
        if (sigMap[d.time] !== undefined) {
            var h = d.value - sigMap[d.time];
            hist.push({ time: d.time, value: h, color: h >= 0 ? '#26a69a' : '#ef5350' });
        }
    });
    return { macd: macdLine, signal: sigLine, hist: hist };
}

// ─── Build a sub-panel chart div below the price chart ───────────────────────
function _dtCreateSubPanel(ind, labelText) {
    var body = document.getElementById('dtChartModalBody');
    var subDiv = document.createElement('div');
    subDiv.id = 'dtSubPanel_' + ind.id;
    subDiv.style.cssText = 'width:100%;height:150px;flex-shrink:0;border-top:2px solid #e2e8f0;position:relative;background:#fafbff;';
    // Floating label
    var lbl = document.createElement('div');
    lbl.style.cssText = 'position:absolute;top:5px;left:10px;font-size:10px;font-weight:700;color:' + ind.color + ';z-index:2;pointer-events:none;opacity:0.9;';
    lbl.textContent = labelText;
    subDiv.appendChild(lbl);
    body.appendChild(subDiv);

    var subChart = LightweightCharts.createChart(subDiv, {
        layout: { background: { color: '#fafbff' }, textColor: '#64748b', fontSize: 10 },
        grid: { vertLines: { color: '#f1f5f9' }, horzLines: { color: '#f1f5f9' } },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        timeScale: { timeVisible: true, secondsVisible: false, borderColor: '#e2e8f0',
            tickMarkFormatter: function(t) {
                var d = new Date(t * 1000);
                return d.getUTCHours().toString().padStart(2,'0') + ':' + d.getUTCMinutes().toString().padStart(2,'0');
            }
        },
        rightPriceScale: { borderColor: '#e2e8f0', autoScale: true, minimumWidth: 55 },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
        handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
        width: subDiv.clientWidth || 600,
        height: 150
    });

    // Sync timescales with main price chart (bidirectional)
    var mainBody = document.getElementById('dtChartModalBody');
    if (mainBody && mainBody._lwModalChart) {
        var _syncing = false;
        subChart.timeScale().subscribeVisibleLogicalRangeChange(function(range) {
            if (_syncing || !range || !mainBody._lwModalChart) return;
            _syncing = true;
            try { mainBody._lwModalChart.timeScale().setVisibleLogicalRange(range); } catch(e){}
            _syncing = false;
        });
        mainBody._lwModalChart.timeScale().subscribeVisibleLogicalRangeChange(function(range) {
            if (_syncing || !range || !subChart) return;
            _syncing = true;
            try { subChart.timeScale().setVisibleLogicalRange(range); } catch(e){}
            _syncing = false;
        });
    }

    var ro = new ResizeObserver(function() {
        if (subDiv.clientWidth > 0 && subDiv.clientHeight > 0)
            subChart.applyOptions({ width: subDiv.clientWidth, height: subDiv.clientHeight });
    });
    ro.observe(subDiv);
    ind.subRo = ro;
    return { subDiv: subDiv, subChart: subChart };
}

function _dtDedup(arr) {
    var seen = new Set(), out = [];
    arr.forEach(function(d){ if (!seen.has(d.time)){ seen.add(d.time); out.push(d); } });
    return out;
}

// ─── Create a line series and set indicator data ─────────────────────────────
function _dtCreateIndSeries(chart, ind) {
    var cutoff = _dtModalCutoffTs;
    var filterFn = function(d){ return !cutoff || d.time >= cutoff; };

    // ── RSI sub-panel ────────────────────────────────────────────────────────
    if (ind.type === 'rsi') {
        var rsiData = _dtDedup(_dtComputeRSI(_dtModalBars, ind.period).filter(filterFn));
        var sub = _dtCreateSubPanel(ind, 'RSI (' + ind.period + ')');
        ind.subDiv = sub.subDiv; ind.subChart = sub.subChart; ind.isSubPanel = true;

        var series = sub.subChart.addLineSeries({
            color: ind.color, lineWidth: ind.lineWidth,
            priceLineVisible: false, lastValueVisible: true,
            autoscaleInfoProvider: function() {
                return { priceRange: { minValue: 0, maxValue: 100 } };
            }
        });
        series.setData(rsiData);
        series.createPriceLine({ price: 70, color: 'rgba(38,166,154,0.6)', lineWidth: 1, lineStyle: 1, axisLabelVisible: true, title: '70' });
        series.createPriceLine({ price: 30, color: 'rgba(239,83,80,0.6)', lineWidth: 1, lineStyle: 1, axisLabelVisible: true, title: '30' });
        return series;
    }

    // ── MACD sub-panel ───────────────────────────────────────────────────────
    if (ind.type === 'macd') {
        var macdData = _dtComputeMACD(_dtModalBars);
        if (!macdData) return null;
        var macdClean = _dtDedup(macdData.macd.filter(filterFn));
        var sigClean  = _dtDedup(macdData.signal.filter(filterFn));
        var histClean = _dtDedup(macdData.hist.filter(filterFn));

        var sub = _dtCreateSubPanel(ind, 'MACD (12, 26, 9)');
        ind.subDiv = sub.subDiv; ind.subChart = sub.subChart; ind.isSubPanel = true;

        var histSeries = sub.subChart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
        histSeries.setData(histClean);

        var macdSeries = sub.subChart.addLineSeries({ color: ind.color || '#2962ff', lineWidth: 1, priceLineVisible: false, lastValueVisible: true });
        macdSeries.setData(macdClean);

        var sigSeries = sub.subChart.addLineSeries({ color: '#ff6d00', lineWidth: 1, lineStyle: 1, priceLineVisible: false, lastValueVisible: true });
        sigSeries.setData(sigClean);

        ind.extraSeries = [histSeries, sigSeries];
        return macdSeries;
    }

    // ── Overlay indicators (SMA / EMA / VWAP) ───────────────────────────────
    var data = [];
    if (ind.type === 'sma')       data = _dtComputeSMA(_dtModalBars, ind.period);
    else if (ind.type === 'ema')  data = _dtComputeEMA(_dtModalBars, ind.period);
    else if (ind.type === 'vwap') data = _dtComputeVWAP(_dtModalBars, ind.period);

    var clean = _dtDedup(data.filter(filterFn));
    var series = chart.addLineSeries({
        color: ind.color, lineWidth: ind.lineWidth,
        priceLineVisible: false, lastValueVisible: true,
        crosshairMarkerVisible: false, title: ind.label
    });
    series.setData(clean);
    return series;
}

// ─── Add indicator ───────────────────────────────────────────────────────────
function _dtAddIndicator() {
    var body = document.getElementById('dtChartModalBody');
    if (!body._lwModalChart) return;

    var type      = document.getElementById('dtIndType').value;
    var period    = parseInt(document.getElementById('dtIndPeriod').value) || 20;
    var color     = document.getElementById('dtIndColor').value || '#2962ff';
    var lineWidth = parseInt(document.getElementById('dtIndWidth').value) || 2;

    // Sub-panel types use fixed params; overlay types need period validation
    if (type !== 'macd' && (period < 2 || period > 500)) {
        alert('Period must be between 2 and 500.'); return;
    }
    if (_dtModalDayBars.length === 0) {
        alert('No bar data available for this trade. Run a new backtest to generate chart data.'); return;
    }

    var id = _dtModalIndNextId++;
    var label = type === 'macd' ? 'MACD(12,26,9)'
              : type === 'rsi'  ? 'RSI(' + period + ')'
              : type.toUpperCase() + '(' + period + ')';
    var ind = { id: id, type: type, period: period, color: color, lineWidth: lineWidth, label: label,
                series: null, isSubPanel: false, subChart: null, subDiv: null, subRo: null, extraSeries: null };

    ind.series = _dtCreateIndSeries(body._lwModalChart, ind);
    _dtModalIndicators.push(ind);
    _dtRefreshIndList();
}

// ─── Remove single indicator ─────────────────────────────────────────────────
function _dtRemoveIndicator(id) {
    var body = document.getElementById('dtChartModalBody');
    var idx  = _dtModalIndicators.findIndex(function(i){ return i.id === id; });
    if (idx === -1) return;
    var ind  = _dtModalIndicators[idx];

    if (ind.isSubPanel) {
        if (ind.subRo)   { try { ind.subRo.disconnect();  } catch(e){} }
        if (ind.subChart){ try { ind.subChart.remove();   } catch(e){} }
        if (ind.subDiv && ind.subDiv.parentNode) ind.subDiv.parentNode.removeChild(ind.subDiv);
    } else {
        if (ind.series && body._lwModalChart) {
            try { body._lwModalChart.removeSeries(ind.series); } catch(e){}
        }
    }
    _dtModalIndicators.splice(idx, 1);
    _dtRefreshIndList();
}

// ─── Clear all indicators ────────────────────────────────────────────────────
function _dtClearIndicators() {
    var body = document.getElementById('dtChartModalBody');
    _dtModalIndicators.forEach(function(ind) {
        if (ind.isSubPanel) {
            if (ind.subRo)   { try { ind.subRo.disconnect();  } catch(e){} }
            if (ind.subChart){ try { ind.subChart.remove();   } catch(e){} }
            if (ind.subDiv && ind.subDiv.parentNode) ind.subDiv.parentNode.removeChild(ind.subDiv);
        } else {
            if (ind.series && body._lwModalChart) {
                try { body._lwModalChart.removeSeries(ind.series); } catch(e){}
            }
        }
    });
    _dtModalIndicators = [];
    _dtRefreshIndList();
}

// ─── Refresh active indicator chips ─────────────────────────────────────────
function _dtRefreshIndList() {
    var list    = document.getElementById('dtActiveIndsList');
    var clearBtn = document.getElementById('dtClearIndsBtn');
    if (!list) return;
    list.innerHTML = '';
    _dtModalIndicators.forEach(function(ind) {
        var chip = document.createElement('span');
        chip.style.cssText = 'display:inline-flex;align-items:center;gap:5px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600;color:#1e2330;';
        chip.innerHTML = '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + ind.color + ';flex-shrink:0;"></span>'
                       + ind.label
                       + '<button onclick="_dtRemoveIndicator(' + ind.id + ')" style="background:none;border:none;cursor:pointer;padding:0;margin-left:2px;color:#94a3b8;font-size:13px;line-height:1;" title="Remove">&times;</button>';
        list.appendChild(chip);
    });
    if (clearBtn) clearBtn.style.display = _dtModalIndicators.length > 1 ? 'block' : 'none';
}

function _fmtExitReason(r) {
    if (!r) return 'N/A';
    var map = { 'TAKE_PROFIT': 'Take Profit', 'STOP_LOSS': 'Stop Loss', 'EXPIRATION': 'Expiration', 'EOD': 'End of Day', 'take_profit': 'Take Profit', 'stop_loss': 'Stop Loss', 'max_days': 'Max Days', 'end_of_backtest': 'End of Backtest' };
    return map[r] || r.replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
}

function useOptTemplate() {
    if (_optDetailState.config && Object.keys(_optDetailState.config).length > 0) {
        sessionStorage.setItem('optionsBacktestUseTemplate', JSON.stringify(_optDetailState.config));
        if (typeof navigateToPage === 'function') navigateToPage('backtester');
    }
}

function initStockResultDetailPage() {
    var id = window._pendingStkDetailId || new URLSearchParams(window.location.search).get('id');
    if (!id) return;
    window._pendingStkDetailId = null;
    _stkDetailState.id = id;
    _stkDetailState.trades = [];
    _stkDetailState.page = 1;
    _stkDetailState.dtDays = [];
    _stkDetailState.dtPage = 1;
    if (_stkDetailState.chart) { _stkDetailState.chart.destroy(); _stkDetailState.chart = null; }

    document.getElementById('stkDetailLoading').style.display = '';
    document.getElementById('stkDetailContent').style.display = 'none';
    document.getElementById('stkDetailError').style.display = 'none';
    document.getElementById('stkDetailDecisionTreeCard').style.display = 'none';

    document.getElementById('stkDetailPrevBtn').onclick = function() { if (_stkDetailState.page > 1) { _stkDetailState.page--; _renderStkTradesPage(); } };
    document.getElementById('stkDetailNextBtn').onclick = function() {
        var tp = Math.ceil(_stkDetailState.trades.length / _stkDetailState.perPage);
        if (_stkDetailState.page < tp) { _stkDetailState.page++; _renderStkTradesPage(); }
    };

    _loadStkResults(id);
}

async function _loadStkResults(id) {
    try {
        var statusResp = await authFetch('/api/stocks-backtest-v3/status/' + id);
        var statusData = await statusResp.json();

        if (statusData.status === 'running') {
            document.getElementById('stkDetailLoadingMsg').textContent = 'Running backtest...';
            setTimeout(function() { _loadStkResults(id); }, 2000);
            return;
        }
        if (statusData.status === 'error') { _showStkError(statusData.error || 'Backtest failed'); return; }

        var resp = await authFetch('/api/stocks-backtest-v3/results/' + id);
        if (!resp.ok) { var err = await resp.json(); throw new Error(err.error || 'Failed to load results'); }
        var data = await resp.json();

        if (data.status === 'running') {
            document.getElementById('stkDetailLoadingMsg').textContent = 'Running backtest...';
            setTimeout(function() { _loadStkResults(id); }, 2000);
            return;
        }

        _stkDetailState.data = data;
        _stkDetailState.config = data.config || {};
        _displayStkDetail(data);

        // Decision log may not be in the results payload — fetch separately if missing
        if (!data.decision_log || data.decision_log.length === 0) {
            try {
                var dlResp = await authFetch('/api/files/decision-log/' + id);
                if (dlResp.ok) {
                    var decisionLog = await dlResp.json();
                    if (Array.isArray(decisionLog) && decisionLog.length > 0) {
                        _buildStkDetailDecisionTree(decisionLog, data.config || {});
                    }
                }
            } catch(dlErr) { console.warn('Could not load decision log:', dlErr); }
        }

    } catch(e) {
        _showStkError(e.message);
    }
}

function _showStkError(msg) {
    document.getElementById('stkDetailLoading').style.display = 'none';
    document.getElementById('stkDetailError').style.display = '';
    document.getElementById('stkDetailErrorMsg').textContent = msg;
}

function _displayStkDetail(data) {
    document.getElementById('stkDetailLoading').style.display = 'none';
    document.getElementById('stkDetailContent').style.display = '';

    var config = data.config || {};
    var stats = data.stats || {};
    var trades = data.trades || [];

    var name = config.name || 'Stock Backtest';
    document.getElementById('stkDetailTitle').textContent = name + ' Analysis';
    document.getElementById('stkDetailBreadcrumb').textContent = name;
    document.getElementById('stkDetailStrategy').textContent = name;

    var symbolText = config.symbol_mode === 'single' ? (config.symbol || (config.symbols && config.symbols[0]) || '--') : (config.symbols ? config.symbols.length + ' symbols' : '--');
    document.getElementById('stkDetailSymbol').textContent = symbolText;
    document.getElementById('stkDetailTotalTrades').textContent = stats.total_trades || 0;

    var pnl = stats.total_pnl || 0;
    var pnlEl = document.getElementById('stkDetailNetPnl');
    pnlEl.textContent = _btFmt(pnl);
    pnlEl.style.color = pnl >= 0 ? '#089981' : '#f23645';
    var pnlIcon = document.getElementById('stkDetailPnlIcon');
    if (pnlIcon) pnlIcon.className = 'icon-big text-center bubble-shadow-small ' + (pnl >= 0 ? 'icon-success' : 'icon-danger');

    var statsHtml = '';
    statsHtml += _btStatRow('Win Rate', (stats.win_rate || 0).toFixed(1) + '%', (stats.win_rate || 0) >= 50 ? 'positive' : null);
    statsHtml += _btStatRow('Return %', (stats.total_return || 0).toFixed(2) + '%', (stats.total_return || 0) > 0 ? 'positive' : (stats.total_return || 0) < 0 ? 'negative' : null);
    statsHtml += _btStatRow('Profit Factor', (stats.profit_factor || 0).toFixed(2), (stats.profit_factor || 0) > 1 ? 'positive' : 'negative');
    statsHtml += _btStatRow('Max Drawdown', (stats.max_drawdown || 0).toFixed(2) + '%', (stats.max_drawdown || 0) < 0 ? 'negative' : null);
    statsHtml += _btStatRow('Avg Win', _btFmt(stats.avg_win || 0), (stats.avg_win || 0) > 0 ? 'positive' : null);
    statsHtml += _btStatRow('Avg Loss', _btFmt(stats.avg_loss || 0), (stats.avg_loss || 0) < 0 ? 'negative' : null);
    document.getElementById('stkDetailStatsBody').innerHTML = statsHtml;

    _renderStkConfig(config, data.metadata || {});

    if (config && Object.keys(config).length > 0) {
        document.getElementById('stkDetailUseTemplate').style.display = '';
    }

    var labels = ['Start'], values = [0], runningTotal = 0;
    trades.forEach(function(t, idx) {
        runningTotal += (t.pnl || 0);
        labels.push(t.exit_date || t.exit_timestamp || 'Trade ' + (idx + 1));
        values.push(runningTotal);
    });

    if (_stkDetailState.chart) _stkDetailState.chart.destroy();
    _stkDetailState.chart = _btBuildEquityCurve('stkDetailEquityChart', 'stkDetailEquitySummary', labels, values);

    _stkDetailState.trades = trades;
    document.getElementById('stkDetailTradeLogHeader').innerHTML = '<th>#</th><th>Symbol</th><th>Entry Date</th><th>Entry Price</th><th>Exit Date</th><th>Exit Price</th><th>Shares</th><th>P&L</th><th>P&L %</th><th>Exit Reason</th>';
    _stkDetailState.page = 1;
    _renderStkTradesPage();

    document.getElementById('stkDetailDownloadCsv').onclick = function() {
        if (typeof TierRestrictions !== 'undefined' && !TierRestrictions.canDownloadCsv()) {
            return TierRestrictions.showUpgradeMessage('CSV download requires a Standard or Premium plan.');
        }
        if (!_stkDetailState.data || !_stkDetailState.data.csv_data) { if (typeof appAlert === 'function') appAlert('No CSV data available'); return; }
        var blob = new Blob([_stkDetailState.data.csv_data], { type: 'text/csv' });
        var url = window.URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'stock_backtest_' + _stkDetailState.id + '_trades.csv';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    };

    if (data.decision_log && data.decision_log.length > 0) {
        _buildStkDetailDecisionTree(data.decision_log, config);
    }

    if (typeof TierRestrictions !== 'undefined') TierRestrictions.disableCsvButtons();
}

function _renderStkConfig(config, metadata) {
    var items = [];
    if (config.symbol_mode === 'single') {
        items.push({l: 'Symbol', v: config.symbol || (config.symbols && config.symbols[0]) || 'N/A'});
    } else {
        items.push({l: 'Symbols', v: (metadata.symbol_count || (config.symbols && config.symbols.length) || 'Multiple') + ''});
    }
    items.push({l: 'Date Range', v: (config.start_date || 'N/A') + ' to ' + (config.end_date || 'N/A')});
    items.push({l: 'Direction', v: config.direction === 'long' ? 'Long' : 'Short'});

    if (config.entry_type === 'preset') {
        var presetNames = {'1': 'Gap Up %', '2': 'Gap Down %', '3': 'Change %', '4': 'Volume Spike', '5': 'Velocity'};
        items.push({l: 'Entry', v: presetNames[config.preset_condition] || 'Custom'});
    } else {
        items.push({l: 'Entry', v: 'Custom (' + ((config.custom_conditions && config.custom_conditions.length) || 0) + ')'});
    }

    if (config.sizing_type === 'shares') items.push({l: 'Size', v: (config.sizing_value || config.sizing_shares || 'N/A') + ' shares'});
    else if (config.sizing_type === 'dollars') items.push({l: 'Size', v: '$' + (config.sizing_value || config.sizing_dollars || 'N/A')});
    else items.push({l: 'Size', v: (config.sizing_value || config.sizing_percent || 'N/A') + '%'});

    if (config.starting_capital) items.push({l: 'Capital', v: '$' + config.starting_capital.toLocaleString()});
    items.push({l: 'Take Profit', v: config.take_profit_type === 'percent' ? config.take_profit_value + '%' : '$' + config.take_profit_value});
    items.push({l: 'Stop Loss', v: config.stop_loss_type === 'percent' ? config.stop_loss_value + '%' : '$' + config.stop_loss_value});
    items.push({l: 'Max Days', v: config.max_days || 'N/A'});

    document.getElementById('stkDetailConfigList').innerHTML = items.map(function(i) { return _btConfigCard(i.l, i.v); }).join('');
}

function _renderStkTradesPage() {
    var trades = _stkDetailState.trades;
    var page = _stkDetailState.page;
    var pp = _stkDetailState.perPage;
    var total = trades.length;
    var totalPages = Math.ceil(total / pp);
    var start = (page - 1) * pp;
    var end = Math.min(start + pp, total);

    document.getElementById('stkDetailTradeLogInfo').textContent = total > 0 ? 'Showing ' + (start + 1) + '-' + end + ' of ' + total + ' trades' : 'No trades';
    document.getElementById('stkDetailPrevBtn').disabled = page <= 1;
    document.getElementById('stkDetailNextBtn').disabled = page >= totalPages;

    var tbody = document.getElementById('stkDetailTradeLogBody');
    tbody.innerHTML = '';
    for (var i = start; i < end; i++) {
        var t = trades[i];
        var pnl = t.pnl || 0;
        var pnlPct = t.pnl_pct || 0;
        var cls = pnl >= 0 ? 'text-success' : 'text-danger';
        var row = document.createElement('tr');
        row.innerHTML = '<td>' + (i + 1) + '</td><td><strong>' + (t.symbol || 'N/A') + '</strong></td><td>' + (t.entry_date || t.entry_timestamp || 'N/A') + '</td><td>$' + (t.entry_price || 0).toFixed(2) + '</td><td>' + (t.exit_date || t.exit_timestamp || 'N/A') + '</td><td>$' + (t.exit_price || 0).toFixed(2) + '</td><td>' + (t.shares || 0) + '</td><td class="' + cls + '">$' + pnl.toFixed(2) + '</td><td class="' + cls + '">' + pnlPct.toFixed(2) + '%</td><td>' + (t.exit_reason || 'N/A') + '</td>';
        tbody.appendChild(row);
    }
}

function useStkTemplate() {
    if (_stkDetailState.config && Object.keys(_stkDetailState.config).length > 0) {
        sessionStorage.setItem('stockBacktestUseTemplate', JSON.stringify(_stkDetailState.config));
        if (typeof navigateToPage === 'function') navigateToPage('stockBacktester');
    }
}

function _buildStkDetailDecisionTree(log, config) {
    if (!log || log.length === 0) return;
    _stkDetailState.dtDays = log;
    _stkDetailState.dtPage = 1;
    document.getElementById('stkDetailDecisionTreeCard').style.display = '';
    document.getElementById('stkDetailDtPrevBtn').onclick = function() { if (_stkDetailState.dtPage > 1) { _stkDetailState.dtPage--; _renderStkDtPage(config); } };
    document.getElementById('stkDetailDtNextBtn').onclick = function() {
        if (_stkDetailState.dtPage < Math.ceil(_stkDetailState.dtDays.length / 10)) { _stkDetailState.dtPage++; _renderStkDtPage(config); }
    };
    _renderStkDtPage(config);
}

function _renderStkDtPage(config) {
    var days = _stkDetailState.dtDays;
    var page = _stkDetailState.dtPage;
    var pp = 10;
    var total = days.length;
    var totalPages = Math.ceil(total / pp);
    var start = (page - 1) * pp;
    var end = Math.min(start + pp, total);

    document.getElementById('stkDetailDtInfo').textContent = total > 0 ? 'Showing ' + (start + 1) + '-' + end + ' of ' + total + ' trading days' : '';
    document.getElementById('stkDetailDtPrevBtn').disabled = page <= 1;
    document.getElementById('stkDetailDtNextBtn').disabled = page >= totalPages;

    var dir = config && config.direction ? config.direction.charAt(0).toUpperCase() + config.direction.slice(1) : 'Long';
    var html = '';

    for (var i = start; i < end; i++) {
        var day = days[i];
        var status = day.status || 'SKIPPED';
        var badgeColor = '#94a3b8', badgeText = 'Skipped', headerBg = '#f8fafc';
        if (status === 'ENTRY') { badgeColor = '#10b981'; badgeText = 'Entry'; headerBg = '#f0fdf4'; }
        else if (status === 'EXIT') { badgeColor = '#f59e0b'; badgeText = 'Exit'; headerBg = '#fffbeb'; }
        else if (status === 'EXIT_AND_ENTRY') { badgeColor = '#3b7cff'; badgeText = 'Exit + Re-Entry'; headerBg = '#eff6ff'; }
        else if (status === 'HOLDING') { badgeColor = '#8b5cf6'; badgeText = 'Holding'; headerBg = '#f5f3ff'; }

        var exitEvents = (day.events || []).filter(function(e) { return e.type === 'exit'; });
        var dayPnl = exitEvents.reduce(function(s, e) { return s + (e.pnl || 0); }, 0);

        var flowHtml = '';
        if (day.prev_close != null) {
            flowHtml += '<div style="padding:6px 10px;background:#f1f5f9;border-radius:6px;margin-bottom:6px;font-size:12px;"><i class="fas fa-chart-line" style="color:#64748b;margin-right:6px;"></i><strong>Previous Close:</strong> $' + day.prev_close.toFixed(2) + '</div>';
        }
        if (day.condition) {
            flowHtml += '<div style="padding:6px 10px;background:#f1f5f9;border-radius:6px;margin-bottom:6px;font-size:12px;"><i class="fas fa-filter" style="color:#64748b;margin-right:6px;"></i><strong>Condition:</strong> ' + day.condition + '</div>';
        }

        flowHtml += '<div style="border-left:2px solid #e2e8f0;margin-left:16px;padding-left:12px;">';
        (day.events || []).forEach(function(evt) {
            if (evt.type === 'no_signal') {
                var noSigExtra = '';
                if (evt.entry_metrics) {
                    var em = evt.entry_metrics;
                    var thrStr = '';
                    if (em.threshold && em.threshold !== 0) {
                        var sign1 = (em.operator === '<' || em.operator === '<=') ? '\u2212' : '+';
                        var unit1 = em.threshold_unit === 'points' ? 'pts' : '%';
                        thrStr = ' (' + sign1 + em.threshold + unit1 + ' \u2192 $' + (em.effective_right != null ? em.effective_right.toFixed(2) : '?') + ')';
                    }
                    noSigExtra += ' &mdash; <strong>' + (em.right_label || 'Ref') + ':</strong> ' + (em.right_value != null ? '$' + em.right_value.toFixed(2) : 'N/A') + thrStr;
                }
                if (evt.day_high != null) noSigExtra += ' | <strong>Day high:</strong> $' + evt.day_high.toFixed(2);
                if (evt.day_low  != null) noSigExtra += ' | <strong>Day low:</strong> $'  + evt.day_low.toFixed(2);
                flowHtml += '<div style="padding:6px 10px;background:#f8fafc;border-radius:6px;margin-bottom:4px;border-left:3px solid #94a3b8;font-size:12px;color:#64748b;">NO TRADE: ' + (evt.reason || 'Condition not met') + noSigExtra + '</div>';
            } else if (evt.type === 'condition_met') {
                var cmExtra = '';
                if (evt.entry_metrics) {
                    var em = evt.entry_metrics;
                    var thrStr = '';
                    if (em.threshold && em.threshold !== 0) {
                        var sign2 = (em.operator === '<' || em.operator === '<=') ? '\u2212' : '+';
                        var unit2 = em.threshold_unit === 'points' ? 'pts' : '%';
                        thrStr = ' (' + sign2 + em.threshold + unit2 + ' \u2192 $' + (em.effective_right != null ? em.effective_right.toFixed(2) : '?') + ')';
                    }
                    cmExtra += ' &mdash; <strong>' + (em.right_label || 'Ref') + ':</strong> ' + (em.right_value != null ? '$' + em.right_value.toFixed(2) : 'N/A') + thrStr;
                }
                var cmTime = evt.time ? ' at ' + evt.time.substring(11, 16) : '';
                flowHtml += '<div style="padding:6px 10px;background:#ecfdf5;border-radius:6px;margin-bottom:4px;border-left:3px solid #10b981;font-size:12px;color:#065f46;">CONDITION MET' + cmTime + ' — $' + (evt.price != null ? evt.price.toFixed(2) : 'N/A') + (evt.computed_value != null ? ' (' + evt.computed_value + '%)' : '') + cmExtra + '</div>';
            } else if (evt.type === 'entry' || evt.type === 're_entry') {
                flowHtml += '<div style="padding:6px 10px;background:#f0fdf4;border-radius:6px;margin-bottom:4px;border-left:3px solid #10b981;font-size:12px;"><strong>' + (evt.type === 're_entry' ? 'RE-ENTRY' : 'ENTRY') + '</strong> Trade #' + (evt.trade_num || '?') + ' | ' + dir + ' ' + (evt.shares || '') + ' shares @ $' + (evt.price != null ? evt.price.toFixed(2) : 'N/A') + '</div>';
            } else if (evt.type === 'holding') {
                flowHtml += '<div style="padding:6px 10px;background:#f5f3ff;border-radius:6px;margin-bottom:4px;border-left:3px solid #8b5cf6;font-size:12px;color:#5b21b6;">HOLDING Trade #' + (evt.trade_num || '?') + ' | Day ' + (evt.days_held || '?') + ' | Entry: $' + (evt.entry_price != null ? evt.entry_price.toFixed(2) : 'N/A') + '</div>';
            } else if (evt.type === 'exit') {
                var ep = evt.pnl || 0;
                var epc = ep >= 0 ? '#10b981' : '#ef4444';
                flowHtml += '<div style="padding:6px 10px;background:' + (ep >= 0 ? '#f0fdf4' : '#fef2f2') + ';border-radius:6px;margin-bottom:4px;border-left:3px solid ' + epc + ';font-size:12px;"><strong>EXIT</strong> Trade #' + (evt.trade_num || '?') + ' (' + _fmtExitReason(evt.reason) + ') @ $' + (evt.price != null ? evt.price.toFixed(2) : 'N/A') + ' | <span style="color:' + epc + ';font-weight:600;">P&L: $' + ep.toFixed(2) + ' (' + (evt.pnl_pct || 0).toFixed(2) + '%)</span></div>';
            } else if (evt.type === 'skip_consecutive') {
                flowHtml += '<div style="padding:6px 10px;background:#fffbeb;border-radius:6px;margin-bottom:4px;border-left:3px solid #f59e0b;font-size:12px;color:#92400e;">SKIPPED: ' + (evt.reason || 'Consecutive trades disabled') + '</div>';
            }
        });
        flowHtml += '</div>';

        html += '<div style="border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px;overflow:hidden;">' +
            '<div onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'none\'?\'block\':\'none\'" style="padding:10px 14px;background:' + headerBg + ';cursor:pointer;display:flex;justify-content:space-between;align-items:center;">' +
            '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;"><i class="fas fa-calendar-day" style="color:#3b7cff;"></i><span style="font-weight:600;">' + day.date + '</span><span style="background:' + badgeColor + ';color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;">' + badgeText + '</span>' +
            (exitEvents.length > 0 ? '<span style="color:' + (dayPnl >= 0 ? '#10b981' : '#ef4444') + ';font-weight:600;font-size:12px;">P&L: $' + dayPnl.toFixed(2) + '</span>' : '') +
            '</div><i class="fas fa-chevron-down" style="color:#94a3b8;font-size:12px;"></i></div>' +
            '<div style="padding:10px 14px;display:none;">' + flowHtml + '</div></div>';
    }
    document.getElementById('stkDetailDtContent').innerHTML = html;
}
