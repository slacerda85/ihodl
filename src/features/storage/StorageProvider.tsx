import React, { createContext, useContext, useReducer, ReactNode, useEffect, useRef } from 'react'
import { appReducer, initialAppState, AppState, AppAction } from './storage'
import { MMKV } from 'react-native-mmkv'
import { initializeElectrumPeers } from './electrum/electrum'

const storage = new MMKV()
const STORAGE_KEY = 'app-state'

// Clear persisted state (useful for testing)
export const clearPersistedState = () => {
  try {
    storage.delete(STORAGE_KEY)
    console.log('[StorageProvider] Persisted state cleared')
  } catch (error) {
    console.error('Error clearing persisted state:', error)
  }
}

// Load initial state from storage
const loadPersistedState = (): AppState => {
  try {
    const persistedState = storage.getString(STORAGE_KEY)
    if (persistedState) {
      const parsed = JSON.parse(persistedState)
      // Exclude lightning from persisted state to avoid state shape issues
      const { lightning, ...parsedWithoutLightning } = parsed
      // Merge with initial state to handle new properties
      return {
        ...initialAppState,
        ...parsedWithoutLightning,
        // Reset loading states on app start
        wallet: {
          ...initialAppState.wallet,
          ...parsedWithoutLightning.wallet,
          loadingWalletState: false,
        },
        transactions: {
          ...initialAppState.transactions,
          ...parsedWithoutLightning.transactions,
          loadingTxState: false,
          loadingMempoolState: false,
          addressCaches: parsedWithoutLightning.transactions?.addressCaches || {},
        },
        blockchain: {
          ...initialAppState.blockchain,
          ...parsedWithoutLightning.blockchain,
        }, // Persist blockchain sync state
        /* lightning: {
          ...initialAppState.lightning,
          ...parsedWithoutLightning.lightning,
          
        }, */
        electrum: {
          ...initialAppState.electrum,
          ...parsedWithoutLightning.electrum,
        }, // Persist electrum peer state
      }
    }
  } catch (error) {
    console.error('Error loading persisted state:', error)
  }
  return initialAppState
}

// Context
type StorageContextType = {
  state: AppState
  dispatch: React.Dispatch<AppAction>
}

const StorageContext = createContext<StorageContextType | undefined>(undefined)

// Provider
export const StorageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, loadPersistedState())
  const hasInitializedPeers = useRef(false)

  // Initialize Electrum peers on app startup
  useEffect(() => {
    if (!hasInitializedPeers.current) {
      hasInitializedPeers.current = true
      initializeElectrumPeers(dispatch, state)
    }
  }, [dispatch]) // eslint-disable-line react-hooks/exhaustive-deps

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
        /* lightning: {
          spvEnabled: state.lightning.spvEnabled,
          channels: state.lightning.channels,
          // Don't persist loading state
        }, */
        electrum: {
          trustedPeers: state.electrum.trustedPeers,
          lastPeerUpdate: state.electrum.lastPeerUpdate,
          // Don't persist loadingPeers as it should reset to false on app start
        },
      }

      storage.set(STORAGE_KEY, JSON.stringify(stateToPersist))
    } catch (error) {
      console.error('Error persisting state:', error)
    }
  }, [state])

  return <StorageContext.Provider value={{ state, dispatch }}>{children}</StorageContext.Provider>
}

export const useStorage = (): StorageContextType => {
  const context = useContext(StorageContext)
  if (!context) {
    throw new Error('useStorage must be used within a StorageProvider')
  }
  return context
}

// Hook to clear persisted state (useful for testing)
export const useClearPersistedState = () => {
  return clearPersistedState
}

// Effect to clear persisted state on mount (useful for testing)
export const useClearPersistedStateOnMount = () => {
  useEffect(() => {
    clearPersistedState()
  }, [])
}
