import { useState, useEffect } from 'react'

export const EmergencyConfirmationModal = ({ isOpen, onConfirm, onCancel }) => {
  const [holdProgress, setHoldProgress] = useState(0)
  const [isHolding, setIsHolding] = useState(false)

  useEffect(() => {
    if (!isHolding) return

    const interval = setInterval(() => {
      setHoldProgress((prev) => {
        if (prev >= 100) {
          setIsHolding(false)
          onConfirm()
          return 100
        }
        return prev + 5
      })
    }, 50)

    return () => clearInterval(interval)
  }, [isHolding, onConfirm])

  const handleStopHolding = () => {
    setIsHolding(false)
    setHoldProgress(0)
  }

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
    >
      <div className="bg-[#111A24] border border-rose-500/30 rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-2xl shadow-rose-950/60 relative overflow-hidden">
        {/* Glow accent */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none"></div>

        {/* Warning Badge */}
        <div className="flex items-center gap-2 mb-4">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
          </span>
          <span className="text-xs font-bold tracking-widest text-rose-400 uppercase">
            Emergency Dispatch Confirmation
          </span>
        </div>

        {/* Modal Title & Body */}
        <h2
          id="modal-title"
          className="text-2xl font-extrabold text-white tracking-tight leading-snug"
        >
          Activate Emergency SOS?
        </h2>
        <p className="text-sm text-slate-300 mt-2 leading-relaxed font-normal">
          This transmits your live GPS coordinates directly to the Salvus emergency response grid
          and initiates AI triage for immediate unit dispatch.
        </p>

        {/* Info Box */}
        <div className="bg-[#0B1118] border border-[#1E293B] rounded-xl p-3.5 my-5 text-xs text-slate-400 flex items-start gap-3">
          <span className="text-rose-400 text-sm font-bold mt-0.5">⚠️</span>
          <span>
            Only use in real emergencies. Accidental activations can be safely cancelled once
            broadcasted.
          </span>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          {/* Hold or Instant Click to Activate */}
          <div className="relative overflow-hidden rounded-xl">
            {/* Progress Fill Indicator */}
            {holdProgress > 0 && (
              <div
                className="absolute inset-0 bg-rose-700 transition-all duration-75 ease-linear pointer-events-none"
                style={{ width: `${holdProgress}%` }}
              ></div>
            )}
            <button
              type="button"
              onMouseDown={() => setIsHolding(true)}
              onMouseUp={handleStopHolding}
              onMouseLeave={handleStopHolding}
              onTouchStart={() => setIsHolding(true)}
              onTouchEnd={handleStopHolding}
              onClick={onConfirm}
              className="relative w-full py-3.5 px-6 rounded-xl bg-[#EF4444] hover:bg-rose-600 active:scale-[0.99] text-white font-bold text-sm tracking-wider uppercase transition-all duration-200 cursor-pointer shadow-lg shadow-rose-950/60 flex items-center justify-center gap-2"
            >
              <span>
                {isHolding ? `HOLD TO CONFIRM (${holdProgress}%)` : 'CONFIRM & TRANSMIT SOS'}
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="w-full py-3 px-6 rounded-xl bg-[#1E293B]/60 hover:bg-[#1E293B] text-slate-300 hover:text-white font-medium text-xs tracking-wider uppercase transition-all duration-200 cursor-pointer"
          >
            Cancel & Return
          </button>
        </div>
      </div>
    </div>
  )
}
