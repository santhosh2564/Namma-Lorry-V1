-- =====================================================================
-- Namma Lorry — 0009: re-consent and the D1 notice (docs/09 §1)
-- Changing CONSENT_VERSION re-prompts nobody today: the launch gate never
-- compares versions and start_trip only checks that consent_version is non-null
-- (0006). This migration makes the current policy version a database fact and
-- turns an old agreement into no agreement:
--   1. app_settings gains a text column, current_consent_version() reads it
--   2. record_consent accepts only the current version (VERSION_NOT_CURRENT)
--   3. start_trip raises CONSENT_REQUIRED unless consent_version is the current
--      one — the 0008 body otherwise unchanged (advisory lock, is_active,
--      status/another-trip/accuracy/geofence, unique_violation mapping).
-- Release order matters (docs/RUNBOOK.md §Changing the policy version): the app
-- build carrying the new CONSENT_VERSION ships first, then this migration.
-- Otherwise an installed older build loops on D1, because record_consent
-- refuses its version and start_trip refuses the version it already has.
-- =====================================================================

-- ---------- 1. The current policy version lives in the database ----------
-- app_settings.value is numeric, so the version gets a text column of its own
-- (value is left at 0 so the row still satisfies the table's NOT NULL).
-- current_consent_version() is the single server-side source of the version the
-- installed app must agree to; test/config/consent.test.mjs pins it to
-- CONSENT_VERSION in src/features/onboarding/consent.ts, so the two can't drift.
alter table public.app_settings add column value_text text;

insert into public.app_settings(key, value, note, value_text) values
  ('consent_version', 0,
   'Current privacy-policy version. Must equal CONSENT_VERSION in the installed app (docs/09 §1); bump only after that app update ships (docs/RUNBOOK.md).',
   '2026-10-01');

create or replace function public.current_consent_version() returns text
language sql stable set search_path = public as $$
  select value_text from public.app_settings where key = 'consent_version'
$$;

-- ---------- 2. record_consent accepts only the current version ----------
-- An installed older build would otherwise record its stale version on D1 and
-- start_trip would then refuse it — the loop the runbook warns about. A clear
-- VERSION_NOT_CURRENT lets D1 tell the driver to update the app instead.
create or replace function public.record_consent(p_version text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare p public.profiles; v_current text;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if coalesce(trim(p_version), '') = '' then raise exception 'VERSION_REQUIRED' using errcode = 'P0001'; end if;

  v_current := public.current_consent_version();
  if v_current is null then raise exception 'VERSION_NOT_CONFIGURED' using errcode = 'P0001'; end if;
  if trim(p_version) <> v_current then raise exception 'VERSION_NOT_CURRENT' using errcode = 'P0001'; end if;

  update public.profiles
     set consent_version = trim(p_version), consent_at = now()
   where id = auth.uid() and is_active
  returning * into p;
  if not found then raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002'; end if;
  return p;
end $$;

revoke all on function public.record_consent(text) from public, anon;
grant execute on function public.record_consent(text) to authenticated;

-- ---------- 3. start_trip requires the CURRENT version ----------
-- Same body as 0008; only the consent check changed: a version that is not the
-- current one is as good as none. If current_consent_version() is null the
-- comparison is null and the driver is refused (fail closed).
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
                    and consent_version = public.current_consent_version()) then
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
