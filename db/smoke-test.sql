-- =====================================================================
-- Namma Lorry — N1 smoke test (docs/17)
--
-- Proves the Neon baseline (db/migrations/0001_schema.sql) behaves like
-- the Supabase schema it replaces: verify_trip's distance math on a fixed
-- synthetic trip, and every guard start_trip/admin_review_trip/cancel_trip
-- carried forward (is_active, consent, the advisory-lock race fix,
-- admin-only). Run after db-migrate.mjs, as the role the app connects as:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/smoke-test.sql
--
-- Wrapped in one transaction that always rolls back, so this is safe to
-- run repeatedly against a shared Neon branch — it never leaves fixture
-- rows behind, win or lose. ON_ERROR_STOP=1 means the first failing
-- assertion aborts the script with a non-zero exit code.
-- =====================================================================
begin;

insert into profiles (id, role, full_name, phone, is_active, consent_version) values
  ('smoketest_driver', 'driver', 'Smoke Test Driver', '+911111100001', true, '2026-10-01'),
  ('smoketest_driver_noconsent', 'driver', 'No Consent', '+911111100002', true, null),
  ('smoketest_driver_inactive', 'driver', 'Inactive', '+911111100003', false, '2026-10-01'),
  ('smoketest_admin', 'admin', 'Smoke Test Admin', '+911111100004', true, null);

insert into vehicles (id, registration_no, vehicle_type) values
  ('00000000-0000-0000-0000-000000000001', 'SMOKE-TEST-VEHICLE', '14ft');

-- Pickup/drop 5km apart (roughly north-south), matching docs/08's
-- "normal trip verifies within +-5% of planned distance" scenario. Each
-- trip gets its own load: trips_one_open_per_load allows only one open
-- trip per load, and these three trips are open at the same time.
insert into loads (id, pickup_address, pickup_lat, pickup_lng, pickup_radius_m,
                    drop_address, drop_lat, drop_lng, drop_radius_m, planned_distance_m) values
  ('00000000-0000-0000-0000-000000000002', 'Pickup', 13.0827, 80.2707, 300,
   'Drop', 13.1277, 80.2707, 300, 5000),
  ('00000000-0000-0000-0000-000000000012', 'Pickup', 13.0827, 80.2707, 300,
   'Drop', 13.1277, 80.2707, 300, 5000),
  ('00000000-0000-0000-0000-000000000013', 'Pickup', 13.0827, 80.2707, 300,
   'Drop', 13.1277, 80.2707, 300, 5000);

insert into trips (id, load_id, driver_id, vehicle_id, status) values
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002',
   'smoketest_driver', '00000000-0000-0000-0000-000000000001', 'assigned'),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000012',
   'smoketest_driver_noconsent', '00000000-0000-0000-0000-000000000001', 'assigned'),
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000013',
   'smoketest_driver_inactive', '00000000-0000-0000-0000-000000000001', 'assigned');

-- ---------- 1. is_active gate (migration 0007) ----------
do $$
begin
  perform start_trip('smoketest_driver_inactive', '00000000-0000-0000-0000-000000000005', 13.0827, 80.2707, 10);
  raise exception 'FAIL: start_trip allowed an inactive driver';
exception when others then
  if sqlerrm <> 'FORBIDDEN' then raise exception 'FAIL: expected FORBIDDEN, got %', sqlerrm; end if;
end $$;

-- ---------- 2. Consent gate (migrations 0006/0009/0010) ----------
do $$
begin
  perform start_trip('smoketest_driver_noconsent', '00000000-0000-0000-0000-000000000004', 13.0827, 80.2707, 10);
  raise exception 'FAIL: start_trip allowed a driver with no consent';
exception when others then
  if sqlerrm <> 'CONSENT_REQUIRED' then raise exception 'FAIL: expected CONSENT_REQUIRED, got %', sqlerrm; end if;
end $$;

-- ---------- 3. NULL-position guard (migration 0011) ----------
do $$
begin
  perform start_trip('smoketest_driver', '00000000-0000-0000-0000-000000000003', null, null, 10);
  raise exception 'FAIL: start_trip accepted a fix with no position';
exception when others then
  if sqlerrm <> 'GPS_ACCURACY_TOO_LOW' then raise exception 'FAIL: expected GPS_ACCURACY_TOO_LOW, got %', sqlerrm; end if;
end $$;

-- ---------- 4. Happy path: start_trip ----------
do $$
declare v_status public.trip_status;
begin
  select status into v_status from start_trip(
    'smoketest_driver', '00000000-0000-0000-0000-000000000003', 13.0827, 80.2707, 10);
  if v_status <> 'in_progress' then raise exception 'FAIL: expected in_progress, got %', v_status; end if;
end $$;

-- ---------- 5. Concurrency: a second trip for the same driver (migration 0008) ----------
insert into loads (id, pickup_address, pickup_lat, pickup_lng, pickup_radius_m,
                    drop_address, drop_lat, drop_lng, drop_radius_m, planned_distance_m) values
  ('00000000-0000-0000-0000-000000000006', 'Pickup 2', 13.0, 80.0, 300, 'Drop 2', 13.1, 80.0, 300, 5000);
insert into trips (id, load_id, driver_id, vehicle_id, status) values
  ('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000006',
   'smoketest_driver', '00000000-0000-0000-0000-000000000001', 'assigned');
do $$
begin
  perform start_trip('smoketest_driver', '00000000-0000-0000-0000-000000000007', 13.0, 80.0, 10);
  raise exception 'FAIL: start_trip allowed a second concurrent trip';
exception when others then
  if sqlerrm <> 'ANOTHER_TRIP_ACTIVE' then raise exception 'FAIL: expected ANOTHER_TRIP_ACTIVE, got %', sqlerrm; end if;
end $$;

-- ---------- 6. verify_trip's distance math (the "nobody types a kilometre" boundary) ----------
-- A fixed, internally-consistent 10-minute window: 11 points, 500m apart,
-- 1 minute apart (~30 km/h), summing to ~5000m over a planned 5000m leg.
update trips set
  started_at = '2026-01-01 00:00:00+00', ended_at = '2026-01-01 00:10:30+00',
  end_lat = 13.1277, end_lng = 80.2707, end_accuracy_m = 10
where id = '00000000-0000-0000-0000-000000000003';
insert into trip_points (trip_id, seq, recorded_at, lat, lng, accuracy_m, speed_mps, is_mocked)
select '00000000-0000-0000-0000-000000000003', s,
       timestamp '2026-01-01 00:00:00+00' + ((s - 1) * interval '1 minute'),
       13.0827 + ((s - 1) * (13.1277 - 13.0827) / 10.0),
       80.2707, 10, 8.3, false
from generate_series(1, 11) s;

do $$
declare
  v_status public.trip_status;
  v_distance int;
  v_reasons text[];
begin
  update trips set status = 'completed' where id = '00000000-0000-0000-0000-000000000003';
  v_status := verify_trip('00000000-0000-0000-0000-000000000003');
  select tracked_distance_m, verification_reasons into v_distance, v_reasons
  from trips where id = '00000000-0000-0000-0000-000000000003';

  if v_status <> 'verified' then
    raise exception 'FAIL: expected verified, got % (reasons: %)', v_status, v_reasons;
  end if;
  -- Within +-5% of the planned 5000m leg (docs/08's acceptance bound).
  if v_distance < 4750 or v_distance > 5250 then
    raise exception 'FAIL: tracked_distance_m % outside +-5%% of 5000m', v_distance;
  end if;
end $$;

-- ---------- 7. apply_verified_stats ran (driver_stats updated) ----------
do $$
declare v_trips int; v_distance bigint;
begin
  select verified_trips, verified_distance_m into v_trips, v_distance
  from driver_stats where driver_id = 'smoketest_driver';
  if v_trips <> 1 then raise exception 'FAIL: expected 1 verified trip, got %', v_trips; end if;
  if v_distance < 4750 or v_distance > 5250 then
    raise exception 'FAIL: driver_stats.verified_distance_m % outside +-5%% of 5000m', v_distance;
  end if;
end $$;

-- ---------- 8. Admin-only RPCs reject a non-admin caller ----------
do $$
begin
  perform cancel_trip('smoketest_driver', '00000000-0000-0000-0000-000000000007', 'not an admin');
  raise exception 'FAIL: cancel_trip allowed a non-admin caller';
exception when others then
  if sqlerrm <> 'FORBIDDEN' then raise exception 'FAIL: expected FORBIDDEN, got %', sqlerrm; end if;
end $$;

-- ---------- 9. Admin-only RPCs accept an admin caller ----------
do $$
declare v_status public.trip_status;
begin
  select status into v_status from cancel_trip(
    'smoketest_admin', '00000000-0000-0000-0000-000000000007', 'cleanup');
  if v_status <> 'cancelled' then raise exception 'FAIL: expected cancelled, got %', v_status; end if;
end $$;

select 'N1 smoke test: all checks passed' as result;

rollback;
