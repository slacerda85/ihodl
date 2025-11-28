// BOLT #8: Encrypted and Authenticated Transport
// Based on https://github.com/lightning/bolts/blob/master/08-transport.md

import { Sha256, Point } from './base'

// Constants
export const PROTOCOL_NAME = 'Noise_XK_secp256k1_ChaChaPoly_SHA256'
export const PROLOGUE = 'lightning'
export const ACT_ONE_SIZE = 50
export const ACT_TWO_SIZE = 50
export const ACT_THREE_SIZE = 66
export const MAX_MESSAGE_SIZE = 65535
export const KEY_ROTATION_INTERVAL = 1000

// Handshake Version
export type HandshakeVersion = number // 0 for standard, non-zero for deviations

// Key Pair Interface (as returned by generateKey)
export interface KeyPair {
  pub: Point
  priv: Uint8Array
  serializeCompressed(): Point
}

// Handshake State
export interface HandshakeState {
  ck: Sha256 // chaining key
  h: Sha256 // handshake hash
  tempK1?: Sha256
  tempK2?: Sha256
  tempK3?: Sha256
  e?: KeyPair // ephemeral keypair
  s?: KeyPair // static keypair (ls for local, rs for remote)
}

// Act One Message (50 bytes)
export interface ActOneMessage {
  version: HandshakeVersion
  ephemeralPubkey: Point
  tag: Uint8Array // 16 bytes Poly1305 tag
}

// Act Two Message (50 bytes)
export interface ActTwoMessage {
  version: HandshakeVersion
  ephemeralPubkey: Point
  tag: Uint8Array // 16 bytes Poly1305 tag
}

// Act Three Message (66 bytes)
export interface ActThreeMessage {
  version: HandshakeVersion
  encryptedPubkey: Uint8Array // 49 bytes: 33 bytes compressed pubkey + 16 bytes tag
  tag: Uint8Array // 16 bytes Poly1305 tag
}

// Transport Keys (after handshake completion)
export interface TransportKeys {
  sk: Sha256 // sending key
  rk: Sha256 // receiving key
  sn: number // sending nonce
  rn: number // receiving nonce
  sck: Sha256 // sending chaining key
  rck: Sha256 // receiving chaining key
}

// Encrypted Length Prefix (18 bytes)
export interface EncryptedLengthPrefix {
  encryptedLength: Uint8Array // 2 bytes big-endian length + 16 bytes tag
}

// Encrypted Message
export interface EncryptedMessage {
  lengthPrefix: EncryptedLengthPrefix
  ciphertext: Uint8Array // encrypted message + 16 bytes tag
}

// Union type for handshake messages
export type HandshakeMessage = ActOneMessage | ActTwoMessage | ActThreeMessage

// Error types for handshake failures
export enum HandshakeError {
  ACT1_READ_FAILED = 'ACT1_READ_FAILED',
  ACT1_BAD_VERSION = 'ACT1_BAD_VERSION',
  ACT1_BAD_PUBKEY = 'ACT1_BAD_PUBKEY',
  ACT1_BAD_TAG = 'ACT1_BAD_TAG',
  ACT2_READ_FAILED = 'ACT2_READ_FAILED',
  ACT2_BAD_VERSION = 'ACT2_BAD_VERSION',
  ACT2_BAD_PUBKEY = 'ACT2_BAD_PUBKEY',
  ACT2_BAD_TAG = 'ACT2_BAD_TAG',
  ACT3_READ_FAILED = 'ACT3_READ_FAILED',
  ACT3_BAD_VERSION = 'ACT3_BAD_VERSION',
  ACT3_BAD_CIPHERTEXT = 'ACT3_BAD_CIPHERTEXT',
  ACT3_BAD_PUBKEY = 'ACT3_BAD_PUBKEY',
  ACT3_BAD_TAG = 'ACT3_BAD_TAG',
}
