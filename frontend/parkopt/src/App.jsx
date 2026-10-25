import { useState } from 'react'
import './App.css'
import DiscoveryMobile from './DiscoveryMobile'

function Header({ page, setPage }) {
  return <header className="topbar">
    <button className="brand" onClick={() => setPage('home')}><span className="brand-dot" />ParkOpt</button>
    <div className="telemetry"><span className="pulse" /> LIVE TELEMETRY · ACTIVE</div>
    <nav className="nav-tabs" aria-label="Primary navigation">
      {['discover', 'facility', 'booking'].map((item) => <button key={item} className={page === item ? 'active' : ''} onClick={() => setPage(item)}>{item === 'discover' ? 'Discovery Map' : item === 'facility' ? 'Facilities & Decks' : 'My Reservations'}</button>)}
      <button>EV Charging</button><button>Analytics</button>
    </nav>
    <button className="find-btn" onClick={() => setPage('discover')}>Find Bay <span>↗</span></button>
    <button className="avatar" aria-label="Profile">◯</button>
  </header>
}

function Footer() { return <footer><strong>ParkOpt</strong><span>Intelligent Spatial Urban Mobility Infrastructure</span><a>Terminal Grid</a><a>Security Protocols</a><a>Privacy Architecture</a><a>Telemetry API</a><small>© 2025 ParkOpt Spatial Systems. All rights reserved.</small></footer> }

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
      const angle = returning ? Math.random() * Math.PI * 2 : (Math.PI * 2 * index) / count + (Math.random() - 0.5) * 0.45
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
    const stage = event.currentTarget
    const phone = stage.querySelector('.phone')
    const rect = stage.getBoundingClientRect()
    const deltaX = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2)
    const deltaY = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2)
    phone.style.transform = `perspective(1200px) rotateX(${-deltaY * 12}deg) rotateY(${deltaX * 14}deg) scale3d(1.02, 1.02, 1.02)`
  }

  return <main className={'home page-shell ' + (blasted ? 'is-blasted' : '')}>
    <div className="ambient-glow" aria-hidden="true" /><div className="ambient-glow-secondary" aria-hidden="true" />
    <div className="hero-copy hero-reveal"><div className="eyebrow"><span className="pulse" /> AUTONOMOUS BAY ROUTING v3.4</div><button className="headline-trigger headline-stage" onClick={toggleBlast} aria-label={blasted ? 'Reconstruct headline' : 'Blast headline'}><span className="blast-word blast-word-1 word-silence">Silence</span> <span className="blast-word blast-word-1 word-your">Your</span><br /><span className="blast-word blast-word-2 word-parking">Parking</span><span className="hero-asterisk">✱</span><span className="blast-word blast-word-3 word-chaos">Chaos</span></button><span className="blast-hint hint-pill-pulse">{blasted ? 'Explosion active · click to collapse' : 'Click to blast headline'} <b>↯</b></span><p>Arrive without hesitation when spaces are held before departure. Silence the circling, bypass tight gates with auto-lift telemetry, and park with ParkOpt — your frictionless urban bay concierge.</p><div className="hero-actions"><button className="primary magnetic" onClick={() => setPage('discover')}>Reserve a Bay <span>→</span></button><button className="round">⌘</button><button className="round">↓</button></div><small>* Zero credit card required for 15-min hold</small></div>
    <div className="hero-visual hero-reveal device-float-stage" onMouseMove={tiltPhone} onMouseLeave={(event) => { event.currentTarget.querySelector('.phone').style.transform = '' }}><BlastParticles /><div className={'monument-backdrop ' + (blasted ? 'monument-visible' : '')}>PARKOPT</div><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="wordmark">PARKOPT</div><div className="glow-star">✦</div><div className="phone device-tilt"><div className="phone-scan" /><div className="phone-top">16:22 <span>● ● ▰</span></div><small>Hey, Alex!<br /><b>Welcome to Isham Deck</b></small><h2>Ready for<br />another seamless<br />arrival?</h2><div className="phone-pills"><span>Recent</span><span>EV Rapid</span><span>Covered</span></div><div className="phone-card"><small>Active Bay Hold</small><strong>Isham Multilevel · L2-04</strong><span className="lime">● Live Beacon</span><small>00:00 hold remaining</small></div><div className="phone-card dim"><strong>Memorial Garage</strong><span>$2.50/hr</span></div></div></div>
    <div className="download-pill hero-reveal"><span>☰</span><b>▰</b><button>Download</button></div><div className="hero-note hero-reveal">An elegant companion designed for effortless, distraction-free arrival.<br /><div className="store-icons">●　G　 <b>HOLD<br />00:00</b></div></div>
  </main>
}

function HeaderlessTitle({ title }) { return <div className="page-title"><div><span className="eyebrow">WEST HARTFORD CENTER　›　<span className="lime">ISHAM GARAGE & MOBILITY HUB</span></span><h1>{title === 'Discovery Map' ? 'Find your bay in the flow.' : 'Isham Multilevel Concourse'} <span className="tag">ACTIVE DECK 02</span></h1><p>⌖ 17 Isham Rd, West Hartford, CT 06107</p></div><div className="title-stats"><span>● 94/180 Bays Open</span><span>ϟ 6 DC Fast Stalls Idle</span></div></div> }

function Facility({ setPage }) { return <main className="facility-page page-shell"><HeaderlessTitle title="Facility"/><div className="deck-tabs"><span>Deck G · Street<br />Concourse</span><span>Level 1 · Covered<br />Express</span><b>Level 2 · EV<br />Ready　●</b><span>Roof Deck · Open Sky<br />Solar</span></div><div className="facility-layout"><section className="blueprint"><div className="blueprint-head"><div><h2>▱　Level 2 Spatial Blueprint <small>Zone β-North</small></h2><p>High-precision LIDAR stall occupancy telemetry · Refreshed 3s ago</p></div><span>● Occupied　<b className="lime">● Open　● Selected (L2-04)</b></span></div><div className="one-way">→ ONE WAY · SPEED LIMIT 5 MPH <span>▱ 7' 2” CLEARANCE RAMP</span></div><div className="bay-grid">{['L2-01','L2-02','L2-03','L2-04','L2-05','L2-06','L2-07','L2-08'].map((bay,i) => <div className={'bay '+(i===3?'selected ':'')+(i===0||i===1||i===5?'occupied':'')} key={bay}><span>{bay}</span><b>{i===3?'350kW DC FAST READY':i===0?'Cadillac Lyriq':i===1?'BMW i4 eDrive':i===7?'Reserved':'Open'}</b><strong>{i===3||i===2||i===4||i===6?'$3.50/h':''}</strong></div>)}</div><div className="blueprint-stats"><div>VERTICAL CLEARANCE<strong>7' 2” <small>(2.18m)</small></strong><b>SUVs & Racks Safe</b></div><div>EV SUPERCHARGERS<strong>8x 350 kW</strong><b>Dual CCS / NACS Port</b></div><div>SENSOR MATRIX<strong>Ultrasonic 4K</strong><b>Automated Space Log</b></div><div>RAMP STATUS<strong>Geothermal</strong><b>Heated Anti-Ice Active</b></div></div></section><aside className="reservation"><div className="eyebrow"><span className="pulse" /> SPATIAL BAY HOLD ACTIVE</div><small>DESIGNATED ALLOCATION</small><h2>L2-04</h2><p>Concourse Level 2 · Bay Section B · Direct Lift Access</p><div className="res-box"><strong>▣ Auto-Barrier Proximity　<span>4.0m Arm Trigger</span></strong><div className="progress"/></div><div className="res-box"><strong>◷ Today · 5:30 PM – 7:30 PM</strong><small>2 hours standard duration</small></div><div className="res-box">▣ Rivian R1S · Plate: 7AY-591</div><div className="totals"><span>Base Parking ($3.50 × 2 hrs) <b>$7.00</b></span><span>Zero Surge Guarantee <b>$0.00</b></span><span>State & Municipal Surcharge <b>$0.45</b></span><hr/><strong>Total Due <b>$7.45</b></strong></div><button className="primary full" onClick={() => setPage('booking')}>Lock Bay & Issue Gate Pass →</button><small>◷ Free cancellation up to 10 minutes prior to arrival</small></aside></div></main> }

function Booking({ setPage }) { return <main className="booking-page page-shell"><div className="eyebrow">ϟ AUTONOMOUS BAY L2-04</div><h1>Confirm Your <em>Arrival Gate.</em></h1><p className="lead">Direct sensor link established with Isham Multi-Tier Deck. Gate barriers synchronize automatically via encrypted short-range telemetry.</p><div className="booking-layout"><section><div className="step-card"><h2><span>1</span> Vehicle Profile & Dimension Clearance</h2><div className="vehicle"><b>▣　Porsche Taycan 4S</b><span className="tag">Primary</span><small>7BAY-CT · Volcano Grey Metallic</small><i>● Clearance: 5'2” vs 7'2” Deck</i></div><div className="vehicle"><b>ϟ　Ultra-Fast EV Supercharging　<span className="tag">350 kW DC</span></b><small>Pre-cool cable bay and auto-initiate speed-charging session upon tire placement.</small><button className="toggle">ϟ</button></div></div><div className="step-card"><h2><span>2</span> Touchless Gate Access Protocol</h2><div className="protocols"><div className="protocol selected"><b>▣<br />BLE Auto-Lift</b><small>Zero stop needed. Barrier raises 12 meters ahead using proximity.</small><strong>✦ Recommended</strong></div><div className="protocol"><b>◉<br />Wallet NFC Tap</b><small>Hold iPhone or Apple Watch near the pedestal terminal scanner.</small></div><div className="protocol"><b>▧<br />Backup QR Pass</b><small>Offline optical scanner fallback for any low-battery situation.</small></div></div></div><div className="step-card"><h2><span>3</span> Encrypted Payment Gateway</h2><div className="payment">Pay　 Apple Pay (Express Transit Mode) <b>◉</b></div><div className="payment">▣　 Amex Platinum · 9021 <b>◯</b></div><small>ⓘ Free cancellation up to 5 minutes after scheduled entry time.</small></div></section><aside className="pass-card"><div className="eyebrow">● BAY L2-04 TELEMETRY</div><div className="qr">▦</div><strong className="lime">⌁ BLE PROXIMITY RADAR ACTIVE</strong><p>⌛ Reserved hold expires in: <b>14:33</b></p><div className="pass-location">↗　Isham Level 2 North Deck<br /><small>Optimal Route via Franklin ...</small></div><div className="totals"><span>Reserved Space (2 Hours Guaranteed) <b>$6.00</b></span><span>Dynamic Spatial Allocation Fee <b>$0.85</b></span><span>BLE Touchless Gate Service <b className="lime">FREE</b></span><span>Local Municipal Transit Tax <b>$0.60</b></span><strong>Total Due <b>$7.45</b></strong></div><button className="primary full" onClick={() => setPage('guidance')}>One-Click Instant Pass →</button><small>Protected by encrypted hardware key.</small></aside></div></main> }

function Guidance() { return <main className="guidance page-shell"><div className="guidance-head"><button className="avatar">←</button><div><h1>Active Guidance Session</h1><p>ParkOpt Terminal</p></div><button className="avatar">♙</button></div><div className="guidance-banner"><strong><span className="pulse" /> HUD GUIDANCE LIVE</strong><span>ϟ V2X ULTRA-LINK</span><h2>Isham Garage <b>3 <small>MIN</small></b></h2><p>Deck Level 2 · Bay L2-04　　0.4 MI REMAINING</p></div><div className="turn"><b>↗　IN 350 FT</b>　· Gate 2 Priority Lane<h2>Turn right onto Isham Rd · Enter ...</h2></div><div className="radar"><div><b>♢ -52 dBm</b><b className="lime">♢ ENCRYPTED TOKEN</b></div><div className="radar-ring"><strong>▣</strong><b>14m</b><small>GATE PROXIMITY</small></div><div className="armed">● AUTO-LIFT ARMED · APPROACHING</div><p>♧ Tap to simulate vehicle approach</p></div><div className="guidance-grid"><div><small>LEVEL 2 SLOT <b className="tag">RESERVED</b></small><h2>Bay L2-04</h2><p>Direct ramp access · Pillar C</p></div><div><h2>▣</h2><b>Send to CarPlay</b><p>Push cockpit telemetry</p></div><div><b>EV Prep Active ●</b><p>Pre-cooling socket · Grace ...</p></div></div></main> }

export default function App() { const [page, setPage] = useState('home'); return <><Header page={page} setPage={setPage}/>{page === 'home' && <Home setPage={setPage}/>} {page === 'discover' && <DiscoveryMobile setPage={setPage}/>} {page === 'facility' && <Facility setPage={setPage}/>} {page === 'booking' && <Booking setPage={setPage}/>} {page === 'guidance' && <Guidance/>}{page !== 'home' && page !== 'guidance' && <Footer/>}</> }
