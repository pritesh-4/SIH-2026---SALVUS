import { useEffect, useRef } from 'react'
import {
  AlertTriangle,
  Send,
  Clock,
  MapPin,
  Shield,
  Users,
  Activity,
  RefreshCw,
} from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

/**
 * Dispatch Assignment & Reassignment Confirmation Safeguard Modal (Pass 4C)
 *
 * Prevents accidental dispatch or reassignment with clear structured confirmation:
 * - Target incident ID, ticket, type & urgency
 * - Unit name, craft type, team lead
 * - Estimated arrival (ETA), distance
 * - Capability match with status validation
 * - Dynamic reassignment comparison (releases old unit, dispatches new unit)
 * - Keyboard accessible with Escape & Enter handling
 */
export const AssignmentConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  candidate,
  incident,
  isAssigning = false,
  assignmentError = null,
  isReassign = false,
  previousResponder = null,
  reassignmentReason = null,
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
  const status = candidate.status || 'AVAILABLE'

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
            <Badge variant={isReassign ? 'warning' : 'info'} dot={true}>
              {isReassign ? 'Confirm Dynamic Reassignment' : 'Confirm Dispatch Assignment'}
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
            <span className="text-[10px] font-bold text-salvus-info uppercase tracking-wider font-mono block">
              {isReassign ? 'Dynamic Tactical Reassignment' : 'Authority Dispatch Order'}
            </span>
            <h3
              id="assignment-modal-title"
              className="text-base font-extrabold text-salvus-text-primary tracking-tight mt-0.5"
            >
              {isReassign ? `Reassign to ${unitName}?` : `Assign ${unitName}?`}
            </h3>
            <p className="text-xs text-salvus-text-secondary mt-0.5 font-medium">
              Confirm authoritative deployment to incident #
              {incident.ticket_id || incident.id?.slice(-4)} (
              {incident.type?.replace('_', ' ') || 'disaster'}).
            </p>
          </div>

          {/* Reassignment Context Notice */}
          {isReassign && previousResponder && (
            <div className="p-2.5 bg-salvus-muted/50 border border-salvus-border rounded-xl space-y-1.5 text-xs">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-salvus-text-muted">Currently Assigned:</span>
                <strong className="text-salvus-text-secondary font-mono">
                  {previousResponder.unit_name}
                </strong>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-salvus-info font-medium">New Candidate:</span>
                <strong className="text-salvus-safe font-mono">
                  {unitName} (~{etaFormatted})
                </strong>
              </div>
              {reassignmentReason && (
                <p className="text-[11px] text-salvus-text-muted pt-1 border-t border-salvus-border/50">
                  {reassignmentReason}
                </p>
              )}
            </div>
          )}

          {/* Structured Assignment Details Card */}
          <div className="p-3.5 bg-salvus-muted/40 border border-salvus-border rounded-xl space-y-2 text-xs font-medium">
            <div className="flex items-center justify-between border-b border-salvus-border pb-1.5">
              <span className="text-salvus-text-muted">Target Incident:</span>
              <div className="flex items-center gap-1.5">
                <strong className="text-salvus-text-primary font-mono font-bold">
                  #{incident.ticket_id || incident.id?.slice(-4)}
                </strong>
                <span className="text-salvus-text-muted text-[11px]">
                  ({incident.severity || 'HIGH'})
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between border-b border-salvus-border pb-1.5">
              <span className="text-salvus-text-muted flex items-center gap-1">
                <Clock className="h-3 w-3 text-salvus-info" />
                <span>Estimated Arrival:</span>
              </span>
              <strong className="text-salvus-info font-mono font-bold">~{etaFormatted}</strong>
            </div>

            <div className="flex items-center justify-between border-b border-salvus-border pb-1.5">
              <span className="text-salvus-text-muted flex items-center gap-1">
                <MapPin className="h-3 w-3 text-salvus-info" />
                <span>Distance:</span>
              </span>
              <strong className="text-salvus-text-primary font-mono">{distanceKm} km</strong>
            </div>

            <div className="flex items-center justify-between border-b border-salvus-border pb-1.5">
              <span className="text-salvus-text-muted flex items-center gap-1">
                <Shield className="h-3 w-3 text-salvus-safe" />
                <span>Capability Match:</span>
              </span>
              <strong className="text-salvus-text-primary">{capability} ✓</strong>
            </div>

            <div className="flex items-center justify-between border-b border-salvus-border pb-1.5">
              <span className="text-salvus-text-muted flex items-center gap-1">
                <Activity className="h-3 w-3 text-salvus-safe" />
                <span>Current Status:</span>
              </span>
              <Badge variant={status === 'AVAILABLE' ? 'safe' : 'info'} size="sm">
                {status === 'AVAILABLE' ? 'Available Now' : status}
              </Badge>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-salvus-text-muted flex items-center gap-1">
                <Users className="h-3 w-3 text-salvus-text-muted" />
                <span>Crew Load:</span>
              </span>
              <span className="font-mono text-salvus-text-primary">
                {candidate.current_load ?? 0} / {candidate.max_capacity ?? 8} in use
              </span>
            </div>
          </div>

          {/* Revalidation Error Notice (if any) */}
          {assignmentError && (
            <div className="p-2.5 bg-salvus-danger-bg border border-salvus-danger-border rounded-lg text-xs text-salvus-danger-text font-medium animate-fadeIn">
              ⚠️ {assignmentError}
            </div>
          )}

          {/* Operational Notice */}
          <div className="p-2.5 bg-salvus-warning-bg border border-salvus-warning-border rounded-lg flex items-start gap-2 text-xs text-salvus-warning-text font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              {isReassign
                ? `Releases ${previousResponder?.unit_name || 'previous unit'} back to AVAILABLE status and redirects citizen tracking to ${unitName}.`
                : 'Transitions incident status to ASSIGNED. Telemetry corridor tracking will initiate immediately upon confirmation.'}
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
            {isReassign ? 'Keep Current Unit' : 'Cancel'}
          </Button>

          <Button
            ref={confirmBtnRef}
            variant="primary"
            size="md"
            loading={isAssigning}
            onClick={() => onConfirm(candidate.id, reassignmentReason)}
            leftIcon={
              isReassign ? <RefreshCw className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />
            }
            className="font-bold text-xs shadow-xs"
          >
            {isReassign ? 'Confirm Reassignment' : 'Confirm Assignment'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default AssignmentConfirmModal
