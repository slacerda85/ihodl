// Base types for reducer pattern
type Reducer<S, A> = (state: S, action: A) => S

// Lightning Network Types
export type LightningNetwork = 'mainnet' | 'testnet' | 'regtest'

export type LightningFeeConfig = {
  baseFee: number // em satoshis
  feeRate: number // percentual (ex: 0.01 = 1%)
  minChannelSize: number // em satoshis
}

export type LightningSettings = {
  network: LightningNetwork
  trampolineRoutingEnabled: boolean
  zeroConfEnabled: boolean
  mppEnabled: boolean
  feeConfig: LightningFeeConfig
  autoChannelManagement: boolean
  maxHtlcCount: number
  defaultCltvExpiry: number
}

// Settings State
export type SettingsState = {
  colorMode: ColorMode
  maxBlockchainSizeGB: number
  userOverride?: boolean
  trampolineRoutingEnabled: boolean
  lightning: LightningSettings
}

export type ColorMode = 'light' | 'dark' | 'auto'

// Default Lightning Settings
export const defaultLightningSettings: LightningSettings = {
  network: 'mainnet',
  trampolineRoutingEnabled: false,
  zeroConfEnabled: false,
  mppEnabled: true,
  feeConfig: {
    baseFee: 1000, // 1000 sats
    feeRate: 0.01, // 1%
    minChannelSize: 100000, // 100k sats
  },
  autoChannelManagement: true,
  maxHtlcCount: 30,
  defaultCltvExpiry: 144, // ~1 dia
}

// Settings Actions
export type SettingsAction =
  | { type: 'SET_COLOR_MODE'; payload: ColorMode }
  | { type: 'SET_MAX_BLOCKCHAIN_SIZE'; payload: number }
  | { type: 'SET_TRAMPOLINE_ROUTING'; payload: boolean }
  | { type: 'SET_LIGHTNING_NETWORK'; payload: LightningNetwork }
  | { type: 'SET_ZERO_CONF_ENABLED'; payload: boolean }
  | { type: 'SET_MPP_ENABLED'; payload: boolean }
  | { type: 'SET_LIGHTNING_FEE_CONFIG'; payload: Partial<LightningFeeConfig> }
  | { type: 'SET_AUTO_CHANNEL_MANAGEMENT'; payload: boolean }
  | { type: 'SET_MAX_HTLC_COUNT'; payload: number }
  | { type: 'SET_DEFAULT_CLTV_EXPIRY'; payload: number }

// Initial state
export const initialSettingsState: SettingsState = {
  colorMode: 'auto',
  maxBlockchainSizeGB: 1,
  trampolineRoutingEnabled: false,
  lightning: defaultLightningSettings,
}

// Reducer
export const settingsReducer: Reducer<SettingsState, SettingsAction> = (state, action) => {
  switch (action.type) {
    case 'SET_COLOR_MODE':
      return {
        ...state,
        colorMode: action.payload,
      }

    case 'SET_MAX_BLOCKCHAIN_SIZE':
      return {
        ...state,
        maxBlockchainSizeGB: action.payload,
      }

    case 'SET_TRAMPOLINE_ROUTING':
      return {
        ...state,
        trampolineRoutingEnabled: action.payload,
        lightning: {
          ...state.lightning,
          trampolineRoutingEnabled: action.payload,
        },
      }

    case 'SET_LIGHTNING_NETWORK':
      return {
        ...state,
        lightning: {
          ...state.lightning,
          network: action.payload,
        },
      }

    case 'SET_ZERO_CONF_ENABLED':
      return {
        ...state,
        lightning: {
          ...state.lightning,
          zeroConfEnabled: action.payload,
        },
      }

    case 'SET_MPP_ENABLED':
      return {
        ...state,
        lightning: {
          ...state.lightning,
          mppEnabled: action.payload,
        },
      }

    case 'SET_LIGHTNING_FEE_CONFIG':
      return {
        ...state,
        lightning: {
          ...state.lightning,
          feeConfig: {
            ...state.lightning.feeConfig,
            ...action.payload,
          },
        },
      }

    case 'SET_AUTO_CHANNEL_MANAGEMENT':
      return {
        ...state,
        lightning: {
          ...state.lightning,
          autoChannelManagement: action.payload,
        },
      }

    case 'SET_MAX_HTLC_COUNT':
      return {
        ...state,
        lightning: {
          ...state.lightning,
          maxHtlcCount: action.payload,
        },
      }

    case 'SET_DEFAULT_CLTV_EXPIRY':
      return {
        ...state,
        lightning: {
          ...state.lightning,
          defaultCltvExpiry: action.payload,
        },
      }

    default:
      return state
  }
}

// Action creators
export const settingsActions = {
  setColorMode: (colorMode: ColorMode): SettingsAction => ({
    type: 'SET_COLOR_MODE',
    payload: colorMode,
  }),

  setMaxBlockchainSize: (size: number): SettingsAction => ({
    type: 'SET_MAX_BLOCKCHAIN_SIZE',
    payload: size,
  }),

  setTrampolineRouting: (enabled: boolean): SettingsAction => ({
    type: 'SET_TRAMPOLINE_ROUTING',
    payload: enabled,
  }),

  setLightningNetwork: (network: LightningNetwork): SettingsAction => ({
    type: 'SET_LIGHTNING_NETWORK',
    payload: network,
  }),

  setZeroConfEnabled: (enabled: boolean): SettingsAction => ({
    type: 'SET_ZERO_CONF_ENABLED',
    payload: enabled,
  }),

  setMppEnabled: (enabled: boolean): SettingsAction => ({
    type: 'SET_MPP_ENABLED',
    payload: enabled,
  }),

  setLightningFeeConfig: (config: Partial<LightningFeeConfig>): SettingsAction => ({
    type: 'SET_LIGHTNING_FEE_CONFIG',
    payload: config,
  }),

  setAutoChannelManagement: (enabled: boolean): SettingsAction => ({
    type: 'SET_AUTO_CHANNEL_MANAGEMENT',
    payload: enabled,
  }),

  setMaxHtlcCount: (count: number): SettingsAction => ({
    type: 'SET_MAX_HTLC_COUNT',
    payload: count,
  }),

  setDefaultCltvExpiry: (expiry: number): SettingsAction => ({
    type: 'SET_DEFAULT_CLTV_EXPIRY',
    payload: expiry,
  }),
}

// selectors
export const selectors = {
  selectColorMode: (state: SettingsState) => state.colorMode,
  selectMaxBlockchainSize: (state: SettingsState) => state.maxBlockchainSizeGB,
  selectTrampolineRoutingEnabled: (state: SettingsState) => state.trampolineRoutingEnabled,
  selectLightningSettings: (state: SettingsState) => state.lightning,
  selectLightningNetwork: (state: SettingsState) => state.lightning.network,
  selectZeroConfEnabled: (state: SettingsState) => state.lightning.zeroConfEnabled,
  selectMppEnabled: (state: SettingsState) => state.lightning.mppEnabled,
  selectLightningFeeConfig: (state: SettingsState) => state.lightning.feeConfig,
  selectAutoChannelManagement: (state: SettingsState) => state.lightning.autoChannelManagement,
  selectMaxHtlcCount: (state: SettingsState) => state.lightning.maxHtlcCount,
  selectDefaultCltvExpiry: (state: SettingsState) => state.lightning.defaultCltvExpiry,
}
