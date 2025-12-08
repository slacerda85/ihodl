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
// POLÍTICAS DE LIQUIDEZ
// ==========================================

/** Política de liquidez para abertura automática de canais */
export type LiquidityPolicyType = 'auto' | 'disable'

/** Configuração de política de liquidez */
export interface LiquidityPolicy {
  /** Tipo da política */
  type: LiquidityPolicyType
  /** Taxa máxima absoluta em satoshis (apenas para 'auto') */
  maxAbsoluteFee?: Satoshis
  /** Taxa máxima relativa em basis points (apenas para 'auto') */
  maxRelativeFeeBasisPoints?: number
  /** Pular verificação de taxa absoluta (apenas para 'auto') */
  skipAbsoluteFeeCheck?: boolean
  /** Crédito máximo de taxa permitido */
  maxAllowedFeeCredit?: Millisatoshis
  /** Liquidez inbound alvo (opcional, para auto-gerenciamento) */
  inboundLiquidityTarget?: Satoshis
}

/** Política de swap-in automático */
export interface SwapInPolicy {
  /** Habilitado */
  enabled: boolean
  /** Taxa máxima absoluta para swap-in */
  maxAbsoluteFee: Satoshis
  /** Taxa máxima relativa para swap-in (basis points) */
  maxRelativeFeeBasisPoints: number
  /** Pular verificação de taxa absoluta */
  skipAbsoluteFeeCheck: boolean
}

/** Estado de liquidez inbound */
export interface InboundLiquidityState {
  /** Saldo on-chain pendente de conversão */
  pendingOnChainBalance: Satoshis
  /** Estimativa de taxa para conversão automática */
  estimatedFee?: Satoshis
  /** Indica se será convertido automaticamente */
  willAutoConvert: boolean
  /** Razão pela qual não será convertido (se aplicável) */
  noAutoConvertReason?: string
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

  // Liquidez
  liquidityPolicy: LiquidityPolicy
  swapInPolicy: SwapInPolicy
  inboundLiquidity: InboundLiquidityState
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
  liquidityPolicy: {
    type: 'disable',
    maxAbsoluteFee: 5000n,
    maxRelativeFeeBasisPoints: 5000, // 50%
    skipAbsoluteFeeCheck: false,
    maxAllowedFeeCredit: 0n,
  },
  swapInPolicy: {
    enabled: false,
    maxAbsoluteFee: 5000n,
    maxRelativeFeeBasisPoints: 5000, // 50%
    skipAbsoluteFeeCheck: false,
  },
  inboundLiquidity: {
    pendingOnChainBalance: 0n,
    willAutoConvert: false,
  },
}
