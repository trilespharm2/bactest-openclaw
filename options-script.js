// Options Page JavaScript
// This file is loaded dynamically when the options page is accessed

function initializeOptionsPage() {
    console.log('Initializing Options Page');
    
    // State
    let allResults = [];
    let currentPage = 1;
    let rowsPerPage = 50;
    let sortColumn = 't';
    let sortDirection = 'asc';
    
    // DOM Elements
    const elements = {
        ticker: document.getElementById('optionsTicker'),
        multiplier: document.getElementById('optionsMultiplier'),
        timespan: document.getElementById('optionsTimespan'),
        fromDate: document.getElementById('optionsFromDate'),
        toDate: document.getElementById('optionsToDate'),
        adjusted: document.getElementById('optionsAdjusted'),
        sort: document.getElementById('optionsSort'),
        limit: document.getElementById('optionsLimit'),
        
        fetchBtn: document.getElementById('fetchOptionsBtn'),
        resetBtn: document.getElementById('resetOptionsBtn'),
        downloadCSV: document.getElementById('downloadOptionsCSV'),
        downloadJSON: document.getElementById('downloadOptionsJSON'),
        copyUrl: document.getElementById('copyOptionsUrlBtn'),
        
        apiUrlDisplay: document.getElementById('optionsApiUrlDisplay'),
        apiUrl: document.getElementById('optionsApiUrl'),
        loading: document.getElementById('optionsLoading'),
        error: document.getElementById('optionsError'),
        results: document.getElementById('optionsResults'),
        tableBody: document.getElementById('optionsTableBody'),
        resultCount: document.getElementById('optionsResultCount'),
        dateRange: document.getElementById('optionsDateRange'),
        
        rowsPerPage: document.getElementById('optionsRowsPerPage'),
        paginationInfo: document.getElementById('optionsPaginationInfo'),
        pageIndicator: document.getElementById('optionsPageIndicator'),
        firstPage: document.getElementById('optionsFirstPage'),
        prevPage: document.getElementById('optionsPrevPage'),
        nextPage: document.getElementById('optionsNextPage'),
        lastPage: document.getElementById('optionsLastPage')
    };
    
    // Set default dates
    if (window.defaultFromDate && window.defaultToDate) {
        elements.fromDate.value = window.defaultFromDate;
        elements.toDate.value = window.defaultToDate;
    }
    
    // Event Listeners
    elements.fetchBtn.addEventListener('click', fetchData);
    elements.resetBtn.addEventListener('click', resetForm);
    elements.downloadCSV.addEventListener('click', () => downloadCSV(allResults, elements.ticker.value));
    elements.downloadJSON.addEventListener('click', () => downloadJSON(allResults, elements.ticker.value));
    elements.copyUrl.addEventListener('click', () => copyToClipboard(elements.apiUrl.textContent));
    
    elements.rowsPerPage.addEventListener('click', () => {
        rowsPerPage = parseInt(elements.rowsPerPage.value);
        currentPage = 1;
        renderTable();
    });
    
    elements.firstPage.addEventListener('click', () => goToPage(1));
    elements.prevPage.addEventListener('click', () => goToPage(currentPage - 1));
    elements.nextPage.addEventListener('click', () => goToPage(currentPage + 1));
    elements.lastPage.addEventListener('click', () => goToPage(getTotalPages()));
    
    // Table sorting
    document.querySelectorAll('#optionsResults .sortable').forEach(header => {
        header.addEventListener('click', () => handleSort(header.dataset.column));
    });
    
    // Utility Functions
    function formatTimestampToEST(timestamp) {
        if (!timestamp) return 'N/A';
        const date = new Date(timestamp);
        // Format to EST (America/New_York timezone)
        const estOptions = {
            timeZone: 'America/New_York',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        };
        return date.toLocaleString('en-US', estOptions);
    }
    
    function formatPrice(price) {
        if (price === undefined || price === null) return 'N/A';
        return '$' + price.toFixed(2);
    }
    
    function formatVolume(volume) {
        if (volume === undefined || volume === null) return 'N/A';
        return volume.toLocaleString('en-US');
    }
    
    // Functions
    function resetForm() {
        elements.ticker.value = '';
        elements.multiplier.value = '1';
        elements.timespan.value = 'day';
        elements.fromDate.value = window.defaultFromDate;
        elements.toDate.value = window.defaultToDate;
        elements.adjusted.value = 'true';
        elements.sort.value = 'asc';
        elements.limit.value = '120';
        elements.apiUrlDisplay.style.display = 'none';
        elements.results.style.display = 'none';
        hideError();
    }
    
    function buildAPIURL() {
        const ticker = elements.ticker.value.trim();
        const multiplier = elements.multiplier.value;
        const timespan = elements.timespan.value;
        const from = elements.fromDate.value;
        const to = elements.toDate.value;
        const adjusted = elements.adjusted.value;
        const sort = elements.sort.value;
        const limit = elements.limit.value;
        
        return `${API_BASE_URL}/options/aggregates/${ticker}?multiplier=${multiplier}&timespan=${timespan}&from=${from}&to=${to}&adjusted=${adjusted}&sort=${sort}&limit=${limit}`;
    }
    
    async function fetchData() {
        const ticker = elements.ticker.value.trim();
        if (!ticker) {
            showError('Please enter an options ticker');
            return;
        }
        
        if (new Date(elements.fromDate.value) > new Date(elements.toDate.value)) {
            showError('Start date must be before end date');
            return;
        }
        
        const url = buildAPIURL();
        elements.apiUrl.textContent = url;
        elements.apiUrlDisplay.style.display = 'block';
        
        hideError();
        elements.results.style.display = 'none';
        elements.loading.style.display = 'block';
        
        try {
            const apiKey = getAPIKey();
            const headers = apiKey ? { 'X-API-Key': apiKey } : {};
            
            const response = await fetch(url, { headers });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `API Error: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data.results || data.results.length === 0) {
                showError('No results found for the specified parameters');
                return;
            }
            
            allResults = data.results;
            currentPage = 1;
            displayResults();
            
        } catch (error) {
            showError(`Error fetching data: ${error.message}`);
        } finally {
            elements.loading.style.display = 'none';
        }
    }
    
    function displayResults() {
        elements.resultCount.textContent = `${allResults.length.toLocaleString()} results`;
        
        if (allResults.length > 0) {
            const firstDate = formatTimestampToEST(allResults[0].t);
            const lastDate = formatTimestampToEST(allResults[allResults.length - 1].t);
            elements.dateRange.textContent = `${firstDate} to ${lastDate}`;
        }
        
        renderTable();
        calculateStatistics();
        elements.results.style.display = 'block';
        elements.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    function renderTable() {
        const start = (currentPage - 1) * rowsPerPage;
        const end = start + rowsPerPage;
        const pageData = allResults.slice(start, end);
        
        elements.tableBody.innerHTML = '';
        
        pageData.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${formatTimestampToEST(row.t)}</td>
                <td>${formatPrice(row.o)}</td>
                <td>${formatPrice(row.h)}</td>
                <td>${formatPrice(row.l)}</td>
                <td>${formatPrice(row.c)}</td>
                <td>${formatVolume(row.v)}</td>
                <td>${formatPrice(row.vw)}</td>
                <td>${formatVolume(row.n || 0)}</td>
            `;
            elements.tableBody.appendChild(tr);
        });
        
        updatePagination();
    }
    
    function updatePagination() {
        const totalPages = getTotalPages();
        const start = (currentPage - 1) * rowsPerPage + 1;
        const end = Math.min(currentPage * rowsPerPage, allResults.length);
        
        elements.paginationInfo.textContent = `Showing ${start.toLocaleString()}-${end.toLocaleString()} of ${allResults.length.toLocaleString()}`;
        elements.pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
        
        elements.firstPage.disabled = currentPage === 1;
        elements.prevPage.disabled = currentPage === 1;
        elements.nextPage.disabled = currentPage === totalPages;
        elements.lastPage.disabled = currentPage === totalPages;
    }
    
    function getTotalPages() {
        return Math.ceil(allResults.length / rowsPerPage);
    }
    
    function goToPage(page) {
        const totalPages = getTotalPages();
        if (page < 1 || page > totalPages) return;
        currentPage = page;
        renderTable();
    }
    
    function handleSort(column) {
        if (sortColumn === column) {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            sortColumn = column;
            sortDirection = 'asc';
        }
        
        allResults.sort((a, b) => {
            const valA = a[column];
            const valB = b[column];
            if (valA === undefined || valA === null) return 1;
            if (valB === undefined || valB === null) return -1;
            return sortDirection === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
        });
        
        renderTable();
    }
    
    function calculateStatistics() {
        if (allResults.length === 0) return;
        
        const totalVolume = allResults.reduce((sum, row) => sum + (row.v || 0), 0);
        const avgVolume = totalVolume / allResults.length;
        const highestPrice = Math.max(...allResults.map(row => row.h || 0));
        const lowestPrice = Math.min(...allResults.map(row => row.l || Number.MAX_VALUE));
        const avgVWAP = allResults.reduce((sum, row) => sum + (row.vw || 0), 0) / allResults.length;
        const totalTransactions = allResults.reduce((sum, row) => sum + (row.n || 0), 0);
        
        document.getElementById('optionsTotalVolume').textContent = formatVolume(totalVolume);
        document.getElementById('optionsAvgVolume').textContent = formatVolume(Math.round(avgVolume));
        document.getElementById('optionsHighestPrice').textContent = formatPrice(highestPrice);
        document.getElementById('optionsLowestPrice').textContent = formatPrice(lowestPrice);
        document.getElementById('optionsAvgVWAP').textContent = formatPrice(avgVWAP);
        document.getElementById('optionsTotalTransactions').textContent = formatVolume(totalTransactions);
    }
    
    function downloadCSV(data, ticker) {
        if (data.length === 0) return;
        
        const headers = ['Timestamp (Unix)', 'Date', 'Time (EST)', 'Open', 'High', 'Low', 'Close', 'Volume', 'VWAP', 'Transactions'];
        let csv = headers.join(',') + '\n';
        
        data.forEach(row => {
            const date = new Date(row.t);
            const estDate = date.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
            const estTime = date.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false });
            
            csv += [
                row.t,
                `"${estDate}"`,
                `"${estTime}"`,
                row.o || '', 
                row.h || '', 
                row.l || '', 
                row.c || '',
                row.v || '', 
                row.vw || '', 
                row.n || ''
            ].join(',') + '\n';
        });
        
        downloadFile(csv, `options_${ticker}_${Date.now()}.csv`, 'text/csv');
    }
    
    function downloadJSON(data, ticker) {
        if (data.length === 0) return;
        const json = JSON.stringify(data, null, 2);
        downloadFile(json, `options_${ticker}_${Date.now()}.json`, 'application/json');
    }
    
    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            showNotification('URL copied to clipboard', 'success');
        });
    }
    
    function showError(message) {
        elements.error.textContent = message;
        elements.error.style.display = 'block';
        setTimeout(() => elements.error.style.display = 'none', 5000);
    }
    
    function hideError() {
        elements.error.style.display = 'none';
    }
}
