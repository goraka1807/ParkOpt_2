export default function PassScreen({ booking, onViewBookings, onGoHome }) {
  const {
    booking_id,
    space_name,
    total_price,
    starts_at,
    ends_at,
    vehicle_type,
  } = booking || {}

  const formatPrice = (paisa) => {
    if (!paisa && paisa !== 0) return '—'
    return '₹' + (paisa / 100).toFixed(2)
  }

  const formatTime = (iso) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (iso) => {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  }

  const shortId = booking_id ? booking_id.slice(-8).toUpperCase() : 'PENDING'

  return (
    <div className="flex flex-col min-h-screen bg-[#051424]">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-[#051424]/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-[420px] mx-auto h-14 px-4 flex items-center">
          <h1 className="text-[16px] font-bold text-[#F8FAFC]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Parking Pass
          </h1>
        </div>
      </header>

      <main className="flex-1 pt-14 pb-28">
        <div className="w-full max-w-[420px] mx-auto px-4 pt-6 flex flex-col gap-4">
          {/* Confirmation banner */}
          <div className="rounded-xl bg-[#1c2b3c] border border-white/10 px-4 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#c5f269] flex items-center justify-center">
                <span className="material-symbols-outlined text-[#253600] text-[18px]">check</span>
              </div>
              <div>
                <p className="text-[15px] font-bold text-[#F8FAFC]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  Reservation Confirmed
                </p>
                <p className="text-[12px] text-[#94A3B8]">Booking submitted successfully</p>
              </div>
            </div>
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#2c3a4c] text-[#C6F36A] text-[11px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C6F36A]" />
              ACTIVE
            </span>
          </div>

          {/* Physical pass card */}
          <div className="rounded-2xl bg-[#141D30] border border-white/10 overflow-hidden">
            {/* Card body */}
            <div className="p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider block mb-0.5">
                    Facility
                  </span>
                  <h2 className="text-[18px] font-bold text-[#F8FAFC]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                    {space_name || 'Parking Facility'}
                  </h2>
                </div>
                <button
                  onClick={() => navigator.clipboard?.writeText(shortId)}
                  className="flex items-center gap-1.5 bg-[#122131] px-3 py-1.5 rounded-full border border-white/10 hover:bg-[#1c2b3c] transition-colors"
                >
                  <span className="text-[12px] font-mono font-semibold text-[#F8FAFC]">#{shortId}</span>
                  <span className="material-symbols-outlined text-[14px] text-[#94A3B8]">content_copy</span>
                </button>
              </div>

              {/* Time */}
              <div className="rounded-xl bg-[#122131] p-4">
                <span className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider block mb-2">
                  Reserved Window
                </span>
                <div className="flex items-baseline justify-between">
                  <span className="text-[22px] font-bold text-[#C6F36A]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                    {formatTime(starts_at)} – {formatTime(ends_at)}
                  </span>
                </div>
                <p className="text-[13px] font-semibold text-[#F8FAFC] mt-1">{formatDate(starts_at)}</p>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#122131] rounded-xl p-3">
                  <span className="text-[10px] font-semibold text-[#94A3B8] uppercase block mb-1">Vehicle</span>
                  <p className="text-[13px] font-semibold text-[#F8FAFC] capitalize">{vehicle_type || '—'}</p>
                </div>
                <div className="bg-[#122131] rounded-xl p-3">
                  <span className="text-[10px] font-semibold text-[#94A3B8] uppercase block mb-1">Total</span>
                  <p className="text-[18px] font-bold text-[#F8FAFC]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                    {formatPrice(total_price)}
                  </p>
                </div>
              </div>
            </div>

            {/* Barcode section — decorative dashed separator */}
            <div className="border-t border-dashed border-white/20 px-5 py-4 bg-[#0d1c2d] flex flex-col items-center">
              <div className="w-full flex items-center justify-between mb-3">
                <span className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider">
                  Booking Reference
                </span>
                <span className="material-symbols-outlined text-[#94A3B8] text-[16px]">qr_code_2</span>
              </div>
              {/* SVG barcode (decorative) */}
              <div className="w-full bg-white rounded-lg p-3">
                <svg width="100%" height="48" viewBox="0 0 280 48" preserveAspectRatio="none">
                  <g fill="#0A0E17">
                    {[0,5,9,16,21,29,33,38,47,52,58,66,71,78,84,88,96,101,108,112,120,126,131,139,144,150,156,160,169,174,180,188,193,200,204,212,218,223,232,236,243,247,255,261,266,273,277].map((x, i) => (
                      <rect key={i} height="48" width={i % 3 === 0 ? 4 : i % 3 === 1 ? 2 : 3} x={x} y="0" />
                    ))}
                  </g>
                </svg>
                <p className="text-[11px] text-center text-[#0A0E17] font-mono font-semibold tracking-widest mt-2">
                  {booking_id ? booking_id.slice(0, 16).toUpperCase().replace(/-/g, ' ') : 'PK - BOOKING - ID'}
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <button
              onClick={onViewBookings}
              className="w-full py-4 rounded-full bg-[#c5f269] text-white font-bold text-[15px] flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              <span className="material-symbols-outlined text-[20px]">confirmation_number</span>
              View My Bookings
            </button>
            <button
              onClick={onGoHome}
              className="w-full py-3.5 rounded-full bg-[#1c2b3c] text-[#F8FAFC] font-semibold text-[14px] flex items-center justify-center gap-2 hover:bg-[#2c3a4c] transition-colors border border-white/10"
            >
              <span className="material-symbols-outlined text-[18px]">home</span>
              Back to Home
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
