-- =====================================================================
-- Namma Lorry — 0006: DPDP controls (docs/09 §1) — validation report B3
--   1. start_trip requires a recorded consent (CONSENT_REQUIRED)
--   2. Raw GPS retention (ND-5): after raw_point_retention_days a final trip
--      keeps a simplified route (≤ 500 points) plus its result; nightly job
--   3. Erasure: admin_erase_driver, audited in admin_events
-- =====================================================================

-- ---------- 1. Consent gate --------------------------------------------
-- Same body as 0001, plus the consent check right after the ownership check
-- (a stranger's trip still reads as TRIP_NOT_FOUND). The app records consent
-- on D1 (record_consent, 0002); this is the server-side guarantee that no
-- location is collected without it, whatever the client does.
create or replace function public.start_trip(
  p_trip_id uuid, p_lat double precision, p_lng double precision,
  p_accuracy_m real, p_device_info jsonb default null)
returns public.trips
language plpgsql security definer set search_path = public, extensions as $$
declare t public.trips; l public.loads; v_d double precision;
begin
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

-- ---------- 2. Retention -------------------------------------------------
-- 365 days is the proposed policy; the value is pending client sign-off
-- (PHASE1_TASKS ND-5) and can change here without an app release.
insert into public.app_settings(key, value, note) values
  ('raw_point_retention_days', 365,
   'Days after a final trip ends before its raw points are reduced to a simplified route (≤ 500 points)');

alter table public.trips add column points_downsampled_at timestamptz;

-- Final trips only (verified / rejected / cancelled): a trip in review still
-- needs its full track. The route is simplified with ST_Simplify at a growing
-- tolerance until it has ≤ 500 vertices; the points at those vertices (always
-- including the first and the last) are kept, every other point is deleted.
-- The trip's result (distance, reasons, metrics) is never touched.
create or replace function public.downsample_old_points() returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare
  r record; v_days numeric := public.setting('raw_point_retention_days');
  v_n int; v_line geometry; v_simple geometry; v_tol double precision; v_done int := 0;
begin
  if v_days is null or v_days <= 0 then return 0; end if;
  for r in select id from public.trips
           where status in ('verified', 'rejected', 'cancelled')
             and points_downsampled_at is null
             and coalesce(ended_at, created_at) < now() - make_interval(days => v_days::int)
           for update skip locked
  loop
    select count(*) into v_n from public.trip_points where trip_id = r.id;
    if v_n > 500 then
      select st_makeline(st_setsrid(st_makepoint(lng, lat), 4326) order by seq) into v_line
      from public.trip_points where trip_id = r.id;
      v_tol := 0.00001;   -- degrees, ~1 m
      loop
        v_simple := st_simplify(v_line, v_tol, true);
        exit when st_npoints(v_simple) <= 500;
        v_tol := v_tol * 2;
      end loop;

      delete from public.trip_points p
      where p.trip_id = r.id
        and p.seq not in (
          select min(q.seq)
          from public.trip_points q
          join st_dumppoints(v_simple) d on st_x(d.geom) = q.lng and st_y(d.geom) = q.lat
          where q.trip_id = r.id
          group by d.path
          union all
          select min(seq) from public.trip_points where trip_id = r.id
          union all
          select max(seq) from public.trip_points where trip_id = r.id);
    end if;
    update public.trips set points_downsampled_at = now() where id = r.id;
    v_done := v_done + 1;
  end loop;
  return v_done;
end $$;

-- 21:30 UTC = 03:00 IST, the quietest hour for uploads.
select cron.schedule('downsample-old-points', '30 21 * * *', $$select public.downsample_old_points()$$);

-- ---------- 3. Erasure ---------------------------------------------------
-- Audit log for admin actions that are not about one trip (trip_events needs
-- a trip). Admins read it; only SECURITY DEFINER functions write it.
create table public.admin_events (
  id         bigint generated always as identity primary key,
  action     text not null,          -- driver_erased | ...
  target_id  uuid,                   -- no FK: the audit row must outlive its target
  actor_id   uuid default auth.uid(),
  payload    jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_events enable row level security;
create policy admin_events_read on public.admin_events for select to authenticated
  using (public.is_admin());

alter table public.profiles add column erased_at timestamptz;

-- Erase a driver's personal data (docs/09 §1, withdrawal & erasure): every GPS
-- point and live position, the name and phone number, and the start/end
-- positions and device info on their trips. The anonymised trip results and
-- driver_stats stay, so fleet history and aggregate km survive. Assigned trips
-- are cancelled so their loads can be reassigned. A trip still collecting
-- points (in_progress / completed) must be finished or force-ended first.
-- The auth user (and the phone stored there) is not touched here: ban it in
-- the dashboard (docs/RUNBOOK.md §Erasure).
create or replace function public.admin_erase_driver(p_driver_id uuid, p_note text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_points int; v_trips int; v_cancelled int; v_result jsonb;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if coalesce(trim(p_note),'') = '' then raise exception 'NOTE_REQUIRED' using errcode = 'P0001'; end if;
  perform 1 from public.profiles where id = p_driver_id and role = 'driver' for update;
  if not found then raise exception 'DRIVER_NOT_FOUND' using errcode = 'P0002'; end if;
  if exists (select 1 from public.trips
             where driver_id = p_driver_id and status in ('in_progress', 'completed')) then
    raise exception 'DRIVER_HAS_ACTIVE_TRIP' using errcode = 'P0001'; end if;

  delete from public.trip_points p using public.trips t
  where t.id = p.trip_id and t.driver_id = p_driver_id;
  get diagnostics v_points = row_count;
  delete from public.trip_live where driver_id = p_driver_id;

  insert into public.trip_events(trip_id, type, payload)
  select id, 'cancelled', jsonb_build_object('note', 'Driver erased')
  from public.trips where driver_id = p_driver_id and status = 'assigned';
  update public.trips set status = 'cancelled' where driver_id = p_driver_id and status = 'assigned';
  get diagnostics v_cancelled = row_count;

  update public.trips set start_lat = null, start_lng = null, start_accuracy_m = null,
    end_lat = null, end_lng = null, end_accuracy_m = null, device_info = null
  where driver_id = p_driver_id;
  get diagnostics v_trips = row_count;

  update public.profiles set full_name = '', phone = null, is_active = false, erased_at = now()
  where id = p_driver_id;

  v_result := jsonb_build_object('points_deleted', v_points, 'trips_kept', v_trips,
                                 'trips_cancelled', v_cancelled);
  insert into public.admin_events(action, target_id, payload)
  values ('driver_erased', p_driver_id, v_result || jsonb_build_object('note', p_note));
  return v_result;
end $$;

-- ---------- Grants -------------------------------------------------------
revoke all on function public.downsample_old_points()       from public, anon, authenticated;
revoke all on function public.admin_erase_driver(uuid,text) from public, anon;
grant execute on function public.admin_erase_driver(uuid,text) to authenticated;
