// Liquidity Manager Service
// Autonomous liquidity management for Lightning Network channels
// Handles automatic channel opening, LSP integration, and balance optimization

import EventEmitter from 'eventemitter3'
import LightningService from './lightning'
import LSPService from './lsp'
import { LightningRepository } from '../repositories/lightning'

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface LiquidityConfig {
  /** Minimum balance threshold to trigger channel opening (sats) */
  minBalanceThreshold: bigint
  /** Target inbound capacity ratio (0.0-1.0) */
  targetInboundRatio: number
  /** Maximum channels to maintain */
  maxChannels: number
  /** Minimum channel size (sats) */
  minChannelSize: bigint
  /** Maximum channel size (sats) */
  maxChannelSize: bigint
  /** Check interval in milliseconds */
  checkInterval: number
  /** Enable LSP integration */
  enableLSPIntegration: boolean
  /** Maximum fee for channel opening (sats) */
  maxChannelOpeningFee: bigint
}

export interface LiquidityStatus {
  /** Current total balance */
  totalBalance: bigint
  /** Current inbound capacity */
  inboundCapacity: bigint
  /** Current outbound capacity */
  outboundCapacity: bigint
  /** Inbound/outbound ratio */
  capacityRatio: number
  /** Number of active channels */
  activeChannels: number
  /** Pending liquidity operations */
  pendingOperations: LiquidityOperation[]
  /** Last check timestamp */
  lastCheck: number
}

export interface LiquidityOperation {
  id: string
  type: 'channel_open' | 'lsp_request' | 'balance_rebalance'
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  amount: bigint
  targetPeer?: string
  createdAt: number
  completedAt?: number
  error?: string
  result?: {
    channelId?: string
    capacity?: bigint
    feePaid?: bigint
  }
}

export interface LiquidityAlert {
  type: 'low_balance' | 'unbalanced_capacity' | 'channel_needed'
  severity: 'info' | 'warning' | 'critical'
  message: string
  suggestedAction?: string
  data?: any
}

// ==========================================
// CONSTANTS
// ==========================================

const DEFAULT_CONFIG: LiquidityConfig = {
  minBalanceThreshold: BigInt(100000), // 100k sats
  targetInboundRatio: 0.6, // 60% inbound preferred
  maxChannels: 5,
  minChannelSize: BigInt(500000), // 500k sats
  maxChannelSize: BigInt(2000000), // 2M sats
  checkInterval: 300000, // 5 minutes
  enableLSPIntegration: true,
  maxChannelOpeningFee: BigInt(10000), // 10k sats max fee
}

// ==========================================
// LIQUIDITY MANAGER SERVICE
// ==========================================

export class LiquidityManagerService extends EventEmitter {
  private config: LiquidityConfig
  private lightningService?: LightningService
  private lspService?: LSPService
  private repository: LightningRepository
  private checkTimer?: number
  private isRunning: boolean = false
  private operations: Map<string, LiquidityOperation> = new Map()

  constructor(lightningService?: LightningService, config: Partial<LiquidityConfig> = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.lightningService = lightningService
    this.repository = new LightningRepository()

    if (this.config.enableLSPIntegration) {
      this.lspService = new LSPService(this.lightningService!)
    }
  }

  // ==========================================
  // PUBLIC API
  // ==========================================

  /**
   * Start the liquidity manager
   */
  async start(): Promise<void> {
    if (this.isRunning) return

    console.log('[LiquidityManager] Starting liquidity management service...')

    this.isRunning = true

    // Start periodic checks
    this.startPeriodicChecks()

    // Perform initial assessment
    await this.performLiquidityCheck()

    console.log('[LiquidityManager] Liquidity management service started')
  }

  /**
   * Stop the liquidity manager
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return

    console.log('[LiquidityManager] Stopping liquidity management service...')

    this.isRunning = false

    // Clear timer
    if (this.checkTimer) {
      clearInterval(this.checkTimer)
      this.checkTimer = undefined
    }

    console.log('[LiquidityManager] Liquidity management service stopped')
  }

  /**
   * Get current liquidity status
   */
  async getLiquidityStatus(): Promise<LiquidityStatus> {
    if (!this.lightningService) {
      throw new Error('LightningService not available')
    }

    const channels = await this.lightningService.getChannels()
    const balance = await this.lightningService.getBalance()

    let inboundCapacity = BigInt(0)
    let outboundCapacity = BigInt(0)
    let activeChannels = 0

    for (const channel of channels) {
      if (channel.isActive) {
        activeChannels++
        inboundCapacity += channel.remoteBalanceSat
        outboundCapacity += channel.localBalanceSat
      }
    }

    const totalCapacity = inboundCapacity + outboundCapacity
    // @ts-ignore - BigInt comparison for capacity ratio calculation
    const capacityRatio =
      totalCapacity > BigInt(0) ? Number(inboundCapacity) / Number(totalCapacity) : 0

    return {
      totalBalance: balance,
      inboundCapacity,
      outboundCapacity,
      capacityRatio,
      activeChannels,
      pendingOperations: Array.from(this.operations.values()).filter(
        op => op.status === 'pending' || op.status === 'in_progress',
      ),
      lastCheck: Date.now(),
    }
  }

  /**
   * Manually trigger liquidity optimization
   */
  async optimizeLiquidity(): Promise<void> {
    console.log('[LiquidityManager] Manual liquidity optimization triggered')
    await this.performLiquidityCheck()
  }

  /**
   * Request inbound capacity via LSP
   */
  async requestInboundCapacity(amount: bigint): Promise<string> {
    if (!this.lspService) {
      throw new Error('LSP integration not enabled')
    }

    const operationId = this.generateOperationId()

    const operation: LiquidityOperation = {
      id: operationId,
      type: 'lsp_request',
      status: 'pending',
      amount,
      createdAt: Date.now(),
    }

    this.operations.set(operationId, operation)
    this.emit('operation_created', operation)

    try {
      // Request inbound capacity via LSP
      if (!this.lspService) {
        throw new Error('LSP service not available')
      }

      // Select best LSP for the requested amount
      const bestLsp = this.lspService.selectBestLSP(amount)
      if (!bestLsp) {
        throw new Error(`No suitable LSP found for amount ${amount}`)
      }

      operation.status = 'in_progress'
      this.emit('operation_updated', operation)

      // Open channel via LSP to get inbound capacity
      const result = await this.lspService.openChannelViaLSP(
        bestLsp.lspId,
        amount,
        this.config.maxChannelOpeningFee,
      )

      if (!result.success) {
        throw new Error(result.error || 'LSP channel opening failed')
      }

      operation.status = 'completed'
      operation.completedAt = Date.now()
      operation.result = {
        channelId: result.channelId,
        capacity: result.capacity,
        feePaid: result.feePaid,
      }
      this.emit('operation_completed', operation)

      return operationId
    } catch (error) {
      operation.status = 'failed'
      operation.error = error instanceof Error ? error.message : 'Unknown error'
      this.emit('operation_failed', operation)
      throw error
    }
  }

  // ==========================================
  // PRIVATE METHODS
  // ==========================================

  private startPeriodicChecks(): void {
    this.checkTimer = setInterval(async () => {
      if (!this.isRunning) return

      try {
        await this.performLiquidityCheck()
      } catch (error) {
        console.error('[LiquidityManager] Error during periodic check:', error)
      }
    }, this.config.checkInterval)
  }

  private async performLiquidityCheck(): Promise<void> {
    if (!this.lightningService) return

    const status = await this.getLiquidityStatus()

    console.log('[LiquidityManager] Liquidity check:', {
      balance: status.totalBalance.toString(),
      ratio: status.capacityRatio.toFixed(2),
      channels: status.activeChannels,
    })

    // Check for alerts
    const alerts = this.analyzeLiquidity(status)
    for (const alert of alerts) {
      this.emit('alert', alert)
    }

    // Take actions if needed
    await this.takeLiquidityActions(status)
  }

  private analyzeLiquidity(status: LiquidityStatus): LiquidityAlert[] {
    const alerts: LiquidityAlert[] = []

    // Low balance alert
    if (status.totalBalance < this.config.minBalanceThreshold) {
      alerts.push({
        type: 'low_balance',
        severity: 'warning',
        message: `Balance below threshold: ${status.totalBalance} sats`,
        suggestedAction: 'Consider depositing funds or opening channels',
      })
    }

    // Unbalanced capacity alert
    const ratioDiff = Math.abs(status.capacityRatio - this.config.targetInboundRatio)
    if (ratioDiff > 0.3) {
      // More than 30% deviation
      const direction =
        status.capacityRatio < this.config.targetInboundRatio ? 'inbound' : 'outbound'
      alerts.push({
        type: 'unbalanced_capacity',
        severity: 'info',
        message: `Capacity unbalanced: ${status.capacityRatio.toFixed(2)} ratio (prefer ${direction})`,
        suggestedAction:
          direction === 'inbound' ? 'Request inbound capacity from LSP' : 'Use outbound capacity',
      })
    }

    // Channel count alert
    if (status.activeChannels === 0 && status.totalBalance > this.config.minChannelSize) {
      alerts.push({
        type: 'channel_needed',
        severity: 'critical',
        message: 'No active channels but sufficient balance for channel opening',
        suggestedAction: 'Open initial channel or request LSP service',
      })
    }

    return alerts
  }

  private async takeLiquidityActions(status: LiquidityStatus): Promise<void> {
    // Auto LSP request for inbound capacity
    if (
      this.config.enableLSPIntegration &&
      status.capacityRatio < this.config.targetInboundRatio - 0.2 &&
      status.totalBalance >= this.config.minChannelSize
    ) {
      const requestAmount = this.calculateOptimalChannelSize(status)
      if (requestAmount >= this.config.minChannelSize) {
        try {
          console.log(`[LiquidityManager] Auto-requesting ${requestAmount} sats inbound capacity`)
          await this.requestInboundCapacity(requestAmount)
        } catch (error) {
          console.warn('[LiquidityManager] Auto LSP request failed:', error)
        }
      }
    }

    // Auto channel opening when balance is sufficient but no channels exist
    if (
      status.activeChannels === 0 &&
      status.totalBalance >= this.config.minChannelSize &&
      !this.config.enableLSPIntegration
    ) {
      try {
        console.log(
          `[LiquidityManager] Auto-opening initial channel with ${this.config.minChannelSize} sats`,
        )
        await this.openDirectChannel(this.config.minChannelSize)
      } catch (error) {
        console.warn('[LiquidityManager] Auto channel opening failed:', error)
        // Fallback to LSP if direct opening fails
        if (this.config.enableLSPIntegration) {
          try {
            await this.requestInboundCapacity(this.config.minChannelSize)
          } catch (lspError) {
            console.warn('[LiquidityManager] LSP fallback also failed:', lspError)
          }
        }
      }
    }

    // TODO: Implement auto channel opening logic
    // Additional logic for opening channels to well-connected peers
    // would require peer discovery and reputation systems
  }

  /**
   * Open a direct channel (not via LSP)
   */
  private async openDirectChannel(amount: bigint): Promise<string> {
    if (!this.lightningService) {
      throw new Error('Lightning service not available')
    }

    // For now, this is a placeholder - would need peer discovery
    // In a real implementation, this would:
    // 1. Discover well-connected peers
    // 2. Check peer reputation/reliability
    // 3. Open channel to selected peer

    throw new Error('Direct channel opening not implemented - use LSP integration')
  }

  private calculateOptimalChannelSize(status: LiquidityStatus): bigint {
    // Calculate based on current balance and target ratios
    const availableBalance = status.totalBalance
    const targetInbound = BigInt(
      Math.floor(Number(availableBalance) * this.config.targetInboundRatio),
    )

    // Ensure within bounds
    const optimalSize =
      targetInbound > this.config.maxChannelSize ? this.config.maxChannelSize : targetInbound
    return optimalSize < this.config.minChannelSize ? this.config.minChannelSize : optimalSize
  }

  private generateOperationId(): string {
    return `liquidity_op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

// ==========================================
// FACTORY FUNCTION
// ==========================================

export function createLiquidityManagerService(
  lightningService?: LightningService,
  config?: Partial<LiquidityConfig>,
): LiquidityManagerService {
  return new LiquidityManagerService(lightningService, config)
}

// ==========================================
// DEFAULT EXPORT
// ==========================================

export default LiquidityManagerService
