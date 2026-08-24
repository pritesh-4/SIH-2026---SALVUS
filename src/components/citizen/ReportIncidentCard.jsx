export const ReportIncidentCard = ({
  badgeText = 'Community report',
  title = 'Report a local hazard',
  subtitle = 'Submit photo and location in 30s',
  actionText = 'Report hazard',
  onActionClick,
}) => {
  return (
    <div className="bg-[#0D141F] border border-[#1A2533] rounded-xl p-5 sm:p-6 flex flex-col justify-between transition-all duration-200 hover:border-[#27384C]">
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="h-2 w-2 rounded-full bg-slate-400"></span>
          <span className="text-xs font-semibold text-slate-400">{badgeText}</span>
        </div>
        <h3 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight leading-snug">
          {title}
        </h3>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">{subtitle}</p>
      </div>
      <div className="mt-4 pt-2">
        <button
          type="button"
          onClick={onActionClick}
          className="text-xs sm:text-sm font-semibold text-sky-400 hover:text-sky-300 transition-colors inline-flex items-center gap-1 cursor-pointer group"
        >
          <span>{actionText}</span>
          <span className="transition-transform group-hover:translate-x-1">→</span>
        </button>
      </div>
    </div>
  )
}
