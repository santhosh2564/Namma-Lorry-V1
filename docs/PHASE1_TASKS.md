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
| ND-4 | Supabase: hosted staging project (recommended — works from this sandbox, which has no Docker) or local only via Docker on the Windows host? If hosted, project URL + anon key go into Keys/Environment. | M4 |
| ND-5 | Client sign-offs: written approval of RN + Mappls; who registers drivers (admin only vs self-signup with approval); "transporter" meaning; multi-drop (assumed no); raw-GPS retention period | M5 (auth), pilot |
| ND-6 | Stationary trucks: 25 m `distanceInterval` produces no points while parked. That triggers `TRACKING_GAP` (>15 min) and `LOW_COVERAGE` (<60/h) on genuine trips, and M10's "no point for > 2 min" banner. Heartbeat while stationary, or judge gaps on moving time only? Docs 03/08 must change first. | M8, M10 |
| ND-7 | If the Mappls spike fails on Expo SDK 57 / RN 0.87, is pinning an older Expo SDK acceptable? | M1 pinning, M3 |

### 2.2 Contradictions and gaps between docs (ND-8…ND-24)
| ID | Conflict | Where | Proposed resolution (needs approval) |
|---|---|---|---|
| ND-8 | **Point-upload poison batch / clock skew.** RLS rejects rows with device time > server now + 2 min or < `started_at` − 1 min. One bad row fails the whole 200-row upsert, and the uploader then retries forever. | 0001 `points_driver_insert` vs TRD §4.3 / doc 13 P9 uploader | New migration: upload through an RPC that filters/clamps invalid rows and reports them, *or* the uploader quarantines rejected rows. Decide before M8. |
| ND-9 | Folder layout differs. CLAUDE.md: `src/features/tracking` + `src/tracking/`, `config.ts` and `db.ts` in `src/lib/`. TRD: `src/tracking/config.ts`, adds `lib/geo.ts`, `lib/sentry.ts`. Doc 13 P9: `db.ts` in `src/tracking/`. Doc 12/13 add `src/theme/`, `plugins/`, `/dev/*` routes. | CLAUDE.md, TRD §3, doc 13 | Adopt the §1.3 layout and update CLAUDE.md/TRD to match in M1. |
| ND-10 | Web audience: CLAUDE.md "Web is a console (admin / owner / shipper)" vs PRD §3 / doc 04 "admin-only; owner/shipper → Coming soon" | CLAUDE.md rule 8 vs PRD | Admin-only in Phase 1 (PRD wins); fix the CLAUDE.md wording. |
| ND-11 | `SENTRY_DSN` is listed as server-only, but the RN/web app needs it in the bundle. `SENTRY_AUTH_TOKEN` (source maps) is not listed. | `.env.example` vs doc 13 P13 | Add `EXPO_PUBLIC_SENTRY_DSN`; add `SENTRY_AUTH_TOKEN` as an EAS secret. |
| ND-12 | Unregistered numbers: the PRD says refuse them, but `handle_new_user` auto-creates a driver profile for **any** OTP sign-in. | PRD P0-1 vs 0001 | `signInWithOtp({ shouldCreateUser: false })` + `admin-create-driver`; depends on ND-5. |
| ND-13 | Admin bypass: hard rule 2 says status changes only via RPCs, but RLS `trips_admin` is `for all`, so an admin client can set `status`/`tracked_distance_m` directly with no audit or stats. No `cancel_trip` RPC exists, so `cancelled` is otherwise unreachable. | CLAUDE.md rule 2 vs 0001 | New migration: admin `select/insert` only on trips + a `cancel_trip` RPC. |
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
- [ ] Update CLAUDE.md / TRD layout per ND-9 (after approval)

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
**Tasks**
- [ ] Research the current `mappls-map-react-native` install (maven repo, iOS config files, key setup); **list the required native files and keys before coding**
- [ ] `plugins/withMappls.ts` local config plugin (the shipped plugin is broken, R1); no hand-edited `android/`/`ios/` unless impossible (explain)
- [ ] `src/components/map/types.ts` (`AppMapProps` exactly as TRD §5), `MapView.native.tsx`, `MapView.web.tsx` (script-loader hook, loads once)
- [ ] `{lat,lng}` ↔ `[lng,lat]` only inside map components
- [ ] `src/lib/geo.ts`: haversine, circle polygon, bearing + unit tests
- [ ] `/dev/map`: pickup circle, drop pin, dashed planned route, actual route, rotated truck marker, "fit to content"

**Files expected:** `plugins/withMappls.ts`, `src/components/map/{types.ts,MapView.native.tsx,MapView.web.tsx,useMapplsScript.ts}`, `src/lib/geo.ts` + tests, `app/dev/map.tsx`.

**Acceptance**
- Dev build on a **real Android phone** shows a Mappls map with the blue dot, circle, polyline and marker (doc 01 W0 exit)
- Web shows the same map (doc 01 W0)
- iOS: same on a device, **or** deferred per ND-3
- No non-Mappls tiles or SDKs in the dependency tree (grep `react-native-maps|leaflet|mapbox|openstreetmap`)

**Human checkpoints:** 🧍 Add Mappls keys/config files; run `eas build --profile development` or `npx expo run:android`; confirm the map on a real phone and on web; report problems in the same session.

---

### M4 — Supabase backend (Prompt 5)
**Tasks**
- [ ] `supabase init` / `start` (Docker, ND-4); apply `0001` **unchanged**. If it fails on this Supabase version, add a follow-up migration and explain. (0002_consent.sql already exists at the root.)
- [ ] *(Pending ND-21)* `0003_phase1_fixes.sql`: ND-8 point-upload handling, ND-12 registration, ND-13 admin trip writes + `cancel_trip`, ND-14 trips realtime, `GPS_JUMPS` threshold into `app_settings`, `admin_review_trip` not-found, `setting()` search_path
- [ ] *(Pending ND-6)* Verification change for stationary gaps, if chosen server-side
- [ ] pgTAP tests in `supabase/tests/` converted from `smoke_phase1.sql` (helpers exist in `_helpers.psql`; **zero cases written yet**):
  - every RLS policy
  - every RPC error code (doc 06)
  - every reason code (doc 08)
  - a late point upload triggers verification
  - the sweeper
  - admin review increments stats exactly once
- [ ] `supabase/seed.sql`: already exists (1 admin, 3 drivers on 919000000001/11/12/13, 3 vehicles, 4 TN/KA loads, 1 assigned trip) — verify against M4 acceptance
- [ ] `src/lib/database.types.ts` (generated) + typed `src/lib/supabase.ts` (secure-store on native, localStorage-safe on web)
- [ ] `docs/DEV_SETUP.md`: test phone numbers/OTP for local and hosted

**Files expected:** `supabase/migrations/0002_consent.sql` (exists), `0003_*` (if approved), `supabase/tests/*.test.sql`, `supabase/seed.sql` (exists), `src/lib/database.types.ts`, `src/lib/supabase.ts`, `docs/DEV_SETUP.md`.

**Acceptance**
- `supabase db reset && supabase test db` passes
- pgTAP proves: a driver cannot update `trips`, insert `driver_stats`, or read other drivers' trips/points; an admin can (doc 10 §1; scenario 9)
- Error codes `TRIP_NOT_FOUND`, `TRIP_NOT_STARTABLE`, `ANOTHER_TRIP_ACTIVE`, `GPS_ACCURACY_TOO_LOW`, `OUTSIDE_PICKUP:<m>`, `TRIP_NOT_ACTIVE`, `FORBIDDEN`, `NOTE_REQUIRED`, `TRIP_NOT_IN_REVIEW` are each covered
- All 10 reason codes in doc 08 §3 are produced by a test case
- Scenarios 8 (sweeper → `MISSING_POINTS`), 10 (`ANOTHER_TRIP_ACTIVE`) and 12 (approve → verified, stats +1 once, event logged) pass at DB level

**Human checkpoints:** none in doc 13. *(Added)* Confirm Docker is running or the staging project is linked; review the migration diff before merge.

---

### M5 — Auth, roles and routing (Prompt 6)
**Tasks**
- [ ] S1 Splash, S2 Sign in, S3 Verify OTP, S4 Access Notice (variants: driver-on-web, owner/shipper coming soon, deactivated)
- [ ] Phone OTP via Supabase; +91 zod validation; 30 s resend timer; error states: unregistered, wrong code, expired, rate-limited (ND-12)
- [ ] Zustand auth store + TanStack Query profile; role gate per doc 04 §2
- [ ] Splash checks local tracking state (stub until M8); sign-out blocked while a trip is active (stub flag)
- [ ] Routing decision as a **pure function** + unit tests for every role × platform × state combination
- [ ] Screens match `design/` S2/S3 via the UI kit

**Files expected:** `app/index.tsx`, `app/(auth)/{_layout,sign-in,verify}.tsx`, `app/access-notice.tsx`, `src/features/auth/{store.ts,useProfile.ts,routing.ts,routing.test.ts,schemas.ts}`.

**Acceptance (PRD P0-1)**
- A registered driver who enters the OTP lands on driver home (D3, or D1 if permissions are missing)
- An admin lands on C1
- Unknown numbers see "Contact Namma Lorry to register"
- Driver on web → S4 "use the mobile app"; owner/shipper → S4 "coming soon"; inactive → S4 deactivated
- Session in secure-store on native
- Routing unit tests pass

**Human checkpoints:** 🧍 Log in as the seeded admin and driver on web and on the phone.

---

### M6 — Console shell, drivers, vehicles, Mappls proxy (Prompt 7)
**Tasks**
- [ ] Console layout (web): sidebar (Live, Loads, Trips, Review + count badge, Drivers, Vehicles), top bar with search + avatar menu, admin-only guard
- [ ] C8 Drivers: table (name, phone, verified trips, verified km, last trip, status) + Add Driver drawer via Edge Function `admin-create-driver` (service role server-side, caller must be admin); ND-19 items excluded unless approved
- [ ] C9 Vehicles: table + Add Vehicle modal (Indian registration validation, vehicle type select: 407 / 14 / 17 / 19 / 20 / 22 / 24 ft / multi-axle; owner per ND-19)
- [ ] Edge Function `mappls-proxy` per doc 06 §4:
  - verify JWT and `is_admin()`
  - actions `autosuggest`, `geocode`, `reverse`, `distance`
  - normalised shapes, per-user rate limit, secrets from `supabase secrets`
  - research the current Mappls REST auth and note it in the function README
- [ ] `src/lib/mappls.ts` typed client
- [ ] Deno tests for both functions with mocked Mappls responses

**Files expected:** `app/(console)/_layout.tsx`, `app/(console)/drivers/index.tsx`, `app/(console)/vehicles/index.tsx`, `supabase/functions/mappls-proxy/{index.ts,README.md,*_test.ts}`, `supabase/functions/admin-create-driver/{index.ts,*_test.ts}`, `src/lib/mappls.ts`, `src/features/{drivers,vehicles}/*`.

**Acceptance**
- A non-admin JWT gets 403 from both functions
- The service role key appears nowhere in the client bundle (grep)
- Admin adds a driver, who can then sign in (ties to P0-1)
- Deno tests pass

**Human checkpoints:** 🧍 Set Mappls REST secrets in Supabase, deploy functions, try autosuggest.

---

### M7 — Loads and assignment (Prompt 8)
**Tasks**
- [ ] C3 Create Load:
  - pickup/drop autosuggest via proxy, draggable pin
  - radius slider 100–2,000 m (default 500) drawn as a circle
  - material, weight, shipper (ND-19), notes
  - on save, fetch planned distance → `planned_distance_m`
  - load code generated by the DB
- [ ] C4 Load Detail & Assign: both geofences + planned route; driver search with verified stats and a busy warning; vehicle select; creates a `trips` row; shows the resulting trip
- [ ] C2 Loads and C5 Trips: server-side pagination, filters, search; status chips; load status derived (ND-20)
- [ ] Shared zod schemas `src/features/loads/schemas.ts`
- [ ] Playwright test: admin creates a load and assigns it

**Files expected:** `app/(console)/loads/{index,new,[id]}.tsx`, `app/(console)/trips/index.tsx`, `src/features/loads/*`, `src/features/trips/*` (console queries), `e2e/create-load.spec.ts`, `playwright.config.ts`.

**Acceptance (PRD P0-2, P0-3)**
- Load ID format `NL-YYYY-NNNNNN`; pickup/drop via autosuggest or pin; radius default 500 m; material and weight optional; planned distance fetched from Mappls
- One driver + one vehicle per trip; one open trip per load (DB index)
- Admin creates a load end-to-end in < 2 min (doc 01 W2)
- Playwright spec passes

**Human checkpoints:** none in doc 13.

---

### M8 — Tracking engine, core without UI (Prompt 9)
**Prerequisite decisions:** ND-6 (stationary heartbeat) and ND-8 (poison batch) must be resolved first.

**Tasks**
- [ ] `config.ts`: `TRACKING_OPTIONS` from TRD §4.2 (adjusted per ND-6)
- [ ] `db.ts` / `queue.ts`: `trip_state {trip_id, state, next_seq, started_at, ended_at, end_lat, end_lng, end_accuracy}` + `point_queue` (TRD §4.3); seq persisted and never reused
- [ ] `task.ts`: `TaskManager.defineTask` at module top level, imported first in `app/_layout.tsx`; maps LocationObject → rows (incl. `mocked`); fast, never throws
- [ ] `uploader.ts`: every 30 s + NetInfo reconnect + app foreground; ≤ 200 rows; upsert `onConflict: 'trip_id,seq', ignoreDuplicates`; mark uploaded; exponential backoff with jitter; single-flight; ND-8 handling
- [ ] `stateMachine.ts`: pure reducer IDLE → TRACKING → ENDING → ENDED / ENDED_PENDING_SYNC; side effects:
  - `startTrip(tripId)`: fresh fix → `start_trip` → persist → `startLocationUpdatesAsync`; never start if the RPC fails
  - `endTrip()`: stop → persist ENDING → flush → `end_trip`; offline → ENDED_PENDING_SYNC
  - `resumeOnLaunch()`
- [ ] `errors.ts`: typed RPC errors (`OUTSIDE_PICKUP:<m>` parsed to metres, etc.)
- [ ] Delete uploaded rows once the trip is final (TRD §4.3)
- [ ] `/dev/tracking`: queue counts, state, last point, simulate points on web
- [ ] Wire the real resume check into S1 Splash (replaces the M5 stub)
- [ ] Unit tests: reducer transitions, seq persistence, idempotent upload, backoff, error parsing, offline end → later sync, resume after kill

**Files expected:** `src/tracking/{config,db,queue,task,uploader,stateMachine,errors,permissions}.ts` + `__tests__/`, `app/dev/tracking.tsx`.

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
| 10 | Two trips started | second `ANOTHER_TRIP_ACTIVE` | pgTAP | ☐ |
| 11 | Console live view | ≤ 60 s behind phone | field + C1 | ☐ |
| 12 | Admin approves flagged trip | `verified`, stats +1 once, event logged | pgTAP + Playwright | ☐ |

🧍 Run the field-test script on the brand matrix in doc 10 §3 (Xiaomi, Vivo/Oppo, Samsung A, Realme, iPhone per ND-3) and paste the results.

#### M12c — Release preparation (Prompt 15)
- [ ] `app.config.ts`: name, bundle id / package, version and build numbers, icons and splash (list missing assets), permission strings, foreground service verified in prebuild output
- [ ] EAS preview (APK/AAB + TestFlight per ND-3) and production profiles; env per profile; EAS Update channels
- [ ] Web console: `npx expo export -p web`, Vercel (or Netlify) config, SPA fallback, security headers
- [ ] Hosted Supabase checklist: link staging/prod, push migrations, secrets, deploy functions, pg_cron job, SMS provider (DLT)
- [ ] `docs/release/`: Play background-location declaration + video shot list, Data safety, Apple App Privacy, App Review notes + demo account, privacy policy (doc 09 §6, marked "requires legal review")
- [ ] `docs/RUNBOOK.md`: deploy, rollback, key rotation, stuck trip, re-run verification, data incident
- [ ] Final ordered list of manual steps for the human

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
| S1 | Splash | mobile + web | `app/index.tsx` *(ND-23)* | M5 (resume logic M8) | — | ☐ |
| S2 | Sign in | mobile + web | `app/(auth)/sign-in.tsx` | M5 | `1._sign_in` | ☐ |
| S3 | Verify OTP | mobile + web | `app/(auth)/verify.tsx` | M5 | `2._verify_otp` | ☐ |
| S4 | Access Notice (3 variants) | mobile + web | `app/access-notice.tsx` *(ND-23)* | M5 | — | ☐ |
| D1 | Location Permission | Android + iOS | `app/(onboarding)/permissions.tsx` | M9 | `3._location_permission` | ☐ |
| D2 | Battery Setup | Android | `app/(onboarding)/battery.tsx` | M9 | `4._battery_setup` | ☐ |
| D3 | My Trips | Android + iOS | `app/(driver)/index.tsx` | M9 | `5._my_trips_home` | ☐ |
| D4 | Trip Detail & Start | Android + iOS | `app/(driver)/trips/[id].tsx` | M9 | `6._trip_detail_start` | ☐ |
| D5 | Active Trip | Android + iOS | `app/(driver)/trips/[id]/live.tsx` | M10 | `7._active_trip` | ☐ |
| D6 | Trip Summary | Android + iOS | `app/(driver)/trips/[id]/summary.tsx` | M10 | `8._trip_summary` (verified only) | ☐ |
| D7 | Trip History | Android + iOS | `app/(driver)/history.tsx` | M11 | `9._trip_history_tab` | ☐ |
| D8 | My Profile | Android + iOS | `app/(driver)/profile.tsx` | M11 | `10._my_profile_tab` | ☐ |
| C1 | Live Dashboard | web | `app/(console)/index.tsx` | M11 | — | ☐ |
| C2 | Loads | web | `app/(console)/loads/index.tsx` | M7 | — | ☐ |
| C3 | Create Load | web | `app/(console)/loads/new.tsx` | M7 | — | ☐ |
| C4 | Load Detail & Assign | web | `app/(console)/loads/[id].tsx` | M7 | — | ☐ |
| C5 | Trips | web | `app/(console)/trips/index.tsx` | M7 | — | ☐ |
| C6 | Trip Detail & Review | web | `app/(console)/trips/[id].tsx` | M11 | — | ☐ |
| C7 | Review Queue | web | `app/(console)/review/index.tsx` | M11 | — | ☐ |
| C8 | Drivers | web | `app/(console)/drivers/index.tsx` | M6 | — | ☐ |
| C9 | Vehicles | web | `app/(console)/vehicles/index.tsx` | M6 | — | ☐ |

| Overlay | Used on | Milestone | Built |
|---|---|---|---|
| End Trip confirmation sheet | D5 | M10 | ☐ |
| "Outside pickup" sheet | D4 | M9 | ☐ |
| Tracking-problem banner (GPS off / permission revoked) | D5 (+ D3/D4 permission loss) | M10 (permission re-check M9) | ☐ |
| Add Driver modal/drawer | C8 | M6 | ☐ |
| Add Vehicle modal | C9 | M6 | ☐ |
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
| P0-5 | Start Trip geofence | M4 (`start_trip`), M8 (error parsing), M9 | pgTAP `OUTSIDE_PICKUP` / `GPS_ACCURACY_TOO_LOW`; unit `errors.test.ts`; scenario 4 |
| P0-6 | Background tracking ~10 s / 25 m, screen off, persistent notification | M8, M9 | 🧍 M9 locked-phone test; field-test matrix (doc 10 §3); PRD metric completeness ≥ 95 % |
| P0-7 | Offline buffer: local first, batched, no duplicates, survives restarts | M8 (ND-8) | Unit: seq persistence, idempotent upload, resume after kill; scenario 2 |
| P0-8 | Live tracking on console without refresh | M11 | Scenario 11 (≤ 60 s, ND-15); 🧍 *(added)* M11 watch-live check |
| P0-9 | End Trip anywhere, warning off-drop, flush, works offline | M8, M10 | Unit offline end → later sync; D5/D6 component tests; scenarios 3 and 5; 🧍 M10 airplane-mode trip |
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
| R18 | pgTAP suite unwritten (helpers only) | Medium | M4 | M4 deliverable |

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
