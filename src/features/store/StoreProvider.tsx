import React, { createContext, useContext, useReducer, ReactNode, useEffect, useRef } from 'react'
import { appReducer, initialAppState, AppState, AppAction } from './store'
import { MMKV } from 'react-native-mmkv'
import { electrumActions } from './electrum'

const storage = new MMKV()
const STORAGE_KEY = 'app-state'

// Initialize Electrum peers on app startup
const initializeElectrumPeers = async (dispatch: React.Dispatch<AppAction>, state: AppState) => {
  try {
    console.log('[StoreProvider] Initializing Electrum peers...')

    // Check if we have any saved trusted peers
    const hasTrustedPeers = state.electrum.trustedPeers.length > 0

    if (!hasTrustedPeers) {
      console.log(
        '[StoreProvider] No saved trusted peers found, this appears to be first app launch',
      )
      console.log('[StoreProvider] Performing initial peer discovery and testing...')
    } else {
      console.log(
        `[StoreProvider] Found ${state.electrum.trustedPeers.length} saved trusted peers, updating if needed...`,
      )
    }

    // Always update trusted peers (this will fetch new peers if needed and test them)
    const actions = await electrumActions.updateTrustedPeers(() => ({ electrum: state.electrum }))
    actions.forEach(action => dispatch({ type: 'ELECTRUM', action }))

    console.log('[StoreProvider] Electrum peers initialization completed')
  } catch (error) {
    console.error('[StoreProvider] Error initializing Electrum peers:', error)
    // Don't throw - we don't want to break app startup
  }
}

// Load initial state from storage
const loadPersistedState = (): AppState => {
  try {
    const persistedState = storage.getString(STORAGE_KEY)
    if (persistedState) {
      const parsed = JSON.parse(persistedState)
      // Merge with initial state to handle new properties
      return {
        ...initialAppState,
        ...parsed,
        // Reset loading states on app start
        wallet: {
          ...initialAppState.wallet,
          ...parsed.wallet,
          loadingWalletState: false,
        },
        transactions: {
          ...initialAppState.transactions,
          ...parsed.transactions,
          loadingTxState: false,
          loadingMempoolState: false,
          addressCaches: parsed.transactions?.addressCaches || {},
        },
        blockchain: {
          ...initialAppState.blockchain,
          ...parsed.blockchain,
        }, // Persist blockchain sync state
        lightning: {
          ...initialAppState.lightning,
          ...parsed.lightning,
          // Reset connection state on app start (don't persist connection)
          lightningConnection: initialAppState.lightning.lightningConnection,
        },
      }
    }
  } catch (error) {
    console.error('Error loading persisted state:', error)
  }
  return initialAppState
}

// Context
type StoreContextType = {
  state: AppState
  dispatch: React.Dispatch<AppAction>
}

const StoreContext = createContext<StoreContextType | undefined>(undefined)

// Provider
export const StoreProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, loadPersistedState())
  const hasInitializedPeers = useRef(false)

  // Initialize Electrum peers on app startup
  useEffect(() => {
    if (!hasInitializedPeers.current) {
      hasInitializedPeers.current = true
      initializeElectrumPeers(dispatch, state)
    }
  }, [dispatch, state])

  // Persist state changes
  useEffect(() => {
    try {
      // Create partial state for persistence (exclude loading states and computed values)
      const stateToPersist = {
        wallet: {
          wallets: state.wallet.wallets,
          activeWalletId: state.wallet.activeWalletId,
          unit: state.wallet.unit,
        },
        settings: state.settings,
        transactions: {
          cachedTransactions: state.transactions.cachedTransactions,
          pendingTransactions: state.transactions.pendingTransactions,
          mempoolTransactions: state.transactions.mempoolTransactions,
          addressCaches: state.transactions.addressCaches,
        },
        blockchain: {
          lastSyncedHeight: state.blockchain.lastSyncedHeight,
          currentHeight: state.blockchain.currentHeight,
          syncProgress: state.blockchain.syncProgress,
          // Don't persist isSyncing as it should reset to false on app start
        },
      }

      storage.set(STORAGE_KEY, JSON.stringify(stateToPersist))
    } catch (error) {
      console.error('Error persisting state:', error)
    }
  }, [state])

  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>
}

// Hook to use the store
export const useStore = () => {
  const context = useContext(StoreContext)
  if (!context) {
    throw new Error('useStore must be used within a StoreProvider')
  }
  return context
}
