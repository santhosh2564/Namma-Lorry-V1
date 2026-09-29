# RLS attack run — local stack

Run: 2026-09-29T08:34:51.014Z · target: origin/main @ 3d77ec0 after `supabase db reset` · tokens: real GoTrue sessions from the seeded test-OTP numbers (admin 919000000001, driver A 919000000011, driver B 919000000012).

Setup: {"assign":"201 trip=040b1cb3-eea3-4850-afb2-ea376ae01a6c","startA":"200 in_progress","startB":"200 in_progress"}

**44/45 as expected.**

| # | Actor | Request | Expected | Actual (HTTP + body) | Result | DB check |
|---|---|---|---|---|---|---|
| C1 | driver A | POST trip_points own trip, valid point (control) | 201, row stored | `201 [{"id":1,"trip_id":"f0000000-0000-4000-8000-000000000001","seq":1,"recorded_at":"2026-09-29T08:34:50.235+00:00","received_at":"2026-09-29T08:34:50.252807+00:00","lat":12.9564,"l...` | PASS |  |
| C2 | driver A | Re-POST same (trip_id, seq) with ignore-duplicates (idempotency) | 2xx, no duplicate | `201 []` | PASS |  |
| A1 | driver A | PATCH own trips.status = verified (scenario 9) | 0 rows / error; DB unchanged | `200 []` | PASS | DB status after: in_progress |
| A2 | driver A | PATCH own trips.tracked_distance_m = 999999 | 0 rows / error; DB unchanged | `200 []` | PASS | DB km after: null |
| A3 | driver A | DELETE own trip | 0 rows / error | `200 []` | PASS |  |
| A4 | driver A | INSERT a trip assigned to self | RLS error | `403 {"code":"42501","details":null,"hint":null,"message":"new row violates row-level security policy for table \"trips\""}` | PASS |  |
| A5 | driver A | INSERT driver_stats for self | RLS error | `403 {"code":"42501","details":null,"hint":null,"message":"new row violates row-level security policy for table \"driver_stats\""}` | PASS |  |
| A6 | driver A | PATCH own driver_stats.verified_trips = 100 | 0 rows / error | `200 []` | PASS | DB stats after: [] |
| A7 | driver A | PATCH own trip_points (edit a recorded point) | 0 rows / error | `200 []` | PASS |  |
| A8 | driver A | DELETE own trip_points | 0 rows / error | `200 []` | PASS |  |
| A9 | driver A | PATCH own profiles.role = admin | 0 rows / error; role stays driver | `200 []` | PASS | DB role after: driver |
| A10 | driver A | PATCH own profiles (name/is_active) | 0 rows / error | `200 []` | PASS |  |
| A11 | driver A | GET driver B's trip | [] | `200 []` | PASS |  |
| A12 | driver A | GET all trips of other drivers | [] | `200 []` | PASS |  |
| A13 | driver A | GET driver B's trip_points | [] | `200 []` | PASS |  |
| A14 | driver A | GET driver B's trip_live | [] | `200 []` | PASS |  |
| A15 | driver A | GET driver B's trip_events | [] | `200 []` | PASS |  |
| A16 | driver A | GET other users' profiles (phone numbers) | [] | `200 []` | PASS |  |
| A17 | driver A | GET other drivers' driver_stats | [] | `200 []` | PASS |  |
| A18 | driver A | POST trip_points into driver B's trip | RLS error; nothing stored | `403 {"code":"42501","details":null,"hint":null,"message":"new row violates row-level security policy for table \"trip_points\""}` | PASS |  |
| A19 | driver A | POST own point recorded_at = now + 10 min (future) | RLS error | `403 {"code":"42501","details":null,"hint":null,"message":"new row violates row-level security policy for table \"trip_points\""}` | PASS |  |
| A20 | driver A | POST own point recorded_at = 24 h before start (pre-start replay) | RLS error | `403 {"code":"42501","details":null,"hint":null,"message":"new row violates row-level security policy for table \"trip_points\""}` | PASS |  |
| A21 | driver A | POST batch [1 valid, 1 future] (ND-8 poison batch) | Whole batch rejected (documented ND-8 behaviour) | `403 {"code":"42501","details":null,"hint":null,"message":"new row violates row-level security policy for table \"trip_points\""}` | PASS | valid row stored: false |
| A22 | driver A | RPC verify_trip | permission denied / not found | `403 {"code":"42501","details":null,"hint":null,"message":"permission denied for function verify_trip"}` | PASS |  |
| A23 | driver A | RPC apply_verified_stats | permission denied / not found | `403 {"code":"42501","details":null,"hint":null,"message":"permission denied for function apply_verified_stats"}` | PASS |  |
| A24 | driver A | RPC sweep_unverified_trips | permission denied / not found | `403 {"code":"42501","details":null,"hint":null,"message":"permission denied for function sweep_unverified_trips"}` | PASS |  |
| A25 | driver A | RPC admin_review_trip on own trip | FORBIDDEN | `403 {"code":"42501","details":null,"hint":null,"message":"FORBIDDEN"}` | PASS |  |
| A26 | driver A | RPC start_trip on driver B's trip | TRIP_NOT_FOUND | `500 {"code":"P0002","details":null,"hint":null,"message":"TRIP_NOT_FOUND"}` | PASS |  |
| A27 | driver A | INSERT a load | RLS error | `403 {"code":"42501","details":null,"hint":null,"message":"new row violates row-level security policy for table \"loads\""}` | PASS |  |
| A28 | driver A | PATCH app_settings threshold | 0 rows / error | `200 []` | PASS |  |
| A29 | admin | PATCH trips.status = verified + tracked_distance_m directly (ND-13) | Blocked (hard rule 2); R2 not merged, so documented gap | `200 [{"id":"040b1cb3-eea3-4850-afb2-ea376ae01a6c","load_id":"b0000000-0000-4000-8000-000000000002","driver_id":"d0000000-0000-4000-8000-000000000002","vehicle_id":"c0000000-0000-400...` | **FAIL** | DB after: {"status":"verified","tracked_distance_m":123456}; events: ["started"] |
| A30 | admin | PATCH driver_stats directly | 0 rows / error | `200 []` | PASS |  |
| A31 | admin | RPC verify_trip (internal) | permission denied | `403 {"code":"42501","details":null,"hint":null,"message":"permission denied for function verify_trip"}` | PASS |  |
| N-profiles | anon | GET profiles | [] or 401 | `200 []` | PASS |  |
| N-trips | anon | GET trips | [] or 401 | `200 []` | PASS |  |
| N-trip_points | anon | GET trip_points | [] or 401 | `200 []` | PASS |  |
| N-trip_live | anon | GET trip_live | [] or 401 | `200 []` | PASS |  |
| N-trip_events | anon | GET trip_events | [] or 401 | `200 []` | PASS |  |
| N-driver_stats | anon | GET driver_stats | [] or 401 | `200 []` | PASS |  |
| N-loads | anon | GET loads | [] or 401 | `200 []` | PASS |  |
| N-vehicles | anon | GET vehicles | [] or 401 | `200 []` | PASS |  |
| N-app_settings | anon | GET app_settings | [] or 401 | `200 []` | PASS |  |
| N-insert | anon | POST trip_points | RLS error | `401 {"code":"42501","details":null,"hint":null,"message":"new row violates row-level security policy for table \"trip_points\""}` | PASS |  |
| N-rpc | anon | RPC start_trip | error | `401 {"code":"42501","details":null,"hint":null,"message":"permission denied for function start_trip"}` | PASS |  |
| U1 | unknown number | POST /auth/v1/otp with create_user=false | refused (Signups not allowed / user not found) | `422 {"code":422,"error_code":"otp_disabled","msg":"Signups not allowed for otp"}` | PASS |  |

## Addendum — self-registration (ND-12)

| # | Actor | Request | Expected | Actual | Result |
|---|---|---|---|---|---|
| U2 | unknown number | `POST /auth/v1/otp {"phone":"919888777666"}` (supabase-js default `create_user=true`, i.e. what any client other than ours sends) | refused; no user or profile created | `422 sms_send_failed` (local Twilio stub), **but** `profiles` now has `{"role":"driver","is_active":true}` for that phone | **FAIL** |

The app itself sends `shouldCreateUser: false` (`src/features/auth/api.ts:25`), so the UI path is refused (U1). The server still accepts sign-ups (`supabase/config.toml` `[auth] enable_signup = true`, `[auth.sms] enable_signup = true`), and `handle_new_user` (`0001_phase1_schema.sql:54-62`) creates an active driver profile for any new auth user. With a working SMS provider, anyone can register as an active driver. They get no trips, since trips are admin-assigned, so no experience data is exposed. It still breaks PRD P0-1 ("Unknown numbers see 'Contact Namma Lorry to register'") at the API layer. Hosted setting unverified (see NEEDS HUMAN EVIDENCE).
