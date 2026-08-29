import { useState, useEffect } from 'react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { StatusIndicator } from '../ui/StatusIndicator'

/**
 * Clean Top Operational Header for Authority Command Center (Master Prompt 3 - Step 3)
 *
 * Keeps essential context:
 * - System operational state
 * - District / Hub identity
 * - Active Dispatcher & VHF Channel
 * - Live operational time
 */
export const AuthorityHeader = ({ hub, dataProvenance = 'LIVE' }) => {
  const [currentTime, setCurrentTime] = useState(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  )

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      )
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  if (!hub) return null

  return (
    <Card
      padding="sm"
      className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-salvus-border bg-salvus-surface shadow-xs"
    >
      {/* Left: District & System State */}
      <div className="flex items-center gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-sm font-bold text-salvus-text-primary tracking-tight">
              {hub.name || 'Central Command Hub'} · Regional Operations District
            </h1>
            <StatusIndicator status="safe" label="System Operational" showDot={true} size="sm" />
            <Badge variant="neutral" isMono={true} size="sm">
              {dataProvenance}
            </Badge>
          </div>
          <p className="text-xs text-salvus-text-secondary mt-0.5">
            Emergency Operations & Rapid Dispatch Console
          </p>
        </div>
      </div>

      {/* Right: Operational Details & Time */}
      <div className="flex items-center gap-2.5 text-xs flex-wrap">
        <div className="flex items-center gap-1.5 bg-salvus-muted/40 border border-salvus-border px-2.5 py-1 rounded-lg text-salvus-text-secondary">
          <span className="text-salvus-text-muted">Dispatcher:</span>
          <strong className="text-salvus-text-primary font-medium">
            {hub.activeDispatcher || 'Capt. Sharma'}
          </strong>
        </div>

        <div className="flex items-center gap-1.5 bg-salvus-info-bg border border-salvus-info-border px-2.5 py-1 rounded-lg text-salvus-info font-bold">
          <span>VHF:</span>
          <span className="font-mono">{hub.radioChannel || 'Ch. 04'}</span>
        </div>

        <div className="flex items-center gap-1.5 bg-salvus-surface-elevated border border-salvus-border px-2.5 py-1 rounded-lg text-salvus-text-primary font-mono font-semibold">
          <span aria-hidden="true">⏱️</span>
          <span>{currentTime} IST</span>
        </div>
      </div>
    </Card>
  )
}

export default AuthorityHeader
