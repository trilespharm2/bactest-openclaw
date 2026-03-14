// Subscription Page Script - Combined Billing & Plans
console.log('Initializing Subscription Page');

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

let currentUserPlan = 'free';
let userSelectedPlan = null;
let isAnnualBilling = false;
let stripe = null;
let elements = null;
let cardElement = null;
let currentClientSecret = null;
let currentSubscriptionId = null;
let hasActiveSubscription = false;
let pendingDowngradePlan = null; // Track pending downgrade plan

function initSubscriptionPage() {
    console.log('Subscription page initialized');
    loadAllSubscriptionData();
    setupBillingToggle();
    setupPlanButtons();
    checkForPaymentSetup();
}

async function loadAllSubscriptionData() {
    try {
        const [subscriptionData, paymentData, invoiceData] = await Promise.all([
            fetchSubscription(),
            fetchPaymentMethods(),
            fetchInvoices()
        ]);
        
        updateSubscriptionDisplay(subscriptionData);
        updatePaymentMethodDisplay(paymentData);
        updateInvoicesDisplay(invoiceData);
        updatePlanButtonStates();
    } catch (error) {
        console.error('Error loading subscription data:', error);
    }
}

async function fetchSubscription() {
    try {
        const response = await authFetch('/api/billing/subscription');
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error('Error fetching subscription:', error);
        return null;
    }
}

async function fetchPaymentMethods() {
    try {
        const response = await authFetch('/api/billing/payment-methods');
        if (!response.ok) return { payment_methods: [] };
        return await response.json();
    } catch (error) {
        console.error('Error fetching payment methods:', error);
        return { payment_methods: [] };
    }
}

async function fetchInvoices() {
    try {
        const response = await authFetch('/api/billing/invoices');
        if (!response.ok) return { invoices: [] };
        return await response.json();
    } catch (error) {
        console.error('Error fetching invoices:', error);
        return { invoices: [] };
    }
}

function updateSubscriptionDisplay(data) {
    const planNameEl = document.getElementById('currentPlanName');
    const planPriceEl = document.getElementById('currentPlanPrice');
    const planStatusEl = document.getElementById('planStatus');
    const badgeEl = document.getElementById('subscriptionBadge');
    const nextBillingEl = document.getElementById('nextBillingDate');
    const billingPortalBtn = document.getElementById('billingPortalBtn');
    const manageSubBtn = document.getElementById('manageSubscriptionBtn');
    
    console.log('Subscription data:', data);
    
    if (data && data.subscription && data.status === 'active') {
        hasActiveSubscription = true;
        currentUserPlan = data.plan || 'free';
        
        const planInfo = PLAN_DETAILS[currentUserPlan] || { name: data.plan_display_name || 'Active Plan', price: data.price || 0 };
        
        if (planNameEl) planNameEl.textContent = planInfo.name;
        if (planPriceEl) planPriceEl.textContent = '$' + (data.price || planInfo.price);
        
        const billingLabelEl = document.getElementById('billingDateLabel');
        const billingIconEl = document.getElementById('billingDateIcon');
        
        if (data.pending_plan) {
            pendingDowngradePlan = data.pending_plan; // Store pending downgrade plan
            if (badgeEl) {
                badgeEl.textContent = 'Downgrading';
                badgeEl.className = 'plan-badge downgrading';
            }
            const effectiveDate = data.pending_effective_date || data.next_billing_date || 'end of billing period';
            if (planStatusEl) {
                planStatusEl.textContent = `Changing to ${data.pending_plan_display} ($${data.pending_plan_price}/mo) on ${effectiveDate}`;
            }
            if (billingLabelEl) billingLabelEl.textContent = 'Changes on';
            if (billingIconEl) billingIconEl.textContent = 'schedule';
            if (nextBillingEl) nextBillingEl.textContent = effectiveDate;
        } else if (data.subscription.cancel_at_period_end) {
            pendingDowngradePlan = 'stocks-basic'; // Cancelling means downgrading to free/basic
            if (badgeEl) {
                badgeEl.textContent = 'Cancelling';
                badgeEl.className = 'plan-badge cancelling';
            }
            const cancelDate = data.cancel_date || data.subscription.cancel_date || data.next_billing_date || 'end of billing period';
            if (planStatusEl) {
                planStatusEl.textContent = `Your subscription will end on ${cancelDate}`;
            }
            if (billingLabelEl) billingLabelEl.textContent = 'Cancels on';
            if (billingIconEl) billingIconEl.textContent = 'event_busy';
            if (nextBillingEl) nextBillingEl.textContent = cancelDate;
        } else {
            pendingDowngradePlan = null; // No pending downgrade
            if (badgeEl) {
                badgeEl.textContent = 'Active';
                badgeEl.className = 'plan-badge active';
            }
            if (planStatusEl) planStatusEl.textContent = 'Your subscription is active and renews automatically';
            if (billingLabelEl) billingLabelEl.textContent = 'Next Billing';
            if (billingIconEl) billingIconEl.textContent = 'calendar_month';
            if (nextBillingEl) nextBillingEl.textContent = data.next_billing_date || '-';
        }
        
        if (billingPortalBtn) billingPortalBtn.style.display = 'inline-flex';
        if (manageSubBtn) manageSubBtn.innerHTML = '<i class="material-symbols-rounded">swap_horiz</i> Change Plan';
        
    } else if (data && data.subscription && (data.status === 'canceled' || data.status === 'cancelled')) {
        hasActiveSubscription = false;
        currentUserPlan = 'free';
        
        if (planNameEl) planNameEl.textContent = 'No Active Plan';
        if (planPriceEl) planPriceEl.textContent = '$0';
        if (badgeEl) {
            badgeEl.textContent = 'Cancelled';
            badgeEl.className = 'plan-badge cancelled';
        }
        if (planStatusEl) planStatusEl.textContent = 'Your subscription has been cancelled';
        if (nextBillingEl) nextBillingEl.textContent = '-';
        if (billingPortalBtn) billingPortalBtn.style.display = 'none';
        if (manageSubBtn) manageSubBtn.innerHTML = '<i class="material-symbols-rounded">rocket_launch</i> Resubscribe';
        
    } else if (data && data.plan && data.plan !== 'free' && data.status === 'no_subscription') {
        hasActiveSubscription = false;
        currentUserPlan = data.plan;
        
        const planInfo = PLAN_DETAILS[currentUserPlan] || { name: data.plan_display_name, price: 0 };
        
        if (planNameEl) planNameEl.textContent = planInfo.name;
        if (planPriceEl) planPriceEl.textContent = '$' + planInfo.price;
        if (badgeEl) {
            badgeEl.textContent = 'Payment Pending';
            badgeEl.className = 'plan-badge pending';
        }
        if (planStatusEl) planStatusEl.textContent = 'Complete payment to activate your subscription';
        if (nextBillingEl) nextBillingEl.textContent = 'Pending';
        if (billingPortalBtn) billingPortalBtn.style.display = 'none';
        
    } else {
        hasActiveSubscription = false;
        currentUserPlan = 'free';
        
        if (planNameEl) planNameEl.textContent = 'Free Plan';
        if (planPriceEl) planPriceEl.textContent = '$0';
        if (badgeEl) {
            badgeEl.textContent = 'Free';
            badgeEl.className = 'plan-badge free';
        }
        if (planStatusEl) planStatusEl.textContent = 'Upgrade to unlock more features';
        if (nextBillingEl) nextBillingEl.textContent = '-';
        if (billingPortalBtn) billingPortalBtn.style.display = 'none';
        if (manageSubBtn) manageSubBtn.innerHTML = '<i class="material-symbols-rounded">rocket_launch</i> Upgrade Plan';
    }
}

function updatePaymentMethodDisplay(data) {
    console.log('Payment methods data:', data);
    
    try {
        const cardDisplay = document.getElementById('paymentMethodCard');
        const noPayment = document.getElementById('noPaymentMethod');
        const updateBtn = document.getElementById('updatePaymentBtn');
        const statDisplay = document.getElementById('paymentMethodDisplay');
        const cardNumberEl = document.getElementById('cardNumber');
        const cardExpiryEl = document.getElementById('cardExpiry');
        const cardLogoEl = document.getElementById('cardLogo');
        
        console.log('DOM elements found:', {
            cardDisplay: !!cardDisplay,
            noPayment: !!noPayment,
            cardNumberEl: !!cardNumberEl,
            cardExpiryEl: !!cardExpiryEl,
            cardLogoEl: !!cardLogoEl,
            updateBtn: !!updateBtn,
            statDisplay: !!statDisplay
        });
        
        if (data.payment_methods && data.payment_methods.length > 0) {
            const card = data.payment_methods[0];
            console.log('Displaying card:', card);
            
            if (cardNumberEl) cardNumberEl.textContent = `•••• •••• •••• ${card.last4}`;
            if (cardExpiryEl) cardExpiryEl.textContent = `${String(card.exp_month).padStart(2, '0')}/${String(card.exp_year).slice(-2)}`;
            if (cardLogoEl) cardLogoEl.innerHTML = getCardBrandLogo(card.brand);
            
            if (cardDisplay) {
                cardDisplay.style.cssText = 'display: flex !important; visibility: visible !important; opacity: 1 !important;';
                cardDisplay.setAttribute('style', 'display: flex !important; visibility: visible !important; opacity: 1 !important;');
                console.log('Card display set to flex, computed style:', window.getComputedStyle(cardDisplay).display);
            }
            if (noPayment) {
                noPayment.style.cssText = 'display: none !important;';
                noPayment.setAttribute('style', 'display: none !important;');
                console.log('No payment hidden');
            }
            if (updateBtn) {
                updateBtn.style.cssText = 'display: inline-flex !important;';
            }
            if (statDisplay) statDisplay.textContent = `•••• ${card.last4}`;
        } else {
            console.log('No payment methods found');
            if (cardDisplay) cardDisplay.style.cssText = 'display: none !important;';
            if (noPayment) noPayment.style.cssText = 'display: flex !important;';
            if (updateBtn) updateBtn.style.cssText = 'display: none !important;';
            if (statDisplay) statDisplay.textContent = 'None';
        }
    } catch (error) {
        console.error('Error updating payment method display:', error);
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

function updateInvoicesDisplay(data) {
    const listEl = document.getElementById('invoiceList');
    const noInvoicesEl = document.getElementById('noInvoices');
    
    const paidInvoices = (data.invoices || []).filter(inv => inv.amount_paid > 0);
    
    if (paidInvoices.length > 0) {
        listEl.innerHTML = paidInvoices.slice(0, 5).map(inv => {
            const date = new Date(inv.created * 1000);
            const formattedDate = date.toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
            });
            
            return `
                <li class="invoice-item">
                    <div class="invoice-info">
                        <span class="invoice-date">${formattedDate}</span>
                        <span class="invoice-id">${inv.number || inv.id}</span>
                    </div>
                    <div class="invoice-actions">
                        <span class="invoice-amount">$${inv.amount_paid.toFixed(2)}</span>
                        ${inv.invoice_pdf ? `
                            <a href="${inv.invoice_pdf}" target="_blank" class="btn-download-pdf">
                                <i class="material-symbols-rounded">picture_as_pdf</i>
                            </a>
                        ` : ''}
                    </div>
                </li>
            `;
        }).join('');
        
        if (noInvoicesEl) noInvoicesEl.style.display = 'none';
    } else {
        if (listEl) listEl.innerHTML = '';
        if (noInvoicesEl) noInvoicesEl.style.display = 'flex';
    }
}

function setupBillingToggle() {
    const billingToggle = document.getElementById('billingToggle');
    if (billingToggle) {
        billingToggle.addEventListener('change', function() {
            isAnnualBilling = this.checked;
            updatePriceDisplay();
        });
    }
}

function updatePriceDisplay() {
    const priceElements = document.querySelectorAll('.pricing-card-modal .price');
    priceElements.forEach(el => {
        const monthly = parseInt(el.dataset.monthly) || 0;
        const annual = parseInt(el.dataset.annual) || 0;
        el.textContent = '$' + (isAnnualBilling ? annual : monthly);
    });
}

function setupPlanButtons() {
    document.querySelectorAll('.btn-plan-select').forEach(btn => {
        const planId = btn.dataset.planId;
        btn.onclick = function(e) {
            e.preventDefault();
            if (planId && !btn.disabled) {
                // Allow clicking current plan if there's a pending downgrade (to cancel it)
                if (planId !== currentUserPlan || pendingDowngradePlan) {
                    selectPlan(planId);
                }
            }
        };
    });
}

function updatePlanButtonStates() {
    document.querySelectorAll('.pricing-card-modal').forEach(card => {
        const planId = card.dataset.plan;
        const btn = card.querySelector('.btn-plan-select');
        
        // If there's a pending downgrade, different logic applies
        if (pendingDowngradePlan) {
            // Disable the pending plan (what they're downgrading TO)
            if (planId === pendingDowngradePlan || (pendingDowngradePlan === 'stocks-basic' && planId === 'free')) {
                if (btn) {
                    btn.textContent = 'Pending Change';
                    btn.classList.add('disabled');
                    btn.disabled = true;
                }
                card.classList.remove('current');
            }
            // Current plan shows "Return to Current Plan" and is clickable
            else if (planId === currentUserPlan || (currentUserPlan === 'free' && planId === 'stocks-basic')) {
                if (btn) {
                    btn.textContent = 'Return to Current Plan';
                    btn.classList.remove('disabled');
                    btn.disabled = false;
                }
                card.classList.add('current');
            }
            // Other plans work normally
            else {
                if (btn) {
                    btn.textContent = 'Select Plan';
                    btn.classList.remove('disabled');
                    btn.disabled = false;
                }
                card.classList.remove('current');
            }
        } else {
            // Normal behavior - no pending downgrade
            if (planId === currentUserPlan || (currentUserPlan === 'free' && planId === 'stocks-basic')) {
                if (btn) {
                    btn.textContent = 'Current Plan';
                    btn.classList.add('disabled');
                    btn.disabled = true;
                }
                card.classList.add('current');
            } else {
                if (btn) {
                    btn.textContent = 'Select Plan';
                    btn.classList.remove('disabled');
                    btn.disabled = false;
                }
                card.classList.remove('current');
            }
        }
    });
}

function openPricingModal() {
    const modal = document.getElementById('pricingModal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        updatePlanButtonStates();
    }
}

function closePricingModal() {
    const modal = document.getElementById('pricingModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

async function selectPlan(planId) {
    const planInfo = PLAN_DETAILS[planId];
    
    // If no active subscription and selecting free plan, just update database
    if ((!planInfo || planInfo.price === 0) && !hasActiveSubscription) {
        await authFetch('/api/user/update-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan: planId })
        });
        location.reload();
        return;
    }
    
    userSelectedPlan = planId;
    closePricingModal();
    
    if (hasActiveSubscription) {
        const currentPrice = PLAN_DETAILS[currentUserPlan]?.price || 0;
        const newPrice = planInfo?.price || 0;
        const isUpgrade = newPrice > currentPrice;
        
        // Special case: Returning to current plan (canceling pending downgrade)
        if (planId === currentUserPlan && pendingDowngradePlan) {
            cancelPendingDowngrade(planId);
            return;
        }
        
        if (isUpgrade) {
            showUpgradeConfirmModal(planId);
        } else {
            // Downgrade (including to free plan) - show confirmation
            showDowngradeConfirmModal(planId);
        }
    } else {
        showPaymentModal(planId);
    }
}

async function cancelPendingDowngrade(planId) {
    try {
        const response = await authFetch('/api/stripe/change-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan_id: planId })
        });
        
        const result = await response.json();
        
        if (result.success) {
            pendingDowngradePlan = null;
            // Automatically refresh subscription data without requiring user interaction
            await loadAllSubscriptionData();
            // Close the pricing modal if open
            closePricingModal();
        } else {
            alert(result.error || 'Failed to cancel downgrade');
        }
    } catch (error) {
        console.error('Error canceling downgrade:', error);
        alert('Failed to cancel downgrade. Please try again.');
    }
}

let upgradePaymentMethods = [];
let selectedPaymentMethodId = null;
let upgradeElements = null;
let upgradeCardElement = null;
let useNewCardForUpgrade = false;

async function showUpgradeConfirmModal(planId) {
    const planInfo = PLAN_DETAILS[planId];
    const currentPlanInfo = PLAN_DETAILS[currentUserPlan];
    const priceDiff = planInfo.price - (currentPlanInfo?.price || 0);
    
    const paymentMethods = await fetchPaymentMethods();
    upgradePaymentMethods = paymentMethods.payment_methods || [];
    selectedPaymentMethodId = upgradePaymentMethods.length > 0 ? upgradePaymentMethods[0].id : null;
    useNewCardForUpgrade = false;
    
    const modal = document.createElement('div');
    modal.id = 'upgradeConfirmModal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'display: flex; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 9999; align-items: center; justify-content: center;';
    
    let paymentMethodsHtml = '';
    if (upgradePaymentMethods.length > 0) {
        paymentMethodsHtml = `
            <div id="existingCardsSection" style="margin-bottom: 16px;">
                <p style="font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 12px; text-align: left;">Select payment method:</p>
                ${upgradePaymentMethods.map((pm, index) => `
                    <label class="payment-method-option" style="display: flex; align-items: center; gap: 12px; padding: 14px; border: 2px solid ${index === 0 ? '#14b8a6' : '#e2e8f0'}; border-radius: 10px; margin-bottom: 8px; cursor: pointer; background: ${index === 0 ? '#f0fdfa' : 'white'};" onclick="selectUpgradePaymentMethod('${pm.id}', this)">
                        <input type="radio" name="upgradePaymentMethod" value="${pm.id}" ${index === 0 ? 'checked' : ''} style="accent-color: #14b8a6;">
                        <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                            ${getCardBrandLogo(pm.brand)}
                            <span style="font-size: 14px; color: #1e293b;">•••• ${pm.last4}</span>
                            <span style="font-size: 12px; color: #64748b;">Exp ${String(pm.exp_month).padStart(2, '0')}/${String(pm.exp_year).slice(-2)}</span>
                        </div>
                    </label>
                `).join('')}
                <label class="payment-method-option" style="display: flex; align-items: center; gap: 12px; padding: 14px; border: 2px solid #e2e8f0; border-radius: 10px; cursor: pointer; background: white;" onclick="showNewCardFormForUpgrade(this)">
                    <input type="radio" name="upgradePaymentMethod" value="new_card">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <i class="material-symbols-rounded" style="font-size: 24px; color: #64748b;">add_card</i>
                        <span style="font-size: 14px; color: #1e293b;">Use a different card</span>
                    </div>
                </label>
            </div>
            <div id="newCardFormUpgrade" style="display: none; margin-bottom: 16px;">
                <p style="font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 12px; text-align: left;">Enter card details:</p>
                <div id="upgrade-card-element" style="padding: 14px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc;"></div>
                <div id="upgrade-card-errors" style="color: #ef4444; font-size: 13px; margin-top: 8px;"></div>
            </div>
        `;
    } else {
        paymentMethodsHtml = `
            <div id="newCardFormUpgrade" style="margin-bottom: 16px;">
                <p style="font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 12px; text-align: left;">Enter card details:</p>
                <div id="upgrade-card-element" style="padding: 14px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc;"></div>
                <div id="upgrade-card-errors" style="color: #ef4444; font-size: 13px; margin-top: 8px;"></div>
            </div>
        `;
        useNewCardForUpgrade = true;
    }
    
    modal.innerHTML = `
        <div class="modal-content" style="background: white; border-radius: 16px; padding: 32px; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto;">
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #14b8a6, #0d9488); border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
                    <i class="material-symbols-rounded" style="font-size: 32px; color: white;">upgrade</i>
                </div>
                <h2 style="margin: 0 0 8px; color: #1e293b;">Upgrade to ${planInfo.name}</h2>
                <p style="color: #64748b; margin: 0; font-size: 14px;">Your new plan will be active immediately</p>
            </div>
            
            <div style="background: #f0fdfa; border-radius: 10px; padding: 16px; margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="font-size: 14px; color: #64748b;">Current Plan:</span>
                    <span style="font-size: 14px; color: #1e293b;">${currentPlanInfo?.name || 'Free'} ($${currentPlanInfo?.price || 0}/mo)</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="font-size: 14px; color: #64748b;">New Plan:</span>
                    <span style="font-size: 14px; color: #1e293b; font-weight: 600;">${planInfo.name} ($${planInfo.price}/mo)</span>
                </div>
                <hr style="border: none; border-top: 1px solid #99f6e4; margin: 12px 0;">
                <div style="display: flex; justify-content: space-between;">
                    <span style="font-size: 14px; color: #0d9488; font-weight: 600;">Prorated charge today:</span>
                    <span style="font-size: 14px; color: #0d9488; font-weight: 600;">~$${priceDiff.toFixed(2)}</span>
                </div>
            </div>
            
            ${paymentMethodsHtml}
            
            <div style="display: flex; gap: 12px; justify-content: center; margin-top: 20px;">
                <button onclick="closeUpgradeConfirmModal()" style="padding: 12px 24px; border: 1px solid #e2e8f0; border-radius: 10px; background: white; cursor: pointer; font-size: 14px; flex: 1;">Cancel</button>
                <button onclick="confirmUpgrade('${planId}')" id="confirmUpgradeBtn" style="padding: 12px 24px; border: none; border-radius: 10px; background: linear-gradient(135deg, #14b8a6, #0d9488); color: white; cursor: pointer; font-size: 14px; font-weight: 600; flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <i class="material-symbols-rounded" style="font-size: 18px;">lock</i>
                    <span id="confirmUpgradeBtnText">Confirm Payment</span>
                </button>
            </div>
            <p style="text-align: center; margin-top: 12px; font-size: 12px; color: #94a3b8;">
                <i class="material-symbols-rounded" style="font-size: 14px; vertical-align: middle;">security</i>
                Secured by Stripe
            </p>
        </div>
    `;
    document.body.appendChild(modal);
    
    if (upgradePaymentMethods.length === 0) {
        await initUpgradeCardElement();
    }
}

function selectUpgradePaymentMethod(paymentMethodId, element) {
    selectedPaymentMethodId = paymentMethodId;
    useNewCardForUpgrade = false;
    
    document.querySelectorAll('.payment-method-option').forEach(opt => {
        opt.style.border = '2px solid #e2e8f0';
        opt.style.background = 'white';
    });
    element.style.border = '2px solid #14b8a6';
    element.style.background = '#f0fdfa';
    
    const newCardForm = document.getElementById('newCardFormUpgrade');
    if (newCardForm) newCardForm.style.display = 'none';
}

async function showNewCardFormForUpgrade(element) {
    selectedPaymentMethodId = null;
    useNewCardForUpgrade = true;
    
    document.querySelectorAll('.payment-method-option').forEach(opt => {
        opt.style.border = '2px solid #e2e8f0';
        opt.style.background = 'white';
    });
    element.style.border = '2px solid #14b8a6';
    element.style.background = '#f0fdfa';
    
    const newCardForm = document.getElementById('newCardFormUpgrade');
    if (newCardForm) {
        newCardForm.style.display = 'block';
        await initUpgradeCardElement();
    }
}

async function initUpgradeCardElement() {
    try {
        await loadStripeJs();
        
        const response = await authFetch('/api/stripe/publishable-key');
        const data = await response.json();
        
        if (!stripe) {
            stripe = Stripe(data.publishable_key);
        }
        
        upgradeElements = stripe.elements({
            appearance: {
                theme: 'stripe',
                variables: {
                    colorPrimary: '#14b8a6',
                    colorBackground: '#ffffff',
                    colorText: '#1e293b',
                    colorDanger: '#ef4444',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    borderRadius: '8px'
                }
            }
        });
        
        upgradeCardElement = upgradeElements.create('card', {
            style: {
                base: {
                    fontSize: '16px',
                    color: '#1e293b',
                    '::placeholder': { color: '#94a3b8' }
                }
            }
        });
        
        const container = document.getElementById('upgrade-card-element');
        if (container) {
            container.innerHTML = '';
            upgradeCardElement.mount('#upgrade-card-element');
        }
        
        upgradeCardElement.on('change', (event) => {
            const errorEl = document.getElementById('upgrade-card-errors');
            if (errorEl) errorEl.textContent = event.error ? event.error.message : '';
        });
    } catch (error) {
        console.error('Error initializing upgrade card element:', error);
    }
}

function showDowngradeConfirmModal(planId) {
    const planInfo = PLAN_DETAILS[planId];
    const currentPlanInfo = PLAN_DETAILS[currentUserPlan];
    
    const modal = document.createElement('div');
    modal.id = 'downgradeConfirmModal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'display: flex; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 9999; align-items: center; justify-content: center;';
    modal.innerHTML = `
        <div class="modal-content" style="background: white; border-radius: 16px; padding: 32px; max-width: 500px; width: 90%; text-align: center;">
            <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #f59e0b, #d97706); border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                <i class="material-symbols-rounded" style="font-size: 32px; color: white;">warning</i>
            </div>
            <h2 style="margin: 0 0 12px; color: #1e293b;">Downgrade to ${planInfo.name}?</h2>
            <p style="color: #64748b; margin-bottom: 20px;">Your current plan will remain active until the end of your billing period. After that, you'll lose access to some features.</p>
            
            <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 10px; padding: 16px; margin-bottom: 20px; text-align: left;">
                <p style="margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #92400e;"><i class="material-symbols-rounded" style="font-size: 16px; vertical-align: middle;">info</i> Features you'll lose:</p>
                <ul style="margin: 0; padding-left: 20px; color: #92400e; font-size: 13px;">
                    <li>Higher backtesting limits</li>
                    <li>Advanced strategy options</li>
                    <li>Priority support</li>
                </ul>
            </div>
            
            <div style="background: #f8fafc; border-radius: 10px; padding: 16px; margin-bottom: 24px; text-align: left;">
                <p style="margin: 0 0 8px; font-size: 14px;"><strong>Current Plan:</strong> ${currentPlanInfo?.name || 'Free'} ($${currentPlanInfo?.price || 0}/month)</p>
                <p style="margin: 0; font-size: 14px;"><strong>New Plan:</strong> ${planInfo.name} ($${planInfo.price}/month)</p>
                <p style="margin: 8px 0 0; font-size: 13px; color: #64748b;"><i class="material-symbols-rounded" style="font-size: 14px; vertical-align: middle;">calendar_month</i> Change takes effect at end of current billing period</p>
            </div>
            
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button onclick="closeDowngradeConfirmModal()" style="padding: 12px 24px; border: 1px solid #e2e8f0; border-radius: 10px; background: white; cursor: pointer; font-size: 14px;">Keep Current Plan</button>
                <button onclick="confirmDowngrade('${planId}')" id="confirmDowngradeBtn" style="padding: 12px 24px; border: none; border-radius: 10px; background: #64748b; color: white; cursor: pointer; font-size: 14px; font-weight: 600;">Confirm Downgrade</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeUpgradeConfirmModal() {
    cleanupUpgradeModal();
    const modal = document.getElementById('upgradeConfirmModal');
    if (modal) modal.remove();
}

function closeDowngradeConfirmModal() {
    const modal = document.getElementById('downgradeConfirmModal');
    if (modal) modal.remove();
}

async function confirmUpgrade(planId) {
    const btn = document.getElementById('confirmUpgradeBtn');
    const btnText = document.getElementById('confirmUpgradeBtnText');
    const errorEl = document.getElementById('upgrade-card-errors');
    
    if (btn) btn.disabled = true;
    if (btnText) btnText.textContent = 'Processing...';
    if (errorEl) errorEl.textContent = '';
    
    try {
        await loadStripeJs();
        if (!stripe) {
            const keyResp = await authFetch('/api/stripe/publishable-key');
            const keyData = await keyResp.json();
            stripe = Stripe(keyData.publishable_key);
        }
        
        let newPaymentMethodId = null;
        
        if (useNewCardForUpgrade) {
            if (!upgradeCardElement) {
                throw new Error('Please enter your card details');
            }
            const { paymentMethod, error } = await stripe.createPaymentMethod({
                type: 'card',
                card: upgradeCardElement,
            });
            
            if (error) {
                throw new Error(error.message);
            }
            newPaymentMethodId = paymentMethod.id;
        }
        
        const response = await authFetch('/api/stripe/change-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                plan_id: planId,
                payment_method_id: useNewCardForUpgrade ? newPaymentMethodId : selectedPaymentMethodId
            })
        });
        
        const data = await response.json();
        
        if (data.requires_action && data.client_secret) {
            if (btnText) btnText.textContent = 'Authenticating...';
            const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(data.client_secret);
            if (confirmError) {
                throw new Error(confirmError.message);
            }
            
            if (paymentIntent.status === 'succeeded') {
                const confirmResp = await authFetch('/api/stripe/confirm-upgrade', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        plan_id: planId,
                        payment_intent_id: paymentIntent.id
                    })
                });
                const confirmData = await confirmResp.json();
                
                cleanupUpgradeModal();
                closeUpgradeConfirmModal();
                showPlanChangeSuccess(confirmData.success ? confirmData : {
                    success: true,
                    type: 'upgrade',
                    new_plan: planId,
                    proration_amount: data.proration_amount
                }, 'upgrade');
            }
            return;
        }
        
        if (data.error) {
            if (data.needs_new_subscription) {
                closeUpgradeConfirmModal();
                showPaymentModal(planId);
            } else {
                throw new Error(data.error);
            }
            return;
        }
        
        cleanupUpgradeModal();
        closeUpgradeConfirmModal();
        showPlanChangeSuccess(data, 'upgrade');
    } catch (error) {
        console.error('Upgrade error:', error);
        if (errorEl) errorEl.textContent = error.message;
        if (btn) btn.disabled = false;
        if (btnText) btnText.textContent = 'Confirm Payment';
    }
}

function cleanupUpgradeModal() {
    if (upgradeCardElement) {
        try { upgradeCardElement.unmount(); } catch (e) {}
        upgradeCardElement = null;
    }
    upgradeElements = null;
    selectedPaymentMethodId = null;
    useNewCardForUpgrade = false;
}

async function confirmDowngrade(planId) {
    const btn = document.getElementById('confirmDowngradeBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Processing...';
    }
    
    try {
        const response = await authFetch('/api/stripe/change-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan_id: planId })
        });
        
        const data = await response.json();
        
        if (data.error) {
            if (data.needs_new_subscription) {
                closeDowngradeConfirmModal();
                showPaymentModal(planId);
            } else {
                throw new Error(data.error);
            }
            return;
        }
        
        closeDowngradeConfirmModal();
        showPlanChangeSuccess(data, 'downgrade');
    } catch (error) {
        console.error('Downgrade error:', error);
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Confirm Downgrade';
        }
        alert('Failed to downgrade: ' + error.message);
    }
}

function showPlanChangeSuccess(data, type) {
    const isUpgrade = type === 'upgrade';
    const planInfo = PLAN_DETAILS[data.new_plan];
    
    const modal = document.createElement('div');
    modal.id = 'planChangeSuccessModal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'display: flex; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 9999; align-items: center; justify-content: center;';
    
    if (isUpgrade) {
        modal.innerHTML = `
            <div class="modal-content" style="background: white; border-radius: 16px; padding: 32px; max-width: 400px; width: 90%; text-align: center;">
                <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #14b8a6, #0d9488); border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                    <i class="material-symbols-rounded" style="font-size: 32px; color: white;">check_circle</i>
                </div>
                <h2 style="margin: 0 0 12px; color: #1e293b;">Upgrade Successful!</h2>
                <p style="color: #64748b; margin-bottom: 8px;">You now have access to ${planInfo?.name || data.new_plan}.</p>
                ${data.proration_amount ? `<p style="color: #64748b; font-size: 14px; margin-bottom: 24px;">A prorated charge of $${data.proration_amount.toFixed(2)} has been applied.</p>` : ''}
                <button onclick="closePlanChangeSuccessModal()" style="padding: 12px 32px; border: none; border-radius: 10px; background: linear-gradient(135deg, #14b8a6, #0d9488); color: white; cursor: pointer; font-size: 14px; font-weight: 600;">Continue</button>
            </div>
        `;
    } else {
        modal.innerHTML = `
            <div class="modal-content" style="background: white; border-radius: 16px; padding: 32px; max-width: 400px; width: 90%; text-align: center;">
                <div style="width: 64px; height: 64px; background: #64748b; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                    <i class="material-symbols-rounded" style="font-size: 32px; color: white;">schedule</i>
                </div>
                <h2 style="margin: 0 0 12px; color: #1e293b;">Downgrade Scheduled</h2>
                <p style="color: #64748b; margin-bottom: 8px;">Your plan will change to ${planInfo?.name || data.new_plan} on <strong>${data.effective_date}</strong>.</p>
                <p style="color: #64748b; font-size: 14px; margin-bottom: 24px;">You'll keep your current features until then.</p>
                <button onclick="closePlanChangeSuccessModal()" style="padding: 12px 32px; border: none; border-radius: 10px; background: #64748b; color: white; cursor: pointer; font-size: 14px; font-weight: 600;">Got it</button>
            </div>
        `;
    }
    
    document.body.appendChild(modal);
}

function closePlanChangeSuccessModal() {
    const modal = document.getElementById('planChangeSuccessModal');
    if (modal) modal.remove();
    location.reload();
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

async function loadStripeJs() {
    if (window.Stripe) return;
    
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://js.stripe.com/v3/';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
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
        
        if (data.error) throw new Error(data.error);
        
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
                    borderRadius: '10px'
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
        
        document.getElementById('paymentLoading').style.display = 'none';
        document.getElementById('paymentFormWrapper').style.display = 'block';
        
    } catch (error) {
        console.error('Error initializing payment:', error);
        const loadingEl = document.getElementById('paymentLoading');
        if (loadingEl) {
            loadingEl.innerHTML = `
                <i class="material-symbols-rounded" style="font-size: 48px; color: #ef4444;">error</i>
                <p style="color: #ef4444;">Failed to initialize: ${error.message}</p>
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
                return_url: window.location.origin + '/dashboard?section=subscription&payment=success',
            },
            redirect: 'if_required'
        });
        
        if (error) throw new Error(error.message);
        
        if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
            await authFetch('/api/stripe/confirm-subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscription_id: currentSubscriptionId })
            });
            
            showPaymentSuccess();
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
    document.getElementById('paymentFormWrapper').style.display = 'none';
    document.getElementById('paymentSuccess').style.display = 'flex';
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
}

async function openStripePortal(flowType, clickEvent) {
    const btn = clickEvent?.target?.closest('button') || event?.target?.closest('button');
    let originalHTML = '';
    
    try {
        if (btn) {
            btn.disabled = true;
            originalHTML = btn.innerHTML;
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
            window.open(data.portal_url, '_blank');
        }
    } catch (error) {
        console.error('Error opening Stripe portal:', error);
        alert(error.message || 'Failed to open billing portal.');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHTML || 'Manage in Stripe';
        }
    }
}

function checkForPaymentSetup() {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    
    if (paymentStatus === 'success') {
        showNotification('Payment successful! Your subscription is now active.', 'success');
        const url = new URL(window.location);
        url.searchParams.delete('payment');
        window.history.replaceState({}, '', url);
    } else if (paymentStatus === 'cancelled') {
        showNotification('Payment was cancelled.', 'warning');
        const url = new URL(window.location);
        url.searchParams.delete('payment');
        window.history.replaceState({}, '', url);
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
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

document.addEventListener('click', function(e) {
    const pricingModal = document.getElementById('pricingModal');
    const paymentModal = document.getElementById('paymentSetupModal');
    
    if (e.target === pricingModal) {
        closePricingModal();
    }
    if (e.target === paymentModal) {
        closePaymentModal();
    }
});

if (typeof initSubscriptionPage === 'function') {
    initSubscriptionPage();
}
