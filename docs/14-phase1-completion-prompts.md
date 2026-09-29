# 14 — Phase 1 Completion Prompts (after the M12c review)

## Where the project really is
- **Done:** M1 scaffold, M4 (about half), M11 screens (with a fake map), M12a hardening, M12b server/console tests, M12c release config and docs.
- **Not built:** M2 UI kit, M3 real Mappls map, M5 auth, M6 console + edge functions, M7 loads, M8 tracking engine, M9 onboarding/start, M10 active/end trip. **The driver app does not exist yet.**
- **Open:** P0/P1 issues from the M12c review; decisions ND-5, 6, 8, 12, 13, 14, 25, 26; the doc pack is not at the repo root, so Claude Code isn't loading `CLAUDE.md`.

Most of this happened because prompts ran out of order (M11–M12 before M2–M10) and some ran with the `<placeholder>` text left in. The prompts below fix that:
- Every prompt starts with a **Gate** (prerequisites). If the gate fails, Claude must stop, not work around it.
- Every prompt ends with **Evidence**: command output, screenshots or test names. No ticking a box for cosmetic or stubbed work.
- Fill every `<...>` before sending. If you see `<` in a prompt you're about to paste, stop.

Run in order: **R0 → R1 → R2 → R3 → … → R15**. Plan mode, `/clear` between prompts, one branch + commit per prompt, merge to `main` only when CI is green.

---

## R0 — Stabilise: commit, fix P0/P1 from the review, get CI green
```
Read docs/PHASE1_TASKS.md (progress log + M12c section) and the M12c review findings below. Do not start any new milestone.

1. Commits, in this order, each separate:
   a. The M12c release work already in the tree (app.config.ts, eas.json, vercel.json, package.json/lock, scripts, docs/release, docs/RUNBOOK.md, .gitignore, assets/notification-icon.png, PHASE1_TASKS.md).
   b. scripts/gen-gpx.mjs formatting-only change, as "chore: prettier".
   c. Leave docs/00-repo-audit.md untouched — it contains my edits. Show me its diff and ask before committing it.
2. Fix P0s, each with a test that fails before the fix:
   - scripts/eas-update.mjs: no shell:true argument joining on Windows. Resolve the eas binary and spawn it without a shell (or quote correctly). Test: a message containing spaces and parentheses reaches the child as ONE argument; dirty tree refuses; env EXPO_PUBLIC_APP_ENV equals the channel.
   - .npmrc os=win32 breaks Linux CI: remove it from .npmrc and solve the original Windows problem another way (document what it was for), OR pass --os=linux in every CI npm ci. Prefer removing it. Prove the fix by running the CI steps on GitHub, not locally.
   - src/lib/config.ts: in a non-development build, an invalid/missing env must fail CLOSED — show a blocking "App misconfigured" screen and report to Sentry if possible — never fall back to localhost. Unit tests for development vs preview vs production behaviour.
3. Fix P1s:
   - scripts/provision-user.mjs: --role, --language and is_active change ONLY when the flag is passed explicitly; add --activate; anchor the localhost check to the URL host (new URL(url).hostname in ['127.0.0.1','localhost']). Unit tests for defaults, explicit flags and URL validation (mock the Supabase client).
   - app.config.ts: validate EXPO_PUBLIC_APP_ENV (throw on unknown values); set android usesCleartextTraffic=false for release explicitly (config plugin if needed) and verify in the prebuild manifest.
   - scripts/check-release-assets.mjs: treat palette PNGs with a tRNS chunk as having alpha. Unit tests with generated PNG headers.
4. Add missing tests: an app.config snapshot/assert test (docs/09 §3 strings, no 'fetch' background mode, allowBackup false, blocked permissions, POST_NOTIFICATIONS present, name per env).
5. CI: add steps for release-script tests and `npm run export:web`. Push the branch, open a PR, and iterate until all three CI jobs (check, database, e2e) pass on GitHub.

Gate: none.
Evidence: commit list, the failing-then-passing test names for each fix, and the green GitHub Actions run URL. Update PHASE1_TASKS.md progress log.
```
🧍 Merge the PR to `main` once CI is green.

---

## R1 — Pre-flight: docs to the root, rules corrected, design folder
```
Gate: R0 merged; CI green on main.

1. Promote the newest pack (namma-lorry-phase1-docs/namma-lorry-phase1-docs/) to the repo root: CLAUDE.md, AGENTS.md, docs/01–14, stitch/DESIGN.md. Keep the live root supabase/ (don't overwrite migrations/seed/tests). Delete the verified duplicates (root 02-PRD.md, 03-TRD.md, 04-screen-navigation.md, 13-claude-code-prompts.md, 0001_phase1_schema.sql, README.md copies, the older pack, the zip) after byte-comparing; list what you deleted.
2. Update CLAUDE.md:
   - ND-9: folder layout = what the code actually uses now (src/features, src/tracking, src/lib, src/theme, plugins/, app/console/...).
   - ND-10: web console is admin-only in Phase 1.
   - Add hard rules 11–13:
     11. Never tick a checklist item for stubbed, cosmetic or preview code. Label it and leave it [~] or [ ].
     12. Every prompt starts with its Gate; if a prerequisite isn't met, stop and say so.
     13. If a prompt contains an unfilled <placeholder>, stop and ask.
3. Move SCREENS/ → design/ with doc-12 IDs (design/S2-sign-in.png, design/D5-active-trip.png, …), keep the code.html files as design/html/<id>.html, and write design/README.md listing the out-of-scope elements to ignore (ND-18).
4. Update docs/04 to the real routes (app/console/*, ND-26 resolution pending R2).
5. ND-1: if I answered "relocate", move the repo to <C:\dev\namma-lorry or "stay"> and fix any absolute paths. (Paths with spaces break some Android/Gradle native builds on Windows.)

Evidence: tree of the root, CLAUDE.md diff, design/ listing, CI green.
```

---

## R2 — Decisions + the fixes migration
Paste your decisions into the prompt. My recommended answers are pre-filled — change any you disagree with.
```
Gate: R1 merged.

Record these decisions in docs/PHASE1_TASKS.md §2 (mark each ND as Decided with date), update the affected docs (03, 06, 08, 09, RUNBOOK), then implement them in ONE new migration supabase/migrations/0005_phase1_fixes.sql with pgTAP tests for every change.

- ND-5  Registration: admin only. Raw GPS retention: <12 months, then keep only a simplified route (≤500 pts) and trip results>. Client approval of RN + Mappls: <received on DATE / pending>.
- ND-6  Stationary trucks: judge gaps on movement, not time. A gap only counts as TRACKING_GAP if the straight-line distance across the gap is > app_settings.gap_movement_m (default 1000 m). LOW_COVERAGE uses moving time (time between points that are > 25 m apart). Client side (M8) also sends a heartbeat point every 5 min while stationary.
- ND-8  Upload: add RPC upload_points(p_trip_id uuid, p_points jsonb) → {accepted int[], rejected jsonb[] (seq + reason)}. It inserts valid rows, skips duplicates, returns rejects instead of failing the batch. Keep the RLS insert policy as a second layer. Count rejects into verification_metrics.rejected_points; > 0 rejected-for-time adds reason CLOCK_SKEW.
- ND-12 signInWithOtp({ shouldCreateUser: false }) in the app; hosted sign-ups off; handle_new_user creates profiles with is_active=false unless created via admin-create-driver (which sets it true).
- ND-13 Replace trips_admin FOR ALL with admin SELECT + INSERT only. Add SECURITY DEFINER RPCs that record actor_id = auth.uid() and require a note: cancel_trip (assigned only), admin_force_end (in_progress → completed with MISSING_POINTS guaranteed), admin_revoke_trip (verified → rejected, recompute that driver's stats from trips). Add recompute_driver_stats(driver_id) (internal). Make the existing pgTAP TODO pass.
- ND-14 Add public.trips to the supabase_realtime publication.
- ND-25 Sweeper also handles in_progress trips with no point for > unsynced_grace_hours → admin_force_end logic with actor null and event 'auto_closed'.
- ND-26 Driver home route is /trips; S1 splash at / only redirects.
- Erasure (docs/09 §1): RPC admin_erase_driver(p_driver_id, p_note) — deletes trip_points and trip_live for that driver, blanks name/phone, deactivates, bans the auth user via edge function later; keeps anonymised trip results if <policy allows / delete all>.
- Retention: pg_cron job 'downsample-old-points' that applies the ND-5 policy nightly (Douglas-Peucker in SQL via ST_Simplify on the route) — only after the trip is final.
- GPS_JUMPS threshold (5) moves to app_settings.max_gps_jumps. setting() gets set search_path.

Then rewrite RUNBOOK §5–§6 to use the new RPCs instead of raw UPDATEs, and add an §erasure procedure.

Evidence: pgTAP count before/after, 0 TODO failures, list of new RPCs with their error codes added to docs/06 and src/lib/errors.ts (+ tests).
```

---

## R3 — M3: real Mappls map (the top risk — do it before any more UI)
```
Gate: R2 merged. I have put in .env: EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY, and (if required by the SDK) the Mappls config files at <path>. ND-3 answer: iOS <now / deferred until Apple account>.

Run Prompt 4 (M3) from docs/13 exactly. Additionally:
- Replace src/components/map/MapplsMap.tsx (the "Map preview" that draws lines with Views) everywhere it's used (C1, C6, C7 mini map) with the real MapView from @/components/map/MapView. Delete the preview component.
- Re-check the Vercel CSP (vercel.json) against the real Mappls web SDK: load /console in a production export served locally with the same headers; zero CSP violations in the console.
- If mappls-map-react-native fails on Expo SDK 57 / RN 0.86 after a real attempt, STOP and report: the exact error, what you tried, and options (pin older SDK, patch-package, native module fork). Do not fall back to another map provider.

Evidence: screenshots of /dev/map on web and on the Android dev build (I will provide the phone screenshot), CSP check output, list of removed files.
```
🧍 Build the dev client on a real Android phone, open `/dev/map`, send the screenshot back in the same session.

---

## R4 — M2: tokens and UI kit
```
Gate: R3 merged and real map confirmed on Android + web.
Run Prompt 3 (M2) from docs/13. src/theme/tokens.ts already exists (M12a) — extend it, don't duplicate. Then refactor the M11 screens (C1, C6, C7, D7, D8) to use the new UI kit components with no visual regression.
Evidence: /dev/kitchen-sink screenshots, Jest count, list of M11 files refactored.
```

## R5 — M4 remainder
```
Gate: R4 merged.
Finish M4 per PHASE1_TASKS.md: generate src/lib/database.types.ts from the local DB (add `npm run db:types` and a CI check that the committed types are up to date), type the Supabase client and the M11 data layer with them, write docs/DEV_SETUP.md (test phone numbers/OTP, local stack, seed users), and pgTAP for every RPC error code in docs/06 and every reason code in docs/08 not yet covered.
Evidence: pgTAP totals, CI type-drift check passing.
```

## R6 — M5: auth, roles, routing
```
Gate: R5 merged.
Run Prompt 6 (M5) from docs/13 with the R2 decisions: shouldCreateUser false; unregistered and inactive numbers show the right S2/S4 states; driver home at /trips (ND-26). Playwright: admin login → /console; driver on web → S4. RNTL: S2/S3 states.
Evidence: routing unit-test table (role × platform × state), Playwright results, S2/S3 screenshots next to design/ images.
```

## R7 — M6: console shell, drivers, vehicles, edge functions
```
Gate: R6 merged. Mappls REST credentials set with `supabase secrets set` locally: <yes/no>.
Run Prompt 7 (M6) from docs/13. admin-create-driver sets is_active true (R2 ND-12). Add an admin-deactivate/erase action on C8 calling admin_erase_driver (R2) with a confirm dialog. Apply ND-19: no permission-health dot, no SMS invite toggle; owner select optional.
Evidence: Deno test results, `supabase functions serve` smoke calls, C8/C9 screenshots.
```

## R8 — M7: loads and assignment
```
Gate: R7 merged.
Run Prompt 8 (M7) from docs/13. Load status derived from the latest trip (ND-20). Add "Cancel trip" on C4 using cancel_trip (R2). Playwright: create load → assign → cancel → reassign.
Evidence: Playwright results, a created load with Mappls planned distance shown.
```

## R9 — M8: tracking engine
```
Gate: R8 merged.
Run Prompt 9 (M8) from docs/13 with these changes from R2:
- The uploader calls the upload_points RPC, not a table upsert. Rejected seqs are marked 'rejected' in SQLite (never retried), counted, and reported to Sentry without coordinates.
- Stationary heartbeat (ND-6): while no location update has arrived for 5 min during an active trip, record one point from getLastKnownPositionAsync/getCurrentPositionAsync.
- startLocationUpdatesAsync options include showsBackgroundLocationIndicator: true (docs/09 §3).
- The background task file must pass the existing ESLint no-network guard.
- Resume after kill, offline end → later sync, idempotent retries: unit-tested with a fake SQLite + fake clock.
Evidence: Jest results for src/tracking, /dev/tracking screenshot with simulated points on web, and a 10-minute real-device run (I'll do it) showing points in trip_points.
```
🧍 Real phone: start a seeded trip at your location, lock the phone 10 minutes, check `trip_points`.

## R10 — M9: onboarding and trip start
```
Gate: R9 merged and the 10-minute device run succeeded.
Run Prompt 10 (M9) from docs/13. Add: request POST_NOTIFICATIONS at runtime on Android 13+; record_consent with version '2026-10-v1' (matches the privacy policy draft); Start disabled until consent + background location granted.
Evidence: RNTL tests for D1/D4 states, screenshots vs design/, device run.
```

## R11 — M10: active trip, end trip, summary
```
Gate: R10 merged.
Run Prompt 11 (M10) from docs/13. D6 uses realtime on trips (ND-14) with polling fallback. Show CLOCK_SKEW and other new reason codes from R2 in plain language (all 4 language files, TODO allowed for ta/kn/hi).
Evidence: component tests, and the 20-minute airplane-mode device test result.
```
🧍 Real trip: start, 20 min airplane mode, end offline, reconnect → must be verified with zero missing points.

## R12 — Integration pass across the whole app
```
Gate: R11 merged.
End-to-end review of the full driver + console flow now that everything exists:
- Remove src/features/m11 naming: move code into src/features/{live-map,review,trips,profile}; delete demo.ts if no longer needed in dev.
- Re-check every item in docs/HARDENING_REPORT.md §8 ("Not checked — blocked"): D4/D5 font scaling, background task network guard at runtime, edge functions only hold the service role key, map layers memoised, all new strings in i18n. Update the report.
- Go through docs/PHASE1_TASKS.md §4 (21 screens) and §5 (P0 traceability). Every row gets evidence or stays unticked.
Evidence: updated HARDENING_REPORT.md, PHASE1_TASKS.md §4/§5 with links to tests/screenshots, CI green.
```

## R13 — M12b phone side: automated + field tests
```
Gate: R12 merged.
Finish the ⏳ items in the M12b matrix: Jest/RNTL for the tracking engine and D4/D5/D6; Maestro flows on the Android emulator using test/gpx routes (start → offline → end → verified; outside pickup; mocked location → needs review). Add them to CI if an emulator job is feasible, otherwise document the local command.
Then produce the field-test sheet from docs/FIELD_TEST_SCRIPT.md for my devices: <list phones you actually have, e.g. Redmi Note 12 (Android 14), Samsung A14, iPhone 12>.
Evidence: Maestro run output, updated matrix.
```
🧍 Do the field trips. Paste results into `docs/FIELD_TEST_SCRIPT.md`.

## R14 — Release candidate
```
Gate: R13 field results pasted; brand assets in assets/ (npm run release:assets passes); EAS project id <id>; hosted staging Supabase linked; Sentry DSN, Mappls keys and EAS env vars set for preview.
1. Re-verify every M12c item against the finished app: CSP with the real map, permission strings, prebuild manifest (cleartext off, FGS location), iOS introspect, privacy manifest, Data safety and App Privacy answers still true (new data from R2/R9?), privacy policy version = consent version.
2. Push migrations to staging, deploy functions, run SUPABASE_HOSTED.md §9 smoke test, run Playwright against staging (read-only tests only).
3. Send one Sentry test event from preview native + web and confirm scrubbing (no phone/coordinates).
4. Produce docs/release/GO_NO_GO.md: every Phase 1 definition-of-done item, every PRD P0, every open ND, with pass/fail and evidence links. List exactly what blocks store submission.
Stop and give me the ordered manual steps for building preview, uploading to Play internal testing and TestFlight.
```

## R15 — Pilot support
```
Gate: preview builds installed on pilot drivers' phones; production or staging decision made for the pilot: <staging/production>.
1. Write supabase/snippets/pilot_report.sql: per trip — status, reasons, tracked vs planned km, points expected vs received, max gap, live delay p50/p95, rejected points; per driver — trips, verified %, km. And a weekly summary.
2. Add a console-only "Pilot report" page (admin) showing the same numbers, or a CSV export if faster.
3. After 10 trips: analyse false flags and propose app_settings changes with the data behind each (don't apply until I approve); if approved, re-verify undecided trips with the RUNBOOK procedure.
Evidence: report output for the pilot trips, proposed threshold table.
```
🧍 Client sign-off on the pilot report → Phase 1 done.

---

## Reusable prompts (fixed versions)

**Gate check before any prompt** (use if unsure what's done)
```
Read CLAUDE.md and docs/PHASE1_TASKS.md. For milestone <M-number>, list its gate prerequisites and whether each is actually met, with evidence (file paths, test names, command output). Don't change anything.
```

**Bug fix** — fill every field or Claude will (correctly) refuse
```
Bug: <symptom in one line>
Device/OS/build: <e.g. Redmi Note 12, Android 14, EAS dev client>
Signed in as: <driver/admin>
Steps: 1. <…> 2. <…> 3. <…>
Expected: <…>   Actual: <…>
Logs: <paste Metro/console output, Sentry id, Supabase error text, or repo paths of screenshots>
Reproduce or locate the cause and explain it, then write a failing test, apply the smallest fix, show it passing, log it in PHASE1_TASKS.md. Separate commit; don't touch unrelated files.
```

**Review a milestone** — replace M-number
```
Review milestone <M-number> against its acceptance criteria in docs/PHASE1_TASKS.md, CLAUDE.md hard rules and docs/09. Report done / partial / missing with evidence, rule violations, risky code, missing tests, and anything ticked that is actually stubbed or cosmetic. Prioritise P0/P1/P2. Don't fix yet.
```
