import { useEffect } from 'react'
import useStorage from '../../storage'

/**
 * Hook personalizado para gerenciar o carregamento automático de transações
 */
export function useTransactionSync(activeWalletId?: string) {
  const store = useStorage()

  const loadingWallet = useStorage(state => state.loadingWalletState)
  const loadingTx = useStorage(state => state.tx?.loadingTxState)
  const fetchTransactions = useStorage(state => state.tx?.fetchTransactions)
  const walletCaches = useStorage(state => state.tx?.walletCaches || [])

  // Verificar se as funções existem no store
  const hasFetchTransactions = store.tx && typeof store.tx.fetchTransactions === 'function'

  // Check if we have cached data for the active wallet
  const hasTransactionData = activeWalletId
    ? walletCaches.some(cache => cache.walletId === activeWalletId)
    : false

  useEffect(() => {
    if (
      activeWalletId &&
      !loadingWallet &&
      !loadingTx &&
      !hasTransactionData &&
      hasFetchTransactions
    ) {
      // Small delay to allow UI to update first
      const timer = setTimeout(() => {
        // Usar a função diretamente do store para garantir que existe
        store.tx.fetchTransactions(activeWalletId)
      }, 100)

      return () => {
        clearTimeout(timer)
      }
    } else {
    }
  }, [activeWalletId, hasFetchTransactions, loadingWallet, loadingTx, hasTransactionData, store.tx])

  return {
    loading: loadingWallet || loadingTx,
    hasTransactionData,
    isWalletLoading: loadingWallet,
    isTransactionLoading: loadingTx,
  }
}
