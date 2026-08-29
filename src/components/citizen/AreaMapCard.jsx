import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'

/**
 * Area Overview Map Card (Master Prompt 2 - Step 7)
 *
 * Visual orientation: YOU, SAFE PLACES, HAZARD ALERTS.
 * Plain language, no raw coordinates as primary text.
 */
export const AreaMapCard = ({
  badgeText = 'AREA MAP',
  location = 'Local Area Overview',
  userLocation = null,
  legend = [
    { label: 'You', colorClass: 'bg-salvus-info' },
    { label: 'Safe Place', colorClass: 'bg-salvus-safe' },
    { label: 'Hazard', colorClass: 'bg-salvus-critical' },
  ],
}) => {
  const isLandmark = userLocation?.source === 'LANDMARK' || userLocation?.isFallback
  const isBrowserGps = userLocation?.source === 'BROWSER'

  return (
    <Card
      padding="md"
      className="transition-all hover:border-salvus-border-strong focus-within:ring-2 focus-within:ring-salvus-info"
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Badge variant={isBrowserGps ? 'safe' : isLandmark ? 'warning' : 'neutral'} dot={true}>
              {badgeText}
            </Badge>
          </div>
          <h2 className="text-sm sm:text-base font-bold text-salvus-text-primary truncate max-w-[280px]">
            {location}
          </h2>
        </div>
        <span className="text-xs text-salvus-info font-semibold shrink-0">Open tactical map →</span>
      </div>

      {/* Map Radar Canvas */}
      <div className="relative w-full h-40 sm:h-44 bg-salvus-muted/40 rounded-xl border border-salvus-border overflow-hidden flex flex-col justify-between p-4 select-none">
        {/* Subtle Map Grid lines */}
        <div className="absolute inset-0 flex flex-col justify-between py-6 px-4 pointer-events-none opacity-20">
          <div className="w-full h-px bg-salvus-border"></div>
          <div className="w-full h-px bg-salvus-border"></div>
          <div className="w-full h-px bg-salvus-border"></div>
        </div>

        {/* Hazard Zone */}
        <div
          className="absolute rounded-full bg-salvus-critical-bg border border-salvus-critical-border flex items-center justify-center transition-all"
          style={{
            left: '45%',
            top: '55%',
            width: '64px',
            height: '64px',
            transform: 'translate(-50%, -50%)',
          }}
          title="Monitored Hazard Zone"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-salvus-critical" />
        </div>

        {/* You Indicator */}
        <div
          className="absolute flex items-center justify-center"
          style={{
            left: '32%',
            top: '35%',
            transform: 'translate(-50%, -50%)',
          }}
          title={
            isBrowserGps
              ? 'Your device GPS location'
              : isLandmark
                ? 'Approximate landmark location'
                : 'Sector location'
          }
        >
          <span className="relative flex h-4 w-4">
            {isBrowserGps && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-salvus-info opacity-75"></span>
            )}
            <span
              className={`relative inline-flex rounded-full h-4 w-4 ${
                isLandmark ? 'bg-amber-400' : 'bg-salvus-info'
              } ring-2 ring-salvus-surface shadow-xs`}
            ></span>
          </span>
        </div>

        {/* Shelter Indicator */}
        <div
          className="absolute flex items-center justify-center"
          style={{
            left: '72%',
            top: '45%',
            transform: 'translate(-50%, -50%)',
          }}
          title="Safe Shelter"
        >
          <span className="h-4 w-4 rounded-full bg-salvus-safe ring-2 ring-salvus-surface shadow-xs"></span>
        </div>

        {/* Legend Footer */}
        <div className="mt-auto z-10 pt-2 flex items-center gap-3 text-xs text-salvus-text-secondary flex-wrap bg-salvus-surface/80 backdrop-blur-xs px-2 py-1 rounded-lg border border-salvus-border/50">
          {legend.map((item, idx) => (
            <div key={item.label} className="flex items-center gap-1.5 font-medium">
              <span
                className={`h-2 w-2 rounded-full ${
                  item.label.toLowerCase().includes('you') && isLandmark
                    ? 'bg-amber-400'
                    : item.colorClass
                }`}
              ></span>
              <span>
                {item.label.toLowerCase().includes('you') && isLandmark
                  ? 'You (Approx.)'
                  : item.label}
              </span>
              {idx < legend.length - 1 && <span className="text-salvus-text-muted ml-1.5">·</span>}
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

export default AreaMapCard
