import { createContext } from 'react'

export const AUTH_STATE = Object.freeze({
  INITIALIZING: 'INITIALIZING',
  AUTHENTICATED: 'AUTHENTICATED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
})

export const AuthContext = createContext(null)

export default AuthContext
