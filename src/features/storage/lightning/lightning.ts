import { LightningChannel } from '@/lib/lightning'
import { Reducer } from '../types'
import { DEFAULT_LSP } from '@/lib/lightning/constants'

// Lightning State - Simplified for SPV only
export type LightningState = {
  // SPV activation state
  spvEnabled: boolean
  // Selected LSP for SPV
  selectedLsp: string
  // Channels managed by SPV
  channels: LightningChannel[]
  // Loading state
  loadingLightningState: boolean
  // Breez SDK connection status
  breezConnected: boolean
}

// Lightning Actions - Simplified for SPV
export type LightningAction =
  | { type: 'SET_SPV_ENABLED'; payload: boolean }
  | { type: 'SET_SELECTED_LSP'; payload: string }
  | { type: 'ADD_CHANNEL'; payload: LightningChannel }
  | { type: 'UPDATE_CHANNEL'; payload: { channelId: string; updates: Partial<LightningChannel> } }
  | { type: 'REMOVE_CHANNEL'; payload: string }
  | { type: 'SET_LOADING_LIGHTNING'; payload: boolean }
  | { type: 'CLEAR_CHANNELS' }
  | { type: 'SET_BREEZ_CONNECTED'; payload: boolean }

// Initial state - Simplified for SPV
export const initialLightningState: LightningState = {
  spvEnabled: false,
  selectedLsp: DEFAULT_LSP,
  channels: [],
  loadingLightningState: false,
  breezConnected: false,
}

// Reducer - Simplified for SPV
export const lightningReducer: Reducer<LightningState, LightningAction> = (state, action) => {
  switch (action.type) {
    case 'SET_SPV_ENABLED':
      return {
        ...state,
        spvEnabled: action.payload,
      }

    case 'SET_SELECTED_LSP':
      return {
        ...state,
        selectedLsp: action.payload,
      }

    case 'ADD_CHANNEL':
      return {
        ...state,
        channels: [...state.channels, action.payload],
      }

    case 'UPDATE_CHANNEL':
      return {
        ...state,
        channels: state.channels.map(channel =>
          channel.channelId === action.payload.channelId
            ? { ...channel, ...action.payload.updates }
            : channel,
        ),
      }

    case 'REMOVE_CHANNEL':
      return {
        ...state,
        channels: state.channels.filter(channel => channel.channelId !== action.payload),
      }

    case 'SET_LOADING_LIGHTNING':
      return {
        ...state,
        loadingLightningState: action.payload,
      }

    case 'CLEAR_CHANNELS':
      return {
        ...state,
        channels: [],
      }

    case 'SET_BREEZ_CONNECTED':
      return {
        ...state,
        breezConnected: action.payload,
      }

    default:
      return state
  }
}

// Action creators - Simplified for SPV
export const lightningActions = {
  setSpvEnabled: (enabled: boolean): LightningAction => ({
    type: 'SET_SPV_ENABLED',
    payload: enabled,
  }),

  setSelectedLsp: (lsp: string): LightningAction => ({
    type: 'SET_SELECTED_LSP',
    payload: lsp,
  }),

  addChannel: (channel: LightningChannel): LightningAction => ({
    type: 'ADD_CHANNEL',
    payload: channel,
  }),

  updateChannel: (channelId: string, updates: Partial<LightningChannel>): LightningAction => ({
    type: 'UPDATE_CHANNEL',
    payload: { channelId, updates },
  }),

  removeChannel: (channelId: string): LightningAction => ({
    type: 'REMOVE_CHANNEL',
    payload: channelId,
  }),

  setLoadingLightning: (loading: boolean): LightningAction => ({
    type: 'SET_LOADING_LIGHTNING',
    payload: loading,
  }),

  clearChannels: (): LightningAction => ({
    type: 'CLEAR_CHANNELS',
  }),

  setBreezConnected: (connected: boolean): LightningAction => ({
    type: 'SET_BREEZ_CONNECTED',
    payload: connected,
  }),
}

// Selectors - Simplified for SPV
export const lightningSelectors = {
  isSpvEnabled: (state: LightningState) => state.spvEnabled,
  getSelectedLsp: (state: LightningState) => state.selectedLsp,
  getChannels: (state: LightningState) => state.channels,
  getActiveChannels: (state: LightningState) => state.channels.filter(channel => channel.active),
  getChannelById: (state: LightningState, channelId: string) =>
    state.channels.find(channel => channel.channelId === channelId) || null,
  getLightningBalance: (state: LightningState) =>
    state.channels
      .filter(channel => channel.active)
      .reduce((total, channel) => total + channel.localBalance, 0),
  isLoadingLightning: (state: LightningState) => state.loadingLightningState,
}

// Export initialization function
export { initializeBreezSDK } from './initializeBreez'
