/**
 * Lightning Routing Service
 *
 * Gerencia a escolha entre trampoline routing e local pathfinding
 * baseado no estado da sincronização de gossip (Hybrid Mode).
 *
 * Parte da implementação do Hybrid Mode (Opção 3C do roadmap).
 */

import { EventEmitter } from 'eventemitter3'
import { RoutingGraph } from '../lib/lightning/routing'
import { GraphCacheManager } from '../lib/lightning/graph-cache'
import { LightningRepository } from '../repositories/lightning'
import { BackgroundSyncState } from './ln-background-gossip-sync-service'

// ==========================================
// TIPOS
// ==========================================

/** Modo de routing disponível */
export enum RoutingMode {
  TRAMPOLINE = 'trampoline',
  LOCAL = 'local',
}

/** Estado do serviço de routing */
export interface RoutingServiceState {
  currentMode: RoutingMode
  isLocalRoutingAvailable: boolean
  lastModeSwitch: number
  backgroundSyncState: BackgroundSyncState
}

/** Eventos emitidos pelo serviço */
export interface RoutingServiceEvents {
  modeChanged: (newMode: RoutingMode, oldMode: RoutingMode) => void
  localRoutingAvailable: (available: boolean) => void
}

// ==========================================
// SERVIÇO DE ROUTING
// ==========================================

export class LightningRoutingService extends EventEmitter {
  private state: RoutingServiceState
  private routingGraph?: RoutingGraph
  private graphCacheManager?: GraphCacheManager
  private backgroundSyncSource?: EventEmitter
  private isInitialized = false

  constructor() {
    super()

    this.state = {
      currentMode: RoutingMode.TRAMPOLINE, // Sempre começa em trampoline
      isLocalRoutingAvailable: false,
      lastModeSwitch: Date.now(),
      backgroundSyncState: BackgroundSyncState.IDLE,
    }
  }

  // ==========================================
  // INICIALIZAÇÃO
  // ==========================================

  /** Inicializa o serviço de routing */
  async initialize(backgroundSyncSource?: EventEmitter): Promise<void> {
    if (this.isInitialized) return

    console.log('[LightningRouting] Initializing routing service...')

    // Configurar background sync service se fornecido
    if (backgroundSyncSource) {
      this.backgroundSyncSource = backgroundSyncSource
      this.setupBackgroundSyncListeners(backgroundSyncSource)
    }

    // Inicializar componentes de routing local
    await this.initializeLocalRouting()

    // Verificar estado inicial
    await this.updateRoutingAvailability()

    this.isInitialized = true
    console.log('[LightningRouting] Routing service initialized')
  }

  /** Para o serviço */
  async stop(): Promise<void> {
    if (!this.isInitialized) return

    // Remover listeners
    if (this.backgroundSyncSource?.removeAllListeners) {
      this.backgroundSyncSource.removeAllListeners()
    }

    this.isInitialized = false
    console.log('[LightningRouting] Routing service stopped')
  }

  // ==========================================
  // CONTROLE DE MODO
  // ==========================================

  /** Obtém o modo de routing atual */
  getCurrentMode(): RoutingMode {
    return this.state.currentMode
  }

  /** Verifica se local routing está disponível */
  isLocalRoutingAvailable(): boolean {
    return this.state.isLocalRoutingAvailable
  }

  /** Força mudança para um modo específico */
  async setRoutingMode(mode: RoutingMode): Promise<void> {
    if (this.state.currentMode === mode) return

    const oldMode = this.state.currentMode
    this.state.currentMode = mode
    this.state.lastModeSwitch = Date.now()

    console.log(`[LightningRouting] Routing mode changed: ${oldMode} -> ${mode}`)
    this.emit('modeChanged', mode, oldMode)
  }

  /** Obtém estatísticas do serviço */
  getRoutingStats(): RoutingServiceState {
    return { ...this.state }
  }

  // ==========================================
  // ROUTING LOCAL
  // ==========================================

  /** Tenta encontrar rota usando pathfinding local */
  findLocalRoute(
    sourceNodeId: Uint8Array,
    destinationNodeId: Uint8Array,
    amountMsat: bigint,
    maxFeeMsat: bigint = 10000n,
    maxCltvExpiry: number = 144 * 24,
  ): any | null {
    if (!this.routingGraph || !this.state.isLocalRoutingAvailable) {
      return null
    }

    try {
      const result = this.routingGraph.findRoute(
        sourceNodeId,
        destinationNodeId,
        amountMsat,
        maxFeeMsat,
        maxCltvExpiry,
      )

      return result.route ? result : null
    } catch (error) {
      console.warn('[LightningRouting] Local route finding failed:', error)
      return null
    }
  }

  // ==========================================
  // MÉTODOS PRIVADOS
  // ==========================================

  private async initializeLocalRouting(): Promise<void> {
    try {
      const repository = new LightningRepository()
      this.graphCacheManager = new GraphCacheManager(repository)
      this.routingGraph = this.graphCacheManager.loadGraph()

      console.log('[LightningRouting] Local routing components initialized')
    } catch (error) {
      console.warn('[LightningRouting] Failed to initialize local routing:', error)
    }
  }

  private setupBackgroundSyncListeners(source: EventEmitter): void {
    const handleState = (state: BackgroundSyncState) => {
      this.state.backgroundSyncState = state

      if (state === BackgroundSyncState.COMPLETED) {
        this.checkLocalRoutingAvailability()
      }
    }

    const handleCompleted = async (stats: {
      nodes: number
      channels: number
      duration?: number
    }) => {
      console.log(
        `[LightningRouting] Background sync completed: ${stats.nodes} nodes, ${stats.channels} channels`,
      )

      await this.updateRoutingAvailability()
    }

    const handleError = (error: Error) => {
      console.error('[LightningRouting] Background sync error:', error)
    }

    // Suporte aos eventos legados e novos emitidos pelo WorkerService
    if ((source as any).on) {
      ;(source as any).on('stateChanged', handleState)
      ;(source as any).on('backgroundSyncState', handleState)
      ;(source as any).on('syncCompleted', handleCompleted)
      ;(source as any).on('backgroundSyncCompleted', handleCompleted)
      ;(source as any).on('syncError', handleError)
      ;(source as any).on('backgroundSyncError', handleError)
    }
  }

  private async checkLocalRoutingAvailability(): Promise<void> {
    if (!this.routingGraph) return

    try {
      // Verificar se temos dados suficientes no grafo
      const { nodes: nodeCount, channels: channelCount } = this.routingGraph.getStats()

      // Thresholds mínimos para considerar routing local viável
      const minNodes = 1000
      const minChannels = 5000

      const isAvailable = nodeCount >= minNodes && channelCount >= minChannels

      if (isAvailable !== this.state.isLocalRoutingAvailable) {
        this.state.isLocalRoutingAvailable = isAvailable
        this.emit('localRoutingAvailable', isAvailable)

        if (isAvailable) {
          console.log(
            `[LightningRouting] Local routing now available (${nodeCount} nodes, ${channelCount} channels)`,
          )
        }
      }
    } catch (error) {
      console.warn('[LightningRouting] Error checking routing availability:', error)
    }
  }

  private async enableLocalRouting(): Promise<void> {
    if (!this.state.isLocalRoutingAvailable) {
      console.log('[LightningRouting] Local routing not yet available, waiting...')
      return
    }

    // Verificar se devemos mudar automaticamente para local routing
    // Por enquanto, sempre mudar quando disponível (pode ser configurável no futuro)
    await this.setRoutingMode(RoutingMode.LOCAL)
  }

  private async updateRoutingAvailability(): Promise<void> {
    await this.checkLocalRoutingAvailability()

    // Se local routing estiver disponível e ainda estivermos em trampoline, considerar mudança
    if (this.state.isLocalRoutingAvailable && this.state.currentMode === RoutingMode.TRAMPOLINE) {
      // Verificar se background sync já completou
      if (this.state.backgroundSyncState === BackgroundSyncState.COMPLETED) {
        await this.enableLocalRouting()
      }
    }
  }
}

// ==========================================
// SINGLETON
// ==========================================

let routingServiceInstance: LightningRoutingService | null = null

/** Obtém instância singleton do serviço de routing */
export function getLightningRoutingService(): LightningRoutingService {
  if (!routingServiceInstance) {
    routingServiceInstance = new LightningRoutingService()
  }
  return routingServiceInstance
}

/** Cria nova instância (para testes) */
export function createLightningRoutingService(): LightningRoutingService {
  return new LightningRoutingService()
}
