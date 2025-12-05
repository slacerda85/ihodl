/**
 * Tipos compartilhados para funcionalidades Lightning
 *
 * Centraliza todos os tipos usados pelo LightningProvider e hooks relacionados
 */

// ==========================================
// TIPOS BASE
// ==========================================

export type Millisatoshis = bigint
export type Satoshis = bigint

// ==========================================
// CONEXÃO (BOLT1)
// ==========================================

/** Estado de conexão com peer Lightning */
export interface ConnectionState {
  /** Indica se está conectado a um peer */
  isConnected: boolean
  /** ID do peer conectado */
  peerId?: string
  /** Features negociados com o peer */
  negotiatedFeatures: number[]
  /** Timestamp do último ping enviado */
  lastPing?: number
  /** Timestamp do último pong recebido */
  lastPong?: number
  /** Erro de conexão, se houver */
  error?: string
}

// ==========================================
// CANAIS (BOLT2)
// ==========================================

/** Estados possíveis de um canal */
export type ChannelStateType = 'opening' | 'open' | 'closing' | 'closed'

/** Representação de um canal para a UI */
export interface Channel {
  channelId: string
  peerId: string
  state: ChannelStateType
  localBalanceSat: Satoshis
  remoteBalanceSat: Satoshis
  capacitySat: Satoshis
  isActive: boolean
}

// ==========================================
// PAGAMENTOS
// ==========================================

/** Status de um pagamento */
export type PaymentStatus = 'pending' | 'succeeded' | 'failed'

/** Direção de um pagamento */
export type PaymentDirection = 'sent' | 'received'

/** Representação de um pagamento para a UI */
export interface Payment {
  paymentHash: string
  amount: Millisatoshis
  status: PaymentStatus
  direction: PaymentDirection
  createdAt: number
  resolvedAt?: number
  preimage?: string
  error?: string
}

// ==========================================
// INVOICES (BOLT11)
// ==========================================

/** Status de uma invoice */
export type InvoiceStatus = 'pending' | 'paid' | 'expired'

/** Representação de uma invoice para a UI */
export interface Invoice {
  paymentHash: string
  invoice: string
  amount: Millisatoshis
  description: string
  status: InvoiceStatus
  createdAt: number
  expiresAt: number
  requiresChannelOpening?: boolean
  channelOpeningFee?: Satoshis
}

/** Invoice decodificada */
export interface DecodedInvoice {
  amount: bigint
  description: string
  paymentHash: string
  isExpired: boolean
}

// ==========================================
// ESTADO DO PROVIDER
// ==========================================

/** Estado completo do Lightning Provider */
export interface LightningState {
  // Status de inicialização
  isInitialized: boolean
  isLoading: boolean
  error: string | null

  // Conexão
  connection: ConnectionState

  // Saldo total disponível (em millisatoshis)
  totalBalance: Millisatoshis

  // Canais
  channels: Channel[]
  hasActiveChannels: boolean

  // Histórico
  invoices: Invoice[]
  payments: Payment[]
}

/** Estado inicial padrão */
export const INITIAL_CONNECTION_STATE: ConnectionState = {
  isConnected: false,
  negotiatedFeatures: [],
}

export const INITIAL_LIGHTNING_STATE: LightningState = {
  isInitialized: false,
  isLoading: false,
  error: null,
  connection: INITIAL_CONNECTION_STATE,
  totalBalance: 0n,
  channels: [],
  hasActiveChannels: false,
  invoices: [],
  payments: [],
}
