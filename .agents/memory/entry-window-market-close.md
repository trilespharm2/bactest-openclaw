---
name: Entry window excludes the market close
description: Why the options entry-window scan must drop the 16:00 closing-bell bar, and the HH:MM vs HH:MM:SS format trap.
---

# No entries at/after the 16:00 ET close

The options entry-window scan must never treat the closing-bell bar (16:00 ET) or
anything after it as a valid entry — there is no session time left to hold. The last
valid entry is 15:59:50 (10-second mode) or 15:59:00 (1-minute mode).

**Why:** users set the entry window end to `entry_time_max = 16:00:00`; the candidate
filter used `start <= t <= end` (inclusive), so a bar stamped exactly `16:00:00` was
accepted and trades appeared with ENTRY_TIME 16:00:00. The index feed (I:SPX) even has
sparse bars past the close (16:00:30, 16:01:00, …) that must also be excluded.

**How to apply:** in the candidate-bar loop, skip any bar whose time is at/after the
close before applying the window test.

# Bar-time format trap: HH:MM vs HH:MM:SS

1-minute underlying bars carry `time` as `'HH:MM'`; 10-second (and other sub-minute)
bars carry `'HH:MM:SS'`. Lexical comparisons mixing the two silently break
(`'16:00' >= '16:00:00'` is False). Always compare on the `HH:MM` prefix (`bar['time'][:5]`)
for session-boundary checks so both formats behave identically.
