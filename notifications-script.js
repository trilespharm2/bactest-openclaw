// Notifications Page Script
console.log('Initializing Notifications Page');

function initNotificationsPage() {
    console.log('Notifications page initialized');
    
    // Handle alert dismissals
    const dismissButtons = document.querySelectorAll('.alert-dismiss');
    dismissButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const alertItem = this.closest('.alert-item');
            alertItem.style.opacity = '0';
            alertItem.style.transform = 'translateX(20px)';
            setTimeout(() => {
                alertItem.style.display = 'none';
            }, 300);
        });
    });
    
    // Dismiss all button
    const dismissAllBtn = document.querySelector('.btn-dismiss-all');
    if (dismissAllBtn) {
        dismissAllBtn.addEventListener('click', function() {
            const alerts = document.querySelectorAll('.alert-item');
            alerts.forEach((alert, index) => {
                setTimeout(() => {
                    alert.style.opacity = '0';
                    alert.style.transform = 'translateX(20px)';
                    setTimeout(() => {
                        alert.style.display = 'none';
                    }, 300);
                }, index * 100);
            });
        });
    }
    
    // Mark all as read
    const markReadBtn = document.querySelector('.btn-mark-read');
    if (markReadBtn) {
        markReadBtn.addEventListener('click', function() {
            const unreadItems = document.querySelectorAll('.notification-item.unread');
            unreadItems.forEach(item => {
                item.classList.remove('unread');
            });
            // Update unread count
            const unreadStat = document.querySelector('.notif-stat-card .stat-number');
            if (unreadStat) {
                unreadStat.textContent = '0';
            }
        });
    }
}

// Show toast notification
function showToast(type) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const messages = {
        success: { icon: 'check_circle', title: 'Success!', text: 'Your action was completed successfully.' },
        info: { icon: 'info', title: 'Information', text: 'Here is some useful information for you.' },
        warning: { icon: 'warning', title: 'Warning', text: 'Please review this important notice.' },
        danger: { icon: 'error', title: 'Error', text: 'Something went wrong. Please try again.' }
    };
    
    const msg = messages[type];
    
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.innerHTML = `
        <div class="toast-icon">
            <i class="material-symbols-rounded">${msg.icon}</i>
        </div>
        <div class="toast-content">
            <h6>${msg.title}</h6>
            <p>${msg.text}</p>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <i class="material-symbols-rounded">close</i>
        </button>
        <div class="toast-progress"></div>
    `;
    
    container.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4000);
}

// Initialize on load
if (typeof initNotificationsPage === 'function') {
    initNotificationsPage();
}
