import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { citizenMapData } from '../data/citizen/map.mock'
import { SalvusLeafletMap } from '../components/common/SalvusLeafletMap'
import { SimulatedBadge } from '../components/common/SimulatedBadge'

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
    category: 'Primary Evacuation Shelter',
    amenities: ['Emergency Power', 'Potable Water', 'Medical Triage', 'Dry Blankets'],
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
    category: 'High-Capacity Regional Shelter',
    amenities: ['Food Supplies', 'SDRF Camp', 'Stretcher Access', 'Helipad'],
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
    category: 'First-Aid & Trauma Station',
    amenities: ['Ambulance Transfer', 'Oxygen Supplies', 'Trauma Dressing'],
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
    name: 'Downed High-Voltage Line',
    type: 'power_line',
    severity: 'HIGH',
    status: 'VERIFIED',
    description: '11kV feeder wire dangling near water channel. Feeder trip initiated.',
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

  const { userLocation, summary } = citizenMapData

  const displayedIncidents = useMemo(() => {
    if (activeFilter === 'shelters') return []
    return CITIZEN_HAZARDS
  }, [activeFilter])

  const displayedShelters = useMemo(() => {
    if (activeFilter === 'hazards') return []
    return CITIZEN_SHELTERS
  }, [activeFilter])

  return (
    <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-8 lg:px-12 py-6 sm:py-8 animate-fadeIn">
      {/* Top Header & Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-widest text-slate-400 uppercase">
              SITUATIONAL AWARENESS
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-slate-600"></span>
            <span className="text-xs font-mono text-cyan-400">{userLocation.address}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
            Local Situational Map
          </h1>
        </div>

        {/* Quick Safety Summary Pill */}
        <div className="flex items-center gap-3 bg-[#111A24] border border-[#1E293B] px-4 py-2.5 rounded-xl">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse"></span>
            <span className="text-xs font-semibold text-amber-300">{summary.statusText}</span>
          </div>
        </div>
      </div>

      {/* Layer Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-4 no-scrollbar">
        {[
          { id: 'all', label: 'All Markers', count: 5 },
          { id: 'shelters', label: 'Safe Shelters', count: 2 },
          { id: 'hazards', label: 'Active Hazards', count: 2 },
          { id: 'medical', label: 'Medical Stations', count: 1 },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setActiveFilter(f.id)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              activeFilter === f.id
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'bg-[#111A24] border border-[#1E293B] text-slate-300 hover:text-white'
            }`}
          >
            <span>{f.label}</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                activeFilter === f.id
                  ? 'bg-slate-950/30 text-slate-900 font-bold'
                  : 'bg-[#1E293B] text-slate-400'
              }`}
            >
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* Map Layout Grid: Left Canvas (7 cols), Right Detail Sheet (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* OpenStreetMap Surface (7 cols) */}
        <div className="lg:col-span-7 bg-[#111A24] border border-[#1E293B] rounded-2xl p-4 sm:p-6 flex flex-col justify-between relative overflow-hidden min-h-[440px] sm:min-h-[520px]">
          {/* Map Top Status Bar */}
          <div className="flex items-center justify-between z-10 bg-[#0B1118]/85 backdrop-blur-md px-3.5 py-2 rounded-lg border border-[#1E293B] text-xs mb-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span className="font-semibold text-slate-200">GPS Radar Sync: Active</span>
            </div>
            <span className="font-mono text-slate-400 text-[11px]">{userLocation.coordinates}</span>
          </div>

          {/* Real Leaflet Map Surface */}
          <div className="relative w-full h-[380px] rounded-xl border border-[#162230] overflow-hidden">
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
                incidents: activeFilter !== 'shelters',
                shelters: activeFilter !== 'hazards',
                responders: false,
              }}
              onSelectIncident={(inc) => setSelectedItem(inc)}
              className="h-full w-full"
            />
          </div>

          {/* Map Footer Legend */}
          <div className="mt-3 bg-[#0B1118]/90 px-3 py-2 rounded-lg border border-[#1E293B] flex items-center justify-between text-[11px] text-slate-400 flex-wrap gap-2">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-cyan-400"></span>
                <span>You (Sector 12)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
                <span>Shelters ({displayedShelters.length})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500"></span>
                <span>Hazards ({displayedIncidents.length})</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedItem(CITIZEN_SHELTERS[0])}
              className="text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer"
            >
              Reset View
            </button>
          </div>
        </div>

        {/* Marker Detail Sheet / Side Card (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {selectedItem ? (
            <div className="bg-[#111A24] border border-[#1E293B] rounded-2xl p-6 flex flex-col justify-between min-h-[440px] transition-all">
              <div>
                {/* Header Tag & Distance */}
                <div className="flex items-center justify-between gap-3 mb-3">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase border ${
                      selectedItem.type === 'shelter'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                        : selectedItem.type === 'medical'
                          ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-400'
                          : 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                    }`}
                  >
                    {selectedItem.category || selectedItem.type}
                  </span>
                  <span className="text-xs font-mono font-bold text-white bg-[#0B1118] px-2.5 py-1 rounded-lg border border-[#1E293B]">
                    {selectedItem.distance || 'Near Sector 12'}
                  </span>
                </div>

                {/* Title & Address */}
                <h2 className="text-xl font-bold text-white tracking-tight">
                  {selectedItem.name || `Incident #${selectedItem.ticket_id}`}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {selectedItem.address || selectedItem.description}
                </p>

                {/* Shelter-Specific Details */}
                {selectedItem.type === 'shelter' && (
                  <div className="mt-5 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-[#0B1118] border border-[#1E293B] p-3 rounded-xl">
                        <span className="text-[10px] text-slate-400 block uppercase font-semibold">
                          Capacity
                        </span>
                        <span className="text-sm font-bold text-emerald-400">
                          {selectedItem.capacity}
                        </span>
                      </div>
                      <div className="bg-[#0B1118] border border-[#1E293B] p-3 rounded-xl">
                        <span className="text-[10px] text-slate-400 block uppercase font-semibold">
                          Assembly Sector
                        </span>
                        <span className="text-sm font-bold text-white">Sector 12 / Salt Lake</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-xs font-bold text-slate-300 block mb-2">
                        Available Resources:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedItem.amenities?.map((a) => (
                          <span
                            key={a}
                            className="bg-[#1E293B] text-slate-200 text-xs px-2.5 py-1 rounded-lg font-medium"
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
                    <div className="bg-rose-950/30 border border-rose-500/40 p-4 rounded-xl">
                      <div className="flex items-center gap-2 text-rose-300 font-bold text-xs mb-1">
                        <span>⚠️ CRITICAL RISK FACTOR</span>
                      </div>
                      <p className="text-xs text-rose-200 font-medium">
                        {selectedItem.description}
                      </p>
                    </div>

                    <div className="bg-[#0B1118] border border-[#1E293B] p-4 rounded-xl">
                      <span className="text-[11px] font-bold text-slate-300 uppercase block mb-1">
                        Recommended Action
                      </span>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {selectedItem.recommendedAction ||
                          'Keep clear of the affected perimeter. Await responder dispatch.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Medical Post Details */}
                {selectedItem.type === 'medical' && (
                  <div className="mt-5 space-y-3">
                    <div className="bg-[#0B1118] border border-[#1E293B] p-3 rounded-xl">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Operating Status
                      </span>
                      <span className="text-xs font-bold text-emerald-400">
                        {selectedItem.capacity || 'Active'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedItem.amenities?.map((a) => (
                        <span
                          key={a}
                          className="bg-[#1E293B] text-slate-200 text-xs px-2.5 py-1 rounded-lg font-medium"
                        >
                          + {a}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-6 pt-4 border-t border-[#1E293B] flex flex-col sm:flex-row gap-3">
                {selectedItem.type === 'shelter' && (
                  <button
                    type="button"
                    onClick={() => setActiveRouteGuide(selectedItem)}
                    className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wider uppercase transition-colors cursor-pointer text-center shadow-lg shadow-emerald-950/40"
                  >
                    View Safe Bypass Route
                  </button>
                )}
                {(selectedItem.type === 'flood' || selectedItem.type === 'power_line') && (
                  <button
                    type="button"
                    onClick={() => navigate('/citizen/sos')}
                    className="flex-1 py-3 px-4 rounded-xl bg-[#EF4444] hover:bg-rose-600 text-white font-bold text-xs tracking-wider uppercase transition-colors cursor-pointer text-center shadow-lg shadow-rose-950/40"
                  >
                    Request Evacuation SOS
                  </button>
                )}
                {selectedItem.type === 'medical' && (
                  <a
                    href="tel:112"
                    className="flex-1 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs tracking-wider uppercase transition-colors cursor-pointer text-center"
                  >
                    Call Medical Dispatch (112)
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-[#111A24] border border-[#1E293B] rounded-2xl p-8 flex flex-col items-center justify-center text-center min-h-[440px]">
              <span className="text-3xl mb-2">📍</span>
              <h3 className="text-base font-bold text-white">Tap any point on the map</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                Select a safe shelter or active flood hazard to inspect real-time safety telemetry.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Safe Route Guidance Modal */}
      {activeRouteGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="route-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
        >
          <div className="bg-[#111A24] border border-emerald-500/40 rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider font-mono">
                  Offline Flood-Bypass Route Active
                </span>
                <SimulatedBadge label="OFFLINE ROUTING" />
              </div>
              <button
                type="button"
                onClick={() => setActiveRouteGuide(null)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <h3 id="route-modal-title" className="text-xl font-extrabold text-white tracking-tight">
              Safe Route to {activeRouteGuide.name}
            </h3>
            <p className="text-xs text-slate-300 mt-1">
              Distance: <strong className="text-white">{activeRouteGuide.distance}</strong> ·
              Estimated Walk Time: <strong className="text-emerald-400">4-6 mins</strong>
            </p>

            <div className="bg-[#0B1118] border border-[#1E293B] rounded-xl p-4 my-4 space-y-3">
              <div className="flex items-start gap-3 text-xs text-slate-300">
                <span className="h-5 w-5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[11px] flex items-center justify-center shrink-0">
                  1
                </span>
                <div>
                  <strong className="text-white block">Head East on Elevated Arterial Rd</strong>
                  <span className="text-slate-400">
                    Paved high ground with zero water logging (+3.8m elevation).
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs text-slate-300">
                <span className="h-5 w-5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[11px] flex items-center justify-center shrink-0">
                  2
                </span>
                <div>
                  <strong className="text-white block">Bypass Sector 12 Underpass</strong>
                  <span className="text-rose-400">
                    Hazard avoidance: underpass submerged by 1.4m floodwater.
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs text-slate-300">
                <span className="h-5 w-5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[11px] flex items-center justify-center shrink-0">
                  3
                </span>
                <div>
                  <strong className="text-white block">Enter Shelter Reception Gate</strong>
                  <span className="text-slate-400">
                    Emergency medical triage and bed intake station active.
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setActiveRouteGuide(null)}
                className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer text-center"
              >
                Close Safe Route View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CitizenMap
