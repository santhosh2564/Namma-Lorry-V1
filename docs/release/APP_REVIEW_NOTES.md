# App Review notes and demo account (draft)

For **Apple** (App Store Connect → App Review Information → Notes, and Beta App Review for external TestFlight) and **Google Play** (App content → App access). Replace every `<…>` before submitting.

**Creating the demo account is a human item.** It needs the production Supabase dashboard, the service-role key and a test phone. Nothing in the repo creates it.

## 1. Prepare the demo account (production project)

1. Dashboard → Authentication → Phone → **Test phone numbers and OTPs**: add `<demo number, e.g. 919999900001>=<6-digit code>`. No SMS is sent to a test number.
2. From an operator machine (never CI), create the driver with `scripts/provision-user.mjs`:
   ```bash
   SUPABASE_URL=https://<prod-ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<secret key> \
     bun run provision-user --phone <demo number> --name "Review Demo Driver" --role driver
   ```
3. In the console, create a demo vehicle (for example `DEMO 00 RV 0001`) for the demo driver.
4. **Record one real short trip** with the demo account on a test phone, so History and Profile show a verified trip. Do not insert history with SQL: verified numbers come only from `verify_trip` (CLAUDE.md hard rule 1).
5. Create the **review load** (material `APP REVIEW DEMO — ignore`) and assign it to the demo driver:
   - pickup at Apple Park, Cupertino (`37.3349, -122.0090`), radius **5000 m** (the schema maximum, `loads.pickup_radius_m`);
   - drop at `37.3230, -122.0322` (about 2.5 km away), radius 5000 m.
6. After review: remove the test phone number, deactivate the account (`bun run provision-user --phone <demo number> --deactivate`), and cancel the review trip if it is still assigned (`public.cancel_trip`, [RUNBOOK](../RUNBOOK.md) §Stuck trip).

## 2. The geofence

`start_trip` refuses a start more than the pickup radius (plus the fix's accuracy) from the pickup and raises `OUTSIDE_PICKUP` (`supabase/migrations/0006_dpdp_controls.sql`). The app shows "You are X km from the pickup. Move inside the circle to start." This is an anti-fraud rule enforced on the server; the client cannot turn it off.

A reviewer far from Cupertino will see that message. The notes and the video explain it. **Decision needed, not built:** if Apple rejects on this, the alternative is a flagged demo account that skips the geofence on the server. That weakens a fraud control, so it needs the client's approval and a migration.

## 3. Apple — Notes for Review (paste)

```
Namma Lorry is a work app for lorry (truck) drivers in India. A transport
operator assigns freight trips to drivers. The driver starts a trip at the
pickup point, the app records the route until the driver ends the trip at the
delivery point, and the operator's server verifies the trip.

ACCOUNTS: drivers cannot sign up; the operator creates their accounts.
Demo account: phone number <+91 99999 00001>, one-time code <XXXXXX>
(tap "Send code", then enter the code; no SMS is sent to this number).

LOCATION (Guidelines 2.5.4, 5.1.1):
- Background location is used ONLY between "Start Trip" and "End Trip" of a
  trip the driver started. Nothing is collected outside a trip. iOS shows the
  location indicator throughout.
- Before the system prompt, the app shows a screen explaining that location
  is used only during trips, why, and who can see it.
- "Always" is needed because trips last 1–12 hours with the phone locked
  while the driver drives; a route with gaps cannot be verified.

HOW TO TEST: after sign-in, open the "APP REVIEW DEMO" trip under My Trips.
Start Trip is only allowed near the pickup point (an anti-fraud rule enforced
by our server). The demo trip's pickup is Apple Park, Cupertino, with a 5 km
radius. Elsewhere you will see "You are X km from the pickup"; that is
expected. History and Profile show a previously verified trip.
Video of the full flow: <unlisted YouTube URL>

Privacy policy: <https://…/privacy>
Contact: <name>, <phone>, <email>
```

## 4. Google Play — App access (paste)

```
All functionality is behind a phone-number sign-in; accounts are created by
the operator. Test account: phone <+91 99999 00001>, code <XXXXXX> (a fixed
test code, no SMS is sent). Starting a trip requires being within the trip's
pickup radius (a server-side anti-fraud check). The video attached to the
location-permission declaration shows the full trip flow, including
background tracking and the persistent notification: <YouTube URL>.
```

## 5. Distribution

- Phase 1 needs only **TestFlight and Play internal testing** (docs/01 §6). Internal TestFlight testers (up to 100 App Store Connect users) need no review; external testers go through Beta App Review with the same notes.
- An app used by one operator's drivers can be challenged at full App Store review as not for the general public. If that happens, apply for **Unlisted App Distribution** instead of changing the app.
