// Lightning Network Wallet Integration
// Main class that ties together all Lightning components

import { LNTransport, LNPeerAddr } from './lntransport'
import { ChannelState, createChannel, transitionChannel } from './channels'
import { uint8ArrayToHex } from '../utils'
import { ChannelMonitor } from '../../features/lightning/monitor'
import { IBlockchainClient } from '../blockchain/types'
import { get, set } from '@/lib/storage'
import { randomUUID } from '@/lib/crypto'

export interface LNWalletConfig {
  nodeId: string
  nodePrivateKey: Uint8Array
  nodePublicKey: Uint8Array
  electrumServer?: string
  maxChannels?: number
  autoReconnect?: boolean
  blockchainClient?: IBlockchainClient
}

export interface LNChannelInfo {
  channelId: string
  peerNodeId: string
  state: string
  localBalance: number
  remoteBalance: number
  capacity: number
}

export interface LNInvoice {
  bolt11: string
  amountMsat?: number
  description?: string
  paymentHash: string
  expiry: number
  timestamp: number
}

export class LNWallet {
  private config: LNWalletConfig
  private channels: Map<string, ChannelState> = new Map()
  private peers: Map<string, LNTransport> = new Map()
  private isInitialized = false
  private isRunning = false
  private blockchainClient: IBlockchainClient

  constructor(config: LNWalletConfig) {
    this.config = config
    this.blockchainClient = config.blockchainClient!
  }

  // Initialize the wallet
  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      // Load persisted channels
      await this.loadChannels()

      // Start channel monitoring
      await ChannelMonitor.start()

      this.isInitialized = true
      console.log('[LNWallet] Initialized successfully')
    } catch (error) {
      console.error('[LNWallet] Initialization failed:', error)
      throw error
    }
  }

  // Start the wallet (connect to peers, etc.)
  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    if (this.isRunning) return

    try {
      // Reconnect to active channels
      await this.reconnectActiveChannels()

      this.isRunning = true
      console.log('[LNWallet] Started successfully')
    } catch (error) {
      console.error('[LNWallet] Start failed:', error)
      throw error
    }
  }

  // Stop the wallet
  async stop(): Promise<void> {
    if (!this.isRunning) return

    try {
      // Close all peer connections
      for (const [, transport] of this.peers) {
        await transport.close()
      }
      this.peers.clear()

      // Stop monitoring
      await ChannelMonitor.stop()

      this.isRunning = false
      console.log('[LNWallet] Stopped successfully')
    } catch (error) {
      console.error('[LNWallet] Stop failed:', error)
      throw error
    }
  }

  // Create a new channel
  async createChannel(
    peerAddress: LNPeerAddr,
    fundingAmount: number,
    pushAmount: number = 0,
  ): Promise<string> {
    const channelId = randomUUID()

    // Create initial channel state
    const channel = createChannel(
      channelId,
      uint8ArrayToHex(peerAddress.pubkey),
      this.generateFundingPubkey(),
      '02' + Math.random().toString(16).substr(2, 62), // Mock remote pubkey
      this.generatePaymentBasepoint(),
      '03' + Math.random().toString(16).substr(2, 62), // Mock remote payment basepoint
    )

    // Store channel
    this.channels.set(channelId, channel)
    await this.saveChannels()

    // TODO: Implement actual channel opening protocol
    // This would involve:
    // 1. Connect to peer
    // 2. Send open_channel message
    // 3. Exchange funding information
    // 4. Create and broadcast funding transaction

    console.log(`[LNWallet] Created channel ${channelId} with peer ${peerAddress.pubkey}`)
    return channelId
  }

  // Close a channel
  async closeChannel(channelId: string, force: boolean = false): Promise<void> {
    const channel = this.channels.get(channelId)
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`)
    }

    if (force) {
      // Force close - broadcast commitment transaction immediately
      const commitmentTx = await this.createCommitmentTransaction(channelId, true)
      console.log(`[LNWallet] Broadcasting commitment transaction for force close:`, commitmentTx)
      // TODO: Broadcast transaction via Electrum SPV
      console.log(`[LNWallet] Force closing channel ${channelId}`)
    } else {
      // Mutual close
      // TODO: Implement mutual close protocol
      console.log(`[LNWallet] Initiating mutual close for channel ${channelId}`)
    }

    // Update channel state
    const updatedChannel = transitionChannel(channel, 'shutdown_sent')
    this.channels.set(channelId, updatedChannel)
    await this.saveChannels()
  }

  // Send payment
  async sendPayment(invoice: string): Promise<string> {
    // TODO: Parse invoice and find route
    // TODO: Create HTLCs along the route
    // TODO: Monitor payment progress

    const paymentId = randomUUID()
    console.log(`[LNWallet] Sending payment ${paymentId} for invoice ${invoice}`)
    return paymentId
  }

  // Generate invoice
  async generateInvoice(
    amountMsat?: number,
    description?: string,
    expirySeconds: number = 3600,
  ): Promise<LNInvoice> {
    // Convert msat to sat if provided
    const amountSat = amountMsat ? Math.floor(amountMsat / 1000) : undefined

    // Use the concrete implementation from index.ts
    const { generateInvoice } = await import('./index.ts')
    const invoice = await generateInvoice(
      amountSat || 0,
      description,
      expirySeconds,
      'mainnet', // Use mainnet for production
      // TODO: Pass actual private key from wallet
    )

    return {
      bolt11: invoice.paymentRequest,
      amountMsat,
      description,
      paymentHash: invoice.paymentHash,
      expiry: invoice.expiry,
      timestamp: invoice.timestamp,
    }
  }

  // Get channel information
  getChannels(): LNChannelInfo[] {
    return Array.from(this.channels.values()).map(channel => ({
      channelId: channel.id,
      peerNodeId: channel.peerNodeId,
      state: channel.state,
      localBalance: channel.localBalance,
      remoteBalance: channel.remoteBalance,
      capacity: channel.localBalance + channel.remoteBalance,
    }))
  }

  // Get wallet balance
  getBalance(): { local: number; remote: number; total: number } {
    let local = 0
    let remote = 0

    for (const channel of this.channels.values()) {
      if (channel.state === 'open') {
        local += channel.localBalance
        remote += channel.remoteBalance
      }
    }

    return {
      local,
      remote,
      total: local + remote,
    }
  }

  // Broadcast funding transaction
  async broadcastFundingTransaction(channelId: string, rawTxHex: string): Promise<string> {
    try {
      const txid = await this.blockchainClient.broadcastTransaction(rawTxHex)
      console.log(`[LNWallet] Funding transaction broadcasted for channel ${channelId}: ${txid}`)

      // Update channel state with funding txid
      const channel = this.channels.get(channelId)
      if (channel) {
        const updatedChannel = transitionChannel(channel, 'funding_created', { fundingTxId: txid })
        this.channels.set(channelId, updatedChannel)
        await this.saveChannels()
      }

      return txid
    } catch (error) {
      console.error(
        `[LNWallet] Failed to broadcast funding transaction for channel ${channelId}:`,
        error,
      )
      throw error
    }
  }

  // Monitor channel funding confirmation
  async monitorChannelFunding(channelId: string): Promise<void> {
    const channel = this.channels.get(channelId)
    if (!channel || !channel.fundingTxId) {
      throw new Error(`Channel ${channelId} not found or not funded`)
    }

    try {
      console.log(`[LNWallet] Monitoring funding confirmation for channel ${channelId}`)

      // Wait for confirmations
      const isConfirmed = await this.blockchainClient.waitForConfirmations(channel.fundingTxId, 6)

      if (isConfirmed) {
        // Transition channel to open state
        const updatedChannel = transitionChannel(channel, 'funding_locked', {
          channelId: channelId,
        })
        this.channels.set(channelId, updatedChannel)
        await this.saveChannels()

        console.log(`[LNWallet] Channel ${channelId} funding confirmed and opened`)
      } else {
        console.warn(`[LNWallet] Channel ${channelId} funding confirmation timeout`)
        // Could implement funding timeout handling here
      }
    } catch (error) {
      console.error(`[LNWallet] Error monitoring channel funding for ${channelId}:`, error)
      throw error
    }
  }

  // Get fee estimates for channel operations
  async getFeeEstimates(): Promise<{ slow: number; normal: number; fast: number }> {
    try {
      const feeRates = await this.blockchainClient.getRecommendedFeeRates()
      return {
        slow: feeRates.slow,
        normal: feeRates.normal,
        fast: feeRates.fast,
      }
    } catch (error) {
      console.error('[LNWallet] Error getting fee estimates:', error)
      // Return fallback values
      return {
        slow: 10,
        normal: 20,
        fast: 50,
      }
    }
  }

  // Private methods

  private async loadChannels(): Promise<void> {
    try {
      const channels = await get<ChannelState[]>('lightning_channels')
      if (channels) {
        this.channels = new Map(channels.map(c => [c.id, c]))
        console.log(`[LNWallet] Loaded ${channels.length} channels`)
      }
    } catch (error) {
      console.error('[LNWallet] Error loading channels:', error)
    }
  }

  private async saveChannels(): Promise<void> {
    try {
      const channels = Array.from(this.channels.values())
      await set('lightning_channels', channels)
    } catch (error) {
      console.error('[LNWallet] Error saving channels:', error)
    }
  }

  private async reconnectActiveChannels(): Promise<void> {
    for (const channel of this.channels.values()) {
      if (channel.state === 'open') {
        // TODO: Reconnect to peer and sync channel state
        console.log(`[LNWallet] Reconnecting to channel ${channel.id}`)
      }
    }
  }

  private async createCommitmentTransaction(channelId: string, isLocal: boolean): Promise<any> {
    const channel = this.channels.get(channelId)
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`)
    }

    // TODO: Implement proper commitment transaction creation
    // This would use the channels.ts functions
    return {
      version: 2,
      inputs: [],
      outputs: [],
      fee: 1000,
    }
  }

  private generateFundingPubkey(): string {
    // TODO: Generate proper funding pubkey from HD wallet
    return '02' + Math.random().toString(16).substr(2, 62)
  }

  private generatePaymentBasepoint(): string {
    // TODO: Generate proper payment basepoint from HD wallet
    return '03' + Math.random().toString(16).substr(2, 62)
  }

  private generatePaymentHash(): string {
    // TODO: Generate proper payment hash
    return Math.random().toString(16).substr(2, 64)
  }

  private createMockBolt11(
    amountMsat: number | undefined,
    description: string | undefined,
    paymentHash: string,
    timestamp: number,
    expiry: number,
  ): string {
    // Create a mock BOLT11 invoice for testing
    // In real implementation, use proper BOLT11 encoding
    const amount = amountMsat ? Math.floor(amountMsat / 1000) : 0

    return `lnbc${amount}1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6twvus8g6rfwvs8qun0dfjkxaq8rkx3yf5tcsyz3d73gafnh3cax9rn449d9p5uxz9ezhhypd0elx87sjle52x86fux2ypatgddc6k63n7erqz25le42c4u4ecky03ylcqca784w`
  }
}

// Singleton instance
let lnWalletInstance: LNWallet | null = null

export function getLNWallet(): LNWallet | null {
  return lnWalletInstance
}

export function createLNWallet(config: LNWalletConfig): LNWallet {
  lnWalletInstance = new LNWallet(config)
  return lnWalletInstance
}

export function destroyLNWallet(): void {
  if (lnWalletInstance) {
    lnWalletInstance.stop()
    lnWalletInstance = null
  }
}
