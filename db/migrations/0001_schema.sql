-- =====================================================================
-- Namma Lorry — Neon schema baseline (N1, docs/17)
-- Plain Postgres 15+ with PostGIS. Folds the final state of the 11
-- Supabase migrations (0001-0011) into one baseline, adapted for Neon +
-- Clerk instead of Supabase Auth + RLS. See docs/17 §"Migration
-- disposition table" for the per-file reasoning. Three structural
-- changes from the Supabase schema, applied throughout this file:
--
--   1. Every id that identified a person (profiles.id and every column
--      that referenced it) is `text`, not `uuid` — it now holds a Clerk
--      user id (e.g. "user_2abc..."), which Neon cannot generate or
--      validate itself. There is no `auth.users` table and no
--      `handle_new_user` trigger: a Clerk account gets no `profiles` row
--      at all until an admin creates one (functions/api/admin/drivers.ts,
--      N6), which is a *structural* version of migration 0007's
--      "no self-registration" fix, not just a ported one.
--   2. Every `auth.uid()` reference is gone. RLS and the Supabase-only
--      helper functions it needed (my_role, is_vehicle_owner,
--      is_load_shipper, is_trip_driver_for_load/vehicle, can_read_trip)
--      are deleted — that authorization now lives in the Pages
--      Functions layer (src/server/, functions/_lib/authz.ts, N3), which
--      is the only thing holding `DATABASE_URL` and the only thing that
--      can reach this database at all. Every function that checked
--      `auth.uid()` or `is_admin()` now takes an explicit
--      `p_driver_id`/`p_actor_id` parameter that the Function resolves
--      from the verified Clerk session — never from a request body.
--      One coarse RLS policy per table (`for all to app_role using
--      (true)`) stays on as a last-ditch guard, and `is_admin(p_actor_id
--      text)` stays as a defense-in-depth re-check inside Postgres, so a
--      bug in the calling Function still can't make Postgres approve a
--      non-admin action (docs/17 §"Honest downside and mitigation").
--   3. `pg_cron` is gone (Neon needs always-on compute for it — not
--      worth paying for two 15-minute/daily jobs). `sweep_unverified_trips`
--      and `downsample_old_points` are ported as plain callable
--      functions; a Cloudflare Cron Trigger calls them instead (N7). The
--      Supabase Realtime publication statements are gone outright — all
--      three subscriptions this schema used to back already have a
--      polling fallback (docs/17 §5), so nothing replaces them.
--
-- `verify_trip`, `apply_verified_stats` and the `trip_points` insert
-- trigger never referenced `auth.uid()` in the first place and port with
-- ZERO logic changes — this is deliberate: that function is the "nobody
-- types a kilometre" trust boundary (CLAUDE.md hard rule 1), and the
-- thing this migration must not touch. Every check in `start_trip` (the
-- advisory lock from 0008, the is_active check from 0007, the consent
-- version compare from 0009/0010, the NULL-position fix from 0011) is
-- folded in from day one rather than reintroduced and re-fixed.
-- =====================================================================
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

-- The one role the Pages Functions layer connects as. No password is set
-- here — that is `ALTER ROLE app_role WITH PASSWORD '...'`, run directly
-- against Neon by whoever provisions the project (docs/ENVIRONMENT.md),
-- never committed. Idempotent so this migration can be re-run.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_role') then
    create role app_role with login;
  end if;
end $$;

-- ---------- Enums ----------
create type public.user_role   as enum ('driver','owner','shipper','admin');
create type public.trip_status as enum ('assigned','in_progress','completed','verified','needs_review','rejected','cancelled');

-- ---------- Settings (verification thresholds, editable by admin) ----------
create table public.app_settings (
  key        text primary key,
  value      numeric not null,
  note       text,
  value_text text  -- added by migration 0009, folded in here for consent_version
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
  ('unsynced_grace_hours',    6,    'Verify anyway after this many hours if points are missing'),
  ('raw_point_retention_days', 365,
   'Days after a final trip ends before its raw points are reduced to a simplified route (<= 500 points)');
insert into public.app_settings(key, value, note, value_text) values
  ('consent_version', 0,
   'Current privacy-policy version. Must equal CONSENT_VERSION in the installed app (docs/09 section 1); bump only after that app update ships (docs/RUNBOOK.md).',
   '2026-10-01');

create or replace function public.setting(p_key text) returns numeric
language sql stable as $$ select value from public.app_settings where key = p_key $$;

create or replace function public.current_consent_version() returns text
language sql stable set search_path = public as $$
  select value_text from public.app_settings where key = 'consent_version'
$$;

-- ---------- Profiles ----------
-- id is a Clerk user id (text), not a Supabase auth.users uuid. No FK: the
-- identity provider is external to Neon. No implicit-creation trigger
-- exists anywhere in this schema — a Clerk account has no app access at
-- all until an admin inserts a row here (N6's admin-create-driver port),
-- which is strictly stronger than migration 0007's "defaults inactive".
create table public.profiles (
  id                 text primary key,
  role               public.user_role not null default 'driver',
  full_name          text not null default '',
  phone              text unique,
  preferred_language text default 'en',
  is_active          boolean not null default true,
  consent_version    text,            -- added by migration 0002
  consent_at         timestamptz,     -- added by migration 0002
  erased_at          timestamptz,     -- added by migration 0006
  created_at         timestamptz not null default now()
);

-- Defense-in-depth only (docs/17 §"Honest downside and mitigation" item
-- 3): the Pages Functions layer already checks this in TypeScript before
-- calling an admin-only RPC. Kept as an explicit-parameter re-check so a
-- wiring bug in the caller still can't get Postgres to approve a
-- non-admin action. Was `is_admin()` reading `auth.uid()`; now takes the
-- actor id the Function resolved from the verified Clerk session.
create or replace function public.is_admin(p_actor_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = p_actor_id and is_active and role = 'admin'
  )
$$;

-- ---------- Vehicles ----------
create table public.vehicles (
  id               uuid primary key default gen_random_uuid(),
  registration_no  text not null unique,
  vehicle_type     text not null,               -- e.g. '14ft', '19ft', 'multi-axle'
  owner_id         text references public.profiles(id),
  created_at       timestamptz not null default now()
);

-- ---------- Loads ----------
create sequence public.load_code_seq;
create table public.loads (
  id                 uuid primary key default gen_random_uuid(),
  load_code          text not null unique
                     default ('NL-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.load_code_seq')::text, 6, '0')),
  shipper_id         text references public.profiles(id),
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
  -- Was `default auth.uid()`; the Function sets this explicitly from the
  -- verified admin's session instead of Postgres inferring it.
  created_by         text references public.profiles(id),
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
  driver_id            text not null references public.profiles(id),
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
  reviewed_by          text references public.profiles(id),
  review_note          text,
  device_info          jsonb,
  points_downsampled_at timestamptz,        -- added by migration 0006
  created_at           timestamptz not null default now(),
  -- Was RLS's `trips_admin_assign` WITH CHECK (migration 0005): a freshly
  -- assigned trip must have every server-owned column empty. That check
  -- had nothing to do with who the caller was, so it is a plain table
  -- constraint here, not a per-role policy — a genuine simplification,
  -- not just a port (docs/17 §N2).
  constraint trips_fresh_assignment_is_empty check (
    status <> 'assigned' or (
      started_at is null and ended_at is null
      and start_lat is null and start_lng is null and start_accuracy_m is null
      and end_lat is null and end_lng is null and end_accuracy_m is null
      and expected_points is null and tracked_distance_m is null
      and cardinality(verification_reasons) = 0 and verification_metrics is null
      and verified_at is null and reviewed_by is null and review_note is null
    )
  )
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

-- ---------- Live position ----------
-- Supabase Realtime published this table so the console's live board
-- updated without polling (migration 0001). No Neon/Cloudflare equivalent
-- exists; the board already falls back to polling when the socket is
-- unavailable (docs/17 §5), so this table stays as the row the poll
-- reads, just never published anywhere.
create table public.trip_live (
  trip_id     uuid primary key references public.trips(id) on delete cascade,
  driver_id   text not null references public.profiles(id),
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
  -- Was `default auth.uid()`; every caller below now passes this
  -- explicitly (the driver's or admin's id from the verified session), or
  -- NULL for a system-generated event (verify_trip's own row).
  actor_id   text,
  payload    jsonb,
  created_at timestamptz not null default now()
);

-- ---------- Admin audit log (migration 0006) ----------
-- Audit log for admin actions that are not about one trip (trip_events
-- needs a trip). target_id has no FK ("the audit row must outlive its
-- target" — it survives a driver's erasure).
create table public.admin_events (
  id         bigint generated always as identity primary key,
  action     text not null,          -- driver_erased | ...
  target_id  text,
  actor_id   text,                   -- was `default auth.uid()`; now explicit
  payload    jsonb,
  created_at timestamptz not null default now()
);

-- ---------- Driver stats (the "verified experience") ----------
create table public.driver_stats (
  driver_id           text primary key references public.profiles(id) on delete cascade,
  verified_trips      integer not null default 0,
  verified_distance_m bigint  not null default 0,
  first_verified_at   timestamptz,
  last_verified_at    timestamptz,
  updated_at          timestamptz not null default now()
);

-- =====================================================================
-- Row-level security: one coarse guard, not per-row authorization
-- =====================================================================
-- Supabase's RLS did two jobs here: (a) prove the client — which had the
-- anon key and talked to Postgres directly — could never see or write a
-- row it wasn't allowed to, and (b) per-row authorization (driver sees
-- own, owner/shipper see related, admin sees all). Job (a) is now true by
-- topology instead of by policy: there is no PostgREST-equivalent
-- endpoint and no client-visible connection string, so only the Pages
-- Functions layer can reach this database at all (docs/17 §"The central
-- decision"). Job (b) moves into functions/_lib/authz.ts (N3), in
-- TypeScript, against the same role/ownership columns these policies used
-- to check. What stays here is the coarse guard: only `app_role` may
-- touch these tables at all, full stop. This is deliberately NOT a
-- per-row policy.
alter table public.app_settings enable row level security;
alter table public.profiles     enable row level security;
alter table public.vehicles     enable row level security;
alter table public.loads        enable row level security;
alter table public.trips        enable row level security;
alter table public.trip_points  enable row level security;
alter table public.trip_live    enable row level security;
alter table public.trip_events  enable row level security;
alter table public.driver_stats enable row level security;
alter table public.admin_events enable row level security;

create policy app_role_only on public.app_settings for all to app_role using (true) with check (true);
create policy app_role_only on public.profiles     for all to app_role using (true) with check (true);
create policy app_role_only on public.vehicles      for all to app_role using (true) with check (true);
create policy app_role_only on public.loads         for all to app_role using (true) with check (true);
create policy app_role_only on public.trips         for all to app_role using (true) with check (true);
create policy app_role_only on public.trip_points   for all to app_role using (true) with check (true);
create policy app_role_only on public.trip_live     for all to app_role using (true) with check (true);
create policy app_role_only on public.trip_events   for all to app_role using (true) with check (true);
create policy app_role_only on public.driver_stats  for all to app_role using (true) with check (true);
create policy app_role_only on public.admin_events  for all to app_role using (true) with check (true);

revoke all on all tables in schema public from public;
grant usage on schema public to app_role;
grant select, insert, update, delete on all tables in schema public to app_role;
grant usage, select on all sequences in schema public to app_role;

-- =====================================================================
-- Verification (server-side only) — byte-identical to Supabase migration
-- 0011 (the final version after the 0001 bug fix). Never referenced
-- auth.uid(); nothing here changes for the Clerk/Neon migration.
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

  -- System-generated event, no human actor: actor_id stays NULL on purpose.
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
-- Client RPCs — final Supabase body (migration 0011) with auth.uid()
-- replaced by an explicit p_driver_id/p_actor_id parameter the caller
-- (functions/api/trips/..., N4) resolves from the verified Clerk
-- session. Every check from every prior migration is folded in: the
-- advisory lock (0008), is_active (0007), consent-version compare
-- (0009/0010), the NULL-position fix (0011).
-- =====================================================================
create or replace function public.start_trip(
  p_driver_id text, p_trip_id uuid, p_lat double precision, p_lng double precision,
  p_accuracy_m real, p_device_info jsonb default null)
returns public.trips
language plpgsql security definer set search_path = public, extensions as $$
declare t public.trips; l public.loads; v_d double precision;
begin
  perform pg_advisory_xact_lock(hashtextextended('start_trip:' || coalesce(p_driver_id, ''), 0));

  if not exists (select 1 from public.profiles where id = p_driver_id and is_active) then
    raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into t from public.trips where id = p_trip_id for update;
  if not found or t.driver_id <> p_driver_id then raise exception 'TRIP_NOT_FOUND' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.profiles
                  where id = p_driver_id
                    and consent_version collate "C" >= public.current_consent_version() collate "C") then
    raise exception 'CONSENT_REQUIRED' using errcode = 'P0001'; end if;
  if t.status <> 'assigned' then raise exception 'TRIP_NOT_STARTABLE' using errcode = 'P0001'; end if;
  if exists (select 1 from public.trips where driver_id = p_driver_id and status = 'in_progress') then
    raise exception 'ANOTHER_TRIP_ACTIVE' using errcode = 'P0001'; end if;
  -- No position means no geofence: st_distance(NULL, ...) is NULL and the
  -- comparison below would silently pass, so the position is required
  -- here, alongside the accuracy the existing check already requires.
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

  insert into public.trip_events(trip_id, type, actor_id, payload)
  values (p_trip_id, 'started', p_driver_id, jsonb_build_object('distance_to_pickup_m', round(v_d)));
  return t;
end $$;

create or replace function public.end_trip(
  p_driver_id text, p_trip_id uuid, p_lat double precision, p_lng double precision, p_accuracy_m real,
  p_ended_at timestamptz, p_expected_points integer)
returns public.trips
language plpgsql security definer set search_path = public as $$
declare t public.trips; v_received int;
begin
  select * into t from public.trips where id = p_trip_id for update;
  if not found or t.driver_id <> p_driver_id then raise exception 'TRIP_NOT_FOUND' using errcode = 'P0002'; end if;
  if t.status <> 'in_progress' then raise exception 'TRIP_NOT_ACTIVE' using errcode = 'P0001'; end if;

  update public.trips set status = 'completed',
    ended_at = least(greatest(coalesce(p_ended_at, now()), t.started_at), now()),
    end_lat = p_lat, end_lng = p_lng, end_accuracy_m = p_accuracy_m,
    expected_points = p_expected_points
  where id = p_trip_id returning * into t;

  insert into public.trip_events(trip_id, type, actor_id, payload)
  values (p_trip_id, 'ended', p_driver_id, jsonb_build_object('expected_points', p_expected_points));

  select count(*) into v_received from public.trip_points where trip_id = p_trip_id;
  if p_expected_points is null or v_received >= p_expected_points then
    perform public.verify_trip(p_trip_id);
    select * into t from public.trips where id = p_trip_id;
  end if;

  delete from public.trip_live where trip_id = p_trip_id;
  return t;
end $$;

create or replace function public.admin_review_trip(p_actor_id text, p_trip_id uuid, p_approve boolean, p_note text)
returns public.trips
language plpgsql security definer set search_path = public as $$
declare t public.trips;
begin
  if not public.is_admin(p_actor_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if coalesce(trim(p_note),'') = '' then raise exception 'NOTE_REQUIRED' using errcode = 'P0001'; end if;
  select * into t from public.trips where id = p_trip_id for update;
  if t.status <> 'needs_review' then raise exception 'TRIP_NOT_IN_REVIEW' using errcode = 'P0001'; end if;

  update public.trips set
    status = case when p_approve then 'verified'::public.trip_status else 'rejected'::public.trip_status end,
    verified_at = case when p_approve then now() end,
    reviewed_by = p_actor_id, review_note = p_note
  where id = p_trip_id returning * into t;

  insert into public.trip_events(trip_id, type, actor_id, payload)
  values (p_trip_id, case when p_approve then 'approved' else 'rejected' end, p_actor_id, jsonb_build_object('note', p_note));

  if p_approve then perform public.apply_verified_stats(p_trip_id); end if;
  return t;
end $$;

-- Cancel an assigned trip (migration 0005). The load can then be assigned
-- again: `cancelled` is outside trips_one_open_per_load.
create or replace function public.cancel_trip(p_actor_id text, p_trip_id uuid, p_note text)
returns public.trips
language plpgsql security definer set search_path = public as $$
declare t public.trips;
begin
  if not public.is_admin(p_actor_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if coalesce(trim(p_note),'') = '' then raise exception 'NOTE_REQUIRED' using errcode = 'P0001'; end if;
  select * into t from public.trips where id = p_trip_id for update;
  if not found then raise exception 'TRIP_NOT_FOUND' using errcode = 'P0002'; end if;
  if t.status <> 'assigned' then raise exception 'TRIP_NOT_CANCELLABLE' using errcode = 'P0001'; end if;

  update public.trips set status = 'cancelled' where id = p_trip_id returning * into t;

  insert into public.trip_events(trip_id, type, actor_id, payload)
  values (p_trip_id, 'cancelled', p_actor_id, jsonb_build_object('note', p_note));
  return t;
end $$;

-- End an in_progress trip the driver cannot end (migration 0005). Verified
-- over the points that arrived; it can never auto-verify (expected_points
-- is set one above the received count, so MISSING_POINTS always applies)
-- and there is no end position, so END_OUTSIDE_DROP is flagged too.
create or replace function public.admin_force_end(p_actor_id text, p_trip_id uuid, p_note text)
returns public.trips
language plpgsql security definer set search_path = public as $$
declare t public.trips; v_received int; v_last timestamptz;
begin
  if not public.is_admin(p_actor_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if coalesce(trim(p_note),'') = '' then raise exception 'NOTE_REQUIRED' using errcode = 'P0001'; end if;
  select * into t from public.trips where id = p_trip_id for update;
  if not found then raise exception 'TRIP_NOT_FOUND' using errcode = 'P0002'; end if;
  if t.status <> 'in_progress' then raise exception 'TRIP_NOT_ACTIVE' using errcode = 'P0001'; end if;

  select count(*), max(recorded_at) into v_received, v_last
  from public.trip_points where trip_id = p_trip_id;

  update public.trips set status = 'completed',
    ended_at = least(greatest(coalesce(v_last, now()), t.started_at), now()),
    expected_points = v_received + 1
  where id = p_trip_id;

  insert into public.trip_events(trip_id, type, actor_id, payload)
  values (p_trip_id, 'force_ended', p_actor_id, jsonb_build_object('note', p_note, 'received_points', v_received));

  perform public.verify_trip(p_trip_id);
  delete from public.trip_live where trip_id = p_trip_id;

  select * into t from public.trips where id = p_trip_id;
  return t;
end $$;

-- ---------- Consent (migration 0002, with 0009/0010's version compare) ----------
-- Drivers have no UPDATE grant on profiles at the app layer, so this
-- SECURITY DEFINER function is the only way a non-admin can write these
-- two columns, and only on their own row.
create or replace function public.record_consent(p_user_id text, p_version text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare p public.profiles; v_current text; v_version text;
begin
  if p_user_id is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if coalesce(trim(p_version), '') = '' then raise exception 'VERSION_REQUIRED' using errcode = 'P0001'; end if;

  v_current := public.current_consent_version();
  if v_current is null then raise exception 'VERSION_NOT_CONFIGURED' using errcode = 'P0001'; end if;

  v_version := trim(p_version);
  -- Older than the current version: this build is out of date.
  if v_version collate "C" < v_current collate "C" then
    raise exception 'VERSION_NOT_CURRENT' using errcode = 'P0001';
  end if;
  if v_version !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'VERSION_INVALID' using errcode = 'P0001';
  end if;

  update public.profiles
     set consent_version = v_version, consent_at = now()
   where id = p_user_id and is_active
  returning * into p;
  if not found then raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002'; end if;
  return p;
end $$;

-- ---------- Retention (migration 0006) ----------
-- Final trips only (verified / rejected / cancelled): a trip in review
-- still needs its full track. Simplifies the route with ST_Simplify at a
-- growing tolerance until it has <= 500 vertices; those vertex points
-- (always including the first and last) are kept, every other point is
-- deleted. The trip's result (distance, reasons, metrics) is untouched.
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

-- ---------- Erasure (migration 0006) ----------
-- Erases a driver's personal data: every GPS point and live position, the
-- name and phone number, and the start/end positions and device info on
-- their trips. Anonymised trip results and driver_stats stay, so fleet
-- history and aggregate km survive. Assigned trips are cancelled so their
-- loads can be reassigned. A trip still collecting points (in_progress /
-- completed) must be finished or force-ended first. The Clerk account
-- itself is not touched here — that is a Clerk dashboard/API action.
create or replace function public.admin_erase_driver(p_actor_id text, p_driver_id text, p_note text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_points int; v_trips int; v_cancelled int; v_result jsonb;
begin
  if not public.is_admin(p_actor_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
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

  insert into public.trip_events(trip_id, type, actor_id, payload)
  select id, 'cancelled', p_actor_id, jsonb_build_object('note', 'Driver erased')
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
  insert into public.admin_events(action, target_id, actor_id, payload)
  values ('driver_erased', p_driver_id, p_actor_id, v_result || jsonb_build_object('note', p_note));
  return v_result;
end $$;

-- =====================================================================
-- Triggers & the sweeper (no cron here — Cloudflare Cron Trigger calls it, N7)
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

-- Verify trips whose remaining points never arrived. Called by a
-- Cloudflare Cron Trigger hitting functions/api/cron/sweep-unverified-trips
-- (N7) every 15 minutes, not by pg_cron.
create or replace function public.sweep_unverified_trips() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.trips
           where status = 'completed'
             and ended_at < now() - make_interval(hours => public.setting('unsynced_grace_hours')::int)
  loop perform public.verify_trip(r.id); end loop;
end $$;

-- =====================================================================
-- Grants — EXECUTE is scoped to app_role only (there is no
-- authenticated/anon distinction here; app_role is the only role that
-- can ever hold a live connection to this database).
-- =====================================================================
revoke all on function public.verify_trip(uuid)          from public;
revoke all on function public.apply_verified_stats(uuid) from public;
revoke all on function public.sweep_unverified_trips()   from public;
revoke all on function public.downsample_old_points()    from public;
revoke all on function public.is_admin(text)             from public;
revoke all on function public.start_trip(text,uuid,double precision,double precision,real,jsonb) from public;
revoke all on function public.end_trip(text,uuid,double precision,double precision,real,timestamptz,integer) from public;
revoke all on function public.admin_review_trip(text,uuid,boolean,text) from public;
revoke all on function public.cancel_trip(text,uuid,text) from public;
revoke all on function public.admin_force_end(text,uuid,text) from public;
revoke all on function public.record_consent(text,text) from public;
revoke all on function public.admin_erase_driver(text,text,text) from public;

grant execute on function public.verify_trip(uuid)          to app_role;
grant execute on function public.apply_verified_stats(uuid) to app_role;
grant execute on function public.sweep_unverified_trips()   to app_role;
grant execute on function public.downsample_old_points()    to app_role;
grant execute on function public.is_admin(text)             to app_role;
grant execute on function public.start_trip(text,uuid,double precision,double precision,real,jsonb) to app_role;
grant execute on function public.end_trip(text,uuid,double precision,double precision,real,timestamptz,integer) to app_role;
grant execute on function public.admin_review_trip(text,uuid,boolean,text) to app_role;
grant execute on function public.cancel_trip(text,uuid,text) to app_role;
grant execute on function public.admin_force_end(text,uuid,text) to app_role;
grant execute on function public.record_consent(text,text) to app_role;
grant execute on function public.admin_erase_driver(text,text,text) to app_role;
