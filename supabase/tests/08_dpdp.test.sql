-- =====================================================================
-- Namma Lorry — 08: DPDP controls (docs/09 §1) — validation report B3
--   A. Consent gate: start_trip raises CONSENT_REQUIRED without a recorded consent (B3d)
--   B. Retention (ND-5): downsample_old_points keeps ≤ 500 points of a final trip
--      once it is older than app_settings.raw_point_retention_days; nightly pg_cron job
--   C. Erasure: admin_erase_driver
--        FORBIDDEN · NOTE_REQUIRED · DRIVER_NOT_FOUND · DRIVER_HAS_ACTIVE_TRIP
-- =====================================================================
begin;

\ir _helpers.psql

select plan(42);

-- ---- fixtures (runner starts as postgres, so RLS is bypassed) ----------
select tests.create_user('a8000000-0000-4000-8000-000000000001', '919000000981', 'admin',  'Ops Admin');
select tests.create_user('d8000000-0000-4000-8000-000000000001', '919000000982', 'driver', 'Driver A');
select tests.create_user('d8000000-0000-4000-8000-000000000002', '919000000983', 'driver', 'Driver B');
select tests.create_user('d8000000-0000-4000-8000-000000000003', '919000000984', 'driver', 'Driver C');
select tests.create_user('d8000000-0000-4000-8000-000000000004', '919000000985', 'driver', 'Driver D');
update public.profiles set consent_version = public.current_consent_version(), consent_at = now()
 where id in ('d8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000003',
              'd8000000-0000-4000-8000-000000000004');
select tests.create_vehicle('TN 08 AA 0001') as vehicle \gset

-- A final trip `p_age` ago with p_points points, recorded at the given status.
-- The track wiggles (a sine across the line) so simplification has real work.
create function tests.final_trip(p_driver uuid, p_vehicle uuid, p_status public.trip_status,
                                 p_age interval, p_points int)
returns uuid language plpgsql as $$
declare v_load uuid; v_trip uuid; l public.loads; v_end timestamptz := now() - p_age;
begin
  v_load := tests.create_load();
  select * into l from public.loads where id = v_load;
  insert into public.trips(load_id, driver_id, vehicle_id, status, started_at, ended_at,
                           start_lat, start_lng, start_accuracy_m, end_lat, end_lng, end_accuracy_m,
                           expected_points, tracked_distance_m, verification_reasons, device_info)
  values (v_load, p_driver, p_vehicle, p_status, v_end - interval '2 hours', v_end,
          l.pickup_lat, l.pickup_lng, 10, l.drop_lat, l.drop_lng, 10,
          p_points, 88000, case when p_status = 'needs_review' then '{TRACKING_GAP}'::text[] else '{}' end,
          '{"model":"Test phone"}')
  returning id into v_trip;
  insert into public.trip_points(trip_id, seq, recorded_at, lat, lng, accuracy_m)
  select v_trip, g, v_end - interval '2 hours' + g * (interval '2 hours' / p_points),
         l.pickup_lat + (l.drop_lat - l.pickup_lat) * g / p_points::double precision
           + 0.01 * sin(g * 40 * pi() / p_points),
         l.pickup_lng + (l.drop_lng - l.pickup_lng) * g / p_points::double precision,
         10
  from generate_series(1, p_points) g;
  return v_trip;
end $$;

-- =====================================================================
-- A. Consent gate
-- =====================================================================
select tests.create_load() as load_a \gset
select tests.create_load() as load_b \gset
insert into public.trips(id, load_id, driver_id, vehicle_id) values
  ('f8000000-0000-4000-8000-000000000001', :'load_a', 'd8000000-0000-4000-8000-000000000001', :'vehicle'),
  ('f8000000-0000-4000-8000-000000000002', :'load_b', 'd8000000-0000-4000-8000-000000000002', :'vehicle');

select tests.as_user('d8000000-0000-4000-8000-000000000002');
select throws_ok($$select public.start_trip('f8000000-0000-4000-8000-000000000002', 12.9563, 79.9422, 10)$$,
  'P0001', 'CONSENT_REQUIRED', 'start_trip: a driver with no recorded consent gets CONSENT_REQUIRED');
set local role postgres;
select is((select status::text from public.trips where id = 'f8000000-0000-4000-8000-000000000002'), 'assigned',
  'start_trip: the trip stays assigned without consent');
select is((select count(*)::int from public.trip_events where trip_id = 'f8000000-0000-4000-8000-000000000002'), 0,
  'start_trip: no started event without consent');

select tests.as_user('d8000000-0000-4000-8000-000000000001');
select lives_ok($$select public.start_trip('f8000000-0000-4000-8000-000000000001', 12.9563, 79.9422, 10)$$,
  'start_trip: a driver with a recorded consent starts normally');
set local role postgres;
select is((select status::text from public.trips where id = 'f8000000-0000-4000-8000-000000000001'), 'in_progress',
  'start_trip: the consented trip is in_progress');

-- =====================================================================
-- B. Retention: downsample_old_points
-- =====================================================================
select is((select value from public.app_settings where key = 'raw_point_retention_days'), 365::numeric,
  'retention: raw_point_retention_days is seeded with 365 (ND-5, pending client sign-off)');
select is((select count(*)::int from cron.job where jobname = 'downsample-old-points'), 1,
  'retention: the nightly downsample-old-points cron job is scheduled');

select tests.final_trip('d8000000-0000-4000-8000-000000000004', :'vehicle', 'verified',     interval '400 days', 2000) as old_big \gset
select tests.final_trip('d8000000-0000-4000-8000-000000000004', :'vehicle', 'rejected',     interval '400 days', 800)  as old_rejected \gset
select tests.final_trip('d8000000-0000-4000-8000-000000000004', :'vehicle', 'verified',     interval '400 days', 100)  as old_small \gset
select tests.final_trip('d8000000-0000-4000-8000-000000000004', :'vehicle', 'verified',     interval '10 days',  600)  as recent \gset
select tests.final_trip('d8000000-0000-4000-8000-000000000004', :'vehicle', 'needs_review', interval '400 days', 600)  as old_review \gset

select tests.as_user('a8000000-0000-4000-8000-000000000001');
select throws_ok($$select public.downsample_old_points()$$,
  '42501', 'permission denied for function downsample_old_points', 'retention: an admin client cannot call the job function');
set local role postgres;

select lives_ok($$select public.downsample_old_points()$$, 'retention: the job runs');

select ok((select count(*) from public.trip_points where trip_id = :'old_big') between 2 and 500,
  'retention: an old verified trip keeps at most 500 points');
select ok((select count(*) from public.trip_points where trip_id = :'old_big') > 2,
  'retention: ...and keeps the shape, not just the two ends');
select is((select array[min(seq), max(seq)] from public.trip_points where trip_id = :'old_big'), array[1, 2000],
  'retention: ...including the first and the last point');
select ok((select count(*) from public.trip_points where trip_id = :'old_rejected') <= 500,
  'retention: an old rejected trip is downsampled too');
select is((select count(*)::int from public.trip_points where trip_id = :'old_small'), 100,
  'retention: a trip already under 500 points keeps all of them');
select ok((select points_downsampled_at is not null from public.trips where id = :'old_small'),
  'retention: ...and is marked done so it is not re-read nightly');
select is((select count(*)::int from public.trip_points where trip_id = :'recent'), 600,
  'retention: a trip inside the retention window is untouched');
select is((select count(*)::int from public.trip_points where trip_id = :'old_review'), 600,
  'retention: a trip still in needs_review is untouched (not final)');
select is((select tracked_distance_m from public.trips where id = :'old_big'), 88000,
  'retention: the trip result (tracked distance) survives');
select ok((select points_downsampled_at is not null from public.trips where id = :'old_big'),
  'retention: the downsampled trip records when it was downsampled');

select count(*) as kept from public.trip_points where trip_id = :'old_big' \gset
select public.downsample_old_points() as ignored \gset
select is((select count(*) from public.trip_points where trip_id = :'old_big'), :'kept'::bigint,
  'retention: a second run changes nothing');

-- =====================================================================
-- C. Erasure: admin_erase_driver (driver C)
-- =====================================================================
select tests.final_trip('d8000000-0000-4000-8000-000000000003', :'vehicle', 'verified', interval '5 days', 120) as c_done \gset
select tests.create_load() as load_c \gset
insert into public.trips(id, load_id, driver_id, vehicle_id) values
  ('f8000000-0000-4000-8000-000000000003', :'load_c', 'd8000000-0000-4000-8000-000000000003', :'vehicle');
insert into public.driver_stats(driver_id, verified_trips, verified_distance_m)
  values ('d8000000-0000-4000-8000-000000000003', 1, 88000);
-- driver A is still in_progress from section A; give that trip some points
select tests.insert_track('f8000000-0000-4000-8000-000000000001', now() - interval '5 minutes',
                          interval '10 seconds', 20);
select count(*) as a_points from public.trip_points t join public.trips r on r.id = t.trip_id
 where r.driver_id = 'd8000000-0000-4000-8000-000000000001' \gset

select tests.as_user('d8000000-0000-4000-8000-000000000003');
select throws_ok($$select public.admin_erase_driver('d8000000-0000-4000-8000-000000000003', 'erase me')$$,
  '42501', 'FORBIDDEN', 'erasure: a driver gets FORBIDDEN');

set local role postgres;
select tests.as_user('a8000000-0000-4000-8000-000000000001');
select throws_ok($$select public.admin_erase_driver('d8000000-0000-4000-8000-000000000003', ' ')$$,
  'P0001', 'NOTE_REQUIRED', 'erasure: a blank note gets NOTE_REQUIRED');
select throws_ok($$select public.admin_erase_driver('d8000000-0000-4000-8000-0000000000ff', 'nobody')$$,
  'P0002', 'DRIVER_NOT_FOUND', 'erasure: an unknown id gets DRIVER_NOT_FOUND');
select throws_ok($$select public.admin_erase_driver('a8000000-0000-4000-8000-000000000001', 'not a driver')$$,
  'P0002', 'DRIVER_NOT_FOUND', 'erasure: a non-driver profile gets DRIVER_NOT_FOUND');
select throws_ok($$select public.admin_erase_driver('d8000000-0000-4000-8000-000000000001', 'driving now')$$,
  'P0001', 'DRIVER_HAS_ACTIVE_TRIP', 'erasure: a driver with an in_progress trip gets DRIVER_HAS_ACTIVE_TRIP');
select lives_ok($$select public.admin_erase_driver('d8000000-0000-4000-8000-000000000003', 'Driver request 29 Sep, ticket 12')$$,
  'erasure: admin erases driver C');

set local role postgres;
select is((select count(*)::int from public.trip_points t join public.trips r on r.id = t.trip_id
            where r.driver_id = 'd8000000-0000-4000-8000-000000000003'), 0,
  'erasure: every GPS point of the driver is deleted');
select is((select count(*)::int from public.trip_live where driver_id = 'd8000000-0000-4000-8000-000000000003'), 0,
  'erasure: no live position remains');
select is((select full_name from public.profiles where id = 'd8000000-0000-4000-8000-000000000003'), '',
  'erasure: the name is blanked');
select is((select phone from public.profiles where id = 'd8000000-0000-4000-8000-000000000003'), null::text,
  'erasure: the phone number is removed');
select is((select is_active from public.profiles where id = 'd8000000-0000-4000-8000-000000000003'), false,
  'erasure: the profile is deactivated');
select ok((select erased_at is not null from public.profiles where id = 'd8000000-0000-4000-8000-000000000003'),
  'erasure: the profile records when it was erased');
select is((select status::text || ':' || tracked_distance_m from public.trips where id = :'c_done'), 'verified:88000',
  'erasure: the anonymised trip result is kept');
select is((select num_nulls(start_lat, start_lng, end_lat, end_lng, device_info)
             from public.trips where id = :'c_done'), 5,
  'erasure: start/end positions and device info are removed from the kept trip');
select is((select status::text from public.trips where id = 'f8000000-0000-4000-8000-000000000003'), 'cancelled',
  'erasure: an assigned trip is cancelled so the load can be reassigned');
select is((select verified_trips || ':' || verified_distance_m from public.driver_stats
            where driver_id = 'd8000000-0000-4000-8000-000000000003'), '1:88000',
  'erasure: aggregate driver_stats are kept');
select is((select count(*)::int from public.admin_events
            where action = 'driver_erased' and target_id = 'd8000000-0000-4000-8000-000000000003'
              and actor_id = 'a8000000-0000-4000-8000-000000000001'
              and payload ->> 'note' = 'Driver request 29 Sep, ticket 12'), 1,
  'erasure: an admin event records the admin and the note');
select is((select count(*) from public.trip_points t join public.trips r on r.id = t.trip_id
            where r.driver_id = 'd8000000-0000-4000-8000-000000000001'), :'a_points'::bigint,
  'erasure: other drivers'' points are untouched');

-- admin_events: admins read, nobody writes directly
select tests.as_user('a8000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.admin_events where target_id = 'd8000000-0000-4000-8000-000000000003'), 1,
  'admin_events: an admin reads the erasure record');
select throws_ok($$insert into public.admin_events(action, target_id) values ('forged', 'd8000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'admin_events: an admin cannot insert a record directly');
set local role postgres;
select tests.as_user('d8000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.admin_events), 0, 'admin_events: a driver reads nothing');

set local role postgres;
select tests.as_anon();
select throws_ok($$select public.admin_erase_driver('d8000000-0000-4000-8000-000000000003', 'anon')$$,
  '42501', 'permission denied for function admin_erase_driver', 'erasure: anon cannot call admin_erase_driver');

select * from finish();
rollback;
