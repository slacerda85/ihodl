/**
 * Lightning Network Gossip Database Schema
 *
 * This schema follows Electrum's channel_db.py structure for network graph storage.
 * Designed to handle 12k+ nodes and 40k+ channels efficiently.
 *
 * Tables:
 * - channelInfo: Core channel data (capacity, short_channel_id, nodes)
 * - policy: Channel routing policies (fees, CLTV, min/max HTLC)
 * - nodeInfo: Node metadata (alias, color, features)
 * - nodeAddress: Network addresses for nodes
 *
 * @see electrum/electrum/channel_db.py for reference implementation
 */

import { sqliteTable, text, integer, blob, index, primaryKey } from 'drizzle-orm/sqlite-core'

// =============================================================================
// CHANNEL INFO TABLE
// Core channel data from channel_announcement messages
// =============================================================================

export const channelInfo = sqliteTable(
  'channel_info',
  {
    // Short Channel ID (8 bytes) - unique identifier for channel
    // Format: block_height (3 bytes) | tx_index (3 bytes) | output_index (2 bytes)
    shortChannelId: text('short_channel_id').primaryKey(),

    // Funding transaction outpoint
    fundingTxid: text('funding_txid').notNull(),
    fundingOutputIndex: integer('funding_output_index').notNull(),

    // Channel capacity in satoshis
    capacitySat: integer('capacity_sat').notNull(),

    // Node public keys (33 bytes each, hex encoded)
    node1Id: text('node1_id').notNull(),
    node2Id: text('node2_id').notNull(),

    // Original announcement message (for signature verification)
    announcement: blob('announcement', { mode: 'buffer' }),

    // Timestamp when we received this announcement
    receivedAt: integer('received_at', { mode: 'timestamp_ms' }).notNull(),

    // Block height when channel was opened (derived from short_channel_id)
    blockHeight: integer('block_height').notNull(),
  },
  table => [
    index('idx_channel_node1').on(table.node1Id),
    index('idx_channel_node2').on(table.node2Id),
    index('idx_channel_capacity').on(table.capacitySat),
    index('idx_channel_block_height').on(table.blockHeight),
  ],
)

// =============================================================================
// POLICY TABLE
// Channel routing policies from channel_update messages
// Each channel has two policies (one per direction)
// =============================================================================

export const policy = sqliteTable(
  'policy',
  {
    // Short Channel ID this policy belongs to
    shortChannelId: text('short_channel_id').notNull(),

    // Direction: 0 = node1 -> node2, 1 = node2 -> node1
    direction: integer('direction').notNull(),

    // Routing fee base amount in millisatoshis
    feeBaseMsat: integer('fee_base_msat').notNull(),

    // Routing fee proportional rate (in millionths)
    feeProportionalMillionths: integer('fee_proportional_millionths').notNull(),

    // Minimum HTLC amount in millisatoshis
    htlcMinimumMsat: integer('htlc_minimum_msat').notNull(),

    // Maximum HTLC amount in millisatoshis (optional, 0 means no limit)
    htlcMaximumMsat: integer('htlc_maximum_msat'),

    // CLTV expiry delta (timelock in blocks)
    cltvExpiryDelta: integer('cltv_expiry_delta').notNull(),

    // Channel flags (bit 0: channel disabled, bit 1: direction)
    channelFlags: integer('channel_flags').notNull(),

    // Message flags (bit 0: htlc_maximum_msat field present)
    messageFlags: integer('message_flags').notNull(),

    // Timestamp from the channel_update message
    timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),

    // Original channel_update message (for signature verification)
    channelUpdate: blob('channel_update', { mode: 'buffer' }),
  },
  table => [
    // Composite primary key: (short_channel_id, direction)
    primaryKey({ columns: [table.shortChannelId, table.direction] }),
    index('idx_policy_scid').on(table.shortChannelId),
    index('idx_policy_timestamp').on(table.timestamp),
  ],
)

// =============================================================================
// NODE INFO TABLE
// Node metadata from node_announcement messages
// =============================================================================

export const nodeInfo = sqliteTable(
  'node_info',
  {
    // Node public key (33 bytes, hex encoded)
    nodeId: text('node_id').primaryKey(),

    // Human-readable alias (up to 32 bytes UTF-8)
    alias: text('alias'),

    // RGB color (3 bytes, hex encoded e.g., "3399ff")
    color: text('color'),

    // Feature flags (variable length, hex encoded)
    features: text('features'),

    // Timestamp from the node_announcement message
    timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),

    // Original node_announcement message (for signature verification)
    announcement: blob('announcement', { mode: 'buffer' }),
  },
  table => [
    index('idx_node_alias').on(table.alias),
    index('idx_node_timestamp').on(table.timestamp),
  ],
)

// =============================================================================
// NODE ADDRESS TABLE
// Network addresses from node_announcement messages
// Each node can have multiple addresses
// =============================================================================

export const nodeAddress = sqliteTable(
  'node_address',
  {
    // Auto-increment ID
    id: integer('id').primaryKey({ autoIncrement: true }),

    // Node this address belongs to
    nodeId: text('node_id').notNull(),

    // Address type: 1=IPv4, 2=IPv6, 3=Tor v2, 4=Tor v3, 5=DNS
    addressType: integer('address_type').notNull(),

    // Host (IP address, onion address, or hostname)
    host: text('host').notNull(),

    // Port number
    port: integer('port').notNull(),
  },
  table => [index('idx_address_node').on(table.nodeId)],
)

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type ChannelInfo = typeof channelInfo.$inferSelect
export type NewChannelInfo = typeof channelInfo.$inferInsert

export type Policy = typeof policy.$inferSelect
export type NewPolicy = typeof policy.$inferInsert

export type NodeInfo = typeof nodeInfo.$inferSelect
export type NewNodeInfo = typeof nodeInfo.$inferInsert

export type NodeAddress = typeof nodeAddress.$inferSelect
export type NewNodeAddress = typeof nodeAddress.$inferInsert
