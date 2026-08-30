import { useState, useEffect } from 'react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { StatusIndicator } from '../ui/StatusIndicator'
import { useAuth } from '../../hooks/useAuth'

/**
 * Operational Command Bar for Authority Command Center
 *
 * Displays truthful operational context derived from live data:
 * - System identity (generic — no hardcoded city)
 * - Connectivity & per-domain data provenance (LIVE / SIMULATED / PARTIAL / UNAVAILABLE)
 * - Authenticated Dispatcher identity
 * - Live synchronized clock
 * - Operational summary counters from real data
 * - Explicit Demo Mode controls with prominent SIMULATION banner
 */
export const AuthorityHeader = ({
  dataProvenance = 'LIVE',
  connectivityStatus = 'CONNECTED',
  domainProvenance = null,
  computedMetrics = null,
  totalResponders = 0,
  totalBeds = 0,
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

  const isReconnecting = connectivityStatus === 'RECONNECTING' || connectivityStatus === 'OFFLINE'
  const isDemo = dataProvenance === 'SIMULATED'

  const getProvenanceBadge = () => {
    if (isReconnecting) {
      return { variant: 'warning', label: 'RECONNECTING' }
    }
    switch (dataProvenance) {
      case 'LIVE':
        return { variant: 'safe', label: 'LIVE' }
      case 'SIMULATED':
        return { variant: 'warning', label: 'SIMULATION MODE' }
      case 'PARTIAL':
        return { variant: 'warning', label: 'PARTIAL FEEDS' }
      case 'STALE':
        return { variant: 'warning', label: 'STALE' }
      case 'UNAVAILABLE':
      default:
        return { variant: 'critical', label: 'FEEDS OFFLINE' }
    }
  }

  const prov = getProvenanceBadge()
  const dispatcherName = user?.name || 'Duty Officer'

  // Derive operational summary from real metrics
  const activeCount = computedMetrics?.active ?? 0
  const criticalCount = computedMetrics?.critical ?? 0

  return (
    <>
      {/* Prominent Simulation Banner */}
      {isDemo && (
        <div className="bg-salvus-warning/15 border-2 border-salvus-warning px-4 py-2 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-salvus-warning animate-pulse">
          <span aria-hidden="true">⚠️</span>
          <span>
            SIMULATION MODE — All displayed data is demo/simulated. Not live operational data.
          </span>
          <span aria-hidden="true">⚠️</span>
        </div>
      )}

      <Card
        padding="sm"
        className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5 border-salvus-border bg-salvus-surface shadow-xs"
      >
        {/* Left: System Identity & State */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full ${isReconnecting ? 'bg-salvus-warning' : 'bg-salvus-safe'} animate-pulse`}
            />
            <h1 className="text-xs sm:text-sm font-bold text-salvus-text-primary tracking-tight">
              SALVUS COMMAND CENTER
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

          {/* Compact operational counters from real data */}
          {computedMetrics && !isReconnecting && (
            <div className="flex items-center gap-1.5 text-[11px] font-mono">
              <span className="bg-salvus-muted/40 border border-salvus-border px-1.5 py-0.5 rounded text-salvus-text-primary font-semibold">
                {activeCount} Active
              </span>
              {criticalCount > 0 && (
                <span className="bg-salvus-critical-bg border border-salvus-critical-border px-1.5 py-0.5 rounded text-salvus-critical font-bold">
                  {criticalCount} Critical
                </span>
              )}
              <span className="bg-salvus-muted/40 border border-salvus-border px-1.5 py-0.5 rounded text-salvus-text-secondary">
                {totalResponders} Units
              </span>
              <span className="bg-salvus-muted/40 border border-salvus-border px-1.5 py-0.5 rounded text-salvus-text-secondary">
                {totalBeds} Beds
              </span>
            </div>
          )}
        </div>

        {/* Right: Dispatcher, Domain Status, Time & Demo Controls */}
        <div className="flex items-center gap-2 text-xs flex-wrap">
          {/* Dispatcher */}
          <div className="flex items-center gap-1 bg-salvus-muted/40 border border-salvus-border px-2 py-0.5 rounded-lg text-salvus-text-secondary">
            <span className="text-salvus-text-muted text-[11px]">Officer:</span>
            <strong className="text-salvus-text-primary font-medium">{dispatcherName}</strong>
          </div>

          {/* Per-Domain Provenance (when not all LIVE) */}
          {domainProvenance && !isDemo && (
            <div className="flex items-center gap-1 text-[10px] font-mono">
              {Object.entries(domainProvenance).map(([domain, mode]) => {
                if (mode === 'LIVE') return null
                const variant = mode === 'UNAVAILABLE' ? 'critical' : 'warning'
                return (
                  <Badge key={domain} variant={variant} size="sm">
                    {domain}: {mode}
                  </Badge>
                )
              })}
            </div>
          )}

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
    </>
  )
}

export default AuthorityHeader
