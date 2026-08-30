import { useState, useEffect } from 'react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { StatusIndicator } from '../ui/StatusIndicator'
import { useAuth } from '../../hooks/useAuth'

/**
 * Compact Operational Command Bar for Authority Command Center
 *
 * Keeps essential operational context in a single slim line:
 * - Hub / District identity
 * - System connection state & data provenance (LIVE / SIMULATED / PARTIAL / UNAVAILABLE)
 * - Authenticated Dispatcher identity & VHF Channel
 * - Live synchronized clock
 * - Explicit Demo Mode controls
 */
export const AuthorityHeader = ({
  hub,
  dataProvenance = 'LIVE',
  connectivityStatus = 'CONNECTED',
  onToggleDemoMode,
  onResetDemo,
}) => {
  const { user } = useAuth()
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

  const isReconnecting = connectivityStatus === 'RECONNECTING' || connectivityStatus === 'OFFLINE'
  const isDemo = dataProvenance === 'SIMULATED'

  const getProvenanceBadge = () => {
    if (isReconnecting) {
      return { variant: 'warning', label: 'RECONNECTING' }
    }
    switch (dataProvenance) {
      case 'LIVE':
        return { variant: 'safe', label: 'LIVE GRID' }
      case 'SIMULATED':
        return { variant: 'warning', label: 'SIMULATED SCENARIO' }
      case 'PARTIAL':
        return { variant: 'warning', label: 'PARTIAL FEEDS' }
      case 'UNAVAILABLE':
      default:
        return { variant: 'critical', label: 'FEED OFFLINE' }
    }
  }

  const prov = getProvenanceBadge()
  const dispatcherName = user?.name || hub.activeDispatcher || 'Duty Officer'

  return (
    <Card
      padding="sm"
      className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5 border-salvus-border bg-salvus-surface shadow-xs"
    >
      {/* Left: District & System State */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-salvus-critical animate-pulse" />
          <h1 className="text-xs sm:text-sm font-bold text-salvus-text-primary tracking-tight">
            {hub.name || 'Central Command Hub'} · Regional Operations
          </h1>
        </div>

        <div className="flex items-center gap-1.5">
          <StatusIndicator
            status={isReconnecting ? 'warning' : 'safe'}
            label={isReconnecting ? 'Reconnecting…' : 'Operational'}
            showDot={true}
            size="sm"
          />
          <Badge variant={prov.variant} isMono={true} size="sm">
            {prov.label}
          </Badge>
        </div>
      </div>

      {/* Right: Operational Details, Time & Demo Controls */}
      <div className="flex items-center gap-2 text-xs flex-wrap">
        {/* Dispatcher */}
        <div className="flex items-center gap-1 bg-salvus-muted/40 border border-salvus-border px-2 py-0.5 rounded-lg text-salvus-text-secondary">
          <span className="text-salvus-text-muted text-[11px]">Officer:</span>
          <strong className="text-salvus-text-primary font-medium">{dispatcherName}</strong>
        </div>

        {/* VHF */}
        <div className="flex items-center gap-1 bg-salvus-info-bg border border-salvus-info-border px-2 py-0.5 rounded-lg text-salvus-info font-bold text-[11px]">
          <span>VHF:</span>
          <span className="font-mono">{hub.radioChannel || 'Ch. 04'}</span>
        </div>

        {/* Live Clock */}
        <div className="flex items-center gap-1 bg-salvus-surface-elevated border border-salvus-border px-2 py-0.5 rounded-lg text-salvus-text-primary font-mono font-semibold text-[11px]">
          <span aria-hidden="true">⏱️</span>
          <span>{currentTime} IST</span>
        </div>

        {/* Explicit Demo Mode Actions */}
        {onToggleDemoMode && (
          <div className="flex items-center gap-1 pl-1 border-l border-salvus-border">
            <Button
              variant={isDemo ? 'secondary' : 'quiet'}
              size="sm"
              onClick={() => onToggleDemoMode(!isDemo)}
              className="text-[11px] py-0.5 px-2"
              title={isDemo ? 'Switch to Live Backend Data' : 'Enable Simulated Demo Scenario'}
            >
              {isDemo ? 'Exit Demo' : 'Simulate Demo'}
            </Button>
            {isDemo && onResetDemo && (
              <Button
                variant="quiet"
                size="sm"
                onClick={onResetDemo}
                className="text-[11px] py-0.5 px-2 text-salvus-warning hover:text-salvus-text-primary"
                title="Reset simulation database to initial state"
              >
                Reset
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

export default AuthorityHeader
