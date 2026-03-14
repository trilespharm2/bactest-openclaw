const API_BASE_URL = '';
let gainersLosersInterval = null;

async function initDashboard() {
    console.log('Initializing dashboard...');
    await loadGainersLosers();
    checkApiStatus();
    setupQuickActions();
    
    if (gainersLosersInterval) {
        clearInterval(gainersLosersInterval);
    }
    gainersLosersInterval = setInterval(loadGainersLosers, 30000);
}

async function loadGainersLosers() {
    try {
        const response = await authFetch(`${API_BASE_URL}/api/dashboard/gainers-losers`);
        if (!response.ok) throw new Error('Failed to fetch market data');
        
        const data = await response.json();
        
        const sessionBadge = document.getElementById('marketSession');
        if (sessionBadge) {
            sessionBadge.textContent = data.session || 'Market';
            sessionBadge.className = 'session-badge ' + (data.session || '').toLowerCase().replace(' ', '-');
        }
        
        const refreshTime = document.getElementById('refreshTime');
        if (refreshTime) {
            const now = new Date();
            refreshTime.textContent = `Updated ${now.toLocaleTimeString()}`;
        }
        
        renderMoversTable('gainersTable', data.gainers || [], true);
        renderMoversTable('losersTable', data.losers || [], false);
        
    } catch (error) {
        console.error('Error loading gainers/losers:', error);
        const gainersTable = document.getElementById('gainersTable');
        const losersTable = document.getElementById('losersTable');
        if (gainersTable) gainersTable.innerHTML = '<div class="error-text">Unable to load data</div>';
        if (losersTable) losersTable.innerHTML = '<div class="error-text">Unable to load data</div>';
    }
}

function renderMoversTable(elementId, items, isGainers) {
    const container = document.getElementById(elementId);
    if (!container) return;
    
    if (!items || items.length === 0) {
        container.innerHTML = '<div class="no-data">No data available</div>';
        return;
    }
    
    const html = items.slice(0, 10).map(item => {
        const changeClass = isGainers ? 'positive' : 'negative';
        const arrow = isGainers ? '▲' : '▼';
        const changeValue = item.change_percent ? `${arrow} ${Math.abs(item.change_percent).toFixed(2)}%` : 'N/A';
        
        return `
            <div class="mover-row">
                <div class="mover-symbol">${item.symbol || 'N/A'}</div>
                <div class="mover-price">$${(item.price || 0).toFixed(2)}</div>
                <div class="mover-change ${changeClass}">${changeValue}</div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
}

function checkApiStatus() {
    const polygonKey = localStorage.getItem('polygonApiKey');
    const polygonStatus = document.getElementById('polygonStatus');
    const marketDataStatus = document.getElementById('marketDataStatus');
    
    if (polygonStatus) {
        if (polygonKey) {
            polygonStatus.innerHTML = '<i class="fas fa-circle text-success"></i> Connected';
            polygonStatus.className = 'status-indicator connected';
        } else {
            polygonStatus.innerHTML = '<i class="fas fa-circle text-warning"></i> Not Configured';
            polygonStatus.className = 'status-indicator warning';
        }
    }
    
    if (marketDataStatus) {
        marketDataStatus.innerHTML = '<i class="fas fa-circle text-success"></i> Active';
        marketDataStatus.className = 'status-indicator connected';
    }
}

function setupQuickActions() {
    const quickActionBtns = document.querySelectorAll('.quick-action-btn');
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
