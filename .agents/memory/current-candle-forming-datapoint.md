---
name: Current Candle forming-datapoint & restore
description: Which datapoints are valid for the entry (forming) candle in the options Custom-Builder, and its separate template-restore path.
---

# Current Candle ("current_candle") metric — forming candle rules

The Custom-Builder "Current Candle" left side refers to the **forming candle at entry**
(`_resolve_candle(..., which='current')` picks the last bar with ts ≤ entry ts). At entry
the candle has NOT closed yet.

**Rule:** only **Open** and **Current Price** are knowable at entry. High/Low/Close come
from the *completed* minute bar (their values finalize at :59 of the minute) → using them
is **look-ahead bias**. The datapoint dropdown must offer only `open` + `price`; collect,
summary, and restore all default the left datapoint to `price`, and restore maps legacy
`high/low/close/current/current_price` → `price`.

**Why:** user flagged "if current candle is entry, how can close be an option?" — correct;
those are future data for a still-forming candle.

# Restore path is separate

`applyPriceConditions()` restores generic conditions via left/right/operator/comparator
fields. `current_candle` uses its **own `cc*` controls** and needs a dedicated restore
branch (set metric → `updateConditionFields` → populate `ccComparator`, `ccLeft*`, and
when `compare_prev_candle` also `ccOperator`, `ccLeftDatapoint`, `ccRight*`, `ccThreshold`,
then `updateCcRightVisibility` + `updateOptConditionSummary`). Also guard
`updateRightSideVisibility()` to force-hide the generic operator row + "Right Side (To this)"
whenever metric is `current_candle` (the dedicated orange panel replaces them).

**How to apply:** any new cc* field must be added in THREE places in
`static/js/backtester-script.js` — the panel render, `collectPriceConditions()`, and the
`current_candle` branch of `applyPriceConditions()` — or save/load silently drifts.

# "Second" candles live on a 10-second grid

Any Custom-Builder candle with `candle_type === 'second'` may only use a multiplier that
is a whole number of 10s (10, 20, 30, …), so sub-minute candles align with the 10-second
underlying feed. The UI snaps the multiplier (step/min=10 + round) on change, on render,
and on restore, and `collectPriceConditions()` re-snaps as a final guard. Polygon *does*
serve arbitrary second aggregates (e.g. a real 30-second bar), so a 30s bar's Open is a
genuine 30-second bar open — not three 10s bars stitched client-side.

# "Current price" left datapoint doesn't need the current candle

In `_eval_current_candle_condition` (options engine), when comparator is
`compare_prev_candle`, the left datapoint is the live current price, and left color is
`either`, the configured current-candle bar is irrelevant — a missing sub-minute bar must
NOT abort with "No current candle data". Guard the early bail with a `needs_cur_candle`
check (only require the bar for color-only mode, a candle-datapoint left, or a green/red
left color filter).
