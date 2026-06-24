---
name: /tmp/logs are frozen snapshots
description: Why tailing /tmp/logs/*.log after a restart shows stale output
---

# /tmp/logs/*.log are point-in-time snapshots, not live files

The `/tmp/logs/<workflow>_<timestamp>.log` files are written by the
`refresh_all_logs` tool at the moment it runs. They are NOT continuously
appended by the running workflow/gunicorn.

**Why:** Tailing/grepping the same snapshot file after a code change + restart
shows the OLD content and looks like the change "didn't take", wasting
verification cycles.

**How to apply:** To see fresh output after a restart or edit, call
`refresh_all_logs` again (it writes a new timestamped file), then read THAT
file. Don't re-`tail` a stale snapshot to confirm new behavior.
