export const ActiveAlertCard = ({
  badgeText = 'ACTIVE ALERT · HEAVY RAIN',
  description = 'Localized flooding possible in low-lying sectors. Move to higher ground if water rises.',
  source = 'Source: Open-Meteo + GDACS · 14 min ago',
}) => {
  return (
    <div className="bg-[#111A24] border border-[#1E293B] border-l-4 border-l-[#F59E0B] rounded-xl p-6 transition-all duration-200 hover:border-slate-700 hover:border-l-[#F59E0B]">
      <span className="text-xs font-semibold tracking-wider text-[#F59E0B] uppercase block mb-2">
        {badgeText}
      </span>
      <p className="text-sm sm:text-base text-slate-200 leading-relaxed font-normal">
        {description}
      </p>
      <p className="text-xs text-slate-400 mt-4 font-normal">{source}</p>
    </div>
  )
}
