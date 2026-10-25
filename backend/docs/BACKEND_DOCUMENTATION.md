# ParkOpt — Backend Documentation

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Database Schema](#database-schema)
3. [Setup Instructions](#setup-instructions)
4. [Security Model](#security-model)
5. [API Reference](#api-reference)
6. [Testing Guide](#testing-guide)
7. [Known Limitations](#known-limitations)

---

## Architecture Overview

ParkOpt's backend runs entirely on **Supabase**, which provides:
- **PostgreSQL** — relational database with full SQL power
- **Supabase Auth** — handles user registration, login, JWT token issuance
- **Row Level Security (RLS)** — database-enforced access control
- **PostgREST** — auto-generated REST API from your database schema
- **Edge Functions** — Deno-based serverless functions for custom business logic

There is no separate Express/Node.js server. Supabase's capabilities satisfy all current requirements.

```
Browser / Mobile App
       │
       │ HTTPS (anon key + user JWT)
       │
   ┌───┴──────────────────────┐
   │      Supabase Platform   │
   │                          │
   │  ┌─────────────────┐     │
   │  │   Edge Functions │     │
   │  │  create-booking  │     │
   │  │  search-parking  │     │
   │  └────────┬────────┘     │
   │           │              │
   │  ┌────────┴────────┐     │
   │  │   PostgreSQL DB  │     │
   │  │  + RLS Policies  │     │
   │  │  + DB Functions  │     │
   │  │  + PostGIS       │     │
   │  └─────────────────┘     │
   └──────────────────────────┘
```

---

## Database Schema

### Tables

#### `profiles`
Extends Supabase Auth users with application data. Created automatically via trigger when a user signs up.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID (PK) | Links to `auth.users.id` |
| `full_name` | TEXT | Display name |
| `phone` | TEXT | Optional, international format |
| `role` | ENUM | `driver`, `owner`, `admin` |
| `avatar_url` | TEXT | URL to profile image |
| `preferred_vehicle` | ENUM | Default vehicle type for search |
| `tos_accepted` | BOOLEAN | Terms of service accepted |
| `is_active` | BOOLEAN | Account active flag |

#### `parking_spaces`
Listings created by owners.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID (PK) | |
| `owner_id` | UUID (FK) | References `profiles.id` |
| `name` | TEXT | Listing title |
| `location` | GEOGRAPHY(Point) | PostGIS point for radius search |
| `latitude`, `longitude` | NUMERIC | Stored separately for display |
| `price_per_hour` | INTEGER | **Paisa** (₹1 = 100 paisa) |
| `total_capacity` | INTEGER | Total parking spots |
| `max_vehicle_type` | ENUM | Largest vehicle accepted |
| `is_covered`, `is_gated`, etc. | BOOLEAN | Amenity flags |
| `status` | ENUM | `active`, `inactive`, `pending_review`, `suspended` |

> **Currency note**: All monetary values are stored in **paisa** (Indian currency subunit). ₹50/hr = `5000` in the database. This avoids floating-point precision issues.

#### `bookings`
Reservation records. Created only via the `create_booking()` database function.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID (PK) | |
| `driver_id` | UUID (FK) | References `profiles.id` |
| `space_id` | UUID (FK) | References `parking_spaces.id` |
| `starts_at`, `ends_at` | TIMESTAMPTZ | Timezone-aware timestamps |
| `booking_period` | TSTZRANGE | Generated from starts/ends; used for overlap detection |
| `price_per_hour` | INTEGER | **Captured at booking time** (paisa) |
| `total_price` | INTEGER | Final price in paisa |
| `status` | ENUM | `pending`, `confirmed`, `cancelled`, `completed`, `no_show` |

#### `space_blocked_periods`
Owner-defined periods when a space is entirely unavailable.

### Views (queryable via REST API)

| View | Access | Purpose |
|------|--------|---------|
| `active_parking_spaces` | Public | Browse all active listings |
| `my_bookings` | Authenticated | Driver's booking history |
| `my_profile` | Authenticated | Current user's profile |
| `my_spaces` | Authenticated | Owner's listings |

---

## Setup Instructions

### Prerequisites
- Supabase account at [supabase.com](https://supabase.com)
- Supabase CLI (optional but recommended for local development)

### Step 1: Create Supabase Project
1. Go to [app.supabase.com](https://app.supabase.com) and create a new project.
2. Note your **Project URL** and **API keys** from Settings > API.

### Step 2: Enable PostGIS
In the Supabase Dashboard, go to **Database > Extensions** and enable:
- `postgis` — for geospatial queries
- `btree_gist` — for the booking overlap exclusion constraint
- `pgcrypto` — for `gen_random_uuid()`

Or run `001_extensions_and_types.sql` which enables them automatically.

### Step 3: Run Migrations
In **Supabase Dashboard > SQL Editor**, run the migration files in order:

```
001_extensions_and_types.sql
002_profiles_table.sql
003_parking_spaces_table.sql
004_bookings_table.sql
005_business_logic_functions.sql
006_admin_and_owner_support.sql
007_views.sql
```

Each file is idempotent (safe to re-run).

### Step 4: Verify Migration Success
Run this in the SQL Editor:
```sql
-- Check all tables were created
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;

-- Check RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public';

-- Check functions exist
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' ORDER BY routine_name;
```

### Step 5: Add Seed Data
1. Create a user via the Supabase Auth Dashboard or the signup API.
2. Copy their UUID from **Authentication > Users**.
3. Promote them to `owner`:
   ```sql
   UPDATE public.profiles SET role = 'owner' WHERE id = 'YOUR-UUID';
   ```
4. Open `seed/seed_bangalore_parking.sql`, replace `REPLACE_WITH_OWNER_UUID`, and run it.

### Step 6: Deploy Edge Functions
Install the Supabase CLI:
```bash
npm install -g supabase
```

Deploy functions:
```bash
cd backend
supabase login
supabase link --project-ref your-project-id
supabase functions deploy create-booking
supabase functions deploy search-parking
```

### Step 7: Configure Environment
Copy `.env.example` to `.env.local` in both the backend and frontend directories and fill in your Supabase credentials.

---

## Security Model

### Authentication vs Authorization

**Authentication** = "Who are you?" → Handled by Supabase Auth (JWT tokens).  
**Authorization** = "What can you do?" → Handled by RLS policies + DB function checks.

### Key Security Rules

1. **Service role key is NEVER in the frontend** — it bypasses all RLS.
2. **Role elevation** requires calling `elevate_user_role()` as an admin — not via direct table update.
3. **Bookings are created only via `create_booking()`** — the function validates auth, price, availability, and concurrency. Direct API inserts are restricted by RLS.
4. **Price is calculated server-side** — the frontend sends space ID and time window. The database computes the price. The frontend cannot inject a price.
5. **Overlap prevention** uses a GIST exclusion index — concurrent bookings for the same slot will cause one to fail at the database constraint level, even if application logic passes.

### RLS Policy Summary

| Table | Anon | Driver | Owner | Admin |
|-------|------|--------|-------|-------|
| `profiles` | Read active | Read/update own | Same | Read/update all |
| `parking_spaces` | Read active | Read active | CRUD own | CRUD all |
| `bookings` | None | Read/cancel own | Read own spaces' | Read all |

---

## API Reference

### Edge Functions

#### `POST /functions/v1/create-booking`
Creates a parking reservation.

**Headers:**
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request body:**
```json
{
  "space_id": "uuid",
  "starts_at": "2026-11-01T10:00:00+05:30",
  "ends_at": "2026-11-01T14:00:00+05:30",
  "vehicle_type": "sedan",
  "vehicle_plate": "KA-01-AB-1234",
  "driver_notes": "Optional notes"
}
```

**Success response (201):**
```json
{
  "success": true,
  "booking_id": "uuid",
  "space_name": "MG Road Covered Parking",
  "starts_at": "2026-11-01T10:00:00+05:30",
  "ends_at": "2026-11-01T14:00:00+05:30",
  "duration_hours": 4.0,
  "price_per_hour": 5000,
  "total_price": 20000,
  "status": "confirmed"
}
```

**Error codes:**
| Code | HTTP | Meaning |
|------|------|---------|
| `UNAUTHENTICATED` | 401 | No valid token |
| `MISSING_FIELD` | 400 | Required field missing |
| `INVALID_TIME_RANGE` | 400 | ends_at before starts_at |
| `PAST_START_TIME` | 400 | starts_at in the past |
| `SPACE_NOT_FOUND` | 404 | Invalid space_id |
| `VEHICLE_INCOMPATIBLE` | 422 | Vehicle too large for space |
| `NO_AVAILABILITY` | 409 | No slots available |
| `BOOKING_CONFLICT` | 409 | Concurrent overlap detected |

#### `POST /functions/v1/search-parking`
Finds available parking spaces near a location.

**Request body:**
```json
{
  "lat": 12.9716,
  "lng": 77.5946,
  "radius_km": 5,
  "starts_at": "2026-11-01T10:00:00+05:30",
  "ends_at": "2026-11-01T14:00:00+05:30",
  "vehicle_type": "sedan",
  "covered_only": false,
  "ev_charging": false,
  "limit": 20,
  "offset": 0
}
```

### Database RPC Functions (via REST API)

| Function | Auth | Purpose |
|----------|------|---------|
| `check_space_availability` | Optional | Check available spots for a time window |
| `calculate_booking_price` | Optional | Get price breakdown |
| `cancel_booking` | Required | Cancel a booking |
| `get_driver_bookings` | Required | Booking history |
| `get_space_bookings` | Required (owner) | Bookings for a space |
| `elevate_user_role` | Required (admin) | Change a user's role |

### Views (via REST API)

| View | Auth | URL |
|------|------|-----|
| `active_parking_spaces` | None | `GET /rest/v1/active_parking_spaces` |
| `my_bookings` | Required | `GET /rest/v1/my_bookings` |
| `my_profile` | Required | `GET /rest/v1/my_profile` |
| `my_spaces` | Required | `GET /rest/v1/my_spaces` |

---

## Testing Guide

### Import the Postman Collection
1. Open Postman.
2. Import `tests/ParkOpt_API.postman_collection.json`.
3. Set collection variables: `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

### Recommended Test Order
1. **Sign up** a driver account (1.1)
2. **Log in** — the test script auto-saves the access token (1.2)
3. **Verify profile** was auto-created (1.3)
4. **Search for parking** near Bangalore center (2.2) — saves first space ID
5. **Check availability** for that space (2.4)
6. **Get price estimate** (2.5)
7. **Create a booking** (3.1) — saves booking ID
8. **Try to double-book** the same slot — must fail (3.2)
9. **Try sub-2-hour booking** — must fail (3.3)
10. **Try booking without auth** — must fail with 401 (3.4)
11. **View booking history** (3.5 or 3.6)
12. **Cancel the booking** (3.7)

### Critical Business Rule Verification

Before claiming the backend works, verify these specific behaviors:

| Test | Expected Result |
|------|----------------|
| Book for 1 hour | `REJECTED` — minimum duration is 2 hours |
| Book for 2 hours exactly | `ACCEPTED` |
| Book an already-booked slot | `REJECTED` — NO_AVAILABILITY |
| Book with overlapping (not identical) time | `REJECTED` — BOOKING_CONFLICT |
| Book a space that's active | `ACCEPTED` |
| Book a space that's inactive | `REJECTED` — SPACE_UNAVAILABLE |
| Book your own space as owner | `REJECTED` — CANNOT_BOOK_OWN_SPACE |
| Book without auth token | `REJECTED` — UNAUTHENTICATED (401) |
| Query bookings without auth | Empty result (RLS) |
| Query another driver's bookings | Empty result (RLS) |

---

## Known Limitations

### Currently Unimplemented (by design)
1. **Payment processing** — Bookings go to `confirmed` status directly without payment. Razorpay integration is the recommended next step for India.
2. **Email notifications** — No confirmation emails yet. Resend or Supabase email templates recommended.
3. **Real-time updates** — No WebSocket/Supabase Realtime subscriptions yet. Add for live availability dashboards.
4. **Owner listing management** — Seed data has spaces, but the owner flow for creating/editing spaces via the API needs frontend integration testing.
5. **Reviews and ratings** — Schema has `avg_rating` and `review_count` columns but no `reviews` table or logic yet.
6. **Google Maps integration** — Search uses raw lat/lng. The frontend needs to use the Google Maps Places API (geocoding) to convert address text to coordinates before calling the search function.

### Environment Dependencies
- **PostGIS extension** must be enabled in Supabase before migrations run.
- **btree_gist extension** must be enabled for the booking overlap constraint.
- Edge Functions require the Supabase CLI for deployment (or the Supabase Dashboard Functions editor).
- Google Maps API keys are needed for the frontend location search (separate from the backend).
