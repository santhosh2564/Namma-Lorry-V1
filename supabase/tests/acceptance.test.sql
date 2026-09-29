-- Acceptance scenarios, docs/10-test-plan.md §4 — DB level (M12b).
-- Trips run through the real RPCs (start_trip / end_trip / admin_review_trip) and point
-- uploads go through RLS as the driver, along the real routes in test/gpx/routes.json.
-- Only time is simulated: start_trip stamps started_at = now(), so the test backdates it
-- (as postgres) to replay a trip that began hours ago. Scenario 9 lives in rls.test.sql;
-- the true two-session race for scenario 10 is test/db/start-trip-race.sh.
begin;
\ir _helpers.psql
select * from no_plan();

-- ---------- actors: one driver + vehicle per scenario, one admin ----------
select tests.create_user('5c000000-0000-4000-8000-0000000000aa', '919200000000', 'admin', 'Acceptance Admin');
select tests.create_user(('5c000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
                         '9192000000' || lpad(n::text, 2, '0'), 'driver', 'Scenario ' || n)
from generate_series(1, 13) n;

create temp table sc (n int primary key, driver uuid, vehicle uuid, load uuid, trip uuid, route text);
insert into sc (n, driver, vehicle)
select n, ('5c000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, tests.create_vehicle('ACC ' || n)
from generate_series(1, 13) n;
grant select on sc to authenticated;

create function tests.t(p_n int) returns uuid language sql stable as $$ select trip from sc where n = p_n $$;
create function tests.d(p_n int) returns uuid language sql stable as $$ select driver from sc where n = p_n $$;
create function tests.status(p_n int) returns text language sql stable as $$
  select status::text from public.trips where id = tests.t(p_n) $$;
create function tests.reasons(p_n int) returns text[] language sql stable as $$
  select verification_reasons from public.trips where id = tests.t(p_n) $$;

-- Load + assigned trip along a route for scenario n.
create function tests.assign(p_n int, p_route text, p_planned int default null) returns uuid language plpgsql as $$
declare v_load uuid; v_trip uuid;
begin
  v_load := tests.route_load(p_route, p_planned);
  select tests.create_trip(v_load, driver, vehicle) into v_trip from sc where n = p_n;
  update sc set load = v_load, trip = v_trip, route = p_route where n = p_n;
  return v_trip;
end $$;

-- Driver starts at route fraction f; the trip is then backdated to have begun p_ago ago.
create function tests.start(p_n int, p_ago interval, f double precision default 0) returns text language plpgsql as $$
declare pos record; v_status text;
begin
  select * into pos from tests.route_at((select route from sc where n = p_n), f);
  perform tests.as_user(tests.d(p_n));
  select status::text into v_status from public.start_trip(tests.t(p_n), pos.lat, pos.lng, 10, '{"os":"android"}');
  perform tests.as_postgres();
  update public.trips set started_at = now() - p_ago where id = tests.t(p_n);
  return v_status;
end $$;

-- Driver taps End at route fraction f (device time now() - p_ago) with p_expected recorded points.
create function tests.finish(p_n int, p_expected int, f double precision default 1,
                             p_ago interval default interval '0') returns text language plpgsql as $$
declare pos record; v_status text;
begin
  select * into pos from tests.route_at((select route from sc where n = p_n), f);
  perform tests.as_user(tests.d(p_n));
  select status::text into v_status from public.end_trip(tests.t(p_n), pos.lat, pos.lng, 10, now() - p_ago, p_expected);
  perform tests.as_postgres();
  return v_status;
end $$;

-- Driver uploads (through RLS).
create function tests.upload(p_n int, p_start timestamptz, p_total int, p_from int, p_to int,
                             p_noise_m double precision default 5, p_end_fraction double precision default 1,
                             p_mock_seq int default null, p_accuracy real default 8, p_seq_offset int default 0,
                             p_step interval default interval '10 seconds') returns int language plpgsql as $$
declare v int;
begin
  perform tests.as_user(tests.d(p_n));
  v := tests.upload_route(tests.t(p_n), (select route from sc where n = p_n), p_start, p_step, p_total,
                          p_from, p_to, p_noise_m, p_end_fraction, null, null, p_mock_seq, p_accuracy, p_seq_offset);
  perform tests.as_postgres();
  return v;
end $$;
grant execute on all functions in schema tests to authenticated;

-- =====================================================================
-- Scenario 1 — normal trip, network throughout → verified, km within ±5 % of planned
-- =====================================================================
-- 1a Hosur → Peenya, 2 h, a fix every 10 s with ~5 m jitter, plus 10 bad-accuracy fixes
--    (120 m, 800 m off-route) that must be ignored for distance.
select tests.assign(1, 'hosur-peenya');
select is(tests.start(1, interval '2 hours'), 'in_progress', 'S1a: start at the pickup');
select is(tests.upload(1, now() - interval '2 hours', 720, 1, 99), 99, 'S1a: first batch uploads');
select is(tests.upload(1, now() - interval '2 hours', 720, 100, 109, 800, 1, null, 120), 10, 'S1a: 10 poor-accuracy fixes upload');
select is(tests.upload(1, now() - interval '2 hours', 720, 110, 720), 611, 'S1a: remaining batches upload');
select is(tests.finish(1, 720), 'verified', 'S1a: end at the drop → verified immediately');
select is(tests.reasons(1), '{}'::text[], 'S1a: no reasons');
select ok(abs(t.tracked_distance_m::numeric / l.planned_distance_m - 1) <= 0.05,
          format('S1a: tracked %s m within ±5 %% of planned %s m', t.tracked_distance_m, l.planned_distance_m))
from public.trips t join public.loads l on l.id = t.load_id where t.id = tests.t(1);
select results_eq($$ select verified_trips, verified_distance_m from public.driver_stats where driver_id = tests.d(1) $$,
                  $$ select 1, tracked_distance_m::bigint from public.trips where id = tests.t(1) $$,
                  'S1a: driver stats +1 trip and + tracked km');
select results_eq($$ select type from public.trip_events where trip_id = tests.t(1) order by id $$,
                  $$ values ('started'), ('ended'), ('verified') $$, 'S1a: audit trail started → ended → verified');

-- 1b Sriperumbudur → Coimbatore with the seeded planned distance (512 km), 9 h, a fix every 30 s.
select tests.assign(2, 'sriperumbudur-coimbatore', 512000);
select is(tests.start(2, interval '9 hours'), 'in_progress', 'S1b: start at SIPCOT Sriperumbudur');
select is(tests.upload(2, now() - interval '9 hours', 1080, 1, 1080, 5, 1, null, 8, 0, interval '30 seconds'), 1080,
          'S1b: 1,080 fixes upload');
select is(tests.finish(2, 1080), 'verified', 'S1b: long-haul trip verifies');
select cmp_ok((select tracked_distance_m from public.trips where id = tests.t(2)), '>', 400000,
              'S1b: tracked distance is the full corridor (> 400 km)');

-- 1c Regression for the seed (found in M12b): DESIGN.md's 41 km planned distance for
--    Hosur → Peenya is shorter than any real road (~60–66 km). A genuine trip is then
--    flagged DISTANCE_TOO_LONG (> 1.6 × planned). seed.sql now uses a realistic value.
select tests.assign(13, 'hosur-peenya', 41000);
select tests.start(13, interval '2 hours');
select tests.upload(13, now() - interval '2 hours', 720, 1, 720);
select is(tests.finish(13, 720), 'needs_review', 'S1c: planned 41 km vs a 66 km corridor → needs_review');
select is(tests.reasons(13), array['DISTANCE_TOO_LONG'], 'S1c: DISTANCE_TOO_LONG — planned distance must come from the real route');

-- =====================================================================
-- Scenario 2 — 20 min airplane mode mid-trip → all points arrive, verified
-- =====================================================================
select tests.assign(3, 'hosur-peenya');
select tests.start(3, interval '2 hours');
select tests.upload(3, now() - interval '2 hours', 720, 1, 300);            -- online
-- offline for slots 301..420 (20 min): queued on the phone. On reconnect the newest
-- live fixes arrive before the retried offline batch.
select tests.upload(3, now() - interval '2 hours', 720, 421, 720);
select tests.upload(3, now() - interval '2 hours', 720, 301, 420);
select is((select count(*)::int from public.trip_points where trip_id = tests.t(3)), 720, 'S2: all 720 points on the server');
select is((select recorded_at from public.trip_live where trip_id = tests.t(3)),
          now() - interval '2 hours' + 720 * interval '10 seconds',
          'S2: live position not dragged back by the late offline batch');
select is(tests.finish(3, 720), 'verified', 'S2: verified');
select is(tests.reasons(3), '{}'::text[], 'S2: no TRACKING_GAP / MISSING_POINTS');
select cmp_ok((select (verification_metrics ->> 'max_gap_s')::numeric from public.trips where id = tests.t(3)),
              '<=', 10::numeric, 'S2: no gap in the stored track (max gap 10 s)');

-- =====================================================================
-- Scenario 3 — end while offline, reconnect 1 h later → completed → verified automatically
-- =====================================================================
-- 3a the phone flushes everything, then calls end_trip with the device end time.
select tests.assign(4, 'hosur-peenya');
select tests.start(4, interval '3 hours');
select tests.upload(4, now() - interval '3 hours', 720, 1, 720);
select is(tests.finish(4, 720, 1, interval '1 hour'), 'verified', 'S3a: late end_trip with all points → verified');
select is((select ended_at from public.trips where id = tests.t(4)), now() - interval '1 hour',
          'S3a: ended_at is the device time End was tapped, not the sync time');
-- 3b end_trip reaches the server before the queue has finished flushing.
select tests.assign(5, 'hosur-peenya');
select tests.start(5, interval '3 hours');
select tests.upload(5, now() - interval '3 hours', 720, 1, 500);
select is(tests.finish(5, 720, 1, interval '1 hour'), 'completed', 'S3b: 500 of 720 received → completed (verifying)');
select tests.upload(5, now() - interval '3 hours', 720, 501, 720);
select is(tests.status(5), 'verified', 'S3b: last upload triggers verification → verified');
select results_eq($$ select type from public.trip_events where trip_id = tests.t(5) order by id $$,
                  $$ values ('started'), ('ended'), ('verified') $$, 'S3b: verified exactly once');

-- =====================================================================
-- Scenario 4 — try Start 3 km from pickup → blocked, distance shown
-- =====================================================================
select tests.assign(6, 'hosur-peenya');
create temp table s4 as
select pos.lat, pos.lng,
       round(extensions.st_distance(extensions.st_setsrid(extensions.st_makepoint(pos.lng, pos.lat), 4326)::extensions.geography,
                                    l.pickup_geog))::int as metres
from tests.route_at('hosur-peenya', 3000 / tests.route_length_m('hosur-peenya')) pos, public.loads l
where l.id = (select load from sc where n = 6);
grant select on s4 to authenticated;
select cmp_ok((select metres from s4), '>', 2500, 'S4: test position is ~3 km from the pickup');
select tests.as_user(tests.d(6));
select throws_ok(format($$ select public.start_trip(%L, %s, %s, 10, null) $$, tests.t(6), (select lat from s4), (select lng from s4)),
                 'P0001', 'OUTSIDE_PICKUP:' || (select metres from s4),
                 'S4: start refused with OUTSIDE_PICKUP:<metres> (app shows "You are X km from pickup")');
select tests.as_postgres();
select is(tests.status(6), 'assigned', 'S4: trip still assigned');
select is_empty($$ select 1 from public.trip_events where trip_id = tests.t(6) $$, 'S4: nothing logged');

-- =====================================================================
-- Scenario 5 — end 2 km before the drop → needs_review END_OUTSIDE_DROP
-- =====================================================================
select tests.assign(7, 'hosur-peenya');
select tests.start(7, interval '2 hours');
select tests.upload(7, now() - interval '2 hours', 720, 1, 720, 5,
                    1 - 2000 / tests.route_length_m('hosur-peenya'));
select is(tests.finish(7, 720, 1 - 2000 / tests.route_length_m('hosur-peenya')), 'needs_review', 'S5: needs_review');
select is(tests.reasons(7), array['END_OUTSIDE_DROP'], 'S5: END_OUTSIDE_DROP is the only reason');

-- =====================================================================
-- Scenario 6 — fake GPS app → needs_review MOCK_LOCATION
-- =====================================================================
select tests.assign(8, 'hosur-peenya');
select tests.start(8, interval '2 hours');
select tests.upload(8, now() - interval '2 hours', 720, 1, 720, 5, 1, 360);
select is(tests.finish(8, 720), 'needs_review', 'S6: needs_review');
select is(tests.reasons(8), array['MOCK_LOCATION'], 'S6: MOCK_LOCATION is the only reason');
select is((select (verification_metrics ->> 'mocked')::int from public.trips where id = tests.t(8)), 1, 'S6: 1 mocked point counted');

-- =====================================================================
-- Scenario 7 — app force-stopped 30 min → needs_review TRACKING_GAP; admin can approve
-- =====================================================================
select tests.assign(9, 'hosur-peenya');
select tests.start(9, interval '2 hours');
select tests.upload(9, now() - interval '2 hours', 720, 1, 300);                  -- seq 1..300
select tests.upload(9, now() - interval '2 hours', 720, 481, 720, 5, 1, null, 8, 180); -- killed 30 min; seq 301..540
select is(tests.finish(9, 540), 'needs_review', 'S7: needs_review');
select is(tests.reasons(9), array['TRACKING_GAP'], 'S7: TRACKING_GAP is the only reason (no MISSING_POINTS: seq did not advance while killed)');
select tests.as_user('5c000000-0000-4000-8000-0000000000aa');
select is((select status::text from public.admin_review_trip(tests.t(9), true, 'Phone restarted; corridor matches the route')),
          'verified', 'S7: admin approves → verified');
select tests.as_postgres();
select is((select verified_trips from public.driver_stats where driver_id = tests.d(9)), 1, 'S7: approved trip counts once');

-- =====================================================================
-- Scenario 8 — phone never reconnects after end → sweeper after 6 h → MISSING_POINTS
-- =====================================================================
select tests.assign(10, 'hosur-peenya');
select tests.start(10, interval '9 hours');
select tests.upload(10, now() - interval '9 hours', 720, 1, 200);
select is(tests.finish(10, 720, 1, interval '7 hours'), 'completed', 'S8: end_trip got through with 200 of 720 points');
-- control: a trip that ended only 5 h ago must wait
select tests.assign(11, 'hosur-peenya');
select tests.start(11, interval '7 hours');
select tests.upload(11, now() - interval '7 hours', 720, 1, 200);
select tests.finish(11, 720, 1, interval '5 hours');
select ok(exists (select 1 from cron.job where jobname = 'sweep-unverified-trips' and schedule = '*/15 * * * *'),
          'S8: sweeper scheduled every 15 min');
select lives_ok($$ select public.sweep_unverified_trips() $$, 'S8: sweeper runs');
select is(tests.status(10), 'needs_review', 'S8: trip ended > 6 h ago is verified anyway → needs_review');
select ok('MISSING_POINTS' = any (tests.reasons(10)), 'S8: MISSING_POINTS flagged');
select is(tests.status(11), 'completed', 'S8: trip ended 5 h ago still waits for its points');
select lives_ok($$ select public.sweep_unverified_trips() $$, 'S8: second sweep');
select is((select count(*)::int from public.trip_events where trip_id = tests.t(10) and type = 'needs_review'), 1,
          'S8: sweeping again does not re-verify');

-- Gap found in M12b: if end_trip never reaches the server, the trip stays in_progress
-- forever (the sweeper only looks at completed trips) and the driver can never start
-- another trip (ANOTHER_TRIP_ACTIVE). Needs a decision — see PHASE1_TASKS ND-25.
select tests.assign(12, 'hosur-peenya');
select tests.start(12, interval '30 hours');
select tests.upload(12, now() - interval '30 hours', 720, 1, 100);
select public.sweep_unverified_trips();
select todo('ND-25: stale in_progress trips (no end_trip, no points for > grace) are not closed', 1);
select isnt(tests.status(12), 'in_progress', 'S8b: a trip abandoned without end_trip is eventually closed for review');

-- =====================================================================
-- Scenario 10 — two trips started → the second gets ANOTHER_TRIP_ACTIVE
-- =====================================================================
select tests.assign(11, 'hosur-peenya');  -- driver 11 (its S8 trip is completed, not active): trip A
create temp table s10 as select tests.t(11) as a, tests.create_trip(tests.route_load('hosur-peenya'), tests.d(11), (select vehicle from sc where n = 11)) as b;
grant select on s10 to authenticated;
select is(tests.start(11, interval '1 minute'), 'in_progress', 'S10: first trip starts');
select tests.as_user(tests.d(11));
select throws_ok(format($$ select public.start_trip(%L, 12.7392, 77.8233, 10, null) $$, (select b from s10)),
                 'P0001', 'ANOTHER_TRIP_ACTIVE', 'S10: second trip refused with ANOTHER_TRIP_ACTIVE');
select tests.as_postgres();
select is((select status::text from public.trips where id = (select b from s10)), 'assigned', 'S10: second trip untouched');

-- =====================================================================
-- Scenario 12 — admin approves a flagged trip → verified, stats +1 once, event logged
-- =====================================================================
-- Uses the S5 trip (needs_review, END_OUTSIDE_DROP).
select tests.as_user(tests.d(7));
select throws_ok(format($$ select public.admin_review_trip(%L, true, 'mine') $$, tests.t(7)), '42501', 'FORBIDDEN',
                 'S12: the driver cannot approve their own trip');
select tests.as_user('5c000000-0000-4000-8000-0000000000aa');
select throws_ok(format($$ select public.admin_review_trip(%L, true, '   ') $$, tests.t(7)), 'P0001', 'NOTE_REQUIRED',
                 'S12: a note is mandatory');
select is((select status::text from public.admin_review_trip(tests.t(7), true, 'Yard gate is 2 km before the pin')),
          'verified', 'S12: approve → verified');
select throws_ok(format($$ select public.admin_review_trip(%L, true, 'again') $$, tests.t(7)), 'P0001', 'TRIP_NOT_IN_REVIEW',
                 'S12: approving twice is refused');
select tests.as_postgres();
select results_eq(
  $$ select verified_trips, verified_distance_m from public.driver_stats where driver_id = tests.d(7) $$,
  $$ select 1, tracked_distance_m::bigint from public.trips where id = tests.t(7) $$,
  'S12: stats +1 trip, + tracked km — exactly once');
select results_eq(
  $$ select reviewed_by, review_note, verified_at is not null from public.trips where id = tests.t(7) $$,
  $$ values ('5c000000-0000-4000-8000-0000000000aa'::uuid, 'Yard gate is 2 km before the pin', true) $$,
  'S12: reviewer, note and verified_at recorded');
select results_eq(
  $$ select actor_id, payload ->> 'note' from public.trip_events where trip_id = tests.t(7) and type = 'approved' $$,
  $$ values ('5c000000-0000-4000-8000-0000000000aa'::uuid, 'Yard gate is 2 km before the pin') $$,
  'S12: one approved event with the admin and the note');
select is(public.verify_trip(tests.t(7))::text, 'verified', 'S12: re-running verification is a no-op');
select is((select verified_trips from public.driver_stats where driver_id = tests.d(7)), 1, 'S12: still counted once');
-- reject path (S6 mock trip): rejected, never counted
select tests.as_user('5c000000-0000-4000-8000-0000000000aa');
select is((select status::text from public.admin_review_trip(tests.t(8), false, 'Mock location app detected')),
          'rejected', 'S12: reject → rejected');
select tests.as_postgres();
select is_empty($$ select 1 from public.driver_stats where driver_id = tests.d(8) $$, 'S12: rejected trip adds nothing');

select * from finish();
rollback;
