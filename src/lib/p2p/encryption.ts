/**
 * P2P Message Encryption Module
 * Implements Noise Protocol XK pattern for Lightning P2P encryption
 */

import QuickCrypto from 'react-native-quick-crypto'
import { createEntropy, hexToUint8Array } from '../crypto'
import { IMessageEncryptor, NoiseHandshakeState, P2PError } from './types'
import { P2P_CONSTANTS } from './constants'

// Helper functions for Uint8Array operations
function uint8ArrayFromString(str: string, encoding: 'utf8' | 'hex' = 'utf8'): Uint8Array {
  if (encoding === 'hex') {
    return hexToUint8Array(str)
  }
  // For UTF-8, we'll use TextEncoder if available, otherwise fallback
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str)
  }
  // Fallback for environments without TextEncoder
  const arr = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i++) {
    arr[i] = str.charCodeAt(i)
  }
  return arr
}

function uint8ArrayConcat(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

function uint8ArrayAlloc(size: number): Uint8Array {
  return new Uint8Array(size)
}

export class MessageEncryptor implements IMessageEncryptor {
  private static readonly NOISE_HKDF_SALT = uint8ArrayFromString('lightning', 'utf8')

  /**
   * Generate ephemeral keypair for Noise protocol
   */
  generateNoiseKeys(): { publicKey: Uint8Array; privateKey: Uint8Array } {
    // In a real implementation, this would use proper elliptic curve crypto
    // For now, using a simple key generation (this should be replaced with secp256k1)
    const privateKey = createEntropy(32)
    const publicKey = uint8ArrayFromString('02', 'hex') // Placeholder - should derive actual public key

    return { publicKey, privateKey }
  }

  /**
   * Perform Noise XK handshake
   * XK pattern: e, es, s, ss
   */
  async performNoiseHandshake(
    localPrivateKey: Uint8Array,
    remotePublicKey: Uint8Array,
    initiator: boolean,
  ): Promise<{ encryptionKey: Uint8Array; decryptionKey: Uint8Array }> {
    try {
      // Initialize handshake state
      const handshakeState: NoiseHandshakeState = {
        initiator,
        localEphemeralKey: createEntropy(32),
        localStaticKey: localPrivateKey,
        remoteStaticKey: remotePublicKey,
        chainingKey: uint8ArrayFromString(P2P_CONSTANTS.NOISE_PROTOCOL_NAME, 'utf8'),
        handshakeHash: uint8ArrayAlloc(32),
        phase: 'init',
      }

      // Perform XK handshake pattern
      const keys = await this.executeNoiseHandshake(handshakeState)

      return {
        encryptionKey: keys.encryptionKey,
        decryptionKey: keys.decryptionKey,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw new P2PError(
        `Noise handshake failed: ${errorMessage}`,
        P2P_CONSTANTS.ERROR_HANDSHAKE_FAILED,
        error,
      )
    }
  }

  /**
   * Encrypt a message using AES-256-GCM
   */
  encryptMessage(message: Uint8Array, key: Uint8Array): Uint8Array {
    try {
      const nonce = createEntropy(12) // 96-bit nonce for AES-GCM
      const cipher = QuickCrypto.createCipheriv('aes-256-gcm', key, nonce)

      const encrypted = uint8ArrayConcat([cipher.update(message), cipher.final()])

      const tag = cipher.getAuthTag()

      // Return: nonce + encrypted + tag
      return uint8ArrayConcat([nonce, encrypted, tag])
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw new P2PError(
        `Message encryption failed: ${errorMessage}`,
        P2P_CONSTANTS.ERROR_ENCRYPTION_FAILED,
        error,
      )
    }
  }

  /**
   * Decrypt a message using AES-256-GCM
   */
  decryptMessage(encryptedData: Uint8Array, key: Uint8Array): Uint8Array {
    try {
      if (encryptedData.length < 12 + 16) {
        // nonce + minimum tag
        throw new Error('Encrypted data too short')
      }

      const nonce = encryptedData.slice(0, 12)
      const tag = encryptedData.slice(-16)
      const encrypted = encryptedData.slice(12, -16)

      const decipher = QuickCrypto.createDecipheriv('aes-256-gcm', key, nonce)
      decipher.setAuthTag(tag)

      const decrypted = uint8ArrayConcat([decipher.update(encrypted), decipher.final()])

      return decrypted
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw new P2PError(
        `Message decryption failed: ${errorMessage}`,
        P2P_CONSTANTS.ERROR_ENCRYPTION_FAILED,
        error,
      )
    }
  }

  /**
   * Execute the Noise XK handshake pattern
   */
  private async executeNoiseHandshake(
    state: NoiseHandshakeState,
  ): Promise<{ encryptionKey: Uint8Array; decryptionKey: Uint8Array }> {
    // Simplified Noise XK implementation
    // In a real implementation, this would follow the full Noise specification

    // MixHash with protocol name
    state.handshakeHash = this.hkdf(
      state.chainingKey,
      uint8ArrayFromString(P2P_CONSTANTS.NOISE_PROTOCOL_NAME, 'utf8'),
      uint8ArrayAlloc(32),
    )

    // e: Generate ephemeral key and send public key
    const ephemeralPublicKey = this.derivePublicKey(state.localEphemeralKey)
    state.handshakeHash = this.mixHash(state.handshakeHash, ephemeralPublicKey)

    // es: Mix key with ephemeral keys
    state.chainingKey = this.mixKey(
      state.chainingKey,
      this.dh(state.localEphemeralKey, state.remoteStaticKey!),
    )

    // s: Send static key
    const staticPublicKey = this.derivePublicKey(state.localStaticKey)
    state.handshakeHash = this.mixHash(state.handshakeHash, staticPublicKey)

    // ss: Mix key with static keys
    state.chainingKey = this.mixKey(
      state.chainingKey,
      this.dh(state.localStaticKey, state.remoteStaticKey!),
    )

    // Split keys for encryption/decryption
    const [encryptionKey, decryptionKey] = this.splitKeys(state.chainingKey)

    return { encryptionKey, decryptionKey }
  }

  /**
   * HKDF key derivation
   */
  private hkdf(
    chainingKey: Uint8Array,
    inputKeyMaterial: Uint8Array,
    salt: Uint8Array,
  ): Uint8Array {
    // Simplified HKDF - in production, use proper HKDF implementation
    const combined = uint8ArrayConcat([chainingKey, inputKeyMaterial, salt])
    return combined.slice(0, 32) // Return first 32 bytes
  }

  /**
   * Mix key operation
   */
  private mixKey(chainingKey: Uint8Array, inputKeyMaterial: Uint8Array): Uint8Array {
    return this.hkdf(chainingKey, inputKeyMaterial, uint8ArrayAlloc(32))
  }

  /**
   * Mix hash operation
   */
  private mixHash(handshakeHash: Uint8Array, data: Uint8Array): Uint8Array {
    // Simple hash mixing - should use proper hash function
    return uint8ArrayConcat([handshakeHash, data]).slice(0, 32)
  }

  /**
   * Diffie-Hellman key exchange (simplified)
   */
  private dh(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
    // Simplified DH - in production, use proper elliptic curve DH
    return uint8ArrayConcat([privateKey, publicKey]).slice(0, 32)
  }

  /**
   * Derive public key from private key (simplified)
   */
  private derivePublicKey(privateKey: Uint8Array): Uint8Array {
    // Simplified key derivation - should use proper elliptic curve operations
    return uint8ArrayFromString('02', 'hex') // Placeholder
  }

  /**
   * Split chaining key into encryption and decryption keys
   */
  private splitKeys(chainingKey: Uint8Array): [Uint8Array, Uint8Array] {
    const encryptionKey = chainingKey.slice(0, 32)
    const decryptionKey = chainingKey.slice(0, 32) // In real Noise, these would be different
    return [encryptionKey, decryptionKey]
  }
}
