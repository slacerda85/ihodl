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
  encryptionKey?: Buffer
  decryptionKey?: Buffer
  ephemeralKey?: Buffer
}

export interface NoiseHandshakeState {
  initiator: boolean
  localEphemeralKey: Buffer
  remoteEphemeralKey?: Buffer
  localStaticKey: Buffer
  remoteStaticKey?: Buffer
  chainingKey: Buffer
  handshakeHash: Buffer
  phase: 'init' | 'ephemeral' | 'static' | 'complete'
}

export interface P2PMessage {
  type: number
  payload: Buffer
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
  encryptMessage(message: Buffer, key: Buffer): Buffer
  decryptMessage(encryptedData: Buffer, key: Buffer): Buffer
  generateNoiseKeys(): { publicKey: Buffer; privateKey: Buffer }
  performNoiseHandshake(
    localPrivateKey: Buffer,
    remotePublicKey: Buffer,
    initiator: boolean,
  ): Promise<{ encryptionKey: Buffer; decryptionKey: Buffer }>
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
