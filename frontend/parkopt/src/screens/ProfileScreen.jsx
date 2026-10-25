import { useState, useEffect } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabase'

export default function ProfileScreen({ session, onSignOut }) {
  const [profile, setProfile] = useState(null)
  const [_loading, setLoading] = useState(true)
  const [signingOut, setSigningOut] = useState(false)
  const [notifyOn, setNotifyOn] = useState(true)

  useEffect(() => {
    if (!supabaseConfigured || !session) {
      setLoading(false)
      return
    }
    const fetchProfile = async () => {
      try {
        const { data } = await supabase.from('my_profile').select('*').single()
        setProfile(data)
      } catch (e) {
        void e // profile view may not exist yet — use session data
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
  }, [session])

  const handleSignOut = async () => {
    if (!supabaseConfigured) return
    setSigningOut(true)
    await supabase.auth.signOut()
    onSignOut()
  }

  const displayName =
    profile?.full_name ||
    session?.user?.user_metadata?.full_name ||
    session?.user?.email?.split('@')[0] ||
    'Driver'
  const displayEmail = session?.user?.email || '—'
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('')

  return (
    <div className="flex flex-col min-h-screen bg-[#051424]">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-[#051424]/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-[420px] mx-auto h-14 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[18px] font-bold tracking-tight text-[#F8FAFC]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Park<span className="text-[#c5f269]">Opt</span>
            </span>
            <span className="w-2 h-2 rounded-full bg-[#C6F36A]" />
          </div>
          <button
            aria-label="Settings"
            className="w-9 h-9 rounded-full bg-[#122131] flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">settings</span>
          </button>
        </div>
      </header>

      <main className="flex-1 pt-14 pb-24">
        <div className="w-full max-w-[420px] mx-auto px-4 pt-4 flex flex-col gap-5">
          {/* Page title */}
          <div className="flex items-center gap-2">
            <h1 className="text-[26px] font-bold text-[#F8FAFC]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Profile
            </h1>
            <span className="w-2 h-2 rounded-full bg-[#C6F36A]" />
          </div>

          {/* Profile card */}
          <div className="rounded-xl bg-[#122131] border border-white/8 p-4">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className="w-20 h-20 rounded-full bg-[#1c2b3c] border-2 border-white/10 flex items-center justify-center">
                  <span className="text-[24px] font-bold text-[#c5f269]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                    {initials}
                  </span>
                </div>
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#c5f269] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#253600] text-[14px]">edit</span>
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-[18px] font-bold text-[#F8FAFC] truncate" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                    {displayName}
                  </h2>
                  {session && (
                    <span className="material-symbols-outlined text-[#c5f269] text-[18px]">verified</span>
                  )}
                </div>
                <p className="text-[12px] text-[#94A3B8] truncate mt-0.5">{displayEmail}</p>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#273647] mt-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C6F36A]" />
                  <span className="text-[11px] text-[#C6F36A] tracking-wide font-semibold">
                    Driver · {session ? 'Verified' : 'Not signed in'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/5">
              {[
                { label: 'Sessions', value: profile?.total_bookings ?? '—' },
                { label: 'Member Since', value: session?.user?.created_at ? new Date(session.user.created_at).getFullYear() : '—' },
                { label: 'Status', value: session ? 'Active' : 'Guest' },
              ].map((s) => (
                <div key={s.label} className="text-center bg-[#0d1c2d] rounded-lg p-2">
                  <span className="text-[16px] font-bold text-[#F8FAFC] block" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                    {s.value}
                  </span>
                  <span className="text-[10px] text-[#94A3B8] uppercase tracking-wider">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Account Preferences */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#94A3B8] text-[18px]">tune</span>
              <h3 className="text-[12px] font-bold text-[#F8FAFC] uppercase tracking-wider" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Account Preferences
              </h3>
            </div>
            <div className="rounded-xl bg-[#122131] border border-white/8 overflow-hidden divide-y divide-white/5">
              {/* SMS toggle */}
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-[#1c2b3c] flex items-center justify-center text-[#c5f269] shrink-0">
                    <span className="material-symbols-outlined text-[18px]">notifications_active</span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[13px] font-semibold text-[#F8FAFC] block">SMS Bay Alerts</span>
                    <span className="text-[11px] text-[#94A3B8] block truncate">Real-time gate & stall guidance</span>
                  </div>
                </div>
                <button
                  role="switch"
                  aria-checked={notifyOn}
                  onClick={() => setNotifyOn((v) => !v)}
                  className={`w-12 h-6 rounded-full p-0.5 flex items-center transition-colors shrink-0 ${
                    notifyOn ? 'bg-[#c5f269]' : 'bg-[#1c2b3c]'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full transition-transform ${
                      notifyOn ? 'translate-x-6 bg-[#253600]' : 'translate-x-0 bg-[#94A3B8]'
                    }`}
                  />
                </button>
              </div>

              {[
                { icon: 'filter_alt', label: 'Default Filters', sub: 'EV, Covered, 2h slot' },
                { icon: 'lock', label: 'Privacy & Security', sub: 'Supabase Cloud Auth' },
                { icon: 'support_agent', label: 'Help Center', sub: '24/7 gate assistance' },
              ].map((item) => (
                <button
                  key={item.label}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-[#1c2b3c] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[#1c2b3c] flex items-center justify-center text-[#94A3B8] shrink-0">
                      <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-[13px] font-semibold text-[#F8FAFC] block">{item.label}</span>
                      <span className="text-[11px] text-[#94A3B8] block truncate">{item.sub}</span>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-[#94A3B8] text-[18px] shrink-0">chevron_right</span>
                </button>
              ))}
            </div>
          </div>

          {/* Sign Out */}
          <div className="flex flex-col items-center gap-4 pt-2 pb-4">
            <button
              onClick={handleSignOut}
              disabled={signingOut || !session}
              className="w-full py-3.5 px-4 rounded-full bg-[#122131] text-[#FB7185] font-semibold text-[14px] flex items-center justify-center gap-2 border border-white/8 hover:bg-[#1c2b3c] active:scale-[0.99] transition-all disabled:opacity-40"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              {signingOut ? (
                <span className="w-4 h-4 border-2 border-[#FB7185]/30 border-t-[#FB7185] rounded-full animate-spin" />
              ) : (
                <>
                  <span className="material-symbols-outlined text-[20px]">logout</span>
                  Sign Out of ParkOpt
                </>
              )}
            </button>
            <div className="text-center">
              <p className="text-[11px] text-[#94A3B8]">
                ParkOpt Mobile · Supabase Secure Cloud
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
