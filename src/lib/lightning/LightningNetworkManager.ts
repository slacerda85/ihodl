// Lightning Network Manager - Coordinates Lightning Network services (gossip, trampoline)
// Does not manage wallet operations - those are handled by wallet state
import { GossipNetwork, GossipConfig } from '@/lib/lightning/gossip'
import { TrampolineRouter, TrampolineConfig } from '@/lib/lightning/trampoline'
import { LNPeerAddr } from '@/lib/lightning/lntransport'
import { LightningState } from '@/features/lightning/types'

export interface LightningNetworkConfig {
  enableGossip: boolean
  enableTrampoline: boolean
  maxPeers: number
  trustedNodes: string[]
}

// Lightning Network Manager - Coordinates Lightning Network services (gossip, trampoline)
// Does not manage wallet operations - those are handled by wallet state
export class LightningNetworkManager {
  private static instance: LightningNetworkManager | null = null
  private gossipNetwork: GossipNetwork | null = null
  private trampolineRouter: TrampolineRouter | null = null
  private config: LightningNetworkConfig | null = null
  private isInitialized = false
  private isConnected = false

  private constructor() {}

  static getInstance(): LightningNetworkManager {
    if (!LightningNetworkManager.instance) {
      LightningNetworkManager.instance = new LightningNetworkManager()
    }
    return LightningNetworkManager.instance
  }

  /**
   * Initialize the Lightning Network services (gossip, trampoline)
   */
  async initialize(config: LightningNetworkConfig, lightningState: LightningState): Promise<void> {
    if (this.isInitialized) return

    try {
      this.config = config
      console.log('[LightningNetworkManager] Starting Lightning Network services initialization...')

      // STEP 1: Initialize Gossip Network (if enabled)
      if (config.enableGossip) {
        console.log('[LightningNetworkManager] Initializing Gossip Network...')
        const gossipConfig = this.createGossipConfig(lightningState)
        this.gossipNetwork = new GossipNetwork(gossipConfig)
      }

      // STEP 2: Initialize Trampoline Router (if enabled)
      if (config.enableTrampoline) {
        console.log('[LightningNetworkManager] Initializing Trampoline Router...')
        if (!this.gossipNetwork) {
          throw new Error('Gossip network required for trampoline routing')
        }
        const trampolineConfig = this.createTrampolineConfig()
        this.trampolineRouter = new TrampolineRouter(trampolineConfig, this.gossipNetwork)
      }

      this.isInitialized = true
      console.log('[LightningNetworkManager] Lightning Network services initialized successfully')
    } catch (error) {
      console.error('[LightningNetworkManager] Initialization failed:', error)
      throw error
    }
  }

  /**
   * Start the Lightning Network services (connect to peers, start services)
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Lightning Network not initialized')
    }

    if (this.isConnected) return

    try {
      console.log('[LightningNetworkManager] Starting Lightning Network services...')

      // STEP 1: Connect to Gossip Network
      if (this.gossipNetwork) {
        console.log('[LightningNetworkManager] Connecting to Gossip Network...')
        await this.gossipNetwork.start()
      }

      // STEP 2: Start Trampoline Services
      if (this.trampolineRouter) {
        console.log('[LightningNetworkManager] Starting Trampoline Services...')
        // Trampoline router doesn't have a start method, it's ready when initialized
      }

      this.isConnected = true
      console.log('[LightningNetworkManager] Lightning Network services started and connected')
    } catch (error) {
      console.error('[LightningNetworkManager] Start failed:', error)
      throw error
    }
  }

  /**
   * Stop the Lightning Network services
   */
  async stop(): Promise<void> {
    if (!this.isConnected) return

    try {
      console.log('[LightningNetworkManager] Stopping Lightning Network services...')

      // Stop in reverse order
      if (this.trampolineRouter) {
        console.log('[LightningNetworkManager] Stopping Trampoline Services...')
        // Trampoline router doesn't have a stop method, just clear reference
        this.trampolineRouter = null
      }

      if (this.gossipNetwork) {
        console.log('[LightningNetworkManager] Disconnecting from Gossip Network...')
        await this.gossipNetwork.stop()
        this.gossipNetwork = null
      }

      this.isConnected = false
      console.log('[LightningNetworkManager] Lightning Network services stopped')
    } catch (error) {
      console.error('[LightningNetworkManager] Stop failed:', error)
      throw error
    }
  }

  /**
   * Get gossip network instance
   */
  getGossipNetwork(): GossipNetwork | null {
    return this.gossipNetwork
  }

  /**
   * Get trampoline router instance
   */
  getTrampolineRouter(): TrampolineRouter | null {
    return this.trampolineRouter
  }

  /**
   * Check if Lightning Network is initialized
   */
  isNetworkInitialized(): boolean {
    return this.isInitialized
  }

  /**
   * Check if Lightning Network is connected
   */
  isNetworkConnected(): boolean {
    return this.isConnected
  }

  /**
   * Get network status
   */
  getNetworkStatus(): {
    initialized: boolean
    connected: boolean
    gossipConnected: boolean
    trampolineReady: boolean
  } {
    return {
      initialized: this.isInitialized,
      connected: this.isConnected,
      gossipConnected: !!this.gossipNetwork,
      trampolineReady: !!this.trampolineRouter,
    }
  }

  /**
   * Create gossip network configuration
   */
  private createGossipConfig(lightningState: LightningState): GossipConfig {
    // Use electrum trusted peers as initial gossip peers
    const knownPeers: LNPeerAddr[] = []

    // TODO: Convert electrum peers to LN peer addresses
    // For now, we'll use well-known Lightning peers or empty array
    // Could use state.electrum.trustedPeers to get electrum servers
    // and try to connect to their Lightning peers

    return {
      maxPeers: this.config?.maxPeers || 10,
      gossipTimeout: 30000,
      staleDataTimeout: 24 * 60 * 60 * 1000, // 24 hours
      knownPeers,
    }
  }

  /**
   * Create trampoline router configuration
   */
  private createTrampolineConfig(): TrampolineConfig {
    return {
      enabled: this.config?.enableTrampoline || false,
      maxHops: 3,
      trustedNodes: this.config?.trustedNodes || [],
      maxFeePercent: 1.0, // 1% max fee
    }
  }
}

// Factory function to create Lightning Network configuration from app state
export function createLightningNetworkConfig(
  lightningState: LightningState,
): LightningNetworkConfig | null {
  try {
    // Check if lightning features are enabled
    if (!lightningState.isRoutingEnabled && !lightningState.trampolineEnabled) {
      console.log('[createLightningNetworkConfig] Lightning network features not enabled')
      return null
    }

    return {
      enableGossip: lightningState.isRoutingEnabled,
      enableTrampoline: lightningState.trampolineEnabled,
      maxPeers: 10, // TODO: Make configurable
      trustedNodes: [], // TODO: Load from configuration
    }
  } catch (error) {
    console.error('[createLightningNetworkConfig] Error creating config:', error)
    return null
  }
}
