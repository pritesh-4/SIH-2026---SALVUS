import { SalvusLeafletMap } from '../common/SalvusLeafletMap'

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
    <section
      aria-label="Tactical Operations Map"
      className="lg:col-span-8 xl:col-span-5 bg-[#0C121B] border border-[#182332] rounded-xl p-3.5 flex flex-col justify-between relative min-h-[600px]"
    >
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#182332] z-10">
        <span className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wider flex items-center gap-2">
          <span>Geospatial Tactical Map</span>
          {activeRoute && (
            <span className="text-[10px] font-mono text-sky-400 bg-sky-950/60 border border-sky-500/40 px-2 py-0.5 rounded-full">
              Route Active ({activeRoute.distanceKm} km · {activeRoute.etaFormatted})
            </span>
          )}
        </span>

        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
          <button
            type="button"
            onClick={() => onToggleLayer && onToggleLayer('hazards')}
            className={`px-2 py-0.5 rounded border cursor-pointer transition-colors ${
              mapLayers.hazards
                ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                : 'bg-[#080C12] text-slate-500 border-[#182332]'
            }`}
          >
            ⛈️ Hazards ({liveHazards.length})
          </button>
          <button
            type="button"
            onClick={() => onToggleLayer && onToggleLayer('clusters')}
            className={`px-2 py-0.5 rounded border cursor-pointer transition-colors ${
              mapLayers.clusters
                ? 'bg-indigo-950/60 text-indigo-300 border-indigo-500/40'
                : 'bg-[#080C12] text-slate-500 border-[#182332]'
            }`}
          >
            📍 Clusters ({incidentClusters.length})
          </button>
          <button
            type="button"
            onClick={() => onToggleLayer && onToggleLayer('routes')}
            className={`px-2 py-0.5 rounded border cursor-pointer transition-colors ${
              mapLayers.routes
                ? 'bg-sky-950/60 text-sky-300 border-sky-500/40'
                : 'bg-[#080C12] text-slate-500 border-[#182332]'
            }`}
          >
            Routes
          </button>
          <button
            type="button"
            onClick={() => onToggleLayer && onToggleLayer('incidents')}
            className={`px-2 py-0.5 rounded border cursor-pointer transition-colors ${
              mapLayers.incidents
                ? 'bg-rose-950/40 text-rose-300 border-rose-500/40'
                : 'bg-[#080C12] text-slate-500 border-[#182332]'
            }`}
          >
            Incidents ({incidents.length})
          </button>
          <button
            type="button"
            onClick={() => onToggleLayer && onToggleLayer('responders')}
            className={`px-2 py-0.5 rounded border cursor-pointer transition-colors ${
              mapLayers.responders
                ? 'bg-blue-950/40 text-blue-300 border-blue-500/40'
                : 'bg-[#080C12] text-slate-500 border-[#182332]'
            }`}
          >
            Fleet ({responderMapPoints.length})
          </button>
        </div>
      </div>

      <div className="relative w-full h-[500px] rounded-lg border border-[#162230] overflow-hidden">
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

      <div className="mt-2.5 bg-[#080C12] px-3 py-1.5 rounded-lg border border-[#182332] flex items-center justify-between text-[10px] text-slate-400 font-mono">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-rose-500"></span>Critical Hazard
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-sky-400"></span>Rescue Route
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-blue-400"></span>Rescue Craft
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400"></span>Shelter
          </div>
        </div>
        <span>Tactical OSRM Routing Engine</span>
      </div>
    </section>
  )
}

export default AuthorityMap
