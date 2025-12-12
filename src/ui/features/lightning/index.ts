/**
 * Lightning Feature Module
 *
 * Exports principais para funcionalidades Lightning Network
 */

// Components
export { LightningReadinessGuard } from './LightningReadinessGuard'
export { LightningReadinessStatus } from './LightningReadinessStatus'
export { LightningInitStatus } from './LightningInitStatus'
export { LightningTrafficControlStatus } from './LightningTrafficControlStatus'

// Context
export { LightningContext } from './context'
export type { LightningContextType, LightningActions, CreateChannelParams } from './context'

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
  useCpfp,
  useHtlcMonitor,
  useTrafficControl,
  useCanConnect,
  useWalletAvailability,
  useDisconnectCount,
} from './hooks'
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

// CPFP Utils
export {
  formatFee,
  estimateConfirmationTime,
  isCpfpViable,
  MIN_FEE_RATE,
  MAX_FEE_RATE,
  TYPICAL_CPFP_SIZE_VB,
} from './hooks/useCpfp'
export type { CpfpState, CpfpStatus, CalculateCpfpParams, UseCpfpReturn } from './hooks/useCpfp'

// HTLC Monitor Utils
export {
  formatTimeRemaining,
  getUrgencyColor,
  getActionLabel,
  DEFAULT_CHECK_INTERVAL,
  DEFAULT_SAFETY_MARGIN,
  URGENCY_THRESHOLDS,
} from './hooks/useHtlcMonitor'
export type {
  HtlcMonitorHookState,
  MonitoredHtlcInfo,
  HtlcMonitorConfig,
  UseHtlcMonitorReturn,
} from './hooks/useHtlcMonitor'

// Components
export { default as LightningInvoiceGenerator } from './LightningInvoiceGenerator'
export { default as SwapScreen } from './SwapScreen'
export { default as SwapProgress } from './SwapProgress'
export { default as BackupSettings } from './BackupSettings'
export { default as FeeBumping } from './FeeBumping'
export { default as HtlcMonitorScreen } from './HtlcMonitorScreen'
export { default as OfferGenerator } from './OfferGenerator'
export { default as OfferScanner } from './OfferScanner'
export { default as RecoveryWizard } from './RecoveryWizard'
export { default as CloudBackupSetup } from './CloudBackupSetup'
export { default as ForceCloseStatus } from './ForceCloseStatus'
export { default as PendingSweeps } from './PendingSweeps'
export { default as RecurringPayments } from './RecurringPayments'
export { default as LightningDashboard } from './LightningDashboard'
export type { LightningDashboardProps } from './LightningDashboard'
export type { FeeBumpingProps, PendingTransaction, FeeRateSuggestion } from './FeeBumping'
export type { HtlcMonitorScreenProps } from './HtlcMonitorScreen'
export type { OfferGeneratorProps } from './OfferGenerator'
export type { OfferScannerProps } from './OfferScanner'
export type { CloudBackupSetupProps, CloudBackupConfig, CloudProvider } from './CloudBackupSetup'
export type {
  ForceCloseStatusProps,
  ForceCloseData,
  ForceCloseState,
  PendingOutput,
  OutputType,
} from './ForceCloseStatus'
export type {
  PendingSweepsProps,
  PendingSweep,
  SweepType,
  SweepPriority,
  SweepStatus,
} from './PendingSweeps'
export type {
  RecurringPaymentsProps,
  RecurringPayment,
  RecurrenceFrequency,
  RecurringPaymentStatus,
  PaymentHistoryEntry,
  CreateRecurringPaymentConfig,
} from './RecurringPayments'

// BOLT 12 Offer Hook
export {
  useOffer,
  formatAmountMsat,
  formatExpiryTime,
  formatTimeRemaining as formatOfferTimeRemaining,
  isValidOfferFormat,
  OFFER_PREFIX,
  OFFER_REGEX,
} from './hooks/useOffer'
export type {
  OfferStatus,
  SimpleOfferParams,
  DecodedOfferInfo,
  OfferDisplayInfo,
  CreatedOfferInfo,
  OfferState,
  UseOfferReturn,
} from './hooks/useOffer'

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

// Channel Features
export {
  ChannelCreateScreen,
  ChannelManageScreen,
  DualFundingScreen,
  ChannelSpliceScreen,
} from './channel'

// Watchtower Management
export { WatchtowerManagementScreen } from './watchtower'

// Payment Features
export { PaymentSendScreen, PaymentReceiveScreen } from './payment'

// Transaction Features
export { TransactionHistoryScreen } from './transaction'
