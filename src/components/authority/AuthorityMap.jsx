import { SalvusLeafletMap } from '../common/SalvusLeafletMap'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'

/**
 * Geospatial Tactical Map Surface
 * Part 7: Geographic source of truth with clean toggleable layers.
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
  return (
    <Card
      aria-label="Tactical Operations Map"
      padding="sm"
      className="lg:col-span-8 xl:col-span-5 flex flex-col justify-between relative min-h-[580px]"
    >
      {/* Map Control Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 mb-2 border-b border-salvus-border z-10">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-bold text-salvus-text-primary uppercase tracking-wider">
            Tactical Map
          </h2>
          {activeRoute && (
            <Badge variant="info" isMono={true} size="sm">
              Route Active: {activeRoute.distanceKm} km · {activeRoute.etaFormatted}
            </Badge>
          )}
        </div>

        {/* Layer Toggles */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => onToggleLayer?.('hazards')}
            className={`px-2 py-0.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
              mapLayers.hazards
                ? 'bg-salvus-warning-bg text-salvus-warning-text border-salvus-warning-border'
                : 'bg-salvus-muted/40 text-salvus-text-muted border-salvus-border'
            }`}
          >
            ⛈️ Hazards ({liveHazards.length})
          </button>

          <button
            type="button"
            onClick={() => onToggleLayer?.('clusters')}
            className={`px-2 py-0.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
              mapLayers.clusters
                ? 'bg-salvus-info-bg text-salvus-info-text border-salvus-info-border'
                : 'bg-salvus-muted/40 text-salvus-text-muted border-salvus-border'
            }`}
          >
            📍 Clusters ({incidentClusters.length})
          </button>

          <button
            type="button"
            onClick={() => onToggleLayer?.('routes')}
            className={`px-2 py-0.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
              mapLayers.routes
                ? 'bg-salvus-info-bg text-salvus-info-text border-salvus-info-border'
                : 'bg-salvus-muted/40 text-salvus-text-muted border-salvus-border'
            }`}
          >
            Routes
          </button>

          <button
            type="button"
            onClick={() => onToggleLayer?.('incidents')}
            className={`px-2 py-0.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
              mapLayers.incidents
                ? 'bg-salvus-critical-bg text-salvus-critical border-salvus-critical-border'
                : 'bg-salvus-muted/40 text-salvus-text-muted border-salvus-border'
            }`}
          >
            Incidents ({incidents.length})
          </button>

          <button
            type="button"
            onClick={() => onToggleLayer?.('responders')}
            className={`px-2 py-0.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
              mapLayers.responders
                ? 'bg-salvus-info-bg text-salvus-info border-salvus-info-border'
                : 'bg-salvus-muted/40 text-salvus-text-muted border-salvus-border'
            }`}
          >
            Fleet ({responderMapPoints.length})
          </button>
        </div>
      </div>

      {/* Map Surface */}
      <div className="relative w-full h-[470px] rounded-xl border border-salvus-border overflow-hidden">
        <SalvusLeafletMap
          center={[22.5726, 88.3639]}
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
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-salvus-critical"></span>
            <span>Critical Incident</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-salvus-info"></span>
            <span>Rescue Craft</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-salvus-safe"></span>
            <span>Shelter</span>
          </div>
        </div>
        <span className="text-salvus-text-muted">OSRM Routing Active</span>
      </div>
    </Card>
  )
}

export default AuthorityMap
