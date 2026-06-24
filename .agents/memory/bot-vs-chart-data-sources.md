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

**Why:** user repeatedly suspected wrong/Polygon data; the real cause is intra-bar tick vs candle-close semantics. Fix path = change cross DETECTION (e.g. confirm on candle close), not the data source.
