import { useEffect, useState, useMemo, useCallback } from 'react'
import { ThemeContext } from './themeContext'

const THEME_STORAGE_KEY = 'salvus_theme'

export const ThemeProvider = ({ children, defaultTheme = 'system' }) => {
  const [theme, setThemeState] = useState(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY)
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored
      }
    } catch {
      // localStorage may fail in restricted/iframe environments
    }
    return defaultTheme
  })

  const [resolvedTheme, setResolvedTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark'
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return theme
  })

  useEffect(() => {
    const root = document.documentElement

    const applyTheme = (effectiveTheme) => {
      setResolvedTheme(effectiveTheme)
      if (effectiveTheme === 'dark') {
        root.classList.add('dark')
        root.classList.remove('light')
      } else {
        root.classList.remove('dark')
        root.classList.add('light')
      }
      root.style.colorScheme = effectiveTheme
    }

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      applyTheme(mediaQuery.matches ? 'dark' : 'light')

      const handler = (e) => {
        applyTheme(e.matches ? 'dark' : 'light')
      }

      mediaQuery.addEventListener('change', handler)
      return () => mediaQuery.removeEventListener('change', handler)
    } else {
      applyTheme(theme)
    }
  }, [theme])

  const setTheme = useCallback((newTheme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme)
    } catch {
      // ignore
    }
    setThemeState(newTheme)
  }, [])

  const toggleTheme = useCallback(() => {
    if (theme === 'light') {
      setTheme('dark')
    } else if (theme === 'dark') {
      setTheme('light')
    } else {
      // If currently system, toggle to opposite of current resolved theme
      setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
    }
  }, [theme, resolvedTheme, setTheme])

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      toggleTheme,
    }),
    [theme, resolvedTheme, setTheme, toggleTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
