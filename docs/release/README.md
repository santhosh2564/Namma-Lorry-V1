# Release pack (Phase 1)

| File                                                 | What                                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| [PRIVACY_POLICY.md](PRIVACY_POLICY.md)               | Privacy policy draft, version `2026-10-01`: **requires legal review**         |
| [DATA_SAFETY.md](DATA_SAFETY.md)                     | Google Play Data safety answers, each row citing the code                     |
| [APP_PRIVACY.md](APP_PRIVACY.md)                     | Apple App Privacy answers                                                     |
| [BACKGROUND_LOCATION.md](BACKGROUND_LOCATION.md)     | Play location and foreground-service declarations, video shot list            |
| [APP_REVIEW_NOTES.md](APP_REVIEW_NOTES.md)           | Reviewer notes, demo account steps, the geofence                              |
| [ASSETS.md](ASSETS.md)                               | Icon, splash and store asset sizes, and the `app.config.ts` field for each    |
| [../RUNBOOK.md](../RUNBOOK.md)                       | Deploy, rollback, key rotation, stuck trips, re-verification, data incidents, erasure |

`test/config/release-docs.test.mjs` keeps these honest: the policy version must equal `CONSENT_VERSION`, ASSETS.md must match `scripts/check-release-assets.mjs`, and the runbook may only name scripts, SQL functions and files that exist.

## Release checklist, in order

Do each step on **staging** (EAS `preview`, the staging Supabase project, Vercel Preview) before **production**.

### 1. Environment variables

- [ ] EAS environments `preview` and `production`: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (the publishable key), `EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY`, `EXPO_PUBLIC_SENTRY_DSN`; secret `SENTRY_AUTH_TOKEN` plus `SENTRY_ORG`, `SENTRY_PROJECT`. Commands in `docs/DEV_SETUP.md` §4.3. `EXPO_PUBLIC_APP_ENV` comes from `eas.json`; don't set it there.
- [ ] Vercel Production and Preview: the five `EXPO_PUBLIC_*` values in `docs/DEV_SETUP.md` §4.4.
- [ ] Supabase Edge Function secrets: `MAPPLS_CLIENT_ID`, `MAPPLS_CLIENT_SECRET`, `MAPPLS_REST_KEY` (`supabase secrets set …`). The service-role key is injected; never put it in EAS or Vercel.
- [ ] Mappls keys restricted to `com.nammalorry.driver` and the console domain; native `.olf` / `.conf` files in `mappls/` on the build machine or as EAS files (see `env.example`).

A missing or invalid value makes the app and console show the "not set up correctly" screen rather than run half-configured (`src/lib/config.ts`).

### 2. Database migrations and functions

- [ ] `supabase link --project-ref <ref>` → `supabase db push --dry-run` → `supabase db push` (every file in `supabase/migrations/`, never the seed).
- [ ] pg_cron enabled; both jobs present: `select jobname, schedule from cron.job;` shows `sweep-unverified-trips` and `downsample-old-points`.
- [ ] `supabase functions deploy mappls-proxy` and `supabase functions deploy admin-create-driver`.
- [ ] Auth: phone provider and SMS (DLT) configured; the admin account created with `bun run provision-user … --role admin` (`docs/DEV_SETUP.md` §5.1).
- [ ] **Sign-ups off** in the dashboard, on staging and production (a human step; `supabase/config.toml` covers only the local stack): Authentication → Sign In / Providers → "Allow new users to sign up" off, Phone provider left on. Check: an OTP request for an unregistered number returns `signup_disabled` / `otp_disabled` and creates no user. New profiles also start inactive (migration 0007), so a missed setting can't produce a working account, but it still creates junk auth users.
- [ ] The 12-month retention (`raw_point_retention_days` = 365) signed off by the client, or changed in `app_settings` and in the policy together.

### 3. Assets

- [ ] Brand files in `assets/` and wired into `app.config.ts` ([ASSETS.md](ASSETS.md)).
- [ ] `bun run release:assets --strict` passes.

### 4. EAS build

- [ ] `version` in `app.config.ts` bumped if anything native changed since the last build (runtime version = app version).
- [ ] `npx eas-cli@latest build --profile preview --platform all` → install from internal distribution → one real short trip on a phone → verified in the console.
- [ ] `npx eas-cli@latest build --profile production --platform all` (build numbers auto-increment).

### 5. Submit

- [ ] Privacy policy reviewed by counsel and published at a public URL; `CONSENT_VERSION` unchanged, or bumped together with the policy.
- [ ] Demo account and review load ready ([APP_REVIEW_NOTES.md](APP_REVIEW_NOTES.md)).
- [ ] Play: Data safety ([DATA_SAFETY.md](DATA_SAFETY.md)), location and foreground-service declarations with the video ([BACKGROUND_LOCATION.md](BACKGROUND_LOCATION.md)).
- [ ] Apple: App Privacy ([APP_PRIVACY.md](APP_PRIVACY.md)) and review notes.
- [ ] `npx eas-cli@latest submit --profile production --platform android --latest` → Play internal testing; `… --platform ios --latest` → TestFlight.

### 6. Vercel (web console)

- [ ] Project imported with **Framework preset: Other**; `vercel.json` drives the build.
- [ ] Merge to `main` deploys Production. Sign in on the deployed console and check the browser console for CSP errors (`bun run check:web-csp` covers only the sign-in page).

After release, [../RUNBOOK.md](../RUNBOOK.md) covers updates, rollback and incidents.
