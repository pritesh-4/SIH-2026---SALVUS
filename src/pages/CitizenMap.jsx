import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { citizenMapData } from '../data/citizen/map.mock'
import { SalvusLeafletMap } from '../components/common/SalvusLeafletMap'
import { SimulatedBadge } from '../components/common/SimulatedBadge'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { StatusIndicator } from '../components/ui/StatusIndicator'

const CITIZEN_SHELTERS = [
  {
    id: 'm1',
    name: 'Sector 12 Community Shelter',
    address: 'Block CF, Sector 12, Salt Lake',
    lat: 22.5726,
    lng: 88.3639,
    capacity: '140 / 200 beds free',
    distance: '350m (4 min walk)',
    type: 'shelter',
    category: 'Primary Safe Shelter',
    amenities: ['Emergency Power', 'Clean Water', 'Medical Aid', 'Warm Blankets'],
  },
  {
    id: 'm2',
    name: 'Salt Lake Stadium Evacuation Center',
    address: 'Stadium Complex Gate 3',
    lat: 22.568,
    lng: 88.406,
    capacity: '420 / 600 beds free',
    distance: '1.2 km (14 min walk)',
    type: 'shelter',
    category: 'High-Capacity Safe Shelter',
    amenities: ['Food Supplies', 'Medical Camp', 'Wheelchair Access', 'Helipad'],
  },
  {
    id: 'm3',
    name: 'Karunamoyee Terminus Medical Post',
    address: 'Central Park East, Salt Lake',
    lat: 22.5867,
    lng: 88.4178,
    capacity: 'Operational',
    distance: '850m (9 min walk)',
    type: 'medical',
    category: 'First-Aid & Medical Station',
    amenities: ['Ambulance Transfer', 'Oxygen Supplies', 'First Aid'],
  },
]

const CITIZEN_HAZARDS = [
  {
    id: 'hz-1',
    ticket_id: 'SV-1982',
    name: 'Sector 12 Underpass Flooding',
    type: 'flood',
    severity: 'CRITICAL',
    status: 'NEW',
    description: 'Submerged underpass with 1.4m standing floodwater. Avoid vehicular transit.',
    latitude: 22.5841,
    longitude: 88.412,
    distance: '620m North',
    recommendedAction: 'Use elevated northern bypass route. Do not attempt to cross on foot.',
  },
  {
    id: 'hz-2',
    ticket_id: 'SV-1910',
    name: 'Downed Power Wire Hazard',
    type: 'power_line',
    severity: 'HIGH',
    status: 'VERIFIED',
    description: 'Power wire down near water channel. Area isolated by emergency crew.',
    latitude: 22.565,
    longitude: 88.358,
    distance: '480m West',
    recommendedAction: 'Maintain minimum 50-meter clearance. Keep clear of standing water.',
  },
]

export const CitizenMap = () => {
  const navigate = useNavigate()
  const [activeFilter, setActiveFilter] = useState('all')
  const [selectedItem, setSelectedItem] = useState(CITIZEN_SHELTERS[0])
  const [activeRouteGuide, setActiveRouteGuide] = useState(null)

  const { userLocation } = citizenMapData

  const displayedIncidents = useMemo(() => {
    if (activeFilter === 'shelters' || activeFilter === 'medical') return []
    return CITIZEN_HAZARDS
  }, [activeFilter])

  const displayedShelters = useMemo(() => {
    if (activeFilter === 'hazards') return []
    if (activeFilter === 'medical') return CITIZEN_SHELTERS.filter((s) => s.type === 'medical')
    if (activeFilter === 'shelters') return CITIZEN_SHELTERS.filter((s) => s.type === 'shelter')
    return CITIZEN_SHELTERS
  }, [activeFilter])

  return (
    <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-8 lg:px-12 py-6 sm:py-8 animate-fadeIn">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-salvus-text-secondary">
              Area Navigation
            </span>
            <span className="h-1 w-1 rounded-full bg-salvus-border-strong"></span>
            <span className="text-xs text-salvus-info">{userLocation.address}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-salvus-text-primary tracking-tight mt-0.5">
            Local Safe Places & Hazards
          </h1>
        </div>

        <StatusIndicator status="safe" label="Area Monitored Live" showDot={true} />
      </div>

      {/* Layer Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-4 no-scrollbar">
        {[
          { id: 'all', label: 'All places', count: 5 },
          { id: 'shelters', label: 'Safe shelters', count: 2 },
          { id: 'hazards', label: 'Hazards & Floods', count: 2 },
          { id: 'medical', label: 'Medical aid', count: 1 },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setActiveFilter(f.id)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              activeFilter === f.id
                ? 'bg-salvus-text-primary text-salvus-bg shadow-xs'
                : 'bg-salvus-surface border border-salvus-border text-salvus-text-secondary hover:text-salvus-text-primary'
            }`}
          >
            <span>{f.label}</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeFilter === f.id
                  ? 'bg-salvus-bg/20 text-salvus-bg'
                  : 'bg-salvus-muted text-salvus-text-muted'
              }`}
            >
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* Map Layout Grid: Left Canvas (7 cols), Right Detail Sheet (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Map Surface (7 cols) */}
        <Card
          padding="sm"
          className="lg:col-span-7 flex flex-col justify-between relative overflow-hidden min-h-[440px] sm:min-h-[520px]"
        >
          {/* Map Top Status Bar */}
          <div className="flex items-center justify-between z-10 bg-salvus-surface/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-salvus-border text-xs mb-3">
            <div className="flex items-center gap-2 font-medium text-salvus-text-primary">
              <span className="h-2.5 w-2.5 rounded-full bg-salvus-info shrink-0"></span>
              <span>Your location: Sector 12, Salt Lake</span>
            </div>
            <span className="text-salvus-text-muted text-xs">GPS accuracy: ±4m</span>
          </div>

          {/* Real Leaflet Map Surface */}
          <div className="relative w-full h-[380px] rounded-xl border border-salvus-border overflow-hidden">
            <SalvusLeafletMap
              center={[22.5726, 88.3639]}
              zoom={14}
              userLocation={{
                latitude: 22.5726,
                longitude: 88.3639,
                address: userLocation.address,
                coordinates: userLocation.coordinates,
                accuracy: 'High Precision (±4m)',
                accuracyM: 15,
              }}
              incidents={displayedIncidents}
              shelters={displayedShelters}
              showLayers={{
                incidents: activeFilter !== 'shelters' && activeFilter !== 'medical',
                shelters: activeFilter !== 'hazards',
                responders: false,
              }}
              onSelectIncident={(inc) => setSelectedItem(inc)}
              className="h-full w-full"
            />
          </div>

          {/* Map Footer Legend */}
          <div className="mt-3 bg-salvus-surface px-3.5 py-2 rounded-xl border border-salvus-border flex items-center justify-between text-xs text-salvus-text-secondary flex-wrap gap-2">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5 font-medium">
                <span className="h-2.5 w-2.5 rounded-full bg-salvus-info"></span>
                <span>You</span>
              </div>
              <div className="flex items-center gap-1.5 font-medium">
                <span className="h-2.5 w-2.5 rounded-full bg-salvus-safe"></span>
                <span>Safe Place ({displayedShelters.length})</span>
              </div>
              <div className="flex items-center gap-1.5 font-medium">
                <span className="h-2.5 w-2.5 rounded-full bg-salvus-critical"></span>
                <span>Hazard ({displayedIncidents.length})</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedItem(CITIZEN_SHELTERS[0])}
              className="text-salvus-info hover:underline font-semibold cursor-pointer text-xs"
            >
              Reset view
            </button>
          </div>
        </Card>

        {/* Marker Detail Sheet / Side Card (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {selectedItem ? (
            <Card
              padding="md"
              className="flex flex-col justify-between min-h-[440px] transition-all"
            >
              <div>
                {/* Header Tag & Distance */}
                <div className="flex items-center justify-between gap-3 mb-3">
                  <Badge
                    variant={
                      selectedItem.type === 'shelter'
                        ? 'safe'
                        : selectedItem.type === 'medical'
                          ? 'info'
                          : 'critical'
                    }
                  >
                    {selectedItem.category || selectedItem.type}
                  </Badge>
                  <span className="text-xs font-semibold text-salvus-text-primary bg-salvus-muted px-2.5 py-1 rounded-lg border border-salvus-border">
                    {selectedItem.distance || 'Near Sector 12'}
                  </span>
                </div>

                {/* Title & Address */}
                <h2 className="text-xl font-bold text-salvus-text-primary tracking-tight">
                  {selectedItem.name || `Hazard #${selectedItem.ticket_id}`}
                </h2>
                <p className="text-xs text-salvus-text-secondary mt-1">
                  {selectedItem.address || selectedItem.description}
                </p>

                {/* Shelter-Specific Details */}
                {selectedItem.type === 'shelter' && (
                  <div className="mt-5 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-salvus-muted/40 border border-salvus-border p-3 rounded-xl">
                        <span className="text-[11px] text-salvus-text-muted block font-medium">
                          Capacity
                        </span>
                        <span className="text-sm font-bold text-salvus-safe">
                          {selectedItem.capacity}
                        </span>
                      </div>
                      <div className="bg-salvus-muted/40 border border-salvus-border p-3 rounded-xl">
                        <span className="text-[11px] text-salvus-text-muted block font-medium">
                          Area Sector
                        </span>
                        <span className="text-sm font-bold text-salvus-text-primary">
                          Sector 12, Salt Lake
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="text-xs font-bold text-salvus-text-primary block mb-2">
                        Available Resources:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedItem.amenities?.map((a) => (
                          <span
                            key={a}
                            className="bg-salvus-surface-elevated border border-salvus-border text-salvus-text-secondary text-xs px-2.5 py-1 rounded-lg font-medium"
                          >
                            ✓ {a}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Hazard-Specific Details */}
                {(selectedItem.type === 'flood' ||
                  selectedItem.type === 'power_line' ||
                  selectedItem.type === 'hazard') && (
                  <div className="mt-5 space-y-4">
                    <div className="bg-salvus-critical-bg border border-salvus-critical-border p-4 rounded-xl">
                      <div className="flex items-center gap-2 text-salvus-critical font-bold text-xs mb-1">
                        <span>⚠️ HAZARD WARNING</span>
                      </div>
                      <p className="text-xs text-salvus-critical font-medium leading-relaxed">
                        {selectedItem.description}
                      </p>
                    </div>

                    <div className="bg-salvus-muted/40 border border-salvus-border p-3.5 rounded-xl">
                      <span className="text-xs font-bold text-salvus-text-primary uppercase block mb-1">
                        What To Do
                      </span>
                      <p className="text-xs text-salvus-text-secondary leading-relaxed">
                        {selectedItem.recommendedAction ||
                          'Keep clear of the affected area. Follow safe elevated bypass.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Medical Post Details */}
                {selectedItem.type === 'medical' && (
                  <div className="mt-5 space-y-3">
                    <div className="bg-salvus-muted/40 border border-salvus-border p-3 rounded-xl">
                      <span className="text-[11px] text-salvus-text-muted font-semibold block">
                        Operating Status
                      </span>
                      <span className="text-xs font-bold text-salvus-safe">
                        {selectedItem.capacity || 'Active & Open'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedItem.amenities?.map((a) => (
                        <span
                          key={a}
                          className="bg-salvus-surface-elevated border border-salvus-border text-salvus-text-secondary text-xs px-2.5 py-1 rounded-lg font-medium"
                        >
                          + {a}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-6 pt-4 border-t border-salvus-border flex flex-col sm:flex-row gap-3">
                {selectedItem.type === 'shelter' && (
                  <Button
                    variant="safe"
                    size="lg"
                    fullWidth={true}
                    onClick={() => setActiveRouteGuide(selectedItem)}
                    className="font-bold text-xs sm:text-sm"
                  >
                    View Safe Walking Route
                  </Button>
                )}
                {(selectedItem.type === 'flood' || selectedItem.type === 'power_line') && (
                  <Button
                    variant="critical"
                    size="lg"
                    fullWidth={true}
                    onClick={() => navigate('/citizen/sos')}
                    className="font-bold text-xs sm:text-sm"
                  >
                    Request Emergency SOS
                  </Button>
                )}
                {selectedItem.type === 'medical' && (
                  <a
                    href="tel:112"
                    className="flex-1 py-3 px-4 rounded-xl bg-salvus-info hover:opacity-90 text-white font-bold text-xs tracking-wider uppercase transition-colors cursor-pointer text-center min-h-[48px] flex items-center justify-center"
                  >
                    Call Medical Dispatch (112)
                  </a>
                )}
              </div>
            </Card>
          ) : (
            <Card
              padding="lg"
              className="flex flex-col items-center justify-center text-center min-h-[440px]"
            >
              <span className="text-3xl mb-2" aria-hidden="true">
                📍
              </span>
              <h3 className="text-base font-bold text-salvus-text-primary">
                Tap any point on the map
              </h3>
              <p className="text-xs text-salvus-text-secondary mt-1 max-w-xs leading-relaxed">
                Select a safe shelter or active flood hazard to inspect real-time safety
                information.
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* Interactive Safe Route Guidance Modal */}
      {activeRouteGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="route-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setActiveRouteGuide(null)
            }
          }}
        >
          <div className="bg-salvus-surface border border-salvus-border rounded-2xl max-w-lg w-full p-6 sm:p-7 shadow-2xl relative text-salvus-text-primary">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Badge variant="safe" dot={true}>
                  Safe Route Guidance
                </Badge>
                <SimulatedBadge label="OFFLINE ROUTE" />
              </div>
              <button
                type="button"
                onClick={() => setActiveRouteGuide(null)}
                aria-label="Close route view"
                className="text-salvus-text-muted hover:text-salvus-text-primary text-base font-bold p-1 cursor-pointer select-none"
              >
                ✕
              </button>
            </div>

            <h3
              id="route-modal-title"
              className="text-xl font-extrabold text-salvus-text-primary tracking-tight"
            >
              Safe Route to {activeRouteGuide.name}
            </h3>
            <p className="text-xs sm:text-sm text-salvus-text-secondary mt-1">
              Distance:{' '}
              <strong className="text-salvus-text-primary">{activeRouteGuide.distance}</strong> ·
              Estimated Walk Time: <strong className="text-salvus-safe">4-6 mins</strong>
            </p>

            <div className="bg-salvus-muted/40 border border-salvus-border rounded-xl p-4 my-4 space-y-3">
              <div className="flex items-start gap-3 text-xs">
                <span className="h-5 w-5 rounded-full bg-salvus-safe-bg border border-salvus-safe-border text-salvus-safe font-bold text-[11px] flex items-center justify-center shrink-0">
                  1
                </span>
                <div>
                  <strong className="text-salvus-text-primary block">
                    Head East on Elevated Arterial Road
                  </strong>
                  <span className="text-salvus-text-secondary">
                    Paved high ground with zero water logging (+3.8m elevation).
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs">
                <span className="h-5 w-5 rounded-full bg-salvus-safe-bg border border-salvus-safe-border text-salvus-safe font-bold text-[11px] flex items-center justify-center shrink-0">
                  2
                </span>
                <div>
                  <strong className="text-salvus-text-primary block">
                    Bypass Sector 12 Underpass
                  </strong>
                  <span className="text-salvus-critical">
                    Hazard avoidance: underpass submerged by 1.4m floodwater.
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs">
                <span className="h-5 w-5 rounded-full bg-salvus-safe-bg border border-salvus-safe-border text-salvus-safe font-bold text-[11px] flex items-center justify-center shrink-0">
                  3
                </span>
                <div>
                  <strong className="text-salvus-text-primary block">
                    Enter Shelter Reception Gate
                  </strong>
                  <span className="text-salvus-text-secondary">
                    Emergency triage and bed intake station open.
                  </span>
                </div>
              </div>
            </div>

            <Button
              variant="safe"
              size="lg"
              fullWidth={true}
              onClick={() => setActiveRouteGuide(null)}
              className="font-bold text-xs sm:text-sm"
            >
              Close Safe Route View
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default CitizenMap
