const rawSymbol = decodeURIComponent(window.location.pathname.split('/').pop()).toUpperCase();
const SYMBOL = /^[A-Z0-9.\-^=]{1,12}$/.test(rawSymbol) ? rawSymbol : '';
if (!SYMBOL) { document.body.innerHTML = '<div style="padding:40px;text-align:center;color:#d94452;">Invalid ticker symbol</div>'; throw new Error('Invalid symbol'); }
const API = `${window.location.protocol}//${window.location.host}/api`;
let priceChart = null;
let financialsData = {};
let financialChart = null;
let currentFinTab = 'income';
let selectedRowLabel = null;
let currentPrice = null;

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

document.title = `${esc(SYMBOL)} - BacktestPro`;

function fmt(val, decimals = 2, fallback = '\u2014') {
    if (val === null || val === undefined || isNaN(val)) return fallback;
    return Number(val).toFixed(decimals);
}

function fmtLarge(val) {
    if (val === null || val === undefined || isNaN(val)) return '\u2014';
    const n = Math.abs(val);
    const sign = val < 0 ? '-' : '';
    if (n >= 1e12) return sign + (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return sign + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return sign + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return sign + (n / 1e3).toFixed(1) + 'K';
    return sign + n.toFixed(2);
}

function fmtDate(ts) {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function loadInfo() {
    try {
        const r = await fetch(`${API}/ticker/${SYMBOL}/info`);
        const data = await r.json();
        if (data.error) throw new Error(data.error);

        const info = data;
        const change = info.change || 0;
        const changePct = info.change_pct || 0;
        currentPrice = info.price || null;
        const isUp = change >= 0;
        const color = isUp ? '#0fad6e' : '#d94452';
        const arrow = isUp ? '\u25B2' : '\u25BC';

        document.getElementById('tickerHeaderInfo').innerHTML =
            `<div>
                <span class="ticker-symbol-header">${esc(SYMBOL)}</span>
                <span class="ticker-name ms-2">${esc(info.name || '')}</span>
            </div>
            <div class="ms-3">
                <span class="ticker-price-header">$${fmt(info.price)}</span>
                <span class="ticker-change-header ms-2" style="color:${color};">
                    ${arrow} ${isUp ? '+' : ''}${fmt(change)} (${isUp ? '+' : ''}${fmt(changePct)}%)
                </span>
            </div>`;

        const stats = [
            { label: 'Market Cap', value: fmtLarge(info.market_cap) },
            { label: 'P/E Ratio', value: fmt(info.pe_ratio) },
            { label: 'EPS', value: '$' + fmt(info.eps) },
            { label: 'Dividend Yield', value: info.dividend_yield ? fmt(info.dividend_yield * 100) + '%' : '\u2014' },
            { label: '52W High', value: '$' + fmt(info.high_52w) },
            { label: '52W Low', value: '$' + fmt(info.low_52w) },
            { label: 'Volume', value: fmtLarge(info.volume) },
            { label: 'Avg Volume', value: fmtLarge(info.avg_volume) },
            { label: 'Beta', value: fmt(info.beta) },
            { label: 'Sector', value: esc(info.sector || '\u2014') },
        ];

        document.getElementById('tickerInfoGrid').innerHTML = stats.map(s =>
            `<div class="ticker-stat">
                <div class="label">${s.label}</div>
                <div class="value">${s.value}</div>
            </div>`
        ).join('');

    } catch (e) {
        document.getElementById('tickerHeaderInfo').innerHTML =
            `<span class="ticker-symbol-header">${esc(SYMBOL)}</span>
             <span class="text-danger ms-3">Failed to load ticker data</span>`;
        console.error('Info error:', e);
    }
}

async function loadChart(period = '3mo') {
    const loading = document.getElementById('chartLoading');
    loading.classList.remove('hidden');
    try {
        const r = await fetch(`${API}/ticker/${SYMBOL}/chart?period=${period}`);
        const data = await r.json();
        if (data.error) throw new Error(data.error);

        const prices = data.prices || [];
        if (!prices.length) {
            loading.innerHTML = '<span class="text-muted">No chart data available</span>';
            return;
        }

        const labels = prices.map(p => p.date);
        const closes = prices.map(p => p.close);
        const highs = prices.map(p => p.high);
        const lows = prices.map(p => p.low);
        const volumes = prices.map(p => p.volume);

        const isUp = closes[closes.length - 1] >= closes[0];
        const lineColor = isUp ? '#0fad6e' : '#d94452';
        const bgColor = isUp ? 'rgba(15,173,110,0.08)' : 'rgba(217,68,82,0.08)';

        if (priceChart) priceChart.destroy();

        const ctx = document.getElementById('priceChart').getContext('2d');
        priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Close',
                    data: closes,
                    borderColor: lineColor,
                    backgroundColor: bgColor,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    pointHitRadius: 10,
                    borderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1a1e2e',
                        titleFont: { size: 11 },
                        bodyFont: { size: 12 },
                        padding: 10,
                        callbacks: {
                            title: (items) => {
                                const idx = items[0].dataIndex;
                                return labels[idx];
                            },
                            label: (ctx) => {
                                const idx = ctx.dataIndex;
                                return [
                                    `Close: $${fmt(closes[idx])}`,
                                    `High: $${fmt(highs[idx])}`,
                                    `Low: $${fmt(lows[idx])}`,
                                    `Vol: ${fmtLarge(volumes[idx])}`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 10 }, color: '#6b7689', maxTicksLimit: 8 }
                    },
                    y: {
                        position: 'right',
                        grid: { color: '#f0f1f4' },
                        ticks: {
                            font: { size: 10 },
                            color: '#6b7689',
                            callback: (v) => '$' + v.toLocaleString()
                        }
                    }
                }
            }
        });
        loading.classList.add('hidden');
    } catch (e) {
        loading.innerHTML = '<span class="text-muted">Failed to load chart</span>';
        console.error('Chart error:', e);
    }
}

async function loadNews() {
    try {
        const r = await fetch(`${API}/ticker/${SYMBOL}/news`);
        const data = await r.json();
        const articles = data.articles || [];
        const el = document.getElementById('tickerNewsContainer');

        if (!articles.length) {
            el.innerHTML = '<div class="text-muted text-center py-3" style="font-size:12px;">No news available for this ticker</div>';
            return;
        }

        el.innerHTML = articles.map(a => {
            const safeLink = (a.link || '').startsWith('http') ? encodeURI(a.link) : '#';
            const thumb = a.thumbnail && a.thumbnail.startsWith('http')
                ? `<img src="${encodeURI(a.thumbnail)}" class="news-thumb" onerror="this.style.display='none'" />`
                : '';
            return `<a href="${safeLink}" target="_blank" rel="noopener" class="news-item">
                ${thumb}
                <div style="flex:1;min-width:0;">
                    <div class="news-title">${esc(a.title || '')}</div>
                    <div class="news-meta">${esc(a.publisher || '')}${a.published ? ' \u00B7 ' + fmtDate(a.published) : ''}</div>
                </div>
            </a>`;
        }).join('');
    } catch (e) {
        document.getElementById('tickerNewsContainer').innerHTML =
            '<div class="text-muted text-center py-3">Failed to load news</div>';
        console.error('News error:', e);
    }
}

async function loadFinancials() {
    try {
        const r = await fetch(`${API}/ticker/${SYMBOL}/financials`);
        const data = await r.json();
        if (data.error) throw new Error(data.error);
        financialsData = data;
        renderFinancialTab('income');
    } catch (e) {
        document.getElementById('financialsContainer').innerHTML =
            '<div class="text-muted text-center py-3">Failed to load financials</div>';
        console.error('Financials error:', e);
    }
}

function renderFinancialTab(tab) {
    currentFinTab = tab;
    const container = document.getElementById('financialsContainer');
    const tabData = financialsData[tab];
    if (!tabData || !tabData.rows || !tabData.rows.length) {
        container.innerHTML = '<div class="text-muted text-center py-3" style="font-size:12px;">No data available</div>';
        return;
    }

    const cols = tabData.columns || [];
    const rows = tabData.rows || [];

    let html = '<div class="financials-hint">Click any row to chart its trend</div>';
    html += '<table class="financials-table"><thead><tr><th>Item</th>';
    cols.forEach(c => { html += `<th>${c}</th>`; });
    html += '</tr></thead><tbody>';

    rows.forEach((row, idx) => {
        const isSelected = selectedRowLabel === row.label;
        const selClass = isSelected ? ' selected' : '';
        html += `<tr class="fin-row-clickable${selClass}" data-row-idx="${idx}"><td title="${esc(row.label)}">${esc(row.label)}</td>`;
        row.values.forEach(v => {
            const display = v === null ? '\u2014' : fmtLarge(v);
            const cls = v !== null && v < 0 ? ' class="text-down"' : '';
            html += `<td${cls}>${display}</td>`;
        });
        html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    container.querySelectorAll('.fin-row-clickable').forEach(tr => {
        tr.addEventListener('click', () => {
            const rowIdx = parseInt(tr.dataset.rowIdx);
            const row = rows[rowIdx];
            if (!row) return;
            selectedRowLabel = row.label;
            container.querySelectorAll('.fin-row-clickable').forEach(r => r.classList.remove('selected'));
            tr.classList.add('selected');
            renderFinancialChart(row.label, cols, row.values);
        });
    });

    if (selectedRowLabel) {
        const match = rows.find(r => r.label === selectedRowLabel);
        if (match) {
            renderFinancialChart(match.label, cols, match.values);
        }
    }
}

function renderFinancialChart(label, columns, values) {
    const card = document.getElementById('financialChartCard');
    card.style.display = 'block';
    document.getElementById('financialChartLabel').textContent = label + ' Trend';

    const reversedCols = [...columns].reverse();
    const reversedVals = [...values].reverse();

    const filteredCols = [];
    const filteredVals = [];
    reversedCols.forEach((c, i) => {
        if (reversedVals[i] !== null) {
            filteredCols.push(c);
            filteredVals.push(reversedVals[i]);
        }
    });

    if (!filteredVals.length) {
        card.style.display = 'none';
        return;
    }

    const allPositive = filteredVals.every(v => v >= 0);
    const allNegative = filteredVals.every(v => v <= 0);
    const trend = filteredVals.length >= 2 ? filteredVals[filteredVals.length - 1] - filteredVals[0] : 0;
    const lineColor = trend >= 0 ? '#0fad6e' : '#d94452';
    const bgColor = trend >= 0 ? 'rgba(15,173,110,0.10)' : 'rgba(217,68,82,0.10)';

    const barColors = filteredVals.map(v => v >= 0 ? 'rgba(15,173,110,0.7)' : 'rgba(217,68,82,0.7)');
    const barBorders = filteredVals.map(v => v >= 0 ? '#0fad6e' : '#d94452');

    if (financialChart) financialChart.destroy();

    const ctx = document.getElementById('financialTrendChart').getContext('2d');
    financialChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: filteredCols,
            datasets: [
                {
                    type: 'bar',
                    label: label,
                    data: filteredVals,
                    backgroundColor: barColors,
                    borderColor: barBorders,
                    borderWidth: 1,
                    borderRadius: 4,
                    order: 2,
                },
                {
                    type: 'line',
                    label: label + ' Trend',
                    data: filteredVals,
                    borderColor: lineColor,
                    backgroundColor: bgColor,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 5,
                    pointBackgroundColor: lineColor,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    borderWidth: 2.5,
                    order: 1,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1a1e2e',
                    titleFont: { size: 12 },
                    bodyFont: { size: 13 },
                    padding: 12,
                    callbacks: {
                        title: (items) => items[0].label,
                        label: (ctx) => {
                            if (ctx.datasetIndex === 1) return null;
                            return label + ': ' + fmtLarge(ctx.raw);
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 12, weight: '600' }, color: '#1a1e2e' }
                },
                y: {
                    position: 'right',
                    grid: { color: '#f0f1f4' },
                    ticks: {
                        font: { size: 10 },
                        color: '#6b7689',
                        callback: (v) => fmtLarge(v)
                    }
                }
            }
        }
    });

    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

document.getElementById('chartPeriodBtns').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-period]');
    if (!btn) return;
    document.querySelectorAll('#chartPeriodBtns .btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadChart(btn.dataset.period);
});

document.getElementById('financialTabBtns').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    document.querySelectorAll('#financialTabBtns .btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedRowLabel = null;
    document.getElementById('financialChartCard').style.display = 'none';
    renderFinancialTab(btn.dataset.tab);
});

document.getElementById('closeFinancialChart').addEventListener('click', () => {
    document.getElementById('financialChartCard').style.display = 'none';
    selectedRowLabel = null;
    document.querySelectorAll('.fin-row-clickable').forEach(r => r.classList.remove('selected'));
    if (financialChart) { financialChart.destroy(); financialChart = null; }
});

// ── Options Chain ──────────────────────────────────────────────────────────
let optionsData    = null;
let currentOptType = 'calls';
let optionsChart   = null;

// Custom Chart.js plugin: vertical price line
const priceLine = {
    id: 'priceLine',
    afterDraw(chart, _args, opts) {
        if (opts.price == null) return;
        const { ctx, chartArea, scales } = chart;
        const xScale = scales.x;
        const labels = chart.data.labels || [];
        if (!labels.length) return;
        // Find the nearest label to current price
        let nearestIdx = 0;
        let minDiff = Infinity;
        labels.forEach((lbl, i) => {
            const diff = Math.abs(parseFloat(lbl.replace('$','')) - opts.price);
            if (diff < minDiff) { minDiff = diff; nearestIdx = i; }
        });
        const x = xScale.getPixelForValue(nearestIdx);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.strokeStyle = '#3b6df0';
        ctx.lineWidth   = 2;
        ctx.setLineDash([5, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        // Label
        ctx.fillStyle    = '#3b6df0';
        ctx.font         = '600 11px "Public Sans", sans-serif';
        ctx.textAlign    = 'center';
        ctx.fillRect(x - 28, chartArea.top - 1, 56, 16);
        ctx.fillStyle = '#fff';
        ctx.fillText('$' + opts.price.toFixed(2), x, chartArea.top + 11);
        ctx.restore();
    }
};

function renderOptionsChart(type) {
    const wrap  = document.getElementById('optionsChartWrap');
    const msg   = document.getElementById('optionsChartMsg');
    const canvas = document.getElementById('optionsVolumeChart');
    if (!optionsData) return;

    // Build merged strike list across calls and puts
    const allStrikes = new Set();
    (optionsData.calls || []).forEach(r => { if (r.strike != null) allStrikes.add(r.strike); });
    (optionsData.puts  || []).forEach(r => { if (r.strike != null) allStrikes.add(r.strike); });
    const strikes = Array.from(allStrikes).sort((a, b) => a - b);

    if (!strikes.length) {
        canvas.style.display = 'none';
        msg.style.display    = 'block';
        msg.textContent      = 'No options data available for this expiration.';
        return;
    }
    canvas.style.display = 'block';
    msg.style.display    = 'none';

    const callMap = {};
    (optionsData.calls || []).forEach(r => { callMap[r.strike] = r.volume || 0; });
    const putMap = {};
    (optionsData.puts || []).forEach(r => { putMap[r.strike] = r.volume || 0; });

    const labels = strikes.map(s => '$' + fmt(s, 0));

    let datasets = [];
    if (type === 'calls' || type === 'both') {
        datasets.push({
            label: 'Calls Volume',
            data: strikes.map(s => callMap[s] ?? 0),
            backgroundColor: 'rgba(15,173,110,0.75)',
            borderColor: '#0fad6e',
            borderWidth: 1,
            borderRadius: 3,
        });
    }
    if (type === 'puts' || type === 'both') {
        datasets.push({
            label: 'Puts Volume',
            data: strikes.map(s => putMap[s] ?? 0),
            backgroundColor: 'rgba(217,68,82,0.70)',
            borderColor: '#d94452',
            borderWidth: 1,
            borderRadius: 3,
        });
    }

    if (optionsChart) optionsChart.destroy();
    const ctx = canvas.getContext('2d');
    optionsChart = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: type === 'both',
                    position: 'top',
                    labels: { font: { size: 11 }, boxWidth: 12 },
                },
                tooltip: {
                    callbacks: {
                        title: (items) => 'Strike: ' + items[0].label,
                        label: (item) => item.dataset.label + ': ' + fmtLarge(item.parsed.y),
                    }
                },
                priceLine: { price: currentPrice },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 10 }, color: '#888', maxRotation: 45, minRotation: 0,
                        callback(val, idx) {
                            const total = this.chart.data.labels.length;
                            // Show fewer labels when many strikes
                            if (total > 30 && idx % 3 !== 0) return '';
                            if (total > 60 && idx % 6 !== 0) return '';
                            return this.getLabelForValue(val);
                        }
                    },
                },
                y: {
                    beginAtZero: true,
                    grid: { color: '#f0f2f5' },
                    ticks: { font: { size: 10 }, color: '#888', callback: v => fmtLarge(v) },
                    title: { display: true, text: 'Volume', font: { size: 11 }, color: '#888' },
                }
            },
        },
        plugins: [priceLine],
    });
}

// ─── 3-panel butterfly ────────────────────────────────────────────────────────
// Layout: [Calls panel | Strike panel (fixed) | Puts panel]
// Calls columns (L→R in DOM): IV | OI | Volume | Ask | Bid | Last
//   → slider=0: show Last (scrollLeft=max); slider=100: show IV (scrollLeft=0)
// Puts columns  (L→R in DOM): Last | Bid | Ask | Volume | OI | IV
//   → slider=0: show Last (scrollLeft=0); slider=100: show IV (scrollLeft=max)
// Vertical scroll: the three panels stay in sync via JS.

let bfVScrollLock = false;

function bfSyncVertical(src) {
    if (bfVScrollLock) return;
    bfVScrollLock = true;
    const top = src.scrollTop;
    ['bfCallsPanel', 'bfStrikePanel', 'bfPutsPanel'].forEach(id => {
        const el = document.getElementById(id);
        if (el && el !== src) el.scrollTop = top;
    });
    bfVScrollLock = false;
}

function bfSyncHorizontal(pct) {
    // Calls panel: slider=0 → max scrollLeft (shows Last); slider=100 → 0 (shows IV)
    const calls = document.getElementById('bfCallsPanel');
    if (calls) {
        const maxC = calls.scrollWidth - calls.clientWidth;
        calls.scrollLeft = maxC * (1 - pct / 100);
    }
    // Puts panel: slider=0 → 0 (shows Last); slider=100 → max (shows IV)
    const puts = document.getElementById('bfPutsPanel');
    if (puts) {
        const maxP = puts.scrollWidth - puts.clientWidth;
        puts.scrollLeft = maxP * (pct / 100);
    }
}

function renderButterflyTable() {
    const callsWrap  = document.getElementById('bfCallsWrap');
    const strikeWrap = document.getElementById('bfStrikeWrap');
    const putsWrap   = document.getElementById('bfPutsWrap');
    if (!optionsData || !callsWrap || !strikeWrap || !putsWrap) return;

    const allStrikes = new Set();
    (optionsData.calls || []).forEach(r => { if (r.strike != null) allStrikes.add(r.strike); });
    (optionsData.puts  || []).forEach(r => { if (r.strike != null) allStrikes.add(r.strike); });
    const strikes = Array.from(allStrikes).sort((a, b) => a - b);

    const noData = '<div class="text-center py-4 text-muted" style="font-size:13px;">No chain data available.</div>';
    if (!strikes.length) {
        callsWrap.innerHTML = noData; strikeWrap.innerHTML = ''; putsWrap.innerHTML = '';
        return;
    }

    const callMap = {};
    (optionsData.calls || []).forEach(r => { callMap[r.strike] = r; });
    const putMap = {};
    (optionsData.puts  || []).forEach(r => { putMap[r.strike] = r; });

    let atmStrike = null;
    let atmIdx    = 0;
    if (currentPrice != null) {
        atmStrike = strikes.reduce((best, s) =>
            Math.abs(s - currentPrice) < Math.abs(best - currentPrice) ? s : best, strikes[0]);
        atmIdx = strikes.indexOf(atmStrike);
    }

    function fv(val, prefix = '') { return val != null ? prefix + fmt(val) : '—'; }
    function iv(val) { return val != null ? fmt(val * 100, 1) + '%' : '—'; }
    function vl(val) { return val != null ? fmtLarge(val) : '—'; }

    // Build calls table (IV | OI | Volume | Ask | Bid | Last — outermost left, inner right)
    let callsHtml = `<table><thead><tr>
        <th style="color:#0fad6e;width:80px;">IV</th>
        <th style="color:#0fad6e;width:80px;">OI</th>
        <th style="color:#0fad6e;width:80px;">Volume</th>
        <th style="color:#0fad6e;width:80px;">Ask</th>
        <th style="color:#0fad6e;width:80px;">Bid</th>
        <th style="color:#0fad6e;width:80px;">Last</th>
      </tr></thead><tbody>`;

    // Build strike table (Strike only)
    let strikeHtml = `<table><thead><tr>
        <th style="color:#3b6df0;width:96px;">Strike</th>
      </tr></thead><tbody>`;

    // Build puts table (Last | Bid | Ask | Volume | OI | IV — inner left, outer right)
    let putsHtml = `<table><thead><tr>
        <th style="color:#d94452;width:80px;">Last</th>
        <th style="color:#d94452;width:80px;">Bid</th>
        <th style="color:#d94452;width:80px;">Ask</th>
        <th style="color:#d94452;width:80px;">Volume</th>
        <th style="color:#d94452;width:80px;">OI</th>
        <th style="color:#d94452;width:80px;">IV</th>
      </tr></thead><tbody>`;

    strikes.forEach((strike, idx) => {
        const c     = callMap[strike] || {};
        const p     = putMap[strike]  || {};
        const isAtm = strike === atmStrike;
        const isItm = currentPrice != null && strike < currentPrice;
        const rowCls = isAtm ? 'bf-atm-row' : (isItm ? 'bf-itm-row' : '');

        callsHtml += `<tr class="${rowCls}">
          <td style="color:#888;">${iv(c.impliedVolatility)}</td>
          <td style="color:#888;">${vl(c.openInterest)}</td>
          <td style="color:#0fad6e;font-weight:600;">${vl(c.volume)}</td>
          <td>${fv(c.ask, '$')}</td>
          <td>${fv(c.bid, '$')}</td>
          <td style="font-weight:600;">${fv(c.lastPrice, '$')}</td>
        </tr>`;

        const atmBadge = isAtm
            ? `<span style="font-size:9px;background:#3b6df0;color:#fff;border-radius:3px;padding:0 4px;margin-right:3px;">ATM</span>`
            : '';
        strikeHtml += `<tr class="${rowCls}">
          <td style="color:${isAtm ? '#fff' : '#3b6df0'};font-weight:700;">${atmBadge}$${fmt(strike, 0)}</td>
        </tr>`;

        putsHtml += `<tr class="${rowCls}">
          <td style="font-weight:600;">${fv(p.lastPrice, '$')}</td>
          <td>${fv(p.bid, '$')}</td>
          <td>${fv(p.ask, '$')}</td>
          <td style="color:#d94452;font-weight:600;">${vl(p.volume)}</td>
          <td style="color:#888;">${vl(p.openInterest)}</td>
          <td style="color:#888;">${iv(p.impliedVolatility)}</td>
        </tr>`;
    });

    callsHtml  += '</tbody></table>';
    strikeHtml += '</tbody></table>';
    putsHtml   += '</tbody></table>';

    callsWrap.innerHTML  = callsHtml;
    strikeWrap.innerHTML = strikeHtml;
    putsWrap.innerHTML   = putsHtml;

    // Wait one frame for layout, then:
    // 1. Set horizontal slider to 0 (show Last on both sides)
    // 2. Scroll vertically so ATM row is near the top
    requestAnimationFrame(() => {
        const bar = document.getElementById('butterflyScrollBar');
        if (bar) bar.value = 0;
        bfSyncHorizontal(0);

        // Scroll ATM row near the top (header=36px, each row=35px)
        if (atmIdx > 0) {
            const rowH   = 35;
            const headerH = 36;
            const target  = headerH + atmIdx * rowH - 20; // 20px margin above ATM
            ['bfCallsPanel', 'bfStrikePanel', 'bfPutsPanel'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.scrollTop = Math.max(0, target);
            });
        }

        // Wire up vertical scroll sync (only once; flag guards re-entry)
        ['bfCallsPanel', 'bfStrikePanel', 'bfPutsPanel'].forEach(id => {
            const el = document.getElementById(id);
            if (el && !el._bfVScrollBound) {
                el.addEventListener('scroll', () => bfSyncVertical(el), { passive: true });
                el._bfVScrollBound = true;
            }
        });
    });
}

async function loadOptions(expiration) {
    // Show loading spinners in all three panels
    const loadingHtml = `<div class="text-center py-4">
        <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
        <span class="ms-2 text-muted" style="font-size:13px;">Loading options chain…</span>
    </div>`;
    const cw = document.getElementById('bfCallsWrap');
    const sw = document.getElementById('bfStrikeWrap');
    const pw = document.getElementById('bfPutsWrap');
    if (cw) cw.innerHTML = loadingHtml;
    if (sw) sw.innerHTML = '';
    if (pw) pw.innerHTML = '';

    const msg    = document.getElementById('optionsChartMsg');
    const canvas = document.getElementById('optionsVolumeChart');
    if (msg)    { msg.style.display = 'block'; msg.textContent = 'Loading…'; }
    if (canvas) canvas.style.display = 'none';

    try {
        const url  = `${API}/ticker/${SYMBOL}/options` + (expiration ? `?expiration=${encodeURIComponent(expiration)}` : '');
        const r    = await fetch(url);
        const data = await r.json();

        if (data.error && !data.expirations?.length) {
            if (msg) { msg.style.display = 'block'; msg.textContent = data.error || 'Options data unavailable.'; }
            if (cw)  cw.innerHTML = `<div class="text-center py-4 text-muted" style="font-size:13px;">${esc(data.error || 'Options data unavailable.')}</div>`;
            return;
        }

        const sel = document.getElementById('optionsExpiry');
        if (sel && data.expirations && data.expirations.length) {
            sel.innerHTML = data.expirations.map(e =>
                `<option value="${esc(e)}" ${e === data.expiration ? 'selected' : ''}>${esc(e)}</option>`
            ).join('');
        }

        optionsData = { calls: data.calls || [], puts: data.puts || [] };
        renderOptionsChart(currentOptType);
        renderButterflyTable();

    } catch (e) {
        if (msg) { msg.style.display = 'block'; msg.textContent = 'Failed to load options data.'; }
        if (cw)  cw.innerHTML = '<div class="text-center py-4 text-danger" style="font-size:13px;">Failed to load options data.</div>';
        console.error('Options error:', e);
    }
}

// Toggle chain collapse
document.getElementById('toggleChainBtn').addEventListener('click', () => {
    const panel = document.getElementById('optionsChainCollapse');
    const icon  = document.getElementById('toggleChainIcon');
    const open  = panel.style.display === 'none';
    panel.style.display = open ? 'block' : 'none';
    icon.className = open ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
    if (open) renderButterflyTable();
});

// Expiry change
document.getElementById('optionsExpiry').addEventListener('change', function () {
    loadOptions(this.value);
});

// Toggle calls / puts / both
document.getElementById('optionsTypeBtns').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-opt-type]');
    if (!btn) return;
    document.querySelectorAll('#optionsTypeBtns .btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentOptType = btn.dataset.optType;
    if (optionsData) renderOptionsChart(currentOptType);
});

// Horizontal slider → reveal calls or puts metrics
document.getElementById('butterflyScrollBar').addEventListener('input', function () {
    bfSyncHorizontal(Number(this.value));
});

loadInfo();
loadChart('3mo');
loadNews();
loadFinancials();
loadOptions();
