This repository now includes migration groundwork, but it does not yet ship a generated baseline migration.

Recommended next steps once dependencies are installed:

1. Install project dependencies so `flask_migrate` is available.
2. Export `FLASK_APP=main.py`.
3. Disable implicit schema creation in environments that will use migrations:
   `AUTO_CREATE_SCHEMA=0`
4. Initialize Alembic metadata once:
   `flask db init`
5. Generate and review a baseline migration from the current models:
   `flask db migrate -m "baseline schema"`
6. Apply it with:
   `flask db upgrade`

Until that baseline is created and reviewed, the app still relies on `db.create_all()` by default for backward compatibility.
