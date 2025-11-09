import { useEffect } from 'react'
import { useWallet } from '../WalletProvider'
import { useTransactions } from '../../transactions/TransactionsProvider'

/**
 * Hook personalizado para gerenciar o carregamento automático de transações
 */
export function useTransactionSync(activeWalletId?: string) {
  const { state: walletState } = useWallet()
  const { state: transactionsState } = useTransactions()

  // Check if we have cached data for the active wallet
  const hasTransactionData = activeWalletId
    ? transactionsState.cachedTransactions.some((cache: any) => cache.walletId === activeWalletId)
    : false

  useEffect(() => {
    // TODO: Implement transaction fetching logic
    // For now, just check if we need to load data
    if (
      activeWalletId &&
      !walletState.loading &&
      !transactionsState.loadingTxState &&
      !hasTransactionData
    ) {
      // Transaction fetching will be implemented later
      console.log('Transaction sync needed for wallet:', activeWalletId)
    }
  }, [activeWalletId, walletState.loading, transactionsState.loadingTxState, hasTransactionData])

  return {
    loading: walletState.loading || transactionsState.loadingTxState,
    hasTransactionData,
    isWalletLoading: walletState.loading,
    isTransactionLoading: transactionsState.loadingTxState,
  }
}
