import { NavLink } from 'react-router-dom'

export const BottomNav = ({ unreadAlertsCount = 0 }) => {
  const navItems = [
    {
      id: 'home',
      label: 'Home',
      path: '/citizen',
      end: true,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
          />
        </svg>
      ),
    },
    {
      id: 'map',
      label: 'Map',
      path: '/citizen/map',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
          />
        </svg>
      ),
    },
    {
      id: 'alerts',
      label: 'Alerts',
      path: '/citizen/alerts',
      badge: Math.max(0, Number(unreadAlertsCount) || 0),
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
      ),
    },
    {
      id: 'profile',
      label: 'Profile',
      path: '/citizen/profile',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
      ),
    },
  ]

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-salvus-surface/95 border-t border-salvus-border backdrop-blur-lg px-2 py-2 safe-area-pb transition-colors"
    >
      <div className="flex items-center justify-around">
        {navItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            end={item.end}
            aria-label={
              item.badge > 0
                ? `${item.label} (${item.badge} unread active alert${item.badge === 1 ? '' : 's'})`
                : item.label
            }
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-all duration-150 relative min-w-[56px] min-h-[48px] ${
                isActive
                  ? 'text-salvus-text-primary font-bold'
                  : 'text-salvus-text-muted hover:text-salvus-text-secondary font-medium'
              }`
            }
          >
            <div className="relative">
              {item.icon}
              {item.badge > 0 && (
                <span
                  className="absolute -top-1 -right-1 h-3.5 min-w-3.5 px-0.5 rounded-full bg-salvus-critical text-[9px] font-bold text-white flex items-center justify-center"
                  aria-hidden="true"
                >
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </div>
            <span className="text-[11px] tracking-tight mt-1">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
