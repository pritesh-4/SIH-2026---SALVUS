import { useTheme } from '../../lib/themeContext'

/**
 * Citizen Portal Theme Toggle
 *
 * Highly recognizable, friendly, accessible switcher for citizens.
 */
export const CitizenThemeToggle = ({ className = '' }) => {
  const { theme, setTheme } = useTheme()

  const options = [
    { value: 'light', label: 'Light', icon: '☀️' },
    { value: 'dark', label: 'Dark', icon: '🌙' },
    { value: 'system', label: 'Auto', icon: '⚙️' },
  ]

  return (
    <div
      role="radiogroup"
      aria-label="Color theme selection"
      className={`inline-flex items-center p-1 rounded-xl bg-salvus-surface border border-salvus-border text-xs ${className}`}
    >
      {options.map((opt) => {
        const isSelected = theme === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => setTheme(opt.value)}
            title={`Switch to ${opt.label} theme`}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-all select-none cursor-pointer ${
              isSelected
                ? 'bg-salvus-surface-elevated text-salvus-text-primary shadow-xs font-semibold'
                : 'text-salvus-text-muted hover:text-salvus-text-primary'
            }`}
          >
            <span aria-hidden="true" className="text-xs">
              {opt.icon}
            </span>
            <span className="hidden sm:inline text-[11px]">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Authority Operations Theme Toggle
 *
 * Quiet, unobtrusive utility control for dispatch operators and commander consoles.
 */
export const AuthorityThemeToggle = ({ className = '' }) => {
  const { resolvedTheme, toggleTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
      aria-label={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-salvus-surface border border-salvus-border text-salvus-text-secondary hover:text-salvus-text-primary hover:bg-salvus-surface-hover text-xs transition-colors cursor-pointer select-none ${className}`}
    >
      <span aria-hidden="true">{isDark ? '🌙' : '☀️'}</span>
      <span className="font-mono text-[11px] hidden md:inline">{isDark ? 'DARK' : 'LIGHT'}</span>
    </button>
  )
}

export const ThemeToggle = CitizenThemeToggle
