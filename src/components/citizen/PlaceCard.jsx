import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { getCategoryInfo, getProvenanceBadge } from '../../services/placesService'

/**
 * PlaceCard Component (Phase 3: Citizen Nearby Places Experience)
 *
 * Communicates essential facility information at a glance:
 * - Name
 * - Type / Category with icon
 * - Proximity distance (e.g., "720 m away")
 * - Provenance trust badge ("✓ Salvus verified" vs "Map data")
 * - Interactive selection with keyboard support
 */
export const PlaceCard = ({ place, isSelected = false, onSelect, onViewDetails }) => {
  if (!place) return null

  const catInfo = getCategoryInfo(place.category)
  const provBadge = getProvenanceBadge(place.provenance)
  const distanceStr = place.distance_formatted
    ? `${place.distance_formatted.replace('Approx. ', '')} away`
    : place.distance_km != null
      ? place.distance_km < 1
        ? `${Math.round(place.distance_km * 1000)} m away`
        : `${place.distance_km.toFixed(1)} km away`
      : 'Distance unknown'

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect?.(place)
    }
  }

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`${place.name}, ${catInfo.label}, ${distanceStr}, ${provBadge.label}`}
      onClick={() => onSelect?.(place)}
      onKeyDown={handleKeyDown}
      padding="sm"
      className={`group cursor-pointer transition-all duration-200 select-none ${
        isSelected
          ? 'border-salvus-info bg-salvus-info/5 ring-1 ring-salvus-info shadow-sm'
          : 'hover:border-salvus-border-strong hover:bg-salvus-muted/30 focus-visible:ring-2 focus-visible:ring-salvus-info'
      }`}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex-1 min-w-0">
          {/* Header Row: Category Icon & Provenance Badge */}
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-md bg-salvus-muted text-salvus-text-secondary inline-flex items-center gap-1"
              title={catInfo.label}
            >
              <span>{catInfo.icon}</span>
              <span className="truncate max-w-[120px]">{catInfo.label}</span>
            </span>

            <Badge
              variant={provBadge.variant}
              dot={place.provenance === 'SALVUS_VERIFIED'}
              title={provBadge.description}
            >
              {provBadge.label}
            </Badge>
          </div>

          {/* Place Name */}
          <h3 className="text-sm font-bold text-salvus-text-primary group-hover:text-salvus-info transition-colors leading-snug line-clamp-1">
            {place.name}
          </h3>

          {/* Address if available */}
          {place.address && (
            <p className="text-xs text-salvus-text-muted truncate mt-0.5">{place.address}</p>
          )}

          {/* Distance / Route preview */}
          <div className="flex items-center gap-2 mt-2 text-xs">
            <span className="font-semibold text-salvus-text-secondary flex items-center gap-1">
              <span>📍</span>
              {distanceStr}
            </span>

            {place.opening_hours && (
              <span
                className="text-salvus-text-muted truncate max-w-[140px]"
                title={place.opening_hours}
              >
                · {place.opening_hours}
              </span>
            )}
          </div>
        </div>

        {/* View Details Action Indicator */}
        <div className="shrink-0 flex flex-col items-end justify-between self-stretch pt-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onViewDetails ? onViewDetails(place) : onSelect?.(place)
            }}
            className="text-xs font-semibold text-salvus-info hover:underline focus:outline-hidden px-1 py-0.5 rounded"
            aria-label={`View details for ${place.name}`}
          >
            View details →
          </button>
        </div>
      </div>
    </Card>
  )
}
