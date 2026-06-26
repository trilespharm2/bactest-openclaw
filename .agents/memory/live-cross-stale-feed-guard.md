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
usually already correct. RESOLVED decision: in paper mode, strike selection
(expirations/chains/underlying quote) AND profit/loss filters (PnL quotes) must
also use live market creds for parity — these read paths in eval_condition /
exec_open_position / exec_close_position take `mkt_api_key`/`mkt_base_url`
params and use `_mkey = mkt_api_key or api_key` / `_murl = mkt_base_url or
base_url`. CRITICAL boundary: order placement (POST /accounts/{id}/orders) and
account reads (positions/orders) must STAY on `api_key`/`base_url` (sandbox in
paper mode). Live creds must NEVER place orders in paper mode.

**Overnight-gap / session-rollover guard:** the edge-latch (`_cross_check_and_flip`,
persisted in bot_cross_state.json) records the last side ('above'/'below') and
fires on a flip. For INTRADAY crosses this side must NOT carry across the
overnight gap: a side latched 'above' yesterday + price opening 'below' a
falling MA today = a phantom cross-down on the first morning tick (observed:
both prev finished candle AND live price below the SMA, yet it fired because
latch was=above from the prior session). The plain "skip while last finished
bar is still yesterday's" guard is NOT enough — once today's first finished bar
exists it compares against yesterday's latch. Fix: store a `session` (ET
trading date) on each latch entry; when stored session != current session,
re-arm (treat prev_side as None → record side WITHOUT firing), exactly like a
first observation/after-restart. Pass session only for intraday (intv!='day');
daily crosses compare consecutive days legitimately so session=None there.
Legacy entries lacking `session` re-arm once on upgrade.

**Secondary guard (defense in depth):** even on the correct live feed, quotes
and timesales can briefly desync right after a worker restart (timesales lags
while quotes stay current). When the last finished bar is stale (older than
~max(interval*5, 300s)), skip the cross and return None WITHOUT touching the
persisted latch, so the next fresh tick re-syncs the side and fires any cross
that completed during the gap. Measure lag from the true latest finished bar
(after dropping the forming bar, before applying rightLookback) so a non-zero
lookback isn't mistaken for feed lag.
