-- =====================================================================
-- Namma Lorry — local dev seed (runs on `supabase db reset`). NEVER run on hosted.
-- 1 admin, 3 drivers, 3 vehicles, 4 loads (real TN/KA coordinates), 1 assigned trip.
-- Phone numbers are fake test numbers; each has OTP 123456 via
-- [auth.sms.test_otp] in supabase/config.toml (see docs/DEV_SETUP.md).
-- Sample data follows stitch/DESIGN.md (Murugan S, TN 23 BK 4521, NL-2026-000142/143).
-- =====================================================================

-- ---------- Auth users (handle_new_user creates the profiles) ----------
-- GoTrue stores phone numbers without the leading '+'. Token columns must be ''
-- rather than NULL or GoTrue fails to scan the row at sign-in.
insert into auth.users (
  instance_id, id, aud, role, phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, reauthentication_token)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.phone, now(),
       '{"provider":"phone","providers":["phone"]}', '{}', now(), now(),
       '', '', '', '', '', '', '', ''
from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, '919000000001'),  -- admin
  ('d0000000-0000-4000-8000-000000000001'::uuid, '919000000011'),  -- Murugan S
  ('d0000000-0000-4000-8000-000000000002'::uuid, '919000000012'),  -- Ravi Kumar
  ('d0000000-0000-4000-8000-000000000003'::uuid, '919000000013')   -- Manjunath K
) as u(id, phone);

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'phone', u.phone, 'phone_verified', true),
       'phone', now(), now(), now()
from auth.users u
where u.id in ('a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
               'd0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000003');

update public.profiles p set role = s.role::public.user_role, full_name = s.full_name, preferred_language = s.lang
from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'admin',  'Namma Lorry Ops', 'en'),
  ('d0000000-0000-4000-8000-000000000001'::uuid, 'driver', 'Murugan S',       'ta'),
  ('d0000000-0000-4000-8000-000000000002'::uuid, 'driver', 'Ravi Kumar',      'ta'),
  ('d0000000-0000-4000-8000-000000000003'::uuid, 'driver', 'Manjunath K',     'kn')
) as s(id, role, full_name, lang)
where p.id = s.id;

-- ---------- Vehicles ----------
insert into public.vehicles (id, registration_no, vehicle_type) values
  ('c0000000-0000-4000-8000-000000000001', 'TN 23 BK 4521', '19ft'),
  ('c0000000-0000-4000-8000-000000000002', 'KA 01 AF 7788', '14ft'),
  ('c0000000-0000-4000-8000-000000000003', 'TN 70 C 3310',  '407');

-- ---------- Loads ----------
-- Bump the sequence so the DB-generated codes match the design sample data
-- (NL-<year>-000142, -000143, …); later loads continue from there.
select setval('public.load_code_seq', 141);

insert into public.loads (id, pickup_address, pickup_lat, pickup_lng, drop_address, drop_lat, drop_lng,
                          planned_distance_m, material, weight_kg, created_by) values
  ('b0000000-0000-4000-8000-000000000001',
   'SIPCOT Industrial Park, Sriperumbudur, Tamil Nadu', 12.9563, 79.9422,
   'Kurichi Industrial Estate, Coimbatore, Tamil Nadu', 10.9608, 76.9656,
   512000, 'Auto components', 9000, 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000002',
   'SIPCOT Phase 1, Hosur, Tamil Nadu',                 12.7392, 77.8233,
   'Peenya Industrial Area, Bengaluru, Karnataka',     13.0329, 77.5273,
   41000, 'Packaged FMCG', 4500, 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000003',
   'Ambattur Industrial Estate, Chennai, Tamil Nadu',  13.1009, 80.1629,
   'SIPCOT Ranipet, Tamil Nadu',                        12.9369, 79.3261,
   105000, 'Steel coils', 12000, 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000004',
   'Hebbal Industrial Area, Mysuru, Karnataka',         12.3517, 76.6127,
   'Bommasandra Industrial Area, Bengaluru, Karnataka', 12.8126, 77.6937,
   150000, null, null, 'a0000000-0000-4000-8000-000000000001');

-- ---------- One assigned trip (Murugan S, TN 23 BK 4521, Sriperumbudur → Coimbatore) ----------
insert into public.trips (id, load_id, driver_id, vehicle_id) values
  ('f0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'd0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001');
