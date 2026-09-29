# Google Play — location & foreground-service declarations (draft)

> **DRAFT — requires legal review** alongside the privacy policy. Wording follows docs/09 §2. It must stay consistent with the in-app D1 disclosure, the iOS purpose strings in `app.config.ts`, and [PRIVACY_POLICY.md](PRIVACY_POLICY.md).

Play Console → **App content** has two separate forms that both apply:
1. **Location permissions** (because of `ACCESS_BACKGROUND_LOCATION`)
2. **Foreground service permissions** (because of `FOREGROUND_SERVICE_LOCATION`, targetSdk ≥ 34)

Expect Play Console to block rollout to **any** track, internal testing included, until both are filled in.

Permissions in the release manifest (verified in `expo prebuild` output, 29 Sep 2026): `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`, `INTERNET`, `VIBRATE`. Storage, overlay, audio and activity-recognition permissions are explicitly removed.

---

## 1. Location permissions form

**Which feature needs background location?** (short)
> Trip recording for freight deliveries. While a driver has started an assigned trip, the app records the lorry's route until the driver ends the trip, so the completed trip can be verified.

**Describe the feature** (long)
> Namma Lorry is used by lorry drivers who are assigned freight loads by their transport operator. When the driver arrives at the pickup point and taps "Start Trip", the app begins recording the route of that trip. It continues recording while the phone is locked or another app is in use, because a trip lasts several hours and drivers cannot keep the app open while driving. When the driver taps "End Trip" at the delivery point, recording stops. The recorded route is used to verify that the trip happened, and verified trips are added to the driver's record of verified driving experience.
>
> Location is collected in the background only between Start Trip and End Trip, and a persistent notification ("Namma Lorry trip in progress") is shown for the whole time. No location is collected when no trip is in progress. Before Android asks for permission, the app shows a full-screen disclosure explaining what is collected, why, and who can see it.

**Why can't this be done in the foreground only?**
> Trips last 1–12 hours. The driver is driving and cannot keep the screen on with the app in front. A route with gaps whenever the screen locks cannot be verified, which defeats the core purpose of the app.

**Video link:** unlisted YouTube URL of the video in §3.

## 2. Foreground service permissions form

- **Foreground service type:** Location (`FOREGROUND_SERVICE_LOCATION`)
- **Task description:**
> Records the route of a freight trip that the driver explicitly started, from pickup to delivery. The service starts only when the driver taps "Start Trip" and stops when the driver taps "End Trip". A persistent notification is shown throughout. The service is user-initiated and its work can't be deferred or interrupted, because gaps in the route make the trip unverifiable.
- **User impact if deferred or interrupted:** "The trip route would have gaps, and the driver's completed trip could not be verified."
- **Video:** the same video as §1.

## 3. Demo video shot list (≈ 30–45 s, portrait, real Android phone, English UI)

Record with the screen recorder on a **release build** (Play internal testing install), signed in as the demo driver, with a load whose pickup is where you're standing. Keep the status bar visible. No personal data: use the demo account and a demo vehicle.

| # | Shot | Must be visible | ~s |
|---|---|---|---|
| 1 | Launch the app → OTP sign-in with the demo number | App name, sign-in screen | 4 |
| 2 | **D1 disclosure screen**, scrolled slowly | Full disclosure text: GPS **only during trips**, why, who sees it, retention, the "I agree" button | 6 |
| 3 | Tap *I agree* → Android dialog → **While using the app** | System dialog | 3 |
| 4 | App explains background access → Android settings → **Allow all the time** → back | Settings page with "Allow all the time" selected | 5 |
| 5 | Notifications permission → Allow (Android 13+) | System dialog | 2 |
| 6 | D3 My Trips → open the assigned trip (D4) → **Start Trip** | Trip card, Start Trip button | 4 |
| 7 | D5 Active trip; pull down the shade | Persistent notification "Namma Lorry trip in progress" | 4 |
| 8 | Press power → lock screen → wait 3 s → unlock → notification still there | Notification on the lock screen | 5 |
| 9 | Walk or drive a short way; reopen the app; the route has grown | Live route | 4 |
| 10 | **End Trip** → notification disappears → summary (D6) | Notification gone | 5 |

Upload as **Unlisted** on YouTube. Keep the source file; Play sometimes asks again during review.

**Blocked until M9/M10:** D1, D4, D5 and D6 are placeholders today, and the D1 background-permission and notification-permission requests aren't implemented. `POST_NOTIFICATIONS` is declared in config, but M9 must request it at runtime or shots 5 and 7 fail on Android 13+.

## 4. Other Play Console "App content" items (quick answers)
| Item | Answer |
|---|---|
| Ads | No ads |
| App access | Restricted: provide the demo phone number + OTP from [APP_REVIEW_NOTES.md](APP_REVIEW_NOTES.md) |
| Content rating | Questionnaire: Utility/Productivity; no violence, UGC, gambling → expected *Everyone / 3+* |
| Target audience | 18+ only (commercial drivers) |
| News app | No |
| Government app | No |
| Financial features | None |
| Health | None |
| Data safety | [PLAY_DATA_SAFETY.md](PLAY_DATA_SAFETY.md) |
| Privacy policy | Public URL of [PRIVACY_POLICY.md](PRIVACY_POLICY.md) |
