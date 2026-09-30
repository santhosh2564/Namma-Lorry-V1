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
revoke all on function public.setting(text)                                   from public, anon;
revoke all on function public.my_role()                                       from public, anon;
revoke all on function public.is_admin()                                      from public, anon;
revoke all on function public.can_read_trip(uuid)                             from public, anon;
revoke all on function public.is_trip_driver_for_load(uuid)                   from public, anon;
revoke all on function public.is_trip_driver_for_vehicle(uuid)                from public, anon;
revoke all on function public.is_vehicle_owner(uuid)                          from public, anon;
revoke all on function public.is_load_shipper(uuid)                           from public, anon;

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
-- Same over-grant, worse consequences: EXECUTE on cron.schedule is "run this
-- SQL on this database". It is unreachable today only because `authenticated`
-- lacks USAGE on the cron schema — a separate privilege that a future grant,
-- or a Supabase image change, could hand over on its own. Both barriers go,
-- for that reason:
--
--   revoke usage on schema cron  -- the real one: without it no function in
--                                    the schema is nameable, whatever its ACL
--   revoke execute on the functions -- so the grant cannot become reachable
--                                       the moment the schema grant is added
--
-- The two Phase 1 jobs belong to the role that ran the migrations and run as
-- it, so neither removal costs anything.
--
-- Revoked by name across every overload rather than by a hard-coded
-- signature: the argument lists differ between pg_cron versions. unschedule
-- takes a bigint in some versions and a jobname *domain* in others (so the
-- signature is `cron.unschedule(cron.jobname_t)`, not `cron.unschedule(name)`),
-- and alter_job takes six arguments. A signature that does not exist on the
-- target would fail the whole migration instead of simply being skipped.
revoke all on schema cron from public, anon, authenticated;

do $$
declare
  r       record;
  v_count int := 0;
  v_left  text := '';
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'cron'
      and p.proname in ('schedule', 'unschedule', 'alter_job')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    v_count := v_count + 1;
  end loop;

  -- 0001 already fails without pg_cron (it calls cron.schedule), so reaching
  -- this point with nothing to revoke means pg_cron was reshaped in a way
  -- this migration does not know about. Fail rather than leave a grant in
  -- place that reads as though it had been removed.
  if v_count = 0 then
    raise exception
      '0012: no pg_cron scheduling functions found to revoke — the EXECUTE grants they carry are still in place';
  end if;

  -- Re-read the catalogue instead of trusting the revoke: a platform that
  -- hands the grant back (or a grant from a role other than the three named
  -- above) must be visible in the migration log, not only in a test.
  for r in
    select p.oid as oid, p.oid::regprocedure as sig, p.proacl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'cron'
      and p.proname in ('schedule', 'unschedule', 'alter_job')
  loop
    if has_function_privilege('anon', r.oid, 'execute')
       or has_function_privilege('authenticated', r.oid, 'execute') then
      v_left := v_left || format('%s acl=%s; ', r.sig, coalesce(r.proacl::text, 'NULL'));
    end if;
  end loop;

  raise notice '0012: revoked EXECUTE on % pg_cron function(s)', v_count;
  if v_left <> '' then
    raise warning '0012: still executable by a client role after the revoke: %', v_left;
  end if;
end $$;
