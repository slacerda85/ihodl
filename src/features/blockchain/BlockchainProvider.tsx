/**
 * Blockchain Context Provider
 * Provides shared blockchain client instance and sync state across the app
 */

/* import React, { createContext, useContext, useEffect, useState, ReactNode, useReducer } from 'react'
import { initializeBlockchainClient } from '@/core/lib/blockchain/client'
import type { IBlockchainClient } from '@/lib/blockchain/types'
import {
  blockchainReducer,
  initialBlockchainState,
  BlockchainState,
  BlockchainAction,
} from './types'
import { MMKV } from 'react-native-mmkv'
import { useElectrum } from '../electrum'
import { syncHeaders, getCurrentBlockHeight } from '@/lib/blockchain'

const storage = new MMKV()
const BLOCKCHAIN_STORAGE_KEY = 'blockchain-state'

// Load initial state from storage
const loadPersistedBlockchainState = (): BlockchainState => {
  try {
    const persistedState = storage.getString(BLOCKCHAIN_STORAGE_KEY)
    if (persistedState) {
      const parsed = JSON.parse(persistedState)
      // Merge with initial state to handle new properties
      return {
        ...initialBlockchainState,
        ...parsed,
        // Reset syncing state on app start
        isSyncing: false,
      }
    }
  } catch (error) {
    console.error('Error loading persisted blockchain state:', error)
  }
  return initialBlockchainState
}

interface BlockchainContextType {
  // Client
  blockchainClient: IBlockchainClient | null
  isInitialized: boolean
  isInitializing: boolean
  error: string | null

  // State
  blockchainState: BlockchainState
  dispatchBlockchain: React.Dispatch<BlockchainAction>

  // Actions
  syncHeadersManually: () => Promise<void>
}

const BlockchainContext = createContext<BlockchainContextType | undefined>(undefined)

interface BlockchainProviderProps {
  children: ReactNode
}

export function BlockchainProvider({ children }: BlockchainProviderProps) {
  // Client state
  const [blockchainClient, setBlockchainClient] = useState<IBlockchainClient | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sync state
  const [blockchainState, dispatchBlockchain] = useReducer(
    blockchainReducer,
    loadPersistedBlockchainState(),
  )

  // Get Electrum connection function
  const { getConnection } = useElectrum()

  // Persist state changes
  useEffect(() => {
    try {
      // Create partial state for persistence (exclude runtime states)
      const stateToPersist = {
        lastSyncedHeight: blockchainState.lastSyncedHeight,
        currentHeight: blockchainState.currentHeight,
        syncProgress: blockchainState.syncProgress,
      }

      storage.set(BLOCKCHAIN_STORAGE_KEY, JSON.stringify(stateToPersist))
    } catch (error) {
      console.error('Error persisting blockchain state:', error)
    }
  }, [blockchainState])

  useEffect(() => {
    const initializeBlockchain = async () => {
      if (isInitialized || isInitializing) return

      setIsInitializing(true)
      setError(null)

      try {
        console.log('[Blockchain] Initializing SPV blockchain client...')

        const client = await initializeBlockchainClient({
          network: 'mainnet',
          timeout: 30000,
          minConfirmations: 1,
          persistentConnection: true,
          getConnectionFn: getConnection,
        })

        setBlockchainClient(client)
        setIsInitialized(true)

        console.log('[Blockchain] SPV blockchain client initialized successfully')
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        console.error('[Blockchain] Failed to initialize blockchain client:', errorMessage)
        setError(errorMessage)
      } finally {
        setIsInitializing(false)
      }
    }

    initializeBlockchain()
  }, [isInitialized, isInitializing, getConnection])

  // Manual sync function
  const syncHeadersManually = async () => {
    if (!blockchainClient) {
      console.error('Blockchain client not initialized')
      return
    }

    dispatchBlockchain({ type: 'SET_SYNCING', payload: true })

    try {
      // Get current height first
      const connection = await getConnection()
      const currentHeight = await getCurrentBlockHeight(connection)

      dispatchBlockchain({ type: 'SET_CURRENT_HEIGHT', payload: currentHeight })

      // Sync headers with progress callback
      await syncHeaders(
        1, // maxSizeGB - use 1GB as default
        (height, totalHeight) => {
          const progress = totalHeight ? height / totalHeight : 0
          dispatchBlockchain({ type: 'SET_LAST_SYNCED_HEIGHT', payload: height })
          dispatchBlockchain({ type: 'SET_SYNC_PROGRESS', payload: progress })
        },
      )

      console.log('Manual blockchain sync completed')
    } catch (error) {
      console.error('Error during manual blockchain sync:', error)
    } finally {
      dispatchBlockchain({ type: 'SET_SYNCING', payload: false })
    }
  }

  const value: BlockchainContextType = {
    blockchainClient,
    isInitialized,
    isInitializing,
    error,
    blockchainState,
    dispatchBlockchain,
    syncHeadersManually,
  }

  return <BlockchainContext.Provider value={value}>{children}</BlockchainContext.Provider>
}

export function useBlockchain(): BlockchainContextType {
  const context = useContext(BlockchainContext)
  if (context === undefined) {
    throw new Error('useBlockchain must be used within a BlockchainProvider')
  }
  return context
}
 */
