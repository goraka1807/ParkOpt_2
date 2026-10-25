-- =============================================================================
-- Migration 007: Useful Views
-- Purpose: Pre-built views that the frontend can query directly via
--          Supabase's auto-generated REST API. Views simplify common queries
--          and let us control exactly what data is exposed.
-- Depends on: 001-006
-- =============================================================================

-- ---------------------------------------------------------------------------
-- View: active_parking_spaces
-- Purpose: A clean view of active parking spaces for frontend browsing.
--          Exposes only columns safe to show publicly.
--          The frontend queries this view instead of the raw table.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.active_parking_spaces AS
SELECT
  ps.id,
  ps.name,
  ps.description,
  ps.address_line1,
  ps.address_line2,
  ps.city,
  ps.state,
  ps.country,
  ps.postal_code,
  ps.latitude,
  ps.longitude,
  ps.price_per_hour,
  ps.total_capacity,
  ps.max_vehicle_type,
  ps.is_covered,
  ps.is_gated,
  ps.has_cctv,
  ps.has_lighting,
  ps.has_ev_charging,
  ps.is_accessible,
  ps.operating_hours,
  ps.avg_rating,
  ps.review_count,
  ps.image_urls,
  ps.created_at
FROM public.parking_spaces ps
WHERE ps.status = 'active';

-- Grant SELECT access on the view to the anon role (unauthenticated users can browse)
GRANT SELECT ON public.active_parking_spaces TO anon;
GRANT SELECT ON public.active_parking_spaces TO authenticated;

-- ---------------------------------------------------------------------------
-- View: my_bookings
-- Purpose: Returns the current authenticated user's bookings with space details.
--          RLS on the underlying bookings table still applies.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.my_bookings AS
SELECT
  b.id             AS booking_id,
  b.space_id,
  ps.name          AS space_name,
  ps.address_line1 AS space_address,
  ps.city          AS space_city,
  ps.latitude      AS space_latitude,
  ps.longitude     AS space_longitude,
  CASE WHEN array_length(ps.image_urls, 1) > 0 THEN ps.image_urls[1] ELSE NULL END AS space_image_url,
  b.starts_at,
  b.ends_at,
  b.duration_hours,
  b.price_per_hour,
  b.total_price,
  b.vehicle_type,
  b.vehicle_plate,
  b.driver_notes,
  b.status,
  b.payment_status,
  b.cancelled_at,
  b.cancellation_reason,
  b.created_at
FROM public.bookings b
JOIN public.parking_spaces ps ON ps.id = b.space_id
WHERE b.driver_id = auth.uid();

GRANT SELECT ON public.my_bookings TO authenticated;

-- ---------------------------------------------------------------------------
-- View: my_profile
-- Purpose: Returns the current authenticated user's profile data.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.my_profile AS
SELECT
  p.id,
  p.full_name,
  p.phone,
  p.role,
  p.avatar_url,
  p.preferred_vehicle,
  p.tos_accepted,
  p.is_active,
  p.created_at,
  -- Include the email from auth.users for convenience
  u.email
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.id = auth.uid();

GRANT SELECT ON public.my_profile TO authenticated;

-- ---------------------------------------------------------------------------
-- View: my_spaces (for owners)
-- Purpose: Returns all parking spaces belonging to the current user.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.my_spaces AS
SELECT
  ps.*,
  -- Count of active bookings for quick dashboard display
  (
    SELECT COUNT(*)
    FROM public.bookings b
    WHERE b.space_id = ps.id AND b.status IN ('pending', 'confirmed')
  ) AS active_booking_count
FROM public.parking_spaces ps
WHERE ps.owner_id = auth.uid();

GRANT SELECT ON public.my_spaces TO authenticated;
