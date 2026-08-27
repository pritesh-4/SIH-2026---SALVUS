import { createContext, useContext } from 'react'

const TabsContext = createContext({
  value: '',
  onChange: () => {},
})

/**
 * Reusable Calm Tabs Component
 */
export const Tabs = ({ value, onChange, children, className = '' }) => {
  return (
    <TabsContext.Provider value={{ value, onChange }}>
      <div className={`space-y-4 ${className}`}>{children}</div>
    </TabsContext.Provider>
  )
}

export const TabList = ({ children, className = '', ariaLabel = 'Navigation tabs' }) => {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex items-center gap-1.5 p-1 bg-salvus-muted rounded-xl border border-salvus-border overflow-x-auto ${className}`}
    >
      {children}
    </div>
  )
}

export const Tab = ({
  value: tabValue,
  children,
  badge,
  icon,
  disabled = false,
  className = '',
}) => {
  const { value, onChange } = useContext(TabsContext)
  const isSelected = value === tabValue

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isSelected}
      disabled={disabled}
      onClick={() => onChange(tabValue)}
      className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all select-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 shrink-0 ${
        isSelected
          ? 'bg-salvus-surface text-salvus-text-primary shadow-xs font-semibold'
          : 'text-salvus-text-secondary hover:text-salvus-text-primary hover:bg-salvus-surface/50'
      } ${className}`}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      <span>{children}</span>
      {badge !== undefined && badge !== null && (
        <span
          className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
            isSelected
              ? 'bg-salvus-muted text-salvus-text-primary'
              : 'bg-salvus-surface text-salvus-text-secondary'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

export const TabPanel = ({ value: panelValue, children, className = '' }) => {
  const { value } = useContext(TabsContext)
  if (value !== panelValue) return null

  return (
    <div role="tabpanel" tabIndex={0} className={`focus-visible:outline-none ${className}`}>
      {children}
    </div>
  )
}
