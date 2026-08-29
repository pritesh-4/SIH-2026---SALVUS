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
 * - Real-world data only (zero fabricated open hours, phone, or capacity)
 * - Granular Civil Defense Safe Place telemetry (capacity, beds, trust level, supplies)
 * - Verified telephone calling via tel:
 * - On-demand turn-by-turn routing + external navigation app trigger
 * - Mobile-friendly close / back navigation
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
    ? `${place.distance_formatted.replace('Approx. ', '')} (straight-line)`
    : place.distance_km != null
      ? `${place.distance_km.toFixed(1)} km away (straight-line)`
      : 'Distance unknown'

  const hasActiveRouteForThisPlace =
    activeRoute &&
    (activeRoute.placeId === place.id ||
      activeRoute.destinationId === place.id ||
      activeRoute.place?.id === place.id)

  const safeDetails = place.safe_place_details
  const isSafePlace = place.category === 'shelter' || Boolean(safeDetails)

  const googleMapsDirectionsUrl =
    typeof place.latitude === 'number' && typeof place.longitude === 'number'
      ? `https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`
      : null

  return (
    <Card
      padding="md"
      className="flex flex-col h-full bg-salvus-surface border-salvus-border shadow-lg rounded-2xl overflow-y-auto animate-fadeIn"
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

            {place.verified && place.provenance !== 'SALVUS_VERIFIED' && (
              <Badge variant="safe" size="sm">
                Official
              </Badge>
            )}
          </div>

          <h2 className="text-base sm:text-lg font-bold text-salvus-text-primary leading-tight">
            {place.name}
          </h2>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-salvus-text-muted hover:text-salvus-text-primary hover:bg-salvus-muted/60 transition-colors focus:outline-hidden focus:ring-2 focus:ring-salvus-info shrink-0 cursor-pointer"
          aria-label="Close details panel"
          title="Close details"
        >
          ✕
        </button>
      </div>

      {/* Body Information List */}
      <div className="flex-1 py-3.5 space-y-3.5 text-xs sm:text-sm">
        {/* Distance & Route Metrics */}
        <div className="p-3 rounded-xl bg-salvus-muted/40 border border-salvus-border space-y-1.5">
          <div className="flex items-center justify-between text-salvus-text-secondary">
            <span className="text-salvus-text-muted font-medium">Direct distance:</span>
            <span className="font-semibold text-salvus-text-primary font-mono">{distanceStr}</span>
          </div>

          {hasActiveRouteForThisPlace && activeRoute && (
            <div className="pt-1.5 border-t border-salvus-border flex items-center justify-between">
              <span className="text-salvus-safe font-medium flex items-center gap-1">
                <span>🚶</span> Road route:
              </span>
              <span className="font-bold text-salvus-safe font-mono">
                {activeRoute.route_distance_m != null
                  ? `${Math.round(activeRoute.route_distance_m)} m`
                  : activeRoute.distance_meters != null
                    ? `${Math.round(activeRoute.distance_meters)} m`
                    : activeRoute.distanceKm != null
                      ? `${activeRoute.distanceKm} km`
                      : ''}{' '}
                ·{' '}
                {activeRoute.eta_formatted ||
                  activeRoute.etaFormatted ||
                  `${Math.round((activeRoute.route_duration_s || activeRoute.duration_seconds || 60) / 60)} min`}
              </span>
            </div>
          )}
        </div>

        {/* Safe Place / Evacuation Shelter Specific Telemetry */}
        {isSafePlace && safeDetails && (
          <div className="p-3 rounded-xl bg-salvus-safe/5 border border-salvus-safe/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-salvus-safe uppercase tracking-wider flex items-center gap-1">
                <span>🛡️</span> Civil Defense Shelter Metrics
              </span>
              {safeDetails.is_safe === false && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-500/40 font-mono">
                  HAZARD WARNING
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div className="bg-salvus-surface p-2 rounded-lg border border-salvus-border">
                <span className="text-salvus-text-muted text-[10px] block uppercase font-mono">
                  Designation
                </span>
                <span className="font-semibold text-salvus-text-primary">
                  {safeDetails.designation_type || 'Emergency Shelter'}
                </span>
              </div>

              <div className="bg-salvus-surface p-2 rounded-lg border border-salvus-border">
                <span className="text-salvus-text-muted text-[10px] block uppercase font-mono">
                  Capacity
                </span>
                <span className="font-semibold text-salvus-text-primary">
                  {safeDetails.total_capacity
                    ? `${safeDetails.total_capacity} people`
                    : 'Designated capacity'}
                </span>
              </div>

              {safeDetails.available_beds != null && (
                <div className="bg-salvus-surface p-2 rounded-lg border border-salvus-border">
                  <span className="text-salvus-text-muted text-[10px] block uppercase font-mono">
                    Available Beds
                  </span>
                  <span className="font-semibold text-salvus-safe font-mono">
                    {safeDetails.available_beds} beds free
                  </span>
                </div>
              )}

              {safeDetails.supplies_status && (
                <div className="bg-salvus-surface p-2 rounded-lg border border-salvus-border">
                  <span className="text-salvus-text-muted text-[10px] block uppercase font-mono">
                    Supplies
                  </span>
                  <span className="font-semibold text-salvus-text-primary">
                    {safeDetails.supplies_status}
                  </span>
                </div>
              )}
            </div>

            {safeDetails.hazard_proximity_warning && (
              <p className="text-[11px] text-rose-400 bg-rose-950/60 p-2 rounded-lg border border-rose-500/30 font-mono mt-1">
                ⚠️ {safeDetails.hazard_proximity_warning}
              </p>
            )}
          </div>
        )}

        {/* Address */}
        <div>
          <span className="text-xs font-semibold text-salvus-text-muted uppercase tracking-wider block mb-1">
            Address & Location
          </span>
          <p className="text-salvus-text-primary leading-relaxed">
            {place.address || place.city || 'Address details not available in open map data.'}
          </p>
        </div>

        {/* Operating Hours */}
        <div>
          <span className="text-xs font-semibold text-salvus-text-muted uppercase tracking-wider block mb-1">
            Operating Hours
          </span>
          <div className="text-salvus-text-primary flex items-center gap-1.5">
            {place.opening_hours ? (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block shrink-0" />
                <span className="font-medium">{place.opening_hours}</span>
              </>
            ) : (
              <span className="text-salvus-text-muted italic text-xs">
                Operating hours not available (do not assume open status).
              </span>
            )}
          </div>
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
            <p className="text-salvus-text-muted italic text-xs">Phone contact not available.</p>
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
            <span className="font-semibold">Source:</span> {place.source || 'Geoapify Places'}
            {place.source_id ? ` · Ref ID: ${place.source_id}` : ''}
          </p>
          {place.provenance === 'SALVUS_VERIFIED' ? (
            <p className="text-[11px] text-salvus-safe mt-0.5">
              ✓ Verified by Salvus Civil Defense Operational Network.
            </p>
          ) : (
            <p className="text-[11px] text-salvus-text-muted mt-0.5">
              Sourced from open geospatial registry. Verified for emergency proximity.
            </p>
          )}
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-3 border-t border-salvus-border flex flex-col sm:flex-row gap-2">
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

        {googleMapsDirectionsUrl && (
          <a
            href={googleMapsDirectionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 rounded-xl bg-salvus-surface border border-salvus-border hover:border-salvus-info text-salvus-text-secondary hover:text-salvus-text-primary text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
            title="Open in Google Maps / Navigation App"
          >
            <span>🧭</span>
            <span>Maps ↗</span>
          </a>
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
