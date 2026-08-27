import { forwardRef } from 'react'

/**
 * Reusable Calm Card Component
 *
 * Variants:
 * - default: Standard surface with subtle border
 * - elevated: Elevated surface with minimal calm shadow
 * - subtle: Light muted surface for secondary sections
 * - interactive: Hoverable card with subtle border transition
 * - safe: Status card with subtle left safe border
 * - warning: Status card with subtle left warning border
 * - critical: Status card with subtle left critical border
 * - info: Status card with subtle left info border
 */
export const Card = forwardRef(
  (
    {
      children,
      variant = 'default',
      padding = 'md',
      className = '',
      onClick,
      role,
      tabIndex,
      ...props
    },
    ref
  ) => {
    const baseStyles = 'rounded-xl transition-colors duration-150 relative text-salvus-text-primary'

    const variantStyles = {
      default: 'bg-salvus-surface border border-salvus-border',
      elevated: 'bg-salvus-surface-elevated border border-salvus-border shadow-xs',
      subtle: 'bg-salvus-muted/40 border border-salvus-border/70',
      interactive:
        'bg-salvus-surface border border-salvus-border hover:border-salvus-border-strong cursor-pointer active:scale-[0.995]',
      safe: 'bg-salvus-surface border border-salvus-border border-l-4 border-l-salvus-safe',
      warning: 'bg-salvus-surface border border-salvus-border border-l-4 border-l-salvus-warning',
      critical: 'bg-salvus-surface border border-salvus-border border-l-4 border-l-salvus-critical',
      info: 'bg-salvus-surface border border-salvus-border border-l-4 border-l-salvus-info',
    }

    const paddingStyles = {
      none: '',
      sm: 'p-3 sm:p-4',
      md: 'p-4 sm:p-6',
      lg: 'p-6 sm:p-8',
    }

    const isInteractive = variant === 'interactive' || !!onClick

    return (
      <div
        ref={ref}
        onClick={onClick}
        role={role || (isInteractive ? 'button' : undefined)}
        tabIndex={tabIndex ?? (isInteractive ? 0 : undefined)}
        onKeyDown={
          isInteractive && onClick
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onClick(e)
                }
              }
            : undefined
        }
        className={`${baseStyles} ${variantStyles[variant] || variantStyles.default} ${
          paddingStyles[padding] || paddingStyles.md
        } ${isInteractive ? 'focus-visible:ring-2 focus-visible:ring-salvus-info focus-visible:outline-none' : ''} ${className}`}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Card.displayName = 'Card'

export const CardHeader = ({ children, className = '', ...props }) => (
  <div className={`flex flex-col space-y-1.5 pb-3 ${className}`} {...props}>
    {children}
  </div>
)

export const CardTitle = ({ children, className = '', as: Component = 'h3', ...props }) => (
  <Component
    className={`text-lg font-bold text-salvus-text-primary tracking-tight leading-snug ${className}`}
    {...props}
  >
    {children}
  </Component>
)

export const CardDescription = ({ children, className = '', ...props }) => (
  <p
    className={`text-xs sm:text-sm text-salvus-text-secondary leading-relaxed ${className}`}
    {...props}
  >
    {children}
  </p>
)

export const CardContent = ({ children, className = '', ...props }) => (
  <div className={`space-y-3 ${className}`} {...props}>
    {children}
  </div>
)

export const CardFooter = ({ children, className = '', ...props }) => (
  <div
    className={`pt-4 border-t border-salvus-border flex items-center justify-between gap-3 ${className}`}
    {...props}
  >
    {children}
  </div>
)
