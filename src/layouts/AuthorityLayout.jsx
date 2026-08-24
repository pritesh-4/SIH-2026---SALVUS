import { Outlet, Link } from 'react-router-dom'
import { DevDemoControls } from '../components/common/DevDemoControls'
import { GlobalNotificationBanner } from '../components/common/GlobalNotificationBanner'

export const AuthorityLayout = () => {
  return (
    <div className="min-h-screen bg-[#080C12] text-slate-100 flex flex-col selection:bg-blue-600 selection:text-white">
      {/* System Notifications */}
      <GlobalNotificationBanner />

      {/* Top High-Clarity Operations Header */}
      <header className="w-full border-b border-[#1A2433] bg-[#0A1017]/95 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1760px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Brand & Sector Identity */}
          <div className="flex items-center gap-3">
            <Link to="/authority" className="flex items-center gap-2 group">
              <span className="text-white font-bold text-base tracking-wider group-hover:text-blue-400 transition-colors font-mono">
                SALVUS
              </span>
              <span className="text-[10px] font-semibold bg-slate-800 border border-slate-700 text-slate-300 px-2 py-0.5 rounded uppercase tracking-widest font-mono">
                OPS COMMAND
              </span>
            </Link>

            <span className="hidden lg:inline text-slate-700">|</span>

            {/* Operational Grid Status */}
            <div className="hidden lg:flex items-center gap-2 text-xs text-slate-400">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              <span className="font-mono text-slate-300 font-medium">GRID ONLINE</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400 font-mono text-[11px]">
                Kolkata Central Hub — Sector 12
              </span>
            </div>
          </div>

          {/* Center Situation Status Banner */}
          <div className="hidden md:flex items-center gap-2 bg-[#0E1520] border border-amber-500/30 px-3 py-1 rounded-md text-xs text-slate-200 font-mono">
            <span className="h-2 w-2 rounded-full bg-amber-400"></span>
            <span className="text-amber-400 font-bold">LEVEL 3</span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-300">FLASH FLOOD SURGE IN PROGRESS</span>
          </div>

          {/* Right Action: Clock & Citizen Portal Switcher */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 font-mono text-xs text-slate-400 bg-slate-900/60 border border-slate-800 px-2.5 py-1 rounded">
              <span className="text-slate-500">SYS:</span>
              <span className="text-slate-300 font-medium">23:45 IST</span>
            </div>

            <Link
              to="/citizen"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 hover:text-white text-xs font-semibold transition-colors cursor-pointer tracking-wide"
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
