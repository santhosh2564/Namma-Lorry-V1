# DEV_SETUP — local and hosted Supabase

How to get a working backend for Namma Lorry, how to sign in as a seeded user, and
where the phone numbers and OTP codes come from.

Everything here assumes the repository root is the project root and that
`supabase/` holds `config.toml`, `migrations/`, `seed.sql` and `tests/`.

---

## 1. Two ways to run the backend

| | Local Supabase | Hosted staging project |
|---|---|---|
| Needs | Supabase CLI **and Docker** | Nothing but the keys |
| Database | Your machine, wiped on `db reset` | Shared, persistent |
| OTP | Fixed `123456`, no SMS sent | A real SMS actually goes out |
| Seed data | Yes, every reset | No — never run `seed.sql` there |
| Use it for | Day-to-day work, the pgTAP suite | Demos, device testing, CI against a real API |

You need **one** of them. Most people want local for development and hosted for
testing on a real phone.

---

## 2. Local Supabase

### 2.1 Prerequisites

- Docker Desktop (or Docker Engine) running — `docker info` must succeed
- The Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase
# Windows
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
# Linux
curl -fsSL https://raw.githubusercontent.com/supabase/cli/main/install.sh | sh
```

### 2.2 Start it

```bash
supabase start          # first run downloads the local containers
supabase status         # copy the "API URL" and "anon key" it prints
```

`supabase start` prints the local values. Put them in your env file (see §4):

```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<the anon key from `supabase status`>
```

Edit `supabase/config.toml` and you must `supabase stop && supabase start` again —
the CLI only reads the config at boot.

### 2.3 Reset the database

```bash
supabase db reset
```

This drops and recreates the database, then applies every file in
`supabase/migrations/` in order and finally `supabase/seed.sql`. It is the
"get me back to a known state" command — run it freely, several times a day.

After a reset you get:

| Table | Rows |
|---|---|
| `profiles` | 4 (1 admin + 3 drivers) |
| `vehicles` | 3 |
| `loads` | 4 |
| `trips` | 1 (assigned, not started) |

### 2.4 Run the database tests

```bash
supabase test db
```

This runs the pgTAP suite in `supabase/tests/` through `pg_prove`. The current
suite is 4 files / 135 cases:

| File | Covers |
|---|---|
| `01_rls_policies.test.sql` | Every RLS policy, blocked **and** allowed, for anon / driver A / driver B / owner / shipper / admin |
| `02_rpc_errors.test.sql` | Every error code in docs/06 §1, produced by a real call |
| `03_verification_reasons.test.sql` | All 10 reason codes from docs/08 §3, each raised in isolation |
| `04_verification_triggers.test.sql` | The point-upload trigger, the pg_cron sweeper, admin review crediting stats exactly once, and `record_consent` |

Helpers live in `supabase/tests/_helpers.psql` (the `.psql` extension keeps
`pg_prove` from trying to run it as a test).

> The suite needs `pgTAP`, `PostGIS` and `pg_cron` in the database. `supabase
> start` provides all three. It also needs the `anon`, `authenticated` and
> `service_role` roles, which the local stack creates for you.

---

## 3. Test phone numbers and OTP

### 3.1 Local — the numbers that work

`supabase/seed.sql` creates four users. The phone numbers are in the
`9190000000xx` range used for local testing, and each one has its OTP pinned in
`supabase/config.toml`:

```toml
[auth.sms.test_otp]
919000000001 = "123456"   # admin   — Namma Lorry Ops
919000000011 = "123456"   # driver  — Murugan S     (Tamil)
919000000012 = "123456"   # driver  — Ravi Kumar    (Tamil)
919000000013 = "123456"   # driver  — Manjunath K   (Kannada)
```

So, locally, **the OTP is always `123456`** and no SMS is ever sent or billed.
`[auth.sms.test_otp]` short-circuits delivery inside GoTrue.

| Phone number | Role | Name | What you can do |
|---|---|---|---|
| `919000000001` | `admin` | Namma Lorry Ops | C1 console, review queue, all reads |
| `919000000011` | `driver` | Murugan S | D3 trips. Has the one assigned trip (TN 23 BK 4521) |
| `919000000012` | `driver` | Ravi Kumar | D3 trips, empty |
| `919000000013` | `driver` | Manjunath K | D3 trips, empty |

Enter them **without** a `+` and without spaces: `919000000011`. If the app
formats for you, `+919000000011` is accepted too.

Anything else — a real phone number, a made-up one — fails to sign in
locally. `config.toml` also carries dummy Twilio credentials purely so the phone
provider exists; GoTrue never contacts Twilio for a `[auth.sms.test_otp]`
number, and any other number fails to send. That is deliberate: it means an
accidental real number can never cost you an SMS.

### 3.2 Hosted — there is no `123456`

`[auth.sms.test_otp]` is a **Supabase CLI configuration option**. It applies to
the local stack only. A hosted project ignores it, so:

- a seeded `9190000000xx` number will **not** get a free OTP on hosted
- `seed.sql` must never be applied to a hosted project — it inserts directly
  into `auth.users` and would leave accounts that cannot receive an OTP

To sign in with a phone number against a hosted project, enable a real SMS
provider:

1. Dashboard → **Authentication → Providers → SMS**
2. Add Twilio credentials (or another supported provider)
3. Set your real test numbers in the app

Until that is done, hosted sign-in has no working path for phone OTP. Until the
driver-registration decision (ND-5 / ND-12) is made, the practical alternative
for a demo is to create the users by hand in **Dashboard → Authentication →
Users → Add user** with a phone number, which then signs in through OTP once
SMS is enabled.

---

## 4. Environment variables

### 4.1 App (safe to ship in the bundle)

Only these ever reach the app. They are `EXPO_PUBLIC_*`, validated at startup by
`src/lib/config.ts`, which **throws in development** if any is malformed.

| Variable | Where it comes from |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `supabase status` locally; the project URL on hosted |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | The **anon / publishable** key — safe in the app because every table has RLS enabled |
| `EXPO_PUBLIC_APP_ENV` | `development` \| `staging` \| `production` |
| `EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY` | Mappls console (web SDK only — see the M3 notes) |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry (M12a) |

Copy the template to your env file — the repo ships it as `env.example` (no
leading dot, so it is committed) and you save it as `.env`:

```bash
cp env.example .env
```

Set the values in the workspace's **Settings → Environment** panel rather than
committing them.

### 4.2 Server-only (never in the app)

| Variable | Where it goes |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function secrets only — `supabase secrets set` |
| Mappls client id / secret / REST key | Edge Function secrets only (M6) |
| Twilio credentials | Hosted dashboard, or local `config.toml` for local-only placeholders |

The service role key **bypasses RLS**. It must never be bundled, logged, or
committed. The app's client only ever holds the anon key.

---

## 5. Hosted project

The staging project for this build is
`https://qykqflshvsldzvdpwtni.supabase.co`.

| Setting | Value |
|---|---|
| Project URL | `https://qykqflshvsldzvdpwtni.supabase.co` |
| Publishable (anon) key | copy from **Project Settings → API Keys** → `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| Secret (service role) key | copy from the same page → `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=…` — **never** into the app |
| JWKS URL | `https://qykqflshvsldzvdpwtni.supabase.co/auth/v1/.well-known/jwks.json` — for verifying JWTs inside an Edge Function, not needed in the app |

To work against it from the CLI:

```bash
supabase login
supabase link --project-ref qykqflshvsldzvdpwtni
supabase db push                 # apply supabase/migrations/ — never the seed
supabase test db                 # runs against the LOCAL database, not the linked one
```

Note the split: `db push` goes to the linked project, but `test db` always runs
against your local stack. That is deliberate — the pgTAP suite writes fixtures
and rolls them back, and you do not want it near shared data.

---

## 6. Regenerating the database types

`src/lib/database.types.ts` is generated. After adding or changing a migration:

```bash
supabase gen types typescript --local  > src/lib/database.types.ts
supabase gen types typescript --linked > src/lib/database.types.ts   # hosted
```

Then re-run `bun run typecheck` — the app compiles against these types, so a
column rename breaks the build rather than a screen at runtime.

---

## 7. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `supabase start` fails immediately | Docker is not running. `docker info` must work. |
| OTP not received, no SMS | Expected locally. The number must be listed in `[auth.sms.test_otp]`; otherwise local sign-in fails by design. |
| `permission denied for table profiles` | The anon key is missing/wrong, or you are signed out. Check `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` against `supabase status`. |
| A test fails only on hosted | The pgTAP suite does not run on hosted. Reproduce locally with `supabase db reset`. |
| `Invalid EXPO_PUBLIC_* environment variables` thrown at startup | `src/lib/config.ts` fails loudly in development on purpose. It is suppressed under Jest so the unit tests can run without a backend. |
| Changes to `config.toml` ignored | `supabase stop && supabase start`. |
| Points upload fails with an RLS error | See ND-8: one bad row in a batch can fail the whole upsert. Tracked for M8. |
