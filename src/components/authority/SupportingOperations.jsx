import { useState } from 'react'
import {
  Users,
  Home,
  CloudLightning,
  FileText,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from 'lucide-react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ResponderPanel } from './ResponderPanel'
import { ShelterPanel } from './ShelterPanel'
import ErrorBoundary from '../common/ErrorBoundary'

/**
 * Supporting Operations Hub (Zone 5)
 *
 * Dedicated secondary operational center:
 * - Fleet Management: Unit status, capabilities, VHF channels, crew loads
 * - Evacuation Hubs: Bed availability, intake/release adjustments, hazard proximity
 * - Hazard Intelligence: Ingested multi-source bulletins & DBSCAN spatial clusters
 * - Situation Briefing: AI decision support summary & grounded statistics
 *
 * Placed cleanly below the primary decision workspace so logistics and fleet
 * coordination never compete with immediate life-safety rescue response.
 */
export const SupportingOperations = ({
  // Fleet props
  filteredFleet = [],
  liveResponders = [],
  isLoadingFleet = false,
  fleetCapabilityFilter = 'ALL',
  fleetStatusFilter = 'ALL',
  selectedResponderDetail = null,
  selectedIncident = null,
  onCapabilityFilterChange,
  onStatusFilterChange,
  onSelectResponderDetail,
  onCloseResponderDetail,
  onSelectCandidateRoute,
  onUpdateResponderStatus,

  // Shelter props
  liveShelters = [],
  liveHazards = [],
  incidentClusters = [],
  onAdjustBeds,

  // Situation props
  situationSummary = null,
  computedMetrics = { active: 0, critical: 0 },
  isRefreshingSituation = false,
  onRefreshSituation,
  onSyncAll,
}) => {
  const [activeTab, setActiveTab] = useState('fleet')
  const [isExpanded, setIsExpanded] = useState(true)

  const activeCount = computedMetrics.active ?? 0
  const criticalCount = computedMetrics.critical ?? 0
  const fallbackBriefing =
    criticalCount > 0
      ? `Priority response active: ${criticalCount} critical threat${
          criticalCount > 1 ? 's require' : ' requires'
        } immediate dispatch across ${activeCount} active incident${activeCount > 1 ? 's' : ''}.`
      : activeCount > 0
        ? `Routine disaster response active across ${activeCount} reported incident${
            activeCount > 1 ? 's' : ''
          }. Monitored sectors operational.`
        : 'All regional sectors operational. Zero active distress beacons on grid.'

  const briefingText = situationSummary?.briefing || fallbackBriefing

  return (
    <Card
      aria-label="Supporting Operations Center"
      padding="sm"
      className="bg-salvus-surface border border-salvus-border rounded-xl shadow-xs space-y-3"
    >
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 pb-2 border-b border-salvus-border">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="flex items-center gap-1.5 text-xs font-bold text-salvus-text-primary uppercase tracking-wider hover:text-salvus-info transition-colors cursor-pointer select-none"
            aria-expanded={isExpanded}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-salvus-text-muted" />
            ) : (
              <ChevronDown className="h-4 w-4 text-salvus-text-muted" />
            )}
            <span>Supporting Operations & Fleet Hub</span>
          </button>
          <Badge variant="neutral" isMono={true} size="sm">
            Secondary Sector
          </Badge>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div
            role="tablist"
            className="flex items-center gap-1 bg-salvus-muted/40 p-0.5 rounded-lg border border-salvus-border"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'fleet'}
              onClick={() => {
                setActiveTab('fleet')
                setIsExpanded(true)
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'fleet' && isExpanded
                  ? 'bg-salvus-text-primary text-salvus-bg shadow-xs'
                  : 'text-salvus-text-secondary hover:text-salvus-text-primary'
              }`}
            >
              <Users className="h-3 w-3" />
              <span>Fleet ({liveResponders.length})</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'shelters'}
              onClick={() => {
                setActiveTab('shelters')
                setIsExpanded(true)
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'shelters' && isExpanded
                  ? 'bg-salvus-text-primary text-salvus-bg shadow-xs'
                  : 'text-salvus-text-secondary hover:text-salvus-text-primary'
              }`}
            >
              <Home className="h-3 w-3" />
              <span>Shelters ({liveShelters.length})</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'hazards'}
              onClick={() => {
                setActiveTab('hazards')
                setIsExpanded(true)
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'hazards' && isExpanded
                  ? 'bg-salvus-text-primary text-salvus-bg shadow-xs'
                  : 'text-salvus-text-secondary hover:text-salvus-text-primary'
              }`}
            >
              <CloudLightning className="h-3 w-3" />
              <span>Hazards ({liveHazards.length})</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'briefing'}
              onClick={() => {
                setActiveTab('briefing')
                setIsExpanded(true)
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'briefing' && isExpanded
                  ? 'bg-salvus-text-primary text-salvus-bg shadow-xs'
                  : 'text-salvus-text-secondary hover:text-salvus-text-primary'
              }`}
            >
              <FileText className="h-3 w-3" />
              <span>Briefing</span>
            </button>
          </div>

          {onSyncAll && (
            <Button
              variant="quiet"
              size="sm"
              onClick={onSyncAll}
              className="text-xs"
              title="Refresh all operational feeds"
            >
              ↻ Sync
            </Button>
          )}
        </div>
      </div>

      {/* Collapsible Content Area */}
      {isExpanded && (
        <div className="animate-fadeIn pt-1">
          {/* TAB 1: Fleet */}
          {activeTab === 'fleet' && (
            <ErrorBoundary componentName="Fleet Resource Panel" variant="card">
              <ResponderPanel
                filteredFleet={filteredFleet}
                isLoadingFleet={isLoadingFleet}
                fleetCapabilityFilter={fleetCapabilityFilter}
                fleetStatusFilter={fleetStatusFilter}
                selectedResponderDetail={selectedResponderDetail}
                selectedIncident={selectedIncident}
                onCapabilityFilterChange={onCapabilityFilterChange}
                onStatusFilterChange={onStatusFilterChange}
                onSelectResponderDetail={onSelectResponderDetail}
                onCloseResponderDetail={onCloseResponderDetail}
                onSelectCandidateRoute={onSelectCandidateRoute}
                onUpdateResponderStatus={onUpdateResponderStatus}
              />
            </ErrorBoundary>
          )}

          {/* TAB 2: Shelters */}
          {activeTab === 'shelters' && (
            <ErrorBoundary componentName="Shelters & Evacuation Panel" variant="card">
              <ShelterPanel
                liveShelters={liveShelters}
                liveHazards={liveHazards}
                onAdjustBeds={onAdjustBeds}
              />
            </ErrorBoundary>
          )}

          {/* TAB 3: Hazards & Regional Clusters */}
          {activeTab === 'hazards' && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Active Hazards */}
                <div className="bg-salvus-muted/30 border border-salvus-border p-3 rounded-xl space-y-2">
                  <div className="flex items-center justify-between pb-1 border-b border-salvus-border">
                    <span className="font-bold text-salvus-text-primary uppercase tracking-wider text-[11px]">
                      Active Weather & Disaster Hazards ({liveHazards.length})
                    </span>
                    <Badge variant="warning" size="sm">
                      Multi-Source Ingestion
                    </Badge>
                  </div>
                  {liveHazards.length === 0 ? (
                    <p className="text-salvus-text-muted py-6 text-center">
                      No active severe weather or disaster hazard bulletins in monitored sectors.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {liveHazards.map((hz) => (
                        <div
                          key={hz.id}
                          className="bg-salvus-surface border border-salvus-border p-2.5 rounded-lg space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <strong className="text-salvus-text-primary font-bold">
                              {hz.name || hz.title || 'Hazard Warning'}
                            </strong>
                            <Badge
                              variant={
                                hz.severity === 'CRITICAL'
                                  ? 'critical'
                                  : hz.severity === 'WARNING'
                                    ? 'warning'
                                    : 'info'
                              }
                              size="sm"
                            >
                              {hz.severity}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-salvus-text-secondary">
                            {hz.description || hz.event_type}
                          </p>
                          <div className="flex justify-between text-[10px] text-salvus-text-muted font-mono pt-1 border-t border-salvus-border">
                            <span>
                              📍 {hz.latitude?.toFixed(3)}°N, {hz.longitude?.toFixed(3)}°E
                            </span>
                            <span>Radius: {hz.affected_radius_km || 2.5} km</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Spatial DBSCAN Clusters */}
                <div className="bg-salvus-muted/30 border border-salvus-border p-3 rounded-xl space-y-2">
                  <div className="flex items-center justify-between pb-1 border-b border-salvus-border">
                    <span className="font-bold text-salvus-text-primary uppercase tracking-wider text-[11px]">
                      Spatial Incident Clusters ({incidentClusters.length})
                    </span>
                    <Badge variant="info" size="sm">
                      DBSCAN Spatial Analysis
                    </Badge>
                  </div>
                  {incidentClusters.length === 0 ? (
                    <p className="text-salvus-text-muted py-6 text-center">
                      Zero high-density spatial incident clusters currently detected on grid.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {incidentClusters.map((cl, idx) => (
                        <div
                          key={cl.cluster_id || idx}
                          className="bg-salvus-surface border border-salvus-border p-2.5 rounded-lg space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <strong className="text-salvus-text-primary font-bold">
                              Cluster #{cl.cluster_id || idx + 1}:{' '}
                              {cl.primary_hazard_type || 'Mixed Distress'}
                            </strong>
                            <Badge variant="warning" size="sm">
                              {cl.incident_count} Incidents
                            </Badge>
                          </div>
                          <p className="text-[11px] text-salvus-text-secondary">
                            Risk Level:{' '}
                            <strong className="text-salvus-critical uppercase">
                              {cl.risk_level || 'HIGH'}
                            </strong>{' '}
                            · Spread Radius:{' '}
                            {cl.radius_meters
                              ? `${(cl.radius_meters / 1000).toFixed(1)} km`
                              : 'Dense'}
                          </p>
                          <div className="flex justify-between text-[10px] text-salvus-text-muted font-mono pt-1 border-t border-salvus-border">
                            <span>
                              Center: {cl.center_lat?.toFixed(3)}°N, {cl.center_lng?.toFixed(3)}°E
                            </span>
                            <span>{cl.active_sos_count || 0} SOS in cluster</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Situation Briefing */}
          {activeTab === 'briefing' && (
            <div className="bg-salvus-muted/20 border border-salvus-border p-4 rounded-xl space-y-3 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-salvus-border">
                <div className="flex items-center gap-2">
                  <Badge variant="info" dot={true}>
                    AI DECISION INTELLIGENCE BRIEFING
                  </Badge>
                  <span className="text-[11px] text-salvus-text-muted">
                    Grounded in multi-source regional feeds
                  </span>
                </div>
                {onRefreshSituation && (
                  <Button
                    variant="quiet"
                    size="sm"
                    disabled={isRefreshingSituation}
                    onClick={onRefreshSituation}
                    leftIcon={
                      <RefreshCw
                        className={`h-3 w-3 ${isRefreshingSituation ? 'animate-spin text-salvus-info' : ''}`}
                      />
                    }
                    className="text-xs"
                  >
                    {isRefreshingSituation ? 'Refreshing...' : 'Refresh Intelligence'}
                  </Button>
                )}
              </div>

              <div className="bg-salvus-surface p-3.5 rounded-lg border border-salvus-border space-y-2">
                <span className="text-[10px] font-bold text-salvus-text-muted uppercase tracking-wider block">
                  Executive Operations Briefing
                </span>
                <p className="text-salvus-text-primary text-sm leading-relaxed font-medium">
                  {briefingText}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <div className="p-2.5 bg-salvus-surface rounded-lg border border-salvus-border">
                  <span className="text-[10px] text-salvus-text-muted block uppercase">
                    Active Threats
                  </span>
                  <strong className="text-base font-bold text-salvus-critical font-mono mt-0.5 block">
                    {criticalCount}
                  </strong>
                </div>
                <div className="p-2.5 bg-salvus-surface rounded-lg border border-salvus-border">
                  <span className="text-[10px] text-salvus-text-muted block uppercase">
                    Total Incidents
                  </span>
                  <strong className="text-base font-bold text-salvus-text-primary font-mono mt-0.5 block">
                    {activeCount}
                  </strong>
                </div>
                <div className="p-2.5 bg-salvus-surface rounded-lg border border-salvus-border">
                  <span className="text-[10px] text-salvus-text-muted block uppercase">
                    Weather Hazards
                  </span>
                  <strong className="text-base font-bold text-salvus-warning font-mono mt-0.5 block">
                    {liveHazards.length}
                  </strong>
                </div>
                <div className="p-2.5 bg-salvus-surface rounded-lg border border-salvus-border">
                  <span className="text-[10px] text-salvus-text-muted block uppercase">
                    Incident Clusters
                  </span>
                  <strong className="text-base font-bold text-salvus-info font-mono mt-0.5 block">
                    {incidentClusters.length}
                  </strong>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

export default SupportingOperations
