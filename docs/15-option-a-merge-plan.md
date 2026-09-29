# 15 — Option A: consolidate on origin/main (supersedes 14 R0–R11 ordering)

> **Status (29 Sep 2026):** Option A was chosen and is being executed through the **V2 fix loop in docs/16**, item by item, instead of the A0–A7 prompts below. A1 (docs pack to the root, CLAUDE.md, .gitattributes) is done by the "docs: pack to repo root" PR (this PR). Keep this file as the rationale and as a checklist of what must be ported from `backup/local-line-0929`; don't re-run A0–A7 as separate prompts.

## Decision
`origin/main` (REMOTE, PRs #2–#10) is the real app: M2–M11 built, 476 Jest + 139 pgTAP green, native Mappls map, tracking engine, Edge Functions, CI green.
The LOCAL line (`r0-stabilise`) is kept only for what REMOTE lacks: the M12a–c + R0 layer, the `start_trip` concurrency fix, acceptance tests and CI jobs.
PR #1 (`claude/epic-maxwell-3ifdr3`) gets a few pieces harvested, then is closed unmerged.

Backups already on origin: `backup/remote-main-0929`, `backup/local-line-0929`. PR #1's branch stays on origin until A6 closes it.

## Rules for every A-prompt
- Branch from **current origin/main**, one PR per prompt, CI green before merge, **merge commit** (not squash).
- **Port, don't cherry-pick.** REMOTE's structure (`src/features/*`, `src/tracking`, `(console)` routes, bun, its config) wins. Rewrite LOCAL's code to fit it.
- New migrations continue REMOTE's numbering (next is `0005`). Never reuse 0003/0004 names from other lines.
- Read files from other lines with `git show backup/local-line-0929:<path>` or `git show origin/claude/epic-maxwell-3ifdr3:<path>`. Never check those branches out in the main folder.
- Each prompt ends with: tests named, CI run URL, and an update to docs/PHASE1_TASKS.md.

## Decisions you make now (fill before A0)
| # | Decision | Recommended |
|---|---|---|
| D1 | Package manager | **bun** (REMOTE's lockfile + CI already use it; EAS and Vercel support bun). Port npm scripts as `bun run …`; `node --test` scripts still run with node. |
| D2 | Working folder | Keep `C:\Users\santh\Desktop\Namma Lorry` and switch it to `main`. First check whether `C:\dev\namma-lorry` has uncommitted work (it may be where the freebuff PRs were made). |
| D3 | `set_preferred_language` | Adopt PR #1's version (returns `text`, adds NOT NULL + CHECK), as REMOTE migration `0006`; REMOTE's profile screen then saves the language through it. |
| D4 | Admin trip writes (ND-13) | Take PR #1's `0006_trips_admin_rpc_only` idea, but fold it into the R2 decisions migration with `cancel_trip` / `admin_force_end` / `admin_revoke_trip`. |

---

## A0 — Switch the working folder to REMOTE and prove it's green here
```
Nothing is merged, reset or force-pushed in this step except what's listed.

1. Check C:\dev\namma-lorry: git status, branch, and unpushed commits. Report them and change nothing there.
2. In C:\Users\santh\Desktop\Namma Lorry: move docs/LINE_COMPARISON.md and 14-phase1-completion-prompts.md outside the repo temporarily (e.g. %TEMP%), then `git switch main` and `git reset --hard origin/main`. This is safe: local main's only unique commits (7720e50, ebc9bcc) are in backup/local-line-0929 — verify that with `git merge-base --is-ancestor` before resetting, and stop if the check fails.
3. Create branch a0-docs from main. Commit docs/LINE_COMPARISON.md there ("docs: three-line comparison, option A chosen"), and put 14-phase1-completion-prompts.md and 15-option-a-merge-plan.md (I will paste its content) under the pack docs folder.
4. bun install --frozen-lockfile, then typecheck, lint, format:check, test, Deno function tests, then supabase db reset + supabase test db. Report each result. Fix nothing yet; list any failures.
5. Push a0-docs, open a PR with gh (active account must be santhosh2564), wait for CI, report the run URL.
Stop and summarise.
```
🧍 Merge a0-docs when CI is green.

## A1 — Pre-flight on REMOTE (R1 adapted)
```
Gate: A0 merged.
Run docs/14 R1 against this repository as it is now, with these adjustments:
- Docs pack to the root: CLAUDE.md, AGENTS.md, docs/01–15, stitch/DESIGN.md. Byte-compare before deleting duplicates. REMOTE's own docs (list them) win over pack copies if they're newer and more accurate — show me any conflict instead of choosing silently.
- CLAUDE.md: update the stack line to bun, the folder layout to REMOTE's actual layout, ND-10 admin-only web, plus hard rules 11–13 from docs/14 R1.
- Port .gitattributes (eol=lf + binary rules) from backup/local-line-0929 and check .npmrc / bunfig for any os= override.
- SCREENS → design/ with doc-12 IDs, plus design/README.md (ND-18 out-of-scope list).
Evidence: tree of the root, CLAUDE.md diff, CI green.
```

## A2 — Database: concurrency fix, pgTAP in CI, race test
```
Gate: A1 merged.
1. Add a `database` job to CI (supabase/setup-cli pinned to the version in use; supabase db start; supabase test db). REMOTE has 139 pgTAP tests that CI never runs.
2. Port backup/local-line-0929:test/db/start-trip-race.sh unchanged, add it as a CI step, and prove it FAILS on current main (raw 23505 instead of ANOTHER_TRIP_ACTIVE) before the fix.
3. Migration 0005_start_trip_concurrency.sql: port local's 0004 body (advisory lock + unique_violation → ANOTHER_TRIP_ACTIVE), but diff it against REMOTE's current start_trip first — keep any REMOTE change and apply only the concurrency part.
4. Migration 0006_preferred_language.sql per decision D3 (PR #1's version) + a pgTAP test; wire REMOTE's profile screen language picker to call it, with a Jest test.
5. Regenerate src/lib/database.types.ts.
Evidence: race script FAIL then PASS, pgTAP count before/after, CI URL.
```

## A3 — Release layer (M12c + R0), rewritten for REMOTE
```
Gate: A2 merged.
Port from backup/local-line-0929, adapted to REMOTE's config and bun, each with its tests:
- app.config.ts: docs/09 §3 strings, expo-location plugin options, POST_NOTIFICATIONS, blockedPermissions, allowBackup false, iOS fetch-mode strip, privacyManifests, runtimeVersion appVersion + EAS Update (off until project id), APP_ENV validation, cleartext off in release, name per env. Keep REMOTE's Mappls plugin config intact. Port src/__tests__/appConfig.test.ts and test/config/introspect.test.mjs.
- Config fail-closed (R0 P0-3): compare REMOTE's env/config module with local's src/lib/config.ts; port the fail-closed behaviour + Misconfigured screen + tests into REMOTE's module, don't add a second config system.
- eas.json profiles/channels (preview, preview_apk, production), scripts/eas-update.mjs (no shell), scripts/provision-user.mjs (explicit flags), scripts/check-release-assets.mjs (tRNS), with their node:test suites; `test:scripts` in CI; web export step in CI.
- vercel.json (bun install + export, SPA rewrite, CSP). Re-check the CSP against REMOTE's real Mappls web map: serve the export locally with the same headers, zero CSP violations.
- docs/release/* and docs/RUNBOOK.md: update every path, script and command to REMOTE's reality.
Evidence: prebuild manifest excerpt (cleartext false, FGS location, POST_NOTIFICATIONS), introspect test output, CSP check, CI URL.
```

## A4 — Hardening (M12a) — only what REMOTE lacks
```
Gate: A3 merged.
Compare REMOTE against docs/HARDENING_REPORT.md from backup/local-line-0929 item by item and produce a gap table first (have / partial / missing). Then port only the missing items, adapted to REMOTE's structure:
Sentry (@sentry/react-native, release/dist/env tagging, PII scrubber + tests), global ErrorBoundary, RPC error-code → message map for every code in docs/06 (+ ANOTHER_TRIP_ACTIVE race case), chunked SecureStore session + web-safe storage (check REMOTE's current session storage first), HTTPS guard, token contrast test, phone masking, dev routes behind __DEV__, ESLint no-network guard on the tracking task, i18n TODO fallback + parity test (keep REMOTE's i18n system).
Write docs/HARDENING_REPORT.md for REMOTE (replace the local one) with evidence per item.
Evidence: gap table, tests added, CI URL.
```

## A5 — Acceptance suite (M12b) on REMOTE
```
Gate: A4 merged.
Port and adapt: supabase/tests/acceptance.test.sql + route helpers, test/gpx routes + generator + the consistency Jest test, Playwright acceptance spec (scenarios 9, 11, 12) against REMOTE's console routes, docs/FIELD_TEST_SCRIPT.md. Add the e2e CI job. Keep REMOTE's existing create-load.spec.ts.
Because REMOTE has the tracking engine and D4–D6, also add the phone-side items that were ⏳ on the local line: Jest tests for queue/uploader/state machine offline-end and resume cases (check what REMOTE already has first), and RNTL for D4/D5/D6 states. Update the pass/fail matrix.
If e2e can't be made reliable on GitHub runners, stop and explain options — don't disable it.
Evidence: matrix, CI URL.
```

## A6 — Harvest PR #1, then close it
```
Gate: A5 merged.
From origin/claude/epic-maxwell-3ifdr3 evaluate and port only if REMOTE lacks an equivalent: Edge Function rate limiting (_shared/rateLimit.ts + tests), the hard-coded-string i18n test, the load_list view (compare with REMOTE's loads status logic first; if REMOTE already derives status, skip it). Do NOT port PR #1's migration 0006 policy — that is decided in R2.
Then comment on PR #1 with what was taken (links to commits) and close it unmerged with gh. Leave its branch on origin.
Evidence: list of ported pieces with tests, PR #1 closed link.
```

## A7 — Trust check of REMOTE's M2–M11 (it was written by a bot)
```
Gate: A6 merged.
Use the "Review a milestone" prompt from docs/14 for M2, M3, M5, M6, M7, M8, M9, M10, M11 in one report (docs/REMOTE_REVIEW.md): done / partial / missing with evidence, CLAUDE.md hard-rule violations (client writes to trips/stats, background task network I/O, secrets, map provider rules), cosmetic or stubbed features presented as done, missing tests. Prioritise P0/P1/P2. Don't fix yet.
```
🧍 Then do the real-device checkpoints on REMOTE's app: docs/14 R3 (dev build shows the Mappls map), R9 (10-min locked-screen run), R11 (20-min airplane mode).

## After A7 — continue docs/14 from R2
- **R2** decisions migration (numbered after A2's migrations; include D4 and fixes for any P0/P1 from A7).
- Skip R3–R11 as build prompts — REMOTE has them. Use them only as **fix prompts** for gaps A7 found, keeping their gates and device checkpoints.
- Then **R12 → R15** as written.

## Branch cleanup (only after A6)
```
git branch -D r0-stabilise m12a-hardening m12b-acceptance
git push origin --delete r0-stabilise
```
Keep `backup/*` branches until Phase 1 sign-off.
