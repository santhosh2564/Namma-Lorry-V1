# Apple — App Privacy answers (draft)

> **DRAFT — requires legal review** with [PRIVACY_POLICY.md](PRIVACY_POLICY.md) (version `2026-10-01`). Same data inventory as [DATA_SAFETY.md](DATA_SAFETY.md), which cites the code for each row; keep the two in sync. App Store Connect → the app → **App Privacy**.

**Do you or your third-party partners collect data from this app?** Yes.

**Is any data used to track users** (linked with other companies' data for advertising, or shared with data brokers)? **No.** There is no ads SDK, no IDFA and no `NSUserTrackingUsageDescription`.

| Apple data type                          | Collected | Linked to user | Used for tracking | Purposes                        | Notes                                                                                                           |
| ---------------------------------------- | --------- | -------------- | ----------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Location → Precise Location**          | Yes       | **Yes**        | No                | App Functionality               | Trip route between Start Trip and End Trip only (`src/tracking/queue.ts`). Apple counts fraud prevention as App Functionality |
| Location → Coarse Location               | No        | —              | —                 | —                               | iOS only requests precise location                                                                              |
| **Contact Info → Name**                  | Yes       | Yes            | No                | App Functionality               | Entered by an admin                                                                                             |
| **Contact Info → Phone Number**          | Yes       | Yes            | No                | App Functionality               | OTP sign-in                                                                                                     |
| **Identifiers → User ID**                | Yes       | Yes            | No                | App Functionality, Analytics    | Account UUID, also the only user field Sentry receives (`src/lib/sentry.ts`)                                    |
| Identifiers → Device ID                  | No        | —              | —                 | —                               | Our code reads no IDFV or IDFA. The `expo-updates` install id is random and app-scoped; counsel to confirm it is not a "Device ID" |
| **Diagnostics → Crash Data**             | Yes       | Yes            | No                | App Functionality, Analytics    | Sentry, scrubbed of phone numbers and coordinates on the device (`src/lib/scrub.ts`)                            |
| **Diagnostics → Performance Data**       | Yes       | Yes            | No                | Analytics                       | Sentry traces, 10 % sample in production                                                                        |
| **Diagnostics → Other Diagnostic Data**  | Yes       | Yes            | No                | App Functionality               | OS, OS version, model and app version stored with each trip (`src/tracking/permissions.ts`)                     |
| Everything else                          | No        |                |                   |                                 | Health, Financial, Contacts, User Content, Browsing, Search, Purchases, Usage Data, Sensitive Info, Other       |

"Linked" is **Yes** throughout because every row is stored against the driver's account (Sentry through the opaque user id).

## Related Info.plist facts (from `app.config.ts`, asserted in `test/config/introspect.test.mjs`)

- `NSLocationWhenInUseUsageDescription`: "Namma Lorry uses your location to start and end trips at the pickup and delivery points."
- `NSLocationAlwaysAndWhenInUseUsageDescription` and `NSLocationAlwaysUsageDescription`: "Namma Lorry records your route in the background only while a trip you started is in progress, so your driving experience can be verified."
- `UIBackgroundModes`: `location` only.
- `NSMotionUsageDescription`: removed; motion APIs are not used.
- Privacy manifest (app target): required-reason APIs UserDefaults `CA92.1`, FileTimestamp `C617.1`, SystemBootTime `35F9.1`, DiskSpace `E174.1`.
- Not yet checked: the final Info.plist from a macOS prebuild or EAS build (introspect uses Expo's template).
