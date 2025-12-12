/**
 * Watchtower Service
 *
 * Serviço de monitoramento de canais Lightning para detecção de breach.
 * Abstrai a lib do watchtower para o frontend, seguindo o padrão:
 * lib (funções puras) -> services (lógica de negócio) -> UI
 */
import { uint8ArrayToHex } from '@/core/lib/utils'

import Watchtower, {
  WatchtowerConfig,
  WatchtowerEvent,
  BreachResult,
  ChannelInfo,
  ChannelMonitorStatus,
  createWatchtower,
} from '../lib/lightning/watchtower'

// Reexport para consumo seguro pela UI via services
export type { BreachResult, ChannelInfo }

// ==========================================
// TIPOS
// ==========================================

/**
 * Canal monitorado para exibição no frontend
 */
export interface MonitoredChannel {
  channelId: string
  remotePubkey: string
  fundingTxid?: string
  localBalance: string
  remoteBalance: string
  capacity: string
  status: ChannelMonitorStatus
  lastChecked: number
  secretsStored: number
}

/**
 * Estatísticas do Watchtower para o frontend
 */
export interface WatchtowerStatus {
  isRunning: boolean
  monitoredChannels: number
  activeChannels: number
  totalSecretsStored: number
  breachesDetected: number
  penaltiesBroadcast: number
  lastCheck: number
}

/**
 * Evento formatado para o frontend
 */
export interface WatchtowerEventForUI {
  id: string
  type: WatchtowerEvent['type']
  channelId?: string
  timestamp: number
  message: string
  severity: 'info' | 'warning' | 'error' | 'critical'
}

/**
 * Configuração do serviço
 */
export interface WatchtowerServiceConfig {
  autoStart: boolean
  checkIntervalMs: number
  autoBroadcastPenalty: boolean
}

// ==========================================
// CONSTANTES
// ==========================================

const DEFAULT_CONFIG: WatchtowerServiceConfig = {
  autoStart: true,
  checkIntervalMs: 60000, // 1 minuto
  autoBroadcastPenalty: false, // Desativado por padrão para segurança
}

// ==========================================
// WATCHTOWER SERVICE
// ==========================================

interface WatchtowerServiceInterface {
  // Lifecycle
  initialize(config?: Partial<WatchtowerServiceConfig>): Promise<void>
  start(): void
  stop(): void
  isRunning(): boolean

  // Channel Management
  addChannel(channelId: string, channelInfo: ChannelInfo, remotePubkey: Uint8Array): void
  removeChannel(channelId: string): void
  getMonitoredChannels(): MonitoredChannel[]

  // Breach Detection
  checkChannel(channelId: string, txHex: string): BreachResult
  storeRevocationSecret(
    channelId: string,
    commitmentNumber: bigint,
    revocationSecret: Uint8Array,
  ): void

  // Status & Events
  getStatus(): WatchtowerStatus
  getEvents(): WatchtowerEventForUI[]
  clearEvents(): void
  addEventListener(listener: (event: WatchtowerEventForUI) => void): () => void
}

class WatchtowerService implements WatchtowerServiceInterface {
  private watchtower: Watchtower | null = null
  private config: WatchtowerServiceConfig = DEFAULT_CONFIG
  private initialized: boolean = false
  private eventListeners: ((event: WatchtowerEventForUI) => void)[] = []
  private unsubscribeFromWatchtower: (() => void) | null = null

  // ==========================================
  // LIFECYCLE
  // ==========================================

  /**
   * Inicializa o serviço Watchtower
   */
  async initialize(config?: Partial<WatchtowerServiceConfig>): Promise<void> {
    if (this.initialized) {
      console.log('[WatchtowerService] Already initialized')
      return
    }

    this.config = { ...DEFAULT_CONFIG, ...config }

    // Criar instância do Watchtower
    const watchtowerConfig: Partial<WatchtowerConfig> = {
      checkIntervalMs: this.config.checkIntervalMs,
      autoBroadcastPenalty: this.config.autoBroadcastPenalty,
      onBreachDetected: this.handleBreachDetected.bind(this),
      onPenaltyBroadcast: this.handlePenaltyBroadcast.bind(this),
    }

    this.watchtower = createWatchtower(watchtowerConfig)

    // Registrar listener para eventos do watchtower
    this.unsubscribeFromWatchtower = this.watchtower.addEventListener(
      this.handleWatchtowerEvent.bind(this),
    )

    // Carregar canais persistidos
    await this.watchtower.loadFromStorage()

    this.initialized = true
    console.log('[WatchtowerService] Initialized')

    // Auto-start se configurado
    if (this.config.autoStart) {
      this.start()
    }
  }

  /**
   * Inicia o monitoramento
   */
  start(): void {
    if (!this.watchtower) {
      console.warn('[WatchtowerService] Not initialized')
      return
    }
    this.watchtower.start()
    console.log('[WatchtowerService] Started monitoring')
  }

  /**
   * Para o monitoramento
   */
  stop(): void {
    if (!this.watchtower) return
    this.watchtower.stop()
    console.log('[WatchtowerService] Stopped monitoring')
  }

  /**
   * Verifica se está rodando
   */
  isRunning(): boolean {
    return this.watchtower?.getStats().isRunning ?? false
  }

  /**
   * Destrói o serviço
   */
  destroy(): void {
    this.stop()
    if (this.unsubscribeFromWatchtower) {
      this.unsubscribeFromWatchtower()
      this.unsubscribeFromWatchtower = null
    }
    this.watchtower = null
    this.initialized = false
    this.eventListeners = []
  }

  // ==========================================
  // CHANNEL MANAGEMENT
  // ==========================================

  /**
   * Adiciona canal para monitoramento
   */
  addChannel(channelId: string, channelInfo: ChannelInfo, remotePubkey: Uint8Array): void {
    if (!this.watchtower) {
      throw new Error('WatchtowerService not initialized')
    }
    this.watchtower.addChannel(channelId, channelInfo, remotePubkey)
  }

  /**
   * Remove canal do monitoramento
   */
  removeChannel(channelId: string): void {
    if (!this.watchtower) {
      throw new Error('WatchtowerService not initialized')
    }
    this.watchtower.removeChannel(channelId)
  }

  /**
   * Retorna lista de canais monitorados formatados para UI
   */
  getMonitoredChannels(): MonitoredChannel[] {
    if (!this.watchtower) return []

    const channelIds = this.watchtower.getMonitoredChannels()
    const channels: MonitoredChannel[] = []

    for (const channelId of channelIds) {
      const info = this.watchtower.getChannelInfo(channelId)
      if (info) {
        channels.push({
          channelId: info.channelId,
          remotePubkey: uint8ArrayToHex(info.remotePubkey),
          fundingTxid: info.fundingTxid,
          localBalance: info.localBalance.toString(),
          remoteBalance: info.remoteBalance.toString(),
          capacity: (info.capacity ?? 0n).toString(),
          status: info.status,
          lastChecked: info.lastChecked,
          secretsStored: info.revocationSecrets.size,
        })
      }
    }

    return channels
  }

  /**
   * Verifica se canal está sendo monitorado
   */
  isChannelMonitored(channelId: string): boolean {
    return this.watchtower?.isChannelMonitored(channelId) ?? false
  }

  // ==========================================
  // BREACH DETECTION
  // ==========================================

  /**
   * Verifica se há breach em um canal
   */
  checkChannel(channelId: string, txHex: string): BreachResult {
    if (!this.watchtower) {
      return { breach: false, reason: 'WatchtowerService not initialized' }
    }
    return this.watchtower.checkForBreach(channelId, txHex)
  }

  /**
   * Armazena revocation secret
   */
  storeRevocationSecret(
    channelId: string,
    commitmentNumber: bigint,
    revocationSecret: Uint8Array,
  ): void {
    if (!this.watchtower) {
      throw new Error('WatchtowerService not initialized')
    }
    this.watchtower.storeRevocationSecret(channelId, commitmentNumber, revocationSecret)
  }

  /**
   * Atualiza estado do canal
   */
  updateChannelState(channelId: string, commitmentTx: Uint8Array, commitmentNumber: bigint): void {
    if (!this.watchtower) {
      throw new Error('WatchtowerService not initialized')
    }
    this.watchtower.updateChannelState(channelId, commitmentTx, commitmentNumber)
  }

  // ==========================================
  // STATUS & EVENTS
  // ==========================================

  /**
   * Retorna status do Watchtower
   */
  getStatus(): WatchtowerStatus {
    if (!this.watchtower) {
      return {
        isRunning: false,
        monitoredChannels: 0,
        activeChannels: 0,
        totalSecretsStored: 0,
        breachesDetected: 0,
        penaltiesBroadcast: 0,
        lastCheck: 0,
      }
    }

    const stats = this.watchtower.getStats()
    return {
      isRunning: stats.isRunning,
      monitoredChannels: stats.monitoredChannels,
      activeChannels: stats.activeChannels,
      totalSecretsStored: stats.totalSecretsStored,
      breachesDetected: stats.breachesDetected,
      penaltiesBroadcast: stats.penaltiesBroadcast,
      lastCheck: stats.lastCheck,
    }
  }

  /**
   * Retorna eventos formatados para UI
   */
  getEvents(): WatchtowerEventForUI[] {
    if (!this.watchtower) return []

    const events = this.watchtower.getEvents()
    return events.map((event, index) => this.formatEvent(event, `event-${index}`))
  }

  /**
   * Limpa histórico de eventos
   */
  clearEvents(): void {
    this.watchtower?.clearEvents()
  }

  /**
   * Registra listener para eventos
   */
  addEventListener(listener: (event: WatchtowerEventForUI) => void): () => void {
    this.eventListeners.push(listener)
    return () => {
      const index = this.eventListeners.indexOf(listener)
      if (index >= 0) {
        this.eventListeners.splice(index, 1)
      }
    }
  }

  // ==========================================
  // EVENT HANDLERS
  // ==========================================

  /**
   * Handler para eventos do Watchtower
   */
  private handleWatchtowerEvent(event: WatchtowerEvent): void {
    const formatted = this.formatEvent(event, `event-${Date.now()}`)
    this.emitEvent(formatted)
  }

  /**
   * Handler para breach detectado
   */
  private handleBreachDetected(channelId: string, result: BreachResult): void {
    console.warn('[WatchtowerService] BREACH DETECTED:', channelId, result)
    // Em produção: notificação push, alerta sonoro, etc
  }

  /**
   * Handler para penalty broadcast
   */
  private handlePenaltyBroadcast(channelId: string, txid: string): void {
    console.log('[WatchtowerService] Penalty broadcast:', channelId, txid)
    // Em produção: notificação de recuperação de fundos
  }

  /**
   * Emite evento para listeners do serviço
   */
  private emitEvent(event: WatchtowerEventForUI): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event)
      } catch (error) {
        console.error('[WatchtowerService] Error in event listener:', error)
      }
    }
  }

  // ==========================================
  // HELPERS
  // ==========================================

  /**
   * Formata evento para UI
   */
  private formatEvent(event: WatchtowerEvent, id: string): WatchtowerEventForUI {
    let message: string
    let severity: WatchtowerEventForUI['severity']

    switch (event.type) {
      case 'breach_detected':
        message = `Tentativa de roubo detectada no canal ${event.channelId?.slice(0, 8)}...`
        severity = 'critical'
        break
      case 'penalty_broadcast':
        message = `Penalty transaction enviada para canal ${event.channelId?.slice(0, 8)}...`
        severity = 'warning'
        break
      case 'channel_added':
        message = `Canal ${event.channelId?.slice(0, 8)}... adicionado ao monitoramento`
        severity = 'info'
        break
      case 'channel_removed':
        message = `Canal ${event.channelId?.slice(0, 8)}... removido do monitoramento`
        severity = 'info'
        break
      case 'check_complete':
        message = 'Verificação de canais concluída'
        severity = 'info'
        break
      case 'error':
        message = `Erro: ${event.data?.error ?? 'Desconhecido'}`
        severity = 'error'
        break
      default:
        message = `Evento: ${event.type}`
        severity = 'info'
    }

    return {
      id,
      type: event.type,
      channelId: event.channelId,
      timestamp: event.timestamp,
      message,
      severity,
    }
  }

  /**
   * Converte Uint8Array para hex
   */
  /* private uint8ArrayToHex(arr: Uint8Array): string {
    return Array.from(arr)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  } */
}

// ==========================================
// SINGLETON EXPORT
// ==========================================

const watchtowerService = new WatchtowerService()

export default watchtowerService
export { WatchtowerService }
