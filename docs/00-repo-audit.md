# 00 — Repository Audit (read-only discovery)

> **Historical snapshot (27 Sep 2026).** Superseded by R0/R1. The `.npmrc` `os=win32` defect and the unpushed state described below were fixed in R0; see the PHASE1_TASKS progress log.

**Rev 3 — 27 Sep 2026** (supersedes rev 2 of 26 Sep 2026; everything below was re-verified against the folder today)
**Folder:** `C:\Users\santh\Desktop\Namma Lorry` · **Scope:** discovery only. Apart from this file, nothing was created, changed, installed or deleted. Commands run were read-only: `tsc --noEmit`, `eslint`, `jest`, `git`, `docker ps`, and version probes.

**What changed since rev 2:**
1. **The M1 scaffold now exists.** Commit `7720e50` added an Expo SDK 57 app at the repo root: Expo Router, TS strict, 21 placeholder routes, CI, EAS profiles. Rev 2's "no app code" no longer holds.
2. **That commit is not pushed.** `main` is 1 ahead of `origin/main`, so **CI has never run**.
3. **The Docker daemon is stopped.** In rev 2 it was running with Supabase up. Local Supabase is currently **down**.
4. **The Desktop folder is not OneDrive-redirected** (`[Environment]::GetFolderPath('Desktop')` = `C:\Users\santh\Desktop`). That answers half of ND-1; the space in the path remains.
5. New defects in the scaffold: `.npmrc` `os=win32` will likely break Linux CI, `expo-env.d.ts` is claimed in the log but missing, and the `APP_ENV` value names don't match between files. Details below.

---

## Summary

- **Repo state:** Phase 1 is at **M1 done, M4 about half done**. It has an Expo SDK 57 scaffold (placeholders only, no features), plus a local Supabase project with migrations 0001 and 0002 and a seed file. There are no Edge Functions, no pgTAP test files, and no Mappls.
- **Locally green, not proven in CI.** Verified today: `tsc --noEmit` is clean, ESLint shows 0 warnings, and Jest passes 3/3. The commit was never pushed, and `.npmrc` sets `os=win32`. On the `ubuntu-latest` runner, that makes npm install Windows native binaries, which will probably break ESLint's resolver (`@unrs/resolver-binding-*`) and lightningcss.
- **No prototype of any kind.** There is no vanilla-JS GPS prototype, no Kotlin, no OSM and no localStorage code. The only non-app code is the Stitch HTML mocks, which are visual-only. **Nothing to port.**
- **The doc pack is still nested; nothing is at the root.** `CLAUDE.md`, `AGENTS.md` and `docs/01–13` live only under `namma-lorry-phase1-docs/namma-lorry-phase1-docs/`, so **Claude Code does not auto-load the project rules**. The paths `docs/02-PRD.md`, `docs/03-TRD.md` and `docs/12-…` named in Prompt 0 do not exist at the root.
- **Migration 0001 still has its known defects**, applied unchanged: the poison-batch/clock-skew RLS policy, auto-registration of any OTP user, admin `for all` on `trips`, and `trips` missing from realtime. `0003_phase1_fixes.sql` has not been written.
- **Recommendation:** keep the existing root-level Expo app, since it is correct and adapting it is cheaper than starting again. First do the overdue pre-flight: promote the docs to the root, set up `design/`, fix `.npmrc`, push and get CI green. After that, spike Mappls (M3) before building any more UI.

---

## Repository map

```
Namma Lorry/                         git → github.com/santhosh2564/Namma-Lorry-V1 · main (ahead 1 of origin)
├─ package.json / package-lock.json  Expo app manifest (+ 15.5k-line lockfile)
├─ app.config.ts  eas.json  tsconfig.json  babel.config.js  eslint.config.js  jest.config.js
├─ .npmrc  (legacy-peer-deps=true, os=win32 ⚠)   .prettierrc  .prettierignore  .gitignore  .env.example
├─ .github/workflows/ci.yml          install → typecheck → lint → test (Node 24, ubuntu)
├─ app/                29 files      Expo Router: (auth) (onboarding) (driver) (console) + index, access-notice, dev/*
├─ src/                 6 files      lib/config.ts (zod env), i18n/index.ts, components/ui/PlaceholderScreen + 2 tests
├─ assets/              4 files      70-byte 1×1 placeholder PNGs (icon, adaptive-icon, splash, favicon)
├─ supabase/            8 files 74K  config.toml, migrations/0001+0002, seed.sql, tests/_helpers.psql (+ git-ignored .temp/.branches)
├─ docs/                2 files 76K  00-repo-audit.md (this), PHASE1_TASKS.md
├─ SCREENS/            25 files 2.3M Stitch exports: 10 screens + logo (code.html + screen.png each), 3 .md
├─ namma-lorry-phase1-docs/ 38 files 400K   older doc pack + .zip + nested NEWEST pack (namma-lorry-phase1-docs/)
├─ 0001_phase1_schema.sql  02-PRD.md  03-TRD.md  04-screen-navigation.md  13-claude-code-prompts.md  README.md   ← loose duplicates
├─ node_modules/   ~45.9k files 658M  (git-ignored)
├─ .expo/  (git-ignored, dev-server cache)   .freebuff/project-id  (Codebuff tool artefact; excluded via .git/info/exclude)
└─ .git/  2.6M
```

**Duplicates (byte-compared today):**
- Root `02-PRD.md`, `03-TRD.md`, `13-claude-code-prompts.md`, `0001_phase1_schema.sql` and `README.md` are identical to the pack copies.
- Root `04-screen-navigation.md` matches the **newest** pack's doc 04, not the older one.
- The two packs are identical except `README.md` and `docs/04`. The newest pack adds `docs/12`, `docs/13` and `stitch/DESIGN.md`, and its doc 04 merges C8 into C6.
- `SCREENS/12_screens_and_stitch_prompts.md` = newest `docs/12`. `SCREENS/design.md` = `stitch/DESIGN.md`.
- `SCREENS/namma_lorry/DESIGN.md` is Stitch's own token file and uses a different palette.
- Root `supabase/migrations/0001` is identical to both pack copies.

There is no `design/` folder, no `appknowledge.md`, and no build output (`dist/`, `android/`, `ios/`).

---

## Existing projects

| Project | Language / framework | Entry points | Build / run | Dependency files & key versions |
|---|---|---|---|---|
| **Expo app (root)**, M1 scaffold | TypeScript (strict, `noUncheckedIndexedAccess`), React 19.2.3, React Native **0.86.3**, Expo **SDK 57** (`expo ~57.0.25`, 57.0.27 installed), Expo Router 57 | `main: expo-router/entry` → `app/_layout.tsx` (QueryClient + SafeArea + Stack) | `npm start` (`expo start --dev-client`), `npm run android/ios/web`, `typecheck`, `lint`, `test` | `package.json` / lockfile. supabase-js 2.117, TanStack Query 5.104, zustand 5, zod 4.6, react-hook-form 7.89, i18next 26, expo-location/task-manager/sqlite/secure-store 57, reanimated 4.5.1, react-native-web 0.21. Jest 29 + jest-expo 57 + RNTL 14. ESLint 9 + eslint-config-expo. **No Mappls, no Sentry, no Playwright yet** |
| **Local Supabase** | Postgres 17 + PostGIS + pg_cron, Supabase CLI 2.118 (via npx) | `supabase/config.toml` (project_id `namma-lorry-phase1`) | `npx supabase start / db reset / test db` (needs Docker) | none |
| **Stitch mocks** | Static HTML + Tailwind CDN + small click-handler scripts | `SCREENS/*/code.html` | open in a browser | none |
| **Doc packs** | Markdown + SQL | `CLAUDE.md` in the newest pack | — | — |
| Vanilla-JS prototype / Kotlin / Android native | **Do not exist** | — | — | — |

**Scaffold detail:**
- **Routes** (all placeholders rendering `PlaceholderScreen(screenId, title, milestone)`): 21 screens from doc 12, 4 group layouts, the root layout, and `/dev/{kitchen-sink,map,tracking}`.
- **`src/lib/config.ts`** zod-validates 5 `EXPO_PUBLIC_*` vars and throws in dev when they are invalid. Every var has a default, so a missing `.env` does **not** throw; you get empty keys instead.
- **`app.config.ts`:**
  - bundle/package `com.nammalorry.app`, scheme `namma-lorry`
  - interim iOS location strings plus `UIBackgroundModes: [location]`
  - Android foreground-service config deferred to M9
  - plugins: `expo-router` and `expo-font` only
  - `extra.eas.projectId` is the all-zero placeholder UUID
- **`eas.json`:** `development` (simulator), `development_device`, `preview` (APK), `production` (AAB, autoIncrement).
- **CI:** `.github/workflows/ci.yml` runs `npm ci --legacy-peer-deps`, then typecheck, lint and jest, on Node 24. It does **not** run `supabase test db` yet.

---

## Docs summary

Canonical source: `namma-lorry-phase1-docs/namma-lorry-phase1-docs/` (the newest pack).

| File | Summary |
|---|---|
| **CLAUDE.md / AGENTS.md** (identical) | Locked stack: Expo + TS strict + Expo Router with EAS dev builds, **Mappls only**, expo-location/task-manager/sqlite, Supabase, TanStack Query + Zustand + RHF/zod. 10 hard rules: server-only verification; status changes only via RPC; `(trip_id,seq)` idempotency; SQLite-first queue; top-level task; secrets only in Edge Functions; `.native/.web` map split; web = console; RLS per migration; i18n. Also covers folder layout, commands and definition of done. **Not at repo root.** |
| **README.md** (pack) | Pack index. Says to copy the pack to the repo root. Lists the missing client inputs: privacy policy, threshold sign-off, brand assets, Play declaration video, pilot list. |
| **docs/01 project plan** | 7 weeks from **Mon 28 Sep 2026**. W0 is setup plus a Mappls spike on Android, iOS and web. Then W1 auth, W2 console loads, W3 tracking, W4 live/end, W5 verification, W6 field test and release. Includes the accounts/costs checklist and risk register. |
| **docs/02 PRD** | Goals: ≥95 % complete tracks, ≥80 % auto-verify, zero driver-editable data, ≤60 s live delay, ≤2 taps. Non-goals: public profile, owner/shipper apps, navigation, payments. **P0-1…P0-13** with acceptance criteria, P1 list, 6 open client questions (3 blocking before W1). |
| **docs/03 TRD** | Architecture, stack, repo tree. Tracking engine: state machine; `TRACKING_OPTIONS` 10 s / 25 m BestForNavigation with Android foreground service; SQLite `point_queue`; uploader 200 rows / 30 s with backoff. `AppMapProps` map abstraction. Backend tables, RPCs, trigger and pg_cron; `mappls-proxy`; realtime on `trip_live`; NFRs (≤8 %/h battery, ≤2 MB per 10 h trip). |
| **docs/04 screen navigation** (newest) | Expo Router route tree, routing flowchart, per-screen specs. C8 is merged into C6. Screen IDs are superseded by doc 12. |
| **docs/06 API contracts** | RPC signatures and error codes (`start_trip`, `end_trip`, `admin_review_trip`), RLS access table, point row shape, realtime subscription, `mappls-proxy` actions, status labels. |
| **docs/07 APIs & services** | Mappls SDKs/REST (autosuggest, geocode, distance, snap-to-road P1/P2), expo-*, Supabase, Sentry. Paid items: Apple $99, Play $25, DLT SMS. **Avoid:** OSM/Google/Mapbox tiles, `react-native-maps`, Transistor, Mappls InTouch. |
| **docs/08 verification rules** | Official km is the PostGIS geodesic distance over filtered points (drop accuracy > 50 m and segments > 150 km/h). 10 reason codes with thresholds in `app_settings`. Runs at `end_trip`, on the late-point trigger, and in a 6 h sweeper. Needs client sign-off. |
| **docs/09 security/privacy** | DPDP notice and consent (`record_consent`, done in 0002), purpose limitation, Play background-location declaration and video, iOS purpose strings, app-security controls, anti-fraud threat model, privacy-policy outline. |
| **docs/10 test plan** | pgTAP, Jest+RNTL, Playwright, optional Maestro; emulator GPX; OEM device matrix (Xiaomi, Vivo/Oppo, Samsung, Realme, iPhone); **12 acceptance scenarios**. |
| **docs/11 build prompts** | Short per-week prompts. **Superseded by doc 13.** |
| **docs/12 screens & Stitch prompts** | **Authoritative screen list:** 21 screens (S1–S4, D1–D8, C1–C9) plus 6 overlays, with use cases and Stitch prompts. Exports are visual reference only. Tokens go to `src/theme/tokens.ts`, designs go to `design/` named by screen ID. |
| **docs/13 Claude Code prompts** | Prompt 0 (this audit), Prompt 1 (plan), P2–P12 = M1–M11, P13–P15 = M12a/b/c. Prerequisites: pack at the root and PNGs in `design/`. Plan mode, `/clear` between prompts, one commit per prompt. |
| **stitch/DESIGN.md** | Brand brief: Ink Navy #0F2A44, Highway Amber #F5A300, status colours, Noto Sans, 8 px grid, 48 px targets, Material Symbols **Rounded**, sample data (Murugan S, TN 23 BK 4521, NL-2026-000142). |
| **SCREENS/namma_lorry/DESIGN.md** | Stitch-generated M3 token set. The palette **differs** from the brief (primary #00152a, secondary #825500/#feaa11). Reference only. |
| **docs/PHASE1_TASKS.md** | Master plan: decisions, ND-1…ND-24, M1–M12 checklists, screen checklist, P0 traceability, risks, progress log. M1 is ticked as done. |

**Design images** (`SCREENS/*/screen.png`, 11 total): 1 Sign in (S2), 2 Verify OTP (S3), 3 Location Permission (D1), 4 Battery Setup (D2), 5 My Trips (D3), 6 Trip Detail & Start (D4), 7 Active Trip (D5), 8 Trip Summary (D6, verified variant only), 9 Trip History (D7), 10 My Profile (D8), and the brand logo.
**Not designed:** S1 Splash, S4 Access Notice, state variants and overlays, and **all 9 console screens (C1–C9)**.

---

## Prototype feature inventory

**No prototype exists.** Nothing in the repo does GPS capture (`navigator.geolocation` or otherwise), sampling, distance calculation, jitter filtering, storage (`localStorage`/IndexedDB) or backend calls. A grep of the app, `src/` and all Stitch HTML found none of these, and found no Leaflet, OSM, Google Maps or Mapbox code. The Stitch mocks only contain UI click handlers (keypad, language drawer, class toggles) and `lh3.googleusercontent.com` placeholder images.

| Aspect | Found | Port? |
|---|---|---|
| GPS capture / interval / distance formula / filtering | none | n/a. Implement fresh per TRD §4 and doc 08 |
| Storage | none | n/a. SQLite queue per TRD §4.3 |
| UI screens | 10 Stitch mocks (HTML/Tailwind) | **Visual spec only.** Rebuild in RN with the UI kit (doc 12 §3) |
| Backend calls | none | n/a |

**Scope creep in the mocks that must not be carried over (ND-18):**
- Features: FASTag balance, Fleet SOS, shipper rating 4.92, e-Way Bill / Gate Pass, POD, settlement, diesel and toll uploads.
- Claims and labels: "Live Trip Navigation", "Driver Tier 1 Certified", AIS-140 and govt-registry claims, a made-up support number.
- Imagery and data: Google Maps imagery, an unmasked phone number, a second number plate.
- Copy: the D1 disclosure text ("unlocks priority loads and verified payouts"). The disclosure must come from doc 09.

---

## Supabase state

| Item | State (27 Sep) |
|---|---|
| Initialised | **Yes.** `supabase/config.toml` (project `namma-lorry-phase1`, PG 17, seed on, realtime/storage/studio on) |
| Running | **No.** The Docker daemon is not running (`docker ps` cannot connect). It was up during rev 2; the last CLI run was v2.118.0 |
| Auth config | `[auth.sms]` on with dummy Twilio creds (local only). `[auth.sms.test_otp]` maps 919000000001/11/12/13 → `123456`. `sms_sent = 30`/h |
| Migrations | `0001_phase1_schema.sql` (507 lines; byte-identical to the pack) and `0002_consent.sql` (consent columns + `record_consent`; clean). Rev 2 verified both as applied |
| Seed | `seed.sql`: 1 admin + 3 drivers (auth.users + identities), 3 vehicles, 4 loads on TN/KA coordinates, 1 assigned trip, `load_code_seq` bumped to 141 |
| Tests | `tests/_helpers.psql` only. **No `*.test.sql`**, and the pgTAP extension is not created, so `supabase test db` has nothing to run. `smoke_phase1.sql` exists only in the packs |
| Edge Functions | **None** (`supabase/functions/` does not exist). `mappls-proxy` and `admin-create-driver` are still to be written |
| Hosted project | None linked |
| Secrets on disk | `supabase/.temp/start-secrets/.../docker.env` holds local-stack keys (`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_INTERNAL_JWT_SECRET`, …). It is git-ignored and local-only |

**Is 0001 usable as-is?** It applies and seeds cleanly, so it works as a **base**. It is not fit to build M5–M8 on without a follow-up migration. Re-verified in the file today:
1. **`points_driver_insert` (l. 244–252)** requires `recorded_at` ≤ now()+2 min and ≥ started_at−1 min. A single bad row, for example from a phone clock running fast, fails the whole batch upsert, and the uploader then retries forever (**ND-8, high**).
2. **`handle_new_user` (l. 54)** turns **any** OTP sign-in into a driver, which contradicts PRD P0-1's "unknown numbers refused" (**ND-12, high**).
3. **`trips_admin … for all` (l. 230)** lets an admin client write `status`/`tracked_distance_m` directly, and there is no `cancel_trip` RPC (**ND-13**).
4. **Only `trip_live` is in the realtime publication (l. 507)**, but D6 needs the `trips` row (**ND-14**).
5. Minor:
   - `GPS_JUMPS > 5` is hard-coded (l. 322) instead of read from `app_settings`
   - `admin_review_trip` does not raise on a missing trip
   - `setting()` has no pinned search_path
   - the late-point trigger recount is O(n²)
6. Design conflict: the 25 m `distanceInterval` produces no points while a truck is parked, so `TRACKING_GAP` and `LOW_COVERAGE` fire on genuine trips (**ND-6**). This needs a doc decision first.

All of these belong in `0003_phase1_fixes.sql` (ND-21), which has not been written.

---

## Environment & tooling

| Tool | Found | Notes |
|---|---|---|
| OS | Windows 11 Home 10.0.26200 | **No macOS, so no Xcode or local iOS builds** (iOS only via EAS cloud) |
| Git | 2.55.0 · remote `github.com/santhosh2564/Namma-Lorry-V1` · branches: `main` only | `main` is **ahead 1** (M1 not pushed). Working tree clean. Commits: `b4e0bee` init → `72c6e2a` M1–M3 docs/schema → `7720e50` M1 scaffold (authored via Codebuff) |
| Node / npm | **v26.8.1** (non-LTS) / 11.14.1 | CI uses Node 24. Expo targets LTS, and Node 26 already caused the `expo-keep-awake` plugin crash (R9) |
| Java | OpenJDK 17.0.20, `JAVA_HOME` set | correct for RN Android |
| Android SDK | `%LOCALAPPDATA%\Android\Sdk` (build-tools, ndk, platforms, emulator, system-images); `adb` on PATH | **`ANDROID_HOME` / `ANDROID_SDK_ROOT` unset** |
| Docker | 29.x installed | **daemon not running** |
| expo CLI | not global; **local `node_modules/.bin/expo` 57.0.27** | `npx expo …` works |
| eas CLI | **not installed** | `npx eas-cli` / `npm i -g eas-cli` at M3 |
| supabase CLI | **not installed** | `npx supabase` (2.118.0 used before) |
| psql | not on PATH | use `docker exec supabase_db_namma-lorry-phase1 psql` |
| Xcode | n/a (Windows) | |
| Path | `C:\Users\santh\Desktop\Namma Lorry`: contains a **space**, but is **not** OneDrive-synced | The space is a known Gradle/CMake/NDK failure source on Windows (ND-1) |
| Local checks (today) | `tsc --noEmit` ✔ · `eslint --max-warnings 0` ✔ · `jest` 2 suites / 3 tests ✔ | not run in CI yet |

**.env files:** only `.env.example` files exist, at the root and in both packs. There is **no `.env`**, so the app runs with an empty anon key and Mappls key. Variable **names** in the root `.env.example`:
- Public: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY`, `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_SENTRY_DSN`
- Server-only: `MAPPLS_CLIENT_ID`, `MAPPLS_CLIENT_SECRET`, `MAPPLS_REST_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

The pack version has `SENTRY_DSN` where the root has `EXPO_PUBLIC_SENTRY_DSN` (the ND-11 fix). Neither lists `SENTRY_AUTH_TOKEN`.

**Mappls RN SDK** (from rev 1's npm inspection; not installed): `mappls-map-react-native@2.0.3`, built against RN 0.79. The project is now on **RN 0.86.3**. Its shipped `app.plugin.js` is broken (`plugin/build/` is missing), so a local `plugins/withMappls.ts` will be needed. Compatibility with RN 0.86 and the New Architecture is **unproven**.

---

## Gap analysis (reuse / conflict / missing)

### Exists and is reusable
- **Root Expo scaffold (M1).** Correct stack, doc-12 route tree, zod env config, i18n bootstrap, EAS profiles, CI skeleton; green locally. Keep it.
- **Supabase:** `config.toml` (test OTPs), 0001 as the base, `0002_consent.sql`, `seed.sql`, `_helpers.psql`.
- **Docs:** the newest pack is the source of truth. `docs/PHASE1_TASKS.md` is the progress backbone.
- **Design:** Stitch PNGs for S2, S3 and D1–D8 as visual spec (with the scope creep stripped out), the logo SVG in `namma_lorry_brand_logo/code.html`, and brief tokens from `stitch/DESIGN.md`.

### Exists but conflicts with the docs or needs fixing
- **No Kotlin, OSM, other-map-SDK or localStorage code exists**, so there is no stack conflict in code. The Kotlin + OSM spec is still an open contractual question (PRD §8).
- **`.npmrc` `os=win32`** forces Windows native optional deps. On the Ubuntu CI runner, `npm ci` will likely skip `lightningcss-linux-x64-gnu` and `@unrs/resolver-binding-linux-x64-gnu`, which would break lint and web bundling. This contradicts the doc 13 P2 / TRD CI requirement for green CI.
- **`APP_ENV` value names:** TRD §10 and the pack `.env.example` use `development | staging | production`. `src/lib/config.ts` and `eas.json` use `development | preview | production`, so setting `staging` would make `config.ts` throw in dev.
- **The M1 progress log lists `expo-env.d.ts`** (a "surgical" file that omits `expo/types/react-native-web`) **and a `.expo/types` tsconfig include**. Neither exists. Typecheck passes without them, so the log is inaccurate rather than the build being broken.
- **Doc location:** the rules sit in a nested folder, and loose root duplicates hang around. This contradicts pack README step 1 and the doc 13 prerequisite (ND-24).
- **Stitch mocks** clash with PRD scope, doc 09 disclosure copy, the brief palette (ND-17) and Rounded icons (ND-16).
- **Migration 0001** clashes with PRD P0-1, CLAUDE.md rule 2 and D6 realtime (ND-8/12/13/14).

### Missing entirely
- **Tooling and hygiene:**
  - root `CLAUDE.md` / `AGENTS.md` / `docs/01–13` / `stitch/`
  - `design/` folder named by screen ID
  - pushed M1 and a green CI run
  - `.env`, `ANDROID_HOME`, a Node LTS decision
- **App (M2+):**
  - `src/theme/tokens.ts`, the UI kit and console primitives
  - `src/components/map/*`, `plugins/withMappls.ts`, `src/lib/{supabase,mappls,geo,sentry,database.types}.ts`
  - `src/features/*`, `src/tracking/*`
  - the i18n JSON files
  - Sentry, Playwright
  - real brand assets (icon, splash)
- **Backend:**
  - `0003_phase1_fixes.sql`
  - pgTAP `*.test.sql` and the extension
  - Edge Functions `mappls-proxy` and `admin-create-driver`
  - `docs/DEV_SETUP.md`
  - a hosted staging project
  - `supabase test db` in CI
- **External:** Mappls account and keys, an Expo/EAS project ID, Apple and Play accounts, a Sentry project, a DLT SMS provider, client sign-offs.

---

## Doc contradictions

Full list in `docs/PHASE1_TASKS.md` §2.2 (ND-8…ND-24); all still open. Most material:

1. **Screen IDs: three schemes.** Doc 04 (old C8 Review decision), docs 09/10 (the "O1 permission screen"; "D2 start button", "D3 sync status", "D4 statuses") and doc 12 (D1 permissions, D4 start, D5 active). **Doc 12 wins**; docs 09/10 need their IDs updated.
2. **Folder layout** differs between CLAUDE.md (`src/lib/db.ts`, `src/features/tracking`), TRD §3 (`src/tracking/config.ts`, `lib/geo.ts`, `lib/sentry.ts`) and doc 13 (`src/tracking/db.ts`, `src/theme/`, `plugins/`). ND-9.
3. **Web audience:** CLAUDE.md rule 8 says "admin / owner / shipper"; the PRD says admin-only in Phase 1. ND-10.
4. **Driver registration:** PRD P0-1 says refuse unknown numbers; migration 0001 auto-creates drivers. ND-12.
5. **Sampling vs gap rules:** 25 m `distanceInterval` (TRD §4.2) against `TRACKING_GAP` > 15 min and `LOW_COVERAGE` < 60/h (doc 08). ND-6.
6. **Live delay:** doc 01 W4 says "~30 s"; PRD and doc 10 say "≤ 60 s". ND-15.
7. **Environment names:** TRD §10 and the pack `.env.example` say `staging`; the EAS profiles in the same TRD section say `preview`. *New in rev 3.*
8. **Postgres version:** TRD §2 says "Postgres 15+"; local is 17. Hosted staging must match.
9. **"Latest stable SDK"** (CLAUDE.md, doc 13 P2) vs the reality that npm-latest RN 0.87.1 breaks Metro web, so the scaffold pins the SDK 57 template (RN 0.86.3). ND-7 is effectively already in force.
10. **Palettes and icons:** the brief (#0F2A44 / #F5A300, Rounded) vs the Stitch export (#00152a / #825500, Outlined). ND-16, ND-17.
11. **Doc 12 console screens** reference data the schema lacks: permission-health dot, SMS invite, owner/shipper selects, loads status column. ND-19, ND-20.
12. **Pack README** says build with doc 11; doc 13 supersedes doc 11.

---

## Risks & blockers

| # | Risk / blocker | Severity | Change vs rev 2 |
|---|---|---|---|
| 1 | Mappls RN SDK 2.0.3 (RN 0.79) vs RN 0.86.3 / New Architecture; broken shipped config plugin | **High**, blocks M3 onwards | unchanged; the scaffold now exists, so the spike can run |
| 2 | No Mappls account or keys (SDK key + REST client id/secret) | **High**, blocks M3/M6/M7 | unchanged |
| 3 | CI likely broken by `.npmrc os=win32`; M1 never pushed | **Medium** | **new** |
| 4 | iOS from Windows: needs an Apple account, a physical iPhone and EAS cloud builds | High (iOS only) | unchanged |
| 5 | Docker stopped, so local Supabase is down; Supabase CLI not installed | Low (start Docker Desktop) | **regressed** from running |
| 6 | Poison-batch / clock-skew RLS (ND-8) | High, before M8 | unchanged |
| 7 | Stationary-truck false flags (ND-6) | High, before M8 | unchanged |
| 8 | Auto-registration of any OTP user (ND-12) | High, before M5 | unchanged |
| 9 | Path contains a space (Gradle/CMake/NDK on Windows) | Medium | **reduced**: not OneDrive. Moving now also means moving or reinstalling 658 MB of `node_modules` |
| 10 | Node 26 non-LTS locally vs Node 24 in CI | Low–Med | unchanged; already caused one workaround |
| 11 | `ANDROID_HOME` unset | Low, blocks local `expo run:android` | unchanged |
| 12 | Project rules not auto-loaded (no root `CLAUDE.md`) | Medium: agents drift from the hard rules | **new emphasis** |
| 13 | EAS project ID placeholder; no Expo account linked | Low, blocks the first `eas build` | new |
| 14 | DLT SMS needed for real OTPs | Medium (pilot) | unchanged; test OTPs cover dev |
| 15 | Client sign-offs outstanding (RN + Mappls vs Kotlin + OSM; driver registration; thresholds) | High (contractual) | unchanged; W0 starts **tomorrow (28 Sep)** |
| 16 | Console screens undesigned; mock scope creep | Medium | unchanged |
| 17 | OEM background killing (Xiaomi, Vivo, Oppo) | High (field) | unchanged |

---

## Recommendation

**Adapt the existing root Expo app. Do not start a fresh one.** Reasons:
- It is the fresh app, created yesterday to the doc 13 P2 spec.
- It is correctly pinned to the SDK 57 template matrix, with every doc-12 route and a working toolchain, and it passes typecheck, lint and test.
- Starting again would redo that pinning work (including the RN 0.87.1 web-bundling dead end) for no gain. There is nothing legacy to port.

**Order of work before M2:**
1. **Pre-flight clean-up** (one commit):
   - Promote the newest pack to the root: `CLAUDE.md`, `AGENTS.md`, `docs/01–13`, `stitch/DESIGN.md`; keep the root `.env.example` (ND-11 applied).
   - Keep the live root `supabase/` and copy `smoke_phase1.sql` into `supabase/tests/` as reference.
   - Delete the loose root duplicates and the old pack (keep the `.zip` if wanted).
   - Move `SCREENS/` to `design/` using doc-12 names (`S2-sign-in.png`, `D5-active-trip.png`, …) plus a `design/README.md` listing the ignored scope creep.
2. **Fix and prove CI:**
   - Drop `os=win32` from `.npmrc`.
   - Align the `APP_ENV` names (pick `preview` or `staging` everywhere).
   - Correct the M1 log entry about `expo-env.d.ts`.
   - Push, and confirm the GitHub Actions run is green.
3. **Environment:** start Docker, set `ANDROID_HOME`, create a `.env` from the local stack keys, and decide on Node 24 LTS locally (recommended, to match CI).
4. **M3 Mappls spike next, ahead of M2 polish.** It is the highest technical risk and it may force an SDK or RN change that would invalidate later work.
5. **Before M5:** `0003_phase1_fixes.sql` (ND-8/12/13/14 plus minors) and the pgTAP test files. **Before M8:** the ND-6 doc change.

**Relocation (ND-1):** Desktop is not OneDrive-synced. Relocation to `C:\dev\namma-lorry` is still advisable before the first local Android build (M3). It is a folder move plus `npm ci`, and the git remote stays the same.

**Proposed final layout** (as in PHASE1_TASKS §1.3, with the pack promoted):
```
namma-lorry/
├─ CLAUDE.md  AGENTS.md  README.md  .env.example  .gitignore  .npmrc
├─ app.config.ts  eas.json  package.json  tsconfig.json  babel.config.js  eslint.config.js  jest.config.js
├─ plugins/withMappls.ts
├─ app/                (auth) (onboarding) (driver) (console) index.tsx access-notice.tsx dev/
├─ src/
│  ├─ components/{ui,console,map/{types.ts,MapView.native.tsx,MapView.web.tsx}}
│  ├─ features/{auth,loads,trips,review,live-map,drivers,vehicles}/
│  ├─ tracking/{task,stateMachine,queue,db,uploader,permissions,config,errors}.ts
│  ├─ lib/{supabase,mappls,geo,sentry,config,database.types}.ts
│  ├─ theme/tokens.ts
│  └─ i18n/{index.ts,en.json,ta.json,kn.json,hi.json}
├─ supabase/{config.toml,seed.sql,migrations/,functions/{mappls-proxy,admin-create-driver}/,tests/}
├─ design/             S2-sign-in.png … D8-my-profile.png, logo, README.md
├─ stitch/DESIGN.md
├─ e2e/  test/gpx/
├─ docs/               00-repo-audit, 01–13, PHASE1_TASKS, DEV_SETUP, …
└─ .github/workflows/ci.yml
```

---

## Questions

Only the questions that block progress:

1. **Pre-flight restructure:** may I promote the newest pack to the root, delete the verified duplicates and the old pack, and move `SCREENS/` to `design/`? And should I relocate to a path without spaces (e.g. `C:\dev\namma-lorry`) now or not at all? *(Blocks the next commit.)*
2. **Mappls:** do you have a Mappls developer account yet? Which credentials exist (map SDK key, REST client id/secret), and is the web SDK enabled? *(Blocks M3.)*
3. **iOS:** is an Apple Developer account and a physical iPhone available for W0? Or do we reduce the W0/M3 exit to Android + web and defer iOS? *(Blocks the M3 exit criterion.)*
4. **Client sign-off:** is written approval of RN + Mappls (instead of Kotlin + OSM) in hand? And who registers drivers: admin only (my assumption, per the `admin-create-driver` plan) or self-signup? *(Blocks W1/M5.)*
5. **Stationary trucks (ND-6):** may I change docs 03/08 to either a heartbeat point while stationary or gap/coverage judged on moving time only? *(Blocks M8 and 0003.)*
6. **Environment name:** should the second environment be called `preview` or `staging` in code? *(Small, but it blocks the CI/env fix.)*

*(Answered by the repo, for the record: git ✓, remote ✓, local Supabase initialised ✓, 0002 and seed ✓, M1 scaffold ✓, Desktop not OneDrive ✓. Hosted Supabase (ND-4) can wait until M12c; local is enough until then.)*
