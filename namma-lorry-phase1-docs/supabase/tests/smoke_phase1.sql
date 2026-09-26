-- Phase 1 smoke test — run ONLY on a local/dev database (inserts fake users & trips).
-- psql "$DB_URL" -f supabase/tests/smoke_phase1.sql   (expected results in comments / docs/10-test-plan.md)
-- Scenario A: clean Chennai→Vellore trip → verified. Scenario B: mocked point + late upload → needs_review → admin approves.
\set ON_ERROR_STOP 0
-- setup as superuser
insert into auth.users(id, phone) values
 ('00000000-0000-0000-0000-00000000000a','+910000000001'),
 ('00000000-0000-0000-0000-00000000000d','+910000000002');
update profiles set role='admin', full_name='Admin' where id='00000000-0000-0000-0000-00000000000a';
update profiles set full_name='Driver D' where id='00000000-0000-0000-0000-00000000000d';
insert into vehicles(id, registration_no, vehicle_type) values ('00000000-0000-0000-0000-0000000000f1','TN01AB1234','19ft');
-- Chennai (13.0827,80.2707) -> Vellore (12.9165,79.1325) ~ 125 km road
insert into loads(id, pickup_address,pickup_lat,pickup_lng,drop_address,drop_lat,drop_lng,planned_distance_m)
 values ('00000000-0000-0000-0000-0000000000b1','Chennai',13.0827,80.2707,'Vellore',12.9165,79.1325,140000);
insert into trips(id, load_id, driver_id, vehicle_id) values
 ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000000d','00000000-0000-0000-0000-0000000000f1');
select load_code from loads;

-- act as driver
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
\echo '--- outside pickup should fail'
select status from start_trip('00000000-0000-0000-0000-0000000000c1', 12.95, 79.5, 10, null);
\echo '--- driver tries direct update (should affect 0 rows)'
update trips set status='verified' where id='00000000-0000-0000-0000-0000000000c1';
\echo '--- driver tries to write stats (should fail)'
insert into driver_stats(driver_id, verified_trips) values ('00000000-0000-0000-0000-00000000000d', 999);
\echo '--- start inside pickup'
select status from start_trip('00000000-0000-0000-0000-0000000000c1', 13.0830, 80.2705, 12, '{"os":"android"}');
-- simulate points: straight-ish line Chennai->Vellore over 3h, one point every 30 s = 360 pts, compressed start time
reset role;
update trips set started_at = now() - interval '3 hours' where id='00000000-0000-0000-0000-0000000000c1';
set role authenticated;
insert into trip_points(trip_id, seq, recorded_at, lat, lng, accuracy_m, speed_mps)
select '00000000-0000-0000-0000-0000000000c1', g,
  now() - interval '3 hours' + (g * interval '30 seconds'),
  13.0827 + (12.9165-13.0827)*g/360.0 + 0.01*sin(g/20.0),
  80.2707 + (79.1325-80.2707)*g/360.0, 15, 12
from generate_series(1,360) g;
select count(*) as live_rows from trip_live;
\echo '--- end trip'
select status, tracked_distance_m, verification_reasons from end_trip('00000000-0000-0000-0000-0000000000c1', 12.9166, 79.1326, 10, now(), 360);
select * from driver_stats;
\echo '--- points after end beyond window should fail'
insert into trip_points(trip_id, seq, recorded_at, lat, lng) values ('00000000-0000-0000-0000-0000000000c1', 999, now()+interval '10 minutes', 13,80);
reset role;
select type from trip_events order by id;

\set ON_ERROR_STOP 0
insert into loads(id, pickup_address,pickup_lat,pickup_lng,drop_address,drop_lat,drop_lng,planned_distance_m)
 values ('00000000-0000-0000-0000-0000000000b2','Chennai',13.0827,80.2707,'Vellore',12.9165,79.1325,140000);
insert into trips(id, load_id, driver_id, vehicle_id) values
 ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-00000000000d','00000000-0000-0000-0000-0000000000f1');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false) \g /dev/null
select status from start_trip('00000000-0000-0000-0000-0000000000c2', 13.0830, 80.2705, 12, null);
reset role; update trips set started_at = now() - interval '2 hours' where id='00000000-0000-0000-0000-0000000000c2'; set role authenticated;
-- only first 100 of 240 points uploaded, with a teleport and a mocked point, gap
insert into trip_points(trip_id, seq, recorded_at, lat, lng, accuracy_m, is_mocked)
select '00000000-0000-0000-0000-0000000000c2', g, now() - interval '2 hours' + g*interval '30 seconds',
  13.0827 - 0.001*g, 80.2707 - 0.004*g, 10, g = 50 from generate_series(1,100) g;
\echo '--- end with 240 expected, only 100 received -> stays completed'
select status from end_trip('00000000-0000-0000-0000-0000000000c2', 12.9166, 79.1326, 10, now(), 240);
\echo '--- upload remaining (drives trigger verify)'
insert into trip_points(trip_id, seq, recorded_at, lat, lng, accuracy_m)
select '00000000-0000-0000-0000-0000000000c2', g, now() - interval '2 hours' + g*interval '30 seconds',
  13.0827 - 0.0007*g, 80.2707 - 0.0047*g, 10 from generate_series(101,240) g;
select status, tracked_distance_m, verification_reasons, verification_metrics from trips where id='00000000-0000-0000-0000-0000000000c2';
\echo '--- driver tries admin review (forbidden)'
select status from admin_review_trip('00000000-0000-0000-0000-0000000000c2', true, 'x');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) \g /dev/null
select status from admin_review_trip('00000000-0000-0000-0000-0000000000c2', true, 'Checked with shipper: delivered');
select verified_trips, verified_distance_m from driver_stats;
\echo '--- admin reads all trips'
select count(*) from trips;
reset role;
