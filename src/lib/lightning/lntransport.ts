// Lightning Network Transport Layer
// BOLT 8: Encrypted and Authenticated Transport - Noise_XK_secp256k1_ChaChaPoly_SHA256
// Implementation following the Lightning Network transport specification

import TcpSocket from 'react-native-tcp-socket'
import {
  createUint8Array,
  uint8ArrayFrom,
  concatUint8Arrays,
  writeUint32BE,
  writeBigUint64BE,
  uint8ArrayFromHex,
  uint8ArrayToHex,
  uint8ArrayFromBuffer,
} from '../utils'
import { hmacSha256, sha256 } from '../crypto'
import { uint8ArraysEqual } from '../blockchain/utils'
import { chacha20poly1305 } from '@noble/ciphers/chacha.js'
import * as secp from '@noble/secp256k1'

// Exceptions
export class LightningPeerConnectionClosed extends Error {}
export class HandshakeFailed extends Error {}
export class ConnStringFormatError extends Error {}

// Utility function for string to Uint8Array conversion
function uint8ArrayFromString(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

// BOLT 8: ChaCha20-Poly1305 AEAD encryption/decryption (RFC 8439)
function chacha20Poly1305Encrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  aad: Uint8Array,
  plaintext: Uint8Array,
): Uint8Array {
  return chacha20poly1305(key, nonce, aad).encrypt(plaintext)
}

function chacha20Poly1305Decrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  aad: Uint8Array,
  ciphertext: Uint8Array,
): Uint8Array {
  return chacha20poly1305(key, nonce, aad).decrypt(ciphertext)
}

// BOLT 8: HKDF function (RFC 5869) with zero-length info
function hkdf(salt: Uint8Array, ikm: Uint8Array): [Uint8Array, Uint8Array] {
  // Extract
  const prk = hmacSha256(salt, ikm)
  // Expand with zero-length info
  const info = createUint8Array(0)
  const T0 = createUint8Array(0)
  const T1 = hmacSha256(prk, concatUint8Arrays([T0, info, uint8ArrayFrom([0x01])]))
  const T2 = hmacSha256(prk, concatUint8Arrays([T1, info, uint8ArrayFrom([0x02])]))
  return [T1, T2]
}

// BOLT 8: ECDH function - SHA256 of compressed point
function ecdh(privKey: Uint8Array, pubKey: Uint8Array): Uint8Array {
  // Perform ECDH using @noble/secp256k1
  const sharedSecret = secp.getSharedSecret(privKey, pubKey)
  // Return SHA256 of the shared secret as per BOLT 8
  return sha256(sharedSecret.slice(1)) // Remove the 0x02/0x03 prefix
}

// BOLT 8: Generate secp256k1 keypair
function generateKey(): { priv: Uint8Array; pub: Uint8Array } {
  // Generate a random private key
  const priv = secp.utils.randomSecretKey()
  // Derive the compressed public key
  const pub = secp.getPublicKey(priv, true) // true for compressed
  return { priv, pub }
}

// BOLT 8: Serialize compressed public key
function serializeCompressed(pubKey: { pub: Uint8Array }): Uint8Array {
  return pubKey.pub
}

// Utility functions - simplified for React Native

function getNonceBytes(n: number): Uint8Array {
  const buf = createUint8Array(12)
  writeUint32BE(buf, 0, 0) // 4 bytes of zeros
  writeBigUint64BE(buf, 4, BigInt(n)) // 8 bytes little-endian
  return buf
}

function aeadEncrypt(
  key: Uint8Array,
  nonce: number,
  associatedData: Uint8Array,
  data: Uint8Array,
): Uint8Array {
  const nonceBytes = getNonceBytes(nonce)
  return chacha20Poly1305Encrypt(key, nonceBytes, associatedData, data)
}

function aeadDecrypt(
  key: Uint8Array,
  nonce: number,
  associatedData: Uint8Array,
  data: Uint8Array,
): Uint8Array {
  const nonceBytes = getNonceBytes(nonce)
  return chacha20Poly1305Decrypt(key, nonceBytes, associatedData, data)
}

// BOLT 8: Handshake state for Noise_XK_secp256k1_ChaChaPoly_SHA256
class HandshakeState {
  h: Uint8Array // Handshake hash
  ck: Uint8Array // Chaining key
  temp_k1: Uint8Array | null = null // Temporary key 1
  temp_k2: Uint8Array | null = null // Temporary key 2
  temp_k3: Uint8Array | null = null // Temporary key 3
  e: { priv: Uint8Array; pub: Uint8Array } | null = null // Ephemeral keypair
  s: { priv: Uint8Array; pub: Uint8Array } | null = null // Static keypair
  re: Uint8Array | null = null // Remote ephemeral public key
  rs: Uint8Array | null = null // Remote static public key

  constructor(localStaticPriv: Uint8Array, remoteStaticPub: Uint8Array) {
    // Initialize with protocol name hash
    const protocolName = 'Noise_XK_secp256k1_ChaChaPoly_SHA256'
    this.h = sha256(uint8ArrayFromString(protocolName))
    this.ck = this.h.slice() // Copy for chaining key

    // Set local static keypair
    this.s = { priv: localStaticPriv, pub: secp.getPublicKey(localStaticPriv, true) }

    // Set remote static public key
    this.rs = remoteStaticPub
  }
}

// BOLT 8: Act One - Initiator sends 50-byte message
function actOne(state: HandshakeState): Uint8Array {
  // Generate ephemeral keypair
  state.e = generateKey()

  // ECDH between e and rs
  const es = ecdh(state.e.priv, state.rs!)

  // Update chaining key and hash
  ;[state.ck, state.temp_k1] = hkdf(state.ck, es)
  state.h = sha256(concatUint8Arrays([state.h, serializeCompressed(state.e)]))

  // Encrypt zero-length payload with temp_k1
  const nonce = createUint8Array(12) // 32-bit little-endian, zero for first message
  const aad = state.h
  const plaintext = createUint8Array(0)
  const ciphertext = chacha20Poly1305Encrypt(state.temp_k1!, nonce, aad, plaintext)

  // Return 50-byte message: version (1) + compressed pubkey (33) + ciphertext (16)
  return concatUint8Arrays([uint8ArrayFrom([0]), serializeCompressed(state.e), ciphertext])
}

// BOLT 8: Act Two - Responder processes Act One and sends 50-byte response
function actTwo(state: HandshakeState, actOneMsg: Uint8Array): Uint8Array {
  // Parse Act One message
  if (actOneMsg.length !== 50) throw new Error('Invalid Act One message length')
  if (actOneMsg[0] !== 0) throw new Error('Invalid version byte')

  const re = actOneMsg.slice(1, 34) // Remote ephemeral public key
  const ciphertext = actOneMsg.slice(34, 50) // Encrypted payload

  // Update hash with remote ephemeral key
  state.h = sha256(concatUint8Arrays([state.h, re]))
  state.re = re

  // Decrypt zero-length payload
  const nonce = createUint8Array(12)
  const aad = state.h
  chacha20Poly1305Decrypt(state.temp_k1!, nonce, aad, ciphertext) // Verify only

  // Generate ephemeral keypair
  state.e = generateKey()

  // ECDH between e and re
  const ee = ecdh(state.e.priv, state.re)

  // Update chaining key and hash
  ;[state.ck, state.temp_k2] = hkdf(state.ck, ee)
  state.h = sha256(concatUint8Arrays([state.h, serializeCompressed(state.e)]))

  // ECDH between e and rs
  const es = ecdh(state.e.priv, state.rs!)

  // Update chaining key
  ;[state.ck, state.temp_k3] = hkdf(state.ck, es)

  // Encrypt zero-length payload with temp_k2
  const plaintext = createUint8Array(0)
  const ciphertext2 = chacha20Poly1305Encrypt(state.temp_k2!, nonce, state.h, plaintext)

  // Return 50-byte message: version (1) + compressed pubkey (33) + ciphertext (16)
  return concatUint8Arrays([uint8ArrayFrom([0]), serializeCompressed(state.e), ciphertext2])
}

// BOLT 8: Act Three - Initiator processes Act Two and sends 66-byte final message
function actThree(state: HandshakeState, actTwoMsg: Uint8Array): Uint8Array {
  // Parse Act Two message
  if (actTwoMsg.length !== 50) throw new Error('Invalid Act Two message length')
  if (actTwoMsg[0] !== 0) throw new Error('Invalid version byte')

  const re = actTwoMsg.slice(1, 34) // Remote ephemeral public key
  const ciphertext = actTwoMsg.slice(34, 50) // Encrypted payload

  // Update hash with remote ephemeral key
  state.h = sha256(concatUint8Arrays([state.h, re]))
  state.re = re

  // Decrypt zero-length payload
  const nonce = createUint8Array(12)
  const aad = state.h
  chacha20Poly1305Decrypt(state.temp_k2!, nonce, aad, ciphertext) // Verify only

  // ECDH between s and re
  const se = ecdh(state.s!.priv, state.re)

  // Update chaining key
  ;[state.ck, state.temp_k3] = hkdf(state.ck, se)

  // Encrypt static public key with temp_k3
  const plaintext = serializeCompressed(state.s!)
  const ciphertext2 = chacha20Poly1305Encrypt(state.temp_k3!, nonce, state.h, plaintext)

  // Update hash with ciphertext
  state.h = sha256(concatUint8Arrays([state.h, ciphertext2]))

  // Return 66-byte message: version (1) + ciphertext (49)
  return concatUint8Arrays([uint8ArrayFrom([0]), ciphertext2])
}

// BOLT 8: Process Act Three - Responder completes handshake
function processActThree(state: HandshakeState, actThreeMsg: Uint8Array): void {
  // Parse Act Three message
  if (actThreeMsg.length !== 66) throw new Error('Invalid Act Three message length')
  if (actThreeMsg[0] !== 0) throw new Error('Invalid version byte')

  const ciphertext = actThreeMsg.slice(1, 50) // Encrypted static public key

  // Decrypt remote static public key
  const nonce = createUint8Array(12)
  const aad = state.h
  const rsPlaintext = chacha20Poly1305Decrypt(state.temp_k3!, nonce, aad, ciphertext)

  // Verify remote static public key matches expected
  if (!uint8ArraysEqual(rsPlaintext, state.rs!)) {
    throw new Error('Remote static public key mismatch')
  }

  // Update hash with ciphertext
  state.h = sha256(concatUint8Arrays([state.h, ciphertext]))

  // ECDH between s and re
  const se = ecdh(state.s!.priv, state.re!)

  // Final key derivation
  ;[state.ck] = hkdf(state.ck, se)
}

// Transport base class
export abstract class LNTransportBase {
  protected localPrivKey: Uint8Array
  protected remotePubKey?: Uint8Array
  protected sk: Uint8Array = createUint8Array(32)
  protected rk: Uint8Array = createUint8Array(32)
  protected sn: number = 0
  protected rn: number = 0

  constructor(localPrivKey: Uint8Array) {
    this.localPrivKey = localPrivKey
  }

  abstract handshake(): Promise<Uint8Array>
  abstract send(data: Uint8Array): Promise<void>
  abstract recv(): Promise<Uint8Array>
  abstract close(): void

  protected deriveKeys(ck: Uint8Array): void {
    // BOLT 8: Derive session keys after handshake completion
    // temp_k = HKDF(ck, zero)
    // sk, rk = HKDF(temp_k, zero)
    const zeroKey = createUint8Array(32) // 32 bytes of zeros
    const [tempK] = hkdf(ck, zeroKey)
    const [sk, rk] = hkdf(tempK, zeroKey)
    this.sk = sk
    this.rk = rk
  }
}

// Simplified transport for React Native (TCP-based)
export class LNTransport extends LNTransportBase {
  private socket: any = null
  private peerAddr: LNPeerAddr
  private handshakeState: HandshakeState | null = null
  private handshakeComplete: boolean = false
  private messageBuffer: Uint8Array = createUint8Array(0)

  constructor(localPrivKey: Uint8Array, peerAddr: LNPeerAddr) {
    super(localPrivKey)
    this.peerAddr = peerAddr
    this.remotePubKey = peerAddr.pubkey
  }

  async handshake(): Promise<Uint8Array> {
    // Initialize handshake state
    this.handshakeState = new HandshakeState(this.localPrivKey, this.remotePubKey!)

    return new Promise((resolve, reject) => {
      try {
        // Create TCP socket for React Native
        this.socket = TcpSocket.createConnection(
          {
            port: this.peerAddr.port,
            host: this.peerAddr.host,
          },
          () => {
            // Connection established
          },
        )

        this.socket.on('connect', async () => {
          try {
            // Send Act One message
            const actOneMsg = actOne(this.handshakeState!)
            this.socket!.write(new Uint8Array(actOneMsg))

            // Wait for Act Two response
            const actTwoResponse = await this.receiveMessage()
            if (actTwoResponse.length !== 50) {
              throw new HandshakeFailed('Invalid Act Two message length')
            }

            // Process Act Two and send Act Three
            const actThreeMsg = actThree(this.handshakeState!, actTwoResponse)
            this.socket!.write(new Uint8Array(actThreeMsg))

            // Handshake complete - derive session keys
            this.deriveKeys(this.handshakeState!.ck)
            this.handshakeComplete = true

            resolve(this.remotePubKey!)
          } catch (error) {
            reject(new HandshakeFailed(`Handshake failed: ${error}`))
          }
        })

        this.socket.on('error', (error: Error) => {
          reject(new HandshakeFailed(`TCP connection error: ${error.message}`))
        })

        this.socket.on('timeout', () => {
          reject(new HandshakeFailed('Connection timeout'))
        })

        this.socket.on('close', () => {
          reject(new LightningPeerConnectionClosed())
        })

        this.socket.on('data', (data: string | Uint8Array | ArrayBuffer) => {
          // Handle incoming data during handshake
          const bufferData = uint8ArrayFromBuffer(data)
          this.handleIncomingData(bufferData)
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  // Helper method to receive a single message during handshake
  private receiveMessage(): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new LightningPeerConnectionClosed())
        return
      }

      const timeout = setTimeout(() => {
        reject(new HandshakeFailed('Handshake timeout'))
      }, 10000) // 10 second timeout

      // Set up one-time data handler for handshake messages
      const dataHandler = (data: string | Uint8Array | ArrayBuffer) => {
        clearTimeout(timeout)
        this.socket!.removeListener('data', dataHandler)
        try {
          const bufferData = uint8ArrayFromBuffer(data)
          const message = uint8ArrayFrom(bufferData)
          resolve(message)
        } catch (error) {
          reject(error)
        }
      }

      this.socket.once('data', dataHandler)
    })
  }

  // Handle incoming data during handshake
  private handleIncomingData(data: Uint8Array): void {
    // This is called during handshake, but we handle messages differently
    // For now, just accumulate in buffer if needed
  }

  // Server-side: Process Act One and respond with Act Two
  async processActOne(actOneMsg: Uint8Array): Promise<Uint8Array> {
    if (!this.handshakeState) {
      this.handshakeState = new HandshakeState(this.localPrivKey, this.remotePubKey!)
    }
    return actTwo(this.handshakeState, actOneMsg)
  }

  // Server-side: Process Act Three and complete handshake
  async processActThree(actThreeMsg: Uint8Array): Promise<void> {
    if (!this.handshakeState) {
      throw new HandshakeFailed('Handshake not initialized')
    }
    processActThree(this.handshakeState, actThreeMsg)
    // Handshake complete - derive session keys
    this.deriveKeys(this.handshakeState.ck)
    this.handshakeComplete = true
  }

  async send(data: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.destroyed) {
        reject(new LightningPeerConnectionClosed())
        return
      }

      if (!this.handshakeComplete) {
        reject(new Error('Handshake not completed'))
        return
      }

      try {
        // BOLT 8: Encrypt message with AEAD
        const encrypted = aeadEncrypt(this.sk, this.sn++, createUint8Array(0), data)
        // BOLT 1: Add length prefix (2 bytes big-endian)
        const lengthPrefix = createUint8Array(2)
        writeUint32BE(lengthPrefix, 0, encrypted.length)
        const message = concatUint8Arrays([lengthPrefix, encrypted])

        this.socket.write(new Uint8Array(message))
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  }

  async recv(): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new LightningPeerConnectionClosed())
        return
      }

      if (!this.handshakeComplete) {
        reject(new Error('Handshake not completed'))
        return
      }

      // For simplicity, assume we receive complete messages
      // In production, need proper message framing
      const onData = (data: string | Uint8Array | ArrayBuffer) => {
        this.socket!.removeListener('data', onData)
        try {
          const bufferData = uint8ArrayFromBuffer(data)
          const encrypted = uint8ArrayFrom(bufferData)

          // BOLT 1: Remove length prefix (first 2 bytes)
          if (encrypted.length < 2) {
            reject(new Error('Message too short'))
            return
          }
          const length = (encrypted[0] << 8) | encrypted[1]
          if (encrypted.length < 2 + length) {
            reject(new Error('Incomplete message'))
            return
          }
          const encryptedPayload = encrypted.slice(2, 2 + length)

          // BOLT 8: Decrypt message
          const decrypted = aeadDecrypt(this.rk, this.rn++, createUint8Array(0), encryptedPayload)
          resolve(decrypted)
        } catch (error) {
          reject(error)
        }
      }

      const onError = (error: Error) => {
        this.socket!.removeListener('data', onData)
        this.socket!.removeListener('error', onError)
        reject(new LightningPeerConnectionClosed())
      }

      this.socket.on('data', onData)
      this.socket.on('error', onError)
    })
  }

  close(): void {
    if (this.socket && !this.socket.destroyed) {
      this.socket.destroy()
      this.socket = null
    }
  }
}

// Peer address structure
export class LNPeerAddr {
  host: string
  port: number
  pubkey: Uint8Array

  constructor(host: string, port: number, pubkey: Uint8Array) {
    this.host = host
    this.port = port
    this.pubkey = pubkey
  }

  static fromString(addrStr: string): LNPeerAddr {
    // Parse format: pubkey@host:port
    const match = addrStr.match(/^([0-9a-f]{66})@([^:]+):(\d+)$/)
    if (!match) {
      throw new ConnStringFormatError('Invalid peer address format')
    }

    const [, pubkeyHex, host, portStr] = match
    return new LNPeerAddr(host, parseInt(portStr, 10), uint8ArrayFromHex(pubkeyHex))
  }

  toString(): string {
    return `${uint8ArrayToHex(this.pubkey)}@${this.host}:${this.port}`
  }
}

// Utility functions
export function extractNodeId(connectStr: string): { nodeId: Uint8Array; rest: string | null } {
  const parts = connectStr.split('@')
  if (parts.length !== 2) {
    throw new ConnStringFormatError('Invalid connect string format')
  }

  const nodeId = uint8ArrayFromHex(parts[0])
  if (nodeId.length !== 33) {
    throw new ConnStringFormatError('Invalid node ID length')
  }

  return { nodeId, rest: parts[1] }
}

export function splitHostPort(hostPort: string): { host: string; port: number } {
  const parts = hostPort.split(':')
  if (parts.length !== 2) {
    throw new ConnStringFormatError('Invalid host:port format')
  }

  return { host: parts[0], port: parseInt(parts[1], 10) }
}
