import type { BlockHeader, MerkleProof } from './types'
import { getBlockHeader, getBlockHeaderByHeight } from './storage'
import { verifyMerkleProof } from './utils'

/**
 * Blockchain Validation Functions
 * Higher-level validation functions that depend on storage
 */

/**
 * Function to verify transaction inclusion in block
 */
export function verifyTransaction(
  txHash: Uint8Array,
  proof: MerkleProof,
  blockHash: string,
): boolean {
  const header = getBlockHeader(blockHash)
  if (!header) return false
  return verifyMerkleProof(proof, header.merkleRoot)
}

/**
 * Function to get median time past for a header
 */
export function getMedianTimePast(header: BlockHeader): number {
  const timestamps: number[] = []
  let currentHeight = header.height!
  for (let i = 0; i < 11 && currentHeight >= 0; i++) {
    // CONSENSUS_PARAMS.nMedianTimeSpan
    const currentHeader = getBlockHeaderByHeight(currentHeight)
    if (currentHeader) {
      timestamps.push(currentHeader.timestamp)
    }
    currentHeight--
  }
  timestamps.sort((a, b) => a - b)
  return timestamps[Math.floor(timestamps.length / 2)] || 0
}

/**
 * Function to get next work required
 */
export function getNextWorkRequired(previousHeader: BlockHeader): number {
  const powLimitCompact = 0x1d00ffff // targetToCompact(hexToUint8ArrayBE(CONSENSUS_PARAMS.powLimit))

  // Only change once per difficulty adjustment interval
  if ((previousHeader.height! + 1) % 2016 !== 0) {
    // CONSENSUS_PARAMS.difficultyAdjustmentInterval
    return previousHeader.bits
  }

  // Go back by what we want to be 14 days worth of blocks
  const heightFirst = previousHeader.height! - (2016 - 1) // CONSENSUS_PARAMS.difficultyAdjustmentInterval
  const firstHeader = getBlockHeaderByHeight(heightFirst)
  if (!firstHeader) return powLimitCompact

  return calculateNextWorkRequired(previousHeader, firstHeader.timestamp)
}

/**
 * Function to calculate next work required
 */
export function calculateNextWorkRequired(lastHeader: BlockHeader, firstBlockTime: number): number {
  let actualTimespan = lastHeader.timestamp - firstBlockTime

  // Limit adjustment step
  const minTimespan = (14 * 24 * 60 * 60) / 4 // CONSENSUS_PARAMS.powTargetTimespan
  const maxTimespan = 14 * 24 * 60 * 60 * 4 // CONSENSUS_PARAMS.powTargetTimespan
  actualTimespan = Math.max(minTimespan, Math.min(maxTimespan, actualTimespan))

  // Retarget - simplified
  const ratio = actualTimespan / (14 * 24 * 60 * 60) // CONSENSUS_PARAMS.powTargetTimespan
  let newBits = lastHeader.bits
  if (ratio < 1) {
    newBits += Math.floor((1 - ratio) * 0x100000)
  } else {
    newBits -= Math.floor((ratio - 1) * 0x100000)
  }
  const powLimitCompact = 0x1d00ffff // targetToCompact(hexToUint8ArrayBE(CONSENSUS_PARAMS.powLimit))
  return Math.min(newBits, powLimitCompact)
}
