/**
 * Utilitário para limpar storage corrompido e forçar inicialização limpa
 */

export function clearCorruptedStorage() {
  // Limpar storage MMKV completamente
  if (typeof window !== 'undefined') {
    // Se for web
    localStorage.removeItem('app-storage')
  } else {
    // React Native - MMKV
    try {
      const { MMKV } = require('react-native-mmkv')
      const storage = new MMKV()
      storage.delete('app-storage')
      console.log('Storage MMKV limpo')
    } catch (error) {
      console.error('Erro ao limpar MMKV:', error)
    }
  }
}

export function debugStorageState() {
  try {
    const useStorage = require('../features/storage/useStorage').default
    const state = useStorage.getState()

    console.log('=== Debug Storage State ===')
    console.log('Wallets:', Array.isArray(state.wallets) ? state.wallets.length : 'invalid')
    console.log('Active Wallet:', state.activeWalletId)
    console.log('TX object:', typeof state.tx)
    console.log('TX keys:', state.tx ? Object.keys(state.tx) : 'no tx')

    if (state.tx) {
      console.log('getBalance type:', typeof state.tx.getBalance)
      console.log('fetchTransactions type:', typeof state.tx.fetchTransactions)
      console.log(
        'walletCaches:',
        Array.isArray(state.tx.walletCaches) ? state.tx.walletCaches.length : 'invalid',
      )
    }

    console.log('==========================')
  } catch (error) {
    console.error('Erro no debug:', error)
  }
}
