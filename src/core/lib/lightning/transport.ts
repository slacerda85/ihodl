// BOLT #8: Encrypted and Authenticated Transport - Implementation

import { chacha20poly1305 } from '@noble/ciphers/chacha.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import * as secp from '@noble/secp256k1'
import { Sha256, Point } from '@/core/models/lightning/base'
import {
  KeyPair,
  HandshakeState,
  TransportKeys,
  HandshakeError,
  PROTOCOL_NAME,
  PROLOGUE,
  ACT_ONE_SIZE,
  ACT_TWO_SIZE,
  ACT_THREE_SIZE,
  MAX_MESSAGE_SIZE,
  KEY_ROTATION_INTERVAL,
} from '@/core/models/lightning/transport'
import { encodeU16 } from './base'

// Utility functions for crypto operations

/**
 * Generates a new secp256k1 keypair
 */
export function generateKey(): KeyPair {
  const priv = secp.utils.randomSecretKey()
  const pub = secp.getPublicKey(priv, true) // compressed
  return {
    priv,
    pub,
    serializeCompressed(): Point {
      return pub
    },
  }
}

/**
 * Performs ECDH and returns SHA256 of the compressed point
 */
export function ecdh(priv: Uint8Array, pub: Point): Sha256 {
  const shared = secp.getSharedSecret(priv, pub, true)
  const x = shared.slice(1, 33)
  return sha256(x)
}

/**
 * HKDF as per RFC 5869, with zero-length info, returning 64 bytes split into two 32-byte keys
 */
export function hkdfExtract(salt: Sha256, ikm: Sha256): [Sha256, Sha256] {
  const result = hkdf(sha256, ikm, salt, new Uint8Array(0), 64) // 64 bytes
  return [result.subarray(0, 32), result.subarray(32, 64)]
}

/**
 * Encrypts with ChaCha20-Poly1305 (IETF variant)
 * Nonce is 32 zero bits + 64-bit little-endian value
 */
export function encryptWithAD(
  key: Sha256,
  nonce: number,
  ad: Sha256,
  plaintext: Uint8Array,
): Uint8Array {
  const nonceBuf = new Uint8Array(12)
  const view = new DataView(nonceBuf.buffer)
  // 32 zero bits followed by little-endian 64-bit nonce
  view.setBigUint64(4, BigInt(nonce), true)
  const cipher = chacha20poly1305(key, nonceBuf, ad)
  return cipher.encrypt(plaintext)
}

/**
 * Decrypts with ChaCha20-Poly1305 (IETF variant)
 */
export function decryptWithAD(
  key: Sha256,
  nonce: number,
  ad: Sha256,
  ciphertext: Uint8Array,
): Uint8Array {
  const nonceBuf = new Uint8Array(12)
  const view = new DataView(nonceBuf.buffer)
  // 32 zero bits followed by little-endian 64-bit nonce
  view.setBigUint64(4, BigInt(nonce), true)
  const cipher = chacha20poly1305(key, nonceBuf, ad)
  return cipher.decrypt(ciphertext)
}

// Handshake state initialization

/**
 * Initializes handshake state for both initiator and responder
 */
export function initializeHandshakeState(rs?: Point, ls?: KeyPair): HandshakeState {
  const protocolHash = sha256(new TextEncoder().encode(PROTOCOL_NAME))
  const protocolPrologue = new Uint8Array([...protocolHash, ...new TextEncoder().encode(PROLOGUE)])
  const h = sha256(protocolPrologue)
  const ck = sha256(h)
  return {
    ck,
    h,
  }
}

// Handshake Act One

/**
 * Act One: Initiator sends to responder
 */
export function actOneSend(
  state: HandshakeState,
  rs: Point,
  e?: KeyPair,
): { message: Uint8Array; newState: HandshakeState } {
  const eKey = e || generateKey()
  const h = sha256(new Uint8Array([...state.h, ...eKey.serializeCompressed()]))
  const es = ecdh(eKey.priv, rs)
  const [ck, tempK1] = hkdfExtract(state.ck, es)
  const c = encryptWithAD(tempK1, 0, h, new Uint8Array(0))
  const h2 = sha256(new Uint8Array([...h, ...c]))
  const message = new Uint8Array(50)
  message[0] = 0 // version
  message.set(eKey.serializeCompressed(), 1)
  message.set(c, 34)
  return {
    message,
    newState: {
      ...state,
      ck,
      h: h2,
      e: eKey,
      tempK1,
    },
  }
}

/**
 * Act One: Responder receives from initiator
 */
export function actOneReceive(
  state: HandshakeState,
  message: Uint8Array,
  ls: KeyPair,
): { newState: HandshakeState } | { error: HandshakeError } {
  if (message.length !== ACT_ONE_SIZE) {
    return { error: HandshakeError.ACT1_READ_FAILED }
  }
  const version = message[0]
  if (version !== 0) {
    return { error: HandshakeError.ACT1_BAD_VERSION }
  }
  const re = message.subarray(1, 34)
  if (re.length !== 33 || (re[0] !== 0x02 && re[0] !== 0x03)) {
    return { error: HandshakeError.ACT1_BAD_PUBKEY }
  }
  const c = message.subarray(34, 50)
  const h = sha256(new Uint8Array([...state.h, ...re]))
  const es = ecdh(ls.priv, re)
  const [ck, tempK1] = hkdfExtract(state.ck, es)
  try {
    decryptWithAD(tempK1, 0, h, c)
  } catch {
    return { error: HandshakeError.ACT1_BAD_TAG }
  }
  const h2 = sha256(new Uint8Array([...h, ...c]))
  return {
    newState: {
      ...state,
      ck,
      h: h2,
      tempK1,
    },
  }
}

// Handshake Act Two

/**
 * Act Two: Responder sends to initiator
 */
export function actTwoSend(
  state: HandshakeState,
  re: Point,
  e?: KeyPair,
): { message: Uint8Array; newState: HandshakeState } {
  const eKey = e || generateKey()
  const h = sha256(new Uint8Array([...state.h, ...eKey.serializeCompressed()]))
  const ee = ecdh(eKey.priv, re)
  const [ck, tempK2] = hkdfExtract(state.ck, ee)
  const c = encryptWithAD(tempK2, 0, h, new Uint8Array(0))
  const h2 = sha256(new Uint8Array([...h, ...c]))
  const message = new Uint8Array(50)
  message[0] = 0 // version
  message.set(eKey.serializeCompressed(), 1)
  message.set(c, 34)
  return {
    message,
    newState: {
      ...state,
      ck,
      h: h2,
      e: eKey,
      tempK2,
    },
  }
}

/**
 * Act Two: Initiator receives from responder
 */
export function actTwoReceive(
  state: HandshakeState,
  message: Uint8Array,
  e: KeyPair,
): { newState: HandshakeState } | { error: HandshakeError } {
  if (message.length !== ACT_TWO_SIZE) {
    return { error: HandshakeError.ACT2_READ_FAILED }
  }
  const version = message[0]
  if (version !== 0) {
    return { error: HandshakeError.ACT2_BAD_VERSION }
  }
  const re = message.subarray(1, 34)
  if (re.length !== 33 || (re[0] !== 0x02 && re[0] !== 0x03)) {
    return { error: HandshakeError.ACT2_BAD_PUBKEY }
  }
  const c = message.subarray(34, 50)
  const h = sha256(new Uint8Array([...state.h, ...re]))
  const ee = ecdh(e.priv, re)
  const [ck, tempK2] = hkdfExtract(state.ck, ee)
  try {
    decryptWithAD(tempK2, 0, h, c)
  } catch {
    return { error: HandshakeError.ACT2_BAD_TAG }
  }
  const h2 = sha256(new Uint8Array([...h, ...c]))
  return {
    newState: {
      ...state,
      ck,
      h: h2,
      tempK2,
    },
  }
}

// Handshake Act Three

/**
 * Act Three: Initiator sends to responder
 */
export function actThreeSend(
  state: HandshakeState,
  s: KeyPair,
  re: Point,
): { message: Uint8Array; keys: TransportKeys } {
  const c = encryptWithAD(state.tempK2!, 1, state.h, s.serializeCompressed())
  const h = sha256(new Uint8Array([...state.h, ...c]))
  const se = ecdh(s.priv, re)
  const [ck, tempK3] = hkdfExtract(state.ck, se)
  const t = encryptWithAD(tempK3, 0, h, new Uint8Array(0))
  const [rk, sk] = hkdfExtract(ck, new Uint8Array(32)) // zero ikm
  const message = new Uint8Array(66)
  message[0] = 0 // version
  message.set(c, 1)
  message.set(t, 50)
  return {
    message,
    keys: {
      sk,
      rk,
      sn: 0,
      rn: 0,
      sck: ck,
      rck: ck,
    },
  }
}

/**
 * Act Three: Responder receives from initiator
 */
export function actThreeReceive(
  state: HandshakeState,
  message: Uint8Array,
  e: KeyPair,
  rs: Point,
): { keys: TransportKeys } | { error: HandshakeError } {
  if (message.length !== ACT_THREE_SIZE) {
    return { error: HandshakeError.ACT3_READ_FAILED }
  }
  const version = message[0]
  if (version !== 0) {
    return { error: HandshakeError.ACT3_BAD_VERSION }
  }
  const c = message.subarray(1, 50)
  const t = message.subarray(50, 66)
  const rsDecrypted = decryptWithAD(state.tempK2!, 1, state.h, c)
  if (rsDecrypted.length !== 33 || (rsDecrypted[0] !== 0x02 && rsDecrypted[0] !== 0x03)) {
    return { error: HandshakeError.ACT3_BAD_PUBKEY }
  }
  const h = sha256(new Uint8Array([...state.h, ...c]))
  const se = ecdh(e.priv, rsDecrypted)
  const [ck, tempK3] = hkdfExtract(state.ck, se)
  try {
    decryptWithAD(tempK3, 0, h, t)
  } catch {
    return { error: HandshakeError.ACT3_BAD_TAG }
  }
  const [sk, rk] = hkdfExtract(ck, new Uint8Array(32)) // zero ikm
  return {
    keys: {
      sk,
      rk,
      sn: 0,
      rn: 0,
      sck: ck,
      rck: ck,
    },
  }
}

// Message encryption and decryption

/**
 * Encrypts and sends a Lightning message
 *
 * BOLT #8 Key Rotation:
 * - A key is to be rotated after a party encrypts or decrypts 1000 times with it.
 * - The rotation uses HKDF with the current chaining key and the current encryption key.
 * - For sending: uses sk (sending key) and sck (sending chaining key)
 */
export function encryptMessage(
  keys: TransportKeys,
  message: Uint8Array,
): { encrypted: Uint8Array; newKeys: TransportKeys } {
  if (message.length > MAX_MESSAGE_SIZE) {
    throw new Error('Message too large')
  }

  // Encrypt length prefix using sending key (sk)
  const lengthBuf = encodeU16(message.length)
  const lc = encryptWithAD(keys.sk, keys.sn, new Uint8Array(0), lengthBuf)
  keys.sn++

  // Encrypt message body using sending key (sk)
  const c = encryptWithAD(keys.sk, keys.sn, new Uint8Array(0), message)
  keys.sn++

  // Concatenate encrypted length and message
  const encrypted = new Uint8Array(lc.length + c.length)
  encrypted.set(lc)
  encrypted.set(c, lc.length)

  // Key rotation for sending key (BOLT #8)
  // After 1000 messages, rotate the key using HKDF
  if (keys.sn >= KEY_ROTATION_INTERVAL) {
    const [ck, k] = hkdfExtract(keys.sck, keys.sk)
    keys.sk = k
    keys.sck = ck
    keys.sn = 0
  }

  return { encrypted, newKeys: keys }
}

/**
 * Receives and decrypts a Lightning message
 */
/**
 * Receives and decrypts a Lightning message
 *
 * BOLT #8 Key Rotation:
 * - A key is to be rotated after a party encrypts or decrypts 1000 times with it.
 * - The rotation uses HKDF with the current chaining key and the current encryption key.
 * - For receiving: uses rk (receiving key) and rck (receiving chaining key)
 * - For sending: uses sk (sending key) and sck (sending chaining key)
 */
export function decryptMessage(
  keys: TransportKeys,
  encrypted: Uint8Array,
): { message: Uint8Array; newKeys: TransportKeys } | { error: string } {
  if (encrypted.length < 18) {
    return { error: 'Encrypted message too short' }
  }

  // Decrypt length prefix using receiving key (rk)
  const lc = encrypted.subarray(0, 18)
  const lengthBuf = decryptWithAD(keys.rk, keys.rn, new Uint8Array(0), lc)
  keys.rn++

  const length = new DataView(lengthBuf.buffer).getUint16(0, false) // big-endian
  if (encrypted.length < 18 + length + 16) {
    return { error: 'Encrypted message incomplete' }
  }

  // Decrypt message body using receiving key (rk)
  const c = encrypted.subarray(18, 18 + length + 16)
  const message = decryptWithAD(keys.rk, keys.rn, new Uint8Array(0), c)
  keys.rn++

  // Key rotation for receiving key (BOLT #8)
  // After 1000 messages, rotate the key using HKDF
  if (keys.rn >= KEY_ROTATION_INTERVAL) {
    const [ck, k] = hkdfExtract(keys.rck, keys.rk)
    keys.rk = k
    keys.rck = ck
    keys.rn = 0
  }

  return { message, newKeys: keys }
}
