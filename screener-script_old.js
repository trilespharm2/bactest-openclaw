// Screener Page Script
console.log('Initializing Screener Page');

function initScreenerPage() {
    // Run Screen button
    const runScreenBtn = document.getElementById('runScreenBtn');
    if (runScreenBtn) {
        runScreenBtn.addEventListener('click', function() {
            console.log('Running screen...');
            showToast('Screener feature coming soon!', 'info');
        });
    }

    // Clear Filters button
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', function() {
            // Reset all select elements
            const selects = document.querySelectorAll('.filter-select');
            selects.forEach(select => {
                select.selectedIndex = 0;
            });
            // Clear input fields
            const inputs = document.querySelectorAll('.filter-input');
            inputs.forEach(input => {
                input.value = '';
            });
            showToast('Filters cleared', 'success');
        });
    }

    // Save Screen button
    const saveScreenBtn = document.getElementById('saveScreenBtn');
    if (saveScreenBtn) {
        saveScreenBtn.addEventListener('click', function() {
            showToast('Save screen feature coming soon!', 'info');
        });
    }

    // Export Results button
    const exportResultsBtn = document.getElementById('exportResultsBtn');
    if (exportResultsBtn) {
        exportResultsBtn.addEventListener('click', function() {
            showToast('Export feature coming soon!', 'info');
        });
    }

    console.log('Screener page initialized');
}

// Toast notification function
function showToast(message, type = 'info') {
    // Remove existing toast if any
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    
    const icons = {
        success: 'check_circle',
        info: 'info',
        warning: 'warning',
        danger: 'error'
    };

    toast.innerHTML = `
        <i class="material-symbols-rounded">${icons[type] || 'info'}</i>
        <span>${message}</span>
        <div class="toast-progress"></div>
    `;

    document.body.appendChild(toast);

    // Auto remove after 3 seconds
    setTimeout(() => {
        toast.classList.add('toast-fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Initialize when loaded
initScreenerPage();
