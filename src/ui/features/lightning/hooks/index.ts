/**
 * Barrel export para hooks Lightning
 */

// Readiness hook
export { useLightningReadiness } from './useLightningReadiness'

// State hooks
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
} from './useLightningState'

// Liquidity hooks
export { useLightningPolicy, useSwapInPolicy, useIsAutoChannelEnabled } from './useLightningPolicy'

export {
  useInboundBalance,
  useHasPendingOnChainBalance,
  useWillAutoConvert,
} from './useInboundBalance'

// Action hooks
export {
  useLightningActions,
  useInvoiceActions,
  usePaymentActions,
  useBalanceActions,
  useChannelActions,
  useConnectionActions,
} from './useLightningActions'

// Backup hooks
export { useChannelBackup } from './useChannelBackup'

// Submarine Swap hooks
export {
  useSubmarineSwap,
  useActiveSwaps,
  useSwapLimits,
  useCanLoopIn,
  useCanLoopOut,
} from './useSubmarineSwap'

// CPFP (Fee Bumping) hooks
export { useCpfp } from './useCpfp'

// HTLC Monitor hooks
export { useHtlcMonitor } from './useHtlcMonitor'

// Auto Swap-In hooks
export { useAutoSwapIn, useHasPendingSwapInBalance, useEstimatedSwapInFee } from './useAutoSwapIn'

// Auto Channel hooks
export {
  useInboundCapacity,
  useHasSufficientLiquidity,
  useRequiredAdditionalCapacity,
  useAutoChannelOpening,
} from './useAutoChannel'

// TrafficControl hooks
export {
  useTrafficControl,
  useCanConnect,
  useWalletAvailability,
  useDisconnectCount,
} from './useTrafficControl'
