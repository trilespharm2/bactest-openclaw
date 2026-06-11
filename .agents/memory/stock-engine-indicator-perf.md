---
name: Stock backtest engine indicator performance
description: Why stock backtests were ~10-100x slower than options, and the per-day indicator cache that fixed it.
---

# Stock engine indicator recomputation bottleneck

The stock engine (`backtester_engine_v3_0__6_.py`) historically recomputed rolling
indicators (SMA/EMA/RSI/MACD/VWAP) **from scratch on every minute bar** inside the
per-day loop: each bar rebuilt a series of up to 60 prior days of minute data
(~23k rows), concatenated, and re-ran `.rolling()`/`.ewm()` just to read the last
value — and cross operators did it twice per bar. That is the O(n²)-style cost
behind ~7s/trading-day (~40 min for a 1.5yr SPX run).

The **options** engine (`options_backtester_v2_3_3_5.py`) is fast because it
prefetches every indicator **once** over the whole range into a timestamp-keyed
cache and does O(1) lookups per bar.

**Fix (decision to keep):** mirror the options approach with a per-day cache in the
stock engine, but compute results **identically** to the old path rather than a
global precompute.
- `_compute_indicator` is a thin cached front-end; the original math lives unchanged
  in `_compute_indicator_raw` (the fallback).
- `day_offset != 0` values are constant within a day → memoized once per
  (date_index, signature) in a `const` cache.
- `day_offset == 0`, `candle=='min'`, type in {sma,ema,rsi} → `_build_perbar_min_indicator`
  computes the whole day's series ONCE over `[60 prior days + ALL of today]`, then
  looks up by timestamp (`perbar` cache, cleared each day).
- Everything else (hr/day candles, macd, vwap, prereq/cutoff calls) falls through to
  `_compute_indicator_raw` unchanged.

**Why it's exact, not approximate:** trailing `rolling` and `ewm(adjust=False)` are
causal — the value at bar B depends only on bars ≤ B — so computing once over the
full day and reading position B equals truncating the series at B. Keeping the same
60-day window (not a global precompute) avoids any EMA/RSI warmup drift. Verified on
real SPX minute data: `max_abs_diff = 0.000e+00`, zero None-mismatches across
SMA/EMA/RSI; ~120x faster.

**How to apply:** any new time-varying per-bar indicator must either (a) be added to
`_build_perbar_min_indicator` with a causal formula, or (b) deliberately fall through
to the raw path. The `const`/`perbar` caches are keyed by `_indicator_signature`,
which must include every param that affects the value. Caches are reset per symbol in
`_backtest_symbol_intraday`; `perbar` is cleared at the start of each day.
