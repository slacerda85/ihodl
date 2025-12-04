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

// ==========================================
// BOLT #5: SWEEP TRANSACTIONS
// ==========================================

import { OpCode } from '@/core/models/opcodes'
import { hash160 } from '@/core/lib/crypto'

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

/**
 * Tipos de output que podem ser swept
 */
export enum SweepOutputType {
  TO_LOCAL = 'to_local', // Nosso output após to_self_delay
  TO_LOCAL_ANCHOR = 'to_local_anchor', // Anchor output local
  HTLC_TIMEOUT = 'htlc_timeout', // HTLC que expirou (offered by us)
  HTLC_SUCCESS = 'htlc_success', // HTLC que foi resgatado (received by us)
  HTLC_SECOND_STAGE = 'htlc_second_stage', // Output de HTLC-timeout/success tx após delay
}

/**
 * Informações de um output para sweep
 */
export interface SweepableOutput {
  type: SweepOutputType
  txid: Uint8Array // 32 bytes
  vout: number
  value: bigint // satoshis
  script: Uint8Array // witness script
  cltvExpiry?: number // Para HTLCs com timeout
  csvDelay?: number // Para outputs com OP_CSV
  htlcId?: bigint
  paymentHash?: Uint8Array
  paymentPreimage?: Uint8Array // Para HTLC success
}

/**
 * Parâmetros para construir sweep transaction
 */
export interface SweepParams {
  outputs: SweepableOutput[]
  destinationScript: Uint8Array // P2WPKH ou P2WSH de destino
  feeRatePerKw: number
  currentBlockHeight: number
  localDelayedPubkey: Uint8Array
  revocationPubkey: Uint8Array
  localHtlcPubkey: Uint8Array
  remoteHtlcPubkey: Uint8Array
  toSelfDelay: number
}

/**
 * Resultado de uma sweep transaction
 */
export interface SweepTransaction {
  version: number
  locktime: number
  inputs: SweepInput[]
  outputs: SweepOutput[]
  weight: number
  fee: bigint
  totalSwept: bigint
}

export interface SweepInput {
  txid: Uint8Array
  vout: number
  sequence: number
  witnessScript: Uint8Array
  witnessStack: Uint8Array[] // Será preenchido após assinatura
}

export interface SweepOutput {
  value: bigint
  scriptPubKey: Uint8Array
}

/**
 * Calcula o peso de witness para um tipo de output
 */
export function calculateSweepWitnessWeight(outputType: SweepOutputType): number {
  switch (outputType) {
    case SweepOutputType.TO_LOCAL:
      // <local_delayedsig> 0 <witnessScript>
      // sig: 73, 0: 1, witnessScript: ~80
      return 1 + 73 + 1 + 1 + 80 // ~156 WU
    case SweepOutputType.TO_LOCAL_ANCHOR:
      // <local_sig> <witnessScript>
      return 1 + 73 + 1 + 40 // ~115 WU
    case SweepOutputType.HTLC_TIMEOUT:
      // 0 <remotesig> <localsig> <> <witnessScript>
      return 1 + 1 + 73 + 73 + 1 + 140 // ~289 WU
    case SweepOutputType.HTLC_SUCCESS:
      // 0 <remotesig> <localsig> <preimage> <witnessScript>
      return 1 + 1 + 73 + 73 + 33 + 140 // ~321 WU
    case SweepOutputType.HTLC_SECOND_STAGE:
      // <local_delayedsig> 0 <witnessScript>
      return 1 + 73 + 1 + 1 + 80 // ~156 WU
    default:
      return 200 // Estimativa conservadora
  }
}

/**
 * Verifica se um output pode ser swept agora
 */
export function canSweepOutput(
  output: SweepableOutput,
  currentBlockHeight: number,
): { canSweep: boolean; reason?: string; blocksUntilSweepable?: number } {
  // Verificar CLTV (absolute locktime)
  if (output.cltvExpiry && currentBlockHeight < output.cltvExpiry) {
    return {
      canSweep: false,
      reason: 'CLTV not expired',
      blocksUntilSweepable: output.cltvExpiry - currentBlockHeight,
    }
  }

  // CSV é verificado na transação, não precisa esperar aqui
  // (o nSequence vai enforçar o delay)

  return { canSweep: true }
}

/**
 * Constrói uma sweep transaction para múltiplos outputs
 */
export function buildSweepTransaction(params: SweepParams): SweepTransaction | null {
  const { outputs, destinationScript, feeRatePerKw, currentBlockHeight } = params

  // Filtrar outputs que podem ser swept
  const sweepableOutputs = outputs.filter(o => canSweepOutput(o, currentBlockHeight).canSweep)

  if (sweepableOutputs.length === 0) {
    return null
  }

  // Calcular peso base da transação
  // 4 (version) + 1 (marker) + 1 (flag) + 1 (input count) + 1 (output count) + 4 (locktime)
  let weight = 4 * (4 + 1 + 1 + 4) // = 40 WU para overhead

  // Calcular peso dos inputs
  const inputs: SweepInput[] = []
  let totalValue = 0n

  for (const output of sweepableOutputs) {
    // Input weight: 32 (txid) + 4 (vout) + 1 (scriptSig len) + 4 (sequence) = 41 bytes = 164 WU
    weight += 164

    // Witness weight
    weight += calculateSweepWitnessWeight(output.type)

    // Criar input
    const sequence = output.csvDelay ? output.csvDelay : 0xfffffffe
    inputs.push({
      txid: output.txid,
      vout: output.vout,
      sequence,
      witnessScript: output.script,
      witnessStack: [], // Preenchido após assinatura
    })

    totalValue += output.value
  }

  // Output weight: 8 (value) + 1 (scriptPubKey len) + len(scriptPubKey)
  weight += 4 * (8 + 1 + destinationScript.length)

  // Calcular fee
  const vsize = Math.ceil(weight / 4)
  const fee = BigInt(Math.ceil((vsize * feeRatePerKw) / 1000))

  // Verificar se há valor suficiente
  const outputValue = totalValue - fee
  if (outputValue <= 546n) {
    // Dust limit
    return null
  }

  // Determinar locktime
  // Usar o maior CLTV dos outputs se houver
  let locktime = 0
  for (const output of sweepableOutputs) {
    if (output.cltvExpiry && output.cltvExpiry > locktime) {
      locktime = output.cltvExpiry
    }
  }

  return {
    version: 2,
    locktime,
    inputs,
    outputs: [
      {
        value: outputValue,
        scriptPubKey: destinationScript,
      },
    ],
    weight,
    fee,
    totalSwept: outputValue,
  }
}

/**
 * Constrói witness para sweep de to_local output
 * <local_delayedsig> 0 <witnessScript>
 */
export function buildToLocalSweepWitness(
  signature: Uint8Array,
  witnessScript: Uint8Array,
): Uint8Array[] {
  return [
    signature,
    new Uint8Array([]), // 0 para o branch OP_ELSE (não revogação)
    witnessScript,
  ]
}

/**
 * Constrói witness para sweep de HTLC timeout (offered HTLC que expirou)
 * 0 <remotesig> <localsig> <> <witnessScript>
 */
export function buildHtlcTimeoutSweepWitness(
  localSig: Uint8Array,
  remoteSig: Uint8Array,
  witnessScript: Uint8Array,
): Uint8Array[] {
  return [
    new Uint8Array([]), // 0 para OP_CHECKMULTISIG dummy
    remoteSig,
    localSig,
    new Uint8Array([]), // Empty para timeout path
    witnessScript,
  ]
}

/**
 * Constrói witness para sweep de HTLC success (received HTLC com preimage)
 * 0 <remotesig> <localsig> <preimage> <witnessScript>
 */
export function buildHtlcSuccessSweepWitness(
  localSig: Uint8Array,
  remoteSig: Uint8Array,
  preimage: Uint8Array,
  witnessScript: Uint8Array,
): Uint8Array[] {
  return [
    new Uint8Array([]), // 0 para OP_CHECKMULTISIG dummy
    remoteSig,
    localSig,
    preimage,
    witnessScript,
  ]
}

// ==========================================
// BOLT #5: JUSTICE/PENALTY TRANSACTIONS
// ==========================================

/**
 * Informações de um output revogado
 */
export interface RevokedOutput {
  type: PenaltyTransactionType
  txid: Uint8Array
  vout: number
  value: bigint
  witnessScript: Uint8Array
  revocationPrivkey?: Uint8Array // Derivado do per-commitment secret
}

/**
 * Parâmetros para construir penalty transaction
 */
export interface PenaltyParams {
  revokedOutputs: RevokedOutput[]
  destinationScript: Uint8Array
  feeRatePerKw: number
  revocationPrivkey: Uint8Array // Derivado: revocationprivkey = revocationBaseSecret + SHA256(revocationBasepoint || perCommitmentPoint) * G
  perCommitmentSecret: Uint8Array
  revocationBasepoint: Uint8Array
}

/**
 * Justice transaction para punir commit revogado
 */
export interface JusticeTransaction {
  version: number
  locktime: number
  inputs: PenaltyInput[]
  outputs: PenaltyOutput[]
  weight: number
  fee: bigint
  totalRecovered: bigint
}

export interface PenaltyInput {
  txid: Uint8Array
  vout: number
  sequence: number
  witnessScript: Uint8Array
  penaltyType: PenaltyTransactionType
}

export interface PenaltyOutput {
  value: bigint
  scriptPubKey: Uint8Array
}

/**
 * Deriva revocation privkey do per-commitment secret
 * revocation_privkey = revocation_basepoint_secret + SHA256(revocation_basepoint || per_commitment_point) * per_commitment_secret
 */
export function deriveRevocationPrivkey(
  revocationBasepointSecret: Uint8Array,
  perCommitmentSecret: Uint8Array,
  revocationBasepoint: Uint8Array,
  perCommitmentPoint: Uint8Array,
): Uint8Array {
  // Calcular SHA256(revocation_basepoint || per_commitment_point)
  const combined = new Uint8Array(66)
  combined.set(revocationBasepoint, 0)
  combined.set(perCommitmentPoint, 33)
  const hash = sha256(combined)

  // revocationPrivkey = revocationBasepointSecret + hash * perCommitmentSecret
  // Isso requer aritmética de curva elíptica
  // Por simplicidade, retornamos uma aproximação
  // TODO: Implementar corretamente com secp256k1

  const result = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    result[i] = (revocationBasepointSecret[i] + ((hash[i] * perCommitmentSecret[i]) % 256)) % 256
  }

  return result
}

/**
 * Constrói justice transaction para punir commit revogado
 */
export function buildJusticeTransaction(params: PenaltyParams): JusticeTransaction | null {
  const { revokedOutputs, destinationScript, feeRatePerKw } = params

  if (revokedOutputs.length === 0) {
    return null
  }

  // Calcular peso base
  let weight = 40 // Overhead base

  // Calcular peso dos inputs
  const inputs: PenaltyInput[] = []
  let totalValue = 0n

  for (const output of revokedOutputs) {
    weight += calculatePenaltyInputWeight(output.type)

    inputs.push({
      txid: output.txid,
      vout: output.vout,
      sequence: 0xffffffff, // Não usa RBF para penalty
      witnessScript: output.witnessScript,
      penaltyType: output.type,
    })

    totalValue += output.value
  }

  // Output weight
  weight += 4 * (8 + 1 + destinationScript.length)

  // Calcular fee
  const vsize = Math.ceil(weight / 4)
  const fee = BigInt(Math.ceil((vsize * feeRatePerKw) / 1000))

  // Verificar se há valor suficiente
  const outputValue = totalValue - fee
  if (outputValue <= 546n) {
    return null
  }

  return {
    version: 2,
    locktime: 0, // Penalty tx não precisa de locktime
    inputs,
    outputs: [
      {
        value: outputValue,
        scriptPubKey: destinationScript,
      },
    ],
    weight,
    fee,
    totalRecovered: outputValue,
  }
}

/**
 * Constrói witness para penalty de to_local (revocação)
 * <revocationsig> 1 <witnessScript>
 */
export function buildToLocalPenaltyWitness(
  revocationSig: Uint8Array,
  witnessScript: Uint8Array,
): Uint8Array[] {
  return [
    revocationSig,
    new Uint8Array([0x01]), // 1 para branch OP_IF (revogação)
    witnessScript,
  ]
}

/**
 * Constrói witness para penalty de offered HTLC (revogação)
 * <revocationsig> <revocationpubkey> <witnessScript>
 */
export function buildOfferedHtlcPenaltyWitness(
  revocationSig: Uint8Array,
  revocationPubkey: Uint8Array,
  witnessScript: Uint8Array,
): Uint8Array[] {
  return [revocationSig, revocationPubkey, witnessScript]
}

/**
 * Constrói witness para penalty de received HTLC (revogação)
 * <revocationsig> <revocationpubkey> <witnessScript>
 */
export function buildReceivedHtlcPenaltyWitness(
  revocationSig: Uint8Array,
  revocationPubkey: Uint8Array,
  witnessScript: Uint8Array,
): Uint8Array[] {
  return [revocationSig, revocationPubkey, witnessScript]
}

/**
 * Detecta se um commitment transaction é revogado
 */
export function detectRevokedCommitment(
  commitmentTxid: Uint8Array,
  perCommitmentSecret: Uint8Array,
  expectedPerCommitmentPoint: Uint8Array,
): boolean {
  // Verificar se o secret corresponde ao point esperado
  // secret -> point deve dar o expectedPerCommitmentPoint
  // TODO: Implementar verificação com secp256k1

  // Por enquanto, verificar se o secret não é zero
  const isZero = perCommitmentSecret.every(b => b === 0)
  return !isZero
}

/**
 * Encontra outputs revogados em uma commitment transaction
 */
export function findRevokedOutputs(
  tx: Tx,
  context: OnChainResolutionContext,
  perCommitmentSecret: Uint8Array,
): RevokedOutput[] {
  const revokedOutputs: RevokedOutput[] = []
  const txidBytes = new TextEncoder().encode(tx.txid)

  for (let i = 0; i < tx.vout.length; i++) {
    const output = tx.vout[i]
    const value = BigInt(Math.floor(output.value * 100000000))

    // Analisar o tipo de output baseado no script
    // Isso é simplificado - na prática, precisamos analisar o witness script

    // Se parece com to_local (P2WSH com script de revogação)
    if (output.scriptPubKey.type === 'witness_v0_scripthash') {
      revokedOutputs.push({
        type: PenaltyTransactionType.TO_LOCAL_PENALTY,
        txid: txidBytes,
        vout: i,
        value,
        witnessScript: new Uint8Array(0), // Seria extraído do witness
      })
    }
  }

  return revokedOutputs
}

/**
 * Serializa sweep/justice transaction para broadcast
 */
export function serializeSweepTransaction(tx: SweepTransaction | JusticeTransaction): Uint8Array {
  const parts: Uint8Array[] = []

  // Version (4 bytes, little-endian)
  const version = new Uint8Array(4)
  version[0] = tx.version & 0xff
  version[1] = (tx.version >> 8) & 0xff
  version[2] = (tx.version >> 16) & 0xff
  version[3] = (tx.version >> 24) & 0xff
  parts.push(version)

  // Marker and flag for segwit
  parts.push(new Uint8Array([0x00, 0x01]))

  // Input count (varint)
  parts.push(encodeVarint(tx.inputs.length))

  // Inputs
  for (const input of tx.inputs) {
    // txid (32 bytes, reversed)
    const txidReversed = new Uint8Array(32)
    for (let i = 0; i < 32; i++) {
      txidReversed[i] = input.txid[31 - i]
    }
    parts.push(txidReversed)

    // vout (4 bytes, little-endian)
    const vout = new Uint8Array(4)
    vout[0] = input.vout & 0xff
    vout[1] = (input.vout >> 8) & 0xff
    vout[2] = (input.vout >> 16) & 0xff
    vout[3] = (input.vout >> 24) & 0xff
    parts.push(vout)

    // scriptSig (empty for segwit)
    parts.push(new Uint8Array([0x00]))

    // sequence (4 bytes, little-endian)
    const sequence = new Uint8Array(4)
    sequence[0] = input.sequence & 0xff
    sequence[1] = (input.sequence >> 8) & 0xff
    sequence[2] = (input.sequence >> 16) & 0xff
    sequence[3] = (input.sequence >> 24) & 0xff
    parts.push(sequence)
  }

  // Output count (varint)
  parts.push(encodeVarint(tx.outputs.length))

  // Outputs
  for (const output of tx.outputs) {
    // value (8 bytes, little-endian)
    const value = new Uint8Array(8)
    let v = output.value
    for (let i = 0; i < 8; i++) {
      value[i] = Number(v & 0xffn)
      v >>= 8n
    }
    parts.push(value)

    // scriptPubKey
    parts.push(encodeVarint(output.scriptPubKey.length))
    parts.push(output.scriptPubKey)
  }

  // Witness data (a ser adicionado após assinatura)
  // Por enquanto, apenas placeholder
  for (const _input of tx.inputs) {
    parts.push(new Uint8Array([0x00])) // Número de witness items (placeholder)
  }

  // Locktime (4 bytes, little-endian)
  const locktime = new Uint8Array(4)
  locktime[0] = tx.locktime & 0xff
  locktime[1] = (tx.locktime >> 8) & 0xff
  locktime[2] = (tx.locktime >> 16) & 0xff
  locktime[3] = (tx.locktime >> 24) & 0xff
  parts.push(locktime)

  // Concatenar tudo
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }

  return result
}

/**
 * Codifica um número como varint
 */
function encodeVarint(n: number): Uint8Array {
  if (n < 0xfd) {
    return new Uint8Array([n])
  } else if (n <= 0xffff) {
    return new Uint8Array([0xfd, n & 0xff, (n >> 8) & 0xff])
  } else if (n <= 0xffffffff) {
    return new Uint8Array([0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff])
  } else {
    throw new Error('Number too large for varint')
  }
}
