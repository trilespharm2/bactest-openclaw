---
name: Switchable bar resolution (seconds vs minutes)
description: Rules for changing base bar resolution mid-session in sim trading and for seconds-mode options backtests.
---

## Replay position is a timestamp, not an index

When the base bar resolution changes (minutes ⇄ N-second bars), the base cache changes
cardinality AND date window, so any stored bar index becomes meaningless.

**Rule:** persist and restore the replay position as a wall-clock timestamp; derive the
index as `findIndex(bar.timestamp > anchor)` after the new bars load. Keep the saved
index only as a fallback for sessions written before timestamps were stored.

**Why:** restoring by index after a resolution switch (or after a narrowed seconds
window) silently jumps the session to an unrelated moment, usually end-of-data.

**How to apply:** any code path that reloads base bars — resolution change, session
restore, symbol change — must pass the anchor timestamp, not the old index.

## Seconds data must be fetched over a narrowed window

Seconds bars are fetched for a few days around the day being replayed, never the whole
session range. Day caps by interval: 1s→1, ≤5s→2, ≤15s→3, else 5. **The same schedule
must exist on the server**, both for the sim-trading bars endpoint and the options
backtest start endpoint — a browser-only cap is bypassed by direct API calls and by
re-running saved configs.

Consequence: a narrowed window can start after the session's trading-start date, so the
"trading start" index must clamp to 0 instead of being treated as out of range.

## One grid for underlying and options

Whatever seconds interval is selected, option/leg bars must be fetched at that same
interval, including every fallback path (coarser-bar retries, strike-adjustment refetch,
open-position restore). Mixing a 1-second underlying with 10-second option bars gives
fills and TP/SL checks that never line up.

Fallback chains must only step to resolutions COARSER than the one already tried.

## Legacy flag

The options backtester's old boolean "10-second data" flag maps to a 10-second interval.
Keep reading it when the newer interval field is absent so saved configs keep running.
