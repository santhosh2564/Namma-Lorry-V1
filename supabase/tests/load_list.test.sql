-- 0003 load_list view: derived load status (ND-20) and RLS via security_invoker.
begin;
\ir _helpers.psql
select plan(9);

select tests.create_user('10000000-0000-4000-8000-0000000000a1', '910000000001', 'admin',   'Admin');
select tests.create_user('10000000-0000-4000-8000-0000000000d1', '910000000002', 'driver',  'Driver One');
select tests.create_user('10000000-0000-4000-8000-0000000000d2', '910000000003', 'driver',  'Driver Two');
select tests.create_user('10000000-0000-4000-8000-0000000000c1', '910000000004', 'shipper', 'Shipper');

create temp table ids as select
  tests.create_vehicle('TN 01 AA 0001') as v1,
  tests.create_vehicle('TN 01 AA 0002') as v2,
  tests.create_load() as l_unassigned,
  tests.create_load() as l_assigned,
  tests.create_load() as l_in_trip,
  tests.create_load('10000000-0000-4000-8000-0000000000c1') as l_done,
  tests.create_load() as l_cancelled;
grant select on ids to authenticated;

select tests.create_trip(l_assigned, '10000000-0000-4000-8000-0000000000d1', v1) from ids;
select tests.create_trip(l_in_trip,  '10000000-0000-4000-8000-0000000000d2', v2) from ids;
update public.trips set status = 'in_progress', started_at = now()
  where load_id = (select l_in_trip from ids);
select tests.create_trip(l_done, '10000000-0000-4000-8000-0000000000d1', v2) from ids;
update public.trips set status = 'verified' where load_id = (select l_done from ids);
-- A cancelled trip does not count: the load is unassigned again.
select tests.create_trip(l_cancelled, '10000000-0000-4000-8000-0000000000d2', v1) from ids;
update public.trips set status = 'cancelled' where load_id = (select l_cancelled from ids);

select tests.as_user('10000000-0000-4000-8000-0000000000a1');
select is((select load_status from load_list where id = (select l_unassigned from ids)), 'unassigned', 'no trip → unassigned');
select is((select load_status from load_list where id = (select l_assigned from ids)), 'assigned', 'assigned trip → assigned');
select is((select load_status from load_list where id = (select l_in_trip from ids)), 'in_trip', 'in_progress → in_trip');
select is((select load_status from load_list where id = (select l_done from ids)), 'done', 'verified → done');
select is((select load_status from load_list where id = (select l_cancelled from ids)), 'unassigned', 'cancelled trip ignored');
select is((select driver_name from load_list where id = (select l_assigned from ids)), 'Driver One', 'driver name from latest trip');

select tests.as_user('10000000-0000-4000-8000-0000000000d1');
select is((select count(*)::int from load_list), 2, 'driver sees only loads they have a trip on');

select tests.as_user('10000000-0000-4000-8000-0000000000c1');
select is((select count(*)::int from load_list), 1, 'shipper sees only their own loads');

select tests.as_anon();
select is((select count(*)::int from load_list), 0, 'anon sees nothing');

select * from finish();
rollback;
