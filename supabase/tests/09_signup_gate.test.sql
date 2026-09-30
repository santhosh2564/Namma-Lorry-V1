-- =====================================================================
-- Namma Lorry — 09: no self-registration (validation M4, PRD P0-1, ND-12)
-- An auth user nobody provisioned (a self-registration through the OTP
-- endpoint) gets an INACTIVE driver profile: no role, no RPCs, no trips.
-- Operators create users on purpose and activate them in the same step
-- (provision-user, admin-create-driver, seed), and an admin can activate a
-- profile later. start_trip refuses an inactive driver; end_trip does not, so
-- a driver deactivated mid-trip can still finish it (routing.ts).
-- =====================================================================
begin;

\ir _helpers.psql

select plan(12);

-- ---- a self-registered user: only the auth row, as GoTrue would insert it
insert into auth.users (instance_id, id, aud, role, phone, phone_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'e9000000-0000-4000-8000-000000000001',
        'authenticated', 'authenticated', '919000000991', now(), now(), now());

select is((select is_active from public.profiles where id = 'e9000000-0000-4000-8000-000000000001'),
          false, 'a new auth user gets an inactive profile');
select is((select role::text from public.profiles where id = 'e9000000-0000-4000-8000-000000000001'),
          'driver', '…with the default role, which counts for nothing while inactive');

select tests.as_user('e9000000-0000-4000-8000-000000000001');
select is(public.my_role(), null, 'my_role() is null for an inactive profile');
select is(public.is_admin(), false, 'is_admin() is false');
select throws_ok($$select public.record_consent(public.current_consent_version())$$,
  'P0002', 'PROFILE_NOT_FOUND', 'an inactive user cannot record consent');
select is((select count(*)::int from public.trips), 0, 'an inactive user sees no trips');
set local role postgres;

-- ---- an operator-created driver, deactivated while holding an assigned trip
select tests.create_user('d9000000-0000-4000-8000-000000000001', '919000000992', 'driver', 'Driver D');
select tests.create_user('a9000000-0000-4000-8000-000000000001', '919000000993', 'admin',  'Ops Admin');
update public.profiles set consent_version = public.current_consent_version(), consent_at = now()
 where id = 'd9000000-0000-4000-8000-000000000001';
insert into public.vehicles(id, registration_no, vehicle_type) values
  ('c9000000-0000-4000-8000-000000000001', 'TN 09 AA 0001', '19ft');
insert into public.loads(id, pickup_address, pickup_lat, pickup_lng, drop_address, drop_lat, drop_lng,
                         pickup_radius_m, drop_radius_m, planned_distance_m) values
  ('b9000000-0000-4000-8000-000000000001', 'Pickup', 12.9563, 79.9422, 'Drop', 12.9165, 79.1325, 500, 500, 88000);
insert into public.trips(id, load_id, driver_id, vehicle_id) values
  ('f9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001',
   'd9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001');

select is((select is_active from public.profiles where id = 'd9000000-0000-4000-8000-000000000001'),
          true, 'an operator-created user (tests.create_user, like provision-user) is active');

update public.profiles set is_active = false where id = 'd9000000-0000-4000-8000-000000000001';
select tests.as_user('d9000000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.start_trip('f9000000-0000-4000-8000-000000000001'::uuid, 12.9563, 79.9422, 10::real)$$,
  '42501', 'FORBIDDEN', 'an inactive driver cannot start an assigned trip');
set local role postgres;

-- ---- an inactive admin has no admin powers
update public.profiles set is_active = false where id = 'a9000000-0000-4000-8000-000000000001';
select tests.as_user('a9000000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.cancel_trip('f9000000-0000-4000-8000-000000000001'::uuid, 'note')$$,
  '42501', 'FORBIDDEN', 'an inactive admin cannot call admin RPCs');
set local role postgres;

-- ---- an active admin activates the self-registered profile (console / RLS path)
update public.profiles set is_active = true where id = 'a9000000-0000-4000-8000-000000000001';
select tests.as_user('a9000000-0000-4000-8000-000000000001');
select is(tests.affected($$update public.profiles set is_active = true
                          where id = 'e9000000-0000-4000-8000-000000000001'$$),
          1, 'an admin can activate a profile');
set local role postgres;
select is((select is_active from public.profiles where id = 'e9000000-0000-4000-8000-000000000001'),
          true, '…and it is active');

-- ---- the seeded local users are operator-created, so they stay active
select is((select count(*)::int from public.profiles
           where id in ('a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
                        'd0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000003')
             and is_active),
          4, 'seed.sql users are active');

select * from finish();
rollback;
