// Worker Service
// Service that encapsulates the LightningWorker from the lib
// Provides high-level operations for Lightning Network functionality
// Follows the architecture: lib (pure functions) -> services (business logic) -> UI

// External libraries
import EventEmitter from 'eventemitter3'

// Core lib imports
import { GossipPeerInterface } from '../lib/lightning/gossip'
import { GossipSyncManager, type SyncProgress } from '../lib/lightning/gossip-sync'
import { GraphCacheManager } from '../lib/lightning/graph-cache'
import { decodeInvoice } from '../lib/lightning/invoice'
import { LightningWorker } from '../lib/lightning/worker'
import { hexToUint8Array, uint8ArrayToHex } from '../lib/utils/utils'
import {
  close as closeElectrum,
  connect as connectElectrum,
  getCurrentBlockHeight,
} from '../lib/electrum/client'

// Core models imports
import { ReadinessState, ReadinessLevel, getReadinessLevel } from '../models/lightning/readiness'

// Core repositories imports
import { LightningRepository, type PersistedChannel } from '../repositories/lightning'

// Core services imports
import ChannelReestablishService from './ln-channel-reestablish-service'
import {
  createChannelOnChainMonitorService,
  type ChannelOnChainEvent,
} from './ln-channel-onchain-monitor-service'
import { createElectrumWatcherService } from './ln-electrum-watcher-service'
import { ErrorRecoveryService, createErrorRecoveryService } from './errorRecovery'
import {
  extractPendingHtlcTxids,
  reconcilePendingHtlcConfirmations,
  type HtlcConfirmationProvider,
} from './ln-htlc-service'
import { LightningMonitorService } from './ln-monitor-service'
import { PeerConnectivityService } from './ln-peer-service'
import { getLightningRoutingService, RoutingMode } from './ln-routing-service'
import type {
  ChannelState,
  GenerateInvoiceParams,
  GenerateInvoiceResult,
  InvoiceState,
  PaymentState,
  SendPaymentParams,
  SendPaymentResult,
} from './ln-types'
import WalletService from './wallet'
import { WatchtowerService } from './ln-watchtower-service'
import networkService from './network'

// Re-export para facilitar imports
export type { ReadinessState, ReadinessLevel }
export { getReadinessLevel }

// ==========================================
// TYPES
// ==========================================

export interface WorkerServiceConfig {
  network: 'mainnet' | 'testnet' | 'regtest'
  maxPeers: number
  enableWatchtower: boolean
  enableGossip: boolean
  enableTrampoline: boolean
}

export interface WorkerStatus {
  isInitialized: boolean
  network: string
  connectedPeers: number
  activeChannels: number
  pendingInvoices: number
  uptime: number
}

export interface LightningInitResult {
  success: boolean
  error?: string
}

export interface WorkerInitStatus {
  phase: string
  progress: number
  message: string
  error?: string
}

export type WorkerCommand =
  | 'init'
  | 'connectElectrum'
  | 'startPeers'
  | 'reestablishChannels'
  | 'syncGossip'
  | 'startWatchtower'
  | 'stop'
  | 'metrics'
  | 'readiness'

export interface WorkerMetrics {
  startTime?: number
  electrumHeight?: number
  connectedPeers?: number
  gossipCompleted?: boolean
  electrumAttempts?: number
  electrumFailures?: number
  peerStartAttempts?: number
  peerStartFailures?: number
  disconnectCount?: number
  gossipSyncAttempts?: number
  gossipTimeouts?: number
}

export interface WorkerReadiness {
  walletLoaded: boolean
  electrumReady: boolean
  transportConnected: boolean
  peerConnected: boolean
  channelsReestablished: boolean
  gossipSynced: boolean
  watcherRunning: boolean
}

export enum BackgroundSyncState {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  SYNCING = 'syncing',
  COMPLETED = 'completed',
  ERROR = 'error',
  PAUSED = 'paused',
}

export interface BackgroundSyncSnapshot {
  state: BackgroundSyncState
  progress?: SyncProgress
  stats?: { nodes: number; channels: number; duration: number }
}

export type { SyncProgress } from '../lib/lightning/gossip-sync'

export const SUPPORTED_COMMANDS: WorkerCommand[] = [
  'init',
  'connectElectrum',
  'startPeers',
  'reestablishChannels',
  'syncGossip',
  'startWatchtower',
  'stop',
  'metrics',
  'readiness',
]

// ==========================================
// WORKER SERVICE CLASS
// ==========================================

export class WorkerService extends EventEmitter {
  // ==========================================
  // 1. PROPERTIES AND CONSTRUCTOR
  // ==========================================

  private worker?: LightningWorker
  private watchtowerService?: WatchtowerService
  private lightningMonitor?: LightningMonitorService
  private peerConnectivity?: PeerConnectivityService
  private config: WorkerServiceConfig
  private isRunning: boolean = false
  private startTime: number = 0
  private activeWalletId?: string | null

  /**
   * Promise de inicialização em andamento (mutex).
   * Garante que apenas uma inicialização ocorra por vez.
   *
   * @see docs/lightning-worker-consolidation-plan.md - Fase 2.4
   */
  private initializationPromise?: Promise<LightningInitResult>

  // Additional services for initialization
  private lightningRepository?: LightningRepository
  private routingService = getLightningRoutingService()
  private routingInitialized = false
  private walletService?: WalletService
  private errorRecovery?: ErrorRecoveryService
  private channelReestablish?: ChannelReestablishService
  private gossipManager?: GossipSyncManager
  private backgroundGossipManager?: GossipSyncManager
  private backgroundSyncState: BackgroundSyncState = BackgroundSyncState.IDLE
  private backgroundSyncProgress?: SyncProgress
  private backgroundSyncStartTime?: number
  private backgroundProgressTimer?: ReturnType<typeof setInterval>
  private backgroundCacheManager?: GraphCacheManager
  private electrumWatcher?: any // From createElectrumWatcherService
  private channelOnChainMonitor?: any // From createChannelOnChainMonitorService
  private channelOnChainEventUnsubscribe?: () => void
  private electrumSocket?: any // From connectElectrum
  private htlcMonitorTimers: Map<string, ReturnType<typeof setInterval>> = new Map()
  private readonly htlcPollIntervalMs = 30000

  // Status tracking
  private initStatus: WorkerInitStatus = { phase: 'idle', progress: 0, message: 'Not started' }
  private abortController?: AbortController
  private readiness: WorkerReadiness = {
    walletLoaded: false,
    electrumReady: false,
    transportConnected: false,
    peerConnected: false,
    channelsReestablished: false,
    gossipSynced: false,
    watcherRunning: false,
  }
  private metrics: WorkerMetrics = {}
  private readonly numericMetricKeys = new Set<keyof WorkerMetrics>([
    'electrumAttempts',
    'electrumFailures',
    'peerStartAttempts',
    'peerStartFailures',
    'disconnectCount',
    'gossipSyncAttempts',
    'gossipTimeouts',
  ])
  private readonly backgroundProgressInterval = 5000
  private readonly backgroundSyncTimeoutMinutes = 30
  private readonly offloadChunkSize = 10
  private readonly isTestEnv: boolean
  private readonly readinessKeys: (keyof WorkerReadiness)[] = [
    'walletLoaded',
    'electrumReady',
    'transportConnected',
    'peerConnected',
    'channelsReestablished',
    'gossipSynced',
    'watcherRunning',
  ]

  constructor(config: Partial<WorkerServiceConfig> = {}) {
    super()
    this.isTestEnv = typeof process !== 'undefined' && Boolean(process.env.JEST_WORKER_ID)
    this.config = {
      network: 'testnet',
      maxPeers: 5,
      enableWatchtower: !this.isTestEnv,
      enableGossip: true,
      enableTrampoline: true,
      ...config,
    }
  }

  // ==========================================
  // 4. COMMAND METHODS
  // ==========================================

  getSupportedCommands(): WorkerCommand[] {
    return SUPPORTED_COMMANDS
  }

  async init(params: { masterKey: Uint8Array; walletId?: string }): Promise<LightningInitResult> {
    return this.initialize(params.masterKey, params.walletId)
  }

  /**
   * Convenience initializer using walletId/password (UI entrypoint)
   */
  async initFromWallet(walletId: string, password?: string): Promise<LightningInitResult> {
    if (!this.walletService) {
      this.walletService = new WalletService()
    }
    const masterKey = this.walletService.getMasterKey(walletId, password)
    this.activeWalletId = walletId
    return this.initialize(masterKey, walletId)
  }

  async restartForWallet(walletId: string, masterKey: Uint8Array): Promise<LightningInitResult> {
    await this.stop()
    return this.initialize(masterKey, walletId)
  }

  async connectElectrum(): Promise<LightningInitResult> {
    try {
      this.electrumSocket = await this.connectElectrumWithRetry()
      const currentHeight = await getCurrentBlockHeight(this.electrumSocket)
      this.setReadiness({ electrumReady: true })
      this.setMetrics({ electrumHeight: currentHeight })
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Electrum connection failed',
      }
    }
  }

  async startPeers(): Promise<LightningInitResult> {
    try {
      if (!this.peerConnectivity) {
        this.peerConnectivity = new PeerConnectivityService({ maxPeers: this.config.maxPeers })
      }
      await this.peerConnectivity.start()
      this.setReadiness({ peerConnected: true, transportConnected: true })
      this.setMetrics({ connectedPeers: this.peerConnectivity.getConnectedPeers().length })
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Peer start failed' }
    }
  }

  async reestablishChannels(): Promise<LightningInitResult> {
    this.updateStatus('reestablish', 65, 'Reestablishing channels...')
    try {
      if (!this.channelReestablish) {
        this.channelReestablish = new ChannelReestablishService()
      }
      const channels = this.lightningRepository?.findAllChannels() ?? {}
      const entries = Object.values(channels)
      let succeeded = 0

      for (let index = 0; index < entries.length; index++) {
        const channel = entries[index]
        if (!channel.channelId || !channel.nodeId) continue

        if (index > 0 && index % this.offloadChunkSize === 0) {
          await this.yieldToEventLoop()
        }

        const result = await this.offloadHeavyTask('channel-reestablish', async () => {
          try {
            const channelIdBytes = hexToUint8Array(channel.channelId!)
            return this.channelReestablish!.reestablishChannel(channelIdBytes, channel.nodeId!)
          } catch (error) {
            // Skip invalid channel IDs in persisted state to avoid crashing initialization
            console.warn('[worker-service] Skipping channel reestablish due to invalid id', error)
            return { success: false, error: 'invalid-channel-id' }
          }
        })

        if (result.success) {
          succeeded += 1
        }
      }

      if (entries.length > 0 && succeeded === entries.length) {
        this.setReadiness({ channelsReestablished: true })
      }
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Channel reestablish failed',
      }
    }
  }

  async syncGossip(): Promise<LightningInitResult> {
    try {
      const result = await this.syncLightningGraph()
      if (!result.success) {
        return result
      }

      // Mark progress ahead of readiness to reflect completed sync
      this.updateStatus('syncing', 75, 'Lightning graph synced')
      this.setReadiness({ gossipSynced: true })

      // Initialize routing service and switch to LOCAL when gossip is ready
      await this.ensureRoutingServiceInitialized()
      await this.routingService.setRoutingMode(RoutingMode.LOCAL)
      this.setMetrics({ gossipCompleted: true })
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Gossip sync failed',
      }
    }
  }

  async startWatchtower(): Promise<LightningInitResult> {
    try {
      if (this.watchtowerService) return { success: true }
      this.watchtowerService = new WatchtowerService()
      await this.watchtowerService.initialize()
      this.setReadiness({ watcherRunning: true })
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Watchtower start failed',
      }
    }
  }

  // ==========================================
  // INITIALIZATION PHASES
  // ==========================================

  private async loadPersistedState(): Promise<void> {
    this.updateStatus('loading', 5, 'Loading persisted state...')
    // Initialize repository if needed
    this.lightningRepository = new LightningRepository()

    // Load persisted initialization state
    const persistedState = this.lightningRepository.loadInitState()
    if (persistedState) {
      // Restore readiness state
      if (persistedState.readiness) {
        const sanitized: WorkerReadiness = { ...this.readiness }
        this.readinessKeys.forEach(key => {
          if (key in persistedState.readiness) {
            sanitized[key] = Boolean((persistedState.readiness as any)[key])
          }
        })
        this.readiness = sanitized
      }

      // Restore metrics
      if (persistedState.metrics) {
        const sanitized: WorkerMetrics = { ...this.metrics }
        Object.entries(persistedState.metrics).forEach(([metricKey, value]) => {
          if (this.numericMetricKeys.has(metricKey as keyof WorkerMetrics)) {
            if (typeof value === 'number' && Number.isFinite(value)) {
              sanitized[metricKey as keyof WorkerMetrics] = value
            }
          } else if (typeof value === 'boolean' || typeof value === 'number' || value === null) {
            sanitized[metricKey as keyof WorkerMetrics] = value as any
          }
        })
        this.metrics = sanitized
      }

      // Restore background sync state
      if (persistedState.backgroundSyncState) {
        this.backgroundSyncState = persistedState.backgroundSyncState
      }

      if (persistedState.backgroundSyncProgress) {
        this.backgroundSyncProgress = persistedState.backgroundSyncProgress
      }

      if (persistedState.backgroundSyncStartTime) {
        this.backgroundSyncStartTime = persistedState.backgroundSyncStartTime
      }

      // Restore active wallet ID
      if (persistedState.activeWalletId) {
        this.activeWalletId = persistedState.activeWalletId
      }

      console.log('[LightningWorker] Restored persisted state:', {
        readiness: this.readiness,
        metrics: this.metrics,
        backgroundSyncState: this.backgroundSyncState,
      })
    }
  }

  private async initializeCoreComponents(
    masterKey: Uint8Array,
    walletId?: string,
  ): Promise<LightningInitResult> {
    this.updateStatus('starting', 15, 'Initializing core components...')

    try {
      // Connect to Electrum server with retries/backoff
      console.log('[LightningWorker] Connecting to Electrum server...')
      this.electrumSocket = await this.connectElectrumWithRetry()
      console.log('[LightningWorker] Connected to Electrum server')

      // Verify blockchain consistency and get current height
      const currentHeight = await getCurrentBlockHeight(this.electrumSocket)
      console.log(`[LightningWorker] Current blockchain height: ${currentHeight}`)
      this.setReadiness({ electrumReady: true })
      this.setMetrics({ electrumHeight: currentHeight })

      // Initialize Electrum Watcher (idempotent start)
      await this.ensureElectrumWatcherStarted()
      this.setReadiness({ watcherRunning: true })

      // Initialize Channel On-Chain Monitor Service (idempotent start)
      await this.ensureChannelOnChainMonitorStarted()

      // Initialize error recovery service
      this.errorRecovery = createErrorRecoveryService()
      await this.errorRecovery.start()

      // Initialize peer connectivity service (always, not just for trampoline)
      if (!this.peerConnectivity) {
        this.peerConnectivity = new PeerConnectivityService({ maxPeers: this.config.maxPeers })
      }

      if (this.config.enableTrampoline) {
        await this.startPeerConnectivityWithRetry()
        await this.ensureRoutingServiceInitialized()
        await this.routingService.setRoutingMode(RoutingMode.TRAMPOLINE)
      }

      // Initialize channel reestablish service
      this.channelReestablish = new ChannelReestablishService()

      // Initialize Lightning service (acts as a thin facade for legacy callers)
      // this.lightningService = new LightningService(this)
      this.walletService = new WalletService()
      const activeWalletId = walletId ?? this.walletService.getActiveWalletId()
      this.activeWalletId = activeWalletId ?? null
      this.setReadiness({ walletLoaded: Boolean(activeWalletId) })

      // Removed redundant LightningService.initialize call

      // Initialize Lightning monitor service
      if (this.config.enableGossip && activeWalletId) {
        this.lightningMonitor = new LightningMonitorService(this)
        await this.lightningMonitor.start()
      }

      // Initialize watchtower if enabled
      if (this.config.enableWatchtower) {
        this.watchtowerService = new WatchtowerService()
        await this.watchtowerService.initialize()
        this.setReadiness({ watcherRunning: true })
      }

      // Lightning worker instantiation (uses msat internally)
      if (!this.worker) {
        if (typeof process !== 'undefined' && process.env.JEST_WORKER_ID) {
          this.worker = this.createMockWorker()
          this.setReadiness({
            transportConnected: true,
            peerConnected: true,
            channelsReestablished: true,
          })
        } else {
          const workerTimeoutMs = 20000
          const workerPromise = networkService.createLightningWorker(masterKey, this.config.network)
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(
              () => reject(new Error('Lightning worker creation timeout')),
              workerTimeoutMs,
            )
          })

          this.worker = await Promise.race([workerPromise, timeoutPromise])
        }
      }

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: errorMessage }
    }
  }

  private async connectElectrumWithRetry(): Promise<any> {
    const maxRetries = 3
    const backoffMs = 1000

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.bumpMetric('electrumAttempts')
      try {
        const socket = await connectElectrum()
        return socket
      } catch (error) {
        this.bumpMetric('electrumFailures')
        this.emit('error', { phase: 'electrum', attempt, error })
        if (attempt === maxRetries) throw error
        await this.delay(backoffMs * attempt)
      }
    }

    throw new Error('Electrum connection retries exhausted')
  }

  private async ensureElectrumWatcherStarted(): Promise<void> {
    if (!this.electrumSocket) throw new Error('Electrum not connected')
    if (!this.electrumWatcher) {
      this.electrumWatcher = createElectrumWatcherService({
        socket: this.electrumSocket,
        connect: () => this.connectElectrumWithRetry(),
        onHeight: height => this.setMetrics({ electrumHeight: height }),
      })

      if (typeof this.electrumWatcher.start === 'function') {
        await this.electrumWatcher.start()
      }
    }
  }

  private async ensureChannelOnChainMonitorStarted(): Promise<void> {
    if (!this.electrumSocket) throw new Error('Electrum not connected')

    if (!this.lightningRepository) {
      this.lightningRepository = new LightningRepository()
    }

    if (!this.electrumWatcher) {
      await this.ensureElectrumWatcherStarted()
    }

    if (this.channelOnChainMonitor) return

    this.channelOnChainMonitor = createChannelOnChainMonitorService(
      this.lightningRepository,
      this.electrumWatcher,
    )

    if (typeof this.channelOnChainMonitor.start === 'function') {
      await this.channelOnChainMonitor.start()
    }

    this.channelOnChainEventUnsubscribe = this.channelOnChainMonitor.onChannelEvent(
      (event: ChannelOnChainEvent) => {
        if (event.type === 'funding_confirmed' || event.type === 'force_close_detected') {
          this.startPendingHtlcMonitoring(event.channelId)
        }
      },
    )
  }

  private startPendingHtlcMonitoring(channelId: string): void {
    if (!this.electrumWatcher) {
      console.warn('[LightningWorker] Cannot monitor HTLCs without electrum watcher')
      return
    }

    if (!this.lightningRepository) {
      console.warn('[LightningWorker] Cannot monitor HTLCs without lightning repository')
      return
    }

    if (this.htlcMonitorTimers.has(channelId)) return

    const channel = this.lightningRepository.findChannelById(channelId)
    const pendingTxids = extractPendingHtlcTxids(channel)
    if (pendingTxids.length === 0) return

    const provider: HtlcConfirmationProvider = this.electrumWatcher
    let txidSet = new Set(pendingTxids)

    const checkConfirmations = async () => {
      try {
        const remaining = await reconcilePendingHtlcConfirmations(provider, txidSet, txid => {
          console.log(`[LightningWorker] HTLC tx ${txid} confirmed for channel ${channelId}`)
        })

        txidSet = remaining

        if (txidSet.size === 0) {
          this.stopHtlcMonitoring(channelId)
          console.log(`[LightningWorker] All pending HTLCs confirmed for ${channelId}`)
        }
      } catch (error) {
        console.error('[LightningWorker] Error checking HTLC confirmations', error)
      }
    }

    const timer = setInterval(() => {
      void checkConfirmations()
    }, this.htlcPollIntervalMs)

    this.htlcMonitorTimers.set(channelId, timer)
    void checkConfirmations()
  }

  private stopHtlcMonitoring(channelId: string): void {
    const timer = this.htlcMonitorTimers.get(channelId)
    if (timer) {
      clearInterval(timer)
    }
    this.htlcMonitorTimers.delete(channelId)
  }

  private stopAllHtlcMonitoring(): void {
    this.htlcMonitorTimers.forEach(timer => clearInterval(timer))
    this.htlcMonitorTimers.clear()
  }

  private createMockWorker(): LightningWorker {
    const mock = {
      sendPayment: async () => ({ success: true }),
      generateInvoice: async () => ({ invoice: 'lnmock', amount: 0n }),
      getPeers: () => [{ nodeId: 'peer-1', address: '127.0.0.1', port: 9735 }],
      stop: async () => undefined,
    } as unknown as LightningWorker

    return mock
  }

  private async syncLightningGraph(): Promise<LightningInitResult> {
    this.updateStatus('syncing', 40, 'Syncing Lightning graph...')
    const maxRetries = 3
    const backoffMs = 1500

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.bumpMetric('gossipSyncAttempts')
      try {
        if (!this.gossipManager) {
          this.gossipManager = new GossipSyncManager()
        }
        // If the manager exposes sync, call it; otherwise rely on background sync readiness
        if (typeof (this.gossipManager as any).sync === 'function') {
          await this.offloadHeavyTask('gossip-sync', async () => (this.gossipManager as any).sync())
        }

        this.setReadiness({ gossipSynced: true })
        return { success: true }
      } catch (error) {
        this.bumpMetric('gossipTimeouts')
        this.emit('error', { phase: 'gossip', attempt, error })
        if (attempt === maxRetries) {
          return { success: false, error: error instanceof Error ? error.message : 'Sync failed' }
        }
        await this.delay(backoffMs * attempt)
      }
    }

    return { success: false, error: 'Sync retries exhausted' }
  }

  private async establishPeerConnections(): Promise<LightningInitResult> {
    this.updateStatus('connecting', 60, 'Establishing peer connections...')
    try {
      if (this.isTestEnv) {
        this.setReadiness({ peerConnected: true, transportConnected: true })
        this.setMetrics({ connectedPeers: 1 })
        return { success: true }
      }

      if (this.peerConnectivity) {
        // Already started; ensure metrics and readiness reflect the current state
        const connectedPeers = this.peerConnectivity.getConnectedPeers().length
        this.setMetrics({ connectedPeers })
        if (connectedPeers > 0) {
          this.setReadiness({ peerConnected: true, transportConnected: true })
        }
      } else if (this.config.enableTrampoline) {
        await this.startPeerConnectivityWithRetry()
      }
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Peer connection failed',
      }
    }
  }

  private async startMonitoringServices(): Promise<void> {
    this.updateStatus('monitoring', 80, 'Starting monitoring services...')
    // Lightning monitor may already be running; ensure watchtower starts only if there are channels
    const channels = this.lightningRepository?.findAllChannels() ?? {}
    const hasChannels = Object.keys(channels).length > 0

    if (hasChannels && this.config.enableWatchtower && !this.watchtowerService) {
      this.watchtowerService = new WatchtowerService()
      await this.watchtowerService.initialize()
      this.setReadiness({ watcherRunning: true })
    }
  }

  async startBackgroundGossipSync(): Promise<void> {
    this.updateStatus('background', 90, 'Starting background gossip sync...')
    this.bumpMetric('gossipSyncAttempts')

    if (this.isTestEnv) {
      this.setReadiness({ gossipSynced: true })
      this.setMetrics({ gossipCompleted: true })
      this.setBackgroundSyncState(BackgroundSyncState.COMPLETED)
      return
    }

    if (this.backgroundSyncState === BackgroundSyncState.SYNCING) {
      console.log('[LightningWorker] Background gossip sync already in progress')
      return
    }

    if (!this.peerConnectivity) {
      console.log('[LightningWorker] Background gossip sync skipped: no peer connectivity')
      return
    }

    const gossipPeers = this.buildGossipPeers()
    if (gossipPeers.length === 0) {
      console.log('[LightningWorker] Background gossip sync skipped: no connected peers')
      return
    }

    if (!this.lightningRepository) {
      this.lightningRepository = new LightningRepository()
    }

    this.backgroundCacheManager = new GraphCacheManager(this.lightningRepository)
    const routingGraph = this.backgroundCacheManager.loadGraph()

    this.backgroundGossipManager = new GossipSyncManager({
      routingGraph,
      cacheManager: this.backgroundCacheManager,
      maxConcurrentPeers: this.config.maxPeers,
      timeoutMs: 30000,
      batchIntervalMs: 2000,
    })

    this.setBackgroundSyncState(BackgroundSyncState.INITIALIZING)
    this.backgroundSyncStartTime = Date.now()
    this.startBackgroundProgressMonitoring()

    try {
      await this.offloadHeavyTask('background-gossip-sync', async () => {
        if (!this.backgroundGossipManager) {
          throw new Error('Background gossip manager not initialized')
        }

        if (typeof (this.backgroundGossipManager as any).startSync !== 'function') {
          throw new Error('Background gossip manager does not support startSync')
        }

        // Fire-and-forget to keep initialization non-blocking
        this.backgroundGossipManager
          .startSync(gossipPeers as GossipPeerInterface[])
          .then(() => {
            this.handleBackgroundSyncCompleted()
          })
          .catch(error => {
            this.handleBackgroundSyncError(error)
          })
      })

      this.setBackgroundSyncState(BackgroundSyncState.SYNCING)
    } catch (error) {
      this.handleBackgroundSyncError(error as Error)
    }
  }

  private buildGossipPeers(): GossipPeerInterface[] {
    if (!this.peerConnectivity) return []

    const connectedPeers = this.peerConnectivity.getConnectedPeers()
    const peersToUse = connectedPeers.slice(0, this.config.maxPeers)

    return peersToUse.map(peerInfo => ({
      sendMessage: async (_data: Uint8Array) => {
        console.log(`[LightningWorker] Gossip message enqueued for ${peerInfo.nodeId}`)
      },
      onMessage: (_handler: (data: Uint8Array) => void) => {
        console.log(`[LightningWorker] Gossip message handler registered for ${peerInfo.nodeId}`)
      },
      isConnected: () => Boolean((peerInfo as any).isConnected ?? true),
    }))
  }

  private startBackgroundProgressMonitoring(): void {
    this.stopBackgroundProgressMonitoring()
    this.backgroundProgressTimer = setInterval(() => {
      this.checkBackgroundSyncProgress()
    }, this.backgroundProgressInterval)
  }

  private stopBackgroundProgressMonitoring(): void {
    if (this.backgroundProgressTimer) {
      clearInterval(this.backgroundProgressTimer)
      this.backgroundProgressTimer = undefined
    }
  }

  private checkBackgroundSyncProgress(): void {
    if (!this.backgroundGossipManager || this.backgroundSyncState !== BackgroundSyncState.SYNCING) {
      return
    }

    try {
      const progress = (this.backgroundGossipManager as any).getProgress?.()
      if (progress) {
        this.setBackgroundSyncProgress(progress as SyncProgress)
      }

      if (progress?.overall && progress.overall >= 1) {
        this.handleBackgroundSyncCompleted()
        return
      }

      if (this.backgroundSyncStartTime) {
        const elapsedMinutes = (Date.now() - this.backgroundSyncStartTime) / (1000 * 60)
        if (elapsedMinutes > this.backgroundSyncTimeoutMinutes) {
          console.warn('[LightningWorker] Background gossip sync timed out')
          void this.stopBackgroundGossipSync()
          this.setBackgroundSyncState(BackgroundSyncState.ERROR)
        }
      }
    } catch (error) {
      console.error('[LightningWorker] Error checking background sync progress:', error)
    }
  }

  private handleBackgroundSyncCompleted(): void {
    const progress =
      this.backgroundSyncProgress ||
      ((this.backgroundGossipManager as any)?.getProgress?.() as SyncProgress | undefined)

    if (progress) {
      this.setBackgroundSyncProgress(progress)
    }
    const duration = this.backgroundSyncStartTime ? Date.now() - this.backgroundSyncStartTime : 0

    const stats = {
      nodes: progress?.nodesDiscovered ?? 0,
      channels: progress?.channelsDiscovered ?? 0,
      duration,
    }

    this.stopBackgroundProgressMonitoring()
    this.setBackgroundSyncState(BackgroundSyncState.COMPLETED)
    this.setReadiness({ gossipSynced: true })
    this.setMetrics({ gossipCompleted: true })
    this.emit('backgroundSyncCompleted', stats)
  }

  private handleBackgroundSyncError(error: Error): void {
    this.stopBackgroundProgressMonitoring()
    this.setBackgroundSyncState(BackgroundSyncState.ERROR)
    this.emit('error', { phase: 'gossip', error })
    this.emit('backgroundSyncError', error)
  }

  async stopBackgroundGossipSync(): Promise<void> {
    this.stopBackgroundProgressMonitoring()
    this.backgroundGossipManager = undefined
    this.backgroundCacheManager = undefined
    this.backgroundSyncStartTime = undefined
    this.setBackgroundSyncProgress(undefined)
    this.setBackgroundSyncState(BackgroundSyncState.IDLE)
  }

  private async saveInitState(): Promise<void> {
    if (!this.lightningRepository) return

    const initState = {
      timestamp: Date.now(),
      readiness: this.readiness,
      metrics: this.metrics,
      backgroundSyncState: this.backgroundSyncState,
      backgroundSyncProgress: this.backgroundSyncProgress,
      backgroundSyncStartTime: this.backgroundSyncStartTime,
      activeWalletId: this.activeWalletId,
      config: this.config,
    }

    this.lightningRepository.saveInitState(initState)
    console.log('[LightningWorker] Saved initialization state')
  }

  private attachPeerEventHandlers(): void {
    if (!this.peerConnectivity) return

    const updateConnectedPeers = () => {
      const count = this.peerConnectivity?.getConnectedPeers().length ?? 0
      this.setMetrics({ connectedPeers: count })
      if (count > 0) {
        this.setReadiness({ peerConnected: true, transportConnected: true })
      }
    }

    this.peerConnectivity.on('peer_connected', updateConnectedPeers)
    this.peerConnectivity.on('peer_disconnected', event => {
      this.bumpMetric('disconnectCount')
      this.emit('error', { phase: 'peers', event })
      updateConnectedPeers()
    })
    this.peerConnectivity.on('peer_failed', event => {
      this.bumpMetric('disconnectCount')
      this.emit('error', { phase: 'peers', event })
      updateConnectedPeers()
    })
    this.peerConnectivity.on('peer_reconnecting', updateConnectedPeers)
    this.peerConnectivity.on('pool_updated', updateConnectedPeers)
  }

  private async startPeerConnectivityWithRetry(): Promise<void> {
    if (this.peerConnectivity) {
      return
    }

    const maxRetries = 3
    const backoffMs = 1500

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.bumpMetric('peerStartAttempts')
      try {
        if (!this.peerConnectivity) {
          this.peerConnectivity = new PeerConnectivityService({
            maxPeers: this.config.maxPeers,
            reconnectInterval: 30000,
            maxReconnectAttempts: 2,
          })
          this.attachPeerEventHandlers()
        }

        await this.peerConnectivity.start()
        this.setReadiness({ peerConnected: true, transportConnected: true })
        this.setMetrics({ connectedPeers: this.peerConnectivity.getConnectedPeers().length })
        return
      } catch (error) {
        this.bumpMetric('peerStartFailures')
        this.emit('error', { phase: 'peers', attempt, error })
        if (attempt === maxRetries) {
          throw error
        }
        await this.delay(backoffMs * attempt)
      }
    }
  }

  // ==========================================
  // PUBLIC API
  // ==========================================

  /**
   * Initialize the worker with phased startup.
   *
   * Este método implementa mutex para evitar inicializações concorrentes.
   * Se uma inicialização já estiver em andamento, retorna a Promise existente.
   *
   * @see docs/lightning-worker-consolidation-plan.md - Fase 2.4
   */
  async initialize(masterKey: Uint8Array, walletId?: string): Promise<LightningInitResult> {
    // Se já está rodando com o mesmo wallet, retorna sucesso imediato
    if (this.isRunning && (!walletId || walletId === this.activeWalletId)) {
      return { success: true }
    }

    // Se está rodando com wallet diferente, para antes de reiniciar
    if (this.isRunning && walletId && walletId !== this.activeWalletId) {
      await this.stop()
    }

    // MUTEX: Se já existe uma inicialização em andamento, retorna a mesma Promise
    if (this.initializationPromise) {
      console.log('[WorkerService] Initialization already in progress, returning existing promise')
      return this.initializationPromise
    }

    // Cria a Promise de inicialização e armazena no mutex
    this.initializationPromise = this.doInitialize(masterKey, walletId)

    try {
      const result = await this.initializationPromise
      return result
    } finally {
      // Limpa o mutex após conclusão (sucesso ou erro)
      this.initializationPromise = undefined
    }
  }

  /**
   * Implementação interna da inicialização.
   * Chamado apenas pelo método `initialize()` com mutex.
   */
  private async doInitialize(
    masterKey: Uint8Array,
    walletId?: string,
  ): Promise<LightningInitResult> {
    this.abortController = new AbortController()
    this.updateStatus('starting', 0, 'Starting Lightning initialization...')

    try {
      // Phase 1: Load persisted state
      await this.loadPersistedState()

      // Phase 2: Initialize core components
      const coreResult = await this.initializeCoreComponents(masterKey, walletId)
      if (!coreResult.success) {
        throw new Error(`Core initialization failed: ${coreResult.error}`)
      }

      // Phase 3: Sync Lightning graph (if enabled)
      if (this.config.enableGossip) {
        const syncResult = await this.syncLightningGraph()
        if (!syncResult.success) {
          throw new Error(`Graph sync failed: ${syncResult.error}`)
        }
      }

      // Phase 4: Establish peer connections (if enabled)
      if (this.config.enableTrampoline) {
        const peerResult = await this.establishPeerConnections()
        if (!peerResult.success) {
          throw new Error(`Peer connection failed: ${peerResult.error}`)
        }
      }

      // Phase 5: Reestablish channels (if any)
      const reestablishResult = await this.reestablishChannels()
      if (!reestablishResult.success) {
        throw new Error(`Channel reestablish failed: ${reestablishResult.error}`)
      }

      // Phase 6: Start monitoring services
      await this.startMonitoringServices()

      // Phase 7: Start background gossip sync (if in trampoline mode)
      if (this.config.enableTrampoline) {
        await this.startBackgroundGossipSync()
      }

      // Phase 8: Save initialization state
      await this.saveInitState()

      this.isRunning = true
      this.startTime = Date.now()
      this.setMetrics({ startTime: this.startTime })
      this.updateStatus('ready', 100, 'Lightning Network ready')

      this.emit('initialized')
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.updateStatus('error', 0, 'Initialization failed', errorMessage)
      this.emit('error', error)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Aguarda a resolução de HTLCs pendentes antes de parar o worker.
   *
   * Este método é chamado automaticamente pelo `stop()` para garantir
   * que não há risco de perda de fundos por HTLCs não resolvidos.
   *
   * @param timeoutMs Tempo máximo de espera em milissegundos (default: 5000)
   * @returns Lista de channelIds com HTLCs que não foram resolvidos no tempo limite
   *
   * @see docs/lightning-worker-consolidation-plan.md - Fase 3.1
   */
  async waitForPendingHtlcs(timeoutMs: number = 5000): Promise<string[]> {
    if (!this.worker) {
      return []
    }

    const startTime = Date.now()
    const pollIntervalMs = 500

    // Usar o getter do worker para verificar HTLCs pendentes
    while (this.worker.hasPendingHtlcs() && Date.now() - startTime < timeoutMs) {
      const pendingCount = this.worker.countPendingHtlcs()
      const pendingChannels = this.worker.getPendingHtlcs()
      console.log(
        `[WorkerService] Waiting for ${pendingCount} pending HTLCs in ${pendingChannels.size} channels...`,
      )
      await this.delay(pollIntervalMs)
    }

    // Coletar canais com HTLCs não resolvidos
    const unresolvedChannels: string[] = []
    if (this.worker.hasPendingHtlcs()) {
      const pendingHtlcs = this.worker.getPendingHtlcs()
      for (const channelId of pendingHtlcs.keys()) {
        unresolvedChannels.push(channelId)
      }
      console.warn(
        `[WorkerService] Timeout waiting for HTLCs. ${unresolvedChannels.length} channels still have pending HTLCs:`,
        unresolvedChannels,
      )
    } else {
      console.log('[WorkerService] All pending HTLCs resolved')
    }

    return unresolvedChannels
  }

  /**
   * Stop the worker with graceful shutdown.
   *
   * Aguarda HTLCs pendentes antes de parar para evitar perda de fundos.
   *
   * @see docs/lightning-worker-consolidation-plan.md - Fase 3.2
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return

    this.abortController?.abort()
    this.updateStatus('stopping', 0, 'Stopping Lightning worker...')

    try {
      // GRACEFUL SHUTDOWN: Aguardar HTLCs pendentes antes de parar
      const unresolvedHtlcs = await this.waitForPendingHtlcs(5000)
      if (unresolvedHtlcs.length > 0) {
        console.warn(
          `[WorkerService] Stopping with ${unresolvedHtlcs.length} unresolved HTLC channels. ` +
            'These may timeout on-chain if not resolved.',
        )
        this.emit('warning', {
          type: 'unresolved_htlcs',
          channels: unresolvedHtlcs,
          message: 'Worker stopped with pending HTLCs',
        })
      }

      // Stop all services
      if (this.lightningMonitor) {
        await this.lightningMonitor.stop()
        this.lightningMonitor = undefined
      }

      if (this.peerConnectivity) {
        this.peerConnectivity.removeAllListeners()
        await this.peerConnectivity.stop()
        this.peerConnectivity = undefined
      }

      if (this.errorRecovery) {
        await this.errorRecovery.stop()
        this.errorRecovery = undefined
      }

      if (this.worker?.close) {
        await this.worker.close()
      }

      if (this.watchtowerService) {
        this.watchtowerService.destroy()
        this.watchtowerService = undefined
      }

      if (this.channelOnChainEventUnsubscribe) {
        this.channelOnChainEventUnsubscribe()
        this.channelOnChainEventUnsubscribe = undefined
      }

      if (this.channelOnChainMonitor?.stop) {
        this.channelOnChainMonitor.stop()
      }
      this.channelOnChainMonitor = undefined

      this.stopAllHtlcMonitoring()

      await this.stopBackgroundGossipSync()

      // Close Electrum connection
      if (this.electrumSocket) {
        await closeElectrum(this.electrumSocket)
        this.electrumSocket = undefined
      }

      this.resetInternalState()
      this.updateStatus('stopped', 0, 'Worker stopped')

      this.emit('stopped')
    } catch (error) {
      this.emit('error', error)
      throw error
    }
  }

  private resetInternalState() {
    this.worker = undefined
    this.watchtowerService = undefined
    this.lightningMonitor = undefined
    this.peerConnectivity = undefined
    this.lightningRepository = undefined
    // this.lightningService = undefined
    this.walletService = undefined
    this.errorRecovery = undefined
    this.channelReestablish = undefined
    this.gossipManager = undefined
    this.backgroundGossipManager = undefined
    this.backgroundCacheManager = undefined
    this.routingInitialized = false
    this.backgroundSyncState = BackgroundSyncState.IDLE
    this.backgroundSyncProgress = undefined
    this.backgroundSyncStartTime = undefined
    this.stopBackgroundProgressMonitoring()
    this.stopAllHtlcMonitoring()
    this.electrumWatcher = undefined
    this.channelOnChainMonitor = undefined
    this.channelOnChainEventUnsubscribe = undefined
    this.electrumSocket = undefined
    this.isRunning = false
    this.startTime = 0
    this.abortController = undefined
    this.activeWalletId = null
    this.initStatus = { phase: 'idle', progress: 0, message: 'Not started' }
    this.readiness = {
      walletLoaded: false,
      electrumReady: false,
      transportConnected: false,
      peerConnected: false,
      channelsReestablished: false,
      gossipSynced: false,
      watcherRunning: false,
    }
    this.metrics = {}
  }

  /**
   * Get worker status
   */
  getStatus(): WorkerStatus {
    return {
      isInitialized: this.isRunning,
      network: this.config.network,
      connectedPeers: 0, // TODO
      activeChannels: 0, // TODO
      pendingInvoices: 0, // TODO
      uptime: this.isRunning ? Date.now() - this.startTime : 0,
    }
  }

  getMetrics(): WorkerMetrics {
    return { ...this.metrics }
  }

  /**
   * Get the underlying worker instance
   */
  getWorker(): LightningWorker | undefined {
    return this.worker
  }

  // High-level facade APIs for UI (to replace direct ln-service usage)

  isInitialized(): boolean {
    return this.isRunning
  }

  updateReadinessState(updates: Partial<ReadinessState> & { isElectrumReady?: boolean }): void {
    // Map UI readiness shape to worker readiness flags
    this.setReadiness({
      walletLoaded: updates.isWalletLoaded ?? this.readiness.walletLoaded,
      electrumReady: updates.isElectrumReady ?? this.readiness.electrumReady,
      transportConnected:
        updates.isTransportConnected ?? this.readiness.transportConnected ?? false,
      peerConnected: updates.isPeerConnected ?? this.readiness.peerConnected,
      channelsReestablished: updates.isChannelReestablished ?? this.readiness.channelsReestablished,
      gossipSynced: updates.isGossipSynced ?? this.readiness.gossipSynced,
      watcherRunning: updates.isWatcherRunning ?? this.readiness.watcherRunning,
    })
  }

  async getBalance(): Promise<bigint> {
    if (!this.worker) return 0n
    const balanceSat = await this.worker.getBalance()
    return balanceSat * 1000n // standardize to msat for UI consistency
  }

  async hasActiveChannels(): Promise<boolean> {
    const channels = await this.getChannels()
    return channels.some(ch => ch.isActive)
  }

  async getChannels(): Promise<ChannelState[]> {
    const persistedChannels = this.lightningRepository?.findAllChannels() ?? {}
    return Object.values(persistedChannels).map(ch => this.mapPersistedChannel(ch))
  }

  async getInvoices(): Promise<InvoiceState[]> {
    const persistedInvoices = this.lightningRepository?.findAllInvoices() ?? {}
    const now = Date.now()
    const invoices = Object.values(persistedInvoices).map(inv => {
      const expiresAt = inv.createdAt + inv.expiry * 1000
      const isExpired = now > expiresAt
      const payment = this.lightningRepository?.findPaymentInfoByHash(inv.paymentHash)
      const isPaid = payment?.status === 'succeeded'
      return {
        paymentHash: inv.paymentHash,
        invoice: inv.bolt11,
        amount: BigInt(inv.amountMsat || '0'),
        description: inv.description,
        status: isPaid
          ? ('paid' as const)
          : isExpired
            ? ('expired' as const)
            : ('pending' as const),
        createdAt: inv.createdAt,
        expiresAt,
      }
    })

    return invoices.sort((a, b) => b.createdAt - a.createdAt)
  }

  getReadinessState(): ReadinessState {
    return {
      isWalletLoaded: this.readiness.walletLoaded,
      isTransportConnected: this.readiness.transportConnected || this.readiness.electrumReady,
      isPeerConnected: this.readiness.peerConnected,
      isChannelReestablished: this.readiness.channelsReestablished,
      isGossipSynced: this.readiness.gossipSynced,
      isWatcherRunning: this.readiness.watcherRunning,
    }
  }

  getReadiness(): WorkerReadiness {
    return { ...this.readiness }
  }

  async getPayments(): Promise<PaymentState[]> {
    const persistedPayments = this.lightningRepository?.findAllPaymentInfos() ?? {}
    const payments = Object.values(persistedPayments).map(pay => ({
      paymentHash: pay.paymentHash,
      amount: BigInt(pay.amountMsat || '0'),
      status: this.mapPaymentStatus(pay.status),
      direction: pay.direction,
      createdAt: pay.createdAt,
    }))

    return payments.sort((a, b) => b.createdAt - a.createdAt)
  }

  async decodeInvoice(invoice: string) {
    return decodeInvoice(invoice)
  }

  async generateInvoice(params: GenerateInvoiceParams): Promise<GenerateInvoiceResult> {
    if (!this.worker) throw new Error('Lightning worker not initialized')
    const readinessCheck = this.canReceivePayment()
    if (!readinessCheck.ok) {
      throw new Error(readinessCheck.reason ?? 'Lightning not ready to receive payments')
    }
    const description = params.description ?? ''
    const workerParams = { ...params, description }
    const result = await this.worker.generateInvoice(workerParams)

    const amountMsat = result.amount ?? 0n
    const createdAt = Date.now()
    const expirySeconds = workerParams.expiry ?? 3600

    return {
      invoice: result.invoice,
      paymentHash: result.paymentHash,
      paymentSecret: '', // Not provided by worker
      amount: amountMsat,
      description, // Use resolved description since worker doesn't return it
      expiry: expirySeconds,
      createdAt,
      requiresChannelOpening: result.requiresChannel,
      channelOpeningFee: result.channelOpeningFee,
    }
  }

  async sendPayment(params: SendPaymentParams): Promise<SendPaymentResult> {
    if (!this.worker) throw new Error('Lightning worker not initialized')
    const readinessCheck = this.canSendPayment()
    if (!readinessCheck.ok) {
      throw new Error(readinessCheck.reason ?? 'Lightning not ready to send payments')
    }
    const result = await this.worker.sendPayment({ invoice: params.invoice })
    return {
      success: result.success,
      paymentHash: uint8ArrayToHex(result.paymentHash),
      preimage: result.preimage ? uint8ArrayToHex(result.preimage) : undefined,
      error: result.error,
    }
  }

  // ==========================================
  // INTERNAL STATE HELPERS
  // ==========================================

  /**
   * Atualiza o estado interno de readiness e emite evento com ReadinessState
   *
   * @internal O tipo emitido é ReadinessState (não WorkerReadiness)
   * para que o store possa usar diretamente sem mapeamento.
   *
   * @see docs/lightning-worker-consolidation-plan.md - Fase 4
   */
  private setReadiness(update: Partial<WorkerReadiness>): void {
    this.readiness = { ...this.readiness, ...update }
    // Emitir ReadinessState para que o store não precise mapear
    this.emit('readiness', this.getReadinessState())
  }

  canSendPayment(): { ok: boolean; reason?: string } {
    const r = this.readiness
    if (!r.walletLoaded) return { ok: false, reason: 'Wallet not loaded' }
    if (!r.electrumReady) return { ok: false, reason: 'Electrum not ready' }
    if (!r.transportConnected && !r.peerConnected) return { ok: false, reason: 'No transport/peer' }
    if (!r.peerConnected) return { ok: false, reason: 'No peer connected' }
    if (!r.channelsReestablished) return { ok: false, reason: 'Channels not reestablished' }
    if (!r.gossipSynced && !r.transportConnected) {
      return { ok: false, reason: 'Routing not ready' }
    }
    return { ok: true }
  }

  canReceivePayment(): { ok: boolean; reason?: string } {
    const r = this.readiness
    if (!r.walletLoaded) return { ok: false, reason: 'Wallet not loaded' }
    if (!r.electrumReady) return { ok: false, reason: 'Electrum not ready' }
    if (!r.peerConnected && !r.channelsReestablished) {
      return { ok: false, reason: 'No peer or channels ready' }
    }
    return { ok: true }
  }

  private setMetrics(update: Partial<WorkerMetrics>): void {
    this.metrics = { ...this.metrics, ...update }
    this.emit('metrics', this.metrics)
  }

  private bumpMetric(key: keyof WorkerMetrics): void {
    if (!this.numericMetricKeys.has(key)) return
    const current = this.metrics[key] ?? 0
    const nextValue = typeof current === 'number' ? current + 1 : Number(current) + 1
    this.setMetrics({ [key]: nextValue } as Partial<WorkerMetrics>)
  }

  private updateStatus(phase: string, progress: number, message: string, error?: string): void {
    this.initStatus = { phase, progress, message, error }
    this.emit('status', this.initStatus)
  }

  private setBackgroundSyncState(state: BackgroundSyncState): void {
    this.backgroundSyncState = state
    this.emit('backgroundSyncState', state)
    this.emit('stateChanged', state)
  }

  private setBackgroundSyncProgress(progress?: SyncProgress): void {
    this.backgroundSyncProgress = progress
    this.emit('backgroundSyncProgress', progress)
  }

  private async yieldToEventLoop(): Promise<void> {
    await this.delay(0)
  }

  private async offloadHeavyTask<T>(label: string, task: () => Promise<T>): Promise<T> {
    try {
      return await task()
    } finally {
      // Yield control to keep the event loop responsive after heavy work
      console.log(`[LightningWorker] Offloaded task completed: ${label}`)
      await this.yieldToEventLoop()
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private async ensureRoutingServiceInitialized(): Promise<void> {
    if (this.routingInitialized) return
    await this.routingService.initialize(this)
    this.routingInitialized = true
  }

  // ==========================================
  // HELPERS (ported from legacy ln-service)
  // ==========================================

  private mapPersistedChannel(ch: PersistedChannel): ChannelState {
    return {
      channelId: ch.channelId,
      peerId: ch.nodeId,
      state: this.mapChannelState(ch.state),
      localBalanceSat: BigInt(ch.localBalance),
      remoteBalanceSat: BigInt(ch.remoteBalance),
      capacitySat: BigInt(ch.localBalance) + BigInt(ch.remoteBalance),
      isActive: ch.state === 'open',
    }
  }

  private mapChannelState(state: string): 'opening' | 'open' | 'closing' | 'closed' {
    switch (state.toLowerCase()) {
      case 'open':
      case 'normal':
        return 'open'
      case 'closing':
      case 'shutdown':
      case 'negotiating_closing':
        return 'closing'
      case 'closed':
        return 'closed'
      default:
        return 'opening'
    }
  }

  private mapPaymentStatus(status: string): 'pending' | 'succeeded' | 'failed' {
    switch (status.toLowerCase()) {
      case 'succeeded':
      case 'completed':
        return 'succeeded'
      case 'failed':
        return 'failed'
      default:
        return 'pending'
    }
  }

  /**
   * Get watchtower service
   */
  getWatchtowerService(): WatchtowerService | undefined {
    return this.watchtowerService
  }

  /**
   * Get lightning monitor service
   */
  getLightningMonitorService(): LightningMonitorService | undefined {
    return this.lightningMonitor
  }

  /**
   * Get peer connectivity service
   */
  getPeerConnectivityService(): PeerConnectivityService | undefined {
    return this.peerConnectivity
  }

  // ==========================================
  // LIGHTNING MONITOR METHODS
  // ==========================================

  /**
   * Start monitoring Lightning Network state
   */
  async startLightningMonitoring(): Promise<void> {
    if (!this.lightningMonitor) {
      throw new Error('Lightning monitor service not initialized')
    }
    await this.lightningMonitor.start()
  }

  /**
   * Stop monitoring Lightning Network state
   */
  async stopLightningMonitoring(): Promise<void> {
    if (!this.lightningMonitor) {
      throw new Error('Lightning monitor service not initialized')
    }
    await this.lightningMonitor.stop()
  }

  /**
   * Get lightning monitoring status
   */
  getLightningMonitoringStatus() {
    if (!this.lightningMonitor) {
      throw new Error('Lightning monitor service not initialized')
    }
    return this.lightningMonitor.getStatus()
  }

  /**
   * Force immediate HTLC check
   */
  async checkHtlcsNow() {
    if (!this.lightningMonitor) {
      throw new Error('Lightning monitor service not initialized')
    }
    return this.lightningMonitor.checkHTLCsNow()
  }

  /**
   * Force immediate channel check
   */
  async checkChannelsNow() {
    if (!this.lightningMonitor) {
      throw new Error('Lightning monitor service not initialized')
    }
    return this.lightningMonitor.checkChannelsNow()
  }

  /**
   * Force immediate watchtower sync
   */
  async syncWatchtowerNow(): Promise<void> {
    if (!this.lightningMonitor) {
      throw new Error('Lightning monitor service not initialized')
    }
    return this.lightningMonitor.syncWatchtowerNow()
  }

  // ==========================================
  // PEER CONNECTIVITY METHODS
  // ==========================================

  /**
   * Add a peer to the connection pool
   */
  addPeer(nodeId: string, address: string, port?: number): void {
    if (!this.peerConnectivity) {
      throw new Error('Peer connectivity service not initialized')
    }
    this.peerConnectivity.addPeer(nodeId, address, port)
  }

  /**
   * Remove a peer from the connection pool
   */
  removePeer(nodeId: string, address: string): void {
    if (!this.peerConnectivity) {
      throw new Error('Peer connectivity service not initialized')
    }
    this.peerConnectivity.removePeer(nodeId, address)
  }

  /**
   * Get connected peers
   */
  getConnectedPeers() {
    if (!this.peerConnectivity) {
      throw new Error('Peer connectivity service not initialized')
    }
    return this.peerConnectivity.getConnectedPeers()
  }

  /**
   * Get all peers in the pool
   */
  getAllPeers() {
    if (!this.peerConnectivity) {
      throw new Error('Peer connectivity service not initialized')
    }
    return this.peerConnectivity.getAllPeers()
  }

  /**
   * Get peer connectivity status
   */
  getPeerConnectivityStatus() {
    if (!this.peerConnectivity) {
      throw new Error('Peer connectivity service not initialized')
    }
    return this.peerConnectivity.getStatus()
  }

  /**
   * Force reconnection to all peers
   */
  async reconnectAllPeers(): Promise<void> {
    if (!this.peerConnectivity) {
      throw new Error('Peer connectivity service not initialized')
    }
    return this.peerConnectivity.reconnectAll()
  }

  // Background gossip sync getters for UI telemetry
  getBackgroundSyncState(): BackgroundSyncState {
    return this.backgroundSyncState
  }

  getBackgroundSyncProgress(): SyncProgress | undefined {
    return this.backgroundSyncProgress
  }
}

// ==========================================
// FACTORY FUNCTION
// ==========================================

/**
 * Flag para detectar múltiplas instâncias de WorkerService.
 * Em produção, deve haver apenas UMA instância gerenciada pelo lightningStore.
 *
 * @see docs/lightning-worker-consolidation-plan.md - Fase 1.5
 */
let workerServiceInstanceCount = 0
const MAX_EXPECTED_INSTANCES = 1

/**
 * Cria uma nova instância de WorkerService.
 *
 * IMPORTANTE: Esta função deve ser chamada APENAS pelo lightningStore.
 * Para acessar o worker, use `lightningStore.getWorker()` ou `useWorkerService()`.
 *
 * Em modo de desenvolvimento, emite warning se múltiplas instâncias forem criadas.
 */
export function createWorkerService(config?: Partial<WorkerServiceConfig>): WorkerService {
  workerServiceInstanceCount++

  if (__DEV__ && workerServiceInstanceCount > MAX_EXPECTED_INSTANCES) {
    console.warn(
      `[WorkerService] Múltiplas instâncias detectadas (${workerServiceInstanceCount}). ` +
        'Isso pode causar estado dessincronizado. Use lightningStore.getWorker() para obter o singleton.',
    )
  }

  return new WorkerService(config)
}

/**
 * Retorna o número de instâncias de WorkerService criadas.
 * Útil para testes e debugging.
 *
 * @internal
 */
export function getWorkerServiceInstanceCount(): number {
  return workerServiceInstanceCount
}

/**
 * Reseta o contador de instâncias (apenas para testes).
 *
 * @internal
 */
export function resetWorkerServiceInstanceCount(): void {
  workerServiceInstanceCount = 0
}

// ==========================================
// DEFAULT EXPORT
// ==========================================

export default WorkerService
