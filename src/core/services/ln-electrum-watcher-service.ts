/**
 * Electrum Watcher Service for Lightning Network
 *
 * Serviço para monitorar transações on-chain relacionadas aos canais Lightning.
 * Monitora funding transactions, channel points e detecta force closes.
 */

import { Connection } from '../models/network'
import {
  connect as connectElectrum,
  close as closeElectrum,
  getTransaction,
  getCurrentBlockHeight,
} from '../lib/electrum/client'

// ==========================================
// TYPES
// ==========================================

/**
 * Funding transaction sendo monitorada
 */
export interface WatchedFundingTx {
  txid: string
  outputIndex: number
  callback: (confirmations: number, isConfirmed: boolean) => void
  requiredConfirmations: number
  lastConfirmations: number
}

/**
 * Channel point sendo monitorado para spending
 */
export interface WatchedChannelPoint {
  channelPoint: string // formato: txid:vout
  callback: (spendingTxid: string) => void
  lastCheckedHeight: number
}

/**
 * Configuração do serviço
 */
export interface ElectrumWatcherConfig {
  checkIntervalMs: number
  requiredConfirmations: number
  maxReconnectAttempts: number
}

// ==========================================
// CONSTANTS
// ==========================================

const DEFAULT_CONFIG: ElectrumWatcherConfig = {
  checkIntervalMs: 30000, // 30 segundos
  requiredConfirmations: 3,
  maxReconnectAttempts: 5,
}

// ==========================================
// ELECTRUM WATCHER SERVICE
// ==========================================

interface ElectrumWatcherServiceInterface {
  // Lifecycle
  start(): Promise<void>
  stop(): void
  isRunning(): boolean

  // Monitoring
  watchFundingTx(
    txid: string,
    outputIndex: number,
    callback: (confirmations: number, isConfirmed: boolean) => void,
    requiredConfirmations?: number,
  ): void
  unwatchFundingTx(txid: string, outputIndex: number): void

  watchChannelPoint(channelPoint: string, callback: (spendingTxid: string) => void): void
  unwatchChannelPoint(channelPoint: string): void

  // Queries
  getConfirmations(txid: string): Promise<number>

  // Status
  getStatus(): {
    isRunning: boolean
    watchedFundingTxs: number
    watchedChannelPoints: number
    currentBlockHeight: number
    lastCheck: number
  }
}

class ElectrumWatcherService implements ElectrumWatcherServiceInterface {
  private config: ElectrumWatcherConfig = DEFAULT_CONFIG
  private isServiceRunning: boolean = false
  private socket: Connection | null = null
  private checkInterval: NodeJS.Timeout | null = null
  private currentBlockHeight: number = 0
  private lastCheck: number = 0

  // Watched items
  private watchedFundingTxs: Map<string, WatchedFundingTx> = new Map()
  private watchedChannelPoints: Map<string, WatchedChannelPoint> = new Map()

  // ==========================================
  // LIFECYCLE
  // ==========================================

  /**
   * Inicia o serviço de monitoramento
   */
  async start(): Promise<void> {
    if (this.isServiceRunning) {
      console.log('[ElectrumWatcher] Service already running')
      return
    }

    console.log('[ElectrumWatcher] Starting service...')

    try {
      // Conectar ao Electrum
      this.socket = await connectElectrum()
      console.log('[ElectrumWatcher] Connected to Electrum')

      // Obter altura atual
      this.currentBlockHeight = await getCurrentBlockHeight(this.socket)
      console.log(`[ElectrumWatcher] Current block height: ${this.currentBlockHeight}`)

      // Iniciar monitoramento periódico
      this.isServiceRunning = true
      this.startPeriodicCheck()

      console.log('[ElectrumWatcher] Service started successfully')
    } catch (error) {
      console.error('[ElectrumWatcher] Failed to start service:', error)
      throw error
    }
  }

  /**
   * Para o serviço de monitoramento
   */
  stop(): void {
    if (!this.isServiceRunning) {
      return
    }

    console.log('[ElectrumWatcher] Stopping service...')

    this.isServiceRunning = false

    // Parar intervalo de checagem
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }

    // Fechar conexão
    if (this.socket) {
      closeElectrum(this.socket)
      this.socket = null
    }

    // Limpar watched items
    this.watchedFundingTxs.clear()
    this.watchedChannelPoints.clear()

    console.log('[ElectrumWatcher] Service stopped')
  }

  /**
   * Verifica se o serviço está rodando
   */
  isRunning(): boolean {
    return this.isServiceRunning
  }

  // ==========================================
  // MONITORING
  // ==========================================

  /**
   * Monitora uma funding transaction para confirmações
   */
  watchFundingTx(
    txid: string,
    outputIndex: number,
    callback: (confirmations: number, isConfirmed: boolean) => void,
    requiredConfirmations: number = this.config.requiredConfirmations,
  ): void {
    const key = `${txid}:${outputIndex}`

    if (this.watchedFundingTxs.has(key)) {
      console.warn(`[ElectrumWatcher] Funding TX ${key} already being watched`)
      return
    }

    this.watchedFundingTxs.set(key, {
      txid,
      outputIndex,
      callback,
      requiredConfirmations,
      lastConfirmations: 0,
    })

    console.log(`[ElectrumWatcher] Now watching funding TX: ${key}`)
  }

  /**
   * Para de monitorar uma funding transaction
   */
  unwatchFundingTx(txid: string, outputIndex: number): void {
    const key = `${txid}:${outputIndex}`
    this.watchedFundingTxs.delete(key)
    console.log(`[ElectrumWatcher] Stopped watching funding TX: ${key}`)
  }

  /**
   * Monitora um channel point para spending (force close detection)
   */
  watchChannelPoint(channelPoint: string, callback: (spendingTxid: string) => void): void {
    if (this.watchedChannelPoints.has(channelPoint)) {
      console.warn(`[ElectrumWatcher] Channel point ${channelPoint} already being watched`)
      return
    }

    this.watchedChannelPoints.set(channelPoint, {
      channelPoint,
      callback,
      lastCheckedHeight: this.currentBlockHeight,
    })

    console.log(`[ElectrumWatcher] Now watching channel point: ${channelPoint}`)
  }

  /**
   * Para de monitorar um channel point
   */
  unwatchChannelPoint(channelPoint: string): void {
    this.watchedChannelPoints.delete(channelPoint)
    console.log(`[ElectrumWatcher] Stopped watching channel point: ${channelPoint}`)
  }

  // ==========================================
  // QUERIES
  // ==========================================

  /**
   * Obtém o número de confirmações de uma transação
   */
  async getConfirmations(txid: string): Promise<number> {
    if (!this.socket) {
      throw new Error('ElectrumWatcher not connected')
    }

    try {
      const txResponse = await getTransaction(txid, true, this.socket)
      const tx = txResponse.result

      if (!tx) {
        return 0 // Transação não encontrada
      }

      if (tx.confirmations !== undefined) {
        return tx.confirmations
      }

      // Se não tem confirmations no response, calcular baseado na altura
      if (tx.height && tx.height > 0) {
        return Math.max(0, this.currentBlockHeight - tx.height + 1)
      }

      return 0 // Transação na mempool
    } catch (error) {
      console.error(`[ElectrumWatcher] Error getting confirmations for ${txid}:`, error)
      return 0
    }
  }

  // ==========================================
  // STATUS
  // ==========================================

  /**
   * Retorna o status atual do serviço
   */
  getStatus() {
    return {
      isRunning: this.isServiceRunning,
      watchedFundingTxs: this.watchedFundingTxs.size,
      watchedChannelPoints: this.watchedChannelPoints.size,
      currentBlockHeight: this.currentBlockHeight,
      lastCheck: this.lastCheck,
    }
  }

  // ==========================================
  // PRIVATE METHODS
  // ==========================================

  /**
   * Inicia a checagem periódica
   */
  private startPeriodicCheck(): void {
    this.checkInterval = setInterval(() => {
      this.performChecks()
    }, this.config.checkIntervalMs)
  }

  /**
   * Executa todas as checagens necessárias
   */
  private async performChecks(): Promise<void> {
    if (!this.isServiceRunning || !this.socket) {
      return
    }

    try {
      this.lastCheck = Date.now()

      // Atualizar altura atual
      this.currentBlockHeight = await getCurrentBlockHeight(this.socket)

      // Verificar funding transactions
      await this.checkFundingTransactions()

      // Verificar channel points
      await this.checkChannelPoints()
    } catch (error) {
      console.error('[ElectrumWatcher] Error during periodic check:', error)

      // Tentar reconectar se houver erro
      if (this.socket) {
        try {
          closeElectrum(this.socket)
        } catch (closeError) {
          console.error('[ElectrumWatcher] Error closing socket:', closeError)
        }
        this.socket = null
      }

      // Tentar reconectar
      try {
        this.socket = await connectElectrum()
        console.log('[ElectrumWatcher] Reconnected to Electrum after error')
      } catch (reconnectError) {
        console.error('[ElectrumWatcher] Failed to reconnect:', reconnectError)
      }
    }
  }

  /**
   * Verifica o status das funding transactions monitoradas
   */
  private async checkFundingTransactions(): Promise<void> {
    for (const [key, watched] of Array.from(this.watchedFundingTxs.entries())) {
      try {
        const confirmations = await this.getConfirmations(watched.txid)

        // Só notificar se houve mudança
        if (confirmations !== watched.lastConfirmations) {
          watched.lastConfirmations = confirmations
          const isConfirmed = confirmations >= watched.requiredConfirmations

          watched.callback(confirmations, isConfirmed)

          // Se já está confirmado, podemos parar de monitorar
          if (isConfirmed) {
            console.log(
              `[ElectrumWatcher] Funding TX ${key} confirmed with ${confirmations} confirmations`,
            )
            this.watchedFundingTxs.delete(key)
          }
        }
      } catch (error) {
        console.error(`[ElectrumWatcher] Error checking funding TX ${key}:`, error)
      }
    }
  }

  /**
   * Verifica se os channel points foram gastos
   */
  private async checkChannelPoints(): Promise<void> {
    for (const [channelPoint, watched] of Array.from(this.watchedChannelPoints.entries())) {
      try {
        const [txid, voutStr] = channelPoint.split(':')
        const vout = parseInt(voutStr, 10)

        // Obter a transação de funding
        const fundingTxResponse = await getTransaction(txid, true, this.socket!)
        const fundingTx = fundingTxResponse.result

        if (!fundingTx) {
          console.warn(
            `[ElectrumWatcher] Funding TX ${txid} not found for channel point ${channelPoint}`,
          )
          continue
        }

        // Verificar se o output específico foi gasto
        if (fundingTx.vout && fundingTx.vout[vout]) {
          const output = fundingTx.vout[vout]

          // Se o output tem spent_by, significa que foi gasto
          if (output.spent_by) {
            console.log(
              `[ElectrumWatcher] Channel point ${channelPoint} spent by ${output.spent_by}`,
            )
            watched.callback(output.spent_by)
            this.watchedChannelPoints.delete(channelPoint)
          }
        }
      } catch (error) {
        console.error(`[ElectrumWatcher] Error checking channel point ${channelPoint}:`, error)
      }
    }
  }
}

// ==========================================
// FACTORY FUNCTION
// ==========================================

/**
 * Cria uma instância do ElectrumWatcherService
 */
export function createElectrumWatcherService(
  config?: Partial<ElectrumWatcherConfig>,
): ElectrumWatcherService {
  const service = new ElectrumWatcherService()
  if (config) {
    service['config'] = { ...DEFAULT_CONFIG, ...config }
  }
  return service
}

// ==========================================
// DEFAULT EXPORT
// ==========================================

export default ElectrumWatcherService
