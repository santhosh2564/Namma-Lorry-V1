# ⚠️ REQUIRES LEGAL REVIEW — DRAFT, NOT FOR PUBLICATION

> Written by engineering from docs/09 §6 and what the app actually collects (29 Sep 2026). **Not legal advice.** The client's counsel must review it against the Digital Personal Data Protection Act, 2023 and the DPDP Rules before it is published or linked from the stores. Replace every `[BRACKETED]` item. Keep it consistent with [PLAY_DATA_SAFETY.md](PLAY_DATA_SAFETY.md), [APPLE_APP_PRIVACY.md](APPLE_APP_PRIVACY.md) and the in-app D1 notice.
>
> **Policy version:** `2026-10-v1`. The D1 consent screen (M9) must pass this exact string to `record_consent`, so every driver's consent is tied to the text they saw. Change the version whenever the text changes.

---

# Namma Lorry — Privacy Policy

**Effective date:** [DATE] · **Version:** 2026-10-v1

## 1. Who we are
Namma Lorry is operated by **[LEGAL ENTITY NAME]**, [REGISTERED ADDRESS], India ("we", "us"). For the purposes of the Digital Personal Data Protection Act, 2023 ("DPDP Act"), we are the **Data Fiduciary** for the personal data described here.

The Namma Lorry app is used by lorry drivers ("you") who carry loads assigned by us. The Namma Lorry web console is used only by our operations staff.

## 2. What we collect
| Data | When | Source |
|---|---|---|
| **Mobile phone number** | When your account is created, and each time you log in (to send a one-time code) | Our operations team; you |
| **Name** | When your account is created | Our operations team |
| **Location (GPS)** | **Only while a trip you started is in progress**, from when you tap *Start Trip* until you tap *End Trip*: about every 10 seconds or 25 metres, including position, accuracy, speed, direction, altitude, time, and whether the phone reported a simulated ("mock") location | Your phone |
| **Start and end positions** of each trip | When you tap *Start Trip* and *End Trip* | Your phone |
| **Device information**: phone model, operating system and version, app version | When you start a trip | Your phone |
| **Crash and error reports** | When the app crashes or an error happens. We remove phone numbers and locations from these reports before they are sent | Your phone |
| **Your choices**: app language, the version of this policy you agreed to, and when | When you choose them | You |
| **Trip records**: assigned loads, vehicle, trip status, verified distance, review notes | When trips are assigned, completed and reviewed | Us; calculated from your trip data |

**We do not** collect location when no trip is in progress, and we do not access your contacts, photos, files, microphone, camera, messages or call logs.

## 3. Why we use it
- To **record and verify your trips**: to check that a trip started near the pickup, ended near the delivery point, and followed a believable route. Verified trips are added to your record of verified trips and kilometres.
- To **show the live position** of a trip in progress to our operations team.
- To **prevent fraud**, for example simulated locations or impossible speeds.
- To **log you in** securely with one-time codes.
- To **find and fix problems** in the app.

We do not use your data for advertising, and we do not sell it.

## 4. Legal basis: your consent
We process this data **with your consent** under Section 6 of the DPDP Act. Before the app first asks for location access, it shows you a notice. We record that you agreed, the version of this policy, and the time.

You can **withdraw consent** at any time (see §8). Withdrawing does not affect processing done before you withdrew. Because recording trips is the purpose of the app, after you withdraw consent you will no longer be able to record new trips.

[LEGAL REVIEW: confirm whether any processing relies on "legitimate uses" under Section 7, e.g. records required by law or for an employment relationship, and state it here.]

## 5. Who can see it
- **Our operations team** can see your trips, live position during a trip, and trip results.
- **Service providers** process data for us under contract and only on our instructions:
  | Provider | What for | Data |
  |---|---|---|
  | Supabase, Inc. (database and login), hosted in [REGION — recommended: Mumbai, India] | Stores all app data | All data in §2 |
  | [SMS PROVIDER — e.g. Twilio Inc.] | Sends login codes | Phone number |
  | MapmyIndia / Mappls (C.E. Info Systems Ltd.) | Maps and address search | Map view area; addresses entered by operations staff |
  | Functional Software, Inc. (Sentry) | Crash reports | Crash reports with phone numbers and locations removed; an anonymous account ID |
  | 650 Industries, Inc. (Expo) | Delivering app updates | An anonymous install ID, app version, device type |
  | Vercel Inc. | Hosting the operations web console | Staff usage only |
- **In future**, the owner of the vehicle or the shipper of a specific load may be able to see the trips for that vehicle or load. We will update this policy and ask for your consent before that starts.
- We may disclose data where required by law, for example to a court or law-enforcement agency with lawful authority.

## 6. How long we keep it
- **Raw GPS points:** [RETENTION PERIOD, not yet decided — PRD open question] after the trip ends. After that we delete them or reduce them to a simplified route.
- **Trip results** (status, verified distance, dates) and your verified trip record: for as long as your account is active, plus [PERIOD].
- **Crash reports:** 90 days [confirm with the Sentry plan].
- When you ask us to erase your data, we delete or anonymise it within [30] days, except where the law requires us to keep it.

## 7. How we protect it
All data is sent over encrypted connections (HTTPS). Access is limited by role: drivers see only their own trips, and only operations staff can see all trips. Your login session is stored in your phone's secure storage. Trip results can't be edited by the app; they are calculated on our server, and every manual review is recorded with the reviewer's name and reason. We keep secret keys only on our servers.

## 8. Your rights
Under the DPDP Act you can:
- **Access**: get a summary of your personal data and how we use it;
- **Correct or complete** inaccurate data;
- **Erase** your data (subject to what the law requires us to keep);
- **Withdraw consent** at any time;
- **Nominate** someone to exercise these rights if you die or become unable to;
- **Complain** to our Grievance Officer (§9), and then to the **Data Protection Board of India** if you are not satisfied.

To use any of these rights, contact the Grievance Officer. We will respond within [PERIOD, e.g. 30 days — confirm against the DPDP Rules].

## 9. Grievance Officer
[NAME]
[DESIGNATION]
Email: [EMAIL] · Phone: [PHONE]
Address: [ADDRESS]
Account and data deletion requests: [URL of the web request form, or email]

## 10. Children
The app is only for adult commercial drivers. We do not knowingly process data of anyone under 18.

## 11. Changes to this policy
If we change this policy, we will update the version and effective date above and show you the new notice in the app. Where the change needs new consent, we will ask for it before continuing.

---

### Counsel checklist (remove before publishing)
- [ ] Legal entity, grievance officer and contact details filled in
- [ ] Retention periods decided (ND-5) and matching the database retention job, which is **not built yet**
- [ ] Processor list and hosting region confirmed (Supabase region, SMS provider)
- [ ] Consent notice in the app (D1) matches §2–§5 in substance, in all four app languages (en, ta, kn, hi)
- [ ] Response timelines and breach-notification commitments aligned with the DPDP Rules
- [ ] Employment context: are drivers employees or contractors, and does that change the legal basis?
