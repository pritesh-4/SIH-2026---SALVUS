import { forwardRef } from 'react'

/**
 * Reusable Calm Button Component
 *
 * Semantic variants:
 * - primary: Prominent primary action
 * - secondary: Calm neutral surface with border
 * - quiet: Minimalist ghost button
 * - outline: Border only, transparent bg
 * - critical: Urgent emergency / distress / irreversible action
 * - safe: Verified safe / confirm action
 * - warning: Advisory acknowledgement action
 *
 * Meets WCAG 2.1 touch target (min 44px on mobile / lg size) & accessible focus states.
 */
export const Button = forwardRef(
  (
    {
      children,
      variant = 'secondary',
      size = 'md',
      type = 'button',
      disabled = false,
      loading = false,
      fullWidth = false,
      leftIcon = null,
      rightIcon = null,
      className = '',
      onClick,
      ...props
    },
    ref
  ) => {
    // Base styles (calm typography, accessible focus ring, touch friendly)
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-colors duration-150 select-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-salvus-info'

    // Variant Styles (Strict Semantic Color System, Zero Neon)
    const variantStyles = {
      primary:
        'bg-salvus-text-primary text-salvus-bg hover:opacity-90 active:scale-[0.99] shadow-xs',
      secondary:
        'bg-salvus-surface border border-salvus-border text-salvus-text-primary hover:bg-salvus-surface-hover hover:border-salvus-border-strong active:scale-[0.99]',
      quiet:
        'bg-transparent text-salvus-text-secondary hover:text-salvus-text-primary hover:bg-salvus-surface-hover',
      outline:
        'bg-transparent border border-salvus-border text-salvus-text-primary hover:bg-salvus-surface-hover hover:border-salvus-border-strong',
      critical:
        'bg-salvus-critical text-white hover:opacity-90 active:scale-[0.99] shadow-xs focus-visible:ring-salvus-critical',
      danger:
        'bg-salvus-critical text-white hover:opacity-90 active:scale-[0.99] shadow-xs focus-visible:ring-salvus-critical',
      safe: 'bg-salvus-safe text-white hover:opacity-90 active:scale-[0.99] shadow-xs focus-visible:ring-salvus-safe',
      warning:
        'bg-salvus-warning text-white hover:opacity-90 active:scale-[0.99] shadow-xs focus-visible:ring-salvus-warning',
    }

    // Size Styles
    const sizeStyles = {
      sm: 'text-xs px-2.5 py-1.5 rounded-lg gap-1.5 min-h-[32px]',
      md: 'text-xs sm:text-sm px-4 py-2 rounded-lg gap-2 min-h-[40px]',
      lg: 'text-sm sm:text-base font-semibold px-6 py-3 rounded-xl gap-2.5 min-h-[48px]',
      icon: 'p-2 rounded-lg min-h-[36px] min-w-[36px]',
    }

    const widthStyle = fullWidth ? 'w-full' : ''

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading}
        onClick={onClick}
        className={`${baseStyles} ${variantStyles[variant] || variantStyles.secondary} ${
          sizeStyles[size] || sizeStyles.md
        } ${widthStyle} ${className}`}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        )}
        {!loading && leftIcon && <span className="shrink-0 flex items-center">{leftIcon}</span>}
        <span>{children}</span>
        {!loading && rightIcon && <span className="shrink-0 flex items-center">{rightIcon}</span>}
      </button>
    )
  }
)

Button.displayName = 'Button'
