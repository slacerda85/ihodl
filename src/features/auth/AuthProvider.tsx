import { createContext, useState, useContext, useRef, useEffect, useCallback } from 'react'
import { AppState, AppStateStatus } from 'react-native' /* 
import { Href, useSegments } from 'expo-router' */
import { checkHardware, checkPermissions, authenticate } from './utils'

// Constants
const TIMEOUTS = {
  INACTIVITY: 1000 * 100000, // 30 seconds
  BACKGROUND: 1000 * 100000, // 60 seconds
}

const APP_STATE_TIMEOUTS: Record<AppStateStatus, number | undefined> = {
  active: undefined,
  background: TIMEOUTS.BACKGROUND,
  inactive: TIMEOUTS.INACTIVITY,
  extension: undefined,
  unknown: undefined,
}
/* 
const ROUTES: Record<string, Href> = {
  AUTH_SCREEN: '/auth',
}
 */
const ERROR_MESSAGES = {
  HARDWARE_UNSUPPORTED: 'Hardware não suporta autenticação biométrica',
  BIOMETRICS_NOT_CONFIGURED: 'Usuário não configurou autenticação biométrica',
  AUTH_FAILED: 'Autenticação falhou',
  CONTEXT_ERROR: 'useAuth must be used within an AuthProvider',
}

// Types
type AuthContextType = {
  authenticated: boolean
  auth: () => Promise<boolean>
  inactive: boolean
  setInactive: (value: boolean) => void
  // unlockApp: () => Promise<void>
}

// Create context with default values
export const AuthContext = createContext<AuthContextType>({} as AuthContextType)

interface AuthProviderProps {
  children: React.ReactNode
}

/**
 * Authentication provider component that handles user authentication
 * and app state transitions for security purposes.
 */
export default function AuthProvider({ children }: AuthProviderProps) {
  // State and refs
  const [authenticated, setAuthenticated] = useState(false)
  const [inactive, setInactive] = useState(false)
  const startTime = useRef(0)
  const appState = useRef(AppState.currentState)
  /* const segments = useSegments()
  const currentRoute = '/' + segments.join('/') */

  /**
   * Performs the actual biometric authentication
   */
  const performBiometricAuth = useCallback(async (): Promise<boolean> => {
    try {
      // Check if running on web platform - bypass authentication
      // example Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0
      if (typeof window !== 'undefined' && navigator?.userAgent?.includes('Chrome')) {
        console.log('User agent', navigator.userAgent)
        console.log('Running on web, bypassing biometric authentication')
        return true
      }

      // Check if hardware supports biometric authentication
      const hardwareSupported = await checkHardware()
      console.log('Hardware supported:', hardwareSupported)
      if (!hardwareSupported) {
        console.warn(ERROR_MESSAGES.HARDWARE_UNSUPPORTED)
        return false
        // throw new Error(ERROR_MESSAGES.HARDWARE_UNSUPPORTED)
      }

      // Check if user has configured biometric authentication
      const securityLevel = await checkPermissions()
      if (securityLevel === 0) {
        console.warn(ERROR_MESSAGES.BIOMETRICS_NOT_CONFIGURED)
        return false
        // throw new Error(ERROR_MESSAGES.BIOMETRICS_NOT_CONFIGURED)
      }

      // Here we would call the actual biometric auth API
      const { success } = await authenticate()
      console.log('Biometric authentication success:', success)
      if (!success) {
        console.warn(ERROR_MESSAGES.AUTH_FAILED)
        return false
        // throw new Error(ERROR_MESSAGES.AUTH_FAILED)
      }

      return true
    } catch (error) {
      console.warn(error)
      return false
    }
  }, [])

  /**
   * Public authentication method exposed through context
   */
  const auth = useCallback(async (): Promise<boolean> => {
    try {
      const success = await performBiometricAuth()
      if (!success) {
        setAuthenticated(false)
        return false
      }

      setAuthenticated(success)
      return true
    } catch (error) {
      console.warn('Authentication error:', error)
      setAuthenticated(false)
      return false
    }
  }, [performBiometricAuth, setAuthenticated])

  /**
   * Handles app state changes for security purposes
   */
  const handleAppStateChange = useCallback((nextAppState: AppStateStatus): void => {
    const hasTimeoutExceeded = (elapsedTime: number, timeoutType: AppStateStatus): boolean => {
      const timeout = APP_STATE_TIMEOUTS[timeoutType]
      return !!timeout && elapsedTime > timeout
    }
    console.log('App state changed to', nextAppState)
    const currentState = appState.current

    // App goes to background or becomes inactive
    if (currentState === 'active') {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        startTime.current = Date.now()

        // Only set blur when going inactive
        if (nextAppState === 'inactive') {
          setInactive(true)
        }
      }
    }
    // App comes back to foreground
    else if (nextAppState === 'active') {
      const elapsed = Date.now() - startTime.current

      if (currentState === 'background' && hasTimeoutExceeded(elapsed, 'background')) {
        console.log('Background timeout exceeded')
        setAuthenticated(false)
        // lockApp()
      } else if (currentState === 'inactive' && hasTimeoutExceeded(elapsed, 'inactive')) {
        console.log('Inactivity timeout exceeded')
        setAuthenticated(false)
        // lockApp()
      } else {
        setInactive(false)
      }
    }

    appState.current = nextAppState
  }, [])

  // Set up app state change listener
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange)

    return () => {
      subscription.remove()
    }
  }, [handleAppStateChange])

  return (
    <AuthContext.Provider
      value={{
        authenticated,
        auth,
        inactive,
        setInactive,
        // unlockApp,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

/**
 * Hook to access authentication context
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error(ERROR_MESSAGES.CONTEXT_ERROR)
  }
  return context
}
