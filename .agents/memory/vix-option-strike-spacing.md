---
name: VIX option strike spacing
description: VIX options use half-dollar strikes and Polygon index bars require the I:VIX ticker.
---

VIX option strike selection must use a $0.50 increment, while VIX underlying bar requests must use `I:VIX`.

**Why:** VIX options are listed in $0.50 strike intervals; treating VIX like a generic index rounds valid leg distances to the wrong strike and can prevent or invalidate spreads.

**How to apply:** Use the shared symbol increment helper anywhere strikes are rounded, swept, or delta-searched. Keep the UI leg-to-leg dollar distance input compatible with 0.5 increments.