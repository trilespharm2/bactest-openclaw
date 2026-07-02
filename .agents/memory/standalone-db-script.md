---
name: Standalone DB-backed scripts
description: How to run one-off Python scripts that read the app DB without booting main.py
---

Running a throwaway script that needs the DB (e.g. reading BotConfig creds):

- `db` lives in `database.py`; bind it to a minimal `Flask()` with
  `SQLALCHEMY_DATABASE_URI = os.environ['DATABASE_URL']` + `db.init_app(app)`.
  Do NOT import `main.py` (starts schedulers, heavy).
- Gotcha: model classes are split — most are in `models.py`, but `User` is in
  `main.py`. Any ORM query triggers mapper configuration across ALL models, and
  relationships to `User` fail with `InvalidRequestError: ... failed to locate a
  name ('User')` unless `main.py` is imported.
  **Fix:** bypass the ORM and use raw SQL via `db.session.execute(text(...))`.
- Encryption: with `ENCRYPTION_KEY` unset, `models.get_encryption_key()` derives
  a stable key from `FLASK_SECRET_KEY` (fallback `dev-only-change-me`). Same
  container env => `models.decrypt_value()` works on stored creds.
- Bot market data in paper mode uses the paper_live key -> LIVE base (sandbox
  timesales are delayed/simulated). Read-only market-data reads touch no account.
