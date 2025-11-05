/**
 * Lightning Transport Layer
 * BOLT 8: Transport Layer Security
 */

import { sha256, hmacSha256, createEntropy } from '../crypto'

// Simplified HKDF implementation for testing
async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  // Simplified HKDF - just hash the inputs together
  const combined = new Uint8Array(ikm.length + salt.length + info.length)
  combined.set(ikm, 0)
  combined.set(salt, ikm.length)
  combined.set(info, ikm.length + salt.length)

  const hash = await sha256(combined)
  return hash.slice(0, length)
}

// Simplified AES-GCM implementation for testing
const aes256gcm = {
  async encrypt(key: Uint8Array, plaintext: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
    // Simplified encryption - XOR with key (not secure, just for testing)
    const ciphertext = new Uint8Array(plaintext.length + 16) // +16 for auth tag
    for (let i = 0; i < plaintext.length; i++) {
      ciphertext[i] = plaintext[i] ^ key[i % key.length]
    }
    // Add fake auth tag
    for (let i = 0; i < 16; i++) {
      ciphertext[plaintext.length + i] = 0xff
    }
    return ciphertext
  },

  async decrypt(key: Uint8Array, ciphertext: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
    // Simplified decryption - XOR with key (not secure, just for testing)
    if (ciphertext.length < 16) {
      throw new Error('Invalid ciphertext')
    }
    const plaintext = new Uint8Array(ciphertext.length - 16)
    for (let i = 0; i < plaintext.length; i++) {
      plaintext[i] = ciphertext[i] ^ key[i % key.length]
    }
    return plaintext
  },
}

export enum TransportState {
  DISCONNECTED = 'disconnected',
  KEYS_SET = 'keys_set',
  HANDSHAKE_INITIATED = 'handshake_initiated',
  HANDSHAKE_RESPONDED = 'handshake_responded',
  CONNECTED = 'connected',
  ERROR = 'error',
}

export interface NoiseHandshake {
  state: 'initiator' | 'responder'
  ephemeralKey: Uint8Array
  staticKey: Uint8Array
  remoteEphemeralKey?: Uint8Array
}

export interface EncryptionKeys {
  ck: Uint8Array // Chaining key
  sk: Uint8Array // Sending key
  rk: Uint8Array // Receiving key
  sn: number // Sending nonce
  rn: number // Receiving nonce
}

export class LightningTransport {
  private state: TransportState = TransportState.DISCONNECTED
  private localKey?: Uint8Array
  private remoteKey?: Uint8Array
  private handshake?: NoiseHandshake
  private keys?: EncryptionKeys

  constructor() {}

  getState(): TransportState {
    return this.state
  }

  setLocalKey(key: Uint8Array): void {
    if (key.length !== 32) {
      throw new Error('Invalid private key length')
    }
    this.localKey = key
    this.updateState()
  }

  setRemoteKey(key: Uint8Array): void {
    if (key.length !== 33 || (key[0] !== 0x02 && key[0] !== 0x03)) {
      throw new Error('Invalid public key format')
    }
    this.remoteKey = key
    this.updateState()
  }

  private updateState(): void {
    if (this.localKey && this.remoteKey) {
      this.state = TransportState.KEYS_SET
    }
  }

  async initiateHandshake(socket: any): Promise<NoiseHandshake> {
    if (!this.localKey || !this.remoteKey) {
      throw new Error('Keys not set')
    }

    // Generate ephemeral key
    const ephemeralKey = new Uint8Array(32)
    crypto.getRandomValues(ephemeralKey)

    this.handshake = {
      state: 'initiator',
      ephemeralKey,
      staticKey: this.localKey,
    }

    this.state = TransportState.HANDSHAKE_INITIATED

    // Send Act 1 message (simplified)
    const act1Message = await this.createAct1Message()
    socket.send(act1Message)

    return this.handshake
  }

  async respondToHandshake(socket: any, initiatorMessage: Uint8Array): Promise<NoiseHandshake> {
    if (!this.localKey || !this.remoteKey) {
      throw new Error('Keys not set')
    }

    if (initiatorMessage.length < 50) {
      throw new Error('Invalid handshake message')
    }

    // Generate ephemeral key
    const ephemeralKey = new Uint8Array(32)
    crypto.getRandomValues(ephemeralKey)

    this.handshake = {
      state: 'responder',
      ephemeralKey,
      staticKey: this.localKey,
      remoteEphemeralKey: initiatorMessage.slice(0, 32),
    }

    this.state = TransportState.HANDSHAKE_RESPONDED

    // Send Act 2 message (simplified)
    const act2Message = await this.createAct2Message()
    socket.send(act2Message)

    return this.handshake
  }

  async completeHandshake(responseMessage: Uint8Array): Promise<boolean> {
    if (
      this.state !== TransportState.HANDSHAKE_INITIATED &&
      this.state !== TransportState.HANDSHAKE_RESPONDED
    ) {
      throw new Error('Invalid state for handshake completion')
    }

    // Derive encryption keys using HKDF
    const ck = await hkdf(this.localKey!, this.remoteKey!, new Uint8Array(0), 32)
    const sk = await hkdf(ck, new Uint8Array(0), new TextEncoder().encode('lightning'), 32)
    const rk = await hkdf(sk, new Uint8Array(0), new TextEncoder().encode('lightning'), 32)

    this.keys = {
      ck,
      sk,
      rk,
      sn: 0,
      rn: 0,
    }

    this.state = TransportState.CONNECTED
    return true
  }

  getEncryptionKeys(): EncryptionKeys | null {
    return this.keys || null
  }

  async encryptMessage(plaintext: Uint8Array): Promise<Uint8Array> {
    if (this.state !== TransportState.CONNECTED || !this.keys) {
      throw new Error('Transport not connected')
    }

    if (plaintext.length > 65535) {
      throw new Error('Message too large')
    }

    // Create nonce (4 bytes for Lightning)
    const nonce = new Uint8Array(4)
    const view = new DataView(nonce.buffer)
    view.setUint32(0, this.keys.sn, false)
    this.keys.sn++

    // Encrypt using ChaChaPoly-1305 (simplified in mock)
    const iv = new Uint8Array(12) // ChaChaPoly IV
    const ciphertext = await aes256gcm.encrypt(this.keys.sk, plaintext, iv)

    // Combine nonce + ciphertext
    const message = new Uint8Array(4 + ciphertext.length)
    message.set(nonce, 0)
    message.set(ciphertext, 4)

    return message
  }

  async decryptMessage(ciphertext: Uint8Array): Promise<Uint8Array> {
    if (this.state !== TransportState.CONNECTED || !this.keys) {
      throw new Error('Transport not connected')
    }

    if (ciphertext.length < 4) {
      throw new Error('Message too short')
    }

    // Extract nonce
    const nonce = ciphertext.slice(0, 4)
    const encryptedData = ciphertext.slice(4)

    // Convert nonce to number
    const view = new DataView(nonce.buffer)
    const nonceNum = view.getUint32(0, false)

    // Check for replay (simplified)
    if (nonceNum < this.keys.rn) {
      throw new Error('Replay detected')
    }
    this.keys.rn = nonceNum + 1

    // Decrypt using ChaChaPoly-1305 (simplified in mock)
    const iv = new Uint8Array(12) // ChaChaPoly IV
    const plaintext = await aes256gcm.decrypt(this.keys.sk, encryptedData, iv)

    return plaintext
  }

  reset(): void {
    this.state = TransportState.DISCONNECTED
    this.localKey = undefined
    this.remoteKey = undefined
    this.handshake = undefined
    this.keys = undefined
  }

  private async createAct1Message(): Promise<Uint8Array> {
    // Simplified Act 1 message creation
    const message = new Uint8Array(50)
    if (this.handshake) {
      message.set(this.handshake.ephemeralKey.slice(0, 32), 0)
    }
    return message
  }

  private async createAct2Message(): Promise<Uint8Array> {
    // Simplified Act 2 message creation
    const message = new Uint8Array(50)
    if (this.handshake) {
      message.set(this.handshake.ephemeralKey.slice(0, 32), 0)
    }
    return message
  }
}
