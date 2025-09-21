import { sha256 } from '@noble/hashes/sha2'
import { MMKV } from 'react-native-mmkv'
import axios from 'axios'
import { uint8ArrayToHex, hexToUint8Array } from '@/lib/crypto'

// Define interfaces
export interface BlockHeader {
  version: number
  previousBlockHash: Uint8Array
  merkleRoot: Uint8Array
  timestamp: number
  bits: number
  nonce: number
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
  }
  storage.set(hashHex, JSON.stringify(headerData))
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
      hash: hexToUint8Array(hash),
    }
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
    newHashes.push(sha256(concatUint8Arrays([left, right])))
  }
  return computeMerkleRoot(newHashes)
}

// Function to verify Merkle proof
export function verifyMerkleProof(proof: MerkleProof, merkleRoot: Uint8Array): boolean {
  let hash = proof.txHash
  for (let i = 0; i < proof.proof.length; i++) {
    const sibling = proof.proof[i]
    if (proof.position % 2 === 0) {
      hash = sha256(concatUint8Arrays([hash, sibling]))
    } else {
      hash = sha256(concatUint8Arrays([sibling, hash]))
    }
    proof.position = Math.floor(proof.position / 2)
  }
  return uint8ArraysEqual(hash, merkleRoot)
}

// Placeholder for sync logic
export async function syncHeaders(): Promise<void> {
  try {
    // Get the latest block from blockchain.info
    const response = await axios.get('https://blockchain.info/latestblock')
    const latestBlock = response.data
    // For simplicity, store only the latest header
    // In a real implementation, fetch the chain of headers
    const header: BlockHeader = {
      version: latestBlock.ver,
      previousBlockHash: hexToUint8Array(latestBlock.prev_block),
      merkleRoot: hexToUint8Array(latestBlock.mrkl_root),
      timestamp: latestBlock.time,
      bits: latestBlock.bits,
      nonce: latestBlock.nonce,
    }
    storeBlockHeader(header)
    console.log('Synced latest header')
  } catch (error) {
    console.error('Error syncing headers:', error)
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
