import { createContext, ReactNode, useState, useContext } from 'react'
import LightningClient from '@/core/lib/lightning/client'

// Tipos baseados nos modelos Lightning
import { ChannelId, Point, Sha256 } from '@/core/models/lightning/base'
import { PaymentHash, PaymentPreimage } from '@/core/models/lightning/transaction'
import { OnionPacket, FailureMessage } from '@/core/models/lightning/routing'
import { GossipMessageUnion } from '@/core/models/lightning/p2p'

// Tipos locais
type Satoshis = bigint
type Millisatoshis = bigint

// Estados de canal
export enum ChannelState {
  PENDING_OPEN = 'pending_open',
  OPEN = 'open',
  CLOSING = 'closing',
  CLOSED = 'closed',
}

// Estado de um canal
export interface Channel {
  id: ChannelId
  state: ChannelState
  capacity: Satoshis
  localBalance: Millisatoshis
  remoteBalance: Millisatoshis
  remotePubkey: Point
  shortChannelId?: Uint8Array
  fundingTxid: Sha256
  fundingOutputIndex: number
  revocationSecrets: Map<bigint, Uint8Array> // commitmentNumber -> secret
  currentCommitmentNumber: bigint
  nextRevocationNumber: bigint
  htlcs: any[] // Placeholder
  dustLimit: Satoshis
  channelReserve: Satoshis
  feeratePerKw: number
  toSelfDelay: number
  maxAcceptedHtlcs: number
}

// Estado de um pagamento
export interface Payment {
  id: string
  amount: Millisatoshis
  paymentHash: PaymentHash
  preimage?: PaymentPreimage
  status: 'pending' | 'completed' | 'failed'
  route?: OnionPacket[]
  failure?: FailureMessage
  createdAt: number
  resolvedAt?: number
  success?: boolean
  error?: string
}

// Estado de uma invoice
export interface InvoiceState {
  invoice: string
  status: 'pending' | 'paid' | 'expired'
  payment?: Payment
  createdAt: number
  expiryAt: number
}

// Estado de conexão
export interface ConnectionState {
  isConnected: boolean
  peer?: string
  lastPing?: number
  pingPongActive: boolean
}

// Estado do routing graph (simplificado)
export interface RoutingInfo {
  channels: Map<
    string,
    {
      node1: Point
      node2: Point
      capacity: Satoshis
      feeBaseMsat: number
      feeProportionalMillionths: number
      cltvExpiryDelta: number
    }
  >
  nodes: Map<
    string,
    {
      pubkey: Point
      alias?: string
      addresses?: any[]
    }
  >
}

// Estado geral Lightning
export interface LightningState {
  // Canais
  channels: Channel[]

  // Pagamentos e invoices
  payments: Payment[]
  invoices: InvoiceState[]

  // Saldo total disponível
  totalBalance: Millisatoshis

  // Conexão
  connection: ConnectionState

  // Routing
  routingInfo: RoutingInfo

  // Chaves derivadas
  nodePubkey?: Point
  channelBasepoints?: {
    funding: Point
    revocation: Point
    payment: Point
    delayedPayment: Point
    htlc: Point
  }

  // Configurações
  feeConfig: {
    baseFeeMsat: number
    feeProportionalMillionths: number
  }

  // Pending operations
  pendingHtlcs: any[]
  pendingChannelOpens: any[]

  // Gossip messages recebidas
  gossipMessages: GossipMessageUnion[]
}

type LightningContextType = {
  state: LightningState
  client?: LightningClient

  // Ações disponíveis (baseado no que o cliente implementa)
  generateInvoice: (amount: Millisatoshis, description?: string) => Promise<string>
  getBalance: () => Promise<Millisatoshis>
  hasActiveChannels: () => Promise<boolean>
  sendPayment: (invoice: string) => Promise<Payment>

  // Placeholders para funcionalidades futuras
  connect: (peer: string) => Promise<void>
  disconnect: () => Promise<void>
  openChannel: (peer: string, amount: Satoshis) => Promise<ChannelId>
  closeChannel: (channelId: ChannelId, force?: boolean) => Promise<void>

  // Utilitários
  updateRoutingInfo: (messages: GossipMessageUnion[]) => void
  refreshBalance: () => Promise<void>
}

const LightningContext = createContext<LightningContextType | null>(null)

type LightningProviderProps = {
  children: ReactNode
}

const initialState: LightningState = {
  channels: [],
  payments: [],
  invoices: [],
  totalBalance: BigInt(0),
  connection: {
    isConnected: false,
    pingPongActive: false,
  },
  routingInfo: {
    channels: new Map(),
    nodes: new Map(),
  },
  feeConfig: {
    baseFeeMsat: 1000,
    feeProportionalMillionths: 100,
  },
  pendingHtlcs: [],
  pendingChannelOpens: [],
  gossipMessages: [],
}

export default function LightningProvider({ children }: LightningProviderProps) {
  const [state, setState] = useState<LightningState>(initialState)
  const [client] = useState<LightningClient | undefined>()

  const connect = async (peer: string) => {
    // Placeholder - implementar quando cliente suportar
    console.log('Connect not implemented yet')
    throw new Error('Connect not implemented')
  }

  const disconnect = async () => {
    if (!client) return

    await client.close()
    setState(prev => ({
      ...prev,
      connection: {
        ...prev.connection,
        isConnected: false,
        peer: undefined,
      },
    }))
  }

  const generateInvoice = async (amount: Millisatoshis, description?: string) => {
    if (!client) throw new Error('Cliente não inicializado')

    const invoiceResult = await client.generateInvoice({
      amount,
      description: description || '',
    })

    const invoiceState: InvoiceState = {
      invoice: invoiceResult.invoice,
      status: 'pending',
      createdAt: Date.now(),
      expiryAt: Date.now() + 3600000, // 1 hora padrão
    }

    setState(prev => ({
      ...prev,
      invoices: [...prev.invoices, invoiceState],
    }))

    return invoiceResult.invoice
  }

  const sendPayment = async (invoice: string) => {
    if (!client) throw new Error('Cliente não inicializado')

    const paymentResult = await client.sendPayment({ invoice })

    const payment: Payment = {
      id: `payment_${Date.now()}`,
      amount: BigInt(0), // TODO: extrair da invoice
      paymentHash: paymentResult.paymentHash,
      preimage: paymentResult.preimage,
      status: paymentResult.success ? 'completed' : 'failed',
      createdAt: Date.now(),
      resolvedAt: paymentResult.success ? Date.now() : undefined,
      success: paymentResult.success,
      error: paymentResult.error,
    }

    setState(prev => ({
      ...prev,
      payments: [...prev.payments, payment],
    }))

    return payment
  }

  const getBalance = async (): Promise<Millisatoshis> => {
    if (!client) return BigInt(0)
    return await client.getBalance()
  }

  const hasActiveChannels = async (): Promise<boolean> => {
    if (!client) return false
    return await client.hasActiveChannels()
  }

  const openChannel = async (peer: string, amount: Satoshis): Promise<ChannelId> => {
    // Placeholder
    console.log('Open channel not implemented yet')
    throw new Error('Open channel not implemented')
  }

  const closeChannel = async (channelId: ChannelId, force = false) => {
    // Placeholder
    console.log('Close channel not implemented yet')
    throw new Error('Close channel not implemented')
  }

  const updateRoutingInfo = (messages: GossipMessageUnion[]) => {
    setState(prev => ({
      ...prev,
      gossipMessages: [...prev.gossipMessages, ...messages],
      // TODO: Processar mensagens e atualizar routingInfo
    }))
  }

  const refreshBalance = async () => {
    if (!client) return

    const balance = await client.getBalance()
    setState(prev => ({
      ...prev,
      totalBalance: balance,
    }))
  }

  const contextValue: LightningContextType = {
    state,
    client,
    connect,
    disconnect,
    generateInvoice,
    sendPayment,
    getBalance,
    hasActiveChannels,
    openChannel,
    closeChannel,
    updateRoutingInfo,
    refreshBalance,
  }

  return <LightningContext.Provider value={contextValue}>{children}</LightningContext.Provider>
}

export function useLightning() {
  const context = useContext(LightningContext)
  if (!context) {
    throw new Error('useLightning must be used within a LightningProvider')
  }
  return context
}
