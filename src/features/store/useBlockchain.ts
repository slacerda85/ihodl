import { useStore } from './StoreProvider'
import { useCallback, useEffect } from 'react'
import { syncHeaders, getLastSyncedHeader, getCurrentBlockHeight } from '@/lib/blockchain'
import { useSettings } from './useSettings'

// Blockchain hook
export const useBlockchain = () => {
  const { state, dispatch } = useStore()
  const { maxBlockchainSizeGB } = useSettings()

  // Function to sync headers
  const syncHeadersManually = useCallback(async () => {
    if (state.blockchain.isSyncing) return

    dispatch({ type: 'BLOCKCHAIN', action: { type: 'SET_SYNCING', payload: true } })

    try {
      const lastHeader = getLastSyncedHeader()
      dispatch({
        type: 'BLOCKCHAIN',
        action: { type: 'SET_LAST_SYNCED_HEIGHT', payload: lastHeader?.height || null },
      })

      console.log('🔄 [useBlockchain] Starting sync, last synced:', lastHeader?.height)

      await syncHeaders(maxBlockchainSizeGB, (height, currentHeight) => {
        // Update progress during sync
        dispatch({
          type: 'BLOCKCHAIN',
          action: { type: 'SET_LAST_SYNCED_HEIGHT', payload: height },
        })
        if (currentHeight) {
          dispatch({
            type: 'BLOCKCHAIN',
            action: { type: 'SET_CURRENT_HEIGHT', payload: currentHeight },
          })
          const progress = height / currentHeight
          dispatch({
            type: 'BLOCKCHAIN',
            action: { type: 'SET_SYNC_PROGRESS', payload: progress },
          })
        }
      })

      const updatedLast = getLastSyncedHeader()
      console.log('✅ [useBlockchain] Sync completed, updated last height:', updatedLast?.height)
      dispatch({
        type: 'BLOCKCHAIN',
        action: { type: 'SET_LAST_SYNCED_HEIGHT', payload: updatedLast?.height || null },
      })
    } catch (error) {
      console.error('❌ [useBlockchain] Error syncing headers:', error)
    } finally {
      dispatch({ type: 'BLOCKCHAIN', action: { type: 'SET_SYNCING', payload: false } })
    }
  }, [state.blockchain.isSyncing, maxBlockchainSizeGB, dispatch])

  // Auto-sync on mount and periodically
  useEffect(() => {
    const performSync = async () => {
      if (state.blockchain.isSyncing) return

      dispatch({ type: 'BLOCKCHAIN', action: { type: 'SET_SYNCING', payload: true } })

      try {
        const lastHeader = getLastSyncedHeader()
        dispatch({
          type: 'BLOCKCHAIN',
          action: { type: 'SET_LAST_SYNCED_HEIGHT', payload: lastHeader?.height || null },
        })

        console.log('🔄 [useBlockchain] Starting sync, last synced:', lastHeader?.height)

        await syncHeaders(maxBlockchainSizeGB, (height, currentHeight) => {
          dispatch({
            type: 'BLOCKCHAIN',
            action: { type: 'SET_LAST_SYNCED_HEIGHT', payload: height },
          })
          if (currentHeight) {
            dispatch({
              type: 'BLOCKCHAIN',
              action: { type: 'SET_CURRENT_HEIGHT', payload: currentHeight },
            })
            const progress = height / currentHeight
            dispatch({
              type: 'BLOCKCHAIN',
              action: { type: 'SET_SYNC_PROGRESS', payload: progress },
            })
          }
        })

        const updatedLast = getLastSyncedHeader()
        console.log('✅ [useBlockchain] Sync completed, updated last height:', updatedLast?.height)
        dispatch({
          type: 'BLOCKCHAIN',
          action: { type: 'SET_LAST_SYNCED_HEIGHT', payload: updatedLast?.height || null },
        })
      } catch (error) {
        console.error('❌ [useBlockchain] Error syncing headers:', error)
      } finally {
        dispatch({ type: 'BLOCKCHAIN', action: { type: 'SET_SYNCING', payload: false } })
      }
    }

    performSync()

    // Check for new blocks every 10 minutes
    const interval = setInterval(
      async () => {
        const current = await getCurrentBlockHeight()
        if (current !== state.blockchain.currentHeight) {
          dispatch({
            type: 'BLOCKCHAIN',
            action: { type: 'SET_CURRENT_HEIGHT', payload: current },
          })
          await performSync()
        }
      },
      10 * 60 * 1000,
    ) // 10 minutes

    return () => clearInterval(interval)
  }, [maxBlockchainSizeGB, state.blockchain.currentHeight, state.blockchain.isSyncing, dispatch])

  return {
    // State
    isSyncing: state.blockchain.isSyncing,
    lastSyncedHeight: state.blockchain.lastSyncedHeight,
    currentHeight: state.blockchain.currentHeight,
    syncProgress: state.blockchain.syncProgress,

    // Actions
    syncHeadersManually,
  }
}
