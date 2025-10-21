import { ElectrumBlockchainClient } from './client'
import type { IBlockchainClient, BlockchainClientConfig } from './types'

/**
 * Creates a blockchain client for the specified type
 */
export function createBlockchainClient(config: BlockchainClientConfig = {}): IBlockchainClient {
  // Currently only Electrum is supported
  return new ElectrumBlockchainClient(config)
}

/**
 * Creates an Electrum blockchain client with default configuration
 */
export function createElectrumClient(config: BlockchainClientConfig = {}): IBlockchainClient {
  return new ElectrumBlockchainClient(config)
}

/**
 * Creates a blockchain client with connection test
 */
export async function createBlockchainClientWithTest(
  config: BlockchainClientConfig = {},
): Promise<IBlockchainClient> {
  const client = new ElectrumBlockchainClient(config)

  try {
    // Test connection by getting block height
    await client.getBlockHeight()
    console.log('[blockchain-client] Connection test successful')
  } catch (error) {
    console.error('[blockchain-client] Connection test failed:', error)
    throw new Error(`Failed to create blockchain client: ${error}`)
  }

  return client
}
