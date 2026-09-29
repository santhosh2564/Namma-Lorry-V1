# Project: Namma Lorry — Verified Driver Experience System (Phase 1)

## What we are building
A React Native (Expo) app for Android, iOS and Web. Drivers carry Namma Lorry loads; the phone records GPS from trip start to trip end; the backend verifies the trip and only verified trips add to the driver's experience (trips + km). **Drivers can never enter or edit experience data.**

Read before coding: `docs/02-PRD.md`, `docs/03-TRD.md`, `docs/08-verification-rules.md`, and the progress log in `docs/PHASE1_TASKS.md`. Schema lives in `supabase/migrations/`. Build prompts: `docs/13` (milestones M1–M12), `docs/14` (completion), `docs/15` and `docs/16` (validation and fix loop).

## Stack (do not substitute without asking)
- Expo (SDK pinned in `package.json`), TypeScript strict, Expo Router (file-based routes), **development builds via EAS** (Mappls is a native SDK — Expo Go will NOT work).
- Package manager: **bun** (`bun.lock` is the lockfile; CI runs `bun install --frozen-lockfile`). Do not add a `package-lock.json`.
- Maps: **Mappls only.** Native: `mappls-map-react-native`. Web: Mappls Web Maps JS SDK. Never render OSM/Google/Mapbox tiles or mix Mappls data onto a non-Mappls map (Mappls terms forbid it).
- Location: `expo-location` + `expo-task-manager` (background), `expo-sqlite` for the offline point queue.
- Backend: Supabase (Postgres + PostGIS, Auth, Realtime, Edge Functions, pg_cron).
- State: TanStack Query for server state, Zustand for small client state. Forms: react-hook-form + zod.

## Hard rules
1. **Trust nothing from the client for verification.** Distance, verification status and driver stats are computed only in Postgres functions (`verify_trip`). The app displays them; it never calculates the "official" number.
2. Trip status changes only through RPCs (`start_trip`, `end_trip`, `admin_review_trip` and the admin trip RPCs). No direct `update` on `trips` from the client. RLS must enforce this.
3. Every GPS point carries `trip_id`, a per-trip `seq` (1,2,3…), `recorded_at` (device time), accuracy, speed, heading and `is_mocked`. Inserts are idempotent on `(trip_id, seq)`.
4. The background location task must be defined at module top level (`src/tracking/task.ts`, imported from the root layout), never inside a component.
5. Points go to SQLite first, then upload in batches. Never lose a point because the network is down.
6. Secrets (Mappls client secret, service role key) only in Edge Function secrets. Only `EXPO_PUBLIC_*` vars in the app.
7. Platform-specific map code lives in `MapView.native.tsx` / `MapView.web.tsx` behind one shared props interface.
8. **Web is an admin-only console in Phase 1** (ND-10; the PRD wins). Drivers on web see "Use the mobile app to run trips"; owners and shippers get no console yet.
9. Every new table gets RLS enabled in the same migration. Add a pgTAP test for each policy.
10. Keep UI text in `src/i18n/` (`en.json` first; `ta`, `kn`, `hi` stay key-complete).
11. Never tick a checklist item for stubbed, cosmetic or preview code. Label it and leave it [~] or [ ].
12. Every prompt starts with its Gate; if a prerequisite isn't met, stop and say so.
13. If a prompt contains an unfilled <placeholder>, stop and ask.

## Folder layout (what the code uses — ND-9)
```
app/                     Expo Router routes (see docs/04-screen-navigation.md)
  (auth)/                sign-in, verify
  (onboarding)/          permissions, battery
  (driver)/              home, trips/[id], trips/[id]/live, trips/[id]/summary, history, profile
  (console)/             web admin console: live, loads, trips, review, drivers, vehicles
  dev/                   developer screens (env, kitchen-sink, map, tracking)
  access-notice.tsx      "use the mobile app" notice
src/components/ui/       shared UI kit
src/components/console/  console-only components
src/components/map/      MapView.native.tsx, MapView.web.tsx, types.ts, mappls-*.ts
src/features/            auth, console, driver, drivers, loads, onboarding, settings, trips, vehicles
src/tracking/            task.ts (TaskManager.defineTask), db.ts (sqlite), queue.ts, uploader.ts,
                         stateMachine.ts, service.ts, config.ts, permissions.ts, errors.ts
src/lib/                 supabase.ts, config.ts, mappls.ts, geo.ts, screens.ts, database.types.ts
src/theme/               tokens.ts, fonts.ts, status.ts
src/i18n/                en/ta/kn/hi JSON + index.ts
plugins/                 Expo config plugins (withMappls.ts)
supabase/                config.toml, migrations/, functions/ (Deno), tests/ (pgTAP), seed.sql
e2e/                     Playwright console specs
stitch/DESIGN.md         design brief (SCREENS/ holds the Stitch exports)
docs/                    01–16 doc pack, PHASE1_TASKS.md, DEV_SETUP.md
```

## Commands
- `bun install` · `bun run typecheck` · `bun run lint` · `bun run format:check` · `bun run test`
- `bunx expo start --dev-client` · `bunx expo run:android` · `bunx expo run:ios` · `bunx expo start --web`
- `eas build --profile development --platform android`
- `supabase start` · `supabase db reset` · `supabase test db` · `supabase functions serve`
- Edge function tests: `cd supabase/functions && bunx deno test --allow-env --allow-net`

## Definition of done for any task
Types pass (`bun run typecheck`), lint and format pass, tests for new logic exist and pass, RLS checked with pgTAP, docs and `docs/PHASE1_TASKS.md` updated if behaviour changed, CI green.
