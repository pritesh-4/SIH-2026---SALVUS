import { forwardRef } from 'react'
import { CheckCircle, AlertTriangle, AlertOctagon, Info, Minus } from 'lucide-react'

/**
 * Accessible Status Indicator Component
 *
 * Ensures multi-channel perception (dot + label + icon).
 * State is NEVER communicated by color alone.
 *
 * Uses Lucide icons for consistent visual weight across platforms.
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
        Icon: CheckCircle,
        defaultLabel: 'Safe / Normal',
      },
      warning: {
        colorClass: 'text-salvus-warning-text bg-salvus-warning-bg border-salvus-warning-border',
        dotClass: 'bg-salvus-warning',
        Icon: AlertTriangle,
        defaultLabel: 'Advisory / Warning',
      },
      critical: {
        colorClass: 'text-salvus-critical-text bg-salvus-critical-bg border-salvus-critical-border',
        dotClass: 'bg-salvus-critical',
        Icon: AlertOctagon,
        defaultLabel: 'Critical Emergency',
      },
      info: {
        colorClass: 'text-salvus-info-text bg-salvus-info-bg border-salvus-info-border',
        dotClass: 'bg-salvus-info',
        Icon: Info,
        defaultLabel: 'Information',
      },
      neutral: {
        colorClass: 'text-salvus-text-secondary bg-salvus-muted border-salvus-border',
        dotClass: 'bg-salvus-text-muted',
        Icon: Minus,
        defaultLabel: 'Standard',
      },
    }

    const sizeStyles = {
      sm: 'text-[11px] px-2 py-0.5',
      md: 'text-caption px-2.5 py-1',
      lg: 'text-body px-3 py-1.5',
    }

    const iconSizes = {
      sm: 'w-3 h-3',
      md: 'w-3.5 h-3.5',
      lg: 'w-4 h-4',
    }

    const current = config[status] || config.neutral
    const displayLabel = label || current.defaultLabel
    const IconComponent = current.Icon

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
          {showIcon && (
            <span aria-hidden="true">
              <IconComponent className={iconSizes[size] || iconSizes.md} />
            </span>
          )}
          <span>{displayLabel}</span>
        </span>
        {sublabel && (
          <span className="text-caption text-salvus-text-muted hidden sm:inline">{sublabel}</span>
        )}
      </div>
    )
  }
)

StatusIndicator.displayName = 'StatusIndicator'
