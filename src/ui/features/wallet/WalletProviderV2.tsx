/**
 * WalletProvider - Versão Otimizada
 *
 * Esta é uma implementação de exemplo da nova arquitetura de state.
 *
 * PRINCÍPIOS:
 * 1. Dados persistidos no MMKV são lidos diretamente via service (síncrono)
 * 2. Não duplicar dados que já existem no MMKV
 * 3. Usar useSyncExternalStore para componentes que precisam re-render
 * 4. Provider expõe apenas actions e subscription
 *
 * QUANDO UM COMPONENTE PRECISA DE RE-RENDER:
 * - Use useSyncExternalStore com getSnapshot e subscribe
 * - O hook useWallets() ou useActiveWallet() já fazem isso
 *
 * QUANDO UM COMPONENTE SÓ PRECISA LER O DADO:
 * - Use walletService.getAllWallets() diretamente
 * - Não há necessidade de re-render
 */

import { createContext, ReactNode, useContext, useSyncExternalStore, useMemo } from 'react'
import { Wallet } from '@/core/models/wallet'
import { walletService } from '@/core/services'

// ==========================================
// TYPES
// ==========================================

type WalletContextType = {
  // Actions que modificam dados
  createWallet: (params: Parameters<typeof walletService.createWallet>[0]) => Wallet
  deleteWallet: (walletId: string) => void
  setActiveWallet: (walletId: string) => void
  editWallet: (walletId: string, updates: Partial<Omit<Wallet, 'id'>>) => void
  getMasterKey: (walletId: string, password?: string) => Uint8Array

  // Subscription para useSyncExternalStore
  subscribe: (callback: () => void) => () => void

  // Getters síncronos (para useSyncExternalStore snapshot)
  getWalletsSnapshot: () => Wallet[]
  getActiveWalletIdSnapshot: () => string | undefined
}

// ==========================================
// STORE (pub/sub pattern)
// ==========================================

/**
 * Store simples com pub/sub para notificar mudanças.
 * Isso permite que componentes usando useSyncExternalStore
 * saibam quando precisam re-renderizar.
 *
 * IMPORTANTE: Os snapshots DEVEM retornar a mesma referência se o conteúdo
 * não mudou. useSyncExternalStore compara por referência para decidir re-render.
 */
class WalletStore {
  private subscribers = new Set<() => void>()

  // Cache para snapshots - evita loop infinito no useSyncExternalStore
  private cachedWallets: Wallet[] = []
  private cachedActiveWalletId: string | undefined = undefined

  constructor() {
    // Inicializar cache
    this.refreshCache()
  }

  private refreshCache = (): void => {
    this.cachedWallets = walletService.getAllWallets()
    this.cachedActiveWalletId = walletService.getActiveWalletId()
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

  // Snapshots retornam referências cacheadas (estáveis)
  // Isso evita loop infinito no useSyncExternalStore
  getWalletsSnapshot = (): Wallet[] => {
    return this.cachedWallets
  }

  getActiveWalletIdSnapshot = (): string | undefined => {
    return this.cachedActiveWalletId
  }
}

// Singleton store
const walletStore = new WalletStore()

// ==========================================
// CONTEXT
// ==========================================

const WalletContext = createContext<WalletContextType | null>(null)

interface WalletProviderProps {
  children: ReactNode
}

// ==========================================
// PROVIDER
// ==========================================

export default function WalletProvider({ children }: WalletProviderProps) {
  // Memoizar o contextValue para evitar re-renders desnecessários
  const contextValue = useMemo<WalletContextType>(
    () => ({
      // Actions - modificam e notificam
      createWallet: params => {
        const wallet = walletService.createWallet(params)
        walletStore.notify()
        return wallet
      },

      deleteWallet: walletId => {
        walletService.deleteWallet(walletId)
        walletStore.notify()
      },

      setActiveWallet: walletId => {
        walletService.toggleActiveWallet(walletId)
        walletStore.notify()
      },

      editWallet: (walletId, updates) => {
        walletService.editWallet(walletId, updates)
        walletStore.notify()
      },

      getMasterKey: (walletId, password) => {
        return walletService.getMasterKey(walletId, password)
      },

      // Subscription para useSyncExternalStore
      subscribe: walletStore.subscribe,

      // Getters para snapshots
      getWalletsSnapshot: walletStore.getWalletsSnapshot,
      getActiveWalletIdSnapshot: walletStore.getActiveWalletIdSnapshot,
    }),
    [],
  )

  return <WalletContext value={contextValue}>{children}</WalletContext>
}

// ==========================================
// HOOKS
// ==========================================

/**
 * Hook base para acessar o contexto
 */
export function useWalletContext(): WalletContextType {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error('useWalletContext must be used within WalletProvider')
  }
  return context
}

/**
 * Hook reativo para lista de wallets
 *
 * USO: Componentes que precisam re-renderizar quando wallets mudam
 *
 * @example
 * function WalletList() {
 *   const wallets = useWallets()
 *   return wallets.map(w => <WalletItem key={w.id} wallet={w} />)
 * }
 */
export function useWallets(): Wallet[] {
  const { subscribe, getWalletsSnapshot } = useWalletContext()
  return useSyncExternalStore(subscribe, getWalletsSnapshot, getWalletsSnapshot)
}

/**
 * Hook reativo para activeWalletId
 *
 * USO: Componentes que precisam re-renderizar quando wallet ativa muda
 */
export function useActiveWalletId(): string | undefined {
  const { subscribe, getActiveWalletIdSnapshot } = useWalletContext()
  return useSyncExternalStore(subscribe, getActiveWalletIdSnapshot, getActiveWalletIdSnapshot)
}

/**
 * Hook reativo para wallet ativa
 *
 * Combina useActiveWalletId com lookup da wallet
 */
export function useActiveWallet(): Wallet | null {
  const wallets = useWallets()
  const activeId = useActiveWalletId()
  return wallets.find(w => w.id === activeId) ?? null
}

/**
 * Hook para actions (não causa re-render por si só)
 *
 * USO: Componentes que só precisam chamar actions, não observar estado
 *
 * @example
 * function CreateWalletButton() {
 *   const { createWallet } = useWalletActions()
 *   return <Button onPress={() => createWallet({ name: 'Nova', cold: false })} />
 * }
 */
export function useWalletActions() {
  const { createWallet, deleteWallet, setActiveWallet, editWallet, getMasterKey } =
    useWalletContext()

  return {
    createWallet,
    deleteWallet,
    setActiveWallet,
    editWallet,
    getMasterKey,
  }
}

// ==========================================
// BACKWARD COMPATIBILITY
// ==========================================

/**
 * Hook de compatibilidade com API anterior
 *
 * DEPRECATED: Prefira usar hooks específicos:
 * - useWallets() para lista de wallets
 * - useActiveWalletId() para ID ativo
 * - useWalletActions() para actions
 *
 * Este hook mantém a mesma API do provider anterior para facilitar migração.
 */
export function useWallet() {
  const wallets = useWallets()
  const activeWalletId = useActiveWalletId()
  const actions = useWalletActions()

  return {
    wallets,
    activeWalletId,
    ...actions,
    // Renomear para manter compatibilidade
    unlinkWallet: actions.deleteWallet,
    toggleActiveWallet: actions.setActiveWallet,
  }
}
