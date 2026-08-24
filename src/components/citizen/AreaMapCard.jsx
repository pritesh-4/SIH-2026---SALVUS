export const AreaMapCard = ({
  badgeText = 'Local area overview',
  location = 'Sector 12 · Salt Lake, Kolkata',
  legend = [
    { label: 'Your location', color: '#3B82F6' },
    { label: 'Safe shelter', color: '#10B981' },
    { label: 'Hazard zone', color: '#EF4444' },
  ],
}) => {
  return (
    <div className="bg-[#0D141F] border border-[#1A2533] rounded-xl p-5 sm:p-6 transition-all duration-200 hover:border-[#27384C]">
      {/* Header */}
      <div className="mb-3">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="h-2 w-2 rounded-full bg-sky-400"></span>
          <span className="text-xs font-semibold text-slate-300">{badgeText}</span>
        </div>
        <h3 className="text-sm font-semibold text-slate-100">{location}</h3>
      </div>

      {/* Map Radar Canvas */}
      <div className="relative w-full h-44 sm:h-48 bg-[#080C12] rounded-lg border border-[#182332] overflow-hidden flex flex-col justify-between p-4 select-none">
        {/* Subtle Map Grid lines */}
        <div className="absolute inset-0 flex flex-col justify-between py-6 px-4 pointer-events-none opacity-30">
          <div className="w-full h-px bg-[#182332]"></div>
          <div className="w-full h-px bg-[#182332]"></div>
          <div className="w-full h-px bg-[#182332]"></div>
        </div>

        {/* Hazard Zone (Soft Red Area) */}
        <div
          className="absolute rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center transition-all duration-500"
          style={{
            left: '42%',
            top: '55%',
            width: '68px',
            height: '68px',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500/60"></span>
        </div>

        {/* You Indicator (Blue Dot) */}
        <div
          className="absolute flex items-center justify-center cursor-pointer group"
          style={{
            left: '36%',
            top: '32%',
            transform: 'translate(-50%, -50%)',
          }}
          title="Your current location"
        >
          <span className="relative flex h-3 w-3">
            <span className="relative inline-flex rounded-full h-3 w-3 bg-[#3B82F6] ring-2 ring-blue-400/50"></span>
          </span>
        </div>

        {/* Shelter Indicator (Green Dot) */}
        <div
          className="absolute flex items-center justify-center cursor-pointer group"
          style={{
            left: '70%',
            top: '48%',
            transform: 'translate(-50%, -50%)',
          }}
          title="Community Hall (Safe Shelter)"
        >
          <span className="h-3 w-3 rounded-full bg-[#10B981] ring-2 ring-emerald-400/50"></span>
        </div>

        {/* Legend Footer */}
        <div className="mt-auto z-10 pt-2 flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
          {legend.map((item, idx) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }}></span>
              <span>{item.label}</span>
              {idx < legend.length - 1 && <span className="text-slate-600 ml-1.5">·</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
