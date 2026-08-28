/**
 * Calm Loading State Component
 *
 * Variants:
 * - spinner: Subtle animated spinner
 * - skeleton: Placeholder skeleton lines
 *
 * Fully accessible with aria-busy and screen reader labels.
 */
export const LoadingState = ({
  variant = 'spinner',
  label = 'Loading…',
  lines = 3,
  className = '',
}) => {
  if (variant === 'skeleton') {
    return (
      <div role="status" aria-busy="true" aria-label={label} className={`space-y-3 ${className}`}>
        <span className="sr-only">{label}</span>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`h-4 rounded-lg bg-salvus-muted animate-pulse ${
              i === lines - 1 ? 'w-3/5' : i % 2 === 0 ? 'w-full' : 'w-4/5'
            }`}
            aria-hidden="true"
          />
        ))}
      </div>
    )
  }

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={`flex flex-col items-center justify-center py-12 px-6 ${className}`}
    >
      <svg
        className="h-8 w-8 text-salvus-text-muted animate-spin"
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
          strokeWidth="3"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <p className="mt-3 text-body text-salvus-text-muted font-medium">{label}</p>
    </div>
  )
}
