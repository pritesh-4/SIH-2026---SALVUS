export const LocationStatusBanner = ({
  location = {
    address: 'Sector 12, Salt Lake, Kolkata',
    coordinates: '22.5726° N, 88.3639° E',
    accuracy: '±6m',
    status: 'BROADCASTING',
  },
}) => {
  return (
    <div className="bg-[#111A24] border border-[#1E293B] rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      {/* Left Details */}
      <div className="flex items-start sm:items-center gap-3.5">
        <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
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
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white">{location.address}</span>
            <span className="text-[10px] bg-blue-500/15 border border-blue-500/30 text-blue-300 font-mono px-2 py-0.5 rounded-full font-medium">
              Precision: {location.accuracy}
            </span>
          </div>
          <p className="text-xs font-mono text-slate-400 mt-0.5">{location.coordinates}</p>
        </div>
      </div>

      {/* Right Status */}
      <div className="flex items-center gap-2 bg-[#0B1118] border border-[#1E293B] px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-400 self-stretch sm:self-auto justify-center">
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
        <span className="tracking-wider uppercase text-[11px] font-bold">
          GPS Live Sharing: {location.status}
        </span>
      </div>
    </div>
  )
}
