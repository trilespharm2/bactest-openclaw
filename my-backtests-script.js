// My Backtests - Load and display backtest history

const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `http://${window.location.hostname}:${window.location.port}/api`
    : '/api';

let allBacktests = [];
let currentFilter = 'all';

// Track if already initialized to prevent double-init
let isInitialized = false;

// Main initialization function (called by main-script.js OR DOMContentLoaded)
function initializeMyBacktestsPage() {
    if (isInitialized) {
        console.log('My Backtests already initialized, skipping...');
        return;
    }
    
    console.log('Initializing My Backtests page...');
    console.log('Page URL:', window.location.href);
    console.log('Loading backtests from API...');
    
    isInitialized = true;
    
    loadBacktests();
    setupFilterButtons();
    setupSearchBar();
    setupModalClose();
}

// Auto-initialize on DOMContentLoaded for standalone page
// OR wait for main-script.js to call us for embedded page
if (document.readyState === 'loading') {
    // DOM still loading, wait for it
    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOMContentLoaded fired - standalone mode');
        initializeMyBacktestsPage();
    });
} else {
    // DOM already loaded (probably embedded in index.html)
    console.log('DOM already ready - embedded mode');
    // Don't auto-init, let main-script.js call us
}

function setupFilterButtons() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active button
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update filter and refresh display
            currentFilter = btn.dataset.status;
            displayBacktests();
        });
    });
}

function setupSearchBar() {
    const searchInput = document.getElementById('backtestSearchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    
    if (!searchInput) {
        console.warn('Search input not found');
        return;
    }
    
    // Real-time search as user types
    searchInput.addEventListener('input', () => {
        const hasValue = searchInput.value.trim().length > 0;
        
        // Show/hide clear button
        if (clearBtn) {
            clearBtn.style.display = hasValue ? 'flex' : 'none';
        }
        
        // Refresh display with search filter
        displayBacktests();
    });
    
    // Clear button functionality
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearBtn.style.display = 'none';
            displayBacktests();
        });
    }
    
    // Allow Enter key to trigger search (though it's real-time anyway)
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            displayBacktests();
        }
    });
}

function setupModalClose() {
    const modal = document.getElementById('backtestDetailModal');
    const closeBtn = modal.querySelector('.modal-close');
    const closeFooterBtn = document.getElementById('closeDetailModal');
    
    const closeModal = () => {
        modal.style.display = 'none';
    };
    
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (closeFooterBtn) closeFooterBtn.addEventListener('click', closeModal);
    
    // Close on outside click
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}

async function loadBacktests() {
    console.log('=== LOADING USER BACKTESTS ===');
    const apiUrl = `${API_BASE_URL}/my/backtests`;
    console.log('API URL:', apiUrl);
    
    try {
        console.log('Fetching user backtests...');
        const response = await authFetch(apiUrl);
        
        console.log('Response received:', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
            headers: {
                'content-type': response.headers.get('content-type')
            }
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                console.log('User not authenticated, showing empty results');
                allBacktests = [];
                displayBacktests();
                return;
            }
            const errorText = await response.text();
            console.error('API Error Response:', errorText);
            throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
        }
        
        const data = await response.json();
        console.log('Data received:', data);
        console.log('Number of backtests:', data.backtests ? data.backtests.length : 0);
        
        allBacktests = data.backtests || [];
        
        if (allBacktests.length > 0) {
            console.log('First backtest:', allBacktests[0]);
            console.log('All backtest IDs:', allBacktests.map(b => b.id));
        } else {
            console.log('No backtests found for this user');
        }
        
        console.log(`✓ Loaded ${allBacktests.length} user backtests`);
        displayBacktests();
        
    } catch (error) {
        console.error('❌ Error loading backtests:', error);
        console.error('Error stack:', error.stack);
        showError('Failed to load backtests: ' + error.message);
    }
}

function displayBacktests() {
    console.log('=== DISPLAYING BACKTESTS ===');
    const container = document.getElementById('backtestsList');
    const searchInput = document.getElementById('backtestSearchInput');
    
    if (!container) {
        console.error('❌ backtestsList container not found!');
        alert('ERROR: backtestsList element missing from HTML!');
        return;
    }
    
    console.log('Container found:', container);
    console.log('Filtered backtests count:', allBacktests.length);
    
    // Get search query
    const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    // Filter backtests by status
    let filtered = allBacktests;
    if (currentFilter !== 'all') {
        filtered = allBacktests.filter(bt => {
            // For now, all backtests are "completed" since we only save successful ones
            return currentFilter === 'completed';
        });
    }
    
    // Filter by search query
    if (searchQuery) {
        filtered = filtered.filter(bt => {
            const config = bt.config || {};
            // Check top-level name (like stock backtests) and config fields
            const topLevelName = (bt.name || '').toLowerCase();
            const backtestName = (config.backtest_name || '').toLowerCase();
            const configName = (config.name || '').toLowerCase();
            const symbol = (config.symbol || '').toLowerCase();
            const strategy = (config.strategy || '').toLowerCase();
            
            // Search in all name fields, symbol, and strategy
            return topLevelName.includes(searchQuery) ||
                   backtestName.includes(searchQuery) ||
                   configName.includes(searchQuery) ||
                   symbol.includes(searchQuery) || 
                   strategy.includes(searchQuery);
        });
    }
    
    console.log('After filter:', filtered.length);
    
    if (filtered.length === 0) {
        console.log('No backtests to display, showing empty state');
        const emptyMessage = searchQuery 
            ? `<p>No backtests found matching "${searchQuery}"</p>`
            : '<p>No backtests yet</p>';
        
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                ${emptyMessage}
                <small>${searchQuery ? 'Try a different search term' : 'Run your first backtest to see results here'}</small>
            </div>
        `;
        return;
    }
    
    console.log('Creating cards for', filtered.length, 'backtests');
    
    // Display backtest cards
    container.innerHTML = filtered.map(bt => createBacktestCard(bt)).join('');
    
    console.log('Cards inserted into container');
    
    // Add event listeners to cards
    filtered.forEach(bt => {
        const card = document.getElementById(`backtest-${bt.backtest_id}`);
        if (card) {
            const viewBtn = card.querySelector('.btn-view');
            const deleteBtn = card.querySelector('.btn-delete');
            
            if (viewBtn) {
                viewBtn.addEventListener('click', () => viewBacktest(bt));
            }
            
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteBacktest(bt.backtest_id);
                });
            }
        }
    });
    
    console.log('✓ Display complete');
}

function createBacktestCard(backtest) {
    const { backtest_id, timestamp, config, results } = backtest;
    
    // Format timestamp
    const date = new Date(timestamp);
    const dateStr = date.toLocaleDateString();
    const timeStr = date.toLocaleTimeString();
    
    // Determine if profitable
    const isProfitable = results.total_pnl > 0;
    const profitClass = isProfitable ? 'profit' : 'loss';
    
    // Use name from top-level (like stock backtests) or fallback to config fields
    const customName = backtest.name || config.name || config.backtest_name || '';
    
    // Use custom backtest name if provided, otherwise fall back to symbol + strategy
    const displayTitle = customName 
        ? customName 
        : `${config.symbol} - ${config.strategy}`;
    
    // Show strategy as subtitle if custom name is used
    const subtitle = customName 
        ? `<small class="backtest-subtitle">${config.symbol} - ${config.strategy}</small>`
        : '';
    
    return `
        <div class="backtest-card" id="backtest-${backtest_id}">
            <div class="backtest-header">
                <div class="backtest-title">
                    <i class="fas fa-chart-line"></i>
                    <div class="title-container">
                        <span class="main-title">${displayTitle}</span>
                        ${subtitle}
                    </div>
                </div>
                <div class="backtest-date">
                    <small>${dateStr} ${timeStr}</small>
                </div>
            </div>
            
            <div class="backtest-summary">
                <div class="summary-item">
                    <span class="summary-label">Period</span>
                    <span class="summary-value">${config.start_date} to ${config.end_date}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Trades</span>
                    <span class="summary-value">${results.total_trades}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Win Rate</span>
                    <span class="summary-value">${results.win_rate.toFixed(1)}%</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Total P&L</span>
                    <span class="summary-value ${profitClass}">
                        ${formatCurrency(results.total_pnl)}
                    </span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Return</span>
                    <span class="summary-value ${profitClass}">
                        ${results.total_return.toFixed(2)}%
                    </span>
                </div>
            </div>
            
            <div class="backtest-actions">
                <button class="btn-view btn-secondary">
                    <i class="fas fa-eye"></i>
                    View Details
                </button>
                <button class="btn-delete btn-secondary delete-btn">
                    <i class="fas fa-trash"></i>
                    Delete
                </button>
            </div>
        </div>
    `;
}

function viewBacktest(backtest) {
    console.log('Viewing backtest:', backtest.backtest_id);
    
    const modal = document.getElementById('backtestDetailModal');
    
    // Populate statistics
    document.getElementById('detailTotalTrades').textContent = backtest.results.total_trades;
    document.getElementById('detailWinRate').textContent = `${backtest.results.win_rate.toFixed(1)}%`;
    document.getElementById('detailTotalPL').textContent = formatCurrency(backtest.results.total_pnl);
    document.getElementById('detailMaxDrawdown').textContent = `${backtest.results.max_drawdown.toFixed(2)}%`;
    document.getElementById('detailReturnPct').textContent = `${backtest.results.total_return.toFixed(2)}%`;
    
    // TODO: Load actual trade data from CSV
    // For now, show placeholder
    const tbody = document.getElementById('detailTradesTableBody');
    tbody.innerHTML = '<tr><td colspan="8">Trade details available in CSV download</td></tr>';
    
    // Show modal
    modal.style.display = 'block';
}

async function deleteBacktest(backtestId) {
    if (!confirm('Are you sure you want to delete this backtest? This cannot be undone.')) {
        return;
    }
    
    try {
        const response = await authFetch(`${API_BASE_URL}/backtests/${backtestId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('Deleted backtest:', result);
        
        // Reload backtests
        await loadBacktests();
        
    } catch (error) {
        console.error('Error deleting backtest:', error);
        showError('Failed to delete backtest: ' + error.message);
    }
}

function formatCurrency(value) {
    if (value === null || value === undefined) return 'N/A';
    const formatted = Math.abs(value).toFixed(2);
    return value >= 0 ? `$${formatted}` : `-$${formatted}`;
}

function showError(message) {
    alert(message); // Simple error display for now
}
