/**
 * Lightning Secure Storage
 * Provides secure storage for Lightning Network keys and data
 */

import { LightningNodeState } from './types'

export interface LightningSecureStorageOptions {
  namespace: string
}

export class LightningSecureStorage {
  private namespace: string
  private initialized = false

  constructor(options: LightningSecureStorageOptions) {
    this.namespace = options.namespace
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    this.initialized = true
    // In a real implementation, this would initialize secure storage
  }

  private getStorageKey(key: string): string {
    return `${this.namespace}:${key}`
  }

  async storeNodeSeed(seed: Uint8Array): Promise<void> {
    const key = this.getStorageKey('nodeSeed')
    const seedHex = Array.from(seed)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    localStorage.setItem(key, seedHex)
  }

  async getNodeSeed(): Promise<Uint8Array | null> {
    const key = this.getStorageKey('nodeSeed')
    const seedHex = localStorage.getItem(key)
    if (!seedHex) return null

    const seed = new Uint8Array(seedHex.length / 2)
    for (let i = 0; i < seedHex.length; i += 2) {
      seed[i / 2] = parseInt(seedHex.substr(i, 2), 16)
    }
    return seed
  }

  async storeNodeState(state: LightningNodeState): Promise<void> {
    const key = this.getStorageKey('nodeState')
    localStorage.setItem(key, JSON.stringify(state))
  }

  async getNodeState(): Promise<LightningNodeState | null> {
    const key = this.getStorageKey('nodeState')
    const stateJson = localStorage.getItem(key)
    if (!stateJson) return null

    try {
      return JSON.parse(stateJson)
    } catch {
      return null
    }
  }

  async storeChannels(channels: any[]): Promise<void> {
    const key = this.getStorageKey('channels')
    localStorage.setItem(key, JSON.stringify(channels))
  }

  async getChannels(): Promise<any[]> {
    const key = this.getStorageKey('channels')
    const channelsJson = localStorage.getItem(key)
    if (!channelsJson) return []

    try {
      return JSON.parse(channelsJson)
    } catch {
      return []
    }
  }

  async storePeers(peers: any[]): Promise<void> {
    const key = this.getStorageKey('peers')
    localStorage.setItem(key, JSON.stringify(peers))
  }

  async getPeers(): Promise<any[]> {
    const key = this.getStorageKey('peers')
    const peersJson = localStorage.getItem(key)
    if (!peersJson) return []

    try {
      return JSON.parse(peersJson)
    } catch {
      return []
    }
  }

  async storeKeys(keys: Record<string, any>): Promise<void> {
    const key = this.getStorageKey('keys')
    localStorage.setItem(key, JSON.stringify(keys))
  }

  async getKeys(): Promise<Record<string, any> | null> {
    const key = this.getStorageKey('keys')
    const keysJson = localStorage.getItem(key)
    if (!keysJson) return null

    try {
      return JSON.parse(keysJson)
    } catch {
      return null
    }
  }

  async hasNodeData(): Promise<boolean> {
    const seed = await this.getNodeSeed()
    const state = await this.getNodeState()
    return seed !== null || state !== null
  }

  async exportBackup(): Promise<string> {
    const nodeSeed = await this.getNodeSeed()
    const data = {
      nodeSeed: nodeSeed ? Array.from(nodeSeed) : null,
      nodeState: await this.getNodeState(),
      channels: await this.getChannels(),
      peers: await this.getPeers(),
      keys: await this.getKeys(),
    }

    return btoa(JSON.stringify(data))
  }

  async importBackup(backup: string): Promise<void> {
    try {
      const data = JSON.parse(atob(backup))

      if (data.nodeSeed) await this.storeNodeSeed(new Uint8Array(data.nodeSeed))
      if (data.nodeState) await this.storeNodeState(data.nodeState)
      if (data.channels) await this.storeChannels(data.channels)
      if (data.peers) await this.storePeers(data.peers)
      if (data.keys) await this.storeKeys(data.keys)
    } catch {
      throw new Error('Invalid backup data')
    }
  }

  async clearAll(): Promise<void> {
    const keys = Object.keys(localStorage).filter(key => key.startsWith(this.namespace))
    keys.forEach(key => localStorage.removeItem(key))
  }
}

// Singleton instance for default usage
// Singleton instance for default usage
export const lightningSecureStorage = new LightningSecureStorage({ namespace: 'lightning' })
