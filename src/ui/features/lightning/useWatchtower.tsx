/**
 * useWatchtower Hook
 *
 * Hook para gerenciar o Watchtower service no frontend.
 * Segue o padrão: lib -> services -> hooks/providers
 */

import {
  createContext,
  ReactNode,
  useState,
  useContext,
  useEffect,
  useCallback,
  useRef,
} from 'react'
import watchtowerService, {
  WatchtowerStatus,
  WatchtowerEventForUI,
  MonitoredChannel,
  WatchtowerServiceConfig,
} from '@/core/services/watchtower'
import { BreachResult, ChannelInfo } from '@/core/lib/lightning/watchtower'

// ==========================================
// TIPOS
// ==========================================

/**
 * Estado do Watchtower para a UI
 */
export interface WatchtowerState {
  isInitialized: boolean
  isRunning: boolean
  status: WatchtowerStatus
  channels: MonitoredChannel[]
  events: WatchtowerEventForUI[]
  hasBreaches: boolean
  lastBreachEvent?: WatchtowerEventForUI
}

/**
 * Contexto do Watchtower
 */
type WatchtowerContextType = {
  state: WatchtowerState

  // Lifecycle
  initialize: (config?: Partial<WatchtowerServiceConfig>) => Promise<void>
  start: () => void
  stop: () => void

  // Channel Management
  addChannel: (channelId: string, channelInfo: ChannelInfo, remotePubkey: Uint8Array) => void
  removeChannel: (channelId: string) => void
  refreshChannels: () => void

  // Breach Detection
  checkChannel: (channelId: string, txHex: string) => BreachResult
  storeRevocationSecret: (
    channelId: string,
    commitmentNumber: bigint,
    revocationSecret: Uint8Array,
  ) => void

  // Events
  clearEvents: () => void
}

// ==========================================
// CONTEXT
// ==========================================

const WatchtowerContext = createContext<WatchtowerContextType | null>(null)

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

const initialState: WatchtowerState = {
  isInitialized: false,
  isRunning: false,
  status: initialStatus,
  channels: [],
  events: [],
  hasBreaches: false,
  lastBreachEvent: undefined,
}

// ==========================================
// PROVIDER
// ==========================================

type WatchtowerProviderProps = {
  children: ReactNode
  autoStart?: boolean
}

export function WatchtowerProvider({ children, autoStart = true }: WatchtowerProviderProps) {
  const [state, setState] = useState<WatchtowerState>(initialState)

  // ==========================================
  // LIFECYCLE
  // ==========================================

  const initialize = useCallback(
    async (config?: Partial<WatchtowerServiceConfig>) => {
      if (state.isInitialized) return

      try {
        await watchtowerService.initialize({
          autoStart,
          ...config,
        })

        // Atualizar estado inicial
        const status = watchtowerService.getStatus()
        const channels = watchtowerService.getMonitoredChannels()
        const events = watchtowerService.getEvents()

        setState({
          isInitialized: true,
          isRunning: status.isRunning,
          status,
          channels,
          events,
          hasBreaches: status.breachesDetected > 0,
          lastBreachEvent: events.find(e => e.type === 'breach_detected'),
        })
      } catch (error) {
        console.error('[WatchtowerProvider] Initialization failed:', error)
      }
    },
    [state.isInitialized, autoStart],
  )

  const start = useCallback(() => {
    watchtowerService.start()
    setState(prev => ({
      ...prev,
      isRunning: true,
      status: { ...prev.status, isRunning: true },
    }))
  }, [])

  const stop = useCallback(() => {
    watchtowerService.stop()
    setState(prev => ({
      ...prev,
      isRunning: false,
      status: { ...prev.status, isRunning: false },
    }))
  }, [])

  // ==========================================
  // EVENT LISTENER
  // ==========================================

  useEffect(() => {
    if (!state.isInitialized) return

    const unsubscribe = watchtowerService.addEventListener(event => {
      setState(prev => {
        const newEvents = [event, ...prev.events].slice(0, 100) // Manter últimos 100 eventos
        const isBreachEvent = event.type === 'breach_detected'

        return {
          ...prev,
          events: newEvents,
          hasBreaches: isBreachEvent || prev.hasBreaches,
          lastBreachEvent: isBreachEvent ? event : prev.lastBreachEvent,
          status: watchtowerService.getStatus(),
          channels: watchtowerService.getMonitoredChannels(),
        }
      })
    })

    return () => {
      unsubscribe()
    }
  }, [state.isInitialized])

  // Auto-initialize on mount
  // Usando IIFE para evitar problemas com async/await no useEffect
  const initRef = useRef(false)
  useEffect(() => {
    if (!initRef.current && autoStart) {
      initRef.current = true
      // Chamada assíncrona não-bloqueante
      void (async () => {
        try {
          await watchtowerService.initialize({ autoStart })
          const status = watchtowerService.getStatus()
          const channels = watchtowerService.getMonitoredChannels()
          const events = watchtowerService.getEvents()

          setState({
            isInitialized: true,
            isRunning: status.isRunning,
            status,
            channels,
            events,
            hasBreaches: status.breachesDetected > 0,
            lastBreachEvent: events.find(e => e.type === 'breach_detected'),
          })
        } catch (error) {
          console.error('[WatchtowerProvider] Auto-init failed:', error)
        }
      })()
    }
  }, [autoStart])

  // ==========================================
  // CHANNEL MANAGEMENT
  // ==========================================

  const refreshChannels = useCallback(() => {
    const channels = watchtowerService.getMonitoredChannels()
    const status = watchtowerService.getStatus()
    setState(prev => ({
      ...prev,
      channels,
      status,
    }))
  }, [])

  const addChannel = useCallback(
    (channelId: string, channelInfo: ChannelInfo, remotePubkey: Uint8Array) => {
      watchtowerService.addChannel(channelId, channelInfo, remotePubkey)
      refreshChannels()
    },
    [refreshChannels],
  )

  const removeChannel = useCallback(
    (channelId: string) => {
      watchtowerService.removeChannel(channelId)
      refreshChannels()
    },
    [refreshChannels],
  )

  // ==========================================
  // BREACH DETECTION
  // ==========================================

  const checkChannel = useCallback(
    (channelId: string, txHex: string): BreachResult => {
      const result = watchtowerService.checkChannel(channelId, txHex)
      if (result.breach) {
        refreshChannels()
      }
      return result
    },
    [refreshChannels],
  )

  const storeRevocationSecret = useCallback(
    (channelId: string, commitmentNumber: bigint, revocationSecret: Uint8Array) => {
      watchtowerService.storeRevocationSecret(channelId, commitmentNumber, revocationSecret)
    },
    [],
  )

  // ==========================================
  // EVENTS
  // ==========================================

  const clearEvents = useCallback(() => {
    watchtowerService.clearEvents()
    setState(prev => ({
      ...prev,
      events: [],
    }))
  }, [])

  // ==========================================
  // CONTEXT VALUE
  // ==========================================

  const contextValue: WatchtowerContextType = {
    state,
    initialize,
    start,
    stop,
    addChannel,
    removeChannel,
    refreshChannels,
    checkChannel,
    storeRevocationSecret,
    clearEvents,
  }

  return <WatchtowerContext.Provider value={contextValue}>{children}</WatchtowerContext.Provider>
}

// ==========================================
// HOOK
// ==========================================

export function useWatchtower() {
  const context = useContext(WatchtowerContext)
  if (!context) {
    throw new Error('useWatchtower must be used within a WatchtowerProvider')
  }
  return context
}

// ==========================================
// STANDALONE HOOKS
// ==========================================

/**
 * Hook para verificar se há breaches detectados
 */
export function useHasBreaches(): boolean {
  const { state } = useWatchtower()
  return state.hasBreaches
}

/**
 * Hook para obter status do watchtower
 */
export function useWatchtowerStatus(): WatchtowerStatus {
  const { state } = useWatchtower()
  return state.status
}

/**
 * Hook para obter canais monitorados
 */
export function useMonitoredChannels(): MonitoredChannel[] {
  const { state } = useWatchtower()
  return state.channels
}

/**
 * Hook para obter eventos do watchtower
 */
export function useWatchtowerEvents(): WatchtowerEventForUI[] {
  const { state } = useWatchtower()
  return state.events
}

export default WatchtowerProvider
