// BOLT #1: Base Protocol

import {
  BigSize,
  TlvRecord,
  TlvStream,
  LightningMessageType,
  InitMessage,
  ErrorMessage,
  WarningMessage,
  PingMessage,
  PongMessage,
  PeerStorageMessage,
  PeerStorageRetrievalMessage,
  InitTlvs,
} from '@/core/models/lightning'

// Fundamental Type Encoding/Decoding Utilities
export function encodeU16(value: number): Uint8Array {
  const buf = new Uint8Array(2)
  const view = new DataView(buf.buffer)
  view.setUint16(0, value, false) // big-endian
  return buf
}

export function decodeU16(buf: Uint8Array, offset: number = 0): number {
  const view = new DataView(buf.buffer, buf.byteOffset + offset)
  return view.getUint16(0, false) // big-endian
}

export function encodeU32(value: number): Uint8Array {
  const buf = new Uint8Array(4)
  const view = new DataView(buf.buffer)
  view.setUint32(0, value, false) // big-endian
  return buf
}

export function decodeU32(buf: Uint8Array, offset: number = 0): number {
  const view = new DataView(buf.buffer, buf.byteOffset + offset)
  return view.getUint32(0, false) // big-endian
}

export function encodeU64(value: bigint): Uint8Array {
  const buf = new Uint8Array(8)
  const view = new DataView(buf.buffer)
  view.setBigUint64(0, value, false) // big-endian
  return buf
}

export function decodeU64(buf: Uint8Array, offset: number = 0): bigint {
  const view = new DataView(buf.buffer, buf.byteOffset + offset)
  return view.getBigUint64(0, false) // big-endian
}

export function encodeS16(value: number): Uint8Array {
  const buf = new Uint8Array(2)
  const view = new DataView(buf.buffer)
  view.setInt16(0, value, false) // big-endian, two's complement
  return buf
}

export function decodeS16(buf: Uint8Array, offset: number = 0): number {
  const view = new DataView(buf.buffer, buf.byteOffset + offset)
  return view.getInt16(0, false) // big-endian, two's complement
}

export function encodeS32(value: number): Uint8Array {
  const buf = new Uint8Array(4)
  const view = new DataView(buf.buffer)
  view.setInt32(0, value, false) // big-endian, two's complement
  return buf
}

export function decodeS32(buf: Uint8Array, offset: number = 0): number {
  const view = new DataView(buf.buffer, buf.byteOffset + offset)
  return view.getInt32(0, false) // big-endian, two's complement
}

export function encodeS64(value: bigint): Uint8Array {
  const buf = new Uint8Array(8)
  const view = new DataView(buf.buffer)
  view.setBigInt64(0, value, false) // big-endian, two's complement
  return buf
}

export function decodeS64(buf: Uint8Array, offset: number = 0): bigint {
  const view = new DataView(buf.buffer, buf.byteOffset + offset)
  return view.getBigInt64(0, false) // big-endian, two's complement
}

// Truncated Unsigned Integers (minimal encoding, omit leading zeros)
export function encodeTu16(value: number): Uint8Array {
  if (value === 0) return new Uint8Array(0)
  if (value < 0x100) return new Uint8Array([value])
  return encodeU16(value)
}

export function decodeTu16(
  buf: Uint8Array,
  offset: number = 0,
): { value: number; bytesRead: number } {
  if (offset >= buf.length) return { value: 0, bytesRead: 0 }
  if (offset + 1 >= buf.length) {
    return { value: buf[offset], bytesRead: 1 }
  }
  return { value: decodeU16(buf, offset), bytesRead: 2 }
}

export function encodeTu32(value: number): Uint8Array {
  if (value === 0) return new Uint8Array(0)
  if (value < 0x100) return new Uint8Array([value])
  if (value < 0x10000) return encodeU16(value)
  return encodeU32(value)
}

export function decodeTu32(
  buf: Uint8Array,
  offset: number = 0,
): { value: number; bytesRead: number } {
  if (offset >= buf.length) return { value: 0, bytesRead: 0 }
  const first = buf[offset]
  if (first === 0) return { value: 0, bytesRead: 1 }
  if (first < 0x100) return { value: first, bytesRead: 1 }
  if (first === 0xfd) {
    if (offset + 3 > buf.length) throw new Error('insufficient bytes for tu32')
    return { value: decodeU16(buf, offset + 1), bytesRead: 3 }
  }
  if (offset + 4 > buf.length) throw new Error('insufficient bytes for tu32')
  return { value: decodeU32(buf, offset), bytesRead: 4 }
}

export function encodeTu64(value: bigint): Uint8Array {
  if (value === 0n) return new Uint8Array(0)
  if (value < 0x100n) return new Uint8Array([Number(value)])
  if (value < 0x10000n) return encodeU16(Number(value))
  if (value < 0x100000000n) return encodeU32(Number(value))
  return encodeU64(value)
}

export function decodeTu64(
  buf: Uint8Array,
  offset: number = 0,
): { value: bigint; bytesRead: number } {
  if (offset >= buf.length) return { value: 0n, bytesRead: 0 }
  if (offset + 1 >= buf.length) {
    return { value: BigInt(buf[offset]), bytesRead: 1 }
  }
  if (offset + 2 >= buf.length) {
    return { value: BigInt(decodeU16(buf, offset)), bytesRead: 2 }
  }
  if (offset + 4 >= buf.length) {
    return { value: BigInt(decodeU32(buf, offset)), bytesRead: 4 }
  }
  return { value: decodeU64(buf, offset), bytesRead: 8 }
}

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
  let value: BigSize
  let bytesRead: number
  if (first < 0xfd) {
    value = BigInt(first)
    bytesRead = 1
  } else if (first === 0xfd) {
    value = BigInt(view.getUint16(1, false)) // big-endian
    bytesRead = 3
  } else if (first === 0xfe) {
    value = BigInt(view.getUint32(1, false)) // big-endian
    bytesRead = 5
  } else {
    // 0xff
    value = view.getBigUint64(1, false) // big-endian
    bytesRead = 9
  }
  // Check minimal encoding
  if (bytesRead === 3 && value < 0xfdn) throw new Error('BigSize not minimally encoded')
  if (bytesRead === 5 && value < 0x10000n) throw new Error('BigSize not minimally encoded')
  if (bytesRead === 9 && value < 0x100000000n) throw new Error('BigSize not minimally encoded')
  return { value, bytesRead }
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

// Message Encoding/Decoding Utilities (chronological order of protocol cycle)

// 1. Init Message (first message after connection)
export function encodeInitMessage(msg: InitMessage): Uint8Array {
  const typeBuf = encodeU16(msg.type)
  const gflenBuf = encodeU16(msg.gflen)
  const flenBuf = encodeU16(msg.flen)
  const tlvsBuf = encodeTlvStream(msg.tlvs as unknown as TlvStream)
  const totalLength =
    typeBuf.length +
    gflenBuf.length +
    msg.globalfeatures.length +
    flenBuf.length +
    msg.features.length +
    tlvsBuf.length
  const result = new Uint8Array(totalLength)
  let offset = 0
  result.set(typeBuf, offset)
  offset += typeBuf.length
  result.set(gflenBuf, offset)
  offset += gflenBuf.length
  result.set(msg.globalfeatures, offset)
  offset += msg.globalfeatures.length
  result.set(flenBuf, offset)
  offset += flenBuf.length
  result.set(msg.features, offset)
  offset += msg.features.length
  result.set(tlvsBuf, offset)
  return result
}

export function decodeInitMessage(buf: Uint8Array): InitMessage {
  let offset = 2 // skip type
  const gflen = decodeU16(buf, offset)
  offset += 2
  const globalfeatures = buf.subarray(offset, offset + gflen)
  offset += gflen
  const flen = decodeU16(buf, offset)
  offset += 2
  const features = buf.subarray(offset, offset + flen)
  offset += flen
  const tlvs = decodeTlvStream(buf.subarray(offset))
  return {
    type: LightningMessageType.INIT,
    gflen,
    globalfeatures,
    flen,
    features,
    tlvs: tlvs as unknown as InitTlvs,
  }
}

// 2. Error Message
export function encodeErrorMessage(msg: ErrorMessage): Uint8Array {
  const typeBuf = encodeU16(msg.type)
  const lenBuf = encodeU16(msg.len)
  const totalLength = typeBuf.length + msg.channelId.length + lenBuf.length + msg.data.length
  const result = new Uint8Array(totalLength)
  let offset = 0
  result.set(typeBuf, offset)
  offset += typeBuf.length
  result.set(msg.channelId, offset)
  offset += msg.channelId.length
  result.set(lenBuf, offset)
  offset += lenBuf.length
  result.set(msg.data, offset)
  return result
}

export function decodeErrorMessage(buf: Uint8Array): ErrorMessage {
  let offset = 2 // skip type
  const channelId = buf.subarray(offset, offset + 32)
  offset += 32
  const len = decodeU16(buf, offset)
  offset += 2
  const data = buf.subarray(offset, offset + len)
  return {
    type: LightningMessageType.ERROR,
    channelId,
    len,
    data,
  }
}

// 3. Warning Message
export function encodeWarningMessage(msg: WarningMessage): Uint8Array {
  const typeBuf = encodeU16(msg.type)
  const lenBuf = encodeU16(msg.len)
  const totalLength = typeBuf.length + msg.channelId.length + lenBuf.length + msg.data.length
  const result = new Uint8Array(totalLength)
  let offset = 0
  result.set(typeBuf, offset)
  offset += typeBuf.length
  result.set(msg.channelId, offset)
  offset += msg.channelId.length
  result.set(lenBuf, offset)
  offset += lenBuf.length
  result.set(msg.data, offset)
  return result
}

export function decodeWarningMessage(buf: Uint8Array): WarningMessage {
  let offset = 2 // skip type
  const channelId = buf.subarray(offset, offset + 32)
  offset += 32
  const len = decodeU16(buf, offset)
  offset += 2
  const data = buf.subarray(offset, offset + len)
  return {
    type: LightningMessageType.WARNING,
    channelId,
    len,
    data,
  }
}

// 4. Ping Message
export function encodePingMessage(msg: PingMessage): Uint8Array {
  const typeBuf = encodeU16(msg.type)
  const numPongBytesBuf = encodeU16(msg.numPongBytes)
  const byteslenBuf = encodeU16(msg.byteslen)
  const totalLength =
    typeBuf.length + numPongBytesBuf.length + byteslenBuf.length + msg.ignored.length
  const result = new Uint8Array(totalLength)
  let offset = 0
  result.set(typeBuf, offset)
  offset += typeBuf.length
  result.set(numPongBytesBuf, offset)
  offset += numPongBytesBuf.length
  result.set(byteslenBuf, offset)
  offset += byteslenBuf.length
  result.set(msg.ignored, offset)
  return result
}

export function decodePingMessage(buf: Uint8Array): PingMessage {
  let offset = 2 // skip type
  const numPongBytes = decodeU16(buf, offset)
  offset += 2
  const byteslen = decodeU16(buf, offset)
  offset += 2
  const ignored = buf.subarray(offset, offset + byteslen)
  return {
    type: LightningMessageType.PING,
    numPongBytes,
    byteslen,
    ignored,
  }
}

// 5. Pong Message
export function encodePongMessage(msg: PongMessage): Uint8Array {
  const typeBuf = encodeU16(msg.type)
  const byteslenBuf = encodeU16(msg.byteslen)
  const totalLength = typeBuf.length + byteslenBuf.length + msg.ignored.length
  const result = new Uint8Array(totalLength)
  let offset = 0
  result.set(typeBuf, offset)
  offset += typeBuf.length
  result.set(byteslenBuf, offset)
  offset += byteslenBuf.length
  result.set(msg.ignored, offset)
  return result
}

export function decodePongMessage(buf: Uint8Array): PongMessage {
  let offset = 2 // skip type
  const byteslen = decodeU16(buf, offset)
  offset += 2
  const ignored = buf.subarray(offset, offset + byteslen)
  return {
    type: LightningMessageType.PONG,
    byteslen,
    ignored,
  }
}

// 6. Peer Storage Message
export function encodePeerStorageMessage(msg: PeerStorageMessage): Uint8Array {
  const typeBuf = encodeU16(msg.type)
  const lengthBuf = encodeU16(msg.length)
  const totalLength = typeBuf.length + lengthBuf.length + msg.blob.length
  const result = new Uint8Array(totalLength)
  let offset = 0
  result.set(typeBuf, offset)
  offset += typeBuf.length
  result.set(lengthBuf, offset)
  offset += lengthBuf.length
  result.set(msg.blob, offset)
  return result
}

export function decodePeerStorageMessage(buf: Uint8Array): PeerStorageMessage {
  let offset = 2 // skip type
  const length = decodeU16(buf, offset)
  offset += 2
  const blob = buf.subarray(offset, offset + length)
  return {
    type: LightningMessageType.PEER_STORAGE,
    length,
    blob,
  }
}

// 7. Peer Storage Retrieval Message
export function encodePeerStorageRetrievalMessage(msg: PeerStorageRetrievalMessage): Uint8Array {
  const typeBuf = encodeU16(msg.type)
  const lengthBuf = encodeU16(msg.length)
  const totalLength = typeBuf.length + lengthBuf.length + msg.blob.length
  const result = new Uint8Array(totalLength)
  let offset = 0
  result.set(typeBuf, offset)
  offset += typeBuf.length
  result.set(lengthBuf, offset)
  offset += lengthBuf.length
  result.set(msg.blob, offset)
  return result
}

export function decodePeerStorageRetrievalMessage(buf: Uint8Array): PeerStorageRetrievalMessage {
  let offset = 2 // skip type
  const length = decodeU16(buf, offset)
  offset += 2
  const blob = buf.subarray(offset, offset + length)
  return {
    type: LightningMessageType.PEER_STORAGE_RETRIEVAL,
    length,
    blob,
  }
}
