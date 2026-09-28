-- =====================================================================
-- Namma Lorry — 05: realtime publication for D6
--
-- D6 Trip Summary subscribes to its own `trips` row so a verification verdict
-- arrives without the driver refreshing (docs/12 D6, docs/06 §3). That only
-- works if the table is *published*; a subscription to an unpublished table
-- succeeds and then silently never delivers anything, which is the worst kind
-- of broken — hence an assertion rather than a comment.
--
-- 0003 adds the membership; this proves it, and that the publication it joins
-- exists at all (Supabase creates `supabase_realtime`; a plain Postgres would
-- fail here, and it should).
-- =====================================================================
begin;

\ir _helpers.psql

select plan(2);

select ok(
  exists (select 1 from pg_publication where pubname = 'supabase_realtime'),
  'the supabase_realtime publication exists');

select ok(
  exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'trips'),
  'trips is published, so D6 can subscribe to its own trip row');

select * from finish();
rollback;
