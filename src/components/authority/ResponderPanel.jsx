import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

/**
 * Secondary Fleet Resource Management Panel (Master Prompt 3 - Step 13)
 *
 * Organized secondary resource inspection:
 * - Capability & status filters
 * - Unit details with radio channel, coordinates, crew load
 * - Quick status transitions & route plotting to active incident
 */
export const ResponderPanel = ({
  filteredFleet = [],
  isLoadingFleet = false,
  fleetCapabilityFilter = 'all',
  fleetStatusFilter = 'all',
  selectedResponderDetail = null,
  selectedIncident = null,
  onCapabilityFilterChange,
  onStatusFilterChange,
  onSelectResponderDetail,
  onCloseResponderDetail,
  onSelectCandidateRoute,
  onUpdateResponderStatus,
}) => {
  const getStatusVariant = (status) => {
    switch (status) {
      case 'AVAILABLE':
        return 'safe'
      case 'ASSIGNED':
      case 'EN_ROUTE':
        return 'info'
      case 'NEARBY':
      case 'ON_SCENE':
        return 'warning'
      case 'OFFLINE':
      default:
        return 'neutral'
    }
  }

  return (
    <div className="space-y-3 flex-1 flex flex-col justify-between overflow-y-auto pr-1">
      <div className="space-y-2">
        {/* Filters */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <select
            value={fleetCapabilityFilter}
            onChange={(e) => onCapabilityFilterChange?.(e.target.value)}
            className="bg-salvus-surface border border-salvus-border text-salvus-text-primary p-2 rounded-lg text-xs"
          >
            <option value="all">All Capabilities</option>
            <option value="FLOOD_BOAT">Flood Boat</option>
            <option value="AMBULANCE">Ambulance</option>
            <option value="STRETCHER_TEAM">Stretcher Team</option>
            <option value="HAZMAT">Hazmat / Grid</option>
          </select>

          <select
            value={fleetStatusFilter}
            onChange={(e) => onStatusFilterChange?.(e.target.value)}
            className="bg-salvus-surface border border-salvus-border text-salvus-text-primary p-2 rounded-lg text-xs"
          >
            <option value="all">All Statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="EN_ROUTE">En Route</option>
            <option value="NEARBY">Nearby</option>
            <option value="ON_SCENE">On Scene</option>
            <option value="OFFLINE">Offline</option>
          </select>
        </div>

        {/* Fleet List */}
        {isLoadingFleet ? (
          <div className="py-16 text-center text-xs text-salvus-text-muted space-y-2">
            <span className="inline-block animate-spin">⏳</span>
            <p>Updating fleet list...</p>
          </div>
        ) : filteredFleet.length === 0 ? (
          <div className="py-16 text-center text-xs text-salvus-text-muted">
            No response units currently match filter.
          </div>
        ) : (
          filteredFleet.map((resp) => {
            const isSelected = selectedResponderDetail?.id === resp.id
            return (
              <div
                key={resp.id}
                onClick={() => onSelectResponderDetail?.(resp)}
                className={`bg-salvus-muted/30 border p-3 rounded-xl text-xs space-y-1.5 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-salvus-info bg-salvus-info-bg/30 ring-1 ring-salvus-info shadow-xs'
                    : 'border-salvus-border hover:border-salvus-border-strong hover:bg-salvus-surface-hover'
                }`}
              >
                <div className="flex items-center justify-between">
                  <strong className="text-salvus-text-primary text-xs truncate max-w-[160px] font-bold">
                    {resp.unit_name}
                  </strong>
                  <Badge variant={getStatusVariant(resp.status)} size="sm">
                    {resp.status}
                  </Badge>
                </div>

                <p className="text-xs text-salvus-text-secondary font-medium">
                  {resp.team_lead} · {resp.vehicle_type}
                </p>

                <div className="flex items-center justify-between text-xs text-salvus-text-muted pt-1 border-t border-salvus-border font-mono">
                  <span>VHF: {resp.radio_channel}</span>
                  <span>
                    Load: {resp.current_load} / {resp.max_capacity}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Selected Responder Detail Sheet */}
      {selectedResponderDetail && (
        <div className="bg-salvus-surface-elevated border border-salvus-border p-3.5 rounded-xl text-xs space-y-2.5 mt-2 animate-fadeIn shadow-xs">
          <div className="flex items-center justify-between border-b border-salvus-border pb-1.5">
            <strong className="text-salvus-text-primary text-xs font-bold">
              {selectedResponderDetail.unit_name}
            </strong>
            <button
              type="button"
              onClick={onCloseResponderDetail}
              className="text-salvus-text-muted hover:text-salvus-text-primary text-xs p-0.5 cursor-pointer select-none"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-salvus-text-secondary">
            <div>
              <span className="text-salvus-text-muted block text-[10px] uppercase font-semibold">
                Capability
              </span>
              <span className="text-salvus-text-primary font-medium">
                {selectedResponderDetail.capability}
              </span>
            </div>
            <div>
              <span className="text-salvus-text-muted block text-[10px] uppercase font-semibold">
                Radio Channel
              </span>
              <span className="text-salvus-text-primary font-medium font-mono">
                {selectedResponderDetail.radio_channel}
              </span>
            </div>
            <div>
              <span className="text-salvus-text-muted block text-[10px] uppercase font-semibold">
                Coordinates
              </span>
              <span className="font-mono text-salvus-text-primary text-[11px]">
                {typeof selectedResponderDetail.latitude === 'number' &&
                typeof selectedResponderDetail.longitude === 'number'
                  ? `${selectedResponderDetail.latitude.toFixed(4)}°N, ${selectedResponderDetail.longitude.toFixed(4)}°E`
                  : 'Location unavailable'}
              </span>
            </div>
            <div>
              <span className="text-salvus-text-muted block text-[10px] uppercase font-semibold">
                Crew Load
              </span>
              <span className="text-salvus-text-primary font-medium font-mono">
                {selectedResponderDetail.current_load} / {selectedResponderDetail.max_capacity}
              </span>
            </div>
          </div>

          {selectedResponderDetail.assigned_incident_id && (
            <div className="bg-salvus-info-bg border border-salvus-info-border p-2 rounded-lg text-xs text-salvus-info-text font-medium">
              Assigned to Incident #{selectedResponderDetail.assigned_incident_id}
            </div>
          )}

          {selectedIncident && (
            <Button
              variant="secondary"
              size="sm"
              fullWidth={true}
              onClick={() => onSelectCandidateRoute?.(selectedResponderDetail)}
              className="text-xs font-semibold"
            >
              📍 Plot Route to Selected Incident
            </Button>
          )}

          <div className="grid grid-cols-3 gap-1.5 pt-1">
            <Button
              variant="quiet"
              size="sm"
              onClick={() =>
                onUpdateResponderStatus?.(selectedResponderDetail.id, 'AVAILABLE', null)
              }
              className="text-[11px]"
            >
              Available
            </Button>

            <Button
              variant="quiet"
              size="sm"
              onClick={() => onUpdateResponderStatus?.(selectedResponderDetail.id, 'ON_SCENE')}
              className="text-[11px]"
            >
              On Scene
            </Button>

            <Button
              variant="quiet"
              size="sm"
              onClick={() => onUpdateResponderStatus?.(selectedResponderDetail.id, 'OFFLINE')}
              className="text-[11px]"
            >
              Offline
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ResponderPanel
