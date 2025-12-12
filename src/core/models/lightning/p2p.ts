// BOLT #7: P2P Node and Channel Discovery
// Based on https://github.com/lightning/bolts/blob/master/07-routing-gossip.md

import {
  Byte,
  U16,
  U32,
  U64,
  ChainHash,
  ShortChannelId,
  Point,
  Signature,
  BigSize,
  Utf8,
} from './base'
import { getNetworkConfig } from '../../../config/network'

// Constants
export const BITCOIN_CHAIN_HASH = getNetworkConfig().lightning.chainHash

export const MIN_CHANNEL_ANNOUNCEMENT_CONFIRMATIONS = 6
export const CHANNEL_FORGET_SPEND_DELAY_BLOCKS = 72
export const STALE_CHANNEL_UPDATE_SECONDS = 1209600 // 2 weeks
export const GOSSIP_FLUSH_INTERVAL_SECONDS = 60

// Message Types (extending base)
export enum GossipMessageType {
  CHANNEL_ANNOUNCEMENT = 256,
  NODE_ANNOUNCEMENT = 257,
  CHANNEL_UPDATE = 258,
  ANNOUNCEMENT_SIGNATURES = 259,
  QUERY_SHORT_CHANNEL_IDS = 261,
  REPLY_SHORT_CHANNEL_IDS_END = 262,
  QUERY_CHANNEL_RANGE = 263,
  REPLY_CHANNEL_RANGE = 264,
  GOSSIP_TIMESTAMP_FILTER = 265,
}

// Encoding Types for compressed arrays
export enum EncodingType {
  UNCOMPRESSED = 0,
  ZLIB_DEPRECATED = 1, // MUST NOT be used
}

// Address Descriptor Types
export enum AddressType {
  IPV4 = 1,
  IPV6 = 2,
  TOR_V2_DEPRECATED = 3, // Deprecated
  TOR_V3 = 4,
  DNS_HOSTNAME = 5,
}

// Channel Flags (bitfield)
export enum ChannelFlag {
  DIRECTION = 0, // 0: node_id_1, 1: node_id_2
  DISABLE = 1, // 1: channel disabled
}

// Message Flags (bitfield)
export enum MessageFlag {
  MUST_BE_ONE = 0, // Always 1
  DONT_FORWARD = 1, // 1: don't forward to peers
}

// Query Flags (bitfield for query_short_channel_ids)
export enum QueryFlag {
  WANT_CHANNEL_ANNOUNCEMENT = 0,
  WANT_CHANNEL_UPDATE_NODE_1 = 1,
  WANT_CHANNEL_UPDATE_NODE_2 = 2,
  WANT_NODE_ANNOUNCEMENT_NODE_1 = 3,
  WANT_NODE_ANNOUNCEMENT_NODE_2 = 4,
}

// Query Option Flags (bitfield for query_channel_range)
export enum QueryOptionFlag {
  WANT_TIMESTAMPS = 0,
  WANT_CHECKSUMS = 1,
}

// Address Descriptors
export interface Ipv4Address {
  type: AddressType.IPV4
  addr: Uint8Array // 4 bytes
  port: U16
}

export interface Ipv6Address {
  type: AddressType.IPV6
  addr: Uint8Array // 16 bytes
  port: U16
}

export interface TorV3Address {
  type: AddressType.TOR_V3
  addr: Uint8Array // 35 bytes: 32-byte pubkey + 2-byte checksum + 1-byte version
  port: U16
}

export interface DnsHostnameAddress {
  type: AddressType.DNS_HOSTNAME
  hostnameLen: Byte
  hostname: Utf8 // ASCII characters
  port: U16
}

export type AddressDescriptor = Ipv4Address | Ipv6Address | TorV3Address | DnsHostnameAddress

// Announcement Signatures Message
export interface AnnouncementSignaturesMessage {
  type: GossipMessageType.ANNOUNCEMENT_SIGNATURES
  channelId: Uint8Array // 32 bytes
  shortChannelId: ShortChannelId
  nodeSignature: Signature
  bitcoinSignature: Signature
}

// Channel Announcement Message
export interface ChannelAnnouncementMessage {
  type: GossipMessageType.CHANNEL_ANNOUNCEMENT
  nodeSignature1: Signature
  nodeSignature2: Signature
  bitcoinSignature1: Signature
  bitcoinSignature2: Signature
  featuresLen: U16
  features: Uint8Array
  chainHash: ChainHash
  shortChannelId: ShortChannelId
  nodeId1: Point
  nodeId2: Point
  bitcoinKey1: Point
  bitcoinKey2: Point
}

// Node Announcement Message
export interface NodeAnnouncementMessage {
  type: GossipMessageType.NODE_ANNOUNCEMENT
  signature: Signature
  featuresLen: U16
  features: Uint8Array
  timestamp: U32
  nodeId: Point
  rgbColor: Uint8Array // 3 bytes
  alias: Uint8Array // 32 bytes, UTF-8 padded with 0s
  addrLen: U16
  addresses: AddressDescriptor[]
}

// Channel Update Message
export interface ChannelUpdateMessage {
  type: GossipMessageType.CHANNEL_UPDATE
  signature: Signature
  chainHash: ChainHash
  shortChannelId: ShortChannelId
  timestamp: U32
  messageFlags: Byte
  channelFlags: Byte
  cltvExpiryDelta: U16
  htlcMinimumMsat: U64
  feeBaseMsat: U32
  feeProportionalMillionths: U32
  htlcMaximumMsat: U64
}

// Query Short Channel IDs Message
export interface QueryShortChannelIdsMessage {
  type: GossipMessageType.QUERY_SHORT_CHANNEL_IDS
  chainHash: ChainHash
  len: U16
  encodedShortIds: Uint8Array
  tlvs: QueryShortChannelIdsTlvs
}

// TLV for Query Short Channel IDs
export interface QueryShortChannelIdsTlvs {
  queryFlags?: {
    encodingType: Byte
    encodedQueryFlags: Uint8Array
  }
}

// Reply Short Channel IDs End Message
export interface ReplyShortChannelIdsEndMessage {
  type: GossipMessageType.REPLY_SHORT_CHANNEL_IDS_END
  chainHash: ChainHash
  fullInformation: Byte
}

// Query Channel Range Message
export interface QueryChannelRangeMessage {
  type: GossipMessageType.QUERY_CHANNEL_RANGE
  chainHash: ChainHash
  firstBlocknum: U32
  numberOfBlocks: U32
  tlvs: QueryChannelRangeTlvs
}

// TLV for Query Channel Range
export interface QueryChannelRangeTlvs {
  queryOption?: BigSize // bitfield
}

// Reply Channel Range Message
export interface ReplyChannelRangeMessage {
  type: GossipMessageType.REPLY_CHANNEL_RANGE
  chainHash: ChainHash
  firstBlocknum: U32
  numberOfBlocks: U32
  syncComplete: Byte
  len: U16
  encodedShortIds: Uint8Array
  tlvs: ReplyChannelRangeTlvs
}

// TLV for Reply Channel Range
export interface ReplyChannelRangeTlvs {
  timestampsTlv?: {
    encodingType: Byte
    encodedTimestamps: Uint8Array
  }
  checksumsTlv?: {
    checksums: ChannelUpdateChecksum[]
  }
}

// Channel Update Timestamps
export interface ChannelUpdateTimestamps {
  timestampNodeId1: U32
  timestampNodeId2: U32
}

// Channel Update Checksums
export interface ChannelUpdateChecksum {
  checksumNodeId1: U32
  checksumNodeId2: U32
}

// Gossip Timestamp Filter Message
export interface GossipTimestampFilterMessage {
  type: GossipMessageType.GOSSIP_TIMESTAMP_FILTER
  chainHash: ChainHash
  firstTimestamp: U32
  timestampRange: U32
}

// Union type for all gossip messages
export type GossipMessageUnion =
  | AnnouncementSignaturesMessage
  | ChannelAnnouncementMessage
  | NodeAnnouncementMessage
  | ChannelUpdateMessage
  | QueryShortChannelIdsMessage
  | ReplyShortChannelIdsEndMessage
  | QueryChannelRangeMessage
  | ReplyChannelRangeMessage
  | GossipTimestampFilterMessage

// Helper functions for flags
export function isChannelDisabled(channelFlags: Byte): boolean {
  return (channelFlags & (1 << ChannelFlag.DISABLE)) !== 0
}

export function getChannelDirection(channelFlags: Byte): 0 | 1 {
  return (channelFlags & (1 << ChannelFlag.DIRECTION)) as 0 | 1
}

export function shouldForwardMessage(messageFlags: Byte): boolean {
  return (messageFlags & (1 << MessageFlag.DONT_FORWARD)) === 0
}

// Short Channel ID utilities
export function parseShortChannelId(scid: ShortChannelId): {
  blockHeight: number
  transactionIndex: number
  outputIndex: number
} {
  const view = new DataView(scid.buffer)
  return {
    blockHeight: view.getUint32(0, false), // big-endian
    transactionIndex: view.getUint32(3, false) >> 8, // next 3 bytes
    outputIndex: view.getUint8(7), // last byte
  }
}

export function formatShortChannelId(scid: ShortChannelId): string {
  const { blockHeight, transactionIndex, outputIndex } = parseShortChannelId(scid)
  return `${blockHeight}x${transactionIndex}x${outputIndex}`
}
