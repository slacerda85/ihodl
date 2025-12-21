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
 * 5. Tipos derivados diretamente dos stores usando Pick para reduzir duplicação
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

import {
  createContext,
  useContext,
  useReducer,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
  useSyncExternalStore,
  Dispatch,
} from 'react'
import { AppState as RNAppState, useColorScheme } from 'react-native'

// ==========================================
// STORES (importados de cada feature)
// ==========================================

import { walletStore } from '../wallet/store'
import { authStore } from '../auth/store'
import { settingsStore, type ColorMode } from '../settings/store'
import { addressStore } from '../address/store'
import { networkStore } from '../network/store'
import { lightningStore } from '../lightning/store'
import { watchtowerStore } from '../lightning/watchtowerStore'

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
import { appReducer } from './reducer'

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

type WalletStoreActions = typeof walletStore.actions
type SettingsStoreActions = typeof settingsStore.actions
type AddressStoreActions = typeof addressStore.actions
type NetworkStoreActions = typeof networkStore.actions
type LightningStoreActions = typeof lightningStore.actions
type WatchtowerStoreActions = typeof watchtowerStore.actions

// ==========================================
// CONTEXT TYPE
// ==========================================

interface AppContextType {
  // ========== ESTADO EFÊMERO (não persistido) ==========
  state: AppState
  dispatch: Dispatch<AppAction>

  // Helpers para loading/error
  isLoading: (key: LoadingKey) => boolean
  isAnyLoading: () => boolean
  getError: (key: LoadingKey) => string | null
  hasErrors: () => boolean

  // ========== AUTH STORE ==========
  auth: typeof authStore

  // ========== WALLET STORE ==========
  wallet: typeof walletStore

  // ========== SETTINGS STORE ==========
  settings: typeof settingsStore

  // ========== ADDRESS STORE ==========
  address: typeof addressStore

  // ========== NETWORK STORE ==========
  network: typeof networkStore

  // ========== LIGHTNING STORE ==========
  lightning: typeof lightningStore

  // ========== WATCHTOWER STORE ==========
  watchtower: typeof watchtowerStore
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
  const currentWalletIdRef = useRef<string | undefined>(undefined)
  const isSyncingWorkerRef = useRef(false)

  // Auto-initialize the shared Lightning worker when a wallet is active; stop on logout/background.
  useEffect(() => {
    const worker = lightningStore.actions.getWorker()

    const syncWorkerWithWallet = async () => {
      if (isSyncingWorkerRef.current) return
      isSyncingWorkerRef.current = true

      try {
        const nextWalletId = walletStore.getActiveWalletIdSnapshot()

        if (!nextWalletId) {
          currentWalletIdRef.current = undefined
          await worker.stop()
          lightningStore.actions.resetForWalletChange()
          return
        }

        if (currentWalletIdRef.current === nextWalletId) return

        // Stop previous worker session before switching wallets
        await worker.stop()
        lightningStore.actions.resetForWalletChange()

        currentWalletIdRef.current = nextWalletId
        await lightningStore.actions.initialize()
      } finally {
        isSyncingWorkerRef.current = false
      }
    }

    // Initial sync
    void syncWorkerWithWallet()

    const unsubscribeWallet = walletStore.subscribe(() => {
      void syncWorkerWithWallet()
    })

    return () => {
      unsubscribeWallet()
    }
  }, [])

  /**
   * Handler para mudanças de estado do app (foreground/background).
   *
   * Implementa graceful shutdown quando o app vai para background,
   * aguardando HTLCs pendentes antes de parar o worker.
   *
   * @see docs/lightning-worker-consolidation-plan.md - Fase 3.3, 3.4
   */
  useEffect(() => {
    const worker = lightningStore.actions.getWorker()

    // Listener para warnings do worker (ex: HTLCs não resolvidos)
    const handleWorkerWarning = (warning: { type: string; channels?: string[] }) => {
      if (warning.type === 'unresolved_htlcs' && warning.channels?.length) {
        // TODO: Integrar com sistema de notificações do app
        // Por enquanto, apenas logamos - pode ser expandido para Alert/Toast
        console.warn(
          `[AppProvider] ⚠️ ${warning.channels.length} canais têm HTLCs pendentes não resolvidos. ` +
            'Estes podem expirar on-chain se não forem resolvidos.',
        )
        // Disparar evento para UI mostrar notificação
        dispatch({
          type: 'SET_ERROR',
          key: 'htlcWarning',
          error: `${warning.channels.length} canal(is) com HTLCs pendentes`,
        })
      }
    }

    worker.on('warning', handleWorkerWarning)

    const handleAppStateChange = async (nextState: string) => {
      if (nextState === 'background') {
        // Verificar HTLCs pendentes ANTES de parar
        const pendingCount = worker.countPendingHtlcs()
        if (pendingCount > 0) {
          console.warn(
            `[AppProvider] ⚠️ App indo para background com ${pendingCount} HTLCs pendentes!`,
          )
        }

        console.log(
          '[AppProvider] App going to background, stopping Lightning worker gracefully...',
        )
        currentWalletIdRef.current = undefined

        // Graceful shutdown: worker.stop() agora aguarda HTLCs pendentes
        try {
          await worker.stop()
        } catch (error) {
          console.error('[AppProvider] Error stopping worker:', error)
        }

        lightningStore.actions.resetForWalletChange()
        console.log('[AppProvider] Lightning worker stopped')
      }
    }

    const subscription = RNAppState.addEventListener('change', handleAppStateChange)

    return () => {
      worker.off('warning', handleWorkerWarning)
      subscription.remove()
    }
  }, [])

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

      // Auth store
      auth: authStore,

      // Wallet store
      wallet: walletStore,

      // Settings store
      settings: settingsStore,

      // Address store
      address: addressStore,

      // Network store
      network: networkStore,

      // Lightning store
      lightning: lightningStore,

      // Watchtower store
      watchtower: watchtowerStore,
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

export function useAuth(): AuthState & {
  auth: () => Promise<boolean>
  login: () => void
  logout: () => void
  setInactive: (inactive: boolean) => void
} {
  const { auth } = useAppContext()
  const authState = useSyncExternalStore(auth.subscribe, auth.getSnapshot, auth.getSnapshot)
  const actions = auth.actions

  return useMemo(
    () => ({
      ...authState,
      auth: actions.auth,
      login: actions.login,
      logout: actions.logout,
      setInactive: actions.setInactive,
    }),
    [authState, actions],
  )
}

export function useIsAuthenticated(): boolean {
  const { auth } = useAppContext()
  return useSyncExternalStore(auth.subscribe, () => auth.getSnapshot().authenticated)
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
export function useAddressStoreActions(): AddressStoreActions {
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
 *
 * @deprecated Use `lightningStore.getWorker()` ou o hook `useWorkerService()` em vez deste.
 * Este hook usa networkStore.getLightningWorker que cria instâncias separadas.
 * Será removido em versão futura.
 *
 * @see docs/lightning-worker-consolidation-plan.md - Fase 1.3
 */
export function useLightningWorker(
  masterKey: Uint8Array,
  network?: 'mainnet' | 'testnet' | 'regtest',
) {
  console.warn(
    '[useLightningWorker] This hook is deprecated. Use lightningStore.getWorker() or useWorkerService() instead.',
  )
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
