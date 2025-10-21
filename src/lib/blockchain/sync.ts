import { callElectrumMethod, connect, close } from '@/lib/electrum'
import type { BlockHeader } from './types'
import { validateBlockHeader } from './utils'
import { storeBlockHeader, getBlockHeaderByHeight, getLastSyncedHeader } from './storage'

/**
 * Blockchain Synchronization Functions
 * Handles blockchain header synchronization with Electrum servers
 */

/**
 * Function to get current block height from Electrum
 */
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

/**
 * Function to get block header from Electrum by height
 */
export async function getBlockHeaderFromElectrum(
  height: number,
  socket?: any,
): Promise<BlockHeader> {
  try {
    const response = await callElectrumMethod<string>('blockchain.block.header', [height], socket)
    const headerHex = response.result
    if (!headerHex) throw new Error('No header received')
    const headerBytes = new Uint8Array(
      headerHex.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)),
    )
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
    return header
  } catch (error) {
    console.error(`Error getting block header for height ${height}:`, error)
    throw error
  }
}

/**
 * Function to sync blockchain headers
 */
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
