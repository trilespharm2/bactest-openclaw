---
name: Options current-price lookahead guard
description: sub-minute current-price lookups must never fall back to a future bar
---

Rule: `_current_underlying_price` (and any at/before-entry candle lookup) must return
`None` when no bar exists at or before the entry timestamp — never fall back to
`bars[0]` (the first, future bar).

**Why:** Using the first available bar when nothing precedes entry silently injects
future data into current-candle color/value decisions and strike anchoring, breaking
the backtest's no-lookahead guarantee. Caught in code review of the 10-second /
current-candle features.

**How to apply:** Any new sub-minute or candle helper that resolves "price/candle at
entry" must fail loudly (return None → skip the day/condition) rather than substitute
a later bar. Same principle as the options expiration-close fix (no silent fallback).
