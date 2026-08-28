/**
 * Consistent Section Header Component
 *
 * Replaces ad-hoc heading patterns across pages.
 * Supports title, optional subtitle/description, and right-side action slot.
 */
export const SectionHeader = ({
  title,
  subtitle = null,
  action = null,
  as: Component = 'h2',
  className = '',
}) => {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <Component className="text-h2 font-bold text-salvus-text-primary tracking-tight leading-snug">
          {title}
        </Component>
        {subtitle && (
          <p className="text-body text-salvus-text-secondary mt-0.5 leading-relaxed">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0 flex items-center">{action}</div>}
    </div>
  )
}
