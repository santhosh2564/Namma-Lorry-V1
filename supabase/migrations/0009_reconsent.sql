-- =====================================================================
-- Namma Lorry — 0009: re-consent on a policy version change (docs/09 §1)
-- Before this, changing the privacy policy re-prompted nobody: start_trip only
-- required a non-null consent_version (0006) and record_consent stored any
-- string. Now the database knows the current version, and a consent to an
-- older one does not count.
--
-- "Not older than current", not "equal to current": the release order when the
-- version changes (docs/RUNBOOK.md §Changing the policy version) is the app
-- update with the new CONSENT_VERSION first, then the migration that changes
-- current_consent_version(). In between, the new build records a version newer
-- than the database's, which must be accepted and must count. Versions are
-- YYYY-MM-DD (test/config/release-docs.test.mjs), so they compare as text
-- (collate "C", so no locale rule can reorder them).
--
-- test/config/consent-version.test.mjs keeps the version below equal to
-- CONSENT_VERSION in src/features/onboarding/consent.ts. app_settings holds
-- numbers only, so the version is a function rather than a setting.
-- =====================================================================

create or replace function public.current_consent_version() returns text
language sql stable as $$ select '2026-10-01' $$;

revoke all on function public.current_consent_version() from public, anon;
grant execute on function public.current_consent_version() to authenticated;

-- record_consent: the current version or a newer one (same body as 0002 plus
-- those checks). An older one is an old app build: CONSENT_VERSION_OUTDATED,
-- which D1 shows as "update the app".
create or replace function public.record_consent(p_version text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if coalesce(trim(p_version), '') = '' then raise exception 'VERSION_REQUIRED' using errcode = 'P0001'; end if;
  -- Older first: the pre-0009 builds send '2026-09-27.1', which must read as
  -- "update the app", not as malformed.
  if trim(p_version) collate "C" < public.current_consent_version() collate "C" then
    raise exception 'CONSENT_VERSION_OUTDATED' using errcode = 'P0001'; end if;
  if trim(p_version) !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'VERSION_INVALID' using errcode = 'P0001'; end if;

  update public.profiles
     set consent_version = trim(p_version), consent_at = now()
   where id = auth.uid() and is_active
  returning * into p;
  if not found then raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002'; end if;
  return p;
end $$;

-- start_trip: CONSENT_REQUIRED unless the caller agreed to the current version
-- or a newer one.
-- Same body as 0008 otherwise: the advisory lock and every other check stay
-- (supabase/tests/10_start_trip_contract.test.sql).
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
