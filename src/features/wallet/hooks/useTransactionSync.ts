import { useEffect } from 'react'
import { useWallet, useTransactions } from '../../store'

/**
 * Hook personalizado para gerenciar o carregamento automático de transações
 */
export function useTransactionSync(activeWalletId?: string) {
  const { loadingWalletState: loadingWallet } = useWallet()
  const { loadingTxState: loadingTx, cachedTransactions } = useTransactions()

  // Check if we have cached data for the active wallet
  const hasTransactionData = activeWalletId
    ? cachedTransactions.some(cache => cache.walletId === activeWalletId)
    : false

  useEffect(() => {
    // TODO: Implement transaction fetching logic
    // For now, just check if we need to load data
    if (activeWalletId && !loadingWallet && !loadingTx && !hasTransactionData) {
      // Transaction fetching will be implemented later
      console.log('Transaction sync needed for wallet:', activeWalletId)
    }
  }, [activeWalletId, loadingWallet, loadingTx, hasTransactionData])

  return {
    loading: loadingWallet || loadingTx,
    hasTransactionData,
    isWalletLoading: loadingWallet,
    isTransactionLoading: loadingTx,
  }
}
