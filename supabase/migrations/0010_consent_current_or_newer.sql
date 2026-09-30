-- =====================================================================
-- Namma Lorry — 0010: a consent to the current version OR A NEWER ONE counts
-- 0009 (#26) accepted only the exact current version. The release order when
-- the version changes is the app first, then the migration that makes the new
-- version current (docs/RUNBOOK.md §Changing the policy version). In between,
-- the new build's D1 records a version newer than the database's; with exact
-- matching, record_consent refused it and every driver on the new build was
-- stuck on D1 until the migration landed.
--
-- Now: the current version or a newer one is accepted and counts at Start; an
-- older one is still VERSION_NOT_CURRENT (D1: "update the app"). Versions are
-- YYYY-MM-DD (release-docs and consent config tests), so they compare as text,
-- with collate "C" so no locale rule can reorder them. The older check runs
-- before the format check: a pre-0009 build sends '2026-09-27.1', which must
-- read as "update the app", not as malformed.
--
-- Storage (app_settings.value_text), names and grants are 0009's. start_trip is
-- the 0009 body with only the comparison changed: advisory lock, is_active and
-- every other check kept (supabase/tests/10_start_trip_contract.test.sql).
-- =====================================================================

create or replace function public.record_consent(p_version text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare p public.profiles; v_current text;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if coalesce(trim(p_version), '') = '' then raise exception 'VERSION_REQUIRED' using errcode = 'P0001'; end if;

  v_current := public.current_consent_version();
  if v_current is null then raise exception 'VERSION_NOT_CONFIGURED' using errcode = 'P0001'; end if;
  if trim(p_version) collate "C" < v_current collate "C" then
    raise exception 'VERSION_NOT_CURRENT' using errcode = 'P0001'; end if;
  if trim(p_version) !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'VERSION_INVALID' using errcode = 'P0001'; end if;

  update public.profiles
     set consent_version = trim(p_version), consent_at = now()
   where id = auth.uid() and is_active
  returning * into p;
  if not found then raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002'; end if;
  return p;
end $$;

-- start_trip: CONSENT_REQUIRED unless the stored version is the current one or
-- newer (an unset one fails the comparison, as before).
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
