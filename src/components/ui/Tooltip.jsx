import { useState, useRef, useEffect, useId } from 'react'

/**
 * Lightweight Accessible Tooltip
 *
 * Positions: top, bottom, left, right
 * Triggers on hover and keyboard focus.
 * Uses role="tooltip" and aria-describedby for screen readers.
 */
export const Tooltip = ({ children, content, position = 'top', delay = 200, className = '' }) => {
  const [isVisible, setIsVisible] = useState(false)
  const timeoutRef = useRef(null)
  const uniqueId = useId()
  const tooltipId = `${uniqueId}-tooltip`

  const show = () => {
    timeoutRef.current = setTimeout(() => setIsVisible(true), delay)
  }

  const hide = () => {
    clearTimeout(timeoutRef.current)
    setIsVisible(false)
  }

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current)
  }, [])

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }

  if (!content) return children

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <div aria-describedby={isVisible ? tooltipId : undefined}>{children}</div>
      {isVisible && (
        <div
          id={tooltipId}
          role="tooltip"
          className={`absolute z-50 px-2.5 py-1.5 text-caption font-medium rounded-lg bg-salvus-text-primary text-salvus-bg border border-salvus-border-strong shadow-sm whitespace-nowrap pointer-events-none animate-fadeIn ${
            positionClasses[position] || positionClasses.top
          } ${className}`}
        >
          {content}
        </div>
      )}
    </div>
  )
}
