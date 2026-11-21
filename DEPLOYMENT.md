# 180Days - Free Vercel Deployment

This deployment uses one Vercel project for the React static frontend and the
FastAPI serverless backend. The browser and API share an origin, so the existing
httpOnly `SameSite=Lax` session cookie works without third-party cookies or a
cross-origin API URL. Vercel does not host MongoDB; the app connects to the
existing MongoDB Atlas M0 cluster.

## Free-tier scope and limits

- Use Vercel's free Hobby plan, MongoDB Atlas M0, and Gmail SMTP for low-volume
  personal testing. Do not enable a paid plan, paid add-on, or usage-based
  billing. Hobby usage may pause when an allowance is exhausted instead of
  charging overages.
- Vercel Hobby schedules have a 15-minute timing window. The daily reminder
  schedule is configured for 18:30 Asia/Kolkata, but it is not guaranteed to run
  at exactly 18:30.
- The reminder handler has a 60-second function limit and Vercel path schedules
  do not retry failed runs. SMTP does not provide Resend-style provider
  idempotency; repeated reminder runs can deliver duplicates.
- Gmail may limit, delay, or reject automated and high-volume messages. Its
  consumer SMTP service is suitable only for low-volume personal testing, not a
  guaranteed transactional-email service.
- Vercel Hobby is intended for personal, non-commercial use. Check the current
  Vercel plan terms for your use case; this guide does not enable or recommend a
  paid upgrade.

## Before deploying

1. Push the reviewed changes to the GitHub repository connected to Vercel before
   importing or redeploying the project.
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
4. Enable 2-Step Verification on the Gmail account and create a Gmail App
   Password for SMTP. Use `180dayys@gmail.com` as both the SMTP username and
   sender. Store the App Password only in Vercel's sensitive environment
   variable field; never add it to this repository or frontend.
5. Generate unique random values for `JWT_SECRET` and `CRON_SECRET`. Store them
   only in the Vercel environment-variable dashboard; do not put real values in
   this repository or share them in chat.

## Import and configure Vercel

1. Import the GitHub repository into a Vercel Hobby project.
2. Set the project **Root Directory** to the repository root (`.`). Keep the
   framework and build settings on automatic detection so `pyproject.toml`
   supplies the FastAPI entrypoint, runtime dependencies, and build command.
   `requirements.txt` also references `backend/requirements-runtime.txt` for
   local pip installs.
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
   | `SMTP_HOST` | `smtp.gmail.com` |
   | `SMTP_PORT` | `587` |
   | `SMTP_USERNAME` | `180dayys@gmail.com` |
   | `SMTP_PASSWORD` | Gmail App Password; mark as sensitive/secret |
   | `SMTP_FROM_EMAIL` | `180dayys@gmail.com` |
   | `SMTP_FROM_NAME` | `180Days` |
   | `SMTP_USE_TLS` | `true` |

   Add each value in **Project Settings → Environment Variables**, selecting
   **Production** as the environment. Mark `SMTP_PASSWORD` sensitive if the
   dashboard presents that option. Add values without quotes or trailing
   spaces. Keep existing MongoDB, JWT, timezone, and other settings unchanged.
   The password is server-side only. After saving the variables, manually
   redeploy Production so the function receives them; this guide does not
   deploy automatically.

   The deployment does not run database seed scripts automatically. Do not run
   `backend/seed.py` against a populated database: it replaces roadmap data and
   resets the demo account. The app can read its bundled roadmap without seeding
   those collections.

5. Deploy to Production. The root build installs the existing Yarn 1 lockfile
   and builds the React app; the root `pyproject.toml` dependencies are installed
   for the FastAPI Vercel Python Function.
   The frontend remains at `/`, and API paths remain at `/api/*`.
6. Confirm the production URL matches `APP_URL` and `CORS_ORIGINS`. If the
   Vercel domain changes, update both values and redeploy.
7. In Vercel's **Schedules** page, confirm `daily-reminders` exists. Use the
   dashboard's manual run only after email configuration is complete; it sends
   real reminder emails to opted-in users.

## Health checks and runtime diagnostics

- `GET /api/health/live` returns `200` when the FastAPI function is loaded and
  does not contact MongoDB.
- `GET /api/health/ready` performs a read-only MongoDB ping. It returns `200`
  when Atlas is reachable and `503` when the database is unavailable.
- API responses include an `X-Request-ID`. Unhandled errors are logged with
  that ID, the route template, HTTP method, exception class, and a safe error
  category. Stack frames include only source file names, function names, and
  line numbers. Log entries omit request bodies, credentials, cookies, and raw
  exception messages.
- Temporary MongoDB diagnostics also record per-server exception classes and
  coarse categories, a short fingerprint of the configured MongoDB host list,
  and whether `DB_NAME` is present. They do not record hostnames, raw error
  messages, or connection-string values.
- Vercel Runtime Logs are available on all plans from the project's **Logs**
  page. Filter for failed requests and correlate by request ID. Build output is
  available from the Production deployment tile; neither requires Pro Request
  Logs.

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

Email sends require a public HTTPS `APP_URL`, Gmail SMTP on port `587`, and
STARTTLS. SMTP username, App Password, sender address, and sender name are
server-side environment variables. Signup reports whether the verification
email was sent; authenticated resend returns a safe error if delivery fails.
Verification codes are six digits, stored only as hashes, expire after 10
minutes, are single-use, and retain the existing resend rate limit. A new code
is stored and older unused codes are invalidated only after delivery succeeds.
Password-reset links and opted-in daily reminders use the same SMTP transport.

To configure Vercel Production, open **Project Settings → Environment
Variables**, add the SMTP variables listed above for **Production**, mark
`SMTP_PASSWORD` sensitive, save, and manually redeploy. Do not paste the App
Password into source code, GitHub, frontend settings, chat, logs, or this
documentation.

For local development, copy `backend/.env.example` to `backend/.env` and add
credentials only to that ignored local file if you intentionally want to send a
real message. The mailer requires an HTTPS `APP_URL`; automated tests use
mocked SMTP and do not send real email. No endpoint returns an OTP, including
in development. Use a separate development database.

## Local configuration template

Copy [backend/.env.example](./backend/.env.example) to `backend/.env` for local
development. Keep all real `.env` files out of Git. Never reuse production
database, session, or scheduler secrets in local tests.
