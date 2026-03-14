// Settings Page Script
// Note: initSettingsPage() is called by showPage() when navigating to settings page

function initSettingsPage() {
    console.log('Settings page initialized');
    loadUserInfo();
    loadApiKey();
}

async function loadUserInfo() {
    try {
        const response = await authFetch('/api/user/info');
        if (!response.ok) {
            console.error('Failed to load user info');
            return;
        }
        const data = await response.json();
        
        const nameEl = document.getElementById('settingsName');
        const emailEl = document.getElementById('settingsEmail');
        const googleBadge = document.getElementById('googleBadge');
        const passwordSection = document.getElementById('passwordSection');
        
        if (nameEl) nameEl.value = data.name || '';
        if (emailEl) emailEl.value = data.email || '';
        
        if (data.auth_provider === 'google') {
            if (googleBadge) googleBadge.style.display = 'flex';
            if (passwordSection) passwordSection.style.display = 'none';
            const emailHelp = document.getElementById('emailHelp');
            if (emailHelp) emailHelp.textContent = 'Email is managed by Google';
        } else {
            const changeEmailBtn = document.getElementById('changeEmailBtn');
            const emailHelp = document.getElementById('emailHelp');
            if (changeEmailBtn) changeEmailBtn.style.display = 'inline-block';
            if (emailHelp) emailHelp.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading user info:', error);
    }
}

async function saveAccountInfo() {
    const nameEl = document.getElementById('settingsName');
    const statusEl = document.getElementById('accountSaveStatus');
    
    if (!nameEl) return;
    
    const name = nameEl.value.trim();
    
    try {
        if (statusEl) {
            statusEl.textContent = 'Saving...';
            statusEl.className = 'save-status saving';
        }
        
        const response = await authFetch('/api/user/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            if (statusEl) {
                statusEl.textContent = 'Saved!';
                statusEl.className = 'save-status success';
                setTimeout(() => { statusEl.textContent = ''; }, 3000);
            }
        } else {
            throw new Error(data.error || 'Failed to save');
        }
    } catch (error) {
        console.error('Error saving account info:', error);
        if (statusEl) {
            statusEl.textContent = error.message;
            statusEl.className = 'save-status error';
        }
    }
}

async function changePassword() {
    const currentPwd = document.getElementById('currentPassword');
    const newPwd = document.getElementById('newPassword');
    const confirmPwd = document.getElementById('confirmPassword');
    const statusEl = document.getElementById('passwordSaveStatus');
    
    if (!currentPwd || !newPwd || !confirmPwd) return;
    
    const currentPassword = currentPwd.value;
    const newPassword = newPwd.value;
    const confirmPassword = confirmPwd.value;
    
    if (!currentPassword || !newPassword || !confirmPassword) {
        if (statusEl) {
            statusEl.textContent = 'All fields are required';
            statusEl.className = 'save-status error';
        }
        return;
    }
    
    if (newPassword !== confirmPassword) {
        if (statusEl) {
            statusEl.textContent = 'New passwords do not match';
            statusEl.className = 'save-status error';
        }
        return;
    }
    
    if (newPassword.length < 8) {
        if (statusEl) {
            statusEl.textContent = 'Password must be at least 8 characters';
            statusEl.className = 'save-status error';
        }
        return;
    }
    
    try {
        if (statusEl) {
            statusEl.textContent = 'Updating...';
            statusEl.className = 'save-status saving';
        }
        
        const response = await authFetch('/api/user/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                current_password: currentPassword,
                new_password: newPassword 
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentPwd.value = '';
            newPwd.value = '';
            confirmPwd.value = '';
            
            if (statusEl) {
                statusEl.textContent = 'Password updated!';
                statusEl.className = 'save-status success';
                setTimeout(() => { statusEl.textContent = ''; }, 3000);
            }
        } else {
            throw new Error(data.error || 'Failed to update password');
        }
    } catch (error) {
        console.error('Error changing password:', error);
        if (statusEl) {
            statusEl.textContent = error.message;
            statusEl.className = 'save-status error';
        }
    }
}

function toggleApiKeyVisibility() {
    const input = document.getElementById('polygonApiKey');
    const btn = event.target.closest('button');
    const icon = btn ? btn.querySelector('i') : null;
    
    if (input.type === 'password') {
        input.type = 'text';
        if (icon) {
            icon.className = 'fas fa-eye-slash';
        }
    } else {
        input.type = 'password';
        if (icon) {
            icon.className = 'fas fa-eye';
        }
    }
}

function saveApiKey() {
    const input = document.getElementById('polygonApiKey');
    const statusEl = document.getElementById('apiKeySaveStatus');
    
    if (!input || !input.value.trim()) {
        if (statusEl) {
            statusEl.textContent = 'Please enter an API key';
            statusEl.className = 'save-status error';
        }
        return;
    }
    
    const apiKey = input.value.trim();
    localStorage.setItem('polygonApiKey', apiKey);
    
    if (statusEl) {
        statusEl.textContent = 'API Key saved!';
        statusEl.className = 'save-status success';
        setTimeout(() => { statusEl.textContent = ''; }, 3000);
    }
}

function loadApiKey() {
    const input = document.getElementById('polygonApiKey');
    const savedKey = localStorage.getItem('polygonApiKey');
    if (input && savedKey) {
        input.value = savedKey;
    }
}

function showEmailChangeModal() {
    const modal = document.getElementById('emailChangeModal');
    if (modal) {
        modal.style.display = 'block';
        modal.classList.add('show');
        document.body.classList.add('modal-open');
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop fade show';
        backdrop.id = 'emailModalBackdrop';
        document.body.appendChild(backdrop);
        document.getElementById('newEmailInput').value = '';
        document.getElementById('emailChangePassword').value = '';
        document.getElementById('emailChangeAlert').style.display = 'none';
    }
}

function closeEmailChangeModal() {
    const modal = document.getElementById('emailChangeModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('show');
        document.body.classList.remove('modal-open');
        const backdrop = document.getElementById('emailModalBackdrop');
        if (backdrop) backdrop.remove();
    }
}

async function requestEmailChange() {
    const newEmail = document.getElementById('newEmailInput').value.trim();
    const password = document.getElementById('emailChangePassword').value;
    const alertBox = document.getElementById('emailChangeAlert');
    const btn = document.getElementById('confirmEmailChangeBtn');
    
    if (!newEmail || !password) {
        alertBox.textContent = 'Please fill in all fields';
        alertBox.className = 'alert-box error';
        alertBox.style.display = 'block';
        return;
    }
    
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Sending...';
    
    try {
        const response = await authFetch('/api/user/request-email-change', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_email: newEmail, current_password: password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alertBox.textContent = data.message;
            alertBox.className = 'alert-box success';
            alertBox.style.display = 'block';
            setTimeout(() => closeEmailChangeModal(), 3000);
        } else {
            alertBox.textContent = data.error || 'Failed to request email change';
            alertBox.className = 'alert-box error';
            alertBox.style.display = 'block';
        }
    } catch (error) {
        alertBox.textContent = 'An error occurred. Please try again.';
        alertBox.className = 'alert-box error';
        alertBox.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Don't auto-initialize - will be called by showPage when settings page is active
