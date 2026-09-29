# Field test script — Phase 1 acceptance (docs/10 §3–§4)

**For:** the people running pilot-readiness tests on real phones and emulators.
**Status (29 Sep 2026):** ready to use once the driver tracking app exists. **Today these runs cannot be performed.** The tracking engine (M8), onboarding and Start (M9), and the active-trip/End screens (M10) are not built yet. Everything the server does in these scenarios is already proven by automated tests (see the matrix in `docs/PHASE1_TASKS.md` §M12b). This script covers what only a phone can prove: background tracking, OEM battery killers, offline queueing and real GPS.

---

## 1. Before you start

### 1.1 What you need
| Item | Detail |
|---|---|
| App build | EAS **preview** build (Android APK / iOS TestFlight) of a version that includes M8–M10. Note the version and build number on every result row. |
| Backend | The hosted **staging** Supabase project (ND-4). A local stack only works on the same Wi-Fi (`EXPO_PUBLIC_SUPABASE_URL=http://<laptop-LAN-IP>:54321`) and **cannot** do airplane-mode or long-distance tests. |
| Accounts | One driver account per phone plus the admin. Staging uses Supabase *test OTP* numbers (see `docs/DEV_SETUP.md` once written; locally: `+91 90000 00011/12/13`, OTP `123456`). |
| Loads | Admin creates one load per run in the console (C3), with **pickup at the actual start point** and a real drop. Radius 500 m unless the scenario says otherwise. Planned distance comes from Mappls. |
| Console | A laptop with the console open at `/console` (C1) and `/console/review` (C7). |
| Phone setup | Charged to ≥ 90 %. Onboarding (D1, D2) completed: location **Allow all the time** / **Always**, notifications on, battery optimisation **off** for Namma Lorry (D2 instructions for the brand). Do **not** change these unless the scenario says so. |
| Stopwatch | For scenario 11 and for noting when each step happened. |

### 1.2 What to record for every run
Fill one row in the results table (§4) per run.

| Field | How to get it |
|---|---|
| **Points expected** | `trips.expected_points` (the phone's last `seq`, sent with `end_trip`). Also shown on `/dev/tracking` in dev builds. |
| **Points received** | `select count(*) from trip_points where trip_id = '<trip>'` |
| **Max gap** | `trips.verification_metrics->>'max_gap_s'` (seconds) |
| **Battery %** | Battery % at Start and at End (status bar), and the difference. Android: Settings → Battery → Battery usage → Namma Lorry %, if available. |
| **Data used** | Android: Settings → Network & internet → Data usage → App data usage → Namma Lorry (reset the counter or note the before/after). iOS: Settings → Mobile Data → Namma Lorry (reset statistics before the run). |
| **Verification result** | `trips.status` + `verification_reasons` (C6 shows both). |
| **Tracked vs planned km** | `tracked_distance_m` vs the load's `planned_distance_m`, as a ratio. |
| **Notes** | Anything unusual: notification disappeared, app restarted, GPS icon off, OEM pop-ups. |

Metrics in one query (admin, SQL editor on staging):
```sql
select t.id, t.status, t.verification_reasons, t.expected_points,
       (select count(*) from trip_points p where p.trip_id = t.id)       as received,
       (t.verification_metrics->>'max_gap_s')::numeric                   as max_gap_s,
       t.tracked_distance_m, l.planned_distance_m,
       round(t.tracked_distance_m::numeric / nullif(l.planned_distance_m, 0), 3) as ratio,
       t.started_at, t.ended_at, t.device_info
from trips t join loads l on l.id = t.load_id
where t.id = '<trip id>';
```

### 1.3 Pass rules that apply to every run
- The Android notification **"Namma Lorry trip in progress"** stays visible from Start to End (P0-6).
- **Completeness:** received ÷ expected ≥ 0.95 for any run not designed to lose data (PRD metric).
- The app never shows an official km. On-screen km is labelled "approx." (CLAUDE.md rule 1).
- If a run fails, capture: screen recording, `adb logcat -d > run-<n>.log` (Android), and the SQL row above.

---

## 2. Scenarios

Every scenario lists its steps, the expected result, and what's already automated (so you don't retest the server logic). "Drive" means travel in a vehicle or on foot at a realistic pace. Walking is fine except for scenarios 1 and 2.

### Scenario 1 — Normal trip, network throughout
**Automated already:** verification maths, ±5 % distance on the two real routes (pgTAP `acceptance.test.sql` S1a/S1b).
1. Admin creates a load from your current location to a drop **15–40 km** away (Mappls planned distance).
2. Driver opens the trip (D4). Confirm the map shows the pickup circle and that Start is enabled only inside the radius.
3. Tap **Start**. Note the time and battery %.
4. Lock the phone and put it in a pocket or cradle. Drive to the drop without touching the app.
5. At the drop, unlock and tap **End** → confirm.
6. Watch D6: "Verifying…" → result.

**Expected:** `verified`, no reasons; completeness ≥ 95 %; max gap ≤ 60 s while moving; tracked/planned between 0.95 and 1.05 (acceptance) and never outside 0.8–1.6 (rule).
**Record:** all §1.2 fields.

### Scenario 2 — 20 minutes of airplane mode mid-trip
**Automated already:** late/out-of-order uploads, live position not regressing, verification (S2).
1. As scenario 1 up to step 4.
2. After ~15 min of driving, turn on **airplane mode**. Note the time. Keep driving.
3. After **20 min**, turn airplane mode off. Note the time.
4. Watch D5's sync status: "N waiting" should drop to "synced" within ~1 min.
5. Continue to the drop and End.

**Expected:** `verified`; **received = expected** (zero lost points); max gap ≤ 60 s (points were recorded offline and uploaded later); C1 showed the truck "stale" during the outage, then caught up.
**Record:** §1.2 + the airplane on/off times + how long sync took after reconnect.

### Scenario 3 — End while offline, reconnect 1 hour later
**Automated already:** late `end_trip` with device end time; completed → verified when the last points arrive (S3a/S3b).
1. As scenario 1, but turn on **airplane mode ~5 min before the drop**.
2. At the drop tap **End** while still offline. D6 should show the offline-ended variant ("will verify when you're back online").
3. Keep the phone offline for **1 hour**. You may lock it and kill the app during this time.
4. Turn airplane mode off. Open the app.

**Expected:** within ~1 min the trip shows `completed` then `verified` automatically; `ended_at` equals the time End was tapped, **not** the reconnect time; received = expected.
**Record:** §1.2 + End time, reconnect time, time to verified.

### Scenario 4 — Try to Start 3 km from the pickup
**Automated already:** server refusal `OUTSIDE_PICKUP:<metres>`, trip stays assigned (S4); message text ("You are 3.1 km from the pickup…", unit test).
1. Admin creates a load with pickup **~3 km** from where you stand.
2. Open the trip (D4).

**Expected:** Start is **disabled**; D4 shows the distance ("You are about 3 km from pickup"). If you force a start (dev build), the "Outside pickup" sheet shows the distance and no tracking starts (no notification, no points).
**Record:** distance shown vs actual (Maps), screenshot.

### Scenario 5 — End 2 km before the drop
**Automated already:** `needs_review` with only `END_OUTSIDE_DROP` (S5); admin approval (S12).
1. As scenario 1, but stop **~2 km before** the drop.
2. Tap **End**. The confirm sheet must warn "you're not at the delivery location" but still allow ending.

**Expected:** ending is never blocked; result `needs_review`, reasons = `END_OUTSIDE_DROP` only; D6 shows "Trip didn't end at the delivery location".
**Record:** §1.2 + screenshot of the warning.

### Scenario 6 — Fake GPS app (Android)
**Automated already:** one mocked point → `MOCK_LOCATION` (S6).
1. Install a mock-location app (e.g. "Fake GPS location"). Enable it in Developer options → *Select mock location app*.
2. Start a trip at the pickup with **real** GPS, drive 5 min.
3. Switch the mock app on and "teleport" towards the drop. Continue 5 min, then End.
4. Remove the mock app afterwards.

**Expected:** `needs_review` with `MOCK_LOCATION` (other reasons possible); `verification_metrics.mocked` ≥ 1.
**Record:** §1.2 + mock app name/version.

### Scenario 7 — App force-stopped for 30 minutes
**Automated already:** 30-min gap → only `TRACKING_GAP`, admin approval (S7).
1. Start a trip and drive 10 min.
2. Android: Settings → Apps → Namma Lorry → **Force stop**. iOS: swipe the app away from the app switcher. Note the time.
3. Keep driving for **30 min** without opening the app.
4. Open the app. It must resume the active trip (D5) and restart tracking.
5. Drive to the drop and End.

**Expected:** `needs_review` with `TRACKING_GAP`; **no** `MISSING_POINTS` (nothing was recorded while stopped, so nothing is missing). The admin can approve it in C6, after which it's `verified` and stats +1.
**Record:** §1.2 + force-stop and reopen times; whether tracking resumed **without** the driver tapping anything (iOS may relaunch on significant location change).

### Scenario 8 — Phone never reconnects after End
**Automated already:** fully, at DB level (sweeper after 6 h → `MISSING_POINTS`, S8). Field run optional.
1. As scenario 3, but after tapping End (offline), **uninstall the app** or wipe the phone.

**Expected:** the trip stays "Awaiting data" in the console; about 6 h after End it becomes `needs_review` with `MISSING_POINTS`.
**Known gap (ND-25):** if even `end_trip` never reached the server, the trip stays `in_progress` forever and blocks that driver's next Start. Don't run that variant on a real pilot account.

### Scenario 9 — Driver edits trip status through the API
**Automated fully** (pgTAP `rls.test.sql`; Playwright REST call returns 0 rows). No field step.

### Scenario 10 — Two trips started at once
**Automated fully** (sequential: pgTAP S10; truly concurrent: `test/db/start-trip-race.sh`). Optional device check:
1. Assign two trips to the same driver with the same pickup. Log in on two phones with the same number.
2. Tap Start on both within a second.

**Expected:** one starts; the other shows "You already have a trip in progress" and does not start tracking.

### Scenario 11 — Console live view ≤ 60 s behind the phone
**Automated already:** point → C1 update without refresh in < 1 s on localhost (Playwright). The field run measures the real network path.
1. Start a trip (scenario 1). Open C1 on the laptop next to the phone.
2. Every 5 min for 30 min: compare the phone's clock time with the "last update" age on C1 and note the marker position vs the real position.
3. Once, put the phone in a spot with weak signal (basement, lift) for 5 min.

**Expected:** "last update" is always ≤ 60 s (target ~30 s) while the phone has signal; the marker and route update without refreshing; the stale (red) flag only appears during the no-signal period.
**Record:** each sample (phone time, C1 age), max observed delay.

### Scenario 12 — Admin approves a flagged trip
**Automated fully** (pgTAP S12 + Playwright C7 → C6 approve). Field run: approve the trips flagged in scenarios 5 and 7 during the session and confirm D6/D8 on the phone show "Verified" and the stats +1 after refresh.

---

## 3. Emulator runs with GPX routes

Use these for repeatable dry runs before driving. Routes: `test/gpx/sriperumbudur-coimbatore.gpx` (465 km, ~8.5 h at 55 km/h, a fix every 10 s) and `test/gpx/hosur-peenya.gpx` (66 km, ~1.9 h at 35 km/h). They start and end exactly at the seeded loads NL-2026-000142 and NL-2026-000143. Regenerate them with `npm run gpx:gen` after editing `test/gpx/routes.json`.

**Android emulator**
1. Start the emulator with a dev or preview build installed and signed in as the seeded driver.
2. **⋯ (Extended controls) → Location → Routes → Load GPX/KML** → pick the file. Set playback speed (1× for realism, 4–8× for a quick run; note it).
3. Before pressing ▶, set the single-point location to the **first** fix (the pickup) so D4 enables Start. Tap Start, then ▶.
4. At the end of the route tap End.

**Expected on the emulator:** emulator locations are **mocked**, so the trip goes to `needs_review` with `MOCK_LOCATION` (doc 10 §2). On a **local dev stack only**, set `update app_settings set value = 100000 where key = 'max_mocked_points'` to verify the rest of the pipeline. Never change this on staging or production. At speeds above 1× expect `SPEED_IMPLAUSIBLE` / `GPS_JUMPS`.

**iOS simulator:** Features → Location → Custom Location (pickup), then use Xcode → Debug → Simulate Location with the GPX added to a scheme. iOS does not flag simulated points as mocked.

---

## 4. Results

### 4.1 Per-run results (copy a row per run)

| Run | Date | Tester | Scenario | Device (brand, model) | OS | App build | Settings (battery saver etc.) | Route / km planned | Start–End (local time) | Points expected | Points received | Completeness % | Max gap (s) | Battery start→end (Δ %) | Data used (MB) | Tracked km / ratio | Result (status + reasons) | Live delay max (s) — S11 | Pass? | Notes / log file |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | | | | | | | | | | | ☐ | |
| 2 | | | | | | | | | | | | | | | | | | | ☐ | |

### 4.2 Device matrix (doc 10 §3) — one cell per scenario run on that device

| Device | Android / iOS | Condition from doc 10 §3 | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S11 |
|---|---|---|---|---|---|---|---|---|---|---|
| Xiaomi / Redmi | 13–14 | 2 h highway, screen off, **battery saver ON** | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Vivo or Oppo | 13–14 | same + **swiped from recents** | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Samsung Galaxy A | 14–15 | tunnel / low-signal stretch | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Realme | 13+ | **reboot mid-trip** | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| iPhone | latest iOS | **Low Power Mode ON**, 1 h (ND-3) | ☐ | ☐ | ☐ | ☐ | ☐ | n/a | ☐ | ☐ |

### 4.3 Sign-off
| | Name | Date | Result |
|---|---|---|---|
| Field tester | | | |
| Ops lead (review of flagged trips) | | | |
| Client (doc 01 §6: 10 pilot trips, ≥ 8 auto-verified) | | | |
