import { useState, useEffect, useCallback, useRef } from 'react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { formatFileSize } from '../../lib/attachmentUtils'
import { getSeverityBadge, getStatusBadge } from '../../features/authority/incidents/incidentUtils'

/**
 * Accessible Emergency Evidence Lightbox & Review Modal (Phase 4).
 *
 * Provides emergency dispatchers with operational evidence inspection:
 * - High-res image display with progressive loading & error handling
 * - Incident context (Location, Ticket, Timestamp) without PII leakage
 * - Clear "Citizen-provided · Unverified" trust framing
 * - Keyboard navigation (Escape, Left/Right arrows) and focus trapping
 */
export const EvidenceLightboxModal = ({
  isOpen,
  onClose,
  incident = null,
  attachments = [],
  initialIndex = 0,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [prevInitialIndex, setPrevInitialIndex] = useState(initialIndex)
  const [isImageLoading, setIsImageLoading] = useState(true)
  const [hasImageError, setHasImageError] = useState(false)
  const modalRef = useRef(null)

  if (prevInitialIndex !== initialIndex) {
    setPrevInitialIndex(initialIndex)
    setCurrentIndex(initialIndex)
    setIsImageLoading(true)
    setHasImageError(false)
  }

  const totalCount = attachments.length
  const currentAttachment = attachments[currentIndex] || null

  const handlePrev = useCallback(() => {
    if (totalCount <= 1) return
    setIsImageLoading(true)
    setHasImageError(false)
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : totalCount - 1))
  }, [totalCount])

  const handleNext = useCallback(() => {
    if (totalCount <= 1) return
    setIsImageLoading(true)
    setHasImageError(false)
    setCurrentIndex((prev) => (prev < totalCount - 1 ? prev + 1 : 0))
  }, [totalCount])

  // Keyboard navigation & scroll lock
  useEffect(() => {
    if (!isOpen) return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    if (modalRef.current) {
      modalRef.current.focus()
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose?.()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handlePrev()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        handleNext()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen, onClose, handlePrev, handleNext])

  if (!isOpen || !incident || !currentAttachment) return null

  const sev = getSeverityBadge(incident.severity)
  const stat = getStatusBadge(incident.status)

  const formatTimestamp = (isoString) => {
    if (!isoString) return 'Just now'
    try {
      const d = new Date(isoString)
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    } catch {
      return isoString
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="evidence-lightbox-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose?.()
        }
      }}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="bg-salvus-surface border border-salvus-border rounded-2xl max-w-4xl w-full p-4 sm:p-6 shadow-2xl relative max-h-[95vh] overflow-y-auto text-salvus-text-primary outline-none flex flex-col gap-4"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-salvus-border">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-sm sm:text-base font-extrabold text-salvus-text-primary font-mono tracking-tight">
              #{incident.ticket_id || incident.id}
            </span>
            <Badge variant={sev.variant} dot={sev.dot} size="sm">
              {sev.label}
            </Badge>
            <Badge variant={stat.variant} size="sm">
              {stat.label}
            </Badge>
            <Badge variant="warning" size="sm">
              Citizen-provided · Unverified Observation
            </Badge>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-salvus-text-muted hover:text-salvus-text-primary text-lg font-bold p-1 cursor-pointer select-none"
            aria-label="Close evidence viewer"
          >
            ✕
          </button>
        </div>

        {/* Main Content: Image Viewer + Context Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Image Viewing Area */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center relative bg-black/40 rounded-xl border border-salvus-border overflow-hidden min-h-[260px] sm:min-h-[380px] p-2">
            {isImageLoading && !hasImageError && (
              <div className="absolute inset-0 flex items-center justify-center bg-salvus-surface/50 text-xs text-salvus-text-secondary gap-2">
                <span className="animate-spin text-base">⚙</span>
                <span>Loading high-resolution evidence...</span>
              </div>
            )}

            {hasImageError ? (
              <div className="text-center p-6 space-y-2 text-salvus-critical text-xs">
                <span className="text-2xl block" aria-hidden="true">
                  ⚠️
                </span>
                <strong className="block">Failed to load evidence image</strong>
                <p className="text-salvus-text-secondary text-[11px]">
                  The image file could not be fetched from storage.
                </p>
                <a
                  href={currentAttachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-salvus-info hover:underline inline-block mt-2 font-semibold"
                >
                  Attempt direct link ↗
                </a>
              </div>
            ) : (
              <img
                src={currentAttachment.url}
                alt={`Evidence photo for incident ${incident.ticket_id || incident.id}: ${currentAttachment.original_filename}`}
                onLoad={() => setIsImageLoading(false)}
                onError={() => {
                  setIsImageLoading(false)
                  setHasImageError(true)
                }}
                className={`max-h-[60vh] w-auto max-w-full rounded-lg object-contain transition-opacity duration-200 ${
                  isImageLoading ? 'opacity-0' : 'opacity-100'
                }`}
              />
            )}

            {/* Multi-Photo Carousel Chevrons */}
            {totalCount > 1 && (
              <>
                <button
                  type="button"
                  onClick={handlePrev}
                  className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/70 hover:bg-black text-white p-2 rounded-full cursor-pointer text-sm font-bold shadow-md transition-all select-none"
                  aria-label="Previous evidence photo"
                >
                  ◀
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/70 hover:bg-black text-white p-2 rounded-full cursor-pointer text-sm font-bold shadow-md transition-all select-none"
                  aria-label="Next evidence photo"
                >
                  ▶
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-y-0 -translate-x-1/2 bg-black/70 px-2.5 py-1 rounded-full text-[10px] text-white font-mono font-medium">
                  {currentIndex + 1} of {totalCount}
                </div>
              </>
            )}
          </div>

          {/* Operational Context Sidebar */}
          <div className="lg:col-span-5 space-y-3.5 text-xs">
            <div className="bg-salvus-muted/40 border border-salvus-border p-3 rounded-xl space-y-2">
              <span className="text-[10px] font-bold text-salvus-text-muted uppercase tracking-wider block">
                Operational Context
              </span>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-salvus-text-secondary">Incident:</span>
                  <strong className="text-salvus-text-primary uppercase font-semibold">
                    {incident.type} ({incident.severity})
                  </strong>
                </div>

                <div className="flex justify-between">
                  <span className="text-salvus-text-secondary">Location:</span>
                  <span className="text-salvus-text-primary text-right font-medium truncate max-w-[180px]">
                    {incident.location_name || 'Report Location'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-salvus-text-secondary">Coordinates:</span>
                  <span className="text-salvus-text-muted font-mono text-[11px]">
                    {incident.latitude?.toFixed(4)}°N, {incident.longitude?.toFixed(4)}°E
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-salvus-text-secondary">Reported:</span>
                  <span className="text-salvus-text-primary font-medium">
                    {formatTimestamp(currentAttachment.uploaded_at || incident.created_at)}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-salvus-text-secondary">Source:</span>
                  <span className="text-salvus-text-primary font-semibold">
                    Citizen Field Report
                  </span>
                </div>
              </div>
            </div>

            {/* Evidence Technical Metadata */}
            <div className="bg-salvus-muted/30 border border-salvus-border p-3 rounded-xl space-y-1.5 text-xs">
              <span className="text-[10px] font-bold text-salvus-text-muted uppercase tracking-wider block">
                Evidence Attributes
              </span>

              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-salvus-text-secondary">File Name:</span>
                  <strong className="text-salvus-text-primary truncate max-w-[160px]">
                    {currentAttachment.original_filename}
                  </strong>
                </div>

                <div className="flex justify-between">
                  <span className="text-salvus-text-secondary">Size:</span>
                  <span className="text-salvus-text-primary font-mono font-medium">
                    {formatFileSize(currentAttachment.size_bytes)}
                  </span>
                </div>

                {currentAttachment.width && currentAttachment.height && (
                  <div className="flex justify-between">
                    <span className="text-salvus-text-secondary">Dimensions:</span>
                    <span className="text-salvus-text-muted font-mono">
                      {currentAttachment.width} × {currentAttachment.height} px
                    </span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span className="text-salvus-text-secondary">MIME Type:</span>
                  <span className="text-salvus-text-muted font-mono">
                    {currentAttachment.mime_type}
                  </span>
                </div>

                {currentAttachment.checksum && (
                  <div className="flex justify-between pt-1 border-t border-salvus-border">
                    <span className="text-salvus-text-secondary">SHA-256:</span>
                    <span
                      className="text-salvus-text-muted font-mono text-[10px] truncate max-w-[150px]"
                      title={currentAttachment.checksum}
                    >
                      {currentAttachment.checksum.slice(0, 16)}...
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Trust Framing & Field Notice */}
            <div className="bg-salvus-info-bg/40 border border-salvus-info-border/60 p-2.5 rounded-xl text-[11px] text-salvus-text-secondary leading-relaxed space-y-1">
              <strong className="text-salvus-info flex items-center gap-1 font-bold">
                <span>ℹ️</span>
                <span>Situational Evidence Notice</span>
              </strong>
              <p>
                Photographic evidence submitted by citizens provides real-time situational context.
                It is an unverified field observation and must be corroborated by emergency
                responders on scene.
              </p>
            </div>

            {/* Toolbar Buttons */}
            <div className="pt-2 flex items-center justify-between gap-2 border-t border-salvus-border">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.open(currentAttachment.url, '_blank', 'noopener,noreferrer')}
              >
                ↗ Open Full Image
              </Button>
              <Button variant="primary" size="sm" onClick={onClose}>
                Close Viewer
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default EvidenceLightboxModal
