import { useMemo } from 'react'
import { SalvusLeafletMap } from '../common/SalvusLeafletMap'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'

/**
 * Geospatial Tactical Map Surface (Master Prompt 3 - Step 6)
 *
 * Spatial anchor with clean toggleable layers:
 * - Hazards, Clusters, Routes, Incidents, Fleet, Shelters
 * - Clear active route and selected incident highlight
 */
export const AuthorityMap = ({
  incidents = [],
  responderMapPoints = [],
  shelterMapPoints = [],
  liveHazards = [],
  incidentClusters = [],
  selectedIncident = null,
  activeRoute = null,
  previewRoute = null,
  mapLayers = {
    incidents: true,
    responders: true,
    shelters: true,
    routes: true,
    hazards: true,
    clusters: true,
  },
  onToggleLayer,
  onSelectIncident,
  onClearRoute,
}) => {
  // Derive dynamic map center based on selected incident, first incident, or first responder
  const dynamicCenter = useMemo(() => {
    if (selectedIncident?.latitude && selectedIncident?.longitude) {
      return [selectedIncident.latitude, selectedIncident.longitude]
    }
    const validInc = incidents.find((i) => i.latitude && i.longitude)
    if (validInc) {
      return [validInc.latitude, validInc.longitude]
    }
    const validResp = responderMapPoints.find(
      (r) => (r.lat && r.lng) || (r.latitude && r.longitude)
    )
    if (validResp) {
      return [validResp.lat || validResp.latitude, validResp.lng || validResp.longitude]
    }
    const validShelter = shelterMapPoints.find((s) => s.lat && s.lng)
    if (validShelter) {
      return [validShelter.lat, validShelter.lng]
    }
    return [20.5937, 78.9629]
  }, [selectedIncident, incidents, responderMapPoints, shelterMapPoints])
  return (
    <Card
      aria-label="Tactical Operations Map"
      padding="sm"
      className="lg:col-span-8 xl:col-span-5 flex flex-col justify-between relative min-h-[580px] shadow-xs"
    >
      {/* Map Control Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 mb-2 border-b border-salvus-border z-10">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-bold text-salvus-text-primary uppercase tracking-wider">
            Tactical Map
          </h2>
          {activeRoute && (
            <Badge variant="info" isMono={true} size="sm">
              Corridor: {activeRoute.distanceKm} km · {activeRoute.etaFormatted}
            </Badge>
          )}
        </div>

        {/* Layer Toggles */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => onToggleLayer?.('hazards')}
            aria-pressed={mapLayers.hazards}
            className={`px-2 py-0.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
              mapLayers.hazards
                ? 'bg-salvus-warning-bg text-salvus-warning-text border-salvus-warning-border font-semibold shadow-2xs'
                : 'bg-salvus-muted/40 text-salvus-text-muted border-salvus-border hover:text-salvus-text-primary'
            }`}
          >
            ⛈️ Hazards ({liveHazards.length})
          </button>

          <button
            type="button"
            onClick={() => onToggleLayer?.('clusters')}
            aria-pressed={mapLayers.clusters}
            className={`px-2 py-0.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
              mapLayers.clusters
                ? 'bg-salvus-info-bg text-salvus-info-text border-salvus-info-border font-semibold shadow-2xs'
                : 'bg-salvus-muted/40 text-salvus-text-muted border-salvus-border hover:text-salvus-text-primary'
            }`}
          >
            📍 Clusters ({incidentClusters.length})
          </button>

          <button
            type="button"
            onClick={() => onToggleLayer?.('routes')}
            aria-pressed={mapLayers.routes}
            className={`px-2 py-0.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
              mapLayers.routes
                ? 'bg-salvus-info-bg text-salvus-info-text border-salvus-info-border font-semibold shadow-2xs'
                : 'bg-salvus-muted/40 text-salvus-text-muted border-salvus-border hover:text-salvus-text-primary'
            }`}
          >
            Routes
          </button>

          <button
            type="button"
            onClick={() => onToggleLayer?.('incidents')}
            aria-pressed={mapLayers.incidents}
            className={`px-2 py-0.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
              mapLayers.incidents
                ? 'bg-salvus-critical-bg text-salvus-critical border-salvus-critical-border font-semibold shadow-2xs'
                : 'bg-salvus-muted/40 text-salvus-text-muted border-salvus-border hover:text-salvus-text-primary'
            }`}
          >
            Incidents ({incidents.length})
          </button>

          <button
            type="button"
            onClick={() => onToggleLayer?.('responders')}
            aria-pressed={mapLayers.responders}
            className={`px-2 py-0.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
              mapLayers.responders
                ? 'bg-salvus-info-bg text-salvus-info border-salvus-info-border font-semibold shadow-2xs'
                : 'bg-salvus-muted/40 text-salvus-text-muted border-salvus-border hover:text-salvus-text-primary'
            }`}
          >
            Fleet ({responderMapPoints.length})
          </button>
        </div>
      </div>

      {/* Map Surface */}
      <div className="relative w-full h-[470px] rounded-xl border border-salvus-border overflow-hidden">
        <SalvusLeafletMap
          center={dynamicCenter}
          zoom={13}
          incidents={incidents}
          responders={responderMapPoints}
          shelters={shelterMapPoints}
          hazards={liveHazards}
          clusters={incidentClusters}
          selectedIncidentId={selectedIncident?.id}
          onSelectIncident={onSelectIncident}
          activeRoute={activeRoute}
          previewRoute={previewRoute}
          onClearRoute={onClearRoute}
          showLayers={mapLayers}
          className="h-full w-full"
        />
      </div>

      {/* Footer Legend */}
      <div className="mt-2.5 bg-salvus-muted/40 px-3 py-1.5 rounded-xl border border-salvus-border flex items-center justify-between text-xs text-salvus-text-secondary flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-medium">
            <span className="h-2 w-2 rounded-full bg-salvus-critical"></span>
            <span>Critical Threat</span>
          </div>
          <div className="flex items-center gap-1.5 font-medium">
            <span className="h-2 w-2 rounded-full bg-salvus-info"></span>
            <span>Rescue Unit</span>
          </div>
          <div className="flex items-center gap-1.5 font-medium">
            <span className="h-2 w-2 rounded-full bg-salvus-safe"></span>
            <span>Shelter Hub</span>
          </div>
        </div>
        <span className="text-salvus-text-muted font-mono text-[11px]">
          OSRM Spatial Routing Active
        </span>
      </div>
    </Card>
  )
}

export default AuthorityMap
