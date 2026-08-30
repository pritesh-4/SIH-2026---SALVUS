import { useEffect, useRef, useId, useCallback } from 'react'

/**
 * Accessible Drawer/Slide-Over Panel
 *
 * Positions: right (default), left, bottom
 * Features: focus trapping, backdrop click-to-close, Escape key, body scroll lock.
 * Mirrors Modal accessibility patterns.
 */
export const Drawer = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  position = 'right',
  size = 'md',
  footer = null,
  showCloseButton = true,
  className = '',
}) => {
  const drawerRef = useRef(null)
  const previousFocusRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const uniqueId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const handleTabTrap = useCallback((e) => {
    if (e.key !== 'Tab' || !drawerRef.current) return

    const focusableSelectors =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const focusableElements = drawerRef.current.querySelectorAll(focusableSelectors)
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

    previousFocusRef.current = document.activeElement

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current?.()
        return
      }
      handleTabTrap(e)
    }

    document.addEventListener('keydown', handleKeyDown)
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    if (drawerRef.current && !drawerRef.current.contains(document.activeElement)) {
      drawerRef.current.focus()
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus()
      }
    }
  }, [isOpen, handleTabTrap])

  if (!isOpen) return null

  const sizeClasses = {
    sm: position === 'bottom' ? 'max-h-[40vh]' : 'max-w-sm w-full',
    md: position === 'bottom' ? 'max-h-[60vh]' : 'max-w-md w-full',
    lg: position === 'bottom' ? 'max-h-[75vh]' : 'max-w-lg w-full',
    xl: position === 'bottom' ? 'max-h-[85vh]' : 'max-w-2xl w-full',
  }

  const positionClasses = {
    right: 'inset-y-0 right-0 animate-slideInRight',
    left: 'inset-y-0 left-0 animate-slideInLeft',
    bottom: 'inset-x-0 bottom-0 animate-slideInUp',
  }

  const roundingClasses = {
    right: 'rounded-l-2xl',
    left: 'rounded-r-2xl',
    bottom: 'rounded-t-2xl',
  }

  const titleId = title ? `${uniqueId}-drawer-title` : undefined
  const descId = description ? `${uniqueId}-drawer-desc` : undefined

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="fixed inset-0 z-50 flex bg-black/50 backdrop-blur-xs transition-opacity duration-150 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose?.()
        }
      }}
    >
      <div
        ref={drawerRef}
        tabIndex={-1}
        className={`fixed bg-salvus-surface border border-salvus-border shadow-xl flex flex-col outline-none ${
          positionClasses[position] || positionClasses.right
        } ${roundingClasses[position] || roundingClasses.right} ${
          sizeClasses[size] || sizeClasses.md
        } ${className}`}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-start justify-between gap-4 p-5 pb-4 border-b border-salvus-border shrink-0">
            <div>
              {title && (
                <h3
                  id={titleId}
                  className="text-h3 font-bold tracking-tight text-salvus-text-primary"
                >
                  {title}
                </h3>
              )}
              {description && (
                <p id={descId} className="text-caption text-salvus-text-secondary mt-1">
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close panel"
                className="p-1.5 rounded-lg text-salvus-text-muted hover:text-salvus-text-primary hover:bg-salvus-surface-hover transition-colors cursor-pointer select-none"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="p-5 pt-4 border-t border-salvus-border flex items-center justify-end gap-3 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
