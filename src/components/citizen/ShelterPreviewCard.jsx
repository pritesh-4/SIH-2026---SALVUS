export const ShelterPreviewCard = ({
  badgeText = 'NEAREST SHELTER',
  name = 'Community Hall',
  distance = '1.2 km',
  capacity = '42% full',
  actionText = 'View directions',
  onActionClick,
}) => {
  return (
    <div className="bg-[#111A24] border border-[#1E293B] rounded-xl p-6 flex flex-col justify-between transition-all duration-200 hover:border-[#2A3B4E]">
      <div>
        <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase block mb-1">
          {badgeText}
        </span>
        <h3 className="text-lg font-bold text-white tracking-tight leading-snug">{name}</h3>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          {distance} · {capacity}
        </p>
      </div>
      <div className="mt-4">
        <button
          type="button"
          onClick={onActionClick}
          className="text-xs sm:text-sm font-medium text-sky-400 hover:text-sky-300 transition-colors inline-flex items-center gap-1 cursor-pointer group"
        >
          <span>{actionText}</span>
          <span className="transition-transform group-hover:translate-x-1">→</span>
        </button>
      </div>
    </div>
  )
}
