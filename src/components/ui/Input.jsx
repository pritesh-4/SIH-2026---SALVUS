import { forwardRef } from 'react'

/**
 * Reusable Calm Form Controls
 *
 * Input, Textarea, Select, Checkbox, Label, FormField
 */

export const Label = forwardRef(
  ({ children, required = false, className = '', htmlFor, ...props }, ref) => (
    <label
      ref={ref}
      htmlFor={htmlFor}
      className={`block text-xs font-semibold text-salvus-text-secondary select-none mb-1.5 ${className}`}
      {...props}
    >
      {children}
      {required && (
        <span className="text-salvus-critical ml-1" aria-hidden="true">
          *
        </span>
      )}
    </label>
  )
)
Label.displayName = 'Label'

export const Input = forwardRef(
  ({ error = false, className = '', disabled = false, ...props }, ref) => {
    const baseStyles =
      'w-full bg-salvus-surface border rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-salvus-text-primary placeholder:text-salvus-text-muted transition-colors focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[42px]'

    const stateStyles = error
      ? 'border-salvus-critical focus:border-salvus-critical focus:ring-salvus-critical/20'
      : 'border-salvus-border focus:border-salvus-info focus:ring-salvus-info/20'

    return (
      <input
        ref={ref}
        disabled={disabled}
        aria-invalid={!!error}
        className={`${baseStyles} ${stateStyles} ${className}`}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export const Textarea = forwardRef(
  ({ error = false, className = '', disabled = false, rows = 3, ...props }, ref) => {
    const baseStyles =
      'w-full bg-salvus-surface border rounded-xl p-3.5 text-xs sm:text-sm text-salvus-text-primary placeholder:text-salvus-text-muted transition-colors focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y'

    const stateStyles = error
      ? 'border-salvus-critical focus:border-salvus-critical focus:ring-salvus-critical/20'
      : 'border-salvus-border focus:border-salvus-info focus:ring-salvus-info/20'

    return (
      <textarea
        ref={ref}
        rows={rows}
        disabled={disabled}
        aria-invalid={!!error}
        className={`${baseStyles} ${stateStyles} ${className}`}
        {...props}
      />
    )
  }
)
Textarea.displayName = 'Textarea'

export const Select = forwardRef(
  ({ error = false, className = '', disabled = false, children, ...props }, ref) => {
    const baseStyles =
      'w-full bg-salvus-surface border rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-salvus-text-primary transition-colors focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[42px] cursor-pointer'

    const stateStyles = error
      ? 'border-salvus-critical focus:border-salvus-critical focus:ring-salvus-critical/20'
      : 'border-salvus-border focus:border-salvus-info focus:ring-salvus-info/20'

    return (
      <select
        ref={ref}
        disabled={disabled}
        aria-invalid={!!error}
        className={`${baseStyles} ${stateStyles} ${className}`}
        {...props}
      >
        {children}
      </select>
    )
  }
)
Select.displayName = 'Select'

export const Checkbox = forwardRef(
  ({ label, description, error = false, className = '', disabled = false, id, ...props }, ref) => {
    return (
      <div className={`flex items-start gap-3 select-none ${className}`}>
        <div className="flex items-center h-5">
          <input
            ref={ref}
            id={id}
            type="checkbox"
            disabled={disabled}
            aria-invalid={!!error}
            className="h-4 w-4 rounded border-salvus-border text-salvus-info focus:ring-salvus-info focus:ring-2 focus:ring-offset-2 cursor-pointer disabled:cursor-not-allowed"
            {...props}
          />
        </div>
        {(label || description) && (
          <div className="text-xs sm:text-sm">
            {label && (
              <label htmlFor={id} className="font-medium text-salvus-text-primary cursor-pointer">
                {label}
              </label>
            )}
            {description && (
              <p className="text-xs text-salvus-text-secondary mt-0.5">{description}</p>
            )}
          </div>
        )}
      </div>
    )
  }
)
Checkbox.displayName = 'Checkbox'

export const FormField = ({
  label,
  error,
  helperText,
  required = false,
  htmlFor,
  children,
  className = '',
}) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      )}
      {children}
      {error && <p className="text-xs text-salvus-critical font-medium">{error}</p>}
      {!error && helperText && <p className="text-xs text-salvus-text-muted">{helperText}</p>}
    </div>
  )
}
