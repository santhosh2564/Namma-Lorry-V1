# 08 — Verification Rules (Phase 1)

> This document decides what counts as a driver's **verified experience**. The client should sign off on the thresholds. All rules run in Postgres (`verify_trip`); thresholds live in `app_settings` and can be tuned without an app release.

## 1. Principle
A trip is **verified automatically** only if every rule passes. Any failure → `needs_review` with reason codes; an admin approves or rejects with a note. Only `verified` trips add to `driver_stats`. Drivers can't edit anything in this chain.

## 2. Distance calculation (official km)
1. Take the trip's points between `started_at` and `ended_at`, ordered by time.
2. Drop points with accuracy worse than **50 m**.
3. Sum geodesic distance (PostGIS `ST_Distance` on `geography`) between consecutive points.
4. Skip segments implying speed > **150 km/h** (GPS jumps).
5. Result → `trips.tracked_distance_m`. The app's on-screen km is only an estimate.

## 3. Rules
| Code | Rule | Default | Driver-facing text |
|---|---|---|---|
| `START_OUTSIDE_PICKUP` | Start position within pickup radius + GPS accuracy | radius 500 m | "Trip didn't start at the pickup location" |
| `END_OUTSIDE_DROP` | End position within drop radius + accuracy | radius 500 m | "Trip didn't end at the delivery location" |
| `MOCK_LOCATION` | No point flagged as mock location (Android) | 0 allowed | "Fake GPS app detected" |
| `TRACKING_GAP` | Longest gap between points | ≤ 15 min | "Tracking stopped for a long time" |
| `LOW_COVERAGE` | Points per hour of trip | ≥ 60 | "Not enough GPS data was recorded" |
| `MISSING_POINTS` | All points the phone recorded reached the server | received ≥ expected | "Some trip data never uploaded" |
| `SPEED_IMPLAUSIBLE` | Average speed | ≤ 80 km/h | "Trip speed looks unusual" |
| `GPS_JUMPS` | Segments faster than 150 km/h | ≤ 5 | "GPS signal jumped around" |
| `DISTANCE_TOO_SHORT` | Tracked ÷ planned (Mappls route) | ≥ 0.8 | "Distance is much shorter than the route" |
| `DISTANCE_TOO_LONG` | Tracked ÷ planned | ≤ 1.6 | "Distance is much longer than the route" |

Start is also **hard-blocked** in `start_trip` (can't start outside pickup). End is **never blocked** — a driver must always be able to stop tracking — but is flagged.

## 4. When verification runs
- Immediately in `end_trip` if all expected points are on the server.
- Otherwise when the last missing point arrives (trigger on `trip_points`).
- Otherwise by the pg_cron sweeper **6 h** after the trip ended (flags `MISSING_POINTS`).

## 5. Admin review guidance
Approve when a reason has a real-world explanation (e.g. yard entrance 700 m from the pin, phone died for 20 min in a verified corridor, detour due to road closure). Reject for mock location, impossible speeds, or tracks that don't resemble the route. The note is mandatory and audited in `trip_events`.

## 6. Tuning after pilot
Collect `verification_metrics` for every pilot trip, then adjust radius/gap/ratio in `app_settings`. Expect to widen radii for large industrial yards and ports.

## 7. Phase 2 additions
Delivery OTP from consignee, proof-of-delivery photo with EXIF location, Play Integrity / App Attest token at start and end, selfie at start, vehicle telematics cross-check.
