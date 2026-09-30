-- =====================================================================
-- Namma Lorry — 04: triggers, sweeper, review, consent
--
-- Everything here happens *without* the client asking. Suites 01-03 cover
-- policies, RPC errors and the reason codes; this file covers the parts of
-- the backend that fire on their own:
--
--   A. the trip_points AFTER INSERT trigger  — a late batch of GPS points
--      that finally reaches expected_points starts verification (docs/10 §4)
--   B. the pg_cron sweeper                    — trips whose remaining points
--      never arrive get verified after a 6 h grace period (scenario 8)
--   C. admin review                           — crediting driver_stats exactly
--      once, whichever path got the trip there (scenario 12)
--   D. record_consent (0002)                  — the only non-admin write to
--      profiles, and only on your own row (docs/09 §1)
--
-- Assertions stay at statement level: pgTAP assertions called from inside a
-- plpgsql function never emit their TAP lines.
-- =====================================================================
begin;

\ir _helpers.psql

select plan(36);

-- ---- fixtures --------------------------------------------------------
select tests.create_user('d4000000-0000-4000-8000-000000000001', '919000000931', 'driver', 'Sweeper driver');
select tests.create_user('d4000000-0000-4000-8000-000000000002', '919000000932', 'driver', 'Reviewed driver');
select tests.create_user('d4000000-0000-4000-8000-000000000003', '919000000933', 'driver', 'Consent driver');
select tests.create_user('d4000000-0000-4000-8000-000000000004', '919000000934', 'driver', 'Clean sweep driver');
select tests.create_user('d4000000-0000-4000-8000-000000000009', '919000000939', 'admin', 'Ops');
insert into public.vehicles(id, registration_no, vehicle_type) values
  ('c4000000-0000-4000-8000-000000000001', 'TN 03 AA 0001', '19ft');

-- A 2 h trip whose phone recorded p_total points, of which only the first
-- p_uploaded reached the server before the driver hit End.
create function tests.late_trip(p_driver uuid, p_total int, p_uploaded int)
returns uuid language plpgsql as $$
declare v_load uuid; v_trip uuid; l public.loads;
begin
  v_load := tests.create_load();
  select * into l from public.loads where id = v_load;
  v_trip := tests.create_trip(v_load, p_driver, 'c4000000-0000-4000-8000-000000000001');
  update public.trips set status = 'in_progress', started_at = now() - interval '2 hours',
         start_lat = l.pickup_lat, start_lng = l.pickup_lng, start_accuracy_m = 10
   where id = v_trip;
  perform tests.insert_track(v_trip, now() - interval '2 hours',
                             interval '2 hours' / p_total, p_total, 1, p_uploaded);
  update public.trips set status = 'completed', ended_at = now(),
         end_lat = l.drop_lat, end_lng = l.drop_lng, end_accuracy_m = 10,
         expected_points = p_total
   where id = v_trip;
  delete from public.trip_live where trip_id = v_trip;
  return v_trip;
end $$;

-- Upload the rest of a late_trip's points — this is the batch that trips
-- the AFTER INSERT trigger.
create function tests.upload_rest(p_trip uuid, p_total int, p_from int, p_to int)
returns void language sql as $$
  select tests.insert_track(p_trip, now() - interval '2 hours',
                            interval '2 hours' / p_total, p_total, p_from, p_to)
$$;

-- Push a whole finished trip into the past, points included. Backdating
-- ended_at on its own would leave every point outside [started_at, ended_at],
-- which verify_trip would read as a trip with no track at all.
create function tests.age_trip(p_trip uuid, p_age interval) returns void language plpgsql as $$
begin
  update public.trips     set started_at = started_at - p_age, ended_at = ended_at - p_age
   where id = p_trip;
  update public.trip_points set recorded_at = recorded_at - p_age where trip_id = p_trip;
end $$;

-- A trip that verify_trip holds for review: the recorded start is 90 km from
-- the pickup, everything else about the track is clean.
create function tests.review_trip(p_driver uuid) returns uuid language plpgsql as $$
declare v uuid;
begin
  v := tests.completed_trip(p_driver, 'c4000000-0000-4000-8000-000000000001');
  update public.trips set start_lat = 12.9000 where id = v;
  perform public.verify_trip(v);
  return v;
end $$;

-- =====================================================================
-- A. A late point upload triggers verification (docs/10 §4)
-- =====================================================================
select tests.late_trip('d4000000-0000-4000-8000-000000000001', 300, 240) as trip \gset
select is((select status::text from public.trips where id = :'trip'::uuid), 'completed',
  'a trip whose points are still uploading stays completed');
select is((select verified_at::text from public.trips where id = :'trip'::uuid), null::text,
  '...and is not stamped verified_at');

select tests.upload_rest(:'trip'::uuid, 300, 241, 270);
select is((select status::text from public.trips where id = :'trip'::uuid), 'completed',
  'a partial late batch does not start verification');

-- This batch takes the trip to 300 of 300 points. Nothing else calls
-- verify_trip in this test: the status change below is the trigger's doing.
select tests.upload_rest(:'trip'::uuid, 300, 271, 300);
select is((select status::text from public.trips where id = :'trip'::uuid), 'verified',
  'the batch that reaches expected_points triggers verification');
select ok((select tracked_distance_m > 0 from public.trips where id = :'trip'::uuid),
  '...and records the official tracked distance');
select ok((select verified_at is not null from public.trips where id = :'trip'::uuid),
  '...and stamps verified_at');
select ok((select exists (select 1 from public.trip_events
    where trip_id = :'trip'::uuid and type = 'verified')),
  '...and writes a verified trip_event');

-- =====================================================================
-- B. The sweeper (docs/10 §4 scenario 8)
-- =====================================================================
select ok((select exists (select 1 from cron.job where jobname = 'sweep-unverified-trips')),
  'the sweeper is registered as a pg_cron job');

-- A phone recorded 300 points but only 240 reached the server. Past the 6 h
-- grace period nothing else is coming, so the sweeper verifies what it has.
select tests.completed_trip('d4000000-0000-4000-8000-000000000001',
                            'c4000000-0000-4000-8000-000000000001') as trip \gset
update public.trips set expected_points = 300 where id = :'trip'::uuid;
select tests.age_trip(:'trip'::uuid, interval '7 hours');
select public.sweep_unverified_trips();
select is((select status::text from public.trips where id = :'trip'::uuid), 'needs_review',
  'the sweeper verifies a trip left with points missing past the grace period');
select is((select array_to_string(verification_reasons, ',') from public.trips where id = :'trip'::uuid),
  'MISSING_POINTS', '...and it fails for MISSING_POINTS, not for anything else');

-- The same trip shape, but it ended an hour ago. As far as the sweeper is
-- concerned the remaining points are still in flight, so it must not touch it.
select tests.completed_trip('d4000000-0000-4000-8000-000000000001',
                            'c4000000-0000-4000-8000-000000000001') as trip \gset
update public.trips set expected_points = 300 where id = :'trip'::uuid;
select public.sweep_unverified_trips();
select is((select status::text from public.trips where id = :'trip'::uuid), 'completed',
  'a trip inside the 6 h grace period is left alone');

-- An old, complete, clean trip belonging to a driver with no history: the
-- sweeper is the only thing in the system that ever verifies it.
select tests.completed_trip('d4000000-0000-4000-8000-000000000004',
                            'c4000000-0000-4000-8000-000000000001') as trip \gset
select tests.age_trip(:'trip'::uuid, interval '7 hours');
select is((select count(*)::int from public.driver_stats
            where driver_id = 'd4000000-0000-4000-8000-000000000004'), 0,
  'the old clean trip has credited nothing yet');
select public.sweep_unverified_trips();
select is((select status::text from public.trips where id = :'trip'::uuid), 'verified',
  'the sweeper verifies an old clean trip');
select is((select verified_trips from public.driver_stats
            where driver_id = 'd4000000-0000-4000-8000-000000000004'), 1,
  '...and credits that driver with exactly one verified trip');

-- The cron job fires every 15 minutes for the life of the database, and the
-- same trip stays in the table forever. A second pass must not pay out again.
select public.sweep_unverified_trips();
select is((select verified_trips from public.driver_stats
            where driver_id = 'd4000000-0000-4000-8000-000000000004'), 1,
  'sweeping the same trips again does not credit them again');

select tests.review_trip('d4000000-0000-4000-8000-000000000001') as trip \gset
select tests.age_trip(:'trip'::uuid, interval '7 hours');
select public.sweep_unverified_trips();
select is((select status::text from public.trips where id = :'trip'::uuid), 'needs_review',
  'a trip already awaiting review is not swept again');

-- =====================================================================
-- C. Admin review credits driver_stats exactly once (docs/10 §4 scenario 12)
-- =====================================================================
select tests.review_trip('d4000000-0000-4000-8000-000000000002') as trip \gset
select is((select count(*)::int from public.driver_stats
            where driver_id = 'd4000000-0000-4000-8000-000000000002'), 0,
  'a trip waiting for review has not credited any stats');

select tests.as_user('d4000000-0000-4000-8000-000000000009');
select public.admin_review_trip(:'trip'::uuid, true,
  'Pickup GPS looks wrong, approved') as ignored \gset
set local role postgres;
select is((select status::text from public.trips where id = :'trip'::uuid), 'verified',
  'an admin approval marks the trip verified');
select is((select reviewed_by from public.trips where id = :'trip'::uuid),
  'd4000000-0000-4000-8000-000000000009'::uuid,
  '...and records the admin who decided it');
select is((select verified_trips from public.driver_stats
            where driver_id = 'd4000000-0000-4000-8000-000000000002'), 1,
  '...and credits exactly one verified trip');
select is((select verified_distance_m from public.driver_stats
            where driver_id = 'd4000000-0000-4000-8000-000000000002')::bigint,
  (select tracked_distance_m from public.trips where id = :'trip'::uuid)::bigint,
  '...crediting exactly the official distance the trip recorded');
select is((select last_verified_at from public.driver_stats
            where driver_id = 'd4000000-0000-4000-8000-000000000002'),
  (select ended_at from public.trips where id = :'trip'::uuid),
  '...and stamping last_verified_at from the end of the trip');

-- The review queue can offer the same trip twice if a client retries. The
-- second call must be refused and must not pay out a second time. The
-- statement is built with format() because psql does not substitute :vars
-- inside a dollar-quoted literal.
select tests.as_user('d4000000-0000-4000-8000-000000000009');
select throws_ok(
  format($$select public.admin_review_trip(%L::uuid, true, 'again')$$, :'trip'::uuid),
  'P0001', 'TRIP_NOT_IN_REVIEW',
  'a second review of the same trip is refused');
set local role postgres;
select is((select verified_trips from public.driver_stats
            where driver_id = 'd4000000-0000-4000-8000-000000000002'), 1,
  '...and the refused second review credits nothing');

-- A trip verify_trip already verified is no longer reviewable, so the
-- automatic path and the manual path can never both pay out for one trip.
select tests.completed_trip('d4000000-0000-4000-8000-000000000002',
                            'c4000000-0000-4000-8000-000000000001') as verified_trip \gset
select public.verify_trip(:'verified_trip'::uuid);
select tests.as_user('d4000000-0000-4000-8000-000000000009');
select throws_ok(
  format($$select public.admin_review_trip(%L::uuid, true, 'double count?')$$,
         :'verified_trip'::uuid),
  'P0001', 'TRIP_NOT_IN_REVIEW',
  'an already verified trip cannot be approved a second time');
set local role postgres;
select is((select verified_trips from public.driver_stats
            where driver_id = 'd4000000-0000-4000-8000-000000000002'), 2,
  '...so driver_stats counts the two genuinely verified trips and nothing more');

-- A rejected trip must not pay out.
select tests.review_trip('d4000000-0000-4000-8000-000000000002') as rejected_trip \gset
select tests.as_user('d4000000-0000-4000-8000-000000000009');
select public.admin_review_trip(:'rejected_trip'::uuid, false,
  'Track does not match the route') as ignored \gset
set local role postgres;
select is((select status::text from public.trips where id = :'rejected_trip'::uuid), 'rejected',
  'an admin can reject a trip held for review');
select is((select verified_trips from public.driver_stats
            where driver_id = 'd4000000-0000-4000-8000-000000000002'), 2,
  '...and a rejection credits no experience at all');

-- =====================================================================
-- D. record_consent (0002, docs/09 §1)
-- =====================================================================
select tests.as_user('d4000000-0000-4000-8000-000000000003');
select public.record_consent(public.current_consent_version()) as ignored \gset
set local role postgres;
select is((select consent_version from public.profiles
            where id = 'd4000000-0000-4000-8000-000000000003'), public.current_consent_version(),
  'record_consent stores the version the driver agreed to');
select ok((select consent_at is not null from public.profiles
            where id = 'd4000000-0000-4000-8000-000000000003'),
  '...and the time they agreed to it');
select is((select consent_version from public.profiles
            where id = 'd4000000-0000-4000-8000-000000000001'), null::text,
  '...and writes nobody else''s row');

select tests.as_user('d4000000-0000-4000-8000-000000000003');
select throws_ok($$select public.record_consent('  ')$$, 'P0001', 'VERSION_REQUIRED',
  'record_consent refuses a blank version');
select throws_ok($$select public.record_consent(null)$$, 'P0001', 'VERSION_REQUIRED',
  'record_consent refuses a missing version');
select throws_ok($$select public.record_consent('2025-01-01')$$, 'P0001', 'VERSION_NOT_CURRENT',
  'record_consent refuses a version that is not the current one (0009)');
set local role postgres;

select tests.as_anon();
select throws_ok($$select public.record_consent(public.current_consent_version())$$,
  '42501', 'permission denied for function record_consent',
  'an anonymous client cannot record consent');
set local role postgres;

-- Re-consenting after the notice text changes must overwrite, not stack.
select tests.as_user('d4000000-0000-4000-8000-000000000003');
select public.record_consent(' ' || public.current_consent_version() || ' ') as ignored \gset
set local role postgres;
select is((select consent_version from public.profiles
            where id = 'd4000000-0000-4000-8000-000000000003'), public.current_consent_version(),
  'recording consent again replaces the previous version, trimmed');

select * from finish();
rollback;
