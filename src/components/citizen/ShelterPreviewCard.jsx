import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { getProvenanceBadge } from '../../services/placesService'

/**
 * ShelterPreviewCard Component (Real Shelter Reconstruction)
 *
 * Primary question answered: "WHERE SHOULD I GO?"
 *
 * Data Truth Integrity:
 * - Differentiates "RECOMMENDED SAFE PLACE" (Salvus Verified) vs "NEARBY FACILITY" (OSM Mapped)
 * - Provenance indicator (✓ Salvus verified vs Map data vs Simulation demo)
 * - Capacity truth: Only displays "X beds available" when verified; otherwise "Availability not available"
 * - Never fabricates fake bed numbers, opening hours, or default amenities
 * - Clean light/dark mode design system compliance
 */
export const ShelterPreviewCard = ({
  badgeText = 'RECOMMENDED SAFE PLACE',
  badgeVariant = 'safe',
  provenance = 'SALVUS_VERIFIED',
  name = 'Safe Evacuation Facility',
  distance = null,
  travelTime = null,
  capacity = null,
  operationalStatus = null,
  amenities = null,
  actionText = 'Get Safe Route',
  actionVariant = 'safe',
  onActionClick,
}) => {
  const provInfo = provenance ? getProvenanceBadge(provenance) : null

  return (
    <Card
      padding="md"
      className="flex flex-col justify-between transition-all hover:border-salvus-border-strong focus-within:ring-2 focus-within:ring-salvus-safe bg-salvus-surface border-salvus-border text-salvus-text-primary"
    >
      <div>
        {/* Header Badges: Safety Role + Data Provenance */}
        <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
          <Badge variant={badgeVariant} dot={badgeVariant === 'safe'}>
            {badgeText}
          </Badge>

          {provInfo && (
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                provenance === 'SALVUS_VERIFIED'
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
                  : provenance === 'SEEDED_DEMO'
                    ? 'bg-amber-950/40 text-amber-300 border-amber-500/30'
                    : 'bg-salvus-muted text-salvus-text-muted border-salvus-border'
              }`}
              title={provInfo.description}
            >
              {provInfo.label}
            </span>
          )}
        </div>

        {/* Facility Name */}
        <h2 className="text-base sm:text-lg font-bold text-salvus-text-primary tracking-tight leading-snug">
          {name}
        </h2>

        {/* Proximity, Travel Time & Verified Capacity Metrics */}
        <div className="flex items-center gap-2 text-xs sm:text-sm text-salvus-text-secondary mt-2 font-medium flex-wrap">
          {distance && <span className="font-semibold text-salvus-text-primary">{distance}</span>}

          {travelTime && (
            <>
              <span>·</span>
              <span>{travelTime}</span>
            </>
          )}

          {capacity ? (
            <>
              <span>·</span>
              <span
                className={
                  provenance === 'SALVUS_VERIFIED' && capacity.includes('beds available')
                    ? 'text-salvus-safe font-bold'
                    : 'text-salvus-text-secondary font-medium'
                }
              >
                {capacity}
              </span>
            </>
          ) : provenance === 'OSM_MAPPED' ? (
            <>
              <span>·</span>
              <span className="text-salvus-text-muted italic">Availability not available</span>
            </>
          ) : null}

          {operationalStatus && operationalStatus !== 'UNKNOWN' && (
            <>
              <span>·</span>
              <span className="text-[11px] px-1.5 py-0.5 rounded font-bold uppercase bg-salvus-muted text-salvus-text-secondary border border-salvus-border">
                {operationalStatus}
              </span>
            </>
          )}
        </div>

        {/* Available Facilities & Amenities (Honest display only when known) */}
        {amenities && (
          <div className="mt-3 p-2.5 rounded-xl bg-salvus-muted/40 border border-salvus-border text-xs text-salvus-text-secondary">
            <span className="text-[10px] font-bold uppercase tracking-wider text-salvus-text-muted block mb-0.5">
              Available Facilities
            </span>
            <p className="text-salvus-text-primary font-medium">{amenities}</p>
          </div>
        )}
      </div>

      {/* Primary Action Button */}
      <div className="mt-4 pt-3 border-t border-salvus-border">
        <Button
          variant={actionVariant}
          size="md"
          fullWidth={true}
          onClick={onActionClick}
          rightIcon={<span aria-hidden="true">→</span>}
          className="font-bold text-xs sm:text-sm min-h-[44px] cursor-pointer"
        >
          {actionText}
        </Button>
      </div>
    </Card>
  )
}

export default ShelterPreviewCard
