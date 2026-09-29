# 09 — Security, Privacy & Store Compliance (Phase 1)

> Not legal advice — have the client's counsel review the privacy policy and consent text before the pilot.

## 1. India — Digital Personal Data Protection Act, 2023 (DPDP)
Location + phone number + trip history are personal data. Build these in from Phase 1:
| Need | How |
|---|---|
| Notice + consent before collection | O1 permission screen shows a short notice: what (GPS during trips only), why (verified experience, live tracking for the load), who sees it (Namma Lorry ops; later owners/shippers of that load), retention. "I agree" is stored with timestamp + policy version — add `consent_version`, `consent_at` to `profiles` plus a `record_consent` RPC in migration `0002` (drivers cannot update `profiles` directly). **Enforced server-side (0006):** `start_trip` raises `CONSENT_REQUIRED` while `consent_version` is null, and D1 does not move on unless the consent write succeeded. |
| Purpose limitation | Track **only** between Start and End. No tracking when no trip is active — the background task is stopped. |
| Data minimisation | 10 s / 25 m sampling; no contacts, photos or call logs. |
| Withdrawal & erasure | Driver can request deletion via support; admin tool anonymises points while keeping aggregate stats if the client's policy allows. **Built (0006):** `admin_erase_driver(p_driver_id, p_note)` deletes all GPS points and positions, blanks name and phone, deactivates the profile, keeps anonymised trip results and `driver_stats`, and logs the admin + note in `admin_events`. Procedure: docs/RUNBOOK.md §Erasure. |
| Retention | Raw GPS: **12 months** after a trip is final (`app_settings.raw_point_retention_days` = 365, pending client sign-off, ND-5), then a simplified route of ≤ 500 points plus the trip result. Nightly pg_cron job `downsample-old-points` (0006). Trips still in review keep their full track. |
| Security safeguards | RLS, encrypted transport (HTTPS), secure session storage, least-privilege keys. |
| Breach readiness | Sentry alerts + a one-page incident runbook (who to notify, how). |

## 2. Google Play — background location
- Declare `ACCESS_BACKGROUND_LOCATION` in Play Console → *App content → Location permissions*.
- Core-feature justification (draft): "Namma Lorry records the route of a freight trip from pickup to delivery so the driver's work experience can be verified. Location is collected in the background only while a trip the driver started is in progress, with a persistent notification."
- Upload a short video: login → assigned trip → prominent disclosure → Start Trip → lock phone → notification visible → End Trip.
- **Prominent disclosure** in-app *before* the system dialog (O1 screen).
- Foreground service type `location` (handled by `expo-location` plugin), persistent notification while tracking.

## 3. Apple App Store
`app.json` → `ios.infoPlist`:
- `NSLocationWhenInUseUsageDescription`: "Namma Lorry uses your location to start and end trips at the pickup and delivery points."
- `NSLocationAlwaysAndWhenInUseUsageDescription`: "Namma Lorry records your route in the background only while a trip you started is in progress, so your driving experience can be verified."
- `UIBackgroundModes: ["location"]`, `showsBackgroundLocationIndicator: true`.
- Provide a demo driver account + a test load near Apple's review location in review notes (or explain the geofence and give an override test account).

## 4. Application security
| Area | Control |
|---|---|
| AuthZ | RLS on every table; cross-table checks via SECURITY DEFINER helpers; status changes only via RPCs |
| Role escalation | No self-update on `profiles`; role changes by admin only |
| Keys | Map key restricted by package/bundle/domain; REST secrets only in Edge Functions; service role never in app |
| Session | `expo-secure-store` on native; short JWT expiry + refresh (Supabase default) |
| Transport | HTTPS only; no cleartext traffic on Android |
| Input | zod validation client-side; CHECK constraints + RPC validation server-side |
| Audit | `trip_events` for start/end/verify/review; `reviewed_by`, `review_note` |
| Rate limiting | Supabase auth rate limits for OTP; per-user limits in `mappls-proxy` |
| Dependencies | `npm audit` in CI; pin Expo SDK |

## 5. Threat model (anti-fraud)
| Threat | Phase 1 control | Phase 2 control |
|---|---|---|
| Fake GPS app | `is_mocked` flag → review | Play Integrity / App Attest |
| Replaying an old trip's points | Points must fall inside `started_at…ended_at` and ≤ now + 2 min; unique `(trip_id, seq)` | Signed point batches |
| Starting away from pickup | Server geofence in `start_trip` | — |
| Editing km/experience | No write path; stats only via `verify_trip` / review | — |
| Phone carried by someone else / other vehicle | Known limitation | Selfie at start, delivery OTP, telematics |
| Device clock tampering | Server `received_at` recorded; bounds on `recorded_at`; `ended_at` clamped to `[started_at, now()]` | Compare with server time drift per batch |
| Admin abuse | Mandatory notes + audit log | Two-person review for large overrides |

## 6. Privacy policy — sections to include
Who we are · data collected (phone, name, GPS during trips, device model) · purpose · legal basis/consent · sharing (ops; owners/shippers of the specific load in Phase 2; processors: Supabase, Mappls, Sentry) · retention · security · your rights (access, correction, erasure, grievance) · grievance officer contact · changes to policy.
