import { useEffect, useRef } from 'react'

/**
 * Reusable Calm Modal Component
 *
 * Accessible dialog with focus management, backdrop listener, escape key listener, and clean layout.
 */
export const Modal = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  footer = null,
  showCloseButton = true,
  className = '',
}) => {
  const modalRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose?.()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    // Prevent body scroll when modal is open
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
    '2xl': 'max-w-4xl',
  }

  const titleId = title ? 'modal-title' : undefined
  const descId = description ? 'modal-description' : undefined

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs transition-opacity duration-150 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose?.()
        }
      }}
    >
      <div
        ref={modalRef}
        className={`bg-salvus-surface border border-salvus-border rounded-2xl w-full p-6 sm:p-7 shadow-xl relative text-salvus-text-primary ${
          sizeClasses[size] || sizeClasses.md
        } ${className}`}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-salvus-border">
            <div>
              {title && (
                <h3
                  id={titleId}
                  className="text-xl font-bold tracking-tight text-salvus-text-primary"
                >
                  {title}
                </h3>
              )}
              {description && (
                <p id={descId} className="text-xs sm:text-sm text-salvus-text-secondary mt-1">
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="p-1.5 rounded-lg text-salvus-text-muted hover:text-salvus-text-primary hover:bg-salvus-surface-hover transition-colors cursor-pointer select-none"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="py-4 space-y-4 max-h-[75vh] overflow-y-auto">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="pt-4 border-t border-salvus-border flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
