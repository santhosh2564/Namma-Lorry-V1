# Hardening report — M12a (Prompt 13)

**Date:** 29 Sep 2026 · **Scope:** the whole app as it exists on `main` after M11 (`ebc9bcc`) · **Result:** hardening applied to all code that exists; several items **cannot be checked yet** because the screens or modules they target have not been built (see §0).

Verification at the end of this pass:

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ 0 errors |
| `npm run lint` (`--max-warnings 0`) | ✅ 0 problems |
| `npm test` (Jest) | ✅ 13 suites, 93 tests (was 2 suites / 3 tests) |
| `supabase db reset && supabase test db` (pgTAP) | ✅ 2 files, 84 tests; 1 **expected TODO failure** (ND-13, §6.4) |
| `npx expo export --platform web` | ✅ builds; bundle contains no secrets (§6.1) |
| `npm audit --omit=dev` | ⚠️ 1 high (not reachable) + 14 moderate (build tooling) — §6.6 |

---

## 0. What exists vs what this pass assumed

The prompt assumes a finished app. What's actually on `main`:

- **Real code:** only the five M11 screens (C1 Live, C6 Trip detail & review, C7 Review queue, D7 History, D8 Profile) in `src/features/m11/`, the `MapplsMap` preview component, `src/lib/{config,supabase}.ts`, and the i18n bootstrap.
- **Placeholders (5-line files):** S1–S4, D1–D6, C2–C5, C8, C9 and the three dev routes. M2–M10 are not implemented.
- **Missing entirely:** UI kit and tokens (M2), real Mappls map components (M3), generated DB types (M4), auth screens (M5), edge functions (M6), the tracking engine and background task (M8), D4/D5 (M9/M10).

**The M11 task list overstates what was built.** It claims a Mappls web map with rotated markers. `MapplsMap` injects the Mappls SDK script but never creates a map; it draws lines with `View`s on a flat background. It now says **"Map preview"** on screen and in its doc comment. The replay slider, language sheet and permission "health check" were also cosmetic (details below).

Items that could not be checked are listed in §8 with the milestone that unblocks them.

---

## 1. Internationalisation

| Checked | Finding | Fix |
|---|---|---|
| Hard-coded strings | ~90 English strings inline in `screens.tsx`, `PlaceholderScreen`, `data.ts` | All moved to `src/i18n/en.json` (screens, statuses, reasons, events, errors, units, languages, screen titles). A grep for JSX literal text and literal `Alert`/`Error` English now finds nothing. |
| ta / kn / hi | Did not exist | `ta.json`, `kn.json`, `hi.json` with **identical keys**. Untranslated values are `"TODO: <English>"`. Brand name, separators and language endonyms are copied as-is. `npm run i18n:sync` (`scripts/i18n-sync.mjs`) adds new keys and drops removed ones. |
| TODO values on screen | A Tamil user would have seen "TODO: Retry" | `src/i18n/index.ts` drops TODO values at load time, so i18next falls back to English until a translator fills them in. |
| Key parity / placeholders | — | `src/i18n/__tests__/locales.test.ts`: same keys as `en`, same `{{variables}}`, no bare English copies. |
| Language persistence | The D8 picker only changed React state; nothing was saved | New **migration `0003_preferred_language.sql`**: `set_preferred_language(p_language)`, a SECURITY DEFINER RPC limited to en/ta/kn/hi that touches only the caller's own row. Drivers have no UPDATE policy on `profiles`, deliberately, to block role escalation. `src/i18n/language.ts` switches immediately, caches the choice on the device (AsyncStorage, for the first frame of a cold start) and saves it to the profile. On login the profile value wins (`applyProfileLanguage`). Checked over REST as a seeded driver. |
| Dates / numbers | `toLocaleDateString(undefined)` used the device locale | `src/lib/format.ts` formats with `<lang>-IN`. Status labels follow doc 06 §5 (driver vs console wording) and reasons use the doc 08 §3 driver text. Unknown codes never show raw. |

## 2. Error handling

| Checked | Finding | Fix |
|---|---|---|
| Global crash handling | None: a render error gave a white screen | `src/components/ErrorBoundary.tsx` wraps the root layout. It shows a translated fallback with **Try again**, reports to Sentry (scrubbed) and never shows raw error text. Tested. |
| **Fake data on failure** (serious) | `fetchTrips`, `fetchTrip` and `fetchTripPoints` returned **hard-coded demo trips ("Arun Kumar", "Shivanna R") whenever a query failed or returned no rows**. A real driver with zero trips saw invented trips; an admin could open and "review" a demo trip; a failed page of points gave a silently partial route. | `src/features/m11/data.ts` now **throws** every query error and returns real empty results. Demo data lives in `demo.ts` and is used only when `__DEV__` **and** no Supabase key is configured. A release build without config throws `NotConfiguredError`. Regression tests: `data.test.ts`. |
| Network error states | Screens swallowed errors (spinner forever or fake data) | All five data screens use TanStack Query, with shared `LoadingState` / `ErrorState` (retry) / `EmptyState` (`src/components/ui/StateViews.tsx`). On native, `onlineManager` (NetInfo) and `focusManager` (AppState) are wired in `app/_layout.tsx`, so queries refetch after reconnect and on foreground. Tested: offline → Retry → recovers. |
| RPC error messages | Raw server text shown in alerts (`error.message`) | `src/lib/errors.ts` maps **every** RPC code in doc 06 (`TRIP_NOT_FOUND`, `TRIP_NOT_STARTABLE`, `ANOTHER_TRIP_ACTIVE`, `GPS_ACCURACY_TOO_LOW`, `OUTSIDE_PICKUP:<m>` → "You are X km from the pickup", `TRIP_NOT_ACTIVE`, `FORBIDDEN`, `NOTE_REQUIRED`, `TRIP_NOT_IN_REVIEW`), plus `VERSION_REQUIRED`, `PROFILE_NOT_FOUND` (0002) and `LANGUAGE_NOT_SUPPORTED` (0003). It also maps network failures, RLS 42501 and expired JWTs. Unknown errors get a generic message and never leak Postgres text. Tested per code. |
| Realtime | Reconnect on `CLOSED` could loop, since `removeChannel` itself emits `CLOSED`; an unused channel object was created on every subscribe; C6 re-downloaded the whole route on **every** new point | Resubscribe only on `CHANNEL_ERROR`/`TIMED_OUT`; channels are created lazily. C6 appends realtime points into the query cache (`mergePoints`, dedup by `seq`) and refetches everything only after a reconnect. |

## 3. Observability — Sentry

- `@sentry/react-native ~7.11.0`, installed with `expo install`, so it's the SDK 57-validated version. It covers native and web.
- `src/lib/sentry.ts`: `initSentry()` is a no-op without `EXPO_PUBLIC_SENTRY_DSN`. It sets **release** `namma-lorry@<version>`, **dist** (native build number, or `web`) and **environment** (`EXPO_PUBLIC_APP_ENV`). `sendDefaultPii: false`, the user is identified by opaque id only, and it's disabled in local dev.
- **PII scrubbing** (`src/lib/scrub.ts`, pure and tested): `beforeSend` and `beforeBreadcrumb` filter any value under phone- or coordinate-like keys (`phone`, `lat`/`lng`, `p_lat`, `pickup_lat`, `coords`, `location`, …). They also mask phone numbers (+91 / 10-digit / GoTrue `91…`) and high-precision decimals (≥ 4 dp) in any string: messages, exception values, breadcrumb URLs and bodies. IDs, load codes and `OUTSIDE_PICKUP:<m>` stay intact.
- **Source maps:** `app.config.ts` adds the `@sentry/react-native/expo` plugin only when `SENTRY_AUTH_TOKEN` is set, so builds without the secret still work. `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` are added to `.env.example` as **build-only EAS secrets**. This completes ND-11.
- **Not done:** no DSN or Sentry project exists yet, so no event has been sent end to end, and Metro isn't configured with `getSentryExpoConfig` (debug IDs for web source maps). Both belong to M12c.

## 4. Accessibility

| Checked | Result |
|---|---|
| Labels on touch targets | Every `Pressable` in the app has `accessibilityRole` plus a descriptive `accessibilityLabel`. List rows read like "Murugan S, load NL-2026-000142, last update 3m ago. Opens trip detail.". Filters and language rows expose `selected`; buttons expose `disabled`. Headings have `accessibilityRole="header"`; the map is an `image` with a summary label. |
| Replay slider | Was a 16 px dot that only stepped forward, with no label | Now `accessibilityRole="adjustable"` with increment/decrement actions and a value ("Point 12 of 240"), a 48 px hit area, and labelled ‹ / › step buttons. |
| 48 px minimum | Buttons were 44 px; filter chips ~32 px; the slider thumb 16 px | Buttons, filters, rows and retry use `sizes.minTouch` (48). The error-boundary button and language rows use `sizes.driverPrimary` (56). A test asserts a D7 filter's `minHeight ≥ 48`. |
| Font scaling | Fixed-height KPI tiles and single-line rows clipped at large font sizes | KPI tiles and setting/section rows now wrap (`flexWrap`, `flexBasis` instead of fixed width, `minHeight` instead of `height`). **D4/D5 do not exist**, so their font-scaling check is deferred to M9/M10. |
| Contrast vs tokens | There were no tokens. M11 used its own teal/orange palette, contradicting the brief (ND-17). | `src/theme/tokens.ts` holds the brief palette. `contrast.test.ts` checks every text/background pair the screens use against WCAG AA (≥ 4.5:1). **Finding:** as small text on white, the brief's status colours fail: amber 2.1:1, review orange 3.1:1, verified green 4.2:1; live blue barely passes at 4.5:1. They're now fill/icon colours only, and text uses darker `*Text` variants that pass. All M11 colours now come from tokens (no raw hex outside `src/theme`). |

## 5. Performance

| Checked | Result |
|---|---|
| Polyline size | C6 drew one native `View` per segment for the **entire** route (10k+ on a long trip) | `src/lib/simplify.ts`: iterative Douglas–Peucker in local metres, capped at **500 display points** (the tolerance doubles from 5 m until the cap is met; endpoints and order are kept). **Display only**: official km still comes from every stored point in `verify_trip`. Tested on a 12,000-point Sriperumbudur → Coimbatore track. |
| Memoised map layers | Projection and segment styles were recomputed on every render | `MapplsMap` is `React.memo`. Simplification, projection and segment styles are in `useMemo`, and callers pass memoised `markers`/`planned`/`points`. |
| Stale timers | "3m ago" and the stale (>15 min) flags only updated when data changed | A `useNow` hook re-renders every 30 s. |
| Background task network I/O | **No background task exists yet** (M8) | Enforced ahead of time: an ESLint override on `src/tracking/task*.ts` rejects `@supabase/supabase-js`, `@/lib/supabase`, NetInfo, the uploader, and `fetch`/`XMLHttpRequest`/`WebSocket`. Verified by linting a throwaway `task.ts` (2 errors, then deleted). |

## 6. Security review (docs/09 §4–§5)

### 6.1 Secrets
- Grepped all tracked files for service-role keys, `sb_secret_`, JWTs, Mappls secrets, `SENTRY_AUTH_TOKEN`, private keys and AWS keys. **No real values.** Only empty placeholders in `.env.example` files and names mentioned in docs.
- `git log --all`: **no `.env` was ever committed**, and no `.env` exists on disk.
- Rebuilt the web bundle (`expo export`) and scanned it: **no JWTs, secret keys or server-only env names**. One pattern hit was supabase-js library code checking an `sb_secret_` prefix: a false positive.
- `src/lib/config.ts` reads only `EXPO_PUBLIC_*`, and `process.env` is used nowhere else in `src/` or `app/`.
- `supabase/config.toml` contains only local-stack values (the dummy Twilio token `local-dummy-not-a-secret` and the CLI's well-known local JWT secret).

### 6.2 No client writes to trips / driver_stats
- A grep for `.update/.insert/.upsert/.delete` in `src/` and `app/` finds **none**. (The only `.delete(` is `Map.delete` in session storage.)
- Client DB writes are: `admin_review_trip`, and now `set_preferred_language`, both RPCs.

### 6.3 Service role key
- No edge functions exist yet (`supabase/functions/` is absent; M6), and the service-role key is referenced nowhere in app code or the bundle.

### 6.4 RLS tests cover every table — **was failing: there were no RLS tests**
- `supabase/tests/` held only `_helpers.psql` (M4 had stopped there), so `supabase test db` ran nothing.
- **Added `supabase/tests/rls.test.sql`** (70 assertions):
  - A **coverage guard** that fails when a public table is added without updating the file (`set_eq` on `pg_tables`).
  - "RLS enabled on every table".
  - `policies_are` for all 9 tables (fails when a policy is added or removed).
  - Behaviour per role for every policy. Driver: can't update or delete trips (scenario 9), can't insert or update stats, can't read other drivers' trips/points/live/events, can't upload future-dated or pre-start points or points to others' trips, can't edit uploaded points, can't forge audit events, can't escalate role, can't call `verify_trip`/`apply_verified_stats`/the sweeper. Owner and shipper: see only their vehicle's or load's trips. Anon: sees nothing and can't call RPCs. Admin: reads everything and tunes settings, but **can't** write stats directly.
- **Added `supabase/tests/profile_rpcs.test.sql`** (14 assertions) for `record_consent` and `set_preferred_language`: own row only, role untouched, other users untouched, validation, no session, inactive user.
- **Known gap, recorded as a failing pgTAP TODO: ND-13.** `trips_admin` is `FOR ALL`, so an admin client can set `trips.status` or km directly, with no audit event and no stats. The test fails today by design and will pass once the ND-13 migration lands.
- **Still missing from M4:** pgTAP for every RPC error code, every doc 08 reason code, the late-upload trigger, the sweeper, and review stats +1. That's the M4 remainder, not re-scoped here.

### 6.5 Other doc 09 §4 controls
| Control | Status |
|---|---|
| Session in `expo-secure-store` on native | **Was missing:** the client had no storage adapter, so native sessions didn't persist and nothing used the Keychain/Keystore. **Fixed:** `src/lib/sessionStorage.ts` uses SecureStore, **chunked** because a Supabase session exceeds SecureStore's ~2 KB value limit (a torn write reads as signed-out, not a corrupt session). Web uses `localStorage` when usable and falls back to memory during static rendering or in private mode. Auto-refresh follows `AppState` on native. Tested. |
| HTTPS only | **Added:** `config.ts` rejects a non-`https://` Supabase URL outside `development` (tested). Android cleartext settings are still to be confirmed in the M12c prebuild output. |
| Phone number display | D8 showed the full number. It's now masked as `+91 90xxxx4521` (`maskPhone`, tested). |
| Misleading UI | D8 showed a hard-coded "Permissions: Healthy / Battery: Ready". It now reads "Checked before each trip" until M9 implements real checks. |
| Input validation | Review note: trimmed and required client-side, and enforced server-side (`NOTE_REQUIRED`). The language value is validated server-side. |
| Dev routes | **Fixed:** `app/dev/_layout.tsx` redirects every `/dev/*` URL to `/` when `__DEV__` is false (tested both ways). The files are still bundled, since Expo Router bundles every route, but they can't be reached in release builds. |
| `npm audit` in CI | **Added** to CI with a `critical` gate (see 6.6). Also added a CI `database` job: `supabase db start` + `supabase test db`. **Not yet run on GitHub**; it will run on the next push. |

### 6.6 Dependency audit
- **High: `react-server-dom-webpack@19.2.4`** (React Server Components DoS, fixed in ≥ 19.2.6). It's pinned by the SDK 57 template matrix (M1). The app exports a static single-page web bundle (`web.output: 'single'`) with no RSC server, so the vulnerable server path **isn't reachable**. It's left pinned to avoid re-breaking Metro web bundling (M1 known issue 1). **Action:** bump when the Expo template does, then raise the CI audit gate to `high`.
- **14 moderate:** Expo CLI and config-plugin tooling, `uuid` (build-time), and `decode-uri-component` via `expo-router`/`query-string` (client-side DoS on a malformed URL: low impact). npm's suggested fix is a **downgrade to Expo 46**, so none are actionable; revisit with each Expo SDK patch.

### 6.7 Threat model (docs/09 §5), rechecked against the schema
Every Phase 1 control is enforced server-side and now has a pgTAP assertion:
- Mock GPS → review: `is_mocked` is stored and cannot be edited.
- Replayed old points: rejected before `started_at − 1 min` or after `now + 2 min`, and points are immutable.
- Starting away from pickup: `start_trip` geofence.
- Editing km/experience: there is no write path to trips or stats.
- Clock tampering: `recorded_at` bounds.
- Admin abuse: mandatory note plus audit, **except ND-13** (6.4).

The ND-8 poison-batch risk (one bad row fails a 200-row upload) is unchanged and still blocks M8.

## 7. Files

**New:** `src/theme/{tokens,contrast}.ts`, `src/i18n/{en,ta,kn,hi}.json`, `src/i18n/language.ts`, `src/lib/{errors,format,scrub,sentry,sessionStorage,simplify}.ts`, `src/components/ErrorBoundary.tsx`, `src/components/ui/StateViews.tsx`, `src/features/m11/demo.ts`, `app/dev/_layout.tsx`, `scripts/i18n-sync.mjs`, `jest.setup.ts`, `supabase/migrations/0003_preferred_language.sql`, `supabase/tests/{rls,profile_rpcs}.test.sql`, and 11 new Jest test files.
**Changed:** `app/_layout.tsx`, `src/features/m11/{data,screens,types}.ts(x)`, `src/components/map/MapplsMap.tsx`, `src/components/ui/PlaceholderScreen.tsx`, `src/lib/{config,supabase}.ts`, `src/i18n/index.ts`, `app.config.ts`, `.env.example`, `eslint.config.js`, `jest.config.js`, `.github/workflows/ci.yml`, `package.json` (+ `@sentry/react-native`, `i18n:sync` script).

## 8. Not checked — blocked on unbuilt milestones

| Item | Why | Unblocked by |
|---|---|---|
| Font scaling on D4/D5 | Screens are placeholders | M9, M10 |
| Background task makes no network calls (runtime) | No task exists; the lint guard is in place | M8 |
| Service-role key only in edge functions | No edge functions exist | M6 |
| Mappls map layers memoised | No real Mappls map; the preview is memoised | M3 |
| Strings in S1–S4, D1–D6, C2–C5, C8, C9 | Placeholders (their titles are in i18n) | M5–M10 |
| Real translations | Needs a human translator; 168 TODO values per language | — |
| Sentry event end to end | No DSN / Sentry project yet | M12c |
| pgTAP for RPC error codes, reason codes, sweeper, review stats | M4 remainder | M4 |
| ND-13 admin trip writes | Needs a decision and a migration | ND-13 |
