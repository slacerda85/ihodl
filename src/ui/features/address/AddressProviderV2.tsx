/**
 * AddressProvider - Versão Otimizada
 *
 * MUDANÇAS DA VERSÃO ANTERIOR:
 * 1. Removido: addresses, nextReceiveAddress, nextChangeAddress do state
 *    - Esses dados já estão no MMKV e podem ser lidos síncronamente
 *
 * 2. Mantido: loading (único estado necessário para UI)
 *
 * 3. Adicionado: subscription pattern para dados reativos
 *
 * FLUXO:
 * - discover() busca na rede e salva no MMKV
 * - Componentes que precisam de re-render usam useSyncExternalStore
 * - Componentes que só leem usam service diretamente
 */

import {
  createContext,
  ReactNode,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  useSyncExternalStore,
} from 'react'
import { InteractionManager } from 'react-native'
import { AddressDetails } from '@/core/models/address'
import { useNetworkConnection } from '../app-provider/AppProvider'
import { useActiveWalletId } from '../wallet/WalletProviderV2'
import { addressService, transactionService, walletService } from '@/core/services'
import { Utxo } from '@/core/models/transaction'

// ==========================================
// TYPES
// ==========================================

type AddressContextType = {
  // Estado de UI (único estado React necessário)
  loading: boolean

  // Actions
  refresh: () => Promise<void>

  // Subscription para useSyncExternalStore
  subscribe: (callback: () => void) => () => void

  // Snapshots para useSyncExternalStore
  getAddressesSnapshot: () => AddressDetails[]
  getBalanceSnapshot: () => { balance: number; utxos: Utxo[] }
  getNextAddressesSnapshot: () => { receive: string; change: string }
}

// ==========================================
// STORE
// ==========================================

/**
 * Store com cache para evitar loop infinito no useSyncExternalStore.
 * Os snapshots DEVEM retornar a mesma referência se o conteúdo não mudou.
 */
class AddressStore {
  private subscribers = new Set<() => void>()

  // Cache para snapshots - evita loop infinito
  private cachedAddresses: AddressDetails[] = []
  private cachedBalance: { balance: number; utxos: Utxo[] } = { balance: 0, utxos: [] }
  private cachedNextAddresses: { receive: string; change: string } = { receive: '', change: '' }

  constructor() {
    this.refreshCache()
  }

  /**
   * Refresh leve: apenas lê endereços e balance do MMKV (rápido)
   * NÃO deriva próximos endereços (operação pesada)
   */
  private refreshCacheLight = (): void => {
    try {
      const receiving = addressService.getUsedAddresses('receiving')
      const change = addressService.getUsedAddresses('change')
      this.cachedAddresses = [...receiving, ...change]
    } catch {
      this.cachedAddresses = []
    }

    try {
      if (this.cachedAddresses.length === 0) {
        this.cachedBalance = { balance: 0, utxos: [] }
      } else {
        this.cachedBalance = transactionService.calculateBalance(this.cachedAddresses)
      }
    } catch {
      this.cachedBalance = { balance: 0, utxos: [] }
    }
  }

  /**
   * Refresh completo: inclui derivação de próximos endereços (pesado)
   */
  private refreshCache = (): void => {
    this.refreshCacheLight()

    // Verifica se há wallet ativa antes de derivar endereços
    // A derivação de chaves é uma operação pesada (PBKDF2)
    const activeWalletId = walletService.getActiveWalletId()
    if (!activeWalletId) {
      this.cachedNextAddresses = { receive: '', change: '' }
      return
    }

    try {
      // Usa método otimizado que deriva chaves apenas uma vez
      this.cachedNextAddresses = addressService.getNextAddresses()
    } catch {
      this.cachedNextAddresses = { receive: '', change: '' }
    }
  }

  /**
   * Limpa o cache para mostrar estado vazio (skeleton)
   * Usado quando troca de wallet para dar feedback visual imediato
   */
  clear = (): void => {
    this.cachedAddresses = []
    this.cachedBalance = { balance: 0, utxos: [] }
    this.cachedNextAddresses = { receive: '', change: '' }
    this.subscribers.forEach(callback => callback())
  }

  subscribe = (callback: () => void): (() => void) => {
    this.subscribers.add(callback)
    return () => {
      this.subscribers.delete(callback)
    }
  }

  notify = (): void => {
    // Atualizar cache antes de notificar
    this.refreshCache()
    this.subscribers.forEach(callback => callback())
  }

  /**
   * Notifica com refresh leve (sem derivação de chaves)
   */
  notifyLight = (): void => {
    this.refreshCacheLight()
    this.subscribers.forEach(callback => callback())
  }

  // Snapshots retornam referências cacheadas (estáveis)
  getAddressesSnapshot = (): AddressDetails[] => {
    return this.cachedAddresses
  }

  getBalanceSnapshot = (): { balance: number; utxos: Utxo[] } => {
    return this.cachedBalance
  }

  getNextAddressesSnapshot = (): { receive: string; change: string } => {
    return this.cachedNextAddresses
  }
}

const addressStore = new AddressStore()

// ==========================================
// CONTEXT
// ==========================================

const AddressContext = createContext<AddressContextType | null>(null)

interface AddressProviderProps {
  children: ReactNode
}

// ==========================================
// PROVIDER
// ==========================================

export default function AddressProvider({ children }: AddressProviderProps) {
  const getConnection = useNetworkConnection()
  const activeWalletId = useActiveWalletId()

  // ÚNICO estado: loading
  // Tudo mais é lido do MMKV síncronamente
  const [loading, setLoading] = useState(false)
  const isLoadingRef = useRef(false)
  const previousWalletIdRef = useRef<string | undefined>(activeWalletId)

  const refresh = useCallback(async () => {
    // Se já tiver loading setado (pelo useEffect de wallet change), não seta novamente
    // mas continua a execução
    if (!isLoadingRef.current) {
      isLoadingRef.current = true
      setLoading(true)
    }

    try {
      const connection = await getConnection()
      await addressService.discover(connection)

      // Após discover, notifica subscribers com cache completo
      // Os dados atualizados estão no MMKV
      addressStore.notify()
    } catch (error) {
      console.error('[AddressProvider] Error refreshing addresses:', error)
    } finally {
      setLoading(false)
      isLoadingRef.current = false
    }
  }, [getConnection])

  // Quando a carteira ativa muda, atualiza o cache e faz refresh
  useEffect(() => {
    // Se a carteira mudou
    if (previousWalletIdRef.current !== activeWalletId) {
      previousWalletIdRef.current = activeWalletId

      if (activeWalletId) {
        // Aguarda animação do modal terminar
        const handle = InteractionManager.runAfterInteractions(() => {
          // 1. Seta loading PRIMEIRO (mostra skeleton imediatamente)
          setLoading(true)
          isLoadingRef.current = true

          // 2. Limpa cache e notifica (UI mostra skeleton com dados vazios)
          addressStore.clear()

          // 3. Faz refresh leve (lê MMKV, sem derivação pesada) em próximo frame
          requestAnimationFrame(() => {
            addressStore.notifyLight()

            // 4. Dispara fetch da rede (async)
            refresh()
          })
        })
        return () => handle.cancel()
      } else {
        // Sem wallet ativa, apenas limpa o cache
        addressStore.notify()
      }
    }
  }, [activeWalletId, refresh])

  const contextValue = useMemo<AddressContextType>(
    () => ({
      loading,
      refresh,
      subscribe: addressStore.subscribe,
      getAddressesSnapshot: addressStore.getAddressesSnapshot,
      getBalanceSnapshot: addressStore.getBalanceSnapshot,
      getNextAddressesSnapshot: addressStore.getNextAddressesSnapshot,
    }),
    [loading, refresh],
  )

  return <AddressContext value={contextValue}>{children}</AddressContext>
}

// ==========================================
// HOOKS
// ==========================================

/**
 * Hook base para contexto
 */
export function useAddressContext(): AddressContextType {
  const context = useContext(AddressContext)
  if (!context) {
    throw new Error('useAddressContext must be used within AddressProvider')
  }
  return context
}

/**
 * Hook reativo para lista de endereços
 */
export function useAddresses(): AddressDetails[] {
  const { subscribe, getAddressesSnapshot } = useAddressContext()
  return useSyncExternalStore(subscribe, getAddressesSnapshot, getAddressesSnapshot)
}

/**
 * Hook reativo para saldo e UTXOs
 */
export function useBalance(): { balance: number; utxos: Utxo[] } {
  const { subscribe, getBalanceSnapshot } = useAddressContext()
  return useSyncExternalStore(subscribe, getBalanceSnapshot, getBalanceSnapshot)
}

/**
 * Hook reativo para próximos endereços (receive e change)
 * Usa snapshot cacheado para evitar re-renders infinitos
 */
export function useNextAddresses(): { receive: string; change: string } {
  const { subscribe, getNextAddressesSnapshot } = useAddressContext()
  return useSyncExternalStore(subscribe, getNextAddressesSnapshot, getNextAddressesSnapshot)
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
 * Hook para estado de loading
 */
export function useAddressLoading(): boolean {
  const { loading } = useAddressContext()
  return loading
}

/**
 * Hook para action de refresh
 */
export function useRefreshAddresses(): () => Promise<void> {
  const { refresh } = useAddressContext()
  return refresh
}

// ==========================================
// BACKWARD COMPATIBILITY
// ==========================================

/**
 * Hook de compatibilidade com API anterior
 *
 * DEPRECATED: Prefira usar hooks específicos
 */
export function useAddress() {
  const { loading, refresh } = useAddressContext()
  const addresses = useAddresses()
  const { balance, utxos } = useBalance()
  const { receive: nextReceiveAddress, change: nextChangeAddress } = useNextAddresses()

  const usedReceivingAddresses = useMemo(
    () => addresses.filter(addr => addr.derivationPath.change === 0 && addr.txs.length > 0),
    [addresses],
  )

  const usedChangeAddresses = useMemo(
    () => addresses.filter(addr => addr.derivationPath.change === 1 && addr.txs.length > 0),
    [addresses],
  )

  return {
    loading,
    addresses,
    nextReceiveAddress,
    nextChangeAddress,
    balance,
    utxos,
    usedReceivingAddresses,
    usedChangeAddresses,
    refresh,
  }
}
