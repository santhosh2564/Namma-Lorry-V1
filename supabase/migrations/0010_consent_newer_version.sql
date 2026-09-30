-- =====================================================================
-- Namma Lorry — 0010: accept the current policy version or a newer one
-- 0009 made record_consent and start_trip require exactly the database's
-- current consent version. That is right for an outdated build, but it breaks
-- the release order docs/RUNBOOK.md §Changing the policy version prescribes:
-- the app build carrying the new CONSENT_VERSION ships first, and until the
-- migration that makes it current lands, the database is still on the old
-- version — so it refuses the new one and every driver on the new build is
-- stuck on D1. This migration makes "current" mean "current or newer":
--   1. record_consent: an older version still raises VERSION_NOT_CURRENT —
--      checked BEFORE any format check, so a pre-0009 build's `2026-09-27.1`
--      reads as outdated rather than malformed — then a `YYYY-MM-DD` check
--      raises VERSION_INVALID for anything else that is not older.
--   2. start_trip: consent_version >= current_consent_version(); the 0009 body
--      (value_text storage, advisory lock, is_active, status / another-trip /
--      accuracy / geofence checks, unique_violation mapping) is otherwise
--      unchanged.
-- Versions are `YYYY-MM-DD` text compared with `collate "C"`, so the order is
-- byte order and not the locale's. test/config/consent.test.mjs pins this file
-- to the two functions and CONSENT_VERSION.
-- =====================================================================

-- ---------- 1. record_consent accepts the current version or a newer one ----
create or replace function public.record_consent(p_version text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare p public.profiles; v_current text; v_version text;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if coalesce(trim(p_version), '') = '' then raise exception 'VERSION_REQUIRED' using errcode = 'P0001'; end if;

  v_current := public.current_consent_version();
  if v_current is null then raise exception 'VERSION_NOT_CONFIGURED' using errcode = 'P0001'; end if;

  v_version := trim(p_version);
  -- Older than the current version: this build is out of date and must update
  -- the app. Checked before the format check so a pre-0009 build's dotted
  -- version (2026-09-27.1) reads as "update the app", not "malformed".
  if v_version collate "C" < v_current collate "C" then
    raise exception 'VERSION_NOT_CURRENT' using errcode = 'P0001';
  end if;
  -- Current or newer, but still has to be a policy version. The app never sends
  -- anything else; this keeps a malformed version out of profiles.
  if v_version !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'VERSION_INVALID' using errcode = 'P0001';
  end if;

  update public.profiles
     set consent_version = v_version, consent_at = now()
   where id = auth.uid() and is_active
  returning * into p;
  if not found then raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002'; end if;
  return p;
end $$;

revoke all on function public.record_consent(text) from public, anon;
grant execute on function public.record_consent(text) to authenticated;

-- ---------- 2. start_trip requires the current version or a newer one ------
-- Same body as 0009; only the consent check changed: an older version is as
-- good as none, a newer one means the app updated before this migration and is
-- accepted. If current_consent_version() is null the comparison is null and the
-- driver is refused (fail closed).
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
