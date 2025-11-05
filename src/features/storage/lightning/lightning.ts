import {
  Channel,
  LightningInvoice,
  Payment,
  LightningNode,
  RoutingHint,
} from '@/lib/lightning/types'
import { Reducer } from '../types'
import { useStorage } from '../StorageProvider'

// Lightning State
export type LightningState = {
  // Local wallet data
  channels: Channel[]
  invoices: LightningInvoice[]
  payments: Payment[]
  isInitialized: boolean
  isRunning: boolean
  loadingState: boolean

  // Network data (gossip)
  nodes: LightningNode[]
  lastGossipUpdate: number

  // Routing configuration
  isRoutingEnabled: boolean
  trampolineEnabled: boolean
  maxRoutingFee: number
  maxRoutingHops: number

  // Connection state
  isConnected: boolean
  lastConnectionAttempt: number
  connectionErrors: string[]
}

// Lightning Actions
export type LightningAction =
  | { type: 'ADD_LIGHTNING_CHANNEL'; payload: Channel }
  | { type: 'UPDATE_LIGHTNING_CHANNEL'; payload: { channelId: string; updates: Partial<Channel> } }
  | { type: 'REMOVE_LIGHTNING_CHANNEL'; payload: string }
  | { type: 'ADD_LIGHTNING_INVOICE'; payload: LightningInvoice }
  | {
      type: 'UPDATE_LIGHTNING_INVOICE'
      payload: { paymentHash: string; updates: Partial<LightningInvoice> }
    }
  | { type: 'ADD_LIGHTNING_PAYMENT'; payload: Payment }
  | {
      type: 'UPDATE_LIGHTNING_PAYMENT'
      payload: { paymentHash: string; updates: Partial<Payment> }
    }
  | { type: 'SET_LIGHTNING_INITIALIZED'; payload: boolean }
  | { type: 'SET_LIGHTNING_RUNNING'; payload: boolean }
  | { type: 'SET_LIGHTNING_LOADING'; payload: boolean }
  | { type: 'CLEAR_LIGHTNING_STATE' }
  // Network actions
  | { type: 'UPDATE_NODE_INFO'; payload: { nodeId: string; info: Partial<LightningNode> } }
  | { type: 'UPDATE_CHANNEL_INFO'; payload: { channelId: string; channel: Partial<Channel> } }
  | { type: 'REMOVE_STALE_DATA'; payload: number }
  | { type: 'SET_ROUTING_ENABLED'; payload: boolean }
  | { type: 'SET_TRAMPOLINE_ENABLED'; payload: boolean }
  | { type: 'SET_MAX_ROUTING_FEE'; payload: number }
  | { type: 'SET_MAX_ROUTING_HOPS'; payload: number }
  | { type: 'SET_CONNECTED'; payload: boolean }
  | { type: 'SET_CONNECTION_ATTEMPT'; payload: number }
  | { type: 'ADD_CONNECTION_ERROR'; payload: string }
  | { type: 'CLEAR_CONNECTION_ERRORS' }

// Initial state
export const initialLightningState: LightningState = {
  // Local wallet data
  channels: [],
  invoices: [],
  payments: [],
  isInitialized: false,
  isRunning: false,
  loadingState: false,

  // Network data
  nodes: [],
  lastGossipUpdate: 0,

  // Routing configuration
  isRoutingEnabled: true,
  trampolineEnabled: false,
  maxRoutingFee: 1000, // 1000 sats max fee
  maxRoutingHops: 20,

  // Connection state
  isConnected: false,
  lastConnectionAttempt: 0,
  connectionErrors: [],
}

// Reducer
export const lightningReducer: Reducer<LightningState, LightningAction> = (state, action) => {
  switch (action.type) {
    case 'ADD_LIGHTNING_CHANNEL':
      return {
        ...state,
        channels: [...state.channels, action.payload],
      }

    case 'UPDATE_LIGHTNING_CHANNEL':
      return {
        ...state,
        channels: state.channels.map(channel =>
          channel.channelId === action.payload.channelId
            ? { ...channel, ...action.payload.updates }
            : channel,
        ),
      }

    case 'REMOVE_LIGHTNING_CHANNEL':
      return {
        ...state,
        channels: state.channels.filter(channel => channel.channelId !== action.payload),
      }

    case 'ADD_LIGHTNING_INVOICE':
      return {
        ...state,
        invoices: [...state.invoices, action.payload],
      }

    case 'UPDATE_LIGHTNING_INVOICE':
      return {
        ...state,
        invoices: state.invoices.map(invoice =>
          invoice.paymentHash === action.payload.paymentHash
            ? { ...invoice, ...action.payload.updates }
            : invoice,
        ),
      }

    case 'ADD_LIGHTNING_PAYMENT':
      return {
        ...state,
        payments: [...state.payments, action.payload],
      }

    case 'UPDATE_LIGHTNING_PAYMENT':
      return {
        ...state,
        payments: state.payments.map(payment =>
          payment.paymentHash === action.payload.paymentHash
            ? { ...payment, ...action.payload.updates }
            : payment,
        ),
      }

    case 'SET_LIGHTNING_INITIALIZED':
      return {
        ...state,
        isInitialized: action.payload,
      }

    case 'SET_LIGHTNING_RUNNING':
      return {
        ...state,
        isRunning: action.payload,
      }

    case 'SET_LIGHTNING_LOADING':
      return {
        ...state,
        loadingState: action.payload,
      }

    case 'CLEAR_LIGHTNING_STATE':
      return initialLightningState

    // Network actions
    case 'UPDATE_NODE_INFO': {
      const { nodeId, info } = action.payload
      const existingNodeIndex = state.nodes.findIndex(node => node.nodeId === nodeId)
      const updatedNode =
        existingNodeIndex >= 0
          ? { ...state.nodes[existingNodeIndex], ...info }
          : { nodeId, alias: '', color: '', addresses: [], features: new Uint8Array(), ...info }

      const nodes =
        existingNodeIndex >= 0
          ? state.nodes.map((node, index) => (index === existingNodeIndex ? updatedNode : node))
          : [...state.nodes, updatedNode]

      return { ...state, nodes, lastGossipUpdate: Date.now() }
    }

    case 'UPDATE_CHANNEL_INFO': {
      const { channelId, channel } = action.payload
      const existingChannelIndex = state.channels.findIndex(ch => ch.channelId === channelId)
      const updatedChannel =
        existingChannelIndex >= 0
          ? { ...state.channels[existingChannelIndex], ...channel }
          : {
              channelId,
              fundingTxId: '',
              fundingOutputIndex: 0,
              capacity: 0,
              localBalance: 0,
              remoteBalance: 0,
              status: 'unknown' as any,
              peerId: '',
              channelPoint: '',
              localChannelReserve: 0,
              remoteChannelReserve: 0,
              ...channel,
            }

      const channels =
        existingChannelIndex >= 0
          ? state.channels.map((ch, index) =>
              index === existingChannelIndex ? updatedChannel : ch,
            )
          : [...state.channels, updatedChannel]

      return { ...state, channels, lastGossipUpdate: Date.now() }
    }

    case 'REMOVE_STALE_DATA': {
      const maxAge = action.payload
      const cutoffTime = Date.now() - maxAge

      const nodes = state.nodes.filter(
        node => !(node as any).lastSeen || (node as any).lastSeen >= cutoffTime,
      )

      const channels = state.channels.filter(
        channel => !(channel as any).lastUpdate || (channel as any).lastUpdate >= cutoffTime,
      )

      return { ...state, nodes, channels }
    }

    case 'SET_ROUTING_ENABLED':
      return { ...state, isRoutingEnabled: action.payload }

    case 'SET_TRAMPOLINE_ENABLED':
      return { ...state, trampolineEnabled: action.payload }

    case 'SET_MAX_ROUTING_FEE':
      return { ...state, maxRoutingFee: action.payload }

    case 'SET_MAX_ROUTING_HOPS':
      return { ...state, maxRoutingHops: action.payload }

    case 'SET_CONNECTED':
      return { ...state, isConnected: action.payload }

    case 'SET_CONNECTION_ATTEMPT':
      return { ...state, lastConnectionAttempt: action.payload }

    case 'ADD_CONNECTION_ERROR':
      return {
        ...state,
        connectionErrors: [...state.connectionErrors.slice(-4), action.payload], // Keep last 5 errors
      }

    case 'CLEAR_CONNECTION_ERRORS':
      return { ...state, connectionErrors: [] }

    default:
      return state
  }
}

// Action creators
export const lightningActions = {
  addLightningChannel: (channel: Channel): LightningAction => ({
    type: 'ADD_LIGHTNING_CHANNEL',
    payload: channel,
  }),

  updateLightningChannel: (channelId: string, updates: Partial<Channel>): LightningAction => ({
    type: 'UPDATE_LIGHTNING_CHANNEL',
    payload: { channelId, updates },
  }),

  removeLightningChannel: (channelId: string): LightningAction => ({
    type: 'REMOVE_LIGHTNING_CHANNEL',
    payload: channelId,
  }),

  addLightningInvoice: (invoice: LightningInvoice): LightningAction => ({
    type: 'ADD_LIGHTNING_INVOICE',
    payload: invoice,
  }),

  updateLightningInvoice: (
    paymentHash: string,
    updates: Partial<LightningInvoice>,
  ): LightningAction => ({
    type: 'UPDATE_LIGHTNING_INVOICE',
    payload: { paymentHash, updates },
  }),

  addLightningPayment: (payment: Payment): LightningAction => ({
    type: 'ADD_LIGHTNING_PAYMENT',
    payload: payment,
  }),

  updateLightningPayment: (paymentHash: string, updates: Partial<Payment>): LightningAction => ({
    type: 'UPDATE_LIGHTNING_PAYMENT',
    payload: { paymentHash, updates },
  }),

  setLightningInitialized: (initialized: boolean): LightningAction => ({
    type: 'SET_LIGHTNING_INITIALIZED',
    payload: initialized,
  }),

  setLightningRunning: (running: boolean): LightningAction => ({
    type: 'SET_LIGHTNING_RUNNING',
    payload: running,
  }),

  setLightningLoading: (loading: boolean): LightningAction => ({
    type: 'SET_LIGHTNING_LOADING',
    payload: loading,
  }),

  clearLightningState: (): LightningAction => ({
    type: 'CLEAR_LIGHTNING_STATE',
  }),

  // Network action creators
  updateNodeInfo: (nodeId: string, info: Partial<LightningNode>): LightningAction => ({
    type: 'UPDATE_NODE_INFO',
    payload: { nodeId, info },
  }),

  updateChannelInfo: (channelId: string, channel: Partial<Channel>): LightningAction => ({
    type: 'UPDATE_CHANNEL_INFO',
    payload: { channelId, channel },
  }),

  removeStaleData: (maxAge: number): LightningAction => ({
    type: 'REMOVE_STALE_DATA',
    payload: maxAge,
  }),

  setRoutingEnabled: (enabled: boolean): LightningAction => ({
    type: 'SET_ROUTING_ENABLED',
    payload: enabled,
  }),

  setTrampolineEnabled: (enabled: boolean): LightningAction => ({
    type: 'SET_TRAMPOLINE_ENABLED',
    payload: enabled,
  }),

  setMaxRoutingFee: (fee: number): LightningAction => ({
    type: 'SET_MAX_ROUTING_FEE',
    payload: fee,
  }),

  setMaxRoutingHops: (hops: number): LightningAction => ({
    type: 'SET_MAX_ROUTING_HOPS',
    payload: hops,
  }),

  setConnected: (connected: boolean): LightningAction => ({
    type: 'SET_CONNECTED',
    payload: connected,
  }),

  setConnectionAttempt: (timestamp: number): LightningAction => ({
    type: 'SET_CONNECTION_ATTEMPT',
    payload: timestamp,
  }),

  addConnectionError: (error: string): LightningAction => ({
    type: 'ADD_CONNECTION_ERROR',
    payload: error,
  }),

  clearConnectionErrors: (): LightningAction => ({
    type: 'CLEAR_CONNECTION_ERRORS',
  }),
}
export const lightningSelectors = {
  getLightningChannels: (state: LightningState) => state.channels,

  getLightningInvoices: (state: LightningState) => state.invoices,

  getLightningPayments: (state: LightningState) => state.payments,

  isLightningInitialized: (state: LightningState) => state.isInitialized,

  isLightningRunning: (state: LightningState) => state.isRunning,

  isLightningLoading: (state: LightningState) => state.loadingState,
}

// Hook for using Lightning state
export const useLightning = () => {
  const { state, dispatch } = useStorage()
  return {
    lightningState: state.lightning,
    lightningActions: {
      addLightningChannel: (channel: Channel) =>
        dispatch({
          type: 'LIGHTNING',
          action: lightningActions.addLightningChannel(channel),
        }),

      updateLightningChannel: (channelId: string, updates: Partial<Channel>) =>
        dispatch({
          type: 'LIGHTNING',
          action: lightningActions.updateLightningChannel(channelId, updates),
        }),

      removeLightningChannel: (channelId: string) =>
        dispatch({
          type: 'LIGHTNING',
          action: lightningActions.removeLightningChannel(channelId),
        }),

      addLightningInvoice: (invoice: LightningInvoice) =>
        dispatch({
          type: 'LIGHTNING',
          action: lightningActions.addLightningInvoice(invoice),
        }),

      updateLightningInvoice: (paymentHash: string, updates: Partial<LightningInvoice>) =>
        dispatch({
          type: 'LIGHTNING',
          action: lightningActions.updateLightningInvoice(paymentHash, updates),
        }),

      addLightningPayment: (payment: Payment) =>
        dispatch({
          type: 'LIGHTNING',
          action: lightningActions.addLightningPayment(payment),
        }),

      updateLightningPayment: (paymentHash: string, updates: Partial<Payment>) =>
        dispatch({
          type: 'LIGHTNING',
          action: lightningActions.updateLightningPayment(paymentHash, updates),
        }),

      setLightningInitialized: (initialized: boolean) =>
        dispatch({
          type: 'LIGHTNING',
          action: lightningActions.setLightningInitialized(initialized),
        }),

      setLightningRunning: (running: boolean) =>
        dispatch({
          type: 'LIGHTNING',
          action: lightningActions.setLightningRunning(running),
        }),

      setLightningLoading: (loading: boolean) =>
        dispatch({
          type: 'LIGHTNING',
          action: lightningActions.setLightningLoading(loading),
        }),

      clearLightningState: () =>
        dispatch({
          type: 'LIGHTNING',
          action: lightningActions.clearLightningState(),
        }),

      // Network actions
      updateNodeInfo: (nodeId: string, info: Partial<LightningNode>) =>
        dispatch({
          type: 'LIGHTNING',
          action: lightningActions.updateNodeInfo(nodeId, info),
        }),

      updateChannelInfo: (channelId: string, channel: Partial<Channel>) =>
        dispatch({
          type: 'LIGHTNING',
          action: lightningActions.updateChannelInfo(channelId, channel),
        }),

      removeStaleData: (maxAge: number) =>
        dispatch({
          type: 'LIGHTNING',
          action: lightningActions.removeStaleData(maxAge),
        }),

      setRoutingEnabled: (enabled: boolean) =>
        dispatch({
          type: 'LIGHTNING',
          action: lightningActions.setRoutingEnabled(enabled),
        }),

      setTrampolineEnabled: (enabled: boolean) =>
        dispatch({
          type: 'LIGHTNING',
          action: lightningActions.setTrampolineEnabled(enabled),
        }),

      setMaxRoutingFee: (fee: number) =>
        dispatch({
          type: 'LIGHTNING',
          action: lightningActions.setMaxRoutingFee(fee),
        }),

      setMaxRoutingHops: (hops: number) =>
        dispatch({
          type: 'LIGHTNING',
          action: lightningActions.setMaxRoutingHops(hops),
        }),

      setConnected: (connected: boolean) =>
        dispatch({
          type: 'LIGHTNING',
          action: lightningActions.setConnected(connected),
        }),

      setConnectionAttempt: (timestamp: number) =>
        dispatch({
          type: 'LIGHTNING',
          action: lightningActions.setConnectionAttempt(timestamp),
        }),

      addConnectionError: (error: string) =>
        dispatch({
          type: 'LIGHTNING',
          action: lightningActions.addConnectionError(error),
        }),

      clearConnectionErrors: () =>
        dispatch({
          type: 'LIGHTNING',
          action: lightningActions.clearConnectionErrors(),
        }),
    },
    lightningSelectors,
  }
}
