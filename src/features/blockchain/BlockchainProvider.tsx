/**
 * Blockchain Context Provider
 * Provides shared blockchain client instance across the app
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { initializeBlockchainClient, IBlockchainClient } from '@/lib/blockchain'

interface BlockchainContextType {
  blockchainClient: IBlockchainClient | null
  isInitialized: boolean
  isInitializing: boolean
  error: string | null
}

const BlockchainContext = createContext<BlockchainContextType | undefined>(undefined)

interface BlockchainProviderProps {
  children: ReactNode
}

export function BlockchainProvider({ children }: BlockchainProviderProps) {
  const [blockchainClient, setBlockchainClient] = useState<IBlockchainClient | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
  }, [isInitialized, isInitializing])

  const value: BlockchainContextType = {
    blockchainClient,
    isInitialized,
    isInitializing,
    error,
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
