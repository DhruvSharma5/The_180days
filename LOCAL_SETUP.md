# 180Days - Local Setup

## Prerequisites

- Python 3.13
- Node.js 20 or newer with Corepack
- A local MongoDB instance, or a separately configured MongoDB Atlas database

## Backend

```bash
cd backend
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `backend/.env` with a local MongoDB URL, a unique local `DB_NAME`, and a
random `JWT_SECRET`. Keep this file private and out of Git. Do not point automated
tests at a production Atlas database.

Start the API:

```bash
cd backend
.venv/bin/uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

API docs: <http://localhost:8001/docs>

## Frontend

```bash
corepack yarn@1.22.22 --cwd frontend install --frozen-lockfile
corepack yarn@1.22.22 --cwd frontend dev
```

The frontend opens at <http://localhost:3000>. Vite proxies `/api/*` to the
backend at port 8001. Set `VITE_API_PROXY_TARGET` to use a different local API
port without changing the source configuration.
Copy `frontend/.env.example` to `frontend/.env.local` if you need to override
that proxy target; this file is ignored by Git.

## Email in local development

Email sending is intentionally disabled unless `RESEND_API_KEY`, `FROM_EMAIL`,
and a public HTTPS `APP_URL` are configured. Local signup still works, but no
verification or password-reset email is sent. Resend configuration is documented
in [DEPLOYMENT.md](./DEPLOYMENT.md).

## Tests and builds

With the API running against an isolated local database:

```bash
cd backend
MONGO_TEST_URL=mongodb://127.0.0.1:27017 python -m pytest -n 0 tests -q
```

The driver smoke test creates and removes only a uniquely named temporary
collection in `days180_driver_tests`. It refuses non-loopback MongoDB hosts.
The rest of the HTTP suite uses the database configured for the running API.

Build the production frontend:

```bash
corepack yarn@1.22.22 --cwd frontend build
```

## Seed data caution

`backend/seed.py` is not safe to run against an existing or production database:
it replaces roadmap collections, refreshes the admin role, and resets the demo
account's journey data. Do not run it against Atlas or any database with user data
without first reviewing the script, taking a backup, and explicitly approving the
changes. The application can load its bundled roadmap when the roadmap collections
are empty.

To create a first admin account without changing an existing account, set
`ADMIN_EMAIL` and `ADMIN_PASSWORD` in the private environment and run:

```bash
cd backend
.venv/bin/python provision_admin.py --confirm
```

The helper only inserts a new user, refuses to change an existing non-admin user,
and is a no-op if the specified admin account already exists.
For production, run it only from a trusted machine with production connection
values supplied privately; do not use the destructive seed script as an
admin-provisioning shortcut.

## Journey start date

Users may choose today or a future date. A future journey remains at Day 0, and
tasks stay locked until its start date.
