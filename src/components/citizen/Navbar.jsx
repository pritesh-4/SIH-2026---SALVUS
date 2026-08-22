import { NavLink, Link } from 'react-router-dom'

export const Navbar = ({ unreadAlertsCount = 1 }) => {
  const navItems = [
    { id: 'home', label: 'Home', path: '/citizen', end: true },
    { id: 'map', label: 'Map', path: '/citizen/map' },
    { id: 'alerts', label: 'Alerts', path: '/citizen/alerts', badge: unreadAlertsCount },
    { id: 'profile', label: 'Profile', path: '/citizen/profile' },
  ]

  return (
    <header className="w-full border-b border-[#1E293B] bg-[#0B1118]/90 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-12 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link to="/citizen" className="flex items-center gap-2 group">
          <span className="text-white font-black text-lg tracking-wider group-hover:text-cyan-400 transition-colors">
            SALVUS
          </span>
          <span className="text-[11px] font-semibold text-slate-400 tracking-widest uppercase">
            CITIZEN
          </span>
        </Link>

        {/* Center Nav Pills (Desktop) */}
        <nav className="hidden md:flex items-center bg-[#111A24] border border-[#1E293B] rounded-full p-1 shadow-inner">
          {navItems.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.end}
              className={({ isActive }) =>
                `px-5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-[#1E293B] text-white shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`
              }
            >
              <span>{item.label}</span>
              {item.badge > 0 && (
                <span className="h-4 min-w-4 px-1 rounded-full bg-rose-500 text-[10px] font-bold text-white flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Live Status & Time */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2 font-semibold tracking-wider text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>LIVE</span>
          </div>
          <span className="text-slate-400 font-medium">14:42 IST</span>
        </div>
      </div>
    </header>
  )
}
