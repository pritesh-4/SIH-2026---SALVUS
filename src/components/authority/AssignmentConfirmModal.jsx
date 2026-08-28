import { useEffect, useRef } from 'react'
import { AlertTriangle, Send } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

/**
 * Dispatch Assignment Confirmation Safeguard Modal (Master Prompt 3 - Step 8)
 *
 * Prevents accidental dispatch with clear structured confirmation:
 * - Unit name, capability, distance, ETA
 * - Target incident ID and ticket
 * - Keyboard accessible with Escape & Enter handling
 */
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

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isAssigning) {
        onClose?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    setTimeout(() => {
      confirmBtnRef.current?.focus()
    }, 50)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isAssigning) {
          onClose?.()
        }
      }}
    >
      <div
        className="w-full max-w-md bg-salvus-surface border border-salvus-border rounded-2xl shadow-2xl overflow-hidden flex flex-col text-salvus-text-primary"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-salvus-surface-elevated border-b border-salvus-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="info" dot={true}>
              Confirm Dispatch Assignment
            </Badge>
          </div>
          <button
            type="button"
            disabled={isAssigning}
            onClick={onClose}
            aria-label="Close dialog"
            className="text-salvus-text-muted hover:text-salvus-text-primary text-xs p-1 cursor-pointer select-none disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 text-xs">
          <div>
            <h3
              id="assignment-modal-title"
              className="text-base font-bold text-salvus-text-primary"
            >
              Dispatch {unitName}?
            </h3>
            <p className="text-xs text-salvus-text-secondary mt-0.5">
              Confirm authoritative deployment to incident #
              {incident.ticket_id || incident.id?.slice(-4)}.
            </p>
          </div>

          {/* Structured Assignment Details */}
          <div className="p-3.5 bg-salvus-muted/40 border border-salvus-border rounded-xl space-y-2 text-xs font-medium">
            <div className="flex items-center justify-between border-b border-salvus-border pb-1.5">
              <span className="text-salvus-text-muted">Target Incident:</span>
              <strong className="text-salvus-text-primary font-mono font-bold">
                #{incident.ticket_id || incident.id?.slice(-4)}
              </strong>
            </div>

            <div className="flex items-center justify-between border-b border-salvus-border pb-1.5">
              <span className="text-salvus-text-muted">Estimated Arrival:</span>
              <strong className="text-salvus-info font-mono font-bold">{etaFormatted}</strong>
            </div>

            <div className="flex items-center justify-between border-b border-salvus-border pb-1.5">
              <span className="text-salvus-text-muted">Capability Match:</span>
              <strong className="text-salvus-text-primary">{capability}</strong>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-salvus-text-muted">Distance:</span>
              <strong className="text-salvus-text-primary font-mono">{distanceKm} km</strong>
            </div>
          </div>

          {/* Operational Notice */}
          <div className="p-2.5 bg-salvus-warning-bg border border-salvus-warning-border rounded-lg flex items-start gap-2 text-xs text-salvus-warning-text font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              Transitions incident status to <strong>ASSIGNED</strong>. Response telemetry will
              initiate immediately upon confirmation.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-salvus-surface-elevated border-t border-salvus-border flex items-center justify-end gap-2.5">
          <Button
            variant="quiet"
            size="md"
            disabled={isAssigning}
            onClick={onClose}
            className="text-xs"
          >
            Cancel
          </Button>

          <Button
            ref={confirmBtnRef}
            variant="primary"
            size="md"
            loading={isAssigning}
            onClick={() => onConfirm(candidate.id)}
            leftIcon={<Send className="h-3.5 w-3.5" />}
            className="font-bold text-xs shadow-xs"
          >
            Confirm Assignment
          </Button>
        </div>
      </div>
    </div>
  )
}

export default AssignmentConfirmModal
