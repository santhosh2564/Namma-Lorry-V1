# 10 — Test Plan (Phase 1)

## 1. Automated
| Layer | Tool | What |
|---|---|---|
| DB / RLS | pgTAP via `supabase test db` (+ `supabase/tests/smoke_phase1.sql` on local) | Every policy: driver can't update trips, can't insert stats, can't read other drivers' trips/points; admin can; RPC error codes; verification outcomes for each reason code |
| Unit (app) | Jest + React Native Testing Library | queue (seq never reused, idempotent upload), uploader backoff, state machine transitions incl. app restart, point mapping, distance estimate |
| Component | RNTL | D2 start button disabled states, D3 sync status, D4 statuses |
| Web E2E | Playwright against `expo start --web` | Create load → assign → review approve |
| Mobile E2E (optional) | Maestro | Login → start (mock location in emulator) → end |

## 2. Simulator / emulator location
- Android emulator: *Extended controls → Location → Routes* (import GPX of a real route).
- iOS simulator: *Features → Location → Freeway Drive* or a GPX in Xcode.
- Note: emulator locations are **mocked** on Android — use an admin setting in dev to allow `MOCK_LOCATION` or expect `needs_review`.

## 3. Field-test matrix (W6)
| Device | Android ver. | Scenario |
|---|---|---|
| Xiaomi/Redmi | 13–14 | 2 h highway, screen off, battery saver ON |
| Vivo or Oppo | 13–14 | Same + app swiped away from recents |
| Samsung Galaxy A-series | 14–15 | Tunnel / low-signal stretch |
| Realme | 13+ | Phone reboot mid-trip |
| iPhone (any supported) | latest iOS | Low Power Mode ON, 1 h |
Record per trip: points expected vs received, max gap, battery % used, data used, verification result.

## 4. Acceptance scenarios (must pass before pilot sign-off)
| # | Scenario | Expected |
|---|---|---|
| 1 | Normal trip, network throughout | `verified`, km within ±5 % of Mappls planned route |
| 2 | 20 min airplane mode mid-trip | All points arrive after reconnect; `verified` |
| 3 | End trip while offline, reconnect 1 h later | `completed` → `verified` automatically |
| 4 | Try Start 3 km from pickup | Blocked with distance shown |
| 5 | End 2 km before drop | `needs_review` with `END_OUTSIDE_DROP` |
| 6 | Fake GPS app on Android | `needs_review` with `MOCK_LOCATION` |
| 7 | App force-stopped for 30 min | `needs_review` with `TRACKING_GAP`; admin can approve |
| 8 | Phone never reconnects after end | Sweeper after 6 h → `needs_review` with `MISSING_POINTS` |
| 9 | Driver calls REST API to update `trips.status` | 0 rows / RLS error |
| 10 | Two trips started simultaneously | Second gets `ANOTHER_TRIP_ACTIVE` |
| 11 | Console live view | Marker updates ≤ 60 s behind phone |
| 12 | Admin approves a flagged trip | Status `verified`, stats incremented once, event logged |
