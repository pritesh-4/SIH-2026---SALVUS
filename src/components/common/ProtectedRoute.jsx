/**
 * ProtectedRoute — Authoritative role-based route guard for Salvus.
 *
 * Enforces two-tier access control:
 * 1. Authentication Check: Unauthenticated visitors are redirected to /login with state.from preserved.
 * 2. Authorization (RBAC) Check: Authenticated users accessing routes outside their allowedRoles
 *    are redirected to their appropriate home portal (/citizen or /authority), preventing cross-role access.
 *
 * Handles INITIALIZING state cleanly to prevent flickering wrong dashboards during session bootstrap.
 */

import { Navigate, useLocation, Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { AUTH_STATE } from '../../context/authContextDef'

export const ProtectedRoute = ({ allowedRoles = [], children }) => {
  const { authState, isAuthenticated, role, user } = useAuth()
  const location = useLocation()

  // 1. Session Restoration / Initializing state (zero flicker)
  if (authState === AUTH_STATE.INITIALIZING) {
    return (
      <div className="min-h-screen bg-salvus-bg flex flex-col items-center justify-center gap-3 selection:bg-salvus-info selection:text-white">
        <div className="h-8 w-8 border-2 border-salvus-info border-t-transparent rounded-full animate-spin" />
        <span className="text-salvus-text-secondary text-xs font-medium tracking-wide">
          Verifying security authorization…
        </span>
      </div>
    )
  }

  // 2. Unauthenticated: Redirect to login with return intent
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // 3. Role Authorization: Check if user's role is permitted on this route
  if (allowedRoles.length > 0 && (!role || !allowedRoles.includes(role))) {
    // Determine safe fallback destination based on user's actual authenticated role
    const fallbackDestination = role === 'AUTHORITY' ? '/authority' : '/citizen'

    // Prevent infinite redirect loops if already on the destination
    if (location.pathname.startsWith(fallbackDestination)) {
      return children || <Outlet />
    }

    return <Navigate to={fallbackDestination} replace />
  }

  // 4. Authorized
  return children || <Outlet />
}

export default ProtectedRoute
