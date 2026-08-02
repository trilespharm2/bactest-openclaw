#!/usr/bin/env bash
# Keep task merges fast and non-interactive. The application uses SQLite and
# initializes its schema at startup, so no separate migration command is needed.
set -euo pipefail

python -m compileall -q \
  main.py \
  bot_executor.py \
  scanner_scheduler.py \
  options_backtester_v2_3_3_5.py