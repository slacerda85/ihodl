/**
 * Tests for Lightning Secure Storage
 */

import { LightningSecureStorage, lightningSecureStorage } from '../../lib/lightning/storage'
import { LightningNodeState } from '../../lib/lightning/types'

describe('LightningSecureStorage', () => {
  let storage: LightningSecureStorage

  beforeEach(() => {
    storage = new LightningSecureStorage({ namespace: 'test' })
  })

  afterEach(async () => {
    await storage.clearAll()
  })

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await expect(storage.initialize()).resolves.toBeUndefined()
    })
  })

  describe('node seed storage', () => {
    it('should store and retrieve node seed', async () => {
      await storage.initialize()

      const testSeed = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])

      await storage.storeNodeSeed(testSeed)
      const retrieved = await storage.getNodeSeed()

      expect(retrieved).toEqual(testSeed)
    })

    it('should return null for non-existent seed', async () => {
      await storage.initialize()

      const retrieved = await storage.getNodeSeed()
      expect(retrieved).toBeNull()
    })
  })

  describe('node state storage', () => {
    it('should store and retrieve node state', async () => {
      await storage.initialize()

      const testState: LightningNodeState = {
        nodeId: 'test-node-id',
        alias: 'Test Node',
        color: '#ff0000',
        features: ['option_data_loss_protect', 'static_remote_key'],
        network: 'testnet',
        version: '1.0.0',
        lastSyncHeight: 123456,
        lastActive: Date.now(),
      }

      await storage.storeNodeState(testState)
      const retrieved = await storage.getNodeState()

      expect(retrieved).toEqual(testState)
    })

    it('should return null for non-existent state', async () => {
      await storage.initialize()

      const retrieved = await storage.getNodeState()
      expect(retrieved).toBeNull()
    })
  })

  describe('channel storage', () => {
    it('should store and retrieve channels', async () => {
      await storage.initialize()

      const testChannels = [
        { id: 'channel1', capacity: 1000000, localBalance: 500000 },
        { id: 'channel2', capacity: 2000000, localBalance: 1000000 },
      ]

      await storage.storeChannels(testChannels)
      const retrieved = await storage.getChannels()

      expect(retrieved).toEqual(testChannels)
    })

    it('should return empty array for non-existent channels', async () => {
      await storage.initialize()

      const retrieved = await storage.getChannels()
      expect(retrieved).toEqual([])
    })
  })

  describe('peer storage', () => {
    it('should store and retrieve peers', async () => {
      await storage.initialize()

      const testPeers = [
        { pubkey: 'peer1', address: '127.0.0.1:9735' },
        { pubkey: 'peer2', address: '127.0.0.1:9736' },
      ]

      await storage.storePeers(testPeers)
      const retrieved = await storage.getPeers()

      expect(retrieved).toEqual(testPeers)
    })

    it('should return empty array for non-existent peers', async () => {
      await storage.initialize()

      const retrieved = await storage.getPeers()
      expect(retrieved).toEqual([])
    })
  })

  describe('keys storage', () => {
    it('should store and retrieve keys', async () => {
      await storage.initialize()

      const testKeys = {
        fundingKey: 'funding-key-data',
        paymentKey: 'payment-key-data',
        revocationKey: 'revocation-key-data',
      }

      await storage.storeKeys(testKeys)
      const retrieved = await storage.getKeys()

      expect(retrieved).toEqual(testKeys)
    })

    it('should return null for non-existent keys', async () => {
      await storage.initialize()

      const retrieved = await storage.getKeys()
      expect(retrieved).toBeNull()
    })
  })

  describe('data existence checks', () => {
    it('should return false when no node data exists', async () => {
      await storage.initialize()

      const hasData = await storage.hasNodeData()
      expect(hasData).toBe(false)
    })

    it('should return true when node data exists', async () => {
      await storage.initialize()

      const testSeed = new Uint8Array([1, 2, 3, 4])
      await storage.storeNodeSeed(testSeed)

      const hasData = await storage.hasNodeData()
      expect(hasData).toBe(true)
    })
  })

  describe('backup and restore', () => {
    it('should export and import backup successfully', async () => {
      await storage.initialize()

      // Store some test data
      const testSeed = new Uint8Array([1, 2, 3, 4, 5])
      const testState: LightningNodeState = {
        nodeId: 'backup-test-node',
        alias: 'Backup Test',
        color: '#00ff00',
        features: ['test_feature'],
        network: 'regtest',
        version: '1.0.0',
        lastSyncHeight: 100000,
        lastActive: Date.now(),
      }
      const testChannels = [{ id: 'backup-channel', capacity: 500000 }]
      const testPeers = [{ pubkey: 'backup-peer', address: '127.0.0.1:9735' }]
      const testKeys = { backupKey: 'backup-key-data' }

      await storage.storeNodeSeed(testSeed)
      await storage.storeNodeState(testState)
      await storage.storeChannels(testChannels)
      await storage.storePeers(testPeers)
      await storage.storeKeys(testKeys)

      // Export backup
      const backup = await storage.exportBackup()
      expect(typeof backup).toBe('string')
      expect(backup.length).toBeGreaterThan(0)

      // Clear all data
      await storage.clearAll()

      // Verify data is cleared
      expect(await storage.getNodeSeed()).toBeNull()
      expect(await storage.getNodeState()).toBeNull()
      expect(await storage.getChannels()).toEqual([])
      expect(await storage.getPeers()).toEqual([])
      expect(await storage.getKeys()).toBeNull()

      // Import backup
      await storage.importBackup(backup)

      // Verify data is restored
      expect(await storage.getNodeSeed()).toEqual(testSeed)
      expect(await storage.getNodeState()).toEqual(testState)
      expect(await storage.getChannels()).toEqual(testChannels)
      expect(await storage.getPeers()).toEqual(testPeers)
      expect(await storage.getKeys()).toEqual(testKeys)
    })
  })

  describe('clear all', () => {
    it('should clear all stored data', async () => {
      await storage.initialize()

      // Store some data
      const testSeed = new Uint8Array([1, 2, 3])
      const testState: LightningNodeState = {
        nodeId: 'clear-test',
        alias: 'Clear Test',
        color: '#0000ff',
        features: [],
        network: 'mainnet',
        version: '1.0.0',
        lastSyncHeight: 0,
        lastActive: Date.now(),
      }

      await storage.storeNodeSeed(testSeed)
      await storage.storeNodeState(testState)
      await storage.storeChannels([{ id: 'test' }])
      await storage.storePeers([{ pubkey: 'test' }])
      await storage.storeKeys({ test: 'data' })

      // Verify data exists
      expect(await storage.hasNodeData()).toBe(true)

      // Clear all
      await storage.clearAll()

      // Verify all data is cleared
      expect(await storage.getNodeSeed()).toBeNull()
      expect(await storage.getNodeState()).toBeNull()
      expect(await storage.getChannels()).toEqual([])
      expect(await storage.getPeers()).toEqual([])
      expect(await storage.getKeys()).toBeNull()
      expect(await storage.hasNodeData()).toBe(false)
    })
  })
})

describe('lightningSecureStorage singleton', () => {
  it('should be a valid LightningSecureStorage instance', () => {
    expect(lightningSecureStorage).toBeInstanceOf(LightningSecureStorage)
  })

  it('should initialize successfully', async () => {
    await expect(lightningSecureStorage.initialize()).resolves.toBeUndefined()
  })
})
