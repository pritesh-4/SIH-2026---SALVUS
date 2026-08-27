import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { StatusIndicator } from '../ui/StatusIndicator'

/**
 * Clean Top Operational Header for Authority Command Center
 * Part 4: Answers "Is the system operational? What is happening?"
 */
export const AuthorityHeader = ({ hub, dataProvenance = 'LIVE' }) => {
  if (!hub) return null

  return (
    <Card
      padding="sm"
      className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
    >
      <div className="flex items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold text-salvus-text-primary tracking-tight">
              {hub.name || 'Central Command Hub'} · Sector 12 District
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

      <div className="flex items-center gap-2.5 text-xs">
        <div className="flex items-center gap-1.5 bg-salvus-muted/40 border border-salvus-border px-2.5 py-1 rounded-lg text-salvus-text-secondary">
          <span className="text-salvus-text-muted">Dispatcher:</span>
          <strong className="text-salvus-text-primary">
            {hub.activeDispatcher || 'Capt. Sharma'}
          </strong>
        </div>

        <div className="flex items-center gap-1.5 bg-salvus-info-bg border border-salvus-info-border px-2.5 py-1 rounded-lg text-salvus-info font-bold">
          <span>VHF:</span>
          <span>{hub.radioChannel || 'Ch. 04'}</span>
        </div>
      </div>
    </Card>
  )
}

export default AuthorityHeader
