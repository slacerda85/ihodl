import React, { createContext, useContext, useReducer, ReactNode, useEffect } from 'react'
import { appReducer, initialAppState, AppState, AppAction } from './store'
import { MMKV } from 'react-native-mmkv'

const storage = new MMKV()
const STORAGE_KEY = 'app-state'

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
        },
        blockchain: initialAppState.blockchain, // Always reset blockchain state on app start
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

  // Persist state changes
  useEffect(() => {
    try {
      // Create partial state for persistence (exclude loading states and computed values)
      const stateToPersist = {
        wallet: {
          wallets: state.wallet.wallets,
          activeWalletId: state.wallet.activeWalletId,
          unit: state.wallet.unit,
          addressCache: state.wallet.addressCache,
        },
        settings: state.settings,
        transactions: {
          walletCaches: state.transactions.walletCaches,
          pendingTransactions: state.transactions.pendingTransactions,
          mempoolTransactions: state.transactions.mempoolTransactions,
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
