// BOLT #5: Recommendations for On-chain Transaction Handling - Protocol Functions

import { sha256 } from '@/core/lib/crypto'
import { uint8ArrayToHex } from '@/core/lib/utils'
import {
  CommitmentOutputType,
  PaymentPreimage,
  CltvExpiry,
} from '@/core/models/lightning/transaction'
import {
  IRREVOCABLE_CONFIRMATION_DEPTH,
  SECURITY_DELAY_BLOCKS,
  TO_LOCAL_PENALTY_WITNESS_WEIGHT,
  OFFERED_HTLC_PENALTY_WITNESS_WEIGHT,
  RECEIVED_HTLC_PENALTY_WITNESS_WEIGHT,
  TO_LOCAL_PENALTY_INPUT_WEIGHT,
  OFFERED_HTLC_PENALTY_INPUT_WEIGHT,
  RECEIVED_HTLC_PENALTY_INPUT_WEIGHT,
} from '@/core/models/lightning/onchain'
import {
  OnChainResolutionContext,
  OutputResolutionResult,
  OutputResolutionState,
  HtlcResolutionAction,
  CommitmentAnalysis,
  HtlcTransactionAnalysis,
  PenaltyTransactionAnalysis,
  ClosingTransactionAnalysis,
  OnChainChannelState,
  OnChainRequirements,
  OnChainError,
  OnChainErrorType,
  HtlcTimeoutCheck,
  RevokedOutputHandling,
  OnChainFeeManagement,
  ChannelCloseType,
  OnChainTransactionType,
  PenaltyTransactionType,
} from '@/core/models/lightning/onchain'
import { Sha256, Point } from '@/core/models/lightning/base'
import { Tx } from '@/core/models/transaction'

// Core Protocol Functions

/**
 * Monitors the blockchain for transactions spending unresolved outputs
 * Requirement: Once funding transaction is broadcast OR commitment signed,
 * MUST monitor blockchain for transactions spending any unresolved output
 */
export function monitorBlockchainForSpends(
  context: OnChainResolutionContext,
  channelState: OnChainChannelState,
  blockchainTransactions: Tx[],
): {
  newResolutions: OutputResolutionResult[]
  errors: OnChainError[]
} {
  const newResolutions: OutputResolutionResult[] = []
  const errors: OnChainError[] = []

  for (const tx of blockchainTransactions) {
    // Check if this transaction spends any of our unresolved outputs
    for (const vin of tx.vin) {
      const spendTxid = vin.txid
      const spendVout = vin.vout

      // Check if this spends our funding output
      if (
        uint8ArrayToHex(context.fundingTxid) === spendTxid &&
        context.fundingOutputIndex === spendVout
      ) {
        // Funding output spent - analyze the spending transaction
        const analysis = analyzeOnChainTransaction(tx, context)
        if (analysis) {
          const resolution = processTransactionAnalysis(analysis, context, channelState)
          if (resolution) {
            newResolutions.push(resolution)
          }
        }
      }

      // Check if this spends any HTLC outputs
      for (const resolution of channelState.pendingResolutions) {
        if (
          resolution.resolvingTransaction &&
          uint8ArrayToHex(resolution.resolvingTransaction) === spendTxid
        ) {
          // This transaction spends an HTLC output - update resolution
          const updatedResolution = {
            ...resolution,
            confirmationDepth: tx.confirmations || 0,
          }

          if (updatedResolution.confirmationDepth >= IRREVOCABLE_CONFIRMATION_DEPTH) {
            updatedResolution.state = OutputResolutionState.IRREVOCABLY_RESOLVED
          }

          newResolutions.push(updatedResolution)
        }
      }
    }

    // Also check if this transaction itself is a pending resolution
    for (const resolution of channelState.pendingResolutions) {
      if (
        resolution.resolvingTransaction &&
        uint8ArrayToHex(resolution.resolvingTransaction) === tx.txid
      ) {
        // This transaction is a pending resolution - update its confirmation status
        const updatedResolution = {
          ...resolution,
          confirmationDepth: tx.confirmations || 0,
        }

        if (updatedResolution.confirmationDepth >= IRREVOCABLE_CONFIRMATION_DEPTH) {
          updatedResolution.state = OutputResolutionState.IRREVOCABLY_RESOLVED
        }

        newResolutions.push(updatedResolution)
      }
    }
  }

  return { newResolutions, errors }
}

/**
 * Analyzes an on-chain transaction to determine its type and implications
 */
export function analyzeOnChainTransaction(
  tx: Tx,
  context: OnChainResolutionContext,
):
  | CommitmentAnalysis
  | HtlcTransactionAnalysis
  | PenaltyTransactionAnalysis
  | ClosingTransactionAnalysis
  | null {
  // Check if it's a closing transaction first (since they also spend from funding)
  const closingAnalysis = analyzeClosingTransaction(tx, context)
  if (closingAnalysis) {
    return closingAnalysis
  }

  // Check if it's a commitment transaction
  if (isCommitmentTransaction(tx, context)) {
    return analyzeCommitmentTransaction(tx, context)
  }

  // Check if it's an HTLC transaction
  const htlcAnalysis = analyzeHtlcTransaction(tx, context)
  if (htlcAnalysis) {
    return htlcAnalysis
  }

  // Check if it's a penalty transaction
  const penaltyAnalysis = analyzePenaltyTransaction(tx, context)
  if (penaltyAnalysis) {
    return penaltyAnalysis
  }

  return null
}

/**
 * Checks if a transaction is a commitment transaction
 */
export function isCommitmentTransaction(tx: Tx, context: OnChainResolutionContext): boolean {
  // Commitment transactions spend the funding output
  return tx.vin.some(
    vin =>
      uint8ArrayToHex(context.fundingTxid) === vin.txid && context.fundingOutputIndex === vin.vout,
  )
}

/**
 * Analyzes a commitment transaction
 */
export function analyzeCommitmentTransaction(
  tx: Tx,
  context: OnChainResolutionContext,
): CommitmentAnalysis {
  let closeType = ChannelCloseType.UNILATERAL_REMOTE_COMMITMENT
  let isRevoked = false
  let revocationPubkey: Point | undefined

  // Check if it's our commitment (local close) or remote's (remote close)
  // This would require checking signatures, but simplified for now

  // Analyze outputs
  const outputs: any[] = tx.vout.map((vout, index) => ({
    index,
    type: determineOutputType(vout, context),
    value: BigInt(vout.value * 100000000), // Convert to satoshis
    resolutionState: OutputResolutionState.UNRESOLVED,
  }))

  return {
    transactionType: OnChainTransactionType.COMMITMENT,
    closeType,
    outputs,
    isRevoked,
    revocationPubkey,
  }
}

/**
 * Determines the type of commitment output
 */
export function determineOutputType(
  vout: any,
  context: OnChainResolutionContext,
): CommitmentOutputType {
  // Simplified: check script patterns
  const script = vout.scriptPubKey.hex

  // Check for P2WPKH (to_remote)
  if (script.startsWith('0014')) {
    return CommitmentOutputType.TO_REMOTE
  }

  // Check for P2WSH (HTLCs, to_local, anchors)
  if (script.startsWith('0020')) {
    // Would need to decode script to determine exact type
    // Simplified: assume HTLC for now
    return CommitmentOutputType.OFFERED_HTLC
  }

  return CommitmentOutputType.TO_REMOTE // fallback
}

/**
 * Analyzes HTLC timeout/success transactions
 */
export function analyzeHtlcTransaction(
  tx: Tx,
  context: OnChainResolutionContext,
): HtlcTransactionAnalysis | null {
  // HTLC transactions typically spend from commitment outputs (not funding)
  // and have specific locktime patterns or witness data
  const spendsFromCommitment = tx.vin.some(vin => vin.txid !== uint8ArrayToHex(context.fundingTxid))

  if (!spendsFromCommitment) {
    return null
  }

  // Check for HTLC timeout (CLTV expiry - locktime is the expiry height)
  if (tx.locktime > 0 && tx.locktime < 500000000) {
    return {
      transactionType: OnChainTransactionType.HTLC_TIMEOUT,
      htlcId: 0n, // Would need to track
      paymentHash: new Uint8Array(32), // placeholder
      cltvExpiry: tx.locktime,
      resolutionState: OutputResolutionState.UNRESOLVED,
    }
  }

  // Check for HTLC success (locktime = 0, and has witness data)
  if (tx.locktime === 0 && tx.vin.some(vin => vin.txinwitness && vin.txinwitness.length > 0)) {
    return {
      transactionType: OnChainTransactionType.HTLC_SUCCESS,
      htlcId: 0n,
      paymentHash: new Uint8Array(32),
      resolutionState: OutputResolutionState.UNRESOLVED,
    }
  }

  return null
}

/**
 * Analyzes penalty transactions
 */
export function analyzePenaltyTransaction(
  tx: Tx,
  context: OnChainResolutionContext,
): PenaltyTransactionAnalysis | null {
  // Penalty transactions have multiple inputs from the same revoked commitment
  // and typically have specific witness patterns for revocation keys
  const inputTxids = tx.vin.map(vin => vin.txid)
  const uniqueTxids = new Set(inputTxids)

  // Must have multiple inputs from the same transaction (revoked commitment)
  if (uniqueTxids.size === 1 && tx.vin.length > 1) {
    return {
      transactionType: OnChainTransactionType.PENALTY,
      penaltyType: PenaltyTransactionType.TO_LOCAL_PENALTY, // simplified
      revokedCommitmentTxid: sha256(new Uint8Array([...tx.vin[0].txid].map(c => c.charCodeAt(0)))), // placeholder
      outputsResolved: tx.vin.map((_, i) => i),
      witnessWeight: TO_LOCAL_PENALTY_WITNESS_WEIGHT,
    }
  }

  return null
}

/**
 * Analyzes closing transactions
 */
export function analyzeClosingTransaction(
  tx: Tx,
  context: OnChainResolutionContext,
): ClosingTransactionAnalysis | null {
  // Closing transactions have 2 outputs max, spend from funding output, locktime = 0,
  // and typically don't have HTLC-related outputs (simplified check)
  if (
    tx.vout.length <= 2 &&
    tx.locktime === 0 &&
    tx.vin.some(vin => vin.txid === uint8ArrayToHex(context.fundingTxid)) &&
    tx.vout.length === 2 // Mutual close typically has 2 outputs
  ) {
    return {
      transactionType: OnChainTransactionType.CLOSING,
      closeType: ChannelCloseType.MUTUAL_CLOSE,
      localOutput: tx.vout[0]
        ? {
            address: tx.vout[0].scriptPubKey.addresses?.[0] || '',
            value: BigInt(tx.vout[0].value * 100000000),
          }
        : undefined,
      remoteOutput: tx.vout[1]
        ? {
            address: tx.vout[1].scriptPubKey.addresses?.[0] || '',
            value: BigInt(tx.vout[1].value * 100000000),
          }
        : undefined,
      fee: BigInt(0), // Simplified: would need input values to calculate properly
      resolutionState: OutputResolutionState.RESOLVED,
    }
  }

  return null
}

/**
 * Processes transaction analysis to create resolution results
 */
export function processTransactionAnalysis(
  analysis:
    | CommitmentAnalysis
    | HtlcTransactionAnalysis
    | PenaltyTransactionAnalysis
    | ClosingTransactionAnalysis,
  context: OnChainResolutionContext,
  channelState: OnChainChannelState,
): OutputResolutionResult | null {
  switch (analysis.transactionType) {
    case OnChainTransactionType.COMMITMENT:
      return processCommitmentAnalysis(analysis as CommitmentAnalysis, context, channelState)
    case OnChainTransactionType.HTLC_TIMEOUT:
    case OnChainTransactionType.HTLC_SUCCESS:
      return processHtlcAnalysis(analysis as HtlcTransactionAnalysis, context)
    case OnChainTransactionType.PENALTY:
      return processPenaltyAnalysis(analysis as PenaltyTransactionAnalysis)
    case OnChainTransactionType.CLOSING:
      return processClosingAnalysis(analysis as ClosingTransactionAnalysis)
    default:
      return null
  }
}

/**
 * Processes commitment transaction analysis
 */
function processCommitmentAnalysis(
  analysis: CommitmentAnalysis,
  context: OnChainResolutionContext,
  channelState: OnChainChannelState,
): OutputResolutionResult {
  const actions: HtlcResolutionAction[] = []

  if (analysis.closeType === ChannelCloseType.UNILATERAL_LOCAL_COMMITMENT) {
    // Local commitment published - handle as local close
    actions.push(HtlcResolutionAction.SPEND_TO_CONVENIENT_ADDRESS) // for to_local
    actions.push(HtlcResolutionAction.WAIT_FOR_TIMEOUT) // for HTLCs
  } else if (analysis.closeType === ChannelCloseType.UNILATERAL_REMOTE_COMMITMENT) {
    // Remote commitment published - handle as remote close
    actions.push(HtlcResolutionAction.SPEND_TO_CONVENIENT_ADDRESS) // for HTLCs
  } else if (analysis.closeType === ChannelCloseType.REVOKED_TRANSACTION_CLOSE) {
    // Revoked commitment - penalize
    actions.push(HtlcResolutionAction.SPEND_WITH_PREIMAGE) // penalty spend
  }

  return {
    state: OutputResolutionState.RESOLVED,
    actionsTaken: [],
    nextActions: actions,
  }
}

/**
 * Processes HTLC transaction analysis
 */
function processHtlcAnalysis(
  analysis: HtlcTransactionAnalysis,
  context: OnChainResolutionContext,
): OutputResolutionResult {
  let extractedPreimage: PaymentPreimage | undefined

  if (analysis.transactionType === OnChainTransactionType.HTLC_SUCCESS) {
    // Extract preimage from witness
    extractedPreimage = extractPreimageFromHtlcSuccess(analysis)
  }

  return {
    state: analysis.resolutionState,
    actionsTaken: [HtlcResolutionAction.EXTRACT_PREIMAGE],
    extractedPreimage,
  }
}

/**
 * Processes penalty transaction analysis
 */
function processPenaltyAnalysis(analysis: PenaltyTransactionAnalysis): OutputResolutionResult {
  return {
    state: OutputResolutionState.RESOLVED,
    actionsTaken: [HtlcResolutionAction.SPEND_WITH_PREIMAGE],
  }
}

/**
 * Processes closing transaction analysis
 */
function processClosingAnalysis(analysis: ClosingTransactionAnalysis): OutputResolutionResult {
  return {
    state: analysis.resolutionState || OutputResolutionState.RESOLVED,
    actionsTaken: [],
  }
}

/**
 * Extracts preimage from HTLC success transaction witness
 * Requirement: MUST extract payment preimage from HTLC-success transaction input witness
 */
export function extractPreimageFromHtlcSuccess(
  analysis: HtlcTransactionAnalysis,
): PaymentPreimage | undefined {
  // In a real implementation, this would parse the witness stack
  // Simplified: return placeholder
  if (analysis.transactionType === OnChainTransactionType.HTLC_SUCCESS) {
    return new Uint8Array(32) // 32-byte preimage
  }
  return undefined
}

/**
 * Checks if HTLC has timed out
 * Requirement: HTLC output has timed out once height >= cltv_expiry
 */
export function checkHtlcTimeout(
  htlcId: bigint,
  cltvExpiry: CltvExpiry,
  currentBlockHeight: number,
): HtlcTimeoutCheck {
  const isTimedOut = currentBlockHeight >= cltvExpiry
  const blocksUntilTimeout = isTimedOut ? 0 : cltvExpiry - currentBlockHeight

  return {
    htlcId,
    cltvExpiry,
    currentBlockHeight,
    isTimedOut,
    blocksUntilTimeout,
  }
}

/**
 * Handles revoked commitment transaction
 * Requirement: MUST resolve revoked outputs using revocation keys
 */
export function handleRevokedCommitment(
  commitmentTxid: Sha256,
  revocationPubkey: Point,
  outputsToPenalize: number[],
  currentBlockHeight: number,
  commitmentBlockHeight?: number,
): RevokedOutputHandling {
  // Use commitment publication height + security delay if provided, otherwise assume recent publication
  const effectiveDelay = commitmentBlockHeight ? currentBlockHeight - commitmentBlockHeight : 0 // Assume published at current height, so delay hasn't expired
  const securityDelayExpired = effectiveDelay >= SECURITY_DELAY_BLOCKS
  const blocksUntilExpiry = securityDelayExpired ? 0 : SECURITY_DELAY_BLOCKS - effectiveDelay

  return {
    commitmentTxid,
    revocationPubkey,
    outputsToPenalize,
    penaltyTransactions: [], // Would be populated when creating penalty txs
    securityDelayExpired,
    blocksUntilExpiry,
  }
}

/**
 * Calculates penalty transaction weight
 * From Appendix A: Expected Weights
 */
export function calculatePenaltyWeight(penaltyType: PenaltyTransactionType): number {
  switch (penaltyType) {
    case PenaltyTransactionType.TO_LOCAL_PENALTY:
      return TO_LOCAL_PENALTY_WITNESS_WEIGHT
    case PenaltyTransactionType.OFFERED_HTLC_PENALTY:
      return OFFERED_HTLC_PENALTY_WITNESS_WEIGHT
    case PenaltyTransactionType.RECEIVED_HTLC_PENALTY:
      return RECEIVED_HTLC_PENALTY_WITNESS_WEIGHT
  }
}

/**
 * Calculates penalty input weight
 */
export function calculatePenaltyInputWeight(penaltyType: PenaltyTransactionType): number {
  switch (penaltyType) {
    case PenaltyTransactionType.TO_LOCAL_PENALTY:
      return TO_LOCAL_PENALTY_INPUT_WEIGHT
    case PenaltyTransactionType.OFFERED_HTLC_PENALTY:
      return OFFERED_HTLC_PENALTY_INPUT_WEIGHT
    case PenaltyTransactionType.RECEIVED_HTLC_PENALTY:
      return RECEIVED_HTLC_PENALTY_INPUT_WEIGHT
  }
}

/**
 * Calculates maximum HTLCs that can be resolved in single penalty transaction
 */
export function calculateMaxHtlcsInPenaltyTransaction(): number {
  const maxWeight = 400000 // Standard max weight
  const baseWeight = TO_LOCAL_PENALTY_INPUT_WEIGHT + 272 // to_local + to_remote sweep
  const weightPerHtlc = RECEIVED_HTLC_PENALTY_INPUT_WEIGHT // worst case

  return Math.floor((maxWeight - baseWeight - 4 * 53 - 2) / weightPerHtlc)
}

/**
 * Manages fees for on-chain transactions
 */
export function manageOnChainFees(
  feeratePerKw: number,
  numPenaltyOutputs: number,
  optionAnchors: boolean,
): OnChainFeeManagement {
  // Estimate fees for penalty transactions
  const estimatedPenaltyFee = BigInt(numPenaltyOutputs * 1000) // Simplified

  // Estimate fees for HTLC transactions
  const estimatedHtlcFee = BigInt((663 * feeratePerKw) / 1000) // Base HTLC weight

  return {
    feeratePerKw,
    estimatedPenaltyFee,
    estimatedHtlcFee,
    useReplaceByFee: true,
    combineTransactions: optionAnchors,
  }
}

/**
 * Determines requirements for on-chain handling based on channel state
 */
export function determineOnChainRequirements(
  channelState: OnChainChannelState,
  analysis?: CommitmentAnalysis,
): OnChainRequirements {
  const hasUnresolvedOutputs = channelState.pendingResolutions.some(
    r => r.state === OutputResolutionState.UNRESOLVED,
  )

  const hasHtlcs =
    analysis?.outputs?.some(
      o =>
        o.type === CommitmentOutputType.OFFERED_HTLC ||
        o.type === CommitmentOutputType.RECEIVED_HTLC,
    ) || false

  return {
    mustMonitorBlockchain: true,
    mustResolveOutputs: hasUnresolvedOutputs,
    mustExtractPreimages: false, // Would be set based on HTLC analysis
    mustHandleRevokedTransactions: analysis?.isRevoked || false,
    mustWaitForDelays: analysis?.closeType === ChannelCloseType.UNILATERAL_LOCAL_COMMITMENT,
    canForgetChannel: !hasUnresolvedOutputs && !hasHtlcs,
  }
}

/**
 * Validates on-chain transaction handling
 */
export function validateOnChainHandling(
  context: OnChainResolutionContext,
  channelState: OnChainChannelState,
): OnChainError[] {
  const errors: OnChainError[] = []

  // Check for invalid transactions
  if (channelState.pendingResolutions.some(r => r.state === OutputResolutionState.UNRESOLVED)) {
    // Check if any resolution has been pending too long
    const now = Date.now()
    // Simplified: assume timeout after 100 blocks
    if (now > (channelState.lastActivity || 0) + 100 * 600000) {
      // 100 blocks * 10min
      errors.push({
        type: OnChainErrorType.TIMEOUT_EXPIRED,
        message: 'Output resolution timeout exceeded',
      })
    }
  }

  return errors
}

/**
 * Updates channel state based on new resolutions
 */
export function updateChannelState(
  channelState: OnChainChannelState,
  newResolutions: OutputResolutionResult[],
): OnChainChannelState {
  const updatedResolutions = [...channelState.pendingResolutions]

  for (const newResolution of newResolutions) {
    const existingIndex = updatedResolutions.findIndex(
      r =>
        r.resolvingTransaction &&
        uint8ArrayToHex(r.resolvingTransaction) ===
          uint8ArrayToHex(newResolution.resolvingTransaction!),
    )

    if (existingIndex >= 0) {
      updatedResolutions[existingIndex] = newResolution
    } else {
      updatedResolutions.push(newResolution)
    }
  }

  // Update irrevocably resolved outputs
  const irrevocablyResolved = updatedResolutions
    .filter(r => r.state === OutputResolutionState.IRREVOCABLY_RESOLVED)
    .map(r => 0) // Would need to track output indices

  // Update extracted preimages
  const updatedPreimages = [...channelState.extractedPreimages]
  for (const resolution of newResolutions) {
    if (resolution.extractedPreimage) {
      // Check if not already in the list
      const exists = updatedPreimages.some(
        p => uint8ArrayToHex(p) === uint8ArrayToHex(resolution.extractedPreimage!),
      )
      if (!exists) {
        updatedPreimages.push(resolution.extractedPreimage)
      }
    }
  }

  return {
    ...channelState,
    pendingResolutions: updatedResolutions,
    irrevocablyResolvedOutputs: irrevocablyResolved,
    extractedPreimages: updatedPreimages,
    lastActivity: Date.now(),
  }
}
