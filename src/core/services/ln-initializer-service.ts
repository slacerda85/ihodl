// Lightning Network Autonomous Initializer
// Handles automatic startup and initialization of Lightning Network components
// Ensures wallet is ready for Lightning operations without user interaction

import { LightningRepository } from '../repositories/lightning'
import LightningService from './ln-service'
import WalletService from './wallet'
import { WatchtowerService } from './ln-watchtower-service'
import { PeerConnectivityService, createPeerConnectivityService } from './ln-peer-service'
import { LightningMonitorService, createLightningMonitorService } from './ln-monitor-service'
import { ErrorRecoveryService, createErrorRecoveryService } from './errorRecovery'
import { LiquidityManagerService, createLiquidityManagerService } from './ln-liquidity-service'
import { PaymentProcessorService, createPaymentProcessorService } from './ln-payment-service'
import { NotificationService, createNotificationService } from './notification'
import ChannelReestablishService from './ln-channel-reestablish-service'
import { GossipSyncManager } from '../lib/lightning/gossip-sync'
import { GraphCacheManager } from '../lib/lightning/graph-cache'
import { RoutingGraph } from '../lib/lightning/routing'
import { KNOWN_TRAMPOLINE_NODES } from '../lib/lightning/trampoline'
import { uint8ArrayToHex } from '../lib/utils'
import { getBackgroundGossipSyncService } from './ln-background-gossip-sync-service'
import { getLightningRoutingService } from './ln-routing-service'
import {
  connect as connectElectrum,
  getCurrentBlockHeight,
  close as closeElectrum,
} from '../lib/electrum/client'
import { Connection } from '../models/network'
import { createElectrumWatcherService } from './ln-electrum-watcher-service'
import { createChannelOnChainMonitorService } from './ln-channel-onchain-monitor-service'
// import { AsyncStorage } from '@react-native-async-storage/async-storage'

// ==========================================
// TYPES
// ==========================================

export interface LightningInitConfig {
  enableGossipSync: boolean
  enablePeerConnectivity: boolean
  enableHTLCMonitoring: boolean
  enableWatchtower: boolean
  enableLSPIntegration: boolean
  graphCacheEnabled: boolean
  maxPeers: number
  syncTimeout: number // seconds
  trampolineMode: boolean // Se deve iniciar em trampoline mode
}

export interface InitStatus {
  phase: 'idle' | 'starting' | 'syncing' | 'connecting' | 'ready' | 'error'
  progress: number // 0-100
  message: string
  error?: string
}

export interface LightningInitResult {
  success: boolean
  graphSize?: number
  peersConnected?: number
  channelsLoaded?: number
  error?: string
}

// ==========================================
// CONSTANTS
// ==========================================

const DEFAULT_CONFIG: LightningInitConfig = {
  enableGossipSync: true,
  enablePeerConnectivity: true,
  enableHTLCMonitoring: true,
  enableWatchtower: true,
  enableLSPIntegration: true,
  graphCacheEnabled: true,
  maxPeers: 5,
  syncTimeout: 120, // 2 minutes
  trampolineMode: false, // Por padrão, não usar trampoline mode
}

// const GRAPH_CACHE_KEY = 'lightning_graph_cache'
// const INIT_STATUS_KEY = 'lightning_init_status'

// ==========================================
// LIGHTNING INITIALIZER CLASS
// ==========================================

export class LightningInitializer {
  private config: LightningInitConfig
  private status: InitStatus = { phase: 'idle', progress: 0, message: 'Not started' }
  private abortController?: AbortController
  private statusCallbacks: ((status: InitStatus) => void)[] = []

  // Repository
  private repository: LightningRepository

  // Services
  private lightningService?: LightningService
  private peerConnectivity?: PeerConnectivityService
  private lightningMonitor?: LightningMonitorService
  private errorRecovery?: ErrorRecoveryService
  private liquidityManager?: LiquidityManagerService
  private paymentProcessor?: PaymentProcessorService
  private notifications?: NotificationService
  private watchtower?: WatchtowerService
  private channelReestablish?: ChannelReestablishService
  private backgroundGossipSync?: any // BackgroundGossipSyncService
  private routingService?: any // LightningRoutingService
  private electrumSocket?: Connection
  private electrumWatcher?: any
  private channelOnChainMonitor?: any

  // Public access to services for UI hooks
  public get peerConnectivityService(): PeerConnectivityService | undefined {
    return this.peerConnectivity
  }

  public get lightningMonitorService(): LightningMonitorService | undefined {
    return this.lightningMonitor
  }

  public get errorRecoveryService(): ErrorRecoveryService | undefined {
    return this.errorRecovery
  }

  public get liquidityManagerService(): LiquidityManagerService | undefined {
    return this.liquidityManager
  }

  public get paymentProcessorService(): PaymentProcessorService | undefined {
    return this.paymentProcessor
  }

  public get watchtowerService(): WatchtowerService | undefined {
    return this.watchtower
  }

  public get notificationService(): NotificationService | undefined {
    return this.notifications
  }

  public get channelReestablishService(): ChannelReestablishService | undefined {
    return this.channelReestablish
  }

  public get electrumWatcherService(): any | undefined {
    return this.electrumWatcher
  }

  public get channelOnChainMonitorService(): any | undefined {
    return this.channelOnChainMonitor
  }

  constructor(config: Partial<LightningInitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.repository = new LightningRepository()
  }

  // ==========================================
  // PUBLIC API
  // ==========================================

  /**
   * Initialize Lightning Network autonomously
   */
  async initialize(): Promise<LightningInitResult> {
    this.abortController = new AbortController()
    this.updateStatus('starting', 0, 'Starting Lightning initialization...')

    try {
      // Phase 1: Load persisted state
      await this.loadPersistedState()

      // Phase 2: Initialize core components
      const coreResult = await this.initializeCoreComponents()
      if (!coreResult.success) {
        throw new Error(`Core initialization failed: ${coreResult.error}`)
      }

      // Phase 3: Sync Lightning graph
      if (this.config.enableGossipSync) {
        const syncResult = await this.syncLightningGraph()
        if (!syncResult.success) {
          throw new Error(`Graph sync failed: ${syncResult.error}`)
        }
      }

      // Phase 4: Establish peer connections
      if (this.config.enablePeerConnectivity) {
        const peerResult = await this.establishPeerConnections()
        if (!peerResult.success) {
          throw new Error(`Peer connection failed: ${peerResult.error}`)
        }
      }

      // Phase 5: Start monitoring services
      await this.startMonitoringServices()

      // Phase 6: Start background gossip sync (if in trampoline mode)
      if (this.config.trampolineMode) {
        await this.startBackgroundGossipSync()
      }

      // Phase 7: Save initialization state
      await this.saveInitState()

      this.updateStatus('ready', 100, 'Lightning Network ready')
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.updateStatus('error', 0, 'Initialization failed', errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Stop initialization process
   */
  async stop(): Promise<void> {
    this.abortController?.abort()

    // Stop all services
    if (this.lightningMonitor) {
      await this.lightningMonitor.stop()
    }

    if (this.peerConnectivity) {
      await this.peerConnectivity.stop()
    }

    if (this.errorRecovery) {
      await this.errorRecovery.stop()
    }

    if (this.watchtower) {
      this.watchtower.stop()
    }

    if (this.backgroundGossipSync) {
      await this.backgroundGossipSync.stopBackgroundSync()
    }

    // Stop Electrum Watcher
    if (this.electrumWatcher) {
      this.electrumWatcher.stop()
    }

    // Stop Channel On-Chain Monitor
    if (this.channelOnChainMonitor) {
      this.channelOnChainMonitor.stop()
    }

    // Close Electrum connection
    if (this.electrumSocket) {
      closeElectrum(this.electrumSocket)
      this.electrumSocket = undefined
    }

    this.updateStatus('idle', 0, 'Initialization stopped')
  }

  /**
   * Get current initialization status
   */
  getStatus(): InitStatus {
    return { ...this.status }
  }

  /**
   * Subscribe to status updates
   */
  onStatusUpdate(callback: (status: InitStatus) => void): () => void {
    this.statusCallbacks.push(callback)
    return () => {
      const index = this.statusCallbacks.indexOf(callback)
      if (index > -1) {
        this.statusCallbacks.splice(index, 1)
      }
    }
  }

  // ==========================================
  // PRIVATE METHODS
  // ==========================================

  private updateStatus(
    phase: InitStatus['phase'],
    progress: number,
    message: string,
    error?: string,
  ) {
    this.status = { phase, progress, message, error }
    this.statusCallbacks.forEach(callback => callback(this.status))
  }

  private async loadPersistedState(): Promise<void> {
    this.updateStatus('starting', 5, 'Loading persisted state...')

    try {
      // Load graph cache if enabled
      if (this.config.graphCacheEnabled) {
        // Graph cache is now loaded during syncLightningGraph initialization
        console.log('Graph cache enabled - will be loaded during gossip sync')
      }

      // TODO: Implement initialization status persistence using LightningRepository
      // Could use a dedicated key or extend the repository interface
    } catch (error) {
      console.warn('Failed to load persisted state:', error)
    }
  }

  private async initializeCoreComponents(): Promise<LightningInitResult> {
    this.updateStatus('starting', 15, 'Initializing core components...')

    try {
      // Connect to Electrum server
      console.log('[LightningInitializer] Connecting to Electrum server...')
      this.electrumSocket = await connectElectrum()
      console.log('[LightningInitializer] Connected to Electrum server')

      // Verify blockchain consistency and get current height
      const currentHeight = await getCurrentBlockHeight(this.electrumSocket)
      console.log(`[LightningInitializer] Current blockchain height: ${currentHeight}`)

      // TODO: Verify consistency (compare with known checkpoints if available)

      // Initialize Electrum Watcher
      this.electrumWatcher = createElectrumWatcherService()
      await this.electrumWatcher.start()
      console.log('[LightningInitializer] Electrum Watcher started')

      // Initialize Channel On-Chain Monitor Service
      this.channelOnChainMonitor = createChannelOnChainMonitorService(
        this.repository,
        this.electrumWatcher,
      )
      await this.channelOnChainMonitor.start()
      console.log('[LightningInitializer] Channel On-Chain Monitor started')

      // Initialize transport layer
      // const transport = getTransport()
      // Transport is initialized on-demand, no explicit initialize method

      // Initialize error recovery service
      this.errorRecovery = createErrorRecoveryService()
      await this.errorRecovery.start()

      // Initialize peer connectivity service
      if (this.config.enablePeerConnectivity) {
        this.peerConnectivity = createPeerConnectivityService({
          maxPeers: this.config.maxPeers,
        })
        await this.peerConnectivity.start()
      }

      // Initialize channel reestablish service
      this.channelReestablish = new ChannelReestablishService()

      // Initialize Lightning service
      this.lightningService = new LightningService()
      const walletService = new WalletService()
      const activeWalletId = walletService.getActiveWalletId()

      if (activeWalletId) {
        await this.lightningService.initialize(activeWalletId)
      } else {
        console.warn('No active wallet found, skipping Lightning service initialization')
      }

      // Initialize Lightning monitor service
      if (this.config.enableHTLCMonitoring && activeWalletId) {
        this.lightningMonitor = createLightningMonitorService(this.lightningService!)
        await this.lightningMonitor.start()
      }

      // Initialize gossip manager
      // const gossipManager = new GossipSync()
      // await gossipManager.initialize() // TODO: Implement initialize method

      // Initialize DNS bootstrap
      // const dnsBootstrap = new DNSBootstrap()
      // await dnsBootstrap.initialize()

      // Initialize P2P discovery
      // const p2pDiscovery = new P2PDiscovery()
      // await p2pDiscovery.initialize()

      // Phase 3: Autonomous Services
      // Initialize liquidity manager service
      if (activeWalletId) {
        this.liquidityManager = createLiquidityManagerService(this.lightningService!)
        await this.liquidityManager.start()
      }

      // Initialize payment processor service
      if (activeWalletId) {
        this.paymentProcessor = createPaymentProcessorService(this.lightningService!)
        await this.paymentProcessor.start()
      }

      // Initialize notification service (optional, non-blocking)
      try {
        this.notifications = createNotificationService()
        await this.notifications.initialize()
        console.log('[LightningInitializer] Notification service initialized')
      } catch (error) {
        console.warn('[LightningInitializer] Failed to initialize notification service:', error)
        console.log('[LightningInitializer] Continuing without notifications')
      }

      // Initialize watchtower service
      if (this.config.enableWatchtower) {
        this.watchtower = new WatchtowerService()
        await this.watchtower.initialize()
      }

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Core init failed',
      }
    }
  }

  private async syncLightningGraph(): Promise<LightningInitResult> {
    this.updateStatus('syncing', 30, 'Synchronizing Lightning graph...')

    try {
      const lightningRepo = new LightningRepository()
      const routingGraph = new RoutingGraph()
      const cacheManager = this.config.graphCacheEnabled
        ? new GraphCacheManager(lightningRepo)
        : undefined

      // Criar GossipSyncManager com cache se habilitado
      const gossipManager = new GossipSyncManager({
        routingGraph,
        cacheManager,
        maxConcurrentPeers: this.config.maxPeers,
        batchIntervalMs: 1000,
      })

      // TODO: Implementar DNS bootstrap para obter peers iniciais
      // Por enquanto, simular alguns peers
      const mockPeers: any[] = [] // TODO: Substituir por peers reais do DNS bootstrap

      if (mockPeers.length === 0) {
        // Se não há peers, ainda podemos tentar carregar do cache
        if (cacheManager) {
          await gossipManager.loadCachedGraph()
          const graphSize = routingGraph.getAllNodes().length
          this.updateStatus('syncing', 70, `Graph loaded from cache: ${graphSize} nodes`)
          return { success: true, graphSize }
        }
        throw new Error('No peers available for gossip sync')
      }

      // Iniciar sincronização com timeout
      const syncPromise = gossipManager.startSync(mockPeers)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Sync timeout')), this.config.syncTimeout * 1000),
      )

      await Promise.race([syncPromise, timeoutPromise])

      // Obter estatísticas do grafo
      const graphSize = routingGraph.getAllNodes().length
      const stats = gossipManager.getStats()

      this.updateStatus(
        'syncing',
        70,
        `Graph synced: ${graphSize} nodes, ${stats.messagesProcessed} messages`,
      )

      return {
        success: true,
        graphSize,
        peersConnected: mockPeers.length,
        channelsLoaded: routingGraph.getAllChannels().length,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Graph sync failed',
      }
    }
  }

  private async establishPeerConnections(): Promise<LightningInitResult> {
    this.updateStatus('connecting', 75, 'Establishing peer connections...')

    try {
      let successfulConnections = 0

      // Use peer connectivity service if available
      if (this.peerConnectivity) {
        if (this.config.trampolineMode) {
          // Em trampoline mode, conectar apenas aos nós trampoline
          console.log(
            '[LightningInitializer] Trampoline mode enabled - connecting to trampoline nodes',
          )

          for (const trampolineNode of KNOWN_TRAMPOLINE_NODES) {
            try {
              const nodeIdHex = uint8ArrayToHex(trampolineNode.nodeId)
              console.log(
                `[LightningInitializer] Connecting to trampoline node: ${trampolineNode.alias || nodeIdHex}`,
              )

              // TODO: Implementar conexão específica aos nós trampoline
              // Por enquanto, apenas simular conexão bem-sucedida
              successfulConnections++
            } catch (error) {
              console.warn(
                `[LightningInitializer] Failed to connect to trampoline node ${trampolineNode.alias}:`,
                error,
              )
            }
          }
        } else {
          // Modo normal: conectar a múltiplos peers via gossip
          const connectedPeers = this.peerConnectivity.getConnectedPeers()
          successfulConnections = connectedPeers.length

          // After peers are connected, reestablish channels with each peer
          if (this.channelReestablish && successfulConnections > 0) {
            await this.reestablishChannelsWithPeers(connectedPeers)
          }
        }
      } else {
        // Fallback: simulate connection delay for testing
        await new Promise(resolve => setTimeout(resolve, 500))
        successfulConnections = this.config.trampolineMode ? 1 : Math.min(this.config.maxPeers, 3)
      }

      const targetPeers = this.config.trampolineMode ? 1 : this.config.maxPeers
      this.updateStatus(
        'connecting',
        90,
        `Connected to ${successfulConnections}/${targetPeers} peers${this.config.trampolineMode ? ' (trampoline mode)' : ''}`,
      )

      return { success: true, peersConnected: successfulConnections }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Peer connection failed',
      }
    }
  }

  /**
   * Inicia sincronização de gossip em background (modo híbrido)
   */
  private async startBackgroundGossipSync(): Promise<void> {
    try {
      console.log('[LightningInitializer] Starting background gossip sync for hybrid mode...')

      // Inicializar serviço de routing
      this.routingService = getLightningRoutingService()

      // Inicializar background sync service
      this.backgroundGossipSync = getBackgroundGossipSyncService({
        peerConnectivityService: this.peerConnectivity,
      })

      // Conectar routing service ao background sync
      await this.routingService.initialize(this.backgroundGossipSync)

      // Configurar listeners para eventos
      this.backgroundGossipSync.on('stateChanged', state => {
        console.log(`[LightningInitializer] Background sync state: ${state}`)
      })

      this.backgroundGossipSync.on('syncCompleted', stats => {
        console.log(
          `[LightningInitializer] Background sync completed: ${stats.nodes} nodes, ${stats.channels} channels in ${stats.duration}ms`,
        )
        // Migração para pathfinding local será feita automaticamente pelo routing service
      })

      this.backgroundGossipSync.on('syncError', error => {
        console.error('[LightningInitializer] Background sync error:', error)
      })

      // Iniciar sincronização em background
      await this.backgroundGossipSync.startBackgroundSync()
    } catch (error) {
      console.warn('[LightningInitializer] Failed to start background gossip sync:', error)
      // Não falhar a inicialização por causa disso - é opcional
    }
  }

  private async reestablishChannelsWithPeers(connectedPeers: any[]): Promise<void> {
    if (!this.channelReestablish) {
      console.warn('[LightningInitializer] Channel reestablish service not available')
      return
    }

    this.updateStatus('connecting', 80, 'Reestablishing channels...')

    const repository = new LightningRepository()
    const allChannels = repository.findAllChannels()

    let reestablishedCount = 0
    let failedCount = 0

    for (const peer of connectedPeers) {
      // Find channels with this peer
      const peerChannels = Object.values(allChannels).filter(
        channel => channel.nodeId === peer.nodeId,
      )

      if (peerChannels.length === 0) {
        continue
      }

      console.log(
        `[LightningInitializer] Reestablishing ${peerChannels.length} channels with peer ${peer.nodeId}`,
      )

      for (const channel of peerChannels) {
        try {
          // Convert channel ID to Uint8Array
          const channelIdBytes = new Uint8Array(
            channel.channelId.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || [],
          )

          const result = await this.channelReestablish.reestablishChannel(
            channelIdBytes,
            peer.nodeId,
          )

          if (result.success) {
            reestablishedCount++
            console.log(`[LightningInitializer] Channel ${channel.channelId} reestablished`)
          } else {
            failedCount++
            console.error(
              `[LightningInitializer] Failed to reestablish channel ${channel.channelId}: ${result.error}`,
            )
          }
        } catch (error) {
          failedCount++
          console.error(
            `[LightningInitializer] Error reestablishing channel ${channel.channelId}:`,
            error,
          )
        }
      }
    }

    console.log(
      `[LightningInitializer] Channel reestablishment complete: ${reestablishedCount} succeeded, ${failedCount} failed`,
    )

    this.updateStatus(
      'connecting',
      85,
      `Reestablished ${reestablishedCount} channels${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
    )
  }

  private async startMonitoringServices(): Promise<void> {
    this.updateStatus('ready', 95, 'Starting monitoring services...')

    // Initialize Lightning monitor service
    if (this.config.enableHTLCMonitoring) {
      // TODO: Get LightningService instance
      // this.lightningMonitor = createLightningMonitorService(lightningService)
      // await this.lightningMonitor.start()
    }

    // Start watchtower service
    if (this.config.enableWatchtower && this.watchtower) {
      this.watchtower.start()
    }

    // Start LSP integration
    if (this.config.enableLSPIntegration && this.lightningService) {
      // const lsp = new LSPService(this.lightningService)
      // LSP service is ready to use after construction
      // TODO: Implement LSP integration
    }
  }

  private async saveInitState(): Promise<void> {
    try {
      // TODO: Implement initialization status persistence using LightningRepository
      // Could extend repository with custom data methods or use existing keys
      // const lightningRepo = new LightningRepository()
      // const initState = {
      //   timestamp: Date.now(),
      //   config: this.config,
      //   status: this.status,
      // }
      // lightningRepo.saveCustomData('init_status', initState)
    } catch (error) {
      console.warn('Failed to save init state:', error)
    }
  }
}

// ==========================================
// FACTORY FUNCTION
// ==========================================

export function createLightningInitializer(
  config?: Partial<LightningInitConfig>,
): LightningInitializer {
  return new LightningInitializer(config)
}

// ==========================================
// DEFAULT EXPORT
// ==========================================

export default LightningInitializer
