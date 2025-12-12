/**
 * Settings Store
 *
 * Store singleton com pub/sub para configurações.
 * Separado do provider para permitir composição no AppProvider.
 *
 * PRINCÍPIOS:
 * 1. Dados persistidos no MMKV
 * 2. Cache para evitar loop infinito no useSyncExternalStore
 * 3. Notifica subscribers quando dados mudam
 */

import { MMKV } from 'react-native-mmkv'
import {
  SettingsState,
  SettingsAction,
  ColorMode,
  LightningSettings,
  LightningFeeConfig,
  LightningNetwork,
  WatchtowerConfig,
  BackupConfig,
  PrivacyConfig,
  SwapLimitsConfig,
  AdvancedConfig,
  RoutingStrategy,
  TrampolineNodePreference,
  initialSettingsState,
  settingsReducer,
  settingsActions,
  LiquidityConfig,
  SwapInConfig,
} from './state'

// ==========================================
// STORAGE
// ==========================================

const storage = new MMKV()
const SETTINGS_STORAGE_KEY = 'settings-state'

function loadSettings(): SettingsState {
  try {
    const json = storage.getString(SETTINGS_STORAGE_KEY)
    if (json) {
      const parsed = JSON.parse(json)
      return { ...initialSettingsState, ...parsed }
    }
  } catch (error) {
    console.error('[SettingsStore] Error loading settings:', error)
  }
  return initialSettingsState
}

function saveSettings(state: SettingsState): void {
  try {
    storage.set(SETTINGS_STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.error('[SettingsStore] Error saving settings:', error)
  }
}

// ==========================================
// TYPES
// ==========================================

// ==========================================
// STORE CLASS
// ==========================================

class SettingsStore {
  private subscribers = new Set<() => void>()
  private cachedState: SettingsState

  constructor() {
    this.cachedState = loadSettings()
  }

  // ==========================================
  // SUBSCRIPTION
  // ==========================================

  subscribe = (callback: () => void): (() => void) => {
    this.subscribers.add(callback)
    return () => {
      this.subscribers.delete(callback)
    }
  }

  private notify = (): void => {
    this.subscribers.forEach(callback => callback())
  }

  private dispatch = (action: SettingsAction): void => {
    this.cachedState = settingsReducer(this.cachedState, action)
    saveSettings(this.cachedState)
    this.notify()
  }

  // ==========================================
  // SNAPSHOTS (para useSyncExternalStore)
  // ==========================================

  getSnapshot = (): SettingsState => {
    return this.cachedState
  }

  getColorMode = (): ColorMode => this.cachedState.colorMode

  getLightningSettings = (): LightningSettings => this.cachedState.lightning

  getMaxBlockchainSize = (): number => this.cachedState.maxBlockchainSizeGB

  getTrampolineRoutingEnabled = (): boolean => this.cachedState.trampolineRoutingEnabled

  // ==========================================
  // ACTIONS
  // ==========================================

  setColorMode = (mode: ColorMode): void => {
    this.dispatch(settingsActions.setColorMode(mode))
  }

  setMaxBlockchainSize = (size: number): void => {
    this.dispatch(settingsActions.setMaxBlockchainSize(size))
  }

  setTrampolineRouting = (enabled: boolean): void => {
    this.dispatch(settingsActions.setTrampolineRouting(enabled))
  }

  setLightningNetwork = (network: LightningNetwork): void => {
    this.dispatch(settingsActions.setLightningNetwork(network))
  }

  setZeroConfEnabled = (enabled: boolean): void => {
    this.dispatch(settingsActions.setZeroConfEnabled(enabled))
  }

  setMppEnabled = (enabled: boolean): void => {
    this.dispatch(settingsActions.setMppEnabled(enabled))
  }

  setLightningFeeConfig = (config: Partial<LightningFeeConfig>): void => {
    this.dispatch(settingsActions.setLightningFeeConfig(config))
  }

  setAutoChannelManagement = (enabled: boolean): void => {
    this.dispatch(settingsActions.setAutoChannelManagement(enabled))
  }

  setMaxHtlcCount = (count: number): void => {
    this.dispatch(settingsActions.setMaxHtlcCount(count))
  }

  setDefaultCltvExpiry = (expiry: number): void => {
    this.dispatch(settingsActions.setDefaultCltvExpiry(expiry))
  }

  // Additional actions
  setTrampolineNodes = (nodes: TrampolineNodePreference[]): void => {
    this.dispatch(settingsActions.setTrampolineNodes(nodes))
  }

  updateTrampolineNode = (node: TrampolineNodePreference): void => {
    this.dispatch(settingsActions.updateTrampolineNode(node))
  }

  setWatchtowerConfig = (config: Partial<WatchtowerConfig>): void => {
    this.dispatch(settingsActions.setWatchtowerConfig(config))
  }

  setBackupConfig = (config: Partial<BackupConfig>): void => {
    this.dispatch(settingsActions.setBackupConfig(config))
  }

  setPrivacyConfig = (config: Partial<PrivacyConfig>): void => {
    this.dispatch(settingsActions.setPrivacyConfig(config))
  }

  setSwapLimits = (config: Partial<SwapLimitsConfig>): void => {
    this.dispatch(settingsActions.setSwapLimits(config))
  }

  setAdvancedConfig = (config: Partial<AdvancedConfig>): void => {
    this.dispatch(settingsActions.setAdvancedConfig(config))
  }

  setRoutingStrategy = (strategy: RoutingStrategy): void => {
    this.dispatch(settingsActions.setRoutingStrategy(strategy))
  }

  setLiquidityConfig = (config: Partial<LiquidityConfig>): void => {
    this.dispatch(settingsActions.setLiquidityConfig(config))
  }

  setSwapInConfig = (config: Partial<SwapInConfig>): void => {
    this.dispatch(settingsActions.setSwapInConfig(config))
  }

  // ==========================================
  // ACTIONS OBJECT (para context)
  // ==========================================

  get actions() {
    return {
      setColorMode: this.setColorMode,
      setMaxBlockchainSize: this.setMaxBlockchainSize,
      setTrampolineRouting: this.setTrampolineRouting,
      setLightningNetwork: this.setLightningNetwork,
      setZeroConfEnabled: this.setZeroConfEnabled,
      setMppEnabled: this.setMppEnabled,
      setLightningFeeConfig: this.setLightningFeeConfig,
      setAutoChannelManagement: this.setAutoChannelManagement,
      setMaxHtlcCount: this.setMaxHtlcCount,
      setDefaultCltvExpiry: this.setDefaultCltvExpiry,
      // Additional actions
      setTrampolineNodes: this.setTrampolineNodes,
      updateTrampolineNode: this.updateTrampolineNode,
      setWatchtowerConfig: this.setWatchtowerConfig,
      setBackupConfig: this.setBackupConfig,
      setPrivacyConfig: this.setPrivacyConfig,
      setSwapLimits: this.setSwapLimits,
      setAdvancedConfig: this.setAdvancedConfig,
      setRoutingStrategy: this.setRoutingStrategy,
      setLiquidityConfig: this.setLiquidityConfig,
      setSwapInConfig: this.setSwapInConfig,
    }
  }
}

export const settingsStore = new SettingsStore()

// Re-export types
export type { SettingsState, ColorMode, LightningSettings, LightningFeeConfig, LightningNetwork }
