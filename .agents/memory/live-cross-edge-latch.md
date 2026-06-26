---
name: Live bot cross detection must be edge-latched
description: Why live cross signals fire once per crossing via a persisted side-latch, not a per-bar gate
---

# Live cross detection: edge-latch, not per-tick gate

A live "X crosses_above/below Y" signal must fire ONCE per real crossing and not
again until the value crosses back. The earlier approach (`live >= SMA AND
prev_candle_open < SMA`) was NOT edge-latched: the bot polls ~every 30s, and
during one crossing several consecutive candles can open on the far side, so a
single cross produced multiple option orders ("continuous repeat"), and late
sandbox fills made those orders appear at times when no cross existed.

**The rule:** persist the last observed side ('above'/'below') per
strategy+condition. `crosses_above` fires only on a flip prev=='below' →
cur=='above' (symmetric for below). `cur_side` comes from the LIVE price vs the
comparator computed through the last FINISHED candle (chart-aligned) — this keeps
entries intra-bar while firing exactly once. On a never-seen key (first run / after
restart) record the side WITHOUT firing, so a value already past the line can't
trigger a phantom entry — wait for the next genuine crossing.

**Why:** user requirement — fire once at the exact cross instant; if it doesn't
fill, do NOT repeat, wait for the next cross.

**Intra-bar dead-zone (anti-whipsaw + anti-latch-recovery):** when the LHS is
the still-FORMING live price (metric=='current_price'), require it to clear the
comparator by a fixed buffer before it counts as a side — `above` if
`lhs>=rhs+buf`, `below` if `lhs<=rhs-buf`, else `cur_side=None`. Buffer is $1
for index symbols only (`_cross_index_buffer`; ~0.01% on SPX, meaningless on
low-priced stocks) and is NEVER applied to a finished bar close. `None` means
HOLD the latch: `_cross_check_and_flip` returns the stored side but does not
fire or overwrite. **Why:** a live tick grazing a steeply-sloped MA by a
fraction of a point (observed: 0.39 pt) was flipping the latch — firing a
phantom cross AND arming a phantom opposite "recovery" cross on the next tick.
No candle ever closed across the MA, so on a candle-close chart no cross
existed. Holding the latch inside the dead-zone kills both the phantom flip and
the recovery in one mechanism.

**How to apply:** the check-and-set MUST be one atomic critical section (APScheduler
runs strategies on a thread pool; a split get-then-set lets two concurrent evals
both read the opposite side and both fire — TOCTOU). State lives in a gitignored
JSON store keyed by strategy_id + symbol + a hash of the condition cfg excluding
the operator (so up/down on the same series share one side truth). `strategy_id`
must be threaded into the metric evaluator; dry-run/preview passes None and stays
stateless. Single gunicorn worker today, so a thread lock suffices; if it ever runs
multi-process, move the latch to a DB row with an atomic update.
