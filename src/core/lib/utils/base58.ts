import base58 from 'bs58'

/**
 * Encodes data to Base58 string.
 * @param buffer - The data to encode.
 * @returns The Base58 encoded string.
 */
export function encodeBase58(buffer: Uint8Array): string {
  return base58.encode(buffer)
}

/**
 * Decodes a Base58 string to data.
 * @param base58String - The Base58 string to decode.
 * @returns The decoded Uint8Array.
 */
export function decodeBase58(base58String: string): Uint8Array {
  return base58.decode(base58String)
}
