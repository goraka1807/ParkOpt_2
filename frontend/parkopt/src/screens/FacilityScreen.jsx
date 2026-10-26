function formatPrice(paisa) {
  if (!paisa && paisa !== 0) return '—'
  return '₹' + (paisa / 100).toFixed(0)
}

function InfoRow({ icon, label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-2 text-[13px] text-text-muted">
        <span className="material-symbols-outlined text-[16px]">{icon}</span>
        {label}
      </div>
      <span className="text-[13px] font-semibold text-text-crisp">{value}</span>
    </div>
  )
}

export default function FacilityScreen({ facility, searchParams, onBook, onBack }) {
  if (!facility) return null

  const name = facility.space_name || facility.name || 'Parking Facility'
  const address = facility.address || facility.formatted_address || ''
  const type = facility.facility_type || facility.space_type || 'Parking'
  const capacity = facility.total_capacity || facility.capacity || '—'
  const available = facility.available_capacity ?? '—'
  const covered = facility.is_covered ? 'Yes' : 'No'
  const evCharging = facility.ev_charging_available ? 'Available' : 'No'
  const hourlyRate = formatPrice(facility.hourly_rate_paisa || facility.price_per_hour)

  const starts = searchParams?.starts_at
  const ends = searchParams?.ends_at
  const hours = starts && ends
    ? Math.max(0, (new Date(ends) - new Date(starts)) / 3_600_000).toFixed(1)
    : null

  const totalPaisa =
    facility.hourly_rate_paisa && hours
      ? Math.round(facility.hourly_rate_paisa * parseFloat(hours))
      : null

  return (
    <div className="flex flex-col min-h-screen bg-surface">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-surface/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-105 mx-auto h-14 px-4 flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-full flex items-center justify-center text-text-muted hover:text-text-crisp hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back_ios_new</span>
          </button>
          <h1 className="text-[16px] font-bold text-text-crisp truncate flex-1" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Facility Details
          </h1>
        </div>
      </header>

      <main className="flex-1 pt-14 pb-40 flex flex-col overflow-y-auto">
        <div className="w-full max-w-105 mx-auto px-4 pt-4 flex flex-col gap-4">
          {/* Hero image placeholder */}
          <div className="w-full h-40 rounded-2xl bg-surface-container-low border border-white/10 flex items-center justify-center overflow-hidden relative">
            <span className="material-symbols-outlined text-[64px] text-surface-container-high">local_parking</span>
            <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-black/60 text-[10px] font-bold text-white uppercase">
              {type}
            </div>
            {available !== '—' && (
              <div className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-high border border-white/10">
                <span className="w-1.5 h-1.5 rounded-full bg-status-live animate-pulse" />
                <span className="text-[11px] font-bold text-status-live">{available} open</span>
              </div>
            )}
          </div>

          {/* Name & Address */}
          <div>
            <h2 className="text-[22px] font-bold text-text-crisp mb-1" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              {name}
            </h2>
            <p className="flex items-center gap-1.5 text-[13px] text-text-muted">
              <span className="material-symbols-outlined text-[15px] text-[#c5f269]">location_on</span>
              {address}
            </p>
          </div>

          {/* Details card */}
          <div className="rounded-2xl bg-surface-container-low border border-white/10 p-4">
            <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-3">Facility Info</h3>
            <InfoRow icon="local_parking" label="Total Capacity" value={`${capacity} bays`} />
            <InfoRow icon="check_circle" label="Available Now" value={`${available} bays`} />
            <InfoRow icon="garage" label="Covered Parking" value={covered} />
            <InfoRow icon="ev_station" label="EV Charging" value={evCharging} />
            <InfoRow icon="payments" label="Hourly Rate" value={`${hourlyRate} / hr`} />
          </div>

          {/* Time slot */}
          {starts && ends && (
            <div className="rounded-2xl bg-surface-container-low border border-white/10 p-4">
              <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-3">Your Time Slot</h3>
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-[#c5f269]">schedule</span>
                <div>
                  <p className="text-[14px] font-semibold text-text-crisp">
                    {new Date(starts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {' – '}
                    {new Date(ends).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="text-[12px] text-text-muted">{hours}h · {new Date(starts).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          )}

          {/* Price estimate */}
          {totalPaisa && (
            <div className="rounded-2xl bg-[#c5f269]/10 border border-[#c5f269]/20 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Estimated Total</p>
                  <p className="text-[24px] font-bold text-text-crisp mt-0.5" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                    {formatPrice(totalPaisa)}
                  </p>
                </div>
                <span className="material-symbols-outlined text-[#c5f269] text-[32px]">receipt</span>
              </div>
              <p className="text-[11px] text-text-muted mt-1">Exact price confirmed by backend at booking time</p>
            </div>
          )}
        </div>
      </main>

      {/* CTA fixed bottom */}
      <div className="fixed bottom-0 w-full max-w-105 left-1/2 -translate-x-1/2 z-50 px-4 py-4 bg-surface">
        <button
          onClick={() => onBook(facility, searchParams)}
          className="w-full py-4 rounded-full bg-[#c5f269] !text-black font-bold text-[16px] flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-lg"
          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
        >
          <span className="material-symbols-outlined text-[20px]">local_parking</span>
          Reserve This Space
          <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
        </button>
      </div>
    </div>
  )
}
