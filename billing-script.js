// Billing Page Script - Read-only display
console.log('Initializing Billing Page');

const PLAN_PRICES = {
    'stocks-starter': 29,
    'stocks-developer': 79,
    'stocks-advanced': 199,
    'options-starter': 49,
    'options-developer': 129,
    'options-advanced': 299,
    'crypto-starter': 39,
    'crypto-developer': 99,
    'crypto-advanced': 249,
    'forex-starter': 39,
    'forex-developer': 99,
    'forex-advanced': 249,
};

function initBillingPage() {
    console.log('Billing page initialized');
    loadBillingData();
}

async function loadBillingData() {
    try {
        await Promise.all([
            loadSubscriptionStatus(),
            loadPaymentMethods(),
            loadInvoices(),
            loadAccountInfo()
        ]);
    } catch (error) {
        console.error('Error loading billing data:', error);
    }
}

async function loadSubscriptionStatus() {
    try {
        const response = await authFetch('/api/billing/subscription');
        if (!response.ok) throw new Error('Failed to fetch subscription');
        
        const data = await response.json();
        
        const planNameEl = document.getElementById('currentPlanName');
        const monthlyPriceEl = document.getElementById('monthlyPrice');
        const nextBillingEl = document.getElementById('nextBillingDate');
        const subscriptionBadge = document.getElementById('subscriptionBadge');
        const subscriptionInfo = document.getElementById('subscriptionInfo');
        
        const subscriptionActions = document.getElementById('subscriptionActions');
        
        if (data.subscription && data.status === 'active') {
            planNameEl.textContent = data.plan_display_name || 'Active Plan';
            monthlyPriceEl.textContent = `$${data.price?.toFixed(2) || '0.00'}`;
            nextBillingEl.textContent = data.next_billing_date ? `Next billing ${data.next_billing_date}` : '-';
            
            // Check for pending downgrade
            if (data.pending_plan && data.pending_plan_display) {
                subscriptionBadge.textContent = 'Downgrading';
                subscriptionBadge.className = 'subscription-badge downgrading';
                const effectiveDate = data.pending_effective_date || data.next_billing_date || 'your next billing date';
                subscriptionInfo.innerHTML = `<span class="text-warning">Changing to ${data.pending_plan_display} ($${data.pending_plan_price || PLAN_PRICES[data.pending_plan] || 0}/mo) on ${effectiveDate}.</span>`;
            } else if (data.subscription.cancel_at_period_end) {
                subscriptionBadge.textContent = 'Cancelling';
                subscriptionBadge.className = 'subscription-badge cancelling';
                subscriptionInfo.innerHTML = `<span class="text-warning">Your subscription will cancel at the end of the billing period.</span>`;
            } else {
                subscriptionBadge.textContent = 'Active';
                subscriptionBadge.className = 'subscription-badge active';
                subscriptionInfo.textContent = `Your ${data.plan_display_name} subscription is active and will renew on ${data.next_billing_date || 'your next billing date'}.`;
            }
            
            if (subscriptionActions) {
                subscriptionActions.style.display = 'flex';
            }
        } else if (data.plan && data.plan !== 'free' && data.status === 'no_subscription') {
            const displayName = data.plan_display_name || data.plan.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
            planNameEl.textContent = displayName;
            monthlyPriceEl.textContent = `$${PLAN_PRICES[data.plan] || 0}`;
            nextBillingEl.textContent = 'Payment pending';
            
            subscriptionBadge.textContent = 'Pending Payment';
            subscriptionBadge.className = 'subscription-badge pending';
            subscriptionInfo.innerHTML = `<span class="text-warning">Your ${displayName} plan requires payment to activate. <a href="#" onclick="navigateToPage('plans'); return false;">Complete payment</a></span>`;
            
            if (subscriptionActions) {
                subscriptionActions.style.display = 'none';
            }
        } else {
            planNameEl.textContent = 'Free';
            monthlyPriceEl.textContent = '$0.00';
            nextBillingEl.textContent = '-';
            
            subscriptionBadge.textContent = 'Free Plan';
            subscriptionBadge.className = 'subscription-badge free';
            subscriptionInfo.innerHTML = `You're on the free plan. <a href="#" onclick="navigateToPage('plans'); return false;">Upgrade to unlock more features</a>`;
            
            if (subscriptionActions) {
                subscriptionActions.style.display = 'none';
            }
        }
        
    } catch (error) {
        console.error('Error loading subscription:', error);
        document.getElementById('currentPlanName').textContent = 'Error loading';
    }
}

async function loadPaymentMethods() {
    try {
        const response = await authFetch('/api/billing/payment-methods');
        if (!response.ok) throw new Error('Failed to fetch payment methods');
        
        const data = await response.json();
        const listEl = document.getElementById('paymentMethodsList');
        const noMethodsEl = document.getElementById('noPaymentMethods');
        const creditCard = document.getElementById('creditCardDisplay');
        const noCardMessage = document.getElementById('noCardMessage');
        
        const paymentMethodActions = document.getElementById('paymentMethodActions');
        
        if (data.payment_methods && data.payment_methods.length > 0) {
            const primaryCard = data.payment_methods[0];
            
            document.getElementById('cardNumber').textContent = `**** **** **** ${primaryCard.last4}`;
            document.getElementById('cardExpiry').textContent = `${String(primaryCard.exp_month).padStart(2, '0')}/${String(primaryCard.exp_year).slice(-2)}`;
            document.getElementById('cardLogo').innerHTML = getCardBrandLogo(primaryCard.brand);
            
            creditCard.style.display = 'block';
            noCardMessage.style.display = 'none';
            
            listEl.innerHTML = data.payment_methods.map(pm => `
                <div class="payment-method-item">
                    ${getCardBrandLogo(pm.brand)}
                    <span class="card-masked">**** **** **** ${pm.last4}</span>
                    <span class="card-expiry-badge">${String(pm.exp_month).padStart(2, '0')}/${String(pm.exp_year).slice(-2)}</span>
                </div>
            `).join('');
            
            noMethodsEl.style.display = 'none';
            if (paymentMethodActions) {
                paymentMethodActions.style.display = 'flex';
            }
        } else {
            creditCard.style.display = 'none';
            noCardMessage.style.display = 'flex';
            listEl.innerHTML = '';
            noMethodsEl.style.display = 'flex';
            if (paymentMethodActions) {
                paymentMethodActions.style.display = 'none';
            }
        }
        
    } catch (error) {
        console.error('Error loading payment methods:', error);
        document.getElementById('paymentMethodsList').innerHTML = '<div class="error-message">Failed to load payment methods</div>';
    }
}

function getCardBrandLogo(brand) {
    const brandLower = (brand || '').toLowerCase();
    
    if (brandLower === 'visa') {
        return `<svg viewBox="0 0 48 32" width="40" height="28">
            <rect width="48" height="32" rx="4" fill="#1A1F71"/>
            <text x="24" y="20" text-anchor="middle" fill="white" font-size="12" font-weight="bold">VISA</text>
        </svg>`;
    } else if (brandLower === 'mastercard') {
        return `<svg viewBox="0 0 48 32" width="40" height="28">
            <circle cx="16" cy="16" r="14" fill="#EB001B"/>
            <circle cx="32" cy="16" r="14" fill="#F79E1B"/>
            <path d="M24 6.5a14 14 0 0 0 0 19" fill="#FF5F00"/>
        </svg>`;
    } else if (brandLower === 'amex' || brandLower === 'american_express') {
        return `<svg viewBox="0 0 48 32" width="40" height="28">
            <rect width="48" height="32" rx="4" fill="#006FCF"/>
            <text x="24" y="20" text-anchor="middle" fill="white" font-size="10" font-weight="bold">AMEX</text>
        </svg>`;
    } else {
        return `<svg viewBox="0 0 48 32" width="40" height="28">
            <rect width="48" height="32" rx="4" fill="#6B7280"/>
            <text x="24" y="20" text-anchor="middle" fill="white" font-size="8">CARD</text>
        </svg>`;
    }
}

async function loadInvoices() {
    try {
        const response = await authFetch('/api/billing/invoices');
        if (!response.ok) throw new Error('Failed to fetch invoices');
        
        const data = await response.json();
        const listEl = document.getElementById('invoiceList');
        const noInvoicesEl = document.getElementById('noInvoices');
        
        const paidInvoices = (data.invoices || []).filter(inv => inv.amount_paid > 0);
        
        if (paidInvoices.length > 0) {
            listEl.innerHTML = paidInvoices.map(inv => {
                const date = new Date(inv.created * 1000);
                const formattedDate = date.toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
                
                return `
                    <li class="invoice-item">
                        <div class="invoice-info">
                            <h6>${formattedDate}</h6>
                            <span>${inv.number || inv.id}</span>
                        </div>
                        <div class="invoice-actions">
                            <span class="invoice-amount">$${inv.amount_paid.toFixed(2)}</span>
                            ${inv.invoice_pdf ? `
                                <a href="${inv.invoice_pdf}" target="_blank" class="btn-download-pdf">
                                    <i class="material-symbols-rounded">picture_as_pdf</i>
                                    PDF
                                </a>
                            ` : ''}
                        </div>
                    </li>
                `;
            }).join('');
            
            noInvoicesEl.style.display = 'none';
        } else {
            listEl.innerHTML = '';
            noInvoicesEl.style.display = 'flex';
        }
        
    } catch (error) {
        console.error('Error loading invoices:', error);
        document.getElementById('invoiceList').innerHTML = '<li class="error-message">Failed to load invoices</li>';
    }
}

async function loadAccountInfo() {
    try {
        const response = await authFetch('/api/user/info');
        if (!response.ok) throw new Error('Failed to fetch user info');
        
        const data = await response.json();
        
        document.getElementById('accountName').textContent = data.name || 'User';
        document.getElementById('accountEmail').textContent = data.email || '-';
        document.getElementById('cardHolderName').textContent = data.name || '-';
        
        if (data.stripe_customer_id) {
            const shortId = data.stripe_customer_id.substring(0, 14) + '...';
            document.getElementById('customerIdDisplay').textContent = shortId;
        } else {
            document.getElementById('customerIdDisplay').textContent = 'Not created yet';
        }
        
    } catch (error) {
        console.error('Error loading account info:', error);
    }
}

async function openStripePortal(flowType) {
    try {
        const btn = event?.target?.closest('button');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="material-symbols-rounded">hourglass_empty</i> Opening...';
        }
        
        const response = await authFetch('/api/billing/portal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ flow_type: flowType })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to open billing portal');
        }
        
        const data = await response.json();
        if (data.portal_url) {
            window.location.href = data.portal_url;
        }
    } catch (error) {
        console.error('Error opening Stripe portal:', error);
        alert(error.message || 'Failed to open billing portal. Please try again.');
        
        const btn = event?.target?.closest('button');
        if (btn) {
            btn.disabled = false;
            if (btn.id === 'manageSubscriptionBtn') {
                btn.innerHTML = '<i class="material-symbols-rounded">settings</i> Manage Subscription';
            } else if (btn.id === 'addPaymentMethodBtn') {
                btn.innerHTML = '<i class="material-symbols-rounded">add_card</i> Add Payment Method';
            } else {
                btn.innerHTML = '<i class="material-symbols-rounded">credit_card</i> Update Payment Method';
            }
        }
    }
}

if (typeof initBillingPage === 'function') {
    initBillingPage();
}
