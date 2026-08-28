/**
 * Consistent Empty State Component
 *
 * Used when a list, panel, or section has no data to display.
 * Provides calm, clear messaging with optional action.
 */
export const EmptyState = ({
  icon = null,
  title = 'Nothing here yet',
  description = '',
  action = null,
  className = '',
}) => {
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className}`}
    >
      {icon && (
        <div className="mb-4 text-salvus-text-muted" aria-hidden="true">
          {typeof icon === 'string' ? (
            <span className="text-3xl">{icon}</span>
          ) : (
            <span className="flex items-center justify-center w-12 h-12 rounded-xl bg-salvus-muted">
              {icon}
            </span>
          )}
        </div>
      )}
      <h3 className="text-body-lg font-semibold text-salvus-text-primary tracking-tight">
        {title}
      </h3>
      {description && (
        <p className="text-body text-salvus-text-secondary mt-1.5 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
