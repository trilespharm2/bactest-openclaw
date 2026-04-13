var _optDetailState = { id: null, config: null, trades: [], page: 1, perPage: 10, chart: null, dtDays: [], dtPage: 1 };
var _stkDetailState = { id: null, config: null, data: null, trades: [], page: 1, perPage: 10, chart: null, dtDays: [], dtPage: 1 };

function _btFmt(value) {
    if (value === undefined || value === null) return '$0.00';
    var prefix = value < 0 ? '-$' : '$';
    return prefix + Math.abs(value).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function _btPnlClass(val) { return val >= 0 ? 'text-success' : 'text-danger'; }

function _btStatRow(label, value, cls) {
    return '<div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #f0f0f0;">' +
        '<span style="color:#6a6d78; font-size:13px;">' + label + '</span>' +
        '<span style="font-weight:600; font-size:13px;' + (cls ? ' color:' + (cls === 'positive' ? '#089981' : '#f23645') : '') + ';">' + value + '</span></div>';
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
    statsHtml += _btStatRow('Avg Trade', _btFmt((summary.avg_win || 0) + (summary.avg_loss || 0)));
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
    document.getElementById('optDetailDecisionTreeCard').style.display = '';
    document.getElementById('optDetailDtPrevBtn').onclick = function() { if (_optDetailState.dtPage > 1) { _optDetailState.dtPage--; _renderOptDtPage(); } };
    document.getElementById('optDetailDtNextBtn').onclick = function() {
        if (_optDetailState.dtPage < Math.ceil(_optDetailState.dtDays.length / 10)) { _optDetailState.dtPage++; _renderOptDtPage(); }
    };
    _renderOptDtPage();
}

function _renderOptDtPage() {
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
                flowHtml += '<div style="padding:6px 10px;background:#ecfdf5;border-radius:6px;margin-bottom:4px;border-left:3px solid #10b981;font-size:12px;color:#065f46;">CONDITIONS MET - Price $' + (evt.price != null ? evt.price.toFixed(2) : 'N/A') + '</div>';
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

        html += '<div style="border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px;overflow:hidden;">' +
            '<div onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'none\'?\'block\':\'none\'" style="padding:10px 14px;background:' + headerBg + ';cursor:pointer;display:flex;justify-content:space-between;align-items:center;">' +
            '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;"><i class="fas fa-calendar-day" style="color:#3b7cff;"></i><span style="font-weight:600;">' + day.date + '</span><span style="background:' + badgeColor + ';color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;">' + badgeText + '</span>' +
            (exitEvents.length > 0 ? '<span style="color:' + (dayPnl >= 0 ? '#10b981' : '#ef4444') + ';font-weight:600;font-size:12px;">P&L: $' + dayPnl.toFixed(2) + '</span>' : '') +
            '</div><i class="fas fa-chevron-down" style="color:#94a3b8;font-size:12px;"></i></div>' +
            '<div style="padding:10px 14px;display:none;">' + flowHtml + '</div></div>';
    }
    document.getElementById('optDetailDtContent').innerHTML = html;
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
                        thrStr = ' (+' + em.threshold + (em.threshold_unit || '%') + ' = $' + (em.effective_right != null ? em.effective_right.toFixed(2) : '?') + ')';
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
                        thrStr = ' (+' + em.threshold + (em.threshold_unit || '%') + ' = $' + (em.effective_right != null ? em.effective_right.toFixed(2) : '?') + ')';
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
