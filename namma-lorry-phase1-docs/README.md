# Namma Lorry — Verified Driver Experience System
## Phase 1 Documentation Pack (React Native / Expo · Mappls · Supabase)

Phase 1 goal in one line: **prove, from the phone's GPS, that a trip for a specific Namma Lorry load started at the pickup, ended at the drop, and was tracked live in between — and only then count it as verified experience.**

### How to use this pack with Claude Code and Antigravity

1. Create the repo, copy this whole folder into its root (so `CLAUDE.md`, `AGENTS.md`, `docs/`, `supabase/` sit at the top level).
2. **Claude Code** reads `CLAUDE.md` automatically. **Antigravity**: point it at `AGENTS.md` (or paste its content into the workspace rules). Both files hold the same rules.
3. Build milestone by milestone using the prompts in `docs/11-build-prompts.md`. Don't ask an agent to "build the whole app" in one go — each prompt is sized to be reviewable.
4. Whenever a decision changes, update the doc first, then the code. The docs are the source of truth for the agents.

### Files

| # | File | What it is | Who needs it |
|---|------|-----------|--------------|
| — | `CLAUDE.md` / `AGENTS.md` | Coding rules + context for AI agents | Claude Code, Antigravity |
| 01 | `docs/01-project-plan.md` | Timeline, milestones, accounts, risks | You, client |
| 02 | `docs/02-PRD.md` | Product requirements (what & why) | Client sign-off, agents |
| 03 | `docs/03-TRD.md` | Technical requirements & architecture (how) | Agents, developers |
| 04 | `docs/04-screen-navigation.md` | Route tree, flows, per-screen specs | Agents, designer |
| 05 | `supabase/migrations/0001_phase1_schema.sql` | Runnable schema, RLS, RPCs, triggers | Supabase |
| 06 | `docs/06-api-contracts.md` | RPC / realtime / edge-function contracts | Agents |
| 07 | `docs/07-apis-and-services.md` | Free APIs & services, limits, what to avoid | You, agents |
| 08 | `docs/08-verification-rules.md` | The rules that decide "verified" | Client sign-off, agents |
| 09 | `docs/09-security-privacy-compliance.md` | DPDP Act, store policies, threat model | Client, store submission |
| 10 | `docs/10-test-plan.md` | Unit, RLS, field-test matrix, acceptance | QA, agents |
| 11 | `docs/11-build-prompts.md` | Copy-paste prompts per milestone | You → Claude Code / Antigravity |
| — | `.env.example` | Every env variable the app needs | Developers |

### Documents that still need to come from you / the client
These can't be written without real inputs, but you need them before store release:
- **Privacy Policy** (public URL) and in-app **location consent text** — draft structure is in doc 09.
- **Client sign-off** on doc 08 thresholds (pickup/drop radius, gap limits).
- **Brand assets**: app icon (1024×1024), splash, colours, app name per store.
- **Play Console background-location declaration** + short demo video (template in doc 09).
- **Pilot list**: 5–10 real drivers, vehicles, and 2–3 real routes for field testing.
