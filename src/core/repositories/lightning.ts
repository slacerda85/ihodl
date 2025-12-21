import { MMKV } from 'react-native-mmkv'
import {
  type ChannelBackupData,
  type FullBackup,
  type RestoreContext,
  CHANNEL_BACKUP_VERSION,
  exportEncryptedBackup,
  importEncryptedBackup,
  createBackupFromPersistedChannel,
  prepareChannelRestore,
  RestoreState,
} from '@/core/lib/lightning/backup'

// Import types from persistence
export interface PersistedChannel {
  channelId: string
  nodeId: string
  state: string
  fundingTxid?: string
  fundingOutputIndex?: number
  fundingScriptPubKey?: string
  localBalance: string
  remoteBalance: string
  localConfig: any
  remoteConfig: any
  isInitiator?: boolean
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
  score?: number // Peer reliability score (increments on success, decrements on failure)
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

const lightningStorage = new MMKV({
  id: 'lightning-storage',
  encryptionKey: 'lightning-encryption-key',
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
  WATCHTOWER_CHANNELS: 'watchtower_channels',
  WATCHTOWER_STATS: 'watchtower_stats',
  CHANNEL_BACKUPS: 'channel_backups',
  RESTORE_CONTEXTS: 'restore_contexts',
  LAST_BACKUP_TIME: 'last_backup_time',
  LAST_PEER_UPDATE: 'last_peer_update',
  PEER_STATS: 'peer_stats',
  INIT_STATE: 'init_state',
} as const

// Watchtower types
export interface PersistedWatchtowerChannel {
  channelId: string
  fundingTxid: string
  fundingOutputIndex: number
  remotePubkey: string
  localPubkey: string
  localBalance: string
  remoteBalance: string
  capacity: string
  currentCommitmentNumber: string
  revokedCommitments: PersistedRevokedCommitment[]
  lastChecked: number
  status: string
}

export interface PersistedRevokedCommitment {
  commitmentNumber: string
  commitmentTxid: string
  revocationKey: string
  localDelayedPubkey: string
  toSelfDelay: number
  amount: string
  createdAt: number
}

export interface PersistedWatchtowerStats {
  breachesDetected: number
  penaltiesBroadcast: number
  lastCheck: number
}

interface LightningRepositoryInterface {
  // Channels
  saveChannel(channel: PersistedChannel): void
  findChannelById(channelId: string): PersistedChannel | null
  findAllChannels(): Record<string, PersistedChannel>
  deleteChannel(channelId: string): void

  // Peers
  savePeer(peer: PersistedPeer): void
  findPeerById(nodeId: string): PersistedPeer | null
  findAllPeers(): Record<string, PersistedPeer>
  deletePeer(nodeId: string): void

  // Preimages
  savePreimage(preimage: PersistedPreimage): void
  findPreimageByHash(paymentHash: string): PersistedPreimage | null
  findAllPreimages(): Record<string, PersistedPreimage>
  deletePreimage(paymentHash: string): void

  // Payment Info
  savePaymentInfo(info: PersistedPaymentInfo): void
  findPaymentInfoByHash(paymentHash: string): PersistedPaymentInfo | null
  findAllPaymentInfos(): Record<string, PersistedPaymentInfo>

  // Invoices
  saveInvoice(invoice: PersistedInvoice): void
  findInvoiceByHash(paymentHash: string): PersistedInvoice | null
  findAllInvoices(): Record<string, PersistedInvoice>

  // Node Key
  saveNodeKey(nodeKey: Uint8Array): void
  getNodeKey(): Uint8Array | null

  // Channel Seeds
  saveChannelSeed(channelId: string, seed: Uint8Array): void
  getChannelSeed(channelId: string): Uint8Array | null
  getAllChannelSeeds(): Record<string, string>

  // Routing Graph
  saveRoutingNode(node: RoutingNode): void
  saveRoutingChannel(channel: RoutingChannel): void
  getRoutingGraph(): {
    nodes: Record<string, RoutingNode>
    channels: Record<string, RoutingChannel>
  }

  // Backup & Restore
  saveChannelBackup(channelId: string, backup: ChannelBackupData): void
  getChannelBackup(channelId: string): ChannelBackupData | null
  getAllChannelBackups(): Record<string, ChannelBackupData>
  deleteChannelBackup(channelId: string): void
  createFullBackup(): FullBackup
  exportEncryptedBackup(password: string): string
  importEncryptedBackup(data: string, password: string): FullBackup
  saveRestoreContext(channelId: string, context: RestoreContext): void
  getRestoreContext(channelId: string): RestoreContext | null
  getAllRestoreContexts(): Record<string, RestoreContext>
  updateLastBackupTime(): void
  getLastBackupTime(): number | null

  // Utility
  clearAll(): void
  exportData(): string
  importData(data: string): void
}

export class LightningRepository implements LightningRepositoryInterface {
  // Channels
  saveChannel(channel: PersistedChannel): void {
    const channels = this.findAllChannels()
    channels[channel.channelId] = channel
    lightningStorage.set(STORAGE_KEYS.CHANNELS, JSON.stringify(channels))
  }

  findChannelById(channelId: string): PersistedChannel | null {
    const channels = this.findAllChannels()
    return channels[channelId] || null
  }

  findAllChannels(): Record<string, PersistedChannel> {
    try {
      const data = lightningStorage.getString(STORAGE_KEYS.CHANNELS)
      return data ? JSON.parse(data) : {}
    } catch (error) {
      console.error('[lightning-repo] Failed to parse channels:', error)
      lightningStorage.delete(STORAGE_KEYS.CHANNELS)
      return {}
    }
  }

  deleteChannel(channelId: string): void {
    const channels = this.findAllChannels()
    delete channels[channelId]
    lightningStorage.set(STORAGE_KEYS.CHANNELS, JSON.stringify(channels))
  }

  // Peers
  savePeer(peer: PersistedPeer): void {
    const peers = this.findAllPeers()
    peers[peer.nodeId] = peer
    lightningStorage.set(STORAGE_KEYS.PEERS, JSON.stringify(peers))
  }

  findPeerById(nodeId: string): PersistedPeer | null {
    const peers = this.findAllPeers()
    return peers[nodeId] || null
  }

  findAllPeers(): Record<string, PersistedPeer> {
    try {
      const data = lightningStorage.getString(STORAGE_KEYS.PEERS)
      return data ? JSON.parse(data) : {}
    } catch (error) {
      console.error('[lightning-repo] Failed to parse peers:', error)
      lightningStorage.delete(STORAGE_KEYS.PEERS)
      return {}
    }
  }

  deletePeer(nodeId: string): void {
    const peers = this.findAllPeers()
    delete peers[nodeId]
    lightningStorage.set(STORAGE_KEYS.PEERS, JSON.stringify(peers))
  }

  // Preimages
  savePreimage(preimage: PersistedPreimage): void {
    const preimages = this.findAllPreimages()
    preimages[preimage.paymentHash] = preimage
    lightningStorage.set(STORAGE_KEYS.PREIMAGES, JSON.stringify(preimages))
  }

  findPreimageByHash(paymentHash: string): PersistedPreimage | null {
    const preimages = this.findAllPreimages()
    return preimages[paymentHash] || null
  }

  findAllPreimages(): Record<string, PersistedPreimage> {
    try {
      const data = lightningStorage.getString(STORAGE_KEYS.PREIMAGES)
      return data ? JSON.parse(data) : {}
    } catch (error) {
      console.error('[lightning-repo] Failed to parse preimages:', error)
      lightningStorage.delete(STORAGE_KEYS.PREIMAGES)
      return {}
    }
  }

  deletePreimage(paymentHash: string): void {
    const preimages = this.findAllPreimages()
    delete preimages[paymentHash]
    lightningStorage.set(STORAGE_KEYS.PREIMAGES, JSON.stringify(preimages))
  }

  // Payment Info
  savePaymentInfo(info: PersistedPaymentInfo): void {
    const payments = this.findAllPaymentInfos()
    payments[info.paymentHash] = info
    lightningStorage.set(STORAGE_KEYS.PAYMENT_INFO, JSON.stringify(payments))
  }

  findPaymentInfoByHash(paymentHash: string): PersistedPaymentInfo | null {
    const payments = this.findAllPaymentInfos()
    return payments[paymentHash] || null
  }

  findAllPaymentInfos(): Record<string, PersistedPaymentInfo> {
    try {
      const data = lightningStorage.getString(STORAGE_KEYS.PAYMENT_INFO)
      return data ? JSON.parse(data) : {}
    } catch (error) {
      console.error('[lightning-repo] Failed to parse payment info:', error)
      lightningStorage.delete(STORAGE_KEYS.PAYMENT_INFO)
      return {}
    }
  }

  // Invoices
  saveInvoice(invoice: PersistedInvoice): void {
    const invoices = this.findAllInvoices()
    invoices[invoice.paymentHash] = invoice
    lightningStorage.set(STORAGE_KEYS.INVOICES, JSON.stringify(invoices))
  }

  findInvoiceByHash(paymentHash: string): PersistedInvoice | null {
    const invoices = this.findAllInvoices()
    return invoices[paymentHash] || null
  }

  findAllInvoices(): Record<string, PersistedInvoice> {
    try {
      const data = lightningStorage.getString(STORAGE_KEYS.INVOICES)
      return data ? JSON.parse(data) : {}
    } catch (error) {
      console.error('[lightning-repo] Failed to parse invoices:', error)
      lightningStorage.delete(STORAGE_KEYS.INVOICES)
      return {}
    }
  }

  // Node Key
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
    const seeds = this.getAllChannelSeeds()
    seeds[channelId] = Buffer.from(seed).toString('hex')
    lightningStorage.set(STORAGE_KEYS.CHANNEL_SEEDS, JSON.stringify(seeds))
  }

  getChannelSeed(channelId: string): Uint8Array | null {
    const seeds = this.getAllChannelSeeds()
    const seedHex = seeds[channelId]
    return seedHex ? new Uint8Array(Buffer.from(seedHex, 'hex')) : null
  }

  getAllChannelSeeds(): Record<string, string> {
    try {
      const data = lightningStorage.getString(STORAGE_KEYS.CHANNEL_SEEDS)
      return data ? JSON.parse(data) : {}
    } catch (error) {
      console.error('[lightning-repo] Failed to parse channel seeds:', error)
      lightningStorage.delete(STORAGE_KEYS.CHANNEL_SEEDS)
      return {}
    }
  }

  // Routing Graph
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
      console.error('[lightning-repo] Failed to parse routing graph:', error)
      lightningStorage.delete(STORAGE_KEYS.ROUTING_GRAPH)
      return { nodes: {}, channels: {} }
    }
  }

  // Utility methods
  saveInitState(state: any): void {
    try {
      lightningStorage.set(STORAGE_KEYS.INIT_STATE, JSON.stringify(state))
    } catch (error) {
      console.error('[lightning-repo] Failed to save init state:', error)
    }
  }

  loadInitState(): any | null {
    try {
      const data = lightningStorage.getString(STORAGE_KEYS.INIT_STATE)
      return data ? JSON.parse(data) : null
    } catch (error) {
      console.error('[lightning-repo] Failed to load init state:', error)
      return null
    }
  }

  clearAll(): void {
    lightningStorage.clearAll()
  }

  exportData(): string {
    const snapshot = {
      channels: this.findAllChannels(),
      peers: this.findAllPeers(),
      preimages: this.findAllPreimages(),
      payments: this.findAllPaymentInfos(),
      invoices: this.findAllInvoices(),
      channelSeeds: this.getAllChannelSeeds(),
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
      console.error('[lightning-repo] Failed to import data:', error)
    }
  }

  // ==========================================
  // WATCHTOWER
  // ==========================================

  saveWatchtowerChannel(channelId: string, data: PersistedWatchtowerChannel): void {
    const channels = this.getWatchtowerChannels()
    channels[channelId] = data
    lightningStorage.set(STORAGE_KEYS.WATCHTOWER_CHANNELS, JSON.stringify(channels))
  }

  getWatchtowerChannel(channelId: string): PersistedWatchtowerChannel | null {
    const channels = this.getWatchtowerChannels()
    return channels[channelId] || null
  }

  getWatchtowerChannels(): Record<string, PersistedWatchtowerChannel> {
    try {
      const data = lightningStorage.getString(STORAGE_KEYS.WATCHTOWER_CHANNELS)
      return data ? JSON.parse(data) : {}
    } catch (error) {
      console.error('[lightning-repo] Failed to parse watchtower channels:', error)
      lightningStorage.delete(STORAGE_KEYS.WATCHTOWER_CHANNELS)
      return {}
    }
  }

  deleteWatchtowerChannel(channelId: string): void {
    const channels = this.getWatchtowerChannels()
    delete channels[channelId]
    lightningStorage.set(STORAGE_KEYS.WATCHTOWER_CHANNELS, JSON.stringify(channels))
  }

  saveWatchtowerStats(stats: PersistedWatchtowerStats): void {
    lightningStorage.set(STORAGE_KEYS.WATCHTOWER_STATS, JSON.stringify(stats))
  }

  getWatchtowerStats(): PersistedWatchtowerStats | null {
    try {
      const data = lightningStorage.getString(STORAGE_KEYS.WATCHTOWER_STATS)
      return data ? JSON.parse(data) : null
    } catch (error) {
      console.error('[lightning-repo] Failed to parse watchtower stats:', error)
      return null
    }
  }

  clearWatchtowerData(): void {
    lightningStorage.delete(STORAGE_KEYS.WATCHTOWER_CHANNELS)
    lightningStorage.delete(STORAGE_KEYS.WATCHTOWER_STATS)
  }

  // ==========================================
  // CHANNEL BACKUP & RESTORE
  // ==========================================

  /**
   * Salva backup de um canal
   */
  saveChannelBackup(channelId: string, backup: ChannelBackupData): void {
    const backups = this.getAllChannelBackups()
    backups[channelId] = backup
    lightningStorage.set(STORAGE_KEYS.CHANNEL_BACKUPS, JSON.stringify(backups))
    this.updateLastBackupTime()
  }

  /**
   * Obtém backup de um canal
   */
  getChannelBackup(channelId: string): ChannelBackupData | null {
    const backups = this.getAllChannelBackups()
    return backups[channelId] || null
  }

  /**
   * Obtém todos os backups de canais
   */
  getAllChannelBackups(): Record<string, ChannelBackupData> {
    try {
      const data = lightningStorage.getString(STORAGE_KEYS.CHANNEL_BACKUPS)
      return data ? JSON.parse(data) : {}
    } catch (error) {
      console.error('[lightning-repo] Failed to parse channel backups:', error)
      lightningStorage.delete(STORAGE_KEYS.CHANNEL_BACKUPS)
      return {}
    }
  }

  /**
   * Remove backup de um canal
   */
  deleteChannelBackup(channelId: string): void {
    const backups = this.getAllChannelBackups()
    delete backups[channelId]
    lightningStorage.set(STORAGE_KEYS.CHANNEL_BACKUPS, JSON.stringify(backups))
  }

  /**
   * Cria backup completo de todos os canais
   */
  createFullBackup(): FullBackup {
    const channels = this.findAllChannels()
    const peers = this.findAllPeers()
    const seeds = this.getAllChannelSeeds()
    const nodeKey = this.getNodeKey()

    const channelBackups: ChannelBackupData[] = []

    for (const [channelId, channel] of Object.entries(channels)) {
      const seed = seeds[channelId]
      const peer = peers[channel.nodeId]

      if (!seed || !peer || !channel.fundingTxid) {
        console.warn(`[lightning-repo] Skipping channel ${channelId} - missing data`)
        continue
      }

      try {
        const backup = createBackupFromPersistedChannel(
          channel,
          {
            localPrivkey: nodeKey ? uint8ArrayToHex(nodeKey) : '',
            channelSeed: seed,
          },
          {
            host: peer.host,
            port: peer.port,
          },
        )
        channelBackups.push(backup)
      } catch (error) {
        console.error(`[lightning-repo] Failed to create backup for channel ${channelId}:`, error)
      }
    }

    return {
      version: CHANNEL_BACKUP_VERSION,
      createdAt: Date.now(),
      nodePrivkey: nodeKey ? uint8ArrayToHex(nodeKey) : undefined,
      channels: channelBackups,
    }
  }

  /**
   * Exporta backup encriptado como string
   */
  exportEncryptedBackup(password: string): string {
    const backup = this.createFullBackup()
    return exportEncryptedBackup(backup, password)
  }

  /**
   * Importa backup encriptado
   */
  importEncryptedBackup(data: string, password: string): FullBackup {
    return importEncryptedBackup(data, password)
  }

  /**
   * Salva contexto de restauração
   */
  saveRestoreContext(channelId: string, context: RestoreContext): void {
    const contexts = this.getAllRestoreContexts()
    contexts[channelId] = context
    lightningStorage.set(STORAGE_KEYS.RESTORE_CONTEXTS, JSON.stringify(contexts))
  }

  /**
   * Obtém contexto de restauração
   */
  getRestoreContext(channelId: string): RestoreContext | null {
    const contexts = this.getAllRestoreContexts()
    return contexts[channelId] || null
  }

  /**
   * Obtém todos os contextos de restauração
   */
  getAllRestoreContexts(): Record<string, RestoreContext> {
    try {
      const data = lightningStorage.getString(STORAGE_KEYS.RESTORE_CONTEXTS)
      return data ? JSON.parse(data) : {}
    } catch (error) {
      console.error('[lightning-repo] Failed to parse restore contexts:', error)
      lightningStorage.delete(STORAGE_KEYS.RESTORE_CONTEXTS)
      return {}
    }
  }

  /**
   * Inicia restauração de todos os canais de um backup
   */
  startBackupRestore(backup: FullBackup): RestoreContext[] {
    const contexts: RestoreContext[] = []

    for (const channelBackup of backup.channels) {
      const context = prepareChannelRestore(channelBackup)
      this.saveRestoreContext(channelBackup.channelId, context)
      contexts.push(context)
    }

    return contexts
  }

  /**
   * Atualiza estado de restauração de um canal
   */
  updateRestoreState(channelId: string, state: RestoreState, error?: string): void {
    const context = this.getRestoreContext(channelId)
    if (context) {
      context.state = state
      context.lastAttempt = Date.now()
      context.attempts += 1
      if (error) {
        context.error = error
      }
      this.saveRestoreContext(channelId, context)
    }
  }

  /**
   * Atualiza timestamp do último backup
   */
  updateLastBackupTime(): void {
    lightningStorage.set(STORAGE_KEYS.LAST_BACKUP_TIME, Date.now().toString())
  }

  /**
   * Obtém timestamp do último backup
   */
  getLastBackupTime(): number | null {
    const data = lightningStorage.getString(STORAGE_KEYS.LAST_BACKUP_TIME)
    return data ? parseInt(data, 10) : null
  }

  /**
   * Limpa dados de restauração
   */
  clearRestoreData(): void {
    lightningStorage.delete(STORAGE_KEYS.RESTORE_CONTEXTS)
  }

  // ==========================================
  // PEER MANAGEMENT (similar to Electrum repository)
  // ==========================================

  /**
   * Salva timestamp da última atualização de peers
   */
  setLastPeerUpdate(timestamp: number): void {
    try {
      lightningStorage.set(STORAGE_KEYS.LAST_PEER_UPDATE, timestamp)
    } catch (error) {
      console.error('[lightning-repo] Failed to save last peer update:', error)
    }
  }

  /**
   * Obtém timestamp da última atualização de peers
   */
  getLastPeerUpdate(): number | null {
    try {
      const timestamp = lightningStorage.getNumber(STORAGE_KEYS.LAST_PEER_UPDATE)
      return timestamp ?? null
    } catch (error) {
      console.error('[lightning-repo] Failed to get last peer update:', error)
      return null
    }
  }

  /**
   * Salva estatísticas de um peer específico
   */
  savePeerStats(nodeId: string, stats: Partial<PersistedPeer>): void {
    try {
      const allStats = this.getAllPeerStats()
      allStats[nodeId] = { ...allStats[nodeId], ...stats, nodeId } as PersistedPeer
      lightningStorage.set(STORAGE_KEYS.PEER_STATS, JSON.stringify(allStats))
    } catch (error) {
      console.error('[lightning-repo] Failed to save peer stats:', error)
    }
  }

  /**
   * Obtém estatísticas de um peer específico
   */
  getPeerStats(nodeId: string): PersistedPeer | null {
    const allStats = this.getAllPeerStats()
    return allStats[nodeId] || null
  }

  /**
   * Obtém todas as estatísticas de peers
   */
  getAllPeerStats(): Record<string, PersistedPeer> {
    try {
      const data = lightningStorage.getString(STORAGE_KEYS.PEER_STATS)
      if (data) {
        return JSON.parse(data)
      }
      return {}
    } catch (error) {
      console.error('[lightning-repo] Failed to parse peer stats:', error)
      lightningStorage.delete(STORAGE_KEYS.PEER_STATS)
      return {}
    }
  }

  /**
   * Limpa todas as estatísticas de peers
   */
  clearPeerStats(): void {
    lightningStorage.delete(STORAGE_KEYS.PEER_STATS)
  }

  /**
   * Obtém peers ordenados por sucesso de conexão
   */
  getPeersByReliability(): PersistedPeer[] {
    const allPeers = this.findAllPeers()
    const peerStats = this.getAllPeerStats()

    return Object.values(allPeers)
      .map(peer => ({
        ...peer,
        ...(peerStats[peer.nodeId] || {}),
      }))
      .sort((a, b) => {
        // Priorizar por score (maior score primeiro), depois por lastConnected
        const aScore = a.score || 0
        const bScore = b.score || 0

        if (aScore !== bScore) {
          return bScore - aScore
        }

        // Tiebreaker: peers conectados mais recentemente
        const aLastConnected = a.lastConnected || 0
        const bLastConnected = b.lastConnected || 0
        return bLastConnected - aLastConnected
      })
  }
}

// Helper function
function uint8ArrayToHex(array: Uint8Array): string {
  return Array.from(array)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

const lightningRepository = new LightningRepository()

export default lightningRepository
