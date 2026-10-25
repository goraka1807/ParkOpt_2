import { useState } from 'react'
import { supabaseConfigured } from '../lib/supabase'

const VEHICLE_TYPES = ['motorcycle', 'compact', 'sedan', 'suv', 'van', 'truck', 'electric']

function formatPrice(paisa) {
  if (!paisa && paisa !== 0) return '—'
  return '₹' + (paisa / 100).toFixed(2)
}

function StepIndicator({ current, total }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-all ${
            i < current ? 'bg-[#c5f269]' : i === current - 1 ? 'bg-[#c5f269]' : 'bg-[#1c2b3c]'
          }`}
        />
      ))}
    </div>
  )
}

export default function BookingScreen({ facility, searchParams, session, onConfirmed, onBack }) {
  const [step, setStep] = useState(1) // 1=time, 2=vehicle, 3=review, 4=submitting
  const [startsAt, setStartsAt] = useState(searchParams?.starts_at?.slice(0, 16) || '')
  const [endsAt, setEndsAt] = useState(searchParams?.ends_at?.slice(0, 16) || '')
  const [vehicleType, setVehicleType] = useState(searchParams?.vehicle_type || 'sedan')
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [driverNotes, setDriverNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const name = facility?.space_name || facility?.name || 'Parking Facility'
  const spaceId = facility?.space_id || facility?.id

  // Duration in hours
  const durationHours =
    startsAt && endsAt
      ? Math.max(0, (new Date(endsAt) - new Date(startsAt)) / 3_600_000)
      : 0

  const durationValid = durationHours >= 2
  const estimatedPaisa =
    facility?.hourly_rate_paisa && durationHours > 0
      ? Math.round(facility.hourly_rate_paisa * durationHours)
      : null

  const submit = async () => {
    if (!supabaseConfigured) {
      setError('Backend not configured.')
      return
    }
    if (!session?.access_token) {
      setError('Not authenticated.')
      return
    }
    if (!durationValid) {
      setError('Minimum booking duration is 2 hours.')
      return
    }
    setLoading(true)
    setError(null)

    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
      const body = {
        space_id: spaceId,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
        vehicle_type: vehicleType,
        ...(vehiclePlate && { vehicle_plate: vehiclePlate }),
        ...(driverNotes && { driver_notes: driverNotes }),
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-booking`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || data.message || 'Booking failed')
      onConfirmed(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#051424]">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-[#051424]/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-[420px] mx-auto h-14 px-4 flex items-center gap-3">
          <button
            onClick={step === 1 ? onBack : () => setStep((s) => s - 1)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1c2b3c] transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back_ios_new</span>
          </button>
          <div className="flex-1">
            <h1 className="text-[15px] font-bold text-[#F8FAFC]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Reserve Space
            </h1>
            <p className="text-[11px] text-[#94A3B8] truncate">{name}</p>
          </div>
          <span className="text-[12px] text-[#94A3B8]">Step {step} / 3</span>
        </div>
      </header>

      <main className="flex-1 pt-14 pb-28">
        <div className="w-full max-w-[420px] mx-auto px-4 pt-6">
          <StepIndicator current={step} total={3} />

          {/* ── Step 1: Time Selection ── */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-[20px] font-bold text-[#F8FAFC]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Choose Your Time
              </h2>

              <div className="rounded-2xl bg-[#0d1c2d] border border-white/10 p-4 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider">Start Time</label>
                  <input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-[#122131] border border-white/10 text-[#F8FAFC] text-[14px] outline-none focus:border-[#c5f269]/50 transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider">End Time</label>
                  <input
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-[#122131] border border-white/10 text-[#F8FAFC] text-[14px] outline-none focus:border-[#c5f269]/50 transition-colors"
                  />
                </div>

                {startsAt && endsAt && (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${durationValid ? 'bg-[#c5f269]/10 border border-[#c5f269]/20' : 'bg-[#93000a]/20 border border-[#FB7185]/20'}`}>
                    <span className={`material-symbols-outlined text-[18px] ${durationValid ? 'text-[#c5f269]' : 'text-[#FB7185]'}`}>
                      {durationValid ? 'schedule' : 'warning'}
                    </span>
                    <span className={`text-[13px] ${durationValid ? 'text-[#c5f269]' : 'text-[#FB7185]'}`}>
                      {durationValid
                        ? `${durationHours.toFixed(1)}h selected · Minimum 2h met`
                        : `${durationHours.toFixed(1)}h — Minimum 2 hours required`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 2: Vehicle Details ── */}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-[20px] font-bold text-[#F8FAFC]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Vehicle Details
              </h2>

              <div className="rounded-2xl bg-[#0d1c2d] border border-white/10 p-4 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider">Vehicle Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {VEHICLE_TYPES.map((v) => (
                      <button
                        key={v}
                        onClick={() => setVehicleType(v)}
                        className={`py-2 px-2 rounded-xl text-[12px] font-semibold transition-colors ${
                          vehicleType === v
                            ? 'bg-[#c5f269] text-[#253600]'
                            : 'bg-[#122131] border border-white/10 text-[#94A3B8] hover:text-[#F8FAFC]'
                        }`}
                        style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                      >
                        {v.charAt(0).toUpperCase() + v.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider">
                    Vehicle Plate <span className="normal-case text-[#94A3B8]/60">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                    placeholder="e.g. DL01AB1234"
                    maxLength={15}
                    className="w-full px-4 py-3 rounded-xl bg-[#122131] border border-white/10 text-[#F8FAFC] text-[14px] font-mono placeholder-[#94A3B8] outline-none focus:border-[#c5f269]/50 transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider">
                    Notes <span className="normal-case text-[#94A3B8]/60">(optional)</span>
                  </label>
                  <textarea
                    value={driverNotes}
                    onChange={(e) => setDriverNotes(e.target.value)}
                    placeholder="Any notes for the parking operator..."
                    rows={2}
                    className="w-full px-4 py-3 rounded-xl bg-[#122131] border border-white/10 text-[#F8FAFC] text-[14px] placeholder-[#94A3B8] outline-none focus:border-[#c5f269]/50 transition-colors resize-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Review & Confirm ── */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-[20px] font-bold text-[#F8FAFC]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Review Booking
              </h2>

              <div className="rounded-2xl bg-[#0d1c2d] border border-white/10 p-4 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#1c2b3c] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[#c5f269] text-[20px]">local_parking</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-bold text-[#F8FAFC] truncate">{name}</h3>
                    <p className="text-[12px] text-[#94A3B8] truncate">{facility?.address}</p>
                  </div>
                </div>

                <div className="h-px bg-white/5" />

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#122131] rounded-xl p-3">
                    <p className="text-[10px] text-[#94A3B8] uppercase tracking-wider mb-1">Start</p>
                    <p className="text-[12px] font-semibold text-[#F8FAFC]">
                      {new Date(startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-[11px] text-[#94A3B8]">{new Date(startsAt).toLocaleDateString()}</p>
                  </div>
                  <div className="bg-[#122131] rounded-xl p-3">
                    <p className="text-[10px] text-[#94A3B8] uppercase tracking-wider mb-1">End</p>
                    <p className="text-[12px] font-semibold text-[#F8FAFC]">
                      {new Date(endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-[11px] text-[#94A3B8]">{new Date(endsAt).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-[#122131] rounded-xl p-3">
                  <div>
                    <p className="text-[10px] text-[#94A3B8] uppercase tracking-wider mb-0.5">Vehicle</p>
                    <p className="text-[13px] font-semibold text-[#F8FAFC]">
                      {vehicleType.charAt(0).toUpperCase() + vehicleType.slice(1)}
                      {vehiclePlate && ` · ${vehiclePlate}`}
                    </p>
                  </div>
                  <span className="text-[10px] text-[#94A3B8]">{durationHours.toFixed(1)}h</span>
                </div>

                {estimatedPaisa && (
                  <div className="flex items-center justify-between bg-[#c5f269]/10 border border-[#c5f269]/20 rounded-xl p-3">
                    <span className="text-[13px] text-[#94A3B8]">Estimated Total</span>
                    <span className="text-[20px] font-bold text-[#F8FAFC]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                      {formatPrice(estimatedPaisa)}
                    </span>
                  </div>
                )}
              </div>

              {error && (
                <div className="px-4 py-3 rounded-xl bg-[#93000a]/20 border border-[#FB7185]/20 text-[#FB7185] text-[13px]">
                  {error}
                </div>
              )}

              {!supabaseConfigured && (
                <div className="px-4 py-3 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B] text-[12px]">
                  Backend not configured — booking cannot be submitted without Supabase credentials.
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer CTA */}
      <div className="fixed bottom-0 w-full max-w-[420px] left-1/2 -translate-x-1/2 z-40 px-4 py-4 bg-gradient-to-t from-[#051424] to-transparent">
        {step < 3 ? (
          <button
            onClick={() => {
              if (step === 1 && !durationValid) return
              setStep((s) => s + 1)
            }}
            disabled={step === 1 && !durationValid}
            className="w-full py-4 rounded-full bg-[#c5f269] text-[#253600] font-bold text-[15px] flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40"
            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
          >
            Continue
            <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={loading}
            className="w-full py-4 rounded-full bg-[#c5f269] text-[#253600] font-bold text-[15px] flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-[#253600]/30 border-t-[#253600] rounded-full animate-spin" />
            ) : (
              <>
                <span className="material-symbols-outlined text-[20px]">lock</span>
                Confirm Booking
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
