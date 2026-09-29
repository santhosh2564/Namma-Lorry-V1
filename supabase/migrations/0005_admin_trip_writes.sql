-- =====================================================================
-- Namma Lorry — 0005: admin trip writes only through audited RPCs (ND-13)
-- Validation report B2 (rls-attacks.md A29): `trips_admin` was FOR ALL, so an
-- admin client could PATCH trips.status / tracked_distance_m with no event and
-- no stats (CLAUDE.md hard rule 2). Admins now read and assign; every other
-- status change is an RPC that requires a note and records the admin.
-- =====================================================================

drop policy trips_admin on public.trips;

create policy trips_admin_read on public.trips for select to authenticated
  using (public.is_admin());

-- Assignment (console C4) inserts a fresh trip. Anything the server owns
-- (status past 'assigned', timestamps, positions, verification) stays empty.
create policy trips_admin_assign on public.trips for insert to authenticated
  with check (
    public.is_admin()
    and status = 'assigned'
    and started_at is null and ended_at is null
    and start_lat is null and start_lng is null and start_accuracy_m is null
    and end_lat is null and end_lng is null and end_accuracy_m is null
    and expected_points is null and tracked_distance_m is null
    and cardinality(verification_reasons) = 0 and verification_metrics is null
    and verified_at is null and reviewed_by is null and review_note is null);

-- Cancel an assigned trip (wrong driver/vehicle, load withdrawn). The load
-- can then be assigned again: `cancelled` is outside trips_one_open_per_load.
create or replace function public.cancel_trip(p_trip_id uuid, p_note text)
returns public.trips
language plpgsql security definer set search_path = public as $$
declare t public.trips;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if coalesce(trim(p_note),'') = '' then raise exception 'NOTE_REQUIRED' using errcode = 'P0001'; end if;
  select * into t from public.trips where id = p_trip_id for update;
  if not found then raise exception 'TRIP_NOT_FOUND' using errcode = 'P0002'; end if;
  if t.status <> 'assigned' then raise exception 'TRIP_NOT_CANCELLABLE' using errcode = 'P0001'; end if;

  update public.trips set status = 'cancelled' where id = p_trip_id returning * into t;

  insert into public.trip_events(trip_id, type, payload)
  values (p_trip_id, 'cancelled', jsonb_build_object('note', p_note));
  return t;
end $$;

-- End an in_progress trip the driver cannot end (phone lost, app uninstalled).
-- The trip is verified over the points that arrived, but it can never verify on
-- its own: expected_points is set one above the received count, so verify_trip
-- always adds MISSING_POINTS and the trip lands in needs_review. There is no end
-- position, so END_OUTSIDE_DROP is flagged too. ended_at is the last point.
create or replace function public.admin_force_end(p_trip_id uuid, p_note text)
returns public.trips
language plpgsql security definer set search_path = public as $$
declare t public.trips; v_received int; v_last timestamptz;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
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

  insert into public.trip_events(trip_id, type, payload)
  values (p_trip_id, 'force_ended', jsonb_build_object('note', p_note, 'received_points', v_received));

  perform public.verify_trip(p_trip_id);
  delete from public.trip_live where trip_id = p_trip_id;

  select * into t from public.trips where id = p_trip_id;
  return t;
end $$;

revoke all on function public.cancel_trip(uuid,text)     from public, anon;
revoke all on function public.admin_force_end(uuid,text) from public, anon;
grant execute on function public.cancel_trip(uuid,text)     to authenticated;
grant execute on function public.admin_force_end(uuid,text) to authenticated;
