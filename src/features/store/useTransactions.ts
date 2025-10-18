import { useStore } from './StoreProvider'
import { processWalletTransactions } from '@/lib/utxo'
import { getTxHistory } from '@/lib/transactions'
import { createRootExtendedKey, fromMnemonic } from '@/lib/key'
import { getMempoolTransactions as getMempoolTransactionsLib } from '@/lib/electrum'
import { useCallback } from 'react'

// Transactions hook
export const useTransactions = () => {
  const { state, dispatch } = useStore()

  // Helper function to fetch transactions
  const fetchTransactionsHelper = async (
    walletId: string,
    walletSeedPhrase: string,
    addressCache?: any,
  ) => {
    console.log(`🔄 [fetchTransactions] Iniciando busca de transações para wallet: ${walletId}`)
    dispatch({ type: 'TRANSACTIONS', action: { type: 'SET_LOADING_TX', payload: true } })

    try {
      // Fetch transactions using the existing method
      console.log(`📡 [fetchTransactions] Criando extended key...`)
      const rootExtendedKey = createRootExtendedKey(fromMnemonic(walletSeedPhrase))
      console.log(`📡 [fetchTransactions] Chamando getTxHistory...`)
      const { txHistory } = await getTxHistory({
        extendedKey: rootExtendedKey,
      })
      console.log(`📡 [fetchTransactions] getTxHistory retornou ${txHistory.length} endereços`)

      // Extract all transactions and addresses
      console.log(
        `🔧 [fetchTransactions] Processando ${txHistory.length} endereços do txHistory...`,
      )
      const allTransactions: any[] = []
      const allAddresses: string[] = []

      for (const addressData of txHistory) {
        allAddresses.push(addressData.receivingAddress, addressData.changeAddress)
        allTransactions.push(...addressData.txs)
      }
      console.log(
        `🔧 [fetchTransactions] Extraído ${allTransactions.length} transações brutas e ${allAddresses.length} endereços do txHistory`,
      )

      // Add addresses from addressCache to ensure addresses is not empty
      if (addressCache) {
        const cacheAddressesCount =
          1 + addressCache.usedReceivingAddresses.length + addressCache.usedChangeAddresses.length
        allAddresses.push(
          addressCache.nextUnusedAddress,
          ...addressCache.usedReceivingAddresses,
          ...addressCache.usedChangeAddresses,
        )
        console.log(
          `✅ [fetchTransactions] Adicionados ${cacheAddressesCount} endereços do addressCache`,
        )
      } else {
        console.log(`⚠️ [fetchTransactions] AddressCache não encontrado para wallet ${walletId}`)
      }

      // Remove duplicate transactions
      console.log(`🔧 [fetchTransactions] Removendo transações duplicadas...`)
      const uniqueTransactions = Array.from(
        new Map(allTransactions.map(tx => [tx.txid, tx])).values(),
      )
      console.log(
        `✅ [fetchTransactions] ${allTransactions.length} -> ${uniqueTransactions.length} transações únicas`,
      )

      const uniqueAddresses = [...new Set(allAddresses)]
      console.log(
        `✅ [fetchTransactions] Preparado cache: ${uniqueTransactions.length} txs, ${uniqueAddresses.length} endereços`,
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
    walletCaches: state.transactions.walletCaches,
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
    fetchTransactions: useCallback(fetchTransactionsHelper, [dispatch]),

    fetchMempoolTransactions: async (walletId: string, addressCache?: any) => {
      console.log(
        `🔄 [fetchMempoolTransactions] Iniciando busca de transações na mempool para wallet: ${walletId}`,
      )
      dispatch({ type: 'TRANSACTIONS', action: { type: 'SET_LOADING_MEMPOOL', payload: true } })

      try {
        if (!addressCache) {
          console.log('[fetchMempoolTransactions] No address cache found for wallet:', walletId)
          return
        }

        const addresses = [
          addressCache.nextUnusedAddress,
          ...addressCache.usedReceivingAddresses,
          ...addressCache.usedChangeAddresses,
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
        state.transactions.walletCaches.find(cache => cache.walletId === walletId) || null,
      [state.transactions.walletCaches],
    ),
    getPendingTransactions: useCallback(
      (walletId: string) =>
        state.transactions.pendingTransactions.filter(tx => tx.walletId === walletId),
      [state.transactions.pendingTransactions],
    ),
    getBalance: useCallback(
      (walletId: string) => {
        const cache = state.transactions.walletCaches.find(c => c.walletId === walletId)
        if (!cache) return 0
        const walletAddresses = new Set(cache.addresses)
        const { balance } = processWalletTransactions(cache.transactions, walletAddresses)
        return balance
      },
      [state.transactions.walletCaches],
    ),
    getUtxos: useCallback(
      (walletId: string) => {
        const cache = state.transactions.walletCaches.find(c => c.walletId === walletId)
        if (!cache) return []
        const walletAddresses = new Set(cache.addresses)
        const { utxos } = processWalletTransactions(cache.transactions, walletAddresses)
        return utxos
      },
      [state.transactions.walletCaches],
    ),
    getTransactionAnalysis: useCallback(
      (walletId: string) => {
        const cache = state.transactions.walletCaches.find(c => c.walletId === walletId)
        if (!cache) return null
        const walletAddresses = new Set(cache.addresses)
        return processWalletTransactions(cache.transactions, walletAddresses)
      },
      [state.transactions.walletCaches],
    ),
  }
}
