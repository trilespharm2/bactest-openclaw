var notificationsInitialized = false;
var allNotifications = [];
var currentNotificationPage = 1;
var notificationsPerPage = 10;

function initNotificationsPage() {
    if (notificationsInitialized) return;
    notificationsInitialized = true;
    
    console.log('Notifications page initialized');
    
    setupSymbolScopeToggle();
    setupFilterTypeToggle();
    setupChannelTypeToggle();
    setupDurationToggle();
    setupRepeatFilterToggle();
    setupFormSubmission();
    
    loadScanners();
    loadRecentNotifications();
    loadSavedFilters();
    loadPresetFilters();
}

function setupDurationToggle() {
    var durationRadios = document.querySelectorAll('input[name="duration"]');
    var expiresContainer = document.getElementById('expiresDateContainer');
    
    durationRadios.forEach(function(radio) {
        radio.addEventListener('change', function() {
            if (this.value === 'until') {
                expiresContainer.style.display = 'block';
            } else {
                expiresContainer.style.display = 'none';
            }
        });
    });
}

function setupRepeatFilterToggle() {
    var repeatFilterRadios = document.querySelectorAll('input[name="repeatFilter"]');
    var repeatThresholdContainer = document.getElementById('repeatThresholdContainer');
    
    if (repeatFilterRadios.length > 0 && repeatThresholdContainer) {
        repeatFilterRadios.forEach(function(radio) {
            radio.addEventListener('change', function() {
                if (this.value === 'on') {
                    repeatThresholdContainer.style.display = 'block';
                } else {
                    repeatThresholdContainer.style.display = 'none';
                }
            });
        });
    }
}

function setupSymbolScopeToggle() {
    var symbolRadios = document.querySelectorAll('input[name="symbolScope"]');
    var symbolsContainer = document.getElementById('symbolsContainer');
    
    symbolRadios.forEach(function(radio) {
        radio.addEventListener('change', function() {
            if (this.value === 'specific') {
                symbolsContainer.style.display = 'block';
            } else {
                symbolsContainer.style.display = 'none';
            }
        });
    });
}

function setupFilterTypeToggle() {
    var filterRadios = document.querySelectorAll('input[name="filterType"]');
    var presetContainer = document.getElementById('presetFilterContainer');
    var savedContainer = document.getElementById('savedFilterContainer');
    
    filterRadios.forEach(function(radio) {
        radio.addEventListener('change', function() {
            if (this.value === 'preset') {
                presetContainer.style.display = 'block';
                savedContainer.style.display = 'none';
            } else {
                presetContainer.style.display = 'none';
                savedContainer.style.display = 'block';
                loadSavedFilters();
            }
        });
    });
}

function setupChannelTypeToggle() {
    var channelRadios = document.querySelectorAll('input[name="channelType"]');
    var emailConfig = document.getElementById('emailConfig');
    var telegramConfig = document.getElementById('telegramConfig');
    
    channelRadios.forEach(function(radio) {
        radio.addEventListener('change', function() {
            if (this.value === 'email') {
                emailConfig.style.display = 'block';
                telegramConfig.style.display = 'none';
            } else {
                emailConfig.style.display = 'none';
                telegramConfig.style.display = 'block';
            }
        });
    });
}

function addSymbolInput() {
    var container = document.getElementById('symbolInputs');
    var rows = container.querySelectorAll('.symbol-input-row');
    
    rows.forEach(function(row) {
        row.querySelector('.btn-remove-symbol').style.display = 'block';
    });
    
    var newRow = document.createElement('div');
    newRow.className = 'symbol-input-row';
    newRow.innerHTML = '<input type="text" placeholder="Enter symbol (e.g., AAPL)" class="symbol-input"><button type="button" class="btn-remove-symbol" onclick="removeSymbolInput(this)"><i class="fas fa-times"></i></button>';
    
    container.appendChild(newRow);
}

function removeSymbolInput(btn) {
    var row = btn.parentElement;
    var container = document.getElementById('symbolInputs');
    
    row.remove();
    
    var rows = container.querySelectorAll('.symbol-input-row');
    if (rows.length === 1) {
        rows[0].querySelector('.btn-remove-symbol').style.display = 'none';
    }
}

var pendingScannerData = null;

function setupFormSubmission() {
    var form = document.getElementById('scannerSetupForm');
    
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        showScannerConfirmation();
    });
}

function showScannerConfirmation() {
    var scannerName = document.getElementById('scannerName').value.trim();
    var symbolScope = document.querySelector('input[name="symbolScope"]:checked').value;
    var filterType = document.querySelector('input[name="filterType"]:checked').value;
    var frequency = document.querySelector('input[name="frequency"]:checked').value;
    var channelType = document.querySelector('input[name="channelType"]:checked').value;

    if (!scannerName) {
        appAlert('Please enter a name for your scanner');
        return;
    }

    var data = {
        name: scannerName,
        symbol_scope: symbolScope,
        filter_type: filterType,
        frequency: frequency,
        channel_type: channelType
    };

    if (symbolScope === 'specific') {
        data.symbols = getSymbolsList();
        if (data.symbols.length === 0) {
            appAlert('Please enter at least one symbol');
            return;
        }
    }

    if (filterType === 'preset') {
        data.preset_filter_id = document.getElementById('presetFilterSelect').value;
    } else {
        var savedFilterId = document.getElementById('savedFilterSelect').value;
        var selectedCard = document.querySelector('.saved-filter-card.selected');
        if (!savedFilterId || !selectedCard) {
            appAlert('Please select a saved filter from the list');
            return;
        }
        data.saved_filter_id = parseInt(savedFilterId);
    }

    if (channelType === 'email') {
        data.channel_target = document.getElementById('emailAddress').value;
        if (!data.channel_target) {
            appAlert('Please enter an email address');
            return;
        }
    } else {
        var botToken = document.getElementById('telegramBotToken').value;
        var chatId = document.getElementById('telegramChatId').value;
        if (!botToken || !chatId) {
            appAlert('Please enter both Telegram bot token and chat ID');
            return;
        }
        data._telegramBotToken = botToken;
        data.channel_target = chatId;
    }

    var activeFromTime = document.getElementById('activeFromTime').value.trim();
    var activeFromAmPm = document.getElementById('activeFromAmPm').value;
    var activeToTime = document.getElementById('activeToTime').value.trim();
    var activeToAmPm = document.getElementById('activeToAmPm').value;
    var durationValue = document.querySelector('input[name="duration"]:checked').value;

    if (activeFromTime) {
        data.active_from_time = activeFromTime + ' ' + activeFromAmPm;
    }
    if (activeToTime) {
        data.active_to_time = activeToTime + ' ' + activeToAmPm;
    }
    if (durationValue === 'until') {
        var expiresAt = document.getElementById('expiresAt').value;
        if (expiresAt) {
            data.expires_at = expiresAt;
        }
    }

    var repeatFilterValue = document.querySelector('input[name="repeatFilter"]:checked');
    if (repeatFilterValue && repeatFilterValue.value === 'on') {
        data.filter_repeat_symbols = true;
        data.repeat_threshold = parseInt(document.getElementById('repeatThreshold').value) || 5;
    } else {
        data.filter_repeat_symbols = false;
    }

    pendingScannerData = data;

    var freqLabels = {
        '1min': '1 Minute', '5min': '5 Minutes', '30min': '30 Minutes',
        '1hr': '1 Hour', '4hr': '4 Hours', '1day': '1 Day', '1week': '1 Week'
    };

    var filterLabel = '';
    if (filterType === 'preset') {
        var sel = document.getElementById('presetFilterSelect');
        filterLabel = sel.options[sel.selectedIndex].text;
    } else {
        var card = document.querySelector('.saved-filter-card.selected .saved-filter-name');
        filterLabel = card ? card.textContent : 'Stored Filter #' + data.saved_filter_id;
    }

    var rows = [
        ['Scanner Name', data.name],
        ['Symbols', symbolScope === 'any' ? 'All Symbols' : data.symbols.join(', ')],
        ['Filter', filterLabel],
        ['Frequency', freqLabels[frequency] || frequency],
        ['Notification', channelType === 'email' ? 'Email: ' + data.channel_target : 'Telegram: Chat ' + data.channel_target]
    ];

    if (data.active_from_time) rows.push(['Active From', data.active_from_time]);
    if (data.active_to_time) rows.push(['Active Until', data.active_to_time]);
    if (data.expires_at) rows.push(['Expires', data.expires_at]);
    if (data.filter_repeat_symbols) rows.push(['Repeat Filter', 'Skip after ' + data.repeat_threshold + ' consecutive hits']);

    var tableHtml = rows.map(function(r) {
        return '<tr style="border-bottom:1px solid #f0f2f6;">' +
            '<td style="padding:10px 12px;font-weight:600;color:#3b4758;white-space:nowrap;width:140px;">' + r[0] + '</td>' +
            '<td style="padding:10px 12px;color:#1a1e2e;">' + r[1] + '</td></tr>';
    }).join('');

    document.getElementById('scannerConfirmTable').innerHTML = tableHtml;
    document.getElementById('scannerConfirmModal').style.display = 'flex';
}

function closeScannerConfirmModal() {
    document.getElementById('scannerConfirmModal').style.display = 'none';
}

function confirmAndCreateScanner() {
    if (!pendingScannerData) return;
    closeScannerConfirmModal();

    var data = Object.assign({}, pendingScannerData);
    if (data._telegramBotToken) {
        saveTelegramChannel(data._telegramBotToken, data.channel_target);
        delete data._telegramBotToken;
    }

    var btn = document.getElementById('createScannerBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

    authFetch('/api/scanners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(function(response) { return response.json(); })
    .then(function(result) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-bolt"></i> Create Scanner';

        if (result.success) {
            appAlert('Scanner created successfully!');
            resetForm();
            loadScanners();
        } else {
            appAlert('Error: ' + (result.error || 'Failed to create scanner'));
        }
    })
    .catch(function(error) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-bolt"></i> Create Scanner';
        appAlert('Network error creating scanner');
    });

    pendingScannerData = null;
}

function getSymbolsList() {
    var inputs = document.querySelectorAll('.symbol-input');
    var symbols = [];
    
    inputs.forEach(function(input) {
        var value = input.value.trim().toUpperCase();
        if (value) {
            symbols.push(value);
        }
    });
    
    return symbols;
}


function generateScannerName(filterType, frequency) {
    var filterName = filterType === 'preset' ? 'NASDAQ Movers' : 'Custom Filter';
    var freqMap = {
        '1min': '1 Min',
        '5min': '5 Min',
        '30min': '30 Min',
        '1hr': 'Hourly',
        '4hr': '4 Hour',
        '1day': 'Daily',
        '1week': 'Weekly'
    };
    return filterName + ' - ' + (freqMap[frequency] || frequency);
}

function resetForm() {
    document.getElementById('scannerSetupForm').reset();
    document.getElementById('scannerName').value = '';
    document.getElementById('symbolsContainer').style.display = 'none';
    document.getElementById('presetFilterContainer').style.display = 'block';
    document.getElementById('savedFilterContainer').style.display = 'none';
    document.getElementById('emailConfig').style.display = 'block';
    document.getElementById('telegramConfig').style.display = 'none';
    document.getElementById('expiresDateContainer').style.display = 'none';
    document.getElementById('repeatThresholdContainer').style.display = 'none';
    
    var repeatFilterOff = document.getElementById('repeatFilterOff');
    if (repeatFilterOff) repeatFilterOff.checked = true;
    
    var repeatThreshold = document.getElementById('repeatThreshold');
    if (repeatThreshold) repeatThreshold.value = '5';
    
    var container = document.getElementById('symbolInputs');
    container.innerHTML = '<div class="symbol-input-row"><input type="text" placeholder="Enter symbol (e.g., AAPL)" class="symbol-input"><button type="button" class="btn-remove-symbol" onclick="removeSymbolInput(this)" style="display: none;"><i class="fas fa-times"></i></button></div>';
}

function saveTelegramChannel(botToken, chatId) {
    authFetch('/api/notification-channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            channel_type: 'telegram',
            config: { bot_token: botToken, chat_id: chatId }
        })
    });
}

function loadScanners() {
    authFetch('/api/scanners')
    .then(function(response) { return response.json(); })
    .then(function(result) {
        if (result.success) {
            renderScanners(result.scanners);
        }
    })
    .catch(function(error) {
        console.error('Error loading scanners:', error);
    });
}

function renderScanners(scanners) {
    var grid = document.getElementById('scannersGrid');
    var countBadge = document.getElementById('scannerCount');
    
    countBadge.textContent = scanners.length;
    
    if (scanners.length === 0) {
        grid.innerHTML = '<div class="empty-state" id="noScannersMessage"><i class="fas fa-satellite-dish"></i><h4>No Scanners Yet</h4><p>Create your first scanner above to start receiving automated alerts.</p></div>';
        return;
    }
    
    var html = '';
    scanners.forEach(function(scanner) {
        var freqMap = {
            '1min': '1 min',
            '5min': '5 min',
            '30min': '30 min',
            '1hr': '1 hour',
            '4hr': '4 hours',
            '1day': '1 day',
            '1week': '1 week'
        };
        
        html += '<div class="scanner-card ' + (scanner.is_active ? '' : 'inactive') + '">' +
            '<div class="scanner-header">' +
                '<span class="scanner-name">' + escapeHtml(scanner.name) + '</span>' +
                '<span class="scanner-status ' + (scanner.is_active ? 'active' : 'paused') + '">' +
                    '<i class="fas fa-circle" style="font-size: 8px;"></i> ' +
                    (scanner.is_active ? 'Active' : 'Paused') +
                '</span>' +
            '</div>' +
            '<div class="scanner-meta">' +
                '<span><i class="fas fa-clock"></i> ' + (freqMap[scanner.frequency] || scanner.frequency) + '</span>' +
                '<span><i class="fas fa-' + (scanner.channel_type === 'email' ? 'envelope' : 'paper-plane') + '"></i> ' + scanner.channel_type + '</span>' +
                '<span><i class="fas fa-filter"></i> ' + (scanner.preset_filter_id || 'Custom') + '</span>' +
            '</div>' +
            '<div class="scanner-actions">' +
                '<button class="btn-toggle" onclick="toggleScanner(' + scanner.id + ')">' +
                    '<i class="fas fa-' + (scanner.is_active ? 'pause' : 'play') + '"></i> ' +
                    (scanner.is_active ? 'Pause' : 'Resume') +
                '</button>' +
                '<button class="btn-run" onclick="runScannerNow(' + scanner.id + ')">' +
                    '<i class="fas fa-bolt"></i> Run Now' +
                '</button>' +
                '<button class="btn-delete" onclick="deleteScanner(' + scanner.id + ')">' +
                    '<i class="fas fa-trash"></i>' +
                '</button>' +
            '</div>' +
        '</div>';
    });
    
    grid.innerHTML = html;
}

function toggleScanner(scannerId) {
    authFetch('/api/scanners/' + scannerId + '/toggle', { method: 'POST' })
    .then(function(response) { return response.json(); })
    .then(function(result) {
        if (result.success) {
            loadScanners();
        } else {
            appAlert('Error: ' + (result.error || 'Failed to toggle scanner'));
        }
    });
}

function runScannerNow(scannerId) {
    authFetch('/api/scanners/' + scannerId + '/run-now', { method: 'POST' })
    .then(function(response) { return response.json(); })
    .then(function(result) {
        if (result.success) {
            appAlert('Scanner run started! Results will be sent to your notification channel.');
        } else {
            appAlert('Error: ' + (result.error || 'Failed to run scanner'));
        }
    });
}

async function deleteScanner(scannerId) {
    if (!(await appConfirm('Are you sure you want to delete this scanner?'))) return;
    
    authFetch('/api/scanners/' + scannerId, { method: 'DELETE' })
    .then(function(response) { return response.json(); })
    .then(function(result) {
        if (result.success) {
            loadScanners();
        } else {
            appAlert('Error: ' + (result.error || 'Failed to delete scanner'));
        }
    });
}

function loadRecentNotifications() {
    authFetch('/api/notifications/recent?limit=100')
    .then(function(response) { return response.json(); })
    .then(function(result) {
        console.log('Notifications API response:', result);
        if (result.success) {
            allNotifications = result.notifications;
            currentNotificationPage = 1;
            console.log('Loaded', allNotifications.length, 'notifications');
            renderNotificationsPage();
            updateClearAllButton();
        } else {
            console.error('Notifications API error:', result.error);
        }
    })
    .catch(function(error) {
        console.error('Error loading notifications:', error);
    });
}

function updateClearAllButton() {
    var clearBtn = document.getElementById('clearAllBtn');
    if (clearBtn) {
        clearBtn.style.display = allNotifications.length > 0 ? 'flex' : 'none';
    }
}

function renderNotificationsPage() {
    var container = document.getElementById('notificationsList');
    var paginationContainer = document.getElementById('notificationsPagination');
    
    if (!container) {
        console.error('notificationsList container not found!');
        return;
    }
    
    if (allNotifications.length === 0) {
        container.innerHTML = '<div class="empty-state" id="noNotificationsMessage"><i class="fas fa-inbox"></i><h4>No Notifications Yet</h4><p>Notifications will appear here once your scanners find matches.</p></div>';
        if (paginationContainer) paginationContainer.style.display = 'none';
        return;
    }
    
    var totalPages = Math.ceil(allNotifications.length / notificationsPerPage);
    var startIndex = (currentNotificationPage - 1) * notificationsPerPage;
    var endIndex = Math.min(startIndex + notificationsPerPage, allNotifications.length);
    var pageNotifications = allNotifications.slice(startIndex, endIndex);
    
    var html = '';
    pageNotifications.forEach(function(notif, index) {
        var timeStr = notif.time ? formatTime(notif.time) : 'Unknown';
        
        var symbolsHtml = '';
        if (notif.results && notif.results.length > 0) {
            notif.results.slice(0, 5).forEach(function(r) {
                var symbol = r.name || r.ticker || 'N/A';
                var change = r.change || 0;
                var changeClass = change >= 0 ? 'positive' : 'negative';
                symbolsHtml += '<span class="symbol-tag ' + changeClass + '">' + symbol + ' ' + (change >= 0 ? '+' : '') + change.toFixed(2) + '%</span>';
            });
            if (notif.results.length > 5) {
                symbolsHtml += '<span class="symbol-tag">+' + (notif.results.length - 5) + ' more</span>';
            }
        }
        
        var notifIndex = startIndex + index;
        
        html += '<div class="notification-item" data-notification-id="' + notif.id + '">' +
            '<div class="notification-icon"><i class="fas fa-chart-line"></i></div>' +
            '<div class="notification-content">' +
                '<div class="notification-header">' +
                    '<span class="notification-title">' + escapeHtml(notif.scanner_name) + '</span>' +
                    '<span class="notification-time">' + timeStr + '</span>' +
                '</div>' +
                '<div class="notification-filter">Filter: ' + escapeHtml(notif.filter_config) + ' | Found: ' + notif.symbols_found + ' symbols</div>' +
                '<div class="notification-symbols">' + symbolsHtml + '</div>' +
            '</div>' +
            '<button class="notification-expand-btn" onclick="expandNotification(' + notifIndex + ')" title="View details"><i class="fas fa-expand-alt"></i></button>' +
            '<button class="notification-delete-btn" onclick="deleteNotification(' + notif.id + ')" title="Delete notification"><i class="fas fa-trash"></i></button>' +
        '</div>';
    });
    
    container.innerHTML = html;
    
    if (paginationContainer && totalPages > 1) {
        paginationContainer.style.display = 'flex';
        document.getElementById('paginationInfo').textContent = 'Page ' + currentNotificationPage + ' of ' + totalPages;
        document.getElementById('prevPageBtn').disabled = currentNotificationPage === 1;
        document.getElementById('nextPageBtn').disabled = currentNotificationPage === totalPages;
    } else if (paginationContainer) {
        paginationContainer.style.display = 'none';
    }
}

function prevNotificationPage() {
    if (currentNotificationPage > 1) {
        currentNotificationPage--;
        renderNotificationsPage();
    }
}

function nextNotificationPage() {
    var totalPages = Math.ceil(allNotifications.length / notificationsPerPage);
    if (currentNotificationPage < totalPages) {
        currentNotificationPage++;
        renderNotificationsPage();
    }
}

function expandNotification(index) {
    var notif = allNotifications[index];
    if (!notif) return;
    
    var modal = document.getElementById('notificationModal');
    var modalTitle = document.getElementById('modalTitle');
    var modalBody = document.getElementById('modalBody');
    
    modalTitle.textContent = notif.scanner_name;
    
    var timeStr = notif.time ? formatTime(notif.time) : 'Unknown';
    var resultsHtml = '';
    
    if (notif.results && notif.results.length > 0) {
        resultsHtml = '<div class="modal-results-grid">';
        notif.results.forEach(function(r) {
            var symbol = r.name || r.ticker || 'N/A';
            var change = r.change || 0;
            var price = r.close || 0;
            var changeClass = change >= 0 ? 'positive' : 'negative';
            
            resultsHtml += '<div class="modal-result-item">' +
                '<div class="symbol">' + escapeHtml(symbol) + '</div>' +
                '<div class="change ' + changeClass + '">' + (change >= 0 ? '+' : '') + change.toFixed(2) + '%</div>' +
                '<div class="price">$' + price.toFixed(2) + '</div>' +
            '</div>';
        });
        resultsHtml += '</div>';
    } else {
        resultsHtml = '<p>No results data available.</p>';
    }
    
    modalBody.innerHTML = 
        '<p><strong>Filter:</strong> ' + escapeHtml(notif.filter_config) + '</p>' +
        '<p><strong>Time:</strong> ' + timeStr + '</p>' +
        '<p><strong>Symbols Found:</strong> ' + notif.symbols_found + '</p>' +
        '<h5 style="margin-top: 20px; margin-bottom: 12px;">All Results</h5>' +
        resultsHtml;
    
    modal.style.display = 'flex';
}

function closeNotificationModal() {
    var modal = document.getElementById('notificationModal');
    modal.style.display = 'none';
}

async function clearAllNotifications() {
    if (!(await appConfirm('Are you sure you want to delete ALL notifications? This cannot be undone.'))) {
        return;
    }
    
    authFetch('/api/notifications/clear-all', { method: 'DELETE' })
    .then(function(response) { return response.json(); })
    .then(function(result) {
        if (result.success) {
            allNotifications = [];
            currentNotificationPage = 1;
            renderNotificationsPage();
            updateClearAllButton();
        } else {
            appAlert('Error: ' + (result.error || 'Failed to clear notifications'));
        }
    })
    .catch(function(error) {
        console.error('Error clearing notifications:', error);
        appAlert('Failed to clear notifications');
    });
}

async function deleteNotification(notificationId) {
    if (!(await appConfirm('Are you sure you want to delete this notification?'))) {
        return;
    }
    
    authFetch('/api/notifications/' + notificationId, { method: 'DELETE' })
    .then(function(response) { return response.json(); })
    .then(function(result) {
        if (result.success) {
            loadRecentNotifications();
        } else {
            appAlert('Error: ' + (result.error || 'Failed to delete notification'));
        }
    })
    .catch(function(error) {
        console.error('Error deleting notification:', error);
        appAlert('Failed to delete notification');
    });
}

function loadSavedFilters() {
    authFetch('/api/saved-filters')
    .then(function(response) { return response.json(); })
    .then(function(result) {
        if (result.success) {
            renderSavedFilterCards(result.filters || []);
        }
    })
    .catch(function(error) {
        console.error('Error loading saved filters:', error);
    });
}

function renderSavedFilterCards(filters) {
    var container = document.getElementById('savedFilterCards');
    if (!container) return;

    if (filters.length === 0) {
        container.innerHTML = '<div class="saved-filter-empty">' +
            '<i class="fas fa-filter"></i>' +
            '<h4>No Filters Saved</h4>' +
            '<p>Create filters in the Screener and save them to use here.</p>' +
            '<button type="button" class="btn-create-filter" onclick="goToScreener()">' +
                '<i class="fas fa-plus"></i> Create Filter' +
            '</button>' +
        '</div>';
        document.getElementById('savedFilterSelect').value = '';
        return;
    }

    var html = '';
    filters.forEach(function(filter) {
        var filterCount = 0;
        try {
            var config = typeof filter.filter_config === 'string' ? JSON.parse(filter.filter_config) : filter.filter_config;
            filterCount = Array.isArray(config) ? config.length : 0;
        } catch(e) { filterCount = 0; }

        html += '<div class="saved-filter-card" data-filter-id="' + filter.id + '" onclick="selectSavedFilter(' + filter.id + ')">' +
            '<div class="filter-radio"></div>' +
            '<div class="filter-details">' +
                '<div class="filter-name">' + escapeHtml(filter.name) + '</div>' +
                '<div class="filter-meta">' + filterCount + ' filter' + (filterCount !== 1 ? 's' : '') + ' configured</div>' +
            '</div>' +
            '<div class="filter-count-badge"><i class="fas fa-filter" style="margin-right: 4px;"></i>' + filterCount + '</div>' +
        '</div>';
    });

    container.innerHTML = html;

    var hiddenInput = document.getElementById('savedFilterSelect');
    var currentValue = hiddenInput.value;
    if (currentValue) {
        var stillExists = filters.some(function(f) { return String(f.id) === String(currentValue); });
        if (stillExists) {
            var matchingCard = container.querySelector('[data-filter-id="' + currentValue + '"]');
            if (matchingCard) matchingCard.classList.add('selected');
        } else {
            hiddenInput.value = '';
        }
    }
}

function selectSavedFilter(filterId) {
    document.getElementById('savedFilterSelect').value = filterId;

    var cards = document.querySelectorAll('.saved-filter-card');
    cards.forEach(function(card) {
        if (parseInt(card.getAttribute('data-filter-id')) === filterId) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    });
}

function goToScreener() {
    if (typeof window.navigateToPage === 'function') {
        window.navigateToPage('screener');
    }
}

function loadPresetFilters() {
    authFetch('/api/preset-filters')
    .then(function(response) { return response.json(); })
    .then(function(result) {
        if (result.success && result.presets) {
            var select = document.getElementById('presetFilterSelect');
            if (!select) return;
            select.innerHTML = '';
            
            result.presets.forEach(function(preset) {
                var option = document.createElement('option');
                option.value = preset.id;
                option.textContent = preset.name + ' - ' + preset.description;
                select.appendChild(option);
            });
        }
    })
    .catch(function(error) {
        console.error('Error loading preset filters:', error);
        var select = document.getElementById('presetFilterSelect');
        if (select) {
            select.innerHTML = '<option value="nasdaq_high_movers">NASDAQ High Movers (&gt;75% 1-day)</option>';
        }
    });
}

function formatTime(isoString) {
    var date = new Date(isoString);
    var year = date.getUTCFullYear();
    var month = String(date.getUTCMonth() + 1).padStart(2, '0');
    var day = String(date.getUTCDate()).padStart(2, '0');
    var hours = String(date.getUTCHours()).padStart(2, '0');
    var minutes = String(date.getUTCMinutes()).padStart(2, '0');
    var seconds = String(date.getUTCSeconds()).padStart(2, '0');
    
    return year + '-' + month + '-' + day + ' ' + hours + ':' + minutes + ':' + seconds + ' UTC';
}

function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

if (typeof window.initNotificationsPage === 'undefined') {
    window.initNotificationsPage = initNotificationsPage;
    window.addSymbolInput = addSymbolInput;
    window.removeSymbolInput = removeSymbolInput;
    window.toggleScanner = toggleScanner;
    window.runScannerNow = runScannerNow;
    window.deleteScanner = deleteScanner;
    window.deleteNotification = deleteNotification;
    window.expandNotification = expandNotification;
    window.closeNotificationModal = closeNotificationModal;
    window.clearAllNotifications = clearAllNotifications;
    window.prevNotificationPage = prevNotificationPage;
    window.nextNotificationPage = nextNotificationPage;
    window.selectSavedFilter = selectSavedFilter;
    window.goToScreener = goToScreener;
    window.renderSavedFilterCards = renderSavedFilterCards;
}
