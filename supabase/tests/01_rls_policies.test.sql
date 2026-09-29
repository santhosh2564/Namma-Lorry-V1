-- =====================================================================
-- Namma Lorry — 01: Row Level Security
-- docs/06 §2 (table access), CLAUDE.md rules 1/9/13, PRD P0-13,
-- doc 10 §4 scenario 9 ("driver REST update of trips.status → 0 rows").
-- Every policy added in 0001 is exercised from both sides: the actor that
-- must be blocked, and the actor that must be allowed.
-- =====================================================================
begin;

\ir _helpers.psql

select plan(46);

-- ---- fixtures (runner starts as postgres, so RLS is bypassed) ----------
select tests.create_user('a1000000-0000-4000-8000-000000000001', '919000000901', 'admin',   'Ops Admin');
select tests.create_user('d1000000-0000-4000-8000-000000000001', '919000000902', 'driver',  'Driver A');
select tests.create_user('d1000000-0000-4000-8000-000000000002', '919000000903', 'driver',  'Driver B');
select tests.create_user('e1000000-0000-4000-8000-000000000001', '919000000904', 'owner',   'Owner X');
select tests.create_user('5b100000-0000-4000-8000-000000000001', '919000000905', 'shipper', 'Shipper Y');
-- start_trip requires a recorded consent (0006, docs/09 §1)
update public.profiles set consent_version = '2026-09-27.1', consent_at = now() where id::text like 'd1000000-%';

insert into public.vehicles(id, registration_no, vehicle_type, owner_id) values
  ('c1000000-0000-4000-8000-000000000001', 'TN 01 AA 0001', '19ft', 'e1000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000002', 'TN 01 AA 0002', '14ft', null);

insert into public.loads(id, pickup_address, pickup_lat, pickup_lng, drop_address, drop_lat, drop_lng,
                         pickup_radius_m, drop_radius_m, planned_distance_m, shipper_id) values
  ('b1000000-0000-4000-8000-000000000001', 'Pickup A', 12.9563, 79.9422, 'Drop A', 12.9165, 79.1325, 500, 500, 88000, null),
  ('b1000000-0000-4000-8000-000000000002', 'Pickup B', 12.9563, 79.9422, 'Drop B', 12.9165, 79.1325, 500, 500, 88000, null),
  ('b1000000-0000-4000-8000-000000000003', 'Pickup C', 12.9563, 79.9422, 'Drop C', 12.9165, 79.1325, 500, 500, 88000, '5b100000-0000-4000-8000-000000000001');

insert into public.trips(id, load_id, driver_id, vehicle_id, status, started_at, start_lat, start_lng, start_accuracy_m) values
  ('f1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
   'd1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
   'in_progress', now() - interval '1 hour', 12.9563, 79.9422, 10),
  ('f1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002',
   'd1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000002',
   'assigned', null, null, null, null);

-- Points and events for both trips. tripA is in_progress, so its points also
-- create the live row through the upload trigger.
insert into public.trip_points(trip_id, seq, recorded_at, lat, lng, accuracy_m)
select t.id, g, now() - interval '30 minutes' + g * interval '10 seconds', 12.95, 79.94, 10
from public.trips t, generate_series(1, 3) g;

insert into public.trip_events(trip_id, type) values
  ('f1000000-0000-4000-8000-000000000001', 'started'),
  ('f1000000-0000-4000-8000-000000000002', 'started');

insert into public.trip_live(trip_id, driver_id, lat, lng, recorded_at) values
  ('f1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 12.95, 79.94, now());

insert into public.driver_stats(driver_id, verified_trips, verified_distance_m) values
  ('d1000000-0000-4000-8000-000000000001', 5, 1000),
  ('d1000000-0000-4000-8000-000000000002', 2, 400);

-- ---- anon: the publishable key with no session ------------------------
select tests.as_anon();
select is((select count(*)::int from public.trips), 0, 'anon cannot read trips');
select is((select count(*)::int from public.profiles), 0, 'anon cannot read profiles');
select throws_ok(
  $$select public.start_trip('f1000000-0000-4000-8000-000000000001'::uuid, 12.95, 79.94, 10::real)$$,
  '42501', 'permission denied for function start_trip', 'anon cannot execute start_trip');

-- ---- driver A: trips -------------------------------------------------
select tests.as_user('d1000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.trips where id = 'f1000000-0000-4000-8000-000000000001'), 1,
  'driver A reads their own trip');
select is((select count(*)::int from public.trips where id = 'f1000000-0000-4000-8000-000000000002'), 0,
  'driver A cannot read the driver B trip');
select is(tests.affected($$update public.trips set status = 'verified'
                           where id = 'f1000000-0000-4000-8000-000000000001'$$), 0,
  'driver A cannot update their own trip status (doc 10 scenario 9)');
select throws_ok(
  $$insert into public.trips(load_id, driver_id, vehicle_id)
    values ('b1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001')$$,
  '42501', 'new row violates row-level security policy for table "trips"', 'driver A cannot assign a trip');
select is(tests.affected($$delete from public.trips
                           where id = 'f1000000-0000-4000-8000-000000000001'$$), 0,
  'driver A cannot delete their own trip');

-- ---- driver A: trip_points -------------------------------------------
select is((select count(*)::int from public.trip_points where trip_id = 'f1000000-0000-4000-8000-000000000001'), 3,
  'driver A reads their own points');
select is((select count(*)::int from public.trip_points where trip_id = 'f1000000-0000-4000-8000-000000000002'), 0,
  'driver A cannot read the driver B points');
select is(tests.affected($$insert into public.trip_points(trip_id, seq, recorded_at, lat, lng, accuracy_m)
                           values ('f1000000-0000-4000-8000-000000000001', 9001, now(), 12.955, 79.941, 12)$$), 1,
  'driver A can upload a point to their own in-progress trip');
-- A failed WITH CHECK raises instead of silently affecting 0 rows, so these two
-- are "throws", not "affected = 0".
select throws_ok(
  $$insert into public.trip_points(trip_id, seq, recorded_at, lat, lng, accuracy_m)
    values ('f1000000-0000-4000-8000-000000000002', 9002, now(), 12.955, 79.941, 12)$$,
  '42501', 'new row violates row-level security policy for table "trip_points"',
  'driver A cannot upload a point to the driver B trip');
select throws_ok(
  $$insert into public.trip_points(trip_id, seq, recorded_at, lat, lng, accuracy_m)
    values ('f1000000-0000-4000-8000-000000000001', 9003, now() - interval '10 days', 12.955, 79.941, 12)$$,
  '42501', 'new row violates row-level security policy for table "trip_points"',
  'driver A cannot backdate a point outside the trip window');
select is(tests.affected($$update public.trip_points set lat = 0
                           where trip_id = 'f1000000-0000-4000-8000-000000000001'$$), 0,
  'driver A cannot update points');
select is(tests.affected($$delete from public.trip_points
                           where trip_id = 'f1000000-0000-4000-8000-000000000001'$$), 0,
  'driver A cannot delete points');

-- ---- driver A: driver_stats (the "verified experience") ---------------
select throws_ok(
  $$insert into public.driver_stats(driver_id, verified_trips, verified_distance_m)
    values ('d1000000-0000-4000-8000-000000000001', 999, 999)$$,
  '42501', 'new row violates row-level security policy for table "driver_stats"', 'driver A cannot insert driver_stats');
select is(tests.affected($$update public.driver_stats set verified_trips = 999
                           where driver_id = 'd1000000-0000-4000-8000-000000000001'$$), 0,
  'driver A cannot update their own driver_stats');
select is((select verified_trips::int from public.driver_stats where driver_id = 'd1000000-0000-4000-8000-000000000001'), 5,
  'driver A reads their own driver_stats');
select is((select count(*)::int from public.driver_stats where driver_id = 'd1000000-0000-4000-8000-000000000002'), 0,
  'driver A cannot read the driver B driver_stats');

-- ---- driver A: profiles (no self-update, so no role escalation) -------
select is((select count(*)::int from public.profiles where id = 'd1000000-0000-4000-8000-000000000001'), 1,
  'driver A reads their own profile');
select is((select count(*)::int from public.profiles where id = 'd1000000-0000-4000-8000-000000000002'), 0,
  'driver A cannot read another profile');
select is(tests.affected($$update public.profiles set role = 'admin'
                           where id = 'd1000000-0000-4000-8000-000000000001'$$), 0,
  'driver A cannot escalate their own role');
select throws_ok(
  $$insert into public.profiles(id, role) values ('d1000000-0000-4000-8000-000000000009', 'admin')$$,
  '42501', 'new row violates row-level security policy for table "profiles"', 'driver A cannot insert a profile');

-- ---- app_settings ----------------------------------------------------
select is((select count(*)::int from public.app_settings where key = 'max_gap_minutes'), 1,
  'authenticated can read app_settings');
select is(tests.affected($$update public.app_settings set value = 1 where key = 'max_gap_minutes'$$), 0,
  'driver A cannot update app_settings');

-- ---- vehicles --------------------------------------------------------
select is((select count(*)::int from public.vehicles where id = 'c1000000-0000-4000-8000-000000000001'), 1,
  'driver A can read the vehicle on their own trip');
select is((select count(*)::int from public.vehicles where id = 'c1000000-0000-4000-8000-000000000002'), 0,
  'driver A cannot read an unrelated vehicle');

-- ---- loads -----------------------------------------------------------
select is((select count(*)::int from public.loads where id = 'b1000000-0000-4000-8000-000000000001'), 1,
  'driver A can read the load of their own trip');
select is((select count(*)::int from public.loads where id = 'b1000000-0000-4000-8000-000000000003'), 0,
  'driver A cannot read an unrelated load');

-- ---- trip_events / trip_live -----------------------------------------
select is((select count(*)::int from public.trip_events where trip_id = 'f1000000-0000-4000-8000-000000000001'), 1,
  'driver A reads events for their own trip');
select is((select count(*)::int from public.trip_events where trip_id = 'f1000000-0000-4000-8000-000000000002'), 0,
  'driver A cannot read events for the driver B trip');
select is((select count(*)::int from public.trip_live where trip_id = 'f1000000-0000-4000-8000-000000000001'), 1,
  'driver A reads the live position for their own trip');
select is((select count(*)::int from public.trip_live where trip_id = 'f1000000-0000-4000-8000-000000000002'), 0,
  'driver A cannot read the live position for the driver B trip');

-- ---- admin is allowed everything --------------------------------------
set local role postgres;
select tests.as_user('a1000000-0000-4000-8000-000000000001');
-- Scoped to the fixtures: supabase/seed.sql rows are also present when this
-- suite runs against a reset database, so whole-table counts are not stable.
select is((select count(*)::int from public.trips where id = 'f1000000-0000-4000-8000-000000000002'), 1,
  'admin reads the driver B trip');
select is((select count(*)::int from public.driver_stats
            where driver_id in ('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002')), 2,
  'admin reads every driver_stats row of the fixture drivers');
select is(tests.affected($$update public.app_settings set value = 10 where key = 'max_gap_minutes'$$), 1,
  'admin can update app_settings');
select is((select count(*)::int from public.vehicles where id = 'c1000000-0000-4000-8000-000000000002'), 1,
  'admin reads every vehicle');
select is((select count(*)::int from public.loads where id = 'b1000000-0000-4000-8000-000000000003'), 1,
  'admin reads every load');

-- ---- owner and shipper see only their own rows ------------------------
set local role postgres;
select tests.as_user('e1000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.vehicles where id = 'c1000000-0000-4000-8000-000000000001'), 1,
  'owner reads their own vehicle');
select is((select count(*)::int from public.vehicles where id = 'c1000000-0000-4000-8000-000000000002'), 0,
  'owner cannot read a vehicle they do not own');
select is((select count(*)::int from public.trips where id = 'f1000000-0000-4000-8000-000000000001'), 1,
  'owner reads the trip that uses their vehicle');

set local role postgres;
select tests.as_user('5b100000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.loads where id = 'b1000000-0000-4000-8000-000000000003'), 1,
  'shipper reads their own load');
select is((select count(*)::int from public.loads where id = 'b1000000-0000-4000-8000-000000000001'), 0,
  'shipper cannot read a load they do not ship');

-- ---- internal verification functions are not callable by clients ------
set local role postgres;
select tests.as_user('d1000000-0000-4000-8000-000000000001');
select throws_ok($$select public.verify_trip('f1000000-0000-4000-8000-000000000001'::uuid)$$,
  '42501', 'permission denied for function verify_trip', 'driver A cannot call verify_trip');
select throws_ok($$select public.sweep_unverified_trips()$$,
  '42501', 'permission denied for function sweep_unverified_trips', 'driver A cannot call sweep_unverified_trips');
select throws_ok($$select public.apply_verified_stats('f1000000-0000-4000-8000-000000000001'::uuid)$$,
  '42501', 'permission denied for function apply_verified_stats', 'driver A cannot call apply_verified_stats');

select * from finish();
rollback;
