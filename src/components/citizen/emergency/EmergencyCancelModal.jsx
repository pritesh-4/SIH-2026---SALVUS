import { Button } from '../../ui/Button'

/**
 * Emergency Cancellation Safeguard Modal
 */
export const EmergencyCancelModal = ({ isOpen, onConfirm, onCancel }) => {
  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel()
        }
      }}
    >
      <div className="bg-salvus-surface border border-salvus-border rounded-2xl max-w-md w-full p-6 sm:p-7 shadow-2xl text-salvus-text-primary text-center">
        {/* Warning Icon */}
        <div className="h-12 w-12 rounded-full bg-salvus-warning-bg border border-salvus-warning-border mx-auto flex items-center justify-center text-xl mb-4">
          ⚠️
        </div>

        {/* Modal Title & Explanation */}
        <h2
          id="cancel-modal-title"
          className="text-xl font-bold text-salvus-text-primary tracking-tight"
        >
          Cancel Emergency Request?
        </h2>

        <p className="text-xs sm:text-sm text-salvus-text-secondary mt-2 leading-relaxed">
          If you are now safe or this was activated accidentally, you can stand down emergency
          coordinators.
        </p>

        {/* Reassurance Callout */}
        <div className="bg-salvus-muted/40 border border-salvus-border rounded-xl p-3.5 my-5 text-xs text-salvus-text-secondary flex items-start gap-2.5 text-left">
          <span className="text-salvus-warning text-sm font-bold" aria-hidden="true">
            ℹ️
          </span>
          <span>
            Only cancel if you are certain you do not require medical aid or evacuation assistance.
          </span>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2.5">
          <Button
            variant="primary"
            size="lg"
            fullWidth={true}
            onClick={onCancel}
            className="font-bold text-xs sm:text-sm"
          >
            Keep Request Active (I Still Need Help)
          </Button>

          <Button
            variant="quiet"
            size="md"
            fullWidth={true}
            onClick={onConfirm}
            className="text-salvus-text-muted hover:text-salvus-critical"
          >
            Yes, Cancel Request (I Am Safe)
          </Button>
        </div>
      </div>
    </div>
  )
}
