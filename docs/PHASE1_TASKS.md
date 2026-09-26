# PHASE1_TASKS — Namma Lorry Phase 1 (single source of truth for progress)

**Created:** 26 Sep 2026 (Prompt 1) · **Planned start:** Mon 28 Sep 2026 (doc 01)
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
| Schema | `0001_phase1_schema.sql` is applied **unchanged**; every change goes in a new migration (`0002_consent.sql`, then fixes) | doc 11 hygiene, doc 13 P5 |
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
| Node (local) | 26.8.1 | Non-LTS; switch to 24 LTS if tooling misbehaves (R9) |
| JDK (local) | 17.0.20 | correct for RN Android |
| Android SDK (local) | platforms 30–36.1, NDK 28.2 | `ANDROID_HOME` must be set |

### 1.3 Proposed folder layout (pending ND-1 relocation and ND-9 layout reconciliation)
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

These are the audit questions still unanswered, plus contradictions found between docs. **None has been guessed.** Items marked *blocks* stop the named milestone.

### 2.1 Open audit questions (no answers found in `docs/00-repo-audit.md` as of 26 Sep 2026)
| ID | Question | Blocks |
|---|---|---|
| ND-1 | Relocate the repo to a path without spaces (e.g. `C:\dev\namma-lorry`) and restructure: promote the newest pack to the root, delete the verified duplicates, move `SCREENS/` → `design/` with doc-12 names? Is Desktop OneDrive-synced? | Pre-flight / M1 |
| ND-2 | Mappls account: which credentials exist (map SDK key, REST client id/secret/key)? Is the web SDK enabled and the key domain-restricted? | M3, M6 |
| ND-3 | iOS: Apple Developer account + physical iPhone available? If not, is M3's exit criterion (and W0's) reduced to Android + web, with iOS deferred? | M3, M12c |
| ND-4 | Supabase: local only for now, or an existing hosted staging project to link? (Docker Desktop must be running for local.) | M4 |
| ND-5 | Client sign-offs: written approval of RN + Mappls; who registers drivers (admin only vs self-signup with approval); "transporter" meaning; multi-drop (assumed no); raw-GPS retention period | M5 (auth), pilot |
| ND-6 | Stationary trucks: 25 m `distanceInterval` produces no points while parked. That triggers `TRACKING_GAP` (>15 min) and `LOW_COVERAGE` (<60/h) on genuine trips, and M10's "no point for > 2 min" banner. Heartbeat while stationary, or judge gaps on moving time only? Docs 03/08 must change first. *M8 kept TRD §4.2 exactly (still open).* | M8, M10 |
| ND-7 | If the Mappls spike fails on Expo SDK 57 / RN 0.87, is pinning an older Expo SDK acceptable? | M1 pinning, M3 |

### 2.2 Contradictions and gaps between docs
| ID | Conflict | Where | Proposed resolution (needs approval) |
|---|---|---|---|
| ND-8 | **Point-upload poison batch / clock skew.** RLS rejects rows with device time > server now + 2 min or < `started_at` − 1 min. One bad row fails the whole 200-row upsert, and the uploader then retries forever. | 0001 `points_driver_insert` vs TRD §4.3 / doc 13 P9 uploader | New migration: upload through an RPC that filters/clamps invalid rows and reports them, *or* the uploader quarantines rejected rows. Decide before M8. *M8 implemented the client-side option (needs approval):*<br>• The task drops fixes older than `started_at` − 1 min.<br>• The uploader bisects a refused batch and quarantines only the refused rows (kept locally with the reason; never while signed out).<br>• Quarantined rows never reach the server, so `received < expected_points` and the trip ends up `needs_review` / MISSING_POINTS via the sweeper, which surfaces the problem instead of hiding it.<br>• A phone whose clock runs > 2 min fast loses those points. The server-side RPC option would recover them. |
| ND-9 | Folder layout differs. CLAUDE.md: `src/features/tracking` + `src/tracking/`, `config.ts` and `db.ts` in `src/lib/`. TRD: `src/tracking/config.ts`, adds `lib/geo.ts`, `lib/sentry.ts`. Doc 13 P9: `db.ts` in `src/tracking/`. Doc 12/13 add `src/theme/`, `plugins/`, `/dev/*` routes. | CLAUDE.md, TRD §3, doc 13 | Adopt the §1.3 layout and update CLAUDE.md/TRD to match in M1. |
| ND-10 | Web audience: CLAUDE.md "Web is a console (admin / owner / shipper)" vs PRD §3 / doc 04 "admin-only; owner/shipper → Coming soon" | CLAUDE.md rule 8 vs PRD | Admin-only in Phase 1 (PRD wins); fix the CLAUDE.md wording. |
| ND-11 | `SENTRY_DSN` is listed as server-only, but the RN/web app needs it in the bundle. `SENTRY_AUTH_TOKEN` (source maps) is not listed. | `.env.example` vs doc 13 P13 | Add `EXPO_PUBLIC_SENTRY_DSN`; add `SENTRY_AUTH_TOKEN` as an EAS secret. |
| ND-12 | Unregistered numbers: the PRD says refuse them, but `handle_new_user` auto-creates a driver profile for **any** OTP sign-in. | PRD P0-1 vs 0001 | `signInWithOtp({ shouldCreateUser: false })` + `admin-create-driver`; depends on ND-5. *M5: the client half is done (`shouldCreateUser: false`). M6: `admin-create-driver` is done. What's left: turn off "Allow new users to sign up" on hosted (docs/DEV_SETUP.md §4 step 5). Local config keeps it on because the CLI needs it to enable the phone provider.* |
| ND-13 | Admin bypass: hard rule 2 says status changes only via RPCs, but RLS `trips_admin` is `for all`, so an admin client can set `status`/`tracked_distance_m` directly with no audit or stats. No `cancel_trip` RPC exists, so `cancelled` is otherwise unreachable. | CLAUDE.md rule 2 vs 0001 | New migration: admin `select/insert` only on trips + a `cancel_trip` RPC. |
| ND-14 | D6 needs realtime on the `trips` row, but only `trip_live` is in the `supabase_realtime` publication. | doc 13 P11 vs 0001 | *Implemented in M10:* migration `0004_trips_realtime.sql` adds `trips` (RLS applies to realtime), and D6 also polls every 10 s until the result is final. |
| ND-15 | Live delay target: doc 01 W4 exit says "~30 s"; PRD goal 4 and doc 10 scenario 11 say "≤ 60 s". | doc 01 vs PRD | Use ≤ 60 s as acceptance, ~30 s as the target. |
| ND-16 | Icons: DESIGN.md / doc 13 P3 say Material Symbols **Rounded**; the Stitch exports use **Outlined**. | stitch/DESIGN.md vs SCREENS | Rounded (docs win). |
| ND-17 | Two token palettes. The brief: primary #0F2A44, accent #F5A300, bg #F6F7F9, error #D93025. Stitch `SCREENS/namma_lorry/DESIGN.md`: primary #00152a, secondary #825500 / #feaa11, bg #f8f9ff, error #ba1a1a. | stitch/DESIGN.md vs Stitch export | Brief (`stitch/DESIGN.md`) wins; the Stitch token file is reference only. |
| ND-18 | Stitch mocks contain out-of-scope features and non-compliant copy: FASTag, Fleet SOS, ratings, e-Way Bill, POD/settlement, "Live Trip Navigation", certification claims, and a disclosure saying location "unlocks priority loads and verified payouts". | SCREENS/* vs PRD §3, doc 09 §1 | Ignore these elements; disclosure text comes from doc 09 only. Record the list in `design/README.md`. |
| ND-19 | Doc 12 console prompts reference data the schema lacks: **permission-health dot** on C8 Drivers, **"Send invite SMS"** toggle on Add Driver, **shipper select** on C3 and **owner select** on C9 (no way to create owner/shipper profiles), **CSV export** on C5. | doc 12 §6 vs 0001 / PRD | Suggest: drop the permission dot and the SMS invite for Phase 1; make shipper/owner optional and hidden until an admin can create those roles; CSV export optional (P1). |
| ND-20 | Loads list status (unassigned / assigned / in trip / done) has no column on `loads`. | doc 04/12 C2 vs 0001 | Derive from the latest trip (view or query); no schema change. *Done in M7: `load_list` view (0003), with the latest non-cancelled trip deciding the status.* |
| ND-21 | Where verification-fix migrations land: doc 13 P5 (M4) applies 0001 unchanged plus 0002 consent only. The audit fixes (ND-8, ND-12, ND-13, ND-14, `GPS_JUMPS` into `app_settings`, `admin_review_trip` not-found, `setting()` search_path) have no milestone. | doc 13 vs audit | Add `0003_phase1_fixes.sql` to M4 (listed as optional tasks there). |
| ND-22 | Replay slider (C6) and multi-language files are **P1** in the PRD but are built in M11 / M12a per doc 13. | PRD §6 P1 vs doc 13 | Keep them as doc 13 says (no conflict in intent). Confirm they're not release blockers. |
| ND-23 | S1 Splash and S4 Access Notice have **no route** in the doc 04 route tree. | doc 12 vs doc 04 | `app/index.tsx` (S1) and `app/access-notice.tsx` (S4). |
| ND-25 | **Route URL clash.** Doc 04 puts `app/index.tsx` (S1), `app/(driver)/index.tsx` (D3) and `app/(console)/index.tsx` (C1) all at `/`. Expo Router rejects duplicate routes. | doc 04 §1 vs Expo Router | *Implemented in M5 (needs approval):* `app/driver/…` (`/driver`) and `app/console/…` (`/console`) as real path segments; `(auth)` and `(onboarding)` stay groups; D4 is `app/driver/trips/[id]/index.tsx`. Update doc 04's route tree when the pack is promoted. |
| ND-26 | **Mappls coordinates are premium.** Doc 06 §4 has `autosuggest` → `[{label, address, lat, lng, eLoc?}]` and `geocode` → `{lat, lng, …}`. The current Mappls Autosuggest and Geocoding APIs return only an `eLoc`; coordinates for an eLoc are a premium "Location Coordinates" field (Place Details, OAuth). | doc 06 §4 vs developer.mappls.com (Sep 2026) | *Implemented in M6 (needs approval):* `lat`/`lng` are `number \| null`, passed through whenever Mappls includes them; `eLoc` is always returned. In C3 (M7) the admin confirms the pin on the map (Mappls web SDK can centre on an eLoc), and the stored lat/lng come from the pin. Alternative: buy the Place Details coordinates add-on. Update doc 06 once decided. |
| ND-27 | `mappls-proxy` rate limit is in-memory per isolate (60/min/admin), not global. | doc 06 §4 "rate-limit per user" | Fine for a handful of admins. A table-backed limiter is possible if abuse appears. |
| ND-28 | **Planned route line.** C3/C4 designs show a dashed planned route, but doc 06 §4 only has `distance` (no geometry). | doc 12 C3/C4 vs doc 06 §4 | *Implemented in M7 (needs approval):* new `route` action in `mappls-proxy` (Mappls `route_adv`, trucking profile) returns `{distanceM, durationS, path}`, for display only. `planned_distance_m` still comes from `distance` on save, as doc 06 specifies. It costs one extra Mappls call per C3 preview / C4 view (cached per session). Add to doc 06. |
| ND-30 | **Notifications on D1.** The D1 design keeps Continue disabled "until all are allowed". Tracking works without notification permission (the Android foreground service still runs; iOS uses the location indicator), and a driver who refuses it would be stuck. | doc 12 D1 | *Implemented in M9 (needs approval):* notifications must be **asked** once, but may be refused; D1 then explains what the driver misses and offers Settings. Precise + "all the time" location stay mandatory. |
| ND-31 | **Planned route on D4.** The D4 design shows a dashed road route, but the `route` action (ND-28) is admin-only and loads store no route geometry, so drivers can't get one. | doc 12 D4 vs doc 06 §4 | *Implemented in M9 (needs approval):* a straight dashed pickup → drop line and the planned km. Road geometry for drivers needs either a stored `loads.planned_path` saved from C3, or a driver-scoped `route` action. |
| ND-32 | **"No point for > 2 min" vs a parked truck.** TRACKING_OPTIONS use a 25 m distance filter, so a truck standing still (loading, traffic, rest) records nothing, and a plain 2-minute rule would show the problem banner at every stop. | doc 13 P11 vs TRD §4.1 (ND-6) | *Implemented in M10 (needs approval):* while D5 is open it also watches foreground GPS; if a fresh fix is within 50 m of the last recorded point the row says "Stopped" and no banner shows. Moving with nothing recorded, no fresh fix, or the task not running still raises the banner. |
| ND-33 | **C1 route tails.** The C1 design shows navy route tails behind each truck; M11's prompt asks only for markers. Drawing tails needs recent `trip_points` per live trip on every update. | doc 12 C1 vs doc 13 P12 | *M11:* markers only; the full live route is on C6. Add short tails (e.g. last 30 min) in M12a if ops want them. |
| ND-34 | **C6 live append source.** Only `trip_live` (latest position) and `trips` are in the realtime publication; `trip_points` is not (a full point stream to every console would be heavy). | 0001 / 0004 | *Implemented in M11 (needs approval):* C6 appends each `trip_live` update as a provisional point and reloads all `trip_points` when the trip's status changes. Points uploaded in one batch show up as a single step until that reload. |
| ND-29 | **Date range filter on C2/C5** is presets (All / Today / 7 / 30 days, IST), not a free date picker. C5 filters on the trip's created (assigned) date. CSV export on C5 is not built (ND-19, optional). | doc 12 C2/C5 | Confirm presets are enough for Phase 1. |
| ND-24 | The doc 13 prerequisite "put the pack in the repo root and design PNGs in `design/` named by screen ID" is not done, and there is **no git repo** although doc 13 requires a commit per prompt. | doc 13 vs folder state | Pre-flight tasks, gated on ND-1. |

---

## 3. Milestones

Doc 13 mapping: Prompt 0 = audit (done), Prompt 1 = this plan (done), then **M1…M11 = Prompts 2…12**, and **M12 = Prompts 13–15 (M12a hardening, M12b acceptance tests, M12c release)**.

### Pre-flight (before M1; gated on ND-1, ND-24)
- [ ] Answer ND-1…ND-7 in `docs/00-repo-audit.md`
- [ ] Relocate the repo if approved; `git init`, `.gitignore`, first commit of docs only
- [ ] Promote the newest pack to the root (`CLAUDE.md`, `AGENTS.md`, `.env.example`, `docs/01–13`, `supabase/`, `stitch/`); delete the verified duplicates
- [ ] `SCREENS/` → `design/` renamed by doc 12 ID, plus a `design/README.md` listing ignored elements (ND-18)
- [ ] 🧍 *(added)* Start Docker Desktop; set `ANDROID_HOME`; decide the Node version (R9)

---

### M1 — Scaffold the app (Prompt 2)
**Tasks**
- [x] Expo app (TS strict, Expo Router) at the repo root, latest stable SDK, **exact versions pinned** (ND-7) — *done in M5: Expo SDK 57.0.25 / RN 0.86.3 / React 19.2.3 (the SDK 57 template pins RN 0.86, not 0.87); all versions exact*
- [~] Install *(M5 installed supabase-js, expo-secure-store, TanStack Query, Zustand, zod, react-hook-form; location/task-manager/sqlite/netinfo/device/application/dev-client/i18next still to do)*: supabase-js, expo-secure-store, expo-location, expo-task-manager, expo-sqlite, @react-native-community/netinfo, expo-device, expo-application, expo-dev-client, @tanstack/react-query, zustand, zod, react-hook-form, i18next, react-i18next
- [x] ESLint + Prettier; path alias `@/` → `src/`; Jest (jest-expo) + RNTL; scripts `typecheck`, `lint`, `test` *(M5)*
- [~] `app.config.ts` reading `EXPO_PUBLIC_*`; `.env.example` in sync (incl. ND-11); `src/lib/config.ts` zod-validates env and fails loudly in dev *(M5: app.config.ts, root `.env.example`, config.ts done; ND-11 Sentry vars pending)*
- [ ] `eas.json` with development / preview / production profiles
- [ ] GitHub Actions: install, typecheck, lint, test
- [x] Placeholder route for **every** screen in §4 (renders screen ID + title) *(M5; routes per ND-25)*
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
- [~] *(M5 subset: colours, Noto Sans, type scale, spacing, radii, card shadow; status colours still to add)* `src/theme/tokens.ts`: colours (ND-17: brief palette), Noto Sans via expo-font, type scale, 8 px spacing, radii, shadows, status colours
- [~] *(M5 subset: Button [primary/danger/success/outline/text, driver 64 px, loading/disabled], Card, Banner, Text, Screen, PhoneInput, OtpInput, Logo)* `src/components/ui/`: Button (primary, secondary, danger, success, outline, text; sizes incl. 64 px driver primary; loading/disabled), Card, Chip/StatusChip (6 statuses: text + colour + icon), TextField, PhoneInput (+91), OtpInput (6), ListRow, Banner (info/warn/error/offline), BottomSheet, ConfirmSheet, EmptyState, StatBlock, Screen, SectionHeader
- [x] Console primitives (web): Sidebar, TopBar, DataTable (sortable, sticky header, pagination), Drawer, Modal *(M6; plus TextField, ChoiceChips, Chip in `src/components/ui/`. DataTable pages client-side; M7 needs server-side paging for C2/C5)*
- [ ] Icons: Material Symbols Rounded (ND-16) or the closest maintained RN package
- [ ] `/dev/kitchen-sink` route (dev only)
- [ ] Unit tests: StatusChip mapping (doc 06 §5 labels), Button states

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
- [~] `src/components/map/types.ts` (`AppMapProps` exactly as TRD §5), `MapView.native.tsx`, `MapView.web.tsx` (script-loader hook, loads once).
  - *Done in M7 (web):* `types.ts` (TRD props plus `draggable` / `onMarkerDragEnd`), `MapView.web.tsx` on the Mappls Web SDK v3, `useMapplsScript.ts`, and a `MapFallback` shown when there's no key or the SDK fails to load.
  - `MapView.tsx` is a native placeholder until `MapView.native.tsx`.
  - **The web map has not been rendered yet:** there's no key and this sandbox can't reach Mappls.
- [x] `{lat,lng}` ↔ `[lng,lat]` only inside map components *(web: `fitBounds` in `MapView.web.tsx`; `geo.bounds()` returns [lng, lat])*
- [x] `src/lib/geo.ts`: haversine, circle polygon, bearing + unit tests *(M7; plus destination, bounds, isLatLng)*
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
- [x] `supabase init` / `start` (Docker, ND-4); apply `0001` **unchanged**. If it fails on this Supabase version, add a follow-up migration and explain. *(Verified in M5: 0001 + 0002 + seed apply cleanly on CLI 2.118.0 / Postgres 17.6.1.011; no fix migration needed.)*
- [x] `0002_consent.sql`: `profiles.consent_version`, `profiles.consent_at`, SECURITY DEFINER `record_consent(p_version text)` for the current user only
- [ ] *(Pending ND-21)* `0003_phase1_fixes.sql`: ND-8 point-upload handling, ND-12 registration, ND-13 admin trip writes + `cancel_trip`, ND-14 trips realtime *(done in M10 as `0004_trips_realtime.sql`)*, `GPS_JUMPS` threshold into `app_settings`, `admin_review_trip` not-found, `setting()` search_path
- [ ] *(Pending ND-6)* Verification change for stationary gaps, if chosen server-side
- [ ] pgTAP tests in `supabase/tests/` converted from `smoke_phase1.sql`:
  - every RLS policy
  - every RPC error code (doc 06)
  - every reason code (doc 08)
  - a late point upload triggers verification
  - the sweeper
  - admin review increments stats exactly once
- [x] `supabase/seed.sql`: 1 admin, 3 drivers (test phone numbers), 3 vehicles, 4 loads on real TN/KA coordinates, 1 assigned trip (sample data from DESIGN.md)
- [x] `src/lib/database.types.ts` (generated) + typed `src/lib/supabase.ts` (secure-store on native, localStorage-safe on web) *(M5: SecureStore values are chunked because sessions exceed its ~2 KB limit)*
- [x] `docs/DEV_SETUP.md`: test phone numbers/OTP for local and hosted *(M5)*

**Files expected:** `supabase/config.toml`, `supabase/migrations/0002_consent.sql` (+ `0003_*` if approved), `supabase/tests/*.test.sql`, `supabase/seed.sql`, `src/lib/database.types.ts`, `src/lib/supabase.ts`, `docs/DEV_SETUP.md`.

**Acceptance**
- `supabase db reset && supabase test db` passes
- pgTAP proves: a driver cannot update `trips`, insert `driver_stats`, or read other drivers' trips/points; an admin can (doc 10 §1; scenario 9)
- Error codes `TRIP_NOT_FOUND`, `TRIP_NOT_STARTABLE`, `ANOTHER_TRIP_ACTIVE`, `GPS_ACCURACY_TOO_LOW`, `OUTSIDE_PICKUP:<m>`, `TRIP_NOT_ACTIVE`, `FORBIDDEN`, `NOTE_REQUIRED`, `TRIP_NOT_IN_REVIEW` are each covered
- All 10 reason codes in doc 08 §3 are produced by a test case
- Scenarios 8 (sweeper → `MISSING_POINTS`), 10 (`ANOTHER_TRIP_ACTIVE`) and 12 (approve → verified, stats +1 once, event logged) pass at DB level

**Human checkpoints:** none in doc 13. *(Added)* Confirm Docker is running and review the migration diff before merge.

---

### M5 — Auth, roles and routing (Prompt 6)
**Tasks**
- [x] S1 Splash, S2 Sign in, S3 Verify OTP, S4 Access Notice (variants: driver-on-web, owner/shipper coming soon, deactivated, plus `no-profile` for a signed-in user with no profile row)
- [x] Phone OTP via Supabase; +91 zod validation; 30 s resend timer; error states: unregistered, wrong code, expired, rate-limited (ND-12: `shouldCreateUser: false`). GoTrue returns the same `otp_expired` error for wrong and expired codes, so the app uses time since sending vs `OTP_EXPIRY_SECONDS` (60 s).
- [x] Zustand auth store + TanStack Query profile; role gate per doc 04 §2, enforced by `AreaGuard` on every route group (a driver on web can't open `/console` by URL)
- [x] Splash checks local tracking state (stub `src/tracking/localState.ts` until M8); sign-out blocked while a trip is active (same stub). Permission check is also a stub (`src/tracking/permissions.ts`, always "missing") until M9.
- [x] Routing decision as a **pure function** + unit tests for every role × platform × state combination (`src/features/auth/routing.test.ts`)
- [x] Screens match `SCREENS/` S2/S3 via the UI kit (no `design/` folder yet, ND-24). ND-18 elements left out: "Driver cabin gateway" / "Secure cabin login" badges, "Protected by Namma Fleet Safety Network", on-screen keypad (the system numeric keyboard is used), dispatch-desk phone number, AIS-140 / Fast-Track footer, "attempts left" (GoTrue doesn't report it).

**Files expected:** `app/index.tsx`, `app/(auth)/{_layout,sign-in,verify}.tsx`, `app/access-notice.tsx`, `src/features/auth/{store.ts,useProfile.ts,routing.ts,routing.test.ts,schemas.ts}`. *Also added:* `errors.ts`, `AreaGuard.tsx`, `SignOutButton.tsx`, `signOut.ts`, `useRoutingDecision.ts`, `useCountdown.ts` (+ tests), `src/tracking/{localState,permissions}.ts` stubs, `src/i18n/en.ts`.

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
- [x] Console layout (web): sidebar (Live, Loads, Trips, Review + count badge, Drivers, Vehicles), top bar with search + avatar menu, admin-only guard.
  - The sidebar collapses to an icon rail below 1024 px.
  - The review badge counts `needs_review` trips (refreshed every 60 s).
  - Global search routes by pattern: a Load ID goes to Loads, a registration plate to Vehicles, anything else to Drivers (with `?q=`).
  - The guard is the M5 `AreaGuard`.
- [x] C8 Drivers: table (name, phone, verified trips, verified km, last trip, status) + Add Driver drawer via Edge Function `admin-create-driver` (service role server-side, caller must be admin).
  - Status is derived: On trip / Available / Inactive.
  - Verified trips and km come from `driver_stats` only.
  - ND-19 items are left out: no permission-health dot, no "Send invite SMS" toggle.
- [x] C9 Vehicles: table + Add Vehicle modal.
  - Indian registration validation, including BH series; the value is normalised to "TN 23 BK 4521".
  - Vehicle type chips: 407 / 14 / 17 / 19 / 20 / 22 / 24 ft / multi-axle.
  - Owner shown read-only, with no owner select (ND-19).
  - A duplicate plate gives a field error.
- [x] Edge Function `mappls-proxy` per doc 06 §4:
  - verify JWT and `is_admin()`
  - actions `autosuggest`, `geocode`, `reverse`, `distance`
  - normalised shapes, per-user rate limit, secrets from `supabase secrets`
  - research the current Mappls REST auth and note it in the function README
  - Findings: a static REST key sent as the `access_token` query parameter; OAuth is now legacy. `distance` uses the `trucking` profile. Autosuggest and geocode coordinates are a premium field (ND-26).
- [x] `src/lib/mappls.ts` typed client, built on `src/lib/functions.ts` (`FunctionError` carries the proxy's error code)
- [x] Deno tests for both functions with mocked Mappls responses (`npm run test:functions`, 24 tests)

**Files expected:** `app/(console)/_layout.tsx`, `app/(console)/drivers/index.tsx`, `app/(console)/vehicles/index.tsx`, `supabase/functions/mappls-proxy/{index.ts,README.md,*_test.ts}`, `supabase/functions/admin-create-driver/{index.ts,*_test.ts}`, `src/lib/mappls.ts`, `src/features/{drivers,vehicles}/*`. *Built at `app/console/…` (ND-25). Each function is a testable `handler.ts` + a thin `index.ts`; shared code is in `supabase/functions/_shared/`.*

**Acceptance**
- A non-admin JWT gets 403 from both functions
- The service role key appears nowhere in the client bundle (grep)
- Admin adds a driver, who can then sign in (ties to P0-1)
- Deno tests pass

**Human checkpoints:** 🧍 Set Mappls REST secrets in Supabase, deploy functions, try autosuggest.

---

### M7 — Loads and assignment (Prompt 8)
**Tasks**
- [x] C3 Create Load:
  - pickup/drop autosuggest via proxy (debounced, ≥ 3 chars), draggable pin
  - the pin can also be set by tapping the map or typing coordinates, needed when Mappls returns no coordinates (ND-26)
  - radius slider 100–2,000 m (default 500, 50 m steps; drag, ± buttons or keyboard) drawn as a circle
  - material, weight in tonnes (stored as kg), shipper (ND-19), notes
    - Shipper is an optional choice among active shipper profiles; none exist yet, so it shows "No shipper accounts yet".
  - on save, fetch planned distance → `planned_distance_m`
    - If the proxy fails, the admin can "Save without planned distance".
    - A route preview (`route` action, ND-28) shows the planned line and "Planned distance … · ~… h" before saving.
  - load code generated by the DB
- [x] C4 Load Detail & Assign: both geofences + planned route; driver search with verified stats and a busy warning; vehicle select; creates a `trips` row; shows the resulting trip.
  - The busy warning ("on another trip") doesn't block assigning.
  - The unique-index violation (one open trip per load) shows "This load already has an open trip".
  - The trip card shows status, driver, vehicle and start/end times, plus the load's trip history.
- [x] C2 Loads and C5 Trips: server-side pagination, filters, search; status chips; load status derived (ND-20)
  - C2 runs on the new `load_list` view (migration 0003, `security_invoker`, pgTAP tested): status tabs, date range, search on Load ID / pickup / drop, and server-side sort on Load ID, planned km and created date.
  - C5 filters on status (multi-select), driver, vehicle, date range and Load ID search.
  - All filters live in the URL, and rows open C4.
  - Status labels follow docs/06 §5.
- [x] Shared zod schemas `src/features/loads/schemas.ts`
- [x] Playwright test: admin creates a load and assigns it (`e2e/create-load.spec.ts`, `npm run e2e`; `mappls-proxy` mocked)

**Files expected:** `app/(console)/loads/{index,new,[id]}.tsx`, `app/(console)/trips/index.tsx`, `src/features/loads/*`, `src/features/trips/*` (console queries), `e2e/create-load.spec.ts`, `playwright.config.ts`. *Built at `app/console/…` (ND-25). Trip list queries live in `src/features/loads/api.ts`. Also added: `supabase/migrations/0003_load_list_view.sql`, `supabase/tests/load_list.test.sql`, `src/components/map/*`, `src/components/console/{SearchSelect,SearchInput}.tsx`, `src/components/ui/{Slider,MultiChips}.tsx`.*

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
- [x] `config.ts`: `TRACKING_OPTIONS` from TRD §4.2 (adjusted per ND-6). *Exactly as the TRD. ND-6 is still open, so there's no stationary heartbeat.*
- [x] `db.ts` / `queue.ts`: `trip_state {trip_id, state, next_seq, started_at, ended_at, end_lat, end_lng, end_accuracy}` + `point_queue` (TRD §4.3); seq persisted and never reused.
  - Seq allocation and the row inserts commit in one exclusive transaction behind an in-process lock, so seq is never reused and never skipped.
  - On open, `migrate()` also repairs `next_seq` if it ever falls at or below a queued seq.
  - Extra columns: `trip_state.last_seq / server_status / last_error / updated_at`, and `point_queue.reject_reason` (ND-8).
- [x] `task.ts`: `TaskManager.defineTask` at module top level, imported first in `app/_layout.tsx`; maps LocationObject → rows (incl. `mocked`); fast, never throws.
  - `taskHandler.ts` / `mapping.ts`: iOS −1 sentinels become null.
  - Dropped: exact duplicate fixes, and fixes more than 1 min before the server's `started_at` (RLS would refuse them).
  - Out-of-order timestamps are kept.
- [x] `uploader.ts`: every 30 s + NetInfo reconnect + app foreground; ≤ 200 rows; upsert `onConflict: 'trip_id,seq', ignoreDuplicates`; mark uploaded; exponential backoff with jitter; single-flight; ND-8 handling.
  - Scheduling lives in `runtime.ts`.
  - Backoff: 5 s doubling to a 5 min cap, equal jitter.
  - ND-8: a batch refused permanently (42501/23514/…) is bisected and the refused rows are set aside with the reason (`uploaded = 2`, kept). Only while a session exists, so a signed-out upload can't quarantine good points.
- [x] `stateMachine.ts`: pure reducer IDLE → TRACKING → ENDING → ENDED / ENDED_PENDING_SYNC; side effects:
  - `startTrip(tripId)`: fresh fix → `start_trip` → persist → `startLocationUpdatesAsync`; never start if the RPC fails
    - Checks permissions and GPS first, with a 20 s fix timeout.
    - The start fix is queued as seq 1.
    - Recovers a lost `start_trip` response (TRIP_NOT_STARTABLE while the server shows `in_progress`).
  - `endTrip()`: stop → persist ENDING → flush → `end_trip`; offline → ENDED_PENDING_SYNC
    - ENDING stores `ended_at` (tap time), the end position and `last_seq`.
    - TRIP_NOT_ACTIVE counts as success. TRIP_NOT_FOUND/unknown → ENDED with `last_error`, no endless retry.
  - `resumeOnLaunch()`
    - Restarts updates for TRACKING (if background permission is still granted), retries a pending end, and cleans up finished trips.
    - Stops tracking only if the server *definitely* shows the trip no longer `in_progress`. Offline or signed out never stops it.
  - `syncPendingEnd()`, `cleanupFinished()`
  - All engine operations are serialised.
- [x] `errors.ts`: typed RPC errors (`OUTSIDE_PICKUP:<m>` parsed to metres, etc.)
  - `TripError` covers all docs/06 codes plus client codes (NETWORK, PERMISSION_REQUIRED, GPS_TIMEOUT, …).
  - Also: `isPermanentRowError`, and driver-facing text.
- [x] Delete uploaded rows once the trip is final (TRD §4.3). *`cleanupFinished`: nothing pending and the server status is verified / needs_review / rejected / cancelled.*
- [x] `/dev/tracking`: queue counts, state, last point, simulate points on web
  - Web uses a simulated location source and expo-sqlite web (wasm; `metro.config.js` sets COOP/COEP for the dev server).
  - `__DEV__` only.
- [x] Wire the real resume check into S1 Splash (replaces the M5 stub)
  - `localState.ts` reads SQLite; Splash resumes a TRACKING trip.
  - The root layout starts the sync loop on native.
  - Sign-out is now also blocked while trip data is unsynced.
- [x] Unit tests: reducer transitions, seq persistence, idempotent upload, backoff, error parsing, offline end → later sync, resume after kill
  - 84 tests in `src/tracking/**`.
  - The queue and engine tests run the real SQL on node:sqlite files; "kill" = close and reopen the file, including a crash mid-transaction.
  - A fake backend mirrors the `start_trip`/`end_trip` rules and the `trip_points` RLS window.

**Files expected:** `src/tracking/{config,db,queue,task,uploader,stateMachine,errors,permissions}.ts` + `__tests__/`, `app/dev/tracking.tsx`. *Also: `mapping.ts`, `taskHandler.ts`, `runtime.ts`, `localState.ts`, `simulatedLocation.ts`, `testing/{nodeSqlite,fakes}.ts`, `metro.config.js`; `app.config.ts` gains the expo-location plugin (doc 09 §3 permission strings, background + foreground service) and expo-sqlite.*

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
- [x] D1 Location Permission:
  - prominent disclosure from doc 09 §1–§3 **before** any system dialog (ND-18: not the Stitch copy). Nothing is requested until the driver taps a row's Allow.
  - request foreground → background → notifications, strictly in order (`permissionModel.ts`); notifications are optional (ND-30)
  - status rows ("n of 3 ready"); "Open settings" when blocked or when iOS approximate location needs Settings; GPS-off banner
  - `record_consent('2026-09-v1')` on Continue. Routing also requires the current consent version, so a driver who has the permissions but not the consent still sees D1.
  - re-check on every foreground (`usePermissionRecheck` invalidates the permission and local-trip queries); `DriverGate` routes back to D1 if location is lost. An active trip keeps D5; its banner is M10.
- [x] D2 Battery Setup (Android only): `expo-device` manufacturer + brand detection; instructions for Xiaomi/Redmi/POCO, Vivo/iQOO, Oppo/Realme/OnePlus, Samsung, generic. "Open settings" opens Namma Lorry's App info (`Linking.openSettings`), falling back to the battery-optimisation list (`IntentLauncher`). Done/skipped is remembered per phone (SecureStore).
- [x] `app.config.ts`: expo-location plugin (background + foreground service); iOS `infoPlist` with the doc 09 §3 strings and `UIBackgroundModes: ['location']`; `expo-notifications` plugin (POST_NOTIFICATIONS). expo-task-manager also adds `fetch` to UIBackgroundModes by default.
- [x] D3 My Trips (bottom tabs Trips · History · Profile): live trip pinned with Resume (the local trip wins, so it shows offline), assigned list, empty, offline and error states, pull to refresh
- [x] D4 Trip Detail & Start:
  - map with pickup circle, drop, planned route (straight dashed line, ND-31), live dot (`me` marker), distance to pickup from a foreground-only `watchPositionAsync`
  - states (`startState.ts`, mirrors `start_trip`: accuracy ≤ 50 m, distance ≤ radius + accuracy): waiting for GPS (no fix or older than 30 s), accuracy > 50 m, outside radius (distance, disabled), ready, starting; plus permission missing, in progress (Resume), not startable
  - START → `tracking.startTrip` → D5 (also on `TRACKING_START_FAILED`, since the trip has started)
  - "Outside pickup" sheet when the server refuses the start fix

**Files expected:** `app/(onboarding)/{_layout,permissions,battery}.tsx`, `app/(driver)/{_layout,index}.tsx`, `app/(driver)/trips/[id].tsx`, `src/features/trips/*`, `src/tracking/permissions.ts`, `app.config.ts` updates, RNTL tests for D4 button states (doc 10 §1). *Built at `app/driver/_layout.tsx`, `app/driver/(tabs)/{_layout,index}.tsx` and `app/driver/trips/[id]/index.tsx` (ND-25). Also: `src/features/onboarding/*` (permission model, battery guide, consent, DriverGate), `src/tracking/foregroundLocation.ts`, `src/lib/devDriverWeb.ts`, RNTL tests in `src/screens-tests/` (outside `app/` so Expo Router doesn't treat them as routes).*

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
- [x] D5 Active Trip (`app/driver/trips/[id]/live.tsx`, rules in `src/features/trips/liveModel.ts`):
  - follows the truck (new `follow` map prop); route drawn from the **local queue** (`queue.routePoints`, polled every 5 s), never the server
  - elapsed time, approx km (client haversine over points ≤ 50 m accuracy, labelled "approx."), km to drop (straight line, "approx.")
  - sync status (synced / N waiting / offline with N saved), GPS status (good / weak / waiting / stopped)
  - tracking-problem banner with a Fix action: no point for > 2 min, permission revoked (→ D1), GPS off (→ location settings), location task not running (→ restart). A parked truck records nothing (25 m distance filter, ND-6), so "no point" is not flagged while a fresh foreground fix is within 50 m of the last point (ND-32).
  - near drop (inside drop radius + accuracy, the verify_trip rule) → banner + solid red END; otherwise an outlined END
  - Android back → My Trips; tracking keeps running (only End stops it)
- [x] End Trip confirmation sheet: "End this trip?"; outside the drop radius it warns with the distance but never blocks; `tracking.endTrip()` → D6 (online or `ENDED_PENDING_SYNC`)
- [x] D6 Trip Summary (`app/driver/trips/[id]/summary.tsx`, `summaryModel.ts`):
  - realtime on the trip row: migration `0004_trips_realtime.sql` adds `trips` to `supabase_realtime` (ND-14; RLS limits a driver to their own rows), plus 10 s polling while the result can change
  - Verifying → Verified (km, time, totals from `driver_stats`) / Needs review (reasons) / Rejected (reasons + admin note) / Cancelled; offline-ended variant with points still on the phone and "Try uploading now"
  - a text per docs/08 §3 reason code (`t.reasons.*`), with details from `verification_metrics` (e.g. "(1.8 km away)", "(25 min)"); unknown codes fall back to a generic line
- [x] Optional keep-awake ("Keep screen on" switch on D5, expo-keep-awake), off by default, remembered per phone
- [x] Component tests: D5 sync/GPS/problem/near-drop states, End flow and Android back (15); D6 variants and realtime update (11)

**Files expected:** `app/(driver)/trips/[id]/live.tsx`, `app/(driver)/trips/[id]/summary.tsx`, `src/features/trips/{EndTripSheet,SyncStatus,GpsStatus,ReasonList}.tsx`, `src/i18n/en.json` reason keys, tests. *Built at `app/driver/trips/[id]/{live,summary}.tsx` (ND-25) with the sheet and status rows inside the screens; rules in `src/features/trips/{liveModel,summaryModel}.ts`; local reads in `src/tracking/liveTrip.ts`; reason texts in `src/i18n/en.ts` (`en.json` is M12a); tests in `src/screens-tests/{activeTrip,tripSummary}.test.tsx`.*

**Acceptance (PRD P0-9, P0-12 partial)**
- The driver can always end; a warning shows if not near the drop
- The app flushes the queue and calls `end_trip`; offline end syncs later (scenario 3)
- Ending 2 km before the drop → `needs_review` with `END_OUTSIDE_DROP` (scenario 5)
- Component tests pass

**Human checkpoints:** 🧍 Real trip: start, 20 min airplane mode mid-trip, end offline, reconnect → must verify with **zero missing points** (scenarios 2 + 3).

---

### M11 — Live console, review, history, profile (Prompt 12)
**Tasks**
- [x] C1 Live Dashboard (`app/console/index.tsx`): every `in_progress` trip with its `trip_live` position on the Mappls web map; truck markers rotated by heading, a red ring when stale; side list with search and last-update age (red "No recent data" > 15 min, stale first); KPI strip (live · stale · assigned today (IST) · need review → C7); realtime on `trip_live` + `trips` via `useRealtimeChanges` (resubscribe with backoff on channel errors and on reconnect, refetch on every (re)subscribe); `trip_live` updates are merged into the cache without a refetch; the map only re-fits when the set of trips changes (new `fitKey` map prop). No route tails yet (ND-33).
- [x] C6 Trip Detail & Review (`app/console/trips/[id].tsx`):
  - route from `trip_points`, 1,000 per page until a short page (`fetchAllPoints`), plus live append from realtime `trip_live` (ND-34); planned route dashed (Mappls `route` action, straight line fallback); pickup/drop geofences; start/end markers (new `start`/`end` kinds)
  - replay slider with play/pause (~300 steps over the whole trip, P1-1)
  - verification outcome, reason chips (code + docs/08 text), metrics grid; `trip_events` timeline in IST
  - review card only when `needs_review`: mandatory note (checked before any call), Approve & verify / Reject → `admin_review_trip`; no optimistic UI — trip, events, queue, badge and driver list are refetched after every decision, and errors (e.g. `TRIP_NOT_IN_REVIEW`) are shown
  - C5 Trips rows now open C6
- [x] C7 Review Queue (`app/console/review/index.tsx`): `needs_review` oldest first (by `ended_at`), plain-language reason chips, mini map (pickup, drop, end, planned line), "Open & review" → C6, empty state "All caught up"
- [x] D7 Trip History (`app/driver/(tabs)/history.tsx`): filters All / Verified / Under review / Not verified with counts, summary strip, grouped by IST month, km only for verified trips, rows → D6, pull to refresh, empty states
- [x] D8 My Profile (`app/driver/(tabs)/profile.tsx`): header (initials, name, phone, driver since), read-only `driver_stats` (trips, verified km, last trip) with "Calculated by Namma Lorry from GPS — can't be edited"; language picker sheet (English only until M12a, others "Coming in the next update"; drivers can't write `preferred_language`, so nothing is saved yet); location & battery health check → D1 or D2; privacy policy link (when configured); sign out blocked during an active trip or while data is unsynced

**Files expected:** `app/(console)/index.tsx`, `app/(console)/trips/[id].tsx`, `app/(console)/review/index.tsx`, `app/(driver)/{history,profile}.tsx`, `src/features/{live-map,review}/*`, `src/features/trips/ReplaySlider.tsx`, `LanguageSheet.tsx`. *Built at `app/console/…` and `app/driver/(tabs)/…` (ND-25); console queries and models in `src/features/review/{api,liveBoard,tripDetail}.ts`; realtime in `src/lib/useRealtimeChanges.ts`; D7/D8 models in `src/features/trips/history.ts` and `src/features/onboarding/health.ts`; the replay slider and language sheet live inside their screens.*

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

Design ref = current Stitch export folder in `SCREENS/` (to be renamed into `design/` in pre-flight). "—" = not designed yet. Since M5 the driver and console routes live under `app/driver/` and `app/console/` rather than the `(driver)`/`(console)` groups below (ND-25); D4 is `app/driver/trips/[id]/index.tsx`. All 21 routes exist as placeholders.

| ID | Screen | Platform | Route | Milestone | Design ref | Built |
|---|---|---|---|---|---|---|
| S1 | Splash | mobile + web | `app/index.tsx` *(ND-23)* | M5 (resume logic M8) | — | ☑ |
| S2 | Sign in | mobile + web | `app/(auth)/sign-in.tsx` | M5 | `1._sign_in` | ☑ |
| S3 | Verify OTP | mobile + web | `app/(auth)/verify.tsx` | M5 | `2._verify_otp` | ☑ |
| S4 | Access Notice (3 variants) | mobile + web | `app/access-notice.tsx` *(ND-23)* | M5 | — | ☑ |
| D1 | Location Permission | Android + iOS | `app/(onboarding)/permissions.tsx` | M9 | `3._location_permission` | ☑ |
| D2 | Battery Setup | Android | `app/(onboarding)/battery.tsx` | M9 | `4._battery_setup` | ☑ |
| D3 | My Trips | Android + iOS | `app/(driver)/index.tsx` → `app/driver/(tabs)/index.tsx` | M9 | `5._my_trips_home` | ☑ |
| D4 | Trip Detail & Start | Android + iOS | `app/(driver)/trips/[id].tsx` → `app/driver/trips/[id]/index.tsx` | M9 | `6._trip_detail_start` | ☑ |
| D5 | Active Trip | Android + iOS | `app/(driver)/trips/[id]/live.tsx` → `app/driver/trips/[id]/live.tsx` | M10 | `7._active_trip` | ☑ |
| D6 | Trip Summary | Android + iOS | `app/(driver)/trips/[id]/summary.tsx` → `app/driver/trips/[id]/summary.tsx` | M10 | `8._trip_summary` (verified only) | ☑ |
| D7 | Trip History | Android + iOS | `app/(driver)/history.tsx` → `app/driver/(tabs)/history.tsx` | M11 | `9._trip_history_tab` | ☑ |
| D8 | My Profile | Android + iOS | `app/(driver)/profile.tsx` → `app/driver/(tabs)/profile.tsx` | M11 | `10._my_profile_tab` | ☑ |
| C1 | Live Dashboard | web | `app/(console)/index.tsx` → `app/console/index.tsx` | M11 | — | ☑ |
| C2 | Loads | web | `app/(console)/loads/index.tsx` | M7 | — | ☑ |
| C3 | Create Load | web | `app/(console)/loads/new.tsx` | M7 | — | ☑ |
| C4 | Load Detail & Assign | web | `app/(console)/loads/[id].tsx` | M7 | — | ☑ |
| C5 | Trips | web | `app/(console)/trips/index.tsx` | M7 | — | ☑ |
| C6 | Trip Detail & Review | web | `app/(console)/trips/[id].tsx` → `app/console/trips/[id].tsx` | M11 | — | ☑ |
| C7 | Review Queue | web | `app/(console)/review/index.tsx` → `app/console/review/index.tsx` | M11 | — | ☑ |
| C8 | Drivers | web | `app/(console)/drivers/index.tsx` | M6 | — | ☑ |
| C9 | Vehicles | web | `app/(console)/vehicles/index.tsx` | M6 | — | ☑ |

| Overlay | Used on | Milestone | Built |
|---|---|---|---|
| End Trip confirmation sheet | D5 | M10 | ☑ |
| "Outside pickup" sheet | D4 | M9 | ☑ |
| Tracking-problem banner (GPS off / permission revoked) | D5 (+ D3/D4 permission loss) | M10 (permission re-check M9) | ☑ |
| Add Driver modal/drawer | C8 | M6 | ☑ |
| Add Vehicle modal | C9 | M6 | ☑ |
| Language picker sheet | D8 (and the S2 "Change language" link) | M11 (S2 link M5) | ☑ (English only until M12a) |

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
| P0-11 | Admin review with note, audited | M4 (RPC), M11 (C6/C7) | pgTAP `FORBIDDEN` / `NOTE_REQUIRED` / `TRIP_NOT_IN_REVIEW`; scenario 12; Playwright review-approve (doc 10 §1) |
| P0-12 | Driver history and stats from the server only | M10 (D6), M11 (D7, D8) | pgTAP stats incremented exactly once; D6 component tests; D8 renders read-only `driver_stats` |
| P0-13 | No editable experience (UI or API) | M4 (RLS, ND-13), M12a (security review) | Scenario 9; pgTAP driver cannot update trips/points/stats; `docs/HARDENING_REPORT.md` grep for client writes |

---

## 6. Risks (carried from `docs/00-repo-audit.md`)

| # | Risk | Severity | Affects | Mitigation / owner |
|---|---|---|---|---|
| R1 | Mappls RN SDK 2.0.3 (built on RN 0.79) vs Expo 57 / RN 0.87 unproven; shipped Expo plugin broken | High | M3 | Spike first; local `withMappls.ts`; fall back to an older SDK (ND-7) |
| R2 | No Mappls account/keys | High | M3, M6 | ND-2 |
| R3 | iOS from Windows: no Xcode; needs Apple account + physical iPhone + EAS cloud builds | High | M3, M12c | ND-3 |
| R4 | No Supabase project; Docker daemon off; CLI not installed | Medium | M4 | ND-4; `npx supabase` |
| R5 | Point-upload poison batch / clock skew in RLS | High | M8 | ND-8 |
| R6 | Stationary trucks flagged `TRACKING_GAP` / `LOW_COVERAGE` | High | M4, M8, M10 | ND-6 |
| R7 | Driver onboarding path (auth user creation, `shouldCreateUser`) | Medium | M5, M6 | ND-5, ND-12 |
| R8 | Repo path has a space, under Desktop (possible OneDrive) | Medium | M1+ | ND-1 |
| R9 | Node 26 is non-LTS for Expo | Low–Med | M1 | Pin Node 24 LTS if needed |
| R10 | `ANDROID_HOME` unset | Low | M3 | Pre-flight |
| R11 | EAS free-tier build quota | Low | M3+ | Local Android builds |
| R12 | Production SMS OTP needs DLT + paid provider | Medium | Pilot | Supabase test numbers until then |
| R13 | Client sign-offs outstanding | High | M5, pilot | ND-5 |
| R14 | Console screens not designed | Medium | M6, M7, M11 | Build from doc 04/12 specs + UI kit |
| R15 | Stitch mocks carry scope creep and non-compliant disclosure copy | Medium | M2, M9–M11 | ND-18; `design/README.md` |
| R16 | Chinese-OEM background killing | High | M9, M12b | D2 battery screen, foreground service, gap detection, field matrix (doc 01 §5) |
| R17 | Store reviews (Play background location, iOS "Always") | Medium | M12c | Submit the declaration and video by W4 (PRD §9) |

---

## 7. Progress log

*Append one entry per session. Format: date · milestone · what changed · what's left · known issues.*

### 2026-09-26 · Prompt 0 (audit)
- **Changed:** Created `docs/00-repo-audit.md`. Found no app code; the doc pack, root duplicates and Stitch exports were mapped.
- **Left:** Answers to audit questions (now ND-1…ND-7).
- **Known issues:** Migration 0001 defects (ND-8, ND-12, ND-13, ND-14); Mappls plugin broken (R1).

### 2026-09-26 · Prompt 1 (this plan)
- **Changed:** Created `docs/PHASE1_TASKS.md`. A newer pack was found at `namma-lorry-phase1-docs/namma-lorry-phase1-docs/` (adds docs 12/13, `stitch/DESIGN.md`, updated doc 04); a copy of doc 13 also sits at the repo root. No application code written.
- **Left:** Answer ND-1…ND-24, then pre-flight, then M1 (Prompt 2).
- **Known issues:** Audit questions still unanswered in `docs/00-repo-audit.md`; three copies of the docs now exist (root loose files, old pack, new nested pack) until pre-flight cleans up.

### 2026-09-26 · M5 (Prompt 6): auth, roles and routing
- **Changed:** M1–M4 app code didn't exist yet, so this session also built the minimum those milestones had to provide (agreed with the user):
  - Expo SDK 57 app with Expo Router, TS strict, ESLint, Prettier, Jest; exact version pins
  - theme tokens and the UI-kit subset S1–S4 need
  - the typed Supabase client (chunked SecureStore on native, guarded localStorage on web) and generated `database.types.ts`
  - `docs/DEV_SETUP.md`
  - placeholders for all 21 screens

  M5 itself:
  - S1–S4 screens, OTP sign-in with `shouldCreateUser: false`, and the error states
  - pure `decideRoute` (doc 04 §2), with `AreaGuard` on every route group
  - stubs for local trip state and permissions; sign-out blocked while a trip is active
- **Verified:**
  - `npm run typecheck`, `npm run lint` and `npm test` (98 tests) pass
  - Local Supabase (`supabase start`: 0001 + 0002 + seed applied unchanged) + `expo start --web` + Playwright, against the real local auth server:
    - signed out → S2
    - invalid number → button disabled
    - unregistered number error
    - wrong code error
    - admin → `/console`; session survives a reload; sign out → S2
    - driver on web → S4 "use the mobile app"
    - driver can't open `/console`; a spoofed `?variant=` is ignored
    - inactive → S4 deactivated
    - owner → S4 coming soon
- **Not verified:**
  - native (no device/emulator here): SecureStore session, Android SMS autofill, the resume-trip path (stubbed)
  - "rate limited" and "expired" are unit-tested only
- **Left:**
  - the 🧍 checkpoint (log in as the seeded admin and driver on web and on a phone)
  - the rest of M1 (eas.json, CI, remaining packages), M2 (full kit, kitchen sink), M3, and M4 pgTAP tests
- **Known issues:**
  - ND-25 route layout needs approval
  - ND-12 still needs a server-side guard
  - "Change language" only shows a "coming soon" note until the M11 language sheet
  - store buttons on S4 stay hidden until `EXPO_PUBLIC_PLAY_STORE_URL` / `EXPO_PUBLIC_APP_STORE_URL` are set

### 2026-09-26 · M6 (Prompt 7): console shell, drivers, vehicles, Mappls proxy
- **Changed:**
  - Console shell: sidebar with review badge, top bar with global search and avatar menu, and the M5 `AreaGuard` for admin-only access.
  - C8 Drivers with the Add Driver drawer; C9 Vehicles with the Add Vehicle modal.
  - Console primitives: DataTable, Drawer, Modal, Sidebar, TopBar, TextField, ChoiceChips, Chip.
  - Edge Functions `mappls-proxy` and `admin-create-driver`, both with READMEs. Shared JWT + `is_admin()` check, CORS, error mapping and rate limiter.
  - `src/lib/mappls.ts` and `src/lib/functions.ts`.
  - A `format` script; the whole codebase is Prettier-formatted.
- **Mappls research (developer.mappls.com, 26 Sep 2026):**
  - Auth is a static key as the `access_token` query parameter; OAuth client-credentials is marked Legacy.
  - Endpoints:
    - `search.mappls.com/search/places/autosuggest/json`
    - `/search/address/geocode`
    - `/search/address/rev-geocode`
    - `route.mappls.com/route/dm/distance_matrix/{trucking|driving}/lng,lat;lng,lat`
  - Coordinates from autosuggest and geocode are premium (ND-26).
- **Verified:**
  - Checks: `npm run typecheck`, `lint`, `format:check`, and `npm test` (157 tests) pass. `deno task check` (type-check, lint, fmt) and `deno task test` (24 tests, mocked Mappls) pass.
  - Real functions against local Supabase (run with Deno, see known issues):
    - `admin-create-driver`: no JWT 401, anon key 401, driver 403, admin 201 (profile gets the name and language; the new number then counts as registered for OTP), duplicate 409, bad input 400.
    - `mappls-proxy`: driver 403, missing key 500 `CONFIG_MISSING`, bad body 400.
  - Playwright on web against local Supabase, 15 checks:
    - sidebar and review badge
    - drivers table contents and sorting
    - drawer validation, adding a driver through the function, duplicate-phone error
    - global search to drivers and to vehicles
    - plate validation, normalised preview, add vehicle, duplicate plate
    - avatar-menu sign-out
  - A production `expo export -p web` bundle contains no service-role or Mappls secret.
- **Not verified:**
  - Live Mappls responses: the sandbox can't reach Mappls, so the normalisers are tested against the documented shapes.
  - Functions inside `supabase functions serve`: the edge-runtime container doesn't trust this sandbox's HTTPS proxy CA, so it can't download npm modules.
  - A hosted deploy.
- **Known issues:**
  - ~~The functions pin `@supabase/supabase-js@2.117.1`~~ (aligned to 2.117.2 in the follow-up below).
  - `deno.lock` is disabled (`"lock": false`). Deno 2.9 writes lockfile v5, but the edge runtime is Deno 2.1.
  - The driver/vehicle "last trip" and "on trip" columns read up to 5,000 recent trips client-side. Move this to a view if volumes grow.
- **Left:** 🧍 set `MAPPLS_REST_KEY` in Supabase secrets, deploy both functions, try autosuggest (and confirm ND-26 against your Mappls plan); decide ND-26 and ND-27.

### 2026-09-26 · M6 follow-up: `@supabase/server` + new API keys
- **Changed:**
  - Both Edge Functions now authenticate with `@supabase/server@1.8.0` (`createSupabaseContext`, `auth: 'user'`).
    - The JWT is verified against the project JWKS; ES256 is confirmed for local, and the hosted project publishes one too.
    - `is_admin()` runs on the RLS-scoped `ctx.supabase`.
    - `admin-create-driver` now uses `ctx.supabaseAdmin` (secret key) instead of a hand-built `SUPABASE_SERVICE_ROLE_KEY` client.
    - Error bodies keep the `{ error: CODE }` shape the app expects.
    - Entry points are `export default { fetch }`.
  - The app now uses the **publishable key**: `EXPO_PUBLIC_SUPABASE_ANON_KEY` became `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `config.ts` rejects anything that isn't `sb_publishable_…`, so a legacy anon JWT or a secret key can't end up in the bundle.
  - Functions and app both use supabase-js 2.117.2.
  - Vendored the package's agent skill at `.claude/skills/supabase-server/` (`skills-lock.json`); it is identical to the copy in the npm package.
- **Verified:**
  - Checks: app typecheck, lint, format and 160 Jest tests pass. `deno task check` and 29 Deno tests pass; the new `_shared/auth_test.ts` runs the real `createSupabaseContext` against a locally generated ES256 JWKS (no JWT, malformed, wrong key, expired → 401; valid → caller id with `is_admin()` sent as the caller; non-admin → 403; JWKS unreachable → 500).
  - Real functions (`deno serve`) against local Supabase with the local `sb_publishable_`/`sb_secret_` keys:
    - `admin-create-driver`: no JWT or legacy anon JWT → 401, driver → 403, admin → 201, duplicate → 409.
    - `mappls-proxy`: 403 / 500 `CONFIG_MISSING` / 400.
  - Playwright on web with the publishable key: M5 auth flows (12 checks) and M6 console (15 checks) pass.
- **Not verified:** hosted deploy (needs your Supabase access token).
- **Hosted project:** the app only needs its URL + publishable key in `.env`. `SUPABASE_SECRET_KEY` is injected into Edge Functions automatically and must not be put in the app.

### 2026-09-26 · M7 (Prompt 8): loads and assignment
- **Changed:**
  - C2 Loads, C3 Create Load, C4 Load Detail & Assign and C5 Trips.
  - Migration `0003_load_list_view.sql` (`load_list`, `security_invoker`) and its pgTAP test `supabase/tests/load_list.test.sql`: status derivation, cancelled trips ignored, and RLS for admin / driver / shipper / anon.
  - Web map on the Mappls Web SDK v3 (`src/components/map/`, an M3 subset), with a fallback panel. `src/lib/geo.ts`.
  - `mappls-proxy` gains a `route` action (ND-28).
  - DataTable gains server-side paging and sorting, clickable rows, and a fixed-width layout (the M6 tables no longer clip their columns).
  - New UI pieces: Slider (keyboard and ± accessible), FilterChips, SearchSelect, SearchInput.
  - `expo-asset` installed; it was a missing peer of `expo-font` that broke Jest for anything importing icons.
  - Playwright set up: `playwright.config.ts`, `e2e/`, `npm run e2e`.
- **Mappls Web SDK (developer.mappls.com Web JS V3.0, Sep 2026):**
  - Script `https://sdk.mappls.com/map/sdk/web?v=3.0&access_token=<static key>`.
  - Classes: `mappls.Map`, `Marker({draggable, html})` with `addListener('dragend')` / `getPosition()`, `Circle`, `Polyline`, `mappls.remove({map, layer})`, `mappls.fitBounds({map, cType: 0, bounds: [[lng, lat]…]})`.
  - Unverified: the dashed-line option (`dasharray`) and the click-event payload (`e.lngLat`) aren't documented; they follow MapLibre conventions.
- **Verified:**
  - Checks: typecheck, lint, format; Jest 195; Deno 31 (including the `route` action and polyline decoding); `supabase test db` (9 checks); `supabase db reset` applies 0001–0003.
  - `npm run e2e` passes twice in a row against local Supabase. The run:
    - hits C3 validation, then fills pickup from a suggestion with coordinates and drop from a suggestion without coordinates plus typed coordinates
    - moves a radius slider and checks the route-preview strip
    - saves: planned distance sent to `distance` with the right coordinates, `NL-YYYY-NNNNNN` code, 41 km and 6.5 t shown on C4
    - hits assign validation, assigns with driver/vehicle search → trip "Assigned"
    - finds the load in C2 by search (Assigned, Ravi Kumar) and the trip in C5 (status filter + search)
  - Manual browser run: the busy-driver warning shows and assigning still works.
  - The M6 console suite (15 checks) still passes.
- **Not verified:**
  - The real Mappls map and live autosuggest / route / distance calls: no `EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY` or `MAPPLS_REST_KEY`, and Mappls is unreachable from this sandbox. The e2e mocks the proxy.
  - The "admin creates a load in < 2 min" acceptance needs a human with the real map.
- **Left:** 🧍 set both Mappls keys, check the map renders on C3/C4, drag a pin, and confirm the dashed planned route; decide ND-26, ND-28 and ND-29.

### 2026-09-26 · M8 (Prompt 9): tracking engine
- **Changed:**
  - `src/tracking/`: config, db, queue, mapping, task, taskHandler, uploader, stateMachine, errors, runtime, localState, simulatedLocation.
  - `/dev/tracking` dev screen.
  - Root layout imports the task first and starts the sync loop on native.
  - Splash/sign-out use real local state.
  - `app.config.ts` gains the expo-location plugin (doc 09 §3 strings, iOS/Android background, Android foreground service) and expo-sqlite.
  - Installed expo-location, expo-task-manager, expo-sqlite, NetInfo, expo-device, expo-application (SDK-matched, exact).
  - `metro.config.js`: wasm asset and COOP/COEP headers on the dev server, so expo-sqlite web works for the dev screen.
- **Verified:**
  - Checks: Jest 279 (84 tracking), typecheck, lint, format; `expo export -p web` builds.
  - **Real backend** (local Supabase, driver session, `/dev/tracking` on web with simulated GPS, Playwright):
    - start_trip 231 km away → `OUTSIDE_PICKUP` parsed to metres; nothing persisted, no task, server still `assigned`
    - start at the pickup → server `in_progress`, start fix uploaded as seq 1
    - 20 points uploaded through the real RLS (seq 1–21, no duplicates, `trip_live` updated)
    - browser offline → uploads fail as network errors, 5 more points queue (pending=5, next_seq=27)
    - End offline → `ENDED_PENDING_SYNC`, server still `in_progress`
    - back online → one sync uploads the 5 points, `end_trip(expected=26)`, server verifies (`needs_review`: END_OUTSIDE_DROP, GPS_JUMPS, DISTANCE_TOO_SHORT, expected for a simulated path) → local rows deleted, state IDLE
  - M5 auth (12), M6 console (15) and the M7 e2e spec still pass.
- **Not verified (needs a device):** the background task on Android/iOS (screen off, OS kills, reboot), the foreground-service notification, real GPS quality, and NetInfo/AppState triggers on a phone. This sandbox has no emulator. It's the M9 🧍 checkpoint.
- **Decisions:** ND-8 client-side quarantine (needs approval); ND-6 unchanged (TRD as written).

### 2026-09-26 · M9 (Prompt 10): driver onboarding and trip start
- **Changed:**
  - D1 (`app/(onboarding)/permissions.tsx`): doc 09 disclosure first, ordered requests, status rows, Open settings, GPS-off banner, `record_consent` on Continue. Pure rules in `src/features/onboarding/permissionModel.ts`; native reads/requests in `src/tracking/permissions.ts` (the M5 stub is gone).
  - Routing: a native driver goes to D3 only with precise + "all the time" location **and** the current consent version (`CONSENT_VERSION`). `DriverGate` + `usePermissionRecheck` re-check on every app foreground and send the driver back to D1.
  - D2 (`app/(onboarding)/battery.tsx`, `batteryGuide.ts`): brand detection and steps; shown once per phone after D1 on Android.
  - D3 (`app/driver/(tabs)/index.tsx`): bottom tabs; pinned live trip (local state first); assigned cards; empty/offline/error states; pull to refresh. Driver queries in `src/features/trips/api.ts`.
  - D4 (`app/driver/trips/[id]/index.tsx`, `startState.ts`): map, foreground GPS watch (`src/tracking/foregroundLocation.ts`), all start states, START → engine → D5, outside-pickup sheet.
  - Map: new `me` marker kind (blue dot) on web and the fallback.
  - `app.config.ts`: iOS `infoPlist` strings + `UIBackgroundModes: ['location']`, `locationAlwaysPermission`, `expo-notifications` plugin. Installed expo-notifications 57.0.21 and expo-intent-launcher 57.0.1 (SDK-matched, exact).
  - Config: optional `EXPO_PUBLIC_PRIVACY_POLICY_URL` (D1 link hidden until set).
  - Dev: `EXPO_PUBLIC_DEV_DRIVER_WEB=1` previews the driver app in a browser with simulated permissions and GPS (DEV_SETUP §8). Off in production builds.
- **Verified:**
  - Checks: Jest 349 (+70: permission model, battery guide, start state, D3 sections, 10 RNTL D4 tests, 6 RNTL D1 tests), typecheck, lint, format; `expo config` shows the iOS strings, UIBackgroundModes and Android background/foreground-service permissions.
  - **Real backend** (local Supabase, driver preview in Chromium at 390×844, Playwright):
    - Murugan: sign in → D1 (0 of 3) → Allow ×3 → Continue → `profiles.consent_version = '2026-09-v1'` → D2 → D3 shows the seeded trip
    - D4 at the default simulated position shows "You're 231 km from the pickup" with START disabled; at the pickup it shows "GPS accuracy 8 m" and START is enabled
    - START → server trip `in_progress` (start 12.957, 79.9425, ±8 m) → D5 route; D3 then pins the live trip with Resume
    - Ravi (no trips): empty state; with background location revoked, the next check sends him back to D1 ("2 of 3 ready")
  - No console errors during the walkthrough.
- **Not verified (needs a device):** real permission dialogs (Android 11+ "Allow all the time" settings page, iOS "Change to Always Allow"), OEM battery settings pages, AppState foreground re-check on a phone, and the native map (still the M3 placeholder on native). This sandbox has no emulator.
- **Decisions:** ND-30 (notifications optional), ND-31 (straight planned line on D4), both need approval. D1 copy on retention points to the privacy policy until the retention period is decided (PRD open question).
- **Left:** 🧍 the M9 device checkpoint below (also covers M8's background task); set `EXPO_PUBLIC_PRIVACY_POLICY_URL`; decide ND-30 and ND-31.

### 2026-09-26 · M10 (Prompt 11): active trip, end trip, summary
- **Changed:**
  - D5 Active Trip: map following the truck, route and approx km from the local queue, km to drop, sync and GPS rows, tracking-problem banner with Fix, near-drop banner and solid END, Android back → My Trips, "Keep screen on" (expo-keep-awake 57.0.2, off by default).
  - End Trip sheet: warns with the distance outside the drop radius, never blocks; calls `tracking.endTrip()`.
  - D6 Trip Summary: realtime on the trip row (new migration `0004_trips_realtime.sql` + pgTAP `realtime.test.sql`) with a polling fallback; Verifying / Verified (+ `driver_stats` totals) / Needs review / Rejected / Cancelled / Ended offline; a text per docs/08 §3 reason code with metric details.
  - D3: a trip ended offline is no longer pinned as live; a note links to its D6.
  - Tracking: `queue.routePoints`, `runtime.isTripTaskRunning`, `liveTrip.ts` (local snapshot, restart, sync now). Map: `follow` prop. UI: `dangerOutline` button. `lib/dates.ts` formats IST dates by hand (ICU builds differ: "Sep" vs "Sept").
  - Fixed: distances just under 10 km showed as "10.0 km" on D4/D5 (now "10 km").
- **Verified:**
  - Checks: Jest 409 (+60: live and summary models, reason texts for every code, IST dates, 15 RNTL D5 tests, 11 RNTL D6 tests), typecheck, lint, format; `supabase test db` 11; M7 e2e passes.
  - **Real backend** (local Supabase with realtime, driver preview in Chromium, Playwright):
    - start at the pickup → D5 "All trip data synced", "GPS good · ±8 m"
    - 20 simulated points → D5 shows 4.2 km approx. from the local queue and 397 km to drop
    - browser offline → "Offline · 19 points saved on phone…"; END → sheet warns "You're 397 km from the delivery point…" → confirm → D6 "Ended offline — will verify when you're online."
    - back online → the runtime syncs the end (`end_trip`, 21/21 points), realtime delivers the trip UPDATE, D6 shows "Trip under review" with END_OUTSIDE_DROP (396 km away), GPS_JUMPS and DISTANCE_TOO_SHORT (expected for a simulated path); no console errors
  - Two D6 bugs found in that run and fixed, each with a regression test: (1) once the sync cleaned up the local copy, a stale `in_progress` row bounced D6 back to D5; (2) a final server result stopped the local poll, so a stale "ended offline" state stayed on screen. A final server status now always wins, and the local poll runs until the local copy is gone.
- **Not verified (needs a device):** the real background task and foreground-service notification during a trip, keep-awake on a phone, Android hardware back, and the airplane-mode real trip below. In this sandbox the local realtime service hadn't been running in earlier milestones (Supabase was started with services excluded); it was started for this check, and DEV_SETUP now says D6 needs it.
- **Decisions:** ND-14 done (0004); ND-32 (stopped vs broken) needs approval.
- **Left:** 🧍 the M10 real-trip checkpoint (airplane mode mid-trip, end offline, reconnect → verified with zero missing points); decide ND-32.

### 2026-09-26 · M11 (Prompt 12): live console, review, history, profile
- **Changed:**
  - C1 Live Dashboard, C6 Trip Detail & Review, C7 Review Queue, D7 Trip History, D8 My Profile (see the M11 tasks above). C5 rows open C6.
  - `src/lib/useRealtimeChanges.ts`: postgres_changes with refetch on every (re)subscribe, backoff resubscribe on channel errors, immediate resubscribe on reconnect.
  - Map: `start` / `end` marker kinds, `stale` red ring, `onMarkerPress`, `fitKey` (fit only when the content set changes).
  - Driver profile query includes `created_at`; `driver_stats` query includes `last_verified_at`.
  - Dev preview: the D2 "done" flag persists for the browser session.
  - New Playwright spec `e2e/review-trip.spec.ts` (doc 10 §1 review-approve): the driver finishes a trip away from the drop through the real RPCs and RLS (supabase-js, test OTP), the admin finds it in C7, can't decide without a note, approves in C6; the trip is verified, the approval is on the timeline, and `driver_stats` goes up by exactly one.
- **Verified:**
  - Checks: Jest 478 (+69: realtime hook incl. retry/backoff/reconnect, C1 board and merge rules, C6 paging/replay/metrics/timeline, D7 grouping, D8 health; RNTL: 7 C6, 7 C1+C7, 8 D7+D8), typecheck, lint, format; `supabase test db`; e2e 2/2.
  - **Real backend, two browsers** (local Supabase with realtime; driver preview at 390×844, admin at 1440×900):
    - driver starts the seeded trip → C1 shows it (1 live, 0 stale, 1 assigned today) without reload
    - 20 + 1 points uploaded → C6 goes from 21 to 22 points through realtime, "Last update 0 s ago"
    - driver ends away from the drop → C6 flips to needs review by itself (END_OUTSIDE_DROP 397 km, GPS_JUMPS, DISTANCE_TOO_SHORT); timeline Started / Ended (22 points expected) / Flagged
    - C7 lists it; Approve without a note is refused; with a note → "Approved by Namma Lorry Ops: …", review card gone, C7 empty
    - driver D7 shows the trip Verified; D8 shows 1 trip, last trip 26 Sep, health "All good"; no console errors
  - Fixed during the run: metric distances showed "396574 m" (now km over 1 km); the D8 health row squeezed its title; the C7 title said "(0)" while loading.
- **Not verified:** the real Mappls map with markers, rotation and fitting (no key here; the text fallback was used); realtime over a flaky mobile network; C1 with many trips.
- **Decisions:** ND-33 (no C1 tails), ND-34 (live append from `trip_live`) need approval.
- **Left:** 🧍 watch a live trip on C1/C6 with the real map while the M9/M10 device test runs; decide ND-33 and ND-34.
