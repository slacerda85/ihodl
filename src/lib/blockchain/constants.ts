/**
 * Blockchain Constants
 * Bitcoin consensus parameters and configuration values
 */

/**
 * Bitcoin mainnet consensus parameters
 */
export const CONSENSUS_PARAMS = {
  /** Maximum proof-of-work target (mainnet powLimit) */
  powLimit: '00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  /** Number of blocks between difficulty adjustments */
  difficultyAdjustmentInterval: 2016,
  /** Target timespan for difficulty adjustment (2 weeks in seconds) */
  powTargetTimespan: 14 * 24 * 60 * 60,
  /** Target spacing between blocks (10 minutes in seconds) */
  powTargetSpacing: 10 * 60,
  /** Number of blocks to consider for median time past calculation */
  nMedianTimeSpan: 11,
} as const
