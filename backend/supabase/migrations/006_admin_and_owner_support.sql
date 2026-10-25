-- =============================================================================
-- Migration 006: Admin and Owner Support
-- Purpose: Role elevation function, admin policies, and owner-specific queries.
-- This migration is designed to be ADDITIVE — the driver MVP works without it,
-- but it enables the owner and admin workflows when needed.
-- Depends on: 001-005
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Function: elevate_user_role (Admin only)
-- Purpose:  Safely changes a user's role. This is the ONLY authorized way
--           to promote a user from driver to owner, or to admin.
--           Requires the calling user to be an admin.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.elevate_user_role(
  p_target_user_id UUID,
  p_new_role        user_role
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role user_role;
BEGIN
  v_caller_id := auth.uid();

  -- Must be authenticated
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  -- Must be an admin
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role != 'admin' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'UNAUTHORIZED',
      'message', 'Only administrators can change user roles.'
    );
  END IF;

  -- Prevent admins from demoting other admins (safety measure)
  IF EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = p_target_user_id AND role = 'admin'
  ) AND p_new_role != 'admin' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'CANNOT_DEMOTE_ADMIN',
      'message', 'Cannot demote another admin through this function.'
    );
  END IF;

  UPDATE public.profiles
  SET role = p_new_role
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'USER_NOT_FOUND',
      'message', 'Target user not found.'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'target_user_id', p_target_user_id,
    'new_role', p_new_role
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Function: get_space_bookings (Owner only)
-- Purpose:  Returns all bookings for a specific parking space.
--           Only the space owner or admin can call this.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_space_bookings(
  p_space_id UUID,
  p_status   booking_status DEFAULT NULL,
  p_limit    INTEGER DEFAULT 50,
  p_offset   INTEGER DEFAULT 0
)
RETURNS TABLE (
  booking_id     UUID,
  driver_name    TEXT,
  driver_phone   TEXT,
  starts_at      TIMESTAMPTZ,
  ends_at        TIMESTAMPTZ,
  duration_hours NUMERIC,
  total_price    INTEGER,
  vehicle_type   vehicle_type,
  vehicle_plate  TEXT,
  status         booking_status,
  created_at     TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_space_owner_id UUID;
BEGIN
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  -- Verify the space exists and get its owner
  SELECT owner_id INTO v_space_owner_id
  FROM public.parking_spaces
  WHERE id = p_space_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SPACE_NOT_FOUND';
  END IF;

  -- Only the owner or admin can see a space's bookings
  IF v_space_owner_id != v_caller_id AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  RETURN QUERY
  SELECT
    b.id           AS booking_id,
    p.full_name    AS driver_name,
    p.phone        AS driver_phone,
    b.starts_at,
    b.ends_at,
    b.duration_hours,
    b.total_price,
    b.vehicle_type,
    b.vehicle_plate,
    b.status,
    b.created_at
  FROM public.bookings b
  JOIN public.profiles p ON p.id = b.driver_id
  WHERE
    b.space_id = p_space_id
    AND (p_status IS NULL OR b.status = p_status)
  ORDER BY b.starts_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- ---------------------------------------------------------------------------
-- Function: deactivate_user (Admin only)
-- Purpose:  Safely deactivates a user account without destroying data.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deactivate_user(
  p_target_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
BEGIN
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHENTICATED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHORIZED');
  END IF;

  UPDATE public.profiles
  SET is_active = FALSE
  WHERE id = p_target_user_id;

  -- Also deactivate all their parking spaces
  UPDATE public.parking_spaces
  SET status = 'suspended'
  WHERE owner_id = p_target_user_id AND status = 'active';

  RETURN jsonb_build_object(
    'success', true,
    'target_user_id', p_target_user_id,
    'action', 'deactivated'
  );
END;
$$;
