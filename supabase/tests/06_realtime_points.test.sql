-- =====================================================================
-- Namma Lorry — 06: realtime publication for the C6 live route
--
-- C6 appends points to the route it is replaying through a `postgres_changes`
-- subscription on `trip_points` (docs/12 C6, docs/06 §3). That only works if
-- the table is *published*; a subscription to an unpublished table succeeds and
-- then silently never delivers anything, which on a live map looks exactly like
-- a truck that has stopped moving.
--
-- Migration 0004 adds the membership; this proves it alongside 0003's, because
-- a regression in either would be invisible from the app alone.
-- =====================================================================
begin;

\ir _helpers.psql

select plan(2);

select ok(
  exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'trip_points'),
  'trip_points is published, so C6 can append points to the live route');

select ok(
  exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'trips'),
  'trips is still published, so the D6/C6 verdict subscription keeps working');

select * from finish();
rollback;
