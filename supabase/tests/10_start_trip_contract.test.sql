-- =====================================================================
-- Namma Lorry — 10: start_trip contract (validation M5)
-- 0008 redefines start_trip for the concurrent-start race and 0009 makes it
-- require the CURRENT consent version. Every check the function had before must
-- survive, so each one is pinned here, with the grants, in one place:
--   TRIP_NOT_FOUND · CONSENT_REQUIRED (0006, stale or absent; 0009)
--   FORBIDDEN for inactive (0007)
--   TRIP_NOT_STARTABLE · ANOTHER_TRIP_ACTIVE · GPS_ACCURACY_TOO_LOW · OUTSIDE_PICKUP
-- The race itself needs two sessions: test/db/start-trip-race.sh (CI database job).
-- =====================================================================
begin;

\ir _helpers.psql

select plan(23);

-- ---- fixtures --------------------------------------------------------
select tests.create_user('da000000-0000-4000-8000-000000000001', '919000001001', 'driver', 'Driver A');
select tests.create_user('da000000-0000-4000-8000-000000000002', '919000001002', 'driver', 'Driver B');
select tests.create_user('da000000-0000-4000-8000-000000000003', '919000001003', 'driver', 'No Consent');
select tests.create_user('da000000-0000-4000-8000-000000000004', '919000001004', 'driver', 'Inactive');
select tests.create_user('da000000-0000-4000-8000-000000000005', '919000001005', 'driver', 'Stale Consent');
update public.profiles set consent_version = public.current_consent_version(), consent_at = now()
 where id in ('da000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000002',
              'da000000-0000-4000-8000-000000000004');
-- An agreement to an older policy counts as none until they re-consent (0009).
update public.profiles set consent_version = '2025-01-01', consent_at = now()
 where id = 'da000000-0000-4000-8000-000000000005';
update public.profiles set is_active = false where id = 'da000000-0000-4000-8000-000000000004';

insert into public.vehicles(id, registration_no, vehicle_type) values
  ('ca000000-0000-4000-8000-000000000001', 'TN 10 AA 0001', '19ft');

insert into public.loads(id, pickup_address, pickup_lat, pickup_lng, drop_address, drop_lat, drop_lng,
                         pickup_radius_m, drop_radius_m, planned_distance_m)
select ('ba000000-0000-4000-8000-00000000000' || g)::uuid, 'Pickup', 12.9563, 79.9422,
       'Drop', 12.9165, 79.1325, 500, 500, 88000
  from generate_series(1, 6) g;

insert into public.trips(id, load_id, driver_id, vehicle_id) values
  -- Driver A: two assigned trips
  ('fa000000-0000-4000-8000-000000000001', 'ba000000-0000-4000-8000-000000000001',
   'da000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001'),
  ('fa000000-0000-4000-8000-000000000002', 'ba000000-0000-4000-8000-000000000002',
   'da000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001'),
  -- Driver B
  ('fa000000-0000-4000-8000-000000000003', 'ba000000-0000-4000-8000-000000000003',
   'da000000-0000-4000-8000-000000000002', 'ca000000-0000-4000-8000-000000000001'),
  -- No-consent driver
  ('fa000000-0000-4000-8000-000000000004', 'ba000000-0000-4000-8000-000000000004',
   'da000000-0000-4000-8000-000000000003', 'ca000000-0000-4000-8000-000000000001'),
  -- Inactive driver
  ('fa000000-0000-4000-8000-000000000005', 'ba000000-0000-4000-8000-000000000005',
   'da000000-0000-4000-8000-000000000004', 'ca000000-0000-4000-8000-000000000001'),
  -- Stale-consent driver (0009)
  ('fa000000-0000-4000-8000-000000000006', 'ba000000-0000-4000-8000-000000000006',
   'da000000-0000-4000-8000-000000000005', 'ca000000-0000-4000-8000-000000000001');

-- =================== grants ==========================================
select ok(has_function_privilege('authenticated',
  'public.start_trip(uuid,double precision,double precision,real,jsonb)', 'execute'),
  'authenticated can execute start_trip');
select ok(not has_function_privilege('anon',
  'public.start_trip(uuid,double precision,double precision,real,jsonb)', 'execute'),
  'anon cannot execute start_trip');
select ok(not exists (
  select 1 from pg_proc p, aclexplode(p.proacl) a
   where p.oid = 'public.start_trip(uuid,double precision,double precision,real,jsonb)'::regprocedure
     and a.grantee = 0),
  'PUBLIC has no grant on start_trip');
select ok((select prosecdef from pg_proc
            where oid = 'public.start_trip(uuid,double precision,double precision,real,jsonb)'::regprocedure),
  'start_trip is SECURITY DEFINER');

-- =================== FORBIDDEN (inactive, 0007) =====================
select tests.as_user('da000000-0000-4000-8000-000000000004');
select throws_ok(
  $$select public.start_trip('fa000000-0000-4000-8000-000000000005'::uuid, 12.9563, 79.9422, 10::real)$$,
  '42501', 'FORBIDDEN', 'an inactive driver cannot start their assigned trip');
select throws_ok(
  $$select public.start_trip('fa000000-0000-4000-8000-000000000003'::uuid, 12.9563, 79.9422, 10::real)$$,
  '42501', 'FORBIDDEN', 'the inactive check comes first: a stranger''s trip also reads FORBIDDEN');

-- =================== CONSENT_REQUIRED (0006) ========================
set local role postgres;
select tests.as_user('da000000-0000-4000-8000-000000000003');
select throws_ok(
  $$select public.start_trip('fa000000-0000-4000-8000-000000000004'::uuid, 12.9563, 79.9422, 10::real)$$,
  'P0001', 'CONSENT_REQUIRED', 'a driver with no recorded consent cannot start');
select throws_ok(
  $$select public.start_trip('fa000000-0000-4000-8000-000000000003'::uuid, 12.9563, 79.9422, 10::real)$$,
  'P0002', 'TRIP_NOT_FOUND', 'ownership comes before consent: a stranger''s trip reads TRIP_NOT_FOUND');

-- =================== CONSENT_REQUIRED for a stale version (0009) =====
set local role postgres;
select is(public.current_consent_version(), '2026-10-01',
  'the current policy version is in app_settings');
select tests.as_user('da000000-0000-4000-8000-000000000005');
select throws_ok(
  $$select public.start_trip('fa000000-0000-4000-8000-000000000006'::uuid, 12.9563, 79.9422, 10::real)$$,
  'P0001', 'CONSENT_REQUIRED', 'a driver whose consent version is stale cannot start');
select public.record_consent(public.current_consent_version()) as ignored \gset
select lives_ok(
  $$select public.start_trip('fa000000-0000-4000-8000-000000000006'::uuid, 12.9563, 79.9422, 10::real)$$,
  'recording the current version lets that driver start');
set local role postgres;

-- =================== Driver A: the rest in order =====================
set local role postgres;
select tests.as_user('da000000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.start_trip('fa0000ff-0000-4000-8000-000000000000'::uuid, 12.9563, 79.9422, 10::real)$$,
  'P0002', 'TRIP_NOT_FOUND', 'a trip that does not exist reads TRIP_NOT_FOUND');
select throws_ok(
  $$select public.start_trip('fa000000-0000-4000-8000-000000000003'::uuid, 12.9563, 79.9422, 10::real)$$,
  'P0002', 'TRIP_NOT_FOUND', 'another driver''s trip reads TRIP_NOT_FOUND');
select throws_ok(
  $$select public.start_trip('fa000000-0000-4000-8000-000000000001'::uuid, 12.9563, 79.9422, 80::real)$$,
  'P0001', 'GPS_ACCURACY_TOO_LOW', 'a fix with accuracy 80 m is refused');
select throws_ok(
  $$select public.start_trip('fa000000-0000-4000-8000-000000000001'::uuid, 12.9563, 79.9422, null::real)$$,
  'P0001', 'GPS_ACCURACY_TOO_LOW', 'a fix with no accuracy is refused');
select throws_ok(
  format($$select public.start_trip('%s'::uuid, %s, %s, 10::real)$$,
         'fa000000-0000-4000-8000-000000000001', 12.9290, 79.9422),
  'P0001',
  'OUTSIDE_PICKUP:' || round(extensions.st_distance(
    extensions.st_setsrid(extensions.st_makepoint(79.9422, 12.9290), 4326)::extensions.geography,
    (select pickup_geog from public.loads where id = 'ba000000-0000-4000-8000-000000000001'))),
  'a fix 3 km from the pickup is refused with the distance');
select lives_ok(
  $$select public.start_trip('fa000000-0000-4000-8000-000000000001'::uuid, 12.9563, 79.9422, 10::real)$$,
  'Driver A starts trip 1 inside the pickup radius');
select throws_ok(
  $$select public.start_trip('fa000000-0000-4000-8000-000000000001'::uuid, 12.9563, 79.9422, 10::real)$$,
  'P0001', 'TRIP_NOT_STARTABLE', 'a trip already in progress cannot be started again');
select throws_ok(
  $$select public.start_trip('fa000000-0000-4000-8000-000000000002'::uuid, 12.9563, 79.9422, 10::real)$$,
  'P0001', 'ANOTHER_TRIP_ACTIVE', 'a second trip cannot start while one is in progress');

-- =================== state after the calls ===========================
set local role postgres;
select is((select status::text from public.trips where id = 'fa000000-0000-4000-8000-000000000001'), 'in_progress',
  'trip 1 is in progress');
select is((select array_agg(status::text order by id) from public.trips
            where id in ('fa000000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000004',
                         'fa000000-0000-4000-8000-000000000005')),
  array['assigned', 'assigned', 'assigned'], 'every refused trip is still assigned');
select is((select count(*)::int from public.trip_events
            where trip_id::text like 'fa000000-%' and type = 'started'), 2,
  'each successful start logged exactly one started event (Driver A and the re-consented driver)');
select is((select count(*)::int from public.trips
            where driver_id = 'da000000-0000-4000-8000-000000000001' and status = 'in_progress'), 1,
  'Driver A has exactly one trip in progress');

select * from finish();
rollback;
