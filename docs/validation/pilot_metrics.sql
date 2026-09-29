-- Phase 1 pilot metrics (PRD §2 goals, §7 metrics; docs/01 §6 definition of done).
-- Read-only. Run on the PILOT database (hosted), e.g. Dashboard → SQL Editor, or:
--   psql "$PILOT_DB_URL" -f docs/validation/pilot_metrics.sql
-- Set the pilot window below before running.
-- Paste the full output back into the validation PR.

\set pilot_from '''2026-11-09'''
\set pilot_to   '''2026-11-21'''

-- 0. Pilot scope ------------------------------------------------------------
select count(*)                                   as trips_total,
       count(*) filter (where status = 'verified')     as verified,
       count(*) filter (where status = 'needs_review') as needs_review,
       count(*) filter (where status = 'rejected')     as rejected,
       count(*) filter (where status = 'completed')    as awaiting_points,
       count(*) filter (where status = 'in_progress')  as still_in_progress,
       count(*) filter (where status = 'cancelled')    as cancelled
from public.trips
where started_at >= :pilot_from and started_at < :pilot_to;

-- 1. Goal 1 / metric "track completeness" ≥ 95 % ----------------------------
--    per trip: points received / expected (expected_points = last seq the phone recorded)
--    and "complete track" = no gap > 15 min (PRD §2 goal 1).
with t as (
  select id, expected_points,
         (select count(*) from public.trip_points p where p.trip_id = trips.id) as received,
         coalesce((verification_metrics->>'max_gap_s')::numeric, 0)            as max_gap_s
  from public.trips
  where started_at >= :pilot_from and started_at < :pilot_to
    and status in ('verified','needs_review','rejected','completed')
)
select count(*)                                                        as ended_trips,
       round(100.0 * avg(least(received::numeric / nullif(expected_points,0), 1)), 1) as mean_completeness_pct,
       round(100.0 * count(*) filter (where received >= expected_points) / nullif(count(*),0), 1) as pct_trips_all_points,
       round(100.0 * count(*) filter (where max_gap_s <= 900 and received >= expected_points) / nullif(count(*),0), 1)
                                                                       as pct_trips_complete_track_target_95
from t;

-- 2. Goal 2 / metric "auto-verify rate of genuine trips" ≥ 80 % --------------
--    genuine = not rejected by an admin. auto = verified with no reviewer.
select count(*) filter (where status <> 'rejected')                                   as genuine_trips,
       count(*) filter (where status = 'verified' and reviewed_by is null)            as auto_verified,
       round(100.0 * count(*) filter (where status = 'verified' and reviewed_by is null)
             / nullif(count(*) filter (where status <> 'rejected'), 0), 1)            as auto_verify_pct_target_80
from public.trips
where started_at >= :pilot_from and started_at < :pilot_to
  and status in ('verified','needs_review','rejected');

-- 2b. docs/01 §6: every flagged trip has a reason (human-readable text is checked by eye in C6)
select id, status, verification_reasons, review_note
from public.trips
where started_at >= :pilot_from and started_at < :pilot_to
  and (status in ('needs_review','rejected') or reviewed_by is not null)
order by started_at;

-- 3. Goal 3 "zero driver-editable paths" — evidence is the RLS suite + rls-attacks.md, not data.
--    Data-side sanity: stats must equal the sum of verified trips (no drift from any write path).
select s.driver_id, s.verified_trips, s.verified_distance_m,
       count(t.id)                          as verified_trips_from_trips,
       coalesce(sum(t.tracked_distance_m),0) as verified_m_from_trips,
       (s.verified_trips <> count(t.id) or s.verified_distance_m <> coalesce(sum(t.tracked_distance_m),0)) as drift
from public.driver_stats s
left join public.trips t on t.driver_id = s.driver_id and t.status = 'verified'
group by s.driver_id, s.verified_trips, s.verified_distance_m
order by drift desc, s.driver_id;

-- 4. Goal 4 / metric "median live delay" ≤ 60 s -----------------------------
select percentile_cont(0.5) within group (order by extract(epoch from received_at - recorded_at)) as median_delay_s_target_60,
       percentile_cont(0.9) within group (order by extract(epoch from received_at - recorded_at)) as p90_delay_s,
       count(*) as points
from public.trip_points p
join public.trips t on t.id = p.trip_id
where t.started_at >= :pilot_from and t.started_at < :pilot_to;

-- 5. Goal 5 "≤ 2 taps per trip" is a UI measure — not in the DB. Record from the field-test video.
-- 6. "Crash-free sessions ≥ 99 %" — Sentry (not integrated on origin/main; see report).

-- 7. Lagging: drivers with ≥ 3 verified trips in 30 days ≥ 70 % of pilot drivers
with d as (
  select driver_id, count(*) filter (where status = 'verified' and ended_at >= now() - interval '30 days') as v30
  from public.trips
  where started_at >= :pilot_from and started_at < :pilot_to
  group by driver_id
)
select count(*) as pilot_drivers,
       count(*) filter (where v30 >= 3) as with_3_verified_30d,
       round(100.0 * count(*) filter (where v30 >= 3) / nullif(count(*),0), 1) as pct_target_70
from d;

-- 8. Per-trip evidence table (docs/10 §3 field record: expected vs received, max gap, result)
select l.load_code, pr.full_name as driver, t.status, t.expected_points,
       (select count(*) from public.trip_points p where p.trip_id = t.id) as received,
       round(coalesce((t.verification_metrics->>'max_gap_s')::numeric,0)/60, 1) as max_gap_min,
       round(t.tracked_distance_m/1000.0, 1) as tracked_km,
       round(l.planned_distance_m/1000.0, 1) as planned_km,
       t.verification_reasons, t.device_info->>'model' as device, t.review_note
from public.trips t
join public.loads l on l.id = t.load_id
join public.profiles pr on pr.id = t.driver_id
where t.started_at >= :pilot_from and t.started_at < :pilot_to
order by t.started_at;
