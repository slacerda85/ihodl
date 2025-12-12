import * as Crypto from 'expo-crypto'
import { hmac } from '@noble/hashes/hmac.js'
import { sha512 } from '@noble/hashes/sha2.js'
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js'
import { ripemd160 } from '@noble/hashes/legacy.js'
import { randomUUID as expoRandomUUID } from 'expo-crypto'
import secp256k1 from 'secp256k1'
import { schnorr } from '@noble/secp256k1'
import { pbkdf2 } from '@noble/hashes/pbkdf2.js'
import { gcm } from '@noble/ciphers/aes.js'
import { hexToUint8Array, toBytes, uint8ArrayToHex } from '../utils/utils'

// hash functions
function createEntropy(size: number): Uint8Array {
  return Crypto.getRandomValues(new Uint8Array(size))
}

function randomBytes(size: number): Uint8Array {
  return Crypto.getRandomValues(new Uint8Array(size))
}

function hmacSeed(seed: Uint8Array): Uint8Array {
  const extendedSeed = hmac.create(sha512, toBytes('Bitcoin seed')).update(seed).digest()
  return extendedSeed
}

function arrayToHex(array: Uint8Array): string {
  return Array.from(array)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

function hmacSHA512(chainCode: Uint8Array, data: Uint8Array): Uint8Array {
  // cant use Buffer
  return hmac.create(sha512, chainCode).update(data).digest()
}
function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac.create(nobleSha256, key).update(data).digest()
}
function sha256(key: Uint8Array): Uint8Array {
  return nobleSha256(key)
}

function hash256(key: Uint8Array): Uint8Array {
  return sha256(sha256(key))
}

function hash160(buffer: Uint8Array): Uint8Array {
  return ripemd160.create().update(sha256(buffer)).digest()
}

function createChecksum(key: Uint8Array): Uint8Array {
  const firstSha = sha256(key)
  const secondSha = sha256(firstSha)
  return secondSha.subarray(0, 4)
}

function randomUUID() {
  return expoRandomUUID()
}

// Ensure global crypto.getRandomValues exists for noble libs (React Native lacks it by default)
function ensureGlobalCrypto(): void {
  const globalCrypto = (globalThis as any).crypto
  if (globalCrypto && typeof globalCrypto.getRandomValues === 'function') {
    return
  }

  ;(globalThis as any).crypto = {
    ...(globalCrypto || {}),
    getRandomValues: (array: Uint8Array) => Crypto.getRandomValues(array),
  }
}

function encryptSeed(password: string, seed: string): string {
  try {
    // Generate a random 16-byte salt for key derivation
    const salt = randomBytes(16)

    // Derive a 32-byte key from the password using PBKDF2
    const key = pbkdf2(nobleSha256, password, salt, { c: 100000, dkLen: 32 })

    // Generate a random 12-byte nonce (IV)
    const nonce = randomBytes(12)

    // Create the cipher with AES-256-GCM
    const aes = gcm(key, nonce)

    // Encrypt the seed
    const data = new TextEncoder().encode(seed)
    const fullCiphertext = aes.encrypt(data)

    // Split into encrypted data and auth tag
    const encrypted = fullCiphertext.subarray(0, fullCiphertext.length - 16)
    const authTag = fullCiphertext.subarray(fullCiphertext.length - 16)

    // Combine salt, nonce, encrypted data, and authTag into a single string
    return (
      uint8ArrayToHex(salt) +
      ':' +
      uint8ArrayToHex(nonce) +
      ':' +
      uint8ArrayToHex(encrypted) +
      ':' +
      uint8ArrayToHex(authTag)
    )
  } catch (error) {
    console.error('Error encrypting seed phrase:', error)
    throw new Error('Encryption failed')
  }
}

function decryptSeed(password: string = '', encryptedSeed: string): string {
  try {
    // Split the input string into salt, nonce, encrypted data, and authTag
    const [saltHex, nonceHex, encryptedHex, authTagHex] = encryptedSeed.split(':')
    const salt = hexToUint8Array(saltHex)
    const nonce = hexToUint8Array(nonceHex)
    const encrypted = hexToUint8Array(encryptedHex)
    const authTag = hexToUint8Array(authTagHex)

    // Derive the same 32-byte key from the password and salt
    const key = pbkdf2(nobleSha256, password, salt, { c: 100000, dkLen: 32 })

    // Create the decipher with AES-256-GCM
    const aes = gcm(key, nonce)

    // Combine encrypted data and auth tag
    const fullCiphertext = new Uint8Array(encrypted.length + authTag.length)
    fullCiphertext.set(encrypted)
    fullCiphertext.set(authTag, encrypted.length)

    // Decrypt the data
    const decrypted = aes.decrypt(fullCiphertext)

    return new TextDecoder().decode(decrypted)
  } catch (error) {
    console.error('Error decrypting seed phrase:', error)
    throw new Error('Decryption failed')
  }
}

/**
 * Signs a message using ECDSA with secp256k1
 * @param message - Message to sign (as Uint8Array)
 * @param privateKey - Private key (32 bytes)
 * @returns Signature as Uint8Array (64 bytes, r + s)
 */
function signMessage(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  if (!secp256k1.privateKeyVerify(privateKey)) {
    throw new Error('Invalid private key')
  }

  const { signature } = secp256k1.ecdsaSign(message, privateKey)
  return signature
}

/**
 * Verifies an ECDSA signature with secp256k1
 * @param message - Original message (as Uint8Array)
 * @param signature - Signature (64 bytes, r + s)
 * @param publicKey - Public key (33 or 65 bytes)
 * @returns True if signature is valid
 */
function verifyMessage(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean {
  if (!secp256k1.publicKeyVerify(publicKey)) {
    throw new Error('Invalid public key')
  }

  return secp256k1.ecdsaVerify(signature, message, publicKey)
}

/**
 * Signs a message using ECDSA with secp256k1 (hex string inputs/outputs)
 * @param messageHex - Message to sign (as hex string)
 * @param privateKeyHex - Private key (as hex string)
 * @returns Signature as hex string
 */
function signMessageHex(messageHex: string, privateKeyHex: string): string {
  const message = hexToUint8Array(messageHex)
  const privateKey = hexToUint8Array(privateKeyHex)
  const signature = signMessage(message, privateKey)
  return uint8ArrayToHex(signature)
}

/**
 * Verifies an ECDSA signature with secp256k1 (hex string inputs)
 * @param messageHex - Original message (as hex string)
 * @param signatureHex - Signature (as hex string)
 * @param publicKeyHex - Public key (as hex string)
 * @returns True if signature is valid
 */
function verifyMessageHex(messageHex: string, signatureHex: string, publicKeyHex: string): boolean {
  const message = hexToUint8Array(messageHex)
  const signature = hexToUint8Array(signatureHex)
  const publicKey = hexToUint8Array(publicKeyHex)
  return verifyMessage(message, signature, publicKey)
}

function createHash(algorithm: string) {
  if (algorithm === 'sha256') return nobleSha256
  throw new Error(`Unsupported hash algorithm: ${algorithm}`)
}

/**
 * Tagged hash function for Taproot (BIP-341)
 * @param tag - Tag string
 * @param data - Data to hash
 * @returns Tagged hash as Uint8Array
 */
function taggedHash(tag: string, data: Uint8Array): Uint8Array {
  const tagHash = sha256(new TextEncoder().encode(tag))
  const combined = new Uint8Array(tagHash.length * 2 + data.length)
  combined.set(tagHash)
  combined.set(tagHash, tagHash.length)
  combined.set(data, tagHash.length * 2)
  return sha256(combined)
}

/**
 * Signs a message using Schnorr signature (BIP-340)
 * @param message - Message to sign (32 bytes)
 * @param privateKey - Private key (32 bytes)
 * @returns Schnorr signature (64 bytes)
 */
function schnorrSign(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  if (message.length !== 32) {
    throw new Error('Message must be 32 bytes for Schnorr signing')
  }
  if (privateKey.length !== 32) {
    throw new Error('Private key must be 32 bytes')
  }

  try {
    // Use noble-secp256k1's BIP-340 Schnorr signing
    return schnorr.sign(message, privateKey)
  } catch (error) {
    throw new Error(`Schnorr signing failed: ${error}`)
  }
}

/**
 * Verifies a Schnorr signature (BIP-340)
 * @param message - Original message (32 bytes)
 * @param signature - Schnorr signature (64 bytes)
 * @param publicKey - Public key (32 bytes, x-only)
 * @returns True if signature is valid
 */
function schnorrVerify(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean {
  if (message.length !== 32) {
    throw new Error('Message must be 32 bytes for Schnorr verification')
  }
  if (signature.length !== 64) {
    throw new Error('Schnorr signature must be 64 bytes')
  }
  if (publicKey.length !== 32) {
    throw new Error('Public key must be 32 bytes (x-only) for Schnorr verification')
  }

  try {
    // Use noble-secp256k1's BIP-340 Schnorr verification
    return schnorr.verify(signature, message, publicKey)
  } catch (error) {
    console.error('Schnorr verification failed:', error)
    return false
  }
}

/**
 * Calculates BIP-341 sighash for Taproot transactions
 * @param tx - Transaction data
 * @param inputIndex - Input index being signed
 * @param prevouts - Previous outputs
 * @param sequences - Input sequences
 * @param outputs - Transaction outputs
 * @param spendType - Spend type (0x00 for key spend, 0x01 for script spend)
 * @param scriptPubKey - Script pubkey of the input being spent
 * @param amount - Amount of the input being spent
 * @param codeSeparatorPos - Code separator position (for script spend)
 * @returns Sighash (32 bytes)
 */
function calculateTaprootSighash(
  tx: any,
  inputIndex: number,
  prevouts: Uint8Array[],
  sequences: Uint8Array[],
  outputs: Uint8Array[],
  spendType: number = 0x00,
  scriptPubKey?: Uint8Array,
  amount?: bigint,
  codeSeparatorPos?: number,
): Uint8Array {
  // This is a simplified BIP-341 sighash implementation
  // Full implementation would handle all the different sighash types and edge cases

  const sighashPreimage: Uint8Array[] = []

  // Epoch (0x00)
  sighashPreimage.push(new Uint8Array([0x00]))

  // Control byte (sighash type)
  sighashPreimage.push(new Uint8Array([0x00])) // SIGHASH_ALL for simplicity

  // Transaction data
  const versionBytes = new Uint8Array(4)
  new DataView(versionBytes.buffer).setUint32(0, tx.version, true)
  sighashPreimage.push(versionBytes)

  // Locktime
  const locktimeBytes = new Uint8Array(4)
  new DataView(locktimeBytes.buffer).setUint32(0, tx.locktime, true)
  sighashPreimage.push(locktimeBytes)

  // Hash of previous outputs
  const prevoutsHash = taggedHash('TapSighash/prevouts', flattenArrays(prevouts))
  sighashPreimage.push(prevoutsHash)

  // Hash of sequences
  const sequencesHash = taggedHash('TapSighash/sequences', flattenArrays(sequences))
  sighashPreimage.push(sequencesHash)

  // Hash of outputs
  const outputsHash = taggedHash('TapSighash/outputs', flattenArrays(outputs))
  sighashPreimage.push(outputsHash)

  // Spend type and input data
  sighashPreimage.push(new Uint8Array([spendType]))

  // Input index
  const inputIndexBytes = new Uint8Array(4)
  new DataView(inputIndexBytes.buffer).setUint32(0, inputIndex, true)
  sighashPreimage.push(inputIndexBytes)

  // Additional data based on spend type would go here

  return taggedHash('TapSighash', flattenArrays(sighashPreimage))
}

/**
 * Helper function to flatten arrays of Uint8Arrays
 */
function flattenArrays(arrays: Uint8Array[]): Uint8Array {
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
  createEntropy,
  randomBytes,
  hmacSeed,
  arrayToHex,
  hmacSHA512,
  hmacSha256,
  sha256,
  hash256,
  hash160,
  ripemd160,
  createChecksum,
  uint8ArrayToHex,
  randomUUID,
  encryptSeed,
  decryptSeed,
  signMessage,
  verifyMessage,
  signMessageHex,
  verifyMessageHex,
  createHash,
  // Taproot functions
  taggedHash,
  schnorrSign,
  schnorrVerify,
  calculateTaprootSighash,
  ensureGlobalCrypto,
}

// Initialize polyfill on module load to satisfy noble-secp256k1 entropy requirements
ensureGlobalCrypto()
