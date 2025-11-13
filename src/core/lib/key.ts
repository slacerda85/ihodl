import secp256k1 from 'secp256k1'
import { hash160, hmacSHA512 } from '@/core/lib/crypto'

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

export {
  splitRootExtendedKey,
  createHardenedIndex,
  deriveChildPrivateKey,
  createPublicKey,
  getParentFingerprint,
}
