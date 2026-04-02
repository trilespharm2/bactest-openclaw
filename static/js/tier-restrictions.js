var TierRestrictions = (function() {
    var _tier = 'free';
    var _restrictions = null;

    var FREE_SYMBOLS = ['SPY', 'GLD', 'QQQ'];
    var FREE_DATE_MIN = '2025-03-01';
    var FREE_DATE_MAX = '2026-03-31';
    var FREE_MAX_DTE = 3;

    var STANDARD_DATE_MIN = '2023-03-01';
    var STANDARD_DATE_MAX = '2026-03-31';
    var STANDARD_MAX_DTE = 10;

    var INDEX_SYMBOLS = ['^DJI', '^GSPC', '^IXIC', '^RUT', '^VIX', 'DIA', 'IWM', 'UVXY', 'VXX', 'VIXY'];

    function setTier(tier) {
        _tier = tier || 'free';
    }

    function getTier() {
        return _tier;
    }

    function isFree() { return _tier === 'free'; }
    function isStandard() { return _tier === 'standard'; }
    function isPremium() { return _tier === 'premium'; }

    function isSymbolAllowed(symbol) {
        var s = (symbol || '').toUpperCase().trim();
        if (isPremium()) return true;
        if (isFree()) return FREE_SYMBOLS.indexOf(s) >= 0;
        if (isStandard()) {
            if (s.charAt(0) === '^' || INDEX_SYMBOLS.indexOf(s) >= 0) return false;
            var forexPrefixes = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];
            for (var i = 0; i < forexPrefixes.length; i++) {
                if (s.indexOf(forexPrefixes[i]) === 0 && s.length === 6) return false;
            }
            if (s.indexOf('/') >= 0) return false;
            return true;
        }
        return FREE_SYMBOLS.indexOf(s) >= 0;
    }

    function getSymbolError(symbol) {
        var s = (symbol || '').toUpperCase().trim();
        if (isPremium()) return null;
        if (isFree() && FREE_SYMBOLS.indexOf(s) < 0) {
            return 'Free plan only supports: ' + FREE_SYMBOLS.join(', ') + '. Upgrade for more symbols.';
        }
        if (isStandard()) {
            if (s.charAt(0) === '^' || INDEX_SYMBOLS.indexOf(s) >= 0)
                return 'Index symbols require a Premium plan.';
            var forexPrefixes = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];
            for (var i = 0; i < forexPrefixes.length; i++) {
                if (s.indexOf(forexPrefixes[i]) === 0 && s.length === 6)
                    return 'Forex symbols require a Premium plan.';
            }
            if (s.indexOf('/') >= 0) return 'Forex symbols require a Premium plan.';
        }
        return null;
    }

    function getDateMin() {
        if (isPremium()) return null;
        if (isStandard()) return STANDARD_DATE_MIN;
        return FREE_DATE_MIN;
    }

    function getDateMax() {
        if (isPremium()) return null;
        if (isStandard()) return STANDARD_DATE_MAX;
        return FREE_DATE_MAX;
    }

    function isDateAllowed(dateStr) {
        if (isPremium()) return true;
        var min = getDateMin();
        var max = getDateMax();
        if (min && dateStr < min) return false;
        if (max && dateStr > max) return false;
        return true;
    }

    function getMaxDTE() {
        if (isPremium()) return null;
        if (isStandard()) return STANDARD_MAX_DTE;
        return FREE_MAX_DTE;
    }

    function canUseCustomBuilder() {
        return !isFree();
    }

    function canUseMultipleSymbols() {
        return !isFree();
    }

    function canUseCsvUpload() {
        return !isFree();
    }

    function canUseNotifications() {
        return !isFree();
    }

    function canDownloadCsv() {
        return !isFree();
    }

    function canSaveFilters() {
        return !isFree();
    }

    function canExportScreener() {
        return !isFree();
    }

    function showUpgradeMessage(message) {
        if (typeof appAlert === 'function') {
            appAlert(message || 'This feature requires an upgraded plan.');
        } else {
            alert(message || 'This feature requires an upgraded plan.');
        }
    }

    function applyDateConstraints(startInput, endInput) {
        var min = getDateMin();
        var max = getDateMax();
        if (startInput) {
            if (min) startInput.setAttribute('min', min);
            else startInput.removeAttribute('min');
            if (max) startInput.setAttribute('max', max);
            else startInput.removeAttribute('max');
        }
        if (endInput) {
            if (min) endInput.setAttribute('min', min);
            else endInput.removeAttribute('min');
            if (max) endInput.setAttribute('max', max);
            else endInput.removeAttribute('max');
        }
    }

    function enforceDTEMax(dteInput) {
        var maxDTE = getMaxDTE();
        if (dteInput && maxDTE !== null) {
            dteInput.setAttribute('max', maxDTE);
            if (parseInt(dteInput.value) > maxDTE) {
                dteInput.value = maxDTE;
            }
        } else if (dteInput) {
            dteInput.removeAttribute('max');
        }
    }

    function disableElement(el, tooltip) {
        if (!el) return;
        el.disabled = true;
        el.classList.add('tier-disabled');
        el.style.opacity = '0.5';
        el.style.pointerEvents = 'none';
        if (tooltip) el.title = tooltip;
    }

    function enableElement(el) {
        if (!el) return;
        el.disabled = false;
        el.classList.remove('tier-disabled');
        el.style.opacity = '';
        el.style.pointerEvents = '';
        el.title = '';
    }

    return {
        setTier: setTier,
        getTier: getTier,
        isFree: isFree,
        isStandard: isStandard,
        isPremium: isPremium,
        isSymbolAllowed: isSymbolAllowed,
        getSymbolError: getSymbolError,
        getDateMin: getDateMin,
        getDateMax: getDateMax,
        isDateAllowed: isDateAllowed,
        getMaxDTE: getMaxDTE,
        canUseCustomBuilder: canUseCustomBuilder,
        canUseMultipleSymbols: canUseMultipleSymbols,
        canUseCsvUpload: canUseCsvUpload,
        canUseNotifications: canUseNotifications,
        canDownloadCsv: canDownloadCsv,
        canSaveFilters: canSaveFilters,
        canExportScreener: canExportScreener,
        showUpgradeMessage: showUpgradeMessage,
        applyDateConstraints: applyDateConstraints,
        enforceDTEMax: enforceDTEMax,
        disableElement: disableElement,
        enableElement: enableElement,
        FREE_SYMBOLS: FREE_SYMBOLS,
    };
})();
