// Example of DataView usage for writing integers:
export function writeUInt32BE(array: Uint8Array, value: number, offset: number): void {
  const view = new DataView(array.buffer)
  view.setUint32(offset, value, false) // false for big-endian
}

export function writeUInt8(array: Uint8Array, value: number, offset: number): void {
  const view = new DataView(array.buffer)
  view.setUint8(offset, value)
}

// Example of reading integers:
export function readUInt32BE(array: Uint8Array, offset: number): number {
  const view = new DataView(array.buffer)
  return view.getUint32(offset, false) // false for big-endian
}
