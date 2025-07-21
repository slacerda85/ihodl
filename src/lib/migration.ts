/**
 * Utilitário para migrar dados do sistema antigo para o novo
 * Este arquivo pode ser usado para limpar dados antigos e migrar para a nova estrutura
 */

import useStorage from '../features/storage/useStorage'

export function migrateTxStorage() {
  const store = useStorage.getState()

  // Limpar dados antigos se existirem
  if ('walletHistories' in store.tx) {
    console.log('Limpando dados antigos do txStorage...')
    // Forçar limpeza dos dados antigos
    useStorage.setState(state => ({
      tx: {
        ...state.tx,
        walletCaches: [],
        loadingTxState: false,
        // Remover propriedades antigas
        // @ts-ignore - propriedades antigas que não existem mais no tipo
        walletHistories: undefined,
      },
    }))

    console.log('Migração concluída - dados antigos removidos')
  }
}

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
