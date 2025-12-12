/**
 * Channel On-Chain Monitor Service
 *
 * Serviço que integra o ElectrumWatcher com a state machine de canais.
 * Monitora eventos on-chain relacionados aos canais e atualiza seus estados.
 */

import { LightningRepository, PersistedChannel } from '../repositories/lightning'

// ==========================================
// TYPES
// ==========================================

export interface ChannelOnChainEvent {
  type: 'funding_confirmed' | 'channel_closed' | 'force_close_detected'
  channelId: string
  txid?: string
  blockHeight?: number
  timestamp: number
}

// ==========================================
// CHANNEL ON-CHAIN MONITOR SERVICE
// ==========================================

interface ChannelOnChainMonitorServiceInterface {
  // Lifecycle
  start(): Promise<void>
  stop(): void

  // Channel monitoring
  monitorChannel(channel: PersistedChannel): void
  unmonitorChannel(channelId: string): void

  // Event handling
  onChannelEvent(callback: (event: ChannelOnChainEvent) => void): () => void

  // Status
  getMonitoredChannels(): string[]
  getStatus(): {
    isRunning: boolean
    monitoredChannels: number
    pendingConfirmations: number
  }
}

class ChannelOnChainMonitorService implements ChannelOnChainMonitorServiceInterface {
  private repository: LightningRepository
  private electrumWatcher?: any
  private eventCallbacks: ((event: ChannelOnChainEvent) => void)[] = []
  private monitoredChannels: Set<string> = new Set()
  private isServiceRunning: boolean = false

  constructor(repository: LightningRepository, electrumWatcher?: any) {
    this.repository = repository
    this.electrumWatcher = electrumWatcher
  }

  // ==========================================
  // LIFECYCLE
  // ==========================================

  /**
   * Inicia o monitoramento de canais
   */
  async start(): Promise<void> {
    if (this.isServiceRunning || !this.electrumWatcher) {
      return
    }

    console.log('[ChannelOnChainMonitor] Starting service...')

    // Carregar canais existentes e começar a monitorá-los
    await this.loadAndMonitorExistingChannels()

    this.isServiceRunning = true
    console.log('[ChannelOnChainMonitor] Service started')
  }

  /**
   * Para o monitoramento
   */
  stop(): void {
    if (!this.isServiceRunning) {
      return
    }

    console.log('[ChannelOnChainMonitor] Stopping service...')

    // Limpar todos os monitoramentos
    for (const channelId of this.monitoredChannels) {
      this.unmonitorChannel(channelId)
    }

    this.isServiceRunning = false
    console.log('[ChannelOnChainMonitor] Service stopped')
  }

  // ==========================================
  // CHANNEL MONITORING
  // ==========================================

  /**
   * Começa a monitorar um canal específico
   */
  monitorChannel(channel: PersistedChannel): void {
    if (!this.electrumWatcher || !this.isServiceRunning) {
      console.warn('[ChannelOnChainMonitor] Service not running, cannot monitor channel')
      return
    }

    const channelId = channel.channelId

    if (this.monitoredChannels.has(channelId)) {
      console.log(`[ChannelOnChainMonitor] Channel ${channelId} already monitored`)
      return
    }

    console.log(`[ChannelOnChainMonitor] Starting to monitor channel ${channelId}`)

    // Monitorar funding transaction se ainda não confirmada
    if (channel.fundingTxid && channel.fundingOutputIndex !== undefined) {
      const fundingConfirmed = this.isChannelFundingConfirmed(channel)

      if (!fundingConfirmed) {
        console.log(
          `[ChannelOnChainMonitor] Monitoring funding tx ${channel.fundingTxid}:${channel.fundingOutputIndex}`,
        )
        this.electrumWatcher.watchFundingTx(
          channel.fundingTxid,
          channel.fundingOutputIndex,
          (confirmations: number, isConfirmed: boolean) => {
            this.handleFundingConfirmation(channelId, confirmations, isConfirmed)
          },
        )
      }

      // Sempre monitorar o channel point para detectar force closes
      const channelPoint = `${channel.fundingTxid}:${channel.fundingOutputIndex}`
      console.log(`[ChannelOnChainMonitor] Monitoring channel point ${channelPoint}`)
      this.electrumWatcher.watchChannelPoint(channelPoint, (spendingTxid: string) => {
        this.handleChannelClose(channelId, spendingTxid)
      })
    }

    this.monitoredChannels.add(channelId)
  }

  /**
   * Para de monitorar um canal
   */
  unmonitorChannel(channelId: string): void {
    if (!this.electrumWatcher) {
      return
    }

    console.log(`[ChannelOnChainMonitor] Stopping monitoring of channel ${channelId}`)

    // Parar monitoramento da funding tx
    const channel = this.repository.findChannelById(channelId)
    if (channel?.fundingTxid && channel.fundingOutputIndex !== undefined) {
      this.electrumWatcher.unwatchFundingTx(channel.fundingTxid, channel.fundingOutputIndex)

      const channelPoint = `${channel.fundingTxid}:${channel.fundingOutputIndex}`
      this.electrumWatcher.unwatchChannelPoint(channelPoint)
    }

    this.monitoredChannels.delete(channelId)
  }

  // ==========================================
  // EVENT HANDLING
  // ==========================================

  /**
   * Registra callback para eventos de canal
   */
  onChannelEvent(callback: (event: ChannelOnChainEvent) => void): () => void {
    this.eventCallbacks.push(callback)
    return () => {
      const index = this.eventCallbacks.indexOf(callback)
      if (index > -1) {
        this.eventCallbacks.splice(index, 1)
      }
    }
  }

  // ==========================================
  // STATUS
  // ==========================================

  /**
   * Retorna lista de canais monitorados
   */
  getMonitoredChannels(): string[] {
    return Array.from(this.monitoredChannels)
  }

  /**
   * Retorna status do serviço
   */
  getStatus() {
    return {
      isRunning: this.isServiceRunning,
      monitoredChannels: this.monitoredChannels.size,
      pendingConfirmations: this.getPendingConfirmationsCount(),
    }
  }

  // ==========================================
  // PRIVATE METHODS
  // ==========================================

  /**
   * Carrega canais existentes e começa a monitorá-los
   */
  private async loadAndMonitorExistingChannels(): Promise<void> {
    const channels = this.repository.findAllChannels()

    console.log(`[ChannelOnChainMonitor] Loading ${Object.keys(channels).length} existing channels`)

    for (const channel of Object.values(channels)) {
      // Só monitorar canais que ainda estão ativos ou pendentes
      if (this.shouldMonitorChannel(channel)) {
        this.monitorChannel(channel)
      }
    }
  }

  /**
   * Verifica se um canal deve ser monitorado
   */
  private shouldMonitorChannel(channel: PersistedChannel): boolean {
    // Monitorar canais que não estão fechados
    return channel.state !== 'CLOSED' && channel.state !== 'FORCE_CLOSING'
  }

  /**
   * Verifica se o funding de um canal já foi confirmado
   */
  private isChannelFundingConfirmed(channel: PersistedChannel): boolean {
    // Por enquanto, assumimos que se o estado não é FUNDING, está confirmado
    // TODO: Verificar confirmações reais quando disponível
    return channel.state !== 'FUNDING'
  }

  /**
   * Conta quantos canais estão aguardando confirmação
   */
  private getPendingConfirmationsCount(): number {
    const channels = this.repository.findAllChannels()
    return Object.values(channels).filter(
      channel => channel.state === 'FUNDING' && this.monitoredChannels.has(channel.channelId),
    ).length
  }

  /**
   * Trata confirmação de funding transaction
   */
  private handleFundingConfirmation(
    channelId: string,
    confirmations: number,
    isConfirmed: boolean,
  ): void {
    console.log(
      `[ChannelOnChainMonitor] Funding confirmed for channel ${channelId}: ${confirmations} confirmations`,
    )

    if (isConfirmed) {
      // Atualizar estado do canal para aberto
      this.updateChannelState(channelId, 'OPEN')

      // Emitir evento
      this.emitEvent({
        type: 'funding_confirmed',
        channelId,
        blockHeight: confirmations, // Aproximado
        timestamp: Date.now(),
      })

      // TODO: Iniciar monitoramento de HTLCs pendentes se houver
    }
  }

  /**
   * Trata fechamento de canal (force close detectado)
   */
  private handleChannelClose(channelId: string, spendingTxid: string): void {
    console.log(
      `[ChannelOnChainMonitor] Force close detected for channel ${channelId}, spending tx: ${spendingTxid}`,
    )

    // Atualizar estado do canal
    this.updateChannelState(channelId, 'FORCE_CLOSING')

    // Emitir evento
    this.emitEvent({
      type: 'force_close_detected',
      channelId,
      txid: spendingTxid,
      timestamp: Date.now(),
    })

    // TODO: Iniciar processo de sweep de outputs
    // TODO: Resolver HTLCs pendentes
  }

  /**
   * Atualiza o estado de um canal no repositório
   */
  private updateChannelState(channelId: string, newState: string): void {
    const channel = this.repository.findChannelById(channelId)
    if (channel) {
      channel.state = newState
      channel.lastActivity = Date.now()
      this.repository.saveChannel(channel)

      console.log(`[ChannelOnChainMonitor] Updated channel ${channelId} state to ${newState}`)
    }
  }

  /**
   * Emite evento para callbacks registrados
   */
  private emitEvent(event: ChannelOnChainEvent): void {
    this.eventCallbacks.forEach(callback => {
      try {
        callback(event)
      } catch (error) {
        console.error('[ChannelOnChainMonitor] Error in event callback:', error)
      }
    })
  }
}

// ==========================================
// FACTORY FUNCTION
// ==========================================

/**
 * Cria uma instância do ChannelOnChainMonitorService
 */
export function createChannelOnChainMonitorService(
  repository: LightningRepository,
  electrumWatcher?: any,
): ChannelOnChainMonitorService {
  return new ChannelOnChainMonitorService(repository, electrumWatcher)
}

// ==========================================
// DEFAULT EXPORT
// ==========================================

export default ChannelOnChainMonitorService
