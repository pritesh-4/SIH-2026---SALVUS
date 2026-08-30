/**
 * Authentication API service for Salvus.
 *
 * Centralizes all authentication-related API calls.
 * Uses the shared apiClient for automatic token attachment.
 */

import { apiClient, setAuthToken, clearAuthToken } from './api'

/**
 * Authenticate a user with email and password credentials.
 *
 * @param {string} email - User email address
 * @param {string} password - User password
 * @returns {Promise<{success: boolean, data?: Object, error?: Object}>}
 */
export const loginUser = async (email, password) => {
  try {
    const response = await apiClient.post('/api/auth/login', {
      email: email.trim().toLowerCase(),
      password,
    })

    const { access_token, user, expires_in } = response.data

    // Store the token for subsequent API calls
    setAuthToken(access_token)

    return {
      success: true,
      data: {
        token: access_token,
        user,
        expiresIn: expires_in,
      },
    }
  } catch (error) {
    const message =
      error.response?.data?.detail?.error?.message ||
      error.response?.data?.detail?.message ||
      error.message ||
      'Authentication failed. Please try again.'

    const code = error.response?.data?.detail?.error?.code || error.code || 'AUTH_ERROR'

    return {
      success: false,
      error: { message, code, status: error.response?.status },
    }
  }
}

/**
 * Fetch the currently authenticated user's profile from the server.
 * Used to rehydrate session state on page reload.
 *
 * @returns {Promise<{success: boolean, data?: Object, error?: Object}>}
 */
export const fetchCurrentUser = async () => {
  try {
    const response = await apiClient.get('/api/auth/me')

    if (response.data?.success && response.data?.user) {
      return {
        success: true,
        data: {
          user: {
            id: response.data.user.user_id,
            email: response.data.user.email,
            name: response.data.user.name,
            role: response.data.user.role,
          },
          permissions: response.data.permissions || [],
        },
      }
    }

    return {
      success: false,
      error: { message: 'Invalid session response.', code: 'INVALID_SESSION' },
    }
  } catch (error) {
    return {
      success: false,
      error: {
        message: error.message || 'Session validation failed.',
        code: error.response?.status === 401 ? 'UNAUTHORIZED' : 'SESSION_ERROR',
        status: error.response?.status,
      },
    }
  }
}

/**
 * Clear authentication state (client-side logout).
 * JWTs are stateless — this only removes the local token.
 */
export const logoutUser = () => {
  clearAuthToken()
}
