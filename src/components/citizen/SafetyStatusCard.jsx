export const SafetyStatusCard = ({
  badgeText = 'STATUS · SAFE',
  title = 'No active threats in your area',
  subtitle = 'Based on live weather + local reports · Updated 2m ago',
}) => {
  return (
    <div className="bg-[#111A24] border border-[#1E293B] rounded-xl p-6 transition-all duration-200 hover:border-[#2A3B4E]">
      <div className="flex items-center gap-2 mb-3">
        <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block shadow-[0_0_8px_rgba(16,185,129,0.6)]"></span>
        <span className="text-xs font-semibold tracking-wider text-emerald-400 uppercase">
          {badgeText}
        </span>
      </div>
      <h2 className="text-xl font-bold text-white tracking-tight leading-snug">{title}</h2>
      <p className="text-xs sm:text-sm text-slate-400 mt-1 font-normal">{subtitle}</p>
    </div>
  )
}
