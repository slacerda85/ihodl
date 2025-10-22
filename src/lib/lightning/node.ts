/**
 * Lightning Node Implementation
 * Main coordinator for Lightning Network node operations
 */

import { P2PEngine, P2PMessageType } from '../p2p'
import { LightningSecureStorage } from './storage'
import { deriveExtendedLightningKey, deriveNodeKey } from './keys'
import { ElectrumBlockchainClient } from '../blockchain'
import type {
  LightningNode as LightningNodeInfo,
  LightningChannel,
  LightningPayment,
  LightningInvoice,
  OpenChannelParams,
  CreateInvoiceParams,
  Peer,
} from './types'
import type { PeerAddress, P2PMessage } from '../p2p'
import { getRandomValues } from 'expo-crypto'

export interface LightningNodeConfig {
  network: 'mainnet' | 'testnet' | 'regtest'
  listenPort: number
  maxChannels: number
  maxPeers: number
  alias: string
  color: string
}

export class LightningNodeImpl {
  private config: LightningNodeConfig
  private p2pEngine: P2PEngine
  private storage: LightningSecureStorage
  private blockchainClient: ElectrumBlockchainClient
  private nodeKeys: any // Derived keys for this node
  private channels: Map<string, LightningChannel> = new Map()
  private peers: Map<string, Peer> = new Map()
  private payments: LightningPayment[] = []
  private invoices: LightningInvoice[] = []
  private isRunning = false

  constructor(config: LightningNodeConfig) {
    this.config = config

    // Initialize components
    this.storage = new LightningSecureStorage({ namespace: 'node' })
    this.p2pEngine = new P2PEngine({
      maxConnections: config.maxPeers,
      listenPort: config.listenPort,
      enableTLS: true,
    })
    this.blockchainClient = new ElectrumBlockchainClient({
      network: config.network,
    })

    // Set up P2P message handlers
    this.setupMessageHandlers()
  }

  /**
   * Initialize the Lightning node
   */
  async initialize(): Promise<void> {
    console.log('[LightningNode] Initializing node...')

    // Initialize storage
    await this.storage.initialize()

    // Load or generate node keys
    await this.initializeNodeKeys()

    // Initialize blockchain client
    await this.blockchainClient.getBlockHeight()

    // Load persisted state
    await this.loadNodeState()

    console.log('[LightningNode] Node initialized successfully')
  }

  /**
   * Start the Lightning node
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[LightningNode] Node is already running')
      return
    }

    console.log('[LightningNode] Starting Lightning node...')

    try {
      // Start P2P engine
      await this.p2pEngine.discoverAndConnect(5)

      // Start listening for connections
      // TODO: Implement listening functionality in P2P engine

      this.isRunning = true
      console.log('[LightningNode] Lightning node started successfully')
    } catch (error) {
      console.error('[LightningNode] Failed to start node:', error)
      throw error
    }
  }

  /**
   * Stop the Lightning node
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.warn('[LightningNode] Node is not running')
      return
    }

    console.log('[LightningNode] Stopping Lightning node...')

    try {
      // Close all channels cooperatively
      for (const [channelId, channel] of this.channels) {
        if (channel.active) {
          await this.closeChannel(channelId, false)
        }
      }

      // Shutdown P2P engine
      await this.p2pEngine.shutdown()

      // Save state
      await this.saveNodeState()

      this.isRunning = false
      console.log('[LightningNode] Lightning node stopped successfully')
    } catch (error) {
      console.error('[LightningNode] Error stopping node:', error)
      throw error
    }
  }

  async getInfo(): Promise<LightningNodeInfo> {
    return {
      pubKey: this.nodeKeys.publicKey.toString('hex'),
      alias: this.config.alias,
      color: this.config.color,
      numChannels: this.channels.size,
      totalCapacity: Array.from(this.channels.values()).reduce(
        (total, channel) => total + channel.capacity,
        0,
      ),
      lastUpdate: Date.now(),
      addresses: [
        {
          network: 'tcp',
          addr: `127.0.0.1:${this.config.listenPort}`,
        },
      ],
      features: {
        0: { name: 'data-loss-protect', isKnown: true, isRequired: false },
        5: { name: 'upfront-shutdown-script', isKnown: true, isRequired: false },
        7: { name: 'gossip-queries', isKnown: true, isRequired: false },
        9: { name: 'tlv-onion', isKnown: true, isRequired: false },
        12: { name: 'static-remote-key', isKnown: true, isRequired: false },
        14: { name: 'payment-addr', isKnown: true, isRequired: false },
        17: { name: 'anchors', isKnown: true, isRequired: false },
      },
    }
  }

  /**
   * List all channels
   */
  async listChannels(): Promise<LightningChannel[]> {
    return Array.from(this.channels.values())
  }

  /**
   * Get a specific channel
   */
  async getChannel(channelId: string): Promise<LightningChannel | null> {
    return this.channels.get(channelId) || null
  }

  /**
   * Open a new channel
   */
  async openChannel(params: OpenChannelParams): Promise<{ channelId: string }> {
    console.log(`[LightningNode] Opening channel to ${params.nodePubkey}`)

    try {
      // Connect to peer first
      const peerAddress: PeerAddress = {
        host: params.nodePubkey, // This should be resolved to IP
        port: 9735, // Default Lightning port
        pubkey: params.nodePubkey,
      }

      await this.p2pEngine.connect(peerAddress)

      // Generate channel ID
      const channelId = this.generateChannelId()

      // Create channel object
      const channel: LightningChannel = {
        channelId,
        channelPoint: '', // Will be set after funding
        localBalance: params.localFundingAmount - (params.pushSat || 0),
        remoteBalance: params.pushSat || 0,
        capacity: params.localFundingAmount,
        remotePubkey: params.nodePubkey,
        status: 'pending_open',
        channelType: 'anchors',
        numConfirmations: 0,
        commitmentType: params.commitmentType || 'anchors',
        private: params.private || false,
        initiator: true,
        feePerKw: 0,
        unsettledBalance: 0,
        totalSatoshisSent: 0,
        totalSatoshisReceived: 0,
        numUpdates: 0,
        pendingHtlcs: [],
        csvDelay: 144,
        active: false,
        lifecycleState: 'opening',
      }

      // Store channel
      this.channels.set(channelId, channel)

      // TODO: Send open_channel message via P2P
      // TODO: Handle funding transaction
      // TODO: Wait for confirmations

      console.log(`[LightningNode] Channel ${channelId} opening initiated`)
      return { channelId }
    } catch (error) {
      console.error('[LightningNode] Failed to open channel:', error)
      throw error
    }
  }

  /**
   * Close a channel
   */
  async closeChannel(channelId: string, force: boolean = false): Promise<void> {
    const channel = this.channels.get(channelId)
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`)
    }

    console.log(`[LightningNode] ${force ? 'Force' : 'Cooperative'} closing channel ${channelId}`)

    // Update channel status
    channel.status = 'closing'
    channel.lifecycleState = 'closing'
    channel.active = false

    // TODO: Send shutdown/close messages via P2P
    // TODO: Handle closing transaction

    // Remove channel after closing
    this.channels.delete(channelId)

    console.log(`[LightningNode] Channel ${channelId} closed`)
  }

  /**
   * Create an invoice
   */
  async createInvoice(params: CreateInvoiceParams): Promise<LightningInvoice> {
    // Generate payment hash
    const paymentHash = this.generatePaymentHash()

    const invoice: LightningInvoice = {
      paymentRequest: this.generatePaymentRequest(paymentHash, params),
      paymentHash,
      amount: params.amount,
      description: params.description,
      expiry: params.expiry || 3600,
      timestamp: Date.now(),
      payeePubKey: this.nodeKeys.publicKey.toString('hex'),
      minFinalCltvExpiry: 144,
      routingHints: [],
      features: [],
      signature: '', // TODO: Sign invoice
    }

    // Store invoice
    this.invoices.push(invoice)

    console.log(`[LightningNode] Invoice created: ${paymentHash}`)
    return invoice
  }

  /**
   * Pay an invoice
   */
  async payInvoice(paymentRequest: string): Promise<any> {
    console.log(`[LightningNode] Paying invoice: ${paymentRequest}`)

    // TODO: Parse payment request
    // TODO: Find route
    // TODO: Send HTLC

    throw new Error('Payment functionality not yet implemented')
  }

  /**
   * List payments
   */
  async listPayments(): Promise<LightningPayment[]> {
    return this.payments
  }

  /**
   * List invoices
   */
  async listInvoices(): Promise<LightningInvoice[]> {
    return this.invoices
  }

  /**
   * Connect to a peer
   */
  async connectPeer(pubkey: string, host: string): Promise<void> {
    const peerAddress: PeerAddress = {
      host,
      port: 9735,
      pubkey,
    }

    await this.p2pEngine.connect(peerAddress)
    console.log(`[LightningNode] Connected to peer ${pubkey}`)
  }

  /**
   * Disconnect from a peer
   */
  async disconnectPeer(pubkey: string): Promise<void> {
    // Find connection for this peer
    const connections = this.p2pEngine.getConnections()
    const connection = connections.find(conn => conn.peerAddress.pubkey === pubkey)

    if (connection) {
      await this.p2pEngine.disconnect(connection.id)
      console.log(`[LightningNode] Disconnected from peer ${pubkey}`)
    }
  }

  /**
   * List peers
   */
  async listPeers(): Promise<Peer[]> {
    return Array.from(this.peers.values())
  }

  /**
   * Get network statistics
   */
  getNetworkStats(): {
    channels: number
    peers: number
    capacity: number
    status: string
  } {
    const totalCapacity = Array.from(this.channels.values()).reduce(
      (total, channel) => total + channel.capacity,
      0,
    )

    return {
      channels: this.channels.size,
      peers: this.peers.size,
      capacity: totalCapacity,
      status: this.isRunning ? 'online' : 'offline',
    }
  }

  // Private methods

  private async initializeNodeKeys(): Promise<void> {
    // Try to load existing seed
    let seed = await this.storage.getNodeSeed()

    if (!seed) {
      // Generate new seed
      seed = getRandomValues(new Uint8Array(64))
      await this.storage.storeNodeSeed(seed)
    }

    // Derive node keys
    const extendedKey = deriveExtendedLightningKey(seed)
    this.nodeKeys = deriveNodeKey(extendedKey, 0, 0) // Purpose 0, account 0
  }

  private async loadNodeState(): Promise<void> {
    // Load channels
    const storedChannels = await this.storage.getChannels()
    storedChannels.forEach(channel => {
      this.channels.set(channel.channelId, channel)
    })

    // Load peers
    const storedPeers = await this.storage.getPeers()
    storedPeers.forEach(peer => {
      this.peers.set(peer.pubKey, peer)
    })

    console.log(
      `[LightningNode] Loaded ${this.channels.size} channels and ${this.peers.size} peers`,
    )
  }

  private async saveNodeState(): Promise<void> {
    // Save channels
    await this.storage.storeChannels(Array.from(this.channels.values()))

    // Save peers
    await this.storage.storePeers(Array.from(this.peers.values()))

    console.log('[LightningNode] Node state saved')
  }

  private setupMessageHandlers(): void {
    this.p2pEngine.onMessage((connectionId: string, message: P2PMessage) => {
      this.handleP2PMessage(connectionId, message)
    })
  }

  private handleP2PMessage(connectionId: string, message: P2PMessage): void {
    console.log(`[LightningNode] Received message type ${message.type} from ${connectionId}`)

    switch (message.type) {
      case P2PMessageType.INIT:
        this.handleInitMessage(connectionId, message)
        break
      case P2PMessageType.OPEN_CHANNEL:
        this.handleOpenChannelMessage(connectionId, message)
        break
      case P2PMessageType.UPDATE_ADD_HTLC:
        this.handleUpdateAddHtlcMessage(connectionId, message)
        break
      // TODO: Handle other message types
      default:
        console.log(`[LightningNode] Unhandled message type: ${message.type}`)
    }
  }

  private handleInitMessage(connectionId: string, message: P2PMessage): void {
    // TODO: Process init message and respond
    console.log('[LightningNode] Handling INIT message')
  }

  private handleOpenChannelMessage(connectionId: string, message: P2PMessage): void {
    // TODO: Process channel opening
    console.log('[LightningNode] Handling OPEN_CHANNEL message')
  }

  private handleUpdateAddHtlcMessage(connectionId: string, message: P2PMessage): void {
    // TODO: Process HTLC addition
    console.log('[LightningNode] Handling UPDATE_ADD_HTLC message')
  }

  private generateChannelId(): string {
    // Generate a temporary channel ID
    // In production, this would be derived from funding transaction
    return `channel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private generatePaymentHash(): string {
    const hash = crypto.getRandomValues(new Uint8Array(32))
    return hash.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '')
  }

  private generatePaymentRequest(paymentHash: string, params: CreateInvoiceParams): string {
    // TODO: Generate proper BOLT 11 invoice
    return `lnbc${params.amount}...${paymentHash}`
  }
}
