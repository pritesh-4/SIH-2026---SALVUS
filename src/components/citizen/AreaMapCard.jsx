export const AreaMapCard = ({
  badgeText = 'YOUR AREA',
  location = 'Sector 12 · Kolkata',
  legend = [
    { label: 'You', color: '#3B82F6' },
    { label: 'Shelter', color: '#10B981' },
    { label: 'Hazard zone', color: '#EF4444' },
  ],
}) => {
  return (
    <div className="bg-[#111A24] border border-[#1E293B] rounded-xl p-6 transition-all duration-200 hover:border-[#2A3B4E]">
      {/* Header */}
      <div className="mb-4">
        <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase block mb-1">
          {badgeText}
        </span>
        <h3 className="text-sm font-medium text-slate-300">{location}</h3>
      </div>

      {/* Map Radar Canvas */}
      <div className="relative w-full h-48 sm:h-52 bg-[#0B1118]/70 rounded-lg border border-[#1A2634] overflow-hidden flex flex-col justify-between p-4 select-none">
        {/* Subtle Map Grid lines */}
        <div className="absolute inset-0 flex flex-col justify-between py-6 px-4 pointer-events-none opacity-40">
          <div className="w-full h-px bg-[#1E293B]"></div>
          <div className="w-full h-px bg-[#1E293B]"></div>
          <div className="w-full h-px bg-[#1E293B]"></div>
          <div className="w-full h-px bg-[#1E293B]"></div>
        </div>

        {/* Hazard Zone (Soft Red Area) */}
        <div
          className="absolute rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center transition-all duration-500"
          style={{
            left: '42%',
            top: '55%',
            width: '74px',
            height: '74px',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <span className="h-2 w-2 rounded-full bg-rose-500/40"></span>
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
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-60"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-[#3B82F6] shadow-[0_0_10px_#3B82F6]"></span>
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
          title="Community Hall (Shelter)"
        >
          <span className="h-3 w-3 rounded-full bg-[#10B981] shadow-[0_0_10px_#10B981]"></span>
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
