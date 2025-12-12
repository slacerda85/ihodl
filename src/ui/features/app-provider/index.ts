/**
 * App Provider Module - Barrel Export
 *
 * Provider centralizado para estado global da aplicação.
 * Agrega todos os stores de features em um único contexto.
 */

// Provider
export { AppProvider, default } from './AppProvider'

// Base hook
export { useAppContext } from './AppProvider'

// Auth hooks
export { useAuth, useIsAuthenticated } from './AppProvider'

// Connection hooks
export { useConnection, useIsConnected } from './AppProvider'

// Loading/Error hooks
export { useLoading, useIsAnyLoading, useError, useHasErrors } from './AppProvider'

// Wallet hooks
export { useWallets, useActiveWalletId, useActiveWallet, useWalletActions } from './AppProvider'

// Settings hooks
export {
  useSettingsState,
  useColorMode,
  useIsDark,
  useActiveColorMode,
  useLightningSettings,
  useSettingsActions,
} from './AppProvider'

// Address hooks
export {
  useAddresses,
  useBalance,
  useNextAddresses,
  useAddressesByType,
  useAddressStoreActions,
  useAddressLoading,
} from './AppProvider'

// Lightning hooks
export {
  useLightningState,
  useLightningReadinessState,
  useLightningReadinessLevel,
  useLightningActions,
  useLightningInitialized,
  useLightningLoading,
} from './AppProvider'

// Compatibility hooks (deprecated)
export { useSettings } from './AppProvider'
