import { useStorage } from '../StorageProvider'
import {
  processTxHistory,
  calculateAddressCache,
  findNextUnusedAddress,
  getTxHistory,
} from '@/lib/transactions'
import { processWalletTransactions } from '@/lib/utxo'
import { createRootExtendedKey, fromMnemonic } from '@/lib/key'
import { getMempoolTransactions as getMempoolTransactionsLib } from '@/lib/electrum'
import { useCallback } from 'react'

// Transactions hook
export const useTransactions = () => {
  const { state, dispatch } = useStorage()

  // Helper function to fetch transactions
  const fetchTransactionsHelper = async (walletId: string, walletSeedPhrase: string) => {
    console.log(`🔄 [fetchTransactions] Iniciando busca de transações para wallet: ${walletId}`)
    dispatch({ type: 'TRANSACTIONS', action: { type: 'SET_LOADING_TX', payload: true } })

    // Check if we have a valid cache for this wallet
    const existingCache = state.transactions.cachedTransactions.find(
      cache => cache.walletId === walletId,
    )
    const CACHE_VALIDITY_MS = 5 * 60 * 1000 // 5 minutes
    if (existingCache && Date.now() - existingCache.lastUpdated < CACHE_VALIDITY_MS) {
      console.log(
        `✅ [fetchTransactions] Usando cache existente para wallet ${walletId} (atualizado há ${(Date.now() - existingCache.lastUpdated) / 1000}s atrás)`,
      )
      dispatch({ type: 'TRANSACTIONS', action: { type: 'SET_LOADING_TX', payload: false } })
      return
    }

    try {
      // Fetch transactions using the existing method
      console.log(`📡 [fetchTransactions] Criando extended key...`)
      const rootExtendedKey = createRootExtendedKey(fromMnemonic(walletSeedPhrase))
      console.log(`📡 [fetchTransactions] Chamando getTxHistory...`)
      const { txHistory } = await getTxHistory({
        extendedKey: rootExtendedKey,
        trustedPeers: state.electrum.trustedPeers,
      })
      console.log(`📡 [fetchTransactions] getTxHistory retornou ${txHistory.length} endereços`)

      // Process txHistory
      const { uniqueTransactions, uniqueAddresses } = processTxHistory(txHistory)
      console.log(
        `🔧 [fetchTransactions] Extraído ${uniqueTransactions.length} transações brutas e ${uniqueAddresses.length} endereços do txHistory`,
      )

      const newCache = {
        walletId,
        transactions: uniqueTransactions,
        addresses: uniqueAddresses,
        lastUpdated: Date.now(),
      }

      dispatch({
        type: 'TRANSACTIONS',
        action: { type: 'SET_WALLET_CACHE', payload: { walletId, cache: newCache } },
      })
      console.log(`✅ [fetchTransactions] Cache atualizado com sucesso para wallet ${walletId}`)

      // Calculate address cache
      const { usedReceivingAddresses, usedChangeAddresses } = calculateAddressCache(txHistory)

      // Find next unused receiving address
      const usedAddressSet = new Set(uniqueAddresses)
      const nextUnusedAddress = findNextUnusedAddress(rootExtendedKey, usedAddressSet)

      const addressCache = {
        nextUnusedAddress,
        usedReceivingAddresses,
        usedChangeAddresses,
      }

      dispatch({
        type: 'TRANSACTIONS',
        action: { type: 'SET_ADDRESS_CACHE', payload: { walletId, cache: addressCache } },
      })
      console.log(`✅ [fetchTransactions] Address cache atualizado para wallet ${walletId}`)
    } catch (error) {
      console.error(`❌ [fetchTransactions] Erro durante o fetch para wallet ${walletId}:`, error)
      if (error instanceof Error) {
        console.error('📝 [fetchTransactions] Detalhes do erro:', {
          message: error.message,
          stack: error.stack,
        })
      }
    } finally {
      console.log(`🏁 [fetchTransactions] Finalizando fetch para wallet ${walletId}`)
      dispatch({ type: 'TRANSACTIONS', action: { type: 'SET_LOADING_TX', payload: false } })
    }
  }

  return {
    // State
    cachedTransactions: state.transactions.cachedTransactions,
    pendingTransactions: state.transactions.pendingTransactions,
    loadingTxState: state.transactions.loadingTxState,
    loadingMempoolState: state.transactions.loadingMempoolState,
    mempoolTransactions: state.transactions.mempoolTransactions,

    // Actions
    setLoadingTx: (loading: boolean) =>
      dispatch({ type: 'TRANSACTIONS', action: { type: 'SET_LOADING_TX', payload: loading } }),
    setLoadingMempool: (loading: boolean) =>
      dispatch({ type: 'TRANSACTIONS', action: { type: 'SET_LOADING_MEMPOOL', payload: loading } }),
    setWalletCache: (walletId: string, cache: any) =>
      dispatch({
        type: 'TRANSACTIONS',
        action: { type: 'SET_WALLET_CACHE', payload: { walletId, cache } },
      }),
    clearWalletCache: (walletId: string) =>
      dispatch({ type: 'TRANSACTIONS', action: { type: 'CLEAR_WALLET_CACHE', payload: walletId } }),
    addPendingTransaction: (tx: any) =>
      dispatch({ type: 'TRANSACTIONS', action: { type: 'ADD_PENDING_TX', payload: tx } }),
    removePendingTransaction: (txid: string) =>
      dispatch({ type: 'TRANSACTIONS', action: { type: 'REMOVE_PENDING_TX', payload: txid } }),
    setMempoolTransactions: (transactions: any[]) =>
      dispatch({
        type: 'TRANSACTIONS',
        action: { type: 'SET_MEMPOOL_TRANSACTIONS', payload: transactions },
      }),

    // Async Actions
    fetchTransactions: useCallback(fetchTransactionsHelper, [dispatch]), // eslint-disable-line react-hooks/exhaustive-deps

    fetchMempoolTransactions: async (walletId: string) => {
      console.log(
        `🔄 [fetchMempoolTransactions] Iniciando busca de transações na mempool para wallet: ${walletId}`,
      )
      dispatch({ type: 'TRANSACTIONS', action: { type: 'SET_LOADING_MEMPOOL', payload: true } })

      try {
        const addressCache = state.transactions.addressCaches[walletId]
        if (!addressCache) {
          console.log('[fetchMempoolTransactions] No address cache found for wallet:', walletId)
          return
        }

        const addresses = [
          addressCache.nextUnusedAddress,
          ...addressCache.usedReceivingAddresses.map(addr => addr.address),
          ...addressCache.usedChangeAddresses.map(addr => addr.address),
        ].filter(addr => typeof addr === 'string' && addr.trim()) // Filter out any non-string or empty addresses

        if (addresses.length === 0) {
          console.log('[fetchMempoolTransactions] No valid addresses found for wallet:', walletId)
          return
        }

        console.log(
          `[fetchMempoolTransactions] Fetching mempool transactions for ${addresses.length} addresses:`,
          addresses,
        )
        const mempoolTxs = await getMempoolTransactionsLib(addresses)
        console.log(`[fetchMempoolTransactions] Found ${mempoolTxs.length} mempool transactions`)

        // Store mempool transactions in state
        dispatch({
          type: 'TRANSACTIONS',
          action: { type: 'SET_MEMPOOL_TRANSACTIONS', payload: mempoolTxs },
        })

        console.log(
          `✅ [fetchMempoolTransactions] Mempool transactions processed for wallet ${walletId}`,
        )
      } catch (error) {
        console.error(
          `❌ [fetchMempoolTransactions] Error fetching mempool transactions for wallet ${walletId}:`,
          error,
        )
      } finally {
        console.log(`🏁 [fetchMempoolTransactions] Finalizing mempool fetch for wallet ${walletId}`)
        dispatch({ type: 'TRANSACTIONS', action: { type: 'SET_LOADING_MEMPOOL', payload: false } })
      }
    },

    // Selectors
    getWalletCache: useCallback(
      (walletId: string) =>
        state.transactions.cachedTransactions.find(cache => cache.walletId === walletId) || null,
      [state.transactions.cachedTransactions],
    ),
    getPendingTransactions: useCallback(
      (walletId: string) =>
        state.transactions.pendingTransactions.filter(tx => tx.walletId === walletId),
      [state.transactions.pendingTransactions],
    ),
    getAddressCache: useCallback(
      (walletId: string) => state.transactions.addressCaches[walletId] || null,
      [state.transactions.addressCaches],
    ),
    getBalance: useCallback(
      (walletId: string) => {
        const cache = state.transactions.cachedTransactions.find(c => c.walletId === walletId)
        if (!cache) return 0
        const walletAddresses = new Set(cache.addresses)
        const { balance } = processWalletTransactions(cache.transactions, walletAddresses)
        return balance
      },
      [state.transactions.cachedTransactions],
    ),
    getUtxos: useCallback(
      (walletId: string) => {
        const cache = state.transactions.cachedTransactions.find(c => c.walletId === walletId)
        if (!cache) return []
        const walletAddresses = new Set(cache.addresses)
        const { utxos } = processWalletTransactions(cache.transactions, walletAddresses)
        return utxos
      },
      [state.transactions.cachedTransactions],
    ),
    getTransactionAnalysis: useCallback(
      (walletId: string) => {
        const cache = state.transactions.cachedTransactions.find(c => c.walletId === walletId)
        if (!cache) return null
        const walletAddresses = new Set(cache.addresses)
        return processWalletTransactions(cache.transactions, walletAddresses)
      },
      [state.transactions.cachedTransactions],
    ),
  }
}
