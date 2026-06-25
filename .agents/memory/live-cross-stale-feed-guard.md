---
name: Live cross stale-feed guard
description: Why live MA-cross detection must skip (not latch) when the intraday bar feed lags behind the live price.
---

# Live cross stale-feed guard

The LIVE bot's `current_price` MA-cross compares a FRESH live price (Tradier
`/markets/quotes`) against an SMA built from intraday bars (Tradier
`/markets/timesales`). Those two feeds can desync: right after a worker
restart the timesales feed intermittently lags (observed ~15 min stale,
913–914s) while quotes stay current.

**The failure:** a fresh price vs a stale MA latches a phantom side
("above"), then silently swallows the real cross when the feed catches up —
e.g. real 2:32 PM and 2:54 PM cross-downs never fired.

**The rule:** in the intraday cross path, if the last FINISHED bar is older
than `max(interval_secs*5, 300s)`, return None (skip) WITHOUT touching the
persistent latch. The next fresh eval re-syncs the side and fires any cross
that completed during the gap.

**Why:** never act on, and never record state from, a price/MA comparison
where the two sides come from feeds at different points in time. Skipping
preserves the latch so detection self-heals; mutating it on stale data
corrupts the side and drops signals.

**How to apply:** measure lag from the true latest finished bar
(`completed[-1]`, i.e. after dropping the forming bar but BEFORE applying
`rightLookback`) — not from the lookback-offset slice, or a non-zero
rightLookback gets mistaken for feed lag and causes false skips. Keep this
guard alongside the existing overnight-gap guard (no finished bar in the
current session yet).
