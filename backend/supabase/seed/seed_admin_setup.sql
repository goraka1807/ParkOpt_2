-- =============================================================================
-- Seed Data: Quick Test Data (No Owner UUID Required)
-- Purpose: Uses a DO block with dynamic user creation for immediate testing.
--
-- HOW TO USE:
-- 1. Create a user in Supabase Auth UI (any email, password).
-- 2. Run the seed_bangalore_parking.sql file with the correct owner UUID.
--
-- OR use this file to set up the very FIRST admin user:
--    1. Sign up a user via your application.
--    2. Find their UUID in: Supabase Dashboard > Authentication > Users
--    3. Run the SQL below (replace the UUID).
-- =============================================================================

-- Promote the first user to admin:
-- Replace 'YOUR-USER-UUID-HERE' with the actual UUID from Auth dashboard.
/*
UPDATE public.profiles
SET role = 'admin'
WHERE id = 'YOUR-USER-UUID-HERE';
*/

-- Promote a user to owner:
/*
UPDATE public.profiles
SET role = 'owner'
WHERE id = 'YOUR-OWNER-UUID-HERE';
*/

-- Quick verification queries (run after migrations to check the setup):
-- Check all tables exist:
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Check all functions exist:
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;

-- Check RLS is enabled on all tables:
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
