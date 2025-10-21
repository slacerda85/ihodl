import { useStore } from './StoreProvider'
import {
  initializeLightningWallet,
  saveLightningWalletData,
  loadLightningWalletData,
  saveLightningConfig,
  loadLightningConfig,
  getLightningTransactionHistory,
  openChannel,
  closeChannel,
  listChannels,
  OpenChannelParams,
  LightningConfig,
  LightningWalletData,
} from '@/lib/lightning'

// Lightning hook
export const useLightning = () => {
  const { state, dispatch } = useStore()

  return {
    // State
    lightningWallets: state.lightning?.lightningWallets || {},
    lightningConfigs: state.lightning?.lightningConfigs || {},
    loadingLightningState: state.lightning?.loadingLightningState || false,
    connectedNodes: state.lightning?.connectedNodes || {},

    // Computed
    getLightningWallet: (walletId: string) => state.lightning?.lightningWallets?.[walletId] || null,

    getLightningConfig: (walletId: string) => state.lightning?.lightningConfigs?.[walletId] || null,

    getLightningChannels: (walletId: string) =>
      state.lightning?.lightningWallets?.[walletId]?.channels || [],

    getLightningPayments: (walletId: string) =>
      state.lightning?.lightningWallets?.[walletId]?.payments || [],

    getLightningInvoices: (walletId: string) =>
      state.lightning?.lightningWallets?.[walletId]?.invoices || [],

    getLightningBalance: (walletId: string) => {
      const wallet = state.lightning?.lightningWallets?.[walletId]
      if (!wallet) return 0

      return wallet.channels
        .filter(channel => channel.active)
        .reduce((total, channel) => total + channel.localBalance, 0)
    },

    isNodeConnected: (walletId: string) => state.lightning?.connectedNodes?.[walletId] || false,

    // Actions
    initializeLightningWallet: async (bitcoinWalletId: string, config: LightningConfig) => {
      const walletData = await initializeLightningWallet(bitcoinWalletId, config, dispatch)
      return walletData
    },

    saveLightningWalletData: async (data: LightningWalletData, walletId: string) => {
      await saveLightningWalletData(data, walletId, dispatch)
    },

    loadLightningWalletData: async (walletId: string) => {
      return await loadLightningWalletData(walletId, state)
    },

    saveLightningConfig: async (config: LightningConfig, walletId: string) => {
      await saveLightningConfig(config, walletId, dispatch)
    },

    loadLightningConfig: async (walletId: string) => {
      return await loadLightningConfig(walletId, state)
    },

    getLightningTransactionHistory: async (walletId: string, limit: number = 50) => {
      return await getLightningTransactionHistory(walletId, state, limit)
    },

    openChannel: async (walletId: string, params: OpenChannelParams) => {
      try {
        dispatch({
          type: 'LIGHTNING',
          action: { type: 'SET_LOADING_LIGHTNING', payload: true },
        })
        const result = await openChannel(walletId, params, state, dispatch)

        // Add the new channel to the store (will be updated when confirmed)
        const newChannel: any = {
          channelId: result.channelId,
          channelPoint: '', // Will be set when funding tx is created
          localBalance: params.localFundingAmount - (params.pushSat || 0),
          remoteBalance: params.pushSat || 0,
          capacity: params.localFundingAmount,
          remotePubkey: params.nodePubkey,
          status: 'pending_open' as const,
          channelType: 'legacy' as const,
          numConfirmations: 0,
          commitmentType: 'legacy' as const,
          private: params.private || false,
          initiator: true,
          feePerKw: 253,
          unsettledBalance: 0,
          totalSatoshisSent: 0,
          totalSatoshisReceived: 0,
          numUpdates: 0,
          pendingHtlcs: [],
          csvDelay: 144,
          active: false,
          lifecycleState: 'opening' as const,
        }

        dispatch({
          type: 'LIGHTNING',
          action: { type: 'ADD_LIGHTNING_CHANNEL', payload: { walletId, channel: newChannel } },
        })
        return result
      } catch (error) {
        console.error('Error opening channel:', error)
        throw error
      } finally {
        dispatch({
          type: 'LIGHTNING',
          action: { type: 'SET_LOADING_LIGHTNING', payload: false },
        })
      }
    },

    closeChannel: async (walletId: string, channelId: string, force: boolean = false) => {
      try {
        dispatch({
          type: 'LIGHTNING',
          action: { type: 'SET_LOADING_LIGHTNING', payload: true },
        })
        await closeChannel(walletId, channelId, force, state, dispatch)

        // Update channel status in store
        dispatch({
          type: 'LIGHTNING',
          action: {
            type: 'UPDATE_LIGHTNING_CHANNEL',
            payload: {
              walletId,
              channelId,
              updates: { status: 'closing' as const, lifecycleState: 'closing' as const },
            },
          },
        })
      } catch (error) {
        console.error('Error closing channel:', error)
        throw error
      } finally {
        dispatch({
          type: 'LIGHTNING',
          action: { type: 'SET_LOADING_LIGHTNING', payload: false },
        })
      }
    },

    listChannels: async (walletId: string, activeOnly: boolean = false) => {
      try {
        dispatch({
          type: 'LIGHTNING',
          action: { type: 'SET_LOADING_LIGHTNING', payload: true },
        })
        const channels = await listChannels(walletId, activeOnly, state, dispatch)

        // Update channels in store
        channels.forEach(channel => {
          dispatch({
            type: 'LIGHTNING',
            action: {
              type: 'UPDATE_LIGHTNING_CHANNEL',
              payload: { walletId, channelId: channel.channelId, updates: channel },
            },
          })
        })

        return channels
      } catch (error) {
        console.error('Error listing channels:', error)
        throw error
      } finally {
        dispatch({
          type: 'LIGHTNING',
          action: { type: 'SET_LOADING_LIGHTNING', payload: false },
        })
      }
    },
    // Store actions
    setLightningWallet: (walletId: string, data: LightningWalletData) =>
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'SET_LIGHTNING_WALLET', payload: { walletId, data } },
      }),

    updateLightningWallet: (walletId: string, updates: Partial<LightningWalletData>) =>
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'UPDATE_LIGHTNING_WALLET', payload: { walletId, updates } },
      }),

    deleteLightningWallet: (walletId: string) =>
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'DELETE_LIGHTNING_WALLET', payload: walletId },
      }),

    setLightningConfig: (walletId: string, config: LightningConfig) =>
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'SET_LIGHTNING_CONFIG', payload: { walletId, config } },
      }),

    updateLightningConfig: (walletId: string, updates: Partial<LightningConfig>) =>
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'UPDATE_LIGHTNING_CONFIG', payload: { walletId, updates } },
      }),

    setLoadingLightning: (loading: boolean) =>
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'SET_LOADING_LIGHTNING', payload: loading },
      }),

    setNodeConnection: (walletId: string, connected: boolean) =>
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'SET_NODE_CONNECTION', payload: { walletId, connected } },
      }),

    addLightningChannel: (walletId: string, channel: any) =>
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'ADD_LIGHTNING_CHANNEL', payload: { walletId, channel } },
      }),

    updateLightningChannel: (walletId: string, channelId: string, updates: any) =>
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'UPDATE_LIGHTNING_CHANNEL', payload: { walletId, channelId, updates } },
      }),

    removeLightningChannel: (walletId: string, channelId: string) =>
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'REMOVE_LIGHTNING_CHANNEL', payload: { walletId, channelId } },
      }),

    addLightningPayment: (walletId: string, payment: any) =>
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'ADD_LIGHTNING_PAYMENT', payload: { walletId, payment } },
      }),

    updateLightningPayment: (walletId: string, paymentHash: string, updates: any) =>
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'UPDATE_LIGHTNING_PAYMENT', payload: { walletId, paymentHash, updates } },
      }),

    addLightningInvoice: (walletId: string, invoice: any) =>
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'ADD_LIGHTNING_INVOICE', payload: { walletId, invoice } },
      }),

    updateLightningInvoice: (walletId: string, paymentHash: string, updates: any) =>
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'UPDATE_LIGHTNING_INVOICE', payload: { walletId, paymentHash, updates } },
      }),

    loadChannels: async (walletId: string) => {
      try {
        dispatch({
          type: 'LIGHTNING',
          action: { type: 'SET_LOADING_LIGHTNING', payload: true },
        })
        await listChannels(walletId, false, state, dispatch)
      } catch (error) {
        console.error('Error loading channels:', error)
        throw error
      } finally {
        dispatch({
          type: 'LIGHTNING',
          action: { type: 'SET_LOADING_LIGHTNING', payload: false },
        })
      }
    },
  }
}
