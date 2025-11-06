import { hmacSHA512, uint8ArrayToHex, sha256 } from './crypto'
import { ripemd160 } from '@noble/hashes/legacy'
import secp256k1 from 'secp256k1'

export interface ExtendedPrivateKey {
  privateKey: Uint8Array // 32 bytes
  chainCode: Uint8Array // 32 bytes
  index: number
  depth: number
  parentFingerprint: Uint8Array // 4 bytes
}

export interface ExtendedPublicKey {
  publicKey: Uint8Array // 33 bytes (compressed)
  chainCode: Uint8Array // 32 bytes
  index: number
  depth: number
  parentFingerprint: Uint8Array // 4 bytes
}

/**
 * Derive master key from seed
 * @param seed - 64-byte seed from BIP39
 * @returns Extended private key
 */
export function deriveMasterKey(seed: Uint8Array): ExtendedPrivateKey {
  if (seed.length !== 64) {
    throw new Error('Seed must be 64 bytes')
  }

  // HMAC-SHA512 with key "Bitcoin seed"
  const hmac = hmacSHA512(new TextEncoder().encode('Bitcoin seed'), seed)

  const privateKey = hmac.slice(0, 32)
  const chainCode = hmac.slice(32, 64)

  // Validate private key
  if (!secp256k1.privateKeyVerify(privateKey)) {
    throw new Error('Invalid private key derived from seed')
  }

  return {
    privateKey,
    chainCode,
    index: 0,
    depth: 0,
    parentFingerprint: new Uint8Array(4), // Root has no parent
  }
}

/**
 * Derive child private key (hardened or normal)
 * @param parentKey - Parent extended private key
 * @param index - Child index (0x80000000 for hardened)
 * @returns Child extended private key
 */
export function deriveChildPrivateKey(
  parentKey: ExtendedPrivateKey,
  index: number,
): ExtendedPrivateKey {
  const isHardened = index >= 0x80000000
  const indexBytes = new Uint8Array(4)
  new DataView(indexBytes.buffer).setUint32(0, index, false) // big-endian

  let data: Uint8Array

  if (isHardened) {
    // Hardened: data = 0x00 || parent_private_key || index
    data = new Uint8Array(1 + 32 + 4)
    data[0] = 0x00
    data.set(parentKey.privateKey, 1)
    data.set(indexBytes, 1 + 32)
  } else {
    // Normal: data = parent_public_key || index
    const parentPubKey = secp256k1.publicKeyCreate(parentKey.privateKey, true) // compressed
    data = new Uint8Array(33 + 4)
    data.set(parentPubKey, 0)
    data.set(indexBytes, 33)
  }

  const hmac = hmacSHA512(parentKey.chainCode, data)
  const childPrivateKey = hmac.slice(0, 32)
  const childChainCode = hmac.slice(32, 64)

  // Add parent private key to child (modulo order)
  const childPrivKeyInt = bigIntFromUint8Array(childPrivateKey)
  const parentPrivKeyInt = bigIntFromUint8Array(parentKey.privateKey)
  const order = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')
  const finalChildPrivKeyInt = (childPrivKeyInt + parentPrivKeyInt) % order

  const finalChildPrivateKey = uint8ArrayFromBigInt(finalChildPrivKeyInt, 32)

  // Validate final private key
  if (!secp256k1.privateKeyVerify(finalChildPrivateKey)) {
    throw new Error('Invalid child private key')
  }

  // Calculate parent fingerprint
  const parentPubKey = secp256k1.publicKeyCreate(parentKey.privateKey, true)
  const parentFingerprint = hash160(parentPubKey).slice(0, 4)

  return {
    privateKey: finalChildPrivateKey,
    chainCode: childChainCode,
    index,
    depth: parentKey.depth + 1,
    parentFingerprint,
  }
}

/**
 * Derive extended private key from path
 * @param seed - 64-byte seed
 * @param path - Derivation path (array of indices)
 * @returns Extended private key
 */
export function derivePath(seed: Uint8Array, path: number[]): ExtendedPrivateKey {
  let key = deriveMasterKey(seed)

  for (const index of path) {
    key = deriveChildPrivateKey(key, index)
  }

  return key
}

/**
 * Get public key from extended private key
 * @param extPrivKey - Extended private key
 * @returns Extended public key
 */
export function extendedPrivateKeyToPublicKey(extPrivKey: ExtendedPrivateKey): ExtendedPublicKey {
  const publicKey = secp256k1.publicKeyCreate(extPrivKey.privateKey, true) // compressed

  return {
    publicKey,
    chainCode: extPrivKey.chainCode,
    index: extPrivKey.index,
    depth: extPrivKey.depth,
    parentFingerprint: extPrivKey.parentFingerprint,
  }
}

/**
 * Get node ID (compressed public key as hex)
 * @param extPrivKey - Extended private key
 * @returns Node ID
 */
export function getNodeId(extPrivKey: ExtendedPrivateKey): string {
  const pubKey = secp256k1.publicKeyCreate(extPrivKey.privateKey, true)
  return uint8ArrayToHex(pubKey)
}

// Helper functions

function bigIntFromUint8Array(bytes: Uint8Array): bigint {
  let result = 0n
  for (let i = 0; i < bytes.length; i++) {
    result = (result << 8n) + BigInt(bytes[i])
  }
  return result
}

function uint8ArrayFromBigInt(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  for (let i = length - 1; i >= 0; i--) {
    bytes[i] = Number(value & 0xffn)
    value >>= 8n
  }
  return bytes
}

function hash160(data: Uint8Array): Uint8Array {
  const sha = sha256(data)
  return ripemd160.create().update(sha).digest()
}
