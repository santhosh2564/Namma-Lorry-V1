-- RLS coverage for every public table (CLAUDE.md rule 9, docs/09 §4, M12a security review).
-- The first test fails when a table is added without being listed (and tested) here.
begin;
\ir _helpers.psql
select plan(44);

-- ---------- 0. Every table is covered and has RLS on ----------
select set_eq(
  $$ select tablename::text from pg_tables where schemaname = 'public' $$,
  array['app_settings', 'profiles', 'vehicles', 'loads', 'trips', 'trip_points', 'trip_live',
        'trip_events', 'driver_stats'],
  'every public table is listed in rls.test.sql');
select is_empty(
  $$ select tablename from pg_tables where schemaname = 'public' and not rowsecurity $$,
  'RLS is enabled on every public table');

-- ---------- fixtures ----------
select tests.create_user('30000000-0000-4000-8000-0000000000a1', '930000000001', 'admin',   'Admin');
select tests.create_user('30000000-0000-4000-8000-0000000000d1', '930000000002', 'driver',  'Driver One');
select tests.create_user('30000000-0000-4000-8000-0000000000d2', '930000000003', 'driver',  'Driver Two');
select tests.create_user('30000000-0000-4000-8000-0000000000e1', '930000000004', 'owner',   'Owner');
select tests.create_user('30000000-0000-4000-8000-0000000000c1', '930000000005', 'shipper', 'Shipper');

create temp table f as select
  tests.create_vehicle('TN 09 RL 0001', '30000000-0000-4000-8000-0000000000e1') as v1,
  tests.create_vehicle('TN 09 RL 0002') as v2,
  tests.create_load('30000000-0000-4000-8000-0000000000c1') as l1,
  tests.create_load() as l2;
alter table f add column t1 uuid, add column t2 uuid;
update f set t1 = tests.completed_trip('30000000-0000-4000-8000-0000000000d1', v1);
update f set t2 = tests.create_trip(l2, '30000000-0000-4000-8000-0000000000d2', v2);
-- completed_trip made its own load; hand it to the shipper for the shipper checks.
update public.loads set shipper_id = '30000000-0000-4000-8000-0000000000c1'
 where id = (select load_id from public.trips where id = (select t1 from f));
insert into public.trip_events (trip_id, type) select t1, 'ended' from f;
insert into public.trip_live (trip_id, driver_id, lat, lng, recorded_at)
  select t1, '30000000-0000-4000-8000-0000000000d1', 12.9, 79.9, now() from f;
insert into public.driver_stats (driver_id, verified_trips, verified_distance_m)
  values ('30000000-0000-4000-8000-0000000000d1', 1, 1000), ('30000000-0000-4000-8000-0000000000d2', 2, 2000)
  on conflict (driver_id) do update set verified_trips = excluded.verified_trips;
grant select on f to authenticated, anon;

-- ---------- anon: nothing ----------
select tests.as_anon();
select is((select count(*)::int from app_settings), 0, 'anon: app_settings hidden');
select is((select count(*)::int from profiles), 0, 'anon: profiles hidden');
select is((select count(*)::int from vehicles), 0, 'anon: vehicles hidden');
select is((select count(*)::int from loads), 0, 'anon: loads hidden');
select is((select count(*)::int from trips), 0, 'anon: trips hidden');
select is((select count(*)::int from trip_points), 0, 'anon: trip_points hidden');
select is((select count(*)::int from trip_live), 0, 'anon: trip_live hidden');
select is((select count(*)::int from trip_events), 0, 'anon: trip_events hidden');
select is((select count(*)::int from driver_stats), 0, 'anon: driver_stats hidden');

-- ---------- driver one ----------
select tests.as_user('30000000-0000-4000-8000-0000000000d1');
select ok((select count(*) from app_settings) > 0, 'driver: reads settings');
select is_empty($$ update app_settings set value = 0 returning key $$, 'driver: cannot change settings');
select is((select count(*)::int from profiles), 1, 'driver: sees only own profile');
select is_empty($$ update profiles set role = 'admin' where id = auth.uid() returning id $$,
              'driver: cannot escalate own role');
select is((select count(*)::int from vehicles), 1, 'driver: sees only the vehicle on their trip');
select is((select count(*)::int from loads), 1, 'driver: sees only the load on their trip');
select is((select count(*)::int from trips), 1, 'driver: sees only own trips');
select is_empty($$ update trips set status = 'verified', tracked_distance_m = 999999 returning id $$,
              'driver: cannot update trips (scenario 9)');
select throws_ok($$ insert into trips (load_id, driver_id, vehicle_id) select l2, auth.uid(), v2 from f $$,
                 '42501', null, 'driver: cannot insert trips');
select is_empty($$ delete from trips returning id $$, 'driver: cannot delete trips');
select ok((select count(*) from trip_points) > 0, 'driver: reads own trip points');
select throws_ok($$ insert into trip_points (trip_id, seq, recorded_at, lat, lng)
                    select t2, 1, now(), 12.9, 79.9 from f $$,
                 '42501', null, 'driver: cannot insert points into another driver''s trip');
select is_empty($$ update trip_points set lat = 0 returning seq $$, 'driver: cannot edit points');
select is((select count(*)::int from trip_live), 1, 'driver: reads own live row');
select is((select count(*)::int from trip_events), 1, 'driver: reads own trip events');
select throws_ok($$ insert into trip_events (trip_id, type) select t1, 'verified' from f $$,
                 '42501', null, 'driver: cannot write trip events');
select is((select count(*)::int from driver_stats), 1, 'driver: sees only own stats');
select is_empty($$ update driver_stats set verified_trips = 999 returning driver_id $$,
              'driver: cannot edit stats');
select throws_ok($$ insert into driver_stats (driver_id, verified_trips) values (auth.uid(), 5)
                    on conflict (driver_id) do nothing $$,
                 '42501', null, 'driver: cannot insert stats');

-- ---------- driver two: nothing of driver one's ----------
select tests.as_user('30000000-0000-4000-8000-0000000000d2');
select is((select count(*)::int from trip_points where trip_id = (select t1 from f)), 0,
          'other driver: cannot read someone else''s points');
select is((select count(*)::int from trip_live), 0, 'other driver: cannot read someone else''s live row');

-- ---------- owner ----------
select tests.as_user('30000000-0000-4000-8000-0000000000e1');
select is((select count(*)::int from vehicles), 1, 'owner: sees only own vehicle');
select is((select count(*)::int from trips), 1, 'owner: sees trips on own vehicle');
select is((select count(*)::int from driver_stats), 0, 'owner: no driver stats');

-- ---------- shipper ----------
select tests.as_user('30000000-0000-4000-8000-0000000000c1');
select is((select count(*)::int from loads), 2, 'shipper: sees only own loads');
select is((select count(*)::int from trips), 1, 'shipper: sees trips on own loads');
select is_empty($$ update loads set drop_address = 'x' returning id $$, 'shipper: cannot edit loads');

-- ---------- admin (0006: trips written only through RPCs) ----------
select tests.as_user('30000000-0000-4000-8000-0000000000a1');
select is((select count(*)::int from profiles where id::text like '30000000%'), 5, 'admin: reads all profiles');
select is((select count(*)::int from driver_stats where driver_id::text like '30000000%'), 2, 'admin: reads all stats');
select is_empty($$ update trips set status = 'verified' returning id $$,
              'admin: cannot update trip status directly (ND-13)');
select is_empty($$ delete from trips returning id $$, 'admin: cannot delete trips');
select lives_ok($$ insert into trips (load_id, driver_id, vehicle_id)
                   select l1, '30000000-0000-4000-8000-0000000000d2', v1 from f $$,
                'admin: can assign a trip');
select throws_ok($$ insert into trips (load_id, driver_id, vehicle_id, status, tracked_distance_m)
                    select l2, '30000000-0000-4000-8000-0000000000d1', v2, 'verified', 1000 from f $$,
                 '42501', null, 'admin: cannot insert a pre-verified trip');

select * from finish();
rollback;
