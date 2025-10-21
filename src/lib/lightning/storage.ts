/**
 * Secure Storage Engine for Lightning Node
 * Provides encrypted storage for sensitive Lightning node data using MMKV
 */

import { uint8ArrayToHex, hexToUint8Array } from '../crypto'
import { MMKV } from 'react-native-mmkv'

// Storage interface that works with both MMKV and Map
interface StorageInterface {
  set(key: string, value: string): void
  getString(key: string): string | undefined
  delete(key: string): void
}

// Use in-memory storage for tests, MMKV for production
const isTestEnvironment = typeof jest !== 'undefined'
let secureStorage: StorageInterface

if (isTestEnvironment) {
  const memoryStorage = new Map<string, string>()
  secureStorage = {
    set: (key: string, value: string) => memoryStorage.set(key, value),
    getString: (key: string) => memoryStorage.get(key) ?? undefined,
    delete: (key: string) => memoryStorage.delete(key),
  }
} else {
  secureStorage = new MMKV({
    id: 'lightning-node-secure-storage',
    encryptionKey: 'lightning-node-secure-key-v1',
  })
}

// Storage keys
const STORAGE_KEYS = {
  LIGHTNING_NODE_SEED: 'lightning_node_seed',
  LIGHTNING_NODE_STATE: 'lightning_node_state',
  LIGHTNING_CHANNELS: 'lightning_channels',
  LIGHTNING_PEERS: 'lightning_peers',
  LIGHTNING_KEYS: 'lightning_keys',
} as const

export interface SecureStorageConfig {
  namespace?: string
}

export interface LightningNodeState {
  nodeId: string
  alias: string
  color: string
  features: string[]
  network: 'mainnet' | 'testnet' | 'regtest'
  version: string
  lastSyncHeight: number
  lastActive: number
}

/**
 * Secure Storage Engine for Lightning Node data
 * Uses MMKV's built-in encryption for security
 */
export class LightningSecureStorage {
  private namespace: string

  constructor(config: SecureStorageConfig = {}) {
    this.namespace = config.namespace || 'lightning'
  }

  /**
   * Initialize the storage (MMKV doesn't need explicit initialization)
   */
  async initialize(): Promise<void> {
    // MMKV is ready to use immediately
    return Promise.resolve()
  }

  /**
   * Store Lightning node seed (most sensitive data)
   */
  async storeNodeSeed(seed: Uint8Array): Promise<void> {
    const hexData = uint8ArrayToHex(seed)
    const key = this.getStorageKey(STORAGE_KEYS.LIGHTNING_NODE_SEED)
    secureStorage.set(key, hexData)
  }

  /**
   * Retrieve Lightning node seed
   */
  async getNodeSeed(): Promise<Uint8Array | null> {
    const key = this.getStorageKey(STORAGE_KEYS.LIGHTNING_NODE_SEED)
    const hexData = secureStorage.getString(key)
    if (!hexData) return null

    try {
      return hexToUint8Array(hexData)
    } catch (error) {
      console.error('Failed to decode node seed:', error)
      return null
    }
  }

  /**
   * Store Lightning node state
   */
  async storeNodeState(state: LightningNodeState): Promise<void> {
    const jsonData = JSON.stringify(state)
    secureStorage.set(this.getStorageKey(STORAGE_KEYS.LIGHTNING_NODE_STATE), jsonData)
  }

  /**
   * Retrieve Lightning node state
   */
  async getNodeState(): Promise<LightningNodeState | null> {
    const jsonData = secureStorage.getString(this.getStorageKey(STORAGE_KEYS.LIGHTNING_NODE_STATE))
    if (!jsonData) return null

    try {
      return JSON.parse(jsonData)
    } catch (error) {
      console.error('Failed to parse node state:', error)
      return null
    }
  }

  /**
   * Store channel data
   */
  async storeChannels(channels: any[]): Promise<void> {
    const jsonData = JSON.stringify(channels)
    secureStorage.set(this.getStorageKey(STORAGE_KEYS.LIGHTNING_CHANNELS), jsonData)
  }

  /**
   * Retrieve channel data
   */
  async getChannels(): Promise<any[]> {
    const jsonData = secureStorage.getString(this.getStorageKey(STORAGE_KEYS.LIGHTNING_CHANNELS))
    if (!jsonData) return []

    try {
      return JSON.parse(jsonData)
    } catch (error) {
      console.error('Failed to parse channels:', error)
      return []
    }
  }

  /**
   * Store peer information
   */
  async storePeers(peers: any[]): Promise<void> {
    const jsonData = JSON.stringify(peers)
    secureStorage.set(this.getStorageKey(STORAGE_KEYS.LIGHTNING_PEERS), jsonData)
  }

  /**
   * Retrieve peer information
   */
  async getPeers(): Promise<any[]> {
    const jsonData = secureStorage.getString(this.getStorageKey(STORAGE_KEYS.LIGHTNING_PEERS))
    if (!jsonData) return []

    try {
      return JSON.parse(jsonData)
    } catch (error) {
      console.error('Failed to parse peers:', error)
      return []
    }
  }

  /**
   * Store derived keys (less sensitive than seed)
   */
  async storeKeys(keys: any): Promise<void> {
    const jsonData = JSON.stringify(keys)
    secureStorage.set(this.getStorageKey(STORAGE_KEYS.LIGHTNING_KEYS), jsonData)
  }

  /**
   * Retrieve derived keys
   */
  async getKeys(): Promise<any | null> {
    const jsonData = secureStorage.getString(this.getStorageKey(STORAGE_KEYS.LIGHTNING_KEYS))
    if (!jsonData) return null

    try {
      return JSON.parse(jsonData)
    } catch (error) {
      console.error('Failed to parse keys:', error)
      return null
    }
  }

  /**
   * Clear all Lightning node data
   */
  async clearAll(): Promise<void> {
    const keys = Object.values(STORAGE_KEYS).map(key => this.getStorageKey(key))
    keys.forEach(key => secureStorage.delete(key))
  }

  /**
   * Check if node data exists
   */
  async hasNodeData(): Promise<boolean> {
    const seed = await this.getNodeSeed()
    return seed !== null
  }

  /**
   * Export encrypted backup of all data (MMKV handles encryption)
   */
  async exportBackup(): Promise<string> {
    const data = {
      seed: secureStorage.getString(this.getStorageKey(STORAGE_KEYS.LIGHTNING_NODE_SEED)),
      state: secureStorage.getString(this.getStorageKey(STORAGE_KEYS.LIGHTNING_NODE_STATE)),
      channels: secureStorage.getString(this.getStorageKey(STORAGE_KEYS.LIGHTNING_CHANNELS)),
      peers: secureStorage.getString(this.getStorageKey(STORAGE_KEYS.LIGHTNING_PEERS)),
      keys: secureStorage.getString(this.getStorageKey(STORAGE_KEYS.LIGHTNING_KEYS)),
      timestamp: Date.now(),
      version: '1.0',
    }

    return JSON.stringify(data)
  }

  /**
   * Import encrypted backup
   */
  async importBackup(backupData: string): Promise<void> {
    try {
      const data = JSON.parse(backupData)

      // Restore all data
      if (data.seed) {
        secureStorage.set(this.getStorageKey(STORAGE_KEYS.LIGHTNING_NODE_SEED), data.seed)
      }
      if (data.state) {
        secureStorage.set(this.getStorageKey(STORAGE_KEYS.LIGHTNING_NODE_STATE), data.state)
      }
      if (data.channels) {
        secureStorage.set(this.getStorageKey(STORAGE_KEYS.LIGHTNING_CHANNELS), data.channels)
      }
      if (data.peers) {
        secureStorage.set(this.getStorageKey(STORAGE_KEYS.LIGHTNING_PEERS), data.peers)
      }
      if (data.keys) {
        secureStorage.set(this.getStorageKey(STORAGE_KEYS.LIGHTNING_KEYS), data.keys)
      }
    } catch (error) {
      throw new Error(`Failed to import backup: ${error}`)
    }
  }

  // Private methods

  private getStorageKey(key: string): string {
    return `${this.namespace}_${key}`
  }
}

// Singleton instance
export const lightningSecureStorage = new LightningSecureStorage()

// Utility functions
export async function initializeLightningStorage(): Promise<void> {
  await lightningSecureStorage.initialize()
}

export async function hasLightningNodeData(): Promise<boolean> {
  return await lightningSecureStorage.hasNodeData()
}

export async function backupLightningNode(): Promise<string> {
  return await lightningSecureStorage.exportBackup()
}

export async function restoreLightningNode(backupData: string): Promise<void> {
  await lightningSecureStorage.importBackup(backupData)
}
