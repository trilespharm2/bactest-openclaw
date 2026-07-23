---
name: Indicator entry vs exit phase semantics
description: Lookahead rules for entry vs exit indicator lookups in both backtest engines
---

# Indicator entry vs exit phase semantics

**Rule:** Entry-condition indicator lookups at bar T must use data through bar T-1's close (entries fill at T's open — T's close is unknowable). Exit-signal evaluation at bar T legitimately uses T's own close (exits fill at bar close). Both engines thread a phase flag:

- Stock engine: `at_bar_close` param on `check_custom_condition` → `_compute_indicator` → `_get_price_series`/`_build_vwap_frame` (`include_current`) and `_build_perbar_min_indicator` (`shifted=not at_bar_close`; perbar cache key includes the flag). Entry fills use candle open (was mid `(H+L)/2`).
- Options engine: `at_bar_close` param on `evaluate_price_conditions_with_cache` sets local `_strict = not at_bar_close`, applied to every `find_closest_indicator_value(..., strictly_before=_strict)` and the MACD sorted-timestamp filters. `find_closest_indicator_value` has a `strictly_before` param. Daily `get_indicator_value_for_date` shifts day_offset 0 → -1 (today's daily close unknown intraday) regardless of phase.

**Why:** Original code fed bar T's close-based RSI/SMA/EMA/MACD/VWAP into entry decisions filling at T's open — forward-looking, inflating backtest results. First fix applied strict-before everywhere, which lagged exit signals one bar (caught in code review) — hence the phase flag.

**How to apply:** Any new indicator lookup path must decide its phase: entry → strict before / shifted; exit-at-close → include current bar. Cross detection must keep prev/current pairs consistent per phase (entry: T-2/T-1; exit: T-1/T). Within-bar "Current Price" cross semantics (bar's open vs comparator) are known at decision time — never shift those. Verified: perbar cache == raw path exactly in both phases; local Wilder RSI matches Polygon RSI API to ~0.001 mean diff during regular hours (after-hours drift is price rounding, not methodology).
