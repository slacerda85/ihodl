/**
 * PersistentRoutingGraph - SQLite-backed Routing Graph
 *
 * This class extends the in-memory RoutingGraph to use SQLite (via GossipDatabase)
 * for persistence. It maintains an in-memory cache for fast pathfinding while
 * persisting all changes to SQLite.
 *
 * Architecture:
 * - Write-through cache: All mutations go to both SQLite and memory
 * - Lazy loading: Graph is loaded from SQLite on first access
 * - Batch operations: Bulk inserts use SQLite's batch capabilities
 *
 * Designed for Electrum-scale: 12k+ nodes, 40k+ channels
 *
 * @see GossipDatabase for SQLite operations
 * @see RoutingGraph for pathfinding algorithm
 */

import { RoutingGraph, RoutingNode, RoutingChannel, NodeAddress } from './routing'
import { GossipDatabase, getGossipDatabase } from './db'
import { ChannelInfo, NodeInfo, NodeAddress as DbNodeAddress } from './db/schema'

// =============================================================================
// LOGGING
// =============================================================================

function logPersistent(tag: string, message: string, data?: unknown): void {
  const now = new Date()
  const timestamp = `${now.toISOString().slice(11, 23)}`
  const fullMessage = `[${timestamp}][persistent-graph:${tag}] ${message}`
  if (data !== undefined) {
    console.log(fullMessage, data)
  } else {
    console.log(fullMessage)
  }
}

// =============================================================================
// CONVERSION UTILITIES
// =============================================================================

function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return bytes
}

function addressTypeToNumber(type: NodeAddress['type']): number {
  switch (type) {
    case 'ipv4':
      return 1
    case 'ipv6':
      return 2
    case 'torv2':
      return 3
    case 'torv3':
      return 4
    case 'dns':
      return 5
    default:
      return 0
  }
}

function numberToAddressType(num: number): NodeAddress['type'] {
  switch (num) {
    case 1:
      return 'ipv4'
    case 2:
      return 'ipv6'
    case 3:
      return 'torv2'
    case 4:
      return 'torv3'
    case 5:
      return 'dns'
    default:
      return 'ipv4'
  }
}

/**
 * Extract block height from short_channel_id
 * Format: block_height (3 bytes) | tx_index (3 bytes) | output_index (2 bytes)
 */
function extractBlockHeight(shortChannelId: Uint8Array): number {
  if (shortChannelId.length !== 8) return 0
  return (shortChannelId[0] << 16) | (shortChannelId[1] << 8) | shortChannelId[2]
}

// =============================================================================
// PERSISTENT ROUTING GRAPH CLASS
// =============================================================================

export class PersistentRoutingGraph extends RoutingGraph {
  private db: GossipDatabase
  private loaded = false
  private loading: Promise<void> | null = null

  constructor(database?: GossipDatabase) {
    super()
    this.db = database ?? getGossipDatabase()
  }

  /**
   * Initialize database and load graph from SQLite
   */
  async initialize(): Promise<void> {
    if (this.loaded) return
    if (this.loading) return this.loading

    this.loading = this.doInitialize()
    await this.loading
    this.loading = null
  }

  private async doInitialize(): Promise<void> {
    const startTime = Date.now()
    logPersistent('init', 'Initializing database...')

    await this.db.initialize()

    // Load all data from SQLite into memory
    await this.loadFromDatabase()

    const elapsed = Date.now() - startTime
    const stats = this.getStats()
    logPersistent('init', `Loaded ${stats.nodes} nodes, ${stats.channels} channels in ${elapsed}ms`)

    this.loaded = true
  }

  /**
   * Load all graph data from SQLite into memory
   */
  private async loadFromDatabase(): Promise<void> {
    // Load nodes
    const dbNodes = await this.db.getAllNodes()
    for (const dbNode of dbNodes) {
      const addresses = await this.db.getNodeAddresses(dbNode.nodeId)
      const node = this.dbNodeToRoutingNode(dbNode, addresses)
      super.addNode(node)
    }

    // Load channels
    const dbChannels = await this.db.getAllChannels()
    for (const dbChannel of dbChannels) {
      const channel = await this.dbChannelToRoutingChannel(dbChannel)
      if (channel) {
        super.addChannel(channel)
      }
    }
  }

  /**
   * Convert DB NodeInfo to RoutingNode
   */
  private dbNodeToRoutingNode(dbNode: NodeInfo, addresses: DbNodeAddress[]): RoutingNode {
    return {
      nodeId: hexToUint8Array(dbNode.nodeId),
      features: dbNode.features ? hexToUint8Array(dbNode.features) : undefined,
      lastUpdate: dbNode.timestamp instanceof Date ? dbNode.timestamp.getTime() : dbNode.timestamp,
      addresses: addresses.map(addr => ({
        type: numberToAddressType(addr.addressType),
        address: addr.host,
        port: addr.port,
      })),
      alias: dbNode.alias ?? undefined,
    }
  }

  /**
   * Convert DB ChannelInfo to RoutingChannel (with policies)
   */
  private async dbChannelToRoutingChannel(dbChannel: ChannelInfo): Promise<RoutingChannel | null> {
    const policies = await this.db.getPoliciesForChannel(dbChannel.shortChannelId)

    // Use direction 0 policy for channel defaults (or first available)
    const policy = policies.find(p => p.direction === 0) ?? policies[0]

    if (!policy) {
      // Channel without policies - use defaults
      return {
        shortChannelId: hexToUint8Array(dbChannel.shortChannelId),
        nodeId1: hexToUint8Array(dbChannel.node1Id),
        nodeId2: hexToUint8Array(dbChannel.node2Id),
        capacity: BigInt(dbChannel.capacitySat) * 1000n, // sat to msat
        lastUpdate:
          dbChannel.receivedAt instanceof Date
            ? dbChannel.receivedAt.getTime()
            : dbChannel.receivedAt,
        feeBaseMsat: 1000, // Default 1 sat base fee
        feeProportionalMillionths: 1, // Default 0.0001%
        cltvExpiryDelta: 40, // Default 40 blocks
        htlcMinimumMsat: 1000n, // Default 1 sat
        htlcMaximumMsat: BigInt(dbChannel.capacitySat) * 1000n,
        disabled: false,
      }
    }

    const isDisabled = (policy.channelFlags & 1) !== 0

    return {
      shortChannelId: hexToUint8Array(dbChannel.shortChannelId),
      nodeId1: hexToUint8Array(dbChannel.node1Id),
      nodeId2: hexToUint8Array(dbChannel.node2Id),
      capacity: BigInt(dbChannel.capacitySat) * 1000n,
      lastUpdate:
        policy.timestamp instanceof Date ? policy.timestamp.getTime() : Number(policy.timestamp),
      feeBaseMsat: policy.feeBaseMsat,
      feeProportionalMillionths: policy.feeProportionalMillionths,
      cltvExpiryDelta: policy.cltvExpiryDelta,
      htlcMinimumMsat: BigInt(policy.htlcMinimumMsat),
      htlcMaximumMsat: policy.htlcMaximumMsat
        ? BigInt(policy.htlcMaximumMsat)
        : BigInt(dbChannel.capacitySat) * 1000n,
      disabled: isDisabled,
    }
  }

  // ===========================================================================
  // OVERRIDE METHODS - Write-through to SQLite
  // ===========================================================================

  /**
   * Add or update node - persists to SQLite
   */
  override addNode(node: RoutingNode): void {
    // Add to in-memory graph
    super.addNode(node)

    // Persist to SQLite (fire-and-forget for performance)
    this.persistNode(node).catch(err => {
      logPersistent('addNode', 'Error persisting node:', err)
    })
  }

  /**
   * Add or update channel - persists to SQLite
   */
  override addChannel(channel: RoutingChannel): void {
    // Add to in-memory graph
    super.addChannel(channel)

    // Persist to SQLite (fire-and-forget for performance)
    this.persistChannel(channel).catch(err => {
      logPersistent('addChannel', 'Error persisting channel:', err)
    })
  }

  /**
   * Prune stale entries - also prunes from SQLite
   */
  override pruneStaleEntries(maxAge: number = 7 * 24 * 60 * 60 * 1000): void {
    // Prune from in-memory graph
    super.pruneStaleEntries(maxAge)

    // Calculate equivalent block height for pruning
    // Assume ~10 min blocks, maxAge in ms
    const blocksInMaxAge = Math.floor(maxAge / (10 * 60 * 1000))
    const estimatedCurrentBlock = Math.floor(Date.now() / (10 * 60 * 1000))

    // Prune from SQLite
    this.db.pruneOldChannels(estimatedCurrentBlock - blocksInMaxAge).catch(err => {
      logPersistent('prune', 'Error pruning old channels:', err)
    })
  }

  // ===========================================================================
  // PERSISTENCE METHODS
  // ===========================================================================

  private async persistNode(node: RoutingNode): Promise<void> {
    const nodeId = uint8ArrayToHex(node.nodeId)

    await this.db.upsertNode({
      nodeId,
      alias: node.alias ?? null,
      color: null,
      features: node.features ? uint8ArrayToHex(node.features) : null,
      timestamp: new Date(node.lastUpdate),
      announcement: null,
    })

    // Persist addresses
    if (node.addresses.length > 0) {
      await this.db.setNodeAddresses(
        nodeId,
        node.addresses.map(addr => ({
          addressType: addressTypeToNumber(addr.type),
          host: addr.address,
          port: addr.port,
        })),
      )
    }
  }

  private async persistChannel(channel: RoutingChannel): Promise<void> {
    const shortChannelId = uint8ArrayToHex(channel.shortChannelId)
    const blockHeight = extractBlockHeight(channel.shortChannelId)

    // Persist channel info
    await this.db.upsertChannel({
      shortChannelId,
      fundingTxid: '', // TODO: Extract from SCID or announcements
      fundingOutputIndex: 0,
      capacitySat: Number(channel.capacity / 1000n), // msat to sat
      node1Id: uint8ArrayToHex(channel.nodeId1),
      node2Id: uint8ArrayToHex(channel.nodeId2),
      announcement: null,
      receivedAt: new Date(channel.lastUpdate),
      blockHeight,
    })

    // Persist policy (direction 0)
    await this.db.upsertPolicy({
      shortChannelId,
      direction: 0,
      feeBaseMsat: channel.feeBaseMsat,
      feeProportionalMillionths: channel.feeProportionalMillionths,
      htlcMinimumMsat: Number(channel.htlcMinimumMsat),
      htlcMaximumMsat: channel.htlcMaximumMsat ? Number(channel.htlcMaximumMsat) : null,
      cltvExpiryDelta: channel.cltvExpiryDelta,
      channelFlags: channel.disabled ? 1 : 0,
      messageFlags: channel.htlcMaximumMsat ? 1 : 0,
      timestamp: new Date(channel.lastUpdate),
      channelUpdate: null,
    })
  }

  // ===========================================================================
  // BATCH OPERATIONS (for sync)
  // ===========================================================================

  /**
   * Add multiple nodes in batch (optimized for sync)
   */
  async addNodesBatch(nodes: RoutingNode[]): Promise<void> {
    const startTime = Date.now()

    // Add to memory
    for (const node of nodes) {
      super.addNode(node)
    }

    // Persist to SQLite in batch
    await this.db.upsertNodesBatch(
      nodes.map(node => ({
        nodeId: uint8ArrayToHex(node.nodeId),
        alias: node.alias ?? null,
        color: null,
        features: node.features ? uint8ArrayToHex(node.features) : null,
        timestamp: new Date(node.lastUpdate),
        announcement: null,
      })),
    )

    const elapsed = Date.now() - startTime
    logPersistent('addNodesBatch', `Added ${nodes.length} nodes in ${elapsed}ms`)
  }

  /**
   * Add multiple channels in batch (optimized for sync)
   */
  async addChannelsBatch(channels: RoutingChannel[]): Promise<void> {
    const startTime = Date.now()

    // Add to memory
    for (const channel of channels) {
      super.addChannel(channel)
    }

    // Persist channels to SQLite
    await this.db.upsertChannelsBatch(
      channels.map(channel => ({
        shortChannelId: uint8ArrayToHex(channel.shortChannelId),
        fundingTxid: '',
        fundingOutputIndex: 0,
        capacitySat: Number(channel.capacity / 1000n),
        node1Id: uint8ArrayToHex(channel.nodeId1),
        node2Id: uint8ArrayToHex(channel.nodeId2),
        announcement: null,
        receivedAt: new Date(channel.lastUpdate),
        blockHeight: extractBlockHeight(channel.shortChannelId),
      })),
    )

    // Persist policies in batch
    await this.db.upsertPoliciesBatch(
      channels.map(channel => ({
        shortChannelId: uint8ArrayToHex(channel.shortChannelId),
        direction: 0,
        feeBaseMsat: channel.feeBaseMsat,
        feeProportionalMillionths: channel.feeProportionalMillionths,
        htlcMinimumMsat: Number(channel.htlcMinimumMsat),
        htlcMaximumMsat: channel.htlcMaximumMsat ? Number(channel.htlcMaximumMsat) : null,
        cltvExpiryDelta: channel.cltvExpiryDelta,
        channelFlags: channel.disabled ? 1 : 0,
        messageFlags: channel.htlcMaximumMsat ? 1 : 0,
        timestamp: new Date(channel.lastUpdate),
        channelUpdate: null,
      })),
    )

    const elapsed = Date.now() - startTime
    logPersistent('addChannelsBatch', `Added ${channels.length} channels in ${elapsed}ms`)
  }

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  /**
   * Get database statistics (async version with capacity)
   */
  async getDbStats(): Promise<{
    nodeCount: number
    channelCount: number
    totalCapacitySat: number
  }> {
    return this.db.getStats()
  }

  /**
   * Check if graph is loaded
   */
  isLoaded(): boolean {
    return this.loaded
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let persistentGraphInstance: PersistentRoutingGraph | null = null

/**
 * Get the singleton PersistentRoutingGraph instance
 */
export function getPersistentRoutingGraph(): PersistentRoutingGraph {
  if (!persistentGraphInstance) {
    persistentGraphInstance = new PersistentRoutingGraph()
  }
  return persistentGraphInstance
}

/**
 * Reset the singleton (for testing)
 */
export function resetPersistentRoutingGraph(): void {
  persistentGraphInstance = null
}
