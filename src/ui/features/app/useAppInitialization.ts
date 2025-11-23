/**
 * App Initialization Hook
 * Coordinates the initialization of core app services (blockchain, lightning, etc.)
 */

import { useEffect, useState } from 'react'
import { useBlockchain } from '@/ui/features/blockchain'
import { useLightningNetwork } from '@/ui/features/lightning/useLightningNetwork'

export interface AppInitializationState {
  isInitializing: boolean
  isInitialized: boolean
  blockchainReady: boolean
  lightningReady: boolean
  error: string | null
}

export function useAppInitialization(): AppInitializationState {
  const {
    blockchainClient,
    isInitialized: blockchainInitialized,
    error: blockchainError,
  } = useBlockchain()
  const { isInitialized: lightningInitialized, initializeLightning } = useLightningNetwork()

  const [isInitializing, setIsInitializing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize Lightning after blockchain is ready
  useEffect(() => {
    const initializeApp = async () => {
      if (!blockchainInitialized || !blockchainClient || lightningInitialized || isInitializing) {
        return
      }

      setIsInitializing(true)
      setError(null)

      try {
        console.log('[App] Initializing Lightning Network...')
        await initializeLightning()
        console.log('[App] Lightning Network initialized successfully')
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize Lightning'
        console.error('[App] Lightning initialization failed:', errorMessage)
        setError(errorMessage)
      }

      // Always set initializing to false, regardless of success or failure
      setIsInitializing(false)
    }

    initializeApp()
  }, [
    blockchainInitialized,
    blockchainClient,
    lightningInitialized,
    initializeLightning,
    isInitializing,
  ])

  const blockchainReady = blockchainInitialized && !!blockchainClient
  const lightningReady = lightningInitialized
  const isInitialized = blockchainReady && lightningReady

  // Combine errors
  const combinedError = blockchainError || error

  return {
    isInitializing: isInitializing || (!isInitialized && !combinedError),
    isInitialized,
    blockchainReady,
    lightningReady,
    error: combinedError,
  }
}
