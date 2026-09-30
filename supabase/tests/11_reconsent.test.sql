-- =====================================================================
-- Namma Lorry — 11: re-consent (validation, docs/09 §1, migration 0009)
-- The policy version drivers must have agreed to lives in the database:
-- public.current_consent_version(). test/config/consent-version.test.mjs keeps
-- it equal to CONSENT_VERSION in src/features/onboarding/consent.ts.
--   A. current_consent_version(): value and grants
--   B. record_consent accepts only the current version (CONSENT_VERSION_OUTDATED)
-- start_trip's stale-version refusal is in suite 10 with its other checks.
-- =====================================================================
begin;

\ir _helpers.psql

select plan(12);

select tests.create_user('db000000-0000-4000-8000-000000000001', '919000001101', 'driver', 'Driver A');
update public.profiles set consent_version = '2026-09-27.1', consent_at = '2026-09-27 10:00+05:30'
 where id = 'db000000-0000-4000-8000-000000000001';

-- =================== A. current_consent_version() ===================
select is(public.current_consent_version(), '2026-10-01',
  'the current policy version is 2026-10-01 (= CONSENT_VERSION)');
select ok(has_function_privilege('authenticated', 'public.current_consent_version()', 'execute'),
  'authenticated can read the current version');
select ok(not has_function_privilege('anon', 'public.current_consent_version()', 'execute'),
  'anon cannot');
select ok(not exists (
  select 1 from pg_proc p, aclexplode(p.proacl) a
   where p.oid = 'public.current_consent_version()'::regprocedure and a.grantee = 0),
  'PUBLIC has no grant on current_consent_version');

-- =================== B. record_consent ===============================
select tests.as_user('db000000-0000-4000-8000-000000000001');
select throws_ok($$select public.record_consent('2026-09-27.1')$$,
  'P0001', 'CONSENT_VERSION_OUTDATED', 'an earlier version is refused (an old app build)');
select throws_ok($$select public.record_consent('2027-01-01')$$,
  'P0001', 'CONSENT_VERSION_OUTDATED', 'a version the server does not know is refused too');
select throws_ok($$select public.record_consent('  ')$$,
  'P0001', 'VERSION_REQUIRED', 'a blank version is still VERSION_REQUIRED');

set local role postgres;
select is((select consent_version from public.profiles where id = 'db000000-0000-4000-8000-000000000001'),
  '2026-09-27.1', 'a refused version leaves the stored consent alone');
select is((select consent_at from public.profiles where id = 'db000000-0000-4000-8000-000000000001'),
  '2026-09-27 10:00+05:30'::timestamptz, '...and its timestamp');

select tests.as_user('db000000-0000-4000-8000-000000000001');
select lives_ok($$select public.record_consent(' 2026-10-01 ')$$,
  'the current version is accepted, trimmed');
set local role postgres;
select is((select consent_version from public.profiles where id = 'db000000-0000-4000-8000-000000000001'),
  '2026-10-01', 'the stored consent is now the current version');
select ok((select consent_at > '2026-09-27 10:00+05:30'::timestamptz from public.profiles
            where id = 'db000000-0000-4000-8000-000000000001'),
  '...with a new timestamp');

select * from finish();
rollback;
