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
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
import pandas as pd
from polygon.rest import RESTClient
import matplotlib.pyplot as plt
import numpy as np
import pytz
from scipy.stats import norm
from scipy.optimize import brentq
from scipy.stats import linregress as _opt_linregress

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

# ==================== SUB-MINUTE / CANDLE HELPERS ====================
# Shared layer powering: (1) 10-second entry times, (2) the "$ distance from
# previous candle" strike method, and (3) the "Current Candle" custom-builder
# metric.  All three read sub-minute/candle OHLC via a single cached fetch.

_SUBMINUTE_CANDLE_CACHE = {}

def _normalize_candle_timespan(candle_type):
    """Map UI candle-type shorthands to Polygon timespan strings."""
    ct = str(candle_type or 'minute').strip().lower()
    if ct in ('sec', 'second', 'seconds', 's'):
        return 'second'
    if ct in ('min', 'minute', 'minutes', 'm'):
        return 'minute'
    if ct in ('hr', 'hour', 'hours', 'h'):
        return 'hour'
    if ct in ('day', 'days', 'd'):
        return 'day'
    if ct in ('week', 'weeks', 'w'):
        return 'week'
    if ct in ('month', 'months'):
        return 'month'
    return 'minute'

def _parse_entry_time_parts(entry_time_str):
    """Parse 'HH:MM' or 'HH:MM:SS' → (hour, minute, second). Tolerant of blanks."""
    parts = str(entry_time_str or '0:0').split(':')
    try:
        h = int(parts[0])
    except (ValueError, IndexError):
        h = 0
    m = int(parts[1]) if len(parts) > 1 and str(parts[1]).strip() != '' else 0
    s = int(parts[2]) if len(parts) > 2 and str(parts[2]).strip() != '' else 0
    return h, m, s

def _fetch_underlying_candles(client, underlying_sym, target_date, multiplier, candle_type):
    """Ascending list of candle dicts for a single calendar day at (multiplier, timespan).

    Each bar: {'timestamp'(UTC ms),'datetime'(ET),'time'('HH:MM:SS' ET),
    'open','high','low','close','volume'}.  Cached per (sym,mult,span,date).
    Returns [] when the symbol/day has no sub-minute data (e.g. ETFs 403 on
    sub-minute) so callers can fail loudly rather than silently fall back.
    """
    timespan = _normalize_candle_timespan(candle_type)
    try:
        multiplier = max(1, int(multiplier))
    except (ValueError, TypeError):
        multiplier = 1
    date_str = target_date.strftime('%Y-%m-%d')
    cache_key = (underlying_sym, multiplier, timespan, date_str)
    if cache_key in _SUBMINUTE_CANDLE_CACHE:
        return _SUBMINUTE_CANDLE_CACHE[cache_key]
    eastern = pytz.timezone('US/Eastern')
    bars = []
    try:
        aggs = list(client.list_aggs(
            underlying_sym, multiplier, timespan,
            date_str, date_str,
            adjusted="true", sort="asc", limit=50000
        ))
        for agg in aggs:
            ts = getattr(agg, 'timestamp', None)
            if ts is None:
                continue
            dt = datetime.fromtimestamp(ts / 1000, tz=pytz.UTC).astimezone(eastern)
            if dt.strftime('%Y-%m-%d') != date_str:
                continue
            bars.append({
                'timestamp': int(ts),
                'datetime': dt,
                'time': dt.strftime('%H:%M:%S'),
                'open': agg.open, 'high': agg.high,
                'low': agg.low, 'close': agg.close,
                'volume': getattr(agg, 'volume', 0),
            })
    except Exception as e:
        print(f"  [Candle] fetch error {underlying_sym} {multiplier}/{timespan} {date_str}: {e}", flush=True)
        bars = []
    bars.sort(key=lambda b: b['timestamp'])
    _SUBMINUTE_CANDLE_CACHE[cache_key] = bars
    return bars

def _select_prev_current_candles(bars, cutoff_ts_ms):
    """current = last bar with timestamp <= cutoff; previous = the completed bar before it."""
    cur = None
    cur_idx = -1
    for i, b in enumerate(bars):
        if b['timestamp'] <= cutoff_ts_ms:
            cur = b
            cur_idx = i
        else:
            break
    prev = bars[cur_idx - 1] if cur_idx >= 1 else None
    return prev, cur

def _candle_color(candle):
    if not candle:
        return None
    o = candle.get('open')
    c = candle.get('close')
    if o is None or c is None:
        return None
    if c > o:
        return 'green'
    if c < o:
        return 'red'
    return 'doji'

def _candle_datapoint(candle, datapoint):
    dp = str(datapoint or 'close').strip().lower()
    if dp in ('o', 'open'):
        dp = 'open'
    elif dp in ('h', 'high'):
        dp = 'high'
    elif dp in ('l', 'low'):
        dp = 'low'
    else:
        dp = 'close'
    if not candle:
        return None
    v = candle.get(dp)
    return float(v) if v is not None else None

def _compare_values(a, op, b):
    if a is None or b is None:
        return False
    op = str(op or '>').strip()
    if op == '>':
        return a > b
    if op == '<':
        return a < b
    if op == '>=':
        return a >= b
    if op == '<=':
        return a <= b
    if op in ('==', '='):
        return abs(a - b) < 1e-9
    if op == '!=':
        return abs(a - b) >= 1e-9
    return False

def _resolve_candle(client, symbol, trade_date, cutoff_ts_ms, day_offset, candle_type, multiplier, which):
    """Fetch candles for (trade_date + day_offset) and return (previous, current, bars).

    For day 0 the cutoff is the entry timestamp (current = forming candle at entry,
    previous = last completed candle before it).  For prior days the current candle
    is the last completed candle of that day.
    """
    from datetime import timedelta as _td
    underlying_sym = get_underlying_ticker(symbol)
    try:
        day_off = int(day_offset or 0)
    except (ValueError, TypeError):
        day_off = 0
    target_date = trade_date + _td(days=day_off)
    bars = _fetch_underlying_candles(client, underlying_sym, target_date, multiplier, candle_type)
    if not bars:
        return None, None, bars
    if day_off != 0:
        cutoff = bars[-1]['timestamp'] + 1
    else:
        cutoff = cutoff_ts_ms
    prev, cur = _select_prev_current_candles(bars, cutoff)
    return prev, cur, bars

def _reference_candle_price(client, symbol, trade_date, entry_ts_ms, params, which='previous'):
    """Datapoint of the previous/current candle for the $-distance-from-candle strike
    method.  Returns (value, note); value None → skip trade (missing data / color mismatch)."""
    candle_type = params.get('candle_type', 'min')
    multiplier = params.get('multiplier', 1)
    day_offset = params.get('day', 0)
    datapoint = params.get('datapoint', 'close')
    candle_color = str(params.get('candle_color', 'either')).strip().lower()
    prev, cur, bars = _resolve_candle(
        client, symbol, trade_date, entry_ts_ms, day_offset, candle_type, multiplier, which
    )
    if not bars:
        return None, f"no {candle_type} candle data"
    candle = prev if which == 'previous' else cur
    if candle is None:
        return None, "candle unavailable"
    if candle_color in ('green', 'red'):
        col = _candle_color(candle)
        if col != candle_color:
            return None, f"candle is {col}, need {candle_color}"
    return _candle_datapoint(candle, datapoint), ""

def _current_underlying_price(client, symbol, trade_date, entry_ts_ms, ten_second=True):
    """Underlying price at/just-before the entry timestamp (10-sec when available, else 1-min)."""
    underlying_sym = get_underlying_ticker(symbol)
    mult, span = (10, 'second') if ten_second else (1, 'minute')
    bars = _fetch_underlying_candles(client, underlying_sym, trade_date, mult, span)
    if not bars:
        bars = _fetch_underlying_candles(client, underlying_sym, trade_date, 1, 'minute')
    if not bars:
        return None
    last = None
    for b in bars:
        if b['timestamp'] <= entry_ts_ms:
            last = b
        else:
            break
    if last is None:
        # No bar exists at/before entry: never fall back to a future bar
        # (that would introduce lookahead bias). Signal "no price available".
        return None
    c = last.get('close')
    return float(c) if c is not None else None

def _eval_current_candle_condition(condition, client, symbol, trade_date, entry_ts_ms, ten_second=True):
    """Evaluate a Custom-Builder 'current_candle' metric condition.

    comparator 'none'                → assert current-candle color (green/red/either),
                                       colour = current price vs current-candle open.
    comparator 'compare_prev_candle' → compare a current-candle datapoint (or the live
                                       current price) against a previous-candle datapoint,
                                       with an optional stricter threshold.
    Returns (met, reason, detail_dict).
    """
    comparator = str(condition.get('comparator', 'none')).strip()
    left = condition.get('left', {}) or {}
    l_ct = left.get('candle_type', 'min')
    l_mult = left.get('multiplier', 1)
    l_day = left.get('day', 0)
    l_dp_raw = str(left.get('datapoint', 'open')).strip().lower()
    l_dp_is_price = l_dp_raw in ('price', 'current_price', 'current')
    l_color_raw = str(left.get('candle_color', 'either')).strip().lower()

    prev_l, cur_l, bars_l = _resolve_candle(
        client, symbol, trade_date, entry_ts_ms, l_day, l_ct, l_mult, 'current'
    )
    # The current candle bar is only required when we actually read a datapoint
    # from it or test its colour. When the left side is the live "current price"
    # with no colour filter, the configured candle type is irrelevant, so a
    # missing sub-minute bar must NOT block the comparison.
    needs_cur_candle = (comparator != 'compare_prev_candle') or (not l_dp_is_price) or (l_color_raw in ('green', 'red'))
    if needs_cur_candle and (not bars_l or cur_l is None):
        return False, "No current candle data", {}

    cur_price = _current_underlying_price(client, symbol, trade_date, entry_ts_ms, ten_second=ten_second)
    detail = {'metric': 'current_candle', 'operator': condition.get('operator', '=='),
              'threshold': 0, 'threshold_unit': 'dollar', 'series_type': 'current_candle'}

    if comparator == 'none':
        want = str(left.get('candle_color', 'either')).strip().lower()
        cur_open = cur_l.get('open')
        if want in ('either', '', 'any'):
            detail.update({'met': True, 'left_label': 'Current candle', 'left_value': round(cur_price or 0, 4),
                           'right_label': 'any color', 'right_value': 0, 'effective_right': 0})
            return True, "", detail
        if cur_price is None or cur_open is None:
            return False, "No current price for candle color", detail
        actual = 'green' if cur_price > cur_open else ('red' if cur_price < cur_open else 'doji')
        met = (actual == want)
        detail.update({'met': met, 'left_label': f'Current candle ({actual})', 'left_value': round(cur_price, 4),
                       'right_label': want, 'right_value': round(cur_open, 4), 'effective_right': round(cur_open, 4)})
        return (met, "" if met else f"current candle is {actual}, need {want}", detail)

    if comparator == 'compare_prev_candle':
        operator = str(condition.get('operator', '<')).strip()
        l_dp = str(left.get('datapoint', 'open')).strip().lower()
        if l_dp in ('price', 'current_price', 'current'):
            left_val = cur_price
            left_lbl = 'Current price'
        else:
            left_val = _candle_datapoint(cur_l, l_dp)
            left_lbl = f'Current candle {l_dp}'
        l_color = str(left.get('candle_color', 'either')).strip().lower()
        if l_color in ('green', 'red') and cur_price is not None:
            _co = cur_l.get('open', cur_price)
            _cc = 'green' if cur_price > _co else ('red' if cur_price < _co else 'doji')
            if _cc != l_color:
                return False, f"current candle is {_cc}, need {l_color}", detail
        right = condition.get('right', {}) or {}
        r_ct = right.get('candle_type', l_ct)
        r_mult = right.get('multiplier', l_mult)
        r_day = right.get('day', 0)
        r_dp = str(right.get('datapoint', 'close')).strip().lower()
        r_color = str(right.get('candle_color', 'either')).strip().lower()
        prev_r, cur_r, bars_r = _resolve_candle(
            client, symbol, trade_date, entry_ts_ms, r_day, r_ct, r_mult, 'previous'
        )
        if not bars_r or prev_r is None:
            return False, "No previous candle data", detail
        if r_color in ('green', 'red'):
            _pc = _candle_color(prev_r)
            if _pc != r_color:
                return False, f"previous candle is {_pc}, need {r_color}", detail
        right_val = _candle_datapoint(prev_r, r_dp)
        if left_val is None or right_val is None:
            return False, "Missing candle values", detail
        threshold = condition.get('threshold', {}) or {}
        eff_right = right_val
        try:
            tv = float(threshold.get('value', 0) or 0)
        except (ValueError, TypeError):
            tv = 0.0
        tu = str(threshold.get('unit', 'dollar')).strip().lower()
        if tv:
            if operator in ('<', '<='):
                eff_right = right_val * (1 - tv / 100.0) if tu in ('percent', 'pct', '%') else right_val - tv
            else:
                eff_right = right_val * (1 + tv / 100.0) if tu in ('percent', 'pct', '%') else right_val + tv
        met = _compare_values(left_val, operator, eff_right)
        detail.update({'met': met, 'left_label': left_lbl, 'left_value': round(left_val, 4),
                       'operator': operator, 'right_label': f'Prev candle {r_dp}',
                       'right_value': round(right_val, 4), 'effective_right': round(eff_right, 4),
                       'threshold': tv, 'threshold_unit': tu})
        return (met, "" if met else f"{left_lbl} {left_val:.2f} {operator} {eff_right:.2f} failed", detail)

    return False, f"Unknown current-candle comparator {comparator}", detail

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


def _eval_candle_pattern_options(condition: Dict, bars_by_date: Dict,
                                  trade_date: datetime, entry_timestamp: int) -> bool:
    """Evaluate a candle-pattern condition using pre-loaded minute bars (zero extra API calls)."""
    import pandas as pd
    cp_day         = int(condition.get('cp_day', 0))
    cp_candle      = condition.get('cp_candle', 'min')
    cp_multiplier  = int(condition.get('cp_multiplier', 1))
    cp_num_candles = int(condition.get('cp_num_candles', 1))
    cp_candles     = condition.get('cp_candles', [])
    if not cp_candles:
        return True

    from datetime import timedelta as _td
    target_date = trade_date + _td(days=cp_day)
    date_str    = target_date.strftime('%Y-%m-%d')

    available_dates = sorted(bars_by_date.keys())

    def _bars_to_df(bars):
        records = []
        for b in bars:
            dt = b.get('datetime')
            if dt is None:
                ts_ms = b.get('timestamp')
                if ts_ms is None:
                    continue
                dt = datetime.fromtimestamp(ts_ms / 1000).replace(tzinfo=None)
            elif hasattr(dt, 'tzinfo') and dt.tzinfo is not None:
                dt = dt.replace(tzinfo=None)
            records.append({
                'timestamp': dt,
                'open':   float(b.get('open', 0) or 0),
                'high':   float(b.get('high', 0) or 0),
                'low':    float(b.get('low', 0) or 0),
                'close':  float(b.get('close', 0) or 0),
                'volume': float(b.get('volume', 0) or 0),
            })
        return pd.DataFrame(records) if records else None

    day_bars = bars_by_date.get(date_str, [])
    if not day_bars:
        return False

    day_df = _bars_to_df(day_bars)
    if day_df is None or day_df.empty:
        return False

    MARKET_OPEN_MIN = 4 * 60
    day_df['_min']    = day_df['timestamp'].apply(lambda ts: ts.hour * 60 + ts.minute)
    day_df['_offset'] = day_df['_min'] - MARKET_OPEN_MIN
    day_df            = day_df[day_df['_offset'] >= 0]

    mins_per_bucket = cp_multiplier * (60 if cp_candle == 'hr' else 1)
    mins_per_bucket = min(mins_per_bucket, 240)
    if mins_per_bucket < 1:
        mins_per_bucket = 1
    day_df['_bucket_id'] = (day_df['_offset'] // mins_per_bucket).astype(int)

    if cp_day == 0 and entry_timestamp:
        entry_dt     = datetime.fromtimestamp(entry_timestamp / 1000)
        entry_offset = (entry_dt.hour * 60 + entry_dt.minute) - MARKET_OPEN_MIN
        entry_bid    = int(entry_offset // mins_per_bucket)
        day_df       = day_df[day_df['_bucket_id'] < entry_bid]

    if day_df.empty:
        return False

    def _to_buckets(df):
        return (df.groupby('_bucket_id')
                .agg(open=('open', 'first'), high=('high', 'max'),
                     low=('low', 'min'), close=('close', 'last'),
                     volume=('volume', 'sum'))
                .reset_index().sort_values('_bucket_id'))

    buckets = _to_buckets(day_df)

    if len(buckets) < cp_num_candles:
        return False

    avg_buckets = buckets
    if len(buckets) < 5:
        for prior_date_str in reversed(available_dates):
            if prior_date_str >= date_str:
                continue
            prior_bars = bars_by_date.get(prior_date_str, [])
            if not prior_bars:
                continue
            prior_df = _bars_to_df(prior_bars)
            if prior_df is None or prior_df.empty:
                continue
            prior_df['_min']       = prior_df['timestamp'].apply(lambda ts: ts.hour * 60 + ts.minute)
            prior_df['_offset']    = prior_df['_min'] - MARKET_OPEN_MIN
            prior_df               = prior_df[prior_df['_offset'] >= 0]
            prior_df['_bucket_id'] = (prior_df['_offset'] // mins_per_bucket).astype(int)
            if prior_df.empty:
                continue
            pb = _to_buckets(prior_df)
            if len(pb) >= 5:
                avg_buckets = pb
                break

    seq = buckets.tail(cp_num_candles).reset_index(drop=True)

    from backtester_engine_v3_0__6_ import _calc_cp_range_py, _calc_cp_avg_range_py, _cp_compare_py

    for k, spec in enumerate(cp_candles[:cp_num_candles]):
        if k >= len(seq):
            return False
        candle     = seq.iloc[k]
        direction  = spec.get('direction', 'bullish')
        is_bullish = float(candle['close']) >= float(candle['open'])
        if direction == 'bullish' and not is_bullish:
            return False
        if direction == 'bearish' and is_bullish:
            return False

        open_rel = spec.get('open_rel')
        if open_rel and k > 0:
            prev_c   = seq.iloc[k - 1]
            cur_open = float(candle['open'])
            prv_open = float(prev_c['open'])
            if open_rel == 'above' and cur_open <= prv_open:
                return False
            if open_rel == 'below' and cur_open >= prv_open:
                return False

        if spec.get('range_enabled'):
            range_type   = spec.get('range_type', 'open_close')
            operator     = spec.get('operator', '>')
            comparator_t = spec.get('comparator', 'value_dollar')
            range_value  = float(spec.get('range_value', 0) or 0)

            lhs = _calc_cp_range_py(candle, range_type)
            if lhs is None:
                return False

            if comparator_t == 'value_dollar':
                rhs = range_value
            elif comparator_t == 'value_pct':
                close_p = float(candle['close'])
                rhs = (range_value / 100.0) * close_p if close_p != 0 else 0
            elif comparator_t in ('pct_avg_range', 'dollar_avg_range'):
                crt  = spec.get('comp_range_type') or range_type
                avgr = _calc_cp_avg_range_py(avg_buckets, crt)
                if avgr is None or avgr == 0:
                    return False
                rhs = (range_value / 100.0) * avgr if comparator_t == 'pct_avg_range' else range_value * avgr
            elif comparator_t == 'range_same' or (isinstance(comparator_t, str) and comparator_t.startswith('range_') and comparator_t[6:].isdigit()):
                crt = spec.get('comp_range_type') or 'high_low'
                if comparator_t == 'range_same':
                    rhs_r = _calc_cp_range_py(candle, crt)
                else:
                    ref_idx = int(comparator_t.split('_')[1]) - 1
                    if ref_idx < 0 or ref_idx >= len(seq):
                        return False
                    rhs_r = _calc_cp_range_py(seq.iloc[ref_idx], crt)
                if rhs_r is None or rhs_r == 0:
                    return False
                rhs = (range_value / 100.0) * rhs_r
            else:
                rhs = range_value

            if not _cp_compare_py(lhs, operator, rhs):
                return False

    return True


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

    # Handle candle_pattern conditions inline (no Polygon indicator API needed)
    filtered_conditions = []
    for idx, condition in enumerate(price_conditions):
        if condition.get('metric') == 'candle_pattern' or condition.get('left_type') == 'candle_pattern':
            try:
                met = _eval_candle_pattern_options(condition, client, underlying_sym, trade_date, entry_timestamp)
                if not met:
                    return False, f"Candle pattern condition {idx+1} not met"
            except Exception as _cpe:
                print(f"  [CandlePattern opt] Error: {_cpe}")
                return False, f"Candle pattern error: {str(_cpe)}"
        else:
            filtered_conditions.append((idx, condition))

    for idx, condition in filtered_conditions:
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
            elif comparator == 'zero_line':
                right_value = 0.0
            elif comparator in ('compare_macd_line', 'compare_signal'):
                # MACD self-comparator: right side uses same params as left, different component
                right_comp = 'macd_line' if comparator == 'compare_macd_line' else 'signal'
                right_params_derived = dict(left)
                right_params_derived['component'] = right_comp
                right_value = get_indicator_value_for_backtest(
                    client, underlying_sym, 'macd', right_params_derived, trade_date, entry_timestamp
                )
                if right_value is None:
                    print(f"  [Condition {idx+1}] Could not fetch MACD {right_comp} comparison data - skipping trade")
                    return False, f"Missing MACD {right_comp} comparison data"
            else:
                right = condition.get('right', {})
                right_metric = comparator.replace('compare_', '')
                right_value = get_indicator_value_for_backtest(
                    client, underlying_sym, right_metric, right, trade_date, entry_timestamp
                )
                
                if right_value is None:
                    print(f"  [Condition {idx+1}] Could not fetch {right_metric} comparison data - skipping trade")
                    return False, f"Missing {right_metric} comparison data"
                
                # Apply threshold if present — direction always makes the condition stricter:
                # for < / <=, lower the right side; for > / >=, raise it.
                threshold = condition.get('threshold', {})
                if threshold:
                    threshold_value = threshold.get('value', 0)
                    threshold_unit = threshold.get('unit', 'percent')
                    if operator in ('<', '<='):
                        if threshold_unit == 'percent':
                            right_value = right_value * (1 - threshold_value / 100)
                        else:
                            right_value = right_value - threshold_value
                    else:
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
                low  = float(condition.get('compare_value_low',  0) or 0)
                high = float(condition.get('compare_value_high', 0) or 0)
                met  = low < left_value < high
            elif operator in ('cross_up', 'cross_down', 'cross_either'):
                # Cross: need previous candle's values (1 minute back)
                prev_ts = entry_timestamp - 60000
                prev_left = get_indicator_value_for_backtest(
                    client, underlying_sym, metric, left, trade_date, prev_ts
                )
                if comparator in ('value', 'zero_line'):
                    prev_right = right_value  # fixed value never changes (0 for zero_line)
                elif comparator in ('compare_macd_line', 'compare_signal'):
                    _mc_prev_comp = 'macd_line' if comparator == 'compare_macd_line' else 'signal'
                    prev_right = get_indicator_value_for_backtest(
                        client, underlying_sym, 'macd',
                        {**left, 'component': _mc_prev_comp}, trade_date, prev_ts
                    )
                else:
                    _rm = comparator.replace('compare_', '')
                    _rp = condition.get('right', {})
                    prev_right = get_indicator_value_for_backtest(
                        client, underlying_sym, _rm, _rp, trade_date, prev_ts
                    )
                if prev_left is not None and prev_right is not None:
                    cross_up   = prev_left < prev_right and left_value >= right_value
                    cross_down = prev_left > prev_right and left_value <= right_value
                    if operator == 'cross_up':
                        met = cross_up
                    elif operator == 'cross_down':
                        met = cross_down
                    else:
                        met = cross_up or cross_down
            
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
    needs_price_open = False  # asymmetric "Current Price" cross: prev bar uses OPEN
    
    def _sma_ema_key(m, params):
        """Build composite cache key for SMA/EMA: sma_w14_t5 etc."""
        w  = int(params.get('window', 14))
        tf = int(params.get('timeframe_minutes', 5))
        return f'{m}_w{w}_t{tf}'

    for condition in all_conditions:
        metric = condition.get('metric', 'price')
        left_params = condition.get('left', {})
        left_candle_type = left_params.get('candle_type', 'minute')

        # "Current Price" cross conditions need a parallel OPEN-price series so
        # the previous bar can be evaluated on its open (asymmetric cross).
        if left_params.get('current_price') and condition.get('operator', '>') in ('cross_up', 'cross_down', 'cross_either'):
            needs_price_open = True
        
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
    
    # Pre-pass: if any SMA/EMA/VWAP or 'price' conditions exist, fetch 1-min bars ONCE.
    # Price metric also reuses _1min_raw so its timestamps match SMA/EMA/VWAP timestamps exactly.
    sma_ema_keys = [k for k in metrics_config if k.startswith('sma_') or k.startswith('ema_') or k.startswith('vwap_')]
    _needs_1min_raw = bool(sma_ema_keys) or ('price' in metrics_config)
    if _needs_1min_raw:
        max_window = max((int(metrics_config[k].get('window', 14)) for k in sma_ema_keys), default=14)
        buffer_days = max(5, (max_window // 390 + 2) * 3)
        extended_start = start_date - timedelta(days=buffer_days)
        extended_start_str = extended_start.strftime("%Y-%m-%d")
        url_1min = f"https://api.polygon.io/v2/aggs/ticker/{underlying_sym}/range/1/minute/{extended_start_str}/{end_str}"
        print(f"[Prefetch] Fetching shared 1-min bars for {len(sma_ema_keys)} SMA/EMA key(s): window up to {max_window}, from {extended_start_str}...", flush=True)
        try:
            # Paginate through ALL 1-min bars — a multi-month backtest can exceed 50,000 bars
            _all_1min = []
            _next_url = url_1min
            _next_params = {'apiKey': api_key, 'limit': 50000, 'adjusted': 'true', 'order': 'asc'}
            _page = 0
            while _next_url:
                _resp = requests.get(_next_url, params=_next_params)
                if _resp.status_code != 200:
                    print(f"[Prefetch] 1-min raw bars error on page {_page}: {_resp.status_code}", flush=True)
                    break
                _d = _resp.json()
                _batch = _d.get('results', [])
                _all_1min.extend(_batch)
                _page += 1
                _next_url = _d.get('next_url')
                _next_params = {'apiKey': api_key}  # next_url already encodes all other params
                print(f"[Prefetch] 1-min bars page {_page}: +{len(_batch)} bars (total {len(_all_1min)})", flush=True)
                if not _batch:
                    break
            indicators['_1min_raw'] = _all_1min
            print(f"[Prefetch] 1-min raw bars: {len(_all_1min)} bars loaded total ({_page} page(s))", flush=True)
        except Exception as e:
            indicators['_1min_raw'] = []
            print(f"[Prefetch] 1-min raw bars exception: {e}", flush=True)

    for metric, params in metrics_config.items():
        try:
            if metric == 'price':
                # Build price cache from _1min_raw so timestamps are identical to
                # the bars used for SMA/EMA/VWAP — a separate REST call returns
                # timestamps with a different alignment, causing find_closest_indicator_value
                # to always return None for the cross lookback.
                series_type = params.get('series_type', 'close')
                field_map = {'open': 'o', 'high': 'h', 'low': 'l', 'close': 'c', 'vwap': 'vw'}
                field = field_map.get(series_type, 'c')
                raw_bars = indicators.get('_1min_raw', [])
                if raw_bars:
                    price_data = {}
                    _none_count = 0
                    for bar in raw_bars:
                        ts = bar.get('t')
                        if ts is not None:
                            val = bar.get(field)
                            # Fallback: for vwap (field='vw'), use close when vw is absent
                            # (index tickers like I:SPX have no transactions, so vw is null)
                            if val is None and field == 'vw':
                                val = bar.get('c')
                                _none_count += 1
                            price_data[int(ts)] = val
                    indicators['price'] = price_data
                    # Parallel OPEN series for asymmetric "Current Price" crosses —
                    # the previous bar is read from this while the current bar keeps
                    # using its VWAP (the current price).
                    if needs_price_open:
                        open_data = {}
                        for bar in raw_bars:
                            ts = bar.get('t')
                            if ts is not None:
                                ov = bar.get('o')
                                if ov is None:
                                    ov = bar.get('c')
                                open_data[int(ts)] = ov
                        indicators['price_open'] = open_data
                        print(f"[Prefetch] PRICE_OPEN (asymmetric current-price cross): {len(open_data)} bars", flush=True)
                    _sample_keys = sorted(price_data.keys())[:3]
                    _sample_vals = [price_data[k] for k in _sample_keys]
                    print(f"[Prefetch] PRICE (from _1min_raw): {len(price_data)} bars, "
                          f"series={series_type}, field={field}, vw_fallbacks={_none_count}, "
                          f"sample_ts={_sample_keys}, sample_vals={_sample_vals}", flush=True)
                else:
                    # Fallback: separate REST call (may have timestamp misalignment)
                    price_multiplier = int(params.get('multiplier', 1) or 1)
                    url = f"https://api.polygon.io/v2/aggs/ticker/{underlying_sym}/range/{price_multiplier}/minute/{start_str}/{end_str}"
                    print(f"[Prefetch] PRICE fallback REST call: {start_str} to {end_str}...", flush=True)
                    response = requests.get(url, params={'apiKey': api_key, 'limit': 50000, 'adjusted': 'true'})
                    if response.status_code == 200:
                        results = response.json().get('results', [])
                        price_data = {}
                        for bar in results:
                            ts = bar.get('t')
                            if ts is not None:
                                price_data[int(ts)] = bar.get(field)
                        indicators['price'] = price_data
                        print(f"[Prefetch] PRICE fallback: got {len(results)} bars", flush=True)
                    else:
                        print(f"[Prefetch] PRICE fallback error: {response.status_code}", flush=True)
            
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

                # For the volume-weighted VWAP path we may carry a separate volume series
                _vwap_vol_series = None

                if timeframe_minutes <= 1:
                    # Use 1-min bars directly
                    timestamps = [bar.get('t') for bar in raw_bars]
                    if metric_type == 'vwap':
                        vw_vals = [bar.get('vw') for bar in raw_bars]
                        _has_vw = any(v is not None for v in vw_vals)
                        if _has_vw:
                            # Polygon pre-computed per-bar VWAP — use directly, fill gaps with close
                            prices = [v if v is not None else bar.get('c') for v, bar in zip(vw_vals, raw_bars)]
                        else:
                            # No vw field: compute per-bar typical price and collect volume for weighted rolling
                            _tp_list, _vol_list = [], []
                            for bar in raw_bars:
                                h, l, c = bar.get('h'), bar.get('l'), bar.get('c')
                                tp = (h + l + c) / 3.0 if (h is not None and l is not None and c is not None) else (c or 0.0)
                                _tp_list.append(tp)
                                _vol_list.append(bar.get('v') or 0.0)
                            prices = _tp_list
                            _has_vol = any(v > 0 for v in _vol_list)
                            if _has_vol:
                                _vwap_vol_series = _vol_list
                                print(f"[Prefetch] {metric}: vw absent — computing rolling VWAP from volume × (H+L+C)/3", flush=True)
                            else:
                                print(f"[Prefetch] {metric}: no vw or volume data — using simple rolling mean of (H+L+C)/3", flush=True)
                    else:
                        prices = [bar.get(field) for bar in raw_bars]
                else:
                    # Aggregate 1-min bars to the user's chosen timeframe
                    df = pd.DataFrame(raw_bars)
                    if df.empty:
                        print(f"[Prefetch] {metric}: empty raw bar DataFrame — skipping", flush=True)
                        continue
                    df['_ts'] = pd.to_datetime(df['t'], unit='ms', utc=True)
                    df = df.set_index('_ts').sort_index()

                    if metric_type == 'vwap':
                        # Determine per-bar price: prefer vw, then typical price, then close
                        _has_vw = 'vw' in df.columns and df['vw'].notna().any()
                        _has_vol = 'v' in df.columns and df['v'].notna().any() and (df['v'].fillna(0) > 0).any()
                        if _has_vw:
                            df['_bar_price'] = df['vw']
                        else:
                            if all(c in df.columns for c in ['h', 'l', 'c']):
                                df['_bar_price'] = (df['h'] + df['l'] + df['c']) / 3.0
                                print(f"[Prefetch] {metric}: vw absent — using (H+L+C)/3", flush=True)
                            else:
                                df['_bar_price'] = df['c']
                                print(f"[Prefetch] {metric}: vw and H/L absent — using close price", flush=True)

                        if _has_vol:
                            # Volume-weighted VWAP per bucket: Σ(price×vol) / Σ(vol)
                            df['_vol_safe'] = df['v'].fillna(0.0)
                            df['_vwp'] = df['_bar_price'] * df['_vol_safe']
                            _ragg = {k: v for k, v in {'_vwp': 'sum', '_vol_safe': 'sum', 'c': 'last'}.items() if k in df.columns}
                            _rs = df.resample(f'{timeframe_minutes}min').agg(_ragg).dropna(subset=['c'])
                            timestamps = [int(ts.timestamp() * 1000) for ts in _rs.index]
                            _denom = _rs['_vol_safe'].replace(0.0, float('nan'))
                            prices = (_rs['_vwp'] / _denom).fillna(_rs['c']).tolist()
                        else:
                            # No volume — simple mean of bar prices per bucket
                            _ragg = {k: v for k, v in {'_bar_price': 'mean', 'c': 'last'}.items() if k in df.columns}
                            _rs = df.resample(f'{timeframe_minutes}min').agg(_ragg).dropna(subset=['c'])
                            timestamps = [int(ts.timestamp() * 1000) for ts in _rs.index]
                            prices = _rs['_bar_price'].tolist()
                            if not _has_vw:
                                print(f"[Prefetch] {metric}: no volume data — using simple mean of (H+L+C)/3 per bucket", flush=True)
                    else:
                        agg_map = {'o': 'first', 'h': 'max', 'l': 'min', 'c': 'last'}
                        agg_map = {k: v for k, v in agg_map.items() if k in df.columns}
                        resampled = df.resample(f'{timeframe_minutes}min').agg(agg_map).dropna(subset=['c'])
                        timestamps = [int(ts.timestamp() * 1000) for ts in resampled.index]
                        prices = resampled[field].tolist() if field in resampled.columns else resampled['c'].tolist()

                # Compute rolling indicator
                if metric_type == 'vwap' and _vwap_vol_series is not None:
                    # Proper volume-weighted rolling VWAP for 1-min path
                    _price_s = pd.Series(prices, dtype=float)
                    _vol_s   = pd.Series(_vwap_vol_series, dtype=float)
                    _vwp_s   = _price_s * _vol_s
                    _rolled_vwp = _vwp_s.rolling(window=window, min_periods=window).sum()
                    _rolled_vol = _vol_s.rolling(window=window, min_periods=window).sum().replace(0.0, float('nan'))
                    rolled = (_rolled_vwp / _rolled_vol).fillna(_price_s.rolling(window=window, min_periods=window).mean())
                else:
                    price_series = pd.Series(prices, dtype=float)
                    # Same formula as simulated trading engine
                    if metric_type == 'sma':
                        rolled = price_series.rolling(window=window, min_periods=window).mean()
                    elif metric_type == 'ema':
                        rolled = price_series.ewm(span=window, adjust=False).mean()
                    else:
                        # VWAP (resampled path, or 1-min with no volume): rolling mean of per-bucket values
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
                raw_series_type = params.get('series_type', 'close')
                _valid_series = {'close', 'open', 'high', 'low'}
                series_type = raw_series_type if raw_series_type in _valid_series else 'close'
                if series_type != raw_series_type:
                    print(f"[Prefetch] RSI: series_type '{raw_series_type}' not recognised — using 'close'", flush=True)
                timespan = params.get('candle_type', 'day')
                ind_multiplier = int(params.get('multiplier', 1) or 1)
                field_map = {'open': 'o', 'high': 'h', 'low': 'l', 'close': 'c'}
                field = field_map.get(series_type, 'c')

                def _compute_rsi_series(closes, period):
                    """Wilder's smoothed RSI — identical formula to bot_executor._ind_rsi.
                    Returns one RSI value per bar; None for bars before the seed window."""
                    n = len(closes)
                    if n < period + 1:
                        return [None] * n
                    diffs  = [closes[i] - closes[i - 1] for i in range(1, n)]
                    gains  = [max(d, 0.0)  for d in diffs]
                    losses = [max(-d, 0.0) for d in diffs]
                    result = [None] * n
                    avg_g = sum(gains[:period])  / period
                    avg_l = sum(losses[:period]) / period
                    result[period] = 100.0 if avg_l == 0 else 100 - 100 / (1 + avg_g / avg_l)
                    for i in range(period, n - 1):
                        avg_g = (avg_g * (period - 1) + gains[i])  / period
                        avg_l = (avg_l * (period - 1) + losses[i]) / period
                        result[i + 1] = 100.0 if avg_l == 0 else 100 - 100 / (1 + avg_g / avg_l)
                    return result

                indicator_data = {}
                print(f"[Prefetch] RSI (self-computed, Wilder's): window={window}, timespan={timespan}, series={series_type}, multiplier={ind_multiplier}", flush=True)

                if timespan == 'day':
                    # Fetch daily bars with enough warmup for Wilder's to converge
                    # (window × 3 bars; double the calendar days to clear weekends/holidays)
                    warmup_cal = max(window * 3 * 2, 90)
                    rsi_start_str = (start_date - timedelta(days=warmup_cal)).strftime("%Y-%m-%d")
                    url_day = (f"https://api.polygon.io/v2/aggs/ticker/{underlying_sym}"
                               f"/range/{ind_multiplier}/day/{rsi_start_str}/{end_str}")
                    print(f"[Prefetch] RSI(day): fetching from {rsi_start_str} (warmup ≥{window * 3} bars)...", flush=True)
                    _resp = requests.get(url_day, params={'apiKey': api_key, 'limit': 50000,
                                                          'adjusted': 'true', 'order': 'asc'})
                    if _resp.status_code == 200:
                        _day_bars = _resp.json().get('results', [])
                        _valid = [(b.get('t'), b.get(field)) for b in _day_bars
                                  if b.get('t') is not None and b.get(field) is not None]
                        if _valid:
                            _ts_list, _cl_list = zip(*_valid)
                            _rsi_vals = _compute_rsi_series(list(_cl_list), window)
                            for _ts, _val in zip(_ts_list, _rsi_vals):
                                if _val is not None and int(_ts) >= start_ts:
                                    indicator_data[int(_ts)] = _val
                            print(f"[Prefetch] RSI(day): computed {len(indicator_data)} values "
                                  f"from {len(_cl_list)} bars ({len(_cl_list) - len(indicator_data)} warmup discarded)", flush=True)
                        else:
                            print(f"[Prefetch] RSI(day): no valid bars returned", flush=True)
                    else:
                        print(f"[Prefetch] RSI(day) error: {_resp.status_code} — {_resp.text[:200]}", flush=True)

                else:
                    # Intraday RSI — reuse shared 1-min raw bars when available
                    _raw_bars = indicators.get('_1min_raw', [])
                    if not _raw_bars:
                        warmup_days = max((window // 390 + 2) * 3, 10)
                        _intra_start_str = (start_date - timedelta(days=warmup_days)).strftime("%Y-%m-%d")
                        _url_1m = (f"https://api.polygon.io/v2/aggs/ticker/{underlying_sym}"
                                   f"/range/1/minute/{_intra_start_str}/{end_str}")
                        print(f"[Prefetch] RSI(intraday): fetching 1-min bars from {_intra_start_str}...", flush=True)
                        _raw_bars = []
                        _nu, _np = _url_1m, {'apiKey': api_key, 'limit': 50000, 'adjusted': 'true', 'order': 'asc'}
                        while _nu:
                            _r = requests.get(_nu, params=_np)
                            if _r.status_code != 200:
                                print(f"[Prefetch] RSI 1-min error: {_r.status_code}", flush=True)
                                break
                            _d = _r.json()
                            _batch = _d.get('results', [])
                            _raw_bars.extend(_batch)
                            _nu = _d.get('next_url')
                            _np = {'apiKey': api_key}
                            if not _batch:
                                break
                        print(f"[Prefetch] RSI(intraday): fetched {len(_raw_bars)} 1-min bars", flush=True)

                    if _raw_bars:
                        if ind_multiplier <= 1:
                            _valid = [(b.get('t'), b.get(field)) for b in _raw_bars
                                      if b.get('t') is not None and b.get(field) is not None]
                            if _valid:
                                _ts_list, _cl_list = zip(*_valid)
                                _rsi_vals = _compute_rsi_series(list(_cl_list), window)
                                for _ts, _val in zip(_ts_list, _rsi_vals):
                                    if _val is not None and int(_ts) >= start_ts:
                                        _dt = datetime.fromtimestamp(int(_ts) / 1000, tz=pytz.UTC).astimezone(eastern)
                                        _hm = _dt.hour * 60 + _dt.minute
                                        if 9 * 60 + 30 <= _hm <= 16 * 60:
                                            indicator_data[int(_ts)] = _val
                        else:
                            _df = pd.DataFrame(_raw_bars)
                            if not _df.empty and 'c' in _df.columns:
                                _df['_ts'] = pd.to_datetime(_df['t'], unit='ms', utc=True)
                                _df = _df.set_index('_ts').sort_index()
                                _agg = {k: v for k, v in
                                        {'o': 'first', 'h': 'max', 'l': 'min', 'c': 'last'}.items()
                                        if k in _df.columns}
                                _rs = _df.resample(f'{ind_multiplier}min').agg(_agg).dropna(subset=['c'])
                                _ts_list = [int(ts.timestamp() * 1000) for ts in _rs.index]
                                _cl_list = (_rs[field] if field in _rs.columns else _rs['c']).tolist()
                                _rsi_vals = _compute_rsi_series(_cl_list, window)
                                for _ts, _val in zip(_ts_list, _rsi_vals):
                                    if _val is not None and int(_ts) >= start_ts:
                                        _dt = datetime.fromtimestamp(int(_ts) / 1000, tz=pytz.UTC).astimezone(eastern)
                                        _hm = _dt.hour * 60 + _dt.minute
                                        if 9 * 60 + 30 <= _hm <= 16 * 60:
                                            indicator_data[int(_ts)] = _val
                        print(f"[Prefetch] RSI(intraday, tf={ind_multiplier}min, window={window}): "
                              f"computed {len(indicator_data)} market-hours values", flush=True)
                    else:
                        print(f"[Prefetch] RSI: no bar data available — skipping", flush=True)

                indicators['rsi'] = indicator_data
                print(f"[Prefetch] RSI complete: {len(indicator_data)} values", flush=True)
            
            elif metric == 'macd':
                short_window = params.get('short_window', 12)
                long_window = params.get('long_window', 26)
                signal_window = params.get('signal_window', 9)
                component = params.get('component', 'histogram')
                timespan = params.get('candle_type', 'day')
                raw_series_type = params.get('series_type', 'close')
                _macd_valid_series = {'close', 'open', 'high', 'low'}
                series_type = raw_series_type if raw_series_type in _macd_valid_series else 'close'
                if series_type != raw_series_type:
                    print(f"[Prefetch] MACD: series_type '{raw_series_type}' not supported — using 'close'", flush=True)
                
                url = f"https://api.polygon.io/v1/indicators/macd/{underlying_sym}"
                macd_base_params = {
                    'apiKey': api_key,
                    'timespan': timespan,
                    'short_window': short_window,
                    'long_window': long_window,
                    'signal_window': signal_window,
                    'series_type': series_type,
                    'timestamp.gte': start_ts,
                    'timestamp.lte': end_ts,
                    'limit': 5000,
                    'order': 'asc'
                }
                
                print(f"[Prefetch] Fetching MACD: short={short_window}, long={long_window}, series={series_type}...", flush=True)
                
                indicator_data = {}
                _next_url = url
                _next_params = macd_base_params
                _macd_page = 0
                while _next_url:
                    response = requests.get(_next_url, params=_next_params)
                    if response.status_code == 200:
                        data = response.json()
                        values = data.get('results', {}).get('values', [])
                        for v in values:
                            _ts = v.get('timestamp')
                            if _ts is None:
                                continue
                            # Filter out after-hours ghost values (same as RSI)
                            _dt = datetime.fromtimestamp(_ts / 1000, tz=pytz.UTC).astimezone(eastern)
                            _hm = _dt.hour * 60 + _dt.minute
                            if not (9 * 60 + 30 <= _hm <= 16 * 60):
                                continue
                            if component == 'histogram':
                                indicator_data[_ts] = v.get('histogram')
                            elif component == 'signal':
                                indicator_data[_ts] = v.get('signal')
                            else:
                                indicator_data[_ts] = v.get('value')
                            # Also cache all three components for self-comparator support
                            if 'macd_all' not in indicators:
                                indicators['macd_all'] = {}
                            indicators['macd_all'][_ts] = {
                                'histogram': v.get('histogram'),
                                'signal': v.get('signal'),
                                'macd_line': v.get('value')
                            }
                        _macd_page += 1
                        _next_cursor = data.get('next_url')
                        if _next_cursor and values:
                            _next_url = _next_cursor
                            _next_params = {'apiKey': api_key}
                        else:
                            _next_url = None
                        print(f"[Prefetch] MACD page {_macd_page}: +{len(values)} values (total {len(indicator_data)})", flush=True)
                    else:
                        print(f"[Prefetch] MACD error: {response.status_code} - {response.text[:100]}", flush=True)
                        _next_url = None
                indicators[metric] = indicator_data
                print(f"[Prefetch] MACD complete: {len(indicator_data)} market-hours values ({_macd_page} page(s))", flush=True)
                    
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


def _opt_get_tc_bars(bars_by_date: Dict, trade_date, bar_time: Optional[str], time_window):
    """Return a list of bar dicts for the trend-capture time window (lookahead-safe).

    time_window is an integer N (>= 1):
      1 = today's bars strictly before bar_time
      2 = prior trading day (all bars) + today before bar_time
      N = N-1 prior trading days + today before bar_time
    When bar_time is None (prerequisite call), today is excluded entirely.
    """
    try:
        trade_date_str = trade_date.strftime('%Y-%m-%d') if hasattr(trade_date, 'strftime') else str(trade_date)[:10]
        sorted_dates = sorted(bars_by_date.keys())

        _tw_map = {'day_of_entry': 1, 'prior_day': 2, 'week_of_entry': 5, 'month_of_entry': 22}
        tw = _tw_map.get(str(time_window), time_window)
        n = int(tw) if tw is not None else 1
        if n < 1:
            n = 1

        # Determine which dates to include
        prior_dates = [d for d in sorted_dates if d < trade_date_str]
        n_prior = n - 1  # number of prior days to include

        included_dates = prior_dates[-(n_prior):] if n_prior > 0 else []

        result = []
        for d in included_dates:
            day_bars = sorted(bars_by_date.get(d, []), key=lambda x: x.get('time', ''))
            result.extend(day_bars)

        # Add today's bars (before bar_time), unless prerequisite call
        if bar_time is not None:
            today_bars = sorted(bars_by_date.get(trade_date_str, []), key=lambda x: x.get('time', ''))
            result.extend([b for b in today_bars if b.get('time', '') < bar_time])

        return result if result else None
    except Exception:
        return None


def _opt_compute_tc_slope(tc_params: Dict, bars_by_date: Dict, trade_date, bar_time: Optional[str]):
    """Compute OLS slope (and R) for a trend-capture config side.

    Returns (slope, r_value, checks_pass) or (None, None, False) on failure.
    `checks_pass` means: direction OK + optional slope-value check + optional R check.
    """
    try:
        interval    = tc_params.get('interval', '1hr')
        time_window = tc_params.get('time_window', 1)
        price_type  = tc_params.get('price_type', 'lowest_low')
        interval_mins = {'15min': 15, '30min': 30, '1hr': 60, '2hr': 120}.get(interval, 60)

        bars = _opt_get_tc_bars(bars_by_date, trade_date, bar_time, time_window)
        if not bars or len(bars) < 2:
            return None, None, False

        price_col = 'high' if price_type == 'highest_high' else 'low'

        def _time_to_mins(t):
            try:
                h, m = t.split(':')
                return int(h) * 60 + int(m)
            except Exception:
                return 0

        bucket_vals: Dict = {}
        for bar in bars:
            t_mins = _time_to_mins(bar.get('time', '00:00'))
            bucket_key = (bar.get('date', ''), t_mins // interval_mins)
            val = bar.get(price_col)
            if val is None:
                continue
            if bucket_key not in bucket_vals:
                bucket_vals[bucket_key] = []
            bucket_vals[bucket_key].append(val)

        if len(bucket_vals) < 2:
            return None, None, False

        sorted_keys = sorted(bucket_vals.keys())
        if price_type == 'highest_high':
            agg_vals = [max(bucket_vals[k]) for k in sorted_keys]
        else:
            agg_vals = [min(bucket_vals[k]) for k in sorted_keys]

        if len(agg_vals) < 2:
            return None, None, False

        x = np.arange(len(agg_vals), dtype=float)
        y = np.array(agg_vals, dtype=float)
        reg = _opt_linregress(x, y)
        slope   = float(reg.slope)
        r_value = float(reg.rvalue)

        def _chk(a, op, b):
            return {'>': a > b, '<': a < b, '>=': a >= b, '<=': a <= b,
                    '==': abs(a - b) < 1e-10}.get(op, False)

        if tc_params.get('r_enabled'):
            if not _chk(r_value, tc_params.get('r_op', '>'), float(tc_params.get('r_val', 0) or 0)):
                return slope, r_value, False

        return slope, r_value, True
    except Exception:
        return None, None, False


def _opt_compute_tc_line_value(tc_params: Dict, bars_by_date: Dict, trade_date, bar_time: Optional[str]):
    """Compute OLS regression on TC bars and return the predicted value at the last bucket.

    Returns (slope, intercept, n_buckets, r_value, ok).
    `ok` is False when data is insufficient or optional slope/R filters fail.
    """
    try:
        interval      = tc_params.get('interval', '1hr')
        time_window   = tc_params.get('time_window', 1)
        price_type    = tc_params.get('price_type', 'lowest_low')
        interval_mins = {'15min': 15, '30min': 30, '1hr': 60, '2hr': 120}.get(interval, 60)

        bars = _opt_get_tc_bars(bars_by_date, trade_date, bar_time, time_window)
        if not bars or len(bars) < 2:
            return None, None, None, None, False

        price_col = 'high' if price_type == 'highest_high' else 'low'

        def _time_to_mins(t):
            try:
                h, m = t.split(':')
                return int(h) * 60 + int(m)
            except Exception:
                return 0

        bucket_vals: Dict = {}
        for b in bars:
            t_mins     = _time_to_mins(b.get('time', '00:00'))
            bucket_key = (b.get('date', ''), t_mins // interval_mins)
            val        = b.get(price_col)
            if val is None:
                continue
            if bucket_key not in bucket_vals:
                bucket_vals[bucket_key] = []
            bucket_vals[bucket_key].append(val)

        if len(bucket_vals) < 2:
            return None, None, None, None, False

        sorted_keys = sorted(bucket_vals.keys())
        if price_type == 'highest_high':
            agg_vals = [max(bucket_vals[k]) for k in sorted_keys]
        else:
            agg_vals = [min(bucket_vals[k]) for k in sorted_keys]

        if len(agg_vals) < 2:
            return None, None, None, None, False

        x   = np.arange(len(agg_vals), dtype=float)
        y   = np.array(agg_vals, dtype=float)
        reg = _opt_linregress(x, y)
        slope     = float(reg.slope)
        intercept = float(reg.intercept)
        r_value   = float(reg.rvalue)
        n_buckets = len(agg_vals)

        def _chk(a, op, b):
            return {'>': a > b, '<': a < b, '>=': a >= b, '<=': a <= b,
                    '==': abs(a - b) < 1e-10}.get(op, False)

        # Optional slope direction filter
        if tc_params.get('slope_filter_enabled'):
            slope_op  = tc_params.get('slope_op', '>')
            slope_val = float(tc_params.get('slope_val', 0) or 0)
            if not _chk(slope, slope_op, slope_val):
                return slope, intercept, n_buckets, r_value, False

        # Optional R² linearity filter
        if tc_params.get('r_enabled'):
            if not _chk(r_value, tc_params.get('r_op', '>'), float(tc_params.get('r_val', 0) or 0)):
                return slope, intercept, n_buckets, r_value, False

        return slope, intercept, n_buckets, r_value, True
    except Exception:
        return None, None, None, None, False


def evaluate_price_conditions_with_cache(config: Dict, bar: Dict, indicators_cache: Dict, 
                                          trade_date: datetime = None,
                                          bars_by_date: Dict = None,
                                          client: RESTClient = None) -> Tuple[bool, str]:
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
        return True, "", []
    
    bar_timestamp = bar['timestamp']
    bar_price = bar['open']
    _cond_details = []   # collects per-condition evaluated values for decision log

    for idx, condition in enumerate(price_conditions):
        try:
            # Check condition-level time window restriction FIRST
            time_window = condition.get('time_window')
            if time_window:
                tw_start = (time_window.get('start') or '').strip()
                tw_end   = (time_window.get('end') or '').strip()
                bar_time_hhmm = bar.get('time', '')[:5]
                if tw_start and tw_end and bar_time_hhmm:
                    if not (tw_start <= bar_time_hhmm <= tw_end):
                        return False, f"Condition {idx+1}: bar time {bar_time_hhmm} outside required window {tw_start}–{tw_end}", _cond_details

            # ── Candle Pattern ───────────────────────────────────────────────
            if condition.get('left_type') == 'candle_pattern' or condition.get('metric') == 'candle_pattern':
                try:
                    bar_ts = bar.get('timestamp')
                    cp_met = _eval_candle_pattern_options(condition, bars_by_date or {}, trade_date, bar_ts)
                    _cond_details.append({'metric': 'candle_pattern', 'met': cp_met,
                                          'left_label': 'Candle Pattern', 'left_value': 0,
                                          'operator': '==', 'right_label': 'match', 'right_value': 1,
                                          'effective_right': 1, 'threshold': 1,
                                          'threshold_unit': 'bool', 'series_type': 'candle_pattern'})
                    if not cp_met:
                        return False, f"Candle pattern condition {idx+1} not met", _cond_details
                    continue
                except Exception as _cpe:
                    print(f"  [CandlePattern opt] Error: {_cpe}")
                    return False, f"Candle pattern error: {str(_cpe)}", _cond_details

            # ── Current Candle (sub-minute custom builder) ───────────────────
            if condition.get('metric') == 'current_candle':
                if client is None:
                    return False, f"Current-candle condition {idx+1} requires market client", _cond_details
                _cc_met, _cc_reason, _cc_detail = _eval_current_candle_condition(
                    condition, client, config.get('symbol'), trade_date, bar_timestamp,
                    ten_second=bool(config.get('ten_second_data'))
                )
                if _cc_detail:
                    _cond_details.append(_cc_detail)
                if not _cc_met:
                    return False, f"Current-candle condition {idx+1}: {_cc_reason}", _cond_details
                continue

            metric = condition.get('metric', 'price')
            operator = condition.get('operator', '>')
            comparator = condition.get('comparator', 'value')
            left_params = condition.get('left', {})
            right_params = condition.get('right', {})

            # ── Trend Capture ────────────────────────────────────────────────
            if metric == 'trend_capture':
                _bar_time = bar.get('time', '')[:5] if bar else None
                _tc_left  = condition.get('tc_left', {})
                _l_slope, _l_r, _l_ok = _opt_compute_tc_slope(_tc_left, bars_by_date or {}, trade_date, _bar_time)
                if not _l_ok:
                    _cond_details.append({'metric': 'trend_capture', 'met': False,
                        'left_label': 'TC slope', 'left_value': _l_slope or 0,
                        'operator': operator, 'right_label': 'threshold', 'right_value': 0,
                        'effective_right': 0, 'threshold': 0, 'threshold_unit': 'percent', 'series_type': 'tc'})
                    return False, f"Trend capture condition {idx+1} not met (direction/data)", _cond_details
                _tc_met = True
                _r_slope_val = 0.0
                if comparator == 'compare_trend_capture':
                    _tc_right = condition.get('tc_right', {})
                    _r_slope_val, _r_r, _r_ok = _opt_compute_tc_slope(_tc_right, bars_by_date or {}, trade_date, _bar_time)
                    if not _r_ok:
                        _cond_details.append({'metric': 'trend_capture', 'met': False,
                            'left_label': 'TC slope', 'left_value': _l_slope,
                            'operator': operator, 'right_label': 'TC slope (right)', 'right_value': 0,
                            'effective_right': 0, 'threshold': 0, 'threshold_unit': 'percent', 'series_type': 'tc'})
                        return False, f"Trend capture condition {idx+1} right side not met", _cond_details
                    def _chk_op(a, op, b):
                        return {'>': a > b, '<': a < b, '>=': a >= b, '<=': a <= b,
                                '==': abs(a - b) < 1e-10}.get(op, False)
                    _tc_met = _chk_op(_l_slope, operator, _r_slope_val)
                _cond_details.append({'metric': 'trend_capture', 'met': _tc_met,
                    'left_label': 'TC slope', 'left_value': round(_l_slope, 6),
                    'operator': operator,
                    'right_label': 'TC slope (right)' if comparator == 'compare_trend_capture' else 'pass',
                    'right_value': round(_r_slope_val, 6), 'effective_right': round(_r_slope_val, 6),
                    'threshold': 0, 'threshold_unit': 'percent', 'series_type': 'tc'})
                if not _tc_met:
                    return False, f"TC: {_l_slope:.6f} {operator} {_r_slope_val:.6f} — failed", _cond_details
                continue
            # ────────────────────────────────────────────────────────────────

            # Check if using day candles
            left_candle_type = left_params.get('candle_type', 'minute')
            left_day_offset = int(left_params.get('day', 0))
            left_series_type = left_params.get('series_type', 'close')
            
            if left_candle_type in ['day', 'week', 'month', 'quarter', 'year'] and left_day_offset == 0 and left_series_type in ['close', 'high', 'low']:
                return False, f"Invalid: cannot use day candle '{left_series_type}' on day 0 — current day has not closed", _cond_details

            # Get left side value
            if metric == 'price':
                if left_candle_type in ['day', 'week', 'month', 'quarter', 'year']:
                    # Use day bars from cache
                    left_value = get_day_bar_value(indicators_cache, trade_date, left_day_offset, left_series_type)
                    if left_value is None:
                        return False, f"Missing day bar data for day offset {left_day_offset}", _cond_details
                else:
                    # Cross-day minute bar lookup when day_offset != 0
                    if left_day_offset != 0 and bars_by_date is not None and trade_date is not None:
                        _current_bar_time = bar.get('time', '')[:5] or None
                        left_value = get_minute_bar_value_cross_day(
                            bars_by_date, trade_date, left_day_offset,
                            None, left_series_type, _current_bar_time
                        )
                        if left_value is None:
                            return False, f"Missing minute bar data for day offset {left_day_offset}", _cond_details
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
                    elif left_candle_type in ('day', 'week', 'month', 'quarter', 'year') and trade_date:
                        # Daily+ timeframe: return the last value at/before end of the target date
                        left_value = get_indicator_value_for_date(indicators_cache, metric, trade_date, left_day_offset)
                    else:
                        # Minute timeframe: look up by bar timestamp so each bar gets its own RSI/MACD value
                        left_value = find_closest_indicator_value(indicator_data, bar_timestamp)
                else:
                    left_value = None
            
            if left_value is None:
                return False, f"Missing {metric} data", _cond_details
            
            # Get right side value
            if comparator == 'value':
                right_value = condition.get('compare_value', 0)
                _raw_right = right_value
                threshold = {}
            elif comparator == 'zero_line':
                right_value = 0.0
                _raw_right = 0.0
                threshold = {}
            elif comparator in ('compare_macd_line', 'compare_signal'):
                # MACD self-comparator: same MACD params as left, but the other component
                _mc_right_comp = 'macd_line' if comparator == 'compare_macd_line' else 'signal'
                _mc_all = indicators_cache.get('macd_all', {})
                if _mc_all:
                    # Find closest timestamp in macd_all cache and extract right component
                    _mc_best_ts = None
                    for _ts_k in _mc_all:
                        if _ts_k <= bar_timestamp:
                            if _mc_best_ts is None or _ts_k > _mc_best_ts:
                                _mc_best_ts = _ts_k
                    right_value = _mc_all[_mc_best_ts].get(_mc_right_comp) if _mc_best_ts is not None else None
                else:
                    right_value = None
                if right_value is None:
                    return False, f"Missing MACD {_mc_right_comp} data for condition {idx+1}", _cond_details
                _raw_right = right_value
                threshold = {}
            elif comparator == 'compare_trend_capture':
                # Price vs TC regression line value (no lookahead — uses bars strictly before bar_time)
                _bar_time_tc = bar.get('time', '')[:5] if bar else None
                _tc_right_cfg = condition.get('tc_right', {})
                _tc_s, _tc_i, _tc_n, _tc_r, _tc_ok = _opt_compute_tc_line_value(
                    _tc_right_cfg, bars_by_date or {}, trade_date, _bar_time_tc)
                if not _tc_ok or _tc_s is None:
                    _cond_details.append({'metric': metric, 'met': False,
                        'left_label': 'price', 'left_value': left_value or 0,
                        'operator': operator, 'right_label': 'TC line',
                        'right_value': 0, 'effective_right': 0,
                        'threshold': 0, 'threshold_unit': 'percent', 'series_type': 'tc'})
                    return False, f"Trend capture comparison unavailable for condition {idx+1} (slope filter or insufficient data)", _cond_details
                # TC line value = OLS predicted price at the last observed bucket
                _tc_line_val = _tc_i + _tc_s * (_tc_n - 1)
                right_value  = _tc_line_val
                _raw_right   = right_value
                threshold    = condition.get('threshold', {})
                if threshold:
                    threshold_value = threshold.get('value', 0)
                    threshold_unit  = threshold.get('unit', 'percent')
                    if operator in ('<', '<='):
                        right_value = right_value * (1 - threshold_value / 100) if threshold_unit == 'percent' \
                                      else right_value - threshold_value
                    else:
                        right_value = right_value * (1 + threshold_value / 100) if threshold_unit == 'percent' \
                                      else right_value + threshold_value
                # Fall through to the shared comparison block below
            else:
                right_metric = comparator.replace('compare_', '')
                right_candle_type = right_params.get('candle_type', 'minute')
                right_day_offset = int(right_params.get('day', 0))
                right_series_type = right_params.get('series_type', 'close')
                
                if right_candle_type in ['day', 'week', 'month', 'quarter', 'year'] and right_day_offset == 0 and right_series_type in ['close', 'high', 'low']:
                    return False, f"Invalid: cannot use day candle '{right_series_type}' on right side day 0 — current day has not closed", _cond_details

                if right_metric == 'price':
                    if right_candle_type in ['day', 'week', 'month', 'quarter', 'year']:
                        right_value = get_day_bar_value(indicators_cache, trade_date, right_day_offset, right_series_type)
                        if right_value is None:
                            return False, f"Missing day bar data for right side day offset {right_day_offset}", _cond_details
                    else:
                        # Cross-day minute bar lookup when day_offset != 0
                        if right_day_offset != 0 and bars_by_date is not None and trade_date is not None:
                            _current_bar_time = bar.get('time', '')[:5] or None
                            restrict_bars = condition.get('restrict_bars')
                            if restrict_bars:
                                # N-bar lookback within the prior day's bars
                                _d_str = trade_date.strftime('%Y-%m-%d') if hasattr(trade_date, 'strftime') else str(trade_date)[:10]
                                _sorted_dates = sorted(bars_by_date.keys())
                                _cur_d_idx = next((i for i, d in enumerate(_sorted_dates) if d == _d_str), None)
                                if _cur_d_idx is None:
                                    _prior = [d for d in _sorted_dates if d < _d_str]
                                    _cur_d_idx = _sorted_dates.index(_prior[-1]) if _prior else None
                                if _cur_d_idx is not None:
                                    _tgt_d_idx = _cur_d_idx + right_day_offset
                                    if 0 <= _tgt_d_idx < len(_sorted_dates):
                                        _prior_bars = sorted(bars_by_date.get(_sorted_dates[_tgt_d_idx], []), key=lambda x: x.get('time', ''))
                                        _anc_idx = next((i for i, b2 in enumerate(_prior_bars) if b2.get('time', '')[:5] >= _current_bar_time), None)
                                        if _anc_idx is not None and _anc_idx >= restrict_bars:
                                            _ref_bar = _prior_bars[_anc_idx - restrict_bars]
                                            if right_series_type == 'vwap':
                                                right_value = _ref_bar.get('vw', _ref_bar.get('close', bar_price))
                                            elif right_series_type == 'close':
                                                right_value = _ref_bar.get('close', bar_price)
                                            elif right_series_type == 'high':
                                                right_value = _ref_bar.get('high', bar_price)
                                            elif right_series_type == 'low':
                                                right_value = _ref_bar.get('low', bar_price)
                                            else:
                                                right_value = _ref_bar.get('close', bar_price)
                                        else:
                                            return False, f"Not enough prior-day bars for {restrict_bars}-bar lookback", _cond_details
                                    else:
                                        return False, f"Missing day data for right side day offset {right_day_offset}", _cond_details
                                else:
                                    return False, f"Current date not found in historical bars", _cond_details
                            else:
                                right_value = get_minute_bar_value_cross_day(
                                    bars_by_date, trade_date, right_day_offset,
                                    None, right_series_type, _current_bar_time
                                )
                                if right_value is None:
                                    return False, f"Missing minute bar data for right side day offset {right_day_offset}", _cond_details
                        else:
                            # Same-day minute bar: support N-bar lookback via restrict_bars
                            restrict_bars = condition.get('restrict_bars')
                            if restrict_bars and bars_by_date is not None and trade_date is not None:
                                _date_str = trade_date.strftime('%Y-%m-%d') if hasattr(trade_date, 'strftime') else str(trade_date)[:10]
                                _today_bars = sorted(bars_by_date.get(_date_str, []), key=lambda x: x.get('time', ''))
                                _cur_time = bar.get('time', '')[:5]
                                _cur_idx = next((i for i, b in enumerate(_today_bars) if b.get('time', '')[:5] >= _cur_time), None)
                                if _cur_idx is not None and _cur_idx >= restrict_bars:
                                    _ref_bar = _today_bars[_cur_idx - restrict_bars]
                                    if right_series_type == 'vwap':
                                        right_value = _ref_bar.get('vw', _ref_bar.get('close', bar_price))
                                    elif right_series_type == 'close':
                                        right_value = _ref_bar.get('close', bar_price)
                                    elif right_series_type == 'high':
                                        right_value = _ref_bar.get('high', bar_price)
                                    elif right_series_type == 'low':
                                        right_value = _ref_bar.get('low', bar_price)
                                    else:
                                        right_value = _ref_bar.get('close', bar_price)
                                else:
                                    return False, f"Not enough bars for {restrict_bars}-bar lookback", _cond_details
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
                        elif right_candle_type in ('day', 'week', 'month', 'quarter', 'year') and trade_date:
                            # Daily+ timeframe: return the last value at/before end of the target date
                            right_value = get_indicator_value_for_date(indicators_cache, right_metric, trade_date, right_day_offset)
                        else:
                            # Minute timeframe: look up by bar timestamp so each bar gets its own RSI/MACD value
                            right_value = find_closest_indicator_value(indicator_data, bar_timestamp)
                    else:
                        right_value = None
                
                if right_value is None:
                    return False, f"Missing {right_metric} comparison data", _cond_details
                
                # Apply threshold if present — direction always makes the condition stricter:
                # for < / <=, lower the right side; for > / >=, raise it.
                threshold = condition.get('threshold', {})
                _raw_right = right_value   # before threshold adjustment
                if threshold:
                    threshold_value = threshold.get('value', 0)
                    threshold_unit = threshold.get('unit', 'percent')
                    if operator in ('<', '<='):
                        if threshold_unit == 'percent':
                            right_value = right_value * (1 - threshold_value / 100)
                        else:
                            right_value = right_value - threshold_value
                    else:
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
            elif operator in ('cross_up', 'cross_down', 'cross_either'):
                # Need the previous bar's values.
                # For sma/ema/vwap metrics: step back by timeframe_minutes (must match _sma_ema_key default=5).
                # For price metric: step back by multiplier minutes (price data is stored at bar resolution).
                if metric in ('sma', 'ema', 'vwap'):
                    _ltf_mins = int(left_params.get('timeframe_minutes', 5))
                else:
                    # price: use the bar's own multiplier so we look exactly one bar back
                    _ltf_mins = int(left_params.get('multiplier', 1))
                _prev_left_ts = bar_timestamp - _ltf_mins * 60000
                _within_bar_cross = False
                _prev_bar_open = None
                _prev_bar_comparator = None

                # Previous left value
                if metric in ('sma', 'ema', 'vwap'):
                    _lw = int(left_params.get('window', 14))
                    _lkey = f'{metric}_w{_lw}_t{_ltf_mins}'
                    prev_left = find_closest_indicator_value(indicators_cache.get(_lkey, {}), _prev_left_ts)
                    if prev_left is None:
                        print(f"  [cross] WARN: prev_left=None for key={_lkey} prev_ts={_prev_left_ts} "
                              f"cache_keys={list(indicators_cache.keys())[:8]}", flush=True)
                elif metric == 'price':
                    # Within-bar breach "Current Price" cross: compare THIS bar's
                    # OPEN against THIS bar's comparator (prev_right is overridden to
                    # the current comparator below) while the current bar keeps using
                    # its VWAP (the current price). This fires on the bar that actually
                    # breaches the line — the first instance — instead of the bar after.
                    # Falls back to the previous-bar VWAP cache when the open series is
                    # unavailable.
                    if left_params.get('current_price') and indicators_cache.get('price_open'):
                        _within_bar_cross = True
                        _price_cache = indicators_cache.get('price_open', {})
                        prev_left = find_closest_indicator_value(_price_cache, bar_timestamp)
                        # Also grab the PREVIOUS bar's open for the prev-bar gate.
                        _prev_bar_open = find_closest_indicator_value(_price_cache, _prev_left_ts)
                    else:
                        _price_cache = indicators_cache.get('price', {})
                        prev_left = find_closest_indicator_value(_price_cache, _prev_left_ts)
                    if prev_left is None and not indicators_cache.get('_price_cache_diag_done'):
                        _pkeys = sorted(_price_cache.keys())
                        _pkey_sample = _pkeys[:3] + _pkeys[-3:] if len(_pkeys) >= 6 else _pkeys
                        print(f"  [cross] PRICE-CACHE-DIAG: size={len(_price_cache)} "
                              f"bar_ts={bar_timestamp} prev_ts={_prev_left_ts} "
                              f"first3={_pkeys[:3]} last3={_pkeys[-3:]}", flush=True)
                        indicators_cache['_price_cache_diag_done'] = True
                elif metric in ('macd', 'rsi'):
                    # For MACD/RSI cross: find the 2nd most recent cached value
                    _left_ind_cache = indicators_cache.get(metric, {})
                    _sorted_l_ts = sorted([t for t in _left_ind_cache if t <= bar_timestamp], reverse=True)
                    prev_left = _left_ind_cache.get(_sorted_l_ts[1]) if len(_sorted_l_ts) >= 2 else None
                else:
                    prev_left = None

                # Previous right value (uses right side's own timeframe)
                _rtf_mins = int(right_params.get('timeframe_minutes', 5))
                _prev_right_ts = bar_timestamp - _rtf_mins * 60000
                if comparator in ('value', 'zero_line'):
                    prev_right = right_value  # constant — never changes (0 for zero_line)
                elif comparator in ('compare_macd_line', 'compare_signal'):
                    # MACD self-comparator: get the 2nd most recent value of the other component
                    _mc_pr_comp = 'macd_line' if comparator == 'compare_macd_line' else 'signal'
                    _mc_all_pr = indicators_cache.get('macd_all', {})
                    _sorted_mac_ts = sorted([t for t in _mc_all_pr if t <= bar_timestamp], reverse=True)
                    prev_right = _mc_all_pr[_sorted_mac_ts[1]].get(_mc_pr_comp) if len(_sorted_mac_ts) >= 2 else None
                elif comparator == 'compare_trend_capture':
                    # Compute TC line value at the previous bar's time
                    _date_str_cx = trade_date.strftime('%Y-%m-%d') if hasattr(trade_date, 'strftime') else str(trade_date)[:10]
                    _day_bars_cx = sorted((bars_by_date or {}).get(_date_str_cx, []), key=lambda b: b.get('time', ''))
                    _cur_t_cx    = bar.get('time', '')[:5]
                    _cur_idx_cx  = next((i for i, b in enumerate(_day_bars_cx) if b.get('time', '')[:5] >= _cur_t_cx), None)
                    if _cur_idx_cx is not None and _cur_idx_cx > 0:
                        _prev_bt    = _day_bars_cx[_cur_idx_cx - 1].get('time', '')[:5]
                        _ps, _pi, _pn, _, _pok = _opt_compute_tc_line_value(
                            condition.get('tc_right', {}), bars_by_date or {}, trade_date, _prev_bt)
                        prev_right = (_pi + _ps * (_pn - 1)) if _pok and _pn else None
                    else:
                        prev_right = None
                elif right_metric in ('sma', 'ema', 'vwap'):
                    _rw = int(right_params.get('window', 14))
                    _rkey = f'{right_metric}_w{_rw}_t{_rtf_mins}'
                    prev_right = find_closest_indicator_value(indicators_cache.get(_rkey, {}), _prev_right_ts)
                    if prev_right is None and not _within_bar_cross:
                        print(f"  [cross] WARN: prev_right=None for key={_rkey} prev_ts={_prev_right_ts} "
                              f"cache_keys={list(indicators_cache.keys())[:8]}", flush=True)
                elif right_metric == 'price':
                    prev_right = find_closest_indicator_value(indicators_cache.get('price', {}), _prev_right_ts)
                else:
                    prev_right = None

                # Within-bar breach: the "from below/above" reference is THIS bar's
                # open compared to THIS bar's comparator, so use the current comparator.
                # Capture the previous bar's comparator first (for the prev-bar gate).
                if _within_bar_cross:
                    _prev_bar_comparator = prev_right
                    prev_right = right_value

                if prev_left is not None and prev_right is not None:
                    if _within_bar_cross:
                        # Within-bar "Current Price" cross: the direction is gated by
                        # the PREVIOUS bar's open being on the right side of its
                        # comparator (below for cross_up, above for cross_down) plus
                        # the current price crossing the line. The current bar's open
                        # need NOT be on either side. If the previous bar's data is
                        # unavailable we cannot confirm the gate, so it does not fire.
                        _pb_below = (_prev_bar_open is not None and _prev_bar_comparator is not None
                                     and _prev_bar_open < _prev_bar_comparator)
                        _pb_above = (_prev_bar_open is not None and _prev_bar_comparator is not None
                                     and _prev_bar_open > _prev_bar_comparator)
                        _cross_up   = _pb_below and left_value >= right_value
                        _cross_down = _pb_above and left_value <= right_value
                    else:
                        _cross_up   = prev_left < prev_right and left_value >= right_value
                        _cross_down = prev_left > prev_right and left_value <= right_value
                    if operator == 'cross_up':
                        met = _cross_up
                    elif operator == 'cross_down':
                        met = _cross_down
                    else:
                        met = _cross_up or _cross_down
                    if met:
                        print(f"  [cross] FIRED {operator}: prev_L={prev_left:.4f} prev_R={prev_right:.4f} "
                              f"cur_L={left_value:.4f} cur_R={right_value:.4f}", flush=True)
                    else:
                        print(f"  [cross] NO-FIRE {operator}: prev_L={prev_left:.4f} prev_R={prev_right:.4f} "
                              f"cur_L={left_value:.4f} cur_R={right_value:.4f} "
                              f"(need prev_L<prev_R & cur_L>=cur_R for cross_up)", flush=True)
                else:
                    print(f"  [cross] SKIP {operator}: prev_left={prev_left} prev_right={prev_right} "
                          f"cur_L={left_value:.4f} cur_R={right_value:.4f} "
                          f"lookback_L={_ltf_mins}min lookback_R={_rtf_mins}min", flush=True)

            # Build left/right labels for the decision log
            _left_label = left_params.get('series_type', metric).upper() if metric == 'price' else metric.upper()
            _right_metric = comparator.replace('compare_', '') if comparator != 'value' else 'value'
            _right_period = right_params.get('window', right_params.get('period', '')) if _right_metric in ('sma', 'ema', 'vwap') else ''
            _right_label = (f"{_right_metric.upper()}({_right_period})" if _right_period else _right_metric.upper()) if _right_metric != 'value' else 'value'

            _cond_details.append({
                'metric': metric,
                'series_type': left_params.get('series_type', 'close'),
                'left_label': _left_label,
                'left_value': round(left_value, 4),
                'operator': operator,
                'right_metric': _right_metric,
                'right_label': _right_label,
                'right_value': round(_raw_right, 4),
                'effective_right': round(right_value, 4),
                'threshold': threshold.get('value', 0) if threshold else 0,
                'threshold_unit': threshold.get('unit', 'percent') if threshold else 'percent',
                'met': met,
            })

            if not met:
                _left_lbl = left_params.get('series_type', metric).upper() if metric == 'price' else metric.upper()
                _r_metric = comparator.replace('compare_', '') if comparator != 'value' else 'value'
                _r_per    = right_params.get('window', right_params.get('period', '')) if _r_metric in ('sma', 'ema', 'vwap') else ''
                _right_lbl = (f"{_r_metric.upper()}({_r_per})" if _r_per else _r_metric.upper()) if _r_metric != 'value' else 'value'
                _msg = f"{_left_lbl} {left_value:.2f} {operator} {_right_lbl} {_raw_right:.2f}"
                if threshold:
                    _sign = '-' if operator in ('<', '<=') else '+'
                    _u    = '%' if threshold.get('unit') == 'percent' else 'pts'
                    _msg += f" {_sign}{threshold.get('value', 0)}{_u} → {right_value:.2f}"
                return False, _msg, _cond_details
        
        except Exception as e:
            return False, f"Error: {str(e)}", _cond_details
    
    return True, "All conditions met", _cond_details


def get_minute_bar_value_cross_day(bars_by_date: Dict, trade_date, day_offset: int,
                                    bar_time: Optional[str], series_type: str,
                                    current_bar_time: Optional[str] = None) -> Optional[float]:
    """
    Get a 1-min bar value from a prior (or same) trading day.

    Args:
        bars_by_date: Dict of date_str -> [bar_dicts] for the underlying symbol.
        trade_date: Current trading date (datetime or date).
        day_offset: Trading-day offset relative to trade_date (0 = today, -1 = yesterday, etc.).
        bar_time: Optional HH:MM string specifying which bar to fetch on the target day.
                  If None, falls back to current_bar_time (i.e. "same time on that day").
        series_type: 'open', 'high', 'low', 'close', 'vwap'.
        current_bar_time: HH:MM of the bar currently being evaluated (used when bar_time is None).

    Returns:
        The resolved price value, or None if not found.
    """
    if not bars_by_date:
        return None

    date_str = trade_date.strftime("%Y-%m-%d") if hasattr(trade_date, 'strftime') else str(trade_date)
    sorted_dates = sorted(bars_by_date.keys())

    if date_str not in sorted_dates:
        # Fallback: find closest prior date
        prior = [d for d in sorted_dates if d < date_str]
        if not prior:
            return None
        date_str = prior[-1]
        # Recalculate from this found date
        current_idx = sorted_dates.index(date_str)
        target_idx = current_idx + day_offset
    else:
        current_idx = sorted_dates.index(date_str)
        target_idx = current_idx + day_offset  # day_offset is 0 or negative

    if target_idx < 0 or target_idx >= len(sorted_dates):
        return None

    target_date_str = sorted_dates[target_idx]
    target_bars = bars_by_date.get(target_date_str, [])
    if not target_bars:
        return None

    ref_time = bar_time or current_bar_time
    if not ref_time:
        return None

    try:
        ref_h, ref_m = int(ref_time[:2]), int(ref_time[3:5])
        ref_minutes = ref_h * 60 + ref_m
    except (ValueError, IndexError):
        return None

    best_bar = None
    best_diff = float('inf')
    for b in target_bars:
        btime = b.get('time', '')[:5]
        if not btime or ':' not in btime:
            continue
        try:
            bh, bm = int(btime[:2]), int(btime[3:5])
            bminutes = bh * 60 + bm
        except ValueError:
            continue
        diff = abs(bminutes - ref_minutes)
        if diff < best_diff:
            best_diff = diff
            best_bar = b

    if best_bar is None or best_diff > 2:
        return None

    series_map = {'open': 'open', 'high': 'high', 'low': 'low', 'close': 'close', 'vwap': 'vw'}
    field = series_map.get(series_type, 'close')
    return best_bar.get(field)


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
            _poly_valid_series = {'close', 'open', 'high', 'low'}
            _safe_series = series_type if series_type in _poly_valid_series else 'close'
            query_params = {
                'apiKey': api_key,
                'timespan': timespan,
                'window': window,
                'series_type': _safe_series,
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
            _poly_valid_series = {'close', 'open', 'high', 'low'}
            _safe_series = series_type if series_type in _poly_valid_series else 'close'
            
            url = f"https://api.polygon.io/v1/indicators/macd/{symbol}"
            query_params = {
                'apiKey': api_key,
                'timespan': timespan,
                'short_window': short_window,
                'long_window': long_window,
                'signal_window': signal_window,
                'series_type': _safe_series,
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
        
        # Phase 1: Fetch OHLCV for ALL strikes in parallel (unlimited Polygon plan)
        print(f"    ⚡ Fetching {len(strikes)} strikes in parallel...")

        def _fetch_strike(strike):
            sym = self._format_option_symbol(strike)
            try:
                aggs = list(self.client.list_aggs(
                    sym, 1, "minute", date_str, date_str,
                    adjusted="true", limit=100
                ))
                return strike, sym, aggs, None
            except Exception as e:
                return strike, sym, [], e

        with ThreadPoolExecutor(max_workers=len(strikes)) as _pool:
            _fetched = list(_pool.map(_fetch_strike, strikes))

        _strike_data = {s: (sym, aggs, err) for s, sym, aggs, err in _fetched}

        # Phase 2: Evaluate in the original directional order
        target_ts = int(timestamp.timestamp() * 1000)
        strikes_checked = 0
        for strike in strikes:
            strikes_checked += 1
            sym, aggs, err = _strike_data[strike]

            if strikes_checked <= 5:
                print(f"    → Checking strike ${strike}: {sym}")

            if err:
                if strikes_checked <= 5:
                    print(f"      ✗ Error: {str(err)[:50]}")
                continue

            if not aggs:
                if strikes_checked <= 5:
                    print(f"      ⚠ No data from API for {sym}")
                continue

            # Find closest price to timestamp
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

                if method == "closest" and delta_diff < 0.05:
                    print(f"    ⚡ Found close match (Δ diff={delta_diff:.3f}), stopping search")
                    break
                elif delta_diff < tolerance:
                    break

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
        lower = (target // increment) * increment
        upper = lower + increment

        # When a direction is set, only consider strikes on the correct side.
        # "below" → the strike must be at or below the target (floor).
        # "above" → the strike must be at or above the target (ceil).
        # This prevents, e.g., direction="below" from returning a strike
        # that is numerically closer but sits above the underlying price.
        if direction == "below":
            # "at or below": floor already yields the target itself when the
            # target sits exactly on a strike.
            return lower
        if direction == "above":
            # "at or above": if the target already sits exactly on a strike,
            # keep it instead of bumping to the next increment. Without this,
            # a leg-relative spread whose amount is a multiple of the strike
            # increment (e.g. Long = Short + $5 on SPX) would be pushed one
            # extra increment away, turning a $5 spread into $10.
            if abs(target - lower) < 1e-9:
                return lower
            return upper

        # No directional constraint — pick nearest; tiebreak to lower.
        diff_lower = abs(target - lower)
        diff_upper = abs(target - upper)
        if diff_lower <= diff_upper:
            return lower
        return upper


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
                wait = attempt  # 1 s, 2 s, 3 s …
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


def get_underlying_price_at_1615(bars_by_date: Dict, exp_date: datetime) -> Optional[float]:
    """Return the underlying price at the 16:15 expiration for equity options.

    Equity options (SPY/QQQ/AAPL/etc.) keep trading in extended hours until 4:15 PM
    ET on expiration day, and the official P&L reflects the underlying at that
    time. Find the last 1-minute (or finer) underlying bar at or before 16:15 on
    the expiration date.
    """
    exp_date_str = exp_date.strftime("%Y-%m-%d")
    bars = bars_by_date.get(exp_date_str, [])
    if not bars:
        return None
    # bars[*]['time'] may be 'HH:MM' or 'HH:MM:SS'; first 5 chars give HH:MM.
    eligible = [b for b in bars if b.get('time', '')[:5] <= '16:15']
    if not eligible:
        return None
    last_bar = max(eligible, key=lambda x: x['time'])
    return last_bar.get('close')

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
    entry_hour, entry_min, entry_sec = _parse_entry_time_parts(config['entry_time'])
    entry_timestamp = trade_date.replace(hour=entry_hour, minute=entry_min, second=entry_sec, microsecond=0)
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
            entry_h, entry_m, _ = _parse_entry_time_parts(config['entry_time'])
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

        elif config_type == 'dollar_prev_candle':
            # "$ Distance from previous candle": target strike = a datapoint of the
            # previous candle (of the configured type/multiplier/day, optionally gated
            # by candle colour) offset by a $ distance in the chosen direction.
            leg_name = leg_config.get('name', f"Leg {i+1}")
            direction = str(params.get('direction', 'above'))
            try:
                amount = float(params.get('amount', params.get('distance', 0)) or 0)
            except (ValueError, TypeError):
                amount = 0.0
            strike_fallback = str(params.get('strike_fallback', 'closest'))
            _entry_ms = int(entry_timestamp.timestamp() * 1000)
            ref_price, ref_note = _reference_candle_price(
                client, config['symbol'], trade_date, _entry_ms, params, which='previous'
            )
            if ref_price is None:
                print(f"  ✗ {leg_name}: $-from-prev-candle strike skipped ({ref_note})")
                return False, [], []
            target_strike = ref_price + amount if direction == 'above' else ref_price - amount
            sym = config['symbol']
            increment = 1 if sym in ("SPY", "QQQ", "IWM") else 5
            strike = round_strike_with_direction(target_strike, increment, direction, strike_fallback)
            if strike is None:
                print(f"  ✗ {leg_name}: Failed to round $-from-prev-candle strike")
                return False, [], []
            calculated_strikes.append(strike)
            print(f"    {leg_name}: prev {params.get('candle_type','min')}x{params.get('multiplier',1)} "
                  f"{params.get('datapoint','close')}={ref_price:.2f} {direction} ${amount} "
                  f"→ target={target_strike:.2f} → strike={strike}")

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
    
    # No artificial delay needed — rate limiting handled by retry logic if a 429 occurs

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
    
    # STEP 3: Fetch OHLCV for ALL contracts in parallel (unlimited Polygon plan)
    print(f"  Fetching OHLCV for {len(option_symbols)} contracts in parallel...")
    option_data = {}
    missing_indices = []

    def _fetch_leg_ohlcv(args):
        i, symbol = args
        leg_exp = leg_exp_dates[i] if i < len(leg_exp_dates) else exp_date
        try:
            aggs = list(client.list_aggs(
                symbol, 10, "second",
                trade_date.strftime("%Y-%m-%d"),
                leg_exp.strftime("%Y-%m-%d"),
                adjusted="true", sort="asc", limit=50000
            ))
            return i, symbol, aggs, None
        except Exception as e:
            return i, symbol, [], e

    with ThreadPoolExecutor(max_workers=len(option_symbols)) as _pool:
        for i, symbol, aggs, err in _pool.map(_fetch_leg_ohlcv, enumerate(option_symbols)):
            if err:
                missing_indices.append(i)
                print(f"  ✗ {symbol}: Error fetching OHLCV: {err}")
            elif len(aggs) > 0:
                option_data[symbol] = aggs
                print(f"  ✓ {symbol}: {len(aggs)} 10-sec bars")
            else:
                missing_indices.append(i)
                print(f"  ✗ {symbol}: No OHLCV data")
    
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

# ==================== THEORETICAL PRICING HELPERS ====================

def _compute_hist_vol(daily_closes: Dict[str, float], as_of_date: str, window_days: int = 30) -> float:
    """Annualised historical volatility from daily closes prior to as_of_date."""
    dates = sorted(d for d in daily_closes if d < as_of_date)
    prices = [daily_closes[d] for d in dates[-(window_days + 1):]]
    if len(prices) < 5:
        return 0.20  # 20% fallback
    log_rets = [np.log(prices[i] / prices[i - 1]) for i in range(1, len(prices))]
    return float(np.std(log_rets, ddof=1) * np.sqrt(252))


def _generate_synthetic_bars(
    underlying_day_bars: List[Dict],
    strike: float,
    opt_type: str,        # 'C' or 'P'
    exp_date: datetime,
    sigma: float,
    r: float = 0.045,
    q: float = 0.0,
    eastern=None,
) -> Dict[str, List[Dict]]:
    """
    Build a {date_str: [bars]} cache from underlying 1-min bars, pricing each
    bar via Black-Scholes.  Produces the same bar dict format used by real data.
    """
    if eastern is None:
        eastern = pytz.timezone('US/Eastern')

    # Expiry is treated as 16:00 ET on the expiration date
    if isinstance(exp_date, datetime):
        exp_naive = exp_date.replace(hour=16, minute=0, second=0, microsecond=0)
    else:
        exp_naive = datetime(exp_date.year, exp_date.month, exp_date.day, 16, 0, 0)
    if getattr(exp_naive, 'tzinfo', None) is None:
        exp_dt_aware = eastern.localize(exp_naive)
    else:
        exp_dt_aware = exp_naive

    ot = 'call' if opt_type.upper() == 'C' else 'put'
    bars_by_date: Dict[str, List[Dict]] = {}

    for ub in underlying_day_bars:
        try:
            # Parse bar datetime (already in Eastern).
            # Underlying 1-min bars use "HH:MM"; option 10-sec bars use "HH:MM:SS".
            bar_time_str = ub['time']  # "HH:MM" or "HH:MM:SS"
            bar_date_str = ub['date']
            fmt = "%Y-%m-%d %H:%M:%S" if len(bar_time_str) == 8 else "%Y-%m-%d %H:%M"
            bar_dt_naive = datetime.strptime(f"{bar_date_str} {bar_time_str}", fmt)
            # Normalise to HH:MM:SS so synthetic bar times are consistent
            bar_time_str = bar_dt_naive.strftime("%H:%M:%S")
            bar_dt = eastern.localize(bar_dt_naive)

            T = max((exp_dt_aware - bar_dt).total_seconds() / (365.25 * 24 * 3600), 1e-10)
            calc = GreeksCalculator(S=ub['open'], K=strike, T=T, r=r, q=q, option_type=ot)
            price = max(0.01, calc.black_scholes_price(sigma))
            price = round(price, 4)

            syn_bar = {
                'date': bar_date_str,
                'datetime': bar_dt,
                'timestamp': ub['timestamp'],
                'time': bar_time_str,
                'open': price,
                'high': round(price * 1.0005, 4),
                'low': round(price * 0.9995, 4),
                'close': price,
                'volume': 0,
                'vw': price,
                '_synthetic': True,
            }
            bars_by_date.setdefault(bar_date_str, []).append(syn_bar)
        except Exception:
            continue

    return bars_by_date


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
    # Stock options (SPY, QQQ, AAPL, etc.) expire at 16:15 using the last traded market price
    # unless the user has selected 16:00 via the expiry_close_time config setting.
    INDEX_SYMBOLS = {"SPX", "SPXW", "XSP", "NDX", "RUT"}
    is_index = config['symbol'].upper() in INDEX_SYMBOLS
    if is_index:
        exp_close_time = "16:00"
    else:
        exp_close_time = config.get('expiry_close_time', '16:15')
    
    # CRITICAL: Entry uses 1-minute bars for precision.
    # Fetch a 7-day buffer before start_date so that the very first backtest day always
    # has a previous trading day available in underlying_bars_1min — this ensures the
    # decision-tree chart SMA/EMA warmup (seed_bars) works from 9:30 on day 1.
    _one_min_fetch_start = datetime.strptime(config['start_date'], "%Y-%m-%d") - timedelta(days=7)
    print(f"\nFetching {config['symbol']} 1-minute data for entry prices...")
    underlying_bars_1min = get_bars_for_period(
        client, underlying_sym,
        _one_min_fetch_start,
        latest_exp,
        1  # Always 1-minute for entry
    )

    # 10-second entry mode: the entry scan runs on 10-second underlying candles
    # (fetched lazily per trading day via _fetch_underlying_candles so times keep
    # HH:MM:SS resolution).  Probe the first trading day(s) up front and FAIL LOUDLY
    # if the symbol has no sub-minute data (e.g. SPY/QQQ/IWM 403) instead of silently
    # collapsing to minute entry.
    ten_second_mode = bool(config.get('ten_second_data'))
    if ten_second_mode and trading_days:
        _probe = _fetch_underlying_candles(client, underlying_sym, trading_days[0], 10, 'second')
        if not _probe and len(trading_days) > 1:
            _probe = _fetch_underlying_candles(client, underlying_sym, trading_days[1], 10, 'second')
        if not _probe:
            raise RuntimeError(
                f"10-second data is unavailable for {config['symbol']}. Sub-minute entry "
                f"requires an index such as SPX/SPXW. Disable the 10-second toggle or switch symbols."
            )
        print(f"  ✓ 10-second underlying data confirmed for {config['symbol']}")

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
        # Always add at least 14 calendar days of warm-up so RSI/MACD have enough
        # prior bars to compute on the very first trading day of the backtest.
        # (RSI-14 on 1-min bars needs 14 previous bars; 14 cal days covers that and weekends.)
        _has_rolling_indicator = any(
            c.get('metric') in ('rsi', 'macd') and
            c.get('left', {}).get('candle_type', 'minute') not in ('day', 'week', 'month')
            for c in all_price_conditions
        )
        min_warmup = 14 if _has_rolling_indicator else 0
        buffer_days = max(max_day_offset * 2 + 5 if max_day_offset > 0 else 0, min_warmup)
        prefetch_start = trading_days[0] - timedelta(days=buffer_days)
        indicators_cache = prefetch_all_indicators_for_range(
            config,
            prefetch_start,
            trading_days[-1]
        )
    
    print("\nProcessing trades...\n" + "-"*80)
    
    decision_log = []

    # Progress reporting setup — write to a small JSON file every iteration
    # so the frontend can render an accurate progress bar for running backtests.
    _progress_bt_id = os.environ.get('CURRENT_BACKTEST_ID')
    _progress_total = len(trading_days)
    _progress_path = None
    if _progress_bt_id:
        try:
            os.makedirs('backtest_results', exist_ok=True)
            _progress_path = os.path.join('backtest_results', f'progress_{_progress_bt_id}.json')
        except Exception:
            _progress_path = None

    # Main loop
    for idx, trade_date in enumerate(trading_days):
        if _progress_path:
            try:
                with open(_progress_path, 'w') as _pf:
                    json.dump({'current': idx, 'total': _progress_total}, _pf)
            except Exception:
                pass
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

            # Concurrent trades guard: if disabled, skip this day while a prior trade is still open
            if not config.get('concurrent_trades', True):
                open_trade = next((t for t in trades if t['exit_date'] >= date_str), None)
                if open_trade:
                    reason = f"Concurrent trade open until {open_trade['exit_date']}"
                    day_entry['events'].append({'type': 'skip', 'reason': reason})
                    decision_log.append(day_entry)
                    continue

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

            # In 10-second mode candidate bar times are HH:MM:SS, so normalise
            # HH:MM window bounds to full-second bounds for correct lexical range
            # matching (start → :00, end → :59).
            if ten_second_mode:
                if len(entry_time_start) == 5:
                    entry_time_start = entry_time_start + ':00'
                if len(entry_time_end) == 5:
                    entry_time_end = entry_time_end + ':59'

            # Store FULL-DAY OHLCV bars (09:30–16:15) for the decision-tree chart.
            # Storing all day bars means the chart frontend can scroll/pan freely to
            # see entry AND exit no matter when they occur in the session.
            if bars_1min_today:
                try:
                    _sorted_bars = sorted(bars_1min_today, key=lambda x: x.get('time', ''))
                    day_entry['bars'] = [
                        [b['time'][:5],
                         round(b.get('open', 0), 2),
                         round(b.get('high', 0), 2),
                         round(b.get('low', 0), 2),
                         round(b.get('close', 0), 2),
                         int(b.get('volume', b.get('v', 0)) or 0)]
                        for b in _sorted_bars
                        if '09:30' <= b.get('time', '')[:5] <= '16:15'
                    ]
                    day_entry['entry_time'] = entry_time_start[:5]

                    # Store last 50 bars from the previous trading day as seed bars for
                    # indicator warmup (SMA/EMA) in the decision-tree chart modal.
                    # These are NOT rendered as candles — only used for computation.
                    try:
                        _prev_date = max(
                            (d for d in underlying_bars_1min if d < date_str),
                            default=None
                        )
                        if _prev_date:
                            _prev_sorted = sorted(
                                underlying_bars_1min[_prev_date],
                                key=lambda x: x.get('time', '')
                            )
                            day_entry['seed_date'] = _prev_date
                            day_entry['seed_bars'] = [
                                [b['time'][:5],
                                 round(b.get('open', 0), 2),
                                 round(b.get('high', 0), 2),
                                 round(b.get('low', 0), 2),
                                 round(b.get('close', 0), 2),
                                 int(b.get('volume', b.get('v', 0)) or 0)]
                                for b in _prev_sorted
                            ]
                        else:
                            day_entry['seed_date'] = None
                            day_entry['seed_bars'] = []
                    except Exception:
                        day_entry['seed_bars'] = []

                except Exception:
                    day_entry['bars'] = []
                    day_entry['seed_bars'] = []

            # Entry condition scanning normally uses 1-minute bars so that rolling
            # window presets (e.g. Velocity) are evaluated at every minute.
            # In 10-second mode the scan uses 10-second underlying candles so entry
            # can occur at an exact sub-minute time (e.g. 15:59:30).
            # detection_bar_size controls only the monitoring interval after entry.
            if ten_second_mode:
                scan_bars_today = _fetch_underlying_candles(client, underlying_sym, trade_date, 10, 'second')
                if not scan_bars_today:
                    day_entry['events'].append({'type': 'no_data', 'reason': '10-second underlying data unavailable for this day'})
                    decision_log.append(day_entry)
                    continue
            else:
                scan_bars_today = bars_1min_today
            candidate_bars = []
            for bar in sorted(scan_bars_today, key=lambda x: x['time']):
                # The regular session ends at 16:00:00 ET. The closing-bell bar
                # (and anything after it) is not a tradeable entry — there is no
                # session time left to hold the position — so never enter at or
                # after the close. Last valid entry is 15:59:50 (10-sec) or
                # 15:59:00 (1-min). Compare on the HH:MM prefix so this works
                # for both 1-minute ('HH:MM') and 10-second ('HH:MM:SS') bars.
                if bar['time'][:5] >= '16:00':
                    continue
                if entry_time_start <= bar['time'] <= entry_time_end:
                    candidate_bars.append(bar)
            
            if not candidate_bars:
                day_entry['events'].append({'type': 'no_data', 'reason': 'No market bars available in entry time range'})
                decision_log.append(day_entry)
                continue
            
            # Use pre-fetched indicator cache (already loaded at backtest start)
            # No additional API calls needed here!
            
            # Split price conditions into simultaneous prerequisites vs sequential phases
            _all_price_conds = price_conditions or []
            _prereq_conds = [c for c in _all_price_conds if not c.get('is_sequential')]
            _seq_conds    = [c for c in _all_price_conds if c.get('is_sequential')]
            # Group sequential conditions by their prerequisite phase.
            # seq_prereq_phase: which phase must complete before this group arms.
            # Default (backward-compat): i-th seq condition depends on phase i+1 → linear chain.
            _seq_groups = {}  # prereq_phase_num → [conditions]
            for _i, _sc in enumerate(_seq_conds):
                _pp = int(_sc.get('seq_prereq_phase') or (_i + 1))
                _seq_groups.setdefault(_pp, []).append(_sc)
            _seq_group_prereqs = sorted(_seq_groups.keys())
            # Per-day sequential state (resets each day)
            # _current_phase=1 → checking initial prereqs; 2+ → checking group for prereq=phase-1
            _current_phase = 1
            _seq_arm_bar_idx = -1 # bar index when current phase was armed

            def _fmt_cd(c):
                base = f"{c['left_label']} {c['left_value']:.2f} {c['operator']} {c['right_label']} {c['right_value']:.2f}"
                if c.get('threshold'):
                    sign = '-' if c['operator'] in ('<', '<=') else '+'
                    unit = '%' if c.get('threshold_unit') == 'percent' else 'pts'
                    base += f" {sign}{c['threshold']}{unit} → {c['effective_right']:.2f}"
                return base

            # Scan through candidate bars to find first one where conditions are met
            entry_bar = None
            last_condition_reason = None
            _entry_snap = {}
            for _bar_idx, bar in enumerate(candidate_bars):
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
                
                # Check custom price conditions — group-based concurrent state machine
                # _current_phase=1: checking initial prereqs; N>1: checking concurrent group for prereq=N-1
                if price_conditions:
                    cond_details = []
                    if _current_phase == 1:
                        # Phase 1: check all non-sequential (simultaneous) prerequisites
                        if _prereq_conds:
                            _pconf = {**config, 'price_conditions': _prereq_conds}
                            conditions_met, condition_reason, cond_details = evaluate_price_conditions_with_cache(
                                _pconf, bar, indicators_cache, trade_date,
                                bars_by_date=underlying_bars_1min, client=client
                            )
                            if not conditions_met:
                                print(f"  Conditions not met: {condition_reason}", flush=True)
                                last_condition_reason = condition_reason
                                continue
                        if _seq_group_prereqs:
                            # Phase 1 satisfied — arm first sequential group
                            _current_phase = 2
                            _seq_arm_bar_idx = _bar_idx
                            print(f"  SEQ Phase 1 armed @ {bar_time}", flush=True)
                            day_entry['events'].append({
                                'type': 'seq_phase_armed',
                                'phase': 1,
                                'time': bar_time,
                                'price': underlying_price,
                            })
                            continue
                        # No sequential conditions — fall through to entry
                        _det_str = '  '.join(_fmt_cd(c) for c in cond_details) if cond_details else ''
                        print(f"  Conditions met - entering trade" + (f"  [{_det_str}]" if _det_str else ""), flush=True)
                        day_entry['events'].append({
                            'type': 'condition_met',
                            'time': bar_time,
                            'price': underlying_price,
                            'reason': 'All price conditions met',
                            'conditions': cond_details
                        })
                    else:
                        # Sequential group phase: check all conditions whose prereq = _current_phase - 1
                        _prereq_key = _current_phase - 1
                        _group = _seq_groups.get(_prereq_key, [])
                        # Max wait: use the maximum across all conditions in the group
                        _max_wait = max((int(_c.get('max_wait_bars', 0) or 0) for _c in _group), default=0)
                        if _max_wait > 0 and (_bar_idx - _seq_arm_bar_idx) > _max_wait:
                            # Timed out — reset to phase 1
                            _current_phase = 1
                            _seq_arm_bar_idx = -1
                            print(f"  SEQ Phase {_current_phase} timed out @ {bar_time} — resetting", flush=True)
                            continue
                        # Check all conditions in the group simultaneously (AND logic)
                        _group_met = True
                        _group_details = []
                        for _sc in _group:
                            _sc_conf = {**config, 'price_conditions': [_sc]}
                            _sc_met, condition_reason, _sc_details = evaluate_price_conditions_with_cache(
                                _sc_conf, bar, indicators_cache, trade_date,
                                bars_by_date=underlying_bars_1min, client=client
                            )
                            _group_details.extend(_sc_details)
                            if not _sc_met:
                                _group_met = False
                                break
                        if not _group_met:
                            print(f"  SEQ Phase {_current_phase} not yet met: {condition_reason}", flush=True)
                            last_condition_reason = condition_reason
                            continue
                        # Group met — check if a further group depends on the phase we just completed
                        _next_prereq = _current_phase  # next group waits for phase = _current_phase
                        if _next_prereq in _seq_groups:
                            # Advance to the next sequential group
                            _current_phase += 1
                            _seq_arm_bar_idx = _bar_idx
                            print(f"  SEQ Phase {_current_phase} armed @ {bar_time}", flush=True)
                            day_entry['events'].append({
                                'type': 'seq_phase_armed',
                                'phase': _current_phase,
                                'time': bar_time,
                                'price': underlying_price,
                            })
                            continue
                        # All groups satisfied — fall through to entry
                        cond_details = _group_details
                        _det_str = '  '.join(_fmt_cd(c) for c in cond_details) if cond_details else ''
                        print(f"  SEQ Final phase met - entering trade" + (f"  [{_det_str}]" if _det_str else ""), flush=True)
                        day_entry['events'].append({
                            'type': 'condition_met',
                            'time': bar_time,
                            'price': underlying_price,
                            'reason': 'All sequential conditions met',
                            'conditions': cond_details
                        })
                
                # Conditions met (or no conditions), use this bar for entry
                entry_bar = bar
                # Snapshot indicator values at entry for trade log
                _entry_snap = {}
                _entry_bar_ts = bar.get('timestamp')
                for _cond in price_conditions:
                    _m = _cond.get('metric', 'price')
                    _lp = _cond.get('left', {})
                    if _m in ('sma', 'ema', 'vwap'):
                        _w = int(_lp.get('window', 14))
                        _tf = int(_lp.get('timeframe_minutes', 5))
                        _ik = f'{_m}_w{_w}_t{_tf}'
                        _id = indicators_cache.get(_ik, {})
                        if _id:
                            _v = find_closest_indicator_value(_id, _entry_bar_ts)
                            if _v is not None:
                                _entry_snap[f'{_m.upper()}({_w},{_tf}min)'] = round(_v, 4)
                break
            
            if not entry_bar:
                print(f"  [{date_str}] No entry - conditions not met in time range {entry_time_start}-{entry_time_end}")
                day_entry['events'].append({
                    'type': 'no_signal',
                    'reason': last_condition_reason or f'Conditions not met in range {entry_time_start}-{entry_time_end}'
                })
                decision_log.append(day_entry)
                continue
            
            # Use the entry bar's VWAP as the underlying reference so it matches the
            # "Current Price" the entry signal is measured on (falls back to close).
            _entry_vw = entry_bar.get('vw')
            underlying_price = _entry_vw if _entry_vw is not None else entry_bar['close']
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
        
            _theoretical = False
            if not success:
                # Final fallback: Black-Scholes theoretical pricing (only when user allows it)
                if not config.get('allow_synthetic', True):
                    print(f"  Skipping - no market data and synthetic pricing is disabled")
                    day_entry['events'].append({'type': 'skip', 'reason': 'No market data (synthetic pricing disabled)'})
                    decision_log.append(day_entry)
                    continue

                sigma_th = _compute_hist_vol(underlying_daily_closes, date_str)
                r_th = 0.045

                # Collect all underlying bars from trade_date through exp_date
                _th_ub_all = []
                for _thd in sorted(underlying_bars_1min.keys()):
                    if trade_date.strftime("%Y-%m-%d") <= _thd <= exp_date.strftime("%Y-%m-%d"):
                        _th_ub_all.extend(underlying_bars_1min.get(_thd, []))

                # Recalculate strikes (config['legs'] already normalized by fetch call)
                _th_strikes = []
                _th_ok = True
                for _th_i, _th_lc in enumerate(config['legs']):
                    if _th_lc.get('config_type') == 'delta':
                        _th_ok = False
                        break
                    _th_s = calculate_strike_simple(
                        underlying_price, _th_lc, _th_strikes, config['symbol']
                    )
                    if _th_s is None:
                        _th_ok = False
                        break
                    _th_strikes.append(_th_s)

                if not _th_ok or len(_th_strikes) != len(config['legs']):
                    print(f"  Skipping - unable to fetch valid option data")
                    day_entry['events'].append({'type': 'skip', 'reason': 'Unable to fetch valid option data for strikes'})
                    decision_log.append(day_entry)
                    continue

                print(f"  ⚠ No market data — Black-Scholes theoretical pricing "
                      f"(σ={sigma_th:.1%}, r={r_th:.1%})")

                _eastern_th = pytz.timezone('US/Eastern')
                legs_info = []
                for _th_i, _th_lc in enumerate(config['legs']):
                    _th_strike = _th_strikes[_th_i]
                    _th_exp = _th_lc.get('_exp_date', exp_date)
                    _th_sym = format_option_symbol(
                        config['symbol'], _th_exp, _th_strike, _th_lc['type']
                    )
                    _th_bars = _generate_synthetic_bars(
                        _th_ub_all, _th_strike, _th_lc['type'],
                        _th_exp, sigma_th, r_th, eastern=_eastern_th
                    )
                    option_cache_1min[_th_sym] = _th_bars
                    option_cache_10sec[_th_sym] = _th_bars
                    option_cache_detection[_th_sym] = _th_bars
                    legs_info.append({
                        'symbol': _th_sym,
                        'strike': _th_strike,
                        'type': _th_lc['type'],
                        'position': _th_lc['position'],
                        'entry_price': None,
                        'name': _th_lc.get('name', f'Leg {_th_i + 1}'),
                    })

                day_entry['_theoretical'] = True
                _theoretical = True

            if not _theoretical:
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
        
            # Build legs_info from fetched data (skipped when theoretical pricing is used)
            if not _theoretical:
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
                # Defensive .get() — when an option contract has no Polygon data the symbol
                # never gets added to the cache, so a bare dict access would raise KeyError
                # and silently lose the trade. Treat a missing symbol the same as empty bars
                # so the existing missing-bar handler (synthetic / strike-sweep) can run.
                leg_bars = option_cache_1min.get(leg['symbol'], {}).get(date_str, [])
                if not leg_bars:
                    print(f"  No bars for {leg['symbol']} ({leg['name']} @ {leg['strike']}) on entry date — leg will be filled by synthetic/strike-sweep fallback")
                    break
                all_leg_bars.append(leg_bars)

            if len(all_leg_bars) != len(legs_info):
                if config.get('allow_synthetic', True):
                    # Some legs have no bars on entry date — fill all with synthetic bars
                    _sigma_mb = _compute_hist_vol(underlying_daily_closes, date_str)
                    _r_mb = 0.045
                    _mb_ub_all = []
                    for _mbd in sorted(underlying_bars_1min.keys()):
                        if trade_date.strftime("%Y-%m-%d") <= _mbd <= exp_date.strftime("%Y-%m-%d"):
                            _mb_ub_all.extend(underlying_bars_1min.get(_mbd, []))
                    for _mb_leg in legs_info:
                        _mb_leg_exp = exp_date
                        for _lc in config['legs']:
                            if _lc.get('name') == _mb_leg['name']:
                                _mb_leg_exp = _lc.get('_exp_date', exp_date)
                                break
                        _mb_bars = _generate_synthetic_bars(
                            _mb_ub_all, _mb_leg['strike'], _mb_leg['type'],
                            _mb_leg_exp, _sigma_mb, _r_mb, eastern=eastern
                        )
                        option_cache_1min[_mb_leg['symbol']] = _mb_bars
                        option_cache_10sec[_mb_leg['symbol']] = _mb_bars
                        option_cache_detection[_mb_leg['symbol']] = _mb_bars
                    # Rebuild all_leg_bars from the fresh synthetic cache
                    all_leg_bars = [option_cache_1min[leg['symbol']].get(date_str, []) for leg in legs_info]
                    _theoretical = True
                    day_entry['_theoretical'] = True
                    print(f"  ⚠ Missing bars for some legs — Black-Scholes synthetic pricing "
                          f"(σ={_sigma_mb:.1%}, r={_r_mb:.1%})")
                else:
                    print(f"  Skipping - missing bars for some legs")
                    day_entry['events'].append({'type': 'skip', 'reason': 'Missing option bars for some legs on entry date'})
                    decision_log.append(day_entry)
                    continue

            # Build per-leg minute sets (HH:MM) from their 10-sec bars
            minute_sets = [set(b['time'][:5] for b in bars) for bars in all_leg_bars]
            common_minutes = set.intersection(*minute_sets) if minute_sets else set()

            # Filter to the configured entry window.
            # IMPORTANT: when an entry window spans multiple minutes and conditions
            # gate which minute to enter, the option pricing must start at the same
            # minute the underlying condition was satisfied — not at the beginning of
            # the window.  `entry_time` has already been updated to the condition-met
            # bar's time (e.g. "10:00:00"), so use entry_time[:5] as the floor.
            eastern = pytz.timezone('US/Eastern')
            has_entry_window = entry_time_start != entry_time_end
            # Minute-availability matching is always at HH:MM granularity, so trim any
            # seconds component (present in 10-second mode) from the window bounds.
            window_start = entry_time[:5] if has_entry_window else entry_time[:5]
            window_end   = entry_time_end[:5]  if has_entry_window else entry_time[:5]

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
                    # --- Strike sweep: try adjacent strikes for legs missing data in window ---
                    _sym_inc = 1 if config['symbol'] in ("SPY", "QQQ", "IWM") else 5
                    _MAX_SWEEP = 5
                    _sweep_found = False

                    # Identify which legs have no bars in the entry window
                    _missing_in_window = []
                    for _si, _sl in enumerate(legs_info):
                        _sl_bars = option_cache_1min[_sl['symbol']].get(date_str, [])
                        _sl_in_win = [b for b in _sl_bars if window_start <= b['time'][:5] <= window_end]
                        if not _sl_in_win:
                            _missing_in_window.append(_si)

                    if _missing_in_window:
                        print(f"  ↳ Strike sweep: "
                              f"{[legs_info[i]['name'] for i in _missing_in_window]} "
                              f"have no bars in window — trying adjacent strikes...")

                        for _miss_idx in _missing_in_window:
                            if _sweep_found:
                                break
                            _sl_leg = legs_info[_miss_idx]
                            _sl_cfg = config['legs'][_miss_idx]
                            _sl_exp = _sl_cfg.get('_exp_date', exp_date)
                            _sl_fb  = _sl_cfg.get('params', {}).get('strike_fallback', 'closest')
                            _sl_base = _sl_leg['strike']

                            # Generate candidate strikes in the configured fallback direction
                            _candidates = []
                            if _sl_fb == 'or_lower':
                                _candidates = [_sl_base - k * _sym_inc for k in range(1, _MAX_SWEEP + 1)]
                            elif _sl_fb == 'or_higher':
                                _candidates = [_sl_base + k * _sym_inc for k in range(1, _MAX_SWEEP + 1)]
                            else:  # closest: alternate ± each increment
                                for k in range(1, _MAX_SWEEP + 1):
                                    _candidates.append(_sl_base - k * _sym_inc)
                                    _candidates.append(_sl_base + k * _sym_inc)

                            for _cand in _candidates:
                                if _cand <= 0:
                                    continue
                                _new_sym = format_option_symbol(
                                    config['symbol'], _sl_exp, _cand, _sl_leg['type']
                                )

                                # Reuse cache if already fetched
                                if (_new_sym in option_cache_1min
                                        and date_str in option_cache_1min[_new_sym]):
                                    _sw_fetched = {date_str: option_cache_1min[_new_sym][date_str]}
                                else:
                                    try:
                                        _sw_raw = list(client.list_aggs(
                                            _new_sym, 10, "second",
                                            trade_date.strftime("%Y-%m-%d"),
                                            _sl_exp.strftime("%Y-%m-%d"),
                                            adjusted="true", sort="asc", limit=50000
                                        ))
                                    except Exception:
                                        continue
                                    if not _sw_raw:
                                        continue
                                    _sw_fetched = {}
                                    for _sa in _sw_raw:
                                        _sdt = datetime.fromtimestamp(
                                            _sa.timestamp / 1000, tz=pytz.UTC
                                        ).astimezone(eastern)
                                        _sdk = _sdt.strftime("%Y-%m-%d")
                                        _shm = _sdt.hour * 60 + _sdt.minute
                                        if not (9*60+30 <= _shm <= 16*60+15):
                                            continue
                                        if _sdk not in _sw_fetched:
                                            _sw_fetched[_sdk] = []
                                        _sw_fetched[_sdk].append({
                                            'date': _sdk, 'datetime': _sdt,
                                            'timestamp': _sa.timestamp,
                                            'time': _sdt.strftime("%H:%M:%S"),
                                            'open': _sa.open, 'high': _sa.high,
                                            'low': _sa.low, 'close': _sa.close,
                                            'volume': getattr(_sa, 'volume', 0),
                                            'vw': getattr(_sa, 'vwap', _sa.close)
                                        })

                                _sw_today = _sw_fetched.get(date_str, [])
                                if not _sw_today:
                                    continue

                                # Check for common minute across all legs with this candidate
                                _sw_sets = []
                                for _si2, _sl2 in enumerate(legs_info):
                                    if _si2 == _miss_idx:
                                        _sw_sets.append(set(b['time'][:5] for b in _sw_today))
                                    else:
                                        _ex = option_cache_1min[_sl2['symbol']].get(date_str, [])
                                        _sw_sets.append(set(b['time'][:5] for b in _ex))

                                if not all(_sw_sets):
                                    continue

                                _sw_common = set.intersection(*_sw_sets)
                                _sw_valid = sorted(
                                    m for m in _sw_common if window_start <= m <= window_end
                                )

                                if _sw_valid:
                                    print(f"  ↳ Strike sweep success: "
                                          f"{_sl_leg['name']} {_sl_base}→{_cand} "
                                          f"({_new_sym}), common minute {_sw_valid[0]}")
                                    option_cache_1min[_new_sym] = _sw_fetched
                                    option_cache_10sec[_new_sym] = _sw_fetched
                                    legs_info[_miss_idx]['symbol'] = _new_sym
                                    legs_info[_miss_idx]['strike'] = _cand
                                    valid_minutes = _sw_valid
                                    _sweep_found = True
                                    break
                                else:
                                    print(f"  ↳ {_new_sym} ({_cand}): no common minute in window")

                    if not _sweep_found:
                        if config.get('allow_synthetic', True):
                            # All market-data fallbacks exhausted — switch to synthetic bars
                            _sigma_nm = _compute_hist_vol(underlying_daily_closes, date_str)
                            _r_nm = 0.045
                            _nm_ub_all = []
                            for _nmd in sorted(underlying_bars_1min.keys()):
                                if trade_date.strftime("%Y-%m-%d") <= _nmd <= exp_date.strftime("%Y-%m-%d"):
                                    _nm_ub_all.extend(underlying_bars_1min.get(_nmd, []))

                            for _nm_leg in legs_info:
                                _nm_leg_exp = exp_date
                                for _lc in config['legs']:
                                    if _lc.get('name') == _nm_leg['name']:
                                        _nm_leg_exp = _lc.get('_exp_date', exp_date)
                                        break
                                _nm_bars = _generate_synthetic_bars(
                                    _nm_ub_all, _nm_leg['strike'], _nm_leg['type'],
                                    _nm_leg_exp, _sigma_nm, _r_nm, eastern=eastern
                                )
                                option_cache_1min[_nm_leg['symbol']] = _nm_bars
                                option_cache_10sec[_nm_leg['symbol']] = _nm_bars
                                option_cache_detection[_nm_leg['symbol']] = _nm_bars

                            # Synthetic bars cover every underlying minute — pick first in entry window
                            _syn_day_bars = option_cache_1min[legs_info[0]['symbol']].get(date_str, [])
                            _syn_minutes = sorted(set(b['time'][:5] for b in _syn_day_bars))
                            _syn_valid = [m for m in _syn_minutes if window_start <= m <= window_end]
                            valid_minutes = _syn_valid if _syn_valid else [entry_time[:5]]

                            _theoretical = True
                            day_entry['_theoretical'] = True
                            print(f"  ⚠ No common market minute — Black-Scholes synthetic pricing "
                                  f"(σ={_sigma_nm:.1%}, r={_r_nm:.1%})")
                        else:
                            reason = (f'No common option minute in window {entry_time_start}–{entry_time_end}'
                                      if has_entry_window else f'No common option minute at {entry_time}')
                            print(f"  Skipping - {reason}")
                            day_entry['events'].append({'type': 'skip', 'reason': reason})
                            decision_log.append(day_entry)
                            continue
                    # --- End strike sweep ---
            # --- End fallback ---

            common_minute = valid_minutes[0][:5]  # normalise to HH:MM for downstream minute matching

            # Compute entry_timestamp as the :00 boundary of the chosen minute.
            # Pricing uses bars strictly AFTER this (i.e. :10, :20, :30 within the minute).
            entry_dt_est = eastern.localize(
                datetime.strptime(f"{date_str} {common_minute}:00", "%Y-%m-%d %H:%M:%S")
            )
            entry_timestamp = int(entry_dt_est.timestamp() * 1000)

            if ten_second_mode and entry_bar and str(entry_bar.get('time', ''))[:5] == common_minute:
                # Sub-minute entry: fill at the exact 10-second bar the signal fired on
                # rather than snapping to the :00 minute boundary.
                entry_timestamp = int(entry_bar['timestamp'])
                entry_time = entry_bar['time']
                # underlying_price already reflects the 10-sec entry bar.
            else:
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
                # In 10-second mode the entry_timestamp is the exact signal bar, so the
                # lower bound is inclusive to fill AT that bar.
                _fill_lb = entry_timestamp - 1 if ten_second_mode else entry_timestamp
                window_bars = sorted(
                    [b for b in bars_10sec_today
                     if _fill_lb < b['timestamp'] < entry_timestamp + 60_000],
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

            # Validate iron condor strike ordering.
            # For a Short Iron Condor the short legs must straddle the underlying:
            #   Long Put < Short Put < underlying < Short Call < Long Call
            # If both short legs are ITM (short put above underlying AND/OR short call
            # below underlying) the position value is mathematically locked near the
            # initial credit and TP/SL targets become unreachable.  Skip with a clear
            # explanation so the user knows to fix their leg configuration.
            if 'iron condor' in _strat_name_lower:
                _ic_puts  = [l for l in legs_info if l.get('type', '').upper() == 'P']
                _ic_calls = [l for l in legs_info if l.get('type', '').upper() == 'C']
                _ic_short_puts  = [l for l in _ic_puts  if l.get('position') == 'short']
                _ic_short_calls = [l for l in _ic_calls if l.get('position') == 'short']
                if _ic_short_puts and _ic_short_calls:
                    _ic_sp_strike = max(l['strike'] for l in _ic_short_puts)
                    _ic_sc_strike = min(l['strike'] for l in _ic_short_calls)
                    _ic_inverted_put  = _ic_sp_strike > underlying_price
                    _ic_inverted_call = _ic_sc_strike < underlying_price
                    if _ic_inverted_put or _ic_inverted_call:
                        _ic_problems = []
                        if _ic_inverted_put:
                            _ic_problems.append(
                                f"Short Put strike {_ic_sp_strike} is above underlying "
                                f"{underlying_price:.2f} (ITM put — should be below underlying)"
                            )
                        if _ic_inverted_call:
                            _ic_problems.append(
                                f"Short Call strike {_ic_sc_strike} is below underlying "
                                f"{underlying_price:.2f} (ITM call — should be above underlying)"
                            )
                        _ic_reason = (
                            "Inverted iron condor strikes: " + "; ".join(_ic_problems) +
                            ". With both short legs ITM the position value is fixed and "
                            "TP/SL targets cannot be reached. "
                            "Fix: set Short Put direction to 'below' and Short Call direction "
                            "to 'above' the underlying price."
                        )
                        print(f"  ❌ SKIPPING - {_ic_reason}")
                        day_entry['events'].append({'type': 'skip', 'reason': _ic_reason})
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
            
                # Get detection bars for all legs.
                # Use .get() defensively: if an option contract has no data on Polygon
                # at all, its symbol may never have been added to the cache. A bare
                # `option_cache_detection[symbol]` access would raise KeyError and the
                # outer try/except would record the symbol string as the failure reason,
                # silently dropping the trade. Treat missing symbols the same as empty
                # bars so the loop continues to the expiration-pricing fallback.
                leg_bars_list = []
                _missing_leg = None
                for leg_info in legs_info:
                    leg_bars = option_cache_detection.get(leg_info['symbol'], {}).get(mon_date_str, [])
                    if not leg_bars:
                        _missing_leg = leg_info
                        break
                    leg_bars_list.append(leg_bars)
            
                if len(leg_bars_list) != len(legs_info):
                    if _missing_leg is not None and is_entry_day:
                        print(f"  ⚠ {_missing_leg['name']} {_missing_leg['symbol']} has no monitoring bars on {mon_date_str} — relying on expiration pricing")
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
                        
                        # Avoid day trades: if avoid_pdt is enabled, skip ALL exits on
                        # the entry day (regardless of DTE) to prevent same-day round trips.
                        if config.get('avoid_pdt') and is_entry_day:
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
                                sig_bar_time, indicators_cache, monitoring_date,
                                bars_by_date=underlying_bars_1min
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

                # For equity options, the settlement reference is the underlying price
                # at 16:15 ET (extended-hours close) by default, or 16:00 if the user
                # selected the 16:00 option. Index options always use 16:00 intrinsic.
                # Look up the last underlying 1-min bar at or before the chosen close
                # time. Fall back to the daily close when no intraday bar is available.
                if not is_index and exp_close_time == '16:15':
                    _u1615 = get_underlying_price_at_1615(underlying_bars_1min, monitoring_exp)
                    if _u1615 is not None:
                        expiration_underlying_price = _u1615

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
                            # Near-term leg: expired.
                            # Both equity and index options are settled at intrinsic
                            # value. For equity options the reference is the underlying
                            # at 16:15 (already applied to expiration_underlying_price
                            # above); for index options it is the 16:00 close. Using
                            # intrinsic avoids spurious P&L from illiquid late prints
                            # on OTM contracts that should expire worthless.
                            if leg['type'] == 'C':
                                intrinsic = max(0, expiration_underlying_price - leg['strike'])
                            else:
                                intrinsic = max(0, leg['strike'] - expiration_underlying_price)
                            final_leg_prices.append(intrinsic)
                            _ref = exp_close_time
                            print(f"    {leg['name']} (near leg) @ {leg['strike']}: intrinsic from underlying {_ref} = {intrinsic:.4f}")
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
                    # Both equity and index options settle at intrinsic value at
                    # expiration. The only difference is the underlying reference
                    # time (16:15 vs 16:00), which has already been applied to
                    # expiration_underlying_price above. Pricing equity options
                    # off the option contract's last market print produced spurious
                    # P&L from illiquid late-session prints on OTM contracts that
                    # should expire worthless — see flag 2 from the T6 review.
                    final_premium, final_leg_prices = calculate_expiration_values(
                        legs_info, expiration_underlying_price
                    )
                    _ref = exp_close_time
                    for i, leg in enumerate(legs_info):
                        print(f"    {leg['name']} @ {leg['strike']}: intrinsic from underlying {_ref} = {final_leg_prices[i]:.4f}")
            
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

            # Store exit date directly on day_entry so the chart can show the
            # full entry→exit span for multi-day trades.
            day_entry['exit_date'] = exit_date_str
            if exit_date_str != date_str:
                # Collect 1-min underlying bars for every trading day from entry
                # through exit (inclusive) so the frontend can render a continuous
                # multi-day candlestick chart.
                _multi = {}
                for _d in sorted(underlying_bars_1min.keys()):
                    if date_str <= _d <= exit_date_str:
                        _db = underlying_bars_1min.get(_d, [])
                        if _db:
                            _ds = sorted(_db, key=lambda x: x.get('time', ''))
                            _multi[_d] = [
                                [b['time'][:5],
                                 round(b.get('open', 0), 2),
                                 round(b.get('high', 0), 2),
                                 round(b.get('low', 0), 2),
                                 round(b.get('close', 0), 2),
                                 int(b.get('volume', b.get('v', 0)) or 0)]
                                for b in _ds
                                if '09:30' <= b.get('time', '')[:5] <= '16:15'
                            ]
                day_entry['multi_day_bars'] = _multi

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
                'indicator_snapshot': _entry_snap,
                'pricing_mode': 'theoretical' if _theoretical else 'market',
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
                                  trade_date=None,
                                  bars_by_date: Dict = None) -> Tuple[bool, str]:
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
        
        met, reason, _ = evaluate_price_conditions_with_cache(exit_config_for_eval, current_bar, indicators_cache, trade_date, bars_by_date=bars_by_date)
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
            'pnl', 'exit_reason', 'dte', 'dit', 'capital_before', 'capital_after',
            'pricing_mode', 'synthetic_entry'
        ]
        
        # Add indicator snapshot columns (SMA/EMA/VWAP values at entry)
        all_indicator_keys = []
        for t in trades:
            for k in (t.get('indicator_snapshot') or {}).keys():
                if k not in all_indicator_keys:
                    all_indicator_keys.append(k)
        fieldnames.extend(all_indicator_keys)

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
                'capital_after': f"{trade['capital_after']:.2f}",
                'pricing_mode': trade.get('pricing_mode', 'market'),
                'synthetic_entry': 'Yes' if trade.get('pricing_mode') == 'theoretical' else 'No'
            }
            
            # Add indicator snapshot values
            snap = trade.get('indicator_snapshot') or {}
            for k in all_indicator_keys:
                row[k] = f"{snap[k]:.4f}" if k in snap else ''

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
        client = RESTClient(API_KEY, connect_timeout=10, read_timeout=30)
        
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
