import {
  LightningWalletData,
  LightningConfig,
  LightningChannel,
  LightningPayment,
  LightningInvoice,
} from '@/lib/lightning'
import { Reducer } from './types'

// Lightning State
export type LightningState = {
  lightningWallets: {
    [walletId: string]: LightningWalletData
  }
  lightningConfigs: {
    [walletId: string]: LightningConfig
  }
  loadingLightningState: boolean
  connectedNodes: {
    [walletId: string]: boolean
  }
}

// Lightning Actions
export type LightningAction =
  | { type: 'SET_LIGHTNING_WALLET'; payload: { walletId: string; data: LightningWalletData } }
  | {
      type: 'UPDATE_LIGHTNING_WALLET'
      payload: { walletId: string; updates: Partial<LightningWalletData> }
    }
  | { type: 'DELETE_LIGHTNING_WALLET'; payload: string }
  | { type: 'SET_LIGHTNING_CONFIG'; payload: { walletId: string; config: LightningConfig } }
  | {
      type: 'UPDATE_LIGHTNING_CONFIG'
      payload: { walletId: string; updates: Partial<LightningConfig> }
    }
  | { type: 'SET_LOADING_LIGHTNING'; payload: boolean }
  | { type: 'SET_NODE_CONNECTION'; payload: { walletId: string; connected: boolean } }
  | { type: 'ADD_LIGHTNING_CHANNEL'; payload: { walletId: string; channel: LightningChannel } }
  | {
      type: 'UPDATE_LIGHTNING_CHANNEL'
      payload: { walletId: string; channelId: string; updates: Partial<LightningChannel> }
    }
  | { type: 'REMOVE_LIGHTNING_CHANNEL'; payload: { walletId: string; channelId: string } }
  | { type: 'ADD_LIGHTNING_PAYMENT'; payload: { walletId: string; payment: LightningPayment } }
  | {
      type: 'UPDATE_LIGHTNING_PAYMENT'
      payload: { walletId: string; paymentHash: string; updates: Partial<LightningPayment> }
    }
  | { type: 'ADD_LIGHTNING_INVOICE'; payload: { walletId: string; invoice: LightningInvoice } }
  | {
      type: 'UPDATE_LIGHTNING_INVOICE'
      payload: { walletId: string; paymentHash: string; updates: Partial<LightningInvoice> }
    }

// Initial state
export const initialLightningState: LightningState = {
  lightningWallets: {},
  lightningConfigs: {},
  loadingLightningState: false,
  connectedNodes: {},
}

// Reducer
export const lightningReducer: Reducer<LightningState, LightningAction> = (state, action) => {
  switch (action.type) {
    case 'SET_LIGHTNING_WALLET':
      return {
        ...state,
        lightningWallets: {
          ...state.lightningWallets,
          [action.payload.walletId]: action.payload.data,
        },
      }

    case 'UPDATE_LIGHTNING_WALLET':
      const currentWallet = state.lightningWallets[action.payload.walletId]
      if (!currentWallet) return state

      return {
        ...state,
        lightningWallets: {
          ...state.lightningWallets,
          [action.payload.walletId]: {
            ...currentWallet,
            ...action.payload.updates,
          },
        },
      }

    case 'DELETE_LIGHTNING_WALLET':
      const { [action.payload]: _, ...remainingWallets } = state.lightningWallets
      const { [action.payload]: __, ...remainingConfigs } = state.lightningConfigs
      const { [action.payload]: ___, ...remainingConnections } = state.connectedNodes

      return {
        ...state,
        lightningWallets: remainingWallets,
        lightningConfigs: remainingConfigs,
        connectedNodes: remainingConnections,
      }

    case 'SET_LIGHTNING_CONFIG':
      return {
        ...state,
        lightningConfigs: {
          ...state.lightningConfigs,
          [action.payload.walletId]: action.payload.config,
        },
      }

    case 'UPDATE_LIGHTNING_CONFIG':
      const currentConfig = state.lightningConfigs[action.payload.walletId]
      if (!currentConfig) return state

      return {
        ...state,
        lightningConfigs: {
          ...state.lightningConfigs,
          [action.payload.walletId]: {
            ...currentConfig,
            ...action.payload.updates,
          },
        },
      }

    case 'SET_LOADING_LIGHTNING':
      return {
        ...state,
        loadingLightningState: action.payload,
      }

    case 'SET_NODE_CONNECTION':
      return {
        ...state,
        connectedNodes: {
          ...state.connectedNodes,
          [action.payload.walletId]: action.payload.connected,
        },
      }

    case 'ADD_LIGHTNING_CHANNEL':
      const walletForChannel = state.lightningWallets[action.payload.walletId]
      if (!walletForChannel) return state

      return {
        ...state,
        lightningWallets: {
          ...state.lightningWallets,
          [action.payload.walletId]: {
            ...walletForChannel,
            channels: [...walletForChannel.channels, action.payload.channel],
          },
        },
      }

    case 'UPDATE_LIGHTNING_CHANNEL':
      const walletForUpdate = state.lightningWallets[action.payload.walletId]
      if (!walletForUpdate) return state

      return {
        ...state,
        lightningWallets: {
          ...state.lightningWallets,
          [action.payload.walletId]: {
            ...walletForUpdate,
            channels: walletForUpdate.channels.map(channel =>
              channel.channelId === action.payload.channelId
                ? { ...channel, ...action.payload.updates }
                : channel,
            ),
          },
        },
      }

    case 'REMOVE_LIGHTNING_CHANNEL':
      const walletForRemoval = state.lightningWallets[action.payload.walletId]
      if (!walletForRemoval) return state

      return {
        ...state,
        lightningWallets: {
          ...state.lightningWallets,
          [action.payload.walletId]: {
            ...walletForRemoval,
            channels: walletForRemoval.channels.filter(
              channel => channel.channelId !== action.payload.channelId,
            ),
          },
        },
      }

    case 'ADD_LIGHTNING_PAYMENT':
      const walletForPayment = state.lightningWallets[action.payload.walletId]
      if (!walletForPayment) return state

      return {
        ...state,
        lightningWallets: {
          ...state.lightningWallets,
          [action.payload.walletId]: {
            ...walletForPayment,
            payments: [...walletForPayment.payments, action.payload.payment],
          },
        },
      }

    case 'UPDATE_LIGHTNING_PAYMENT':
      const walletForPaymentUpdate = state.lightningWallets[action.payload.walletId]
      if (!walletForPaymentUpdate) return state

      return {
        ...state,
        lightningWallets: {
          ...state.lightningWallets,
          [action.payload.walletId]: {
            ...walletForPaymentUpdate,
            payments: walletForPaymentUpdate.payments.map(payment =>
              payment.paymentHash === action.payload.paymentHash
                ? { ...payment, ...action.payload.updates }
                : payment,
            ),
          },
        },
      }

    case 'ADD_LIGHTNING_INVOICE':
      const walletForInvoice = state.lightningWallets[action.payload.walletId]
      if (!walletForInvoice) return state

      return {
        ...state,
        lightningWallets: {
          ...state.lightningWallets,
          [action.payload.walletId]: {
            ...walletForInvoice,
            invoices: [...walletForInvoice.invoices, action.payload.invoice],
          },
        },
      }

    case 'UPDATE_LIGHTNING_INVOICE':
      const walletForInvoiceUpdate = state.lightningWallets[action.payload.walletId]
      if (!walletForInvoiceUpdate) return state

      return {
        ...state,
        lightningWallets: {
          ...state.lightningWallets,
          [action.payload.walletId]: {
            ...walletForInvoiceUpdate,
            invoices: walletForInvoiceUpdate.invoices.map(invoice =>
              invoice.paymentHash === action.payload.paymentHash
                ? { ...invoice, ...action.payload.updates }
                : invoice,
            ),
          },
        },
      }

    default:
      return state
  }
}

// Action creators
export const lightningActions = {
  setLightningWallet: (walletId: string, data: LightningWalletData): LightningAction => ({
    type: 'SET_LIGHTNING_WALLET',
    payload: { walletId, data },
  }),

  updateLightningWallet: (
    walletId: string,
    updates: Partial<LightningWalletData>,
  ): LightningAction => ({
    type: 'UPDATE_LIGHTNING_WALLET',
    payload: { walletId, updates },
  }),

  deleteLightningWallet: (walletId: string): LightningAction => ({
    type: 'DELETE_LIGHTNING_WALLET',
    payload: walletId,
  }),

  setLightningConfig: (walletId: string, config: LightningConfig): LightningAction => ({
    type: 'SET_LIGHTNING_CONFIG',
    payload: { walletId, config },
  }),

  updateLightningConfig: (
    walletId: string,
    updates: Partial<LightningConfig>,
  ): LightningAction => ({
    type: 'UPDATE_LIGHTNING_CONFIG',
    payload: { walletId, updates },
  }),

  setLoadingLightning: (loading: boolean): LightningAction => ({
    type: 'SET_LOADING_LIGHTNING',
    payload: loading,
  }),

  setNodeConnection: (walletId: string, connected: boolean): LightningAction => ({
    type: 'SET_NODE_CONNECTION',
    payload: { walletId, connected },
  }),

  addLightningChannel: (walletId: string, channel: LightningChannel): LightningAction => ({
    type: 'ADD_LIGHTNING_CHANNEL',
    payload: { walletId, channel },
  }),

  updateLightningChannel: (
    walletId: string,
    channelId: string,
    updates: Partial<LightningChannel>,
  ): LightningAction => ({
    type: 'UPDATE_LIGHTNING_CHANNEL',
    payload: { walletId, channelId, updates },
  }),

  removeLightningChannel: (walletId: string, channelId: string): LightningAction => ({
    type: 'REMOVE_LIGHTNING_CHANNEL',
    payload: { walletId, channelId },
  }),

  addLightningPayment: (walletId: string, payment: LightningPayment): LightningAction => ({
    type: 'ADD_LIGHTNING_PAYMENT',
    payload: { walletId, payment },
  }),

  updateLightningPayment: (
    walletId: string,
    paymentHash: string,
    updates: Partial<LightningPayment>,
  ): LightningAction => ({
    type: 'UPDATE_LIGHTNING_PAYMENT',
    payload: { walletId, paymentHash, updates },
  }),

  addLightningInvoice: (walletId: string, invoice: LightningInvoice): LightningAction => ({
    type: 'ADD_LIGHTNING_INVOICE',
    payload: { walletId, invoice },
  }),

  updateLightningInvoice: (
    walletId: string,
    paymentHash: string,
    updates: Partial<LightningInvoice>,
  ): LightningAction => ({
    type: 'UPDATE_LIGHTNING_INVOICE',
    payload: { walletId, paymentHash, updates },
  }),
}

// Selectors
export const lightningSelectors = {
  getLightningWallet: (state: LightningState, walletId: string) =>
    state.lightningWallets[walletId] || null,

  getLightningConfig: (state: LightningState, walletId: string) =>
    state.lightningConfigs[walletId] || null,

  getLightningChannels: (state: LightningState, walletId: string) =>
    state.lightningWallets[walletId]?.channels || [],

  getLightningPayments: (state: LightningState, walletId: string) =>
    state.lightningWallets[walletId]?.payments || [],

  getLightningInvoices: (state: LightningState, walletId: string) =>
    state.lightningWallets[walletId]?.invoices || [],

  getLightningBalance: (state: LightningState, walletId: string) => {
    const wallet = state.lightningWallets[walletId]
    if (!wallet) return 0

    return wallet.channels
      .filter(channel => channel.active)
      .reduce((total, channel) => total + channel.localBalance, 0)
  },

  isNodeConnected: (state: LightningState, walletId: string) =>
    state.connectedNodes[walletId] || false,
}
