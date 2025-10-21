/**
 * P2P Message Encryption Module
 * Implements Noise Protocol XK pattern for Lightning P2P encryption
 */

import { Buffer } from 'buffer'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { IMessageEncryptor, NoiseHandshakeState, P2PError } from './types'
import { P2P_CONSTANTS } from './constants'

export class MessageEncryptor implements IMessageEncryptor {
  private static readonly NOISE_HKDF_SALT = Buffer.from('lightning', 'utf8')

  /**
   * Generate ephemeral keypair for Noise protocol
   */
  generateNoiseKeys(): { publicKey: Buffer; privateKey: Buffer } {
    // In a real implementation, this would use proper elliptic curve crypto
    // For now, using a simple key generation (this should be replaced with secp256k1)
    const privateKey = randomBytes(32)
    const publicKey = Buffer.from('02', 'hex') // Placeholder - should derive actual public key

    return { publicKey, privateKey }
  }

  /**
   * Perform Noise XK handshake
   * XK pattern: e, es, s, ss
   */
  async performNoiseHandshake(
    localPrivateKey: Buffer,
    remotePublicKey: Buffer,
    initiator: boolean,
  ): Promise<{ encryptionKey: Buffer; decryptionKey: Buffer }> {
    try {
      // Initialize handshake state
      const handshakeState: NoiseHandshakeState = {
        initiator,
        localEphemeralKey: randomBytes(32),
        localStaticKey: localPrivateKey,
        remoteStaticKey: remotePublicKey,
        chainingKey: Buffer.from(P2P_CONSTANTS.NOISE_PROTOCOL_NAME, 'utf8'),
        handshakeHash: Buffer.alloc(32),
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
   * Encrypt a message using ChaCha20-Poly1305
   */
  encryptMessage(message: Buffer, key: Buffer): Buffer {
    try {
      const nonce = randomBytes(12) // 96-bit nonce for ChaCha20
      const cipher = createCipheriv('chacha20-poly1305', key, nonce)

      const encrypted = Buffer.concat([cipher.update(message), cipher.final()])

      const tag = cipher.getAuthTag()

      // Return: nonce + encrypted + tag
      return Buffer.concat([nonce, encrypted, tag])
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
   * Decrypt a message using ChaCha20-Poly1305
   */
  decryptMessage(encryptedData: Buffer, key: Buffer): Buffer {
    try {
      if (encryptedData.length < 12 + 16) {
        // nonce + minimum tag
        throw new Error('Encrypted data too short')
      }

      const nonce = encryptedData.slice(0, 12)
      const tag = encryptedData.slice(-16)
      const encrypted = encryptedData.slice(12, -16)

      const decipher = createDecipheriv('chacha20-poly1305', key, nonce)
      decipher.setAuthTag(tag)

      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])

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
  ): Promise<{ encryptionKey: Buffer; decryptionKey: Buffer }> {
    // Simplified Noise XK implementation
    // In a real implementation, this would follow the full Noise specification

    // MixHash with protocol name
    state.handshakeHash = this.hkdf(
      state.chainingKey,
      Buffer.from(P2P_CONSTANTS.NOISE_PROTOCOL_NAME, 'utf8'),
      Buffer.alloc(32),
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
  private hkdf(chainingKey: Buffer, inputKeyMaterial: Buffer, salt: Buffer): Buffer {
    // Simplified HKDF - in production, use proper HKDF implementation
    const combined = Buffer.concat([chainingKey, inputKeyMaterial, salt])
    return Buffer.from(combined.slice(0, 32)) // Return first 32 bytes
  }

  /**
   * Mix key operation
   */
  private mixKey(chainingKey: Buffer, inputKeyMaterial: Buffer): Buffer {
    return this.hkdf(chainingKey, inputKeyMaterial, Buffer.alloc(32))
  }

  /**
   * Mix hash operation
   */
  private mixHash(handshakeHash: Buffer, data: Buffer): Buffer {
    // Simple hash mixing - should use proper hash function
    return Buffer.from([...handshakeHash, ...data].slice(0, 32))
  }

  /**
   * Diffie-Hellman key exchange (simplified)
   */
  private dh(privateKey: Buffer, publicKey: Buffer): Buffer {
    // Simplified DH - in production, use proper elliptic curve DH
    return Buffer.from([...privateKey, ...publicKey].slice(0, 32))
  }

  /**
   * Derive public key from private key (simplified)
   */
  private derivePublicKey(privateKey: Buffer): Buffer {
    // Simplified key derivation - should use proper elliptic curve operations
    return Buffer.from('02', 'hex') // Placeholder
  }

  /**
   * Split chaining key into encryption and decryption keys
   */
  private splitKeys(chainingKey: Buffer): [Buffer, Buffer] {
    const encryptionKey = chainingKey.slice(0, 32)
    const decryptionKey = chainingKey.slice(0, 32) // In real Noise, these would be different
    return [encryptionKey, decryptionKey]
  }
}
