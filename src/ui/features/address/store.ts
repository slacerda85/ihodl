/**
 * Address Store
 *
 * Store singleton com pub/sub para endereços e balance.
 * Separado do provider para permitir composição no AppProvider.
 *
 * PRINCÍPIOS:
 * 1. Dados persistidos no MMKV via services
 * 2. Cache para evitar loop infinito no useSyncExternalStore
 * 3. Notifica subscribers quando dados mudam
 * 4. Loading é gerenciado externamente (AppProvider)
 */

import { AddressDetails } from '@/core/models/address'
import { Utxo } from '@/core/models/transaction'
import { addressService, transactionService, walletService } from '@/core/services'

// ==========================================
// TYPES
// ==========================================

export interface AddressStoreState {
  addresses: AddressDetails[]
  balance: number
  utxos: Utxo[]
  nextReceiveAddress: string
  nextChangeAddress: string
}

// ==========================================
// STORE CLASS
// ==========================================

class AddressStore {
  private subscribers = new Set<() => void>()

  // Cache para snapshots - evita loop infinito
  private cachedAddresses: AddressDetails[] = []
  private cachedBalance: { balance: number; utxos: Utxo[] } = { balance: 0, utxos: [] }
  private cachedNextAddresses: { receive: string; change: string } = { receive: '', change: '' }

  constructor() {
    this.refreshCache()
  }

  // ==========================================
  // CACHE MANAGEMENT
  // ==========================================

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

    const activeWalletId = walletService.getActiveWalletId()
    if (!activeWalletId) {
      this.cachedNextAddresses = { receive: '', change: '' }
      return
    }

    try {
      this.cachedNextAddresses = addressService.getNextAddresses()
    } catch {
      this.cachedNextAddresses = { receive: '', change: '' }
    }
  }

  /**
   * Limpa o cache para mostrar estado vazio (skeleton)
   */
  clear = (): void => {
    this.cachedAddresses = []
    this.cachedBalance = { balance: 0, utxos: [] }
    this.cachedNextAddresses = { receive: '', change: '' }
    this.subscribers.forEach(callback => callback())
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

  /**
   * Notifica com refresh completo
   */
  notify = (): void => {
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

  // ==========================================
  // SNAPSHOTS (para useSyncExternalStore)
  // ==========================================

  getAddressesSnapshot = (): AddressDetails[] => {
    return this.cachedAddresses
  }

  getBalanceSnapshot = (): { balance: number; utxos: Utxo[] } => {
    return this.cachedBalance
  }

  getNextAddressesSnapshot = (): { receive: string; change: string } => {
    return this.cachedNextAddresses
  }

  getSnapshot = (): AddressStoreState => {
    return {
      addresses: this.cachedAddresses,
      balance: this.cachedBalance.balance,
      utxos: this.cachedBalance.utxos,
      nextReceiveAddress: this.cachedNextAddresses.receive,
      nextChangeAddress: this.cachedNextAddresses.change,
    }
  }
}

// ==========================================
// SINGLETON EXPORT
// ==========================================

export const addressStore = new AddressStore()
