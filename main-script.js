// Main Dashboard JavaScript

// API Configuration - Dynamic to work with any port
const API_BASE_URL = `${window.location.protocol}//${window.location.host}/api`;

// State
let currentPage = 'home';
let apiKeyConfigured = false;

// DOM Elements
const sidebar = document.querySelector('.sidebar');
const navItems = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.page');
const pageTitle = document.getElementById('pageTitle');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
const apiStatusIcon = document.getElementById('apiStatusIcon');
const apiStatusText = document.getElementById('apiStatusText');

// Track loaded scripts to prevent duplicates
const loadedScripts = new Set();

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('Dashboard initializing...');
    
    // Load saved API key
    const savedApiKey = localStorage.getItem('polygonApiKey');
    if (savedApiKey) {
        if (apiKeyInput) apiKeyInput.value = savedApiKey;
        apiKeyConfigured = true;
        updateAPIStatus(true);
    } else {
        updateAPIStatus(false);
    }
    
    // Set default dates for forms (will be called when pages load)
    setDefaultDates();
    
    // Event Listeners
    setupNavigation();
    setupAPIKey();
    setupQuickLinks();
    setupFooterLinks();
    setupFAQAccordion();
    setupContactForm();
    setupProfileDropdown();
    setupMobileMenu();
    
    // Check for URL parameters to navigate to specific section
    const urlParams = new URLSearchParams(window.location.search);
    const section = urlParams.get('section');
    
    if (section) {
        navigateToPage(section);
    } else {
        loadPageContent('home');
    }
});

// Setup Profile Dropdown
function setupProfileDropdown() {
    const profileBtn = document.getElementById('profileBtn');
    const profileMenu = document.getElementById('profileMenu');
    
    if (profileBtn && profileMenu) {
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            profileMenu.classList.toggle('show');
        });
        
        document.addEventListener('click', (e) => {
            if (!profileBtn.contains(e.target) && !profileMenu.contains(e.target)) {
                profileMenu.classList.remove('show');
            }
        });
    }
}

// Setup Mobile Menu (Hamburger)
function setupMobileMenu() {
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const mobileOverlay = document.getElementById('mobileOverlay');
    const sidebar = document.querySelector('.sidebar');
    
    if (hamburgerBtn && sidebar) {
        hamburgerBtn.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
            if (mobileOverlay) {
                mobileOverlay.classList.toggle('active');
            }
        });
    }
    
    if (mobileOverlay) {
        mobileOverlay.addEventListener('click', () => {
            sidebar.classList.remove('mobile-open');
            mobileOverlay.classList.remove('active');
        });
    }
}

// Setup Navigation
function setupNavigation() {
    // Sidebar navigation
    navItems.forEach(item => {
        const link = item.querySelector('.nav-link');
        
        // Handle dropdown toggle
        if (item.classList.contains('has-dropdown') && !item.classList.contains('disabled')) {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                item.classList.toggle('active');
            });
        }
        
        // Handle direct page links
        const pageAttr = item.getAttribute('data-page');
        if (pageAttr) {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                navigateToPage(pageAttr);
            });
        }
    });
    
    // Dropdown menu items
    document.querySelectorAll('.dropdown-menu li').forEach(item => {
        const pageAttr = item.getAttribute('data-page');
        if (pageAttr) {
            item.querySelector('a').addEventListener('click', (e) => {
                e.preventDefault();
                navigateToPage(pageAttr);
            });
        }
    });
    
    // Header icon navigation
    document.querySelectorAll('.header-icon-btn[data-page]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            navigateToPage(btn.getAttribute('data-page'));
        });
    });
}

// Navigate to Page
function navigateToPage(pageName, skipPushState = false) {
    console.log('Navigating to:', pageName);
    
    if (pageName === currentPage && !skipPushState) return;
    
    // Update current page
    currentPage = pageName;
    
    // Update URL without page reload (unless triggered by popstate)
    if (!skipPushState) {
        const newUrl = pageName === 'home' 
            ? '/dashboard' 
            : `/dashboard?section=${pageName}`;
        history.pushState({ page: pageName }, '', newUrl);
    }
    
    // Update nav active states
    navItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-page') === pageName) {
            item.classList.add('active');
        }
    });
    
    // Update dropdown menu active states
    document.querySelectorAll('.dropdown-menu li').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-page') === pageName) {
            item.classList.add('active');
            // Expand parent dropdown
            const parentDropdown = item.closest('.has-dropdown');
            if (parentDropdown) {
                parentDropdown.classList.add('active');
            }
        }
    });
    
    // Update page title
    const pageTitles = {
        'home': 'Home',
        'dashboard': 'Dashboard',
        'stocks': 'Stocks OHLCV Data',
        'options': 'Options OHLCV Data',
        'backtester': 'Options Strategy Backtester',
        'stockBacktester': 'Stock Backtester V3.0',
        'results': 'Results',
        'subscription': 'Subscription',
        'billing': 'Subscription',
        'plans': 'Subscription',
        'settings': 'Settings',
        'notifications': 'Notifications',
        'terms': 'Terms of Service',
        'privacy': 'Privacy Policy',
        'faq': 'FAQ',
        'contact': 'Contact Us'
    };
    if (pageTitle) {
        pageTitle.textContent = pageTitles[pageName] || 'Dashboard';
    }
    
    // Load page content
    loadPageContent(pageName);
}

// Handle browser back/forward buttons
window.addEventListener('popstate', (event) => {
    const pageName = event.state?.page || new URLSearchParams(window.location.search).get('section') || 'home';
    navigateToPage(pageName, true);
});

// Load Page Content
async function loadPageContent(pageName) {
    console.log('Loading page content for:', pageName);
    
    // Hide all pages
    pages.forEach(page => page.classList.remove('active'));
    
    // Get target page element
    const targetPage = document.getElementById(`${pageName}Page`);
    if (!targetPage) {
        console.error('Page element not found:', `${pageName}Page`);
        return;
    }
    
    // If page content needs to be loaded (not home page)
    if (pageName !== 'home') {
        // Check if content is already loaded
        const hasContent = targetPage.innerHTML.trim() !== '' && 
                          !targetPage.innerHTML.includes('error-message');
        
        if (!hasContent) {
            console.log('Fetching content for:', pageName);
            try {
                // Map page name to file name (handle special cases)
                let fileName = pageName;
                let scriptName = `${pageName}-script.js`;
                
                if (pageName === 'stockBacktester') {
                    fileName = 'stock-backtester';
                    scriptName = 'stock-backtester-script.js';
                } else if (pageName === 'simulatedTrading') {
                    fileName = 'simulated-trading';
                    scriptName = 'simulated-trading-script.js';
                }
                
                const response = await fetch(`${fileName}.html`);
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const html = await response.text();
                console.log('Loaded HTML length:', html.length);
                targetPage.innerHTML = html;
                
                // Load page-specific script if not already loaded
                if (!loadedScripts.has(pageName)) {
                    console.log('Loading script for:', pageName);
                    await loadScript(scriptName, pageName);
                } else {
                    // Script already loaded, just initialize
                    console.log('Script already loaded, initializing:', pageName);
                    initializePage(pageName);
                }
                
            } catch (error) {
                console.error(`Error loading ${pageName} page:`, error);
                targetPage.innerHTML = `
                    <div class="error-message">
                        <strong>Error loading page content</strong><br>
                        ${error.message}<br>
                        <small>Check browser console for details</small>
                    </div>
                `;
            }
        } else {
            console.log('Content already loaded for:', pageName);
            // Content is already there, check if it needs script loading
            const inlinePages = ['backtester', 'stockBacktester', 'simulatedTrading'];
            if (inlinePages.includes(pageName) && !loadedScripts.has(pageName)) {
                // Load script for inline page
                let scriptName = `${pageName}-script.js`;
                if (pageName === 'stockBacktester') {
                    scriptName = 'stock-backtester-script.js';
                } else if (pageName === 'simulatedTrading') {
                    scriptName = 'simulated-trading-script.js';
                }
                console.log('Loading script for inline content:', pageName);
                await loadScript(scriptName, pageName);
            } else if (loadedScripts.has(pageName)) {
                initializePage(pageName);
            }
        }
    }
    
    // Show target page
    targetPage.classList.add('active');
    console.log('Page now visible:', pageName);
    
    // Initialize dashboard charts when home page loads
    if (pageName === 'home') {
        initDashboardCharts();
    }
}

// Load Script Helper
function loadScript(src, pageName) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
            console.log('Script loaded successfully:', src);
            loadedScripts.add(pageName);
            initializePage(pageName);
            resolve();
        };
        script.onerror = () => {
            console.error('Script failed to load:', src);
            reject(new Error(`Failed to load script: ${src}`));
        };
        document.body.appendChild(script);
    });
}

// Initialize Page
function initializePage(pageName) {
    console.log('Initializing page:', pageName);
    try {
        if (pageName === 'dashboard' && typeof initDashboard === 'function') {
            initDashboard();
        } else if (pageName === 'stocks' && typeof initializeStocksPage === 'function') {
            initializeStocksPage();
        } else if (pageName === 'options' && typeof initializeOptionsPage === 'function') {
            initializeOptionsPage();
        } else if (pageName === 'backtester' && typeof initializeBacktesterPage === 'function') {
            initializeBacktesterPage();
        } else if (pageName === 'stockBacktester' && typeof initializeStockBacktesterPage === 'function') {
            initializeStockBacktesterPage();
        } else if (pageName === 'my-backtests' && typeof initializeMyBacktestsPage === 'function') {
            initializeMyBacktestsPage();
        } else if (pageName === 'results' && typeof initializeResultsPage === 'function') {
            initializeResultsPage();
        } else if (pageName === 'billing' && typeof initBillingPage === 'function') {
            initBillingPage();
        } else if (pageName === 'subscription' && typeof initSubscriptionPage === 'function') {
            initSubscriptionPage();
        } else if (pageName === 'simulatedTrading' && typeof initSimulatedTrading === 'function') {
            initSimulatedTrading();
        }
    } catch (error) {
        console.error(`Error initializing ${pageName} page:`, error);
    }
}

// Setup API Key
function setupAPIKey() {
    if (!saveApiKeyBtn || !apiKeyInput) return;
    
    saveApiKeyBtn.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            localStorage.setItem('polygonApiKey', apiKey);
            apiKeyConfigured = true;
            updateAPIStatus(true);
            showNotification('API key saved successfully', 'success');
        } else {
            showNotification('Please enter a valid API key', 'error');
        }
    });
    
    // Auto-save on change
    apiKeyInput.addEventListener('change', () => {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            localStorage.setItem('polygonApiKey', apiKey);
            apiKeyConfigured = true;
            updateAPIStatus(true);
        }
    });
}

// Update API Status
function updateAPIStatus(isConnected) {
    if (!apiStatusIcon || !apiStatusText) return;
    
    if (isConnected) {
        apiStatusIcon.classList.add('connected');
        apiStatusIcon.classList.remove('disconnected');
        apiStatusText.textContent = 'API Connected';
    } else {
        apiStatusIcon.classList.add('disconnected');
        apiStatusIcon.classList.remove('connected');
        apiStatusText.textContent = 'API Not Configured';
    }
}

// Setup Quick Links
function setupQuickLinks() {
    document.querySelectorAll('.quick-link-card[data-navigate], .clickable-card[data-navigate]').forEach(card => {
        card.addEventListener('click', () => {
            const target = card.getAttribute('data-navigate');
            navigateToPage(target);
        });
    });
}

// Setup Footer Links
function setupFooterLinks() {
    document.querySelectorAll('.footer-link[data-page]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.getAttribute('data-page');
            navigateToPage(target);
        });
    });
}

// Setup FAQ Accordion
function setupFAQAccordion() {
    document.querySelectorAll('.faq-question').forEach(question => {
        question.addEventListener('click', () => {
            const faqItem = question.parentElement;
            faqItem.classList.toggle('active');
        });
    });
}

// Setup Contact Form
function setupContactForm() {
    const form = document.getElementById('contactForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            showNotification('Message sent successfully! We will get back to you soon.', 'success');
            form.reset();
        });
    }
}

// Set Default Dates
function setDefaultDates() {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Store for later use when pages load
    window.defaultFromDate = formatDate(thirtyDaysAgo);
    window.defaultToDate = formatDate(today);
}

// Format Date
function formatDate(date) {
    return date.toISOString().split('T')[0];
}

// Show Notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${type === 'success' ? '#10b981' : '#ef4444'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Get API Key
function getAPIKey() {
    return localStorage.getItem('polygonApiKey') || '';
}

// Utility: Format Number
function formatNumber(num, decimals = 2) {
    if (num === undefined || num === null) return 'N/A';
    return num.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

// Utility: Format Timestamp
function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', { timeZone: 'America/New_York' });
}

// Utility: Download File
function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// ==================== DASHBOARD CHARTS ====================
let optionsChart = null;
let stocksChart = null;
let bestOptionsBacktest = null;
let bestStockBacktest = null;

// Initialize Dashboard Charts
function initDashboardCharts() {
    loadBestBacktests();
    loadWatchlist();
    loadEconomicCalendar();
    startGainersLosersRefresh();
    setupClickableCharts();
}

// Setup clickable chart cards
function setupClickableCharts() {
    const optionsCard = document.getElementById('optionsPerformanceCard');
    const stocksCard = document.getElementById('stocksPerformanceCard');
    
    if (optionsCard) {
        optionsCard.addEventListener('click', () => {
            if (bestOptionsBacktest && bestOptionsBacktest.id) {
                showPage('backtestResults');
                // Navigate to specific backtest result
                setTimeout(() => {
                    const resultItem = document.querySelector(`[data-backtest-id="${bestOptionsBacktest.id}"]`);
                    if (resultItem) resultItem.click();
                }, 100);
            } else {
                showPage('backtestResults');
            }
        });
    }
    
    if (stocksCard) {
        stocksCard.addEventListener('click', () => {
            if (bestStockBacktest && bestStockBacktest.id) {
                showPage('stocksResults');
                // Navigate to specific backtest result
                setTimeout(() => {
                    const resultItem = document.querySelector(`[data-backtest-id="${bestStockBacktest.id}"]`);
                    if (resultItem) resultItem.click();
                }, 100);
            } else {
                showPage('stocksResults');
            }
        });
    }
}

// Load Best Backtest Data for Equity Curves
async function loadBestBacktests() {
    try {
        const response = await fetch(`${API_BASE_URL}/dashboard/best-backtest`);
        const data = await response.json();
        
        bestOptionsBacktest = data.options_best;
        bestStockBacktest = data.stock_best;
        
        renderOptionsEquityCurve(data.options_best);
        renderStocksEquityCurve(data.stock_best);
    } catch (error) {
        console.error('Error loading best backtests:', error);
        renderEmptyEquityCurve('optionsEquityCurve', 'Run a backtest to see results');
        renderEmptyEquityCurve('stocksEquityCurve', 'Run a stock backtest to see results');
    }
}

// Render Options Equity Curve (image-based)
function renderOptionsEquityCurve(backtest) {
    const container = document.getElementById('optionsEquityCurve');
    const subtitle = document.getElementById('optionsBacktestSubtitle');
    
    if (!container) return;
    
    if (!backtest || !backtest.equity_curve) {
        renderEmptyEquityCurve('optionsEquityCurve', 'Run a backtest to see results');
        return;
    }
    
    // Update subtitle with strategy info
    if (subtitle) {
        subtitle.textContent = `${backtest.strategy} | Win: ${backtest.win_rate?.toFixed(1)}% | PnL: $${backtest.total_pnl?.toFixed(0)}`;
    }
    
    // Display equity curve image
    container.innerHTML = `<img src="/${backtest.equity_curve}" alt="Equity Curve" onerror="this.parentElement.innerHTML='<div class=\\'chart-empty-state\\'><i class=\\'material-symbols-rounded\\'>image_not_supported</i><p>Image not available</p></div>'">`;
}

// Render Stocks Equity Curve (Chart.js line chart)
function renderStocksEquityCurve(backtest) {
    const container = document.getElementById('stocksEquityCurve');
    const subtitle = document.getElementById('stocksBacktestSubtitle');
    
    if (!container) return;
    
    if (!backtest || !backtest.equity_data || backtest.equity_data.length === 0) {
        renderEmptyEquityCurve('stocksEquityCurve', 'Run a stock backtest to see results');
        return;
    }
    
    // Update subtitle with strategy info
    if (subtitle) {
        subtitle.textContent = `${backtest.symbol} | Win: ${backtest.win_rate?.toFixed(1)}% | PnL: $${backtest.total_pnl?.toFixed(0)}`;
    }
    
    // Create canvas for chart
    container.innerHTML = '<canvas id="stocksEquityChart"></canvas>';
    const ctx = document.getElementById('stocksEquityChart');
    
    if (stocksChart) {
        stocksChart.destroy();
    }
    
    // Generate labels for trade numbers
    const labels = backtest.equity_data.map((_, i) => i + 1);
    
    stocksChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Account Balance',
                data: backtest.equity_data,
                borderColor: '#1a9988',
                backgroundColor: 'rgba(26, 153, 136, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 0,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `Balance: $${ctx.raw.toLocaleString()}`
                    }
                }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: {
                        callback: (v) => '$' + (v / 1000).toFixed(0) + 'K'
                    }
                },
                x: {
                    display: false
                }
            }
        }
    });
}

// Render empty equity curve state
function renderEmptyEquityCurve(containerId, message) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = `
        <div class="chart-empty-state">
            <i class="material-symbols-rounded">show_chart</i>
            <p>${message}</p>
        </div>
    `;
}

// Load Economic Calendar
async function loadEconomicCalendar() {
    try {
        const response = await fetch(`${API_BASE_URL}/dashboard/economic-calendar`);
        const data = await response.json();
        
        renderEconomicCalendar(data.events || [], data.date);
    } catch (error) {
        console.error('Error loading economic calendar:', error);
        const container = document.getElementById('economicCalendarContainer');
        if (container) {
            container.innerHTML = `
                <div class="forex-empty-state">
                    <i class="material-symbols-rounded">event_busy</i>
                    <p>Unable to load calendar</p>
                </div>
            `;
        }
    }
}

// Render Economic Calendar
function renderEconomicCalendar(events, date) {
    const container = document.getElementById('economicCalendarContainer');
    const dateLabel = document.getElementById('calendarDate');
    
    if (!container) return;
    
    if (dateLabel && date) {
        dateLabel.textContent = `Events for ${new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`;
    }
    
    if (!events.length) {
        container.innerHTML = `
            <div class="forex-empty-state">
                <i class="material-symbols-rounded">event</i>
                <p>No events scheduled</p>
            </div>
        `;
        return;
    }
    
    const eventsHtml = events.map(event => `
        <div class="calendar-event">
            <span class="event-time">${event.time}</span>
            <span class="event-currency ${event.currency.toLowerCase()}">${event.currency}</span>
            <div class="event-details">
                <p class="event-name">${event.event}</p>
                <div class="event-values">
                    <span class="event-value">Forecast: <span>${event.forecast}</span></span>
                    <span class="event-value">Previous: <span>${event.previous}</span></span>
                </div>
            </div>
            <div class="event-impact impact-${event.impact}">
                <span class="impact-dot"></span>
                <span class="impact-dot"></span>
                <span class="impact-dot"></span>
            </div>
        </div>
    `).join('');
    
    container.innerHTML = eventsHtml;
}

// Render Stocks PnL Chart
function renderStocksPnlChart(backtests) {
    const ctx = document.getElementById('stocksPnlChart');
    if (!ctx) return;
    
    if (stocksChart) {
        stocksChart.destroy();
    }
    
    if (!backtests.length) {
        renderEmptyChart('stocksPnlChart', 'Run a stock backtest to see results');
        return;
    }
    
    const labels = backtests.map(b => b.name?.substring(0, 12) || b.symbol || 'Backtest');
    const pnlData = backtests.map(b => b.total_pnl || 0);
    
    stocksChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'P&L $',
                data: pnlData,
                borderColor: '#1a9988',
                backgroundColor: 'rgba(26, 153, 136, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 6,
                pointBackgroundColor: '#1a9988',
                pointBorderColor: 'white',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `P&L: $${ctx.raw.toFixed(2)}`
                    }
                }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: {
                        callback: (v) => '$' + v
                    }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
}

// Render Empty Chart State
function renderEmptyChart(canvasId, message) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const parent = canvas.parentElement;
    parent.innerHTML = `
        <div class="chart-empty-state">
            <i class="material-symbols-rounded">bar_chart</i>
            <p>${message}</p>
        </div>
    `;
}

// Load Top Gainers and Losers Data
let gainersLosersInterval = null;

async function loadGainersLosers() {
    const gainersContainer = document.getElementById('gainersContainer');
    const losersContainer = document.getElementById('losersContainer');
    const gainersSession = document.getElementById('gainersSession');
    const losersSession = document.getElementById('losersSession');
    const gainersUpdate = document.getElementById('gainersLastUpdate');
    const losersUpdate = document.getElementById('losersLastUpdate');
    
    if (!gainersContainer || !losersContainer) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/dashboard/gainers-losers`);
        const data = await response.json();
        
        if (data.error) {
            gainersContainer.innerHTML = '<div class="gainers-empty"><i class="material-symbols-rounded">error</i><p>Failed to load data</p></div>';
            losersContainer.innerHTML = '<div class="losers-empty"><i class="material-symbols-rounded">error</i><p>Failed to load data</p></div>';
            return;
        }
        
        // Update session labels
        const sessionLabel = data.session === 'closed' ? 'Market Closed' : 
                            data.session === 'premarket' ? 'Pre-Market' :
                            data.session === 'afterhours' ? 'After Hours' : 'Regular Session';
        if (gainersSession) gainersSession.textContent = sessionLabel;
        if (losersSession) losersSession.textContent = sessionLabel;
        
        // Update timestamp
        const updateText = `updated ${data.timestamp}`;
        if (gainersUpdate) gainersUpdate.textContent = updateText;
        if (losersUpdate) losersUpdate.textContent = updateText;
        
        // Render gainers
        if (data.gainers && data.gainers.length > 0) {
            gainersContainer.innerHTML = data.gainers.map(item => `
                <div class="stock-item">
                    <div class="stock-info">
                        <span class="symbol">${item.symbol}</span>
                        <span class="volume">Vol: ${formatVolume(item.volume)}</span>
                    </div>
                    <div class="stock-price">
                        <span class="price">$${item.price.toFixed(2)}</span>
                        <span class="change positive">+${item.change_pct.toFixed(2)}%</span>
                    </div>
                </div>
            `).join('');
        } else {
            gainersContainer.innerHTML = '<div class="gainers-empty"><i class="material-symbols-rounded">trending_up</i><p>No gainers data</p></div>';
        }
        
        // Render losers
        if (data.losers && data.losers.length > 0) {
            losersContainer.innerHTML = data.losers.map(item => `
                <div class="stock-item">
                    <div class="stock-info">
                        <span class="symbol">${item.symbol}</span>
                        <span class="volume">Vol: ${formatVolume(item.volume)}</span>
                    </div>
                    <div class="stock-price">
                        <span class="price">$${item.price.toFixed(2)}</span>
                        <span class="change negative">${item.change_pct.toFixed(2)}%</span>
                    </div>
                </div>
            `).join('');
        } else {
            losersContainer.innerHTML = '<div class="losers-empty"><i class="material-symbols-rounded">trending_down</i><p>No losers data</p></div>';
        }
        
    } catch (error) {
        console.error('Error loading gainers/losers:', error);
        gainersContainer.innerHTML = '<div class="gainers-empty"><i class="material-symbols-rounded">wifi_off</i><p>Connection error</p></div>';
        losersContainer.innerHTML = '<div class="losers-empty"><i class="material-symbols-rounded">wifi_off</i><p>Connection error</p></div>';
    }
}

// Format volume to K/M/B
function formatVolume(volume) {
    if (!volume) return '0';
    if (volume >= 1000000000) return (volume / 1000000000).toFixed(1) + 'B';
    if (volume >= 1000000) return (volume / 1000000).toFixed(1) + 'M';
    if (volume >= 1000) return (volume / 1000).toFixed(1) + 'K';
    return volume.toString();
}

// Start auto-refresh for gainers/losers (every 30 seconds)
function startGainersLosersRefresh() {
    loadGainersLosers();
    if (gainersLosersInterval) clearInterval(gainersLosersInterval);
    gainersLosersInterval = setInterval(loadGainersLosers, 30000);
}

// Load Watchlist Data
async function loadWatchlist() {
    const container = document.getElementById('watchlistContainer');
    if (!container) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/dashboard/watchlist`);
        const data = await response.json();
        
        if (!data.watchlist || !data.watchlist.length) {
            container.innerHTML = '<div class="watchlist-loading">No watchlist data</div>';
            return;
        }
        
        container.innerHTML = data.watchlist.map(item => `
            <div class="watchlist-item">
                <div class="watchlist-symbol">
                    <span class="symbol">${item.symbol}</span>
                    <span class="name">${item.name}</span>
                </div>
                <div class="watchlist-price">
                    <span class="price">$${item.price.toFixed(2)}</span>
                    <span class="change ${item.change >= 0 ? 'positive' : 'negative'}">
                        ${item.change >= 0 ? '+' : ''}${item.change.toFixed(2)} (${item.change >= 0 ? '+' : ''}${item.change_pct.toFixed(2)}%)
                    </span>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading watchlist:', error);
        container.innerHTML = '<div class="watchlist-loading">Failed to load watchlist</div>';
    }
}
