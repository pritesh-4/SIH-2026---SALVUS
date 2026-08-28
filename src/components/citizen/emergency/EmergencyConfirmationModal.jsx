import { useEffect, useRef } from 'react'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'

/**
 * High-Clarity Emergency Confirmation Modal (Master Prompt 2 - Step 4)
 *
 * Prevents accidental activation without creating friction for someone in distress.
 * Structure:
 * SEND EMERGENCY REQUEST?
 * Your current location will be shared with emergency coordinators.
 * [ CANCEL ]
 * [ SEND SOS ]
 *
 * Full keyboard, focus, touch, loading, and error states.
 */
export const EmergencyConfirmationModal = ({ isOpen, onConfirm, onCancel, isLoading = false }) => {
  const confirmButtonRef = useRef(null)
  const modalContainerRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Focus primary action on open
    setTimeout(() => {
      confirmButtonRef.current?.focus()
    }, 50)

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel?.()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen, onCancel])

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-desc"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          onCancel()
        }
      }}
    >
      <div
        ref={modalContainerRef}
        className="bg-salvus-surface border-2 border-salvus-critical-border rounded-2xl max-w-md w-full p-6 sm:p-7 shadow-2xl relative text-salvus-text-primary outline-none animate-slideInUp"
      >
        {/* Warning Tag */}
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="critical" dot={true}>
            EMERGENCY REQUEST
          </Badge>
        </div>

        {/* Modal Title */}
        <h2
          id="confirm-modal-title"
          className="text-xl sm:text-2xl font-extrabold text-salvus-text-primary tracking-tight leading-snug"
        >
          SEND EMERGENCY REQUEST?
        </h2>

        {/* Reassuring Plain Language Description */}
        <p
          id="confirm-modal-desc"
          className="text-xs sm:text-sm text-salvus-text-secondary mt-2 leading-relaxed font-normal"
        >
          Your current location will be shared with emergency coordinators.
        </p>

        {/* Clear Safeguard Guidance */}
        <div className="bg-salvus-muted/40 border border-salvus-border rounded-xl p-3.5 my-5 text-xs text-salvus-text-secondary space-y-2">
          <div className="flex items-center gap-2 font-medium text-salvus-text-primary">
            <span>📍</span>
            <span>Your location coordinates are shared immediately.</span>
          </div>
          <div className="flex items-center gap-2 font-medium text-salvus-text-primary">
            <span>🛡️</span>
            <span>Nearest rescue teams are alerted.</span>
          </div>
        </div>

        {/* Actions with Large Touch Targets */}
        <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
          <Button
            ref={confirmButtonRef}
            variant="critical"
            size="lg"
            fullWidth={true}
            onClick={onConfirm}
            loading={isLoading}
            leftIcon={
              !isLoading && (
                <span className="text-lg" aria-hidden="true">
                  🚨
                </span>
              )
            }
            className="font-extrabold text-sm tracking-wider min-h-[48px] py-3.5 cursor-pointer shadow-md active:scale-[0.98] transition-transform"
          >
            {isLoading ? 'Transmitting SOS...' : 'SEND SOS'}
          </Button>

          <Button
            variant="quiet"
            size="lg"
            fullWidth={true}
            onClick={onCancel}
            disabled={isLoading}
            className="text-salvus-text-secondary hover:text-salvus-text-primary font-bold text-sm min-h-[48px]"
          >
            CANCEL
          </Button>
        </div>
      </div>
    </div>
  )
}

export default EmergencyConfirmationModal
