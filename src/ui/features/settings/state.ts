// Base types for reducer pattern
type Reducer<S, A> = (state: S, action: A) => S

// Lightning Network Types
export type LightningNetwork = 'mainnet' | 'testnet' | 'regtest'

export type LightningFeeConfig = {
  baseFee: number // em satoshis
  feeRate: number // percentual (ex: 0.01 = 1%)
  minChannelSize: number // em satoshis
}

// Trampoline Node Preferences
export type TrampolineNodePreference = {
  nodeId: string
  alias: string
  priority: number // 1 = highest
  enabled: boolean
}

// Watchtower Settings
export type WatchtowerConfig = {
  localEnabled: boolean
  remoteEnabled: boolean
  remoteUrl: string
  autoUploadRevocations: boolean
  checkIntervalSeconds: number
}

// Backup Settings
export type BackupConfig = {
  autoBackupEnabled: boolean
  cloudProvider: 'none' | 'icloud' | 'gdrive'
  backupFrequency: 'manual' | 'on_change' | 'daily'
  encryptWithPassword: boolean
}

// Privacy Settings
export type PrivacyConfig = {
  blindedPathsEnabled: boolean
  onionMessagesEnabled: boolean
  usePrivateChannelsOnly: boolean
  hiddenNode: boolean
}

// Swap Limits
export type SwapLimitsConfig = {
  maxLoopInSats: number
  maxLoopOutSats: number
  minSwapSats: number
  autoSwapEnabled: boolean
  targetBalance: number // Target on-chain/lightning balance ratio (0-100)
}

// Routing Strategy
export type RoutingStrategy = 'lowest_fee' | 'fastest' | 'most_reliable' | 'balanced'

// Advanced Settings
export type AdvancedConfig = {
  routingStrategy: RoutingStrategy
  maxRoutingFeePercent: number
  pathfindingTimeout: number // seconds
  maxHops: number
  allowLegacyChannels: boolean
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
  // New settings
  trampolineNodes: TrampolineNodePreference[]
  watchtower: WatchtowerConfig
  backup: BackupConfig
  privacy: PrivacyConfig
  swapLimits: SwapLimitsConfig
  advanced: AdvancedConfig
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
  trampolineNodes: [
    {
      nodeId: '03864ef025fde8fb587d989186ce6a4a186895ee44a926bfc370e2c366597a3f8f',
      alias: 'ACINQ',
      priority: 1,
      enabled: true,
    },
    {
      nodeId: '024bfaf0cabe7f874fd33ebf7c6f4e5385971fc504ef3f492432e9e3ec77e1b5cf',
      alias: 'Electrum',
      priority: 2,
      enabled: true,
    },
  ],
  watchtower: {
    localEnabled: true,
    remoteEnabled: false,
    remoteUrl: '',
    autoUploadRevocations: true,
    checkIntervalSeconds: 300, // 5 minutes
  },
  backup: {
    autoBackupEnabled: true,
    cloudProvider: 'none',
    backupFrequency: 'on_change',
    encryptWithPassword: true,
  },
  privacy: {
    blindedPathsEnabled: false,
    onionMessagesEnabled: false,
    usePrivateChannelsOnly: false,
    hiddenNode: false,
  },
  swapLimits: {
    maxLoopInSats: 10000000, // 0.1 BTC
    maxLoopOutSats: 10000000, // 0.1 BTC
    minSwapSats: 10000, // 10k sats
    autoSwapEnabled: false,
    targetBalance: 50, // 50% on-chain, 50% lightning
  },
  advanced: {
    routingStrategy: 'balanced',
    maxRoutingFeePercent: 1, // 1%
    pathfindingTimeout: 60, // seconds
    maxHops: 20,
    allowLegacyChannels: false,
  },
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
  // New actions
  | { type: 'SET_TRAMPOLINE_NODES'; payload: TrampolineNodePreference[] }
  | { type: 'UPDATE_TRAMPOLINE_NODE'; payload: TrampolineNodePreference }
  | { type: 'SET_WATCHTOWER_CONFIG'; payload: Partial<WatchtowerConfig> }
  | { type: 'SET_BACKUP_CONFIG'; payload: Partial<BackupConfig> }
  | { type: 'SET_PRIVACY_CONFIG'; payload: Partial<PrivacyConfig> }
  | { type: 'SET_SWAP_LIMITS'; payload: Partial<SwapLimitsConfig> }
  | { type: 'SET_ADVANCED_CONFIG'; payload: Partial<AdvancedConfig> }
  | { type: 'SET_ROUTING_STRATEGY'; payload: RoutingStrategy }

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

    case 'SET_TRAMPOLINE_NODES':
      return {
        ...state,
        lightning: {
          ...state.lightning,
          trampolineNodes: action.payload,
        },
      }

    case 'UPDATE_TRAMPOLINE_NODE': {
      const updatedNodes = state.lightning.trampolineNodes.map(node =>
        node.nodeId === action.payload.nodeId ? action.payload : node,
      )
      // Add if not exists
      if (!updatedNodes.find(n => n.nodeId === action.payload.nodeId)) {
        updatedNodes.push(action.payload)
      }
      return {
        ...state,
        lightning: {
          ...state.lightning,
          trampolineNodes: updatedNodes,
        },
      }
    }

    case 'SET_WATCHTOWER_CONFIG':
      return {
        ...state,
        lightning: {
          ...state.lightning,
          watchtower: {
            ...state.lightning.watchtower,
            ...action.payload,
          },
        },
      }

    case 'SET_BACKUP_CONFIG':
      return {
        ...state,
        lightning: {
          ...state.lightning,
          backup: {
            ...state.lightning.backup,
            ...action.payload,
          },
        },
      }

    case 'SET_PRIVACY_CONFIG':
      return {
        ...state,
        lightning: {
          ...state.lightning,
          privacy: {
            ...state.lightning.privacy,
            ...action.payload,
          },
        },
      }

    case 'SET_SWAP_LIMITS':
      return {
        ...state,
        lightning: {
          ...state.lightning,
          swapLimits: {
            ...state.lightning.swapLimits,
            ...action.payload,
          },
        },
      }

    case 'SET_ADVANCED_CONFIG':
      return {
        ...state,
        lightning: {
          ...state.lightning,
          advanced: {
            ...state.lightning.advanced,
            ...action.payload,
          },
        },
      }

    case 'SET_ROUTING_STRATEGY':
      return {
        ...state,
        lightning: {
          ...state.lightning,
          advanced: {
            ...state.lightning.advanced,
            routingStrategy: action.payload,
          },
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

  // New action creators
  setTrampolineNodes: (nodes: TrampolineNodePreference[]): SettingsAction => ({
    type: 'SET_TRAMPOLINE_NODES',
    payload: nodes,
  }),

  updateTrampolineNode: (node: TrampolineNodePreference): SettingsAction => ({
    type: 'UPDATE_TRAMPOLINE_NODE',
    payload: node,
  }),

  setWatchtowerConfig: (config: Partial<WatchtowerConfig>): SettingsAction => ({
    type: 'SET_WATCHTOWER_CONFIG',
    payload: config,
  }),

  setBackupConfig: (config: Partial<BackupConfig>): SettingsAction => ({
    type: 'SET_BACKUP_CONFIG',
    payload: config,
  }),

  setPrivacyConfig: (config: Partial<PrivacyConfig>): SettingsAction => ({
    type: 'SET_PRIVACY_CONFIG',
    payload: config,
  }),

  setSwapLimits: (config: Partial<SwapLimitsConfig>): SettingsAction => ({
    type: 'SET_SWAP_LIMITS',
    payload: config,
  }),

  setAdvancedConfig: (config: Partial<AdvancedConfig>): SettingsAction => ({
    type: 'SET_ADVANCED_CONFIG',
    payload: config,
  }),

  setRoutingStrategy: (strategy: RoutingStrategy): SettingsAction => ({
    type: 'SET_ROUTING_STRATEGY',
    payload: strategy,
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
  // New selectors
  selectTrampolineNodes: (state: SettingsState) => state.lightning.trampolineNodes,
  selectWatchtowerConfig: (state: SettingsState) => state.lightning.watchtower,
  selectBackupConfig: (state: SettingsState) => state.lightning.backup,
  selectPrivacyConfig: (state: SettingsState) => state.lightning.privacy,
  selectSwapLimits: (state: SettingsState) => state.lightning.swapLimits,
  selectAdvancedConfig: (state: SettingsState) => state.lightning.advanced,
  selectRoutingStrategy: (state: SettingsState) => state.lightning.advanced.routingStrategy,
}
