import secp256k1 from 'secp256k1'
import {
  createChecksum,
  hash160,
  hmacSeed,
  hmacSHA512,
  toBase58,
  uint8ArrayToHex,
} from '@/core/lib/crypto'
import { entropyToMnemonic, mnemonicToSeedSync } from './bip/bip39'
import wordList from 'bip39/src/wordlists/english.json'
import { CURVE_ORDER } from '../models/key'

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

function privateKeyToWIF(privateKey: Uint8Array, compressed: boolean = true): string {
  const version = new Uint8Array([0x80]) // Mainnet prefix
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

  return toBase58(wifBuffer)
}

function toPublicKeyHash(serializedPublicKey: Uint8Array): Uint8Array {
  const hash = hash160(serializedPublicKey.subarray(0, 33))
  return hash
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
  createPublicKey,
  getParentFingerprint,
  serializePrivateKey,
  serializePublicKey,
  privateKeyToWIF,
  toMnemonic,
  fromMnemonic,
  verifyMasterKey,
  toPublicKeyHash,
}
