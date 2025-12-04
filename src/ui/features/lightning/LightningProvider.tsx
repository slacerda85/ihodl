import {
  createContext,
  ReactNode,
  useState,
  useContext,
  useEffect,
  useCallback,
  useMemo,
} from 'react'
import LightningService, {
  ChannelState as ServiceChannelState,
  InvoiceState as ServiceInvoiceState,
  PaymentState as ServicePaymentState,
  GenerateInvoiceResult,
  SendPaymentResult,
} from '@/core/services/lightning'
import WalletService from '@/core/services/wallet'

// ==========================================
// TIPOS PARA O FRONTEND
// ==========================================

type Millisatoshis = bigint
type Satoshis = bigint

// Estado de um canal simplificado para a UI
export interface Channel {
  channelId: string
  peerId: string
  state: 'opening' | 'open' | 'closing' | 'closed'
  localBalanceSat: bigint
  remoteBalanceSat: bigint
  capacitySat: bigint
  isActive: boolean
}

// Estado de um pagamento para a UI
export interface Payment {
  paymentHash: string
  amount: Millisatoshis
  status: 'pending' | 'succeeded' | 'failed'
  direction: 'sent' | 'received'
  createdAt: number
  resolvedAt?: number
  preimage?: string
  error?: string
}

// Estado de uma invoice para a UI
export interface Invoice {
  paymentHash: string
  invoice: string
  amount: Millisatoshis
  description: string
  status: 'pending' | 'paid' | 'expired'
  createdAt: number
  expiresAt: number
  requiresChannelOpening?: boolean
  channelOpeningFee?: bigint
}

// Estado geral Lightning para a UI
export interface LightningState {
  // Status de inicialização
  isInitialized: boolean
  isLoading: boolean
  error: string | null

  // Saldo total disponível (em millisatoshis)
  totalBalance: Millisatoshis

  // Canais
  channels: Channel[]
  hasActiveChannels: boolean

  // Histórico
  invoices: Invoice[]
  payments: Payment[]
}

// Contexto Lightning
type LightningContextType = {
  state: LightningState

  // Inicialização
  initialize: () => Promise<void>

  // Invoices - interface simples para o frontend
  generateInvoice: (amount: Millisatoshis, description?: string) => Promise<Invoice>
  decodeInvoice: (invoice: string) => Promise<{
    amount: bigint
    description: string
    paymentHash: string
    isExpired: boolean
  }>

  // Pagamentos
  sendPayment: (invoice: string, maxFee?: bigint) => Promise<Payment>

  // Saldo
  getBalance: () => Promise<Millisatoshis>
  refreshBalance: () => Promise<void>

  // Canais
  getChannels: () => Promise<Channel[]>
  hasChannels: () => Promise<boolean>

  // Histórico
  refreshInvoices: () => Promise<void>
  refreshPayments: () => Promise<void>
}

const LightningContext = createContext<LightningContextType | null>(null)

type LightningProviderProps = {
  children: ReactNode
}

const initialState: LightningState = {
  isInitialized: false,
  isLoading: false,
  error: null,
  totalBalance: 0n,
  channels: [],
  hasActiveChannels: false,
  invoices: [],
  payments: [],
}

export default function LightningProvider({ children }: LightningProviderProps) {
  const [state, setState] = useState<LightningState>(initialState)

  // Criar instância do serviço (singleton)
  const service = useMemo(() => new LightningService(), [])

  // ==========================================
  // INICIALIZAÇÃO
  // ==========================================

  const initialize = useCallback(async () => {
    if (state.isInitialized || state.isLoading) return

    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      const walletService = new WalletService()
      const walletId = walletService.getActiveWalletId()

      if (!walletId) {
        throw new Error('No active wallet found')
      }

      await service.initialize(walletId)

      // Carregar dados iniciais
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
        channels: channels,
        hasActiveChannels: channels.some(ch => ch.isActive),
        invoices: invoices.map(mapServiceInvoice),
        payments: payments.map(mapServicePayment),
      }))
    } catch (error) {
      console.error('[LightningProvider] Initialization failed:', error)
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to initialize Lightning',
      }))
    }
  }, [state.isInitialized, state.isLoading, service])

  // Auto-inicializar quando provider é montado
  useEffect(() => {
    initialize()
  }, [initialize])

  // ==========================================
  // INVOICES
  // ==========================================

  const generateInvoice = useCallback(
    async (amount: Millisatoshis, description?: string): Promise<Invoice> => {
      if (!service.isInitialized()) {
        throw new Error('Lightning not initialized')
      }

      const result = await service.generateInvoice({
        amount,
        description,
      })

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

      // Atualizar state com nova invoice
      setState(prev => ({
        ...prev,
        invoices: [invoice, ...prev.invoices],
      }))

      return invoice
    },
    [service],
  )

  const decodeInvoice = useCallback(
    async (invoice: string) => {
      if (!service.isInitialized()) {
        throw new Error('Lightning not initialized')
      }

      return await service.decodeInvoice(invoice)
    },
    [service],
  )

  // ==========================================
  // PAGAMENTOS
  // ==========================================

  const sendPayment = useCallback(
    async (invoice: string, maxFee?: bigint): Promise<Payment> => {
      if (!service.isInitialized()) {
        throw new Error('Lightning not initialized')
      }

      const result = await service.sendPayment({
        invoice,
        maxFee,
      })

      const payment: Payment = {
        paymentHash: result.paymentHash,
        amount: 0n, // TODO: obter da invoice decodificada
        status: result.success ? 'succeeded' : 'failed',
        direction: 'sent',
        createdAt: Date.now(),
        resolvedAt: result.success ? Date.now() : undefined,
        preimage: result.preimage,
        error: result.error,
      }

      // Atualizar state com novo pagamento
      setState(prev => ({
        ...prev,
        payments: [payment, ...prev.payments],
      }))

      // Atualizar saldo após pagamento
      if (result.success) {
        refreshBalance()
      }

      return payment
    },
    [service],
  )

  // ==========================================
  // SALDO
  // ==========================================

  const getBalance = useCallback(async (): Promise<Millisatoshis> => {
    if (!service.isInitialized()) {
      return 0n
    }

    return await service.getBalance()
  }, [service])

  const refreshBalance = useCallback(async () => {
    if (!service.isInitialized()) return

    try {
      const balance = await service.getBalance()
      setState(prev => ({ ...prev, totalBalance: balance }))
    } catch (error) {
      console.error('[LightningProvider] Failed to refresh balance:', error)
    }
  }, [service])

  // ==========================================
  // CANAIS
  // ==========================================

  const getChannels = useCallback(async (): Promise<Channel[]> => {
    if (!service.isInitialized()) {
      return []
    }

    const channels = await service.getChannels()
    setState(prev => ({
      ...prev,
      channels,
      hasActiveChannels: channels.some(ch => ch.isActive),
    }))

    return channels
  }, [service])

  const hasChannels = useCallback(async (): Promise<boolean> => {
    if (!service.isInitialized()) {
      return false
    }

    return await service.hasActiveChannels()
  }, [service])

  // ==========================================
  // HISTÓRICO
  // ==========================================

  const refreshInvoices = useCallback(async () => {
    if (!service.isInitialized()) return

    try {
      const invoices = await service.getInvoices()
      setState(prev => ({
        ...prev,
        invoices: invoices.map(mapServiceInvoice),
      }))
    } catch (error) {
      console.error('[LightningProvider] Failed to refresh invoices:', error)
    }
  }, [service])

  const refreshPayments = useCallback(async () => {
    if (!service.isInitialized()) return

    try {
      const payments = await service.getPayments()
      setState(prev => ({
        ...prev,
        payments: payments.map(mapServicePayment),
      }))
    } catch (error) {
      console.error('[LightningProvider] Failed to refresh payments:', error)
    }
  }, [service])

  // ==========================================
  // CONTEXTO
  // ==========================================

  const contextValue: LightningContextType = {
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
  }

  return <LightningContext.Provider value={contextValue}>{children}</LightningContext.Provider>
}

// ==========================================
// HOOK
// ==========================================

export function useLightning() {
  const context = useContext(LightningContext)
  if (!context) {
    throw new Error('useLightning must be used within a LightningProvider')
  }
  return context
}

// ==========================================
// HELPERS
// ==========================================

function mapServiceInvoice(inv: ServiceInvoiceState): Invoice {
  return {
    paymentHash: inv.paymentHash,
    invoice: inv.invoice,
    amount: inv.amount,
    description: inv.description,
    status: inv.status,
    createdAt: inv.createdAt,
    expiresAt: inv.expiresAt,
  }
}

function mapServicePayment(pay: ServicePaymentState): Payment {
  return {
    paymentHash: pay.paymentHash,
    amount: pay.amount,
    status: pay.status,
    direction: pay.direction,
    createdAt: pay.createdAt,
    resolvedAt: pay.resolvedAt,
  }
}
