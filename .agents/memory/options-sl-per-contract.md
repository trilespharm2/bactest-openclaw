---
name: Options engine stop-loss/TP dollar units
description: stop_loss_dollar / take_profit_dollar are PER-CONTRACT dollars, converted to premium points via /100
---

The options backtester consumes `stop_loss_dollar` (and `take_profit_dollar`) as **dollars per contract**, converted to premium points: `sl_met = pnl_points <= -stop_loss_dollar / 100`. It also requires **2 consecutive bars** breaching before firing.

**Why:** Passing a per-trade dollar amount (e.g. 500 for "$500 per trade" on an 11-contract $5-wide spread) means 5.00 premium points — beyond max loss — so the stop silently never fires and every exit is EXPIRATION.

**How to apply:** For a target per-trade stop, divide by contract count: $550/trade at 11x → `stop_loss_dollar: 50`. Verify stops actually fired by checking `exit_reason == STOP_LOSS` in the trade log.

Also learned (last-minute 0DTE credit spreads, 15:59 entry): tight stops whipsaw — they convert would-be expiration winners into stopped losses and lower WR more than they help W/L. Raising `net_premium_min` is the effective W/L lever (bigger credits, same loss structure).
