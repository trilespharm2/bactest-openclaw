const rawSymbol = decodeURIComponent(window.location.pathname.split('/').pop()).toUpperCase();
const SYMBOL = /^[A-Z0-9.\-^=]{1,12}$/.test(rawSymbol) ? rawSymbol : '';
if (!SYMBOL) { document.body.innerHTML = '<div style="padding:40px;text-align:center;color:#d94452;">Invalid ticker symbol</div>'; throw new Error('Invalid symbol'); }
const API = `${window.location.protocol}//${window.location.host}/api`;
let priceChart = null;
let financialsData = {};
let financialChart = null;
let currentFinTab = 'income';
let selectedRowLabel = null;

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

loadInfo();
loadChart('3mo');
loadNews();
loadFinancials();
