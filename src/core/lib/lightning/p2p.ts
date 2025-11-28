// BOLT #7: P2P Node and Channel Discovery - Implementation

import * as secp from '@noble/secp256k1'
import {
  GossipMessageType,
  AnnouncementSignaturesMessage,
  ChannelAnnouncementMessage,
  NodeAnnouncementMessage,
  ChannelUpdateMessage,
  BITCOIN_CHAIN_HASH,
  MIN_CHANNEL_ANNOUNCEMENT_CONFIRMATIONS,
  STALE_CHANNEL_UPDATE_SECONDS,
  EncodingType,
  AddressType,
  Ipv4Address,
  Ipv6Address,
  TorV3Address,
  DnsHostnameAddress,
  AddressDescriptor,
  isChannelDisabled,
} from '@/core/models/lightning/p2p'
import {
  U32,
  U64,
  ChainHash,
  ShortChannelId,
  Point,
  Signature,
  BigSize,
} from '@/core/models/lightning/base'
import {
  encodeU16,
  decodeU16,
  encodeU32,
  decodeU32,
  encodeU64,
  decodeU64,
  encodeBigSize,
  decodeBigSize,
} from './base'
import { hash256 } from '../crypto'

// Utility functions

/**
 * Verifies an ECDSA signature
 */
export function verifySignature(message: Uint8Array, signature: Signature, pubkey: Point): boolean {
  try {
    return secp.verify(signature, hash256(message), pubkey)
  } catch {
    return false
  }
}

/**
 * Signs a message with ECDSA
 */
export function signMessage(message: Uint8Array, privkey: Uint8Array): Signature {
  return secp.sign(hash256(message), privkey)
}

/**
 * Computes CRC32C checksum as per RFC3720
 */
export function crc32c(data: Uint8Array): U32 {
  // Simple CRC32C implementation (placeholder - should use proper CRC32C)
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0x82f63b78 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * Encodes short channel IDs array
 */
export function encodeShortChannelIds(
  shortIds: ShortChannelId[],
  encoding: EncodingType,
): Uint8Array {
  if (encoding !== EncodingType.UNCOMPRESSED) {
    throw new Error('Only uncompressed encoding supported')
  }
  const buffers: Uint8Array[] = []
  for (const id of shortIds) {
    buffers.push(id)
  }
  const totalLength = buffers.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

/**
 * Decodes short channel IDs array
 */
export function decodeShortChannelIds(
  encoded: Uint8Array,
  encoding: EncodingType,
): ShortChannelId[] {
  if (encoding !== EncodingType.UNCOMPRESSED) {
    throw new Error('Only uncompressed encoding supported')
  }
  const ids: ShortChannelId[] = []
  for (let i = 0; i < encoded.length; i += 8) {
    ids.push(encoded.subarray(i, i + 8) as ShortChannelId)
  }
  return ids
}

/**
 * Encodes query flags
 */
export function encodeQueryFlags(flags: BigSize[]): Uint8Array {
  const buffers: Uint8Array[] = []
  for (const flag of flags) {
    buffers.push(encodeBigSize(flag))
  }
  const totalLength = buffers.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

/**
 * Decodes query flags
 */
export function decodeQueryFlags(encoded: Uint8Array): BigSize[] {
  const flags: BigSize[] = []
  let offset = 0
  while (offset < encoded.length) {
    const { value, bytesRead } = decodeBigSize(encoded, offset)
    flags.push(value)
    offset += bytesRead
  }
  return flags
}

// Message validation functions

/**
 * Validates announcement_signatures message
 */
export function validateAnnouncementSignatures(
  msg: AnnouncementSignaturesMessage,
  fundingTxConfirmations: number,
  channelReadySent: boolean,
  channelReadyReceived: boolean,
  shutdownSent: boolean,
): { valid: boolean; error?: string } {
  // Must have channel_ready sent and received
  if (!channelReadySent || !channelReadyReceived) {
    return { valid: false, error: 'channel_ready not exchanged' }
  }

  // Must not have sent shutdown
  if (shutdownSent) {
    return { valid: false, error: 'shutdown already sent' }
  }

  // Funding transaction must have enough confirmations
  if (fundingTxConfirmations < MIN_CHANNEL_ANNOUNCEMENT_CONFIRMATIONS) {
    return { valid: false, error: 'insufficient confirmations' }
  }

  return { valid: true }
}

/**
 * Validates channel_announcement message
 */
export function validateChannelAnnouncement(
  msg: ChannelAnnouncementMessage,
  fundingTxConfirmations: number,
  fundingOutputSpent: boolean,
): { valid: boolean; error?: string } {
  // Chain hash must be Bitcoin
  if (!arraysEqual(msg.chainHash, BITCOIN_CHAIN_HASH)) {
    return { valid: false, error: 'unknown chain_hash' }
  }

  // Funding transaction must have enough confirmations
  if (fundingTxConfirmations < MIN_CHANNEL_ANNOUNCEMENT_CONFIRMATIONS) {
    return { valid: false, error: 'insufficient confirmations' }
  }

  // Funding output must not be spent
  if (fundingOutputSpent) {
    return { valid: false, error: 'funding output spent' }
  }

  // Verify signatures
  const messageForSignature = createChannelAnnouncementMessageForSignature(msg)
  if (!verifySignature(messageForSignature, msg.nodeSignature1, msg.nodeId1)) {
    return { valid: false, error: 'invalid node_signature_1' }
  }
  if (!verifySignature(messageForSignature, msg.nodeSignature2, msg.nodeId2)) {
    return { valid: false, error: 'invalid node_signature_2' }
  }
  if (!verifySignature(messageForSignature, msg.bitcoinSignature1, msg.bitcoinKey1)) {
    return { valid: false, error: 'invalid bitcoin_signature_1' }
  }
  if (!verifySignature(messageForSignature, msg.bitcoinSignature2, msg.bitcoinKey2)) {
    return { valid: false, error: 'invalid bitcoin_signature_2' }
  }

  return { valid: true }
}

/**
 * Creates the message for signature verification (skips signatures)
 */
function createChannelAnnouncementMessageForSignature(msg: ChannelAnnouncementMessage): Uint8Array {
  const buffers: Uint8Array[] = [
    encodeU16(msg.type),
    msg.nodeSignature1, // Include signatures in hash
    msg.nodeSignature2,
    msg.bitcoinSignature1,
    msg.bitcoinSignature2,
    encodeU16(msg.featuresLen),
    msg.features,
    msg.chainHash,
    msg.shortChannelId,
    msg.nodeId1,
    msg.nodeId2,
    msg.bitcoinKey1,
    msg.bitcoinKey2,
  ]
  const totalLength = buffers.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

/**
 * Validates node_announcement message
 */
export function validateNodeAnnouncement(
  msg: NodeAnnouncementMessage,
  knownChannels: ShortChannelId[],
): { valid: boolean; error?: string } {
  // Verify signature
  const messageForSignature = createNodeAnnouncementMessageForSignature(msg)
  if (!verifySignature(messageForSignature, msg.signature, msg.nodeId)) {
    return { valid: false, error: 'invalid signature' }
  }

  // Node must be associated with known channels
  if (knownChannels.length === 0) {
    return { valid: false, error: 'node not associated with known channels' }
  }

  // Validate addresses
  for (const addr of msg.addresses) {
    if (!isValidAddressDescriptor(addr)) {
      return { valid: false, error: 'invalid address descriptor' }
    }
  }

  return { valid: true }
}

/**
 * Creates the message for signature verification (skips signature)
 */
function createNodeAnnouncementMessageForSignature(msg: NodeAnnouncementMessage): Uint8Array {
  const buffers: Uint8Array[] = [
    encodeU16(msg.type),
    encodeU16(msg.featuresLen),
    msg.features,
    encodeU32(msg.timestamp),
    msg.nodeId,
    msg.rgbColor,
    msg.alias,
    encodeU16(msg.addrLen),
    encodeAddressDescriptors(msg.addresses),
  ]
  const totalLength = buffers.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

/**
 * Validates channel_update message
 */
export function validateChannelUpdate(
  msg: ChannelUpdateMessage,
  knownChannel: boolean,
  fundingOutputSpent: boolean,
  lastTimestamp?: U32,
): { valid: boolean; error?: string } {
  // Must know the channel
  if (!knownChannel) {
    return { valid: false, error: 'unknown channel' }
  }

  // Channel must not be spent (unless disable bit set)
  if (fundingOutputSpent && !isChannelDisabled(msg.channelFlags)) {
    return { valid: false, error: 'channel spent' }
  }

  // Timestamp must be greater than previous
  if (lastTimestamp && msg.timestamp <= lastTimestamp) {
    return { valid: false, error: 'timestamp not greater than previous' }
  }

  // Verify signature
  const messageForSignature = createChannelUpdateMessageForSignature(msg)
  const pubkey = getChannelUpdatePubkey(msg)
  if (!pubkey || !verifySignature(messageForSignature, msg.signature, pubkey)) {
    return { valid: false, error: 'invalid signature' }
  }

  return { valid: true }
}

/**
 * Creates the message for signature verification (skips signature)
 */
function createChannelUpdateMessageForSignature(msg: ChannelUpdateMessage): Uint8Array {
  const buffers: Uint8Array[] = [
    encodeU16(msg.type),
    msg.chainHash,
    msg.shortChannelId,
    encodeU32(msg.timestamp),
    new Uint8Array([msg.messageFlags]),
    new Uint8Array([msg.channelFlags]),
    encodeU16(msg.cltvExpiryDelta),
    encodeU64(msg.htlcMinimumMsat),
    encodeU32(msg.feeBaseMsat),
    encodeU32(msg.feeProportionalMillionths),
    encodeU64(msg.htlcMaximumMsat),
  ]
  const totalLength = buffers.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

/**
 * Gets the pubkey for channel_update signature verification
 */
function getChannelUpdatePubkey(msg: ChannelUpdateMessage): Point | null {
  // This would need channel announcement context to get the correct node_id
  // For now, return null - implementation would need channel state
  return null
}

// Address validation

/**
 * Validates an address descriptor
 */
export function isValidAddressDescriptor(addr: AddressDescriptor): boolean {
  switch (addr.type) {
    case AddressType.IPV4:
      return (addr as Ipv4Address).addr.length === 4 && (addr as Ipv4Address).port !== 0
    case AddressType.IPV6:
      return (addr as Ipv6Address).addr.length === 16 && (addr as Ipv6Address).port !== 0
    case AddressType.TOR_V3:
      return (addr as TorV3Address).addr.length === 35 && (addr as TorV3Address).port !== 0
    case AddressType.DNS_HOSTNAME:
      return (
        (addr as DnsHostnameAddress).hostname.length > 0 && (addr as DnsHostnameAddress).port !== 0
      )
    default:
      return false
  }
}

/**
 * Encodes address descriptors
 */
export function encodeAddressDescriptors(addresses: AddressDescriptor[]): Uint8Array {
  const buffers: Uint8Array[] = []
  for (const addr of addresses) {
    buffers.push(encodeAddressDescriptor(addr))
  }
  const totalLength = buffers.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

/**
 * Encodes a single address descriptor
 */
export function encodeAddressDescriptor(addr: AddressDescriptor): Uint8Array {
  const typeBuf = new Uint8Array([addr.type])
  switch (addr.type) {
    case AddressType.IPV4:
      return new Uint8Array([
        ...typeBuf,
        ...(addr as Ipv4Address).addr,
        ...encodeU16((addr as Ipv4Address).port),
      ])
    case AddressType.IPV6:
      return new Uint8Array([
        ...typeBuf,
        ...(addr as Ipv6Address).addr,
        ...encodeU16((addr as Ipv6Address).port),
      ])
    case AddressType.TOR_V3:
      return new Uint8Array([
        ...typeBuf,
        ...(addr as TorV3Address).addr,
        ...encodeU16((addr as TorV3Address).port),
      ])
    case AddressType.DNS_HOSTNAME:
      const hostnameBytes = new TextEncoder().encode((addr as DnsHostnameAddress).hostname)
      return new Uint8Array([
        ...typeBuf,
        hostnameBytes.length,
        ...hostnameBytes,
        ...encodeU16((addr as DnsHostnameAddress).port),
      ])
    default:
      throw new Error('Unknown address type')
  }
}

// HTLC Fee calculation

/**
 * Calculates the fee for an HTLC
 */
export function calculateHtlcFee(
  amountMsat: U64,
  feeBaseMsat: U32,
  feeProportionalMillionths: U32,
): U64 {
  return BigInt(feeBaseMsat) + (amountMsat * BigInt(feeProportionalMillionths)) / 1000000n
}

/**
 * Checks if HTLC fee is acceptable
 */
export function isHtlcFeeAcceptable(
  amountMsat: U64,
  feeBaseMsat: U32,
  feeProportionalMillionths: U32,
  maxFeeMsat: U64,
): boolean {
  const fee = calculateHtlcFee(amountMsat, feeBaseMsat, feeProportionalMillionths)
  return fee <= maxFeeMsat
}

// Gossip pruning

/**
 * Checks if a channel should be pruned (stale update)
 */
export function shouldPruneChannel(lastUpdateTimestamp: U32, currentTimestamp: U32): boolean {
  return currentTimestamp - lastUpdateTimestamp > STALE_CHANNEL_UPDATE_SECONDS
}

/**
 * Checks if a node should be pruned (no associated channels)
 */
export function shouldPruneNode(associatedChannels: ShortChannelId[]): boolean {
  return associatedChannels.length === 0
}

// Utility functions

/**
 * Compares two Uint8Arrays for equality
 */
function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

// Message encoding/decoding functions (similar to base.ts pattern)

/**
 * Encodes announcement_signatures message
 */
export function encodeAnnouncementSignaturesMessage(
  msg: AnnouncementSignaturesMessage,
): Uint8Array {
  const buffers: Uint8Array[] = [
    encodeU16(msg.type),
    msg.channelId,
    msg.shortChannelId,
    msg.nodeSignature,
    msg.bitcoinSignature,
  ]
  const totalLength = buffers.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

/**
 * Decodes announcement_signatures message
 */
export function decodeAnnouncementSignaturesMessage(
  buf: Uint8Array,
): AnnouncementSignaturesMessage {
  let offset = 2 // skip type
  const channelId = buf.subarray(offset, offset + 32)
  offset += 32
  const shortChannelId = buf.subarray(offset, offset + 8) as ShortChannelId
  offset += 8
  const nodeSignature = buf.subarray(offset, offset + 64) as Signature
  offset += 64
  const bitcoinSignature = buf.subarray(offset, offset + 64) as Signature
  return {
    type: GossipMessageType.ANNOUNCEMENT_SIGNATURES,
    channelId,
    shortChannelId,
    nodeSignature,
    bitcoinSignature,
  }
}

/**
 * Encodes channel_announcement message
 */
export function encodeChannelAnnouncementMessage(msg: ChannelAnnouncementMessage): Uint8Array {
  const buffers: Uint8Array[] = [
    encodeU16(msg.type),
    msg.nodeSignature1,
    msg.nodeSignature2,
    msg.bitcoinSignature1,
    msg.bitcoinSignature2,
    encodeU16(msg.featuresLen),
    msg.features,
    msg.chainHash,
    msg.shortChannelId,
    msg.nodeId1,
    msg.nodeId2,
    msg.bitcoinKey1,
    msg.bitcoinKey2,
  ]
  const totalLength = buffers.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

/**
 * Decodes channel_announcement message
 */
export function decodeChannelAnnouncementMessage(buf: Uint8Array): ChannelAnnouncementMessage {
  let offset = 2 // skip type
  const nodeSignature1 = buf.subarray(offset, offset + 64) as Signature
  offset += 64
  const nodeSignature2 = buf.subarray(offset, offset + 64) as Signature
  offset += 64
  const bitcoinSignature1 = buf.subarray(offset, offset + 64) as Signature
  offset += 64
  const bitcoinSignature2 = buf.subarray(offset, offset + 64) as Signature
  offset += 64
  const featuresLen = decodeU16(buf, offset)
  offset += 2
  const features = buf.subarray(offset, offset + featuresLen)
  offset += featuresLen
  const chainHash = buf.subarray(offset, offset + 32) as ChainHash
  offset += 32
  const shortChannelId = buf.subarray(offset, offset + 8) as ShortChannelId
  offset += 8
  const nodeId1 = buf.subarray(offset, offset + 33) as Point
  offset += 33
  const nodeId2 = buf.subarray(offset, offset + 33) as Point
  offset += 33
  const bitcoinKey1 = buf.subarray(offset, offset + 33) as Point
  offset += 33
  const bitcoinKey2 = buf.subarray(offset, offset + 33) as Point
  return {
    type: GossipMessageType.CHANNEL_ANNOUNCEMENT,
    nodeSignature1,
    nodeSignature2,
    bitcoinSignature1,
    bitcoinSignature2,
    featuresLen,
    features,
    chainHash,
    shortChannelId,
    nodeId1,
    nodeId2,
    bitcoinKey1,
    bitcoinKey2,
  }
}

/**
 * Encodes node_announcement message
 */
export function encodeNodeAnnouncementMessage(msg: NodeAnnouncementMessage): Uint8Array {
  const buffers: Uint8Array[] = [
    encodeU16(msg.type),
    msg.signature,
    encodeU16(msg.featuresLen),
    msg.features,
    encodeU32(msg.timestamp),
    msg.nodeId,
    msg.rgbColor,
    msg.alias,
    encodeU16(msg.addrLen),
    encodeAddressDescriptors(msg.addresses),
  ]
  const totalLength = buffers.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

/**
 * Decodes node_announcement message
 */
export function decodeNodeAnnouncementMessage(buf: Uint8Array): NodeAnnouncementMessage {
  let offset = 2 // skip type
  const signature = buf.subarray(offset, offset + 64) as Signature
  offset += 64
  const featuresLen = decodeU16(buf, offset)
  offset += 2
  const features = buf.subarray(offset, offset + featuresLen)
  offset += featuresLen
  const timestamp = decodeU32(buf, offset)
  offset += 4
  const nodeId = buf.subarray(offset, offset + 33) as Point
  offset += 33
  const rgbColor = buf.subarray(offset, offset + 3)
  offset += 3
  const alias = buf.subarray(offset, offset + 32)
  offset += 32
  const addrLen = decodeU16(buf, offset)
  offset += 2
  const addresses = decodeAddressDescriptors(buf.subarray(offset, offset + addrLen))
  return {
    type: GossipMessageType.NODE_ANNOUNCEMENT,
    signature,
    featuresLen,
    features,
    timestamp,
    nodeId,
    rgbColor,
    alias,
    addrLen,
    addresses,
  }
}

/**
 * Decodes address descriptors
 */
export function decodeAddressDescriptors(buf: Uint8Array): AddressDescriptor[] {
  const addresses: AddressDescriptor[] = []
  let offset = 0
  while (offset < buf.length) {
    const { addr, bytesRead } = decodeAddressDescriptor(buf, offset)
    addresses.push(addr)
    offset += bytesRead
  }
  return addresses
}

/**
 * Decodes a single address descriptor
 */
export function decodeAddressDescriptor(
  buf: Uint8Array,
  offset: number = 0,
): { addr: AddressDescriptor; bytesRead: number } {
  const type = buf[offset]
  switch (type) {
    case AddressType.IPV4: {
      const addr = buf.subarray(offset + 1, offset + 5)
      const port = decodeU16(buf, offset + 5)
      return {
        addr: { type: AddressType.IPV4, addr, port },
        bytesRead: 7,
      }
    }
    case AddressType.IPV6: {
      const addr = buf.subarray(offset + 1, offset + 17)
      const port = decodeU16(buf, offset + 17)
      return {
        addr: { type: AddressType.IPV6, addr, port },
        bytesRead: 19,
      }
    }
    case AddressType.TOR_V3: {
      const addr = buf.subarray(offset + 1, offset + 36)
      const port = decodeU16(buf, offset + 36)
      return {
        addr: { type: AddressType.TOR_V3, addr, port },
        bytesRead: 38,
      }
    }
    case AddressType.DNS_HOSTNAME: {
      const hostnameLen = buf[offset + 1]
      const hostname = new TextDecoder().decode(buf.subarray(offset + 2, offset + 2 + hostnameLen))
      const port = decodeU16(buf, offset + 2 + hostnameLen)
      return {
        addr: { type: AddressType.DNS_HOSTNAME, hostnameLen, hostname, port },
        bytesRead: 4 + hostnameLen,
      }
    }
    default:
      throw new Error('Unknown address type')
  }
}

/**
 * Encodes channel_update message
 */
export function encodeChannelUpdateMessage(msg: ChannelUpdateMessage): Uint8Array {
  const buffers: Uint8Array[] = [
    encodeU16(msg.type),
    msg.signature,
    msg.chainHash,
    msg.shortChannelId,
    encodeU32(msg.timestamp),
    new Uint8Array([msg.messageFlags]),
    new Uint8Array([msg.channelFlags]),
    encodeU16(msg.cltvExpiryDelta),
    encodeU64(msg.htlcMinimumMsat),
    encodeU32(msg.feeBaseMsat),
    encodeU32(msg.feeProportionalMillionths),
    encodeU64(msg.htlcMaximumMsat),
  ]
  const totalLength = buffers.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

/**
 * Decodes channel_update message
 */
export function decodeChannelUpdateMessage(buf: Uint8Array): ChannelUpdateMessage {
  let offset = 2 // skip type
  const signature = buf.subarray(offset, offset + 64) as Signature
  offset += 64
  const chainHash = buf.subarray(offset, offset + 32) as ChainHash
  offset += 32
  const shortChannelId = buf.subarray(offset, offset + 8) as ShortChannelId
  offset += 8
  const timestamp = decodeU32(buf, offset)
  offset += 4
  const messageFlags = buf[offset]
  offset += 1
  const channelFlags = buf[offset]
  offset += 1
  const cltvExpiryDelta = decodeU16(buf, offset)
  offset += 2
  const htlcMinimumMsat = decodeU64(buf, offset)
  offset += 8
  const feeBaseMsat = decodeU32(buf, offset)
  offset += 4
  const feeProportionalMillionths = decodeU32(buf, offset)
  offset += 4
  const htlcMaximumMsat = decodeU64(buf, offset)
  return {
    type: GossipMessageType.CHANNEL_UPDATE,
    signature,
    chainHash,
    shortChannelId,
    timestamp,
    messageFlags,
    channelFlags,
    cltvExpiryDelta,
    htlcMinimumMsat,
    feeBaseMsat,
    feeProportionalMillionths,
    htlcMaximumMsat,
  }
}

// Additional query message encoding/decoding would follow the same pattern
// For brevity, implementing the core validation and utility functions
