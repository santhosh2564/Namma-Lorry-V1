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
suite is 10 files / 253 cases; the main ones:

| File | Covers |
|---|---|
| `01_rls_policies.test.sql` | Every RLS policy, blocked **and** allowed, for anon / driver A / driver B / owner / shipper / admin |
| `02_rpc_errors.test.sql` | Every error code in docs/06 §1, produced by a real call |
| `03_verification_reasons.test.sql` | All 10 reason codes from docs/08 §3, each raised in isolation |
| `04_verification_triggers.test.sql` | The point-upload trigger, the pg_cron sweeper, admin review crediting stats exactly once, and `record_consent` (including a stale version) |
| `10_start_trip_contract.test.sql` | Every `start_trip` check (`FORBIDDEN` for inactive, `CONSENT_REQUIRED` for missing **and stale** consent, …) and its grants |

Helpers live in `supabase/tests/_helpers.psql` (the `.psql` extension keeps
`pg_prove` from trying to run it as a test).

> The suite needs `pgTAP`, `PostGIS` and `pg_cron` in the database. `supabase
> start` provides all three. It also needs the `anon`, `authenticated` and
> `service_role` roles, which the local stack creates for you.

pgTAP runs each file in one session and one transaction, so it can't test a
race. `test/db/start-trip-race.sh` starts two trips for one driver from two
sessions at once (docs/10 scenario 10) and expects the second to get
`ANOTHER_TRIP_ACTIVE`. It needs Docker and the local stack, and cleans up its
fixtures. CI runs it after pgTAP:

```bash
bash test/db/start-trip-race.sh
```

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

**Sign-ups are off** (`[auth] enable_signup = false`, validation M4): an unknown
number gets "This number isn't registered" and no account is created. Every new
profile also starts **inactive** (migration 0007), so a user that appears some
other way can't do anything until an operator activates it. To add a local test
user:

1. Pin its OTP in `supabase/config.toml` under `[auth.sms.test_otp]` (for
   example `919000000021 = "123456"`), then `supabase stop && supabase start`.
2. Create it, active, with the local service-role key from `supabase status`:
   ```bash
   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<local service_role key> \
     bun run provision-user --phone 919000000021 --name "Test Driver"
   ```

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

Until that is done, hosted sign-in has no working path for phone OTP. Users are
created by operators only (ND-12): use `provision-user` (§5.1). A user added by
hand in **Dashboard → Authentication → Users → Add user** gets an **inactive**
profile (0007) and sees "Your account is not active" until you run
`provision-user --phone <number> --activate`.

Each hosted project also needs sign-ups turned off in the dashboard (a human
step; `config.toml` covers only the local stack): **Authentication → Sign In /
Providers → "Allow new users to sign up" off**, keeping the Phone provider
enabled.

---

## 4. Environment variables

### 4.1 App (safe to ship in the bundle)

Only these ever reach the app. They are `EXPO_PUBLIC_*`, validated at startup by
`src/lib/config.ts`. Development **throws** on an unknown `EXPO_PUBLIC_APP_ENV`
and tolerates a missing backend. Staging and production **fail closed**: a
missing Supabase URL or key, or an `http://` URL, shows the blocking
"not set up correctly" screen (validation M2). Reference each variable as
`process.env.EXPO_PUBLIC_X` literally, or Metro leaves it out of release
bundles.

| Variable | Where it comes from |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `supabase status` locally; the project URL on hosted |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | The **anon / publishable** key — safe in the app because every table has RLS enabled |
| `EXPO_PUBLIC_APP_ENV` | `development` \| `staging` \| `production` |
| `EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY` | Mappls console (web SDK only — see the M3 notes) |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry (M12a) |
| `EXPO_PUBLIC_PRIVACY_POLICY_URL` | The published privacy policy (a human item; empty hides D1's link) |

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

### 4.3 EAS builds and updates

The EAS project is **@santhoshkrwork/namma-lorry**
(`2a3edc84-9fe4-4593-b278-ef919ec1b82c`, linked in `app.config.ts`). Each
`eas.json` profile has one update channel, one EAS environment and one
`EXPO_PUBLIC_APP_ENV`:

| Profile | Channel | EAS environment | `EXPO_PUBLIC_APP_ENV` | Output |
|---|---|---|---|---|
| `development` | `development` | `development` | `development` | dev client, internal |
| `preview` | `preview` | `preview` | `staging` | internal (store format) |
| `preview_apk` | `preview` | `preview` | `staging` | installable APK |
| `production` | `production` | `production` | `production` | store build, build number auto-increments |

`eas.json` holds only `EXPO_PUBLIC_APP_ENV`. The backend values come from the
EAS environment, so they are never committed. **Until they are set, preview and
production builds open on the "not set up correctly" screen** (that is the M2
fail-closed behaviour, not a bug). Set them once per environment
(`EXPO_PUBLIC_*` values are bundled into the app anyway, so they are
`plaintext`; the Sentry auth token is a build-time `secret`):

```bash
# preview (staging Supabase project)
npx eas-cli@latest env:create --environment preview --visibility plaintext \
  --name EXPO_PUBLIC_SUPABASE_URL --value https://qykqflshvsldzvdpwtni.supabase.co
npx eas-cli@latest env:create --environment preview --visibility plaintext \
  --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <staging publishable key>
npx eas-cli@latest env:create --environment preview --visibility plaintext \
  --name EXPO_PUBLIC_SENTRY_DSN --value <Sentry DSN>
npx eas-cli@latest env:create --environment preview --visibility plaintext \
  --name EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY --value <Mappls map SDK key>

# production (production Supabase project)
npx eas-cli@latest env:create --environment production --visibility plaintext \
  --name EXPO_PUBLIC_SUPABASE_URL --value https://<production-ref>.supabase.co
npx eas-cli@latest env:create --environment production --visibility plaintext \
  --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <production publishable key>
npx eas-cli@latest env:create --environment production --visibility plaintext \
  --name EXPO_PUBLIC_SENTRY_DSN --value <Sentry DSN>
npx eas-cli@latest env:create --environment production --visibility plaintext \
  --name EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY --value <Mappls map SDK key>

# Sentry source-map upload (B4), both environments
npx eas-cli@latest env:create --environment preview --environment production \
  --visibility secret --name SENTRY_AUTH_TOKEN --value <token>
npx eas-cli@latest env:create --environment preview --environment production \
  --visibility plaintext --name SENTRY_ORG --value <org slug>
npx eas-cli@latest env:create --environment preview --environment production \
  --visibility plaintext --name SENTRY_PROJECT --value <project slug>

npx eas-cli@latest env:list --environment preview    # check
```

Build and publish:

```bash
npx eas-cli@latest build --profile preview_apk --platform android   # sideload on a test phone
bun run update:preview "Fix trip list refresh"        # OTA to the preview channel
bun run update:production "Fix trip list refresh"
```

`scripts/eas-update.mjs` refuses a dirty working tree, puts the commit SHA in
the update message, and sets `EXPO_PUBLIC_APP_ENV` to match the channel
(`eas update` does not read `eas.json`'s `env`). `runtimeVersion` follows the
app `version`, so **any native change (a new native module, a config plugin,
`app.config.ts` permissions) needs a `version` bump and a new build**; an update
only reaches builds with the same `version`.

Before a store build, `bun run release:assets --strict` must pass. Without
`--strict` (as CI runs it) it only reports the missing icons, until the brand
assets exist (docs/release/ASSETS.md).

### 4.4 Web console on Vercel

`vercel.json` builds the console as a static export (`bun install
--frozen-lockfile`, `bun run export:web`, output `dist/`), rewrites app routes
to `/index.html`, and sends the security headers and the Content Security
Policy on every response. Import the GitHub repo in Vercel with **Framework
preset: Other** and leave the build settings to `vercel.json`.

Set these in **Project → Settings → Environment Variables**. They are read at
**build** time (Metro inlines them into the bundle), so **redeploy after
changing any of them**:

| Variable | Production | Preview |
|---|---|---|
| `EXPO_PUBLIC_APP_ENV` | `production` | `staging` |
| `EXPO_PUBLIC_SUPABASE_URL` | `https://<production-ref>.supabase.co` | `https://qykqflshvsldzvdpwtni.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | production publishable key | staging publishable key |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry DSN | Sentry DSN |
| `EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY` | Mappls web SDK key, restricted to the console domain | same, restricted to the preview domain |
| `EXPO_PUBLIC_PRIVACY_POLICY_URL` | the published policy URL | the same |

A missing or invalid Supabase value makes the console show the blocking "not
set up correctly" screen (validation M2), and an unset `EXPO_PUBLIC_APP_ENV` in
this release bundle counts as a misconfigured production build. Never add
`SUPABASE_SERVICE_ROLE_KEY` or any Mappls REST secret here: every
`EXPO_PUBLIC_*` value ends up in the public bundle.

The CSP allows only `'self'`, Supabase (`https://*.supabase.co`,
`wss://*.supabase.co`), Sentry ingest, and the Mappls web SDK hosts
(`sdk.mappls.com`, `*.mappls.com`, `*.mapmyindia.com`). If a new third-party
host is needed, add it to `vercel.json`, `test/config/vercel.test.mjs` and check
it with:

```bash
EXPO_PUBLIC_APP_ENV=production EXPO_PUBLIC_SUPABASE_URL=https://ci-probe.supabase.co \
  EXPO_PUBLIC_SUPABASE_ANON_KEY=ci-probe-anon-key npx expo export -p web --clear
bun run check:web-csp      # serves dist/ with vercel.json headers, loads sign-in in Chromium
```

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

### 5.1 Creating users on a hosted project

Drivers do not sign themselves up (ND-12). Create or update the admin, pilot
drivers and the App Review demo account from an operator machine:

```bash
SUPABASE_URL=https://qykqflshvsldzvdpwtni.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<secret key> \
  bun run provision-user --phone 919876543210 --name "Murugan S" --role driver
```

Flags: `--phone` (required, `91` + 10 digits), `--name`, `--role
driver|admin|owner|shipper`, `--language en|ta|kn|hi`, `--activate` or
`--deactivate`. A new user defaults to driver, `en`, active (the script writes
`is_active = true` after the trigger has created the profile inactive). For an existing
user **only the flags you pass change**: `--name` alone never touches the role
or reactivates a deactivated driver. The URL must be `https://`; `http://` is
accepted only for `localhost` / `127.0.0.1` (checked on the hostname). Keep the
service role key out of shell history and CI logs.

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
