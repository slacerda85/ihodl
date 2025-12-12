// Peer Connectivity Service
// Manages persistent Lightning Network peer connections
// Implements auto-reconnect, connection pooling, and health monitoring

import EventEmitter from 'eventemitter3'
import lightningRepository, { PersistedPeer } from '../repositories/lightning'
import { walletService } from './wallet'
import SeedService from './seed'
import KeyService from './key'
import {
  TcpTransport,
  TcpTransportEvent,
  TcpConnectionState,
} from '@/core/lib/lightning/tcpTransport'
import { getNodeKey } from '@/core/lib/lightning/keys'
import { createPublicKey, splitMasterKey } from '@/core/lib/key'
import type { KeyPair } from '@/core/models/lightning/transport'
import { performInitExchange } from './ln-transport-service'
import { uint8ArrayToHex } from '@/core/lib/utils/utils'
import { getBootstrapPeers } from '@/core/lib/lightning/dns-bootstrap'

interface PeerRepository {
  savePeer(peer: PersistedPeer): void
  findPeerById(nodeId: string): PersistedPeer | null
  getPeersByReliability(): PersistedPeer[]
  getLastPeerUpdate(): number | null
  setLastPeerUpdate(timestamp: number): void
  savePeerStats(nodeId: string, stats: Partial<PersistedPeer>): void
  getPeerStats(nodeId: string): PersistedPeer | null
  findAllChannels(): Record<string, any>
}

export type { PeerRepository }

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
  peerCacheMaxAge: number // Max age of peer cache in ms (24h default)
  peerCacheLimit: number // Max number of cached peers to load (LRU)
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
  peerCacheMaxAge: 24 * 60 * 60 * 1000, // 24 hours
  peerCacheLimit: 50, // LRU cache limit for cached peers
}

// Trampoline (ACINQ) prioritized for MVP routing
const TRAMPOLINE_NODE = {
  nodeId: '03933884aaf1d6b108397e5efe5c86bcf2d8ca8d2f700eda99db9214fc2712b134',
  address: '13.248.222.197',
  onionHost: 'iq7zhmhck54vcax2vlrdcavq2m32wao7ekh6jyeglmnuuvv3js57r4id.onion',
  port: 9735,
  name: 'ACINQ Trampoline',
}

// Well-known public Lightning nodes for bootstrap
// These are reliable, well-connected nodes that are good starting points
const BOOTSTRAP_PEERS: { nodeId: string; address: string; port: number; name: string }[] = [
  // ACINQ (Phoenix, Eclair)
  {
    nodeId: '03864ef025fde8fb587d989186ce6a4a186895ee44a926bfc370e2c366597a3f8f',
    address: '34.239.230.56',
    port: 9735,
    name: 'ACINQ',
  },
  // Wallet of Satoshi
  {
    nodeId: '035e4ff418fc8b5554c5d9eea66396c227bd429a3251c8cbc711002ba215bfc226',
    address: '170.75.163.209',
    port: 9735,
    name: 'WalletOfSatoshi',
  },
  // Kraken
  {
    nodeId: '02f1a8c87607f415c8f22c00593002775941dea48869ce23096af27b0cfdcc0b69',
    address: '52.13.118.208',
    port: 9735,
    name: 'Kraken',
  },
  // River Financial
  {
    nodeId: '03037dc08e9ac63b82581f79b662a4d0ceca8a8ca162b1af3551595b452a302d0f',
    address: '54.187.31.40',
    port: 9735,
    name: 'River',
  },
  // Bitfinex
  {
    nodeId: '033d8656219478701227199cbd6f670335c8d408a92ae88b962c49d4dc0e83e025',
    address: '34.65.85.39',
    port: 9735,
    name: 'Bitfinex',
  },
]

// ==========================================
// PEER CONNECTIVITY SERVICE
// ==========================================

export class PeerConnectivityService extends EventEmitter {
  private config: PeerConnectivityConfig
  private peers: Map<string, PeerInfo> = new Map()
  private peerTransports: Map<string, TcpTransport> = new Map()
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map()
  private healthCheckTimer?: number | NodeJS.Timeout
  private startTime: number = Date.now()
  private isRunning: boolean = false
  private localKeyPair: KeyPair | null = null
  private repository: PeerRepository
  private pingTimers: Map<string, NodeJS.Timeout> = new Map()

  constructor(config: Partial<PeerConnectivityConfig> = {}, repository?: PeerRepository) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.repository = repository || lightningRepository
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

    // Save connected peers to cache before stopping
    this.savePeersToCache()

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

  // Local node keypair derived from stored seed; computed lazily on first use
  private ensureLocalKeyPair(): KeyPair {
    if (this.localKeyPair) return this.localKeyPair

    const walletId = walletService.getActiveWalletId()
    if (!walletId) {
      throw new Error('No active wallet to derive Lightning node key')
    }

    const seedService = new SeedService()
    const keyService = new KeyService()

    const mnemonic = seedService.getSeed(walletId)
    const masterKey = keyService.createMasterKey(mnemonic)
    const nodeExtendedKey = getNodeKey(masterKey, 0)
    const { privateKey } = splitMasterKey(nodeExtendedKey)
    const publicKey = createPublicKey(privateKey)

    this.localKeyPair = {
      priv: privateKey,
      pub: publicKey,
      serializeCompressed: () => publicKey,
    }

    return this.localKeyPair
  }

  /**
   * Cria (ou reutiliza) transporte TCP para um peer específico
   */
  private createTransportForPeer(peer: PeerInfo): TcpTransport {
    const peerKey = `${peer.nodeId}@${peer.address}${peer.port ? `:${peer.port}` : ''}`

    const existing = this.peerTransports.get(peerKey)
    if (existing) {
      return existing
    }

    const transport = new TcpTransport({
      localKeyPair: this.ensureLocalKeyPair(),
      autoReconnect: false, // reconexão é gerenciada pelo PeerConnectivityService
      pingInterval: this.config.pingInterval,
    })

    transport.addListener('transport', event => {
      this.handleTransportEvent(peer, peerKey, transport, event)
    })

    this.peerTransports.set(peerKey, transport)
    return transport
  }

  /**
   * Manipula eventos emitidos pelo TcpTransport
   */
  private handleTransportEvent(
    peer: PeerInfo,
    peerKey: string,
    transport: TcpTransport,
    event: TcpTransportEvent,
  ): void {
    switch (event.type) {
      case 'connected': {
        // Após Noise handshake (TcpTransport), executar troca de init (BOLT #1)
        this.performInitWithPeer(peer, transport).catch(error => {
          console.error(`[PeerConnectivity] Init handshake failed for ${peerKey}:`, error)
          transport.disconnect().catch(() => {})
          this.handlePeerDisconnected(peer.nodeId, 'init_failed')
        })
        break
      }
      case 'disconnected': {
        this.handlePeerDisconnected(peer.nodeId, event.reason)
        this.peerTransports.delete(peerKey)
        break
      }
      case 'error': {
        this.handlePeerError(peer.nodeId, event.error)
        this.peerTransports.delete(peerKey)
        break
      }
      case 'message': {
        peer.lastSeen = Date.now()
        break
      }
      default:
        break
    }
  }

  /**
   * Load initial peers from multiple sources (similar to Electrum client)
   * Priority: 1. Cached peers from previous sessions
   *           2. Peers from channels (need to stay connected)
   *           3. Bootstrap well-known nodes
   */
  private async loadInitialPeers(): Promise<void> {
    console.log('[PeerConnectivity] Loading initial peers...')

    const loadedPeers: Set<string> = new Set()

    // 0. Prioritize trampoline node
    const trampolineKey = `${TRAMPOLINE_NODE.nodeId}@${TRAMPOLINE_NODE.address}:${TRAMPOLINE_NODE.port}`
    this.addPeer(TRAMPOLINE_NODE.nodeId, TRAMPOLINE_NODE.address, TRAMPOLINE_NODE.port)
    loadedPeers.add(trampolineKey)

    // 1. Load cached peers from repository (peers that were successfully connected before)
    try {
      const cachedPeers = this.repository.getPeersByReliability()
      const lastUpdate = this.repository.getLastPeerUpdate()
      const cacheAge = lastUpdate ? Date.now() - lastUpdate : Infinity

      if (cachedPeers.length > 0 && cacheAge < this.config.peerCacheMaxAge) {
        console.log(
          `[PeerConnectivity] Found ${cachedPeers.length} cached peers (age: ${Math.round(cacheAge / 1000 / 60)}min)`,
        )

        // Add cached peers first (they have proven reliability)
        // Use LRU: limit to peerCacheLimit (50) but only add up to maxPeers for initial connections
        const peersToLoad = Math.min(cachedPeers.length, this.config.peerCacheLimit)
        for (const peer of cachedPeers.slice(0, peersToLoad)) {
          const peerKey = `${peer.nodeId}@${peer.host}:${peer.port}`
          if (!loadedPeers.has(peerKey)) {
            this.addPeer(peer.nodeId, peer.host, peer.port)
            loadedPeers.add(peerKey)
          }
        }
      }
    } catch (error) {
      console.warn('[PeerConnectivity] Failed to load cached peers:', error)
    }

    // 2. Load peers from existing channels (must stay connected for channel operations)
    try {
      const channels = this.repository.findAllChannels()
      const channelPeers = Object.values(channels)
        .filter((ch: any) => ch.nodeId && ch.state !== 'closed')
        .map((ch: any) => {
          const persistedPeer = this.repository.findPeerById(ch.nodeId)
          return persistedPeer
        })
        .filter((p): p is PersistedPeer => p !== null)

      if (channelPeers.length > 0) {
        console.log(`[PeerConnectivity] Found ${channelPeers.length} peers from channels`)

        for (const peer of channelPeers) {
          const peerKey = `${peer.nodeId}@${peer.host}:${peer.port}`
          if (!loadedPeers.has(peerKey)) {
            this.addPeer(peer.nodeId, peer.host, peer.port)
            loadedPeers.add(peerKey)
          }
        }
      }
    } catch (error) {
      console.warn('[PeerConnectivity] Failed to load channel peers:', error)
    }

    // 3. Add bootstrap peers if we don't have enough beyond trampoline
    if (loadedPeers.size < Math.max(2, this.config.maxPeers)) {
      console.log('[PeerConnectivity] Adding bootstrap peers for initial connectivity...')

      // Shuffle bootstrap peers to avoid always hitting the same ones first
      const shuffledBootstrap = [...BOOTSTRAP_PEERS].sort(() => Math.random() - 0.5)

      for (const peer of shuffledBootstrap) {
        const peerKey = `${peer.nodeId}@${peer.address}:${peer.port}`
        if (!loadedPeers.has(peerKey) && loadedPeers.size < this.config.maxPeers) {
          console.log(`[PeerConnectivity] Adding bootstrap peer: ${peer.name}`)
          this.addPeer(peer.nodeId, peer.address, peer.port)
          loadedPeers.add(peerKey)
        }
      }
    }

    // 4. Try DNS bootstrap as last resort if we still don't have enough peers
    if (loadedPeers.size < Math.max(3, this.config.maxPeers)) {
      console.log('[PeerConnectivity] Attempting DNS bootstrap for additional peers...')

      try {
        const dnsPeers = await getBootstrapPeers()

        if (dnsPeers.length > 0) {
          console.log(`[PeerConnectivity] Found ${dnsPeers.length} peers via DNS bootstrap`)

          // Add DNS-discovered peers (limit to avoid too many)
          const maxDnsPeers = Math.min(5, this.config.maxPeers - loadedPeers.size)

          for (const peer of dnsPeers.slice(0, maxDnsPeers)) {
            if (peer.nodeId) {
              const peerKey = `${uint8ArrayToHex(peer.nodeId)}@${peer.host}:${peer.port}`
              if (!loadedPeers.has(peerKey)) {
                console.log(`[PeerConnectivity] Adding DNS peer: ${peer.host}:${peer.port}`)
                this.addPeer(uint8ArrayToHex(peer.nodeId), peer.host, peer.port)
                loadedPeers.add(peerKey)
              }
            }
          }
        } else {
          console.log('[PeerConnectivity] No peers found via DNS bootstrap')
        }
      } catch (error) {
        console.warn('[PeerConnectivity] DNS bootstrap failed:', error)
      }
    }

    console.log(`[PeerConnectivity] Loaded ${loadedPeers.size} initial peers`)
  }

  /**
   * Save current peer state to repository for future sessions
   */
  private savePeersToCache(): void {
    try {
      const connectedPeers = this.getConnectedPeers()

      for (const peer of connectedPeers) {
        this.repository.savePeer({
          nodeId: peer.nodeId,
          host: peer.address,
          port: peer.port || 9735,
          pubkey: peer.nodeId,
          lastConnected: peer.lastConnected || Date.now(),
          features: peer.features,
        })

        const currentStats = this.repository.getPeerStats(peer.nodeId)

        this.repository.savePeerStats(peer.nodeId, {
          nodeId: peer.nodeId,
          host: peer.address,
          port: peer.port || 9735,
          pubkey: peer.nodeId,
          lastConnected: peer.lastConnected || Date.now(),
          score: currentStats?.score || 0, // Preserve existing score
        })
      }

      this.repository.setLastPeerUpdate(Date.now())
      console.log(`[PeerConnectivity] Saved ${connectedPeers.length} peers to cache`)
    } catch (error) {
      console.error('[PeerConnectivity] Failed to save peers to cache:', error)
    }
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

    // Reuse existing transport if available
    const existingTransport = this.peerTransports.get(peerKey)
    if (existingTransport) {
      const state = existingTransport.getState()
      if (state === TcpConnectionState.CONNECTED || state === TcpConnectionState.HANDSHAKING) {
        console.log(
          `[PeerConnectivity] Transport for ${peerKey} already active (${state}), skipping`,
        )
        return
      }
    }

    // Mark as connecting to prevent concurrent attempts
    peer.isConnecting = true
    peer.connectionAttempts++

    console.log(
      `[PeerConnectivity] Connecting to peer ${peerKey} (attempt ${peer.connectionAttempts})`,
    )

    try {
      const transport = this.createTransportForPeer(peer)
      await transport.connect(peer.nodeId, peer.address, peer.port || 9735)
      // Success path handled via transport event listener
      peer.isConnecting = false
    } catch (error) {
      peer.isConnecting = false

      const errorMessage = error instanceof Error ? error.message : String(error)

      // Handle connection timeout as a recoverable error
      if (errorMessage.includes('Connection timeout')) {
        console.log(`[PeerConnectivity] Connection timeout for ${peerKey}, will retry`)
        this.handleConnectionFailure(peer)
        return
      }

      console.error(`[PeerConnectivity] Failed to connect to ${peerKey}:`, error)
      this.handleConnectionFailure(peer)
    }
  }

  private async disconnectPeer(peer: PeerInfo): Promise<void> {
    const peerKey = `${peer.nodeId}@${peer.address}${peer.port ? `:${peer.port}` : ''}`

    if (!peer.isConnected) return

    try {
      const transport = this.peerTransports.get(peerKey)
      if (transport) {
        await transport.disconnect()
      }
    } catch (error) {
      console.error(`[PeerConnectivity] Error disconnecting from ${peerKey}:`, error)
    }
  }

  private async disconnectAllPeers(): Promise<void> {
    const connectedPeers = this.getConnectedPeers()
    await Promise.all(connectedPeers.map(peer => this.disconnectPeer(peer)))
    this.peerTransports.clear()
  }

  private handlePeerConnected(nodeId: string, address: string): void {
    const peer = this.findPeerByNodeId(nodeId)
    if (!peer) return

    peer.isConnected = true
    peer.isConnecting = false
    peer.lastConnected = Date.now()
    peer.connectionAttempts = 0 // Reset on successful connection

    console.log(`[PeerConnectivity] Connected to peer: ${nodeId}@${address}`)

    // Save peer to cache for future sessions
    this.savePeerToRepository(peer)

    this.emit('peer_connected', { peer })
  }

  /**
   * Realiza troca de init (BOLT #1) após o handshake TCP (BOLT #8)
   */
  private async performInitWithPeer(peer: PeerInfo, transport: TcpTransport): Promise<void> {
    // Marcar ainda como connecting até concluir init
    peer.isConnecting = true

    try {
      const { negotiatedFeatures } = await performInitExchange(transport)

      peer.features = uint8ArrayToHex(negotiatedFeatures)
      peer.isConnected = true
      peer.isConnecting = false
      peer.lastConnected = Date.now()
      peer.connectionAttempts = 0

      console.log(
        `[PeerConnectivity] Connected to peer with negotiated features: ${peer.nodeId}@${peer.address}`,
      )

      this.incrementPeerScore(peer)
      this.savePeerToRepository(peer)
      this.emit('peer_connected', { peer })
    } catch (error) {
      peer.isConnecting = false
      peer.isConnected = false
      throw error
    }
  }

  /**
   * Increment peer score on successful connection
   */
  private incrementPeerScore(peer: PeerInfo): void {
    try {
      const currentStats = this.repository.getPeerStats(peer.nodeId)
      const currentScore = currentStats?.score || 0
      const newScore = Math.min(currentScore + 1, 100) // Cap at 100

      this.repository.savePeerStats(peer.nodeId, {
        score: newScore,
      })

      console.log(
        `[PeerConnectivity] Incremented score for peer ${peer.nodeId}: ${currentScore} -> ${newScore}`,
      )
    } catch (error) {
      console.warn('[PeerConnectivity] Failed to increment peer score:', error)
    }
  }

  /**
   * Decrement peer score on connection failure
   */
  private decrementPeerScore(peer: PeerInfo): void {
    try {
      const currentStats = this.repository.getPeerStats(peer.nodeId)
      const currentScore = currentStats?.score || 0
      const newScore = Math.max(currentScore - 1, -10) // Floor at -10

      this.repository.savePeerStats(peer.nodeId, {
        score: newScore,
      })

      console.log(
        `[PeerConnectivity] Decremented score for peer ${peer.nodeId}: ${currentScore} -> ${newScore}`,
      )
    } catch (error) {
      console.warn('[PeerConnectivity] Failed to decrement peer score:', error)
    }
  }

  /**
   * Save a single peer to repository
   */
  private savePeerToRepository(peer: PeerInfo): void {
    try {
      this.repository.savePeer({
        nodeId: peer.nodeId,
        host: peer.address,
        port: peer.port || 9735,
        pubkey: peer.nodeId,
        lastConnected: peer.lastConnected || Date.now(),
        features: peer.features,
      })

      const currentStats = this.repository.getPeerStats(peer.nodeId)

      this.repository.savePeerStats(peer.nodeId, {
        nodeId: peer.nodeId,
        host: peer.address,
        port: peer.port || 9735,
        pubkey: peer.nodeId,
        lastConnected: peer.lastConnected || Date.now(),
        score: currentStats?.score || 0, // Preserve existing score
      })

      this.repository.setLastPeerUpdate(Date.now())
    } catch (error) {
      console.warn('[PeerConnectivity] Failed to save peer to repository:', error)
    }
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
    // Decrement score on connection failure
    this.decrementPeerScore(peer)

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

    // Calculate exponential backoff delay based on connection attempts
    // Phoenix-style timeouts: 1s → 2s → 4s → 7s → 10s (normal)
    // Tor timeouts: 3s → 6s → 12s → 21s → 30s (future implementation)
    const attempt = Math.min(peer.connectionAttempts, 4) // Cap at 5th attempt
    const baseDelays = [1000, 2000, 4000, 7000, 10000] // Normal timeouts in ms
    const delay = baseDelays[attempt] || 10000 // Default to 10s for attempts > 4

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(peerKey)
      this.connectToPeer(peer)
    }, delay)

    this.reconnectTimers.set(peerKey, timer as unknown as NodeJS.Timeout)

    console.log(
      `[PeerConnectivity] Scheduled reconnect for ${peerKey} in ${delay}ms (attempt ${peer.connectionAttempts + 1})`,
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

  // Ping/pong é gerenciado na camada de transporte (BOLT #1) dentro do TcpTransport

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
