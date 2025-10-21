/**
 * Blockchain Types and Interfaces
 * Core data structures for Bitcoin blockchain operations
 */

/**
 * Block header structure as defined in Bitcoin protocol
 */
export interface BlockHeader {
  /** Block version */
  version: number
  /** Hash of the previous block header (32 bytes) */
  previousBlockHash: Uint8Array
  /** Merkle root of the transaction tree (32 bytes) */
  merkleRoot: Uint8Array
  /** Block timestamp in Unix epoch time */
  timestamp: number
  /** Compact representation of the target difficulty */
  bits: number
  /** Nonce used for proof-of-work */
  nonce: number
  /** Block height in the blockchain (optional, for stored headers) */
  height?: number
  /** Computed hash of this header (optional, computed on demand) */
  hash?: Uint8Array
}

/**
 * Merkle proof for transaction inclusion verification
 */
export interface MerkleProof {
  /** Hash of the transaction to verify */
  txHash: Uint8Array
  /** Array of sibling hashes in the Merkle tree */
  proof: Uint8Array[]
  /** Position of the transaction in the block (0-based index) */
  position: number
}

/**
 * Blockchain client interface for Lightning Network operations
 */
export interface IBlockchainClient {
  /**
   * Get current blockchain height
   */
  getBlockHeight(): Promise<number>

  /**
   * Get block hash for a specific height
   */
  getBlockHash(height: number): Promise<string>

  /**
   * Get transaction details by txid
   */
  getTransaction(txid: string): Promise<any | null>

  /**
   * Get balance for an address
   */
  getAddressBalance(address: string): Promise<number>

  /**
   * Get transaction history for an address
   */
  getAddressTransactions(address: string, minConfirmations?: number): Promise<any[]>

  /**
   * Get mempool transactions for addresses
   */
  getMempoolTransactions(addresses: string[]): Promise<any[]>

  /**
   * Estimate fee rate for target blocks
   */
  estimateFeeRate(targetBlocks?: number): Promise<number>

  /**
   * Get recommended fee rates for different priorities
   */
  getRecommendedFeeRates(): Promise<{
    slow: number
    normal: number
    fast: number
    urgent: number
  }>

  /**
   * Monitor address for new transactions
   */
  subscribeToAddress(address: string, callback: (tx: any) => void): Promise<() => void>

  /**
   * Monitor blockchain for new blocks
   */
  subscribeToBlocks(callback: (height: number, hash: string) => void): Promise<() => void>

  /**
   * Check if transaction is confirmed
   */
  isTransactionConfirmed(txid: string, minConfirmations?: number): Promise<boolean>

  /**
   * Get transaction confirmations
   */
  getTransactionConfirmations(txid: string): Promise<number>

  /**
   * Close connections and cleanup resources
   */
  close(): Promise<void>
}

/**
 * Configuration for blockchain client
 */
export interface BlockchainClientConfig {
  /** Network type */
  network?: 'mainnet' | 'testnet' | 'regtest'
  /** Connection timeout */
  timeout?: number
  /** Minimum confirmations for transactions */
  minConfirmations?: number
  /** Whether to use persistent connections */
  persistentConnection?: boolean
}
