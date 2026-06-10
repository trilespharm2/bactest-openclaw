---
name: Backtest parameter-sweep harness
description: How to run fast TP/SL/entry parameter sweeps over the stock engine, plus an environment gotcha about background processes.
---

# Running parameter sweeps on the stock backtester engine

**Goal:** test many TP/SL/entry/max_days combos over real intraday data efficiently.

## Method that works
- Fetch the intraday data ONCE via `BacktesterEngine.fetch_data(symbol, start, end, 1, 'minute')` and pickle it (e.g. SPX→Polygon ticker `I:SPX`, ~290k 1-min rows for 3 yrs). Reuse the same DataFrame across all combos — the engine only mutates it by adding a `date` column (idempotent), so **no `df.copy()` needed** (copying ×N workers causes OOM).
- Build engine without API: `eng = BacktesterEngine.__new__(BacktesterEngine); eng.client=None; eng.results=[]; eng.decision_log=[]`. Set `eng.config = <dict>` then call `eng._backtest_symbol_intraday(symbol, df)` → `(trades, decision_log)`. Each trade dict has `pnl`, `pnl_pct`, `exit_reason`, `entry_time`.
- Wrap each run in `contextlib.redirect_stdout(io.StringIO())` — the engine prints a line per ENTRY/EXIT and floods output.
- Parallelize with `multiprocessing.Pool(initializer=...)` loading the pickle per worker.

## Performance
- One full 3-yr SPX run is ~28-35s regardless of position count; the bottleneck is the per-day `_bars_compact` (`iterrows` over 390 candles ×2 ×~750 days building decision-log bars), NOT position accumulation. There is no flag to disable decision-log building.

## Environment gotcha (important)
- **Background processes (`nohup ... &`) get killed when the bash tool call returns.** A backgrounded sweep dies silently with empty stderr — it is NOT OOM. Run sweeps in the FOREGROUND within the ~120s bash timeout, chunked into batches (e.g. ~8-10 combos × 4 workers ≈ 60-90s per call). Print results with `flush=True` so partial output survives a timeout kill.
