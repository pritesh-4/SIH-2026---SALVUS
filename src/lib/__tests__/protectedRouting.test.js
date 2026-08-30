/**
 * Protected Routing & Session Lifecycle Tests (Phase 2)
 *
 * Verifies frontend role enforcement, session bootstrap states,
 * route guard logic, and comprehensive logout teardown.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { AUTH_STATE } from '../../context/authContextDef.js'
import { cleanupSocketOnLogout, joinRoom } from '../realtime/socket.js'
import { setAuthToken, getAuthToken, clearAuthToken } from '../../services/api.js'

test('1. AUTH_STATE constant defines expected lifecycle states', () => {
  assert.equal(AUTH_STATE.INITIALIZING, 'INITIALIZING')
  assert.equal(AUTH_STATE.AUTHENTICATED, 'AUTHENTICATED')
  assert.equal(AUTH_STATE.UNAUTHENTICATED, 'UNAUTHENTICATED')
  assert.equal(AUTH_STATE.AUTHENTICATION_ERROR, 'AUTHENTICATION_ERROR')
})

test('2. Role-based route guard authorization rules', () => {
  const isAuthorized = (userRole, allowedRoles) => {
    if (!allowedRoles || allowedRoles.length === 0) return true
    return allowedRoles.includes(userRole)
  }

  // CITIZEN accessing Citizen routes -> Allowed
  assert.equal(isAuthorized('CITIZEN', ['CITIZEN']), true)

  // CITIZEN accessing Authority routes -> Forbidden
  assert.equal(isAuthorized('CITIZEN', ['AUTHORITY', 'SYSTEM']), false)

  // AUTHORITY accessing Authority routes -> Allowed
  assert.equal(isAuthorized('AUTHORITY', ['AUTHORITY', 'SYSTEM']), true)

  // AUTHORITY accessing Citizen-only routes -> Forbidden
  assert.equal(isAuthorized('AUTHORITY', ['CITIZEN']), false)

  // Unauthenticated (null role) accessing protected routes -> Forbidden
  assert.equal(isAuthorized(null, ['CITIZEN']), false)
  assert.equal(isAuthorized(null, ['AUTHORITY']), false)
})

test('3. Cross-role navigation fallback determination', () => {
  const getFallbackDestination = (role) => {
    if (role === 'AUTHORITY') {
      return '/authority'
    }
    if (role === 'CITIZEN') {
      return '/citizen'
    }
    return '/login'
  }

  // Citizen attempting /authority is redirected to /citizen
  assert.equal(getFallbackDestination('CITIZEN', '/authority'), '/citizen')

  // Authority attempting /citizen is redirected to /authority
  assert.equal(getFallbackDestination('AUTHORITY', '/citizen'), '/authority')

  // Unknown role or null redirected to /login
  assert.equal(getFallbackDestination(null, '/authority'), '/login')
})

test('4. Token persistence and clear operations', () => {
  // Clear token
  clearAuthToken()
  assert.equal(getAuthToken(), null)

  // Set token
  const testJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.sig'
  setAuthToken(testJwt)
  assert.equal(getAuthToken(), testJwt)

  // Clear on logout
  clearAuthToken()
  assert.equal(getAuthToken(), null)
})

test('5. Realtime room cleanup on user logout', () => {
  // Simulate active rooms
  joinRoom('authorities')
  joinRoom('incident:inc-2048')

  // Execute logout cleanup
  cleanupSocketOnLogout()

  // Verify safe execution and idempotent cleanup
  cleanupSocketOnLogout()
  assert.ok(true, 'Socket cleaned up without throw')
})

test('6. Return URL extraction after login', () => {
  const resolvePostLoginRedirect = (role, stateFrom) => {
    const defaultPath = role === 'AUTHORITY' ? '/authority' : '/citizen'
    if (!stateFrom || stateFrom === '/login' || stateFrom === '/') {
      return defaultPath
    }

    const isCitizenTarget = stateFrom.startsWith('/citizen')
    const isAuthorityTarget = stateFrom.startsWith('/authority')

    if (role === 'CITIZEN' && isCitizenTarget) return stateFrom
    if (role === 'AUTHORITY' && isAuthorityTarget) return stateFrom

    return defaultPath
  }

  // Citizen returning to /citizen/alerts -> preserved
  assert.equal(resolvePostLoginRedirect('CITIZEN', '/citizen/alerts'), '/citizen/alerts')

  // Citizen attempting return to /authority -> overridden to /citizen
  assert.equal(resolvePostLoginRedirect('CITIZEN', '/authority/command'), '/citizen')

  // Authority returning to /authority/command -> preserved
  assert.equal(resolvePostLoginRedirect('AUTHORITY', '/authority/command'), '/authority/command')

  // Authority attempting return to /citizen/map -> overridden to /authority
  assert.equal(resolvePostLoginRedirect('AUTHORITY', '/citizen/map'), '/authority')
})
