/**
 * AuthContext — Centralized authentication session state & routing engine for Salvus.
 *
 * This is the SINGLE source of truth for authentication state in the frontend.
 * Enforces explicit authentication lifecycle states:
 * - INITIALIZING: Verifying existing token against server /me
 * - AUTHENTICATED: Real, verified user session active
 * - UNAUTHENTICATED: No active session (render login / public)
 * - AUTHENTICATION_ERROR: Failed authentication attempt
 *
 * Provides:
 * - authState     — Current lifecycle state (INITIALIZING | AUTHENTICATED | UNAUTHENTICATED | AUTHENTICATION_ERROR)
 * - user          — Verified identity object { id, email, name, role } | null
 * - role          — Shortcut for user?.role
 * - isAuthenticated — boolean (true strictly when AUTHENTICATED)
 * - isLoading     — boolean (true strictly when INITIALIZING)
 * - error         — Human-readable error string | null
 * - login(email, password) — Authenticate credentials & route to role home
 * - logout()      — Terminate session, clean up realtime, and route to /login
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { loginUser, fetchCurrentUser, logoutUser } from '../services/authService'
import { getAuthToken } from '../services/api'
import { cleanupSocketOnLogout } from '../lib/realtime/socket'
import { AuthContext, AUTH_STATE } from './authContextDef'

export { AUTH_STATE }

export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState(AUTH_STATE.INITIALIZING)
  const [user, setUser] = useState(null)
  const [error, setError] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()

  // -----------------------------------------------------------------------
  // 1. Session Bootstrap on App Startup
  // -----------------------------------------------------------------------
  useEffect(() => {
    let isCancelled = false

    const bootstrapSession = async () => {
      const token = getAuthToken()
      if (!token) {
        if (!isCancelled) {
          setAuthState(AUTH_STATE.UNAUTHENTICATED)
          setUser(null)
        }
        return
      }

      try {
        // Authoritatively verify token and reconstruct user identity from server
        const result = await fetchCurrentUser()
        if (isCancelled) return

        if (result.success && result.data?.user) {
          setUser({
            id: result.data.user.id,
            email: result.data.user.email,
            name: result.data.user.name,
            role: result.data.user.role,
          })
          setAuthState(AUTH_STATE.AUTHENTICATED)
        } else {
          // Token is invalid, expired, or malformed
          cleanupSocketOnLogout()
          logoutUser()
          setUser(null)
          setAuthState(AUTH_STATE.UNAUTHENTICATED)
        }
      } catch {
        if (!isCancelled) {
          cleanupSocketOnLogout()
          logoutUser()
          setUser(null)
          setAuthState(AUTH_STATE.UNAUTHENTICATED)
        }
      }
    }

    bootstrapSession()
    return () => {
      isCancelled = true
    }
  }, [])

  // -----------------------------------------------------------------------
  // 2. Centralized 401 Handler (Intercepted by api.js)
  // -----------------------------------------------------------------------
  useEffect(() => {
    const handleUnauthorized = () => {
      cleanupSocketOnLogout()
      logoutUser()
      setUser(null)
      setError(null)
      setAuthState(AUTH_STATE.UNAUTHENTICATED)
      navigate('/login', { replace: true, state: { reason: 'SESSION_EXPIRED' } })
    }

    window.addEventListener('salvus:auth:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('salvus:auth:unauthorized', handleUnauthorized)
  }, [navigate])

  // -----------------------------------------------------------------------
  // 3. Login
  // -----------------------------------------------------------------------
  const login = useCallback(
    async (email, password) => {
      setError(null)

      const result = await loginUser(email, password)

      if (result.success && result.data?.user) {
        const authenticatedUser = {
          id: result.data.user.id,
          email: result.data.user.email,
          name: result.data.user.full_name,
          role: result.data.user.role,
        }

        setUser(authenticatedUser)
        setAuthState(AUTH_STATE.AUTHENTICATED)

        // Route strictly based on server-derived role
        const role = authenticatedUser.role
        const defaultPath = role === 'AUTHORITY' ? '/authority' : '/citizen'

        // Check if there was an intended redirect target matching role
        const from = location.state?.from?.pathname
        let destination = defaultPath

        if (from && from !== '/login' && from !== '/') {
          const isCitizenPath = from.startsWith('/citizen')
          const isAuthorityPath = from.startsWith('/authority')

          if (role === 'CITIZEN' && isCitizenPath) {
            destination = from
          } else if (role === 'AUTHORITY' && isAuthorityPath) {
            destination = from
          }
        }

        navigate(destination, { replace: true })
        return { success: true, role }
      }

      setAuthState(AUTH_STATE.AUTHENTICATION_ERROR)
      const errorMessage = result.error?.message || 'Invalid email or password.'
      setError(errorMessage)
      return { success: false, error: errorMessage }
    },
    [navigate, location]
  )

  // -----------------------------------------------------------------------
  // 4. Logout & Comprehensive Teardown
  // -----------------------------------------------------------------------
  const logout = useCallback(() => {
    cleanupSocketOnLogout()
    logoutUser()
    setUser(null)
    setError(null)
    setAuthState(AUTH_STATE.UNAUTHENTICATED)
    navigate('/login', { replace: true })
  }, [navigate])

  // -----------------------------------------------------------------------
  // 5. Memoized Context Value
  // -----------------------------------------------------------------------
  const value = useMemo(
    () => ({
      authState,
      user,
      role: user?.role || null,
      isAuthenticated: authState === AUTH_STATE.AUTHENTICATED && !!user,
      isLoading: authState === AUTH_STATE.INITIALIZING,
      error,
      login,
      logout,
    }),
    [authState, user, error, login, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthContext
