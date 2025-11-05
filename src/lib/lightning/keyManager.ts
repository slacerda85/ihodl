/**
 * Lightning Key Manager
 * Manages Lightning Network keys and identities
 */

import { LightningSecureStorage } from './storage'
import { mnemonicToSeed } from '../bip39'

export interface NodeIdentity {
  nodeKey: Uint8Array
  nodeId: string
  fundingAddress: string
}

export interface ChannelKeyset {
  channelId: string
  fundingPrivateKey: Uint8Array
  paymentPrivateKey: Uint8Array
  delayedPrivateKey: Uint8Array
  revocationPrivateKey: Uint8Array
  htlcPrivateKey: Uint8Array
  ptlcPrivateKey: Uint8Array
  perCommitmentPrivateKey: Uint8Array
}

export class LightningKeyManager {
  private storage: LightningSecureStorage
  private initialized = false

  constructor(storage: LightningSecureStorage) {
    this.storage = storage
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    await this.storage.initialize()
    this.initialized = true
  }

  async createNodeIdentity(
    seedPhrase: string,
    passphrase: string = '',
    network: 'mainnet' | 'testnet' | 'regtest' = 'testnet',
  ): Promise<NodeIdentity> {
    await this.initialize()

    // Derive seed with passphrase
    const seed = await mnemonicToSeed(seedPhrase, passphrase)

    // Store the seed
    await this.storage.storeNodeSeed(seed)

    // Derive Lightning keys from seed (simplified - would use proper derivation)
    const mockNodeId =
      '02' +
      Array.from(seed.slice(0, 32))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .substring(0, 64)

    const fundingAddress = `bc1q${mockNodeId.substring(2, 40)}`

    return {
      nodeKey: seed,
      nodeId: mockNodeId,
      fundingAddress,
    }
  }

  async loadNodeIdentity(): Promise<NodeIdentity | null> {
    await this.initialize()

    const seed = await this.storage.getNodeSeed()
    if (!seed) return null

    // Derive Lightning keys from the stored seed
    // For now, we'll use a mock derivation since we don't have the original seed phrase
    // In a real implementation, we'd need to store the seed phrase or derive deterministically
    const mockNodeId =
      '02' +
      Array.from(seed.slice(0, 32))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .substring(0, 64)

    const mockFundingAddress = `bc1q${mockNodeId.substring(2, 40)}`

    return {
      nodeKey: seed,
      nodeId: mockNodeId,
      fundingAddress: mockFundingAddress,
    }
  }

  async generateChannelKeyset(channelIndex: number): Promise<ChannelKeyset> {
    await this.initialize()

    const identity = await this.loadNodeIdentity()
    if (!identity) {
      throw new Error('No Lightning node seed found')
    }

    // Generate channel ID as 64-character hex string (32 bytes)
    const channelId = Array.from(identity.nodeKey.slice(0, 32))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 64)

    // Generate mock private keys (in real implementation, would derive properly)
    const mockPrivateKey = new Uint8Array(32)
    for (let i = 0; i < 32; i++) {
      mockPrivateKey[i] = Math.floor(Math.random() * 256)
    }

    const keyset: ChannelKeyset = {
      channelId,
      fundingPrivateKey: mockPrivateKey.slice(),
      paymentPrivateKey: mockPrivateKey.slice(),
      delayedPrivateKey: mockPrivateKey.slice(),
      revocationPrivateKey: mockPrivateKey.slice(),
      htlcPrivateKey: mockPrivateKey.slice(),
      ptlcPrivateKey: mockPrivateKey.slice(),
      perCommitmentPrivateKey: mockPrivateKey.slice(),
    }

    // Store the keyset (simplified storage)
    const existingKeys = (await this.storage.getKeys()) || {}
    existingKeys[`channel_${channelIndex}`] = {
      ...keyset,
      fundingPrivateKey: Array.from(keyset.fundingPrivateKey),
      paymentPrivateKey: Array.from(keyset.paymentPrivateKey),
      delayedPrivateKey: Array.from(keyset.delayedPrivateKey),
      revocationPrivateKey: Array.from(keyset.revocationPrivateKey),
      htlcPrivateKey: Array.from(keyset.htlcPrivateKey),
      ptlcPrivateKey: Array.from(keyset.ptlcPrivateKey),
      perCommitmentPrivateKey: Array.from(keyset.perCommitmentPrivateKey),
    }
    await this.storage.storeKeys(existingKeys)

    return keyset
  }

  async getChannelKeyset(channelIndex: number): Promise<ChannelKeyset | null> {
    await this.initialize()

    const keys = await this.storage.getKeys()
    if (!keys) return null

    const storedKeyset = keys[`channel_${channelIndex}`]
    if (!storedKeyset) return null

    // Convert arrays back to Uint8Arrays
    return {
      ...storedKeyset,
      fundingPrivateKey: new Uint8Array(storedKeyset.fundingPrivateKey),
      paymentPrivateKey: new Uint8Array(storedKeyset.paymentPrivateKey),
      delayedPrivateKey: new Uint8Array(storedKeyset.delayedPrivateKey),
      revocationPrivateKey: new Uint8Array(storedKeyset.revocationPrivateKey),
      htlcPrivateKey: new Uint8Array(storedKeyset.htlcPrivateKey),
      ptlcPrivateKey: new Uint8Array(storedKeyset.ptlcPrivateKey),
      perCommitmentPrivateKey: new Uint8Array(storedKeyset.perCommitmentPrivateKey),
    }
  }

  async generatePerCommitmentSecret(
    channelIndex: number,
    commitmentNumber: number,
  ): Promise<Uint8Array> {
    await this.initialize()

    const identity = await this.loadNodeIdentity()
    if (!identity) {
      throw new Error('No Lightning node seed found')
    }

    // Generate mock secret (in real implementation, would use proper derivation)
    const secret = new Uint8Array(32)
    for (let i = 0; i < 32; i++) {
      secret[i] = Math.floor(Math.random() * 256)
    }

    return secret
  }

  async hasNodeIdentity(): Promise<boolean> {
    await this.initialize()
    return await this.storage.hasNodeData()
  }

  async exportKeyBackup(): Promise<string> {
    await this.initialize()
    return await this.storage.exportBackup()
  }

  async importKeyBackup(backup: string): Promise<void> {
    await this.initialize()
    await this.storage.importBackup(backup)
  }

  async clearAllKeys(): Promise<void> {
    await this.initialize()
    await this.storage.clearAll()
  }
}
