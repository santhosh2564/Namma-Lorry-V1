-- =====================================================================
-- Namma Lorry — Phase 1 schema: verified trip tracking
-- Supabase / Postgres 15+ with PostGIS and pg_cron
-- =====================================================================
create extension if not exists postgis with schema extensions;
create extension if not exists pg_cron;

-- ---------- Enums ----------
create type public.user_role   as enum ('driver','owner','shipper','admin');
create type public.trip_status as enum ('assigned','in_progress','completed','verified','needs_review','rejected','cancelled');

-- ---------- Settings (verification thresholds, editable by admin) ----------
create table public.app_settings (
  key   text primary key,
  value numeric not null,
  note  text
);
insert into public.app_settings(key, value, note) values
  ('max_point_accuracy_m',    50,   'Points with worse accuracy are ignored for distance'),
  ('max_segment_speed_kmh',   150,  'Faster segments are treated as GPS jumps'),
  ('max_avg_speed_kmh',       80,   'Trip average above this is flagged'),
  ('max_gap_minutes',         15,   'Longest allowed gap between points'),
  ('min_points_per_hour',     60,   'Coverage floor'),
  ('min_planned_ratio',       0.8,  'Tracked/planned distance lower bound'),
  ('max_planned_ratio',       1.6,  'Tracked/planned distance upper bound'),
  ('max_mocked_points',       0,    'Any mocked point beyond this flags the trip'),
  ('unsynced_grace_hours',    6,    'Verify anyway after this many hours if points are missing');

create or replace function public.setting(p_key text) returns numeric
language sql stable as $$ select value from public.app_settings where key = p_key $$;

-- ---------- Profiles ----------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        public.user_role not null default 'driver',
  full_name   text not null default '',
  phone       text unique,
  preferred_language text default 'en',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create or replace function public.my_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

-- New auth user → profile row (role defaults to driver; admins promote via console)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, phone) values (new.id, new.phone)
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Vehicles ----------
create table public.vehicles (
  id               uuid primary key default gen_random_uuid(),
  registration_no  text not null unique,
  vehicle_type     text not null,               -- e.g. '14ft', '19ft', 'multi-axle'
  owner_id         uuid references public.profiles(id),
  created_at       timestamptz not null default now()
);

-- ---------- Loads ----------
create sequence public.load_code_seq;
create table public.loads (
  id                 uuid primary key default gen_random_uuid(),
  load_code          text not null unique
                     default ('NL-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.load_code_seq')::text, 6, '0')),
  shipper_id         uuid references public.profiles(id),
  pickup_address     text not null,
  pickup_lat         double precision not null check (pickup_lat between -90 and 90),
  pickup_lng         double precision not null check (pickup_lng between -180 and 180),
  pickup_radius_m    integer not null default 500 check (pickup_radius_m between 50 and 5000),
  drop_address       text not null,
  drop_lat           double precision not null check (drop_lat between -90 and 90),
  drop_lng           double precision not null check (drop_lng between -180 and 180),
  drop_radius_m      integer not null default 500 check (drop_radius_m between 50 and 5000),
  planned_distance_m integer,
  material           text,
  weight_kg          numeric,
  notes              text,
  created_by         uuid references public.profiles(id) default auth.uid(),
  created_at         timestamptz not null default now(),
  pickup_geog extensions.geography(Point,4326)
    generated always as (extensions.st_setsrid(extensions.st_makepoint(pickup_lng, pickup_lat),4326)::extensions.geography) stored,
  drop_geog   extensions.geography(Point,4326)
    generated always as (extensions.st_setsrid(extensions.st_makepoint(drop_lng, drop_lat),4326)::extensions.geography) stored
);

-- ---------- Trips ----------
create table public.trips (
  id                   uuid primary key default gen_random_uuid(),
  load_id              uuid not null references public.loads(id),
  driver_id            uuid not null references public.profiles(id),
  vehicle_id           uuid not null references public.vehicles(id),
  status               public.trip_status not null default 'assigned',
  started_at           timestamptz,
  ended_at             timestamptz,
  start_lat double precision, start_lng double precision, start_accuracy_m real,
  end_lat   double precision, end_lng   double precision, end_accuracy_m   real,
  expected_points      integer,             -- client's final seq, sent at end_trip
  tracked_distance_m   integer,             -- set ONLY by verify_trip
  verification_reasons text[] not null default '{}',
  verification_metrics jsonb,
  verified_at          timestamptz,
  reviewed_by          uuid references public.profiles(id),
  review_note          text,
  device_info          jsonb,
  created_at           timestamptz not null default now()
);
create unique index trips_one_active_per_driver on public.trips(driver_id) where status = 'in_progress';
create unique index trips_one_open_per_load     on public.trips(load_id)
  where status in ('assigned','in_progress','completed','verified','needs_review');
create index trips_status_idx on public.trips(status);

-- ---------- Trip points ----------
create table public.trip_points (
  id          bigint generated always as identity primary key,
  trip_id     uuid not null references public.trips(id) on delete cascade,
  seq         integer not null check (seq > 0),
  recorded_at timestamptz not null,
  received_at timestamptz not null default now(),
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  accuracy_m  real,
  speed_mps   real,
  heading     real,
  altitude_m  real,
  is_mocked   boolean not null default false,
  geog extensions.geography(Point,4326)
    generated always as (extensions.st_setsrid(extensions.st_makepoint(lng, lat),4326)::extensions.geography) stored,
  unique (trip_id, seq)
);
create index trip_points_trip_time_idx on public.trip_points(trip_id, recorded_at);

-- ---------- Live position (realtime) ----------
create table public.trip_live (
  trip_id     uuid primary key references public.trips(id) on delete cascade,
  driver_id   uuid not null references public.profiles(id),
  lat double precision not null, lng double precision not null,
  speed_mps real, heading real, accuracy_m real,
  recorded_at timestamptz not null,
  updated_at  timestamptz not null default now()
);

-- ---------- Audit events ----------
create table public.trip_events (
  id         bigint generated always as identity primary key,
  trip_id    uuid not null references public.trips(id) on delete cascade,
  type       text not null,     -- started | ended | verified | needs_review | approved | rejected | ...
  actor_id   uuid default auth.uid(),
  payload    jsonb,
  created_at timestamptz not null default now()
);

-- ---------- Driver stats (the "verified experience") ----------
create table public.driver_stats (
  driver_id           uuid primary key references public.profiles(id) on delete cascade,
  verified_trips      integer not null default 0,
  verified_distance_m bigint  not null default 0,
  first_verified_at   timestamptz,
  last_verified_at    timestamptz,
  updated_at          timestamptz not null default now()
);

-- =====================================================================
-- Row Level Security
-- =====================================================================
-- Cross-table checks go through SECURITY DEFINER helpers so policies on
-- loads / trips / vehicles never recurse into each other.
create or replace function public.is_trip_driver_for_load(p_load_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trips where load_id = p_load_id and driver_id = auth.uid())
$$;
create or replace function public.is_trip_driver_for_vehicle(p_vehicle_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trips where vehicle_id = p_vehicle_id and driver_id = auth.uid())
$$;
create or replace function public.is_vehicle_owner(p_vehicle_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.vehicles where id = p_vehicle_id and owner_id = auth.uid())
$$;
create or replace function public.is_load_shipper(p_load_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.loads where id = p_load_id and shipper_id = auth.uid())
$$;
create or replace function public.can_read_trip(p_trip_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trips t
    where t.id = p_trip_id
      and (public.is_admin() or t.driver_id = auth.uid()
           or public.is_vehicle_owner(t.vehicle_id) or public.is_load_shipper(t.load_id)))
$$;
alter table public.app_settings enable row level security;
alter table public.profiles     enable row level security;
alter table public.vehicles     enable row level security;
alter table public.loads        enable row level security;
alter table public.trips        enable row level security;
alter table public.trip_points  enable row level security;
alter table public.trip_live    enable row level security;
alter table public.trip_events  enable row level security;
alter table public.driver_stats enable row level security;

-- settings
create policy settings_read  on public.app_settings for select to authenticated using (true);
create policy settings_admin on public.app_settings for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles: see self; admin sees/edits all. No self-update (prevents role escalation).
create policy profiles_self  on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_admin on public.profiles for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- vehicles
create policy vehicles_admin on public.vehicles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy vehicles_owner on public.vehicles for select to authenticated using (owner_id = auth.uid());
create policy vehicles_driver on public.vehicles for select to authenticated
  using (public.is_trip_driver_for_vehicle(id));

-- trips: read only for non-admins; all writes through RPCs
create policy trips_admin   on public.trips for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy trips_driver  on public.trips for select to authenticated using (driver_id = auth.uid());
create policy trips_owner   on public.trips for select to authenticated
  using (public.is_vehicle_owner(vehicle_id));
create policy trips_shipper on public.trips for select to authenticated
  using (public.is_load_shipper(load_id));

-- loads
create policy loads_admin   on public.loads for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy loads_shipper on public.loads for select to authenticated using (shipper_id = auth.uid());
create policy loads_driver  on public.loads for select to authenticated
  using (public.is_trip_driver_for_load(id));

-- trip_points: driver inserts only into own trip while tracking or awaiting final upload
create policy points_driver_insert on public.trip_points for insert to authenticated
  with check (exists (
    select 1 from public.trips t
    where t.id = trip_points.trip_id
      and t.driver_id = auth.uid()
      and (t.status = 'in_progress'
           or (t.status = 'completed' and trip_points.recorded_at <= t.ended_at + interval '2 minutes'))
      and trip_points.recorded_at >= t.started_at - interval '1 minute'
      and trip_points.recorded_at <= now() + interval '2 minutes'));
create policy points_read on public.trip_points for select to authenticated
  using (public.can_read_trip(trip_id));

-- trip_live, trip_events: read if you can read the trip
create policy live_read   on public.trip_live   for select to authenticated
  using (public.can_read_trip(trip_id));
create policy events_read on public.trip_events for select to authenticated
  using (public.can_read_trip(trip_id));

-- driver_stats: own + admin (public QR view comes in Phase 2 via a dedicated function)
create policy stats_self  on public.driver_stats for select to authenticated using (driver_id = auth.uid());
create policy stats_admin on public.driver_stats for select to authenticated using (public.is_admin());

-- =====================================================================
-- Verification (server-side only)
-- =====================================================================
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

  if v_start_d > l.pickup_radius_m + coalesce(t.start_accuracy_m, 0) then v_reasons := array_append(v_reasons, 'START_OUTSIDE_PICKUP'); end if;
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

create or replace function public.apply_verified_stats(p_trip_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.trips;
begin
  select * into t from public.trips where id = p_trip_id and status = 'verified';
  if not found then return; end if;
  insert into public.driver_stats(driver_id, verified_trips, verified_distance_m, first_verified_at, last_verified_at)
  values (t.driver_id, 1, coalesce(t.tracked_distance_m,0), t.ended_at, t.ended_at)
  on conflict (driver_id) do update set
    verified_trips      = driver_stats.verified_trips + 1,
    verified_distance_m = driver_stats.verified_distance_m + excluded.verified_distance_m,
    first_verified_at   = least(driver_stats.first_verified_at, excluded.first_verified_at),
    last_verified_at    = greatest(driver_stats.last_verified_at, excluded.last_verified_at),
    updated_at          = now();
end $$;

-- =====================================================================
-- Client RPCs
-- =====================================================================
create or replace function public.start_trip(
  p_trip_id uuid, p_lat double precision, p_lng double precision,
  p_accuracy_m real, p_device_info jsonb default null)
returns public.trips
language plpgsql security definer set search_path = public, extensions as $$
declare t public.trips; l public.loads; v_d double precision;
begin
  select * into t from public.trips where id = p_trip_id for update;
  if not found or t.driver_id <> auth.uid() then raise exception 'TRIP_NOT_FOUND' using errcode = 'P0002'; end if;
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

create or replace function public.end_trip(
  p_trip_id uuid, p_lat double precision, p_lng double precision, p_accuracy_m real,
  p_ended_at timestamptz, p_expected_points integer)
returns public.trips
language plpgsql security definer set search_path = public as $$
declare t public.trips; v_received int;
begin
  select * into t from public.trips where id = p_trip_id for update;
  if not found or t.driver_id <> auth.uid() then raise exception 'TRIP_NOT_FOUND' using errcode = 'P0002'; end if;
  if t.status <> 'in_progress' then raise exception 'TRIP_NOT_ACTIVE' using errcode = 'P0001'; end if;

  update public.trips set status = 'completed',
    ended_at = least(greatest(coalesce(p_ended_at, now()), t.started_at), now()),
    end_lat = p_lat, end_lng = p_lng, end_accuracy_m = p_accuracy_m,
    expected_points = p_expected_points
  where id = p_trip_id returning * into t;

  insert into public.trip_events(trip_id, type, payload)
  values (p_trip_id, 'ended', jsonb_build_object('expected_points', p_expected_points));

  select count(*) into v_received from public.trip_points where trip_id = p_trip_id;
  if p_expected_points is null or v_received >= p_expected_points then
    perform public.verify_trip(p_trip_id);
    select * into t from public.trips where id = p_trip_id;
  end if;

  delete from public.trip_live where trip_id = p_trip_id;
  return t;
end $$;

create or replace function public.admin_review_trip(p_trip_id uuid, p_approve boolean, p_note text)
returns public.trips
language plpgsql security definer set search_path = public as $$
declare t public.trips;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if coalesce(trim(p_note),'') = '' then raise exception 'NOTE_REQUIRED' using errcode = 'P0001'; end if;
  select * into t from public.trips where id = p_trip_id for update;
  if t.status <> 'needs_review' then raise exception 'TRIP_NOT_IN_REVIEW' using errcode = 'P0001'; end if;

  update public.trips set
    status = case when p_approve then 'verified'::public.trip_status else 'rejected'::public.trip_status end,
    verified_at = case when p_approve then now() end,
    reviewed_by = auth.uid(), review_note = p_note
  where id = p_trip_id returning * into t;

  insert into public.trip_events(trip_id, type, payload)
  values (p_trip_id, case when p_approve then 'approved' else 'rejected' end, jsonb_build_object('note', p_note));

  if p_approve then perform public.apply_verified_stats(p_trip_id); end if;
  return t;
end $$;

-- =====================================================================
-- Triggers & cron
-- =====================================================================
create or replace function public.on_trip_point_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare t public.trips; v_received int;
begin
  select * into t from public.trips where id = new.trip_id;
  if t.status = 'in_progress' then
    insert into public.trip_live(trip_id, driver_id, lat, lng, speed_mps, heading, accuracy_m, recorded_at, updated_at)
    values (new.trip_id, t.driver_id, new.lat, new.lng, new.speed_mps, new.heading, new.accuracy_m, new.recorded_at, now())
    on conflict (trip_id) do update set
      lat = excluded.lat, lng = excluded.lng, speed_mps = excluded.speed_mps, heading = excluded.heading,
      accuracy_m = excluded.accuracy_m, recorded_at = excluded.recorded_at, updated_at = now()
    where public.trip_live.recorded_at < excluded.recorded_at;
  elsif t.status = 'completed' and t.expected_points is not null then
    select count(*) into v_received from public.trip_points where trip_id = new.trip_id;
    if v_received >= t.expected_points then
      begin
        perform public.verify_trip(new.trip_id);
      exception when others then
        -- never reject the driver's upload because verification failed; the sweeper retries
        raise warning 'verify_trip failed for %: %', new.trip_id, sqlerrm;
      end;
    end if;
  end if;
  return null;
end $$;
create trigger trip_points_after_insert after insert on public.trip_points
  for each row execute function public.on_trip_point_insert();

-- Sweeper: verify trips whose remaining points never arrived
create or replace function public.sweep_unverified_trips() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.trips
           where status = 'completed'
             and ended_at < now() - make_interval(hours => public.setting('unsynced_grace_hours')::int)
  loop perform public.verify_trip(r.id); end loop;
end $$;
select cron.schedule('sweep-unverified-trips', '*/15 * * * *', $$select public.sweep_unverified_trips()$$);

-- =====================================================================
-- Grants
-- =====================================================================
revoke all on function public.verify_trip(uuid)          from public, anon, authenticated;
revoke all on function public.apply_verified_stats(uuid) from public, anon, authenticated;
revoke all on function public.sweep_unverified_trips()   from public, anon, authenticated;
revoke all on function public.start_trip(uuid,double precision,double precision,real,jsonb) from public, anon;
revoke all on function public.end_trip(uuid,double precision,double precision,real,timestamptz,integer) from public, anon;
revoke all on function public.admin_review_trip(uuid,boolean,text) from public, anon;
grant execute on function public.start_trip(uuid,double precision,double precision,real,jsonb) to authenticated;
grant execute on function public.end_trip(uuid,double precision,double precision,real,timestamptz,integer) to authenticated;
grant execute on function public.admin_review_trip(uuid,boolean,text) to authenticated;

-- Realtime
alter publication supabase_realtime add table public.trip_live;
