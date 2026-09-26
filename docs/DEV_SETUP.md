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
`supabase start` prints `API_URL` (http://127.0.0.1:54321) and `ANON_KEY`.

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
# EXPO_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY from `supabase start`>
```
`src/lib/config.ts` validates these at startup and throws if they are missing or malformed.
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
4. Never run `seed.sql` on hosted. Create users with the admin-only `admin-create-driver`
   Edge Function (M6), or for the first admin: Dashboard → Authentication → Add user (phone),
   then `update profiles set role = 'admin', full_name = '…' where phone = '91…';`.

## 5. Run the app
```bash
npm install
npm run web          # console + auth screens in the browser (http://localhost:8081)
npm start            # dev client for Android/iOS (needs an EAS development build, M3)
npm run typecheck && npm run lint && npm test
```
