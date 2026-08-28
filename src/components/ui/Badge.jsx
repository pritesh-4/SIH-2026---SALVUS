import { forwardRef } from 'react'

/**
 * Reusable Calm Badge Component
 *
 * Semantic variants:
 * - neutral: Neutral gray / slate tag
 * - safe: Verified safe / active normal state
 * - warning: Advisory / elevated watch
 * - critical: Urgent life threat / critical incident
 * - info: Situational info / system notice
 *
 * Typography:
 * - isMono: ONLY for incident IDs, technical timestamps, coordinates
 * - default: Standard sans-serif for normal labels
 */
export const Badge = forwardRef(
  (
    {
      children,
      variant = 'neutral',
      size = 'sm',
      isMono = false,
      dot = false,
      icon = null,
      className = '',
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center font-medium rounded-md border select-none transition-colors'

    const variantStyles = {
      neutral: 'bg-salvus-muted text-salvus-text-secondary border-salvus-border',
      safe: 'bg-salvus-safe-bg text-salvus-safe-text border-salvus-safe-border',
      warning: 'bg-salvus-warning-bg text-salvus-warning-text border-salvus-warning-border',
      critical: 'bg-salvus-critical-bg text-salvus-critical-text border-salvus-critical-border',
      danger: 'bg-salvus-critical-bg text-salvus-critical-text border-salvus-critical-border',
      info: 'bg-salvus-info-bg text-salvus-info-text border-salvus-info-border',
    }

    const dotColors = {
      neutral: 'bg-salvus-text-muted',
      safe: 'bg-salvus-safe',
      warning: 'bg-salvus-warning',
      critical: 'bg-salvus-critical',
      danger: 'bg-salvus-critical',
      info: 'bg-salvus-info',
    }

    const sizeStyles = {
      sm: 'text-[11px] px-2 py-0.5 gap-1.5',
      md: 'text-xs px-2.5 py-1 gap-2',
    }

    const fontStyle = isMono ? 'font-mono' : 'font-sans'

    return (
      <span
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant] || variantStyles.neutral} ${
          sizeStyles[size] || sizeStyles.sm
        } ${fontStyle} ${className}`}
        {...props}
      >
        {dot && (
          <span
            className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColors[variant] || dotColors.neutral}`}
            aria-hidden="true"
          />
        )}
        {icon && <span className="shrink-0 flex items-center">{icon}</span>}
        <span>{children}</span>
      </span>
    )
  }
)

Badge.displayName = 'Badge'
