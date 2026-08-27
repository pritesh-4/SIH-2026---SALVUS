import { useState, useEffect } from 'react'
import { seedDevIncidents, resetDevIncidents, createIncident } from '../../services/api'
import { simulateConnectionDrop } from '../../lib/realtime/socket'
import { getCurrentLocation } from '../../lib/location'

export const DevDemoControls = ({ onRefresh = null }) => {
  const [isDemoMode, setIsDemoMode] = useState(() => {
    if (typeof window === 'undefined') return false
    const params = new URLSearchParams(window.location.search)
    return (
      params.get('demo') === 'true' ||
      params.get('dev') === 'true' ||
      localStorage.getItem('salvus_demo_mode') === 'true'
    )
  })

  const [isOpen, setIsOpen] = useState(false)
  const [statusMessage, setStatusMessage] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

  // Keyboard shortcut listener: Ctrl+Shift+D toggles demo mode
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault()
        setIsDemoMode((prev) => {
          const next = !prev
          if (next) {
            localStorage.setItem('salvus_demo_mode', 'true')
          } else {
            localStorage.removeItem('salvus_demo_mode')
          }
          window.dispatchEvent(new CustomEvent('salvus_demo_toggle', { detail: next }))
          return next
        })
      }
    }

    const handleSync = (e) => {
      if (e.detail !== undefined) {
        setIsDemoMode(e.detail)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('salvus_demo_toggle', handleSync)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('salvus_demo_toggle', handleSync)
    }
  }, [])

  // If not in demo mode, do not render developer controls in production UI
  if (!isDemoMode) {
    return null
  }

  const showFeedback = (msg) => {
    setStatusMessage(msg)
    setTimeout(() => setStatusMessage(null), 3500)
  }

  const handleSeed = async () => {
    setIsLoading(true)
    const result = await seedDevIncidents()
    setIsLoading(false)
    if (result.success) {
      showFeedback('✓ Seeded 4 demo incidents in Sector 12')
      if (onRefresh) onRefresh()
    } else {
      showFeedback('❌ Failed to seed incidents')
    }
  }

  const handleReset = async () => {
    setIsLoading(true)
    const result = await resetDevIncidents()
    setIsLoading(false)
    if (result.success) {
      showFeedback('✓ Reset database to clean initial state')
      if (onRefresh) onRefresh()
    } else {
      showFeedback('❌ Failed to reset database')
    }
  }

  const handleSimulateSos = async () => {
    setIsLoading(true)
    const loc = await getCurrentLocation()
    const result = await createIncident({
      type: 'flood',
      severity: 'CRITICAL',
      description: 'DEVELOPER TRIGGER: Surge flood testing on sector grid.',
      reporter_name: 'Dev Sim User',
      latitude: loc.latitude + (Math.random() - 0.5) * 0.01,
      longitude: loc.longitude + (Math.random() - 0.5) * 0.01,
      affected_count: 4,
      is_sos: true,
    })
    setIsLoading(false)
    if (result.success) {
      showFeedback(`✓ Live SOS Beacon Broadcasted: #${result.data.ticket_id}`)
      if (onRefresh) onRefresh()
    }
  }

  const handleSimulateDisconnect = () => {
    simulateConnectionDrop(5000)
    showFeedback('⚠️ Socket connection dropped for 5s (Simulating outage)')
  }

  return (
    <aside aria-label="Developer Demo Panel" className="fixed bottom-3 right-3 z-50 font-sans">
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="bg-[#080C12]/95 hover:bg-[#121B27] text-slate-400 hover:text-slate-200 border border-[#182332] px-2.5 py-1 rounded-md text-[11px] font-mono shadow-lg backdrop-blur-md flex items-center gap-1.5 cursor-pointer transition-colors"
          title="Open Developer Demo & Testing Controls (Ctrl+Shift+D)"
        >
          <span>⚙️</span>
          <span>DEV CONTROLS</span>
        </button>
      ) : (
        <div className="bg-[#080C12] border border-[#182332] rounded-xl p-3.5 shadow-2xl w-76 backdrop-blur-md space-y-2.5 text-xs animate-fadeIn">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-[#182332]">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">⚙️</span>
              <span className="font-mono font-semibold text-slate-200 uppercase tracking-wider text-[11px]">
                Developer Testing Suite
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white font-mono p-0.5 cursor-pointer text-xs"
            >
              ✕
            </button>
          </div>

          <p className="text-[10px] text-slate-400 font-mono leading-tight">
            Repeatable testing tools for database and network failure simulation. (Ctrl+Shift+D to
            hide)
          </p>

          {statusMessage && (
            <div className="bg-slate-800/90 border border-slate-700 p-2 rounded-lg text-[10px] font-mono text-slate-200 text-center">
              {statusMessage}
            </div>
          )}

          {/* Action Grid */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={isLoading}
              onClick={handleSeed}
              className="p-2 rounded-lg bg-[#0D141F] hover:bg-[#152030] border border-[#182332] text-slate-200 font-mono text-[10px] text-left transition-colors cursor-pointer disabled:opacity-50"
            >
              ⚡ Seed Demo Data
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={handleReset}
              className="p-2 rounded-lg bg-[#0D141F] hover:bg-[#152030] border border-[#182332] text-slate-200 font-mono text-[10px] text-left transition-colors cursor-pointer disabled:opacity-50"
            >
              🗑️ Reset Database
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={handleSimulateSos}
              className="p-2 rounded-lg bg-rose-950/30 hover:bg-rose-950/50 border border-rose-500/30 text-rose-300 font-mono text-[10px] text-left transition-colors cursor-pointer disabled:opacity-50"
            >
              🚨 Trigger SOS
            </button>

            <button
              type="button"
              onClick={handleSimulateDisconnect}
              className="p-2 rounded-lg bg-amber-950/30 hover:bg-amber-950/50 border border-amber-500/30 text-amber-300 font-mono text-[10px] text-left transition-colors cursor-pointer"
            >
              📶 Drop Socket (5s)
            </button>
          </div>

          <div className="pt-1.5 border-t border-[#182332] flex items-center justify-between text-[9px] font-mono text-slate-500">
            <span>SALVUS DEMO ENGINE</span>
            <span>DEMO MODE ACTIVE</span>
          </div>
        </div>
      )}
    </aside>
  )
}
