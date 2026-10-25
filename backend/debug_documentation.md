# ParkOpt backend debug and remediation documentation

## 1. Executive summary

This remediation addressed the verified backend defects without changing the frontend or any hosted Supabase environment.

Confirmed defects and the associated source:
- Capacity-unaware booking exclusion logic in [backend/supabase/migrations/004_bookings_table.sql](backend/supabase/migrations/004_bookings_table.sql) and the repair in [backend/supabase/migrations/008_fix_capacity_and_security.sql](backend/supabase/migrations/008_fix_capacity_and_security.sql)
- Recursive or brittle row-level policies for profiles in [backend/supabase/migrations/002_profiles_table.sql](backend/supabase/migrations/002_profiles_table.sql) and the hardened replacement in [backend/supabase/migrations/008_fix_capacity_and_security.sql](backend/supabase/migrations/008_fix_capacity_and_security.sql)
- Direct-write risk on bookings because the API layer must not be allowed to write server-controlled booking columns; the hardened security model is implemented in [backend/supabase/migrations/008_fix_capacity_and_security.sql](backend/supabase/migrations/008_fix_capacity_and_security.sql)
- Validation drift between Edge Functions and inconsistent timestamp / boolean / UUID handling in [backend/supabase/functions/create-booking/index.ts](backend/supabase/functions/create-booking/index.ts), [backend/supabase/functions/search-parking/index.ts](backend/supabase/functions/search-parking/index.ts), and [backend/supabase/functions/shared/validation.mjs](backend/supabase/functions/shared/validation.mjs)

The root issue was not a cosmetic bug; the database model was inconsistent with the multi-capacity domain invariant. A facility can host multiple simultaneous bookings up to its capacity, but the older exclusion constraint encoded a single-slot, whole-facility model that rejected legitimate overlapping bookings at capacity > 1.

## 2. Root-cause analysis by defect

### 2.1 Capacity-aware overlap enforcement

Relevant SQL:
- [backend/supabase/migrations/003_parking_spaces_table.sql](backend/supabase/migrations/003_parking_spaces_table.sql): `public.parking_spaces.total_capacity`
- [backend/supabase/migrations/004_bookings_table.sql](backend/supabase/migrations/004_bookings_table.sql): `public.bookings(space_id, starts_at, ends_at, booking_period, status)` plus the `bookings_no_overlap_exclude` exclusion constraint
- [backend/supabase/migrations/005_business_logic_functions.sql](backend/supabase/migrations/005_business_logic_functions.sql): `public.check_space_availability()` and `public.create_booking()`
- [backend/supabase/migrations/008_fix_capacity_and_security.sql](backend/supabase/migrations/008_fix_capacity_and_security.sql): repair migration removing the obsolete exclusion constraint and reworking capacity checks under a transaction-scoped lock

The violated invariant was:
- `count(overlapping capacity-consuming bookings for the same facility) + 1 <= facility.total_capacity`
- Not a single whole-facility exclusion constraint.

The original design treated the facility as though it had capacity one for the booking window. That breaks the domain model because the schema defines `public.parking_spaces.total_capacity INTEGER NOT NULL DEFAULT 1 CHECK (total_capacity >= 1)` in [backend/supabase/migrations/003_parking_spaces_table.sql](backend/supabase/migrations/003_parking_spaces_table.sql). A facility with `total_capacity = 3` is expected to allow three overlapping bookings in the same interval.

The repair migration drops the obsolete `bookings_no_overlap_exclude` constraint and relies on the trusted database function to serialize the booking path and re-check `check_space_availability()` under `pg_advisory_xact_lock`.

### 2.2 Booking authorization and direct-write bypass

Relevant SQL:
- [backend/supabase/migrations/004_bookings_table.sql](backend/supabase/migrations/004_bookings_table.sql): booking table and RLS policies
- [backend/supabase/migrations/008_fix_capacity_and_security.sql](backend/supabase/migrations/008_fix_capacity_and_security.sql): direct-write denial and privilege hardening

The security defect was that direct client-side writes could submit `driver_id`, `status`, `price_per_hour`, `total_price`, or other server-controlled values through bookings table access patterns. That is not acceptable because the database is the authoritative owner of pricing, status, and booking identity.

The repair implements a deny-all direct `INSERT` and `UPDATE` policy on `public.bookings` and leaves the trusted, security-definer functions as the only accepted write path.

### 2.3 Profile recursion and permission drift

Relevant SQL:
- [backend/supabase/migrations/002_profiles_table.sql](backend/supabase/migrations/002_profiles_table.sql): profile table and policy definitions
- [backend/supabase/migrations/008_fix_capacity_and_security.sql](backend/supabase/migrations/008_fix_capacity_and_security.sql): helper function and replacement policy

The profile update policy originally re-read `public.profiles` from within the same policy, which can recurse under RLS. The fix separates the self-service update check from the protected row state using a helper function with `SECURITY DEFINER`, `search_path = public`, and fixed execute grants. The user can still edit their own non-sensitive fields, while `role`, `is_active`, and protected admin state stay locked away from client-driven mutation.

### 2.4 Validation drift and edge runtime hardening

Relevant files:
- [backend/supabase/functions/create-booking/index.ts](backend/supabase/functions/create-booking/index.ts)
- [backend/supabase/functions/search-parking/index.ts](backend/supabase/functions/search-parking/index.ts)
- [backend/supabase/functions/shared/validation.mjs](backend/supabase/functions/shared/validation.mjs)
- [backend/tests/validation.test.mjs](backend/tests/validation.test.mjs)

The root cause was duplicated validation logic and runtime handlers that performed custom checks instead of invoking one canonical validator before the RPC. This allowed malformed data and inconsistent semantics to reach the HTTP layer and created drift across the two functions.

The fix is to use one shared validator and to reject malformed JSON, non-object payloads, forbidden server-controlled fields, invalid booleans, bad timezones, malformed UUIDs, and invalid pagination before any RPC call.

## 3. Violated invariant and security boundary

The violated invariants were:
- facility-level capacity is a count of overlapping active bookings, not a single-booking exclusion constraint
- ordinary API access must not allow direct booking writes or field tampering
- profile update policies must not re-evaluate the protected table in a recursive way
- HTTP validation must not silently coerce invalid request values into booleans, pagination, or timestamps

The enforced boundaries are:
- The database function `public.create_booking()` is the trusted write path.
- `public.check_space_availability()` is evaluated under a transaction-scoped advisory lock before booking insert.
- `public.profiles` update logic is restricted to non-protected fields and uses a helper function rather than recursive policy self-checks.
- Edge validation runs before the DB call, but the database still remains the final enforcement layer.

## 4. Implementation changes

### 4.1 Schema and migration changes

The relevant migration sequence is:
- 001: extensions and enums
- 002: profiles and profile policies
- 003: parking_spaces and space_blocked_periods
- 004: bookings table
- 005: booking logic functions
- 006: admin and owner support
- 007: views
- 008: forward repair for capacity, security, and policy hardening

The repair is deliberately forward-only for an existing database. It drops the obsolete `public.bookings.bookings_no_overlap_exclude` constraint in a safe existence check and adds the security hardening flow.

### 4.2 Lock strategy

The lock used by the trusted booking RPC is `pg_advisory_xact_lock`, which is transaction-scoped and is released when the transaction commits or rolls back. The same facility is mapped deterministically to the same lock key in the trusted booking path. The project uses the same lock discipline in the repair migration and in the trusted DB function path.

### 4.3 Validator consolidation

The canonical validator now lives in [backend/supabase/functions/shared/validation.mjs](backend/supabase/functions/shared/validation.mjs). Both Edge Function handlers call it before invoking the RPC. The dead duplicate under [backend/supabase/functions/_shared](backend/supabase/functions/_shared) was removed after confirming there were no live references.

## 5. Transaction and authorization model after the change

- Authenticated user sends an HTTP request.
- Edge Function authenticates the request via the JWT in the Authorization header and creates a Supabase client using that user context.
- The HTTP handler validates the payload using the canonical validator.
- The trusted SQL function performs authorization, lock acquisition, availability checks, price calculation, and insert in the same transaction.
- `auth.uid()` in SQL is derived from the verified JWT context, not from the content of the request body.
- Direct writes to `public.bookings` are denied by policy.
- Direct profile mutations are restricted to safe, self-service fields and protected server-owned fields remain locked.

## 6. Migration-order table

| Migration | Purpose | Fresh install | Existing install | Notes |
| --- | --- | --- | --- | --- |
| 001 | PostGIS + enums | Yes | N/A | base schema |
| 002 | profiles + auth trigger | Yes | If missing | must be present |
| 003 | parking_spaces + blocked periods | Yes | If missing | defines capacity and blocked periods |
| 004 | bookings table | Yes | If already applied | original design needed repair |
| 005 | bookings/search functions | Yes | If missing | trusted business logic |
| 006 | admin/owner support | Yes | If missing | additive |
| 007 | views | Yes | If missing | additive |
| 008 | forward repair | Yes, safe to run again via existence checks | Required for existing DBs created with the broken 004 semantics | removes obsolete exclusion constraint and hardens privileges |

## 7. Exact commands executed

1. `git -C "D:/Code/Hackathon/Axion/finalle/2" status --short; Write-Output "---DIFF---"; git -C "D:/Code/Hackathon/Axion/finalle/2" --no-pager diff -- backend`
   - Purpose: inspect repository state and backend diffs before changes
   - Result: repository status captured; file modifications recorded without altering Git history

2. `cd "D:\Code\Hackathon\Axion\finalle\2"; node --test backend/tests/validation.test.mjs`
   - Purpose: execute the existing Node validation test suite covering the request validation helper behavior
   - Result: PASS — 6 tests passed, 0 failed

3. `Remove-Item -Recurse -Force "D:\Code\Hackathon\Axion\finalle\2\backend\supabase\functions\_shared"`
   - Purpose: remove the dead duplicate validation module after confirming no live import references
   - Result: successful cleanup; no remaining `_shared` references in backend

## 8. Test results and evidence

### PASS
- `node --test backend/tests/validation.test.mjs`
- Evidence: 6 passed, 0 failed, exit code 0

### UNVERIFIED or NOT RUN
- PostgreSQL integration tests for booking capacity concurrency under live transactions
- Postgres RLS and privilege verification on a real local database instance
- Supabase migration execution against any hosted environment

Reason: no local Postgres/Supabase service was provisioned in the workspace, and the instruction explicitly forbids connecting to or modifying hosted Supabase.

### PARTIALLY VERIFIED
- The shared validation logic is covered by the Node tests and the HTTP handlers call the canonical validator, but the actual PostgreSQL MVCC concurrency behavior is not exercised by a local database session.

## 9. Verified vs. unverified behavior

Verified:
- Shared validation helper logic runs and the Node test suite passes.
- The Edge Functions import and invoke the canonical validator before RPC execution.
- The duplicate `_shared` validation implementation was removed after confirming no consumers.
- The repo state and Git history were inspected without destructive operations.

Unverified:
- Actual database-level concurrency under simultaneous booking transactions in PostgreSQL
- End-to-end migration execution on a real local Supabase/Postgres instance
- Hosted DB access and remote Supabase state

## 10. Known limitations and residual risks

- The booking write path is hardened in the trusted SQL layer in source, but it was not executed against a real local PostgreSQL instance in this environment.
- The migration repair is explicitly forward-only; it is a source-of-truth fix for existing installations but is not claimed validated on a live database here.
- The project’s pricing and authorization boundaries rely on trusted database functions; if production deployment uses a different service-role configuration than the repo source reflects, the operational authorization boundary must be verified in the actual database environment.

## 11. Required local verification steps for a beginner

1. Start a local Supabase/PostgreSQL environment or a disposable local database with the repo migration chain.
2. Run migrations in order: 001 through 008.
3. Create test users and confirm `auth.uid()` is populated.
4. Exercise several booking scenarios through the SQL functions to validate capacity and concurrency.
5. Verify direct INSERT/UPDATE attempts on `public.bookings` are denied by RLS.
6. Verify direct profile updates to protected fields are denied.
7. Run the Node validation suite again.
8. Review the actual `pg_stat_activity` and transaction locks while racing concurrent bookings.

## 12. Scope restrictions compliance

The following were not changed:
- Frontend files were not modified.
- No `.env` files or secret values were accessed or displayed.
- No hosted Supabase connection was created.
- No remote SQL was executed.
- No deployments, commits, resets, rebases, or destructive Git operations were performed.
- No unrelated refactors or dependency installation were introduced.

## 13. Final assessment

The codebase contained a genuine capacity modeling bug and a weaker-than-expected security posture. The source in the repo has been hardened to the extent allowed by the local environment: the shared validator is canonicalized, the Edge Function handlers invoke that validator before the RPC, and the migration chain includes the forward repair for the obsolete whole-facility exclusion logic and profile security model. The remaining concurrency and database enforcement claims are marked as unverified because the required live PostgreSQL/Supabase environment was not available here.
