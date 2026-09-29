# Phase 1 Validation Report — Namma Lorry

**Run date:** 29 Sep 2026 · **Target:** `origin/main` @ `3d77ec08a58237535893614bab2e38c8e6e6c042` (PR #10 merge) · **Auditor:** independent, read-only (Claude Code, Opus 5.5)
**Machine:** Windows 11, Node 26.8.1, Bun 1.4.2, Docker 29.7.2, Supabase CLI 2.118.0 (via `bunx`), Deno (via `bunx deno`), JDK 17, Android emulator 36.6.
**Evidence:** everything cited lives in [`docs/validation/`](validation/). File references like `0001:315` mean `supabase/migrations/0001_phase1_schema.sql` line 315 on `origin/main`.
**Sources of truth used:** the newest doc pack at `namma-lorry-phase1-docs/namma-lorry-phase1-docs/` (CLAUDE.md, docs 01–13). On `origin/main` the pack is **not** at the repo root, and `docs/release/*`, `docs/RUNBOOK.md` and `docs/FIELD_TEST_SCRIPT.md` **do not exist**. Those files exist only on the unmerged local line `r0-stabilise` (see §0.1).

---

## 1. Verdict: **NO-GO**

The server core is solid and was proven end to end on the local stack:
- Verification rules, RLS and the review flow behave as specified.
- 139/139 pgTAP, 476/476 Jest and 43/43 Deno tests pass.
- 44 of 45 REST attacks were blocked.
- A simulated genuine trip auto-verified at 5.974 km against 6 km planned.
- A flagged trip went to `needs_review` with exactly `END_OUTSIDE_DROP`, and approval credited stats exactly once.

`main` is still not releasable:
- The **production web export fails**, so the console cannot be deployed.
- `main` has no crash reporting, store assets, release docs, privacy policy, retention job or erasure path.
- The DPDP consent write can fail silently.
- An admin can write `status = verified` and any km directly, with no audit (ND-13).
- Mappls has never run anywhere: there are no credentials on this machine and no recorded device evidence.
- Every device-dependent acceptance scenario and the entire Phase 1 definition of done (10 pilot trips, store tracks, published policy, client sign-offs) lack evidence.

Much of the missing release work already exists on the unmerged `r0-stabilise` line. Main's divergence from it is itself a key risk.

---

## 2. Baseline (Part 0)

### 0.1 Repository state
| Item | Value |
|---|---|
| `origin/main` HEAD | `3d77ec08a58237535893614bab2e38c8e6e6c042` |
| Auditor's working branch at start | `r0-stabilise` @ `7ab472d`. **Not an ancestor of main:** it forks at `72c6e2a` and carries M12a–c + R0 (see untracked `docs/LINE_COMPARISON.md` in the user's tree). Working tree had 2 untracked files: `14-phase1-completion-prompts.md` and `docs/LINE_COMPARISON.md`. |
| Open PRs | #1 "M5–M12a…" (`claude/epic-maxwell-3ifdr3`), **DRAFT**, opened 26 Sep, a third independent line |
| Latest CI on main | ✅ run [36375881333](https://github.com/santhosh2564/Namma-Lorry-V1/actions/runs/36375881333) (PR #10 merge, 28 Sep, 43 s), plus ✅ 36371988969, ✅ 36364841417 |
| Fresh clone | `C:\dev\nl-validate` from `origin/main` (removed at the end) |

### 0.3 Suite results (fresh clone)
| # | Suite | Command | Result | Log |
|---|---|---|---|---|
| 1 | Install (lockfile) | `bun install --frozen-lockfile` | ✅ 1,052 packages, **no lockfile drift** | `00-install.log` |
| 2 | Typecheck | `bun run typecheck` | ✅ | `01-typecheck.log` |
| 3 | Lint | `bun run lint` (`--max-warnings=0`) | ✅ | `02-lint.log` |
| 4 | Format | `bun run format:check` | ✅ | `03-format.log` |
| 5 | Jest (full, `--ci`) | `bun run test -- --ci` | ✅ **476/476**, 39 suites, 0 skipped/todo | `04-jest.log`, `04-jest-results.json` |
| 6 | Script tests (`node --test`) | n/a | ❌ **no suites exist on main** (no `scripts/`, no release tooling) | `05-node-test.log` |
| 7 | Deno Edge Function tests | `bunx deno test --allow-env --allow-net` | ✅ **43/43** | `06-deno.log` |
| 8 | `supabase db reset` | 0001–0004 + seed | ✅ | `07-db-reset.log` |
| 9 | pgTAP | `supabase test db` | ✅ **139/139**, 6 files, 0 TODO | `08-pgtap.log` |
| 10 | Concurrent `start_trip` race | `test/db/start-trip-race.sh` (copied from `r0-stabilise`; **absent on main**) | ❌ second session gets raw `duplicate key … trips_one_active_per_driver`, not `ANOTHER_TRIP_ACTIVE`; integrity holds (1 in progress) | `09-start-trip-race.log` |
| 11 | Playwright e2e | `bunx playwright test` | ⚠️ **0 passed / 1 skipped** → counts as **not run** (needs 5 `E2E_*` keys + Mappls) | `10-playwright-as-is.log` |
| 12 | Web export (production) | `expo export -p web` | ❌ **FAILS**: `Unable to resolve module ./wa-sqlite/wa-sqlite.wasm` (no `metro.config.js`) | `11-web-export.log` |
| 13 | `expo config --type introspect` (production) | | ✅ ran; findings in §4.4 | `12-expo-config-introspect.json` |
| 14 | `expo prebuild -p android` (production) | run in the throwaway clone; `android/` deleted afterwards | ✅, with warnings "missing .a.olf / .a.conf" (Mappls licence files absent) | `13-prebuild-android.log`, `13-AndroidManifest.production.xml` |
| 15 | `expo prebuild -p ios` | | ⛔ **NOT VERIFIABLE**: CLI refuses on Windows ("run from macOS or Linux") | `14-prebuild-ios.log` |
| 16 | `release:assets` | n/a | ❌ **script does not exist on main** | — |
| 17 | Dependency audit | `bun audit` | ⚠️ 2 moderate (`decode-uri-component` via expo-router, `uuid@7` via config-plugins), 0 high/critical | `15-audit-prod.log` |
| 18 | Native dev build on emulator | `expo run:android` | ⛔ **NOT VERIFIABLE**: Gradle distribution download ran at ~32 KB/s (12.9 of 137 MB in 400 s); Maven deps and Mappls licence files also needed | `18-run-android.log` |

### 0.4 Test integrity
- **Skipped/only/todo:** Jest 0. pgTAP 0 TODO. Deno 0 ignored. **Playwright: 1 of 1 skipped** (`e2e/create-load.spec.ts:29` `test.skip(config === null …)`), so **no web E2E has ever run.**
- **Suites that exist but CI doesn't run** (`.github/workflows/ci.yml` runs only typecheck, lint, format, Jest, Deno):
  - pgTAP (`supabase test db`). This is the proof of PRD goal 3.
  - Playwright.
  - Web export. This is why the export break went unnoticed.
  - Dependency audit (docs/09 §4 requires it).
- **Generated DB types** (`supabase gen types --local` vs `src/lib/database.types.ts`, structural TS check in `16-db-types-drift.log`):
  - No missing or extra tables or columns, and enums match.
  - The file is **hand-edited**: `loads.Row`/`trip_points.Row` type `geog` as `Json|null` rather than `unknown`, `trip_events.Insert` differs, and it lists trigger functions `handle_new_user`/`on_trip_point_insert` that gen omits.
  - Header comment says "0001 + 0002" but 0003/0004 exist. → MINOR.

---

## 3. Blockers

| # | Issue | Evidence | Violates | Suggested fix | Size |
|---|---|---|---|---|---|
| B1 | **Production web export fails**, so the console cannot be deployed | `11-web-export.log`: `Unable to resolve module ./wa-sqlite/wa-sqlite.wasm` from `expo-sqlite/web/worker.ts`; no `metro.config.js`; CI never exports | docs/01 §6 "console on a public URL"; M12c | Add `metro.config.js` with `wasm` in `resolver.assetExts` (or keep `expo-sqlite` out of the web graph: D5 imports `@/tracking/db` through `useLiveTripData.ts`); add `expo export -p web` to CI | S |
| B2 | **Admin can set `trips.status`/`tracked_distance_m` directly; no audit event, no stats** (ND-13 open) | `rls-attacks.md` A29: admin `PATCH trips` → 200, DB `{"status":"verified","tracked_distance_m":123456}`, events only `["started"]`; policy `trips_admin … for all` (`0001:230`) | CLAUDE.md hard rule 2; docs/09 §5 "Admin abuse → mandatory notes + audit" | Migration: replace `trips_admin FOR ALL` with admin SELECT + INSERT; add audited `cancel_trip` / `admin_force_end` RPCs; pgTAP for each | M |
| B3 | **DPDP controls missing or broken:**<br>(a) no retention or downsampling job, and retention period undecided (ND-5)<br>(b) no erasure/anonymisation RPC or runbook<br>(c) a consent-write failure is silently ignored<br>(d) the server doesn't require consent before `start_trip` | (a)/(b) grep: no `cron.schedule` other than the sweeper, no erase function.<br>(c) `app/(onboarding)/permissions.tsx:115` does `await recordConsent()`, but `recordConsent` **returns** `{ok:false}` (`src/features/onboarding/consent.ts`); the `catch` is dead code.<br>(d) `20-walkthrough.log` step 5c: driver B started with `consent_version=null` | docs/09 §1 (notice + consent, withdrawal & erasure, retention) | Check `result.ok`; server-side consent gate in `start_trip` (or a policy); decide retention and add a `pg_cron` job; add `admin_erase_driver` RPC + runbook, each with tests | M |
| B4 | **No crash reporting** (Sentry absent from `package.json`, no `src/lib/sentry.ts`) | grep: 0 hits for `@sentry` | PRD §7 "crash-free ≥ 99 %" can't be measured; docs/09 §1 breach readiness "Sentry alerts"; TRD §2 | Port `r0-stabilise`'s Sentry wiring (with PII scrubbing + tests) onto main | M |
| B5 | **No release artefacts on main:**<br>- icons/splash undefined (`app.config.ts`)<br>- EAS project not linked (no `extra.eas.projectId`, no `updates`/`runtimeVersion`/channels in `eas.json`)<br>- no `vercel.json`/CSP<br>- no `docs/release/*` (privacy policy, Data safety, App Privacy, background-location declaration, review notes)<br>- no `RUNBOOK.md` | `12-expo-config-introspect.json` (`icon: undefined`, `projectId: undefined`); `ls docs/` = `00-repo-audit.md, DEV_SETUP.md, PHASE1_TASKS.md` | docs/01 §6 (Play internal, TestFlight, privacy policy published), M12c | Port `r0-stabilise` M12c (reconciling key names and routes, per LINE_COMPARISON option A); `eas init`; produce assets | M |
| B6 | **Mappls never exercised on any platform** (no credentials on this machine; `mappls-proxy` not deployed locally; native `.olf/.conf` absent) | `20-walkthrough.log` step 2 (autosuggest: "Map search is unavailable"); every console screenshot shows "Map unavailable: EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY is not set"; `13-prebuild-android.log` licence warnings; ND-2 open | PRD P0-2 (autosuggest + planned distance), P0-8 (live map); docs/01 W0 exit criterion | Provide credentials (human list #2); run the e2e spec and a device build; record screenshots | S (once keys exist) |
| B7 | **Phase 1 definition of done unmet, and no device or field evidence exists at all** | No `docs/FIELD_TEST_SCRIPT.md` on main; PHASE1_TASKS M12b matrix all ☐; hosted project had no schema as of 27 Sep (PHASE1_TASKS log) | docs/01 §6; docs/10 §4 scenarios 1, 2, 3, 5, 6, 7, 11 need a phone | Human list #5–#8 | L |
| B8 | **Client sign-offs absent** (ND-5): RN + Mappls written approval, docs/08 thresholds, retention period, who registers drivers | PHASE1_TASKS §2.1: ND-5 open, no decision date | PRD §8 open questions marked "Blocking — before W1"; legality of retention | Obtain and record sign-offs with dates | S (human) |

---

## 4. Majors and minors

### MAJOR
| # | Issue | Evidence | Violates | Suggested fix | Size |
|---|---|---|---|---|---|
| M1 | Hardening, release and acceptance work lives on unmerged `r0-stabilise` (and draft PR #1); `main` lacks it and the lines conflict (migration numbers 0003/0004 differ) | `git merge-base` = `72c6e2a`; `docs/LINE_COMPARISON.md` | Single source of truth | Decide the base (human list #1), then port in small PRs | L |
| M2 | Config **fails open** in release: invalid or missing env falls back to `appEnv: "development"` and `http://127.0.0.1:54321`; no blocking screen, no test | `src/lib/config.ts:66-85`, `src/lib/supabase.ts:97-116` | Part 4.7 "fail closed"; docs/09 §4 transport | Blocking "App misconfigured" screen outside development + tests (R0 P0-3 on r0-stabilise) | S |
| M3 | Android release manifest has `android:allowBackup="true"` plus `SYSTEM_ALERT_WINDOW`, `VIBRATE`, `READ/WRITE_EXTERNAL_STORAGE` (maxSdk 32) | `13-AndroidManifest.production.xml` | Part 4.4 (allowBackup false, only expected permissions); Play review | `android.allowBackup: false`, `blockedPermissions` in `app.config.ts`, plus an app.config assertion test | S |
| M4 | Self-registration is open server-side: `POST /auth/v1/otp` for an unknown number creates an **active `driver` profile** | `rls-attacks.md` U2; `supabase/config.toml` `enable_signup = true`; `0001:54-62` | PRD P0-1; ND-12 | Disable sign-ups (local + hosted); `handle_new_user` creates `is_active=false` unless admin-created | S |
| M5 | Concurrent `start_trip` returns a raw unique-violation instead of `ANOTHER_TRIP_ACTIVE` | `09-start-trip-race.log` | docs/10 §4 scenario 10; docs/06 §1 | Advisory lock / map `unique_violation` (r0-stabilise 0004) + race script in CI | S |
| M6 | Abandoned `in_progress` trips are never swept, and there's no admin force-end or cancel RPC. A lost phone leaves the driver blocked by `ANOTHER_TRIP_ACTIVE` forever (the only escape is the unaudited B2 bypass) | `0001:482-491` (sweeper only handles `completed`) | docs/08 §4; ND-13, ND-25 | Sweeper handles stale `in_progress` → auto-close with `MISSING_POINTS`; audited `admin_force_end` | S |
| M7 | `/dev/*` routes reachable in release (deep link `namma-lorry://dev/tracking`) and act on the **real** SQLite store. "Simulate trip" overwrites active-trip state; "Clear" wipes unsent points; "Simulate" injects points (flagged `is_mocked`). `/dev/kitchen-sink` shows demo drivers | `app/dev/_layout.tsx` (no guard), `app/dev/tracking.tsx:98-156`; `app/dev/env.tsx:8` says "Gated behind __DEV__ in M12a" (not done) | PHASE1_TASKS M12a "Dev routes behind `__DEV__`"; Part 2 "demo data reachable in release" | `if (!__DEV__) return <Redirect href="/" />` in `app/dev/_layout.tsx` + test | S |
| M8 | Language pickers (S2, D8) offer ta/kn/hi, but **all 480 strings in each are `TODO: …` stubs**, including the 10 reason sentences; the choice isn't persisted | `src/i18n/{ta,kn,hi}.json` (480/480 `TODO`); `src/i18n/index.ts:13`; `app/(driver)/profile.tsx:201` | Hard rule 10; P1-4; shipping placeholder text | Hide non-English until translated, or ship translations; persist `preferred_language` | S / M |
| M9 | CI runs neither pgTAP nor e2e, the web export, the race script or the audit | `.github/workflows/ci.yml` | TRD §2 ("CI: … `supabase test db`"); docs/09 §4 (`npm audit` in CI) | Add `database` and `e2e` jobs (exist on r0-stabilise) | S |
| M10 | No web E2E has ever run: the only spec self-skips, and there is no review-approve spec | `10-playwright-as-is.log`; docs/10 §1 "Create load → assign → review approve" | docs/10 §1 | Local-stack E2E variant (the walkthrough in `docs/validation/` shows it's feasible) with a Mappls stub | M |
| M11 | iOS config (introspect): `UIBackgroundModes = ["location","fetch"]` (`fetch` added by `expo-task-manager`); `NSLocationAlwaysUsageDescription` = default "Allow $(PRODUCT_NAME)…", not docs/09 §3 text; `NSMotionUsageDescription` default; `NSAllowsArbitraryLoads: true` in introspect (final plist **NOT VERIFIABLE** on Windows) | `12-expo-config-introspect.json`; `node_modules/expo-task-manager/plugin/build/withTaskManager.js:10` | docs/09 §3; App Review | Config plugin removing `fetch`; set `locationAlwaysPermission`; verify the plist on macOS | S |

### MINOR
| # | Issue | Evidence | Fix | Size |
|---|---|---|---|---|
| m1 | C5 Trips: (a) Reasons cell renders raw key `console.trips.reasons` for a 1-reason trip (key is `reasonsOne`, i18next needs `reasons_one`); (b) the "Verified km" column shows km for a `needs_review` trip; (c) a not-started trip shows Ended = "Still running" | `walkthrough/09-C5-trips.png`; `src/i18n/en.json:247`; `app/(console)/trips/index.tsx:162` | Rename key; show km only for `verified`; "—" for unstarted | S |
| m2 | C7 Review card nests `<button>` inside `<button>` (React hydration/a11y error) | `walkthrough/walkthrough-log.json` consoleErrors | Make the inner action a non-button or the card a link | S |
| m3 | 13 hard-coded English strings in shared components ("Sign out", "Map unavailable", "Close", "Previous/Next page", "Mobile number", "Dismiss", "Clear", "Account menu") | `src/components/console/UserMenu.tsx:74`, `src/components/map/MapView.web.tsx:223`, `src/components/ui/PhoneInput.tsx:31`, etc. | Move to `src/i18n` | S |
| m4 | `GPS_JUMPS` threshold `5` hard-coded, not an `app_settings` key | `0001:322` | Add `max_gps_jumps` setting | S |
| m5 | `end_trip` with `p_expected_points = null` verifies immediately, so the client can skip `MISSING_POINTS` | `0001:418` | Require non-null or treat null as unknown → wait for sweeper | S |
| m6 | `admin_review_trip` on a non-existent id does not raise `TRIP_NOT_FOUND` (null status comparison) | `0001:434-435` | `if not found then raise` | S |
| m7 | No tests for the real SQLite store (`src/tracking/db.ts`) or the task module (`src/tracking/task.ts`); engine tests use the in-memory store | `04-jest-results.json` (no db/task suite) | Add tests with an `expo-sqlite` mock or on-device harness | M |
| m8 | DB types hand-edited; header lists only 0001 + 0002 | `16-db-types-drift.log` | Regenerate; add a drift check to CI | S |
| m9 | ≤ 2 taps target vs design: Start (1) + End (1) + confirm sheet (1) = 3 taps, plus opening the trip from D3 | docs/12 D5 confirm sheet vs PRD §2 goal 5 | Decide: confirm sheet counts or not | S (decision) |
| m10 | PHASE1_TASKS checklist out of date: D1–D8, C1, C6, C7 and all M11/M12 boxes unticked though code merged | `docs/PHASE1_TASKS.md:475-500, 389-461` | Update | S |
| m11 | Doc pack not at repo root, so `CLAUDE.md` isn't loaded; docs 03/08 still say `distanceInterval: 25` (ND-6 wording) | tree; PHASE1_TASKS ND-6 | R1 pre-flight | S |
| m12 | P1-2 (reverse geocoding), P1-3 (push on assign/verify), P1-5 (owner console) not built | grep | Confirm as deferred | — |
| m13 | 2 moderate transitive advisories | `15-audit-prod.log` | `bun audit fix` after Expo patch | S |
| m14 | D8 "Help & support" opens the access-notice screen (known issue in PHASE1_TASKS M11 log) | log line 719 | Real support destination | S |
| m15 | "Outside pickup" overlay implemented as an inline state row on D4, not a sheet | `app/(driver)/trips/[id].tsx:272-277` | Accept or build the sheet | S |
| m16 | Sign-in on desktop widths stretches inputs full-width | `walkthrough/01-S2-sign-in.png` | Max-width container | S |

---

## 5. NEEDS HUMAN EVIDENCE checklist (in order)

1. **Pick the base line** (`main` vs `r0-stabilise` vs PR #1) and record the decision. Every later item depends on it.
2. **Mappls credentials:**
   - Map SDK key, domain-restricted.
   - REST key / client id / secret, set as Edge Function secrets.
   - Native `.olf/.conf` for `com.nammalorry.driver`.

   Then run `e2e/create-load.spec.ts` with the 5 `E2E_*` keys, and record the console map + autosuggest screenshots and the CSP console log.
3. **Client sign-offs with dates:** RN + Mappls approval, docs/08 thresholds, raw-GPS retention period, driver-registration model (ND-5).
4. **Hosted staging proof** (don't let me touch it — paste output):
   - `select version from supabase_migrations.schema_migrations;`
   - `select jobname, schedule from cron.job;`
   - Auth settings screenshot: phone provider on, **sign-ups off**.
   - Deployed functions list.
5. **Real Android dev build**, with a video or screenshots of:
   - D1 disclosure → the three OS prompts in order.
   - D2 on a Xiaomi/Vivo/Oppo/Samsung.
   - D4 start at the pickup.
   - Locked phone with the "Namma Lorry trip in progress" notification.
   - Kill and relaunch mid-trip resuming tracking.
   - End → D6.
6. **Field-test matrix** (docs/10 §3) plus device scenarios 1, 2, 3, 5, 6, 7 and 11. Record expected vs received points, max gap, battery %, data MB and result per trip.
7. **Pilot:** 10 real trips (≥ 8 auto-verified), then run [`docs/validation/pilot_metrics.sql`](validation/pilot_metrics.sql) on the pilot DB with the window set, and paste the output. Metrics stay NEEDS HUMAN EVIDENCE until then.
8. **Store and hosting:** Play internal-testing link; TestFlight build, or an ND-3 deferral record with date; console public URL behind login; published privacy-policy URL; App Review demo account + test load.
9. **Sentry:** a test event from a preview build, after B4 is fixed.
10. **iOS plist:** run `expo prebuild -p ios` on macOS or in CI and attach `Info.plist` (ATS, background modes, permission strings).

---

## 6. Tables for Parts 1–7

### Part 1 — PRD requirements
| ID | Requirement (short) | Implementation | Automated proof | Device / manual evidence | Status |
|---|---|---|---|---|---|
| P0-1 | Phone OTP + roles; unknown refused | `src/features/auth/api.ts:23-26` (`shouldCreateUser:false`), `routing.ts`, `app/(auth)/*`, `app/access-notice.tsx` | `auth/routing.test.ts` (19), `auth/errors.test.ts`, `auth/splash.test.tsx`; walkthrough: admin S2→S3→C1, driver on web → S4 (`00`–`03` png) | Hosted SMS provider off as of 27 Sep → NHE | **PARTIAL**: server self-signup open (M4) |
| P0-2 | Create load: Load ID, autosuggest/pin, radius 500, planned distance | `app/(console)/loads/new.tsx`, `src/features/loads/*`, `supabase/functions/mappls-proxy/*`; Load ID from `load_code_seq` | `loads/schemas.test.ts` (30), Deno `proxy_test`/`proxy_wire_test` (43); walkthrough Load IDs `NL-2026-000146/7` | Autosuggest + distance never ran (no keys); e2e skipped | **FAIL/NHE** (B6) |
| P0-3 | Assign; one driver + vehicle; no two in progress | `app/(console)/loads/[id].tsx`, `useTrips.ts:233`; unique index `trips_one_active_per_driver` | pgTAP `02` "start_trip refuses a second trip… (scenario 10)"; walkthrough assign via C4 UI (`05`/`06` png) | — | **PARTIAL**: concurrent case raw error (M5) |
| P0-4 | Permission onboarding; Start disabled without background | `app/(onboarding)/permissions.tsx`, `battery.tsx`, `features/onboarding/*`, gate in `useProfile` | `onboarding/permissions.test.ts` (11), `battery.test.ts` (8), `routing.test.ts`; no D1/D4 component test | NHE (real OS prompts) | **PARTIAL** |
| P0-5 | Start geofence | `start_trip` `0001:368-395` | pgTAP `02` OUTSIDE_PICKUP/GPS_ACCURACY_TOO_LOW; `tracking/errors.test.ts`; `startState.test.ts`; walkthrough 5a `OUTSIDE_PICKUP:2987` | NHE | **PASS (server) / NHE (device)** |
| P0-6 | Background ~10 s/25 m, notification | `src/tracking/config.ts` (`TRACKING_OPTIONS`), `task.ts:41-86` | `tracking/config.test.ts` (9), `queue.test.ts` shouldRecord/selectPoints | NHE: never run on a device | **NHE** |
| P0-7 | Offline buffer, batches, no dupes, survives restart | `queue.ts`, `db.ts`, `uploader.ts`, `stateMachine.ts` | `uploader.test.ts` (27), `queue.test.ts` "never reuses a seq after a crash", `stateMachine.test.ts` resumeOnLaunch; walkthrough step 7 (7-row post-offline batch, re-send idempotent, 36/36) | NHE (airplane mode on device) | **PASS (logic) / NHE** |
| P0-8 | Live console map | `app/(console)/index.tsx`, `useLiveTrips.ts`, `MapView.web.tsx`; `trip_live` publication | `LiveTripList.test.tsx` (9), `console/liveState.test.ts` (18); walkthrough `07-C1-live-two-trucks.png` (list live, "Updated 1 s ago") | Map not rendered (no key); ≤ 60 s on real network NHE | **PARTIAL** |
| P0-9 | End anywhere, warn off-drop, flush, offline | `stateMachine.ts` endTrip, `app/(driver)/trips/[id]/live.tsx`, `end_trip` `0001:397-425` | `stateMachine.test.ts` "endTrip works offline…", `LiveTripSheet.test.tsx` (17); walkthrough steps 8–9 | NHE | **PASS (logic) / NHE** |
| P0-10 | Server verification with reason codes | `verify_trip` `0001:269-347` | pgTAP `03` (each of 10 codes as sole reason + set pinned), `04` trigger + sweeper; walkthrough verified / `END_OUTSIDE_DROP` | — | **PASS** |
| P0-11 | Admin review with note, audited | `admin_review_trip` `0001:427-448`; `ReviewPanel.tsx`, `useConsoleTrip.ts:513` | pgTAP `02` FORBIDDEN/NOTE_REQUIRED/TRIP_NOT_IN_REVIEW, "decided twice"; `ReviewPanel.test.tsx` (11); walkthrough step 11 (`approved@a0000000`, note stored, 2nd approve 400) | — | **PASS**, but admin bypass exists (B2) |
| P0-12 | Driver history & stats from server | `useDriverTrips.ts`, `app/(driver)/history.tsx`, `profile.tsx`, `ProfileStatsCard.tsx` | `HistoryList.test.tsx`, `historyState.test.ts`, `profile.test.tsx`, `TripSummaryPanel.test.tsx`; walkthrough step 10 (`driver-A-view.json`: 1 trip, 5,974 m) | Screens not rendered on a device (NHE) | **PARTIAL** |
| P0-13 | No editable experience | RLS `0001:205-264`; client write paths (8, none to trips/stats) | pgTAP `01` (46); `rls-attacks.md` driver rows A1–A28 all blocked | — | **PASS for drivers**; admin gap B2 |
| P1-1 | Replay slider | `ReplayBar.tsx`, `replayState.ts` | `replayState.test.ts` (23) | — | **PASS** |
| P1-2 | Reverse-geocoded addresses | proxy supports `reverse`, app never calls it | — | — | **NOT BUILT** |
| P1-3 | Push on assign/verify | none | — | — | **NOT BUILT** |
| P1-4 | ta/kn/hi | stubs only | `i18n.test.ts` (key parity) | — | **FAIL** (M8) |
| P1-5 | Owner read-only console | owner → "coming soon" | `routing.test.ts` | — | **NOT BUILT** |

### Part 2 — Screens (docs/12)
Design refs: `SCREENS/` holds Stitch exports for S2, S3 and D1–D8 only. `design/<id>.png` doesn't exist (R1 not done). The comparison below is structural. Driver screens can't render on web (S4 gate) and no device was available, so D-screen design match is NOT VERIFIABLE here.

| ID | Route | Status | i18n | docs/12 states: missing | Tests | Design / screenshot |
|---|---|---|---|---|---|---|
| S1 | `app/index.tsx` | real | ✓ `splash.*` | — | `splash.test.tsx` (7) | no ref |
| S2 | `app/(auth)/sign-in.tsx` | real | ✓ (`PhoneInput` label hard-coded) | — (invalid, unregistered, rate-limited present) | `schemas.test.ts`, `errors.test.ts` | ✓ structure matches doc-12 prompt; Stitch extras correctly dropped (ND-18) · `01` |
| S3 | `app/(auth)/verify.tsx` | real | ✓ | — (wrong, expired, countdown) | `errors.test.ts` | `02` |
| S4 | `app/access-notice.tsx` | real | ✓ 3 variants + noProfile | — | `routing.test.ts` | `00` |
| D1 | `app/(onboarding)/permissions.tsx` | real | ✓ | — | `permissions.test.ts` (logic only) | NV (device) |
| D2 | `app/(onboarding)/battery.tsx` | real | ✓ | reminder banner outside D2 not rendered (known) | `battery.test.ts` | NV |
| D3 | `app/(driver)/index.tsx` | real | ✓ | — | none for the screen | NV |
| D4 | `app/(driver)/trips/[id].tsx` | real | ✓ | "Outside pickup" is inline, not a sheet (m15) | `startState.test.ts` | NV |
| D5 | `app/(driver)/trips/[id]/live.tsx` | real | ✓ | — | `LiveTripSheet.test.tsx`, `liveState.test.ts` | NV |
| D6 | `app/(driver)/trips/[id]/summary.tsx` | real | ✓ | — | `TripSummaryPanel.test.tsx`, `summaryState.test.ts` | NV |
| D7 | `app/(driver)/history.tsx` | real | ✓ | — | `HistoryList.test.tsx`, `historyState.test.ts` | NV |
| D8 | `app/(driver)/profile.tsx` | real | ✓ | help destination (m14) | `profile.test.tsx`, `health.test.ts` | NV |
| C1 | `app/(console)/index.tsx` | real | ✓ | map not rendered (no key) | `LiveTripList.test.tsx`, `liveState.test.ts` | `03`, `07` |
| C2 | `app/(console)/loads/index.tsx` | real | ✓ | — | `loads/schemas.test.ts` | `15` |
| C3 | `app/(console)/loads/new.tsx` | real | ✓ | autosuggest/planned distance unproven (B6); shipper select per ND-19 | `loads/schemas.test.ts`; e2e skipped | `04` |
| C4 | `app/(console)/loads/[id].tsx` | real | ✓ | — | e2e skipped; walkthrough assign | `05`, `06` |
| C5 | `app/(console)/trips/index.tsx` | real | ✓ | CSV export (ND-19 optional); 3 defects (m1) | none for the screen | `09` |
| C6 | `app/(console)/trips/[id].tsx` | real | ✓ | live "Last update" pill (known issue) | `ReviewPanel.test.tsx`, `verificationState.test.ts`, `replayState.test.ts` | `08`, `10`, `12`, `13` |
| C7 | `app/(console)/review/index.tsx` | real | ✓ | — | `reviewState.test.ts` | `11` (nested-button error, m2) |
| C8 | `app/(console)/drivers/index.tsx` | real | ✓ | permission-health dot + SMS invite (ND-19 proposed drop); no deactivate action | `drivers/schemas.test.ts` | `14` |
| C9 | `app/(console)/vehicles/index.tsx` | real | ✓ | — | `vehicles/schemas.test.ts` | `16` |
| Overlays | End-trip sheet ✓ (`ConfirmSheet`), Outside-pickup (inline, m15), tracking-problem banner ✓ on D5; on D3/D4 permission loss is handled by the launch gate redirecting to D1 (`useProfile` → `decideRoute`), not by a banner (PARTIAL), Add Driver drawer ✓, Add Vehicle modal ✓, Language sheet ✓ (offers TODO locales, M8) | | | | | |

App-wide greps (full clone):
- `PlaceholderScreen`: defined but **not used by any route** ✅.
- "coming soon": only the S4 owner/shipper variant (by design) ✅.
- TODO/FIXME in shipped code: none, apart from the i18n stub values (M8).
- Non-Mappls maps: **none** ✅.
- Demo data reachable in release: `/dev/kitchen-sink`, `/dev/tracking`, `/dev/map` (M7).

### Part 3 — Tracking engine and verification
**3.1 TRD §4 walk-through**

| Item | Where | Test | Status |
|---|---|---|---|
| IDLE→TRACKING (RPC first, then task) | `stateMachine.ts` | "startTrip persists TRACKING and starts the task only after the RPC agrees", "never starts the location task when the RPC fails" | PASS |
| TRACKING→ENDING→ENDED / ENDED_PENDING_SYNC→ENDED | `stateMachine.ts` reduce | 7 reducer tests incl. "returns the same object for an event that does not apply" | PASS |
| Persistence across kill/restart | `db.ts` `trip_state`; `resumeOnLaunch` via `useAuthBootstrap` | "resumeOnLaunch restarts the task and flushes after a kill" (in-memory store) | PASS (logic) / NHE (device) |
| seq never reused | `db.ts` `next_seq` in exclusive txn | "memory store never reuses a seq after a crash" | PASS (in-memory; real SQLite untested, m7) |
| SQLite-first queue | task writes only to store (`task.ts:61-79`) | `queue.test.ts` | PASS |
| Uploader 200 rows / 30 s / backoff with jitter | `config.ts` (`UPLOAD_BATCH_SIZE 200`, `UPLOAD_INTERVAL_MS 30000`, 5 s–5 min) | "uploads 200-row batches every 30 s", `computeBackoff` ×4, scheduler ×3 | PASS |
| Upload path | `service.ts:105` upsert `onConflict trip_id,seq, ignoreDuplicates` | "flush is idempotent"; walkthrough re-send 201 | PASS |
| Rejected rows (ND-8) | client quarantine (`uploader.ts`); no `upload_points` RPC | "falls back to one row at a time… parks only the bad row"; `rls-attacks.md` A21 (whole batch 403 server-side) | PASS (client-side design) |
| Stationary heartbeat (ND-6) | `DISTANCE_INTERVAL_M = 0`, `HEARTBEAT_MS = 5 min` < 15 min | "keeps the parked heartbeat under the verifier's gap threshold" | PASS (logic) / NHE (battery) |
| `showsBackgroundLocationIndicator`, FGS notification text | `config.ts` `TRACKING_OPTIONS` | "keeps the foreground service alive and identifiable" | PASS (config) / NHE (device) |
| Task at module top level, imported first | `task.ts:41`; `app/_layout.tsx:6` | none (no task test, m7) | PASS (inspection) |
| No network I/O in the task | `task.ts` imports only store/queue/config | inspection | PASS |

**3.2 docs/08 rules** (SQL in `0001`; English text matches docs/08 §3 **verbatim** in `src/i18n/en.json:520-531`; ta/kn/hi are `TODO:` stubs for every code)

| Code | SQL | `app_settings` key | pgTAP | Status |
|---|---|---|---|---|
| START_OUTSIDE_PICKUP | `0001:315` (+ hard block `:385`) | load `pickup_radius_m` (default 500) | `03` sole-reason case | PASS |
| END_OUTSIDE_DROP | `:316` | load `drop_radius_m` | `03` | PASS (walkthrough: 797 m) |
| MOCK_LOCATION | `:317` | `max_mocked_points` 0 | `03` | PASS |
| TRACKING_GAP | `:318` | `max_gap_minutes` 15 | `03` | PASS |
| LOW_COVERAGE | `:319` | `min_points_per_hour` 60 | `03` | PASS |
| MISSING_POINTS | `:320` | `unsynced_grace_hours` 6 (sweeper) | `03`, `04` sweeper | PASS (m5 caveat) |
| SPEED_IMPLAUSIBLE | `:321` | `max_avg_speed_kmh` 80 | `03` | PASS |
| GPS_JUMPS | `:322` | **none: literal 5** | `03` | PARTIAL (m4) |
| DISTANCE_TOO_SHORT | `:325` | `min_planned_ratio` 0.8 | `03` | PASS |
| DISTANCE_TOO_LONG | `:326` | `max_planned_ratio` 1.6 | `03` | PASS |
| Distance calc (≤ 50 m accuracy, geodesic, drop > 150 km/h) | `:283-301` | `max_point_accuracy_m`, `max_segment_speed_kmh` | `03` | PASS (walkthrough 5,974 m vs 6,000 m, −0.4 %) |

**3.3 Official km:** the client has 8 write paths (`useConsoleTrip.ts:513`, `useLoads.ts:377`, `consent.ts:34`, `useTrips.ts:233`, `useVehicles.ts:80`, `service.ts:55,78,105`) and none writes distance or stats. D5 labels its km "approx." (`liveState.approxDistanceM`), and every displayed official number reads `trips.tracked_distance_m` or `driver_stats`. **PASS** (m1(b) is a labelling issue on C5).

### Part 4 — Security and privacy
| Check | Result | Evidence | Status |
|---|---|---|---|
| 4.1 RLS attacks over REST | 44/45 as expected; A29 admin direct update **allowed**; U2 self-signup creates an active driver | `rls-attacks.md` | FAIL (B2, M4) |
| 4.2 RLS on every table + policy tests | 9/9 tables RLS on; 20 policies; each table exercised both ways in `01_rls_policies.test.sql` | `17-rls-tables.log`, `17-rls-policies.log` | PASS |
| 4.3 Secrets | Git history (27 commits + remote refs): 5 pattern hits, all false positives (docs, test fixtures, `Deno.env.get`). Only `.env.example` files committed (empty values). Client reads only `EXPO_PUBLIC_*` (+ `NODE_ENV`). Web bundle: production export fails, so the dev bundle was scanned: 0 JWTs/secrets; `sb_secret_`/`service_role` hits are supabase-js library strings | `19-secrets-git.log`, `19-secrets-bundle.log` | PASS (prod bundle NOT VERIFIABLE, B1) |
| 4.4 Release manifest/plist | Cleartext: main manifest has no `usesCleartextTraffic` (default false at targetSdk ≥ 28; `true` only in debug/debugOptimized) ✓. `allowBackup=true` ✗. Extra permissions ✗. FGS type `location` via expo-location lib manifest ✓. `POST_NOTIFICATIONS` via expo-notifications lib manifest ✓. iOS `UIBackgroundModes` includes `fetch` ✗. `NSLocationWhenInUse` / `AlwaysAndWhenInUse` match docs/09 §3 verbatim ✓. `NSLocationAlways` default ✗. Final plist NV | `13-AndroidManifest.production.xml`, `12-expo-config-introspect.json` | FAIL (M3, M11) |
| 4.5 Threat model | see table below | | PARTIAL |
| 4.6 DPDP | Disclosure card precedes OS prompts ✓ (`permissions.tsx:26-30,139`). Consent recorded only at Continue, after the grants; failure ignored ✗. Server doesn't require consent ✗. `CONSENT_VERSION = "2026-09-27.1"` has no privacy-policy version to match (no policy on main) ✗. Tracking only between Start/End ✓ (task ignores non-TRACKING state `task.ts:59`; `endTrip` stops updates, tested). Retention job ✗. Erasure ✗. Sentry PII scrubbing n/a (no Sentry) ✗ | code refs | FAIL (B3, B4) |
| 4.7 Config fail-closed | No blocking screen; falls back to localhost; no test | `src/lib/config.ts:66-85`, `supabase.ts:97-116` | FAIL (M2) |

Threat model (docs/09 §5):

| Threat | Control present | Test | Status |
|---|---|---|---|
| Fake GPS | `is_mocked` → `MOCK_LOCATION` | pgTAP `03`; `queue.test.ts` "carries the Android mocked flag" | PASS (device NHE) |
| Replay of old points | RLS window `0001:244-252` + unique `(trip_id, seq)` | pgTAP `01`; `rls-attacks.md` A19/A20 | PASS |
| Start away from pickup | `start_trip` geofence | pgTAP `02`; walkthrough 5a | PASS |
| Editing km/experience | no driver write path | pgTAP `01`; A1–A10 | PASS for drivers; **admin path open (B2)** |
| Someone else carries phone | known limitation | — | accepted (doc) |
| Clock tampering | `received_at`, `recorded_at` bounds, `ended_at` clamp (`0001:409`) | A19/A20; pgTAP | PASS |
| Admin abuse | review note + audit ✓, **but direct `trips` writes bypass both** | A29 | FAIL (B2) |

### Part 5 — Acceptance scenarios (docs/10 §4)
There is no `docs/FIELD_TEST_SCRIPT.md` or results table on main, so every device/field column is empty.

| # | Scenario | Automated evidence | Device/field | Status |
|---|---|---|---|---|
| 1 | Normal trip → verified, km ±5 % | pgTAP `03` clean trip; walkthrough trip A verified, 5,974 / 6,000 m | none | NEEDS HUMAN EVIDENCE |
| 2 | 20 min airplane mode | `uploader.test.ts` offline → later success; walkthrough 60 s offline batch | none | NEEDS HUMAN EVIDENCE |
| 3 | End offline, reconnect 1 h → verified | pgTAP `04` A (late points trigger verify); `stateMachine.test.ts` offline end | none | NEEDS HUMAN EVIDENCE |
| 4 | Start 3 km away → blocked with distance | pgTAP `02`; walkthrough `OUTSIDE_PICKUP:2987`; `startState.test.ts` | none (UI) | PASS (server) · NHE (UI) |
| 5 | End 2 km before drop → END_OUTSIDE_DROP | pgTAP `03`; walkthrough trip B (797 m) | none | NEEDS HUMAN EVIDENCE |
| 6 | Fake GPS → MOCK_LOCATION | pgTAP `03` | none | NEEDS HUMAN EVIDENCE |
| 7 | Force-stop 30 min → TRACKING_GAP, approvable | pgTAP `03` + `02` approve | none | NEEDS HUMAN EVIDENCE |
| 8 | Never reconnects → sweeper 6 h → MISSING_POINTS | pgTAP `04` B (cron job registered + sweep) | n/a | PASS |
| 9 | Driver REST update of status → 0 rows | pgTAP `01` "…(doc 10 scenario 9)"; `rls-attacks.md` A1 `200 []`, DB unchanged | n/a | PASS |
| 10 | Two trips simultaneously → ANOTHER_TRIP_ACTIVE | pgTAP `02` (sequential) ✓; race script ✗ | n/a | **FAIL** (M5) |
| 11 | Console live ≤ 60 s | walkthrough: C1 "Updated 1 s ago", median `received_at − recorded_at` 0.0 s on localhost | none (real network, real map) | NEEDS HUMAN EVIDENCE |
| 12 | Approve flagged → verified, stats +1 once, event logged | pgTAP `02`/`04` C; walkthrough step 11 (stats 1 → 2nd approve 400 → still 1; `approved@admin`) | n/a | PASS |

### Part 6 — Release readiness
| Item | Finding | Status |
|---|---|---|
| `eas.json` profiles/channels | development, development-simulator, preview (`staging`), production (`autoIncrement`); **no channels, no `updates`/`runtimeVersion`** | FAIL |
| EAS project linked | no `extra.eas.projectId`/`owner` | FAIL |
| Version / runtime policy | `version 1.0.0`, `appVersionSource: remote`; no runtime policy | PARTIAL |
| Brand assets gate | `icon: undefined`, splash/notification icon absent; no asset gate script | FAIL |
| `vercel.json` CSP vs real Mappls web map | file absent on main; no Mappls key | FAIL / NOT VERIFIABLE |
| `docs/release/*` vs code | absent on main. Data-collection facts from code for when they are written: phone, name, precise + background location during trips, device model/OS/app version (`p_device_info`), no contacts/photos. No crash data until Sentry lands | FAIL |
| Privacy policy placeholders | no policy on main; D8 shows docs/09 disclosure text in-app | FAIL |
| APP_REVIEW_NOTES demo account | absent | NHE |
| Hosted staging (`SUPABASE_HOSTED.md`) | file absent on main; PHASE1_TASKS (27 Sep): schema not applied, phone auth disabled on `qykqflshvsldzvdpwtni` | NHE |
| Sentry test event | Sentry not integrated | FAIL → NHE after fix |

### Part 7 — Validation (business)
**7.1 End-to-end walkthrough** (local stack; `docs/validation/walkthrough/`, `20-walkthrough.log`, `walkthrough-log.json`)

| Step | Result | Workaround |
|---|---|---|
| Admin S2 → S3 (test OTP) → C1 | ✅ `01`–`03` | — |
| Create load via Mappls autosuggest (C3) | ❌ "Map search is unavailable right now" (`04`) | Loads inserted with the admin's own session via REST (same RLS path as C3); planned distance set to 6 km by hand |
| Assign driver + vehicle (C4 UI) | ✅ `05`/`06` | — |
| Driver sign-in, onboarding, consent | ⚠️ driver on web correctly gets S4 (`00`); D1/D2 need a device | Sessions via GoTrue test OTP; `record_consent` RPC called directly |
| Start inside geofence | ✅ (3 km attempt refused `OUTSIDE_PICKUP:2987`) | Simulated GPS (no emulator, §0.3 #18) |
| Points upload; console live list updates | ✅ `07` (2 live, "Updated 1 s ago"); `08` C6 live | Map canvas not rendered (no Mappls key) |
| Offline 60 s → back online | ✅ `trip_live` frozen while offline; 7-row batch flushed; re-send idempotent; 36/36 points | Offline simulated by queueing |
| End at drop → verified | ✅ `verified`, 5,974 m, no reasons | — |
| Driver sees verified km | ✅ via the D7/D8 queries with the driver's session (`driver-A-view.json`) | D6–D8 native-only |
| Admin sees it on C5/C6 | ✅ `09`, `10` (C5 defects m1) | — |
| Flagged path: end 800 m short → needs_review → approve with note → stats +1 once | ✅ `11`–`13`; reasons `["END_OUTSIDE_DROP"]` only; stats 1; 2nd approve `TRIP_NOT_IN_REVIEW`; events `started, ended, needs_review, approved@admin` | — |

**7.2 Goals and metrics** (SQL: [`docs/validation/pilot_metrics.sql`](validation/pilot_metrics.sql); dry run on local data in `21-pilot-metrics-dryrun-local.log`, so the SQL is proven to execute)

| Goal / metric | Target | How measured | Pilot value | Status |
|---|---|---|---|---|
| Track completeness | ≥ 95 % | query 1 (received/expected, gap ≤ 15 min) | — | NEEDS HUMAN EVIDENCE |
| Auto-verify of genuine trips | ≥ 80 % | query 2 | — | NEEDS HUMAN EVIDENCE |
| Driver-editable paths | 0 | pgTAP `01` + `rls-attacks.md`; query 3 stats drift | 0 driver paths ✅ (admin path open, B2) | PARTIAL |
| Median live delay | ≤ 60 s | query 4 | — | NEEDS HUMAN EVIDENCE |
| Taps per trip | ≤ 2 | field video | design implies 3 (m9) | NEEDS HUMAN EVIDENCE |
| Crash-free sessions | ≥ 99 % | Sentry | not measurable (B4) | FAIL |
| Drivers with ≥ 3 verified in 30 days | ≥ 70 % | query 7 | — | NEEDS HUMAN EVIDENCE |

**7.3 docs/01 §6 definition of done**
| Criterion | Status |
|---|---|
| 10 pilot trips, ≥ 8 auto-verified, readable reason on every flag | NEEDS HUMAN EVIDENCE (no pilot data). Readable reasons ✅ in English (C6 `12` png); ✗ in ta/kn/hi |
| No driver-editable path (RLS tests) | ✅ (pgTAP `01`, `rls-attacks.md`) |
| Android on Play internal testing | ✗ / NHE |
| iOS on TestFlight (or ND-3 deferral) | ✗ / NHE (ND-3 open) |
| Console on a public URL behind login | ✗ (B1: export fails) |
| Privacy policy published | ✗ |
| Consent screen shipped | ⚠️ D1 exists; consent-write bug (B3) |

**7.4 Decisions and sign-offs** (PHASE1_TASKS §2 on main; ND-25/26 exist only on the local line)

| ND | Status on main | Affects correctness/legality? |
|---|---|---|
| ND-1 pre-flight restructure | **open** | no |
| ND-2 Mappls credentials | **open** | yes → B6 |
| ND-3 iOS / Apple account | **open** | DoD |
| ND-4 Supabase envs | decided (M4, 27 Sep) | — |
| ND-5 client sign-offs (RN + Mappls, registration, retention, multi-drop) | **open** | **yes → B8** |
| ND-6 stationary trucks | decided in code (M8, 27 Sep); doc wording pending | no |
| ND-7 older SDK fallback | moot (SDK 57 pinned) | no |
| ND-8 poison batch | decided in code (M8, 27 Sep, client quarantine) | no |
| ND-9 folder layout | proposed, not approved | no |
| ND-10 web audience | proposed, not approved | no |
| ND-11 Sentry DSN/token | **open** (no Sentry) | yes → B4 |
| ND-12 unregistered numbers | partly (app side only) | yes → M4 |
| ND-13 admin bypass | **open** (confirmed by A29) | **yes → B2** |
| ND-14 trips realtime | decided (0003, 28 Sep) | — |
| ND-15 live-delay target | proposed | no |
| ND-16/17/18 icons, palette, Stitch extras | proposed; applied in code | no |
| ND-19 C3/C5/C8/C9 extras | proposed | no |
| ND-20 load status derivation | proposed; applied in code | no |
| ND-21 fixes migration | **open** | yes (m4, m6, B2) |
| ND-22 P1 replay/i18n not blockers | proposed | no |
| ND-23 S1/S4 routes | applied in code | no |
| ND-24 pack/design to root | **open** | no |

Client sign-offs (RN + Mappls approval, docs/08 thresholds, retention period, pilot report): **none recorded** → B8.

---

## 7. Traceability matrix

| PRD | Code | Test | Device / pilot evidence | Status |
|---|---|---|---|---|
| P0-1 | `features/auth/*`, `app/(auth)/*`, `access-notice.tsx` | `routing.test.ts`, `errors.test.ts`, `splash.test.tsx`; `rls-attacks.md` U1/U2 | NHE (hosted SMS) | PARTIAL |
| P0-2 | `loads/new.tsx`, `features/loads/*`, `mappls-proxy` | `loads/schemas.test.ts`, Deno 43; e2e **skipped** | NHE (Mappls) | FAIL/NHE |
| P0-3 | `loads/[id].tsx`, `useTrips.ts`, unique index | pgTAP `02`; race script ✗ | — | PARTIAL |
| P0-4 | `(onboarding)/*`, `features/onboarding/*` | `permissions.test.ts`, `battery.test.ts` | NHE | PARTIAL |
| P0-5 | `start_trip`, `startState.ts` | pgTAP `02`, `startState.test.ts`, `errors.test.ts` | NHE | PASS (server) |
| P0-6 | `tracking/config.ts`, `task.ts` | `config.test.ts`, `queue.test.ts` | NHE | NHE |
| P0-7 | `tracking/{queue,db,uploader,stateMachine}.ts` | `uploader.test.ts`, `queue.test.ts`, `stateMachine.test.ts` | NHE | PASS (logic) |
| P0-8 | `(console)/index.tsx`, `useLiveTrips.ts`, `MapView.web.tsx` | `LiveTripList.test.tsx`, `liveState.test.ts` | NHE (map + network) | PARTIAL |
| P0-9 | `stateMachine.ts`, `live.tsx`, `end_trip` | `stateMachine.test.ts`, `LiveTripSheet.test.tsx` | NHE | PASS (logic) |
| P0-10 | `verify_trip`, sweeper, trigger | pgTAP `03`, `04` | walkthrough ✅; pilot NHE | PASS |
| P0-11 | `admin_review_trip`, `ReviewPanel.tsx` | pgTAP `02`/`04`, `ReviewPanel.test.tsx` | walkthrough ✅ | PASS (B2 caveat) |
| P0-12 | `useDriverTrips.ts`, `history.tsx`, `profile.tsx` | `HistoryList.test.tsx`, `profile.test.tsx`, `TripSummaryPanel.test.tsx` | NHE (device) | PARTIAL |
| P0-13 | RLS `0001:205-264` | pgTAP `01`; `rls-attacks.md` | — | PASS (drivers) / FAIL (admin, B2) |

---

## 8. What changed since the last validation run

This is the first formal validation report. The closest prior evidence is `docs/LINE_COMPARISON.md` (29 Sep 2026, untracked in the user's working tree, not on main). Its REMOTE-line numbers are **reproduced exactly** here: Jest 476/476, pgTAP 139/139, Deno 43/43, the race script failing with a raw `duplicate key`, and CI with no pgTAP/e2e job.

New in this run:
- Production web export failure (B1).
- The live RLS attack run, including the admin bypass (B2) and open self-registration (M4).
- The consent-result bug (B3c).
- Release-manifest findings (M3, M11).
- `/dev/tracking` acting on real data in release (M7).
- C5/C7 UI defects (m1, m2).
- A full local end-to-end walkthrough with screenshots.

`docs/00-repo-audit.md` rev 3 on `r0-stabilise` is a historical snapshot of the other line and was not used as evidence.
