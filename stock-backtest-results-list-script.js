// Stock Backtest Results List Script
// Fetches and displays all stock backtests from stock_backtest_v3_results folder

let allBacktests = [];
let currentFilter = 'all';

// Initialize page
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Stock Backtest Results List Initialized');
    
    // Setup event listeners
    setupEventListeners();
    
    // Load backtests
    await loadBacktests();
});

function setupEventListeners() {
    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.onclick = async () => {
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Refreshing...';
            refreshBtn.disabled = true;
            await loadBacktests();
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
            refreshBtn.disabled = false;
        };
    }
    
    // Filter buttons
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.onclick = () => {
            // Update active state
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Apply filter
            currentFilter = btn.dataset.filter;
            displayBacktests(allBacktests, currentFilter);
        };
    });
}

async function loadBacktests() {
    try {
        // Show loading
        document.getElementById('loadingSection').style.display = 'block';
        document.getElementById('errorSection').style.display = 'none';
        document.getElementById('backtestsGrid').style.display = 'none';
        document.getElementById('emptyState').style.display = 'none';
        
        // Fetch user-specific stock backtests
        const response = await authFetch('/api/my/backtests/stocks');
        
        if (!response.ok) {
            if (response.status === 401) {
                console.log('User not authenticated, showing empty results');
                allBacktests = [];
                document.getElementById('loadingSection').style.display = 'none';
                displayBacktests(allBacktests, currentFilter);
                return;
            }
            const error = await response.json();
            throw new Error(error.error || 'Failed to load backtests');
        }
        
        const data = await response.json();
        allBacktests = data.backtests || [];
        
        console.log(`Loaded ${allBacktests.length} user stock backtests`);
        
        // Log timestamp details for debugging
        if (allBacktests.length > 0) {
            console.log('Sample backtest data:', allBacktests[0]);
            console.log('Sample timestamp:', allBacktests[0].created_at || allBacktests[0].timestamp);
        }
        
        // Hide loading
        document.getElementById('loadingSection').style.display = 'none';
        
        // Display backtests
        displayBacktests(allBacktests, currentFilter);
        
    } catch (error) {
        console.error('Error loading backtests:', error);
        document.getElementById('loadingSection').style.display = 'none';
        document.getElementById('errorSection').style.display = 'block';
        document.getElementById('errorMessage').textContent = error.message;
    }
}

function displayBacktests(backtests, filter) {
    const grid = document.getElementById('backtestsGrid');
    const emptyState = document.getElementById('emptyState');
    
    // Filter backtests
    let filtered = backtests;
    const now = new Date();
    
    if (filter === 'today') {
        const today = now.toISOString().split('T')[0];
        filtered = backtests.filter(b => b.timestamp.startsWith(today));
    } else if (filter === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        filtered = backtests.filter(b => new Date(b.timestamp) >= weekAgo);
    } else if (filter === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        filtered = backtests.filter(b => new Date(b.timestamp) >= monthAgo);
    }
    
    console.log(`Displaying ${filtered.length} backtests (filter: ${filter})`);
    
    // Show empty state if no backtests
    if (filtered.length === 0) {
        grid.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }
    
    // Show grid
    grid.style.display = 'grid';
    emptyState.style.display = 'none';
    
    // Clear existing cards
    grid.innerHTML = '';
    
    // Create cards
    filtered.forEach(backtest => {
        const card = createBacktestCard(backtest);
        grid.appendChild(card);
    });
}

function createBacktestCard(backtest) {
    const card = document.createElement('div');
    card.className = 'backtest-card';
    
    // Format date with validation
    let dateStr = 'Invalid Date';
    try {
        if (backtest.timestamp) {
            const date = new Date(backtest.timestamp);
            if (!isNaN(date.getTime())) {
                dateStr = date.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
        }
    } catch (e) {
        console.error('Error parsing timestamp:', e, backtest.timestamp);
        dateStr = 'Invalid Date';
    }
    
    // Get stats (if available)
    const totalTrades = backtest.total_trades || 0;
    const symbolCount = backtest.symbol_count || 0;
    
    card.innerHTML = `
        <div class="backtest-card-header">
            <div>
                <h3 class="backtest-title">${backtest.name || 'Unnamed Backtest'}</h3>
                <div class="backtest-id">ID: ${backtest.id}</div>
            </div>
            <div class="backtest-date">${dateStr}</div>
        </div>
        
        <div class="backtest-stats">
            <div class="stat-mini">
                <div class="stat-mini-label">Total Trades</div>
                <div class="stat-mini-value">${totalTrades}</div>
            </div>
            <div class="stat-mini">
                <div class="stat-mini-label">Symbols</div>
                <div class="stat-mini-value">${symbolCount}</div>
            </div>
        </div>
        
        <div class="backtest-actions">
            <button class="btn btn-primary btn-small" onclick="viewBacktest('${backtest.id}')">
                <i class="fas fa-eye"></i> View Results
            </button>
            <button class="btn btn-danger btn-small" onclick="deleteBacktest('${backtest.id}')">
                <i class="fas fa-trash"></i> Delete
            </button>
        </div>
    `;
    
    return card;
}

function viewBacktest(backtestId) {
    // Open detailed results page (same as options flow)
    window.location.href = `stock-backtest-results.html?id=${backtestId}`;
}

async function deleteBacktest(backtestId) {
    if (!confirm('Are you sure you want to delete this backtest? This action cannot be undone.')) {
        return;
    }
    
    try {
        // Get API key
        const apiKey = localStorage.getItem('polygonApiKey');
        if (!apiKey) {
            throw new Error('API key not found');
        }
        
        // Delete backtest
        const response = await authFetch(`/api/stocks-backtest-v3/${backtestId}`, {
            method: 'DELETE',
            headers: {
                'X-API-Key': apiKey
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete backtest');
        }
        
        console.log(`Deleted backtest ${backtestId}`);
        
        // Reload list
        await loadBacktests();
        
    } catch (error) {
        console.error('Error deleting backtest:', error);
        alert('Error deleting backtest: ' + error.message);
    }
}
