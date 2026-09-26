# 11 — Build Prompts for Claude Code / Antigravity

Use one prompt per session. Start each with: *"Read CLAUDE.md and the docs it references before changing code."* Review and commit after each step.

## W0 — Setup & map spike
**0.1 Scaffold**
> Create an Expo app with TypeScript strict and Expo Router following the folder layout in CLAUDE.md. Add ESLint, Prettier, path alias `@/` → `src/`, TanStack Query, Zustand, zod, react-hook-form, `@supabase/supabase-js`, `expo-secure-store`, `expo-location`, `expo-task-manager`, `expo-sqlite`, `@react-native-community/netinfo`, `expo-device`, `expo-application`. Configure `eas.json` with development/preview/production profiles. Add `.env.example` handling via `EXPO_PUBLIC_*`. No features yet.

**0.2 Mappls spike**
> Integrate `mappls-map-react-native` in a development build. Follow the current Mappls README for Android maven repo and iOS config files; if Expo can't apply them automatically, write a local Expo config plugin in `plugins/withMappls.ts`. Implement `src/components/map/MapView.native.tsx` and `MapView.web.tsx` (Mappls Web SDK via a script loader) behind the `AppMapProps` interface in docs/03-TRD.md §5. Show a test screen with a marker, a polyline and a circle on Android, iOS and web.

## W1 — Data & auth
**1.1 Supabase**
> Apply `supabase/migrations/0001_phase1_schema.sql` to local Supabase. Convert `supabase/tests/smoke_phase1.sql` into pgTAP tests covering every policy and RPC error in docs/06 and every reason code in docs/08. Generate TypeScript types into `src/lib/database.types.ts`.

**1.2 Auth + routing**
> Implement phone OTP login (A1, A2) and root routing per docs/04 §2. Session in secure store on native. Driver on web → "use the mobile app" screen. Owner/shipper → "coming soon".

## W2 — Console
**2.1 mappls-proxy edge function** per docs/06 §4 with admin check and normalised responses.
**2.2 Screens C2–C4, C9, C10** per docs/04. Load creation uses autosuggest + draggable pin + radius circle; fetch planned distance on save.

## W3 — Tracking engine
**3.1 Permissions** — O1 and O2 per docs/04 and doc 09 (prominent disclosure first). Add migration `0002_consent.sql` with `consent_version`, `consent_at` and a `record_consent` RPC. Brand-specific battery instructions.
**3.2 Engine** — Implement `src/tracking/` per docs/03 §4: top-level task definition, SQLite queue with persistent seq, uploader (30 s, 200 rows, backoff, NetInfo trigger), state machine with restart recovery. Unit tests for queue, uploader and state machine.
**3.3 D1–D3** — Start flow calling `start_trip` exactly as docs/06 §1 describes; D3 with sync status.

## W4 — Live & end
**4.1** — `end_trip` flow including offline `ENDED_PENDING_SYNC`. D4 summary with realtime status.
**4.2** — C1 dashboard and C6 trip page with realtime `trip_live` and route polyline (paginated history + live append).

## W5 — Verification & history
**5.1** — C7/C8 review queue calling `admin_review_trip`. D5 history, D6 stats (read-only). Map reason codes to text from docs/08 §3 via i18n.
**5.2** — Run all acceptance scenarios in docs/10 §4 that can be simulated; fix failures.

## W6 — Release
**6.1** — Sentry, app icons/splash, `app.json` permission strings from docs/09 §3, Android foreground-service config check, production EAS builds, Play internal testing + TestFlight submission checklist.

## Prompt hygiene
- Ask the agent to list files it will touch before editing.
- For SQL changes: new migration file, never edit an applied one.
- After each step: `tsc --noEmit`, lint, tests, and a real-device run for anything touching location.
