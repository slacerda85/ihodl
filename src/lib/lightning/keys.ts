import {
  createHardenedIndex,
  deriveChildPrivateKey,
  splitRootExtendedKey,
  createPublicKey,
} from '@/lib/key'
import { createSegwitAddress } from '@/lib/address'
import { uint8ArrayToHex } from '@/lib/crypto'

// Lightning Network constants
export const LIGHTNING_PURPOSE = 9735 // BIP-43 purpose for Lightning
export const LIGHTNING_CHAIN_BITCOIN = 0 // Bitcoin mainnet
export const LIGHTNING_CHAIN_TESTNET = 1 // Bitcoin testnet
export const LN_VER_BOLT = 0 // BOLT-defined Lightning channels
export const LN_VER_BIFROST = 1 // Bifrost channels

// Basepoint indices
export const BASEPOINT_FUNDING = 0
export const BASEPOINT_PAYMENT = 1
export const BASEPOINT_DELAYED = 2
export const BASEPOINT_REVOCATION = 3
export const BASEPOINT_HTLC = 5
export const BASEPOINT_PTLC = 6

/**
 * Represents a Lightning channel keyset with all basepoints
 */
export interface LightningChannelKeyset {
  /** Channel ID */
  channelId: string
  /** Funding basepoint private key */
  fundingPrivateKey: Uint8Array
  /** Payment basepoint private key */
  paymentPrivateKey: Uint8Array
  /** Delayed basepoint private key */
  delayedPrivateKey: Uint8Array
  /** Revocation basepoint private key */
  revocationPrivateKey: Uint8Array
  /** HTLC basepoint private key */
  htlcPrivateKey: Uint8Array
  /** PTLC basepoint private key */
  ptlcPrivateKey: Uint8Array
  /** Per-commitment basepoint private key (for commitment #0) */
  perCommitmentPrivateKey: Uint8Array
}

/**
 * Represents a Lightning node key
 */
export interface LightningNodeKey {
  /** Node index */
  nodeIndex: number
  /** Node private key */
  privateKey: Uint8Array
  /** Node public key */
  publicKey: Uint8Array
}

/**
 * Derives the extended lightning key from a master extended key
 * @param masterExtendedKey - The master extended private key (64 bytes)
 * @returns The extended lightning key (64 bytes)
 */
export function deriveExtendedLightningKey(masterExtendedKey: Uint8Array): Uint8Array {
  const purposeIndex = createHardenedIndex(LIGHTNING_PURPOSE)
  return deriveChildPrivateKey(masterExtendedKey, purposeIndex)
}

/**
 * Derives a node key for a Lightning node
 * @param extendedLightningKey - The extended lightning key
 * @param chain - The blockchain (0 for Bitcoin mainnet, 1 for testnet)
 * @param nodeIndex - The node index (0-based)
 * @returns The node key information
 */
export function deriveNodeKey(
  extendedLightningKey: Uint8Array,
  chain: number = LIGHTNING_CHAIN_BITCOIN,
  nodeIndex: number = 0,
): LightningNodeKey {
  const chainIndex = createHardenedIndex(chain)
  const chainExtendedKey = deriveChildPrivateKey(extendedLightningKey, chainIndex)

  const nodeBranchIndex = createHardenedIndex(0) // Node branch
  const nodeBranchExtendedKey = deriveChildPrivateKey(chainExtendedKey, nodeBranchIndex)

  const nodeIndexHardened = createHardenedIndex(nodeIndex)
  const nodeExtendedKey = deriveChildPrivateKey(nodeBranchExtendedKey, nodeIndexHardened)

  const { privateKey } = splitRootExtendedKey(nodeExtendedKey)
  const publicKey = createPublicKey(privateKey)

  return {
    nodeIndex,
    privateKey,
    publicKey,
  }
}

/**
 * Constructs a channel index from channel ID bits
 * Uses bits 1-32 of the channel ID (zero-based indexing, skipping MSB)
 * @param channelId - The channel ID as a hex string or Uint8Array
 * @returns The hardened channel index
 */
export function constructChannelIndex(channelId: string | Uint8Array): number {
  let channelIdBytes: Uint8Array

  if (typeof channelId === 'string') {
    // Assume hex string
    if (channelId.startsWith('0x')) {
      channelId = channelId.slice(2)
    }
    channelIdBytes = new Uint8Array(channelId.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)))
  } else {
    channelIdBytes = channelId
  }

  if (channelIdBytes.length !== 32) {
    throw new Error('Channel ID must be 32 bytes')
  }

  // Extract bits 1-32 (skip MSB which is the hardening bit)
  // Take bytes 1-4 (since we need 32 bits, which is 4 bytes)
  const relevantBytes = channelIdBytes.slice(1, 5)

  // Convert to number (big-endian)
  let channelIndex = 0
  for (let i = 0; i < relevantBytes.length; i++) {
    channelIndex = (channelIndex << 8) | relevantBytes[i]
  }

  // Ensure it's not zero and within valid range
  if (channelIndex === 0) {
    channelIndex = 1 // Avoid index 0
  }

  return createHardenedIndex(channelIndex)
}

/**
 * Derives the channel basepoint from extended lightning key
 * @param extendedLightningKey - The extended lightning key
 * @param chain - The blockchain (0 for Bitcoin mainnet, 1 for testnet)
 * @param lnVer - Lightning version (0 for BOLT, 1 for Bifrost)
 * @param channelId - The channel ID
 * @returns The channel basepoint extended key
 */
export function deriveChannelBasepoint(
  extendedLightningKey: Uint8Array,
  chain: number = LIGHTNING_CHAIN_BITCOIN,
  lnVer: number = LN_VER_BOLT,
  channelId: string | Uint8Array,
): Uint8Array {
  const chainIndex = createHardenedIndex(chain)
  const chainExtendedKey = deriveChildPrivateKey(extendedLightningKey, chainIndex)

  const channelBranchIndex = createHardenedIndex(1) // Channel branch
  const channelBranchExtendedKey = deriveChildPrivateKey(chainExtendedKey, channelBranchIndex)

  const lnVerIndex = createHardenedIndex(lnVer)
  const lnVerExtendedKey = deriveChildPrivateKey(channelBranchExtendedKey, lnVerIndex)

  const channelIndex = constructChannelIndex(channelId)
  return deriveChildPrivateKey(lnVerExtendedKey, channelIndex)
}

/**
 * Derives a specific basepoint from the channel basepoint
 * @param channelBasepoint - The channel basepoint extended key
 * @param basepointIndex - The basepoint index (0-6)
 * @returns The basepoint private key
 */
export function deriveBasepoint(channelBasepoint: Uint8Array, basepointIndex: number): Uint8Array {
  const basepointExtendedKey = deriveChildPrivateKey(channelBasepoint, basepointIndex)
  const { privateKey } = splitRootExtendedKey(basepointExtendedKey)
  return privateKey
}

/**
 * Derives the per-commitment basepoint for a specific commitment number
 * @param channelBasepoint - The channel basepoint extended key
 * @param commitmentNumber - The commitment number (default 0)
 * @returns The per-commitment private key
 */
export function derivePerCommitmentBasepoint(
  channelBasepoint: Uint8Array,
  commitmentNumber: number = 0,
): Uint8Array {
  const perCommitmentBranchIndex = 4 // Per-commitment branch
  const perCommitmentBranchExtendedKey = deriveChildPrivateKey(
    channelBasepoint,
    perCommitmentBranchIndex,
  )

  // Per-commitment uses unhardened derivation
  const perCommitmentExtendedKey = deriveChildPrivateKey(
    perCommitmentBranchExtendedKey,
    commitmentNumber,
  )
  const { privateKey } = splitRootExtendedKey(perCommitmentExtendedKey)
  return privateKey
}

/**
 * Derives a complete Lightning channel keyset
 * @param masterExtendedKey - The master extended private key
 * @param channelId - The channel ID
 * @param chain - The blockchain (default Bitcoin mainnet)
 * @param lnVer - Lightning version (default BOLT)
 * @param commitmentNumber - The commitment number (default 0)
 * @returns The complete channel keyset
 */
export function deriveLightningChannelKeyset(
  masterExtendedKey: Uint8Array,
  channelId: string | Uint8Array,
  chain: number = LIGHTNING_CHAIN_BITCOIN,
  lnVer: number = LN_VER_BOLT,
  commitmentNumber: number = 0,
): LightningChannelKeyset {
  const extendedLightningKey = deriveExtendedLightningKey(masterExtendedKey)
  const channelBasepoint = deriveChannelBasepoint(extendedLightningKey, chain, lnVer, channelId)

  return {
    channelId:
      typeof channelId === 'string'
        ? channelId
        : Array.from(channelId)
            .map(b => b.toString(16).padStart(2, '0'))
            .join(''),
    fundingPrivateKey: deriveBasepoint(channelBasepoint, BASEPOINT_FUNDING),
    paymentPrivateKey: deriveBasepoint(channelBasepoint, BASEPOINT_PAYMENT),
    delayedPrivateKey: deriveBasepoint(channelBasepoint, BASEPOINT_DELAYED),
    revocationPrivateKey: deriveBasepoint(channelBasepoint, BASEPOINT_REVOCATION),
    htlcPrivateKey: deriveBasepoint(channelBasepoint, BASEPOINT_HTLC),
    ptlcPrivateKey: deriveBasepoint(channelBasepoint, BASEPOINT_PTLC),
    perCommitmentPrivateKey: derivePerCommitmentBasepoint(channelBasepoint, commitmentNumber),
  }
}

/**
 * Derives a funding wallet extended key for Lightning Network
 * @param masterExtendedKey - The master extended private key
 * @param chain - The blockchain (default Bitcoin mainnet)
 * @param caseIndex - The case index (equivalent to change field)
 * @param addressIndex - The address index
 * @returns The funding wallet extended key
 */
export function deriveFundingWallet(
  masterExtendedKey: Uint8Array,
  chain: number = LIGHTNING_CHAIN_BITCOIN,
  caseIndex: number = 0,
  addressIndex: number = 0,
): Uint8Array {
  // LNPBP-46: m/9735'/chain'/2'/case/index
  const lightningExtendedKey = deriveExtendedLightningKey(masterExtendedKey)
  const chainExtendedKey = deriveChildPrivateKey(lightningExtendedKey, createHardenedIndex(chain))
  const fundingExtendedKey = deriveChildPrivateKey(chainExtendedKey, createHardenedIndex(2))
  const caseExtendedKey = deriveChildPrivateKey(fundingExtendedKey, caseIndex)
  const addressExtendedKey = deriveChildPrivateKey(caseExtendedKey, addressIndex)

  return addressExtendedKey
}

/**
 * Derives a funding wallet address for Lightning Network
 * @param masterExtendedKey - The master extended private key
 * @param chain - The blockchain (default Bitcoin mainnet)
 * @param caseIndex - The case index (equivalent to change field)
 * @param addressIndex - The address index
 * @returns The funding wallet address and extended key
 */
export function deriveFundingWalletAddress(
  masterExtendedKey: Uint8Array,
  chain: number = LIGHTNING_CHAIN_BITCOIN,
  caseIndex: number = 0,
  addressIndex: number = 0,
): { address: string; extendedKey: Uint8Array; privateKey: Uint8Array; publicKey: Uint8Array } {
  const fundingExtendedKey = deriveFundingWallet(masterExtendedKey, chain, caseIndex, addressIndex)
  const { privateKey } = splitRootExtendedKey(fundingExtendedKey)
  const publicKey = createPublicKey(privateKey)
  const address = createSegwitAddress(publicKey)

  return {
    address,
    extendedKey: fundingExtendedKey,
    privateKey,
    publicKey,
  }
}

/**
 * Generates multiple funding wallet addresses for a Lightning node
 * @param masterExtendedKey - The master extended private key
 * @param chain - The blockchain
 * @param caseIndex - The case index
 * @param startIndex - Starting address index
 * @param count - Number of addresses to generate
 * @returns Array of funding addresses with their keys
 */
export function generateFundingWalletAddresses(
  masterExtendedKey: Uint8Array,
  chain: number = LIGHTNING_CHAIN_BITCOIN,
  caseIndex: number = 0,
  startIndex: number = 0,
  count: number = 20,
): {
  address: string
  extendedKey: Uint8Array
  privateKey: Uint8Array
  publicKey: Uint8Array
  index: number
}[] {
  const addresses = []

  for (let i = startIndex; i < startIndex + count; i++) {
    const result = deriveFundingWalletAddress(masterExtendedKey, chain, caseIndex, i)
    addresses.push({
      ...result,
      index: i,
    })
  }

  return addresses
}

/**
 * Derives a node address for Lightning Network node identification
 * @param masterExtendedKey - The master extended private key
 * @param chain - The blockchain
 * @param nodeIndex - The node index
 * @returns The node address and keys
 */
export function deriveNodeAddress(
  masterExtendedKey: Uint8Array,
  chain: number = LIGHTNING_CHAIN_BITCOIN,
  nodeIndex: number = 0,
): { address: string; privateKey: Uint8Array; publicKey: Uint8Array; nodeId: string } {
  const nodeKey = deriveNodeKey(masterExtendedKey, chain, nodeIndex)
  const address = createSegwitAddress(nodeKey.publicKey)
  const nodeId = uint8ArrayToHex(nodeKey.publicKey)

  return {
    address,
    privateKey: nodeKey.privateKey,
    publicKey: nodeKey.publicKey,
    nodeId,
  }
}

/**
 * Derives and securely stores a complete Lightning channel keyset
 * @param masterExtendedKey - The master extended private key
 * @param channelId - The channel ID
 * @param walletId - The wallet identifier
 * @param password - User password for encryption
 * @param chain - The blockchain (default Bitcoin mainnet)
 * @param lnVer - Lightning version (default BOLT)
 * @param commitmentNumber - The commitment number (default 0)
 * @returns Promise resolving to the channel keyset
 */
export async function deriveAndStoreLightningChannelKeyset(
  masterExtendedKey: Uint8Array,
  channelId: string | Uint8Array,
  walletId: string,
  password: string,
  chain: number = LIGHTNING_CHAIN_BITCOIN,
  lnVer: number = LN_VER_BOLT,
  commitmentNumber: number = 0,
): Promise<LightningChannelKeyset> {
  const keyset = deriveLightningChannelKeyset(
    masterExtendedKey,
    channelId,
    chain,
    lnVer,
    commitmentNumber,
  )

  // Note: Channel seeds are no longer stored separately - they can be derived from the wallet seed
  // This function now just returns the derived keyset

  return keyset
}

/**
 * Retrieves a stored Lightning channel keyset
 * @param masterExtendedKey - The master extended private key (for derivation)
 * @param channelId - The channel ID
 * @param walletId - The wallet identifier
 * @param password - User password for decryption
 * @param chain - The blockchain (default Bitcoin mainnet)
 * @param lnVer - Lightning version (default BOLT)
 * @param commitmentNumber - The commitment number (default 0)
 * @returns Promise resolving to the channel keyset
 */
export async function retrieveLightningChannelKeyset(
  masterExtendedKey: Uint8Array,
  channelId: string | Uint8Array,
  walletId: string,
  password: string,
  chain: number = LIGHTNING_CHAIN_BITCOIN,
  lnVer: number = LN_VER_BOLT,
  commitmentNumber: number = 0,
): Promise<LightningChannelKeyset> {
  // Since we no longer store channel seeds separately, we always derive fresh keysets
  return deriveAndStoreLightningChannelKeyset(
    masterExtendedKey,
    channelId,
    walletId,
    password,
    chain,
    lnVer,
    commitmentNumber,
  )
}
