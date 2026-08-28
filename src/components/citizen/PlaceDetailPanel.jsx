import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Card } from '../ui/Card'
import {
  getCategoryInfo,
  getProvenanceBadge,
  normalizeWebsiteUrl,
} from '../../services/placesService'

/**
 * PlaceDetailPanel Component (Phase 3: Citizen Nearby Places Experience)
 *
 * Comprehensive facility inspector:
 * - Rendered as desktop side panel or mobile bottom drawer
 * - Complete honest details with zero fabricated data
 * - Verified phone calling via tel:
 * - On-demand route calculation trigger
 */
export const PlaceDetailPanel = ({
  place,
  activeRoute = null,
  isCalculatingRoute = false,
  onGetRoute,
  onClearRoute,
  onClose,
}) => {
  if (!place) return null

  const catInfo = getCategoryInfo(place.category)
  const provBadge = getProvenanceBadge(place.provenance)
  const normalizedUrl = normalizeWebsiteUrl(place.website)

  const distanceStr = place.distance_formatted
    ? `${place.distance_formatted.replace('Approx. ', '')} away (straight-line)`
    : place.distance_km != null
      ? `${place.distance_km.toFixed(1)} km away (straight-line)`
      : null

  const hasActiveRouteForThisPlace =
    activeRoute &&
    (activeRoute.placeId === place.id ||
      activeRoute.destinationId === place.id ||
      activeRoute.place?.id === place.id)

  return (
    <Card
      padding="md"
      className="flex flex-col h-full bg-salvus-surface border-salvus-border shadow-lg rounded-2xl overflow-y-auto"
      aria-label={`Details for ${place.name}`}
    >
      {/* Header with Title and Close Button */}
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-salvus-border">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-salvus-muted text-salvus-text-secondary inline-flex items-center gap-1.5">
              <span>{catInfo.icon}</span>
              <span>{catInfo.label}</span>
            </span>

            <Badge
              variant={provBadge.variant}
              dot={place.provenance === 'SALVUS_VERIFIED'}
              title={provBadge.description}
            >
              {provBadge.label}
            </Badge>
          </div>

          <h2 className="text-base sm:text-lg font-bold text-salvus-text-primary leading-tight">
            {place.name}
          </h2>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-salvus-text-muted hover:text-salvus-text-primary hover:bg-salvus-muted/60 transition-colors focus:outline-hidden focus:ring-2 focus:ring-salvus-info shrink-0"
          aria-label="Close details"
        >
          ✕
        </button>
      </div>

      {/* Body Information List */}
      <div className="flex-1 py-3.5 space-y-3.5 text-xs sm:text-sm">
        {/* Distance & Route Metrics */}
        <div className="p-3 rounded-xl bg-salvus-muted/40 border border-salvus-border space-y-1.5">
          {distanceStr && (
            <div className="flex items-center justify-between text-salvus-text-secondary">
              <span className="text-salvus-text-muted">Direct distance:</span>
              <span className="font-semibold text-salvus-text-primary">{distanceStr}</span>
            </div>
          )}

          {hasActiveRouteForThisPlace && activeRoute && (
            <div className="pt-1.5 border-t border-salvus-border flex items-center justify-between">
              <span className="text-salvus-safe font-medium flex items-center gap-1">
                <span>🚶</span> Road route:
              </span>
              <span className="font-bold text-salvus-safe">
                {activeRoute.route_distance_m != null
                  ? `${Math.round(activeRoute.route_distance_m)} m`
                  : activeRoute.distance_meters != null
                    ? `${Math.round(activeRoute.distance_meters)} m`
                    : ''}{' '}
                ·{' '}
                {activeRoute.eta_formatted ||
                  `${Math.round((activeRoute.route_duration_s || activeRoute.duration_seconds || 60) / 60)} min`}
              </span>
            </div>
          )}
        </div>

        {/* Address */}
        <div>
          <span className="text-xs font-semibold text-salvus-text-muted uppercase tracking-wider block mb-1">
            Address & Location
          </span>
          <p className="text-salvus-text-primary">
            {place.address || place.city || 'Address details not available in open map data.'}
          </p>
        </div>

        {/* Opening Hours */}
        <div>
          <span className="text-xs font-semibold text-salvus-text-muted uppercase tracking-wider block mb-1">
            Operating Hours
          </span>
          <p className="text-salvus-text-primary flex items-center gap-1.5">
            {place.opening_hours ? (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block shrink-0" />
                <span>{place.opening_hours}</span>
              </>
            ) : (
              <span className="text-salvus-text-muted italic">
                Operating hours not available (do not assume open status).
              </span>
            )}
          </p>
        </div>

        {/* Contact Phone */}
        <div>
          <span className="text-xs font-semibold text-salvus-text-muted uppercase tracking-wider block mb-1">
            Telephone Contact
          </span>
          {place.phone ? (
            <div className="flex items-center gap-2">
              <a
                href={`tel:${place.phone.replace(/[^0-9+]/g, '')}`}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-salvus-info/10 text-salvus-info font-bold text-xs hover:bg-salvus-info/20 transition-colors focus:ring-2 focus:ring-salvus-info"
                aria-label={`Call ${place.name} at ${place.phone}`}
              >
                <span>📞</span>
                <span>Call {place.phone}</span>
              </a>
            </div>
          ) : (
            <p className="text-salvus-text-muted italic">Phone contact not available.</p>
          )}
        </div>

        {/* Official Website */}
        {normalizedUrl && (
          <div>
            <span className="text-xs font-semibold text-salvus-text-muted uppercase tracking-wider block mb-1">
              External Website
            </span>
            <a
              href={normalizedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-salvus-info hover:underline text-xs break-all"
            >
              <span>{normalizedUrl}</span>
              <span>↗</span>
            </a>
          </div>
        )}

        {/* Amenities / Verified Capabilities */}
        {place.amenities && place.amenities.length > 0 && (
          <div>
            <span className="text-xs font-semibold text-salvus-text-muted uppercase tracking-wider block mb-1.5">
              Available Facilities & Services
            </span>
            <div className="flex flex-wrap gap-1.5">
              {place.amenities.map((item, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-md bg-salvus-muted text-salvus-text-secondary text-xs"
                >
                  ✓ {item}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Provenance & Attribution Source */}
        <div className="pt-2 border-t border-salvus-border/60">
          <p className="text-[11px] text-salvus-text-muted">
            <span className="font-semibold">Source:</span> {place.source || 'OpenStreetMap'}
            {place.source_id ? ` · Ref ID: ${place.source_id}` : ''}
          </p>
          {place.provenance === 'SALVUS_VERIFIED' ? (
            <p className="text-[11px] text-salvus-safe mt-0.5">
              ✓ Verified by Salvus Civil Defense Operational Network.
            </p>
          ) : (
            <p className="text-[11px] text-salvus-text-muted mt-0.5">
              Sourced from OpenStreetMap public geospatial registry.
            </p>
          )}
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-3 border-t border-salvus-border flex gap-2">
        {hasActiveRouteForThisPlace ? (
          <Button variant="outline" className="flex-1" onClick={onClearRoute}>
            Clear Route
          </Button>
        ) : (
          <Button
            variant="primary"
            className="flex-1"
            loading={isCalculatingRoute}
            onClick={() => onGetRoute?.(place)}
          >
            Get Route →
          </Button>
        )}

        {place.phone && (
          <a
            href={`tel:${place.phone.replace(/[^0-9+]/g, '')}`}
            className="px-4 py-2 rounded-xl bg-salvus-safe text-white font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-emerald-600 transition-colors shrink-0"
            aria-label={`Call ${place.name}`}
          >
            <span>📞</span>
            <span>Call</span>
          </a>
        )}
      </div>
    </Card>
  )
}
