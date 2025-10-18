import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from 'react'
import { syncHeaders, getLastSyncedHeader, getCurrentBlockHeight } from '@/lib/blockchain'
import useStorage from '@/features/storage/useStorage'

interface BlockchainContextType {
  isSyncing: boolean
  lastSyncedHeight: number | null
  currentHeight: number | null
  syncProgress: number
  syncHeadersManually: () => Promise<void>
}

const BlockchainContext = createContext<BlockchainContextType | undefined>(undefined)

export function useBlockchain() {
  const context = useContext(BlockchainContext)
  if (!context) {
    throw new Error('useBlockchain must be used within a BlockchainProvider')
  }
  return context
}

interface BlockchainProviderProps {
  children: ReactNode
}

export default function BlockchainProvider({ children }: BlockchainProviderProps) {
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncedHeight, setLastSyncedHeight] = useState<number | null>(null)
  const [currentHeight, setCurrentHeight] = useState<number | null>(null)
  const [syncProgress, setSyncProgress] = useState(0)

  const maxBlockchainSizeGB = useStorage(state => state.maxBlockchainSizeGB)

  // Function to sync headers
  const syncHeadersInternal = useCallback(async () => {
    if (isSyncing) return
    setIsSyncing(true)
    try {
      const lastHeader = getLastSyncedHeader()
      setLastSyncedHeight(lastHeader?.height || null)

      console.log('🔄 [BlockchainProvider] Starting sync, last synced:', lastHeader?.height)

      await syncHeaders(maxBlockchainSizeGB, (height, currentHeight) => {
        // Update progress during sync
        setLastSyncedHeight(height)
        if (currentHeight) {
          setCurrentHeight(currentHeight)
          setSyncProgress(height / currentHeight)
        }
      })

      const updatedLast = getLastSyncedHeader()
      console.log(
        '✅ [BlockchainProvider] Sync completed, updated last height:',
        updatedLast?.height,
      )
      setLastSyncedHeight(updatedLast?.height || null)
      // Note: syncProgress will be properly set when currentHeight is available
    } catch (error) {
      console.error('❌ [BlockchainProvider] Error syncing headers:', error)
    } finally {
      setIsSyncing(false)
    }
  }, [isSyncing, maxBlockchainSizeGB])

  // Auto-sync on mount and periodically
  useEffect(() => {
    syncHeadersInternal()

    // Check for new blocks every 10 minutes
    const interval = setInterval(
      async () => {
        const current = await getCurrentBlockHeight()
        if (current !== currentHeight) {
          setCurrentHeight(current)
          await syncHeadersInternal()
        }
      },
      10 * 60 * 1000,
    ) // 10 minutes

    return () => clearInterval(interval)
  }, [maxBlockchainSizeGB, currentHeight, syncHeadersInternal])

  const syncHeadersManually = syncHeadersInternal

  const value: BlockchainContextType = {
    isSyncing,
    lastSyncedHeight,
    currentHeight,
    syncProgress,
    syncHeadersManually,
  }

  return <BlockchainContext.Provider value={value}>{children}</BlockchainContext.Provider>
}
