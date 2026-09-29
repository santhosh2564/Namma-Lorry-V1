# Apple — App Privacy ("nutrition label") answers (draft)

> **DRAFT — requires legal review.** Same data inventory as [PLAY_DATA_SAFETY.md](PLAY_DATA_SAFETY.md); keep the two in sync. App Store Connect → App → **App Privacy**.

**Do you or your third-party partners collect data from this app?** Yes.
**Is any data used to track users** (linked with other companies' data for advertising, or shared with data brokers)? **No.** No ads SDK, no IDFA, no `NSUserTrackingUsageDescription`.

| Data type (Apple's list) | Collected | Linked to user | Used for tracking | Purposes | Notes |
|---|---|---|---|---|---|
| **Location → Precise Location** | Yes | **Yes** | No | App Functionality | Trip route between Start and End only. Apple's *App Functionality* includes fraud prevention and security |
| Location → Coarse Location | No | — | — | — | Only precise is requested on iOS |
| **Contact Info → Name** | Yes | Yes | No | App Functionality | Admin-entered |
| **Contact Info → Phone Number** | Yes | Yes | No | App Functionality | OTP login |
| **Identifiers → User ID** | Yes | Yes | No | App Functionality, Analytics | Account UUID (also the Sentry user id) |
| Identifiers → Device ID | No | — | — | — | No IDFV/IDFA read by our code. The expo-updates install ID is random and app-scoped; legal to confirm it's not a "Device ID" |
| **Diagnostics → Crash Data** | Yes | Yes | No | App Functionality, Analytics | Sentry, scrubbed of phone numbers and coordinates |
| **Diagnostics → Performance Data** | Yes | Yes | No | Analytics | Sentry traces, 10 % sample in production |
| **Diagnostics → Other Diagnostic Data** | Yes | Yes | No | App Functionality | Device model, OS and app version stored with each trip for audits |
| Everything else (Health, Financial, Contacts, User Content, Browsing, Search, Purchases, Usage Data, Sensitive Info, Other) | No | | | | |

"Linked" is **Yes** because every row is stored against the driver's account (Sentry via the opaque user id).

## Related Info.plist / manifest facts (verified 29 Sep 2026 via `expo config --type introspect`)
- `NSLocationWhenInUseUsageDescription`: "Namma Lorry uses your location to start and end trips at the pickup and delivery points."
- `NSLocationAlwaysAndWhenInUseUsageDescription` / `NSLocationAlwaysUsageDescription`: "Namma Lorry records your route in the background only while a trip you started is in progress, so your driving experience can be verified."
- `UIBackgroundModes`: `location` only. `expo-task-manager` adds `fetch`; the config strips it because it's unused.
- `NSMotionUsageDescription`: removed (motion APIs are not used).
- `ITSAppUsesNonExemptEncryption`: `false` (HTTPS only), so no export-compliance prompt on upload.
- `PrivacyInfo.xcprivacy` (app target): required-reason APIs UserDefaults `CA92.1`, FileTimestamp `C617.1`, SystemBootTime `35F9.1`, DiskSpace `E174.1`. Expo/RN pods ship their own manifests.
