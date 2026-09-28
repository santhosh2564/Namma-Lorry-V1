-- =====================================================================
-- 0004 — realtime for trip_points (M11, docs/06 §3, docs/12 C6)
-- =====================================================================
-- C6 watches a trip and replays it. While the trip is still running the
-- reviewer needs the route to grow, not just the verdict: the recorded line is
-- drawn from `trip_points` (paged at 1000 rows), and the live tail arrives by
-- subscription.
--
-- 0001 published `trip_live` (the moving marker) and 0003 added `trips` (the
-- verdict). `trip_points` was never published, so a subscription to it would
-- succeed and then silently deliver nothing — the failure mode this migration
-- exists to prevent.
--
-- This is the largest table in the schema: every recorded point of every trip.
-- The client filters by `trip_id`, and RLS still applies per subscriber (a
-- driver only ever receives their own trip's points), so publishing the table
-- widens delivery of events the client is already authorised to read — it does
-- not widen access to any row.
--
-- Idempotent for the same reason as 0003: `alter publication ... add table`
-- raises if the table is already a member, so membership is checked first.
do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'trip_points'
  ) then
    alter publication supabase_realtime add table public.trip_points;
  end if;
end $$;
