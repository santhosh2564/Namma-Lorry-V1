# Google Play — background location declaration (draft)

> **DRAFT — requires legal review** with [PRIVACY_POLICY.md](PRIVACY_POLICY.md). Wording follows docs/09 §2 and must stay consistent with the D1 disclosure (`app/(onboarding)/permissions.tsx`, `onboarding.permissions` in `src/i18n/en.json`) and the iOS purpose strings in `app.config.ts`.

Play Console → **App content** has two forms that both apply. Expect Play to block rollout to any track, internal testing included, until both are filled in:

1. **Location permissions**, because of `ACCESS_BACKGROUND_LOCATION` (`isAndroidBackgroundLocationEnabled` in `app.config.ts`);
2. **Foreground service permissions**, because of `FOREGROUND_SERVICE_LOCATION` (`isAndroidForegroundServiceEnabled`, target SDK ≥ 34).

## 1. Location permissions form

**Core feature that uses background location** (short):

> Trip recording for freight deliveries. Namma Lorry records the route of a freight trip from pickup to delivery so the driver's work experience can be verified. Location is collected in the background only while a trip the driver started is in progress, with a persistent notification.

**Describe the feature** (long):

> Namma Lorry is used by lorry drivers who carry freight loads assigned by their transport operator. When the driver is at the pickup point and taps "Start Trip", the app starts recording the route of that trip. Recording continues while the phone is locked or another app is open, because a trip lasts hours and a driver cannot keep the app on screen while driving. When the driver taps "End Trip" at the delivery point, recording stops. The route is used to verify that the trip happened, and verified trips are added to the driver's record of verified driving experience.
>
> Location is collected in the background only between Start Trip and End Trip, and the notification "Namma Lorry trip in progress" is shown the whole time. No location is collected when no trip is in progress. Before Android asks for any permission, the app shows a disclosure explaining that location is used only during trips, why, and who can see it.

**Why foreground-only access is not enough:**

> Trips last from one to twelve hours. The driver is driving and cannot keep the app open on screen. A route with gaps whenever the screen locks cannot be verified, which defeats the purpose of the app.

**Video:** unlisted YouTube link to the video in §3.

## 2. Foreground service permissions form

- **Type:** Location (`FOREGROUND_SERVICE_LOCATION`).
- **Task description:**
  > Records the route of a freight trip that the driver started, from pickup to delivery. The service starts only when the driver taps "Start Trip" and stops when the driver taps "End Trip". A persistent notification is shown throughout. The work is started by the user and can't be deferred or interrupted, because gaps in the route make the trip impossible to verify.
- **User impact if deferred or interrupted:** "The trip route would have gaps, and the driver's completed trip could not be verified."
- **Video:** the same video as §1.

The notification text is `notificationTitle` / `notificationBody` in `src/tracking/config.ts` ("Namma Lorry trip in progress" / "Recording your trip for verified experience").

## 3. Video shot list

About 30–45 seconds, portrait, a real Android 13+ phone, English UI, the screen recorder on. Use a **release build** from Play internal testing, the App Review demo account ([APP_REVIEW_NOTES.md](APP_REVIEW_NOTES.md)) and a demo load whose pickup is where you stand. Keep the status bar visible. No personal data on screen.

This follows docs/09 §2: sign-in → assigned trip → prominent disclosure → Start Trip → lock phone → notification visible → End Trip.

| #   | Shot                                                                                             | Must be visible                                                                          | ~s  |
| --- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | --- |
| 1   | Open the app → sign in with the demo number and code                                             | App name, sign-in screen                                                                 | 4   |
| 2   | **D1 "Allow location for your trips"**, held long enough to read                                 | The disclosure card: only during trips, builds verified experience, shared with operations | 6   |
| 3   | _Precise location → Allow_ → Android dialog → **While using the app**                            | System dialog                                                                            | 3   |
| 4   | _Allow all the time → Allow_ → Android settings → **Allow all the time** → back                  | Settings page with "Allow all the time" selected                                         | 5   |
| 5   | _Notifications → Allow_ → Android dialog → Allow                                                 | System dialog                                                                            | 2   |
| 6   | **Continue** → battery step → My Trips → open the assigned trip → **Start Trip**                 | Trip details, Start Trip button                                                          | 5   |
| 7   | Live trip screen; pull down the notification shade                                               | Persistent notification "Namma Lorry trip in progress"                                   | 4   |
| 8   | Press power → lock screen → wait 3 s → unlock; notification still there                          | Notification on the lock screen                                                          | 5   |
| 9   | Walk or drive a short way, reopen the app; the route has grown                                   | Live route                                                                               | 4   |
| 10  | **End Trip** → notification disappears → trip summary                                            | Notification gone                                                                        | 5   |

Upload as **Unlisted**. Keep the source file: Play sometimes asks again during review.

**Before recording:** the D1 disclosure mentions neither retention nor a link to the privacy policy. docs/09 §1 lists retention in the notice, so counsel may ask for a line and a link on D1 first (a new `CONSENT_VERSION` if the text changes).

## 4. Other App content answers

| Item              | Answer                                                                   |
| ----------------- | ------------------------------------------------------------------------ |
| Ads               | No ads                                                                   |
| App access        | Restricted; demo number and code from [APP_REVIEW_NOTES.md](APP_REVIEW_NOTES.md) |
| Content rating    | Utility / productivity questionnaire; expected _Everyone_                |
| Target audience   | 18+ (commercial drivers)                                                 |
| News / government | No                                                                       |
| Data safety       | [DATA_SAFETY.md](DATA_SAFETY.md)                                         |
| Privacy policy    | Public URL of [PRIVACY_POLICY.md](PRIVACY_POLICY.md) once reviewed       |
