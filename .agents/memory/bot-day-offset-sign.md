---
name: Bot day-offset sign convention
description: How "days ago" is encoded in bot day selectors and candle lookups
---

Bot day/session offset selectors use NEGATIVE integers as "days ago": `0`=today,
`-1`=yesterday, `-2`=2 days ago, … (see the metric `DAY_OPTS` in
`static/js/bot-script.js`). The backend candle helpers (`_live_candle_pair`,
`_session_intraday_bars` in `bot_executor.py`) also expect negative offsets and
index prior sessions as `len(dates) - 1 + day`.

**Why:** A new "$ Distance from Previous Candle" strike selector shipped a day
dropdown using POSITIVE values (0,1,2…). With positive `day`, the intraday index
went out of range and the daily branch didn't shift back, so strike selection
silently skipped trades for any non-zero day. Fixed by making the selector use
negative values to match the existing convention.

**How to apply:** Any new bot control that picks a prior session must emit
negative offsets (or the backend must `-abs(day)`). Verify the sign end-to-end
whenever adding a "days ago" selector — the failure is silent (no data / skip).
