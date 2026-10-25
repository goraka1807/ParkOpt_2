// =============================================================================
// Supabase Edge Function: create-booking
// File: backend/supabase/functions/create-booking/index.ts
//
// Purpose: HTTP endpoint that the frontend calls to create a booking.
//          This wraps the database function create_booking() with:
//          - HTTP request validation
//          - Proper auth header forwarding
//          - Structured JSON responses
//
// Why an Edge Function instead of direct Supabase client RPC?
// The database function already handles concurrency and authorization.
// The Edge Function provides a clean HTTP API contract for the frontend,
// adds request-level validation, and can be extended for webhooks/notifications.
//
// Deployed at: POST /functions/v1/create-booking
// Auth: Requires Authorization: Bearer <supabase_access_token>
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',        // In production: restrict to your domain
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight (browser sends OPTIONS before actual request)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Use POST.' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    // -------------------------------------------------------------------------
    // 1. Extract and validate the auth token from the request.
    //    The frontend sends: Authorization: Bearer <jwt>
    //    We forward this to Supabase, which validates the JWT and sets auth.uid()
    //    in the database session.
    // -------------------------------------------------------------------------
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({
          success: false,
          error_code: 'MISSING_TOKEN',
          message: 'Authorization header with Bearer token is required.'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // -------------------------------------------------------------------------
    // 2. Create Supabase client using the user's JWT token.
    //    This means database operations run as the authenticated user,
    //    which is how auth.uid() gets correctly set in our DB functions.
    // -------------------------------------------------------------------------
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    )

    // -------------------------------------------------------------------------
    // 3. Parse and validate the request body
    // -------------------------------------------------------------------------
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error_code: 'INVALID_JSON',
          message: 'Request body must be valid JSON.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Required fields
    const { space_id, starts_at, ends_at, vehicle_type, vehicle_plate, driver_notes } = body

    if (!space_id || typeof space_id !== 'string') {
      return new Response(
        JSON.stringify({
          success: false,
          error_code: 'MISSING_FIELD',
          message: 'space_id is required.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!starts_at || !ends_at) {
      return new Response(
        JSON.stringify({
          success: false,
          error_code: 'MISSING_FIELD',
          message: 'starts_at and ends_at are required.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!vehicle_type) {
      return new Response(
        JSON.stringify({
          success: false,
          error_code: 'MISSING_FIELD',
          message: 'vehicle_type is required.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate timestamp formats
    const validTimestamp = (val: unknown): val is string =>
      typeof val === 'string' && !isNaN(Date.parse(val))

    if (!validTimestamp(starts_at) || !validTimestamp(ends_at)) {
      return new Response(
        JSON.stringify({
          success: false,
          error_code: 'INVALID_TIMESTAMP',
          message: 'starts_at and ends_at must be valid ISO 8601 timestamps.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate vehicle_type is one of our enum values
    const validVehicleTypes = ['motorcycle', 'compact', 'sedan', 'suv', 'van', 'truck', 'electric']
    if (!validVehicleTypes.includes(vehicle_type as string)) {
      return new Response(
        JSON.stringify({
          success: false,
          error_code: 'INVALID_VEHICLE_TYPE',
          message: `vehicle_type must be one of: ${validVehicleTypes.join(', ')}`
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // -------------------------------------------------------------------------
    // 4. Call the database function create_booking()
    //    This function handles ALL business logic: availability, price,
    //    concurrency, overlap prevention, and booking insertion.
    // -------------------------------------------------------------------------
    const { data, error } = await supabase.rpc('create_booking', {
      p_space_id:      space_id,
      p_starts_at:     starts_at,
      p_ends_at:       ends_at,
      p_vehicle_type:  vehicle_type,
      p_vehicle_plate: vehicle_plate || null,
      p_driver_notes:  driver_notes || null,
    })

    if (error) {
      // Supabase RPC error (not a business logic error — DB connection issue, etc.)
      console.error('RPC error:', error)
      return new Response(
        JSON.stringify({
          success: false,
          error_code: 'RPC_ERROR',
          message: 'Failed to process booking. Please try again.'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // data contains the JSONB returned by the database function
    const result = data as {
      success: boolean
      error_code?: string
      message?: string
      booking_id?: string
    }

    if (!result.success) {
      // Business logic error from the database function
      // Map error codes to appropriate HTTP status codes
      const statusMap: Record<string, number> = {
        'UNAUTHENTICATED':       401,
        'UNAUTHORIZED':          403,
        'ACCOUNT_NOT_FOUND':     404,
        'SPACE_NOT_FOUND':       404,
        'SPACE_UNAVAILABLE':     409,
        'NO_AVAILABILITY':       409,
        'BOOKING_CONFLICT':      409,
        'VEHICLE_INCOMPATIBLE':  422,
        'INVALID_TIME_RANGE':    400,
        'PAST_START_TIME':       400,
        'INVALID_INPUT':         400,
        'CANNOT_BOOK_OWN_SPACE': 403,
        'INTERNAL_ERROR':        500,
      }

      const httpStatus = statusMap[result.error_code ?? ''] ?? 400

      return new Response(
        JSON.stringify(result),
        { status: httpStatus, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // -------------------------------------------------------------------------
    // 5. Success — return booking details
    // -------------------------------------------------------------------------
    return new Response(
      JSON.stringify(result),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    // Unexpected server error — never expose internal details to the client
    console.error('Unexpected edge function error:', err)
    return new Response(
      JSON.stringify({
        success: false,
        error_code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred. Please try again later.'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
