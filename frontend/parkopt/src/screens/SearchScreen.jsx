import { useState, useEffect, useCallback } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  useMapEvents,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabaseConfigured } from '../lib/supabase'

const VEHICLE_TYPES = [
  'motorcycle',
  'compact',
  'sedan',
  'suv',
  'van',
  'truck',
  'electric',
]

const DEFAULT_LAT = 18.5204
const DEFAULT_LNG = 73.8567
const SEARCH_RADIUS_KM = 10

const selectedIcon = L.divIcon({
  className: 'selected-parking-marker',
  html: '<div>P</div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
})

const parkingIcon = L.divIcon({
  className: 'parking-map-marker',
  html: '<div>P</div>',
  iconSize: [27, 27],
  iconAnchor: [13, 13],
})

// Format a Date for an HTML datetime-local input using local time.
function toLocalDateTime(date) {
  const pad = (value) => String(value).padStart(2, '0')

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

function formatPrice(value) {
  if (value === undefined || value === null || value === '') {
    return '—'
  }

  const amount = Number(value)

  if (!Number.isFinite(amount)) return '—'

  return `₹${(amount / 100).toFixed(0)}`
}

function formatDist(km) {
  if (km === undefined || km === null || !Number.isFinite(Number(km))) {
    return ''
  }

  const distance = Number(km)

  if (distance < 1) {
    return `${Math.round(distance * 1000)} m`
  }

  return `${distance.toFixed(1)} km`
}

function getCoordinates(result) {
  const rawLat =
    result.latitude ?? result.lat ?? result.location_lat

  const rawLng =
    result.longitude ?? result.lng ?? result.location_lng

  if (
    rawLat === undefined ||
    rawLat === null ||
    rawLat === '' ||
    rawLng === undefined ||
    rawLng === null ||
    rawLng === ''
  ) {
    return null
  }

  const lat = Number(rawLat)
  const lng = Number(rawLng)

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null
  }

  return { lat, lng }
}

function MapClickHandler({ onChooseLocation }) {
  useMapEvents({
    click(event) {
      onChooseLocation({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      })
    },
  })

  return null
}

function MapRecenter({ position }) {
  const map = useMap()

  useEffect(() => {
    if (
      Number.isFinite(position.lat) &&
      Number.isFinite(position.lng)
    ) {
      map.flyTo([position.lat, position.lng], 14, {
        duration: 0.8,
      })
    }
  }, [map, position.lat, position.lng])

  return null
}

export default function SearchScreen({ onSelectFacility, session }) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [vehicleType, setVehicleType] = useState('sedan')
  const [coveredOnly, setCoveredOnly] = useState(false)

  const [selectedLocation, setSelectedLocation] = useState({
    lat: DEFAULT_LAT,
    lng: DEFAULT_LNG,
  })

  const [locationMessage, setLocationMessage] = useState(
    'Tap the map to choose your search location'
  )

  const [locating, setLocating] = useState(false)

  const [startsAt, setStartsAt] = useState(() => {
    const date = new Date()

    date.setMinutes(
      Math.ceil(date.getMinutes() / 15) * 15,
      0,
      0
    )

    return toLocalDateTime(date)
  })

  const [endsAt, setEndsAt] = useState(() => {
    const date = new Date()

    date.setMinutes(
      Math.ceil(date.getMinutes() / 15) * 15,
      0,
      0
    )

    date.setHours(date.getHours() + 2)

    return toLocalDateTime(date)
  })

  const chooseLocation = useCallback((location) => {
    setSelectedLocation(location)

    setLocationMessage(
      `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`
    )
  }, [])

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Location is not supported by this browser.')
      return
    }

    setLocating(true)
    setError(null)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }

        setSelectedLocation(location)
        setLocationMessage('Using your current location')
        setLocating(false)
      },
      (err) => {
        const message =
          err.code === 1
            ? 'Location permission denied. Allow location access in your browser settings.'
            : err.code === 2
              ? 'Your location could not be determined. Try clicking the map instead.'
              : 'Location request timed out. Please try again.'

        setError(message)
        setLocating(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    )
  }

  const search = useCallback(async () => {
    if (!supabaseConfigured) {
      setError('Backend not configured. Check your Supabase environment variables.')
      setResults([])
      return
    }

    const startDate = new Date(startsAt)
    const endDate = new Date(endsAt)

    if (
      !Number.isFinite(startDate.getTime()) ||
      !Number.isFinite(endDate.getTime())
    ) {
      setError('Please enter a valid start and end time.')
      setResults([])
      return
    }

    if (endDate <= startDate) {
      setError('End time must be later than start time.')
      setResults([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

      if (!supabaseUrl || !anonKey) {
        throw new Error('Supabase environment variables are missing.')
      }

      const headers = {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${session?.access_token || anonKey}`,
      }

      const body = {
        lat: selectedLocation.lat,
        lng: selectedLocation.lng,
        radius_km: SEARCH_RADIUS_KM,
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
        vehicle_type: vehicleType,
        covered_only: coveredOnly,
        limit: 20,
        offset: 0,
      }

      const response = await fetch(
        `${supabaseUrl.replace(/\/$/, '')}/functions/v1/search-parking`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        }
      )

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(
          data.error ||
            data.message ||
            `Search failed (${response.status}).`
        )
      }

      setResults(Array.isArray(data.results) ? data.results : [])
    } catch (err) {
      setError(err.message || 'Search failed. Please try again.')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [
    startsAt,
    endsAt,
    vehicleType,
    coveredOnly,
    selectedLocation,
    session?.access_token,
  ])

  useEffect(() => {
    search()
  }, [search])

  return (
    <div className="flex min-h-screen flex-col bg-[#051424]">
      {/* Header */}
      <header className="fixed top-0 z-[1000] w-full border-b border-white/5 bg-[#051424]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[420px] items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span
              className="text-[18px] font-bold tracking-tight text-[#F8FAFC]"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              Park<span className="text-[#c5f269]">Opt</span>
            </span>

            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-[#1c2b3c] px-2 py-0.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#C6F36A]" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#C6F36A]">
                Live
              </span>
            </div>
          </div>

          <span className="text-[13px] text-[#94A3B8]">
            Explore
          </span>
        </div>
      </header>

      <main className="flex flex-1 flex-col pb-24 pt-14">
        {/* Interactive OpenStreetMap */}
        <div className="relative h-[260px] w-full flex-shrink-0 bg-[#0d1c2d]">
          <MapContainer
            center={[DEFAULT_LAT, DEFAULT_LNG]}
            zoom={13}
            scrollWheelZoom
            className="h-full w-full"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />

            <MapClickHandler onChooseLocation={chooseLocation} />

            <MapRecenter position={selectedLocation} />

            <Circle
              center={[selectedLocation.lat, selectedLocation.lng]}
              radius={SEARCH_RADIUS_KM * 1000}
              pathOptions={{
                color: '#8fbf42',
                fillColor: '#c5f269',
                fillOpacity: 0.08,
                weight: 2,
              }}
            />

            <Marker
              position={[selectedLocation.lat, selectedLocation.lng]}
              icon={selectedIcon}
            >
              <Popup>Selected search location</Popup>
            </Marker>

            {results.map((result, index) => {
              const coords = getCoordinates(result)

              if (!coords) return null

              const markerId =
                result.space_id ?? result.id ?? `parking-${index}`

              return (
                <Marker
                  key={markerId}
                  position={[coords.lat, coords.lng]}
                  icon={parkingIcon}
                >
                  <Popup>
                    <strong>
                      {result.space_name || result.name || 'Parking'}
                    </strong>

                    <br />

                    {formatPrice(
                      result.hourly_rate_paisa ??
                        result.price_per_hour
                    )}{' '}
                    /hr

                    <br />

                    <button
                      type="button"
                      onClick={() =>
                        onSelectFacility?.(result, {
                          starts_at: new Date(startsAt).toISOString(),
                          ends_at: new Date(endsAt).toISOString(),
                          vehicle_type: vehicleType,
                        })
                      }
                      style={{
                        marginTop: '6px',
                        padding: '5px 10px',
                        background: '#c5f269',
                        color: '#253600',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                      }}
                    >
                      View parking
                    </button>
                  </Popup>
                </Marker>
              )
            })}
          </MapContainer>

          {/* Map controls */}
          <div className="pointer-events-none absolute left-3 right-3 top-3 z-[500] flex items-start justify-between gap-2">
            <div className="rounded-xl border border-white/10 bg-[#051424]/90 px-3 py-2 text-[11px] text-[#F8FAFC] shadow-lg">
              <div className="font-bold">Search area</div>
              <div className="text-[#C6F36A]">10 km radius</div>
            </div>

            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              className="pointer-events-auto rounded-xl bg-[#c5f269] px-3 py-2 text-[11px] font-bold text-[#253600] shadow-lg disabled:opacity-60"
            >
              {locating ? 'Locating...' : '◎ My Location'}
            </button>
          </div>
        </div>

        {/* Location status */}
        <div className="mx-auto w-full max-w-[420px] px-4 pt-3">
          <div className="flex items-center gap-2 text-[11px] text-[#94A3B8]">
            <span className="material-symbols-outlined text-[16px] text-[#C6F36A]">
              location_on
            </span>

            <span className="truncate">{locationMessage}</span>
          </div>
        </div>

        {/* Filters and results */}
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col px-4 pt-4">
          {/* Filters */}
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            <select
              value={vehicleType}
              onChange={(event) => setVehicleType(event.target.value)}
              className="shrink-0 rounded-full border border-white/10 bg-[#1c2b3c] px-3 py-1.5 text-[12px] text-[#F8FAFC] outline-none"
            >
              {VEHICLE_TYPES.map((vehicle) => (
                <option
                  key={vehicle}
                  value={vehicle}
                  className="bg-[#1c2b3c]"
                >
                  {vehicle.charAt(0).toUpperCase() + vehicle.slice(1)}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setCoveredOnly((value) => !value)}
              className={`flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                coveredOnly
                  ? 'border-[#c5f269]/50 bg-[#c5f269]/20 text-[#c5f269]'
                  : 'border-white/10 bg-[#1c2b3c] text-[#94A3B8]'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">
                garage
              </span>
              Covered
            </button>

            <div className="flex shrink-0 items-center gap-1">
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                aria-label="Start date and time"
                className="w-[155px] rounded-full border border-white/10 bg-[#1c2b3c] px-2 py-1.5 text-[11px] text-[#F8FAFC] outline-none"
              />

              <input
                type="datetime-local"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
                aria-label="End date and time"
                className="w-[155px] rounded-full border border-white/10 bg-[#1c2b3c] px-2 py-1.5 text-[11px] text-[#F8FAFC] outline-none"
              />
            </div>

            <button
              type="button"
              onClick={search}
              aria-label="Search parking"
              className="flex shrink-0 items-center gap-1 rounded-full bg-[#c5f269] px-3 py-1.5 text-[12px] font-bold text-[#253600]"
            >
              <span className="material-symbols-outlined text-[14px]">
                search
              </span>
            </button>
          </div>

          {/* Results heading */}
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
              Nearby Facilities
            </span>

            {!loading && !error && (
              <span className="text-[12px] text-[#94A3B8]">
                {results.length} found
              </span>
            )}
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-[#c5f269]/30 border-t-[#c5f269]" />
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div
              role="alert"
              className="rounded-xl border border-[#FB7185]/20 bg-[#93000a]/20 px-4 py-3 text-[13px] text-[#FB7185]"
            >
              {error}
            </div>
          )}

          {/* Empty results */}
          {!loading && !error && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <span className="material-symbols-outlined mb-3 text-[48px] text-[#94A3B8]">
                local_parking
              </span>

              <p className="text-[14px] text-[#94A3B8]">
                No facilities found.
                <br />
                Try adjusting filters, location, or time range.
              </p>
            </div>
          )}

          {/* Result cards */}
          {!loading &&
            !error &&
            results.map((result, index) => (
              <button
                key={
                  result.space_id ??
                  result.id ??
                  `result-${index}`
                }
                type="button"
                onClick={() =>
                  onSelectFacility?.(result, {
                    starts_at: new Date(startsAt).toISOString(),
                    ends_at: new Date(endsAt).toISOString(),
                    vehicle_type: vehicleType,
                  })
                }
                className="mb-3 w-full rounded-2xl border border-white/10 bg-[#0d1c2d] p-4 text-left transition-colors hover:border-[#c5f269]/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded bg-[#1c2b3c] px-2 py-0.5 text-[10px] font-semibold uppercase text-[#94A3B8]">
                        {result.facility_type ||
                          result.space_type ||
                          'Parking'}
                      </span>

                      {result.distance_km !== undefined &&
                        result.distance_km !== null && (
                          <span className="text-[11px] text-[#94A3B8]">
                            {formatDist(result.distance_km)}
                          </span>
                        )}
                    </div>

                    <h3
                      className="mb-0.5 truncate text-[15px] font-bold text-[#F8FAFC]"
                      style={{
                        fontFamily: 'Space Grotesk, sans-serif',
                      }}
                    >
                      {result.space_name || result.name || 'Parking'}
                    </h3>

                    <p className="truncate text-[12px] text-[#94A3B8]">
                      {result.address ||
                        result.formatted_address ||
                        'Address unavailable'}
                    </p>

                    <div className="mt-2 flex items-center gap-3">
                      {result.available_capacity !== undefined &&
                        result.available_capacity !== null && (
                          <span className="flex items-center gap-1 text-[11px] text-[#C6F36A]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#C6F36A]" />
                            {result.available_capacity} available
                          </span>
                        )}

                      {result.is_covered && (
                        <span className="flex items-center gap-1 text-[11px] text-[#94A3B8]">
                          <span className="material-symbols-outlined text-[13px]">
                            garage
                          </span>
                          Covered
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <span
                      className="text-[18px] font-bold text-[#F8FAFC]"
                      style={{
                        fontFamily: 'Space Grotesk, sans-serif',
                      }}
                    >
                      {formatPrice(
                        result.hourly_rate_paisa ??
                          result.price_per_hour
                      )}
                    </span>

                    <span className="block text-[11px] text-[#94A3B8]">
                      /hr
                    </span>

                    <span className="material-symbols-outlined mt-1 text-[16px] text-[#c5f269]">
                      arrow_forward
                    </span>
                  </div>
                </div>
              </button>
            ))}
        </div>
      </main>
    </div>
  )
}