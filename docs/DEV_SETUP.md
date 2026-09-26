# DEV_SETUP — running Namma Lorry locally

## 1. Prerequisites
- Node 22 or 24 LTS, npm
- Docker (Docker Desktop on Windows/macOS) running, for local Supabase
- Supabase CLI via `npx supabase` (no global install needed)

## 2. Backend: local Supabase
```bash
npx supabase start        # first run downloads the images
npx supabase db reset     # re-applies migrations/ + seed.sql
```
`supabase start` prints `API_URL` (http://127.0.0.1:54321) and `PUBLISHABLE_KEY` (`sb_publishable_…`).

If your network blocks the default image registry (`public.ecr.aws`), pull from Docker Hub:
```bash
SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io npx supabase start
```

Regenerate the DB types after any migration:
```bash
npx supabase gen types typescript --local --schema public > src/lib/database.types.ts
npx prettier --write src/lib/database.types.ts   # keep the header comment line
```

## 3. App environment
```bash
cp .env.example .env
# EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
# EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY from `supabase start`>
```
`src/lib/config.ts` validates these at startup and throws if they are missing or malformed.
To point the app at the hosted project instead, use its URL (`https://<ref>.supabase.co`) and the
**publishable** key (`sb_publishable_…`) from Dashboard → Project Settings → API Keys. The secret key
(`sb_secret_…`) is server-only and must never go into `.env` for the app; `config.ts` rejects
anything that isn't a publishable key.
On a physical phone, `127.0.0.1` is the phone itself. Use your computer's LAN IP instead
(e.g. `http://192.168.1.20:54321`).

## 4. Test phone numbers and OTP

### Local (seeded by `supabase/seed.sql`, OTP from `[auth.sms.test_otp]` in `supabase/config.toml`)
No SMS is sent. The OTP is always **123456**.

| Enter after +91 | Name | Role | Lands on |
|---|---|---|---|
| `9000000001` | Namma Lorry Ops | admin | C1 Live Dashboard (`/console`) |
| `9000000011` | Murugan S | driver | native: D1 onboarding → D3 · web: S4 "use the mobile app" |
| `9000000012` | Ravi Kumar | driver | same as above |
| `9000000013` | Manjunath K | driver | same as above |

Any other number gets "This number isn't registered with Namma Lorry". The app calls
`signInWithOtp({ shouldCreateUser: false })`, so only existing auth users can sign in (ND-12).

To try the other S4 variants locally:
```sql
-- psql postgresql://postgres:postgres@127.0.0.1:54322/postgres
update profiles set is_active = false where phone = '919000000012';  -- deactivated
update profiles set role = 'owner'   where phone = '919000000013';   -- coming soon
```
`npx supabase db reset` restores the seed.

### Hosted Supabase (staging)
1. Dashboard → Authentication → Sign In / Providers → **Phone**: enable it and pick an SMS provider.
   Production SMS in India needs DLT registration (risk R12). For testing without SMS, the
   provider can hold dummy credentials.
2. On the same page, add **Test Phone Numbers and OTPs**, e.g. `919000000001=123456`
   (no `+`). No SMS is sent for these. Remove them before production.
3. **SMS OTP Expiry** defaults to 60 s. The app assumes 60 s (`OTP_EXPIRY_SECONDS` in
   `src/features/auth/errors.ts`) to tell an expired code from a wrong one, so keep the two in sync.
4. Never run `seed.sql` on hosted. Drivers are created from the console (C8 → Add driver), which
   calls the admin-only `admin-create-driver` Edge Function. For the first admin: Dashboard →
   Authentication → Add user (phone), then
   `update profiles set role = 'admin', full_name = '…' where phone = '91…';`.
5. With drivers created only by admins, turn **off** "Allow new users to sign up" (Authentication →
   Sign In / Providers). Nobody can then create a login by calling Supabase Auth directly (ND-12).
   Admin-created users are not affected.

## 5. Edge Functions (`supabase/functions/`)
| Function | Purpose | Secrets |
|---|---|---|
| `mappls-proxy` | Admin-only Mappls autosuggest / geocode / reverse / distance | `MAPPLS_REST_KEY`, optional `MAPPLS_ROUTE_PROFILE` |
| `admin-create-driver` | Admin-only: creates the driver's auth user + profile with the admin client | none extra (`SUPABASE_SECRET_KEYS` is injected by Supabase) |

```bash
# local
printf 'MAPPLS_REST_KEY=<key>\n' > supabase/functions/.env      # gitignored
npx supabase functions serve --env-file supabase/functions/.env
# tests (Deno 2.x; `npm i -g deno` works if Deno isn't installed)
npm run test:functions
# hosted
npx supabase secrets set MAPPLS_REST_KEY=<key>
npx supabase functions deploy mappls-proxy
npx supabase functions deploy admin-create-driver
```
Both functions use [`@supabase/server`](https://github.com/supabase/server) (`createSupabaseContext`,
`auth: 'user'`). It verifies the caller's JWT against the project JWKS and provides an RLS-scoped
client plus an admin client on the secret key. `SUPABASE_URL`, the publishable/secret keys and the
JWKS are injected by Supabase (hosted and `functions serve`). To run a function outside Supabase,
export `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`. The JWKS URL is
derived from `SUPABASE_URL`, or you can set `SUPABASE_JWKS_URL`.
The package's agent skill is vendored at `.claude/skills/supabase-server/` (`npx skills add supabase/server`).
Mappls auth and endpoints are documented in `supabase/functions/mappls-proxy/README.md`.

## 6. Maps (Mappls Web SDK)
The console map (C3/C4) loads the Mappls Web SDK v3 with `EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY`, a static
key from the Mappls console. Restrict it to your web domain(s) there. Without the key, or if the SDK
can't load, a placeholder lists the pins and geofences as text, and pins can be set by entering
coordinates. Native maps arrive with M3.

## 7. End-to-end tests (Playwright, web console)
```bash
npx supabase start && npx supabase db reset   # seeded admin + drivers
npx playwright install chromium               # once (skip where browsers are preinstalled)
npm run e2e                                    # starts `expo start --web` if it isn't running
```
`e2e/create-load.spec.ts`: an admin creates a load (autosuggest, coordinates, radius, planned
distance) and assigns it. `mappls-proxy` is mocked in the browser, so no Mappls key is needed. Set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use a specific Chromium binary.

## 8. Tracking engine dev screen
`/dev/tracking` (dev builds only) shows the local trip state, queue counts, the last point and the
uploader's backoff. It has buttons to start or end a trip by ID, flush, resume, and clean up.
- **Web:** GPS is simulated. Set the position (e.g. the seeded pickup `12.9563, 79.9422`), start
  the seeded trip `f0000000-0000-4000-8000-000000000001` signed in as driver `9000000011`, then
  "Simulate 20", "Flush now", "End trip". Toggling the browser offline exercises
  `ENDED_PENDING_SYNC`. expo-sqlite web needs cross-origin isolation, which `metro.config.js`
  provides on the dev server.
- **Native:** real GPS via the background task. Needs an EAS development build (M3/M9).

### Driver app preview in the browser (dev only)
`EXPO_PUBLIC_DEV_DRIVER_WEB=1 npm run web` lets a driver use D1–D4 in the browser: routing treats the
browser as Android, the D1 permission dialogs are simulated (each Allow grants), and GPS is the
simulated position from `/dev/tracking` (kept in sessionStorage). Sign in as `9000000011`, allow the
three permissions, skip D2, open the seeded trip; set the position to `12.9570, 79.9425` on
`/dev/tracking` and reopen the trip to get "You're at the pickup" and an enabled START. Without the
variable (and in every production build) drivers on web get S4 as before.

## 8a. Driver onboarding on a phone (M9)
- D1 asks for precise location → "Allow all the time" → notifications, one at a time, after the
  disclosure. On Android 11+ "Allow all the time" opens the app's location settings page.
- The consent version is `CONSENT_VERSION` in `src/features/onboarding/consent.ts`. Bump it when the
  D1 text or privacy policy changes; every driver then sees D1 again.
- D2 is shown once per phone (Android only). To see it again, clear the app's data.
- Set `EXPO_PUBLIC_PRIVACY_POLICY_URL` to show the "Read privacy policy" link on D1.

## 9. Run the app
```bash
npm install
npm run web          # console + auth screens in the browser (http://localhost:8081)
npm start            # dev client for Android/iOS (needs an EAS development build, M3)
npm run typecheck && npm run lint && npm test
```
