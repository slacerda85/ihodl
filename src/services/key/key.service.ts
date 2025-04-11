import {
  createChecksum,
  hash160,
  hmacSeed,
  hmacSHA512,
  toBase58,
  uint8ArrayToHex,
} from '@/services/crypto'
import { entropyToMnemonic, mnemonicToSeedSync } from '@/shared/lib/bitcoin/bip39'
import wordList from 'bip39/src/wordlists/english.json'
import secp256k1 from 'secp256k1'
import { CoinType, Purpose } from '@/models/account'
import { KEY_VERSIONS } from '@/models/key'

function toMnemonic(entropy: Uint8Array): string {
  // check if nBytes is a valid length of 128, 160, 192, 224, or 256 bits
  if (entropy.length % 4 !== 0 || entropy.length < 16 || entropy.length > 32) {
    throw new Error('Invalid mnemonic length')
  }
  return entropyToMnemonic(uint8ArrayToHex(entropy), wordList)
}

function fromMnemonic(mnemonic: string): Uint8Array {
  const seed = mnemonicToSeedSync(mnemonic)
  return seed
}

function createRootExtendedKey(entropy: Uint8Array): Uint8Array {
  // check if nBytes is a valid length of 128, 160, 192, 224, or 256 bits
  if (entropy.length % 4 !== 0 || entropy.length < 16 || entropy.length > 32) {
    throw new Error('Invalid mnemonic length')
  }
  const extendedKey = hmacSeed(entropy)
  return extendedKey
}

function verifyExtendedKey(extendedKey: Uint8Array): boolean {
  // check if the extended key is valid
  if (extendedKey.length !== 64) {
    throw new Error('Invalid extended key length')
  }

  // check if the private key is valid
  const privateKey = extendedKey.subarray(0, 32)
  if (!secp256k1.privateKeyVerify(privateKey)) {
    throw new Error('Invalid private key')
  }

  // check if the chain code is valid
  const chainCode = extendedKey.subarray(32, 64)
  if (chainCode.length !== 32) {
    throw new Error('Invalid chain code')
  }

  return true
}

function splitRootExtendedKey(extendedKey: Uint8Array<ArrayBufferLike>): {
  privateKey: Uint8Array
  chainCode: Uint8Array
} {
  const privateKey = extendedKey.subarray(0, 32)
  const chainCode = extendedKey.subarray(32, 64)

  // check if the private key is valid
  if (!secp256k1.privateKeyVerify(privateKey)) {
    throw new Error('Invalid private key')
  }

  // check if the chain code is valid
  if (chainCode.length !== 32) {
    throw new Error('Invalid chain code')
  }

  return {
    privateKey,
    chainCode,
  }
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

function deriveChildPrivateKey(extendedKey: Uint8Array, index: number): Uint8Array {
  const isHardened = index >= 0x80000000
  const CURVE_ORDER = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')

  // mount the data to be hashed
  const privateKeyPadding = new Uint8Array(1)
  const paddingView = new DataView(privateKeyPadding.buffer)
  paddingView.setUint8(0, 0)

  const indexBuffer = new Uint8Array(4)
  const indexView = new DataView(indexBuffer.buffer)
  indexView.setUint32(0, index, false) // false for big-endian

  // Create key for HMAC
  const { privateKey, chainCode } = splitRootExtendedKey(extendedKey)
  const key = isHardened
    ? new Uint8Array([...privateKeyPadding, ...privateKey])
    : createPublicKey(privateKey)

  // Combine key and index
  const data = new Uint8Array(key.length + indexBuffer.length)
  data.set(key)
  data.set(indexBuffer, key.length)

  // Generate HMAC
  const hmac = hmacSHA512(chainCode, data) // createHmac("sha512", chainCode).update(data).digest();
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

/* function convertPathToArray(path: string) {
  const pathArray: number[] = []
  const segments = path.split('/')
  // check if first segment is "m" and remove it]
  if (segments[0] === 'm') {
    segments.shift()
  }

  segments.forEach(segment => {
    if (segment.endsWith("'")) {
      pathArray.push(createHardenedIndex(parseInt(segment.slice(0, -1), 10)))
    } else {
      pathArray.push(parseInt(segment, 10))
    }
  })

  return pathArray
} */

/**
 * Derives an account from the extended key.
 * @param extendedKey - The extended key to derive from.
 * @param purpose - The purpose of the account (default is 84).
 * @param coinType - The coin type of the account (default is 0).
 * @param account - The account number (default is 0).
 * @param change - The change number (default is 0).
 * @param addressIndex - The address index (default is 0).
 * @throws Will throw an error if the extended key is invalid.
 * @returns An object containing the derived account information.
 */
function deriveAccount(
  extendedKey: Uint8Array,
  purpose: Purpose = 84,
  coinType: CoinType = 0,
  account: number = 0,
  change: number = 0,
  addressIndex: number = 0,
): {
  extendedKey: Uint8Array
  childIndex: number
  parentFingerprint: number
  depth: number
} {
  // check if the extended key is valid
  if (!verifyExtendedKey(extendedKey)) {
    throw new Error('Invalid extended key')
  }
  // derive purpose
  const purposeIndex = createHardenedIndex(purpose)
  const purposeExtendedKey = deriveChildPrivateKey(extendedKey, purposeIndex)

  // derive coin type
  const coinTypeIndex = createHardenedIndex(coinType)
  const coinTypeExtendedKey = deriveChildPrivateKey(purposeExtendedKey, coinTypeIndex)

  // derive account
  const accountIndex = createHardenedIndex(account)
  const accountExtendedKey = deriveChildPrivateKey(coinTypeExtendedKey, accountIndex)

  // derive change
  const changeIndex = change
  const changeExtendedKey = deriveChildPrivateKey(accountExtendedKey, changeIndex)
  const changePublicKey = createPublicKey(changeExtendedKey.subarray(0, 32))

  // derive address index
  const addressIndexExtendedKey = deriveChildPrivateKey(changeExtendedKey, addressIndex)

  const parentFingerprint = getParentFingerprint(changePublicKey) // fast way to detect parent and child nodes in software

  return {
    extendedKey: addressIndexExtendedKey,
    parentFingerprint,
    childIndex: addressIndex,
    depth: 5, // purpose + coin type + account + change + address index
  }
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
  const { privateKey, chainCode } = splitRootExtendedKey(extendedKey)

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

export {
  toMnemonic,
  fromMnemonic,
  createRootExtendedKey,
  verifyExtendedKey,
  deriveChildPrivateKey,
  createPublicKey,
  deriveAccount,
  serializePrivateKey,
  serializePublicKey,
  privateKeyToWIF,
  toPublicKeyHash,
  createHardenedIndex,
  getParentFingerprint,
  splitRootExtendedKey,
}
