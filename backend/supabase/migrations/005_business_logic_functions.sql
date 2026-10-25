-- =============================================================================
-- Migration 005: Core Business Logic Functions
-- Purpose: PL/pgSQL database functions that implement the critical business
--          rules for ParkOpt. These run INSIDE the database, which means:
--          - They cannot be bypassed by the frontend
--          - They run in a transaction (atomic — all succeeds or all fails)
--          - They can use advisory locks for concurrency control
-- Depends on: 001, 002, 003, 004
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Function: check_space_availability
-- Purpose:  Determines how many spots are available in a parking space
--           for a given time window.
--
-- Logic:
--   Available slots = total_capacity - active bookings that overlap the period
--
-- This is used BEFORE creating a booking and also by the search function
-- to filter out fully-booked spaces.
--
-- Parameters:
--   p_space_id    UUID  — the parking space to check
--   p_starts_at   TIMESTAMPTZ — desired arrival time
--   p_ends_at     TIMESTAMPTZ — desired departure time
--
-- Returns: INTEGER — number of available spots (0 means fully booked)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_space_availability(
  p_space_id  UUID,
  p_starts_at TIMESTAMPTZ,
  p_ends_at   TIMESTAMPTZ
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE  -- marks this function as not modifying the database (allows caching)
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_capacity INTEGER;
  v_booked_count   INTEGER;
BEGIN
  -- Validate inputs
  IF p_starts_at >= p_ends_at THEN
    RAISE EXCEPTION 'starts_at must be before ends_at';
  END IF;

  IF p_starts_at < NOW() THEN
    RAISE EXCEPTION 'Cannot check availability in the past';
  END IF;

  -- Get the space's total capacity
  SELECT total_capacity INTO v_total_capacity
  FROM public.parking_spaces
  WHERE id = p_space_id AND status = 'active';

  -- Space not found or inactive
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Count active bookings that OVERLAP with the requested period.
  -- Two periods [A,B) and [C,D) overlap when A < D AND C < B.
  -- We use the tstzrange && operator which implements exactly this.
  SELECT COUNT(*) INTO v_booked_count
  FROM public.bookings
  WHERE
    space_id = p_space_id
    AND status IN ('pending', 'confirmed')
    AND booking_period && tstzrange(p_starts_at, p_ends_at, '[)');

  -- Also check if the period falls in a blocked period
  IF EXISTS (
    SELECT 1 FROM public.space_blocked_periods
    WHERE
      space_id = p_space_id
      AND tstzrange(blocked_from, blocked_until, '[)') &&
          tstzrange(p_starts_at, p_ends_at, '[)')
  ) THEN
    RETURN 0;  -- blocked by owner
  END IF;

  RETURN GREATEST(0, v_total_capacity - v_booked_count);
END;
$$;

-- ---------------------------------------------------------------------------
-- Function: calculate_booking_price
-- Purpose:  Trusted server-side price calculation.
--           The frontend NEVER computes the final price.
--
-- Returns: INTEGER — total price in paisa
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_booking_price(
  p_space_id  UUID,
  p_starts_at TIMESTAMPTZ,
  p_ends_at   TIMESTAMPTZ
)
RETURNS TABLE (
  price_per_hour  INTEGER,
  duration_hours  NUMERIC,
  total_price     INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price_per_hour INTEGER;
  v_duration_secs  NUMERIC;
  v_duration_hours NUMERIC;
  v_total          INTEGER;
BEGIN
  -- Get the space's authoritative price
  SELECT ps.price_per_hour INTO v_price_per_hour
  FROM public.parking_spaces ps
  WHERE ps.id = p_space_id AND ps.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Space not found or not active: %', p_space_id;
  END IF;

  -- Calculate duration in hours (exact, not rounded)
  v_duration_secs  := EXTRACT(EPOCH FROM (p_ends_at - p_starts_at));
  v_duration_hours := v_duration_secs / 3600.0;

  -- Enforce minimum 2 hours
  IF v_duration_hours < 2.0 THEN
    RAISE EXCEPTION 'Minimum booking duration is 2 hours. Requested: % hours', 
      ROUND(v_duration_hours, 2);
  END IF;

  -- Price calculation: ceil to nearest hour (standard parking billing)
  -- e.g., 2.5 hours billed as 3 hours
  v_total := CEIL(v_duration_hours) * v_price_per_hour;

  RETURN QUERY SELECT v_price_per_hour, v_duration_hours, v_total;
END;
$$;

-- ---------------------------------------------------------------------------
-- Function: create_booking
-- Purpose:  The ONLY authorized way to create a booking.
--           This function:
--           1. Validates the authenticated user is a driver
--           2. Validates the time window
--           3. Checks vehicle compatibility
--           4. Calculates price server-side
--           5. Takes an advisory lock to prevent concurrent double-booking
--           6. Checks availability inside the lock
--           7. Inserts the booking atomically
--
-- SECURITY DEFINER means it runs as the function owner (superuser), not the
-- calling user. This lets it bypass RLS selectively while still enforcing
-- our own authorization rules.
--
-- Parameters:
--   p_space_id     UUID  — which parking space
--   p_starts_at    TIMESTAMPTZ — arrival time
--   p_ends_at      TIMESTAMPTZ — departure time
--   p_vehicle_type vehicle_type — driver's vehicle category
--   p_vehicle_plate TEXT — optional license plate
--   p_driver_notes TEXT — optional notes
--
-- Returns: JSONB with booking details or error information
-- ---------------------------------------------------------------------------
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
VOLATILE  -- modifies the database
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id      UUID;
  v_driver_role    user_role;
  v_space          RECORD;
  v_available      INTEGER;
  v_price_per_hour INTEGER;
  v_duration_hours NUMERIC;
  v_total_price    INTEGER;
  v_booking_id     UUID;
  v_lock_key       BIGINT;
BEGIN
  -- -------------------------------------------------------------------------
  -- Step 1: Identify and authorize the caller
  -- auth.uid() is injected by Supabase from the verified JWT — cannot be spoofed.
  -- -------------------------------------------------------------------------
  v_driver_id := auth.uid();

  IF v_driver_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'UNAUTHENTICATED',
      'message', 'You must be logged in to make a booking.'
    );
  END IF;

  -- Check that the caller is a driver (not an owner-only or banned account)
  SELECT role INTO v_driver_role
  FROM public.profiles
  WHERE id = v_driver_id AND is_active = TRUE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'ACCOUNT_NOT_FOUND',
      'message', 'User account not found or inactive.'
    );
  END IF;

  -- Owners and admins can also book as drivers (inclusive design)
  -- Only restrict if we add a specific "driver only" requirement

  -- -------------------------------------------------------------------------
  -- Step 2: Validate inputs
  -- -------------------------------------------------------------------------
  IF p_starts_at IS NULL OR p_ends_at IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_INPUT',
      'message', 'Arrival and departure times are required.'
    );
  END IF;

  IF p_starts_at >= p_ends_at THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_TIME_RANGE',
      'message', 'Departure time must be after arrival time.'
    );
  END IF;

  -- Prevent bookings in the past (allow a small 5-minute buffer for network delay)
  IF p_starts_at < (NOW() - INTERVAL '5 minutes') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'PAST_START_TIME',
      'message', 'Arrival time cannot be in the past.'
    );
  END IF;

  -- -------------------------------------------------------------------------
  -- Step 3: Load and validate the parking space
  -- -------------------------------------------------------------------------
  SELECT * INTO v_space
  FROM public.parking_spaces
  WHERE id = p_space_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'SPACE_NOT_FOUND',
      'message', 'Parking space not found.'
    );
  END IF;

  IF v_space.status != 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'SPACE_UNAVAILABLE',
      'message', 'This parking space is not currently available.'
    );
  END IF;

  -- Prevent drivers from booking their own spaces (business rule)
  IF v_space.owner_id = v_driver_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'CANNOT_BOOK_OWN_SPACE',
      'message', 'You cannot book your own parking space.'
    );
  END IF;

  -- -------------------------------------------------------------------------
  -- Step 4: Check vehicle compatibility
  -- Vehicle type hierarchy: motorcycle < compact < sedan < suv < van < truck
  -- A space with max_vehicle_type = 'sedan' accepts sedan, compact, motorcycle
  -- but rejects suv, van, truck.
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
      'success', false,
      'error_code', 'VEHICLE_INCOMPATIBLE',
      'message', format(
        'Your %s is not compatible with this space (max: %s).',
        p_vehicle_type, v_space.max_vehicle_type
      )
    );
  END IF;

  -- -------------------------------------------------------------------------
  -- Step 5: Calculate price (server-side, authoritative)
  -- -------------------------------------------------------------------------
  SELECT
    cbp.price_per_hour,
    cbp.duration_hours,
    cbp.total_price
  INTO
    v_price_per_hour,
    v_duration_hours,
    v_total_price
  FROM public.calculate_booking_price(p_space_id, p_starts_at, p_ends_at) cbp;

  -- -------------------------------------------------------------------------
  -- Step 6: Acquire advisory lock to prevent concurrent double-bookings.
  --
  -- pg_advisory_xact_lock takes a BIGINT lock key that is scoped to the
  -- current transaction. Only one transaction can hold this lock at a time.
  -- Other transactions trying to book the same space will WAIT here until
  -- this transaction commits or rolls back.
  --
  -- We derive the lock key from the space UUID to keep locks space-specific
  -- (bookings for different spaces don't block each other).
  -- -------------------------------------------------------------------------
  v_lock_key := ('x' || substr(p_space_id::TEXT, 1, 16))::BIT(64)::BIGINT;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- -------------------------------------------------------------------------
  -- Step 7: Re-check availability INSIDE the lock.
  -- This is the double-check after acquiring the lock. If two requests arrived
  -- simultaneously and both passed the earlier checks, only one will get here
  -- first. The second will re-check and find 0 slots available.
  -- -------------------------------------------------------------------------
  v_available := public.check_space_availability(p_space_id, p_starts_at, p_ends_at);

  IF v_available <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NO_AVAILABILITY',
      'message', 'Sorry, this parking space is no longer available for the requested time.'
    );
  END IF;

  -- -------------------------------------------------------------------------
  -- Step 8: Create the booking
  -- Everything above passed — insert the booking record.
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
    'confirmed'   -- immediately confirmed (no payment step yet)
  )
  RETURNING id INTO v_booking_id;

  -- -------------------------------------------------------------------------
  -- Step 9: Return success with booking details
  -- -------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'space_id', p_space_id,
    'space_name', v_space.name,
    'driver_id', v_driver_id,
    'starts_at', p_starts_at,
    'ends_at', p_ends_at,
    'duration_hours', v_duration_hours,
    'price_per_hour', v_price_per_hour,
    'total_price', v_total_price,
    'vehicle_type', p_vehicle_type,
    'status', 'confirmed'
  );

EXCEPTION
  WHEN unique_violation THEN
    -- The GIST exclusion index caught a concurrent overlap that slipped through.
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'BOOKING_CONFLICT',
      'message', 'A booking conflict was detected. Please try a different time slot.'
    );
  WHEN OTHERS THEN
    -- Log the error and return a safe message (never expose internal details)
    RAISE WARNING 'create_booking error for space % by driver %: %', 
      p_space_id, v_driver_id, SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INTERNAL_ERROR',
      'message', 'An unexpected error occurred. Please try again.'
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- Function: cancel_booking
-- Purpose:  Safe, authorized booking cancellation.
--           Validates the caller owns the booking and it is cancellable.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_booking(
  p_booking_id        UUID,
  p_cancellation_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_booking   RECORD;
BEGIN
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'UNAUTHENTICATED',
      'message', 'You must be logged in.'
    );
  END IF;

  SELECT b.*, ps.owner_id AS space_owner_id
  INTO v_booking
  FROM public.bookings b
  JOIN public.parking_spaces ps ON ps.id = b.space_id
  WHERE b.id = p_booking_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'BOOKING_NOT_FOUND',
      'message', 'Booking not found.'
    );
  END IF;

  -- Authorization: only the driver who booked, the space owner, or admin can cancel
  IF v_booking.driver_id != v_caller_id
    AND v_booking.space_owner_id != v_caller_id
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'admin'
    )
  THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'UNAUTHORIZED',
      'message', 'You are not authorized to cancel this booking.'
    );
  END IF;

  -- Status check: can only cancel pending or confirmed bookings
  IF v_booking.status NOT IN ('pending', 'confirmed') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'CANNOT_CANCEL',
      'message', format('Cannot cancel a booking with status: %s', v_booking.status)
    );
  END IF;

  -- Cannot cancel a booking that has already started
  IF v_booking.starts_at <= NOW() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'BOOKING_ALREADY_STARTED',
      'message', 'Cannot cancel a booking that has already started.'
    );
  END IF;

  UPDATE public.bookings
  SET
    status = 'cancelled',
    cancelled_at = NOW(),
    cancellation_reason = p_cancellation_reason,
    cancelled_by = v_caller_id
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'status', 'cancelled',
    'cancelled_at', NOW()
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Function: search_parking_spaces
-- Purpose:  The main parking discovery function.
--           Finds available spaces near a destination with filtering.
--
-- Parameters:
--   p_lat          NUMERIC  — destination latitude
--   p_lng          NUMERIC  — destination longitude
--   p_radius_km    NUMERIC  — search radius in kilometres (default 5km)
--   p_starts_at    TIMESTAMPTZ — arrival time
--   p_ends_at      TIMESTAMPTZ — departure time
--   p_vehicle_type vehicle_type — driver's vehicle (for compatibility filter)
--   p_max_price    INTEGER  — max total price in paisa (optional filter)
--   p_covered_only BOOLEAN  — filter to covered parking only
--   p_ev_charging  BOOLEAN  — filter to spaces with EV charging
--   p_limit        INTEGER  — max results to return (default 20)
--   p_offset       INTEGER  — pagination offset (default 0)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_parking_spaces(
  p_lat          NUMERIC,
  p_lng          NUMERIC,
  p_radius_km    NUMERIC      DEFAULT 5.0,
  p_starts_at    TIMESTAMPTZ  DEFAULT NULL,
  p_ends_at      TIMESTAMPTZ  DEFAULT NULL,
  p_vehicle_type vehicle_type DEFAULT NULL,
  p_max_price    INTEGER      DEFAULT NULL,
  p_covered_only BOOLEAN      DEFAULT FALSE,
  p_ev_charging  BOOLEAN      DEFAULT FALSE,
  p_limit        INTEGER      DEFAULT 20,
  p_offset       INTEGER      DEFAULT 0
)
RETURNS TABLE (
  id               UUID,
  name             TEXT,
  description      TEXT,
  address_line1    TEXT,
  city             TEXT,
  latitude         NUMERIC,
  longitude        NUMERIC,
  price_per_hour   INTEGER,
  total_capacity   INTEGER,
  available_spots  INTEGER,
  max_vehicle_type vehicle_type,
  is_covered       BOOLEAN,
  is_gated         BOOLEAN,
  has_cctv         BOOLEAN,
  has_lighting     BOOLEAN,
  has_ev_charging  BOOLEAN,
  is_accessible    BOOLEAN,
  avg_rating       NUMERIC,
  review_count     INTEGER,
  image_urls       TEXT[],
  distance_meters  NUMERIC,
  -- Recommendation score: lower is better
  -- Computed from distance, price, availability ratio, rating
  recommendation_score NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search_point GEOGRAPHY;
BEGIN
  IF p_lat IS NULL OR p_lng IS NULL THEN
    RAISE EXCEPTION 'Latitude and longitude are required.';
  END IF;

  IF p_radius_km IS NULL OR p_radius_km <= 0 OR p_radius_km > 50 THEN
    RAISE EXCEPTION 'radius_km must be a positive number between 0 and 50.';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'limit must be an integer between 1 and 100.';
  END IF;

  IF p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'offset must be a non-negative integer.';
  END IF;

  IF p_starts_at IS NOT NULL AND p_ends_at IS NOT NULL AND p_starts_at >= p_ends_at THEN
    RAISE EXCEPTION 'starts_at must be before ends_at.';
  END IF;

  -- Build the search origin point from the provided coordinates
  v_search_point := ST_MakePoint(p_lng, p_lat)::GEOGRAPHY;

  RETURN QUERY
  WITH space_availability AS (
    -- Pre-compute availability for each candidate space
    SELECT
      ps.id AS space_id,
      CASE
        WHEN p_starts_at IS NOT NULL AND p_ends_at IS NOT NULL THEN
          public.check_space_availability(ps.id, p_starts_at, p_ends_at)
        ELSE
          ps.total_capacity  -- no time filter: show total capacity
      END AS available_count
    FROM public.parking_spaces ps
    WHERE
      ps.status = 'active'
      -- Radius filter using PostGIS — ST_DWithin is extremely efficient with GIST index
      AND ST_DWithin(ps.location, v_search_point, p_radius_km * 1000)
  ),
  estimated_price AS (
    -- Pre-compute total estimated price for ordering
    SELECT
      ps.id AS space_id,
      CASE
        WHEN p_starts_at IS NOT NULL AND p_ends_at IS NOT NULL THEN
          CEIL(EXTRACT(EPOCH FROM (p_ends_at - p_starts_at)) / 3600.0) * ps.price_per_hour
        ELSE
          ps.price_per_hour  -- show hourly rate when no duration given
      END AS est_total_price
    FROM public.parking_spaces ps
    WHERE ps.status = 'active'
  )
  SELECT
    ps.id,
    ps.name,
    ps.description,
    ps.address_line1,
    ps.city,
    ps.latitude,
    ps.longitude,
    ps.price_per_hour,
    ps.total_capacity,
    sa.available_count::INTEGER AS available_spots,
    ps.max_vehicle_type,
    ps.is_covered,
    ps.is_gated,
    ps.has_cctv,
    ps.has_lighting,
    ps.has_ev_charging,
    ps.is_accessible,
    ps.avg_rating,
    ps.review_count,
    ps.image_urls,
    -- Distance from search point to parking space, in metres
    ST_Distance(ps.location, v_search_point)::NUMERIC AS distance_meters,

    -- ---------------------------------------------------------------------------
    -- Recommendation Score (lower = better match)
    -- Factors:
    --   1. Distance: normalized to 0-1 scale over the search radius
    --   2. Price: normalized to 0-1 over a max reference price (₹500/hr = 50000 paisa)
    --   3. Rating: inverted (5 stars = 0 penalty, no rating = 0.5 penalty)
    --   4. Availability ratio: fully available = lower score (preferred)
    --
    -- Weights can be tuned based on user feedback.
    -- ---------------------------------------------------------------------------
    ROUND(
      (
        -- 40% weight: distance penalty (closer is better)
        0.40 * (ST_Distance(ps.location, v_search_point) / (p_radius_km * 1000))
        +
        -- 35% weight: price penalty (cheaper is better)
        0.35 * LEAST(ep.est_total_price::NUMERIC / 50000.0, 1.0)
        +
        -- 15% weight: rating bonus (higher rating is better = lower score)
        0.15 * CASE
          WHEN ps.avg_rating IS NULL THEN 0.5
          ELSE (5.0 - ps.avg_rating) / 5.0
        END
        +
        -- 10% weight: availability ratio (more available = slightly preferred)
        0.10 * CASE
          WHEN ps.total_capacity = 0 THEN 1.0
          ELSE 1.0 - (sa.available_count::NUMERIC / ps.total_capacity)
        END
      )::NUMERIC,
      4
    ) AS recommendation_score

  FROM public.parking_spaces ps
  JOIN space_availability sa ON sa.space_id = ps.id
  JOIN estimated_price ep ON ep.space_id = ps.id
  WHERE
    ps.status = 'active'

    -- Availability filter: only show spaces with at least 1 spot
    AND sa.available_count > 0

    -- Vehicle compatibility filter
    AND (
      p_vehicle_type IS NULL
      OR CASE ps.max_vehicle_type
        WHEN 'motorcycle' THEN p_vehicle_type = 'motorcycle'
        WHEN 'compact'    THEN p_vehicle_type IN ('motorcycle', 'compact')
        WHEN 'sedan'      THEN p_vehicle_type IN ('motorcycle', 'compact', 'sedan')
        WHEN 'suv'        THEN p_vehicle_type IN ('motorcycle', 'compact', 'sedan', 'suv')
        WHEN 'van'        THEN p_vehicle_type IN ('motorcycle', 'compact', 'sedan', 'suv', 'van')
        WHEN 'truck'      THEN p_vehicle_type IN ('motorcycle', 'compact', 'sedan', 'suv', 'van', 'truck')
        WHEN 'electric'   THEN p_vehicle_type IN ('motorcycle', 'compact', 'sedan', 'suv', 'electric')
        ELSE FALSE
      END
    )

    -- Price filter (max total price in paisa)
    AND (p_max_price IS NULL OR ep.est_total_price <= p_max_price)

    -- Amenity filters
    AND (NOT p_covered_only OR ps.is_covered = TRUE)
    AND (NOT p_ev_charging OR ps.has_ev_charging = TRUE)

  ORDER BY
    recommendation_score ASC   -- best matches first

  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- ---------------------------------------------------------------------------
-- Function: get_driver_bookings
-- Purpose:  Returns a driver's booking history with enriched space details.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_driver_bookings(
  p_status  booking_status DEFAULT NULL,
  p_limit   INTEGER DEFAULT 20,
  p_offset  INTEGER DEFAULT 0
)
RETURNS TABLE (
  booking_id      UUID,
  space_id        UUID,
  space_name      TEXT,
  space_address   TEXT,
  space_city      TEXT,
  space_image_url TEXT,
  starts_at       TIMESTAMPTZ,
  ends_at         TIMESTAMPTZ,
  duration_hours  NUMERIC,
  price_per_hour  INTEGER,
  total_price     INTEGER,
  vehicle_type    vehicle_type,
  vehicle_plate   TEXT,
  status          booking_status,
  created_at      TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id UUID;
BEGIN
  v_driver_id := auth.uid();

  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: You must be logged in.';
  END IF;

  RETURN QUERY
  SELECT
    b.id             AS booking_id,
    b.space_id,
    ps.name          AS space_name,
    ps.address_line1 AS space_address,
    ps.city          AS space_city,
    -- Return the first image URL or NULL
    CASE WHEN array_length(ps.image_urls, 1) > 0 
         THEN ps.image_urls[1] 
         ELSE NULL 
    END              AS space_image_url,
    b.starts_at,
    b.ends_at,
    b.duration_hours,
    b.price_per_hour,
    b.total_price,
    b.vehicle_type,
    b.vehicle_plate,
    b.status,
    b.created_at,
    b.cancelled_at
  FROM public.bookings b
  JOIN public.parking_spaces ps ON ps.id = b.space_id
  WHERE
    b.driver_id = v_driver_id
    AND (p_status IS NULL OR b.status = p_status)
  ORDER BY b.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
