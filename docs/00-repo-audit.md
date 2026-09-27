# 00 — Repository Audit (read-only discovery)

**Date:** 27 Sep 2026 · **Environment:** Freebuff Cloud workspace (Linux sandbox) · **Scope:** discovery only. Apart from this file, nothing was created, changed, installed or deleted.

> This is the **second audit** of this repository. It supersedes the 26 Sep audit (which described a Windows Desktop folder) and re-verifies everything against the current commit `72c6e2a` ("M1-M3: schema, docs, screens, smoke tests, task list"). The repository is now a **git repo with one commit on `main`, clean working tree, pushed to `github.com/santhosh2564/Namma-Lorry-V1`** — the previous audit's "no git repo" findings are stale.

---

## Summary

- **There is still no application code.** No Expo/React Native app, no Kotlin project, no vanilla-JS GPS prototype, no `package.json`, no `app.config.ts`, no generated types. The build target (M1, doc 13 Prompt 2) has not been started.
- The repo now contains: the doc pack **twice** (`namma-lorry-phase1-docs/` old copy and `namma-lorry-phase1-docs/namma-lorry-phase1-docs/` newest copy, which is a superset adding docs 12/13, `stitch/DESIGN.md`, updated doc 04), loose root copies of 5 pack files, a `SCREENS/` folder of 10 Google Stitch driver-screen exports (PNG + static HTML), and a **root-level `supabase/` project that did not exist at the last audit** (config.toml, migration 0001, migration 0002_consent, seed.sql, pgTAP helpers).
- **Verified-duplicate status changed.** Root `02-PRD.md`, `03-TRD.md`, `13-claude-code-prompts.md` and `0001_phase1_schema.sql` are byte-identical to the newest pack. But root `04-screen-navigation.md` is the **older** doc-04 revision (root still splits C8 "Review decision" as its own screen; the pack version merges it into C6), and root `README.md` is the older revision without docs 12/13 in its file table. Duplicates are **not safe to bulk-delete** without per-file verification.
- **Migration 0001 + 0002 are in place at the root and remain the strongest asset.** The audit defects found previously are re-confirmed by direct reading (auto-driver signup, poison-batch RLS, admin write bypass, hard-coded GPS_JUMPS, no `cancel_trip`, no `trips` in the realtime publication).
- **pgTAP test scaffolding exists** (`supabase/tests/_helpers.psql`) but **zero actual `*.test.sql` cases have been written** — the M4 pgTAP conversion is entirely outstanding.
- **Tooling in this Freebuff sandbox:** Node 22, npm 10.9.8, Bun 1.4.2, git 2.34.1. **Not available:** Docker, Java/JDK, Android SDK, adb, Expo/EAS/Supabase CLIs (installable ad-hoc via npx/bunx). Native Android/iOS builds cannot run in this sandbox; they belong to the user's machine.
- **No env values configured** (`freebuff-env list` → empty). Required variable *names* are in `namma-lorry-phase1-docs/.env.example` (both packs) — see Environment.
- **Recommendation:** proceed with a **fresh Expo app at the repo root** (nothing to adapt), first doing a one-time pre-flight: promote the newest pack to the root, keep the root `supabase/` as the canonical backend folder, move `SCREENS/` → `design/` with doc-12 IDs, then M1.

---

## Repository map

71 tracked files, ~5.3 MB total (2.3 MB is `SCREENS/` images). One commit on `main`; remote `origin/main` in sync; working tree clean.

```
Namma-Lorry-V1/  (repo root, branch main @ 72c6e2a)
├─ .gitignore                     env files ignored (except .env.example); supabase .branches/.temp
├─ 0001_phase1_schema.sql   27 KB  duplicate — IDENTICAL to both pack copies
├─ 02-PRD.md                 8 KB  duplicate — IDENTICAL
├─ 03-TRD.md                 9 KB  duplicate — IDENTICAL
├─ 04-screen-navigation.md   6 KB  duplicate — OLDER revision (C8 Review Decision is a separate screen; pack copy merges it into C6)
├─ 13-claude-code-prompts.md 23 KB duplicate — IDENTICAL
├─ README.md                 3 KB duplicate — OLDER revision (file table lacks docs 12/13 rows; pack README has them)
├─ docs/                            2 files, 76 KB
│  ├─ 00-repo-audit.md              previous audit (26 Sep) — this file supersedes it
│  └─ PHASE1_TASKS.md          43 KB Prompt-1 plan: decisions, ND-1…ND-24, M1…M12 milestones, progress log
├─ SCREENS/                 2.3 MB  25 files — Google Stitch exports
│  ├─ 1._sign_in … 10._my_profile_tab/   each: code.html (static Tailwind CDN + JS click handlers) + screen.png
│  ├─ namma_lorry_brand_logo/            code.html (SVG wordmark) + screen.png
│  ├─ namma_lorry/DESIGN.md              Stitch-generated Material-3 token file (palette differs from the brief)
│  ├─ 12_screens_and_stitch_prompts.md   IDENTICAL to pack docs/12
│  └─ design.md                          IDENTICAL to pack DESIGN.md
├─ namma-lorry-phase1-docs/        400 KB — OLD doc pack (docs 01–11, no 12/13; supabase with 0001 + psql smoke test)
│  ├─ namma-lorry-phase1-docs.zip      62 KB zip of the nested pack
│  └─ namma-lorry-phase1-docs/         NEWEST pack (docs 01–13, stitch/DESIGN.md, updated 04, .env.example)
└─ supabase/                        64 KB — real backend folder (NEW since last audit)
   ├─ config.toml              423 lines, standard supabase init (project_id "namma-lorry-phase1")
   ├─ seed.sql                  admin + 3 drivers (919000000001/11/12/13) + 3 vehicles + 4 TN/KA loads + 1 assigned trip
   ├─ migrations/0001_phase1_schema.sql   507 lines (identical to both packs)
   ├─ migrations/0002_consent.sql          consent_version/consent_at + record_consent RPC
   └─ tests/_helpers.psql        115-line pgTAP helper (as_user/as_anon/as_postgres, create_user/vehicle/load/trip, insert_track, completed_trip) — NO actual test files yet
```

No `node_modules`, no build outputs, no `.env` files, no `design/` or `stitch/` directories at the root, no CI workflows, no `.github/`.

---

## Existing projects

| Project | Language / framework | Entry points | Build / run | Dependency files |
|---|---|---|---|---|
| Doc pack — newest (`namma-lorry-phase1-docs/namma-lorry-phase1-docs/`) | Markdown + SQL (Postgres 15 / PostGIS / pg_cron) | `CLAUDE.md`, `README.md` | `psql -f` smoke test; `supabase db reset` once Docker + CLI exist | none |
| Doc pack — old (`namma-lorry-phase1-docs/`) | same | same | same | none |
| Root `supabase/` project | SQL only (config + migrations + seed + test helpers) | `supabase/config.toml` | `supabase start` (needs Docker — absent here) | none |
| Stitch mocks (`SCREENS/`) | Static HTML, Tailwind CDN, Google Fonts, inline JS click handlers only | each `code.html` | open in browser | none |
| Expo / React Native app | **does not exist** | — | — | — |
| Kotlin / Android, vanilla-JS GPS prototype, prototype web app | **do not exist** | — | — | — |

The newest pack is a strict superset of the old pack; the only pack files that differ from it are its own `README.md` (adds doc 12/13 rows) and `docs/04` (merges C8 into C6). The old pack's CLAUDE.md/AGENTS.md are identical to the newest pack's.

---

## Docs summary

| File | Summary |
|---|---|
| `README.md` (newest) | Pack index; instructs copying the pack to the repo root so `CLAUDE.md`, `docs/`, `supabase/` sit top-level. Lists client inputs still outstanding: privacy policy, threshold sign-off, brand assets, Play background-location declaration, pilot list. |
| `CLAUDE.md` / `AGENTS.md` (identical) | Locked stack: Expo + TS strict + Expo Router, EAS dev builds, **Mappls only**, expo-location/task-manager/sqlite, Supabase, TanStack Query, Zustand, RHF+zod. 10 hard rules (server-only verification; status via RPCs only; idempotent `(trip_id, seq)`; top-level location task; SQLite-first queue; secrets in Edge Functions; `.native`/`.web` map split; web = console; RLS in every migration; i18n). Folder layout + definition of done. |
| `DESIGN.md` / `stitch/DESIGN.md` (identical) | Design brief: Ink Navy #0F2A44, Highway Amber #F5A300, status colours, Noto Sans, 8 px grid, 48 px min targets, Material Symbols **Rounded**, map style, canonical sample data (Murugan S, TN 23 BK 4521, NL-2026-000142/143). |
| `docs/01-project-plan` | 7-week plan from Mon 28 Sep 2026; W0 setup + Mappls spike on Android/iOS/web; accounts & cost table; risk register (Mappls native config, OEM battery killers, store reviews, spoofing, earlier client spec of Kotlin + OSM). |
| `docs/02-PRD` | Goals (≥95 % complete tracks, ≥80 % auto-verify, zero driver-editable data, ≤60 s live delay, ≤2 taps), non-goals, personas, P0-1…P0-13 with acceptance criteria, P1/P2, success metrics, 6 open client questions (3 blocking before W1). |
| `docs/03-TRD` | Architecture diagram, stack table, repo structure (differs from CLAUDE.md layout), tracking engine (state machine, `TRACKING_OPTIONS` 10 s / 25 m BestForNavigation + foreground service, SQLite `point_queue`, uploader 200 rows / 30 s / backoff), `AppMapProps` map abstraction, backend tables/RPCs/trigger/cron, `mappls-proxy`, realtime, NFRs, environments. |
| `docs/04-screen-navigation` (newest) | Expo Router route tree (auth/onboarding/driver/console), root routing flowchart, driver trip flow, per-screen specs A1–A2, O1–O2, D1–D6, C1–C10 — with C8 merged into C6. |
| `docs/06-api-contracts` | Exact RPC signatures + error codes for `start_trip`, `end_trip`, `admin_review_trip`; RLS access patterns; point row shape; realtime subscription; `mappls-proxy` actions; status label mapping. |
| `docs/07-apis-and-services` | Use: Mappls SDKs/APIs, expo-*, Supabase, Sentry, Vercel/Netlify, GH Actions. Paid: Apple $99/yr, Play $25, SMS+DLT. Avoid: OSM/Google/Mapbox tiles, `react-native-maps`, Transistor bg-geo, Mappls InTouch. Key-handling table. |
| `docs/08-verification-rules` | Official km = PostGIS geodesic sum, drop points accuracy > 50 m and segments > 150 km/h; 10 reason codes with thresholds in `app_settings`; runs at end_trip / trigger / 6 h sweeper; admin review guidance. Needs client sign-off. |
| `docs/09-security-privacy-compliance` | DPDP measures (consent via 0002 + `record_consent`), Play background-location declaration + video, iOS purpose strings, app security controls, anti-fraud threat model, privacy-policy outline. |
| `docs/10-test-plan` | pgTAP / Jest+RNTL / Playwright / optional Maestro; emulator GPX routes; field-test device matrix (Xiaomi/Vivo/Samsung/Realme/iPhone); 12 acceptance scenarios. |
| `docs/11-build-prompts` | Per-milestone copy-paste prompts W0–W6 (superseded by doc 13). |
| `docs/12-screens-and-stitch-prompts` | **Supersedes doc 04's screen list.** 21 screens + 6 overlays; S1–S4, D1–D8, C1–C9; Stitch prompts per screen; exports are visual reference only; save chosen designs in `design/`, tokens in `src/theme/tokens.ts`. |
| `docs/13-claude-code-prompts` | **Supersedes doc 11.** Prompt 0 = audit, Prompt 1 = plan, M1–M11 = Prompts 2–12, M12a/b/c = Prompts 13–15. Prerequisite: pack at repo root, design PNGs in `design/` named by screen ID, commit per prompt on a branch. |
| `docs/PHASE1_TASKS.md` | Prompt-1 output: decisions table, versions, proposed layout, ND-1…ND-24 (open decisions/contradictions), M1–M12 with tasks/acceptance/human checkpoints, screen checklist, P0 traceability, risk register, progress log. |
| `docs/00-repo-audit.md` | Previous audit (26 Sep). Content superseded by this file; PHASE1_TASKS references to it remain valid. |

**Stitch design images (`SCREENS/*/screen.png`):** sign in, verify OTP, location permission, battery setup, my trips home, trip detail & start, active trip, trip summary (verified variant), trip history, my profile, plus the brand logo (SVG wordmark). **Not designed:** S1 Splash, S4 Access Notice, state variants/overlays, and all 9 console screens (C1–C9).

---

## Prototype feature inventory

**No prototype exists.** Nothing in the repo implements GPS capture, sampling, distance maths, jitter filtering, storage or backend calls. Re-grep of all `SCREENS/*/code.html` confirms: **no** `navigator.geolocation`, no `localStorage`, no `fetch()` — the only JavaScript is UI behaviour (keypad, language drawer, button state toggles).

What the Stitch mocks are worth:
- **Reusable as visual spec:** layout, hierarchy, copy for the 10 driver screens, the logo SVG, Tailwind colour values; icons are Material Symbols **Rounded** in 3 files (not only Outlined — the previous audit's ND-16 conflict is now only partial).
- **Not reusable as code.** Doc 12 §3 says the real app is React Native.
- **Scope creep baked into the mocks — re-confirmed by grep in 8 of 10 HTML files.** Must not be carried into the build: FASTag balance, "Fleet SOS", "Active corridor" card, shipper star ratings, e-Way Bill & Gate Pass match, "Driver Tier 1 Certified", POD Signed / Settlement / diesel litres / toll re-upload in History, "Live Trip Navigation" title (turn-by-turn is a non-goal), unverifiable claims ("AIS-140 GPS", "Government of India Logistics Registry Compliant", made-up support phone), **disclosure copy that contradicts doc 09** (permission screen says location "unlocks priority loads and verified payouts"), unmasked phone + second vehicle plate + "Since Oct 2024" in Profile.
- **Map placeholders** are generic (no Google watermark found in the HTML; the previous audit's imagery note stands corrected — the placeholders are simple grey/map-styled blocks, but they are still not Mappls and must be replaced by `@/components/map/MapView`).

---

## Supabase state

| Item | State |
|---|---|
| Local project initialised | **Yes at the root** — `supabase/config.toml` (423-line standard init, `project_id = "namma-lorry-phase1"`). The packs themselves still contain no config. |
| Supabase CLI | Not installed in this sandbox; latest on npm ≈ 2.118.x, runnable via `npx supabase` / `bunx supabase`. |
| Docker (required by `supabase start`) | **Not available in this Freebuff sandbox** — local Supabase must run on the user's machine or against a hosted project. |
| Migrations | `0001_phase1_schema.sql` (507 lines; identical across all three locations) + `0002_consent.sql` (already written at root — it was only *planned* in the last audit). |
| Functions | None. `mappls-proxy` (docs 03/06) and `admin-create-driver` (doc 13 P7) are specified but not written. |
| Tests | `supabase/tests/_helpers.psql` is a solid pgTAP helper set (role switching, user/vehicle/load/trip factories, track insertion, completed-trip builder). **No `*.test.sql` files exist** — the M4 pgTAP suite is entirely unwritten. The packs' `smoke_phase1.sql` is psql-only (`\set`, `\g /dev/null`), not runnable by `supabase test db`. |
| Remote projects (staging/prod) | None referenced anywhere. |

### Is migration 0001 applicable as-is?

**Very likely applies cleanly** (same conclusions as the prior audit, re-checked against the root copy): extensions under `extensions` schema, qualified PostGIS calls in generated columns, `search_path` set on SECURITY DEFINER functions, RLS enabled on every table, grants revoked on internal functions, `trip_live` added to the realtime publication, pg_cron scheduled. It has **not** been executed here (no Docker).

Confirmed by direct reading — issues that belong in migration `0003+`:

1. **Auto-driver signup (high).** `handle_new_user()` inserts a `profiles` row (default role `driver`) for *every* new `auth.users` row — any OTP sign-in self-registers. Contradicts PRD P0-1 ("unknown numbers see Contact Namma Lorry") and leaves no path for C8 "Add driver" (needs an admin-only Edge Function + `signInWithOtp({ shouldCreateUser: false })`).
2. **Poison batch / clock skew (high).** `points_driver_insert` WITH CHECK requires `recorded_at >= started_at - 1 min` and `<= now() + 2 min`. A WITH CHECK failure aborts the whole statement, so one bad row fails the entire 200-row batch upsert; the uploader (TRD §4.3) would retry the same batch forever.
3. **Admin write bypass (medium).** `trips_admin` is `for all` — an admin client can directly `update trips set status/tracked_distance_m`, bypassing `apply_verified_stats` and the audit trail; contradicts CLAUDE.md rule 2. No `cancel_trip` RPC, so `cancelled` is unreachable except by that bypass.
4. **Stationary-truck gap conflict (high, design).** Tracking samples on `distanceInterval: 25` m (TRD §4.2); a parked truck emits nothing, tripping `max_gap_minutes = 15` and `min_points_per_hour = 60` on genuine trips. Needs the ND-6 heartbeat/moving-time decision before W3.
5. **Minor:** `GPS_JUMPS` threshold hard-coded `> 5` at line 322 (not in `app_settings`); only `trip_live` (not `trips`) is in the realtime publication, so D6's "Verifying → Verified" needs polling or a migration; `setting()` has no fixed `search_path` (linter warning).

`0002_consent.sql` is small and correct: adds `consent_version`/`consent_at`, SECURITY DEFINER `record_consent(p_version)` restricted to the caller's own active row, grants to `authenticated` only.

---

## Environment & tooling

This audit runs inside a **Freebuff Cloud Linux sandbox** (the previous audit described the user's Windows machine — both matter: the sandbox builds/tests/web, the user's machine builds Android/iOS natives).

| Tool | Sandbox (here) | Notes |
|---|---|---|
| OS | Linux (Freebuff workspace) | Not Windows; no Xcode — iOS builds remain an EAS-cloud topic regardless |
| Node | v22.23.2 | Fine for Expo tooling |
| npm / Bun | 10.9.8 / 1.4.2 | Bun available if the team prefers |
| git | 2.34.1 | Repo exists; branch `main`; 1 commit; clean; origin `github.com/santhosh2564/Namma-Lorry-V1` (Freebuff-managed credential, nothing persisted locally — expected) |
| Docker | **absent** | Blocks `supabase start` locally in this sandbox |
| Java / Android SDK / adb / Gradle | **absent** | Native Android builds impossible here; belong on the user's Windows machine (JDK 17 + SDK already set up there per the previous audit) |
| Expo / EAS / Supabase CLIs | not installed | All runnable ad-hoc via `npx` / `bunx` |

**.env files:** none present (correct — `.gitignore` excludes them). Variable **names** from `namma-lorry-phase1-docs/.env.example` (both packs, identical):
- Public (app bundle): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY`, `EXPO_PUBLIC_APP_ENV`
- Server-only (Edge Function secrets): `MAPPLS_CLIENT_ID`, `MAPPLS_CLIENT_SECRET`, `MAPPLS_REST_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SENTRY_DSN`

`freebuff-env list` shows **no keys configured** in this workspace. No Mappls key, Supabase URL/anon key, or Sentry DSN exists anywhere yet — all must come from the user.

**Git:** `main` @ `72c6e2a` — single commit containing all 71 files (schema, docs ×3 copies, screens, smoke test, PHASE1_TASKS). Nothing staged; nothing untracked. Commit-per-prompt workflow (doc 13) can proceed on branches.

**Mappls RN SDK risk (carried forward, unchanged):** `mappls-map-react-native@2.0.3` was built against RN 0.79 while current Expo SDK ships a newer RN, and its shipped `app.plugin.js` requires a file that isn't in the package — plan the local `plugins/withMappls.ts` from doc 13 P4 and verify against the current SDK readme in M3.

---

## Gap analysis (reuse / conflict / missing)

### Reuse
- The **newest doc pack** (docs 01–13, `stitch/DESIGN.md`, `.env.example`) as the single source of truth.
- Root `supabase/` — keep as the canonical backend: migration 0001 (base schema), 0002 (consent, already written), seed.sql (matches DESIGN.md sample data and helpers), `_helpers.psql` (pgTAP foundation).
- `smoke_phase1.sql` scenarios as the seed for the pgTAP suite.
- Stitch PNGs + logo SVG as visual spec for the 10 driver screens (strip the scope-creep list above).
- `docs/PHASE1_TASKS.md` as the execution plan — its ND/milestone structure is still accurate after this re-audit.

### Conflicts
- Root `04-screen-navigation.md` and `README.md` are **stale older revisions** of pack files — they must lose to the pack versions in pre-flight (or simply be deleted as part of it).
- **Three copies of the docs** (root loose files, old pack, nested pack + zip) guarantee drift; pre-flight must collapse to one canonical set.
- Stitch mocks vs PRD/doc 09: scope creep and non-compliant disclosure copy (list above).
- `SCREENS/namma_lorry/DESIGN.md` token palette differs from the design brief (primary #00152a vs #0F2A44, etc.) — the brief wins (ND-17).
- No Kotlin, OSM, other map SDK, or localStorage code exists — the earlier client spec of "Kotlin + OSM" is a contractual open question only (PRD §8), not a code conflict.

### Missing entirely
- The Expo app: `package.json`, `app.config.ts`, `eas.json`, `tsconfig`, lint/prettier/jest config, `app/` routes, all of `src/` (components, features, tracking, lib, theme, i18n), `src/lib/database.types.ts`.
- `plugins/withMappls.ts` (local Expo config plugin).
- `supabase/functions/mappls-proxy` and `supabase/functions/admin-create-driver`.
- pgTAP test files (helpers exist; zero cases), `0003_phase1_fixes.sql` (ND-8/12/13/14 + GPS_JUMPS + not-found + search_path items).
- CI (`.github/workflows/`), Sentry setup.
- Designs for the 9 console screens, S1 Splash, S4 Access Notice.
- Client inputs: written RN+Mappls sign-off, PRD §8 answers, doc 08 threshold sign-off, privacy policy URL, app icon/splash, pilot list.
- **Accounts and keys: nothing exists** — no Mappls credentials, no Supabase project (local or hosted), no Expo/EAS account link, no Apple/Play accounts, no Sentry DSN. In this workspace `freebuff-env list` is empty.

---

## Doc contradictions

Carried from the previous audit and re-verified against the newest pack — these mirror `docs/PHASE1_TASKS.md` ND-8…ND-24 (details there):

1. Three screen-numbering schemes (doc 04 old root copy vs pack doc 04/12 vs `SCREENS/` folder names); doc 11's prompts still use doc 04 IDs.
2. Route tree in the root doc 04 copy is stale (`review/[id].tsx` present; no S1/S4 routes).
3. Folder layout differs between CLAUDE.md, TRD §3, doc 12/13 (ND-9); `stitch/DESIGN.md` and `design/` referenced by doc 12 don't exist yet.
4. Two design-token palettes (brief vs Stitch M3 tokens) — brief wins (ND-17); icons now mostly Rounded (ND-16 mostly resolved).
5. `SENTRY_DSN` listed server-only but the app needs it bundled; `SENTRY_AUTH_TOKEN` unlisted (ND-11).
6. Sampling vs verification: 25 m distance sampling can't satisfy gap ≤ 15 min / ≥ 60 points/h while stationary (ND-6).
7. Unregistered numbers refused (PRD) vs auto-driver signup (0001) (ND-12).
8. Status-changes-only-via-RPC (rule 2) vs admin `for all` on `trips` (ND-13).
9. Realtime on `trips` needed by D6 but not in the publication (ND-14).
10. Live-delay target ~30 s (doc 01) vs ≤ 60 s (PRD/doc 10) (ND-15).
11. Console prompts reference data the schema lacks (permission dot, invite SMS, shipper/owner selects, CSV export) (ND-19); loads list status derivable only from trips (ND-20).
12. W0 exit criterion requires iOS, which no available environment can produce (sandbox has no Xcode; user's machine is Windows) — needs the ND-3 deferral decision.

---

## Risks & blockers

| # | Risk / blocker | Severity | Notes |
|---|---|---|---|
| 1 | Mappls RN SDK vs current Expo/RN compatibility unproven; shipped config plugin broken | High | M3 spike first; local `withMappls.ts`; fallback = pin older SDK (ND-7) |
| 2 | No Mappls developer account / keys (map SDK key + REST client id/secret) | High, blocks M3/M6 | ND-2 |
| 3 | iOS builds impossible in every current environment (no macOS, no Xcode in sandbox; Windows host) | High for iOS scope | Needs Apple Developer account + EAS cloud builds + physical device (ND-3), or defer iOS |
| 4 | No Supabase project; Docker absent in sandbox | Medium, blocks M4 run | Use the user's machine (Docker Desktop) or a hosted staging project (ND-4) |
| 5 | Poison-batch / clock-skew RLS on point uploads | High (data loss per trip) | Fix in 0003 before the tracking engine (ND-8) |
| 6 | Stationary-truck false TRACKING_GAP / LOW_COVERAGE | High (auto-verify target) | ND-6 decision before W3 |
| 7 | Driver onboarding path (auto-signup vs admin-created) | Medium, blocks M5/M6 | ND-5 + ND-12 |
| 8 | Three doc copies + two stale root duplicates | Medium (drift) | Pre-flight consolidation |
| 9 | Console screens undesigned | Medium | Build from doc 12 specs + UI kit |
| 10 | Stitch mocks carry scope creep + non-compliant disclosure copy | Medium | ND-18; record in `design/README.md` |
| 11 | Chinese-OEM background killing | High | D2 battery screen, foreground service, field matrix |
| 12 | Production SMS OTP needs DLT + paid provider | Medium for pilot | Supabase test numbers until then |
| 13 | Client sign-offs outstanding (RN+Mappls, thresholds, driver registration, retention) | High (contractual) | ND-5 |
| 14 | pgTAP suite unwritten | Medium | M4 deliverable; helpers already in place |

---

## Recommendation

**Start a fresh Expo app in this repo** — nothing adaptable exists. Concretely, in this order:

1. **Pre-flight (one commit):** promote the newest pack to the root (`CLAUDE.md`, `AGENTS.md`, `.env.example`, `docs/01–13`, `supabase/` content, `stitch/DESIGN.md`), delete the three-copy duplication and the two stale root files (`04-screen-navigation.md`, `README.md`) after diff-verification, keep the **root `supabase/`** as the canonical backend folder (it already has config + 0001 + 0002 + seed + helpers), move `SCREENS/` → `design/stitch/` renamed by doc-12 IDs, add `design/README.md` listing ignored elements (ND-18), delete the nested pack and its zip. Answer ND-1…ND-7 in PHASE1_TASKS.
2. **M1 (Prompt 2):** scaffold the Expo app at the repo root exactly per doc 13 P2 — pinned versions, ESLint/Prettier, `@/` alias, Jest+RNTL, `app.config.ts` + zod-validated `src/lib/config.ts`, `eas.json`, GH Actions CI, placeholder route per screen, doc-layout reconciliation (ND-9). Web (`expo start --web`) is the only runnable surface in this sandbox until the user wires native tooling; typecheck/lint/test all run here.
3. **M3 spike decides SDK pinning** (ND-7) on the user's machine; the sandbox can do the web half (MapView.web.tsx + Mappls JS SDK) once `EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY` exists.
4. **M4 needs a database**: either hosted Supabase staging (recommended — avoids Docker entirely and unblocks the pgTAP suite + types) or local Docker on the user's machine.

Proposed final layout: as in `docs/PHASE1_TASKS.md` §1.3 (adopted, with `supabase/` at the root kept as-is and `design/` receiving the Stitch exports).

---

## Questions

Only the ones that block progress (they correspond to PHASE1_TASKS ND-1…ND-7; renumbered here):

1. **Mappls access (ND-2):** do you have a Mappls developer account? Which credentials does it give (map SDK key, REST client id/secret), and is the web SDK enabled/domain-restricted?
2. **iOS scope (ND-3):** is there an Apple Developer account + physical iPhone, or should W0/M3's exit criterion be reduced to Android + web with iOS deferred?
3. **Supabase (ND-4):** hosted staging project (recommended, works from this sandbox) or local via Docker on your machine? If hosted, share the project URL + anon key via the Keys/Environment settings.
4. **Client sign-offs (ND-5):** written RN+Mappls approval, and who registers drivers — admin only vs self-signup with approval? This decides the auth/registration design in M5.
5. **Stationary trucks (ND-6):** approve a periodic heartbeat point while parked (or judging gaps on moving time only)? Docs 03/08 must change before M8.
6. **SDK pinning (ND-7):** if the Mappls spike fails on the latest Expo SDK, is pinning an older SDK acceptable?
7. **Pre-flight approval (ND-1, adapted):** confirm the restructure from §Recommendation step 1 — promote the newest pack, keep root `supabase/`, rename `SCREENS/` → `design/`, drop duplicates and the nested pack. (The old "move out of OneDrive" concern is void in this workspace; relocation is no longer needed.)
