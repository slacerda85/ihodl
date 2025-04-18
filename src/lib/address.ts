import { bech32, bech32m } from 'bech32'
import bs58check from 'bs58check'
import { publicKeyVerify } from 'secp256k1'
import { hash160, sha256 } from '@/lib/crypto'

/** bech32 decode result */
export interface Bech32Result {
  /** address version: 0x00 for P2WPKH、P2WSH, 0x01 for P2TR*/
  version: number
  /** address prefix: bc for P2WPKH、P2WSH、P2TR */
  prefix: string
  /** address data：20 bytes for P2WPKH, 32 bytes for P2WSH、P2TR */
  data: Uint8Array
}

/**
 * Converts a Bech32 address to a public key hash and version.
 * @param {string} bech32Address - The Bech32 address to convert.
 * @returns {Bech32Result} - The public key hash and version.
 */
function fromBech32(bech32Address: string): Bech32Result {
  try {
    const result = bech32.decode(bech32Address)
    const version = result.words[0]
    const script = bech32.fromWords(result.words.slice(1))

    return { version, prefix: result.prefix, data: Uint8Array.from(script) }
  } catch (error) {
    throw new Error(`Invalid Bech32 address: ${(error as Error).message}`)
  }
}

function createSegwitAddress(publicKey: Uint8Array, version: number = 0): string {
  if (!publicKeyVerify(publicKey)) {
    throw new Error('Invalid public key')
  }
  // Satoshi's Hash160
  const hash = hash160(publicKey)
  // Convert the hash to words (5-bit groups)
  const programWords = bech32.toWords(hash)
  // Prepend the version byte to the words array
  const words = [version, ...programWords]
  // Encode using Bech32
  const segWitAddress = bech32.encode('bc', words)

  return segWitAddress
}

/**
 * Converts a public key hash and version to a Bech32 address.
 * @param {Uint8Array} publicKeyHash - The hash160 of public key.
 * @param {number} version - The version byte (0 or 1).
 * @param {string} [prefix='bc'] - The prefix for the Bech32 address (default is 'bc' for Bitcoin).
 * @returns {string} - The Bech32 address.
 */
function toBech32(publicKeyHash: Uint8Array, version: number = 0, prefix: string = 'bc'): string {
  try {
    const programWords = bech32.toWords(publicKeyHash)
    // Prepend the version byte to the words array
    const words = [version, ...programWords]
    // Encode using Bech32

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

function toScriptHash(address: string): string {
  // Assuming fromBech32 returns { version, data }
  const { version, data } = fromBech32(address)

  // Support only witness version 0 for simplicity
  if (version !== 0) {
    throw new Error('Only witness version 0 is supported')
  }

  // Validate data length (20 for P2WPKH, 32 for P2WSH)
  if (data.length !== 20 && data.length !== 32) {
    throw new Error('Invalid witness program length')
  }

  // Construct scriptPubKey: [OP_0, length, data]
  const scriptPubKey = new Uint8Array(2 + data.length)
  scriptPubKey[0] = 0x00 // OP_0
  scriptPubKey[1] = data.length // Push length (0x14 or 0x20)
  scriptPubKey.set(data, 2) // Append witness program

  // Hash the full scriptPubKey
  const hash = sha256(scriptPubKey)

  // Reverse the hash
  const reversedHash = new Uint8Array([...hash].reverse())

  // Convert to hex
  return Array.from(reversedHash)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export {
  createSegwitAddress,
  fromBech32,
  toScriptHash,
  /* fromBech32, toBech32, toBase58check, fromBase58check */
}
