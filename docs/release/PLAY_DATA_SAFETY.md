# Google Play — Data safety answers (draft)

> **DRAFT — requires legal review.** Based on what the code and schema collect as of 29 Sep 2026 (migrations 0001–0004, `src/lib/sentry.ts`, `expo-updates`). Re-check if a feature adds data (for example Phase 2 selfies or POD photos). The answers must match [PRIVACY_POLICY.md](PRIVACY_POLICY.md).

**Service providers** (Supabase, Mappls, Sentry, SMS provider, Expo, Vercel) process data on our behalf, so under Play's definitions their use is **not "sharing"**.

## Overview questions
| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all user data encrypted in transit? | **Yes** (HTTPS/WSS only; cleartext disabled in release builds) |
| Do you provide a way for users to request that their data is deleted? | **Yes**: by email to the grievance contact, or a web request form (see privacy policy §9). Play requires a **web link** for account-deletion requests: publish one (can be a section of the privacy-policy page) |
| Independent security review | No |
| UPI / payments | No |

## Data types

| Category → type | Collected | Shared | Optional? | Processed ephemerally? | Purposes | Where it comes from |
|---|---|---|---|---|---|---|
| **Location → Precise location** | Yes | No | **Required** (the app can't verify trips without it) | No | App functionality; Fraud prevention, security & compliance | GPS points during an active trip (`trip_points`: lat/lng, accuracy, speed, heading, altitude, mock flag, time); start/end positions (`trips`) |
| **Location → Approximate location** | Yes | No | Required | No | App functionality | Android grants coarse with fine; declare it for consistency |
| **Personal info → Name** | Yes | No | Required | No | App functionality; Account management | `profiles.full_name`, entered by the admin |
| **Personal info → Phone number** | Yes | No | Required | No | Account management (login OTP); App functionality | `profiles.phone`, auth |
| **Personal info → User IDs** | Yes | No | Required | No | Account management; App functionality; Analytics (crash attribution, opaque id only) | Account UUID; Sentry user id is the same opaque UUID |
| **App info and performance → Crash logs** | Yes | No | Required | No | App functionality; Analytics | Sentry; phones and coordinates are scrubbed before sending |
| **App info and performance → Diagnostics** | Yes | No | Required | No | App functionality; Analytics | Sentry performance traces (10 % sample in production); device model / OS / app version stored with each trip (`trips.device_info`) for fraud audits |
| **Device or other IDs** | Yes | No | Required | No | App functionality | Random per-install ID sent by `expo-updates` to download app updates; Sentry installation ID |

**Not collected:** email, address, race/ethnicity, political/religious beliefs, sexual orientation, other personal info, financial info, health/fitness, messages, photos/videos, audio, files/docs, calendar, contacts, app interactions, in-app search history, installed apps, web browsing history.
Phase 1 has no photos or selfies. Vehicle registration numbers describe the vehicle and are admin-entered; if counsel treats them as personal data, add them under *Personal info → Other info*.

## Points for legal review
- **Account deletion:** Play's policy requires an in-app path *and* a web link if users can create accounts. Hosted auth has sign-ups **disabled** (accounts are created by the operator), which may put the app outside that rule. The web request link is cheap, so publish it anyway.
- **Retention** is not decided (PRD open question, ND-5). The privacy policy and this form must state the same period.
- Whether "Fraud prevention" should also be ticked for Name and Phone (identity of the driver on a verified trip).
