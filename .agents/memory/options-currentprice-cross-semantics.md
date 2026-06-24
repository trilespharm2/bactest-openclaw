---
name: Options "Current Price" cross = within-bar breach
description: How the options engine times cross_up/cross_down for the "Current Price" metric, and why entry fills on VWAP.
---

For the OPTIONS backtester ("Current Price" metric, i.e. `left.current_price=true`), a `cross_up`/`cross_down` fires on the **breach bar itself**, not the bar after:

- `cross_up` = PREVIOUS bar's OPEN below the comparator AND THIS bar's OPEN below the comparator AND THIS bar's current price (VWAP, falls back to close) at/above the comparator.
- `cross_down` = mirror (prev open above, this open above, VWAP at/below).
- The previous-bar-open gate fails closed: if the previous bar's open or comparator is unavailable, the cross does NOT fire.
- Implemented via a `_within_bar_cross` flag in `evaluate_price_conditions_with_cache`: `prev_left` reads the `price_open` cache at the **current** `bar_timestamp` (not the previous bar), and `prev_right` is overridden to the current comparator (`right_value`).
- Requires the `price_open` cache; if absent it falls back to the older lagged semantics (previous bar's open/VWAP).

**Why:** The earlier asymmetric cross compared the PREVIOUS bar's open, so when a bar opened below and closed above the line (the real breach), entry fired one bar late. User wants entry on the first instance price breaches the line. Consequence (accepted): if the breach happens before the entry window opens, that day gets no trade.

**Entry fill:** the underlying reference price at entry is the entry bar's VWAP (`entry_bar['vw']`, fallback close), not the bar open — so the fill matches the price the signal is measured on.

**How to apply:** This evaluator is shared by entry AND exit conditions, so both get breach-bar semantics for Current Price crosses. The stock engine is separate and not affected.

**Live bot parity:** `bot_executor.py` (`eval_metric_verbose`) mirrors the same breach-bar rule for live `current_price` crosses, in two blocks — `value` (cross vs fixed threshold) and `compare_sma/ema/rsi`. For `current_price` it uses the currently-forming bar's OPEN (`rhs_bars[-1]['open']`, or a freshly fetched bar in the value block) vs the CURRENT comparator, and the live `last` quote must land on the other side. Indicator-LHS crosses still use previous-completed-bar semantics. `compare_price`/`compare_vwap` have no cross handling at all (fall through to `_compare`).
