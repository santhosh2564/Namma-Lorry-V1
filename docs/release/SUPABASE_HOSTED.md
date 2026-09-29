# Hosted Supabase — staging and production checklist

Do everything for **staging first**, run the acceptance checks there, then repeat for production. Commands use the repo's CLI via `npx supabase` (CI pins 2.118.0).

> **Never run `supabase config push` against a hosted project.** `supabase/config.toml` is the *local* stack: test OTP numbers, dummy Twilio credentials, `site_url = 127.0.0.1`. Hosted auth settings are made in the dashboard (§4). `db push` does not touch auth config.
> **Never run `supabase/seed.sql` on hosted.** It creates fake users with OTP 123456. `db push` doesn't seed unless you pass `--include-seed`; don't.

## 1. Create the projects
- [ ] Two projects in one organisation: `namma-lorry-staging` and `namma-lorry-prod`.
- [ ] Region **Mumbai (ap-south-1)** for both: lowest latency for drivers, and data stays in India (simplest DPDP story; confirm with counsel).
- [ ] Production on the **Pro** plan before the pilot. Free projects pause after ~1 week idle (a paused DB = lost trips), and Pro adds daily backups; consider the PITR add-on. Staging can stay Free if someone is using it weekly.
- [ ] Postgres major version **17** (matches `config.toml` `major_version`).
- [ ] Store the database password in the team password manager.

## 2. Link and push migrations
```bash
npx supabase login
npx supabase link --project-ref <staging-ref>        # prompts for the DB password
npx supabase db push --dry-run                       # expect 0001…0004, in order
npx supabase db push
npx supabase migration list                          # local and remote columns must match
```
- [ ] `0001` creates `postgis` (schema `extensions`) and `pg_cron` itself, so no manual extension step is needed. If `db push` fails on `create extension pg_cron`, enable **pg_cron** under Database → Extensions and re-run.
- [ ] Before every later push to **production**: `npx supabase db dump --linked -f backups/prod-$(date +%F).sql` (the `backups/` folder is not in git; keep it off the repo).

## 3. Verify the database (SQL editor)
```sql
-- the verification sweeper (0001) is scheduled
select jobid, jobname, schedule, active from cron.job;          -- sweep-unverified-trips | */15 * * * * | t
-- after ≥ 15 min: it runs and succeeds
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
-- realtime publication includes trip_live
select tablename from pg_publication_tables where pubname = 'supabase_realtime';
-- RLS on every public table (expect no rows)
select tablename from pg_tables where schemaname = 'public' and not rowsecurity;
-- thresholds present (doc 08 — values need client sign-off before the pilot)
select key, value from public.app_settings order by key;
```
- [ ] Dashboard → **Advisors → Security**: no errors. Review the warnings.
- [ ] Database → Settings → **Enforce SSL** on.

## 4. Auth (dashboard → Authentication)
- [ ] **Sign In / Providers → Email:** disable (phone-only app).
- [ ] **Phone:** enable; OTP length 6; OTP expiry 300 s.
- [ ] **Allow new users to sign up: OFF.** This closes ND-12 for the pilot: `handle_new_user` would otherwise make *any* phone number that receives an OTP a driver. Users are created with `scripts/provision-user.mjs` (§6).
- [ ] **SMS provider** (see §5).
- [ ] **Test phone numbers and OTPs** (production only for App Review; staging for QA): e.g. `919999900001=<6-digit code>`. No SMS is sent for these. Use a code that is *not* 123456, and remove the entry after review.
- [ ] **Rate limits:** SMS sent per hour ≈ 30 for the pilot (raise as the fleet grows); token verifications default.
- [ ] **URL configuration:** Site URL = the console URL (`https://console.<domain>`). OTP doesn't redirect, but GoTrue uses it in links.
- [ ] **Sessions:** JWT expiry 3600 s (default, doc 09 §4).

## 5. SMS provider for phone OTP (India)
India requires **DLT registration**: a registered entity, a sender ID (header) and an approved content template. Unregistered SMS is silently dropped by Indian carriers. Allow **1–2 weeks**.

| Option | Setup in Supabase | DLT work | Recommendation |
|---|---|---|---|
| **Twilio Verify** | Provider: *Twilio Verify*: Account SID, Auth Token, Verify Service SID | Twilio's pre-registered India sender/templates (confirm with Twilio for your account) | **Pilot**: fastest path, no code |
| Twilio Programmable SMS | Provider: *Twilio*: Account SID, Auth Token, Messaging Service SID | Your own DLT entity + header + template; register them with Twilio | If you already have DLT |
| MSG91 | Not a built-in provider. Needs an **Auth → Send SMS hook** (an Edge Function that calls MSG91) | Your own DLT; MSG91 helps with registration | Cheapest at scale; needs code (not built) |

With your own DLT template, the Supabase **SMS template** text must match the approved template exactly, e.g. `Your Namma Lorry login code is {{ .Code }}. Do not share it with anyone. -NAMLRY` (the header/suffix is whatever DLT approves).

- [ ] After configuring: send an OTP to a real Airtel, Jio and Vi number; check delivery time (< 30 s).

## 6. Users
```bash
# operator machine only; service-role key from dashboard → Settings → API
export SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<secret>
node scripts/provision-user.mjs --phone 91XXXXXXXXXX --name "Ops Admin" --role admin
node scripts/provision-user.mjs --phone 91XXXXXXXXXX --name "Murugan S" --role driver --language ta
node scripts/provision-user.mjs --phone 91XXXXXXXXXX --deactivate    # offboard (keeps history)
```
- [ ] One admin per ops person (no shared logins; `reviewed_by` must identify a person).
- [ ] Pilot drivers (5–10), each with a vehicle created in the console.
- [ ] App Review demo driver (production): see [APP_REVIEW_NOTES.md](APP_REVIEW_NOTES.md).

## 7. Secrets and Edge Functions
**No Edge Functions exist yet.** `mappls-proxy` is M6, and `supabase/functions/` is absent. When it lands:
```bash
# supabase/.env.staging / .env.production: git-ignored (.env.*), never committed
npx supabase secrets set --env-file supabase/.env.staging     # MAPPLS_CLIENT_ID, MAPPLS_CLIENT_SECRET, MAPPLS_REST_KEY
npx supabase secrets list
npx supabase functions deploy mappls-proxy
```
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected into functions automatically; don't set them.
- Keep JWT verification **on** for `mappls-proxy` (the default); it must also check `is_admin()` itself (doc 06 §4).

## 8. Wire the apps to the project
- [ ] EAS environment variables (`preview` → staging, `production` → prod): see [BUILD_AND_DEPLOY.md §3](BUILD_AND_DEPLOY.md#3-environment-variables-per-profile).
- [ ] Vercel env vars (Preview → staging, Production → prod).
- [ ] Mappls console: restrict the map SDK key to package `com.nammalorry.app`, the iOS bundle id, and the console domain.

## 9. Smoke test on staging (before any production step)
- [ ] Admin OTP login on the console; create a vehicle and a load; assign the pilot driver.
- [ ] Driver OTP login on a `preview` build; D1 consent recorded (`select consent_version, consent_at from profiles`).
- [ ] Short real trip: start at pickup → live marker on C1 → end at drop → `verified` or a readable reason.
- [ ] `cron.job_run_details` shows successful sweeps.
- [ ] Sentry receives a test event tagged `environment=preview`.
