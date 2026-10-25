-- =============================================================================
-- Migration 001: Extensions and Custom Types
-- Purpose: Enable PostGIS for geospatial queries and define enum types
--          used throughout the ParkOpt schema.
-- Run order: FIRST — all other migrations depend on this.
-- =============================================================================

-- PostGIS gives us the geography/geometry types and spatial functions like
-- ST_DWithin (find things within a radius) and ST_Distance (calculate distance).
-- This is how we'll power "find parking near destination X".
CREATE EXTENSION IF NOT EXISTS postgis;

-- pgcrypto gives us gen_random_uuid() for generating UUIDs in functions.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Enum: user_role
-- Determines what a user can do in the system.
-- 'driver'  — can search and book parking
-- 'owner'   — can list and manage parking spaces
-- 'admin'   — platform administrator
--
-- IMPORTANT: This is stored in the database and enforced by RLS.
-- The role is NEVER trusted from the frontend payload.
-- ---------------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('driver', 'owner', 'admin');

-- ---------------------------------------------------------------------------
-- Enum: booking_status
-- Tracks the lifecycle of a parking reservation.
-- 'pending'   — created but not yet confirmed (reserved slot while paying)
-- 'confirmed' — payment completed / booking active
-- 'cancelled' — cancelled by driver or owner
-- 'completed' — parking session finished
-- 'no_show'   — driver did not arrive
-- ---------------------------------------------------------------------------
CREATE TYPE booking_status AS ENUM (
  'pending',
  'confirmed',
  'cancelled',
  'completed',
  'no_show'
);

-- ---------------------------------------------------------------------------
-- Enum: vehicle_type
-- The category of vehicle a parking space can accommodate.
-- ---------------------------------------------------------------------------
CREATE TYPE vehicle_type AS ENUM (
  'motorcycle',
  'compact',
  'sedan',
  'suv',
  'van',
  'truck',
  'electric'     -- for spaces with EV charging
);

-- ---------------------------------------------------------------------------
-- Enum: space_status
-- Whether a parking space is currently accepting bookings.
-- ---------------------------------------------------------------------------
CREATE TYPE space_status AS ENUM (
  'active',      -- visible in search, bookable
  'inactive',    -- hidden from search (owner paused it)
  'pending_review', -- waiting for admin approval
  'suspended'    -- removed by admin
);
