/**
 * Blockchain Integration for Lightning Network
 * Provides blockchain synchronization and monitoring for Lightning node operations
 */

import {
  getTransactions,
  getBalance,
  estimateFeeRate,
  getRecommendedFeeRates,
  getMempoolTransactions,
  getTransaction,
  getBlockHash,
  callElectrumMethod,
  connect,
  close,
  broadcastTransaction as broadcastTransactionElectrum,
} from '../electrum'
import { Tx } from '@/models/transaction'
import { TLSSocket } from 'tls'
import type { IBlockchainClient, BlockchainClientConfig } from './types'
import { getCurrentBlockHeight } from './sync'

/**
 * Electrum-based blockchain client implementation
 */
export class ElectrumBlockchainClient implements IBlockchainClient {
  private config: Required<BlockchainClientConfig>
  private socket: TLSSocket | null = null
  private subscriptions: Map<string, (data: any) => void> = new Map()
  private isConnected = false

  constructor(config: BlockchainClientConfig = {}) {
    this.config = {
      network: config.network || 'mainnet',
      timeout: config.timeout || 30000,
      minConfirmations: config.minConfirmations || 1,
      persistentConnection: config.persistentConnection ?? true,
    }
  }

  /**
   * Initialize the client and establish connection if needed
   */
  private async ensureConnection(): Promise<TLSSocket> {
    if (this.socket && this.isConnected) {
      return this.socket
    }

    try {
      console.log('[lightning-blockchain] Establishing Electrum connection...')
      this.socket = await connect()
      this.isConnected = true
      console.log('[lightning-blockchain] Electrum connection established')
      return this.socket
    } catch (error) {
      console.error('[lightning-blockchain] Failed to connect to Electrum:', error)
      throw new Error(`Failed to connect to Electrum: ${error}`)
    }
  }

  /**
   * Get current blockchain height
   */
  async getBlockHeight(): Promise<number> {
    const socket = await this.ensureConnection()
    return await getCurrentBlockHeight(socket)
  }

  /**
   * Get block hash for a specific height
   */
  async getBlockHash(height: number): Promise<string> {
    try {
      const socket = await this.ensureConnection()
      const response = await getBlockHash(height, socket)

      if (!response.result) {
        throw new Error(`No block hash found for height ${height}`)
      }

      return response.result
    } catch (error) {
      console.error(`[lightning-blockchain] Error getting block hash for height ${height}:`, error)
      throw error
    }
  }

  /**
   * Get transaction details by txid
   */
  async getTransaction(txid: string): Promise<Tx | null> {
    try {
      const socket = await this.ensureConnection()
      const response = await getTransaction(txid, true, socket)

      if (!response.result) {
        return null
      }

      return response.result
    } catch (error) {
      console.error(`[lightning-blockchain] Error getting transaction ${txid}:`, error)
      return null
    }
  }

  /**
   * Get balance for an address
   */
  async getAddressBalance(address: string): Promise<number> {
    try {
      return await getBalance(address)
    } catch (error) {
      console.error(`[lightning-blockchain] Error getting balance for ${address}:`, error)
      throw error
    }
  }

  /**
   * Get transaction history for an address
   */
  async getAddressTransactions(address: string, minConfirmations?: number): Promise<Tx[]> {
    try {
      const confirmations = minConfirmations ?? this.config.minConfirmations
      return await getTransactions(address, undefined, confirmations)
    } catch (error) {
      console.error(`[lightning-blockchain] Error getting transactions for ${address}:`, error)
      throw error
    }
  }

  /**
   * Get mempool transactions for addresses
   */
  async getMempoolTransactions(addresses: string[]): Promise<Tx[]> {
    try {
      return await getMempoolTransactions(addresses)
    } catch (error) {
      console.error('[lightning-blockchain] Error getting mempool transactions:', error)
      throw error
    }
  }

  /**
   * Estimate fee rate for target blocks
   */
  async estimateFeeRate(targetBlocks: number = 6): Promise<number> {
    try {
      return await estimateFeeRate(targetBlocks)
    } catch (error) {
      console.error(
        `[lightning-blockchain] Error estimating fee rate for ${targetBlocks} blocks:`,
        error,
      )
      throw error
    }
  }

  /**
   * Get recommended fee rates for different priorities
   */
  async getRecommendedFeeRates(): Promise<{
    slow: number
    normal: number
    fast: number
    urgent: number
  }> {
    try {
      return await getRecommendedFeeRates()
    } catch (error) {
      console.error('[lightning-blockchain] Error getting recommended fee rates:', error)
      throw error
    }
  }

  /**
   * Monitor address for new transactions
   * Note: This is a simplified implementation. In production, you'd want
   * proper subscription management with reconnection logic.
   */
  async subscribeToAddress(address: string, callback: (tx: Tx) => void): Promise<() => void> {
    try {
      const socket = await this.ensureConnection()

      // Convert address to scripthash
      const scripthash = await this.addressToScriptHash(address)

      // Subscribe to address updates
      const response = await callElectrumMethod<any>(
        'blockchain.scripthash.subscribe',
        [scripthash],
        socket,
      )

      if (response.result !== null) {
        console.log(`[lightning-blockchain] Subscribed to address ${address}`)
      }

      // Set up a polling mechanism since Electrum subscriptions require
      // listening to the socket for notifications
      const pollInterval = setInterval(async () => {
        try {
          const transactions = await this.getAddressTransactions(address, 0)
          const newTransactions = transactions.filter(tx => tx.confirmations === 0)

          newTransactions.forEach(callback)
        } catch (error) {
          console.error(`[lightning-blockchain] Error polling address ${address}:`, error)
        }
      }, 30000) // Poll every 30 seconds

      // Return unsubscribe function
      return () => {
        clearInterval(pollInterval)
        console.log(`[lightning-blockchain] Unsubscribed from address ${address}`)
      }
    } catch (error) {
      console.error(`[lightning-blockchain] Error subscribing to address ${address}:`, error)
      throw error
    }
  }

  /**
   * Monitor blockchain for new blocks
   */
  async subscribeToBlocks(callback: (height: number, hash: string) => void): Promise<() => void> {
    try {
      const socket = await this.ensureConnection()

      // Subscribe to block headers
      const response = await callElectrumMethod<{ height: number; hex: string }>(
        'blockchain.headers.subscribe',
        [],
        socket,
      )

      if (response.result) {
        const { height } = response.result
        const hash = await this.getBlockHash(height)
        callback(height, hash)
      }

      // Set up polling for new blocks
      let lastHeight = response.result?.height || 0
      const pollInterval = setInterval(async () => {
        try {
          const currentHeight = await this.getBlockHeight()
          if (currentHeight > lastHeight) {
            for (let h = lastHeight + 1; h <= currentHeight; h++) {
              const hash = await this.getBlockHash(h)
              callback(h, hash)
            }
            lastHeight = currentHeight
          }
        } catch (error) {
          console.error('[lightning-blockchain] Error polling for new blocks:', error)
        }
      }, 60000) // Poll every minute

      // Return unsubscribe function
      return () => {
        clearInterval(pollInterval)
        console.log('[lightning-blockchain] Unsubscribed from block notifications')
      }
    } catch (error) {
      console.error('[lightning-blockchain] Error subscribing to blocks:', error)
      throw error
    }
  }

  /**
   * Check if transaction is confirmed
   */
  async isTransactionConfirmed(txid: string, minConfirmations?: number): Promise<boolean> {
    try {
      const confirmations = await this.getTransactionConfirmations(txid)
      const required = minConfirmations ?? this.config.minConfirmations
      return confirmations >= required
    } catch (error) {
      console.error(`[lightning-blockchain] Error checking confirmation for ${txid}:`, error)
      return false
    }
  }

  /**
   * Get transaction confirmations
   */
  async getTransactionConfirmations(txid: string): Promise<number> {
    try {
      const tx = await this.getTransaction(txid)
      return tx?.confirmations || 0
    } catch (error) {
      console.error(`[lightning-blockchain] Error getting confirmations for ${txid}:`, error)
      return 0
    }
  }

  /**
   * Convert address to scripthash
   */
  private async addressToScriptHash(address: string): Promise<string> {
    // This is a simplified implementation
    // In production, you'd use proper address decoding
    try {
      // Simple implementation for demo purposes
      // In production, use a proper Bitcoin address library
      const crypto = await import('crypto')
      const hash = crypto.createHash('sha256').update(address).digest()
      return hash.reverse().toString('hex')
    } catch (error) {
      console.error('[lightning-blockchain] Error converting address to scripthash:', error)
      throw error
    }
  }

  /**
   * Close connections and cleanup resources
   */
  async close(): Promise<void> {
    if (this.socket) {
      try {
        close(this.socket)
        this.socket = null
        this.isConnected = false
        console.log('[lightning-blockchain] Connection closed')
      } catch (error) {
        console.error('[lightning-blockchain] Error closing connection:', error)
      }
    }

    // Clear subscriptions
    this.subscriptions.clear()
  }
}

// Singleton instance for easy access
export const blockchainClient = new ElectrumBlockchainClient()

// Utility functions
export async function initializeBlockchainClient(
  config?: BlockchainClientConfig,
): Promise<IBlockchainClient> {
  const client = new ElectrumBlockchainClient(config)
  // Test connection
  await client.getBlockHeight()
  return client
}

export async function getTransactionFeeEstimate(targetBlocks: number = 6): Promise<number> {
  return await blockchainClient.estimateFeeRate(targetBlocks)
}

export async function monitorChannelFunding(
  fundingAddress: string,
  onFundingDetected: (tx: Tx) => void,
): Promise<() => void> {
  console.log(`[lightning-blockchain] Monitoring funding address: ${fundingAddress}`)

  return await blockchainClient.subscribeToAddress(fundingAddress, tx => {
    // Check if this transaction funds the address
    const hasFundingOutput = tx.vout.some(vout => vout.scriptPubKey.address === fundingAddress)

    if (hasFundingOutput) {
      console.log(`[lightning-blockchain] Funding transaction detected: ${tx.txid}`)
      onFundingDetected(tx)
    }
  })
}

export async function waitForConfirmations(
  txid: string,
  requiredConfirmations: number = 6,
  timeoutMs: number = 3600000, // 1 hour
): Promise<boolean> {
  const startTime = Date.now()

  return new Promise(resolve => {
    const checkConfirmations = async () => {
      try {
        const confirmations = await blockchainClient.getTransactionConfirmations(txid)

        if (confirmations >= requiredConfirmations) {
          console.log(
            `[lightning-blockchain] Transaction ${txid} confirmed with ${confirmations} confirmations`,
          )
          resolve(true)
          return
        }

        // Check timeout
        if (Date.now() - startTime > timeoutMs) {
          console.warn(`[lightning-blockchain] Timeout waiting for confirmations on ${txid}`)
          resolve(false)
          return
        }

        // Continue checking
        setTimeout(checkConfirmations, 30000) // Check every 30 seconds
      } catch (error) {
        console.error(`[lightning-blockchain] Error checking confirmations for ${txid}:`, error)
        // Continue checking despite errors
        setTimeout(checkConfirmations, 30000)
      }
    }

    checkConfirmations()
  })
}

export async function broadcastTransaction(rawTxHex: string): Promise<string> {
  console.log(`[lightning-blockchain] Broadcasting transaction: ${rawTxHex.substring(0, 20)}...`)
  try {
    const txid = await broadcastTransactionElectrum(rawTxHex)
    console.log(`[lightning-blockchain] Transaction broadcasted successfully: ${txid}`)
    return txid
  } catch (error) {
    console.error('[lightning-blockchain] Error broadcasting transaction:', error)
    throw error
  }
}
