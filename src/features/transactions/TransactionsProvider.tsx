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
import {
  getFriendlyTransactions,
  calculateAddressCache,
  findNextUnusedAddress,
  deriveExtendedKeys,
  generateReceivingAddresses,
  generateChangeAddresses,
  getTxHistoryFromAddresses,
} from '@/lib/transactions'
import { getWalletSeedPhrase } from '@/lib/secureStorage'
import { createRootExtendedKey, fromMnemonic } from '@/lib/key'

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
  fetchTransactionHistory: (walletId: string) => Promise<void>
  refreshTransactionHistory: () => Promise<void>
}

const TransactionsContext = createContext<TransactionsContextType | undefined>(undefined)

// Provider
export default function TransactionsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(transactionsReducer, loadPersistedTransactionsState())
  const { getConnection } = useElectrum()
  const { wallets, activeWalletId } = useWallet()

  // Cache timing constants
  const CACHE_DURATION_MS = 30 * 60 * 1000 // 30 minutes

  // Ref to track ongoing fetches to prevent duplicates
  const ongoingFetches = useRef<Set<string>>(new Set())

  // Ensure addresses are generated for a wallet
  const ensureAddressesGenerated = useCallback(
    async (walletId: string, extendedKey: Uint8Array) => {
      if (state.generatedAddresses[walletId].receiving.length > 0) {
        return state.generatedAddresses[walletId]
      }

      console.log(`[TransactionsProvider] Generating addresses for wallet ${walletId}`)

      const { receivingExtendedKey, changeExtendedKey } = deriveExtendedKeys(extendedKey)

      // Generate addresses in batches to avoid blocking UI
      const gapLimit = 20
      const receivingAddresses = generateReceivingAddresses(
        receivingExtendedKey,
        changeExtendedKey,
        gapLimit,
      ).map(item => item.address)

      const changeAddresses = generateChangeAddresses(changeExtendedKey, gapLimit).map(
        item => item.address,
      )

      const addresses = {
        receiving: receivingAddresses,
        change: changeAddresses,
        startIndex: 0,
      }

      dispatch(transactionsActions.setGeneratedAddresses(walletId, addresses))

      return addresses
    },
    [state.generatedAddresses, dispatch],
  )

  // Fetch transaction history for a specific wallet
  const fetchTransactionHistory = useCallback(
    async (walletId: string) => {
      if (ongoingFetches.current.has(walletId)) {
        console.log(`[TransactionsProvider] Fetch already in progress for wallet ${walletId}`)
        return
      }

      ongoingFetches.current.add(walletId)

      const wallet = wallets.find(w => w.walletId === walletId)
      if (!wallet) {
        console.error(`[TransactionsProvider] Wallet ${walletId} not found`)
        ongoingFetches.current.delete(walletId)
        return
      }

      const seedPhrase = await getWalletSeedPhrase(walletId, '')
      if (!seedPhrase) {
        console.error(`[TransactionsProvider] Seed phrase not found for wallet ${walletId}`)
        ongoingFetches.current.delete(walletId)
        return
      }

      try {
        dispatch(transactionsActions.setLoadingTx(true))

        // Convert seed phrase to extended key
        const extendedKey = createRootExtendedKey(fromMnemonic(seedPhrase))

        // Ensure addresses are generated
        const addresses = await ensureAddressesGenerated(walletId, extendedKey)

        // Get connection
        const socket = await getConnection()

        // Fetch transaction history using pre-generated addresses
        const { txHistory, hasUnusedAddresses } = await getTxHistoryFromAddresses(
          addresses.receiving,
          addresses.change,
          socket,
          20, // gapLimit
        )

        // If all addresses were used, generate more
        if (!hasUnusedAddresses) {
          console.log(
            `[TransactionsProvider] All addresses used, generating more for wallet ${walletId}`,
          )
          // Generate next batch of addresses
          const { receivingExtendedKey, changeExtendedKey } = deriveExtendedKeys(
            extendedKey,
            84,
            0,
            0,
          )

          const nextStartIndex = addresses.receiving.length
          const additionalReceiving = generateReceivingAddresses(
            receivingExtendedKey,
            changeExtendedKey,
            20, // gapLimit
            nextStartIndex,
          ).map(item => item.address)

          const additionalChange = generateChangeAddresses(
            changeExtendedKey,
            20,
            nextStartIndex,
          ).map(item => item.address)

          // Fetch transactions for additional addresses
          const { txHistory: additionalTxHistory } = await getTxHistoryFromAddresses(
            additionalReceiving,
            additionalChange,
            socket,
            20,
          )

          txHistory.push(...additionalTxHistory)

          // Update generated addresses
          const updatedAddresses = {
            receiving: [...addresses.receiving, ...additionalReceiving],
            change: [...addresses.change, ...additionalChange],
            startIndex: nextStartIndex,
          }

          dispatch(transactionsActions.setGeneratedAddresses(walletId, updatedAddresses))
        }

        // Convert to friendly transactions
        const friendlyTransactions = await getFriendlyTransactions(txHistory, {
          extendedKey,
          getConnectionFn: getConnection,
        })

        // Collect all addresses from txHistory
        const allAddresses = new Set<string>()
        txHistory.forEach(history => {
          if (history.receivingAddress) allAddresses.add(history.receivingAddress)
          if (history.changeAddress) allAddresses.add(history.changeAddress)
        })

        // Update cache with new data
        const cacheData: CachedTransactions = {
          walletId,
          transactions: friendlyTransactions,
          addresses: Array.from(allAddresses),
          lastUpdated: Date.now(),
        }

        dispatch(transactionsActions.setWalletCache(walletId, cacheData))

        // Calculate address cache using helper functions
        const { usedReceivingAddresses, usedChangeAddresses } = calculateAddressCache(txHistory)

        const usedAddresses = new Set<string>()
        usedReceivingAddresses.forEach(addr => usedAddresses.add(addr.address))
        usedChangeAddresses.forEach(addr => usedAddresses.add(addr.address))

        const nextUnusedAddress = findNextUnusedAddress(extendedKey, usedAddresses)

        const addressCache = {
          nextUnusedAddress,
          usedReceivingAddresses,
          usedChangeAddresses,
        }

        dispatch(transactionsActions.setAddressCache(walletId, addressCache))

        console.log(
          `[TransactionsProvider] Fetched ${friendlyTransactions.length} transactions for wallet ${walletId}`,
        )

        dispatch(transactionsActions.setLoadingTx(false))
      } catch (error) {
        console.error('[TransactionsProvider] Error fetching transaction history:', error)
        dispatch(transactionsActions.setLoadingTx(false))
      }

      ongoingFetches.current.delete(walletId)
    },
    [getConnection, wallets, dispatch, ensureAddressesGenerated],
  )

  // Refresh transaction history for active wallet (with cache consideration)
  const refreshTransactionHistory = useCallback(async () => {
    if (!activeWalletId) {
      console.log('[TransactionsProvider] No active wallet to refresh')
      return
    }

    const cache = state.cachedTransactions.find(c => c.walletId === activeWalletId)
    if (!cache || cache.transactions.length === 0) {
      console.log(
        `[TransactionsProvider] No cache or empty cache for wallet ${activeWalletId}, fetching`,
      )
      await fetchTransactionHistory(activeWalletId)
      return
    }

    const timeSinceLastUpdate = Date.now() - cache.lastUpdated

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
  }, [activeWalletId, state.cachedTransactions, fetchTransactionHistory, CACHE_DURATION_MS])

  // Auto-refresh transaction history when active wallet changes
  useEffect(() => {
    if (activeWalletId) {
      console.log(
        `[TransactionsProvider] Active wallet changed to ${activeWalletId}, refreshing cache`,
      )
      refreshTransactionHistory()
    }
  }, [activeWalletId, refreshTransactionHistory])
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
