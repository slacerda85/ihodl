import { sha256 } from '@noble/hashes/sha2'
import { MMKV } from 'react-native-mmkv'
import { uint8ArrayToHex, hexToUint8Array } from '@/lib/crypto'
import { callElectrumMethod, connect, close } from '@/lib/electrum'

// Consensus parameters (mainnet)
const CONSENSUS_PARAMS = {
  powLimit: '00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffff', // Mainnet powLimit
  difficultyAdjustmentInterval: 2016,
  powTargetTimespan: 14 * 24 * 60 * 60, // 2 weeks
  powTargetSpacing: 10 * 60, // 10 minutes
  nMedianTimeSpan: 11,
}

// Helper function to convert hex to Uint8Array (big-endian)
function hexToUint8ArrayBE(hex: string): Uint8Array {
  const bytes = hexToUint8Array(hex)
  // Reverse for big-endian
  return bytes.reverse()
}

// Function to get compact representation of target
function targetToCompact(target: Uint8Array): number {
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

// Define interfaces
export interface BlockHeader {
  version: number
  previousBlockHash: Uint8Array
  merkleRoot: Uint8Array
  timestamp: number
  bits: number
  nonce: number
  height?: number
  hash?: Uint8Array
}

export interface MerkleProof {
  txHash: Uint8Array
  proof: Uint8Array[]
  position: number
}

// Open storage
const storage = new MMKV({ id: 'blockchain' })

// Helper function to compare Uint8Arrays
function uint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

// Helper function to concat Uint8Arrays
function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

// Initialize - no need for table creation

// Function to compute hash of block header
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

// Function to store a block header
export function storeBlockHeader(header: BlockHeader): void {
  const hash = computeBlockHash(header)
  header.hash = hash
  const hashHex = uint8ArrayToHex(hash)
  const headerData = {
    version: header.version,
    prevHash: uint8ArrayToHex(header.previousBlockHash),
    merkleRoot: uint8ArrayToHex(header.merkleRoot),
    timestamp: header.timestamp,
    bits: header.bits,
    nonce: header.nonce,
    height: header.height,
  }
  storage.set(hashHex, JSON.stringify(headerData))
  if (header.height !== undefined) {
    storage.set(`height_${header.height}`, hashHex)
  }
}

// Function to get a block header by hash
export function getBlockHeader(hash: string): BlockHeader | null {
  const data = storage.getString(hash)
  if (data) {
    const parsed = JSON.parse(data)
    return {
      version: parsed.version,
      previousBlockHash: hexToUint8Array(parsed.prevHash),
      merkleRoot: hexToUint8Array(parsed.merkleRoot),
      timestamp: parsed.timestamp,
      bits: parsed.bits,
      nonce: parsed.nonce,
      height: parsed.height,
      hash: hexToUint8Array(hash),
    }
  }
  return null
}

// Function to get a block header by height
export function getBlockHeaderByHeight(height: number): BlockHeader | null {
  const hashHex = storage.getString(`height_${height}`)
  if (hashHex) {
    return getBlockHeader(hashHex)
  }
  return null
}

// Function to get current block height
export async function getCurrentBlockHeight(socket?: any): Promise<number> {
  try {
    const response = await callElectrumMethod<{ height: number }>(
      'blockchain.headers.subscribe',
      [],
      socket,
    )
    return response.result?.height || 0
  } catch (error) {
    console.error('Error getting current block height:', error)
    throw error
  }
}

// Function to get block header from Electrum by height
export async function getBlockHeaderFromElectrum(
  height: number,
  socket?: any,
): Promise<BlockHeader> {
  try {
    const response = await callElectrumMethod<string>('blockchain.block.header', [height], socket)
    const headerHex = response.result
    if (!headerHex) throw new Error('No header received')
    const headerBytes = hexToUint8Array(headerHex)
    const view = new DataView(headerBytes.buffer)
    const header: BlockHeader = {
      version: view.getUint32(0, true),
      previousBlockHash: headerBytes.slice(4, 36),
      merkleRoot: headerBytes.slice(36, 68),
      timestamp: view.getUint32(68, true),
      bits: view.getUint32(72, true),
      nonce: view.getUint32(76, true),
      height,
    }
    header.hash = computeBlockHash(header)
    return header
  } catch (error) {
    console.error(`Error getting block header for height ${height}:`, error)
    throw error
  }
}

// Function to expand bits to target
function bitsToTarget(bits: number): Uint8Array {
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

// Function to verify proof-of-work
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

// Function to validate block header
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

// Function to get last synced header
export function getLastSyncedHeader(): BlockHeader | null {
  const lastHeightStr = storage.getString('last_synced_height')
  if (lastHeightStr) {
    const lastHeight = parseInt(lastHeightStr, 10)
    return getBlockHeaderByHeight(lastHeight)
  }
  return null
}

// Placeholder for Merkle tree functions
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

// Function to verify Merkle proof
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

// Placeholder for sync logic
export async function syncHeaders(
  maxSizeGB: number = 1,
  onProgress?: (height: number, currentHeight?: number) => void,
  state?: any,
): Promise<void> {
  let socket: any = null
  try {
    // Establish persistent connection for the entire sync
    socket = await connect(state)
    console.log('[blockchain] Established persistent Electrum connection for header sync')

    const currentHeight = await getCurrentBlockHeight(socket)
    const lastHeader = getLastSyncedHeader()
    const maxHeaders = Math.floor((maxSizeGB * 1e9) / 80) // Approximate: 80 bytes per header
    const startHeight = Math.max(0, currentHeight - maxHeaders + 1)
    const effectiveStartHeight = lastHeader
      ? Math.max(lastHeader.height! + 1, startHeight)
      : startHeight

    console.log(
      `Syncing headers from ${effectiveStartHeight} to ${currentHeight} (max ${maxHeaders} headers)`,
    )

    for (let height = effectiveStartHeight; height <= currentHeight; height++) {
      const header = await getBlockHeaderFromElectrum(height, socket)
      const previousHeader =
        height > 0 ? getBlockHeaderByHeight(height - 1) || undefined : undefined

      // console.log(`Fetched header for height ${height}, hash: ${uint8ArrayToHex(header.hash!)}`)

      if (!validateBlockHeader(header, previousHeader)) {
        console.error(`Invalid header at height ${height}`)
        break
      }

      storeBlockHeader(header)
      storage.set('last_synced_height', height.toString())
      // console.log(`Synced header ${height}`)

      // Call progress callback if provided
      if (onProgress) {
        onProgress(height, currentHeight)
      }

      // Yield control to allow UI updates (small delay)
      await new Promise(resolve => setTimeout(resolve, 1))
    }

    console.log('Headers synced')
  } catch (error) {
    console.error('Error syncing headers:', error)
  } finally {
    // Close the persistent connection
    if (socket) {
      try {
        console.log('[blockchain] Closing persistent Electrum connection')
        close(socket)
      } catch (closeError) {
        console.error('[blockchain] Error closing persistent socket:', closeError)
      }
    }
  }
}

// Placeholder for transaction verification
export function verifyTransaction(
  txHash: Uint8Array,
  proof: MerkleProof,
  blockHash: string,
): boolean {
  const header = getBlockHeader(blockHash)
  if (!header) return false
  return verifyMerkleProof(proof, header.merkleRoot)
}

// Function to get median time past for a header
export function getMedianTimePast(header: BlockHeader): number {
  const timestamps: number[] = []
  let currentHeight = header.height!
  for (let i = 0; i < CONSENSUS_PARAMS.nMedianTimeSpan && currentHeight >= 0; i++) {
    const currentHeader = getBlockHeaderByHeight(currentHeight)
    if (currentHeader) {
      timestamps.push(currentHeader.timestamp)
    }
    currentHeight--
  }
  timestamps.sort((a, b) => a - b)
  return timestamps[Math.floor(timestamps.length / 2)] || 0
}

// Function to get next work required
export function getNextWorkRequired(previousHeader: BlockHeader): number {
  const powLimitCompact = targetToCompact(hexToUint8ArrayBE(CONSENSUS_PARAMS.powLimit))

  // Only change once per difficulty adjustment interval
  if ((previousHeader.height! + 1) % CONSENSUS_PARAMS.difficultyAdjustmentInterval !== 0) {
    return previousHeader.bits
  }

  // Go back by what we want to be 14 days worth of blocks
  const heightFirst = previousHeader.height! - (CONSENSUS_PARAMS.difficultyAdjustmentInterval - 1)
  const firstHeader = getBlockHeaderByHeight(heightFirst)
  if (!firstHeader) return powLimitCompact

  return calculateNextWorkRequired(previousHeader, firstHeader.timestamp)
}

// Function to calculate next work required
function calculateNextWorkRequired(lastHeader: BlockHeader, firstBlockTime: number): number {
  let actualTimespan = lastHeader.timestamp - firstBlockTime

  // Limit adjustment step
  const minTimespan = CONSENSUS_PARAMS.powTargetTimespan / 4
  const maxTimespan = CONSENSUS_PARAMS.powTargetTimespan * 4
  actualTimespan = Math.max(minTimespan, Math.min(maxTimespan, actualTimespan))

  // Retarget - simplified
  const ratio = actualTimespan / CONSENSUS_PARAMS.powTargetTimespan
  let newBits = lastHeader.bits
  if (ratio < 1) {
    newBits += Math.floor((1 - ratio) * 0x100000)
  } else {
    newBits -= Math.floor((ratio - 1) * 0x100000)
  }
  const powLimitCompact = targetToCompact(hexToUint8ArrayBE(CONSENSUS_PARAMS.powLimit))
  return Math.min(newBits, powLimitCompact)
}
