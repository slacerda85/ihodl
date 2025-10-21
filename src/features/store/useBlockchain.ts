import { useStore } from './StoreProvider'
import { useCallback, useEffect } from 'react'
import { syncHeaders, getLastSyncedHeader, getCurrentBlockHeight } from '@/lib/blockchain'
import { useSettings } from './useSettings'

// Blockchain hook
export const useBlockchain = () => {
  const { state, dispatch } = useStore()
  const { maxBlockchainSizeGB } = useSettings()

  // Shared sync function to eliminate code duplication
  const performSync = useCallback(
    async (isManual: boolean = false) => {
      if (state.blockchain.isSyncing) return

      dispatch({ type: 'BLOCKCHAIN', action: { type: 'SET_SYNCING', payload: true } })

      try {
        const lastHeader = getLastSyncedHeader()
        const initialHeight = lastHeader?.height || null

        dispatch({
          type: 'BLOCKCHAIN',
          action: { type: 'SET_LAST_SYNCED_HEIGHT', payload: initialHeight },
        })

        console.log(
          `🔄 [useBlockchain] Starting sync${isManual ? ' (manual)' : ''}, last synced:`,
          initialHeight,
        )

        await syncHeaders(
          maxBlockchainSizeGB,
          (height, currentHeight) => {
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
          },
          { blockchain: state.blockchain }, // Pass only blockchain state to avoid circular deps
        )

        const updatedLast = getLastSyncedHeader()
        const finalHeight = updatedLast?.height || null
        console.log(
          `✅ [useBlockchain] Sync completed${isManual ? ' (manual)' : ''}, updated last height:`,
          finalHeight,
        )

        dispatch({
          type: 'BLOCKCHAIN',
          action: { type: 'SET_LAST_SYNCED_HEIGHT', payload: finalHeight },
        })
      } catch (error) {
        console.error(
          `❌ [useBlockchain] Error syncing headers${isManual ? ' (manual)' : ''}:`,
          error,
        )
      } finally {
        dispatch({ type: 'BLOCKCHAIN', action: { type: 'SET_SYNCING', payload: false } })
      }
    },
    [maxBlockchainSizeGB, dispatch, state.blockchain],
  )

  // Manual sync function
  const syncHeadersManually = useCallback(async () => {
    await performSync(true)
  }, [performSync])

  // Validate data consistency between in-memory state and persistent storage
  const validateDataConsistency = useCallback(async () => {
    try {
      const storedLastHeader = getLastSyncedHeader()
      const storedHeight = storedLastHeader?.height || null
      const memoryHeight = state.blockchain.lastSyncedHeight

      if (storedHeight !== memoryHeight) {
        console.warn('⚠️ [useBlockchain] Data inconsistency detected:', {
          stored: storedHeight,
          memory: memoryHeight,
        })

        // Sync memory state with stored state
        if (storedHeight !== null) {
          dispatch({
            type: 'BLOCKCHAIN',
            action: { type: 'SET_LAST_SYNCED_HEIGHT', payload: storedHeight },
          })
          console.log('✅ [useBlockchain] Memory state synced with stored data')
        }
      }

      return storedHeight === memoryHeight
    } catch (error) {
      console.error('❌ [useBlockchain] Error validating data consistency:', error)
      return false
    }
  }, [state.blockchain.lastSyncedHeight, dispatch])

  // Auto-sync on mount and periodically
  useEffect(() => {
    // Validate data consistency on mount
    validateDataConsistency()

    // Initial sync on mount
    performSync()

    // Check for new blocks every 10 minutes
    const interval = setInterval(
      async () => {
        try {
          const current = await getCurrentBlockHeight()
          if (current !== state.blockchain.currentHeight) {
            dispatch({
              type: 'BLOCKCHAIN',
              action: { type: 'SET_CURRENT_HEIGHT', payload: current },
            })
            // Only sync if we're not already syncing and there's a significant height difference
            if (!state.blockchain.isSyncing && state.blockchain.lastSyncedHeight) {
              const heightDiff = current - state.blockchain.lastSyncedHeight
              if (heightDiff > 0) {
                console.log(
                  `📈 [useBlockchain] New blocks detected (${heightDiff}), triggering sync`,
                )
                performSync()
              }
            }
          }
        } catch (error) {
          console.error('❌ [useBlockchain] Error checking for new blocks:', error)
        }
      },
      10 * 60 * 1000, // 10 minutes
    )

    return () => clearInterval(interval)
  }, [
    performSync,
    validateDataConsistency,
    state.blockchain.currentHeight,
    state.blockchain.isSyncing,
    state.blockchain.lastSyncedHeight,
    dispatch,
  ])

  return {
    // State
    blockchain: state.blockchain,
    // Actions
    syncHeadersManually,
    validateDataConsistency,
  }
}
