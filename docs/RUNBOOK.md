# Runbook

Operational procedures for Namma Lorry Phase 1, for whoever is on call during the pilot. First-time release setup is in [release/README.md](release/README.md); this file is what to do once the app is live.

**Ground rules**

- **Staging first.** Nothing goes to production that has not run on staging (EAS `preview`, the staging Supabase project, Vercel Preview).
- **Status changes go through the admin RPCs** (`admin_force_end`, `cancel_trip`, `admin_review_trip`, `admin_erase_driver`). They check the caller is an admin, require a note, and write `trip_events` / `admin_events`. A hand-written `update trips` is only for re-verification (§Re-run verification), inside a transaction, with a `trip_events` row.
- **Never tell a driver to uninstall the app or clear its data** until their last trip shows Verified, Under review or Not verified. Unsent GPS points live only in the phone's SQLite queue (`src/tracking/queue.ts`).
- Phones buffer points offline, so a short backend outage loses no trip data. Take the time to do things right.

## Admin SQL session

The Supabase SQL editor runs as `postgres`, where `auth.uid()` is null and `is_admin()` is false, so every admin RPC raises `FORBIDDEN`. Start each transaction by acting as your own admin account (Authentication → Users → your row → UID). The same line makes `trip_events.actor_id` record you:

```sql
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', '<your admin uuid>', 'role', 'authenticated')::text, true);
-- … the statements from the section you are following …
commit;   -- or rollback; if anything returned something unexpected
```

`set_config(…, true)` lasts only until the transaction ends. Every SQL block below assumes you are inside one.

## Deploy

Order: **database → Edge Functions → web console → app**. Installed apps stay in the field for weeks, so a migration must keep working with the builds drivers already have: add columns and RPCs; don't rename or drop until no build uses them.

**Before every deploy:** CI is green on the commit (typecheck, lint, format, `bun run test`, `bun run test:config`, `bun run test:scripts`, pgTAP), and the change has run on staging.

### Database

```bash
supabase link --project-ref <staging-ref>
supabase db push --dry-run && supabase db push
# check staging, then production:
supabase link --project-ref <production-ref>
supabase db push --dry-run && supabase db push
```

Never edit a migration that has been pushed; fix forward with a new file. After a migration that adds or changes a cron job, check `select jobname, schedule from cron.job;`.

### Edge Functions

```bash
supabase functions deploy mappls-proxy --project-ref <ref>
supabase functions deploy admin-create-driver --project-ref <ref>
```

### Accounts

Nobody signs up: operators create every user (`bun run provision-user`, or Drivers → Add in the console, which calls `admin-create-driver`), and both activate the profile. Any other new auth user gets an **inactive** profile (migration 0007) and sees "Your account is not active". Sign-ups must stay **off** in each hosted project's dashboard (Authentication → Sign In / Providers → "Allow new users to sign up"). After any change to a project's auth settings, request an OTP for an unregistered number: it must fail and create no user. To activate someone added another way: `bun run provision-user --phone <number> --activate`.

### Web console (Vercel)

Merging to `main` deploys Production; PR branches get Preview deployments against staging. `vercel.json` is the whole build config. After a deploy, sign in and check the browser console for CSP errors. Changing an `EXPO_PUBLIC_*` value needs a **redeploy**, because Metro inlines them at build time.

### App: JavaScript-only change (EAS Update)

```bash
bun run update:preview "What changed"       # install the preview build, check it
bun run update:production "What changed"
```

`scripts/eas-update.mjs` refuses a dirty tree, puts the commit SHA in the message and sets the matching `EXPO_PUBLIC_APP_ENV`. Never run a bare `eas update`: it would inline the shell's APP_ENV. Drivers get the update on the **next cold start** after it downloads. An update can't change native code, permissions or native `app.config.ts` fields, and it reaches only builds with the same `version`.

### App: native change (new build)

1. Bump `version` in `app.config.ts` (the runtime version follows it).
2. `bun run release:assets --strict`.
3. `npx eas-cli@latest build --profile preview --platform all` → install → one real short trip.
4. `npx eas-cli@latest build --profile production --platform all` → `npx eas-cli@latest submit --profile production --platform all --latest`.
5. Play: staged rollout (20 % → 100 %). iOS: phased release.

## Rollback

| Layer             | How                                                                                                                                                                                                                                                                                                                                                      | Time       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **EAS Update**    | `npx eas-cli@latest update:list --branch production` → copy the last good **group id** → `npx eas-cli@latest update:republish --group <group id>`. Republishing reuses the old bundle, env values included. Drivers get it on their next cold start. If no good update exists, `npx eas-cli@latest update:roll-back-to-embedded --branch production` returns builds to the JS they shipped with | minutes    |
| **Web console**   | Vercel → Deployments → the last good Production deployment → **Instant Rollback**. Later merges don't go live until you undo it (Promote)                                                                                                                                                                                                                | seconds    |
| **Android build** | Play Console → Production → **Halt rollout**. A lower versionCode can't be served: rebuild the last good commit (EAS gives it a higher build number). If the bug is JS-only, fix it with an update instead                                                                                                                                              | hours      |
| **iOS build**     | Pause the phased release; expire the TestFlight build. Ship a fixed build (ask for expedited review if severe), or an update if JS-only                                                                                                                                                                                                                  | hours–days |
| **Database**      | **Fix forward** with a new migration. Restoring a backup loses every trip since the snapshot: last resort, for corruption only, with the client's agreement                                                                                                                                                                                              | —          |
| **Edge Function** | `git checkout <good sha> -- supabase/functions/mappls-proxy` → `supabase functions deploy mappls-proxy`                                                                                                                                                                                                                                                 | minutes    |

## Key rotation

Rotate yearly, when someone with access leaves, and **at once** if a key is exposed. `EXPO_PUBLIC_*` values are inside every installed app, so for those, rotation is **create new → ship → wait for adoption → revoke old**. Revoking first breaks every installed app.

| Key                                                | Lives in                                                               | Rotate                                                                                                                                                                                                                                                                                                                                                             | If done wrong                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Supabase **publishable (anon)** key                | EAS env, Vercel env, every app bundle                                  | Dashboard → Project Settings → API Keys → new publishable key → `npx eas-cli@latest env:update` for `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `preview` and `production`, and the Vercel variable → `bun run update:production "Rotate publishable key"` and redeploy the console → wait until most drivers run it (`update:list`) → delete the old key. Don't rotate the legacy JWT secret: it invalidates anon, service role and every session at once | App and console can't reach the API            |
| Supabase **secret (service-role)** key             | Operator password manager; Edge Functions get it injected              | New secret key → update the password manager → delete the old one. `bun run provision-user` reads it from the shell                                                                                                                                                                                                                                                 | Operator scripts fail                          |
| Mappls **map SDK** key (web)                       | EAS env, Vercel env, bundles; restricted by package, bundle id, domain | New key with the same restrictions → `EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY` in EAS and Vercel → update and console redeploy → revoke the old key                                                                                                                                                                                                                          | Blank maps                                     |
| Mappls **native** licence files (`.olf` / `.conf`) | `mappls/` on the build machine (git-ignored)                           | New files from the Mappls console → **new build** (compiled in; an update can't change them) → revoke the old ones only after adoption                                                                                                                                                                                                                              | Blank maps in the app                          |
| Mappls **REST** credentials                        | Supabase Edge Function secrets                                         | `supabase secrets set MAPPLS_CLIENT_ID=… MAPPLS_CLIENT_SECRET=… MAPPLS_REST_KEY=…` → `supabase functions deploy mappls-proxy` → revoke the old ones                                                                                                                                                                                                                  | Console address search and routing fail        |
| Sentry **DSN**                                     | EAS env, Vercel env, bundles                                           | Sentry → Client Keys → new key → `EXPO_PUBLIC_SENTRY_DSN` in EAS and Vercel → update and redeploy → disable the old key after adoption                                                                                                                                                                                                                              | Crash reports stop                             |
| `SENTRY_AUTH_TOKEN`                                | EAS secret                                                             | Revoke in Sentry → new token → `npx eas-cli@latest env:update` (visibility `secret`)                                                                                                                                                                                                                                                                                | Source maps missing                            |

## Stuck trip

### Diagnose

```sql
select t.id, t.status, t.started_at, t.ended_at, t.expected_points, t.verification_reasons,
       (select count(*) from public.trip_points where trip_id = t.id)         as points_received,
       (select max(recorded_at) from public.trip_points where trip_id = t.id) as last_point_at,
       (select max(received_at) from public.trip_points where trip_id = t.id) as last_upload_at
from public.trips t where t.id = '<trip id>';
select type, actor_id, payload, created_at from public.trip_events
where trip_id = '<trip id>' order by created_at;
```

| Symptom                                                      | Likely cause                              | Action                                                                                                                                                                         |
| ------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `in_progress`, uploads still arriving                        | Trip really running                       | Nothing                                                                                                                                                                        |
| `in_progress`, no uploads for hours, driver says they ended  | Phone offline; End is queued on the phone | Ask the driver to open the app on mobile data or Wi-Fi and keep it open for 2 minutes. Don't uninstall                                                                         |
| `in_progress` for good: phone lost, wiped or broken          | End will never arrive                     | **Force-end** (below)                                                                                                                                                          |
| Driver can't start: "another trip is active"                 | Same, on the older trip                   | Force-end the older trip                                                                                                                                                       |
| `completed` ("Verifying…")                                   | Waiting for the remaining points          | Wait: the sweeper (`sweep-unverified-trips`, every 15 min) verifies it `unsynced_grace_hours` (6 h) after the end. To do it now: `select public.verify_trip('<trip id>');` |
| `assigned`, wrong driver or vehicle, or the load withdrawn   | Admin error                               | **Cancel** (below)                                                                                                                                                             |
| Start fails with "You are X km from the pickup"              | Wrong pickup pin, or a large yard         | Fix the pickup location or radius on the load (max 5000 m)                                                                                                                     |

### Force-end an abandoned trip (`in_progress`)

In an [admin SQL session](#admin-sql-session):

```sql
select id, status, ended_at, verification_reasons
from public.admin_force_end('<trip id>', 'Phone lost, driver confirmed by call. Ticket <ref>');
```

It ends the trip at the last point received, verifies what arrived, and always lands in **needs_review**: `MISSING_POINTS` is guaranteed, and `END_OUTSIDE_DROP` too, since there is no end position. The live marker is removed and a `force_ended` event records you and the note. Stats change only if someone then approves it in Review with a note. Errors: `TRIP_NOT_ACTIVE` (not `in_progress`), `NOTE_REQUIRED`, `FORBIDDEN` (no admin session).

### Cancel a trip that hasn't started (`assigned`)

```sql
select id, status from public.cancel_trip('<trip id>', 'Wrong vehicle assigned. Ticket <ref>');
```

The load can then be assigned again from the console. Errors: `TRIP_NOT_CANCELLABLE` (it has started; force-end it instead), `NOTE_REQUIRED`, `FORBIDDEN`.

## Re-run verification

`verify_trip` acts only on `completed` trips. Re-running it is safe for anything **not yet counted in stats**: `completed`, or `needs_review` with no human decision. **Never** put a `verified` or reviewed trip back to `completed`: re-verifying a verified trip adds its km to `driver_stats` a second time.

### One trip (for example, late points arrived after it was flagged)

In an [admin SQL session](#admin-sql-session):

```sql
update public.trips set status = 'completed'
where id = '<trip id>' and status = 'needs_review' and reviewed_by is null;   -- expect UPDATE 1
insert into public.trip_events(trip_id, type, payload)
values ('<trip id>', 'reverify', jsonb_build_object('note', '<why>, ticket <ref>'));
select public.verify_trip('<trip id>');                                      -- verified or needs_review
```

If the update touched 0 rows, stop and `rollback`.

### Every undecided trip (after the client signs off new `app_settings` thresholds)

```sql
do $$
declare r record; v public.trip_status;
begin
  for r in select id from public.trips where status = 'needs_review' and reviewed_by is null loop
    update public.trips set status = 'completed' where id = r.id;
    insert into public.trip_events(trip_id, type, payload)
    values (r.id, 'reverify', jsonb_build_object('note', 'app_settings change <date>'));
    v := public.verify_trip(r.id);
    raise notice '% -> %', r.id, v;
  end loop;
end $$;
```

### The sweeper stopped

```sql
select status, count(*) from cron.job_run_details
where start_time > now() - interval '1 day' group by 1;   -- all succeeded
select public.sweep_unverified_trips();                    -- catch up by hand
```

## Changing the policy version

When the privacy policy or the D1 notice changes materially, every driver must agree again. The version exists in two places that must match (`test/config/consent-version.test.mjs` fails otherwise): `CONSENT_VERSION` in `src/features/onboarding/consent.ts` (with the **Version:** line in `docs/release/PRIVACY_POLICY.md`), and `public.current_consent_version()` in the database.

The database counts a consent to its current version **or a newer one** (versions are `YYYY-MM-DD` and compare as text); an older one is refused.

**Order matters: app first, then the database.**
- _App first (correct):_ the new build sends its drivers to D1, which records the new version. The database accepts it because it is newer than its current one, and trips start as before. Drivers still on the old build carry on until the migration.
- _Migration first (wrong):_ drivers on an installed build are refused at Start (`CONSENT_REQUIRED`), D1 records their old version, gets `CONSENT_VERSION_OUTDATED`, and says "update the app". Nobody on the old build can start a trip until they update.

1. In one PR: bump `CONSENT_VERSION` and the policy's **Version:** line, and add a migration that redefines `public.current_consent_version()` to return the new version. Merge it, but hold the migration.
2. Ship the app: a native build or an EAS Update (§Deploy), and wait until drivers have it (store rollout, or `eas update` reaching devices).
3. Apply the migration (`supabase db push`, §Deploy › Database). From then on `start_trip` returns `CONSENT_REQUIRED` for anyone whose consent is older than the new version, and D1 tells a driver still on an old build to update.
4. Check: `select public.current_consent_version();` returns the new version, and `select count(*) filter (where consent_version = public.current_consent_version()), count(*) from public.profiles where role = 'driver' and is_active;` shows drivers re-agreeing.

A driver in the middle of a trip is not interrupted: the launch gate resumes an active trip first, and `end_trip` does not check consent.

## Data incident

A suspected leak, unauthorised access, or lost data. Keep a timestamped log from the first minute: notification deadlines run from when you became aware.

**Who:** incident lead [NAME] · technical [NAME] · client contact [NAME] · counsel [NAME] · grievance officer (privacy policy §9) [NAME].

1. **Contain (first hour).**
   - _Leaked key:_ rotate it (§Key rotation). The secret (service-role) key comes before anything else.
   - _Compromised account:_ `bun run provision-user --phone <number> --deactivate` (with the operator `SUPABASE_URL` and secret key) makes `is_admin()` false at once; then ban the user in Authentication → Users so no new session starts. Access tokens already issued expire within the hour.
   - _Console exposed:_ Vercel → Deployment Protection on Production, or roll back (§Rollback).
   - _RLS hole:_ ship a fixing migration (§Deploy). As a last resort, pause the project: phones keep buffering points, so trips are not lost.
2. **Preserve evidence.** Supabase log retention is short (1 day on Free, 7 on Pro). Export now: API, Auth and Postgres logs for the window, Vercel logs, Sentry events, the GitHub audit log, and `trip_events` / `admin_events` for the accounts involved. Delete nothing.
3. **Assess.** Which data (phone numbers, names, GPS routes), whose, how many people, what time window, and whether it is still happening.
4. **Notify** (counsel decides the wording and whether each applies):
   - **Data Protection Board of India and each affected person:** DPDP Act 2023 s.8(6) and the DPDP Rules: intimation without delay, then a detailed report to the Board within **72 hours**.
   - **CERT-In:** reportable cyber incidents within **6 hours** of noticing (CERT-In Directions of 28 Apr 2022; `incident@cert-in.org.in`).
   - **The client**, immediately; and the processor, if the source is on their side (Supabase, Sentry, the SMS provider, Vercel, Expo, Mappls).
   - **Drivers:** a plain message in their language (en, ta, kn, hi): what happened, what data, what we did, what they can do, and the grievance officer's contact.
5. **Fix.** Root-cause fix with a pgTAP test that fails without it (`supabase/tests/`); rotate anything the attacker could have seen; re-run the Supabase Security Advisor.
6. **Review within 5 working days.** Timeline, root cause, what to change. Update this runbook.

## Erasure

A driver asks for their personal data to be deleted (DPDP, docs/09 §1 "Withdrawal & erasure").

**What is erased:** every GPS point and live position of the driver, the start/end positions and device info on their trips, their name and phone number in `profiles`. The profile is deactivated and stamped with `erased_at`. Trips still `assigned` to them are cancelled, so the loads can be reassigned.

**What is kept (anonymised):** the trip rows with their results (status, verified km, reasons) and `driver_stats`, so fleet history and aggregate km survive. The decision is recorded in docs/PHASE1_TASKS.md (ND-5).

**Steps**

1. **Confirm the request.** It must come from the driver, by the phone number on their profile or in writing. Record a ticket or reference; it goes into the note.
2. **Make sure no trip is still collecting points.** If the driver has a trip `in_progress`, end it with `admin_force_end` (note: "Erasure request"). If a trip is `completed` (waiting for points), wait for it to verify (at most `unsynced_grace_hours`, 6 h). The erasure refuses with `DRIVER_HAS_ACTIVE_TRIP` until then.
3. **Run the erasure** in the Supabase SQL editor as an admin, or from any admin session:
   ```sql
   select public.admin_erase_driver('<driver uuid>', 'Driver request <date>, ticket <ref>');
   ```
   It returns `{ points_deleted, trips_kept, trips_cancelled }`. The same numbers and the note are logged in `admin_events` (`action = 'driver_erased'`).
   > In the SQL editor you run as `postgres`, where `is_admin()` is false. Run it from an admin session, or first `select set_config('request.jwt.claims', json_build_object('sub', '<your admin uuid>', 'role', 'authenticated')::text, true);` in the same transaction.
4. **Block sign-in.** In the Supabase dashboard → Authentication → Users, find the user by id and **ban** them. **Do not delete the auth user**: `profiles` cascades on delete, and the trips that reference the profile would block it or lose their history. The phone number stored in `auth.users` is removed only when the user is deleted; until an Edge Function for this exists, record in the ticket that the auth record is banned, not deleted.
5. **Reply to the driver** with the date and what was kept (anonymised trip results).

**Check afterwards**

```sql
select full_name, phone, is_active, erased_at from public.profiles where id = '<driver uuid>';
select count(*) from public.trip_points p join public.trips t on t.id = p.trip_id where t.driver_id = '<driver uuid>';  -- 0
select * from public.admin_events where target_id = '<driver uuid>' order by created_at desc;
```

