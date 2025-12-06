/**
 * State Types
 *
 * Tipos para o estado global mínimo da aplicação.
 * Apenas estados que:
 * 1. NÃO são persistidos no MMKV
 * 2. Precisam disparar re-renders globais
 */

// ==========================================
// UI STATE
// ==========================================

/**
 * Estado de operações assíncronas
 * Usado para loading indicators e error handling
 */
export interface AsyncState {
  loading: boolean
  error: string | null
}

/**
 * Chaves para identificar operações de loading
 */
export type LoadingKey =
  | 'addresses'
  | 'addressDiscovery'
  | 'lightningInit'
  | 'transactionBroadcast'
  | 'channelOpen'
  | 'channelClose'
  | 'payment'
  | 'invoice'

// ==========================================
// AUTH STATE
// ==========================================

/**
 * Estado de autenticação
 * Não persistido - sessão apenas
 */
export interface AuthState {
  authenticated: boolean
  inactive: boolean
}

// ==========================================
// CONNECTION STATE
// ==========================================

/**
 * Estado de conexões
 * Efêmero - não persistido
 */
export interface ConnectionState {
  electrum: {
    connected: boolean
    lastPing?: number
  }
  lightning: {
    connected: boolean
    peerId?: string
    lastPing?: number
  }
}

// ==========================================
// APP STATE (Global)
// ==========================================

/**
 * Estado global da aplicação
 * Contém apenas o mínimo necessário para UI
 */
export interface AppState {
  auth: AuthState
  connection: ConnectionState
  loading: Map<LoadingKey, boolean>
  errors: Map<LoadingKey, string | null>
}

// ==========================================
// ACTIONS
// ==========================================

export type AppAction =
  // Auth
  | { type: 'AUTH_SUCCESS' }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'SET_INACTIVE'; payload: boolean }

  // Connection
  | { type: 'ELECTRUM_CONNECTED' }
  | { type: 'ELECTRUM_DISCONNECTED' }
  | { type: 'ELECTRUM_PING'; payload: number }
  | { type: 'LIGHTNING_CONNECTED'; payload: { peerId: string } }
  | { type: 'LIGHTNING_DISCONNECTED' }
  | { type: 'LIGHTNING_PING'; payload: number }

  // Loading/Error
  | { type: 'SET_LOADING'; payload: { key: LoadingKey; loading: boolean } }
  | { type: 'SET_ERROR'; payload: { key: LoadingKey; error: string | null } }
  | { type: 'CLEAR_ERROR'; payload: LoadingKey }
  | { type: 'CLEAR_ALL_ERRORS' }

// ==========================================
// INITIAL STATE
// ==========================================

export const initialAppState: AppState = {
  auth: {
    authenticated: false,
    inactive: false,
  },
  connection: {
    electrum: {
      connected: false,
    },
    lightning: {
      connected: false,
    },
  },
  loading: new Map(),
  errors: new Map(),
}
