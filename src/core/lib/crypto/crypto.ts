import base58 from 'bs58'
import { bech32, bech32m } from 'bech32'
import * as Crypto from 'expo-crypto'
import { hmac } from '@noble/hashes/hmac.js'
import { sha512 } from '@noble/hashes/sha2.js'
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js'
import { ripemd160 } from '@noble/hashes/legacy.js'
import { randomUUID as expoRandomUUID } from 'expo-crypto'
import secp256k1 from 'secp256k1'
import { pbkdf2 } from '@noble/hashes/pbkdf2.js'
import { gcm } from '@noble/ciphers/aes.js'
import { toBytes } from '../utils'

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

// old base58 encoding
function toBase58(buffer: Uint8Array): string {
  return base58.encode(buffer)
}

// old base58 decoding
function fromBase58(base58String: string): Uint8Array {
  return base58.decode(base58String)
}

// Função para codificar em Bech32 ou Bech32m
function encode(data: Uint8Array, prefix: string, version: number): string {
  const dataArray = bech32.toWords(Array.from(data))

  // Escolhe o método de codificação com base na versão
  if (version === 0) {
    return bech32.encode(prefix, dataArray)
  } else {
    return bech32m.encode(prefix, dataArray)
  }
}

// Função para decodificar de Bech32 ou Bech32m
function decode(bech32String: string): { prefix: string; data: Uint8Array; version: number } {
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

function hexToUint8Array(hexString: string): Uint8Array {
  // Remove 0x prefix if present
  hexString = hexString.replace('0x', '')

  // Match every two characters (one byte)
  const matches = hexString.match(/.{1,2}/g)

  if (!matches) {
    throw new Error('Invalid hex string')
  }

  // Convert each pair of characters to a number and create Uint8Array
  return new Uint8Array(matches.map(byte => parseInt(byte, 16)))
}

function uint8ArrayToHex(uint8Array: Uint8Array): string {
  return uint8Array.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '')
}

function randomUUID() {
  return expoRandomUUID()
}

/** Cryptographically secure PRNG. Uses internal OS-level `crypto.getRandomValues`. */
/* export function randomBytes(bytesLength = 32): Uint8Array {
  if (crypto && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint8Array(bytesLength))
  }
  // Legacy Node.js compatibility
  if (crypto && 'randomBytes' in crypto && typeof crypto.randomBytes === 'function') {
    return crypto.randomBytes(bytesLength)
  }
  throw new Error('crypto.getRandomValues must be defined')
} */

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

export {
  createEntropy,
  hmacSeed,
  arrayToHex,
  hmacSHA512,
  hmacSha256,
  sha256,
  hash256,
  hash160,
  createChecksum,
  toBase58,
  fromBase58,
  encode,
  decode,
  hexToUint8Array,
  uint8ArrayToHex,
  randomUUID,
  encryptSeed,
  decryptSeed,
  signMessage,
  verifyMessage,
  signMessageHex,
  verifyMessageHex,
  createHash,
}
