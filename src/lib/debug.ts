/**
 * Utilitário para debug e migração do novo sistema de transações
 */

import useStorage from '../features/storage/useStorage'

export function debugTxStorage() {
  const store = useStorage.getState()

  console.log('=== Debug TX Storage ===')
  console.log('Active Wallet ID:', store.activeWalletId)
  console.log('Wallet Caches:', store.tx.walletCaches?.length || 0)
  console.log('Loading TX State:', store.tx.loadingTxState)

  if (store.activeWalletId) {
    const balance = store.tx.getBalance(store.activeWalletId)
    const utxos = store.tx.getUtxos(store.activeWalletId)
    const analysis = store.tx.getTransactionAnalysis(store.activeWalletId)

    console.log('Balance:', balance)
    console.log('UTXOs:', utxos?.length || 0)
    console.log('Transaction Analysis:', {
      totalTransactions: analysis?.transactions?.length || 0,
      stats: analysis?.stats,
    })
  }

  console.log('========================')
}

export function clearAllTxData() {
  console.log('Limpando todos os dados de transação...')

  useStorage.setState(state => ({
    tx: {
      ...state.tx,
      walletCaches: [],
      loadingTxState: false,
    },
  }))

  console.log('Dados de transação limpos')
}
