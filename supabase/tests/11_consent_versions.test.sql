-- =====================================================================
-- Namma Lorry — 11: which consent versions count (0010, docs/09 §1)
-- 0009 accepted only the exact current version. The release order is app
-- first, then the migration (docs/RUNBOOK.md §Changing the policy version), so
-- in between the new build records a version NEWER than the database's; with
-- exact matching every driver on that build was stuck on D1. 0010: the current
-- version or a newer one counts; an older one is VERSION_NOT_CURRENT ("update
-- the app"); a non-date is VERSION_INVALID. Versions are YYYY-MM-DD.
-- start_trip's side of the rule is in suite 10 with its other checks.
-- =====================================================================
begin;

\ir _helpers.psql

select plan(10);

select tests.create_user('db000000-0000-4000-8000-000000000001', '919000001101', 'driver', 'Driver A');
update public.profiles set consent_version = '2026-09-27.1', consent_at = '2026-09-27 10:00+05:30'
 where id = 'db000000-0000-4000-8000-000000000001';

select is(public.current_consent_version(), '2026-10-01', 'the current version is 2026-10-01');

-- ---- refused: older, pre-0009, malformed --------------------------------
select tests.as_user('db000000-0000-4000-8000-000000000001');
select throws_ok($$select public.record_consent('2025-01-01')$$,
  'P0001', 'VERSION_NOT_CURRENT', 'an older version is refused (an out-of-date build)');
-- Not a plain date, but older: it must read as "update the app", so the
-- older-than-current check runs before the format check.
select throws_ok($$select public.record_consent('2026-09-27.1')$$,
  'P0001', 'VERSION_NOT_CURRENT', 'a pre-0009 build''s 2026-09-27.1 gets VERSION_NOT_CURRENT, not a format error');
select throws_ok($$select public.record_consent('v2')$$,
  'P0001', 'VERSION_INVALID', 'a version that is not YYYY-MM-DD is refused');
select throws_ok($$select public.record_consent('2026-13-99x')$$,
  'P0001', 'VERSION_INVALID', 'a newer-looking string that is not YYYY-MM-DD is refused');

set local role postgres;
select is((select consent_version from public.profiles where id = 'db000000-0000-4000-8000-000000000001'),
  '2026-09-27.1', 'a refused version leaves the stored consent alone');
select is((select consent_at from public.profiles where id = 'db000000-0000-4000-8000-000000000001'),
  '2026-09-27 10:00+05:30'::timestamptz, '...and its timestamp');

-- ---- accepted: newer (the app shipped before the migration) -------------
select tests.as_user('db000000-0000-4000-8000-000000000001');
select lives_ok($$select public.record_consent('2026-12-01')$$,
  'a newer version is accepted (the app update ships before the migration)');
set local role postgres;
select is((select consent_version from public.profiles where id = 'db000000-0000-4000-8000-000000000001'),
  '2026-12-01', 'the newer version is stored');
select ok((select consent_at > '2026-09-27 10:00+05:30'::timestamptz from public.profiles
            where id = 'db000000-0000-4000-8000-000000000001'),
  '...with a new timestamp');

select * from finish();
rollback;
