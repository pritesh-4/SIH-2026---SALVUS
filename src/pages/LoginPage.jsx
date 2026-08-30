/**
 * LoginPage — Salvus Unified Authentication Gateway
 *
 * Professional, accessible gateway supporting both CITIZEN and AUTHORITY operations.
 *
 * Core Guarantees:
 * 1. Single unified entry point with explicit role guidance and calm feedback.
 * 2. Real credential verification via POST /api/auth/login (no mock bypasses).
 * 3. Hackathon demo sign-in helper that fills credentials and executes real authentication.
 * 4. Password show/hide toggle, email format validation, and clear error categorization.
 * 5. Active emergency session detection and session expiration recovery.
 * 6. Accessible (WCAG AA), keyboard navigable, and fully responsive (360px to 1440px+).
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { loadEmergencyCache } from '../lib/emergencyCache'

const ROLES = [
  {
    id: 'CITIZEN',
    label: 'Citizen',
    icon: '👤',
    tagline: 'Get help. Stay informed. Stay safe.',
    description: 'Access safety services, verify evacuation shelters, and report emergencies.',
    defaultEmail: 'citizen@salvus.demo',
    defaultPassword: 'Salvus@Citizen2026',
    destination: '/citizen',
  },
  {
    id: 'AUTHORITY',
    label: 'Authority',
    icon: '🛡️',
    tagline: 'Coordinate response. Understand incidents. Deploy resources.',
    description: 'Access the operational command grid, triage queue, and responder dispatch.',
    defaultEmail: 'authority@salvus.demo',
    defaultPassword: 'Salvus@Authority2026',
    destination: '/authority',
  },
]

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const LoginPage = () => {
  const { login, isAuthenticated, isLoading: authLoading, error: authError, role } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [selectedRole, setSelectedRole] = useState('CITIZEN')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [localError, setLocalError] = useState(null)
  const [hasActiveEmergency] = useState(() => {
    const cachedEmergency = loadEmergencyCache()
    return Boolean(cachedEmergency && cachedEmergency.incidentId)
  })

  const isSessionExpired = location.state?.reason === 'SESSION_EXPIRED'

  // -------------------------------------------------------------------------
  // 2. Redirect if Already Authenticated
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      const target = role === 'AUTHORITY' ? '/authority' : '/citizen'
      navigate(target, { replace: true })
    }
  }, [isAuthenticated, authLoading, role, navigate])

  // -------------------------------------------------------------------------
  // 3. Form Submission Handler
  // -------------------------------------------------------------------------
  const executeLogin = useCallback(
    async (emailToSubmit, passwordToSubmit) => {
      setLocalError(null)

      const trimmedEmail = (emailToSubmit || '').trim()
      if (!trimmedEmail) {
        setLocalError('Please enter your email address.')
        return
      }

      if (!EMAIL_REGEX.test(trimmedEmail)) {
        setLocalError('Please enter a valid email address.')
        return
      }

      if (!passwordToSubmit) {
        setLocalError('Please enter your password.')
        return
      }

      setIsSubmitting(true)
      const result = await login(trimmedEmail, passwordToSubmit)
      setIsSubmitting(false)

      if (!result.success) {
        setLocalError(result.error || 'Email or password is incorrect.')
      }
    },
    [login]
  )

  const handleSubmit = (e) => {
    e.preventDefault()
    executeLogin(email, password)
  }

  // -------------------------------------------------------------------------
  // 4. Hackathon Quick Demo Sign-In (Calls Real Auth Pipeline)
  // -------------------------------------------------------------------------
  const handleQuickDemo = (roleId) => {
    const targetRole = ROLES.find((r) => r.id === roleId)
    if (!targetRole) return

    setSelectedRole(targetRole.id)
    setEmail(targetRole.defaultEmail)
    setPassword(targetRole.defaultPassword)
    setLocalError(null)

    // Execute real authentication with the pre-seeded credentials
    executeLogin(targetRole.defaultEmail, targetRole.defaultPassword)
  }

  const activeRoleData = useMemo(
    () => ROLES.find((r) => r.id === selectedRole) || ROLES[0],
    [selectedRole]
  )

  const displayError = localError || authError

  // -------------------------------------------------------------------------
  // 5. Loading State (Zero Flicker Session Rehydration)
  // -------------------------------------------------------------------------
  if (authLoading) {
    return (
      <div className="min-h-screen bg-salvus-bg flex items-center justify-center selection:bg-salvus-info selection:text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-salvus-info border-t-transparent rounded-full animate-spin" />
          <span className="text-salvus-text-secondary text-xs font-medium tracking-wide">
            Verifying security session…
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-salvus-bg flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 selection:bg-salvus-info selection:text-white">
      {/* Brand Header */}
      <header className="mb-6 text-center max-w-md w-full">
        <div className="inline-flex items-center justify-center gap-2 mb-2">
          <span className="inline-block h-3 w-3 rounded-full bg-salvus-safe animate-pulse" />
          <span className="text-[11px] font-bold tracking-widest text-salvus-text-muted uppercase">
            Emergency Network
          </span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-salvus-text-primary tracking-tight">
          SALVUS
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm text-salvus-text-secondary font-medium">
          Disaster Intelligence & Rescue Coordination Platform
        </p>
      </header>

      {/* Main Authentication Card */}
      <main className="w-full max-w-md bg-salvus-surface border border-salvus-border rounded-2xl shadow-xl overflow-hidden transition-all">
        {/* Role Selector Tabs */}
        <div
          role="tablist"
          aria-label="Select Operating Portal"
          className="flex border-b border-salvus-border bg-salvus-muted/40"
        >
          {ROLES.map((r) => {
            const isSelected = selectedRole === r.id
            return (
              <button
                key={r.id}
                role="tab"
                id={`tab-${r.id.toLowerCase()}`}
                aria-selected={isSelected}
                aria-controls={`panel-${r.id.toLowerCase()}`}
                type="button"
                onClick={() => {
                  setSelectedRole(r.id)
                  setLocalError(null)
                }}
                className={`flex-1 py-3 px-4 text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 ${
                  isSelected
                    ? 'bg-salvus-surface text-salvus-text-primary border-b-2 border-salvus-info shadow-xs'
                    : 'text-salvus-text-muted hover:text-salvus-text-secondary hover:bg-salvus-surface-hover'
                }`}
              >
                <span>{r.icon}</span>
                <span>{r.label} Portal</span>
              </button>
            )
          })}
        </div>

        {/* Role Guidance Header */}
        <div
          id={`panel-${activeRoleData.id.toLowerCase()}`}
          role="tabpanel"
          aria-labelledby={`tab-${activeRoleData.id.toLowerCase()}`}
          className="px-6 pt-5 pb-3 bg-salvus-surface-elevated/40 border-b border-salvus-border/60"
        >
          <div className="flex items-center gap-2 text-xs font-bold text-salvus-text-primary mb-1">
            <span>{activeRoleData.icon}</span>
            <span>{activeRoleData.tagline}</span>
          </div>
          <p className="text-[11px] text-salvus-text-secondary leading-relaxed">
            {activeRoleData.description}
          </p>
        </div>

        {/* Notices: Session Expiry / Active Emergency */}
        <div className="px-6 pt-4 space-y-2.5">
          {isSessionExpired && (
            <div
              role="alert"
              className="flex items-start gap-2.5 p-3 rounded-lg bg-salvus-warning-bg border border-salvus-warning-border text-salvus-warning-text text-xs"
            >
              <span className="shrink-0 mt-0.5">⚠️</span>
              <span>Your session has expired. Please sign in again.</span>
            </div>
          )}

          {hasActiveEmergency && selectedRole === 'CITIZEN' && (
            <div
              role="status"
              className="flex items-start gap-2.5 p-3 rounded-lg bg-salvus-critical/10 border border-salvus-critical/30 text-salvus-critical text-xs"
            >
              <span className="shrink-0 mt-0.5">🚨</span>
              <span>
                Active emergency session detected on this device. Sign in as Citizen to reconnect to
                live rescue coordination.
              </span>
            </div>
          )}

          {displayError && (
            <div
              role="alert"
              aria-live="polite"
              className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs"
            >
              <span className="shrink-0 mt-0.5">⚠️</span>
              <span>{displayError}</span>
            </div>
          )}
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="p-6 pt-3 space-y-4">
          {/* Email Input */}
          <div>
            <label
              htmlFor="login-email"
              className="block text-xs font-semibold text-salvus-text-secondary mb-1.5"
            >
              Email Address
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setLocalError(null)
              }}
              placeholder={activeRoleData.defaultEmail}
              className="w-full px-3.5 py-2.5 rounded-lg bg-salvus-bg border border-salvus-border text-salvus-text-primary placeholder-salvus-text-muted text-sm focus:outline-none focus:ring-2 focus:ring-salvus-info/50 focus:border-salvus-info transition-all"
              disabled={isSubmitting}
            />
          </div>

          {/* Password Input with Show/Hide Toggle */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-salvus-text-secondary"
              >
                Password
              </label>
            </div>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setLocalError(null)
                }}
                placeholder="Enter your password"
                className="w-full px-3.5 py-2.5 pr-10 rounded-lg bg-salvus-bg border border-salvus-border text-salvus-text-primary placeholder-salvus-text-muted text-sm focus:outline-none focus:ring-2 focus:ring-salvus-info/50 focus:border-salvus-info transition-all"
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-salvus-text-muted hover:text-salvus-text-primary p-1 text-xs cursor-pointer rounded focus:outline-none focus:ring-2 focus:ring-salvus-info/50"
                tabIndex={0}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Submit Action */}
          <button
            id="login-submit"
            type="submit"
            disabled={isSubmitting}
            className={`w-full py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer shadow-md ${
              isSubmitting
                ? 'bg-salvus-info/60 text-white/70 cursor-wait'
                : 'bg-salvus-info hover:bg-salvus-info/90 text-white active:scale-[0.98]'
            }`}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Signing in…
              </span>
            ) : (
              `Sign in as ${activeRoleData.label}`
            )}
          </button>

          {/* Hackathon Quick Demo Sign-In Helper */}
          <div className="pt-4 border-t border-salvus-border">
            <div className="flex items-center justify-between text-[11px] text-salvus-text-muted mb-2 font-medium">
              <span>⚡ Hackathon Evaluation Quick Sign-In</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickDemo('CITIZEN')}
                disabled={isSubmitting}
                className="py-2 px-2.5 rounded-lg bg-salvus-surface-elevated hover:bg-salvus-surface-hover border border-salvus-border text-salvus-text-secondary hover:text-salvus-text-primary text-xs font-semibold transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5"
                title="Populate demo citizen credentials and sign in"
              >
                <span>👤</span>
                <span>Demo Citizen</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemo('AUTHORITY')}
                disabled={isSubmitting}
                className="py-2 px-2.5 rounded-lg bg-salvus-surface-elevated hover:bg-salvus-surface-hover border border-salvus-border text-salvus-text-secondary hover:text-salvus-text-primary text-xs font-semibold transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5"
                title="Populate demo authority credentials and sign in"
              >
                <span>🛡️</span>
                <span>Demo Authority</span>
              </button>
            </div>
          </div>
        </form>
      </main>

      {/* Footer Security Notice */}
      <footer className="mt-6 text-center max-w-sm text-[11px] text-salvus-text-muted space-y-1">
        <p>Salvus Emergency Gateway • Authorized personnel & citizens only.</p>
        <p className="text-[10px] opacity-75">
          Demo accounts authenticate against live database bcrypt records.
        </p>
      </footer>
    </div>
  )
}

export default LoginPage
