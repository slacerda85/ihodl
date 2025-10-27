/**
 * Blockchain Module
 * Core blockchain functionality for Lightning Network operations
 */

// Types
export type { BlockHeader, MerkleProof, IBlockchainClient, BlockchainClientConfig } from './types'

// Constants
export { CONSENSUS_PARAMS } from './constants'

// Utility functions
export {
  hexToUint8ArrayBE,
  targetToCompact,
  uint8ArraysEqual,
  concatUint8Arrays,
  computeBlockHash,
  bitsToTarget,
  verifyProofOfWork,
  validateBlockHeader,
  computeMerkleRoot,
  verifyMerkleProof,
} from './utils'

// Storage functions
export {
  storeBlockHeader,
  getBlockHeader,
  getBlockHeaderByHeight,
  getLastSyncedHeader,
  clearStoredHeaders,
} from './storage'

// Validation functions
export {
  verifyTransaction,
  getMedianTimePast,
  getNextWorkRequired,
  calculateNextWorkRequired,
} from './validation'

// Synchronization functions
export { getCurrentBlockHeight, getBlockHeaderFromElectrum, syncHeaders } from './sync'

// Client implementations
export {
  ElectrumBlockchainClient,
  blockchainClient,
  initializeBlockchainClient,
  getTransactionFeeEstimate,
  monitorChannelFunding,
  waitForConfirmations,
  broadcastTransaction,
} from './client'

// Client factory functions
export {
  createBlockchainClient,
  createElectrumClient,
  createBlockchainClientWithTest,
} from './clients'
