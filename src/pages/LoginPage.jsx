/**
 * LoginPage — Salvus Authentication Gateway
 *
 * Professional, minimal login page with role selector tabs (CITIZEN | AUTHORITY).
 * The role tabs are UX-only — the backend determines the actual role from credentials.
 *
 * No credentials are hardcoded in this file.
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const ROLES = [
  {
    id: 'CITIZEN',
    label: 'Citizen',
    icon: '👤',
    description: 'Report emergencies & access safety services',
  },
  {
    id: 'AUTHORITY',
    label: 'Authority',
    icon: '🛡️',
    description: 'Command center & emergency coordination',
  },
]

const LoginPage = () => {
  const { login, isAuthenticated, isLoading: authLoading, error: authError, role } = useAuth()
  const navigate = useNavigate()

  const [selectedRole, setSelectedRole] = useState('CITIZEN')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [localError, setLocalError] = useState(null)

  // If already authenticated, redirect to the correct app
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      const target = role === 'AUTHORITY' ? '/authority' : '/citizen'
      navigate(target, { replace: true })
    }
  }, [isAuthenticated, authLoading, role, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLocalError(null)

    if (!email.trim()) {
      setLocalError('Please enter your email address.')
      return
    }
    if (!password) {
      setLocalError('Please enter your password.')
      return
    }

    setIsSubmitting(true)
    const result = await login(email, password)
    setIsSubmitting(false)

    if (!result.success) {
      setLocalError(result.error || 'Authentication failed. Please check your credentials.')
    }
  }

  const displayError = localError || authError

  // Don't render the login form while checking for existing session
  if (authLoading) {
    return (
      <div className="min-h-screen bg-salvus-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-salvus-info border-t-transparent rounded-full animate-spin" />
          <span className="text-salvus-text-secondary text-sm">Verifying session…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-salvus-bg flex flex-col items-center justify-center px-4 selection:bg-salvus-info selection:text-white">
      {/* Branding */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-salvus-text-primary tracking-tight">
          SALVUS
        </h1>
        <p className="mt-2 text-sm text-salvus-text-secondary">
          Disaster Intelligence & Rescue Coordination
        </p>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-md bg-salvus-surface border border-salvus-border rounded-2xl shadow-lg overflow-hidden">
        {/* Role Selector Tabs */}
        <div className="flex border-b border-salvus-border">
          {ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                setSelectedRole(r.id)
                setLocalError(null)
              }}
              className={`flex-1 py-3.5 px-4 text-sm font-semibold transition-all duration-200 cursor-pointer ${
                selectedRole === r.id
                  ? 'bg-salvus-surface-elevated text-salvus-text-primary border-b-2 border-salvus-info'
                  : 'text-salvus-text-muted hover:text-salvus-text-secondary hover:bg-salvus-surface-hover'
              }`}
            >
              <span className="mr-1.5">{r.icon}</span>
              {r.label}
            </button>
          ))}
        </div>

        {/* Role Description */}
        <div className="px-6 pt-5 pb-2">
          <p className="text-xs text-salvus-text-muted text-center">
            {ROLES.find((r) => r.id === selectedRole)?.description}
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          {/* Email */}
          <div>
            <label
              htmlFor="login-email"
              className="block text-xs font-medium text-salvus-text-secondary mb-1.5"
            >
              Email
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
              placeholder="your.email@example.com"
              className="w-full px-3.5 py-2.5 rounded-lg bg-salvus-bg border border-salvus-border text-salvus-text-primary placeholder-salvus-text-muted text-sm focus:outline-none focus:ring-2 focus:ring-salvus-info/50 focus:border-salvus-info transition-all"
              disabled={isSubmitting}
            />
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-medium text-salvus-text-secondary mb-1.5"
            >
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setLocalError(null)
              }}
              placeholder="Enter your password"
              className="w-full px-3.5 py-2.5 rounded-lg bg-salvus-bg border border-salvus-border text-salvus-text-primary placeholder-salvus-text-muted text-sm focus:outline-none focus:ring-2 focus:ring-salvus-info/50 focus:border-salvus-info transition-all"
              disabled={isSubmitting}
            />
          </div>

          {/* Error Message */}
          {displayError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              <span className="mt-0.5 shrink-0">⚠️</span>
              <span>{displayError}</span>
            </div>
          )}

          {/* Submit */}
          <button
            id="login-submit"
            type="submit"
            disabled={isSubmitting}
            className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
              isSubmitting
                ? 'bg-salvus-info/50 text-white/60 cursor-wait'
                : 'bg-salvus-info hover:bg-salvus-info/90 text-white active:scale-[0.98]'
            }`}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Authenticating…
              </span>
            ) : (
              `Sign in as ${selectedRole === 'AUTHORITY' ? 'Authority' : 'Citizen'}`
            )}
          </button>
        </form>
      </div>

      {/* Footer */}
      <p className="mt-6 text-xs text-salvus-text-muted text-center max-w-sm">
        Salvus Authentication Gateway — Authorized personnel only.
        <br />
        Hackathon demo credentials are available in project documentation.
      </p>
    </div>
  )
}

export default LoginPage
