/**
 * Lightning Store
 *
 * Store singleton com pub/sub para gerenciamento de funcionalidades Lightning Network.
 * Integrado ao AppProvider seguindo a arquitetura centralizada.
 */

import { LightningState, Invoice, Payment, Channel, Millisatoshis, DecodedInvoice } from './types'
import { INITIAL_LIGHTNING_STATE } from './types'
import { mapServiceInvoices, mapServicePayments } from './utils'
import {
  createInitialReadinessState,
  getReadinessLevel,
  type ReadinessState,
} from '@/core/models/lightning/readiness'
import { getInvoiceExpiryStatus } from '@/core/lib/lightning/invoice'
import { uint8ArrayToHex } from '@/core/lib/utils/utils'
import { getTransport } from '@/core/services/ln-transport-service'
import { createWorkerService, type WorkerService } from '@/core/services/ln-worker-service'
import type { WorkerInitStatus, WorkerMetrics } from '@/core/services/ln-worker-service'
import { walletService } from '@/core/services'
import { walletStore } from '../wallet/store'
import { getTrafficControl } from '@/core/services/ln-traffic-control-service'

// ==========================================
// CONSTANTS
// ==========================================

const ZERO_BIGINT = BigInt(0)

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function assertWalletId(walletId: string | undefined): asserts walletId is string {
  if (!walletId) {
    throw new Error('No active wallet found')
  }
}

function assertConnected(isConnected: boolean): void {
  if (!isConnected) {
    throw new Error('Not connected to peer')
  }
}

// ==========================================
// TYPES
// ==========================================

/**
 * Estado do LightningStore
 *
 * @see docs/lightning-worker-consolidation-plan.md - Fase 4
 */
export interface LightningStoreState extends LightningState {
  initStatus: 'idle' | 'initializing' | 'ready' | 'error'
  workerStatus?: WorkerInitStatus
  workerMetrics?: WorkerMetrics
  // workerReadiness removido - usar readinessState (Fase 4)
}

// ==========================================
// STORE CLASS
// ==========================================

class LightningStore {
  private subscribers = new Set<() => void>()
  private state: LightningStoreState = {
    ...INITIAL_LIGHTNING_STATE,
    initStatus: 'idle',
  }
  private workerService: WorkerService | null = null
  private workerUnsubscribe: (() => void)[] = []

  constructor() {
    this.initializeService()
    this.attachWorkerListeners()
    this.setupTrafficControl()
  }

  private initializeService(): void {
    if (!this.workerService) {
      this.workerService = createWorkerService()
    }
  }

  private getWorkerService(): WorkerService {
    if (!this.workerService) {
      this.initializeService()
      this.attachWorkerListeners()
    }
    return this.workerService!
  }

  private attachWorkerListeners(): void {
    if (!this.workerService) return

    this.detachWorkerListeners()

    const statusHandler = (status: WorkerInitStatus) => this.setWorkerStatus(status)
    // Agora o worker emite ReadinessState diretamente (não WorkerReadiness)
    const readinessHandler = (readiness: ReadinessState) => this.syncWorkerReadiness(readiness)
    const metricsHandler = (metrics: WorkerMetrics) => this.setWorkerMetrics(metrics)

    this.workerService.on('status', statusHandler)
    this.workerService.on('readiness', readinessHandler)
    this.workerService.on('metrics', metricsHandler)

    this.workerUnsubscribe = [
      () => this.workerService?.off('status', statusHandler),
      () => this.workerService?.off('readiness', readinessHandler),
      () => this.workerService?.off('metrics', metricsHandler),
    ]

    // Seed UI with latest metrics/status immediately
    const currentMetrics = this.workerService.getMetrics?.()
    if (currentMetrics) {
      this.setWorkerMetrics(currentMetrics)
    }
  }

  private detachWorkerListeners(): void {
    this.workerUnsubscribe.forEach(off => off())
    this.workerUnsubscribe = []
  }

  private setupTrafficControl(): void {
    const trafficControl = getTrafficControl()

    const checkWalletAvailability = () => {
      const walletId = walletService.getActiveWalletId()
      const isAvailable = !!walletId
      trafficControl.setWalletAvailability(isAvailable)
    }

    checkWalletAvailability()

    const unsubscribe = walletStore.subscribe(() => {
      checkWalletAvailability()
    })

    this.unsubscribeWallet = unsubscribe
  }

  private unsubscribeWallet?: () => void

  // mapWorkerReadiness removido - worker agora emite ReadinessState diretamente
  // updateReadiness removido - fluxo agora é unidirecional (worker -> store)
  // @see docs/lightning-worker-consolidation-plan.md - Fase 4

  // ==========================================
  // SUBSCRIPTION
  // ==========================================

  subscribe = (callback: () => void): (() => void) => {
    this.subscribers.add(callback)
    return () => {
      this.subscribers.delete(callback)
    }
  }

  private notify = (): void => {
    this.subscribers.forEach(callback => callback())
  }

  private setWorkerStatus = (status: WorkerInitStatus): void => {
    this.state = { ...this.state, workerStatus: status }
    this.notify()
  }

  private setWorkerMetrics = (metrics: WorkerMetrics): void => {
    this.state = {
      ...this.state,
      workerMetrics: { ...this.state.workerMetrics, ...metrics },
    }
    this.notify()
  }

  /**
   * Sincroniza o estado de readiness do WorkerService.
   *
   * Recebe ReadinessState diretamente do worker (sem necessidade de mapeamento).
   *
   * @see docs/lightning-worker-consolidation-plan.md - Fase 4.2b
   */
  private syncWorkerReadiness = (readiness: ReadinessState): void => {
    const previousLevel = this.state.readinessLevel
    const newLevel = getReadinessLevel(readiness)

    // Atualizar estado diretamente
    this.state = {
      ...this.state,
      readinessState: readiness,
      readinessLevel: newLevel,
    }

    // Notificar apenas se houve mudança
    if (previousLevel !== newLevel || this.hasReadinessChanged(readiness)) {
      this.notify()
    }
  }

  private hasReadinessChanged(newReadiness: ReadinessState): boolean {
    const current = this.state.readinessState
    return (
      current.isWalletLoaded !== newReadiness.isWalletLoaded ||
      current.isTransportConnected !== newReadiness.isTransportConnected ||
      current.isPeerConnected !== newReadiness.isPeerConnected ||
      current.isChannelReestablished !== newReadiness.isChannelReestablished ||
      current.isGossipSynced !== newReadiness.isGossipSynced ||
      current.isWatcherRunning !== newReadiness.isWatcherRunning
    )
  }

  private resetForWalletChange = (): void => {
    this.detachWorkerListeners()
    const readinessState = createInitialReadinessState()

    if (this.workerService) {
      this.attachWorkerListeners()
    }

    this.state = {
      ...INITIAL_LIGHTNING_STATE,
      readinessState,
      readinessLevel: getReadinessLevel(readinessState),
      initStatus: 'idle',
      workerStatus: undefined,
      workerMetrics: undefined,
    }

    this.notify()
  }

  // ==========================================
  // SNAPSHOTS
  // ==========================================

  getSnapshot = (): LightningStoreState => {
    return this.state
  }

  getReadinessState = () => this.state.readinessState
  getReadinessLevel = () => this.state.readinessLevel

  canSendPayment = (): { ok: boolean; reason?: string } => {
    const worker = this.getWorkerService()
    return worker.canSendPayment()
  }

  canReceivePayment = (): { ok: boolean; reason?: string } => {
    const worker = this.getWorkerService()
    return worker.canReceivePayment()
  }

  // Expose worker instance for global access (AppProvider/hooks)
  getWorker = (): WorkerService => this.getWorkerService()

  // ==========================================
  // ACTIONS
  // ==========================================

  initialize = async (): Promise<void> => {
    if (this.state.isInitialized || this.state.isLoading) return

    this.state = { ...this.state, isLoading: true, error: null, initStatus: 'initializing' }
    this.notify()

    try {
      const walletId = walletService.getActiveWalletId()
      assertWalletId(walletId)

      const workerService = this.getWorkerService()
      await workerService.initFromWallet(walletId)

      const [balance, channels, invoices, payments, readinessState] = await Promise.all([
        workerService.getBalance(),
        workerService.getChannels(),
        workerService.getInvoices(),
        workerService.getPayments(),
        workerService.getReadinessState(),
      ])

      // Usar readiness real reportado pelo serviço (sem defaults otimistas)
      const resolvedReadiness: ReadinessState = {
        ...readinessState,
        isWalletLoaded: true,
      }
      // Sincronizar estado inicial de readiness
      this.syncWorkerReadiness(resolvedReadiness)

      this.state = {
        ...this.state,
        isInitialized: true,
        isLoading: false,
        readinessState: this.state.readinessState,
        readinessLevel: this.state.readinessLevel,
        totalBalance: balance,
        channels,
        hasActiveChannels: channels.some(ch => ch.isActive),
        invoices: mapServiceInvoices(invoices),
        payments: mapServicePayments(payments),
        initStatus: 'ready',
      }
      this.notify()
    } catch (err) {
      console.error('[LightningStore] Initialization failed:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize Lightning'
      this.state = {
        ...this.state,
        isLoading: false,
        error: errorMessage,
        initStatus: 'error',
      }
      this.notify()
    }
  }

  generateInvoice = async (amount: Millisatoshis, description?: string): Promise<Invoice> => {
    const workerService = this.getWorkerService()
    const result = await workerService.generateInvoice({ amount, description })

    const invoice: Invoice = {
      paymentHash: result.paymentHash,
      invoice: result.invoice,
      amount: result.amount,
      description: result.description,
      status: 'pending',
      createdAt: result.createdAt,
      expiresAt: result.createdAt + result.expiry * 1000,
      requiresChannelOpening: result.requiresChannelOpening,
      channelOpeningFee: result.channelOpeningFee,
    }

    this.state = {
      ...this.state,
      invoices: [invoice, ...this.state.invoices],
    }
    this.notify()

    return invoice
  }

  decodeInvoice = async (invoice: string): Promise<DecodedInvoice> => {
    const workerService = this.getWorkerService()
    const decoded = await workerService.decodeInvoice(invoice)
    const expiryStatus = getInvoiceExpiryStatus(decoded)

    return {
      amount: decoded.amount ?? 0n,
      description: decoded.taggedFields.description ?? '',
      paymentHash: uint8ArrayToHex(decoded.taggedFields.paymentHash),
      isExpired: expiryStatus.isExpired,
    }
  }

  sendPayment = async (invoice: string, maxFee?: bigint): Promise<Payment> => {
    const workerService = this.getWorkerService()
    const result = await workerService.sendPayment({ invoice, maxFee })

    let amountMsat: Millisatoshis = 0n
    try {
      const decoded = await workerService.decodeInvoice(invoice)
      amountMsat = decoded.amount ?? 0n
    } catch (err) {
      console.warn('[LightningStore] Failed to decode invoice for amount:', err)
    }

    const payment: Payment = {
      paymentHash: result.paymentHash,
      amount: amountMsat,
      status: result.success ? 'succeeded' : 'failed',
      direction: 'sent',
      createdAt: Date.now(),
      resolvedAt: result.success ? Date.now() : undefined,
      preimage: result.preimage,
      error: result.error,
    }

    this.state = {
      ...this.state,
      payments: [payment, ...this.state.payments],
    }
    this.notify()

    if (result.success) {
      workerService.getBalance().then(balance => {
        this.state = { ...this.state, totalBalance: balance }
        this.notify()
      })
    }

    return payment
  }

  getBalance = async (): Promise<Millisatoshis> => {
    const workerService = this.getWorkerService()
    if (!workerService.isInitialized()) return ZERO_BIGINT
    return workerService.getBalance()
  }

  refreshBalance = async (): Promise<void> => {
    const workerService = this.getWorkerService()
    if (!workerService.isInitialized()) return

    try {
      const balance = await workerService.getBalance()
      this.state = { ...this.state, totalBalance: balance }
      this.notify()
    } catch (error) {
      console.error('[LightningStore] Failed to refresh balance:', error)
    }
  }

  getChannels = async (): Promise<Channel[]> => {
    const workerService = this.getWorkerService()
    if (!workerService.isInitialized()) return []

    const channels = await workerService.getChannels()
    this.state = {
      ...this.state,
      channels,
      hasActiveChannels: channels.some(ch => ch.isActive),
    }
    this.notify()

    return channels
  }

  hasChannels = async (): Promise<boolean> => {
    const workerService = this.getWorkerService()
    if (!workerService.isInitialized()) return false
    return workerService.hasActiveChannels()
  }

  createChannel = async (params: {
    peerId: string
    capacitySat: bigint
    pushMsat?: bigint
    feeRatePerKw?: number
  }): Promise<Channel> => {
    this.state = { ...this.state, isLoading: true, error: null }
    this.notify()

    try {
      const newChannel: Channel = {
        channelId: `channel-${Date.now()}`,
        peerId: params.peerId,
        state: 'opening',
        localBalanceSat: params.capacitySat - (params.pushMsat ? params.pushMsat / 1000n : 0n),
        remoteBalanceSat: params.pushMsat ? params.pushMsat / 1000n : 0n,
        capacitySat: params.capacitySat,
        isActive: false,
      }

      this.state = {
        ...this.state,
        isLoading: false,
        channels: [...this.state.channels, newChannel],
      }
      this.notify()

      return newChannel
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create channel'
      this.state = { ...this.state, isLoading: false, error: errorMessage }
      this.notify()
      throw error
    }
  }

  closeChannel = async (channelId: string): Promise<void> => {
    this.state = { ...this.state, isLoading: true, error: null }
    this.notify()

    try {
      this.state = {
        ...this.state,
        isLoading: false,
        channels: this.state.channels.map(ch =>
          ch.channelId === channelId ? { ...ch, state: 'closing' as const, isActive: false } : ch,
        ),
      }
      this.notify()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to close channel'
      this.state = { ...this.state, isLoading: false, error: errorMessage }
      this.notify()
      throw error
    }
  }

  forceCloseChannel = async (channelId: string): Promise<void> => {
    this.state = { ...this.state, isLoading: true, error: null }
    this.notify()

    try {
      this.state = {
        ...this.state,
        isLoading: false,
        channels: this.state.channels.map(ch =>
          ch.channelId === channelId ? { ...ch, state: 'closing' as const, isActive: false } : ch,
        ),
      }
      this.notify()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to force close channel'
      this.state = { ...this.state, isLoading: false, error: errorMessage }
      this.notify()
      throw error
    }
  }

  refreshInvoices = async (): Promise<void> => {
    const workerService = this.getWorkerService()
    if (!workerService.isInitialized()) return

    try {
      const invoices = await workerService.getInvoices()
      this.state = {
        ...this.state,
        invoices: mapServiceInvoices(invoices),
      }
      this.notify()
    } catch (error) {
      console.error('[LightningStore] Failed to refresh invoices:', error)
    }
  }

  refreshPayments = async (): Promise<void> => {
    const workerService = this.getWorkerService()
    if (!workerService.isInitialized()) return

    try {
      const payments = await workerService.getPayments()
      this.state = {
        ...this.state,
        payments: mapServicePayments(payments),
      }
      this.notify()
    } catch (error) {
      console.error('[LightningStore] Failed to refresh payments:', error)
    }
  }

  /**
   * @deprecated Use `workerService.addPeer()` em vez deste método.
   * A gestão de peers está consolidada no LightningWorker.peerManager.
   */
  connectToPeer = async (peerId: string): Promise<void> => {
    console.warn(
      '[LightningStore] connectToPeer is deprecated. Use workerService.addPeer() instead.',
    )
    this.state = { ...this.state, isLoading: true, error: null }
    this.notify()

    try {
      const transport = getTransport()
      await transport.connect(peerId)
      // Readiness é atualizado pelo WorkerService via eventos
      this.state = {
        ...this.state,
        isLoading: false,
        connection: {
          ...this.state.connection,
          isConnected: true,
          peerId,
        },
      }
      this.notify()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect'
      this.state = {
        ...this.state,
        isLoading: false,
        error: errorMessage,
        connection: {
          ...this.state.connection,
          error: errorMessage,
        },
      }
      this.notify()
    }
  }

  /**
   * @deprecated Use `workerService.stop()` ou gestão de peers via WorkerService.
   * A gestão de peers está sendo consolidada no WorkerService.
   *
   * @see docs/lightning-worker-consolidation-plan.md - Fase 5.1
   */
  disconnect = async (): Promise<void> => {
    console.warn('[LightningStore] disconnect is deprecated. Use workerService methods instead.')
    this.state = { ...this.state, isLoading: true }
    this.notify()

    try {
      const transport = getTransport()
      await transport.disconnect()
      // Readiness é atualizado pelo WorkerService via eventos
      this.state = {
        ...this.state,
        isLoading: false,
        connection: INITIAL_LIGHTNING_STATE.connection,
      }
      this.notify()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to disconnect'
      this.state = {
        ...this.state,
        isLoading: false,
        error: errorMessage,
      }
      this.notify()
    }
  }

  /**
   * @deprecated Ping é gerenciado internamente pelo WorkerService/PeerConnectivityService.
   *
   * @see docs/lightning-worker-consolidation-plan.md - Fase 5.1
   */
  sendPing = async (): Promise<void> => {
    console.warn('[LightningStore] sendPing is deprecated. Ping is managed by WorkerService.')
    assertConnected(this.state.connection.isConnected)

    try {
      const transport = getTransport()
      await transport.sendPing()
      this.state = {
        ...this.state,
        connection: {
          ...this.state.connection,
          lastPing: Date.now(),
        },
      }
      this.notify()
    } catch (error) {
      console.error('[LightningStore] Ping failed:', error)
    }
  }

  // ==========================================
  // ACTIONS GETTER
  // ==========================================

  get actions() {
    return {
      initialize: this.initialize,
      generateInvoice: this.generateInvoice,
      decodeInvoice: this.decodeInvoice,
      sendPayment: this.sendPayment,
      getBalance: this.getBalance,
      refreshBalance: this.refreshBalance,
      getChannels: this.getChannels,
      hasChannels: this.hasChannels,
      createChannel: this.createChannel,
      closeChannel: this.closeChannel,
      forceCloseChannel: this.forceCloseChannel,
      refreshInvoices: this.refreshInvoices,
      refreshPayments: this.refreshPayments,
      connectToPeer: this.connectToPeer,
      disconnect: this.disconnect,
      sendPing: this.sendPing,
      setWorkerStatus: this.setWorkerStatus,
      setWorkerMetrics: this.setWorkerMetrics,
      syncWorkerReadiness: this.syncWorkerReadiness,
      resetForWalletChange: this.resetForWalletChange,
      getWorker: this.getWorker,
      canSendPayment: this.canSendPayment,
      canReceivePayment: this.canReceivePayment,
    }
  }
}

export const lightningStore = new LightningStore()

// Helper to fetch the shared worker instance without reaching into the store internals
export const getLightningWorker = (): WorkerService => lightningStore.getWorker()
