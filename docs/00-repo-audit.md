# 00 — Repository Audit (read-only discovery)

**Date:** 26 Sep 2026 · **Folder:** `C:\Users\santh\Desktop\Namma Lorry` · **Scope:** discovery only. Apart from this file, nothing was created, changed, installed or deleted.

---

## Summary

- **There is no application code in this folder.** It has no Expo/React Native app, no Kotlin/Android project, no vanilla-JS GPS prototype, no `package.json` and no git repository.
- What it does have:
  1. The **Phase 1 documentation pack** (`namma-lorry-phase1-docs/`): CLAUDE.md/AGENTS.md, 10 numbered docs, `.env.example`, Supabase migration `0001` and a psql smoke test.
  2. **Loose duplicates** of 5 pack files at the root. All are byte-identical to the pack copies.
  3. A **`SCREENS/` folder** of Google Stitch exports: 10 mobile driver screens plus a logo, each as a PNG and a static Tailwind HTML mock, along with two DESIGN.md variants and a copy of doc 12.
- **No web-console screens have been designed yet** (0 of 9). Splash and Access Notice (mobile) are also missing.
- **Migration 0001 is well built and close to runnable.** It has three real defects to fix in a *new* migration before relying on it:
  - a clock-skew / poison-batch problem in the `trip_points` RLS
  - a stationary-truck gap problem, which is a design conflict between the 25 m distance filter and the 15-minute gap rule
  - driver registration with no path from "admin adds driver" to an `auth.users` row
- **Tooling:**
  - Ready: Node 26, npm 11, JDK 17, Android SDK (API 30–36.1, NDK 28) with adb, Docker installed.
  - Not ready: the Docker daemon is **not running**, `ANDROID_HOME` is not set, and the Expo, EAS and Supabase CLIs are not installed.
  - **This is a Windows machine with no macOS**, so iOS work can only go through EAS cloud builds plus a paid Apple account.
- **Biggest technical unknown:** `mappls-map-react-native@2.0.3` compatibility with current Expo (SDK 57 / RN 0.87). The SDK was built against RN 0.79, and its shipped Expo config plugin is **broken**: `app.plugin.js` requires a file that is not in the package.
- **Recommendation:** start a **fresh Expo app at the repo root**, promote the doc pack to the root, move the Stitch exports into `design/`, and preferably relocate the repo to a path without spaces.

---

## Repository map

```
Namma Lorry/                                  (48 files total, ~2.5 MB)
├─ 0001_phase1_schema.sql          27 KB   ← identical copy of pack migration
├─ 02-PRD.md                        8 KB   ← identical copy
├─ 03-TRD.md                        9 KB   ← identical copy
├─ 04-screen-navigation.md          6 KB   ← identical copy
├─ README.md                        3 KB   ← identical copy of pack README
├─ namma-lorry-phase1-docs/       156 KB   (17 files) — the source-of-truth doc pack
│  ├─ .env.example                         variable names only (see Environment)
│  ├─ AGENTS.md                            identical to CLAUDE.md
│  ├─ CLAUDE.md
│  ├─ DESIGN.md                            plain design brief (identical to SCREENS/design.md)
│  ├─ README.md
│  ├─ 12-screens-and-stitch-prompts.md     (note: at pack root, NOT in docs/)
│  ├─ docs/01-project-plan.md … 11-build-prompts.md   (01,02,03,04,06,07,08,09,10,11 — no 05; 05 is the SQL)
│  └─ supabase/
│     ├─ migrations/0001_phase1_schema.sql
│     └─ tests/smoke_phase1.sql            psql script, not pgTAP
└─ SCREENS/                       2.3 MB   (24 files) — Google Stitch exports
   ├─ 12_screens_and_stitch_prompts.md     identical copy of doc 12
   ├─ design.md                            identical to pack DESIGN.md
   ├─ namma_lorry/DESIGN.md                Stitch-generated tokens (YAML front-matter) + brief — DIFFERENT palette
   ├─ namma_lorry_brand_logo/{code.html (SVG), screen.png}
   ├─ 1._sign_in/ … 10._my_profile_tab/    each: code.html (11–21 KB) + screen.png (65–355 KB)
```

No `node_modules`, `.git`, build outputs, `app.json`, `package.json`, `supabase/config.toml`, `design/` or `stitch/` folders exist.

---

## Existing projects

| Project | Language / framework | Entry points | Build / run | Dependency files |
|---|---|---|---|---|
| Doc pack (`namma-lorry-phase1-docs/`) | Markdown + SQL (Postgres 15 / PostGIS / pg_cron) | `CLAUDE.md`, `README.md` | `psql -f` for the smoke test; `supabase db reset` once a Supabase project exists | none |
| Stitch mocks (`SCREENS/`) | Static HTML with Tailwind via CDN (`cdn.tailwindcss.com`), Google Fonts (Noto Sans, Material Symbols **Outlined**), inline click-handler JS | each `code.html` | open in a browser | none |
| Expo / React Native app | **does not exist** | — | — | — |
| Kotlin / Android app | **does not exist** | — | — | — |
| Vanilla-JS GPS prototype | **does not exist** | — | — | — |

---

## Docs summary

| File | Summary |
|---|---|
| **README.md** | Index of the pack, with instructions to copy it into the repo root so CLAUDE.md, docs/ and supabase/ sit at the top level. Lists the client inputs still needed before release: privacy policy, sign-off on thresholds, brand assets, Play background-location declaration, pilot list. |
| **CLAUDE.md / AGENTS.md** (identical) | Stack is locked: Expo + TypeScript strict + Expo Router, EAS dev builds, **Mappls only**, expo-location/task-manager/sqlite, Supabase, TanStack Query, Zustand, react-hook-form + zod. It sets 10 hard rules (the server computes all verification; status changes only via RPC; idempotent `(trip_id, seq)`; SQLite-first queue; top-level task; secrets kept in Edge Functions; split `.native`/`.web` map; web is console only; RLS in every migration; i18n). It also gives the folder layout, commands and definition of done. |
| **DESIGN.md** (pack) | Short design brief. Colours: Ink Navy #0F2A44 and Highway Amber #F5A300, plus status colours. Noto Sans, 8 px grid, 48 px minimum touch target, Material Symbols **Rounded**, status chips and map style. Also fixes the sample data (Murugan S, TN 23 BK 4521, NL-2026-000142/143). |
| **01-project-plan** | 7-week plan starting **Mon 28 Sep 2026**: W0 setup plus a Mappls spike on Android, iOS and web; W6 field test and release. Includes an accounts/costs checklist and a risk register (Mappls native config, OEM battery killers, store reviews, spoofing, and an earlier client spec of Kotlin + OSM). |
| **02-PRD** | Problem, goals (≥95 % complete tracks, ≥80 % auto-verify, zero driver-editable data, ≤60 s live delay, ≤2 taps), non-goals, personas and user stories. P0-1…P0-13 have acceptance criteria. Also lists P1/P2 items, success metrics and **6 open client questions**, 3 of which are blocking before W1. |
| **03-TRD** | Architecture diagram and stack table. Repo structure (differs slightly from CLAUDE.md). Tracking engine: state machine, `TRACKING_OPTIONS` of 10 s / 25 m BestForNavigation with a foreground service, SQLite `point_queue` schema, and an uploader that batches 200 rows every 30 s with backoff. Also covers the map abstraction `AppMapProps`, backend tables/RPCs/trigger/cron, the `mappls-proxy` function, realtime, NFRs and environments. |
| **04-screen-navigation** | Expo Router route tree (auth / onboarding / driver / console groups), root routing flowchart, driver trip flow and per-screen specs for A1–A2, O1–O2, D1–D6 and C1–C10. |
| **06-api-contracts** | Exact `supabase.rpc` signatures and error codes for `start_trip`, `end_trip` and `admin_review_trip`, including the order of client calls. Also: table access patterns via RLS, the point row shape, the realtime subscription, `mappls-proxy` actions and normalised responses, and the status-label mapping. |
| **07-apis-and-services** | Services to use, mostly free (Mappls SDKs/APIs, expo-*, Supabase, Sentry, Vercel/Netlify, GitHub Actions). Unavoidable paid items: Apple $99/yr, Play $25, SMS with DLT. Services to avoid: OSM/Google/Mapbox tiles, `react-native-maps`, Transistor BG-geo, Mappls InTouch. Key-handling table. |
| **08-verification-rules** | Official km = PostGIS geodesic sum, dropping points with accuracy > 50 m and segments > 150 km/h. Defines **10 reason codes** with thresholds held in `app_settings`, when verification runs (end_trip, trigger, 6 h sweeper) and admin review guidance. Needs client sign-off. |
| **09-security-privacy-compliance** | DPDP Act measures (consent recorded through migration `0002` + `record_consent` RPC), Play background-location declaration and video, iOS purpose strings, application security controls, anti-fraud threat model and the privacy-policy outline. |
| **10-test-plan** | Automated layers (pgTAP, Jest/RNTL, Playwright, optional Maestro), emulator GPX routes, field-test device matrix (Xiaomi/Vivo/Samsung/Realme/iPhone) and **12 acceptance scenarios**. |
| **11-build-prompts** | Copy-paste prompts per milestone: 0.1 scaffold, 0.2 Mappls spike (a custom `plugins/withMappls.ts` if needed), 1.1 Supabase + pgTAP + types, 1.2 auth/routing, then W2–W6. |
| **12-screens-and-stitch-prompts** | **Supersedes doc 04's screen list.** Final count is 21 screens + 6 overlays; Review Decision is merged into C6 Trip Detail & Review. Renumbers everything (S1–S4, D1–D8, C1–C9). Contains Stitch prompts per screen and says Stitch exports are a *visual reference, not code*. Says to save the chosen designs in `design/` and put tokens in `src/theme/tokens.ts`. |
| **SCREENS/namma_lorry/DESIGN.md** | Stitch's generated Material-3 token set (surface/primary/secondary containers, type scale, radii, spacing) prepended to the same brief. Its palette **does not match** the brief exactly (see Doc contradictions). |
| **supabase/tests/smoke_phase1.sql** | psql script that seeds an admin, a driver, a vehicle and loads, then plays scenario A (clean Chennai→Vellore → verified) and scenario B (mocked point + late upload → needs_review → admin approves). It also checks the RLS denials. |

**Design images (`SCREENS/*/screen.png`):**
1. Sign in
2. Verify OTP
3. Location Permission
4. Battery Setup
5. My Trips home
6. Trip Detail & Start
7. Active Trip
8. Trip Summary (verified variant)
9. Trip History
10. My Profile

There is also a brand logo (SVG wordmark). **Not yet designed:** S1 Splash, S4 Access Notice, all state variants and overlays, and all 9 console screens (C1–C9).

---

## Prototype feature inventory

**No prototype exists.** Nothing implements GPS capture, sampling, distance formulas, jitter filtering, storage or backend calls. The only JavaScript in the folder is UI click handlers inside the Stitch HTML mocks: keypad, language drawer, buttons toggling classes. It has no `navigator.geolocation`, `localStorage` or `fetch`.

What the Stitch mocks are worth:
- **Reusable as visual spec:** layout, hierarchy, copy for the core flows, the logo SVG, and the Tailwind config colour values.
- **Not reusable as code.** Doc 12 §3 says so explicitly: the real app is React Native.
- **Scope creep and wrong copy baked into the mocks.** None of the following may be carried into the build:
  - **Features that are not in the PRD:** FASTag balance and "Fleet SOS" tiles, "Active corridor" map card, shipper star ratings (4.92), e-Way Bill & Gate Pass match, "Driver Tier 1 Certified", POD Signed / Settlement Done / diesel litres / toll-receipt re-upload in History.
  - **Unverifiable claims:** "AIS-140 GPS", "Government of India Logistics Registry Compliant", "Compliant with Highway Transport Board standards", "Protected by Namma Fleet Safety Network", a made-up support phone number.
  - **Wrong titles:** "Live Trip Navigation" (turn-by-turn is a **non-goal**).
  - **Wrong disclosure copy:** the permission screen says location "unlocks priority loads and verified payouts". This contradicts the DPDP purpose notice in doc 09, whose wording must be used instead.
  - **Maps and branding:** map placeholders show **Google Maps** imagery (watermark visible). Fine as a placeholder, but the real map must be Mappls. The logo wordmark is clipped to "Namma Lorr" in several headers.
  - **Data mismatches:** the Profile mock shows an unmasked phone number, "Since Oct 2024" and a second vehicle plate "KA 01 AK 9841".

---

## Supabase state

| Item | State |
|---|---|
| Local project initialised (`supabase/config.toml`) | **No.** Only `migrations/` and `tests/` exist inside the doc pack. |
| Supabase CLI | Not installed (`supabase` not on PATH; latest on npm is 2.118.0, runnable via `npx supabase`). |
| Docker (required by `supabase start`) | Docker 29.7.2 installed, but the **daemon is not running**. |
| Edge functions | None (`mappls-proxy` is specified in docs 03/06 but not written). |
| Tests | `smoke_phase1.sql` is a psql script (uses `\set`, `\echo`, `\g /dev/null`), **not pgTAP**, so `supabase test db` won't run it. Doc 11 prompt 1.1 already plans the conversion. |
| Remote projects (staging/prod) | Unknown; none referenced. |

### Is migration 0001 applicable as-is?

**It will very likely apply cleanly on local Supabase.** This was reviewed by reading, not by running it. What looks right:
- extensions in `extensions` schema, qualified PostGIS calls in generated columns
- `search_path` set on SECURITY DEFINER functions
- RLS enabled on every table
- grants revoked on internal functions
- `trip_live` added to the realtime publication
- pg_cron scheduling

It is **not ready to rely on for the pilot**. These issues should become migration `0002+`:

1. **Poison batch and clock skew (high).** The `points_driver_insert` policy rejects rows with `recorded_at` more than 2 minutes ahead of the server or more than 1 minute before `started_at` (a server timestamp). RLS WITH CHECK failure aborts the **whole** insert statement, so one bad row fails the entire 200-row upsert. With the uploader design in doc 03, the queue then retries the same batch forever. A phone clock that is a few minutes fast would therefore block **all** uploads for that trip. **Fix:** tolerate or measure skew per batch, move point uploads into an RPC that filters invalid rows instead of erroring, or have the uploader quarantine rejected rows.
2. **Stationary trucks flagged (high, design conflict).** Tracking uses `distanceInterval: 25` m. A truck parked for loading, a tea break or a traffic jam emits no points. The 15-minute `TRACKING_GAP` and the `LOW_COVERAGE` (60/h) rules then fire on perfectly genuine trips, which undermines the ≥80 % auto-verify goal. Fix one of two ways:
   - keep a periodic heartbeat point while stationary (e.g. `distanceInterval: 0` with a time interval, filtered client-side), or
   - count only moving-time gaps and exclude stationary spans (same position before and after the gap).
3. **Driver registration path (high).** `profiles.id` references `auth.users`, and `handle_new_user` makes **any** OTP sign-in a driver. Consequences:
   - The PRD's "unknown numbers see 'Contact Namma Lorry to register'" is not enforced.
   - C8/C9 "Add driver" cannot insert a profile without first creating an auth user, which needs the service role.
   - **Needed:** `signInWithOtp({ shouldCreateUser: false })`, and an admin-only Edge Function to create the auth user and profile. That function is missing from docs 06/07.
4. **Admin can bypass RPCs (medium).** `trips_admin` is `for all`, so an admin client can directly `update trips set status='verified', tracked_distance_m=…` without `apply_verified_stats` or an audit event. This contradicts CLAUDE.md hard rule 2. Restrict admin to `select, insert` (assign) plus a `cancel_trip` RPC.
5. **Minor:**
   - `GPS_JUMPS` threshold is hard-coded `> 5`, not in `app_settings`.
   - `admin_review_trip` on a missing trip returns null instead of raising `TRIP_NOT_FOUND`.
   - The trigger does a `count(*)` per inserted row after the trip ends, which is O(n²) for large late uploads. Acceptable at pilot scale.
   - `trips` is not in the realtime publication, so D6 Trip Summary "Verifying → Verified" must poll or needs `trips` published.
   - No `cancel_trip` RPC exists, and the `cancelled` status is unreachable except by direct admin update.
   - `setting()` has no fixed `search_path`, which the Supabase linter will warn about.
   - The smoke test's `\g /dev/null` fails in psql on Windows.
6. **Planned additions already documented:** `0002_consent.sql` (doc 09/11).

---

## Environment & tooling

| Tool | Found | Notes |
|---|---|---|
| OS | Windows 11 Home 10.0.26200 | **No macOS → no Xcode / iOS simulator / local iOS builds** |
| Node | v26.8.1 | Newer than current LTS (24). Expo officially targets LTS; verify SDK 57 support or pin 24 LTS via nvm-windows/Volta. |
| npm / pnpm | 11.14.1 / 9.15.9 | yarn, bun: not installed |
| Java | OpenJDK 17.0.20 (Microsoft), `JAVA_HOME` set | Correct for RN Android builds |
| Android SDK | `%LOCALAPPDATA%\Android\Sdk`: platforms 30–36.1, build-tools 34–36.1, NDK 28.2, emulator, cmdline-tools | **`ANDROID_HOME` not set**; adb 1.0.41 available |
| Gradle | not on PATH | Fine; the RN wrapper provides it |
| Docker | 29.7.2 | **Daemon not running** |
| git | 2.55 | **Folder is not a git repo** |
| expo / eas / supabase CLIs | not installed | Latest on npm: expo 57.0.25 (RN 0.87.1), eas-cli 24.8.0, supabase 2.118.0 |
| Python | 3.14.7 | not needed |
| Windows long paths | `LongPathsEnabled = 1` | Good |
| Path | `C:\Users\santh\Desktop\Namma Lorry`, **contains a space** and sits under Desktop (often OneDrive-synced) | Space-containing paths are a known source of Gradle/CMake/NDK failures on Windows (New Architecture compiles C++). Relocating is recommended. |

**.env files:** none present. The only file is `namma-lorry-phase1-docs/.env.example`, with these names:
- Public (app bundle): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY`, `EXPO_PUBLIC_APP_ENV`
- Server-only (Edge Function secrets): `MAPPLS_CLIENT_ID`, `MAPPLS_CLIENT_SECRET`, `MAPPLS_REST_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SENTRY_DSN`

**Git:** no repository, no branches, no commits.

**Mappls RN SDK** (`mappls-map-react-native@2.0.3`, published Jul 2026; inspected from the npm tarball in a temp dir, since deleted):
- has a `codegenConfig` and a `newArchEnabled` gradle path (New Architecture awareness)
- dev-dependency is RN **0.79.4**; current Expo SDK 57 ships RN **0.87**
- ships `app.plugin.js` → `require('./plugin/build/withMappls')`, but **`plugin/build/` is not in the package**, so adding it to `app.json` plugins will crash prebuild. A local config plugin (doc 11 prompt 0.2 already anticipates `plugins/withMappls.ts`) is required.

---

## Gap analysis (reuse / conflict / missing)

### Reuse
- The entire doc pack: CLAUDE.md, docs 01–12 and `.env.example`. It is the agreed source of truth.
- `0001_phase1_schema.sql` as the base migration, with the fixes above in `0002+`.
- `smoke_phase1.sql` scenarios as the seed for pgTAP tests.
- The design brief (DESIGN.md) → `src/theme/tokens.ts`.
- Stitch PNGs for the 10 driver screens as a visual reference, once the scope-creep elements listed above are stripped.
- The logo SVG, pending a proper 1024×1024 icon and splash.

### Conflicts
- **No Kotlin, OSM, other map SDK or localStorage code exists.** The risk of the client's earlier Kotlin + OSM spec is contractual only (PRD open question). The build itself has no conflict.
- The Stitch mocks conflict with PRD scope and doc 09 disclosure copy (see Prototype feature inventory), and use Google map imagery as placeholders.
- The Stitch token file (`SCREENS/namma_lorry/DESIGN.md`) conflicts with the brief's palette and icon style.
- The screen-numbering and route tree in docs 04/03/11 are out of date against doc 12.

### Missing entirely
- The Expo app: `package.json`, `app.json`/`app.config.ts`, `eas.json`, `tsconfig`, lint and prettier config, `app/` routes, all of `src/`.
- `plugins/withMappls.ts` (the Expo config plugin for Mappls: Android maven repo, iOS `.olf`/`.conf` files).
- `supabase/config.toml`, `supabase/functions/mappls-proxy`, a driver-registration Edge Function, `0002_consent.sql`, pgTAP tests, `seed.sql`.
- `src/lib/database.types.ts` (generated).
- CI (`.github/workflows`), Sentry setup, i18n files.
- Designs for the 9 console screens, Splash and Access Notice.
- Client inputs:
  - written sign-off on RN + Mappls
  - answers to PRD §8 questions
  - sign-off on the doc 08 thresholds
  - privacy policy URL
  - app icon and splash
  - pilot driver list
- **Accounts and keys: nothing exists yet.** No Mappls key, Supabase project, Expo account, Apple or Play account, or Sentry DSN.

---

## Doc contradictions

1. **Three screen-numbering schemes.**
   - Doc 04: A1–A2, O1–O2, D1–D6, C1–C10.
   - Doc 12 (supersedes 04): S1–S4, D1–D8, C1–C9. For example, *D1* means "My Trips" in 04 but "Location Permission" in 12, and *C8/C9/C10* shift.
   - `SCREENS/` folders: 1–10.
   - Doc 11's build prompts still use doc 04 IDs ("C2–C4, C9, C10", "D1–D3", "C7/C8").
2. **Route tree is stale against doc 12.** Doc 04 and the TRD still have `review/[id].tsx` (merged into C6 per doc 12) and have no routes for S1 Splash or S4 Access Notice.
3. **Folder layout differs.**
   - CLAUDE.md puts `tracking` under `src/features/` *and* has `src/tracking/`, and puts `config.ts` in `src/lib/`.
   - The TRD has `src/tracking/config.ts` and adds `src/lib/geo.ts` and `sentry.ts`.
   - Doc 12 adds `src/theme/tokens.ts`, and doc 11 adds `plugins/withMappls.ts`. Neither appears in either layout.
4. **Two design-token sets.**
   - Primary: brief #0F2A44 vs Stitch `primary` #00152a (#0F2A44 is only `primary-container`).
   - Accent: #F5A300 vs Stitch `secondary` #825500 / `secondary-container` #feaa11.
   - Background: #F6F7F9 vs #f8f9ff.
   - Error: #D93025 vs #ba1a1a.
   - Icons: brief says Material Symbols **Rounded**, exports use **Outlined**.
5. **File locations don't match.** Doc 12 references `stitch/DESIGN.md` and a `design/` folder; neither exists. The pack README places doc 12 in the file table implicitly under `docs/`, but it sits at the pack root.
6. **Web audience.** CLAUDE.md says "Web is a console (admin / owner / shipper)". PRD/doc 04 say the console is **admin-only** in Phase 1, and owners/shippers see "Coming soon".
7. **`SENTRY_DSN` placement.** `.env.example` lists it as server-only, but `@sentry/react-native` needs the DSN in the app bundle (`EXPO_PUBLIC_SENTRY_DSN`). A build-time `SENTRY_AUTH_TOKEN` for source maps is also not listed.
8. **Sampling vs verification.** 25 m distance sampling (doc 03) cannot satisfy "gap ≤ 15 min" and "≥ 60 points/h" (doc 08) while the truck is stationary (see Supabase issue 2).
9. **Unregistered numbers.** The PRD says unknown numbers are refused. The schema auto-creates a driver profile for any OTP sign-in.
10. **Admin trip updates.** Hard rule 2 says status changes go only through RPCs, but RLS gives admins full `update` on `trips`.
11. **Label naming (minor).** Doc 06 driver label for `needs_review` is "Under review"; DESIGN.md's chip is "Needs review"; doc 12 uses both.
12. **W0 exit criterion needs iOS.** It requires the Mappls map "on Android, iOS and web", which is impossible on this Windows machine without an Apple Developer account and a physical iPhone (EAS cloud build + ad-hoc install).

---

## Risks & blockers

| # | Risk / blocker | Severity | Notes |
|---|---|---|---|
| 1 | **Mappls SDK vs Expo SDK 57 / RN 0.87** compatibility unproven; shipped config plugin broken | High, blocks W0 | Spike first. Fallback: pin an older Expo SDK whose RN version Mappls supports. |
| 2 | **No Mappls developer account / keys** (map SDK key + REST client id/secret) | High, blocks W0 | Also confirm the auth model (static key vs OAuth) and web-SDK domain restriction. |
| 3 | **iOS from Windows**: no Xcode; needs an Apple Developer account ($99), EAS cloud builds and a registered physical iPhone | High for the iOS part of W0 | Android and web can proceed without it. |
| 4 | **No Supabase project; Docker daemon off; CLI not installed** | Medium, blocks W1 | Start Docker Desktop; use `npx supabase`. |
| 5 | Poison-batch / clock-skew RLS behaviour | High (data loss for a trip) | Fix in 0002 before the tracking engine (W3). |
| 6 | Stationary-truck false `TRACKING_GAP` / `LOW_COVERAGE` | High (auto-verify target) | Decide the heartbeat strategy before W3. |
| 7 | Driver onboarding path undefined (auth user creation, `shouldCreateUser`) | Medium, blocks W1 auth | Needs an admin Edge Function and a client answer on self-signup. |
| 8 | Path with a space + under Desktop (possible OneDrive sync) | Medium | Gradle/CMake failures, file locks on `node_modules`. |
| 9 | Node 26 (non-LTS for Expo) | Low–Medium | Pin Node 24 LTS if tooling misbehaves. |
| 10 | `ANDROID_HOME` unset | Low | Needed for `expo run:android`. |
| 11 | EAS free-tier build quota | Low | Local Android builds are unlimited once env is fixed. |
| 12 | SMS OTP in India needs DLT registration + a paid provider | Medium for pilot | Use Supabase test numbers until then. |
| 13 | Client sign-offs outstanding (RN + Mappls in writing, "transporter" meaning, radius, retention) | High (contractual), blocks W1 per PRD | |
| 14 | Console not designed at all | Medium, blocks W2 UI polish | Can build from doc 04/12 specs without mocks. |
| 15 | Stitch mocks contain scope creep and non-compliant disclosure copy | Medium | Agents copying mocks literally would add non-PRD features. |

---

## Recommendation

**Start a fresh Expo app in this repo** rather than adapting anything, because nothing adaptable exists. Specifically:

1. **Relocate first** (recommended): move to a path without spaces, outside Desktop/OneDrive, e.g. `C:\dev\namma-lorry`.
2. **Promote the doc pack to the root**, as its README instructs: `CLAUDE.md`, `AGENTS.md`, `.env.example`, `docs/`, `supabase/`. Move `12-screens-and-stitch-prompts.md` into `docs/`.
3. **Delete the root-level duplicates.** `02/03/04*.md`, `0001_phase1_schema.sql` and `README.md` are verified byte-identical to the pack. Also delete `SCREENS/12_screens_and_stitch_prompts.md` and `SCREENS/design.md`.
4. **Move `SCREENS/` → `design/stitch/`.** Rename the folders to doc 12 IDs (e.g. `D5-active-trip/`) and add a `design/README.md` listing the out-of-scope elements to ignore.
5. `git init`, then scaffold Expo with `create-expo-app` at the root (doc 11 prompt 0.1). Then do the **Mappls spike on Android + web first**; iOS follows once an Apple account exists.
6. **Update docs before code:** reconcile the numbering (doc 04/11 → doc 12 IDs), the folder layout, the Sentry env var, and the web audience line in CLAUDE.md.

Proposed final layout:

```
namma-lorry/
├─ CLAUDE.md  AGENTS.md  README.md  .env.example  .gitignore
├─ app.config.ts  eas.json  package.json  tsconfig.json  babel.config.js  eslint.config.js
├─ plugins/withMappls.ts                     Expo config plugin (maven repo, iOS .olf/.conf)
├─ app/                                      Expo Router (routes per doc 12 screen list)
│  ├─ _layout.tsx  index.tsx (S1 splash/gate)  access-notice.tsx (S4)
│  ├─ (auth)/sign-in.tsx  verify.tsx
│  ├─ (onboarding)/permissions.tsx  battery.tsx
│  ├─ (driver)/_layout.tsx  index.tsx  history.tsx  profile.tsx  trips/[id].tsx  trips/[id]/live.tsx  trips/[id]/summary.tsx
│  └─ (console)/_layout.tsx  index.tsx  loads/{index,new,[id]}.tsx  trips/{index,[id]}.tsx  review/index.tsx  drivers/index.tsx  vehicles/index.tsx
├─ src/
│  ├─ components/{map/{types.ts,MapView.native.tsx,MapView.web.tsx},ui/}
│  ├─ features/{auth,loads,trips,review,live-map,drivers,vehicles}/
│  ├─ tracking/{task.ts,stateMachine.ts,queue.ts,uploader.ts,permissions.ts,config.ts}
│  ├─ lib/{supabase.ts,mappls.ts,db.ts,geo.ts,sentry.ts,config.ts,database.types.ts}
│  ├─ theme/tokens.ts
│  └─ i18n/{en.json,…}
├─ supabase/
│  ├─ config.toml  seed.sql
│  ├─ migrations/0001_phase1_schema.sql  0002_consent.sql  0003_tracking_fixes.sql
│  ├─ functions/{mappls-proxy,admin-create-driver}/index.ts
│  └─ tests/*.test.sql (pgTAP)   smoke_phase1.sql (kept for manual runs)
├─ design/{README.md, stitch/<doc-12-id>/{screen.png,code.html}, logo.svg}
├─ docs/00-repo-audit.md  01…12
└─ .github/workflows/ci.yml
```

---

## Questions

Only the ones that block progress:

1. **Relocation:** may I move the project to a path without spaces (e.g. `C:\dev\namma-lorry`) and restructure it as described: promote the pack, delete the verified duplicates, move `SCREENS/` → `design/stitch/`? Is the Desktop folder synced by OneDrive?
2. **Mappls access:** do you have a Mappls developer account yet? Which credentials does it give (map SDK key, REST client id/secret), and is the web SDK enabled for the key?
3. **iOS:** do you have (or will you buy) an Apple Developer account and a physical iPhone for dev builds? If not, can W0's exit criterion become Android + web only, with iOS deferred?
4. **Supabase:** local only for now (you'll start Docker Desktop), or do you already have a hosted staging project I should link to?
5. **Client sign-offs:** has the client confirmed React Native + Mappls in writing, and answered "who registers drivers — admin only or self-signup?" This decides the auth/registration design in W1.
6. **Stationary-truck gaps:** OK to change doc 03/08 so tracking emits a periodic heartbeat while stationary (or gaps are judged on moving time only)? The docs must change before W3.
7. **Expo SDK pinning:** if the Mappls spike fails on the latest Expo SDK (57), is pinning an older SDK acceptable, or must we stay on latest?
