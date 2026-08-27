import { useEffect, useRef, useId, useCallback } from 'react'

/**
 * Reusable Calm Modal Component
 *
 * Accessible dialog with focus trapping, auto-focus, backdrop listener,
 * escape key listener, body scroll lock, and clean layout.
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
  const previousFocusRef = useRef(null)
  const uniqueId = useId()

  // Focus trapping: keep Tab cycling within the modal
  const handleTabTrap = useCallback((e) => {
    if (e.key !== 'Tab' || !modalRef.current) return

    const focusableSelectors =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const focusableElements = modalRef.current.querySelectorAll(focusableSelectors)
    if (focusableElements.length === 0) return

    const firstEl = focusableElements[0]
    const lastEl = focusableElements[focusableElements.length - 1]

    if (e.shiftKey) {
      if (document.activeElement === firstEl) {
        e.preventDefault()
        lastEl.focus()
      }
    } else {
      if (document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return

    // Save previously focused element for restoration on close
    previousFocusRef.current = document.activeElement

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose?.()
        return
      }
      handleTabTrap(e)
    }

    document.addEventListener('keydown', handleKeyDown)
    // Prevent body scroll when modal is open
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Auto-focus the modal container
    if (modalRef.current) {
      modalRef.current.focus()
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
      // Restore focus to previously focused element
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus()
      }
    }
  }, [isOpen, onClose, handleTabTrap])

  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
    '2xl': 'max-w-4xl',
  }

  const titleId = title ? `${uniqueId}-modal-title` : undefined
  const descId = description ? `${uniqueId}-modal-desc` : undefined

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
        tabIndex={-1}
        className={`bg-salvus-surface border border-salvus-border rounded-2xl w-full p-6 sm:p-7 shadow-xl relative text-salvus-text-primary outline-none ${
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
