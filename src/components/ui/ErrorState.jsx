import { AlertCircle } from 'lucide-react'

/**
 * Error State Component
 *
 * Displays error messages with optional retry action.
 * Uses semantic critical styling without being alarming for non-emergency errors.
 */
export const ErrorState = ({
  icon = null,
  title = 'Something went wrong',
  description = 'An unexpected error occurred. Please try again.',
  onRetry = null,
  retryLabel = 'Try again',
  className = '',
}) => {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className}`}
    >
      <div
        className="mb-4 flex items-center justify-center w-12 h-12 rounded-xl bg-salvus-critical-bg text-salvus-critical"
        aria-hidden="true"
      >
        {icon || <AlertCircle className="w-6 h-6" />}
      </div>
      <h3 className="text-body-lg font-semibold text-salvus-text-primary tracking-tight">
        {title}
      </h3>
      {description && (
        <p className="text-body text-salvus-text-secondary mt-1.5 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-body font-medium bg-salvus-surface border border-salvus-border text-salvus-text-primary hover:bg-salvus-surface-hover transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-salvus-info focus-visible:ring-offset-2"
        >
          {retryLabel}
        </button>
      )}
    </div>
  )
}
