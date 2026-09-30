-- =====================================================================
-- Namma Lorry — 02: client RPC contracts
-- docs/06 §1. Every documented error code is produced by a real call:
--   start_trip        TRIP_NOT_FOUND · TRIP_NOT_STARTABLE · ANOTHER_TRIP_ACTIVE
--                     GPS_ACCURACY_TOO_LOW · OUTSIDE_PICKUP:<metres>
--   end_trip          TRIP_NOT_FOUND · TRIP_NOT_ACTIVE
--   admin_review_trip FORBIDDEN · NOTE_REQUIRED · TRIP_NOT_IN_REVIEW
-- doc 10 §4 scenario 10 (two trips started) is the ANOTHER_TRIP_ACTIVE case.
-- =====================================================================
begin;

\ir _helpers.psql

select plan(28);

-- ---- fixtures --------------------------------------------------------
select tests.create_user('a2000000-0000-4000-8000-000000000001', '919000000911', 'admin',  'Ops Admin');
select tests.create_user('d2000000-0000-4000-8000-000000000001', '919000000912', 'driver', 'Driver A');
select tests.create_user('d2000000-0000-4000-8000-000000000002', '919000000913', 'driver', 'Driver B');
select tests.create_user('d2000000-0000-4000-8000-000000000003', '919000000914', 'driver', 'Driver C');
-- start_trip requires a recorded consent (0006, docs/09 §1)
update public.profiles set consent_version = '2026-10-01', consent_at = now() where id::text like 'd2000000-%';

insert into public.vehicles(id, registration_no, vehicle_type) values
  ('c2000000-0000-4000-8000-000000000001', 'TN 02 AA 0001', '19ft');

insert into public.loads(id, pickup_address, pickup_lat, pickup_lng, drop_address, drop_lat, drop_lng,
                         pickup_radius_m, drop_radius_m, planned_distance_m) values
  ('b2000000-0000-4000-8000-000000000001', 'Pickup 1', 12.9563, 79.9422, 'Drop 1', 12.9165, 79.1325, 500, 500, 88000),
  ('b2000000-0000-4000-8000-000000000002', 'Pickup 2', 12.9563, 79.9422, 'Drop 2', 12.9165, 79.1325, 500, 500, 88000),
  ('b2000000-0000-4000-8000-000000000003', 'Pickup 3', 12.9563, 79.9422, 'Drop 3', 12.9165, 79.1325, 500, 500, 88000),
  ('b2000000-0000-4000-8000-000000000004', 'Pickup 4', 12.9563, 79.9422, 'Drop 4', 12.9165, 79.1325, 500, 500, 88000),
  ('b2000000-0000-4000-8000-000000000005', 'Pickup 5', 12.9563, 79.9422, 'Drop 5', 12.9165, 79.1325, 500, 500, 88000);

insert into public.trips(id, load_id, driver_id, vehicle_id) values
  ('f2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001',
   'd2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001'),
  ('f2000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002',
   'd2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001'),
  ('f2000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000003',
   'd2000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001');

-- Two flagged trips for the admin decision tests.
insert into public.trips(id, load_id, driver_id, vehicle_id, status, started_at, ended_at, verification_reasons) values
  ('f2000000-0000-4000-8000-000000000004', 'b2000000-0000-4000-8000-000000000004',
   'd2000000-0000-4000-8000-000000000003', 'c2000000-0000-4000-8000-000000000001',
   'needs_review', now() - interval '3 hours', now() - interval '1 hour', array['TRACKING_GAP']),
  ('f2000000-0000-4000-8000-000000000005', 'b2000000-0000-4000-8000-000000000005',
   'd2000000-0000-4000-8000-000000000003', 'c2000000-0000-4000-8000-000000000001',
   'needs_review', now() - interval '3 hours', now() - interval '1 hour', array['MOCK_LOCATION']);

-- =================== start_trip ======================================
select tests.as_user('d2000000-0000-4000-8000-000000000001');

select throws_ok(
  $$select public.start_trip('f2000000-0000-4000-8000-000000000001'::uuid, 12.9563, 79.9422, 80::real)$$,
  'P0001', 'GPS_ACCURACY_TOO_LOW', 'start_trip rejects a fix with accuracy 80 m');

-- The metres are part of the contract: the app shows "You are X km from pickup".
select throws_ok(
  format($$select public.start_trip('%s'::uuid, %s, %s, 10::real)$$,
         'f2000000-0000-4000-8000-000000000001', 12.9290, 79.9422),
  'P0001',
  'OUTSIDE_PICKUP:' || round(extensions.st_distance(
    extensions.st_setsrid(extensions.st_makepoint(79.9422, 12.9290), 4326)::extensions.geography,
    (select pickup_geog from public.loads where id = 'b2000000-0000-4000-8000-000000000001'))),
  'start_trip refuses a fix 3 km from the pickup and reports the distance');

select throws_ok(
  $$select public.start_trip('f2000000-0000-4000-8000-000000000003'::uuid, 12.9563, 79.9422, 10::real)$$,
  'P0002', 'TRIP_NOT_FOUND', 'start_trip refuses a trip assigned to another driver');

select lives_ok(
  $$select public.start_trip('f2000000-0000-4000-8000-000000000001'::uuid, 12.9563, 79.9422, 10::real)$$,
  'start_trip succeeds inside the pickup radius');

select throws_ok(
  $$select public.start_trip('f2000000-0000-4000-8000-000000000001'::uuid, 12.9563, 79.9422, 10::real)$$,
  'P0001', 'TRIP_NOT_STARTABLE', 'start_trip refuses a trip that is no longer assigned');

select throws_ok(
  $$select public.start_trip('f2000000-0000-4000-8000-000000000002'::uuid, 12.9563, 79.9422, 10::real)$$,
  'P0001', 'ANOTHER_TRIP_ACTIVE', 'start_trip refuses a second trip while one is in progress (doc 10 scenario 10)');

set local role postgres;
select is((select status::text from public.trips where id = 'f2000000-0000-4000-8000-000000000001'), 'in_progress',
  'the started trip is in_progress');
select ok((select started_at is not null from public.trips where id = 'f2000000-0000-4000-8000-000000000001'),
  'the started trip has started_at');
select is((select count(*)::int from public.trip_events
            where trip_id = 'f2000000-0000-4000-8000-000000000001' and type = 'started'), 1,
  'start_trip logs a "started" event');

-- =================== end_trip ========================================
select tests.as_user('d2000000-0000-4000-8000-000000000002');
select throws_ok(
  $$select public.end_trip('f2000000-0000-4000-8000-000000000001'::uuid, 12.9165, 79.1325, 10::real, now(), 3)$$,
  'P0002', 'TRIP_NOT_FOUND', 'end_trip refuses a trip that is not the caller own');

select tests.as_user('d2000000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.end_trip('f2000000-0000-4000-8000-000000000002'::uuid, 12.9165, 79.1325, 10::real, now(), 3)$$,
  'P0001', 'TRIP_NOT_ACTIVE', 'end_trip refuses a trip that was never started');

select is(tests.affected($$insert into public.trip_points(trip_id, seq, recorded_at, lat, lng, accuracy_m)
                           values ('f2000000-0000-4000-8000-000000000001', 1, now(), 12.9560, 79.9415, 10),
                                  ('f2000000-0000-4000-8000-000000000001', 2, now(), 12.9400, 79.6000, 10),
                                  ('f2000000-0000-4000-8000-000000000001', 3, now(), 12.9165, 79.1325, 10)$$), 3,
  'the driver can upload points while the trip is in progress');

-- expected_points is far ahead of what has arrived, so verification waits
-- (docs/06 §1: end_trip returns "completed" while points are still missing).
select lives_ok(
  $$select public.end_trip('f2000000-0000-4000-8000-000000000001'::uuid, 12.9165, 79.1325, 10::real, now(), 500)$$,
  'end_trip succeeds and waits for the remaining points');

set local role postgres;
select is((select status::text from public.trips where id = 'f2000000-0000-4000-8000-000000000001'), 'completed',
  'the ended trip is completed while points are outstanding');
select is((select count(*)::int from public.trip_events
            where trip_id = 'f2000000-0000-4000-8000-000000000001' and type = 'ended'), 1,
  'end_trip logs an "ended" event');
select is((select count(*)::int from public.trip_live
            where trip_id = 'f2000000-0000-4000-8000-000000000001'), 0,
  'end_trip clears the live position row');

select tests.as_user('d2000000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.end_trip('f2000000-0000-4000-8000-000000000001'::uuid, 12.9165, 79.1325, 10::real, now(), 3)$$,
  'P0001', 'TRIP_NOT_ACTIVE', 'end_trip refuses a trip that was already ended (docs/06 §1)');

-- =================== admin_review_trip ===============================
select throws_ok(
  $$select public.admin_review_trip('f2000000-0000-4000-8000-000000000004'::uuid, true, 'looks fine')$$,
  '42501', 'FORBIDDEN', 'a driver cannot review a trip');

set local role postgres;
select tests.as_user('a2000000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.admin_review_trip('f2000000-0000-4000-8000-000000000004'::uuid, true, '   ')$$,
  'P0001', 'NOTE_REQUIRED', 'approval without a note is rejected');
select throws_ok(
  $$select public.admin_review_trip('f2000000-0000-4000-8000-000000000001'::uuid, true, 'ok')$$,
  'P0001', 'TRIP_NOT_IN_REVIEW', 'a trip that is not awaiting review cannot be decided');

select lives_ok(
  $$select public.admin_review_trip('f2000000-0000-4000-8000-000000000004'::uuid, true, 'Called the driver, track looks continuous')$$,
  'an admin can approve a flagged trip');

set local role postgres;
select is((select status::text from public.trips where id = 'f2000000-0000-4000-8000-000000000004'), 'verified',
  'the approved trip is verified');
select is((select count(*)::int from public.trip_events
            where trip_id = 'f2000000-0000-4000-8000-000000000004' and type = 'approved'), 1,
  'the approval is recorded in trip_events');
select is((select reviewed_by from public.trips where id = 'f2000000-0000-4000-8000-000000000004'),
  'a2000000-0000-4000-8000-000000000001'::uuid, 'the reviewer is recorded');

set local role postgres;
select tests.as_user('a2000000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.admin_review_trip('f2000000-0000-4000-8000-000000000004'::uuid, true, 'again')$$,
  'P0001', 'TRIP_NOT_IN_REVIEW', 'a decided trip cannot be decided twice (scenario 12)');
select lives_ok(
  $$select public.admin_review_trip('f2000000-0000-4000-8000-000000000005'::uuid, false, 'Fake GPS app confirmed')$$,
  'an admin can reject a flagged trip');

set local role postgres;
select is((select status::text from public.trips where id = 'f2000000-0000-4000-8000-000000000005'), 'rejected',
  'the rejected trip is rejected');
select ok((select verified_at is null from public.trips where id = 'f2000000-0000-4000-8000-000000000005'),
  'a rejected trip is never marked verified');

select * from finish();
rollback;
