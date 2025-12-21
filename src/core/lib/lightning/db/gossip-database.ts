/**
 * GossipDatabase - SQLite database for Lightning Network gossip data
 *
 * This class provides a high-performance database for storing the Lightning
 * Network's gossip graph (channel_announcements, channel_updates, node_announcements).
 *
 * Design decisions:
 * - Uses expo-sqlite with Drizzle ORM for type-safe queries
 * - Gossip data is PUBLIC and does NOT require encryption
 * - Separate database from user's private channel data
 * - Optimized for Electrum-scale network (12k+ nodes, 40k+ channels)
 *
 * @see electrum/electrum/channel_db.py for reference implementation
 */

import { drizzle, ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite'
import { eq, or, sql, inArray } from 'drizzle-orm'
import * as SQLite from 'expo-sqlite'

import * as schema from './schema'
import {
  ChannelInfo,
  NewChannelInfo,
  Policy,
  NewPolicy,
  NodeInfo,
  NewNodeInfo,
  NodeAddress,
  NewNodeAddress,
} from './schema'

// =============================================================================
// CONSTANTS
// =============================================================================

const DATABASE_NAME = 'gossip.db'

// Prune channels older than this (approximately 2 weeks in blocks)
const CHANNEL_EXPIRY_BLOCKS = 2016

// =============================================================================
// GOSSIP DATABASE CLASS
// =============================================================================

export class GossipDatabase {
  private sqlite: SQLite.SQLiteDatabase
  private db: ExpoSQLiteDatabase<typeof schema>
  private initialized = false

  constructor() {
    // Open SQLite database (no encryption for public gossip data)
    this.sqlite = SQLite.openDatabaseSync(DATABASE_NAME)
    this.db = drizzle(this.sqlite, { schema })
  }

  /**
   * Initialize the database (create tables if needed)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    // Create tables using raw SQL (Drizzle's push for migrations)
    await this.sqlite.execAsync(`
      CREATE TABLE IF NOT EXISTS channel_info (
        short_channel_id TEXT PRIMARY KEY,
        funding_txid TEXT NOT NULL,
        funding_output_index INTEGER NOT NULL,
        capacity_sat INTEGER NOT NULL,
        node1_id TEXT NOT NULL,
        node2_id TEXT NOT NULL,
        announcement BLOB,
        received_at INTEGER NOT NULL,
        block_height INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_channel_node1 ON channel_info(node1_id);
      CREATE INDEX IF NOT EXISTS idx_channel_node2 ON channel_info(node2_id);
      CREATE INDEX IF NOT EXISTS idx_channel_capacity ON channel_info(capacity_sat);
      CREATE INDEX IF NOT EXISTS idx_channel_block_height ON channel_info(block_height);

      CREATE TABLE IF NOT EXISTS policy (
        short_channel_id TEXT NOT NULL,
        direction INTEGER NOT NULL,
        fee_base_msat INTEGER NOT NULL,
        fee_proportional_millionths INTEGER NOT NULL,
        htlc_minimum_msat INTEGER NOT NULL,
        htlc_maximum_msat INTEGER,
        cltv_expiry_delta INTEGER NOT NULL,
        channel_flags INTEGER NOT NULL,
        message_flags INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        channel_update BLOB,
        PRIMARY KEY (short_channel_id, direction)
      );

      CREATE INDEX IF NOT EXISTS idx_policy_scid ON policy(short_channel_id);
      CREATE INDEX IF NOT EXISTS idx_policy_timestamp ON policy(timestamp);

      CREATE TABLE IF NOT EXISTS node_info (
        node_id TEXT PRIMARY KEY,
        alias TEXT,
        color TEXT,
        features TEXT,
        timestamp INTEGER NOT NULL,
        announcement BLOB
      );

      CREATE INDEX IF NOT EXISTS idx_node_alias ON node_info(alias);
      CREATE INDEX IF NOT EXISTS idx_node_timestamp ON node_info(timestamp);

      CREATE TABLE IF NOT EXISTS node_address (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id TEXT NOT NULL,
        address_type INTEGER NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_address_node ON node_address(node_id);
    `)

    this.initialized = true
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.sqlite.closeSync()
  }

  // ===========================================================================
  // CHANNEL OPERATIONS
  // ===========================================================================

  /**
   * Insert or update a channel
   */
  async upsertChannel(channel: NewChannelInfo): Promise<void> {
    await this.db
      .insert(schema.channelInfo)
      .values(channel)
      .onConflictDoUpdate({
        target: schema.channelInfo.shortChannelId,
        set: {
          capacitySat: channel.capacitySat,
          announcement: channel.announcement,
          receivedAt: channel.receivedAt,
        },
      })
  }

  /**
   * Insert multiple channels in a batch (for sync)
   */
  async upsertChannelsBatch(channels: NewChannelInfo[]): Promise<void> {
    if (channels.length === 0) return

    // SQLite batch insert with ON CONFLICT
    const BATCH_SIZE = 500
    for (let i = 0; i < channels.length; i += BATCH_SIZE) {
      const batch = channels.slice(i, i + BATCH_SIZE)
      await this.db.insert(schema.channelInfo).values(batch).onConflictDoNothing()
    }
  }

  /**
   * Get a channel by short_channel_id
   */
  async getChannel(shortChannelId: string): Promise<ChannelInfo | undefined> {
    const results = await this.db
      .select()
      .from(schema.channelInfo)
      .where(eq(schema.channelInfo.shortChannelId, shortChannelId))
      .limit(1)

    return results[0]
  }

  /**
   * Get all channels for a node
   */
  async getChannelsForNode(nodeId: string): Promise<ChannelInfo[]> {
    return this.db
      .select()
      .from(schema.channelInfo)
      .where(or(eq(schema.channelInfo.node1Id, nodeId), eq(schema.channelInfo.node2Id, nodeId)))
  }

  /**
   * Get all channels (for graph building)
   */
  async getAllChannels(): Promise<ChannelInfo[]> {
    return this.db.select().from(schema.channelInfo)
  }

  /**
   * Get channel count
   */
  async getChannelCount(): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)` }).from(schema.channelInfo)
    return result[0]?.count ?? 0
  }

  /**
   * Delete a channel
   */
  async deleteChannel(shortChannelId: string): Promise<void> {
    await this.db
      .delete(schema.channelInfo)
      .where(eq(schema.channelInfo.shortChannelId, shortChannelId))

    // Also delete associated policies
    await this.db.delete(schema.policy).where(eq(schema.policy.shortChannelId, shortChannelId))
  }

  /**
   * Prune old channels (below current block height - expiry)
   */
  async pruneOldChannels(currentBlockHeight: number): Promise<number> {
    const minHeight = currentBlockHeight - CHANNEL_EXPIRY_BLOCKS

    const result = await this.db
      .delete(schema.channelInfo)
      .where(sql`${schema.channelInfo.blockHeight} < ${minHeight}`)
      .returning({ shortChannelId: schema.channelInfo.shortChannelId })

    // Delete associated policies
    if (result.length > 0) {
      const scids = result.map(r => r.shortChannelId)
      await this.db.delete(schema.policy).where(inArray(schema.policy.shortChannelId, scids))
    }

    return result.length
  }

  // ===========================================================================
  // POLICY OPERATIONS
  // ===========================================================================

  /**
   * Insert or update a channel policy
   */
  async upsertPolicy(policyData: NewPolicy): Promise<void> {
    await this.db
      .insert(schema.policy)
      .values(policyData)
      .onConflictDoUpdate({
        target: [schema.policy.shortChannelId, schema.policy.direction],
        set: {
          feeBaseMsat: policyData.feeBaseMsat,
          feeProportionalMillionths: policyData.feeProportionalMillionths,
          htlcMinimumMsat: policyData.htlcMinimumMsat,
          htlcMaximumMsat: policyData.htlcMaximumMsat,
          cltvExpiryDelta: policyData.cltvExpiryDelta,
          channelFlags: policyData.channelFlags,
          messageFlags: policyData.messageFlags,
          timestamp: policyData.timestamp,
          channelUpdate: policyData.channelUpdate,
        },
      })
  }

  /**
   * Insert multiple policies in a batch
   */
  async upsertPoliciesBatch(policies: NewPolicy[]): Promise<void> {
    if (policies.length === 0) return

    const BATCH_SIZE = 500
    for (let i = 0; i < policies.length; i += BATCH_SIZE) {
      const batch = policies.slice(i, i + BATCH_SIZE)
      await this.db.insert(schema.policy).values(batch).onConflictDoNothing()
    }
  }

  /**
   * Get policies for a channel
   */
  async getPoliciesForChannel(shortChannelId: string): Promise<Policy[]> {
    return this.db
      .select()
      .from(schema.policy)
      .where(eq(schema.policy.shortChannelId, shortChannelId))
  }

  /**
   * Get all policies (for routing calculations)
   */
  async getAllPolicies(): Promise<Policy[]> {
    return this.db.select().from(schema.policy)
  }

  // ===========================================================================
  // NODE OPERATIONS
  // ===========================================================================

  /**
   * Insert or update a node
   */
  async upsertNode(node: NewNodeInfo): Promise<void> {
    await this.db
      .insert(schema.nodeInfo)
      .values(node)
      .onConflictDoUpdate({
        target: schema.nodeInfo.nodeId,
        set: {
          alias: node.alias,
          color: node.color,
          features: node.features,
          timestamp: node.timestamp,
          announcement: node.announcement,
        },
      })
  }

  /**
   * Insert multiple nodes in a batch
   */
  async upsertNodesBatch(nodes: NewNodeInfo[]): Promise<void> {
    if (nodes.length === 0) return

    const BATCH_SIZE = 500
    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE)
      await this.db.insert(schema.nodeInfo).values(batch).onConflictDoNothing()
    }
  }

  /**
   * Get a node by ID
   */
  async getNode(nodeId: string): Promise<NodeInfo | undefined> {
    const results = await this.db
      .select()
      .from(schema.nodeInfo)
      .where(eq(schema.nodeInfo.nodeId, nodeId))
      .limit(1)

    return results[0]
  }

  /**
   * Get all nodes
   */
  async getAllNodes(): Promise<NodeInfo[]> {
    return this.db.select().from(schema.nodeInfo)
  }

  /**
   * Get node count
   */
  async getNodeCount(): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)` }).from(schema.nodeInfo)
    return result[0]?.count ?? 0
  }

  /**
   * Search nodes by alias (fuzzy search)
   */
  async searchNodesByAlias(searchTerm: string, limit = 50): Promise<NodeInfo[]> {
    return this.db
      .select()
      .from(schema.nodeInfo)
      .where(sql`${schema.nodeInfo.alias} LIKE ${'%' + searchTerm + '%'}`)
      .limit(limit)
  }

  // ===========================================================================
  // NODE ADDRESS OPERATIONS
  // ===========================================================================

  /**
   * Set addresses for a node (replaces existing)
   */
  async setNodeAddresses(
    nodeId: string,
    addresses: Omit<NewNodeAddress, 'nodeId'>[],
  ): Promise<void> {
    // Delete existing addresses
    await this.db.delete(schema.nodeAddress).where(eq(schema.nodeAddress.nodeId, nodeId))

    // Insert new addresses
    if (addresses.length > 0) {
      await this.db.insert(schema.nodeAddress).values(addresses.map(addr => ({ ...addr, nodeId })))
    }
  }

  /**
   * Get addresses for a node
   */
  async getNodeAddresses(nodeId: string): Promise<NodeAddress[]> {
    return this.db.select().from(schema.nodeAddress).where(eq(schema.nodeAddress.nodeId, nodeId))
  }

  // ===========================================================================
  // GRAPH STATISTICS
  // ===========================================================================

  /**
   * Get graph statistics
   */
  async getStats(): Promise<{
    nodeCount: number
    channelCount: number
    totalCapacitySat: number
  }> {
    const [nodeResult, channelResult, capacityResult] = await Promise.all([
      this.db.select({ count: sql<number>`count(*)` }).from(schema.nodeInfo),
      this.db.select({ count: sql<number>`count(*)` }).from(schema.channelInfo),
      this.db
        .select({ total: sql<number>`coalesce(sum(capacity_sat), 0)` })
        .from(schema.channelInfo),
    ])

    return {
      nodeCount: nodeResult[0]?.count ?? 0,
      channelCount: channelResult[0]?.count ?? 0,
      totalCapacitySat: capacityResult[0]?.total ?? 0,
    }
  }

  // ===========================================================================
  // SYNC HELPERS
  // ===========================================================================

  /**
   * Get latest channel timestamp (for incremental sync)
   */
  async getLatestChannelTimestamp(): Promise<number | null> {
    const result = await this.db
      .select({ maxTimestamp: sql<number>`max(received_at)` })
      .from(schema.channelInfo)

    return result[0]?.maxTimestamp ?? null
  }

  /**
   * Get latest policy timestamp (for incremental sync)
   */
  async getLatestPolicyTimestamp(): Promise<number | null> {
    const result = await this.db
      .select({ maxTimestamp: sql<number>`max(timestamp)` })
      .from(schema.policy)

    return result[0]?.maxTimestamp ?? null
  }

  /**
   * Get latest node timestamp (for incremental sync)
   */
  async getLatestNodeTimestamp(): Promise<number | null> {
    const result = await this.db
      .select({ maxTimestamp: sql<number>`max(timestamp)` })
      .from(schema.nodeInfo)

    return result[0]?.maxTimestamp ?? null
  }

  /**
   * Clear all data (for testing or reset)
   */
  async clear(): Promise<void> {
    await this.db.delete(schema.nodeAddress)
    await this.db.delete(schema.policy)
    await this.db.delete(schema.nodeInfo)
    await this.db.delete(schema.channelInfo)
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let instance: GossipDatabase | null = null

/**
 * Get the singleton GossipDatabase instance
 */
export function getGossipDatabase(): GossipDatabase {
  if (!instance) {
    instance = new GossipDatabase()
  }
  return instance
}

/**
 * Close and cleanup the database
 */
export function closeGossipDatabase(): void {
  if (instance) {
    instance.close()
    instance = null
  }
}
