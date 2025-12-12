/**
 * Background Gossip Sync Service
 *
 * Serviço responsável por sincronizar o grafo de roteamento Lightning em background
 * no modo híbrido (trampoline + gossip). Permite migração gradual para pathfinding local.
 *
 * Parte da implementação do Hybrid Mode (Opção 3C do roadmap).
 */

import { EventEmitter } from 'eventemitter3'
import { GossipSyncManager, SyncProgress } from '../lib/lightning/gossip-sync'
import { GossipPeerInterface } from '../lib/lightning/gossip'
import { GraphCacheManager } from '../lib/lightning/graph-cache'
import { LightningRepository } from '../repositories/lightning'
import { PeerConnectivityService, PeerInfo } from './ln-peer-service'

// ==========================================
// TIPOS
// ==========================================

/** Estado da sincronização em background */
export enum BackgroundSyncState {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  SYNCING = 'syncing',
  COMPLETED = 'completed',
  ERROR = 'error',
  PAUSED = 'paused',
}

/** Eventos emitidos pelo serviço */
export interface BackgroundSyncEvents {
  stateChanged: (state: BackgroundSyncState) => void
  progressUpdated: (progress: SyncProgress) => void
  syncCompleted: (stats: { nodes: number; channels: number; duration: number }) => void
  syncError: (error: Error) => void
}

/** Configuração do serviço */
export interface BackgroundSyncConfig {
  /** Habilitar sincronização automática */
  enabled: boolean
  /** Intervalo entre verificações de progresso (ms) */
  progressCheckInterval: number
  /** Timeout para sincronização completa (minutos) */
  syncTimeoutMinutes: number
  /** Número máximo de peers para usar */
  maxPeers: number
  /** Salvar progresso periodicamente */
  saveProgressInterval: number
  /** Serviço de conectividade de peers */
  peerConnectivityService?: PeerConnectivityService
}

// ==========================================
// ADAPTER PARA PEERS
// ==========================================

/** Adapter para converter PeerInfo em GossipPeerInterface */
class PeerAdapter implements GossipPeerInterface {
  constructor(
    private peerInfo: PeerInfo,
    private transport: any,
  ) {}

  sendMessage(data: Uint8Array): Promise<void> {
    // TODO: Implementar envio de mensagem via transport
    // Por enquanto, simular envio
    console.log(`[PeerAdapter] Sending message to ${this.peerInfo.nodeId}`)
    return Promise.resolve()
  }

  onMessage(handler: (data: Uint8Array) => void): void {
    // TODO: Implementar listener de mensagens via transport
    console.log(`[PeerAdapter] Setting up message handler for ${this.peerInfo.nodeId}`)
  }

  isConnected(): boolean {
    return this.peerInfo.isConnected
  }
}

export class BackgroundGossipSyncService extends EventEmitter {
  private state: BackgroundSyncState = BackgroundSyncState.IDLE
  private config: BackgroundSyncConfig
  private gossipManager?: GossipSyncManager
  private progressCheckTimer?: ReturnType<typeof setInterval>
  private syncStartTime?: number
  private isDestroyed = false

  constructor(config: Partial<BackgroundSyncConfig> = {}) {
    super()

    this.config = {
      enabled: true,
      progressCheckInterval: 5000, // 5 segundos
      syncTimeoutMinutes: 30, // 30 minutos
      maxPeers: 3,
      saveProgressInterval: 60000, // 1 minuto
      ...config,
    }
  }

  // ==========================================
  // CONTROLE PRINCIPAL
  // ==========================================

  /** Inicia sincronização em background */
  async startBackgroundSync(): Promise<void> {
    if (!this.config.enabled || this.isDestroyed) {
      return
    }

    if (this.state === BackgroundSyncState.SYNCING) {
      console.log('[BackgroundGossipSync] Sync already in progress')
      return
    }

    try {
      this.setState(BackgroundSyncState.INITIALIZING)
      console.log('[BackgroundGossipSync] Starting background gossip sync...')

      // Inicializar componentes
      await this.initializeSyncComponents()

      // Iniciar sincronização
      this.syncStartTime = Date.now()
      await this.startSyncProcess()

      // Iniciar monitoramento de progresso
      this.startProgressMonitoring()

      console.log('[BackgroundGossipSync] Background sync started successfully')
    } catch (error) {
      console.error('[BackgroundGossipSync] Failed to start background sync:', error)
      this.setState(BackgroundSyncState.ERROR)
      this.emit('syncError', error instanceof Error ? error : new Error('Unknown error'))
    }
  }

  /** Para sincronização em background */
  async stopBackgroundSync(): Promise<void> {
    if (this.state === BackgroundSyncState.IDLE) {
      return
    }

    console.log('[BackgroundGossipSync] Stopping background sync...')

    // Parar monitoramento
    this.stopProgressMonitoring()

    // Cancelar sincronização se estiver em andamento
    if (this.gossipManager) {
      // TODO: Implementar método cancel no GossipSyncManager se necessário
    }

    this.setState(BackgroundSyncState.IDLE)
  }

  /** Pausa/retoma sincronização */
  async pauseSync(): Promise<void> {
    if (this.state !== BackgroundSyncState.SYNCING) {
      return
    }

    this.setState(BackgroundSyncState.PAUSED)
    console.log('[BackgroundGossipSync] Sync paused')
  }

  async resumeSync(): Promise<void> {
    if (this.state !== BackgroundSyncState.PAUSED) {
      return
    }

    this.setState(BackgroundSyncState.SYNCING)
    console.log('[BackgroundGossipSync] Sync resumed')
  }

  // ==========================================
  // INICIALIZAÇÃO
  // ==========================================

  private async initializeSyncComponents(): Promise<void> {
    const repository = new LightningRepository()
    const cacheManager = new GraphCacheManager(repository)

    // Carregar grafo do cache se disponível
    const routingGraph = cacheManager.loadGraph()

    // Criar gossip manager
    this.gossipManager = new GossipSyncManager({
      routingGraph,
      cacheManager,
      maxConcurrentPeers: this.config.maxPeers,
      timeoutMs: 30000,
      batchIntervalMs: 2000,
    })

    // TODO: Adicionar peers para sincronização
    // Por enquanto, isso será feito quando peers forem conectados
  }

  private async startSyncProcess(): Promise<void> {
    if (!this.gossipManager) {
      throw new Error('Gossip manager not initialized')
    }

    // Obter peers conectados do serviço de conectividade
    const peerService = this.config.peerConnectivityService
    if (!peerService) {
      console.log('[BackgroundGossipSync] No peer connectivity service available, will retry later')
      return
    }

    const connectedPeers = peerService.getConnectedPeers()
    if (connectedPeers.length === 0) {
      console.log('[BackgroundGossipSync] No peers available for sync, will retry later')
      return
    }

    // Limitar ao número máximo de peers configurado
    const peersToUse = connectedPeers.slice(0, this.config.maxPeers)

    // Criar adapters para os peers
    const gossipPeers: GossipPeerInterface[] = peersToUse.map(peerInfo => {
      // TODO: Obter transport do peer service
      const transport = null // peerService.getPeerTransport(peerInfo.nodeId)
      return new PeerAdapter(peerInfo, transport)
    })

    // Iniciar sincronização em background
    this.setState(BackgroundSyncState.SYNCING)

    // Executar sincronização (não aguardar conclusão para não bloquear)
    this.gossipManager
      .startSync(gossipPeers)
      .then(() => {
        this.handleSyncCompleted()
      })
      .catch(error => {
        this.handleSyncError(error)
      })
  }

  // ==========================================
  // MONITORAMENTO
  // ==========================================

  private startProgressMonitoring(): void {
    this.progressCheckTimer = setInterval(() => {
      this.checkSyncProgress()
    }, this.config.progressCheckInterval)
  }

  private stopProgressMonitoring(): void {
    if (this.progressCheckTimer) {
      clearInterval(this.progressCheckTimer)
      this.progressCheckTimer = undefined
    }
  }

  private async checkSyncProgress(): Promise<void> {
    if (!this.gossipManager || this.state !== BackgroundSyncState.SYNCING) {
      return
    }

    try {
      const progress = this.gossipManager.getProgress()
      this.emit('progressUpdated', progress)

      // Verificar se sincronização completou
      if (progress.overall >= 1.0) {
        this.handleSyncCompleted()
        return
      }

      // Verificar timeout
      if (this.syncStartTime) {
        const elapsedMinutes = (Date.now() - this.syncStartTime) / (1000 * 60)
        if (elapsedMinutes > this.config.syncTimeoutMinutes) {
          console.warn('[BackgroundGossipSync] Sync timeout reached, stopping...')
          await this.stopBackgroundSync()
        }
      }
    } catch (error) {
      console.error('[BackgroundGossipSync] Error checking progress:', error)
    }
  }

  // ==========================================
  // HANDLERS DE EVENTOS
  // ==========================================

  private handleSyncCompleted(): void {
    if (this.state === BackgroundSyncState.COMPLETED) {
      return
    }

    const duration = this.syncStartTime ? Date.now() - this.syncStartTime : 0

    // Obter estatísticas finais do routing graph
    let nodes = 0
    let channels = 0

    if (this.gossipManager) {
      try {
        const progress = this.gossipManager.getProgress()
        nodes = progress.nodesDiscovered
        channels = progress.channelsDiscovered
      } catch (error) {
        console.warn('[BackgroundGossipSync] Could not get final stats:', error)
      }
    }

    const stats = {
      nodes,
      channels,
      duration,
    }

    console.log(
      `[BackgroundGossipSync] Sync completed: ${nodes} nodes, ${channels} channels in ${duration}ms`,
    )

    this.setState(BackgroundSyncState.COMPLETED)
    this.stopProgressMonitoring()

    this.emit('syncCompleted', stats)
  }

  private handleSyncError(error: Error): void {
    console.error('[BackgroundGossipSync] Sync error:', error)
    this.setState(BackgroundSyncState.ERROR)
    this.stopProgressMonitoring()
    this.emit('syncError', error)
  }

  // ==========================================
  // UTILITÁRIOS
  // ==========================================

  private setState(newState: BackgroundSyncState): void {
    if (this.state === newState) return

    const oldState = this.state
    this.state = newState

    console.log(`[BackgroundGossipSync] State changed: ${oldState} -> ${newState}`)
    this.emit('stateChanged', newState)
  }

  /** Retorna estado atual */
  getState(): BackgroundSyncState {
    return this.state
  }

  /** Verifica se sincronização está completa */
  isSyncCompleted(): boolean {
    return this.state === BackgroundSyncState.COMPLETED
  }

  /** Verifica se sincronização está em andamento */
  isSyncing(): boolean {
    return this.state === BackgroundSyncState.SYNCING
  }

  // ==========================================
  // LIMPEZA
  // ==========================================

  /** Destroi o serviço */
  destroy(): void {
    this.isDestroyed = true
    this.stopProgressMonitoring()
    this.removeAllListeners()
  }
}

// ==========================================
// SINGLETON
// ==========================================

/** Instância singleton do serviço */
let backgroundSyncInstance: BackgroundGossipSyncService | null = null

/** Obtém instância singleton do BackgroundGossipSyncService */
export function getBackgroundGossipSyncService(): BackgroundGossipSyncService {
  if (!backgroundSyncInstance) {
    backgroundSyncInstance = new BackgroundGossipSyncService()
  }
  return backgroundSyncInstance
}

/** Cria nova instância (para testes) */
export function createBackgroundGossipSyncService(
  config?: Partial<BackgroundSyncConfig>,
): BackgroundGossipSyncService {
  return new BackgroundGossipSyncService(config)
}
