-- =====================================================================
-- Namma Lorry — 0012: the RLS helper functions are authenticated-only
--
-- Postgres grants EXECUTE on a new function to PUBLIC. Every helper that
-- 0001 wrote to make its policies readable — my_role, is_admin,
-- can_read_trip, is_trip_driver_for_load, and the rest — therefore reached
-- `anon` as well as `authenticated`, and the audit found a live side door
-- around the policies those helpers exist to serve:
--
--   set role anon;
--   select count(*) from public.app_settings;      -- 0: no SELECT policy
--   select public.setting('max_gap_minutes');     -- 50: returned anyway
--   select public.setting('raw_point_retention_days');
--   select public.current_consent_version();
--
-- So "app_settings is not readable without a session" was true only of the
-- table. Nothing leaked that is secret, but a policy that can be walked
-- around with a function call is not fail-closed, and the next helper added
-- would inherit the same hole by default.
--
-- The fix is the grant, not the function. Every RLS policy in this schema is
-- declared `to authenticated` and evaluates its predicate as the invoking
-- role, so `authenticated` still needs EXECUTE on the helpers; `anon` never
-- evaluates a policy and needs none. Revoking from PUBLIC and granting
-- explicitly is what actually removes anon's access — revoking from the role
-- alone would not, because anon's grant comes from PUBLIC.
--
-- The trigger functions lose it outright: they are run by the trigger
-- mechanism as the table owner and can never be called directly anyway
-- ("trigger functions can only be called as triggers").
--
-- Nothing here changes behaviour for the app: it authenticates with a
-- session, so it runs as `authenticated` and keeps every privilege it had.
-- =====================================================================

-- ---------- 1. Helpers the RLS policies evaluate ----------------------
-- Revoked from PUBLIC *and* from anon on purpose. A fresh Postgres grants
-- EXECUTE to PUBLIC, and revoking from PUBLIC is enough there — but an
-- installation that ran `grant ... to anon` (some provisioning scripts and
-- the local stand-in used by the test suite do) carries a separate explicit
-- grant that revoking from PUBLIC leaves untouched, because privileges are
-- additive. Doing both is correct either way and costs nothing.
revoke all on function public.setting(text)                              from public, anon;
revoke all on function public.my_role()                                  from public, anon;
revoke all on function public.is_admin()                                 from public, anon;
revoke all on function public.can_read_trip(uuid)                        from public, anon;
revoke all on function public.is_trip_driver_for_load(uuid)              from public, anon;
revoke all on function public.is_trip_driver_for_vehicle(uuid)           from public, anon;
revoke all on function public.is_vehicle_owner(uuid)                     from public, anon;
revoke all on function public.is_load_shipper(uuid)                      from public, anon;

grant execute on function public.setting(text)                  to authenticated;
grant execute on function public.my_role()                      to authenticated;
grant execute on function public.is_admin()                     to authenticated;
grant execute on function public.can_read_trip(uuid)            to authenticated;
grant execute on function public.is_trip_driver_for_load(uuid)  to authenticated;
grant execute on function public.is_trip_driver_for_vehicle(uuid) to authenticated;
grant execute on function public.is_vehicle_owner(uuid)         to authenticated;
grant execute on function public.is_load_shipper(uuid)          to authenticated;

-- ---------- 2. current_consent_version --------------------------------
-- Nothing calls this as authenticated: the app sends the version it was
-- built with, the SECURITY DEFINER functions that check it (start_trip,
-- record_consent) run as the owner, and a signed-in user can read the same
-- value straight out of app_settings. So `anon` loses it and authenticated
-- keeps what it already effectively had.
revoke all on function public.current_consent_version() from public, anon;

-- ---------- 3. Trigger functions ---------------------------------------
-- Belt and braces. They were already uncallable from a client (Postgres
-- rejects a direct call to a trigger function); taking EXECUTE away means a
-- future change cannot turn one into an entry point. Nothing needs them as
-- authenticated: a trigger runs as the table owner.
revoke all on function public.handle_new_user()      from public, anon, authenticated;
revoke all on function public.on_trip_point_insert() from public, anon, authenticated;

-- ---------- 4. pg_cron ------------------------------------------------
-- Same over-grant, worse consequences: EXECUTE on cron.schedule is
-- "schedule this SQL to run on this database". It is not reachable today
-- only because `authenticated` lacks USAGE on the cron schema — a separate
-- privilege that a future grant (or a Supabase config change) could hand over
-- on its own. The two Phase 1 jobs are owned by the role that ran the
-- migrations and run as it, so removing EXECUTE from the client roles costs
-- nothing.
--
-- Revoked by name across every overload rather than by a hard-coded
-- signature: the argument lists differ between pg_cron versions
-- (unschedule takes name or bigint, alter_job takes six arguments), and a
-- signature that does not exist on the target would fail the whole migration
-- instead of simply being skipped.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'cron'
      and p.proname in ('schedule', 'unschedule', 'alter_job')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;