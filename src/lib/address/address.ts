import { bech32, bech32m } from 'bech32'
import bs58check from 'bs58check'

/**
 * Converts a Bech32 address to a public key hash and version.
 * @param {string} bech32Address - The Bech32 address to convert.
 * @returns {{ version: number; publicKeyHash: Uint8Array }} - An object containing the version and public key hash.
 */
function fromBech32(bech32Address: string): { version: number; publicKeyHash: Uint8Array } {
  try {
    const decoded = bech32.decode(bech32Address)
    const words = bech32.fromWords(decoded.words)
    const version = words[0]
    const publicKeyHash = Uint8Array.from(words.slice(1))

    if (version !== 0 && version !== 1) {
      throw new Error('Invalid version byte')
    }

    return { version, publicKeyHash }
  } catch (error) {
    throw new Error(`Invalid Bech32 address: ${(error as Error).message}`)
  }
}

/**
 * Converts a public key hash and version to a Bech32 address.
 * @param {Uint8Array} publicKeyHash - The public key hash to convert.
 * @param {number} version - The version byte (0 or 1).
 * @param {string} [prefix='bc'] - The prefix for the Bech32 address (default is 'bc' for Bitcoin).
 * @returns {string} - The Bech32 address.
 */
function toBech32(publicKeyHash: Uint8Array, version: number, prefix: string = 'bc'): string {
  try {
    const words = bech32.toWords(publicKeyHash)
    words.unshift(version)
    return version === 0 ? bech32.encode(prefix, words) : bech32m.encode(prefix, words)
  } catch (error) {
    throw new Error(`Invalid public key hash: ${(error as Error).message}`)
  }
}

/**
 * Converts a public key hash to a Base58Check address.
 * @param {Uint8Array} publicKeyHash - The public key hash to convert.
 * @returns {string} - The Base58Check address.
 */
function toBase58check(publicKeyHash: Uint8Array): string {
  try {
    return bs58check.encode(publicKeyHash)
  } catch (error) {
    throw new Error(`Invalid public key hash: ${(error as Error).message}`)
  }
}

/**
 * Converts a Base58Check address to a public key hash.
 * @param {string} base58Address - The Base58Check address to convert.
 * @returns {Uint8Array} - The public key hash.
 */
function fromBase58check(base58Address: string): Uint8Array {
  try {
    return bs58check.decode(base58Address)
  } catch (error) {
    throw new Error(`Invalid Base58 address: ${(error as Error).message}`)
  }
}

export { fromBech32, toBech32, toBase58check, fromBase58check }
