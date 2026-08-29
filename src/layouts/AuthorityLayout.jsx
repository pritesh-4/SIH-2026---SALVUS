import { Outlet, Link } from 'react-router-dom'
import { DevDemoControls } from '../components/common/DevDemoControls'
import { GlobalNotificationBanner } from '../components/common/GlobalNotificationBanner'
import { AuthorityThemeToggle } from '../components/ui'

export const AuthorityLayout = () => {
  return (
    <div className="min-h-screen bg-salvus-bg text-salvus-text-primary flex flex-col selection:bg-salvus-info selection:text-white transition-colors duration-200">
      {/* System Notifications */}
      <GlobalNotificationBanner />

      {/* Top High-Clarity Operations Header */}
      <header className="w-full border-b border-salvus-border bg-salvus-surface/95 backdrop-blur-md sticky top-0 z-50 transition-colors">
        <div className="max-w-[1760px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Brand & Sector Identity */}
          <div className="flex items-center gap-3">
            <Link to="/authority" className="flex items-center gap-2 group">
              <span className="text-salvus-text-primary font-bold text-base tracking-wide group-hover:text-salvus-info transition-colors">
                SALVUS
              </span>
              <span className="text-[10px] font-semibold bg-salvus-muted border border-salvus-border text-salvus-text-secondary px-2 py-0.5 rounded uppercase tracking-wide">
                Ops Command
              </span>
            </Link>

            <span className="hidden lg:inline text-salvus-text-muted">|</span>

            {/* Operational Grid Status */}
            <div className="hidden lg:flex items-center gap-2 text-xs text-salvus-text-secondary">
              <span className="inline-flex h-2 w-2 rounded-full bg-salvus-safe"></span>
              <span className="text-salvus-text-primary font-medium">Grid Online</span>
              <span className="text-salvus-text-muted">·</span>
              <span className="text-salvus-text-secondary text-[11px]">
                Central Operations Command Grid
              </span>
            </div>
          </div>

          {/* Center Situation Status Banner */}
          <div className="hidden md:flex items-center gap-2 bg-salvus-warning-bg border border-salvus-warning-border px-3 py-1 rounded-md text-xs text-salvus-warning-text">
            <span className="h-2 w-2 rounded-full bg-salvus-warning"></span>
            <span className="font-bold font-mono">LEVEL 3</span>
            <span className="opacity-50">·</span>
            <span className="font-medium">Flash Flood Surge in Progress</span>
          </div>

          {/* Right Action: Clock, Theme Switcher & Citizen Portal Switcher */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-salvus-text-secondary bg-salvus-surface-elevated border border-salvus-border px-2.5 py-1 rounded">
              <span className="text-salvus-text-muted">Sys:</span>
              <span className="text-salvus-text-primary font-medium font-mono">23:45 IST</span>
            </div>

            {/* Quiet Theme Toggle */}
            <AuthorityThemeToggle />

            <Link
              to="/citizen"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-salvus-surface-elevated hover:bg-salvus-surface-hover border border-salvus-border text-salvus-text-primary text-xs font-semibold transition-colors cursor-pointer tracking-wide"
              title="Switch to Citizen Safety Console"
            >
              <span className="text-xs">👤</span>
              <span className="hidden xs:inline">Citizen Portal</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Command Center Area */}
      <main className="flex-1 w-full max-w-[1760px] mx-auto p-3 sm:p-4 lg:p-5">
        <Outlet />
      </main>

      {/* Developer Demo & Resilience Panel */}
      <DevDemoControls />
    </div>
  )
}

export default AuthorityLayout
