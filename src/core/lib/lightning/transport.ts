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
import EventEmitter from 'eventemitter3'
import TcpSocket from 'react-native-tcp-socket'
import { hexToUint8Array, uint8ArrayToHex } from '@/core/lib/utils/utils'

const DEFAULT_LIGHTNING_PORT = 9735

export enum TcpConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  HANDSHAKING = 'handshaking',
  READY = 'ready',
  ERROR = 'error',
}

enum HandshakePhase {
  INIT = 'init',
  ACT_ONE_SENT = 'act_one_sent',
  ACT_TWO_RECEIVED = 'act_two_received',
  ACT_THREE_SENT = 'act_three_sent',
  COMPLETE = 'complete',
}

// Timer handle type compatible with React Native and Node typings
type TimerHandle = ReturnType<typeof setTimeout>

/**
 * Evento de transporte TCP
 */
export type TcpTransportEvent =
  | { type: 'connecting'; host: string; port: number }
  | { type: 'connected'; remoteNodeId: string }
  | { type: 'disconnected'; reason?: string }
  | { type: 'message'; data: Uint8Array }
  | { type: 'error'; error: Error }
  | { type: 'handshakeComplete'; remoteNodeId: string }

/**
 * Configuração do transporte TCP
 */
export interface TcpTransportConfig {
  /** Keypair local (nodeId) */
  localKeyPair: KeyPair
  /** Timeout de conexão em ms */
  connectionTimeout?: number
  /** Timeout de handshake em ms */
  handshakeTimeout?: number
  /** Intervalo de ping em ms */
  pingInterval?: number
  /** Timeout para pong em ms */
  pongTimeout?: number
  /** Auto-reconectar em caso de desconexão */
  autoReconnect?: boolean
  /** Delay máximo de reconexão em ms */
  maxReconnectDelay?: number
  /** Forçar TLS explícito (Lightning normalmente NÃO usa TLS, mesmo em 443) */
  forceTls?: boolean
}

/**
 * Listener de eventos TCP
 */
export type TcpEventListener = (event: TcpTransportEvent) => void

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
 * Performs ECDH and returns SHA256 of the compressed shared point.
 *
 * BOLT #8 specifies:
 * "ECDH(k, rk): The returned value is the SHA256 of the compressed format
 * of the generated point."
 *
 * This matches Electrum's get_ecdh() which returns sha256(shared_point).
 */
export function ecdh(priv: Uint8Array, pub: Point): Sha256 {
  // getSharedSecret returns the compressed point (33 bytes with 02/03 prefix)
  const sharedPoint = secp.getSharedSecret(priv, pub, true)
  // BOLT #8: return SHA256 of the compressed shared point
  return sha256(sharedPoint)
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
 * Initializes handshake state for initiator or responder (Noise XK pattern)
 *
 * BOLT #8 / Noise XK handshake initialization:
 * 1. h = SHA256(protocol_name)
 * 2. ck = h (chaining key starts as protocol hash)
 * 3. h = SHA256(h || prologue)
 * 4. h = SHA256(h || responder_static_pubkey)
 *
 * For initiator: responder_static_pubkey = rs (remote static key, known beforehand)
 * For responder: responder_static_pubkey = ls.pub (their own static public key)
 *
 * This matches Electrum's HandshakeState.__init__:
 *   self.h = sha256(self.protocol_name)
 *   self.ck = self.h
 *   self.update(self.prologue)
 *   self.update(self.responder_pub)  <-- This was missing!
 */
export function initializeHandshakeState(rs?: Point, ls?: KeyPair): HandshakeState {
  const protocolName = new TextEncoder().encode(PROTOCOL_NAME)
  const prologue = new TextEncoder().encode(PROLOGUE)

  // Step 1: h = SHA256(protocol_name)
  const h0 = sha256(protocolName)

  // Step 2: ck = h (chaining key starts as protocol hash)
  const ck = h0.slice()

  // Step 3: h = SHA256(h || prologue)
  const h1 = sha256(new Uint8Array([...h0, ...prologue]))

  // Step 4: h = SHA256(h || responder_static_pubkey)
  // - Initiator: uses rs (remote static key, known beforehand in XK pattern)
  // - Responder: uses ls.pub (their own static public key)
  let h2 = h1
  const responderPubkey = rs ?? (ls ? ls.serializeCompressed() : undefined)
  if (responderPubkey) {
    h2 = sha256(new Uint8Array([...h1, ...responderPubkey]))
  }

  return {
    ck,
    h: h2,
    rs, // remote static key
  }
}

// Handshake Act One

/**
 * Act One: Initiator sends to responder
 */
export function actOneSend(
  state: HandshakeState,
  e?: KeyPair,
): { message: Uint8Array; newState: HandshakeState } {
  if (!state.rs) {
    throw new Error('Remote static key (rs) not set in handshake state')
  }
  const eKey = e || generateKey()
  const h = sha256(new Uint8Array([...state.h, ...eKey.serializeCompressed()]))
  const es = ecdh(eKey.priv, state.rs)
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
  // BOLT #8: sk, rk = HKDF(ck, zero)
  // sk = initiator's send key, rk = initiator's receive key
  // "zero" means empty IKM (zero-length), not 32 zero bytes
  const [sk, rk] = hkdfExtract(ck, new Uint8Array(0))
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
  // BOLT #8: rk, sk = HKDF(ck, zero)
  // rk = responder's receive key (=initiator's send key), sk = responder's send key
  // "zero" means empty IKM (zero-length), not 32 zero bytes
  const [rk, sk] = hkdfExtract(ck, new Uint8Array(0))
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
 * Decrypts only the length prefix from an encrypted message.
 * This is used for streaming reads where we need to know how many more bytes to receive.
 *
 * Returns the plaintext message length and updated keys (with rn incremented).
 * The caller should then receive `length + 16` more bytes and call decryptMessageBody.
 */
export function decryptLengthPrefix(
  keys: TransportKeys,
  encryptedLength: Uint8Array,
): { length: number; newKeys: TransportKeys } | { error: string } {
  if (encryptedLength.length < 18) {
    return { error: 'Encrypted length too short, expected 18 bytes' }
  }

  try {
    const lengthBuf = decryptWithAD(
      keys.rk,
      keys.rn,
      new Uint8Array(0),
      encryptedLength.subarray(0, 18),
    )
    keys.rn++

    const length = new DataView(
      lengthBuf.buffer,
      lengthBuf.byteOffset,
      lengthBuf.byteLength,
    ).getUint16(0, false) // big-endian
    return { length, newKeys: keys }
  } catch (e) {
    return {
      error: `Failed to decrypt length prefix: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

/**
 * Decrypts the message body after the length prefix has already been decrypted.
 * The keys should already have rn incremented from the length decryption.
 */
export function decryptMessageBody(
  keys: TransportKeys,
  encryptedBody: Uint8Array,
  expectedLength: number,
): { message: Uint8Array; newKeys: TransportKeys } | { error: string } {
  if (encryptedBody.length < expectedLength + 16) {
    return {
      error: `Encrypted body too short, expected ${expectedLength + 16} bytes, got ${encryptedBody.length}`,
    }
  }

  try {
    const c = encryptedBody.subarray(0, expectedLength + 16)
    const message = decryptWithAD(keys.rk, keys.rn, new Uint8Array(0), c)
    keys.rn++

    // Key rotation for receiving key (BOLT #8)
    if (keys.rn >= KEY_ROTATION_INTERVAL) {
      const [ck, k] = hkdfExtract(keys.rck, keys.rk)
      keys.rk = k
      keys.rck = ck
      keys.rn = 0
    }

    return { message, newKeys: keys }
  } catch (e) {
    return {
      error: `Failed to decrypt message body: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

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

/**
 * TCP Transport implementation for Lightning Network connections
 * Handles TCP socket management and BOLT #8 handshake
 */
export class TcpTransport {
  private config: Required<TcpTransportConfig>
  private connectionState: ConnectionState
  private socket: any = null
  private host: string = ''
  private port: number = DEFAULT_LIGHTNING_PORT
  private remoteStaticKey: Uint8Array | null = null
  private connectionTimeoutId: TimerHandle | null = null
  private handshakeTimeoutId: TimerHandle | null = null
  private pingIntervalId: TimerHandle | null = null
  private pongTimeoutId: TimerHandle | null = null
  private reconnectTimeoutId: TimerHandle | null = null
  private reconnectDelay: number = 1000
  private listeners: TcpEventListener[] = []
  private eventEmitter = new EventEmitter()

  constructor(config: TcpTransportConfig) {
    this.config = {
      localKeyPair: config.localKeyPair,
      connectionTimeout: config.connectionTimeout ?? 10000,
      handshakeTimeout: config.handshakeTimeout ?? 30000,
      pingInterval: config.pingInterval ?? 30000,
      pongTimeout: config.pongTimeout ?? 5000,
      autoReconnect: config.autoReconnect ?? false,
      maxReconnectDelay: config.maxReconnectDelay ?? 30000,
      forceTls: config.forceTls ?? false,
    }

    this.connectionState = {
      state: TcpConnectionState.DISCONNECTED,
      handshakePhase: HandshakePhase.INIT,
      handshakeState: null,
      transportKeys: null,
      remoteNodeId: null,
      receiveBuffer: new Uint8Array(0),
    }
  }

  /**
   * Conecta ao peer remoto
   * @param nodeId - Node ID do peer remoto (hex string)
   * @param host - Endereço IP ou hostname
   * @param port - Porta (default: 9735)
   */
  async connect(
    nodeId: string,
    host: string,
    port: number = DEFAULT_LIGHTNING_PORT,
  ): Promise<void> {
    if (this.connectionState.state !== TcpConnectionState.DISCONNECTED) {
      throw new Error(`Cannot connect: current state is ${this.connectionState.state}`)
    }

    this.host = host
    this.port = port
    this.remoteStaticKey = hexToUint8Array(nodeId)

    console.warn('[TcpTransport] Connecting to nodeId:', nodeId, 'host:', host, 'port:', port)
    console.warn('[TcpTransport] nodeId type:', typeof nodeId, 'length:', nodeId?.length)
    console.warn(
      '[TcpTransport] Remote static key length:',
      this.remoteStaticKey.length,
      'first byte:',
      this.remoteStaticKey[0],
    )
    console.warn('[TcpTransport] Remote static key hex:', uint8ArrayToHex(this.remoteStaticKey))

    // Lightning usa Noise sobre TCP puro; alguns peers expõem 443 para atravessar firewalls
    // mas não exigem TLS. Só usamos TLS se for explicitamente solicitado.
    const useTls = Boolean(this.config.forceTls)

    if (this.remoteStaticKey.length !== 33) {
      throw new Error('Invalid node ID: must be 33 bytes compressed public key')
    }

    this.updateState({ state: TcpConnectionState.CONNECTING })
    this.emitEvent({ type: 'connecting', host, port })
    console.log(`[TcpTransport] Connecting${useTls ? ' (TLS)' : ''}`, this.getLogContext())

    return new Promise((resolve, reject) => {
      const connectionTimeout = setTimeout(() => {
        this.cleanup()
        const error = new Error('Connection timeout')
        this.updateState({ state: TcpConnectionState.ERROR })
        this.emitEvent({ type: 'error', error })
        console.warn('[TcpTransport] Connection timeout', this.getLogContext())
        reject(error)
      }, this.config.connectionTimeout)

      this.connectionTimeoutId = connectionTimeout

      try {
        const connectFn = useTls ? TcpSocket.connectTLS : TcpSocket.createConnection

        this.socket = connectFn(
          {
            host,
            port,
          },
          () => {
            clearTimeout(connectionTimeout)
            this.connectionTimeoutId = null
            this.onSocketConnect().then(resolve).catch(reject)
          },
        )

        this.socket.on('data', (data: any) => this.onSocketData(data))
        this.socket.on('error', (error: Error) => this.onSocketError(error))
        this.socket.on('close', (hadError: boolean) => this.onSocketClose(hadError))
        this.socket.on('timeout', () => this.onSocketTimeout())
      } catch (error) {
        clearTimeout(connectionTimeout)
        this.connectionTimeoutId = null
        this.updateState({ state: TcpConnectionState.ERROR })
        this.emitEvent({ type: 'error', error: error as Error })
        reject(error)
      }
    })
  }

  /**
   * Desconecta do peer remoto
   */
  async disconnect(reason?: string): Promise<void> {
    this.cleanup()

    if (this.socket) {
      this.socket.destroy()
      this.socket = null
    }

    this.updateState({
      state: TcpConnectionState.DISCONNECTED,
      handshakePhase: HandshakePhase.INIT,
      handshakeState: null,
      transportKeys: null,
      remoteNodeId: null,
      receiveBuffer: new Uint8Array(0),
    })

    this.emitEvent({ type: 'disconnected', reason })
    console.log('[TcpTransport] Disconnected', this.getLogContext(), reason ? `(${reason})` : '')
  }

  /**
   * Envia uma mensagem para o peer remoto
   */
  async sendMessage(message: Uint8Array): Promise<void> {
    if (
      this.connectionState.state !== TcpConnectionState.READY ||
      !this.connectionState.transportKeys
    ) {
      throw new Error('Transport not ready')
    }

    const { encrypted, newKeys } = encryptMessage(this.connectionState.transportKeys, message)
    this.updateState({ transportKeys: newKeys })

    if (this.socket) {
      this.socket.write(new Uint8Array(encrypted))
    }
  }

  /**
   * Adiciona um listener para eventos de transporte
   */
  addTransportListener(listener: TcpEventListener): void {
    this.listeners.push(listener)
  }

  /**
   * Compatibility shim to mirror EventEmitter-style addListener/removeListener used by callers
   * (ln-transport-service expects an event name; we only support a single channel).
   */
  addListener(event: 'transport', listener: TcpEventListener): void {
    if (event === 'transport') {
      this.addTransportListener(listener)
    }
  }

  /**
   * Remove um listener
   */
  removeTransportListener(listener: TcpEventListener): void {
    const index = this.listeners.indexOf(listener)
    if (index > -1) {
      this.listeners.splice(index, 1)
    }
  }

  removeListener(event: 'transport', listener: TcpEventListener): void {
    if (event === 'transport') {
      this.removeTransportListener(listener)
    }
  }

  /**
   * Retorna o estado atual da conexão
   */
  getState(): TcpConnectionState {
    return this.connectionState.state
  }

  /**
   * Retorna as chaves de transporte (apenas após handshake)
   */
  getTransportKeys(): TransportKeys | null {
    return this.connectionState.transportKeys
  }

  /**
   * Retorna informações de contexto para logging
   */
  private getLogContext(): string {
    return `(${this.host}:${this.port}, ${this.connectionState.state})`
  }

  /**
   * Atualiza o estado interno da conexão
   */
  private updateState(updates: Partial<ConnectionState>): void {
    this.connectionState = { ...this.connectionState, ...updates }
  }

  /**
   * Emite um evento para todos os listeners
   */
  private emitEvent(event: TcpTransportEvent): void {
    this.listeners.forEach(listener => listener(event))
  }

  /**
   * Limpa todos os timeouts e intervals
   */
  private cleanup(): void {
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId)
      this.connectionTimeoutId = null
    }
    if (this.handshakeTimeoutId) {
      clearTimeout(this.handshakeTimeoutId)
      this.handshakeTimeoutId = null
    }
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId)
      this.pingIntervalId = null
    }
    if (this.pongTimeoutId) {
      clearTimeout(this.pongTimeoutId)
      this.pongTimeoutId = null
    }
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId)
      this.reconnectTimeoutId = null
    }
  }

  /**
   * Agenda uma reconexão automática
   */
  private scheduleReconnect(): void {
    if (!this.config.autoReconnect || !this.remoteStaticKey) {
      return
    }

    this.reconnectTimeoutId = setTimeout(() => {
      console.log('[TcpTransport] Attempting reconnect', this.getLogContext())
      this.connect(uint8ArrayToHex(this.remoteStaticKey!), this.host, this.port).catch(error => {
        console.error('[TcpTransport] Reconnect failed:', error.message, this.getLogContext())
        // Exponential backoff
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.config.maxReconnectDelay)
        this.scheduleReconnect()
      })
    }, this.reconnectDelay)
  }

  /**
   * Manipula conexão bem-sucedida do socket
   */
  private async onSocketConnect(): Promise<void> {
    console.log('[TcpTransport] Socket connected, starting handshake', this.getLogContext())

    this.updateState({ state: TcpConnectionState.CONNECTED })
    this.emitEvent({ type: 'connected', remoteNodeId: uint8ArrayToHex(this.remoteStaticKey!) })

    // Inicia handshake
    await this.startHandshake()
  }

  /**
   * Manipula dados recebidos do socket
   */
  private onSocketData(data: any): void {
    // Anexa novos dados ao buffer
    const incoming = data instanceof Uint8Array ? data : new Uint8Array(data)
    const newBuffer = new Uint8Array(this.connectionState.receiveBuffer.length + incoming.length)
    newBuffer.set(this.connectionState.receiveBuffer)
    newBuffer.set(incoming, this.connectionState.receiveBuffer.length)
    this.updateState({ receiveBuffer: newBuffer })

    console.log(
      `[TcpTransport] Received ${incoming.length} bytes, total buffer: ${newBuffer.length}`,
      this.getLogContext(),
    )
    console.log('[TcpTransport] Received data (hex):', uint8ArrayToHex(incoming))

    // Processa handshake se não completo
    if (this.connectionState.state === TcpConnectionState.HANDSHAKING) {
      this.processHandshake()
    } else if (this.connectionState.state === TcpConnectionState.READY) {
      this.processMessages()
    }
  }

  /**
   * Manipula erro do socket
   */
  private onSocketError(error: Error): void {
    console.error('[TcpTransport] Socket error:', error.message, this.getLogContext())
    this.updateState({ state: TcpConnectionState.ERROR })
    this.cleanup()
    this.emitEvent({ type: 'error', error })
    this.scheduleReconnect()
  }

  /**
   * Manipula fechamento do socket
   */
  private onSocketClose(hadError: boolean): void {
    console.log('[TcpTransport] Socket closed, hadError:', hadError, this.getLogContext())
    this.cleanup()
    this.updateState({ state: TcpConnectionState.DISCONNECTED })
    this.emitEvent({ type: 'disconnected', reason: hadError ? 'error' : 'normal' })
    this.scheduleReconnect()
  }

  /**
   * Manipula timeout do socket
   */
  private onSocketTimeout(): void {
    console.log('[TcpTransport] Socket timeout', this.getLogContext())
    this.disconnect('timeout')
  }

  /**
   * Inicia o handshake BOLT #8
   */
  private async startHandshake(): Promise<void> {
    this.updateState({
      state: TcpConnectionState.HANDSHAKING,
      handshakePhase: HandshakePhase.INIT,
      handshakeState: initializeHandshakeState(this.remoteStaticKey!, this.config.localKeyPair),
    })

    // Act One: Initiator -> Responder
    const ephemeralKey = generateKey()
    console.warn(
      '[startHandshake] Generated ephemeral key:',
      uint8ArrayToHex(ephemeralKey.serializeCompressed()),
    )

    const actOneResult = actOneSend(this.connectionState.handshakeState!, ephemeralKey)

    console.log('[TcpTransport] Act One message length:', actOneResult.message.length)
    console.log('[TcpTransport] Act One message (hex):', uint8ArrayToHex(actOneResult.message))

    // Validate Act One format
    if (actOneResult.message.length !== ACT_ONE_SIZE) {
      throw new Error(
        `Invalid Act One size: ${actOneResult.message.length}, expected ${ACT_ONE_SIZE}`,
      )
    }
    if (actOneResult.message[0] !== 0) {
      throw new Error(`Invalid Act One version: ${actOneResult.message[0]}, expected 0`)
    }

    this.updateState({
      handshakeState: { ...actOneResult.newState, e: ephemeralKey },
      handshakePhase: HandshakePhase.ACT_ONE_SENT,
    })

    console.log('[TcpTransport] Sending Act One')
    if (this.socket) {
      this.socket.write(new Uint8Array(actOneResult.message))
    }

    // Timeout do handshake
    this.handshakeTimeoutId = setTimeout(() => {
      console.error('[TcpTransport] Handshake timeout', this.getLogContext())
      this.disconnect('handshake_timeout')
    }, this.config.handshakeTimeout)
  }

  /**
   * Processa o handshake BOLT #8
   */
  private processHandshake(): void {
    try {
      if (
        this.connectionState.handshakePhase === HandshakePhase.ACT_ONE_SENT &&
        this.connectionState.receiveBuffer.length >= ACT_TWO_SIZE
      ) {
        // Processa Act Two
        console.log('[TcpTransport] Processing Act Two', this.getLogContext())
        const actTwo = this.connectionState.receiveBuffer.subarray(0, ACT_TWO_SIZE)
        this.updateState({
          receiveBuffer: this.connectionState.receiveBuffer.subarray(ACT_TWO_SIZE),
        })

        console.log('[TcpTransport] Act Two message length:', actTwo.length)
        console.log('[TcpTransport] Act Two message (hex):', uint8ArrayToHex(actTwo))

        // Validate Act Two format
        if (actTwo.length !== ACT_TWO_SIZE) {
          throw new Error(`Invalid Act Two size: ${actTwo.length}, expected ${ACT_TWO_SIZE}`)
        }
        if (actTwo[0] !== 0) {
          throw new Error(`Invalid Act Two version: ${actTwo[0]}, expected 0`)
        }

        const handshakeState = this.connectionState.handshakeState
        const ephemeralKey = handshakeState?.e

        if (!handshakeState || !ephemeralKey) {
          throw new Error('Invalid handshake state for Act Two')
        }

        const result = actTwoReceive(handshakeState, actTwo, ephemeralKey)

        if ('error' in result) {
          throw new Error(`Act Two failed: ${result.error}`)
        }

        this.updateState({
          handshakeState: result.newState,
          handshakePhase: HandshakePhase.ACT_TWO_RECEIVED,
        })

        // Extrair remote ephemeral key do Act Two
        const remoteEphemeral = actTwo.subarray(1, 34)
        console.log(
          '[TcpTransport] Remote ephemeral key from Act Two:',
          uint8ArrayToHex(remoteEphemeral),
        )

        // Envia Act Three
        console.log('[TcpTransport] Sending Act Three', this.getLogContext())
        const actThreeResult = actThreeSend(
          result.newState,
          this.config.localKeyPair,
          remoteEphemeral,
        )
        if (this.socket) {
          this.socket.write(new Uint8Array(actThreeResult.message))
        }

        // Handshake completo
        if (this.handshakeTimeoutId) {
          clearTimeout(this.handshakeTimeoutId)
          this.handshakeTimeoutId = null
        }

        this.updateState({
          handshakePhase: HandshakePhase.COMPLETE,
          transportKeys: actThreeResult.keys,
          remoteNodeId: this.remoteStaticKey!,
          state: TcpConnectionState.READY,
        })

        this.emitEvent({
          type: 'handshakeComplete',
          remoteNodeId: uint8ArrayToHex(this.remoteStaticKey!),
        })
        console.log('[TcpTransport] Handshake complete', this.getLogContext())

        // Iniciar ping/pong
        this.startPingPong()
      }
    } catch (error) {
      console.error(
        '[TcpTransport] Handshake failed:',
        (error as Error).message,
        this.getLogContext(),
      )
      this.disconnect('handshake_failed')
    }
  }

  /**
   * Processa mensagens recebidas
   */
  private processMessages(): void {
    while (this.connectionState.receiveBuffer.length >= 18) {
      // Tamanho mínimo do header
      try {
        const length =
          (this.connectionState.receiveBuffer[16] << 8) | this.connectionState.receiveBuffer[17]

        if (length > MAX_MESSAGE_SIZE) {
          throw new Error(`Message too large: ${length} bytes`)
        }

        const totalSize = 18 + length + 16 // header + body + MAC

        if (this.connectionState.receiveBuffer.length < totalSize) {
          break // Espera por mais dados
        }

        const encrypted = this.connectionState.receiveBuffer.subarray(0, totalSize)
        this.updateState({ receiveBuffer: this.connectionState.receiveBuffer.subarray(totalSize) })

        if (!this.connectionState.transportKeys) {
          throw new Error('Transport keys not available')
        }

        const result = decryptMessage(this.connectionState.transportKeys, encrypted)

        if ('error' in result) {
          throw new Error(`Decrypt failed: ${result.error}`)
        }

        this.updateState({ transportKeys: result.newKeys })

        this.emitEvent({ type: 'message', data: result.message })
      } catch (error) {
        console.error(
          '[TcpTransport] Message processing error:',
          (error as Error).message,
          this.getLogContext(),
        )
        this.disconnect('message_error')
        return
      }
    }
  }

  /**
   * Inicia o sistema de ping/pong
   */
  private startPingPong(): void {
    this.pingIntervalId = setInterval(() => {
      // TODO: Implementar ping BOLT #1
      // Por enquanto, apenas log
      console.log('[TcpTransport] Ping interval', this.getLogContext())
    }, this.config.pingInterval)
  }
}

/**
 * Estado interno da conexão
 */
interface ConnectionState {
  state: TcpConnectionState
  handshakePhase: HandshakePhase
  handshakeState: HandshakeState | null
  transportKeys: TransportKeys | null
  remoteNodeId: Uint8Array | null
  receiveBuffer: Uint8Array
}
