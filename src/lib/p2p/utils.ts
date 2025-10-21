/**
 * P2P Protocol Utilities
 * Helper functions for message serialization, TLV encoding, and protocol operations
 */

import { Buffer } from 'buffer'
import { P2PMessage, P2PMessageType, P2PError } from './types'
import { P2P_CONSTANTS } from './constants'

/**
 * Serialize a P2P message to wire format
 * Format: <type><length><payload>
 */
export function serializeMessage(message: P2PMessage): Buffer {
  const type = Buffer.alloc(2)
  type.writeUInt16BE(message.type, 0)

  const length = Buffer.alloc(2)
  length.writeUInt16BE(message.payload.length, 0)

  return Buffer.concat([type, length, message.payload])
}

/**
 * Deserialize a P2P message from wire format
 */
export function deserializeMessage(data: Buffer): P2PMessage {
  if (data.length < 4) {
    throw new P2PError('Message too short', P2P_CONSTANTS.ERROR_INVALID_MESSAGE)
  }

  const type = data.readUInt16BE(0)
  const length = data.readUInt16BE(2)

  if (data.length !== 4 + length) {
    throw new P2PError('Invalid message length', P2P_CONSTANTS.ERROR_INVALID_MESSAGE)
  }

  const payload = data.slice(4, 4 + length)

  return {
    type,
    payload,
    timestamp: Date.now(),
  }
}

/**
 * Encode a value using Type-Length-Value (TLV) format
 */
export function encodeTLV(type: number, value: Buffer): Buffer {
  const typeBuf = Buffer.alloc(2)
  typeBuf.writeUInt16BE(type, 0)

  const lengthBuf = Buffer.alloc(2)
  lengthBuf.writeUInt16BE(value.length, 0)

  return Buffer.concat([typeBuf, lengthBuf, value])
}

/**
 * Decode TLV records from a buffer
 */
export function decodeTLV(data: Buffer): Map<number, Buffer> {
  const records = new Map<number, Buffer>()
  let offset = 0

  while (offset < data.length) {
    if (offset + 4 > data.length) {
      throw new P2PError('Incomplete TLV record', P2P_CONSTANTS.ERROR_INVALID_MESSAGE)
    }

    const type = data.readUInt16BE(offset)
    const length = data.readUInt16BE(offset + 2)
    offset += 4

    if (offset + length > data.length) {
      throw new P2PError('TLV value exceeds buffer', P2P_CONSTANTS.ERROR_INVALID_MESSAGE)
    }

    const value = data.slice(offset, offset + length)
    records.set(type, value)
    offset += length
  }

  return records
}

/**
 * Create a ping message
 */
export function createPingMessage(numPongBytes: number = 0, ignored?: Buffer): P2PMessage {
  let payload = Buffer.alloc(2)
  payload.writeUInt16BE(numPongBytes, 0)

  if (ignored && ignored.length > 0) {
    payload = Buffer.concat([payload, ignored])
  }

  return {
    type: P2PMessageType.PING,
    payload,
    timestamp: Date.now(),
  }
}

/**
 * Create a pong message
 */
export function createPongMessage(ignored?: Buffer): P2PMessage {
  const payload = ignored || Buffer.alloc(0)

  return {
    type: P2PMessageType.PONG,
    payload,
    timestamp: Date.now(),
  }
}

/**
 * Create an error message
 */
export function createErrorMessage(channelId: Buffer, data: Buffer): P2PMessage {
  const payload = Buffer.concat([channelId, data])

  return {
    type: P2PMessageType.ERROR,
    payload,
    timestamp: Date.now(),
  }
}

/**
 * Create an init message with feature flags
 */
export function createInitMessage(
  globalFeatures: Buffer = Buffer.alloc(0),
  localFeatures: Buffer = Buffer.alloc(0),
): P2PMessage {
  const payload = Buffer.concat([
    encodeTLV(0, globalFeatures), // global_features
    encodeTLV(1, localFeatures), // local_features
  ])

  return {
    type: P2PMessageType.INIT,
    payload,
    timestamp: Date.now(),
  }
}

/**
 * Generate a random nonce for encryption
 */
export function generateNonce(): Buffer {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(12)))
}

/**
 * Validate message type is within valid range
 */
export function isValidMessageType(type: number): boolean {
  return type >= 0 && type <= 65535
}

/**
 * Check if message type is a control message
 */
export function isControlMessage(type: number): boolean {
  return type >= P2P_CONSTANTS.CONTROL_MESSAGE_MIN && type <= P2P_CONSTANTS.CONTROL_MESSAGE_MAX
}

/**
 * Check if message type is a channel message
 */
export function isChannelMessage(type: number): boolean {
  return type >= P2P_CONSTANTS.CHANNEL_MESSAGE_MIN && type <= P2P_CONSTANTS.CHANNEL_MESSAGE_MAX
}

/**
 * Check if message type is an HTLC message
 */
export function isHTLCMessage(type: number): boolean {
  return type >= P2P_CONSTANTS.HTLC_MESSAGE_MIN && type <= P2P_CONSTANTS.HTLC_MESSAGE_MAX
}

/**
 * Check if message type is an announcement message
 */
export function isAnnouncementMessage(type: number): boolean {
  return (
    type >= P2P_CONSTANTS.ANNOUNCEMENT_MESSAGE_MIN && type <= P2P_CONSTANTS.ANNOUNCEMENT_MESSAGE_MAX
  )
}

/**
 * Calculate message checksum (simple CRC32)
 */
export function calculateChecksum(data: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return crc ^ 0xffffffff
}

/**
 * Validate message checksum
 */
export function validateChecksum(data: Buffer, expectedChecksum: number): boolean {
  return calculateChecksum(data) === expectedChecksum
}

/**
 * Create a connection ID from peer address
 */
export function createConnectionId(host: string, port: number): string {
  return `${host}:${port}`
}

/**
 * Parse connection ID to peer address
 */
export function parseConnectionId(connectionId: string): { host: string; port: number } {
  const [host, portStr] = connectionId.split(':')
  return {
    host,
    port: parseInt(portStr, 10),
  }
}

/**
 * Check if a peer address is valid
 */
export function isValidPeerAddress(host: string, port: number): boolean {
  // Basic validation - could be enhanced with proper IP/domain validation
  return host.length > 0 && host.length <= 255 && port > 0 && port <= 65535
}
