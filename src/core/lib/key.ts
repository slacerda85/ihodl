import secp256k1 from 'secp256k1'
import { createChecksum, hash160, hmacSeed, hmacSHA512, uint8ArrayToHex } from '@/core/lib/crypto'
import { encodeBase58, decodeBase58 } from '@/core/lib/utils/base58'
import { entropyToMnemonic, mnemonicToSeedSync } from './bips/bip39'
import wordList from 'bip39/src/wordlists/english.json'
import { CURVE_ORDER } from '../models/key'
import { getNetworkConfig } from '@/config/network'

function toMnemonic(entropy: Uint8Array): string {
  // check if nBytes is a valid length of 128, 160, 192, 224, or 256 bits
  if (entropy.length % 4 !== 0 || entropy.length < 12 || entropy.length > 24) {
    throw new Error('Invalid mnemonic length')
  }
  return entropyToMnemonic(uint8ArrayToHex(entropy), wordList)
}

function fromMnemonic(mnemonic: string): Uint8Array {
  const seed = mnemonicToSeedSync(mnemonic)
  return seed
}

function createMasterKey(seed: Uint8Array): Uint8Array {
  const masterKey = hmacSeed(seed)
  return masterKey
}

function splitMasterKey(masterKey: Uint8Array<ArrayBufferLike>): {
  privateKey: Uint8Array
  chainCode: Uint8Array
} {
  const privateKey = masterKey.subarray(0, 32)
  const chainCode = masterKey.subarray(32, 64)

  if (!secp256k1.privateKeyVerify(privateKey)) {
    throw new Error('Invalid private key')
  }

  if (chainCode.length !== 32) {
    throw new Error('Invalid chain code')
  }

  return {
    privateKey,
    chainCode,
  }
}

function verifyMasterKey(masterKey: Uint8Array): boolean {
  // check if the extended key is valid
  if (masterKey.length !== 64) {
    throw new Error('Invalid extended key length')
  }

  // check if the private key is valid
  const privateKey = masterKey.subarray(0, 32)
  if (!secp256k1.privateKeyVerify(privateKey)) {
    throw new Error('Invalid private key')
  }

  // check if the chain code is valid
  const chainCode = masterKey.subarray(32, 64)
  if (chainCode.length !== 32) {
    throw new Error('Invalid chain code')
  }

  return true
}

function createPublicKey(privateKey: Uint8Array): Uint8Array {
  // check if the private key is valid
  if (!secp256k1.privateKeyVerify(privateKey)) {
    throw new Error('Invalid private key')
  }

  let publicKey

  do {
    publicKey = secp256k1.publicKeyCreate(privateKey)
  } while (!secp256k1.publicKeyVerify(publicKey))

  return publicKey
}

function deriveChildKey(extendedKey: Uint8Array, index: number): Uint8Array {
  const isHardened = index >= 0x80000000
  // const CURVE_ORDER = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')

  // mount the data to be hashed
  const privateKeyPadding = new Uint8Array(1)
  const paddingView = new DataView(privateKeyPadding.buffer)
  paddingView.setUint8(0, 0)

  const indexBuffer = new Uint8Array(4)
  const indexView = new DataView(indexBuffer.buffer)
  indexView.setUint32(0, index, false) // false for big-endian

  // Create key for HMAC
  const { privateKey, chainCode } = splitMasterKey(extendedKey)
  const key = isHardened
    ? new Uint8Array([...privateKeyPadding, ...privateKey])
    : createPublicKey(privateKey)

  // Combine key and index
  const data = new Uint8Array(key.length + indexBuffer.length)
  data.set(key)
  data.set(indexBuffer, key.length)

  const hmac = hmacSHA512(chainCode, data)
  const derivedKey = hmac.subarray(0, 32)
  const childChainCode = hmac.subarray(32)

  // Convert derived key to hex string then to BigInt
  const derivedHex = Array.from(derivedKey)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  const parse256IL = BigInt(`0x${derivedHex}`)

  if (parse256IL >= CURVE_ORDER) {
    throw new Error('Derived key is invalid (greater or equal to curve order).')
  }

  // Convert private key to hex string then to BigInt
  const privateKeyHex = Array.from(privateKey)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  const kpar = BigInt(`0x${privateKeyHex}`)
  const ki = (parse256IL + kpar) % CURVE_ORDER

  if (ki === BigInt(0)) {
    throw new Error('Derived key is invalid (zero value).')
  }

  // Convert result back to Uint8Array
  const childKeyHex = ki.toString(16).padStart(64, '0')
  const childKey = new Uint8Array(childKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)))

  const childExtendedKey = new Uint8Array(64)
  childExtendedKey.set(childKey, 0)
  childExtendedKey.set(childChainCode, 32)
  return childExtendedKey
}

/**
 * Creates a hardened index from a given index.
 * @param index - The index to be hardened.
 * @returns The hardened index.
 */
function createHardenedIndex(index: number): number {
  const HARDENED_OFFSET = 0x80000000 // This is 2^31 in hexadecimal
  return index + HARDENED_OFFSET
}

/**
 * Gets the parent fingerprint from a public key.
 * @param publicKey - The public key to derive the fingerprint from.
 * @returns The parent fingerprint.
 */
function getParentFingerprint(publicKey: Uint8Array): number {
  const hash = hash160(publicKey)
  // Convert first 4 bytes to a number using DataView
  const view = new DataView(hash.buffer, 0, 4)
  const parentFingerprint = view.getUint32(0)
  return parentFingerprint
}

/**
 * Serializes a private key into a specific format.
 * @param extendedKey - The extended key to serialize.
 * @param depth - The depth of the key (default is 0).
 * @param parentFingerprint - The parent fingerprint (default is 0).
 * @param childIndex - The child index (default is 0).
 * @param version - The version number (default is the mainnet private key version for bip84).
 * @throws Will throw an error if the depth, parent fingerprint, or child index is invalid.
 * @returns The serialized private key as a Uint8Array.
 */
function serializePrivateKey(
  extendedKey: Uint8Array,
  depth: number = 0,
  parentFingerprint: number = 0,
  childIndex: number = 0,
  version: Uint8Array = KEY_VERSIONS.bip84.mainnet.private,
): Uint8Array {
  const { privateKey, chainCode } = splitMasterKey(extendedKey)

  if (depth > 255) throw new Error('Invalid depth')

  if (parentFingerprint > 0xffffffff) {
    throw new Error('Invalid parent fingerprint')
  }

  if (childIndex > 0xffffffff) {
    throw new Error('Invalid child index')
  }

  // mount private key buffer (78 bytes)
  const privateKeyBuffer = new Uint8Array(78)
  const view = new DataView(privateKeyBuffer.buffer)

  // version number (4 bytes)
  const versionHex = Array.from(version)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  const versionNumber = parseInt(versionHex, 16)

  view.setUint32(0, versionNumber, false) // false for big-endian
  view.setUint8(4, depth) // depth (1 byte)
  view.setUint32(5, parentFingerprint, false) // parent fingerprint (4 bytes)
  view.setUint32(9, childIndex, false) // child index (4 bytes)
  privateKeyBuffer.set(chainCode, 13) // chain code (32 bytes)
  view.setUint8(45, 0) // 0x00 padding (1 byte)
  privateKeyBuffer.set(privateKey, 46) // private key (32 bytes)
  const checksum = createChecksum(privateKeyBuffer) // create checksum (4 bytes)

  // combine everything
  const finalKey = new Uint8Array(82) // 78 + 4 bytes
  finalKey.set(privateKeyBuffer)
  finalKey.set(checksum, 78)

  return finalKey
}

/**
 * Serializes a public key into a specific format.
 * @param publicKey - The public key to serialize.
 * @param chainCode - The chain code associated with the public key.
 * @param depth - The depth of the key (default is 0).
 * @param parentFingerprint - The parent fingerprint (default is 0).
 * @param childIndex - The child index (default is 0).
 * @param version - The version number (default is the mainnet public key version for bip84).
 * @throws Will throw an error if the depth, parent fingerprint, or child index is invalid.
 * @returns The serialized public key as a Uint8Array.
 */
function serializePublicKey(
  publicKey: Uint8Array,
  chainCode: Uint8Array,
  depth: number = 0,
  parentFingerprint: number = 0,
  childIndex: number = 0,
  version: Uint8Array,
): Uint8Array {
  if (!secp256k1.publicKeyVerify(publicKey)) {
    throw new Error('Invalid public key')
  }

  if (depth > 255) {
    throw new Error('Invalid depth')
  }

  if (parentFingerprint > 0xffffffff) {
    throw new Error('Invalid parent fingerprint')
  }

  if (childIndex > 0xffffffff) {
    throw new Error('Invalid child index')
  }

  // mount public key buffer (78 bytes)
  const publicKeyBuffer = new Uint8Array(78)
  const view = new DataView(publicKeyBuffer.buffer)

  // version number (4 bytes)
  const versionHex = Array.from(version)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  const versionNumber = parseInt(versionHex, 16)
  view.setUint32(0, versionNumber, false) // false for big-endian

  view.setUint8(4, depth) // depth (1 byte)

  view.setUint32(5, parentFingerprint, false) // parent fingerprint (4 bytes)

  view.setUint32(9, childIndex, false) // child index (4 bytes)

  publicKeyBuffer.set(chainCode, 13) // chain code (32 bytes)

  publicKeyBuffer.set(publicKey, 45) // public key (33 bytes)

  const checksum = createChecksum(publicKeyBuffer) // create checksum (4 bytes)

  // combine everything
  const serializedPublicKey = new Uint8Array(82) // 78 + 4 bytes
  serializedPublicKey.set(publicKeyBuffer)
  serializedPublicKey.set(checksum, 78)

  return serializedPublicKey
}

function privateKeyToWIF(
  privateKey: Uint8Array,
  compressed: boolean = true,
  wifPrefix: Uint8Array = getNetworkConfig().wifPrefix,
): string {
  const version = wifPrefix
  const compressedFlag = compressed ? new Uint8Array([0x01]) : new Uint8Array(0)

  // Combine arrays
  const keyWithVersion = new Uint8Array(version.length + privateKey.length + compressedFlag.length)
  keyWithVersion.set(version)
  keyWithVersion.set(privateKey, version.length)
  keyWithVersion.set(compressedFlag, version.length + privateKey.length)

  // Create checksum
  const checksum = createChecksum(keyWithVersion)

  // Combine with checksum
  const wifBuffer = new Uint8Array(keyWithVersion.length + checksum.length)
  wifBuffer.set(keyWithVersion)
  wifBuffer.set(checksum, keyWithVersion.length)

  return encodeBase58(wifBuffer)
}

function toPublicKeyHash(serializedPublicKey: Uint8Array): Uint8Array {
  const hash = hash160(serializedPublicKey.subarray(0, 33))
  return hash
}

/**
 * Converts a BIP-32 path string to an array of integers.
 * @param path - The path string, e.g., "m/84'/0'/0'".
 * @returns An array of integers representing the path.
 */
function convertBip32StrPathToIntPath(path: string): number[] {
  if (!path.startsWith('m/') && !path.startsWith('M/')) {
    throw new Error('Invalid path: must start with m/ or M/')
  }
  const parts = path.slice(2).split('/')
  const intPath: number[] = []
  for (const part of parts) {
    let index: number
    if (part.endsWith("'")) {
      index = parseInt(part.slice(0, -1), 10) + 0x80000000
    } else {
      index = parseInt(part, 10)
    }
    if (isNaN(index)) {
      throw new Error(`Invalid path component: ${part}`)
    }
    intPath.push(index)
  }
  return intPath
}

/**
 * Converts an array of integers to a BIP-32 path string.
 * @param path - An array of integers representing the path.
 * @returns The path string, e.g., "m/84'/0'/0'".
 */
function convertBip32IntPathToStrPath(path: number[]): string {
  const parts: string[] = []
  for (const index of path) {
    if (index >= 0x80000000) {
      parts.push(`${index - 0x80000000}'`)
    } else {
      parts.push(index.toString())
    }
  }
  return 'm/' + parts.join('/')
}

/**
 * Derives a child public key from a parent public key and chain code (CKD_pub).
 * @param publicKey - The parent public key (33 bytes, compressed).
 * @param chainCode - The parent chain code (32 bytes).
 * @param index - The child index.
 * @returns An object containing the child public key and chain code.
 */
function deriveChildPublicKey(
  publicKey: Uint8Array,
  chainCode: Uint8Array,
  index: number,
): { publicKey: Uint8Array; chainCode: Uint8Array } {
  if (!secp256k1.publicKeyVerify(publicKey)) {
    throw new Error('Invalid public key')
  }

  const isHardened = index >= 0x80000000
  if (isHardened) {
    throw new Error('Cannot derive hardened child from public key')
  }

  const indexBuffer = new Uint8Array(4)
  const indexView = new DataView(indexBuffer.buffer)
  indexView.setUint32(0, index, false) // big-endian

  const data = new Uint8Array(publicKey.length + indexBuffer.length)
  data.set(publicKey)
  data.set(indexBuffer, publicKey.length)

  const hmac = hmacSHA512(chainCode, data)
  const tweak = hmac.subarray(0, 32)
  const childChainCode = hmac.subarray(32)

  // Add tweak to public key
  const childPublicKey = secp256k1.publicKeyTweakAdd(publicKey, tweak)

  return { publicKey: childPublicKey, chainCode: childChainCode }
}

/**
 * Deserializes a base58-encoded extended private key.
 * @param base58Key - The base58-encoded key.
 * @returns An object with version, depth, parentFingerprint, childIndex, chainCode, and privateKey.
 */
export function parseExtendedPrivateKey(base58Key: string): {
  version: Uint8Array
  depth: number
  parentFingerprint: number
  childIndex: number
  chainCode: Uint8Array
  privateKey: Uint8Array
} {
  const decoded = decodeBase58(base58Key)
  if (decoded.length !== 82) {
    throw new Error('Invalid key length')
  }

  const view = new DataView(decoded.buffer)
  const version = decoded.subarray(0, 4)
  const depth = decoded[4]
  const parentFingerprint = view.getUint32(5, false)
  const childIndex = view.getUint32(9, false)
  const chainCode = decoded.subarray(13, 45)
  const privateKey = decoded.subarray(46, 78)

  // Verify checksum
  const checksum = decoded.subarray(78, 82)
  const expectedChecksum = createChecksum(decoded.subarray(0, 78))
  if (!expectedChecksum.every((byte, i) => byte === checksum[i])) {
    throw new Error('Invalid checksum')
  }

  return { version, depth, parentFingerprint, childIndex, chainCode, privateKey }
}

/**
 * Deserializes a base58-encoded extended public key.
 * @param base58Key - The base58-encoded key.
 * @returns An object with version, depth, parentFingerprint, childIndex, chainCode, and publicKey.
 */
function deserializePublicKey(base58Key: string): {
  version: Uint8Array
  depth: number
  parentFingerprint: number
  childIndex: number
  chainCode: Uint8Array
  publicKey: Uint8Array
} {
  const decoded = decodeBase58(base58Key)
  if (decoded.length !== 82) {
    throw new Error('Invalid key length')
  }

  const view = new DataView(decoded.buffer)
  const version = decoded.subarray(0, 4)
  const depth = decoded[4]
  const parentFingerprint = view.getUint32(5, false)
  const childIndex = view.getUint32(9, false)
  const chainCode = decoded.subarray(13, 45)
  const publicKey = decoded.subarray(45, 78)

  // Verify checksum
  const checksum = decoded.subarray(78, 82)
  const expectedChecksum = createChecksum(decoded.subarray(0, 78))
  if (!expectedChecksum.every((byte, i) => byte === checksum[i])) {
    throw new Error('Invalid checksum')
  }

  if (!secp256k1.publicKeyVerify(publicKey)) {
    throw new Error('Invalid public key')
  }

  return { version, depth, parentFingerprint, childIndex, chainCode, publicKey }
}

export const KEY_VERSIONS = {
  bip32: {
    mainnet: {
      private: new Uint8Array([0x04, 0x88, 0xad, 0xe4]), // xprv
      public: new Uint8Array([0x04, 0x88, 0xb2, 0x1e]), // xpub
    },
    testnet: {
      private: new Uint8Array([0x04, 0x35, 0x83, 0x94]), // tprv
      public: new Uint8Array([0x04, 0x35, 0x87, 0xcf]), // tpub
    },
    regtest: {
      private: new Uint8Array([0x04, 0x35, 0x83, 0x94]), // tprv
      public: new Uint8Array([0x04, 0x35, 0x87, 0xcf]), // tpub
    },
  },
  bip49: {
    mainnet: {
      private: new Uint8Array([0x04, 0x4a, 0x4e, 0x28]), // yprv
      public: new Uint8Array([0x04, 0x4a, 0x52, 0x62]), // ypub
    },
    testnet: {
      private: new Uint8Array([0x04, 0x4a, 0x2b, 0x2d]), // uprv
      public: new Uint8Array([0x04, 0x4a, 0x2f, 0x67]), // upub
    },
    regtest: {
      private: new Uint8Array([0x04, 0x4a, 0x2b, 0x2d]), // uprv
      public: new Uint8Array([0x04, 0x4a, 0x2f, 0x67]), // upub
    },
  },
  bip84: {
    mainnet: {
      private: new Uint8Array([0x04, 0xb2, 0x43, 0x0c]), // zprv
      public: new Uint8Array([0x04, 0xb2, 0x47, 0x46]), // zpub
    },
    testnet: {
      private: new Uint8Array([0x04, 0x5f, 0x1c, 0xf6]), // vprv
      public: new Uint8Array([0x04, 0x5f, 0x21, 0x30]), // vpub
    },
    regtest: {
      private: new Uint8Array([0x04, 0x5f, 0x1c, 0xf6]), // vprv
      public: new Uint8Array([0x04, 0x5f, 0x21, 0x30]), // vpub
    },
  },
}

export {
  createMasterKey,
  splitMasterKey,
  createHardenedIndex,
  deriveChildKey,
  deriveChildPublicKey,
  createPublicKey,
  getParentFingerprint,
  serializePrivateKey,
  serializePublicKey,
  deserializePublicKey,
  privateKeyToWIF,
  toMnemonic,
  fromMnemonic,
  verifyMasterKey,
  toPublicKeyHash,
  convertBip32StrPathToIntPath,
  convertBip32IntPathToStrPath,
}
