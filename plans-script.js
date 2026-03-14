// Plans Page Script - Embedded Stripe Payments
console.log('Initializing Plans Page');

const PLAN_DETAILS = {
    'free': { name: 'Free Plan', price: 0 },
    'stocks-basic': { name: 'Stocks Basic', price: 0 },
    'stocks-starter': { name: 'Stocks Starter', price: 29 },
    'stocks-developer': { name: 'Stocks Developer', price: 79 },
    'stocks-advanced': { name: 'Stocks Advanced', price: 199 },
    'options-starter': { name: 'Options Starter', price: 49 },
    'options-developer': { name: 'Options Developer', price: 129 },
    'options-advanced': { name: 'Options Advanced', price: 299 }
};

let userSelectedPlan = null;
let currentUserPlan = 'free';
let isAnnualBilling = false;

let stripe = null;
let elements = null;
let cardElement = null;
let currentClientSecret = null;
let currentSubscriptionId = null;

function initPlansPage() {
    console.log('Plans page initialized');
    
    setupBillingToggle();
    setupPlanButtons();
    loadUserPlanInfo();
    checkForPaymentSetup();
    loadStripeJs();
}

async function loadStripeJs() {
    if (window.Stripe) {
        console.log('Stripe.js already loaded');
        return;
    }
    
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://js.stripe.com/v3/';
        script.onload = () => {
            console.log('Stripe.js loaded successfully');
            resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function setupBillingToggle() {
    const billingToggle = document.getElementById('billingToggle');
    if (billingToggle) {
        billingToggle.addEventListener('change', function() {
            isAnnualBilling = this.checked;
            console.log('Billing period:', isAnnualBilling ? 'Annual' : 'Monthly');
            updatePriceDisplay();
        });
    }
}

function updatePriceDisplay() {
    const priceElements = document.querySelectorAll('.pricing-card .price');
    priceElements.forEach(el => {
        const monthly = parseInt(el.dataset.monthly) || 0;
        const annual = parseInt(el.dataset.annual) || 0;
        el.textContent = '$' + (isAnnualBilling ? annual : monthly);
    });
}

function setupPlanButtons() {
    const planButtons = document.querySelectorAll('.btn-plan-select');
    console.log('Found plan buttons:', planButtons.length);
    planButtons.forEach(btn => {
        const planId = btn.dataset.planId;
        console.log('Setting up button for plan:', planId);
        btn.onclick = function(e) {
            e.preventDefault();
            console.log('Button clicked for plan:', planId);
            if (planId && planId !== currentUserPlan && !btn.disabled) {
                upgradeToPlan(planId);
            }
        };
    });
}

async function loadUserPlanInfo() {
    try {
        const response = await authFetch('/api/user/info');
        if (response.ok) {
            const userData = await response.json();
            currentUserPlan = userData.selected_plan || 'free';
            userSelectedPlan = currentUserPlan;
            updateCurrentPlanDisplay(userData);
            updatePlanButtonStates();
        }
    } catch (error) {
        console.error('Error loading user info:', error);
    }
}

function updateCurrentPlanDisplay(userData) {
    const planNameEl = document.getElementById('currentPlanName');
    const planPriceEl = document.getElementById('currentPlanPrice');
    const planRenewalEl = document.getElementById('currentPlanRenewal');
    const manageBtn = document.getElementById('manageSubBtn');
    
    const planInfo = PLAN_DETAILS[currentUserPlan] || PLAN_DETAILS['free'];
    
    if (planNameEl) planNameEl.textContent = planInfo.name;
    if (planPriceEl) planPriceEl.textContent = '$' + planInfo.price;
    
    if (userData.stripe_subscription_id) {
        if (planRenewalEl) planRenewalEl.textContent = 'Active subscription';
        if (manageBtn) manageBtn.style.display = 'inline-block';
    } else {
        if (planRenewalEl) planRenewalEl.textContent = currentUserPlan === 'free' ? 'Free forever' : 'Payment pending';
    }
}

function updatePlanButtonStates() {
    const planCards = document.querySelectorAll('.pricing-card');
    planCards.forEach(card => {
        const planId = card.dataset.plan;
        const btn = card.querySelector('.btn-plan-select');
        
        if (planId === currentUserPlan || (currentUserPlan === 'free' && planId === 'stocks-basic')) {
            if (btn) {
                btn.textContent = 'Current Plan';
                btn.classList.add('disabled');
                btn.disabled = true;
            }
        } else {
            if (btn) {
                btn.textContent = 'Upgrade';
                btn.classList.remove('disabled');
                btn.disabled = false;
            }
        }
    });
}

async function upgradeToPlan(planId) {
    const planInfo = PLAN_DETAILS[planId];
    if (!planInfo || planInfo.price === 0) {
        await authFetch('/api/user/update-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan: planId })
        });
        location.reload();
        return;
    }
    
    userSelectedPlan = planId;
    showPaymentModal(planId);
}

async function checkForPaymentSetup() {
    const urlParams = new URLSearchParams(window.location.search);
    const setupPayment = urlParams.get('setup_payment');
    const paymentStatus = urlParams.get('payment');
    
    if (paymentStatus === 'success') {
        showNotification('Payment successful! Your subscription is now active.', 'success');
        const url = new URL(window.location);
        url.searchParams.delete('payment');
        window.history.replaceState({}, '', url);
        return;
    }
    
    if (paymentStatus === 'cancelled') {
        showNotification('Payment was cancelled.', 'warning');
        const url = new URL(window.location);
        url.searchParams.delete('payment');
        window.history.replaceState({}, '', url);
    }
    
    if (setupPayment === 'true') {
        console.log('Payment setup required, fetching user info...');
        try {
            const response = await authFetch('/api/user/info');
            if (response.ok) {
                const userData = await response.json();
                userSelectedPlan = userData.selected_plan;
                
                if (userSelectedPlan && userSelectedPlan !== 'free' && !userData.stripe_subscription_id) {
                    showPaymentModal(userSelectedPlan);
                }
            }
        } catch (error) {
            console.error('Error fetching user info:', error);
        }
    }
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="material-symbols-rounded">${type === 'success' ? 'check_circle' : 'warning'}</i>
        <span>${message}</span>
    `;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        background: ${type === 'success' ? '#10b981' : '#f59e0b'};
        color: white;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

async function showPaymentModal(planId) {
    const modal = document.getElementById('paymentSetupModal');
    const planNameEl = document.getElementById('modalPlanName');
    const planPriceEl = document.getElementById('modalPlanPrice');
    
    if (!modal) return;
    
    const planInfo = PLAN_DETAILS[planId] || { name: planId, price: 0 };
    
    if (planNameEl) planNameEl.textContent = planInfo.name;
    if (planPriceEl) planPriceEl.textContent = '$' + planInfo.price;
    
    resetPaymentModalState();
    
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    await initializeEmbeddedPayment(planId);
}

function resetPaymentModalState() {
    const loadingEl = document.getElementById('paymentLoading');
    const formWrapper = document.getElementById('paymentFormWrapper');
    const successEl = document.getElementById('paymentSuccess');
    const errorEl = document.getElementById('card-errors');
    
    if (loadingEl) loadingEl.style.display = 'flex';
    if (formWrapper) formWrapper.style.display = 'none';
    if (successEl) successEl.style.display = 'none';
    if (errorEl) errorEl.textContent = '';
    
    const submitBtn = document.getElementById('submitPaymentBtn');
    const submitText = document.getElementById('submitPaymentText');
    if (submitBtn) submitBtn.disabled = false;
    if (submitText) submitText.textContent = 'Subscribe Now';
}

async function initializeEmbeddedPayment(planId) {
    try {
        await loadStripeJs();
        
        const response = await authFetch('/api/stripe/create-subscription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan_id: planId })
        });
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        currentClientSecret = data.client_secret;
        currentSubscriptionId = data.subscription_id;
        
        if (!stripe) {
            stripe = Stripe(data.publishable_key);
        }
        
        elements = stripe.elements({
            clientSecret: currentClientSecret,
            appearance: {
                theme: 'stripe',
                variables: {
                    colorPrimary: '#14b8a6',
                    colorBackground: '#ffffff',
                    colorText: '#1e293b',
                    colorDanger: '#ef4444',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    borderRadius: '10px',
                    spacingUnit: '4px'
                },
                rules: {
                    '.Input': {
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        boxShadow: 'none',
                        padding: '12px'
                    },
                    '.Input:focus': {
                        border: '1px solid #14b8a6',
                        boxShadow: '0 0 0 3px rgba(20, 184, 166, 0.1)'
                    },
                    '.Label': {
                        color: '#64748b',
                        fontWeight: '500'
                    }
                }
            }
        });
        
        cardElement = elements.create('payment');
        
        const cardContainer = document.getElementById('card-element');
        if (cardContainer) {
            cardContainer.innerHTML = '';
            cardElement.mount('#card-element');
        }
        
        cardElement.on('change', (event) => {
            const errorEl = document.getElementById('card-errors');
            if (errorEl) {
                errorEl.textContent = event.error ? event.error.message : '';
            }
        });
        
        const loadingEl = document.getElementById('paymentLoading');
        const formWrapper = document.getElementById('paymentFormWrapper');
        
        if (loadingEl) loadingEl.style.display = 'none';
        if (formWrapper) formWrapper.style.display = 'block';
        
    } catch (error) {
        console.error('Error initializing payment:', error);
        const loadingEl = document.getElementById('paymentLoading');
        if (loadingEl) {
            loadingEl.innerHTML = `
                <i class="material-symbols-rounded" style="font-size: 48px; color: #ef4444;">error</i>
                <p style="color: #ef4444;">Failed to initialize payment: ${error.message}</p>
                <button class="btn-secondary-skip" onclick="closePaymentModal()" style="margin-top: 16px;">Close</button>
            `;
        }
    }
}

async function submitPayment() {
    const submitBtn = document.getElementById('submitPaymentBtn');
    const submitText = document.getElementById('submitPaymentText');
    const errorEl = document.getElementById('card-errors');
    
    if (!stripe || !elements || !currentClientSecret) {
        if (errorEl) errorEl.textContent = 'Payment not initialized. Please try again.';
        return;
    }
    
    if (submitBtn) submitBtn.disabled = true;
    if (submitText) submitText.textContent = 'Processing...';
    if (errorEl) errorEl.textContent = '';
    
    try {
        const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                return_url: window.location.origin + '/dashboard?section=plans&payment=success',
            },
            redirect: 'if_required'
        });
        
        if (error) {
            throw new Error(error.message);
        }
        
        if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
            const confirmResponse = await authFetch('/api/stripe/confirm-subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscription_id: currentSubscriptionId })
            });
            
            const confirmData = await confirmResponse.json();
            
            if (confirmData.success) {
                showPaymentSuccess();
            } else {
                setTimeout(async () => {
                    const retryResponse = await authFetch('/api/stripe/confirm-subscription', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ subscription_id: currentSubscriptionId })
                    });
                    const retryData = await retryResponse.json();
                    if (retryData.success) {
                        showPaymentSuccess();
                    } else {
                        showPaymentSuccess();
                    }
                }, 2000);
            }
        } else {
            throw new Error('Payment was not completed. Please try again.');
        }
        
    } catch (error) {
        console.error('Payment error:', error);
        if (errorEl) errorEl.textContent = error.message;
        if (submitBtn) submitBtn.disabled = false;
        if (submitText) submitText.textContent = 'Subscribe Now';
    }
}

function showPaymentSuccess() {
    const formWrapper = document.getElementById('paymentFormWrapper');
    const successEl = document.getElementById('paymentSuccess');
    
    if (formWrapper) formWrapper.style.display = 'none';
    if (successEl) successEl.style.display = 'flex';
}

function closePaymentModal() {
    const modal = document.getElementById('paymentSetupModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
    
    if (cardElement) {
        cardElement.unmount();
        cardElement = null;
    }
    elements = null;
    currentClientSecret = null;
    currentSubscriptionId = null;
    
    const url = new URL(window.location);
    url.searchParams.delete('setup_payment');
    window.history.replaceState({}, '', url);
}

async function proceedToStripeCheckout() {
    if (!userSelectedPlan) {
        alert('No plan selected');
        return;
    }
    
    const checkoutBtn = document.querySelector('.btn-primary-checkout');
    if (checkoutBtn) {
        checkoutBtn.disabled = true;
        checkoutBtn.innerHTML = '<i class="material-symbols-rounded">hourglass_empty</i> Redirecting...';
    }
    
    try {
        const response = await authFetch('/api/stripe/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan_id: userSelectedPlan })
        });
        
        const data = await response.json();
        
        if (data.checkout_url) {
            window.location.href = data.checkout_url;
        } else {
            alert(data.error || 'Failed to create checkout session');
            if (checkoutBtn) {
                checkoutBtn.disabled = false;
                checkoutBtn.innerHTML = '<i class="material-symbols-rounded">lock</i> Proceed to Secure Checkout';
            }
        }
    } catch (error) {
        console.error('Checkout error:', error);
        alert('Failed to start checkout. Please try again.');
        if (checkoutBtn) {
            checkoutBtn.disabled = false;
            checkoutBtn.innerHTML = '<i class="material-symbols-rounded">lock</i> Proceed to Secure Checkout';
        }
    }
}

async function skipPaymentSetup() {
    try {
        await authFetch('/api/user/update-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan: 'free' })
        });
    } catch (error) {
        console.log('Could not update plan to free');
    }
    closePaymentModal();
    location.reload();
}

if (typeof initPlansPage === 'function') {
    initPlansPage();
}
