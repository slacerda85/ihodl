// BIP-340: Schnorr Signatures for secp256k1
// Implementation of BIP-340 Schnorr signature scheme used in BOLT 12 offers

import * as secp from '@noble/secp256k1'
import { sha256 } from '../crypto'
import { concatUint8Arrays } from '../utils/utils'

// BIP-340 uses 32-byte public keys (x-only) and 64-byte signatures (r || s)
export type SchnorrPublicKey = Uint8Array // 32 bytes (x-coordinate only)
export type SchnorrSignature = Uint8Array // 64 bytes (r || s)
export type SchnorrPrivateKey = Uint8Array // 32 bytes

/**
 * Creates a tagged hash as defined in BIP-340
 * TaggedHash(tag, msg) = SHA256(SHA256(tag) || SHA256(tag) || msg)
 */
export function taggedHash(tag: string, message: Uint8Array): Uint8Array {
  const tagBytes = new TextEncoder().encode(tag)
  const tagHash = sha256(tagBytes)

  // SHA256(tagHash || tagHash || message)
  return sha256(concatUint8Arrays([tagHash, tagHash, message]))
}

/**
 * Converts a private key to x-only public key (32 bytes)
 * BIP-340: Uses only the x-coordinate of the public key point
 */
export function getSchnorrPublicKey(privateKey: SchnorrPrivateKey): SchnorrPublicKey {
  // Get full 33-byte compressed public key from noble/secp256k1
  const pubKey = secp.getPublicKey(privateKey)

  // Extract x-coordinate (skip first byte which is the prefix 02/03)
  return pubKey.slice(1, 33)
}

/**
 * Signs a message using BIP-340 Schnorr signatures
 * @param message - 32-byte message hash to sign
 * @param privateKey - 32-byte private key
 * @param auxRand - Optional 32-byte auxiliary random data (recommended for security)
 * @returns 64-byte Schnorr signature (r || s)
 */
export async function signSchnorr(
  message: Uint8Array,
  privateKey: SchnorrPrivateKey,
  auxRand?: Uint8Array,
): Promise<SchnorrSignature> {
  if (message.length !== 32) {
    throw new Error('Message must be exactly 32 bytes for Schnorr signing')
  }
  if (privateKey.length !== 32) {
    throw new Error('Private key must be exactly 32 bytes')
  }

  // Use noble/secp256k1's Schnorr implementation
  const signature = await secp.schnorr.sign(message, privateKey, auxRand)

  return signature
}

/**
 * Verifies a BIP-340 Schnorr signature
 * @param message - 32-byte message hash that was signed
 * @param signature - 64-byte Schnorr signature (r || s)
 * @param publicKey - 32-byte x-only public key
 * @returns True if signature is valid
 */
export async function verifySchnorr(
  message: Uint8Array,
  signature: SchnorrSignature,
  publicKey: SchnorrPublicKey,
): Promise<boolean> {
  if (message.length !== 32) {
    throw new Error('Message must be exactly 32 bytes for Schnorr verification')
  }
  if (signature.length !== 64) {
    throw new Error('Signature must be exactly 64 bytes')
  }
  if (publicKey.length !== 32) {
    throw new Error('Public key must be exactly 32 bytes (x-only)')
  }

  try {
    return await secp.schnorr.verify(signature, message, publicKey)
  } catch {
    return false
  }
}

/**
 * Creates a BIP-340 tagged hash for BOLT 12 signatures
 * BOLT #12: Uses format "lightning" || messagename || fieldname
 * @param messageName - Type of BOLT 12 message ('invoice_request' or 'invoice')
 * @param fieldName - Field being signed (typically 'signature')
 * @param merkleRoot - 32-byte Merkle root to sign
 */
export function createBolt12SignatureHash(
  messageName: 'invoice_request' | 'invoice',
  fieldName: string,
  merkleRoot: Uint8Array,
): Uint8Array {
  if (merkleRoot.length !== 32) {
    throw new Error('Merkle root must be exactly 32 bytes')
  }

  // Build tag: "lightning" || messagename || fieldname
  const tag = `lightning${messageName}${fieldName}`

  // Create tagged hash of Merkle root
  return taggedHash(tag, merkleRoot)
}

/**
 * Signs a BOLT 12 message (invoice_request or invoice) using BIP-340
 * @param merkleRoot - 32-byte Merkle root of TLV stream (excluding signature field)
 * @param privateKey - 32-byte private key
 * @param messageName - Type of message being signed
 * @param fieldName - Signature field name (default: 'signature')
 * @param auxRand - Optional auxiliary random data
 * @returns 64-byte BIP-340 Schnorr signature
 */
export async function signBolt12Message(
  merkleRoot: Uint8Array,
  privateKey: SchnorrPrivateKey,
  messageName: 'invoice_request' | 'invoice',
  fieldName = 'signature',
  auxRand?: Uint8Array,
): Promise<SchnorrSignature> {
  // Create tagged hash for BOLT 12
  const messageHash = createBolt12SignatureHash(messageName, fieldName, merkleRoot)

  // Sign using BIP-340 Schnorr
  return signSchnorr(messageHash, privateKey, auxRand)
}

/**
 * Verifies a BOLT 12 signature using BIP-340
 * @param merkleRoot - 32-byte Merkle root of TLV stream (excluding signature field)
 * @param signature - 64-byte BIP-340 Schnorr signature
 * @param publicKey - 32-byte x-only public key
 * @param messageName - Type of message being verified
 * @param fieldName - Signature field name (default: 'signature')
 * @returns True if signature is valid
 */
export async function verifyBolt12Signature(
  merkleRoot: Uint8Array,
  signature: SchnorrSignature,
  publicKey: SchnorrPublicKey,
  messageName: 'invoice_request' | 'invoice',
  fieldName = 'signature',
): Promise<boolean> {
  // Create tagged hash for BOLT 12
  const messageHash = createBolt12SignatureHash(messageName, fieldName, merkleRoot)

  // Verify using BIP-340 Schnorr
  return verifySchnorr(messageHash, signature, publicKey)
}
