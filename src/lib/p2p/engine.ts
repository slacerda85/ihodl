/**
 * P2P Engine - Main Lightning P2P Protocol Engine
 * Coordinates all P2P components: encryption, connections, discovery, and messaging
 */

import { IP2PEngine, P2PConnection, PeerAddress, P2PMessage, P2PConfig } from './types'
import { DEFAULT_P2P_CONFIG } from './constants'
import { MessageEncryptor } from './encryption'
import { ConnectionManager } from './connection'
import { PeerDiscovery } from './discovery'

export class P2PEngine implements IP2PEngine {
  private config: P2PConfig
  private encryptor: MessageEncryptor
  private connectionManager: ConnectionManager
  private peerDiscovery: PeerDiscovery
  private messageCallbacks: ((connectionId: string, message: P2PMessage) => void)[] = []
  private heartbeatInterval?: any

  constructor(config: Partial<P2PConfig> = {}) {
    this.config = { ...DEFAULT_P2P_CONFIG, ...config }

    // Initialize components
    this.encryptor = new MessageEncryptor()
    this.connectionManager = new ConnectionManager(this.config)
    this.peerDiscovery = new PeerDiscovery()

    // Start maintenance routines
    this.startMaintenance()
  }

  /**
   * Connect to a Lightning peer
   */
  async connect(peerAddress: PeerAddress): Promise<P2PConnection> {
    console.log(`Connecting to peer: ${peerAddress.host}:${peerAddress.port}`)

    // Create connection
    const connection = await this.connectionManager.createConnection(peerAddress)

    // TODO: Perform Noise handshake for encryption
    // const keys = await this.encryptor.performNoiseHandshake(localPrivateKey, remotePublicKey, true)
    // connection.encryptionKey = keys.encryptionKey
    // connection.decryptionKey = keys.decryptionKey
    // connection.handshakeComplete = true

    // Add peer to known peers
    this.peerDiscovery.addKnownPeer(peerAddress)

    console.log(`Successfully connected to peer: ${connection.id}`)
    return connection
  }

  /**
   * Disconnect from a peer
   */
  async disconnect(connectionId: string): Promise<void> {
    console.log(`Disconnecting from peer: ${connectionId}`)
    await this.connectionManager.closeConnection(connectionId)
  }

  /**
   * Send a message to a connected peer
   */
  async sendMessage(connectionId: string, message: P2PMessage): Promise<void> {
    const connection = this.connectionManager
      .getActiveConnections()
      .find(conn => conn.id === connectionId)

    if (!connection) {
      throw new Error(`No active connection found for ${connectionId}`)
    }

    if (!connection.isConnected) {
      throw new Error(`Connection ${connectionId} is not active`)
    }

    try {
      let dataToSend: Buffer

      if (connection.handshakeComplete && connection.encryptionKey) {
        // Encrypt message if handshake is complete
        const serialized = this.serializeMessage(message)
        dataToSend = this.encryptor.encryptMessage(serialized, connection.encryptionKey)
      } else {
        // Send unencrypted (should only happen during handshake)
        dataToSend = this.serializeMessage(message)
      }

      // Send via socket
      const socket: any = connection.socket
      if (socket && socket.write) {
        socket.write(dataToSend)
      } else {
        throw new Error('Socket not available for writing')
      }

      connection.lastActivity = Date.now()
      console.log(`Sent message type ${message.type} to ${connectionId}`)
    } catch (error) {
      console.error(`Failed to send message to ${connectionId}:`, error)
      throw error
    }
  }

  /**
   * Register a callback for incoming messages
   */
  onMessage(callback: (connectionId: string, message: P2PMessage) => void): void {
    this.messageCallbacks.push(callback)
  }

  /**
   * Get all active connections
   */
  getConnections(): P2PConnection[] {
    return this.connectionManager.getActiveConnections()
  }

  /**
   * Get a specific connection by ID
   */
  getConnection(connectionId: string): P2PConnection | undefined {
    return this.connectionManager.getActiveConnections().find(conn => conn.id === connectionId)
  }

  /**
   * Discover and connect to new peers
   */
  async discoverAndConnect(maxConnections: number = 5): Promise<P2PConnection[]> {
    console.log(`Discovering and connecting to up to ${maxConnections} peers`)

    // Discover new peers
    const discoveredPeers = await this.peerDiscovery.discoverPeers()

    // Connect to a subset of discovered peers
    const peersToConnect = discoveredPeers.slice(0, maxConnections)
    const connections: P2PConnection[] = []

    for (const peer of peersToConnect) {
      try {
        const connection = await this.connect(peer)
        connections.push(connection)
      } catch (error) {
        console.warn(`Failed to connect to peer ${peer.host}:${peer.port}:`, error)
        // Continue with other peers
      }
    }

    console.log(`Successfully connected to ${connections.length} peers`)
    return connections
  }

  /**
   * Get network statistics
   */
  getNetworkStats(): {
    connections: number
    knownPeers: number
    pendingConnections: number
  } {
    const connections = this.getConnections().length
    const knownPeers = this.peerDiscovery.getPeerCount()

    return {
      connections,
      knownPeers,
      pendingConnections: 0, // TODO: Track pending connections
    }
  }

  /**
   * Shutdown the P2P engine
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down P2P engine')

    // Stop maintenance
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }

    // Close all connections
    const connections = this.getConnections()
    await Promise.all(connections.map(conn => this.disconnect(conn.id)))

    console.log('P2P engine shutdown complete')
  }

  /**
   * Start maintenance routines (heartbeat, cleanup, etc.)
   */
  private startMaintenance(): void {
    // Run connection maintenance every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      this.connectionManager.maintainConnections()
    }, this.config.heartbeatInterval)
  }

  /**
   * Serialize a P2P message for transmission
   */
  private serializeMessage(message: P2PMessage): Buffer {
    // Simple serialization - in production, this would follow Lightning BOLT 1 format
    const typeBuf = Buffer.alloc(2)
    typeBuf.writeUInt16BE(message.type, 0)

    const lengthBuf = Buffer.alloc(2)
    lengthBuf.writeUInt16BE(message.payload.length, 0)

    return Buffer.concat([typeBuf, lengthBuf, message.payload])
  }

  /**
   * Handle incoming message from a connection
   * This would be called by the connection manager
   */
  private handleIncomingMessage(connectionId: string, data: Buffer): void {
    try {
      const connection = this.getConnection(connectionId)
      if (!connection) {
        console.warn(`Received message for unknown connection: ${connectionId}`)
        return
      }

      let message: P2PMessage

      if (connection.handshakeComplete && connection.decryptionKey) {
        // Decrypt message
        const decrypted = this.encryptor.decryptMessage(data, connection.decryptionKey)
        message = this.deserializeMessage(decrypted)
      } else {
        // Message is unencrypted
        message = this.deserializeMessage(data)
      }

      // Notify callbacks
      this.messageCallbacks.forEach(callback => {
        try {
          callback(connectionId, message)
        } catch (error) {
          console.error('Error in message callback:', error)
        }
      })

      connection.lastActivity = Date.now()
    } catch (error) {
      console.error(`Error handling incoming message from ${connectionId}:`, error)
    }
  }

  /**
   * Deserialize a received P2P message
   */
  private deserializeMessage(data: Buffer): P2PMessage {
    if (data.length < 4) {
      throw new Error('Message too short')
    }

    const type = data.readUInt16BE(0)
    const length = data.readUInt16BE(2)

    if (data.length !== 4 + length) {
      throw new Error('Invalid message length')
    }

    const payload = data.slice(4, 4 + length)

    return {
      type,
      payload,
      timestamp: Date.now(),
    }
  }
}
