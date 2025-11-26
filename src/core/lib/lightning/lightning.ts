// BOLT #1: Base Protocol - Lightning Messaging Types
// Based on https://github.com/lightning/bolts/blob/master/01-messaging.md

// Fundamental Types
export type Byte = number // 8-bit unsigned
export type U16 = number // 16-bit unsigned
export type U32 = number // 32-bit unsigned
export type U64 = bigint // 64-bit unsigned
export type S8 = number // 8-bit signed
export type S16 = number // 16-bit signed
export type S32 = number // 32-bit signed
export type S64 = bigint // 64-bit signed

// Truncated unsigned integers (minimal encoding)
export type Tu16 = number // 0-2 bytes
export type Tu32 = number // 0-4 bytes
export type Tu64 = bigint // 0-8 bytes

// Convenience Types
export type ChainHash = Uint8Array // 32-byte chain identifier
export type ChannelId = Uint8Array // 32-byte channel identifier
export type Sha256 = Uint8Array // 32-byte SHA2-256 hash
export type Signature = Uint8Array // 64-byte bitcoin Elliptic Curve signature
export type Bip340sig = Uint8Array // 64-byte bitcoin Elliptic Curve Schnorr signature
export type Point = Uint8Array // 33-byte Elliptic Curve point (compressed)
export type ShortChannelId = Uint8Array // 8-byte channel identifier
export type SciddirOrPubkey = Uint8Array // 9 or 33 bytes
export type BigSize = bigint // Variable-length unsigned integer
export type Utf8 = string // UTF-8 string

/**
 * The type field indicates how to interpret the payload field.
 *
 * The messages are grouped logically into five groups, ordered by the most significant bit that is set:
 *
 * Setup & Control (types 0-31)
 *
 * Channel (types 32-127)
 *
 * Commitment (types 128-255)
 *
 * Routing (types 256-511)
 *
 * Custom (types 32768-65535)
 *
 * https://github.com/lightning/bolts/blob/master/01-messaging.md#lightning-message-format
 */
export enum LightningMessageType {
  // setup and control
  WARNING = 1,
  PEER_STORAGE = 7,
  PEER_STORAGE_RETRIEVAL = 9,
  INIT = 16,
  ERROR = 17,
  PING = 18,
  PONG = 19,
  // channel setup and teardown

  // Commitment

  // Routing

  // Custom
}

/**
 * Lightning Message Format
 * https://github.com/lightning/bolts/blob/master/01-messaging.md#lightning-message-format
 */
export interface LightningMessage {
  type: LightningMessageType
  payload: Uint8Array
  extension?: TlvStream
}

// TLV (Type-Length-Value) Format
export interface TlvRecord {
  type: BigSize
  length: BigSize
  value: Uint8Array
}

export type TlvStream = TlvRecord[]

// Init Message TLV Types
export enum InitTlvType {
  NETWORKS = 1,
  REMOTE_ADDR = 3,
}

export interface InitTlvNetworks {
  type: InitTlvType.NETWORKS
  chains: ChainHash[]
}

export interface InitTlvRemoteAddr {
  type: InitTlvType.REMOTE_ADDR
  data: Uint8Array // Address descriptor as per BOLT 7
}

export type InitTlvs = (InitTlvNetworks | InitTlvRemoteAddr)[]

// Init Message
export interface InitMessage {
  type: LightningMessageType.INIT
  gflen: U16
  globalfeatures: Uint8Array
  flen: U16
  features: Uint8Array
  tlvs: InitTlvs
}

// Error Message
export interface ErrorMessage {
  type: LightningMessageType.ERROR
  channelId: ChannelId
  len: U16
  data: Uint8Array
}

// Warning Message
export interface WarningMessage {
  type: LightningMessageType.WARNING
  channelId: ChannelId
  len: U16
  data: Uint8Array
}

// Ping Message
export interface PingMessage {
  type: LightningMessageType.PING
  numPongBytes: U16
  byteslen: U16
  ignored: Uint8Array
}

// Pong Message
export interface PongMessage {
  type: LightningMessageType.PONG
  byteslen: U16
  ignored: Uint8Array
}

// Peer Storage Message
export interface PeerStorageMessage {
  type: LightningMessageType.PEER_STORAGE
  length: U16
  blob: Uint8Array
}

// Peer Storage Retrieval Message
export interface PeerStorageRetrievalMessage {
  type: LightningMessageType.PEER_STORAGE_RETRIEVAL
  length: U16
  blob: Uint8Array
}

// Union type for all messages
export type LightningMessageUnion =
  | InitMessage
  | ErrorMessage
  | WarningMessage
  | PingMessage
  | PongMessage
  | PeerStorageMessage
  | PeerStorageRetrievalMessage

// Constants
export const LIGHTNING_MAINNET_PORT = 9735
export const LIGHTNING_TESTNET_PORT = 19735
export const LIGHTNING_SIGNET_PORT = 39735
export const LIGHTNING_REGTEST_PORT = 9735 // Same as mainnet typically

export const MAX_MESSAGE_SIZE = 65535

// BigSize encoding/decoding functions (utility)
export function encodeBigSize(value: BigSize): Uint8Array {
  if (value < 0xfdn) {
    return new Uint8Array([Number(value)])
  } else if (value < 0x10000n) {
    const buf = new Uint8Array(3)
    const view = new DataView(buf.buffer)
    view.setUint8(0, 0xfd)
    view.setUint16(1, Number(value), false) // big-endian
    return buf
  } else if (value < 0x100000000n) {
    const buf = new Uint8Array(5)
    const view = new DataView(buf.buffer)
    view.setUint8(0, 0xfe)
    view.setUint32(1, Number(value), false) // big-endian
    return buf
  } else {
    const buf = new Uint8Array(9)
    const view = new DataView(buf.buffer)
    view.setUint8(0, 0xff)
    view.setBigUint64(1, value, false) // big-endian
    return buf
  }
}

export function decodeBigSize(
  buf: Uint8Array,
  offset: number = 0,
): { value: BigSize; bytesRead: number } {
  const view = new DataView(buf.buffer, buf.byteOffset + offset)
  const first = view.getUint8(0)
  if (first < 0xfd) {
    return { value: BigInt(first), bytesRead: 1 }
  } else if (first === 0xfd) {
    const value = view.getUint16(1, false) // big-endian
    return { value: BigInt(value), bytesRead: 3 }
  } else if (first === 0xfe) {
    const value = view.getUint32(1, false) // big-endian
    return { value: BigInt(value), bytesRead: 5 }
  } else {
    // 0xff
    const value = view.getBigUint64(1, false) // big-endian
    return { value: value, bytesRead: 9 }
  }
}

// TLV Stream encoding/decoding (basic implementation)
export function encodeTlvStream(stream: TlvStream): Uint8Array {
  const buffers: Uint8Array[] = []
  for (const record of stream) {
    const typeBuf = encodeBigSize(record.type)
    const lengthBuf = encodeBigSize(record.length)
    buffers.push(typeBuf, lengthBuf, record.value)
  }
  // Concatenate Uint8Arrays
  const totalLength = buffers.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }
  return result
}

export function decodeTlvStream(buf: Uint8Array): TlvStream {
  const records: TlvRecord[] = []
  let offset = 0
  while (offset < buf.length) {
    const { value: type, bytesRead: typeBytes } = decodeBigSize(buf, offset)
    offset += typeBytes
    const { value: length, bytesRead: lengthBytes } = decodeBigSize(buf, offset)
    offset += lengthBytes
    const value = buf.subarray(offset, offset + Number(length))
    offset += Number(length)
    records.push({ type, length, value })
  }
  return records
}
