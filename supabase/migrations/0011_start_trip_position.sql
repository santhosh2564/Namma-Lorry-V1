-- =====================================================================
-- Namma Lorry — 0011: start_trip needs a fix with a position (validation M5)
--
-- 0010's start_trip checked the driver's fix in two places:
--
--   if p_accuracy_m is null or p_accuracy_m > max_point_accuracy_m then ... end if;
--   v_d := st_distance(st_makepoint(p_lng, p_lat)::geography, l.pickup_geog);
--   if v_d > l.pickup_radius_m + p_accuracy_m then ... end if;
--
-- Neither one notices that p_lat / p_lng may be NULL. With them NULL,
-- st_makepoint(NULL, NULL)::geography is NULL, st_distance(NULL, geog) is NULL,
-- and `NULL > x` evaluates to NULL — which PL/pgSQL treats as "not true", so the
-- IF body is skipped and the trip starts. Reproduced against the local stack:
--
--   select public.start_trip(<trip>, null, null, 10);  -- → in_progress
--   select start_lat, start_lng from trips where …;      -- → NULL, NULL
--
-- So the geofence was not enforced for a caller who passed no position at all,
-- which is exactly the "trust nothing from the client" rule (CLAUDE.md hard
-- rule 1) failing at the one moment the trip claim is created. The real app
-- cannot do this — StartTripRpcArgs.lat/lng are non-nullable numbers and come
-- from getCurrentPositionAsync — but a client with the anon key and a driver's
-- JWT can, and the RPC is the boundary.
--
-- verify_trip had the same shape and the same hole on the start side: with
-- start_lat NULL, v_start_d is NULL and `START_OUTSIDE_PICKUP` was never
-- appended, so such a trip could auto-verify and credit km with no evidence the
-- driver ever reached the pickup. The drop side already guards this
-- (`if t.end_lat is not null …` then `if v_end_d is null or …`), which is the
-- convention this migration applies to the start side.
--
-- Two changes:
--   1. start_trip refuses a fix with no coordinates, with the code it already
--      uses for a fix with no accuracy — GPS_ACCURACY_TOO_LOW, documented in
--      docs/06 §1 and already mapped by src/tracking/errors.ts, so the app
--      needs no change. Everything else in the 0010 body (advisory lock,
--      is_active, ownership, consent, status, another-trip, geofence,
--      unique_violation mapping) is carried forward unchanged.
--   2. verify_trip treats a missing start position as START_OUTSIDE_PICKUP.
--      The rest of that function is byte-identical to 0001 — the diff is the
--      one line in the start-geofence check, and nothing else.
-- =====================================================================

-- ---------- 1. start_trip needs a position -----------------------------
-- Same body as 0010; the fix check is the only change. A fix with no latitude
-- or longitude is a fix the geofence cannot be applied to, so it is refused
-- with the code the app already shows for a fix it cannot trust.
create or replace function public.start_trip(
  p_trip_id uuid, p_lat double precision, p_lng double precision,
  p_accuracy_m real, p_device_info jsonb default null)
returns public.trips
language plpgsql security definer set search_path = public, extensions as $$
declare t public.trips; l public.loads; v_d double precision;
begin
  perform pg_advisory_xact_lock(hashtextextended('start_trip:' || coalesce(auth.uid()::text, ''), 0));

  if not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into t from public.trips where id = p_trip_id for update;
  if not found or t.driver_id <> auth.uid() then raise exception 'TRIP_NOT_FOUND' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.profiles
                  where id = auth.uid()
                    and consent_version collate "C" >= public.current_consent_version() collate "C") then
    raise exception 'CONSENT_REQUIRED' using errcode = 'P0001'; end if;
  if t.status <> 'assigned' then raise exception 'TRIP_NOT_STARTABLE' using errcode = 'P0001'; end if;
  if exists (select 1 from public.trips where driver_id = auth.uid() and status = 'in_progress') then
    raise exception 'ANOTHER_TRIP_ACTIVE' using errcode = 'P0001'; end if;
  -- No position means no geofence: st_distance(NULL, …) is NULL and the
  -- comparison below would silently pass, so the position is required here,
  -- alongside the accuracy the existing check already requires.
  if p_lat is null or p_lng is null
     or p_accuracy_m is null or p_accuracy_m > public.setting('max_point_accuracy_m') then
    raise exception 'GPS_ACCURACY_TOO_LOW' using errcode = 'P0001'; end if;

  select * into l from public.loads where id = t.load_id;
  v_d := st_distance(st_setsrid(st_makepoint(p_lng, p_lat),4326)::geography, l.pickup_geog);
  if v_d > l.pickup_radius_m + p_accuracy_m then
    raise exception 'OUTSIDE_PICKUP:%', round(v_d) using errcode = 'P0001'; end if;

  begin
    update public.trips set status = 'in_progress', started_at = now(),
      start_lat = p_lat, start_lng = p_lng, start_accuracy_m = p_accuracy_m, device_info = p_device_info
    where id = p_trip_id returning * into t;
  exception when unique_violation then
    raise exception 'ANOTHER_TRIP_ACTIVE' using errcode = 'P0001';
  end;

  insert into public.trip_events(trip_id, type, payload)
  values (p_trip_id, 'started', jsonb_build_object('distance_to_pickup_m', round(v_d)));
  return t;
end $$;

-- ---------- 2. verify_trip fails closed on a missing start position ----
-- Byte-identical to 0001 except for the start-geofence check, which now
-- treats "no start position recorded" the way the drop side already treats "no
-- end position recorded": as a reason, not as a silent pass.
create or replace function public.verify_trip(p_trip_id uuid) returns public.trip_status
language plpgsql security definer set search_path = public, extensions as $$
declare
  t public.trips; l public.loads;
  v_reasons text[] := '{}';
  v_distance double precision; v_max_gap double precision; v_points int; v_mocked int; v_jumps int;
  v_duration_h double precision; v_avg_kmh double precision; v_ratio double precision;
  v_start_d double precision; v_end_d double precision;
  v_status public.trip_status;
begin
  select * into t from public.trips where id = p_trip_id for update;
  if t.status <> 'completed' then return t.status; end if;
  select * into l from public.loads where id = t.load_id;

  with pts as (
    select geog, recorded_at,
           lag(geog)        over w as prev_geog,
           lag(recorded_at) over w as prev_t
    from public.trip_points
    where trip_id = p_trip_id
      and (accuracy_m is null or accuracy_m <= public.setting('max_point_accuracy_m'))
      and recorded_at between t.started_at and t.ended_at
    window w as (order by recorded_at, seq)
  ), seg as (
    select st_distance(geog, prev_geog) as d,
           extract(epoch from recorded_at - prev_t) as dt
    from pts where prev_geog is not null
  )
  select coalesce(sum(d) filter (where dt > 0 and d / dt * 3.6 <= public.setting('max_segment_speed_kmh')), 0),
         count(*)        filter (where dt > 0 and d / dt * 3.6 >  public.setting('max_segment_speed_kmh')),
         coalesce(max(dt), 0)
    into v_distance, v_jumps, v_max_gap
  from seg;

  select count(*), count(*) filter (where is_mocked) into v_points, v_mocked
  from public.trip_points where trip_id = p_trip_id;

  v_duration_h := greatest(extract(epoch from t.ended_at - t.started_at) / 3600.0, 0.0001);
  v_avg_kmh    := (v_distance / 1000.0) / v_duration_h;

  -- start / end geofence (from recorded start/end positions)
  v_start_d := st_distance(st_setsrid(st_makepoint(t.start_lng, t.start_lat),4326)::geography, l.pickup_geog);
  if t.end_lat is not null then
    v_end_d := st_distance(st_setsrid(st_makepoint(t.end_lng, t.end_lat),4326)::geography, l.drop_geog);
  end if;

  if v_start_d is null or v_start_d > l.pickup_radius_m + coalesce(t.start_accuracy_m, 0) then v_reasons := array_append(v_reasons, 'START_OUTSIDE_PICKUP'); end if;
  if v_end_d is null or v_end_d > l.drop_radius_m + coalesce(t.end_accuracy_m, 0) then v_reasons := array_append(v_reasons, 'END_OUTSIDE_DROP'); end if;
  if v_mocked > public.setting('max_mocked_points') then v_reasons := array_append(v_reasons, 'MOCK_LOCATION'); end if;
  if v_max_gap > public.setting('max_gap_minutes') * 60 then v_reasons := array_append(v_reasons, 'TRACKING_GAP'); end if;
  if v_points < public.setting('min_points_per_hour') * v_duration_h then v_reasons := array_append(v_reasons, 'LOW_COVERAGE'); end if;
  if t.expected_points is not null and v_points < t.expected_points then v_reasons := array_append(v_reasons, 'MISSING_POINTS'); end if;
  if v_avg_kmh > public.setting('max_avg_speed_kmh') then v_reasons := array_append(v_reasons, 'SPEED_IMPLAUSIBLE'); end if;
  if v_jumps > 5 then v_reasons := array_append(v_reasons, 'GPS_JUMPS'); end if;
  if l.planned_distance_m is not null and l.planned_distance_m > 0 then
    v_ratio := v_distance / l.planned_distance_m;
    if v_ratio < public.setting('min_planned_ratio') then v_reasons := array_append(v_reasons, 'DISTANCE_TOO_SHORT'); end if;
    if v_ratio > public.setting('max_planned_ratio') then v_reasons := array_append(v_reasons, 'DISTANCE_TOO_LONG'); end if;
  end if;

  v_status := case when cardinality(v_reasons) = 0 then 'verified' else 'needs_review' end;

  update public.trips set
    status = v_status,
    tracked_distance_m = round(v_distance)::int,
    verification_reasons = v_reasons,
    verification_metrics = jsonb_build_object(
      'points', v_points, 'mocked', v_mocked, 'jumps', v_jumps, 'max_gap_s', v_max_gap,
      'avg_kmh', round(v_avg_kmh::numeric, 1), 'planned_ratio', round(v_ratio::numeric, 2),
      'start_distance_m', round(v_start_d::numeric), 'end_distance_m', round(v_end_d::numeric)),
    verified_at = case when v_status = 'verified' then now() end
  where id = p_trip_id;

  insert into public.trip_events(trip_id, type, actor_id, payload)
  values (p_trip_id, v_status::text, null, jsonb_build_object('reasons', v_reasons));

  if v_status = 'verified' then perform public.apply_verified_stats(p_trip_id); end if;
  return v_status;
end $$;

-- ---------- Grants ------------------------------------------------------
-- CREATE OR REPLACE keeps the ACL 0001 set; revoked again so the boundary is
-- stated here rather than inherited silently.
revoke all on function public.verify_trip(uuid) from public, anon, authenticated;
revoke all on function public.start_trip(uuid,double precision,double precision,real,jsonb) from public, anon;
grant execute on function public.start_trip(uuid,double precision,double precision,real,jsonb) to authenticated;