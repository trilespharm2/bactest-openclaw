// Configuration
const API_BASE_URL = `http://${window.location.hostname}:${window.location.port}/api`;

// Global state
let allResults = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Results page loaded');
    loadResults();
});

// Load all backtest results (user-specific)
async function loadResults() {
    console.log('📊 Loading user backtest results from:', `${API_BASE_URL}/my/backtests/options`);
    
    try {
        const response = await authFetch(`${API_BASE_URL}/my/backtests/options`);
        
        if (!response.ok) {
            if (response.status === 401) {
                console.log('User not authenticated, showing empty results');
                allResults = [];
                displayResults();
                updateStats();
                return;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        allResults = data.backtests || [];
        
        console.log(`✅ Loaded ${allResults.length} user backtest results`);
        console.log('📋 Results before sorting:');
        allResults.forEach((r, i) => {
            console.log(`  ${i+1}. ${r.config?.strategy || r.strategy} - ${r.id} - ${r.created_at || r.timestamp}`);
        });
        
        displayResults();
        updateStats();
        
    } catch (error) {
        console.error('❌ Error loading results:', error);
        showError('Failed to load backtest results: ' + error.message);
    }
}

// Display results grid
function displayResults() {
    const grid = document.getElementById('resultsGrid');
    
    if (!grid) {
        console.error('resultsGrid element not found!');
        return;
    }
    
    if (allResults.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <h3>No Results Yet</h3>
                <p>Run your first backtest to see results here</p>
            </div>
        `;
        return;
    }
    
    // Sort by timestamp - newest first (client-side backup)
    allResults.sort((a, b) => {
        const timeA = new Date(a.timestamp || 0).getTime();
        const timeB = new Date(b.timestamp || 0).getTime();
        return timeB - timeA; // Descending order
    });
    
    console.log('📋 Results after sorting (newest first):');
    allResults.forEach((r, i) => {
        console.log(`  ${i+1}. ${r.config?.strategy} - ${r.id} - ${r.timestamp}`);
    });
    
    grid.innerHTML = allResults.map(result => createResultCard(result)).join('');
}

// Create result card HTML
function createResultCard(result) {
    console.log('Creating card for:', result);
    
    // Handle different metadata structures
    const id = result.id || result.backtest_id || 'unknown';
    const timestamp = result.timestamp || new Date().toISOString();
    const config = result.config || {};
    const summary = result.summary || {};
    const status = result.status || 'completed';
    
    // Extract values with fallbacks
    const strategy = config.strategy || config.type || 'Options Strategy';
    const symbol = config.symbol || 'SPX';
    const totalTrades = summary.total_trades || summary.trades || 0;
    const winRate = summary.win_rate || summary.win_rate_pct || 0;
    const totalPnl = summary.total_pnl || summary.pnl || summary.total_profit || 0;
    const profitFactor = summary.profit_factor || summary.pf || 0;
    const maxDrawdown = summary.max_drawdown || summary.dd || 0;
    const totalReturn = summary.total_return || summary.return_pct || 0;
    
    // Format date
    const date = new Date(timestamp);
    const dateStr = date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // Handle running/loading state
    if (status === 'running') {
        return `
            <div class="result-card result-card-loading" onclick="showDetail('${id}')">
                <div class="result-header">
                    <div class="result-info">
                        <h3>${strategy} - ${symbol}</h3>
                        <div class="result-id">${id}</div>
                    </div>
                    <div class="result-meta">
                        <div class="result-date">${dateStr}</div>
                        <span class="status-badge status-running">
                            <span class="loading-dot"></span>
                            Running
                        </span>
                    </div>
                </div>
                
                <div class="result-loading-content">
                    <div class="loading-spinner-small"></div>
                    <p>Backtest in progress...</p>
                    <p class="loading-hint">Click to view progress</p>
                </div>
            </div>
        `;
    }
    
    // Handle error state
    if (status === 'error') {
        return `
            <div class="result-card result-card-error" onclick="showDetail('${id}')">
                <div class="result-header">
                    <div class="result-info">
                        <h3>${strategy} - ${symbol}</h3>
                        <div class="result-id">${id}</div>
                    </div>
                    <div class="result-meta">
                        <div class="result-date">${dateStr}</div>
                        <span class="status-badge status-error">Failed</span>
                    </div>
                </div>
                
                <div class="result-error-content">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Backtest failed</p>
                </div>
            </div>
        `;
    }
    
    // Format P&L for completed backtests
    const pnl = parseFloat(totalPnl) || 0;
    const pnlClass = pnl >= 0 ? 'positive' : 'negative';
    const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
    
    return `
        <div class="result-card" onclick="showDetail('${id}')">
            <div class="result-header">
                <div class="result-info">
                    <h3>${strategy} - ${symbol}</h3>
                    <div class="result-id">${id}</div>
                </div>
                <div class="result-meta">
                    <div class="result-date">${dateStr}</div>
                    <span class="status-badge">Completed</span>
                </div>
            </div>
            
            <div class="result-stats">
                <div class="stat-item">
                    <span class="stat-item-label">Total Trades</span>
                    <span class="stat-item-value">${totalTrades}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-item-label">Win Rate</span>
                    <span class="stat-item-value">${parseFloat(winRate || 0).toFixed(1)}%</span>
                </div>
                <div class="stat-item">
                    <span class="stat-item-label">Total P&L</span>
                    <span class="stat-item-value ${pnlClass}">${pnlStr}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-item-label">Profit Factor</span>
                    <span class="stat-item-value">${parseFloat(profitFactor || 0).toFixed(2)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-item-label">Max Drawdown</span>
                    <span class="stat-item-value negative">${parseFloat(maxDrawdown || 0).toFixed(2)}%</span>
                </div>
                <div class="stat-item">
                    <span class="stat-item-label">Total Return</span>
                    <span class="stat-item-value ${pnlClass}">${parseFloat(totalReturn || 0).toFixed(2)}%</span>
                </div>
            </div>
        </div>
    `;
}

// Update summary stats
function updateStats() {
    const totalBacktests = allResults.length;
    
    let totalTrades = 0;
    
    allResults.forEach(r => {
        const summary = r.summary || {};
        const trades = summary.total_trades || summary.trades || 0;
        totalTrades += trades;
    });
    
    const totalBacktestsEl = document.getElementById('totalBacktests');
    const totalTradesEl = document.getElementById('totalTrades');
    
    if (totalBacktestsEl) totalBacktestsEl.textContent = totalBacktests;
    if (totalTradesEl) totalTradesEl.textContent = totalTrades;
}

// Show detail modal
async function showDetail(backtestId) {
    console.log('📋 Loading details for:', backtestId);
    
    const modal = document.getElementById('detailModal');
    const modalBody = document.getElementById('modalBody');
    const modalTitle = document.getElementById('modalTitle');
    
    if (!modal || !modalBody || !modalTitle) {
        console.error('Modal elements not found!');
        return;
    }
    
    // Add hash to URL so back button closes modal instead of leaving page
    history.pushState({modal: true, backtestId}, '', `#backtest-${backtestId}`);
    
    modal.style.display = 'block';
    modalBody.innerHTML = `
        <div class="loading">
            <i class="fas fa-spinner"></i>
            <p>Loading backtest details...</p>
        </div>
    `;
    
    try {
        // Find result in our data
        const result = allResults.find(r => {
            const rid = r.id || r.backtest_id;
            return rid === backtestId;
        });
        
        if (!result) {
            console.error('Result not found for ID:', backtestId);
            console.log('Available IDs:', allResults.map(r => r.id || r.backtest_id));
            throw new Error(`Backtest not found: ${backtestId}`);
        }
        
        const config = result.config || {};
        const summary = result.summary || {};
        const strategy = config.strategy || config.type || 'Options Strategy';
        const symbol = config.symbol || 'SPX';
        
        modalTitle.textContent = `${strategy} - ${symbol} - ${backtestId}`;
        
        // Build equity curve URL
        const equityCurveUrl = `${API_BASE_URL}/files/equity-curve/${backtestId}`;
        
        // Try to load trade log CSV
        let tradesTableHTML = '';
        try {
            const csvUrl = `${API_BASE_URL}/files/trade-log/${backtestId}`;
            const csvResponse = await authFetch(csvUrl);
            
            if (csvResponse.ok) {
                const csvText = await csvResponse.text();
                const trades = parseCSV(csvText);
                
                tradesTableHTML = `
                    <div class="detail-section">
                        <h4>Trade Log (${trades.length} trades)</h4>
                        <div class="trades-table" style="overflow-x: auto;">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Entry Date</th>
                                        <th>Entry Time</th>
                                        <th>Underlying</th>
                                        <th>Exit Date</th>
                                        <th>Exit Time</th>
                                        <th>Strategy</th>
                                        <th>Contracts</th>
                                        <th>Entry Premium</th>
                                        <th>Exit Premium</th>
                                        <th>P&L</th>
                                        <th>Exit Reason</th>
                                        <th>DTE</th>
                                        <th>DIT</th>
                                        <th>Leg 1 Symbol</th>
                                        <th>Leg 1 Strike</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${trades.map(trade => {
                                        const pnl = parseFloat(trade.pnl || trade.profit || trade.pl || 0);
                                        const pnlClass = pnl >= 0 ? 'positive' : 'negative';
                                        return `
                                            <tr>
                                                <td>${trade.entry_date || 'N/A'}</td>
                                                <td>${trade.entry_time || 'N/A'}</td>
                                                <td>$${parseFloat(trade.underlying_price || 0).toFixed(2)}</td>
                                                <td>${trade.exit_date || 'N/A'}</td>
                                                <td>${trade.exit_time || 'N/A'}</td>
                                                <td>${trade.strategy || 'N/A'}</td>
                                                <td>${trade.num_contracts || trade.contracts || 'N/A'}</td>
                                                <td>$${Math.abs(parseFloat(trade.net_premium_entry || trade.entry_premium || 0)).toFixed(2)}</td>
                                                <td>$${Math.abs(parseFloat(trade.net_premium_exit || trade.exit_premium || 0)).toFixed(2)}</td>
                                                <td class="${pnlClass}">$${pnl.toFixed(2)}</td>
                                                <td>${trade.exit_reason || 'N/A'}</td>
                                                <td>${trade.dte || 0}</td>
                                                <td>${trade.dit || 0}</td>
                                                <td>${trade.leg1_symbol || 'N/A'}</td>
                                                <td>$${parseFloat(trade.leg1_strike || 0).toFixed(2)}</td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                        <button class="download-btn" onclick="downloadCSV('${backtestId}')">
                            <i class="fas fa-download"></i> Download Full Trade Log CSV
                        </button>
                    </div>
                `;
            } else {
                tradesTableHTML = `
                    <div class="detail-section">
                        <h4>Trade Log</h4>
                        <p style="color:#888;">Trade log not available</p>
                    </div>
                `;
            }
        } catch (csvError) {
            console.error('Error loading CSV:', csvError);
            tradesTableHTML = `
                <div class="detail-section">
                    <h4>Trade Log</h4>
                    <p style="color:#f44336;">Error loading trade log: ${csvError.message}</p>
                </div>
            `;
        }
        
        // Helper function to format entry days
        const formatEntryDays = (days) => {
            if (!days || days.length === 0) return 'All days';
            const dayNames = {1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri'};
            return days.map(d => dayNames[d] || d).join(', ');
        };
        
        // Helper function to format PDT rule
        const formatPDTRule = (rule) => {
            const rules = {
                'avoid': 'Avoid PDT',
                'allow_tp': 'Allow if Take Profit',
                'allow_sl': 'Allow if Stop Loss',
                'ignore': 'Ignore (Allow All)'
            };
            return rules[rule] || rule;
        };
        
        // Helper function to format bar size
        const formatBarSize = (bars) => {
            if (!bars) return '5 minutes';
            if (bars === 0.25) return '15 seconds';
            if (bars < 1) return `${bars * 60} seconds`;
            return bars === 1 ? '1 minute' : `${bars} minutes`;
        };
        
        // Build detail HTML with ALL 16 configuration fields
        modalBody.innerHTML = `
            <div class="detail-grid">
                <div class="detail-section">
                    <h4>Basic Settings</h4>
                    <p><strong>1. Symbol:</strong> ${config.symbol || 'SPX'}</p>
                    <p><strong>2. Expiration:</strong> ${config.dte === 0 ? '0DTE' : config.dte === 1 ? 'Next Day' : `${config.dte} DTE`}</p>
                    <p><strong>3. Strategy:</strong> ${config.strategy || config.type || 'N/A'}</p>
                </div>
                
                <div class="detail-section">
                    <h4>Backtest Period</h4>
                    <p><strong>8. Start Date:</strong> ${config.start_date || config.from_date || 'N/A'}</p>
                    <p><strong>9. End Date:</strong> ${config.end_date || config.to_date || 'N/A'}</p>
                </div>
            </div>
            
            <div class="detail-grid">
                <div class="detail-section">
                    <h4>Capital & Allocation</h4>
                    <p><strong>5. Initial Capital:</strong> $${(config.initial_capital || config.capital || 100000).toLocaleString()}</p>
                    <p><strong>6. Allocation Type:</strong> ${
                        config.allocation_type === 'percentage' || config.allocation_type === 'pct' || config.allocation_type === '1' || config.allocation_type === 1 ? 'Percentage of Capital' : 
                        config.allocation_type === 'fixed' || config.allocation_type === '3' || config.allocation_type === 3 ? 'Fixed Amount' : 
                        config.allocation_type === 'contracts' || config.allocation_type === '2' || config.allocation_type === 2 ? 'Number of Contracts' :
                        'Percentage of Capital'
                    }</p>
                    <p><strong>7. Allocation Value:</strong> ${config.allocation_value || 10}${
                        config.allocation_type === 'percentage' || config.allocation_type === 'pct' || config.allocation_type === '1' || config.allocation_type === 1 ? '%' : 
                        config.allocation_type === 'contracts' || config.allocation_type === '2' || config.allocation_type === 2 ? ' contracts' : 
                        config.allocation_type === 'fixed' || config.allocation_type === '3' || config.allocation_type === 3 ? ' dollars' : 
                        '%'
                    }</p>
                </div>
                
                <div class="detail-section">
                    <h4>Entry Settings</h4>
                    <p><strong>10. Entry Time:</strong> ${config.entry_time || '10:00'} (Market Hours)</p>
                    <p><strong>11. Entry Days:</strong> ${formatEntryDays(config.entry_days)}</p>
                </div>
            </div>
            
            <div class="detail-grid">
                <div class="detail-section">
                    <h4>Exit Settings</h4>
                    <p><strong>12. Take Profit:</strong> ${config.take_profit_pct || 50}%</p>
                    <p><strong>13. Stop Loss:</strong> ${config.stop_loss_pct || 200}%</p>
                </div>
                
                <div class="detail-section">
                    <h4>Detection Settings</h4>
                    <p><strong>14. Detection Bar Size:</strong> ${formatBarSize(config.detection_bar_size || config.detection_bars)}</p>
                </div>
            </div>
            
            <div class="detail-grid">
                <div class="detail-section">
                    <h4>Trading Rules</h4>
                    <p><strong>15. PDT Rule:</strong> ${
                        // Handle boolean avoid_pdt
                        config.avoid_pdt === true || config.avoid_pdt === 'true' || config.avoid_pdt === 'y' ? 'Not allow Day trades' :
                        config.avoid_pdt === false || config.avoid_pdt === 'false' || config.avoid_pdt === 'n' ? 'Allow Day trades' :
                        formatPDTRule(config.pdt_rule || config.pdt_avoidance || 'avoid')
                    }</p>
                    <p><strong>16. Concurrent Trades:</strong> ${config.concurrent_trades ? 'Yes - Allow multiple open' : 'No - Close before new trade'}</p>
                </div>
                
                <div class="detail-section">
                    <h4>Leg Criteria (Field 4)</h4>
                    ${config.legs && Object.keys(config.legs).length > 0 ? 
                        Object.keys(config.legs).map(legName => {
                            const leg = config.legs[legName];
                            if (!leg || typeof leg !== 'object') return '';
                            
                            // Format leg criteria based on type
                            let criteriaText = '';
                            
                            // Handle backend structure: {"config_type":"pct_underlying","params":{"direction":"below","pct":3}}
                            if (leg.config_type === 'pct_underlying' && leg.params) {
                                const dir = leg.params.direction || 'below';
                                const pct = leg.params.pct || leg.params.value || 0;
                                criteriaText = `${pct}% ${dir} underlying`;
                            }
                            else if (leg.config_type === 'dollar_underlying' && leg.params) {
                                const dir = leg.params.direction || 'below';
                                const dollars = leg.params.dollars || leg.params.value || 0;
                                criteriaText = `$${dollars} ${dir} underlying`;
                            }
                            else if (leg.config_type === 'mid_price' && leg.params) {
                                const min = leg.params.min || 0;
                                const max = leg.params.max || 0;
                                criteriaText = `Mid Price: $${min} - $${max}`;
                            }
                            else if (leg.config_type === 'pct_from_leg' && leg.params) {
                                const dir = leg.params.direction || 'below';
                                const pct = leg.params.pct || 0;
                                const refLeg = leg.params.reference_leg || 'other leg';
                                criteriaText = `${pct}% ${dir} ${refLeg}`;
                            }
                            else if (leg.config_type === 'dollar_from_leg' && leg.params) {
                                const dir = leg.params.direction || 'below';
                                const dollars = leg.params.dollars || 0;
                                const refLeg = leg.params.reference_leg || 'other leg';
                                criteriaText = `$${dollars} ${dir} ${refLeg}`;
                            }
                            // Handle frontend structure (for compatibility)
                            else if (leg.midPrice) {
                                criteriaText = `Mid Price: $${leg.midPrice.min} - $${leg.midPrice.max}`;
                            } else if (leg.percentDistance) {
                                const dir = leg.percentDistance.direction === 'above' ? 'above' : 'below';
                                criteriaText = `${leg.percentDistance.value}% ${dir} underlying`;
                            } else if (leg.dollarDistance) {
                                const dir = leg.dollarDistance.direction === 'above' ? 'above' : 'below';
                                criteriaText = `$${leg.dollarDistance.value} ${dir} underlying`;
                            } else if (leg.dollarFromLeg) {
                                const dir = leg.dollarFromLeg.direction === 'above' ? 'above' : 'below';
                                criteriaText = `$${leg.dollarFromLeg.value} ${dir} ${leg.dollarFromLeg.leg}`;
                            } else if (leg.percentFromLeg) {
                                const dir = leg.percentFromLeg.direction === 'above' ? 'above' : 'below';
                                criteriaText = `${leg.percentFromLeg.value}% ${dir} ${leg.percentFromLeg.leg}`;
                            } 
                            // Fallback
                            else if (leg.criteria_type || leg.criteriaType) {
                                const ct = leg.criteria_type || leg.criteriaType;
                                const val = leg.value || leg.strike || leg.delta || 'N/A';
                                criteriaText = `${ct} = ${val}`;
                            } else {
                                // Show minimal info if unknown structure
                                criteriaText = `${leg.config_type || 'Configuration'}: ${JSON.stringify(leg.params || {})}`;
                            }
                            
                            return `<p><strong>${legName || leg.name || 'Leg'}:</strong> ${criteriaText}</p>`;
                        }).filter(Boolean).join('') || '<p>No leg criteria configured</p>'
                    : '<p>No leg criteria configured</p>'}
                </div>
            </div>
            
            <div class="detail-section">
                <h4>Performance Summary</h4>
                <div class="detail-grid" style="grid-template-columns: repeat(3, 1fr);">
                    <p><strong>Total Trades:</strong> ${summary.total_trades || summary.trades || 0}</p>
                    <p><strong>Win Rate:</strong> ${parseFloat(summary.win_rate || summary.win_rate_pct || 0).toFixed(1)}%</p>
                    <p><strong>Total P&L:</strong> $${parseFloat(summary.total_pnl || summary.pnl || 0).toFixed(2)}</p>
                    <p><strong>Average Win:</strong> $${parseFloat(summary.avg_win || 0).toFixed(2)}</p>
                    <p><strong>Average Loss:</strong> $${parseFloat(summary.avg_loss || 0).toFixed(2)}</p>
                    <p><strong>Profit Factor:</strong> ${parseFloat(summary.profit_factor || summary.pf || 0).toFixed(2)}</p>
                    <p><strong>Max Drawdown:</strong> ${parseFloat(summary.max_drawdown || summary.dd || 0).toFixed(2)}%</p>
                    <p><strong>Total Return:</strong> ${parseFloat(summary.total_return || summary.return_pct || 0).toFixed(2)}%</p>
                    <p><strong>Final Capital:</strong> $${parseFloat(summary.final_capital || 0).toLocaleString()}</p>
                </div>
            </div>
            
            <div class="detail-section">
                <h4>Equity Curve</h4>
                <img src="${equityCurveUrl}?${Date.now()}" class="equity-curve" alt="Equity Curve" 
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                <p style="display:none;color:#888;text-align:center;padding:40px;">Equity curve image not available</p>
            </div>
            
            ${tradesTableHTML}
        `;
        
    } catch (error) {
        console.error('❌ Error loading details:', error);
        modalBody.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #f44336;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 15px;"></i>
                <p><strong>Error loading backtest details</strong></p>
                <p>${error.message}</p>
                <small>Backtest ID: ${backtestId}</small>
            </div>
        `;
    }
}

// Close modal
function closeModal() {
    const modal = document.getElementById('detailModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = ''; // Re-enable scrolling
        
        // Remove hash from URL without adding to history
        if (window.location.hash) {
            history.replaceState('', document.title, window.location.pathname + window.location.search);
        }
    }
}

// Close modal on background click
window.onclick = function(event) {
    const modal = document.getElementById('detailModal');
    if (event.target === modal) {
        closeModal();
    }
}

// Parse CSV text to array of objects
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim());
    const trades = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const trade = {};
        headers.forEach((header, index) => {
            trade[header] = values[index]?.trim() || '';
        });
        trades.push(trade);
    }
    
    return trades;
}

// Download CSV
function downloadCSV(backtestId) {
    const url = `${API_BASE_URL}/files/trade-log/${backtestId}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `trade_log_${backtestId}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Show error message
function showError(message) {
    const grid = document.getElementById('resultsGrid');
    if (grid) {
        grid.innerHTML = `
            <div style="text-align: center; padding: 60px; color: #f44336;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 15px;"></i>
                <h3>Error Loading Results</h3>
                <p>${message}</p>
            </div>
        `;
    }
}

// Handle browser back button - close modal instead of navigating away
window.addEventListener('popstate', function(event) {
    const modal = document.getElementById('detailModal');
    if (modal && modal.style.display === 'block') {
        // Modal is open, close it instead of going back
        modal.style.display = 'none';
        document.body.style.overflow = '';
        
        // If URL still has hash, remove it
        if (window.location.hash) {
            history.pushState('', document.title, window.location.pathname + window.location.search);
        }
    }
    // If modal is not open, let the browser navigate normally
});
