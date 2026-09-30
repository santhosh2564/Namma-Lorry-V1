-- =====================================================================
-- Namma Lorry — 12: EXECUTE boundary on the RLS helper functions (0012)
-- Postgres grants EXECUTE on a new function to PUBLIC, so every helper 0001
-- wrote for its policies also reached `anon`. That left a side door:
-- anon has no SELECT policy on app_settings but could read every setting
-- with public.setting(key). Revoking from PUBLIC (and re-granting to
-- authenticated, whose policies evaluate the helpers as the invoking role)
-- closes it. These cases pin both halves: anon is locked out, and a signed-in
-- driver still reads their own data, which only works if the policy
-- predicates still resolve.
--
-- The privilege assertions run as the test runner, not as anon: resolving a
-- function name in the cron schema needs USAGE on that schema, which anon
-- does not have — the very thing that keeps it out of reach today.
-- =====================================================================
begin;

\ir _helpers.psql

select plan(30);

-- ---- fixtures --------------------------------------------------------
select tests.create_user('cf000000-0000-4000-8000-000000000001', '919000009001', 'driver', 'Helper Driver');
select tests.create_user('cf000000-0000-4000-8000-000000000002', '919000009002', 'driver', 'Other Driver');
update public.profiles set consent_version = public.current_consent_version(), consent_at = now()
 where id in ('cf000000-0000-4000-8000-000000000001', 'cf000000-0000-4000-8000-000000000002');
insert into public.vehicles(id, registration_no, vehicle_type) values
  ('cd000000-0000-4000-8000-000000000001', 'HG 00 A 0001', '19ft');
insert into public.loads(id, pickup_address, pickup_lat, pickup_lng, drop_address, drop_lat, drop_lng,
                         pickup_radius_m, drop_radius_m, planned_distance_m)
values ('bd000000-0000-4000-8000-000000000001', 'Pickup', 12.9563, 79.9422,
        'Drop', 12.9165, 79.1325, 500, 500, 88000);
insert into public.trips(id, load_id, driver_id, vehicle_id) values
  ('fd000000-0000-4000-8000-000000000001', 'bd000000-0000-4000-8000-000000000001',
   'cf000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001');
insert into public.driver_stats(driver_id, verified_trips, verified_distance_m)
values ('cf000000-0000-4000-8000-000000000001', 3, 30000);

-- =================== anon is locked out of the helpers ================
select tests.as_anon();

select is((select count(*)::int from public.app_settings), 0,
  'anon reads no app_settings rows (no SELECT policy)');

-- The side door: the table said no, the function said yes.
select throws_ok($$select public.setting('max_gap_minutes')$$,
  '42501', 'permission denied for function setting',
  'anon cannot read a verification threshold through setting()');
select throws_ok($$select public.setting('raw_point_retention_days')$$,
  '42501', 'permission denied for function setting',
  'anon cannot read the retention setting through setting()');
select throws_ok($$select public.current_consent_version()$$,
  '42501', 'permission denied for function current_consent_version',
  'anon cannot read the current consent version');
select throws_ok($$select public.is_admin()$$,
  '42501', 'permission denied for function is_admin', 'anon cannot call is_admin()');
select throws_ok($$select public.my_role()$$,
  '42501', 'permission denied for function my_role', 'anon cannot call my_role()');
select throws_ok($$select public.can_read_trip('fd000000-0000-4000-8000-000000000001')$$,
  '42501', 'permission denied for function can_read_trip', 'anon cannot call can_read_trip()');
select throws_ok($$select public.is_trip_driver_for_load('bd000000-0000-4000-8000-000000000001')$$,
  '42501', 'permission denied for function is_trip_driver_for_load',
  'anon cannot call is_trip_driver_for_load()');
select throws_ok($$select public.is_trip_driver_for_vehicle('cd000000-0000-4000-8000-000000000001')$$,
  '42501', 'permission denied for function is_trip_driver_for_vehicle',
  'anon cannot call is_trip_driver_for_vehicle()');
select throws_ok($$select public.is_vehicle_owner('cd000000-0000-4000-8000-000000000001')$$,
  '42501', 'permission denied for function is_vehicle_owner', 'anon cannot call is_vehicle_owner()');
select throws_ok($$select public.is_load_shipper('bd000000-0000-4000-8000-000000000001')$$,
  '42501', 'permission denied for function is_load_shipper', 'anon cannot call is_load_shipper()');

-- =================== the grants themselves ============================
set local role postgres;

select is((select has_function_privilege('anon', 'public.setting(text)', 'execute')), false,
  'anon holds no EXECUTE on setting()');
select is((select has_function_privilege('anon', 'public.is_admin()', 'execute')), false,
  'anon holds no EXECUTE on is_admin()');
select is((select has_function_privilege('anon', 'public.can_read_trip(uuid)', 'execute')), false,
  'anon holds no EXECUTE on can_read_trip()');
select is((select has_function_privilege('anon', 'public.current_consent_version()', 'execute')), false,
  'anon holds no EXECUTE on current_consent_version()');

-- Trigger functions were never callable directly, and now hold no privilege.
select is((select has_function_privilege('anon', 'public.handle_new_user()', 'execute')), false,
  'anon holds no EXECUTE on handle_new_user()');
select is((select has_function_privilege('anon', 'public.on_trip_point_insert()', 'execute')), false,
  'anon holds no EXECUTE on on_trip_point_insert()');

-- pg_cron: EXECUTE came from PUBLIC, and it means "run this SQL on this
-- database". Unreachable today only because the schema grant is absent too;
-- a client-held EXECUTE is not a privilege this app's clients should carry.
select is((select has_function_privilege('authenticated', 'cron.schedule(text,text,text)', 'execute')), false,
  'authenticated holds no EXECUTE on cron.schedule (schedule arbitrary SQL)');
select is((select has_function_privilege('authenticated', 'cron.schedule(text,text)', 'execute')), false,
  'authenticated holds no EXECUTE on the 2-argument cron.schedule');
select is((select has_function_privilege('anon', 'cron.schedule(text,text,text)', 'execute')), false,
  'anon holds no EXECUTE on cron.schedule');
select is((select has_function_privilege('authenticated', 'cron.unschedule(name)', 'execute')), false,
  'authenticated holds no EXECUTE on cron.unschedule');
select is((select has_function_privilege('authenticated', 'cron.unschedule(bigint)', 'execute')), false,
  'authenticated holds no EXECUTE on cron.unschedule(bigint)');
select is((select has_function_privilege('authenticated', 'cron.alter_job(bigint,text,text,text,text,boolean)', 'execute')), false,
  'authenticated holds no EXECUTE on cron.alter_job');

-- How many rows app_settings has, read by the runner. Compared rather than
-- hard-coded so adding a threshold (0006, 0009 both did) does not fail this.
select count(*)::int as settings_rows from public.app_settings \gset

-- =================== authenticated keeps everything ====================
-- The other half of the fix. Policies are `to authenticated` and evaluate as
-- the invoking role, so if these stopped resolving, every read would return
-- nothing and the app would silently show empty screens.
select tests.as_user('cf000000-0000-4000-8000-000000000001');

select ok(has_function_privilege('authenticated', 'public.setting(text)', 'execute'),
  'authenticated keeps EXECUTE on setting()');
select is(public.setting('max_gap_minutes'), 15::numeric,
  'a signed-in driver can still read a verification threshold');
select is(public.is_admin(), false,
  'is_admin() still resolves for a driver (policies depend on it)');
select is((select count(*)::int from public.trips), 1,
  'the trips policy still resolves: a driver reads their own trip');
select is((select count(*)::int from public.driver_stats), 1,
  'the driver_stats policy still resolves: a driver reads their own stats');
select is((select count(*)::int from public.loads), 1,
  'the loads policy still resolves through is_trip_driver_for_load()');
select is((select count(*)::int from public.app_settings), :settings_rows,
  'authenticated still reads every app_settings row (settings_read policy)');

select * from finish();
rollback;