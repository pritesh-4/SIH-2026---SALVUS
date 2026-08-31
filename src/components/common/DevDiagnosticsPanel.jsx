import { useState, useEffect } from 'react'
import {
  Activity,
  WifiOff,
  Radio,
  Server,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Cpu,
  Clock,
} from 'lucide-react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { getSocketState, simulateConnectionDrop } from '../../lib/realtime/socket'
import { formatRelativeFreshness } from '../../lib/freshness'

/**
 * DevDiagnosticsPanel — Development & Hackathon Demo System Diagnostics Panel
 *
 * Exposes live underlying telemetry for hackathon judges and developers:
 * - Realtime Socket.IO Connection Health & Active Rooms
 * - Backend API Probe Status & Subsystem Health
 * - Active Incident Correlation & Data Freshness
 * - Non-destructive Connection Drop & Resync Simulation controls
 *
 * NOTE: Rendered exclusively in development/demo mode; never exposed to ordinary citizens in production.
 */
export const DevDiagnosticsPanel = ({
  incidentId = null,
  ticketId = null,
  aiProvenance = null,
  lastSyncedAt = null,
  onForceResync = null,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [socketState, setSocketState] = useState(() => getSocketState())
  const [apiHealth, setApiHealth] = useState(null)
  const [isCheckingHealth, setIsCheckingHealth] = useState(false)

  // Poll socket state & backend health every 4s when panel is expanded
  useEffect(() => {
    if (!isOpen) return

    const checkHealth = async () => {
      setIsCheckingHealth(true)
      try {
        const res = await fetch('/api/health')
        const data = await res.json()
        setApiHealth(data)
      } catch (err) {
        setApiHealth({ status: 'unreachable', error: err.message })
      } finally {
        setIsCheckingHealth(false)
      }
      setSocketState(getSocketState())
    }

    checkHealth()
    const interval = setInterval(checkHealth, 4000)
    return () => clearInterval(interval)
  }, [isOpen])

  return (
    <div className="fixed bottom-3 right-3 z-40 max-w-sm w-full transition-all">
      <Card
        padding="sm"
        className="bg-salvus-surface/95 backdrop-blur-md border-salvus-border shadow-xl text-xs space-y-2"
      >
        {/* Header Strip */}
        <div
          className="flex items-center justify-between cursor-pointer select-none"
          onClick={() => setIsOpen(!isOpen)}
        >
          <div className="flex items-center gap-1.5 font-bold text-salvus-text-primary">
            <Activity className="h-3.5 w-3.5 text-salvus-info" />
            <span className="uppercase tracking-wider text-[11px]">System Observability</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Badge variant={socketState.connected ? 'safe' : 'warning'} size="sm" dot={true}>
              {socketState.connected ? 'Realtime Live' : 'Reconnecting'}
            </Badge>
            <button
              type="button"
              className="text-salvus-text-muted hover:text-salvus-text-primary p-0.5"
              aria-label={isOpen ? 'Collapse panel' : 'Expand panel'}
            >
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Expanded Diagnostics Drawer */}
        {isOpen && (
          <div className="pt-2 border-t border-salvus-border space-y-2.5 animate-fadeIn">
            {/* Realtime Socket Diagnostics */}
            <div className="bg-salvus-muted/40 p-2 rounded-lg border border-salvus-border space-y-1">
              <div className="flex items-center justify-between text-[10px] font-bold text-salvus-text-muted uppercase">
                <span className="flex items-center gap-1">
                  <Radio className="h-3 w-3" />
                  <span>Realtime Socket.IO</span>
                </span>
                <span
                  className={socketState.connected ? 'text-salvus-safe' : 'text-salvus-warning'}
                >
                  {socketState.connected ? 'CONNECTED' : 'DEGRADED'}
                </span>
              </div>
              <div className="text-[11px] text-salvus-text-secondary font-mono space-y-0.5">
                <div>Socket ID: {socketState.id || 'Not connected'}</div>
                <div>
                  Rooms:{' '}
                  {socketState.activeRooms.length > 0 ? socketState.activeRooms.join(', ') : 'None'}
                </div>
              </div>
            </div>

            {/* Backend API Health Probe */}
            <div className="bg-salvus-muted/40 p-2 rounded-lg border border-salvus-border space-y-1">
              <div className="flex items-center justify-between text-[10px] font-bold text-salvus-text-muted uppercase">
                <span className="flex items-center gap-1">
                  <Server className="h-3 w-3" />
                  <span>Backend Health Probe</span>
                </span>
                <span
                  className={
                    apiHealth?.status === 'healthy' ? 'text-salvus-safe' : 'text-salvus-warning'
                  }
                >
                  {apiHealth?.status?.toUpperCase() || 'PROBING...'}
                </span>
              </div>
              <div className="text-[11px] text-salvus-text-secondary font-mono space-y-0.5">
                <div>DB: {apiHealth?.components?.database || 'checking...'}</div>
                <div>AI Waterfall: {apiHealth?.components?.ai_waterfall || 'ready'}</div>
                <div>Realtime Hub: {apiHealth?.components?.realtime_hub || 'active'}</div>
              </div>
            </div>

            {/* Active Incident Context & Provenance */}
            {(incidentId || ticketId || aiProvenance || lastSyncedAt) && (
              <div className="bg-salvus-muted/40 p-2 rounded-lg border border-salvus-border space-y-1">
                <div className="flex items-center justify-between text-[10px] font-bold text-salvus-text-muted uppercase">
                  <span className="flex items-center gap-1">
                    <Cpu className="h-3 w-3" />
                    <span>Active Incident & AI Context</span>
                  </span>
                </div>
                <div className="text-[11px] text-salvus-text-secondary font-mono space-y-0.5">
                  {ticketId && <div>Ticket: #{ticketId}</div>}
                  {aiProvenance && <div>Provenance: {aiProvenance}</div>}
                  {lastSyncedAt && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      <span>{formatRelativeFreshness(lastSyncedAt, 'Last sync:')}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Simulation Controls for Demo / Resilience Validation */}
            <div className="pt-1 flex items-center justify-between gap-1.5">
              <Button
                variant="quiet"
                size="sm"
                onClick={() => simulateConnectionDrop(4000)}
                leftIcon={<WifiOff className="h-3 w-3 text-salvus-warning" />}
                className="text-[10px] px-2 py-1"
                title="Disconnect socket for 4 seconds to test auto-reconnect"
              >
                Drop Conn (4s)
              </Button>

              {onForceResync && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onForceResync}
                  loading={isCheckingHealth}
                  leftIcon={<RefreshCw className="h-3 w-3" />}
                  className="text-[10px] px-2 py-1"
                >
                  Force Resync
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

export default DevDiagnosticsPanel
