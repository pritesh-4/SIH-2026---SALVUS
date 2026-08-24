export const ActiveAlertCard = ({
  badgeText = 'Active weather advisory · Heavy rain',
  description = 'Localized flooding possible in low-lying sectors. Move to higher ground if water rises.',
  source = 'Verified by Meteorological Dept & GDACS · 14 min ago',
}) => {
  return (
    <div className="bg-[#0D141F] border border-[#1A2533] border-l-4 border-l-amber-500 rounded-xl p-5 sm:p-6 transition-all duration-200 hover:border-[#27384C] hover:border-l-amber-500">
      <div className="flex items-center gap-2 mb-2">
        <span className="h-2 w-2 rounded-full bg-amber-400"></span>
        <span className="text-xs font-semibold tracking-wide text-amber-400">{badgeText}</span>
      </div>
      <p className="text-sm sm:text-base text-slate-100 leading-relaxed font-medium">
        {description}
      </p>
      <div className="mt-3 pt-2.5 border-t border-[#1A2533] flex items-center justify-between text-xs text-slate-400">
        <span className="truncate">{source}</span>
        <span className="text-sky-400 font-semibold text-xs shrink-0 ml-2">Read advisory →</span>
      </div>
    </div>
  )
}
