export const ShelterPreviewCard = ({
  badgeText = 'Nearest safe shelter',
  name = 'Sector 12 Community Hall',
  distance = '1.2 km away',
  capacity = '42% occupied',
  actionText = 'View directions',
  onActionClick,
}) => {
  return (
    <div className="bg-[#0D141F] border border-[#1A2533] rounded-xl p-5 sm:p-6 flex flex-col justify-between transition-all duration-200 hover:border-[#27384C]">
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
          <span className="text-xs font-semibold text-emerald-400">{badgeText}</span>
        </div>
        <h3 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight leading-snug">
          {name}
        </h3>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          {distance} · {capacity}
        </p>
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
