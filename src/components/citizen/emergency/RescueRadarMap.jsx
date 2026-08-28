export const RescueRadarMap = ({
  currentState = 'SOS_ACTIVE',
  responderPos = { x: 22, y: 76 },
  userLocation = {
    address: 'Sector 12, Salt Lake, Kolkata',
    coordinates: '22.5726° N, 88.3639° E',
  },
  responder = {},
  distanceText = '1.8 km',
  etaMinutes = 7,
}) => {
  const isAssignedOrEnRoute = ['ASSIGNED', 'EN_ROUTE', 'NEARBY', 'ON_SCENE', 'RESOLVED'].includes(
    currentState
  )
  const isNearbyOrScene = ['NEARBY', 'ON_SCENE', 'RESOLVED'].includes(currentState)
  const isOnScene = ['ON_SCENE', 'RESOLVED'].includes(currentState)

  // Waypoints for the route line
  const citizenPos = { x: 68, y: 34 }
  const stagingPos = { x: 22, y: 76 }

  return (
    <div className="bg-salvus-surface border border-salvus-border rounded-2xl p-4 sm:p-5 flex flex-col justify-between relative overflow-hidden transition-all duration-300 shadow-sm">
      {/* Top Map Status Bar */}
      <div className="flex items-center justify-between z-10 bg-salvus-surface-elevated/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-salvus-border text-xs mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              isOnScene
                ? 'bg-salvus-safe'
                : isNearbyOrScene
                  ? 'bg-salvus-warning animate-ping'
                  : isAssignedOrEnRoute
                    ? 'bg-salvus-info animate-pulse'
                    : 'bg-salvus-critical animate-ping'
            }`}
          ></span>
          <span className="font-bold text-salvus-text-primary tracking-wide text-xs">
            {isOnScene
              ? 'Rescue Team is at your location'
              : isNearbyOrScene
                ? 'Rescue Team is on your street (<100m)'
                : isAssignedOrEnRoute
                  ? `Rescue Team is on the way (${distanceText})`
                  : 'Emergency Request Transmitted'}
          </span>
        </div>

        <div className="flex items-center gap-2 font-medium text-xs text-salvus-text-muted">
          <span>{userLocation.address || 'Sector 12'}</span>
        </div>
      </div>

      {/* Interactive Tactical Radar Viewport */}
      <div className="relative w-full h-[260px] sm:h-[300px] rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
        {/* Vector Grid Lines */}
        <div className="absolute inset-0 flex flex-col justify-between py-6 px-4 pointer-events-none opacity-20">
          <div className="w-full h-px bg-sky-500/50"></div>
          <div className="w-full h-px bg-sky-500/50"></div>
          <div className="w-full h-px bg-sky-500/50"></div>
          <div className="w-full h-px bg-sky-500/50"></div>
        </div>
        <div className="absolute inset-0 flex justify-between px-8 pointer-events-none opacity-20">
          <div className="h-full w-px bg-sky-500/50"></div>
          <div className="h-full w-px bg-sky-500/50"></div>
          <div className="h-full w-px bg-sky-500/50"></div>
        </div>

        {/* Flood Risk Contour Overlay */}
        <div className="absolute left-[50%] top-[55%] -translate-x-1/2 -translate-y-1/2 w-[340px] h-[190px] rounded-full bg-blue-950/40 border border-sky-500/20 blur-[1px] pointer-events-none"></div>
        <div className="absolute left-[52%] top-[50%] -translate-x-1/2 -translate-y-1/2 w-[220px] h-[120px] rounded-full bg-slate-900/60 border border-rose-500/30 pointer-events-none"></div>

        {/* Tactical SVG Route Path */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {/* Staging to Citizen designated corridor */}
          <path
            d={`M ${stagingPos.x}% ${stagingPos.y}% Q 45% 65%, ${citizenPos.x}% ${citizenPos.y}%`}
            fill="none"
            stroke={isAssignedOrEnRoute ? '#38bdf8' : '#334155'}
            strokeWidth="3"
            strokeDasharray={isAssignedOrEnRoute ? '6 4' : '4 4'}
            className={isAssignedOrEnRoute ? 'animate-pulse' : 'opacity-40'}
          />

          {/* Proximity range rings around citizen */}
          <circle
            cx={`${citizenPos.x}%`}
            cy={`${citizenPos.y}%`}
            r="45"
            fill="none"
            stroke="#ef4444"
            strokeWidth="1"
            strokeOpacity="0.3"
          />
          <circle
            cx={`${citizenPos.x}%`}
            cy={`${citizenPos.y}%`}
            r="80"
            fill="none"
            stroke="#3b82f6"
            strokeWidth="1"
            strokeOpacity="0.2"
          />
        </svg>

        {/* Staging Area Marker */}
        <div
          className="absolute z-10 flex flex-col items-center pointer-events-none"
          style={{
            left: `${stagingPos.x}%`,
            top: `${stagingPos.y}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div className="h-6 w-6 rounded-lg bg-slate-900/90 border border-slate-700 flex items-center justify-center text-[10px] text-slate-300">
            ⚓
          </div>
          <span className="mt-1 text-[9px] font-medium text-slate-300 bg-slate-950/80 px-1 rounded">
            Rescue Base
          </span>
        </div>

        {/* Citizen Distress Location Marker */}
        <div
          className="absolute z-30 flex flex-col items-center"
          style={{
            left: `${citizenPos.x}%`,
            top: `${citizenPos.y}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {/* Pulsing Beacon Waves */}
          <span className="relative flex h-8 w-8 items-center justify-center">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-60"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-600 border-2 border-white shadow-[0_0_15px_#EF4444]"></span>
          </span>
          <div className="mt-1 flex items-center gap-1 bg-slate-950/95 text-rose-400 font-extrabold text-[10px] px-2 py-0.5 rounded-full border border-rose-500/40 shadow-lg tracking-wider">
            <span>YOU</span>
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping"></span>
          </div>
        </div>

        {/* Dynamic Responder Craft Marker */}
        {isAssignedOrEnRoute && (
          <div
            className="absolute z-30 flex flex-col items-center transition-all duration-1000 ease-out"
            style={{
              left: `${responderPos.x}%`,
              top: `${responderPos.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {/* Pulsing Aura if Nearby */}
            {isNearbyOrScene && (
              <span className="animate-ping absolute inline-flex h-10 w-10 rounded-full bg-amber-400 opacity-75"></span>
            )}
            <div
              className={`h-9 w-9 rounded-xl flex items-center justify-center text-sm shadow-xl border transition-all ${
                isOnScene
                  ? 'bg-emerald-600 border-emerald-300 text-white ring-4 ring-emerald-500/30'
                  : isNearbyOrScene
                    ? 'bg-amber-500 border-amber-300 text-slate-950 ring-4 ring-amber-400/30'
                    : 'bg-sky-600 border-sky-300 text-white ring-4 ring-sky-400/20'
              }`}
            >
              🚤
            </div>
            <div
              className={`mt-1 text-[9px] font-bold px-2 py-0.5 rounded-md border whitespace-nowrap shadow-md tracking-wider uppercase ${
                isOnScene
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
                  : isNearbyOrScene
                    ? 'bg-amber-950 text-amber-300 border-amber-500/50'
                    : 'bg-slate-950/90 text-sky-300 border-sky-500/40'
              }`}
            >
              {isOnScene ? 'ARRIVED' : responder.unitName || responder.unit_name || 'NDRF UNIT 04'}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Reassurance / Live Stats Strip */}
      <div className="mt-3 pt-2.5 border-t border-salvus-border flex items-center justify-between gap-3 text-xs flex-wrap">
        <div className="flex items-center gap-2 text-salvus-text-secondary">
          <span className="text-salvus-info font-bold">●</span>
          <span className="text-xs">
            {isOnScene
              ? 'Rescue team is at your location. Follow crew instructions.'
              : isNearbyOrScene
                ? 'Rescue boat is on your street. Look out for floodlights.'
                : isAssignedOrEnRoute
                  ? `Rescue team navigating flood corridor (approx. ${distanceText} away)`
                  : 'Coordinators coordinating watercraft route...'}
          </span>
        </div>

        {isAssignedOrEnRoute && !isOnScene && (
          <div className="bg-salvus-surface-elevated border border-salvus-info-border px-3 py-1 rounded-lg text-salvus-info font-bold text-xs shrink-0">
            ETA: ~{etaMinutes} mins
          </div>
        )}
      </div>
    </div>
  )
}

export default RescueRadarMap
