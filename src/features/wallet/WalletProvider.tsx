import React, { createContext, useContext, useReducer, ReactNode, useEffect } from 'react'
import {
  walletReducer,
  initialWalletState,
  WalletState,
  WalletAction,
  walletActions,
} from './types'
import { MMKV } from 'react-native-mmkv'
import { createWallet as createWalletLib, storeWalletSeed } from '@/lib/wallet/wallet'

const storage = new MMKV()
const WALLET_STORAGE_KEY = 'wallet-state'

// Load initial state from storage
const loadPersistedWalletState = (): WalletState => {
  try {
    const persistedState = storage.getString(WALLET_STORAGE_KEY)
    if (persistedState) {
      const parsed = JSON.parse(persistedState)
      // Merge with initial state to handle new properties
      return {
        ...initialWalletState,
        ...parsed,
        // Reset loading states on app start
        loadingWalletState: false,
      }
    }
  } catch (error) {
    console.error('Error loading persisted wallet state:', error)
  }
  return initialWalletState
}

// Context
type WalletContextType = {
  state: WalletState
  dispatch: React.Dispatch<WalletAction>
  createWallet: (params: {
    walletName: string
    offline: boolean
    usePassword: boolean
    password: string
  }) => Promise<void>
  importWallet: (params: {
    walletName: string
    seedPhrase: string
    usePassword: boolean
    password: string
  }) => Promise<void>
}

const WalletContext = createContext<WalletContextType | undefined>(undefined)

// Provider
export default function WalletProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(walletReducer, loadPersistedWalletState())

  // Wallet creation function
  const createWallet = async (params: {
    walletName: string
    offline: boolean
    usePassword: boolean
    password: string
  }) => {
    const passwordToUse = params.usePassword && params.password ? params.password : ''

    try {
      // Create wallet using the proper wallet library function
      const result = createWalletLib({
        walletName: params.walletName,
        cold: params.offline,
        // seedPhrase is optional - if not provided, a new one will be generated
      })

      // Store the seed phrase securely
      await storeWalletSeed(result.wallet.walletId, result.seedPhrase, passwordToUse)

      // Dispatch the action to add wallet to state
      dispatch(walletActions.createWallet(result.wallet))

      console.log('Wallet created successfully:', result.wallet.walletId)
    } catch (error) {
      console.error('Error creating wallet:', error)
      throw error // Re-throw to let the component handle the error
    }
  }

  // Wallet import function
  const importWallet = async (params: {
    walletName: string
    seedPhrase: string
    usePassword: boolean
    password: string
  }) => {
    const passwordToUse = params.usePassword && params.password ? params.password : ''

    try {
      // Import wallet using the wallet library function with provided seed phrase
      const result = createWalletLib({
        walletName: params.walletName,
        seedPhrase: params.seedPhrase,
        cold: false, // Import wallets are typically not cold wallets
      })

      // Store the seed phrase securely
      await storeWalletSeed(result.wallet.walletId, result.seedPhrase, passwordToUse)

      // Dispatch the action to add wallet to state
      dispatch(walletActions.createWallet(result.wallet))

      console.log('Wallet imported successfully:', result.wallet.walletId)
    } catch (error) {
      console.error('Error importing wallet:', error)
      throw error // Re-throw to let the component handle the error
    }
  }

  // Persist state changes
  useEffect(() => {
    try {
      // Create partial state for persistence (exclude loading states)
      const stateToPersist = {
        wallets: state.wallets,
        activeWalletId: state.activeWalletId,
        unit: state.unit,
      }

      storage.set(WALLET_STORAGE_KEY, JSON.stringify(stateToPersist))
    } catch (error) {
      console.error('Error persisting wallet state:', error)
    }
  }, [state])

  return (
    <WalletContext.Provider value={{ state, dispatch, createWallet, importWallet }}>
      {children}
    </WalletContext.Provider>
  )
}

export const useWallet = (): WalletContextType => {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider')
  }
  return context
}
