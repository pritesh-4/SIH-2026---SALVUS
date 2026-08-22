import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { citizenMapData } from '../data/citizen/map.mock'

export const CitizenMap = () => {
  const navigate = useNavigate()
  const [activeFilter, setActiveFilter] = useState('all')
  const [selectedMarker, setSelectedMarker] = useState(citizenMapData.markers[0]) // Default select nearest shelter
  const [activeRouteGuide, setActiveRouteGuide] = useState(null)

  const { userLocation, summary, filters, markers } = citizenMapData

  const filteredMarkers = markers.filter((m) => {
    if (activeFilter === 'all') return true
    if (activeFilter === 'shelters') return m.type === 'shelter'
    if (activeFilter === 'hazards') return m.type === 'hazard'
    if (activeFilter === 'medical') return m.type === 'medical'
    return true
  })

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
            Local Emergency Map
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
        {filters.map((f) => (
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
        {/* Map Canvas (7 cols) */}
        <div className="lg:col-span-7 bg-[#111A24] border border-[#1E293B] rounded-2xl p-4 sm:p-6 flex flex-col justify-between relative overflow-hidden min-h-[440px] sm:min-h-[500px]">
          {/* Map Top Status Bar */}
          <div className="flex items-center justify-between z-10 bg-[#0B1118]/80 backdrop-blur-md px-3 py-2 rounded-lg border border-[#1E293B] text-xs">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span className="font-semibold text-slate-200">GPS Radar Sync: Active</span>
            </div>
            <span className="font-mono text-slate-400 text-[11px]">{userLocation.coordinates}</span>
          </div>

          {/* Interactive Geospatial Radar Area */}
          <div className="absolute inset-0 m-4 sm:m-6 top-16 bottom-14 rounded-xl bg-[#080D13] border border-[#162230] overflow-hidden">
            {/* Grid Mesh Lines */}
            <div className="absolute inset-0 flex flex-col justify-between py-6 px-4 pointer-events-none opacity-25">
              <div className="w-full h-px bg-cyan-500/40"></div>
              <div className="w-full h-px bg-cyan-500/40"></div>
              <div className="w-full h-px bg-cyan-500/40"></div>
              <div className="w-full h-px bg-cyan-500/40"></div>
            </div>
            <div className="absolute inset-0 flex justify-between px-6 pointer-events-none opacity-25">
              <div className="h-full w-px bg-cyan-500/40"></div>
              <div className="h-full w-px bg-cyan-500/40"></div>
              <div className="h-full w-px bg-cyan-500/40"></div>
            </div>

            {/* Concentric Radar Rings */}
            <div className="absolute left-[38%] top-[35%] -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full border border-blue-500/10 pointer-events-none"></div>
            <div className="absolute left-[38%] top-[35%] -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full border border-blue-500/10 pointer-events-none"></div>

            {/* Hazard Zones (Translucent boundaries) */}
            {filteredMarkers
              .filter((m) => m.type === 'hazard')
              .map((h) => (
                <div
                  key={h.id}
                  onClick={() => setSelectedMarker(h)}
                  className="absolute rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center cursor-pointer transition-all hover:bg-rose-500/30 group"
                  style={{
                    left: `${h.pos.x}%`,
                    top: `${h.pos.y}%`,
                    width: `${(h.radius || 24) * 2}px`,
                    height: `${(h.radius || 24) * 2}px`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  title={h.name}
                >
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500 group-hover:scale-125 transition-transform shadow-[0_0_8px_#EF4444]"></span>
                </div>
              ))}

            {/* User Marker */}
            <div
              className="absolute z-20 flex flex-col items-center cursor-pointer group"
              style={{
                left: `${userLocation.pos.x}%`,
                top: `${userLocation.pos.y}%`,
                transform: 'translate(-50%, -50%)',
              }}
              title="Your Current Location"
            >
              <span className="relative flex h-5 w-5 items-center justify-center">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-[#3B82F6] border-2 border-white shadow-[0_0_12px_#3B82F6]"></span>
              </span>
              <span className="mt-1 text-[10px] font-bold bg-[#0B1118]/90 text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/30 shadow">
                YOU
              </span>
            </div>

            {/* Interactive Markers (Shelters, Hazards, Medical) */}
            {filteredMarkers.map((m) => {
              const isSelected = selectedMarker?.id === m.id
              const isShelter = m.type === 'shelter'
              const isHazard = m.type === 'hazard'

              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMarker(m)}
                  style={{
                    left: `${m.pos.x}%`,
                    top: `${m.pos.y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  className={`absolute z-20 flex flex-col items-center cursor-pointer transition-all duration-200 ${
                    isSelected ? 'scale-110 z-30' : 'hover:scale-105'
                  }`}
                >
                  <div
                    className={`h-7 w-7 rounded-xl flex items-center justify-center text-xs shadow-lg border transition-all ${
                      isShelter
                        ? 'bg-emerald-600/90 text-white border-emerald-400 shadow-emerald-950/60'
                        : isHazard
                          ? 'bg-rose-600/90 text-white border-rose-400 shadow-rose-950/60'
                          : 'bg-indigo-600/90 text-white border-indigo-400 shadow-indigo-950/60'
                    } ${isSelected ? 'ring-4 ring-cyan-400' : ''}`}
                  >
                    {isShelter ? '🏠' : isHazard ? '⚠️' : '🏥'}
                  </div>
                  <span
                    className={`mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap shadow ${
                      isSelected
                        ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-bold'
                        : 'bg-[#0B1118]/90 text-slate-300 border-[#1E293B]'
                    }`}
                  >
                    {m.name.split(' ')[0]}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Map Footer Legend */}
          <div className="z-10 bg-[#0B1118]/90 px-3 py-2 rounded-lg border border-[#1E293B] flex items-center justify-between text-[11px] text-slate-400">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#3B82F6]"></span>
                <span>You</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#10B981]"></span>
                <span>Shelters ({summary.nearbySheltersCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-500"></span>
                <span>Hazards ({summary.activeThreatsCount})</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedMarker(markers[0])}
              className="text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer"
            >
              Reset View
            </button>
          </div>
        </div>

        {/* Marker Detail Sheet / Side Card (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {selectedMarker ? (
            <div className="bg-[#111A24] border border-[#1E293B] rounded-2xl p-6 flex flex-col justify-between min-h-[440px] transition-all">
              <div>
                {/* Header Tag & Distance */}
                <div className="flex items-center justify-between gap-3 mb-3">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase border ${
                      selectedMarker.type === 'shelter'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                        : selectedMarker.type === 'hazard'
                          ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                          : 'bg-indigo-500/15 border-indigo-500/40 text-indigo-400'
                    }`}
                  >
                    {selectedMarker.category}
                  </span>
                  <span className="text-xs font-mono font-bold text-white bg-[#0B1118] px-2.5 py-1 rounded-lg border border-[#1E293B]">
                    {selectedMarker.distance}
                  </span>
                </div>

                {/* Title & Address */}
                <h2 className="text-xl font-bold text-white tracking-tight">
                  {selectedMarker.name}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {selectedMarker.address || selectedMarker.riskDetails}
                </p>

                {/* Shelter-Specific Details */}
                {selectedMarker.type === 'shelter' && (
                  <div className="mt-5 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-[#0B1118] border border-[#1E293B] p-3 rounded-xl">
                        <span className="text-[10px] text-slate-400 block uppercase font-semibold">
                          Capacity
                        </span>
                        <span className="text-sm font-bold text-emerald-400">
                          {selectedMarker.capacity}
                        </span>
                      </div>
                      <div className="bg-[#0B1118] border border-[#1E293B] p-3 rounded-xl">
                        <span className="text-[10px] text-slate-400 block uppercase font-semibold">
                          Available Beds
                        </span>
                        <span className="text-sm font-bold text-white">
                          {selectedMarker.availableBeds} beds
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="text-xs font-bold text-slate-300 block mb-2">
                        Available Resources:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedMarker.amenities?.map((a) => (
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
                {selectedMarker.type === 'hazard' && (
                  <div className="mt-5 space-y-4">
                    <div className="bg-rose-950/30 border border-rose-500/40 p-4 rounded-xl">
                      <div className="flex items-center gap-2 text-rose-300 font-bold text-xs mb-1">
                        <span>⚠️ CRITICAL RISK FACTOR</span>
                      </div>
                      <p className="text-xs text-rose-200 font-medium">
                        {selectedMarker.waterDepth || selectedMarker.riskDetails}
                      </p>
                    </div>

                    <div className="bg-[#0B1118] border border-[#1E293B] p-4 rounded-xl">
                      <span className="text-[11px] font-bold text-slate-300 uppercase block mb-1">
                        Recommended Action
                      </span>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {selectedMarker.recommendedAction}
                      </p>
                    </div>
                  </div>
                )}

                {/* Medical Post Details */}
                {selectedMarker.type === 'medical' && (
                  <div className="mt-5 space-y-3">
                    <div className="bg-[#0B1118] border border-[#1E293B] p-3 rounded-xl">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Operating Status
                      </span>
                      <span className="text-xs font-bold text-emerald-400">
                        {selectedMarker.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedMarker.amenities?.map((a) => (
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
                {selectedMarker.type === 'shelter' && (
                  <button
                    type="button"
                    onClick={() => setActiveRouteGuide(selectedMarker)}
                    className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wider uppercase transition-colors cursor-pointer text-center shadow-lg shadow-emerald-950/40"
                  >
                    Navigate to Shelter ({selectedMarker.eta})
                  </button>
                )}
                {selectedMarker.type === 'hazard' && (
                  <button
                    type="button"
                    onClick={() => navigate('/citizen/sos')}
                    className="flex-1 py-3 px-4 rounded-xl bg-[#EF4444] hover:bg-rose-600 text-white font-bold text-xs tracking-wider uppercase transition-colors cursor-pointer text-center shadow-lg shadow-rose-950/40"
                  >
                    Request Evacuation SOS
                  </button>
                )}
                {selectedMarker.type === 'medical' && (
                  <a
                    href="tel:112"
                    className="flex-1 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs tracking-wider uppercase transition-colors cursor-pointer text-center"
                  >
                    Call Medical Dispatch
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-[#111A24] border border-[#1E293B] rounded-2xl p-8 flex flex-col items-center justify-center text-center min-h-[440px]">
              <span className="text-3xl mb-2">📍</span>
              <h3 className="text-base font-bold text-white">Tap any point on the radar</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                Select a safe shelter or active flood threat to inspect real-time safety status.
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
              Estimated Walk Time:{' '}
              <strong className="text-emerald-400">{activeRouteGuide.eta}</strong>
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
                  <strong className="text-white block">Enter Shelter West Reception Gate</strong>
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
