// BOLT #4: Multi-Path Payments (MPP) and Basic MPP
// Based on https://github.com/lightning/bolts/blob/master/04-onion-routing.md#basic-multi-part-payments

import { Sha256, ShortChannelId } from './base'

/**
 * MPP Payment Status
 */
export enum MppPaymentStatus {
  PENDING = 'pending',
  IN_FLIGHT = 'in_flight',
  PARTIAL = 'partial',
  COMPLETE = 'complete',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
}

/**
 * MPP Part Status
 */
export enum MppPartStatus {
  PENDING = 'pending',
  IN_FLIGHT = 'in_flight',
  SETTLED = 'settled',
  FAILED = 'failed',
}

/**
 * MPP Configuration
 */
export interface MppConfig {
  /** Maximum number of parts to split payment into */
  maxParts: number
  /** Minimum part size in millisatoshis */
  minPartSizeMsat: bigint
  /** Maximum part size in millisatoshis */
  maxPartSizeMsat: bigint
  /** Timeout for collecting all parts (seconds) */
  paymentTimeoutSec: number
  /** Whether to use probing to find routes */
  useProbing: boolean
  /** Maximum total fee as percentage of payment amount */
  maxFeePercent: number
  /** Maximum total fee in millisatoshis (absolute cap) */
  maxFeeMsat: bigint
  /** Retry failed parts automatically */
  autoRetry: boolean
  /** Maximum retries per part */
  maxRetriesPerPart: number
}

/**
 * Default MPP Configuration
 */
export const DEFAULT_MPP_CONFIG: MppConfig = {
  maxParts: 16,
  minPartSizeMsat: 10000n, // 10 sats minimum
  maxPartSizeMsat: 4294967295000n, // ~4.29 BTC (max u32 * 1000)
  paymentTimeoutSec: 60,
  useProbing: false,
  maxFeePercent: 1, // 1% max fee
  maxFeeMsat: 100000n, // 100 sats max fee
  autoRetry: true,
  maxRetriesPerPart: 3,
}

/**
 * Payment Part (single HTLC in an MPP)
 */
export interface MppPart {
  /** Unique identifier for this part */
  partId: string
  /** Amount of this part in millisatoshis */
  amountMsat: bigint
  /** Route for this part */
  route: MppRoute
  /** Current status */
  status: MppPartStatus
  /** HTLC ID if in flight */
  htlcId?: bigint
  /** Preimage if settled */
  preimage?: Uint8Array
  /** Failure reason if failed */
  failureReason?: string
  /** Failure code if failed */
  failureCode?: number
  /** Retry count */
  retryCount: number
  /** Creation timestamp */
  createdAt: number
  /** Settlement timestamp */
  settledAt?: number
}

/**
 * MPP Route (simplified route info for a part)
 */
export interface MppRoute {
  /** Hops in the route */
  hops: MppRouteHop[]
  /** Total fee for this route in millisatoshis */
  totalFeeMsat: bigint
  /** Total CLTV delta for this route */
  totalCltvDelta: number
  /** Probability of success (0-1) */
  successProbability: number
}

/**
 * MPP Route Hop
 */
export interface MppRouteHop {
  /** Node ID */
  nodeId: Uint8Array
  /** Short Channel ID */
  shortChannelId: ShortChannelId
  /** Amount to forward in millisatoshis */
  amountToForwardMsat: bigint
  /** Outgoing CLTV value */
  outgoingCltvValue: number
  /** Fee for this hop */
  feeMsat: bigint
}

/**
 * MPP Payment (complete multi-path payment)
 */
export interface MppPayment {
  /** Payment hash */
  paymentHash: Sha256
  /** Payment secret (required for MPP) */
  paymentSecret: Sha256
  /** Total amount in millisatoshis */
  totalAmountMsat: bigint
  /** Destination node ID */
  destinationNodeId: Uint8Array
  /** Individual parts */
  parts: MppPart[]
  /** Overall payment status */
  status: MppPaymentStatus
  /** Total fees paid (sum of all parts) */
  totalFeesMsat: bigint
  /** Creation timestamp */
  createdAt: number
  /** Completion timestamp */
  completedAt?: number
  /** Preimage (when complete) */
  preimage?: Uint8Array
  /** Payment metadata */
  metadata?: Uint8Array
}

/**
 * MPP Split Result
 */
export interface MppSplitResult {
  /** Whether splitting was successful */
  success: boolean
  /** Split parts with their amounts */
  parts: MppPartAllocation[]
  /** Error message if failed */
  error?: string
}

/**
 * MPP Part Allocation (before routing)
 */
export interface MppPartAllocation {
  /** Part index */
  index: number
  /** Amount for this part */
  amountMsat: bigint
  /** Optional preferred channel */
  preferredChannelId?: ShortChannelId
}

/**
 * Channel Liquidity Info for MPP splitting
 */
export interface ChannelLiquidity {
  /** Channel ID */
  channelId: ShortChannelId
  /** Estimated available liquidity */
  availableMsat: bigint
  /** Success rate of recent payments */
  successRate: number
  /** Last successful payment amount */
  lastSuccessfulAmountMsat?: bigint
  /** Last failed payment amount */
  lastFailedAmountMsat?: bigint
}

/**
 * MPP Payment Request
 */
export interface MppPaymentRequest {
  /** Payment hash from invoice */
  paymentHash: Sha256
  /** Payment secret from invoice */
  paymentSecret: Sha256
  /** Total amount in millisatoshis */
  amountMsat: bigint
  /** Destination node ID */
  destinationNodeId: Uint8Array
  /** Final CLTV delta from invoice */
  finalCltvDelta: number
  /** Optional payment metadata */
  metadata?: Uint8Array
  /** Optional configuration override */
  config?: Partial<MppConfig>
}

/**
 * MPP Payment Result
 */
export interface MppPaymentResult {
  /** Whether payment was successful */
  success: boolean
  /** Payment preimage if successful */
  preimage?: Uint8Array
  /** Total fees paid */
  totalFeesMsat?: bigint
  /** Number of parts used */
  numParts?: number
  /** Time taken in milliseconds */
  timeTakenMs?: number
  /** Error message if failed */
  error?: string
  /** Detailed part results */
  partResults?: MppPartResult[]
}

/**
 * Individual Part Result
 */
export interface MppPartResult {
  /** Part ID */
  partId: string
  /** Amount */
  amountMsat: bigint
  /** Whether this part succeeded */
  success: boolean
  /** Fee paid for this part */
  feeMsat?: bigint
  /** Error if failed */
  error?: string
  /** Failure code if failed */
  failureCode?: number
}

/**
 * Liquidity Hint from payment attempts
 */
export interface LiquidityHint {
  /** Channel ID */
  channelId: ShortChannelId
  /** Direction (true = node1->node2, false = node2->node1) */
  direction: boolean
  /** Minimum known liquidity */
  minLiquidityMsat: bigint
  /** Maximum known liquidity */
  maxLiquidityMsat: bigint
  /** Last update timestamp */
  lastUpdate: number
}

/**
 * MPP Shard for TLV encoding
 */
export interface MppShard {
  /** Payment secret (32 bytes) */
  paymentSecret: Sha256
  /** Total amount of all shards combined */
  totalMsat: bigint
}

/**
 * Feature bits for MPP (BOLT #9)
 */
export const MPP_FEATURE_BIT = 16 // basic_mpp
export const MPP_FEATURE_BIT_OPTIONAL = 17 // basic_mpp optional

/**
 * TLV Type for payment_data (contains MPP info)
 */
export const TLV_PAYMENT_DATA = 8

/**
 * TLV Type for total_amount_msat (for final hop)
 */
export const TLV_TOTAL_AMOUNT_MSAT = 18
