// =============================================================================
// Supabase Edge Function: search-parking
// File: backend/supabase/functions/search-parking/index.ts
//
// Purpose: HTTP endpoint for the parking discovery search.
//          Wraps the search_parking_spaces() database function.
//
// Why an Edge Function for search?
// The database function already does the heavy lifting (PostGIS radius search,
// availability calculation, recommendation scoring). The Edge Function provides
// a clean REST API, input validation, and pagination headers.
//
// Deployed at: POST /functions/v1/search-parking
// Auth: Optional — unauthenticated users can search, but availability results
//       are shown to all. Auth just personalizes future results.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Validation helpers
const isNumber = (v: unknown): v is number => typeof v === 'number' && isFinite(v)
const validTimestamp = (val: unknown): val is string =>
  typeof val === 'string' && !isNaN(Date.parse(val))

Deno.serve(async (req: Request) => {
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
    // 1. Create Supabase client.
    //    For search, we use the anon key — unauthenticated users can search.
    //    If an auth token is present, it's forwarded so auth.uid() is set.
    // -------------------------------------------------------------------------
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      authHeader
        ? { global: { headers: { Authorization: authHeader } } }
        : {}
    )

    // -------------------------------------------------------------------------
    // 2. Parse request body
    // -------------------------------------------------------------------------
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return new Response(
        JSON.stringify({ error: 'Request body must be valid JSON.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const {
      lat,
      lng,
      radius_km   = 5.0,
      starts_at   = null,
      ends_at     = null,
      vehicle_type = null,
      max_price   = null,
      covered_only = false,
      ev_charging  = false,
      limit       = 20,
      offset      = 0,
    } = body

    // Required: lat and lng
    if (!isNumber(lat) || lat < -90 || lat > 90) {
      return new Response(
        JSON.stringify({
          error: 'lat is required and must be a number between -90 and 90.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!isNumber(lng) || lng < -180 || lng > 180) {
      return new Response(
        JSON.stringify({
          error: 'lng is required and must be a number between -180 and 180.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate radius
    if (!isNumber(radius_km) || radius_km <= 0 || radius_km > 50) {
      return new Response(
        JSON.stringify({
          error: 'radius_km must be a positive number between 0 and 50.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // If time window provided, validate both timestamps
    if (starts_at !== null || ends_at !== null) {
      if (!validTimestamp(starts_at) || !validTimestamp(ends_at)) {
        return new Response(
          JSON.stringify({
            error: 'If providing a time window, both starts_at and ends_at must be valid ISO 8601 timestamps.'
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (new Date(starts_at as string) >= new Date(ends_at as string)) {
        return new Response(
          JSON.stringify({ error: 'starts_at must be before ends_at.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Clamp limit to reasonable range
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100)
    const safeOffset = Math.max(Number(offset) || 0, 0)

    // -------------------------------------------------------------------------
    // 3. Call the database function
    // -------------------------------------------------------------------------
    const { data, error } = await supabase.rpc('search_parking_spaces', {
      p_lat:          lat,
      p_lng:          lng,
      p_radius_km:    radius_km,
      p_starts_at:    starts_at,
      p_ends_at:      ends_at,
      p_vehicle_type: vehicle_type,
      p_max_price:    max_price,
      p_covered_only: Boolean(covered_only),
      p_ev_charging:  Boolean(ev_charging),
      p_limit:        safeLimit,
      p_offset:       safeOffset,
    })

    if (error) {
      console.error('Search RPC error:', error)
      return new Response(
        JSON.stringify({
          error: 'Search failed. Please try again.',
          detail: error.message  // safe to include in development; remove in production
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // -------------------------------------------------------------------------
    // 4. Return results with pagination metadata
    // -------------------------------------------------------------------------
    return new Response(
      JSON.stringify({
        results: data ?? [],
        count: (data ?? []).length,
        limit: safeLimit,
        offset: safeOffset,
        // Hint: if count === limit, there may be more results (use offset to paginate)
        has_more: (data ?? []).length === safeLimit,
        search_params: {
          lat, lng, radius_km, starts_at, ends_at,
          vehicle_type, covered_only, ev_charging
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Unexpected error in search-parking:', err)
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
