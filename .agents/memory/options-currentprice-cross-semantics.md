---
name: "Current Price" cross = candle-OPEN cross (all 3 engines)
description: How the options/stock backtesters and live bot time cross_up/cross_down for the "Current Price" metric.
---

For the "Current Price" metric, `cross_up`/`cross_down` is **candle-open based** in ALL THREE engines (options backtester, stock backtester, live bot), kept in sync:

- `cross_up` = PREVIOUS candle's OPEN strictly below its comparator AND the CURRENT candle's OPEN strictly above the current comparator.
- `cross_down` = mirror (prev open strictly above, current open strictly below).
- The live price / VWAP is **NOT** part of the trigger anymore.
- Strict inequalities on both sides; exactly-on-the-line ⇒ no fire. Missing prev-bar data fails closed (no fire).
- Each candle's open is compared against the comparator value known at that candle (per-bar SMA/EMA in the backtesters; in the bot, MA through the finished candles before that candle).

**Why:** User explicitly redefined it (July 2026): "prev candle open < SMA20, then current candle open > SMA20." Replaces the earlier within-bar breach rule (prev open gate + live price crossing). Consequence (accepted): the cross is detected at the open of the bar AFTER the actual intra-bar breach — entries fire one bar later than the old live-price rule.

**Where:** options `evaluate_price_conditions_with_cache` `_within_bar_cross` block (in within-bar mode `prev_left` holds THIS bar's open from the `price_open` cache; `_prev_bar_open`/`_prev_bar_comparator` hold the prev bar's); stock engine cross branch (both prev AND current side evaluated on 'open' when metric == current_price); bot `eval_metric_verbose` in two blocks — `value` (fixed threshold) and `compare_sma/ema` (edge-latch side = current candle open vs latest MA, so the side only flips at candle boundaries; prev-open gate replaces the old last-bar-close origin confirmation).

**Non-current-price series are unchanged:** prev value strictly below → current value at-or-above (`>=`), using the configured series (default close).

**Entry fill (options):** still the entry bar's VWAP (`entry_bar['vw']`, fallback close) — only the trigger changed.

**How to apply:** the options evaluator is shared by entry AND exit conditions, so both use the open-based rule. The bot's `compare_price`/`compare_vwap` comparators have no cross handling (fall through to `_compare`); legacy `evaluate_price_conditions` (non-cache) in the options file is dead code for the backtest loop.
