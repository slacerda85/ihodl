// Re-exports from centralized app-provider (nova arquitetura)
export {
  useSettings,
  useIsDark,
  useColorMode,
  useActiveColorMode,
  useSettingsActions,
  useLightningSettings,
} from '../app-provider'

// Legacy provider (deprecated - manter para compatibilidade)
export { SettingsProvider } from './SettingsProviderV2'

export { default as LightningSection } from './LightningSection'
export type {
  LightningNetwork,
  LightningFeeConfig,
  LightningSettings,
  TrampolineNodePreference,
  WatchtowerConfig,
  BackupConfig,
  PrivacyConfig,
  SwapLimitsConfig,
  RoutingStrategy,
  AdvancedConfig,
} from './state'

// Store centralizado (nova arquitetura)
export { settingsStore, type SettingsSnapshot, type SettingsActions } from './store'
