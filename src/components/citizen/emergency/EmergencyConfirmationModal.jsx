import { useState, useEffect } from 'react'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'

/**
 * High-Clarity Emergency Confirmation Safeguard Modal
 * Protects against accidental triggers with plain language & large touch targets.
 */
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
        return prev + 8
      })
    }, 40)

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel()
        }
      }}
    >
      <div className="bg-salvus-surface border border-salvus-critical-border rounded-2xl max-w-md w-full p-6 sm:p-7 shadow-2xl relative text-salvus-text-primary">
        {/* Warning Badge */}
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="critical" dot={true}>
            Emergency SOS Confirmation
          </Badge>
        </div>

        {/* Modal Title & Body */}
        <h2
          id="modal-title"
          className="text-xl sm:text-2xl font-extrabold text-salvus-text-primary tracking-tight leading-snug"
        >
          Send emergency request?
        </h2>

        <p className="text-xs sm:text-sm text-salvus-text-secondary mt-2 leading-relaxed font-normal">
          This will share your current location with emergency coordinators and alert the nearest
          rescue teams.
        </p>

        {/* Clear Safeguard Guidance */}
        <div className="bg-salvus-muted/40 border border-salvus-border rounded-xl p-3.5 my-5 text-xs text-salvus-text-secondary space-y-1.5">
          <div className="flex items-center gap-2 font-medium text-salvus-text-primary">
            <span>📍</span>
            <span>Your GPS location will be transmitted directly</span>
          </div>
          <div className="flex items-center gap-2 font-medium text-salvus-text-primary">
            <span>🛡️</span>
            <span>Emergency coordinators will prioritize your request</span>
          </div>
        </div>

        {/* Action Buttons with Large Touch Targets */}
        <div className="flex flex-col gap-3">
          <div className="relative overflow-hidden rounded-xl">
            {holdProgress > 0 && (
              <div
                className="absolute inset-0 bg-salvus-critical/80 transition-all duration-75 ease-linear pointer-events-none z-10"
                style={{ width: `${holdProgress}%` }}
              />
            )}
            <Button
              variant="critical"
              size="lg"
              fullWidth={true}
              onMouseDown={() => setIsHolding(true)}
              onMouseUp={handleStopHolding}
              onMouseLeave={handleStopHolding}
              onTouchStart={() => setIsHolding(true)}
              onTouchEnd={handleStopHolding}
              onClick={onConfirm}
              leftIcon={<span aria-hidden="true">🚨</span>}
              className="font-bold text-sm tracking-wide"
            >
              {isHolding ? `HOLDING TO SEND (${holdProgress}%)` : 'CONFIRM & SEND SOS'}
            </Button>
          </div>

          <Button
            variant="quiet"
            size="md"
            fullWidth={true}
            onClick={onCancel}
            className="text-salvus-text-secondary hover:text-salvus-text-primary"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
