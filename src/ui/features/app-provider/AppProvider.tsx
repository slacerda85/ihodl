/**
 * AppProvider - Provider Centralizado de Estado
 *
 * ARQUITETURA:
 * Este provider agrega todos os stores da aplicação em um único contexto.
 * Cada store é importado de sua respectiva feature, mantendo a separação de código.
 *
 * BENEFÍCIOS:
 * 1. Um único Provider no topo da árvore (sem nesting profundo)
 * 2. Lógica de cada feature isolada em seu próprio arquivo store.ts
 * 3. Hooks especializados para cada domínio
 * 4. useSyncExternalStore para reatividade sem re-renders desnecessários
 *
 * ESTRUTURA:
 * - stores/wallet → walletStore (carteiras, wallet ativa)
 * - stores/address → addressStore (endereços, balance, UTXOs)
 * - stores/settings → settingsStore (configurações, tema)
 * - state/types → AppState (auth, connection, loading, errors)
 *
 * USO:
 * ```tsx
 * // No _layout.tsx raiz
 * <AppProvider>
 *   <App />
 * </AppProvider>
 *
 * // Em componentes
 * const wallets = useWallets()
 * const { createWallet } = useWalletActions()
 * const isDark = useIsDark()
 * ```
 */

import React, {
  createContext,
  useContext,
  useReducer,
  useMemo,
  useCallback,
  ReactNode,
  useSyncExternalStore,
} from 'react'
import { useColorScheme } from 'react-native'

// ==========================================
// STORES (importados de cada feature)
// ==========================================

import { walletStore, type WalletStoreActions } from '../wallet/store'
import { settingsStore, type SettingsStoreActions, type ColorMode } from '../settings/store'
import { addressStore } from '../address/store'
import { networkStore, type NetworkStoreActions } from '../network/store'
import { lightningStore, type LightningStoreActions } from '../lightning/store'
import { watchtowerStore, type WatchtowerStoreActions } from '../lightning/watchtowerStore'

// ==========================================
// AUTH UTILS (autenticação biométrica)
// ==========================================

import { checkHardware, checkPermissions, authenticate } from '../auth/utils'

// ==========================================
// TYPES (estado efêmero - não persistido)
// ==========================================

import {
  AppState,
  AppAction,
  initialAppState,
  LoadingKey,
  AuthState,
  ConnectionState,
} from '../../state/types'

// ==========================================
// WALLET HOOKS
// ==========================================

import { Wallet } from '@/core/models/wallet'

// ==========================================
// SETTINGS HOOKS
// ==========================================

import type { SettingsState, LightningSettings } from '../settings/store'

// ==========================================
// ADDRESS HOOKS
// ==========================================

import { AddressDetails } from '@/core/models/address'
import { Utxo } from '@/core/models/transaction'

// ==========================================
// REDUCER (para estado efêmero)
// ==========================================

function appReducer(state: AppState, action: AppAction): AppState {
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

// ==========================================
// CONTEXT TYPE
// ==========================================

interface AppContextType {
  // ========== ESTADO EFÊMERO (não persistido) ==========
  state: AppState
  dispatch: React.Dispatch<AppAction>

  // Helpers para loading/error
  isLoading: (key: LoadingKey) => boolean
  isAnyLoading: () => boolean
  getError: (key: LoadingKey) => string | null
  hasErrors: () => boolean

  // ========== WALLET STORE ==========
  wallet: {
    subscribe: typeof walletStore.subscribe
    getWalletsSnapshot: typeof walletStore.getWalletsSnapshot
    getActiveWalletIdSnapshot: typeof walletStore.getActiveWalletIdSnapshot
    actions: WalletStoreActions
  }

  // ========== SETTINGS STORE ==========
  settings: {
    subscribe: typeof settingsStore.subscribe
    getSnapshot: typeof settingsStore.getSnapshot
    getColorMode: typeof settingsStore.getColorMode
    getLightningSettings: typeof settingsStore.getLightningSettings
    actions: SettingsStoreActions
  }

  // ========== ADDRESS STORE ==========
  address: {
    subscribe: typeof addressStore.subscribe
    getAddressesSnapshot: typeof addressStore.getAddressesSnapshot
    getBalanceSnapshot: typeof addressStore.getBalanceSnapshot
    getNextAddressesSnapshot: typeof addressStore.getNextAddressesSnapshot
    notify: typeof addressStore.notify
    notifyLight: typeof addressStore.notifyLight
    clear: typeof addressStore.clear
  }

  // ========== NETWORK STORE ==========
  network: {
    subscribe: typeof networkStore.subscribe
    getSnapshot: typeof networkStore.getSnapshot
    getConnection: typeof networkStore.getConnection
    getLightningWorker: typeof networkStore.getLightningWorker
    actions: NetworkStoreActions
  }

  // ========== LIGHTNING STORE ==========
  lightning: {
    subscribe: typeof lightningStore.subscribe
    getSnapshot: typeof lightningStore.getSnapshot
    getReadinessState: typeof lightningStore.getReadinessState
    getReadinessLevel: typeof lightningStore.getReadinessLevel
    actions: LightningStoreActions
  }

  // ========== WATCHTOWER STORE ==========
  watchtower: {
    subscribe: typeof watchtowerStore.subscribe
    getSnapshot: typeof watchtowerStore.getSnapshot
    getIsInitialized: typeof watchtowerStore.getIsInitialized
    getIsRunning: typeof watchtowerStore.getIsRunning
    getStatus: typeof watchtowerStore.getStatus
    getChannels: typeof watchtowerStore.getChannels
    getEvents: typeof watchtowerStore.getEvents
    getHasBreaches: typeof watchtowerStore.getHasBreaches
    actions: WatchtowerStoreActions
  }
}

const AppContext = createContext<AppContextType | null>(null)

// ==========================================
// PROVIDER
// ==========================================

interface AppProviderProps {
  children: ReactNode
}

export function AppProvider({ children }: AppProviderProps) {
  const [state, dispatch] = useReducer(appReducer, initialAppState)

  // Memoizar contexto para evitar re-renders desnecessários
  const contextValue = useMemo<AppContextType>(
    () => ({
      // Estado efêmero
      state,
      dispatch,

      // Helpers
      isLoading: (key: LoadingKey) => state.loading.get(key) ?? false,
      isAnyLoading: () => state.loading.size > 0,
      getError: (key: LoadingKey) => state.errors.get(key) ?? null,
      hasErrors: () => state.errors.size > 0,

      // Wallet store
      wallet: {
        subscribe: walletStore.subscribe,
        getWalletsSnapshot: walletStore.getWalletsSnapshot,
        getActiveWalletIdSnapshot: walletStore.getActiveWalletIdSnapshot,
        actions: walletStore.actions,
      },

      // Settings store
      settings: {
        subscribe: settingsStore.subscribe,
        getSnapshot: settingsStore.getSnapshot,
        getColorMode: settingsStore.getColorMode,
        getLightningSettings: settingsStore.getLightningSettings,
        actions: settingsStore.actions,
      },

      // Address store
      address: {
        subscribe: addressStore.subscribe,
        getAddressesSnapshot: addressStore.getAddressesSnapshot,
        getBalanceSnapshot: addressStore.getBalanceSnapshot,
        getNextAddressesSnapshot: addressStore.getNextAddressesSnapshot,
        notify: addressStore.actions.notify,
        notifyLight: addressStore.actions.notifyLight,
        clear: addressStore.actions.clear,
      },

      // Network store
      network: {
        subscribe: networkStore.subscribe,
        getSnapshot: networkStore.getSnapshot,
        getConnection: networkStore.actions.getConnection,
        getLightningWorker: networkStore.actions.getLightningWorker,
        reconnect: networkStore.actions.reconnect,
        closeConnections: networkStore.actions.closeConnections,
        actions: networkStore.actions,
      },

      // Lightning store
      lightning: {
        subscribe: lightningStore.subscribe,
        getSnapshot: lightningStore.getSnapshot,
        getReadinessState: lightningStore.getReadinessState,
        getReadinessLevel: lightningStore.getReadinessLevel,
        actions: lightningStore.actions,
      },

      // Watchtower store
      watchtower: {
        subscribe: watchtowerStore.subscribe,
        getSnapshot: watchtowerStore.getSnapshot,
        getIsInitialized: watchtowerStore.getIsInitialized,
        getIsRunning: watchtowerStore.getIsRunning,
        getStatus: watchtowerStore.getStatus,
        getChannels: watchtowerStore.getChannels,
        getEvents: watchtowerStore.getEvents,
        getHasBreaches: watchtowerStore.getHasBreaches,
        actions: watchtowerStore.actions,
      },
    }),
    [state],
  )

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>
}

// ==========================================
// BASE HOOK
// ==========================================

export function useAppContext(): AppContextType {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider')
  }
  return context
}

// ==========================================
// AUTH HOOKS
// ==========================================

/**
 * Performs biometric authentication
 */
async function performBiometricAuth(): Promise<boolean> {
  // Check if running on web platform - bypass authentication
  if (typeof window !== 'undefined' && navigator?.userAgent?.includes('Chrome')) {
    return true
  }

  try {
    // Check if hardware supports biometric authentication
    const hardwareSupported = await checkHardware()
    if (!hardwareSupported) {
      console.warn('Hardware não suporta autenticação biométrica')
      return false
    }

    // Check if user has configured biometric authentication
    const securityLevel = await checkPermissions()
    if (securityLevel === 0) {
      console.warn('Usuário não configurou autenticação biométrica')
      return false
    }

    // Perform biometric authentication
    const { success } = await authenticate()
    if (!success) {
      console.warn('Autenticação falhou')
      return false
    }

    return true
  } catch (error) {
    console.warn('Erro de autenticação:', error)
    return false
  }
}

export function useAuth(): AuthState & {
  auth: () => Promise<boolean>
  login: () => void
  logout: () => void
  setInactive: (inactive: boolean) => void
} {
  const { state, dispatch } = useAppContext()

  const auth = useCallback(async (): Promise<boolean> => {
    try {
      const success = await performBiometricAuth()
      if (!success) {
        dispatch({ type: 'AUTH_LOGOUT' })
        return false
      }
      dispatch({ type: 'AUTH_SUCCESS' })
      return true
    } catch (error) {
      console.warn('Authentication error:', error)
      dispatch({ type: 'AUTH_LOGOUT' })
      return false
    }
  }, [dispatch])

  const login = useCallback(() => dispatch({ type: 'AUTH_SUCCESS' }), [dispatch])
  const logout = useCallback(() => dispatch({ type: 'AUTH_LOGOUT' }), [dispatch])
  const setInactive = useCallback(
    (inactive: boolean) => dispatch({ type: 'SET_INACTIVE', payload: inactive }),
    [dispatch],
  )

  return useMemo(
    () => ({
      ...state.auth,
      auth,
      login,
      logout,
      setInactive,
    }),
    [state.auth, auth, login, logout, setInactive],
  )
}

export function useIsAuthenticated(): boolean {
  const { state } = useAppContext()
  return state.auth.authenticated
}

// ==========================================
// CONNECTION HOOKS
// ==========================================

export function useConnection(): ConnectionState {
  const { state } = useAppContext()
  return state.connection
}

export function useIsConnected(): { electrum: boolean; lightning: boolean } {
  const { state } = useAppContext()
  return {
    electrum: state.connection.electrum.connected,
    lightning: state.connection.lightning.connected,
  }
}

// ==========================================
// LOADING/ERROR HOOKS
// ==========================================

export function useLoading(key: LoadingKey): boolean {
  const { isLoading } = useAppContext()
  return isLoading(key)
}

export function useIsAnyLoading(): boolean {
  const { isAnyLoading } = useAppContext()
  return isAnyLoading()
}

export function useError(key: LoadingKey): string | null {
  const { getError } = useAppContext()
  return getError(key)
}

export function useHasErrors(): boolean {
  const { hasErrors } = useAppContext()
  return hasErrors()
}

/**
 * Hook reativo para lista de wallets
 */
export function useWallets(): Wallet[] {
  const { wallet } = useAppContext()
  return useSyncExternalStore(
    wallet.subscribe,
    wallet.getWalletsSnapshot,
    wallet.getWalletsSnapshot,
  )
}

/**
 * Hook reativo para ID da wallet ativa
 */
export function useActiveWalletId(): string | undefined {
  const { wallet } = useAppContext()
  return useSyncExternalStore(
    wallet.subscribe,
    wallet.getActiveWalletIdSnapshot,
    wallet.getActiveWalletIdSnapshot,
  )
}

/**
 * Hook reativo para wallet ativa
 */
export function useActiveWallet(): Wallet | null {
  const wallets = useWallets()
  const activeId = useActiveWalletId()
  return wallets.find(w => w.id === activeId) ?? null
}

/**
 * Hook para actions de wallet (não causa re-render)
 */
export function useWalletActions(): WalletStoreActions {
  const { wallet } = useAppContext()
  return wallet.actions
}

/**
 * Hook reativo para todo estado de settings
 */
export function useSettingsState(): SettingsState {
  const { settings } = useAppContext()
  return useSyncExternalStore(settings.subscribe, settings.getSnapshot, settings.getSnapshot)
}

/**
 * Hook reativo para colorMode
 */
export function useColorMode(): ColorMode {
  const { settings } = useAppContext()
  return useSyncExternalStore(settings.subscribe, settings.getColorMode, settings.getColorMode)
}

/**
 * Hook reativo para isDark (resolução de tema)
 */
export function useIsDark(): boolean {
  const colorMode = useColorMode()
  const systemColorScheme = useColorScheme()
  return colorMode === 'dark' || (colorMode === 'auto' && systemColorScheme === 'dark')
}

/**
 * Hook reativo para modo de cor ativo (resolvido)
 */
export function useActiveColorMode(): 'light' | 'dark' {
  const colorMode = useColorMode()
  const systemColorScheme = useColorScheme()
  if (colorMode === 'auto') {
    return systemColorScheme === 'light' ? 'light' : 'dark'
  }
  return colorMode
}

/**
 * Hook reativo para settings de Lightning
 */
export function useLightningSettings(): LightningSettings {
  const { settings } = useAppContext()
  return useSyncExternalStore(
    settings.subscribe,
    settings.getLightningSettings,
    settings.getLightningSettings,
  )
}

/**
 * Hook para actions de settings (não causa re-render)
 */
export function useSettingsActions(): SettingsStoreActions {
  const { settings } = useAppContext()
  return settings.actions
}

/**
 * Hook reativo para lista de endereços
 */
export function useAddresses(): AddressDetails[] {
  const { address } = useAppContext()
  return useSyncExternalStore(
    address.subscribe,
    address.getAddressesSnapshot,
    address.getAddressesSnapshot,
  )
}

/**
 * Hook reativo para saldo e UTXOs
 */
export function useBalance(): { balance: number; utxos: Utxo[] } {
  const { address } = useAppContext()
  return useSyncExternalStore(
    address.subscribe,
    address.getBalanceSnapshot,
    address.getBalanceSnapshot,
  )
}

/**
 * Hook reativo para próximos endereços
 */
export function useNextAddresses(): { receive: string; change: string } {
  const { address } = useAppContext()
  return useSyncExternalStore(
    address.subscribe,
    address.getNextAddressesSnapshot,
    address.getNextAddressesSnapshot,
  )
}

/**
 * Hook para endereços filtrados por tipo
 */
export function useAddressesByType(type: 'receiving' | 'change'): AddressDetails[] {
  const addresses = useAddresses()
  return useMemo(
    () =>
      addresses.filter(addr =>
        type === 'receiving' ? addr.derivationPath.change === 0 : addr.derivationPath.change === 1,
      ),
    [addresses, type],
  )
}

/**
 * Hook para notificar mudanças no address store
 */
export function useAddressStoreActions() {
  const { address } = useAppContext()
  return {
    notify: address.notify,
    notifyLight: address.notifyLight,
    clear: address.clear,
  }
}

/**
 * Hook para loading de endereços
 */
export function useAddressLoading(): boolean {
  return useLoading('addresses')
}

/**
 * Hook de compatibilidade - retorna todo o estado de settings
 * Mantém compatibilidade com useSettings antigo que usava dispatch(actions.xxx)
 * @deprecated Preferir useSettingsState(), useIsDark(), useColorMode() para melhor performance
 */
export function useSettings() {
  const state = useSettingsState()
  const isDark = useIsDark()
  const colorMode = useColorMode()
  const storeActions = useSettingsActions()

  return useMemo(() => {
    // Dispatch é apenas uma função identity para compatibilidade
    // No novo sistema, as actions já são executadas diretamente
    const dispatch = (action: (() => void) | void) => {
      if (typeof action === 'function') {
        action()
      }
    }

    return {
      ...state,
      isDark,
      colorMode,
      lightning: state.lightning,
      // Actions no formato antigo (dispatch(actions.xxx))
      dispatch,
      actions: storeActions,
      // Actions no formato novo (chamada direta)
      ...storeActions,
    }
  }, [state, isDark, colorMode, storeActions])
}

// ==========================================
// NETWORK HOOKS
// ==========================================

/**
 * Hook para obter o estado completo da rede
 */
export function useNetworkState() {
  const { network } = useAppContext()
  return useSyncExternalStore(network.subscribe, network.getSnapshot)
}

/**
 * Hook para obter a conexão Electrum
 */
export function useNetworkConnection() {
  const { network } = useAppContext()
  return useCallback(() => network.getConnection(), [network])
}

/**
 * Hook para obter o worker Lightning (requer masterKey e network)
 */
export function useLightningWorker(
  masterKey: Uint8Array,
  network?: 'mainnet' | 'testnet' | 'regtest',
) {
  const { network: networkStore } = useAppContext()
  return networkStore.getLightningWorker(masterKey, network)
}

/**
 * Hook para actions do network store
 */
export function useNetworkActions(): NetworkStoreActions {
  const { network } = useAppContext()
  return network.actions
}

/**
 * Hook para verificar se Electrum está conectado
 */
export function useElectrumConnected(): boolean {
  const networkState = useNetworkState()
  return networkState.electrumConnected
}

/**
 * Hook para verificar se Lightning Worker está pronto
 */
export function useLightningWorkerReady(): boolean {
  const networkState = useNetworkState()
  return networkState.lightningWorkerReady
}

/**
 * Hook para loading de conexões de rede
 */
export function useNetworkLoading(): boolean {
  return useLoading('lightningInit')
}

// ==========================================
// LIGHTNING HOOKS
// ==========================================

/**
 * Hook reativo para todo o estado do Lightning
 */
export function useLightningState() {
  const { lightning } = useAppContext()
  return useSyncExternalStore(lightning.subscribe, lightning.getSnapshot)
}

/**
 * Hook reativo para readiness state do Lightning
 */
export function useLightningReadinessState() {
  const { lightning } = useAppContext()
  return useSyncExternalStore(lightning.subscribe, lightning.getReadinessState)
}

/**
 * Hook reativo para readiness level do Lightning
 */
export function useLightningReadinessLevel() {
  const { lightning } = useAppContext()
  return useSyncExternalStore(lightning.subscribe, lightning.getReadinessLevel)
}

/**
 * Hook para actions do Lightning store
 */
export function useLightningActions(): LightningStoreActions {
  const { lightning } = useAppContext()
  return lightning.actions
}

/**
 * Hook para verificar se Lightning está inicializado
 */
export function useLightningInitialized(): boolean {
  const lightningState = useLightningState()
  return lightningState.isInitialized
}

/**
 * Hook para verificar se Lightning está carregando
 */
export function useLightningLoading(): boolean {
  const lightningState = useLightningState()
  return lightningState.isLoading
}

/**
 * Hook para obter erro do Lightning
 */
export function useLightningError(): string | null {
  const lightningState = useLightningState()
  return lightningState.error
}

/**
 * Hook para obter saldo total do Lightning
 */
export function useLightningBalance() {
  const lightningState = useLightningState()
  return lightningState.totalBalance
}

/**
 * Hook para obter canais do Lightning
 */
export function useLightningChannels() {
  const lightningState = useLightningState()
  return lightningState.channels
}

/**
 * Hook para obter invoices do Lightning
 */
export function useLightningInvoices() {
  const lightningState = useLightningState()
  return lightningState.invoices
}

/**
 * Hook para obter payments do Lightning
 */
export function useLightningPayments() {
  const lightningState = useLightningState()
  return lightningState.payments
}

/**
 * Hook para obter status de conexão do Lightning
 */
export function useLightningConnection() {
  const lightningState = useLightningState()
  return lightningState.connection
}

// ==========================================
// WATCHTOWER HOOKS
// ==========================================

/**
 * Hook reativo para todo o estado do Watchtower
 */
export function useWatchtowerState() {
  const { watchtower } = useAppContext()
  return useSyncExternalStore(watchtower.subscribe, watchtower.getSnapshot)
}

/**
 * Hook reativo para verificar se Watchtower está inicializado
 */
export function useWatchtowerInitialized(): boolean {
  const { watchtower } = useAppContext()
  return useSyncExternalStore(watchtower.subscribe, watchtower.getIsInitialized)
}

/**
 * Hook reativo para verificar se Watchtower está rodando
 */
export function useWatchtowerRunning(): boolean {
  const { watchtower } = useAppContext()
  return useSyncExternalStore(watchtower.subscribe, watchtower.getIsRunning)
}

/**
 * Hook reativo para status do Watchtower
 */
export function useWatchtowerStatus() {
  const { watchtower } = useAppContext()
  return useSyncExternalStore(watchtower.subscribe, watchtower.getStatus)
}

/**
 * Hook reativo para canais monitorados
 */
export function useWatchtowerChannels() {
  const { watchtower } = useAppContext()
  return useSyncExternalStore(watchtower.subscribe, watchtower.getChannels)
}

/**
 * Hook reativo para eventos do Watchtower
 */
export function useWatchtowerEvents() {
  const { watchtower } = useAppContext()
  return useSyncExternalStore(watchtower.subscribe, watchtower.getEvents)
}

/**
 * Hook reativo para verificar se há breaches
 */
export function useWatchtowerHasBreaches(): boolean {
  const { watchtower } = useAppContext()
  return useSyncExternalStore(watchtower.subscribe, watchtower.getHasBreaches)
}

/**
 * Hook para actions do Watchtower store
 */
export function useWatchtowerActions(): WatchtowerStoreActions {
  const { watchtower } = useAppContext()
  return watchtower.actions
}

// ==========================================
// EXPORTS
// ==========================================

export default AppProvider
