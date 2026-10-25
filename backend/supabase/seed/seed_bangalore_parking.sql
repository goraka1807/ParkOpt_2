-- =============================================================================
-- Seed Data: Sample Parking Spaces for Bangalore, India
-- Purpose: Realistic test data for development and hackathon demo.
--          Run AFTER all migrations.
--
-- IMPORTANT: This requires a real owner user ID to be created first.
--            The seed script uses a placeholder UUID that must be replaced
--            with an actual user from auth.users.
--
-- HOW TO USE THIS SEED:
-- 1. Create a user account via the Supabase Auth dashboard or sign-up flow.
-- 2. Find their UUID in the Supabase Dashboard > Authentication > Users.
-- 3. Replace 'REPLACE_WITH_OWNER_UUID' below with that UUID.
-- 4. Run the SQL in the Supabase SQL Editor.
-- 5. Also update that user's role to 'owner' in profiles table:
--    UPDATE public.profiles SET role = 'owner' WHERE id = '<your-uuid>';
-- =============================================================================

-- Use a DO block so we can use a variable for the owner_id
DO $$
DECLARE
  v_owner_id UUID := 'REPLACE_WITH_OWNER_UUID'::UUID;  -- CHANGE THIS
BEGIN

INSERT INTO public.parking_spaces (
  owner_id,
  name,
  description,
  address_line1,
  city,
  state,
  country,
  postal_code,
  location,
  latitude,
  longitude,
  total_capacity,
  price_per_hour,
  max_vehicle_type,
  is_covered,
  is_gated,
  has_cctv,
  has_lighting,
  has_ev_charging,
  is_accessible,
  status,
  operating_hours,
  image_urls
) VALUES

-- Space 1: MG Road, Bangalore
(
  v_owner_id,
  'MG Road Covered Parking',
  'Secure multi-level covered parking in the heart of MG Road. Walking distance to Garuda Mall and Brigade Road. 24/7 security and CCTV coverage.',
  '74, MG Road, Near Garuda Mall',
  'Bengaluru',
  'Karnataka',
  'India',
  '560001',
  ST_MakePoint(77.6033, 12.9754)::GEOGRAPHY,  -- (lng, lat)
  12.9754,
  77.6033,
  50,     -- 50 spots
  5000,   -- ₹50/hr (in paisa)
  'suv',
  TRUE,   -- covered
  TRUE,   -- gated
  TRUE,   -- CCTV
  TRUE,   -- lighting
  FALSE,  -- no EV charging
  TRUE,   -- accessible
  'active',
  '{"monday":{"open":"06:00","close":"23:00"},"tuesday":{"open":"06:00","close":"23:00"},"wednesday":{"open":"06:00","close":"23:00"},"thursday":{"open":"06:00","close":"23:00"},"friday":{"open":"06:00","close":"23:00"},"saturday":{"open":"06:00","close":"23:30"},"sunday":{"open":"07:00","close":"22:00"}}',
  ARRAY['https://images.unsplash.com/photo-1506521781263-d8422e82f27a?w=800']
),

-- Space 2: Indiranagar
(
  v_owner_id,
  'Indiranagar Metro Parking',
  'Open-air parking lot adjacent to Indiranagar Metro Station. Perfect for commuters. Affordable rates for long-duration parking.',
  '100 Feet Road, Indiranagar',
  'Bengaluru',
  'Karnataka',
  'India',
  '560038',
  ST_MakePoint(77.6408, 12.9784)::GEOGRAPHY,
  12.9784,
  77.6408,
  30,
  3000,   -- ₹30/hr
  'sedan',
  FALSE,  -- open air
  FALSE,
  TRUE,   -- CCTV
  TRUE,   -- lighting
  FALSE,
  FALSE,
  'active',
  '{"monday":{"open":"05:30","close":"23:30"},"tuesday":{"open":"05:30","close":"23:30"},"wednesday":{"open":"05:30","close":"23:30"},"thursday":{"open":"05:30","close":"23:30"},"friday":{"open":"05:30","close":"23:30"},"saturday":{"open":"05:30","close":"23:30"},"sunday":{"open":"06:00","close":"22:00"}}',
  ARRAY['https://images.unsplash.com/photo-1594818379496-da1e345b0ded?w=800']
),

-- Space 3: Koramangala (with EV charging)
(
  v_owner_id,
  'Koramangala EV & Premium Parking',
  'Fully covered basement parking with EV charging bays. High-security facility with keycard access. Located behind Forum Mall.',
  '17th Cross, 6th Block, Koramangala',
  'Bengaluru',
  'Karnataka',
  'India',
  '560095',
  ST_MakePoint(77.6270, 12.9352)::GEOGRAPHY,
  12.9352,
  77.6270,
  20,
  8000,   -- ₹80/hr (premium)
  'suv',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  TRUE,   -- EV charging!
  TRUE,
  'active',
  NULL,   -- NULL = 24/7
  ARRAY['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800']
),

-- Space 4: Whitefield (IT corridor)
(
  v_owner_id,
  'Whitefield Tech Park Parking',
  'Large open parking facility near ITPL and Whitefield tech corridor. Monthly passes available. Well-lit and patrolled.',
  'ITPL Main Road, Whitefield',
  'Bengaluru',
  'Karnataka',
  'India',
  '560066',
  ST_MakePoint(77.7480, 12.9698)::GEOGRAPHY,
  12.9698,
  77.7480,
  100,
  2500,   -- ₹25/hr (affordable)
  'truck', -- accepts all vehicles
  FALSE,
  TRUE,
  FALSE,
  TRUE,
  FALSE,
  FALSE,
  'active',
  '{"monday":{"open":"07:00","close":"20:00"},"tuesday":{"open":"07:00","close":"20:00"},"wednesday":{"open":"07:00","close":"20:00"},"thursday":{"open":"07:00","close":"20:00"},"friday":{"open":"07:00","close":"20:00"},"saturday":{"open":"08:00","close":"18:00"},"sunday":{"open":"09:00","close":"16:00"}}',
  ARRAY['https://images.unsplash.com/photo-1573348722427-f1d6819fdf98?w=800']
),

-- Space 5: HSR Layout
(
  v_owner_id,
  'HSR Layout Residential Parking',
  'Private parking space available in HSR Layout residential area. Gated community, very safe. Ideal for overnight parking.',
  '24th Main, HSR Layout, Sector 2',
  'Bengaluru',
  'Karnataka',
  'India',
  '560102',
  ST_MakePoint(77.6490, 12.9116)::GEOGRAPHY,
  12.9116,
  77.6490,
  5,
  2000,   -- ₹20/hr
  'compact',
  FALSE,
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  FALSE,
  'active',
  NULL,   -- 24/7
  ARRAY[]::TEXT[]
),

-- Space 6: Malleshwaram
(
  v_owner_id,
  'Malleshwaram Temple Street Parking',
  'Convenient parking near Malleshwaram 8th Cross shopping street and Sapna Book House. Open-air with attendant.',
  '8th Cross, Malleshwaram',
  'Bengaluru',
  'Karnataka',
  'India',
  '560003',
  ST_MakePoint(77.5666, 13.0035)::GEOGRAPHY,
  13.0035,
  77.5666,
  15,
  3500,   -- ₹35/hr
  'sedan',
  FALSE,
  FALSE,
  FALSE,
  TRUE,
  FALSE,
  FALSE,
  'active',
  '{"monday":{"open":"09:00","close":"21:00"},"tuesday":{"open":"09:00","close":"21:00"},"wednesday":{"open":"09:00","close":"21:00"},"thursday":{"open":"09:00","close":"21:00"},"friday":{"open":"09:00","close":"21:00"},"saturday":{"open":"08:00","close":"21:30"},"sunday":{"open":"08:00","close":"20:00"}}',
  ARRAY['https://images.unsplash.com/photo-1486325212027-8081e485255e?w=800']
);

END $$;
