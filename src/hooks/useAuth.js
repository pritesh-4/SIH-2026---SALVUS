/**
 * useAuth — Hook to access Salvus authentication state and actions.
 *
 * Must be used within an AuthProvider.
 *
 * Returns:
 * - user: { id, email, name, role } | null
 * - isAuthenticated: boolean
 * - isLoading: boolean
 * - error: string | null
 * - login(email, password): Promise<{success, error?}>
 * - logout(): void
 * - role: string | null
 */

import { useContext } from 'react'
import AuthContext from '../context/AuthContext'

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
