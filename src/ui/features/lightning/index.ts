/**
 * Lightning Feature Module
 *
 * Exports principais para funcionalidades Lightning Network
 */

// Provider
export { default as LightningProvider } from './LightningProvider'
export type { LightningProviderProps } from './LightningProvider'

// Context
export { LightningContext } from './context'
export type { LightningContextType, LightningActions } from './context'

// Types
export type {
  Millisatoshis,
  Satoshis,
  ConnectionState,
  ChannelStateType,
  Channel,
  PaymentStatus,
  PaymentDirection,
  Payment,
  InvoiceStatus,
  Invoice,
  DecodedInvoice,
  LightningState,
} from './types'
export { INITIAL_CONNECTION_STATE, INITIAL_LIGHTNING_STATE } from './types'

// Hooks
export {
  useLightningContext,
  useLightningState,
  useConnectionState,
  useLightningInitialized,
  useLightningLoading,
  useLightningError,
  useLightningBalance,
  useLightningChannels,
  useHasActiveChannels,
  useLightningInvoices,
  useLightningPayments,
  useIsConnected,
  useLightningActions,
  useInvoiceActions,
  usePaymentActions,
  useBalanceActions,
  useChannelActions,
  useConnectionActions,
  useChannelBackup,
  useSubmarineSwap,
  useActiveSwaps,
  useSwapLimits,
  useCanLoopIn,
  useCanLoopOut,
} from './hooks'

// Utils
export {
  mapServiceInvoice,
  mapServicePayment,
  mapServiceInvoices,
  mapServicePayments,
  msatToSat,
  satToMsat,
  formatMsat,
  formatSats,
  formatPaymentHash,
  formatTimestamp,
  formatDuration,
  getTimeUntilExpiry,
} from './utils'

// Components
export { default as LightningInvoiceGenerator } from './LightningInvoiceGenerator'
export { default as SwapScreen } from './SwapScreen'
export { default as SwapProgress } from './SwapProgress'
export { default as BackupSettings } from './BackupSettings'

// Watchtower (separado por ser um sub-módulo)
export {
  default as WatchtowerProvider,
  useWatchtower,
  useHasBreaches,
  useWatchtowerStatus,
  useMonitoredChannels,
  useWatchtowerEvents,
} from './useWatchtower'
export type { WatchtowerState } from './useWatchtower'
