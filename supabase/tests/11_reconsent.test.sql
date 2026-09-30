-- =====================================================================
-- Namma Lorry — 11: re-consent (validation, docs/09 §1, migration 0010)
-- The policy version drivers must have agreed to lives in the database:
-- public.current_consent_version(). test/config/consent.test.mjs keeps it
-- equal to CONSENT_VERSION in src/features/onboarding/consent.ts.
--   A. current_consent_version(): the value the app agrees to
--   B. record_consent accepts the current or a NEWER version — the app ships
--      a new version before the migration that makes it current, so the
--      database must not refuse it (docs/RUNBOOK.md §Changing the policy
--      version). An older version still gets VERSION_NOT_CURRENT, checked
--      before the format check so a pre-0009 build's dotted version reads as
--      outdated rather than malformed; then a YYYY-MM-DD format check.
--      Versions are text, compared with collate "C".
-- start_trip's version check is in suite 10 with its other checks.
-- =====================================================================
begin;

\ir _helpers.psql

select plan(13);

select tests.create_user('db000000-0000-4000-8000-000000000001', '919000001101', 'driver', 'Driver A');
update public.profiles set consent_version = '2026-09-27.1', consent_at = '2026-09-27 10:00+05:30'
 where id = 'db000000-0000-4000-8000-000000000001';

-- =================== A. current_consent_version() ===================
select is(public.current_consent_version(), '2026-10-01',
  'the current policy version is 2026-10-01 (= CONSENT_VERSION)');
select ok(has_function_privilege('authenticated', 'public.current_consent_version()', 'execute'),
  'authenticated can read the current version');

-- =================== B. record_consent ===============================
select tests.as_user('db000000-0000-4000-8000-000000000001');

-- Older than current: an outdated app build (0009).
select throws_ok($$select public.record_consent('2026-09-27.1')$$,
  'P0001', 'VERSION_NOT_CURRENT',
  'the pre-0009 dotted version is refused as outdated, not as malformed');
select throws_ok($$select public.record_consent('2025-01-01')$$,
  'P0001', 'VERSION_NOT_CURRENT', 'an earlier version is refused');
-- Not YYYY-MM-DD, and not older, so the format check catches it.
select throws_ok($$select public.record_consent('v2')$$,
  'P0001', 'VERSION_INVALID', 'a version that is not YYYY-MM-DD is refused');
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

-- The app update ships first, so a newer version must be accepted before the
-- migration that makes it current (docs/RUNBOOK.md §Changing the policy version).
select tests.as_user('db000000-0000-4000-8000-000000000001');
select lives_ok($$select public.record_consent('2026-12-01')$$,
  'a newer version is accepted (app shipped before the migration)');
set local role postgres;
select is((select consent_version from public.profiles where id = 'db000000-0000-4000-8000-000000000001'),
  '2026-12-01', 'the newer version is stored');

select * from finish();
rollback;
