const NAV_ITEMS = [
  { id: 'home', icon: 'home', label: 'Home' },
  { id: 'explore', icon: 'explore', label: 'Explore' },
  { id: 'bookings', icon: 'confirmation_number', label: 'Bookings' },
  { id: 'profile', icon: 'person', label: 'Profile' },
]

export default function BottomNav({ activePage, onNavigate }) {
  return (
    <nav className="fixed bottom-0 w-full z-50 pointer-events-none">
      <div className="max-w-[420px] mx-auto px-4 pb-2">
        <div
          className="pointer-events-auto h-16 rounded-full px-2 flex items-center justify-around border border-white/10 shadow-lg"
          style={{
            background: 'rgba(16, 24, 40, 0.88)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
          }}
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activePage === item.id
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex-1 flex flex-col items-center justify-center h-12 transition-colors ${
                  isActive ? 'text-[#c5f269]' : 'text-[#c4c9b3] hover:text-[#F8FAFC]'
                }`}
              >
                <span
                  className="material-symbols-outlined text-[22px]"
                  style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {item.icon}
                </span>
                <span
                  className={`text-[11px] mt-0.5 ${isActive ? 'font-semibold' : ''}`}
                  style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                >
                  {item.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
