# 01 — Project Plan (Phase 1)

## 1. Phase 1 scope in one paragraph
An admin creates a **load** (load ID, pickup, drop) and assigns it to a **driver + vehicle**. The driver opens the mobile app, taps **Start Trip** (allowed only near the pickup), the phone tracks GPS in the background with offline buffering, the console shows the lorry **live on a Mappls map**, the driver taps **End Trip** at the drop, and the backend **verifies** the trip. Verified trips add to the driver's verified trips and km. Everything else (public profile, QR, shipper/owner apps, payments) is Phase 2+.

## 2. Assumptions
- 1–2 developers building with Claude Code and Antigravity; roughly 25–35 focused hours a week.
- Pilot of 5–10 drivers on Android first; iOS goes to TestFlight in the same phase.
- Admin/ops console runs on web from the same Expo codebase.

## 3. Timeline (7 weeks, starting Mon 28 Sep 2026)
Shift the dates if a festival week or exams fall inside a sprint — keep the order.

| Week | Dates | Milestone | Deliverables | Exit criteria |
|---|---|---|---|---|
| W0 | 28 Sep – 2 Oct | **Setup & spike** | Accounts (table below), repo, Expo + TypeScript + Router skeleton, EAS dev build, Supabase project, **Mappls map rendering on Android, iOS and web** | A dev build on a real Android phone shows a Mappls map with the blue dot; web shows the same map |
| W1 | 5 – 9 Oct | **Data & auth** | Migration 0001 applied, RLS tests, phone-OTP login (test numbers), role-based routing, profiles/vehicles seed | Driver and admin log in and land on different home screens; RLS tests green |
| W2 | 12 – 16 Oct | **Console: loads & assignment** | Web console: create load (Mappls autosuggest for pickup/drop), set radius, assign driver + vehicle, trip list | Admin creates a load end-to-end in < 2 min |
| W3 | 19 – 23 Oct | **Tracking engine** | Permission onboarding, `start_trip` with geofence, background task, SQLite queue, batch uploader, foreground notification | 2-hour drive with screen locked → ≥ 95 % of expected points on server; airplane-mode 20 min → no point lost |
| W4 | 26 – 30 Oct | **Live tracking & end trip** | `trip_live` realtime on console map, route polyline, `end_trip`, offline end flow | Console marker updates within ~30 s of the phone moving |
| W5 | 2 – 6 Nov | **Verification & history** | `verify_trip`, pg_cron sweeper, admin review queue, driver trip history + stats | All scenarios in doc 10 §4 produce the expected status |
| W6 | 9 – 13 Nov | **Field test & release** | 10+ real trips, OEM battery fixes, Sentry, Play internal testing + TestFlight, privacy policy live | Client sign-off on pilot report |

## 4. Accounts & costs checklist (do in W0)
| Account | Needed for | Cost |
|---|---|---|
| Mappls developer console | Map SDK key, REST APIs | Free developer tier (check current quota in console) |
| Supabase | DB, auth, realtime, functions | Free tier (pauses after ~1 week of inactivity; upgrade before pilot goes live) |
| Expo / EAS | Cloud builds, updates | Free tier with a limited number of builds per month — local builds are unlimited |
| Google Play Console | Android release | One-time ~US$25 |
| Apple Developer Program | iOS TestFlight/App Store | ~US$99 / year — **not avoidable for iOS** |
| SMS provider (MSG91 / Twilio) | Real phone OTP | Paid per SMS; India needs **DLT registration**. Use Supabase test OTP numbers until pilot |
| Sentry | Crash reporting | Free developer tier |
| Vercel / Netlify / Cloudflare Pages | Host web console | Free tier |
| GitHub | Repo, Actions CI | Free |

## 5. Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Mappls RN SDK needs native config (iOS `.olf`/`.conf` files, maven repo) that Expo doesn't do automatically | Blocks W0 | Spike first; write a small Expo **config plugin** or use `expo prebuild` and commit native changes |
| Chinese-OEM Android phones (Xiaomi, Vivo, Oppo, Realme) kill background tracking | Missing points → unverifiable trips | Battery-optimisation onboarding screen, foreground service, gap detection, field test on these brands |
| iOS "Always" location rejected in App Review | iOS delay | Clear purpose strings, demo account, explain trip-only tracking |
| Play Store background-location declaration rejected | Android delay | Submit declaration + video early (W4), core feature justification in doc 09 |
| GPS spoofing apps | Fake experience | Mock-location flag, speed/teleport checks, review queue; Play Integrity in Phase 2 |
| Another person carries the phone / phone in a different vehicle | Fake experience | Known Phase 1 limitation; Phase 2 selfie check + delivery OTP |
| Supabase free-tier storage (points table grows) | DB fills | Sampling 10 s / 25 m, retention policy, downsample old trips |
| Client earlier specified OpenStreetMap + Kotlin | Scope dispute | Get written confirmation of the switch to React Native + Mappls before W1 |

## 6. Phase 1 definition of done
- 10 real pilot trips completed; ≥ 8 auto-verified; every flagged trip has a correct, human-readable reason.
- No driver-editable path to trips, km or stats (verified by RLS tests).
- Android build on Play internal testing, iOS on TestFlight, console on a public URL behind login.
- Privacy policy published; consent screen shipped.

## 7. Roadmap after Phase 1
- **Phase 2 — Driver profile & trust:** public verified profile page, QR code + verification link, vehicle-type experience, delivery OTP from consignee, proof-of-delivery photo, Play Integrity / App Attest, selfie at trip start, shipper & truck-owner logins with live tracking links.
- **Phase 3 — Scale:** multilingual UI, route snap-to-road, analytics, transporter search of verified drivers, telematics/FASTag cross-checks, payments.
