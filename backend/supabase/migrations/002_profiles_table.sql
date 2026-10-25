-- =============================================================================
-- Migration 002: Profiles Table
-- Purpose: Extends Supabase Auth users with application-level data.
--
-- Why a separate profiles table?
-- Supabase's auth.users table is managed by Supabase Auth and should not
-- be modified directly. We create a public.profiles table that has a 1:1
-- relationship with auth.users via a foreign key on the `id` column.
-- When a user signs up, a trigger automatically inserts their profile row.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  -- Same UUID as auth.users.id — this is the link between Auth and our data.
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Display name — required for UI personalization.
  full_name       TEXT NOT NULL DEFAULT '',

  -- Phone number — useful for parking owner contact; stored as text for
  -- international format flexibility.
  phone           TEXT,

  -- Role in the system. Default is 'driver'.
  -- NEVER let the client set this on signup — the trigger sets it.
  -- Elevation to 'owner' or 'admin' must be done via a controlled process.
  role            user_role NOT NULL DEFAULT 'driver',

  -- Avatar URL — pointing to Supabase Storage or external CDN.
  avatar_url      TEXT,

  -- Preferred vehicle type for faster search defaults.
  preferred_vehicle vehicle_type,

  -- Whether the user has agreed to the terms of service.
  -- Required to be true before making bookings.
  tos_accepted    BOOLEAN NOT NULL DEFAULT FALSE,

  -- Soft-delete / ban support — profile remains for booking history.
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Index: faster lookup by role (e.g., list all owners, list all drivers)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- ---------------------------------------------------------------------------
-- Trigger: automatically create a profile row when a new user signs up.
-- This fires on INSERT into auth.users, which happens when Supabase Auth
-- creates a new account (email/password, Google OAuth, etc.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER  -- runs with elevated privileges to INSERT into profiles
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    -- Extract full_name from OAuth metadata if available, otherwise empty string
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'driver'   -- default role; never trust client-supplied role
  );
  RETURN NEW;
END;
$$;

-- Drop trigger if it exists so this migration is re-runnable during development.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Trigger: automatically update updated_at timestamp on profile changes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security (RLS) for profiles
-- RLS means that even if someone calls the Supabase API directly, they
-- can only see and modify records they are authorized to access.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read only their own profile, or an administrator can read any profile.
-- This prevents unauthenticated or active-user access to private data such as phone numbers.
CREATE POLICY "profiles_select_own_or_admin"
  ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- Helper function for profile UPDATE policy.
-- SECURITY DEFINER allows it to read the current row without going through
-- RLS, avoiding the infinite-recursion problem that occurs when WITH CHECK
-- subqueries re-enter the same policy.
-- ---------------------------------------------------------------------------
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

-- Users can update their OWN profile for self-service fields only:
--   full_name, phone, avatar_url, preferred_vehicle, tos_accepted (true only).
-- Blocked fields (role, is_active) must not change through this policy.
-- The helper function prevents recursive policy evaluation.
CREATE POLICY "profiles_update_own_safe"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- role must remain unchanged (use elevate_user_role() for changes)
    AND role = (SELECT p.role FROM public.get_own_protected_profile_fields() p)
    -- is_active must remain unchanged (use deactivate_user() for changes)
    AND is_active = (SELECT p.is_active FROM public.get_own_protected_profile_fields() p)
    -- tos_accepted: users may accept (set TRUE) but never un-accept (set FALSE)
    AND (
      tos_accepted = TRUE
      OR tos_accepted = (SELECT p.tos_accepted FROM public.get_own_protected_profile_fields() p)
    )
  );

-- No direct INSERT via API — the trigger handles profile creation.
-- No direct DELETE — handled via auth.users cascade.
