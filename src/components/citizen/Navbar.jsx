import { NavLink, Link } from 'react-router-dom'
import { CitizenThemeToggle } from '../ui'

export const Navbar = ({ unreadAlertsCount = 1 }) => {
  const navItems = [
    { id: 'home', label: 'Home', path: '/citizen', end: true },
    { id: 'map', label: 'Map', path: '/citizen/map' },
    { id: 'alerts', label: 'Alerts', path: '/citizen/alerts', badge: unreadAlertsCount },
    { id: 'profile', label: 'Profile', path: '/citizen/profile' },
  ]

  return (
    <header className="w-full border-b border-salvus-border bg-salvus-surface/90 backdrop-blur-md sticky top-0 z-50 transition-colors">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-12 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <Link to="/citizen" className="flex items-center gap-2 group">
          <span className="text-salvus-text-primary font-extrabold text-lg tracking-wider group-hover:text-salvus-info transition-colors">
            SALVUS
          </span>
          <span className="text-[11px] font-semibold text-salvus-text-muted tracking-widest uppercase">
            CITIZEN
          </span>
        </Link>

        {/* Center Nav Pills (Desktop) */}
        <nav className="hidden md:flex items-center bg-salvus-muted border border-salvus-border rounded-full p-1 shadow-inner">
          {navItems.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.end}
              className={({ isActive }) =>
                `px-5 py-1.5 rounded-full text-xs font-medium transition-all duration-150 flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-salvus-surface text-salvus-text-primary shadow-xs font-semibold'
                    : 'text-salvus-text-secondary hover:text-salvus-text-primary'
                }`
              }
            >
              <span>{item.label}</span>
              {item.badge > 0 && (
                <span className="h-4 min-w-4 px-1 rounded-full bg-salvus-critical text-[10px] font-bold text-white flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Right Section: Theme Toggle, Live Status & Authority Switcher */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 text-xs">
          {/* Theme Toggle for Citizens */}
          <CitizenThemeToggle />

          {/* Calm Live Indicator */}
          <div className="hidden sm:flex items-center gap-1.5 font-semibold text-salvus-safe">
            <span className="inline-flex h-2 w-2 rounded-full bg-salvus-safe"></span>
            <span className="text-[11px] tracking-wide">LIVE</span>
          </div>

          <Link
            to="/authority"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-salvus-surface hover:bg-salvus-surface-hover border border-salvus-border text-salvus-text-primary text-xs font-semibold transition-colors shadow-xs cursor-pointer"
            title="Open Authority Command Center"
          >
            <span>🛡️</span>
            <span className="hidden xs:inline">Authority Center</span>
          </Link>
        </div>
      </div>
    </header>
  )
}
