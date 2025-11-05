/**
 * P2P Connection Manager
 * Manages TCP/WebSocket connections to Lightning peers
 */

import { Buffer } from 'buffer'
import TcpSocket from 'react-native-tcp-socket'
import { IConnectionManager, P2PConnection, PeerAddress, P2PConfig, P2PError } from './types'
import { P2P_CONSTANTS, DEFAULT_P2P_CONFIG } from './constants'
import { createConnectionId } from './utils'

export class ConnectionManager implements IConnectionManager {
  private connections: Map<string, P2PConnection> = new Map()
  private config: P2PConfig
  private reconnectTimeouts: Map<string, any> = new Map()

  constructor(config: Partial<P2PConfig> = {}) {
    this.config = { ...DEFAULT_P2P_CONFIG, ...config }
  }

  /**
   * Create a new connection to a peer
   */
  async createConnection(peerAddress: PeerAddress): Promise<P2PConnection> {
    const connectionId = createConnectionId(peerAddress.host, peerAddress.port)

    // Check if connection already exists
    const existingConnection = this.connections.get(connectionId)
    if (existingConnection && existingConnection.isConnected) {
      return existingConnection
    }

    try {
      const socket = TcpSocket.createConnection(
        {
          port: peerAddress.port,
          host: peerAddress.host,
        },
        () => {
          // Connection established
        },
      )

      const connection: P2PConnection = {
        id: connectionId,
        peerAddress,
        socket,
        isConnected: false,
        lastActivity: Date.now(),
        handshakeComplete: false,
      }

      // Set up socket event handlers
      this.setupSocketHandlers(connection)

      // Connect to peer
      await this.connectSocket(socket, peerAddress)

      connection.isConnected = true
      this.connections.set(connectionId, connection)

      return connection
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw new P2PError(
        `Failed to connect to peer ${connectionId}: ${errorMessage}`,
        P2P_CONSTANTS.ERROR_CONNECTION_LOST,
        error,
      )
    }
  }

  /**
   * Close a connection
   */
  async closeConnection(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId)
    if (!connection) {
      return
    }

    // Clear any pending reconnect timeout
    const timeout = this.reconnectTimeouts.get(connectionId)
    if (timeout) {
      clearTimeout(timeout)
      this.reconnectTimeouts.delete(connectionId)
    }

    try {
      if (connection.socket && connection.isConnected) {
        connection.socket.destroy()
      }
    } catch (error) {
      console.warn(`Error closing connection ${connectionId}:`, error)
    } finally {
      connection.isConnected = false
      this.connections.delete(connectionId)
    }
  }

  /**
   * Maintain active connections (heartbeat, cleanup, reconnection)
   */
  maintainConnections(): void {
    const now = Date.now()

    for (const [connectionId, connection] of this.connections) {
      // Check for stale connections
      if (now - connection.lastActivity > this.config.heartbeatInterval * 2) {
        console.warn(`Connection ${connectionId} appears stale, closing`)
        this.closeConnection(connectionId)
        continue
      }

      // Send heartbeat if needed
      if (now - connection.lastActivity > this.config.heartbeatInterval) {
        this.sendHeartbeat(connection)
      }
    }

    // Clean up old reconnect timeouts
    for (const [connectionId, timeout] of this.reconnectTimeouts) {
      if (!this.connections.has(connectionId)) {
        clearTimeout(timeout)
        this.reconnectTimeouts.delete(connectionId)
      }
    }
  }

  /**
   * Get all active connections
   */
  getActiveConnections(): P2PConnection[] {
    return Array.from(this.connections.values()).filter(conn => conn.isConnected)
  }

  /**
   * Set up socket event handlers
   */
  private setupSocketHandlers(connection: P2PConnection): void {
    const socket = connection.socket as any

    socket.on('connect', () => {
      console.log(`Connected to peer ${connection.id}`)
      connection.isConnected = true
      connection.lastActivity = Date.now()
    })

    socket.on('data', (data: Buffer) => {
      connection.lastActivity = Date.now()
      this.handleIncomingData(connection, data)
    })

    socket.on('error', (error: Error) => {
      console.error(`Socket error for ${connection.id}:`, error)
      this.handleConnectionError(connection, error)
    })

    socket.on('close', (hadError: boolean) => {
      console.log(`Connection ${connection.id} closed${hadError ? ' with error' : ''}`)
      connection.isConnected = false
      this.handleConnectionClose(connection)
    })

    socket.on('timeout', () => {
      console.warn(`Connection ${connection.id} timed out`)
      this.handleConnectionTimeout(connection)
    })
  }

  /**
   * Connect socket to peer address
   */
  private connectSocket(socket: any, peerAddress: PeerAddress): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.destroy()
        reject(new Error('Connection timeout'))
      }, this.config.connectionTimeout)

      socket.connect(
        {
          port: peerAddress.port,
          host: peerAddress.host,
          timeout: this.config.connectionTimeout,
        },
        () => {
          clearTimeout(timeout)
          resolve()
        },
      )

      socket.on('error', (error: any) => {
        clearTimeout(timeout)
        reject(error)
      })
    })
  }

  /**
   * Handle incoming data from peer
   */
  private handleIncomingData(connection: P2PConnection, data: Buffer): void {
    // In a real implementation, this would parse Lightning messages
    // For now, just log the data
    console.log(`Received ${data.length} bytes from ${connection.id}`)

    // TODO: Parse and handle Lightning protocol messages
    // This would involve:
    // 1. Message deserialization
    // 2. Decryption if handshake is complete
    // 3. Message type routing
    // 4. Response generation
  }

  /**
   * Send heartbeat/ping to maintain connection
   */
  private sendHeartbeat(connection: P2PConnection): void {
    if (!connection.isConnected || !connection.socket) {
      return
    }

    try {
      // Send a simple ping message
      // In Lightning, this would be a proper PING message
      const pingData = Buffer.from('ping', 'utf8')
      connection.socket.write(pingData)
      connection.lastActivity = Date.now()
    } catch (error) {
      console.error(`Failed to send heartbeat to ${connection.id}:`, error)
      this.handleConnectionError(connection, error as Error)
    }
  }

  /**
   * Handle connection errors
   */
  private handleConnectionError(connection: P2PConnection, error: Error): void {
    console.error(`Connection error for ${connection.id}:`, error)
    connection.isConnected = false

    // Attempt reconnection if configured
    if (this.config.reconnectAttempts > 0) {
      this.scheduleReconnection(connection)
    } else {
      this.connections.delete(connection.id)
    }
  }

  /**
   * Handle connection close
   */
  private handleConnectionClose(connection: P2PConnection): void {
    connection.isConnected = false

    // Attempt reconnection
    this.scheduleReconnection(connection)
  }

  /**
   * Handle connection timeout
   */
  private handleConnectionTimeout(connection: P2PConnection): void {
    console.warn(`Connection timeout for ${connection.id}`)
    this.closeConnection(connection.id)
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnection(connection: P2PConnection): void {
    const existingTimeout = this.reconnectTimeouts.get(connection.id)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    const timeout = setTimeout(async () => {
      console.log(`Attempting to reconnect to ${connection.id}`)
      this.reconnectTimeouts.delete(connection.id)

      try {
        await this.createConnection(connection.peerAddress)
      } catch (error) {
        console.error(`Reconnection failed for ${connection.id}:`, error)

        // Schedule another attempt if we haven't exceeded max attempts
        const attemptCount = (connection as any).reconnectAttempts || 0
        if (attemptCount < this.config.reconnectAttempts) {
          ;(connection as any).reconnectAttempts = attemptCount + 1
          this.scheduleReconnection(connection)
        } else {
          console.error(`Max reconnection attempts reached for ${connection.id}`)
          this.connections.delete(connection.id)
        }
      }
    }, this.config.reconnectDelay)

    this.reconnectTimeouts.set(connection.id, timeout)
  }
}
