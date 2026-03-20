// Main Dashboard JavaScript

// API Configuration - Dynamic to work with any port
const API_BASE_URL = `${window.location.protocol}//${window.location.host}/api`;

function getAuthHeaders() {
    const token = localStorage.getItem('authToken');
    const headers = {};
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

function authFetch(url, options = {}) {
    const tokenHeaders = getAuthHeaders();
    options.credentials = 'include';
    options.headers = { ...(options.headers || {}), ...tokenHeaders };
    return fetch(url, options);
}

// State
let currentPage = 'home';
let apiKeyConfigured = false;
let isAuthenticated = false;
let currentUser = null;

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
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Dashboard initializing...');
    
    // Check authentication status first
    await checkAuthStatus();
    
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
        await navigateToPage(section);
    } else {
        await loadPageContent('home');
    }
    
    // Remove initializing class to reveal content after navigation completes
    document.body.classList.remove('initializing');
});

// Check authentication status
async function checkAuthStatus() {
    try {
        const response = await authFetch('/api/auth/status');
        const data = await response.json();
        isAuthenticated = data.authenticated;
        currentUser = data.user || null;
        console.log('Auth status:', isAuthenticated ? 'Logged in as' : 'Guest', currentUser?.name || '');
        
        // Load API key from user profile if authenticated
        if (isAuthenticated && data.polygon_api_key) {
            localStorage.setItem('polygonApiKey', data.polygon_api_key);
            console.log('API key loaded from user profile');
        }
        
        // Apply UI state after auth check
        applyAuthUIState();
    } catch (error) {
        console.log('Auth check failed:', error);
        isAuthenticated = false;
        currentUser = null;
    }
}

// Apply auth-aware UI state - call this after any DOM updates
function applyAuthUIState() {
    console.log('Applying auth UI state, authenticated:', isAuthenticated);
    
    // Update header based on auth status
    const userProfileNav = document.getElementById('userProfileNav');
    const guestNav = document.getElementById('guestNav');
    
    console.log('Header elements found:', { userProfileNav: !!userProfileNav, guestNav: !!guestNav });
    
    if (isAuthenticated && currentUser) {
        // Show user profile, hide guest nav
        if (userProfileNav) {
            userProfileNav.style.display = 'block';
            console.log('Showing userProfileNav');
        }
        if (guestNav) {
            // Remove d-flex class to allow hiding (Bootstrap's d-flex uses !important)
            guestNav.classList.remove('d-flex');
            guestNav.style.display = 'none';
            console.log('Hiding guestNav');
        }
        
        const userName = document.getElementById('userName');
        const userNameDisplay = document.getElementById('userNameDisplay');
        const userEmailDisplay = document.getElementById('userEmailDisplay');
        const profileBtn = document.getElementById('profileBtn');
        const userMenuItems = document.getElementById('userMenuItems');
        
        if (userName) userName.textContent = currentUser.name;
        if (userNameDisplay) userNameDisplay.textContent = currentUser.name;
        if (userEmailDisplay) userEmailDisplay.textContent = currentUser.email;
        if (profileBtn) {
            profileBtn.href = '/?section=settings';
            profileBtn.textContent = 'View Profile';
        }
        if (userMenuItems) {
            userMenuItems.innerHTML = `
                <div class="dropdown-divider"></div>
                <a class="dropdown-item" href="/?section=settings">My Profile</a>
                <a class="dropdown-item" href="/?section=subscription">Subscription</a>
                <div class="dropdown-divider"></div>
                <a class="dropdown-item" href="#" onclick="localStorage.removeItem('authToken'); window.location.href='/logout';">Logout</a>
            `;
        }
    } else {
        // Show guest nav, hide user profile
        if (userProfileNav) userProfileNav.style.display = 'none';
        if (guestNav) {
            guestNav.classList.add('d-flex');
            guestNav.style.display = '';
        }
    }
    
    // Update subscription/pricing text and settings visibility
    const subscriptionNavText = document.getElementById('subscriptionNavText');
    const pricingContent = document.getElementById('pricingContent');
    const subscriptionContent = document.getElementById('subscriptionContent');
    const settingsNavItem = document.getElementById('nav-settings');
    
    console.log('Updating sidebar UI:', {
        subscriptionNavText: !!subscriptionNavText,
        settingsNavItem: !!settingsNavItem,
        isAuthenticated
    });
    
    if (isAuthenticated) {
        // Show subscription, hide pricing
        if (subscriptionNavText) subscriptionNavText.textContent = 'Subscription';
        if (pricingContent) pricingContent.style.display = 'none';
        if (subscriptionContent) subscriptionContent.style.display = '';
        // Show settings for logged-in users
        if (settingsNavItem) settingsNavItem.style.display = '';
    } else {
        // Show pricing, hide subscription
        if (subscriptionNavText) subscriptionNavText.textContent = 'Pricing';
        if (pricingContent) pricingContent.style.display = '';
        if (subscriptionContent) subscriptionContent.style.display = 'none';
        // Hide settings for guests
        if (settingsNavItem) settingsNavItem.style.display = 'none';
    }
}

// Setup login required overlay for backtester fields
function setupLoginRequiredFields(containerSelector) {
    if (isAuthenticated) return; // No need if logged in
    
    const container = document.querySelector(containerSelector);
    if (!container) {
        console.log('Login overlay: Container not found:', containerSelector);
        return;
    }
    
    console.log('Applying login required overlay to:', containerSelector);
    
    // Add login banner at top of the page header or card
    const pageHeader = container.querySelector('.page-header');
    const existingBanner = container.querySelector('.login-banner');
    if (!existingBanner) {
        const banner = document.createElement('div');
        banner.className = 'login-banner';
        banner.innerHTML = `
            <div class="login-banner-text">
                <i class="fas fa-lock"></i>
                <span>Sign in to run backtests and access all features</span>
            </div>
            <div class="login-banner-actions">
                <a href="/login" class="btn-login">Sign In</a>
                <a href="/register" class="btn-signup">Sign Up Free</a>
            </div>
        `;
        if (pageHeader) {
            pageHeader.after(banner);
        } else {
            container.insertBefore(banner, container.firstChild);
        }
    }
    
    // Actually disable all form inputs, selects, textareas, and buttons
    const formElements = container.querySelectorAll('input, select, textarea, button[type="submit"], .btn-primary');
    formElements.forEach(el => {
        el.disabled = true;
        el.classList.add('disabled-field');
        el.style.opacity = '0.5';
        el.style.cursor = 'not-allowed';
        el.style.backgroundColor = '#f5f5f5';
    });
    
    // Add overlay to form sections for visual feedback
    const formSections = container.querySelectorAll('.backtester-section, .card-body form');
    formSections.forEach(section => {
        section.classList.add('login-required-overlay');
    });
    
    // Add click handler to show tooltip when clicking disabled fields
    container.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('disabled-field') || target.disabled) {
            e.preventDefault();
            e.stopPropagation();
            showLoginTooltip(target);
        }
    });
}

// Show tooltip near the clicked element
function showLoginTooltip(element) {
    // Remove any existing tooltips
    document.querySelectorAll('.login-field-tooltip').forEach(t => t.remove());
    
    const tooltip = document.createElement('div');
    tooltip.className = 'login-field-tooltip';
    tooltip.innerHTML = '<a href="/login">Sign in</a> or <a href="/register">sign up for free</a> to use this feature';
    tooltip.style.cssText = `
        position: absolute;
        background: #1a2332;
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 13px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        white-space: nowrap;
    `;
    
    document.body.appendChild(tooltip);
    
    const rect = element.getBoundingClientRect();
    tooltip.style.left = `${rect.left + window.scrollX}px`;
    tooltip.style.top = `${rect.bottom + window.scrollY + 8}px`;
    
    // Style the links
    tooltip.querySelectorAll('a').forEach(a => {
        a.style.color = '#3b7cff';
        a.style.textDecoration = 'none';
    });
    
    // Auto-hide after 3 seconds
    setTimeout(() => tooltip.remove(), 3000);
}

// Make function globally available
window.setupLoginRequiredFields = setupLoginRequiredFields;
window.isAuthenticated = () => isAuthenticated;

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
    // Handle all links with data-page attribute
    document.querySelectorAll('[data-page]').forEach(element => {
        element.addEventListener('click', (e) => {
            e.preventDefault();
            const pageName = element.getAttribute('data-page');
            console.log('Navigating to:', pageName);
            navigateToPage(pageName);
        });
    });
    
}

// Navigate to Page
async function navigateToPage(pageName, skipPushState = false) {
    console.log('Navigating to:', pageName);

    // Close the mobile sidebar whenever the user navigates.
    // KaiAdmin uses jQuery handlers, so we must use jQuery .trigger() to properly
    // close the sidebar and keep its internal state (h counter) in sync.
    if (typeof jQuery !== 'undefined' && jQuery('html').hasClass('nav_open')) {
        jQuery('.sidenav-toggler').first().trigger('click');
    }
    // Direct fallback in case jQuery path didn't fire.
    document.documentElement.classList.remove('nav_open');
    document.querySelectorAll('.sidenav-toggler').forEach(function(el) { el.classList.remove('toggled'); });
    // Also cover the secondary custom mechanism.
    var _msb = document.querySelector('.sidebar');
    var _mov = document.getElementById('mobileOverlay');
    if (_msb) _msb.classList.remove('mobile-open');
    if (_mov) _mov.classList.remove('active');

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
    
    // Clear all active states and KaiAdmin's submenu class
    const activeItems = document.querySelectorAll('.nav-item.active, .nav-item.submenu, .dropdown-menu li.active');
    console.log('Clearing active/submenu from:', activeItems.length, 'items');
    activeItems.forEach(item => {
        item.classList.remove('active', 'submenu');
    });
    
    // Update nav active states - check for data-page on child anchor
    let foundMatch = false;
    navItems.forEach(item => {
        const anchor = item.querySelector('[data-page]');
        if (anchor && anchor.getAttribute('data-page') === pageName) {
            item.classList.add('active');
            console.log('Setting active on:', item.id || anchor.getAttribute('data-page'));
            foundMatch = true;
        }
    });
    console.log('Found matching nav item:', foundMatch);
    
    // Update dropdown menu active states
    document.querySelectorAll('.dropdown-menu li').forEach(item => {
        const anchor = item.querySelector('[data-page]');
        if (anchor && anchor.getAttribute('data-page') === pageName) {
            item.classList.add('active');
            // Expand parent dropdown and mark it active
            const parentDropdown = item.closest('.nav-item');
            if (parentDropdown) {
                parentDropdown.classList.add('active');
                // Also expand the collapse
                const collapse = parentDropdown.querySelector('.collapse');
                if (collapse) collapse.classList.add('show');
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
    await loadPageContent(pageName);
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
    
    // If authenticated and on home page, load dashboard content into home page
    if (pageName === 'home' && isAuthenticated) {
        const homePage = document.getElementById('homePage');
        const dashboardPage = document.getElementById('dashboardPage');
        
        if (homePage && dashboardPage) {
            // Check if dashboard content is loaded
            let dashboardContent = dashboardPage.innerHTML.trim();
            if (!dashboardContent || dashboardContent.includes('error-message')) {
                // Need to load dashboard content
                try {
                    const response = await fetch('dashboard.html');
                    if (response.ok) {
                        dashboardContent = await response.text();
                        dashboardPage.innerHTML = dashboardContent;
                        
                        // Load dashboard script
                        if (!loadedScripts.has('dashboard')) {
                            await loadScript('dashboard-script.js', 'dashboard');
                        } else {
                            initializePage('dashboard');
                        }
                    }
                } catch (error) {
                    console.error('Error loading dashboard:', error);
                }
            }
            
            // Replace home page with dashboard content
            homePage.innerHTML = dashboardPage.innerHTML;
            homePage.classList.add('active');
            
            // Initialize dashboard widgets
            if (typeof initDashboard === 'function') {
                initDashboard();
            }
            return;
        }
    }
    
    // Get target page element
    const targetPage = document.getElementById(`${pageName}Page`);
    if (!targetPage) {
        console.error('Page element not found:', `${pageName}Page`);
        return;
    }
    
    // If page content needs to be loaded (not home page when unauthenticated)
    if (pageName !== 'home') {
        // Check if content is already loaded (must have actual elements, not just comments)
        const contentText = targetPage.innerHTML.trim();
        const hasContent = contentText !== '' && 
                          !contentText.includes('error-message') &&
                          !contentText.startsWith('<!--') &&
                          targetPage.children.length > 0;
        
        if (!hasContent) {
            console.log('Fetching content for:', pageName);
            try {
                // Map page name to file name (handle special cases)
                let fileName = pageName;
                let scriptName = `${pageName}-script.js`;
                
                if (pageName === 'stockBacktester') {
                    fileName = 'stock-backtester';
                    scriptName = 'stock-backtester-script.js';
                }
                if (pageName === 'simulatedTrading') {
                    fileName = 'simulated-trading';
                    scriptName = 'simulated-trading-script.js';
                }
                if (pageName === 'screener') {
                    scriptName = 'static/js/screener-script.js';
                }
                if (pageName === 'notifications') {
                    scriptName = 'static/js/notifications-script.js';
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
            // Pages with inline scripts (no separate script file needed)
            const inlineScriptPages = ['optionsResults', 'stockResults', 'subscription', 'settings'];
            
            if (inlineScriptPages.includes(pageName)) {
                // These pages have their init functions defined inline or in pre-loaded scripts
                console.log('Using inline script for:', pageName);
                loadedScripts.add(pageName);
                initializePage(pageName);
            } else if (!loadedScripts.has(pageName)) {
                console.log('Loading script for inline content:', pageName);
                let scriptName = `${pageName}-script.js`;
                if (pageName === 'stockBacktester') {
                    scriptName = 'stock-backtester-script.js';
                }
                if (pageName === 'simulatedTrading') {
                    scriptName = 'simulated-trading-script.js';
                }
                if (pageName === 'screener') {
                    scriptName = 'static/js/screener-script.js';
                }
                if (pageName === 'notifications') {
                    scriptName = 'static/js/notifications-script.js';
                }
                await loadScript(scriptName, pageName);
            } else {
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
    
    // Re-apply auth UI state after DOM updates
    applyAuthUIState();
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
            setTimeout(() => setupLoginRequiredFields('#backtesterPage'), 100);
        } else if (pageName === 'stockBacktester' && typeof initializeStockBacktesterPage === 'function') {
            initializeStockBacktesterPage();
            setTimeout(() => setupLoginRequiredFields('#stockBacktesterPage'), 100);
        } else if (pageName === 'my-backtests' && typeof initializeMyBacktestsPage === 'function') {
            initializeMyBacktestsPage();
        } else if (pageName === 'results' && typeof initializeResultsPage === 'function') {
            initializeResultsPage();
        } else if (pageName === 'optionsResults' && typeof initOptionsResultsPage === 'function') {
            initOptionsResultsPage();
        } else if (pageName === 'stockResults' && typeof initStockResultsPage === 'function') {
            initStockResultsPage();
        } else if (pageName === 'billing' && typeof initBillingPage === 'function') {
            initBillingPage();
        } else if (pageName === 'subscription' && typeof initSubscriptionPage === 'function') {
            initSubscriptionPage();
        } else if (pageName === 'settings' && typeof initSettingsPage === 'function') {
            initSettingsPage();
        } else if (pageName === 'screener' && typeof initScreenerPage === 'function') {
            initScreenerPage();
            setTimeout(() => setupLoginRequiredFields('#screenerPage'), 100);
        } else if (pageName === 'notifications' && typeof initNotificationsPage === 'function') {
            initNotificationsPage();
            setTimeout(() => setupLoginRequiredFields('#notificationsPage'), 100);
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
    
    saveApiKeyBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            localStorage.setItem('polygonApiKey', apiKey);
            apiKeyConfigured = true;
            updateAPIStatus(true);
            
            // Save to user profile if authenticated
            if (isAuthenticated) {
                try {
                    const response = await authFetch('/api/user/api-key', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ api_key: apiKey })
                    });
                    if (response.ok) {
                        showNotification('API key saved to your profile', 'success');
                    } else {
                        showNotification('API key saved locally', 'success');
                    }
                } catch (e) {
                    showNotification('API key saved locally', 'success');
                }
            } else {
                showNotification('API key saved successfully', 'success');
            }
        } else {
            showNotification('Please enter a valid API key', 'error');
        }
    });
    
    // Auto-save on change
    apiKeyInput.addEventListener('change', async () => {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            localStorage.setItem('polygonApiKey', apiKey);
            apiKeyConfigured = true;
            updateAPIStatus(true);
            
            // Save to user profile if authenticated
            if (isAuthenticated) {
                try {
                    await authFetch('/api/user/api-key', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ api_key: apiKey })
                    });
                } catch (e) { }
            }
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
        const response = await authFetch(`${API_BASE_URL}/dashboard/best-backtest`);
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
        const response = await authFetch(`${API_BASE_URL}/dashboard/economic-calendar`);
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
        const response = await authFetch(`${API_BASE_URL}/dashboard/gainers-losers`);
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
        const response = await authFetch(`${API_BASE_URL}/dashboard/watchlist`);
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
