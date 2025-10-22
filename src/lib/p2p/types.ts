/**
 * P2P Protocol Types and Interfaces
 * Implements BOLT 1: Base Protocol
 */

export interface PeerAddress {
  host: string
  port: number
  pubkey?: string
}

export interface P2PConnection {
  id: string
  peerAddress: PeerAddress
  socket: any // WebSocket or TCP socket
  isConnected: boolean
  lastActivity: number
  handshakeComplete: boolean
  encryptionKey?: Uint8Array
  decryptionKey?: Uint8Array
  ephemeralKey?: Uint8Array
}

export interface NoiseHandshakeState {
  initiator: boolean
  localEphemeralKey: Uint8Array
  remoteEphemeralKey?: Uint8Array
  localStaticKey: Uint8Array
  remoteStaticKey?: Uint8Array
  chainingKey: Uint8Array
  handshakeHash: Uint8Array
  phase: 'init' | 'ephemeral' | 'static' | 'complete'
}

export interface P2PMessage {
  type: number
  payload: Uint8Array
  timestamp: number
}

export interface IP2PEngine {
  connect(peerAddress: PeerAddress): Promise<P2PConnection>
  disconnect(connectionId: string): Promise<void>
  sendMessage(connectionId: string, message: P2PMessage): Promise<void>
  onMessage(callback: (connectionId: string, message: P2PMessage) => void): void
  getConnections(): P2PConnection[]
  getConnection(connectionId: string): P2PConnection | undefined
}

export interface IConnectionManager {
  createConnection(peerAddress: PeerAddress): Promise<P2PConnection>
  closeConnection(connectionId: string): Promise<void>
  maintainConnections(): void
  getActiveConnections(): P2PConnection[]
}

export interface IMessageEncryptor {
  encryptMessage(message: Uint8Array, key: Uint8Array): Uint8Array
  decryptMessage(encryptedData: Uint8Array, key: Uint8Array): Uint8Array
  generateNoiseKeys(): { publicKey: Uint8Array; privateKey: Uint8Array }
  performNoiseHandshake(
    localPrivateKey: Uint8Array,
    remotePublicKey: Uint8Array,
    initiator: boolean,
  ): Promise<{ encryptionKey: Uint8Array; decryptionKey: Uint8Array }>
}

export interface IPeerDiscovery {
  discoverPeers(): Promise<PeerAddress[]>
  addKnownPeer(peer: PeerAddress): void
  removeKnownPeer(peerAddress: string): void
  getKnownPeers(): PeerAddress[]
}

export interface P2PConfig {
  maxConnections: number
  connectionTimeout: number
  heartbeatInterval: number
  reconnectAttempts: number
  reconnectDelay: number
  listenPort?: number
  enableTLS: boolean
}

export enum P2PMessageType {
  // Control messages
  INIT = 16,
  ERROR = 17,
  PING = 18,
  PONG = 19,

  // Channel messages
  OPEN_CHANNEL = 32,
  ACCEPT_CHANNEL = 33,
  FUNDING_CREATED = 34,
  FUNDING_SIGNED = 35,
  FUNDING_LOCKED = 36,
  SHUTDOWN = 38,
  CLOSING_SIGNED = 39,

  // HTLC messages
  UPDATE_ADD_HTLC = 128,
  UPDATE_FULFILL_HTLC = 130,
  UPDATE_FAIL_HTLC = 131,
  UPDATE_FAIL_MALFORMED_HTLC = 135,
  COMMITMENT_SIGNED = 132,
  REVOKE_AND_ACK = 133,
  UPDATE_FEE = 134,

  // Announcement messages
  CHANNEL_ANNOUNCEMENT = 256,
  NODE_ANNOUNCEMENT = 257,
  CHANNEL_UPDATE = 258,
  ANNOUNCEMENT_SIGNATURES = 259,
}

export class P2PError extends Error {
  code: number
  data?: any

  constructor(message: string, code: number, data?: any) {
    super(message)
    this.name = 'P2PError'
    this.code = code
    this.data = data
  }
}
