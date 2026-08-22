export const EmergencyCancelModal = ({ isOpen, onConfirm, onCancel }) => {
  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
    >
      <div className="bg-[#111A24] border border-slate-700 rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-2xl shadow-black/80 relative overflow-hidden">
        {/* Top Warning Icon */}
        <div className="h-12 w-12 rounded-full bg-slate-800 border border-slate-700 mx-auto flex items-center justify-center text-xl mb-4 text-slate-300">
          ⚠️
        </div>

        {/* Modal Title & Explanation */}
        <h2
          id="cancel-modal-title"
          className="text-xl font-bold text-white text-center tracking-tight"
        >
          Cancel Emergency SOS Request?
        </h2>
        <p className="text-xs sm:text-sm text-slate-300 text-center mt-2 leading-relaxed">
          If this SOS beacon was triggered accidentally or you are now fully safe, confirm
          cancellation. Salvus Command will be notified and allocated units will be released.
        </p>

        {/* Callout */}
        <div className="bg-[#0B1118] border border-[#1E293B] rounded-xl p-3.5 my-5 text-xs text-slate-400 flex items-start gap-2.5">
          <span className="text-amber-400 text-sm font-bold">ℹ️</span>
          <span>
            Only cancel if you are certain you do not require evacuation or emergency assistance.
          </span>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-3.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wider uppercase transition-colors cursor-pointer text-center shadow-lg shadow-emerald-950/40"
          >
            Keep Emergency Active (I Need Help)
          </button>

          <button
            type="button"
            onClick={onConfirm}
            className="w-full py-3 px-6 rounded-xl bg-[#1E293B] hover:bg-rose-900/40 hover:border-rose-500/40 border border-transparent text-slate-300 hover:text-rose-200 font-semibold text-xs tracking-wider uppercase transition-colors cursor-pointer text-center"
          >
            Confirm Cancellation (False Alarm / Safe)
          </button>
        </div>
      </div>
    </div>
  )
}
