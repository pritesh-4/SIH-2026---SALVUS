import { forwardRef } from 'react'

/**
 * Reusable Calm Alert Component
 *
 * Semantic variants:
 * - info: General advisory or coordination note
 * - safe: Safe status or positive resolution
 * - warning: Hazard warning or attention required
 * - critical: Urgent emergency or critical threat alert
 */
export const Alert = forwardRef(
  (
    {
      title,
      description,
      children,
      variant = 'info',
      icon = null,
      onClose,
      action = null,
      className = '',
      ...props
    },
    ref
  ) => {
    const variantStyles = {
      info: {
        container: 'bg-salvus-info-bg border-salvus-info-border text-salvus-info-text',
        icon: 'ℹ️',
        role: 'status',
      },
      safe: {
        container: 'bg-salvus-safe-bg border-salvus-safe-border text-salvus-safe-text',
        icon: '✓',
        role: 'status',
      },
      warning: {
        container: 'bg-salvus-warning-bg border-salvus-warning-border text-salvus-warning-text',
        icon: '⚠️',
        role: 'alert',
      },
      critical: {
        container: 'bg-salvus-critical-bg border-salvus-critical-border text-salvus-critical-text',
        icon: '🚨',
        role: 'alert',
      },
    }

    const current = variantStyles[variant] || variantStyles.info
    const displayIcon = icon || current.icon

    return (
      <div
        ref={ref}
        role={current.role}
        className={`p-4 rounded-xl border flex items-start gap-3.5 transition-colors ${current.container} ${className}`}
        {...props}
      >
        <span className="text-base shrink-0 select-none mt-0.5" aria-hidden="true">
          {displayIcon}
        </span>
        <div className="flex-1 min-w-0 space-y-1">
          {title && <h4 className="text-sm font-bold tracking-tight">{title}</h4>}
          {description && (
            <p className="text-xs sm:text-sm leading-relaxed opacity-90">{description}</p>
          )}
          {children && <div className="text-xs sm:text-sm leading-relaxed">{children}</div>}
          {action && <div className="pt-2">{action}</div>}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Dismiss alert"
            className="p-1 rounded-md hover:opacity-75 transition-opacity cursor-pointer text-current select-none"
          >
            ✕
          </button>
        )}
      </div>
    )
  }
)

Alert.displayName = 'Alert'
