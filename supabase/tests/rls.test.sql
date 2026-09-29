-- RLS coverage: every public table, every policy (docs/09 §4, CLAUDE.md rule 9,
-- doc 10 scenario 9). Added in M12a because the security review found no RLS tests.
-- The first block fails as soon as a table or policy is added without updating this file.
begin;
\ir _helpers.psql
select * from no_plan();

-- ---------- coverage guards ----------
select set_eq(
  $$ select tablename::text from pg_tables where schemaname = 'public' $$,
  array['app_settings','profiles','vehicles','loads','trips','trip_points','trip_live','trip_events','driver_stats'],
  'this file covers exactly the public tables (add tests for any new table)');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  0, 'every public table has RLS enabled');
select policies_are('public', 'app_settings', array['settings_read','settings_admin']);
select policies_are('public', 'profiles',     array['profiles_self','profiles_admin']);
select policies_are('public', 'vehicles',     array['vehicles_admin','vehicles_owner','vehicles_driver']);
select policies_are('public', 'loads',        array['loads_admin','loads_shipper','loads_driver']);
select policies_are('public', 'trips',        array['trips_admin','trips_driver','trips_owner','trips_shipper']);
select policies_are('public', 'trip_points',  array['points_driver_insert','points_read']);
select policies_are('public', 'trip_live',    array['live_read']);
select policies_are('public', 'trip_events',  array['events_read']);
select policies_are('public', 'driver_stats', array['stats_self','stats_admin']);

-- ---------- fixtures (as postgres) ----------
select tests.create_user('7e570000-0000-4000-8000-00000000000a', '919100000001', 'admin',   'Test Admin');
select tests.create_user('7e570000-0000-4000-8000-0000000000d1', '919100000002', 'driver',  'Driver One');
select tests.create_user('7e570000-0000-4000-8000-0000000000d2', '919100000003', 'driver',  'Driver Two');
select tests.create_user('7e570000-0000-4000-8000-00000000000e', '919100000004', 'owner',   'Owner');
select tests.create_user('7e570000-0000-4000-8000-00000000000f', '919100000005', 'shipper', 'Shipper');

create temp table ids as select
  tests.create_vehicle('TEST V1', '7e570000-0000-4000-8000-00000000000e') as v1,
  tests.create_vehicle('TEST V2') as v2,
  tests.create_load('7e570000-0000-4000-8000-00000000000f') as l1,
  tests.create_load() as l2;
alter table ids add column t1 uuid, add column t2 uuid;
update ids set
  t1 = tests.create_trip(l1, '7e570000-0000-4000-8000-0000000000d1', v1),
  t2 = tests.create_trip(l2, '7e570000-0000-4000-8000-0000000000d2', v2);
grant select on ids to authenticated, anon;

update public.trips set status = 'in_progress', started_at = now() - interval '1 hour',
       start_lat = 12.9563, start_lng = 79.9422, start_accuracy_m = 10
 where id in (select t1 from ids union all select t2 from ids);
select tests.insert_track((select t1 from ids), now() - interval '1 hour', interval '1 minute', 60, 1, 10);
select tests.insert_track((select t2 from ids), now() - interval '1 hour', interval '1 minute', 60, 1, 10);
insert into public.trip_events (trip_id, type) select t1, 'started' from ids union all select t2, 'started' from ids;
insert into public.driver_stats (driver_id, verified_trips, verified_distance_m) values
  ('7e570000-0000-4000-8000-0000000000d1', 3, 120000), ('7e570000-0000-4000-8000-0000000000d2', 5, 300000);

-- ---------- driver ----------
select tests.as_user('7e570000-0000-4000-8000-0000000000d1');

select isnt_empty($$ select 1 from public.app_settings $$, 'driver: can read verification settings');
select is_empty($$ update public.app_settings set value = 999 where key = 'max_gap_minutes' returning 1 $$,
  'driver: cannot change verification thresholds');

select results_eq($$ select id from public.profiles $$, $$ values ('7e570000-0000-4000-8000-0000000000d1'::uuid) $$,
  'driver: sees only own profile');
select is_empty($$ update public.profiles set role = 'admin' where id = auth.uid() returning 1 $$,
  'driver: cannot escalate own role');
select is_empty($$ update public.profiles set preferred_language = 'ta' where id = auth.uid() returning 1 $$,
  'driver: no direct profile writes (language goes through set_preferred_language)');

select results_eq($$ select id from public.vehicles $$, $$ select v1 from ids $$, 'driver: sees only the vehicle of own trip');
select throws_ok($$ insert into public.vehicles (registration_no, vehicle_type) values ('X', '19ft') $$, '42501',
  null, 'driver: cannot create vehicles');

select results_eq($$ select id from public.loads $$, $$ select l1 from ids $$, 'driver: sees only loads of own trips');
select throws_ok($$ insert into public.loads (pickup_address, pickup_lat, pickup_lng, drop_address, drop_lat, drop_lng)
                   values ('a', 13, 80, 'b', 12, 79) $$, '42501', null, 'driver: cannot create loads');

select results_eq($$ select id from public.trips $$, $$ select t1 from ids $$, 'driver: sees only own trips');
select is_empty($$ update public.trips set status = 'verified', tracked_distance_m = 999999
                   where id = (select t1 from ids) returning 1 $$,
  'driver: cannot update own trip status or km (scenario 9)');
select is_empty($$ update public.trips set status = 'cancelled' where id = (select t2 from ids) returning 1 $$,
  'driver: cannot update another driver''s trip');
select is_empty($$ delete from public.trips where id = (select t1 from ids) returning 1 $$, 'driver: cannot delete trips');
select throws_ok($$ insert into public.trips (load_id, driver_id, vehicle_id)
                   select l2, auth.uid(), v2 from ids $$, '42501', null, 'driver: cannot assign trips to self');

select isnt_empty($$ select 1 from public.trip_points where trip_id = (select t1 from ids) $$, 'driver: reads own trip points');
select is_empty($$ select 1 from public.trip_points where trip_id = (select t2 from ids) $$,
  'driver: cannot read another driver''s points');
select lives_ok($$ insert into public.trip_points (trip_id, seq, recorded_at, lat, lng, accuracy_m)
                  select t1, 100, now() - interval '5 minutes', 12.9, 79.9, 10 from ids $$,
  'driver: can upload a point to own in-progress trip');
select throws_ok($$ insert into public.trip_points (trip_id, seq, recorded_at, lat, lng)
                   select t2, 100, now() - interval '5 minutes', 12.9, 79.9 from ids $$, '42501', null,
  'driver: cannot upload points to another driver''s trip');
select throws_ok($$ insert into public.trip_points (trip_id, seq, recorded_at, lat, lng)
                   select t1, 101, now() + interval '10 minutes', 12.9, 79.9 from ids $$, '42501', null,
  'driver: cannot upload future-dated points (clock tampering, docs/09 §5)');
select throws_ok($$ insert into public.trip_points (trip_id, seq, recorded_at, lat, lng)
                   select t1, 102, now() - interval '3 hours', 12.9, 79.9 from ids $$, '42501', null,
  'driver: cannot upload points from before the trip started (replay, docs/09 §5)');
select is_empty($$ update public.trip_points set lat = 0 where trip_id = (select t1 from ids) returning 1 $$,
  'driver: cannot edit uploaded points');
select is_empty($$ delete from public.trip_points where trip_id = (select t1 from ids) returning 1 $$,
  'driver: cannot delete uploaded points');

select results_eq($$ select trip_id from public.trip_live $$, $$ select t1 from ids $$, 'driver: sees only own live position');
select throws_ok($$ insert into public.trip_live (trip_id, driver_id, lat, lng, recorded_at)
                   select t2, auth.uid(), 1, 1, now() from ids $$, '42501', null, 'driver: cannot write live positions');

select results_eq($$ select distinct trip_id from public.trip_events $$, $$ select t1 from ids $$,
  'driver: sees only own trip events');
select throws_ok($$ insert into public.trip_events (trip_id, type) select t1, 'approved' from ids $$, '42501', null,
  'driver: cannot forge audit events');

select results_eq($$ select driver_id, verified_trips from public.driver_stats $$,
  $$ values ('7e570000-0000-4000-8000-0000000000d1'::uuid, 3) $$, 'driver: sees only own stats');
select throws_ok($$ insert into public.driver_stats (driver_id, verified_trips) values (auth.uid(), 999) $$, '42501', null,
  'driver: cannot insert stats');
select is_empty($$ update public.driver_stats set verified_trips = 999 returning 1 $$, 'driver: cannot update stats');

select throws_ok($$ select public.verify_trip((select t1 from ids)) $$, '42501', null, 'driver: cannot call verify_trip');
select throws_ok($$ select public.apply_verified_stats((select t1 from ids)) $$, '42501', null,
  'driver: cannot call apply_verified_stats');
select throws_ok($$ select public.sweep_unverified_trips() $$, '42501', null, 'driver: cannot call the sweeper');

select tests.as_postgres();
select results_eq($$ select status::text, tracked_distance_m from public.trips where id = (select t1 from ids) $$,
  $$ values ('in_progress', null::int) $$, 'trip unchanged after the driver''s write attempts');
select is((select verified_trips from public.driver_stats where driver_id = '7e570000-0000-4000-8000-0000000000d1'), 3,
  'stats unchanged after the driver''s write attempts');

-- ---------- owner / shipper (read-only access to their trips) ----------
select tests.as_user('7e570000-0000-4000-8000-00000000000e');
select results_eq($$ select id from public.vehicles $$, $$ select v1 from ids $$, 'owner: sees own vehicles only');
select results_eq($$ select id from public.trips $$, $$ select t1 from ids $$, 'owner: sees trips of own vehicles only');
select is_empty($$ update public.trips set status = 'verified' returning 1 $$, 'owner: cannot update trips');

select tests.as_user('7e570000-0000-4000-8000-00000000000f');
select results_eq($$ select id from public.loads $$, $$ select l1 from ids $$, 'shipper: sees own loads only');
select results_eq($$ select id from public.trips $$, $$ select t1 from ids $$, 'shipper: sees trips of own loads only');
select isnt_empty($$ select 1 from public.trip_points where trip_id = (select t1 from ids) $$,
  'shipper: can read points of own load''s trip');
select is_empty($$ select 1 from public.trip_points where trip_id = (select t2 from ids) $$,
  'shipper: cannot read points of other loads');

-- ---------- anon (no session) ----------
select tests.as_anon();
select is_empty($$ select 1 from public.profiles $$, 'anon: no profiles');
select is_empty($$ select 1 from public.trips $$, 'anon: no trips');
select is_empty($$ select 1 from public.trip_points $$, 'anon: no points');
select is_empty($$ select 1 from public.driver_stats $$, 'anon: no stats');
select is_empty($$ select 1 from public.app_settings $$, 'anon: no settings');
select throws_ok($$ select public.start_trip((select t1 from ids), 12.9, 79.9, 10, null) $$, '42501', null,
  'anon: cannot call start_trip');

-- ---------- admin ----------
select tests.as_user('7e570000-0000-4000-8000-00000000000a');
select ok((select count(*) from public.trips where id in (select t1 from ids union all select t2 from ids)) = 2,
  'admin: sees every driver''s trips');
select ok((select count(*) from public.profiles) >= 5, 'admin: sees all profiles');
select isnt_empty($$ select 1 from public.trip_points where trip_id = (select t2 from ids) $$, 'admin: reads any trip''s points');
select isnt_empty($$ select 1 from public.trip_live where trip_id = (select t2 from ids) $$, 'admin: reads live positions');
select isnt_empty($$ select 1 from public.trip_events where trip_id = (select t2 from ids) $$, 'admin: reads audit events');
select is((select count(*)::int from public.driver_stats
            where driver_id in ('7e570000-0000-4000-8000-0000000000d1', '7e570000-0000-4000-8000-0000000000d2')), 2,
  'admin: reads all drivers'' stats');
select isnt_empty($$ update public.app_settings set value = 20 where key = 'max_gap_minutes' returning 1 $$,
  'admin: can tune verification thresholds');
select lives_ok($$ insert into public.vehicles (registration_no, vehicle_type) values ('TEST V3', '14ft') $$,
  'admin: can create vehicles');
select lives_ok($$ insert into public.loads (pickup_address, pickup_lat, pickup_lng, drop_address, drop_lat, drop_lng)
                  values ('a', 13, 80, 'b', 12, 79) $$, 'admin: can create loads');
select throws_ok($$ insert into public.driver_stats (driver_id, verified_trips) values (auth.uid(), 1) $$, '42501', null,
  'admin: cannot write stats directly (only verification / review)');
select throws_ok($$ select public.verify_trip((select t1 from ids)) $$, '42501', null, 'admin: cannot call verify_trip directly');

-- Known gap ND-13 (pending decision): trips_admin is FOR ALL, so an admin client can set
-- status/km without an audit event. Recorded as TODO so it shows in every run until fixed.
select todo('ND-13: admin trip writes should go through RPCs only', 1);
select is_empty($$ update public.trips set status = 'verified' where id = (select t2 from ids) returning 1 $$,
  'admin: cannot set trip status directly');

select tests.as_postgres();
select * from finish();
rollback;
