---
name: Bot metric form dual visibility
description: The bot step-config form controls field visibility in TWO places; new fields must be handled in both.
---

Any field row in the bot's metric step config (static/js/bot-script.js) has its
visibility decided in **two** independent places, and a new field must be wired
into **both** or it silently stays hidden on interactive use:

1. **Render-time** — `sbStepConfigHTML(step)` sets each row's initial inline
   `style="...display:none"` when the form is first built.
2. **Runtime toggle** — `sbSyncMetricForm()` re-shows/hides rows via `_show(id, cond)`
   whenever the user changes metric / comparator / operator / day WITHOUT a full
   re-render. This overrides the render-time default.

**Why:** Changing the comparator dropdown fires `sbCompareTypeChange()` →
`sbSyncMetricForm()`, not a full re-render, so render-time visibility alone is
not enough. A field set visible only at render time will not appear when the
user switches into the mode that needs it.

**How to apply:** When adding a form row, add its show/hide condition in BOTH
`sbStepConfigHTML` (initial `style`) and `sbSyncMetricForm` (`_show(...)`). The
current-candle previous-candle side reuses `sbcRightDay`/`sbcRightInterval`
(shared with compare_price) plus its own `sbcCcRightMultiplier`; the shared rows
must be gated on `(compare_price) || ccPrev` in both spots.
