// Lightning Network Persistence Layer using MMKV

import { MMKV } from 'react-native-mmkv'

// Initialize MMKV instance for Lightning data
const lightningStorage = new MMKV({
  id: 'lightning-storage',
  encryptionKey: 'lightning-encryption-key', // TODO: Use secure key derivation
})

// Storage keys
const STORAGE_KEYS = {
  CHANNELS: 'channels',
  PEERS: 'peers',
  PREIMAGES: 'preimages',
  NODE_KEY: 'node_key',
  CHANNEL_SEEDS: 'channel_seeds',
  PAYMENT_INFO: 'payment_info',
  INVOICES: 'invoices',
  ROUTING_GRAPH: 'routing_graph',
} as const

// Types for persisted data
export interface PersistedChannel {
  channelId: string
  nodeId: string
  state: string
  fundingTxid?: string
  fundingOutputIndex?: number
  localBalance: string
  remoteBalance: string
  localConfig: any // TODO: Define proper types
  remoteConfig: any
  createdAt?: number
  lastActivity?: number
}

export interface PersistedPeer {
  nodeId: string
  host: string
  port: number
  pubkey: string
  lastConnected?: number
  features?: string
}

export interface PersistedPreimage {
  paymentHash: string
  preimage: string
  createdAt: number
}

export interface PersistedPaymentInfo {
  paymentHash: string
  amountMsat?: string
  direction: 'sent' | 'received'
  status: string
  expiryDelay?: number
  createdAt: number
}

export interface PersistedInvoice {
  paymentHash: string
  bolt11: string
  amountMsat?: string
  description: string
  expiry: number
  createdAt: number
}

export interface RoutingNode {
  nodeId: string
  features: string
  addresses: { host: string; port: number }[]
  lastUpdate: number
}

export interface RoutingChannel {
  shortChannelId: string
  node1: string
  node2: string
  capacity: string
  feeBaseMsat: number
  feeProportionalMillionths: number
  cltvDelta: number
  lastUpdate: number
}

// Persistence Manager Class
export class LightningPersistence {
  // Channels
  saveChannel(channel: PersistedChannel): void {
    const channels = this.getChannels()
    channels[channel.channelId] = channel
    lightningStorage.set(STORAGE_KEYS.CHANNELS, JSON.stringify(channels))
  }

  getChannel(channelId: string): PersistedChannel | null {
    const channels = this.getChannels()
    return channels[channelId] || null
  }

  getChannels(): Record<string, PersistedChannel> {
    try {
      const data = lightningStorage.getString(STORAGE_KEYS.CHANNELS)
      return data ? JSON.parse(data) : {}
    } catch (error) {
      console.error('[persistence] Failed to parse channels:', error)
      lightningStorage.delete(STORAGE_KEYS.CHANNELS)
      return {}
    }
  }

  deleteChannel(channelId: string): void {
    const channels = this.getChannels()
    delete channels[channelId]
    lightningStorage.set(STORAGE_KEYS.CHANNELS, JSON.stringify(channels))
  }

  // Peers
  savePeer(peer: PersistedPeer): void {
    const peers = this.getPeers()
    peers[peer.nodeId] = peer
    lightningStorage.set(STORAGE_KEYS.PEERS, JSON.stringify(peers))
  }

  getPeer(nodeId: string): PersistedPeer | null {
    const peers = this.getPeers()
    return peers[nodeId] || null
  }

  getPeers(): Record<string, PersistedPeer> {
    try {
      const data = lightningStorage.getString(STORAGE_KEYS.PEERS)
      return data ? JSON.parse(data) : {}
    } catch (error) {
      console.error('[persistence] Failed to parse peers:', error)
      lightningStorage.delete(STORAGE_KEYS.PEERS)
      return {}
    }
  }

  deletePeer(nodeId: string): void {
    const peers = this.getPeers()
    delete peers[nodeId]
    lightningStorage.set(STORAGE_KEYS.PEERS, JSON.stringify(peers))
  }

  // Preimages
  savePreimage(preimage: PersistedPreimage): void {
    const preimages = this.getPreimages()
    preimages[preimage.paymentHash] = preimage
    lightningStorage.set(STORAGE_KEYS.PREIMAGES, JSON.stringify(preimages))
  }

  getPreimage(paymentHash: string): PersistedPreimage | null {
    const preimages = this.getPreimages()
    return preimages[paymentHash] || null
  }

  getPreimages(): Record<string, PersistedPreimage> {
    try {
      const data = lightningStorage.getString(STORAGE_KEYS.PREIMAGES)
      return data ? JSON.parse(data) : {}
    } catch (error) {
      console.error('[persistence] Failed to parse preimages:', error)
      lightningStorage.delete(STORAGE_KEYS.PREIMAGES)
      return {}
    }
  }

  deletePreimage(paymentHash: string): void {
    const preimages = this.getPreimages()
    delete preimages[paymentHash]
    lightningStorage.set(STORAGE_KEYS.PREIMAGES, JSON.stringify(preimages))
  }

  // Payment Info
  savePaymentInfo(info: PersistedPaymentInfo): void {
    const payments = this.getPaymentInfos()
    payments[info.paymentHash] = info
    lightningStorage.set(STORAGE_KEYS.PAYMENT_INFO, JSON.stringify(payments))
  }

  getPaymentInfo(paymentHash: string): PersistedPaymentInfo | null {
    const payments = this.getPaymentInfos()
    return payments[paymentHash] || null
  }

  getPaymentInfos(): Record<string, PersistedPaymentInfo> {
    try {
      const data = lightningStorage.getString(STORAGE_KEYS.PAYMENT_INFO)
      return data ? JSON.parse(data) : {}
    } catch (error) {
      console.error('[persistence] Failed to parse payment info:', error)
      lightningStorage.delete(STORAGE_KEYS.PAYMENT_INFO)
      return {}
    }
  }

  // Invoices
  saveInvoice(invoice: PersistedInvoice): void {
    const invoices = this.getInvoices()
    invoices[invoice.paymentHash] = invoice
    lightningStorage.set(STORAGE_KEYS.INVOICES, JSON.stringify(invoices))
  }

  getInvoice(paymentHash: string): PersistedInvoice | null {
    const invoices = this.getInvoices()
    return invoices[paymentHash] || null
  }

  getInvoices(): Record<string, PersistedInvoice> {
    try {
      const data = lightningStorage.getString(STORAGE_KEYS.INVOICES)
      return data ? JSON.parse(data) : {}
    } catch (error) {
      console.error('[persistence] Failed to parse invoices:', error)
      lightningStorage.delete(STORAGE_KEYS.INVOICES)
      return {}
    }
  }

  // Node Key (encrypted)
  saveNodeKey(nodeKey: Uint8Array): void {
    const keyHex = Buffer.from(nodeKey).toString('hex')
    lightningStorage.set(STORAGE_KEYS.NODE_KEY, keyHex)
  }

  getNodeKey(): Uint8Array | null {
    const keyHex = lightningStorage.getString(STORAGE_KEYS.NODE_KEY)
    return keyHex ? new Uint8Array(Buffer.from(keyHex, 'hex')) : null
  }

  // Channel Seeds
  saveChannelSeed(channelId: string, seed: Uint8Array): void {
    const seeds = this.getChannelSeeds()
    seeds[channelId] = Buffer.from(seed).toString('hex')
    lightningStorage.set(STORAGE_KEYS.CHANNEL_SEEDS, JSON.stringify(seeds))
  }

  getChannelSeed(channelId: string): Uint8Array | null {
    const seeds = this.getChannelSeeds()
    const seedHex = seeds[channelId]
    return seedHex ? new Uint8Array(Buffer.from(seedHex, 'hex')) : null
  }

  getChannelSeeds(): Record<string, string> {
    try {
      const data = lightningStorage.getString(STORAGE_KEYS.CHANNEL_SEEDS)
      return data ? JSON.parse(data) : {}
    } catch (error) {
      console.error('[persistence] Failed to parse channel seeds:', error)
      lightningStorage.delete(STORAGE_KEYS.CHANNEL_SEEDS)
      return {}
    }
  }

  // Routing Graph (simplified)
  saveRoutingNode(node: RoutingNode): void {
    const graph = this.getRoutingGraph()
    graph.nodes[node.nodeId] = node
    lightningStorage.set(STORAGE_KEYS.ROUTING_GRAPH, JSON.stringify(graph))
  }

  saveRoutingChannel(channel: RoutingChannel): void {
    const graph = this.getRoutingGraph()
    graph.channels[channel.shortChannelId] = channel
    lightningStorage.set(STORAGE_KEYS.ROUTING_GRAPH, JSON.stringify(graph))
  }

  getRoutingGraph(): {
    nodes: Record<string, RoutingNode>
    channels: Record<string, RoutingChannel>
  } {
    try {
      const data = lightningStorage.getString(STORAGE_KEYS.ROUTING_GRAPH)
      return data ? JSON.parse(data) : { nodes: {}, channels: {} }
    } catch (error) {
      console.error('[persistence] Failed to parse routing graph:', error)
      lightningStorage.delete(STORAGE_KEYS.ROUTING_GRAPH)
      return { nodes: {}, channels: {} }
    }
  }

  // Utility methods
  clearAll(): void {
    lightningStorage.clearAll()
  }

  exportData(): string {
    const snapshot = {
      channels: this.getChannels(),
      peers: this.getPeers(),
      preimages: this.getPreimages(),
      payments: this.getPaymentInfos(),
      invoices: this.getInvoices(),
      channelSeeds: this.getChannelSeeds(),
      routingGraph: this.getRoutingGraph(),
    }
    return JSON.stringify(snapshot)
  }

  importData(data: string): void {
    try {
      const snapshot = JSON.parse(data)
      lightningStorage.clearAll()

      if (snapshot.channels) {
        lightningStorage.set(STORAGE_KEYS.CHANNELS, JSON.stringify(snapshot.channels))
      }
      if (snapshot.peers) {
        lightningStorage.set(STORAGE_KEYS.PEERS, JSON.stringify(snapshot.peers))
      }
      if (snapshot.preimages) {
        lightningStorage.set(STORAGE_KEYS.PREIMAGES, JSON.stringify(snapshot.preimages))
      }
      if (snapshot.payments) {
        lightningStorage.set(STORAGE_KEYS.PAYMENT_INFO, JSON.stringify(snapshot.payments))
      }
      if (snapshot.invoices) {
        lightningStorage.set(STORAGE_KEYS.INVOICES, JSON.stringify(snapshot.invoices))
      }
      if (snapshot.channelSeeds) {
        lightningStorage.set(STORAGE_KEYS.CHANNEL_SEEDS, JSON.stringify(snapshot.channelSeeds))
      }
      if (snapshot.routingGraph) {
        lightningStorage.set(STORAGE_KEYS.ROUTING_GRAPH, JSON.stringify(snapshot.routingGraph))
      }
    } catch (error) {
      console.error('[persistence] Failed to import data:', error)
    }
  }
}

// Singleton instance
export const lightningPersistence = new LightningPersistence()
