import { useEffect } from 'react'
import useStorage from '../../storage'

/**
 * Hook personalizado para gerenciar o carregamento automático de transações
 */
export function useTransactionSync(activeWalletId?: string) {
  const store = useStorage()
  console.log('🔍 [useTransactionSync] Store completo:', store)
  console.log('🔍 [useTransactionSync] store.tx:', store.tx)

  const loadingWallet = useStorage(state => state.loadingWalletState)
  const loadingTx = useStorage(state => state.tx?.loadingTxState)
  const fetchTransactions = useStorage(state => state.tx?.fetchTransactions)
  const walletCaches = useStorage(state => state.tx?.walletCaches || [])

  console.log('🔍 [useTransactionSync] fetchTransactions extraído:', fetchTransactions)
  console.log('🔍 [useTransactionSync] Tipo de fetchTransactions:', typeof fetchTransactions)

  // Verificar se as funções existem no store
  const hasFetchTransactions = store.tx && typeof store.tx.fetchTransactions === 'function'

  console.log('🔍 [useTransactionSync] Função fetchTransactions existe?', hasFetchTransactions)

  // Check if we have cached data for the active wallet
  const hasTransactionData = activeWalletId
    ? walletCaches.some(cache => cache.walletId === activeWalletId)
    : false

  console.log('🔄 [useTransactionSync] Estado do hook:', {
    activeWalletId,
    loadingWallet,
    loadingTx,
    hasTransactionData,
    cachesCount: walletCaches.length,
    fetchTransactionsType: typeof fetchTransactions,
  })

  useEffect(() => {
    console.log('🎯 [useTransactionSync] useEffect executado com:', {
      activeWalletId,
      loadingWallet,
      loadingTx,
      hasTransactionData,
      hasFetchFunction: hasFetchTransactions,
      storeTxExists: !!store.tx,
    })

    if (
      activeWalletId &&
      !loadingWallet &&
      !loadingTx &&
      !hasTransactionData &&
      hasFetchTransactions
    ) {
      console.log('✅ [useTransactionSync] Condições atendidas, iniciando fetch em 100ms...')
      // Small delay to allow UI to update first
      const timer = setTimeout(() => {
        console.log('🚀 [useTransactionSync] Executando fetchTransactions para:', activeWalletId)
        // Usar a função diretamente do store para garantir que existe
        store.tx.fetchTransactions(activeWalletId)
      }, 100)

      return () => {
        console.log('🧹 [useTransactionSync] Limpando timer')
        clearTimeout(timer)
      }
    } else {
      console.log('❌ [useTransactionSync] Condições não atendidas. Motivos:', {
        noActiveWallet: !activeWalletId,
        walletLoading: loadingWallet,
        txLoading: loadingTx,
        hasData: hasTransactionData,
        noFetchFunction: !hasFetchTransactions,
        storeTxMissing: !store.tx,
      })
    }
  }, [activeWalletId, hasFetchTransactions, loadingWallet, loadingTx, hasTransactionData, store.tx])

  return {
    loading: loadingWallet || loadingTx,
    hasTransactionData,
    isWalletLoading: loadingWallet,
    isTransactionLoading: loadingTx,
  }
}
