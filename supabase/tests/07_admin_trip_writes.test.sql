-- =====================================================================
-- Namma Lorry — 07: admin trip writes go through audited RPCs (ND-13)
-- Validation report B2 / rls-attacks.md A29: an admin PATCH on trips set
-- status = 'verified' and tracked_distance_m directly, with no event and no
-- stats. CLAUDE.md hard rule 2, docs/09 §5 "Admin abuse".
--   RLS        admin may SELECT and INSERT (assign) trips; no UPDATE/DELETE
--   cancel_trip      FORBIDDEN · NOTE_REQUIRED · TRIP_NOT_FOUND · TRIP_NOT_CANCELLABLE
--   admin_force_end  FORBIDDEN · NOTE_REQUIRED · TRIP_NOT_FOUND · TRIP_NOT_ACTIVE
-- =====================================================================
begin;

\ir _helpers.psql

select plan(36);

-- ---- fixtures (runner starts as postgres, so RLS is bypassed) ----------
select tests.create_user('a7000000-0000-4000-8000-000000000001', '919000000971', 'admin',  'Ops Admin');
select tests.create_user('d7000000-0000-4000-8000-000000000001', '919000000972', 'driver', 'Driver A');
select tests.create_user('d7000000-0000-4000-8000-000000000002', '919000000973', 'driver', 'Driver B');
select tests.create_user('d7000000-0000-4000-8000-000000000003', '919000000974', 'driver', 'Driver C');
select tests.create_vehicle('TN 07 AA 0001');

-- tripA: assigned (A29 target, then cancelled) · tripB: in_progress with a full
-- track (force-ended) · tripC: assigned to driver C (assignment insert tests use its load)
select tests.create_load() as load_a \gset
select tests.create_load() as load_b \gset
select tests.create_load() as load_c \gset
select id as vehicle from public.vehicles where registration_no = 'TN 07 AA 0001' \gset

insert into public.trips(id, load_id, driver_id, vehicle_id) values
  ('f7000000-0000-4000-8000-000000000001', :'load_a', 'd7000000-0000-4000-8000-000000000001', :'vehicle');

insert into public.trips(id, load_id, driver_id, vehicle_id, status, started_at, start_lat, start_lng, start_accuracy_m)
select 'f7000000-0000-4000-8000-000000000002', l.id, 'd7000000-0000-4000-8000-000000000002', :'vehicle',
       'in_progress', now() - interval '2 hours', l.pickup_lat, l.pickup_lng, 10
from public.loads l where l.id = :'load_b';
-- 200 of the points, uploaded while in_progress (the trigger keeps trip_live current)
select tests.insert_track('f7000000-0000-4000-8000-000000000002', now() - interval '2 hours',
                          interval '30 seconds', 240, 1, 200);

-- ---- A29: admin cannot write trips directly ----------------------------
select tests.as_user('a7000000-0000-4000-8000-000000000001');

select is(tests.affected($$update public.trips set status = 'verified', tracked_distance_m = 123456
                            where id = 'f7000000-0000-4000-8000-000000000001'$$), 0,
  'A29: admin PATCH trips.status/tracked_distance_m affects 0 rows');
select is(tests.affected($$update public.trips set status = 'cancelled'
                            where id = 'f7000000-0000-4000-8000-000000000001'$$), 0,
  'admin cannot cancel a trip with a direct UPDATE');
select is(tests.affected($$delete from public.trips where id = 'f7000000-0000-4000-8000-000000000001'$$), 0,
  'admin cannot DELETE a trip');

set local role postgres;
select is((select status::text from public.trips where id = 'f7000000-0000-4000-8000-000000000001'), 'assigned',
  'A29: trip status is unchanged after the admin UPDATE attempts');
select is((select tracked_distance_m from public.trips where id = 'f7000000-0000-4000-8000-000000000001'), null,
  'A29: tracked_distance_m is unchanged after the admin UPDATE attempt');
select is((select count(*)::int from public.driver_stats where driver_id = 'd7000000-0000-4000-8000-000000000001'), 0,
  'A29: no driver_stats row was created');

-- ---- assignment (console C4) still works: admin INSERT of a fresh trip -----
select tests.as_user('a7000000-0000-4000-8000-000000000001');
select is(tests.affected(format($$insert into public.trips(load_id, driver_id, vehicle_id)
                                   values (%L, 'd7000000-0000-4000-8000-000000000003', %L)$$, :'load_c', :'vehicle')), 1,
  'admin can assign a trip (INSERT with default status)');
select is((select count(*)::int from public.trips where load_id = :'load_c'), 1,
  'admin reads the trip they assigned');
select throws_ok(format($$insert into public.trips(load_id, driver_id, vehicle_id, status, tracked_distance_m)
                          values (%L, 'd7000000-0000-4000-8000-000000000003', %L, 'verified', 99999)$$,
                        tests.create_load(), :'vehicle'),
  '42501', 'new row violates row-level security policy for table "trips"',
  'admin cannot INSERT a trip that is already verified');
select throws_ok(format($$insert into public.trips(load_id, driver_id, vehicle_id, status, started_at)
                          values (%L, 'd7000000-0000-4000-8000-000000000003', %L, 'in_progress', now())$$,
                        tests.create_load(), :'vehicle'),
  '42501', 'new row violates row-level security policy for table "trips"',
  'admin cannot INSERT a trip that is already in progress');

-- ---- cancel_trip -------------------------------------------------------
set local role postgres;
select tests.as_user('d7000000-0000-4000-8000-000000000001');
select throws_ok($$select public.cancel_trip('f7000000-0000-4000-8000-000000000001', 'driver tries')$$,
  '42501', 'FORBIDDEN', 'cancel_trip: a driver gets FORBIDDEN');

set local role postgres;
select tests.as_user('a7000000-0000-4000-8000-000000000001');
select throws_ok($$select public.cancel_trip('f7000000-0000-4000-8000-000000000001', '   ')$$,
  'P0001', 'NOTE_REQUIRED', 'cancel_trip: a blank note gets NOTE_REQUIRED');
select throws_ok($$select public.cancel_trip('f7000000-0000-4000-8000-0000000000ff', 'no such trip')$$,
  'P0002', 'TRIP_NOT_FOUND', 'cancel_trip: an unknown trip gets TRIP_NOT_FOUND');
select throws_ok($$select public.cancel_trip('f7000000-0000-4000-8000-000000000002', 'still driving')$$,
  'P0001', 'TRIP_NOT_CANCELLABLE', 'cancel_trip: an in_progress trip gets TRIP_NOT_CANCELLABLE');
select lives_ok($$select public.cancel_trip('f7000000-0000-4000-8000-000000000001', 'Load moved to another truck')$$,
  'cancel_trip: admin cancels an assigned trip');

set local role postgres;
select is((select status::text from public.trips where id = 'f7000000-0000-4000-8000-000000000001'), 'cancelled',
  'cancel_trip: the trip is cancelled');
select is((select count(*)::int from public.trip_events
            where trip_id = 'f7000000-0000-4000-8000-000000000001' and type = 'cancelled'
              and actor_id = 'a7000000-0000-4000-8000-000000000001'
              and payload ->> 'note' = 'Load moved to another truck'), 1,
  'cancel_trip: a cancelled event records the admin and the note');
select throws_ok($$select public.cancel_trip('f7000000-0000-4000-8000-000000000001', 'again')$$,
  'P0001', 'TRIP_NOT_CANCELLABLE', 'cancel_trip: a cancelled trip cannot be cancelled twice');

select tests.as_user('a7000000-0000-4000-8000-000000000001');
select is(tests.affected(format($$insert into public.trips(load_id, driver_id, vehicle_id)
                                   values (%L, 'd7000000-0000-4000-8000-000000000001', %L)$$, :'load_a', :'vehicle')), 1,
  'cancel_trip: the load can be reassigned after the cancel');

-- ---- admin_force_end ---------------------------------------------------
set local role postgres;
select tests.as_user('d7000000-0000-4000-8000-000000000002');
select throws_ok($$select public.admin_force_end('f7000000-0000-4000-8000-000000000002', 'driver tries')$$,
  '42501', 'FORBIDDEN', 'admin_force_end: a driver gets FORBIDDEN');

set local role postgres;
select tests.as_user('a7000000-0000-4000-8000-000000000001');
select throws_ok($$select public.admin_force_end('f7000000-0000-4000-8000-000000000002', '')$$,
  'P0001', 'NOTE_REQUIRED', 'admin_force_end: an empty note gets NOTE_REQUIRED');
select throws_ok($$select public.admin_force_end('f7000000-0000-4000-8000-0000000000ff', 'no such trip')$$,
  'P0002', 'TRIP_NOT_FOUND', 'admin_force_end: an unknown trip gets TRIP_NOT_FOUND');
select throws_ok(format($$select public.admin_force_end(%L, 'not started')$$,
                        (select id from public.trips where load_id = :'load_c')),
  'P0001', 'TRIP_NOT_ACTIVE', 'admin_force_end: an assigned trip gets TRIP_NOT_ACTIVE');
select lives_ok($$select public.admin_force_end('f7000000-0000-4000-8000-000000000002', 'Phone lost, driver called in')$$,
  'admin_force_end: admin ends an in_progress trip');

set local role postgres;
select is((select status::text from public.trips where id = 'f7000000-0000-4000-8000-000000000002'), 'needs_review',
  'admin_force_end: the trip goes to needs_review, never straight to verified');
select ok((select 'MISSING_POINTS' = any(verification_reasons) from public.trips
            where id = 'f7000000-0000-4000-8000-000000000002'),
  'admin_force_end: MISSING_POINTS is always among the reasons');
select ok((select 'END_OUTSIDE_DROP' = any(verification_reasons) from public.trips
            where id = 'f7000000-0000-4000-8000-000000000002'),
  'admin_force_end: no driver end position, so END_OUTSIDE_DROP is flagged');
select is((select ended_at from public.trips where id = 'f7000000-0000-4000-8000-000000000002'),
          (select max(recorded_at) from public.trip_points where trip_id = 'f7000000-0000-4000-8000-000000000002'),
  'admin_force_end: ended_at is the last received point');
select ok((select tracked_distance_m > 0 from public.trips where id = 'f7000000-0000-4000-8000-000000000002'),
  'admin_force_end: the distance comes from verify_trip over the received points');
select is((select count(*)::int from public.trip_events
            where trip_id = 'f7000000-0000-4000-8000-000000000002' and type = 'force_ended'
              and actor_id = 'a7000000-0000-4000-8000-000000000001'
              and payload ->> 'note' = 'Phone lost, driver called in'
              and (payload ->> 'received_points')::int = 200), 1,
  'admin_force_end: a force_ended event records the admin, the note and the points received');
select is((select count(*)::int from public.trip_events
            where trip_id = 'f7000000-0000-4000-8000-000000000002' and type = 'needs_review'), 1,
  'admin_force_end: verify_trip logs its needs_review event');
select is((select count(*)::int from public.trip_live where trip_id = 'f7000000-0000-4000-8000-000000000002'), 0,
  'admin_force_end: the live position is removed from the console map');
select is((select count(*)::int from public.driver_stats where driver_id = 'd7000000-0000-4000-8000-000000000002'), 0,
  'admin_force_end: no verified stats are added');
select is((select count(*)::int from public.trips
            where driver_id = 'd7000000-0000-4000-8000-000000000002' and status = 'in_progress'), 0,
  'admin_force_end: the driver is no longer blocked by ANOTHER_TRIP_ACTIVE');

-- ---- grants ------------------------------------------------------------
select tests.as_anon();
select throws_ok($$select public.cancel_trip('f7000000-0000-4000-8000-000000000001', 'anon')$$,
  '42501', 'permission denied for function cancel_trip', 'anon cannot call cancel_trip');
select throws_ok($$select public.admin_force_end('f7000000-0000-4000-8000-000000000002', 'anon')$$,
  '42501', 'permission denied for function admin_force_end', 'anon cannot call admin_force_end');

select * from finish();
rollback;
