import React, {
  createContext,
  useContext,
  useReducer,
  ReactNode,
  useEffect,
  useCallback,
  useRef,
} from 'react'
import {
  transactionsReducer,
  initialTransactionsState,
  TransactionsState,
  TransactionsAction,
  transactionsActions,
  CachedTransactions,
} from './types'
import { MMKV } from 'react-native-mmkv'
import { useElectrum } from '../electrum/ElectrumProvider'
import { useWallet } from '../wallet/WalletProvider'
import { getTxHistory, getFriendlyTransactions } from '@/lib/transactions'
import { getWalletSeedPhrase } from '@/lib/secureStorage'
import { fromMnemonic } from '@/lib/key'

const storage = new MMKV()
const TRANSACTIONS_STORAGE_KEY = 'transactions-state'

// Load initial state from storage
const loadPersistedTransactionsState = (): TransactionsState => {
  try {
    const persistedState = storage.getString(TRANSACTIONS_STORAGE_KEY)
    if (persistedState) {
      const parsed = JSON.parse(persistedState)
      // Merge with initial state to handle new properties
      return {
        ...initialTransactionsState,
        ...parsed,
        // Reset loading states on app start
        loadingTxState: false,
        loadingMempoolState: false,
        addressCaches: parsed.addressCaches || {},
      }
    }
  } catch (error) {
    console.error('Error loading persisted transactions state:', error)
  }
  return initialTransactionsState
}

// Context
type TransactionsContextType = {
  state: TransactionsState
  dispatch: React.Dispatch<TransactionsAction>
  // Transaction functions
  fetchTransactionHistory: (walletId: string) => Promise<void>
  refreshTransactionHistory: () => Promise<void>
}

const TransactionsContext = createContext<TransactionsContextType | undefined>(undefined)

// Provider
export default function TransactionsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(transactionsReducer, loadPersistedTransactionsState())
  const { getConnection } = useElectrum()
  const { state: walletState } = useWallet()

  // Cache timing constants
  const CACHE_DURATION_MS = 10 * 60 * 1000 // 10 minutes (typical block time)
  const lastCacheUpdateRef = useRef<Record<string, number>>({})

  // Fetch transaction history for a specific wallet
  const fetchTransactionHistory = useCallback(
    async (walletId: string) => {
      const wallet = walletState.wallets.find(w => w.walletId === walletId)
      if (!wallet) {
        throw new Error(`Wallet ${walletId} not found`)
      }

      const seedPhrase = await getWalletSeedPhrase(walletId, '')
      if (!seedPhrase) {
        throw new Error(`Seed phrase not found for wallet ${walletId}`)
      }

      try {
        dispatch(transactionsActions.setLoadingTx(true))

        // Convert seed phrase to extended key
        const extendedKey = fromMnemonic(seedPhrase)

        // Fetch transaction history using the shared Electrum connection
        const { txHistory } = await getTxHistory({
          extendedKey,
          getConnectionFn: getConnection,
        })

        // Convert to friendly transactions
        const friendlyTransactions = await getFriendlyTransactions(txHistory, {
          extendedKey,
          getConnectionFn: getConnection,
        })

        // Update cache with new data
        const cacheData: CachedTransactions = {
          walletId,
          transactions: txHistory.flatMap(tx => tx.txs),
          addresses: txHistory.flatMap(h => [h.receivingAddress, h.changeAddress].filter(Boolean)),
          lastUpdated: Date.now(),
        }

        dispatch(transactionsActions.setWalletCache(walletId, cacheData))

        // Update last cache update time
        lastCacheUpdateRef.current[walletId] = Date.now()

        console.log(
          `[TransactionsProvider] Fetched ${friendlyTransactions.length} transactions for wallet ${walletId}`,
        )

        dispatch(transactionsActions.setLoadingTx(false))
      } catch (error) {
        console.error('[TransactionsProvider] Error fetching transaction history:', error)
        dispatch(transactionsActions.setLoadingTx(false))
        throw error
      }
    },
    [getConnection, walletState.wallets, dispatch],
  )

  // Refresh transaction history for active wallet (with cache consideration)
  const refreshTransactionHistory = useCallback(async () => {
    const activeWalletId = walletState.activeWalletId
    if (!activeWalletId) {
      console.log('[TransactionsProvider] No active wallet to refresh')
      return
    }

    const lastUpdate = lastCacheUpdateRef.current[activeWalletId] || 0
    const timeSinceLastUpdate = Date.now() - lastUpdate

    // Only refresh if cache is stale (older than CACHE_DURATION_MS)
    if (timeSinceLastUpdate < CACHE_DURATION_MS) {
      console.log(
        `[TransactionsProvider] Cache still fresh (${Math.round(
          timeSinceLastUpdate / 1000,
        )}s old), skipping refresh`,
      )
      return
    }

    console.log(
      `[TransactionsProvider] Refreshing transaction history for wallet ${activeWalletId}`,
    )
    await fetchTransactionHistory(activeWalletId)
  }, [walletState.activeWalletId, fetchTransactionHistory, CACHE_DURATION_MS])

  // Auto-refresh transaction history when active wallet changes
  useEffect(() => {
    if (walletState.activeWalletId) {
      console.log(
        `[TransactionsProvider] Active wallet changed to ${walletState.activeWalletId}, refreshing cache`,
      )
      refreshTransactionHistory()
    }
  }, [walletState.activeWalletId, refreshTransactionHistory])

  return (
    <TransactionsContext.Provider
      value={{
        state,
        dispatch,
        fetchTransactionHistory,
        refreshTransactionHistory,
      }}
    >
      {children}
    </TransactionsContext.Provider>
  )
}

export const useTransactions = (): TransactionsContextType => {
  const context = useContext(TransactionsContext)
  if (!context) {
    throw new Error('useTransactions must be used within a TransactionsProvider')
  }
  return context
}
