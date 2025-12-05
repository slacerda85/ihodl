// Bech32m implementation for Taproot (P2TR) addresses
// Based on BIP 350: https://github.com/bitcoin/bips/blob/master/bip-0350.mediawiki
// Bech32m is a modified version of Bech32 with a different checksum constant for witness v1+ addresses

// Bech32 character set: 32 characters, excluding 1, b, i, o for readability
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'

// Generator polynomial for BCH checksum (same as Bech32)
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]

// Checksum constants
const BECH32_CONST = 1 // Original Bech32 (BIP 173) - for witness v0
const BECH32M_CONST = 0x2bc830a3 // Bech32m (BIP 350) - for witness v1+ (Taproot)

/**
 * Encoding types
 */
export enum Encoding {
  BECH32 = 'bech32',
  BECH32M = 'bech32m',
}

/**
 * Computes the BCH checksum polynomial modulo for error detection
 *
 * @param values - Array of 5-bit values to compute checksum for
 * @returns The checksum value
 */
function polymod(values: number[]): number {
  let chk = 1
  for (const v of values) {
    const b = chk >> 25
    chk = ((chk & 0x1ffffff) << 5) ^ v
    for (let i = 0; i < 5; i++) {
      if ((b >> i) & 1) {
        chk ^= GENERATOR[i]
      }
    }
  }
  return chk
}

/**
 * Expands the human-readable part for checksum calculation
 *
 * @param hrp - Human-readable part string (e.g., 'bc', 'tb')
 * @returns Array of expanded values for polymod calculation
 */
function hrpExpand(hrp: string): number[] {
  const result: number[] = []
  for (const c of hrp) {
    result.push(c.charCodeAt(0) >> 5)
  }
  result.push(0)
  for (const c of hrp) {
    result.push(c.charCodeAt(0) & 0x1f)
  }
  return result
}

/**
 * Creates a 6-character checksum for the given HRP and data
 *
 * @param hrp - Human-readable part (e.g., 'bc', 'tb')
 * @param data - Data values as 5-bit words (excluding checksum)
 * @param encoding - Bech32 or Bech32m encoding
 * @returns Array of 6 checksum values (5-bit words)
 */
function createChecksum(hrp: string, data: number[], encoding: Encoding): number[] {
  const values = hrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0])
  const constant = encoding === Encoding.BECH32M ? BECH32M_CONST : BECH32_CONST
  const polymodResult = polymod(values) ^ constant
  const checksum: number[] = []
  for (let i = 0; i < 6; i++) {
    checksum.push((polymodResult >> (5 * (5 - i))) & 0x1f)
  }
  return checksum
}

/**
 * Verifies the checksum of a Bech32/Bech32m string and returns the encoding type
 *
 * @param hrp - Human-readable part
 * @param data - Data including 6-character checksum at the end
 * @returns The encoding type if valid, null otherwise
 */
function verifyChecksum(hrp: string, data: number[]): Encoding | null {
  const result = polymod(hrpExpand(hrp).concat(data))
  if (result === BECH32_CONST) return Encoding.BECH32
  if (result === BECH32M_CONST) return Encoding.BECH32M
  return null
}

/**
 * Converts bytes to 5-bit words (base32 encoding)
 *
 * @param bytes - Input bytes (binary data)
 * @returns Array of 5-bit words for Bech32 encoding
 */
export function toWords(bytes: Uint8Array): number[] {
  const words: number[] = []
  let bits = 0
  let value = 0

  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8

    while (bits >= 5) {
      bits -= 5
      words.push((value >> bits) & 0x1f)
    }
  }

  if (bits > 0) {
    words.push((value << (5 - bits)) & 0x1f)
  }

  return words
}

/**
 * Converts 5-bit words back to bytes (base32 to binary)
 *
 * @param words - Array of 5-bit words from Bech32 data part
 * @param checkPadding - Whether to validate that padding bits are zero (default: true)
 * @returns Reconstructed bytes (padding bits are discarded)
 * @throws Error if checkPadding is true and padding contains non-zero bits
 */
export function fromWords(words: number[], checkPadding = true): Uint8Array {
  const bytes: number[] = []
  let bits = 0
  let value = 0n

  for (const word of words) {
    value = (value << 5n) | BigInt(word)
    bits += 5

    while (bits >= 8) {
      bits -= 8
      bytes.push(Number((value >> BigInt(bits)) & 0xffn))
    }
  }

  if (checkPadding && bits > 0) {
    const paddingMask = (1n << BigInt(bits)) - 1n
    if ((value & paddingMask) !== 0n) {
      throw new Error('Invalid padding: non-zero padding bits')
    }
  }

  return new Uint8Array(bytes)
}

/**
 * Encodes data into a Bech32m string
 *
 * @param hrp - Human-readable part (e.g., 'bc', 'tb')
 * @param words - Data as 5-bit words (will be checksummed)
 * @param encoding - Bech32 or Bech32m encoding (default: Bech32m)
 * @returns Bech32m encoded string (lowercase)
 */
export function encode(
  hrp: string,
  words: number[],
  encoding: Encoding = Encoding.BECH32M,
): string {
  const checksum = createChecksum(hrp, words, encoding)
  const allWords = words.concat(checksum)
  const dataPart = allWords.map(w => CHARSET[w]).join('')
  return hrp + '1' + dataPart
}

/**
 * Decodes a Bech32/Bech32m string into HRP, data words, and encoding type
 *
 * @param str - Bech32/Bech32m string to decode
 * @returns Object with prefix (HRP), data words, and encoding type
 * @throws Error if string is invalid or checksum fails
 */
export function decode(str: string): { prefix: string; words: number[]; encoding: Encoding } {
  const hasUpper = str !== str.toLowerCase()
  const hasLower = str !== str.toUpperCase()
  if (hasUpper && hasLower) {
    throw new Error('Bech32 string cannot be mixed case')
  }

  const lowered = str.toLowerCase()
  const sepIndex = lowered.lastIndexOf('1')

  if (sepIndex === -1 || sepIndex === 0 || sepIndex + 7 > lowered.length) {
    throw new Error('Invalid Bech32 string: missing or invalid separator')
  }

  const hrp = lowered.slice(0, sepIndex)
  const dataPart = lowered.slice(sepIndex + 1)

  const data: number[] = []
  for (const c of dataPart) {
    const index = CHARSET.indexOf(c)
    if (index === -1) {
      throw new Error(`Invalid character '${c}' in Bech32 data`)
    }
    data.push(index)
  }

  if (data.length < 6) {
    throw new Error('Bech32 data too short (minimum 6 characters)')
  }

  const encoding = verifyChecksum(hrp, data)
  if (encoding === null) {
    throw new Error('Invalid Bech32/Bech32m checksum')
  }

  return {
    prefix: hrp,
    words: data.slice(0, -6),
    encoding,
  }
}

// ==========================================
// P2TR (Pay-to-Taproot) SPECIFIC FUNCTIONS
// ==========================================

/**
 * Network prefixes for Bitcoin addresses
 */
export const NETWORK_PREFIX = {
  MAINNET: 'bc',
  TESTNET: 'tb',
  SIGNET: 'tb',
  REGTEST: 'bcrt',
} as const

export type NetworkPrefix = (typeof NETWORK_PREFIX)[keyof typeof NETWORK_PREFIX]

/**
 * Witness program versions
 */
export const WITNESS_VERSION = {
  V0: 0, // P2WPKH, P2WSH (uses Bech32)
  V1: 1, // P2TR Taproot (uses Bech32m)
} as const

/**
 * Encodes a Taproot (P2TR) address from a 32-byte x-only public key
 *
 * BIP 350: "Witness version 1 (Taproot) and higher use Bech32m"
 * BIP 341: "A Taproot output is a native SegWit output with version 1"
 *
 * @param xOnlyPubkey - 32-byte x-only public key (Schnorr)
 * @param prefix - Network prefix ('bc' for mainnet, 'tb' for testnet)
 * @returns Bech32m encoded P2TR address
 * @throws Error if public key is not 32 bytes
 */
export function encodeP2TR(xOnlyPubkey: Uint8Array, prefix: NetworkPrefix = 'bc'): string {
  if (xOnlyPubkey.length !== 32) {
    throw new Error(
      `Invalid x-only public key length: expected 32 bytes, got ${xOnlyPubkey.length}`,
    )
  }

  // Witness version 1 (Taproot)
  const witnessVersion = WITNESS_VERSION.V1
  const words = [witnessVersion, ...toWords(xOnlyPubkey)]

  return encode(prefix, words, Encoding.BECH32M)
}

/**
 * Decodes a Taproot (P2TR) address to extract the x-only public key
 *
 * @param address - Bech32m encoded P2TR address
 * @returns Object with network prefix and 32-byte x-only public key
 * @throws Error if address is invalid or not a P2TR address
 */
export function decodeP2TR(address: string): { prefix: NetworkPrefix; xOnlyPubkey: Uint8Array } {
  const { prefix, words, encoding } = decode(address)

  // P2TR must use Bech32m encoding
  if (encoding !== Encoding.BECH32M) {
    throw new Error('P2TR address must use Bech32m encoding')
  }

  // First word is witness version
  if (words.length === 0) {
    throw new Error('Invalid address: no witness version')
  }

  const witnessVersion = words[0]

  // P2TR is witness version 1
  if (witnessVersion !== WITNESS_VERSION.V1) {
    throw new Error(`Invalid witness version for P2TR: expected 1, got ${witnessVersion}`)
  }

  // Convert remaining words to bytes
  const xOnlyPubkey = fromWords(words.slice(1))

  // P2TR witness program must be exactly 32 bytes
  if (xOnlyPubkey.length !== 32) {
    throw new Error(
      `Invalid P2TR witness program length: expected 32 bytes, got ${xOnlyPubkey.length}`,
    )
  }

  return {
    prefix: prefix as NetworkPrefix,
    xOnlyPubkey,
  }
}

/**
 * Validates a Taproot (P2TR) address
 *
 * @param address - Address string to validate
 * @returns True if address is a valid P2TR address
 */
export function isValidP2TR(address: string): boolean {
  try {
    decodeP2TR(address)
    return true
  } catch {
    return false
  }
}

/**
 * Creates the scriptPubKey for a P2TR output
 *
 * BIP 341: OP_1 <32-byte-x-only-pubkey>
 * Format: 0x51 0x20 <32-byte-key>
 *
 * @param xOnlyPubkey - 32-byte x-only public key
 * @returns 34-byte scriptPubKey
 */
export function createP2TRScriptPubKey(xOnlyPubkey: Uint8Array): Uint8Array {
  if (xOnlyPubkey.length !== 32) {
    throw new Error(
      `Invalid x-only public key length: expected 32 bytes, got ${xOnlyPubkey.length}`,
    )
  }

  // OP_1 (0x51) + PUSH32 (0x20) + 32-byte key
  const script = new Uint8Array(34)
  script[0] = 0x51 // OP_1 (witness version 1)
  script[1] = 0x20 // Push 32 bytes
  script.set(xOnlyPubkey, 2)

  return script
}

/**
 * Extracts the x-only public key from a P2TR scriptPubKey
 *
 * @param scriptPubKey - 34-byte P2TR scriptPubKey
 * @returns 32-byte x-only public key
 * @throws Error if scriptPubKey is invalid
 */
export function extractP2TRPubkey(scriptPubKey: Uint8Array): Uint8Array {
  if (scriptPubKey.length !== 34) {
    throw new Error(
      `Invalid P2TR scriptPubKey length: expected 34 bytes, got ${scriptPubKey.length}`,
    )
  }

  if (scriptPubKey[0] !== 0x51) {
    throw new Error('Invalid P2TR scriptPubKey: expected OP_1 (0x51)')
  }

  if (scriptPubKey[1] !== 0x20) {
    throw new Error('Invalid P2TR scriptPubKey: expected PUSH32 (0x20)')
  }

  return scriptPubKey.slice(2)
}

/**
 * Checks if a scriptPubKey is a P2TR output
 *
 * @param scriptPubKey - Script to check
 * @returns True if it's a valid P2TR scriptPubKey
 */
export function isP2TRScriptPubKey(scriptPubKey: Uint8Array): boolean {
  return (
    scriptPubKey.length === 34 &&
    scriptPubKey[0] === 0x51 && // OP_1
    scriptPubKey[1] === 0x20 // PUSH32
  )
}

/**
 * Converts an address to its scriptPubKey
 *
 * @param address - Bech32m P2TR address
 * @returns 34-byte scriptPubKey
 */
export function addressToScriptPubKey(address: string): Uint8Array {
  const { xOnlyPubkey } = decodeP2TR(address)
  return createP2TRScriptPubKey(xOnlyPubkey)
}

/**
 * Converts a scriptPubKey to a P2TR address
 *
 * @param scriptPubKey - 34-byte P2TR scriptPubKey
 * @param prefix - Network prefix ('bc' for mainnet, 'tb' for testnet)
 * @returns Bech32m encoded P2TR address
 */
export function scriptPubKeyToAddress(
  scriptPubKey: Uint8Array,
  prefix: NetworkPrefix = 'bc',
): string {
  const xOnlyPubkey = extractP2TRPubkey(scriptPubKey)
  return encodeP2TR(xOnlyPubkey, prefix)
}
