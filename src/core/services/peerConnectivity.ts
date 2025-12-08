// Peer Connectivity Service
// Manages persistent Lightning Network peer connections
// Implements auto-reconnect, connection pooling, and health monitoring

import { LightningTransport, getTransport } from './ln-transport-service'
import EventEmitter from 'eventemitter3'

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface PeerInfo {
  nodeId: string
  address: string
  port?: number
  features?: string
  lastSeen?: number
  connectionAttempts: number
  isConnected: boolean
  isConnecting: boolean
  lastConnected?: number
  lastDisconnected?: number
  disconnectReason?: string
}

export interface PeerConnectivityConfig {
  maxPeers: number
  reconnectInterval: number
  maxReconnectAttempts: number
  healthCheckInterval: number
  connectionTimeout: number
  pingInterval: number
}

export interface PeerConnectivityStatus {
  totalPeers: number
  connectedPeers: number
  connectingPeers: number
  failedPeers: number
  lastHealthCheck: number
  uptime: number
}

export type PeerEventType =
  | 'peer_connected'
  | 'peer_disconnected'
  | 'peer_failed'
  | 'peer_reconnecting'
  | 'health_check'
  | 'pool_updated'

export interface PeerConnectivityEvent {
  type: PeerEventType
  peer?: PeerInfo
  data?: any
}

// ==========================================
// CONSTANTS
// ==========================================

const DEFAULT_CONFIG: PeerConnectivityConfig = {
  maxPeers: 5,
  reconnectInterval: 30000, // 30 seconds
  maxReconnectAttempts: 10,
  healthCheckInterval: 60000, // 1 minute
  connectionTimeout: 10000, // 10 seconds
  pingInterval: 300000, // 5 minutes
}

// ==========================================
// PEER CONNECTIVITY SERVICE
// ==========================================

export class PeerConnectivityService extends EventEmitter {
  private config: PeerConnectivityConfig
  private peers: Map<string, PeerInfo> = new Map()
  private transport: LightningTransport
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map()
  private healthCheckTimer?: number | NodeJS.Timeout
  private pingTimers: Map<string, NodeJS.Timeout> = new Map()
  private startTime: number = Date.now()
  private isRunning: boolean = false

  constructor(config: Partial<PeerConnectivityConfig> = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.transport = getTransport()
    this.setupTransportListeners()
  }

  // ==========================================
  // PUBLIC API
  // ==========================================

  /**
   * Start the peer connectivity service
   */
  async start(): Promise<void> {
    if (this.isRunning) return

    this.isRunning = true
    this.startTime = Date.now()

    console.log('[PeerConnectivity] Starting peer connectivity service...')

    // Start health monitoring
    this.startHealthMonitoring()

    // Load initial peer list
    await this.loadInitialPeers()

    // Connect to initial peers
    await this.connectToPeers()

    console.log('[PeerConnectivity] Peer connectivity service started')
  }

  /**
   * Stop the peer connectivity service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return

    this.isRunning = false

    console.log('[PeerConnectivity] Stopping peer connectivity service...')

    // Stop health monitoring
    this.stopHealthMonitoring()

    // Clear all timers
    this.clearAllTimers()

    // Disconnect all peers
    await this.disconnectAllPeers()

    console.log('[PeerConnectivity] Peer connectivity service stopped')
  }

  /**
   * Add a peer to the connection pool
   */
  addPeer(nodeId: string, address: string, port?: number): void {
    const peerKey = `${nodeId}@${address}${port ? `:${port}` : ''}`

    if (this.peers.has(peerKey)) {
      console.log(`[PeerConnectivity] Peer ${peerKey} already exists`)
      return
    }

    const peer: PeerInfo = {
      nodeId,
      address,
      port,
      connectionAttempts: 0,
      isConnected: false,
      isConnecting: false,
    }

    this.peers.set(peerKey, peer)
    console.log(`[PeerConnectivity] Added peer: ${peerKey}`)

    this.emit('pool_updated', { peers: Array.from(this.peers.values()) })

    // Try to connect if we're running and below max peers
    if (this.isRunning && this.getConnectedPeers().length < this.config.maxPeers) {
      this.connectToPeer(peer)
    }
  }

  /**
   * Remove a peer from the connection pool
   */
  removePeer(nodeId: string, address: string): void {
    const peerKey = `${nodeId}@${address}`
    const peer = this.peers.get(peerKey)

    if (!peer) return

    // Disconnect if connected
    if (peer.isConnected) {
      this.disconnectPeer(peer)
    }

    // Clear timers
    const reconnectTimer = this.reconnectTimers.get(peerKey)
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      this.reconnectTimers.delete(peerKey)
    }

    const pingTimer = this.pingTimers.get(peerKey)
    if (pingTimer) {
      clearInterval(pingTimer)
      this.pingTimers.delete(peerKey)
    }

    this.peers.delete(peerKey)
    console.log(`[PeerConnectivity] Removed peer: ${peerKey}`)

    this.emit('pool_updated', { peers: Array.from(this.peers.values()) })
  }

  /**
   * Get current connectivity status
   */
  getStatus(): PeerConnectivityStatus {
    const allPeers = Array.from(this.peers.values())
    const connectedPeers = allPeers.filter(p => p.isConnected).length
    const connectingPeers = allPeers.filter(p => p.isConnecting && !p.isConnected).length
    const failedPeers = allPeers.filter(
      p =>
        !p.isConnected &&
        !p.isConnecting &&
        p.connectionAttempts >= this.config.maxReconnectAttempts,
    ).length

    return {
      totalPeers: allPeers.length,
      connectedPeers,
      connectingPeers,
      failedPeers,
      lastHealthCheck: Date.now(),
      uptime: Date.now() - this.startTime,
    }
  }

  /**
   * Get list of connected peers
   */
  getConnectedPeers(): PeerInfo[] {
    return Array.from(this.peers.values()).filter(p => p.isConnected)
  }

  /**
   * Get list of all peers in the pool
   */
  getAllPeers(): PeerInfo[] {
    return Array.from(this.peers.values())
  }

  /**
   * Force reconnection to all peers
   */
  async reconnectAll(): Promise<void> {
    console.log('[PeerConnectivity] Forcing reconnection to all peers...')

    const peers = Array.from(this.peers.values())
    await Promise.all(peers.map(peer => this.reconnectPeer(peer)))
  }

  // ==========================================
  // PRIVATE METHODS
  // ==========================================

  private setupTransportListeners(): void {
    // TODO: Implement proper transport event handling with peer identification
    // For now, use stub implementation
    this.transport.addListener(event => {
      console.log('[PeerConnectivity] Transport event:', event.type)
      // Event handling will be implemented when transport supports peer-specific events
    })
  }

  private async loadInitialPeers(): Promise<void> {
    // No bootstrap peers - peers will be added dynamically when user creates channels
    // or connects to known nodes through the UI
    //
    // Future: Could load from:
    // - Cached peer list from previous sessions
    // - DNS bootstrap (lseed.bitcoinstats.com, nodes.lightning.directory)
    // - Well-known public nodes from nodeinfo APIs

    console.log('[PeerConnectivity] No bootstrap peers configured - waiting for user connections')
  }

  private async connectToPeers(): Promise<void> {
    const availablePeers = Array.from(this.peers.values())
      .filter(
        p =>
          !p.isConnected &&
          !p.isConnecting &&
          p.connectionAttempts < this.config.maxReconnectAttempts,
      )
      .slice(0, this.config.maxPeers)

    if (availablePeers.length === 0) {
      console.log('[PeerConnectivity] No peers available for connection')
      return
    }

    console.log(`[PeerConnectivity] Connecting to ${availablePeers.length} peers...`)

    await Promise.all(availablePeers.map(peer => this.connectToPeer(peer)))
  }

  private async connectToPeer(peer: PeerInfo): Promise<void> {
    const peerKey = `${peer.nodeId}@${peer.address}${peer.port ? `:${peer.port}` : ''}`

    // Skip if already connected or connecting
    if (peer.isConnected || peer.isConnecting) {
      console.log(`[PeerConnectivity] Peer ${peerKey} already connected or connecting, skipping`)
      return
    }

    // Mark as connecting to prevent concurrent attempts
    peer.isConnecting = true
    peer.connectionAttempts++

    console.log(
      `[PeerConnectivity] Connecting to peer ${peerKey} (attempt ${peer.connectionAttempts})`,
    )

    try {
      await this.transport.connect(peerKey)
      // Connection success will be handled by transport event listener
      peer.isConnecting = false
    } catch (error) {
      peer.isConnecting = false

      const errorMessage = error instanceof Error ? error.message : String(error)

      // Handle "Already connected or connecting" as a non-error case
      if (errorMessage.includes('Already connected or connecting')) {
        console.log(`[PeerConnectivity] Peer ${peerKey} already connected or connecting`)
        // Assume connection is successful and will be confirmed by transport events
        return
      }

      // Handle connection timeout as a recoverable error
      if (errorMessage.includes('Connection timeout')) {
        console.log(`[PeerConnectivity] Connection timeout for ${peerKey}, will retry`)
        this.handleConnectionFailure(peer)
        return
      }

      // Handle other connection errors
      console.error(`[PeerConnectivity] Failed to connect to ${peerKey}:`, error)
      this.handleConnectionFailure(peer)
    }
  }

  private async disconnectPeer(peer: PeerInfo): Promise<void> {
    const peerKey = `${peer.nodeId}@${peer.address}${peer.port ? `:${peer.port}` : ''}`

    if (!peer.isConnected) return

    try {
      await this.transport.disconnect()
      // Disconnection will be handled by transport event listener
    } catch (error) {
      console.error(`[PeerConnectivity] Error disconnecting from ${peerKey}:`, error)
    }
  }

  private async disconnectAllPeers(): Promise<void> {
    const connectedPeers = this.getConnectedPeers()
    await Promise.all(connectedPeers.map(peer => this.disconnectPeer(peer)))
  }

  private handlePeerConnected(nodeId: string, address: string): void {
    const peer = this.findPeerByNodeId(nodeId)
    if (!peer) return

    peer.isConnected = true
    peer.isConnecting = false
    peer.lastConnected = Date.now()
    peer.connectionAttempts = 0 // Reset on successful connection

    console.log(`[PeerConnectivity] Connected to peer: ${nodeId}@${address}`)

    // Start ping timer for this peer
    this.startPeerPing(peer)

    this.emit('peer_connected', { peer })
  }

  private handlePeerDisconnected(nodeId: string, reason?: string): void {
    const peer = this.findPeerByNodeId(nodeId)
    if (!peer) return

    peer.isConnected = false
    peer.isConnecting = false
    peer.lastDisconnected = Date.now()
    peer.disconnectReason = reason

    console.log(
      `[PeerConnectivity] Disconnected from peer: ${nodeId} (${reason || 'unknown reason'})`,
    )

    // Stop ping timer
    this.stopPeerPing(peer)

    // Schedule reconnect if not at max attempts
    if (peer.connectionAttempts < this.config.maxReconnectAttempts) {
      this.scheduleReconnect(peer)
    }

    this.emit('peer_disconnected', { peer, reason })
  }

  private handlePeerError(nodeId: string, error: Error): void {
    const peer = this.findPeerByNodeId(nodeId)
    if (!peer) return

    console.error(`[PeerConnectivity] Peer error for ${nodeId}:`, error)

    this.emit('peer_failed', { peer, error })
  }

  private handleConnectionFailure(peer: PeerInfo): void {
    peer.isConnecting = false
    peer.lastDisconnected = Date.now()

    if (peer.connectionAttempts >= this.config.maxReconnectAttempts) {
      console.log(
        `[PeerConnectivity] Max reconnection attempts reached for peer ${peer.nodeId}@${peer.address}`,
      )
      this.emit('peer_failed', { peer })
    } else {
      this.scheduleReconnect(peer)
    }
  }

  private scheduleReconnect(peer: PeerInfo): void {
    const peerKey = `${peer.nodeId}@${peer.address}${peer.port ? `:${peer.port}` : ''}`
    const existingTimer = this.reconnectTimers.get(peerKey)

    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(peerKey)
      this.connectToPeer(peer)
    }, this.config.reconnectInterval)

    this.reconnectTimers.set(peerKey, timer as unknown as NodeJS.Timeout)

    console.log(
      `[PeerConnectivity] Scheduled reconnect for ${peerKey} in ${this.config.reconnectInterval}ms`,
    )

    this.emit('peer_reconnecting', { peer })
  }

  private async reconnectPeer(peer: PeerInfo): Promise<void> {
    // Disconnect first if connected
    if (peer.isConnected) {
      await this.disconnectPeer(peer)
    }

    // Reset connection attempts for manual reconnect
    peer.connectionAttempts = 0
    await this.connectToPeer(peer)
  }

  private startPeerPing(peer: PeerInfo): void {
    const peerKey = `${peer.nodeId}@${peer.address}${peer.port ? `:${peer.port}` : ''}`

    const timer = setInterval(async () => {
      if (!peer.isConnected) return

      try {
        // TODO: Implement ping through transport
        // await this.transport.ping(peer.nodeId)
        peer.lastSeen = Date.now()
      } catch (error) {
        console.warn(`[PeerConnectivity] Ping failed for ${peerKey}:`, error)
        // Force disconnect on ping failure
        this.handlePeerDisconnected(peer.nodeId, 'ping failed')
      }
    }, this.config.pingInterval)

    this.pingTimers.set(peerKey, timer as unknown as NodeJS.Timeout)
  }

  private stopPeerPing(peer: PeerInfo): void {
    const peerKey = `${peer.nodeId}@${peer.address}${peer.port ? `:${peer.port}` : ''}`
    const timer = this.pingTimers.get(peerKey)

    if (timer) {
      clearInterval(timer)
      this.pingTimers.delete(peerKey)
    }
  }

  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(() => {
      const status = this.getStatus()
      console.log('[PeerConnectivity] Health check:', status)

      this.emit('health_check', { status })

      // Auto-connect to more peers if below minimum and there are available peers
      if (status.connectedPeers < Math.min(2, this.config.maxPeers)) {
        const availablePeers = Array.from(this.peers.values()).filter(
          p =>
            !p.isConnected &&
            !p.isConnecting &&
            p.connectionAttempts < this.config.maxReconnectAttempts,
        )

        if (availablePeers.length > 0) {
          this.connectToPeers()
        } else {
          console.log('[PeerConnectivity] No available peers for auto-connection')
        }
      }
    }, this.config.healthCheckInterval)
  }

  private stopHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = undefined
    }
  }

  private clearAllTimers(): void {
    // Clear reconnect timers
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer)
    }
    this.reconnectTimers.clear()

    // Clear ping timers
    for (const timer of this.pingTimers.values()) {
      clearInterval(timer)
    }
    this.pingTimers.clear()
  }

  private findPeerByNodeId(nodeId: string): PeerInfo | undefined {
    return Array.from(this.peers.values()).find(p => p.nodeId === nodeId)
  }
}

// ==========================================
// FACTORY FUNCTION
// ==========================================

export function createPeerConnectivityService(
  config?: Partial<PeerConnectivityConfig>,
): PeerConnectivityService {
  return new PeerConnectivityService(config)
}
