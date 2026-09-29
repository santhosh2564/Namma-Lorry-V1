# Namma Lorry — Operations runbook (Phase 1)

For whoever is on call for the pilot. Setup-time material lives in [docs/release/](release/): [BUILD_AND_DEPLOY.md](release/BUILD_AND_DEPLOY.md) and [SUPABASE_HOSTED.md](release/SUPABASE_HOSTED.md).

**Ground rules**
- **Staging first**, always. Nothing goes to production that hasn't run on staging.
- Every manual database change goes in a **transaction** and writes a `trip_events` row naming the operator and the reason. The SQL editor runs as `postgres` (RLS bypassed, `auth.uid()` is null), so the payload is the only record of who did it.
- **Never tell a driver to uninstall the app or clear its data** until their last trip shows *Verified*, *Under review* or *Not verified*. Unsent GPS points live only in the phone's local queue.
- Phones buffer points offline. A short backend outage **loses no data**, so take the time to do things right.

## 1. Systems and access

| System | Staging | Production | Who has access |
|---|---|---|---|
| Supabase | `namma-lorry-staging` | `namma-lorry-prod` | [names] |
| EAS / Expo | project `namma-lorry`, channel `preview` | channel `production` | [names] |
| Vercel | Preview deployments | Production (`main`) | [names] |
| Sentry | `environment:preview` | `environment:production` | [names] |
| Play Console / App Store Connect | internal testing / TestFlight | store | [names] |
| SMS provider | [provider] | [provider] | [names] |
| Mappls console | dev key | prod key | [names] |

Useful links: Supabase logs (Dashboard → Logs), `cron.job_run_details`, Sentry issues, `npx eas update:list --branch production`.

## 2. Deploy

Order: **database → edge functions → web console → app (OTA or binary)**. Old app versions stay in the field for weeks, so a migration must keep working for the app that's already installed (add columns and RPCs; don't rename or drop until no build uses them).

**Pre-flight (every deploy):** CI green on the commit; `npm run typecheck && npm run lint && npm test`; `supabase test db` locally.

### 2.1 Database migration
```bash
npx supabase link --project-ref <staging-ref>
npx supabase db push --dry-run && npx supabase db push
# smoke-test staging (SUPABASE_HOSTED.md §9), then:
npx supabase link --project-ref <prod-ref>
npx supabase db dump --linked -f backups/prod-$(date +%F).sql   # backups/ is git-ignored
npx supabase db push --dry-run && npx supabase db push
```
Never edit a migration that has been pushed. Fix forward with a new file.

### 2.2 Edge functions (once M6 exists)
```bash
npx supabase functions deploy mappls-proxy --project-ref <ref>
```

### 2.3 Web console
Merge to `main` → Vercel deploys production automatically. PR branches get Preview deployments on the staging backend. After deploy: log in, open C1 Live, and check the browser console for CSP errors.

### 2.4 App: JavaScript-only change (EAS Update)
```bash
npm run update:preview -- "What changed"        # install via the preview build, verify
npm run update:production -- "What changed"
```
Drivers get it on the **next cold start** after download. It can't change native code, permissions or `app.config.ts` native fields.

### 2.5 App: native change (new binary)
1. Bump `version` in `app.config.ts` and `package.json` (runtime version = app version).
2. `npx eas build -p all --profile preview` → submit → test on TestFlight / Play internal.
3. `npx eas build -p all --profile production` → `npx eas submit -p all --profile production --latest`.
4. Android: promote from internal → production with a **staged rollout** (20 % → 100 %). iOS: **phased release**.
5. `git tag v<version>-<buildNumber> && git push --tags`.

## 3. Roll back

| Layer | How | Time |
|---|---|---|
| **OTA update** | `npx eas update:list --branch production` → copy the last good *group id* → `npx eas update:republish --group <group-id>`. Drivers get it on their next cold start | minutes |
| **Web console** | Vercel → Deployments → last good one → **Instant Rollback** | seconds |
| **Android binary** | Play Console → Production → **Halt rollout**. You can't serve a lower versionCode: rebuild the last good commit (EAS gives it a higher code) and release it. If the bug is JS-only, OTA-fix the bad binary instead | hours |
| **iOS binary** | Pause the **phased release**; TestFlight → **Expire** the build. Ship a fixed build (expedited review if it's severe). OTA if JS-only | hours–days |
| **Database** | **Fix forward** with a new migration. Restoring a backup / PITR loses every trip since the snapshot. Last resort, for data corruption only, and only with the client's agreement | — |
| **Edge function** | `git checkout <good-sha> -- supabase/functions/<fn>` → `npx supabase functions deploy <fn>` | minutes |

## 4. Rotate keys

Rotate on a schedule (yearly), when someone with access leaves, and **immediately** if a key is exposed. Public keys (`EXPO_PUBLIC_*`) are in every app bundle, so "rotation" there means **create new → ship → wait for adoption → revoke old**. Revoking first breaks every installed app.

| Key | Lives in | Rotation | Breaks if done wrong |
|---|---|---|---|
| Supabase **publishable** key (`sb_publishable_…`, or legacy anon) | EAS env, Vercel env, every app bundle | Dashboard → API keys → create new → update EAS env (`eas env:update`) + Vercel env → `npm run update:production` + redeploy web → wait until most drivers run the new update (`eas update:list`) → delete old key. **Use the new publishable/secret key system from day one:** rotating the legacy JWT secret invalidates anon, service role and every session at once (all drivers logged out, uploads stall until re-login) | App can't reach the API |
| Supabase **secret / service-role** key | Operator password manager; edge functions (injected) | Create new secret key → update password manager → delete old. Functions get injected keys automatically | Operator scripts |
| Database password | Password manager | Dashboard → Database → Reset password | `supabase link` / `db push` |
| Mappls **map SDK** key | EAS env, Vercel env, bundles; restricted by package / bundle / domain | New key with the same restrictions → env → OTA + web redeploy → revoke old. *If M3 puts the key in native config (iOS `.olf/.conf`), a new binary is needed* | Maps blank |
| Mappls **REST** credentials | Supabase function secrets | `npx supabase secrets set MAPPLS_CLIENT_SECRET=…` → redeploy `mappls-proxy` → revoke old | Address search / distance in the console |
| SMS provider credentials | Supabase Auth → Phone | Create new in the provider → paste into Supabase → send a test OTP to a real number → revoke old | **All logins** |
| Sentry DSN | EAS env, Vercel env, bundles | Sentry → Client Keys → new key → env → OTA + web → disable old | Crash reports only |
| `SENTRY_AUTH_TOKEN` | EAS secret | Revoke in Sentry → new token → `eas env:update --name SENTRY_AUTH_TOKEN --visibility secret` | Source maps only |
| Android upload key / iOS certs / ASC API key | EAS credentials | `npx eas credentials`. Android upload key compromise: Play Console → App signing → **request upload key reset** | Store uploads |
| Play service-account JSON (for `eas submit`) | EAS credentials | GCP IAM → new key → `eas credentials` → delete old key in GCP | `eas submit` |

## 5. A stuck trip

### 5.1 Diagnose (SQL editor)
```sql
select t.id, t.status, t.started_at, t.ended_at, t.expected_points, p.full_name,
       (select count(*) from trip_points where trip_id = t.id)         as points_received,
       (select max(recorded_at) from trip_points where trip_id = t.id) as last_point_at,
       (select max(received_at) from trip_points where trip_id = t.id) as last_upload_at
from trips t join profiles p on p.id = t.driver_id
where t.id = '<trip-id>';
select type, payload, created_at from trip_events where trip_id = '<trip-id>' order by created_at;
```

| Symptom | Likely cause | Action |
|---|---|---|
| `in_progress`, uploads still arriving | Trip genuinely running | Nothing |
| `in_progress`, **no uploads for hours**, driver says they ended | Phone offline; End queued (`ENDED_PENDING_SYNC`) | Ask the driver to open the app on mobile data or Wi-Fi and keep it open 2 min. Don't uninstall |
| `in_progress` forever: phone lost, wiped or broken | End never reached the server (**ND-25**: nothing closes these automatically) | §5.2 |
| Driver gets **"another trip is active"** | Same as above | §5.2 on the old trip |
| `completed` ("Verifying…") | Waiting for the remaining points (`points_received < expected_points`) | Wait: the sweeper verifies it **6 h** after the end regardless (`unsynced_grace_hours`). To force now: `select public.verify_trip('<trip-id>');` |
| Uploads stopped mid-trip, phone online, Sentry shows repeated upload errors | One rejected point failing the whole batch (**ND-8**, unfixed) | Note the trip id in the incident log; after the trip, the sweeper / §5.2 closes it and it goes to review |
| Start fails with "You are X km from the pickup" | Wrong pickup pin, or the pickup yard is large | Fix the pickup location or radius on the load in the console (max 5000 m) |
| Assigned to the wrong driver or vehicle, not started | Admin error | §5.3 |

### 5.2 Force-end an abandoned trip
Closes the trip at the last point received and **always** sends it to human review (setting `expected_points` one above what arrived guarantees a `MISSING_POINTS` flag). Stats are only added if an admin later approves it in C7 with a note.
```sql
begin;
with last as (
  select lat, lng, accuracy_m, recorded_at from trip_points
  where trip_id = '<trip-id>' order by seq desc limit 1)
update trips t set
  status          = 'completed',
  ended_at        = coalesce((select recorded_at from last), t.started_at),
  end_lat         = (select lat from last),
  end_lng         = (select lng from last),
  end_accuracy_m  = (select accuracy_m from last),
  expected_points = (select count(*) from trip_points where trip_id = t.id) + 1
where t.id = '<trip-id>' and t.status = 'in_progress';          -- expect UPDATE 1
insert into trip_events(trip_id, type, actor_id, payload)
values ('<trip-id>', 'admin_force_end', null,
        jsonb_build_object('operator', '<your name>', 'reason', '<why>', 'ticket', '<ref>'));
delete from trip_live where trip_id = '<trip-id>';
select public.verify_trip('<trip-id>');                          -- expect needs_review
commit;
```
Then review it in the console (C7) with a note. Tested on the local stack on 29 Sep 2026: result `needs_review` with `{END_OUTSIDE_DROP, LOW_COVERAGE, MISSING_POINTS, DISTANCE_TOO_SHORT}`.

### 5.3 Cancel a trip that hasn't started
There's no `cancel_trip` RPC yet (ND-13), so:
```sql
begin;
update trips set status = 'cancelled' where id = '<trip-id>' and status = 'assigned';   -- expect UPDATE 1
insert into trip_events(trip_id, type, actor_id, payload)
values ('<trip-id>', 'admin_cancelled', null, jsonb_build_object('operator', '<your name>', 'reason', '<why>'));
commit;
```
Then assign the load again from the console.

## 6. Re-run verification

`verify_trip` only acts on trips in `completed`. It is safe for anything **not yet counted in stats** (`completed`, or `needs_review` without a human decision). **Never** put a `verified` trip back to `completed`: re-verifying adds its km to `driver_stats` a second time.

### 6.1 One trip (e.g. late points arrived after it was flagged)
```sql
begin;
update trips set status = 'completed'
where id = '<trip-id>' and status = 'needs_review' and reviewed_by is null;            -- expect UPDATE 1
insert into trip_events(trip_id, type, actor_id, payload)
values ('<trip-id>', 'reverify', null, jsonb_build_object('operator', '<your name>', 'reason', '<why>'));
select public.verify_trip('<trip-id>');
commit;
```

### 6.2 All undecided trips (after the client signs off new `app_settings` thresholds)
```sql
begin;
do $$
declare r record; v public.trip_status;
begin
  for r in select id from public.trips where status = 'needs_review' and reviewed_by is null loop
    update public.trips set status = 'completed' where id = r.id;
    insert into public.trip_events(trip_id, type, actor_id, payload)
    values (r.id, 'reverify', null, jsonb_build_object('operator', '<your name>', 'reason', 'app_settings change <date>'));
    v := public.verify_trip(r.id);
    raise notice '% -> %', r.id, v;
  end loop;
end $$;
commit;
```

### 6.3 Revoke a wrongly verified trip
Mark it rejected, then **recompute** the driver's stats from the trips table (don't subtract by hand):
```sql
begin;
update trips set status = 'rejected', verified_at = null, review_note = '<why>'
where id = '<trip-id>' and status = 'verified';                                         -- expect UPDATE 1
insert into trip_events(trip_id, type, actor_id, payload)
values ('<trip-id>', 'admin_revoked', null, jsonb_build_object('operator', '<your name>', 'reason', '<why>'));
insert into driver_stats(driver_id, verified_trips, verified_distance_m, first_verified_at, last_verified_at, updated_at)
select '<driver-id>', count(*), coalesce(sum(tracked_distance_m), 0), min(ended_at), max(ended_at), now()
from trips where driver_id = '<driver-id>' and status = 'verified'
on conflict (driver_id) do update set
  verified_trips = excluded.verified_trips, verified_distance_m = excluded.verified_distance_m,
  first_verified_at = excluded.first_verified_at, last_verified_at = excluded.last_verified_at,
  updated_at = now();
commit;
```

### 6.4 Consistency check (run weekly; expect 0 rows)
```sql
select d.id as driver_id, coalesce(s.verified_trips,0) as stats_trips, coalesce(x.n,0) as actual_trips,
       coalesce(s.verified_distance_m,0) as stats_m, coalesce(x.m,0) as actual_m
from profiles d
left join driver_stats s on s.driver_id = d.id
left join (select driver_id, count(*) n, sum(coalesce(tracked_distance_m,0)) m
           from trips where status = 'verified' group by driver_id) x on x.driver_id = d.id
where coalesce(s.verified_trips,0) <> coalesce(x.n,0)
   or coalesce(s.verified_distance_m,0) <> coalesce(x.m,0);
```
Also weekly: `select status, count(*) from cron.job_run_details where start_time > now() - interval '7 days' group by 1;` (all `succeeded`).

All SQL in §5–§6 was tested inside a rolled-back transaction on the local stack.

## 7. Data incident (suspected leak, unauthorised access, lost data)

**Roles:** Incident lead [name] · Technical [name] · Client contact [name] · Counsel [name]. Keep a timestamped log from the first minute; the notification deadlines run from when you became aware.

**1. Contain (first hour)**
- *Leaked key:* rotate it now (§4). For the secret/service-role key, that comes before anything else.
- *Compromised account:*
  ```sql
  begin;
  update profiles set is_active = false where id = '<user-id>';   -- is_admin() is false immediately
  delete from auth.sessions where user_id = '<user-id>';           -- revokes refresh tokens
  commit;
  ```
  Also ban the user for good measure (`auth.admin.updateUserById(id, { ban_duration: '876000h' })`). Access tokens already issued expire within 1 h.
- *Console exposed:* Vercel → turn on Deployment Protection for Production, or roll back (§3).
- *RLS hole:* ship a fixing migration (§2.1). As a last resort, pause the API: phones keep buffering points, so trips aren't lost.

**2. Preserve evidence, fast.** Supabase log retention is short (Free 1 day, Pro 7 days). Export now: API, Auth and Postgres logs for the window; Vercel logs; Sentry events; the GitHub audit log; `trip_events` for affected trips. Don't delete anything.

**3. Assess.** What data (phones, names, GPS routes?), whose, how many people, what time window, and is it still happening?

**4. Notify** (counsel decides the final wording and whether each applies):
- **Data Protection Board of India and every affected person:** DPDP Act 2023 s.8(6) and the DPDP Rules. Intimation without delay; the Rules expect a detailed report to the Board within **72 hours**.
- **CERT-In:** reportable cyber incidents (e.g. data breach, unauthorised access) within **6 hours** of noticing, under the CERT-In Directions of 28 Apr 2022 (`incident@cert-in.org.in`).
- **The client**, immediately, and processors if the source is on their side (Supabase, Sentry, SMS provider, Vercel, Expo).
- Drivers: a plain-language SMS/WhatsApp in their language (ta / kn / hi / en): what happened, what data, what we did, what they can do, grievance officer contact.

**5. Fix and recover.** Root-cause fix, add a pgTAP test that fails without it, rotate anything the attacker could have seen, re-check the Supabase Security Advisor.

**6. Review within 5 working days.** Timeline, root cause, what worked, what to change. Update this runbook.

## 8. Re-run the acceptance checks after a risky change
```bash
npm run test:db     # pgTAP (RLS, RPCs, acceptance scenarios) + concurrent start race, on the local stack
npm run test:e2e    # Playwright console flows (needs `supabase start`)
```
On staging: the smoke test in [SUPABASE_HOSTED.md §9](release/SUPABASE_HOSTED.md#9-smoke-test-on-staging-before-any-production-step) and one real short trip with a preview build.
