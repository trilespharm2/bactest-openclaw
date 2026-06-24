---
name: Bot vs chart data sources & cross mismatch
description: Which feed each chart/feature uses, and why bot cross entries don't match the bot-page candle chart even though both are Tradier.
---

# Data sources
- **Bot executor (live decisions)** — 100% Tradier: `/markets/timesales`, `/markets/quotes`, options chains, orders. No Polygon/yfinance.
- **Bot-page live/replay chart** (`bot-script.js` → `GET /api/bot/tradier/bars`) — Tradier 1-min timesales, **plain symbol** (`SPX`, not `$SPX.X`), live API key. SAME feed as the bot.
- **Simulated-trading page** (`simulated-trading-script.js` → `POST /api/simulated-trading/bars`) — SPY from local Parquet cache; SPX/indexes from **Polygon `I:SPX`** via `_SIM_INDEX_MAP`. DIFFERENT feed — do NOT use it to validate bot entries.

# Screenshot ID tip
Bot-page chart shows `N bars | +M` and a `Speed: Xs` control. If you see those, it's the bot chart (Tradier), not the sim-trading page (Polygon).

# Why bot cross entries don't match the bot-page candle chart
Not a feed difference (both Tradier; SMA(20) on any completed candle is identical). It's **methodology**:
- Bot uses the **live quote `last`** (single intra-minute tick) as current price, an SMA(20) that **includes the still-forming bar**, and a **previous-bar-OPEN** cross gate, evaluated on the scheduler tick (~30s).
- Chart draws **candle closes** + SMA of 20 closes.
- Result: a transient tick poking across the SMA mid-minute (while the prior bar opened on the far side) fires a "cross" the candle chart never shows. Classic whipsaw false-positive near the SMA.

**Why:** user repeatedly suspected wrong/Polygon data; the real cause is the cross DETECTION methodology, not the data source.

# Root cause confirmed + fix (current_price indicator crosses)
Proven against live Tradier data: bot fired a cross-UP at a candle whose previous FINISHED candle opened ABOVE the SMA (no cross). Root cause in the `compare_sma/ema/rsi` cross path for `metric=current_price`:
- Comparator MA was `_compute_bar_metric(..., rhs_bars, day=0)` whose last element can be the **in-progress (forming) bar**, and the "previous candle" gate used `rhs_bars[-2]`. So whether Tradier had emitted a partial current-minute bar determined which candle counted as "previous" (off-by-one) and mixed a partial bar into the MA → diverged from the chart, which plots FINISHED candles only.

**Fix (keep LIVE intra-bar entries — user explicitly does NOT want candle-close confirmation):** added `_drop_forming_bar(bars, interval)` (strips trailing bar only if its start time is inside the still-open interval bucket for now()). In the current_price cross path, anchor the comparator MA AND the previous-candle OPEN to FINISHED candles only; keep `lhs`=live quote as the value that crosses. So it fires only when the last finished candle opened on the far side AND live price is now across — intra-bar, chart-aligned.

**How to apply:** any future "bot entry doesn't match chart" report for indicator crosses → check forming-bar inclusion + which bar is "previous", not the feed. Non-current_price (indicator-vs-indicator) and value-threshold crosses still include the forming bar (left unchanged — revisit if reported).
