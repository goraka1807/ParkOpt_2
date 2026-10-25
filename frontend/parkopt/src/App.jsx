import { useState, useEffect } from 'react'
import './App.css'
import { supabase, supabaseConfigured } from './lib/supabase'

import AuthScreen from './screens/AuthScreen'
import SearchScreen from './screens/SearchScreen'
import FacilityScreen from './screens/FacilityScreen'
import BookingScreen from './screens/BookingScreen'
import PassScreen from './screens/PassScreen'
import MyBookingsScreen from './screens/MyBookingsScreen'
import ProfileScreen from './screens/ProfileScreen'
import BottomNav from './components/BottomNav'

// ── Preserved homepage (blast animation, navy BG, phone mockup) ─────────────

function BlastParticles() {
  return <div className="blast-particles" id="particleCanvasStage" aria-hidden="true" />
}

function Home({ setPage }) {
  const [blasted, setBlasted] = useState(false)

  const spawnBurst = (event, returning = false) => {
    const stage = document.getElementById('particleCanvasStage')
    if (!stage) return
    const rect = event.currentTarget.getBoundingClientRect()
    const originX = event.clientX || rect.left + rect.width / 2
    const originY = event.clientY || rect.top + rect.height / 2
    const count = returning ? 20 : 42
    const colors = ['#C6F36A', '#FFFFFF', '#67E8F9', '#818CF8', '#A7F3D0']
    for (let index = 0; index < count; index += 1) {
      const particle = document.createElement('i')
      const angle = returning
        ? Math.random() * Math.PI * 2
        : (Math.PI * 2 * index) / count + (Math.random() - 0.5) * 0.45
      const distance = returning ? 120 + Math.random() * 80 : 85 + Math.random() * 240
      particle.className = 'spark-particle'
      particle.style.left = `${returning ? originX + Math.cos(angle) * distance : originX}px`
      particle.style.top = `${returning ? originY + Math.sin(angle) * distance : originY}px`
      particle.style.setProperty('--tx', `${returning ? -Math.cos(angle) * distance : Math.cos(angle) * distance}px`)
      particle.style.setProperty('--ty', `${returning ? -Math.sin(angle) * distance : Math.sin(angle) * distance}px`)
      const color = returning ? '#C6F36A' : colors[Math.floor(Math.random() * colors.length)]
      particle.style.width = `${returning ? 4 : Math.floor(Math.random() * 6) + 3}px`
      particle.style.height = particle.style.width
      particle.style.backgroundColor = color
      particle.style.boxShadow = `0 0 12px ${color}`
      stage.appendChild(particle)
      window.setTimeout(() => particle.remove(), returning ? 700 : 900)
    }
  }

  const toggleBlast = (event) => {
    setBlasted((value) => {
      const next = !value
      const wave = document.createElement('div')
      wave.className = 'shockwave-ring'
      wave.style.left = `${event.clientX}px`
      wave.style.top = `${event.clientY}px`
      document.getElementById('particleCanvasStage')?.appendChild(wave)
      window.setTimeout(() => wave.remove(), 950)
      spawnBurst(event, value)
      return next
    })
  }

  const tiltPhone = (event) => {
    const phone = event.currentTarget.querySelector('.phone')
    if (!phone) return
    const rect = event.currentTarget.getBoundingClientRect()
    const deltaX = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2)
    const deltaY = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2)
    phone.style.transform = `perspective(1200px) rotateX(${-deltaY * 12}deg) rotateY(${deltaX * 14}deg) rotateZ(8deg) scale3d(1.02, 1.02, 1.02)`
  }

  return (
    <main className={'home page-shell ' + (blasted ? 'is-blasted' : '')}>
      <BlastParticles />
      <div className="home-copy">
        <button
          className="headline-trigger headline-stage"
          onClick={toggleBlast}
          aria-label={blasted ? 'Reconstruct headline' : 'Blast headline'}
        >
          <span className="blast-word blast-word-1 word-silence">Silence</span>{' '}
          <span className="blast-word blast-word-1 word-your">Your</span>
          <br />
          <span className="blast-word blast-word-2 word-parking">Parking</span>
          <span className="hero-asterisk">✱</span>
          <br />
          <span className="blast-word blast-word-3 word-chaos">Chaos</span>
        </button>

        <div className="headline-actions">
          <button className={'headline-pill' + (blasted ? '' : ' active')} onClick={toggleBlast}>
            Click to blast headline
          </button>
          <button className={'headline-pill' + (blasted ? ' active' : '')} onClick={toggleBlast}>
            Click again to restore
          </button>
        </div>

        <div className="network-banner">
          <div className="network-left">
            <span className="dot" /> ParkOpt.com — Live Network
          </div>
          <button className="network-button" onClick={() => setPage('explore')}>
            Cockpit →
          </button>
        </div>

        <p>
          Arrive without hesitation when spaces are held before departure. Silence the circling,
          bypass ticket gates with auto-lift telemetry, and park with ParkOpt — your frictionless
          urban bay concierge.
        </p>

        <div className="hero-actions">
          <button className="primary magnetic" onClick={() => setPage('explore')}>
            Reserve a Spot
          </button>
          <button className="icon-button" aria-label="Scroll down">
            ⌄
          </button>
          <button className="icon-button" aria-label="More actions">
            ⇣
          </button>
        </div>

        <small className="fineprint">* Zero credit card required for 15 min hold</small>
      </div>

      <div
        className="home-visual device-float-stage"
        onMouseMove={tiltPhone}
        onMouseLeave={(event) => {
          const phone = event.currentTarget.querySelector('.phone')
          if (phone) phone.style.transform = ''
        }}
      >
        <div className={'monument-backdrop ' + (blasted ? 'monument-visible' : '')}>PARKOPT</div>
        <div className="status-pill status-pill-top">
          <span className="status-dot" /> Auto-Gate Armed <strong>99.5%</strong>
        </div>
        <div className="status-pill status-pill-right">
          <span className="status-dot" /> Stall reserved <strong>Bay L2-04</strong>
        </div>

        <div className="phone device-tilt">
          <div className="phone-scan" />
          <div className="phone-notch" />
          <div className="phone-header">
            <span>02:59</span>
            <span className="signal">● ● ▰</span>
          </div>

          <div className="phone-copy">
            <small>Hey, Alex!</small>
            <strong>Welcome to Isham Deck</strong>
          </div>

          <h2>
            Ready for
            <br />
            another seamless
            <br />
            arrival?
          </h2>

          <div className="phone-pills">
            <span>Recent</span>
            <span>EV Rapid</span>
            <span>Covered</span>
          </div>

          <div className="phone-card primary-card">
            <small>Active Bay Hold</small>
            <strong>Isham Multilevel · L2-04</strong>
            <span className="lime">● Live Beacon</span>
            <small>14:29 hold remaining</small>
          </div>

          <div className="phone-card secondary-card">
            <strong>Memorial Garage</strong>
            <span>$2.50/hr</span>
          </div>
        </div>
      </div>
    </main>
  )
}

// ── Old desktop header (home page only) ─────────────────────────────────────
function HomeHeader({ onExplore }) {
  return (
    <header className="topbar-home">
      <div className="topbar-inner">
        <div className="eyebrow home-eyebrow">
          <span className="pulse" /> TEAM INNOVERSE
        </div>
        <button className="mini-brand" onClick={onExplore}>
          ParkOpt
        </button>
      </div>
    </header>
  )
}

// ── Root app ─────────────────────────────────────────────────────────────────
const PROTECTED_PAGES = ['bookings', 'profile']

export default function App() {
  const [page, setPage] = useState('home')
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  // Drill-down state
  const [selectedFacility, setSelectedFacility] = useState(null)
  const [searchParams, setSearchParams] = useState(null)
  const [confirmedBooking, setConfirmedBooking] = useState(null)

  // Auth state listener
  useEffect(() => {
    if (!supabaseConfigured) {
      setAuthLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  // Intercept nav to protected pages → bounce to auth
  const navigate = (dest) => {
    if (PROTECTED_PAGES.includes(dest) && !session) {
      setPage('auth')
      return
    }
    // Reset drill-down when navigating away
    if (!['facility', 'booking', 'pass'].includes(dest)) {
      setSelectedFacility(null)
      setSearchParams(null)
      setConfirmedBooking(null)
    }
    setPage(dest)
  }

  const handleAuth = (_user, sess) => {
    setSession(sess)
    setPage('explore')
  }

  const handleSelectFacility = (facility, params) => {
    setSelectedFacility(facility)
    setSearchParams(params)
    setPage('facility')
  }

  const handleBook = (facility, params) => {
    setSelectedFacility(facility)
    setSearchParams(params)
    setPage('booking')
  }

  const handleConfirmed = (bookingResult) => {
    setConfirmedBooking(bookingResult)
    setPage('pass')
  }

  const handleSignOut = () => {
    setSession(null)
    setPage('home')
  }

  // While checking auth, show minimal spinner
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#051424] flex items-center justify-center">
        <span className="w-8 h-8 border-2 border-[#c5f269]/30 border-t-[#c5f269] rounded-full animate-spin" />
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
const showBottomNav = !['home', 'auth', 'pass', 'facility', 'booking'].includes(page)
  return (
    <>
      {/* Home page keeps its original desktop header */}
      {page === 'home' && <HomeHeader onExplore={() => navigate('explore')} />}

      {/* Page content */}
      {page === 'home' && <Home setPage={navigate} />}

      {page === 'auth' && <AuthScreen onAuth={handleAuth} />}

      {page === 'explore' && (
        <SearchScreen
          session={session}
          onSelectFacility={handleSelectFacility}
        />
      )}

      {page === 'facility' && selectedFacility && (
        <FacilityScreen
          facility={selectedFacility}
          searchParams={searchParams}
          onBook={handleBook}
          onBack={() => setPage('explore')}
        />
      )}

      {page === 'booking' && selectedFacility && (
        <BookingScreen
          facility={selectedFacility}
          searchParams={searchParams}
          session={session}
          onConfirmed={handleConfirmed}
          onBack={() => setPage('facility')}
        />
      )}

      {page === 'pass' && confirmedBooking && (
        <PassScreen
          booking={confirmedBooking}
          onViewBookings={() => navigate('bookings')}
          onGoHome={() => navigate('home')}
        />
      )}

      {page === 'bookings' && (
        <MyBookingsScreen session={session} />
      )}

      {page === 'profile' && (
        <ProfileScreen session={session} onSignOut={handleSignOut} />
      )}

      {/* Auth gate message for un-authed direct nav */}
      {['bookings', 'profile'].includes(page) && !session && (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-surface gap-4">
          <span className="material-symbols-outlined text-[48px] text-text-muted">lock</span>
          <p className="text-[16px] text-text-muted">Sign in to access this page</p>
          <button
            onClick={() => setPage('auth')}
            className="px-6 py-3 rounded-full bg-[#c5f269] text-on-primary font-bold text-[14px]"
            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
          >
            Sign In
          </button>
        </div>
      )}

      {/* Bottom navigation (all app pages except home, auth, pass) */}
      {showBottomNav && (
        <BottomNav
          activePage={page}
          onNavigate={navigate}
        />
      )}
    </>
  )
}
