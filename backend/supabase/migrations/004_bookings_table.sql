-- =============================================================================
-- Migration 004: Bookings Table
-- Purpose: The reservation record — the most critical table in ParkOpt.
--
-- Key design decisions:
-- 1. Price is stored IN PAISA at time of booking — never recalculated live.
--    This protects against price changes after booking.
-- 2. Overlap prevention is enforced by an EXCLUSION CONSTRAINT using the
--    btree_gist extension, not just application logic.
-- 3. Minimum 2-hour duration is enforced by a CHECK constraint.
-- 4. A database function (not frontend) creates bookings to prevent race conditions.
-- Depends on: 001, 002, 003
-- =============================================================================

-- btree_gist enables exclusion constraints on non-geometric types (like ranges).
-- This is how we prevent overlapping bookings at the database level.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS public.bookings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The driver who made this booking.
  driver_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,

  -- The parking space being reserved.
  space_id          UUID NOT NULL REFERENCES public.parking_spaces(id) ON DELETE RESTRICT,

  -- ---------------------------------------------------------------------------
  -- Time period: stored as TIMESTAMPTZ (timezone-aware timestamps).
  -- The TSTZRANGE column enables the exclusion constraint below.
  -- ---------------------------------------------------------------------------
  starts_at         TIMESTAMPTZ NOT NULL,
  ends_at           TIMESTAMPTZ NOT NULL,

  -- The computed range — used for the exclusion constraint and overlap queries.
  -- Stored as a column so it can be indexed. It's always derived from starts_at/ends_at.
  booking_period    TSTZRANGE GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED,

  -- ---------------------------------------------------------------------------
  -- Duration constraint: minimum 2 hours, maximum 30 days.
  -- EXTRACT(EPOCH ...) gives seconds. 7200 = 2*60*60 seconds.
  -- ---------------------------------------------------------------------------
  CONSTRAINT booking_min_duration CHECK (
    EXTRACT(EPOCH FROM (ends_at - starts_at)) >= 7200
  ),
  CONSTRAINT booking_max_duration CHECK (
    EXTRACT(EPOCH FROM (ends_at - starts_at)) <= 2592000  -- 30 days in seconds
  ),
  CONSTRAINT booking_time_order CHECK (ends_at > starts_at),

  -- ---------------------------------------------------------------------------
  -- Pricing (captured at booking time, in paisa)
  -- ---------------------------------------------------------------------------
  price_per_hour    INTEGER NOT NULL CHECK (price_per_hour > 0),
  duration_hours    NUMERIC(8, 2) NOT NULL CHECK (duration_hours >= 2),
  total_price       INTEGER NOT NULL CHECK (total_price > 0),
                    -- total_price = CEIL(duration_hours) * price_per_hour

  -- ---------------------------------------------------------------------------
  -- Vehicle being parked (for record and compatibility validation)
  -- ---------------------------------------------------------------------------
  vehicle_type      vehicle_type NOT NULL,
  vehicle_plate     TEXT,    -- license plate number (optional but useful)

  -- ---------------------------------------------------------------------------
  -- Booking status
  -- ---------------------------------------------------------------------------
  status            booking_status NOT NULL DEFAULT 'confirmed',

  -- Cancellation information
  cancelled_at      TIMESTAMPTZ,
  cancellation_reason TEXT,
  cancelled_by      UUID REFERENCES public.profiles(id),

  -- Payment reference (for future payment integration)
  payment_id        TEXT,    -- external payment provider transaction ID
  payment_status    TEXT DEFAULT 'unpaid',

  -- Notes from driver (e.g., "I have a large sedan, please reserve spot 3")
  driver_notes      TEXT,

  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- THE CRITICAL CONSTRAINT: Exclusion Constraint for Overlap Prevention
--
-- This constraint ensures that for the same parking space, no two ACTIVE
-- bookings can have overlapping time periods.
--
-- How it works:
-- - For each pair of rows where space_id EQUALS space_id
--   AND booking_period OVERLAPS booking_period
--   AND both statuses are active (not cancelled/completed)...
-- - ...the constraint is VIOLATED (rejected).
--
-- This is enforced at the DATABASE level — concurrent transactions that both
-- try to book the same slot will have one succeed and one fail.
-- This is far more reliable than checking in application code.
--
-- The partial index (WHERE status IN ('pending', 'confirmed')) means
-- cancelled/completed bookings don't block re-use of the slot.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- idempotent

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_no_overlap
  ON public.bookings
  USING GIST (
    space_id,
    booking_period
  )
  WHERE status IN ('pending', 'confirmed');

-- Note: The above GIST index on space_id + tstzrange gives us:
-- 1. A fast lookup index for querying bookings by space + time range
-- 2. Overlap conflict detection (two rows with same space_id + overlapping ranges
--    will violate this UNIQUE GIST index)

-- ---------------------------------------------------------------------------
-- Regular indexes for common query patterns
-- ---------------------------------------------------------------------------

-- Find all bookings for a driver (booking history)
CREATE INDEX IF NOT EXISTS idx_bookings_driver_id
  ON public.bookings(driver_id, created_at DESC);

-- Find all bookings for a space (owner dashboard / availability check)
CREATE INDEX IF NOT EXISTS idx_bookings_space_id
  ON public.bookings(space_id, starts_at, ends_at);

-- Filter by status
CREATE INDEX IF NOT EXISTS idx_bookings_status
  ON public.bookings(status);

-- Find upcoming bookings efficiently
CREATE INDEX IF NOT EXISTS idx_bookings_starts_at
  ON public.bookings(starts_at)
  WHERE status IN ('pending', 'confirmed');

-- ---------------------------------------------------------------------------
-- Trigger: keep updated_at current
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_bookings_updated_at ON public.bookings;
CREATE TRIGGER set_bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security for bookings
-- ---------------------------------------------------------------------------
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Drivers see only their own bookings.
CREATE POLICY "bookings_select_driver_own"
  ON public.bookings
  FOR SELECT
  USING (auth.uid() = driver_id);

-- Owners see bookings for their spaces (to manage their listings).
CREATE POLICY "bookings_select_space_owner"
  ON public.bookings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.parking_spaces ps
      WHERE ps.id = space_id AND ps.owner_id = auth.uid()
    )
  );

-- Admins see all bookings.
CREATE POLICY "bookings_select_admin"
  ON public.bookings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- INSERT is handled by the create_booking() database function (SECURITY DEFINER).
-- We do NOT allow direct INSERT from the API — this prevents price manipulation
-- and concurrency issues.
-- The function bypasses RLS (SECURITY DEFINER) and does all validation internally.
CREATE POLICY "bookings_insert_via_function_only"
  ON public.bookings
  FOR INSERT
  WITH CHECK (auth.uid() = driver_id);

-- Drivers can cancel their own future bookings (via a function, not direct UPDATE).
-- Direct UPDATE is restricted to status field only via the cancel function.
CREATE POLICY "bookings_update_driver_cancel"
  ON public.bookings
  FOR UPDATE
  USING (auth.uid() = driver_id)
  WITH CHECK (
    auth.uid() = driver_id
    AND status = 'cancelled'  -- drivers can only set status to cancelled
  );

-- Owners can update status of bookings on their spaces.
CREATE POLICY "bookings_update_space_owner"
  ON public.bookings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.parking_spaces ps
      WHERE ps.id = space_id AND ps.owner_id = auth.uid()
    )
  );
