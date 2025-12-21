/**
 * Lightning Network Database Module
 *
 * Exports for the SQLite-based gossip graph database.
 *
 * Architecture:
 * - gossip.db: Unencrypted, public gossip data (channels, nodes, policies)
 * - lightning.db: SQLCipher encrypted, user's private data (future: channels, invoices)
 *
 * The gossip database is designed for Electrum-scale network graphs:
 * - 12,000+ nodes
 * - 40,000+ channels
 * - O(1) lookups with proper indexing
 */

// Schema exports
export * from './schema'

// Database class exports
export { GossipDatabase, getGossipDatabase, closeGossipDatabase } from './gossip-database'
