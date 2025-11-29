// Custom Bech32 implementation for Lightning Network invoices
// Based on BIP 173: https://github.com/bitcoin/bips/blob/master/bip-0173.mediawiki
// This implementation removes the 90-word limit to support longer Lightning invoices as per BOLT 11

// Bech32 character set: 32 characters, excluding 1, b, i, o for readability
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'

// Generator polynomial for BCH checksum (coefficients for error detection)
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]

/**
 * Computes the BCH checksum polynomial modulo for error detection
 * BIP-173: "This implements a BCH code that guarantees detection of any error
 * affecting at most 4 characters and has less than a 1 in 10^9 chance of
 * failing to detect more errors."
 *
 * Uses generator polynomial with coefficients defined in GENERATOR array.
 *
 * @param values - Array of 5-bit values to compute checksum for
 * @returns The checksum value (should be 1 for valid Bech32 strings)
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
 * BIP-173: "The human-readable part is processed by first feeding the higher
 * bits of each character's US-ASCII value into the checksum calculation
 * followed by a zero and then the lower bits of each."
 *
 * Format: [high bits of each char] + [0] + [low 5 bits of each char]
 *
 * @param hrp - Human-readable part string (e.g., 'bc', 'lnbc')
 * @returns Array of expanded values for polymod calculation
 */
function hrpExpand(hrp: string): number[] {
  const result: number[] = []
  // Add high 3 bits of each character
  for (const c of hrp) {
    result.push(c.charCodeAt(0) >> 5)
  }
  // Add separator (0)
  result.push(0)
  // Add low 5 bits of each character
  for (const c of hrp) {
    result.push(c.charCodeAt(0) & 0x1f)
  }
  return result
}

/**
 * Creates a 6-character checksum for the given HRP and data
 * BIP-173: "To construct a valid checksum given the human-readable part and
 * (non-checksum) values of the data-part characters..."
 *
 * The checksum is computed as: polymod(hrpExpand + data + [0,0,0,0,0,0]) XOR 1
 * Then the 6 checksum values are extracted from the result.
 *
 * @param hrp - Human-readable part (e.g., 'bc', 'lnbc')
 * @param data - Data values as 5-bit words (excluding checksum)
 * @returns Array of 6 checksum values (5-bit words)
 */
function createChecksum(hrp: string, data: number[]): number[] {
  const values = hrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0])
  const polymodResult = polymod(values) ^ 1
  const checksum: number[] = []
  for (let i = 0; i < 6; i++) {
    checksum.push((polymodResult >> (5 * (5 - i))) & 0x1f)
  }
  return checksum
}

/**
 * Verifies the checksum of a Bech32 string
 * BIP-173: "Valid strings MUST pass the criteria for validity...
 * bech32_polymod(bech32_hrp_expand(hrp) + data) == 1"
 *
 * @param hrp - Human-readable part (e.g., 'bc', 'lnbc')
 * @param data - Data including 6-character checksum at the end
 * @returns True if checksum is valid (polymod result equals 1)
 */
function verifyChecksum(hrp: string, data: number[]): boolean {
  return polymod(hrpExpand(hrp).concat(data)) === 1
}

/**
 * Converts bytes to 5-bit words (base32 encoding)
 * BIP-173: "Start with the bits of the witness program, most significant bit per byte first.
 * Re-arrange those bits into groups of 5, and pad with zeroes at the end if needed."
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

  // Add remaining bits as final word (padded with zeros)
  if (bits > 0) {
    words.push((value << (5 - bits)) & 0x1f)
  }

  return words
}

/**
 * Converts 5-bit words back to bytes (base32 to binary)
 *
 * BIP-173 Segwit: "Any incomplete group at the end MUST be 4 bits or less,
 * MUST be all zeroes, and is discarded."
 *
 * BOLT 11 Lightning: "MUST pad field data to a multiple of 5 bits, using 0s."
 * This can result in more than 4 bits of padding when converting tagged fields.
 *
 * This implementation follows BOLT 11 and allows any amount of padding bits,
 * as long as they are all zeros. This makes it compatible with both BIP-173
 * Segwit addresses and BOLT 11 Lightning invoices.
 *
 * Note: For BOLT 11 tagged field data, padding validation should be skipped
 * because the field data itself (e.g., Bech32-encoded fallback addresses)
 * may contain non-zero bits in the padding position when converted from
 * 5-bit words to 8-bit bytes. The padding requirement "MUST pad field data
 * to a multiple of 5 bits, using 0s" applies at the 5-bit word level,
 * not at the final byte level after fromWords conversion.
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

  // Verify remaining padding bits are all zeros (BOLT 11 requirement)
  // Skip this check for tagged field data which may have encoded addresses
  if (checkPadding && bits > 0) {
    const paddingMask = (1n << BigInt(bits)) - 1n
    if ((value & paddingMask) !== 0n) {
      throw new Error('Invalid padding: non-zero padding bits')
    }
  }

  return new Uint8Array(bytes)
}

/**
 * Encodes data into a Bech32 string
 * BIP-173: "A Bech32 string consists of:
 * - The human-readable part (1-83 US-ASCII characters)
 * - The separator '1'
 * - The data part (at least 6 characters)"
 *
 * Format: hrp + '1' + data + checksum (all lowercase)
 *
 * @param hrp - Human-readable part (e.g., 'bc', 'lnbc', 'tb')
 * @param words - Data as 5-bit words (will be checksummed)
 * @returns Bech32 encoded string (lowercase)
 */
export function encode(hrp: string, words: number[]): string {
  // Create checksum for the data
  const checksum = createChecksum(hrp, words)

  // Combine data and checksum
  const allWords = words.concat(checksum)

  // Convert to characters using charset
  const dataPart = allWords.map(w => CHARSET[w]).join('')

  // Format: hrp + '1' + data + checksum
  return hrp + '1' + dataPart
}

/**
 * Decodes a Bech32 string into HRP and data words
 * BIP-173: "Decoders MUST NOT accept strings where some characters are
 * uppercase and some are lowercase (such strings are referred to as mixed case strings)."
 *
 * Validates:
 * - No mixed case (all upper or all lower)
 * - Valid separator position
 * - Valid character set
 * - Valid checksum
 *
 * @param str - Bech32 string to decode
 * @returns Object with prefix (HRP) and data words (excluding 6 checksum words)
 * @throws Error if string is invalid or checksum fails
 */
export function decode(str: string): { prefix: string; words: number[] } {
  // BIP-173: Check for mixed case
  const hasUpper = str !== str.toLowerCase()
  const hasLower = str !== str.toUpperCase()
  if (hasUpper && hasLower) {
    throw new Error('Bech32 string cannot be mixed case')
  }

  // Convert to lowercase for processing
  const lowered = str.toLowerCase()

  // Find separator (last '1' in string)
  const sepIndex = lowered.lastIndexOf('1')
  if (sepIndex === -1 || sepIndex === 0 || sepIndex + 7 > lowered.length) {
    throw new Error('Invalid Bech32 string: missing or invalid separator')
  }

  // Extract human-readable part
  const hrp = lowered.slice(0, sepIndex)

  // Extract data part (including checksum)
  const dataPart = lowered.slice(sepIndex + 1)

  // Convert data characters to 5-bit values
  const data: number[] = []
  for (const c of dataPart) {
    const index = CHARSET.indexOf(c)
    if (index === -1) {
      throw new Error(`Invalid character '${c}' in Bech32 data`)
    }
    data.push(index)
  }

  // Must have at least 6 characters for checksum
  if (data.length < 6) {
    throw new Error('Bech32 data too short (minimum 6 characters)')
  }

  // Verify checksum
  if (!verifyChecksum(hrp, data)) {
    throw new Error('Invalid Bech32 checksum')
  }

  // Return prefix and data (excluding 6 checksum characters)
  return {
    prefix: hrp,
    words: data.slice(0, -6),
  }
}
