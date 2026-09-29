# 16 — Phase 1 Verification & Validation (final go/no-go)

Run this after A0–A7, R2 and R12–R14 are merged (docs/15). It can also be run earlier: it will then report NO-GO with the exact gaps.
- **Verification:** was it built correctly? Specs, tests, security, builds.
- **Validation:** is it the right product? PRD goals, real flows, pilot data, client sign-off.

## Prompt V1 — Full validation (read-only)
```
PHASE 1 VERIFICATION & VALIDATION — READ-ONLY AUDIT

Role: independent auditor. You did not build this; assume nothing is done until you see evidence. Do NOT fix, refactor, commit to main, or change tests/config/migrations. The only files you may write are docs/PHASE1_VALIDATION_REPORT.md and files under docs/validation/ (logs, screenshots, SQL output), on a new branch v1-validation.

Sources of truth (read all first): CLAUDE.md, docs/01-project-plan.md §6 (definition of done), docs/02-PRD.md, docs/03-TRD.md, docs/06-api-contracts.md, docs/08-verification-rules.md, docs/09-security-privacy-compliance.md, docs/10-test-plan.md, docs/12-screens-and-stitch-prompts.md, docs/PHASE1_TASKS.md, docs/release/*, docs/RUNBOOK.md.

Evidence rules
- Every PASS needs evidence: a command + its output excerpt, a file:line, a test name, a CI run URL, or a screenshot path. A checkbox in PHASE1_TASKS.md is a claim, not evidence.
- Statuses: PASS / PARTIAL / FAIL / NEEDS HUMAN EVIDENCE / NOT VERIFIABLE (with the reason). Severity for anything not PASS: BLOCKER / MAJOR / MINOR.
- A skipped, .only, .todo, xit, test.skip or pgTAP TODO test counts as not run. List every one.
- If a command can't run on this machine, say why. Never substitute a guess.
- Before any `supabase db reset`, tell me it wipes the local DB and continue (I accept that).

PART 0 — Clean baseline
0.1 Record: git rev-parse HEAD of origin/main, branch, working tree clean?, open PRs (gh pr list), latest CI run on main (gh run list --branch main -L 3) with URL and conclusion.
0.2 Fresh clone of origin/main into C:\dev\nl-validate. Install with the lockfile only (bun install --frozen-lockfile, or the project's documented command). Any lockfile drift = FAIL.
0.3 From the fresh clone, run and save logs to docs/validation/: typecheck, lint, format check, Jest (full, --ci), script tests (node --test), Deno Edge Function tests, supabase db reset (all migrations from zero + seed), supabase test db (pgTAP), test/db/start-trip-race.sh, Playwright e2e, web export, `expo prebuild -p android` for production into a temp copy (then delete android/), `expo config --type introspect` for production, release:assets, dependency audit (runtime deps). Record pass/fail counts per suite.
0.4 Test-integrity scan: count skipped/only/todo tests (Jest, Playwright, pgTAP, Deno); check CI runs every suite from 0.3 (list suites that exist but CI doesn't run); check generated DB types are in sync with migrations (regenerate into a temp file and diff).

PART 1 — Verification: PRD requirements (docs/02 §6)
For each P0-1…P0-13 and each P1: requirement, implementation location (file:line), automated test(s) proving the acceptance criteria, manual/device evidence if the criterion needs a device. One row each.

PART 2 — Verification: screens (docs/12, 21 screens + 6 overlays)
For each screen ID: route path, component file, real/stub/cosmetic, i18n keys used (no hard-coded strings), states from docs/12 implemented (list which are missing), test coverage, design match against design/<id>.png (compare structure, not pixels). Grep the whole app for PlaceholderScreen, "coming soon", demo/fake data reachable in release, TODO/FIXME in shipped code, and any map that is not Mappls.

PART 3 — Verification: tracking engine & verification rules
3.1 Walk the TRD §4 state machine against src/tracking: every transition, persistence across kill/restart, seq never reused, SQLite-first queue, uploader batch size/interval/backoff, upload path (RPC or upsert) and rejected-row handling (ND-8), stationary heartbeat (ND-6), showsBackgroundLocationIndicator, foreground service notification, background task defined at module top level and imported first, no network I/O inside the task. Cite the test for each.
3.2 docs/08: for every reason code and threshold, show the SQL implementing it (file:line), the app_settings key, the pgTAP test, and the driver-facing text in every locale file.
3.3 Official km: prove the app never computes the official figure (grep client code for distance written to the server or displayed as verified).

PART 4 — Verification: security & privacy (docs/09 §1, §4, §5)
4.1 RLS attack run against the local stack over REST using the seeded driver and admin tokens (write the requests to docs/validation/rls-attacks.md): driver tries to update trips.status, insert/update driver_stats, read another driver's trips/points/live/events, upload points to another driver's trip, upload future-dated and pre-start points, change own role, call verify_trip/apply_verified_stats/sweeper; admin tries a direct trips UPDATE (ND-13 — must be blocked if R2 is merged); anon reads anything. Expected vs actual per request.
4.2 Every table has RLS enabled and a policy test (list tables vs tests).
4.3 Secrets: scan git history and the web export bundle for service-role/secret keys, JWTs, Mappls secrets, Sentry auth tokens, .env files. Confirm only EXPO_PUBLIC_* in client code.
4.4 Release manifest/plist: cleartext off, allowBackup false, only expected permissions, FGS type location, POST_NOTIFICATIONS, UIBackgroundModes = [location], permission strings match docs/09 §3 verbatim.
4.5 Threat model table docs/09 §5: control present + test, per row.
4.6 DPDP: consent screen before any permission prompt, record_consent with the version that equals the privacy policy version, tracking only between start and end (prove the task stops), retention job present and matching the decided period, erasure path present (RPC/runbook) and tested, Sentry PII scrubbing tested.
4.7 Config fail-closed: a release build with missing env shows the blocking screen (test name).

PART 5 — Verification: acceptance scenarios (docs/10 §4, 1–12)
Per scenario: automated evidence (test name + result), device/field evidence (from docs/FIELD_TEST_SCRIPT.md results table), final status. Scenarios that need a real phone and have no recorded field result = NEEDS HUMAN EVIDENCE.

PART 6 — Verification: release readiness
eas.json profiles and channels; EAS project id linked; app version/runtime policy; brand assets pass the gate; vercel.json CSP verified against the real Mappls web map (serve the export with the same headers, record console CSP violations); docs/release/* consistent with the code (Data safety / App Privacy answers vs what the code actually collects — list any mismatch); privacy policy has no [BRACKETED] placeholders left; APP_REVIEW_NOTES demo account prepared (NEEDS HUMAN EVIDENCE if not); hosted staging checklist (SUPABASE_HOSTED.md) completed (ask me for evidence rather than touching hosted projects); Sentry test event from preview (NEEDS HUMAN EVIDENCE if not recorded).

PART 7 — Validation: does it do what the business needs?
7.1 End-to-end walkthrough on the local stack, recorded with screenshots in docs/validation/walkthrough/: admin creates a load with Mappls autosuggest → assigns driver + vehicle → driver (emulator or simulated location, using test/gpx) signs in, completes onboarding and consent → starts inside the pickup geofence → points upload, console live map updates → goes offline, comes back → ends at drop → trip verified → driver sees verified km in history/profile → admin sees it on C5/C6. Then a flagged path: end outside the drop → needs_review → admin approves with note → stats +1 once. Note every step that needed a workaround.
7.2 PRD §2 goals and §7 metrics: for each goal, the metric, how it is measured (SQL or tool), and the value from pilot data. Provide the SQL (docs/validation/pilot_metrics.sql) and ask me to run it on the pilot environment if you can't reach it; mark NEEDS HUMAN EVIDENCE until I paste results. Targets: ≥95% track completeness, ≥80% auto-verify of genuine trips, 0 driver-editable paths, ≤60 s live delay, ≤2 taps per trip, ≥99% crash-free.
7.3 docs/01 §6 definition of done: 10 real pilot trips with ≥8 auto-verified and a correct human-readable reason on every flagged trip; no driver-editable path; Android on Play internal testing; iOS on TestFlight (or ND-3 deferral recorded); console on a public URL behind login; privacy policy published; consent screen shipped.
7.4 Decisions and sign-offs: every ND item in PHASE1_TASKS.md §2 — decided (date + where) or open. Client sign-offs: RN + Mappls approval, verification thresholds (doc 08), retention period, pilot report. Open items that affect correctness or legality = BLOCKER.

PART 8 — Report
Write docs/PHASE1_VALIDATION_REPORT.md:
1. Verdict: GO / GO WITH CONDITIONS / NO-GO, with one paragraph why.
2. Baseline table (Part 0) with suite counts and CI URL.
3. Blockers (numbered): issue, evidence, requirement it violates, suggested fix, estimated size (S/M/L).
4. Majors and minors (same format).
5. NEEDS HUMAN EVIDENCE checklist: exactly what I must do or provide, in order.
6. Tables for Parts 1–7.
7. Traceability matrix: PRD requirement → code → test → device/pilot evidence → status.
8. What changed since the last validation run (if a previous report exists).
Commit only the report and docs/validation/ on branch v1-validation, push, open a PR titled "Phase 1 validation report <date>", and don't merge it. Remove C:\dev\nl-validate when done.
Then stop and give me: the verdict, blocker count, and the human-evidence list in 20 lines max.
```

## Prompt V2 — Fix loop (after reading the report)
```
Read docs/PHASE1_VALIDATION_REPORT.md (latest). For each BLOCKER, then each MAJOR, in order:
- one branch + PR per item (group only trivially related items)
- write a failing test that captures the finding first, then the smallest fix, then show it passing
- update the affected docs and PHASE1_TASKS.md
- CI green before asking me to merge
Don't touch items marked NEEDS HUMAN EVIDENCE — list what you need from me instead. Stop after each PR and report: item id, test name, CI URL.
```

## Prompt V3 — Re-validation
```
Re-run Prompt V1 from docs/16 in full on current origin/main. First confirm origin/main has moved since the last report's SHA; if not, stop. Use a new branch v<N>-validation (N = next run number) instead of v1-validation, and a fresh clone. In section 8 of the report, list every item whose status changed since the previous report, and flag any PASS that regressed. Do not reuse evidence from the previous run.
```

## Human evidence you will likely need to provide
- Field-test results on the device matrix (docs/FIELD_TEST_SCRIPT.md).
- Pilot metrics SQL output from the pilot Supabase project.
- Screenshots: Play internal testing track, TestFlight build, Vercel console URL behind login, Sentry test event.
- Client sign-offs (email/PDF): RN + Mappls, thresholds, retention, pilot report.
- Legal review of the privacy policy, and its published URL.
