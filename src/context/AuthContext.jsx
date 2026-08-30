/**
 * AuthContext — Centralized authentication session state for Salvus.
 *
 * This is the SINGLE source of truth for authentication state in the frontend.
 * All components should use the useAuth() hook instead of directly accessing
 * localStorage or making scattered auth API calls.
 *
 * Provides:
 * - user       — current authenticated user object { id, email, name, role }
 * - isAuthenticated — boolean
 * - isLoading  — true during initial session rehydration
 * - error      — authentication error message (cleared on next attempt)
 * - login(email, password) — authenticate with credentials
 * - logout()   — clear session and redirect to /login
 * - role       — shortcut for user?.role
 */

import { createContext, useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { loginUser, fetchCurrentUser, logoutUser } from '../services/authService'
import { getAuthToken } from '../services/api'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()

  // -----------------------------------------------------------------------
  // Session rehydration on mount — check if we have an existing valid token
  // -----------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false

    const rehydrate = async () => {
      const token = getAuthToken()
      if (!token) {
        setIsLoading(false)
        return
      }

      const result = await fetchCurrentUser()
      if (cancelled) return

      if (result.success && result.data?.user) {
        setUser(result.data.user)
      } else {
        // Token is invalid or expired — clear it
        logoutUser()
        setUser(null)
      }
      setIsLoading(false)
    }

    rehydrate()
    return () => {
      cancelled = true
    }
  }, [])

  // -----------------------------------------------------------------------
  // Listen for 401 unauthorized events from the API interceptor
  // -----------------------------------------------------------------------
  useEffect(() => {
    const handleUnauthorized = () => {
      logoutUser()
      setUser(null)
      setError(null)
      navigate('/login', { replace: true })
    }

    window.addEventListener('salvus:auth:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('salvus:auth:unauthorized', handleUnauthorized)
  }, [navigate])

  // -----------------------------------------------------------------------
  // Login
  // -----------------------------------------------------------------------
  const login = useCallback(
    async (email, password) => {
      setError(null)
      setIsLoading(true)

      const result = await loginUser(email, password)

      if (result.success && result.data?.user) {
        setUser({
          id: result.data.user.id,
          email: result.data.user.email,
          name: result.data.user.full_name,
          role: result.data.user.role,
        })
        setIsLoading(false)

        // Route based on server-determined role (not frontend selection)
        const role = result.data.user.role
        const targetPath = role === 'AUTHORITY' ? '/authority' : '/citizen'

        // If we came from a protected page, go back there
        const from = location.state?.from?.pathname
        navigate(from || targetPath, { replace: true })

        return { success: true }
      }

      setIsLoading(false)
      const errorMessage = result.error?.message || 'Authentication failed.'
      setError(errorMessage)
      return { success: false, error: errorMessage }
    },
    [navigate, location]
  )

  // -----------------------------------------------------------------------
  // Logout
  // -----------------------------------------------------------------------
  const logout = useCallback(() => {
    logoutUser()
    setUser(null)
    setError(null)
    navigate('/login', { replace: true })
  }, [navigate])

  // -----------------------------------------------------------------------
  // Context value (memoized to prevent unnecessary re-renders)
  // -----------------------------------------------------------------------
  const value = useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      error,
      login,
      logout,
      role: user?.role || null,
    }),
    [user, isLoading, error, login, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthContext
