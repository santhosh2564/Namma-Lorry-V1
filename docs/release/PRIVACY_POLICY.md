# ⚠️ DRAFT — Requires legal review before publishing

> Written by engineering from docs/09 §6 and what the code on `main` actually collects (30 Sep 2026). **Not legal advice.** The client's counsel must review it against the Digital Personal Data Protection Act, 2023 and the DPDP Rules before it is published or linked from the stores. Replace every `[BRACKETED]` item. Keep it consistent with [DATA_SAFETY.md](DATA_SAFETY.md), [APP_PRIVACY.md](APP_PRIVACY.md) and the in-app D1 notice.
>
> **Version:** `2026-10-01`
>
> This string is `CONSENT_VERSION` in `src/features/onboarding/consent.ts`. D1 sends it to `record_consent`, so each driver's consent is tied to the text they saw. When this text changes materially, change both together; `test/config/release-docs.test.mjs` fails if they differ. **Gap:** the server only checks that _a_ consent exists (`start_trip` raises `CONSENT_REQUIRED` while `consent_version` is null, `supabase/migrations/0006_dpdp_controls.sql`). Nothing yet re-prompts a driver who agreed to an older version.

---

# Namma Lorry — Privacy Policy

**Effective date:** [DATE] · **Version:** `2026-10-01`

## 1. Who we are

Namma Lorry is operated by **[LEGAL ENTITY NAME]**, [REGISTERED ADDRESS], India ("we", "us"). Under the Digital Personal Data Protection Act, 2023 ("DPDP Act") we are the **Data Fiduciary** for the personal data described here.

The Namma Lorry mobile app is used by lorry drivers ("you") who carry loads assigned by us. The Namma Lorry web console is used only by our operations staff.

## 2. Data we collect

| Data                                                                                    | When                                                                                                                                                                                                                                                                     | Source                                   |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| **Mobile phone number**                                                                 | When your account is created, and each time you sign in (we send a one-time code to it)                                                                                                                                                                                  | Our operations team; you                 |
| **Name**                                                                                | When your account is created                                                                                                                                                                                                                                             | Our operations team                      |
| **Location (GPS)**                                                                      | **Only while a trip you started is in progress**, from when you tap _Start Trip_ until you tap _End Trip_. About every 10 seconds while moving, and at least every 5 minutes while parked: position, accuracy, speed, direction, altitude, time, and whether the phone reported a simulated ("mock") location | Your phone                               |
| **Start and end positions** of each trip                                                | When you tap _Start Trip_ and _End Trip_                                                                                                                                                                                                                                 | Your phone                               |
| **Device information:** phone model, operating system and version, app version          | When you start a trip                                                                                                                                                                                                                                                    | Your phone                               |
| **Crash and error reports**                                                             | When the app crashes or an error happens. Phone numbers and locations are removed from these reports on your phone before they are sent                                                                                                                                  | Your phone                               |
| **Your choices:** app language, the version of this policy you agreed to, and when      | When you make them                                                                                                                                                                                                                                                       | You                                      |
| **Trip records:** assigned loads, vehicle, trip status, verified distance, review notes | When trips are assigned, completed and reviewed                                                                                                                                                                                                                          | Us; calculated from your trip data       |

**We do not** collect location when no trip is in progress, and we do not access your contacts, photos, files, microphone, camera, messages or call logs.

## 3. Purpose: why we use it

- To **record and verify your trips**: to check that a trip started near the pickup, ended near the delivery point, and followed a believable route. Verified trips are added to your record of verified trips and kilometres.
- To **show the live position** of a trip in progress to our operations team.
- To **prevent fraud**, for example simulated locations or impossible speeds.
- To **sign you in** securely with one-time codes.
- To **find and fix problems** in the app.

We do not use your data for advertising, and we do not sell it.

## 4. Legal basis: your consent

We process this data **with your consent** under Section 6 of the DPDP Act. Before the app first asks for location access, it shows you a notice. We record that you agreed, the version of this policy, and the time.

You can **withdraw consent** at any time (see §8). Withdrawing does not affect processing done before you withdrew. Recording trips is the purpose of the app, so after you withdraw consent you can no longer record new trips.

[LEGAL REVIEW: confirm whether any processing relies on "legitimate uses" under Section 7, for example records required by law or for employment, and state it here.]

## 5. Sharing: who can see it

- **Our operations team** can see your trips, your live position during a trip, and trip results.
- **Service providers** process data for us under contract and only on our instructions:

  | Provider                                                   | What for                         | Data                                                                        |
  | ---------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------- |
  | Supabase, Inc., hosted in [REGION — recommended: Mumbai]   | Database and sign-in             | All data in §2                                                              |
  | [SMS PROVIDER]                                             | Sending sign-in codes            | Phone number                                                                |
  | MapmyIndia / Mappls (C.E. Info Systems Ltd.)               | Maps and address search          | Map area viewed; addresses entered by operations staff                      |
  | Functional Software, Inc. (Sentry)                         | Crash reports                    | Crash reports with phone numbers and locations removed; an anonymous ID     |
  | 650 Industries, Inc. (Expo)                                | Delivering app updates           | An anonymous install ID, app version, device type                           |
  | Vercel Inc.                                                | Hosting the operations console   | Staff usage only                                                            |

- **Later**, the owner of the vehicle or the shipper of a specific load may be able to see the trips for that vehicle or load. We will update this policy and ask for your consent before that starts.
- We may disclose data where the law requires it, for example to a court or a law-enforcement agency with lawful authority.

## 6. Retention: how long we keep it

- **Raw GPS points:** 12 months after a trip is final. After that we keep only a simplified route (at most 500 points) and the trip result. Trips still under review keep their full route until they are decided. [PENDING CLIENT SIGN-OFF of the 12-month period.]
- **Trip results** (status, verified distance, dates) and your record of verified trips: for as long as your account is active, plus [PERIOD].
- **Crash reports:** [90 days — confirm against the Sentry plan].
- **Erasure:** when you ask us to erase your data, we delete all your GPS points and positions, remove your name and phone number, and deactivate your account within [30] days. We keep the anonymised trip results and totals, so our fleet records stay complete, but they are no longer linked to your name or phone number. [LEGAL REVIEW: confirm this counts as erasure under the DPDP Act.]

## 7. Security: how we protect it

All data is sent over encrypted connections (HTTPS). Access depends on role: drivers see only their own trips, and only operations staff see all trips. Your sign-in session is kept in your phone's secure storage, and is excluded from phone backups. Trip results can't be edited from the app: they are calculated on our server, and every manual review is recorded with the reviewer and a reason. Secret keys are kept only on our servers.

## 8. Your rights

Under the DPDP Act you can:

- **Access:** get a summary of your personal data and how we use it;
- **Correct or complete** inaccurate data;
- **Erase** your data (§6), except what the law requires us to keep;
- **Withdraw consent** at any time;
- **Nominate** someone to exercise these rights if you die or become unable to;
- **Complain** to our Grievance Officer (§9), and then to the **Data Protection Board of India** if you are not satisfied.

To use any of these rights, contact the Grievance Officer. We will respond within [PERIOD — confirm against the DPDP Rules].

## 9. Grievance officer

[NAME], [DESIGNATION]
Email: [EMAIL] · Phone: [PHONE]
Address: [ADDRESS]
Account and data deletion requests: [URL of a web request form, or the email above]

## 10. Children

The app is only for adult commercial drivers. We do not knowingly process data of anyone under 18.

## 11. Changes to this policy

If we change this policy, we will update the version and effective date above and show you the new notice in the app. Where the change needs new consent, we will ask for it before you can continue.

---

### Counsel checklist (remove before publishing)

- [ ] Legal entity, grievance officer and contact details filled in
- [ ] 12-month GPS retention signed off by the client (ND-5); it matches `app_settings.raw_point_retention_days` = 365 and the nightly `downsample-old-points` job (`supabase/migrations/0006_dpdp_controls.sql`)
- [ ] Erasure as anonymisation (§6) accepted
- [ ] Processor list and hosting region confirmed (Supabase region, SMS provider)
- [ ] The D1 notice (`app/(onboarding)/permissions.tsx`, `src/i18n/`) matches §2–§5 in substance, in all four app languages
- [ ] Response times and breach-notification commitments match the DPDP Rules
- [ ] Employment context: are drivers employees or contractors, and does that change the legal basis?
