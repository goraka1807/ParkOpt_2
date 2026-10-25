-- ParkOpt local development seed data
-- IMPORTANT: Run ONLY against your LOCAL Supabase database.
-- This inserts 5 fictional auth users (and trigger-created profiles),
-- 5 parking spaces, and 3 sample bookings.
-- It does not delete existing data. IDs are deterministic so rerunning is safe.
--
-- Run from backend directory:
--   npx supabase db query --local --file .\supabase\seed.sql
-- If your installed Supabase CLI does not support --file, open this file in
-- local Studio SQL Editor (http://127.0.0.1:54323) and run it there.

BEGIN;

-- Create fictional local Auth users. The on_auth_user_created trigger creates
-- matching public.profiles rows with role='driver' and metadata full_name.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'demo.owner1@parkopt.local', crypt('LocalDemo123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":" Owner One"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'demo.owner2@parkopt.local', crypt('LocalDemo123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":" Owner Two"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'demo.driver1@parkopt.local', crypt('LocalDemo123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":" Driver One"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'demo.driver2@parkopt.local', crypt('LocalDemo123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":" Driver Two"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'demo.driver3@parkopt.local', crypt('LocalDemo123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":" Driver Three"}'::jsonb, now(), now(), '', '', '', '')
ON CONFLICT (id) DO NOTHING;

-- Make the first two demo accounts parking owners.
UPDATE public.profiles
SET role = 'owner', phone = '+910000000001', tos_accepted = TRUE
WHERE id = '10000000-0000-4000-8000-000000000001';

UPDATE public.profiles
SET role = 'owner', phone = '+910000000002', tos_accepted = TRUE
WHERE id = '10000000-0000-4000-8000-000000000002';

UPDATE public.profiles
SET phone = '+910000000003', tos_accepted = TRUE
WHERE id = '10000000-0000-4000-8000-000000000003';

UPDATE public.profiles
SET phone = '+910000000004', tos_accepted = TRUE
WHERE id = '10000000-0000-4000-8000-000000000004';

UPDATE public.profiles
SET phone = '+910000000005', tos_accepted = TRUE
WHERE id = '10000000-0000-4000-8000-000000000005';

-- Five fictional parking listings around central Pune.
INSERT INTO public.parking_spaces (
  id, owner_id, name, description, address_line1, city, state, country,
  postal_code, location, latitude, longitude, total_capacity, price_per_hour,
  max_vehicle_type, is_covered, is_gated, has_cctv, has_lighting,
  has_ev_charging, is_accessible, status, image_urls
)
VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   'Shivajinagar', 'Fictional test listing near Shivajinagar.',
   'Lane 1', 'Pune', 'Maharashtra', 'India', '411005',
   ST_SetSRID(ST_MakePoint(73.8478, 18.5308), 4326)::geography, 18.5308, 73.8478,
   4, 5000, 'suv', TRUE, TRUE, TRUE, TRUE, FALSE, FALSE, 'active', ARRAY[]::text[]),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
   'Deccan', 'Fictional covered parking test listing.',
   'Lane 2', 'Pune', 'Maharashtra', 'India', '411004',
   ST_SetSRID(ST_MakePoint(73.8390, 18.5167), 4326)::geography, 18.5167, 73.8390,
   3, 4000, 'sedan', TRUE, TRUE, FALSE, TRUE, FALSE, TRUE, 'active', ARRAY[]::text[]),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002',
   'Koregaon Park', 'Fictional parking listing with EV charging.',
   'Lane 3', 'Pune', 'Maharashtra', 'India', '411001',
   ST_SetSRID(ST_MakePoint(73.8958, 18.5362), 4326)::geography, 18.5362, 73.8958,
   5, 7500, 'electric', TRUE, TRUE, TRUE, TRUE, TRUE, FALSE, 'active', ARRAY[]::text[]),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002',
   'Camp', 'Fictional open-air parking test listing.',
   'Lane 4', 'Pune', 'Maharashtra', 'India', '411001',
   ST_SetSRID(ST_MakePoint(73.8790, 18.5130), 4326)::geography, 18.5130, 73.8790,
   2, 3000, 'sedan', FALSE, TRUE, TRUE, TRUE, FALSE, FALSE, 'active', ARRAY[]::text[]),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001',
   'Pune Station', 'Fictional parking listing for search testing.',
   'Lane 5', 'Pune', 'Maharashtra', 'India', '411001',
   ST_SetSRID(ST_MakePoint(73.8740, 18.5289), 4326)::geography, 18.5289, 73.8740,
   6, 6000, 'van', FALSE, TRUE, TRUE, TRUE, FALSE, TRUE, 'active', ARRAY[]::text[])
ON CONFLICT (id) DO NOTHING;

-- Three future bookings (times are UTC; adjust as needed for demos).
-- Two-hour minimum is respected. These records are for UI/history testing,
-- not a substitute for testing the create_booking() business logic.
INSERT INTO public.bookings (
  id, driver_id, space_id, starts_at, ends_at, price_per_hour,
  duration_hours, total_price, vehicle_type, vehicle_plate, status,
  payment_status, driver_notes
)
VALUES
  ('30000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000003',
   '20000000-0000-4000-8000-000000000001',
   date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + interval '2 days 09 hours',
   date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + interval '2 days 11 hours',
   5000, 2, 10000, 'sedan', '101', 'confirmed', 'unpaid', 'booking record'),
  ('30000000-0000-4000-8000-000000000002',
   '10000000-0000-4000-8000-000000000004',
   '20000000-0000-4000-8000-000000000003',
   date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + interval '3 days 10 hours',
   date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + interval '3 days 13 hours',
   7500, 3, 22500, 'electric', '202', 'confirmed', 'unpaid', 'EV booking record'),
  ('30000000-0000-4000-8000-000000000003',
   '10000000-0000-4000-8000-000000000005',
   '20000000-0000-4000-8000-000000000005',
   date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + interval '4 days 12 hours',
   date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + interval '4 days 14 hours',
   6000, 2, 12000, 'van', '303', 'pending', 'unpaid', 'pending booking record')
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Quick verification:
-- SELECT count(*) AS demo_profiles FROM public.profiles
-- WHERE id::text LIKE '10000000-%';
-- SELECT count(*) AS demo_spaces FROM public.parking_spaces
-- WHERE id::text LIKE '20000000-%';
-- SELECT count(*) AS demo_bookings FROM public.bookings
-- WHERE id::text LIKE '30000000-%';
