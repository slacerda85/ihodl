/**
 * Tipos para Sistema de Transações Unificado
 *
 * Suporta múltiplos ativos: Bitcoin On-chain, Lightning, e futuros ativos RGB
 */

// ==========================================
// ASSET TYPES
// ==========================================

/**
 * Tipos de ativos suportados no histórico de transações
 * Extensível para futuros ativos RGB
 */
export type AssetType = 'btc-onchain' | 'lightning' | 'rgb'

/**
 * Metadados de um ativo para exibição
 */
export interface AssetInfo {
  type: AssetType
  label: string
  shortLabel: string
  color: string
  icon: string
}

/**
 * Configuração de ativos disponíveis
 */
export const ASSET_CONFIG: Record<AssetType, AssetInfo> = {
  'btc-onchain': {
    type: 'btc-onchain',
    label: 'Bitcoin On-chain',
    shortLabel: 'On-chain',
    color: '#F7931A',
    icon: 'bitcoinsign.circle.fill',
  },
  lightning: {
    type: 'lightning',
    label: 'Lightning Network',
    shortLabel: 'Lightning',
    color: '#9B59B6',
    icon: 'bolt.fill',
  },
  rgb: {
    type: 'rgb',
    label: 'RGB Assets',
    shortLabel: 'RGB',
    color: '#3498DB',
    icon: 'circle.hexagongrid.fill',
  },
}

// ==========================================
// UNIFIED TRANSACTION STATUS
// ==========================================

/**
 * Status unificado de transação
 * Normalizado para todos os tipos de ativos
 */
export type UnifiedTransactionStatus = 'pending' | 'confirmed' | 'failed' | 'expired'

/**
 * Direção da transação
 */
export type TransactionDirection = 'sent' | 'received' | 'self'

// ==========================================
// UNIFIED TRANSACTION MODEL
// ==========================================

/**
 * Modelo de transação unificado
 * Estrutura comum para todos os tipos de ativos
 */
export interface UnifiedTransaction {
  /** ID único da transação */
  id: string

  /** Tipo do ativo */
  assetType: AssetType

  /** Direção da transação */
  direction: TransactionDirection

  /** Valor em satoshis (para BTC/LN) ou unidade do ativo RGB */
  amount: number

  /** Status normalizado */
  status: UnifiedTransactionStatus

  /** Timestamp de criação (ms) */
  createdAt: number

  /** Timestamp de confirmação/resolução (ms) */
  confirmedAt?: number

  /** Descrição opcional */
  description?: string

  /** Endereço de destino/origem para exibição */
  displayAddress?: string

  /** ID original da transação no sistema nativo */
  nativeId: string

  /** Fee pago (em sats para BTC/LN) */
  fee?: number

  /** Flag para transações pendentes na mempool (ainda não confirmadas) */
  isMempool?: boolean

  /** Dados específicos do ativo */
  metadata?: TransactionMetadata
}

/**
 * Metadados específicos por tipo de ativo
 */
export type TransactionMetadata = OnchainMetadata | LightningMetadata | RgbMetadata

export interface OnchainMetadata {
  type: 'btc-onchain'
  txid: string
  confirmations: number
  blockHeight?: number
  vsize?: number
}

export interface LightningMetadata {
  type: 'lightning'
  paymentHash: string
  preimage?: string
  invoice?: string
  routeHops?: number
}

export interface RgbMetadata {
  type: 'rgb'
  assetId: string
  assetName: string
  assetTicker?: string
  contractId?: string
}

// ==========================================
// FILTER TYPES
// ==========================================

/**
 * Filtros disponíveis para a lista de transações
 */
export interface TransactionFilters {
  /** Ativos selecionados (vazio = todos) */
  assets: AssetType[]

  /** Status selecionados (vazio = todos) */
  statuses: UnifiedTransactionStatus[]

  /** Direção (null = todos) */
  direction: TransactionDirection | null

  /** Data inicial */
  dateFrom?: number

  /** Data final */
  dateTo?: number

  /** Texto de busca */
  searchQuery?: string
}

/**
 * Filtros padrão
 */
export const DEFAULT_FILTERS: TransactionFilters = {
  assets: [],
  statuses: [],
  direction: null,
}

// ==========================================
// GROUPED TRANSACTIONS
// ==========================================

/**
 * Transações agrupadas por data
 */
export interface TransactionGroup {
  date: string
  displayDate: string
  transactions: UnifiedTransaction[]
}

// ==========================================
// LIST ITEM TYPES
// ==========================================

/**
 * Item de lista com suporte a headers de data
 */
export type TransactionListItem =
  | { type: 'date-header'; date: string; displayDate: string }
  | { type: 'transaction'; transaction: UnifiedTransaction }
