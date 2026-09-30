-- =====================================================================
-- Namma Lorry — 0008: start_trip under concurrency (validation M5, scenario 10)
-- Found by test/db/start-trip-race.sh: two start_trip calls for the same driver
-- at the same moment both passed the "another trip active?" check; the second
-- then hit the trips_one_active_per_driver unique index (0001) and returned a
-- raw 23505 instead of ANOTHER_TRIP_ACTIVE (docs/06), so the app could not send
-- the driver to their active trip. Two active trips were never possible: the
-- index already prevents it. Only the error contract was wrong.
--
-- Fix: serialise starts per driver with a transaction-scoped advisory lock taken
-- before any check (READ COMMITTED: each later statement takes a new snapshot,
-- so the check sees the other start once it commits), and map any remaining
-- unique violation to ANOTHER_TRIP_ACTIVE. Same body as 0007 otherwise: the
-- is_active (0007) and consent (0006) checks stay; signature and grants unchanged
-- (supabase/tests/10_start_trip_contract.test.sql).
-- =====================================================================
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
  if not exists (select 1 from public.profiles where id = auth.uid() and consent_version is not null) then
    raise exception 'CONSENT_REQUIRED' using errcode = 'P0001'; end if;
  if t.status <> 'assigned' then raise exception 'TRIP_NOT_STARTABLE' using errcode = 'P0001'; end if;
  if exists (select 1 from public.trips where driver_id = auth.uid() and status = 'in_progress') then
    raise exception 'ANOTHER_TRIP_ACTIVE' using errcode = 'P0001'; end if;
  if p_accuracy_m is null or p_accuracy_m > public.setting('max_point_accuracy_m') then
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
