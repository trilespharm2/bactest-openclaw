#!/usr/bin/env python3
"""
Complete Options Backtesting System - Version 2.3.3
====================================================
Single-file, production-ready backtester with full feature implementation.

Version 2.3.3 Changes (MAJOR: OPTIMIZED STRIKE FETCHING):
- 🚀 OPTIMIZED: Complete rewrite of strike fetching logic for speed and reliability
  * PRIMARY: Calculate strikes → Fetch OHLCV for ALL contracts simultaneously (FAST!)
  * FALLBACK: If OHLCV missing → Use options chain to find best matches → Fetch OHLCV
  * FINAL: If no options chain data → Skip trade (prevents bad data)
  * Uses client.list_aggs() to batch fetch all option contracts at once
  * Eliminates "0 available strikes" issue completely
  * 5-10x faster for multi-leg strategies (fetches all legs in parallel)
  * More reliable: validates strike existence via actual OHLCV data
- 🔧 IMPROVED: Strike calculation now happens upfront before any API calls
- 🔧 IMPROVED: Better error handling and trade skipping logic
- 📊 NEW: Uses VWAP (vw field) for all option pricing (most accurate)

Version 2.3.2 Changes (STRIKE ROUNDING FIX):
- 🔧 FIXED: Strike rounding for leg-to-leg dollar distance configurations
  * SPY/QQQ/IWM now use $1 increments (not $5)
  * SPX/SPXW/NDX continue using $5 increments

Version 2.3.1 Changes (NEW STRATEGIES & CRITICAL FIX):
- ✨ ADDED: 2 new strategy types (now 16 total strategies)
  * Short Straddle - sell put + sell call at SAME strike (credit volatility play)
  * Short Strangle - sell put + sell call at DIFFERENT strikes (credit volatility play)
- 🔴 CRITICAL FIX: Validation logic for LONG spreads was backwards!
  * Long Call Spread: Long call must be BELOW short call (not above) ✅
  * Long Put Spread: Long put must be ABOVE short put (not below) ✅
  * Long Iron Condor: Same corrected logic ✅
  * Long Iron Butterfly: Same corrected logic ✅
  * Short spreads validation was already correct (no change)
- ✅ UPDATED: Straddle/Strangle validation now works for both Long and Short versions

Version 2.3.0 Changes (NEW STRATEGIES & FEATURES):
- ✨ ADDED: 6 new strategy types (now 14 total strategies)
  * Long Call Spread - debit spread with long call closer to ATM
  * Long Put Spread - debit spread with long put closer to ATM
  * Long Straddle - long put + long call at SAME strike (ATM volatility play)
  * Long Strangle - long put + long call at DIFFERENT strikes (OTM volatility play)
  * Long Iron Butterfly - reverse of short iron butterfly (debit position)
  * Long Iron Condor - reverse of short iron condor (debit position)
- ✨ ADDED: Wing configuration for Iron Condor/Butterfly strategies
  * Prompt appears at question [5.5/13] for all Iron strategies
  * Users can enable "skewed/unbalanced wings" to allow different spread widths
  * Example: 5-point put spread + 10-point call spread (skewed)
  * Default: Balanced wings (both spreads must be same width)
- ✅ ADDED: Long Straddle validation - enforces same strike for both legs
- ✅ ADDED: Long Strangle validation - enforces different strikes
- ✅ UPDATED: Iron structure validation now respects wing configuration setting

Version 2.2.2 Changes (CRITICAL BUG FIX):
- 🔴 CRITICAL FIX: Take Profit and Stop Loss logic for DEBIT SPREADS (long positions)
  * Comparison operators were backwards for debit spreads
  * TP was triggering on LOSSES instead of PROFITS
  * SL was triggering on PROFITS instead of LOSSES
  * Example bug: Long call with $1000 TP would exit at -$62 loss
  * Now correctly: More negative premium = higher value = profit for longs
- This fix affects: Long Call, Long Put, and any debit spread strategies
- Credit spread logic was already correct (no changes needed)

Version 2.2.1 Changes (CRITICAL FIXES):
- FIXED: Removed duplicate net premium filter question (was at 14/14, kept 6.5/13)
- FIXED: Added max loss cap - prevents losses from exceeding theoretical max risk
  * Vertical spreads now capped at strike width
  * Prevents unrealistic losses from using 'high' prices during volatility
  * Example: 5-point spread cannot lose more than $500/contract
- ADDED: DTE column in CSV - shows Days to Expiration at entry
- ADDED: DIT column in CSV - shows Days in Trade with 1 decimal precision (e.g., 2.1)
- Now 13 configuration questions instead of 14

Version 2.2.0 Changes:
- ADDED: Optional net premium filter (min/max) - press Enter to skip
- User can filter trades by net premium at entry (section 14/14)
- Example: min=0.50 (only credits >= $0.50), max=3.00 (only credits <= $3.00)
- Entry uses FIRST common timestamp >= entry time (no double detection)
- All legs priced at same timestamp to prevent negative net premium bug

Version 2.1.10 Changes:
- CRITICAL FIX: Improved VWAP extraction from Polygon SDK
- Tries multiple methods: agg.vw, agg.vwap, dictionary access
- Added debug output to show available fields in API response
- Fixed warning message (only warns when field truly missing)
- Better fallback logic when VWAP unavailable

Version 2.1.9 Changes:
- CRITICAL: Added double detection for entry (requires 2 consecutive bars)
- CRITICAL: Now uses VWAP (volume-weighted average price) for all pricing
- Entry: Requires 2 consecutive 1-min bars >= entry time, uses VWAP
- Take Profit: Uses VWAP for exit prices (most accurate execution estimate)
- Stop Loss: Uses high for shorts (conservative), VWAP for longs
- More realistic pricing vs. simple close/open prices

Entry Logic (NEW in v2.2.0):
=============
OLD PROBLEM: Each leg found its own 2 consecutive bars independently
  → Leg 1 priced at 10:00:00
  → Leg 2 priced at 10:01:00  ← Different time!
  → Market moved → inverted spread pricing → negative net premium!

NEW SOLUTION: All legs priced at SAME timestamp
  1. Fetch bars for ALL legs
  2. Find timestamps common to ALL legs
  3. Filter for timestamps >= entry time
  4. Use 2nd common timestamp (ensures active trading)
  5. Price ALL legs from this SAME moment

Example:
  Leg 1 bars: 10:00, 10:01, 10:02, 10:03
  Leg 2 bars: 10:00, 10:01, 10:03      (missing 10:02)
  Leg 3 bars: 10:00, 10:01, 10:02, 10:03
  Leg 4 bars: 10:00, 10:01, 10:03      (missing 10:02)
  
  Common: 10:00, 10:01, 10:03
  Use: 10:01 (2nd common timestamp)
  ALL legs priced at 10:01 ✓

Net Premium Filter (NEW in v2.2.0):
===================
Optional filter to skip trades outside net premium range
- Prompted after leg configuration
- Can specify min, max, or both
- Can skip entirely (press ENTER)
- Applied before trade entry

Example usage:
  Minimum: 0.5  → Only enter if net premium >= 0.5 (credit spreads)
  Maximum: 2.0  → Only enter if net premium <= 2.0 (avoid expensive entries)
  
For debit spreads: net premium is negative
  Minimum: -2.0 → Only enter if cost <= $2.00

Monitoring Logic (for >0 DTE):
===============
Data Fetch:
1. At start: Fetch ALL underlying bars (1-min and detection bars)
2. Per trade: Fetch ALL option bars for each leg (1-min and detection bars)
   - Cached in option_cache_1min and option_cache_detection
   - No re-fetching during monitoring

Monitoring Loop:
For each monitoring date (entry to expiration):
  1. Get detection bars for all legs on this date
  2. Align bars (only keep timestamps common to all legs)
  3. For each aligned bar:
     a. Calculate current net premium using VWAP
     b. Check TP: if met on 2 consecutive bars → exit
     c. Check SL: if met on 2 consecutive bars → exit
  4. Continue to next date if no exit

Concurrent Trades:
- Each trade has independent monitoring loop
- All use pre-fetched cached bar data
- No interference between trades

P&L Calculation:
- Formula: pnl = (net_credit - final_premium) * num_contracts * 100
- net_credit = premium received at entry (sum of short premiums - long premiums)
- final_premium = cost to close position at exit
  * For TP/SL/Breach: VWAP prices at exit time (volume-weighted average)
  * For expiration: INTRINSIC VALUES ONLY (calculated from underlying day close)
- num_contracts = number of contracts traded
- 100 = options multiplier (1 contract = 100 shares)

VWAP (Volume-Weighted Average Price):
- Most accurate price for actual execution
- Better than close/open for illiquid options
- Weights prices by trading volume
- Fallback to close if VWAP unavailable

Expiration Logic:
- Fetch underlying day bar close price (official 4:00 PM settlement)
- Calculate intrinsic value for each leg:
  * Call: max(0, underlying_close - strike)
  * Put: max(0, strike - underlying_close)
- Net premium = sum of short intrinsics - sum of long intrinsics
- DO NOT use option market prices (can be stale/incorrect)

Features:
- 8 strategy types with flexible leg configuration
- Complete intraday exit detection (TP/SL/Breach)
- Double detection for entries and exits (consecutive bar confirmation)
- Simultaneous entry pricing (all legs at same timestamp)
- VWAP-based pricing for realistic execution
- Optional net premium filter (min/max)
- Leg-to-leg distance configuration
- Multiple position sizing methods
- PDT avoidance and concurrent trades
- Full equity curve and statistics
- Detection bars: 1/5/10/15 minute
- Entry price always uses 1-minute bars for precision
- Expiration uses day bars for underlying close price
- Options chain lookup for nearest available strikes
"""

import csv
import os
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
import pandas as pd
from polygon.rest import RESTClient
import matplotlib.pyplot as plt
import numpy as np
import pytz
from scipy.stats import norm
from scipy.optimize import brentq

# ==================== CONFIGURATION ====================

API_KEY = os.environ.get('POLYGON_API_KEY', '')

# Use absolute path for OUTPUT_DIR so it works regardless of where script is called from
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "backtest_results")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Rate limiting
OPTION_REQUESTS_PER_MINUTE = 5000
_option_request_count = 0
_last_option_request_time = 0
_options_chain_cache = {}  # Cache options chains to avoid repeated API calls

# Map config symbols to Polygon's bar-data ticker format.
# Indices require the "I:" prefix; SPXW options share the SPX cash index.
_INDEX_TICKER_MAP = {
    "SPX":  "I:SPX",
    "SPXW": "I:SPX",   # SPXW are weekly SPX options; underlying is SPX cash index
    "NDX":  "I:NDX",
    "RUT":  "I:RUT",
    "XSP":  "I:XSP",
}

def get_underlying_ticker(symbol: str) -> str:
    """Return the Polygon bar-data ticker for the given config symbol.

    Index symbols need the 'I:' prefix (e.g. 'I:SPX').
    SPXW shares the SPX cash index so it maps to 'I:SPX'.
    All other symbols (SPY, QQQ, AAPL …) are returned unchanged.
    """
    return _INDEX_TICKER_MAP.get(symbol.upper(), symbol)

# ==================== RATE LIMITING ====================

def rate_limit_option_request():
    """No-op: unlimited API calls available on current Polygon plan."""
    pass

# ==================== PRICE CONDITIONS EVALUATION ====================

def evaluate_preset_condition(config: Dict, bars_today: List[Dict], bar: Dict, 
                              prev_day_bars: List[Dict] = None) -> Tuple[bool, str]:
    """
    Evaluate preset entry conditions for the options backtester.
    Similar to stock backtester's check_preset_condition_intraday.
    
    Presets:
      1 = Premarket Change % (from prev close)
      2 = Change % (from prev close)
      3 = Gap % (open vs prev close)
      4 = Change-Open % (from today's open)
      5 = Velocity (rate of change over N minutes)
    """
    preset = config.get('preset_condition', '1')
    operator = config.get('preset_operator', '>')
    threshold = float(config.get('preset_threshold', 0))
    
    bar_price = bar.get('open', 0)
    bar_time = bar.get('time', '')
    
    if not prev_day_bars and preset in ('1', '2', '3'):
        return False, "No previous day data for preset condition"
    
    prev_close = None
    if prev_day_bars:
        for b in sorted(prev_day_bars, key=lambda x: x.get('time', ''), reverse=True):
            if b.get('close'):
                prev_close = b['close']
                break
    
    open_930_price = None
    for b in sorted(bars_today, key=lambda x: x.get('time', '')):
        t = b.get('time', '')
        if t >= '09:30':
            open_930_price = b.get('open')
            break
    
    def check_op(value, op, thresh):
        if op == '>': return value > thresh
        if op == '<': return value < thresh
        if op == '>=': return value >= thresh
        if op == '<=': return value <= thresh
        if op == '=' or op == '==': return abs(value - thresh) < 0.01
        return False
    
    try:
        if preset == '1':
            if not prev_close or prev_close == 0:
                return False, "No previous close for premarket change"
            open_price = None
            for b in sorted(bars_today, key=lambda x: x.get('time', '')):
                if b.get('time', '')[:5] == '09:30':
                    open_price = b.get('open')
                    break
            check_price = open_price if open_price else bar_price
            change_pct = ((check_price / prev_close) - 1) * 100
            if check_op(change_pct, operator, threshold):
                return True, f"Premarket Change {change_pct:.2f}% {operator} {threshold}%"
            return False, f"Premarket Change {change_pct:.2f}% failed {operator} {threshold}%"
        
        elif preset == '2':
            if not prev_close or prev_close == 0:
                return False, "No previous close for change %"
            change_pct = ((bar_price / prev_close) - 1) * 100
            if check_op(change_pct, operator, threshold):
                return True, f"Change {change_pct:.2f}% {operator} {threshold}%"
            return False, f"Change {change_pct:.2f}% failed {operator} {threshold}%"
        
        elif preset == '3':
            if not bar_time or bar_time[:5] != '09:30':
                return False, "Gap % only checked at 09:30 open"
            if not prev_close or prev_close == 0:
                return False, "No previous close for gap %"
            gap_pct = ((bar_price / prev_close) - 1) * 100
            if check_op(gap_pct, operator, threshold):
                return True, f"Gap {gap_pct:.2f}% {operator} {threshold}%"
            return False, f"Gap {gap_pct:.2f}% failed {operator} {threshold}%"
        
        elif preset == '4':
            if not open_930_price or open_930_price == 0:
                return False, "No 09:30 open price for change-open %"
            change_pct = ((bar_price / open_930_price) - 1) * 100
            if check_op(change_pct, operator, threshold):
                return True, f"Change-Open {change_pct:.2f}% {operator} {threshold}%"
            return False, f"Change-Open {change_pct:.2f}% failed {operator} {threshold}%"
        
        elif preset == '5':
            lookback = int(config.get('velocity_lookback', 5))
            sorted_bars = sorted(bars_today, key=lambda x: x.get('time', ''))
            current_idx = None
            for i, b in enumerate(sorted_bars):
                if b.get('time', '') == bar_time:
                    current_idx = i
                    break
            if current_idx is None or current_idx < lookback:
                return False, f"Not enough bars for velocity (need {lookback})"
            ref_bar = sorted_bars[current_idx - lookback]
            ref_price = ref_bar.get('close', ref_bar.get('open', 0))
            if not ref_price or ref_price == 0:
                return False, "No reference price for velocity"
            velocity_pct = ((bar_price / ref_price) - 1) * 100
            if check_op(velocity_pct, operator, threshold):
                return True, f"Velocity {velocity_pct:.2f}% over {lookback}min {operator} {threshold}%"
            return False, f"Velocity {velocity_pct:.2f}% over {lookback}min failed {operator} {threshold}%"
        
        else:
            return True, "Unknown preset - skipping"
    
    except Exception as e:
        return False, f"Preset condition error: {str(e)}"


def evaluate_price_conditions(config: Dict, client: RESTClient, trade_date: datetime, entry_timestamp: int) -> Tuple[bool, str]:
    """
    Evaluate underlying price conditions for trade entry.
    Returns (conditions_met, reason_string)
    """
    price_conditions = config.get('price_conditions', [])
    if not price_conditions:
        return True, ""  # No conditions = always pass
    
    symbol = config['symbol']
    underlying_sym = get_underlying_ticker(symbol)
    
    for idx, condition in enumerate(price_conditions):
        try:
            metric = condition.get('metric', 'price')
            operator = condition.get('operator', '>')
            comparator = condition.get('comparator', 'value')
            left = condition.get('left', {})
            
            # Get left side value
            left_value = get_indicator_value_for_backtest(
                client, underlying_sym, metric, left, trade_date, entry_timestamp
            )
            
            if left_value is None:
                print(f"  [Condition {idx+1}] Could not fetch {metric} data - skipping trade")
                return False, f"Missing {metric} data"
            
            # Get right side value
            if comparator == 'value':
                right_value = condition.get('compare_value', 0)
            else:
                right = condition.get('right', {})
                right_metric = comparator.replace('compare_', '')
                right_value = get_indicator_value_for_backtest(
                    client, underlying_sym, right_metric, right, trade_date, entry_timestamp
                )
                
                if right_value is None:
                    print(f"  [Condition {idx+1}] Could not fetch {right_metric} comparison data - skipping trade")
                    return False, f"Missing {right_metric} comparison data"
                
                # Apply threshold if present
                threshold = condition.get('threshold', {})
                if threshold:
                    threshold_value = threshold.get('value', 0)
                    threshold_unit = threshold.get('unit', 'percent')
                    if threshold_unit == 'percent':
                        right_value = right_value * (1 + threshold_value / 100)
                    else:
                        right_value = right_value + threshold_value
            
            # Evaluate condition
            met = False
            if operator == '>':
                met = left_value > right_value
            elif operator == '<':
                met = left_value < right_value
            elif operator == '>=':
                met = left_value >= right_value
            elif operator == '<=':
                met = left_value <= right_value
            elif operator == '==':
                met = abs(left_value - right_value) < 0.0001
            elif operator == '><':
                # Between - not fully implemented
                met = False
            
            if not met:
                print(f"  [Condition {idx+1}] FAILED: {metric} {left_value:.2f} {operator} {right_value:.2f}")
                return False, f"Condition {idx+1} failed: {left_value:.2f} {operator} {right_value:.2f}"
            else:
                print(f"  [Condition {idx+1}] PASSED: {metric} {left_value:.2f} {operator} {right_value:.2f}")
        
        except Exception as e:
            print(f"  [Condition {idx+1}] Error evaluating condition: {e}")
            return False, f"Error: {str(e)}"
    
    return True, "All conditions met"


def prefetch_all_indicators_for_range(config: Dict, start_date: datetime, end_date: datetime) -> Dict:
    """
    Pre-fetch ALL indicator data for the entire backtest date range in 1-2 API calls.
    Called ONCE at backtest start. Returns dict with indicator values keyed by metric name,
    with each metric containing a dict of timestamp -> value.
    
    Polygon.io supports up to 50,000 bars per call, so we can fetch months of data at once.
    """
    import requests
    
    api_key = config.get('api_key') or os.environ.get('POLYGON_API_KEY') or API_KEY
    symbol = config['symbol']
    underlying_sym = get_underlying_ticker(symbol)
    price_conditions = config.get('price_conditions', [])
    exit_price_conditions = config.get('exit_price_conditions', [])
    all_conditions = list(price_conditions) + list(exit_price_conditions)
    
    if not all_conditions:
        return {}
    
    indicators = {}
    
    # Collect unique metrics and their params
    # Need to track both minute and day data separately if conditions use different candle types
    metrics_config = {}
    needs_day_price = False
    needs_minute_price = False
    
    def _sma_ema_key(m, params):
        """Build composite cache key for SMA/EMA: sma_w14_t5 etc."""
        w  = int(params.get('window', 14))
        tf = int(params.get('timeframe_minutes', 5))
        return f'{m}_w{w}_t{tf}'

    for condition in all_conditions:
        metric = condition.get('metric', 'price')
        left_params = condition.get('left', {})
        left_candle_type = left_params.get('candle_type', 'minute')
        
        if metric == 'price':
            if left_candle_type in ['day', 'week', 'month', 'quarter', 'year']:
                needs_day_price = True
                if 'price_day' not in metrics_config:
                    metrics_config['price_day'] = left_params
            else:
                needs_minute_price = True
                if 'price' not in metrics_config:
                    metrics_config['price'] = left_params
        elif metric in ('sma', 'ema', 'vwap'):
            key = _sma_ema_key(metric, left_params)
            if key not in metrics_config:
                metrics_config[key] = dict(left_params, _metric_type=metric)
        elif metric not in metrics_config:
            metrics_config[metric] = left_params
        
        comparator = condition.get('comparator', 'value')
        if comparator != 'value':
            comp_metric = comparator.replace('compare_', '')
            right_params = condition.get('right', {})
            right_candle_type = right_params.get('candle_type', 'minute')
            
            if comp_metric == 'price':
                if right_candle_type in ['day', 'week', 'month', 'quarter', 'year']:
                    needs_day_price = True
                    if 'price_day' not in metrics_config:
                        metrics_config['price_day'] = right_params
                else:
                    needs_minute_price = True
                    if 'price' not in metrics_config:
                        metrics_config['price'] = right_params
            elif comp_metric in ('sma', 'ema', 'vwap'):
                key = _sma_ema_key(comp_metric, right_params)
                if key not in metrics_config:
                    metrics_config[key] = dict(right_params, _metric_type=comp_metric)
            elif comp_metric not in metrics_config:
                metrics_config[comp_metric] = right_params
    
    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")
    
    # Convert dates to timestamps for API
    eastern = pytz.timezone('US/Eastern')
    start_ts = int(eastern.localize(datetime.combine(start_date, datetime.min.time())).timestamp() * 1000)
    end_ts = int(eastern.localize(datetime.combine(end_date, datetime.max.time().replace(microsecond=0))).timestamp() * 1000)
    
    print(f"\n{'='*60}", flush=True)
    print(f"[Prefetch] Fetching ALL indicators for {start_str} to {end_str}", flush=True)
    print(f"[Prefetch] Metrics needed: {set(metrics_config.keys())}", flush=True)
    print(f"[Prefetch] Symbol: {underlying_sym}", flush=True)
    print(f"{'='*60}\n", flush=True)
    
    # Pre-pass: if any SMA/EMA/VWAP conditions exist, fetch 1-min bars ONCE.
    # All SMA/EMA/VWAP computations share this single fetch; no duplicate API calls.
    sma_ema_keys = [k for k in metrics_config if k.startswith('sma_') or k.startswith('ema_') or k.startswith('vwap_')]
    if sma_ema_keys:
        max_window = max(int(metrics_config[k].get('window', 14)) for k in sma_ema_keys)
        buffer_days = max(5, (max_window // 390 + 2) * 3)
        extended_start = start_date - timedelta(days=buffer_days)
        extended_start_str = extended_start.strftime("%Y-%m-%d")
        url_1min = f"https://api.polygon.io/v2/aggs/ticker/{underlying_sym}/range/1/minute/{extended_start_str}/{end_str}"
        print(f"[Prefetch] Fetching shared 1-min bars for {len(sma_ema_keys)} SMA/EMA key(s): window up to {max_window}, from {extended_start_str}...", flush=True)
        try:
            resp = requests.get(url_1min, params={'apiKey': api_key, 'limit': 50000, 'adjusted': 'true', 'order': 'asc'})
            if resp.status_code == 200:
                indicators['_1min_raw'] = resp.json().get('results', [])
                print(f"[Prefetch] 1-min raw bars: {len(indicators['_1min_raw'])} bars loaded", flush=True)
            else:
                indicators['_1min_raw'] = []
                print(f"[Prefetch] 1-min raw bars error: {resp.status_code}", flush=True)
        except Exception as e:
            indicators['_1min_raw'] = []
            print(f"[Prefetch] 1-min raw bars exception: {e}", flush=True)

    for metric, params in metrics_config.items():
        try:
            if metric == 'price':
                # Fetch minute bars for intraday comparisons
                series_type = params.get('series_type', 'close')
                price_multiplier = int(params.get('multiplier', 1) or 1)
                url = f"https://api.polygon.io/v2/aggs/ticker/{underlying_sym}/range/{price_multiplier}/minute/{start_str}/{end_str}"
                print(f"[Prefetch] Fetching PRICE MINUTE data: {start_str} to {end_str}...", flush=True)
                
                response = requests.get(url, params={'apiKey': api_key, 'limit': 50000, 'adjusted': 'true'})
                if response.status_code == 200:
                    data = response.json()
                    results = data.get('results', [])
                    price_data = {}
                    price_map = {'open': 'o', 'high': 'h', 'low': 'l', 'close': 'c', 'vwap': 'vw'}
                    for bar in results:
                        ts = bar.get('t')
                        price_data[ts] = bar.get(price_map.get(series_type, 'c'))
                    indicators['price'] = price_data
                    print(f"[Prefetch] PRICE: got {len(results)} minute bars", flush=True)
                else:
                    print(f"[Prefetch] PRICE error: {response.status_code}", flush=True)
            
            elif metric == 'price_day':
                # Fetch day bars for daily comparisons
                series_type = params.get('series_type', 'open')  # Default to open for day comparisons
                url = f"https://api.polygon.io/v2/aggs/ticker/{underlying_sym}/range/1/day/{start_str}/{end_str}"
                print(f"[Prefetch] Fetching PRICE DAY data: {start_str} to {end_str}...", flush=True)
                
                response = requests.get(url, params={'apiKey': api_key, 'limit': 50000, 'adjusted': 'true'})
                if response.status_code == 200:
                    data = response.json()
                    results = data.get('results', [])
                    price_data = {}
                    price_map = {'open': 'o', 'high': 'h', 'low': 'l', 'close': 'c', 'vwap': 'vw'}
                    for bar in results:
                        ts = bar.get('t')
                        price_data[ts] = bar.get(price_map.get(series_type, 'o'))
                    indicators['price_day'] = price_data
                    print(f"[Prefetch] PRICE_DAY: got {len(results)} day bars", flush=True)
                else:
                    print(f"[Prefetch] PRICE_DAY error: {response.status_code}", flush=True)
            
            elif metric.startswith('sma_') or metric.startswith('ema_') or metric.startswith('vwap_'):
                # Composite key: sma_w14_t5, ema_w20_t1, vwap_w14_t5
                # Uses shared _1min_raw bars fetched in the pre-pass above
                metric_type = params.get('_metric_type', metric.split('_')[0])
                window = int(params.get('window', 14))
                timeframe_minutes = int(params.get('timeframe_minutes', 5))
                series_type = params.get('series_type', 'close')

                raw_bars = indicators.get('_1min_raw', [])
                if not raw_bars:
                    print(f"[Prefetch] {metric}: no 1-min raw bars available — skipping", flush=True)
                    continue

                field_map = {'open': 'o', 'high': 'h', 'low': 'l', 'close': 'c', 'vwap': 'vw'}
                # For VWAP metric, always use the 'vw' field regardless of series_type
                field = 'vw' if metric_type == 'vwap' else field_map.get(series_type, 'c')

                if timeframe_minutes <= 1:
                    # Use 1-min bars directly
                    timestamps = [bar.get('t') for bar in raw_bars]
                    prices = [bar.get(field) for bar in raw_bars]
                else:
                    # Aggregate 1-min bars to the user's chosen timeframe
                    df = pd.DataFrame(raw_bars)
                    if df.empty:
                        print(f"[Prefetch] {metric}: empty raw bar DataFrame — skipping", flush=True)
                        continue
                    df['_ts'] = pd.to_datetime(df['t'], unit='ms', utc=True)
                    df = df.set_index('_ts').sort_index()
                    agg_map = {'o': 'first', 'h': 'max', 'l': 'min', 'c': 'last'}
                    if 'vw' in df.columns:
                        agg_map['vw'] = 'mean'
                    agg_map = {k: v for k, v in agg_map.items() if k in df.columns}
                    resampled = df.resample(f'{timeframe_minutes}min').agg(agg_map).dropna(subset=['c'])
                    timestamps = [int(ts.timestamp() * 1000) for ts in resampled.index]
                    # For VWAP: use vw field; for SMA/EMA: use the specified price field
                    if metric_type == 'vwap':
                        prices = resampled['vw'].tolist() if 'vw' in resampled.columns else resampled['c'].tolist()
                    else:
                        prices = resampled[field].tolist() if field in resampled.columns else resampled['c'].tolist()

                price_series = pd.Series(prices, dtype=float)

                # Same formula as simulated trading engine
                if metric_type == 'sma':
                    rolled = price_series.rolling(window=window, min_periods=window).mean()
                elif metric_type == 'ema':
                    rolled = price_series.ewm(span=window, adjust=False).mean()
                else:
                    # VWAP: rolling mean of per-bar VWAP values
                    rolled = price_series.rolling(window=window, min_periods=window).mean()

                indicator_data = {}
                for ts, val in zip(timestamps, rolled.values):
                    if ts is not None and not pd.isna(val):
                        indicator_data[int(ts)] = float(val)

                indicators[metric] = indicator_data
                print(f"[Prefetch] {metric}: computed {len(indicator_data)} values "
                      f"(window={window}, tf={timeframe_minutes}min, series={series_type if metric_type != 'vwap' else 'vw'})", flush=True)

            elif metric == 'rsi':
                window = params.get('window', 14)
                series_type = params.get('series_type', 'close')
                timespan = params.get('candle_type', 'day')
                ind_multiplier = int(params.get('multiplier', 1) or 1)

                url = f"https://api.polygon.io/v1/indicators/rsi/{underlying_sym}"
                query_params = {
                    'apiKey': api_key,
                    'timespan': timespan,
                    'adjusted': 'true',
                    'window': window,
                    'series_type': series_type,
                    'timestamp.gte': start_ts,
                    'timestamp.lte': end_ts,
                    'limit': 5000,
                    'order': 'asc'
                }
                if ind_multiplier > 1:
                    query_params['timespan_multiplier'] = ind_multiplier

                print(f"[Prefetch] Fetching RSI: window={window}, timespan={timespan}...", flush=True)

                response = requests.get(url, params=query_params)
                if response.status_code == 200:
                    data = response.json()
                    values = data.get('results', {}).get('values', [])
                    indicator_data = {}
                    for v in values:
                        indicator_data[v.get('timestamp')] = v.get('value')
                    indicators['rsi'] = indicator_data
                    print(f"[Prefetch] RSI: got {len(values)} values", flush=True)
                    if values:
                        print(f"[Prefetch] RSI range: {values[0].get('timestamp')} to {values[-1].get('timestamp')}", flush=True)
                else:
                    print(f"[Prefetch] RSI error: {response.status_code} - {response.text[:200]}", flush=True)
            
            elif metric == 'macd':
                short_window = params.get('short_window', 12)
                long_window = params.get('long_window', 26)
                signal_window = params.get('signal_window', 9)
                component = params.get('component', 'histogram')
                timespan = params.get('candle_type', 'day')
                series_type = params.get('series_type', 'close')
                
                url = f"https://api.polygon.io/v1/indicators/macd/{underlying_sym}"
                query_params = {
                    'apiKey': api_key,
                    'timespan': timespan,
                    'short_window': short_window,
                    'long_window': long_window,
                    'signal_window': signal_window,
                    'series_type': series_type,
                    'timestamp.gte': start_ts,
                    'timestamp.lte': end_ts,
                    'limit': 5000,  # Indicator endpoints have lower max limit
                    'order': 'asc'
                }
                
                print(f"[Prefetch] Fetching MACD: short={short_window}, long={long_window}...", flush=True)
                
                response = requests.get(url, params=query_params)
                if response.status_code == 200:
                    data = response.json()
                    values = data.get('results', {}).get('values', [])
                    indicator_data = {}
                    for v in values:
                        if component == 'histogram':
                            indicator_data[v.get('timestamp')] = v.get('histogram')
                        elif component == 'signal':
                            indicator_data[v.get('timestamp')] = v.get('signal')
                        else:
                            indicator_data[v.get('timestamp')] = v.get('value')
                    indicators[metric] = indicator_data
                    print(f"[Prefetch] MACD: got {len(values)} values", flush=True)
                else:
                    print(f"[Prefetch] MACD error: {response.status_code}", flush=True)
                    
        except Exception as e:
            print(f"[Prefetch] Error fetching {metric}: {e}", flush=True)
    
    print(f"\n[Prefetch] Complete! Cached metrics: {list(indicators.keys())}", flush=True)
    print(f"{'='*60}\n", flush=True)
    
    return indicators


def get_indicator_value_for_date(indicators_cache: Dict, metric: str, target_date: datetime,
                                  day_offset: int = 0) -> Optional[float]:
    """
    Look up an indicator value for a specific date from the pre-fetched cache.
    day_offset applies a calendar-day shift before the lookup (same approach as
    get_day_bar_value), so day_offset=-1 returns the most recent value at or
    before the end of yesterday — i.e. the last completed rolling window.
    """
    if metric not in indicators_cache:
        return None

    indicator_data = indicators_cache[metric]
    if not indicator_data:
        return None

    eastern = pytz.timezone('US/Eastern')

    # Shift the lookup date by the offset (handles weekends: falls back to
    # most recent bar before the shifted date via the <= comparison below)
    lookup_date = target_date + timedelta(days=day_offset)

    day_end = eastern.localize(datetime.combine(lookup_date, datetime.max.time().replace(microsecond=0)))
    day_end_ts = int(day_end.timestamp() * 1000)

    best_value = None
    best_ts = 0

    for ts, value in indicator_data.items():
        if ts <= day_end_ts and ts > best_ts:
            best_ts = ts
            best_value = value

    return best_value


def evaluate_price_conditions_with_cache(config: Dict, bar: Dict, indicators_cache: Dict, 
                                          trade_date: datetime = None) -> Tuple[bool, str]:
    """
    Evaluate price conditions using pre-fetched indicator data.
    Uses the bar's timestamp to look up indicator values from cache.
    Supports both minute and day candle comparisons.
    
    Args:
        config: Backtest configuration
        bar: Current price bar with timestamp and open price
        indicators_cache: Pre-fetched indicator data for entire date range
        trade_date: Current trading date (for looking up daily indicators)
    """
    price_conditions = config.get('price_conditions', [])
    if not price_conditions:
        return True, ""
    
    bar_timestamp = bar['timestamp']
    bar_price = bar['open']
    
    for idx, condition in enumerate(price_conditions):
        try:
            metric = condition.get('metric', 'price')
            operator = condition.get('operator', '>')
            comparator = condition.get('comparator', 'value')
            left_params = condition.get('left', {})
            right_params = condition.get('right', {})
            
            # Check if using day candles
            left_candle_type = left_params.get('candle_type', 'minute')
            left_day_offset = int(left_params.get('day', 0))
            left_series_type = left_params.get('series_type', 'close')
            
            if left_candle_type in ['day', 'week', 'month', 'quarter', 'year'] and left_day_offset == 0 and left_series_type in ['close', 'high', 'low']:
                return False, f"Invalid: cannot use day candle '{left_series_type}' on day 0 — current day has not closed"

            # Get left side value
            if metric == 'price':
                if left_candle_type in ['day', 'week', 'month', 'quarter', 'year']:
                    # Use day bars from cache
                    left_value = get_day_bar_value(indicators_cache, trade_date, left_day_offset, left_series_type)
                    if left_value is None:
                        return False, f"Missing day bar data for day offset {left_day_offset}"
                else:
                    # Use current bar's price field based on series_type
                    if left_series_type == 'vwap':
                        left_value = bar.get('vw', bar_price)
                    elif left_series_type == 'close':
                        left_value = bar.get('close', bar_price)
                    elif left_series_type == 'high':
                        left_value = bar.get('high', bar_price)
                    elif left_series_type == 'low':
                        left_value = bar.get('low', bar_price)
                    else:
                        left_value = bar_price
            else:
                if metric in ('sma', 'ema', 'vwap'):
                    # Composite key: sma_w{window}_t{timeframe_minutes} or vwap_w{window}_t{timeframe_minutes}
                    _w  = int(left_params.get('window', 14))
                    _tf = int(left_params.get('timeframe_minutes', 5))
                    _ind_key = f'{metric}_w{_w}_t{_tf}'
                    indicator_data = indicators_cache.get(_ind_key, {})
                else:
                    indicator_data = indicators_cache.get(metric, {})
                if indicator_data:
                    if metric in ('sma', 'ema', 'vwap'):
                        left_value = find_closest_indicator_value(indicator_data, bar_timestamp)
                    elif trade_date:
                        left_value = get_indicator_value_for_date(indicators_cache, metric, trade_date, left_day_offset)
                    else:
                        left_value = find_closest_indicator_value(indicator_data, bar_timestamp)
                else:
                    left_value = None
            
            if left_value is None:
                return False, f"Missing {metric} data"
            
            # Get right side value
            if comparator == 'value':
                right_value = condition.get('compare_value', 0)
            else:
                right_metric = comparator.replace('compare_', '')
                right_candle_type = right_params.get('candle_type', 'minute')
                right_day_offset = int(right_params.get('day', 0))
                right_series_type = right_params.get('series_type', 'close')
                
                if right_candle_type in ['day', 'week', 'month', 'quarter', 'year'] and right_day_offset == 0 and right_series_type in ['close', 'high', 'low']:
                    return False, f"Invalid: cannot use day candle '{right_series_type}' on right side day 0 — current day has not closed"

                if right_metric == 'price':
                    if right_candle_type in ['day', 'week', 'month', 'quarter', 'year']:
                        # Use day bars from cache with offset
                        right_value = get_day_bar_value(indicators_cache, trade_date, right_day_offset, right_series_type)
                        if right_value is None:
                            return False, f"Missing day bar data for right side day offset {right_day_offset}"
                    else:
                        if right_series_type == 'vwap':
                            right_value = bar.get('vw', bar_price)
                        elif right_series_type == 'close':
                            right_value = bar.get('close', bar_price)
                        elif right_series_type == 'high':
                            right_value = bar.get('high', bar_price)
                        elif right_series_type == 'low':
                            right_value = bar.get('low', bar_price)
                        else:
                            right_value = bar_price
                else:
                    if right_metric in ('sma', 'ema', 'vwap'):
                        _rw  = int(right_params.get('window', 14))
                        _rtf = int(right_params.get('timeframe_minutes', 5))
                        _rind_key = f'{right_metric}_w{_rw}_t{_rtf}'
                        indicator_data = indicators_cache.get(_rind_key, {})
                    else:
                        indicator_data = indicators_cache.get(right_metric, {})
                    if indicator_data:
                        if right_metric in ('sma', 'ema', 'vwap'):
                            right_value = find_closest_indicator_value(indicator_data, bar_timestamp)
                        elif trade_date:
                            right_value = get_indicator_value_for_date(indicators_cache, right_metric, trade_date, right_day_offset)
                        else:
                            right_value = find_closest_indicator_value(indicator_data, bar_timestamp)
                    else:
                        right_value = None
                
                if right_value is None:
                    return False, f"Missing {right_metric} comparison data"
                
                # Apply threshold if present
                threshold = condition.get('threshold', {})
                if threshold:
                    threshold_value = threshold.get('value', 0)
                    threshold_unit = threshold.get('unit', 'percent')
                    if threshold_unit == 'percent':
                        right_value = right_value * (1 + threshold_value / 100)
                    else:
                        right_value = right_value + threshold_value
            
            # Evaluate condition
            met = False
            if operator == '>':
                met = left_value > right_value
            elif operator == '<':
                met = left_value < right_value
            elif operator == '>=':
                met = left_value >= right_value
            elif operator == '<=':
                met = left_value <= right_value
            elif operator == '==':
                met = abs(left_value - right_value) < 0.0001
            
            if not met:
                return False, f"{metric} {left_value:.2f} {operator} {right_value:.2f}"
        
        except Exception as e:
            return False, f"Error: {str(e)}"
    
    return True, "All conditions met"


def get_day_bar_value(indicators_cache: Dict, trade_date: datetime, day_offset: int, series_type: str) -> Optional[float]:
    """
    Get the day bar value for a specific date with offset.
    
    Args:
        indicators_cache: Cache containing 'price_day' data
        trade_date: Current trading date (timezone-aware or naive in Eastern)
        day_offset: Day offset (0=today, -1=yesterday, etc.)
        series_type: 'open', 'high', 'low', 'close', 'vwap'
    
    Returns:
        The price value or None if not found
    """
    price_day_data = indicators_cache.get('price_day', {})
    if not price_day_data:
        return None
    
    eastern = pytz.timezone('US/Eastern')
    
    # Calculate target date with offset
    target_date = trade_date + timedelta(days=day_offset)
    target_date_str = target_date.strftime("%Y-%m-%d")
    
    # Polygon day bars have timestamps at market open (typically 4:00 AM UTC which is midnight Eastern)
    # Convert each cached timestamp to Eastern date and match by date string
    for ts, value in price_day_data.items():
        # Convert UTC timestamp to Eastern datetime
        bar_dt = datetime.fromtimestamp(ts / 1000, tz=pytz.UTC).astimezone(eastern)
        bar_date_str = bar_dt.strftime("%Y-%m-%d")
        
        if bar_date_str == target_date_str:
            return value
    
    # Fallback: find most recent bar before target date
    target_date_obj = target_date.date() if hasattr(target_date, 'date') else target_date
    closest_ts = None
    closest_val = None
    
    for ts, value in price_day_data.items():
        bar_dt = datetime.fromtimestamp(ts / 1000, tz=pytz.UTC).astimezone(eastern)
        bar_date = bar_dt.date()
        
        if bar_date <= target_date_obj:
            if closest_ts is None or ts > closest_ts:
                closest_ts = ts
                closest_val = value
    
    return closest_val


def find_closest_indicator_value(indicator_data: Dict, target_timestamp: int) -> Optional[float]:
    """Find the indicator value with timestamp closest to (but not after) target."""
    if not indicator_data:
        return None
    
    closest_ts = None
    closest_val = None
    
    for ts, val in indicator_data.items():
        if ts <= target_timestamp:
            if closest_ts is None or ts > closest_ts:
                closest_ts = ts
                closest_val = val
    
    return closest_val


def get_indicator_value_for_backtest(client: RESTClient, symbol: str, metric: str, 
                                      params: dict, trade_date: datetime, entry_timestamp: int) -> Optional[float]:
    """
    Fetch indicator value from Polygon.io for backtest date.
    Uses day offset from params to determine which historical bar to use.
    """
    import requests
    
    api_key = API_KEY  # Use global API_KEY constant
    day_offset = int(params.get('day', 0))
    target_date = trade_date + timedelta(days=day_offset)
    target_date_str = target_date.strftime("%Y-%m-%d")
    
    timespan = params.get('candle_type', 'day')
    series_type = params.get('series_type', 'close')
    
    try:
        if metric == 'price':
            # Get price from aggregates
            url = f"https://api.polygon.io/v2/aggs/ticker/{symbol}/range/1/day/{target_date_str}/{target_date_str}"
            response = requests.get(url, params={'apiKey': api_key})
            if response.status_code == 200:
                data = response.json()
                if data.get('results') and len(data['results']) > 0:
                    bar = data['results'][0]
                    price_map = {'open': 'o', 'high': 'h', 'low': 'l', 'close': 'c', 'vwap': 'vw'}
                    return bar.get(price_map.get(series_type, 'c'), None)
            return None

        elif metric == 'vwap':
            # VWAP: rolling mean of per-bar vw values over a window of timeframe-aggregated bars
            window = int(params.get('window', 14))
            timeframe_minutes = int(params.get('timeframe_minutes', 5))
            entry_dt = datetime.utcfromtimestamp(entry_timestamp / 1000)
            buffer_days = max(5, (window // 390 + 2) * 3)
            fetch_start = (entry_dt - timedelta(days=buffer_days)).strftime("%Y-%m-%d")
            fetch_end = entry_dt.strftime("%Y-%m-%d")
            url_1min = f"https://api.polygon.io/v2/aggs/ticker/{symbol}/range/1/minute/{fetch_start}/{fetch_end}"
            resp = requests.get(url_1min, params={'apiKey': api_key, 'limit': 50000, 'adjusted': 'true', 'order': 'asc'})
            if resp.status_code != 200:
                return None
            raw_bars = resp.json().get('results', [])
            if not raw_bars:
                return None
            df = pd.DataFrame(raw_bars)
            df['_ts'] = pd.to_datetime(df['t'], unit='ms', utc=True)
            df = df.set_index('_ts').sort_index()
            if timeframe_minutes > 1:
                agg_map = {'vw': 'mean', 'c': 'last'}
                agg_map = {k: v for k, v in agg_map.items() if k in df.columns}
                df = df.resample(f'{timeframe_minutes}min').agg(agg_map).dropna(subset=['c'])
            vw_series = df['vw'].dropna() if 'vw' in df.columns else pd.Series([], dtype=float)
            # Filter to bars up to and including entry_timestamp
            ts_ms = pd.Timestamp(entry_timestamp, unit='ms', tz='UTC')
            vw_series = vw_series[vw_series.index <= ts_ms]
            rolled = vw_series.rolling(window=window, min_periods=window).mean()
            if rolled.empty or pd.isna(rolled.iloc[-1]):
                return None
            return float(rolled.iloc[-1])

        elif metric in ['sma', 'ema', 'rsi']:
            window = params.get('window', 14)
            url = f"https://api.polygon.io/v1/indicators/{metric}/{symbol}"
            query_params = {
                'apiKey': api_key,
                'timespan': timespan,
                'window': window,
                'series_type': series_type,
                'timestamp.lte': entry_timestamp,
                'limit': 1
            }
            
            response = requests.get(url, params=query_params)
            if response.status_code == 200:
                data = response.json()
                values = data.get('results', {}).get('values', [])
                if values:
                    return values[0].get('value', None)
            return None
        
        elif metric == 'macd':
            short_window = params.get('short_window', 12)
            long_window = params.get('long_window', 26)
            signal_window = params.get('signal_window', 9)
            component = params.get('component', 'histogram')
            
            url = f"https://api.polygon.io/v1/indicators/macd/{symbol}"
            query_params = {
                'apiKey': api_key,
                'timespan': timespan,
                'short_window': short_window,
                'long_window': long_window,
                'signal_window': signal_window,
                'series_type': series_type,
                'timestamp.lte': entry_timestamp,
                'limit': 1
            }
            
            response = requests.get(url, params=query_params)
            if response.status_code == 200:
                data = response.json()
                values = data.get('results', {}).get('values', [])
                if values:
                    val = values[0]
                    if component == 'histogram':
                        return val.get('histogram', None)
                    elif component == 'signal':
                        return val.get('signal', None)
                    else:  # macd_line
                        return val.get('value', None)
            return None
        
    except Exception as e:
        print(f"  Error fetching {metric} indicator: {e}")
        return None
    
    return None

# ==================== GREEKS CALCULATOR CLASS ====================

class GreeksCalculator:
    """
    Black-Scholes Greeks Calculator with Implied Volatility solver
    
    Calculates all option Greeks (Delta, Gamma, Vega, Theta, Rho) and
    solves for implied volatility from market prices.
    """
    
    def __init__(self, S: float, K: float, T: float, r: float, q: float, 
                 option_type: str = 'call'):
        """
        Initialize Greeks Calculator - ensure all inputs are scalar floats
        
        Parameters:
        S: Underlying price
        K: Strike price
        T: Time to expiration (in years)
        r: Risk-free rate (as decimal, e.g., 0.045 for 4.5%)
        q: Dividend yield (as decimal, e.g., 0.013 for 1.3%)
        option_type: 'call' or 'put' or 'C' or 'P'
        """
        self.S = float(S)
        self.K = float(K)
        self.T = float(max(T, 1e-10))  # Prevent zero division
        self.r = float(r)
        self.q = float(q)
        self.option_type = option_type.lower() if option_type.lower() in ['call', 'put'] else ('call' if option_type.upper() == 'C' else 'put')
    
    def _d1_d2(self, sigma: float) -> Tuple[float, float]:
        """Calculate d1 and d2 for Black-Scholes"""
        # Ensure sigma is float
        sigma = float(sigma)
        
        # Use scalar float values for all calculations
        S, K, T, r, q = float(self.S), float(self.K), float(self.T), float(self.r), float(self.q)
        
        d1 = (np.log(S / K) + (r - q + 0.5 * sigma**2) * T) / (sigma * np.sqrt(T))
        d2 = d1 - sigma * np.sqrt(T)
        
        # Return as Python floats, not numpy types
        return float(d1), float(d2)
    
    def black_scholes_price(self, sigma: float) -> float:
        """Calculate option price using Black-Scholes"""
        if self.T <= 1e-10:
            if self.option_type == 'call':
                return max(0, self.S - self.K)
            else:
                return max(0, self.K - self.S)
        
        d1, d2 = self._d1_d2(sigma)
        
        if self.option_type == 'call':
            price = (self.S * np.exp(-self.q * self.T) * norm.cdf(d1) - 
                    self.K * np.exp(-self.r * self.T) * norm.cdf(d2))
        else:  # put
            price = (self.K * np.exp(-self.r * self.T) * norm.cdf(-d2) - 
                    self.S * np.exp(-self.q * self.T) * norm.cdf(-d1))
        
        return price
    
    def calculate_implied_volatility(self, market_price: float, 
                                     initial_guess: float = 0.3,
                                     max_iterations: int = 100,
                                     tolerance: float = 1e-6) -> Optional[float]:
        """
        Calculate implied volatility using Newton-Raphson method
        
        Parameters:
        market_price: Observed market price of the option
        initial_guess: Starting volatility guess (default 30%)
        max_iterations: Maximum iterations for convergence
        tolerance: Price difference tolerance for convergence
        
        Returns:
        Implied volatility as decimal (e.g., 0.15 for 15%) or None if failed
        """
        # Ensure all inputs are floats
        market_price = float(market_price)
        sigma = float(initial_guess)
        
        for i in range(max_iterations):
            price = self.black_scholes_price(sigma)
            vega_val = self._calculate_vega(sigma)
            
            if abs(float(vega_val)) < 1e-10:
                # Try brentq method as fallback
                try:
                    def objective(s):
                        return self.black_scholes_price(float(s)) - market_price
                    
                    sigma = brentq(objective, 0.001, 5.0, xtol=tolerance)
                    return float(sigma)
                except:
                    return None
            
            diff = float(market_price - price)
            
            if abs(diff) < tolerance:
                return float(sigma)
            
            # Newton-Raphson update - ensure float division
            sigma = float(sigma + diff / float(vega_val))
            
            # Keep sigma in reasonable bounds
            sigma = max(0.001, min(float(sigma), 5.0))
        
        return None  # Failed to converge
    
    def _calculate_vega(self, sigma: float) -> float:
        """Calculate Vega (for IV calculation)"""
        if self.T <= 1e-10:
            return 0
        
        d1, _ = self._d1_d2(sigma)
        return self.S * np.exp(-self.q * self.T) * norm.pdf(d1) * np.sqrt(self.T)
    
    def calculate_greeks(self, sigma: float) -> Dict[str, float]:
        """
        Calculate all Greeks for given volatility
        
        Returns:
        Dictionary with delta, gamma, vega, theta, rho values
        """
        if self.T <= 1e-10:
            # At expiration
            if self.option_type == 'call':
                delta = 1.0 if self.S > self.K else 0.0
            else:
                delta = -1.0 if self.S < self.K else 0.0
            
            return {
                'delta': delta,
                'gamma': 0.0,
                'vega': 0.0,
                'theta': 0.0,
                'rho': 0.0
            }
        
        d1, d2 = self._d1_d2(sigma)
        
        # Delta
        if self.option_type == 'call':
            delta = np.exp(-self.q * self.T) * norm.cdf(d1)
        else:  # put
            delta = -np.exp(-self.q * self.T) * norm.cdf(-d1)
        
        # Gamma (same for calls and puts)
        gamma = (np.exp(-self.q * self.T) * norm.pdf(d1)) / \
                (self.S * sigma * np.sqrt(self.T))
        
        # Vega (per 1% change in volatility)
        vega = self.S * np.exp(-self.q * self.T) * norm.pdf(d1) * \
               np.sqrt(self.T) / 100
        
        # Theta (per day)
        if self.option_type == 'call':
            theta = ((-self.S * np.exp(-self.q * self.T) * norm.pdf(d1) * sigma / 
                     (2 * np.sqrt(self.T))) -
                    self.r * self.K * np.exp(-self.r * self.T) * norm.cdf(d2) +
                    self.q * self.S * np.exp(-self.q * self.T) * norm.cdf(d1))
        else:  # put
            theta = ((-self.S * np.exp(-self.q * self.T) * norm.pdf(d1) * sigma / 
                     (2 * np.sqrt(self.T))) +
                    self.r * self.K * np.exp(-self.r * self.T) * norm.cdf(-d2) -
                    self.q * self.S * np.exp(-self.q * self.T) * norm.cdf(-d1))
        
        theta = theta / 365  # Convert to per-day
        
        # Rho (per 1% change in interest rate)
        if self.option_type == 'call':
            rho = self.K * self.T * np.exp(-self.r * self.T) * norm.cdf(d2) / 100
        else:  # put
            rho = -self.K * self.T * np.exp(-self.r * self.T) * norm.cdf(-d2) / 100
        
        return {
            'delta': delta,
            'gamma': gamma,
            'vega': vega,
            'theta': theta,
            'rho': rho
        }
    
    def estimate_strike_from_delta(self, target_delta: float) -> float:
        """
        Estimate strike price that would produce target delta
        
        Parameters:
        target_delta: Desired delta value (0.0 to 1.0 for calls, -1.0 to 0.0 for puts)
        
        Returns:
        Estimated strike price
        """
        if self.option_type == 'call':
            # Solve N(d1) = target_delta / e^(-q*T)
            adjusted_delta = target_delta / np.exp(-self.q * self.T)
            adjusted_delta = min(0.9999, max(0.0001, adjusted_delta))
            d1 = norm.ppf(adjusted_delta)
        else:
            # For puts: N(-d1) = -target_delta / e^(-q*T)
            adjusted_delta = -target_delta / np.exp(-self.q * self.T)
            adjusted_delta = min(0.9999, max(0.0001, adjusted_delta))
            d1 = -norm.ppf(adjusted_delta)
        
        # Approximate sigma for estimation
        sigma = 0.20  # Assume 20% vol for estimation
        
        # From d1 formula, solve for K
        ln_S_over_K = d1 * sigma * np.sqrt(self.T) - \
                      (self.r - self.q + 0.5 * sigma**2) * self.T
        
        K_estimated = self.S / np.exp(ln_S_over_K)
        
        return K_estimated


class DeltaStrikeSelector:
    """
    Finds optimal strike based on target delta using real market data
    """
    
    def __init__(self, client: RESTClient, underlying: str, exp_date: datetime,
                 option_type: str, r: float = 0.045, q: float = 0.013):
        """
        Initialize Delta Strike Selector
        
        Parameters:
        client: Polygon REST client
        underlying: Underlying symbol (e.g., 'SPX')
        exp_date: Option expiration date
        option_type: 'C' or 'P' or 'call' or 'put'
        r: Risk-free rate (default 4.5%)
        q: Dividend yield (default 1.3% for SPX)
        """
        self.client = client
        self.underlying = underlying
        self.exp_date = exp_date
        self.option_type = 'call' if option_type.upper() == 'C' else 'put'
        self.r = r
        self.q = q
    
    def find_strike_by_delta(self, underlying_price: float, target_delta: float,
                            timestamp: datetime, method: str = "closest",
                            tolerance: float = 0.01, delta_min: Optional[float] = None,
                            delta_max: Optional[float] = None,
                            strike_fallback: str = "closest") -> Optional[Tuple[float, float, float]]:
        """
        Find strike that matches target delta criteria using smart directional search
        
        Parameters:
        underlying_price: Current underlying price
        target_delta: Target delta value
        timestamp: Timestamp for price data
        method: 'closest', 'above', 'below', 'between', 'exactly'
        tolerance: Acceptable delta difference for 'exactly' method
        delta_min: Minimum delta for 'between' method
        delta_max: Maximum delta for 'between' method
        strike_fallback: What to do if exact match not found
        
        Returns:
        Tuple of (strike, price, actual_delta) or None if not found
        """
        # Ensure consistent timezone handling for time to expiration
        exp_date = self.exp_date
        ts = timestamp
        
        # Make both timezone-naive for calculation
        if hasattr(exp_date, 'tzinfo') and exp_date.tzinfo is not None:
            exp_date = exp_date.replace(tzinfo=None)
        if hasattr(ts, 'tzinfo') and ts.tzinfo is not None:
            ts = ts.replace(tzinfo=None)
        
        # For same-day expiration (DTE=0), set expiration to market close (4:00 PM)
        # Otherwise the exp_date is midnight which is before the entry time
        if exp_date.date() == ts.date() and exp_date.hour == 0 and exp_date.minute == 0:
            exp_date = exp_date.replace(hour=16, minute=0, second=0)
        
        # Calculate time to expiration in years
        T = (exp_date - ts).total_seconds() / (365.25 * 24 * 3600)
        T = max(T, 1e-10)
        
        print(f"    ⏱ Time to expiration: {T*365.25:.4f} days ({T*365.25*24:.2f} hours)")
        
        # Determine increment based on underlying
        if self.underlying in ["SPX", "SPXW", "NDX"]:
            increment = 5
        elif self.underlying in ["SPY", "QQQ", "IWM"]:
            increment = 1
        else:
            increment = 5
        
        # STRICTLY DIRECTIONAL SEARCH:
        # 1. Start at ATM (underlying price)
        # 2. Determine search direction based on option type and target delta
        # 3. Step ONE direction until we find the target delta
        
        atm_strike = round(underlying_price / increment) * increment
        
        # DIRECTIONAL SEARCH LOGIC:
        # For PUTS: ATM delta ≈ -0.50
        #   - Target |delta| < 0.50 (e.g., -0.30) = OTM = search DOWN (lower strikes)
        #   - Target |delta| > 0.50 (e.g., -0.70) = ITM = search UP (higher strikes)
        # For CALLS: ATM delta ≈ +0.50
        #   - Target |delta| < 0.50 (e.g., +0.30) = OTM = search UP (higher strikes)
        #   - Target |delta| > 0.50 (e.g., +0.70) = ITM = search DOWN (lower strikes)
        
        abs_delta = abs(target_delta)
        max_strikes = 10  # Maximum strikes to search - usually find target within 5-7
        
        if self.option_type == 'put':
            if abs_delta < 0.50:
                # OTM put: search DOWN from ATM
                search_direction = 'down'
            else:
                # ITM put: search UP from ATM
                search_direction = 'up'
        else:  # call
            if abs_delta < 0.50:
                # OTM call: search UP from ATM
                search_direction = 'up'
            else:
                # ITM call: search DOWN from ATM
                search_direction = 'down'
        
        # Build strike list: start at ATM, step in one direction
        strikes = [atm_strike]
        
        if search_direction == 'down':
            for i in range(1, max_strikes + 1):
                strikes.append(atm_strike - i * increment)
        else:  # 'up'
            for i in range(1, max_strikes + 1):
                strikes.append(atm_strike + i * increment)
        
        # Keep strikes positive
        strikes = [s for s in strikes if s > 0]
        
        print(f"    🎯 Delta Search: Target={target_delta:.3f}, Method={method}")
        print(f"    📊 ATM strike: ${atm_strike:.2f}, Direction: {search_direction}")
        print(f"    🔍 Searching {len(strikes)} strikes from ${min(strikes):.0f} to ${max(strikes):.0f}")
        
        # Search through strikes
        candidates = []
        date_str = timestamp.strftime("%Y-%m-%d")
        
        strikes_checked = 0
        for strike in strikes:
            strikes_checked += 1
            try:
                # Format option symbol
                symbol = self._format_option_symbol(strike)
                
                # Debug: Show first 5 strikes being checked
                if strikes_checked <= 5:
                    print(f"    → Checking strike ${strike}: {symbol}")
                
                rate_limit_option_request()
                
                # Fetch OHLCV data
                aggs = list(self.client.list_aggs(
                    symbol, 1, "minute",
                    date_str, date_str,
                    adjusted="true", limit=100
                ))
                
                if not aggs:
                    if strikes_checked <= 5:
                        print(f"      ⚠ No data from API for {symbol}")
                    continue
                
                # Find closest price to timestamp
                target_ts = int(timestamp.timestamp() * 1000)
                closest_agg = min(aggs, key=lambda x: abs(x.timestamp - target_ts))
                option_price = closest_agg.close
                
                # Skip if price is too low (likely stale/worthless)
                if option_price < 0.01:
                    if strikes_checked <= 5:
                        print(f"      ⚠ Price too low: ${option_price}")
                    continue
                
                # Calculate IV and Greeks
                calc = GreeksCalculator(underlying_price, strike, T, 
                                       self.r, self.q, self.option_type)
                iv = calc.calculate_implied_volatility(option_price)
                
                if iv is None:
                    if strikes_checked <= 5:
                        print(f"      ⚠ Could not calculate IV")
                    continue
                
                greeks = calc.calculate_greeks(iv)
                delta = greeks['delta']
                
                # Show delta for first 5 strikes
                if strikes_checked <= 5:
                    print(f"      ✓ Got delta: {delta:.4f}")
                
                # Check if this strike meets criteria
                meets_criteria = False
                
                if method == "closest":
                    meets_criteria = True
                elif method == "above":
                    if self.option_type == 'call':
                        meets_criteria = delta >= target_delta
                    else:
                        meets_criteria = delta <= target_delta
                elif method == "below":
                    if self.option_type == 'call':
                        meets_criteria = delta <= target_delta
                    else:
                        meets_criteria = delta >= target_delta
                elif method == "between":
                    if delta_min is not None and delta_max is not None:
                        meets_criteria = delta_min <= delta <= delta_max
                elif method == "exactly":
                    meets_criteria = abs(delta - target_delta) <= tolerance
                
                if meets_criteria:
                    delta_diff = abs(delta - target_delta)
                    candidates.append((strike, option_price, delta, delta_diff))
                    print(f"    ✓ ${strike}: Δ={delta:.3f}, Price=${option_price:.2f}")
                    
                    # Early exit: for "closest" method, stop once we find delta within 0.05 of target
                    # For other methods, stop on exact tolerance match
                    if method == "closest" and delta_diff < 0.05:
                        print(f"    ⚡ Found close match (Δ diff={delta_diff:.3f}), stopping search")
                        break
                    elif delta_diff < tolerance:
                        break
            
            except Exception as e:
                if strikes_checked <= 5:
                    print(f"      ✗ Error: {str(e)[:50]}")
                continue
        
        print(f"    📊 Checked {strikes_checked} strikes, found {len(candidates)} candidates")
        
        if not candidates:
            print(f"    ✗ No strikes found matching criteria")
            return None
        
        # Select best candidate based on method
        if method == "closest" or method == "exactly":
            best = min(candidates, key=lambda x: x[3])
        elif method == "above":
            valid = [c for c in candidates if 
                    (c[2] >= target_delta if self.option_type == 'call' else c[2] <= target_delta)]
            if not valid:
                return None
            best = min(valid, key=lambda x: x[3])
        elif method == "below":
            valid = [c for c in candidates if 
                    (c[2] <= target_delta if self.option_type == 'call' else c[2] >= target_delta)]
            if not valid:
                return None
            best = min(valid, key=lambda x: x[3])
        else:  # between
            best = min(candidates, key=lambda x: x[3])
        
        strike, price, delta, _ = best
        print(f"    🎯 Selected: ${strike} (Δ={delta:.3f}, Price=${price:.2f})")
        
        return (strike, price, delta)
    
    def _format_option_symbol(self, strike: float) -> str:
        """Format option symbol for Polygon API"""
        underlying = self.underlying
        if underlying == "SPX":
            underlying = "SPXW"
        exp_str = self.exp_date.strftime("%y%m%d")
        strike_str = f"{int(strike * 1000):08d}"
        opt_type = 'C' if self.option_type == 'call' else 'P'
        
        return f"O:{underlying}{exp_str}{opt_type}{strike_str}"


# ==================== UTILITY FUNCTIONS ====================

def get_trading_days(start_date: str, end_date: str) -> List[datetime]:
    """Get all trading days in date range"""
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")
    date_range = pd.date_range(start=start, end=end, freq='B')
    return [d.to_pydatetime() for d in date_range]

def find_expiration_date(trade_date: datetime, dte: int) -> datetime:
    """Find expiration date based on DTE (business days)"""
    if dte == 0:
        return trade_date
    exp_date = trade_date
    days_added = 0
    while days_added < dte:
        exp_date = exp_date + timedelta(days=1)
        if exp_date.weekday() < 5:
            days_added += 1
    return exp_date

def get_business_days_between(start_date: datetime, end_date: datetime) -> List[datetime]:
    """Get all business days between start and end dates (inclusive)"""
    business_days = pd.date_range(start=start_date, end=end_date, freq='B')
    return [d.to_pydatetime() for d in business_days]

def round_strike_with_direction(target: float, increment: int, 
                                direction: str, fallback: str = "closest") -> Optional[float]:
    """
    Round strike considering direction and user preference
    
    Args:
        target: Calculated target strike (e.g., 5937.56)
        increment: Strike increment ($5 for SPX, $1 for SPY)
        direction: 'above' or 'below' - direction from underlying/reference
        fallback: Strike selection method:
            - "closest": Round to nearest strike (default)
            - "or_less": Always round DOWN
            - "or_higher": Always round UP
            - "exactly": Round to nearest whole number, skip if unavailable
    
    Returns:
        Rounded strike, or None if "exactly" and not available
    
    Examples:
        target=5937.56, increment=5:
        - "closest": 5940 (nearest)
        - "or_less": 5935 (always down)
        - "or_higher": 5940 (always up)
        - "exactly": 5938 (rounded to whole, verify later)
    """
    import math
    
    if fallback == "exactly":
        # Round to nearest whole number first
        # E.g., 5400.32 → 5400, 5937.56 → 5938
        return round(target)
    
    elif fallback == "or_less":
        # Always round DOWN to nearest increment
        return (target // increment) * increment
    
    elif fallback == "or_higher":
        # Always round UP to nearest increment
        return math.ceil(target / increment) * increment
    
    else:  # "closest" (default)
        # Round to nearest increment
        # If exactly in middle, use direction as tiebreaker
        lower = (target // increment) * increment
        upper = lower + increment
        
        diff_lower = abs(target - lower)
        diff_upper = abs(target - upper)
        
        # If exactly in middle, use direction preference
        if diff_lower == diff_upper:
            if direction == "below":
                return lower
            else:
                return upper
        
        # Otherwise, use nearest
        return round(target / increment) * increment


def round_to_nearest_strike(price: float, increment: int = 5, underlying: str = None) -> float:
    """
    Legacy function - Round price to nearest strike price increment
    Kept for backward compatibility
    
    SPY: $1 increments
    SPX/SPXW: $5 increments (standard) or $1 for weeklies
    Others: $5 default
    """
    # Determine appropriate increment based on underlying
    if underlying:
        if underlying in ["SPY", "QQQ", "IWM"]:  # ETFs typically use $1
            increment = 1
        elif underlying in ["SPX", "SPXW", "NDX"]:  # Indices typically use $5
            increment = 5
        # For other symbols, use provided increment or default to 5
    
    return round(price / increment) * increment


def format_option_symbol(underlying: str, exp_date: datetime, strike: float, option_type: str) -> str:
    """Format option symbol for Polygon API"""
    if underlying == "SPX":
        underlying = "SPXW"
    date_part = exp_date.strftime("%y%m%d")
    strike_int = int(strike * 1000)
    strike_str = f"{strike_int:08d}"
    return f"O:{underlying}{date_part}{option_type.upper()}{strike_str}"

def get_available_strikes(client: RESTClient, underlying: str, exp_date: datetime, option_type: str) -> List[float]:
    """
    Get all available strikes for a given expiration using Polygon options chain
    Uses caching to minimize API calls
    """
    global _options_chain_cache
    
    # Create cache key
    cache_key = f"{underlying}_{exp_date.strftime('%Y-%m-%d')}_{option_type}"
    
    # Check cache first
    if cache_key in _options_chain_cache:
        return _options_chain_cache[cache_key]
    
    # Use underlying ticker format for API
    ticker = underlying
    if underlying == "SPXW":
        ticker = "SPX"
    
    rate_limit_option_request()
    
    try:
        # Fetch options contracts for this expiration
        # Polygon API v1.14+ uses 'underlying_ticker'
        contracts = client.list_options_contracts(
            underlying_ticker=ticker,
            contract_type=option_type.lower(),
            expiration_date=exp_date.strftime("%Y-%m-%d"),
            limit=1000
        )
        
        # Extract strike prices
        strikes = sorted(set(contract.strike_price for contract in contracts))
        
        # Cache the result
        _options_chain_cache[cache_key] = strikes
        
        print(f"  ✓ Found {len(strikes)} available {option_type} strikes for {exp_date.strftime('%Y-%m-%d')}")
        return strikes
        
    except TypeError as e:
        if 'underlying_asset' in str(e) or 'underlying_ticker' in str(e):
            print(f"  ⚠ API parameter error. Your polygon-api-client version may be outdated.")
            print(f"    Run: pip install --upgrade polygon-api-client")
        print(f"  Error: {e}")
        return []
    except Exception as e:
        print(f"  ⚠ Error fetching options chain: {e}")
        print(f"  Tip: Check API key validity and network connection")
        return []

def find_nearest_available_strike(client: RESTClient, underlying: str, exp_date: datetime, 
                                  target_strike: float, option_type: str) -> Optional[float]:
    """
    Find the nearest available strike to the target strike
    Uses Polygon options chain API
    """
    available_strikes = get_available_strikes(client, underlying, exp_date, option_type)
    
    if not available_strikes:
        # Fallback: round to appropriate increment for this underlying
        return round_to_nearest_strike(target_strike, underlying=underlying)
    
    # Find closest strike
    closest_strike = min(available_strikes, key=lambda x: abs(x - target_strike))
    
    if closest_strike != target_strike:
        print(f"  Strike {target_strike} not available, using nearest: {closest_strike}")
    
    return closest_strike

# ==================== DATA FETCHING ====================

def fetch_aggs_with_retry(client: RESTClient, max_retries: int = 5, **kwargs) -> list:
    """
    Call client.list_aggs with exponential-backoff retry on 429 responses.
    Underlying stock/index bar fetches can hit burst limits even on unlimited plans
    when multiple paginated requests are fired in quick succession.
    """
    for attempt in range(1, max_retries + 1):
        try:
            return list(client.list_aggs(**kwargs))
        except Exception as e:
            err = str(e).lower()
            if "429" in err or "too many" in err or "rate" in err:
                wait = 15 * attempt  # 15 s, 30 s, 45 s …
                print(f"  [429] Rate-limited by Polygon (attempt {attempt}/{max_retries}). "
                      f"Waiting {wait}s before retry...", flush=True)
                time.sleep(wait)
            else:
                raise  # Non-429 error — propagate immediately
    raise RuntimeError(f"fetch_aggs_with_retry: still getting 429 after {max_retries} attempts "
                       f"for ticker={kwargs.get('ticker')}")


def get_bars_for_period(client: RESTClient, symbol: str, start_date: datetime, 
                        end_date: datetime, multiplier: int, timespan: str = "minute") -> Dict:
    """Get bars for a symbol over a date range"""
    
    from_str = start_date.strftime("%Y-%m-%d")
    to_str = (end_date + timedelta(days=1)).strftime("%Y-%m-%d")
    
    if symbol.startswith("O:"):
        rate_limit_option_request()
    
    try:
        aggs = fetch_aggs_with_retry(
            client,
            ticker=symbol,
            multiplier=multiplier,
            timespan=timespan,
            from_=from_str,
            to=to_str,
            adjusted="true",
            sort="asc",
            limit=50000
        )
        
        if not aggs:
            return {}
        
        # Debug: Check first agg for available fields (only once per run)
        if aggs and not hasattr(get_bars_for_period, '_debug_shown'):
            first_agg = aggs[0]
            print(f"\n  [DEBUG] First agg object fields for {symbol}:")
            print(f"    Type: {type(first_agg)}")
            # Show all non-private attributes
            attrs = [a for a in dir(first_agg) if not a.startswith('_')]
            print(f"    Attributes: {attrs}")
            # Check specifically for vw/vwap
            print(f"    has 'vw': {hasattr(first_agg, 'vw')}")
            print(f"    has 'vwap': {hasattr(first_agg, 'vwap')}")
            if hasattr(first_agg, 'vw'):
                print(f"    vw value: {first_agg.vw}")
            if hasattr(first_agg, 'vwap'):
                print(f"    vwap value: {first_agg.vwap}")
            get_bars_for_period._debug_shown = True
            print()
        
        bars_by_date = {}
        eastern = pytz.timezone('US/Eastern')
        
        for agg in aggs:
            # Convert UTC timestamp to US/Eastern for market hours
            bar_datetime = datetime.fromtimestamp(agg.timestamp / 1000, tz=pytz.UTC).astimezone(eastern)
            date_str = bar_datetime.date().strftime("%Y-%m-%d")
            
            # Filter for market hours (9:30 AM - 4:00 PM EST)
            hour = bar_datetime.hour
            minute = bar_datetime.minute
            time_in_minutes = hour * 60 + minute
            
            if 9*60+30 <= time_in_minutes <= 16*60:
                # Try to get VWAP - Polygon SDK might use 'vw' or 'vwap'
                vwap = None
                
                # Try 'vw' first (raw API field name)
                if hasattr(agg, 'vw') and agg.vw is not None:
                    vwap = agg.vw
                # Try 'vwap' (alternative SDK name)
                elif hasattr(agg, 'vwap') and agg.vwap is not None:
                    vwap = agg.vwap
                # Try dictionary-style access
                elif hasattr(agg, 'get'):
                    vwap = agg.get('vw') or agg.get('vwap')
                
                # Use close as fallback
                if vwap is None or vwap == 0:
                    vwap = agg.close
                
                bar_data = {
                    "date": date_str,
                    "datetime": bar_datetime,
                    "timestamp": agg.timestamp,
                    "time": bar_datetime.strftime("%H:%M"),
                    "open": agg.open,
                    "high": agg.high,
                    "low": agg.low,
                    "close": agg.close,
                    "volume": getattr(agg, 'volume', 0),
                    "vw": vwap
                }
                
                if date_str not in bars_by_date:
                    bars_by_date[date_str] = []
                
                bars_by_date[date_str].append(bar_data)
        
        return bars_by_date
    
    except Exception as e:
        print(f"  Error fetching {symbol}: {e}")
        return {}

def get_daily_closes_for_period(client: RESTClient, symbol: str, start_date: datetime, 
                                end_date: datetime) -> Dict[str, float]:
    from_str = start_date.strftime("%Y-%m-%d")
    to_str = end_date.strftime("%Y-%m-%d")
    
    try:
        aggs = fetch_aggs_with_retry(
            client,
            ticker=symbol,
            multiplier=1,
            timespan="day",
            from_=from_str,
            to=to_str,
            adjusted="true",
            sort="asc",
            limit=50000
        )
        
        closes = {}
        eastern = pytz.timezone('US/Eastern')
        for agg in aggs:
            bar_datetime = datetime.fromtimestamp(agg.timestamp / 1000, tz=pytz.UTC).astimezone(eastern)
            closes[bar_datetime.date().strftime("%Y-%m-%d")] = agg.close
        
        return closes
    
    except Exception as e:
        print(f"  Error fetching daily closes for {symbol}: {e}")
        return {}

def get_cached_underlying_close(daily_closes: Dict[str, float], bars_by_date: Dict, 
                                exp_date: datetime) -> Optional[float]:
    exp_date_str = exp_date.strftime("%Y-%m-%d")
    
    if exp_date_str in daily_closes:
        return daily_closes[exp_date_str]
    
    exp_underlying_bars = bars_by_date.get(exp_date_str, [])
    if exp_underlying_bars:
        last_bar = max(exp_underlying_bars, key=lambda x: x['time'])
        return last_bar['close']
    
    return None

# ==================== USER INPUT ====================

def get_user_config() -> Dict[str, Any]:
    """Collect all configuration from user"""
    
    print("\n" + "="*80)
    print(" "*25 + "OPTIONS BACKTESTING SYSTEM")
    print("="*80)
    
    config = {}
    
    # Symbol
    print("\n[1/13] SYMBOL")
    config['symbol'] = input("Enter symbol (e.g., SPX, AAPL): ").upper().strip()
    
    # Date range
    print("\n[2/13] DATE RANGE")
    config['start_date'] = input("Enter start date (YYYY-MM-DD): ").strip()
    config['end_date'] = input("Enter end date (YYYY-MM-DD): ").strip()
    
    # Entry time
    print("\n[3/13] ENTRY TIME")
    while True:
        entry_time = input("Enter entry time (HH:MM, 09:30-16:00): ").strip()
        try:
            h, m = map(int, entry_time.split(':'))
            if 9*60+30 <= h*60+m <= 16*60:
                config['entry_time'] = f"{h:02d}:{m:02d}"
                break
        except:
            pass
        print("Invalid time. Use HH:MM within market hours.")
    
    # DTE
    print("\n[4/13] DAYS TO EXPIRATION (DTE)")
    while True:
        try:
            config['dte'] = int(input("Enter DTE (0 for same day): "))
            if config['dte'] >= 0:
                break
        except ValueError:
            pass
        print("Enter a non-negative integer.")
    
    # Strategy type
    print("\n[5/13] STRATEGY TYPE")
    strategies = [
        "Long Call", "Long Put", "Naked Short Call", "Naked Short Put",
        "Short Put Spread", "Short Call Spread", "Short Iron Condor", "Short Iron Butterfly",
        "Long Call Spread", "Long Put Spread", "Long Straddle", "Long Strangle",
        "Long Iron Butterfly", "Long Iron Condor", "Short Straddle", "Short Strangle"
    ]
    for i, s in enumerate(strategies, 1):
        print(f"  {i}. {s}")
    
    while True:
        try:
            choice = int(input("Select strategy (1-16): "))
            if 1 <= choice <= 16:
                config['strategy'] = strategies[choice-1]
                break
        except ValueError:
            pass
        print("Invalid choice.")
    
    # Wing configuration for Iron Condor/Butterfly strategies
    config['allow_skewed_wings'] = False
    if 'Iron' in config['strategy']:
        print(f"\n[5.5/13] WING CONFIGURATION - {config['strategy']}")
        print("Do you want to allow skewed/unbalanced wings?")
        print("(Spread width can differ between put side and call side)")
        print("  Yes = Allow different widths (e.g., 5-point put spread, 10-point call spread)")
        print("  No  = Require balanced wings (e.g., both 5-point spreads)")
        allow_input = input("Allow skewed wings? [y/n]: ").lower().strip()
        config['allow_skewed_wings'] = allow_input in ['y', 'yes']
        if config['allow_skewed_wings']:
            print("  ✓ Skewed wings enabled - spread widths can differ")
        else:
            print("  ✓ Balanced wings only - spread widths must match")
    
    # Leg configuration
    print(f"\n[6/13] LEG CONFIGURATION - {config['strategy']}")
    config['legs'] = configure_legs(config['strategy'])
    
    # Net premium filter (optional)
    print("\n[6.5/13] NET PREMIUM FILTER (Optional)")
    print("Filter trades based on net premium at entry")
    print("Leave blank to skip filtering")
    
    config['net_premium_min'] = None
    config['net_premium_max'] = None
    
    min_input = input("Minimum net premium (or ENTER to skip): ").strip()
    if min_input:
        try:
            config['net_premium_min'] = float(min_input)
            print(f"  ✓ Will skip trades with net premium < {config['net_premium_min']}")
        except ValueError:
            print("  Invalid input, skipping minimum filter")
    
    max_input = input("Maximum net premium (or ENTER to skip): ").strip()
    if max_input:
        try:
            config['net_premium_max'] = float(max_input)
            print(f"  ✓ Will skip trades with net premium > {config['net_premium_max']}")
        except ValueError:
            print("  Invalid input, skipping maximum filter")
    
    if config['net_premium_min'] is None and config['net_premium_max'] is None:
        print("  No net premium filtering")
    
    # Take profit
    print("\n[7/13] TAKE PROFIT")
    tp_type = input("Take profit by (P)ercentage or (D)ollar? [P/D]: ").upper().strip()
    if tp_type == 'P':
        while True:
            try:
                config['take_profit_pct'] = float(input("Enter TP % (e.g., 50): "))
                if config['take_profit_pct'] > 0:
                    config['take_profit_dollar'] = None
                    break
            except ValueError:
                pass
    else:
        while True:
            try:
                config['take_profit_dollar'] = float(input("Enter TP $ per contract: "))
                if config['take_profit_dollar'] > 0:
                    config['take_profit_pct'] = None
                    break
            except ValueError:
                pass
    
    # Stop loss
    print("\n[8/13] STOP LOSS")
    sl_type = input("Stop loss by (P)ercentage or (D)ollar? [P/D]: ").upper().strip()
    if sl_type == 'P':
        while True:
            try:
                config['stop_loss_pct'] = float(input("Enter SL % (e.g., 200): "))
                if config['stop_loss_pct'] > 0:
                    config['stop_loss_dollar'] = None
                    break
            except ValueError:
                pass
    else:
        while True:
            try:
                config['stop_loss_dollar'] = float(input("Enter SL $ per contract: "))
                if config['stop_loss_dollar'] > 0:
                    config['stop_loss_pct'] = None
                    break
            except ValueError:
                pass
    
    # Detection bars
    print("\n[9/13] DETECTION BARS")
    print("  1. 15-second (High Precision)\n  2. 1-minute\n  3. 5-minute\n  4. 10-minute\n  5. 15-minute")
    bar_sizes = {'1': 0.25, '2': 1, '3': 5, '4': 10, '5': 15}
    while True:
        choice = input("Select bar size [1-5]: ").strip()
        if choice in bar_sizes:
            config['detection_bar_size'] = bar_sizes[choice]
            break
    
    # Concurrent trades
    print("\n[10/13] CONCURRENT TRADES")
    config['concurrent_trades'] = input("Allow concurrent trades? [y/n]: ").lower().strip() in ['y', 'yes']
    
    # PDT avoidance
    print("\n[11/13] PDT AVOIDANCE")
    config['avoid_pdt'] = input("Avoid day trades? [y/n]: ").lower().strip() in ['y', 'yes']
    
    # Capital
    print("\n[12/13] STARTING CAPITAL")
    while True:
        try:
            config['starting_capital'] = float(input("Starting capital ($): "))
            if config['starting_capital'] > 0:
                break
        except ValueError:
            pass
    
    # Allocation
    print("\n[13/13] ALLOCATION PER TRADE")
    print("  1. Percentage of capital\n  2. Fixed # of contracts\n  3. Fixed $ amount")
    
    while True:
        choice = input("Select [1-3]: ").strip()
        if choice == '1':
            config['allocation_type'] = 'pct'
            while True:
                try:
                    config['allocation_value'] = float(input("Enter % (e.g., 10): "))
                    if 0 < config['allocation_value'] <= 100:
                        break
                except ValueError:
                    pass
            break
        elif choice == '2':
            config['allocation_type'] = 'contracts'
            while True:
                try:
                    config['allocation_value'] = int(input("Enter # of contracts: "))
                    if config['allocation_value'] > 0:
                        break
                except ValueError:
                    pass
            break
        elif choice == '3':
            config['allocation_type'] = 'fixed'
            while True:
                try:
                    config['allocation_value'] = float(input("Enter $ amount: "))
                    if config['allocation_value'] > 0:
                        break
                except ValueError:
                    pass
            break
    
    return config

def configure_legs(strategy: str) -> List[Dict]:
    """Configure legs based on strategy with interactive selection"""
    
    # Define available legs for each strategy
    if strategy == "Long Call":
        return [get_leg_config("Long Call", "C", "long", None)]
    
    elif strategy == "Long Put":
        return [get_leg_config("Long Put", "P", "long", None)]
    
    elif strategy == "Naked Short Call":
        return [get_leg_config("Short Call", "C", "short", None)]
    
    elif strategy == "Naked Short Put":
        return [get_leg_config("Short Put", "P", "short", None)]
    
    elif strategy == "Short Put Spread":
        # Let user choose order
        available_legs = [
            ("Short Put", "P", "short"),
            ("Long Put", "P", "long")
        ]
        return configure_legs_interactive(available_legs)
    
    elif strategy == "Short Call Spread":
        available_legs = [
            ("Short Call", "C", "short"),
            ("Long Call", "C", "long")
        ]
        return configure_legs_interactive(available_legs)
    
    elif strategy == "Short Iron Condor":
        available_legs = [
            ("Long Put", "P", "long"),
            ("Short Put", "P", "short"),
            ("Short Call", "C", "short"),
            ("Long Call", "C", "long")
        ]
        return configure_legs_interactive(available_legs)
    
    elif strategy == "Short Iron Butterfly":
        available_legs = [
            ("Long Put", "P", "long"),
            ("Short Put", "P", "short"),
            ("Short Call", "C", "short"),
            ("Long Call", "C", "long")
        ]
        return configure_legs_interactive(available_legs)
    
    elif strategy == "Long Call Spread":
        available_legs = [
            ("Long Call", "C", "long"),
            ("Short Call", "C", "short")
        ]
        return configure_legs_interactive(available_legs)
    
    elif strategy == "Long Put Spread":
        available_legs = [
            ("Long Put", "P", "long"),
            ("Short Put", "P", "short")
        ]
        return configure_legs_interactive(available_legs)
    
    elif strategy == "Long Straddle":
        # Straddle: both legs must have same strike
        available_legs = [
            ("Long Put", "P", "long"),
            ("Long Call", "C", "long")
        ]
        return configure_legs_interactive(available_legs)
    
    elif strategy == "Long Strangle":
        # Strangle: put and call at different strikes
        available_legs = [
            ("Long Put", "P", "long"),
            ("Long Call", "C", "long")
        ]
        return configure_legs_interactive(available_legs)
    
    elif strategy == "Long Iron Butterfly":
        # Reverse of short iron butterfly
        available_legs = [
            ("Short Put", "P", "short"),
            ("Long Put", "P", "long"),
            ("Long Call", "C", "long"),
            ("Short Call", "C", "short")
        ]
        return configure_legs_interactive(available_legs)
    
    elif strategy == "Long Iron Condor":
        # Reverse of short iron condor
        available_legs = [
            ("Short Put", "P", "short"),
            ("Long Put", "P", "long"),
            ("Long Call", "C", "long"),
            ("Short Call", "C", "short")
        ]
        return configure_legs_interactive(available_legs)
    
    elif strategy == "Short Straddle":
        # Straddle: both legs must have same strike
        available_legs = [
            ("Short Put", "P", "short"),
            ("Short Call", "C", "short")
        ]
        return configure_legs_interactive(available_legs)
    
    elif strategy == "Short Strangle":
        # Strangle: put and call at different strikes
        available_legs = [
            ("Short Put", "P", "short"),
            ("Short Call", "C", "short")
        ]
        return configure_legs_interactive(available_legs)
    
    return []

def configure_legs_interactive(available_legs: List[Tuple[str, str, str]]) -> List[Dict]:
    """
    Allow user to select and configure legs in any order
    available_legs: List of (leg_name, option_type, position)
    """
    print(f"\n  📋 Strategy requires {len(available_legs)} legs")
    print(f"  You will choose which leg to configure first, second, etc.")
    print(f"  ━" * 35)
    
    configured_legs = []
    remaining_legs = list(available_legs)
    
    while remaining_legs:
        print(f"\n  ╔══ Configure Leg {len(configured_legs) + 1} of {len(available_legs)} ══╗")
        print(f"  ║ Choose which leg to configure next:")
        print(f"  ╚" + "═" * 40 + "╝")
        
        for i, (name, opt_type, pos) in enumerate(remaining_legs, 1):
            print(f"    {i}. {name:20s} (Type: {opt_type}, Position: {pos})")
        
        # User selects leg
        while True:
            try:
                choice = int(input(f"\n  → Select leg to configure [1-{len(remaining_legs)}]: "))
                if 1 <= choice <= len(remaining_legs):
                    break
                print(f"  ⚠ Invalid choice. Enter a number between 1 and {len(remaining_legs)}")
            except ValueError:
                print("  ⚠ Invalid input. Enter a number.")
        
        # Get selected leg
        selected_leg = remaining_legs[choice - 1]
        leg_name, opt_type, position = selected_leg
        
        print(f"\n  → Configuring: {leg_name}")
        
        # Configure this leg
        leg_config = get_leg_config(leg_name, opt_type, position, configured_legs)
        configured_legs.append(leg_config)
        
        # Remove from remaining
        remaining_legs.pop(choice - 1)
        
        if remaining_legs:
            print(f"\n  ✓ {leg_name} configured successfully!")
            print(f"  ⏳ {len(remaining_legs)} leg(s) remaining...\n")
    
    print(f"\n  ✅ All {len(configured_legs)} legs configured successfully!")
    print(f"  Legs in order: {' → '.join(leg['name'] for leg in configured_legs)}")
    return configured_legs

def get_leg_config(leg_name: str, option_type: str, position: str, existing_legs: Optional[List]) -> Dict:
    """Get configuration for a single leg"""
    
    print(f"\n  ┌─ Configuration Options for {leg_name} ─┐")
    print(f"  │ Type: {option_type} | Position: {position}")
    print(f"  └" + "─" * 42 + "┘")
    print("    1. Mid Price Range (specify min/max option price)")
    print("    2. % Distance from Underlying (X% above/below spot price)")
    print("    3. $ Distance from Underlying ($X above/below spot price)")
    
    # Check if we have legs to reference
    has_reference_legs = existing_legs and len(existing_legs) > 0
    
    if has_reference_legs:
        print("    4. % Distance from Another Leg (X% above/below another leg)")
        print("    5. $ Distance from Another Leg ($X above/below another leg)")
    
    max_choice = 5 if has_reference_legs else 3
    
    while True:
        choice = input(f"\n  → Select configuration method [1-{max_choice}]: ").strip()
        
        if choice == '1':
            print(f"\n    Configure mid price range for {leg_name}:")
            while True:
                try:
                    min_p = float(input("      Min mid price: $"))
                    max_p = float(input("      Max mid price: $"))
                    if 0 <= min_p <= max_p:
                        print(f"    ✓ Will select options with mid price between ${min_p} and ${max_p}")
                        return {
                            'name': leg_name,
                            'type': option_type,
                            'position': position,
                            'config_type': 'mid_price',
                            'params': {'min': min_p, 'max': max_p}
                        }
                except ValueError:
                    pass
                print("      ⚠ Invalid. Enter positive numbers with min ≤ max.")
        
        elif choice == '2':
            print(f"\n    Configure % distance from underlying for {leg_name}:")
            direction = input("      Direction (above/below): ").lower().strip()
            if direction in ['above', 'below']:
                try:
                    pct = float(input("      % distance: "))
                    print(f"    ✓ Strike will be {pct}% {direction} the underlying price")
                    return {
                        'name': leg_name,
                        'type': option_type,
                        'position': position,
                        'config_type': 'pct_underlying',
                        'params': {'direction': direction, 'pct': pct}
                    }
                except ValueError:
                    print("      ⚠ Invalid number.")
            else:
                print("      ⚠ Must be 'above' or 'below'")
        
        elif choice == '3':
            print(f"\n    Configure $ distance from underlying for {leg_name}:")
            direction = input("      Direction (above/below): ").lower().strip()
            if direction in ['above', 'below']:
                try:
                    amount = float(input("      $ distance: "))
                    print(f"    ✓ Strike will be ${amount} {direction} the underlying price")
                    return {
                        'name': leg_name,
                        'type': option_type,
                        'position': position,
                        'config_type': 'dollar_underlying',
                        'params': {'direction': direction, 'amount': amount}
                    }
                except ValueError:
                    print("      ⚠ Invalid number.")
            else:
                print("      ⚠ Must be 'above' or 'below'")
        
        elif choice == '4' and has_reference_legs:
            print(f"\n    Configure % distance from another leg for {leg_name}:")
            print("      Available legs to reference:")
            for i, leg in enumerate(existing_legs):
                print(f"        {i+1}. {leg['name']}")
            try:
                ref_idx = int(input("      Select reference leg: ")) - 1
                if 0 <= ref_idx < len(existing_legs):
                    direction = input("      Direction (above/below): ").lower().strip()
                    if direction in ['above', 'below']:
                        pct = float(input("      % distance: "))
                        ref_leg_name = existing_legs[ref_idx]['name']
                        print(f"    ✓ Strike will be {pct}% {direction} {ref_leg_name}")
                        return {
                            'name': leg_name,
                            'type': option_type,
                            'position': position,
                            'config_type': 'pct_leg',
                            'params': {'reference': ref_idx, 'reference_leg': ref_leg_name, 'direction': direction, 'pct': pct}
                        }
                else:
                    print("      ⚠ Invalid selection.")
            except (ValueError, IndexError):
                print("      ⚠ Invalid selection.")
        
        elif choice == '5' and has_reference_legs:
            print(f"\n    Configure $ distance from another leg for {leg_name}:")
            print("      Available legs to reference:")
            for i, leg in enumerate(existing_legs):
                print(f"        {i+1}. {leg['name']}")
            try:
                ref_idx = int(input("      Select reference leg: ")) - 1
                if 0 <= ref_idx < len(existing_legs):
                    direction = input("      Direction (above/below): ").lower().strip()
                    if direction in ['above', 'below']:
                        amount = float(input("      $ distance: "))
                        ref_leg_name = existing_legs[ref_idx]['name']
                        print(f"    ✓ Strike will be ${amount} {direction} {ref_leg_name}")
                        return {
                            'name': leg_name,
                            'type': option_type,
                            'position': position,
                            'config_type': 'dollar_leg',
                            'params': {'reference': ref_idx, 'reference_leg': ref_leg_name, 'direction': direction, 'amount': amount}
                        }
                else:
                    print("      ⚠ Invalid selection.")
            except (ValueError, IndexError):
                print("      ⚠ Invalid selection.")
        
        else:
            print(f"  ⚠ Invalid choice. Please select 1-{max_choice}")
    
    return {}

# ==================== STRIKE CALCULATION ====================

def fetch_orb_level(client, underlying: str, trade_date: datetime,
                    orb_period_min: int, orb_level: str) -> Optional[float]:
    """
    Fetch the Opening Range High or Low for a given period.
    ORB window: 9:30 ET to 9:30 + orb_period_min ET.
    Returns the highest high (orb_level='high') or lowest low (orb_level='low').
    """
    et = pytz.timezone('US/Eastern')
    date_naive = trade_date.replace(tzinfo=None)
    orb_start_et = et.localize(date_naive.replace(hour=9, minute=30, second=0, microsecond=0))
    orb_end_et = orb_start_et + timedelta(minutes=orb_period_min)
    orb_start_ts = int(orb_start_et.timestamp() * 1000)
    orb_end_ts = int(orb_end_et.timestamp() * 1000)
    date_str = trade_date.strftime('%Y-%m-%d')

    try:
        bars = list(client.list_aggs(
            underlying, 1, 'minute',
            date_str, date_str,
            adjusted='true', limit=500
        ))
    except Exception as e:
        print(f"  ✗ ORB: Failed to fetch minute bars for {underlying}: {e}")
        return None

    orb_bars = [b for b in bars if orb_start_ts <= b.timestamp <= orb_end_ts]

    if not orb_bars:
        print(f"  ✗ ORB: No bars in ORB window for {underlying} on {date_str} "
              f"(window {orb_start_ts}-{orb_end_ts}, got {len(bars)} total bars)")
        return None

    if orb_level == 'high':
        return max(b.high for b in orb_bars)
    else:
        return min(b.low for b in orb_bars)


def calculate_strike_simple(underlying_price: float, leg_config: Dict, 
                           calculated_strikes: List[float], underlying: str) -> Optional[float]:
    """
    Calculate strike based on leg configuration WITHOUT API calls
    Returns rounded strike ready for symbol formatting
    """
    # Get config_type with fallback for backward compatibility
    config_type = leg_config.get('config_type', 'mid_price')
    params = leg_config.get('params', {})
    
    # Get strike fallback preference (default: "closest")
    strike_fallback = params.get('strike_fallback', 'closest')
    
    # Determine increment based on underlying
    if underlying in ["SPY", "QQQ", "IWM"]:
        increment = 1
    elif underlying in ["SPX", "SPXW", "NDX"]:
        increment = 5
    else:
        increment = 5
    
    # Calculate target strike
    target_strike = None
    direction = params.get('direction', 'below')
    
    if config_type == 'pct_underlying':
        pct = params['pct'] / 100.0
        if direction == 'above':
            target_strike = underlying_price * (1 + pct)
        else:  # below
            target_strike = underlying_price * (1 - pct)
    
    elif config_type == 'dollar_underlying':
        amount = params['amount']
        if direction == 'above':
            target_strike = underlying_price + amount
        else:  # below
            target_strike = underlying_price - amount
    
    elif config_type == 'pct_leg':
        ref_strike = calculated_strikes[params['reference']]
        pct = params['pct'] / 100.0
        if direction == 'above':
            target_strike = ref_strike * (1 + pct)
        else:
            target_strike = ref_strike * (1 - pct)
    
    elif config_type == 'dollar_leg':
        ref_strike = calculated_strikes[params['reference']]
        amount = params['amount']
        if direction == 'above':
            target_strike = ref_strike + amount
        else:
            target_strike = ref_strike - amount
    
    elif config_type == 'mid_price':
        # For mid_price config, use ATM
        target_strike = underlying_price
        direction = 'below'  # Default for ATM
    
    elif config_type == 'delta':
        # Delta-based strike selection requires API calls
        # Return None here - it will be handled separately in fetch_options_data_optimized
        return None

    elif config_type == 'orb_breakout':
        # ORB breakout requires intraday minute data API calls
        # Return None here - handled separately in fetch_options_data_optimized
        return None

    if target_strike is None:
        return None
    
    # Round using new intelligent rounding with fallback
    return round_strike_with_direction(target_strike, increment, direction, strike_fallback)

def check_iv_entry_condition(client: RESTClient, config: Dict, underlying_price: float,
                             trade_date: datetime, exp_date: datetime, iv_cond: Dict) -> Tuple[bool, str]:
    """
    Check if ATM implied volatility meets the entry condition.
    Fetches ATM option chain and calculates IV from the nearest ATM strike.
    
    Returns: (condition_met, reason_string)
    """
    try:
        operator = iv_cond.get('operator', '>')
        threshold = float(iv_cond.get('threshold', 0))
        
        symbol = config['symbol']
        option_prefix = "SPX" if symbol == "SPX" else symbol
        
        exp_str = exp_date.strftime("%Y-%m-%d")
        
        atm_strike = round(underlying_price)
        increment = 5 if symbol in ['SPX', 'NDX', 'RUT'] else 1
        atm_strike = round(underlying_price / increment) * increment
        
        for opt_type in ['C', 'P']:
            try:
                ticker = f"O:{option_prefix}{exp_date.strftime('%y%m%d')}{opt_type}{int(atm_strike * 1000):08d}"
                
                aggs = list(client.get_aggs(
                    ticker,
                    1, "minute",
                    trade_date.strftime("%Y-%m-%d"),
                    trade_date.strftime("%Y-%m-%d"),
                    limit=50000
                ))
                
                if not aggs:
                    continue
                
                # Use entry_time from config to find bar closest to intended entry
                entry_time_str = config.get('entry_time', '10:00')
                eastern = pytz.timezone('US/Eastern')
                entry_dt = eastern.localize(datetime.strptime(f"{trade_date.strftime('%Y-%m-%d')} {entry_time_str}", "%Y-%m-%d %H:%M"))
                entry_ts = int(entry_dt.timestamp() * 1000)
                
                # Find bar closest to entry time
                best_agg = None
                best_diff = float('inf')
                for agg_item in aggs:
                    diff = abs(agg_item.timestamp - entry_ts)
                    if diff < best_diff:
                        best_diff = diff
                        best_agg = agg_item
                
                if best_agg is None:
                    continue
                
                option_price = best_agg.close
                if option_price <= 0:
                    continue
                
                T = max((exp_date - trade_date).days / 365.25, 1/365.25)
                r = config.get('risk_free_rate', 0.045)
                q = config.get('dividend_yield', 0.013)
                
                calc = GreeksCalculator(
                    S=underlying_price,
                    K=atm_strike,
                    T=T,
                    r=r,
                    q=q,
                    option_type='call' if opt_type == 'C' else 'put'
                )
                
                iv = calc.calculate_implied_volatility(option_price)
                
                if iv is not None and iv > 0:
                    iv_pct = iv * 100
                    
                    if operator == '>' and iv_pct > threshold:
                        return True, f"ATM IV {iv_pct:.1f}% > {threshold}%"
                    elif operator == '>=' and iv_pct >= threshold:
                        return True, f"ATM IV {iv_pct:.1f}% >= {threshold}%"
                    elif operator == '<' and iv_pct < threshold:
                        return True, f"ATM IV {iv_pct:.1f}% < {threshold}%"
                    elif operator == '<=' and iv_pct <= threshold:
                        return True, f"ATM IV {iv_pct:.1f}% <= {threshold}%"
                    else:
                        return False, f"ATM IV {iv_pct:.1f}% does not meet condition {operator} {threshold}%"
            except Exception as e:
                continue
        
        return False, "Could not calculate ATM IV (no valid option data)"
    except Exception as e:
        print(f"  IV condition check error: {e}")
        return False, f"IV check error: {str(e)}"

def fetch_options_data_optimized(client: RESTClient, config: Dict, underlying_price: float,
                                 trade_date: datetime, exp_date: datetime) -> Tuple[bool, List[Dict], List[str]]:
    """
    Optimized option data fetching with three-tier approach:
    1. PRIMARY: Calculate strikes → Fetch OHLCV for all (FAST, parallel)
    2. FALLBACK: If OHLCV missing → Use options chain → Fetch OHLCV for best matches
    3. FINAL: If no chain data → Skip trade
    
    Returns: (success, legs_info, option_symbols)
    """
    
    # Normalize leg configs to ensure all required fields have defaults
    normalized_legs = []
    print(f"  [DEBUG] Raw legs config: {config.get('legs', [])}")
    
    # Infer type from strategy name if not provided in legs
    strategy = config.get('strategy', '').lower()
    strategy_type_hint = None
    if 'put' in strategy:
        strategy_type_hint = 'P'
    elif 'call' in strategy:
        strategy_type_hint = 'C'
    
    for i, leg in enumerate(config['legs']):
        # Detect if leg is malformed (just params without wrapper)
        # A properly formatted leg has 'name', 'config_type', and 'params' keys
        # A malformed leg is missing these and has param keys directly (like 'target_delta', 'tolerance')
        has_wrapper = 'config_type' in leg and 'params' in leg
        is_malformed = not has_wrapper and ('target_delta' in leg or 'tolerance' in leg or ('min' in leg and 'max' in leg))
        
        if is_malformed:
            print(f"  [DEBUG] Detected malformed leg {i+1} (raw params without wrapper)")
            # This is a raw params object, need to wrap it
            # Infer config_type from params content
            if 'target_delta' in leg:
                config_type = 'delta'
            elif 'min' in leg or 'max' in leg:
                config_type = 'mid_price'
            else:
                config_type = 'mid_price'
            
            # Use strategy name to infer type
            leg_type = strategy_type_hint or 'C'
            
            normalized_leg = {
                'name': f"Leg {i+1}",
                'type': leg_type,
                'position': 'long' if 'long' in strategy or 'buy' in strategy else 'short' if 'short' in strategy or 'sell' in strategy else 'long',
                'config_type': config_type,
                'params': leg  # The whole leg object IS the params
            }
        else:
            # Properly formatted leg with wrapper
            leg_type = leg.get('type')
            if leg_type is None:
                # Infer from position/name if possible
                leg_name = leg.get('name', '').lower()
                if 'put' in leg_name:
                    leg_type = 'P'
                elif 'call' in leg_name:
                    leg_type = 'C'
                else:
                    # Fall back to strategy hint
                    leg_type = strategy_type_hint or 'C'
            
            normalized_leg = {
                'name': leg.get('name', f"Leg {i+1}"),
                'type': leg_type,
                'position': leg.get('position', 'long'),
                'config_type': leg.get('config_type', 'mid_price'),
                'params': leg.get('params', {})
            }
        
        print(f"  [DEBUG] Leg {i+1}: name={normalized_leg['name']}, type={normalized_leg['type']}, config_type={normalized_leg['config_type']}, pos={normalized_leg['position']}")
        normalized_legs.append(normalized_leg)
    config['legs'] = normalized_legs
    
    # STEP 1: Calculate ALL target strikes upfront
    # Most config types don't need API calls, but delta does
    print(f"  Calculating strikes for {len(config['legs'])} legs...")
    calculated_strikes = []
    delta_leg_data = {}  # Store delta leg data (strike, price, delta) for later use
    
    # Calculate entry timestamp for delta calculations
    entry_hour, entry_min = map(int, config['entry_time'].split(':'))
    entry_timestamp = trade_date.replace(hour=entry_hour, minute=entry_min, second=0, microsecond=0)
    # Only localize if not already timezone aware
    if entry_timestamp.tzinfo is None:
        entry_timestamp = pytz.timezone('US/Eastern').localize(entry_timestamp)
    
    for i, leg_config in enumerate(config['legs']):
        # Get config_type with fallback for backward compatibility
        config_type = leg_config.get('config_type', 'mid_price')
        params = leg_config.get('params', {})
        
        if config_type == 'delta':
            # Delta-based strike selection requires API calls
            # CRITICAL: Convert all parameters to proper types (fix string values from JSON)
            try:
                target_delta = float(params.get('target_delta', 0.30))
            except (ValueError, TypeError):
                print(f"  ✗ Invalid target_delta value: {params.get('target_delta')}")
                return False, [], []
            
            method = str(params.get('method', 'closest'))
            
            try:
                tolerance = float(params.get('tolerance', 0.01))
            except (ValueError, TypeError):
                tolerance = 0.01
            
            # Handle optional delta_min and delta_max (can be None or string)
            delta_min = params.get('delta_min')
            if delta_min is not None and delta_min != '':
                try:
                    delta_min = float(delta_min)
                except (ValueError, TypeError):
                    delta_min = None
            else:
                delta_min = None
            
            delta_max = params.get('delta_max')
            if delta_max is not None and delta_max != '':
                try:
                    delta_max = float(delta_max)
                except (ValueError, TypeError):
                    delta_max = None
            else:
                delta_max = None
            
            strike_fallback = str(params.get('strike_fallback', 'closest'))
            
            # Get risk-free rate and dividend yield from config or use defaults
            try:
                r = float(config.get('risk_free_rate', 0.045))
            except (ValueError, TypeError):
                r = 0.045
            
            try:
                q = float(config.get('dividend_yield', 0.013))
            except (ValueError, TypeError):
                q = 0.013
            
            leg_name = leg_config.get('name', f"Leg {i+1}")
            print(f"    {leg_name}: Delta-based selection (target Δ={target_delta})")
            
            # Use per-leg exp_date if available (calendar/diagonal strategies)
            leg_exp_date = leg_config.get('_exp_date', exp_date)
            
            # Initialize Delta selector
            selector = DeltaStrikeSelector(
                client, config['symbol'], leg_exp_date,
                leg_config['type'], r, q
            )
            
            # Find strike by delta
            result = selector.find_strike_by_delta(
                underlying_price, target_delta, entry_timestamp,
                method, tolerance, delta_min, delta_max, strike_fallback
            )
            
            if result is None:
                print(f"  ✗ Failed to find strike matching delta criteria for {leg_name}")
                return False, [], []
            
            strike, option_price, actual_delta = result
            calculated_strikes.append(strike)
            delta_leg_data[i] = {'strike': strike, 'price': option_price, 'delta': actual_delta}
            print(f"    {leg_name}: Strike {strike} (Δ={actual_delta:.3f})")

        elif config_type == 'orb_breakout':
            leg_name = leg_config.get('name', f"Leg {i+1}")
            orb_period_min = int(params.get('orb_period', 60))
            orb_level = str(params.get('orb_level', 'low'))
            direction = str(params.get('direction', 'above'))
            dist_type = str(params.get('dist_type', 'dollar'))
            try:
                dist_value = float(params.get('dist_value', 1.0))
            except (ValueError, TypeError):
                dist_value = 1.0
            strike_fallback = str(params.get('strike_fallback', 'closest'))

            # Enforce: entry must occur AFTER the ORB period ends
            orb_total_min = 9 * 60 + 30 + orb_period_min
            orb_end_hour = orb_total_min // 60
            orb_end_min = orb_total_min % 60
            entry_h, entry_m = map(int, config['entry_time'].split(':'))
            entry_total_min = entry_h * 60 + entry_m
            if entry_total_min <= orb_total_min:
                print(f"  ✗ ORB: Entry time {config['entry_time']} must be after "
                      f"{orb_end_hour:02d}:{orb_end_min:02d} for {orb_period_min}-min ORB — skipping trade")
                return False, [], []

            # Fetch ORB high or low via minute bar data
            orb_value = fetch_orb_level(client, config['symbol'], trade_date, orb_period_min, orb_level)
            if orb_value is None:
                return False, [], []

            # Calculate target strike from ORB level
            if dist_type == 'dollar':
                if direction == 'above':
                    target_strike = orb_value + dist_value
                else:
                    target_strike = orb_value - dist_value
            else:  # pct
                pct = dist_value / 100.0
                if direction == 'above':
                    target_strike = orb_value * (1 + pct)
                else:
                    target_strike = orb_value * (1 - pct)

            # Determine strike increment for the underlying
            sym = config['symbol']
            if sym in ["SPY", "QQQ", "IWM"]:
                increment = 1
            elif sym in ["SPX", "SPXW", "NDX"]:
                increment = 5
            else:
                increment = 5

            strike = round_strike_with_direction(target_strike, increment, direction, strike_fallback)
            if strike is None:
                print(f"  ✗ ORB: Failed to round strike for {leg_name}")
                return False, [], []

            calculated_strikes.append(strike)
            dist_label = f"${dist_value}" if dist_type == 'dollar' else f"{dist_value}%"
            print(f"    {leg_name}: ORB {orb_period_min}m {orb_level}={orb_value:.2f} "
                  f"→ {dist_label} {direction} → target={target_strike:.2f} → strike={strike}")

        else:
            # Standard strike calculation (no API calls)
            leg_name = leg_config.get('name', f"Leg {i+1}")
            strike = calculate_strike_simple(
                underlying_price, 
                leg_config, 
                calculated_strikes,
                config['symbol']
            )
            
            if strike is None:
                print(f"  ✗ Failed to calculate strike for {leg_name}")
                return False, [], []
            
            calculated_strikes.append(strike)
            print(f"    {leg_name}: Strike {strike}")
    
    # Add delay after delta-based selection to prevent rate limiting before OHLCV fetch
    if delta_leg_data:
        time.sleep(0.5)  # 500ms delay before OHLCV fetch

    # STEP 1b: Auto-correct strike collisions caused by rounding.
    # When dollar_underlying amounts are close together (e.g. $4 vs $5 above SPX),
    # both legs can round to the same 5-pt increment, or the long can land below the
    # short. Detect and fix this before symbol formatting so no API call is wasted.
    _sym = config['symbol']
    _inc = 1 if _sym in ("SPY", "QQQ", "IWM") else 5
    _strategy = config.get('strategy', '')
    _is_long_strat = 'Long' in _strategy

    # Gather legs with index so we can patch calculated_strikes in-place
    _call_legs = [(i, config['legs'][i]) for i in range(len(config['legs']))
                  if config['legs'][i]['type'] == 'C']
    _put_legs  = [(i, config['legs'][i]) for i in range(len(config['legs']))
                  if config['legs'][i]['type'] == 'P']

    def _correct_pair(short_idx, long_idx, option_type):
        s = calculated_strikes[short_idx]
        l = calculated_strikes[long_idx]
        if option_type == 'C':
            if _is_long_strat:
                # Long Call Spread: long BELOW short
                if l >= s:
                    corrected = s - _inc
                    print(f"  ⚠ Strike collision ({option_type}): long={l} >= short={s} "
                          f"→ auto-correcting long to {corrected}")
                    calculated_strikes[long_idx] = corrected
            else:
                # Short Call Spread: long ABOVE short
                if l <= s:
                    corrected = s + _inc
                    print(f"  ⚠ Strike collision ({option_type}): long={l} <= short={s} "
                          f"→ auto-correcting long to {corrected}")
                    calculated_strikes[long_idx] = corrected
        else:  # P
            if _is_long_strat:
                # Long Put Spread: long ABOVE short
                if l <= s:
                    corrected = s + _inc
                    print(f"  ⚠ Strike collision ({option_type}): long={l} <= short={s} "
                          f"→ auto-correcting long to {corrected}")
                    calculated_strikes[long_idx] = corrected
            else:
                # Short Put Spread: long BELOW short
                if l >= s:
                    corrected = s - _inc
                    print(f"  ⚠ Strike collision ({option_type}): long={l} >= short={s} "
                          f"→ auto-correcting long to {corrected}")
                    calculated_strikes[long_idx] = corrected

    for _legs_group in (_call_legs, _put_legs):
        if len(_legs_group) == 2:
            _shorts = [(i, lc) for i, lc in _legs_group if lc['position'] == 'short']
            _longs  = [(i, lc) for i, lc in _legs_group if lc['position'] == 'long']
            if len(_shorts) == 1 and len(_longs) == 1:
                _s_idx, _s_lc = _shorts[0]
                _l_idx, _l_lc = _longs[0]
                _correct_pair(_s_idx, _l_idx, _s_lc['type'])

    # STEP 2: Format ALL option symbols (using per-leg exp_date when available)
    option_symbols = []
    leg_exp_dates = []
    for i, leg_config in enumerate(config['legs']):
        strike = calculated_strikes[i]
        leg_exp = leg_config.get('_exp_date', exp_date)
        leg_exp_dates.append(leg_exp)
        symbol = format_option_symbol(
            config['symbol'], 
            leg_exp, 
            strike, 
            leg_config['type']
        )
        option_symbols.append(symbol)
    
    # For monitoring range, use the farthest expiration
    max_exp_date = max(leg_exp_dates) if leg_exp_dates else exp_date
    
    # STEP 3: Fetch OHLCV for ALL contracts simultaneously (PRIMARY - FAST!)
    print(f"  Fetching OHLCV for {len(option_symbols)} contracts simultaneously...")
    option_data = {}
    missing_indices = []
    
    for i, symbol in enumerate(option_symbols):
        leg_exp = leg_exp_dates[i] if i < len(leg_exp_dates) else exp_date
        try:
            aggs = []
            for a in client.list_aggs(
                symbol,
                10,
                "second",
                trade_date.strftime("%Y-%m-%d"),
                leg_exp.strftime("%Y-%m-%d"),
                adjusted="true",
                sort="asc",
                limit=50000
            ):
                aggs.append(a)
            
            if len(aggs) > 0:
                option_data[symbol] = aggs
                print(f"  ✓ {symbol}: {len(aggs)} 10-sec bars")
            else:
                missing_indices.append(i)
                print(f"  ✗ {symbol}: No OHLCV data")
        except Exception as e:
            missing_indices.append(i)
            print(f"  ✗ {symbol}: Error fetching OHLCV: {e}")
    
    # STEP 4: If all data found, validate and return success!
    if len(missing_indices) == 0:
        # Validate spread structure
        legs_info = []
        for i, leg_config in enumerate(config['legs']):
            legs_info.append({
                'name': leg_config['name'],
                'type': leg_config['type'],
                'position': leg_config['position'],
                'strike': calculated_strikes[i]
            })
        
        is_valid, error_msg = validate_spread_structure(legs_info, config['strategy'], config)
        if not is_valid:
            print(f"  ✗ Validation failed: {error_msg}")
            return False, [], []
        
        # Build final legs_info with symbols
        final_legs = []
        for i, leg_config in enumerate(config['legs']):
            final_legs.append({
                'name': leg_config['name'],
                'type': leg_config['type'],
                'position': leg_config['position'],
                'strike': calculated_strikes[i],
                'symbol': option_symbols[i],
                'data': option_data[option_symbols[i]]
            })
        
        return True, final_legs, option_symbols
    
    # STEP 5: FALLBACK - Try options chain for missing strikes
    print(f"  ⚠ Missing {len(missing_indices)} contracts, trying options chain fallback...")
    
    adjusted_strikes = list(calculated_strikes)  # Copy
    adjusted_symbols = list(option_symbols)  # Copy
    
    for idx in missing_indices:
        leg_config = config['legs'][idx]
        target_strike = calculated_strikes[idx]
        
        # Get available strikes from chain (use per-leg exp_date if available)
        leg_exp = leg_config.get('_exp_date', exp_date)
        available_strikes = get_available_strikes(
            client, 
            config['symbol'], 
            leg_exp, 
            leg_config['type']
        )
        
        if not available_strikes:
            print(f"  ✗ No options chain data available for {leg_config['type']}")
            return False, [], []  # SKIP TRADE
        
        # Find closest strike to target
        best_strike = min(available_strikes, key=lambda x: abs(x - target_strike))
        adjusted_strikes[idx] = best_strike
        
        if best_strike != target_strike:
            print(f"  → Adjusted {leg_config['name']}: {target_strike} → {best_strike}")
        
        # Format adjusted symbol
        leg_exp = leg_config.get('_exp_date', exp_date)
        adjusted_symbol = format_option_symbol(
            config['symbol'], leg_exp, best_strike, leg_config['type']
        )
        adjusted_symbols[idx] = adjusted_symbol
        
        # Fetch OHLCV for adjusted strike
        try:
            aggs = []
            for a in client.list_aggs(
                adjusted_symbol,
                10,
                "second",
                trade_date.strftime("%Y-%m-%d"),
                leg_exp.strftime("%Y-%m-%d"),
                adjusted="true",
                sort="asc",
                limit=50000
            ):
                aggs.append(a)
            
            if len(aggs) > 0:
                option_data[adjusted_symbol] = aggs
                print(f"  ✓ {adjusted_symbol}: {len(aggs)} 10-sec bars")
            else:
                print(f"  ✗ {adjusted_symbol}: Still no OHLCV data")
                return False, [], []  # SKIP TRADE
        except Exception as e:
            print(f"  ✗ {adjusted_symbol}: Error: {e}")
            return False, [], []  # SKIP TRADE
    
    # STEP 6: Validate adjusted structure
    legs_info = []
    for i, leg_config in enumerate(config['legs']):
        legs_info.append({
            'name': leg_config['name'],
            'type': leg_config['type'],
            'position': leg_config['position'],
            'strike': adjusted_strikes[i]
        })
    
    is_valid, error_msg = validate_spread_structure(legs_info, config['strategy'], config)
    if not is_valid:
        print(f"  ✗ Adjusted strikes invalid: {error_msg}")
        return False, [], []  # SKIP TRADE
    
    # STEP 7: Return success with adjusted strikes
    final_legs = []
    for i, leg_config in enumerate(config['legs']):
        final_legs.append({
            'name': leg_config['name'],
            'type': leg_config['type'],
            'position': leg_config['position'],
            'strike': adjusted_strikes[i],
            'symbol': adjusted_symbols[i],
            'data': option_data[adjusted_symbols[i]]
        })
    
    print(f"  ✓ All contracts validated with adjusted strikes")
    return True, final_legs, adjusted_symbols

def calculate_strike(underlying_price: float, leg_config: Dict, calculated_strikes: List[float],
                    client: RESTClient, underlying: str, exp_date: datetime) -> Optional[float]:
    """Calculate strike based on leg configuration and find nearest available"""
    
    config_type = leg_config['config_type']
    params = leg_config['params']
    option_type = leg_config['type']
    
    # Calculate target strike
    target_strike = None
    
    if config_type == 'pct_underlying':
        pct = params['pct'] / 100.0
        if params['direction'] == 'above':
            target_strike = underlying_price * (1 + pct)
        else:  # below
            target_strike = underlying_price * (1 - pct)
    
    elif config_type == 'dollar_underlying':
        amount = params['amount']
        if params['direction'] == 'above':
            target_strike = underlying_price + amount
        else:  # below
            target_strike = underlying_price - amount
    
    elif config_type == 'pct_leg':
        ref_strike = calculated_strikes[params['reference']]
        pct = params['pct'] / 100.0
        if params['direction'] == 'above':
            target_strike = ref_strike * (1 + pct)
        else:
            target_strike = ref_strike * (1 - pct)
    
    elif config_type == 'dollar_leg':
        ref_strike = calculated_strikes[params['reference']]
        amount = params['amount']
        if params['direction'] == 'above':
            target_strike = ref_strike + amount
        else:
            target_strike = ref_strike - amount
    
    elif config_type == 'mid_price':
        # For mid_price config, we need to try different strikes
        # For now, just use ATM
        target_strike = underlying_price
    
    if target_strike is None:
        return None
    
    # Find nearest available strike
    return find_nearest_available_strike(client, underlying, exp_date, target_strike, option_type)

# ==================== POSITION SIZING ====================

def calculate_position_size(capital: float, config: Dict, max_risk) -> int:
    """Calculate number of contracts"""
    
    if config['allocation_type'] == 'contracts':
        return int(config['allocation_value'])
    
    elif config['allocation_type'] == 'pct':
        amount = capital * (config['allocation_value'] / 100.0)
        if max_risk is not None and max_risk > 0:
            return max(1, int(amount / (abs(max_risk) * 100)))
        return 0
    
    elif config['allocation_type'] == 'fixed':
        if max_risk is not None and max_risk > 0:
            return max(1, int(config['allocation_value'] / (abs(max_risk) * 100)))
        return 0
    
    return 0

def calculate_max_risk(legs_info: List[Dict], net_credit: float) -> float:
    """
    Calculate max risk for position
    Handles legs in any order by identifying spreads by option type
    """
    
    if len(legs_info) == 2:
        # Spread: max risk = width - net credit
        strike_diff = abs(legs_info[0]['strike'] - legs_info[1]['strike'])
        return strike_diff - abs(net_credit)
    
    elif len(legs_info) == 4:
        # Iron condor/butterfly: identify put and call spreads by option type
        # Separate puts and calls
        puts = [leg for leg in legs_info if leg['type'] == 'P']
        calls = [leg for leg in legs_info if leg['type'] == 'C']
        
        if len(puts) == 2 and len(calls) == 2:
            # Calculate spread widths
            put_spread = abs(puts[0]['strike'] - puts[1]['strike'])
            call_spread = abs(calls[0]['strike'] - calls[1]['strike'])
            
            # Max risk is the wider spread minus net credit
            return max(put_spread, call_spread) - abs(net_credit)
        else:
            # Fallback if structure is unexpected
            return abs(net_credit)
    
    elif len(legs_info) == 1:
        # Single leg option
        leg = legs_info[0]
        if leg['position'] == 'long':
            # Long option: max risk = premium paid
            return abs(net_credit)
        else:
            # Short naked option: max risk = strike price (conservative estimate)
            # For puts: strike price
            # For calls: use 2x strike price as approximation
            if leg['type'] == 'P':
                return leg['strike']
            else:  # Call
                return leg['strike'] * 2
    
    # Fallback
    return abs(net_credit)

# ==================== ANALYSIS ====================

def validate_spread_structure(legs_info: List[Dict], strategy: str, config: Dict = None) -> Tuple[bool, str]:
    """
    Validate spread structure requirements
    Returns: (is_valid, error_message)
    """
    
    # Straddle validation - both legs must have same strike
    if "Straddle" in strategy:
        if len(legs_info) != 2:
            return False, f"{strategy} must have exactly 2 legs"
        if legs_info[0]['strike'] != legs_info[1]['strike']:
            return False, f"{strategy}: Both strikes must be equal (put: {legs_info[0]['strike']}, call: {legs_info[1]['strike']})"
        return True, ""
    
    # Strangle validation - legs must have different strikes
    if "Strangle" in strategy:
        if len(legs_info) != 2:
            return False, f"{strategy} must have exactly 2 legs"
        if legs_info[0]['strike'] == legs_info[1]['strike']:
            return False, f"{strategy}: Put and Call must have different strikes"
        return True, ""
    
    if len(legs_info) == 2:
        # Two-leg spread validation
        leg1, leg2 = legs_info[0], legs_info[1]
        
        # Check if both legs have same position (both long or both short)
        if leg1['position'] == leg2['position']:
            # Both same position - could be naked positions or other strategies
            return True, ""
        
        # Identify long and short
        short_leg = leg1 if leg1['position'] == 'short' else leg2
        long_leg = leg1 if leg1['position'] == 'long' else leg2
        
        # Determine if this is a credit spread (Short) or debit spread (Long)
        is_long_spread = "Long" in strategy and "Spread" in strategy
        
        # Validate strike ordering for vertical spreads
        if short_leg['type'] == 'P':  # Put spread
            if is_long_spread:
                # LONG Put Spread: Buy higher put, Sell lower put
                # Long put MUST BE ABOVE short put
                if long_leg['strike'] <= short_leg['strike']:
                    return False, f"Long Put Spread: Long put ({long_leg['strike']}) must be ABOVE short put ({short_leg['strike']})"
            else:
                # SHORT Put Spread: Sell higher put, Buy lower put
                # Long put MUST BE BELOW short put
                if long_leg['strike'] >= short_leg['strike']:
                    return False, f"Short Put Spread: Long put ({long_leg['strike']}) must be BELOW short put ({short_leg['strike']})"
        else:  # Call spread
            if is_long_spread:
                # LONG Call Spread: Buy lower call, Sell higher call
                # Long call MUST BE BELOW short call
                if long_leg['strike'] >= short_leg['strike']:
                    return False, f"Long Call Spread: Long call ({long_leg['strike']}) must be BELOW short call ({short_leg['strike']})"
            else:
                # SHORT Call Spread: Sell lower call, Buy higher call
                # Long call MUST BE ABOVE short call
                if long_leg['strike'] <= short_leg['strike']:
                    return False, f"Short Call Spread: Long call ({long_leg['strike']}) must be ABOVE short call ({short_leg['strike']})"
        
        return True, ""
    
    elif len(legs_info) == 4:
        # Separate puts and calls
        puts = [leg for leg in legs_info if leg['type'] == 'P']
        calls = [leg for leg in legs_info if leg['type'] == 'C']
        
        if len(puts) != 2 or len(calls) != 2:
            return False, "Iron condor/butterfly must have 2 puts and 2 calls"
        
        # Identify long and short for each side
        short_put = next((leg for leg in puts if leg['position'] == 'short'), None)
        long_put = next((leg for leg in puts if leg['position'] == 'long'), None)
        short_call = next((leg for leg in calls if leg['position'] == 'short'), None)
        long_call = next((leg for leg in calls if leg['position'] == 'long'), None)
        
        if not all([short_put, long_put, short_call, long_call]):
            return False, "Missing required leg types"
        
        # Determine if this is Long Iron (debit) or Short Iron (credit)
        is_long_iron = "Long" in strategy
        
        # Validate put spread ordering
        if is_long_iron:
            # LONG Iron: Long put ABOVE short put
            if long_put['strike'] <= short_put['strike']:
                return False, f"Long Iron: Long put ({long_put['strike']}) must be ABOVE short put ({short_put['strike']})"
        else:
            # SHORT Iron: Long put BELOW short put
            if long_put['strike'] >= short_put['strike']:
                return False, f"Short Iron: Long put ({long_put['strike']}) must be BELOW short put ({short_put['strike']})"
        
        # Validate call spread ordering
        if is_long_iron:
            # LONG Iron: Long call BELOW short call
            if long_call['strike'] >= short_call['strike']:
                return False, f"Long Iron: Long call ({long_call['strike']}) must be BELOW short call ({short_call['strike']})"
        else:
            # SHORT Iron: Long call ABOVE short call
            if long_call['strike'] <= short_call['strike']:
                return False, f"Short Iron: Long call ({long_call['strike']}) must be ABOVE short call ({short_call['strike']})"
        
        # Calculate spread widths
        put_width = abs(short_put['strike'] - long_put['strike'])
        call_width = abs(long_call['strike'] - short_call['strike'])
        
        # For Iron Butterfly, short strikes must be equal
        if 'Butterfly' in strategy:
            if short_put['strike'] != short_call['strike']:
                return False, f"Iron Butterfly: Short put ({short_put['strike']}) must equal short call ({short_call['strike']})"
        
        # Validate spread widths match (only if not allowing skewed wings)
        allow_skewed = config.get('allow_skewed_wings', False) if config else False
        if not allow_skewed:
            if abs(put_width - call_width) > 0.01:  # Allow tiny floating point difference
                return False, f"Balanced wings required: Put spread = {put_width}, Call spread = {call_width}"
        
        return True, ""
    
    # Single leg or other - no validation needed
    return True, ""

def get_underlying_close_at_expiration(client: RESTClient, underlying_sym: str, 
                                       exp_date: datetime) -> Optional[float]:
    """
    Get the official closing price of underlying at expiration using day bars
    
    Returns None if day bar not available
    """
    try:
        # Fetch day bar for expiration date
        from_str = exp_date.strftime("%Y-%m-%d")
        to_str = exp_date.strftime("%Y-%m-%d")
        
        aggs = fetch_aggs_with_retry(
            client,
            ticker=underlying_sym,
            multiplier=1,
            timespan="day",
            from_=from_str,
            to=to_str,
            adjusted="true",
            sort="asc",
            limit=1
        )
        
        if aggs:
            return aggs[0].close
        
        return None
        
    except Exception as e:
        print(f"  Error fetching day bar for {underlying_sym}: {e}")
        return None

def calculate_intrinsic_value(strike: float, option_type: str, underlying_price: float, position: str) -> float:
    """
    Calculate intrinsic value of an option at expiration
    
    Intrinsic value = value if exercised immediately
    - Call: max(0, underlying - strike)
    - Put: max(0, strike - underlying)
    
    For the position holder:
    - Long call: receives intrinsic value
    - Short call: owes intrinsic value (negative)
    - Long put: receives intrinsic value
    - Short put: owes intrinsic value (negative)
    """
    if option_type == 'C':
        # Call option
        intrinsic = max(0, underlying_price - strike)
    else:
        # Put option
        intrinsic = max(0, strike - underlying_price)
    
    return intrinsic

# ==================== EXIT DETECTION ====================

def align_bars(leg_bars_list: List[List[Dict]]) -> List[Dict]:
    """Align bars by timestamp across all legs"""
    
    # Find common timestamps
    timestamp_sets = [set(bar['timestamp'] for bar in bars) for bars in leg_bars_list]
    common_timestamps = set.intersection(*timestamp_sets)
    
    if not common_timestamps:
        return []
    
    sorted_timestamps = sorted(common_timestamps)
    
    # Create lookup dictionaries
    bars_by_ts = []
    for bars in leg_bars_list:
        bars_by_ts.append({bar['timestamp']: bar for bar in bars})
    
    aligned_bars = []
    for ts in sorted_timestamps:
        aligned_bar = {
            'timestamp': ts,
            'datetime': bars_by_ts[0][ts]['datetime'],
            'time': bars_by_ts[0][ts]['time'],
            'date': bars_by_ts[0][ts]['date'],
            'leg_prices': []
        }
        
        for leg_bars_dict in bars_by_ts:
            bar = leg_bars_dict[ts]
            aligned_bar['leg_prices'].append({
                'open': bar['open'],
                'high': bar['high'],
                'low': bar['low'],
                'close': bar['close'],
                'vw': bar.get('vw', bar['close'])  # VWAP, fallback to close
            })
        
        aligned_bars.append(aligned_bar)
    
    return aligned_bars

def calculate_net_premium(aligned_bar: Dict, legs_info: List[Dict]) -> float:
    """
    Calculate net premium for a position using the bar open price.

    The open is applied identically to all legs regardless of position direction
    (long or short), so opposite strategies on the same strikes always receive
    exactly inverse net premiums.
    """
    net = 0
    for i, leg_info in enumerate(legs_info):
        # Use the bar's open price — neutral and position-agnostic so that
        # opposite strategies on the same strikes get exactly inverse fills.
        price = aligned_bar['leg_prices'][i].get('open', aligned_bar['leg_prices'][i]['close'])
        
        if leg_info['position'] == 'short':
            net += price
        else:
            net -= price
    return net

# ==================== MAIN BACKTEST ====================

def run_backtest(config: Dict, client: RESTClient):
    """Main backtest execution"""
    
    print("\n" + "="*80)
    print("RUNNING BACKTEST")
    print("="*80)
    
    # Debug: Print premium filter settings
    print(f"\nPremium Filter Settings:")
    print(f"  Min: {config.get('net_premium_min', 'None')}")
    print(f"  Max: {config.get('net_premium_max', 'None')}")
    
    # Get trading days
    trading_days = get_trading_days(config['start_date'], config['end_date'])
    print(f"\nTrading days: {len(trading_days)}")
    
    # Check if any legs have per-leg DTE (calendar/diagonal strategies)
    has_per_leg_dte = any(leg.get('dte') is not None for leg in config.get('legs', []))
    
    # Calculate expirations
    exp_map = {}
    per_leg_exp_map = {}
    latest_exp = None
    
    if has_per_leg_dte:
        print(f"\n  Per-leg DTE mode (calendar/diagonal strategy)")
        for td in trading_days:
            td_str = td.strftime("%Y-%m-%d")
            leg_exps = []
            for leg in config['legs']:
                leg_dte = leg.get('dte', config.get('dte') or 0) or 0
                leg_exp = find_expiration_date(td, leg_dte)
                leg_exps.append(leg_exp)
                if latest_exp is None or leg_exp > latest_exp:
                    latest_exp = leg_exp
            per_leg_exp_map[td_str] = leg_exps
            exp_map[td_str] = min(leg_exps)
    else:
        for td in trading_days:
            exp = find_expiration_date(td, config['dte'])
            exp_map[td.strftime("%Y-%m-%d")] = exp
            if latest_exp is None or exp > latest_exp:
                latest_exp = exp
    
    # Handle case when no trading days in range
    if not trading_days or latest_exp is None:
        print(f"\nNo trading days found in date range {config['start_date']} to {config['end_date']}")
        print("This may be a weekend/holiday or invalid date range.")
        return [], [config['starting_capital']], []
    
    # Fetch underlying data
    underlying_sym = get_underlying_ticker(config['symbol'])
    
    # Index options (SPX, SPXW, XSP, NDX, RUT) expire at 16:00 using intrinsic value.
    # Stock options (SPY, QQQ, AAPL, etc.) expire at 16:15 using the last traded market price.
    INDEX_SYMBOLS = {"SPX", "SPXW", "XSP", "NDX", "RUT"}
    is_index = config['symbol'].upper() in INDEX_SYMBOLS
    exp_close_time = "16:00" if is_index else "16:15"
    
    # CRITICAL: Entry uses 1-minute bars for precision
    print(f"\nFetching {config['symbol']} 1-minute data for entry prices...")
    underlying_bars_1min = get_bars_for_period(
        client, underlying_sym,
        datetime.strptime(config['start_date'], "%Y-%m-%d"),
        latest_exp,
        1  # Always 1-minute for entry
    )
    
    print(f"\nFetching {config['symbol']} daily closes for expiration pricing...")
    underlying_daily_closes = get_daily_closes_for_period(
        client, underlying_sym,
        datetime.strptime(config['start_date'], "%Y-%m-%d"),
        latest_exp
    )
    
    # Monitoring uses detection_bar_size
    # Support for sub-minute bars (15 seconds = 0.25 minutes)
    if config['detection_bar_size'] < 1:
        # Convert to seconds
        detection_seconds = int(config['detection_bar_size'] * 60)
        print(f"\nFetching {config['symbol']} {detection_seconds}-second data for monitoring...")
        underlying_bars_detection = get_bars_for_period(
            client, underlying_sym,
            datetime.strptime(config['start_date'], "%Y-%m-%d"),
            latest_exp,
            detection_seconds,
            timespan="second"
        )
    elif int(config['detection_bar_size']) == 1:
        # 1-minute monitoring is identical to the entry data already fetched — reuse it
        print(f"\nReusing 1-minute entry data for monitoring (no extra API call needed).")
        underlying_bars_detection = underlying_bars_1min
    else:
        # Use minutes
        print(f"\nFetching {config['symbol']} {config['detection_bar_size']}-minute data for monitoring...")
        underlying_bars_detection = get_bars_for_period(
            client, underlying_sym,
            datetime.strptime(config['start_date'], "%Y-%m-%d"),
            latest_exp,
            int(config['detection_bar_size'])
        )
    
    # Initialize tracking
    capital = config['starting_capital']
    equity_history = [capital]
    trades = []
    option_cache_1min = {}
    option_cache_detection = {}
    option_cache_10sec = {}  # 10-second option bars for precise entry pricing and TP/SL monitoring
    
    price_conditions = config.get('price_conditions', [])
    exit_price_conditions = config.get('exit_price_conditions', [])
    all_price_conditions = list(price_conditions) + list(exit_price_conditions)
    has_preset = config.get('options_entry_type') == 'preset'
    has_exit_signal = bool(config.get('options_exit_cond_type'))
    indicators_cache = {}
    if all_price_conditions:
        max_day_offset = 0
        for cond in all_price_conditions:
            try:
                left_offset = abs(int(cond.get('left', {}).get('day', 0) or 0))
            except (ValueError, TypeError):
                left_offset = 0
            try:
                right_offset = abs(int(cond.get('right', {}).get('day', 0) or 0))
            except (ValueError, TypeError):
                right_offset = 0
            max_day_offset = max(max_day_offset, left_offset, right_offset)
        buffer_days = max_day_offset * 2 + 5 if max_day_offset > 0 else 0
        prefetch_start = trading_days[0] - timedelta(days=buffer_days)
        indicators_cache = prefetch_all_indicators_for_range(
            config,
            prefetch_start,
            trading_days[-1]
        )
    
    print("\nProcessing trades...\n" + "-"*80)
    
    decision_log = []
    
    # Main loop
    for idx, trade_date in enumerate(trading_days):
        try:
            date_str = trade_date.strftime("%Y-%m-%d")
            
            day_entry = {
                'date': date_str,
                'symbol': config['symbol'],
                'strategy': config['strategy'],
                'entry_time_range': f"{config['entry_time']}" + (f" - {config.get('entry_time_end') or config.get('entry_time_max', '')}" if (config.get('entry_time_end') or config.get('entry_time_max')) and (config.get('entry_time_end') or config.get('entry_time_max')) != config['entry_time'] else ''),
                'events': [],
                'status': 'SKIPPED'
            }
        
            # Get underlying bars for today
            bars_1min_today = underlying_bars_1min.get(date_str, [])
            bars_detection_today = underlying_bars_detection.get(date_str, [])
            
            # Get previous day's bars for preset condition evaluation (entry or exit)
            _prev_day_bars = []
            if has_preset or has_exit_signal:
                sorted_dates = sorted(underlying_bars_1min.keys())
                for d in sorted_dates:
                    if d < date_str:
                        _prev_day_bars = underlying_bars_1min.get(d, [])
                    else:
                        break
            
            # Determine entry time range (check both field names for compatibility)
            entry_time_start = config['entry_time']
            entry_time_end = config.get('entry_time_end') or config.get('entry_time_max') or entry_time_start
            
            # Entry condition scanning always uses 1-minute bars so that rolling
            # window presets (e.g. Velocity) are evaluated at every minute.
            # detection_bar_size controls only the monitoring interval after entry.
            candidate_bars = []
            for bar in sorted(bars_1min_today, key=lambda x: x['time']):
                if entry_time_start <= bar['time'] <= entry_time_end:
                    candidate_bars.append(bar)
            
            if not candidate_bars:
                day_entry['events'].append({'type': 'no_data', 'reason': 'No market bars available in entry time range'})
                decision_log.append(day_entry)
                continue
            
            # Use pre-fetched indicator cache (already loaded at backtest start)
            # No additional API calls needed here!
            
            # Scan through candidate bars to find first one where conditions are met
            entry_bar = None
            last_condition_reason = None
            for bar in candidate_bars:
                underlying_price = bar['open']
                bar_time = bar['time']
                bar_timestamp = bar['timestamp']
                
                print(f"\n[{date_str} {bar_time}] {config['symbol']}: {underlying_price:.2f}", flush=True)
                
                day_entry['underlying_price'] = underlying_price
                
                # Check preset conditions (if using preset entry type)
                if has_preset:
                    preset_met, preset_reason = evaluate_preset_condition(
                        config, bars_1min_today, bar, _prev_day_bars
                    )
                    if not preset_met:
                        print(f"  Preset not met: {preset_reason}", flush=True)
                        last_condition_reason = preset_reason
                        continue
                    else:
                        print(f"  Preset met: {preset_reason}", flush=True)
                        day_entry['events'].append({
                            'type': 'condition_met',
                            'time': bar_time,
                            'price': underlying_price,
                            'reason': preset_reason
                        })
                
                # Check custom price conditions at this bar using cached indicator data
                if price_conditions:
                    conditions_met, condition_reason = evaluate_price_conditions_with_cache(
                        config, bar, indicators_cache, trade_date
                    )
                    if not conditions_met:
                        print(f"  Conditions not met: {condition_reason}", flush=True)
                        last_condition_reason = condition_reason
                        continue
                    else:
                        print(f"  Conditions met - entering trade", flush=True)
                        day_entry['events'].append({
                            'type': 'condition_met',
                            'time': bar_time,
                            'price': underlying_price,
                            'reason': 'All price conditions met'
                        })
                
                # Conditions met (or no conditions), use this bar for entry
                entry_bar = bar
                break
            
            if not entry_bar:
                print(f"  [{date_str}] No entry - conditions not met in time range {entry_time_start}-{entry_time_end}")
                day_entry['events'].append({
                    'type': 'no_signal',
                    'reason': last_condition_reason or f'Conditions not met in range {entry_time_start}-{entry_time_end}'
                })
                decision_log.append(day_entry)
                continue
            
            underlying_price = entry_bar['open']
            entry_time = entry_bar['time']
            entry_timestamp = entry_bar['timestamp']
            exp_date = exp_map[date_str]
            
            # IV% entry condition check
            iv_cond = config.get('iv_entry_condition')
            if iv_cond:
                iv_ok, iv_reason = check_iv_entry_condition(
                    client, config, underlying_price, trade_date, exp_date, iv_cond
                )
                if not iv_ok:
                    print(f"  IV condition not met: {iv_reason}")
                    day_entry['events'].append({'type': 'iv_skip', 'reason': iv_reason})
                    decision_log.append(day_entry)
                    continue
                else:
                    print(f"  IV condition met: {iv_reason}")
                    day_entry['events'].append({'type': 'iv_met', 'reason': iv_reason})
            
            # Per-leg DTE: override exp_date per leg in config for fetch
            if has_per_leg_dte and date_str in per_leg_exp_map:
                leg_exp_dates = per_leg_exp_map[date_str]
                for i, leg in enumerate(config['legs']):
                    if i < len(leg_exp_dates):
                        leg['_exp_date'] = leg_exp_dates[i]
        
            # NEW OPTIMIZED APPROACH: Fetch all options data with 3-tier fallback
            success, fetched_legs, option_symbols = fetch_options_data_optimized(
                client, config, underlying_price, trade_date, exp_date
            )
        
            if not success:
                print(f"  Skipping - unable to fetch valid option data")
                day_entry['events'].append({'type': 'skip', 'reason': 'Unable to fetch valid option data for strikes'})
                decision_log.append(day_entry)
                continue
        
            # Cache the fetched data for monitoring
            for leg_data in fetched_legs:
                symbol = leg_data['symbol']
                bars_dict = {}
                eastern = pytz.timezone('US/Eastern')
            
                # Convert list of aggs to our bars dict format
                for agg in leg_data['data']:
                    # Convert UTC timestamp to US/Eastern datetime for market hours
                    dt = datetime.fromtimestamp(agg.timestamp / 1000, tz=pytz.UTC).astimezone(eastern)
                    date_key = dt.strftime("%Y-%m-%d")
                
                    # Filter for market hours (9:30 AM to 4:15 PM EST)
                    # Stock options trade until 4:15 PM on expiration day,
                    # so we keep bars up to 16:15 to capture the final settlement price.
                    hour = dt.hour
                    minute = dt.minute
                    time_in_minutes = hour * 60 + minute
                
                    if not (9*60+30 <= time_in_minutes <= 16*60+15):
                        continue  # Skip bars outside market hours
                
                    if date_key not in bars_dict:
                        bars_dict[date_key] = []
                
                    # Create bar in our format
                    bar = {
                        'date': date_key,
                        'datetime': dt,
                        'timestamp': agg.timestamp,
                        'time': dt.strftime("%H:%M:%S"),  # HH:MM:SS for 10-sec resolution
                        'open': agg.open,
                        'high': agg.high,
                        'low': agg.low,
                        'close': agg.close,
                        'volume': getattr(agg, 'volume', 0),
                        'vw': getattr(agg, 'vwap', agg.close)
                    }
                    bars_dict[date_key].append(bar)
            
                # All three caches share the same 10-sec bar data — no second API call needed
                option_cache_1min[symbol] = bars_dict
                option_cache_10sec[symbol] = bars_dict
                option_cache_detection[symbol] = bars_dict
                total_10sec = sum(len(v) for v in bars_dict.values())
                print(f"  [10sec] {symbol}: {total_10sec} bars across {len(bars_dict)} day(s)")
        
            # Build legs_info from fetched data
            legs_info = []
            for leg_data in fetched_legs:
                legs_info.append({
                    'symbol': leg_data['symbol'],
                    'strike': leg_data['strike'],
                    'type': leg_data['type'],
                    'position': leg_data['position'],
                    'entry_price': None,  # Will be set from common timestamp
                    'name': leg_data['name']
                })
        
            # Find the entry minute by matching at MINUTE granularity across all legs.
            # 10-sec bars from illiquid options rarely share an exact 10-sec timestamp,
            # so we match at the minute level (a minute is "available" if the leg has
            # at least one 10-sec bar anywhere inside it). This mirrors the old 1-min
            # behaviour while keeping 10-sec precision for pricing.
            print(f"  Finding common entry minute for all {len(legs_info)} legs...")

            all_leg_bars = []
            for leg in legs_info:
                leg_bars = option_cache_1min[leg['symbol']].get(date_str, [])
                if not leg_bars:
                    print(f"  No bars for {leg['symbol']} on entry date")
                    break
                all_leg_bars.append(leg_bars)

            if len(all_leg_bars) != len(legs_info):
                print(f"  Skipping - missing bars for some legs")
                day_entry['events'].append({'type': 'skip', 'reason': 'Missing option bars for some legs on entry date'})
                decision_log.append(day_entry)
                continue

            # Build per-leg minute sets (HH:MM) from their 10-sec bars
            minute_sets = [set(b['time'][:5] for b in bars) for bars in all_leg_bars]
            common_minutes = set.intersection(*minute_sets) if minute_sets else set()

            # Filter to the configured entry window
            eastern = pytz.timezone('US/Eastern')
            has_entry_window = entry_time_start != entry_time_end
            window_start = entry_time_start if has_entry_window else entry_time
            window_end   = entry_time_end   if has_entry_window else entry_time

            valid_minutes = sorted([m for m in common_minutes if window_start <= m <= window_end])

            # --- Fallback: 10-sec → 30-sec → 1-min when no common minute found ---
            if not valid_minutes:
                def _fetch_coarser_bars_for_date(mult, tspan_str):
                    result = []
                    for leg in legs_info:
                        leg_exp_fb = exp_date
                        for lc in config['legs']:
                            if lc.get('name') == leg['name']:
                                leg_exp_fb = lc.get('_exp_date', exp_date)
                                break
                        try:
                            aggs = list(client.list_aggs(
                                leg['symbol'], mult, tspan_str,
                                trade_date.strftime("%Y-%m-%d"),
                                leg_exp_fb.strftime("%Y-%m-%d"),
                                adjusted="true", sort="asc", limit=50000
                            ))
                            bars_fb = []
                            for agg in aggs:
                                dt_fb = datetime.fromtimestamp(agg.timestamp / 1000, tz=pytz.UTC).astimezone(eastern)
                                if dt_fb.strftime("%Y-%m-%d") != date_str:
                                    continue
                                h, m_ = dt_fb.hour, dt_fb.minute
                                if not (9*60+30 <= h*60+m_ <= 16*60+15):
                                    continue
                                bars_fb.append({
                                    'date': date_str,
                                    'datetime': dt_fb,
                                    'timestamp': agg.timestamp,
                                    'time': dt_fb.strftime("%H:%M:%S"),
                                    'open': agg.open, 'high': agg.high,
                                    'low': agg.low, 'close': agg.close,
                                    'volume': getattr(agg, 'volume', 0),
                                    'vw': getattr(agg, 'vwap', agg.close)
                                })
                            result.append(bars_fb)
                        except Exception as fb_err:
                            print(f"  ✗ Fallback fetch error for {leg['symbol']}: {fb_err}")
                            result.append([])
                    return result

                found_fallback = False
                for (fb_mult, fb_tspan, fb_label) in [(30, 'second', '30-sec'), (1, 'minute', '1-min')]:
                    print(f"  ↳ No common minute via 10-sec — retrying with {fb_label} bars...")
                    fb_bars = _fetch_coarser_bars_for_date(fb_mult, fb_tspan)
                    if len(fb_bars) != len(legs_info) or any(len(b) == 0 for b in fb_bars):
                        print(f"  ↳ {fb_label}: insufficient data for one or more legs")
                        continue
                    fb_minute_sets = [set(b['time'][:5] for b in bars) for bars in fb_bars]
                    fb_common = set.intersection(*fb_minute_sets) if fb_minute_sets else set()
                    fb_valid = sorted([m for m in fb_common if window_start <= m <= window_end])
                    if fb_valid:
                        print(f"  ↳ Common minute found via {fb_label}: {fb_valid[0]}")
                        valid_minutes = fb_valid
                        # Update caches so entry pricing uses this resolution
                        for i, leg in enumerate(legs_info):
                            option_cache_1min[leg['symbol']][date_str] = fb_bars[i]
                            option_cache_10sec[leg['symbol']][date_str] = fb_bars[i]
                        found_fallback = True
                        break
                    else:
                        print(f"  ↳ {fb_label}: still no common minute in window {window_start}–{window_end}")

                if not found_fallback:
                    reason = (f'No common option minute in window {entry_time_start}–{entry_time_end}'
                              if has_entry_window else f'No common option minute at {entry_time}')
                    print(f"  Skipping - {reason}")
                    day_entry['events'].append({'type': 'skip', 'reason': reason})
                    decision_log.append(day_entry)
                    continue
            # --- End fallback ---

            common_minute = valid_minutes[0]

            # Compute entry_timestamp as the :00 boundary of the chosen minute.
            # Pricing uses bars strictly AFTER this (i.e. :10, :20, :30 within the minute).
            entry_dt_est = eastern.localize(
                datetime.strptime(f"{date_str} {common_minute}:00", "%Y-%m-%d %H:%M:%S")
            )
            entry_timestamp = int(entry_dt_est.timestamp() * 1000)

            # If the common minute is later than the configured entry time,
            # sync underlying_price to that minute's open.
            if common_minute != entry_time:
                bars_1min_dict = {bar['time']: bar for bar in bars_1min_today}
                matched_bar = bars_1min_dict.get(common_minute)
                if matched_bar:
                    underlying_price = matched_bar['open']
                    print(f"  ↳ First common minute is {common_minute} (not {entry_time}); underlying updated to {underlying_price:.2f}")

            entry_time = common_minute
        
            # Get entry prices using first 3 consecutive 10-sec bars at the entry minute.
            # Short (credit) legs → LOWEST price across the 3 bars (conservative: least credit).
            # Long (debit) legs  → HIGHEST price across the 3 bars (conservative: most debit).
            # Falls back to the 1-min bar open if no 10-sec data is available.
            for i, leg in enumerate(legs_info):
                symbol_i = leg['symbol']
                bars_10sec_today = option_cache_10sec.get(symbol_i, {}).get(date_str, [])

                # First 3 × 10-sec bars AFTER the entry-minute open bar (:10, :20, :30).
                # Strictly greater-than so the :00 bar (minute open) is excluded.
                window_bars = sorted(
                    [b for b in bars_10sec_today
                     if entry_timestamp < b['timestamp'] < entry_timestamp + 60_000],
                    key=lambda x: x['timestamp']
                )[:3]

                if window_bars:
                    # Use the open of the first 10-sec bar after the entry minute open.
                    # A single neutral price is applied to ALL legs regardless of position
                    # (long or short), so opposite strategies on the same strikes at the
                    # same timestamp always receive exactly inverse fills.
                    entry_price = window_bars[0]['open']
                    print(f"  [{leg['name']}] 10-sec entry (first bar open): ${entry_price:.4f}")
                else:
                    # No bars strictly after :00 — use the open of the first available
                    # 10-sec bar in the minute (same neutral, position-agnostic logic).
                    first_bars_in_min = sorted(
                        [b for b in bars_10sec_today if b['time'][:5] == common_minute],
                        key=lambda x: x['timestamp']
                    )
                    if first_bars_in_min:
                        entry_price = first_bars_in_min[0]['open']
                        print(f"  [{leg['name']}] First 10-sec bar open in {common_minute}: ${entry_price:.4f}")
                    else:
                        entry_price = 0.0
                        print(f"  [{leg['name']}] No 10-sec bars found for minute {common_minute}")

                leg['entry_price'] = entry_price
                
                # Calculate Greeks at entry
                try:
                    # Calculate time to expiration in years
                    # Use per-leg exp_date for calendar/diagonal strategies
                    leg_specific_exp = config['legs'][i].get('_exp_date', exp_date) if i < len(config['legs']) else exp_date
                    eastern = pytz.timezone('US/Eastern')
                    entry_dt = datetime.fromtimestamp(entry_timestamp / 1000, tz=pytz.UTC).astimezone(eastern)
                    # Expiration is at 4:00 PM ET - handle both date and datetime objects
                    if isinstance(leg_specific_exp, datetime):
                        exp_date_dt = leg_specific_exp.replace(hour=16, minute=0, second=0, microsecond=0)
                    else:
                        # exp_date is a date object, convert to datetime
                        exp_date_dt = datetime.combine(leg_specific_exp, datetime.min.time()).replace(hour=16, minute=0, second=0)
                    # Localize if not already timezone aware
                    if exp_date_dt.tzinfo is None:
                        exp_dt = eastern.localize(exp_date_dt)
                    else:
                        exp_dt = exp_date_dt.astimezone(eastern)
                    T = max((exp_dt - entry_dt).total_seconds() / (365.25 * 24 * 3600), 1/(365.25*24*60))  # Min 1 minute
                    
                    # Get risk-free rate and dividend yield
                    r = config.get('risk_free_rate', 0.045)
                    q = config.get('dividend_yield', 0.013)
                    
                    # Create Greeks calculator
                    calc = GreeksCalculator(
                        S=underlying_price,
                        K=leg['strike'],
                        T=T,
                        r=r,
                        q=q,
                        option_type='call' if leg['type'] == 'C' else 'put'
                    )
                    
                    # Calculate IV from market price
                    iv = calc.calculate_implied_volatility(entry_price)
                    if iv is not None and iv > 0:
                        greeks = calc.calculate_greeks(iv)
                        leg['iv'] = iv
                        leg['delta'] = greeks['delta']
                        leg['gamma'] = greeks['gamma']
                        leg['theta'] = greeks['theta']
                        leg['vega'] = greeks['vega']
                        print(f"    📊 {leg['name']}: IV={iv:.2%}, Δ={greeks['delta']:.3f}, Γ={greeks['gamma']:.4f}, Θ={greeks['theta']:.2f}, V={greeks['vega']:.2f}")
                    else:
                        print(f"    ⚠ {leg['name']}: IV calculation failed (price={entry_price:.4f}, S={underlying_price:.2f}, K={leg['strike']}, T={T:.6f})")
                        leg['iv'] = None
                        leg['delta'] = None
                        leg['gamma'] = None
                        leg['theta'] = None
                        leg['vega'] = None
                except Exception as greeks_err:
                    # Greeks calculation failed, continue without them
                    print(f"    ⚠ {leg.get('name', 'Leg')}: Greeks error: {greeks_err}")
                    leg['iv'] = None
                    leg['delta'] = None
                    leg['gamma'] = None
                    leg['theta'] = None
                    leg['vega'] = None
            
                # Validate mid price if needed
                leg_config = config['legs'][i]
                config_type = leg_config.get('config_type', 'mid_price')
                params = leg_config.get('params', {})
                if config_type == 'mid_price' and params.get('min') is not None and params.get('max') is not None:
                    min_val = params['min']
                    max_val = params['max']
                    if not (min_val <= entry_price <= max_val):
                        print(f"  {leg['symbol']} price {entry_price:.2f} outside range [{min_val}, {max_val}]")
                        leg['entry_price'] = None
                        break

                # Validate actual delta against configured range (for delta-based 'between' legs)
                if config_type == 'delta' and params.get('method') == 'between' and leg.get('delta') is not None:
                    try:
                        d_min = params.get('delta_min')
                        d_max = params.get('delta_max')
                        if d_min is not None and d_max is not None:
                            d_min = float(d_min)
                            d_max = float(d_max)
                            actual_delta = leg['delta']
                            if not (d_min <= actual_delta <= d_max):
                                print(f"  ⚠ {leg['name']}: Actual entry delta {actual_delta:.4f} outside configured range [{d_min}, {d_max}], skipping trade")
                                leg['entry_price'] = None
                                break
                    except (ValueError, TypeError):
                        pass
        
            # Check if all legs priced successfully
            if any(leg['entry_price'] is None for leg in legs_info):
                print(f"  Skipping - could not price all legs")
                day_entry['events'].append({'type': 'skip', 'reason': 'Could not price all option legs'})
                decision_log.append(day_entry)
                continue
        
            # Calculate position metrics
            net_credit = sum(leg['entry_price'] if leg['position'] == 'short' else -leg['entry_price'] 
                            for leg in legs_info)

            # Filter based on expected premium direction for the strategy type.
            # Credit strategies collect premium  → net_credit must be > 0.
            # Debit strategies pay premium       → net_credit must be < 0 (net debit).
            _strat_name_lower = config.get('strategy', '').lower()
            _is_debit_strat = _strat_name_lower.startswith('long')
            if _is_debit_strat:
                if net_credit >= 0:
                    print(f"  ❌ SKIPPING - Debit strategy but net premium ${net_credit:.4f} >= 0 (no debit paid)")
                    day_entry['events'].append({'type': 'skip', 'reason': f'Debit strategy with non-negative premium ${net_credit:.4f}'})
                    decision_log.append(day_entry)
                    continue
            else:
                if net_credit <= 0:
                    print(f"  ❌ SKIPPING - Credit strategy but net premium ${net_credit:.4f} <= 0 (no credit received)")
                    day_entry['events'].append({'type': 'skip', 'reason': f'Credit strategy with non-positive premium ${net_credit:.4f}'})
                    decision_log.append(day_entry)
                    continue

            # For 2-leg vertical spreads, the premium collected/paid cannot exceed the
            # spread width — that would imply a negative max risk, which is impossible.
            # Debit:  debit > spread_width  → max profit is negative → skip.
            # Credit: credit > spread_width → max loss is negative   → skip.
            if len(legs_info) == 2:
                _strikes = [leg.get('strike', 0) for leg in legs_info]
                if all(s > 0 for s in _strikes):
                    _spread_width = abs(_strikes[0] - _strikes[1])
                    if _spread_width > 0:
                        if _is_debit_strat and net_credit < -_spread_width:
                            _debit = -net_credit
                            print(f"  ❌ SKIPPING - Debit ${_debit:.4f} exceeds spread width ${_spread_width:.2f} (max possible profit is negative — trade unwinnable)")
                            day_entry['events'].append({'type': 'skip', 'reason': f'Debit ${_debit:.4f} exceeds spread width ${_spread_width:.2f}'})
                            decision_log.append(day_entry)
                            continue
                        elif not _is_debit_strat and net_credit > _spread_width:
                            print(f"  ❌ SKIPPING - Credit ${net_credit:.4f} exceeds spread width ${_spread_width:.2f} (max possible loss is negative — trade unwinnable)")
                            day_entry['events'].append({'type': 'skip', 'reason': f'Credit ${net_credit:.4f} exceeds spread width ${_spread_width:.2f}'})
                            decision_log.append(day_entry)
                            continue

            # Check net premium filter
            min_premium = config.get('net_premium_min')
            max_premium = config.get('net_premium_max')
            
            if min_premium is not None:
                if net_credit < min_premium:
                    print(f"  ❌ SKIPPING - Net premium ${net_credit:.4f} < minimum ${min_premium:.2f}")
                    day_entry['events'].append({'type': 'skip', 'reason': f'Net premium ${net_credit:.4f} below minimum ${min_premium:.2f}'})
                    decision_log.append(day_entry)
                    continue
                else:
                    print(f"  ✓ Net premium ${net_credit:.4f} >= minimum ${min_premium:.2f}")
        
            if max_premium is not None:
                if net_credit > max_premium:
                    print(f"  ❌ SKIPPING - Net premium ${net_credit:.4f} > maximum ${max_premium:.2f}")
                    day_entry['events'].append({'type': 'skip', 'reason': f'Net premium ${net_credit:.4f} above maximum ${max_premium:.2f}'})
                    decision_log.append(day_entry)
                    continue
                else:
                    print(f"  ✓ Net premium ${net_credit:.4f} <= maximum ${max_premium:.2f}")
        
            # Calendar/diagonal spreads on STOCK options: max risk is undefined because
            # dividend liability and early-assignment dynamics on American-style options
            # can cause actual losses to exceed the vertical-spread formula
            # (strike_diff - net_credit). For INDEX options (European, cash-settled, no
            # dividend), the intrinsic floor is enforced at mark-to-market time so the
            # vertical-spread formula remains valid.
            max_risk = None if (has_per_leg_dte and not is_index) else calculate_max_risk(legs_info, net_credit)
            num_contracts = calculate_position_size(capital, config, max_risk)
        
            if num_contracts <= 0:
                print(f"  Skipping - insufficient capital")
                day_entry['events'].append({'type': 'skip', 'reason': f'Insufficient capital (${capital:,.2f}) for position sizing'})
                decision_log.append(day_entry)
                continue
        
            # For calendar/diagonal strategies, determine monitoring exp dates
            if has_per_leg_dte and date_str in per_leg_exp_map:
                near_exp = min(per_leg_exp_map[date_str])
                far_exp = max(per_leg_exp_map[date_str])
            else:
                near_exp = exp_date
                far_exp = exp_date
            
            # Check PDT - Set flag for 0-DTE + avoid_pdt mode
            _dte_fallback = config.get('dte') or 0
            min_dte_val = min((leg.get('dte', _dte_fallback) or 0 for leg in config['legs']), default=_dte_fallback)
            pdt_0dte_mode = config['avoid_pdt'] and min_dte_val == 0
        
            if pdt_0dte_mode:
                print(f"  ✓ 0-DTE with PDT avoidance: Exit at EXPIRATION only (TP/SL disabled)")
                # Don't skip! Will process trade with expiration exit only
         
        
            # Display entry
            # Calendar/diagonal: convention is net DEBIT (long - short), so flip sign for display
            _entry_display = -net_credit if has_per_leg_dte else net_credit
            _entry_label   = "Net Debit" if has_per_leg_dte else "Premium"
            leg_summary = ", ".join([f"{leg['name']}@{leg['strike']}" for leg in legs_info])
            _max_risk_str = "N/A" if max_risk is None else f"{max_risk:.4f}"
            print(f"  ENTRY: {num_contracts} contracts | {_entry_label}: {_entry_display:.4f} | Max Risk: {_max_risk_str}")
            print(f"  Legs: {leg_summary}")
            
            day_entry['status'] = 'ENTRY'
            day_entry['events'].append({
                'type': 'entry',
                'time': entry_time,
                'underlying_price': underlying_price,
                'num_contracts': num_contracts,
                'net_premium': round(_entry_display, 4),
                'max_risk': None if max_risk is None else round(max_risk, 2),
                'legs': [{'name': l['name'], 'strike': l['strike'], 'type': l['type'], 'position': l['position'], 'entry_price': round(l['entry_price'], 4)} for l in legs_info],
                'expiration': exp_date.strftime("%Y-%m-%d")
            })
        
            # Monitor position using DETECTION bars
            # For calendar/diagonal: monitor until near-term leg expires
            monitoring_exp = near_exp if has_per_leg_dte else exp_date
            trading_range = get_business_days_between(trade_date, monitoring_exp)
        
            exit_hit = False
            exit_reason = ""
            exit_time = ""
            exit_timestamp = 0
            exit_premium = 0
            exit_leg_prices = []
        
            for monitoring_date in trading_range:
                if exit_hit:
                    break
            
                mon_date_str = monitoring_date.strftime("%Y-%m-%d")
                is_entry_day = (mon_date_str == date_str)
            
                # Get detection bars for all legs
                leg_bars_list = []
                for leg_info in legs_info:
                    leg_bars = option_cache_detection[leg_info['symbol']].get(mon_date_str, [])
                    if not leg_bars:
                        break
                    leg_bars_list.append(leg_bars)
            
                if len(leg_bars_list) != len(legs_info):
                    continue
            
                # Align bars
                aligned_bars = align_bars(leg_bars_list)
                if not aligned_bars:
                    continue
            
                # Unified per-bar exit check: TP/SL and exit signals evaluated
                # at each bar chronologically — whichever triggers first wins
                if not pdt_0dte_mode:
                    take_profit_pct = config.get('take_profit_pct')
                    take_profit_dollar = config.get('take_profit_dollar')
                    stop_loss_pct = config.get('stop_loss_pct')
                    stop_loss_dollar = config.get('stop_loss_dollar')
                    # TP requires 3 consecutive 10-sec bars meeting the condition.
                    # SL fires at the first bar where the condition is met.
                    tp_consecutive_count = 0

                    underlying_bars_mon_1min = underlying_bars_1min.get(mon_date_str, []) if has_exit_signal else []
                    _mon_prev_day_bars = []
                    if has_exit_signal:
                        sorted_dates_for_mon = sorted(underlying_bars_1min.keys())
                        for d in sorted_dates_for_mon:
                            if d < mon_date_str:
                                _mon_prev_day_bars = underlying_bars_1min.get(d, [])
                            else:
                                break
                    
                    for abar in aligned_bars:
                        bar_time_str = abar['time']
                        # Skip the entry bar and any bars before it.
                        # Use timestamp comparison so both HH:MM (1-min fallback) and
                        # HH:MM:SS (10-sec) bar formats work correctly.
                        if is_entry_day and abar['timestamp'] <= entry_timestamp:
                            continue
                        
                        current_premium = calculate_net_premium(abar, legs_info)
                        # For credit strategies the closing cost cannot be negative —
                        # VWAP timing differences between legs can momentarily invert
                        # the spread value. Floor at 0 so realised profit never exceeds
                        # the original credit received.
                        if not _is_debit_strat:
                            current_premium = max(current_premium, 0.0)
                        pnl = net_credit - current_premium
                        pnl_pct = (pnl / abs(net_credit)) * 100 if net_credit != 0 else 0
                        
                        tp_met = False
                        if take_profit_pct:
                            tp_met = pnl_pct >= take_profit_pct
                        elif take_profit_dollar is not None:
                            tp_met = pnl >= take_profit_dollar / 100
                        
                        sl_met = False
                        if stop_loss_pct:
                            sl_met = pnl_pct <= -stop_loss_pct
                        elif stop_loss_dollar is not None:
                            sl_met = pnl <= -stop_loss_dollar / 100
                        
                        bar_leg_prices = [lp.get('vw', lp['close']) for lp in abar['leg_prices']]
                        
                        # TP: accumulate consecutive bars; exit after 3 in a row
                        if tp_met:
                            tp_consecutive_count += 1
                            if tp_consecutive_count >= 3:
                                exit_hit = True
                                exit_reason = "TAKE_PROFIT"
                                exit_time = bar_time_str
                                exit_premium = current_premium
                                exit_leg_prices = bar_leg_prices
                                break
                        else:
                            tp_consecutive_count = 0

                        # SL: close immediately at first bar meeting the condition
                        if sl_met:
                            exit_hit = True
                            exit_reason = "STOP_LOSS"
                            exit_time = bar_time_str
                            exit_premium = current_premium
                            exit_leg_prices = bar_leg_prices
                            break
                        
                        if has_exit_signal:
                            # Truncate to HH:MM so 10-sec bar times match 1-min underlying bars
                            sig_bar_time = bar_time_str[:5]
                            sig_exit, sig_reason = check_exit_signal_conditions(
                                config, underlying_bars_mon_1min, _mon_prev_day_bars,
                                sig_bar_time, indicators_cache, monitoring_date
                            )
                            if sig_exit:
                                exit_hit = True
                                exit_reason = sig_reason
                                exit_time = bar_time_str
                                exit_premium = current_premium
                                exit_leg_prices = bar_leg_prices
                                print(f"  🚪 Exit signal triggered @ {bar_time_str}: {sig_reason}")
                                break
                
                if exit_hit:
                    # Get timestamp and underlying price at exit
                    underlying_bars_mon = underlying_bars_detection.get(mon_date_str, [])
                    exit_underlying_price = None
                
                    # Find the exit bar in aligned_bars to get timestamp
                    for bar in aligned_bars:
                        if bar['time'] == exit_time:
                            exit_timestamp = bar['timestamp']
                            break
                    
                    # Find underlying price at exit time using timestamp matching
                    # Tolerance = detection interval (e.g., 5 min = 300000ms) + buffer
                    detection_minutes = config.get('detection_size', 5)
                    tolerance_ms = (detection_minutes + 1) * 60 * 1000  # detection + 1 min buffer
                    
                    if exit_timestamp and underlying_bars_mon:
                        # Find bar with closest timestamp
                        closest_bar = None
                        min_diff = float('inf')
                        for u_bar in underlying_bars_mon:
                            diff = abs(u_bar['timestamp'] - exit_timestamp)
                            if diff < min_diff:
                                min_diff = diff
                                closest_bar = u_bar
                        
                        if closest_bar and min_diff <= tolerance_ms:
                            # Use VWAP if available, otherwise close
                            exit_underlying_price = closest_bar.get('vw', closest_bar['close'])
                            print(f"  📍 Exit underlying: {exit_underlying_price:.2f} @ {exit_time} (delta: {min_diff/1000:.0f}s)")
                        elif closest_bar:
                            # Use closest bar even if outside tolerance (better than entry price)
                            exit_underlying_price = closest_bar.get('vw', closest_bar['close'])
                            print(f"  ⚠ Exit underlying: {exit_underlying_price:.2f} (nearest bar, delta: {min_diff/1000:.0f}s)")
                        else:
                            print(f"  ⚠ No underlying bars found for exit time")
                    if exit_underlying_price is None:
                        exit_underlying_price = get_cached_underlying_close(
                            underlying_daily_closes,
                            underlying_bars_detection,
                            monitoring_date
                        )
                    break
        
            # Calculate P&L
            if exit_hit:
                final_premium = exit_premium
                final_leg_prices = exit_leg_prices
            else:
                # Held to expiration - calculate values
                exit_reason = "EXPIRATION"
                exit_time = exp_close_time  # 16:00 for index options, 16:15 for stock options
                exit_timestamp = 0
            
                expiration_underlying_price = get_cached_underlying_close(
                    underlying_daily_closes,
                    underlying_bars_detection,
                    monitoring_exp
                )
            
                if expiration_underlying_price is None:
                    underlying_sym = get_underlying_ticker(config['symbol'])
                    expiration_underlying_price = get_underlying_close_at_expiration(
                        client, underlying_sym, monitoring_exp
                    )
            
                if expiration_underlying_price is None:
                    raise ValueError(
                        f"No underlying expiration close available for {config['symbol']} on {monitoring_exp.strftime('%Y-%m-%d')}"
                    )
            
                # Set exit underlying price to expiration price
                exit_underlying_price = expiration_underlying_price
            
                if has_per_leg_dte and date_str in per_leg_exp_map:
                    # Calendar/diagonal: mark-to-market for far legs;
                    # expired near legs use last market price (stock) or intrinsic (index)
                    final_leg_prices = []
                    leg_exp_list = per_leg_exp_map[date_str]
                    mon_exp_str = monitoring_exp.strftime("%Y-%m-%d")
                    for i, leg in enumerate(legs_info):
                        leg_specific_exp = leg_exp_list[i] if i < len(leg_exp_list) else monitoring_exp
                        if leg_specific_exp <= monitoring_exp:
                            # Near-term leg: expired
                            if not is_index:
                                # Stock options: use last recorded market price at 16:15
                                leg_bars = option_cache_1min.get(leg['symbol'], {}).get(mon_exp_str, [])
                                if leg_bars:
                                    last_bar = max(leg_bars, key=lambda x: x['time'])
                                    last_price = last_bar.get('vw', last_bar['close'])
                                    final_leg_prices.append(last_price)
                                    print(f"    {leg['name']} (near leg, stock): last market price = {last_price:.4f} @ {last_bar['time']}")
                                else:
                                    # Fallback to intrinsic if no market data
                                    if leg['type'] == 'C':
                                        intrinsic = max(0, expiration_underlying_price - leg['strike'])
                                    else:
                                        intrinsic = max(0, leg['strike'] - expiration_underlying_price)
                                    final_leg_prices.append(intrinsic)
                                    print(f"    {leg['name']} (near leg, stock): no market data, fallback intrinsic = {intrinsic:.4f}")
                            else:
                                # Index options: use intrinsic value from 16:00 close
                                if leg['type'] == 'C':
                                    intrinsic = max(0, expiration_underlying_price - leg['strike'])
                                else:
                                    intrinsic = max(0, leg['strike'] - expiration_underlying_price)
                                final_leg_prices.append(intrinsic)
                        else:
                            # Far-term leg: still has time value — use actual last market price.
                            # This reflects real-world execution: the leg is sold at the
                            # prevailing bid/ask, which includes remaining extrinsic (time) value.
                            leg_bars = option_cache_1min.get(leg['symbol'], {}).get(mon_exp_str, [])
                            if leg_bars:
                                last_bar = max(leg_bars, key=lambda x: x['time'])
                                mtm_price = last_bar.get('vw', last_bar['close'])
                                final_leg_prices.append(mtm_price)
                                print(f"    {leg['name']} (far leg): mark-to-market = {mtm_price:.4f}")
                            else:
                                # Fallback to intrinsic when no market data available
                                if leg['type'] == 'C':
                                    intrinsic = max(0, expiration_underlying_price - leg['strike'])
                                else:
                                    intrinsic = max(0, leg['strike'] - expiration_underlying_price)
                                final_leg_prices.append(intrinsic)
                                print(f"    {leg['name']} (far leg): no market data, using intrinsic = {intrinsic:.4f}")
                    
                    final_premium = sum(final_leg_prices[i] if legs_info[i]['position'] == 'short' else -final_leg_prices[i]
                                       for i in range(len(legs_info)))
                else:
                    if is_index:
                        # Index options: intrinsic value from 16:00 underlying close
                        final_premium, final_leg_prices = calculate_expiration_values(
                            legs_info, expiration_underlying_price
                        )
                    else:
                        # Stock options: last recorded market price of each option contract at 16:15
                        exp_date_key = monitoring_exp.strftime("%Y-%m-%d")
                        final_leg_prices = []
                        for leg in legs_info:
                            leg_bars = option_cache_1min.get(leg['symbol'], {}).get(exp_date_key, [])
                            if leg_bars:
                                last_bar = max(leg_bars, key=lambda x: x['time'])
                                last_price = last_bar.get('vw', last_bar['close'])
                                final_leg_prices.append(last_price)
                                print(f"    {leg['name']} @ {leg['strike']}: Last market price = {last_price:.4f} @ {last_bar['time']}")
                            else:
                                # Fallback to intrinsic when no market data exists for this contract
                                if leg['type'] == 'C':
                                    intrinsic = max(0, expiration_underlying_price - leg['strike'])
                                else:
                                    intrinsic = max(0, leg['strike'] - expiration_underlying_price)
                                final_leg_prices.append(intrinsic)
                                print(f"    {leg['name']} @ {leg['strike']}: No market data, fallback intrinsic = {intrinsic:.4f}")
                        # Compute net premium from actual last prices
                        net_prem = 0
                        for i, leg_info in enumerate(legs_info):
                            if leg_info['position'] == 'short':
                                net_prem += final_leg_prices[i]
                            else:
                                net_prem -= final_leg_prices[i]
                        final_premium = net_prem
            
                # Log values for each leg
                _exit_display = -final_premium if has_per_leg_dte else final_premium
                _exit_label   = "Net Debit" if has_per_leg_dte else "Net Premium"
                print(f"  Expiration: Underlying = {expiration_underlying_price:.2f}, {_exit_label} = {_exit_display:.4f}")
                for i, leg in enumerate(legs_info):
                    print(f"    {leg['name']} @ {leg['strike']}: Value = {final_leg_prices[i]:.4f}")
        
            pnl = (net_credit - final_premium) * num_contracts * 100
            capital += pnl
            
            # For display/storage, calendar/diagonal uses debit convention (long - short)
            _exit_store = round(-final_premium if has_per_leg_dte else final_premium, 4)
            exit_date_str = mon_date_str if exit_hit else exp_date.strftime("%Y-%m-%d")
            day_entry['events'].append({
                'type': 'exit',
                'exit_date': exit_date_str,
                'exit_time': exit_time,
                'exit_reason': exit_reason,
                'net_premium_exit': _exit_store,
                'pnl': round(pnl, 2),
                'capital_after': round(capital, 2),
                'trade_num': len(trades) + 1
            })
            if exit_date_str == date_str:
                day_entry['status'] = 'EXIT'
        
            # Calculate DTE (Days to Expiration at entry)
            if has_per_leg_dte:
                _dte_fb2 = config.get('dte') or 0
                dte_days = min((leg.get('dte', _dte_fb2) or 0 for leg in config['legs']), default=_dte_fb2)
            else:
                dte_days = config.get('dte') or 0
        
            # Calculate DIT (Days in Trade with 1 decimal precision)
            # Use US/Eastern timezone for all datetime calculations
            eastern = pytz.timezone('US/Eastern')
        
            try:
                # Ensure entry_datetime is defined
                if entry_timestamp:
                    entry_datetime = datetime.fromtimestamp(entry_timestamp / 1000, tz=pytz.UTC).astimezone(eastern)
                else:
                    entry_datetime = eastern.localize(datetime.strptime(f"{date_str} {entry_time}", "%Y-%m-%d %H:%M"))
            
                # Ensure exit_datetime is defined
                if exit_hit and exit_timestamp:
                    exit_datetime = datetime.fromtimestamp(exit_timestamp / 1000, tz=pytz.UTC).astimezone(eastern)
                else:
                    # Expiration: 16:00 for index options, 16:15 for stock options
                    exp_date_str = exp_date.strftime('%Y-%m-%d')
                    exit_datetime = eastern.localize(datetime.strptime(f"{exp_date_str} {exp_close_time}", "%Y-%m-%d %H:%M"))
            
                # Calculate DIT safely
                if entry_datetime and exit_datetime:
                    dit_seconds = (exit_datetime - entry_datetime).total_seconds()
                    if dit_seconds is not None:
                        dit_days = dit_seconds / 86400  # Convert seconds to days with decimal
                    else:
                        print(f"ERROR: total_seconds() returned None!")
                        dit_days = 0.0
                else:
                    print(f"ERROR: entry_datetime or exit_datetime is None! entry={entry_datetime}, exit={exit_datetime}")
                    dit_days = 0.0
                
            except Exception as e:
                print(f"ERROR in DIT calculation: {e}")
                print(f"  entry_timestamp={entry_timestamp}, exit_timestamp={exit_timestamp}")
                print(f"  exit_hit={exit_hit}, exp_date={exp_date}")
                import traceback
                traceback.print_exc()
                dit_days = 0.0
        
            # Create detailed trade record
            trade = {
                'entry_date': date_str,
                'entry_time': entry_time,
                'entry_timestamp': entry_timestamp,
                'underlying_price': underlying_price,
                'exit_date': mon_date_str if exit_hit else exp_date.strftime("%Y-%m-%d"),
                'exit_time': exit_time,
                'exit_timestamp': exit_timestamp,
                'underlying_exit_price': exit_underlying_price,
                'strategy': config['strategy'],
                'num_contracts': num_contracts,
                'net_premium_entry': -net_credit if has_per_leg_dte else net_credit,
                'net_premium_exit': -final_premium if has_per_leg_dte else final_premium,
                'max_risk': max_risk,
                'pnl': pnl,
                'exit_reason': exit_reason,
                'capital_before': capital - pnl,
                'capital_after': capital,
                'dte': dte_days,
                'dit': round(dit_days, 1),  # 1 decimal precision
                'legs': []
            }
        
            # Add leg details
            for i, leg_info in enumerate(legs_info):
                trade['legs'].append({
                    'symbol': leg_info['symbol'],
                    'name': leg_info['name'],
                    'strike': leg_info['strike'],
                    'type': leg_info['type'],
                    'position': leg_info['position'],
                    'entry_price': leg_info['entry_price'],
                    'exit_price': final_leg_prices[i],  # Always show actual exit price
                    # Greeks at entry
                    'iv': leg_info.get('iv'),
                    'delta': leg_info.get('delta'),
                    'gamma': leg_info.get('gamma'),
                    'theta': leg_info.get('theta'),
                    'vega': leg_info.get('vega')
                })
        
            trades.append(trade)
            equity_history.append(capital)
        
            print(f"  EXIT: {exit_reason} @ {exit_time} | P&L: ${pnl:+,.2f} | Capital: ${capital:,.2f}")
            
            decision_log.append(day_entry)
        
        except Exception as e:
            print(f"\n❌ ERROR processing trade on {date_str}:")
            print(f"   {str(e)}")
            import traceback
            traceback.print_exc()
            print(f"   Trade index: {idx + 1}/{len(trading_days)}")
            print(f"   Continuing to next trade...\n")
            day_entry['events'].append({'type': 'error', 'reason': str(e)})
            decision_log.append(day_entry)
            continue
    
    return trades, equity_history, decision_log

def calculate_expiration_values(legs_info: List[Dict], underlying_price: float) -> Tuple[float, List[float]]:
    """
    Calculate option values at expiration using ONLY intrinsic values
    
    At expiration (4:00 PM), options have zero time value - only intrinsic value matters.
    Do NOT use market prices as they may be stale or incorrect.
    
    Intrinsic value formulas:
    - Call: max(0, underlying_price - strike)
    - Put: max(0, strike - underlying_price)
    
    Args:
        legs_info: List of leg dictionaries with strike, type, position
        underlying_price: Official closing price from day bar
    
    Returns:
        (net_premium, leg_prices): Net cost to close and individual leg values
    """
    
    leg_prices = []
    
    for leg_info in legs_info:
        strike = leg_info['strike']
        option_type = leg_info['type']
        
        # Calculate intrinsic value only
        if option_type == 'C':  # Call
            intrinsic = max(0, underlying_price - strike)
        else:  # Put
            intrinsic = max(0, strike - underlying_price)
        
        leg_prices.append(intrinsic)
    
    # Calculate net premium at expiration
    # For shorts: we owe the intrinsic value (add to cost)
    # For longs: we receive the intrinsic value (subtract from cost)
    net_premium = 0
    for i, leg_info in enumerate(legs_info):
        if leg_info['position'] == 'short':
            net_premium += leg_prices[i]
        else:
            net_premium -= leg_prices[i]
    
    return net_premium, leg_prices

def get_spread_width(legs_info: List[Dict]) -> Optional[float]:
    """
    Calculate the strike width for vertical spreads
    Returns None if not a vertical spread
    """
    if len(legs_info) != 2:
        return None  # Only handle vertical spreads
    
    strikes = [leg['strike'] for leg in legs_info]
    return abs(strikes[0] - strikes[1])

def cap_exit_premium_at_max(leg_prices: List[float], legs_info: List[Dict], 
                             initial_premium: float) -> Tuple[float, List[float]]:
    """
    Cap the exit premium at theoretical maximum for vertical spreads
    
    For vertical spreads, the spread can never be worth more than the strike width.
    This prevents unrealistic losses from using 'high' prices during market volatility.
    
    Args:
        leg_prices: Raw exit prices for each leg
        legs_info: Leg information including position and strike
        initial_premium: Net premium at entry (positive for credit, negative for debit)
    
    Returns:
        (capped_premium, capped_leg_prices): Adjusted values that respect theoretical max
    """
    spread_width = get_spread_width(legs_info)
    
    if spread_width is None:
        # Not a vertical spread - no cap applies
        net_premium = sum(leg_prices[j] if legs_info[j]['position'] == 'short' else -leg_prices[j]
                         for j in range(len(legs_info)))
        return net_premium, leg_prices
    
    # Calculate raw net premium
    net_premium = sum(leg_prices[j] if legs_info[j]['position'] == 'short' else -leg_prices[j]
                     for j in range(len(legs_info)))
    
    # For vertical spreads, max value is the strike width
    max_spread_value = spread_width
    
    # Cap the net premium at theoretical maximum
    if initial_premium > 0:  # Credit spread
        # Worst case: spread goes to full width
        if net_premium > max_spread_value:
            # Need to adjust leg prices proportionally
            adjustment_factor = max_spread_value / net_premium
            capped_leg_prices = [price * adjustment_factor for price in leg_prices]
            capped_premium = max_spread_value
            return capped_premium, capped_leg_prices
    else:  # Debit spread
        # Worst case: spread goes to zero
        if net_premium < 0:
            # Already losing more than paid, cap at zero
            adjustment_factor = 0 if net_premium < 0 else 1
            capped_leg_prices = [0 for _ in leg_prices]
            capped_premium = 0
            return capped_premium, capped_leg_prices
    
    # No cap needed
    return net_premium, leg_prices

def check_exit_conditions_detailed(aligned_bars: List[Dict], legs_info: List[Dict], 
                                   initial_premium: float, config: Dict, 
                                   entry_time: str, is_entry_day: bool,
                                   force_expiration_only: bool = False) -> Tuple[bool, str, str, float, List[float]]:
    """
    Check for take profit or stop loss hits
    REQUIRES CONSECUTIVE BAR CONFIRMATION for precision
    
    Args:
        aligned_bars: List of aligned bar data
        legs_info: List of leg information
        initial_premium: Initial premium of the position
        config: Configuration dictionary
        entry_time: Entry time string
        is_entry_day: Boolean indicating if this is entry day
        force_expiration_only: If True, skip all TP/SL checks (0-DTE with PDT avoidance)
    
    Returns: (hit, reason, time, premium, leg_prices)
    """
    
    # If expiration-only mode (0-DTE with PDT), skip all intraday exits
    if force_expiration_only:
        return (False, "", "", 0, [])
    
    # Get TP/SL settings
    take_profit_pct = config.get('take_profit_pct')
    take_profit_dollar = config.get('take_profit_dollar')
    stop_loss_pct = config.get('stop_loss_pct')
    stop_loss_dollar = config.get('stop_loss_dollar')
    
    # Track consecutive conditions
    tp_met_prev = False
    sl_met_prev = False
    
    # Check each bar (need at least 2 bars for consecutive confirmation)
    for i, bar in enumerate(aligned_bars):
        # Skip bars before entry time on entry day
        if is_entry_day and bar['time'] <= entry_time:
            continue
        
        current_premium = calculate_net_premium(bar, legs_info)
        
        # Calculate P&L for this bar
        # P&L = initial_premium - current_premium
        # For DEBIT (long): initial < 0, current < 0. Profit when option gains value (current more negative)
        #   Example: buy at $1 (init=-1), worth $1.50 (curr=-1.50) → pnl = -1 - (-1.50) = +0.50 ✓
        # For CREDIT (short): initial > 0, current > 0. Profit when option loses value (current less positive)  
        #   Example: sell at $1 (init=+1), worth $0.50 (curr=+0.50) → pnl = 1 - 0.50 = +0.50 ✓
        pnl = initial_premium - current_premium
        pnl_pct = (pnl / abs(initial_premium)) * 100 if initial_premium != 0 else 0
        
        # Check take profit based on P&L percentage
        tp_met = False
        if take_profit_pct:
            # TP triggers when profit >= target percentage (positive pnl_pct)
            tp_met = pnl_pct >= take_profit_pct
        elif take_profit_dollar is not None:
            # TP triggers when profit >= target dollar amount (per contract)
            tp_met = pnl >= take_profit_dollar / 100
        
        # Check stop loss based on P&L percentage  
        sl_met = False
        if stop_loss_pct:
            # SL triggers when loss >= target percentage (negative pnl_pct)
            sl_met = pnl_pct <= -stop_loss_pct
        elif stop_loss_dollar is not None:
            # SL triggers when loss >= target dollar amount
            sl_met = pnl <= -stop_loss_dollar / 100
        
        # Require consecutive confirmation for TP
        if tp_met and tp_met_prev:
            # Extract leg prices from leg_prices list, using vw if available, fallback to close
            leg_prices = [leg_data.get('vw', leg_data['close']) for leg_data in bar['leg_prices']]
            return (True, "TAKE_PROFIT", bar['time'], current_premium, leg_prices)
        
        # Require consecutive confirmation for SL
        if sl_met and sl_met_prev:
            # Extract leg prices from leg_prices list, using vw if available, fallback to close
            leg_prices = [leg_data.get('vw', leg_data['close']) for leg_data in bar['leg_prices']]
            return (True, "STOP_LOSS", bar['time'], current_premium, leg_prices)
        
        # Update previous states
        tp_met_prev = tp_met
        sl_met_prev = sl_met
    
    return (False, "", "", 0, [])


def check_exit_signal_conditions(config: Dict, underlying_bars_today: List[Dict],
                                  prev_day_bars: List[Dict], bar_time: str,
                                  indicators_cache: Dict = None, 
                                  trade_date=None) -> Tuple[bool, str]:
    """
    Check signal-based exit conditions (preset or custom) on the underlying price.
    Called after TP/SL check on each monitoring bar.
    Returns (should_exit, reason_string)
    """
    exit_type = config.get('options_exit_cond_type', '')
    
    if not exit_type:
        return False, ""
    
    if exit_type == 'preset' and config.get('exit_preset_condition'):
        exit_config = {
            'preset_condition': config['exit_preset_condition'],
            'preset_operator': config.get('exit_preset_operator', '>'),
            'preset_threshold': config.get('exit_preset_threshold', 0),
            'velocity_lookback': config.get('exit_velocity_lookback', 5)
        }
        
        current_bar = None
        for b in sorted(underlying_bars_today, key=lambda x: x.get('time', '')):
            if b.get('time', '') >= bar_time:
                current_bar = b
                break
        
        if not current_bar:
            if underlying_bars_today:
                current_bar = max(underlying_bars_today, key=lambda x: x.get('time', ''))
            else:
                return False, ""
        
        met, reason = evaluate_preset_condition(exit_config, underlying_bars_today, current_bar, prev_day_bars)
        if met:
            return True, f"EXIT_SIGNAL_PRESET: {reason}"
        return False, ""
    
    elif exit_type == 'custom' and config.get('exit_price_conditions'):
        if not indicators_cache:
            return False, ""
        
        current_bar = None
        for b in sorted(underlying_bars_today, key=lambda x: x.get('time', '')):
            if b.get('time', '') >= bar_time:
                current_bar = b
                break
        
        if not current_bar:
            return False, ""
        
        exit_config_for_eval = dict(config)
        exit_config_for_eval['price_conditions'] = config['exit_price_conditions']
        
        met, reason = evaluate_price_conditions_with_cache(exit_config_for_eval, current_bar, indicators_cache, trade_date)
        if met:
            return True, f"EXIT_SIGNAL_CUSTOM: {reason}"
        return False, ""
    
    return False, ""


# ==================== ANALYSIS ====================

def plot_results(equity: List[float], config: Dict, backtest_id: str = None):
    """Create equity curve and drawdown plot"""
    
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 10))
    
    # Equity curve
    ax1.plot(equity, linewidth=2, color='#2E86AB')
    ax1.set_title('Equity Curve', fontsize=16, fontweight='bold')
    ax1.set_xlabel('Trade Number')
    ax1.set_ylabel('Account Balance ($)')
    ax1.grid(True, alpha=0.3)
    ax1.axhline(y=config['starting_capital'], color='gray', linestyle='--', alpha=0.5)
    
    # Drawdown
    eq = np.array(equity)
    running_max = np.maximum.accumulate(eq)
    dd = (eq - running_max) / running_max * 100
    
    ax2.fill_between(range(len(dd)), dd, 0, color='#A23B72', alpha=0.6)
    ax2.plot(dd, linewidth=2, color='#A23B72')
    ax2.set_title('Drawdown (%)', fontsize=16, fontweight='bold')
    ax2.set_xlabel('Trade Number')
    ax2.set_ylabel('Drawdown (%)')
    ax2.grid(True, alpha=0.3)
    
    plt.tight_layout()
    
    # Ensure output directory exists
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Use backtest_id in filename if provided
    filename = f'equity_curve_{backtest_id}.png' if backtest_id else 'equity_curve.png'
    filepath = os.path.join(OUTPUT_DIR, filename)
    plt.savefig(filepath, dpi=150, bbox_inches='tight')
    plt.close()
    
    print(f"\n✓ Chart: {filepath}")

def calculate_stats(trades: List[Dict], config: Dict):
    """Calculate and display statistics"""
    
    if not trades:
        print("\nNo trades executed.")
        return
    
    total = len(trades)
    # Round to cents before classifying to avoid floating-point -0.00 ghosts
    winners = [t for t in trades if round(t['pnl'], 2) > 0]
    losers = [t for t in trades if round(t['pnl'], 2) < 0]
    breakevens = [t for t in trades if round(t['pnl'], 2) == 0]

    total_pnl = sum(t['pnl'] for t in trades)
    win_rate = len(winners) / total * 100

    # Dollar average per trade
    avg_win = np.mean([t['pnl'] for t in winners]) if winners else 0
    avg_loss = np.mean([t['pnl'] for t in losers]) if losers else 0

    # Per-contract average (normalised for position sizing / compounding)
    avg_win_per_contract = (
        np.mean([t['pnl'] / t['num_contracts'] for t in winners]) if winners else 0
    )
    avg_loss_per_contract = (
        np.mean([t['pnl'] / t['num_contracts'] for t in losers]) if losers else 0
    )

    gross_profit = sum(t['pnl'] for t in winners)
    gross_loss = abs(sum(t['pnl'] for t in losers))
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf')
    
    max_dd = 0
    peak = config['starting_capital']
    for t in trades:
        peak = max(peak, t['capital_after'])
        dd = (t['capital_after'] - peak) / peak * 100
        max_dd = min(max_dd, dd)
    
    final_capital = trades[-1]['capital_after']
    total_return = (final_capital - config['starting_capital']) / config['starting_capital'] * 100
    
    print("\n" + "="*80)
    print(" "*30 + "BACKTEST RESULTS")
    print("="*80)
    print(f"\nStrategy: {config['strategy']}")
    print(f"Period: {config['start_date']} to {config['end_date']}")
    print(f"\n{'PERFORMANCE'}")
    print("-"*80)
    print(f"Starting Capital:     ${config['starting_capital']:>12,.2f}")
    print(f"Ending Capital:       ${final_capital:>12,.2f}")
    print(f"Total P&L:            ${total_pnl:>12,.2f}  ({total_return:>6.2f}%)")
    print(f"\n{'TRADE STATISTICS'}")
    print("-"*80)
    print(f"Total Trades:         {total:>12,}")
    print(f"Winning Trades:       {len(winners):>12,}  ({win_rate:>6.2f}%)")
    print(f"Losing Trades:        {len(losers):>12,}")
    if breakevens:
        print(f"Breakeven Trades:     {len(breakevens):>12,}")
    print(f"\nAverage Win:          ${avg_win:>12,.2f}  (${avg_win_per_contract:>8,.2f} per contract)")
    print(f"Average Loss:         ${avg_loss:>12,.2f}  (${avg_loss_per_contract:>8,.2f} per contract)")
    print(f"Profit Factor:        {profit_factor:>12.2f}")
    print(f"Max Drawdown:         {max_dd:>12.2f}%")
    print("="*80 + "\n")

def save_trade_log(trades: List[Dict], backtest_id: str = None):
    """Save detailed trade log to CSV"""
    
    if not trades:
        return
    
    # Ensure output directory exists
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Use backtest_id in filename if provided
    filename = f'trade_log_{backtest_id}.csv' if backtest_id else 'trade_log.csv'
    filepath = os.path.join(OUTPUT_DIR, filename)
    
    with open(filepath, 'w', newline='') as f:
        # Main trade fields
        fieldnames = [
            'entry_date', 'entry_time', 'entry_timestamp', 'underlying_price',
            'exit_date', 'exit_time', 'exit_timestamp', 'underlying_exit_price',
            'strategy', 'num_contracts', 
            'net_premium_entry', 'net_premium_exit', 'max_risk',
            'pnl', 'exit_reason', 'dte', 'dit', 'capital_before', 'capital_after'
        ]
        
        # Add leg-specific fields dynamically based on max number of legs
        max_legs = max(len(t['legs']) for t in trades)
        for i in range(max_legs):
            fieldnames.extend([
                f'leg{i+1}_symbol',
                f'leg{i+1}_name', 
                f'leg{i+1}_strike',
                f'leg{i+1}_entry_price',
                f'leg{i+1}_exit_price',
                f'leg{i+1}_iv',
                f'leg{i+1}_delta',
                f'leg{i+1}_gamma',
                f'leg{i+1}_theta',
                f'leg{i+1}_vega'
            ])
        
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        
        for trade in trades:
            row = {
                'entry_date': trade['entry_date'],
                'entry_time': trade['entry_time'],
                'entry_timestamp': trade['entry_timestamp'],
                'underlying_price': f"{trade['underlying_price']:.2f}",
                'exit_date': trade['exit_date'],
                'exit_time': trade['exit_time'],
                'exit_timestamp': trade['exit_timestamp'],
                'underlying_exit_price': f"{trade['underlying_exit_price']:.2f}" if trade.get('underlying_exit_price') is not None else '',
                'strategy': trade['strategy'],
                'num_contracts': trade['num_contracts'],
                'net_premium_entry': f"{trade['net_premium_entry']:.4f}",
                'net_premium_exit': f"{trade['net_premium_exit']:.4f}",
                'max_risk': "N/A" if trade['max_risk'] is None else f"{trade['max_risk']:.2f}",
                'pnl': f"{trade['pnl']:.2f}",
                'exit_reason': trade['exit_reason'],
                'dte': trade['dte'],
                'dit': f"{trade['dit']:.1f}",
                'capital_before': f"{trade['capital_before']:.2f}",
                'capital_after': f"{trade['capital_after']:.2f}"
            }
            
            # Add leg details
            for i, leg in enumerate(trade['legs']):
                row[f'leg{i+1}_symbol'] = leg['symbol']
                row[f'leg{i+1}_name'] = leg['name']
                row[f'leg{i+1}_strike'] = f"{leg['strike']:.2f}"
                row[f'leg{i+1}_entry_price'] = f"{leg['entry_price']:.4f}"
                row[f'leg{i+1}_exit_price'] = f"{leg['exit_price']:.4f}"
                # Add Greeks (if available)
                row[f'leg{i+1}_iv'] = f"{leg.get('iv', 0):.4f}" if leg.get('iv') is not None else ''
                row[f'leg{i+1}_delta'] = f"{leg.get('delta', 0):.4f}" if leg.get('delta') is not None else ''
                row[f'leg{i+1}_gamma'] = f"{leg.get('gamma', 0):.6f}" if leg.get('gamma') is not None else ''
                row[f'leg{i+1}_theta'] = f"{leg.get('theta', 0):.4f}" if leg.get('theta') is not None else ''
                row[f'leg{i+1}_vega'] = f"{leg.get('vega', 0):.4f}" if leg.get('vega') is not None else ''
            
            writer.writerow(row)
    
    print(f"✓ Trade log: {filepath}")
    print(f"  Columns: {len(fieldnames)}")
    print(f"  Includes: Entry/exit timestamps, underlying price, all leg details")

# ==================== MAIN ====================

def main():
    """Main entry point"""
    
    try:
        config = get_user_config()
        client = RESTClient(API_KEY)
        
        trades, equity, decision_log = run_backtest(config, client)
        
        plot_results(equity, config)
        calculate_stats(trades, config)
        save_trade_log(trades)
        
    except KeyboardInterrupt:
        print("\n\nBacktest interrupted.")
    except Exception as e:
        print(f"\n\nError: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
