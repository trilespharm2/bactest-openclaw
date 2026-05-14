// Main Dashboard JavaScript

// API Configuration - Dynamic to work with any port
const API_BASE_URL = `${window.location.protocol}//${window.location.host}/api`;

const AVATAR_COLORS = [
    ['#667eea','#764ba2'],['#f093fb','#f5576c'],['#4facfe','#00f2fe'],
    ['#43e97b','#38f9d7'],['#fa709a','#fee140'],['#a18cd1','#fbc2eb'],
    ['#fccb90','#d57eeb'],['#e0c3fc','#8ec5fc'],['#f5576c','#ff9a9e'],
    ['#667eea','#5fc3e4']
];

function getAvatarColor(name) {
    const idx = (name || '?').charCodeAt(0) % AVATAR_COLORS.length;
    return AVATAR_COLORS[idx];
}

function renderNavAvatars(user) {
    if (!user) return;
    const initial = (user.name || user.email || '?')[0].toUpperCase();
    const [c1, c2] = getAvatarColor(user.name || user.email);
    
    ['navAvatarSmall', 'navAvatarLarge'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (user.profile_picture) {
            el.innerHTML = `<img src="${user.profile_picture}" alt="Avatar">`;
            el.style.background = 'none';
        } else {
            el.textContent = initial;
            el.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
            el.style.color = '#fff';
        }
    });
}

function _fmt(val, decimals = 2, fallback = '\u2014') {
    if (val === null || val === undefined || isNaN(val)) return fallback;
    return Number(val).toFixed(decimals);
}

function esc(str) {
    if (str === null || str === undefined) return '';
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str)));
    return d.innerHTML;
}

function _tickerLink(symbol, extraStyle) {
    const style = extraStyle || 'font-weight:600;color:#3b6df0;';
    return '<a href="/ticker/' + encodeURIComponent(symbol || '') + '" style="' + style + 'text-decoration:none;" onmouseover="this.style.textDecoration=\'underline\'" onmouseout="this.style.textDecoration=\'none\'">' + symbol + '</a>';
}

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
let isAuthenticated = false;
let currentUser = null;

// DOM Elements
const sidebar = document.querySelector('.sidebar');
const navItems = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.page');
const pageTitle = document.getElementById('pageTitle');

// Track loaded scripts to prevent duplicates
const loadedScripts = new Set();

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Dashboard initializing...');
    
    // Check authentication status first
    await checkAuthStatus();
    
    // Set default dates for forms (will be called when pages load)
    setDefaultDates();
    
    // Event Listeners
    setupNavigation();
    setupQuickLinks();
    setupFooterLinks();
    setupFAQAccordion();
    setupContactForm();
    setupProfileDropdown();
    setupMobileMenu();
    
    // Check for URL parameters to navigate to specific section
    const urlParams = new URLSearchParams(window.location.search);
    const section = urlParams.get('section');
    const urlId = urlParams.get('id');

    // Stash the ID now — navigateToPage will push a new URL that strips &id=
    if (urlId) {
        if (section === 'optionsResultDetail') window._pendingOptDetailId = urlId;
        if (section === 'stockResultDetail')   window._pendingStkDetailId = urlId;
    }
    
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
        
        if (typeof TierRestrictions !== 'undefined' && TierRestrictions.setTier) {
            var userTier = (currentUser && currentUser.tier) ? currentUser.tier : (data.tier || 'free');
            TierRestrictions.setTier(userTier);
            console.log('Tier set to:', userTier);
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
                <a class="dropdown-item" href="/?section=subscription">Subscription</a>
                <div class="dropdown-divider"></div>
                <a class="dropdown-item" href="#" onclick="localStorage.removeItem('authToken'); window.location.href='/logout';">Logout</a>
            `;
        }
        
        renderNavAvatars(currentUser);
        if (typeof loadUnreadNotifCount === 'function') loadUnreadNotifCount();
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
    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-page]');
        if (el) {
            e.preventDefault();
            const pageName = el.getAttribute('data-page');
            console.log('Navigating to:', pageName);
            navigateToPage(pageName);
        }
    });
}

// Navigate to Page
function toggleVideoDropdown(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const isOpen = el.classList.contains('open');
    document.querySelectorAll('.video-dropdown.open').forEach(d => {
        d.classList.remove('open');
        const v = d.querySelector('video');
        if (v) { v.pause(); v.currentTime = 0; }
    });
    if (!isOpen) {
        el.classList.add('open');
    }
}

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

    if (pageName === currentPage && !skipPushState && pageName !== 'optionsResultDetail' && pageName !== 'stockResultDetail') return;

    if (currentPage === 'simTradingActive' && pageName !== 'simTradingActive') {
        if (window._simGuestSession && typeof simCurrentSymbol !== 'undefined' && simCurrentSymbol) {
            if (!confirm('You are not signed in. Leaving this page will end your active session and all data will be lost. Are you sure you want to leave?')) {
                return;
            }
            try { if (typeof stopAutoplay === 'function') stopAutoplay(); } catch(e) {}
            window._simPendingSession = null;
            window._simGuestSession = false;
        } else {
            try {
                if (typeof stopAutoplay === 'function') stopAutoplay();
                if (typeof saveCurrentSessionState === 'function') saveCurrentSessionState();
                console.log('Auto-saved sim trading session before navigating away');
            } catch(e) { console.error('Error auto-saving sim session:', e); }
        }
    }
    
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
        'contact': 'Contact Us',
        'simResults': 'Simulated Trading Results',
        'simResultDetail': 'Simulated Trading Analysis',
        'strategyGuide': 'Information Guide',
        'optionsResultDetail': 'Options Backtest Analysis',
        'stockResultDetail': 'Stock Backtest Analysis'
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
    
    // If authenticated and on home page, show dashboard content
    if (pageName === 'home' && isAuthenticated) {
        const homePage = document.getElementById('homePage');
        const dashboardPage = document.getElementById('dashboardPage');

        if (homePage && dashboardPage) {
            // Copy the rich dashboard from dashboardPage into homePage so the
            // landing-page markup is replaced with the dashboard widgets.
            // We only do this once (first load); on subsequent SPA navigations
            // the content is already present in homePage.
            if (!loadedScripts.has('dashboard')) {
                homePage.innerHTML = dashboardPage.innerHTML;

                // Load and initialise the dashboard widget script
                await loadScript('/static/js/dashboard-script.js?v=4', 'dashboard');
            }

            homePage.classList.add('active');

            // Re-initialise dashboard on every visit to refresh live data
            if (typeof initDashboard === 'function') {
                initDashboard();
            }
            initDashboardCharts();
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
                    scriptName = '/static/js/stock-backtester-script.js?v=2';
                }
                if (pageName === 'simulatedTrading' || pageName === 'simTradingActive') {
                    fileName = 'simulated-trading';
                    scriptName = '/static/js/simulated-trading-script.js';
                }
                if (pageName === 'screener') {
                    scriptName = '/static/js/screener-script.js';
                }
                if (pageName === 'notifications') {
                    scriptName = '/static/js/notifications-script.js';
                }
                if (pageName === 'bot') {
                    scriptName = '/static/js/bot-script.js?v=8';
                }
                if (pageName === 'strategyGuide') {
                    fileName = 'strategy-guide';
                    scriptName = '/static/js/strategy-guide-script.js';
                }
                if (pageName === 'optionsResultDetail' || pageName === 'stockResultDetail') {
                    scriptName = '/static/js/backtest-result-detail-script.js?v=2';
                    if (loadedScripts.has('optionsResultDetail') || loadedScripts.has('stockResultDetail')) {
                        loadedScripts.add(pageName);
                        scriptName = null;
                    }
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
            const inlineScriptPages = ['optionsResults', 'stockResults', 'subscription', 'settings', 'learnOptionsBacktest', 'learnStockBacktest', 'learnSimTrading', 'learnScreener', 'learnNotifications'];
            
            if (inlineScriptPages.includes(pageName)) {
                // These pages have their init functions defined inline or in pre-loaded scripts
                console.log('Using inline script for:', pageName);
                loadedScripts.add(pageName);
                initializePage(pageName);
            } else if (!loadedScripts.has(pageName)) {
                console.log('Loading script for inline content:', pageName);
                let scriptName = `${pageName}-script.js`;
                if (pageName === 'backtester') {
                    scriptName = '/static/js/backtester-script.js?v=3';
                }
                if (pageName === 'stockBacktester') {
                    scriptName = '/static/js/stock-backtester-script.js';
                }
                if (pageName === 'simulatedTrading' || pageName === 'simTradingActive') {
                    scriptName = '/static/js/simulated-trading-script.js';
                    if (loadedScripts.has('simulatedTrading') || loadedScripts.has('simTradingActive')) {
                        loadedScripts.add(pageName);
                        initializePage(pageName);
                        scriptName = null;
                    }
                }
                if (pageName === 'screener') {
                    scriptName = '/static/js/screener-script.js';
                }
                if (pageName === 'notifications') {
                    scriptName = '/static/js/notifications-script.js';
                }
                if (pageName === 'bot') {
                    scriptName = '/static/js/bot-script.js?v=8';
                }
                if (pageName === 'strategyGuide') {
                    scriptName = '/static/js/strategy-guide-script.js';
                }
                if (pageName === 'simResults' || pageName === 'simResultDetail') {
                    scriptName = '/static/js/simulated-results-script.js';
                    if (loadedScripts.has('simResults') || loadedScripts.has('simResultDetail')) {
                        loadedScripts.add(pageName);
                        initializePage(pageName);
                        scriptName = null;
                    }
                }
                if (pageName === 'optionsResultDetail' || pageName === 'stockResultDetail') {
                    scriptName = '/static/js/backtest-result-detail-script.js?v=2';
                    if (loadedScripts.has('optionsResultDetail') || loadedScripts.has('stockResultDetail')) {
                        loadedScripts.add(pageName);
                        initializePage(pageName);
                        scriptName = null;
                    }
                }
                if (scriptName) await loadScript(scriptName, pageName);
            } else {
                initializePage(pageName);
            }
        }
    }
    
    // Show target page — but only if init didn't redirect us elsewhere.
    // Some init functions (e.g. initSimTradingActive when there's no pending session)
    // call navigateToPage(...) themselves. Without this guard, the outer call would
    // re-activate its target after the inner navigation already activated a different
    // page, leaving BOTH pages with the .active class visible at the same time.
    if (currentPage !== pageName) {
        console.log('Skipping page activation — navigation redirected from', pageName, 'to', currentPage);
        return;
    }
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
        script.src = src + (src.indexOf('?') === -1 ? '?' : '&') + '_v=' + Date.now();
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

function viewOptionsResultDetail(backtestId) {
    window._pendingOptDetailId = backtestId;
    navigateToPage('optionsResultDetail');
    // Persist ID in URL so page survives a refresh
    history.replaceState({ page: 'optionsResultDetail', id: backtestId }, '',
        '/dashboard?section=optionsResultDetail&id=' + encodeURIComponent(backtestId));
}

function viewStockResultDetail(backtestId) {
    window._pendingStkDetailId = backtestId;
    navigateToPage('stockResultDetail');
    // Persist ID in URL so page survives a refresh
    history.replaceState({ page: 'stockResultDetail', id: backtestId }, '',
        '/dashboard?section=stockResultDetail&id=' + encodeURIComponent(backtestId));
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
        } else if (pageName === 'bot' && typeof initBotPage === 'function') {
            initBotPage();
        } else if (pageName === 'simulatedTrading' && typeof initSimulatedTrading === 'function') {
            initSimulatedTrading();
        } else if (pageName === 'simTradingActive' && typeof initSimTradingActive === 'function') {
            initSimTradingActive();
        } else if (pageName === 'simResults' && typeof initSimResultsPage === 'function') {
            initSimResultsPage();
        } else if (pageName === 'simResultDetail' && typeof initSimResultDetailPage === 'function') {
            initSimResultDetailPage();
        } else if (pageName === 'strategyGuide' && typeof initStrategyGuide === 'function') {
            initStrategyGuide();
        } else if (pageName === 'optionsResultDetail' && typeof initOptionsResultDetailPage === 'function') {
            initOptionsResultDetailPage();
        } else if (pageName === 'stockResultDetail' && typeof initStockResultDetailPage === 'function') {
            initStockResultDetailPage();
        }
    } catch (error) {
        console.error(`Error initializing ${pageName} page:`, error);
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
var _dashCardIntervals = [];

async function _fetchCached(path, maxRetries = 6) {
    for (let i = 0; i <= maxRetries; i++) {
        const response = await authFetch(path);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        if (!data.loading) return data;
        if (i < maxRetries) await new Promise(r => setTimeout(r, 3000));
    }
    return {};
}

function initDashboardCharts() {
    loadBestBacktests();
    loadWatchlist();
    loadEconomicCalendar();
    startGainersLosersRefresh();
    setupClickableCharts();

    _dashCardIntervals.forEach(i => clearInterval(i));
    _dashCardIntervals = [];

    Promise.allSettled([
        _loadIndices(),
        _loadMostActive(),
        _loadTrending(),
        _loadSectors(),
        _loadEarnings(),
        _loadNews(),
        _loadTreasury(),
        _loadEconomicIndicators(),
        _loadFredData()
    ]);

    _dashCardIntervals.push(setInterval(_loadIndices, 30000));
    _dashCardIntervals.push(setInterval(_loadMostActive, 60000));
    _dashCardIntervals.push(setInterval(_loadTrending, 60000));
    _dashCardIntervals.push(setInterval(_loadSectors, 60000));
    _dashCardIntervals.push(setInterval(_loadEarnings, 300000));
    _dashCardIntervals.push(setInterval(_loadNews, 300000));
    _dashCardIntervals.push(setInterval(_loadTreasury, 120000));
    _dashCardIntervals.push(setInterval(_loadEconomicIndicators, 120000));
    _dashCardIntervals.push(setInterval(_loadFredData, 600000));
}

async function _loadIndices() {
    try {
        const data = await _fetchCached('/api/dashboard/indices');
        const el = document.getElementById('indicesBar');
        if (!el) return;
        const indices = data.indices || [];
        if (!indices.length) return;
        el.innerHTML = indices.map(idx => {
            const isUp = idx.change >= 0;
            const color = idx.symbol === 'UVXY'
                ? (idx.change_pct > 10 ? '#d94452' : idx.change_pct > 3 ? '#e5873a' : '#0fad6e')
                : (isUp ? '#0fad6e' : '#d94452');
            const arrow = isUp ? '\u25B2' : '\u25BC';
            const sign = isUp ? '+' : '';
            return '<a href="/ticker/' + encodeURIComponent(idx.symbol || '') + '" class="text-center" style="flex:1;min-width:90px;cursor:pointer;text-decoration:none;display:block;border-radius:6px;padding:4px 2px;transition:background 0.12s;" onmouseover="this.style.background=\'#f0f4ff\'" onmouseout="this.style.background=\'transparent\'">' +
                '<div style="font-size:11px;font-weight:600;color:#6b7689;">' + (idx.symbol || '') + '</div>' +
                '<div style="font-size:15px;font-weight:700;color:#1a1e2e;">' + (idx.price ? '$' + idx.price.toLocaleString(undefined, {minimumFractionDigits:2}) : '\u2014') + '</div>' +
                '<div style="font-size:11px;font-weight:600;color:' + color + ';">' + arrow + ' ' + sign + _fmt(idx.change_pct) + '%</div></a>';
        }).join('');
    } catch (e) { console.error('Indices error:', e); }
}

async function _loadMostActive() {
    try {
        const data = await _fetchCached('/api/dashboard/most-active');
        const el = document.getElementById('mostActiveTable');
        if (!el) return;
        const items = data.active || [];
        if (!items.length) { el.innerHTML = '<div class="text-muted text-center py-2" style="font-size:12px;">No data</div>'; return; }
        el.innerHTML = items.slice(0, 8).map(item => {
            const pct = item.change_pct || 0;
            const color = pct >= 0 ? '#0fad6e' : '#d94452';
            const arrow = pct >= 0 ? '\u25B2' : '\u25BC';
            const vol = item.volume >= 1e6 ? (item.volume / 1e6).toFixed(1) + 'M' : item.volume >= 1e3 ? (item.volume / 1e3).toFixed(0) + 'K' : item.volume;
            return '<a href="/ticker/' + encodeURIComponent(item.symbol || '') + '" class="d-flex justify-content-between align-items-center py-1" style="border-bottom:1px solid #f0f2f6;font-size:13px;text-decoration:none;color:inherit;cursor:pointer;transition:background 0.12s;" onmouseover="this.style.background=\'#f5f7ff\'" onmouseout="this.style.background=\'transparent\'">' +
                '<span style="font-weight:600;color:#3b6df0;">' + (item.symbol || '') + '</span>' +
                '<span style="color:#6b7689;font-size:11px;">' + vol + '</span>' +
                '<span style="font-weight:600;color:' + color + ';">' + arrow + ' ' + Math.abs(pct).toFixed(2) + '%</span></a>';
        }).join('');
    } catch (e) { console.error('Most active error:', e); }
}

async function _loadTrending() {
    try {
        const data = await _fetchCached('/api/dashboard/trending');
        const el = document.getElementById('trendingTable');
        if (!el) return;
        const items = data.trending || [];
        if (!items.length) { el.innerHTML = '<div class="text-muted text-center py-2" style="font-size:12px;">No data</div>'; return; }
        el.innerHTML = items.slice(0, 8).map((item, i) => {
            const pct = item.change_pct || 0;
            const color = pct >= 0 ? '#0fad6e' : '#d94452';
            const arrow = pct >= 0 ? '\u25B2' : '\u25BC';
            return '<a href="/ticker/' + encodeURIComponent(item.symbol || '') + '" class="d-flex justify-content-between align-items-center py-1" style="border-bottom:1px solid #f0f2f6;font-size:13px;text-decoration:none;color:inherit;cursor:pointer;transition:background 0.12s;" onmouseover="this.style.background=\'#f5f7ff\'" onmouseout="this.style.background=\'transparent\'">' +
                '<span style="color:#6b7689;font-size:11px;width:18px;">' + (i + 1) + '</span>' +
                '<span style="flex:1;font-weight:600;color:#3b6df0;">' + (item.symbol || '') + '</span>' +
                '<span style="font-weight:600;color:' + color + ';">' + arrow + ' ' + Math.abs(pct).toFixed(2) + '%</span></a>';
        }).join('');
    } catch (e) { console.error('Trending error:', e); }
}

async function _loadSectors() {
    try {
        const data = await _fetchCached('/api/dashboard/sectors');
        const el = document.getElementById('sectorGrid');
        if (!el) return;
        const sectors = data.sectors || [];
        if (!sectors.length) { el.innerHTML = '<div class="text-muted text-center py-2" style="grid-column:span 4;font-size:12px;">No data</div>'; return; }
        el.innerHTML = sectors.map(s => {
            const pct = s.change_pct || 0;
            const isUp = pct >= 0;
            const color = isUp ? '#0fad6e' : '#d94452';
            const bg = isUp ? 'rgba(15,173,110,0.08)' : 'rgba(217,68,82,0.08)';
            return '<div style="padding:8px 10px;border-radius:8px;background:' + bg + ';text-align:center;">' +
                '<div style="font-size:12px;font-weight:600;color:#1a1e2e;">' + s.name + '</div>' +
                '<div style="font-size:15px;font-weight:700;color:' + color + ';margin-top:2px;">' + (isUp ? '+' : '') + _fmt(pct) + '%</div>' +
                '<div style="font-size:9px;">' + _tickerLink(s.symbol, 'color:#6b7689;') + '</div></div>';
        }).join('');
    } catch (e) { console.error('Sectors error:', e); }
}

async function _loadEarnings() {
    try {
        const data = await _fetchCached('/api/dashboard/earnings');
        const el = document.getElementById('earningsTable');
        if (!el) return;
        const earnings = (data.earnings || []).filter(e => {
            if (!e.symbol || e.symbol === 'NA' || e.symbol === 'N/A') return false;
            if (!e.date || e.date === 'NA' || e.date === 'N/A') return false;
            if (e.name === 'NA' || e.name === 'N/A') e.name = '';
            return true;
        });
        if (!earnings.length) { el.innerHTML = '<div class="text-muted text-center py-2" style="font-size:12px;">No upcoming earnings</div>'; return; }
        el.innerHTML = '<div class="d-flex flex-wrap gap-2">' + earnings.slice(0, 12).map(e => {
            let timing = e.time === 'before' ? 'BMO' : e.time === 'after' ? 'AMC' : '';
            if (e.time && e.time !== 'before' && e.time !== 'after' && e.time !== 'NA' && e.time !== 'N/A' && e.time !== 'TAS') timing = e.time;
            const timingBg = timing === 'BMO' ? '#fff7ed' : timing === 'AMC' ? '#eff6ff' : '#f8f9fc';
            const timingColor = timing === 'BMO' ? '#e5873a' : timing === 'AMC' ? '#3b6df0' : '#6b7689';
            const displayName = (e.name && e.name !== 'NA' && e.name !== 'N/A') ? e.name : '';
            const displayDate = (e.date && e.date !== 'NA' && e.date !== 'N/A') ? e.date : '';
            return '<a href="/ticker/' + encodeURIComponent(e.symbol) + '" style="padding:8px 12px;border-radius:8px;border:1px solid #e2e6ee;background:#fff;min-width:100px;flex:1;text-decoration:none;display:block;transition:border-color 0.15s,box-shadow 0.15s;" onmouseover="this.style.borderColor=\'#3b6df0\';this.style.boxShadow=\'0 2px 8px rgba(0,0,0,0.08)\'" onmouseout="this.style.borderColor=\'#e2e6ee\';this.style.boxShadow=\'none\'">' +
                '<div style="font-size:13px;font-weight:700;color:#3b6df0;">' + e.symbol + '</div>' +
                (displayName ? '<div style="font-size:10px;color:#6b7689;margin:2px 0;">' + displayName + '</div>' : '') +
                '<div style="display:flex;gap:6px;align-items:center;">' +
                (displayDate ? '<span style="font-size:10px;color:#6b7689;">' + displayDate + '</span>' : '') +
                (timing ? '<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;background:' + timingBg + ';color:' + timingColor + ';">' + timing + '</span>' : '') +
                '</div></a>';
        }).join('') + '</div>';
    } catch (e) { console.error('Earnings error:', e); }
}

async function _loadNews() {
    try {
        const data = await _fetchCached('/api/dashboard/news');
        const el = document.getElementById('newsContainer');
        if (!el) return;
        const articles = data.articles || [];
        if (!articles.length) { el.innerHTML = '<div class="text-muted text-center py-2" style="font-size:12px;">No news available</div>'; return; }
        el.innerHTML = articles.slice(0, 8).map(a => {
            const date = a.published ? new Date(a.published).toLocaleDateString(undefined, {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : '';
            const thumb = a.thumbnail ? '<img src="' + a.thumbnail + '" style="width:48px;height:48px;border-radius:6px;object-fit:cover;flex-shrink:0;" onerror="this.style.display=\'none\'" />' : '';
            return '<a href="' + (a.link || '#') + '" target="_blank" rel="noopener" style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid #f0f1f4;text-decoration:none;color:inherit;">' +
                thumb +
                '<div style="flex:1;min-width:0;">' +
                '<div style="font-size:12px;font-weight:600;color:#1a1e2e;line-height:1.3;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">' + (a.title || '') + '</div>' +
                '<div style="font-size:10px;color:#6b7689;margin-top:2px;">' + (a.publisher || '') + (date ? ' \u00B7 ' + date : '') + '</div>' +
                '</div></a>';
        }).join('');
    } catch (e) { console.error('News error:', e); }
}

async function _loadTreasury() {
    try {
        const data = await _fetchCached('/api/dashboard/treasury');
        const el = document.getElementById('treasuryGrid');
        if (!el) return;
        const rates = data.rates || [];
        if (!rates.length) { el.innerHTML = '<div class="text-muted text-center py-2" style="grid-column:span 2;font-size:12px;">No data</div>'; return; }
        el.innerHTML = rates.map(r => {
            const change = r.change || 0;
            const isUp = change >= 0;
            const color = isUp ? '#0fad6e' : '#d94452';
            const arrow = isUp ? '\u25B2' : '\u25BC';
            return '<a href="/ticker/' + encodeURIComponent(r.symbol || '') + '" style="padding:8px 10px;border-radius:8px;background:#f8f9fc;text-align:center;display:block;text-decoration:none;transition:background 0.15s;" onmouseover="this.style.background=\'#eef2ff\'" onmouseout="this.style.background=\'#f8f9fc\'">' +
                '<div style="font-size:11px;font-weight:600;color:#6b7689;">' + (r.name || r.maturity || '') + '</div>' +
                '<div style="font-size:16px;font-weight:700;color:#1a1e2e;margin:2px 0;">' + _fmt(r.rate, 3, '\u2014') + '%</div>' +
                '<div style="font-size:10px;font-weight:600;color:' + color + ';">' + arrow + ' ' + _fmt(Math.abs(change), 3, '0.000') + '</div></a>';
        }).join('');
    } catch (e) { console.error('Treasury error:', e); }
}

async function _loadEconomicIndicators() {
    try {
        const data = await _fetchCached('/api/dashboard/economic');
        const el = document.getElementById('economicGrid');
        if (!el) return;
        const indicators = data.indicators || [];
        if (!indicators.length) { el.innerHTML = '<div class="text-muted text-center py-2" style="grid-column:span 2;font-size:12px;">No data</div>'; return; }
        el.innerHTML = indicators.map(ind => {
            const pct = ind.change_pct || 0;
            const isUp = pct >= 0;
            const color = ind.symbol === '^VIX' ? (isUp ? '#d94452' : '#0fad6e') : (isUp ? '#0fad6e' : '#d94452');
            const arrow = isUp ? '\u25B2' : '\u25BC';
            const formatted = ind.format === 'percent' ? _fmt(ind.price) + '%' : _fmt(ind.price);
            return '<a href="/ticker/' + encodeURIComponent(ind.symbol || '') + '" style="padding:8px 10px;border-radius:8px;background:#f8f9fc;text-align:center;display:block;text-decoration:none;transition:background 0.15s;" onmouseover="this.style.background=\'#eef2ff\'" onmouseout="this.style.background=\'#f8f9fc\'">' +
                '<div style="font-size:11px;font-weight:600;color:#6b7689;">' + (ind.name || ind.symbol || '') + '</div>' +
                '<div style="font-size:16px;font-weight:700;color:#1a1e2e;margin:2px 0;">' + formatted + '</div>' +
                '<div style="font-size:10px;font-weight:600;color:' + color + ';">' + arrow + ' ' + _fmt(Math.abs(pct)) + '%</div></a>';
        }).join('');
    } catch (e) { console.error('Economic indicators error:', e); }
}

const _fredCategoryColors = {
    'rates': '#3b82f6',
    'labor': '#8b5cf6',
    'inflation': '#ef4444',
    'output': '#10b981',
    'consumer': '#f59e0b',
    'housing': '#06b6d4'
};

async function _loadFredData() {
    try {
        const data = await _fetchCached('/api/dashboard/fred');
        const el = document.getElementById('fredGrid');
        if (!el) return;
        const series = data.series || [];
        if (!series.length) { el.innerHTML = '<div class="text-muted text-center py-2" style="grid-column:1/-1;font-size:12px;">No data</div>'; return; }
        el.innerHTML = series.map(s => {
            const chg = s.change || 0;
            const isUp = chg >= 0;
            const arrow = isUp ? '\u25B2' : '\u25BC';
            const color = isUp ? '#0fad6e' : '#d94452';
            const catColor = _fredCategoryColors[s.category] || '#6b7689';
            return '<div style="padding:10px 12px;border-radius:8px;background:#f8f9fc;text-align:center;border-left:3px solid ' + catColor + ';transition:background 0.15s;" onmouseover="this.style.background=\'#eef2ff\'" onmouseout="this.style.background=\'#f8f9fc\'">' +
                '<div style="font-size:10px;font-weight:600;color:#6b7689;text-transform:uppercase;letter-spacing:0.5px;">' + esc(s.name) + '</div>' +
                '<div style="font-size:18px;font-weight:700;color:#1a1e2e;margin:3px 0;">' + esc(s.display) + '</div>' +
                '<div style="font-size:10px;font-weight:600;color:' + color + ';">' + arrow + ' ' + esc(s.change_display || '') + '</div>' +
                '<div style="font-size:9px;color:#9aa5b4;margin-top:2px;">' + esc(s.date) + '</div>' +
                '</div>';
        }).join('');
    } catch (e) { console.error('FRED data error:', e); }
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
                <a href="/ticker/${encodeURIComponent(item.symbol)}" class="stock-item" style="text-decoration:none;color:inherit;display:flex;">
                    <div class="stock-info">
                        <span class="symbol">${item.symbol}</span>
                        <span class="volume">Vol: ${formatVolume(item.volume)}</span>
                    </div>
                    <div class="stock-price">
                        <span class="price">$${_fmt(item.price)}</span>
                        <span class="change positive">+${_fmt(item.change_pct)}%</span>
                    </div>
                </a>
            `).join('');
        } else {
            gainersContainer.innerHTML = '<div class="gainers-empty"><i class="material-symbols-rounded">trending_up</i><p>No gainers data</p></div>';
        }
        
        // Render losers
        if (data.losers && data.losers.length > 0) {
            losersContainer.innerHTML = data.losers.map(item => `
                <a href="/ticker/${encodeURIComponent(item.symbol)}" class="stock-item" style="text-decoration:none;color:inherit;display:flex;">
                    <div class="stock-info">
                        <span class="symbol">${item.symbol}</span>
                        <span class="volume">Vol: ${formatVolume(item.volume)}</span>
                    </div>
                    <div class="stock-price">
                        <span class="price">$${_fmt(item.price)}</span>
                        <span class="change negative">${_fmt(item.change_pct)}%</span>
                    </div>
                </a>
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
                    <span class="price">$${_fmt(item.price)}</span>
                    <span class="change ${item.change >= 0 ? 'positive' : 'negative'}">
                        ${item.change >= 0 ? '+' : ''}${_fmt(item.change)} (${item.change >= 0 ? '+' : ''}${_fmt(item.change_pct)}%)
                    </span>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading watchlist:', error);
        container.innerHTML = '<div class="watchlist-loading">Failed to load watchlist</div>';
    }
}

// ── Global Search Autocomplete ──────────────────────────────────────────────
(function () {
    const input    = document.getElementById('globalSearch');
    const dropdown = document.getElementById('searchDropdown');
    if (!input || !dropdown) return;

    let debounceTimer = null;
    let activeIndex   = -1;
    let lastResults   = [];

    function escHtml(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function typeLabel(t) {
        const map = { EQUITY:'Stock', ETF:'ETF', INDEX:'Index', MUTUALFUND:'Fund', CURRENCY:'FX', CRYPTOCURRENCY:'Crypto', FUTURE:'Future' };
        return map[t] || t || '';
    }

    function typeColor(t) {
        const map = { EQUITY:'#4e73df', ETF:'#1cc88a', INDEX:'#36b9cc', CRYPTOCURRENCY:'#f6c23e', CURRENCY:'#858796' };
        return map[t] || '#888';
    }

    function renderDropdown(results) {
        lastResults = results;
        activeIndex = -1;
        if (!results.length) { closeDropdown(); return; }

        dropdown.innerHTML = results.map((r, i) => `
            <div class="search-ac-item" data-index="${i}" style="
                display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;
                border-bottom:1px solid #f0f2f5;transition:background .12s;
            ">
                <div style="display:flex;flex-direction:column;flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="font-weight:700;font-size:13px;color:#222;">${escHtml(r.symbol)}</span>
                        <span style="font-size:10px;padding:1px 5px;border-radius:3px;background:${typeColor(r.type)};color:#fff;">${escHtml(typeLabel(r.type))}</span>
                        ${r.exchange ? `<span style="font-size:10px;color:#aaa;">${escHtml(r.exchange)}</span>` : ''}
                    </div>
                    ${r.name ? `<div style="font-size:11px;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(r.name)}</div>` : ''}
                </div>
                <i class="fas fa-external-link-alt" style="color:#ccc;font-size:10px;flex-shrink:0;"></i>
            </div>
        `).join('');

        dropdown.style.display = 'block';

        dropdown.querySelectorAll('.search-ac-item').forEach(el => {
            el.addEventListener('mouseenter', () => {
                clearActive();
                el.style.background = '#f5f8ff';
                activeIndex = parseInt(el.dataset.index);
            });
            el.addEventListener('mouseleave', () => { el.style.background = ''; });
            el.addEventListener('mousedown', (ev) => {
                ev.preventDefault();
                selectResult(parseInt(el.dataset.index));
            });
        });
    }

    function clearActive() {
        dropdown.querySelectorAll('.search-ac-item').forEach(el => { el.style.background = ''; });
    }

    function setActive(idx) {
        clearActive();
        activeIndex = idx;
        const items = dropdown.querySelectorAll('.search-ac-item');
        if (items[idx]) items[idx].style.background = '#f5f8ff';
    }

    function selectResult(idx) {
        const r = lastResults[idx];
        if (!r) return;
        input.value = r.symbol;
        closeDropdown();
        window.location.href = `/ticker/${encodeURIComponent(r.symbol)}`;
    }

    function closeDropdown() {
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
        activeIndex = -1;
    }

    async function fetchSuggestions(q) {
        try {
            const res  = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
            const data = await res.json();
            renderDropdown(data.results || []);
        } catch (_) { closeDropdown(); }
    }

    input.addEventListener('input', () => {
        const q = input.value.trim();
        clearTimeout(debounceTimer);
        if (q.length < 1) { closeDropdown(); return; }
        debounceTimer = setTimeout(() => fetchSuggestions(q), 220);
    });

    input.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('.search-ac-item');
        if (!items.length) {
            if (e.key === 'Enter' && input.value.trim()) {
                window.location.href = `/ticker/${encodeURIComponent(input.value.trim().toUpperCase())}`;
            }
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive(Math.min(activeIndex + 1, items.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive(Math.max(activeIndex - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0) selectResult(activeIndex);
            else if (input.value.trim()) window.location.href = `/ticker/${encodeURIComponent(input.value.trim().toUpperCase())}`;
        } else if (e.key === 'Escape') {
            closeDropdown();
        }
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) closeDropdown();
    });
})();

// ── Header Notifications Modal ──────────────────────────────────────────────
let _headerNotifs = [];

function _hEsc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(String(s)));
    return d.innerHTML;
}

function _timeAgo(isoStr) {
    if (!isoStr) return '';
    const diff = (Date.now() - new Date(isoStr).getTime()) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return new Date(isoStr).toLocaleDateString();
}

function _formatFullTime(isoStr) {
    if (!isoStr) return 'Unknown';
    const d = new Date(isoStr);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

async function loadUnreadNotifCount() {
    if (!isAuthenticated) return;
    try {
        const res = await authFetch('/api/notifications/unread-count');
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success) return;
        const badge = document.getElementById('notificationBadge');
        if (!badge) return;
        const count = data.count || 0;
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = '';
        } else {
            badge.style.display = 'none';
        }
    } catch (e) { }
}

window.loadUnreadNotifCount = loadUnreadNotifCount;
setInterval(() => { if (isAuthenticated) loadUnreadNotifCount(); }, 60000);

async function openHeaderNotifModal() {
    if (!isAuthenticated) { navigateToPage('notifications'); return; }
    const modal = document.getElementById('headerNotifModal');
    if (!modal) return;
    modal.style.display = 'flex';
    document.getElementById('headerNotifBackBtn').style.display = 'none';
    document.getElementById('headerNotifTitle').textContent = 'Notifications';
    document.getElementById('headerNotifBody').innerHTML = '<div style="padding:30px;text-align:center;color:#8d9498;">Loading...</div>';

    authFetch('/api/notifications/mark-viewed', { method: 'POST' }).catch(() => {});
    const badge = document.getElementById('notificationBadge');
    if (badge) badge.style.display = 'none';

    try {
        const res = await authFetch('/api/notifications/recent?limit=50');
        const data = await res.json();
        _headerNotifs = (data.success && data.notifications) ? data.notifications : [];
        renderHeaderNotifList();
    } catch (e) {
        document.getElementById('headerNotifBody').innerHTML = '<div style="padding:30px;text-align:center;color:#999;">Failed to load notifications</div>';
    }
}

function renderHeaderNotifList() {
    const body = document.getElementById('headerNotifBody');
    document.getElementById('headerNotifBackBtn').style.display = 'none';
    document.getElementById('headerNotifTitle').textContent = 'Notifications';

    if (!_headerNotifs.length) {
        body.innerHTML = '<div style="padding:40px 20px;text-align:center;color:#8d9498;"><i class="fas fa-bell-slash" style="font-size:28px;margin-bottom:10px;display:block;opacity:0.4;"></i>No notifications yet</div>';
        return;
    }

    body.innerHTML = _headerNotifs.map((n, i) => {
        const count = n.symbols_found || 0;
        const preview = (n.results || []).slice(0, 3).map(r => r.symbol || r.ticker || '').filter(Boolean).join(', ');
        const more = count > 3 ? ` +${count - 3} more` : '';
        const iconBg = count > 0 ? '#f0fdf4' : '#f0f4ff';
        const icon = count > 0
            ? '<i class="fas fa-chart-line" style="color:#31cb9e;font-size:14px;"></i>'
            : '<i class="fas fa-search" style="color:#1b55e2;font-size:14px;"></i>';
        return `<div onclick="showHeaderNotifDetail(${i})" style="display:flex;align-items:flex-start;gap:12px;padding:12px 20px;border-bottom:1px solid #f0f2f5;cursor:pointer;transition:background .12s;" onmouseenter="this.style.background='#f8f9fa'" onmouseleave="this.style.background=''">
            <div style="width:36px;height:36px;border-radius:50%;background:${iconBg};display:flex;align-items:center;justify-content:center;flex-shrink:0;">${icon}</div>
            <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:600;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_hEsc(n.scanner_name)}</div>
                <div style="font-size:12px;color:#666;margin-top:2px;">${count} symbol${count !== 1 ? 's' : ''} found${preview ? ': ' + _hEsc(preview) + _hEsc(more) : ''}</div>
                <div style="font-size:11px;color:#aaa;margin-top:3px;">${_timeAgo(n.time)}</div>
            </div>
            <i class="fas fa-chevron-right" style="color:#ccc;font-size:11px;margin-top:4px;flex-shrink:0;"></i>
        </div>`;
    }).join('');
}

function showHeaderNotifDetail(index) {
    const n = _headerNotifs[index];
    if (!n) return;
    const body = document.getElementById('headerNotifBody');
    document.getElementById('headerNotifBackBtn').style.display = '';
    document.getElementById('headerNotifTitle').textContent = n.scanner_name;

    let resultsHtml = '';
    if (n.results && n.results.length > 0) {
        resultsHtml = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;">';
        n.results.forEach(r => {
            const rawTicker = r.ticker || r.symbol || r.name || 'N/A';
            const ticker = rawTicker.includes(':') ? rawTicker.split(':').pop() : rawTicker;
            const displayName = r.name || ticker;
            const change = r.change || 0;
            const price = r.close || 0;
            const cls = change >= 0 ? '#2e7d32' : '#c62828';
            const encodedTicker = encodeURIComponent(ticker);
            resultsHtml += `<div data-ticker="${_hEsc(encodedTicker)}" class="hdr-notif-ticker-item" style="background:#f8f9fa;border-radius:8px;padding:12px;text-align:center;cursor:pointer;border:1px solid transparent;transition:all .2s;" onmouseenter="this.style.background='#e8f0fe';this.style.borderColor='#1b55e2'" onmouseleave="this.style.background='#f8f9fa';this.style.borderColor='transparent'">
                <div style="font-weight:600;font-size:14px;color:#1b55e2;text-decoration:underline;">${_hEsc(displayName)}</div>
                <div style="font-size:13px;margin-top:4px;color:${cls}">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</div>
                ${price ? `<div style="font-size:12px;color:#888;margin-top:2px;">$${price.toFixed(2)}</div>` : ''}
            </div>`;
        });
        resultsHtml += '</div>';
    } else {
        resultsHtml = '<p style="color:#888;">No results data available.</p>';
    }

    setTimeout(() => {
        document.querySelectorAll('.hdr-notif-ticker-item').forEach(el => {
            el.addEventListener('click', () => {
                closeHeaderNotifModal();
                window.location.href = '/ticker/' + el.getAttribute('data-ticker');
            });
        });
    }, 0);

    let filterHtml = '';
    try {
        let fc = n.filter_config;
        if (typeof fc === 'string') { try { fc = JSON.parse(fc); } catch(e) {} }
        if (Array.isArray(fc)) {
            filterHtml = '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">';
            fc.forEach(f => {
                filterHtml += `<div style="background:#f0f4ff;border-radius:6px;padding:6px 12px;"><span style="font-size:11px;color:#64748b;display:block;">${_hEsc(f.column || f.field || 'Filter')}</span><span style="font-size:13px;font-weight:500;color:#1e293b;">${_hEsc((f.operator || '') + ' ' + (f.value != null ? f.value : ''))}</span></div>`;
            });
            filterHtml += '</div>';
        } else if (typeof fc === 'string') {
            filterHtml = `<p style="margin-bottom:12px;"><strong>Filter:</strong> ${_hEsc(fc)}</p>`;
        }
    } catch(e) {}

    body.innerHTML = `<div style="padding:20px;">
        <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
            <div style="background:#f0f4ff;border-radius:8px;padding:10px 16px;flex:1;min-width:120px;">
                <div style="font-size:11px;color:#64748b;text-transform:uppercase;">Time</div>
                <div style="font-size:14px;font-weight:500;color:#1e293b;">${_formatFullTime(n.time)}</div>
            </div>
            <div style="background:#f0fdf4;border-radius:8px;padding:10px 16px;flex:1;min-width:120px;">
                <div style="font-size:11px;color:#64748b;text-transform:uppercase;">Symbols Found</div>
                <div style="font-size:14px;font-weight:500;color:#1e293b;">${n.symbols_found || 0}</div>
            </div>
        </div>
        ${filterHtml ? '<h5 style="margin-bottom:10px;font-size:14px;color:#475569;">Filter Parameters</h5>' + filterHtml : ''}
        <h5 style="margin-top:16px;margin-bottom:12px;font-size:14px;color:#475569;">All Results</h5>
        ${resultsHtml}
    </div>`;
}

function headerNotifGoBack() {
    renderHeaderNotifList();
}

function closeHeaderNotifModal() {
    const modal = document.getElementById('headerNotifModal');
    if (modal) modal.style.display = 'none';
}

// ── Mobile Search ───────────────────────────────────────────────────────────
function openMobileSearch() {
    const overlay = document.getElementById('mobileSearchOverlay');
    if (!overlay) return;
    overlay.style.display = 'block';
    const input = document.getElementById('mobileSearchInput');
    if (input) { input.value = ''; input.focus(); }
    document.getElementById('mobileSearchResults').innerHTML = '';
}

function closeMobileSearch() {
    const overlay = document.getElementById('mobileSearchOverlay');
    if (overlay) overlay.style.display = 'none';
}

(function() {
    const input = document.getElementById('mobileSearchInput');
    const results = document.getElementById('mobileSearchResults');
    const overlay = document.getElementById('mobileSearchOverlay');
    if (!input || !results) return;

    let debounce = null;

    input.addEventListener('input', () => {
        clearTimeout(debounce);
        const q = input.value.trim();
        if (q.length < 1) { results.innerHTML = ''; return; }
        debounce = setTimeout(async () => {
            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
                const data = await res.json();
                const items = data.results || [];
                if (!items.length) {
                    results.innerHTML = '<div style="padding:12px;color:#888;font-size:13px;text-align:center;">No results</div>';
                    return;
                }
                results.innerHTML = items.map(r => {
                    const typeMap = { EQUITY:'Stock', ETF:'ETF', INDEX:'Index', MUTUALFUND:'Fund', CURRENCY:'FX', CRYPTOCURRENCY:'Crypto' };
                    const colorMap = { EQUITY:'#4e73df', ETF:'#1cc88a', INDEX:'#36b9cc', CRYPTOCURRENCY:'#f6c23e' };
                    return `<div onclick="closeMobileSearch();window.location.href='/ticker/${encodeURIComponent(r.symbol)}'" style="display:flex;align-items:center;gap:10px;padding:10px 4px;cursor:pointer;border-bottom:1px solid #f0f2f5;" onmouseenter="this.style.background='#f5f8ff'" onmouseleave="this.style.background=''">
                        <div style="flex:1;min-width:0;">
                            <div style="display:flex;align-items:center;gap:6px;">
                                <span style="font-weight:700;font-size:13px;color:#222;">${_hEsc(r.symbol)}</span>
                                <span style="font-size:10px;padding:1px 5px;border-radius:3px;background:${colorMap[r.type]||'#888'};color:#fff;">${_hEsc(typeMap[r.type]||r.type||'')}</span>
                            </div>
                            ${r.name ? `<div style="font-size:11px;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_hEsc(r.name)}</div>` : ''}
                        </div>
                    </div>`;
                }).join('');
            } catch(e) { results.innerHTML = ''; }
        }, 250);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMobileSearch();
        if (e.key === 'Enter') {
            const q = input.value.trim();
            if (q) { closeMobileSearch(); window.location.href = `/ticker/${encodeURIComponent(q)}`; }
        }
    });

    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeMobileSearch();
        });
    }
})();

// Close header notif modal on overlay click
(function() {
    const modal = document.getElementById('headerNotifModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeHeaderNotifModal();
        });
    }
})();

// ── Guest Dashboard Data Feeds ──────────────────────────────────────────────
(function() {
    if (isAuthenticated) return;
    const guestFeeds = document.getElementById('guestDataFeeds');
    if (!guestFeeds) return;

    function _esc(s) { const d=document.createElement('div'); d.textContent=s||''; return d.innerHTML; }

    async function _fetch(url) {
        const r = await fetch(url);
        return r.json();
    }

    async function loadGuestIndices() {
        try {
            const data = await _fetch('/api/dashboard/indices');
            const el = document.getElementById('guestIndicesBar');
            if (!el) return;
            const indices = data.indices || [];
            if (!indices.length) { el.innerHTML='<div class="text-muted text-center w-100" style="font-size:12px;">No data</div>'; return; }
            el.innerHTML = indices.map(idx => {
                const isUp = idx.change >= 0;
                const color = idx.symbol==='UVXY' ? (idx.change_pct>10?'#d94452':idx.change_pct>3?'#e5873a':'#0fad6e') : (isUp?'#0fad6e':'#d94452');
                return `<a href="/ticker/${encodeURIComponent(idx.symbol||'')}" class="text-center" style="flex:1;min-width:90px;cursor:pointer;text-decoration:none;display:block;border-radius:6px;padding:4px 2px;transition:background .12s;" onmouseover="this.style.background='#f0f4ff'" onmouseout="this.style.background='transparent'">
                    <div style="font-size:11px;font-weight:600;color:#6b7689;">${idx.symbol}</div>
                    <div style="font-size:15px;font-weight:700;color:#1a1e2e;">${idx.price?'$'+idx.price.toLocaleString(undefined,{minimumFractionDigits:2}):'—'}</div>
                    <div style="font-size:11px;font-weight:600;color:${color};">${isUp?'▲':'▼'} ${isUp?'+':''}${idx.change_pct.toFixed(2)}%</div>
                </a>`;
            }).join('');
        } catch(e) { const el=document.getElementById('guestIndicesBar'); if(el) el.innerHTML='<div class="text-muted text-center w-100" style="font-size:12px;">Unable to load</div>'; }
    }

    async function loadGuestGainersLosers() {
        try {
            const data = await _fetch('/api/dashboard/gainers-losers');
            renderGuestMovers('guestGainersTable', data.gainers||[], true);
            renderGuestMovers('guestLosersTable', data.losers||[], false);
        } catch(e) {
            ['guestGainersTable','guestLosersTable'].forEach(id => { const el=document.getElementById(id); if(el) el.innerHTML='<div class="text-muted text-center py-2" style="font-size:12px;">Unable to load</div>'; });
        }
    }

    function renderGuestMovers(id, items, isGainers) {
        const el=document.getElementById(id); if(!el) return;
        if(!items.length) { el.innerHTML='<div class="text-muted text-center py-2" style="font-size:12px;">No data</div>'; return; }
        el.innerHTML = items.slice(0,8).map(item => {
            const pct=item.change_pct||item.change_percent||item.todaysChangePerc||0;
            const color=isGainers?'#0fad6e':'#d94452';
            return `<a href="/ticker/${encodeURIComponent(item.symbol||'')}" class="d-flex justify-content-between align-items-center py-1" style="border-bottom:1px solid #f0f2f6;font-size:13px;text-decoration:none;color:inherit;cursor:pointer;transition:background .12s;" onmouseover="this.style.background='#f5f7ff'" onmouseout="this.style.background='transparent'">
                <span style="font-weight:600;color:#3b6df0;">${item.symbol||'N/A'}</span>
                <span style="font-weight:600;color:${color};">${isGainers?'▲':'▼'} ${Math.abs(pct).toFixed(2)}%</span>
            </a>`;
        }).join('');
    }

    async function loadGuestNews() {
        try {
            const data = await _fetch('/api/dashboard/news');
            const el = document.getElementById('guestNewsContainer'); if(!el) return;
            const articles = data.articles||[];
            if(!articles.length) { el.innerHTML='<div class="text-muted text-center py-2" style="font-size:12px;">No news</div>'; return; }
            function safeUrl(u){if(!u)return'#';try{const x=new URL(u);return(x.protocol==='https:'||x.protocol==='http:')?x.href:'#';}catch{return'#';}}
            function timeAgo(d){if(!d)return'';const m=Math.floor((Date.now()-new Date(d).getTime())/60000);if(m<60)return m+'m ago';const h=Math.floor(m/60);if(h<24)return h+'h ago';return Math.floor(h/24)+'d ago';}
            el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;">
                ${articles.slice(0,8).map(a => `<a href="${safeUrl(a.link)}" target="_blank" rel="noopener" style="text-decoration:none;display:block;padding:10px 12px;border-radius:8px;border:1px solid #e2e6ee;background:#fff;transition:box-shadow .15s,border-color .15s;" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)';this.style.borderColor='#3b6df0'" onmouseout="this.style.boxShadow='none';this.style.borderColor='#e2e6ee'">
                    <div style="font-size:12px;font-weight:600;color:#1a1e2e;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${_esc(a.title)}</div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
                        <span style="font-size:10px;color:#3b6df0;font-weight:600;">${_esc(a.publisher)}</span>
                        <span style="font-size:10px;color:#6b7689;">${timeAgo(a.published)}</span>
                    </div>
                </a>`).join('')}
            </div>`;
        } catch(e) { const el=document.getElementById('guestNewsContainer'); if(el) el.innerHTML='<div class="text-muted text-center py-2" style="font-size:12px;">Unable to load</div>'; }
    }

    async function loadGuestTreasury() {
        try {
            const data = await _fetch('/api/dashboard/treasury');
            const el = document.getElementById('guestTreasuryGrid'); if(!el) return;
            const rates = data.rates||[];
            if(!rates.length) { el.innerHTML='<div class="text-muted text-center py-2" style="grid-column:span 2;font-size:12px;">No data</div>'; return; }
            el.innerHTML = rates.map(r => {
                const isUp=r.change>=0; const color=isUp?'#d94452':'#0fad6e'; const bg=isUp?'rgba(217,68,82,0.06)':'rgba(15,173,110,0.06)';
                return `<div style="padding:10px 12px;border-radius:8px;background:${bg};text-align:center;">
                    <div style="font-size:11px;font-weight:600;color:#6b7689;">${r.name} Treasury</div>
                    <div style="font-size:18px;font-weight:700;color:#1a1e2e;margin:2px 0;">${r.rate.toFixed(3)}%</div>
                    <div style="font-size:11px;font-weight:600;color:${color};">${isUp?'▲':'▼'} ${Math.abs(r.change).toFixed(3)}%</div>
                </div>`;
            }).join('');
        } catch(e) { const el=document.getElementById('guestTreasuryGrid'); if(el) el.innerHTML='<div class="text-muted text-center py-2" style="grid-column:span 2;font-size:12px;">Unable to load</div>'; }
    }

    async function loadGuestEconomic() {
        try {
            const data = await _fetch('/api/dashboard/economic');
            const el = document.getElementById('guestEconomicGrid'); if(!el) return;
            const indicators = data.indicators||[];
            if(!indicators.length) { el.innerHTML='<div class="text-muted text-center py-2" style="grid-column:span 2;font-size:12px;">No data</div>'; return; }
            const iconMap={'VIX':'fas fa-chart-area','US Dollar (DXY)':'fas fa-dollar-sign','Gold':'fas fa-coins','Crude Oil':'fas fa-gas-pump','Bitcoin':'fab fa-bitcoin','Silver':'fas fa-ring'};
            el.innerHTML = indicators.map(ind => {
                const isUp=ind.change>=0;
                const color=ind.name==='VIX'?(isUp?'#d94452':'#0fad6e'):(isUp?'#0fad6e':'#d94452');
                const bg=isUp?(ind.name==='VIX'?'rgba(217,68,82,0.06)':'rgba(15,173,110,0.06)'):(ind.name==='VIX'?'rgba(15,173,110,0.06)':'rgba(217,68,82,0.06)');
                const icon=iconMap[ind.name]||'fas fa-chart-line';
                const priceStr=ind.format==='currency'?'$'+ind.price.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):ind.price.toFixed(2);
                return `<div style="padding:10px 12px;border-radius:8px;background:${bg};text-align:center;">
                    <div style="font-size:11px;font-weight:600;color:#6b7689;"><i class="${icon}" style="margin-right:4px;"></i>${ind.name}</div>
                    <div style="font-size:16px;font-weight:700;color:#1a1e2e;margin:2px 0;">${priceStr}</div>
                    <div style="font-size:11px;font-weight:600;color:${color};">${isUp?'▲':'▼'} ${isUp?'+':''}${ind.change_pct.toFixed(2)}%</div>
                </div>`;
            }).join('');
        } catch(e) { const el=document.getElementById('guestEconomicGrid'); if(el) el.innerHTML='<div class="text-muted text-center py-2" style="grid-column:span 2;font-size:12px;">Unable to load</div>'; }
    }

    loadGuestIndices();
    loadGuestGainersLosers();
    loadGuestNews();
    loadGuestTreasury();
    loadGuestEconomic();
})();
