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
import { validateSearchRequest } from '../shared/validation.mjs'

const allowedOrigins = (Deno.env.get('CORS_ALLOWED_ORIGINS') ?? 'http://localhost:5173,https://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean)

const buildCorsHeaders = (origin: string | null) => {
  const isAllowed = origin ? allowedOrigins.includes(origin) : true
  return {
    'Access-Control-Allow-Origin': isAllowed && origin ? origin : allowedOrigins[0] ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

// Validation helpers
const isNumber = (v: unknown): v is number => typeof v === 'number' && isFinite(v)

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin')
  const corsHeaders = buildCorsHeaders(origin)

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

    const validation = validateSearchRequest(body)
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.errors[0] ?? 'Request validation failed.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const {
      lat,
      lng,
      radius_km,
      starts_at,
      ends_at,
      vehicle_type,
      max_price,
      covered_only,
      ev_charging,
      limit,
      offset,
    } = validation.normalized

    const safeLimit = limit
    const safeOffset = offset
    const safeCoveredOnly = covered_only
    const safeEvCharging = ev_charging
    const parsedMaxPrice = max_price === null ? null : Number(max_price)

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
      p_max_price:    parsedMaxPrice,
      p_covered_only: safeCoveredOnly,
      p_ev_charging:  safeEvCharging,
      p_limit:        safeLimit,
      p_offset:       safeOffset,
    })

    if (error) {
      console.error('Search RPC error:', error)
      return new Response(
        JSON.stringify({
          error: 'Search failed. Please try again.'
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
