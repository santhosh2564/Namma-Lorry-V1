# Project: Namma Lorry — Verified Driver Experience System (Phase 1)

## What we are building
A React Native (Expo) app for Android, iOS and Web. Drivers carry Namma Lorry loads; the phone records GPS from trip start to trip end; the backend verifies the trip and only verified trips add to the driver's experience (trips + km). **Drivers can never enter or edit experience data.**

Read before coding: `docs/02-PRD.md`, `docs/03-TRD.md`, `docs/08-verification-rules.md`. Schema lives in `supabase/migrations/`.

## Stack (do not substitute without asking)
- Expo (latest stable SDK), TypeScript strict, Expo Router (file-based routes), **development builds via EAS** (Mappls is a native SDK — Expo Go will NOT work).
- Maps: **Mappls only.** Native: `mappls-map-react-native`. Web: Mappls Web Maps JS SDK. Never render OSM/Google/Mapbox tiles or mix Mappls data onto a non-Mappls map (Mappls terms forbid it).
- Location: `expo-location` + `expo-task-manager` (background), `expo-sqlite` for the offline point queue.
- Backend: Supabase (Postgres + PostGIS, Auth, Realtime, Edge Functions, pg_cron).
- State: TanStack Query for server state, Zustand for small client state. Forms: react-hook-form + zod.

## Hard rules
1. **Trust nothing from the client for verification.** Distance, verification status and driver stats are computed only in Postgres functions (`verify_trip`). The app displays them; it never calculates the "official" number.
2. Trip status changes only through RPCs: `start_trip`, `end_trip`, `admin_review_trip`. No direct `update` on `trips` from the client. RLS must enforce this.
3. Every GPS point carries `trip_id`, a per-trip `seq` (1,2,3…), `recorded_at` (device time), accuracy, speed, heading and `is_mocked`. Inserts are idempotent on `(trip_id, seq)`.
4. The background location task must be defined at module top level (imported from the root layout), never inside a component.
5. Points go to SQLite first, then upload in batches. Never lose a point because the network is down.
6. Secrets (Mappls client secret, service role key) only in Edge Function secrets. Only `EXPO_PUBLIC_*` vars in the app.
7. Platform-specific map code lives in `MapView.native.tsx` / `MapView.web.tsx` behind one shared props interface.
8. Web is a console (admin / owner / shipper). Drivers on web see "Use the mobile app to run trips".
9. Every new table gets RLS enabled in the same migration. Add a test for each policy.
10. Keep UI text in `src/i18n/` (English first; Tamil/Kannada/Hindi planned).

## Folder layout
```
app/                 Expo Router routes (see docs/04-screen-navigation.md)
src/features/        auth, trips, tracking, loads, review, live-map
src/components/map/  MapView.native.tsx, MapView.web.tsx, types.ts
src/lib/             supabase.ts, mappls.ts, db.ts (sqlite), config.ts
src/tracking/        task.ts (TaskManager.defineTask), queue.ts, uploader.ts, stateMachine.ts
supabase/            migrations/, functions/, tests/
docs/
```

## Commands
- `npx expo start --dev-client` · `npx expo run:android` · `npx expo run:ios` · `npx expo start --web`
- `eas build --profile development --platform android`
- `supabase start` · `supabase db reset` · `supabase test db` · `supabase functions serve`

## Definition of done for any task
Types pass (`tsc --noEmit`), lint passes, tests for new logic exist and pass, RLS checked, docs updated if behaviour changed.
