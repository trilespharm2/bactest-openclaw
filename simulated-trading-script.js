let simAllBars = [];
let simVisibleBars = [];
let simCurrentBarIndex = 0;
let simTradingStartIndex = 0;
let simChart = null;

let simCurrentMinuteIndex = 0;
let simTradingStartMinuteIndex = 0;

let simViewportStart = 0;
let simViewportEnd = 0;
let simMinBarsVisible = 10;
let simMaxBarsVisible = 500;

let simIsDragging = false;
let simDragStartX = 0;
let simDragStartViewport = 0;

let simVerticalScale = 1.0;
let simIsYAxisDragging = false;
let simYAxisDragStartY = 0;
let simYAxisDragStartScale = 1.0;

let simTouchStartX = 0;
let simTouchStartViewport = 0;
let simPinchStartDistance = 0;
let simPinchStartBarsInView = 0;

let simInitialBalance = 100000;
let simRealizedPnl = 0;
let simOpenPosition = null;
let simClosedTrades = [];

let simOptionsRealizedPnl = 0;
let simOpenOptionPositions = [];
let simClosedOptionTrades = [];
let simOptionBarsCache = {};

const SIM_TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '2h', '4h'];
const SIM_TIMEFRAME_CONFIG = {
    '1m': { barSize: 'minute', multiplier: 1, label: '1 Min' },
    '5m': { barSize: 'minute', multiplier: 5, label: '5 Min' },
    '15m': { barSize: 'minute', multiplier: 15, label: '15 Min' },
    '30m': { barSize: 'minute', multiplier: 30, label: '30 Min' },
    '1h': { barSize: 'hour', multiplier: 1, label: '1 Hour' },
    '2h': { barSize: 'hour', multiplier: 2, label: '2 Hour' },
    '4h': { barSize: 'hour', multiplier: 4, label: '4 Hour' }
};

let simTimeframeData = {};
let simCurrentTimeframe = '1m';
let simCurrentSymbol = '';
let simChartDates = { start: '', end: '', tradingStart: '' };
let simIsLoadingTimeframes = false;
let simLoadedTimeframes = 0;

let simAutoplayTimer = null;
let simIsPlaying = false;

const SIM_API_RATE_LIMIT = 3;
const SIM_API_RATE_WINDOW = 60000;
let simApiCallTimestamps = [];

async function waitForRateLimit() {
    while (true) {
        const now = Date.now();
        simApiCallTimestamps = simApiCallTimestamps.filter(ts => now - ts < SIM_API_RATE_WINDOW);
        
        if (simApiCallTimestamps.length < SIM_API_RATE_LIMIT) {
            simApiCallTimestamps.push(Date.now());
            return true;
        }
        
        const oldestCall = simApiCallTimestamps[0];
        const waitTime = SIM_API_RATE_WINDOW - (now - oldestCall) + 100;
        
        if (waitTime > 0) {
            updateLoadingStatus(`Rate limit: waiting ${Math.ceil(waitTime / 1000)}s...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
}

function parseETDateTime(dateStr, timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const testDateEST = new Date(`${dateStr}T${timeStr}:00-05:00`);
    const testDateEDT = new Date(`${dateStr}T${timeStr}:00-04:00`);
    const estCheck = testDateEST.toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
    const [estH, estM] = estCheck.split(':').map(Number);
    if (estH === hours && estM === minutes) {
        return testDateEST.getTime();
    }
    return testDateEDT.getTime();
}

function initSimulatedTrading() {
    console.log('Initializing Simulated Trading Page');
    
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const fifteenDaysAgo = new Date(today);
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
    
    document.getElementById('simChartStartDate').value = thirtyDaysAgo.toISOString().split('T')[0];
    document.getElementById('simChartEndDate').value = today.toISOString().split('T')[0];
    document.getElementById('simTradingStartDate').value = fifteenDaysAgo.toISOString().split('T')[0];
    
    document.getElementById('simLoadChartBtn').addEventListener('click', loadSimulatedChart);
    document.getElementById('simResetBtn').addEventListener('click', resetSimulatedChart);
    document.getElementById('simPrevBar').addEventListener('click', showPreviousBar);
    document.getElementById('simNextBar').addEventListener('click', showNextBar);
    
    document.getElementById('simBuyBtn').addEventListener('click', () => executeTrade('buy'));
    document.getElementById('simSellBtn').addEventListener('click', () => executeTrade('sell'));
    document.getElementById('simGotoDateBtn').addEventListener('click', gotoDateTime);
    document.getElementById('simOptionTradeBtn').addEventListener('click', executeOptionTrade);
    document.getElementById('simResetViewBtn').addEventListener('click', resetViewToCurrentCandle);
    document.getElementById('simPlayPauseBtn').addEventListener('click', toggleAutoplay);
    
    document.getElementById('simAutoplaySpeed').addEventListener('change', () => {
        if (simIsPlaying) {
            stopAutoplay();
            startAutoplay();
        }
    });
    
    document.getElementById('simOptionStrategy').addEventListener('change', buildSimLegConfiguration);
    buildSimLegConfiguration();
    
    document.querySelectorAll('.timeframe-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tf = e.target.dataset.timeframe;
            switchTimeframe(tf);
        });
    });
    
    const canvas = document.getElementById('simCandlestickChart');
    canvas.addEventListener('mousedown', handleChartMouseDown);
    canvas.addEventListener('mousemove', handleChartMouseMove);
    canvas.addEventListener('mouseup', handleChartMouseUp);
    canvas.addEventListener('mouseleave', handleChartMouseLeave);
    canvas.addEventListener('wheel', handleChartWheel, { passive: false });
    canvas.addEventListener('click', handleChartClick);
    canvas.addEventListener('dblclick', handleChartDoubleClick);
    
    canvas.addEventListener('touchstart', handleChartTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleChartTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleChartTouchEnd);
    
    console.log('Simulated Trading Page initialized successfully!');
}

function showLoader(show, text = 'Loading chart data...', progress = '') {
    const loader = document.getElementById('simChartLoader');
    const loaderText = document.getElementById('simLoaderText');
    const loaderProgress = document.getElementById('simLoaderProgress');
    
    loader.style.display = show ? 'block' : 'none';
    if (text) loaderText.textContent = text;
    if (loaderProgress) loaderProgress.textContent = progress;
}

function updateLoadingStatus(text) {
    const statusEl = document.getElementById('simDataLoadingStatus');
    if (statusEl) statusEl.textContent = text;
}

async function fetchMinuteBars(symbol, startDate, endDate) {
    await waitForRateLimit();
    
    const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? `http://${window.location.hostname}:${window.location.port}/api`
        : '/api';
    
    const apiKey = localStorage.getItem('polygonApiKey') || '';
    
    try {
        const response = await fetch(`${apiUrl}/simulated-trading/bars`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            credentials: 'include',
            body: JSON.stringify({
                symbol: symbol,
                start_date: startDate,
                end_date: endDate,
                bar_size: 'minute',
                multiplier: 1
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to fetch data');
        }
        
        const data = await response.json();
        return data.bars || [];
    } catch (error) {
        console.error('Error fetching 1m data:', error);
        return null;
    }
}

function aggregateBars(minuteBars, targetMinutes) {
    if (!minuteBars || minuteBars.length === 0) return [];
    if (targetMinutes === 1) return minuteBars;
    
    const aggregated = [];
    const intervalMs = targetMinutes * 60 * 1000;
    
    let currentBatch = [];
    let batchStartTime = null;
    
    for (let i = 0; i < minuteBars.length; i++) {
        const bar = minuteBars[i];
        const barTime = bar.timestamp;
        
        const alignedTime = Math.floor(barTime / intervalMs) * intervalMs;
        
        if (batchStartTime === null) {
            batchStartTime = alignedTime;
        }
        
        if (alignedTime !== batchStartTime && currentBatch.length > 0) {
            aggregated.push(createAggregatedBar(currentBatch, batchStartTime));
            currentBatch = [];
            batchStartTime = alignedTime;
        }
        
        const timeSinceLastBar = i > 0 ? barTime - minuteBars[i - 1].timestamp : 0;
        if (timeSinceLastBar > 2 * 60 * 1000 && currentBatch.length > 0) {
            aggregated.push(createAggregatedBar(currentBatch, batchStartTime));
            currentBatch = [];
            batchStartTime = alignedTime;
        }
        
        currentBatch.push(bar);
    }
    
    if (currentBatch.length > 0) {
        aggregated.push(createAggregatedBar(currentBatch, batchStartTime));
    }
    
    return aggregated;
}

function createAggregatedBar(bars, timestamp, isPartial = false) {
    return {
        timestamp: timestamp,
        open: bars[0].open,
        high: Math.max(...bars.map(b => b.high)),
        low: Math.min(...bars.map(b => b.low)),
        close: bars[bars.length - 1].close,
        volume: bars.reduce((sum, b) => sum + (b.volume || 0), 0),
        isPartial: isPartial,
        minuteCount: bars.length,
        lastMinuteTimestamp: bars[bars.length - 1].timestamp
    };
}

function aggregateBarsUpToMinute(minuteBars, targetMinutes, upToMinuteIndex) {
    if (!minuteBars || minuteBars.length === 0 || upToMinuteIndex <= 0) return [];
    if (targetMinutes === 1) {
        return minuteBars.slice(0, upToMinuteIndex).map(bar => ({
            ...bar,
            isPartial: false,
            minuteCount: 1,
            lastMinuteTimestamp: bar.timestamp
        }));
    }
    
    const aggregated = [];
    const intervalMs = targetMinutes * 60 * 1000;
    const barsToProcess = minuteBars.slice(0, upToMinuteIndex);
    
    let currentBatch = [];
    let batchStartTime = null;
    
    for (let i = 0; i < barsToProcess.length; i++) {
        const bar = barsToProcess[i];
        const barTime = bar.timestamp;
        const alignedTime = Math.floor(barTime / intervalMs) * intervalMs;
        
        if (batchStartTime === null) {
            batchStartTime = alignedTime;
        }
        
        if (alignedTime !== batchStartTime && currentBatch.length > 0) {
            aggregated.push(createAggregatedBar(currentBatch, batchStartTime, false));
            currentBatch = [];
            batchStartTime = alignedTime;
        }
        
        const timeSinceLastBar = i > 0 ? barTime - barsToProcess[i - 1].timestamp : 0;
        if (timeSinceLastBar > 2 * 60 * 1000 && currentBatch.length > 0) {
            aggregated.push(createAggregatedBar(currentBatch, batchStartTime, false));
            currentBatch = [];
            batchStartTime = alignedTime;
        }
        
        currentBatch.push(bar);
    }
    
    if (currentBatch.length > 0) {
        const expectedBarsInCandle = targetMinutes;
        const isPartial = currentBatch.length < expectedBarsInCandle;
        aggregated.push(createAggregatedBar(currentBatch, batchStartTime, isPartial));
    }
    
    return aggregated;
}

const TIMEFRAME_MINUTES = {
    '1m': 1,
    '5m': 5,
    '15m': 15,
    '30m': 30,
    '1h': 60,
    '2h': 120,
    '4h': 240
};

let simMinuteBarsCache = [];
let simLastBarTimestamp = 0;
let simLastZoomBarsInView = 0;
let simMouseX = -1;
let simMouseY = -1;
let simHoveredBar = null;

async function loadSimulatedChart() {
    stopAutoplay();
    const symbol = document.getElementById('simSymbol').value.toUpperCase().trim();
    const chartStartDate = document.getElementById('simChartStartDate').value;
    const chartEndDate = document.getElementById('simChartEndDate').value;
    const tradingStartDate = document.getElementById('simTradingStartDate').value;
    
    const dateErrorDiv = document.getElementById('simDateError');
    const dateErrorText = document.getElementById('simDateErrorText');
    dateErrorDiv.classList.add('d-none');
    
    if (!symbol || !chartStartDate || !chartEndDate || !tradingStartDate) {
        dateErrorText.textContent = 'Please fill in all required fields';
        dateErrorDiv.classList.remove('d-none');
        return;
    }
    
    if (new Date(tradingStartDate) < new Date(chartStartDate)) {
        dateErrorText.textContent = 'Trading start date cannot be before chart start date';
        dateErrorDiv.classList.remove('d-none');
        return;
    }
    
    if (new Date(tradingStartDate) > new Date(chartEndDate)) {
        dateErrorText.textContent = 'Trading start date cannot be after chart end date';
        dateErrorDiv.classList.remove('d-none');
        return;
    }
    
    const loadBtn = document.getElementById('simLoadChartBtn');
    loadBtn.disabled = true;
    loadBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Loading...';
    
    simCurrentSymbol = symbol;
    simChartDates = { start: chartStartDate, end: chartEndDate, tradingStart: tradingStartDate };
    simTimeframeData = {};
    simLoadedTimeframes = 0;
    simIsLoadingTimeframes = true;
    simMinuteBarsCache = [];
    
    document.getElementById('simChartPlaceholder').style.display = 'none';
    document.getElementById('simCandlestickChart').style.display = 'block';
    showLoader(true, 'Fetching 1-minute data...', 'Single API call');
    
    try {
        const minuteBars = await fetchMinuteBars(symbol, chartStartDate, chartEndDate);
        
        if (!minuteBars || minuteBars.length === 0) {
            throw new Error('No data found for the specified parameters');
        }
        
        simMinuteBarsCache = minuteBars;
        console.log(`Fetched ${minuteBars.length} 1-minute bars`);
        
        showLoader(true, 'Computing timeframes...', '0 / 7');
        
        computeAllTimeframes(tradingStartDate);
        
    } catch (error) {
        console.error('Error loading chart:', error);
        alert('Error loading chart: ' + error.message);
        showLoader(false);
    } finally {
        loadBtn.disabled = false;
        loadBtn.innerHTML = '<i class="fas fa-chart-bar me-1"></i> Load Chart';
    }
}

function computeAllTimeframes(tradingStartDate) {
    const defaultTf = '1m';
    
    simInitialBalance = parseFloat(document.getElementById('simAccountBalance').value) || 100000;
    simRealizedPnl = 0;
    simOpenPosition = null;
    simClosedTrades = [];
    
    for (const tf of SIM_TIMEFRAMES) {
        updateLoadingStatus(`Computing ${SIM_TIMEFRAME_CONFIG[tf].label}...`);
        
        const targetMinutes = TIMEFRAME_MINUTES[tf];
        const aggregatedBars = aggregateBars(simMinuteBarsCache, targetMinutes);
        
        simTimeframeData[tf] = aggregatedBars;
        simLoadedTimeframes++;
        
        updateTimeframeButtons();
    }
    
    simCurrentTimeframe = defaultTf;
    switchToTimeframeData(defaultTf, tradingStartDate);
    
    document.getElementById('simTimeframeSelector').style.display = 'block';
    document.getElementById('simOHLCDisplay').style.display = 'block';
    document.getElementById('chartNavigation').style.display = 'flex';
    document.getElementById('gotoDateGroup').style.display = 'flex';
    document.getElementById('simTradingControls').style.display = 'block';
    document.getElementById('simGotoTime').value = '09:30';
    
    updateSymbolDisplay();
    updateTradingDisplay();
    showLoader(false);
    
    simIsLoadingTimeframes = false;
    updateLoadingStatus(`All timeframes computed (${simMinuteBarsCache.length} 1m bars)`);
    setTimeout(() => updateLoadingStatus(''), 3000);
}

function switchToTimeframeData(timeframe, tradingStartDate, retainTimeAndZoom = false) {
    if (!simMinuteBarsCache || simMinuteBarsCache.length === 0) return;
    
    const tradingStartTs = new Date(tradingStartDate || simChartDates.tradingStart).getTime();
    simTradingStartMinuteIndex = simMinuteBarsCache.findIndex(bar => bar.timestamp >= tradingStartTs);
    
    if (simTradingStartMinuteIndex === -1) {
        simTradingStartMinuteIndex = simMinuteBarsCache.length;
    }
    
    let savedRightEdgeTimestamp = null;
    let savedMinuteSpan = null;
    let savedFutureOffset = 0;
    
    if (retainTimeAndZoom && simVisibleBars.length > 0) {
        const barsInView = simViewportEnd - simViewportStart;
        const oldTargetMinutes = TIMEFRAME_MINUTES[simCurrentTimeframe];
        savedMinuteSpan = barsInView * oldTargetMinutes;
        savedFutureOffset = Math.max(0, simViewportEnd - simVisibleBars.length);
        
        const rightBarIndex = Math.min(Math.ceil(simViewportEnd) - 1, simVisibleBars.length - 1);
        if (rightBarIndex >= 0 && rightBarIndex < simVisibleBars.length) {
            const rightBar = simVisibleBars[rightBarIndex];
            savedRightEdgeTimestamp = rightBar.lastMinuteTimestamp || rightBar.timestamp;
        }
    }
    
    if (!retainTimeAndZoom) {
        simCurrentMinuteIndex = simTradingStartMinuteIndex;
    }
    
    rebuildBarsForCurrentTimeframe();
    
    if (retainTimeAndZoom && savedRightEdgeTimestamp !== null && savedMinuteSpan > 0) {
        const newTargetMinutes = TIMEFRAME_MINUTES[timeframe];
        const newBarsInView = Math.max(10, Math.round(savedMinuteSpan / newTargetMinutes));
        
        let rightBarIndex = simVisibleBars.findIndex(bar => {
            const barEnd = bar.lastMinuteTimestamp || bar.timestamp;
            return bar.timestamp <= savedRightEdgeTimestamp && barEnd >= savedRightEdgeTimestamp;
        });
        
        if (rightBarIndex === -1) {
            rightBarIndex = simVisibleBars.findIndex(bar => bar.timestamp > savedRightEdgeTimestamp);
            if (rightBarIndex > 0) rightBarIndex--;
            else if (rightBarIndex === -1) rightBarIndex = simVisibleBars.length - 1;
        }
        
        simViewportEnd = rightBarIndex + 1;
        simViewportStart = Math.max(0, simViewportEnd - newBarsInView);
        
        if (savedFutureOffset > 0) {
            const oldBarsInView = savedMinuteSpan / TIMEFRAME_MINUTES[simCurrentTimeframe];
            const futureMinutes = savedFutureOffset * TIMEFRAME_MINUTES[simCurrentTimeframe];
            const newFutureOffset = Math.round(futureMinutes / newTargetMinutes);
            const maxFutureSpace = Math.max(newBarsInView, 50);
            const maxEnd = simVisibleBars.length + maxFutureSpace;
            simViewportEnd = Math.min(simVisibleBars.length + newFutureOffset, maxEnd);
            simViewportStart = Math.max(0, simViewportEnd - newBarsInView);
        }
    } else {
        simViewportStart = 0;
        simViewportEnd = simVisibleBars.length;
    }
    
    renderCandlestickChart();
    updateNavigationButtons();
    updateOHLCDisplay();
}

function rebuildBarsForCurrentTimeframe() {
    const targetMinutes = TIMEFRAME_MINUTES[simCurrentTimeframe];
    
    simAllBars = simTimeframeData[simCurrentTimeframe] || [];
    
    simVisibleBars = aggregateBarsUpToMinute(simMinuteBarsCache, targetMinutes, simCurrentMinuteIndex);
    
    const tradingStartTs = new Date(simChartDates.tradingStart).getTime();
    simTradingStartIndex = simAllBars.findIndex(bar => bar.timestamp >= tradingStartTs);
    if (simTradingStartIndex === -1) simTradingStartIndex = 0;
    
    simCurrentBarIndex = simVisibleBars.length;
}

function switchTimeframe(timeframe) {
    if (!simTimeframeData[timeframe] || simTimeframeData[timeframe].length === 0) {
        console.log(`No data available for ${timeframe} yet`);
        return;
    }
    
    if (simVisibleBars.length > 0) {
        simLastBarTimestamp = simVisibleBars[simVisibleBars.length - 1].timestamp;
    }
    simLastZoomBarsInView = simViewportEnd - simViewportStart;
    
    simCurrentTimeframe = timeframe;
    updateTimeframeButtons();
    switchToTimeframeData(timeframe, null, true);
}

function updateTimeframeButtons() {
    document.querySelectorAll('.timeframe-btn').forEach(btn => {
        const tf = btn.dataset.timeframe;
        const dataExists = simTimeframeData.hasOwnProperty(tf);
        const hasData = dataExists && simTimeframeData[tf] && simTimeframeData[tf].length > 0;
        const isLoading = !dataExists && simIsLoadingTimeframes;
        const isActive = tf === simCurrentTimeframe;
        
        btn.classList.remove('active', 'btn-outline-secondary', 'btn-secondary');
        
        if (isActive) {
            btn.classList.add('active', 'btn-secondary');
        } else {
            btn.classList.add('btn-outline-secondary');
        }
        
        btn.disabled = !hasData;
        
        if (isLoading) {
            btn.style.opacity = '0.5';
            btn.title = 'Loading...';
        } else if (dataExists && !hasData) {
            btn.style.opacity = '0.3';
            btn.title = 'No data available';
        } else if (hasData) {
            btn.style.opacity = '1';
            btn.title = `${simTimeframeData[tf].length} bars`;
        } else {
            btn.style.opacity = '0.5';
            btn.title = 'Pending';
        }
    });
}

function updateSymbolDisplay() {
    const symbolDisplay = document.getElementById('simChartSymbolDisplay');
    if (symbolDisplay) {
        symbolDisplay.textContent = simCurrentSymbol;
    }
    
    if (simVisibleBars.length > 0) {
        const lastBar = simVisibleBars[simVisibleBars.length - 1];
        const firstBar = simVisibleBars[0];
        const priceChange = lastBar.close - firstBar.open;
        const priceChangePercent = ((lastBar.close - firstBar.open) / firstBar.open * 100);
        
        const priceDisplay = document.getElementById('simChartPriceDisplay');
        const changeDisplay = document.getElementById('simChartChangeDisplay');
        
        if (priceDisplay) {
            priceDisplay.textContent = `$${lastBar.close.toFixed(2)}`;
        }
        
        if (changeDisplay) {
            const isPositive = priceChange >= 0;
            changeDisplay.innerHTML = `<span style="color: ${isPositive ? '#26a69a' : '#ef5350'};">${isPositive ? '+' : ''}${priceChange.toFixed(2)} (${isPositive ? '+' : ''}${priceChangePercent.toFixed(2)}%)</span>`;
        }
    }
}

function updateOHLCDisplay() {
    if (simVisibleBars.length === 0) return;
    
    const lastBar = simVisibleBars[simVisibleBars.length - 1];
    
    document.getElementById('simOHLC_O').textContent = lastBar.open.toFixed(2);
    document.getElementById('simOHLC_H').textContent = lastBar.high.toFixed(2);
    document.getElementById('simOHLC_L').textContent = lastBar.low.toFixed(2);
    document.getElementById('simOHLC_C').textContent = lastBar.close.toFixed(2);
    document.getElementById('simOHLC_V').textContent = lastBar.volume ? formatVolume(lastBar.volume) : '-';
}

function formatVolume(vol) {
    if (vol >= 1000000) return (vol / 1000000).toFixed(2) + 'M';
    if (vol >= 1000) return (vol / 1000).toFixed(2) + 'K';
    return vol.toString();
}

function renderCandlestickChart() {
    const canvas = document.getElementById('simCandlestickChart');
    const ctx = canvas.getContext('2d');
    
    if (simChart) {
        simChart.destroy();
        simChart = null;
    }
    
    drawCandlesticks(ctx, canvas);
}

function drawCandlesticks(ctx, canvas) {
    if (simVisibleBars.length === 0) return;
    
    const container = document.getElementById('simChartContainer');
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = container.clientWidth;
    const displayHeight = container.clientHeight;
    
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';
    
    ctx.scale(dpr, dpr);
    
    ctx.clearRect(0, 0, displayWidth, displayHeight);
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, displayWidth, displayHeight);
    
    const padding = { top: 20, right: 70, bottom: 55, left: 50 };
    const chartWidth = displayWidth - padding.left - padding.right;
    const chartHeight = displayHeight - padding.top - padding.bottom;
    
    const viewStart = Math.max(0, Math.floor(simViewportStart));
    const viewEnd = Math.min(simVisibleBars.length, Math.ceil(simViewportEnd));
    const viewportBars = simVisibleBars.slice(viewStart, viewEnd);
    
    const totalViewportBars = Math.ceil(simViewportEnd) - Math.floor(simViewportStart);
    const futureBarCount = Math.max(0, Math.ceil(simViewportEnd) - simVisibleBars.length);
    
    if (viewportBars.length === 0 && futureBarCount === 0) return;
    
    const allHighs = viewportBars.map(b => b.high);
    const allLows = viewportBars.map(b => b.low);
    const baseMinPrice = viewportBars.length > 0 ? Math.min(...allLows) * 0.999 : 0;
    const baseMaxPrice = viewportBars.length > 0 ? Math.max(...allHighs) * 1.001 : 100;
    const basePriceRange = baseMaxPrice - baseMinPrice;
    
    const midPrice = (baseMaxPrice + baseMinPrice) / 2;
    const scaledRange = basePriceRange * simVerticalScale;
    const minPrice = midPrice - scaledRange / 2;
    const maxPrice = midPrice + scaledRange / 2;
    const priceRange = maxPrice - minPrice;
    
    const barsForSpacing = Math.max(totalViewportBars, 1);
    const barWidth = Math.max(2, Math.min(20, (chartWidth / barsForSpacing) * 0.7));
    const barSpacing = chartWidth / barsForSpacing;
    
    const dataStartOffset = Math.max(0, viewStart - Math.floor(simViewportStart)) * barSpacing;
    
    const gridColor = '#eef1f5';
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    const gridLines = 8;
    for (let i = 0; i <= gridLines; i++) {
        const y = padding.top + (chartHeight * i / gridLines);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(displayWidth - padding.right, y);
        ctx.stroke();
        
        const price = maxPrice - (priceRange * i / gridLines);
        ctx.fillStyle = '#787b86';
        ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(price.toFixed(2), displayWidth - padding.right + 5, y + 4);
    }
    
    const barsBeforeData = Math.max(0, viewStart - Math.floor(simViewportStart));
    const verticalGridInterval = Math.max(1, Math.floor(totalViewportBars / 10));
    ctx.strokeStyle = gridColor;
    
    for (let slot = 0; slot < totalViewportBars; slot++) {
        if (slot % verticalGridInterval === 0) {
            const x = padding.left + (slot * barSpacing) + (barSpacing / 2);
            ctx.beginPath();
            ctx.moveTo(x, padding.top);
            ctx.lineTo(x, padding.top + chartHeight);
            ctx.stroke();
        }
    }
    
    ctx.save();
    ctx.beginPath();
    ctx.rect(padding.left, padding.top, chartWidth, chartHeight);
    ctx.clip();
    
    viewportBars.forEach((bar, i) => {
        const x = padding.left + ((barsBeforeData + i) * barSpacing) + (barSpacing / 2);
        
        const yHigh = padding.top + ((maxPrice - bar.high) / priceRange) * chartHeight;
        const yLow = padding.top + ((maxPrice - bar.low) / priceRange) * chartHeight;
        const yOpen = padding.top + ((maxPrice - bar.open) / priceRange) * chartHeight;
        const yClose = padding.top + ((maxPrice - bar.close) / priceRange) * chartHeight;
        
        const isGreen = bar.close >= bar.open;
        const candleColor = isGreen ? '#26a69a' : '#ef5350';
        
        ctx.strokeStyle = candleColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, yHigh);
        ctx.lineTo(x, yLow);
        ctx.stroke();
        
        const bodyTop = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));
        
        ctx.fillStyle = candleColor;
        ctx.fillRect(x - barWidth/2, bodyTop, barWidth, bodyHeight);
    });
    
    ctx.restore();
    
    const tickInterval = Math.max(1, Math.floor(totalViewportBars / 6));
    ctx.fillStyle = '#787b86';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.save();
    
    const drawnLabelPositions = [];
    const minLabelSpacing = 60;
    
    viewportBars.forEach((bar, i) => {
        const slotIndex = barsBeforeData + i;
        if (slotIndex % tickInterval === 0) {
            const x = padding.left + (slotIndex * barSpacing) + (barSpacing / 2);
            
            const tooClose = drawnLabelPositions.some(pos => Math.abs(pos - x) < minLabelSpacing);
            if (tooClose) return;
            
            drawnLabelPositions.push(x);
            const date = new Date(bar.timestamp);
            const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            ctx.fillText(label, x, displayHeight - padding.bottom + 15);
            
            const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
            ctx.fillText(time, x, displayHeight - padding.bottom + 28);
        }
    });
    ctx.restore();
    
    if (viewportBars.length > 0) {
        const lastBar = viewportBars[viewportBars.length - 1];
        const lastY = padding.top + ((maxPrice - lastBar.close) / priceRange) * chartHeight;
        const isGreen = lastBar.close >= lastBar.open;
        
        ctx.setLineDash([2, 2]);
        ctx.strokeStyle = isGreen ? '#26a69a' : '#ef5350';
        ctx.beginPath();
        ctx.moveTo(padding.left, lastY);
        ctx.lineTo(displayWidth - padding.right, lastY);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = isGreen ? '#26a69a' : '#ef5350';
        ctx.fillRect(displayWidth - padding.right, lastY - 9, 65, 18);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(lastBar.close.toFixed(2), displayWidth - padding.right + 5, lastY + 4);
    }
    
    ctx.save();
    ctx.beginPath();
    ctx.rect(padding.left, padding.top, chartWidth, chartHeight);
    ctx.clip();
    
    drawPositionOnChart(ctx, displayWidth, padding, chartHeight, minPrice, maxPrice, priceRange);
    drawOptionPositionsOnChart(ctx, displayWidth, padding, chartHeight, minPrice, maxPrice, priceRange);
    drawCrosshair(ctx, displayWidth, padding, chartHeight, minPrice, maxPrice, priceRange, viewportBars, barSpacing, barsBeforeData);
    
    ctx.restore();
    
    updateSymbolDisplay();
    if (!simHoveredBar) {
        updateOHLCDisplay();
    }
    updateTradingDisplay();
}

function drawCrosshair(ctx, displayWidth, padding, chartHeight, minPrice, maxPrice, priceRange, viewportBars, barSpacing, barsBeforeData) {
    if (simMouseX < 0 || simMouseY < 0) return;
    if (simMouseX < padding.left || simMouseX > displayWidth - padding.right) return;
    if (simMouseY < padding.top || simMouseY > padding.top + chartHeight) return;
    
    const container = document.getElementById('simChartContainer');
    const displayHeight = container.clientHeight;
    
    ctx.save();
    ctx.strokeStyle = '#9598a1';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    
    ctx.beginPath();
    ctx.moveTo(simMouseX, padding.top);
    ctx.lineTo(simMouseX, padding.top + chartHeight);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(padding.left, simMouseY);
    ctx.lineTo(displayWidth - padding.right, simMouseY);
    ctx.stroke();
    
    ctx.setLineDash([]);
    ctx.restore();
    
    const mousePrice = maxPrice - ((simMouseY - padding.top) / chartHeight) * priceRange;
    ctx.fillStyle = '#363a45';
    ctx.fillRect(displayWidth - padding.right, simMouseY - 9, 65, 18);
    ctx.fillStyle = '#ffffff';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(mousePrice.toFixed(2), displayWidth - padding.right + 5, simMouseY + 4);
    
    const offset = barsBeforeData || 0;
    if (viewportBars.length > 0) {
        const relativeX = simMouseX - padding.left;
        const barIndexFloat = relativeX / barSpacing - offset;
        const barIndex = Math.floor(barIndexFloat);
        
        if (barIndex >= 0 && barIndex < viewportBars.length) {
            const bar = viewportBars[barIndex];
            const date = new Date(bar.timestamp);
            const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const timeLabel = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
            const fullLabel = `${dateLabel} ${timeLabel}`;
            
            ctx.fillStyle = '#363a45';
            ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
            const labelWidth = ctx.measureText(fullLabel).width + 10;
            ctx.fillRect(simMouseX - labelWidth/2, displayHeight - padding.bottom + 5, labelWidth, 18);
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText(fullLabel, simMouseX, displayHeight - padding.bottom + 17);
        }
    }
}

function showNextBar() {
    stopAutoplay();
    const skipMinutes = parseInt(document.getElementById('simSkipBars').value) || 1;
    
    if (simCurrentMinuteIndex < simMinuteBarsCache.length) {
        const oldBarsInView = simViewportEnd - simViewportStart;
        const futureOffset = Math.max(0, simViewportEnd - simVisibleBars.length);
        
        let savedRightEdgeTimestamp = null;
        if (simVisibleBars.length > 0) {
            const rightBarIndex = Math.min(Math.ceil(simViewportEnd) - 1, simVisibleBars.length - 1);
            if (rightBarIndex >= 0) {
                const rightBar = simVisibleBars[rightBarIndex];
                savedRightEdgeTimestamp = rightBar.lastMinuteTimestamp || rightBar.timestamp;
            }
        }
        
        simCurrentMinuteIndex = Math.min(simMinuteBarsCache.length, simCurrentMinuteIndex + skipMinutes);
        
        rebuildBarsForCurrentTimeframe();
        
        if (savedRightEdgeTimestamp !== null) {
            let rightBarIndex = simVisibleBars.findIndex(bar => {
                const barEnd = bar.lastMinuteTimestamp || bar.timestamp;
                return bar.timestamp <= savedRightEdgeTimestamp && barEnd >= savedRightEdgeTimestamp;
            });
            if (rightBarIndex === -1) {
                rightBarIndex = simVisibleBars.length - 1;
            }
            simViewportEnd = rightBarIndex + 1 + futureOffset;
            simViewportStart = Math.max(0, simViewportEnd - oldBarsInView);
        } else {
            simViewportEnd = simVisibleBars.length;
            simViewportStart = Math.max(0, simViewportEnd - oldBarsInView);
        }
        
        updateUnrealizedPnl();
        updateOptionsPnlDisplay();
        checkOptionTpSlThresholds();
        
        redrawChart();
        updateNavigationButtons();
    }
}

function toggleAutoplay() {
    if (simIsPlaying) {
        stopAutoplay();
    } else {
        startAutoplay();
    }
}

function startAutoplay() {
    if (simIsPlaying) return;
    
    if (simCurrentMinuteIndex >= simMinuteBarsCache.length) {
        return;
    }
    
    simIsPlaying = true;
    const icon = document.getElementById('simPlayIcon');
    const btn = document.getElementById('simPlayPauseBtn');
    icon.className = 'fas fa-pause';
    btn.style.color = '#ef5350';
    
    const speed = parseInt(document.getElementById('simAutoplaySpeed').value) || 5000;
    
    simAutoplayTimer = setInterval(() => {
        autoplayAdvance();
    }, speed);
}

function stopAutoplay() {
    simIsPlaying = false;
    if (simAutoplayTimer) {
        clearInterval(simAutoplayTimer);
        simAutoplayTimer = null;
    }
    const icon = document.getElementById('simPlayIcon');
    const btn = document.getElementById('simPlayPauseBtn');
    icon.className = 'fas fa-play';
    btn.style.color = '#26a69a';
}

function autoplayAdvance() {
    const interval = parseInt(document.getElementById('simAutoplayInterval').value) || 1;
    
    if (simCurrentMinuteIndex >= simMinuteBarsCache.length) {
        stopAutoplay();
        return;
    }
    
    const oldBarsInView = simViewportEnd - simViewportStart;
    const futureOffset = Math.max(0, simViewportEnd - simVisibleBars.length);
    
    let savedRightEdgeTimestamp = null;
    if (simVisibleBars.length > 0) {
        const rightBarIndex = Math.min(Math.ceil(simViewportEnd) - 1, simVisibleBars.length - 1);
        if (rightBarIndex >= 0) {
            const rightBar = simVisibleBars[rightBarIndex];
            savedRightEdgeTimestamp = rightBar.lastMinuteTimestamp || rightBar.timestamp;
        }
    }
    
    simCurrentMinuteIndex = Math.min(simMinuteBarsCache.length, simCurrentMinuteIndex + interval);
    
    rebuildBarsForCurrentTimeframe();
    
    if (savedRightEdgeTimestamp !== null) {
        let rightBarIndex = simVisibleBars.findIndex(bar => {
            const barEnd = bar.lastMinuteTimestamp || bar.timestamp;
            return bar.timestamp <= savedRightEdgeTimestamp && barEnd >= savedRightEdgeTimestamp;
        });
        if (rightBarIndex === -1) {
            rightBarIndex = simVisibleBars.length - 1;
        }
        simViewportEnd = rightBarIndex + 1 + futureOffset;
        simViewportStart = Math.max(0, simViewportEnd - oldBarsInView);
    } else {
        simViewportEnd = simVisibleBars.length;
        simViewportStart = Math.max(0, simViewportEnd - oldBarsInView);
    }
    
    updateUnrealizedPnl();
    updateOptionsPnlDisplay();
    checkOptionTpSlThresholds();
    
    redrawChart();
    updateNavigationButtons();
    
    if (simCurrentMinuteIndex >= simMinuteBarsCache.length) {
        stopAutoplay();
    }
}

function showPreviousBar() {
    stopAutoplay();
    const skipMinutes = parseInt(document.getElementById('simSkipBars').value) || 1;
    
    if (simCurrentMinuteIndex > simTradingStartMinuteIndex) {
        const oldBarsInView = simViewportEnd - simViewportStart;
        const futureOffset = Math.max(0, simViewportEnd - simVisibleBars.length);
        
        let savedRightEdgeTimestamp = null;
        if (simVisibleBars.length > 0) {
            const rightBarIndex = Math.min(Math.ceil(simViewportEnd) - 1, simVisibleBars.length - 1);
            if (rightBarIndex >= 0) {
                const rightBar = simVisibleBars[rightBarIndex];
                savedRightEdgeTimestamp = rightBar.lastMinuteTimestamp || rightBar.timestamp;
            }
        }
        
        simCurrentMinuteIndex = Math.max(simTradingStartMinuteIndex, simCurrentMinuteIndex - skipMinutes);
        
        rebuildBarsForCurrentTimeframe();
        
        if (savedRightEdgeTimestamp !== null) {
            let rightBarIndex = simVisibleBars.findIndex(bar => {
                const barEnd = bar.lastMinuteTimestamp || bar.timestamp;
                return bar.timestamp <= savedRightEdgeTimestamp && barEnd >= savedRightEdgeTimestamp;
            });
            if (rightBarIndex === -1) {
                rightBarIndex = simVisibleBars.length - 1;
            }
            simViewportEnd = rightBarIndex + 1 + futureOffset;
            simViewportStart = Math.max(0, simViewportEnd - oldBarsInView);
        } else {
            simViewportEnd = simVisibleBars.length;
            simViewportStart = Math.max(0, simViewportEnd - oldBarsInView);
        }
        
        updateUnrealizedPnl();
        updateOptionsPnlDisplay();
        checkOptionTpSlThresholds();
        
        redrawChart();
        updateNavigationButtons();
    }
}

function redrawChart() {
    drawCandlesticks(
        document.getElementById('simCandlestickChart').getContext('2d'),
        document.getElementById('simCandlestickChart')
    );
}

function updateNavigationButtons() {
    const prevBtn = document.getElementById('simPrevBar');
    const nextBtn = document.getElementById('simNextBar');
    const barInfo = document.getElementById('simBarVisibilityInfo');
    const timeDisplay = document.getElementById('simCurrentTimeDisplay');
    const dateField = document.getElementById('simGotoDate');
    
    prevBtn.disabled = simCurrentMinuteIndex <= simTradingStartMinuteIndex;
    nextBtn.disabled = simCurrentMinuteIndex >= simMinuteBarsCache.length;
    
    let currentDate = null;
    let timeStr = '';
    
    if (simCurrentMinuteIndex > 0 && simMinuteBarsCache.length > 0) {
        const currentMinuteBar = simMinuteBarsCache[simCurrentMinuteIndex - 1];
        if (currentMinuteBar) {
            currentDate = new Date(currentMinuteBar.timestamp);
            const hours = currentDate.getHours().toString().padStart(2, '0');
            const mins = currentDate.getMinutes().toString().padStart(2, '0');
            timeStr = `${hours}:${mins}`;
        }
    }
    
    if (timeDisplay && timeStr) {
        timeDisplay.textContent = timeStr;
    }
    
    if (dateField && currentDate && !dateField.matches(':focus')) {
        const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
        const day = currentDate.getDate().toString().padStart(2, '0');
        const year = currentDate.getFullYear();
        dateField.value = `${month}/${day}/${year}`;
    }
    
    if (barInfo) {
        const lastBar = simVisibleBars[simVisibleBars.length - 1];
        const partialIndicator = lastBar && lastBar.isPartial ? '*' : '';
        const hiddenBars = simAllBars.length - simCurrentBarIndex;
        barInfo.textContent = `${simVisibleBars.length}${partialIndicator} bars | +${hiddenBars}`;
    }
}

function resetSimulatedChart() {
    stopAutoplay();
    simAllBars = [];
    simVisibleBars = [];
    simCurrentBarIndex = 0;
    simTradingStartIndex = 0;
    simCurrentMinuteIndex = 0;
    simTradingStartMinuteIndex = 0;
    simMinuteBarsCache = [];
    simTimeframeData = {};
    simCurrentTimeframe = '1m';
    simIsLoadingTimeframes = false;
    simVerticalScale = 1.0;
    
    simInitialBalance = parseFloat(document.getElementById('simAccountBalance').value) || 100000;
    simRealizedPnl = 0;
    simOpenPosition = null;
    simClosedTrades = [];
    
    simOptionsRealizedPnl = 0;
    simOpenOptionPositions = [];
    simClosedOptionTrades = [];
    simOptionBarsCache = {};
    
    if (simChart) {
        simChart.destroy();
        simChart = null;
    }
    
    document.getElementById('chartNavigation').style.display = 'none';
    document.getElementById('gotoDateGroup').style.display = 'none';
    document.getElementById('simTimeframeSelector').style.display = 'none';
    document.getElementById('simOHLCDisplay').style.display = 'none';
    document.getElementById('simChartPlaceholder').style.display = 'block';
    document.getElementById('simCandlestickChart').style.display = 'none';
    document.getElementById('simChartSymbolDisplay').textContent = '';
    document.getElementById('simChartPriceDisplay').textContent = '';
    document.getElementById('simChartChangeDisplay').textContent = '';
    document.getElementById('simTradingControls').style.display = 'none';
    
    showLoader(false);
    updateLoadingStatus('');
    updateTradingDisplay();
    
    const canvas = document.getElementById('simCandlestickChart');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

window.addEventListener('resize', () => {
    if (simVisibleBars.length > 0) {
        redrawChart();
    }
});

function handleChartMouseDown(e) {
    if (simVisibleBars.length === 0) return;
    
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const padding = { right: 70 };
    const displayWidth = rect.width;
    
    if (mouseX > displayWidth - padding.right) {
        simIsYAxisDragging = true;
        simYAxisDragStartY = e.clientY;
        simYAxisDragStartScale = simVerticalScale;
        canvas.style.cursor = 'ns-resize';
    } else {
        simIsDragging = true;
        simDragStartX = e.clientX;
        simDragStartViewport = simViewportStart;
        canvas.style.cursor = 'grabbing';
    }
}

function handleChartMouseMove(e) {
    const canvas = document.getElementById('simCandlestickChart');
    const rect = canvas.getBoundingClientRect();
    simMouseX = e.clientX - rect.left;
    simMouseY = e.clientY - rect.top;
    
    updateHoveredBar();
    
    if (simIsYAxisDragging) {
        const deltaY = e.clientY - simYAxisDragStartY;
        const scaleFactor = Math.pow(1.01, deltaY);
        simVerticalScale = Math.max(0.1, Math.min(10, simYAxisDragStartScale * scaleFactor));
        redrawChart();
        return;
    }
    
    if (!simIsYAxisDragging && !simIsDragging) {
        const padding = { right: 70 };
        const displayWidth = rect.width;
        if (simMouseX > displayWidth - padding.right) {
            canvas.style.cursor = 'ns-resize';
        } else {
            canvas.style.cursor = 'crosshair';
        }
    }
    
    if (simIsDragging && simVisibleBars.length > 0) {
        const container = document.getElementById('simChartContainer');
        const chartWidth = container.clientWidth - 80;
        
        const deltaX = e.clientX - simDragStartX;
        const barsInView = simViewportEnd - simViewportStart;
        const pixelsPerBar = chartWidth / barsInView;
        const barsDelta = -deltaX / pixelsPerBar;
        
        let newStart = simDragStartViewport + barsDelta;
        let newEnd = newStart + barsInView;
        
        if (newStart < 0) {
            newStart = 0;
            newEnd = barsInView;
        }
        
        const maxFutureSpace = Math.max(barsInView, 50);
        const maxEnd = simVisibleBars.length + maxFutureSpace;
        if (newEnd > maxEnd) {
            newEnd = maxEnd;
            newStart = Math.max(0, newEnd - barsInView);
        }
        
        simViewportStart = newStart;
        simViewportEnd = newEnd;
    }
    
    redrawChart();
}

function updateHoveredBar() {
    if (simVisibleBars.length === 0) {
        simHoveredBar = null;
        return;
    }
    
    const container = document.getElementById('simChartContainer');
    const padding = { top: 20, right: 70, bottom: 55, left: 50 };
    const chartWidth = container.clientWidth - padding.left - padding.right;
    
    const viewStart = Math.max(0, Math.floor(simViewportStart));
    const viewEnd = Math.min(simVisibleBars.length, Math.ceil(simViewportEnd));
    const viewportBars = simVisibleBars.slice(viewStart, viewEnd);
    
    if (viewportBars.length === 0) {
        simHoveredBar = null;
        return;
    }
    
    const totalViewportBars = Math.ceil(simViewportEnd) - Math.floor(simViewportStart);
    const barSpacing = chartWidth / Math.max(totalViewportBars, 1);
    const barsBeforeData = Math.max(0, viewStart - Math.floor(simViewportStart));
    const relativeX = simMouseX - padding.left;
    
    if (relativeX < 0 || relativeX > chartWidth) {
        simHoveredBar = null;
        return;
    }
    
    const barIndex = Math.floor(relativeX / barSpacing) - barsBeforeData;
    if (barIndex >= 0 && barIndex < viewportBars.length) {
        simHoveredBar = viewportBars[barIndex];
        updateOHLCDisplayForBar(simHoveredBar);
    } else {
        simHoveredBar = null;
    }
}

function updateOHLCDisplayForBar(bar) {
    if (!bar) return;
    
    document.getElementById('simOHLC_O').textContent = bar.open.toFixed(2);
    document.getElementById('simOHLC_H').textContent = bar.high.toFixed(2);
    document.getElementById('simOHLC_L').textContent = bar.low.toFixed(2);
    document.getElementById('simOHLC_C').textContent = bar.close.toFixed(2);
    document.getElementById('simOHLC_V').textContent = bar.volume ? formatVolume(bar.volume) : '-';
}

function handleChartMouseUp(e) {
    const canvas = document.getElementById('simCandlestickChart');
    if (simIsDragging) {
        simIsDragging = false;
        canvas.style.cursor = 'crosshair';
    }
    if (simIsYAxisDragging) {
        simIsYAxisDragging = false;
        canvas.style.cursor = 'crosshair';
    }
}

function handleChartMouseLeave(e) {
    simMouseX = -1;
    simMouseY = -1;
    simHoveredBar = null;
    simIsDragging = false;
    simIsYAxisDragging = false;
    const canvas = document.getElementById('simCandlestickChart');
    canvas.style.cursor = 'crosshair';
    updateOHLCDisplay();
    redrawChart();
}

function handleChartDoubleClick(e) {
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const padding = { right: 70 };
    const displayWidth = rect.width;
    
    if (mouseX > displayWidth - padding.right) {
        simVerticalScale = 1.0;
        redrawChart();
    }
}

function handleChartWheel(e) {
    if (simVisibleBars.length === 0) return;
    
    if (!e.ctrlKey && !e.metaKey) {
        return;
    }
    
    e.preventDefault();
    
    const canvas = document.getElementById('simCandlestickChart');
    const container = document.getElementById('simChartContainer');
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    
    const padding = { left: 50, right: 70 };
    const chartWidth = container.clientWidth - padding.left - padding.right;
    
    const mouseRatio = Math.max(0, Math.min(1, (mouseX - padding.left) / chartWidth));
    
    const currentBarsInView = simViewportEnd - simViewportStart;
    const zoomFactor = e.deltaY > 0 ? 1.15 : 0.85;
    
    let newBarsInView = Math.round(currentBarsInView * zoomFactor);
    newBarsInView = Math.max(simMinBarsVisible, Math.min(simMaxBarsVisible, newBarsInView));
    
    const wasInFuture = simViewportEnd > simVisibleBars.length;
    
    const mouseBarPosition = simViewportStart + (currentBarsInView * mouseRatio);
    let newStart = mouseBarPosition - (newBarsInView * mouseRatio);
    let newEnd = newStart + newBarsInView;
    
    if (newStart < 0) {
        newStart = 0;
        newEnd = newBarsInView;
    }
    
    if (!wasInFuture && newEnd > simVisibleBars.length) {
        newEnd = simVisibleBars.length;
        newStart = Math.max(0, newEnd - newBarsInView);
    }
    
    simViewportStart = newStart;
    simViewportEnd = newEnd;
    
    redrawChart();
}

function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function handleChartTouchStart(e) {
    if (simVisibleBars.length === 0) return;
    
    e.preventDefault();
    
    if (e.touches.length === 1) {
        simTouchStartX = e.touches[0].clientX;
        simTouchStartViewport = simViewportStart;
        simPinchStartDistance = 0;
    } else if (e.touches.length === 2) {
        simPinchStartDistance = getTouchDistance(e.touches);
        simPinchStartBarsInView = simViewportEnd - simViewportStart;
    }
}

function handleChartTouchMove(e) {
    if (simVisibleBars.length === 0) return;
    
    e.preventDefault();
    
    if (e.touches.length === 2 && simPinchStartDistance > 0) {
        const currentDistance = getTouchDistance(e.touches);
        const scale = simPinchStartDistance / currentDistance;
        
        let newBarsInView = Math.round(simPinchStartBarsInView * scale);
        newBarsInView = Math.max(simMinBarsVisible, Math.min(simMaxBarsVisible, newBarsInView));
        
        const center = (simViewportStart + simViewportEnd) / 2;
        let newStart = center - newBarsInView / 2;
        let newEnd = center + newBarsInView / 2;
        
        if (newStart < 0) {
            newStart = 0;
            newEnd = newBarsInView;
        }
        if (newEnd > simVisibleBars.length) {
            newEnd = simVisibleBars.length;
            newStart = Math.max(0, newEnd - newBarsInView);
        }
        
        simViewportStart = newStart;
        simViewportEnd = newEnd;
        redrawChart();
        return;
    }
    
    if (e.touches.length !== 1) return;
    
    const container = document.getElementById('simChartContainer');
    const chartWidth = container.clientWidth - 80;
    
    const deltaX = e.touches[0].clientX - simTouchStartX;
    const barsInView = simViewportEnd - simViewportStart;
    const pixelsPerBar = chartWidth / barsInView;
    const barsDelta = -deltaX / pixelsPerBar;
    
    let newStart = simTouchStartViewport + barsDelta;
    let newEnd = newStart + barsInView;
    
    if (newStart < 0) {
        newStart = 0;
        newEnd = barsInView;
    }
    if (newEnd > simVisibleBars.length) {
        newEnd = simVisibleBars.length;
        newStart = Math.max(0, newEnd - barsInView);
    }
    
    simViewportStart = newStart;
    simViewportEnd = newEnd;
    
    redrawChart();
}

function handleChartTouchEnd(e) {
}

function executeTrade(side) {
    if (simVisibleBars.length === 0) {
        alert('Load chart data first');
        return;
    }
    
    const quantity = parseInt(document.getElementById('simQuantity').value) || 1;
    const currentBar = simVisibleBars[simVisibleBars.length - 1];
    const currentPrice = currentBar.vwap || currentBar.close;
    
    if (!simOpenPosition) {
        simOpenPosition = {
            side: side,
            quantity: quantity,
            entryPrice: currentPrice,
            entryBarIndex: simCurrentBarIndex,
            entryTimestamp: currentBar.timestamp
        };
    } else {
        const isSameSide = simOpenPosition.side === side;
        
        if (isSameSide) {
            const totalQty = simOpenPosition.quantity + quantity;
            const avgPrice = (simOpenPosition.entryPrice * simOpenPosition.quantity + currentPrice * quantity) / totalQty;
            simOpenPosition.quantity = totalQty;
            simOpenPosition.entryPrice = avgPrice;
        } else {
            if (quantity < simOpenPosition.quantity) {
                const closedQty = quantity;
                const pnlPerShare = simOpenPosition.side === 'buy' 
                    ? (currentPrice - simOpenPosition.entryPrice)
                    : (simOpenPosition.entryPrice - currentPrice);
                const closePnl = pnlPerShare * closedQty;
                simRealizedPnl += closePnl;
                simClosedTrades.push({
                    side: simOpenPosition.side,
                    quantity: closedQty,
                    entryPrice: simOpenPosition.entryPrice,
                    exitPrice: currentPrice,
                    exitBarIndex: simCurrentBarIndex,
                    pnl: closePnl
                });
                simOpenPosition.quantity -= closedQty;
            } else if (quantity === simOpenPosition.quantity) {
                const closePnl = calculatePositionPnl(simOpenPosition, currentPrice);
                simRealizedPnl += closePnl;
                simClosedTrades.push({
                    ...simOpenPosition,
                    exitPrice: currentPrice,
                    exitBarIndex: simCurrentBarIndex,
                    pnl: closePnl
                });
                simOpenPosition = null;
            } else {
                const closePnl = calculatePositionPnl(simOpenPosition, currentPrice);
                simRealizedPnl += closePnl;
                simClosedTrades.push({
                    ...simOpenPosition,
                    exitPrice: currentPrice,
                    exitBarIndex: simCurrentBarIndex,
                    pnl: closePnl
                });
                const remainingQty = quantity - simOpenPosition.quantity;
                simOpenPosition = {
                    side: side,
                    quantity: remainingQty,
                    entryPrice: currentPrice,
                    entryBarIndex: simCurrentBarIndex,
                    entryTimestamp: currentBar.timestamp
                };
            }
        }
    }
    
    updateTradingDisplay();
    redrawChart();
}

function closePosition() {
    if (!simOpenPosition || simVisibleBars.length === 0) return;
    
    const currentBar = simVisibleBars[simVisibleBars.length - 1];
    const closePnl = calculatePositionPnl(simOpenPosition, currentBar.close);
    
    simRealizedPnl += closePnl;
    const closedPosition = {
        ...simOpenPosition,
        exitPrice: currentBar.close,
        exitBarIndex: simCurrentBarIndex,
        pnl: closePnl
    };
    simClosedTrades.push(closedPosition);
    
    showPositionClosedNotice(closedPosition);
    
    simOpenPosition = null;
    updateTradingDisplay();
    redrawChart();
}

function showPositionClosedNotice(position) {
    const existingNotice = document.getElementById('positionClosedNotice');
    if (existingNotice) existingNotice.remove();
    
    const isProfit = position.pnl >= 0;
    const pnlText = `${isProfit ? '+' : ''}$${position.pnl.toFixed(2)}`;
    const isBuy = position.side === 'buy';
    
    const notice = document.createElement('div');
    notice.id = 'positionClosedNotice';
    notice.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        z-index: 9999;
        background: ${isProfit ? '#26a69a' : '#ef5350'};
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        animation: slideIn 0.3s ease-out;
    `;
    
    notice.innerHTML = `
        <div style="font-weight: bold; font-size: 14px; margin-bottom: 5px;">Position Closed</div>
        <div style="font-size: 12px;">${isBuy ? 'LONG' : 'SHORT'} ${position.quantity} @ $${position.entryPrice.toFixed(2)}</div>
        <div style="font-size: 12px;">Exit: $${position.exitPrice.toFixed(2)}</div>
        <div style="font-weight: bold; font-size: 14px; margin-top: 5px;">PnL: ${pnlText}</div>
    `;
    
    document.body.appendChild(notice);
    
    setTimeout(() => {
        if (notice.parentNode) {
            notice.style.opacity = '0';
            notice.style.transition = 'opacity 0.3s ease-out';
            setTimeout(() => notice.remove(), 300);
        }
    }, 4000);
}

function calculatePositionPnl(position, currentPrice) {
    if (!position) return 0;
    
    const priceDiff = currentPrice - position.entryPrice;
    const multiplier = position.side === 'buy' ? 1 : -1;
    
    return priceDiff * position.quantity * multiplier;
}

function updateUnrealizedPnl() {
    if (simVisibleBars.length === 0) return;
    
    const currentBar = simVisibleBars[simVisibleBars.length - 1];
    
    if (simOpenPosition) {
        const unrealizedPnl = calculatePositionPnl(simOpenPosition, currentBar.close);
        
        const unrealizedEl = document.getElementById('simUnrealizedPnl');
        if (unrealizedEl) {
            const isPositive = unrealizedPnl >= 0;
            unrealizedEl.textContent = `${isPositive ? '+' : ''}$${unrealizedPnl.toFixed(2)}`;
            unrealizedEl.style.color = isPositive ? '#26a69a' : '#ef5350';
        }
    }
    
    updateOptionsPnlDisplay();
}

function updateTradingDisplay() {
    const balanceEl = document.getElementById('simCurrentBalance');
    const realizedEl = document.getElementById('simRealizedPnl');
    const unrealizedEl = document.getElementById('simUnrealizedPnl');
    
    const currentBalance = simInitialBalance + simRealizedPnl;
    
    if (balanceEl) {
        balanceEl.textContent = `$${currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    
    if (realizedEl) {
        const isPositive = simRealizedPnl >= 0;
        realizedEl.textContent = `${isPositive ? '+' : ''}$${simRealizedPnl.toFixed(2)}`;
        realizedEl.style.color = isPositive ? '#26a69a' : '#ef5350';
    }
    
    if (unrealizedEl) {
        if (simOpenPosition && simVisibleBars.length > 0) {
            const currentBar = simVisibleBars[simVisibleBars.length - 1];
            const unrealizedPnl = calculatePositionPnl(simOpenPosition, currentBar.close);
            const isPositive = unrealizedPnl >= 0;
            unrealizedEl.textContent = `${isPositive ? '+' : ''}$${unrealizedPnl.toFixed(2)}`;
            unrealizedEl.style.color = isPositive ? '#26a69a' : '#ef5350';
        } else {
            unrealizedEl.textContent = '$0.00';
            unrealizedEl.style.color = '#b2b5be';
        }
    }
    
    updateOptionsPositionsCard();
}

function resetViewToCurrentCandle() {
    if (simVisibleBars.length === 0) return;
    
    const barsInView = simViewportEnd - simViewportStart;
    simViewportEnd = simVisibleBars.length;
    simViewportStart = Math.max(0, simViewportEnd - barsInView);
    
    redrawChart();
}

function gotoDateTime() {
    const gotoDateValue = document.getElementById('simGotoDate').value.trim();
    const gotoTimeValue = document.getElementById('simGotoTime').value.trim();
    
    let targetDateStr;
    let targetTime = '09:30';
    
    if (gotoDateValue) {
        const dateParts = gotoDateValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (!dateParts) {
            alert('Please enter date in MM/DD/YYYY format');
            return;
        }
        const month = dateParts[1].padStart(2, '0');
        const day = dateParts[2].padStart(2, '0');
        const year = dateParts[3];
        targetDateStr = `${year}-${month}-${day}`;
    } else if (simCurrentMinuteIndex > 0) {
        const currentBar = simMinuteBarsCache[simCurrentMinuteIndex - 1];
        const etDateStr = new Date(currentBar.timestamp).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        targetDateStr = etDateStr;
    } else {
        alert('Please enter a date');
        return;
    }
    
    if (gotoTimeValue) {
        const timeParts = gotoTimeValue.match(/^(\d{1,2}):(\d{2})$/);
        if (!timeParts) {
            alert('Please enter time in HH:MM format');
            return;
        }
        targetTime = `${timeParts[1].padStart(2, '0')}:${timeParts[2]}`;
    }
    
    const targetTimestamp = parseETDateTime(targetDateStr, targetTime);
    
    let targetMinuteIndex = -1;
    for (let i = simTradingStartMinuteIndex; i < simMinuteBarsCache.length; i++) {
        if (simMinuteBarsCache[i].timestamp >= targetTimestamp) {
            targetMinuteIndex = i + 1;
            break;
        }
    }
    
    if (targetMinuteIndex === -1) {
        if (simMinuteBarsCache.length > 0 && simMinuteBarsCache[simMinuteBarsCache.length - 1].timestamp < targetTimestamp) {
            targetMinuteIndex = simMinuteBarsCache.length;
        } else {
            alert('Date/time not found in the available data range');
            return;
        }
    }
    
    simCurrentMinuteIndex = targetMinuteIndex;
    rebuildBarsForCurrentTimeframe();
    
    const barsInView = Math.min(simViewportEnd - simViewportStart, simVisibleBars.length);
    simViewportEnd = simVisibleBars.length;
    simViewportStart = Math.max(0, simViewportEnd - barsInView);
    
    updateUnrealizedPnl();
    updateOptionsPnlDisplay();
    checkOptionTpSlThresholds();
    redrawChart();
    updateNavigationButtons();
}

function handleChartClick(e) {
    if (simVisibleBars.length === 0) return;
    
    const canvas = document.getElementById('simCandlestickChart');
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    if (simOpenPosition) {
        const closeButtonInfo = getPositionCloseButtonBounds(canvas);
        if (closeButtonInfo) {
            const { x, y, width, height } = closeButtonInfo;
            if (clickX >= x && clickX <= x + width && clickY >= y && clickY <= y + height) {
                closePosition();
                return;
            }
        }
    }
    
    for (const pos of simOpenOptionPositions) {
        if (pos._closeButtonBounds) {
            const { x, y, width, height } = pos._closeButtonBounds;
            if (clickX >= x && clickX <= x + width && clickY >= y && clickY <= y + height) {
                closeOptionPosition(pos.id);
                return;
            }
        }
        
        if (pos._boxBounds) {
            const { x, y, width, height } = pos._boxBounds;
            if (clickX >= x && clickX <= x + width && clickY >= y && clickY <= y + height) {
                showPartialCloseModal(pos);
                return;
            }
        }
    }
}

function showPartialCloseModal(pos) {
    const existingModal = document.getElementById('partialCloseModal');
    if (existingModal) existingModal.remove();
    
    const currentMinuteBar = simMinuteBarsCache[simCurrentMinuteIndex - 1];
    const currentTimestamp = currentMinuteBar ? currentMinuteBar.timestamp : Date.now();
    const unrealizedPnl = calculateOptionPositionPnl(pos, currentTimestamp);
    
    const modal = document.createElement('div');
    modal.id = 'partialCloseModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center;';
    
    modal.innerHTML = `
        <div style="background: white; padding: 20px; border-radius: 8px; max-width: 350px; width: 90%;">
            <h5 style="margin: 0 0 15px 0; color: #333;">${pos.strategy}</h5>
            <div style="margin-bottom: 10px; color: #666; font-size: 14px;">
                <div>Open Contracts: <strong>${pos.remainingQuantity}</strong></div>
                <div>Current PnL: <strong style="color: ${unrealizedPnl >= 0 ? '#26a69a' : '#ef5350'}">${unrealizedPnl >= 0 ? '+' : ''}$${unrealizedPnl.toFixed(2)}</strong></div>
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; color: #333; font-size: 14px;">Contracts to Close:</label>
                <input type="number" id="partialCloseQty" value="${pos.remainingQuantity}" min="1" max="${pos.remainingQuantity}" 
                    style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
            </div>
            <div style="display: flex; gap: 10px;">
                <button id="partialCloseConfirm" style="flex: 1; padding: 10px; background: #ef5350; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">
                    Close Position
                </button>
                <button id="partialCloseCancel" style="flex: 1; padding: 10px; background: #e0e0e0; color: #333; border: none; border-radius: 4px; cursor: pointer;">
                    Cancel
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    document.getElementById('partialCloseConfirm').onclick = () => {
        const qty = parseInt(document.getElementById('partialCloseQty').value) || pos.remainingQuantity;
        const clampedQty = Math.max(1, Math.min(qty, pos.remainingQuantity));
        closeOptionPosition(pos.id, clampedQty);
        modal.remove();
    };
    
    document.getElementById('partialCloseCancel').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

function getPositionCloseButtonBounds(canvas) {
    if (!simOpenPosition || simVisibleBars.length === 0) return null;
    
    const container = document.getElementById('simChartContainer');
    const displayWidth = container.clientWidth;
    const padding = { top: 20, right: 70, bottom: 55, left: 50 };
    const chartHeight = container.clientHeight - padding.top - padding.bottom;
    
    const viewStart = Math.max(0, Math.floor(simViewportStart));
    const viewEnd = Math.min(simVisibleBars.length, Math.ceil(simViewportEnd));
    const viewportBars = simVisibleBars.slice(viewStart, viewEnd);
    
    if (viewportBars.length === 0) return null;
    
    const allHighs = viewportBars.map(b => b.high);
    const allLows = viewportBars.map(b => b.low);
    const baseMinPrice = Math.min(...allLows) * 0.999;
    const baseMaxPrice = Math.max(...allHighs) * 1.001;
    const basePriceRange = baseMaxPrice - baseMinPrice;
    
    const midPrice = (baseMaxPrice + baseMinPrice) / 2;
    const scaledRange = basePriceRange * simVerticalScale;
    const minPrice = midPrice - scaledRange / 2;
    const maxPrice = midPrice + scaledRange / 2;
    const priceRange = maxPrice - minPrice;
    
    const posY = padding.top + ((maxPrice - simOpenPosition.entryPrice) / priceRange) * chartHeight;
    
    const boxWidth = 120;
    const boxHeight = 40;
    const boxX = displayWidth - padding.right - boxWidth - 10;
    const boxY = posY - boxHeight / 2;
    
    return {
        x: boxX + boxWidth - 18,
        y: boxY + 2,
        width: 16,
        height: 16
    };
}

function drawPositionOnChart(ctx, displayWidth, padding, chartHeight, minPrice, maxPrice, priceRange) {
    if (!simOpenPosition) return;
    
    const posY = padding.top + ((maxPrice - simOpenPosition.entryPrice) / priceRange) * chartHeight;
    
    const isBuy = simOpenPosition.side === 'buy';
    const posColor = isBuy ? '#2962ff' : '#f23645';
    
    ctx.save();
    ctx.strokeStyle = posColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, posY);
    ctx.lineTo(displayWidth - padding.right, posY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    
    const currentBar = simVisibleBars[simVisibleBars.length - 1];
    const unrealizedPnl = calculatePositionPnl(simOpenPosition, currentBar.close);
    const isProfit = unrealizedPnl >= 0;
    
    const boxWidth = 120;
    const boxHeight = 40;
    const boxX = displayWidth - padding.right - boxWidth - 10;
    const boxY = posY - boxHeight / 2;
    
    ctx.fillStyle = isProfit ? 'rgba(38, 166, 154, 0.9)' : 'rgba(239, 83, 80, 0.9)';
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    ctx.strokeStyle = isProfit ? '#26a69a' : '#ef5350';
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    
    ctx.fillText(`${isBuy ? 'LONG' : 'SHORT'} ${simOpenPosition.quantity}`, boxX + 5, boxY + 12);
    ctx.fillText(`@ $${simOpenPosition.entryPrice.toFixed(2)}`, boxX + 5, boxY + 24);
    
    const pnlText = `${isProfit ? '+' : ''}$${unrealizedPnl.toFixed(2)}`;
    ctx.fillText(pnlText, boxX + 5, boxY + 36);
    
    const closeX = boxX + boxWidth - 18;
    const closeY = boxY + 2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(closeX, closeY, 16, 16);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('X', closeX + 8, closeY + 12);
}

const SIM_STRATEGY_LEGS = {
    'Long Call': [{name: 'Long Call', type: 'C', position: 'long'}],
    'Long Put': [{name: 'Long Put', type: 'P', position: 'long'}],
    'Naked Short Call': [{name: 'Short Call', type: 'C', position: 'short'}],
    'Naked Short Put': [{name: 'Short Put', type: 'P', position: 'short'}],
    'Short Put Spread': [{name: 'Short Put', type: 'P', position: 'short'}, {name: 'Long Put', type: 'P', position: 'long'}],
    'Short Call Spread': [{name: 'Short Call', type: 'C', position: 'short'}, {name: 'Long Call', type: 'C', position: 'long'}],
    'Short Iron Condor': [{name: 'Long Put', type: 'P', position: 'long'}, {name: 'Short Put', type: 'P', position: 'short'}, {name: 'Short Call', type: 'C', position: 'short'}, {name: 'Long Call', type: 'C', position: 'long'}],
    'Short Iron Butterfly': [{name: 'Long Put', type: 'P', position: 'long'}, {name: 'Short Put', type: 'P', position: 'short'}, {name: 'Short Call', type: 'C', position: 'short'}, {name: 'Long Call', type: 'C', position: 'long'}],
    'Long Call Spread': [{name: 'Long Call', type: 'C', position: 'long'}, {name: 'Short Call', type: 'C', position: 'short'}],
    'Long Put Spread': [{name: 'Long Put', type: 'P', position: 'long'}, {name: 'Short Put', type: 'P', position: 'short'}],
    'Long Straddle': [{name: 'Long Call', type: 'C', position: 'long'}, {name: 'Long Put', type: 'P', position: 'long'}],
    'Long Strangle': [{name: 'Long Call', type: 'C', position: 'long'}, {name: 'Long Put', type: 'P', position: 'long'}],
    'Long Iron Butterfly': [{name: 'Long Put', type: 'P', position: 'long'}, {name: 'Short Put', type: 'P', position: 'short'}, {name: 'Short Call', type: 'C', position: 'short'}, {name: 'Long Call', type: 'C', position: 'long'}],
    'Long Iron Condor': [{name: 'Long Put', type: 'P', position: 'long'}, {name: 'Short Put', type: 'P', position: 'short'}, {name: 'Short Call', type: 'C', position: 'short'}, {name: 'Long Call', type: 'C', position: 'long'}],
    'Short Straddle': [{name: 'Short Call', type: 'C', position: 'short'}, {name: 'Short Put', type: 'P', position: 'short'}],
    'Short Strangle': [{name: 'Short Call', type: 'C', position: 'short'}, {name: 'Short Put', type: 'P', position: 'short'}]
};

const SIM_LEG_DIRECTION_RULES = {
    'Short Put Spread': { 1: 'below' },
    'Long Call Spread': { 1: 'above' },
    'Short Call Spread': { 1: 'above' },
    'Long Put Spread': { 1: 'below' },
    'Short Iron Condor': { 0: 'below', 3: 'above' },
    'Short Iron Butterfly': { 0: 'below', 3: 'above' },
    'Long Iron Condor': { 0: 'below', 3: 'above' },
    'Long Iron Butterfly': { 0: 'below', 3: 'above' }
};

function getLegDirectionRequirement(strategy, legIndex) {
    const rules = SIM_LEG_DIRECTION_RULES[strategy];
    if (rules && rules[legIndex] !== undefined) {
        return rules[legIndex];
    }
    return null;
}

function updateLegRefLabel(legIndex, type) {
    const strategy = document.getElementById('simOptionStrategy').value;
    const refSelect = document.querySelector(`.sim-leg-ref[data-leg="${legIndex}"]`);
    const dirSelect = document.querySelector(`.sim-leg-direction[data-leg="${legIndex}"]`);
    const label = document.querySelector(`.sim-leg-value-label[data-leg="${legIndex}"]`);
    
    if (!refSelect || !label) return;
    
    const refLegNum = parseInt(refSelect.value) + 1;
    const direction = dirSelect ? dirSelect.value : 'below';
    const symbol = type === 'dollar' ? '$' : '%';
    
    label.textContent = `${symbol}:`;
}

function buildSimLegConfiguration() {
    const strategy = document.getElementById('simOptionStrategy').value;
    const container = document.getElementById('simLegConfigSection');
    
    if (!container) return;
    
    const legs = SIM_STRATEGY_LEGS[strategy];
    if (!legs || legs.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    let html = '<div class="d-flex flex-wrap" style="gap: 12px;">';
    
    legs.forEach((leg, index) => {
        const badgeColor = leg.type === 'C' ? '#3b7cff' : '#f4a261';
        const positionBadge = leg.position === 'long' ? '#26a69a' : '#ef5350';
        const legDirection = getLegDirectionRequirement(strategy, index);
        const dirLabel = legDirection ? legDirection : 'from';
        
        html += `
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; min-width: 200px;">
                <div class="d-flex align-items-center mb-2" style="gap: 6px;">
                    <span style="font-weight: 600; color: #333; font-size: 12px;">Leg ${index + 1}: ${leg.name}</span>
                    <span style="background: ${badgeColor}; color: white; padding: 1px 6px; border-radius: 3px; font-size: 10px;">${leg.type === 'C' ? 'Call' : 'Put'}</span>
                    <span style="background: ${positionBadge}; color: white; padding: 1px 6px; border-radius: 3px; font-size: 10px;">${leg.position}</span>
                </div>
                <div class="mb-2">
                    <label class="small" style="color: #666; font-size: 11px;">Strike Selection:</label>
                    <select class="form-select form-select-sm sim-leg-method" data-leg-index="${index}" style="background: #fff; color: #333; border-color: #d0d3da; font-size: 11px;">
                        <option value="pct_underlying" selected>% from Underlying</option>
                        <option value="dollar_underlying">$ from Underlying</option>
                        <option value="exact_strike">Exact Strike Price</option>
                        <option value="delta">Delta-Based</option>
                        <option value="mid_price">Mid Price Range</option>
                        ${index > 0 ? `<option value="dollar_leg">$ ${dirLabel} Leg</option>` : ''}
                        ${index > 0 ? `<option value="pct_leg">% ${dirLabel} Leg</option>` : ''}
                    </select>
                </div>
                <div id="simLegParams${index}" class="d-flex flex-wrap" style="gap: 6px;"></div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
    
    container.querySelectorAll('.sim-leg-method').forEach(select => {
        select.addEventListener('change', (e) => updateSimLegParams(parseInt(e.target.dataset.legIndex), e.target.value));
        updateSimLegParams(parseInt(select.dataset.legIndex), select.value);
    });
}

function updateSimLegParams(legIndex, method) {
    const paramsContainer = document.getElementById(`simLegParams${legIndex}`);
    if (!paramsContainer) return;
    
    const strategy = document.getElementById('simOptionStrategy').value;
    const requiredDirection = getLegDirectionRequirement(strategy, legIndex);
    
    const inputStyle = 'background: #fff; color: #333; border-color: #d0d3da; font-size: 11px;';
    let html = '';
    
    const buildDirectionDropdown = (legIdx, methodType = '') => {
        const dirRequired = getLegDirectionRequirement(strategy, legIdx);
        const defaultDir = dirRequired || 'below';
        const isDisabled = dirRequired !== null;
        const onChangeHandler = methodType ? `onchange="updateLegRefLabel(${legIdx}, '${methodType}')"` : '';
        return `
            <div class="d-flex align-items-center" style="gap: 4px;">
                <label class="small" style="color: #666; font-size: 10px; white-space: nowrap;">Direction:</label>
                <select class="form-select form-select-sm sim-leg-direction" data-leg="${legIdx}" style="width: 65px; ${inputStyle}" ${isDisabled ? 'disabled' : ''} ${onChangeHandler}>
                    <option value="above" ${defaultDir === 'above' ? 'selected' : ''}>above</option>
                    <option value="below" ${defaultDir === 'below' ? 'selected' : ''}>below</option>
                </select>
            </div>
        `;
    };
    
    switch (method) {
        case 'exact_strike':
            html = `
                <div class="d-flex align-items-center" style="gap: 4px;">
                    <label class="small" style="color: #666; font-size: 10px; white-space: nowrap;">Strike:</label>
                    <input type="number" class="form-control form-control-sm sim-leg-strike" data-leg="${legIndex}" placeholder="633" step="1" style="width: 70px; ${inputStyle}">
                </div>
                <div class="d-flex align-items-center" style="gap: 4px;">
                    <label class="small" style="color: #666; font-size: 10px; white-space: nowrap;">Fallback:</label>
                    <select class="form-select form-select-sm sim-leg-fallback" data-leg="${legIndex}" style="width: 70px; ${inputStyle}">
                        <option value="closest">Closest</option>
                        <option value="higher">Higher</option>
                        <option value="lower">Lower</option>
                        <option value="exactly">Exactly</option>
                    </select>
                </div>
            `;
            break;
        case 'dollar_underlying':
            html = `
                ${buildDirectionDropdown(legIndex)}
                <div class="d-flex align-items-center" style="gap: 4px;">
                    <label class="small" style="color: #666; font-size: 10px; white-space: nowrap;">$:</label>
                    <input type="number" class="form-control form-control-sm sim-leg-value" data-leg="${legIndex}" data-param="value" value="0" step="1" min="0" style="width: 60px; ${inputStyle}">
                </div>
                <div class="d-flex align-items-center" style="gap: 4px;">
                    <label class="small" style="color: #666; font-size: 10px; white-space: nowrap;">Fallback:</label>
                    <select class="form-select form-select-sm sim-leg-fallback" data-leg="${legIndex}" style="width: 70px; ${inputStyle}">
                        <option value="closest">Closest</option>
                        <option value="higher">Higher</option>
                        <option value="lower">Lower</option>
                    </select>
                </div>
            `;
            break;
        case 'pct_underlying':
            html = `
                ${buildDirectionDropdown(legIndex)}
                <div class="d-flex align-items-center" style="gap: 4px;">
                    <label class="small" style="color: #666; font-size: 10px; white-space: nowrap;">%:</label>
                    <input type="number" class="form-control form-control-sm sim-leg-value" data-leg="${legIndex}" data-param="value" value="0" step="0.5" min="0" style="width: 60px; ${inputStyle}">
                </div>
                <div class="d-flex align-items-center" style="gap: 4px;">
                    <label class="small" style="color: #666; font-size: 10px; white-space: nowrap;">Fallback:</label>
                    <select class="form-select form-select-sm sim-leg-fallback" data-leg="${legIndex}" style="width: 70px; ${inputStyle}">
                        <option value="closest">Closest</option>
                        <option value="higher">Higher</option>
                        <option value="lower">Lower</option>
                    </select>
                </div>
            `;
            break;
        case 'mid_price':
            html = `
                <div class="d-flex align-items-center" style="gap: 4px;">
                    <label class="small" style="color: #666; font-size: 10px; white-space: nowrap;">Min $:</label>
                    <input type="number" class="form-control form-control-sm sim-leg-min" data-leg="${legIndex}" value="1" step="0.5" style="width: 55px; ${inputStyle}">
                </div>
                <div class="d-flex align-items-center" style="gap: 4px;">
                    <label class="small" style="color: #666; font-size: 10px; white-space: nowrap;">Max $:</label>
                    <input type="number" class="form-control form-control-sm sim-leg-max" data-leg="${legIndex}" value="5" step="0.5" style="width: 55px; ${inputStyle}">
                </div>
            `;
            break;
        case 'delta':
            html = `
                <div class="d-flex align-items-center" style="gap: 4px;">
                    <label class="small" style="color: #666; font-size: 10px; white-space: nowrap;">Delta:</label>
                    <input type="number" class="form-control form-control-sm sim-leg-delta" data-leg="${legIndex}" value="0.30" step="0.05" min="0" max="1" style="width: 60px; ${inputStyle}">
                </div>
                <div class="d-flex align-items-center" style="gap: 4px;">
                    <label class="small" style="color: #666; font-size: 10px; white-space: nowrap;">Method:</label>
                    <select class="form-select form-select-sm sim-leg-delta-method" data-leg="${legIndex}" style="width: 75px; ${inputStyle}">
                        <option value="closest">Closest</option>
                        <option value="above">Above</option>
                        <option value="below">Below</option>
                        <option value="between">Between</option>
                        <option value="exactly">Exactly</option>
                    </select>
                </div>
            `;
            break;
        case 'dollar_leg':
            const dollarLegDir = requiredDirection || 'below';
            const defaultDollarRef = legIndex > 0 ? legIndex - 1 : 0;
            html = `
                <div class="d-flex align-items-center" style="gap: 4px;">
                    <label class="small" style="color: #666; font-size: 10px; white-space: nowrap;">Ref:</label>
                    <select class="form-select form-select-sm sim-leg-ref" data-leg="${legIndex}" style="width: 55px; ${inputStyle}" onchange="updateLegRefLabel(${legIndex}, 'dollar')">
                        ${Array.from({length: legIndex}, (_, i) => `<option value="${i}" ${i === defaultDollarRef ? 'selected' : ''}>Leg ${i + 1}</option>`).join('')}
                    </select>
                </div>
                ${buildDirectionDropdown(legIndex, 'dollar')}
                <div class="d-flex align-items-center" style="gap: 4px;">
                    <label class="small sim-leg-value-label" data-leg="${legIndex}" style="color: #666; font-size: 10px; white-space: nowrap;">$:</label>
                    <input type="number" class="form-control form-control-sm sim-leg-value" data-leg="${legIndex}" data-param="value" value="1" step="1" min="0" style="width: 55px; ${inputStyle}">
                </div>
            `;
            break;
        case 'pct_leg':
            const pctLegDir = requiredDirection || 'below';
            const defaultPctRef = legIndex > 0 ? legIndex - 1 : 0;
            html = `
                <div class="d-flex align-items-center" style="gap: 4px;">
                    <label class="small" style="color: #666; font-size: 10px; white-space: nowrap;">Ref:</label>
                    <select class="form-select form-select-sm sim-leg-ref" data-leg="${legIndex}" style="width: 55px; ${inputStyle}" onchange="updateLegRefLabel(${legIndex}, 'pct')">
                        ${Array.from({length: legIndex}, (_, i) => `<option value="${i}" ${i === defaultPctRef ? 'selected' : ''}>Leg ${i + 1}</option>`).join('')}
                    </select>
                </div>
                ${buildDirectionDropdown(legIndex, 'pct')}
                <div class="d-flex align-items-center" style="gap: 4px;">
                    <label class="small sim-leg-value-label" data-leg="${legIndex}" style="color: #666; font-size: 10px; white-space: nowrap;">%:</label>
                    <input type="number" class="form-control form-control-sm sim-leg-value" data-leg="${legIndex}" data-param="value" value="2" step="0.5" min="0" style="width: 55px; ${inputStyle}">
                </div>
            `;
            break;
    }
    
    paramsContainer.innerHTML = html;
}

function collectSimLegConfigurations() {
    const legs = [];
    const strategy = document.getElementById('simOptionStrategy').value;
    const strategyLegs = SIM_STRATEGY_LEGS[strategy] || [];
    
    document.querySelectorAll('#simLegConfigSection > div > div').forEach((card, index) => {
        if (index >= strategyLegs.length) return;
        
        const methodSelect = card.querySelector('.sim-leg-method');
        if (!methodSelect) return;
        
        const method = methodSelect.value;
        const legInfo = strategyLegs[index];
        
        const leg = {
            method: method,
            name: legInfo.name,
            type: legInfo.type,
            position: legInfo.position
        };
        
        const directionSelect = card.querySelector('.sim-leg-direction');
        const direction = directionSelect ? directionSelect.value : 'below';
        
        switch (method) {
            case 'exact_strike':
                leg.strike = parseFloat(card.querySelector('.sim-leg-strike')?.value) || 0;
                leg.fallback = card.querySelector('.sim-leg-fallback')?.value || 'closest';
                break;
            case 'dollar_underlying':
            case 'pct_underlying':
                leg.value = Math.abs(parseFloat(card.querySelector('.sim-leg-value')?.value) || 0);
                leg.direction = direction;
                leg.fallback = card.querySelector('.sim-leg-fallback')?.value || 'closest';
                break;
            case 'delta':
                leg.delta = parseFloat(card.querySelector('.sim-leg-delta')?.value) || 0.30;
                leg.deltaMethod = card.querySelector('.sim-leg-delta-method')?.value || 'closest';
                break;
            case 'mid_price':
                leg.min = parseFloat(card.querySelector('.sim-leg-min')?.value) || 1;
                leg.max = parseFloat(card.querySelector('.sim-leg-max')?.value) || 5;
                break;
            case 'dollar_leg':
            case 'pct_leg':
                const refSelect = card.querySelector('.sim-leg-ref');
                const refValue = refSelect ? refSelect.value : '0';
                leg.refLeg = parseInt(refValue);
                if (isNaN(leg.refLeg)) leg.refLeg = 0;
                leg.value = Math.abs(parseFloat(card.querySelector('.sim-leg-value')?.value) || 0);
                leg.direction = direction;
                break;
        }
        
        legs.push(leg);
    });
    
    return legs;
}

function calculateStrikeFromLegConfig(leg, underlyingPrice, resolvedStrikes) {
    const dirMultiplier = (leg.direction === 'above') ? 1 : -1;
    
    switch (leg.method) {
        case 'exact_strike':
            return { strike: leg.strike, fallback: leg.fallback };
        case 'dollar_underlying':
            return { strike: underlyingPrice + (leg.value * dirMultiplier), fallback: leg.fallback };
        case 'pct_underlying':
            return { strike: underlyingPrice * (1 + (leg.value / 100) * dirMultiplier), fallback: leg.fallback };
        case 'dollar_leg':
            if (resolvedStrikes[leg.refLeg] !== undefined) {
                const refStrike = resolvedStrikes[leg.refLeg];
                const calculatedStrike = refStrike + (leg.value * dirMultiplier);
                console.log(`[Strike Calc] dollar_leg: Leg ${leg.refLeg} strike=${refStrike}, value=${leg.value}, dir=${leg.direction}, result=${calculatedStrike}`);
                return { strike: calculatedStrike, fallback: 'closest' };
            }
            return { strike: underlyingPrice, fallback: 'closest' };
        case 'pct_leg':
            if (resolvedStrikes[leg.refLeg] !== undefined) {
                const refStrike = resolvedStrikes[leg.refLeg];
                const calculatedStrike = refStrike * (1 + (leg.value / 100) * dirMultiplier);
                console.log(`[Strike Calc] pct_leg: Leg ${leg.refLeg} strike=${refStrike}, value=${leg.value}%, dir=${leg.direction}, result=${calculatedStrike}`);
                return { strike: calculatedStrike, fallback: 'closest' };
            }
            return { strike: underlyingPrice, fallback: 'closest' };
        case 'delta':
            return { strike: underlyingPrice, fallback: 'closest', delta: leg.delta, deltaMethod: leg.deltaMethod };
        case 'mid_price':
            return { strike: underlyingPrice, fallback: 'closest', midPriceMin: leg.min, midPriceMax: leg.max };
        default:
            return { strike: underlyingPrice, fallback: 'closest' };
    }
}

async function executeOptionTrade() {
    if (simVisibleBars.length === 0) {
        alert('Load chart data first');
        return;
    }
    
    const currentMinuteBar = simMinuteBarsCache[simCurrentMinuteIndex - 1];
    if (currentMinuteBar) {
        const barDate = new Date(currentMinuteBar.timestamp);
        const etTime = barDate.toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
        const [etHour, etMinute] = etTime.split(':').map(Number);
        const totalMinutes = etHour * 60 + etMinute;
        const marketOpen = 9 * 60 + 30;
        const marketClose = 15 * 60 + 59;
        
        if (totalMinutes < marketOpen || totalMinutes > marketClose) {
            alert('Options can only be traded between 9:30 AM and 3:59 PM ET');
            return;
        }
    }
    
    const dte = parseInt(document.getElementById('simOptionDTE').value) || 0;
    const strategy = document.getElementById('simOptionStrategy').value;
    const tp = parseFloat(document.getElementById('simOptionTP').value) || 50;
    const sl = parseFloat(document.getElementById('simOptionSL').value) || -100;
    const detectionBar = parseInt(document.getElementById('simOptionDetectionBar').value) || 1;
    const quantity = parseInt(document.getElementById('simOptionQuantity').value) || 10;
    
    const legConfigs = collectSimLegConfigurations();
    if (legConfigs.length === 0) {
        alert('Please configure at least one leg');
        return;
    }
    
    if (!currentMinuteBar) {
        alert('No current bar data available');
        return;
    }
    
    const underlyingPrice = currentMinuteBar.close;
    const entryTimestamp = currentMinuteBar.timestamp;
    const entryDate = new Date(entryTimestamp);
    
    const etTimeStr = entryDate.toLocaleString('en-US', { 
        timeZone: 'America/New_York', 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: false 
    });
    const [etHour, etMinute] = etTimeStr.split(':').map(Number);
    const entryTimeMinutes = etHour * 60 + etMinute;
    const marketCloseMinutes = 16 * 60;
    
    if (dte === 0 && entryTimeMinutes >= marketCloseMinutes) {
        alert(`Cannot open 0DTE trades after 4:00 PM ET. Current time: ${etTimeStr} ET.\n\nOptions markets close at 4:00 PM ET on expiration day.`);
        return;
    }
    
    const expirationDate = new Date(entryDate);
    expirationDate.setDate(expirationDate.getDate() + dte);
    const expDateStr = expirationDate.toISOString().split('T')[0];
    const startDateStr = entryDate.toISOString().split('T')[0];
    
    const tradeBtn = document.getElementById('simOptionTradeBtn');
    tradeBtn.disabled = true;
    tradeBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Loading...';
    
    try {
        const resolvedStrikes = [];
        const positionLegs = [];
        
        console.log('Executing option trade:', {
            symbol: simCurrentSymbol,
            underlyingPrice,
            expDate: expDateStr,
            startDate: startDateStr,
            endDate: simChartDates.end,
            legConfigs: JSON.stringify(legConfigs)
        });
        
        for (let i = 0; i < legConfigs.length; i++) {
            const legConfig = legConfigs[i];
            
            if (legConfig.method === 'dollar_leg' || legConfig.method === 'pct_leg') {
                const refLegIdx = legConfig.refLeg !== undefined ? legConfig.refLeg : 0;
                const refStrike = resolvedStrikes[refLegIdx];
                console.log(`Leg ${i + 1} conversion check:`, { method: legConfig.method, refLegIdx, refStrike, resolvedStrikes: [...resolvedStrikes] });
                
                if (refStrike !== undefined) {
                    let calculatedStrike;
                    if (legConfig.method === 'dollar_leg') {
                        calculatedStrike = refStrike + (legConfig.value || 0);
                    } else {
                        calculatedStrike = refStrike * (1 + (legConfig.value || 0) / 100);
                    }
                    console.log(`Leg ${i + 1} converting to exact_strike: ${calculatedStrike}`);
                    legConfig.method = 'exact_strike';
                    legConfig.strike = calculatedStrike;
                    legConfig.fallback = 'closest';
                }
            }
            
            console.log(`Leg ${i + 1} config:`, {
                legConfig: JSON.stringify(legConfig),
                underlyingPrice
            });
            
            const optionData = await fetchOptionBars(
                simCurrentSymbol,
                legConfig.type,
                expDateStr,
                startDateStr,
                simChartDates.end,
                detectionBar,
                legConfig,
                underlyingPrice
            );
            
            console.log(`Leg ${i + 1} option data response:`, {
                barsCount: optionData.bars?.length || 0,
                actualStrike: optionData.actualStrike,
                optionSymbol: optionData.optionSymbol
            });
            
            if (!optionData.bars || optionData.bars.length === 0) {
                alert(`No option data found for leg ${i + 1}: ${legConfig.name}. Check expiration date and symbol.`);
                tradeBtn.disabled = false;
                tradeBtn.innerHTML = '<i class="fas fa-bolt me-1"></i>Trade Option';
                return;
            }
            
            const actualStrike = optionData.actualStrike;
            resolvedStrikes.push(actualStrike);
            
            let entryBar = findClosestOptionBar(optionData.bars, entryTimestamp);
            if (!entryBar) {
                entryBar = optionData.bars.find(b => b.timestamp >= entryTimestamp);
            }
            if (!entryBar) {
                alert(`No option price data at entry time for leg ${i + 1}`);
                tradeBtn.disabled = false;
                tradeBtn.innerHTML = '<i class="fas fa-bolt me-1"></i>Trade Option';
                return;
            }
            
            const entryPrice = entryBar.vwap || entryBar.close;
            const entryBarTimestamp = entryBar.timestamp;
            
            positionLegs.push({
                legIndex: i,
                name: legConfig.name,
                type: legConfig.type,
                position: legConfig.position,
                strike: actualStrike,
                entryPrice: entryPrice,
                entryBarTimestamp: entryBarTimestamp,
                optionBars: optionData.bars,
                optionSymbol: optionData.optionSymbol
            });
        }
        
        let totalEntryPremium = 0;
        positionLegs.forEach(leg => {
            const premium = leg.entryPrice * 100 * quantity;
            if (leg.position === 'long') {
                totalEntryPremium -= premium;
            } else {
                totalEntryPremium += premium;
            }
        });
        
        const position = {
            id: Date.now(),
            strategy: strategy,
            legs: positionLegs,
            expiration: expDateStr,
            quantity: quantity,
            remainingQuantity: quantity,
            totalEntryPremium: totalEntryPremium,
            entryTimestamp: entryTimestamp,
            entryMinuteIndex: simCurrentMinuteIndex,
            underlyingAtEntry: underlyingPrice,
            tp: tp,
            sl: sl,
            detectionBar: detectionBar,
            status: 'open',
            closedParts: [],
            realizedPnl: 0
        };
        
        simOpenOptionPositions.push(position);
        
        updateOptionsPnlDisplay();
        updateOptionsPositionsCard();
        redrawChart();
        
        console.log('Option position opened:', position);
        
    } catch (error) {
        console.error('Error opening option position:', error);
        alert('Error opening option position: ' + error.message);
    } finally {
        tradeBtn.disabled = false;
        tradeBtn.innerHTML = '<i class="fas fa-bolt me-1"></i>Trade Option';
    }
}

async function fetchOptionBars(symbol, optionType, expDate, startDate, endDate, multiplier, legConfig, underlyingPrice) {
    await waitForRateLimit();
    
    const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? `http://${window.location.hostname}:${window.location.port}/api`
        : '/api';
    
    const apiKey = localStorage.getItem('polygonApiKey') || '';
    
    try {
        const requestBody = {
            symbol: symbol,
            option_type: optionType,
            expiration_date: expDate,
            start_date: startDate,
            end_date: endDate,
            multiplier: multiplier,
            underlying_price: underlyingPrice,
            strike_method: legConfig.method,
            method_value: legConfig.value || 0,
            fallback: legConfig.fallback || 'closest'
        };
        
        if (legConfig.method === 'exact_strike') {
            requestBody.strike = legConfig.strike;
        }
        
        if (legConfig.method === 'delta') {
            requestBody.delta = legConfig.delta;
            requestBody.delta_method = legConfig.deltaMethod || 'closest';
        }
        
        if (legConfig.method === 'mid_price') {
            requestBody.mid_price_min = legConfig.min;
            requestBody.mid_price_max = legConfig.max;
        }
        
        const response = await fetch(`${apiUrl}/simulated-trading/option-bars`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            credentials: 'include',
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to fetch option data');
        }
        
        const data = await response.json();
        return {
            bars: data.bars || [],
            actualStrike: data.strike,
            optionSymbol: data.option_symbol,
            optionType: data.option_type
        };
    } catch (error) {
        console.error('Error fetching option bars:', error);
        throw error;
    }
}

function calculateOptionPositionPnl(pos, currentTimestamp) {
    if (!pos.legs || pos.legs.length === 0) return 0;
    
    let totalPnl = 0;
    
    for (const leg of pos.legs) {
        const optionBar = findClosestOptionBar(leg.optionBars, currentTimestamp);
        if (!optionBar) continue;
        
        const currentPrice = optionBar.vwap || optionBar.close;
        const entryPrice = leg.entryPrice;
        
        const priceDiff = currentPrice - entryPrice;
        const legPnl = leg.position === 'long' 
            ? priceDiff * 100 * pos.remainingQuantity
            : -priceDiff * 100 * pos.remainingQuantity;
        
        totalPnl += legPnl;
    }
    
    return totalPnl;
}

function checkOptionTpSlThresholds() {
    if (simOpenOptionPositions.length === 0) return;
    
    const currentMinuteBar = simMinuteBarsCache[simCurrentMinuteIndex - 1];
    if (!currentMinuteBar) return;
    
    const currentTimestamp = currentMinuteBar.timestamp;
    const positionsToClose = [];
    
    for (const pos of simOpenOptionPositions) {
        if (pos.status !== 'open') continue;
        
        const unrealizedPnl = calculateOptionPositionPnl(pos, currentTimestamp);
        const entryPremium = Math.abs(pos.totalEntryPremium);
        
        if (entryPremium > 0) {
            const pnlPct = (unrealizedPnl / entryPremium) * 100;
            
            if (pos.tp && pnlPct >= pos.tp) {
                console.log(`TP hit for position ${pos.id}: ${pnlPct.toFixed(1)}% >= ${pos.tp}%`);
                positionsToClose.push({ pos, reason: 'TP' });
            } else if (pos.sl && unrealizedPnl <= -Math.abs(pos.sl)) {
                console.log(`SL hit for position ${pos.id}: $${unrealizedPnl.toFixed(2)} <= -$${Math.abs(pos.sl)}`);
                positionsToClose.push({ pos, reason: 'SL' });
            }
        }
        
        const currentDate = new Date(currentTimestamp);
        const currentDateET = currentDate.toLocaleString('en-US', { 
            timeZone: 'America/New_York', 
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const [currentMonth, currentDay, currentYear] = currentDateET.split('/');
        const currentDateStr = `${currentYear}-${currentMonth}-${currentDay}`;
        
        const currentTimeET = currentDate.toLocaleString('en-US', { 
            timeZone: 'America/New_York', 
            hour: '2-digit', 
            minute: '2-digit', 
            hour12: false 
        });
        const [etHour, etMinute] = currentTimeET.split(':').map(Number);
        const currentTimeMinutes = etHour * 60 + etMinute;
        const marketCloseMinutes = 16 * 60;
        
        const isPastExpiration = currentDateStr > pos.expiration || 
            (currentDateStr === pos.expiration && currentTimeMinutes >= marketCloseMinutes);
        
        if (isPastExpiration) {
            console.log(`Position ${pos.id} expired (Current: ${currentDateStr} ${currentTimeET} ET, Exp: ${pos.expiration})`);
            positionsToClose.push({ pos, reason: 'Expiration' });
        }
    }
    
    for (const { pos, reason } of positionsToClose) {
        closeOptionPosition(pos.id, null, reason);
    }
}

function updateOptionsPnlDisplay() {
    let unrealizedPnl = 0;
    
    if (simOpenOptionPositions.length > 0) {
        const currentMinuteBar = simMinuteBarsCache[simCurrentMinuteIndex - 1];
        const currentTimestamp = currentMinuteBar ? currentMinuteBar.timestamp : Date.now();
        
        for (const pos of simOpenOptionPositions) {
            unrealizedPnl += calculateOptionPositionPnl(pos, currentTimestamp);
        }
    }
    
    const optRealizedEl = document.getElementById('simOptionsRealizedPnl');
    const optUnrealizedEl = document.getElementById('simOptionsUnrealizedPnl');
    
    if (optRealizedEl) {
        const isPositive = simOptionsRealizedPnl >= 0;
        optRealizedEl.textContent = `${isPositive ? '+' : ''}$${simOptionsRealizedPnl.toFixed(2)}`;
        optRealizedEl.style.color = isPositive ? '#26a69a' : '#ef5350';
    }
    
    if (optUnrealizedEl) {
        const isPositive = unrealizedPnl >= 0;
        optUnrealizedEl.textContent = `${isPositive ? '+' : ''}$${unrealizedPnl.toFixed(2)}`;
        optUnrealizedEl.style.color = isPositive ? '#26a69a' : '#ef5350';
    }
    
    updateOptionsPositionsCard();
}

function findClosestOptionBar(optionBars, targetTimestamp) {
    if (!optionBars || optionBars.length === 0) return null;
    
    let closestBefore = null;
    let minDiffBefore = Infinity;
    
    for (const bar of optionBars) {
        if (bar.timestamp <= targetTimestamp) {
            const diff = targetTimestamp - bar.timestamp;
            if (diff < minDiffBefore) {
                minDiffBefore = diff;
                closestBefore = bar;
            }
        }
    }
    
    if (closestBefore) return closestBefore;
    
    return optionBars[optionBars.length - 1];
}

function closeOptionPosition(positionId, closeQuantity = null, reason = 'Manual') {
    const posIndex = simOpenOptionPositions.findIndex(p => p.id === positionId);
    if (posIndex === -1) return;
    
    const pos = simOpenOptionPositions[posIndex];
    const currentMinuteBar = simMinuteBarsCache[simCurrentMinuteIndex - 1];
    if (!currentMinuteBar) {
        alert('No current bar data available');
        return;
    }
    
    const currentTimestamp = currentMinuteBar.timestamp;
    const qtyToClose = closeQuantity || pos.remainingQuantity;
    
    let pnl = 0;
    const legExitPrices = [];
    
    for (const leg of pos.legs) {
        let optionBar = findClosestOptionBar(leg.optionBars, currentTimestamp);
        if (!optionBar && leg.optionBars.length > 0) {
            optionBar = leg.optionBars[leg.optionBars.length - 1];
        }
        
        if (!optionBar) {
            legExitPrices.push({ leg: leg.name, price: leg.entryPrice });
            continue;
        }
        
        const exitPrice = optionBar.vwap || optionBar.close;
        legExitPrices.push({ leg: leg.name, price: exitPrice });
        
        const legPnl = leg.position === 'long'
            ? (exitPrice - leg.entryPrice) * 100 * qtyToClose
            : (leg.entryPrice - exitPrice) * 100 * qtyToClose;
        pnl += legPnl;
    }
    
    simOptionsRealizedPnl += pnl;
    pos.realizedPnl += pnl;
    
    pos.closedParts.push({
        quantity: qtyToClose,
        exitPrices: legExitPrices,
        exitTimestamp: currentTimestamp,
        pnl: pnl,
        reason: reason
    });
    
    const closeRatio = qtyToClose / pos.remainingQuantity;
    pos.totalEntryPremium = pos.totalEntryPremium * (1 - closeRatio);
    pos.remainingQuantity -= qtyToClose;
    
    console.log(`Closed ${qtyToClose} contracts of ${pos.strategy} (${reason}): PnL $${pnl.toFixed(2)}`);
    
    if (pos.remainingQuantity <= 0) {
        pos.status = 'closed';
        simClosedOptionTrades.push(pos);
        simOpenOptionPositions.splice(posIndex, 1);
    }
    
    showTradeToast(pos.strategy, reason, pnl, qtyToClose);
    
    updateOptionsPnlDisplay();
    updateOptionsPositionsCard();
    redrawChart();
}

function showTradeToast(strategy, reason, pnl, quantity) {
    const toast = document.getElementById('simTradeToast');
    const icon = document.getElementById('simToastIcon');
    const title = document.getElementById('simToastTitle');
    const message = document.getElementById('simToastMessage');
    
    if (!toast) return;
    
    const isProfit = pnl >= 0;
    const pnlStr = `${isProfit ? '+' : ''}$${pnl.toFixed(2)}`;
    
    let iconClass = 'fas fa-check-circle';
    let iconColor = '#26a69a';
    let titleText = 'Trade Closed';
    
    switch (reason) {
        case 'TP':
            iconClass = 'fas fa-bullseye';
            iconColor = '#26a69a';
            titleText = 'Take Profit Hit!';
            break;
        case 'SL':
            iconClass = 'fas fa-shield-alt';
            iconColor = '#ef5350';
            titleText = 'Stop Loss Hit';
            break;
        case 'Expiration':
            iconClass = 'fas fa-clock';
            iconColor = '#ff9800';
            titleText = 'Position Expired';
            break;
        default:
            iconClass = 'fas fa-times-circle';
            iconColor = '#b2b5be';
            titleText = 'Position Closed';
    }
    
    icon.className = iconClass;
    icon.style.color = iconColor;
    title.textContent = titleText;
    message.innerHTML = `<strong>${strategy}</strong> (${quantity} contracts)<br>P&L: <span style="color: ${isProfit ? '#26a69a' : '#ef5350'};">${pnlStr}</span>`;
    
    toast.style.display = 'block';
    toast.style.animation = 'slideIn 0.3s ease-out';
    
    setTimeout(() => {
        hideTradeToast();
    }, 5000);
}

function hideTradeToast() {
    const toast = document.getElementById('simTradeToast');
    if (toast) {
        toast.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            toast.style.display = 'none';
        }, 300);
    }
}

function updatePositionTpSl(positionId) {
    const pos = simOpenOptionPositions.find(p => p.id === positionId);
    if (!pos) return;
    
    const tpInput = document.getElementById(`pos-tp-${positionId}`);
    const slInput = document.getElementById(`pos-sl-${positionId}`);
    
    if (tpInput) {
        const newTp = parseFloat(tpInput.value);
        if (!isNaN(newTp) && newTp > 0) {
            pos.tp = newTp;
        }
    }
    
    if (slInput) {
        const newSl = parseFloat(slInput.value);
        if (!isNaN(newSl) && newSl >= 0) {
            pos.sl = -Math.abs(newSl);
        }
    }
    
    console.log(`Updated position ${positionId} TP/SL: TP=${pos.tp}%, SL=$${Math.abs(pos.sl)}`);
    
    const btn = document.querySelector(`#pos-card-${positionId} .btn-outline-primary`);
    if (btn) {
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i>';
        btn.classList.remove('btn-outline-primary');
        btn.classList.add('btn-success');
        setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.classList.remove('btn-success');
            btn.classList.add('btn-outline-primary');
        }, 1500);
    }
}

function closePositionPartial(positionId) {
    const pos = simOpenOptionPositions.find(p => p.id === positionId);
    if (!pos) return;
    
    const qtyInput = document.getElementById(`pos-close-qty-${positionId}`);
    if (!qtyInput) return;
    
    const closeQty = parseInt(qtyInput.value);
    if (isNaN(closeQty) || closeQty < 1) {
        alert('Please enter a valid quantity to close');
        return;
    }
    
    if (closeQty > pos.remainingQuantity) {
        alert(`Cannot close ${closeQty} contracts. Only ${pos.remainingQuantity} remaining.`);
        return;
    }
    
    closeOptionPosition(positionId, closeQty, 'Manual');
}

function updateOptionsPositionsCard() {
    const card = document.getElementById('simOptionsPositionsCard');
    const list = document.getElementById('simOptionsPositionsList');
    const countBadge = document.getElementById('simOptionsPositionCount');
    
    if (!card || !list) return;
    
    if (simOpenOptionPositions.length === 0) {
        card.style.display = 'none';
        return;
    }
    
    card.style.display = 'block';
    countBadge.textContent = simOpenOptionPositions.length;
    
    const currentMinuteBar = simMinuteBarsCache[simCurrentMinuteIndex - 1];
    const currentTimestamp = currentMinuteBar ? currentMinuteBar.timestamp : Date.now();
    
    let html = '';
    for (const pos of simOpenOptionPositions) {
        const unrealizedPnl = calculateOptionPositionPnl(pos, currentTimestamp);
        const isProfit = unrealizedPnl >= 0;
        const pnlStr = `${isProfit ? '+' : ''}$${unrealizedPnl.toFixed(2)}`;
        const entryPremium = Math.abs(pos.totalEntryPremium);
        const pnlPct = entryPremium > 0 ? (unrealizedPnl / entryPremium * 100).toFixed(1) : '0.0';
        
        const legsHtml = pos.legs.map(leg => {
            const optionBar = findClosestOptionBar(leg.optionBars, currentTimestamp);
            const currentPrice = optionBar ? (optionBar.vwap || optionBar.close) : leg.entryPrice;
            return `<span class="badge me-1" style="background: ${leg.position === 'long' ? '#3b7cff' : '#ff9800'}; font-size: 10px;">
                ${leg.position.charAt(0).toUpperCase()} ${leg.type} $${leg.strike} @ $${currentPrice.toFixed(2)}
            </span>`;
        }).join('');
        
        html += `
        <div class="p-2 mb-2 rounded" style="background: #f8f9fa; border: 1px solid #e0e3eb;" id="pos-card-${pos.id}">
            <div class="d-flex justify-content-between align-items-start mb-1">
                <div>
                    <span class="fw-bold" style="color: #333; font-size: 13px;">${pos.strategy}</span>
                    <span class="small text-muted ms-2">${pos.remainingQuantity} contracts</span>
                </div>
                <span class="fw-bold" style="color: ${isProfit ? '#26a69a' : '#ef5350'}; font-size: 13px;">
                    ${pnlStr} (${pnlPct}%)
                </span>
            </div>
            <div class="mb-2">${legsHtml}</div>
            <div class="small text-muted mb-2">Exp: ${pos.expiration}</div>
            <div class="d-flex align-items-center flex-wrap mb-2" style="gap: 8px;">
                <div class="d-flex align-items-center">
                    <label class="small me-1" style="color: #666; white-space: nowrap;">TP%:</label>
                    <input type="number" class="form-control form-control-sm" id="pos-tp-${pos.id}" value="${pos.tp}" step="5" style="width: 55px; font-size: 11px; padding: 2px 5px;">
                </div>
                <div class="d-flex align-items-center">
                    <label class="small me-1" style="color: #666; white-space: nowrap;">SL$:</label>
                    <input type="number" class="form-control form-control-sm" id="pos-sl-${pos.id}" value="${Math.abs(pos.sl)}" min="0" step="10" style="width: 60px; font-size: 11px; padding: 2px 5px;">
                </div>
                <button class="btn btn-sm btn-outline-primary" onclick="updatePositionTpSl(${pos.id})" style="font-size: 10px; padding: 2px 6px;">
                    <i class="fas fa-save"></i>
                </button>
            </div>
            <div class="d-flex align-items-center justify-content-between">
                <div class="d-flex align-items-center" style="gap: 6px;">
                    <label class="small" style="color: #666; white-space: nowrap;">Close:</label>
                    <input type="number" class="form-control form-control-sm" id="pos-close-qty-${pos.id}" value="${pos.remainingQuantity}" min="1" max="${pos.remainingQuantity}" style="width: 50px; font-size: 11px; padding: 2px 5px;">
                    <span class="small text-muted">/ ${pos.remainingQuantity}</span>
                </div>
                <div class="d-flex" style="gap: 4px;">
                    <button class="btn btn-sm btn-outline-danger" onclick="closePositionPartial(${pos.id})" style="font-size: 10px; padding: 2px 8px;">
                        Close
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="closeOptionPosition(${pos.id})" style="font-size: 10px; padding: 2px 8px;">
                        Close All
                    </button>
                </div>
            </div>
        </div>`;
    }
    
    list.innerHTML = html;
}

function drawOptionPositionsOnChart(ctx, displayWidth, padding, chartHeight, minPrice, maxPrice, priceRange) {
    if (simOpenOptionPositions.length === 0) return;
    
    const container = document.getElementById('simChartContainer');
    const displayHeight = container.clientHeight;
    
    const currentMinuteBar = simMinuteBarsCache[simCurrentMinuteIndex - 1];
    if (!currentMinuteBar) return;
    
    const currentTimestamp = currentMinuteBar.timestamp;
    
    let boxYOffset = 0;
    
    for (const pos of simOpenOptionPositions) {
        if (!pos.legs || pos.legs.length === 0) continue;
        
        for (const leg of pos.legs) {
            const strikeY = padding.top + ((maxPrice - leg.strike) / priceRange) * chartHeight;
            
            if (strikeY < padding.top || strikeY > displayHeight - padding.bottom) continue;
            
            const legColor = leg.position === 'long' ? '#3b7cff' : '#ff9800';
            const typeColor = leg.type === 'C' ? '#26a69a' : '#ef5350';
            
            ctx.save();
            ctx.strokeStyle = legColor;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 3]);
            ctx.beginPath();
            ctx.moveTo(padding.left, strikeY);
            ctx.lineTo(displayWidth - padding.right, strikeY);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
            
            const labelText = `${leg.position.toUpperCase()} ${leg.type === 'C' ? 'CALL' : 'PUT'} $${leg.strike}`;
            ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
            const labelWidth = ctx.measureText(labelText).width + 10;
            
            ctx.fillStyle = typeColor;
            ctx.fillRect(displayWidth - padding.right - labelWidth - 5, strikeY - 8, labelWidth, 16);
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';
            ctx.fillText(labelText, displayWidth - padding.right - labelWidth, strikeY + 4);
        }
        
        const unrealizedPnl = calculateOptionPositionPnl(pos, currentTimestamp);
        const isProfit = unrealizedPnl >= 0;
        const strategyLabel = pos.strategy.toUpperCase();
        
        const avgStrike = pos.legs.reduce((sum, leg) => sum + leg.strike, 0) / pos.legs.length;
        const avgStrikeY = padding.top + ((maxPrice - avgStrike) / priceRange) * chartHeight;
        
        const boxWidth = 155;
        const boxHeight = 58;
        const boxX = padding.left + 10;
        let boxY = avgStrikeY - boxHeight / 2 + boxYOffset;
        
        boxY = Math.max(padding.top + 5, Math.min(boxY, displayHeight - padding.bottom - boxHeight - 5));
        
        ctx.fillStyle = isProfit ? 'rgba(38, 166, 154, 0.95)' : 'rgba(239, 83, 80, 0.95)';
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
        
        ctx.strokeStyle = isProfit ? '#26a69a' : '#ef5350';
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'left';
        
        ctx.fillText(strategyLabel, boxX + 5, boxY + 12);
        
        ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
        const strikesText = pos.legs.map(l => `${l.type}$${l.strike}`).join(' / ');
        ctx.fillText(strikesText.substring(0, 25), boxX + 5, boxY + 24);
        ctx.fillText(`Qty: ${pos.remainingQuantity} | Exp: ${pos.expiration}`, boxX + 5, boxY + 36);
        
        const pnlText = `PnL: ${isProfit ? '+' : ''}$${unrealizedPnl.toFixed(2)}`;
        ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText(pnlText, boxX + 5, boxY + 50);
        
        const closeX = boxX + boxWidth - 18;
        const closeY = boxY + 2;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(closeX, closeY, 16, 16);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('X', closeX + 8, closeY + 12);
        
        pos._closeButtonBounds = { x: closeX, y: closeY, width: 16, height: 16 };
        pos._boxBounds = { x: boxX, y: boxY, width: boxWidth, height: boxHeight };
        
        boxYOffset += 65;
    }
}


// Make functions globally accessible for HTML onclick handlers
window.hideTradeToast = hideTradeToast;
window.closeOptionPosition = closeOptionPosition;
window.updatePositionTpSl = updatePositionTpSl;
window.closePositionPartial = closePositionPartial;
