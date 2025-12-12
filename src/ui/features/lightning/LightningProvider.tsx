/**
 * LightningProvider
 *
 * Provider principal para funcionalidades Lightning Network.
 * Otimizado para React 19 e React Compiler.
 *
 * Melhores práticas aplicadas:
 * - Separação de concerns (tipos, contexto, hooks em arquivos separados)
 * - Estado derivado com useMemo onde apropriado
 * - Callbacks estáveis com useCallback
 * - Não usar useEffect para setState síncrono (usar useLayoutEffect ou inicialização direta)
 * - Evitar dependências de estado em useEffect que causem loops
 */

import React, {
  ReactNode,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  useContext,
} from 'react'
import LightningService, {
  connectToPeer as connectToPeerService,
  disconnect as disconnectService,
  sendPing as sendPingService,
} from '@/core/services/ln-service'
import { walletService } from '@/core/services'
import { useLightningStartup } from './hooks/useLightningStartup'
import { getTrafficControl } from '@/core/services/ln-traffic-control-service'
import { useSettingsStore } from '@/ui/features/settings'

import { LightningContext, type LightningContextType } from './context'
import type { LightningState, Invoice, Payment, Channel, Millisatoshis } from './types'
import { INITIAL_LIGHTNING_STATE, INITIAL_CONNECTION_STATE } from './types'
import { mapServiceInvoices, mapServicePayments } from './utils'
import { getReadinessLevel } from '@/core/models/lightning/readiness'

// ==========================================
// CONSTANTS (React Compiler não suporta BigInt literals inline)
// ==========================================

const ZERO_BIGINT = BigInt(0)

// ==========================================
// HELPER FUNCTIONS (extraídas para evitar throw em try/catch)
// ==========================================

/** Valida se o serviço está inicializado, lança erro se não */
function assertServiceInitialized(service: LightningService): void {
  if (!service.isInitialized()) {
    throw new Error('Lightning not initialized')
  }
}

/** Valida se há wallet ativo, lança erro se não */
function assertWalletId(walletId: string | undefined): asserts walletId is string {
  if (!walletId) {
    throw new Error('No active wallet found')
  }
}

/** Valida se está conectado a um peer */
function assertConnected(isConnected: boolean): void {
  if (!isConnected) {
    throw new Error('Not connected to peer')
  }
}

// ==========================================
// TYPES
// ==========================================

interface LightningProviderProps {
  children: ReactNode
  /** Se true, inicializa automaticamente ao montar */
  autoInitialize?: boolean
}

// ==========================================
// PROVIDER
// ==========================================

export default function LightningProvider({
  children,
  autoInitialize = true,
}: LightningProviderProps) {
  // Estado principal
  const [state, setState] = useState<LightningState>(INITIAL_LIGHTNING_STATE)

  // Configurações
  const settingsStore = useSettingsStore()
  const trampolineEnabled = settingsStore.getTrampolineRoutingEnabled()

  // Hook para inicialização autônoma
  const { status: initStatus, start: startAutonomousInit } = useLightningStartup({
    autoStart: false, // Controlado manualmente
    config: {
      enableGossipSync: !trampolineEnabled, // Desabilitar gossip quando trampoline estiver ativo
      enablePeerConnectivity: true,
      enableHTLCMonitoring: true,
      enableWatchtower: true,
      enableLSPIntegration: true,
      graphCacheEnabled: !trampolineEnabled, // Desabilitar cache quando trampoline estiver ativo
      maxPeers: trampolineEnabled ? 1 : 5, // Apenas 1 peer (trampoline) quando em trampoline mode
      syncTimeout: 120,
      trampolineMode: trampolineEnabled, // Passar configuração de trampoline mode
    },
    onComplete: (success, error) => {
      if (!success) {
        console.error('[LightningProvider] Autonomous initialization failed:', error)
        setState(prev => ({
          ...prev,
          error: error || 'Autonomous initialization failed',
        }))
      } else {
        console.log('[LightningProvider] Autonomous initialization completed successfully')
      }
    },
  })

  // Ref para o serviço (singleton, não precisa re-criar)
  const serviceRef = useRef<LightningService | null>(null)

  // Getter para o serviço (lazy initialization)
  const getService = useCallback(() => {
    if (!serviceRef.current) {
      serviceRef.current = new LightningService()
    }
    return serviceRef.current
  }, [])

  // ==========================================
  // INICIALIZAÇÃO
  // ==========================================

  const initialize = useCallback(async () => {
    // Evitar múltiplas inicializações
    if (state.isInitialized || state.isLoading) return

    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      const walletId = walletService.getActiveWalletId()
      assertWalletId(walletId)

      const service = getService()
      await service.initialize(walletId)

      // Carregar dados iniciais em paralelo
      const [balance, channels, invoices, payments, readinessState] = await Promise.all([
        service.getBalance(),
        service.getChannels(),
        service.getInvoices(),
        service.getPayments(),
        service.getReadinessState(),
      ])

      setState(prev => ({
        ...prev,
        isInitialized: true,
        isLoading: false,
        readinessState,
        readinessLevel: getReadinessLevel(readinessState),
        totalBalance: balance,
        channels,
        hasActiveChannels: channels.some(ch => ch.isActive),
        invoices: mapServiceInvoices(invoices),
        payments: mapServicePayments(payments),
      }))
    } catch (err) {
      console.error('[LightningProvider] Initialization failed:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize Lightning'
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }))
    }
  }, [state.isInitialized, state.isLoading, getService])

  // Auto-inicialização controlada por prop
  // O initialize() é chamado apenas uma vez devido ao guard initializeRef
  // e aos guards internos (state.isInitialized, state.isLoading)
  const initializeRef = useRef(false)
  useEffect(() => {
    if (autoInitialize && !initializeRef.current) {
      initializeRef.current = true
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void initialize()
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void startAutonomousInit()
    }
  }, [autoInitialize, initialize, startAutonomousInit])

  // Integração com TrafficControl
  useEffect(() => {
    const trafficControl = getTrafficControl()

    // Monitora disponibilidade da carteira
    const checkWalletAvailability = () => {
      const walletId = walletService.getActiveWalletId()
      const isAvailable = !!walletId
      trafficControl.setWalletAvailability(isAvailable)
    }

    // Verificação inicial
    checkWalletAvailability()

    // Monitora mudanças na carteira ativa
    const unsubscribe = walletService.subscribe(() => {
      checkWalletAvailability()
    })

    return unsubscribe
  }, [])

  // ==========================================
  // INVOICES
  // ==========================================

  const generateInvoice = useCallback(
    async (amount: Millisatoshis, description?: string): Promise<Invoice> => {
      const service = getService()
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

      setState(prev => ({
        ...prev,
        invoices: [invoice, ...prev.invoices],
      }))

      return invoice
    },
    [getService],
  )

  const decodeInvoice = useCallback(
    async (invoice: string) => {
      const service = getService()
      assertServiceInitialized(service)
      return service.decodeInvoice(invoice)
    },
    [getService],
  )

  // ==========================================
  // PAGAMENTOS
  // ==========================================

  const sendPayment = useCallback(
    async (invoice: string, maxFee?: bigint): Promise<Payment> => {
      const service = getService()
      assertServiceInitialized(service)

      const result = await service.sendPayment({ invoice, maxFee })

      const payment: Payment = {
        paymentHash: result.paymentHash,
        amount: ZERO_BIGINT, // TODO: obter da invoice decodificada
        status: result.success ? 'succeeded' : 'failed',
        direction: 'sent',
        createdAt: Date.now(),
        resolvedAt: result.success ? Date.now() : undefined,
        preimage: result.preimage,
        error: result.error,
      }

      setState(prev => ({
        ...prev,
        payments: [payment, ...prev.payments],
      }))

      // Atualizar saldo em background se sucesso
      if (result.success) {
        service.getBalance().then(balance => {
          setState(prev => ({ ...prev, totalBalance: balance }))
        })
      }

      return payment
    },
    [getService],
  )

  // ==========================================
  // SALDO
  // ==========================================

  const getBalance = useCallback(async (): Promise<Millisatoshis> => {
    const service = getService()
    if (!service.isInitialized()) return ZERO_BIGINT
    return service.getBalance()
  }, [getService])

  const refreshBalance = useCallback(async () => {
    const service = getService()
    if (!service.isInitialized()) return

    try {
      const balance = await service.getBalance()
      setState(prev => ({ ...prev, totalBalance: balance }))
    } catch (error) {
      console.error('[LightningProvider] Failed to refresh balance:', error)
    }
  }, [getService])

  // ==========================================
  // CANAIS
  // ==========================================

  const getChannels = useCallback(async (): Promise<Channel[]> => {
    const service = getService()
    if (!service.isInitialized()) return []

    const channels = await service.getChannels()
    setState(prev => ({
      ...prev,
      channels,
      hasActiveChannels: channels.some(ch => ch.isActive),
    }))

    return channels
  }, [getService])

  const hasChannels = useCallback(async (): Promise<boolean> => {
    const service = getService()
    if (!service.isInitialized()) return false
    return service.hasActiveChannels()
  }, [getService])

  const createChannel = useCallback(
    async (params: {
      peerId: string
      capacitySat: bigint
      pushMsat?: bigint
      feeRatePerKw?: number
    }): Promise<Channel> => {
      const service = getService()
      assertServiceInitialized(service)

      setState(prev => ({ ...prev, isLoading: true, error: null }))

      try {
        // TODO: Integrar com service.openChannel quando disponível
        // Por enquanto, simula a criação do canal
        const newChannel: Channel = {
          channelId: `channel-${Date.now()}`,
          peerId: params.peerId,
          state: 'opening',
          localBalanceSat: params.capacitySat - (params.pushMsat ? params.pushMsat / 1000n : 0n),
          remoteBalanceSat: params.pushMsat ? params.pushMsat / 1000n : 0n,
          capacitySat: params.capacitySat,
          isActive: false,
        }

        setState(prev => ({
          ...prev,
          isLoading: false,
          channels: [...prev.channels, newChannel],
        }))

        return newChannel
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to create channel'
        setState(prev => ({ ...prev, isLoading: false, error: errorMessage }))
        throw error
      }
    },
    [getService],
  )

  const closeChannel = useCallback(
    async (channelId: string): Promise<void> => {
      const service = getService()
      assertServiceInitialized(service)

      setState(prev => ({ ...prev, isLoading: true, error: null }))

      try {
        // TODO: Integrar com service.closeChannel quando disponível
        // Atualizar estado do canal para 'closing'
        setState(prev => ({
          ...prev,
          isLoading: false,
          channels: prev.channels.map(ch =>
            ch.channelId === channelId ? { ...ch, state: 'closing' as const, isActive: false } : ch,
          ),
        }))
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to close channel'
        setState(prev => ({ ...prev, isLoading: false, error: errorMessage }))
        throw error
      }
    },
    [getService],
  )

  const forceCloseChannel = useCallback(
    async (channelId: string): Promise<void> => {
      const service = getService()
      assertServiceInitialized(service)

      setState(prev => ({ ...prev, isLoading: true, error: null }))

      try {
        // TODO: Integrar com service.forceCloseChannel quando disponível
        // Atualizar estado do canal para 'closing'
        setState(prev => ({
          ...prev,
          isLoading: false,
          channels: prev.channels.map(ch =>
            ch.channelId === channelId ? { ...ch, state: 'closing' as const, isActive: false } : ch,
          ),
        }))
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to force close channel'
        setState(prev => ({ ...prev, isLoading: false, error: errorMessage }))
        throw error
      }
    },
    [getService],
  )

  // ==========================================
  // HISTÓRICO
  // ==========================================

  const refreshInvoices = useCallback(async () => {
    const service = getService()
    if (!service.isInitialized()) return

    try {
      const invoices = await service.getInvoices()
      setState(prev => ({
        ...prev,
        invoices: mapServiceInvoices(invoices),
      }))
    } catch (error) {
      console.error('[LightningProvider] Failed to refresh invoices:', error)
    }
  }, [getService])

  const refreshPayments = useCallback(async () => {
    const service = getService()
    if (!service.isInitialized()) return

    try {
      const payments = await service.getPayments()
      setState(prev => ({
        ...prev,
        payments: mapServicePayments(payments),
      }))
    } catch (error) {
      console.error('[LightningProvider] Failed to refresh payments:', error)
    }
  }, [getService])

  // ==========================================
  // CONEXÃO (BOLT1)
  // ==========================================

  const connectToPeer = useCallback(async (peerId: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      await connectToPeerService(peerId)
      setState(prev => ({
        ...prev,
        isLoading: false,
        connection: {
          ...prev.connection,
          isConnected: true,
          peerId,
        },
      }))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect'
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
        connection: {
          ...prev.connection,
          error: errorMessage,
        },
      }))
    }
  }, [])

  const disconnect = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }))

    try {
      await disconnectService()
      setState(prev => ({
        ...prev,
        isLoading: false,
        connection: INITIAL_CONNECTION_STATE,
      }))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to disconnect'
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }))
    }
  }, [])

  const sendPing = useCallback(async () => {
    assertConnected(state.connection.isConnected)

    try {
      await sendPingService()
      setState(prev => ({
        ...prev,
        connection: {
          ...prev.connection,
          lastPing: Date.now(),
        },
      }))
    } catch (error) {
      console.error('[LightningProvider] Ping failed:', error)
    }
  }, [state.connection.isConnected])

  // ==========================================
  // CONTEXTO
  // ==========================================

  const contextValue = useMemo<LightningContextType>(
    () => ({
      state,
      initStatus,
      readinessState: state.readinessState,
      readinessLevel: state.readinessLevel,
      initialize,
      generateInvoice,
      decodeInvoice,
      sendPayment,
      getBalance,
      refreshBalance,
      getChannels,
      hasChannels,
      createChannel,
      closeChannel,
      forceCloseChannel,
      refreshInvoices,
      refreshPayments,
      connectToPeer,
      disconnect,
      sendPing,
    }),
    [
      state,
      initStatus,
      initialize,
      generateInvoice,
      decodeInvoice,
      sendPayment,
      getBalance,
      refreshBalance,
      getChannels,
      hasChannels,
      createChannel,
      closeChannel,
      forceCloseChannel,
      refreshInvoices,
      refreshPayments,
      connectToPeer,
      disconnect,
      sendPing,
    ],
  )

  return <LightningContext.Provider value={contextValue}>{children}</LightningContext.Provider>
}

// ==========================================
// HOOK useLightning
// ==========================================

/**
 * Hook para acessar o contexto Lightning
 * Alias conveniente para useLightningContext
 */
export function useLightning(): LightningContextType {
  const context = useContext(LightningContext)
  if (!context) {
    throw new Error('useLightning must be used within a LightningProvider')
  }
  return context
}

// Re-export types para conveniência
export type { LightningProviderProps }
export type { Invoice, Payment, Channel, Millisatoshis, DecodedInvoice } from './types'
