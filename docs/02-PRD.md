# 02 — Product Requirements Document (Phase 1)

**Product:** Namma Lorry Verified Driver Experience System
**Phase:** 1 — Verified trip tracking
**Platforms:** Android + iOS (driver app), Web (operations console)
**Status:** Draft for client sign-off

## 1. Problem statement
Transporters hiring lorry drivers today rely on what the driver *says* about their experience — years driven, routes known, loads carried. It can't be checked, so good drivers can't prove their record and transporters take hiring risks. Namma Lorry already knows which loads it dispatches; if it records each trip from real GPS data and verifies it, the driver's experience becomes evidence rather than a claim.

## 2. Goals (Phase 1)
1. **Every assigned load produces a GPS-backed trip record** — target ≥ 95 % of pilot trips have a complete track (no gap > 15 min).
2. **Automatic verification** — ≥ 80 % of genuine pilot trips verify with no human review.
3. **Zero driver-editable experience data** — no API path lets a driver change trips, km or stats (proved by RLS tests).
4. **Live visibility** — ops sees an active lorry's position with ≤ 60 s delay while it has network.
5. **Driver effort ≤ 2 taps per trip** (Start, End) after first-time setup.

## 3. Non-goals (Phase 1)
- **Public/QR driver profile** — data is collected now, the shareable profile is Phase 2 (needs verified data first).
- **Shipper and truck-owner apps** — console is admin-only in Phase 1; roles exist in the DB so they can be switched on later.
- **Turn-by-turn navigation** — drivers use their own navigation; we only record.
- **Payments, bidding, load marketplace** — separate product areas.
- **Driver identity proof at trip time (selfie/face match)** — Phase 2; Phase 1 relies on login + OTP.

## 4. Personas
- **Driver** — Android phone (often budget/mid-range), patchy network on highways, may prefer Tamil/Kannada/Hindi. Wants proof of experience without paperwork.
- **Admin / Ops (Namma Lorry)** — creates loads, assigns drivers, watches live trips, reviews flagged trips. Uses web on a laptop.
- **Truck owner / Shipper** — (Phase 2 UI) wants live status of their vehicle/load.

## 5. User stories
**Driver**
- As a driver, I want to see the load assigned to me with pickup and drop so that I know where to go.
- As a driver, I want to start the trip with one tap when I reach the pickup so that my trip is recorded from the right place.
- As a driver, I want tracking to keep working when my screen is off or I have no network so that I don't lose credit for the trip.
- As a driver, I want to end the trip at the drop with one tap so that it counts towards my experience.
- As a driver, I want to see my verified trips and total verified km so that I can see my record growing.
- As a driver, I want a clear reason if a trip was not verified so that I know what went wrong.
- Edge: As a driver who opens the app far from the pickup, I want to be told how far away I am instead of a silent failure.
- Edge: As a driver whose phone died mid-trip, I want the trip to resume tracking when I reopen the app.

**Admin**
- As an admin, I want to create a load with pickup/drop searched from the map so that locations are accurate.
- As an admin, I want to assign a load to a driver and vehicle so that a trip is created for them.
- As an admin, I want to see all active trips live on one map so that I can monitor operations.
- As an admin, I want to open a trip and replay its route so that I can check what happened.
- As an admin, I want a queue of trips that failed verification, with reasons, so that I can approve or reject them.

## 6. Requirements

### P0 — must ship
| ID | Requirement | Acceptance criteria |
|---|---|---|
| P0-1 | Phone-OTP login with roles (driver, admin; owner/shipper present but hidden) | Given a registered driver, when they enter the OTP, then they land on Driver Home. An admin lands on Console Dashboard. Unknown numbers see "Contact Namma Lorry to register". |
| P0-2 | Admin creates a load | Load has auto-generated Load ID (`NL-YYYY-NNNNNN`), pickup & drop chosen via Mappls autosuggest or map pin, radius (default 500 m), material & weight optional. Planned distance fetched from Mappls. |
| P0-3 | Admin assigns load → trip | One driver + one vehicle per trip. A driver can't have two trips in progress. |
| P0-4 | Permission onboarding | App requests precise location, background ("Allow all the time"/"Always"), notifications, and guides battery-optimisation exemption. Start Trip is disabled until background permission is granted, with a clear explanation. |
| P0-5 | Start Trip geofence | Given the driver is within pickup radius + GPS accuracy, when they tap Start, then the trip becomes `in_progress`. Outside it, they see the distance to pickup and cannot start. |
| P0-6 | Background tracking | Points every ~10 s or 25 m while in progress, screen off or app in background; persistent notification "Namma Lorry trip in progress" on Android. |
| P0-7 | Offline buffer | Points saved locally first; uploaded in batches when online; no duplicates; nothing lost across app restarts. |
| P0-8 | Live tracking on console | Active trips show on a Mappls map; marker + polyline update without refresh. |
| P0-9 | End Trip | Driver taps End anywhere (never trapped), sees a warning if not near drop. App flushes the queue and calls `end_trip`. Works offline — ends locally and syncs later. |
| P0-10 | Server-side verification | Rules in doc 08 run automatically; result `verified` or `needs_review` with reason codes. |
| P0-11 | Admin review | Admin approves/rejects `needs_review` trips with a note; decision is audited. |
| P0-12 | Driver history & stats | Driver sees trips with status and reason; verified trips count & km come from server only. |
| P0-13 | No editable experience | No UI or API lets a driver edit trips, points, distance or stats. |

### P1 — nice to have in Phase 1
| ID | Requirement |
|---|---|
| P1-1 | Route replay slider on console trip page |
| P1-2 | Human-readable start/end addresses via Mappls reverse geocoding |
| P1-3 | Push notification to driver when a trip is assigned / verified |
| P1-4 | Tamil, Kannada, Hindi UI strings |
| P1-5 | Read-only live-tracking console for truck owners |

### P2 — design for, don't build
Public driver profile + QR verification page; delivery OTP; proof-of-delivery photo; Play Integrity / App Attest; selfie check; vehicle-type experience breakdown; shipper tracking links. **Schema must not block these** (e.g. keep `vehicles.vehicle_type`, `trips.verified_at`, `driver_stats`).

## 7. Success metrics
| Type | Metric | Target | How measured |
|---|---|---|---|
| Leading | Track completeness (points received / expected) | ≥ 95 % | SQL on `trip_points` per trip |
| Leading | Auto-verify rate of genuine trips | ≥ 80 % | `trips.status` counts in pilot |
| Leading | Median live delay (server received – recorded) | ≤ 60 s | `trip_points.received_at - recorded_at` |
| Leading | Crash-free sessions | ≥ 99 % | Sentry |
| Lagging | Drivers completing ≥ 3 verified trips in 30 days | ≥ 70 % of pilot | `driver_stats` |
| Lagging | Transporter interest in verified profile (Phase 2 input) | Qualitative | Client interviews |

## 8. Open questions
| Question | Owner | Blocking? |
|---|---|---|
| Is "transporter" a driver or a transport company? (affects role names) | Client | Yes — before W1 |
| Written approval for React Native + Mappls instead of Kotlin + OSM | Client | Yes — before W1 |
| Default pickup/drop radius — 500 m ok for warehouses/yards? | Client ops | Before W3 |
| Who registers drivers — admin only, or self-signup with approval? | Client | Before W1 |
| Data retention period for raw GPS points | Client + legal | Before pilot |
| Multi-drop loads in Phase 1? (assumed **no**) | Client | Before W2 |

## 9. Timeline
See `01-project-plan.md`. Store declarations (background location) must be submitted by W4 to avoid blocking the W6 release.
