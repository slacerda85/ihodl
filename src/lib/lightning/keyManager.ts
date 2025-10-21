/**
 * Lightning Key Management System
 * Integrates existing key derivation with secure storage for Lightning node operations
 */

import {
  deriveExtendedLightningKey,
  deriveNodeKey,
  deriveLightningChannelKeyset,
  deriveFundingWalletAddress,
} from './keys'
import { mnemonicToSeedSync } from '../bip39'
import { uint8ArrayToHex } from '../crypto'
import { LightningSecureStorage, lightningSecureStorage } from './storage'
import { LightningChannelKeyset, LightningNodeKey } from './types'

/**
 * Lightning Key Manager
 * Manages the complete lifecycle of Lightning node keys with secure storage integration
 */
export class LightningKeyManager {
  private storage: LightningSecureStorage

  constructor(storage?: LightningSecureStorage) {
    this.storage = storage || lightningSecureStorage
  }

  /**
   * Initialize the key manager and storage
   */
  async initialize(): Promise<void> {
    await this.storage.initialize()
  }

  /**
   * Create a new Lightning node identity from seed phrase
   * @param seedPhrase - BIP39 seed phrase
   * @param passphrase - Optional passphrase for additional security
   * @param network - Network type (mainnet/testnet/regtest)
   * @returns Node identity information
   */
  async createNodeIdentity(
    seedPhrase: string,
    passphrase: string = '',
    network: 'mainnet' | 'testnet' | 'regtest' = 'mainnet',
  ): Promise<{
    nodeKey: LightningNodeKey
    nodeId: string
    fundingAddress: string
  }> {
    // Convert mnemonic to seed
    const seed = mnemonicToSeedSync(seedPhrase, passphrase)

    // Derive master Lightning key (BIP43 purpose 9735)
    const masterLightningKey = deriveExtendedLightningKey(seed)

    // Derive node key (index 0 for identity)
    const nodeKey = deriveNodeKey(masterLightningKey, 0)

    // Derive funding wallet address for channel funding
    const fundingWallet = deriveFundingWalletAddress(
      masterLightningKey,
      network === 'mainnet' ? 0 : 1,
    )

    // Store the seed securely
    await this.storage.storeNodeSeed(seed)

    // Store derived keys (less sensitive than seed)
    const derivedKeys = {
      nodePrivateKey: Array.from(nodeKey.privateKey),
      nodePublicKey: Array.from(nodeKey.publicKey),
      fundingAddress: fundingWallet.address,
      network,
      createdAt: Date.now(),
    }
    await this.storage.storeKeys(derivedKeys)

    return {
      nodeKey,
      nodeId: uint8ArrayToHex(nodeKey.publicKey),
      fundingAddress: fundingWallet.address,
    }
  }

  /**
   * Load existing Lightning node identity
   * @returns Node identity or null if not found
   */
  async loadNodeIdentity(): Promise<{
    nodeKey: LightningNodeKey
    nodeId: string
    fundingAddress: string
  } | null> {
    // Try to load seed first
    const seed = await this.storage.getNodeSeed()
    if (!seed) return null

    // Load derived keys
    const derivedKeys = await this.storage.getKeys()
    if (!derivedKeys) return null

    // Recreate node key from seed
    const masterLightningKey = deriveExtendedLightningKey(seed)
    const nodeKey = deriveNodeKey(masterLightningKey, 0)

    return {
      nodeKey,
      nodeId: uint8ArrayToHex(nodeKey.publicKey),
      fundingAddress: derivedKeys.fundingAddress,
    }
  }

  /**
   * Generate channel keyset for a new channel
   * @param channelIndex - Unique index for this channel
   * @returns Complete channel keyset with all basepoints
   */
  async generateChannelKeyset(channelIndex: number): Promise<LightningChannelKeyset> {
    const seed = await this.storage.getNodeSeed()
    if (!seed) {
      throw new Error('No Lightning node seed found. Initialize node identity first.')
    }

    const masterLightningKey = deriveExtendedLightningKey(seed)

    // Generate a proper 32-byte channel ID from the channel index
    // In practice, this would be the actual channel funding txid + output index
    const channelIdBytes = new Uint8Array(32)
    // Use the channel index as the last 4 bytes, rest are zero for simplicity
    const indexBytes = new Uint8Array(new Uint32Array([channelIndex]).buffer)
    channelIdBytes.set(indexBytes, 28)

    const channelKeyset = deriveLightningChannelKeyset(masterLightningKey, channelIdBytes)

    // Store channel keyset securely
    const channelKeys = {
      [`channel_${channelIndex}`]: {
        fundingPrivateKey: Array.from(channelKeyset.fundingPrivateKey),
        paymentPrivateKey: Array.from(channelKeyset.paymentPrivateKey),
        delayedPrivateKey: Array.from(channelKeyset.delayedPrivateKey),
        revocationPrivateKey: Array.from(channelKeyset.revocationPrivateKey),
        htlcPrivateKey: Array.from(channelKeyset.htlcPrivateKey),
        ptlcPrivateKey: Array.from(channelKeyset.ptlcPrivateKey),
        perCommitmentPrivateKey: Array.from(channelKeyset.perCommitmentPrivateKey),
        createdAt: Date.now(),
      },
    }

    // Merge with existing keys
    const existingKeys = (await this.storage.getKeys()) || {}
    await this.storage.storeKeys({ ...existingKeys, ...channelKeys })

    return channelKeyset
  }

  async getChannelKeyset(channelIndex: number): Promise<LightningChannelKeyset | null> {
    const keys = await this.storage.getKeys()
    if (!keys || !keys[`channel_${channelIndex}`]) return null

    const channelData = keys[`channel_${channelIndex}`]

    // Generate the same channelId as used during generation
    const channelIdBytes = new Uint8Array(32)
    const indexBytes = new Uint8Array(new Uint32Array([channelIndex]).buffer)
    channelIdBytes.set(indexBytes, 28)
    const channelId = Array.from(channelIdBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    return {
      channelId,
      fundingPrivateKey: new Uint8Array(channelData.fundingPrivateKey),
      paymentPrivateKey: new Uint8Array(channelData.paymentPrivateKey),
      delayedPrivateKey: new Uint8Array(channelData.delayedPrivateKey),
      revocationPrivateKey: new Uint8Array(channelData.revocationPrivateKey),
      htlcPrivateKey: new Uint8Array(channelData.htlcPrivateKey),
      ptlcPrivateKey: new Uint8Array(channelData.ptlcPrivateKey),
      perCommitmentPrivateKey: new Uint8Array(channelData.perCommitmentPrivateKey),
    }
  }

  /**
   * Generate per-commitment secret for a specific commitment number
   * @param channelIndex - Channel index
   * @param commitmentNumber - Commitment number (0 for initial)
   * @returns Per-commitment secret
   */
  async generatePerCommitmentSecret(
    channelIndex: number,
    commitmentNumber: number,
  ): Promise<Uint8Array> {
    const seed = await this.storage.getNodeSeed()
    if (!seed) {
      throw new Error('No Lightning node seed found')
    }

    const masterLightningKey = deriveExtendedLightningKey(seed)

    // Generate a proper 32-byte channel ID from the channel index
    const channelIdBytes = new Uint8Array(32)
    const indexBytes = new Uint8Array(new Uint32Array([channelIndex]).buffer)
    channelIdBytes.set(indexBytes, 28)

    // Per-commitment secrets are derived from the per-commitment basepoint
    // This is a simplified implementation - in practice, you'd use the actual
    // per-commitment derivation algorithm from BOLT 3
    const perCommitmentKey = deriveLightningChannelKeyset(
      masterLightningKey,
      channelIdBytes,
    ).perCommitmentPrivateKey

    // For now, return the base per-commitment key
    // In a full implementation, you'd derive commitment-specific secrets
    return perCommitmentKey
  }

  /**
   * Check if Lightning node identity exists
   * @returns True if identity exists
   */
  async hasNodeIdentity(): Promise<boolean> {
    return await this.storage.hasNodeData()
  }

  /**
   * Clear all Lightning keys and data
   */
  async clearAllKeys(): Promise<void> {
    await this.storage.clearAll()
  }

  /**
   * Export encrypted backup of all keys
   * @returns Encrypted backup string
   */
  async exportKeyBackup(): Promise<string> {
    return await this.storage.exportBackup()
  }

  /**
   * Import keys from encrypted backup
   * @param backupData - Encrypted backup string
   */
  async importKeyBackup(backupData: string): Promise<void> {
    await this.storage.importBackup(backupData)
  }
}

// Singleton instance
export const lightningKeyManager = new LightningKeyManager()

// Utility functions for easy access
export async function initializeLightningKeys(): Promise<void> {
  await lightningKeyManager.initialize()
}

export async function createLightningNode(
  seedPhrase: string,
  passphrase?: string,
  network?: 'mainnet' | 'testnet' | 'regtest',
): Promise<{ nodeId: string; fundingAddress: string }> {
  const result = await lightningKeyManager.createNodeIdentity(seedPhrase, passphrase, network)
  return {
    nodeId: result.nodeId,
    fundingAddress: result.fundingAddress,
  }
}

export async function loadLightningNode(): Promise<{
  nodeId: string
  fundingAddress: string
} | null> {
  const result = await lightningKeyManager.loadNodeIdentity()
  if (!result) return null

  return {
    nodeId: result.nodeId,
    fundingAddress: result.fundingAddress,
  }
}

export async function generateChannelKeys(channelIndex: number): Promise<LightningChannelKeyset> {
  return await lightningKeyManager.generateChannelKeyset(channelIndex)
}

export async function hasLightningKeys(): Promise<boolean> {
  return await lightningKeyManager.hasNodeIdentity()
}
