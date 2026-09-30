# PHASE1_TASKS — Namma Lorry Phase 1 (single source of truth for progress)

**Created:** 27 Sep 2026 (Prompt 1) · **Planned start:** Mon 28 Sep 2026 (doc 01)
**How to use:**
- Every session starts by reading `CLAUDE.md` and this file.
- Tick boxes only when the acceptance criteria are met.
- Append to the **Progress log** at the bottom; never rewrite old entries.
- Anything unresolved goes to **Needs decision**, never guessed.

**Doc locations used for this plan.** The canonical pack will move to the repo root in pre-flight, and these paths will then be updated.
- The newest pack is `namma-lorry-phase1-docs/namma-lorry-phase1-docs/`. It is a superset of the older pack: it adds `docs/12`, `docs/13`, `stitch/DESIGN.md` and an updated `docs/04`.
- References below use pack-relative names (`CLAUDE.md`, `docs/02-PRD.md`, …).
- `docs/13-claude-code-prompts.md` **supersedes** `docs/11-build-prompts.md`.
- `docs/12-screens-and-stitch-prompts.md` **supersedes** the screen list and IDs in `docs/04`.

Legend: `[ ]` todo · `[x]` done · `[~]` partial · 🧍 human checkpoint (from doc 13 unless marked *added*) · **ND-n** = see Needs decision.

---

## 1. Decisions

### 1.1 Decided (backed by docs or audit facts)
| Area | Decision | Source |
|---|---|---|
| Fresh vs adapt | **Fresh Expo app.** The folder contains no app code of any kind (no Expo, Kotlin, OSM or JS prototype), so there is nothing to adapt or port. | Audit §Existing projects, §Recommendation |
| App framework | Expo, TypeScript strict, Expo Router (file-based), **EAS development builds** (not Expo Go) | CLAUDE.md, TRD §2 |
| Platforms | Android + iOS driver app; web = ops console from the same codebase. Web never runs trips. | CLAUDE.md rule 8, TRD §4.4 |
| Maps | **Mappls only**: `mappls-map-react-native` (native) + Mappls Web Maps JS SDK (web). No OSM/Google/Mapbox tiles, no `react-native-maps`. | CLAUDE.md, doc 07 §3 |
| Location | `expo-location` + `expo-task-manager` (background, foreground service), `expo-sqlite` queue, `expo-secure-store` session | CLAUDE.md, TRD §2 |
| State / forms | TanStack Query, Zustand, react-hook-form + zod | CLAUDE.md |
| i18n | i18next + react-i18next; strings in `src/i18n/` (en first; ta/kn/hi keys with TODO values) | CLAUDE.md rule 10, doc 13 P2/P13 |
| Backend | Supabase: Postgres + PostGIS, Auth (phone OTP), Realtime, Edge Functions (Deno), pg_cron | CLAUDE.md, TRD §6 |
| Schema | `0001_phase1_schema.sql` is applied **unchanged**; every change goes in a new migration (`0002_consent.sql` is already written at the repo root; then `0003_phase1_fixes.sql`) | doc 11 hygiene, doc 13 P5 |
| Verification | Only in Postgres (`verify_trip`); app km is always labelled "approx." | CLAUDE.md rule 1, doc 08 |
| Testing | pgTAP (`supabase test db`), Jest (jest-expo) + RNTL, Playwright (web), Deno tests (edge functions), optional Maestro | doc 10 §1, doc 13 |
| Monitoring | Sentry (`@sentry/react-native` + web), PII scrubbed | TRD §2, doc 13 P13 |
| CI | GitHub Actions: install, typecheck, lint, test (+ `supabase test db` later) | TRD §2, doc 13 P2 |
| Screen IDs | **Doc 12 IDs everywhere**: S1–S4, D1–D8, C1–C9 (21 screens + 6 overlays). C8 "Review decision" from doc 04 is merged into C6. | doc 12 §1, doc 04 (updated) |
| Driver creation | Admin-only Edge Function `admin-create-driver` (service role creates auth user + profile) | doc 13 P7, audit Supabase issue 3 |
| Workflow | One prompt per session, plan mode first, `/clear` between prompts, a branch + commit per prompt | doc 13 "How to run" |

### 1.2 Versions (latest on npm as of 26 Sep 2026, from the audit; **pinning pending ND-7**)
| Package / tool | Version seen | Note |
|---|---|---|
| expo | 57.0.25 (→ react-native 0.87.1) | "Latest stable, pin versions" (doc 13 P2), unless the Mappls spike fails |
| expo-location | 57.0.20 | |
| mappls-map-react-native | 2.0.3 | Built against RN 0.79.4; its shipped `app.plugin.js` is broken, so a local `plugins/withMappls.ts` is required |
| mappls-tracking-react-native | 1.0.0 | Optional, not planned |
| eas-cli | 24.8.0 | not installed locally |
| supabase CLI | 2.118.0 | not installed; use `npx supabase` |
| Node (sandbox) | 22.23.2 | OK for Expo tooling; the user's Windows host runs 26.8.1 (non-LTS, R9) |
| JDK (Windows host) | 17.0.20 | correct for RN Android builds |

### 1.3 Proposed folder layout (pending ND-1 pre-flight approval and ND-9 reconciliation)
```
<repo root>/
├─ CLAUDE.md  AGENTS.md  README.md  .env.example  .gitignore
├─ app.config.ts  eas.json  package.json  tsconfig.json  babel.config.js  eslint.config.js  jest.config.js
├─ plugins/withMappls.ts
├─ app/                          routes, see §4 Screen checklist
├─ src/
│  ├─ components/{map/{types.ts,MapView.native.tsx,MapView.web.tsx},ui/,console/}
│  ├─ features/{auth,loads,trips,review,live-map,drivers,vehicles}/
│  ├─ tracking/{task.ts,stateMachine.ts,queue.ts,db.ts,uploader.ts,permissions.ts,config.ts,errors.ts}
│  ├─ lib/{supabase.ts,mappls.ts,geo.ts,sentry.ts,config.ts,database.types.ts}
│  ├─ theme/tokens.ts
│  └─ i18n/{index.ts,en.json,ta.json,kn.json,hi.json}
├─ supabase/{config.toml,seed.sql,migrations/,functions/{mappls-proxy,admin-create-driver}/,tests/}
├─ design/                       Stitch PNG/HTML renamed by screen ID (e.g. D5-active-trip.png)
├─ stitch/DESIGN.md
├─ test/gpx/                     emulator routes (M12b)
├─ docs/                         00-repo-audit, 01–13, PHASE1_TASKS, DEV_SETUP, HARDENING_REPORT, FIELD_TEST_SCRIPT, RUNBOOK, release/
└─ .github/workflows/ci.yml
```

---

## 2. Needs decision

The audit's questions **have not been answered in `docs/00-repo-audit.md` as of 27 Sep 2026** (the Questions section is unchanged), so these remain open. None has been guessed. Items marked *blocks* stop the named milestone.

### 2.1 Open audit questions (ND-1…ND-7)
| ID | Question | Blocks |
|---|---|---|
| ND-1 | Pre-flight restructure: promote the newest pack to the root, keep root `supabase/` as canonical, move `SCREENS/` → `design/` with doc-12 names, drop verified duplicates and the nested pack + zip. Approved? | Pre-flight / M1 |
| ND-2 | Mappls account: which credentials exist (map SDK key, REST client id/secret/key)? Is the web SDK enabled and the key domain-restricted? | M3, M6 |
| ND-3 | iOS: Apple Developer account + physical iPhone available? If not, is M3's exit criterion (and W0's) reduced to Android + web, with iOS deferred? | M3, M12c |
| ND-4 | ~~Supabase: hosted staging project (recommended) or local only via Docker on the Windows host?~~ **Answered in M4:** both. Hosted staging is `qykqflshvsldzvdpwtni` (project URL + publishable key go into Settings → Environment; secret key stays server-side). Local Docker runs migrations, the seed and the pgTAP suite. See `docs/DEV_SETUP.md` §1. | M4 (closed) |
| ND-5 | Client sign-offs: written approval of RN + Mappls; who registers drivers (admin only vs self-signup with approval); "transporter" meaning; multi-drop (assumed no); raw-GPS retention period. **Retention proposed 29 Sep (B3):** 12 months after the trip is final, then a simplified route (≤ 500 points) + the trip result — `app_settings.raw_point_retention_days = 365`, **pending client sign-off** (changing it needs no release). **Erasure decided 29 Sep:** anonymise and keep trip results + `driver_stats`. | M5 (auth), pilot |
| ND-6 | Stationary trucks: 25 m `distanceInterval` produces no points while parked. That triggers `TRACKING_GAP` (>15 min) and `LOW_COVERAGE` (<60/h) on genuine trips, and M10's "no point for > 2 min" banner. Heartbeat while stationary, or judge gaps on moving time only? **Resolved in M8:** the fix is on the capture side, not in gap detection. `distanceInterval` is `0` (the OS movement gate is off, so updates keep arriving while parked) and the queue writer thins them with `shouldRecord` — a row per 25 m moved, or one keep-alive per 5 min parked, comfortably under the 15-min gap. The extra OS wake-up while parked is the cost, to be measured against PRD §9 in M10's field test. Docs 03/08 still need the wording change. | M8, M10 |
| ND-7 | If the Mappls spike fails on Expo SDK 57 / RN 0.87, is pinning an older Expo SDK acceptable? | M1 pinning, M3 |

### 2.2 Contradictions and gaps between docs (ND-8…ND-24)
| ID | Conflict | Where | Proposed resolution (needs approval) |
|---|---|---|---|
| ND-8 | **Point-upload poison batch / clock skew.** RLS rejects rows with device time > server now + 2 min or < `started_at` − 1 min. One bad row fails the whole 200-row upsert, and the uploader then retries forever. **Resolved in M8 by quarantining, not by a migration:** rows provably outside the window (`started_at` − 1 min) are dropped before sending, and if the server still rejects a batch the uploader re-sends it row by row and quarantines the rows that fail (`quarantined` + `quarantine_reason` on the local `point_queue`), so a poison row is never retried while the good points still land. A quarantined row leaves `received < expected_points`, so the trip is flagged `MISSING_POINTS` rather than silently verified — the honest outcome. | 0001 `points_driver_insert` vs TRD §4.3 / doc 13 P9 uploader |
| ND-9 | Folder layout differs. CLAUDE.md: `src/features/tracking` + `src/tracking/`, `config.ts` and `db.ts` in `src/lib/`. TRD: `src/tracking/config.ts`, adds `lib/geo.ts`, `lib/sentry.ts`. Doc 13 P9: `db.ts` in `src/tracking/`. Doc 12/13 add `src/theme/`, `plugins/`, `/dev/*` routes. | CLAUDE.md, TRD §3, doc 13 | Adopt the §1.3 layout and update CLAUDE.md/TRD to match in M1. |
| ND-10 | Web audience: CLAUDE.md "Web is a console (admin / owner / shipper)" vs PRD §3 / doc 04 "admin-only; owner/shipper → Coming soon" | CLAUDE.md rule 8 vs PRD | Admin-only in Phase 1 (PRD wins); fix the CLAUDE.md wording. |
| ND-11 | `SENTRY_DSN` is listed as server-only, but the RN/web app needs it in the bundle. `SENTRY_AUTH_TOKEN` (source maps) is not listed. | `.env.example` vs doc 13 P13 | Add `EXPO_PUBLIC_SENTRY_DSN`; add `SENTRY_AUTH_TOKEN` as an EAS secret. **Done 29 Sep (B4):** the app reads `EXPO_PUBLIC_SENTRY_DSN` (empty = off); `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` are build-only and switch on the source-map plugin. The DSN and the EAS secrets themselves are still to be created. |
| ND-12 | Unregistered numbers: the PRD says refuse them, but `handle_new_user` auto-creates a driver profile for **any** OTP sign-in. | PRD P0-1 vs 0001 | `signInWithOtp({ shouldCreateUser: false })` + `admin-create-driver`; depends on ND-5. |
| ND-13 | Admin bypass: hard rule 2 says status changes only via RPCs, but RLS `trips_admin` is `for all`, so an admin client can set `status`/`tracked_distance_m` directly with no audit or stats. No `cancel_trip` RPC exists, so `cancelled` is otherwise unreachable. | CLAUDE.md rule 2 vs 0001 | New migration: admin `select/insert` only on trips + a `cancel_trip` RPC. **Decided and done 29 Sep (validation B2, `0005_admin_trip_writes.sql`):** admin SELECT + INSERT of a fresh `assigned` trip only; `cancel_trip` and `admin_force_end` RPCs, note required, actor logged. `admin_revoke_trip` / `recompute_driver_stats` (docs/14 R2) are not built yet. |
| ND-14 | D6 needs realtime on the `trips` row, but only `trip_live` is in the `supabase_realtime` publication. | doc 13 P11 vs 0001 | Add `trips` to the publication in a migration, or poll (doc 13 allows a polling fallback). |
| ND-15 | Live delay target: doc 01 W4 exit says "~30 s"; PRD goal 4 and doc 10 scenario 11 say "≤ 60 s". | doc 01 vs PRD | Use ≤ 60 s as acceptance, ~30 s as the target. |
| ND-16 | Icons: DESIGN.md / doc 13 P3 say Material Symbols **Rounded**; the Stitch exports use Outlined in most files (Rounded in 3). | stitch/DESIGN.md vs SCREENS | Rounded (docs win). |
| ND-17 | Two token palettes. The brief: primary #0F2A44, accent #F5A300, bg #F6F7F9, error #D93025. Stitch `SCREENS/namma_lorry/DESIGN.md`: primary #00152a, secondary #825500 / #feaa11, bg #f8f9ff, error #ba1a1a. | stitch/DESIGN.md vs Stitch export | Brief (`stitch/DESIGN.md`) wins; the Stitch token file is reference only. |
| ND-18 | Stitch mocks contain out-of-scope features and non-compliant copy: FASTag, Fleet SOS, ratings, e-Way Bill, POD/settlement, "Live Trip Navigation", certification claims, and a disclosure saying location "unlocks priority loads and verified payouts". | SCREENS/* vs PRD §3, doc 09 §1 | Ignore these elements; disclosure text comes from doc 09 only. Record the list in `design/README.md`. |
| ND-19 | Doc 12 console prompts reference data the schema lacks: **permission-health dot** on C8 Drivers, **"Send invite SMS"** toggle on Add Driver, **shipper select** on C3 and **owner select** on C9 (no way to create owner/shipper profiles), **CSV export** on C5. | doc 12 §6 vs 0001 / PRD | Suggest: drop the permission dot and the SMS invite for Phase 1; make shipper/owner optional and hidden until an admin can create those roles; CSV export optional (P1). |
| ND-20 | Loads list status (unassigned / assigned / in trip / done) has no column on `loads`. | doc 04/12 C2 vs 0001 | Derive from the latest trip (view or query); no schema change. |
| ND-21 | Where verification-fix migrations land: doc 13 P5 (M4) applies 0001 unchanged plus 0002 consent only. The audit fixes (ND-8, ND-12, ND-13, ND-14, `GPS_JUMPS` into `app_settings`, `admin_review_trip` not-found, `setting()` search_path) have no milestone. | doc 13 vs audit | Add `0003_phase1_fixes.sql` to M4 (listed as optional tasks there). |
| ND-22 | Replay slider (C6) and multi-language files are **P1** in the PRD but are built in M11 / M12a per doc 13. | PRD §6 P1 vs doc 13 | Keep them as doc 13 says (no conflict in intent). Confirm they're not release blockers. |
| ND-23 | S1 Splash and S4 Access Notice have **no route** in the doc 04 route tree. | doc 12 vs doc 04 | `app/index.tsx` (S1) and `app/access-notice.tsx` (S4). |
| ND-24 | The doc 13 prerequisite "put the pack in the repo root and design PNGs in `design/` named by screen ID" is not done. | doc 13 vs folder state | Pre-flight tasks, gated on ND-1. |

---

## 3. Milestones

Doc 13 mapping: Prompt 0 = audit (done), Prompt 1 = this plan (done), then **M1…M11 = Prompts 2…12**, and **M12 = Prompts 13–15 (M12a hardening, M12b acceptance tests, M12c release)**.

### Pre-flight (before M1; gated on ND-1, ND-24)
- [ ] Answer ND-1…ND-7 in `docs/00-repo-audit.md`
- [ ] Promote the newest pack to the root (`CLAUDE.md`, `AGENTS.md`, `.env.example`, `docs/01–13`, `supabase/` content already at root, `stitch/DESIGN.md`); delete the verified duplicates
- [ ] `SCREENS/` → `design/` renamed by doc 12 ID, plus a `design/README.md` listing ignored elements (ND-18)
- [ ] Delete the old pack folder and `namma-lorry-phase1-docs.zip`
- [ ] 🧍 *(added)* Provide the missing keys/accounts per ND-2…ND-4; on the Windows host, keep Docker Desktop + `ANDROID_HOME` set for native work

---

### M1 — Scaffold the app (Prompt 2)
**Tasks**
- [x] Expo app (TS strict, Expo Router) at the repo root, latest stable SDK, **exact versions pinned** (ND-7)
- [x] Install: supabase-js, expo-secure-store, expo-location, expo-task-manager, expo-sqlite, @react-native-community/netinfo, expo-device, expo-application, expo-dev-client, @tanstack/react-query, zustand, zod, react-hook-form, i18next, react-i18next
- [x] ESLint + Prettier; path alias `@/` → `src/`; Jest (jest-expo) + RNTL; scripts `typecheck`, `lint`, `test`
- [x] `app.config.ts` reading `EXPO_PUBLIC_*`; `.env.example` in sync (incl. ND-11); `src/lib/config.ts` zod-validates env and fails loudly in dev
- [x] `eas.json` with development / preview / production profiles
- [x] GitHub Actions: install, typecheck, lint, test
- [x] Placeholder route for **every** screen in §4 (renders screen ID + title)
- [~] Update CLAUDE.md / TRD layout per ND-9 (after approval) — CLAUDE.md/AGENTS.md done 29 Sep (docs pack PR); TRD §3 not yet

**Files expected:** `package.json`, `app.config.ts`, `eas.json`, `tsconfig.json`, `babel.config.js`, `eslint.config.js`, `.prettierrc`, `jest.config.js`, `.github/workflows/ci.yml`, `src/lib/config.ts`, `app/_layout.tsx`, all route files in §4 (placeholders), `.env.example`.

**Acceptance**
- `npm run typecheck`, `npm run lint`, `npm test` pass locally and in CI
- `npx expo start --web` renders the placeholder S2 sign-in route
- No old-prototype code ported (none exists)

**Human checkpoints:** none in doc 13. *(Added)* Review the pinned versions.

---

### M2 — Design tokens & UI kit (Prompt 3)
**Tasks**
- [x] `src/theme/tokens.ts`: colours (ND-17: brief palette), Noto Sans via expo-font, type scale, 8 px spacing, radii, shadows, status colours
- [x] `src/components/ui/`: Button (primary, secondary, danger, success, outline, text; sizes incl. 64 px driver primary; loading/disabled), Card, Chip/StatusChip (6 statuses: text + colour + icon), TextField, PhoneInput (+91), OtpInput (6), ListRow, Banner (info/warn/error/offline), BottomSheet, ConfirmSheet, EmptyState, StatBlock, Screen, SectionHeader
- [x] Console primitives (web): Sidebar, TopBar, DataTable (sortable, sticky header, pagination), Drawer, Modal
- [x] Icons: Material Symbols Rounded (ND-16) or the closest maintained RN package
- [x] `/dev/kitchen-sink` route (dev only)
- [x] Unit tests: StatusChip mapping (doc 06 §5 labels), Button states

**Files expected:** `src/theme/tokens.ts`, `src/components/ui/*.tsx`, `src/components/console/*.tsx`, `app/dev/kitchen-sink.tsx`, tests alongside.

**Acceptance**
- No raw hex values in screens (grep check)
- Touch targets ≥ 48 px; driver primary 56–64 px (DESIGN.md, TRD §9)
- Status chips never rely on colour alone (DESIGN.md)
- Tests pass

**Human checkpoints:** none in doc 13. *(Added)* Eyeball the kitchen sink against `design/` PNGs.

---

### M3 — Mappls on Android, iOS and web (Prompt 4)
**Status:** code complete; **native device verification (🧍) is pending** — it needs the Mappls credentials (ND-2) and an Android build. Web bundle compiles and the Mappls Web SDK loader is wired, but the map cannot render until the key is set.

**Tasks**
- [x] Research the current `mappls-map-react-native` install (maven repo, iOS config files, key setup); **list the required native files and keys before coding** — see `plugins/withMappls.ts` docblock and the M3 progress-log entry
- [x] `plugins/withMappls.ts` local config plugin (the shipped plugin is broken, R1); no hand-edited `android/`/`ios/` unless impossible (explain) — the published `app.plugin.js` requires `./plugin/build/withMappls`, which is not in the tarball, so the local plugin is required; `android/` and `ios/` stay generated+gitignored
- [x] `src/components/map/types.ts` (`AppMapProps` exactly as TRD §5), `MapView.native.tsx`, `MapView.web.tsx` (script-loader hook, loads once)
- [x] `{lat,lng}` ↔ `[lng,lat]` only inside map components (plus the web SDK's own `[lat,lng]` GeoJSON quirk)
- [x] `src/lib/geo.ts`: haversine, circle polygon, bearing + unit tests
- [x] `/dev/map`: pickup circle, drop pin, dashed planned route, actual route, rotated truck marker, "fit to content"

**Files expected:** `plugins/withMappls.ts`, `src/components/map/{types.ts,MapView.native.tsx,MapView.web.tsx,useMapplsScript.ts}`, `src/lib/geo.ts` + tests, `app/dev/map.tsx`. *(Added: `src/components/map/{bounds.ts,mappls-native.ts,mappls-web.ts,index.ts}`.)*

**Acceptance**
- Dev build on a **real Android phone** shows a Mappls map with the blue dot, circle, polyline and marker (doc 01 W0 exit)
- Web shows the same map (doc 01 W0)
- iOS: same on a device, **or** deferred per ND-3
- No non-Mappls tiles or SDKs in the dependency tree (grep `react-native-maps|leaflet|mapbox|openstreetmap`)

**Human checkpoints:** 🧍 Add Mappls keys/config files; run `eas build --profile development` or `npx expo run:android`; confirm the map on a real phone and on web; report problems in the same session.

---

### M4 — Supabase backend (Prompt 5)
**Tasks**
- [x] `supabase init` / `start` (Docker, ND-4); apply `0001` **unchanged**. `0001` and `0002_consent.sql` both apply with **zero errors** on Postgres 14 + PostGIS 3 + pg_cron, so no follow-up migration was needed and nothing was edited.
- [ ] *(Pending ND-21)* `0003_phase1_fixes.sql`: ND-8 point-upload handling, ND-12 registration, ND-13 admin trip writes + `cancel_trip`, ND-14 trips realtime, `GPS_JUMPS` threshold into `app_settings`, `admin_review_trip` not-found, `setting()` search_path
- [ ] *(Pending ND-6)* Verification change for stationary gaps, if chosen server-side
- [x] pgTAP tests in `supabase/tests/` converted from `smoke_phase1.sql` — **135 cases across 4 files, all green**:
  - [x] every RLS policy — `01_rls_policies.test.sql` (46)
  - [x] every RPC error code (doc 06) — `02_rpc_errors.test.sql` (28)
  - [x] every reason code (doc 08) — `03_verification_reasons.test.sql` (26)
  - [x] a late point upload triggers verification — `04_verification_triggers.test.sql`
  - [x] the sweeper — `04_verification_triggers.test.sql`
  - [x] admin review increments stats exactly once — `04_verification_triggers.test.sql`
  - [x] *(added)* `record_consent` (0002) and the `GRANT`/`REVOKE` boundary
- [x] `supabase/seed.sql`: verified against M4 acceptance — 1 admin + 3 drivers on 919000000001/11/12/13, 3 vehicles, 4 TN/KA loads, 1 assigned trip; loads after reset
- [x] `src/lib/database.types.ts` (generated) + typed `src/lib/supabase.ts` (secure-store on native, localStorage-safe on web)
- [x] `docs/DEV_SETUP.md`: test phone numbers/OTP for local and hosted

**Files expected:** `supabase/migrations/0002_consent.sql` (exists), `0003_*` (if approved), `supabase/tests/*.test.sql`, `supabase/seed.sql` (exists), `src/lib/database.types.ts`, `src/lib/supabase.ts`, `docs/DEV_SETUP.md`.

**Acceptance**
- [x] `supabase db reset && supabase test db` passes — **135/135** from a clean database
- [x] pgTAP proves: a driver cannot update `trips`, insert `driver_stats`, or read other drivers' trips/points; an admin can (doc 10 §1; scenario 9)
- [x] Error codes `TRIP_NOT_FOUND`, `TRIP_NOT_STARTABLE`, `ANOTHER_TRIP_ACTIVE`, `GPS_ACCURACY_TOO_LOW`, `OUTSIDE_PICKUP:<m>`, `TRIP_NOT_ACTIVE`, `FORBIDDEN`, `NOTE_REQUIRED`, `TRIP_NOT_IN_REVIEW` are each covered
- [x] All 10 reason codes in doc 08 §3 are produced by a test case
- [x] Scenarios 8 (sweeper → `MISSING_POINTS`), 10 (`ANOTHER_TRIP_ACTIVE`) and 12 (approve → verified, stats +1 once, event logged) pass at DB level

**Human checkpoints:** none in doc 13. *(Added)* Confirm Docker is running or the staging project is linked; review the migration diff before merge.

---

### M5 — Auth, roles and routing (Prompt 6)
**Status:** code complete; the 🧍 sign-in check is pending (it needs the Supabase keys in Settings → Environment).

**Tasks**
- [x] S1 Splash, S2 Sign in, S3 Verify OTP, S4 Access Notice (variants: driver-on-web, owner/shipper coming soon, deactivated, plus a fourth "not set up" for a session with no profile row)
- [x] Phone OTP via Supabase; +91 zod validation; 30 s resend timer; error states: unregistered, wrong code, expired, rate-limited (ND-12, `shouldCreateUser: false`)
- [x] Zustand auth store + TanStack Query profile; role gate per doc 04 §2
- [x] Splash checks local tracking state (stub until M8, `src/tracking/localState.ts`); sign-out blocked while a trip is active (`signOutBlockReason`)
- [x] Routing decision as a **pure function** + unit tests for every role × platform × state combination
- [x] Screens match `design/` S2/S3 via the UI kit (Stitch-only extras from ND-18 — cab keypad, trust badge, fake safety claims — left out)

**Files expected:** `app/index.tsx`, `app/(auth)/{_layout,sign-in,verify}.tsx`, `app/access-notice.tsx`, `src/features/auth/{store.ts,useProfile.ts,routing.ts,routing.test.ts,schemas.ts}`. *(Added: `api.ts`, `errors.ts` + test, `schemas.test.ts`, `platform.ts`, `useAuthBootstrap.ts`, `src/tracking/localState.ts`, `app/index.test.tsx`.)*

**Acceptance (PRD P0-1)**
- [x] A registered driver who enters the OTP lands on driver home (D3, or D1 if permissions are missing) — the decision is covered by `routing.test.ts` and the navigation by `app/index.test.tsx`; the live sign-in is the 🧍 step
- [x] An admin lands on C1
- [x] Unknown numbers see "Contact Namma Lorry to register"
- [x] Driver on web → S4 "use the mobile app"; owner/shipper → S4 "coming soon"; inactive → S4 deactivated
- [x] Session in secure-store on native (unchanged from M4; M5 keeps using the same client)
- [x] Routing unit tests pass

**Human checkpoints:** 🧍 Log in as the seeded admin and driver on web and on the phone (see `docs/DEV_SETUP.md` §3 for the numbers and OTPs). Needs `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in Settings → Environment.

---

### M6 — Console shell, drivers, vehicles, Mappls proxy (Prompt 7)
**Tasks**
- [x] Console layout (web): sidebar (Live, Loads, Trips, Review + count badge, Drivers, Vehicles), top bar with search + avatar menu, admin-only guard
- [x] C8 Drivers: table (name, phone, verified trips, verified km, last trip, status) + Add Driver drawer via Edge Function `admin-create-driver` (service role server-side, caller must be admin); ND-19 items excluded unless approved
- [x] C9 Vehicles: table + Add Vehicle modal (Indian registration validation, vehicle type select: 407 / 14 / 17 / 19 / 20 / 22 / 24 ft / multi-axle; owner per ND-19)
- [x] Edge Function `mappls-proxy` per doc 06 §4:
  - verify JWT and `is_admin()`
  - actions `autosuggest`, `geocode`, `reverse`, `distance`
  - normalised shapes, per-user rate limit, secrets from `supabase secrets`
  - research the current Mappls REST auth and note it in the function README
- [x] `src/lib/mappls.ts` typed client
- [x] Deno tests for both functions with mocked Mappls responses

**Files expected:** `app/(console)/_layout.tsx`, `app/(console)/drivers/index.tsx`, `app/(console)/vehicles/index.tsx`, `supabase/functions/mappls-proxy/{index.ts,README.md,*_test.ts}`, `supabase/functions/admin-create-driver/{index.ts,*_test.ts}`, `src/lib/mappls.ts`, `src/features/{drivers,vehicles}/*`. *(Added: `supabase/functions/mappls-proxy/proxy.ts` + `deno.json`; `supabase/functions/admin-create-driver/{driver.ts,README.md}`; `src/features/console/searchStore.ts`; `src/components/console/UserMenu.tsx`; `src/i18n/i18n.test.ts`; `src/features/auth/splash.test.tsx`, moved out of `app/`.)*

**Acceptance**
- [x] A non-admin JWT gets 403 from both functions
- [x] The service role key appears nowhere in the client bundle (grep)
- [ ] Admin adds a driver, who can then sign in (ties to P0-1) — blocked on the 🧍 below
- [x] Deno tests pass (35)

**Human checkpoints:** 🧍 Set Mappls REST secrets in Supabase, deploy functions, try autosuggest.

---

### M7 — Loads and assignment (Prompt 8)
**Tasks**
- [x] C3 Create Load:
  - pickup/drop autosuggest via proxy, draggable pin
  - radius slider 100–2,000 m (default 500) drawn as a circle
  - material, weight, shipper (ND-19), notes
  - on save, fetch planned distance → `planned_distance_m`
  - load code generated by the DB
- [x] C4 Load Detail & Assign: both geofences + planned route; driver search with verified stats and a busy warning; vehicle select; creates a `trips` row; shows the resulting trip
- [x] C2 Loads and C5 Trips: server-side pagination, filters, search; status chips; load status derived (ND-20)
- [x] Shared zod schemas `src/features/loads/schemas.ts`
- [x] Playwright test: admin creates a load and assigns it

**Files expected:** `app/(console)/loads/{index,new,[id]}.tsx`, `app/(console)/trips/index.tsx`, `src/features/loads/*`, `src/features/trips/*` (console queries), `e2e/create-load.spec.ts`, `playwright.config.ts`. *(Added: `src/features/loads/{AddressPicker.tsx,useLoads.ts,schemas.test.ts}`; `src/features/trips/useTrips.test.ts`; `src/components/console/{Pager,FilterTabs,SearchSelect,LoadStatusChip}.tsx`; `e2e/support/console.ts`.)*

**Acceptance (PRD P0-2, P0-3)**
- [x] Load ID format `NL-YYYY-NNNNNN`; pickup/drop via autosuggest or pin; radius default 500 m; material and weight optional; planned distance fetched from Mappls
- [x] One driver + one vehicle per trip; one open trip per load (DB index)
- [ ] Admin creates a load end-to-end in < 2 min (doc 01 W2) — needs a live Supabase + deployed proxy (blocked, see the log)
- [ ] Playwright spec passes — the spec is written, type-checked and discovered, but **skips** without the E2E credentials and a live backend

**Human checkpoints:** none in doc 13.

---

### M8 — Tracking engine, core without UI (Prompt 9)
**Prerequisite decisions:** ND-6 (stationary heartbeat) and ND-8 (poison batch) — **both resolved in M8**; see the decision register for the chosen answers.

**Tasks**
- [x] `config.ts`: `TRACKING_OPTIONS` from TRD §4.2 (adjusted per ND-6) — `distanceInterval` is `0` and the movement gate moved into `shouldRecord`
- [x] `db.ts` / `queue.ts`: `trip_state {trip_id, state, next_seq, started_at, ended_at, end_lat, end_lng, end_accuracy}` + `point_queue` (TRD §4.3); seq persisted and never reused — plus the ND-8 `quarantined` / `quarantine_reason` columns
- [x] `task.ts`: `TaskManager.defineTask` at module top level, imported first in `app/_layout.tsx`; maps LocationObject → rows (incl. `mocked`); fast, never throws
- [x] `uploader.ts`: every 30 s + NetInfo reconnect + app foreground; ≤ 200 rows; upsert `onConflict: 'trip_id,seq', ignoreDuplicates`; mark uploaded; exponential backoff with jitter; single-flight; ND-8 handling
- [x] `stateMachine.ts`: pure reducer IDLE → TRACKING → ENDING → ENDED / ENDED_PENDING_SYNC; side effects:
  - `startTrip(tripId)`: fresh fix → `start_trip` → persist → `startLocationUpdatesAsync`; never start if the RPC fails
  - `endTrip()`: stop → persist ENDING → flush → `end_trip`; offline → ENDED_PENDING_SYNC
  - `resumeOnLaunch()`
- [x] `errors.ts`: typed RPC errors (`OUTSIDE_PICKUP:<m>` parsed to metres, etc.)
- [x] Delete uploaded rows once the trip is final (TRD §4.3)
- [x] `/dev/tracking`: queue counts, state, last point, simulate points on web — the simulator runs the same `selectPoints` gate the task runs
- [x] Wire the real resume check into S1 Splash (replaces the M5 stub) — the resume runs in the launch bootstrap that S1's gate reads, because it must complete before the gate decides and must run once, not per render
- [x] Unit tests: reducer transitions, seq persistence, idempotent upload, backoff, error parsing, offline end → later sync, resume after kill — 109 tests in `src/tracking/*.test.ts`

**Files expected:** `src/tracking/{config,db,queue,task,uploader,stateMachine,errors,permissions}.ts` + `__tests__/`, `app/dev/tracking.tsx`. Built as expected, plus `src/tracking/service.ts` (the composition root that supplies the real Supabase/location/SQLite dependencies to the injected service) and a rewritten `src/tracking/localState.ts` (the M5 stub's real reader).

**Acceptance (PRD P0-6, P0-7, P0-9 core)**
- Points every ~10 s / 25 m while in progress (or per ND-6)
- Saved locally first, uploaded in batches, no duplicates, nothing lost across restarts
- End works offline and syncs later
- All listed unit tests pass
- Background task does no network I/O (TRD §4.2)

**Human checkpoints:** none in doc 13 (the real-device check comes in M9).

---

### M9 — Driver onboarding and trip start (Prompt 10)
**Tasks**
- [ ] D1 Location Permission:
  - prominent disclosure from doc 09 §1–§3 **before** any system dialog (ND-18: not the Stitch copy)
  - request foreground → background → notifications
  - status rows; "Open settings" when blocked
  - `record_consent` on continue
  - re-check on every foreground; route back to D1 if background location is lost
- [ ] D2 Battery Setup (Android only): `expo-device` manufacturer detection; instructions for Xiaomi/Redmi/POCO, Vivo/iQOO, Oppo/Realme/OnePlus, Samsung, generic; open settings via Linking/IntentLauncher
- [ ] `app.config.ts`: expo-location plugin (background + foreground service), iOS/Android permission strings from doc 09 §3, `UIBackgroundModes: location`
- [ ] D3 My Trips: live trip pinned with Resume, assigned list, empty and offline states, pull to refresh
- [ ] D4 Trip Detail & Start:
  - map with pickup circle, drop, planned route, live dot, distance to pickup
  - states: waiting for GPS, accuracy > 50 m, outside radius (distance, disabled), ready, starting
  - START → `tracking.startTrip` → D5
  - "Outside pickup" sheet overlay

**Files expected:** `app/(onboarding)/{_layout,permissions,battery}.tsx`, `app/(driver)/{_layout,index}.tsx`, `app/(driver)/trips/[id].tsx`, `src/features/trips/*`, `src/tracking/permissions.ts`, `app.config.ts` updates, RNTL tests for D4 button states (doc 10 §1).

**Acceptance (PRD P0-4, P0-5)**
- Start Trip is disabled until background permission is granted, with an explanation
- Within pickup radius + accuracy → trip `in_progress`
- Outside → distance shown, cannot start (scenario 4)
- Android persistent notification "Namma Lorry trip in progress" (P0-6)
- RNTL tests for D4 states pass

**Human checkpoints:** 🧍 On a real Android phone: complete onboarding, go to a seeded pickup (or create a load at your location), start a trip, lock the phone, walk/drive 10 min, check `trip_points` in Supabase.

---

### M10 — Active trip, end trip, summary (Prompt 11)
**Tasks**
- [ ] D5 Active Trip:
  - follows the truck; route drawn from the **local queue**
  - elapsed time, approx km (client haversine, labelled "approx."), km to drop
  - sync status (synced / N waiting / offline), GPS status
  - tracking-problem banner (no point > 2 min, subject to ND-6, or permission revoked)
  - near drop → banner + solid END
  - Android back does not stop tracking
- [ ] End Trip confirmation sheet; warning outside the drop radius; never blocks ending
- [ ] D6 Trip Summary: realtime on the trip row (ND-14) or polling fallback; Verifying → Verified / Needs review with plain-language reasons (i18n key per doc 08 §3 code) → totals from `driver_stats`; offline-ended variant
- [ ] Optional keep-awake setting (expo-keep-awake), off by default
- [ ] Component tests: D5 sync/GPS states, D6 status variants

**Files expected:** `app/(driver)/trips/[id]/live.tsx`, `app/(driver)/trips/[id]/summary.tsx`, `src/features/trips/{EndTripSheet,SyncStatus,GpsStatus,ReasonList}.tsx`, `src/i18n/en.json` reason keys, tests.

**Acceptance (PRD P0-9, P0-12 partial)**
- The driver can always end; a warning shows if not near the drop
- The app flushes the queue and calls `end_trip`; offline end syncs later (scenario 3)
- Ending 2 km before the drop → `needs_review` with `END_OUTSIDE_DROP` (scenario 5)
- Component tests pass

**Human checkpoints:** 🧍 Real trip: start, 20 min airplane mode mid-trip, end offline, reconnect → must verify with **zero missing points** (scenarios 2 + 3).

---

### M11 — Live console, review, history, profile (Prompt 12)
**Tasks**
- [ ] C1 Live Dashboard: all `in_progress` trips from `trip_live` on the Mappls web map; markers rotated by heading; side list with last-update age (red > 15 min); KPI strip; realtime with resubscribe + refetch on reconnect
- [ ] C6 Trip Detail & Review:
  - route from `trip_points` (1,000 per page) + live append; planned route dashed; start/end markers
  - replay slider (P1-1, ND-22)
  - metrics + reason chips; `trip_events` timeline
  - review panel only when `needs_review` → `admin_review_trip` with mandatory note; refetch after the decision (no optimistic UI)
- [ ] C7 Review Queue: `needs_review` oldest first, reason chips, mini map, opens C6, empty state "All caught up"
- [ ] D7 Trip History: status filters, grouped by month, → D6
- [ ] D8 My Profile: read-only `driver_stats` with the "can't be edited" caption, language picker sheet, permission/battery health check, privacy policy link, sign out (blocked during an active trip)

**Files expected:** `app/(console)/index.tsx`, `app/(console)/trips/[id].tsx`, `app/(console)/review/index.tsx`, `app/(driver)/{history,profile}.tsx`, `src/features/{live-map,review}/*`, `src/features/trips/ReplaySlider.tsx`, `LanguageSheet.tsx`.

**Acceptance (PRD P0-8, P0-11, P0-12)**
- Active trips show on the Mappls map; marker and polyline update without refresh; ≤ 60 s behind the phone (scenario 11; ND-15)
- Admin approves/rejects `needs_review` with a note; the decision is audited; approve → verified, stats +1 once (scenario 12)
- Driver sees trips with status and reason; counts and km only from the server

**Human checkpoints:** none in doc 13. *(Added)* Watch a live trip on C1 while the M9/M10 device test runs.

---

### M12 — Hardening, acceptance, release (Prompts 13–15)

#### M12a — Hardening, i18n, observability (Prompt 13)
- [ ] All strings → `src/i18n/en.json`; `ta.json`, `kn.json`, `hi.json` with the same keys (values prefixed `TODO`); language persisted per user (`profiles.preferred_language`)
- [ ] Global error boundary; network error states on every data screen; a message for every RPC error code
- [ ] Sentry native + web with release tagging; scrub phone numbers and coordinates (ND-11)
- [ ] Accessibility: labels, ≥ 48 px, font scaling on D4/D5, contrast against tokens
- [ ] Performance: memoised map layers, Douglas-Peucker simplification for display only, no network I/O in the background task
- [ ] Security review vs doc 09 §4–§5: secrets grep, no client writes to `trips`/`driver_stats`, service role only in functions, RLS tests cover every table
- [ ] Dev routes behind `__DEV__`
- [ ] `docs/HARDENING_REPORT.md`

**Files expected:** `src/i18n/*.json`, `src/lib/sentry.ts`, `src/components/ErrorBoundary.tsx`, `docs/HARDENING_REPORT.md`.

#### M12b — Acceptance scenarios (Prompt 14)
- [ ] Automate every doc 10 §4 scenario that can be automated (pgTAP, unit, Playwright, Maestro + GPX)
- [ ] `docs/FIELD_TEST_SCRIPT.md` for device-only scenarios + a results table template
- [ ] `test/gpx/sriperumbudur-coimbatore.gpx`, `test/gpx/hosur-peenya.gpx`
- [ ] Fix failures; list anything unverified
- [ ] Fill the pass/fail matrix below

| # | Scenario (doc 10 §4) | Expected | How proved | Result |
|---|---|---|---|---|
| 1 | Normal trip, network throughout | `verified`, km ±5 % of planned | pgTAP + field | ☐ |
| 2 | 20 min airplane mode | all points arrive; `verified` | unit + field (M10 🧍) | ☐ |
| 3 | End offline, reconnect 1 h later | `completed` → `verified` | pgTAP + unit + field | ☐ |
| 4 | Start 3 km from pickup | blocked, distance shown | pgTAP + RNTL + field | ☐ |
| 5 | End 2 km before drop | `needs_review` `END_OUTSIDE_DROP` | pgTAP + field | ☐ |
| 6 | Fake GPS app | `needs_review` `MOCK_LOCATION` | pgTAP + field | ☐ |
| 7 | Force-stopped 30 min | `needs_review` `TRACKING_GAP`; admin can approve | pgTAP + field | ☐ |
| 8 | Never reconnects after end | sweeper 6 h → `MISSING_POINTS` | pgTAP | ☐ |
| 9 | Driver REST update of `trips.status` | 0 rows / RLS error | pgTAP | ☐ |
| 10 | Two trips started | second `ANOTHER_TRIP_ACTIVE` | pgTAP + `test/db/start-trip-race.sh` | ☐ |
| 11 | Console live view | ≤ 60 s behind phone | field + C1 | ☐ |
| 12 | Admin approves flagged trip | `verified`, stats +1 once, event logged | pgTAP + Playwright | ☐ |

🧍 Run the field-test script on the brand matrix in doc 10 §3 (Xiaomi, Vivo/Oppo, Samsung A, Realme, iPhone per ND-3) and paste the results.

#### M12c — Release preparation (Prompt 15)
- [ ] `app.config.ts`: name, bundle id / package, version and build numbers, icons and splash (list missing assets), permission strings, foreground service verified in prebuild output
- [ ] EAS preview (APK/AAB + TestFlight per ND-3) and production profiles; env per profile; EAS Update channels
- [ ] Web console: `npx expo export -p web` ✅ (builds, in CI — validation B1, 29 Sep), Vercel (or Netlify) config, SPA fallback, security headers
- [ ] Hosted Supabase checklist: link staging/prod, push migrations, secrets, deploy functions, pg_cron job, SMS provider (DLT)
- [x] `docs/release/`: Play background-location declaration + video shot list, Data safety, Apple App Privacy, App Review notes + demo account, privacy policy (doc 09 §6, marked "requires legal review") — validation B5e, 30 Sep; drafts, legal review and the demo account are human items
- [x] `docs/RUNBOOK.md`: deploy, rollback, key rotation, stuck trip, re-run verification, data incident — validation B5e, 30 Sep
- [x] Final ordered list of manual steps for the human — `docs/release/README.md` checklist (B5e)

**Phase 1 definition of done (doc 01 §6)**
- [ ] 10 real pilot trips; ≥ 8 auto-verified; every flagged trip has a correct, human-readable reason
- [ ] No driver-editable path to trips, km or stats (RLS tests)
- [ ] Android on Play internal testing; iOS on TestFlight (ND-3); console on a public URL behind login
- [ ] Privacy policy published; consent screen shipped

---

## 4. Screen checklist (doc 12: 21 screens + 6 overlays)

Design ref = current Stitch export folder in `SCREENS/` (to be renamed into `design/` in pre-flight). "—" = not designed yet.

| ID | Screen | Platform | Route | Milestone | Design ref | Built |
|---|---|---|---|---|---|---|
| S1 | Splash | mobile + web | `app/index.tsx` *(ND-23)* | M5 (resume logic M8) | — | ☑ |
| S2 | Sign in | mobile + web | `app/(auth)/sign-in.tsx` | M5 | `1._sign_in` | ☑ |
| S3 | Verify OTP | mobile + web | `app/(auth)/verify.tsx` | M5 | `2._verify_otp` | ☑ |
| S4 | Access Notice (3 variants) | mobile + web | `app/access-notice.tsx` *(ND-23)* | M5 | — | ☑ |
| D1 | Location Permission | Android + iOS | `app/(onboarding)/permissions.tsx` | M9 | `3._location_permission` | ☐ |
| D2 | Battery Setup | Android | `app/(onboarding)/battery.tsx` | M9 | `4._battery_setup` | ☐ |
| D3 | My Trips | Android + iOS | `app/(driver)/index.tsx` | M9 | `5._my_trips_home` | ☐ |
| D4 | Trip Detail & Start | Android + iOS | `app/(driver)/trips/[id].tsx` | M9 | `6._trip_detail_start` | ☐ |
| D5 | Active Trip | Android + iOS | `app/(driver)/trips/[id]/live.tsx` | M10 | `7._active_trip` | ☐ |
| D6 | Trip Summary | Android + iOS | `app/(driver)/trips/[id]/summary.tsx` | M10 | `8._trip_summary` (verified only) | ☐ |
| D7 | Trip History | Android + iOS | `app/(driver)/history.tsx` | M11 | `9._trip_history_tab` | ☐ |
| D8 | My Profile | Android + iOS | `app/(driver)/profile.tsx` | M11 | `10._my_profile_tab` | ☐ |
| C1 | Live Dashboard | web | `app/(console)/index.tsx` | M11 | — | ☐ |
| C2 | Loads | web | `app/(console)/loads/index.tsx` | M7 | — | ☑ |
| C3 | Create Load | web | `app/(console)/loads/new.tsx` | M7 | — | ☑ |
| C4 | Load Detail & Assign | web | `app/(console)/loads/[id].tsx` | M7 | — | ☑ |
| C5 | Trips | web | `app/(console)/trips/index.tsx` | M7 | — | ☑ |
| C6 | Trip Detail & Review | web | `app/(console)/trips/[id].tsx` | M11 | — | ☐ |
| C7 | Review Queue | web | `app/(console)/review/index.tsx` | M11 | — | ☐ |
| C8 | Drivers | web | `app/(console)/drivers/index.tsx` | M6 | — | ☑ |
| C9 | Vehicles | web | `app/(console)/vehicles/index.tsx` | M6 | — | ☑ |

| Overlay | Used on | Milestone | Built |
|---|---|---|---|
| End Trip confirmation sheet | D5 | M10 | ☐ |
| "Outside pickup" sheet | D4 | M9 | ☐ |
| Tracking-problem banner (GPS off / permission revoked) | D5 (+ D3/D4 permission loss) | M10 (permission re-check M9) | ☐ |
| Add Driver modal/drawer | C8 | M6 | ☑ |
| Add Vehicle modal | C9 | M6 | ☑ |
| Language picker sheet | D8 (and the S2 "Change language" link) | M11 (S2 link M5) | ☐ |

Dev-only routes (not counted, hidden behind `__DEV__` in M12a): `/dev/kitchen-sink` (M2), `/dev/map` (M3), `/dev/tracking` (M8).

---

## 5. Traceability: PRD P0 → milestone → proof

| PRD | Requirement | Milestone(s) | Test that proves it |
|---|---|---|---|
| P0-1 | Phone-OTP login with roles; unknown numbers refused | M4 (seed, RLS, ND-12), M5, M6 (`admin-create-driver`) | `src/features/auth/routing.test.ts` (every role × platform); pgTAP `profiles` policies; 🧍 M5 login on web + phone |
| P0-2 | Admin creates a load (auto Load ID, autosuggest/pin, radius, planned distance) | M6 (proxy), M7 | Playwright `e2e/create-load.spec.ts`; pgTAP load_code format; Deno test `mappls-proxy` `distance` |
| P0-3 | Assign load → trip; one driver + vehicle; no two trips in progress | M7, M4 | Playwright create + assign; pgTAP unique indexes; scenario 10 (`ANOTHER_TRIP_ACTIVE`) |
| P0-4 | Permission onboarding; Start disabled without background location | M9 | RNTL D4 disabled-state tests; 🧍 M9 onboarding on a real Android phone |
| P0-5 | Start Trip geofence | M4 (`start_trip`), M8 (error parsing ☑), M9 | pgTAP `OUTSIDE_PICKUP` / `GPS_ACCURACY_TOO_LOW`; ☑ `src/tracking/errors.test.ts` (both codes + `OUTSIDE_PICKUP:<m>` → metres); scenario 4 (🧍 M9) |
| P0-6 | Background tracking ~10 s / 25 m, screen off, persistent notification | M8 (capture ☑), M9 | ☑ `config.test.ts` (options + ND-6 heartbeat < gap); ☑ `queue.test.ts` (`shouldRecord`/`selectPoints`); 🧍 M9 locked-phone test; field-test matrix (doc 10 §3); PRD metric completeness ≥ 95 % |
| P0-7 | Offline buffer: local first, batched, no duplicates, survives restarts | M8 (ND-8 ☑) | ☑ Unit: seq persistence across a simulated crash, idempotent upload, ≤ 200-row batch, quarantine, `resumeOnLaunch` after a kill; scenario 2 (🧍 M10 airplane-mode trip) |
| P0-8 | Live tracking on console without refresh | M11 | Scenario 11 (≤ 60 s, ND-15); 🧍 *(added)* M11 watch-live check |
| P0-9 | End Trip anywhere, warning off-drop, flush, works offline | M8 (core ☑), M10 | ☑ Unit: offline end → `ENDED_PENDING_SYNC` → later sync to `ENDED`; D5/D6 component tests (M10); scenarios 3 and 5; 🧍 M10 airplane-mode trip |
| P0-10 | Server-side verification with reason codes | M4 (ND-6, ND-21) | pgTAP: every doc 08 reason code; scenarios 1, 5, 6, 7, 8 |
| P0-11 | Admin review with note, audited | M4 (RPC), M11 (C6/C7) | pgTAP `FORBIDDEN` / `NOTE_REQUIRED` / `TRIP_NOT_IN_REVIEW`; scenario 12; Playwright review-approve |
| P0-12 | Driver history and stats from the server only | M10 (D6), M11 (D7, D8) | pgTAP stats incremented exactly once; D6 component tests; D8 renders read-only `driver_stats` |
| P0-13 | No editable experience (UI or API) | M4 (RLS, ND-13), M12a (security review) | Scenario 9; pgTAP driver cannot update trips/points/stats; `docs/HARDENING_REPORT.md` grep for client writes |

---

## 6. Risks (carried from `docs/00-repo-audit.md`)

| # | Risk | Severity | Affects | Mitigation / owner |
|---|---|---|---|---|
| R1 | Mappls RN SDK 2.0.3 (built on RN 0.79) vs Expo 57 / RN 0.87 unproven; shipped Expo plugin broken | High | M3 | Spike first; local `withMappls.ts`; fall back to an older SDK (ND-7) |
| R2 | No Mappls account/keys | High | M3, M6 | ND-2 |
| R3 | iOS: no Xcode in the sandbox; Windows host → EAS cloud builds + Apple account + physical iPhone required | High | M3, M12c | ND-3 |
| R4 | No Supabase project; Docker absent in the sandbox | Medium | M4 | ND-4; hosted staging recommended |
| R5 | Point-upload poison batch / clock skew in RLS | High | M8 | ND-8 |
| R6 | Stationary trucks flagged `TRACKING_GAP` / `LOW_COVERAGE` | High | M4, M8, M10 | ND-6 |
| R7 | Driver onboarding path (auth user creation, `shouldCreateUser`) | Medium | M5, M6 | ND-5, ND-12 |
| R8 | Three doc copies + two stale root duplicates | Medium (drift) | Pre-flight | ND-1 consolidation |
| R9 | Node 26 non-LTS on the Windows host (sandbox runs 22) | Low–Med | M1 | Pin Node 24 LTS if tooling misbehaves |
| R10 | `ANDROID_HOME` unset on the host (previous audit) | Low | M3 | Host-side pre-flight |
| R11 | EAS free-tier build quota | Low | M3+ | Local Android builds |
| R12 | Production SMS OTP needs DLT + paid provider | Medium | Pilot | Supabase test numbers until then |
| R13 | Client sign-offs outstanding (RN + Mappls, thresholds, driver registration, retention) | High (contractual) | M5, pilot | ND-5 |
| R14 | Console screens not designed | Medium | M6, M7, M11 | Build from doc 04/12 specs + UI kit |
| R15 | Stitch mocks carry scope creep and non-compliant disclosure copy | Medium | M2, M9–M11 | ND-18; `design/README.md` |
| R16 | Chinese-OEM background killing | High | M9, M12b | D2 battery screen, foreground service, gap detection, field matrix (doc 01 §5) |
| R17 | Store reviews (Play background location, iOS "Always") | Medium | M12c | Submit the declaration and video by W4 (PRD §9) |
| R18 | pgTAP suite unwritten (helpers only) | ~~Medium~~ **Closed in M4** — 135 cases | — | Done |

---

## 7. Progress log

*Append one entry per session. Format: date · milestone · what changed · what's left · known issues.*

### 2026-09-27 · Prompt 1 (this plan)
- **Changed:** Created `docs/PHASE1_TASKS.md`. A newer pack was found at `namma-lorry-phase1-docs/namma-lorry-phase1-docs/` (adds docs 12/13, `stitch/DESIGN.md`, updated doc 04); a copy of doc 13 also sits at the repo root. The refreshed audit (PR #2, merged) confirms: no app code, root `supabase/` with 0001 + already-written 0002_consent + seed + pgTAP helpers, zero pgTAP cases, no edge functions, no keys configured. No application code written.
- **Left:** Answer ND-1…ND-7 (the audit Questions section is still unanswered), then pre-flight, then M1 (Prompt 2).
- **Known issues:** Audit questions unanswered; three copies of the docs exist until pre-flight consolidates them; Mappls RN plugin broken (R1); stationary-gap and poison-batch decisions block M8.

### 2026-09-27 · M1 (Prompt 2)
- **Changed:** Scaffolded the Expo app at the repo root: pinned **Expo SDK 57** set per the `expo-template-default@sdk-57` manifest (expo ~57.0.25, react-native 0.86.3, react/react-dom 19.2.3, expo-router ~57.0.23, reanimated 4.5.1 + worklets 0.10.1, TS ~6.0.3) plus all M1 deps (supabase-js, expo-secure-store/location/task-manager/sqlite/device/application/dev-client, netinfo, TanStack Query, zustand, zod, react-hook-form, i18next + react-i18next). Added `app.config.ts`, `eas.json` (development/development-simulator/preview/production), strict `tsconfig.json` with `@/` alias, ESLint flat config (eslint-config-expo + import order), Prettier (+ `.prettierignore` protecting docs/SCREENS/supabase), Jest 29 + jest-expo + RNTL v14, `env.example` (the sandbox blocks writing `.env.example` directly — see known issues), `.github/workflows/ci.yml`, `src/lib/config.ts` (zod env validation, fails loudly in dev), `src/lib/screens.ts` (doc-12 map), theme token seed, i18n (en + ta/kn/hi TODO stubs), `PlaceholderScreen`, and placeholder routes for all 21 screens + `/dev/env`. Verified: `bunx expo-doctor` 21/21; typecheck, lint, format:check, 7/7 tests green; Freebuff managed preview serves the web app — Metro compiled 1531 modules and the bundle contains every placeholder (S2 sign-in included). M1 checkboxes ticked.
- **Left:** ND-9 layout reconciliation of CLAUDE.md/TRD (needs approval); the 🧍 review of pinned versions; the doc-13 pre-flight consolidation (ND-1) still pending.
- **Known issues:** (1) `env.example` is committed under that name because the workspace blocks creating `.env.example`; copy/symlink it as `.env.example` on machines that allow it. (2) React Native DevTools can't install in the sandbox (`libglib-2.0.so.0` missing) — dev-server-only annoyance, harmless for builds/CI/web. (3) RNTL v14 `render()` is async and its `screen` API conflicts with jest-expo's module instance — tests use awaited `render()` destructuring. (4) expo-doctor pinned jest to ~29.7.0 (SDK 57's expectation), not jest 30.

### 2026-09-27 · M2 (Prompt 3)
- **Changed:** Built the design system and shared UI kit. `src/theme/tokens.ts` expanded to the full token set (brief palette + tint/pressed variants, Noto Sans + Material Symbols font names, type scale + text styles, 8 px spacing grid, radii, border widths, 48/56/64 touch targets, elevation presets, console layout + z-index). Added `src/theme/status.ts` (docs/06 §5 driver/console labels for all 7 statuses → chip variant + colour + icon, only `in_progress` pulsing) and `src/theme/fonts.ts` (Noto Sans 400/500/600/700 + Material Symbols via `expo-font`, loaded in the root layout; new deps `@expo-google-fonts/noto-sans`, `@expo-google-fonts/material-symbols`). Built `src/components/ui/` (Icon, Screen, Card, Button, Chip + StatusChip, TextField, PhoneInput, OtpInput, ListRow, Banner, BottomSheet, ConfirmSheet, EmptyState, StatBlock, SectionHeader) and `src/components/console/` (Sidebar, TopBar, DataTable, Drawer, ConsoleModal), plus barrels and the dev-only `/dev/kitchen-sink` route. Added tests: `src/theme/status.test.ts` (exact docs/06 §5 labels, icons present, only Live pulses), `src/theme/tokens.test.ts` (touch targets, palette, spacing), `src/components/ui/Button.test.tsx` (variants, disabled/busy states, onPress suppressed). Fixed the only stray hex in `app/index.tsx` so no raw hex lives outside tokens.ts. Verified: typecheck, `lint --max-warnings=0`, `format:check` and **20/20** tests green.
- **Left:** M3 (Mappls map) — needs the Mappls map SDK key; also blocked on nothing code-side. M2 acceptance visuals (eyeball the kitchen sink against `design/`) are a 🧍 checkpoint.
- **Known issues:** (1) Material Symbols icons render as ligatures from the Google-font package; confirmed working on web/iOS, Android ligature shaping should be spot-checked on a real device in M3. (2) `env.example` still carries the M1 note (sandbox blocks the leading-dot name). (3) Kitchen sink is ungated until M12a adds the `__DEV__` guard. (4) DataTable pagination is client-side only; server paging arrives with the console screens (M6/M11).

### 2026-09-27 · M3 (Prompt 4) — map abstraction (code complete, device verification pending)
- **Research (done before coding).** `mappls-map-react-native@2.0.3` (npm `latest`; `auth-legacy` tag is `1.1.2`). Required native files and keys:
  - **Android:** maven repo `https://maven.mappls.com/repository/mappls/`; credential files `<appId>.a.olf` + `<appId>.a.conf` in the app module directory. Expo's generated `settings.gradle` has no `dependencyResolutionManagement { repositories }`, so the repo is added to the root `android/build.gradle` `allprojects.repositories` instead (the SDK's own `react-mappls-plugin.gradle` reads the `.a.olf`/`.a.conf` from the app module and generates `mappls_olf_data` + `assets/mappls-conf.txt`).
  - **iOS:** `$MAPPLS_MAPS.post_install(installer)` added inside the Podfile `post_install` block (the podspec defines it and adds 7 SPM packages); credential files `<appId>.i.olf` + `<appId>.i.conf` copied into the app target and added to Copy Bundle Resources.
  - **Keys:** the native SDK authenticates with those console-downloaded files (package name + signing SHA-256 / bundle id), **not** with a runtime key. `EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY` is for the **web** SDK (`https://sdk.mappls.com/map/sdk/web?v=3.0&access_token=…`). REST client id/secret/key stay in Edge Function secrets (M6).
- **Changed:** Added `plugins/withMappls.ts` — a local Expo config plugin that applies all of the above during `expo prebuild` (the package's shipped `app.plugin.js` requires a `plugin/build/withMappls` that is not published, confirming R1). Added `src/components/map/`: `types.ts` (`AppMapProps` exactly as TRD §5), `MapView.native.tsx` (Mappls GL `MapView`/`Camera`/`ShapeSource`+`LineLayer` for polylines, geofences as polygon approximations via `FillLayer`, `MarkerView` for pickup/drop/truck with the truck rotated by heading, `UserLocation` blue dot, bounds-based `fitToContent`), `MapView.web.tsx` (Mappls Web SDK via a once-only script loader, same props, `addGeoJson` + `dasharray` for the dashed planned route), plus `bounds.ts`, `mappls-native.ts`, `mappls-web.ts`, `useMapplsScript.ts` and an `index.ts` barrel. Added `src/lib/geo.ts` (haversine, bearing, destinationPoint, circlePolygon) with 12 unit tests, and dev-only `app/dev/map.tsx` (pickup + drop geofences, dashed planned route, actual route, rotated truck, tap-to-pin, fit-to-content toggle). Coordinate conversions live only in the map components; Mappls' web GeoJSON quirk (`[lat,lng]` arrays in their samples) is handled and commented there.
- **Notable decisions:** `mappls-map-react-native` ships TypeScript **source** built against RN 0.79 typings, which do not type-check on RN 0.86. Rather than patch a dependency, `src/components/map/mappls-native.ts` loads it through a typed `require` so `tsc` never walks its source; Metro still bundles the real package (verified for both `platform=web` and `platform=android`). `tsconfig.json` gained `moduleSuffixes` so one specifier resolves to the platform files. `app.config.ts` gained `android.package` / `ios.bundleIdentifier` (`com.nammalorry.driver`) — required for prebuild and for the Mappls key restriction (M12c may rename). The Mappls licensing files live in a gitignored `mappls/` folder (documented in `env.example`).
- **Verified:** `tsc --noEmit`, `eslint --max-warnings=0`, `prettier --check` all clean; **31/31** tests pass (12 new geo tests). `expo prebuild --clean` applies the plugin cleanly and idempotently (maven repo + Podfile hook inserted once each) and emits clear warnings when the `.olf`/`.conf` files are absent; generated `android/` + `ios/` were removed again so the plugin re-applies on the next prebuild. Freebuff preview bundles the web app (HTTP 200) with `sdk.mappls.com` present and the native SDK **absent** from the web bundle; the Android bundle also compiles (HTTP 200, Mappls SDK source resolved). Grep confirms no non-Mappls map/tile libraries.
- **Left:** the 🧍 device step — add the Mappls credentials (ND-2), then `npx expo run:android` / `eas build --profile development` and confirm the map on a real phone and on web. iOS needs ND-3 (Apple account + device); web rendering needs `EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY` set. Commands are listed in the M3 session summary.
- **Known issues:** (1) The `.olm/.olf` files are per-app secrets and are not in the repo — a prebuild without them produces a Gradle/CocoaPods failure (by design; the plugin warns earlier). (2) The web SDK's click payload shape is undocumented; `parseMapClick` accepts the known variants and `onPress` is a no-op if none match. (3) `map.destroy()` is undocumented on the web SDK, so the web component clears its container node on unmount. (4) `/dev/map` is not `__DEV__`-gated until M12a.

### 2026-09-27 · M4 (Prompt 5) — Supabase backend
- **Changed (schema):** `0001_phase1_schema.sql` and `0002_consent.sql` both apply **unchanged with zero errors** against Postgres 14 + PostGIS 3 + pg_cron, so the “create a follow-up migration instead of editing 0001” escape clause was not needed. `seed.sql` verified: profiles=4, vehicles=3, loads=4, trips=1, with `load_code_seq` seeded at 141 so codes match the DESIGN.md sample data (NL-2026-000142/143).
- **Changed (tests):** wrote the whole pgTAP suite that M4 owed — **135 cases in 4 files**, all passing. `01_rls_policies` (46) proves every policy from 0001 for anon, driver A, driver B, owner, shipper and admin, in both the blocked and the allowed direction, and that `verify_trip` / `apply_verified_stats` / `sweep_unverified_trips` are not callable by clients. `02_rpc_errors` (28) produces every docs/06 §1 code from a real call, including `OUTSIDE_PICKUP:<metres>` with the distance computed by `st_distance` and matched exactly. `03_verification_reasons` (26) produces all 10 docs/08 §3 codes one at a time, asserts each is the *only* reason raised, then pins the set to the documented list so a new rule in `verify_trip` without a matching case fails the suite. `04_verification_triggers` (35) covers the `trip_points` AFTER INSERT trigger (a late batch reaching `expected_points` starts verification), the pg_cron sweeper (cron job registered; 6 h grace period honoured; a re-sweep does not double-credit), admin review crediting `driver_stats` exactly once whichever path got the trip there (a second approve is refused, an already-verified trip is unreviewable, a rejection pays out nothing), and `record_consent` including its `REVOKE`d anon path.
- **Changed (app):** added `src/lib/database.types.ts` (generated from the live catalogue — 9 tables, 18 functions, 2 enums, plus `Tables`/`Enums` helpers, `UserRole`, `TripStatus` and the `VERIFICATION_REASONS` union from docs/08 §3) and `src/lib/supabase.ts` (typed `SupabaseClient<Database>`; session in `expo-secure-store` on native, a `localStorage` adapter on web that degrades to “not remembered” when storage is missing, blocked or over quota; `detectSessionInUrl` only on web). Added `src/lib/supabase.test.ts`. Wrote `docs/DEV_SETUP.md`.
- **Notable decisions:** (a) `pg_prove` cannot discover a directory here, so CI or a developer must pass the four files explicitly — **see known issues**. (b) `set_config('role', …)` cannot run inside a `SECURITY DEFINER` function and an invoker-security function cannot `SET ROLE` back, so the role helpers stay invoker-security and test files return to the runner with a statement-level `set local role postgres;`. (c) `throws_ok` matches messages **exactly**, not by regex, so the 4-argument form is used throughout. (d) psql does **not** substitute `:variables` inside a dollar-quoted literal, so the two cases that need a runtime trip id build their SQL with `format()`. (e) A trip must be aged as a whole (`started_at`, `ended_at` *and* every point) to simulate the sweeper — backdating `ended_at` alone leaves every point outside `[started_at, ended_at]` and `verify_trip` reads that as a trip with no track.
- **Verified:** migrations + seed re-applied from a dropped database, then **135/135** pgTAP cases green. `tsc --noEmit`, `eslint --max-warnings=0`, `prettier --check` clean; **37/37** Jest tests pass (6 new for the storage adapters). The storage unit test caught a real bug while it was being written — the first version guarded only *access* to `localStorage`, not the `setItem` call, which throws on quota and would have crashed the web console.
- **Left:** `0003_phase1_fixes.sql` (ND-21: ND-8, ND-12, ND-13, ND-14, `GPS_JUMPS` into `app_settings`, `admin_review_trip` not-found, `setting()` search_path) and the ND-6 stationary-gap decision — both still blocked on approval. The secret key for the hosted project was supplied redacted, so nothing was verified against the hosted project; the client is written against env vars only. The publishable key still needs to go into Settings → Environment.
- **Known issues:** (1) **This sandbox has no Docker and no `supabase` CLI**, so `supabase db reset && supabase test db` could not be run verbatim. The suite was executed against a locally provisioned Postgres 14 + PostGIS + pg_cron + pgTAP driven by `pg_prove`, with a throwaway shim supplying the roles, `auth` schema and `supabase_realtime` publication that a real Supabase project provides. The migrations and seed are unchanged and standard, but **the exact `supabase test db` invocation is still unverified** and should be run once on a machine with Docker. (2) Consequently `.github/workflows/ci.yml` still runs only install/typecheck/lint/format/test — adding `supabase test db` needs a Docker-enabled runner, and that is a gap to close rather than a decision. (3) `pg_prove` silently reports `NOTESTS` for a directory argument in this setup; the four test paths are listed explicitly. (4) `env.example` still carries the M1 note (the sandbox blocks the leading-dot name).

### 2026-09-27 · M5 (Prompt 6) — auth, roles and routing
- **Changed (the gate):** `src/features/auth/routing.ts` is the whole of docs/04 §2 as one pure function — `decideRoute({ session, platform, profile, profileSettled, activeTripId })` returning a `RouteDecision`, plus `routePath`, `parseAccessNoticeVariant` and `signOutBlockReason`. It imports no react-native, no Supabase and no router, so `routing.test.ts` covers all 12 role × platform combinations, both account states, the three session states and the active-trip branch without a renderer. `app/index.tsx` (S1) consumes it and `app/index.test.tsx` proves the screen actually navigates on the decision (7 cases, mocked router). Two states the doc-04 flowchart does not draw are handled and documented: a deactivated account is refused before the role is read, and a session with no profile row gets the S4 "not set up" notice instead of a screen reading a null role.
- **Changed (auth):** `signInWithOtp({ shouldCreateUser: false })` implements the ND-12 registration gate, so an unknown number comes back as the "Contact Namma Lorry to register" state. `src/features/auth/errors.ts` maps every Supabase failure onto one of eight codes (unregistered, wrong code, expired, rate-limited, network, invalid, not configured, unknown) and the screens only ever branch on a code. `store.ts` (zustand) owns the session, the pending OTP, the 30 s resend deadline and the attempts counter (3, mirroring what Supabase accepts); `useProfile.ts` owns the profile as a TanStack Query; `useAuthBootstrap.ts` runs once from the root layout and resolves the session plus the local tracking state. `src/tracking/localState.ts` is the M5 stub for the local trip flag S1 checks first — M8 replaces one function body with the real SQLite reader. New `EXPO_PUBLIC_{ANDROID,IOS}_STORE_URL` config drives the two store buttons on S4; they stay hidden (behind an "ask your transport manager" note) until the app is published.
- **Changed (screens):** S2, S3 and S4 are real screens built from the UI kit (no raw hex, 48–64 px targets, doc 12's copy and layout). Out-of-scope Stitch extras were left out per ND-18: the cab keypad, the "Protected by Namma Fleet Safety Network" badge, the fake AIS-140 / 24-7 footer and the dispatch phone number. S2 also carries the M5 half of the language overlay (globe row → bottom sheet over en/ta/kn/hi). All new copy lives in `src/i18n/` with `TODO:` stubs in ta/kn/hi.
- **Notable decisions:** (a) `src/lib/supabase.ts` no longer **throws** at import when the keys are missing — it logs loudly instead. M4 threw, which was harmless while nothing imported the module, but the splash now does, and a throw there is the white screen that file's own comment says it is trying to avoid. A missing backend now means "nobody is signed in" plus a clear message on S2. (b) The resend countdown is derived during render from a deadline rather than mirrored into state, so a fresh resend shows immediately instead of after the next tick. (c) An admin is routed to the console on every platform: doc 04 §2 has no platform branch for admin, and ND-10 keeps the console admin-only. (d) Only the splash and the `(auth)` group are guarded — a signed-in driver can still type a console URL, but those screens are M1 placeholders, RLS blocks the data, and the console guard belongs in M6.
- **Verified:** `tsc --noEmit`, `eslint --max-warnings=0` and `prettier --check` clean; **97/97** Jest tests pass (60 new across `routing.test.ts`, `schemas.test.ts`, `errors.test.ts` and `app/index.test.tsx`). The web and Android Metro bundles both compile (HTTP 200) with the new screens. Two of the new tests caught real bugs while being written: `phoneSchema` used `z.string().trim()`, which in zod 4 validates *before* trimming, and the error map missed Supabase's "Unable to validate phone number" wording.
- **Left:** the 🧍 sign-in step — nothing in the environment has `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`, so no OTP could actually be sent. The `shouldCreateUser: false` gate also needs a real `auth.users` row to prove "unknown number refused" end to end. M6 still owes the admin-only console guard and `admin-create-driver`, which is now the only way to add a driver.
- **Known issues:** (1) **Android SMS auto-read is not built** (doc 04 §4 A2, "auto-read on Android if available"): it needs the SMS Retriever API, which has no Expo module in this dependency set, so S3 is manual entry only. (2) The local tracking stub is a flag in session storage, so "resume the trip" can only be exercised from a test or the M8 dev screen; the routing for it is already in place. (3) The hosted Supabase OTP path has never been exercised — see the M4 note about the redacted secret key. (4) `env.example` still carries the M1 note. (5) `docs/PHASE1_TASKS.md` is now larger than the file editor's ~50 KB read window, so its progress log has to be appended from the shell.

### 2026-09-27 · M6 (Prompt 7) — console shell, drivers, vehicles, Mappls proxy
- **Changed (console shell):** `app/(console)/_layout.tsx` is the M5-owed admin guard. A profile that is not an active admin is redirected back to S1 (`SCREENS.S1.route`) instead of duplicating the role logic a second time — S1 already routes by role, and RLS is the actual boundary, so the guard is a convenience rather than the enforcement. Around it: the sidebar (Live, Loads, Trips, Review with a live count badge from `useReviewQueueCount`, Drivers, Vehicles), a top bar with a search field, and `src/components/console/UserMenu.tsx` (avatar, name, role, sign-out). `usePathname()` does not see route groups, so `NAV_ITEMS` carries an explicit `path` and the active item is the longest prefix match; the `route` stays for the `SCREENS` registry. New `src/features/console/searchStore.ts` holds the query so the field survives navigation. `AuthProfile` gained `fullName` for the menu.
- **Changed (C8/C9):** `app/(console)/drivers/index.tsx` is a `DataTable` (name, phone, verified trips, verified km, last trip, status) with an Add Driver `Drawer`; `app/(console)/vehicles/index.tsx` is the same table with an Add Vehicle `ConsoleModal` (registration + the eight doc-12 vehicle types). Both join their related rows in TypeScript from three parallel reads, because the generated `Database` types have no reverse relationships and a nested `select` would not typecheck. Validation lives in `src/features/{drivers,vehicles}/schemas.ts`: `normalisePhoneInput` mirrors the Edge Function exactly, and `REGISTRATION_PATTERN` is the Indian `SS DD SSS NNNN` form (upper-cased, separators dropped, stored as `TN 23 BK 4521`) — a typo there creates a second "same" truck instead of an error, because `vehicles.registration_no` is UNIQUE.
- **Changed (functions):** both functions are split into a framework-free core plus a thin `index.ts` that wires the Supabase clients and `Deno.serve`, so the logic is testable without a runtime. `mappls-proxy/proxy.ts` holds the four URL builders, the four normalisers, a sliding-window `createRateLimiter` and `handleProxy`; the envelope is `{ result }` or `{ error: { code, message } }` with `UNAUTHENTICATED`/`FORBIDDEN`/`RATE_LIMITED`/`BAD_REQUEST`/`NOT_FOUND`/`METHOD_NOT_ALLOWED`/`MAPPLS_NOT_CONFIGURED`/`MAPPLS_BAD_RESPONSE`/`MAPPLS_UPSTREAM_ERROR`. Rate limit is 60 calls per user per minute in memory (60-second lifetime per function instance — the multi-instance caveat is in the README). `is_admin()` is always called **as the caller** (anon client + the caller's JWT), never with the service role, so the check cannot be satisfied by a privileged client. `admin-create-driver` writes `auth.users` with the service role and then updates `profiles`; `index.ts` is the only file in the repo that reads `SUPABASE_SERVICE_ROLE_KEY`.
- **Notable decisions:** (a) **Mappls changed its REST auth in Aug 2025**: the current model is a single static key sent as `?access_token=…`, not the OAuth2 client-credentials exchange the older docs describe (the old branch is still `auth-legacy`). Built against the current model; the README documents the legacy upgrade path and `getAccessToken` is the single place a token is read. Two other doc details that bite: the trucking distance-matrix path is **lng,lat** while autosuggest's `location` is **lat,lng**, and `latitude`/`longitude` on autosuggest suggestions are marked RESTRICTED. Rather than ship a typed field that is always null, `Suggestion.lat/lng` is `number | null` and the console geocodes the picked address for a real pin — the deliberate deviation is recorded in the README. (b) `mappls-proxy` is built and unit-tested but nothing calls it yet; C3 (load creation) is M7, so the first live use of autosuggest is still ahead. (c) ND-19 items are excluded as specified: no invite SMS on Add Driver, no permission dot, `owner_id` left null on vehicles. (d) `app/index.test.tsx` moved to `src/features/auth/splash.test.tsx` — **Expo Router turns every `.tsx` file in `app/` into a route and does not skip `*.test.tsx`**, so the M5 test file was being bundled into the app and evaluated at start-up, throwing `expect is not defined` inside the router. It was the only test in `app/`; every other test already lives in `src/`.
- **Verified:** `tsc --noEmit`, `eslint --max-warnings=0` and `prettier --check` clean; **114/114** Jest tests pass (15 suites, including new `src/features/{drivers,vehicles}/schemas.test.ts` and an `src/i18n/i18n.test.ts` that enforces key parity across en/ta/kn/hi, TODO-marked stubs and no empty English strings); **35/35** Deno tests pass (21 proxy, 14 driver) with mocked Mappls fixtures. The web (1 678 modules) and Android (2 258 modules) Metro bundles both build; grepping both bundles for `SERVICE_ROLE` returns nothing, and the only client-side match in the repo is the `config.test.ts` assertion that the serialised config can never contain one. Two new tests caught real bugs: the driver name schema trimmed but did not collapse internal whitespace (the Edge Function did, so the two disagreed), and a vehicle test fixture `"TN23 B K 4521".replace(/ /g, "")` collapsed to a *valid* plate and asserted the pattern rejects it.
- **Left:** the 🧍 checkpoint cannot run here — there are no `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` and no Mappls REST secrets, so no function is deployed, no OTP is sent and autosuggest cannot be tried live. That blocks the last acceptance item (admin adds a driver, who then signs in) and the M5 sign-in step that was already outstanding. The rate limiter is per-instance and in memory; a real deployment wants it moved to Postgres or an edge KV, which is a deliberate simplification, not an oversight.
- **Known issues:** (1) Android SMS auto-read and `env.example` are still carried from M5. (2) `docs/PHASE1_TASKS.md` is past the file editor's read window, so this log was appended from the shell. (3) C8/C9 columns that depend on a live trip history render their empty state until there is verified data — the counts come from `verify_trip`, never from the client.

### 2026-09-27 · M7 (Prompt 8) — loads, assignment and the dispatch board
- **Changed (shared rules):** `src/features/loads/schemas.ts` is the whole of C3/C4's form contract in one place — the radius bounds, the two endpoints, the optional details, the column mapping and the status derivation — so the create form and the assign form cannot drift and the rules are testable without a renderer. It validates **form input** and a separate pure `toLoadInsert` produces the `loads` row, which is what makes "what row does this form write" a real unit test rather than a hopeful integration. `load_code` is never sent: the database generates `NL-YYYY-NNNNNN`, and a client-supplied code would break the docs/08 format check.
- **Changed (C3):** both ends are set by autosuggest or by tapping the map. A Mappls suggestion usually arrives with **no coordinates** — the REST response marks `latitude`/`longitude` as restricted (the M6 research) — so a chosen suggestion is geocoded before it becomes a pin, and an end that could not be located keeps its address but **no point**, which the schema refuses to submit. That is deliberate: defaulting a missing point to (0, 0) would pass every range check and quietly put a geofence in the Gulf of Guinea, so `coordinatesSchema` rejects the null island outright. `planned_distance_m` comes from the `mappls-proxy` `distance` action and is checked live as the pins settle (debounced, and tagged with the point pair it belongs to) rather than only on save, so the number the admin saves is the one they just saw. If the proxy is unreachable the load is **still saved**, with a null planned distance and a visible warning: a dispatcher has to be able to create freight during a Mappls outage.
- **Changed (C4):** assignment is a plain `insert` into `trips` under `trips_admin`, not an RPC — assigning is not a verification decision, and docs/06 keeps the RPCs for the transitions `verify_trip` and `admin_review_trip` own. The two unique indexes do the real work, so `assignErrorKey` turns each Postgres index name into a sentence an admin can act on rather than a stack trace. The driver picker shows verified trips and km from `driver_stats` and marks a driver who is `in_progress` with doc 12's warning row. A busy driver is **not** disabled: `trips_one_active_per_driver` only guards a second `in_progress` trip and `start_trip` is where that is refused, so the console warns rather than inventing an enforcement the schema does not have.
- **Changed (C2/C5):** pagination, the status tabs, the date range and the search are all resolved in Postgres — `range()` returns one page plus the exact total, and changing a filter returns to page 1. Load status is derived from the load's latest trip (ND-20) and the same derivation drives both the chip and the tabs, so a load cannot appear under one tab with a different chip. `rejected`/`cancelled` deliberately count as **unassigned**: `trips_one_open_per_load` does not cover them, so the load is dispatchable again and "Done" would hide that. C5's verified-km column reads `tracked_distance_m`, which only `verify_trip` writes — an unverified trip shows a dash rather than the planned distance standing in for it (CLAUDE.md rule 1).
- **Notable decisions:** (a) **"Draggable pin" is a map tap, and this is a deviation.** The shared `AppMap` contract (docs/03 §5) has no marker-drag event on either platform, so C3 moves whichever pin is selected — the two address rows act as the selector, and every tap after that nudges the same pin. The same gesture, one step less; making the contract drag-capable belongs with the M11 live-map work. (b) **The radius control is a stepper plus the doc-12 presets (100/250/500/1000/2000 m), not a drag slider.** A drag slider means a native slider module in a package that also has to build for Android and iOS, for a screen that only runs on web. Same 100–2,000 m range, in 50 m steps. (c) **C4's "planned route" is a straight line between the two geofence centres, and is labelled as one.** The Mappls `trucking` distance matrix returns a distance and a duration, not geometry, so a road polyline would have to be invented — exactly the kind of thing that must not look authoritative on a dispatch screen. The real number is the planned distance on the card. (d) ND-19 items follow the M6 decision: the shipper select stays hidden (so `shipper_id` is null) and **C5 has no CSV export** — ND-19 rates it P1 and it is the one part of doc 12 C5 with no supporting column or rule.
- **Changed (testing):** `@playwright/test` and `@hookform/resolvers` were added; `e2e/` and `playwright.config.ts` were added to `tsconfig.json`'s include, which means **the spec is type-checked against the real `Database` types** instead of being unverified script. The spec creates an admin with the service role, promotes the profile, signs in through Supabase's REST endpoint and injects the session into `localStorage` before the app boots — the app's phone-OTP form is untouched, this is a test seam. Without `E2E_*` credentials it **skips with the missing key names** rather than failing, so a clone with no backend has a green suite instead of a red one it cannot fix.
- **Verified:** `tsc --noEmit`, `eslint --max-warnings=0` and `prettier --check` clean; **149/149** Jest tests pass (17 suites, including 30 new in `loads/schemas.test.ts` and 5 in `trips/useTrips.test.ts`). `tsc --listFiles` confirms `e2e/create-load.spec.ts`, `e2e/support/console.ts` and `playwright.config.ts` are really in the compile. `playwright test --list` finds the spec and `playwright test` reports **1 skipped** with the reason. The web (1,645 modules) and Android (2,203 modules) Metro bundles both build; grepping both for `SERVICE_ROLE` returns nothing. Three real bugs were caught while writing this: the optional form fields did not accept `undefined` so a minimal load failed to parse; `formatDuration` rounded hours *before* choosing its branch, making the sub-hour case unreachable; and a zod fixture used a UUID whose variant nibble is invalid (`z.uuid()` was right, the fixture was not).
- **Left:** the two acceptance items that need a running system. There is no Supabase project, no `MAPPLS_REST_KEY` and no deployed `mappls-proxy` here, so **the Playwright spec has never executed** and "admin creates a load end-to-end in < 2 min" is unmeasured. C3's autosuggest, geocode and distance paths and C4's assign path have therefore only been type-checked and bundled, never run against a backend. `mappls-proxy` still has no live caller history — M7 is its first, and that first call is the thing to watch on the 🧍 run.
- **Known issues:** (1) The status-tab filter resolves the tab to a set of `load_id`s with one narrow query and filters `loads.id` by it. That is correct and server-side, but it is a second round trip whose result set grows with the number of open trips; a Postgres view or an RPC would be the right answer at real volume. (2) C5 has no CSV export (ND-19, P1) and C3 has no shipper select (ND-19). (3) `useDrivers` and `useAssignableDrivers` are two similar reads of the same table; they could be one parameterised query, and M11's review queue is the natural place to do it. (4) Android SMS auto-read, `env.example` and the M5/M6 sign-in checkpoint are still carried forward unchanged.

### 2026-09-27 · M7 e2e bring-up — the first exercise of `mappls-proxy`, and two real bugs
- **Goal:** get `e2e/create-load.spec.ts` running against a real backend. **Not achieved — blocked on secrets** (details in "Left"). What *was* achieved is everything around the blocker: the browser now runs, every selector the spec uses is proven against the real DOM, and `mappls-proxy` — the first thing the spec calls — was exercised over real HTTP and found two genuine bugs.
- **Two real `mappls-proxy` bugs, found and fixed.** (1) **A restricted suggestion parsed as `(0, 0)`.** Mappls returns restricted geometry as **empty strings**, and `Number("")` is `0`, which `Number.isFinite` happily accepts — so `num()` returned `0` and the `?? item.entryLatitude` fallback never fired. The client (`AddressPicker.choose`) checks `lat !== null`, so it would have taken the point as located, **skipped the geocode entirely**, and saved a load with a geofence at the Gulf of Guinea. This is the exact failure the C3 null-island refine was written to catch, and it only caught it by luck: the proxy was on the wrong side of the contract. `num()` now rejects blank and non-numeric strings before parsing. (2) **HTTP 204 was reported as a broken response.** The Mappls search docs define 204 as "the API was a success but no results were found"; it is `ok` to `fetch` and bodyless, so the handler tried to parse an empty payload and returned `MAPPLS_BAD_RESPONSE` 502. An address Mappls simply does not know would have surfaced in the console as "map search is unavailable" — wrong, and alarming during an outage that was not happening. 204 now maps to `NOT_FOUND` (404), which the client already translates to "No match for that address."
- **How they were found:** a new `supabase/functions/mappls-proxy/proxy_wire_test.ts` runs the **real handler over real HTTP** against a local server that speaks Mappls' documented response shapes, swapping only the origin through `deps.fetchImpl`. A mocked `fetch` never performs a URL parse or builds a query string, so the things most likely to be wrong — the path, the `access_token` placement, the `lat,lng` vs `lng,lat` orderings, blank coordinate strings, bodyless 204 — are precisely what the existing 21 stubbed tests could not see. 8 new tests, **43 Deno tests pass** total. The README now records both behaviours, and a third finding was *not* a bug: `rev-geocode` really does take `lat` and `lng` as separate parameters rather than the `location=lat,lng` pair autosuggest uses — confirmed against the current Mappls documentation and now asserted, so a future "fix" cannot silently break it.
- **The browser now runs here.** The Playwright chromium bundle was never installed, and installing it was not enough: the sandbox is missing `libglib-2.0.so.0`, so the browser exited 127 on launch — the same missing library that had been failing the React Native DevTools since M1. `playwright install chromium` plus `playwright install-deps chromium` (the standard apt-based dependency install) fixed it; the browser now loads the app at HTTP 200 with title "Namma Lorry". **The spec still has never executed**, because it needs a backend, not a browser.
- **Every selector in the spec is proven against the real DOM.** A browser check against the running preview confirmed that `testID` reaches the DOM as `data-testid` under react-native-web 0.21, that `page.getByTestId("sign-in-submit")` resolves, and that the app renders with no page errors. All 21 testIDs the spec references were then audited against source, including the two that are template-composed (`create-load-pickup-*` via `AddressPicker`'s `testIDPrefix`, and `assign-{driver,vehicle}-option-<uuid>` via `SearchSelect`). All resolve.
- **One real config bug fixed:** `playwright.config.ts` passed `--port 8081` through to `expo start --web`, but `expo start --help` documents that flag as "does not apply to web" — it was being silently ignored. The command no longer pretends to set the port; `E2E_BASE_URL` remains the supported way to point at a server you already run.
- **Verified:** `tsc --noEmit`, `eslint --max-warnings=0`, `prettier --check` clean; **149/149** Jest; **43/43** Deno (35 + 8 wire); chromium launches and loads the app; `data-testid` confirmed in the live DOM; `playwright test` reports **1 skipped** with the missing key names.
- **Left — the blocker, which only the user can clear.** `e2e/create-load.spec.ts` cannot pass without a backend, and this environment has no way to provide one: **no environment keys are set at all**, and there is **no Docker and no Supabase CLI**, so a local Supabase stack cannot be started either. Running the spec needs `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`, `E2E_SERVICE_ROLE_KEY`, `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD`, plus a deployed `mappls-proxy` with `MAPPLS_REST_KEY` set — and that deployment needs a real Mappls account, which is also the only way to prove the remaining unverified assumption: that Mappls' live service matches the payload shapes this code normalises.
- **Known issues:** (1) The Playwright browsers and their system libraries are now installed in this sandbox but are **not** recorded in the repo, so a fresh clone still needs `playwright install --with-deps`; this belongs in the CI workflow, which has not been updated (it predates M7). (2) The two acceptance items from the M7 entry remain unchecked, as does the M5/M6 🧍 sign-in checkpoint. (3) Everything else carried into M7 is unchanged.

### 2026-09-27 · M8 (Prompt 9) — the tracking engine, core without UI

- **Changed (prerequisites):** the two decisions that blocked M8 are both resolved in code and recorded in the register. **ND-6**: the parked-truck gap is fixed on the *capture* side, not in gap detection — `distanceInterval` is `0` so the OS keeps delivering on the time cadence, and the queue writer thins the stream with `shouldRecord` (keep a row per 25 m moved, or one keep-alive per 5 min parked, well under the verifier's 15 min). **ND-8**: no new migration — the uploader drops rows it can prove are outside the RLS window (`started_at` − 1 min) and, if the server still rejects a batch, re-sends it row by row and **quarantines** the rows that fail (`quarantined` + `quarantine_reason` on the local `point_queue`), so one poison row can never wedge a trip while the good points still land.
- **Changed (config + task):** `config.ts` is the single home for every threshold, and `config.test.ts` asserts the ND-6 invariant directly — `HEARTBEAT_MS < GAP_THRESHOLD_MS`, because if that relation ever flips a parked truck starts producing `TRACKING_GAP`. `task.ts` defines the task at module top level behind a web guard and is imported first in `app/_layout.tsx`; its body maps fixes to rows, applies the ND-6 gate, writes to SQLite and returns. It does **no network I/O** (TRD §4.2) and swallows every error, because an uncaught rejection from a task handler is how a background task stops being delivered.
- **Changed (queue + db):** `queue.ts` owns the durable shape and the pure rules; `db.ts` is the real `expo-sqlite` implementation of the same `TrackingStore` interface, plus the in-memory one web and the tests use. `seq` is allocated with a single `UPDATE … SET next_seq = next_seq + ?` inside a transaction, so it is atomic against the background task and never reused across a crash — the test kills the process by rebuilding a store from the persisted row alone and asserts the next insert continues the sequence. Allocating a batch that then fails can only *waste* numbers, never repeat one.
- **Changed (uploader):** `flush()` is single-flight, so the 30 s timer, a reconnect and an end-of-trip flush cannot race the `uploaded` marks. Rows go up with `onConflict: 'trip_id,seq', ignoreDuplicates: true`, which makes a retry idempotent. A network failure keeps the rows and schedules an exponential backoff with **equal jitter**; a data rejection triggers the per-row fallback that quarantines only the offending rows. Tests cover the boundaries, not the plumbing: batch cap of 200, no re-send after a restart, offline → later success, and a mid-fallback network drop that keeps what already landed.
- **Changed (state machine):** `reduce` is pure and returns the *same object* when an event does not apply, which is what lets the service skip a redundant write; every transition and every ignored event is asserted by identity in `stateMachine.test.ts`. The service takes the store, the two RPCs, the location task and the flush as injected dependencies, so the tests drive a whole trip — including the offline end — without a device or a network. The two rules the file exists to enforce: **a failed `start_trip` never starts the task**, and **the ENDING row is written before the network is touched**, so a phone that dies mid-end still knows the trip ended and when.
- **Changed (app wiring):** `src/tracking/service.ts` is the new composition root — the only place the app supplies the real Supabase RPCs, the location task and the SQLite store to the injected service, built lazily so importing it costs nothing. `localState.ts` is the M5 stub's real reader now: "active" means TRACKING / ENDING / ENDED_PENDING_SYNC (all three still owe the driver a screen), ENDED does not.
- **Notable decisions:** (a) **The resume runs in the launch bootstrap, not in the S1 component body.** The M8 task said "wire it into Splash"; the bootstrap that feeds S1's gate is where it belongs, because it must complete before `decideRoute` reads `activeTripId` and it must run once rather than per render. What it must *not* do is block the gate: the local read is awaited (fast, local), the resume is not — a driver on a bad connection still reaches the app in a second, and a trip that was `ENDED_PENDING_SYNC` and syncs at launch stops routing them to the active-trip screen when the re-read lands. (b) **`distanceInterval: 0` is a deliberate deviation from TRD §4.2.** The doc's own storage estimate (~3,600 points per 10 h) is a 10-second cadence, which the 25 m movement gate cannot produce; the gate had to move. The battery consequence is real and unmeasured here — doc 10 §3 measures it in M10. (c) **A quarantined point makes the trip flagged, not silently shorter.** Leaving `received < expected_points` means `verify_trip` adds `MISSING_POINTS` → `needs_review`. Dropping a bad row without that signal would let a trip verify on incomplete data, which is exactly what a verification product must not do. (d) **`end_trip` may be called with a null end position.** The SQL column and the RPC accept null and `verify_trip` turns it into `END_OUTSIDE_DROP`; inventing a coordinate would be worse than a flagged trip. The generated types mark the parameter non-null, so the cast in `service.ts` documents that the null is intentional. (e) **`/dev/tracking`'s simulator runs the same `selectPoints` gate the task runs**, rather than adding points directly, so what the screen reports is the rule the phone applies.
- **Tests:** 109 new tests in `src/tracking/{config,errors,queue,uploader,stateMachine}.test.ts`; the full suite is 258 across 22 suites. They cover reducer transitions and ignored events, seq persistence across a simulated crash, idempotent batch upload, backoff bounds and jitter, every error code with `OUTSIDE_PICKUP:<m>` parsed to metres, the offline end → later sync, and resume after a kill. Gates: `tsc` clean, `eslint --max-warnings=0` clean, `prettier --check` clean, Jest 258/258, Deno 43/43.
- **Left:** the real device behaviour. A background location task cannot be exercised in this environment — it needs a development build (Mappls + `expo-location`) on an Android device — so the task's OS integration, the foreground-service notification and the ND-6 battery cost are **unverified**; the task's *logic* is tested through `selectPoints`/`toPointInput`. M9's locked-phone test and M10's field-test matrix are where those get proven. `service.ts`'s RPC wiring is type-checked against the generated `Database` types but has never run against a live Supabase, for the same missing-credentials reason as M7's e2e spec.
- **Known issues:** (1) `HEARTBEAT_MS` (5 min) is a guess chosen to sit under the 15 min gap; the right value depends on the battery measurement in M10 and may need to move. (2) iOS ignores `timeInterval`, so the effective cadence there is the platform's own — the TRD's `deferredUpdatesInterval` is not used, and tuning it belongs with the M10 device work. (3) The ND-6 wording change in docs 03/08 is still outstanding; the register records the decision but the TRD still shows `distanceInterval: 25`. (4) A quarantined row is invisible to the driver in M8; surfacing "N points could not be uploaded" belongs on D3 (M9) alongside the sync badge. (5) M7's e2e blocker and the carried-over items (Android SMS auto-read, `env.example`'s M1 note, `playwright install --with-deps` not in CI) are unchanged.

### 2026-09-27 · Supabase hosted-project integration check (anon-key probe + preview verification)

- **Verified working end to end:** the client integration is complete and the hosted project accepts it. The two public keys are set in the workspace env (names confirmed via the env panel, values never read); `src/lib/config.ts` resolves them under either documented key name; `src/lib/supabase.ts` builds the single typed client. Probing the project over HTTPS with the anon key: `/auth/v1/settings` returns 200 with the provider list — the key is valid and the project reachable — and the web preview boots on /sign-in with no console errors and no "Supabase is not configured" message. Gates at this state: tsc, eslint --max-warnings=0, prettier, 264/264 Jest, 43/43 Deno — all green. The preview log's "Multiple GoTrueClient instances" warning is Metro Fast-Refresh re-running the client module during development; the source has exactly one `createClient`, so it is dev noise, not a bug.
- **Gap 1 — the Phase 1 schema is not applied to the hosted project.** Probing through PostgREST with the anon key: `app_settings` → 404 PGRST205 ("Perhaps you meant the table public.ratings"), `profiles.consent_version` → 42703 (column does not exist), `rpc/start_trip` and `rpc/record_consent` → 404 PGRST202. Neither `0001_phase1_schema.sql` nor `0002_consent.sql` has been run there. The same probe shows the project already contains unrelated objects (`ratings` table, `record_gps_telemetry` function) — it is not a fresh quickstart project, but nothing it holds conflicts with our migration names. Applying them needs dashboard/CLI credentials this workspace does not have (no Supabase CLI, no Docker, CLI login is interactive): either `supabase link --project-ref qykqflshvsldzvdpwtni && supabase db push` from a machine with the CLI, or paste both migration files into Dashboard → SQL Editor in order. pg_cron note: the migration's `create extension pg_cron` and the sweeper `cron.schedule` need the extension enabled on the project (Database → Extensions) — on some plans it must be toggled first.
- **Gap 2 — phone auth is disabled on the hosted project.** `/auth/v1/otp` with a test number returns `phone_provider_disabled`. Until an SMS provider is configured (Dashboard → Authentication → Providers → Phone), hosted phone-OTP sign-in cannot work for anyone — the M5 🧍 sign-in checkpoint stays blocked on this, not on the app.
- **Keys:** the app bundle needs exactly the two already set — the project URL and the publishable anon key (the config also accepts the dashboard's alternate key name for the same value). The service-role key is server-only by hard rule 6: it goes to `supabase secrets set` when the Edge Functions are deployed (only `admin-create-driver` reads it), never into the app env; the Playwright spec would additionally want the five E2E keys, which remain unset and self-skip.
- **Left:** the two hosted-project configuration steps above (schema + SMS provider) are user-side dashboard/CLI actions; after the schema lands, `supabase gen types typescript --linked` should be diffed against `src/lib/database.types.ts` (they were generated from the local catalogue, so a drift check is cheap insurance).

### 2026-09-27 · M8 checklist re-verification (Prompt 9 re-run against the merged build)

- **No code changed.** The prompt's M8 checklist was re-run item by item against the engine already merged to `main` (commit `bfa44be`, PR #6) and every requirement is already implemented:
  - `config.ts` — `TRACKING_OPTIONS` from TRD §4.2 (BestForNavigation, AutomotiveNavigation, foreground service, indicator), plus the thresholds module (`UPLOAD_INTERVAL_MS` 30 s, `UPLOAD_BATCH_SIZE` 200, backoff bounds, RLS skew bounds, `MAX_START_ACCURACY_M`) and the ND-6 constants.
  - `db.ts` / `queue.ts` — `trip_state` single row (id = 1) with `trip_id/state/next_seq/started_at/ended_at/end_lat/end_lng/end_accuracy`; `point_queue` per TRD with the two ND-8 columns. `next_seq` advances inside `withExclusiveTransactionAsync` together with the rows that use it, so a crash or a rolled-back batch can waste numbers but never reuse one (asserted by the rebuild-from-persisted-state test).
  - `task.ts` — `TaskManager.defineTask` at module top level, imported **first** in `app/_layout.tsx`; maps `LocationObject` → rows (including `mocked` → `is_mocked`), applies the ND-6 keep-alive gate, does no network I/O, and swallows every error so the OS never unregisters it.
  - `uploader.ts` — 30 s interval + NetInfo reconnect + AppState foreground triggers; ≤ 200 rows; upsert with the `(trip_id, seq)` conflict target and `ignoreDuplicates`; single-flight `flush()`; exponential backoff with equal jitter; locally-invalid rows quarantined before sending and server-rejected rows quarantined row-by-row so a poison batch cannot wedge a trip.
  - `stateMachine.ts` — the TRD §4.1 diagram as a pure `reduce` (same-object identity on ignored events) plus the side-effect service: `startTrip` (fresh fix → RPC → persist → start updates; the task is **never** started when the RPC fails), `endTrip` (stop updates → persist `ENDING` with `ended_at` and the last seq **before** the network → flush → `end_trip`; offline → `ENDED_PENDING_SYNC`), `resumeOnLaunch` (restarts updates when `TRACKING`, retries a pending end, and treats `TRIP_NOT_ACTIVE` as already-ended success).
  - `errors.ts` — every docs/06 §1 code mapped to a typed union; `OUTSIDE_PICKUP:<m>` parsed to rounded metres.
  - `/dev/tracking` — persisted state, queue counts, last fix, and a fix simulator that runs the same `selectPoints` gate the background task runs; web runs it on the in-memory store.
  - Splash wiring — the resume runs from `useAuthBootstrap` (mounted in the root layout): the local tracking read is awaited first so S1's gate can decide immediately, the resume itself (task restart, pending-end retry, flush) runs in the background and re-reads state when it lands, and the upload scheduler starts on every launch. This is the documented M8 decision — "wire it into Splash" lands in the bootstrap that feeds the splash's gate, once per launch, without blocking the gate on a network call.
  - Tests — 109 tracking tests cover reducer transitions and ignored events, seq persistence across a simulated kill, idempotent upload, backoff bounds and jitter, error parsing including the metres extraction, offline end → later sync, and resume after a crash.
- **Verified:** gates re-run at this state — `tsc` clean, `eslint --max-warnings=0` clean, Prettier clean, Jest **264/264** across 22 suites, Deno **43/43**. Dev-server bundle boots; `/dev/tracking` renders against the in-memory store on web.
- **Carried (unchanged):** the background task's OS behaviour (foreground service, battery cost, kill-and-resume on a locked phone) still needs a real Android device — that is M9's locked-phone test and M10's field matrix, not unit-testable here; the ND-6 `distanceInterval: 0` wording change to docs 03/08 is still outstanding in the register.

### 2026-09-27 · M9 (Prompt 10) — driver onboarding D1/D2 and trip start D3/D4

- **Changed (config):** `app.config.ts` gained the `expo-location` plugin (background location and the Android foreground service enabled, with the exact docs/09 §3 permission strings) and `expo-notifications`; iOS gained `UIBackgroundModes: ["location"]` via `infoPlist`. The `ios`/`android` blocks were reorganised so each key appears once.
- **Changed (D1):** `app/(onboarding)/permissions.tsx` renders the prominent disclosure card first and requests nothing until it has; the three rows (precise location → "Allow all the time" → notifications) are walked in that fixed order because Android 10+ only offers background after foreground. A permanently denied row swaps Allow for "Open settings" plus an explanatory banner. Permissions re-read on every `AppState` foreground. Continue records DPDP consent through `record_consent` (`src/features/onboarding/consent.ts`, version constant next to the copy) and blocks the flow if the RPC fails. Pure row-state logic (`foregroundStateFrom`, `backgroundStateFrom` with the API < 29 rule, `notificationsStateFrom`, `permissionsComplete`, `permissionsLost`) lives in `src/features/onboarding/permissions.ts` with 15 unit tests.
- **Changed (D2):** `app/(onboarding)/battery.tsx` detects the manufacturer (cached in the auth store via `readDeviceManufacturer`) and renders that brand's numbered steps — Xiaomi/Redmi/POCO, Vivo/iQOO, Oppo/Realme/OnePlus, Samsung, generic — plus "Open settings" (`openBatterySettings` tries the brand's intent, then the app-details page, then `Linking.openSettings`), "I've done this" and "Skip for now". iOS/web render the not-needed note and forward. Brand detection and platform gating are unit-tested (12 tests).
- **Changed (D3):** `app/(driver)/index.tsx` is the real My Trips: greeting, sync chip (all synced / N points waiting, from the local queue), offline banner (NetInfo), the pinned live card with Resume (driven by the store's `activeTripId`, which the launch bootstrap fills — the pin survives offline), the assigned list from the new driver-scoped `useDriverTrips` (RLS-scoped, load+vehicle joined in TypeScript), an empty state, an error state, and pull-to-refresh. D2's pending-sync chip feeds from `readLocalTrackingState`.
- **Changed (D4):** `app/(driver)/trips/[id].tsx` shows the Mappls map with the pickup geofence circle, drop pin, dashed straight-line "planned" polyline (the road polyline is M11's) and the driver dot from a foreground `watchPositionAsync`; the bottom sheet derives its state from the pure `startState` module — waiting for GPS, weak GPS (accuracy > 50 m), outside radius with distance shown, ready, starting, error-retry — with the boundary rule "accuracy outranks distance" mirrored from the server's own check order. START calls `tracking.startTrip` (the M8 engine: a rejected start never begins location updates) and navigates to D5 on success; `already_tracking` navigates too.
- **Changed (gate):** `useProfile` now takes `permissionsGranted` from the store (read by the bootstrap and kept fresh by D1) instead of hard-coding true, so `decideRoute`'s onboarding branch is live: a driver whose background grant is missing routes to D1 on launch and after revocation. The permission read is part of the fast local bootstrap path, before the network session check is awaited.
- **i18n:** all new copy under `onboarding.*` and `driver.*` in en; ta/kn/hi stubs kept in key parity (the parity test still enforces it).
- **Tests:** 26 new unit tests (15 permission-row logic, 12 battery brand detection incl. the Xiaomi/Vivo/Oppo/Samsung families and fallbacks, and the D4 start-state boundaries incl. the ±1 m radius edge and accuracy-over-distance rule). Full suite **290/290 across 25 suites**.
- **Verified:** `tsc` clean, `eslint --max-warnings=0` clean, Prettier clean, Jest 290/290, Deno 43/43 unchanged. Preview restarted and verified: the web bundle compiles with all four screens and both new modules present, the app boots to /sign-in with **zero console errors** (the earlier 500 was Metro's failing on `expo-sqlite`'s wasm asset with a stale bundle URL shape; the page's own parameters compile fine — no repo change was needed).
- **Left (device-only, per docs/10 §3):** the OS-level behaviour this milestone targets — the actual system permission dialogs and their order on Android 10/13+, the MIUI/ColorOS/One UI battery screens reached via intent, and the foreground-service notification — needs a real Android development build (`expo run:android` with the Mappls credentials); none of it is exercisable in this sandbox. The `record_consent` RPC path also awaits the hosted project's pending schema migration (see the Supabase integration check entry).
- **Known issues:** (1) D4's planned route is a straight dashed line by design (ND-19/M11). (2) The D2 skip is ungated as specified ("Skippable but reminded"); the reminder banner wiring lands with M10's gap detection. (3) `expo-notifications` is used for the notifications permission row only; no notification content is scheduled in Phase 1 (the foreground-service notification comes from the OS).

### 2026-09-28 · M10 (Prompt 11) — active trip D5, end trip and summary D6

- **Changed (local trace):** `TrackingStore` gained `routePoints(tripId, limit)` — every stored row for the trip, uploaded rows included, oldest `seq` first (the SQLite `point_queue` select and the in-memory store used by web/tests). This is what D5 draws: the route comes from the phone rather than the server, so the map keeps up while the driver is offline, and rows are deleted only once a trip is final (CLAUDE.md hard rule 5).
- **Changed (D5 derivations):** `src/features/trips/liveState.ts` holds the pure rules — `liveSyncState` (offline outranks "pending"), `liveGpsState` (the verifier's own 50 m threshold, so "GPS good" means "this point will count"), `trackingProblem` (`stale` after `STALE_POINT_MS` = 2 min without a point, measured from the trip's start when no point ever arrived; a revoked permission outranks it), `approxDistanceM` (haversine over the points the verifier would keep), `formatElapsed`, `distanceToDropM`, `isNearDrop`, `liveStats`, `lastUploadedAt` and `agoParts` (unit + count, so the "20 s ago" string is translated rather than concatenated).
- **Changed (D5 data):** `src/features/trips/useLiveTripData.ts` polls the local queue every 5 s (`ROUTE_POINT_LIMIT` 2000). The read stamps its own `readAt`, so elapsed time and the staleness rule advance on every tick without a second timer and without any component reading a clock while rendering.
- **Changed (D5 screen):** `app/(driver)/trips/[id]/live.tsx` centres the Mappls map on the newest fix, marks the drop and the truck ("following the truck"), and draws the recorded trace as the actual polyline straight from the queue. The three stat blocks show elapsed time, approximate kilometres (labelled "approx." — the official number is Postgres's, hard rule 1) and km to drop; the sync row reports all synced / N points waiting / offline plus when the last point reached the server; the GPS row reports good/weak/lost; a problem banner covers a stale trace or a permission revoked mid-trip; inside the drop geofence a near-drop banner highlights a solid END button. `BackHandler` intercepts the Android back press and returns to My Trips — the trip keeps recording — and a foreground `AppState` re-read keeps the permission flag honest.
- **Changed (end flow):** END opens `ConfirmSheet`, which now accepts children so the "you are outside the delivery area" warning renders inside the sheet. Confirming calls `tracking.endTrip()`; both `ended` and the offline `pending` route to D6 (the summary is where the driver learns the verdict, and the active trip stays pinned until it syncs). A failure never blocks ending: the sheet closes and the error banner lives in the panel behind it, because a modal that hides its own error reads as "nothing happened".
- **Changed (D6 logic):** `src/features/trips/summaryState.ts` — `summaryVariant` (`completed` → `verifying`, or `pending_sync` when the end happened offline; verified / needs_review / rejected / cancelled pass through), `reasonKey`/`reasonKeys` mapping the ten docs/08 §3 codes to translation keys with an `unknown` fallback so a Phase 2 code never renders raw, `readMetrics` + `reasonDistanceM` for the two reasons the verifier measures, plus `formatTripDate` (hand-rolled — Hermes ships without full ICU) and `formatCount`.
- **Changed (D6 data and screen):** `useTripSummary` subscribes to the trip's own row over realtime and refetches on `SUBSCRIBED`, so a reconnect cannot leave a stale verdict on screen, and polls every 10 s *only while the status is still `completed`* — websockets are routinely blocked on Indian mobile networks, and "Checking your trip…" that never resolves is this screen's worst outcome. `useDriverTrip` gained a `refetchInterval` option and the trip projection gained `endedAt`, `expectedPoints`, `trackedDistanceM`, `verificationReasons` and `verificationMetrics`; the new `useDriverStats` reads `driver_stats` (never derived on the client). `TripSummaryPanel` renders the five variants, the reason list with its distances, and the verified totals; `app/(driver)/trips/[id]/summary.tsx` adds the offline-ended variant (the trip is still ours locally, or there is no connection) and a retryable totals error row.
- **Changed (publication):** `supabase/migrations/0003_realtime_trips.sql` adds `trips` to `supabase_realtime` (idempotent, checked against `pg_publication_tables`; RLS still applies per subscriber). Without it a subscription succeeds and silently delivers nothing, so `supabase/tests/05_realtime_publication.test.sql` asserts the membership in pgTAP (2 assertions).
- **Changed (UI kit):** `Button` gained the `dangerOutline` variant (a red-outline destructive action that is not yet the default choice) and `ConfirmSheet` accepts children. **Fixed:** `StatBlock`'s size map used a `value` key — the worklets Babel plugin (pulled in by `babel-preset-expo`) rewrites any inline-style read named `.value` as a Reanimated shared value, which injected a `require("react-native-reanimated")` warning closure into every D5/D6 stat row and made the component untestable under Jest; the keys are now `size`/`line`.
- **Setting:** `src/features/settings/store.ts` (zustand, client state per CLAUDE.md) plus `useTripKeepAwake` (`expo-keep-awake` under a single tag, so leaving the screen, ending the trip and turning the setting off all release the same lock). Keeping the screen awake is **off by default** — the cost is battery, which D2 already warns about. D8 owns the real settings list; until then D5 exposes the toggle where it matters.
- **i18n:** new `driver.live.*` and `driver.summary.*` copy in en, including one sentence per docs/08 §3 reason code (copied from the doc's driver-facing text) and an `unknown` fallback; ta/kn/hi stubs kept in key parity.
- **Tests:** 69 new — 25 live-state derivations (sync/GPS/staleness boundaries, approx distance filtering, formatting), 17 D5 sheet states, 15 summary variants and reason mapping, 12 D6 panel variants. Full suite **359/359 across 29 suites**.
- **Verified:** `tsc` clean, `eslint --max-warnings=0` clean, Prettier clean, Jest 359/359, Deno 43/43. Preview: the web bundle compiles (HTTP 200, 10.9 MB) with both screens and every new module present, and the app boots to `/sign-in` with **zero console/page errors** (Playwright smoke).
- **Left (device-only):** following the truck on a locked phone, the foreground-service notification and the real two-minute gap signal need a real Android development build; the offline-end → later-verified path needs the hosted project's pending migration; `verify_trip` itself is exercised server-side in M11/M12, not here.
- **Known issues:** (1) the route is per-point straight segments by design — road-snapped polylines are M11's. (2) D6's `pending_sync` is inferred from "the trip is still our active trip, or there is no connection"; a truer signal is the uploader's queue-exhausted event. (3) D2's battery reminder and M9's gap detection are still separate — `batteryReminderReason` exists but nothing renders it outside D2; that banner belongs with D8's settings list. (4) keep-awake is only reachable from D5 until D8 exists.

### 2026-09-28 · M11 (Prompt 12) — live dashboard C1, trip review C6/C7, history D7 and profile D8

- **Changed (C1 data):** `useLiveTrips` reads `trip_live` (one row per truck on the road) and joins the driver, vehicle and load in TypeScript, because the generated types carry each table's own foreign keys but not the reverse relationships. Realtime is a `postgres_changes` subscription on `trip_live` (published by 0001) that invalidates the query on every event — the row is a four-table join, so refetching is the only way to be sure the name beside the position is current — and it **re-reads the table on `SUBSCRIBED`**, because a socket that dropped and came back has missed everything that happened while it was gone. A 30 s poll sits underneath, so a console left open on a flaky office link still notices a trip that ended.
- **Changed (C1 rules):** `liveState` holds the pure derivations: `ageParts` (unit + count so "20 s ago" is translated, not concatenated), `isStale` (the 15-minute rule from docs/12, compared in milliseconds — a row whose timestamp cannot be read counts as stale, because silence is not health), `sortLiveTrips` (fresh first, stale pushed down but never hidden), `kpiStrip` (live/stale derived from the rows on screen so the strip cannot disagree with the list; assigned-today and need-review counted in Postgres), `kmPerHour`, and the map geometry: truck markers carry the reported `heading` so the marker rotates, and the "route tail" is the straight line from the pickup to where the truck is now — a straight line on purpose, because `trip_live` holds one position and inventing a road route from two points would be a picture the database does not support.
- **Changed (C1 screen):** KPI strip, the fleet map (`fitToContent`, zoom 6) and a 35% side panel of rows — vehicle, driver, Load ID, route, speed and last update, with a stale row carrying a red left border **and** the words "No recent data · 18 min ago" (DESIGN.md: never colour alone), a red note under the map when any truck is stale, and an empty state. A row opens C6.
- **Changed (C6 route):** `useTripRoute` pages `trip_points` at 1000 rows per request (docs/06 §2) and merges pages 1..N in order, so a reviewer who wants the whole route asks for more and the screen says how many points exist. While the trip is still running, `useTripPointStream` appends new points from a `postgres_changes` subscription, de-duplicated by `seq` and capped at 2000 so a tab left open all day cannot grow without bound; the tail is merged by `mergeRoutePoints` rather than written into the query cache, so the paged read stays a paged read.
- **Changed (C6 replay):** `replayState` is a pure machine over (index, playing, next step) — `play`, `pause`, `seek`, `tick`, `progress`, `indexAtTime` — driven by a 1 s tick from the screen. It advances one recorded point per 2 s rather than replaying real time (nobody watches nine hours at 1×), restarts from the beginning when play is pressed at the end, catches up after a throttled tab instead of losing the trip, and stops cleanly on the last point. `ReplayBar` is a play/pause button plus a press-to-scrub track: no native slider module (the console is a web build as much as a native one), keyboard-reachable, and every position it can reach is a point that exists. The planned route stays the dashed straight line between the geofence centres, as in C4.
- **Changed (C6 verification + timeline):** `verificationState` reads `verification_metrics` defensively — a missing, null or wrongly-typed field reads as null and is simply not shown, so a trip verified by an older build of `verify_trip` still renders. A cell with no measurement is **dropped rather than shown as a zero** ("0 mocked" and "we do not know" are very different claims). Reason chips show the raw code (the operator will cross-check it against the database) with the driver's plain-language sentence underneath, reusing the D6 sentences so a driver and an operator are never told two different stories about one flag. `EventTimeline` renders `trip_events` with the actor, and tapping an entry scrubs the replay to that moment; an event type this build has never heard of falls back to a neutral label rather than a raw key.
- **Changed (C6 review):** `ReviewPanel` is the decision card — reason chips above, a **mandatory** note, "Approve & verify" and "Reject". It only exists while the trip is in `needs_review`; a decided trip shows its outcome, the note and who decided it. The note is required client-side (`noteError`, `canSubmitReview`) and server-side (`NOTE_REQUIRED`), and there is **no optimistic update** (docs/12 C6): `admin_review_trip` moves the trip, the queue, the sidebar badge and — on approval — the driver's verified totals, and the mutation invalidates all four. The three expected raises of that RPC (`NOTE_REQUIRED`, `TRIP_NOT_IN_REVIEW`, `FORBIDDEN`) are mapped to sentences, because they are ordinary states of a shared queue, not exceptions.
- **Changed (C7):** `useReviewQueue` returns `needs_review` trips **oldest first by end time** (the ones that have been waiting longest), and `ReviewCard` shows Load ID, driver, vehicle, route, how long ago it ended, the reason sentences and a non-interactive 200×140 Mappls thumbnail, with the whole card opening C6. Empty state: "All caught up".
- **Changed (D7):** `historyState` owns the rules — the four filters, the month grouping (a trip is filed under the month it **ended**, so one that runs past midnight lands in the morning) and the summary strip, which counts the driver's whole record rather than the open filter. `assigned` trips are excluded: a trip that has not started belongs on D3. `HistoryList` renders month sections and rows (date, route, Load ID, verified km, status chip) and a row opens D6; `useDriverHistory` is one RLS-scoped read plus a load join, unpaged because this is one person's history read on a phone.
- **Changed (D8):** `useOwnProfile` adds the two columns the gate's `AuthProfile` does not carry (phone, `created_at`). The header card shows initials, name, a **masked** phone (`+91 98xxx x3210` — shown in full on the dispatch screen, not on the driver's own locked phone) and "Driver since Oct 2026". `ProfileStatsCard` is read-only with the lock and the caption "Calculated by Namma Lorry from GPS — can't be edited", showing verified trips, verified km and the last verified trip straight from `driver_stats` (a driver with no verified trip sees a dash, not a zero). The settings list has the language sheet (the four shipped languages, applied through i18next), a location & battery check, the privacy policy, help and a guarded sign out.
- **Changed (D8 honesty):** `deviceHealth` re-reads the same permission snapshot D1 works with and is explicit about the one check the app **cannot** perform: whether the OS battery-optimisation exemption is set is not readable, so Android reports "unknown" rather than "all good" — a card that claims everything is fine when a trip is about to be lost is exactly the invented reassurance this product exists to avoid. `signOutBlockedBy` blocks signing out during an active trip (signing out stops the background task, which would end the record mid-drive) and the row says why. The privacy policy is shown **in-app** from the same docs/09 disclosure copy D1 uses; a published URL is release work (M12c) and a link to nothing is worse than the text.
- **Changed (realtime):** `supabase/migrations/0004_realtime_trip_points.sql` publishes `trip_points` (idempotent, checked against `pg_publication_tables`), which C6's live append needs — a subscription to an unpublished table succeeds and then silently never delivers anything. `supabase/tests/06_realtime_points.test.sql` asserts both the new membership and that 0003's `trips` publication is still there.
- **Fixed (two real bugs the tests caught):** (1) `metricsGrid` rendered "0 points" for a trip the verifier had not measured, because it substituted `?? 0` for a missing count — the exact "we do not know" vs "zero" confusion the module documents against. (2) `isStale` compared a *rounded* age against a 15-minute threshold, so "40 s ago" (40 > 15) was treated as stale; it now compares elapsed milliseconds.
- **Fixed (both surfaces):** a geofence miss under a kilometre was rounded to "0.0 km away" (D6) and "0 km away" (the new console chips). `reasonDistanceParts` now renders metres below 1 km and kilometres above, and both the driver app and the console use it, so the same flag is never described two ways.
- **Fixed (test harness):** RNTL 14's `render` **and** `fireEvent` are async. Three `fireEvent` calls in the M10 suites were not awaited, which leaves the act() scope open — harmless in those files by luck, and it fails every later query as soon as a file has more of them. All `fireEvent` calls are now awaited, and the new suites document why.
- **i18n:** new `console.live.*`, `console.trip.*` (including one label per `trip_events` type and the five metric labels), `console.review.*`, `driver.history.*` and `driver.profile.*` in en; ta/kn/hi stubs kept in key parity.
- **Tests:** 117 new across 10 suites — 18 C1 rules, 23 replay edges, 9 review-note rules, 13 verification-metric reads, 11 history rules, 12 health/sign-out/profile-format rules, and 34 component tests (C1 list + KPI states, C6 review panel and verification card, D7 month grouping and filters, D8 read-only card). Full suite **476/476 across 39 suites**.
- **Verified:** `tsc` clean, `eslint --max-warnings=0` clean, Prettier clean, Jest 476/476, Deno 43/43. Preview: the web bundle compiles (HTTP 200, 11.07 MB) with all five screens and every new component present, and the app boots to `/sign-in` with **zero console/page errors** (Playwright smoke).
- **Left (needs a real session, per docs/10 §3):** the live board against real `trip_live` traffic, a route longer than 1000 points (the "load page N" path), realtime actually delivering on a browser that blocks websockets, and the replay of a nine-hour trip — all need a hosted project with migrations applied and real trips in it, none of which exist in this sandbox. The hosted project's pending migrations now include 0003 and 0004.
- **Known issues:** (1) The C1 route tail and the C6 planned route are straight lines, as in C4 — road-snapped polylines need a routing service this phase does not buy. (2) C6 has no map "last update" pill for a live trip; the freshness is visible in the list it was opened from. (3) D8's "Help & support" opens the access-notice screen, which is not a support page — a real destination (phone number or URL) is M12c. (4) D2's battery reminder is still unrendered outside D2; the health check reports "unknown" instead. (5) `supabase/tests/06` and the other pgTAP files cannot run here (no Postgres), as with 01–05.

### 2026-09-29 · Validation fixes — base line chosen, B1 (production web export)
- **Decided:** fixes for `docs/PHASE1_VALIDATION_REPORT.md` (PR #11) target **`main`** (report §5 item 1 / M1). Work from `r0-stabilise` (race fix, fail-closed config, Sentry, CI jobs, release docs) is ported per item, with its migrations renumbered after main's 0003/0004.
- **Changed (B1):** `expo export -p web` failed with `Unable to resolve module ./wa-sqlite/wa-sqlite.wasm`: expo-sqlite's web worker imports a `.wasm` file, Metro's default `assetExts` has no `wasm`, and the driver routes pull `expo-sqlite` into the web graph through `@/tracking/db`. The M9 entry above saw the same error in the dev server and put it down to a stale bundle URL. Added `metro.config.js` (Expo defaults + `wasm` asset), a `export:web` script, and a CI step that runs the production export on every PR. Regression test: `src/lib/metroConfig.test.ts`.
- **Verified:** the production export emits the entry bundle, the SQLite worker and `wa-sqlite.*.wasm`; Jest 479/479; `tsc`, ESLint clean.
- **Left:** hosting config (Vercel, SPA fallback, CSP) is still part of B5.

### 2026-09-29 · Docs pack promoted to the repo root (docs/14 R1 steps 1–2)
- **Changed:** the newest pack (`namma-lorry-phase1-docs/namma-lorry-phase1-docs/`) now lives at the root: `CLAUDE.md`, `AGENTS.md` (identical to CLAUDE.md), `README.md`, `docs/01–04, 06–13`, `stitch/DESIGN.md`; `docs/14` added from the completion-prompt file; `docs/15-option-a-merge-plan.md` (Option A rationale + port checklist) and `docs/16-phase1-validation-prompt.md` (V1 validation, V2 fix loop, V3 re-validation) added as pasted; README file table lists 14–16. The live root `supabase/` was kept as is; the pack's psql smoke script moved to `supabase/smoke_phase1.sql` (outside `tests/`, so `supabase test db` does not pick it up).
- **CLAUDE.md:** layout rewritten to what the code uses (ND-9: route groups, `src/features`, `src/tracking`, `src/lib`, `src/theme`, `plugins/`, `e2e/`), bun as the package manager, rule 8 = admin-only web console (ND-10), hard rules 11–13 from docs/14 R1.
- **Deleted after byte-compare (md5 identical to the kept copy):** root `02-PRD.md`, `03-TRD.md`, `13-claude-code-prompts.md`, `0001_phase1_schema.sql` (= `supabase/migrations/0001`); the whole old pack `namma-lorry-phase1-docs/` (docs 01–03, 06–12, AGENTS/CLAUDE, DESIGN.md, 0001, smoke test — all identical to the newest pack) and `namma-lorry-phase1-docs.zip`; `SCREENS/12_screens_and_stitch_prompts.md` (= docs/12) and `SCREENS/design.md` (= stitch/DESIGN.md).
- **Deleted, not identical (older revisions superseded):** root `04-screen-navigation.md` and old-pack doc 04 (the newest pack's doc 04 merges C8 into C6 — see docs/00 §1); root `README.md` (older revision without docs 12/13); both pack `.env.example` copies (older than the live root `env.example`, which has the store-URL, Mappls-licence and Sentry entries).
- **Kept:** `SCREENS/namma_lorry/DESIGN.md` — it differs from `stitch/DESIGN.md` (Stitch-exported token palette; ND-17 says the brief wins). The `SCREENS/ → design/` move (R1 step 3) and the docs/04 route update (R1 step 4) are not part of this PR.
- **Added:** `.gitattributes` (`* text=auto eol=lf` plus binary rules for images, fonts, archives, PDFs, keystores). The index was already all-LF, so `git add --renormalize .` changed no files.

### 2026-09-29 · Validation B2 — admin trip writes only through audited RPCs (ND-13)
- **Finding:** `rls-attacks.md` A29 — an admin `PATCH trips` set `status = 'verified'` and `tracked_distance_m` with no event and no stats, because `trips_admin` was `FOR ALL` (CLAUDE.md hard rule 2, docs/09 §5 "Admin abuse").
- **Test first:** `supabase/tests/07_admin_trip_writes.test.sql` (36 tests) failed 30/36 on main: the A29 update, a direct DELETE, inserting an already-verified or already-started trip, and every `cancel_trip` / `admin_force_end` contract.
- **Changed:** `0005_admin_trip_writes.sql` replaces `trips_admin` with `trips_admin_read` (SELECT) and `trips_admin_assign` (INSERT of a fresh `assigned` trip with every server-owned column empty). New RPCs `cancel_trip` (assigned → cancelled) and `admin_force_end` (in_progress → verify over the received points → always `needs_review` with `MISSING_POINTS`), both note-required with the admin in the event. docs/06 lists both with their error codes; `database.types.ts` gained the two functions.
- **CI:** new `database` job (Supabase CLI 2.118.0, `supabase db start` = all migrations from zero + seed, then `supabase test db`). The pgTAP suites run in CI for the first time (report 0.4).
- **Verified:** pgTAP 175/175 from a clean reset (139 before + 36). Console assignment (`useTrips.ts` insert of `load_id, driver_id, vehicle_id`) is still allowed and is covered by pgTAP 07.
- **Left:** no console UI calls the two RPCs yet (C4 "Cancel trip", C6 "Force end" are R7/M-series UI work); `admin_revoke_trip` + `recompute_driver_stats` (docs/14 R2); the sweeper for abandoned `in_progress` trips (M6 / ND-25) can reuse `admin_force_end`'s logic. Suite 01 inserts points for every trip in the table (line 41–43), so it breaks on a DB with leftover trips — run it after a reset.

### 2026-09-29 · Validation B3 — DPDP controls (consent gate, retention, erasure)
- **Findings:** (a) no retention job, period undecided (ND-5); (b) no erasure path; (c) D1 ignored a failed consent write (`recordConsent()` returns `{ ok: false }`, the screen only caught throws); (d) `start_trip` did not require consent (walkthrough step 5c).
- **Decisions (29 Sep):** raw GPS kept 12 months after a trip is final, then ≤ 500-point simplified route + result (**pending client sign-off**, ND-5); erasure anonymises and keeps trip results and `driver_stats`; auth-user ban is out of scope.
- **Tests first:** pgTAP `08_dpdp.test.sql` (42) failed in CI (consent gate from test 1, then aborted on the missing columns); Jest `permissionsScreen.test.tsx` (RNTL, D1 `{ ok: false }` must block Continue), `startState.test.ts` (`startErrorText`, every start code → English text) and `errors.test.ts` (`CONSENT_REQUIRED`) failed locally (16 tests) and failed CI typecheck. Suites 01/02 give their fixture drivers a consent.
- **Changed:** `0006_dpdp_controls.sql` — `start_trip` raises `CONSENT_REQUIRED` (after the ownership check); `raw_point_retention_days` = 365, `trips.points_downsampled_at`, `downsample_old_points()` + nightly cron `downsample-old-points`; `admin_events` (admin read only) + `profiles.erased_at` + `admin_erase_driver`. D1 checks `result.ok`. D4 renders driver-facing text for every start error (`startErrorText`, `driver.trip.errors.*`; ta/kn/hi `TODO:`) instead of the raw upstream message, with a **Review notice** action → D1 for `CONSENT_REQUIRED`. docs/06, docs/09 §1, new docs/RUNBOOK.md (§Erasure), `database.types.ts`.
- **Verified:** pgTAP 217/217 from a clean reset (175 + 42); Jest 495/495; `tsc`, ESLint, Prettier clean.
- **Left:** banning/removing the auth user (phone stays in `auth.users`) needs an Edge Function or the dashboard — RUNBOOK step; no console UI for erasure yet (SQL editor per RUNBOOK); the launch gate does not re-prompt D1 when `CONSENT_VERSION` changes (consent.ts's comment assumes a check that does not exist) — the server gate only checks that *a* consent exists; client sign-off on 365 days; `CONSENT_VERSION` still has no published privacy policy to match (B5).

### 2026-09-29 · Validation B4 — crash reporting (Sentry) with PII scrubbing
- **Finding:** no crash reporting on main (`@sentry` absent), so PRD §7 "crash-free ≥ 99 %" could not be measured and docs/09 §1 breach readiness had no alerts.
- **Tests first:** `src/lib/scrub.test.ts`, `src/lib/sentry.test.ts`, `src/components/ErrorBoundary.test.tsx` (15 tests), pushed without the implementation; CI failed at typecheck on the missing modules.
- **Changed (ported from `backup/local-line-0929`, adapted to main):** `@sentry/react-native ~7.11.0` (`@sentry/cli` added to `trustedDependencies` so its binary installs for source-map upload). `src/lib/scrub.ts` masks phone numbers and high-precision coordinates and filters phone/coordinate keys. `src/lib/sentry.ts`: no-op without a DSN; `sendDefaultPii: false`; release `namma-lorry@<version>`, dist = native build number or `web`, environment = `EXPO_PUBLIC_APP_ENV`; every event and breadcrumb scrubbed; user by opaque id only. `src/components/ErrorBoundary.tsx`: translated fallback (`common.errorBoundary.*`; ta/kn/hi `TODO:`), reports the error, never shows its text. `app/_layout.tsx`: `initSentry()` at module scope after the task import, `ErrorBoundary` around the stack, `setSentryUser(userId)`, default export wrapped with `Sentry.wrap`. `app.config.ts`: `@sentry/react-native/expo` plugin only when `SENTRY_AUTH_TOKEN` is set. `env.example`: `SENTRY_ORG`, `SENTRY_PROJECT`.
- **Not done on purpose:** the background task does not report to Sentry (no network I/O inside the task, CLAUDE.md hard rule 4).
- **Verified:** Jest 510/510; `tsc`, ESLint, Prettier clean; production web export builds; `expo config` resolves with and without `SENTRY_AUTH_TOKEN`.
- **Left (human):** create the Sentry project, set `EXPO_PUBLIC_SENTRY_DSN` per environment and the three EAS secrets, then send a test event from a preview build (report §5 item 9).

### 2026-09-29 · Validation B5a — app.config release hardening (M3, M11)
- **Findings:** M3 — the production Android manifest had `allowBackup="true"` plus the template's `SYSTEM_ALERT_WINDOW`, `VIBRATE`, `READ/WRITE_EXTERNAL_STORAGE`, and no `POST_NOTIFICATIONS`. M11 — iOS `UIBackgroundModes = ["location","fetch"]` (`fetch` from expo-task-manager's plugin), `NSLocationAlwaysUsageDescription` and `NSMotionUsageDescription` were Expo's generic defaults, and introspect showed `NSAllowsArbitraryLoads: true`. `EXPO_PUBLIC_APP_ENV` was not validated at build time and every profile had the same name.
- **Tests first:** `app.config.test.ts` (Jest, 12) and `test/config/introspect.test.mjs` (node:test, 5, `expo config --type introspect`), pushed with only a `buildConfig(env)` / `appEnvFrom(env)` seam that kept the output unchanged. CI failed at Unit tests (8/522); the introspect step was skipped after that failure, and all 5 failed locally.
- **Changed (`app.config.ts`, ported from `backup/local-line-0929`, adapted to main's env names and `com.nammalorry.driver`):** `appEnvFrom` rejects anything outside development/staging/production (unset/empty = development); name per env (`Namma Lorry (Dev)` / `(Staging)` / `Namma Lorry`). Android: `allowBackup: false`, `POST_NOTIFICATIONS`, `blockedPermissions` for the four template permissions, `usesCleartextTraffic="false"` outside development. iOS: `locationAlwaysPermission` = docs/09 §3 text, `motionUsagePermission: false` (key removed), `isIosBackgroundLocationEnabled`, a mod that strips `fetch`, ATS `NSAllowsArbitraryLoads: false` without the localhost exception outside development, `privacyManifests` (UserDefaults CA92.1, FileTimestamp C617.1, SystemBootTime 35F9.1, DiskSpace E174.1). Mappls, Sentry, expo-sqlite and expo-notifications plugins unchanged. New `test:config` script (`node --test "test/config/*.test.mjs"`, a glob because Node 22 on CI does not take a directory) and CI step.
- **Verified:** Jest 522/522, `test:config` 5/5, `tsc`, ESLint, Prettier clean; production web export builds. `EXPO_PUBLIC_APP_ENV=production expo prebuild -p android --no-install --clean` manifest: `allowBackup="false"`, `usesCleartextTraffic="false"`, `POST_NOTIFICATIONS`, the four blocked permissions as `tools:node="remove"`.
- **Left:** the final iOS Info.plist from a macOS prebuild or EAS build is still unchecked (introspect uses Expo's placeholder plist template); M9 (D1) must request `POST_NOTIFICATIONS` at runtime; icons, splash and the notification icon wait for the assets (B5e ASSETS.md); fail-closed runtime config is B5b.

### 2026-09-29 · Validation B5b — fail-closed config outside development (M2)
- **Finding:** M2 — `src/lib/config.ts` fell back to `appEnv: "development"` on an invalid env and `src/lib/supabase.ts` to `http://127.0.0.1:54321` when unconfigured, with no blocking screen. **Worse than reported:** `loadConfig()` validated `process.env` as a whole object, which Metro never fills in a release bundle (it only inlines literal `process.env.EXPO_PUBLIC_X`). A production web export from main contained neither the Supabase URL nor the key, so every release build silently ran against the localhost placeholder.
- **Tests first:** `src/lib/config.test.ts` (`resolveConfig`: development vs staging vs production × valid / missing / unparsable / `http://` URL, dashboard key name, key names only, release bundle without APP_ENV), `src/lib/supabase.test.ts` (`supabaseCredentials` never falls back to localhost outside development; the client is never created when misconfigured), `src/components/Misconfigured.test.tsx` (RNTL on `app/_layout`: blocking screen, no auth bootstrap, no routes, one Sentry report), and a CI step that fails unless the production web export carries the probe `EXPO_PUBLIC_SUPABASE_*` values. Pushed with behaviour-preserving seams; CI failed at Unit tests (13/551).
- **Changed:** `config.ts` — pure `resolveConfig(env, __DEV__)` over literal `process.env.EXPO_PUBLIC_*` references; outside development a missing, unparsable or `http://` URL or a missing key gives `configProblems` (`{ key, reason }`, names only) and an empty URL and key; a release bundle with no or an unknown APP_ENV is treated as a misconfigured production build; development still throws on an unknown APP_ENV and tolerates a missing backend. `supabase.ts` — `supabaseCredentials()`; the localhost placeholder is development-only; otherwise the client is not created and a stand-in throws "Supabase is not configured" on any use. `sentry.ts` — `reportMisconfigured()` (once, fatal, key names and reasons only; no-op without a DSN). `app/_layout.tsx` — reports at startup and renders `Misconfigured` in place of fonts, auth bootstrap and routing. `src/components/Misconfigured.tsx` + `common.misconfigured.*` (ta/kn/hi `TODO:`). `staging` also rejects `http://`, not only production.
- **Verified:** Jest 553/553 (`sentry.test.ts` +2 for `reportMisconfigured`, added with the fix); `tsc`, ESLint, Prettier clean. Production web export with probe values: URL and key inlined. Production export with `EXPO_PUBLIC_SUPABASE_URL=http://insecure.example.com` and no key, served locally in headless Chromium: the Misconfigured screen lists both key names, and no request went to the http host or localhost.
- **Left:** Metro caches inlined env values, so a local re-export after changing `EXPO_PUBLIC_*` needs `expo export --clear` (fresh CI and EAS runners are unaffected); B5d's Vercel build must set `EXPO_PUBLIC_APP_ENV` and both Supabase values, or the console shows Misconfigured. Setting the real values per EAS environment is a human item (B5c).

### 2026-09-29 · Validation B5c — EAS channels, EAS Update and operator scripts
- **Gap:** `eas.json` had no update channels or EAS environments, `app.config.ts` had no EAS project, runtime version or `updates` block, and `expo-updates` was not installed (the Android manifest had `expo.modules.updates.ENABLED=false`), so no over-the-air update could reach a build. No operator scripts for publishing updates, creating hosted users or checking store assets.
- **Tests first:** `app.config.test.ts` (+1: owner, `extra.eas.projectId`, `runtimeVersion`, `updates`), `test/config/eas-json.test.mjs` (channel / EAS environment / APP_ENV per profile, `preview_apk` APK, no backend value hardcoded, `expo-updates` installed), `scripts/__tests__/*.test.mjs` (23, ported from `backup/local-line-0929` and adapted: preview channel → `staging`; asset check report-only by default, `--strict` exits 1). Pushed with stub scripts so lint resolved the imports; CI failed at Unit tests; locally 23 script and 6 eas.json tests failed.
- **Changed:** EAS project **@santhoshkrwork/namma-lorry** `2a3edc84-9fe4-4593-b278-ef919ec1b82c` in `app.config.ts` (`owner`, `extra.eas.projectId`), `runtimeVersion: { policy: "appVersion" }`, `updates` (`u.expo.dev/<id>`, `fallbackToCacheTimeout: 0`, `ON_LOAD`); `expo-updates ~57.0.24`. `eas.json`: `development` / `preview` / `preview_apk` (extends preview, APK) / `production`, each with a channel and EAS environment; only `EXPO_PUBLIC_APP_ENV` in `env`. `scripts/eas-update.mjs` (no shell, clean tree, commit SHA in the message, APP_ENV from the channel), `scripts/provision-user.mjs` (explicit flags only; `http://` only for a `localhost` / `127.0.0.1` hostname), `scripts/check-release-assets.mjs`. `package.json`: `test:scripts`, `release:assets`, `update:preview`, `update:production`, `provision-user`. CI: Script tests, Release assets (report only). docs/DEV_SETUP.md §4.1 (fail-closed note), §4.3 (profiles, `eas env:create` per environment, publishing), §5.1 (provisioning users).
- **Verified:** Jest 554/554 (three clean runs; one earlier run under load had 2 failures that did not reproduce), `test:config` 12/12, `test:scripts` 23/23, `tsc`, ESLint, Prettier clean; production web export builds. Introspect: Android `expo.modules.updates.ENABLED=true`, `EXPO_UPDATE_URL=https://u.expo.dev/2a3edc84-…`; iOS `EXUpdatesURL` the same, runtime `1.0.0`.
- **Left (human, hard rule 11):** run the `eas env:create` commands in DEV_SETUP §4.3 for `preview` and `production` (until then those builds show the Misconfigured screen); create the production Supabase project; the Sentry DSN and token; the brand assets (`release:assets --strict` before any store build); delete the stray second EAS project (`985d8f0d-…`) if it exists. No EAS build or update has been run from this PR.

### 2026-09-30 · Validation B5d — web console hosting: Vercel, security headers, CSP
- **Gap:** no hosting config for the web console: no SPA rewrite, no caching rules, no security headers, no Content Security Policy.
- **Tests first:** `test/config/vercel.test.mjs` (build commands, rewrite in and out, caching, security headers on every path, each CSP directive) and `scripts/check-web-csp.mjs` (serves `dist/` with `vercel.json`'s headers and rewrites, loads `/` and `/sign-in` in headless Chromium, types a number and presses Send OTP so a real Supabase auth request is made, and fails on any CSP violation from console messages or `securitypolicyviolation` events). Pushed without `vercel.json`: the vercel suite and the browser check both failed.
- **Measured, not guessed:** under a strict policy (`style-src 'self'`) Chromium reported 16 violations: react-native-web and expo-font create `<style>` elements at runtime, so **`style-src` keeps `'unsafe-inline'`** (the one exception). `script-src` needed nothing beyond `'self'`: the export has no inline script. **No `'wasm-unsafe-eval'`**: `getTrackingStore()` returns the memory store on web, so expo-sqlite's worker and wasm are exported but never loaded. Fonts are bundled by `@expo-google-fonts`, so no Google Fonts hosts. A negative control (Supabase removed from `connect-src`) makes the check fail on the blocked `/auth/v1/otp` call.
- **Changed:** `vercel.json`: `framework: null`, `bun install --frozen-lockfile`, `bun run export:web`, `dist`; rewrite of every path except `/_expo/`, `/assets/` and anything with a dot to `/index.html`; `Cache-Control: no-cache` by default and `public, max-age=31536000, immutable` for `/_expo/static/*` and `/assets/*` (all content-hashed); CSP, HSTS (2 years, includeSubDomains), `nosniff`, `strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy` (geolocation, camera, microphone, payment, usb off). `check:web-csp` script; CI installs Chromium and runs it after the web export. DEV_SETUP §4.4 (Vercel env vars per environment, redeploy after changes, adding a CSP host).
- **Verified:** `test:config` 22/22; `check:web-csp`: zero violations on `/` and `/sign-in`, including the Send OTP request to `ci-probe.supabase.co`.
- **Left:** the Mappls hosts (`*.mappls.com`, `*.mapmyindia.com`, `blob:` workers, `data:`/`blob:` images) are **untested**: the map needs `EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY` and a signed-in admin. Re-run the check on a console map page once both exist. Sentry ingest is untested until a DSN exists. Creating the Vercel project and setting its env vars is a human item.

### 2026-09-30 · Validation B5e — release docs and runbook
- **Gap:** no `docs/release/*` on `main` (privacy policy, store data forms, background-location declaration, review notes, asset specs) and `docs/RUNBOOK.md` had only §Erasure. `CONSENT_VERSION` (`2026-09-27.1`) matched no published policy.
- **Tests first:** `test/config/release-docs.test.mjs` (run by `test:config`): every release doc exists and the README links it; the policy starts "Requires legal review before publishing", has the docs/09 §6 sections and says 12 months; its **Version** equals `CONSENT_VERSION`; ASSETS.md lists exactly the `check-release-assets` `SPECS` files with their size, transparency and `app.config.ts` field; RUNBOOK keeps Erasure and has the six operational sections; every `bun run` script, `public.<fn>(…)` call and repo path named in the runbook and release docs exists (package.json, migrations, file tree), with a negative control. Committed before the docs: locally 6 of 7 failed.
- **Changed:** `docs/release/` README (ordered release checklist: env vars, migrations, assets, EAS build, submit, Vercel), PRIVACY_POLICY (version `2026-10-01`, 12-month retention pending sign-off, erasure as in 0006), DATA_SAFETY and APP_PRIVACY (each row cites the collecting file), BACKGROUND_LOCATION (both Play forms, docs/09 §2 video shot list against the real D1), APP_REVIEW_NOTES (demo account via `provision-user`, the geofence), ASSETS. RUNBOOK: Admin SQL session (the `request.jwt.claims` line), Deploy, Rollback, Key rotation, Stuck trip (`admin_force_end`, `cancel_trip`), Re-run verification, Data incident; Erasure unchanged. `CONSENT_VERSION` = `2026-10-01`, and its comment no longer claims a re-prompt that doesn't exist.
- **Verified:** `release-docs` 7/7. Every SQL block in Stuck trip and Re-run verification ran on the local stack in a rolled-back transaction: without the session the RPCs raise `FORBIDDEN`; with it `cancel_trip` → `cancelled` (event actor = admin), `admin_force_end` → `needs_review` `{END_OUTSIDE_DROP, LOW_COVERAGE, MISSING_POINTS, DISTANCE_TOO_SHORT}`, the one-trip and all-trips re-verification blocks → `needs_review` with `reverify` events carrying the admin.
- **Left:** **re-consent gap** — changing `CONSENT_VERSION` re-prompts nobody: the launch gate never compares versions and `start_trip` only checks non-null, so existing test drivers keep their `2026-09-27.1` consent until a version check exists (client gate and/or `start_trip`). D1 mentions neither retention nor a policy link (docs/09 §1). Human items: legal review and publication of the policy, the demo account and review load, the video, the brand assets, the grievance officer and incident contacts. The `eas update:republish` / `roll-back-to-embedded` and Vercel rollback steps are not exercised (no production deploy yet).

### 2026-09-30 · Intermittent Jest timeouts (cold transform cache)
- **Gap:** 2 unnamed Jest failures after typecheck + lint on B5c, B5d and B5e. Each time it was the first Jest run in a fresh worktree, so the transform cache was empty: loading and compiling modules landed inside whichever test first used them, against the 5 s test timeout.
- **Reproduced and named:** 10 runs of typecheck + lint + Jest on main: only run 1 (cold) failed, `LiveTripList — fresh trucks` (timeout). `bun run test:cold` (`jest --no-cache`, new) failed 5/5: `Misconfigured` first test 5/5, `LiveTripList — fresh trucks` 5/5, D1 consent failure 3/5. Many more first tests ran 9–20 s and passed only because their work was synchronous (a timer can't fire during it): HistoryList, ReviewPanel, LiveTripSheet, TripSummaryPanel, metroConfig.
- **Changed:** `jest.warmup.js` (`setupFilesAfterEnv`) touches the lazily required React Native components (ScrollView, Pressable, TextInput, Modal, …) so they load before any test's timeout starts. `Misconfigured.test.tsx` loads the root layout in `beforeAll` (the problems it reports at load are set first); `metroConfig.test.ts` loads Metro's config once in `beforeAll`; `sentry.test.ts` does one warm load in `beforeAll`, each with a 60 s limit. No change to `testTimeout`. Jest's cache is not cached in CI: the step takes 17 s cold on the runner, and running cold there is the coverage we want.
- **Verified:** after the fix, 10 normal runs (each after typecheck + lint) 10/10 green, median 7.6 s (9.7 s before); 20 `--no-cache` runs: 18/20 green, slowest test 3.9 s (19.6 s before). The 2 failures were Windows-only and not timeouts of a first test: one `EPERM` renaming a file in Jest's own transform cache, and one run where three suites stalled together for ~16 s and ended at the same instant (a machine-wide stall; the run took 165 s). A second batch of 10 cold runs was 10/10.
- **Left:** the `EPERM` on Jest's cache is a known Windows file-locking race in `write-file-atomic`; it does not occur on the Linux CI runner.

### 2026-09-30 · Validation M4 — no self-registration
- **Gap:** any client could `POST /auth/v1/otp` for an unknown number (supabase-js defaults to `create_user: true`; our app sends `false`) and `handle_new_user` gave the new auth user an **active** driver profile (`rls-attacks.md` U2). `start_trip` did not check `is_active`, so a deactivated driver could still start an assigned trip.
- **Tests first:** `supabase/tests/09_signup_gate.test.sql` (12), `test/config/supabase-auth.test.mjs` (3), `admin-create-driver` Deno (+1, and the happy path now expects `is_active: true`), `errors.test.ts` (+1). Pushed alone; CI red at Unit tests and pgTAP (09 failed 4/12).
- **Changed:** migration **0007** `0007_no_self_registration.sql`: `handle_new_user` inserts `is_active = false`; `start_trip` raises `FORBIDDEN` for an inactive caller (the rest of the 0006 body unchanged; `end_trip` and point uploads stay open so a trip can be finished). `supabase/config.toml` `[auth] enable_signup = false` (`[auth.sms] enable_signup` stays true: it turns the phone provider on). Operator paths activate: `admin-create-driver` writes `is_active: true`; `seed.sql` sets it; the pgTAP helper `tests.create_user` sets it; `provision-user` already wrote it for new users. `errors.ts` maps "Signups not allowed for this instance" to `unregistered`. Docs: DEV_SETUP §3.1/§3.2/§5.1, RUNBOOK §Accounts, release README, docs/06 (`FORBIDDEN`).
- **Migration numbering:** M4 takes **0007**, so the M5 race fix becomes **0008** and re-consent **0009**. Any later migration that redefines `start_trip` (M5) must keep the `is_active` check.
- **Verified:** pgTAP 229/229 after `db reset`. Against the local GoTrue with the new config: `create_user: true` for an unknown number → `422 signup_disabled`, `create_user: false` → `422 otp_disabled` ("Signups not allowed for otp", shown as "This number isn't registered"), no `auth.users` or `profiles` row created; a seeded driver still gets an OTP and a session; `provision-user` against the local stack creates an active driver whose OTP request passes the sign-up gate.
- **Left (human):** turn sign-ups off in the dashboard on staging and production (Authentication → Sign In / Providers). On staging, check for profiles created by self-registration before this change (`select id, phone, created_at from profiles where full_name is null`) and deactivate them. No console button activates a profile yet (`provision-user --activate` does); the deactivated notice says "has been deactivated", which reads oddly for a never-activated account.

### 2026-09-30 · Validation M5 — concurrent start_trip
- **Gap:** two `start_trip` calls for one driver at the same moment both passed the "another trip active?" check; the second then hit `trips_one_active_per_driver` (0001) and returned a raw `23505 duplicate key` instead of `ANOTHER_TRIP_ACTIVE` (validation report, scenario 10), so the app couldn't send the driver to their active trip. Two active trips were never possible, since the index has existed since 0001. Only the error contract was wrong, so no new index and no data check.
- **Tests first:** `test/db/start-trip-race.sh` (ported from r0-stabilise): two psql sessions, A starts trip A and holds its transaction 3 s, B starts trip B meanwhile. The fixture driver is activated (0007) and records consent through `record_consent` (0006), and the script checks both before the race so a refusal can't pass for a race result. It asserts A started, B got `ANOTHER_TRIP_ACTIVE`, B stays `assigned`, exactly one trip in progress. Added to the CI `database` job in the same commit. `supabase/tests/10_start_trip_contract.test.sql` (20) pins every check and the grants: `TRIP_NOT_FOUND` (missing, stranger's), `CONSENT_REQUIRED`, `FORBIDDEN` for inactive (and before ownership), `TRIP_NOT_STARTABLE`, `ANOTHER_TRIP_ACTIVE`, `GPS_ACCURACY_TOO_LOW` (80 m, null), `OUTSIDE_PICKUP:<m>`; `authenticated` can execute, `anon` and `PUBLIC` can't, `SECURITY DEFINER`. Pushed alone: CI red at "Concurrent start_trip" only (pgTAP passed), session B got the raw `23505`.
- **Changed:** migration **0008** `0008_start_trip_concurrency.sql`: `start_trip` takes `pg_advisory_xact_lock` on the caller's id before any check (the second start waits, then sees the first once it commits), and maps any remaining `unique_violation` on the update to `ANOTHER_TRIP_ACTIVE`. Otherwise the 0007 body unchanged (diffed), with the same signature and grants. DEV_SETUP §2.4 (the race script), docs/10 scenario 10.
- **Verified:** locally after `db reset`: pgTAP 249/249, race script PASS 3/3.
- **Next migration:** re-consent takes **0009** and must keep the lock and the `is_active` and consent checks (suite 10 fails otherwise).

### 2026-09-30 · Re-consent and the D1 notice (0009)
- **Gap (B5e's "re-consent gap"):** `CONSENT_VERSION` is compiled into each build but nothing compared it with what a driver had agreed to. `start_trip` only checked that `consent_version` was non-null (0006), so an old build kept its old agreement forever, and D1's notice mentioned neither the retention period nor the published policy.
- **Tests first:** `test/config/consent.test.mjs` (the `app_settings('consent_version')` row equals `CONSENT_VERSION`; 0009 defines `current_consent_version()`, `VERSION_NOT_CURRENT` and the stale `CONSENT_REQUIRED` check), `routing.test.ts` (+6: stale / absent / matching consent, admins not gated, driver-on-web not gated, active trip still resumes first), `splash.test.tsx` (+1 navigation), and pgTAP: suite 10 (23: stale driver → `CONSENT_REQUIRED`, then re-consent → `lives_ok`) and suite 04 (36: `record_consent` stores the current version and refuses another). Fixtures in 01/02/08/09 now set `public.current_consent_version()` instead of a literal, so a future bump cannot break them.
- **Changed:** migration **0009** `0009_reconsent_notice.sql`: `app_settings.value_text` (the numeric `value` stays 0), the `consent_version` row, `public.current_consent_version()`, `record_consent` accepting only the current version (`VERSION_NOT_CURRENT`) and `start_trip` requiring it — the 0008 body is otherwise unchanged (advisory lock, `is_active`, status / another-trip / accuracy / geofence checks, `unique_violation` mapping). Client: `AuthProfile.consentVersion` (from `profiles.consent_version`) plus `RouteInput.requiredConsentVersion`, so the gate sends a driver whose stored version differs from `CONSENT_VERSION` back to D1 — after the active-trip resume, and never for admins; `consent.ts` maps `VERSION_NOT_CURRENT` to an `outdated` result and D1 shows an "update the app" banner; D1's disclosure adds the 12-month retention line and, when `EXPO_PUBLIC_PRIVACY_POLICY_URL` is set, a policy link. Env/docs: `env.example`, DEV_SETUP §4.1/§4.4, release checklist §1/§5, docs/06 (`record_consent`, `CONSENT_REQUIRED`), docs/09 §1, RUNBOOK §Changing the policy version.
- **Release order, written down:** ship the app carrying the new `CONSENT_VERSION` first, then the migration that sets `current_consent_version()`. Reversed, an older installed build loops on D1 (`record_consent` refuses its version, `start_trip` refuses the one it has). See docs/RUNBOOK.md §Changing the policy version.
- **Verified (2026-09-30):** on a clean PostgreSQL 14 with the Supabase roles/schemas and PostGIS, pg_cron and pgTAP, all nine migrations plus `seed.sql` applied with no errors and the suite is **253/253** (`pg_prove` over `supabase/tests/*.test.sql`, the local-stack equivalent of `supabase test db`; baseline 249 + the 4 new assertions). Scenario 10's race re-run with two real sessions: session B gets `ANOTHER_TRIP_ACTIVE`, trip B stays `assigned`, exactly one trip `in_progress`.
- **Not done here:** no migration was pushed and no build or update was published (needs staging and a device).
- **Left (human):** publish the privacy policy (legal review) and set `EXPO_PUBLIC_PRIVACY_POLICY_URL` per environment; turn sign-ups off in both hosted dashboards.

### 2026-09-30 · Validation M5 audit — start_trip refuses a fix with no position (0011)
- **Scope:** the eight M5 invariants — one active trip per driver, the concurrent-start race, `ANOTHER_TRIP_ACTIVE` instead of a raw `23505`, inactive drivers, consent, ownership, the pickup geofence and GPS accuracy, and that a client cannot bypass any of it by calling Supabase directly. Re-audited `start_trip`, the trip RLS policies, both Edge Functions, the eight client write paths and suites 01/02/07/09/10 plus `test/db/start-trip-race.sh`.
- **Held:** seven of the eight. The advisory lock plus the `unique_violation` mapping (0008) still return `ANOTHER_TRIP_ACTIVE` under real concurrency — reproduced with two live sessions; admin trip writes stay RPC-only (0005); no Edge Function touches `trips`; and no client path writes `trips.status`, `tracked_distance_m` or `driver_stats`.
- **Broken:** the pickup geofence. `start_trip` validated the fix with `p_accuracy_m is null or …` and then `if v_d > radius + accuracy`, but nothing required `p_lat` / `p_lng` to exist. With them null, `st_makepoint(NULL,NULL)::geography` is null, `st_distance(NULL, geog)` is null, and `NULL > x` is not true — so the check was skipped and the trip started **from anywhere, with `start_lat`/`start_lng` null**. Reproduced on the local stack: `start_trip(trip, null, null, 10)` → `in_progress`.
- **Second-order:** `verify_trip` computed `v_start_d` the same way and only *compared* it, so a null start position never raised `START_OUTSIDE_PICKUP` — such a trip could auto-verify and credit km with no evidence the driver reached the pickup. The drop side already guarded this (`if t.end_lat is not null …` then `if v_end_d is null or …`); the start side was the asymmetric half.
- **Tests first:** suite 10 gained 3 cases (no latitude, no longitude, and the data-level "no start position written and the trip stays `assigned`"); suite 03 gained a `start_missing` mutation with 2 assertions. Against the schema without 0011 they failed as intended — and informatively: the "no latitude" case *started the trip*, so the four assertions after it failed `TRIP_NOT_STARTABLE` rather than on their own merits.
- **Changed:** migration **0011** `0011_start_trip_position.sql`. `start_trip` refuses a fix with no coordinates using the code it already used for a fix with no accuracy — `GPS_ACCURACY_TOO_LOW`, already in docs/06 §1 and already mapped by `src/tracking/errors.ts`, so the app needed no change. `verify_trip` treats a missing start position as `START_OUTSIDE_PICKUP`. Both functions are otherwise carried forward verbatim: the `verify_trip` body is byte-identical to 0001 apart from the one `v_start_d is null or …` line, and `start_trip` keeps the advisory lock, `is_active`, ownership, consent, status, another-trip, geofence and `unique_violation` mapping from 0010. docs/06 §1 records the widened meaning of `GPS_ACCURACY_TOO_LOW`.
- **Verified:** all 11 migrations applied from a dropped schema with zero errors, then pgTAP **272/272** in 11 files (267 + the 5 new cases); the two-session race re-run against the new function still gives `ANOTHER_TRIP_ACTIVE` with no `23505`, exactly one `in_progress` and trip B left `assigned`; the null-coordinate probe is now refused and the trip stays `assigned`; Jest 569/569 in 47 suites, `test:config` 37/37, `test:scripts` 23/23, `tsc` / ESLint / Prettier clean.
- **Left (human):** none for this fix. Still open from earlier sessions and untouched here — the Mappls credentials (ND-2), client sign-offs (ND-5), and the `0003_phase1_fixes.sql` leftovers `max_gps_jumps`, `end_trip` with a null `p_expected_points`, and `admin_review_trip` on a missing id.

### 2026-09-30 · Security audit — Supabase/Postgres layer (0012)
- **Scope:** every migration 0001→0011, all 10 tables' RLS, every SECURITY DEFINER function, every RPC, the triggers and both Edge Functions, read against the threat model in docs/09 §5 (malicious driver, malicious authenticated client, compromised app, admin-like client, replay, concurrency, direct REST).
- **Held, with evidence.** All 10 tables have RLS on, owned by `postgres`; neither `anon` nor `authenticated` is superuser or BYPASSRLS and owns nothing. `anon` reads 0 rows from every table. A driver cannot promote their own role or activate another profile (0 rows), assign themselves a trip, create a load or vehicle, write `driver_stats`, forge a `trip_events` row, write `trip_live`, or change any trip row including another driver's. Every admin RPC returns `FORBIDDEN` to a driver. `verify_trip` / `apply_verified_stats` / `sweep_unverified_trips` / `downsample_old_points` hold no EXECUTE for either client role. Both Edge Functions gate on `is_admin()` evaluated **as the caller**, and `admin-create-driver` hardcodes `role: "driver"` and `is_active: true`, so the caller cannot mint an admin. Every SECURITY DEFINER function pins `search_path` (`public`, or `public, extensions`). The service-role key is read in one file and is never in a client bundle. Replay of points is bounded: backdated, future-dated and cross-driver inserts are all rejected. Concurrency re-verified with two live sessions.
- **Broken:** Postgres grants EXECUTE to PUBLIC, so the eight helper functions 0001 wrote for its RLS policies also reached `anon` — and that left a side door around the policies they exist to serve. `anon` has no SELECT policy on `app_settings` yet could read every row of it with `public.setting(key)`, and could read the policy version with `current_consent_version()`. "Not readable without a session" was true of the table only. Separately, `authenticated` held EXECUTE on `cron.schedule` — "run this SQL on this database" — reachable only because a *different* privilege (USAGE on the `cron` schema) happened to be absent.
- **Tests first:** new `supabase/tests/12_helper_grants.test.sql` (30). Against 0001→0011 it fails 21 (tests 2–22); with 0012 all 30 pass. It pins both halves: `anon` is refused, **and** a signed-in driver still reads their own trips, loads, stats and settings, which only works if the policy predicates still resolve after the revoke.
- **Changed:** migration **0012** `0012_helper_grants.sql`. The grant is the fix, not the function: revoke from PUBLIC **and** from `anon` (an installation that ran `grant … to anon` carries a separate explicit grant that revoking from PUBLIC leaves behind, because privileges are additive), then re-grant to `authenticated` for exactly the eight helpers the policies evaluate. `current_consent_version()` and both trigger functions are revoked outright — nothing needs them as authenticated. `cron.schedule` / `cron.unschedule` / `cron.alter_job` are revoked across every overload by name, because pg_cron's argument lists differ between versions and a signature missing on the target would fail the whole migration. No behaviour change for the app: it authenticates, so it runs as `authenticated`.
- **Corrected:** docs/09 §5 claimed the `is_mocked` flag was the control against a fake GPS app. The flag is read from the device by the app and sent up, and the audit confirmed a client can set it to `false` on its own trip. The row now says so, names Play Integrity as the only real fix, and keeps what the control *does* achieve (the server does all the maths, and a fabricated track must still survive the gap, coverage, speed, jump and planned-distance rules). docs/DEV_SETUP.md §3 records the suite as 12 files / 302 cases and adds suite 12.
- **Accepted limitations, deliberately not "fixed":** a client supplies the coordinates, timestamps and `is_mocked` of every point, so a determined client can fabricate a track and can under-report `expected_points` to skip `MISSING_POINTS` — a null `expected_points` gains nothing an honest client would not already have, and the other nine rules still apply. Closing either needs device attestation, which is a Phase 2 architecture change (docs/09 §5), not a patch. Also untouched: the three `0003_phase1_fixes.sql` leftovers listed in the previous entry.
- **Verified:** all 12 migrations applied from a dropped schema with zero errors; pgTAP **302/302** in 12 files (272 + the 30 new); the two-session `start_trip` race re-run after the change — session B still gets `ANOTHER_TRIP_ACTIVE`, no raw `23505`, exactly one `in_progress` and trip B `assigned`; Deno 44/44; Jest 569/569 in 47 suites; `test:config` 37/37; `test:scripts` 23/23; `tsc` / ESLint / Prettier clean.
