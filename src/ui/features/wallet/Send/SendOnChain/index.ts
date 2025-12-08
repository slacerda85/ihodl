/**
 * SendOnChain feature exports
 *
 * Este arquivo centraliza todas as exportações dos hooks e componentes
 * relacionados ao envio de transações on-chain.
 */

export { useSendOnChainState } from './useSendOnChainState'
export type {
  SendOnChainState,
  SendOnChainStateActions,
  FeeRateType,
  CoinSelectionAlgorithm,
  SighashType,
  BatchTransaction,
} from './useSendOnChainState'

export { useFeeRates } from './useFeeRates'
export type { FeeRates, UseFeeRatesReturn } from './useFeeRates'

export { useBatchTransactions } from './useBatchTransactions'
export type {
  BatchTransaction as BatchTx,
  UseBatchTransactionsReturn,
} from './useBatchTransactions'

export { useSendOnChainActions } from './useSendOnChainActions'
export type { UseSendOnChainActionsReturn } from './useSendOnChainActions'
