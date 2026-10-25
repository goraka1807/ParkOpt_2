import { useState, useEffect, useCallback } from 'react'
import { supabaseConfigured } from '../lib/supabase'

const VEHICLE_TYPES = ['motorcycle', 'compact', 'sedan', 'suv', 'van', 'truck', 'electric']

// Default search centre: Pune, India
const DEFAULT_LAT = 18.5204
const DEFAULT_LNG = 73.8567

function formatPrice(paisa) {
  if (!paisa && paisa !== 0) return '—'
  return '₹' + (paisa / 100).toFixed(0)
}

function formatDist(km) {
  if (km === undefined || km === null) return ''
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

export default function SearchScreen({ onSelectFacility, session }) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [vehicleType, setVehicleType] = useState('sedan')
  const [coveredOnly, setCoveredOnly] = useState(false)

  // Default: next 2 hours from now
  const nowRounded = () => {
    const d = new Date()
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0)
    return d
  }
  const [startsAt, setStartsAt] = useState(() => {
    const d = nowRounded()
    return d.toISOString().slice(0, 16)
  })
  const [endsAt, setEndsAt] = useState(() => {
    const d = nowRounded()
    d.setHours(d.getHours() + 2)
    return d.toISOString().slice(0, 16)
  })

  const search = useCallback(async () => {
    if (!supabaseConfigured) {
      setError('Backend not configured.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
      const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      const headers = { 'Content-Type': 'application/json', 'apikey': ANON_KEY }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

      const body = {
        lat: DEFAULT_LAT,
        lng: DEFAULT_LNG,
        radius_km: 10,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
        vehicle_type: vehicleType,
        covered_only: coveredOnly,
        limit: 20,
        offset: 0,
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/search-parking`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || data.message || 'Search failed')
      setResults(data.results || [])
    } catch (err) {
      setError(err.message)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [startsAt, endsAt, vehicleType, coveredOnly, session])

  useEffect(() => { search() }, [search])

  return (
    <div className="flex flex-col min-h-screen bg-[#051424]">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-[#051424]/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-[420px] mx-auto h-14 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[18px] font-bold tracking-tight text-[#F8FAFC]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Park<span className="text-[#c5f269]">Opt</span>
            </span>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#1c2b3c] border border-white/10">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C6F36A] animate-pulse" />
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#C6F36A]">Live</span>
            </div>
          </div>
          <span className="text-[13px] text-[#94A3B8]">Explore</span>
        </div>
      </header>

      <main className="flex-1 pt-14 pb-24 flex flex-col">
        {/* SVG map placeholder */}
        <div className="w-full h-[200px] bg-[#0d1c2d] relative overflow-hidden flex-shrink-0">
          <svg width="100%" height="100%" viewBox="0 0 420 200" preserveAspectRatio="xMidYMid slice">
            <rect width="420" height="200" fill="#0d1c2d"/>
            {/* Road grid */}
            <line x1="0" y1="100" x2="420" y2="100" stroke="#1c2b3c" strokeWidth="16"/>
            <line x1="0" y1="60" x2="420" y2="60" stroke="#1c2b3c" strokeWidth="8"/>
            <line x1="0" y1="150" x2="420" y2="150" stroke="#1c2b3c" strokeWidth="8"/>
            <line x1="100" y1="0" x2="100" y2="200" stroke="#1c2b3c" strokeWidth="8"/>
            <line x1="200" y1="0" x2="200" y2="200" stroke="#1c2b3c" strokeWidth="16"/>
            <line x1="320" y1="0" x2="320" y2="200" stroke="#1c2b3c" strokeWidth="8"/>
            {/* Road dashes */}
            {[40, 120, 200, 280, 360].map((x) => (
              <line key={x} x1={x} y1="100" x2={x + 30} y2="100" stroke="#c5f269" strokeWidth="1.5" strokeDasharray="6 6" opacity="0.3"/>
            ))}
            {/* Parking markers */}
            {[
              { cx: 200, cy: 100, label: 'P1', active: true },
              { cx: 100, cy: 60, label: 'P2', active: false },
              { cx: 320, cy: 150, label: 'P3', active: false },
            ].map((m) => (
              <g key={m.label}>
                <circle cx={m.cx} cy={m.cy} r="20" fill={m.active ? '#c5f269' : '#1c2b3c'} stroke={m.active ? '#c5f269' : '#94A3B8'} strokeWidth="1.5" opacity={m.active ? 1 : 0.7}/>
                <text x={m.cx} y={m.cy + 5} textAnchor="middle" fontSize="12" fontWeight="bold" fill={m.active ? '#253600' : '#94A3B8'}>P</text>
              </g>
            ))}
          </svg>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
            <div className="px-3 py-1 rounded-full bg-[rgba(16,24,40,0.8)] border border-white/10 text-[12px] text-[#94A3B8]">
              New Delhi · 10 km radius
            </div>
          </div>
        </div>

        {/* Bottom sheet */}
        <div className="flex-1 flex flex-col w-full max-w-[420px] mx-auto px-4 pt-4">
          {/* Filters row */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            <select
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value)}
              className="shrink-0 px-3 py-1.5 rounded-full bg-[#1c2b3c] border border-white/10 text-[12px] text-[#F8FAFC] outline-none"
            >
              {VEHICLE_TYPES.map((v) => (
                <option key={v} value={v} className="bg-[#1c2b3c]">{v.charAt(0).toUpperCase() + v.slice(1)}</option>
              ))}
            </select>
            <button
              onClick={() => setCoveredOnly((v) => !v)}
              className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full border text-[12px] font-semibold transition-colors ${
                coveredOnly
                  ? 'bg-[#c5f269]/20 border-[#c5f269]/50 text-[#c5f269]'
                  : 'bg-[#1c2b3c] border-white/10 text-[#94A3B8]'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">garage</span>
              Covered
            </button>
            <div className="flex gap-1 shrink-0">
              <input
                type="time"
                value={startsAt.slice(11)}
                onChange={(e) => setStartsAt(startsAt.slice(0, 11) + e.target.value)}
                className="px-2 py-1.5 rounded-full bg-[#1c2b3c] border border-white/10 text-[11px] text-[#F8FAFC] outline-none w-[76px]"
              />
              <span className="text-[#94A3B8] self-center text-[11px]">→</span>
              <input
                type="time"
                value={endsAt.slice(11)}
                onChange={(e) => setEndsAt(endsAt.slice(0, 11) + e.target.value)}
                className="px-2 py-1.5 rounded-full bg-[#1c2b3c] border border-white/10 text-[11px] text-[#F8FAFC] outline-none w-[76px]"
              />
            </div>
            <button
              onClick={search}
              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#c5f269] text-[#253600] text-[12px] font-bold"
            >
              <span className="material-symbols-outlined text-[14px]">search</span>
            </button>
          </div>

          {/* Results heading */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider">Nearby Facilities</span>
            {!loading && !error && (
              <span className="text-[12px] text-[#94A3B8]">{results.length} found</span>
            )}
          </div>

          {/* States */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <span className="w-6 h-6 border-2 border-[#c5f269]/30 border-t-[#c5f269] rounded-full animate-spin" />
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl bg-[#93000a]/20 border border-[#FB7185]/20 px-4 py-3 text-[13px] text-[#FB7185]">
              {error}
            </div>
          )}

          {!loading && !error && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <span className="material-symbols-outlined text-[48px] text-[#94A3B8] mb-3">local_parking</span>
              <p className="text-[14px] text-[#94A3B8]">No facilities found.<br />Try adjusting filters or time range.</p>
            </div>
          )}

          {/* Result cards */}
          {!loading && !error && results.map((r) => (
            <button
              key={r.space_id || r.id}
              onClick={() => onSelectFacility(r, { starts_at: startsAt, ends_at: endsAt, vehicle_type: vehicleType })}
              className="w-full text-left mb-3 rounded-2xl bg-[#0d1c2d] border border-white/10 p-4 hover:border-[#c5f269]/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-[#1c2b3c] text-[#94A3B8] uppercase font-semibold">
                      {r.facility_type || r.space_type || 'Parking'}
                    </span>
                    {r.distance_km !== undefined && (
                      <span className="text-[11px] text-[#94A3B8]">{formatDist(r.distance_km)}</span>
                    )}
                  </div>
                  <h3 className="text-[15px] font-bold text-[#F8FAFC] truncate mb-0.5" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                    {r.space_name || r.name}
                  </h3>
                  <p className="text-[12px] text-[#94A3B8] truncate">{r.address || r.formatted_address}</p>
                  <div className="flex items-center gap-3 mt-2">
                    {r.available_capacity !== undefined && (
                      <span className="flex items-center gap-1 text-[11px] text-[#C6F36A]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#C6F36A]" />
                        {r.available_capacity} available
                      </span>
                    )}
                    {r.is_covered && (
                      <span className="flex items-center gap-1 text-[11px] text-[#94A3B8]">
                        <span className="material-symbols-outlined text-[13px]">garage</span>
                        Covered
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-[18px] font-bold text-[#F8FAFC]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                    {formatPrice(r.hourly_rate_paisa || r.price_per_hour)}
                  </span>
                  <span className="text-[11px] text-[#94A3B8] block">/hr</span>
                  <span className="material-symbols-outlined text-[#c5f269] text-[16px] mt-1">arrow_forward</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}
