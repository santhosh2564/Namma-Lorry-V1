-- =====================================================================
-- Namma Lorry — 0007: no self-registration (validation M4, PRD P0-1, ND-12)
-- Validation report M4 (rls-attacks.md U2): any client could POST
-- /auth/v1/otp for an unknown number, and handle_new_user gave the new auth
-- user an ACTIVE driver profile. Sign-ups are now off (config.toml; the hosted
-- projects need the same dashboard setting), and as a second line every new
-- profile starts inactive: my_role() is null, so no role, no admin RPCs and no
-- consent. The paths that create users on purpose activate them in the same
-- step: scripts/provision-user.mjs, the admin-create-driver Edge Function,
-- supabase/seed.sql, and an admin in the console.
-- =====================================================================

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, phone, is_active) values (new.id, new.phone, false)
  on conflict (id) do nothing;
  return new;
end $$;

-- start_trip: an inactive driver cannot start a trip (an operator may have
-- deactivated them after assigning it). Same body as 0006 plus that check.
-- end_trip and point uploads stay open to them on purpose: a driver
-- deactivated mid-trip must still be able to finish it (routing.ts).
create or replace function public.start_trip(
  p_trip_id uuid, p_lat double precision, p_lng double precision,
  p_accuracy_m real, p_device_info jsonb default null)
returns public.trips
language plpgsql security definer set search_path = public, extensions as $$
declare t public.trips; l public.loads; v_d double precision;
begin
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

  update public.trips set status = 'in_progress', started_at = now(),
    start_lat = p_lat, start_lng = p_lng, start_accuracy_m = p_accuracy_m, device_info = p_device_info
  where id = p_trip_id returning * into t;

  insert into public.trip_events(trip_id, type, payload)
  values (p_trip_id, 'started', jsonb_build_object('distance_to_pickup_m', round(v_d)));
  return t;
end $$;
