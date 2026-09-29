# App Review notes and demo account (draft)

For **Apple** (App Store Connect → App Review Information → Notes; also *Beta App Review* for external TestFlight) and **Google Play** (App content → App access). Replace every `<…>` before submitting.

## 1. Prepare the demo account (production project)
1. Dashboard → Authentication → Phone → **Test phone numbers and OTPs**: add `<demo number, e.g. 919999900001>=<6-digit code>`. No SMS is sent for this number.
2. `node scripts/provision-user.mjs --phone <demo number> --name "Review Demo Driver" --role driver` (see [SUPABASE_HOSTED.md §6](SUPABASE_HOSTED.md#6-users)).
3. In the console, create vehicle `DEMO 00 RV 0001` and assign it to the demo driver.
4. **Record one real short trip** with the demo account on a test phone in India, so *History* and *Profile* show a verified trip. Don't insert history by SQL: verified data must come from `verify_trip`.
5. Create the **review load** (material: `APP REVIEW DEMO — ignore`) and assign it to the demo driver:
   - Pickup: Apple Park, Cupertino, `37.3349, -122.0090`, **radius 5000 m** (the schema's maximum)
   - Drop: `37.3230, -122.0322` (~2.5 km away), radius 5000 m
6. After review: remove the test phone number, deactivate the demo user (`--deactivate`), and cancel the demo load's trip if it's still open.

**Geofence caveat:** Start Trip only works within 5 km of the pickup (server-side anti-fraud, `start_trip`). A reviewer outside Cupertino will see *"You are X km from the pickup"*. That's expected behaviour, and the notes and video explain it. **Decision needed (not built):** if Apple rejects on this, the alternative is a flagged demo account that skips the geofence server-side. That weakens a fraud control, so it needs your approval and a migration.

## 2. Apple — Notes for Review (paste)
```
Namma Lorry is a work app for lorry (truck) drivers in India. A transport
operator assigns freight trips to drivers. The driver starts a trip at the
pickup point, the app records the route until the driver ends the trip at the
delivery point, and the operator's system verifies the trip.

ACCOUNTS: Drivers cannot sign up; the operator creates their accounts.
Demo account: phone number <+91 99999 00001>, one-time code <XXXXXX>
(tap "Send code", then enter the code; no real SMS is sent to this number).

LOCATION (Guideline 2.5.4 / 5.1.1):
- Background location is used ONLY between "Start Trip" and "End Trip" of a
  trip the driver started. Nothing is collected outside a trip. iOS shows the
  blue location indicator throughout.
- Before the system prompt, the app shows a disclosure screen explaining what
  is collected, why, and who can see it.
- "Always" is required because trips last 1–12 hours with the phone locked
  while the driver drives; a route with gaps cannot be verified.

HOW TO TEST: After sign-in, open "My Trips" > "APP REVIEW DEMO" trip.
Start Trip is only allowed within 5 km of the pickup point (anti-fraud rule
enforced by our server). The demo trip's pickup is Apple Park, Cupertino.
If you are elsewhere, you will see "You are X km from the pickup" — this is
expected. The History and Profile tabs show a previously verified trip.
Full flow video: <unlisted YouTube URL>

Privacy policy: <https://…/privacy>
Contact: <name>, <phone>, <email>
```

## 3. Google Play — App access (paste)
```
All functionality is behind a phone-number login; accounts are created by the
operator. Test account: phone <+91 99999 00001>, OTP <XXXXXX> (fixed test
code, no SMS sent). Starting a trip requires being within 5 km of the trip's
pickup point (server-side anti-fraud check). A demo video of the full trip
flow, including background tracking and the persistent notification, is
provided with the location-permission declaration: <YouTube URL>.
```

## 4. Distribution notes
- **Phase 1 only needs TestFlight + Play internal testing** (doc 01 §6). Internal TestFlight testers (App Store Connect users, ≤ 100) need no review. External testers (pilot drivers via a public link) go through **Beta App Review**; use the same notes.
- An app used only by one operator's drivers can be challenged at full App Store review as not intended for the general public. If that happens, request **Unlisted App Distribution** (App Store Connect → apply by form) rather than changing the app.
