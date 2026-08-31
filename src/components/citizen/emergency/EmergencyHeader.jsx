import { Badge } from '../../ui/Badge'
import { StatusIndicator } from '../../ui/StatusIndicator'
import { Button } from '../../ui/Button'

/**
 * Reassuring, Focused Emergency Header
 */
export const EmergencyHeader = ({
  incidentId = null,
  phaseLabel = 'Help Request Active',
  badgeColor = 'rose',
  onCancelClick,
}) => {
  const mapStatus = (color) => {
    if (color === 'emerald') return 'safe'
    if (color === 'amber') return 'warning'
    if (color === 'blue' || color === 'sky') return 'info'
    return 'critical'
  }

  return (
    <header className="w-full border-b border-salvus-border bg-salvus-surface/95 backdrop-blur-md sticky top-0 z-40 transition-colors">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand & Mode Indicator */}
        <div className="flex items-center gap-3">
          <span className="text-salvus-text-primary font-extrabold text-lg tracking-wider">
            SALVUS
          </span>
          <StatusIndicator
            status={mapStatus(badgeColor)}
            label={phaseLabel || 'Help Request Active'}
            showDot={true}
            showIcon={true}
          />
        </div>

        {/* Incident ID & Direct Call Action */}
        <div className="flex items-center gap-2 sm:gap-3">
          {incidentId && (
            <Badge variant="neutral" isMono={true} className="hidden sm:inline-flex">
              INCIDENT #{incidentId}
            </Badge>
          )}

          <a
            href="tel:112"
            className="inline-flex items-center gap-1.5 bg-salvus-critical text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shadow-xs min-h-[36px]"
            title="Dial national emergency services"
          >
            <span aria-hidden="true">📞</span>
            <span>Call 112</span>
          </a>

          {onCancelClick && (
            <Button
              variant="quiet"
              size="sm"
              onClick={onCancelClick}
              className="text-salvus-text-muted hover:text-salvus-critical"
            >
              Cancel SOS
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
