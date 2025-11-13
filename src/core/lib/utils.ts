// Utility functions for Uint8Array manipulation and binary operations

export function createUint8Array(length: number): Uint8Array {
  return new Uint8Array(length)
}

export function uint8ArrayFrom(data: number[] | ArrayBuffer | Uint8Array): Uint8Array {
  if (Array.isArray(data)) {
    return new Uint8Array(data)
  } else if (data instanceof ArrayBuffer) {
    return new Uint8Array(data)
  } else if (data instanceof Uint8Array) {
    return data
  }
  throw new Error('Invalid data type for Uint8Array creation')
}

export function uint8ArrayFromHex(hex: string): Uint8Array {
  const length = hex.length / 2
  const array = new Uint8Array(length)
  for (let i = 0; i < length; i++) {
    array[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return array
}

export function uint8ArrayToHex(array: Uint8Array): string {
  return Array.from(array)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

export function sliceUint8Array(array: Uint8Array, start: number, end?: number): Uint8Array {
  return array.slice(start, end)
}

// Utility function for Buffer-like operations with Uint8Array
export function uint8ArrayFromBuffer(buffer: Uint8Array | ArrayBuffer | string): Uint8Array {
  if (typeof buffer === 'string') {
    return new TextEncoder().encode(buffer)
  }
  if (buffer instanceof ArrayBuffer) {
    return new Uint8Array(buffer)
  }
  return buffer
}

// DataView-based reading functions (big-endian)
export function readUint8(data: Uint8Array, offset: number): number {
  return data[offset]
}

export function readUint16BE(data: Uint8Array, offset: number): number {
  return (data[offset] << 8) | data[offset + 1]
}

export function readUint32BE(data: Uint8Array, offset: number): number {
  return (
    (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]
  )
}

export function readBigUint64BE(data: Uint8Array, offset: number): bigint {
  let result = 0n
  for (let i = 0; i < 8; i++) {
    result = (result << 8n) | BigInt(data[offset + i])
  }
  return result
}

// DataView-based writing functions (big-endian)
export function writeUint8(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value
}

export function writeUint16BE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = (value >> 8) & 0xff
  data[offset + 1] = value & 0xff
}

export function writeUint32BE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = (value >> 24) & 0xff
  data[offset + 1] = (value >> 16) & 0xff
  data[offset + 2] = (value >> 8) & 0xff
  data[offset + 3] = value & 0xff
}

export function writeBigUint64BE(data: Uint8Array, offset: number, value: bigint): void {
  for (let i = 7; i >= 0; i--) {
    data[offset + i] = Number(value & 0xffn)
    value >>= 8n
  }
}
