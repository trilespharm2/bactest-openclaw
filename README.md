# BacktestPro

BacktestPro is a Flask-based SaaS web app for stock and options backtesting, screening, and subscription management.

## Local setup

1. Create a Python 3.11 environment.
2. Install dependencies with `uv sync` or `pip install -e .`.
3. Copy `.env.example` to `.env` and set at least:
   `FLASK_SECRET_KEY`, `DATABASE_URL`, and `POLYGON_API_KEY`.
4. Start the app with `python3 main.py`.
5. Open `http://localhost:5000`.

If `DATABASE_URL` is omitted, the app falls back to `instance/backtestpro.db` for local development.

## Production notes

Run the app behind a real WSGI server and reverse proxy. A minimal entrypoint is provided in `wsgi.py`.

Recommended environment:

- `FLASK_SECRET_KEY` must be set.
- `ENCRYPTION_KEY` should be set explicitly for long-lived environments.
- `SESSION_COOKIE_SECURE=1` in HTTPS environments.
- `CORS_ORIGINS` should be set only if the frontend is on a separate origin.
- `AUTO_CREATE_SCHEMA=0` is recommended once managed migrations are in place.
- `ENABLE_SCHEDULER=1` should be enabled only for the process that is intended to run scheduled jobs.
- `STRIPE_*`, `MAILTRAP_*`, and `GOOGLE_OAUTH_*` are optional but required for their related features.
- If Stripe billing is enabled, set `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET`.

Example production command once a WSGI server is installed:

```bash
gunicorn --bind 0.0.0.0:5000 wsgi:app
```

Operational endpoints:

- `GET /api/health/live` for a lightweight liveness probe.
- `GET /api/health` for a readiness-style check that also verifies database connectivity.

## Database migrations

This pass adds Flask-Migrate wiring plus a migration staging directory at [migrations/README.md](/tmp/bactest-review-moz0tR/migrations/README.md). The repo still defaults to `db.create_all()` for backward compatibility, but the intended path forward is:

```bash
export FLASK_APP=main.py
export AUTO_CREATE_SCHEMA=0
flask db init
flask db migrate -m "baseline schema"
flask db upgrade
```

The baseline migration is not generated yet in this pass because it should be created and reviewed against the live deployment state before adoption.

## Automated tests

A small `unittest` suite now covers low-risk, high-value behavior:

- auth registration/login/token-loading flows
- health and liveness endpoints
- selected model serialization and masking helpers

Run it with:

```bash
python3 -m unittest discover -s tests
```

## Stripe webhook setup

Stripe subscription entitlements now update server-side from verified webhook events. The frontend confirmation flow still exists as a fallback sync path, but it should not be treated as the primary source of truth.

Configure Stripe to send at least these events to `POST /api/stripe/webhook` and set the endpoint signing secret in `STRIPE_WEBHOOK_SECRET`:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

For local testing with the Stripe CLI:

```bash
stripe listen --forward-to localhost:5000/api/stripe/webhook
```

Then copy the reported signing secret into `STRIPE_WEBHOOK_SECRET`.

## Validation

Useful local checks:

```bash
python3 -m unittest discover -s tests
python3 -m py_compile main.py models.py google_auth.py scanner_scheduler.py wsgi.py
python3 -m compileall .
```

## Current production gaps

This repo is improved, but it is not fully production-ready yet. Remaining blockers:

- The new test suite is intentionally narrow; billing, backtest execution, scheduler jobs, and third-party integrations still lack reliable automated coverage.
- Stripe billing now has basic webhook coverage, but this is still not a full production billing test matrix. Replay handling, event persistence/auditing, and richer failure recovery are still missing.
- Managed migrations are only wired up. A reviewed baseline Alembic migration still needs to be generated and adopted, and `AUTO_CREATE_SCHEMA` should then be disabled outside development.
- `main.py` is a very large monolith, which increases review and regression risk.
- Sensitive values such as user Polygon API keys are still stored directly in the `users` table instead of using the encryption helpers.
- There is still no structured application logging, metrics, or centralized error reporting for production operations.
- Large generated result sets and assets are already committed in the repository history.

## Admin bootstrap

For first-time setup, you can create an admin user from environment variables:

- `ADMIN_BOOTSTRAP_ENABLED=1`
- `ADMIN_EMAIL=you@example.com`
- `ADMIN_PASSWORD=` a strong password (minimum 12 characters)
- `ADMIN_NAME=Your Name`

On startup, the app will create that admin user if it does not already exist, or promote the existing matching user to admin. After first setup, set `ADMIN_BOOTSTRAP_ENABLED=0`.
