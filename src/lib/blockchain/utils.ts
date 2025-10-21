import { sha256 } from '@noble/hashes/sha2'
import { hexToUint8Array } from '@/lib/crypto'
import type { BlockHeader, MerkleProof } from './types'
import { getMedianTimePast } from './validation'

/**
 * Blockchain Utility Functions
 * Core cryptographic and validation functions for Bitcoin blockchain operations
 */

/**
 * Helper function to convert hex to Uint8Array (big-endian)
 */
export function hexToUint8ArrayBE(hex: string): Uint8Array {
  const bytes = hexToUint8Array(hex)
  // Reverse for big-endian
  return bytes.reverse()
}

/**
 * Function to get compact representation of target
 */
export function targetToCompact(target: Uint8Array): number {
  let exponent = target.length
  while (exponent > 0 && target[exponent - 1] === 0) {
    exponent--
  }
  if (exponent === 0) return 0
  let mantissa = 0
  for (let i = 0; i < 3; i++) {
    mantissa |= (target[exponent - 1 - i] || 0) << (8 * i)
  }
  return (exponent << 24) | (mantissa >>> (8 * (3 - Math.min(3, exponent))))
}

/**
 * Helper function to compare Uint8Arrays
 */
export function uint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * Helper function to concat Uint8Arrays
 */
export function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

/**
 * Function to compute hash of block header
 */
export function computeBlockHash(header: BlockHeader): Uint8Array {
  const buffer = new Uint8Array(80)
  const view = new DataView(buffer.buffer)
  view.setUint32(0, header.version, true) // little-endian
  buffer.set(header.previousBlockHash, 4)
  buffer.set(header.merkleRoot, 36)
  view.setUint32(68, header.timestamp, true)
  view.setUint32(72, header.bits, true)
  view.setUint32(76, header.nonce, true)
  return sha256(sha256(buffer))
}

/**
 * Function to expand bits to target
 */
export function bitsToTarget(bits: number): Uint8Array {
  const target = new Uint8Array(32)
  const exponent = bits >>> 24
  const mantissa = bits & 0x00ffffff

  if (exponent <= 3) {
    // Small target: the mantissa is the target value shifted
    const size = exponent
    for (let i = 0; i < size; i++) {
      target[i] = (mantissa >>> (8 * (size - 1 - i))) & 0xff
    }
  } else {
    // Normal target: mantissa << (8 * (exponent - 3))
    const size = exponent - 3
    for (let i = 0; i < 3; i++) {
      target[size + i] = (mantissa >>> (8 * i)) & 0xff
    }
  }
  return target
}

/**
 * Function to verify proof-of-work
 */
export function verifyProofOfWork(header: BlockHeader): boolean {
  const hash = computeBlockHash(header)
  const target = bitsToTarget(header.bits)
  // Compare hash < target, both little-endian
  for (let i = 31; i >= 0; i--) {
    if (hash[i] < target[i]) return true
    if (hash[i] > target[i]) return false
  }
  return true
}

/**
 * Function to validate block header
 */
export function validateBlockHeader(header: BlockHeader, previousHeader?: BlockHeader): boolean {
  // Check proof-of-work
  if (!verifyProofOfWork(header)) return false

  // Check previous block hash
  if (previousHeader && !uint8ArraysEqual(header.previousBlockHash, previousHeader.hash!))
    return false

  // Check timestamp against median time past
  if (previousHeader) {
    const medianTimePast = getMedianTimePast(previousHeader)
    if (header.timestamp <= medianTimePast) return false
  }

  // Check timestamp not too far in future
  const now = Math.floor(Date.now() / 1000)
  if (header.timestamp > now + 7200) return false // 2 hours in future

  // Check version (basic)
  if (header.version < 1) return false

  return true
}

/**
 * Function to compute Merkle root from transaction hashes
 */
export function computeMerkleRoot(txHashes: Uint8Array[]): Uint8Array {
  // Use bitcoinjs-lib's merkle function if available, else implement
  // For now, simple implementation
  if (txHashes.length === 0) return new Uint8Array(32)
  if (txHashes.length === 1) return txHashes[0]
  const newHashes: Uint8Array[] = []
  for (let i = 0; i < txHashes.length; i += 2) {
    const left = txHashes[i]
    const right = i + 1 < txHashes.length ? txHashes[i + 1] : left
    const concat = concatUint8Arrays([left, right])
    newHashes.push(sha256(sha256(concat))) // Double SHA256
  }
  return computeMerkleRoot(newHashes)
}

/**
 * Function to verify Merkle proof
 */
export function verifyMerkleProof(proof: MerkleProof, merkleRoot: Uint8Array): boolean {
  let hash = proof.txHash
  let position = proof.position
  for (let i = 0; i < proof.proof.length; i++) {
    const sibling = proof.proof[i]
    if (position % 2 === 0) {
      hash = sha256(sha256(concatUint8Arrays([hash, sibling])))
    } else {
      hash = sha256(sha256(concatUint8Arrays([sibling, hash])))
    }
    position = Math.floor(position / 2)
  }
  return uint8ArraysEqual(hash, merkleRoot)
}
