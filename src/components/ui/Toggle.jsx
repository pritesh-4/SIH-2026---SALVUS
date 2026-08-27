import { forwardRef } from 'react'

/**
 * Reusable Accessible Toggle Switch Component
 */
export const Toggle = forwardRef(
  (
    {
      checked = false,
      onChange,
      label,
      description,
      disabled = false,
      id,
      className = '',
      ...props
    },
    ref
  ) => {
    const handleToggle = () => {
      if (disabled) return
      onChange?.(!checked)
    }

    return (
      <div className={`flex items-center justify-between gap-4 select-none ${className}`}>
        {(label || description) && (
          <div className="flex-1 min-w-0">
            {label && (
              <label
                htmlFor={id}
                onClick={handleToggle}
                className="text-xs sm:text-sm font-semibold text-salvus-text-primary block cursor-pointer"
              >
                {label}
              </label>
            )}
            {description && (
              <p className="text-xs text-salvus-text-secondary mt-0.5 leading-relaxed">
                {description}
              </p>
            )}
          </div>
        )}
        <button
          ref={ref}
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={handleToggle}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-salvus-info focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
            checked ? 'bg-salvus-safe' : 'bg-salvus-muted'
          }`}
          {...props}
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
              checked ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    )
  }
)

Toggle.displayName = 'Toggle'
