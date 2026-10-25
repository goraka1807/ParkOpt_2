import { useState, useEffect } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabase'

function formatPrice(paisa) {
  if (!paisa && paisa !== 0) return '—'
  return '₹' + (paisa / 100).toFixed(0)
}

function StatusBadge({ status }) {
  const config = {
    active: { bg: 'bg-[#C6F36A]/20', text: 'text-[#C6F36A]', border: 'border-[#C6F36A]/30', label: 'Active' },
    upcoming: { bg: 'bg-[#c5f269]/10', text: 'text-[#c5f269]', border: 'border-[#c5f269]/20', label: 'Upcoming' },
    completed: { bg: 'bg-[#1c2b3c]', text: 'text-[#94A3B8]', border: 'border-white/10', label: 'Completed' },
    cancelled: { bg: 'bg-[#93000a]/20', text: 'text-[#FB7185]', border: 'border-[#FB7185]/20', label: 'Cancelled' },
    default: { bg: 'bg-[#1c2b3c]', text: 'text-[#94A3B8]', border: 'border-white/10', label: status },
  }
  const c = config[status?.toLowerCase()] || config.default
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${c.bg} ${c.text} ${c.border}`}>
      {c.label}
    </span>
  )
}

export default function MyBookingsScreen({ session }) {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('upcoming')

  useEffect(() => {
    if (!supabaseConfigured || !session) {
      setLoading(false)
      return
    }
    const fetchBookings = async () => {
      setLoading(true)
      setError(null)
      try {
        const { data, error: err } = await supabase
          .from('my_bookings')
          .select('*')
          .order('starts_at', { ascending: false })
        if (err) throw err
        setBookings(data || [])
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchBookings()
  }, [session])

  const upcoming = bookings.filter((b) =>
    ['active', 'upcoming', 'confirmed', 'pending'].includes(b.status?.toLowerCase())
  )
  const past = bookings.filter((b) =>
    ['completed', 'cancelled', 'expired'].includes(b.status?.toLowerCase())
  )
  const displayed = activeTab === 'upcoming' ? upcoming : past

  return (
    <div className="flex flex-col min-h-screen bg-[#051424]">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-[#051424]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-[420px] mx-auto h-14 px-4 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider block">
              Reservations & Passes
            </span>
            <h1 className="text-[18px] font-bold text-[#F8FAFC]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              My Bookings
            </h1>
          </div>
          {upcoming.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1c2b3c] border border-white/10">
              <span className="material-symbols-outlined text-[#c5f269] text-[15px]">electric_car</span>
              <span className="text-[12px] text-[#F8FAFC] font-semibold">{upcoming.length} Active</span>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 pt-14 pb-24">
        <div className="w-full max-w-[420px] mx-auto px-4 pt-4">
          {/* Tabs */}
          <div className="flex p-1 rounded-full bg-[#0d1c2d] border border-white/10 mb-4">
            {[
              { id: 'upcoming', label: 'Upcoming', count: upcoming.length },
              { id: 'past', label: 'Past', count: past.length },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex-1 py-2 px-3 rounded-full text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === t.id
                    ? 'bg-[#c5f269] text-[#253600]'
                    : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                {t.label}
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  activeTab === t.id ? 'bg-[#253600]/30 text-[#253600]' : 'bg-[#1c2b3c] text-[#94A3B8]'
                }`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-16">
              <span className="w-6 h-6 border-2 border-[#c5f269]/30 border-t-[#c5f269] rounded-full animate-spin" />
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="rounded-xl bg-[#93000a]/20 border border-[#FB7185]/20 px-4 py-3 text-[13px] text-[#FB7185]">
              {error}
            </div>
          )}

          {/* Not configured */}
          {!supabaseConfigured && !loading && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="material-symbols-outlined text-[48px] text-[#94A3B8] mb-3">cloud_off</span>
              <p className="text-[14px] text-[#94A3B8]">Backend not configured.<br />Add Supabase credentials to view bookings.</p>
            </div>
          )}

          {/* No auth */}
          {supabaseConfigured && !session && !loading && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="material-symbols-outlined text-[48px] text-[#94A3B8] mb-3">lock</span>
              <p className="text-[14px] text-[#94A3B8]">Sign in to view your bookings.</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && supabaseConfigured && session && displayed.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="material-symbols-outlined text-[48px] text-[#94A3B8] mb-3">confirmation_number</span>
              <p className="text-[14px] text-[#94A3B8]">
                {activeTab === 'upcoming' ? 'No upcoming bookings.' : 'No past bookings yet.'}
              </p>
            </div>
          )}

          {/* Booking cards */}
          {!loading && !error && displayed.map((b) => (
            <div key={b.id || b.booking_id} className="rounded-2xl bg-[#0d1c2d] border border-white/10 p-4 mb-3">
              <div className="flex items-center justify-between mb-3">
                <StatusBadge status={b.status} />
                <span className="text-[16px] font-bold text-[#F8FAFC]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  {formatPrice(b.total_price_paisa || b.total_price)}
                </span>
              </div>

              <h3 className="text-[16px] font-bold text-[#F8FAFC] mb-0.5 truncate" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                {b.space_name || b.facility_name || 'Parking Facility'}
              </h3>
              <p className="text-[12px] text-[#94A3B8] mb-3 truncate">{b.address || ''}</p>

              <div className="rounded-xl bg-[#122131] p-3 flex items-center gap-3">
                <span className="material-symbols-outlined text-[#94A3B8] text-[16px]">schedule</span>
                <span className="text-[12px] text-[#F8FAFC]">
                  {new Date(b.starts_at).toLocaleString([], {
                    month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                  {' – '}
                  {new Date(b.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {b.vehicle_type && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="material-symbols-outlined text-[#94A3B8] text-[14px]">directions_car</span>
                  <span className="text-[12px] text-[#94A3B8] capitalize">{b.vehicle_type}</span>
                  {b.vehicle_plate && (
                    <span className="text-[11px] font-mono text-[#94A3B8]">· {b.vehicle_plate}</span>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                <span className="text-[11px] font-mono text-[#94A3B8]">
                  #{(b.id || b.booking_id || '').slice(-8).toUpperCase()}
                </span>
                {b.status?.toLowerCase() === 'cancelled' && (
                  <span className="text-[11px] text-[#FB7185]">Cancelled</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
