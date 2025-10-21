/**
 * Tests for Lightning Key Manager
 * Tests the integration of key derivation with secure storage
 */

import { LightningKeyManager } from '../lib/lightning/keyManager'
import { LightningSecureStorage } from '../lib/lightning/storage'
import { generateMnemonic } from '../lib/bip39'

describe('LightningKeyManager', () => {
  let keyManager: LightningKeyManager

  beforeEach(() => {
    const storage = new LightningSecureStorage({ namespace: 'test' })
    keyManager = new LightningKeyManager(storage)
  })

  afterEach(async () => {
    await keyManager.clearAllKeys()
  })

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await expect(keyManager.initialize()).resolves.toBeUndefined()
    })
  })

  describe('node identity creation', () => {
    it('should create a new Lightning node identity', async () => {
      await keyManager.initialize()

      const seedPhrase = generateMnemonic()
      const result = await keyManager.createNodeIdentity(seedPhrase, '', 'testnet')

      expect(result).toHaveProperty('nodeKey')
      expect(result).toHaveProperty('nodeId')
      expect(result).toHaveProperty('fundingAddress')
      expect(typeof result.nodeId).toBe('string')
      expect(result.fundingAddress).toMatch(/^bc1q/) // Mainnet Bech32 address (default network)
    })

    it('should create identity with passphrase', async () => {
      await keyManager.initialize()

      const seedPhrase = generateMnemonic()
      const result1 = await keyManager.createNodeIdentity(seedPhrase, '', 'testnet')
      await keyManager.clearAllKeys()

      const result2 = await keyManager.createNodeIdentity(seedPhrase, 'test-passphrase', 'testnet')

      // Different passphrase should result in different keys
      expect(result1.nodeId).not.toBe(result2.nodeId)
      expect(result1.fundingAddress).not.toBe(result2.fundingAddress)
    })
  })

  describe('node identity loading', () => {
    it('should load existing node identity', async () => {
      await keyManager.initialize()

      const seedPhrase = generateMnemonic()
      const created = await keyManager.createNodeIdentity(seedPhrase, '', 'testnet')

      const loaded = await keyManager.loadNodeIdentity()

      expect(loaded).toBeTruthy()
      expect(loaded!.nodeId).toBe(created.nodeId)
      expect(loaded!.fundingAddress).toBe(created.fundingAddress)
    })

    it('should return null for non-existent identity', async () => {
      await keyManager.initialize()

      const loaded = await keyManager.loadNodeIdentity()
      expect(loaded).toBeNull()
    })
  })

  describe('channel keyset generation', () => {
    it('should generate channel keyset', async () => {
      await keyManager.initialize()

      const seedPhrase = generateMnemonic()
      await keyManager.createNodeIdentity(seedPhrase)

      const keyset = await keyManager.generateChannelKeyset(0)

      expect(keyset).toHaveProperty('channelId')
      expect(typeof keyset.channelId).toBe('string')
      expect(keyset.channelId.length).toBe(64) // 32 bytes in hex
      expect(keyset).toHaveProperty('fundingPrivateKey')
      expect(keyset).toHaveProperty('paymentPrivateKey')
      expect(keyset).toHaveProperty('delayedPrivateKey')
      expect(keyset).toHaveProperty('revocationPrivateKey')
      expect(keyset).toHaveProperty('htlcPrivateKey')
      expect(keyset).toHaveProperty('ptlcPrivateKey')
      expect(keyset).toHaveProperty('perCommitmentPrivateKey')

      // All private keys should be Uint8Arrays of length 32
      const keyNames = [
        'fundingPrivateKey',
        'paymentPrivateKey',
        'delayedPrivateKey',
        'revocationPrivateKey',
        'htlcPrivateKey',
        'ptlcPrivateKey',
        'perCommitmentPrivateKey',
      ]
      keyNames.forEach(keyName => {
        expect(keyset[keyName as keyof typeof keyset]).toBeInstanceOf(Uint8Array)
        expect((keyset[keyName as keyof typeof keyset] as Uint8Array).length).toBe(32)
      })
    })

    it('should retrieve stored channel keyset', async () => {
      await keyManager.initialize()

      const seedPhrase = generateMnemonic()
      await keyManager.createNodeIdentity(seedPhrase)

      const generated = await keyManager.generateChannelKeyset(1)
      const retrieved = await keyManager.getChannelKeyset(1)

      expect(retrieved).toBeTruthy()
      expect(retrieved!.channelId).toBe(generated.channelId)
      expect(retrieved!.fundingPrivateKey).toEqual(generated.fundingPrivateKey)
      expect(retrieved!.paymentPrivateKey).toEqual(generated.paymentPrivateKey)
    })

    it('should return null for non-existent channel keyset', async () => {
      await keyManager.initialize()

      const retrieved = await keyManager.getChannelKeyset(999)
      expect(retrieved).toBeNull()
    })

    it('should fail to generate channel keyset without node identity', async () => {
      await keyManager.initialize()

      await expect(keyManager.generateChannelKeyset(0)).rejects.toThrow(
        'No Lightning node seed found',
      )
    })
  })

  describe('per-commitment secret generation', () => {
    it('should generate per-commitment secret', async () => {
      await keyManager.initialize()

      const seedPhrase = generateMnemonic()
      await keyManager.createNodeIdentity(seedPhrase)

      const secret = await keyManager.generatePerCommitmentSecret(0, 0)

      expect(secret).toBeInstanceOf(Uint8Array)
      expect(secret.length).toBe(32)
    })

    it('should fail without node identity', async () => {
      await keyManager.initialize()

      await expect(keyManager.generatePerCommitmentSecret(0, 0)).rejects.toThrow(
        'No Lightning node seed found',
      )
    })
  })

  describe('identity existence checks', () => {
    it('should return false when no identity exists', async () => {
      await keyManager.initialize()

      const hasIdentity = await keyManager.hasNodeIdentity()
      expect(hasIdentity).toBe(false)
    })

    it('should return true when identity exists', async () => {
      await keyManager.initialize()

      const seedPhrase = generateMnemonic()
      await keyManager.createNodeIdentity(seedPhrase)

      const hasIdentity = await keyManager.hasNodeIdentity()
      expect(hasIdentity).toBe(true)
    })
  })

  describe('backup and restore', () => {
    it('should export and import key backup successfully', async () => {
      await keyManager.initialize()

      // Create identity and channel keys
      const seedPhrase = generateMnemonic()
      await keyManager.createNodeIdentity(seedPhrase)
      await keyManager.generateChannelKeyset(0)
      await keyManager.generateChannelKeyset(1)

      // Export backup
      const backup = await keyManager.exportKeyBackup()
      expect(typeof backup).toBe('string')
      expect(backup.length).toBeGreaterThan(0)

      // Clear all data
      await keyManager.clearAllKeys()

      // Verify data is cleared
      expect(await keyManager.hasNodeIdentity()).toBe(false)
      expect(await keyManager.getChannelKeyset(0)).toBeNull()

      // Import backup
      await keyManager.importKeyBackup(backup)

      // Verify data is restored
      expect(await keyManager.hasNodeIdentity()).toBe(true)
      expect(await keyManager.getChannelKeyset(0)).toBeTruthy()
      expect(await keyManager.getChannelKeyset(1)).toBeTruthy()
    })
  })

  describe('clear all keys', () => {
    it('should clear all stored keys', async () => {
      await keyManager.initialize()

      // Create data
      const seedPhrase = generateMnemonic()
      await keyManager.createNodeIdentity(seedPhrase)
      await keyManager.generateChannelKeyset(0)

      // Verify data exists
      expect(await keyManager.hasNodeIdentity()).toBe(true)
      expect(await keyManager.getChannelKeyset(0)).toBeTruthy()

      // Clear all
      await keyManager.clearAllKeys()

      // Verify all data is cleared
      expect(await keyManager.hasNodeIdentity()).toBe(false)
      expect(await keyManager.getChannelKeyset(0)).toBeNull()
    })
  })
})
