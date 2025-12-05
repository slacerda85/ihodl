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

import { ReactNode, useState, useCallback, useMemo, useRef, useEffect } from 'react'
import LightningService, {
  connectToPeer as connectToPeerService,
  disconnect as disconnectService,
  sendPing as sendPingService,
} from '@/core/services/lightning'
import WalletService from '@/core/services/wallet'

import { LightningContext, type LightningContextType } from './context'
import type { LightningState, Invoice, Payment, Channel, Millisatoshis } from './types'
import { INITIAL_LIGHTNING_STATE, INITIAL_CONNECTION_STATE } from './types'
import { mapServiceInvoices, mapServicePayments } from './utils'

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
      const walletService = new WalletService()
      const walletId = walletService.getActiveWalletId()
      assertWalletId(walletId)

      const service = getService()
      await service.initialize(walletId)

      // Carregar dados iniciais em paralelo
      const [balance, channels, invoices, payments] = await Promise.all([
        service.getBalance(),
        service.getChannels(),
        service.getInvoices(),
        service.getPayments(),
      ])

      setState(prev => ({
        ...prev,
        isInitialized: true,
        isLoading: false,
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
  const initializeRef = useRef(false)
  useEffect(() => {
    if (autoInitialize && !initializeRef.current) {
      initializeRef.current = true
      initialize()
    }
  }, [autoInitialize, initialize])

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
      initialize,
      generateInvoice,
      decodeInvoice,
      sendPayment,
      getBalance,
      refreshBalance,
      getChannels,
      hasChannels,
      refreshInvoices,
      refreshPayments,
      connectToPeer,
      disconnect,
      sendPing,
    }),
    [
      state,
      initialize,
      generateInvoice,
      decodeInvoice,
      sendPayment,
      getBalance,
      refreshBalance,
      getChannels,
      hasChannels,
      refreshInvoices,
      refreshPayments,
      connectToPeer,
      disconnect,
      sendPing,
    ],
  )

  return <LightningContext.Provider value={contextValue}>{children}</LightningContext.Provider>
}

// Re-export types para conveniência
export type { LightningProviderProps }
