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
