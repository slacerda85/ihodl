import { publicKeyVerify } from 'secp256k1'
import { hash160, sha256 } from './crypto'
import { bech32, bech32m } from 'bech32'
// import bs58check from 'bs58check'
import { Tx } from '../models/transaction'
import { createPublicKey, deriveChildKey, splitMasterKey } from './key'
// import { AddressDetails } from '../models/address'

/** Used address information */
export interface AddressDetails {
  address: string
  index: number
  type: 'receiving' | 'change'
  used: boolean
  transactions?: Tx[]
}

export interface Bech32Result {
  /** address version: 0x00 for P2WPKH、P2WSH, 0x01 for P2TR*/
  version: number
  /** address prefix: bc for P2WPKH、P2WSH、P2TR */
  prefix: string
  /** address data：20 bytes for P2WPKH, 32 bytes for P2WSH、P2TR */
  data: Uint8Array
}

function createAddress(publicKey: Uint8Array, version: number = 0): string {
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
/* function toBase58check(publicKeyHash: Uint8Array): string {
  try {
    return bs58check.encode(publicKeyHash)
  } catch (error) {
    throw new Error(`Invalid public key hash: ${(error as Error).message}`)
  }
} */

/**
 * Converts a Base58Check address to a public key hash.
 * @param {string} base58Address - The Base58Check address to convert.
 * @returns {Uint8Array} - The public key hash.
 */
/* function fromBase58check(base58Address: string): Uint8Array {
  try {
    return bs58check.decode(base58Address)
  } catch (error) {
    throw new Error(`Invalid Base58 address: ${(error as Error).message}`)
  }
} */

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

/**
 * Converts a legacy (P2PKH) address to a scripthash for Electrum queries.
 * @param {string} address - The legacy Bitcoin address (starting with '1').
 * @returns {string} - The scripthash as a hex string.
 */
/* function legacyToScriptHash(address: string): string {
  // Decode Base58Check address to get the public key hash (hash160)
  const hash160 = fromBase58check(address)

  // Validate hash160 length (should be 20 bytes for P2PKH)
  if (hash160.length !== 20) {
    throw new Error('Invalid P2PKH address: hash160 must be 20 bytes')
  }

  // Construct scriptPubKey for P2PKH: OP_DUP OP_HASH160 PUSH20 <hash160> OP_EQUALVERIFY OP_CHECKSIG
  const scriptPubKey = new Uint8Array(25)
  scriptPubKey[0] = 0x76 // OP_DUP
  scriptPubKey[1] = 0xa9 // OP_HASH160
  scriptPubKey[2] = 0x14 // PUSH20
  scriptPubKey.set(hash160, 3) // hash160
  scriptPubKey[23] = 0x88 // OP_EQUALVERIFY
  scriptPubKey[24] = 0xac // OP_CHECKSIG

  // Hash the scriptPubKey with SHA256
  const hash = sha256(scriptPubKey)

  // Reverse the hash (little-endian)
  const reversedHash = new Uint8Array([...hash].reverse())

  // Convert to hex
  return Array.from(reversedHash)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
} */

/**
 * Derives a SegWit address from an extended key and address index.
 * @param extendedKey - The extended key to derive from.
 * @param index - The address index.
 * @returns The derived SegWit address.
 */
function deriveAddress(extendedKey: any, index: number): string {
  const addressIndexExtendedKey = deriveChildKey(extendedKey, index)
  const { privateKey } = splitMasterKey(addressIndexExtendedKey)
  const addressIndexPublicKey = createPublicKey(privateKey)
  return createAddress(addressIndexPublicKey)
}

/**
 * Generates addresses for a wallet with optional change addresses
 * @param extendedKey - The extended key to derive addresses from
 * @param changeExtendedKey - The extended key to derive change addresses from (optional)
 * @param startIndex - The starting index for address generation
 * @param count - Number of addresses to generate
 * @returns Array of generated addresses with optional change addresses
 */
function generateAddresses(
  extendedKey: Uint8Array,
  changeExtendedKey?: Uint8Array,
  startIndex: number = 0,
  count: number = 20,
): Pick<AddressDetails, 'address' | 'index' | 'type'>[] {
  const addresses: Pick<AddressDetails, 'address' | 'index' | 'type'>[] = []
  for (let i = startIndex; i < startIndex + count; i++) {
    const address = deriveAddress(extendedKey, i)

    let changeAddress: string | undefined
    if (changeExtendedKey) {
      changeAddress = deriveAddress(changeExtendedKey, i)
    }

    addresses.push({ address, index: i, type: 'receiving' })
    if (changeAddress) {
      addresses.push({ address: changeAddress, index: i, type: 'change' })
    }
  }
  return addresses
}

export {
  createAddress,
  fromBech32,
  toBech32,
  // toBase58check,
  // fromBase58check,
  toScriptHash,
  // legacyToScriptHash,
  deriveAddress,
  generateAddresses,
}
