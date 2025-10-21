import { useCallback } from 'react'
import { useStore } from '@/features/store'
import { useWallet } from './useWallet'
import {
  openChannel,
  closeChannel,
  listChannels,
  createInvoice,
  LightningChannel,
  OpenChannelParams,
  CreateInvoiceParams,
  LightningInvoice,
} from '@/lib/lightning'

/**
 * Hook for Lightning channel management operations
 */
export const useLightningChannels = () => {
  const { state, dispatch } = useStore()
  const { activeWalletId } = useWallet()

  /**
   * Opens a new Lightning channel
   */
  const openChannelAsync = useCallback(
    async (params: OpenChannelParams): Promise<{ channelId: string }> => {
      if (!activeWalletId) {
        throw new Error('No active wallet')
      }

      return await openChannel(activeWalletId, params, state, dispatch)
    },
    [activeWalletId, state, dispatch],
  )

  /**
   * Closes an existing Lightning channel
   */
  const closeChannelAsync = useCallback(
    async (channelId: string, force: boolean = false): Promise<void> => {
      if (!activeWalletId) {
        throw new Error('No active wallet')
      }

      return await closeChannel(activeWalletId, channelId, force, state, dispatch)
    },
    [activeWalletId, state, dispatch],
  )

  /**
   * Lists all channels for the wallet
   */
  const listChannelsAsync = useCallback(
    async (activeOnly: boolean = false): Promise<LightningChannel[]> => {
      if (!activeWalletId) {
        throw new Error('No active wallet')
      }

      // Check if wallet is configured before attempting to list channels
      if (!state.lightning?.lightningConfigs[activeWalletId]) {
        return [] // Return empty array instead of throwing error
      }

      return await listChannels(activeWalletId, activeOnly, state, dispatch)
    },
    [activeWalletId, state, dispatch],
  )

  /**
   * Creates a Lightning invoice
   */
  const createInvoiceAsync = useCallback(
    async (params: CreateInvoiceParams): Promise<LightningInvoice> => {
      if (!activeWalletId) {
        throw new Error('No active wallet')
      }

      // Check if wallet is configured before attempting to create invoice
      if (!state.lightning?.lightningConfigs[activeWalletId]) {
        throw new Error('Lightning wallet not configured')
      }

      return await createInvoice(activeWalletId, params, state, dispatch)
    },
    [activeWalletId, state, dispatch],
  )

  /**
   * Refreshes channel list from the node
   */
  const loadChannelsAsync = useCallback(async (): Promise<LightningChannel[]> => {
    return await listChannelsAsync(false)
  }, [listChannelsAsync])

  /**
   * Gets channels from local state
   */
  const getLocalChannels = useCallback((): LightningChannel[] => {
    return activeWalletId ? state.lightning?.lightningWallets[activeWalletId]?.channels || [] : []
  }, [state.lightning?.lightningWallets, activeWalletId])

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

  /**
   * Checks if wallet is configured
   */
  const isWalletConfigured = useCallback((): boolean => {
    return activeWalletId ? !!state.lightning?.lightningConfigs[activeWalletId] : false
  }, [state.lightning?.lightningConfigs, activeWalletId])

  /**
   * Checks if node is connected
   */
  const isNodeConnected = useCallback((): boolean => {
    return activeWalletId ? !!state.lightning?.connectedNodes[activeWalletId] : false
  }, [state.lightning?.connectedNodes, activeWalletId])

  return {
    // State
    channels: getLocalChannels(),
    totalBalance: getTotalLocalBalance(),
    activeChannelsCount: getActiveChannels().length,

    // Actions
    openChannelAsync,
    closeChannelAsync,
    listChannelsAsync,
    loadChannelsAsync,
    createInvoiceAsync,

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
    isWalletConfigured: isWalletConfigured(),
    isNodeConnected: isNodeConnected(),

    // Loading state
    isLoading: state.lightning?.loadingLightningState || false,
  }
}
