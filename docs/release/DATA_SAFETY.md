# Google Play — Data safety answers (draft)

> **DRAFT — requires legal review** with [PRIVACY_POLICY.md](PRIVACY_POLICY.md) (version `2026-10-01`). Built from what the code on `main` collects on 30 Sep 2026; each row cites the file. Re-check whenever a feature adds data (Phase 2 selfies or delivery photos, for example). Keep in sync with [APP_PRIVACY.md](APP_PRIVACY.md).

Play Console → **App content → Data safety**.

**Service providers** (Supabase, Mappls, Sentry, the SMS provider, Expo, Vercel) process data on our behalf, so under Play's definitions their use is **not "sharing"**.

## Overview questions

| Question                                                             | Answer                                                                                                                                                                  |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does your app collect or share any of the required user data types? | **Yes**                                                                                                                                                                 |
| Is all user data encrypted in transit?                               | **Yes.** HTTPS/WSS only; `src/lib/config.ts` refuses a non-https Supabase URL outside development, and release builds disable cleartext (`app.config.ts`)                 |
| Do you provide a way for users to request that their data is deleted? | **Yes**, through the grievance contact (privacy policy §9); an admin runs the erasure (`docs/RUNBOOK.md` §Erasure, `admin_erase_driver`). Play wants a **web link** for deletion requests: publish one with the policy |
| Independent security review                                          | No                                                                                                                                                                      |

## Data types

| Play category → type                        | Collected | Shared | Optional?                                         | Ephemeral? | Purposes                                                   | What and where (code)                                                                                                                                                                                                  |
| ------------------------------------------- | --------- | ------ | ------------------------------------------------- | ---------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Location → Precise location**             | Yes       | No     | **Required** (trips can't be verified without it) | No         | App functionality; Fraud prevention, security & compliance | **Only between Start Trip and End Trip.** Latitude/longitude, accuracy, speed, heading, altitude, time and the mock flag per point (`src/tracking/queue.ts`, cadence in `src/tracking/config.ts`); start/end positions sent to `start_trip` / `end_trip` |
| **Location → Approximate location**         | Yes       | No     | Required                                          | No         | App functionality                                          | Android grants coarse with fine; declare it for consistency                                                                                                                                                            |
| **Personal info → Name**                    | Yes       | No     | Required                                          | No         | App functionality; Account management                      | `profiles.full_name`, entered by an admin (`scripts/provision-user.mjs`, console)                                                                                                                                      |
| **Personal info → Phone number**            | Yes       | No     | Required                                          | No         | Account management                                         | Phone OTP sign-in (`src/features/auth/`); `profiles.phone`                                                                                                                                                             |
| **Personal info → User IDs**                | Yes       | No     | Required                                          | No         | Account management; App functionality; Analytics           | Account UUID; Sentry receives the same opaque id and nothing else about the user (`src/lib/sentry.ts` `setSentryUser`)                                                                                                 |
| **App info and performance → Crash logs**   | Yes       | No     | Required                                          | No         | App functionality; Analytics                               | Sentry, only when `EXPO_PUBLIC_SENTRY_DSN` is set. `sendDefaultPii: false`; every event and breadcrumb is scrubbed of phone numbers and coordinates on the device (`src/lib/scrub.ts`)                                   |
| **App info and performance → Diagnostics**  | Yes       | No     | Required                                          | No         | App functionality; Analytics                               | Sentry traces (10 % sample in production, `src/lib/sentry.ts`); OS, OS version, model and app version stored with each trip for fraud audits (`getDeviceInfo`, `src/tracking/permissions.ts`)                          |
| **Device or other IDs**                     | Yes       | No     | Required                                          | No         | App functionality                                          | Random per-install id sent by `expo-updates` when checking for an update (`app.config.ts` `updates`)                                                                                                                   |

**Not collected:** email, address, other personal info, financial info, health and fitness, messages, photos or videos, audio, files and docs, calendar, contacts, app interactions, in-app search history, installed apps, web browsing history. The Android manifest removes storage, overlay and vibration permissions (`app.config.ts` `blockedPermissions`), and there is no camera or microphone permission.

Vehicle registration numbers describe the vehicle and are entered by admins. If counsel treats them as personal data, add them under _Personal info → Other info_.

## Points for legal review

- **Retention:** 12 months of raw GPS, then a simplified route (`supabase/migrations/0006_dpdp_controls.sql`), pending client sign-off. The policy and this form must say the same.
- **Account deletion:** sign-ups are meant to be disabled (accounts are created by the operator), which may put the app outside Play's in-app deletion rule. Publish the web request link anyway.
- Should _Fraud prevention_ also be ticked for Name and Phone (the identity of the driver on a verified trip)?
