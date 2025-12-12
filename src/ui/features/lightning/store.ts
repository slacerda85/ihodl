/**
 * Lightning Store
 *
 * Store singleton com pub/sub para gerenciamento de funcionalidades Lightning Network.
 * Integrado ao AppProvider seguindo a arquitetura centralizada.
 */

import { LightningState, Invoice, Payment, Channel, Millisatoshis, DecodedInvoice } from './types'
import { INITIAL_LIGHTNING_STATE } from './types'
import { mapServiceInvoices, mapServicePayments } from './utils'
import { getReadinessLevel } from '@/core/models/lightning/readiness'
import LightningService, {
  connectToPeer as connectToPeerService,
  disconnect as disconnectService,
  sendPing as sendPingService,
} from '@/core/services/ln-service'
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

function assertServiceInitialized(service: LightningService): void {
  if (!service.isInitialized()) {
    throw new Error('Lightning not initialized')
  }
}

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

export interface LightningStoreState extends LightningState {
  initStatus: 'idle' | 'initializing' | 'ready' | 'error'
}

export interface LightningStoreActions {
  initialize: () => Promise<void>
  generateInvoice: (amount: Millisatoshis, description?: string) => Promise<Invoice>
  decodeInvoice: (invoice: string) => Promise<DecodedInvoice>
  sendPayment: (invoice: string, maxFee?: bigint) => Promise<Payment>
  getBalance: () => Promise<Millisatoshis>
  refreshBalance: () => Promise<void>
  getChannels: () => Promise<Channel[]>
  hasChannels: () => Promise<boolean>
  createChannel: (params: {
    peerId: string
    capacitySat: bigint
    pushMsat?: bigint
    feeRatePerKw?: number
  }) => Promise<Channel>
  closeChannel: (channelId: string) => Promise<void>
  forceCloseChannel: (channelId: string) => Promise<void>
  refreshInvoices: () => Promise<void>
  refreshPayments: () => Promise<void>
  connectToPeer: (peerId: string) => Promise<void>
  disconnect: () => Promise<void>
  sendPing: () => Promise<void>
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
  private service: LightningService | null = null

  constructor() {
    this.initializeService()
    this.setupTrafficControl()
  }

  private initializeService(): void {
    if (!this.service) {
      this.service = new LightningService()
    }
  }

  private getService(): LightningService {
    if (!this.service) {
      this.initializeService()
    }
    return this.service!
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

  // ==========================================
  // SNAPSHOTS
  // ==========================================

  getSnapshot = (): LightningStoreState => {
    return this.state
  }

  getReadinessState = () => this.state.readinessState
  getReadinessLevel = () => this.state.readinessLevel

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

      const service = this.getService()
      await service.initialize(walletId)

      const [balance, channels, invoices, payments, readinessState] = await Promise.all([
        service.getBalance(),
        service.getChannels(),
        service.getInvoices(),
        service.getPayments(),
        service.getReadinessState(),
      ])

      this.state = {
        ...this.state,
        isInitialized: true,
        isLoading: false,
        readinessState,
        readinessLevel: getReadinessLevel(readinessState),
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
    const service = this.getService()
    assertServiceInitialized(service)

    const result = await service.generateInvoice({ amount, description })

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
    const service = this.getService()
    assertServiceInitialized(service)
    return service.decodeInvoice(invoice)
  }

  sendPayment = async (invoice: string, maxFee?: bigint): Promise<Payment> => {
    const service = this.getService()
    assertServiceInitialized(service)

    const result = await service.sendPayment({ invoice, maxFee })

    const payment: Payment = {
      paymentHash: result.paymentHash,
      amount: ZERO_BIGINT,
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
      service.getBalance().then(balance => {
        this.state = { ...this.state, totalBalance: balance }
        this.notify()
      })
    }

    return payment
  }

  getBalance = async (): Promise<Millisatoshis> => {
    const service = this.getService()
    if (!service.isInitialized()) return ZERO_BIGINT
    return service.getBalance()
  }

  refreshBalance = async (): Promise<void> => {
    const service = this.getService()
    if (!service.isInitialized()) return

    try {
      const balance = await service.getBalance()
      this.state = { ...this.state, totalBalance: balance }
      this.notify()
    } catch (error) {
      console.error('[LightningStore] Failed to refresh balance:', error)
    }
  }

  getChannels = async (): Promise<Channel[]> => {
    const service = this.getService()
    if (!service.isInitialized()) return []

    const channels = await service.getChannels()
    this.state = {
      ...this.state,
      channels,
      hasActiveChannels: channels.some(ch => ch.isActive),
    }
    this.notify()

    return channels
  }

  hasChannels = async (): Promise<boolean> => {
    const service = this.getService()
    if (!service.isInitialized()) return false
    return service.hasActiveChannels()
  }

  createChannel = async (params: {
    peerId: string
    capacitySat: bigint
    pushMsat?: bigint
    feeRatePerKw?: number
  }): Promise<Channel> => {
    const service = this.getService()
    assertServiceInitialized(service)

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
    const service = this.getService()
    assertServiceInitialized(service)

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
    const service = this.getService()
    assertServiceInitialized(service)

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
    const service = this.getService()
    if (!service.isInitialized()) return

    try {
      const invoices = await service.getInvoices()
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
    const service = this.getService()
    if (!service.isInitialized()) return

    try {
      const payments = await service.getPayments()
      this.state = {
        ...this.state,
        payments: mapServicePayments(payments),
      }
      this.notify()
    } catch (error) {
      console.error('[LightningStore] Failed to refresh payments:', error)
    }
  }

  connectToPeer = async (peerId: string): Promise<void> => {
    this.state = { ...this.state, isLoading: true, error: null }
    this.notify()

    try {
      await connectToPeerService(peerId)
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

  disconnect = async (): Promise<void> => {
    this.state = { ...this.state, isLoading: true }
    this.notify()

    try {
      await disconnectService()
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

  sendPing = async (): Promise<void> => {
    assertConnected(this.state.connection.isConnected)

    try {
      await sendPingService()
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
  // ACTIONS OBJECT
  // ==========================================

  actions: LightningStoreActions = {
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
  }
}

// ==========================================
// SINGLETON INSTANCE
// ==========================================

export const lightningStore = new LightningStore()
