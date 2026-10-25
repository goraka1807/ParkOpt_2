import { useState } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabase'

export default function AuthScreen({ onAuth }) {
  const [tab, setTab] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!supabaseConfigured) {
      setError('Backend not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local')
      return
    }
    setLoading(true)
    setError(null)
    setSuccessMsg(null)

    try {
      if (tab === 'signin') {
        const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password })
        if (authErr) throw authErr
        if (data.user) onAuth(data.user, data.session)
      } else {
        const { data, error: authErr } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        })
        if (authErr) throw authErr
        if (data.user && !data.session) {
          setSuccessMsg('Check your email to confirm your account, then sign in.')
        } else if (data.user && data.session) {
          onAuth(data.user, data.session)
        }
      }
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#051424] px-4 py-8">
      <div className="w-full max-w-[420px] flex flex-col">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-[26px] font-bold tracking-tight text-[#F8FAFC]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Park<span className="text-[#c5f269]">Opt</span>
            </span>
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#1c2b3c] border border-white/10">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C6F36A] animate-pulse" />
              <span className="text-[10px] font-bold tracking-wider text-[#C6F36A] uppercase">Live</span>
            </span>
          </div>
          <p className="text-[13px] text-[#94A3B8]">Smart Parking Marketplace</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-[#0d1c2d] border border-white/10 p-6">
          {/* Tabs */}
          <div className="flex p-1 rounded-full bg-[#122131] border border-white/10 mb-6">
            {['signin', 'signup'].map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(null); setSuccessMsg(null) }}
                className={`flex-1 py-2 px-3 rounded-full text-[13px] font-semibold transition-all ${
                  tab === t
                    ? 'bg-[#c5f269] text-[#253600]'
                    : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                {t === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {tab === 'signup' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Alex Morgan"
                  required
                  className="w-full px-4 py-3 rounded-full bg-[#122131] border border-white/10 text-[#F8FAFC] text-[14px] placeholder-[#94A3B8] outline-none focus:border-[#c5f269]/50 transition-colors"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-4 py-3 rounded-full bg-[#122131] border border-white/10 text-[#F8FAFC] text-[14px] placeholder-[#94A3B8] outline-none focus:border-[#c5f269]/50 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full px-4 py-3 rounded-full bg-[#122131] border border-white/10 text-[#F8FAFC] text-[14px] placeholder-[#94A3B8] outline-none focus:border-[#c5f269]/50 transition-colors"
              />
            </div>

            {error && (
              <div className="px-4 py-3 rounded-xl bg-[#93000a]/30 border border-[#FB7185]/30 text-[#FB7185] text-[13px]">
                {error}
              </div>
            )}

            {successMsg && (
              <div className="px-4 py-3 rounded-xl bg-[#c5f269]/10 border border-[#c5f269]/30 text-[#c5f269] text-[13px]">
                {successMsg}
              </div>
            )}

            {!supabaseConfigured && (
              <div className="px-4 py-3 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B] text-[12px]">
                Backend not configured — add your Supabase credentials to .env.local to enable auth.
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !!successMsg}
              className="w-full py-3.5 rounded-full bg-[#c5f269] text-[#253600] font-bold text-[14px] flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-[#253600]/30 border-t-[#253600] rounded-full animate-spin" />
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">
                    {tab === 'signin' ? 'login' : 'person_add'}
                  </span>
                  {tab === 'signin' ? 'Sign In' : 'Create Account'}
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-[#94A3B8] mt-6">
          ParkOpt · Secure Supabase Cloud Auth
        </p>
      </div>
    </div>
  )
}
