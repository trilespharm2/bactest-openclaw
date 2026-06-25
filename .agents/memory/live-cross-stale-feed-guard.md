---
name: Live bot market-data vs order credentials
description: In the live bot, market-data fetches must use the live market-data key, never the order (sandbox) creds, or paper strategies compare live price vs delayed MA.
---

# Live bot: market-data creds vs order creds

**Rule:** every market-data fetch in the live bot (quotes, timesales bars,
daily history, option chains/expirations used for indicators) must use the
market-data credentials — `_mkey`/`_murl`, which the scheduler points at the
LIVE Tradier key/base — never the order credentials (`api_key`/`base_url`).

**Why:** a paper strategy's order creds are the Tradier SANDBOX, which serves
~15-min DELAYED market data. If one side of an MA-cross (the live price) uses
live creds and the other side (the SMA/EMA/RSI/VWAP/MACD comparator bars) uses
order creds, the bot compares a fresh price against a stale moving average.
That desync silently latches the wrong side and drops real crosses, and trips
any staleness guard every tick. Order creds are for accounts/orders only.

**How to apply:** in metric/indicator evaluation, route ALL market-data calls
through the market-data creds. Watch the comparator (right-hand-side) paths —
they are the easy ones to miss because the live-price (left-hand-side) path is
usually already correct. Order/position/PnL paths that *also* read quotes in
paper mode will likewise see delayed data; decide explicitly whether strike
selection and PnL filters need live parity.

**Secondary guard (defense in depth):** even on the correct live feed, quotes
and timesales can briefly desync right after a worker restart (timesales lags
while quotes stay current). When the last finished bar is stale (older than
~max(interval*5, 300s)), skip the cross and return None WITHOUT touching the
persisted latch, so the next fresh tick re-syncs the side and fires any cross
that completed during the gap. Measure lag from the true latest finished bar
(after dropping the forming bar, before applying rightLookback) so a non-zero
lookback isn't mistaken for feed lag.
