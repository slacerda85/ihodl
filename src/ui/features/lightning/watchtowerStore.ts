/**
 * Watchtower Store
 *
 * Store singleton com pub/sub para gerenciamento do Watchtower service.
 * Integrado ao AppProvider seguindo a arquitetura centralizada.
 */

import watchtowerService, {
  WatchtowerStatus,
  WatchtowerEventForUI,
  MonitoredChannel,
  WatchtowerServiceConfig,
  type BreachResult,
  type ChannelInfo,
} from '@/core/services/ln-watchtower-service'

// ==========================================
// TYPES
// ==========================================

export interface WatchtowerStoreState {
  isInitialized: boolean
  isRunning: boolean
  status: WatchtowerStatus
  channels: MonitoredChannel[]
  events: WatchtowerEventForUI[]
  hasBreaches: boolean
  lastBreachEvent?: WatchtowerEventForUI
}

export interface WatchtowerStoreActions {
  initialize: (config?: Partial<WatchtowerServiceConfig>) => Promise<void>
  start: () => void
  stop: () => void
  addChannel: (channelId: string, channelInfo: ChannelInfo, remotePubkey: Uint8Array) => void
  removeChannel: (channelId: string) => void
  refreshChannels: () => void
  checkChannel: (channelId: string, txHex: string) => BreachResult
  storeRevocationSecret: (
    channelId: string,
    commitmentNumber: bigint,
    revocationSecret: Uint8Array,
  ) => void
  clearEvents: () => void
}

// ==========================================
// INITIAL STATE
// ==========================================

const initialStatus: WatchtowerStatus = {
  isRunning: false,
  monitoredChannels: 0,
  activeChannels: 0,
  totalSecretsStored: 0,
  breachesDetected: 0,
  penaltiesBroadcast: 0,
  lastCheck: 0,
}

const initialState: WatchtowerStoreState = {
  isInitialized: false,
  isRunning: false,
  status: initialStatus,
  channels: [],
  events: [],
  hasBreaches: false,
  lastBreachEvent: undefined,
}

// ==========================================
// STORE CLASS
// ==========================================

class WatchtowerStore {
  private subscribers = new Set<() => void>()
  private state: WatchtowerStoreState = { ...initialState }
  private eventUnsubscribe: (() => void) | null = null

  constructor() {
    // Auto-initialize on first access
    this.initializeService()
  }

  private initializeService(): void {
    // Setup event listener
    this.eventUnsubscribe = watchtowerService.addEventListener(event => {
      this.updateStateFromService()
      this.notify()
    })
  }

  private updateStateFromService(): void {
    const status = watchtowerService.getStatus()
    const channels = watchtowerService.getMonitoredChannels()
    const events = watchtowerService.getEvents()

    this.state = {
      isInitialized: true, // Assume initialized if service is responding
      isRunning: status.isRunning,
      status,
      channels,
      events,
      hasBreaches: status.breachesDetected > 0,
      lastBreachEvent: events.find(e => e.type === 'breach_detected'),
    }
  }

  // ==========================================
  // SUBSCRIPTION
  // ==========================================

  subscribe = (callback: () => void): (() => void) => {
    this.subscribers.add(callback)
    return () => {
      this.subscribers.delete(callback)
    }
  }

  private notify(): void {
    this.subscribers.forEach(callback => callback())
  }

  // ==========================================
  // SNAPSHOTS
  // ==========================================

  getSnapshot = (): WatchtowerStoreState => {
    return this.state
  }

  getIsInitialized = (): boolean => {
    return this.state.isInitialized
  }

  getIsRunning = (): boolean => {
    return this.state.isRunning
  }

  getStatus = (): WatchtowerStatus => {
    return this.state.status
  }

  getChannels = (): MonitoredChannel[] => {
    return this.state.channels
  }

  getEvents = (): WatchtowerEventForUI[] => {
    return this.state.events
  }

  getHasBreaches = (): boolean => {
    return this.state.hasBreaches
  }

  // ==========================================
  // ACTIONS GETTER
  // ==========================================

  get actions(): WatchtowerStoreActions {
    return {
      initialize: async (config?: Partial<WatchtowerServiceConfig>): Promise<void> => {
        try {
          await watchtowerService.initialize({
            autoStart: false,
            ...config,
          })
          this.updateStateFromService()
          this.notify()
        } catch (error) {
          console.error('[WatchtowerStore] Initialization failed:', error)
          throw error
        }
      },

      start: (): void => {
        watchtowerService.start()
        this.updateStateFromService()
        this.notify()
      },

      stop: (): void => {
        watchtowerService.stop()
        this.updateStateFromService()
        this.notify()
      },

      addChannel: (channelId: string, channelInfo: ChannelInfo, remotePubkey: Uint8Array): void => {
        watchtowerService.addChannel(channelId, channelInfo, remotePubkey)
        this.updateStateFromService()
        this.notify()
      },

      removeChannel: (channelId: string): void => {
        watchtowerService.removeChannel(channelId)
        this.updateStateFromService()
        this.notify()
      },

      refreshChannels: (): void => {
        this.updateStateFromService()
        this.notify()
      },

      checkChannel: (channelId: string, txHex: string): BreachResult => {
        const result = watchtowerService.checkChannel(channelId, txHex)
        if (result.breach) {
          this.updateStateFromService()
          this.notify()
        }
        return result
      },

      storeRevocationSecret: (
        channelId: string,
        commitmentNumber: bigint,
        revocationSecret: Uint8Array,
      ): void => {
        watchtowerService.storeRevocationSecret(channelId, commitmentNumber, revocationSecret)
        // No state update needed for this action
      },

      clearEvents: (): void => {
        watchtowerService.clearEvents()
        this.updateStateFromService()
        this.notify()
      },
    }
  }

  // ==========================================
  // CLEANUP
  // ==========================================

  destroy(): void {
    if (this.eventUnsubscribe) {
      this.eventUnsubscribe()
      this.eventUnsubscribe = null
    }
    this.subscribers.clear()
  }
}

// ==========================================
// SINGLETON INSTANCE
// ==========================================

export const watchtowerStore = new WatchtowerStore()

// ==========================================
// CLEANUP ON MODULE UNLOAD (development)
// ==========================================

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  // @ts-ignore
  window.__WATCHTOWER_STORE__ = watchtowerStore
}
