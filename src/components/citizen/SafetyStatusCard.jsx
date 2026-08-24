export const SafetyStatusCard = ({
  badgeText = 'Current status · Safe',
  title = 'No active threats in your immediate area',
  subtitle = 'Monitored via local sector reports and weather models · Updated 2m ago',
}) => {
  return (
    <div className="bg-[#0D141F] border border-[#1A2533] rounded-xl p-5 sm:p-6 transition-all duration-200 hover:border-[#27384C]">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block"></span>
        <span className="text-xs font-semibold tracking-wide text-emerald-400">{badgeText}</span>
      </div>
      <h2 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight leading-snug">
        {title}
      </h2>
      <p className="text-xs sm:text-sm text-slate-400 mt-1 font-normal leading-relaxed">
        {subtitle}
      </p>
    </div>
  )
}
