var dashboardIntervals = dashboardIntervals || [];

async function fetchCached(path, maxRetries = 6) {
    for (let i = 0; i <= maxRetries; i++) {
        const response = await authFetch(path);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data.loading) return data;
        if (i < maxRetries) await new Promise(r => setTimeout(r, 3000));
    }
    return {};
}

async function initDashboard() {
    console.log('Initializing dashboard...');

    // Clear any existing intervals
    dashboardIntervals.forEach(i => clearInterval(i));
    dashboardIntervals = [];

    // Load all data in parallel
    await Promise.allSettled([
        loadIndices(),
        loadGainersLosers(),
        loadMostActive(),
        loadTrending(),
        loadSectors(),
        loadEarnings()
    ]);

    checkApiStatus();
    setupQuickActions();

    // Refresh intervals
    dashboardIntervals.push(setInterval(loadIndices, 30000));
    dashboardIntervals.push(setInterval(loadGainersLosers, 30000));
    dashboardIntervals.push(setInterval(loadMostActive, 60000));
    dashboardIntervals.push(setInterval(loadTrending, 60000));
    dashboardIntervals.push(setInterval(loadSectors, 60000));
    dashboardIntervals.push(setInterval(loadEarnings, 300000));
}

// ─── INDICES TICKER BAR ─────────────────────────────────────
async function loadIndices() {
    try {
        const data = await fetchCached('/api/dashboard/indices');
        renderIndices(data.indices || []);
    } catch (e) {
        console.error('Indices error:', e);
        const el = document.getElementById('indicesBar');
        if (el) el.innerHTML = '<div class="text-muted text-center w-100" style="font-size:12px;">Unable to load indices</div>';
    }
}

function renderIndices(indices) {
    const el = document.getElementById('indicesBar');
    if (!el || !indices.length) return;

    el.innerHTML = indices.map(idx => {
        const isUp = idx.change >= 0;
        const color = idx.symbol === 'UVXY'
            ? (idx.change_pct > 10 ? '#d94452' : idx.change_pct > 3 ? '#e5873a' : '#0fad6e')
            : (isUp ? '#0fad6e' : '#d94452');
        const arrow = isUp ? '▲' : '▼';
        const sign = isUp ? '+' : '';
        return `<div class="text-center" style="flex:1;min-width:90px;">
            <div style="font-size:11px;font-weight:600;color:#6b7689;">${idx.symbol}</div>
            <div style="font-size:15px;font-weight:700;color:#1a1e2e;">${idx.price ? '$' + idx.price.toLocaleString(undefined, {minimumFractionDigits:2}) : '—'}</div>
            <div style="font-size:11px;font-weight:600;color:${color};">${arrow} ${sign}${idx.change_pct.toFixed(2)}%</div>
        </div>`;
    }).join('');
}

// ─── GAINERS / LOSERS ────────────────────────────────────────
async function loadGainersLosers() {
    try {
        const data = await fetchCached('/api/dashboard/gainers-losers');

        const sessionBadge = document.getElementById('marketSession');
        if (sessionBadge) {
            sessionBadge.textContent = data.session || 'Market';
            sessionBadge.className = 'badge bg-secondary';
        }

        const refreshTime = document.getElementById('refreshTime');
        if (refreshTime) {
            refreshTime.textContent = `Updated ${new Date().toLocaleTimeString()}`;
        }

        renderMoversTable('gainersTable', data.gainers || [], true);
        renderMoversTable('losersTable', data.losers || [], false);

    } catch (error) {
        console.error('Error loading gainers/losers:', error);
        const g = document.getElementById('gainersTable');
        const l = document.getElementById('losersTable');
        if (g) g.innerHTML = '<div class="text-muted text-center py-2" style="font-size:12px;">Unable to load</div>';
        if (l) l.innerHTML = '<div class="text-muted text-center py-2" style="font-size:12px;">Unable to load</div>';
    }
}

function renderMoversTable(elementId, items, isGainers) {
    const container = document.getElementById(elementId);
    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = '<div class="text-muted text-center py-2" style="font-size:12px;">No data available</div>';
        return;
    }

    container.innerHTML = items.slice(0, 8).map(item => {
        const pct = item.change_pct || item.change_percent || item.todaysChangePerc || 0;
        const color = isGainers ? '#0fad6e' : '#d94452';
        const arrow = isGainers ? '▲' : '▼';
        return `<div class="d-flex justify-content-between align-items-center py-1" style="border-bottom:1px solid #f0f2f6;font-size:13px;">
            <span style="font-weight:600;color:#3b6df0;">${item.symbol || 'N/A'}</span>
            <span style="font-weight:600;color:${color};">${arrow} ${Math.abs(pct).toFixed(2)}%</span>
        </div>`;
    }).join('');
}

// ─── MOST ACTIVE ─────────────────────────────────────────────
async function loadMostActive() {
    try {
        const data = await fetchCached('/api/dashboard/most-active');
        renderMostActive(data.active || []);
    } catch (e) {
        console.error('Most active error:', e);
        const el = document.getElementById('mostActiveTable');
        if (el) el.innerHTML = '<div class="text-muted text-center py-2" style="font-size:12px;">Unable to load</div>';
    }
}

function renderMostActive(items) {
    const el = document.getElementById('mostActiveTable');
    if (!el) return;
    if (!items.length) { el.innerHTML = '<div class="text-muted text-center py-2" style="font-size:12px;">No data</div>'; return; }

    el.innerHTML = items.slice(0, 8).map(item => {
        const pct = item.change_pct || 0;
        const color = pct >= 0 ? '#0fad6e' : '#d94452';
        const arrow = pct >= 0 ? '▲' : '▼';
        const vol = item.volume >= 1e6 ? (item.volume / 1e6).toFixed(1) + 'M' : item.volume >= 1e3 ? (item.volume / 1e3).toFixed(0) + 'K' : item.volume;
        return `<div class="d-flex justify-content-between align-items-center py-1" style="border-bottom:1px solid #f0f2f6;font-size:13px;">
            <span style="font-weight:600;color:#3b6df0;">${item.symbol}</span>
            <span style="color:#6b7689;font-size:11px;">${vol}</span>
            <span style="font-weight:600;color:${color};">${arrow} ${Math.abs(pct).toFixed(2)}%</span>
        </div>`;
    }).join('');
}

// ─── TRENDING NOW (5-MIN) ────────────────────────────────────
async function loadTrending() {
    try {
        const data = await fetchCached('/api/dashboard/trending');
        renderTrending(data.trending || []);
    } catch (e) {
        console.error('Trending error:', e);
        const el = document.getElementById('trendingTable');
        if (el) el.innerHTML = '<div class="text-muted text-center py-2" style="font-size:12px;">Unable to load</div>';
    }
}

function renderTrending(items) {
    const el = document.getElementById('trendingTable');
    if (!el) return;
    if (!items.length) { el.innerHTML = '<div class="text-muted text-center py-2" style="font-size:12px;">No data</div>'; return; }

    el.innerHTML = items.slice(0, 8).map((item, i) => {
        const pct = item.change_pct || 0;
        const color = pct >= 0 ? '#0fad6e' : '#d94452';
        const arrow = pct >= 0 ? '▲' : '▼';
        return `<div class="d-flex justify-content-between align-items-center py-1" style="border-bottom:1px solid #f0f2f6;font-size:13px;">
            <span style="color:#6b7689;font-size:11px;width:18px;">${i + 1}</span>
            <span style="font-weight:600;color:#3b6df0;flex:1;">${item.symbol}</span>
            <span style="font-weight:600;color:${color};">${arrow} ${Math.abs(pct).toFixed(2)}%</span>
        </div>`;
    }).join('');
}

// ─── SECTOR PERFORMANCE ──────────────────────────────────────
async function loadSectors() {
    try {
        const data = await fetchCached('/api/dashboard/sectors');
        renderSectors(data.sectors || []);
    } catch (e) {
        console.error('Sectors error:', e);
        const el = document.getElementById('sectorGrid');
        if (el) el.innerHTML = '<div class="text-muted text-center py-2" style="grid-column:span 4;font-size:12px;">Unable to load</div>';
    }
}

function renderSectors(sectors) {
    const el = document.getElementById('sectorGrid');
    if (!el) return;
    if (!sectors.length) { el.innerHTML = '<div class="text-muted text-center py-2" style="grid-column:span 4;font-size:12px;">No data</div>'; return; }

    el.innerHTML = sectors.map(s => {
        const pct = s.change_pct || 0;
        const isUp = pct >= 0;
        const color = isUp ? '#0fad6e' : '#d94452';
        const bg = isUp ? 'rgba(15,173,110,0.08)' : 'rgba(217,68,82,0.08)';
        return `<div style="padding:8px 10px;border-radius:8px;background:${bg};text-align:center;">
            <div style="font-size:12px;font-weight:600;color:#1a1e2e;">${s.name}</div>
            <div style="font-size:15px;font-weight:700;color:${color};margin-top:2px;">${isUp ? '+' : ''}${pct.toFixed(2)}%</div>
            <div style="font-size:9px;color:#6b7689;">${s.symbol}</div>
        </div>`;
    }).join('');
}

// ─── EARNINGS CALENDAR ───────────────────────────────────────
async function loadEarnings() {
    try {
        const data = await fetchCached('/api/dashboard/earnings');
        renderEarnings(data.earnings || []);
    } catch (e) {
        console.error('Earnings error:', e);
        const el = document.getElementById('earningsTable');
        if (el) el.innerHTML = '<div class="text-muted text-center py-2" style="font-size:12px;">Unable to load earnings</div>';
    }
}

function renderEarnings(earnings) {
    const el = document.getElementById('earningsTable');
    if (!el) return;
    if (!earnings.length) { el.innerHTML = '<div class="text-muted text-center py-2" style="font-size:12px;">No upcoming earnings</div>'; return; }

    const html = `<div class="d-flex flex-wrap gap-2">${earnings.slice(0, 12).map(e => {
        const timing = e.time === 'before' ? 'BMO' : e.time === 'after' ? 'AMC' : e.time || '';
        const timingBg = timing === 'BMO' ? '#fff7ed' : timing === 'AMC' ? '#eff6ff' : '#f8f9fc';
        const timingColor = timing === 'BMO' ? '#e5873a' : timing === 'AMC' ? '#3b6df0' : '#6b7689';
        return `<div style="padding:8px 12px;border-radius:8px;border:1px solid #e2e6ee;background:#fff;min-width:100px;flex:1;">
            <div style="font-size:13px;font-weight:700;color:#3b6df0;">${e.symbol}</div>
            <div style="font-size:10px;color:#6b7689;margin:2px 0;">${e.name || ''}</div>
            <div style="display:flex;gap:6px;align-items:center;">
                <span style="font-size:10px;color:#6b7689;">${e.date || ''}</span>
                ${timing ? `<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;background:${timingBg};color:${timingColor};">${timing}</span>` : ''}
            </div>
        </div>`;
    }).join('')}</div>`;

    el.innerHTML = html;
}

// ─── UTILS ───────────────────────────────────────────────────
function checkApiStatus() {
    // Kept for backward compatibility
}

function setupQuickActions() {
    const quickActionBtns = document.querySelectorAll('.quick-action-btn, .quick-action-card');
    quickActionBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const page = btn.dataset.page;
            if (page && typeof navigateToPage === 'function') {
                navigateToPage(page);
            }
        });
    });
}

if (typeof window !== 'undefined') {
    window.initDashboard = initDashboard;
}
