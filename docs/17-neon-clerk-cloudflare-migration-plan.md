# 17 — Migration plan: Supabase → Cloudflare Pages + Neon + Clerk

Status tracking doc for the production-infrastructure migration. Read this before touching `src/server/`, `functions/`, or any Supabase-equivalent schema work. Update it as milestones land — this is the source of truth for sequencing, not the PR descriptions.

## Why

Phase 1 today runs entirely on Supabase (Postgres + RLS + PostGIS + pg_cron, Auth, 2 Edge Functions), deployed to Vercel. The confirmed production target is Cloudflare Pages + Pages Functions + Neon Postgres + Clerk (auth) + Resend (email) + Cloudflare R2 (storage). This doc sequences that cutover as a set of independently landable milestones on the long-lived `feat/production-infra` branch, merged into `main` only at the end (N11).

## What's actually used today (don't rebuild what isn't)

- **Storage, email: zero usage.** No file upload, no email-sending exists anywhere in the app. R2 and Resend are additive capability for future features, not migration blockers.
- **Realtime (3 websocket channels) already has a polling fallback for every one**, because websockets are routinely blocked on Indian mobile networks. Not load-bearing for correctness — dropped in this migration (N9).
- **Almost all business logic and tenant isolation live in Postgres**: RLS policies and `SECURITY DEFINER` RPCs (`start_trip`, `end_trip`, `admin_review_trip`, `record_consent`, `admin_erase_driver`, `verify_trip`) keyed off Supabase's `auth.uid()`. The client talks directly to PostgREST today — no app-layer API exists except 2 Edge Functions (`admin-create-driver`, `mappls-proxy`). This is the center of the migration.

## The central decision: drop RLS, centralize authorization in Pages Functions

Supabase wires `auth.uid()` into Postgres automatically; Neon + Clerk does not. **Decision: no RLS-equivalent bridging (no session-variable tricks, no Neon-Authorize/`pg_session_jwt`). All authorization moves into TypeScript in the Pages Functions layer**, which holds the only `DATABASE_URL` and is the only thing that can reach Neon at all.

Why: this migration's own premise (a server-side API layer) already interposes a trusted server between client and Postgres — RLS existed to simulate exactly that absence of a direct client-to-DB path, so once the Function layer exists it's redundant with what RLS would check. Nearly every mutation is already one `SECURITY DEFINER` function call (one implicit transaction), so Neon's stateless HTTP driver (`@neondatabase/serverless`, Cloudflare's documented path — see `src/server/db.ts`) is sufficient; we don't need the stateful WebSocket/pooled connection that session-variable RLS would require.

**Honest downside and mitigation** (all three required, not optional):
1. Neon has no client-visible connection at all — only Pages Functions hold `DATABASE_URL` as a Cloudflare secret, never shipped to any bundle (enforced today by the ESLint `no-restricted-imports` rule + the CI grep step in `.github/workflows/ci.yml`).
2. Keep `ENABLE ROW LEVEL SECURITY` with one coarse "only the `app_role` the Functions connect as may touch this table" policy — a last-ditch guard, not per-row authorization.
3. Every admin-only SQL function keeps an explicit `is_admin(p_actor_id text)` re-check inside Postgres, so a wiring bug in the calling Function still can't get Postgres to approve a non-admin action.

`verify_trip()` (the "nobody types a kilometre" trust boundary) never referenced `auth.uid()` and ports byte-for-byte unchanged. What changes is *who may call* `start_trip`/`end_trip`/etc. with which id — decided once in the Function from the verified Clerk session, not inside Postgres.

**pg_cron**: dropped (Neon requires always-on compute for it) in favor of Cloudflare Cron Triggers hitting dedicated secret-protected endpoints (N7). **PostGIS**: fully supported on Neon, no change. **Realtime**: dropped (N9).

## Branching

`feat/production-infra` (pushed, tracked by draft PR #31) is the long-lived integration branch. Each milestone is its own worktree (`C:\dev\nl-<id>`) branched from the latest `feat/production-infra`, landing back on it; merge `origin/main` into it periodically to absorb unrelated stabilization work still landing there. Only N11 merges `feat/production-infra` → `main`.

## Milestones

| ID | What | Status |
|---|---|---|
| N0 | Account setup (Neon/Clerk/Cloudflare Pages projects) + server-only scaffolding: `src/server/{config,db,clerk,storage}.ts`, Resend service, `functions/api/health.ts`, `wrangler.toml`, `docs/ENVIRONMENT.md`, CI/ESLint leak guards | **Code done.** Accounts not yet created — see Open items below |
| N1 | Neon-native schema baseline (`db/migrations/0001_schema.sql`): `profiles.id` → Clerk text id, `handle_new_user` trigger deleted (self-registration becomes structurally impossible), RLS/helper functions replaced by the coarse `app_role` policy, `verify_trip`/`apply_verified_stats` ported unchanged, `start_trip`/`end_trip` gain explicit `p_driver_id`/`p_actor_id` params, the migration-0011 NULL-position fix folded in from day one | **Done.** `scripts/db-migrate.mjs` applies it (tested against a real Postgres+PostGIS, not just mocks); `db/smoke-test.sql` proves 9 behaviors end to end (is_active gate, consent gate, NULL-position guard, start_trip happy path, the concurrency fix, `verify_trip`'s distance math within ±5% of planned, `driver_stats` update, admin-only rejection/acceptance). Full validation (typecheck/lint/format/591 tests) green |
| N2 | Remaining migration logic folded in (consent versioning, DPDP erasure/retention, concurrency lock, admin trip writes) — full disposition table below | **Folded into N1's single baseline file** rather than a separate `0002_consent_and_dpdp.sql` — since this is a fresh baseline, not a real incremental history, splitting added no value. Every function in the disposition table below (`record_consent`, `downsample_old_points`, `admin_erase_driver`, `cancel_trip`, `admin_force_end`) already exists in `0001_schema.sql` |
| N3 | Pages Functions auth middleware + authorization helpers (`requireProfile`, `requireAdmin`, `isVehicleOwner`, `isLoadShipper`, `canReadTrip`) built on `src/server/clerk.ts`'s `createRequestAuthenticator` | Not started (clerk.ts primitive exists from N0) |
| N4 | Trip lifecycle endpoints: `/api/trips/:id/{start,end,points,review,cancel,force-end}`, `/api/profile/consent` | Not started |
| N5 | Read endpoints for every console/driver `.from()` call site | Not started |
| N6 | `admin-create-driver` + `mappls-proxy` ported to Pages Functions (logic is already framework-free/portable; swap Clerk Backend API for Supabase service-role) | Not started |
| N7 | Cron Trigger endpoints replacing `pg_cron` (`sweep-unverified-trips`, `downsample-old-points`) | Not started |
| N8 | Clerk Expo SDK swap (client auth), delete `src/lib/supabase.ts` + `@supabase/supabase-js` | Not started |
| N9 | Realtime removal, polling-interval hardening | Not started |
| N10 | Cloudflare Pages deployment + CSP (`_headers`/`_redirects`), Vercel removal | Not started |
| N11 | CI rework, operator tooling (`provision-user.mjs`, seed data), final security checklist, merge to `main` | Not started |

## Migration disposition table (0001–0011 → Neon baseline)

| File | Disposition |
|---|---|
| `0001_phase1_schema.sql` | Rewritten: auth-model swap + RLS removal; `verify_trip`/`apply_verified_stats`/point-insert trigger port unchanged |
| `0002_consent.sql` | Rewritten: param swap only |
| `0003_realtime_trips.sql` | Dropped — superseded by polling |
| `0004_realtime_trip_points.sql` | Dropped — same as above |
| `0005_admin_trip_writes.sql` | Rewritten: RLS check → table `CHECK` constraint; `p_actor_id` added |
| `0006_dpdp_controls.sql` | Rewritten: param swap; cron schedule dropped (N7 calls it instead) |
| `0007_no_self_registration.sql` | Superseded — structurally impossible under the new model |
| `0008_start_trip_concurrency.sql` | Rewritten: param swap only, folded into baseline `start_trip` |
| `0009_reconsent_notice.sql` | Rewritten: param swap only, folded into baseline |
| `0010_consent_newer_version.sql` | Rewritten: param swap only, folded into baseline |
| `0011_start_trip_position.sql` | Folded into baseline from day one — must not reintroduce the bug |

## Scope cut: Resend and R2

Neither has current usage. `src/server/email/*` and `src/server/storage.ts` exist as infrastructure only (N0) — not wired to any flow. Future plug-in points: R2 for a POD-evidence/driver-document upload feature (bucket `namma-lorry-pod-evidence` already declared in `wrangler.toml`); Resend for an admin-notification-on-review email via the N7 cron-endpoint pattern.

## Security checklist (run before the N11 cutover merge)

- [ ] No `EXPO_PUBLIC_*` var contains `DATABASE_URL`, `CLERK_SECRET_KEY`, Mappls private keys, or `CRON_SECRET` — grep the `dist/` web export (CI already does this for the N0 server modules; extend as N1+ land)
- [ ] Every mutating endpoint resolves `p_driver_id`/`p_actor_id` only from the verified Clerk session, never the request body
- [ ] A profile-less Clerk user gets 403 from every endpoint
- [ ] Admin-only endpoints re-check `is_admin(p_actor_id)` inside Postgres, not just in TypeScript middleware
- [ ] `test/db/start-trip-race.sh`'s concurrency scenario still returns `ANOTHER_TRIP_ACTIVE`
- [ ] `trip_points` insert still idempotent on `(trip_id, seq)`
- [ ] `verify_trip`'s output is bit-identical on a fixed synthetic trip, before vs. after
- [ ] Consent-version gating still blocks `start_trip` end-to-end
- [ ] GPS retention/erasure jobs run on schedule via Cron Trigger, confirmed in Cloudflare logs
- [ ] `_headers`' CSP has no leftover Supabase domains
- [ ] No RLS policy grants anything beyond the single `app_role` the Functions connect as

## Open items (human/dashboard — not blocking code work, but block live verification)

1. **Create the Neon project** (confirm PostGIS available; leave pg_cron off), **the Clerk app** (phone sign-in, public sign-up disabled), **the Cloudflare Pages project**. Set `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `R2_*` in the Cloudflare Pages dashboard per `docs/ENVIRONMENT.md` — never in a committed file.
2. **Rotate the Resend API key** that was pasted in plain text in chat during N0's session — do this regardless of migration progress.
3. Confirm Clerk's Backend API accepts an admin-asserted, pre-OTP phone number (needed for N6's `admin-create-driver` port).
4. Confirm whether Cloudflare Cron Triggers attach directly to a Pages project or need a companion Worker (N7).
5. Confirm Clerk's test/mock phone number mechanism for CI and local seed data (N11).
6. No production driver/trip data exists yet — N1 can start from a fresh schema baseline with no data-migration step.
