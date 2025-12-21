// Lightning Monitor Service
// Monitors HTLCs, channels, and Lightning Network state in background
// Implements autonomous monitoring with error recovery and alerts

import EventEmitter from 'eventemitter3'
import WorkerService from './ln-worker-service'
import { ChannelManager } from '../lib/lightning/channel'
import { HTLCManager, HTLCOwner } from '../lib/lightning/htlc'
import { Watchtower } from '../lib/lightning/watchtower'

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface LightningMonitorConfig {
  htlcCheckInterval: number
  channelCheckInterval: number
  watchtowerSyncInterval: number
  htlcExpiryThreshold: number // seconds before expiry to alert
  maxConcurrentChecks: number
  retryAttempts: number
  retryDelay: number
}

export interface MonitorStatus {
  isMonitoring: boolean
  lastHTLCCheck: number
  lastChannelCheck: number
  lastWatchtowerSync: number
  activeHTLCs: number
  expiringHTLCs: number
  channelsNeedingAttention: number
  uptime: number
}

export interface HTLCAlert {
  htlcId: string
  channelId: string
  amount: bigint
  expiry: number
  timeUntilExpiry: number
  risk: 'low' | 'medium' | 'high' | 'critical'
}

export interface ChannelAlert {
  channelId: string
  type: 'force_close_risk' | 'balance_low' | 'peer_unresponsive' | 'stale_channel'
  severity: 'info' | 'warning' | 'error'
  message: string
  data?: any
}

export type MonitorEventType =
  | 'htlc_expiring'
  | 'htlc_expired'
  | 'channel_alert'
  | 'watchtower_sync'
  | 'monitor_started'
  | 'monitor_stopped'
  | 'health_check'

export interface MonitorEvent {
  type: MonitorEventType
  data?: any
  timestamp: number
}

// ==========================================
// CONSTANTS
// ==========================================

const DEFAULT_CONFIG: LightningMonitorConfig = {
  htlcCheckInterval: 30000, // 30 seconds
  channelCheckInterval: 60000, // 1 minute
  watchtowerSyncInterval: 300000, // 5 minutes
  htlcExpiryThreshold: 600, // 10 minutes
  maxConcurrentChecks: 5,
  retryAttempts: 3,
  retryDelay: 5000, // 5 seconds
}

// ==========================================
// LIGHTNING MONITOR SERVICE
// ==========================================

export class LightningMonitorService extends EventEmitter {
  private config: LightningMonitorConfig
  private workerService: WorkerService
  private channelManager: ChannelManager | null
  private htlcManager: HTLCManager
  private watchtowerClient: Watchtower

  private htlcCheckTimer?: number
  private channelCheckTimer?: number
  private watchtowerSyncTimer?: number
  private healthCheckTimer?: number

  private isMonitoring: boolean = false
  private startTime: number = 0
  private lastHTLCCheck: number = 0
  private lastChannelCheck: number = 0
  private lastWatchtowerSync: number = 0

  constructor(workerService: WorkerService, config: Partial<LightningMonitorConfig> = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.workerService = workerService
    this.channelManager = null // TODO: Initialize with proper parameters
    this.htlcManager = new HTLCManager()
    this.watchtowerClient = new Watchtower()
  }

  // ==========================================
  // PUBLIC API
  // ==========================================

  /**
   * Start monitoring Lightning Network state
   */
  async start(): Promise<void> {
    if (this.isMonitoring) return

    this.isMonitoring = true
    this.startTime = Date.now()

    console.log('[LightningMonitor] Starting Lightning monitoring service...')

    // Start monitoring timers
    this.startHTLCMonitoring()
    this.startChannelMonitoring()
    this.startWatchtowerSync()
    this.startHealthMonitoring()

    // Perform initial checks
    await Promise.all([this.checkHTLCs(), this.checkChannels(), this.syncWatchtower()])

    console.log('[LightningMonitor] Lightning monitoring service started')

    this.emit('monitor_started', { timestamp: Date.now() })
  }

  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    if (!this.isMonitoring) return

    this.isMonitoring = false

    console.log('[LightningMonitor] Stopping Lightning monitoring service...')

    // Stop all timers
    this.stopAllTimers()

    console.log('[LightningMonitor] Lightning monitoring service stopped')

    this.emit('monitor_stopped', { timestamp: Date.now() })
  }

  /**
   * Get current monitoring status
   */
  getStatus(): MonitorStatus {
    // Get active HTLCs count
    const activeHtlcs =
      this.htlcManager.getHtlcsActiveAtCtn(HTLCOwner.LOCAL).length +
      this.htlcManager.getHtlcsActiveAtCtn(HTLCOwner.REMOTE).length

    // Calculate expiring HTLCs
    const now = Math.floor(Date.now() / 1000)
    const allHtlcs = [
      ...this.htlcManager.getHtlcsActiveAtCtn(HTLCOwner.LOCAL),
      ...this.htlcManager.getHtlcsActiveAtCtn(HTLCOwner.REMOTE),
    ]
    const expiringHTLCs = allHtlcs.filter(
      htlc => htlc.cltvExpiry - now <= this.config.htlcExpiryThreshold && htlc.cltvExpiry > now,
    ).length

    // Calculate channels needing attention (placeholder - would need channel state)
    const channelsNeedingAttention = 0 // TODO: Implement based on channel states

    return {
      isMonitoring: this.isMonitoring,
      lastHTLCCheck: this.lastHTLCCheck,
      lastChannelCheck: this.lastChannelCheck,
      lastWatchtowerSync: this.lastWatchtowerSync,
      activeHTLCs: activeHtlcs,
      expiringHTLCs,
      channelsNeedingAttention,
      uptime: this.isMonitoring ? Date.now() - this.startTime : 0,
    }
  }

  /**
   * Force immediate HTLC check
   */
  async checkHTLCsNow(): Promise<HTLCAlert[]> {
    return this.checkHTLCs()
  }

  /**
   * Force immediate channel check
   */
  async checkChannelsNow(): Promise<ChannelAlert[]> {
    return this.checkChannels()
  }

  /**
   * Force immediate watchtower sync
   */
  async syncWatchtowerNow(): Promise<void> {
    return this.syncWatchtower()
  }

  // ==========================================
  // PRIVATE METHODS
  // ==========================================

  private startHTLCMonitoring(): void {
    this.htlcCheckTimer = setInterval(async () => {
      try {
        await this.checkHTLCs()
      } catch (error) {
        console.error('[LightningMonitor] HTLC check failed:', error)
      }
    }, this.config.htlcCheckInterval)
  }

  private startChannelMonitoring(): void {
    this.channelCheckTimer = setInterval(async () => {
      try {
        await this.checkChannels()
      } catch (error) {
        console.error('[LightningMonitor] Channel check failed:', error)
      }
    }, this.config.channelCheckInterval)
  }

  private startWatchtowerSync(): void {
    this.watchtowerSyncTimer = setInterval(async () => {
      try {
        await this.syncWatchtower()
      } catch (error) {
        console.error('[LightningMonitor] Watchtower sync failed:', error)
      }
    }, this.config.watchtowerSyncInterval)
  }

  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(() => {
      const status = this.getStatus()
      console.log('[LightningMonitor] Health check:', status)

      this.emit('health_check', { status, timestamp: Date.now() })
    }, 60000) // 1 minute
  }

  private stopAllTimers(): void {
    if (this.htlcCheckTimer) {
      clearInterval(this.htlcCheckTimer)
      this.htlcCheckTimer = undefined
    }

    if (this.channelCheckTimer) {
      clearInterval(this.channelCheckTimer)
      this.channelCheckTimer = undefined
    }

    if (this.watchtowerSyncTimer) {
      clearInterval(this.watchtowerSyncTimer)
      this.watchtowerSyncTimer = undefined
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = undefined
    }
  }

  private async checkHTLCs(): Promise<HTLCAlert[]> {
    if (!this.isMonitoring) return []

    this.lastHTLCCheck = Date.now()

    try {
      // Get active HTLCs from HTLC manager
      const localHtlcs = this.htlcManager.getHtlcsActiveAtCtn(HTLCOwner.LOCAL)
      const remoteHtlcs = this.htlcManager.getHtlcsActiveAtCtn(HTLCOwner.REMOTE)
      const allHtlcs = [...localHtlcs, ...remoteHtlcs]

      const alerts: HTLCAlert[] = []
      const now = Math.floor(Date.now() / 1000) // Current time in seconds

      for (const htlc of allHtlcs) {
        const timeUntilExpiry = htlc.cltvExpiry - now

        // Check if HTLC is expiring soon
        if (timeUntilExpiry <= this.config.htlcExpiryThreshold && timeUntilExpiry > 0) {
          const risk = this.calculateHtlcRisk(timeUntilExpiry)

          const alert: HTLCAlert = {
            htlcId: htlc.htlcId.toString(),
            channelId: 'unknown', // TODO: Get channel ID from HTLC context
            amount: htlc.amountMsat,
            expiry: htlc.cltvExpiry,
            timeUntilExpiry,
            risk,
          }

          alerts.push(alert)

          this.emit('htlc_expiring', {
            alert,
            timestamp: Date.now(),
          })

          console.warn(
            `[LightningMonitor] HTLC expiring soon: ${htlc.htlcId}, ${timeUntilExpiry}s remaining`,
          )
        }

        // Check if HTLC has expired
        if (timeUntilExpiry <= 0) {
          this.emit('htlc_expired', {
            htlc,
            timestamp: Date.now(),
          })

          console.error(`[LightningMonitor] HTLC expired: ${htlc.htlcId}`)
        }
      }

      return alerts
    } catch (error) {
      console.error('[LightningMonitor] Failed to check HTLCs:', error)
      throw error
    }
  }

  private async checkChannels(): Promise<ChannelAlert[]> {
    if (!this.isMonitoring) return []

    this.lastChannelCheck = Date.now()

    try {
      // Get channels from service
      const channels = await this.workerService.getChannels()
      const alerts: ChannelAlert[] = []

      for (const channel of channels) {
        // Check for force close risk
        if (this.isChannelAtRisk(channel)) {
          const alert: ChannelAlert = {
            channelId: channel.channelId,
            type: 'force_close_risk',
            severity: 'warning',
            message: `Channel ${channel.channelId} is at risk of force close`,
            data: { channel },
          }

          alerts.push(alert)
          this.emit('channel_alert', { alert, timestamp: Date.now() })
        }

        // Check for low balance
        if (this.isBalanceLow(channel)) {
          const alert: ChannelAlert = {
            channelId: channel.channelId,
            type: 'balance_low',
            severity: 'info',
            message: `Channel ${channel.channelId} has low balance`,
            data: { channel },
          }

          alerts.push(alert)
          this.emit('channel_alert', { alert, timestamp: Date.now() })
        }

        // Check for unresponsive peer
        if (this.isPeerUnresponsive(channel)) {
          const alert: ChannelAlert = {
            channelId: channel.channelId,
            type: 'peer_unresponsive',
            severity: 'error',
            message: `Peer for channel ${channel.channelId} is unresponsive`,
            data: { channel },
          }

          alerts.push(alert)
          this.emit('channel_alert', { alert, timestamp: Date.now() })
        }
      }

      return alerts
    } catch (error) {
      console.error('[LightningMonitor] Failed to check channels:', error)
      throw error
    }
  }

  private async syncWatchtower(): Promise<void> {
    if (!this.isMonitoring) return

    this.lastWatchtowerSync = Date.now()

    try {
      // Sync with watchtower
      await this.watchtowerClient.sync()

      console.log('[LightningMonitor] Watchtower sync completed')

      this.emit('watchtower_sync', { timestamp: Date.now() })
    } catch (error) {
      console.error('[LightningMonitor] Watchtower sync failed:', error)
      throw error
    }
  }

  private calculateHtlcRisk(timeUntilExpiry: number): HTLCAlert['risk'] {
    if (timeUntilExpiry <= 60) return 'critical' // 1 minute
    if (timeUntilExpiry <= 300) return 'high' // 5 minutes
    if (timeUntilExpiry <= 600) return 'medium' // 10 minutes
    return 'low'
  }

  private isChannelAtRisk(channel: any): boolean {
    // Check for pending HTLCs that could cause force close
    const localHtlcs = this.htlcManager.getHtlcsActiveAtCtn(HTLCOwner.LOCAL)
    const remoteHtlcs = this.htlcManager.getHtlcsActiveAtCtn(HTLCOwner.REMOTE)
    const totalHtlcValue = [...localHtlcs, ...remoteHtlcs].reduce(
      (sum, htlc) => sum + htlc.amountMsat,
      // @ts-ignore - BigInt literal for capacity check
      BigInt(0),
    )

    // Risk if HTLCs represent more than 80% of channel capacity
    const capacity = BigInt(channel.capacitySat || channel.capacity || 0)
    // @ts-ignore - BigInt comparison for capacity check
    if (capacity > BigInt(0)) {
      const htlcRatio = Number(totalHtlcValue) / Number(capacity)
      if (htlcRatio > 0.8) return true
    }

    // Check for very unbalanced channels (one side has < 10% of capacity)
    const localBalance = BigInt(channel.localBalanceSat || 0)
    // @ts-ignore - BigInt comparison for capacity check
    if (capacity > BigInt(0)) {
      const balanceRatio = Number(localBalance) / Number(capacity)
      if (balanceRatio < 0.1 || balanceRatio > 0.9) return true
    }

    return false
  }

  private isBalanceLow(channel: any): boolean {
    // Check if local balance is below minimum threshold
    const localBalance = BigInt(channel.localBalanceSat || 0)
    const capacity = BigInt(channel.capacitySat || channel.capacity || 0)

    // @ts-ignore - BigInt comparison for zero check
    if (capacity === BigInt(0)) return false

    const balanceRatio = Number(localBalance) / Number(capacity)
    return balanceRatio < 0.05 // Less than 5% of channel capacity
  }

  private isPeerUnresponsive(channel: any): boolean {
    // TODO: Implement peer responsiveness check
    // Check last ping/pong times, connection status, etc.
    // For now, assume peers are responsive
    return false
  }
}

// ==========================================
// FACTORY FUNCTION
// ==========================================

export function createLightningMonitorService(
  workerService: WorkerService,
  config?: Partial<LightningMonitorConfig>,
): LightningMonitorService {
  return new LightningMonitorService(workerService, config)
}
