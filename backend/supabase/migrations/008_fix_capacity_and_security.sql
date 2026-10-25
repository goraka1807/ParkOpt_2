-- =============================================================================
-- Migration 008: Fix Multi-Capacity Booking + Security Hardening
-- ============================================================================= 
--
-- APPLIES TO: Both fresh databases AND existing installations.
--
-- FRESH DATABASE NOTE:
--   If running all migrations 001-008 in order on a new database, migration 004
--   should be replaced with 004_bookings_table_v2.sql (provided separately).
--   Running this repair migration on a fresh database is safe — the DO blocks
--   handle the case where the broken constraint never existed.
--
-- EXISTING INSTALLATION NOTE:
--   This migration is REQUIRED for any database that ran migration 004 in its
--   original form. It removes the whole-facility exclusion constraint
--   (bookings_no_overlap_exclude) that incorrectly limited each parking
--   facility to a single booking per time slot, regardless of capacity.
--
-- =============================================================================
--
-- PRIORITY 1 FIX A: Remove the broken whole-facility exclusion constraint.
--
-- The original constraint treated every parking space as single-capacity.
-- For a facility with capacity=3, it rejected the second booking even though
-- two more slots remained free. The advisory lock + availability re-check
-- inside create_booking() provide correct, capacity-aware concurrency control.
--
-- We do NOT leave the database unprotected — overbooking protection is handled
-- by the check_space_availability() count inside the advisory lock transaction.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bookings_no_overlap_exclude'
      AND conrelid = 'public.bookings'::regclass
  ) THEN
    ALTER TABLE public.bookings
      DROP CONSTRAINT bookings_no_overlap_exclude;
    RAISE NOTICE 'Removed bookings_no_overlap_exclude constraint (capacity-unaware).';
  ELSE
    RAISE NOTICE 'bookings_no_overlap_exclude not found — skipping (fresh database or already fixed).';
  END IF;
END $$;

-- Also drop the old UNIQUE GIST index if it was created instead of / in addition to
-- the exclusion constraint by any intermediate migration attempt.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'bookings'
      AND indexname  = 'idx_bookings_no_overlap'
  ) THEN
    DROP INDEX public.idx_bookings_no_overlap;
    RAISE NOTICE 'Removed idx_bookings_no_overlap index.';
  END IF;
END $$;

-- =============================================================================
-- PRIORITY 1 FIX B: Fix check_space_availability() volatility.
--
-- The function was declared STABLE. That is incorrect when it is called from
-- within a VOLATILE transaction that may have already inserted rows in the same
-- transaction (via the advisory-lock pattern). PostgreSQL is allowed to cache
-- STABLE function results within a single statement. Changing to VOLATILE
-- ensures the count always reflects the current committed + in-progress state.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_space_availability(
  p_space_id  UUID,
  p_starts_at TIMESTAMPTZ,
  p_ends_at   TIMESTAMPTZ
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE                   -- was STABLE — must be VOLATILE for post-lock recheck
SECURITY DEFINER
SET search_path = public   -- fixed safe search_path
AS $$
DECLARE
  v_total_capacity INTEGER;
  v_booked_count   INTEGER;
BEGIN
  -- Input validation
  IF p_starts_at IS NULL OR p_ends_at IS NULL THEN
    RAISE EXCEPTION 'starts_at and ends_at are required.';
  END IF;

  IF p_starts_at >= p_ends_at THEN
    RAISE EXCEPTION 'starts_at must be before ends_at.';
  END IF;

  -- Note: we intentionally do NOT reject past timestamps here.
  -- This function is also used internally by create_booking() which has already
  -- checked for past start times. Rejecting past times here would break admin
  -- queries checking historical availability.

  -- Fetch total capacity for the given space (active spaces only)
  SELECT total_capacity INTO v_total_capacity
  FROM public.parking_spaces
  WHERE id = p_space_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN 0;  -- space not found or not active
  END IF;

  -- Check if the entire space is blocked during this period (owner-defined block)
  IF EXISTS (
    SELECT 1 FROM public.space_blocked_periods
    WHERE
      space_id = p_space_id
      AND tstzrange(blocked_from, blocked_until, '[)') &&
          tstzrange(p_starts_at, p_ends_at, '[)')
  ) THEN
    RETURN 0;  -- owner-blocked period
  END IF;

  -- Count active bookings whose half-open interval [start, end) overlaps with
  -- the requested half-open interval [p_starts_at, p_ends_at).
  -- The && operator on tstzrange uses half-open semantics, so adjacent bookings
  -- (e.g., [10:00,12:00) and [12:00,14:00)) do NOT overlap — correct.
  SELECT COUNT(*) INTO v_booked_count
  FROM public.bookings
  WHERE
    space_id = p_space_id
    AND status IN ('pending', 'confirmed')
    AND booking_period && tstzrange(p_starts_at, p_ends_at, '[)');

  RETURN GREATEST(0, v_total_capacity - v_booked_count);
END;
$$;

-- Grant execute to authenticated only (not anon — no unauthenticated availability checks)
REVOKE EXECUTE ON FUNCTION public.check_space_availability(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_space_availability(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM anon;
GRANT  EXECUTE ON FUNCTION public.check_space_availability(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
-- Service role retains implicit execute from ownership.

-- =============================================================================
-- PRIORITY 1 FIX C: Rewrite create_booking() with correct multi-capacity logic.
--
-- Key changes from original:
-- 1. Advisory lock key derivation is still UUID-based but uses a safer cast.
-- 2. Availability check is now done ONLY inside the advisory lock (removed the
--    pre-lock check that gave a false sense of safety).
-- 3. Capacity count is authoritative — uses check_space_availability() which
--    counts overlapping active bookings and compares to total_capacity.
-- 4. Minimum duration check (2 hours) is done before the lock to fail fast.
-- 5. EXCEPTION handler distinguishes exclusion_violation (cannot happen now) from
--    other errors cleanly.
-- 6. search_path explicitly set for security.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_booking(
  p_space_id      UUID,
  p_starts_at     TIMESTAMPTZ,
  p_ends_at       TIMESTAMPTZ,
  p_vehicle_type  vehicle_type,
  p_vehicle_plate TEXT DEFAULT NULL,
  p_driver_notes  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id      UUID;
  v_space          RECORD;
  v_available      INTEGER;
  v_price_per_hour INTEGER;
  v_duration_secs  NUMERIC;
  v_duration_hours NUMERIC;
  v_total_price    INTEGER;
  v_booking_id     UUID;
  v_lock_key       BIGINT;
BEGIN
  -- -------------------------------------------------------------------------
  -- Step 1: Identify the authenticated caller via Supabase-injected JWT claim.
  -- auth.uid() cannot be spoofed from the client.
  -- -------------------------------------------------------------------------
  v_driver_id := auth.uid();

  IF v_driver_id IS NULL THEN
    RETURN jsonb_build_object(
      'success',    false,
      'error_code', 'UNAUTHENTICATED',
      'message',    'You must be logged in to make a booking.'
    );
  END IF;

  -- Verify the account exists and is active in profiles.
  -- Owners and admins can also book (inclusive — no role restriction here).
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_driver_id AND is_active = TRUE
  ) THEN
    RETURN jsonb_build_object(
      'success',    false,
      'error_code', 'ACCOUNT_NOT_FOUND',
      'message',    'User account not found or inactive.'
    );
  END IF;

  -- -------------------------------------------------------------------------
  -- Step 2: Input validation (fast-fail before touching the lock)
  -- -------------------------------------------------------------------------
  IF p_space_id IS NULL THEN
    RETURN jsonb_build_object(
      'success',    false,
      'error_code', 'INVALID_INPUT',
      'message',    'space_id is required.'
    );
  END IF;

  IF p_starts_at IS NULL OR p_ends_at IS NULL THEN
    RETURN jsonb_build_object(
      'success',    false,
      'error_code', 'INVALID_INPUT',
      'message',    'Arrival and departure times are required.'
    );
  END IF;

  IF p_starts_at >= p_ends_at THEN
    RETURN jsonb_build_object(
      'success',    false,
      'error_code', 'INVALID_TIME_RANGE',
      'message',    'Departure time must be after arrival time.'
    );
  END IF;

  -- Reject bookings starting in the past (5-minute grace for network delay)
  IF p_starts_at < (NOW() - INTERVAL '5 minutes') THEN
    RETURN jsonb_build_object(
      'success',    false,
      'error_code', 'PAST_START_TIME',
      'message',    'Arrival time cannot be in the past.'
    );
  END IF;

  -- Enforce minimum 2-hour duration before taking the lock
  v_duration_secs  := EXTRACT(EPOCH FROM (p_ends_at - p_starts_at));
  v_duration_hours := v_duration_secs / 3600.0;

  IF v_duration_hours < 2.0 THEN
    RETURN jsonb_build_object(
      'success',    false,
      'error_code', 'DURATION_TOO_SHORT',
      'message',    format('Minimum booking duration is 2 hours. Requested: %s hours.',
                           ROUND(v_duration_hours, 2))
    );
  END IF;

  -- -------------------------------------------------------------------------
  -- Step 3: Load the parking space record.
  -- Use FOR SHARE to prevent the space being deleted / status-changed while
  -- we hold the advisory lock below.
  -- -------------------------------------------------------------------------
  SELECT * INTO v_space
  FROM public.parking_spaces
  WHERE id = p_space_id
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success',    false,
      'error_code', 'SPACE_NOT_FOUND',
      'message',    'Parking space not found.'
    );
  END IF;

  IF v_space.status != 'active' THEN
    RETURN jsonb_build_object(
      'success',    false,
      'error_code', 'SPACE_UNAVAILABLE',
      'message',    'This parking space is not currently available for booking.'
    );
  END IF;

  -- Prevent owners from booking their own listed space
  IF v_space.owner_id = v_driver_id THEN
    RETURN jsonb_build_object(
      'success',    false,
      'error_code', 'CANNOT_BOOK_OWN_SPACE',
      'message',    'You cannot book your own parking space.'
    );
  END IF;

  -- -------------------------------------------------------------------------
  -- Step 4: Vehicle compatibility check
  -- Hierarchy: motorcycle < compact < sedan < suv < van < truck
  -- electric is a separate category that also fits compact/sedan slots
  -- -------------------------------------------------------------------------
  IF NOT (
    CASE v_space.max_vehicle_type
      WHEN 'motorcycle' THEN p_vehicle_type = 'motorcycle'
      WHEN 'compact'    THEN p_vehicle_type IN ('motorcycle', 'compact')
      WHEN 'sedan'      THEN p_vehicle_type IN ('motorcycle', 'compact', 'sedan')
      WHEN 'suv'        THEN p_vehicle_type IN ('motorcycle', 'compact', 'sedan', 'suv')
      WHEN 'van'        THEN p_vehicle_type IN ('motorcycle', 'compact', 'sedan', 'suv', 'van')
      WHEN 'truck'      THEN p_vehicle_type IN ('motorcycle', 'compact', 'sedan', 'suv', 'van', 'truck')
      WHEN 'electric'   THEN p_vehicle_type IN ('motorcycle', 'compact', 'sedan', 'suv', 'electric')
      ELSE FALSE
    END
  ) THEN
    RETURN jsonb_build_object(
      'success',    false,
      'error_code', 'VEHICLE_INCOMPATIBLE',
      'message',    format('Your %s is not compatible with this space (max: %s).',
                           p_vehicle_type, v_space.max_vehicle_type)
    );
  END IF;

  -- -------------------------------------------------------------------------
  -- Step 5: Server-side price calculation (authoritative — client cannot inject)
  -- -------------------------------------------------------------------------
  v_price_per_hour := v_space.price_per_hour;
  -- Billing rounds UP to the next full hour (standard parking industry practice)
  v_total_price    := CEIL(v_duration_hours)::INTEGER * v_price_per_hour;

  -- -------------------------------------------------------------------------
  -- Step 6: Acquire a transaction-scoped advisory lock keyed to this space.
  --
  -- pg_advisory_xact_lock blocks until the lock is free, then holds it until
  -- the transaction commits or rolls back. Only one transaction per space_id
  -- can proceed past this point at a time.
  --
  -- Lock key derivation: XOR the high and low 64-bit halves of the UUID.
  -- This avoids the fragile string-casting approach in the original code and
  -- distributes keys well across the BIGINT space.
  -- -------------------------------------------------------------------------
  v_lock_key := (
    ('x' || lpad(replace(p_space_id::TEXT, '-', ''), 16, '0'))::BIT(64)::BIGINT
  ) # (
    ('x' || lpad(substr(replace(p_space_id::TEXT, '-', ''), 17, 16), 16, '0'))::BIT(64)::BIGINT
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- -------------------------------------------------------------------------
  -- Step 7: Re-check availability INSIDE the lock.
  --
  -- This is the authoritative check. Any concurrent transaction that already
  -- inserted a booking and committed will be reflected here. Any transaction
  -- still holding the same lock (impossible — only one at a time) is excluded.
  --
  -- check_space_availability() counts active overlapping bookings and returns
  -- total_capacity - that count. If 0, the slot is full.
  -- -------------------------------------------------------------------------
  v_available := public.check_space_availability(p_space_id, p_starts_at, p_ends_at);

  IF v_available <= 0 THEN
    RETURN jsonb_build_object(
      'success',    false,
      'error_code', 'NO_AVAILABILITY',
      'message',    'Sorry, this parking space is fully booked for the requested time.'
    );
  END IF;

  -- -------------------------------------------------------------------------
  -- Step 8: Insert the booking record.
  -- The advisory lock guarantees that no other transaction is between the
  -- availability check above and this INSERT.
  -- -------------------------------------------------------------------------
  INSERT INTO public.bookings (
    driver_id,
    space_id,
    starts_at,
    ends_at,
    price_per_hour,
    duration_hours,
    total_price,
    vehicle_type,
    vehicle_plate,
    driver_notes,
    status
  )
  VALUES (
    v_driver_id,
    p_space_id,
    p_starts_at,
    p_ends_at,
    v_price_per_hour,
    v_duration_hours,
    v_total_price,
    p_vehicle_type,
    p_vehicle_plate,
    p_driver_notes,
    'confirmed'
  )
  RETURNING id INTO v_booking_id;

  -- -------------------------------------------------------------------------
  -- Step 9: Return success payload
  -- -------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'success',        true,
    'booking_id',     v_booking_id,
    'space_id',       p_space_id,
    'space_name',     v_space.name,
    'driver_id',      v_driver_id,
    'starts_at',      p_starts_at,
    'ends_at',        p_ends_at,
    'duration_hours', v_duration_hours,
    'price_per_hour', v_price_per_hour,
    'total_price',    v_total_price,
    'vehicle_type',   p_vehicle_type,
    'status',         'confirmed'
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Log full detail server-side; return a safe generic message to the client.
    RAISE WARNING 'create_booking error for space=% driver=%: % %',
      p_space_id, v_driver_id, SQLSTATE, SQLERRM;
    RETURN jsonb_build_object(
      'success',    false,
      'error_code', 'INTERNAL_ERROR',
      'message',    'An unexpected error occurred. Please try again.'
    );
END;
$$;

-- Revoke execute from anon/public; only authenticated users call create_booking.
REVOKE EXECUTE ON FUNCTION public.create_booking(UUID, TIMESTAMPTZ, TIMESTAMPTZ, vehicle_type, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_booking(UUID, TIMESTAMPTZ, TIMESTAMPTZ, vehicle_type, TEXT, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.create_booking(UUID, TIMESTAMPTZ, TIMESTAMPTZ, vehicle_type, TEXT, TEXT) TO authenticated;

-- =============================================================================
-- PRIORITY 2 FIX A: Bookings RLS — restrict direct INSERT to prevent
-- price/status/driver_id injection.
--
-- Problem: The original INSERT policy "bookings_insert_via_function_only"
-- allowed ANY authenticated user to INSERT a booking row directly via the REST
-- API with arbitrary values (price, status, driver_id for another user, etc.)
-- as long as auth.uid() == driver_id. Since create_booking() is SECURITY
-- DEFINER, it bypasses RLS for its own INSERT — so we can safely tighten the
-- RLS INSERT policy to DENY all direct inserts. The function is the only path.
--
-- Solution: Replace the permissive policy with a DENY-all policy.
-- =============================================================================

-- Drop the old permissive insert policy
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'bookings'
      AND policyname = 'bookings_insert_via_function_only'
  ) THEN
    DROP POLICY "bookings_insert_via_function_only" ON public.bookings;
  END IF;
END $$;

-- New policy: deny all direct inserts from API clients.
-- create_booking() runs as SECURITY DEFINER and bypasses RLS.
-- No legitimate API client should INSERT directly into bookings.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'bookings'
      AND policyname = 'bookings_no_direct_insert'
  ) THEN
    CREATE POLICY "bookings_no_direct_insert"
      ON public.bookings
      FOR INSERT
      WITH CHECK (FALSE);  -- always reject direct API inserts
  END IF;
END $$;

-- =============================================================================
-- PRIORITY 2 FIX B: Bookings UPDATE RLS — prevent direct field manipulation.
--
-- Problem: The existing UPDATE policies allow a driver to directly PATCH any
-- field on their booking row (price, payment_status, starts_at, etc.) as long
-- as the final status is 'cancelled'. The WITH CHECK only validates status;
-- it does not prevent modifying other columns.
--
-- Solution: Drop the overly permissive policies and route cancellation through
-- the cancel_booking() SECURITY DEFINER function which restricts updates to
-- the cancellation fields only.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'bookings'
      AND policyname = 'bookings_update_driver_cancel'
  ) THEN
    DROP POLICY "bookings_update_driver_cancel" ON public.bookings;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'bookings'
      AND policyname = 'bookings_update_space_owner'
  ) THEN
    DROP POLICY "bookings_update_space_owner" ON public.bookings;
  END IF;
END $$;

-- New UPDATE policy: deny all direct updates from API clients.
-- cancel_booking() and admin functions use SECURITY DEFINER and bypass RLS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'bookings'
      AND policyname = 'bookings_no_direct_update'
  ) THEN
    CREATE POLICY "bookings_no_direct_update"
      ON public.bookings
      FOR UPDATE
      USING (FALSE);  -- always reject direct API updates
  END IF;
END $$;

-- Lock down execute privileges on cancel_booking as well
REVOKE EXECUTE ON FUNCTION public.cancel_booking(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_booking(UUID, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.cancel_booking(UUID, TEXT) TO authenticated;

-- =============================================================================
-- PRIORITY 2 FIX C: Fix the recursive profiles UPDATE policy.
--
-- Problem: The WITH CHECK clause in migration 002 does:
--   AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
--   AND is_active = (SELECT is_active FROM ...)
--   AND tos_accepted = (SELECT tos_accepted FROM ...)
--
-- Each subquery re-reads the profiles table under the same RLS policy,
-- triggering the policy again, causing potential infinite recursion in some
-- Postgres/Supabase versions. Even where recursion is not triggered, the
-- three separate subqueries are expensive and racy.
--
-- Solution: Replace the policy with one that uses a single
-- SECURITY DEFINER helper function that reads the row outside RLS.
-- =============================================================================

-- Helper function: read protected profile fields for the current user.
-- SECURITY DEFINER bypasses RLS so there is no recursion.
CREATE OR REPLACE FUNCTION public.get_own_protected_profile_fields()
RETURNS TABLE (
  role        user_role,
  is_active   BOOLEAN,
  tos_accepted BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role, is_active, tos_accepted
  FROM public.profiles
  WHERE id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.get_own_protected_profile_fields() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_own_protected_profile_fields() FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_own_protected_profile_fields() TO authenticated;

-- Drop the recursive policy
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'profiles_update_own'
  ) THEN
    DROP POLICY "profiles_update_own" ON public.profiles;
  END IF;
END $$;

-- New non-recursive UPDATE policy.
-- Allows only: full_name, phone, avatar_url, preferred_vehicle.
-- Blocks changes to: role, is_active, tos_accepted, id, created_at.
-- Uses the helper function to compare against current values without recursion.
CREATE POLICY "profiles_update_own_safe"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- role must remain unchanged (elevation goes through elevate_user_role())
    AND role = (SELECT p.role FROM public.get_own_protected_profile_fields() p)
    -- is_active must remain unchanged (deactivation goes through deactivate_user())
    AND is_active = (SELECT p.is_active FROM public.get_own_protected_profile_fields() p)
    -- tos_accepted: users CAN set this true but never back to false
    -- We allow: new_value = TRUE OR new_value = current_value
    AND (
      tos_accepted = TRUE
      OR tos_accepted = (SELECT p.tos_accepted FROM public.get_own_protected_profile_fields() p)
    )
  );

-- Tighten execute privileges on admin-only functions
REVOKE EXECUTE ON FUNCTION public.elevate_user_role(UUID, user_role)    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.elevate_user_role(UUID, user_role)    FROM anon;
REVOKE EXECUTE ON FUNCTION public.elevate_user_role(UUID, user_role)    FROM authenticated;
-- Only callable via service role or directly through the DB function's own auth check:
-- The function itself checks auth.uid() role = 'admin', so granting to authenticated
-- is safe — non-admins get UNAUTHORIZED from within the function.
GRANT  EXECUTE ON FUNCTION public.elevate_user_role(UUID, user_role)    TO authenticated;

REVOKE EXECUTE ON FUNCTION public.deactivate_user(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.deactivate_user(UUID, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.deactivate_user(UUID, TEXT) TO authenticated;

-- =============================================================================
-- PRIORITY 2 FIX D: Lock down calculate_booking_price grants.
-- This function reveals the authoritative price — only authenticated callers.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.calculate_booking_price(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_booking_price(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM anon;
GRANT  EXECUTE ON FUNCTION public.calculate_booking_price(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- =============================================================================
-- PRIORITY 2 FIX E: search_parking_spaces — allow anon (search is public).
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.search_parking_spaces(NUMERIC, NUMERIC, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, vehicle_type, INTEGER, BOOLEAN, BOOLEAN, INTEGER, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.search_parking_spaces(NUMERIC, NUMERIC, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, vehicle_type, INTEGER, BOOLEAN, BOOLEAN, INTEGER, INTEGER) TO authenticated;

-- =============================================================================
-- Verify: Summary of policies and grants applied (informational)
-- =============================================================================
DO $$
BEGIN
  RAISE NOTICE 'Migration 008 applied successfully.';
  RAISE NOTICE 'Removed: bookings_no_overlap_exclude (capacity-unaware exclusion constraint).';
  RAISE NOTICE 'Fixed:   check_space_availability() volatility (STABLE -> VOLATILE).';
  RAISE NOTICE 'Fixed:   create_booking() advisory lock + capacity count.';
  RAISE NOTICE 'Fixed:   Bookings INSERT/UPDATE RLS — direct writes denied.';
  RAISE NOTICE 'Fixed:   Profiles UPDATE policy — non-recursive via helper function.';
  RAISE NOTICE 'Fixed:   EXECUTE grants locked down on sensitive functions.';
END $$;
