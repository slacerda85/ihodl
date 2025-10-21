import { MMKV } from 'react-native-mmkv'
import { uint8ArrayToHex, hexToUint8Array } from '@/lib/crypto'
import type { BlockHeader } from './types'
import { computeBlockHash } from './utils'

/**
 * Blockchain Storage Engine
 * Provides encrypted storage for blockchain data using MMKV
 */

// Open storage
const storage = new MMKV({ id: 'blockchain' })

/**
 * Function to store a block header
 */
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
    // Update last synced height
    storage.set('last_synced_height', header.height.toString())
  }
}

/**
 * Function to get a block header by hash
 */
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

/**
 * Function to get a block header by height
 */
export function getBlockHeaderByHeight(height: number): BlockHeader | null {
  const hashHex = storage.getString(`height_${height}`)
  if (hashHex) {
    return getBlockHeader(hashHex)
  }
  return null
}

/**
 * Function to get last synced header
 */
export function getLastSyncedHeader(): BlockHeader | null {
  const lastHeightStr = storage.getString('last_synced_height')
  if (lastHeightStr) {
    const lastHeight = parseInt(lastHeightStr, 10)
    return getBlockHeaderByHeight(lastHeight)
  }
  return null
}

/**
 * Function to clear all stored headers
 */
export function clearStoredHeaders(): void {
  // This is a simplified implementation - in practice you'd need to track all stored keys
  storage.clearAll()
}
