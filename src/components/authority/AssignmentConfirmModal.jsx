import { useEffect, useRef } from 'react'
import { X, AlertTriangle, Send, Loader2 } from 'lucide-react'

export const AssignmentConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  candidate,
  incident,
  isAssigning = false,
}) => {
  const confirmBtnRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isAssigning) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    // Focus confirm button for keyboard accessibility
    setTimeout(() => {
      confirmBtnRef.current?.focus()
    }, 50)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, isAssigning, onClose])

  if (!isOpen || !candidate || !incident) return null

  const unitName = candidate.unit_name || candidate.unitName || 'Response Unit'
  const capability = candidate.capability?.replace('_', ' ') || 'General Rescue'
  const distanceKm = candidate.distance_km ?? candidate.distanceKm ?? 1.2
  const etaFormatted = candidate.eta_formatted || candidate.etaFormatted || '5 min'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="assignment-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
    >
      <div
        className="w-full max-w-md bg-[#080E18] border border-sky-500/30 rounded-2xl shadow-2xl overflow-hidden font-mono flex flex-col text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-[#0B1524] border-b border-[#16253B] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse"></span>
            <h3
              id="assignment-modal-title"
              className="text-xs font-bold uppercase tracking-wider text-slate-100"
            >
              Confirm Unit Assignment
            </h3>
          </div>
          <button
            type="button"
            disabled={isAssigning}
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 text-xs">
          <div>
            <h4 className="text-sm font-bold text-slate-100">Assign {unitName}?</h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Confirm authoritative dispatch to distress beacon.
            </p>
          </div>

          {/* Structured Assignment Details */}
          <div className="p-3.5 bg-[#060D17] border border-[#142030] rounded-xl space-y-2.5 text-[11px]">
            <div className="flex items-center justify-between border-b border-[#101A28] pb-1.5">
              <span className="text-slate-400 font-semibold">Incident:</span>
              <span className="font-bold text-slate-100 font-mono">
                #{incident.ticket_id || incident.id?.slice(-4)}
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-[#101A28] pb-1.5">
              <span className="text-slate-400 font-semibold">ETA:</span>
              <span className="font-bold text-sky-300 font-mono">{etaFormatted}</span>
            </div>

            <div className="flex items-center justify-between border-b border-[#101A28] pb-1.5">
              <span className="text-slate-400 font-semibold">Capability:</span>
              <span className="font-bold text-slate-200">{capability}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-semibold">Distance:</span>
              <span className="font-bold text-slate-200 font-mono">{distanceKm} km</span>
            </div>
          </div>

          {/* Operational Notice */}
          <div className="p-2.5 bg-amber-950/20 border border-amber-500/30 rounded-lg flex items-start gap-2 text-[10px] text-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p>
              Transitions incident status to <strong className="text-amber-300">ASSIGNED</strong>.
              Response telemetry will initiate immediately upon confirmation.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-[#0B1524] border-t border-[#16253B] flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={isAssigning}
            onClick={onClose}
            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold uppercase text-[11px] transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>

          <button
            ref={confirmBtnRef}
            type="button"
            disabled={isAssigning}
            onClick={() => onConfirm(candidate.id)}
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold uppercase text-[11px] transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-lg shadow-sky-600/30 cursor-pointer"
          >
            {isAssigning ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Confirming...</span>
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                <span>Confirm Assignment</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
