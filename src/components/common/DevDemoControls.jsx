import { useState } from 'react'
import { seedDevIncidents, resetDevIncidents, createIncident } from '../../services/api'
import { simulateConnectionDrop } from '../../lib/realtime/socket'
import { getCurrentLocation } from '../../lib/location'

export const DevDemoControls = ({ onRefresh = null }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [statusMessage, setStatusMessage] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

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
    <aside
      aria-label="Developer Demo Panel"
      className="fixed bottom-4 right-4 z-50 font-sans animate-fadeIn"
    >
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="bg-[#0B1118]/95 hover:bg-[#152230] text-purple-300 hover:text-purple-200 border border-purple-500/40 px-3 py-1.5 rounded-full text-xs font-mono font-bold shadow-2xl backdrop-blur-md flex items-center gap-1.5 cursor-pointer transition-all hover:scale-105"
          title="Open Developer Demo & Resilience Controls"
        >
          <span>🛠️</span>
          <span>DEV DEMO CONTROLS</span>
        </button>
      ) : (
        <div className="bg-[#0D1520] border border-purple-500/50 rounded-2xl p-4 shadow-2xl w-80 backdrop-blur-md space-y-3 text-xs animate-fadeIn">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-t-0 border-b border-[#1A2634]">
            <div className="flex items-center gap-2">
              <span className="text-purple-400 font-bold">🛠️</span>
              <span className="font-mono font-bold text-white uppercase tracking-wider text-[11px]">
                Developer Resilience Suite
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white font-mono p-1 cursor-pointer"
            >
              ✕
            </button>
          </div>

          <p className="text-[10px] text-slate-400 font-mono leading-tight">
            Repeatable testing tools for live database, WebSocket sync, and network failure
            simulation.
          </p>

          {statusMessage && (
            <div className="bg-purple-950/60 border border-purple-500/40 p-2 rounded-xl text-[10px] font-mono text-purple-200 animate-fadeIn text-center">
              {statusMessage}
            </div>
          )}

          {/* Action Grid */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isLoading}
              onClick={handleSeed}
              className="p-2 rounded-xl bg-[#111A24] hover:bg-[#1A2838] border border-[#1E293B] hover:border-purple-500/50 text-purple-300 font-mono font-bold text-[10px] text-left transition-all cursor-pointer disabled:opacity-50"
            >
              ⚡ Seed Demo Data
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={handleReset}
              className="p-2 rounded-xl bg-[#111A24] hover:bg-[#1A2838] border border-[#1E293B] hover:border-purple-500/50 text-slate-300 hover:text-white font-mono font-bold text-[10px] text-left transition-all cursor-pointer disabled:opacity-50"
            >
              🗑️ Reset Database
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={handleSimulateSos}
              className="p-2 rounded-xl bg-rose-950/30 hover:bg-rose-950/50 border border-rose-500/40 text-rose-300 font-mono font-bold text-[10px] text-left transition-all cursor-pointer disabled:opacity-50"
            >
              🚨 Fire Live SOS
            </button>

            <button
              type="button"
              onClick={handleSimulateDisconnect}
              className="p-2 rounded-xl bg-amber-950/30 hover:bg-amber-950/50 border border-amber-500/40 text-amber-300 font-mono font-bold text-[10px] text-left transition-all cursor-pointer"
            >
              📶 Drop Socket (5s)
            </button>
          </div>

          <div className="pt-2 border-t border-[#1A2634] flex items-center justify-between text-[9px] font-mono text-slate-500">
            <span>SALVUS PHASE 3 HARDENING</span>
            <span>PORT 8000 / 5173</span>
          </div>
        </div>
      )}
    </aside>
  )
}
