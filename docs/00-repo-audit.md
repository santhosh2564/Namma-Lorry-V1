# 00 — Repository Audit (read-only discovery)

**Rev 2 — 26 Sep 2026** (supersedes rev 1 of the same date; re-verified after the folder changed)
**Folder:** `C:\Users\santh\Desktop\Namma Lorry` · **Scope:** discovery only. Apart from this file, nothing was created, changed, installed or deleted.

**What changed since rev 1** (the reason for this revision):
1. The folder is **now a git repository**, with a GitHub remote (`github.com/santhosh2564/Namma-Lorry-V1`), branch `main` (in sync with `origin/main`), 2 commits: `b4e0bee Initial commit`, `72c6e2a M1-M3: schema, docs, screens, smoke tests, task list`.
2. A **local Supabase project is now initialised AND running**: `supabase/config.toml` (project `namma-lorry-phase1`, Postgres 17), 12 Docker containers up 4 h, API on 54321 and Studio on 54323 answering. Migrations **0001 and 0002 are applied** (`supabase_migrations.schema_migrations`), and the seed is loaded: 4 profiles, 3 vehicles, 4 loads, 1 trip.
3. New files at `supabase/` root: `migrations/0002_consent.sql` (DPDP consent RPC — matches doc 09/11 exactly), `seed.sql` (admin + 3 drivers + 3 vehicles + 4 loads + 1 assigned trip, with `[auth.sms.test_otp]` numbers 9190000000{01,11,12,13} → OTP `123456`), `tests/_helpers.psql` (pgTAP helper functions, complete and well designed).
4. The two doc packs are reconciled and understood: `namma-lorry-phase1-docs/` (older pack + root `docs/12`) and `namma-lorry-phase1-docs/namma-lorry-phase1-docs/` (newest pack, a superset: adds `docs/13`, `stitch/DESIGN.md`, updated `docs/04`). `docs/13` supersedes `docs/11`.

Everything else from rev 1 still holds: **no application code exists** — no Expo app, no `package.json`, no Kotlin, no vanilla-JS prototype; the Stitch mocks in `SCREENS/` are visual-only.

---

## Summary

- **No app code.** No Expo/React Native app, no Kotlin/Android, no JS GPS prototype, no `package.json`.
- **Backend work has already progressed further than rev 1 assumed:** local Supabase is running (Docker), migrations 0001 + 0002 are applied, seed data is loaded, and the pgTAP helper layer exists. M4 (Supabase backend) is roughly **half done**: missing pieces are the actual `*.test.sql` pgTAP files, `docs/DEV_SETUP.md`, and generated types + typed client in `src/lib/` (impossible until the app exists).
- **Migration 0001 is applied unchanged** (byte-identical to all three pack copies) and is **not ready to be relied on**: poison-batch/clock-skew RLS, stationary-truck gap conflict, auto-driver-registration, admin `update` bypass on trips (all detailed below). The planned `0003_phase1_fixes.sql` does **not** exist yet.
- **Tooling improved:** Docker daemon **is running** (was off in rev 1). Still missing: Supabase/Expo/EAS CLIs (use `npx supabase`), `ANDROID_HOME` unset, no macOS for iOS.
- **Recommendation unchanged:** fresh Expo app at the repo root; but the "promote the newest pack to the root" step is now **more urgent** because config/seed/tests already sit at `supabase/` root while docs still live in the nested packs.

---

## Repository map

```
Namma Lorry/                            git repo → github.com/santhosh2564/Namma-Lorry-V1 (main)
├─ .gitignore                           .env*, supabase/.branches/, supabase/.temp/
├─ README.md                            index for the older pack (identical to pack README)
├─ 0001_phase1_schema.sql  27 KB        duplicate (byte-identical, md5 1b118728…)
├─ 02-PRD.md / 03-TRD.md / 04-screen-navigation.md / 13-claude-code-prompts.md   duplicates
├─ docs/                     76 KB      00-repo-audit.md (this file, rev 1 inside), PHASE1_TASKS.md
├─ supabase/                 74 KB      ★ LIVE local project (details below)
├─ SCREENS/                  2.3 MB     25 files — Stitch exports (10 screens + logo, PNG + HTML each)
│                                         + 12_screens_and_stitch_prompts.md + design.md + namma_lorry/DESIGN.md
└─ namma-lorry-phase1-docs/  400 KB     doc pack (older) + nested newest pack + .zip
   ├─ CLAUDE.md / AGENTS.md / README.md / DESIGN.md / .env.example / 12-screens-and-stitch-prompts.md
   ├─ docs/01–11 (no 05; 05 is the SQL)
   ├─ supabase/{migrations/0001, tests/smoke_phase1.sql}
   └─ namma-lorry-phase1-docs/          ★ NEWEST pack: adds docs/13, stitch/DESIGN.md, updated docs/04
```

File counts by top level: pack 38, SCREENS 25, supabase 8, root 7, docs 2. No `node_modules`, no build outputs, no `design/` folder (doc 13's prerequisite), no `package.json`.

### supabase/ (root) — live project

| Item | State |
|---|---|
| `config.toml` | `supabase init`-generated (CLI default template), project_id `namma-lorry-phase1`, Postgres major 17, seed enabled (`./seed.sql`). **Customised:** `[auth.sms]` enabled with dummy Twilio creds (local-only), `[auth.sms.test_otp]` mapping the 4 seed phones → `123456`, auth hook comments referencing ND-12, `sms_sent` rate limit 30/h |
| Docker | 12 containers up ~4 h (db, kong/API 54321, studio 54323, auth, rest, realtime, storage, edge runtime, analytics, pg_meta, inbucket). `supabase_vector` is in a restart loop — cosmetic, analytics-only |
| Migrations applied | **0001, 0002** (verified in DB) |
| Seed loaded | profiles 4 (1 admin + 3 drivers), vehicles 3, loads 4, trips 1 (assigned) — verified in DB |
| `tests/` | `_helpers.psql` only (as_user/as_anon/as_postgres, create_user/vehicle/load/trip, insert_track, completed_trip — all well formed). **No actual `*.test.sql` files yet**, so `supabase test db` currently has nothing to run. pgTAP extension **not yet created** in the DB |
| Edge functions | none (`mappls-proxy`, `admin-create-driver` still to write) |
| `smoke_phase1.sql` | exists only in the two packs, not at root; doc 11/13 P5 plans its pgTAP conversion |

### Migration 0001 — still the same three real defects (grep-verified in the applied file)

1. **Poison batch / clock skew (high).** `points_driver_insert` (line 244) rejects rows with `recorded_at` > 2 min ahead of server or > 1 min before `started_at`. A WITH CHECK failure aborts the whole multi-row upsert; one bad row (phone clock fast) blocks all uploads for that trip and the uploader retries forever.
2. **Stationary trucks flagged (high, design conflict).** 25 m `distanceInterval` emits no points while parked → `TRACKING_GAP` (>15 min) and `LOW_COVERAGE` (<60/h) fire on genuine trips, undermining the ≥80 % auto-verify goal. Needs a heartbeat strategy or moving-time-only gap logic — a **doc change first** (ND-6).
3. **Driver registration path (high).** `handle_new_user` (line 54) makes **any** OTP sign-in a driver. PRD P0-1 requires refusing unknown numbers → `signInWithOtp({ shouldCreateUser: false })` + admin-only `admin-create-driver` Edge Function (planned in PHASE1_TASKS as ND-12).

Plus the medium/minor items from rev 1, all still present: `trips_admin` is `for all` (line 230) so admin clients can bypass RPCs and no `cancel_trip` RPC exists; `GPS_JUMPS` hard-coded (line 322) instead of `app_settings`; `admin_review_trip` returns null on missing trip; `trips` not in the realtime publication (only `trip_live`, line 507); `setting()` search_path; `trip_points` re-count O(n²). None has a fix migration yet → `0003_phase1_fixes.sql` per ND-21.

**0002_consent.sql (new, applied):** adds `profiles.consent_version/consent_at` + SECURITY DEFINER `record_consent(p_version)`, own-row only, `is_active` required, `FORBIDDEN`/`VERSION_REQUIRED`/`PROFILE_NOT_FOUND` error codes, grants to `authenticated` only. Matches doc 09 §1 and doc 11 P5 exactly. No issues found.

**seed.sql (new, applied):** inserts `auth.users` + `auth.identities` directly (tokens set to `''` — a known GoTrue quirk, correctly handled), promotes profiles via `handle_new_user` trigger, bumps `load_code_seq` to 141 so codes match the design sample (NL-2026-000142/143), real TN/KA coordinates. Depends on `public.profiles` rows existing from the trigger — works because seed runs after migrations. `setval` on `load_code_seq` matches 0001's sequence. No issues found.

---

## Existing projects

| Project | Language / framework | Entry points | Build / run | Dependency files |
|---|---|---|---|---|
| Doc packs (two, nested) | Markdown + SQL | `CLAUDE.md`, newest pack `docs/13` | — | none |
| Local Supabase project (root `supabase/`) | Postgres 17 / PostGIS / pg_cron; Docker | `config.toml` | `npx supabase start/stop/db reset/test db` | none |
| Stitch mocks (`SCREENS/`) | Static HTML, Tailwind CDN, click-handler JS only | each `code.html` | open in browser | none |
| Expo / RN app | **does not exist** | — | — | — |
| Kotlin / vanilla-JS prototype | **does not exist** | — | — | — |

---

## Docs summary

| File | Summary |
|---|---|
| **CLAUDE.md / AGENTS.md** (both packs, identical) | Locked stack: Expo + TS strict + Expo Router, EAS dev builds, **Mappls only**, expo-location/task-manager/sqlite, Supabase, TanStack Query + Zustand + RHF/zod. 10 hard rules (server computes verification; status via RPCs only; idempotent `(trip_id,seq)`; SQLite-first queue; top-level task; secrets in Edge Functions; `.native`/`.web` map split; web = console; RLS in every migration; i18n). Folder layout + commands + definition of done |
| **docs/13** (newest pack; **supersedes docs/11**) | 15 full prompts: P0 audit, P1 plan, P2–P12 = M1–M11, P13–P15 = M12a/b/c. How-to: pack at root, Stitch PNGs in `design/` named by screen ID, plan mode per prompt, `/clear` between, commit per prompt, 🧍 human checkpoints |
| **docs/01-project-plan** | 7 weeks from Mon 28 Sep 2026; W0 = setup + Mappls spike on Android/iOS/web; accounts/costs checklist; risk register (Mappls native config, OEM battery killers, store reviews, spoofing, earlier client spec of Kotlin + OSM) |
| **docs/02-PRD** | Goals: ≥95 % complete tracks, ≥80 % auto-verify, zero driver-editable data, ≤60 s live delay, ≤2 taps. P0-1…P0-13 with acceptance criteria; 6 open client questions, 3 blocking before W1 |
| **docs/03-TRD** | Architecture, stack, repo structure (differs from CLAUDE.md). Tracking: state machine, `TRACKING_OPTIONS` 10 s / 25 m BestForNavigation + foreground service, SQLite `point_queue`, uploader 200 rows/30 s with backoff. Map abstraction `AppMapProps`; backend tables/RPCs/trigger/cron; `mappls-proxy`; realtime; NFRs |
| **docs/04** (updated in newest pack) | Expo Router route tree (auth/onboarding/driver/console), routing flowchart, per-screen specs. Screen IDs superseded by doc 12 |
| **docs/06-api-contracts** | Exact RPC signatures + error codes for `start_trip`, `end_trip`, `admin_review_trip`; call order; RLS access patterns; point row shape; realtime subscription; `mappls-proxy` actions; status labels |
| **docs/07-apis-and-services** | Mappls SDKs/APIs, expo-*, Supabase, Sentry; paid: Apple $99, Play $25, DLT SMS; avoid OSM/Google/Mapbox tiles, `react-native-maps`, Transistor, Mappls InTouch; key-handling table |
| **docs/08-verification-rules** | Official km = PostGIS geodesic; drop accuracy > 50 m and segments > 150 km/h; **10 reason codes** with thresholds in `app_settings`; verification at end_trip + trigger + 6 h sweeper; needs client sign-off |
| **docs/09-security-privacy-compliance** | DPDP (consent via 0002 + `record_consent`), Play background-location declaration + video, iOS purpose strings, app-sec controls, anti-fraud threat model, privacy-policy outline |
| **docs/10-test-plan** | pgTAP / Jest+RNTL / Playwright / optional Maestro; emulator GPX; field-test device matrix; **12 acceptance scenarios** |
| **docs/11-build-prompts** (superseded by 13) | Short per-milestone prompts |
| **docs/12-screens-and-stitch-prompts** (newest pack root) | **Supersedes doc 04 screen list**: 21 screens + 6 overlays (S1–S4, D1–D8, C1–C9); C8 Review Decision merged into C6; Stitch prompts per screen; exports are visual reference only; tokens → `src/theme/tokens.ts`; designs → `design/` |
| **DESIGN.md / stitch/DESIGN.md** | Brief: Ink Navy #0F2A44, Highway Amber #F5A300, status colours, Noto Sans, 8 px grid, 48 px targets, Material Symbols **Rounded**, sample data (Murugan S, TN 23 BK 4521, NL-2026-000142/143). Stitch's own `SCREENS/namma_lorry/DESIGN.md` adds an M3 token set with a **different palette** (see contradictions) |
| **PHASE1_TASKS.md** (docs/) | Master plan from Prompt 1: decisions, ND-1…ND-24 needs-decision table (audit questions + doc contradictions), M1–M12 with acceptance criteria, traceability, screen checklist, risks, progress log |

**Design images (`SCREENS/*/screen.png`):** Sign in, Verify OTP, Location Permission, Battery Setup, My Trips, Trip Detail & Start, Active Trip, Trip Summary, Trip History, My Profile + logo. **Not designed:** S1 Splash, S4 Access Notice, state variants/overlays, all 9 console screens.

---

## Prototype feature inventory

**No prototype exists.** No GPS capture, sampling, distance formula, filtering, storage or backend calls anywhere. The only JS is UI click handlers in the Stitch mocks (keypad, language drawer, class toggles); no `navigator.geolocation`, no `localStorage`, no `fetch`.

- **Reusable as visual spec:** layout, hierarchy, copy for core flows, logo SVG, colour values.
- **Not reusable as code** (doc 12 §3): the real app is React Native.
- **Scope creep baked into mocks — must not be carried over:** FASTag balance, Fleet SOS, shipper ratings (4.92), e-Way Bill & Gate Pass, "Driver Tier 1 Certified", POD/Settlement/diesel/toll re-upload, "Live Trip Navigation" (turn-by-turn is a non-goal), unverifiable claims (AIS-140, Govt registry), made-up support number, wrong permission-screen disclosure (doc 09's wording must be used), Google Maps imagery in placeholders, unmasked phone / second plate in Profile, clipped logo wordmark.

---

## Supabase state

See the dedicated table under Repository map. Headline: **initialised, running, migrated (0001+0002), seeded** — but **untested** (no pgTAP test files, pgTAP extension not created), **no Edge Functions**, and **0001 carries unfixed design defects** needing `0003_phase1_fixes.sql`. `supabase db reset && supabase test db` (doc 13 P5's done-criterion) **cannot pass yet**.

---

## Environment & tooling

| Tool | Found | Notes |
|---|---|---|
| OS | Windows 11 Home | **No macOS → no Xcode / iOS simulator / local iOS builds** |
| Git | 2.55, repo with remote `github.com/santhosh2564/Namma-Lorry-V1`, branch `main` = origin/main, 2 commits | Working tree clean; `.gitignore` covers `.env*` + `supabase/.branches|.temp` |
| Node / npm | v26.8.1 / 11.14.1 | Node 26 non-LTS; Expo targets LTS — pin 24 if tooling misbehaves (R9) |
| Docker | 29.7.2, **daemon running** | Supabase stack currently up |
| Java | JDK 17.0.20, `JAVA_HOME` set | Correct for RN Android |
| Android SDK | `$LOCALAPPDATA\Android\Sdk` complete (platforms/build-tools/NDK/adb) | **`ANDROID_HOME` still unset** |
| expo / eas / supabase CLIs | **not installed** (npx would fetch supabase@2.118.0, expo 57.x, eas-cli 24.8.0) | Use `npx supabase` |
| psql | not on PATH | Use `docker exec supabase_db_namma-lorry-phase1 psql` (worked during this audit) |
| Path | `C:\Users\santh\Desktop\Namma Lorry` — **space + Desktop/OneDrive risk** | Known Gradle/CMake/NDK failure source (ND-1) |

**.env files:** none present (only `namma-lorry-phase1-docs/.env.example` + nested copy). Variable **names only**:
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY`, `EXPO_PUBLIC_APP_ENV` · server-only: `MAPPLS_CLIENT_ID`, `MAPPLS_CLIENT_SECRET`, `MAPPLS_REST_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SENTRY_DSN` (ND-11: should be `EXPO_PUBLIC_SENTRY_DSN` + `SENTRY_AUTH_TOKEN` as an EAS secret).

**Mappls RN SDK** (from rev 1 npm inspection): `mappls-map-react-native@2.0.3` built against RN 0.79 vs Expo SDK 57's RN 0.87; shipped `app.plugin.js` is broken (missing `plugin/build/`), so a local `plugins/withMappls.ts` is required.

---

## Gap analysis (reuse / conflict / missing)

### Reuse
- Newest doc pack (CLAUDE.md, docs 01–13, `.env.example`) — source of truth; doc 13 now in the pack (previously only at root).
- `supabase/migrations/0001` applied as base + **`0002_consent.sql` done** + **`seed.sql` done** + **`_helpers.psql` done**.
- PHASE1_TASKS.md as the progress backbone; audit rev 1's analysis (correctness re-verified).
- Stitch PNGs as visual spec (after stripping scope creep); logo SVG; DESIGN.md → `src/theme/tokens.ts`.

### Conflicts
- No Kotlin/OSM/other-SDK/localStorage code exists — no code conflicts; the earlier Kotlin+OSM client spec remains contractual only (PRD open question).
- Stitch mocks vs PRD scope + doc 09 disclosure copy; Stitch token palette vs brief; doc 04/11 screen IDs vs doc 12 (superseded — use doc 12).

### Missing entirely
- The Expo app (everything from `package.json` to routes); `plugins/withMappls.ts`; `src/lib/database.types.ts` + typed `src/lib/supabase.ts`.
- pgTAP `*.test.sql` files (helpers exist); pgTAP extension; `docs/DEV_SETUP.md`.
- `0003_phase1_fixes.sql` (ND-8/12/13/14 + minor fixes) and the ND-6 verification doc change.
- Edge Functions `mappls-proxy`, `admin-create-driver`; CI workflow; Sentry; i18n files.
- `design/` folder with doc-12-named PNGs (doc 13 prerequisite); pack promotion to root; duplicate cleanup.
- Keys/accounts: Mappls, hosted Supabase, Expo/Apple/Play, Sentry — nothing exists yet.

---

## Doc contradictions

Unchanged from rev 1 (all tracked as ND-8…ND-24 in PHASE1_TASKS.md §2.2). Top items: three screen-numbering schemes (doc 12 wins); stale route tree (no S1/S4 routes); folder-layout differences between CLAUDE.md/TRD/doc 13; two token palettes (brief wins); `SENTRY_DSN` placement; 25 m sampling vs stationary-gap rules (ND-6); auto-driver-registration vs PRD (ND-12); admin update bypass vs hard rule 2 (ND-13); `trips` missing from realtime publication (ND-14); live-delay 30 s vs 60 s (ND-15); W0 exit needs iOS on a Windows machine (ND-3).

New minor note: `supabase/config.toml` says `major_version = 17` while doc 03 mentions Postgres 15 — local pins 17, which is what current Supabase ships; fine, but hosted staging must also be PG 17 or migrations need review.

---

## Risks & blockers

| # | Risk / blocker | Severity | Status vs rev 1 |
|---|---|---|---|
| 1 | Mappls SDK vs Expo 57/RN 0.87; broken shipped plugin | High | unchanged — spike first |
| 2 | No Mappls account/keys (SDK key + REST id/secret) | High | unchanged |
| 3 | iOS from Windows: Apple account + device + EAS | High (iOS only) | unchanged |
| 4 | ~~Docker off~~ → **running**; CLI not installed | ~~Medium~~ Low | improved; use `npx supabase` |
| 5 | Poison-batch/clock-skew RLS | High | **now live in the DB** — must fix in 0003 before M8 |
| 6 | Stationary-truck false flags (ND-6) | High | unchanged; doc change first |
| 7 | Driver registration path (ND-12) | Medium | unchanged; blocks M5/M6 |
| 8 | Path with space + OneDrive risk | Medium | unchanged (ND-1) |
| 9 | Node 26 non-LTS | Low–Med | unchanged |
| 10 | `ANDROID_HOME` unset | Low | unchanged |
| 11 | `supabase test db` has no test files; pgTAP not created | Low | **new** — M4 remainder |
| 12 | DLT SMS for real OTPs | Medium | unchanged; test_OTP covers local |
| 13 | Client sign-offs outstanding | High (contractual) | unchanged |
| 14 | Console screens undesigned | Medium | unchanged |
| 15 | Stitch mock scope creep | Medium | unchanged |

---

## Recommendation

**Unchanged: start a fresh Expo app in this repo** (nothing adaptable exists), with the sequencing updated for what has since landed:

1. **Settle ND-1 (relocation)** before scaffolding — Gradle/CMake on a space-containing OneDrive path is the top avoidable risk. Recommended: `C:\dev\namma-lorry`.
2. **Promote the newest pack to the root** (CLAUDE.md, AGENTS.md, `.env.example`, `docs/01–13`, `stitch/DESIGN.md`), delete the verified byte-identical duplicates at root and `SCREENS/`'s two doc copies, and **keep the live `supabase/` at root** (it is already there and ahead of the pack's copy — merge only `tests/smoke_phase1.sql` into `supabase/tests/` for reference).
3. **Move `SCREENS/` → `design/stitch/`** renamed by doc-12 IDs, with a `design/README.md` listing ignored scope-creep elements (ND-18).
4. **Finish M4** (it is half done): write the pgTAP `*.test.sql` files against `_helpers.psql`, create the pgTAP extension, add `docs/DEV_SETUP.md`, and get `supabase db reset && supabase test db` green.
5. **Add `0003_phase1_fixes.sql`** (ND-8/12/13/14 + minors) *before* M8, and the ND-6 doc change before M8 too.
6. Then M1 scaffold (pin Expo SDK; ND-7 fallback), M2 tokens/UI, M3 Mappls spike (🧍 Android + web first; iOS deferred per ND-3 if needed).

Proposed final layout — same as PHASE1_TASKS.md §1.3 (which this audit endorses), with `design/` + root-level `CLAUDE.md`/`docs/`/`supabase/` after the promotion step.

---

## Questions (blockers only)

1. **ND-1:** May I relocate to a space-free path (e.g. `C:\dev\namma-lorry`), promote the newest pack to root, delete the verified duplicates, and move `SCREENS/` → `design/`? Is Desktop OneDrive-synced?
2. **ND-2:** Mappls developer account — which credentials exist (map SDK key, REST client id/secret), and is the web SDK enabled?
3. **ND-3:** Apple Developer account + physical iPhone available, or defer iOS and reduce W0/M3 to Android + web?
4. **ND-4:** Local Supabase only for now (it already runs), or link a hosted staging project?
5. **ND-5:** Client sign-offs in hand? Specifically: RN + Mappls in writing, and admin-only vs self-signup driver registration (decides ND-12's design in M5/M6).
6. **ND-6:** Approve the stationary-heartbeat (or moving-time-gap) doc change to docs 03/08 before M8?
7. **ND-7:** If the Mappls spike fails on Expo SDK 57, may I pin an older SDK?

*(State already answered by the repo, for the record: git exists ✓, local Supabase running ✓, 0002 + seed done ✓.)*
