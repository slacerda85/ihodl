// Lightning Network Message Serializer
// Based on Electrum's lnmsg.py implementation
// Adapted for React Native compatibility using Uint8Array/DataView

import {
  createUint8Array,
  uint8ArrayFrom,
  concatUint8Arrays,
  sliceUint8Array,
  readUint8,
  readUint16BE,
  readUint32BE,
  readBigUint64BE,
  writeUint8,
  writeUint16BE,
  writeUint32BE,
  writeBigUint64BE,
} from '../utils'

// Message type constants
export const MSG_TYPES = {
  INIT: 16,
  ERROR: 17,
  PING: 18,
  PONG: 19,
  OPEN_CHANNEL: 32,
  ACCEPT_CHANNEL: 33,
  FUNDING_CREATED: 34,
  FUNDING_SIGNED: 35,
  CHANNEL_READY: 36,
  UPDATE_ADD_HTLC: 128,
  UPDATE_FULFILL_HTLC: 130,
  UPDATE_FAIL_HTLC: 131,
  COMMITMENT_SIGNED: 132,
  REVOKE_AND_ACK: 133,
  UPDATE_FEE: 134,
  CHANNEL_ANNOUNCEMENT: 256,
  NODE_ANNOUNCEMENT: 257,
  CHANNEL_UPDATE: 258,
  ANNOUNCEMENT_SIGNATURES: 259,
} as const

export type FieldType =
  | 'byte'
  | 'u8'
  | 'u16'
  | 'u32'
  | 'u64'
  | 'tu16'
  | 'tu32'
  | 'tu64'
  | 'bigsize'
  | 'chain_hash'
  | 'channel_id'
  | 'sha256'
  | 'signature'
  | 'point'
  | 'short_channel_id'
  | 'sciddir_or_pubkey'

// Exceptions
export class FailedToParseMsg extends Error {
  msgTypeInt?: number
  msgTypeName?: string
}

export class UnknownMsgType extends FailedToParseMsg {}
export class MalformedMsg extends FailedToParseMsg {}
export class UnexpectedEndOfStream extends MalformedMsg {}

// Utility functions for bigsize encoding/decoding
export function writeBigSizeInt(value: number): Uint8Array {
  if (value < 0xfd) {
    return uint8ArrayFrom([value])
  } else if (value < 0x10000) {
    const buf = createUint8Array(3)
    writeUint8(buf, 0, 0xfd)
    writeUint16BE(buf, 1, value)
    return buf
  } else if (value < 0x100000000) {
    const buf = createUint8Array(5)
    writeUint8(buf, 0, 0xfe)
    writeUint32BE(buf, 1, value)
    return buf
  } else {
    const buf = createUint8Array(9)
    writeUint8(buf, 0, 0xff)
    writeBigUint64BE(buf, 1, BigInt(value))
    return buf
  }
}

export function readBigSizeInt(
  buffer: Uint8Array,
  offset: number = 0,
): { value: number; bytesRead: number } {
  if (offset >= buffer.length) {
    throw new UnexpectedEndOfStream()
  }

  const first = readUint8(buffer, offset)
  if (first < 0xfd) {
    return { value: first, bytesRead: 1 }
  } else if (first === 0xfd) {
    if (offset + 3 > buffer.length) {
      throw new UnexpectedEndOfStream()
    }
    const value = readUint16BE(buffer, offset + 1)
    if (value < 0xfd) {
      throw new MalformedMsg('Non-minimal encoding')
    }
    return { value, bytesRead: 3 }
  } else if (first === 0xfe) {
    if (offset + 5 > buffer.length) {
      throw new UnexpectedEndOfStream()
    }
    const value = readUint32BE(buffer, offset + 1)
    if (value < 0x10000) {
      throw new MalformedMsg('Non-minimal encoding')
    }
    return { value, bytesRead: 5 }
  } else if (first === 0xff) {
    if (offset + 9 > buffer.length) {
      throw new UnexpectedEndOfStream()
    }
    const value = Number(readBigUint64BE(buffer, offset + 1))
    if (value < 0x100000000) {
      throw new MalformedMsg('Non-minimal encoding')
    }
    return { value, bytesRead: 9 }
  }

  throw new MalformedMsg('Invalid bigsize prefix')
}

// Field reading functions
export function readField(
  buffer: Uint8Array,
  offset: number,
  fieldType: FieldType,
  count: number | '...' | string,
): { value: any; bytesRead: number } {
  let totalLen = 0
  let typeLen = 0

  // Determine type length
  switch (fieldType) {
    case 'byte':
      typeLen = 1
      break
    case 'u8':
      typeLen = 1
      break
    case 'u16':
      typeLen = 2
      break
    case 'u32':
      typeLen = 4
      break
    case 'u64':
      typeLen = 8
      break
    case 'tu16':
      typeLen = 2
      break
    case 'tu32':
      typeLen = 4
      break
    case 'tu64':
      typeLen = 8
      break
    case 'bigsize':
      // bigsize has variable length, will be handled specially
      typeLen = 0
      break
    case 'chain_hash':
    case 'channel_id':
    case 'sha256':
      typeLen = 32
      break
    case 'signature':
      typeLen = 64
      break
    case 'point':
      typeLen = 33
      break
    case 'short_channel_id':
      typeLen = 8
      break
    case 'sciddir_or_pubkey':
      if (offset >= buffer.length) {
        throw new UnexpectedEndOfStream()
      }
      const prefix = readUint8(buffer, offset)
      if (prefix <= 1) {
        typeLen = 9
      } else if (prefix <= 3) {
        typeLen = 33
      } else {
        throw new MalformedMsg('Invalid sciddir_or_pubkey prefix')
      }
      break
    default:
      throw new MalformedMsg(`Unknown field type: ${fieldType}`)
  }

  // Calculate total length
  if (count === '...') {
    totalLen = buffer.length - offset
  } else {
    const countNum = typeof count === 'string' ? parseInt(count) : count
    totalLen = countNum * typeLen
  }

  if (offset + totalLen > buffer.length) {
    throw new UnexpectedEndOfStream()
  }

  const fieldData = sliceUint8Array(buffer, offset, offset + totalLen)

  // Parse value based on type
  let value: any

  if (fieldType === 'u8' && count === 1) {
    value = readUint8(fieldData, 0)
  } else if (fieldType === 'u16' && count === 1) {
    value = readUint16BE(fieldData, 0)
  } else if (fieldType === 'u32' && count === 1) {
    value = readUint32BE(fieldData, 0)
  } else if (fieldType === 'u64' && count === 1) {
    value = Number(readBigUint64BE(fieldData, 0))
  } else if (fieldType === 'tu16' && count === 1) {
    let trimmed = fieldData
    while (trimmed.length > 0 && readUint8(trimmed, 0) === 0) {
      trimmed = sliceUint8Array(trimmed, 1)
    }
    value = trimmed.length === 0 ? 0 : readUint16BE(trimmed, 0)
  } else if (fieldType === 'tu32' && count === 1) {
    let trimmed = fieldData
    while (trimmed.length > 0 && readUint8(trimmed, 0) === 0) {
      trimmed = sliceUint8Array(trimmed, 1)
    }
    value = trimmed.length === 0 ? 0 : readUint32BE(trimmed, 0)
  } else if (fieldType === 'tu64' && count === 1) {
    let trimmed = fieldData
    while (trimmed.length > 0 && readUint8(trimmed, 0) === 0) {
      trimmed = sliceUint8Array(trimmed, 1)
    }
    value = trimmed.length === 0 ? 0 : Number(readBigUint64BE(trimmed, 0))
  } else if (fieldType === 'bigsize' && count === 1) {
    const result = readBigSizeInt(fieldData, 0)
    value = result.value
    totalLen = result.bytesRead
  } else {
    value = fieldData
  }

  return { value, bytesRead: totalLen }
}

// Field writing functions
export function writeField(value: any, fieldType: FieldType, count: number | '...'): Uint8Array {
  let buffer: Uint8Array

  switch (fieldType) {
    case 'byte':
      if (typeof value === 'number') {
        buffer = uint8ArrayFrom([value])
      } else if (value instanceof Uint8Array) {
        buffer = value
      } else {
        throw new Error('Invalid value for byte field')
      }
      break

    case 'u8':
    case 'u16':
    case 'u32':
    case 'u64':
      if (typeof value === 'number') {
        let size: number
        switch (fieldType) {
          case 'u8':
            size = 1
            break
          case 'u16':
            size = 2
            break
          case 'u32':
            size = 4
            break
          case 'u64':
            size = 8
            break
        }
        buffer = createUint8Array(size)
        if (fieldType === 'u64') {
          writeBigUint64BE(buffer, 0, BigInt(value))
        } else {
          switch (fieldType) {
            case 'u8':
              writeUint8(buffer, 0, value)
              break
            case 'u16':
              writeUint16BE(buffer, 0, value)
              break
            case 'u32':
              writeUint32BE(buffer, 0, value)
              break
          }
        }
      } else {
        buffer = value
      }
      break

    case 'tu16':
    case 'tu32':
    case 'tu64':
      if (typeof value === 'number') {
        let size: number
        switch (fieldType) {
          case 'tu16':
            size = 2
            break
          case 'tu32':
            size = 4
            break
          case 'tu64':
            size = 8
            break
        }
        buffer = createUint8Array(size)
        if (fieldType === 'tu64') {
          writeBigUint64BE(buffer, 0, BigInt(value))
        } else {
          switch (fieldType) {
            case 'tu16':
              writeUint16BE(buffer, 0, value)
              break
            case 'tu32':
              writeUint32BE(buffer, 0, value)
              break
          }
        }
        // Trim leading zeros
        while (buffer.length > 0 && readUint8(buffer, 0) === 0) {
          buffer = sliceUint8Array(buffer, 1)
        }
        if (buffer.length === 0) {
          buffer = uint8ArrayFrom([0])
        }
      } else {
        buffer = value
      }
      break

    case 'bigsize':
      if (typeof value === 'number') {
        buffer = writeBigSizeInt(value)
      } else {
        buffer = value
      }
      break

    default:
      // For fixed-size types, just use the buffer as-is
      buffer = value instanceof Uint8Array ? value : uint8ArrayFrom(value)
  }

  return buffer
}

// Message schemas (simplified version)
const MESSAGE_SCHEMAS: {
  [key: string]: { name: string; type: FieldType; count?: number | string }[]
} = {
  init: [
    { name: 'globalfeatures', type: 'byte', count: '...' },
    { name: 'features', type: 'byte', count: '...' },
  ],
  error: [
    { name: 'channel_id', type: 'channel_id' },
    { name: 'data', type: 'byte', count: '...' },
  ],
  ping: [
    { name: 'num_pong_bytes', type: 'u16' },
    { name: 'ignored', type: 'byte', count: '...' },
  ],
  pong: [{ name: 'ignored', type: 'byte', count: '...' }],
  open_channel: [
    { name: 'chain_hash', type: 'chain_hash' },
    { name: 'temporary_channel_id', type: 'channel_id' },
    { name: 'funding_satoshis', type: 'u64' },
    { name: 'push_msat', type: 'u64' },
    { name: 'dust_limit_satoshis', type: 'u64' },
    { name: 'max_htlc_value_in_flight_msat', type: 'u64' },
    { name: 'channel_reserve_satoshis', type: 'u64' },
    { name: 'htlc_minimum_msat', type: 'u64' },
    { name: 'feerate_per_kw', type: 'u32' },
    { name: 'to_self_delay', type: 'u16' },
    { name: 'max_accepted_htlcs', type: 'u16' },
    { name: 'funding_pubkey', type: 'point' },
    { name: 'revocation_basepoint', type: 'point' },
    { name: 'payment_basepoint', type: 'point' },
    { name: 'delayed_payment_basepoint', type: 'point' },
    { name: 'htlc_basepoint', type: 'point' },
    { name: 'first_per_commitment_point', type: 'point' },
    { name: 'channel_flags', type: 'byte' },
  ],
  accept_channel: [
    { name: 'temporary_channel_id', type: 'channel_id' },
    { name: 'dust_limit_satoshis', type: 'u64' },
    { name: 'max_htlc_value_in_flight_msat', type: 'u64' },
    { name: 'channel_reserve_satoshis', type: 'u64' },
    { name: 'htlc_minimum_msat', type: 'u64' },
    { name: 'minimum_depth', type: 'u32' },
    { name: 'to_self_delay', type: 'u16' },
    { name: 'max_accepted_htlcs', type: 'u16' },
    { name: 'funding_pubkey', type: 'point' },
    { name: 'revocation_basepoint', type: 'point' },
    { name: 'payment_basepoint', type: 'point' },
    { name: 'delayed_payment_basepoint', type: 'point' },
    { name: 'htlc_basepoint', type: 'point' },
    { name: 'first_per_commitment_point', type: 'point' },
  ],
  funding_created: [
    { name: 'temporary_channel_id', type: 'channel_id' },
    { name: 'funding_txid', type: 'sha256' },
    { name: 'funding_output_index', type: 'u16' },
    { name: 'signature', type: 'signature' },
  ],
  funding_signed: [
    { name: 'channel_id', type: 'channel_id' },
    { name: 'signature', type: 'signature' },
  ],
  channel_ready: [
    { name: 'channel_id', type: 'channel_id' },
    { name: 'next_per_commitment_point', type: 'point' },
  ],
  update_add_htlc: [
    { name: 'channel_id', type: 'channel_id' },
    { name: 'id', type: 'u64' },
    { name: 'amount_msat', type: 'u64' },
    { name: 'payment_hash', type: 'sha256' },
    { name: 'cltv_expiry', type: 'u32' },
    { name: 'onion_routing_packet', type: 'byte', count: 1366 },
  ],
  update_fulfill_htlc: [
    { name: 'channel_id', type: 'channel_id' },
    { name: 'id', type: 'u64' },
    { name: 'payment_preimage', type: 'sha256' },
  ],
  update_fail_htlc: [
    { name: 'channel_id', type: 'channel_id' },
    { name: 'id', type: 'u64' },
    { name: 'reason', type: 'byte', count: '...' },
  ],
  commitment_signed: [
    { name: 'channel_id', type: 'channel_id' },
    { name: 'signature', type: 'signature' },
    { name: 'num_htlcs', type: 'u16' },
    { name: 'htlc_signatures', type: 'signature', count: 0 }, // Will be handled specially
  ],
  revoke_and_ack: [
    { name: 'channel_id', type: 'channel_id' },
    { name: 'per_commitment_secret', type: 'sha256' },
    { name: 'next_per_commitment_point', type: 'point' },
  ],
  update_fee: [
    { name: 'channel_id', type: 'channel_id' },
    { name: 'feerate_per_kw', type: 'u32' },
  ],
}

// Message type to name mapping
const MSG_TYPE_TO_NAME: { [key: number]: string } = {}
const MSG_NAME_TO_TYPE: { [key: string]: number } = {}

for (const [name, type] of Object.entries(MSG_TYPES)) {
  MSG_TYPE_TO_NAME[type] = name.toLowerCase()
  MSG_NAME_TO_TYPE[name.toLowerCase()] = type
}

/**
 * Encode a Lightning message
 */
export function encodeMsg(msgType: string, payload: { [key: string]: any }): Uint8Array {
  const msgTypeInt = MSG_NAME_TO_TYPE[msgType]
  if (msgTypeInt === undefined) {
    throw new UnknownMsgType(`Unknown message type: ${msgType}`)
  }

  const schema = MESSAGE_SCHEMAS[msgType]
  if (!schema) {
    throw new UnknownMsgType(`No schema for message type: ${msgType}`)
  }

  const buffers: Uint8Array[] = []

  // Add message type
  const typeBuffer = createUint8Array(2)
  writeUint16BE(typeBuffer, 0, msgTypeInt)
  buffers.push(typeBuffer)

  // Encode fields
  for (const field of schema) {
    const value = payload[field.name] || 0
    const count = field.count || 1
    const fieldBuffer = writeField(value, field.type, count as number | '...')
    buffers.push(fieldBuffer)
  }

  return concatUint8Arrays(buffers)
}

/**
 * Decode a Lightning message
 */
export function decodeMsg(data: Uint8Array): { msgType: string; payload: { [key: string]: any } } {
  if (data.length < 2) {
    throw new UnexpectedEndOfStream()
  }

  const msgTypeInt = readUint16BE(data, 0)
  const msgType = MSG_TYPE_TO_NAME[msgTypeInt]

  if (!msgType) {
    if (msgTypeInt % 2 === 0) {
      throw new UnknownMsgType(`Unknown mandatory message type: ${msgTypeInt}`)
    } else {
      throw new UnknownMsgType(`Unknown optional message type: ${msgTypeInt}`)
    }
  }

  const schema = MESSAGE_SCHEMAS[msgType]
  if (!schema) {
    throw new UnknownMsgType(`No schema for message type: ${msgType}`)
  }

  const payload: { [key: string]: any } = {}
  let offset = 2

  for (const field of schema) {
    const count = field.count || 1
    const { value, bytesRead } = readField(
      data,
      offset,
      field.type,
      count as number | '...' | string,
    )
    payload[field.name] = value
    offset += bytesRead
  }

  if (offset !== data.length) {
    throw new MalformedMsg('Message has trailing garbage')
  }

  return { msgType, payload }
}
