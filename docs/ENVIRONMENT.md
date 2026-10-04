# Environment configuration

This documents every environment variable the repo reads, split by who may
hold it. It covers the **running** architecture (Supabase) and the
**infrastructure now scaffolded but not yet wired to anything** (Neon, Clerk,
Cloudflare R2) — see docs/PHASE1_TASKS.md's 2026-10-04 entry for exactly what
that second group does and does not do today. Placeholders only; never commit
a real value.

## 1. Local development

Copy `env.example` to `.env.local` (gitignored — confirmed by
`git check-ignore -v .env.local`) and fill in the public values your work
needs. `src/lib/config.ts` reads only `EXPO_PUBLIC_*` names, referenced
literally so Metro can inline them (see the comment at the top of that file —
reading `process.env` as a whole object leaves a release bundle unconfigured).
Server-only values (anything below "Server-only") are never read by the Expo
app; they belong to whatever runs the server side — today that is Supabase
Edge Function secrets (`supabase secrets set KEY=value`) and, for the new
services, Cloudflare Pages Functions.

## 2. Public variables (bundled into every build)

| Variable | Used by | Notes |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (or `..._KEY`) | `src/lib/supabase.ts` | Safe to bundle only because every table has RLS. Required in staging/production — fails closed (`src/lib/config.ts`). |
| `EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY` | map screens | Restrict in the Mappls console per platform. |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | not read by any screen yet | Genuinely public (Clerk's client SDK ships with it). Must match server-side `CLERK_PUBLISHABLE_KEY` below once something uses it. |
| `EXPO_PUBLIC_PRIVACY_POLICY_URL`, `EXPO_PUBLIC_ANDROID_STORE_URL`, `EXPO_PUBLIC_IOS_STORE_URL`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_APP_ENV` | various | Unrelated to this migration; documented in `env.example`. |

## 3. Server-only variables (never `EXPO_PUBLIC_*`, never in a client bundle)

| Variable | Used by | Status |
|---|---|---|
| `MAPPLS_CLIENT_ID`, `MAPPLS_CLIENT_SECRET`, `MAPPLS_REST_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase Edge Functions | Running today; set with `supabase secrets set`. |
| `RESEND_API_KEY`, `EMAIL_FROM` | `src/server/email/resend.ts` | Built and tested (2026-10-04); nothing calls it yet — no caller and no recipient email column exist. |
| `DATABASE_URL` | `src/server/db.ts` | Built and tested; **no query has been issued against it** — the schema and RLS-equivalent rules all still live on Supabase. |
| `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` | `src/server/clerk.ts` | Built and tested; **no route authenticates with it** — driver sign-in is still Supabase phone OTP. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT` (optional) | `src/server/storage.ts` | Built and tested; **no upload flow calls it** — there is no file-upload feature in the app yet. |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | build-time source-map upload | Unrelated to this migration. |

A variable's value is never printed by this app: a missing one fails with
only its name (`src/server/config.ts`, `ServerConfigError`).

## 4. Cloudflare Pages production

Set the **Public variables** (table 2) and whichever **Server-only**
variables (table 3) a deployed Pages Function actually needs, in:

> Cloudflare Dashboard → Workers & Pages → (project) → Settings →
> Environment Variables

Keep the server-only ones as **Secrets** (encrypted), not plain environment
variables, where Cloudflare offers the distinction. Set `EXPO_PUBLIC_*`
values before running the build — Metro inlines them at export time, so a
value added after `bun run export:web` has run does nothing until the next
export.

## 5. Cloudflare preview deployments

Preview deployments get their own environment variable set in the same
dashboard screen (the "Preview" tab next to "Production"). Point
`DATABASE_URL` at a Neon preview branch and `R2_BUCKET_NAME` at a separate
preview bucket if/when either is wired up, so a preview build cannot touch
production data or production files.

## 6. Clerk configuration

Not yet connected to any screen. When driver or console sign-in moves to
Clerk: create the application in the Clerk dashboard, put its publishable key
in `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_PUBLISHABLE_KEY` (both —
`src/server/clerk.ts` verifies sessions server-side and needs its own copy),
and its secret key in `CLERK_SECRET_KEY` only. **Before this happens,
confirm Clerk's SMS OTP coverage for Indian numbers** — the app's only
sign-in method today is phone OTP.

## 7. Neon configuration

Not yet queried. `DATABASE_URL` is Neon's pooled connection string (the one
`@neondatabase/serverless`'s `neon()` HTTP driver uses — not a raw TCP
string, which a Cloudflare Pages Function cannot open). Before any table
moves off Supabase, every `auth.uid()`-based RLS policy (42 across the
migrations) needs an equivalent authorization check written for the Neon +
Clerk pairing, and the 20 existing migration files need a reviewed path to
Neon's schema, not a blind re-run.

## 8. Resend configuration

Verify a sending domain (SPF/DKIM) in the Resend dashboard and put a sender
on that domain in `EMAIL_FROM` — `src/server/email/resend.ts` refuses
Resend's shared `onboarding@resend.dev` test sender outside tests. Put the
API key in `RESEND_API_KEY`. The six email functions exist and are tested;
none has a caller yet.

## 9. R2 configuration

Create a **private** R2 bucket (R2 buckets are private by default — do not
enable public access on it) for driver documents and trip evidence (POD
photos). Create an R2 API token scoped to that one bucket and put its values
in `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET_NAME`. `src/server/storage.ts` only ever returns a signed URL
(5 minutes by default, capped at 1 hour), never the keys, and rejects any
object key that tries to escape the bucket path.

## 10. Secret rotation

1. Generate the new key/credential in the provider's dashboard (Resend,
   Clerk, Neon, Cloudflare R2, Supabase).
2. Update the value in Cloudflare Pages' environment variables (production,
   then preview).
3. Redeploy.
4. Revoke the old key in the provider's dashboard.
5. For an `EXPO_PUBLIC_*` value, also re-run `bun run export:web` — Metro
   inlines it at export time (§4) — and republish any EAS Update channel that
   carries the old value.

If a secret was ever pasted into a chat, a commit message, or any other place
outside its provider's dashboard and this document, treat it as compromised
and rotate it immediately rather than waiting for scheduled rotation.
