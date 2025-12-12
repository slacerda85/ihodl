import { AppState, AppAction } from '../../state/types'

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    // Auth
    case 'AUTH_SUCCESS':
      return { ...state, auth: { ...state.auth, authenticated: true } }
    case 'AUTH_LOGOUT':
      return { ...state, auth: { ...state.auth, authenticated: false } }
    case 'SET_INACTIVE':
      return { ...state, auth: { ...state.auth, inactive: action.payload } }

    // Electrum Connection
    case 'ELECTRUM_CONNECTED':
      return { ...state, connection: { ...state.connection, electrum: { connected: true } } }
    case 'ELECTRUM_DISCONNECTED':
      return { ...state, connection: { ...state.connection, electrum: { connected: false } } }
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
        connection: { ...state.connection, lightning: { connected: false, peerId: undefined } },
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
