-- 0005 set_preferred_language: drivers change only their own language, only to a shipped one.
begin;
\ir _helpers.psql
select plan(8);

select tests.create_user('20000000-0000-4000-8000-0000000000d1', '920000000001', 'driver', 'Driver One');
select tests.create_user('20000000-0000-4000-8000-0000000000d2', '920000000002', 'driver', 'Driver Two');

select tests.as_user('20000000-0000-4000-8000-0000000000d1');
select is(public.set_preferred_language('ta'), 'ta', 'driver sets their own language');
select is((select preferred_language from profiles where id = auth.uid()), 'ta', 'saved on their profile');
select throws_ok($$ select public.set_preferred_language('fr') $$, 'P0001', 'LANGUAGE_NOT_SUPPORTED',
                 'unsupported language refused');
select throws_ok($$ select public.set_preferred_language(null) $$, 'P0001', 'LANGUAGE_NOT_SUPPORTED',
                 'null refused');
-- Still no direct write path on profiles (docs/09 §4).
select is_empty($$ update profiles set preferred_language = 'hi' where id = auth.uid() returning id $$,
                'direct UPDATE of preferred_language affects no rows');

select tests.as_postgres();
select is((select preferred_language from profiles where id = '20000000-0000-4000-8000-0000000000d2'), 'en',
          'other driver untouched');
select throws_ok($$ update profiles set preferred_language = 'xx' where id = '20000000-0000-4000-8000-0000000000d2' $$,
                 '23514', null, 'check constraint keeps unknown codes out');

select tests.as_anon();
select throws_ok($$ select public.set_preferred_language('en') $$, '42501', null, 'anon cannot call it');

select * from finish();
rollback;
