import { publicKeyVerify } from 'secp256k1'
import { hash160, sha256, taggedHash } from './crypto'
import { bech32, bech32m } from './bips'
import { Point } from '@noble/secp256k1'
import { uint8ArrayToHex } from './utils'
import { Tx } from '../models/transaction'
import { createPublicKey, deriveChildKey, splitMasterKey } from './key'
import { encodeBase58 } from './utils/base58'
import { getAllBech32Prefixes, getNetworkConfig } from '@/config/network'

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

function createAddress(
  publicKey: Uint8Array,
  version: number = 0,
  hrp: string = getNetworkConfig().bech32Hrp,
): string {
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
  const segWitAddress = bech32.encode(hrp, words)

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
 * @param {string} [prefix] - The prefix for the Bech32 address (default from network config).
 * @returns {string} - The Bech32 address.
 */
function toBech32(
  publicKeyHash: Uint8Array,
  version: number = 0,
  prefix: string = getNetworkConfig().bech32Hrp,
): string {
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
 * Encodes data to Bech32 or Bech32m format.
 * @param data - The data to encode.
 * @param prefix - The prefix for the Bech32 string.
 * @param version - The version (0 for Bech32, 1 for Bech32m).
 * @returns The encoded Bech32 string.
 */
function encodeBech32(data: Uint8Array, prefix: string, version: number): string {
  const dataArray = bech32.toWords(data)

  // Escolhe o método de codificação com base na versão
  if (version === 0) {
    return bech32.encode(prefix, dataArray)
  } else {
    return bech32m.encode(prefix, dataArray)
  }
}

/**
 * Decodes a Bech32 or Bech32m string.
 * @param bech32String - The Bech32 string to decode.
 * @returns The decoded prefix, data, and version.
 */
function decodeBech32(bech32String: string): { prefix: string; data: Uint8Array; version: number } {
  try {
    const { prefix, words } = bech32.decode(bech32String)
    // Se o checksum for válido para Bech32
    return { prefix, data: new Uint8Array(bech32.fromWords(words)), version: 0 }
  } catch {
    try {
      // Tenta Bech32m se Bech32 falhar
      const { prefix, words } = bech32m.decode(bech32String)
      return { prefix, data: new Uint8Array(bech32.fromWords(words)), version: 1 }
    } catch {
      throw new Error('Não é um endereço Bech32 ou Bech32m válido')
    }
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

/**
 * Encodes a Lightning node ID (compressed public key) to bech32 format with 'ln' prefix.
 * @param nodeId - The 33-byte compressed public key.
 * @returns The bech32-encoded node ID string.
 */
function encodeBech32NodeId(nodeId: Uint8Array): string {
  if (nodeId.length !== 33) {
    throw new Error('Node ID must be 33 bytes (compressed public key)')
  }
  const words = bech32.toWords(nodeId)
  return bech32.encode('ln', words)
}

/**
 * Decodes a bech32-encoded Lightning node ID to the compressed public key.
 * @param bech32NodeId - The bech32-encoded node ID string.
 * @returns The 33-byte compressed public key.
 */
function decodeBech32NodeId(bech32NodeId: string): Uint8Array {
  const decoded = bech32.decode(bech32NodeId)
  if (decoded.prefix !== 'ln') {
    throw new Error('Invalid HRP for Lightning node ID')
  }
  const nodeId = bech32.fromWords(decoded.words)
  if (nodeId.length !== 33) {
    throw new Error('Invalid node ID length')
  }
  return Uint8Array.from(nodeId)
}

/**
 * Creates a base58check encoded address from payload and version byte
 */
function base58checkEncode(version: number, payload: Uint8Array): string {
  const versionPayload = new Uint8Array([version, ...payload])
  const checksum = sha256(sha256(versionPayload)).subarray(0, 4)
  const fullPayload = new Uint8Array([...versionPayload, ...checksum])
  return encodeBase58(fullPayload)
}

/**
 * Creates P2PKH (legacy) address from public key
 */
function createP2PKHAddress(publicKey: Uint8Array): string {
  if (!publicKeyVerify(publicKey)) {
    throw new Error('Invalid public key')
  }
  // Hash160 of the public key
  const hash = hash160(publicKey)
  // Create base58check encoded address with version 0x00
  return base58checkEncode(0x00, hash)
}

/**
 * Creates a P2TR address from a public key
 * @param publicKey - Public key (32 or 33 bytes)
 * @param network - Network prefix ('bc' for mainnet, 'tb' for testnet)
 * @returns Taproot address (bech32m)
 */
function createP2TRAddress(
  publicKey: Uint8Array,
  hrp: string = getNetworkConfig().bech32Hrp,
): string {
  const outputKey = createTaprootOutputKey(publicKey)
  return bech32m.encode(hrp, [0x01, ...bech32m.toWords(outputKey)])
}

/**
 * Creates a P2SH address from a redeem script.
 * @param redeemScript - The redeem script.
 * @returns The P2SH address.
 */
function createP2SHAddress(redeemScript: Uint8Array): string {
  // Use base58 encoding (assuming available)
  // Placeholder: return base58 encoded
  throw new Error('P2SH address creation not fully implemented; needs base58')
}

/**
 * Creates a P2WSH address from a witness script.
 * @param witnessScript - The witness script.
 * @returns The P2WSH address.
 */
function createP2WSHAddress(witnessScript: Uint8Array): string {
  const scriptHash = sha256(witnessScript)
  const programWords = bech32.toWords(scriptHash)
  const words = [0, ...programWords] // Version 0 for P2WSH
  const hrp = getNetworkConfig().bech32Hrp
  return bech32.encode(hrp, words)
}

/**
 * Validates if an address is a valid Bitcoin address.
 * @param address - The address to validate.
 * @returns True if valid, false otherwise.
 */
function isValidAddress(address: string): boolean {
  try {
    fromBech32(address)
    return true
  } catch {
    // Placeholder: add base58 validation for legacy addresses
    return false
  }
}

/**
 * Converts an address to its scriptPubKey.
 * @param address - The Bitcoin address.
 * @returns The scriptPubKey as Uint8Array.
 */
function addressToScript(
  address: string,
  validHrps: string[] = getAllBech32Prefixes().map(prefix => `${prefix}1`),
): Uint8Array {
  if (validHrps.some(hrp => address.startsWith(hrp))) {
    const { version, data } = fromBech32(address)
    if (version === 0) {
      if (data.length === 20) {
        // P2WPKH
        return new Uint8Array([0x00, 0x14, ...data])
      } else if (data.length === 32) {
        // P2WSH
        return new Uint8Array([0x00, 0x20, ...data])
      }
    } else if (version === 1 && data.length === 32) {
      // P2TR
      return new Uint8Array([0x51, 0x20, ...data])
    }
  } else if (address.startsWith('1') || address.startsWith('3')) {
    // Legacy/base58 addresses
    // Placeholder: decode base58 and construct script
    throw new Error('Legacy address to script not implemented')
  }
  throw new Error('Unsupported address format')
}

/**
 * Derives an address from an extended key and address index.
 * @param extendedKey - The extended key to derive from.
 * @param index - The address index.
 * @param addressType - The type of address to derive ('legacy' | 'segwit' | 'taproot').
 * @returns The derived address.
 */
function deriveAddress(
  extendedKey: any,
  index: number,
  addressType: 'legacy' | 'segwit' | 'taproot' = 'segwit',
): string {
  const addressIndexExtendedKey = deriveChildKey(extendedKey, index)
  const { privateKey } = splitMasterKey(addressIndexExtendedKey)
  const addressIndexPublicKey = createPublicKey(privateKey)

  switch (addressType) {
    case 'legacy':
      return createP2PKHAddress(addressIndexPublicKey)
    case 'segwit':
      return createAddress(addressIndexPublicKey)
    case 'taproot':
      return createP2TRAddress(addressIndexPublicKey)
    default:
      throw new Error(`Unsupported address type: ${addressType}`)
  }
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

/**
 * Converts a public key to x-only format (32 bytes) for Taproot
 * @param publicKey - Full public key (33 or 65 bytes)
 * @returns X-only public key (32 bytes)
 */
function pubkeyToXOnly(publicKey: Uint8Array): Uint8Array {
  if (publicKey.length === 32) {
    return publicKey // Already x-only
  }

  if (publicKey.length === 33 || publicKey.length === 65) {
    // Extract x coordinate (first 32 bytes after potential compression byte)
    const offset = publicKey.length === 33 ? 1 : 1
    return publicKey.slice(offset, offset + 32)
  }

  throw new Error('Invalid public key length for x-only conversion')
}

/**
 * Tweaks a private key for Taproot (BIP-341)
 * @param privateKey - Original private key (32 bytes)
 * @param tweak - Tweak value (32 bytes)
 * @param isXOnly - Whether the tweak is for x-only pubkey
 * @returns Tweaked private key (32 bytes)
 */
function taprootTweakPrivateKey(
  privateKey: Uint8Array,
  tweak: Uint8Array,
  isXOnly: boolean = true,
): Uint8Array {
  if (privateKey.length !== 32 || tweak.length !== 32) {
    throw new Error('Private key and tweak must be 32 bytes each')
  }

  // Calculate t = tweak
  const t = tweak

  // Calculate tweaked_key = (private_key + t) mod n
  // For simplicity, we'll use a basic modular addition
  // In production, this should use proper elliptic curve arithmetic
  const tweakedKey = new Uint8Array(32)
  let carry = 0

  for (let i = 0; i < 32; i++) {
    const sum = privateKey[i] + t[i] + carry
    tweakedKey[i] = sum & 0xff
    carry = sum >> 8
  }

  // Handle modular reduction (simplified)
  if (carry > 0 || (tweakedKey[31] & 0x80) !== 0) {
    // This is a simplified modular reduction
    // Proper implementation should use secp256k1's modular arithmetic
    for (let i = 0; i < 32; i++) {
      tweakedKey[i] = (tweakedKey[i] - 1) & 0xff
    }
  }

  return tweakedKey
}

/**
 * Tweaks a public key for Taproot (BIP-341)
 * @param publicKey - Original public key (32 bytes, x-only)
 * @param tweak - Tweak value (32 bytes)
 * @returns Tweaked public key (32 bytes, x-only)
 */
function taprootTweakPublicKey(publicKey: Uint8Array, tweak: Uint8Array): Uint8Array {
  if (publicKey.length !== 32) {
    throw new Error('Public key must be 32 bytes (x-only)')
  }
  if (tweak.length !== 32) {
    throw new Error('Tweak must be 32 bytes')
  }

  try {
    // Convert tweak to bigint
    const tweakBigInt = BigInt('0x' + uint8ArrayToHex(tweak))

    // Create point from x-only public key (assume even parity)
    const point = Point.fromHex(uint8ArrayToHex(publicKey))

    // Create tweak point: t * G
    const tweakPoint = Point.BASE.multiply(tweakBigInt)

    // Add the points: P + t*G
    const tweakedPoint = point.add(tweakPoint)

    // Return x-only (32 bytes) - take x coordinate
    return tweakedPoint.toBytes().slice(1, 33)
  } catch (error) {
    throw new Error(`Public key tweaking failed: ${error}`)
  }
}

/**
 * Builds a Taproot script tree and calculates the merkle root
 * @param scripts - Array of scripts for the tree leaves
 * @returns Merkle root hash (32 bytes)
 */
function buildTaprootScriptTree(scripts: Uint8Array[]): Uint8Array {
  if (scripts.length === 0) {
    throw new Error('Script tree must have at least one script')
  }

  if (scripts.length === 1) {
    // Single script - leaf hash
    return taggedHash('TapLeaf', new Uint8Array([0xc0, ...scripts[0]]))
  }

  // Build binary tree
  const leaves = scripts.map(script => taggedHash('TapLeaf', new Uint8Array([0xc0, ...script])))

  // Sort leaves lexicographically as per BIP-341
  leaves.sort((a, b) => {
    for (let i = 0; i < 32; i++) {
      if (a[i] !== b[i]) return a[i] - b[i]
    }
    return 0
  })

  // Build merkle tree
  let currentLevel = leaves
  while (currentLevel.length > 1) {
    const nextLevel: Uint8Array[] = []

    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i]
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left

      // Sort the pair lexicographically
      const [a, b] = left < right ? [left, right] : [right, left]

      // Hash the branch
      nextLevel.push(taggedHash('TapBranch', new Uint8Array([...a, ...b])))
    }

    currentLevel = nextLevel
  }

  return currentLevel[0]
}

/**
 * Creates a Taproot output key from an internal key and script tree
 * @param internalKey - Internal public key (32 or 33 bytes)
 * @param scriptTree - Optional array of scripts for complex Taproot
 * @returns Taproot output key (32 bytes, x-only)
 */
function createTaprootOutputKey(internalKey: Uint8Array, scriptTree?: Uint8Array[]): Uint8Array {
  const xOnlyInternalKey = pubkeyToXOnly(internalKey)

  if (!scriptTree || scriptTree.length === 0) {
    // No script tree - output key is just the internal key
    return xOnlyInternalKey
  }

  // Build script tree and calculate merkle root
  const merkleRoot = buildTaprootScriptTree(scriptTree)

  // Calculate tweak: t = H_TapTweak(internal_key || merkle_root)
  const tweak = taggedHash('TapTweak', new Uint8Array([...xOnlyInternalKey, ...merkleRoot]))

  // Apply tweak to public key
  return taprootTweakPublicKey(xOnlyInternalKey, tweak)
}

/**
 * Creates a control block for Taproot script path spending
 * @param internalKey - Internal public key (32 bytes, x-only)
 * @param script - The script being spent
 * @param merkleProof - Merkle proof for the script
 * @param parity - Parity bit (0x02 or 0x03)
 * @returns Control block (33 bytes + proof)
 */
function createTaprootControlBlock(
  internalKey: Uint8Array,
  script: Uint8Array,
  merkleProof: Uint8Array[],
  parity: number = 0x02,
): Uint8Array {
  // Control block format: [parity_bit + internal_key + merkle_proof]
  const parts: Uint8Array[] = []

  // Parity bit (1 byte)
  parts.push(new Uint8Array([parity]))

  // Internal key (32 bytes)
  parts.push(internalKey)

  // Merkle proof (reversed order)
  for (const proof of merkleProof.reverse()) {
    parts.push(proof)
  }

  return concatUint8Arrays(parts)
}

/**
 * Validates a Taproot script path spend
 * @param controlBlock - Control block from the witness
 * @param script - Script being executed
 * @param outputKey - Taproot output key
 * @returns True if valid
 */
function validateTaprootScriptPath(
  controlBlock: Uint8Array,
  script: Uint8Array,
  outputKey: Uint8Array,
): boolean {
  try {
    if (controlBlock.length < 33) {
      return false
    }

    const internalKey = controlBlock.subarray(1, 33)
    const merkleProof = controlBlock.subarray(33)

    // Reconstruct the merkle root
    const scriptHash = taggedHash('TapLeaf', new Uint8Array([0xc0, ...script]))
    let currentHash = scriptHash

    // Apply merkle proof
    for (let i = 0; i < merkleProof.length; i += 32) {
      const sibling = merkleProof.subarray(i, i + 32)
      // Sort lexicographically
      const [left, right] = currentHash < sibling ? [currentHash, sibling] : [sibling, currentHash]
      currentHash = taggedHash('TapBranch', new Uint8Array([...left, ...right]))
    }

    // Calculate expected output key
    const tweak = taggedHash('TapTweak', new Uint8Array([...internalKey, ...currentHash]))
    const expectedOutputKey = taprootTweakPublicKey(internalKey, tweak)

    // Check if it matches
    return uint8ArrayToHex(expectedOutputKey) === uint8ArrayToHex(outputKey)
  } catch {
    return false
  }
}

/**
 * Helper function to concatenate Uint8Arrays
 */
function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

export {
  // bitcoin protocol
  createAddress,
  createP2PKHAddress,
  createP2TRAddress,
  createP2SHAddress,
  createP2WSHAddress,
  deriveAddress,
  fromBech32,
  toBech32,
  encodeBech32,
  decodeBech32,
  toScriptHash,
  generateAddresses,
  // Taproot functions
  pubkeyToXOnly,
  taprootTweakPrivateKey,
  taprootTweakPublicKey,
  createTaprootOutputKey,
  buildTaprootScriptTree,
  createTaprootControlBlock,
  validateTaprootScriptPath,
  //
  isValidAddress,
  addressToScript,
  // lightning protocol
  encodeBech32NodeId,
  decodeBech32NodeId,
}
