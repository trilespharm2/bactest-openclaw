---
name: Stock backtest resilience
description: Why stock backtests run as detached subprocesses and how their status must be resolved
---

Stock backtests must run as a fully **detached subprocess** (`subprocess.Popen(..., start_new_session=True)`) launched from the start endpoint — the same resilience model options backtests use — NOT inline in a worker thread.

**Why:** When run in-thread inside the gunicorn worker, a worker restart / `--timeout` kill / page close killed the job, and startup cleanup blindly flipped every `status='running'` row to failed. Users saw backtests "fail" just by closing the tab.

**How to apply:**
- The durable source of truth is the on-disk metadata file (`stock_backtest_v3_results/{id}.json`) plus process liveness via a separate PID sidecar (`pid_{id}.json`). Never decide status from whether *this* worker holds the job in memory — there are multiple workers and restarts.
- Resolve status with: file says success/completed → completed; error/failed → failed; running + PID alive → running; running + PID dead → failed.
- Startup orphan cleanup must NOT fail a running stock row whose PID is still alive (or whose file already shows completed). Only options rows (worker-tied) are safe to blind-fail.
- Any endpoint that gates on "is a backtest running" (status, list, 429 concurrency check, /backtest/running, cancel) must reconcile from disk+PID, not in-memory dicts.
- The PID lives in a **separate** sidecar file, never inside the results metadata file, to avoid the parent clobbering results the child subprocess may have already written.
