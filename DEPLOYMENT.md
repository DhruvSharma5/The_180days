# 180Days - Free Vercel Deployment

This deployment uses one Vercel project for the React static frontend and the
FastAPI serverless backend. The browser and API share an origin, so the existing
httpOnly `SameSite=Lax` session cookie works without third-party cookies or a
cross-origin API URL. Vercel does not host MongoDB; the app connects to the
existing MongoDB Atlas M0 cluster.

## Free-tier scope and limits

- Use Vercel's free Hobby plan, MongoDB Atlas M0, and Resend Free only. Do not
  enable a paid plan, paid add-on, or usage-based billing. Hobby usage may pause
  when an allowance is exhausted instead of charging overages.
- Vercel Hobby schedules have a 15-minute timing window. The daily reminder
  schedule is configured for 18:30 Asia/Kolkata, but it is not guaranteed to run
  at exactly 18:30.
- The reminder handler has a 60-second function limit and Vercel path schedules
  do not retry failed runs. Resend idempotency keys protect a user's reminder
  from duplicate sends for the same local date when a run is repeated.
- Resend Free includes up to 3,000 emails/month and 100/day. Provider limits,
  recipient delivery policies, and Vercel function limits still apply.
- Resend requires a verified domain you own. Domain verification is available on
  its free plan, but buying a domain is not free. Without an owned, verified
  domain, production OTP, password-reset, and reminder delivery cannot be
  enabled. Do not use a test sender for general user delivery.
- Vercel Hobby is intended for personal, non-commercial use. Check the current
  Vercel plan terms for your use case; this guide does not enable or recommend a
  paid upgrade.

## Before deploying

1. Put the project in a GitHub repository. The current workspace has no Git
   repository or remote configured, so it cannot be pushed from this workspace
   yet.
2. In Atlas, create a database user limited to read/write access for the
   `180days` database. Use the cluster's TLS connection string as the private
   `MONGO_URL` value. URL-encode special characters in the database user's
   password.
3. Configure Atlas Network Access for the Vercel deployment. Vercel Hobby does
   not provide a fixed outbound IP for this project; if Atlas requires an IP
   allowlist, the broad `0.0.0.0/0` rule may be necessary. This exposes the
   network endpoint publicly, so use a unique strong database password, the
   least-privileged database role, and TLS. Never use an Atlas administrator
   account for the app.
4. In Resend, add and verify a domain you own, then create an API key restricted
   to sending if the dashboard offers that permission for your account.
5. Generate unique random values for `JWT_SECRET` and `CRON_SECRET`. Store them
   only in the Vercel environment-variable dashboard; do not put real values in
   this repository or share them in chat.

## Import and configure Vercel

1. Import the GitHub repository into a Vercel Hobby project.
2. Set the project **Root Directory** to the repository root (`.`). Keep the
   framework and build settings on automatic detection so `pyproject.toml`
   supplies the FastAPI entrypoint/build command.
3. Keep the project on Hobby. Do not enable billing upgrades or paid add-ons.
4. Add these environment variables for **Production** (and Preview only if you
   intentionally want previews to use a separate test database):

   | Variable | Value |
   |---|---|
   | `MONGO_URL` | Atlas SRV connection string; treat as a secret |
   | `DB_NAME` | `180days` |
   | `JWT_SECRET` | Unique, long random secret |
   | `APP_URL` | The deployed HTTPS Vercel app URL |
   | `CORS_ORIGINS` | The same app origin, e.g. `https://your-app.vercel.app` |
   | `APP_TZ` | `Asia/Kolkata` |
   | `CRON_SECRET` | Unique, long random secret |
   | `RESEND_API_KEY` | Resend API key; treat as a secret |
   | `FROM_EMAIL` | Sender address at the verified Resend domain |
   | `EMAIL_FROM_NAME` | `180Days` (optional) |

   The deployment does not run database seed scripts automatically. Do not run
   `backend/seed.py` against a populated database: it replaces roadmap data and
   resets the demo account. The app can read its bundled roadmap without seeding
   those collections.

5. Deploy to Production. The root build installs the existing Yarn 1 lockfile
   and builds the React app; FastAPI is deployed as a Vercel Python Function.
   The frontend remains at `/`, and API paths remain at `/api/*`.
6. Confirm the production URL matches `APP_URL` and `CORS_ORIGINS`. If the
   Vercel domain changes, update both values and redeploy.
7. In Vercel's **Schedules** page, confirm `daily-reminders` exists. Use the
   dashboard's manual run only after email configuration is complete; it sends
   real reminder emails to opted-in users.

To bootstrap an administrator, use `backend/provision_admin.py --confirm` from
a trusted machine with the target `MONGO_URL`, `DB_NAME`, `JWT_SECRET`,
`ADMIN_EMAIL`, and `ADMIN_PASSWORD` supplied only in its private environment.
The helper inserts a new admin account, refuses to modify an existing non-admin
user, and is a no-op if the specified admin account already exists.
Do not run `backend/seed.py` as a substitute.

## Database safety

The Vercel deployment uses the configured Atlas database directly. It does not
copy, reset, or migrate data. Index creation is additive and uses the existing
index definitions in `backend/lib/db.py`; it does not drop collections or
documents. Do not run `backend/seed.py` against an existing Atlas database.

For local testing, use a separate database name and a local MongoDB instance.
The backend tests create synthetic accounts in the configured app database; do
not run them against Production.

## Email behavior

Email delivery is skipped unless the app has a public HTTPS `APP_URL`, a
`RESEND_API_KEY`, and a `FROM_EMAIL`. OTPs remain six digits, expire after 10
minutes, are single-use, and can be resent under the existing rate limit.
Password-reset links and opted-in daily reminders use the same Resend API.

If you do not own a domain, the free Resend plan cannot provide production
delivery to arbitrary users. A personal Gmail SMTP app password is a possible
zero-cost experiment for a very small personal deployment, but it has provider
quotas and deliverability/policy constraints and is not a reliable transactional
email replacement. Keep email disabled rather than claiming verification works
until real delivery is tested.

## Local configuration template

Copy [backend/.env.example](./backend/.env.example) to `backend/.env` for local
development. Keep all real `.env` files out of Git. Never reuse production
database, session, or scheduler secrets in local tests.
