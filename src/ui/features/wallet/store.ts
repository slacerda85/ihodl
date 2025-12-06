/**
 * Wallet Store
 *
 * Store singleton com pub/sub para gerenciamento de carteiras.
 * Separado do provider para permitir composição no AppProvider.
 *
 * PRINCÍPIOS:
 * 1. Dados persistidos no MMKV via walletService
 * 2. Cache para evitar loop infinito no useSyncExternalStore
 * 3. Notifica subscribers quando dados mudam
 */

import { Wallet } from '@/core/models/wallet'
import { walletService } from '@/core/services'

// ==========================================
// TYPES
// ==========================================

export interface WalletStoreState {
  wallets: Wallet[]
  activeWalletId: string | undefined
}

export interface WalletStoreActions {
  createWallet: (params: Parameters<typeof walletService.createWallet>[0]) => Wallet
  deleteWallet: (walletId: string) => void
  setActiveWallet: (walletId: string) => void
  editWallet: (walletId: string, updates: Partial<Omit<Wallet, 'id'>>) => void
  getMasterKey: (walletId: string, password?: string) => Uint8Array
}

// ==========================================
// STORE CLASS
// ==========================================

class WalletStore {
  private subscribers = new Set<() => void>()

  // Cache para snapshots - evita loop infinito no useSyncExternalStore
  private cachedWallets: Wallet[] = []
  private cachedActiveWalletId: string | undefined = undefined

  constructor() {
    this.refreshCache()
  }

  private refreshCache = (): void => {
    this.cachedWallets = walletService.getAllWallets()
    this.cachedActiveWalletId = walletService.getActiveWalletId()
  }

  // ==========================================
  // SUBSCRIPTION
  // ==========================================

  subscribe = (callback: () => void): (() => void) => {
    this.subscribers.add(callback)
    return () => {
      this.subscribers.delete(callback)
    }
  }

  private notify = (): void => {
    this.refreshCache()
    this.subscribers.forEach(callback => callback())
  }

  // ==========================================
  // SNAPSHOTS (para useSyncExternalStore)
  // ==========================================

  getWalletsSnapshot = (): Wallet[] => {
    return this.cachedWallets
  }

  getActiveWalletIdSnapshot = (): string | undefined => {
    return this.cachedActiveWalletId
  }

  getSnapshot = (): WalletStoreState => {
    return {
      wallets: this.cachedWallets,
      activeWalletId: this.cachedActiveWalletId,
    }
  }

  // ==========================================
  // ACTIONS
  // ==========================================

  createWallet = (params: Parameters<typeof walletService.createWallet>[0]): Wallet => {
    const wallet = walletService.createWallet(params)
    this.notify()
    return wallet
  }

  deleteWallet = (walletId: string): void => {
    walletService.deleteWallet(walletId)
    this.notify()
  }

  setActiveWallet = (walletId: string): void => {
    walletService.toggleActiveWallet(walletId)
    this.notify()
  }

  editWallet = (walletId: string, updates: Partial<Omit<Wallet, 'id'>>): void => {
    walletService.editWallet(walletId, updates)
    this.notify()
  }

  getMasterKey = (walletId: string, password?: string): Uint8Array => {
    return walletService.getMasterKey(walletId, password)
  }

  // ==========================================
  // ACTIONS OBJECT (para context)
  // ==========================================

  get actions(): WalletStoreActions {
    return {
      createWallet: this.createWallet,
      deleteWallet: this.deleteWallet,
      setActiveWallet: this.setActiveWallet,
      editWallet: this.editWallet,
      getMasterKey: this.getMasterKey,
    }
  }
}

// ==========================================
// SINGLETON EXPORT
// ==========================================

export const walletStore = new WalletStore()
