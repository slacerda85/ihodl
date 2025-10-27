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
 * Function to get block headers in batch from Electrum
 */
export async function getBlockHeadersBatch(
  startHeight: number,
  count: number,
  socket?: any,
): Promise<BlockHeader[]> {
  try {
    const response = await callElectrumMethod<{
      count: number
      hex: string
      max: number
    }>('blockchain.block.headers', [startHeight, count], socket)

    const { count: returnedCount, hex: headersHex } = response.result || {}

    if (!headersHex || returnedCount === 0) {
      return []
    }

    const headers: BlockHeader[] = []
    const headerSize = 80 // 80 bytes per header

    for (let i = 0; i < returnedCount; i++) {
      const offset = i * headerSize * 2 // 2 hex chars per byte
      const headerHex = headersHex.substring(offset, offset + headerSize * 2)
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
        height: startHeight + i,
      }

      headers.push(header)
    }

    return headers
  } catch (error) {
    console.error(`Error getting block headers batch from ${startHeight}:`, error)
    throw error
  }
}

/**
 * Function to get block header from Electrum by height (fallback method)
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
 * Function to sync blockchain headers with batch optimization
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

    // Validate that we have a valid sync range
    if (effectiveStartHeight > currentHeight) {
      console.log(
        `[blockchain] No sync needed: effective start height (${effectiveStartHeight}) >= current height (${currentHeight})`,
      )
      return
    }

    console.log(
      `Syncing headers from ${effectiveStartHeight} to ${currentHeight} (max ${maxHeaders} headers)`,
    )

    const batchSize = 2016 // Maximum headers per batch as per Electrum protocol
    let syncedCount = 0

    for (let height = effectiveStartHeight; height <= currentHeight; height += batchSize) {
      const remainingHeaders = currentHeight - height + 1
      const currentBatchSize = Math.min(batchSize, remainingHeaders)

      try {
        console.log(`[blockchain] Downloading batch: ${height} to ${height + currentBatchSize - 1}`)
        const headers = await getBlockHeadersBatch(height, currentBatchSize, socket)

        // Process and validate headers in batch
        for (let i = 0; i < headers.length; i++) {
          const header = headers[i]
          const previousHeader =
            header.height! > 0 ? getBlockHeaderByHeight(header.height! - 1) || undefined : undefined

          // Validate header
          if (!validateBlockHeader(header, previousHeader)) {
            console.error(`Invalid header at height ${header.height}`)
            break
          }

          // Store header
          storeBlockHeader(header)
          syncedCount++

          // Call progress callback
          if (onProgress) {
            onProgress(header.height!, currentHeight)
          }
        }

        // Yield control to allow UI updates
        await new Promise(resolve => setTimeout(resolve, 1))
      } catch (batchError) {
        console.error(
          `[blockchain] Error in batch ${height}-${height + currentBatchSize - 1}:`,
          batchError,
        )
        // Fall back to individual header fetching for this batch
        console.log(
          `[blockchain] Falling back to individual header fetching for batch starting at ${height}`,
        )

        for (let h = height; h < height + currentBatchSize && h <= currentHeight; h++) {
          try {
            const header = await getBlockHeaderFromElectrum(h, socket)
            const previousHeader = h > 0 ? getBlockHeaderByHeight(h - 1) || undefined : undefined

            if (!validateBlockHeader(header, previousHeader)) {
              console.error(`Invalid header at height ${h}`)
              break
            }

            storeBlockHeader(header)
            syncedCount++

            if (onProgress) {
              onProgress(h, currentHeight)
            }

            // Yield control
            await new Promise(resolve => setTimeout(resolve, 1))
          } catch (headerError) {
            console.error(`[blockchain] Error fetching individual header ${h}:`, headerError)
            break
          }
        }
      }
    }

    console.log(`[blockchain] Synced ${syncedCount} headers successfully`)
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
