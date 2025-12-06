/**
 * StateProvider - Provider unificado para estado global mínimo
 *
 * FILOSOFIA:
 * Este provider gerencia APENAS estados que:
 * 1. NÃO são persistidos no MMKV (auth, connection, loading, errors)
 * 2. Precisam ser acessíveis globalmente
 * 3. Disparam re-renders quando mudam
 *
 * DADOS PERSISTIDOS:
 * - Wallets, Addresses, Lightning, Settings → MMKV via services
 * - Acessados via services síncronos ou useSyncExternalStore
 *
 * USO:
 * - Substitui AuthProvider para auth
 * - Pode ser combinado com providers de features
 * - Ou pode absorver estados de loading/error de outros providers
 */

import React, { createContext, useContext, useReducer, useMemo, ReactNode, Dispatch } from 'react'
import { AppState, AppAction, initialAppState, LoadingKey } from './types'

// ==========================================
// REDUCER
// ==========================================

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    // Auth
    case 'AUTH_SUCCESS':
      return {
        ...state,
        auth: { ...state.auth, authenticated: true },
      }

    case 'AUTH_LOGOUT':
      return {
        ...state,
        auth: { ...state.auth, authenticated: false },
      }

    case 'SET_INACTIVE':
      return {
        ...state,
        auth: { ...state.auth, inactive: action.payload },
      }

    // Electrum Connection
    case 'ELECTRUM_CONNECTED':
      return {
        ...state,
        connection: {
          ...state.connection,
          electrum: { connected: true },
        },
      }

    case 'ELECTRUM_DISCONNECTED':
      return {
        ...state,
        connection: {
          ...state.connection,
          electrum: { connected: false },
        },
      }

    case 'ELECTRUM_PING':
      return {
        ...state,
        connection: {
          ...state.connection,
          electrum: { ...state.connection.electrum, lastPing: action.payload },
        },
      }

    // Lightning Connection
    case 'LIGHTNING_CONNECTED':
      return {
        ...state,
        connection: {
          ...state.connection,
          lightning: { connected: true, peerId: action.payload.peerId },
        },
      }

    case 'LIGHTNING_DISCONNECTED':
      return {
        ...state,
        connection: {
          ...state.connection,
          lightning: { connected: false, peerId: undefined },
        },
      }

    case 'LIGHTNING_PING':
      return {
        ...state,
        connection: {
          ...state.connection,
          lightning: { ...state.connection.lightning, lastPing: action.payload },
        },
      }

    // Loading
    case 'SET_LOADING': {
      const newLoading = new Map(state.loading)
      if (action.payload.loading) {
        newLoading.set(action.payload.key, true)
      } else {
        newLoading.delete(action.payload.key)
      }
      return { ...state, loading: newLoading }
    }

    // Errors
    case 'SET_ERROR': {
      const newErrors = new Map(state.errors)
      if (action.payload.error) {
        newErrors.set(action.payload.key, action.payload.error)
      } else {
        newErrors.delete(action.payload.key)
      }
      return { ...state, errors: newErrors }
    }

    case 'CLEAR_ERROR': {
      const newErrors = new Map(state.errors)
      newErrors.delete(action.payload)
      return { ...state, errors: newErrors }
    }

    case 'CLEAR_ALL_ERRORS':
      return { ...state, errors: new Map() }

    default:
      return state
  }
}

// ==========================================
// CONTEXT
// ==========================================

type StateContextType = {
  state: AppState
  dispatch: Dispatch<AppAction>

  // Helpers de conveniência
  isLoading: (key: LoadingKey) => boolean
  isAnyLoading: () => boolean
  getError: (key: LoadingKey) => string | null
  hasErrors: () => boolean
}

const StateContext = createContext<StateContextType | null>(null)

// ==========================================
// PROVIDER
// ==========================================

interface StateProviderProps {
  children: ReactNode
}

export function StateProvider({ children }: StateProviderProps) {
  const [state, dispatch] = useReducer(appReducer, initialAppState)

  const contextValue = useMemo<StateContextType>(
    () => ({
      state,
      dispatch,

      // Helpers
      isLoading: (key: LoadingKey) => state.loading.get(key) ?? false,
      isAnyLoading: () => state.loading.size > 0,
      getError: (key: LoadingKey) => state.errors.get(key) ?? null,
      hasErrors: () => state.errors.size > 0,
    }),
    [state],
  )

  return <StateContext.Provider value={contextValue}>{children}</StateContext.Provider>
}

// ==========================================
// BASE HOOK
// ==========================================

export function useAppState(): StateContextType {
  const context = useContext(StateContext)
  if (!context) {
    throw new Error('useAppState must be used within StateProvider')
  }
  return context
}

// ==========================================
// AUTH HOOKS
// ==========================================

export function useAuth() {
  const { state, dispatch } = useAppState()

  return useMemo(
    () => ({
      authenticated: state.auth.authenticated,
      inactive: state.auth.inactive,

      login: () => dispatch({ type: 'AUTH_SUCCESS' }),
      logout: () => dispatch({ type: 'AUTH_LOGOUT' }),
      setInactive: (inactive: boolean) => dispatch({ type: 'SET_INACTIVE', payload: inactive }),
    }),
    [state.auth.authenticated, state.auth.inactive, dispatch],
  )
}

export function useIsAuthenticated(): boolean {
  const { state } = useAppState()
  return state.auth.authenticated
}

// ==========================================
// CONNECTION HOOKS
// ==========================================

export function useConnection() {
  const { state, dispatch } = useAppState()

  return useMemo(
    () => ({
      electrum: state.connection.electrum,
      lightning: state.connection.lightning,

      // Electrum
      setElectrumConnected: () => dispatch({ type: 'ELECTRUM_CONNECTED' }),
      setElectrumDisconnected: () => dispatch({ type: 'ELECTRUM_DISCONNECTED' }),
      setElectrumPing: (timestamp: number) =>
        dispatch({ type: 'ELECTRUM_PING', payload: timestamp }),

      // Lightning
      setLightningConnected: (peerId: string) =>
        dispatch({ type: 'LIGHTNING_CONNECTED', payload: { peerId } }),
      setLightningDisconnected: () => dispatch({ type: 'LIGHTNING_DISCONNECTED' }),
      setLightningPing: (timestamp: number) =>
        dispatch({ type: 'LIGHTNING_PING', payload: timestamp }),
    }),
    [state.connection, dispatch],
  )
}

export function useIsConnected(): { electrum: boolean; lightning: boolean } {
  const { state } = useAppState()
  return {
    electrum: state.connection.electrum.connected,
    lightning: state.connection.lightning.connected,
  }
}

// ==========================================
// LOADING HOOKS
// ==========================================

export function useLoading(key: LoadingKey) {
  const { isLoading, dispatch } = useAppState()

  return useMemo(
    () => ({
      loading: isLoading(key),
      setLoading: (loading: boolean) => dispatch({ type: 'SET_LOADING', payload: { key, loading } }),
    }),
    [key, isLoading, dispatch],
  )
}

export function useIsAnyLoading(): boolean {
  const { isAnyLoading } = useAppState()
  return isAnyLoading()
}

// ==========================================
// ERROR HOOKS
// ==========================================

export function useError(key: LoadingKey) {
  const { getError, dispatch } = useAppState()

  return useMemo(
    () => ({
      error: getError(key),
      setError: (error: string | null) => dispatch({ type: 'SET_ERROR', payload: { key, error } }),
      clearError: () => dispatch({ type: 'CLEAR_ERROR', payload: key }),
    }),
    [key, getError, dispatch],
  )
}

export function useHasErrors(): boolean {
  const { hasErrors } = useAppState()
  return hasErrors()
}

// ==========================================
// COMBINED HOOKS (para operações async)
// ==========================================

/**
 * Hook para operações assíncronas com loading e error
 *
 * @example
 * const { loading, error, execute } = useAsyncOperation('addressDiscovery')
 *
 * const handleRefresh = async () => {
 *   await execute(async () => {
 *     await addressService.discover(connection)
 *   })
 * }
 */
export function useAsyncOperation(key: LoadingKey) {
  const { isLoading, getError, dispatch } = useAppState()

  const execute = async <T>(operation: () => Promise<T>): Promise<T | null> => {
    dispatch({ type: 'SET_LOADING', payload: { key, loading: true } })
    dispatch({ type: 'SET_ERROR', payload: { key, error: null } })

    try {
      const result = await operation()
      dispatch({ type: 'SET_LOADING', payload: { key, loading: false } })
      return result
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error'
      dispatch({ type: 'SET_ERROR', payload: { key, error } })
      dispatch({ type: 'SET_LOADING', payload: { key, loading: false } })
      return null
    }
  }

  return {
    loading: isLoading(key),
    error: getError(key),
    execute,
  }
}
