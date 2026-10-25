# ParkOpt Backend — Debug & Fix Documentation

> Generated: 2026-10-25  
> Engineer: Backend Debug Pass  
> Scope: Existing Supabase/PostgreSQL backend only — no frontend changes

---

## Summary

An independent review identified four categories of backend defects. All fixes have been implemented at the SQL/migration level. This document records every change, the reason for each fix, and the validation status.

---

## Fix 1 — Multi-Capacity Booking Constraint (Critical)

### Problem

Migration `004_bookings_table.sql` added an **exclusion constraint** (`bookings_no_overlap_exclude`) using the `btree_gist` extension. The constraint was designed to prevent overlapping bookings for the same `space_id`.

However, ParkOpt facilities are **multi-capacity parking lots** where each `space_id` represents a parking facility that can hold many vehicles simultaneously. The exclusion constraint incorrectly treated every facility as single-occupancy, causing the second booking at a partially-occupied facility to be rejected at the database constraint level before any application logic could check capacity.

Additionally, an index `idx_bookings_no_overlap` was created alongside the constraint and needed to be removed.

### Fix Applied

**Files modified:**
- `backend/supabase/migrations/004_bookings_table.sql` — Removed the `DO` block that adds `bookings_no_overlap_exclude`. For fresh database installations, the constraint is never created.
- `backend/supabase/migrations/008_fix_capacity_and_security.sql` — For existing installations, the migration drops the constraint and index if they exist.

**Key SQL (migration 008):**
```sql
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap_exclude;
DROP INDEX IF EXISTS idx_bookings_no_overlap;
```

### Validation Status

- ✅ Code-level verified: constraint `DO` block removed from migration 004.
- ✅ Code-level verified: migration 008 drops the constraint unconditionally.
- ⚠️ Cannot verify against live database — no Supabase connection available in this environment.

---

## Fix 2 — `check_space_availability()` STABLE→VOLATILE (Critical)

### Problem

The function `check_space_availability()` was declared with `LANGUAGE SQL STABLE`. The `STABLE` marking tells PostgreSQL it can cache the function result within a transaction. This caused a serious correctness bug:

When `create_booking()` acquired an advisory lock and then immediately called `check_space_availability()` to recheck the current occupancy, PostgreSQL was allowed to return a **cached result from before the lock was acquired**. This meant the recheck was effectively meaningless — it could see stale availability data and allow overbooking.

### Fix Applied

**Files modified:**
- `backend/supabase/migrations/008_fix_capacity_and_security.sql` — Rewrites `check_space_availability()` as `VOLATILE` (no caching allowed).

**Key SQL:**
```sql
CREATE OR REPLACE FUNCTION check_space_availability(...)
RETURNS TABLE(...) 
LANGUAGE plpgsql
VOLATILE  -- was incorrectly STABLE; STABLE allows caching across advisory lock boundary
SECURITY DEFINER
AS $$...$$;
```

### Validation Status

- ✅ Code-level verified: function rewritten as VOLATILE in migration 008.
- ⚠️ Cannot verify against live database — no Supabase connection available.

---

## Fix 3 — Booking RLS Policy Weakness (High)

### Problem

The original RLS policies for bookings INSERT and UPDATE used **permissive** patterns:

- `bookings_insert_via_function_only`: Used `WITH CHECK (FALSE)` correctly, but the policy name and comments implied it should only allow function-based inserts. In practice, it blocked direct inserts for everyone (including the SECURITY DEFINER function), which was correct — but was inconsistently named and coupled with other policies that created ambiguity.

- `bookings_update_driver_cancel` and `bookings_update_space_owner`: These allowed drivers to UPDATE their own booking rows directly via REST API, bypassing the `cancel_booking()` function and its business logic (e.g., cancellation window checks, refund logic).

### Fix Applied

**Files modified:**
- `backend/supabase/migrations/004_bookings_table.sql` — Replaced the three old policies with two clearly-named, hardened policies.
- `backend/supabase/migrations/008_fix_capacity_and_security.sql` — Drops old policies and creates the replacements on existing installations.

**New policies:**
```sql
-- Block ALL direct inserts; only SECURITY DEFINER functions bypass this
CREATE POLICY bookings_no_direct_insert ON bookings
  FOR INSERT TO authenticated WITH CHECK (FALSE);

-- Block ALL direct updates; only SECURITY DEFINER functions bypass this  
CREATE POLICY bookings_no_direct_update ON bookings
  FOR UPDATE TO authenticated USING (FALSE);
```

**Why SECURITY DEFINER functions bypass RLS:**  
Functions created with `SECURITY DEFINER` run as the function owner (typically `postgres`), not the calling user. RLS policies apply to the calling role, so `SECURITY DEFINER` functions are not subject to user-facing RLS unless explicitly configured with `SET row_security = on`.

### Validation Status

- ✅ Code-level verified: old policies removed from migration 004; new policies in place.
- ✅ Code-level verified: migration 008 drops old policies and creates new ones.
- ⚠️ Cannot verify live RLS enforcement — no Supabase connection available.

---

## Fix 4 — Profile Update Policy Infinite Recursion (Medium)

### Problem

The `profiles_update_own` RLS policy on the `profiles` table used a `USING` clause that called `auth.uid()` and compared against the row being updated. However, the policy also referenced the `profiles` table itself in a subquery to check `tos_accepted`, creating a **recursive RLS evaluation loop**:

```
profiles_update_own evaluates → reads profiles table → triggers profiles_update_own → ...
```

This caused a stack overflow error (`ERROR: stack depth limit exceeded`) whenever a user attempted to update their profile.

Additionally, the policy allowed users to freely set any value for `tos_accepted`, including setting it back to `FALSE` after accepting the Terms of Service — which was a business rule violation.

### Fix Applied

**Files modified:**
- `backend/supabase/migrations/002_profiles_table.sql` — Removed the recursive policy; added `get_own_protected_profile_fields()` SECURITY DEFINER helper; added `profiles_update_own_safe` policy.
- `backend/supabase/migrations/008_fix_capacity_and_security.sql` — Same changes for existing installations.

**SECURITY DEFINER helper (breaks the recursion):**
```sql
CREATE OR REPLACE FUNCTION get_own_protected_profile_fields()
RETURNS TABLE(id uuid, tos_accepted boolean)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id, tos_accepted FROM profiles WHERE id = auth.uid();
$$;
```

**Safe non-recursive policy:**
```sql
CREATE POLICY profiles_update_own_safe ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND (
      -- Allow setting tos_accepted to TRUE, but not reverting to FALSE once set
      tos_accepted = TRUE
      OR NOT (
        SELECT p.tos_accepted
        FROM get_own_protected_profile_fields() p
        WHERE p.id = auth.uid()
      )
    )
  );
```

### Validation Status

- ✅ Code-level verified: recursive policy removed from migration 002; helper function and safe policy in place.
- ✅ Code-level verified: migration 008 applies the same fix for existing databases.
- ⚠️ Cannot verify live recursion fix — no Supabase connection available.

---

## Migration File Summary

| File | Status | Purpose |
|------|--------|---------|
| `002_profiles_table.sql` | ✅ Patched | Removed recursive RLS; added SECURITY DEFINER helper |
| `004_bookings_table.sql` | ✅ Patched | Removed exclusion constraint; replaced 3 RLS policies with 2 hardened ones |
| `008_fix_capacity_and_security.sql` | ✅ Created | Idempotent fix migration for existing database installations |

---

## Edge Function Review

The following Edge Functions were inspected for correctness:

| Function | Findings |
|----------|----------|
| `search-parking` | Delegates to `search_parking_spaces()` DB function. No auth required (public search). Correct. |
| `create-booking` | Requires `Authorization` header. Delegates to `create_booking()` SECURITY DEFINER function with advisory lock. Correct. |
| `cancel-booking` | Requires `Authorization` header. Delegates to `cancel_booking()`. Correct. |
| `calculate-price` | Delegates to `calculate_booking_price()`. No direct DB writes. Correct. |

---

## What Was NOT Changed

- No schema alterations to existing tables (no column additions/removals)
- No RLS policies weakened
- No secrets or environment variables read or modified
- No Git commits, pushes, or deployments performed
- No frontend files modified
- No Supabase project connected or queried remotely

---

## Known Limitations

1. **All database-level fixes are unverified against a live Supabase instance.** This is a deliberate constraint of the review environment. The SQL has been reviewed for correctness but not executed.

2. **Migration 008 is additive.** It uses `IF EXISTS` / `IF NOT EXISTS` guards throughout and is safe to run on both fresh and upgraded installations.

3. **Advisory lock key derivation** in `create_booking()` uses a UUID→bigint XOR hash. This is deterministic for the same `space_id` but has a theoretical collision rate of ~1 in 2^63. Acceptable for a parking marketplace.
