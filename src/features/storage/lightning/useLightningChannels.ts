import { useCallback } from 'react'
import { useStorage } from '../StorageProvider'
import { LightningChannel } from '@/lib/lightning'

/**
 * Hook for Lightning channel management operations - Simplified for SPV
 */
export const useLightningChannels = () => {
  const { state, dispatch } = useStorage()

  /**
   * Adds a new channel to SPV state
   */
  const addChannel = useCallback(
    (channel: LightningChannel): void => {
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'ADD_CHANNEL', payload: channel },
      })
    },
    [dispatch],
  )

  /**
   * Updates an existing channel
   */
  const updateChannel = useCallback(
    (channelId: string, updates: Partial<LightningChannel>): void => {
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'UPDATE_CHANNEL', payload: { channelId, updates } },
      })
    },
    [dispatch],
  )

  /**
   * Removes a channel from SPV state
   */
  const removeChannel = useCallback(
    (channelId: string): void => {
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'REMOVE_CHANNEL', payload: channelId },
      })
    },
    [dispatch],
  )

  /**
   * Gets channels from local SPV state
   */
  const getLocalChannels = useCallback((): LightningChannel[] => {
    return state.lightning?.channels || []
  }, [state.lightning?.channels])

  /**
   * Gets active channels only
   */
  const getActiveChannels = useCallback((): LightningChannel[] => {
    return getLocalChannels().filter(channel => channel.active)
  }, [getLocalChannels])

  /**
   * Gets pending channels
   */
  const getPendingChannels = useCallback((): LightningChannel[] => {
    return getLocalChannels().filter(
      channel => channel.status === 'pending_open' || channel.lifecycleState === 'opening',
    )
  }, [getLocalChannels])

  /**
   * Gets closing channels
   */
  const getClosingChannels = useCallback((): LightningChannel[] => {
    return getLocalChannels().filter(
      channel => channel.status === 'closing' || channel.lifecycleState === 'closing',
    )
  }, [getLocalChannels])

  /**
   * Calculates total channel capacity
   */
  const getTotalCapacity = useCallback((): number => {
    return getLocalChannels().reduce((total, channel) => total + channel.capacity, 0)
  }, [getLocalChannels])

  /**
   * Calculates total local balance across all channels
   */
  const getTotalLocalBalance = useCallback((): number => {
    return getActiveChannels().reduce((total, channel) => total + channel.localBalance, 0)
  }, [getActiveChannels])

  /**
   * Calculates total remote balance across all channels
   */
  const getTotalRemoteBalance = useCallback((): number => {
    return getActiveChannels().reduce((total, channel) => total + channel.remoteBalance, 0)
  }, [getActiveChannels])

  /**
   * Gets channel by ID
   */
  const getChannelById = useCallback(
    (channelId: string): LightningChannel | undefined => {
      return getLocalChannels().find(channel => channel.channelId === channelId)
    },
    [getLocalChannels],
  )

  return {
    // State - reactive to SPV state changes
    channels: state.lightning?.channels || [],
    totalBalance: (state.lightning?.channels || [])
      .filter(channel => channel.active)
      .reduce((total, channel) => total + channel.localBalance, 0),
    activeChannelsCount: (state.lightning?.channels || []).filter(channel => channel.active).length,

    // Breez SDK connection status
    breezConnected: state.lightning?.breezConnected || false,

    // Actions
    addChannel,
    updateChannel,
    removeChannel,

    // Getters
    getLocalChannels,
    getActiveChannels,
    getPendingChannels,
    getClosingChannels,
    getChannelById,
    getTotalCapacity,
    getTotalLocalBalance,
    getTotalRemoteBalance,

    // Status
    isSpvEnabled: state.lightning?.spvEnabled || false,

    // Loading state
    isLoading: state.lightning?.loadingLightningState || false,
  }
}
