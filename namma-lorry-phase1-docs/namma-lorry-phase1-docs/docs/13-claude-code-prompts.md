# 13 — Claude Code Prompts: Full Phase 1 Implementation

Supersedes the short prompts in `11-build-prompts.md`. Run them **in order, one per session**.

## How to run these
- Put this docs pack in the repo root first (`CLAUDE.md`, `docs/`, `supabase/`, `stitch/`). Put Stitch exports (PNG) in `design/` named by screen ID, e.g. `design/D5-active-trip.png`.
- Start each prompt in **plan mode** (Shift+Tab in Claude Code). Read the plan, correct it, then let it execute.
- `/clear` between prompts. The repo docs + `docs/PHASE1_TASKS.md` carry the context forward, not the chat.
- Commit after every prompt (`git commit` on a branch per step). If a step goes badly, reset and re-run the prompt rather than patching for hours.
- 🧍 = a human checkpoint. Stop and do it yourself (run on a real phone, paste keys, click in a console) before the next prompt.

---

## PROMPT 0 — Understand the repo (read-only)
```
You are joining an existing project folder. Do NOT modify, create, install or delete anything in this step except the one report file named at the end. This is a read-only discovery pass.

Goal: build a complete, accurate understanding of what is already in this folder so we can plan the Namma Lorry Phase 1 build from reality, not assumptions.

1. Map the repository:
   - List the full directory tree (skip node_modules, .git, build outputs). Note file counts and sizes per top-level folder.
   - Identify every project/app inside (e.g. an old vanilla-JS web prototype, a Kotlin/Android project, an Expo/React Native project, Supabase folder, docs). For each: language, framework, entry points, build/run commands, dependency files and versions.
2. Read all documentation: CLAUDE.md, AGENTS.md, README*, everything in docs/, any appknowledge.md or similar knowledge files, stitch/DESIGN.md, and list the images in design/ if present. Summarise each doc in 2–4 lines.
3. If there is an existing prototype (for example a vanilla-JS GPS/distance telemetry prototype): read its code and list every feature it implements — GPS capture method, sampling interval, distance formula, filtering/jitter handling, storage, UI screens, any backend calls. Note which logic is worth porting and which conflicts with our docs.
4. Supabase: inspect supabase/ (config, migrations, functions, tests). State whether a local Supabase project is initialised, and whether migration 0001 looks applicable as-is.
5. Environment: check for .env files (report variable NAMES only, never values), git status/branches/recent commits, Node/npm/Java/Xcode versions if detectable, and whether expo / eas / supabase CLIs are available.
6. Compare what exists against docs/02-PRD.md, docs/03-TRD.md, docs/12-screens-and-stitch-prompts.md and CLAUDE.md. Produce:
   - What already exists and is reusable
   - What exists but conflicts with the docs (e.g. Kotlin code, OpenStreetMap usage, other map SDKs, localStorage-based storage)
   - What is missing entirely
   - Contradictions or ambiguities between the docs themselves
7. Risks and blockers you can already see (missing keys, missing accounts, SDK compatibility, OS/tooling).
8. A recommendation: start a fresh Expo app in this repo vs. adapt an existing app folder — with reasons — and the proposed final folder layout.
9. Questions for me, numbered, only the ones that block progress.

Write everything to docs/00-repo-audit.md with these headings: Summary · Repository map · Existing projects · Docs summary · Prototype feature inventory · Supabase state · Environment & tooling · Gap analysis (reuse / conflict / missing) · Doc contradictions · Risks & blockers · Recommendation · Questions.

Then stop and give me a 10-line summary in chat. Do not start building.
```
🧍 Read `docs/00-repo-audit.md`, answer the questions (edit the file or reply), and fix anything it got wrong.

---

## PROMPT 1 — Master implementation plan
```
Read CLAUDE.md, docs/00-repo-audit.md (including my answers), and every file in docs/ plus supabase/migrations/0001_phase1_schema.sql.

Create docs/PHASE1_TASKS.md — the single source of truth for Phase 1 progress. Structure:
- Decisions (stack, versions, folder layout, "fresh vs adapt" decision from the audit)
- Milestones M1–M12 matching the prompts in docs/13-claude-code-prompts.md, each with: tasks as checkboxes, files expected to be created, acceptance criteria copied/adapted from the PRD and docs/10-test-plan.md, and human checkpoints
- A traceability table: every PRD requirement P0-1…P0-13 → milestone → test that proves it
- Screen checklist: all 21 screens from docs/12 with route path and milestone
- Risks carried from the audit
- A "Progress log" section at the bottom where each future session appends: date, milestone, what changed, what's left, known issues

Rules: do not write application code in this step. If anything in the docs is contradictory, list it under "Needs decision" instead of guessing. Stop and summarise.
```
🧍 Approve or edit the plan.

---

## PROMPT 2 — M1: Scaffold the app
```
Implement milestone M1 from docs/PHASE1_TASKS.md.

- Create (or adapt, per the audit decision) an Expo app with TypeScript strict and Expo Router, using the folder layout in CLAUDE.md. Use the latest stable Expo SDK and pin versions.
- Install and configure: @supabase/supabase-js, expo-secure-store, expo-location, expo-task-manager, expo-sqlite, @react-native-community/netinfo, expo-device, expo-application, expo-dev-client, @tanstack/react-query, zustand, zod, react-hook-form, i18next + react-i18next.
- Tooling: ESLint + Prettier, path alias @/ → src/, Jest (jest-expo) + React Native Testing Library, scripts: typecheck, lint, test.
- app.config.ts reading EXPO_PUBLIC_* env vars; .env.example kept in sync; src/lib/config.ts validates env with zod and fails loudly in dev.
- eas.json with development / preview / production profiles.
- GitHub Actions workflow: install, typecheck, lint, test.
- Placeholder routes for every screen in docs/12 so navigation compiles (each renders its screen ID and title).
- Port nothing from any old prototype yet.

Done when: typecheck, lint and tests pass; `npx expo start --web` renders the placeholder sign-in route. Update PHASE1_TASKS.md checkboxes and progress log. Commit.
```

---

## PROMPT 3 — M2: Design tokens & UI kit
```
Implement M2. Source of truth for visuals: stitch/DESIGN.md, docs/12-screens-and-stitch-prompts.md §4, and the images in design/ (if present).

- src/theme/tokens.ts: colours, typography scale (Noto Sans via expo-font), spacing (8 px grid), radii, shadows, status colours.
- src/components/ui/: Button (primary, secondary, danger, success, outline, text; sizes incl. the 64 px driver primary; loading + disabled), Card, Chip/StatusChip (all 6 trip statuses, text + colour + icon), TextField, PhoneInput (+91), OtpInput (6 boxes), ListRow, Banner (info/warn/error/offline), BottomSheet, ConfirmSheet, EmptyState, StatBlock (big tabular number + label), Screen (safe-area aware, scroll/keyboard handling), SectionHeader.
- Web-only console shell primitives: Sidebar, TopBar, DataTable (sortable, sticky header, pagination), Drawer, Modal.
- Icons: Material Symbols Rounded (or the closest maintained RN package).
- A dev-only route /dev/kitchen-sink showing every component and state.
- Unit tests for StatusChip mapping and Button states.

Match the Stitch images closely but always use tokens, never raw hex values in screens. Update PHASE1_TASKS.md. Commit.
```

---

## PROMPT 4 — M3: Mappls on Android, iOS and Web
```
Implement M3: the map abstraction (docs/03-TRD.md §5).

- Research the current install steps for mappls-map-react-native from its npm README / GitHub (Android maven repo, iOS configuration files, SDK key setup). Tell me exactly which native files and keys are required before writing code.
- Because we use Expo dev builds, write a local config plugin plugins/withMappls.ts that applies the Android and iOS native changes during prebuild. Do not commit manually edited android/ or ios/ folders unless the plugin approach is impossible — explain if so.
- src/components/map/types.ts (AppMapProps exactly as in the TRD), MapView.native.tsx (MapplsGL MapView, Camera, ShapeSource/LineLayer for polylines, circles as polygon approximations, markers incl. rotated truck marker), MapView.web.tsx (Mappls Web SDK loaded once through a script loader hook, same props).
- Convert {lat,lng} ↔ [lng,lat] only inside map components; add unit tests for geo helpers in src/lib/geo.ts (haversine, circle polygon, bearing).
- Dev route /dev/map showing a pickup circle, a drop pin, a planned dashed route, an actual route and a truck marker, plus a "fit to content" button.
- Never add any non-Mappls map or tiles.

Stop after writing the code and list the exact commands for me to build and run a development build on Android and iOS.
```
🧍 Add Mappls keys/config files, run `eas build --profile development` (or `npx expo run:android`), confirm the map renders on a real phone and on web. Report problems back in the same session before moving on.

---

## PROMPT 5 — M4: Supabase backend
```
Implement M4.

- Initialise Supabase locally if needed (supabase init / start). Apply supabase/migrations/0001_phase1_schema.sql unchanged; if it fails on the Supabase version, create a follow-up migration rather than editing 0001, and explain why.
- Add migration 0002_consent.sql: profiles.consent_version, profiles.consent_at, and a SECURITY DEFINER RPC record_consent(p_version text) for the current user only.
- Convert supabase/tests/smoke_phase1.sql into pgTAP tests in supabase/tests/: every RLS policy (driver cannot update trips, insert stats, read other drivers' trips/points; admin can), every RPC error code in docs/06, every verification reason code in docs/08, late-point upload triggering verification, sweeper behaviour, admin review incrementing stats exactly once.
- Seed file supabase/seed.sql for local dev: 1 admin, 3 drivers (test phone numbers), 3 vehicles, 4 loads on real Tamil Nadu/Karnataka coordinates, 1 assigned trip.
- Generate TypeScript types to src/lib/database.types.ts and a typed client in src/lib/supabase.ts (secure-store session on native, localStorage-safe default on web).
- Document test phone numbers/OTP setup for local and hosted Supabase in docs/DEV_SETUP.md.

Done when `supabase db reset && supabase test db` passes. Update PHASE1_TASKS.md. Commit.
```

---

## PROMPT 6 — M5: Auth, roles and routing
```
Implement M5: screens S1 Splash, S2 Sign in, S3 Verify OTP, S4 Access Notice, and root routing exactly as docs/04 §2.

- Phone OTP via Supabase auth; +91 validation with zod; resend timer; error states from docs/12 (unregistered number, wrong code, expired, rate limit).
- Auth store (zustand) + TanStack Query for profile. Role gate: driver on native → onboarding/trips; driver on web → S4 "use the mobile app"; admin → console; owner/shipper → S4 "coming soon"; inactive → S4 deactivated variant.
- Splash must first check the local tracking state (a stub for now; real check comes in M8) so an active trip can be resumed later.
- Sign-out blocked while a trip is active (stub flag for now).
- Screens must match design/ images using the UI kit.
- Tests: routing decisions as a pure function with unit tests for every role/platform combination.

Update PHASE1_TASKS.md. Commit.
```
🧍 Log in as seeded admin and driver on web and phone.

---

## PROMPT 7 — M6: Console shell, drivers, vehicles, Mappls proxy
```
Implement M6.

- Console layout (web): sidebar (Live, Loads, Trips, Review with count badge, Drivers, Vehicles), top bar with search and avatar menu, admin-only guard.
- C8 Drivers: table (name, phone, verified trips, verified km, last trip, status), Add Driver drawer. Creating a driver must go through a new Edge Function admin-create-driver (uses service role to create the auth user + profile; verifies caller is admin). Never expose the service role key to the client.
- C9 Vehicles: table + Add Vehicle modal with Indian registration format validation and vehicle type select.
- Edge Function mappls-proxy exactly per docs/06 §4: verify JWT, check is_admin(), actions autosuggest / geocode / reverse / distance, normalised response shapes, basic per-user rate limit, secrets from supabase secrets. Research the current Mappls REST auth method and endpoints before coding and note them in the function README.
- src/lib/mappls.ts client wrapper with typed responses.
- Tests for the edge functions (Deno test) with mocked Mappls responses.

Update PHASE1_TASKS.md. Commit.
```
🧍 Set Mappls REST secrets in Supabase, deploy functions, try autosuggest.

---

## PROMPT 8 — M7: Loads and assignment
```
Implement M7: C2 Loads, C3 Create Load, C4 Load Detail & Assign, C5 Trips list.

- C3: pickup/drop address autosuggest via mappls-proxy, draggable pin on the map to refine, radius slider 100–2000 m (default 500) drawn as a circle, material, weight, shipper, notes. On save fetch planned distance via the proxy and store planned_distance_m. Load code is generated by the DB.
- C4: map with both geofences and planned route; assign driver (search, show verified stats, warn if driver has a trip in progress) + vehicle; creates a trips row. Show the resulting trip and its status.
- C2 / C5: server-side pagination, filters and search from docs/12; status chips.
- react-hook-form + zod schemas shared in src/features/loads/schemas.ts.
- Playwright test: admin creates a load and assigns it.

Update PHASE1_TASKS.md. Commit.
```

---

## PROMPT 9 — M8: Tracking engine (core, no UI)
```
Implement M8: src/tracking/ exactly per docs/03-TRD.md §4 and docs/06 §1. This is the most important code in the project — be careful and test heavily.

- config.ts: TRACKING_OPTIONS from the TRD.
- db.ts / queue.ts (expo-sqlite): trip_state table {trip_id, state, next_seq, started_at, ended_at, end_lat, end_lng, end_accuracy} and point_queue table from the TRD. seq is persisted and never reused, even across crashes.
- task.ts: TaskManager.defineTask at module top level; imported first in app/_layout.tsx. The task only maps LocationObject → queue rows (including mocked flag) and returns fast. Handle errors without throwing.
- uploader.ts: every 30 s, on NetInfo reconnect and on app foreground: upsert ≤ 200 rows with onConflict trip_id,seq ignoreDuplicates; mark uploaded; exponential backoff with jitter; never runs two uploads at once.
- stateMachine.ts: IDLE → TRACKING → ENDING → ENDED / ENDED_PENDING_SYNC exactly per the TRD, as a pure reducer plus side-effect functions: startTrip(tripId) (fresh high-accuracy fix → rpc start_trip → persist → startLocationUpdatesAsync; never start the task if the RPC fails), endTrip() (stop updates → persist ENDING with ended_at and last seq → flush → rpc end_trip; offline → ENDED_PENDING_SYNC and retry later), resumeOnLaunch() (restarts location updates if state is TRACKING, retries pending end).
- Map RPC error messages to typed errors (OUTSIDE_PICKUP:<m> parsed to metres, etc.).
- A dev route /dev/tracking showing queue counts, state, last point, and buttons to simulate points on web.
- Unit tests: reducer transitions, seq persistence, idempotent upload, backoff, error parsing, offline end → later sync, resume after "kill".

Also wire the real check into Splash (resume active trip). Update PHASE1_TASKS.md. Commit.
```

---

## PROMPT 10 — M9: Driver onboarding and trip start
```
Implement M9: D1 Location Permission, D2 Battery Setup, D3 My Trips, D4 Trip Detail & Start, matching design/ images and docs/12.

- D1: prominent disclosure content from docs/09 §1–§3 shown BEFORE any system dialog; request foreground → background → notifications in order; per-permission status rows; "Open settings" when blocked; record_consent on continue. Re-check permissions on every app foreground; route back to D1 if background location is lost.
- D2 (Android only): detect manufacturer via expo-device; brand-specific instructions for Xiaomi/Redmi/POCO, Vivo/iQOO, Oppo/Realme/OnePlus, Samsung, generic; open battery settings via Linking/IntentLauncher.
- app.config.ts: expo-location plugin with background + foreground service enabled and the exact iOS/Android permission strings from docs/09 §3; UIBackgroundModes location.
- D3: live trip pinned with Resume; assigned trips; empty and offline states; pull to refresh.
- D4: map with pickup circle, drop, planned route, live driver dot; distance to pickup updated from foreground location; states: waiting for GPS, accuracy > 50 m, outside radius (distance shown, button disabled), ready, starting; START calls tracking.startTrip and navigates to D5.

Update PHASE1_TASKS.md. Commit.
```
🧍 On a real Android phone: complete onboarding, go to a seeded pickup (or create a load at your current location), start a trip, lock the phone, walk/drive 10 minutes, check trip_points in Supabase.

---

## PROMPT 11 — M10: Active trip, end trip, summary
```
Implement M10: D5 Active Trip, End Trip confirmation sheet, D6 Trip Summary.

- D5: follows the truck, draws the route from the local queue (not the server), elapsed time, approximate km (client haversine, labelled approx.), km to drop, sync status (synced / N points waiting / offline), GPS status, tracking-problem banner if no point for > 2 min or permission revoked. Near drop (inside drop radius) → banner + solid END button. Android back button must not stop tracking.
- End flow via tracking.endTrip() with the confirmation sheet; warning text when outside the drop radius (never block ending).
- D6: realtime subscription on the trip row (or polling fallback) showing Verifying → Verified / Needs review with plain-language reasons (i18n keys per reason code in docs/08 §3) → totals from driver_stats. Offline-ended variant.
- Keep the screen awake optional setting (expo-keep-awake) off by default.

Tests: component tests for D5 sync/GPS states and D6 status variants. Update PHASE1_TASKS.md. Commit.
```
🧍 Real trip test: start, 20 min airplane mode mid-trip, end offline, reconnect → must verify with zero missing points.

---

## PROMPT 12 — M11: Live console, review, history, profile
```
Implement M11: C1 Live Dashboard, C6 Trip Detail & Review, C7 Review Queue, D7 Trip History, D8 My Profile.

- C1: all in_progress trips from trip_live on the Mappls web map, markers rotated by heading, side list with last-update age (red when > 15 min), KPI strip; realtime postgres_changes with resubscribe + refetch on reconnect.
- C6: route loaded from trip_points (paginated, 1000 per page) + live append via realtime; planned route dashed; start/end markers; replay slider with play/pause over recorded points; verification metrics and reason chips; event timeline from trip_events; review panel (only when needs_review) calling admin_review_trip with mandatory note; optimistic UI disabled — refresh from server after the decision.
- C7: needs_review trips oldest first with reason chips and mini map; opens C6; empty state.
- D7: filters by status, grouped by month, links to D6.
- D8: read-only stats from driver_stats with the "can't be edited" caption, language picker sheet, permission/battery health check, privacy policy link, sign out (blocked during active trip).

Update PHASE1_TASKS.md. Commit.
```

---

## PROMPT 13 — M12a: Hardening, i18n, observability
```
Hardening pass across the whole app.

- i18n: move every user-facing string to src/i18n/en.json; add ta.json, kn.json, hi.json with the same keys (mark untranslated values with a TODO prefix so a human translator can finish). Language persists per user.
- Error handling: global error boundary, network error states on every data screen, user-friendly messages for every RPC error code.
- Sentry (@sentry/react-native + web) with release tagging; scrub PII (phone numbers, coordinates) from events.
- Accessibility: labels on all touch targets, 48 px minimum, dynamic font scaling doesn't break D4/D5, contrast check against tokens.
- Performance: memoise map layers, cap polyline points drawn on screen (simplify with Douglas-Peucker for display only), make sure the background task does no network I/O.
- Security review against docs/09 §4–§5: grep for secrets, confirm no client code updates trips/driver_stats directly, confirm service role key only in edge functions, check RLS tests still cover every table.
- Clean up dev-only routes behind __DEV__.

Produce docs/HARDENING_REPORT.md listing what was checked and fixed. Update PHASE1_TASKS.md. Commit.
```

---

## PROMPT 14 — M12b: Test the acceptance scenarios
```
Work through every acceptance scenario in docs/10-test-plan.md §4.

- For each scenario that can be automated (DB-level, unit, Playwright, Maestro with emulator GPX routes), write or extend the test and run it.
- For each scenario that needs a real device, write a precise manual test script in docs/FIELD_TEST_SCRIPT.md (steps, expected result, what to record: points expected vs received, max gap, battery %, data used, verification result) and a results table template.
- Add GPX files for 2 real routes (Sriperumbudur → Coimbatore, Hosur → Peenya) under test/gpx/ for emulator testing.
- Fix any failures you find. List anything you couldn't verify.

Update PHASE1_TASKS.md with a pass/fail matrix. Commit.
```
🧍 Run the field test script on the brand matrix in docs/10 §3 and paste results into the file.

---

## PROMPT 15 — M12c: Release preparation
```
Prepare Phase 1 release.

- app.config.ts: app name, bundle id / package, version + build numbers, icons and splash from design/ (tell me which assets are missing), permission strings, Android foreground service config verified in the prebuild output.
- EAS: preview (internal testing APK/AAB + TestFlight) and production profiles; environment variables per profile; EAS Update channel setup.
- Web console: `npx expo export -p web`, deploy config for Vercel (or Netlify), SPA fallback routing, security headers.
- Hosted Supabase: checklist to link staging/production projects, push migrations, set secrets, deploy functions, enable pg_cron job, configure SMS provider for phone auth.
- Store paperwork drafts in docs/release/: Play background-location declaration text + demo video shot list, Play Data safety answers, Apple App Privacy answers, App Review notes with demo account instructions, privacy policy page (markdown) following docs/09 §6, marked "requires legal review".
- docs/RUNBOOK.md: how to deploy, roll back, rotate keys, handle a stuck trip, re-run verification, and respond to a data incident.

Stop and give me the exact ordered list of manual steps left for me.
```

---

## Reusable prompts

**Resume after a break**
```
Read CLAUDE.md and docs/PHASE1_TASKS.md (especially the progress log). Tell me where we are, what's next, and any known issues. Don't change code until I confirm.
```

**Fix a bug**
```
Bug: <what happened, device/OS, steps, expected vs actual, logs/screenshots>.
First reproduce or locate the cause and explain it. Then propose the smallest fix, write a failing test that captures the bug, fix it, and show the test passing. Don't refactor unrelated code. Log it in PHASE1_TASKS.md.
```

**Review a milestone**
```
Review milestone <Mx> against docs/PHASE1_TASKS.md acceptance criteria, CLAUDE.md hard rules, and docs/09 security rules. Report: done / partially done / missing, any rule violations, risky code, missing tests. Don't fix yet — give me a prioritised list.
```

**Change a requirement**
```
Requirement change: <describe>. First update the affected docs (PRD, TRD, 08, 12, PHASE1_TASKS.md) and show me the diff. After I approve, implement it with a new migration if the DB changes.
```
