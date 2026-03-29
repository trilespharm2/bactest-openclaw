var dashboardIntervals = dashboardIntervals || [];

var DASH_CACHE_TTL = 300000;
var DASH_CACHE_PREFIX = 'dash_';

function getDashCache(key) {
    try {
        var raw = localStorage.getItem(DASH_CACHE_PREFIX + key);
        if (!raw) return null;
        var entry = JSON.parse(raw);
        if (Date.now() - entry.ts < DASH_CACHE_TTL) return entry.data;
    } catch (e) {}
    return null;
}

function setDashCache(key, data) {
    try {
        localStorage.setItem(DASH_CACHE_PREFIX + key, JSON.stringify({ ts: Date.now(), data: data }));
    } catch (e) {}
}

async function fetchCached(path, maxRetries = 6) {
    for (var i = 0; i <= maxRetries; i++) {
        var response = await authFetch(path);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        var data = await response.json();
        if (!data.loading) return data;
        if (i < maxRetries) await new Promise(function(r) { setTimeout(r, 3000); });
    }
    return {};
}

function tickerLink(symbol, extraStyle) {
    if (!symbol) return 'N/A';
    var style = extraStyle || 'font-weight:600;color:#3b6df0;';
    return '<a href="/ticker/' + encodeURIComponent(symbol) + '" style="' + style + 'text-decoration:none;cursor:pointer;" onmouseover="this.style.textDecoration=\'underline\'" onmouseout="this.style.textDecoration=\'none\'">' + symbol + '</a>';
}

async function initDashboard() {
    console.log('Initializing dashboard...');

    dashboardIntervals.forEach(function(i) { clearInterval(i); });
    dashboardIntervals = [];

    renderFromCache();

    await Promise.allSettled([
        loadIndices(),
        loadGainersLosers(),
        loadMostActive(),
        loadTrending(),
        loadSectors(),
        loadEarnings(),
        loadNews(),
        loadTreasury(),
        loadEconomic()
    ]);

    checkApiStatus();
    setupQuickActions();

    dashboardIntervals.push(setInterval(loadIndices, DASH_CACHE_TTL));
    dashboardIntervals.push(setInterval(loadGainersLosers, DASH_CACHE_TTL));
    dashboardIntervals.push(setInterval(loadMostActive, DASH_CACHE_TTL));
    dashboardIntervals.push(setInterval(loadTrending, DASH_CACHE_TTL));
    dashboardIntervals.push(setInterval(loadSectors, DASH_CACHE_TTL));
    dashboardIntervals.push(setInterval(loadEarnings, DASH_CACHE_TTL));
    dashboardIntervals.push(setInterval(loadNews, DASH_CACHE_TTL));
    dashboardIntervals.push(setInterval(loadTreasury, DASH_CACHE_TTL));
    dashboardIntervals.push(setInterval(loadEconomic, DASH_CACHE_TTL));
}

function renderFromCache() {
    var c;
    c = getDashCache('indices');
    if (c) renderIndices(c);
    c = getDashCache('gainers');
    if (c) renderMoversTable('gainersTable', c, true);
    c = getDashCache('losers');
    if (c) renderMoversTable('losersTable', c, false);
    c = getDashCache('mostActive');
    if (c) renderMostActive(c);
    c = getDashCache('trending');
    if (c) renderTrending(c);
    c = getDashCache('sectors');
    if (c) renderSectors(c);
    c = getDashCache('earnings');
    if (c) renderEarnings(c);
    c = getDashCache('news');
    if (c) renderNews(c);
    c = getDashCache('treasury');
    if (c) renderTreasury(c);
    c = getDashCache('economic');
    if (c) renderEconomic(c);
}

async function loadIndices() {
    try {
        var data = await fetchCached('/api/dashboard/indices');
        var items = data.indices || [];
        setDashCache('indices', items);
        renderIndices(items);
    } catch (e) {
        console.error('Indices error:', e);
        var el = document.getElementById('indicesBar');
        if (el && !getDashCache('indices')) el.innerHTML = '<div class="text-muted text-center w-100" style="font-size:12px;">Unable to load indices</div>';
    }
}

function renderIndices(indices) {
    var el = document.getElementById('indicesBar');
    if (!el || !indices.length) return;

    el.innerHTML = indices.map(function(idx) {
        var isUp = idx.change >= 0;
        var color = idx.symbol === 'UVXY'
            ? (idx.change_pct > 10 ? '#d94452' : idx.change_pct > 3 ? '#e5873a' : '#0fad6e')
            : (isUp ? '#0fad6e' : '#d94452');
        var arrow = isUp ? '▲' : '▼';
        var sign = isUp ? '+' : '';
        return '<div class="text-center" style="flex:1;min-width:90px;">' +
            '<div style="font-size:11px;">' + tickerLink(idx.symbol, 'font-weight:600;color:#6b7689;') + '</div>' +
            '<div style="font-size:15px;font-weight:700;color:#1a1e2e;">' + (idx.price ? '$' + idx.price.toLocaleString(undefined, {minimumFractionDigits:2}) : '—') + '</div>' +
            '<div style="font-size:11px;font-weight:600;color:' + color + ';">' + arrow + ' ' + sign + idx.change_pct.toFixed(2) + '%</div>' +
        '</div>';
    }).join('');
}

async function loadGainersLosers() {
    try {
        var data = await fetchCached('/api/dashboard/gainers-losers');

        var sessionBadge = document.getElementById('marketSession');
        if (sessionBadge) {
            sessionBadge.textContent = data.session || 'Market';
            sessionBadge.className = 'badge bg-secondary';
        }

        var refreshTime = document.getElementById('refreshTime');
        if (refreshTime) {
            refreshTime.textContent = 'Updated ' + new Date().toLocaleTimeString();
        }

        var gainers = data.gainers || [];
        var losers = data.losers || [];
        setDashCache('gainers', gainers);
        setDashCache('losers', losers);
        renderMoversTable('gainersTable', gainers, true);
        renderMoversTable('losersTable', losers, false);

    } catch (error) {
        console.error('Error loading gainers/losers:', error);
        var g = document.getElementById('gainersTable');
        var l = document.getElementById('losersTable');
        if (g && !getDashCache('gainers')) g.innerHTML = '<div class="text-muted text-center py-2" style="font-size:12px;">Unable to load</div>';
        if (l && !getDashCache('losers')) l.innerHTML = '<div class="text-muted text-center py-2" style="font-size:12px;">Unable to load</div>';
    }
}

function renderMoversTable(elementId, items, isGainers) {
    var container = document.getElementById(elementId);
    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = '<div class="text-muted text-center py-2" style="font-size:12px;">No data available</div>';
        return;
    }

    container.innerHTML = items.slice(0, 8).map(function(item) {
        var pct = item.change_pct || item.change_percent || item.todaysChangePerc || 0;
        var color = isGainers ? '#0fad6e' : '#d94452';
        var arrow = isGainers ? '▲' : '▼';
        return '<a href="/ticker/' + encodeURIComponent(item.symbol) + '" class="d-flex justify-content-between align-items-center py-1" style="border-bottom:1px solid #f0f2f6;font-size:13px;text-decoration:none;color:inherit;cursor:pointer;transition:background 0.12s;" onmouseover="this.style.background=\'#f5f7ff\'" onmouseout="this.style.background=\'transparent\'">' +
            '<span style="font-weight:600;color:#3b6df0;">' + (item.symbol || 'N/A') + '</span>' +
            '<span style="font-weight:600;color:' + color + ';">' + arrow + ' ' + Math.abs(pct).toFixed(2) + '%</span>' +
        '</a>';
    }).join('');
}

async function loadMostActive() {
    try {
        var data = await fetchCached('/api/dashboard/most-active');
        var items = data.active || [];
        setDashCache('mostActive', items);
        renderMostActive(items);
    } catch (e) {
        console.error('Most active error:', e);
        var el = document.getElementById('mostActiveTable');
        if (el && !getDashCache('mostActive')) el.innerHTML = '<div class="text-muted text-center py-2" style="font-size:12px;">Unable to load</div>';
    }
}

function renderMostActive(items) {
    var el = document.getElementById('mostActiveTable');
    if (!el) return;
    if (!items.length) { el.innerHTML = '<div class="text-muted text-center py-2" style="font-size:12px;">No data</div>'; return; }

    el.innerHTML = items.slice(0, 8).map(function(item) {
        var pct = item.change_pct || 0;
        var color = pct >= 0 ? '#0fad6e' : '#d94452';
        var arrow = pct >= 0 ? '▲' : '▼';
        var vol = item.volume >= 1e6 ? (item.volume / 1e6).toFixed(1) + 'M' : item.volume >= 1e3 ? (item.volume / 1e3).toFixed(0) + 'K' : item.volume;
        return '<a href="/ticker/' + encodeURIComponent(item.symbol) + '" class="d-flex justify-content-between align-items-center py-1" style="border-bottom:1px solid #f0f2f6;font-size:13px;text-decoration:none;color:inherit;cursor:pointer;transition:background 0.12s;" onmouseover="this.style.background=\'#f5f7ff\'" onmouseout="this.style.background=\'transparent\'">' +
            '<span style="font-weight:600;color:#3b6df0;">' + (item.symbol || '') + '</span>' +
            '<span style="color:#6b7689;font-size:11px;">' + vol + '</span>' +
            '<span style="font-weight:600;color:' + color + ';">' + arrow + ' ' + Math.abs(pct).toFixed(2) + '%</span>' +
        '</a>';
    }).join('');
}

async function loadTrending() {
    try {
        var data = await fetchCached('/api/dashboard/trending');
        var items = data.trending || [];
        setDashCache('trending', items);
        renderTrending(items);
    } catch (e) {
        console.error('Trending error:', e);
        var el = document.getElementById('trendingTable');
        if (el && !getDashCache('trending')) el.innerHTML = '<div class="text-muted text-center py-2" style="font-size:12px;">Unable to load</div>';
    }
}

function renderTrending(items) {
    var el = document.getElementById('trendingTable');
    if (!el) return;
    if (!items.length) { el.innerHTML = '<div class="text-muted text-center py-2" style="font-size:12px;">No data</div>'; return; }

    el.innerHTML = items.slice(0, 8).map(function(item, i) {
        var pct = item.change_pct || 0;
        var color = pct >= 0 ? '#0fad6e' : '#d94452';
        var arrow = pct >= 0 ? '▲' : '▼';
        return '<a href="/ticker/' + encodeURIComponent(item.symbol) + '" class="d-flex justify-content-between align-items-center py-1" style="border-bottom:1px solid #f0f2f6;font-size:13px;text-decoration:none;color:inherit;cursor:pointer;transition:background 0.12s;" onmouseover="this.style.background=\'#f5f7ff\'" onmouseout="this.style.background=\'transparent\'">' +
            '<span style="color:#6b7689;font-size:11px;width:18px;">' + (i + 1) + '</span>' +
            '<span style="flex:1;font-weight:600;color:#3b6df0;">' + (item.symbol || '') + '</span>' +
            '<span style="font-weight:600;color:' + color + ';">' + arrow + ' ' + Math.abs(pct).toFixed(2) + '%</span>' +
        '</a>';
    }).join('');
}

async function loadSectors() {
    try {
        var data = await fetchCached('/api/dashboard/sectors');
        var items = data.sectors || [];
        setDashCache('sectors', items);
        renderSectors(items);
    } catch (e) {
        console.error('Sectors error:', e);
        var el = document.getElementById('sectorGrid');
        if (el && !getDashCache('sectors')) el.innerHTML = '<div class="text-muted text-center py-2" style="grid-column:span 4;font-size:12px;">Unable to load</div>';
    }
}

function renderSectors(sectors) {
    var el = document.getElementById('sectorGrid');
    if (!el) return;
    if (!sectors.length) { el.innerHTML = '<div class="text-muted text-center py-2" style="grid-column:span 4;font-size:12px;">No data</div>'; return; }

    el.innerHTML = sectors.map(function(s) {
        var pct = s.change_pct || 0;
        var isUp = pct >= 0;
        var color = isUp ? '#0fad6e' : '#d94452';
        var bg = isUp ? 'rgba(15,173,110,0.08)' : 'rgba(217,68,82,0.08)';
        return '<a href="/ticker/' + encodeURIComponent(s.symbol || '') + '" style="padding:8px 10px;border-radius:8px;background:' + bg + ';text-align:center;display:block;text-decoration:none;transition:background 0.15s;" onmouseover="this.style.background=\'#eef2ff\'" onmouseout="this.style.background=\'' + bg + '\'">' +
            '<div style="font-size:12px;font-weight:600;color:#1a1e2e;">' + s.name + '</div>' +
            '<div style="font-size:15px;font-weight:700;color:' + color + ';margin-top:2px;">' + (isUp ? '+' : '') + pct.toFixed(2) + '%</div>' +
            '<div style="font-size:9px;color:#6b7689;">' + s.symbol + '</div>' +
        '</a>';
    }).join('');
}

async function loadEarnings() {
    try {
        var data = await fetchCached('/api/dashboard/earnings');
        var items = data.earnings || [];
        setDashCache('earnings', items);
        renderEarnings(items);
    } catch (e) {
        console.error('Earnings error:', e);
        var el = document.getElementById('earningsTable');
        if (el && !getDashCache('earnings')) el.innerHTML = '<div class="text-muted text-center py-2" style="font-size:12px;">Unable to load earnings</div>';
    }
}

function renderEarnings(earnings) {
    var el = document.getElementById('earningsTable');
    if (!el) return;

    var filtered = earnings.filter(function(e) {
        if (!e.symbol || e.symbol === 'NA' || e.symbol === 'N/A') return false;
        if (!e.date || e.date === 'NA' || e.date === 'N/A') return false;
        if (e.name === 'NA' || e.name === 'N/A') e.name = '';
        return true;
    });

    if (!filtered.length) { el.innerHTML = '<div class="text-muted text-center py-2" style="font-size:12px;">No upcoming earnings</div>'; return; }

    var html = '<div class="d-flex flex-wrap gap-2">' + filtered.slice(0, 12).map(function(e) {
        var timing = e.time === 'before' ? 'BMO' : e.time === 'after' ? 'AMC' : '';
        if (e.time && e.time !== 'before' && e.time !== 'after' && e.time !== 'NA' && e.time !== 'N/A' && e.time !== 'TAS') timing = e.time;
        var timingBg = timing === 'BMO' ? '#fff7ed' : timing === 'AMC' ? '#eff6ff' : '#f8f9fc';
        var timingColor = timing === 'BMO' ? '#e5873a' : timing === 'AMC' ? '#3b6df0' : '#6b7689';
        var displayName = (e.name && e.name !== 'NA' && e.name !== 'N/A') ? e.name : '';
        var displayDate = (e.date && e.date !== 'NA' && e.date !== 'N/A') ? e.date : '';
        return '<a href="/ticker/' + encodeURIComponent(e.symbol) + '" style="padding:8px 12px;border-radius:8px;border:1px solid #e2e6ee;background:#fff;min-width:100px;flex:1;text-decoration:none;display:block;transition:border-color 0.15s,box-shadow 0.15s;" onmouseover="this.style.borderColor=\'#3b6df0\';this.style.boxShadow=\'0 2px 8px rgba(0,0,0,0.08)\'" onmouseout="this.style.borderColor=\'#e2e6ee\';this.style.boxShadow=\'none\'">' +
            '<div style="font-size:13px;font-weight:700;color:#3b6df0;">' + e.symbol + '</div>' +
            (displayName ? '<div style="font-size:10px;color:#6b7689;margin:2px 0;">' + displayName + '</div>' : '') +
            '<div style="display:flex;gap:6px;align-items:center;">' +
                (displayDate ? '<span style="font-size:10px;color:#6b7689;">' + displayDate + '</span>' : '') +
                (timing ? '<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;background:' + timingBg + ';color:' + timingColor + ';">' + timing + '</span>' : '') +
            '</div>' +
        '</a>';
    }).join('') + '</div>';

    el.innerHTML = html;
}

async function loadNews() {
    try {
        var data = await fetchCached('/api/dashboard/news');
        var items = data.articles || [];
        setDashCache('news', items);
        renderNews(items);
    } catch (e) {
        console.error('News error:', e);
        var el = document.getElementById('newsContainer');
        if (el && !getDashCache('news')) el.innerHTML = '<div class="text-muted text-center py-2" style="font-size:12px;">Unable to load news</div>';
    }
}

function renderNews(articles) {
    var el = document.getElementById('newsContainer');
    if (!el) return;
    if (!articles.length) { el.innerHTML = '<div class="text-muted text-center py-2" style="font-size:12px;">No news available</div>'; return; }

    function esc(str) {
        var d = document.createElement('div');
        d.textContent = str || '';
        return d.innerHTML;
    }

    function safeUrl(url) {
        if (!url) return '#';
        try { var u = new URL(url); return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : '#'; }
        catch(e) { return '#'; }
    }

    function timeAgo(dateStr) {
        if (!dateStr) return '';
        var now = new Date();
        var pub = new Date(dateStr);
        var diffMs = now - pub;
        var mins = Math.floor(diffMs / 60000);
        if (mins < 60) return mins + 'm ago';
        var hours = Math.floor(mins / 60);
        if (hours < 24) return hours + 'h ago';
        return Math.floor(hours / 24) + 'd ago';
    }

    el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;">' +
        articles.slice(0, 8).map(function(a) {
            var ago = timeAgo(a.published);
            return '<a href="' + safeUrl(a.link) + '" target="_blank" rel="noopener" style="text-decoration:none;display:block;padding:10px 12px;border-radius:8px;border:1px solid #e2e6ee;background:#fff;transition:box-shadow .15s,border-color .15s;" onmouseover="this.style.boxShadow=\'0 2px 8px rgba(0,0,0,0.08)\';this.style.borderColor=\'#3b6df0\'" onmouseout="this.style.boxShadow=\'none\';this.style.borderColor=\'#e2e6ee\'">' +
                '<div style="font-size:12px;font-weight:600;color:#1a1e2e;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">' + esc(a.title) + '</div>' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">' +
                    '<span style="font-size:10px;color:#3b6df0;font-weight:600;">' + esc(a.publisher) + '</span>' +
                    '<span style="font-size:10px;color:#6b7689;">' + ago + '</span>' +
                '</div>' +
            '</a>';
        }).join('') +
    '</div>';
}

async function loadTreasury() {
    try {
        var data = await fetchCached('/api/dashboard/treasury');
        var items = data.rates || [];
        setDashCache('treasury', items);
        renderTreasury(items);
    } catch (e) {
        console.error('Treasury error:', e);
        var el = document.getElementById('treasuryGrid');
        if (el && !getDashCache('treasury')) el.innerHTML = '<div class="text-muted text-center py-2" style="grid-column:span 2;font-size:12px;">Unable to load</div>';
    }
}

function renderTreasury(rates) {
    var el = document.getElementById('treasuryGrid');
    if (!el) return;
    if (!rates.length) { el.innerHTML = '<div class="text-muted text-center py-2" style="grid-column:span 2;font-size:12px;">No data</div>'; return; }

    el.innerHTML = rates.map(function(r) {
        var isUp = r.change >= 0;
        var color = isUp ? '#d94452' : '#0fad6e';
        var arrow = isUp ? '▲' : '▼';
        var bg = isUp ? 'rgba(217,68,82,0.06)' : 'rgba(15,173,110,0.06)';
        return '<div style="padding:10px 12px;border-radius:8px;background:' + bg + ';text-align:center;">' +
            '<div style="font-size:11px;font-weight:600;color:#6b7689;">' + r.name + ' Treasury</div>' +
            '<div style="font-size:18px;font-weight:700;color:#1a1e2e;margin:2px 0;">' + r.rate.toFixed(3) + '%</div>' +
            '<div style="font-size:11px;font-weight:600;color:' + color + ';">' + arrow + ' ' + Math.abs(r.change).toFixed(3) + '%</div>' +
        '</div>';
    }).join('');
}

async function loadEconomic() {
    try {
        var data = await fetchCached('/api/dashboard/economic');
        var items = data.indicators || [];
        setDashCache('economic', items);
        renderEconomic(items);
    } catch (e) {
        console.error('Economic error:', e);
        var el = document.getElementById('economicGrid');
        if (el && !getDashCache('economic')) el.innerHTML = '<div class="text-muted text-center py-2" style="grid-column:span 2;font-size:12px;">Unable to load</div>';
    }
}

function renderEconomic(indicators) {
    var el = document.getElementById('economicGrid');
    if (!el) return;
    if (!indicators.length) { el.innerHTML = '<div class="text-muted text-center py-2" style="grid-column:span 2;font-size:12px;">No data</div>'; return; }

    var iconMap = {
        'VIX': 'fas fa-chart-area',
        'US Dollar (DXY)': 'fas fa-dollar-sign',
        'Gold': 'fas fa-coins',
        'Crude Oil': 'fas fa-gas-pump',
        'Bitcoin': 'fab fa-bitcoin',
        'Silver': 'fas fa-ring'
    };

    el.innerHTML = indicators.map(function(ind) {
        var isUp = ind.change >= 0;
        var color = ind.name === 'VIX' ? (isUp ? '#d94452' : '#0fad6e') : (isUp ? '#0fad6e' : '#d94452');
        var arrow = isUp ? '▲' : '▼';
        var sign = isUp ? '+' : '';
        var bg = isUp
            ? (ind.name === 'VIX' ? 'rgba(217,68,82,0.06)' : 'rgba(15,173,110,0.06)')
            : (ind.name === 'VIX' ? 'rgba(15,173,110,0.06)' : 'rgba(217,68,82,0.06)');
        var icon = iconMap[ind.name] || 'fas fa-chart-line';
        var priceStr = ind.format === 'currency'
            ? '$' + ind.price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})
            : ind.price.toFixed(2);
        return '<a href="/ticker/' + encodeURIComponent(ind.symbol || '') + '" style="padding:10px 12px;border-radius:8px;background:' + bg + ';text-align:center;display:block;text-decoration:none;transition:background 0.15s;" onmouseover="this.style.background=\'#eef2ff\'" onmouseout="this.style.background=\'' + bg + '\'">' +
            '<div style="font-size:11px;font-weight:600;color:#6b7689;"><i class="' + icon + '" style="margin-right:4px;"></i>' + ind.name + '</div>' +
            '<div style="font-size:16px;font-weight:700;color:#1a1e2e;margin:2px 0;">' + priceStr + '</div>' +
            '<div style="font-size:11px;font-weight:600;color:' + color + ';">' + arrow + ' ' + sign + ind.change_pct.toFixed(2) + '%</div>' +
        '</a>';
    }).join('');
}

function checkApiStatus() {}

function setupQuickActions() {
    var quickActionBtns = document.querySelectorAll('.quick-action-btn, .quick-action-card');
    quickActionBtns.forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            var page = btn.dataset.page;
            if (page && typeof navigateToPage === 'function') {
                navigateToPage(page);
            }
        });
    });
}

if (typeof window !== 'undefined') {
    window.initDashboard = initDashboard;
}
