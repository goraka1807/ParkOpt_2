import { useState } from 'react'

const bays = [
  { id: 'isham', name: 'Isham Garage', price: '$3.50', open: 42, walk: '2 min', address: '17 Isham Rd · Core Town Center' },
  { id: 'memorial', name: 'Memorial Garage', price: '$2.80', open: 14, walk: '4 min', address: '11 South Main St · South Plaza' },
  { id: 'brace', name: 'Brace Road Surface Lot', price: '$2.00', open: 58, walk: '5 min', address: 'Brace Rd & Farmington Ave' },
]

function ParkingMap({ selected, onSelect, location }) {
  return <section className="discovery-map" aria-label="Live parking map">
    <div className="discovery-map-grid" aria-hidden="true">
      <span className="map-road map-road-a" /><span className="map-road map-road-b" /><span className="map-road map-road-c" />
      <span className="map-block map-block-a" /><span className="map-block map-block-b" /><span className="map-block map-block-c" /><span className="map-block map-block-d" /><span className="map-block map-block-e" />
      <span className="map-route-line" />
    </div>
    <div className="discovery-map-top"><span className="live-dot" /> LIVE AVAILABILITY <small>Updated just now</small></div>
    <div className="map-location">⌖ {location}</div>
    {bays.map((bay, index) => <button key={bay.id} className={`discovery-pin pin-${index + 1} ${selected.id === bay.id ? 'is-selected' : ''}`} onClick={() => onSelect(bay)} aria-label={`Select ${bay.name}`}><strong>{bay.price}</strong><small>{bay.open} OPEN</small></button>)}
    <div className="map-actions"><button aria-label="Recenter map">⊙</button><button aria-label="Zoom in">＋</button><button aria-label="Zoom out">−</button></div>
    <div className="map-scale">500 ft</div>
  </section>
}

function BayCard({ bay, selected, onSelect }) {
  return <article className={`discovery-bay-card ${selected ? 'is-selected' : ''}`} onClick={() => onSelect(bay)}>
    <div className="bay-card-head"><div><span className="bay-status"><i /> {bay.open > 40 ? 'BEST MATCH' : 'AVAILABLE'}</span><h2>{bay.name}</h2><p>⌖ {bay.address}</p></div><strong>{bay.price}<small>/hr</small></strong></div>
    <div className="bay-card-meta"><span><b>{bay.open}</b> open bays</span><span><b>{bay.walk}</b> walk</span><span><b>7&apos; 2&quot;</b> clearance</span></div>
    <button className="bay-card-action">{selected ? 'Selected · View details' : 'Select this bay'} <span>→</span></button>
  </article>
}

export default function DiscoveryMobile({ setPage, onHold }) {
  const [location, setLocation] = useState('West Hartford Center, CT')
  const [selected, setSelected] = useState(bays[0])
  const [sheetOpen, setSheetOpen] = useState(true)
  const choose = (bay) => setSelected(bay)
  return <main className="discovery-rebuild page-shell">
    <div className="discovery-search"><span>⌕</span><input aria-label="Search parking location" value={location} onChange={(event) => setLocation(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} /><button aria-label="Use current location">◎</button></div>
    <ParkingMap selected={selected} onSelect={choose} location={location} />
    <section className={`discovery-sheet ${sheetOpen ? 'is-open' : 'is-collapsed'}`}>
      <button className="discovery-sheet-toggle" onClick={() => setSheetOpen((open) => !open)} aria-expanded={sheetOpen}><i /><span><b>{sheetOpen ? 'Nearby parking' : '3 nearby options'}</b><small>{sheetOpen ? 'Best options for your arrival' : 'Tap to expand results'}</small></span><strong>{sheetOpen ? '⌄' : '⌃'}</strong></button>
      <div className="discovery-sheet-tools"><b><span className="live-dot" /> 3 OPTIONS NEARBY</b><button>Sort: <strong>Best match</strong> ↕</button></div>
      <div className="discovery-bays">{bays.map((bay) => <BayCard key={bay.id} bay={bay} selected={selected.id === bay.id} onSelect={choose} />)}</div>
    </section>
    <div className="discovery-hold"><div><span>READY TO HOLD</span><strong>{selected.name}</strong></div><b>{selected.price}<small>/hr</small></b><button onClick={() => { onHold?.(selected); setPage('facility') }}>Continue <span>→</span></button></div>
  </main>
}
