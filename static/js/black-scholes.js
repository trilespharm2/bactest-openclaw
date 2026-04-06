(function(global) {
    'use strict';

    function normCDF(x) {
        var a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
        var a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
        var sign = x < 0 ? -1 : 1;
        x = Math.abs(x) / Math.SQRT2;
        var t = 1.0 / (1.0 + p * x);
        var y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        return 0.5 * (1.0 + sign * y);
    }

    function normPDF(x) {
        return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
    }

    function bsPrice(S, K, T, r, q, sigma, optType) {
        if (T <= 1e-10) {
            return optType === 'call' ? Math.max(0, S - K) : Math.max(0, K - S);
        }
        var sqrtT = Math.sqrt(T);
        var d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
        var d2 = d1 - sigma * sqrtT;
        if (optType === 'call') {
            return S * Math.exp(-q * T) * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
        }
        return K * Math.exp(-r * T) * normCDF(-d2) - S * Math.exp(-q * T) * normCDF(-d1);
    }

    function impliedVolatility(S, K, T, r, q, marketPrice, optType) {
        if (T <= 1e-10 || marketPrice <= 0) return null;
        var intrinsic = optType === 'call' ? Math.max(0, S * Math.exp(-q * T) - K * Math.exp(-r * T)) : Math.max(0, K * Math.exp(-r * T) - S * Math.exp(-q * T));
        if (marketPrice < intrinsic * 0.5) return null;
        var bestSigma = null, bestErr = Infinity;
        var seeds = [0.3, 0.5, 0.15, 0.8, 1.2, 0.05, 2.0];
        for (var s = 0; s < seeds.length; s++) {
            var sigma = seeds[s];
            for (var i = 0; i < 100; i++) {
                var price = bsPrice(S, K, T, r, q, sigma, optType);
                var sqrtT = Math.sqrt(T);
                var d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
                var vega = S * Math.exp(-q * T) * normPDF(d1) * sqrtT;
                if (Math.abs(vega) < 1e-10) break;
                var diff = marketPrice - price;
                if (Math.abs(diff) < 1e-6) return sigma;
                sigma = sigma + diff / vega;
                sigma = Math.max(0.001, Math.min(sigma, 5.0));
            }
            var finalPrice = bsPrice(S, K, T, r, q, sigma, optType);
            var err = Math.abs(finalPrice - marketPrice);
            if (err < bestErr) { bestErr = err; bestSigma = sigma; }
            if (err < 0.01) return sigma;
        }
        if (bestSigma != null && bestErr < marketPrice * 0.1) return bestSigma;
        var lo = 0.001, hi = 5.0;
        for (var j = 0; j < 100; j++) {
            var mid = (lo + hi) / 2;
            var p = bsPrice(S, K, T, r, q, mid, optType);
            if (Math.abs(p - marketPrice) < 1e-4) return mid;
            if (p < marketPrice) lo = mid; else hi = mid;
        }
        var bisectPrice = bsPrice(S, K, T, r, q, (lo + hi) / 2, optType);
        if (Math.abs(bisectPrice - marketPrice) < marketPrice * 0.1) return (lo + hi) / 2;
        return bestSigma;
    }

    function calculateGreeks(S, K, T, r, q, sigma, optType) {
        if (sigma == null || sigma <= 0) {
            return { iv: null, delta: null, gamma: null, vega: null, theta: null };
        }
        if (T <= 1e-10) {
            var delta = optType === 'call' ? (S > K ? 1.0 : 0.0) : (S < K ? -1.0 : 0.0);
            return { iv: sigma, delta: delta, gamma: 0, vega: 0, theta: 0 };
        }
        var sqrtT = Math.sqrt(T);
        var d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
        var d2 = d1 - sigma * sqrtT;
        var expQT = Math.exp(-q * T);
        var expRT = Math.exp(-r * T);
        var nd1 = normPDF(d1);

        var delta, theta;
        if (optType === 'call') {
            delta = expQT * normCDF(d1);
            theta = (-S * expQT * nd1 * sigma / (2 * sqrtT))
                  - r * K * expRT * normCDF(d2)
                  + q * S * expQT * normCDF(d1);
        } else {
            delta = -expQT * normCDF(-d1);
            theta = (-S * expQT * nd1 * sigma / (2 * sqrtT))
                  + r * K * expRT * normCDF(-d2)
                  - q * S * expQT * normCDF(-d1);
        }
        theta = theta / 365;

        var gamma = (expQT * nd1) / (S * sigma * sqrtT);
        var vega = S * expQT * nd1 * sqrtT / 100;

        return { iv: sigma, delta: delta, gamma: gamma, vega: vega, theta: theta };
    }

    function toETMillis(year, month, day, hour, min) {
        var testDate = new Date(year, month - 1, day);
        var marSecondSun = new Date(year, 2, 8 + (7 - new Date(year, 2, 8).getDay()) % 7);
        var novFirstSun = new Date(year, 10, 1 + (7 - new Date(year, 10, 1).getDay()) % 7);
        var isDST = testDate >= marSecondSun && testDate < novFirstSun;
        var etOffsetHours = isDST ? -4 : -5;
        var utcMs = Date.UTC(year, month - 1, day, hour - etOffsetHours, min, 0);
        return utcMs;
    }

    function computeLegGreeks(underlyingPrice, strike, optionType, optionPrice, entryTimestamp, expirationDateStr) {
        if (!underlyingPrice || !strike || !optionPrice || !expirationDateStr) return null;
        var entryMs = typeof entryTimestamp === 'number' ? entryTimestamp : new Date(entryTimestamp).getTime();
        var expParts = expirationDateStr.split('-');
        var expYear = parseInt(expParts[0]), expMonth = parseInt(expParts[1]), expDay = parseInt(expParts[2]);
        var expMs = toETMillis(expYear, expMonth, expDay, 16, 0);
        var diffMs = expMs - entryMs;
        var T = Math.max(diffMs / (365.25 * 24 * 3600 * 1000), 1e-10);
        var r = 0.045;
        var q = 0.013;
        var type = (optionType || '').toLowerCase() === 'put' ? 'put' : 'call';
        var iv = impliedVolatility(underlyingPrice, strike, T, r, q, optionPrice, type);
        if (iv == null) return null;
        return calculateGreeks(underlyingPrice, strike, T, r, q, iv, type);
    }

    global.BlackScholes = {
        price: bsPrice,
        impliedVolatility: impliedVolatility,
        greeks: calculateGreeks,
        computeLegGreeks: computeLegGreeks
    };
})(window);
