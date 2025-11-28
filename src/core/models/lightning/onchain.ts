// BOLT #5: Recommendations for On-chain Transaction Handling
// Based on https://github.com/lightning/bolts/blob/master/05-onchain.md

import { Sha256, Point, U32 } from './base'
import {
  CommitmentTransaction,
  CommitmentOutputType,
  Satoshis,
  CltvExpiry,
  PaymentHash,
  PaymentPreimage,
} from './transaction'

// Output Resolution States
export enum OutputResolutionState {
  UNRESOLVED = 'unresolved', // Output not yet spent or resolved
  RESOLVED = 'resolved', // Output spent or considered resolved
  IRREVOCABLY_RESOLVED = 'irrevocably_resolved', // Confirmed at least 100 blocks deep
}

// Transaction Types for On-chain Handling
export enum OnChainTransactionType {
  COMMITMENT = 'commitment',
  HTLC_TIMEOUT = 'htlc_timeout',
  HTLC_SUCCESS = 'htlc_success',
  PENALTY = 'penalty',
  CLOSING = 'closing',
  FUNDING = 'funding',
}

// Channel Close Types
export enum ChannelCloseType {
  MUTUAL_CLOSE = 'mutual_close',
  UNILATERAL_LOCAL_COMMITMENT = 'unilateral_local_commitment',
  UNILATERAL_REMOTE_COMMITMENT = 'unilateral_remote_commitment',
  REVOKED_TRANSACTION_CLOSE = 'revoked_transaction_close',
}

// HTLC Output Handling Context
export interface HtlcOutputContext {
  commitmentTx: CommitmentTransaction
  outputIndex: number
  htlcId: bigint
  paymentHash: PaymentHash
  cltvExpiry: CltvExpiry
  amount: Satoshis
  direction: 'offered' | 'received' // offered by local, received by remote
}

// Resolution Actions for HTLC Outputs
export enum HtlcResolutionAction {
  SPEND_WITH_PREIMAGE = 'spend_with_preimage',
  SPEND_WITH_TIMEOUT = 'spend_with_timeout',
  SPEND_TO_CONVENIENT_ADDRESS = 'spend_to_convenient_address',
  WAIT_FOR_TIMEOUT = 'wait_for_timeout',
  EXTRACT_PREIMAGE = 'extract_preimage',
  FAIL_HTLC = 'fail_htlc',
  FULFILL_HTLC = 'fulfill_htlc',
}

// Penalty Transaction Types
export enum PenaltyTransactionType {
  TO_LOCAL_PENALTY = 'to_local_penalty',
  OFFERED_HTLC_PENALTY = 'offered_htlc_penalty',
  RECEIVED_HTLC_PENALTY = 'received_htlc_penalty',
}

// Witness Weight Constants (from Appendix A)
export const TO_LOCAL_PENALTY_WITNESS_WEIGHT = 160
export const OFFERED_HTLC_PENALTY_WITNESS_WEIGHT = 243
export const RECEIVED_HTLC_PENALTY_WITNESS_WEIGHT = 249

export const TO_LOCAL_PENALTY_INPUT_WEIGHT = 324
export const OFFERED_HTLC_PENALTY_INPUT_WEIGHT = 407
export const RECEIVED_HTLC_PENALTY_INPUT_WEIGHT = 413

// Confirmation Depth for Irrevocable Resolution
export const IRREVOCABLE_CONFIRMATION_DEPTH = 100

// Security Delay for Revoked Outputs (recommended 18 blocks)
export const SECURITY_DELAY_BLOCKS = 18

// On-chain Transaction Resolution Context
export interface OnChainResolutionContext {
  channelId: Uint8Array // 32 bytes
  fundingTxid: Sha256
  fundingOutputIndex: number
  localPubkey: Point
  remotePubkey: Point
  localToSelfDelay: number
  remoteToSelfDelay: number
  optionAnchors: boolean
  currentBlockHeight: number
}

// Output Resolution Result
export interface OutputResolutionResult {
  state: OutputResolutionState
  resolvingTransaction?: Sha256 // Txid of transaction that resolves this output
  confirmationDepth?: number
  actionsTaken: HtlcResolutionAction[]
  extractedPreimage?: PaymentPreimage
  nextActions?: HtlcResolutionAction[]
}

// Commitment Transaction Analysis
export interface CommitmentAnalysis {
  transactionType: OnChainTransactionType.COMMITMENT
  closeType: ChannelCloseType
  outputs: CommitmentOutputAnalysis[]
  isRevoked: boolean
  revocationPubkey?: Point
  commitmentNumber?: bigint
}

export interface CommitmentOutputAnalysis {
  index: number
  type: CommitmentOutputType
  value: Satoshis
  resolutionState: OutputResolutionState
  resolution?: OutputResolutionResult
  htlcContext?: HtlcOutputContext
}

// HTLC Transaction Analysis
export interface HtlcTransactionAnalysis {
  transactionType: OnChainTransactionType.HTLC_TIMEOUT | OnChainTransactionType.HTLC_SUCCESS
  htlcId: bigint
  paymentHash: PaymentHash
  cltvExpiry?: CltvExpiry
  resolutionState: OutputResolutionState
  spentBy?: Sha256 // Txid that spends this HTLC tx output
}

// Penalty Transaction Analysis
export interface PenaltyTransactionAnalysis {
  transactionType: OnChainTransactionType.PENALTY
  penaltyType: PenaltyTransactionType
  revokedCommitmentTxid: Sha256
  outputsResolved: number[]
  witnessWeight: number
}

// Closing Transaction Analysis
export interface ClosingTransactionAnalysis {
  transactionType: OnChainTransactionType.CLOSING
  closeType: ChannelCloseType.MUTUAL_CLOSE
  localOutput?: {
    address: string
    value: Satoshis
  }
  remoteOutput?: {
    address: string
    value: Satoshis
  }
  fee: Satoshis
  resolutionState: OutputResolutionState
}

// Union type for all on-chain transaction analyses
export type OnChainTransactionAnalysis =
  | CommitmentAnalysis
  | HtlcTransactionAnalysis
  | PenaltyTransactionAnalysis
  | ClosingTransactionAnalysis

// Channel State for On-chain Monitoring
export interface OnChainChannelState {
  channelId: Uint8Array
  fundingTxid: Sha256
  fundingOutputIndex: number
  isClosed: boolean
  closeType?: ChannelCloseType
  lastCommitmentTxid?: Sha256
  pendingResolutions: OutputResolutionResult[]
  irrevocablyResolvedOutputs: number[]
  extractedPreimages: PaymentPreimage[]
  failedHtlcs: bigint[]
  fulfilledHtlcs: bigint[]
  lastActivity?: U32 // timestamp
}

// Requirements Flags for Different Scenarios
export interface OnChainRequirements {
  mustMonitorBlockchain: boolean
  mustResolveOutputs: boolean
  mustExtractPreimages: boolean
  mustHandleRevokedTransactions: boolean
  mustWaitForDelays: boolean
  canForgetChannel: boolean
}

// Error Types for On-chain Handling
export enum OnChainErrorType {
  INVALID_TRANSACTION = 'invalid_transaction',
  UNEXPECTED_SPEND = 'unexpected_spend',
  MISSING_PREIMAGE = 'missing_preimage',
  REVOCATION_FAILURE = 'revocation_failure',
  TIMEOUT_EXPIRED = 'timeout_expired',
  DUST_OUTPUT = 'dust_output',
  BLOCKCHAIN_REORG = 'blockchain_reorg',
}

// On-chain Error
export interface OnChainError {
  type: OnChainErrorType
  message: string
  transactionId?: Sha256
  outputIndex?: number
  htlcId?: bigint
  blockHeight?: number
}

// Monitoring Configuration
export interface OnChainMonitoringConfig {
  confirmationDepth: number
  securityDelay: number
  maxHtlcNumber: number
  dustLimit: Satoshis
  optionAnchors: boolean
}

// HTLC Timeout Check
export interface HtlcTimeoutCheck {
  htlcId: bigint
  cltvExpiry: CltvExpiry
  currentBlockHeight: number
  isTimedOut: boolean
  blocksUntilTimeout: number
}

// Revoked Output Handling
export interface RevokedOutputHandling {
  commitmentTxid: Sha256
  revocationPubkey: Point
  outputsToPenalize: number[]
  penaltyTransactions: Sha256[]
  securityDelayExpired: boolean
  blocksUntilExpiry: number
}

// Fee Management for On-chain Transactions
export interface OnChainFeeManagement {
  feeratePerKw: number
  estimatedPenaltyFee: Satoshis
  estimatedHtlcFee: Satoshis
  useReplaceByFee: boolean
  combineTransactions: boolean
}

// Summary of On-chain Channel Status
export interface OnChainChannelSummary {
  channelId: Uint8Array
  status: 'active' | 'closing' | 'closed'
  closeType?: ChannelCloseType
  unresolvedOutputs: number
  pendingTimeouts: number
  extractedPreimages: number
  totalFundsAtRisk: Satoshis
  recoverableFunds: Satoshis
  lastActivity: U32 // timestamp
}
