-- Profile self-service RPCs: record_consent (0002) and set_preferred_language (0003).
-- Each may change only its own columns on the caller's own row.
begin;
\ir _helpers.psql
select * from no_plan();

select tests.create_user('7e570000-0000-4000-8000-0000000000d1', '919100000002', 'driver', 'Driver One');
select tests.create_user('7e570000-0000-4000-8000-0000000000d2', '919100000003', 'driver', 'Driver Two');

select has_function('public', 'set_preferred_language', array['text']);
select has_function('public', 'record_consent', array['text']);
select ok(not has_function_privilege('anon', 'public.set_preferred_language(text)', 'execute'), 'anon cannot execute set_preferred_language');
select ok(not has_function_privilege('anon', 'public.record_consent(text)', 'execute'), 'anon cannot execute record_consent');

-- ---------- set_preferred_language ----------
select tests.as_user('7e570000-0000-4000-8000-0000000000d1');
select is((select preferred_language from public.set_preferred_language('ta')), 'ta', 'driver sets own language');
select throws_ok($$ select public.set_preferred_language('fr') $$, 'P0001', 'LANGUAGE_NOT_SUPPORTED', 'unsupported language rejected');
select throws_ok($$ select public.set_preferred_language(null) $$, 'P0001', 'LANGUAGE_NOT_SUPPORTED', 'null language rejected');

-- ---------- record_consent ----------
select is((select consent_version from public.record_consent(' 2026-09-v1 ')), '2026-09-v1', 'consent version stored (trimmed)');
select throws_ok($$ select public.record_consent('  ') $$, 'P0001', 'VERSION_REQUIRED', 'blank consent version rejected');

select tests.as_postgres();
select results_eq(
  $$ select preferred_language, consent_version, consent_at is not null, role::text
       from public.profiles where id = '7e570000-0000-4000-8000-0000000000d1' $$,
  $$ values ('ta', '2026-09-v1', true, 'driver') $$,
  'own row updated; role untouched');
select results_eq(
  $$ select preferred_language, consent_version from public.profiles where id = '7e570000-0000-4000-8000-0000000000d2' $$,
  $$ values ('en', null::text) $$,
  'other driver''s row untouched');

-- no session → FORBIDDEN (authenticated role without a JWT subject)
select set_config('role', 'authenticated', true);
select throws_ok($$ select public.set_preferred_language('kn') $$, '42501', 'FORBIDDEN', 'no session: language rejected');
select throws_ok($$ select public.record_consent('v1') $$, '42501', 'FORBIDDEN', 'no session: consent rejected');

-- deactivated user → PROFILE_NOT_FOUND
select tests.as_postgres();
update public.profiles set is_active = false where id = '7e570000-0000-4000-8000-0000000000d2';
select tests.as_user('7e570000-0000-4000-8000-0000000000d2');
select throws_ok($$ select public.set_preferred_language('hi') $$, 'P0002', 'PROFILE_NOT_FOUND', 'inactive user cannot change language');

select tests.as_postgres();
select * from finish();
rollback;
