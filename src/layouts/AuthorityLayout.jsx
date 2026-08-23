import { Outlet, Link } from 'react-router-dom'
import { DevDemoControls } from '../components/common/DevDemoControls'
import { GlobalNotificationBanner } from '../components/common/GlobalNotificationBanner'

export const AuthorityLayout = () => {
  return (
    <div className="min-h-screen bg-[#070D14] text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-black">
      {/* Calm System Notifications */}
      <GlobalNotificationBanner />

      {/* Top High-Density Command Bar */}
      <header className="w-full border-b border-[#1A2634] bg-[#0A121C]/95 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1720px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Brand & System Mode */}
          <div className="flex items-center gap-3">
            <Link to="/authority" className="flex items-center gap-2 group">
              <span className="text-white font-black text-lg tracking-wider group-hover:text-cyan-400 transition-colors">
                SALVUS
              </span>
              <span className="text-[10px] font-bold bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 px-2 py-0.5 rounded uppercase tracking-widest font-mono">
                COMMAND CENTER
              </span>
            </Link>

            <span className="hidden lg:inline text-[#1E293B]">|</span>

            {/* Operational Grid Status */}
            <div className="hidden lg:flex items-center gap-2 text-xs text-slate-300">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="font-mono text-emerald-400 font-bold">GRID ACTIVE</span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-400 font-mono text-[11px]">
                Kolkata Central Hub — Sector 12
              </span>
            </div>
          </div>

          {/* Center Alert Level Badge */}
          <div className="hidden md:flex items-center gap-2 bg-rose-950/40 border border-rose-500/40 px-3.5 py-1.5 rounded-full text-xs text-rose-300 font-mono font-bold">
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping"></span>
            <span>CRISIS LEVEL 3 · FLASH FLOOD SURGE IN PROGRESS</span>
          </div>

          {/* Right Action: Portal Switcher to Citizen */}
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline font-mono text-xs text-slate-400">23:45 IST</span>

            <Link
              to="/citizen"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#111A24] hover:bg-[#1A2634] border border-[#2A3B4E] text-cyan-300 hover:text-white text-xs font-bold transition-all shadow-md cursor-pointer tracking-wide uppercase"
              title="Switch to Citizen Safety Console"
            >
              <span>👤</span>
              <span className="hidden xs:inline">Citizen App</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Command Center Area */}
      <main className="flex-1 w-full max-w-[1720px] mx-auto p-4 sm:p-6">
        <Outlet />
      </main>

      {/* Developer Demo & Resilience Panel */}
      <DevDemoControls />
    </div>
  )
}

export default AuthorityLayout
