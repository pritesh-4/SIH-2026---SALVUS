import { forwardRef } from 'react'

/**
 * Accessible Status Indicator Component
 *
 * Ensures multi-channel perception (dot + label + icon).
 * State is NEVER communicated by color alone.
 */
export const StatusIndicator = forwardRef(
  (
    {
      status = 'safe',
      label,
      sublabel,
      showDot = true,
      showIcon = false,
      isPulse = false,
      size = 'md',
      className = '',
      ...props
    },
    ref
  ) => {
    const config = {
      safe: {
        colorClass: 'text-salvus-safe-text bg-salvus-safe-bg border-salvus-safe-border',
        dotClass: 'bg-salvus-safe',
        icon: '✓',
        defaultLabel: 'Safe / Normal',
      },
      warning: {
        colorClass: 'text-salvus-warning-text bg-salvus-warning-bg border-salvus-warning-border',
        dotClass: 'bg-salvus-warning',
        icon: '⚠️',
        defaultLabel: 'Advisory / Warning',
      },
      critical: {
        colorClass: 'text-salvus-critical-text bg-salvus-critical-bg border-salvus-critical-border',
        dotClass: 'bg-salvus-critical',
        icon: '🚨',
        defaultLabel: 'Critical Emergency',
      },
      info: {
        colorClass: 'text-salvus-info-text bg-salvus-info-bg border-salvus-info-border',
        dotClass: 'bg-salvus-info',
        icon: 'ℹ️',
        defaultLabel: 'Information',
      },
      neutral: {
        colorClass: 'text-salvus-text-secondary bg-salvus-muted border-salvus-border',
        dotClass: 'bg-salvus-text-muted',
        icon: '•',
        defaultLabel: 'Standard',
      },
    }

    const sizeStyles = {
      sm: 'text-[11px] px-2 py-0.5',
      md: 'text-xs px-2.5 py-1',
      lg: 'text-sm px-3 py-1.5',
    }

    const current = config[status] || config.neutral
    const displayLabel = label || current.defaultLabel

    return (
      <div
        ref={ref}
        role="status"
        aria-label={`Status: ${displayLabel}`}
        className={`inline-flex items-center gap-2 ${className}`}
        {...props}
      >
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border font-semibold select-none ${
            sizeStyles[size] || sizeStyles.md
          } ${current.colorClass}`}
        >
          {showDot && (
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${current.dotClass} ${
                isPulse && status === 'critical' ? 'pulse-critical' : ''
              }`}
              aria-hidden="true"
            />
          )}
          {showIcon && <span aria-hidden="true">{current.icon}</span>}
          <span>{displayLabel}</span>
        </span>
        {sublabel && (
          <span className="text-xs text-salvus-text-muted hidden sm:inline">{sublabel}</span>
        )}
      </div>
    )
  }
)

StatusIndicator.displayName = 'StatusIndicator'
