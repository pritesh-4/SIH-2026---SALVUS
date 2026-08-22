export const LocationStatusBanner = ({
  location = {
    address: 'Sector 12, Salt Lake, Kolkata',
    coordinates: '22.5726° N, 88.3639° E',
    accuracy: '±4m',
    status: 'ACTIVE',
  },
  locationStatus = 'ACTIVE',
  connectivityStatus = 'CONNECTED',
}) => {
  const getStatusBadge = () => {
    switch (locationStatus) {
      case 'ACTIVE':
        return {
          color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
          dot: 'bg-emerald-500',
          label: 'GPS Telemetry Active',
        }
      case 'ACQUIRING':
        return {
          color: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
          dot: 'bg-amber-500',
          label: 'Acquiring Satellites',
        }
      case 'TEMPORARILY UNAVAILABLE':
        return {
          color: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
          dot: 'bg-rose-500',
          label: 'Cell Tower Triangulation',
        }
      case 'RETRYING':
        return {
          color: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
          dot: 'bg-sky-500',
          label: 'Retrying GPS Lock',
        }
      default:
        return {
          color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
          dot: 'bg-emerald-500',
          label: 'GPS Telemetry Active',
        }
    }
  }

  const getConnectivityBadge = () => {
    switch (connectivityStatus) {
      case 'CONNECTED':
        return {
          color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
          dot: 'bg-emerald-400',
          label: 'Grid Connected',
        }
      case 'LIMITED_CONNECTION':
        return {
          color: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
          dot: 'bg-amber-400',
          label: 'Limited Signal (SMS Backup)',
        }
      case 'OFFLINE':
        return {
          color: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
          dot: 'bg-rose-500',
          label: 'Offline Cache Active',
        }
      case 'RECONNECTING':
        return {
          color: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
          dot: 'bg-sky-400',
          label: 'Reconnecting Grid...',
        }
      default:
        return {
          color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
          dot: 'bg-emerald-400',
          label: 'Grid Connected',
        }
    }
  }

  const locBadge = getStatusBadge()
  const connBadge = getConnectivityBadge()

  return (
    <div className="bg-[#111A24] border border-[#1E293B] rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      {/* Left Details */}
      <div className="flex items-start sm:items-center gap-3.5">
        <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0 mt-0.5 sm:mt-0">
          <svg
            className="w-5 h-5 animate-pulse"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs sm:text-sm font-bold text-white">{location.address}</span>
            <span className="text-[10px] bg-blue-500/15 border border-blue-500/30 text-blue-300 font-mono px-2 py-0.5 rounded-full font-medium">
              Precision: {location.accuracy}
            </span>
          </div>
          <p className="text-[11px] font-mono text-slate-400 mt-0.5">
            {location.coordinates} ·{' '}
            <span className="text-slate-300">
              Your location is being shared with the response team.
            </span>
          </p>
        </div>
      </div>

      {/* Right Telemetry & Connectivity Badges */}
      <div className="flex items-center gap-2 self-stretch md:self-auto flex-wrap">
        <div
          className={`flex items-center gap-2 border px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 ${locBadge.color}`}
        >
          <span className={`h-2 w-2 rounded-full ${locBadge.dot} animate-ping`}></span>
          <span className="tracking-wider uppercase text-[10px] sm:text-[11px] font-bold">
            {locBadge.label}
          </span>
        </div>

        <div
          className={`flex items-center gap-2 border px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 ${connBadge.color}`}
        >
          <span className={`h-2 w-2 rounded-full ${connBadge.dot}`}></span>
          <span className="tracking-wider uppercase text-[10px] sm:text-[11px] font-bold">
            {connBadge.label}
          </span>
        </div>
      </div>
    </div>
  )
}
