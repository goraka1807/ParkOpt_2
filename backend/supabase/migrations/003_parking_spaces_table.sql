-- =============================================================================
-- Migration 003: Parking Spaces and Amenities Tables
-- Purpose: The core listings table — parking spaces that owners offer
--          and drivers discover.
-- Depends on: 001 (types), 002 (profiles)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Table: parking_spaces
-- Central listing record for a parking location.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.parking_spaces (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The owner who listed this space.
  -- Cascade delete: if the owner's account is deleted, their listings go too.
  owner_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Human-readable name for the listing (e.g., "Covered Spot near MG Road")
  name            TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 150),

  -- Full description of the space, rules, instructions.
  description     TEXT,

  -- ---------------------------------------------------------------------------
  -- Location: stored as both structured address fields AND a PostGIS geography
  -- point for fast radius searches.
  --
  -- The geography type (not geometry) uses real-world coordinates on a sphere,
  -- so ST_DWithin distances are in METERS — no projection math needed.
  -- ---------------------------------------------------------------------------
  address_line1   TEXT NOT NULL,
  address_line2   TEXT,
  city            TEXT NOT NULL,
  state           TEXT NOT NULL,
  country         TEXT NOT NULL DEFAULT 'India',
  postal_code     TEXT,

  -- geography(Point, 4326) = longitude/latitude point using WGS84 datum.
  -- SRID 4326 is the standard GPS coordinate system.
  location        GEOGRAPHY(Point, 4326) NOT NULL,

  -- Stored separately for quick display without parsing the geography object.
  latitude        NUMERIC(10, 8) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude       NUMERIC(11, 8) NOT NULL CHECK (longitude BETWEEN -180 AND 180),

  -- ---------------------------------------------------------------------------
  -- Capacity
  -- ---------------------------------------------------------------------------
  total_capacity  INTEGER NOT NULL DEFAULT 1 CHECK (total_capacity >= 1),

  -- ---------------------------------------------------------------------------
  -- Pricing
  -- Price is stored in paisa (smallest currency unit, like cents for USD).
  -- Storing as INTEGER avoids floating-point rounding errors.
  -- ₹50/hr would be stored as 5000.
  -- ---------------------------------------------------------------------------
  price_per_hour  INTEGER NOT NULL CHECK (price_per_hour > 0),
                                    -- unit: paisa (1 INR = 100 paisa)

  -- ---------------------------------------------------------------------------
  -- Vehicle compatibility — which vehicle sizes fit here.
  -- We store the MAXIMUM vehicle type supported.
  -- A space supporting 'suv' also accepts 'sedan', 'compact', 'motorcycle'.
  -- ---------------------------------------------------------------------------
  max_vehicle_type vehicle_type NOT NULL DEFAULT 'sedan',

  -- ---------------------------------------------------------------------------
  -- Physical characteristics
  -- ---------------------------------------------------------------------------
  is_covered      BOOLEAN NOT NULL DEFAULT FALSE,   -- covered / indoor parking
  is_gated        BOOLEAN NOT NULL DEFAULT FALSE,   -- has gate/barrier access
  has_cctv        BOOLEAN NOT NULL DEFAULT FALSE,   -- security cameras
  has_lighting    BOOLEAN NOT NULL DEFAULT FALSE,   -- nighttime lighting
  has_ev_charging BOOLEAN NOT NULL DEFAULT FALSE,   -- EV charging point
  is_accessible   BOOLEAN NOT NULL DEFAULT FALSE,   -- wheelchair accessible

  -- ---------------------------------------------------------------------------
  -- Operating hours stored as JSONB for flexibility.
  -- Example: {"monday": {"open": "07:00", "close": "22:00"}, ...}
  -- NULL means 24/7 operation.
  -- ---------------------------------------------------------------------------
  operating_hours JSONB,

  -- ---------------------------------------------------------------------------
  -- Status and visibility
  -- ---------------------------------------------------------------------------
  status          space_status NOT NULL DEFAULT 'active',

  -- ---------------------------------------------------------------------------
  -- Images stored as array of URLs (Supabase Storage or external CDN).
  -- ---------------------------------------------------------------------------
  image_urls      TEXT[] DEFAULT '{}',

  -- Average rating cache — updated by a trigger when reviews are added.
  -- Avoids expensive aggregation on every listing display.
  avg_rating      NUMERIC(3, 2) CHECK (avg_rating BETWEEN 0 AND 5),
  review_count    INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Indexes for parking_spaces
-- ---------------------------------------------------------------------------

-- Geospatial index (GIST) — essential for fast ST_DWithin radius searches.
-- Without this, every search scans the entire table. With it, searches are
-- O(log n) using a spatial tree structure.
CREATE INDEX IF NOT EXISTS idx_parking_spaces_location
  ON public.parking_spaces USING GIST (location);

-- Filter by status (most queries will only want 'active' spaces)
CREATE INDEX IF NOT EXISTS idx_parking_spaces_status
  ON public.parking_spaces(status);

-- Filter by owner (for owner dashboard queries)
CREATE INDEX IF NOT EXISTS idx_parking_spaces_owner
  ON public.parking_spaces(owner_id);

-- Filter by vehicle type
CREATE INDEX IF NOT EXISTS idx_parking_spaces_vehicle_type
  ON public.parking_spaces(max_vehicle_type);

-- Composite index for the most common search pattern: active spaces by city
CREATE INDEX IF NOT EXISTS idx_parking_spaces_city_status
  ON public.parking_spaces(city, status);

-- ---------------------------------------------------------------------------
-- Trigger: keep updated_at current
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_parking_spaces_updated_at ON public.parking_spaces;
CREATE TRIGGER set_parking_spaces_updated_at
  BEFORE UPDATE ON public.parking_spaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security for parking_spaces
-- ---------------------------------------------------------------------------
ALTER TABLE public.parking_spaces ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated users) can browse active parking spaces.
-- This is important for discovery — users shouldn't need an account just to search.
CREATE POLICY "spaces_select_active"
  ON public.parking_spaces
  FOR SELECT
  USING (status = 'active');

-- Owners see ALL their own spaces, regardless of status.
CREATE POLICY "spaces_select_own"
  ON public.parking_spaces
  FOR SELECT
  USING (auth.uid() = owner_id);

-- Admins can see everything (role check against profiles table).
CREATE POLICY "spaces_select_admin"
  ON public.parking_spaces
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only owners can insert their own spaces.
CREATE POLICY "spaces_insert_owner"
  ON public.parking_spaces
  FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Owners can update only their own spaces.
CREATE POLICY "spaces_update_owner"
  ON public.parking_spaces
  FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Owners can delete (soft delete preferred — but allow hard delete for now).
CREATE POLICY "spaces_delete_owner"
  ON public.parking_spaces
  FOR DELETE
  USING (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- Table: space_images (optional normalized alternative to image_urls array)
-- Keeping image_urls as array for simplicity, adding this for future migration.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Table: space_blocked_periods
-- Periods when a space is ENTIRELY unavailable (owner vacation, maintenance).
-- Different from bookings — this is owner-controlled blocking.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.space_blocked_periods (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id        UUID NOT NULL REFERENCES public.parking_spaces(id) ON DELETE CASCADE,
  blocked_from    TIMESTAMPTZ NOT NULL,
  blocked_until   TIMESTAMPTZ NOT NULL,
  reason          TEXT,           -- e.g., "Maintenance", "Owner vacation"

  -- Constraint: end must be after start
  CONSTRAINT blocked_period_valid CHECK (blocked_until > blocked_from),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blocked_periods_space_id
  ON public.space_blocked_periods(space_id);

CREATE INDEX IF NOT EXISTS idx_blocked_periods_range
  ON public.space_blocked_periods(space_id, blocked_from, blocked_until);

ALTER TABLE public.space_blocked_periods ENABLE ROW LEVEL SECURITY;

-- Drivers see blocked periods to understand availability gaps.
CREATE POLICY "blocked_select_all"
  ON public.space_blocked_periods FOR SELECT USING (TRUE);

-- Only the space owner can manage blocked periods.
CREATE POLICY "blocked_manage_owner"
  ON public.space_blocked_periods
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.parking_spaces ps
      WHERE ps.id = space_id AND ps.owner_id = auth.uid()
    )
  );
