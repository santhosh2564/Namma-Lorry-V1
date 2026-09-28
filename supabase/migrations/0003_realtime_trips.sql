-- =====================================================================
-- 0003 — realtime for the trips row (M10, docs/06 §3, docs/12 D6)
-- =====================================================================
-- 0001 published `trip_live` — the moving marker the ops dashboard follows —
-- but not `trips` itself. D6 Trip Summary needs the opposite: it sits on one
-- trip row and waits for `verify_trip` to move it from `completed` to
-- `verified` / `needs_review`, which can happen while the driver is looking at
-- the screen (docs/08 §4). Subscribing to the row is what makes that verdict
-- arrive on its own.
--
-- RLS still applies: Realtime evaluates the subscriber's policies per row, so a
-- driver receives changes only for their own trips (`trips_driver`) and an admin
-- for all of them — publishing the table does not widen access.
--
-- Idempotent: `alter publication ... add table` raises if the table is already
-- a member, so membership is checked first. That keeps the migration safe to
-- re-run on a database where 0001 was applied by hand.
do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'trips'
  ) then
    alter publication supabase_realtime add table public.trips;
  end if;
end $$;
