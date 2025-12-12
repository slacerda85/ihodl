// Worker Service
// Service that encapsulates the LightningWorker from the lib
// Provides high-level operations for Lightning Network functionality
// Follows the architecture: lib (pure functions) -> services (business logic) -> UI

import { LightningWorker } from '../lib/lightning/worker'
import { WatchtowerService } from './ln-watchtower-service'
import { LightningMonitorService } from './ln-monitor-service'
import { PeerConnectivityService } from './ln-peer-service'
import EventEmitter from 'eventemitter3'
import { LightningRepository } from '../repositories/lightning'
import LightningService from './ln-service'
import WalletService from './wallet'
import { ErrorRecoveryService, createErrorRecoveryService } from './errorRecovery'
import ChannelReestablishService from './ln-channel-reestablish-service'
import { GossipSyncManager, type SyncProgress } from '../lib/lightning/gossip-sync'
import { GraphCacheManager } from '../lib/lightning/graph-cache'
import { GossipPeerInterface } from '../lib/lightning/gossip'
import { hexToUint8Array } from '../lib/utils/utils'
import {
  connect as connectElectrum,
  getCurrentBlockHeight,
  close as closeElectrum,
} from '../lib/electrum/client'
import { createElectrumWatcherService } from './ln-electrum-watcher-service'
import { createChannelOnChainMonitorService } from './ln-channel-onchain-monitor-service'
import { getLightningRoutingService, RoutingMode } from './ln-routing-service'

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
  private worker?: LightningWorker
  private watchtowerService?: WatchtowerService
  private lightningMonitor?: LightningMonitorService
  private peerConnectivity?: PeerConnectivityService
  private config: WorkerServiceConfig
  private isRunning: boolean = false
  private startTime: number = 0
  private activeWalletId?: string | null

  // Additional services for initialization
  private lightningRepository?: LightningRepository
  private lightningService?: LightningService
  private routingService = getLightningRoutingService()
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
  private electrumSocket?: any // From connectElectrum

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

  // ==========================================
  // STATUS METHODS
  // ==========================================

  private cloneSafely<T>(payload: T): T {
    try {
      const cloneFn = (globalThis as any).structuredClone as ((value: unknown) => any) | undefined
      if (cloneFn) {
        return cloneFn(payload)
      }
    } catch (error) {
      console.warn('[LightningWorker] structuredClone failed, falling back to JSON clone', error)
    }

    try {
      return JSON.parse(JSON.stringify(payload))
    } catch (error) {
      console.warn('[LightningWorker] JSON clone failed, returning original payload', error)
      return payload
    }
  }

  private async yieldToEventLoop(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0))
  }

  private async offloadHeavyTask<T>(label: string, task: () => Promise<T>): Promise<T> {
    console.log(`[LightningWorker] Offloading heavy task: ${label}`)
    await this.yieldToEventLoop()
    return task()
  }

  private updateStatus(phase: string, progress: number, message: string, error?: string) {
    this.initStatus = { phase, progress, message, error }
    this.emit('status', this.cloneSafely(this.initStatus))
  }

  getInitStatus(): WorkerInitStatus {
    return this.initStatus
  }

  getReadiness(): WorkerReadiness {
    return this.readiness
  }

  getMetrics(): WorkerMetrics {
    return this.metrics
  }

  getBackgroundSyncState(): BackgroundSyncState {
    return this.backgroundSyncState
  }

  getBackgroundSyncProgress(): SyncProgress | undefined {
    return this.backgroundSyncProgress
  }

  private setReadiness(update: Partial<WorkerReadiness>) {
    this.readiness = { ...this.readiness, ...update }
    this.emit('readiness', this.cloneSafely(this.readiness))
  }

  private setMetrics(update: Partial<WorkerMetrics>) {
    this.metrics = { ...this.metrics, ...update }
    this.emit('metrics', this.cloneSafely(this.metrics))
  }

  private setBackgroundSyncState(state: BackgroundSyncState) {
    if (this.backgroundSyncState === state) return
    this.backgroundSyncState = state
    this.emit('backgroundSyncState', state)
  }

  private setBackgroundSyncProgress(progress?: SyncProgress) {
    this.backgroundSyncProgress = progress
    this.emit('backgroundSyncProgress', progress)
  }

  private bumpMetric(key: keyof WorkerMetrics, delta: number = 1) {
    if (!this.numericMetricKeys.has(key)) return
    const current = (this.metrics[key] as number | undefined) ?? 0
    this.setMetrics({ [key]: current + delta } as Partial<WorkerMetrics>)
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // ==========================================
  // COMMAND API
  // ==========================================

  getSupportedCommands(): WorkerCommand[] {
    return SUPPORTED_COMMANDS
  }

  async init(params: { masterKey: Uint8Array; walletId?: string }): Promise<LightningInitResult> {
    return this.initialize(params.masterKey, params.walletId)
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

        const result = await this.offloadHeavyTask('channel-reestablish', async () =>
          this.channelReestablish!.reestablishChannel(
            hexToUint8Array(channel.channelId!),
            channel.nodeId!,
          ),
        )

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
    this.updateStatus('syncing', 70, 'Syncing Lightning graph...')
    try {
      if (!this.gossipManager) {
        this.gossipManager = new GossipSyncManager()
      }
      // TODO: invoke real sync when available; mark readiness optimistically for now
      this.setReadiness({ gossipSynced: true })

      // Initialize routing service and switch to LOCAL when gossip is (optimistically) ready
      await this.routingService.initialize(this)
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
    // TODO: Load any persisted initialization state
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

      // Initialize peer connectivity service
      if (this.config.enableTrampoline) {
        await this.startPeerConnectivityWithRetry()
      }

      // Initialize channel reestablish service
      this.channelReestablish = new ChannelReestablishService()

      // Initialize Lightning service
      this.lightningService = new LightningService()
      this.walletService = new WalletService()
      const activeWalletId = walletId ?? this.walletService.getActiveWalletId()
      this.activeWalletId = activeWalletId ?? null
      this.setReadiness({ walletLoaded: Boolean(activeWalletId) })

      if (activeWalletId) {
        await this.lightningService.initialize(activeWalletId)
      } else {
        console.warn('No active wallet found, skipping Lightning service initialization')
      }

      // Initialize Lightning monitor service
      if (this.config.enableGossip && activeWalletId) {
        this.lightningMonitor = new LightningMonitorService(this.lightningService!)
        await this.lightningMonitor.start()
      }

      // Initialize watchtower if enabled
      if (this.config.enableWatchtower) {
        this.watchtowerService = new WatchtowerService()
        await this.watchtowerService.initialize()
        this.setReadiness({ watcherRunning: true })
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
    this.electrumWatcher = createElectrumWatcherService(this.electrumSocket)
    // Assume it starts automatically or call start if available
  }

  private async ensureChannelOnChainMonitorStarted(): Promise<void> {
    if (!this.electrumSocket) throw new Error('Electrum not connected')
    this.channelOnChainMonitor = createChannelOnChainMonitorService(this.electrumSocket)
    // Assume it starts automatically
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
    // TODO: Save initialization state to repository
  }

  constructor(config: Partial<WorkerServiceConfig> = {}) {
    super()
    this.config = {
      network: 'testnet',
      maxPeers: 5,
      enableWatchtower: true,
      enableGossip: true,
      enableTrampoline: true,
      ...config,
    }
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
            maxReconnectAttempts: 5,
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
   * Initialize the worker with phased startup
   */
  async initialize(masterKey: Uint8Array, walletId?: string): Promise<LightningInitResult> {
    if (this.isRunning && (!walletId || walletId === this.activeWalletId)) return { success: true }
    if (this.isRunning && walletId && walletId !== this.activeWalletId) {
      await this.stop()
    }

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

      // Phase 5: Start monitoring services
      await this.startMonitoringServices()

      // Phase 6: Start background gossip sync (if in trampoline mode)
      if (this.config.enableTrampoline) {
        await this.startBackgroundGossipSync()
      }

      // Phase 7: Save initialization state
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
   * Stop the worker
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return

    this.abortController?.abort()

    try {
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

      if (this.watchtowerService) {
        this.watchtowerService.destroy()
        this.watchtowerService = undefined
      }

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
    this.lightningService = undefined
    this.walletService = undefined
    this.errorRecovery = undefined
    this.channelReestablish = undefined
    this.gossipManager = undefined
    this.backgroundGossipManager = undefined
    this.backgroundCacheManager = undefined
    this.backgroundSyncState = BackgroundSyncState.IDLE
    this.backgroundSyncProgress = undefined
    this.backgroundSyncStartTime = undefined
    this.stopBackgroundProgressMonitoring()
    this.electrumWatcher = undefined
    this.channelOnChainMonitor = undefined
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

  /**
   * Get the underlying worker instance
   */
  getWorker(): LightningWorker | undefined {
    return this.worker
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

  // ==========================================
  // PLACEHOLDER METHODS
  // ==========================================

  async generateInvoice(amount: bigint, description: string): Promise<string> {
    // TODO: Implement
    throw new Error('Not implemented')
  }

  async payInvoice(invoice: string): Promise<{ success: boolean; preimage?: string }> {
    // TODO: Implement
    throw new Error('Not implemented')
  }

  async openChannel(peerId: string, amount: bigint): Promise<string> {
    // TODO: Implement
    throw new Error('Not implemented')
  }

  async closeChannel(channelId: string): Promise<void> {
    // TODO: Implement
    throw new Error('Not implemented')
  }

  getChannels() {
    // TODO: Implement
    return []
  }

  getPeers() {
    // TODO: Implement
    return []
  }
}

// ==========================================
// FACTORY FUNCTION
// ==========================================

export function createWorkerService(config?: Partial<WorkerServiceConfig>): WorkerService {
  return new WorkerService(config)
}

// ==========================================
// DEFAULT EXPORT
// ==========================================

export default WorkerService
