import { useStorage } from '../StorageProvider'
import { broadcastTransaction } from '@/lib/blockchain'
import { createInvoice, CreateInvoiceParams } from '@/lib/lightning'
import { LightningChannel } from '@/lib/lightning'
import { LIGHTNING_SERVICE_PROVIDERS, DEFAULT_LSP, LSPId } from '@/lib/lightning/constants'
import { breezClient } from '@/lib/lightning/client'
import { initializeBreezSDK } from '../StorageProvider'
import { useWallet } from '../wallet/useWallet'
import { ReceivePaymentRequest } from '@breeztech/breez-sdk-spark'

// Lightning hook - Simplified for SPV only
export const useLightning = () => {
  const { state, dispatch } = useStorage()
  const { getActiveWalletMnemonic } = useWallet()

  return {
    // State
    spvEnabled: state.lightning?.spvEnabled || false,
    selectedLsp: state.lightning?.selectedLsp || 'auto',
    channels: state.lightning?.channels || [],
    loadingLightningState: state.lightning?.loadingLightningState || false,
    breezConnected: state.lightning?.breezConnected || false,

    // Computed
    getActiveChannels: () => state.lightning?.channels?.filter(channel => channel.active) || [],

    getChannelById: (channelId: string) =>
      state.lightning?.channels?.find(channel => channel.channelId === channelId) || null,

    getLightningBalance: () =>
      state.lightning?.channels
        ?.filter(channel => channel.active)
        .reduce((total, channel) => total + channel.localBalance, 0) || 0,

    // SPV Actions
    setSpvEnabled: (enabled: boolean) =>
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'SET_SPV_ENABLED', payload: enabled },
      }),

    setSelectedLsp: (lsp: string) =>
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'SET_SELECTED_LSP', payload: lsp },
      }),

    // SPV Transaction broadcasting
    broadcastTransaction: async (rawTxHex: string) => {
      try {
        dispatch({
          type: 'LIGHTNING',
          action: { type: 'SET_LOADING_LIGHTNING', payload: true },
        })

        const txid = await broadcastTransaction(rawTxHex)

        return txid
      } catch (error) {
        console.error('Error broadcasting transaction:', error)
        throw error
      } finally {
        dispatch({
          type: 'LIGHTNING',
          action: { type: 'SET_LOADING_LIGHTNING', payload: false },
        })
      }
    },

    // Create Lightning Invoice
    createInvoice: async (params: CreateInvoiceParams) => {
      const activeWalletId = state.wallet?.activeWalletId

      if (!activeWalletId) {
        throw new Error('No active wallet')
      }

      // Get LSP configuration based on selected LSP
      const selectedLspId = (state.lightning?.selectedLsp as LSPId) || DEFAULT_LSP
      const lspConfig = LIGHTNING_SERVICE_PROVIDERS[selectedLspId]

      if (!lspConfig) {
        throw new Error(`LSP configuration not found for: ${selectedLspId}`)
      }

      if (!lspConfig.isAvailable) {
        console.warn(`[lightning] LSP ${selectedLspId} is not available for public API access`)
        // Fall back to mock invoice for demo purposes
        const mockInvoice: import('@/lib/lightning/types').LightningInvoice = {
          paymentRequest: `lnbc${params.amount || 1000}...mock${Date.now()}`,
          paymentHash: `mock${Date.now()}`,
          amount: params.amount || 0,
          description: params.description || 'Mock invoice - LSP unavailable',
          expiry: params.expiry || 3600,
          timestamp: Date.now(),
          payeePubKey: 'mockpubkey',
          minFinalCltvExpiry: 144,
          routingHints: [],
          features: [],
          signature: 'mocksignature',
        }

        console.log(
          `[lightning] Mock invoice created (LSP unavailable): ${mockInvoice.paymentHash}`,
        )
        return mockInvoice
      }

      // Convert LSP config to LightningConfig format
      const config = {
        nodeUrl: lspConfig.nodeUrl,
        type: lspConfig.type,
        authMethod: lspConfig.authMethod,
        tlsCert: undefined,
        macaroon: undefined,
        apiKey: undefined,
        timeout: lspConfig.timeout,
      }

      try {
        dispatch({
          type: 'LIGHTNING',
          action: { type: 'SET_LOADING_LIGHTNING', payload: true },
        })

        const invoice = await createInvoice(activeWalletId, params, config)

        // For now, don't save to state since we don't have invoice state
        // dispatch({
        //   type: 'LIGHTNING',
        //   action: { type: 'ADD_LIGHTNING_INVOICE', payload: { walletId: activeWalletId, invoice } },
        // })

        return invoice
      } catch (error) {
        console.error('Error creating invoice:', error)
        throw error
      } finally {
        dispatch({
          type: 'LIGHTNING',
          action: { type: 'SET_LOADING_LIGHTNING', payload: false },
        })
      }
    },

    // Channel management
    addChannel: (channel: LightningChannel) =>
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'ADD_CHANNEL', payload: channel },
      }),

    updateChannel: (channelId: string, updates: Partial<LightningChannel>) =>
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'UPDATE_CHANNEL', payload: { channelId, updates } },
      }),

    removeChannel: (channelId: string) =>
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'REMOVE_CHANNEL', payload: channelId },
      }),

    clearChannels: () =>
      dispatch({
        type: 'LIGHTNING',
        action: { type: 'CLEAR_CHANNELS' },
      }),

    // Initialize Breez SDK with active wallet mnemonic
    initializeBreezWithActiveWallet: async () => {
      const activeWalletId = state.wallet?.activeWalletId
      if (!activeWalletId) {
        throw new Error('No active wallet')
      }

      // Get mnemonic from active wallet
      const mnemonic = await getActiveWalletMnemonic()

      if (!mnemonic) {
        throw new Error('No mnemonic available for Breez initialization')
      }

      await initializeBreezSDK(dispatch, mnemonic)
    },

    // Breez SDK direct methods
    receivePayment: async (request: ReceivePaymentRequest) => {
      const activeWalletId = state.wallet?.activeWalletId

      if (!activeWalletId) {
        throw new Error('No active wallet')
      }

      try {
        dispatch({
          type: 'LIGHTNING',
          action: { type: 'SET_LOADING_LIGHTNING', payload: true },
        })

        const response = await breezClient.receivePayment(request)
        return response
      } catch (error) {
        console.error('Error receiving payment:', error)
        throw error
      } finally {
        dispatch({
          type: 'LIGHTNING',
          action: { type: 'SET_LOADING_LIGHTNING', payload: false },
        })
      }
    },

    // Lightning Address management
    checkLightningAddressAvailable: async (username: string) => {
      try {
        const request = { username }
        return await breezClient.checkLightningAddressAvailable(request)
      } catch (error) {
        console.error('Error checking lightning address availability:', error)
        throw error
      }
    },

    registerLightningAddress: async (username: string, description?: string) => {
      try {
        const request = { username, description }
        return await breezClient.registerLightningAddress(request)
      } catch (error) {
        console.error('Error registering lightning address:', error)
        throw error
      }
    },

    getLightningAddress: async () => {
      try {
        return await breezClient.getLightningAddress()
      } catch (error) {
        console.error('Error getting lightning address:', error)
        throw error
      }
    },

    deleteLightningAddress: async () => {
      try {
        await breezClient.deleteLightningAddress()
      } catch (error) {
        console.error('Error deleting lightning address:', error)
        throw error
      }
    },
  }
}
