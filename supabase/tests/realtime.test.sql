begin;
\ir _helpers.psql
select plan(2);

select ok(exists(select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trips'),
          'trips is in the realtime publication (D6)');
select ok(exists(select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_live'),
          'trip_live is still in the realtime publication (C1)');

select * from finish();
rollback;
