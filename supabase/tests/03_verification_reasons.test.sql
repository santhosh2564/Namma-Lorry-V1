-- =====================================================================
-- Namma Lorry — 03: verification rules
-- docs/08 §3. Each of the ten reason codes is produced by a real trip that is
-- otherwise clean, and asserted to be the *only* reason raised, so a rule
-- cannot start firing for the wrong reason. The final assertion pins the whole
-- set to the documented list, so a new rule in verify_trip without a matching
-- case here fails the suite.
-- =====================================================================
begin;

\ir _helpers.psql

select plan(28);

-- ---- fixtures --------------------------------------------------------
select tests.create_user('d3000000-0000-4000-8000-000000000001', '919000000921', 'driver', 'D3');
insert into public.vehicles(id, registration_no, vehicle_type) values
  ('c3000000-0000-4000-8000-000000000001', 'TN 03 AA 0001', '19ft');

-- Build a completed trip, break exactly one rule, run verification, and return
-- its id. Assertions stay at statement level on purpose: pgTAP assertions
-- called from inside a plpgsql function never emit their TAP lines.
create function tests.reason_case(p_duration interval, p_points int, p_mutation text)
returns uuid language plpgsql as $$
declare v uuid; load_id uuid;
begin
  v := tests.completed_trip('d3000000-0000-4000-8000-000000000001',
                            'c3000000-0000-4000-8000-000000000001', p_duration, p_points);
  select t.load_id into load_id from public.trips t where t.id = v;

  case p_mutation
    when 'start_outside' then
      update public.trips set start_lat = 12.9000, start_lng = 79.9422 where id = v;
    when 'start_missing' then
      -- 0011: no recorded start position. v_start_d is NULL, and the check
      -- only compared it, so START_OUTSIDE_PICKUP never fired and the trip
      -- auto-verified with no evidence the driver reached the pickup.
      update public.trips set start_lat = null, start_lng = null where id = v;
    when 'end_outside' then
      update public.trips set end_lat = 10.9878, end_lng = 76.9558 where id = v;
    when 'mocked' then
      update public.trip_points set is_mocked = true where trip_id = v and seq = 5;
    when 'gap' then
      -- 41 consecutive points removed → a 21-minute hole between neighbours.
      delete from public.trip_points where trip_id = v and seq between 100 and 140;
      update public.trips set expected_points = (select count(*) from public.trip_points where trip_id = v) where id = v;
    when 'missing_points' then
      -- The phone recorded 300 points; only 240 arrived.
      update public.trips set expected_points = p_points + 60 where id = v;
    when 'jumps' then
      -- Every 20th point teleports ~5.5 km off the route → 23 fast segments.
      update public.trip_points set lat = lat + 0.05 where trip_id = v and seq % 20 = 0;
      -- Two passes: measure the tracked distance, then make the planned
      -- distance match it so the ratio rule stays quiet and only GPS_JUMPS fires.
      perform public.verify_trip(v);
      update public.loads set planned_distance_m = (select tracked_distance_m from public.trips where id = v)
       where id = load_id;
      update public.trips set status = 'completed' where id = v;
    when 'too_short' then
      update public.loads set planned_distance_m = 200000 where id = load_id;
    when 'too_long' then
      update public.loads set planned_distance_m = 20000 where id = load_id;
    else
      null;  -- LOW_COVERAGE / SPEED_IMPLAUSIBLE come from the shape of the
             -- track itself (too few points / too short a duration).
  end case;

  perform public.verify_trip(v);
  return v;
end $$;

-- ---- baseline: a clean trip verifies ----------------------------------
select tests.completed_trip('d3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001') as clean \gset
select public.verify_trip(:'clean'::uuid);
select is((select status::text from public.trips where id = :'clean'::uuid), 'verified',
  'a clean 2 h trip verifies');
select is((select verification_reasons::text from public.trips where id = :'clean'::uuid), '{}',
  'a clean trip raises no reasons');
select ok((select tracked_distance_m > 0 from public.trips where id = :'clean'::uuid),
  'a verified trip records a non-zero official distance');
select ok((select verified_at is not null from public.trips where id = :'clean'::uuid),
  'a verified trip has verified_at');
select is(public.verify_trip(:'clean'::uuid)::text, 'verified',
  'verify_trip leaves an already verified trip alone');

-- ---- one case per reason code ----------------------------------------
select tests.reason_case(interval '2 hours', 240, 'start_outside') as trip \gset
select is((select status::text from public.trips where id = :'trip'::uuid), 'needs_review',
  'START_OUTSIDE_PICKUP: held for review');
select is((select array_to_string(verification_reasons, ',') from public.trips where id = :'trip'::uuid),
  'START_OUTSIDE_PICKUP', 'START_OUTSIDE_PICKUP: is the only reason');

select tests.reason_case(interval '2 hours', 240, 'start_missing') as trip \gset
select is((select status::text from public.trips where id = :'trip'::uuid), 'needs_review',
  'START_OUTSIDE_PICKUP: a trip with no recorded start position is held for review');
select is((select array_to_string(verification_reasons, ',') from public.trips where id = :'trip'::uuid),
  'START_OUTSIDE_PICKUP', 'a missing start position raises START_OUTSIDE_PICKUP, the same as a distant one');

select tests.reason_case(interval '2 hours', 240, 'end_outside') as trip \gset
select is((select status::text from public.trips where id = :'trip'::uuid), 'needs_review',
  'END_OUTSIDE_DROP: held for review');
select is((select array_to_string(verification_reasons, ',') from public.trips where id = :'trip'::uuid),
  'END_OUTSIDE_DROP', 'END_OUTSIDE_DROP: is the only reason');

select tests.reason_case(interval '2 hours', 240, 'mocked') as trip \gset
select is((select status::text from public.trips where id = :'trip'::uuid), 'needs_review',
  'MOCK_LOCATION: held for review');
select is((select array_to_string(verification_reasons, ',') from public.trips where id = :'trip'::uuid),
  'MOCK_LOCATION', 'MOCK_LOCATION: is the only reason');

select tests.reason_case(interval '2 hours', 240, 'gap') as trip \gset
select is((select status::text from public.trips where id = :'trip'::uuid), 'needs_review',
  'TRACKING_GAP: held for review');
select is((select array_to_string(verification_reasons, ',') from public.trips where id = :'trip'::uuid),
  'TRACKING_GAP', 'TRACKING_GAP: is the only reason');

select tests.reason_case(interval '2 hours', 100, null) as trip \gset
select is((select status::text from public.trips where id = :'trip'::uuid), 'needs_review',
  'LOW_COVERAGE: held for review');
select is((select array_to_string(verification_reasons, ',') from public.trips where id = :'trip'::uuid),
  'LOW_COVERAGE', 'LOW_COVERAGE: is the only reason');

select tests.reason_case(interval '2 hours', 240, 'missing_points') as trip \gset
select is((select status::text from public.trips where id = :'trip'::uuid), 'needs_review',
  'MISSING_POINTS: held for review');
select is((select array_to_string(verification_reasons, ',') from public.trips where id = :'trip'::uuid),
  'MISSING_POINTS', 'MISSING_POINTS: is the only reason');

select tests.reason_case(interval '45 minutes', 60, null) as trip \gset
select is((select status::text from public.trips where id = :'trip'::uuid), 'needs_review',
  'SPEED_IMPLAUSIBLE: held for review');
select is((select array_to_string(verification_reasons, ',') from public.trips where id = :'trip'::uuid),
  'SPEED_IMPLAUSIBLE', 'SPEED_IMPLAUSIBLE: is the only reason');

select tests.reason_case(interval '3 hours', 240, 'jumps') as trip \gset
select is((select status::text from public.trips where id = :'trip'::uuid), 'needs_review',
  'GPS_JUMPS: held for review');
select is((select array_to_string(verification_reasons, ',') from public.trips where id = :'trip'::uuid),
  'GPS_JUMPS', 'GPS_JUMPS: is the only reason');

select tests.reason_case(interval '2 hours', 240, 'too_short') as trip \gset
select is((select status::text from public.trips where id = :'trip'::uuid), 'needs_review',
  'DISTANCE_TOO_SHORT: held for review');
select is((select array_to_string(verification_reasons, ',') from public.trips where id = :'trip'::uuid),
  'DISTANCE_TOO_SHORT', 'DISTANCE_TOO_SHORT: is the only reason');

select tests.reason_case(interval '2 hours', 240, 'too_long') as trip \gset
select is((select status::text from public.trips where id = :'trip'::uuid), 'needs_review',
  'DISTANCE_TOO_LONG: held for review');
select is((select array_to_string(verification_reasons, ',') from public.trips where id = :'trip'::uuid),
  'DISTANCE_TOO_LONG', 'DISTANCE_TOO_LONG: is the only reason');

-- ---- the covered set is exactly the documented set -------------------
select is(
  (select array_agg(distinct r order by r)::text from public.trips t, unnest(t.verification_reasons) r
    where t.driver_id = 'd3000000-0000-4000-8000-000000000001'),
  (select array_agg(c order by c)::text from unnest(array[
     'DISTANCE_TOO_LONG', 'DISTANCE_TOO_SHORT', 'END_OUTSIDE_DROP', 'GPS_JUMPS', 'LOW_COVERAGE',
     'MOCK_LOCATION', 'MISSING_POINTS', 'SPEED_IMPLAUSIBLE', 'START_OUTSIDE_PICKUP', 'TRACKING_GAP']) c),
  'every docs/08 §3 reason code is produced by a case here, and nothing else is');

select * from finish();
rollback;
